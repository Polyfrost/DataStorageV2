#!/usr/bin/env bash
set -euo pipefail

seen_since() {
  grep -qF "$2" <(tail -c +"${3:-1}" "$1" 2>/dev/null)
}

wait_for() {
  local file="$1" needle="$2" timeout="$3" pid="$4" offset="${5:-1}" i=0
  while [ "$i" -lt "$timeout" ]; do
    seen_since "$file" "$needle" "$offset" && return 0
    kill -0 "$pid" 2>/dev/null || { seen_since "$file" "$needle" "$offset" && return 0; return 1; }
    sleep 1
    i=$((i + 1))
  done
  return 2
}

kill_client() {
  local i=0
  [ -n "${CLIENT_PID:-}" ] || return 0
  kill -- -"$CLIENT_PID" 2>/dev/null || kill "$CLIENT_PID" 2>/dev/null || true
  wait "$CLIENT_PID" 2>/dev/null || true
  while kill -0 -- -"$CLIENT_PID" 2>/dev/null && [ "$i" -lt 30 ]; do
    sleep 1
    i=$((i + 1))
  done
  kill -9 -- -"$CLIENT_PID" 2>/dev/null || true
  CLIENT_PID=""
}

[ -n "${MC_LIB_ONLY:-}" ] && return 0

MRPACK="${1:?usage: run-mc-locally.sh <path/to/pack.mrpack>}"
MRPACK="$(cd -- "$(dirname -- "$MRPACK")" && pwd)/$(basename -- "$MRPACK")"
PACK_ID="$(basename -- "$MRPACK" .mrpack)"

SHARED_DIR="${MC_SHARED_DIR:-$HOME/.mc-ci-shared}"
WORK_DIR="${MC_WORK_DIR:-${RUNNER_TEMP:-/tmp}/run-mc-locally/$PACK_ID}"
JOIN_TIMEOUT="${JOIN_TIMEOUT:-300}"
SOAK_SECONDS="${SOAK_SECONDS:-45}"
ATTEMPTS="${ATTEMPTS:-2}"
USERNAME="${MC_USERNAME:-CIBot}"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$SHARED_DIR"

SERVER_PID=""
CLIENT_PID=""

cleanup() {
  kill_client
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  [ -f "$WORK_DIR/client.log" ] && { echo "--- client.log (tail) ---"; tail -n 40 "$WORK_DIR/client.log"; }
  [ -f "$WORK_DIR/server.log" ] && { echo "--- server.log (tail) ---"; tail -n 20 "$WORK_DIR/server.log"; }
  echo "::error::[$PACK_ID] $*"
  exit 1
}

unzip -q "$MRPACK" -d "$WORK_DIR/.mrpack"
INDEX="$WORK_DIR/.mrpack/modrinth.index.json"
[ -f "$INDEX" ] || fail "no modrinth.index.json in $MRPACK"

read -r MC_VERSION LOADER_VERSION <<EOF
$(node -e '
  const d = require(process.argv[1]);
  const mc = d.dependencies["minecraft"];
  const loader = d.dependencies["fabric-loader"];
  if (!mc || !loader) { console.error("pack is not fabric: " + JSON.stringify(d.dependencies)); process.exit(1); }
  console.log(mc, loader);
' "$INDEX")
EOF

echo "== $PACK_ID :: Minecraft $MC_VERSION, fabric-loader $LOADER_VERSION"

node -e '
  const d = require(process.argv[1]);
  const out = [];
  for (const f of d.files) {
    if (f.env && f.env.client === "unsupported") continue;
    out.push(`url = "${f.downloads[0]}"`, `output = "${f.path}"`);
  }
  console.log(out.join("\n"));
' "$INDEX" > "$WORK_DIR/curl.conf"

echo "== downloading $(($(wc -l < "$WORK_DIR/curl.conf") / 2)) files"
( cd "$WORK_DIR" && curl -sSfL --create-dirs --parallel --parallel-max 8 -K curl.conf )

for dir in overrides client-overrides; do
  [ -d "$WORK_DIR/.mrpack/$dir" ] && cp -R "$WORK_DIR/.mrpack/$dir/." "$WORK_DIR/"
done

cat > "$WORK_DIR/options.txt" <<'EOF'
onboardAccessibility:false
pauseOnLostFocus:false
fullscreen:false
EOF

read -r SERVER_URL JAVA_MAJOR <<EOF
$(node --input-type=module -e '
  const mc = process.argv[1];
  const manifest = await (await fetch("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")).json();
  const entry = manifest.versions.find((v) => v.id === mc);
  if (!entry) { console.error("no such Minecraft version in the manifest: " + mc); process.exit(1); }
  const meta = await (await fetch(entry.url)).json();
  console.log(meta.downloads.server.url, meta.javaVersion.majorVersion);
' "$MC_VERSION")
EOF

JAVA_HOME_VAR="JAVA_HOME_${JAVA_MAJOR}_X64"
JAVA_BIN="${!JAVA_HOME_VAR:-}/bin/java"
[ -x "$JAVA_BIN" ] || JAVA_BIN="java"
echo "== server needs Java $JAVA_MAJOR, using $JAVA_BIN"

SERVER_JAR="$SHARED_DIR/server-$MC_VERSION.jar"
if [ ! -f "$SERVER_JAR" ]; then
  curl -sSfL -o "$SERVER_JAR.tmp" "$SERVER_URL" && mv "$SERVER_JAR.tmp" "$SERVER_JAR"
fi

SRV="$WORK_DIR/server"
mkdir -p "$SRV"
echo "eula=true" > "$SRV/eula.txt"
cat > "$SRV/server.properties" <<'EOF'
online-mode=false
level-type=minecraft:flat
spawn-protection=0
view-distance=6
simulation-distance=6
max-tick-time=-1
sync-chunk-writes=false
EOF

echo "== starting vanilla server"
( cd "$SRV" && "$JAVA_BIN" -Xmx2G -jar "$SERVER_JAR" nogui > "$WORK_DIR/server.log" 2>&1 ) &
SERVER_PID=$!

wait_for "$WORK_DIR/server.log" 'For help, type "help"' 300 "$SERVER_PID" || \
  fail "vanilla server never finished starting (see server.log)"

attempt() {
  local offset=$(( $(wc -c < "$WORK_DIR/server.log") + 1 ))
  REASON=""

  setsid xvfb-run -a -s "-screen 0 1280x720x24" \
    portablemc --main-dir "$SHARED_DIR" --work-dir "$WORK_DIR" \
    start "fabric:$MC_VERSION:$LOADER_VERSION" \
    -u "$USERNAME" -s 127.0.0.1 -p 25565 \
    --resolution 1280x720 --jvm-args=-Xmx4G \
    > "$WORK_DIR/client.log" 2>&1 &
  CLIENT_PID=$!

  case "$(wait_for "$WORK_DIR/server.log" "$USERNAME joined the game" "$JOIN_TIMEOUT" "$CLIENT_PID" "$offset"; echo $?)" in
    1) REASON="client exited before joining the world"; return 1 ;;
    2) REASON="client never joined the world within ${JOIN_TIMEOUT}s"; return 1 ;;
  esac

  echo "== joined, soaking for ${SOAK_SECONDS}s"
  sleep "$SOAK_SECONDS"

  kill -0 "$CLIENT_PID" 2>/dev/null || { REASON="client died while in-world"; return 1; }
  if seen_since "$WORK_DIR/server.log" "$USERNAME lost connection" "$offset"; then
    REASON="client dropped out of the world"
    return 1
  fi
  return 0
}

REASON=""
for i in $(seq 1 "$ATTEMPTS"); do
  echo "== starting client (attempt $i/$ATTEMPTS)"
  if attempt; then break; fi
  kill_client
  echo "== attempt $i failed: $REASON"
  [ "$i" -lt "$ATTEMPTS" ] || break
  mv "$WORK_DIR/client.log" "$WORK_DIR/client-attempt$i.log"
  [ -d "$WORK_DIR/crash-reports" ] && mv "$WORK_DIR/crash-reports" "$WORK_DIR/crash-reports-attempt$i" || true
done

[ -z "$REASON" ] || fail "$REASON (after $ATTEMPTS attempts)"

kill_client

if compgen -G "$WORK_DIR/crash-reports/*" > /dev/null; then
  fail "crash report(s) produced: $(ls "$WORK_DIR/crash-reports")"
fi

echo "== $PACK_ID OK"

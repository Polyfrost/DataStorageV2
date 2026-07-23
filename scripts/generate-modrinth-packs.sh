#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MRPACKS_DIR="$SCRIPT_DIR/../data/oneclient/bundles/.mrpacks"
OUTPUT_DIR="${1:-$SCRIPT_DIR/../data/oneclient/bundles/generated}"

SKYBLOCK_CATEGORY="skyblock"

IGNORED_VERSIONS=(
  "26.1-fabric"
)

for cmd in zip unzip; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: Required command '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
done

export PACKWIZ_SETUP_REPO="packwiz/packwiz"
export PACKWIZ_SETUP_NIGHTLY_URL="https://nightly.link/packwiz/packwiz/workflows/go/main/Linux%2064-bit%20x86.zip"
export PACKWIZ_SETUP_BIN_NAME="packwiz-upstream"
export PACKWIZ_SETUP_SKIP_PATH=1
export PACKWIZ_SETUP_SKIP_API=1

source "$SCRIPT_DIR/setup-packwiz.sh"

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"

mod_enabled() {
  ! grep -Eq '^[[:space:]]*enabled[[:space:]]*=[[:space:]]*false[[:space:]]*$' "$1"
}

pack_version_field() {
  local pack="$1" key="$2"
  awk -v key="$key" '
    /^\[versions\]/ { inver = 1; next }
    /^\[/           { inver = 0 }
    inver && $1 == key {
      # value is the last quoted token on the line
      match($0, /"[^"]*"/)
      print substr($0, RSTART + 1, RLENGTH - 2)
      exit
    }
  ' "$pack"
}

build_pack() {
  local name="$1" output="$2"
  shift 2
  local -a categories=("$@")

  local work mc fabric first_pack
  first_pack="${categories[0]}/pack.toml"
  mc="$(pack_version_field "$first_pack" minecraft)"
  fabric="$(pack_version_field "$first_pack" fabric)"

  if [ -z "$mc" ] || [ -z "$fabric" ]; then
    echo "Error: could not read minecraft/fabric version from $first_pack" >&2
    return 1
  fi

  work="$(mktemp -d)"

  printf 'hash-format = "sha256"\n' >"$work/index.toml"

  cat >"$work/pack.toml" <<EOF
name = "$name"
author = "Polyfrost"
version = "1.0.0"
pack-format = "packwiz:1.1.0"

[index]
file = "index.toml"
hash-format = "sha256"

[versions]
minecraft = "$mc"
fabric = "$fabric"
EOF

  local category file rel
  for category in "${categories[@]}"; do
    while IFS= read -r -d '' file; do
      rel="${file#"$category"/}"
      case "$rel" in
        pack.toml | index.toml) continue ;;
      esac
      [ -e "$work/$rel" ] && continue
      case "$rel" in
        *.pw.toml) mod_enabled "$file" || continue ;;
      esac
      mkdir -p "$work/$(dirname "$rel")"
      cp "$file" "$work/$rel"
    done < <(find "$category" -type f -print0)
  done

  echo "Bundling $name ($mc) -> $output"
  ( cd "$work" && "$PACKWIZ_BIN" refresh >/dev/null && "$PACKWIZ_BIN" modrinth export --output "$output" )

  echo "Normalising $(basename "$output")"
  local rezip
  rezip="$(mktemp -d)"
  unzip -q "$output" -d "$rezip"
  rm "$output"
  find "$rezip" -exec touch -h -d '@0' {} +
  ( cd "$rezip" && LC_ALL=C find . -print | sort | zip -X -q -@ "$output" )
  rm -rf "$rezip" "$work"
}

for version in "$MRPACKS_DIR"/*; do
  [ -d "$version" ] || continue
  parsed="$(basename "$version")"

  skip=""
  for ignored in "${IGNORED_VERSIONS[@]}"; do
    if [ "${parsed,,}" = "${ignored,,}" ]; then
      skip=1
      break
    fi
  done
  if [ -n "$skip" ]; then
    echo "Skipping ignored version $parsed"
    continue
  fi

  local_base=()
  skyblock_dir=""
  for category in "$version"/*; do
    [ -d "$category" ] || continue
    name="$(basename "$category")"
    if [ "${name,,}" = "$SKYBLOCK_CATEGORY" ]; then
      skyblock_dir="$category"
    else
      local_base+=("$category")
    fi
  done

  if [ "${#local_base[@]}" -eq 0 ]; then
    echo "Warning: no non-SkyBlock categories for $parsed, skipping" >&2
    continue
  fi

  build_pack "OneClient" "$OUTPUT_DIR/oneclient-$parsed.mrpack" "${local_base[@]}"

  if [ -n "$skyblock_dir" ]; then
    build_pack "OneClient (SkyBlock)" \
      "$OUTPUT_DIR/oneclient-skyblock-$parsed.mrpack" \
      "${local_base[@]}" "$skyblock_dir"
  fi
done

echo "Done. Modrinth modpacks written to $OUTPUT_DIR"

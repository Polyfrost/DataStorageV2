#!/usr/bin/env bash
# Compatibility gate for freshly-updated bundle sources (run after update-bundles.sh).
#
# Failures are compared against a baseline check of HEAD: anything already failing
# there is pre-existing and only reported. A failure the update introduced reverts the
# updated .pw.toml files involved in it (or, if none can be attributed, every updated
# file of that MC version) and the check is re-run, since a revert can expose a new
# gap. Unrelated mods and versions are left updated.
#
# Exit 0 when the surviving changes pass (reverts and pre-existing failures are
# surfaced as ::error:: annotations and `degraded=true` in $GITHUB_OUTPUT). Exit 1
# when the checker produces no report, or the changes cannot be made to pass.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=setup-packwiz.sh
source scripts/setup-packwiz.sh

MRPACKS="data/oneclient/bundles/.mrpacks"
MAX_ROUNDS="${GATE_MAX_ROUNDS:-5}"
tmp="$(mktemp -d)"
trap 'git worktree remove --force "$tmp/head" 2>/dev/null || true; rm -rf "$tmp"' EXIT
report="$tmp/report.json"
baseline="$tmp/baseline.json"
reverted=()

# Runs the checker in checkout $1, writing $2. Fails closed if no fresh, valid report
# was produced (checker crash, malformed TOML, ...).
check() {
  local status=0
  rm -f "$2"
  node "$1/scripts/compat-check.js" --json "$2" || status=$?
  jq -e 'type == "array"' "$2" >/dev/null 2>&1 || {
    echo "::error::Compatibility checker produced no report (exit $status)" >&2
    exit 1
  }
  return "$status"
}
# A failure is keyed once per involved file, so one that gains a file (e.g. a second
# bundle updating to an already-broken jar) is new, while one that merely loses a
# file (an update fixing one of two references) stays pre-existing.
jq_defs='def fkeys: . as $f | (.files | if length == 0 then [""] else . end)[] | [$f.version, $f.category, $f.msg, .] | join("|");'
fail_keys() { jq -r "$jq_defs"' .[] | select(.level == "FAIL") | fkeys' "$1" | sort -u; }

echo "Running baseline compatibility check on HEAD"
git worktree add -q --detach "$tmp/head" HEAD
ln -s "$PWD/node_modules" "$tmp/head/node_modules"
mkdir -p scripts/.cache && ln -s "$PWD/scripts/.cache" "$tmp/head/scripts/.cache"
check "$tmp/head" "$baseline" || true
git worktree remove --force "$tmp/head"

for (( round = 0; ; round++ )); do
  if check . "$report"; then break; fi
  new_fails="$(comm -23 <(fail_keys "$report") <(fail_keys "$baseline"))"
  [ -n "$new_fails" ] || break
  if (( round >= MAX_ROUNDS )); then
    echo "::error::Compatibility check still failing after $MAX_ROUNDS revert rounds; not committing" >&2
    exit 1
  fi
  changed="$(git diff --name-only -- "$MRPACKS" | jq -R . | jq -s .)"
  mapfile -t to_revert < <(jq -r --argjson changed "$changed" --argjson base "$(fail_keys "$baseline" | jq -R . | jq -s .)" "$jq_defs"'
    .[] | select(.level == "FAIL")
    | select(any(fkeys; IN($base[]) | not))
    | .versionDirs as $vds
    | (.files - (.files - $changed)) as $hit
    | if ($hit | length) > 0 then $hit[]
      else $changed[] | select(. as $c | $vds | any(. as $v | $c | startswith("'"$MRPACKS"'/" + $v + "/"))) end
  ' "$report" | sort -u)
  if (( ${#to_revert[@]} == 0 )); then
    echo "::error::New compatibility failures cannot be attributed to any updated file; not committing" >&2
    printf '%s\n' "$new_fails" >&2
    exit 1
  fi
  echo "Round $((round + 1)): reverting ${#to_revert[@]} updated file(s) involved in new failures"
  git checkout -- "${to_revert[@]}"
  reverted+=("${to_revert[@]}")
  # index.toml/pack.toml carry hashes of the mod files, so re-sync them.
  for bundle in $(printf '%s\n' "${to_revert[@]}" | sed -E "s#^($MRPACKS/[^/]+/[^/]+)/.*#\\1#" | sort -u); do
    ( cd "$bundle" && "$PACKWIZ_BIN" refresh )
  done
done

degraded=false
if (( ${#reverted[@]} > 0 )); then
  degraded=true
  for f in $(printf '%s\n' "${reverted[@]}" | sort -u); do
    echo "::error file=$f::Update reverted: the new version fails the compatibility check"
  done
fi
while IFS= read -r line; do
  [ -n "$line" ] || continue
  degraded=true
  echo "::error::Pre-existing failure (not caused by this update): $line"
done < <(jq -r '.[] | select(.level == "FAIL") | "\(.version) [\(.category)] \(.msg)"' "$report")

[ -n "${GITHUB_OUTPUT:-}" ] && echo "degraded=$degraded" >> "$GITHUB_OUTPUT"
exit 0

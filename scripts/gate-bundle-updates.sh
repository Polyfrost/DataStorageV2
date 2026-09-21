#!/usr/bin/env bash
# Compatibility gate for freshly-updated bundle sources (run after update-bundles.sh).
# Instead of failing outright, reverts only the updated .pw.toml files involved in
# each FAIL back to HEAD and re-checks, since a revert can expose a new gap. Failures
# that involve no updated file were already broken in HEAD; they are reported but do
# not hold back the other updates.
#
# Exit 0 when the surviving changes pass (even if some were reverted or pre-existing
# failures remain — those are surfaced as ::error:: annotations and `degraded=true`
# in $GITHUB_OUTPUT), exit 1 only if the check cannot converge.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=setup-packwiz.sh
source scripts/setup-packwiz.sh

MRPACKS="data/oneclient/bundles/.mrpacks"
MAX_ROUNDS="${GATE_MAX_ROUNDS:-5}"
report="$(mktemp)"
reverted=()

fails_involving_changes() {
  comm -12 \
    <(jq -r '.[] | select(.level == "FAIL") | .files[]' "$report" | sort -u) \
    <(git diff --name-only -- "$MRPACKS" | sort -u)
}

for (( round = 1; round <= MAX_ROUNDS; round++ )); do
  if node scripts/compat-check.js --json "$report"; then break; fi
  mapfile -t to_revert < <(fails_involving_changes)
  (( ${#to_revert[@]} > 0 )) || break
  echo "Round $round: reverting ${#to_revert[@]} updated file(s) involved in failures"
  git checkout -- "${to_revert[@]}"
  reverted+=("${to_revert[@]}")
  # index.toml/pack.toml carry hashes of the mod files, so re-sync them.
  for bundle in $(printf '%s\n' "${to_revert[@]}" | xargs -n1 dirname | xargs -n1 dirname | sort -u); do
    ( cd "$bundle" && "$PACKWIZ_BIN" refresh )
  done
done

if [ -n "$(fails_involving_changes)" ]; then
  echo "::error::Compatibility check still failing after $MAX_ROUNDS revert rounds; not committing" >&2
  exit 1
fi

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

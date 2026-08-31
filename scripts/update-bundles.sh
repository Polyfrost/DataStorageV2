#!/usr/bin/env bash
# Runs `packwiz update` on every pack under bundles/.mrpacks/<version>/<Bundle>,
# bumping mods to their latest stable versions (updates the source .pw.toml files).
# Mods in BETA_MODS get a second pass without --stable so they track pre-releases.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MRPACKS_DIR="$SCRIPT_DIR/../data/oneclient/bundles/.mrpacks"

# shellcheck source=setup-packwiz.sh
source "$SCRIPT_DIR/setup-packwiz.sh"

MAX_ATTEMPTS="${PACKWIZ_UPDATE_MAX_ATTEMPTS:-6}"
INTER_BUNDLE_SLEEP="${PACKWIZ_UPDATE_SLEEP:-3}"

# Mods that should track pre-release (beta/alpha) versions instead of stable.
# Names match the mod's .pw.toml basename under each bundle's mods/ dir.
# Expand this list to opt more mods into pre-release updates.
BETA_MODS=(
  c2me-fabric
  catharsis
  gnetum
  rrls
  skyblock-item-list
  skyhanni
  vmp-fabric
  walksylib
)

update_bundle() {
  local bundle="$1"
  local attempt=1 out wait beta_out mod transient
  while (( attempt <= MAX_ATTEMPTS )); do
    # Stable pass: bump every mod to its latest stable version.
    out="$( ( cd "$bundle" && "$PACKWIZ_BIN" update -a -y --stable ) 2>&1 )" || true
    printf '%s\n' "$out"
    # Beta pass: re-update opted-in mods without --stable so packwiz accepts the
    # newest version regardless of release channel (beta/alpha).
    for mod in "${BETA_MODS[@]}"; do
      [ -f "$bundle/mods/$mod.pw.toml" ] || continue
      beta_out="$( ( cd "$bundle" && "$PACKWIZ_BIN" update "$mod" -y ) 2>&1 )" || true
      printf '%s\n' "$beta_out"
      out+=$'\n'"$beta_out"
    done
    transient="$( grep 'Failed to check updates for' <<<"$out" | grep -v 'no stable versions found' || true )"
    if [ -z "$transient" ]; then
      return 0
    fi
    wait=$(( 20 * 2 ** (attempt - 1) ))
    (( wait > 300 )) && wait=300
    echo "::warning::Update check failed for some mods in $bundle; retry ${attempt}/${MAX_ATTEMPTS} after ${wait}s" >&2
    sleep "$wait"
    (( attempt++ ))
  done
  echo "::error::Update checks still failing for $bundle after ${MAX_ATTEMPTS} attempts; aborting to avoid an inconsistent partial update" >&2
  return 1
}

for version in "$MRPACKS_DIR"/*; do
  [ -d "$version" ] || continue
  for bundle in "$version"/*; do
    [ -d "$bundle" ] || continue
    echo "Updating $bundle"
    update_bundle "$bundle"
    sleep "$INTER_BUNDLE_SLEEP"
  done
done

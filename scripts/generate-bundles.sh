#!/usr/bin/env bash
# Exports every packwiz pack under bundles/.mrpacks/<version>/<Bundle> to a
# deterministic .mrpack in the output directory.
#
# Usage: generate-bundles.sh [OUTPUT_DIR]
#   OUTPUT_DIR defaults to ../bundles/generated (relative to this script).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Overridable so callers can export from a scratch copy: `packwiz export` also
# refreshes index.toml/pack.toml in place, which would dirty the repo.
MRPACKS_DIR="${MRPACKS_DIR:-$SCRIPT_DIR/../data/oneclient/bundles/.mrpacks}"
OUTPUT_DIR="${1:-$SCRIPT_DIR/../data/oneclient/bundles/generated}"

for cmd in zip unzip; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: Required command '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
done

# shellcheck source=setup-packwiz.sh
source "$SCRIPT_DIR/setup-packwiz.sh"

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"

for version in "$MRPACKS_DIR"/*; do
  [ -d "$version" ] || continue
  parsed="$(basename "$version")"
  for bundle in "$version"/*; do
    [ -d "$bundle" ] || continue
    name="$(basename "$bundle")"
    name="${name,,}"
    output="$OUTPUT_DIR/$name-$parsed.mrpack"

    echo "Bundling $bundle -> $output"
    ( cd "$bundle" && "$PACKWIZ_BIN" modrinth export --output "$output" )

    # Rezip deterministically: reset every timestamp to the unix epoch and sort
    # the entries so the resulting archive is byte-for-byte reproducible.
    echo "Normalising $(basename "$output")"
    work="$(mktemp -d)"
    unzip -q "$output" -d "$work"
    rm "$output"
    # -t (not -d '@0'): BSD touch has no @epoch form. TZ pins it to the epoch.
    TZ=UTC0 find "$work" -exec touch -h -t 197001010000 {} +
    ( cd "$work" && LC_ALL=C find . -print | sort | zip -X -q -@ "$output" )
    rm -rf "$work"
  done
done

echo "Done. Bundles written to $OUTPUT_DIR"

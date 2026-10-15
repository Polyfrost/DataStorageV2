#!/usr/bin/env bash
# Assembles the site into OUTPUT_DIR from the data/ folder only,
# excluding any file or folder whose name begins with a dot (e.g. .mrpacks).
# Generated bundles must already exist under data/ before this runs. Finally the
# JSON templates in the built site are resolved (see scripts/template.js).
#
# Usage: build-site.sh [OUTPUT_DIR]
#   OUTPUT_DIR defaults to <repo>/_site
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$REPO_ROOT/data"
OUTPUT_DIR="${1:-$REPO_ROOT/_site}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync is required." >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy the data folder contents, dropping every dotfile/dotfolder at any depth.
rsync -a --exclude='.*' "$DATA_DIR"/ "$OUTPUT_DIR"/

# Resolve ${...} templates in the built JSON files.
node "$SCRIPT_DIR/template.js" "$OUTPUT_DIR"

echo "Site built at $OUTPUT_DIR"

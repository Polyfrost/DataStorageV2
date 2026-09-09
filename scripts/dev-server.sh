#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PORT="${1:-8080}"

node "$SCRIPT_DIR/check.js"

# Export from a scratch copy: packwiz rewrites index.toml/pack.toml as it goes.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -R "$REPO_ROOT/data/oneclient/bundles/.mrpacks" "$WORK/.mrpacks"
MRPACKS_DIR="$WORK/.mrpacks" "$SCRIPT_DIR/generate-bundles.sh"
node "$SCRIPT_DIR/generate-mods-json.js"
"$SCRIPT_DIR/build-site.sh"

echo
exec node "$SCRIPT_DIR/serve.js" "$REPO_ROOT/_site" "$PORT"

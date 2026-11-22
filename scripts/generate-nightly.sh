#!/usr/bin/env bash
# Builds the nightly channel into data/oneclient/bundles/nightly/ from a scratch
# copy of the sources, with every mod on its newest version of any release type.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BUNDLES_DIR="$SCRIPT_DIR/../data/oneclient/bundles"
NIGHTLY_DIR="$BUNDLES_DIR/nightly"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -R "$BUNDLES_DIR/.mrpacks" "$WORK/.mrpacks"

CHANNEL=nightly MRPACKS_DIR="$WORK/.mrpacks" "$SCRIPT_DIR/update-bundles.sh"

rm -rf "$NIGHTLY_DIR"
MRPACKS_DIR="$WORK/.mrpacks" "$SCRIPT_DIR/generate-bundles.sh" "$NIGHTLY_DIR"
sed 's#/oneclient/bundles/stable/#/oneclient/bundles/nightly/#g' \
  "$BUNDLES_DIR/metadata.json" >"$NIGHTLY_DIR/metadata.json"

echo "Done. Nightly channel written to $NIGHTLY_DIR"

#!/usr/bin/env bash
# Ensures `packwiz` is available and exports $PACKWIZ_BIN pointing at it.
#
# Intended to be *sourced* by the other bundle scripts:
#   source "path/to/setup-packwiz.sh"
#
# Resolution order:
#   1. `packwiz` already on PATH
#   2. A previously downloaded copy cached next to this script
#   3. Download the Polyfrost packwiz fork (Linux x86-64 only) from the fork's
#      "Go" workflow build artifact via the GitHub API. The artifact *listing*
#      is public, but the zip download is auth-gated, so a token is required:
#        PACKWIZ_TOKEN  (preferred: PAT with actions:read on Polyfrost/packwiz)
#        GH_TOKEN / GITHUB_TOKEN  (fallback; the default Actions token is scoped
#        to this repo and CANNOT read the fork's artifacts, so it will 401)
set -euo pipefail

_PACKWIZ_SETUP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

_PACKWIZ_REPO="Polyfrost/packwiz"
_PACKWIZ_WORKFLOW="go.yml"
_PACKWIZ_BRANCH="main"
_PACKWIZ_ARTIFACT="Linux 64-bit x86"
_PACKWIZ_NIGHTLY_URL="https://nightly.link/Polyfrost/packwiz/workflows/go/main/Linux%2064-bit%20x86.zip"

_pw_curl() {
  curl -fsSL \
    --connect-timeout 15 \
    --max-time 120 \
    --retry 3 \
    --retry-delay 2 \
    --retry-connrefused \
    "$@"
}

_pw_token() {
  echo "${PACKWIZ_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
}

_pw_resolve_api() {
  command -v jq >/dev/null 2>&1 || { echo "jq not available" >&2; return 1; }
  local api="https://api.github.com/repos/$_PACKWIZ_REPO"

  local run_id
  run_id="$(_pw_curl \
    "$api/actions/workflows/$_PACKWIZ_WORKFLOW/runs?status=success&branch=$_PACKWIZ_BRANCH&per_page=1" \
    | jq -r '.workflow_runs[0].id // empty')"
  [[ -n "$run_id" ]] || { echo "no successful $_PACKWIZ_WORKFLOW run found" >&2; return 1; }

  local artifact_url
  artifact_url="$(_pw_curl "$api/actions/runs/$run_id/artifacts" \
    | jq -r --arg name "$_PACKWIZ_ARTIFACT" \
        '.artifacts[] | select(.name == $name and .expired == false) | .archive_download_url' \
    | head -n1)"
  [[ -n "$artifact_url" ]] || { echo "artifact '$_PACKWIZ_ARTIFACT' not found/expired for run $run_id" >&2; return 1; }

  printf '%s\n' "$artifact_url"
}

_pw_install_zip() {
  local zip="$1"
  unzip -o -q "$zip" -d "$_PACKWIZ_SETUP_DIR"
  rm -f "$zip"
  chmod +x "$_PACKWIZ_SETUP_DIR/packwiz"
}

_pw_download_linux() {
  local zip="$_PACKWIZ_SETUP_DIR/packwiz-linux.zip"
  local token url
  token="$(_pw_token)"

  if [[ -n "$token" ]] && url="$(_pw_resolve_api)"; then
    echo "Downloading packwiz via GitHub API artifact ($_PACKWIZ_ARTIFACT)"
    if _pw_curl -H "Authorization: Bearer $token" \
                -H "Accept: application/vnd.github+json" \
                -o "$zip" "$url"; then
      _pw_install_zip "$zip"
      return 0
    fi
    echo "GitHub API download failed; falling back to nightly.link" >&2
  else
    echo "No usable token or unresolved artifact; falling back to nightly.link" >&2
  fi

  echo "Downloading packwiz via nightly.link"
  _pw_curl -o "$zip" "$_PACKWIZ_NIGHTLY_URL"
  _pw_install_zip "$zip"
}

if command -v packwiz >/dev/null 2>&1; then
  PACKWIZ_BIN="$(command -v packwiz)"
  echo "Using packwiz from PATH: $PACKWIZ_BIN"
elif [[ -x "$_PACKWIZ_SETUP_DIR/packwiz" ]]; then
  PACKWIZ_BIN="$_PACKWIZ_SETUP_DIR/packwiz"
  echo "Using cached packwiz: $PACKWIZ_BIN"
elif [[ "$(uname -s)" == "Linux" ]]; then
  if ! command -v unzip >/dev/null 2>&1; then
    echo "Error: unzip is required to set up packwiz." >&2
    return 1
  fi
  echo "packwiz not found, downloading Polyfrost fork (Linux x86-64)"
  _pw_download_linux
  PACKWIZ_BIN="$_PACKWIZ_SETUP_DIR/packwiz"
else
  echo "Error: packwiz not found on $(uname -s). Install packwiz and rerun." >&2
  return 1
fi

export PACKWIZ_BIN

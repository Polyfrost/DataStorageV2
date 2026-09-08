#!/usr/bin/env bash
# Ensures a `packwiz` binary is available and exports $PACKWIZ_BIN pointing at it.
#
# Intended to be *sourced* by the other bundle scripts:
#   source "path/to/setup-packwiz.sh"
#
# Resolution order:
#   1. `packwiz` already on PATH            (unless PACKWIZ_SETUP_SKIP_PATH=1)
#   2. A previously downloaded copy cached next to this script
#   3. If PACKWIZ_SETUP_GO_MODULE is set, clone and `go build` it (any OS).
#   4. Otherwise download the build (Linux x86-64 only) from the workflow
#      artifact via the GitHub API (auth-gated — needs a token), falling back to
#      nightly.link (public). Tokens, most-to-least preferred:
#        PACKWIZ_TOKEN  (PAT with actions:read on the target repo)
#        GH_TOKEN / GITHUB_TOKEN  (the default Actions token is scoped to *this*
#        repo, so cross-repo artifact reads usually 404 and fall back to
#        nightly.link)
set -euo pipefail

_PACKWIZ_SETUP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

_PACKWIZ_REPO="${PACKWIZ_SETUP_REPO:-Polyfrost/packwiz}"
_PACKWIZ_WORKFLOW="${PACKWIZ_SETUP_WORKFLOW:-go.yml}"
_PACKWIZ_BRANCH="${PACKWIZ_SETUP_BRANCH:-main}"
_PACKWIZ_ARTIFACT="${PACKWIZ_SETUP_ARTIFACT:-Linux 64-bit x86}"
_PACKWIZ_RUN_SCAN="${PACKWIZ_SETUP_RUN_SCAN:-10}"
_PACKWIZ_NIGHTLY_URL="${PACKWIZ_SETUP_NIGHTLY_URL:-https://nightly.link/Polyfrost/packwiz/workflows/go/main/Linux%2064-bit%20x86.zip}"
_PACKWIZ_GO_MODULE="${PACKWIZ_SETUP_GO_MODULE:-}"
_PACKWIZ_BIN_NAME="${PACKWIZ_SETUP_BIN_NAME:-packwiz}"
_PACKWIZ_BIN_PATH="$_PACKWIZ_SETUP_DIR/$_PACKWIZ_BIN_NAME"

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

_pw_api_curl() {
  _pw_curl -H "Authorization: Bearer $(_pw_token)" \
           -H "Accept: application/vnd.github+json" \
           -H "X-GitHub-Api-Version: 2022-11-28" \
           "$@"
}

_pw_resolve_api() {
  command -v jq >/dev/null 2>&1 || { echo "jq not available" >&2; return 1; }
  local api="https://api.github.com/repos/$_PACKWIZ_REPO"

  local run_ids
  run_ids="$(_pw_api_curl \
    "$api/actions/workflows/$_PACKWIZ_WORKFLOW/runs?status=success&branch=$_PACKWIZ_BRANCH&per_page=$_PACKWIZ_RUN_SCAN" \
    | jq -r '.workflow_runs[].id')"
  [[ -n "$run_ids" ]] || { echo "no successful $_PACKWIZ_WORKFLOW run found" >&2; return 1; }

  local run_id artifact_url
  while read -r run_id; do
    artifact_url="$(_pw_api_curl "$api/actions/runs/$run_id/artifacts?per_page=100" \
      | jq -r --arg name "$_PACKWIZ_ARTIFACT" \
          '.artifacts[] | select(.name == $name and .expired == false) | .archive_download_url' \
      | head -n1)"
    if [[ -n "$artifact_url" ]]; then
      printf '%s\n' "$artifact_url"
      return 0
    fi
    echo "artifact '$_PACKWIZ_ARTIFACT' not found/expired for run $run_id" >&2
  done <<< "$run_ids"

  echo "no run with a live '$_PACKWIZ_ARTIFACT' artifact in the last $_PACKWIZ_RUN_SCAN successful $_PACKWIZ_BRANCH runs" >&2
  return 1
}

_pw_install_zip() {
  local zip="$1"
  local tmp
  tmp="$(mktemp -d)"
  unzip -o -q "$zip" -d "$tmp"
  rm -f "$zip"
  mv -f "$tmp/packwiz" "$_PACKWIZ_BIN_PATH"
  rm -rf "$tmp"
  chmod +x "$_PACKWIZ_BIN_PATH"
}

_pw_go_install() {
  command -v go >/dev/null 2>&1 || {
    echo "Error: go is required to build $_PACKWIZ_GO_MODULE." >&2
    return 1
  }
  command -v git >/dev/null 2>&1 || {
    echo "Error: git is required to build $_PACKWIZ_GO_MODULE." >&2
    return 1
  }

  local mod ref tmp
  mod="${_PACKWIZ_GO_MODULE%@*}"
  ref="${_PACKWIZ_GO_MODULE##*@}"
  if [[ "$ref" == "$_PACKWIZ_GO_MODULE" ]]; then ref="latest"; fi

  local clone_args=(--depth 1)
  if [[ "$ref" != "latest" ]]; then clone_args+=(--branch "$ref"); fi

  tmp="$(mktemp -d)"
  git clone --quiet "${clone_args[@]}" "https://$mod.git" "$tmp/src"
  ( cd "$tmp/src" && go build -o "$tmp/packwiz" . )
  mv -f "$tmp/packwiz" "$_PACKWIZ_BIN_PATH"
  rm -rf "$tmp"
  chmod +x "$_PACKWIZ_BIN_PATH"
}

_pw_download_linux() {
  local zip="$_PACKWIZ_SETUP_DIR/$_PACKWIZ_BIN_NAME-linux.zip"
  local token url
  token="$(_pw_token)"

  if [[ -z "${PACKWIZ_SETUP_SKIP_API:-}" ]] && [[ -n "$token" ]] && url="$(_pw_resolve_api)"; then
    echo "Downloading packwiz via GitHub API artifact ($_PACKWIZ_REPO: $_PACKWIZ_ARTIFACT)"
    if _pw_curl -H "Authorization: Bearer $token" \
                -H "Accept: application/vnd.github+json" \
                -o "$zip" "$url"; then
      _pw_install_zip "$zip"
      return 0
    fi
    echo "GitHub API download failed; falling back to nightly.link" >&2
  else
    echo "Skipping GitHub API download; using nightly.link" >&2
  fi

  echo "Downloading packwiz via nightly.link ($_PACKWIZ_NIGHTLY_URL)"
  if ! _pw_curl -o "$zip" "$_PACKWIZ_NIGHTLY_URL"; then
    rm -f "$zip"
    echo "Error: could not fetch packwiz for $_PACKWIZ_REPO." >&2
    echo "  GitHub API needs a token with actions:read on $_PACKWIZ_REPO (PACKWIZ_TOKEN);" >&2
    echo "  the nightly.link fallback only works while that repo's latest $_PACKWIZ_BRANCH artifact is live." >&2
    return 1
  fi
  _pw_install_zip "$zip"
}

if [[ -z "${PACKWIZ_SETUP_SKIP_PATH:-}" ]] && command -v packwiz >/dev/null 2>&1; then
  PACKWIZ_BIN="$(command -v packwiz)"
  echo "Using packwiz from PATH: $PACKWIZ_BIN"
elif [[ -x "$_PACKWIZ_BIN_PATH" ]]; then
  PACKWIZ_BIN="$_PACKWIZ_BIN_PATH"
  echo "Using cached packwiz: $PACKWIZ_BIN"
elif [[ -n "$_PACKWIZ_GO_MODULE" ]]; then
  echo "packwiz not found, building $_PACKWIZ_GO_MODULE"
  _pw_go_install
  PACKWIZ_BIN="$_PACKWIZ_BIN_PATH"
elif [[ "$(uname -s)" == "Linux" ]]; then
  if ! command -v unzip >/dev/null 2>&1; then
    echo "Error: unzip is required to set up packwiz." >&2
    return 1
  fi
  echo "packwiz not found, downloading $_PACKWIZ_REPO (Linux x86-64)"
  _pw_download_linux
  PACKWIZ_BIN="$_PACKWIZ_BIN_PATH"
else
  echo "Error: packwiz not found on $(uname -s). Install packwiz and rerun." >&2
  return 1
fi

export PACKWIZ_BIN

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SITE_DIR="${1:-$REPO_ROOT/_site}"

for var in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var is not set." >&2
    exit 1
  fi
done

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: the AWS CLI is required." >&2
  exit 1
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_REQUEST_CHECKSUM_CALCULATION="when_required"
export AWS_RESPONSE_CHECKSUM_VALIDATION="when_required"

sync_site() {
  aws s3 sync "$SITE_DIR" "s3://$R2_BUCKET" \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    --delete \
    --no-progress \
    --cache-control "max-age=600" \
    "$@"
}

sync_site --exclude "*.json" --exclude "*.md" --exclude "*.txt"
sync_site --exclude "*" --include "*.txt" --content-type "text/plain; charset=utf-8"
sync_site --exclude "*" --include "*.md" --content-type "text/markdown; charset=utf-8"
sync_site --exclude "*" --include "*.json" --content-type "application/json; charset=utf-8"

echo "Synced $SITE_DIR to R2 bucket $R2_BUCKET"

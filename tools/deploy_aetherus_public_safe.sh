#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifests/aetherus-public-safe-files.tsv"
BUCKET="earthus-cache-kr"
APP_PREFIX="app"
DISTRIBUTION_ID="E193CZEBLWEB56"
paths=()

while IFS=$'\t' read -r source_path public_path content_type cache_control; do
  [[ -z "${source_path:-}" || "$source_path" == \#* ]] && continue
  local_path="$REPO_ROOT/$source_path"
  [[ -f "$local_path" ]] || { printf 'Missing deployment source: %s\n' "$source_path" >&2; exit 1; }
  aws s3 cp "$local_path" "s3://$BUCKET/$APP_PREFIX/$public_path" \
    --region us-east-2 \
    --content-type "$content_type" \
    --cache-control "$cache_control" \
    --metadata-directive REPLACE \
    --only-show-errors
  paths+=("/$public_path")
done < "$MANIFEST"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "${paths[@]}" \
  --output json

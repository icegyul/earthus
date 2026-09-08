#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# INTEGRATION-4 §4 — 공개 배포 원본은 build/public-app 하나다.
#   작업 트리를 직접 올리지 않는다 — 거름망이 막은 파일은 여기서 멈춘다.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"/../aws/_shared/public-source.sh

MANIFEST="$SCRIPT_DIR/manifests/aetherus-public-safe-files.tsv"
BUCKET="earthus-cache-kr"
APP_PREFIX="app"
DISTRIBUTION_ID="E193CZEBLWEB56"
paths=()

while IFS=$'\t' read -r source_path public_path content_type cache_control; do
  [[ -z "${source_path:-}" || "$source_path" == \#* ]] && continue
  local_path="$(public_file "$source_path")" || exit 1
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

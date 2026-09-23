#!/usr/bin/env bash
set -euo pipefail
# ⛔ 2026-09-23 앱 원본 서울 이사(aws/_shared/app-origin.sh) — 이 스크립트는 목적지를 아직 고치지 않았다.
#    오하이오 app/ 에 올리면 올림·무효화가 PASS 여도 화면은 바뀌지 않는다(전수 조사: 9개가 그렇게 조용히 성공했다). 고친 뒤 이 두 줄을 지울 것.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"/../aws/_shared/app-origin.sh; app_unmigrated_stop "$(basename "$0")"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# INTEGRATION-4 §4 — 공개 배포 원본은 build/public-app 하나다.
#   작업 트리를 직접 올리지 않는다 — 거름망이 막은 파일은 여기서 멈춘다.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"/../aws/_shared/public-source.sh

MANIFEST="$SCRIPT_DIR/manifests/free-open-policy-files.tsv"
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

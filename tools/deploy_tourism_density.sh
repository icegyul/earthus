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

BUCKET="earthus-cache-kr"
APP_PREFIX="app"
DISTRIBUTION_ID="E193CZEBLWEB56"
REGION="us-east-2"

upload() {
  local public_path="$1" content_type="$2"
  local source_path
  source_path="$(public_file "$public_path")" || exit 1
  aws s3 cp "$source_path" "s3://$BUCKET/$APP_PREFIX/$public_path" \
    --region "$REGION" \
    --content-type "$content_type" \
    --cache-control 'no-cache' \
    --metadata-directive REPLACE \
    --only-show-errors
}

upload index.html 'text/html; charset=utf-8'
upload sw.js 'text/javascript; charset=utf-8'
upload css/tourism-flow.css 'text/css; charset=utf-8'
upload css/v8-shell.css 'text/css; charset=utf-8'
upload js/tourism-flow-contract.js 'text/javascript; charset=utf-8'
upload js/tourism-density-grid.js 'text/javascript; charset=utf-8'
upload js/tourism-density-labels.js 'text/javascript; charset=utf-8'
upload js/layers/tourism-flow.js 'text/javascript; charset=utf-8'
upload js/layers/registry.js 'text/javascript; charset=utf-8'
upload js/i18n.js 'text/javascript; charset=utf-8'
upload js/layerbar.js 'text/javascript; charset=utf-8'
upload js/main.js 'text/javascript; charset=utf-8'
upload js/ui-tourism.js 'text/javascript; charset=utf-8'
upload js/ui-source.js 'text/javascript; charset=utf-8'
upload js/v8/provenance-dock.js 'text/javascript; charset=utf-8'

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/' '/index.html' '/sw.js' '/css/tourism-flow.css' '/css/v8-shell.css' \
    '/js/tourism-flow-contract.js' '/js/tourism-density-grid.js' \
    '/js/tourism-density-labels.js' '/js/layers/tourism-flow.js' \
    '/js/layers/registry.js' '/js/i18n.js' '/js/layerbar.js' '/js/main.js' \
    '/js/ui-tourism.js' '/js/ui-source.js' \
    '/js/v8/provenance-dock.js' \
  --output json

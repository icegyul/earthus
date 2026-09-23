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
PUBLIC_ROOT="$(public_source_root)"
BUCKET="earthus-cache-kr"
APP_PREFIX="app"
DISTRIBUTION_ID="E193CZEBLWEB56"
REGION="us-east-2"

upload() {
  local source_path="$1" public_path="$2" content_type="$3" cache_control="$4"
  local local_path
  local_path="$(public_file "$source_path")" || exit 1
  aws s3 cp "$local_path" "s3://$BUCKET/$APP_PREFIX/$public_path" \
    --region "$REGION" \
    --content-type "$content_type" \
    --cache-control "$cache_control" \
    --metadata-directive REPLACE \
    --only-show-errors
}

# 운영 진입점과 앱 shell. 내용이 바뀌는 코드라 항상 재검증한다.
upload prototype/index.html index.html 'text/html; charset=utf-8' 'no-cache'
upload prototype/css/app.css css/app.css 'text/css; charset=utf-8' 'no-cache'
upload prototype/js/main.js js/main.js 'text/javascript; charset=utf-8' 'no-cache'
upload prototype/js/layerbar.js js/layerbar.js 'text/javascript; charset=utf-8' 'no-cache'
upload prototype/js/ui-ocean.js js/ui-ocean.js 'text/javascript; charset=utf-8' 'no-cache'
upload prototype/sw.js sw.js 'text/javascript; charset=utf-8' 'no-cache'
upload prototype/ocean.html ocean.html 'text/html; charset=utf-8' 'no-cache'

# Ocean 0–51장으로 만든 클라이언트 계약 전체. 일부만 골라 canary에 남기지 않는다.
aws s3 cp "$PUBLIC_ROOT/js/ocean" "s3://$BUCKET/$APP_PREFIX/js/ocean" \
  --recursive --exclude '*' --include '*.js' --region "$REGION" \
  --content-type 'text/javascript; charset=utf-8' --cache-control 'no-cache' \
  --metadata-directive REPLACE --only-show-errors
aws s3 cp "$PUBLIC_ROOT/data/ocean" "s3://$BUCKET/$APP_PREFIX/data/ocean" \
  --recursive --exclude '*' --include '*.json' --region "$REGION" \
  --content-type 'application/json; charset=utf-8' --cache-control 'no-cache' \
  --metadata-directive REPLACE --only-show-errors

# 심해·해구·해양생물 실제 화면이 읽는 운영 자료와 사진.
for file in sea-life.json trenches.json trench-footprints.json ocean-comparisons.json; do
  upload "data/$file" "data/$file" 'application/json; charset=utf-8' 'no-cache'
done
upload prototype/data/trench-bathymetry.webp data/trench-bathymetry.webp image/webp 'public, max-age=86400'
aws s3 cp "$PUBLIC_ROOT/ocean/thumbs" "s3://$BUCKET/$APP_PREFIX/ocean/thumbs" \
  --recursive --exclude '*' --include '*.jpg' --region "$REGION" \
  --content-type image/jpeg --cache-control 'public, max-age=86400' \
  --metadata-directive REPLACE --only-show-errors
aws s3 cp "$PUBLIC_ROOT/ocean/thumbs" "s3://$BUCKET/$APP_PREFIX/ocean/thumbs" \
  --recursive --exclude '*' --include '*.png' --region "$REGION" \
  --content-type image/png --cache-control 'public, max-age=86400' \
  --metadata-directive REPLACE --only-show-errors

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/' '/index.html' '/css/app.css' '/js/main.js' '/js/layerbar.js' '/js/ui-ocean.js' \
    '/sw.js' '/ocean.html' '/js/ocean/*' '/data/ocean/*' \
    '/data/sea-life.json' '/data/trenches.json' '/data/trench-footprints.json' \
    '/data/ocean-comparisons.json' '/data/trench-bathymetry.webp' '/ocean/thumbs/*' \
  --output json

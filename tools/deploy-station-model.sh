#!/usr/bin/env bash
# EARTHUS 1.0 — 일기도 기입 모형(station model) 배포
#
# 이 저장소의 1.0 배포 관례를 따른다: 바꾼 파일만 올리고 그 경로만 무효화한다.
# 전체 동기화를 하지 않는 이유는, 다른 작업이 진행 중인 파일까지 함께 올려 버리면
# 그 작업의 미완성 상태가 운영으로 나가기 때문이다.
#
# 올리는 것
#   js/station-model.js  (새 파일)  · js/main.js (import·init) · js/layerbar.js (레이어 항목)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUCKET="earthus-cache-kr"
APP_PREFIX="app"
DISTRIBUTION_ID="E193CZEBLWEB56"
REGION="us-east-2"

upload() {
  local source_path="$1" public_path="$2"
  [[ -f "$REPO_ROOT/$source_path" ]] || {
    printf '없는 파일: %s\n' "$source_path" >&2
    exit 1
  }
  aws s3 cp "$REPO_ROOT/$source_path" "s3://$BUCKET/$APP_PREFIX/$public_path" \
    --region "$REGION" \
    --content-type 'text/javascript; charset=utf-8' \
    --cache-control 'no-cache' \
    --metadata-directive REPLACE \
    --only-show-errors
  printf '  올림 %s\n' "$public_path"
}

# 문법이 깨진 채로 올리면 앱 전체가 멈춘다. 올리기 전에 반드시 본다.
echo "== 1/3 문법 =="
for f in prototype/js/station-model.js prototype/js/main.js prototype/js/layerbar.js; do
  node --check "$REPO_ROOT/$f"
  printf '  OK %s\n' "$f"
done

echo "== 2/3 업로드 =="
upload prototype/js/station-model.js js/station-model.js
upload prototype/js/main.js js/main.js
upload prototype/js/layerbar.js js/layerbar.js

echo "== 3/3 무효화 =="
# MSYS_NO_PATHCONV=1 이 없으면 Git Bash 가 "/js/main.js" 를 윈도우 경로로 바꿔
# CloudFront 가 InvalidArgument 를 낸다(실측). v2 배포 스크립트도 같은 이유로 이걸 쓴다.
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/js/station-model.js' '/js/main.js' '/js/layerbar.js' \
  --query 'Invalidation.Id' --output text

echo "완료 — https://earthus.net/ 에서 지구 스타일 → 기상 → 일기도 기호"

#!/usr/bin/env bash
# EARTHUS 1.0 — 바꾼 파일만 올린다
#
#   bash tools/deploy-v1.sh index.html js/main.js js/app-bar.js
#
# 이 저장소의 1.0 배포 관례를 따른다: 전체 동기화를 하지 않는다.
# 다른 작업이 진행 중인 파일까지 함께 올리면 그 미완성 상태가 운영으로 나간다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET="earthus-cache-kr"
PREFIX="app"
DIST="E193CZEBLWEB56"
REGION="us-east-2"
export AWS_PROFILE="${AWS_PROFILE:-earthus-deploy}"

[ $# -gt 0 ] || { echo "사용법: bash tools/deploy-v1.sh <파일...>  (prototype/ 기준 경로)"; exit 1; }

ctype() {
  case "$1" in
    *.html) echo 'text/html; charset=utf-8' ;;
    *.js)   echo 'text/javascript; charset=utf-8' ;;
    *.css)  echo 'text/css; charset=utf-8' ;;
    *.json) echo 'application/json; charset=utf-8' ;;
    *.png)  echo 'image/png' ;;
    *.svg)  echo 'image/svg+xml' ;;
    *)      echo 'application/octet-stream' ;;
  esac
}

echo "== 1/3 문법 =="
for f in "$@"; do
  [ -f "$ROOT/prototype/$f" ] || { echo "  없는 파일: $f" >&2; exit 1; }
  case "$f" in
    # 문법이 깨진 채 올리면 앱 전체가 멈춘다. 올리기 전에 본다.
    *.js) node --check "$ROOT/prototype/$f"; printf '  OK %s\n' "$f" ;;
    *)    printf '  -- %s\n' "$f" ;;
  esac
done

echo "== 2/3 업로드 =="
PATHS=()
for f in "$@"; do
  aws s3 cp "$ROOT/prototype/$f" "s3://$BUCKET/$PREFIX/$f" \
    --region "$REGION" --content-type "$(ctype "$f")" \
    --cache-control 'no-cache' --metadata-directive REPLACE --only-show-errors
  printf '  올림 %s\n' "$f"
  PATHS+=("/$f")
done

echo "== 3/3 무효화 =="
# MSYS_NO_PATHCONV=1 이 없으면 Git Bash 가 "/js/main.js" 를 윈도우 경로로 바꿔
# CloudFront 가 InvalidArgument 를 낸다(실측).
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths "${PATHS[@]}" \
  --query 'Invalidation.Id' --output text

echo "완료 — https://earthus.net/"

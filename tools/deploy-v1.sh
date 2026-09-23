#!/usr/bin/env bash
# EARTHUS 1.0 — 바꾼 파일만 올린다
#
#   bash tools/deploy-v1.sh index.html js/main.js js/app-bar.js
#
# 이 저장소의 1.0 배포 관례를 따른다: 전체 동기화를 하지 않는다.
# 다른 작업이 진행 중인 파일까지 함께 올리면 그 미완성 상태가 운영으로 나간다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# INTEGRATION-4 §4 — 공개 배포 원본은 build/public-app 하나다.
#   작업 트리를 직접 올리지 않는다 — 거름망이 막은 파일은 여기서 멈춘다.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"/../aws/_shared/public-source.sh

# 2026-09-23 — 앱 원본을 서울로 옮겼다. 버킷·리전은 경로마다 aws/_shared/app-origin.sh 가 정한다
#   (코드 → earthus-app-seoul/ap-northeast-2 · 람다가 쓰는 자리 → 오하이오 · 람다가 읽는 app/data 시드 → 두 곳).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"/../aws/_shared/app-origin.sh
PREFIX="app"
DIST="E193CZEBLWEB56"
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
    *.js) node --check "$(public_file "$f")" || exit 1; printf '  OK %s\n' "$f" ;;
    *)    printf '  -- %s\n' "$f" ;;
  esac
done

echo "== 2/3 업로드 =="
# 목적지는 CloudFront 기본 동작이 **지금** 보는 원본이다(전환 전 오하이오 · 뒤 서울) — 못 읽으면 쓰지 않는다.
app_resolve "$DIST" || exit 1
PATHS=()
# ⚠️ 목적지는 "s3://$BUCKET/$PREFIX/…" 모양 그대로 둔다 — 공개 경계 시험(test_integration4_boundary.py)이
#    이 모양으로 공개 업로더를 찾는다. 모양을 바꾸면 이 스크립트가 감시 밖으로 빠진다.
put() {  # $1 = 로컬 파일 · $2 = app/ 아래 경로 (BUCKET · REGION 은 부르기 전에 정한다)
  aws s3 cp "$1" "s3://$BUCKET/$PREFIX/$2" \
    --region "$REGION" --content-type "$(ctype "$2")" \
    --cache-control 'no-cache' --metadata-directive REPLACE --only-show-errors
}
for f in "$@"; do
  # 대입으로 받아 실패를 붙잡는다 — 인자 안에서 부르면 빈 문자열로 그대로 간다.
  src="$(public_file "$f")" || exit 1
  read -r BUCKET REGION < <(app_target "$f")
  put "$src" "$f"
  printf '  올림 %s → %s\n' "$f" "$BUCKET"
  if app_also_ohio "$f"; then
    BUCKET="$APP_OHIO_BUCKET"; REGION="$APP_OHIO_REGION"
    put "$src" "$f"
    printf '  올림 %s → %s (람다가 오하이오에서 읽는 시드 — 두 곳)\n' "$f" "$BUCKET"
  fi
  PATHS+=("/$f")
done

echo "== 3/3 무효화 =="
# MSYS_NO_PATHCONV=1 이 없으면 Git Bash 가 "/js/main.js" 를 윈도우 경로로 바꿔
# CloudFront 가 InvalidArgument 를 낸다(실측).
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths "${PATHS[@]}" \
  --query 'Invalidation.Id' --output text

echo "완료 — https://earthus.net/"

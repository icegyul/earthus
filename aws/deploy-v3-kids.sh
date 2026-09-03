#!/usr/bin/env bash
# EARTHUS v3 KIDS — 키즈 지구를 earthus.net/v3 로 올린다.
#
#   ./aws/deploy-v3-kids.sh
#
# 범위를 좁게 잡는다: app/v3 만 새로 올린다. 1.0/2.0 자산은 건드리지 않는다.
# v3 페이지는 이미 배포되어 있는 app/vendor(three.js)와 app/data(국가 폴리곤)를
# 같은 출처에서 상대경로로 읽는다 → 그 둘이 S3 에 있어야 화면이 뜬다.
set -euo pipefail

BUCKET="${EARTHUS_BUCKET:-earthus-cache-kr}"
REGION="${EARTHUS_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prototype/v3-kids"

[[ -f "$SRC/index.html" ]] || { echo "missing $SRC/index.html" >&2; exit 2; }

echo "▸ 전제 확인: v3 가 상대경로로 읽는 자산"
missing=0
for key in "${PREFIX}/vendor/three-r184.module.min.js" "${PREFIX}/data/country-reference.json"; do
  if aws s3 ls "s3://${BUCKET}/${key}" --region "$REGION" >/dev/null 2>&1; then
    echo "  있음  ${key}"
  else
    echo "  없음  ${key}  ← 이게 없으면 v3 는 빈 화면이 된다" >&2
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  echo "▸ 먼저 ./aws/deploy-app.sh 로 prototype 전체를 올린 뒤 다시 실행할 것." >&2
  exit 3
fi

echo "▸ 올리는 범위: ${PREFIX}/v3 만"
aws s3 sync "$SRC" "s3://${BUCKET}/${PREFIX}/v3/" \
  --region "$REGION" \
  --exclude '.DS_Store' --exclude '__pycache__/*' \
  --cache-control 'public, max-age=60'

# sync 가 추측한 Content-Type 이 틀리면 모듈이 실행되지 않는다.
echo "▸ Content-Type 교정"
while IFS= read -r f; do
  rel="${f#$SRC/}"
  case "$rel" in
    *.html) ct='text/html; charset=utf-8' ;;
    *.js)   ct='text/javascript; charset=utf-8' ;;
    *.json) ct='application/json; charset=utf-8' ;;
    *.css)  ct='text/css; charset=utf-8' ;;
    *)      continue ;;
  esac
  aws s3 cp "s3://${BUCKET}/${PREFIX}/v3/${rel}" "s3://${BUCKET}/${PREFIX}/v3/${rel}" \
    --region "$REGION" --metadata-directive REPLACE \
    --content-type "$ct" --cache-control 'public, max-age=60' >/dev/null
done < <(find "$SRC" -type f | sort)

if [[ -n "${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  aws cloudfront create-invalidation \
    --distribution-id "$EARTHUS_CLOUDFRONT_DISTRIBUTION_ID" \
    --paths '/v3/*' >/dev/null
  echo "▸ CloudFront /v3/* 무효화 요청함"
else
  echo "▸ CloudFront 배포 ID 가 없어 무효화하지 않았다 (없는 값을 지어내지 않는다)."
  echo "  EARTHUS_CLOUDFRONT_DISTRIBUTION_ID 를 넣고 다시 실행하면 무효화까지 한다."
fi

echo
echo "올림:  https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}/v3/index.html"
echo "주소:  https://earthus.net/v3/"

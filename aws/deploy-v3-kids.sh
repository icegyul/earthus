#!/usr/bin/env bash
# EARTHUS v3 KIDS — 키즈 지구를 earthus.net/v3 로 올린다.
#
#   ./aws/deploy-v3-kids.sh
#
# 범위를 좁게 잡는다: app/v3 만 새로 올린다. 1.0/2.0 자산은 건드리지 않는다.
# v3 페이지는 이미 배포되어 있는 app/vendor(three.js)와 app/data(국가 폴리곤)를
# 같은 출처에서 상대경로로 읽는다 → 그 둘이 S3 에 있어야 화면이 뜬다.
set -euo pipefail

# 배포 자격증명.
#  · 내 컴퓨터: 만료되지 않는 IAM 사용자 earthus-deploy 프로파일을 쓴다.
#    기본 프로파일은 `aws login` 세션이라 몇 시간이면 만료되고 그러면 배포가 멈춘다.
#  · CI: 러너에는 프로파일이 없고 자격증명이 환경변수나 역할로 들어온다.
#    그때 프로파일을 강제하면 "프로파일 없음"으로 죽으므로 건드리지 않는다.
if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_ROLE_ARN:-}" ]]; then
  if aws configure list-profiles 2>/dev/null | grep -qx 'earthus-deploy'; then
    export AWS_PROFILE=earthus-deploy
  fi
fi

BUCKET="${EARTHUS_BUCKET:-earthus-cache-kr}"
REGION="${EARTHUS_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prototype/v3-kids"

[[ -f "$SRC/index.html" ]] || { echo "missing $SRC/index.html" >&2; exit 2; }

echo "▸ 자격증명: $(aws sts get-caller-identity --query Arn --output text)"
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

# CloudFront 의 기본 루트 객체는 "/" 에만 걸린다. 오리진이 S3 REST 엔드포인트라
# "/v3/" 같은 디렉터리 요청에는 index.html 을 붙여 주지 않아 403 이 난다.
# 이 저장소는 app/v2 와 app/v2/ 두 키에 index.html 사본을 두는 방식으로 풀었다.
# v3 도 같은 관례를 따른다 — 사람이 /index.html 을 붙여 치지 않게.
# ⚠️ `aws s3 cp` 는 끝의 "/" 를 디렉터리로 보고 파일 이름을 붙여 버린다.
#    app/v3/ 라는 키를 만들려면 s3api put-object 로 키를 그대로 지정해야 한다.
echo "▸ 디렉터리 주소용 사본  app/v3  ·  app/v3/"
for key in "${PREFIX}/v3" "${PREFIX}/v3/"; do
  aws s3api put-object --bucket "$BUCKET" --region "$REGION" --key "$key"     --body "$SRC/index.html"     --content-type 'text/html; charset=utf-8'     --cache-control 'public, max-age=60' >/dev/null
  echo "  올림  ${key}"
done

# 배포 ID 를 사람이 기억할 필요가 없다 — earthus.net 별칭을 가진 배포를 직접 찾는다.
CF_ID="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-}"
if [[ -z "$CF_ID" ]]; then
  CF_ID="$(aws cloudfront list-distributions     --query "DistributionList.Items[?contains(Aliases.Items, 'earthus.net')].Id | [0]"     --output text 2>/dev/null || true)"
  [[ "$CF_ID" == "None" ]] && CF_ID=""
fi

if [[ -n "$CF_ID" ]]; then
  INV="$(aws cloudfront create-invalidation --distribution-id "$CF_ID"     --paths '/v3/*' --query 'Invalidation.Id' --output text)"
  echo "▸ CloudFront 무효화 요청함  배포 $CF_ID  무효화 $INV"
else
  echo "▸ earthus.net 별칭을 가진 CloudFront 배포를 못 찾아 무효화하지 않았다." >&2
  echo "  EARTHUS_CLOUDFRONT_DISTRIBUTION_ID 를 넣고 다시 실행할 것." >&2
fi

echo
echo "올림:  https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}/v3/index.html"
echo "주소:  https://earthus.net/v3/"

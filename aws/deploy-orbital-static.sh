#!/usr/bin/env bash
# AETHERUS ORBITAL — 정적 스냅샷을 earthus.net/orbital 로 올린다.
#
#   services/aetherus-orbital/.venv/Scripts/python tools/export_static_site.py
#   ./aws/deploy-orbital-static.sh
#
# 왜 정적인가: 지구본·물체 목록·근접 목록은 요청마다 달라지는 값이 아니라
# CelesTrak 이 발표할 때 달라지는 값이다. 그래서 서버도 DB 도 없이 파일로 낼 수
# 있고, 이용자가 0명인 동안 상시 비용이 0 이 된다. (2026-09-03 결정)
#
# 반사실(REMOVE) 패널은 계산이라 여기 오지 못한다. 내보내기가 그 경로에 읽을 수
# 있는 거절문을 넣어 두므로 404 대신 문장이 뜬다.
set -euo pipefail

# 배포 자격증명. v3 키즈 스크립트와 같은 규칙을 쓴다 —
#  · 내 컴퓨터: 만료되지 않는 IAM 사용자 earthus-deploy 프로파일
#  · CI: 러너에는 프로파일이 없고 환경변수나 역할로 들어온다. 그때 프로파일을
#    강제하면 "프로파일 없음"으로 죽으므로 건드리지 않는다.
if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_ROLE_ARN:-}" ]]; then
  if aws configure list-profiles 2>/dev/null | grep -qx 'earthus-deploy'; then
    export AWS_PROFILE=earthus-deploy
  fi
fi

BUCKET="${EARTHUS_BUCKET:-earthus-cache-kr}"
REGION="${EARTHUS_REGION:-ap-northeast-2}"
PREFIX="${EARTHUS_PREFIX:-app}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ORBITAL_BUILD_DIR:-$ROOT/build/orbital}"

if [[ ! -d "$SRC" ]]; then
  echo "빌드가 없다: $SRC" >&2
  echo "  먼저: cd services/aetherus-orbital && .venv/Scripts/python tools/export_static_site.py" >&2
  exit 1
fi

# 내보내기가 자기 결과를 어떻게 봤는지 읽고, 비어 있으면 올리지 않는다.
MANIFEST="$SRC/export-manifest.json"
if [[ ! -f "$MANIFEST" ]]; then
  echo "매니페스트가 없다. 내보내기가 끝까지 돌지 않았다." >&2
  exit 1
fi
OBJECTS="$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['objects_in_snapshot'])" "$MANIFEST")"
if [[ "$OBJECTS" -lt 1 ]]; then
  echo "스냅샷에 물체가 0개다. 빈 지구본을 올리지 않는다." >&2
  exit 1
fi
echo "올릴 것: 물체 ${OBJECTS}개, $(python -c "import json,sys;print(round(json.load(open(sys.argv[1],encoding='utf-8'))['total_bytes']/1048576,1))" "$MANIFEST") MB"

# ── 업로드 ────────────────────────────────────────────────────────────────
# API 파일에는 확장자가 없다. S3 는 확장자로 Content-Type 을 정하므로 그냥 올리면
# binary/octet-stream 이 되고 브라우저가 JSON 으로 읽지 못한다. 두 번에 나눠 올린다.
aws s3 sync "$SRC/ui/" "s3://${BUCKET}/${PREFIX}/orbital/ui/" \
  --region "$REGION" --delete \
  --cache-control 'public, max-age=60'

aws s3 sync "$SRC/api/" "s3://${BUCKET}/${PREFIX}/orbital/api/" \
  --region "$REGION" --delete \
  --content-type 'application/json; charset=utf-8' \
  --cache-control 'public, max-age=300'

for f in health export-manifest.json; do
  [[ -f "$SRC/$f" ]] || continue
  aws s3api put-object --bucket "$BUCKET" --region "$REGION" \
    --key "${PREFIX}/orbital/${f}" --body "$SRC/$f" \
    --content-type 'application/json; charset=utf-8' \
    --cache-control 'public, max-age=300' >/dev/null
done

# ⚠️ v3 스크립트가 겪은 함정: `aws s3 cp` 는 끝의 "/" 를 디렉터리로 보고 파일
# 이름을 붙여 버린다. 디렉터리 인덱스는 put-object 로 키를 직접 지정해 올린다.
aws s3api put-object --bucket "$BUCKET" --region "$REGION" \
  --key "${PREFIX}/orbital/index.html" --body "$SRC/ui/index.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public, max-age=60' >/dev/null

# ── 캐시 무효화 ───────────────────────────────────────────────────────────
CF_ID="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-}"
if [[ -z "$CF_ID" ]]; then
  CF_ID="$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, 'earthus.net')].Id | [0]" \
    --output text 2>/dev/null || true)"
fi
if [[ -n "$CF_ID" && "$CF_ID" != "None" ]]; then
  INV="$(aws cloudfront create-invalidation --distribution-id "$CF_ID" \
    --paths '/orbital/*' --query 'Invalidation.Id' --output text)"
  echo "무효화: $INV"
else
  echo "⚠️ CloudFront 배포를 못 찾았다. 옛 파일이 계속 보일 수 있다." >&2
  echo "  EARTHUS_CLOUDFRONT_DISTRIBUTION_ID 를 넣고 다시 실행할 것." >&2
fi

echo "올림:  https://earthus.net/orbital/"
echo "원본:  https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}/orbital/index.html"

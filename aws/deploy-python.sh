#!/usr/bin/env bash
# earthus — Python Lambda 배포 (NetCDF 처리용)
#
#   ./deploy-python.sh gmgsi-clouds
#
# 왜 별도 스크립트인가
#   celestrak-proxy 는 Node.js 이고 의존성이 없어 소스만 zip 하면 된다.
#   이쪽은 NetCDF4(HDF5)를 읽어야 해서 h5py + numpy + Pillow 가 필요하다.
#
# 왜 컨테이너가 아닌 zip 인가
#   ECR·Lambda Layer 권한이 earthus-deploy 에 없고 로컬에 Docker 도 없다.
#   대신 pip 의 --platform 으로 리눅스용 휠을 그대로 받아 zip 에 넣는다.
#   Docker 없이 되고, 용량도 한도 안에 들어간다.
#     실측: 압축 30MB / 해제 103MB   (한도: 직접 업로드 50MB / 해제 250MB)
set -euo pipefail

FN="${1:-gmgsi-clouds}"
REGION="$(aws configure get region)"
BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"
PYVER="3.12"
ROLE="earthus-lambda-${FN}"
DIR="$(cd "$(dirname "$0")" && pwd)/${FN}"

[ -d "$DIR" ] || { echo "❌ ${DIR} 없음"; exit 1; }

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
echo "▸ 함수: ${FN}   리전: ${REGION}   런타임: python${PYVER}"

# ── 1. 실행 역할 ─────────────────────────────────────────────
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "▸ 역할 있음: ${ROLE}"
else
  echo "▸ 역할 생성: ${ROLE}"
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  # 우리 캐시 버킷에 쓰기. NOAA 공개 버킷은 서명 없이 읽으므로 권한이 필요 없다.
  aws iam put-role-policy --role-name "$ROLE" --policy-name cache-bucket \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
        \"Resource\":\"arn:aws:s3:::${BUCKET}/*\"
      }]
    }"
  echo "▸ 역할 전파 대기 (10초)"
  sleep 10
fi

# ── 2. 패키징 ────────────────────────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "▸ 리눅스용 휠 내려받는 중 (첫 실행은 1~2분)"
# ⚠️ --platform 과 --only-binary 를 반드시 함께 줄 것.
#    안 그러면 맥용으로 빌드돼서 Lambda 에서 import 가 실패한다.
#
# 함수 폴더에 requirements.txt 가 있으면 그것을 쓴다.
# ⚠️ 없을 때만 NetCDF 용 기본값으로 떨어진다 — 새 함수(news-brief 등)에
#    h5py 30MB 를 억지로 끼워 넣지 않기 위해서다.
if [ -f "$DIR/requirements.txt" ]; then
  echo "  · $DIR/requirements.txt 사용"
  pip3 install --quiet --target "$TMP" \
    --platform manylinux2014_x86_64 --only-binary=:all: \
    --python-version "$PYVER" \
    -r "$DIR/requirements.txt"
else
  echo "  · 기본 의존성 (h5py numpy Pillow)"
  pip3 install --quiet --target "$TMP" \
    --platform manylinux2014_x86_64 --only-binary=:all: \
    --python-version "$PYVER" \
    h5py numpy Pillow
fi
# boto3/botocore 는 Lambda 런타임에 이미 있다 — 넣으면 용량만 커진다.
cp "$DIR"/*.py "$TMP"/
# 테스트/문서 파일을 빼서 용량을 줄인다
find "$TMP" -type d \( -name tests -o -name test -o -name __pycache__ \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$TMP" -name "*.pyc" -delete 2>/dev/null || true

(cd "$TMP" && zip -qr /tmp/${FN}.zip .)
SIZE=$(du -m /tmp/${FN}.zip | cut -f1)
echo "▸ 패키지: ${SIZE}MB (직접 업로드 한도 50MB)"
[ "$SIZE" -lt 50 ] || { echo "❌ 50MB 초과 — S3 경유 업로드 필요"; exit 1; }

# ── 3. 함수 생성 또는 갱신 ───────────────────────────────────
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  echo "▸ 코드 갱신"
  aws lambda update-function-code \
    --function-name "$FN" --zip-file "fileb:///tmp/${FN}.zip" \
    --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 10
  aws lambda update-function-configuration \
    --function-name "$FN" --timeout 300 --memory-size 2048 \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query 'LastModified' --output text >/dev/null
else
  echo "▸ 함수 생성"
  # 메모리 2048MB — 3000×4999 float32 배열을 몇 개 다룬다 (하나에 60MB).
  # Lambda 는 메모리에 비례해 CPU 도 주므로 처리 시간도 짧아진다.
  aws lambda create-function \
    --function-name "$FN" \
    --runtime "python${PYVER}" \
    --role "$ROLE_ARN" \
    --handler handler.handler \
    --zip-file "fileb:///tmp/${FN}.zip" \
    --timeout 300 --memory-size 2048 \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query 'FunctionArn' --output text
fi

rm -f /tmp/${FN}.zip
echo ""
echo "✅ 배포 완료 — 실행해보기:"
echo "   aws lambda invoke --function-name ${FN} /tmp/out.json && cat /tmp/out.json"

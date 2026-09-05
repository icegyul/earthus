#!/usr/bin/env bash
# earthus — 의존성 없는 Python Lambda 배포 (+ Function URL)
#
#   ./deploy-lite.sh flight-track
#
# deploy-python.sh 와 뭐가 다른가
#   저쪽은 h5py/numpy/Pillow 를 리눅스 휠로 받아 30MB zip 을 만든다 (1~2분).
#   이쪽은 표준 라이브러리만 쓰는 함수용이다 — 소스만 zip 하면 끝난다 (수 초).
#
#   그리고 이쪽은 **Function URL** 을 만든다.
#   S3 에 결과를 올려두는 배치가 아니라, 앱이 그때그때 물어보는 실시간 프록시이기 때문이다.
set -euo pipefail

FN="${1:?사용법: ./deploy-lite.sh <함수이름> [--url]}"
# Function URL 은 필요할 때만 만든다.
# 예약 실행(EventBridge)만 하는 함수에 공개 URL 을 붙이면 공격면만 넓어진다.
WANT_URL="${2:-}"
# 프로필 리전(us-east-2)을 따르면 서울 함수의 복사본이 생긴다(2026-09-05 실측). 서울로 못 박는다.
REGION="${REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
PYVER="3.12"
ROLE="earthus-lambda-${FN}"
DIR="$(cd "$(dirname "$0")" && pwd)/${FN}"

[ -d "$DIR" ] || { echo "❌ ${DIR} 없음"; exit 1; }
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
echo "▸ 함수: ${FN}   리전: ${REGION}"

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
  # ⚠️ 캐시 버킷 읽기·쓰기. 예전엔 이게 빠져 있어서 아카이버가 배포는 됐는데
  #    S3 에 아무것도 못 썼다. 조용히 실패하는 종류라 반드시 함께 붙인다.
  aws iam put-role-policy --role-name "$ROLE" --policy-name cache-bucket \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
        \"Resource\":\"arn:aws:s3:::earthus-cache-kr/*\"
      }]
    }"
  echo "▸ 역할 전파 대기 (10초)"; sleep 10
fi

# ── 2. 패키징 ────────────────────────────────────────────────
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$DIR"/*.py "$TMP"/
# KMA 허브 호출 회계 모듈 — handler 가 import 하면 반드시 같이 담는다(없으면 Lambda 가 import 에서 죽는다)
SHARED="$(cd "$(dirname "$0")" && pwd)/_shared/kma_hub.py"
if grep -q "import kma_hub" "$DIR/handler.py"; then
  [ -f "$SHARED" ] || { echo "❌ kma_hub.py 없음: $SHARED"; exit 1; }
  cp "$SHARED" "$TMP"/
  echo "▸ kma_hub.py 동봉"
fi
# Windows(Git Bash)엔 zip 이 없다 — deploy-python.sh 와 같이 python 으로 묶는다. 실패하면 멈춘다(예전엔 조용히 넘어가 옛 코드가 남았다).
rm -f "/tmp/${FN}.zip"
if command -v zip >/dev/null 2>&1; then
  (cd "$TMP" && zip -qr "/tmp/${FN}.zip" .)
else
  ZIPW="$(cygpath -w "/tmp/${FN}.zip" 2>/dev/null || echo "/tmp/${FN}.zip")"
  TMPW="$(cygpath -w "$TMP" 2>/dev/null || echo "$TMP")"
  python - "$TMPW" "$ZIPW" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, src))
PY
fi
[ -s "/tmp/${FN}.zip" ] || { echo "❌ 패키징 실패: /tmp/${FN}.zip 없음"; exit 1; }
ZIPFILE="$(cygpath -w "/tmp/${FN}.zip" 2>/dev/null || echo "/tmp/${FN}.zip")"   # Windows aws CLI 는 /tmp 경로를 못 연다
echo "▸ 패키지: $(du -k "/tmp/${FN}.zip" | cut -f1)KB"

# ── 3. 함수 ──────────────────────────────────────────────────
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  echo "▸ 코드 갱신"
  aws lambda update-function-code --function-name "$FN" \
    --zip-file "fileb://${ZIPFILE}" --query LastModified --output text
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 8
  # ⚠️ 갱신 경로에서 timeout·memory 를 안 고쳐서 한 번 헤맸다.
  #    LAMBDA_TIMEOUT/LAMBDA_MEM 을 줬는데도 생성 시 값(30초/256MB)이 그대로 남아
  #    "왜 중간에 끊기지" 하고 원인을 딴 데서 찾았다. 준 값이 있으면 반영한다.
  if [ -n "${LAMBDA_TIMEOUT:-}" ] || [ -n "${LAMBDA_MEM:-}" ]; then
    aws lambda update-function-configuration --function-name "$FN" \
      --timeout "${LAMBDA_TIMEOUT:-30}" --memory-size "${LAMBDA_MEM:-256}" \
      --query '{Timeout:Timeout,Memory:MemorySize}' --output text
    aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 5
  fi
else
  echo "▸ 함수 생성"
  aws lambda create-function --function-name "$FN" \
    --runtime "python${PYVER}" --role "$ROLE_ARN" --handler handler.handler \
    --zip-file "fileb://${ZIPFILE}" --timeout "${LAMBDA_TIMEOUT:-30}" --memory-size "${LAMBDA_MEM:-256}" \
    --query FunctionArn --output text
  aws lambda wait function-active --function-name "$FN" 2>/dev/null || sleep 8
fi

# ── 4. Function URL ──────────────────────────────────────────
# 인증 없음(NONE) — 공개 데이터 프록시라 로그인을 요구할 게 없다.
# ⚠️ 대신 함수 안에서 조회 범위를 제한하고, 응답을 캐시해 남용을 줄인다.
if [ "$WANT_URL" != "--url" ]; then
  echo "▸ Function URL 생략 (예약 실행 전용)"
  URL="(없음 — 예약 실행 전용)"
elif aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  URL="$(aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text)"
  echo "▸ Function URL 있음"
else
  echo "▸ Function URL 생성"
  URL="$(aws lambda create-function-url-config --function-name "$FN" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["GET"],"AllowHeaders":["*"],"MaxAge":86400}' \
    --query FunctionUrl --output text)"
  aws lambda add-permission --function-name "$FN" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl --principal '*' \
    --function-url-auth-type NONE >/dev/null 2>&1 || true
fi

echo ""
echo "✅ 배포 완료"
echo "   URL: ${URL}"
echo "   → prototype/js/config.js 의 API.FLIGHT 에 넣으세요"

# ── 배포 가드(지시서 §16): us-east-2 에 같은 이름이 있으면 실패. 삭제는 하지 않는다 — 목록만 보고한다.
if DUP="$(aws lambda get-function --function-name "$FN" --region us-east-2 --query 'Configuration.[FunctionArn,LastModified]' --output text 2>/dev/null)"; then
  echo "❌ 배포 가드 FAIL — us-east-2 에 복사본이 있다(삭제는 별도 승인): $DUP"
  exit 1
fi
echo "✅ 배포 가드 PASS — ${FN} 은 ${REGION} 에만 있다"

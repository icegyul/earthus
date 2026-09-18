#!/usr/bin/env bash
# earthus — traffic-autospeed 배포 (의존성 없음, SNS 트리거 전용)
#
#   ./deploy-traffic-autospeed.sh
#
# deploy-lite.sh 와 뭐가 다른가
#   저쪽 기본 역할은 캐시 버킷 S3 읽기/쓰기다. 이 함수는 S3 를 전혀 안 건드리고
#   대신 EventBridge 규칙 6개(marine-ea-schedule 등)만 고친다 — 그래서 역할
#   정책이 다르고, 이 스크립트를 따로 둔다. Function URL 도 안 만든다(SNS 전용).
set -euo pipefail

FN="traffic-autospeed"
REGION="${REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
# ⚠️ 없으면 한글 설명 찍다가 cp949 에러로 rc=255 — deploy-python.sh 의 그 함정과 같다.
export PYTHONUTF8=1
PYVER="3.12"
ROLE="earthus-lambda-${FN}"
DIR="$(cd "$(dirname "$0")" && pwd)/${FN}"

[ -d "$DIR" ] || { echo "❌ ${DIR} 없음"; exit 1; }
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
echo "▸ 함수: ${FN}   리전: ${REGION}"

# 이 함수가 되돌릴 규칙만 정확히 지정한다 — events:PutRule 을 * 로 주지 않는다.
RULE_ARNS='["arn:aws:events:'"${REGION}"':'"${ACCOUNT}"':rule/marine-ea-schedule",
"arn:aws:events:'"${REGION}"':'"${ACCOUNT}"':rule/earthus-wind-hourly",
"arn:aws:events:'"${REGION}"':'"${ACCOUNT}"':rule/marine-grid-hourly",
"arn:aws:events:'"${REGION}"':'"${ACCOUNT}"':rule/air-grid-hourly",
"arn:aws:events:'"${REGION}"':'"${ACCOUNT}"':rule/pressure-grid-schedule",
"arn:aws:events:'"${REGION}"':'"${ACCOUNT}"':rule/earthus-wildfire"]'

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
  aws iam put-role-policy --role-name "$ROLE" --policy-name restore-schedules \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Action\":[\"events:PutRule\"],
        \"Resource\":${RULE_ARNS}
      }]
    }"
  echo "▸ 역할 전파 대기 (10초)"; sleep 10
fi

# ── 2. 패키징 (표준 라이브러리 + boto3뿐 — Lambda 런타임에 이미 있음) ─────────
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$DIR"/*.py "$TMP"/
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
[ -s "/tmp/${FN}.zip" ] || { echo "❌ 패키징 실패"; exit 1; }
ZIPFILE="$(cygpath -w "/tmp/${FN}.zip" 2>/dev/null || echo "/tmp/${FN}.zip")"
echo "▸ 패키지: $(du -k "/tmp/${FN}.zip" | cut -f1)KB"

# ── 3. 함수 ──────────────────────────────────────────────────
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  echo "▸ 코드 갱신"
  aws lambda update-function-code --function-name "$FN" \
    --zip-file "fileb://${ZIPFILE}" --query LastModified --output text
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 8
else
  echo "▸ 함수 생성"
  aws lambda create-function --function-name "$FN" \
    --runtime "python${PYVER}" --role "$ROLE_ARN" --handler handler.handler \
    --zip-file "fileb://${ZIPFILE}" --timeout 30 --memory-size 128 \
    --description "earthus 사전출시 절약 스케줄을 트래픽 기준으로 되돌린다 (SNS 트리거)" \
    --query FunctionArn --output text
  aws lambda wait function-active --function-name "$FN" 2>/dev/null || sleep 8
fi

echo "✅ 배포 완료: ${FN}"

# ── 배포 가드: us-east-2 에 같은 이름이 있으면 실패 ──────────────────────────
if DUP="$(aws lambda get-function --function-name "$FN" --region us-east-2 --query 'Configuration.[FunctionArn,LastModified]' --output text 2>/dev/null)"; then
  echo "❌ 배포 가드 FAIL — us-east-2 에 복사본이 있다(삭제는 별도 승인): $DUP"
  exit 1
fi
echo "✅ 배포 가드 PASS — ${FN} 은 ${REGION} 에만 있다"

#!/usr/bin/env bash
# signal-foundation 전용 최소권한 배포.
# 기존 공개 세 객체는 읽기만 하고 canonical shadow 세 객체만 읽고 쓴다.
set -euo pipefail

FUNCTION="signal-foundation"
REGION="${AWS_REGION:-ap-northeast-2}"
BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"
ROLE="earthus-lambda-${FUNCTION}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DIR="${ROOT}/${FUNCTION}"
TIMEOUT="$(tr -d '[:space:]' < "${DIR}/timeout-seconds.txt")"
MEMORY="${LAMBDA_MEMORY_MB:-1024}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

case "$TIMEOUT" in
  ''|*[!0-9]*) echo "❌ timeout-seconds.txt는 정수여야 합니다"; exit 1 ;;
esac

if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  sleep 10
fi

aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name "$ROLE" --policy-name canonical-shadow \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {
        \"Effect\":\"Allow\",
        \"Action\":\"s3:GetObject\",
        \"Resource\":[
          \"arn:aws:s3:::${BUCKET}/events/kma-warn.json\",
          \"arn:aws:s3:::${BUCKET}/wind/kma-aws-min.json\",
          \"arn:aws:s3:::${BUCKET}/wind/tpw-ea.json\"
        ]
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
        \"Resource\":\"arn:aws:s3:::${BUCKET}/archive/canonical/v1/*\"
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":\"s3:ListBucket\",
        \"Resource\":\"arn:aws:s3:::${BUCKET}\",
        \"Condition\":{
          \"StringLike\":{
            \"s3:prefix\":[\"archive/canonical/v1\",\"archive/canonical/v1/*\"]
          }
        }
      }
    ]
  }"

PACKAGE_DIR="$(mktemp -d)"
ZIP_PATH="/tmp/${FUNCTION}.zip"
trap 'rm -rf "$PACKAGE_DIR" "$ZIP_PATH"' EXIT
cp "${DIR}/handler.py" "${DIR}/adapters.py" "${DIR}/canonical.py" "$PACKAGE_DIR/"
(cd "$PACKAGE_DIR" && zip -qr "$ZIP_PATH" .)

if aws lambda get-function --function-name "$FUNCTION" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION" --region "$REGION" \
    --zip-file "fileb://${ZIP_PATH}" --query LastModified --output text
  aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION" 2>/dev/null || sleep 8
  ENV_CURRENT="$(mktemp)"
  ENV_NEXT="$(mktemp)"
  chmod 600 "$ENV_CURRENT" "$ENV_NEXT"
  aws lambda get-function-configuration --function-name "$FUNCTION" --region "$REGION" \
    --query 'Environment.Variables' --output json > "$ENV_CURRENT"
  CURRENT="$ENV_CURRENT" TARGET="$ENV_NEXT" CACHE_BUCKET="$BUCKET" CACHE_REGION="$BUCKET_REGION" \
    python3 - <<'PY'
# -*- coding: utf-8 -*-
import json, os
values = json.load(open(os.environ["CURRENT"], encoding="utf-8")) or {}
values["CACHE_BUCKET"] = os.environ["CACHE_BUCKET"]
values["CACHE_REGION"] = os.environ["CACHE_REGION"]
with open(os.environ["TARGET"], "w", encoding="utf-8") as stream:
    json.dump({"Variables": values}, stream)
print("  · 환경변수 이름 보존: " + ", ".join(sorted(values)))
PY
  aws lambda update-function-configuration --function-name "$FUNCTION" --region "$REGION" \
    --timeout "$TIMEOUT" --memory-size "$MEMORY" --environment "file://${ENV_NEXT}" \
    --query LastModified --output text
  rm -f "$ENV_CURRENT" "$ENV_NEXT"
else
  aws lambda create-function --function-name "$FUNCTION" --region "$REGION" \
    --runtime python3.12 --role "$ROLE_ARN" --handler handler.handler \
    --zip-file "fileb://${ZIP_PATH}" --timeout "$TIMEOUT" --memory-size "$MEMORY" \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query FunctionArn --output text
fi

echo "✅ ${FUNCTION} 최소권한 private shadow 배포 완료"

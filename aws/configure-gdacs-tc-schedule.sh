#!/usr/bin/env bash
# tsunami-eta — 15분마다 GDACS MAP 원본을 보존하고 축약본을 만든다(PHASE 1).
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
FUNCTION="gdacs-tc"
RULE="gdacs-tc-schedule"
ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" --query 'Configuration.FunctionArn' --output text)"
aws events put-rule --name "$RULE" --region "$REGION" --schedule-expression 'rate(15 minutes)' \
  --description 'earthus · GDACS 태풍 목록 축약본(브라우저 경량 피드)' --state ENABLED >/dev/null
FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }
RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" --statement-id "${RULE}-invoke" \
  --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true
echo "✅ ${RULE} → ${FUNCTION} (rate 15 minutes)"

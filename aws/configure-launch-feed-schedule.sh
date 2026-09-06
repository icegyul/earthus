#!/usr/bin/env bash
# tsunami-eta — 15분마다 LL2 발사 일정을 받아 축약본을 만든다.
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
FUNCTION="launch-feed"
RULE="launch-feed-schedule"
ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" --query 'Configuration.FunctionArn' --output text)"
aws events put-rule --name "$RULE" --region "$REGION" --schedule-expression 'rate(15 minutes)' \
  --description 'earthus · 로켓 발사 축약본(LL2 detailed → events/launches.json)' --state ENABLED >/dev/null
FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }
RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" --statement-id "${RULE}-invoke" \
  --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true
echo "✅ ${RULE} → ${FUNCTION} (rate 15 minutes)"

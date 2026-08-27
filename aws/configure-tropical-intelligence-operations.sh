#!/usr/bin/env bash
# EARTHUS 2.0 — schedule tropical-intelligence only after manual Lambda/S3 verification.
set -euo pipefail

REGION="$(aws configure get region)"
FN="tropical-intelligence"
RULE="earthus-tropical-intelligence"
STATEMENT="earthus-tropical-intelligence-events"
SCHEDULE="cron(20 8,20 * * ? *)"

[ -n "$REGION" ] || { echo "❌ AWS region is not configured"; exit 1; }
FN_ARN="$(aws lambda get-function --region "$REGION" --function-name "$FN" --query 'Configuration.FunctionArn' --output text)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
RULE_ARN="arn:aws:events:${REGION}:${ACCOUNT}:rule/${RULE}"

echo "⚠️ Run this only after a manual invocation produced a valid events/tropical-guidance-v2.json."

aws events put-rule --region "$REGION" \
  --name "$RULE" \
  --schedule-expression "$SCHEDULE" \
  --state ENABLED \
  --description 'Earthus 2.0 ECMWF IFS ENS + AIFS ENS tropical guidance after 00/12 cycles' >/dev/null

aws events put-targets --region "$REGION" --rule "$RULE" \
  --targets "Id=1,Arn=${FN_ARN}" >/dev/null

POLICY="$(aws lambda get-policy --region "$REGION" --function-name "$FN" --query Policy --output text 2>/dev/null || true)"
if ! grep -q "${STATEMENT}" <<<"$POLICY"; then
  aws lambda add-permission --region "$REGION" \
    --function-name "$FN" \
    --statement-id "$STATEMENT" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "$RULE_ARN" >/dev/null
fi

echo "✅ ${RULE} enabled: ${SCHEDULE} (UTC)"
echo "   Check after next run:"
echo "   aws logs tail /aws/lambda/${FN} --since 30m --region ${REGION}"

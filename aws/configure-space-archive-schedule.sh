#!/usr/bin/env bash
# space-archive — 매시간 우주 상태 스냅샷 + 하루 한 번 카탈로그 보존·14일 이력 (관제센터 ARCHIVE 의 서버 쪽)
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
FUNCTION="space-archive"
RULE="space-archive-schedule"
ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" --query 'Configuration.FunctionArn' --output text)"
# 정각 5분 뒤 — launch-feed(15분)·celestrak-proxy(일 1회) 가 먼저 쓰도록 한 박자 늦춘다.
aws events put-rule --name "$RULE" --region "$REGION" --schedule-expression 'cron(5 * * * ? *)' \
  --description 'earthus · 우주 상태 아카이브(events/space-archive, celestrak/archive, history-14d)' --state ENABLED >/dev/null
FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }
RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" --statement-id "${RULE}-invoke" \
  --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true
echo "✅ ${RULE} → ${FUNCTION} (cron 5 * * * ? *)"

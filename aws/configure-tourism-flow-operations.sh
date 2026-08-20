#!/usr/bin/env bash
# tourism-flow 단독 EventBridge·호출권한·로그 보존 설정.
# 전체 schedules.sh를 다시 건드리지 않고 이번 collector 하나만 적용할 때 쓴다.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
FUNCTION="tourism-flow"
RULE="tourism-flow-schedule"

ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" \
  --query 'Configuration.FunctionArn' --output text)"

aws events put-rule --name "$RULE" --region "$REGION" \
  --schedule-expression 'rate(5 minutes)' \
  --description 'earthus · 서울 관광 흐름 공식 현재·기관 예측' \
  --state ENABLED >/dev/null
FAILED_TARGETS="$(aws events put-targets --rule "$RULE" --region "$REGION" \
  --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
if [ "$FAILED_TARGETS" != "0" ]; then
  echo "❌ EventBridge target 연결 실패: ${FAILED_TARGETS}건" >&2
  exit 1
fi

RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
  --statement-id "${RULE}-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 \
  || true

# KTO 지역별 방문 지표는 최근 7일을 매일 재수집한다. 다만 공식 인증·계약 Smoke와
# raw/normalized 적재 확인 전에는 실행하면 안 되므로 규칙을 DISABLED로 만든다.
# KTO P0 Smoke Test 통과 후 운영자가 enable-rule로 한 번만 승격한다.
# 서울 관광 5분 수집과 같은 시각을 피한다. 같은 Lambda에서 KTO 키 호출이 겹치면
# provider 할당량을 불필요하게 소진할 수 있다.
KTO_VISITOR_RULE="tourism-flow-kto-visitors-daily"
KTO_VISITOR_TARGETS="[{\"Id\":\"1\",\"Arn\":\"${ARN}\",\"Input\":\"{\\\"task\\\":\\\"KTO_VISITORS_DAILY\\\"}\"}]"
aws events put-rule --name "$KTO_VISITOR_RULE" --region "$REGION" \
  --schedule-expression 'cron(37 19 * * ? *)' \
  --description 'earthus · KTO 지역별 방문 지표 최근 7일 재수집' \
  --state DISABLED >/dev/null
KTO_FAILED_TARGETS="$(aws events put-targets --rule "$KTO_VISITOR_RULE" --region "$REGION" \
  --targets "$KTO_VISITOR_TARGETS" \
  --query FailedEntryCount --output text)"
if [ "$KTO_FAILED_TARGETS" != "0" ]; then
  echo "❌ KTO EventBridge target 연결 실패: ${KTO_FAILED_TARGETS}건" >&2
  exit 1
fi
KTO_RULE_ARN="$(aws events describe-rule --name "$KTO_VISITOR_RULE" --region "$REGION" \
  --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
  --statement-id "${KTO_VISITOR_RULE}-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$KTO_RULE_ARN" >/dev/null 2>&1 \
  || true

# 수집 payload는 S3 불변 history가 정본이다. CloudWatch 원문 로그는 30일만 둔다.
if ! aws logs put-retention-policy --log-group-name "/aws/lambda/${FUNCTION}" \
  --retention-in-days 30 --region "$REGION"; then
  # 배포 계정에 logs:PutRetentionPolicy가 없는 경우에도 수집 스케줄 자체는 유효하다.
  # 보존기간을 적용한 것처럼 말하지 않고 운영 후속 항목으로 명시한다.
  echo "⚠️ CloudWatch 로그 30일 보존 미적용 — logs:PutRetentionPolicy 권한 필요" >&2
fi

aws events describe-rule --name "$RULE" --region "$REGION" \
  --query '{State:State,ScheduleExpression:ScheduleExpression,Arn:Arn}' --output json
aws events describe-rule --name "$KTO_VISITOR_RULE" --region "$REGION" \
  --query '{State:State,ScheduleExpression:ScheduleExpression,Arn:Arn}' --output json

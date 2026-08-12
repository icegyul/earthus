#!/usr/bin/env bash
# tpw-grid 운영 관측 pilot.
#
# 함수 실행 자체와 별도로 실패 메시지, 로그 보존, 오류·미실행·장시간·DLQ 적체를
# AWS 자원으로 남긴다. 외부 이메일/SMS/SNS 구독은 운영자 주소 승인이 필요하므로 만들지 않는다.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
FUNCTION="tpw-grid"
ROLE="earthus-lambda-${FUNCTION}"
QUEUE_NAME="earthus-${FUNCTION}-dlq"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT}:${QUEUE_NAME}"

echo "▸ ${FUNCTION} 운영 관측 · ${REGION}"

# 14일은 SQS 최대 보존기간이다. 운영자가 원인을 확인하기 전에 실패 증거가 사라지지 않게 한다.
aws sqs create-queue --queue-name "$QUEUE_NAME" --region "$REGION" \
  --attributes MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true \
  --tags Project=earthus,Component="$FUNCTION",Purpose=dead-letter \
  --query QueueUrl --output text >/dev/null

# Lambda async invoke가 최종 실패를 같은 계정의 이 큐 하나에만 보낼 수 있다.
aws iam put-role-policy --role-name "$ROLE" --policy-name "${FUNCTION}-dlq-send" \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Action\":\"sqs:SendMessage\",
      \"Resource\":\"${QUEUE_ARN}\"
    }]
  }"

aws lambda update-function-configuration --function-name "$FUNCTION" --region "$REGION" \
  --dead-letter-config "TargetArn=${QUEUE_ARN}" \
  --query LastModified --output text >/dev/null
aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION" 2>/dev/null || sleep 8

# 원문 GRIB/JSON은 로그에 쓰지 않는다. 함수의 시각·n·bytes 요약과 오류 추적만 30일 보존한다.
aws logs put-retention-policy --log-group-name "/aws/lambda/${FUNCTION}" --region "$REGION" \
  --retention-in-days 30

put_alarm() {
  aws cloudwatch put-metric-alarm --region "$REGION" "$@"
}

put_alarm --alarm-name "earthus-${FUNCTION}-errors" \
  --alarm-description "tpw-grid Lambda error count >= 1 in one hour" \
  --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value="$FUNCTION" --statistic Sum --unit Count \
  --period 3600 --evaluation-periods 1 --datapoints-to-alarm 1 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching

# 시간당 규칙이 두 구간 연속 호출되지 않으면 오류 metric 자체가 없어도 경보가 난다.
put_alarm --alarm-name "earthus-${FUNCTION}-missing-invocation" \
  --alarm-description "tpw-grid has fewer than one invocation for two consecutive hours" \
  --namespace AWS/Lambda --metric-name Invocations \
  --dimensions Name=FunctionName,Value="$FUNCTION" --statistic Sum --unit Count \
  --period 3600 --evaluation-periods 2 --datapoints-to-alarm 2 \
  --threshold 1 --comparison-operator LessThanThreshold \
  --treat-missing-data breaching

# 함수 timeout은 420초다. 300초를 넘으면 실패 전에도 NOAA·decode 경로 퇴화를 조사한다.
put_alarm --alarm-name "earthus-${FUNCTION}-long-duration" \
  --alarm-description "tpw-grid maximum duration >= 300 seconds" \
  --namespace AWS/Lambda --metric-name Duration \
  --dimensions Name=FunctionName,Value="$FUNCTION" --statistic Maximum --unit Milliseconds \
  --period 3600 --evaluation-periods 1 --datapoints-to-alarm 1 \
  --threshold 300000 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching

put_alarm --alarm-name "earthus-${FUNCTION}-dlq-visible" \
  --alarm-description "tpw-grid dead-letter queue has at least one visible message" \
  --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value="$QUEUE_NAME" --statistic Maximum --unit Count \
  --period 300 --evaluation-periods 1 --datapoints-to-alarm 1 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching

echo "✅ DLQ·30일 로그 보존·CloudWatch 경보 4개 적용"
echo "   ⚠️ 외부 알림 action은 연결하지 않음 — 승인된 운영 수신처가 필요함"

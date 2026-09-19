#!/usr/bin/env bash
# glacial-lake-us — 알래스카 주노(멘덴홀 강 · Suicide Basin 아래) 기관 관측·예보 인용, 30분마다
#
# 왜 30분인가: USGS 15052500 은 15분 간격, NWS NWPS 예보는 하루 1~2회 갱신이다. 빙하호 배수는
# 며칠에 걸쳐 수위가 오르므로 30분이면 놓치지 않는다. 함수는 요청 3번·수 KB 라 비용이 거의 없다.
#
# 먼저 배포: bash aws/deploy-python.sh glacial-lake-us
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
export PYTHONUTF8=1
FUNCTION="glacial-lake-us"
RULE="earthus-glacial-lake-us"
SCHEDULE='rate(30 minutes)'

ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" \
        --query 'Configuration.FunctionArn' --output text)"
RULE_ARN="$(aws events put-rule --name "$RULE" --region "$REGION" \
  --schedule-expression "$SCHEDULE" \
  --description 'earthus · Alaska Juneau Mendenhall River USGS/NWS quote every 30 min (no computation)' \
  --state ENABLED --query RuleArn --output text)"

aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
  --statement-id "${RULE}-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true

FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" \
           --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }
echo "✅ ${RULE} → ${FUNCTION} (${SCHEDULE})"

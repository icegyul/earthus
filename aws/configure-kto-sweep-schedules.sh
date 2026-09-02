#!/usr/bin/env bash
# KTO 지역 스윕·전체 동기화 일일 스케줄.
#
# 왜 필요한가: 스윕 다섯을 손으로 돌린 뒤 방치하면 이틀 안에 화면이 "지난 자료"로
# 되돌아간다(무장애·영문 신선도 48시간). 심사 기간에 그렇게 보이면 안 된다.
#
# 왜 20분 간격인가: 공용 인증키 lease가 900초이고 해제 API가 없다. 15분 안에
# 다음 수집을 걸면 KTO_SYNC_BUSY로 그냥 버려진다. 여유를 둬 20분으로 벌린다.
#
# 호출량: 데이터셋당 하루 270콜(시군구) 또는 40콜 안쪽. 개발계정 한도는
# 활용신청 건당 1,000회이므로 각각 여유가 있다.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
FUNCTION="tourism-flow"

ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" \
  --query 'Configuration.FunctionArn' --output text)"
echo "▸ 대상 함수: $ARN"

# rule 이름 | cron(UTC) | 설명 | payload
RULES=(
"tourism-flow-kto-concentration|cron(0 20 * * ? *)|earthus · KTO 관광지 집중률 전국 스윕|{\"task\":\"KTO_SWEEP_BATCH\",\"budgetSeconds\":200,\"pageSize\":1000,\"pageLimit\":1,\"jobs\":[{\"service\":\"concentration\",\"operation\":\"tatsCnctrRatedList\"}]}"
"tourism-flow-kto-related|cron(20 20 * * ? *)|earthus · KTO 연관 관광지 전국 스윕|{\"task\":\"KTO_SWEEP_BATCH\",\"budgetSeconds\":200,\"pageSize\":100,\"pageLimit\":1,\"jobs\":[{\"service\":\"related\",\"operation\":\"areaBasedList1\"}]}"
"tourism-flow-kto-localhub|cron(40 20 * * ? *)|earthus · KTO 기초지자체 중심 관광지 전국 스윕|{\"task\":\"KTO_SWEEP_BATCH\",\"budgetSeconds\":200,\"pageSize\":1000,\"pageLimit\":1,\"jobs\":[{\"service\":\"localHub\",\"operation\":\"areaBasedList1\"}]}"
"tourism-flow-kto-catalogs|cron(0 21 * * ? *)|earthus · KTO 무장애·웰니스·영문 전체 동기화|{\"task\":\"KTO_SWEEP_BATCH\",\"budgetSeconds\":220,\"jobs\":[{\"service\":\"barrierFree\",\"operation\":\"areaBasedSyncList2\"},{\"service\":\"wellness\",\"operation\":\"wellnessTursmSyncList\",\"params\":{\"langDivCd\":\"KOR\"}},{\"service\":\"english\",\"operation\":\"areaBasedSyncList2\"}]}"
)

for ENTRY in "${RULES[@]}"; do
  IFS='|' read -r NAME SCHED DESC PAYLOAD <<< "$ENTRY"
  echo "▸ $NAME  ($SCHED)"
  aws events put-rule --name "$NAME" --region "$REGION" \
    --schedule-expression "$SCHED" --description "$DESC" --state ENABLED >/dev/null

  TARGETS="[{\"Id\":\"1\",\"Arn\":\"${ARN}\",\"Input\":$(printf '%s' "$PAYLOAD" | python -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}]"
  FAILED="$(aws events put-targets --rule "$NAME" --region "$REGION" \
    --targets "$TARGETS" --query FailedEntryCount --output text)"
  [ "$FAILED" = "0" ] || { echo "❌ put-targets 실패: $NAME"; exit 1; }

  RULE_ARN="$(aws events describe-rule --name "$NAME" --region "$REGION" --query Arn --output text)"
  aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
    --statement-id "${NAME}-invoke" --action lambda:InvokeFunction \
    --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 \
    && echo "   호출 권한 추가" || echo "   호출 권한 이미 있음"
done

echo ""
echo "✅ 등록 완료 — 현재 상태"
for ENTRY in "${RULES[@]}"; do
  IFS='|' read -r NAME _ _ _ <<< "$ENTRY"
  aws events describe-rule --name "$NAME" --region "$REGION" \
    --query "[Name,State,ScheduleExpression]" --output text
done

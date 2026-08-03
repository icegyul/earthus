#!/usr/bin/env bash
# 멈춰 있는 Lambda 셋에 스케줄을 건다 — 한 번만 실행하면 된다.
#
# ⚠️⚠️ **왜 Claude 가 못 하나 (두 번 틀리게 말했다가 확인한 것)**
#   처음엔 "자동모드 분류기 차단"이라고 했는데 그것만이 아니었다.
#   `earthus-deploy` 사용자에게 **EventBridge 권한 자체가 없다**:
#       events:ListRules → AccessDenied
#       iam:ListUserPolicies → AccessDenied (자기 권한도 못 읽는다)
#   자격증명은 default 하나뿐이라 우회 경로도 없다.
#   → **관리자 권한으로 이 스크립트를 한 번 실행**하거나,
#     earthus-deploy 에 events:PutRule / PutTargets 와
#     lambda:AddPermission 을 붙여 주면 다음부터는 Claude 가 할 수 있다.
#
# 2026-08-03 실측 — 이 셋이 멈춰 있었다
#   천리안2A       31분   (기대 10분)   ← 손으로 부를 때만 갱신됨
#   기압 격자(등압선) 371분  (기대 60분)   ← 만든 날부터 한 번도 안 돎
#   air-state      367분  (하루 1번)    ← 이게 없으면 "벗어났습니다"가 영영 안 나온다
# 나머지(구름·바람·대기질·해양·부이·특보·태풍)는 정상으로 돌고 있었다.

set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"

# 이름 | 주기 | 설명
#  ⚠️ 천리안 원본은 2.5분마다 나오지만 10분으로 잡는다 —
#     화면이 그보다 자주 바뀔 필요가 없고, 폰 데이터도 아껴야 한다.
#  ⚠️ air-state 는 KST 21:20 (UTC 12:20). 그날 최고기온은 이미 지났고 밤 최저는
#     진행 중이라 **하루를 한 번에 판정할 수 있는 유일한 시간대**다.
#     자정에 돌리면 날짜가 넘어가 어느 날의 판정인지 흐려진다.
JOBS=(
  "gk2a-clouds|rate(10 minutes)|천리안2A 한반도 영상"
  "pressure-grid|rate(1 hour)|동아시아 기압 격자 (등압선)"
  "air-state|cron(20 12 * * ? *)|하루 한 번 대기 상태 판정 (KST 21:20)"
)

for job in "${JOBS[@]}"; do
  IFS='|' read -r FN SCHED DESC <<< "$job"
  RULE="${FN}-schedule"
  echo "▸ ${FN} — ${SCHED}"

  ARN="$(aws lambda get-function --function-name "$FN" --region "$REGION" \
          --query 'Configuration.FunctionArn' --output text)"

  aws events put-rule --name "$RULE" --region "$REGION" \
    --schedule-expression "$SCHED" --description "earthus · ${DESC}" --state ENABLED >/dev/null

  aws events put-targets --rule "$RULE" --region "$REGION" \
    --targets "Id=1,Arn=${ARN}" >/dev/null

  # ⚠️⚠️ 이 권한을 빼면 규칙은 만들어지지만 **조용히 아무것도 안 한다.**
  #    화면에는 여전히 옛 자료가 떠 있고, 왜 안 되는지 알 방법이 없다.
  RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query 'Arn' --output text)"
  aws lambda add-permission --function-name "$FN" --region "$REGION" \
    --statement-id "${RULE}-invoke" --action lambda:InvokeFunction \
    --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 \
    || echo "   (권한 이미 있음)"

  echo "   ✅ ${RULE}"
done

echo
echo "▸ 지금 한 번씩 돌려 첫 자료를 만든다"
for job in "${JOBS[@]}"; do
  IFS='|' read -r FN _ _ <<< "$job"
  aws lambda invoke --function-name "$FN" --region "$REGION" \
    --cli-read-timeout 300 "/tmp/${FN}.out" >/dev/null 2>&1 \
    && echo "   ${FN}: $(head -c 160 "/tmp/${FN}.out")" \
    || echo "   ${FN}: 실행 실패 — 로그를 보세요"
done

echo
echo "확인:"
echo "  curl -s https://earthus.net/clouds/gk2a/meta.json | head -c 120"
echo "  aws events list-rules --region ${REGION} --query 'Rules[].{n:Name,s:ScheduleExpression}' --output table"

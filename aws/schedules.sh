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
  # 대만 CWA의 실황은 태풍 표면 근거에만 쓴다. 자체 진로 예보나 기관 순위에는 쓰지 않는다.
  "cwa-observations|rate(10 minutes)|대만 CWA 지상 실황 (태풍 표면 근거)"
  "ascat-observations|rate(4 hours)|NOAA ASCAT 위성 해상풍 (태풍 표면 근거)"
  "pressure-grid|rate(1 hour)|동아시아 기압 격자 (등압선)"
  # 총가강수량은 NOAA GFS의 모델 유효시각을 쓴다. 위성 관측이나 강수량으로 부르지 않는다.
  "tpw-grid|rate(1 hour)|동아시아·서태평양 총가강수량 1도 격자"
  "air-state|cron(20 12 * * ? *)|하루 한 번 대기 상태 판정 (KST 21:20)"
  # 2026-08-03 에 함께 만든 것들. ⚠️ 만든 날 여기 안 넣으면 손으로만 돈다.
  "quake-asia|rate(10 minutes)|지진 (기상청·JMA)"
  "social-draft|rate(1 hour)|SNS 초안"
  # ⚠️ 원본(네바다 MIDAS)이 하루보다 자주 안 바뀐다. 더 자주 부를 이유가 없다.
  "crustal|cron(40 3 * * ? *)|땅의 움직임 (GNSS) — KST 12:40"

  # ── 2026-08-04 에 만든 것 ────────────────────────────────────
  "lightning|rate(10 minutes)|낙뢰 (기상청+JMA)"
  # 기상청 HSR 원본 생산은 5분 주기다. 영상 상단 공식 생산시각을 그대로 보존한다.
  "kma-radar|cron(0/5 * * * ? *)|기상청 HSR 레이더 강수 실황"
  # ⚠️⚠️ **개발계정 트래픽 한도를 계산하고 정한 주기다.** 더 짧게 바꾸지 말 것.
  #    khoa-coast 는 한 번에 55회 호출한다(이안류 10 + 조위 45).
  #      15분 → 하루 96회 × 55 = 5,280회.  이안류 한도가 10,000/일이라 여유가 있다.
  #      10분으로 줄이면 7,920회가 되어, 재시도가 겹치면 한도를 넘긴다.
  #      ⚠️ 한도를 넘으면 "조금 느려지는" 게 아니라 **그날 내내 아무것도 안 나온다.**
  "khoa-coast|rate(15 minutes)|이안류·조위 실측 (국립해양조사원)"
  # ⚠️ 산불은 한도가 **1,000/일**로 훨씬 빡빡하다. 원본이 3시간마다 나오므로
  #    그 주기에 맞춘다 (하루 8회 × 3호출 = 24회).
  "forest-fire|cron(10 0,3,6,9,12,15,18,21 * * ? *)|산불위험예보 (산림청) — 3시간"
  # ⚠️ 에어코리아 측정이 1시간 간격이다. 더 자주 불러도 같은 값이 온다.
  "air-korea|rate(1 hour)|대기질 실측 (에어코리아 673지점)"
  # OBIS 원자료는 실시간 자료가 아니며 API 26회(13해역×통계·학명)를 부른다.
  # 매주 한 번이면 갱신에는 충분하고 공공 API에도 불필요한 부하를 주지 않는다.
  "obis-summary|cron(30 18 ? * SUN *)|OBIS 주요 5도 해역 생물 관측 기록 요약 (주 1회)"
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
    --cli-read-timeout 480 "/tmp/${FN}.out" >/dev/null 2>&1 \
    && echo "   ${FN}: $(head -c 160 "/tmp/${FN}.out")" \
    || echo "   ${FN}: 실행 실패 — 로그를 보세요"
done

echo
echo "확인:"
echo "  curl -s https://earthus.net/clouds/gk2a/meta.json | head -c 120"
echo "  aws events list-rules --region ${REGION} --query 'Rules[].{n:Name,s:ScheduleExpression}' --output table"

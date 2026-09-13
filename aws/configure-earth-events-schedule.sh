#!/usr/bin/env bash
# earth-events (3G Earth Event Assembler) — 원자료 보관 + PRIVATE/SHADOW 정본 조립
#
# ⚠️⚠️ 규칙 이름을 **여기 못 박는다**(`earthus-earth-events-30min`). `schedules.sh` 의 JOBS 루프는
#    규칙 이름을 `${FN}-schedule` 로 **만들어 내므로**, 이 함수를 거기 넣으면 기존 규칙을 그대로 둔 채
#    두 번째 규칙이 생기고 호출이 조용히 두 배가 된다(그 함정은 schedules.sh:94-101 에 적혀 있다).
#
# 주기를 producer 와 1:1 로 맞추는 이유
#   생산자 `earthus-gdelt-30min` = `cron(5,35 * * * ? *)` 가 `events/global.json` 을 **덮어쓴다.**
#   한 회차를 건너뛰면 그 회차의 원자료는 **영원히 사라진다** — 나중에 판정 기준이 바뀌어도
#   다시 계산할 재료가 없다. 그래서 48회/일을 그대로 따라간다.
#   10분 뒤에 도는 이유: 생산자 실측 소요가 7~8초다(2026-09-13, CloudWatch REPORT 8건).
#   10분이면 넉넉하고, 3시간 창 안이라 조립기의 신선도 문(창보다 오래되면 실패)도 통과한다.
#
# payload 를 상수로 주는 이유
#   조립기는 기본값이 dryRun 이고, 운영 쓰기에는 payload 의 allowLive 와 함수 환경변수
#   EARTH_EVENTS_ALLOW_LIVE_WRITE=1 이 **둘 다** 필요하다. 손으로 부른 빈 payload 가
#   운영에 쓰지 못하게 한 이중 문이다. 스케줄만 그 문을 명시적으로 지난다.
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
FUNCTION="earthus-earth-events"
RULE="earthus-earth-events-30min"
SCHEDULE='cron(15,45 * * * ? *)'

ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" \
        --query 'Configuration.FunctionArn' --output text)"

# 운영 쓰기 문을 지나는 상수 입력. Input 은 JSON 을 담은 **문자열**이다.
TARGETS="$(mktemp)"; trap 'rm -f "$TARGETS"' EXIT
cat > "$TARGETS" <<JSON
[{"Id":"1","Arn":"${ARN}","Input":"{\"mode\":\"LIVE\",\"dryRun\":false,\"allowLive\":true}"}]
JSON
if command -v cygpath >/dev/null 2>&1; then
  TARGETS_URI="file://$(cygpath -w "$TARGETS")"
else
  TARGETS_URI="file://$TARGETS"
fi

aws events put-rule --name "$RULE" --region "$REGION" \
  --schedule-expression "$SCHEDULE" \
  --description 'earthus · 3G 사건 조립 — 원자료 보관 + PRIVATE/SHADOW 정본 (생산자 10분 뒤)' \
  --state ENABLED >/dev/null

FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" \
           --targets "$TARGETS_URI" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }

# ⚠️⚠️ 이 권한을 빼면 규칙은 만들어지지만 **조용히 아무것도 안 한다.**
RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
  --statement-id "${RULE}-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 \
  || echo "   (권한 이미 있음)"

echo "✅ ${RULE} → ${FUNCTION} (${SCHEDULE})"

#!/usr/bin/env bash
# distribution — 배포 후보 생성 (하루 1회)
#
# ⚠️⚠️ 규칙 이름을 **여기 못 박는다**. `schedules.sh` 의 JOBS 루프는 이름을 `${FN}-schedule` 로
#    만들어 내므로, 이 함수를 거기 넣으면 규칙이 둘이 되어 호출이 조용히 두 배가 된다.
#
# ── 왜 하루 1회인가 (임의로 고른 숫자가 아니다) ──────────────────────────────
# ① `MAX_DAILY = 8` 이 제품 규칙이다 — `aws/distribution/handler.py:60`, 주석 "많이 만들어도
#    사람이 다 못 본다". 회귀 테스트가 값을 고정한다
#    (`aws/distribution/tests/test_upstream_and_index_safety.py:295`). 이름 그대로 **하루** 몫이다.
# ② 이 엔진은 **사람 검토용 DRAFT** 만 만든다. 자동 게시가 없고 `publicItems` 는 항상 0 이다.
#    병목은 계산이 아니라 사람의 검토이므로, 검토 주기보다 빠르게 돌릴 이유가 없다.
# ③ 더 자주 돌려도 **새 정보가 없다.** `docs/DISTRIBUTION_DEPLOYMENT_GAP.md:858-872` 실측 —
#    10분 주기는 같은 8건을 하루 144번 다시 만든다. 문서는 숫자만 주고 주기 결정을 제품에 남겼다.
# ④ 상류 비교: 후보의 재료는 lab 보고서·점수표이고 하루 단위보다 빠르게 바뀌지 않는다.
#    (뉴스 생산자 `earthus-gdelt-30min` 의 30분 주기는 이 엔진의 입력이 아니다.)
# ⑤ 같은 입력이면 `contentId` 가 같다(`CNT-<sha256 12hex>`, 내용 주소). 색인은 contentId 로
#    교체 병합하므로 하루 1회 반복이 색인을 부풀리지 않는다.
#
# 시각: 00:00 UTC = 09:00 KST. 검토하는 사람이 아침에 새 후보를 본다.
# 월 1~3일은 전월 점수표가 한 건 더 붙는다(`handler.py:228` `if d.day <= 3`) — 9건 / 10 PUT.
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
FUNCTION="distribution"
RULE="earthus-distribution-daily"
SCHEDULE='cron(0 0 * * ? *)'

ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" \
        --query 'Configuration.FunctionArn' --output text)"

aws events put-rule --name "$RULE" --region "$REGION" \
  --schedule-expression "$SCHEDULE" \
  --description 'earthus · 배포 후보 생성 하루 1회 (09:00 KST · DRAFT 만 · 자동 게시 없음)' \
  --state ENABLED >/dev/null

FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" \
           --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }

# ⚠️⚠️ 이 권한을 빼면 규칙은 만들어지지만 **조용히 아무것도 안 한다.**
RULE_ARN="$(aws events describe-rule --name "$RULE" --region "$REGION" --query Arn --output text)"
aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
  --statement-id "${RULE}-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 \
  || echo "   (권한 이미 있음)"

echo "✅ ${RULE} → ${FUNCTION} (${SCHEDULE})"

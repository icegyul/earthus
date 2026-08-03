#!/usr/bin/env bash
# air-state 를 매일 돌리는 스케줄을 만든다.
#
# ⚠️⚠️ **이게 없으면 "벗어났습니다" 는 영영 안 나온다.**
#    air-state 는 오늘 상태를 어제와 **견주어** 판정한다. 어제 기록이 없으면
#    비교 대상이 없어서 전이(들어섬/벗어남)를 영원히 못 낸다.
#    원고의 제목이 "드디어 이중 열돔에서 벗어난 한반도" 였다 — 그 문장은
#    이 스케줄이 이틀 돌고 난 뒤부터 나올 수 있다.
#
# ⚠️ 왜 사람이 직접 실행해야 하나
#    Claude Code 자동모드 분류기가 스케줄 생성(events/scheduler)을 막는다.
#    IAM 권한 문제가 아니라 도구 쪽 차단이라, 명령을 사람이 실행해야 한다.
#
# 시각  UTC 12:20 = KST 21:20
#    ⚠️ 밤 9시로 잡은 이유: 그날의 최고기온이 이미 지났고, 밤 최저는
#       아직 진행 중이라 **오늘 하루를 한 번에 판정할 수 있는 유일한 시간대**다.
#       자정에 돌리면 날짜가 넘어가 어느 날의 판정인지 흐려진다.

set -euo pipefail

FN=earthus-air-state
RULE=earthus-air-state-daily
REGION=${AWS_REGION:-us-east-2}

ARN=$(aws lambda get-function --function-name "$FN" --region "$REGION" \
        --query 'Configuration.FunctionArn' --output text)
echo "대상 Lambda: $ARN"

aws events put-rule --name "$RULE" --region "$REGION" \
  --schedule-expression 'cron(20 12 * * ? *)' \
  --description 'earthus 하루 한 번 대기 상태 판정 (KST 21:20)' \
  --state ENABLED

aws events put-targets --rule "$RULE" --region "$REGION" \
  --targets "Id=1,Arn=$ARN"

# ⚠️ 이 권한을 안 주면 규칙은 만들어지지만 **조용히 아무것도 안 한다.**
aws lambda add-permission --function-name "$FN" --region "$REGION" \
  --statement-id "${RULE}-invoke" \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "$(aws events describe-rule --name "$RULE" --region "$REGION" \
                    --query 'Arn' --output text)" 2>/dev/null \
  || echo "(권한이 이미 있음 — 넘어감)"

echo
echo "✅ 등록했습니다. 확인:"
aws events list-targets-by-rule --rule "$RULE" --region "$REGION" \
  --query 'Targets[].Arn' --output text

echo
echo "지금 한 번 바로 돌려 보려면:"
echo "  aws lambda invoke --function-name $FN --region $REGION /dev/stdout"

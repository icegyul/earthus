#!/usr/bin/env bash
# intel-rollup — 변화 창고(INTELLIGENCE-LAYER-PLAN P2(a)). archive/ 관측에서 1h·6h·24h·7d 차를 매시 굴린다.
#
# 왜 매시 20분인가 (rate(1 hour) 가 아니다)
#   archiver 가 매시 :05 에 archive/<dataset>/dt=…/hh=…/part.jsonl.gz 를 쓴다
#   (실측 2026-09-19: events/history.json 의 t 가 매시 :05, Last-Modified 17:05:56).
#   rate 는 규칙을 만든 시각에 따라 도는 분이 정해져 archiver 보다 먼저 돌 수 있다 —
#   그러면 '지금' 이 한 시간 늦은 값이 된다. :20 이면 archiver 가 끝난 뒤다(space-archive 가 :05 를 쓰는 것과 같은 방식).
#   EventBridge cron 은 UTC 다.
#
# 먼저 배포: bash aws/deploy-python.sh intel-rollup
#   ⚠️ deploy-python.sh 는 2048MB·300초로 만든다. 이 함수는 GET 수십 번·JSON 몇 MB 라 훨씬 적게 든다 —
#      필요하면 배포 뒤 --memory-size 를 낮춘다(이 스크립트는 건드리지 않는다).
# 확인: aws lambda invoke --function-name intel-rollup --payload '{"dryRun":true}' \
#         --cli-binary-format raw-in-base64-out /tmp/out.json && cat /tmp/out.json
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
export PYTHONUTF8=1
FUNCTION="intel-rollup"
RULE="earthus-intel-rollup"
SCHEDULE='cron(20 * * * ? *)'

ARN="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" \
        --query 'Configuration.FunctionArn' --output text)"
RULE_ARN="$(aws events put-rule --name "$RULE" --region "$REGION" \
  --schedule-expression "$SCHEDULE" \
  --description 'earthus · intel change rollup (archive/intel-change, private) 15 min after archiver' \
  --state ENABLED --query RuleArn --output text)"

aws lambda add-permission --function-name "$FUNCTION" --region "$REGION" \
  --statement-id "${RULE}-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true

FAILED="$(aws events put-targets --rule "$RULE" --region "$REGION" \
           --targets "Id=1,Arn=${ARN}" --query FailedEntryCount --output text)"
[ "$FAILED" = "0" ] || { echo "❌ target 연결 실패 ${FAILED}건" >&2; exit 1; }
echo "✅ ${RULE} → ${FUNCTION} (${SCHEDULE})"

#!/usr/bin/env bash
# 기후 시계열 4종(해수면온도·육상기온·한국 관측소·해빙) 일일 갱신 Lambda — aws/climatology → climatology-series
#
# 왜: build_*_series.py 는 손으로 돌리던 스크립트라 2026-07-27 이후 6주간 안 돌아갔고,
#     앱 그래프의 올해 선이 오늘 앞에서 끊겨 보였다. 이 함수가 매일 상류를 따라간다.
#
#   bash aws/deploy-climatology.sh          # 배포 + 4작업 즉시 실행 + 스케줄
#   INVOKE=0 bash aws/deploy-climatology.sh # 배포·스케줄만
#
# 순수 파이썬 + boto3(런타임 내장)뿐이라 휠 없이 파일 5개만 zip 한다 (deploy-argo.sh 와 같은 방식).
set -euo pipefail
export MSYS_NO_PATHCONV=1 PYTHONUTF8=1 PYTHONIOENCODING=utf-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/aws/climatology"
FN="climatology-series"
REGION="ap-northeast-2"
ACCOUNT="294951922100"
ROLE="arn:aws:iam::${ACCOUNT}:role/earthus-lambda-khoa-coast"
ENVV="Variables={CACHE_BUCKET=earthus-cache-kr,CACHE_REGION=us-east-2,PYTHONUTF8=1}"
export AWS_PROFILE="${AWS_PROFILE:-earthus-deploy}"
INVOKE="${INVOKE:-1}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
w() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

echo "== 1/4 패키징 =="
python - "$(w "$SRC")" "$(w "$TMP/fn.zip")" <<'PY'
import sys, zipfile, os
src, out = sys.argv[1], sys.argv[2]
files = ['handler.py', 'build_sst_series.py', 'build_land_series.py',
         'build_korea_series.py', 'build_seaice_series.py']
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(os.path.join(src, f), f)
print('   ', len(files), '파일 →', os.path.getsize(out), 'bytes')
PY
ZIPW="$(w "$TMP/fn.zip")"

echo "== 2/4 함수 =="
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" \
    --zip-file "fileb://$ZIPW" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" \
    --timeout 900 --memory-size 512 --environment "$ENVV" \
    --query 'LastModified' --output text >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  echo "   코드·설정 갱신"
else
  aws lambda create-function --function-name "$FN" --region "$REGION" \
    --runtime python3.12 --handler handler.handler --role "$ROLE" \
    --timeout 900 --memory-size 512 --zip-file "fileb://$ZIPW" --environment "$ENVV" \
    --query 'FunctionArn' --output text
  aws lambda wait function-active --function-name "$FN" --region "$REGION"
  echo "   새로 생성"
fi

echo "== 3/4 실행 =="
if [[ "$INVOKE" == "1" ]]; then
  for TASK in sst land korea seaice; do
    OUT="$TMP/out-$TASK.json"
    aws lambda invoke --function-name "$FN" --region "$REGION" --cli-read-timeout 900 \
      --cli-binary-format raw-in-base64-out --payload "{\"task\":\"$TASK\"}" "$(w "$OUT")" \
      --query 'StatusCode' --output text >/dev/null
    python - "$(w "$OUT")" "$TASK" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print('   ', sys.argv[2], json.dumps(d, ensure_ascii=False)[:300])
PY
  done
fi

echo "== 4/4 스케줄 =="
# 상류는 하루 한 번쯤 늘어난다(OISST·CPC 는 1~2일 지연). 매일 12시 KST(03 UTC)부터 15분 간격으로
# 하나씩 — 한 작업이 느려도 다른 셋을 물고 늘어지지 않게 규칙을 나눈다.
RULES=(
"earthus-climatology-sst|cron(0 3 * * ? *)|sst|일별 해수면온도 시계열 (OISST)"
"earthus-climatology-land|cron(15 3 * * ? *)|land|일별 육상기온 시계열 (CPC)"
"earthus-climatology-korea|cron(30 3 * * ? *)|korea|한국 관측소 일별 기온 (GHCN)"
"earthus-climatology-seaice|cron(45 3 * * ? *)|seaice|해빙 면적 (NSIDC)"
)
for ENTRY in "${RULES[@]}"; do
  IFS='|' read -r NAME SCHED TASK DESC <<< "$ENTRY"
  if aws events put-rule --name "$NAME" --region "$REGION" --schedule-expression "$SCHED" \
       --state ENABLED --description "earthus · $DESC" --query 'RuleArn' --output text >/dev/null 2>&1; then
    aws lambda add-permission --function-name "$FN" --region "$REGION" \
      --statement-id "${NAME}-invoke" --action lambda:InvokeFunction --principal events.amazonaws.com \
      --source-arn "arn:aws:events:${REGION}:${ACCOUNT}:rule/${NAME}" >/dev/null 2>&1 || true
    aws events put-targets --rule "$NAME" --region "$REGION" \
      --targets "[{\"Id\":\"1\",\"Arn\":\"arn:aws:lambda:${REGION}:${ACCOUNT}:function:${FN}\",\"Input\":\"{\\\"task\\\":\\\"${TASK}\\\"}\"}]" \
      --query FailedEntryCount --output text | sed 's/^/   실패 수 /'
    echo "   $NAME · $SCHED"
  else
    echo "   ⚠️ $NAME 규칙을 만들지 못했다(권한). 콘솔에서 만들어 $FN 에 {\"task\":\"$TASK\"} 로 걸 것."
  fi
done

echo
echo "완료 — 산출물:"
echo "  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/series/sst-daily.json"
echo "  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/wind/series/temp-daily.json"
echo "  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/wind/series/korea-daily.json"
echo "  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/series/seaice-daily.json"

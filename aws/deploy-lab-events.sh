#!/usr/bin/env bash
# LAB 분석 보고서 현상 8종 계산기 — aws/lab-events → Lambda lab-events (+ 3시간마다 실행)
#
# 왜: 태풍 밖의 보고서 종류는 색인(lab-report-index)만 있고 만드는 계산기가 없어 화면이 늘 0건이었다.
#
#   bash aws/deploy-lab-events.sh          # 배포 + 즉시 1회 실행 + 스케줄
#   INVOKE=0 bash aws/deploy-lab-events.sh
#
# 순수 파이썬 + boto3 뿐이라 파일 하나만 zip 한다 (deploy-climatology.sh 와 같은 방식).
# 실행 뒤 lab-report-index 도 한 번 불러 ocean/lab-reports.json 을 갱신한다.
set -euo pipefail
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/aws/lab-events"
FN="lab-events"
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
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(src, 'handler.py'), 'handler.py')
print('    handler.py →', os.path.getsize(out), 'bytes')
PY
ZIPW="$(w "$TMP/fn.zip")"

echo "== 2/4 함수 =="
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" --zip-file "fileb://$ZIPW" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" --timeout 900 --memory-size 1024 --environment "$ENVV" \
    --query 'LastModified' --output text >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  echo "   코드·설정 갱신"
else
  aws lambda create-function --function-name "$FN" --region "$REGION" --runtime python3.12 --handler handler.handler --role "$ROLE" \
    --timeout 900 --memory-size 1024 --zip-file "fileb://$ZIPW" --environment "$ENVV" --query 'FunctionArn' --output text
  aws lambda wait function-active --function-name "$FN" --region "$REGION"
  echo "   새로 생성"
fi

echo "== 3/4 실행 =="
if [[ "$INVOKE" == "1" ]]; then
  OUT="$TMP/out.json"
  aws lambda invoke --function-name "$FN" --region "$REGION" --cli-read-timeout 900 --payload '{}' "$(w "$OUT")" --query 'StatusCode' --output text >/dev/null
  python - "$(w "$OUT")" <<'PY'
import json, sys
print('   ', json.dumps(json.load(open(sys.argv[1], encoding='utf-8')), ensure_ascii=False)[:700])
PY
  aws lambda invoke --function-name lab-report-index --region "$REGION" --cli-read-timeout 300 --payload '{}' "$(w "$TMP/idx.json")" --query 'StatusCode' --output text >/dev/null \
    && echo "    색인 갱신: $(head -c 300 "$TMP/idx.json")"
fi

echo "== 4/4 스케줄 =="
# 원자료(USGS·SWPC·VAAC·에어코리아·Argo·SATCAT)는 3시간이면 충분히 따라간다. 색인은 10분 뒤에 따로 돈다.
RULES=(
"earthus-lab-events|cron(40 */3 * * ? *)|$FN|{}"
"earthus-lab-report-index|cron(50 */3 * * ? *)|lab-report-index|{}"
)
for ENTRY in "${RULES[@]}"; do
  IFS='|' read -r NAME SCHED TARGET PAYLOAD <<< "$ENTRY"
  if aws events put-rule --name "$NAME" --region "$REGION" --schedule-expression "$SCHED" --state ENABLED \
       --description "earthus · LAB 보고서 ($TARGET)" --query 'RuleArn' --output text >/dev/null 2>&1; then
    aws lambda add-permission --function-name "$TARGET" --region "$REGION" --statement-id "${NAME}-invoke" --action lambda:InvokeFunction \
      --principal events.amazonaws.com --source-arn "arn:aws:events:${REGION}:${ACCOUNT}:rule/${NAME}" >/dev/null 2>&1 || true
    aws events put-targets --rule "$NAME" --region "$REGION" \
      --targets "[{\"Id\":\"1\",\"Arn\":\"arn:aws:lambda:${REGION}:${ACCOUNT}:function:${TARGET}\",\"Input\":\"${PAYLOAD}\"}]" --query FailedEntryCount --output text | sed 's/^/   실패 수 /'
    echo "   $NAME · $SCHED → $TARGET"
  else
    echo "   ⚠️ $NAME 규칙을 만들지 못했다(권한)."
  fi
done
echo; echo "완료 — https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/lab-reports.json"

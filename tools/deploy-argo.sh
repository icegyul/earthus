#!/usr/bin/env bash
# GFS 1.0° 5일 예보 구름 프레임 Lambda 배포 — aws/argo-floats → gfs-cloud-forecast
#
# 네이티브 의존성이 없다(grib2lite 순수 파이썬). 그래서 휠을 끌어오지 않고 파일 두 개만 zip 한다.
# 스케줄(EventBridge)은 earthus-deploy 에 권한이 없어 여기서 만들지 않는다 — 콘솔에서 한 번 만들거나
# 권한을 열면 아래 SCHEDULE 블록을 켠다. 그전까지는 이 스크립트가 배포 직후 한 번 실행시킨다.
set -euo pipefail
export MSYS_NO_PATHCONV=1 PYTHONUTF8=1 PYTHONIOENCODING=utf-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/aws/argo-floats"
FN="argo-floats"
REGION="ap-northeast-2"
ROLE="arn:aws:iam::294951922100:role/earthus-lambda-khoa-coast"
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
print('   handler.py →', os.path.getsize(out), 'bytes')
PY
ZIPW="$(w "$TMP/fn.zip")"

echo "== 2/4 함수 =="
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" \
    --zip-file "fileb://$ZIPW" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" \
    --timeout 900 --memory-size 512 \
    --environment "Variables={CACHE_BUCKET=earthus-cache-kr,CACHE_REGION=us-east-2,ARGO_N_TRACK=60,ARGO_N_PROFILE=18}" \
    --query 'LastModified' --output text >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  echo "   코드·설정 갱신"
else
  aws lambda create-function --function-name "$FN" --region "$REGION" \
    --runtime python3.12 --handler handler.handler --role "$ROLE" \
    --timeout 900 --memory-size 512 --zip-file "fileb://$ZIPW" \
    --environment "Variables={CACHE_BUCKET=earthus-cache-kr,CACHE_REGION=us-east-2,ARGO_N_TRACK=60,ARGO_N_PROFILE=18}" \
    --query 'FunctionArn' --output text
  aws lambda wait function-active --function-name "$FN" --region "$REGION"
  echo "   새로 생성"
fi

echo "== 3/4 실행 =="
if [[ "$INVOKE" == "1" ]]; then
  OUT="$TMP/out.json"
  aws lambda invoke --function-name "$FN" --region "$REGION" --cli-read-timeout 330 \
    --payload '{}' "$(w "$OUT")" --query 'StatusCode' --output text
  python - "$(w "$OUT")" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print('   결과:', json.dumps(d, ensure_ascii=False)[:600])
PY
fi

echo "== 4/4 스케줄 =="
# Argo 는 플로트가 약 10일에 한 번 떠오른다. 6시간마다면 충분하고도 남는다.
RULE="earthus-argo-floats"
if aws events put-rule --name "$RULE" --region "$REGION"      --schedule-expression 'rate(6 hours)' --state ENABLED      --description 'Argo 플로트 궤적·수심단면 수집 (R-11)'      --query 'RuleArn' --output text >/dev/null 2>&1; then
  aws lambda add-permission --function-name "$FN" --region "$REGION"     --statement-id "${RULE}-invoke" --action lambda:InvokeFunction     --principal events.amazonaws.com     --source-arn "arn:aws:events:${REGION}:294951922100:rule/${RULE}" >/dev/null 2>&1 || true
  aws events put-targets --rule "$RULE" --region "$REGION"     --targets "Id=1,Arn=arn:aws:lambda:${REGION}:294951922100:function:${FN}" >/dev/null
  echo "   $RULE · rate(6 hours)"
else
  echo "   ⚠️ 규칙을 만들지 못했다(권한). 콘솔에서 $RULE 을 만들어 이 함수를 걸 것."
fi

echo
echo "완료 — 산출물: https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/argo-floats.json"

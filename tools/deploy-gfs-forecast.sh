#!/usr/bin/env bash
# GFS 1.0° 5일 예보 구름 프레임 Lambda 배포 — aws/gfs-cloud-forecast → gfs-cloud-forecast
#
# 네이티브 의존성이 없다(grib2lite 순수 파이썬). 그래서 휠을 끌어오지 않고 파일 두 개만 zip 한다.
# 스케줄(EventBridge)은 earthus-deploy 에 권한이 없어 여기서 만들지 않는다 — 콘솔에서 한 번 만들거나
# 권한을 열면 아래 SCHEDULE 블록을 켠다. 그전까지는 이 스크립트가 배포 직후 한 번 실행시킨다.
set -euo pipefail
export MSYS_NO_PATHCONV=1 PYTHONUTF8=1 PYTHONIOENCODING=utf-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/aws/gfs-cloud-forecast"
FN="gfs-cloud-forecast"
REGION="ap-northeast-2"
ROLE="arn:aws:iam::294951922100:role/earthus-lambda-khoa-coast"
export AWS_PROFILE="${AWS_PROFILE:-earthus-deploy}"
INVOKE="${INVOKE:-1}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
w() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

echo "== 1/3 패키징 =="
python - "$(w "$SRC")" "$(w "$TMP/fn.zip")" <<'PY'
import sys, zipfile, os
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('handler.py', 'grib2lite.py'):
        z.write(os.path.join(src, name), name)
print('   handler.py + grib2lite.py →', os.path.getsize(out), 'bytes')
PY
ZIPW="$(w "$TMP/fn.zip")"

echo "== 2/3 함수 =="
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" \
    --zip-file "fileb://$ZIPW" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" \
    --timeout 300 --memory-size 1024 \
    --environment "Variables={CACHE_BUCKET=earthus-cache-kr,CACHE_REGION=us-east-2,GFS_FC_PREFIX=clouds/gfs-fc}" \
    --query 'LastModified' --output text >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  echo "   코드·설정 갱신"
else
  aws lambda create-function --function-name "$FN" --region "$REGION" \
    --runtime python3.12 --handler handler.handler --role "$ROLE" \
    --timeout 300 --memory-size 1024 --zip-file "fileb://$ZIPW" \
    --environment "Variables={CACHE_BUCKET=earthus-cache-kr,CACHE_REGION=us-east-2,GFS_FC_PREFIX=clouds/gfs-fc}" \
    --query 'FunctionArn' --output text
  aws lambda wait function-active --function-name "$FN" --region "$REGION"
  echo "   새로 생성"
fi

echo "== 3/3 실행 =="
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

echo
echo "완료 — 매니페스트: https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/gfs-fc/manifest.json"
echo "  스케줄은 아직 없다. 콘솔 EventBridge 에서 rate(3 hours) 규칙을 $FN 에 붙이면 자동 갱신된다."

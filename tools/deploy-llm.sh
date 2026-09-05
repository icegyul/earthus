#!/usr/bin/env bash
# EARTHUS LLM 프록시 배포 — aws/earthus-llm/handler.py → Lambda earthus-llm + 함수 URL
#
# 키 취급 규칙 (이 저장소의 관례와 같다):
#   - GEMINI_API_KEY 는 **부르는 사람의 환경변수**에서만 읽는다. 인자로 받지 않는다.
#   - 값은 절대 화면에 찍지 않는다. 이름과 길이만 말한다.
#   - 환경변수가 없으면 Lambda에 이미 설정된 값을 **그대로 보존**한다 (덮어쓰지 않는다).
set -euo pipefail
export MSYS_NO_PATHCONV=1
# --verify-only: 배포 없이 배포 가드(함수 URL 인증·/api/ask)만 실행한다 — PHASE 2 PENDING 1 검증용
VERIFY_ONLY=0; [ "${1:-}" = "--verify-only" ] && VERIFY_ONLY=1
# Windows 콘솔 기본 코드페이지(cp949)가 한글·기호 출력에서 죽는다 — UTF-8로 고정한다
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/aws/earthus-llm"
FN="earthus-llm"
REGION="ap-northeast-2"
ROLE="arn:aws:iam::294951922100:role/earthus-lambda-khoa-coast"
ORIGIN="${ALLOW_ORIGIN:-https://earthus.net}"
MODELS="${GEMINI_MODELS:-gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite}"
export AWS_PROFILE="${AWS_PROFILE:-earthus-deploy}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ZIP="$TMP/fn.zip"

if [ "$VERIFY_ONLY" = "1" ]; then
  echo "== verify-only: 배포 생략, 가드만 실행 =="
else
echo "== 1/4 패키징 =="
# Windows 파이썬은 Git Bash 의 /tmp/... 경로를 못 연다. 먼저 Windows 경로로 바꿔 넘긴다.
ZIPW="$(cygpath -w "$ZIP" 2>/dev/null || echo "$ZIP")"
SRCW="$(cygpath -w "$SRC/handler.py" 2>/dev/null || echo "$SRC/handler.py")"
python - "$SRCW" "$ZIPW" <<'PY'
import sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(src, 'handler.py')
print('   handler.py 패키징 완료')
PY

exists=1
aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1 || exists=0

echo "== 2/4 함수 =="
if [[ $exists -eq 1 ]]; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" \
    --zip-file "fileb://$ZIPW" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  echo "   코드 갱신"
else
  aws lambda create-function --function-name "$FN" --region "$REGION" \
    --runtime python3.12 --handler handler.handler --role "$ROLE" \
    --timeout 60 --memory-size 256 --zip-file "fileb://$ZIPW" \
    --query 'FunctionArn' --output text
  aws lambda wait function-active --function-name "$FN" --region "$REGION"
  echo "   새로 생성"
fi

echo "== 3/4 환경변수 =="
# 지금 설정돼 있는 값을 먼저 읽어 병합한다. 키를 실수로 날리지 않기 위해서다.
CUR="$TMP/env.json"   # 아래 python 에는 cygpath 로 변환해 넘긴다
umask 077
aws lambda get-function-configuration --function-name "$FN" --region "$REGION" \
  --query 'Environment.Variables' --output json 2>/dev/null > "$CUR" || echo '{}' > "$CUR"

MERGED="$TMP/merged.json"
python - "$(cygpath -w "$CUR" 2>/dev/null || echo "$CUR")" "$(cygpath -w "$MERGED" 2>/dev/null || echo "$MERGED")" "$MODELS" "$ORIGIN" "$FN" <<'PY'
import json, os, sys
cur_path, out_path, model, origin, fn = sys.argv[1:6]
try:
    cur = json.load(open(cur_path, encoding='utf-8')) or {}
except Exception:
    cur = {}
if not isinstance(cur, dict):
    cur = {}
cur["GEMINI_MODELS"] = model
cur.pop("GEMINI_MODEL", None)   # 단수 이름은 더 이상 쓰지 않는다
cur['ALLOW_ORIGIN'] = origin
env_key = os.environ.get('GEMINI_API_KEY', '').strip()
if env_key:
    cur['GEMINI_API_KEY'] = env_key
    print(f"   GEMINI_API_KEY ← 이 셸의 환경변수 (길이 {len(env_key)})")
elif cur.get('GEMINI_API_KEY'):
    print(f"   GEMINI_API_KEY ← Lambda에 이미 있던 값 유지 (길이 {len(cur['GEMINI_API_KEY'])})")
else:
    print("   GEMINI_API_KEY 없음 — 프록시는 503으로 정직하게 거절합니다")
# --cli-input-json 은 API 입력 전체 형태를 요구한다 (Variables 만 주면 거절)
json.dump({'FunctionName': fn, 'Environment': {'Variables': cur}},
          open(out_path, 'w', encoding='utf-8'))
print("   설정된 이름:", ', '.join(sorted(cur.keys())))
PY

MERGEDW="$(cygpath -w "$MERGED" 2>/dev/null || echo "$MERGED")"
aws lambda update-function-configuration --function-name "$FN" --region "$REGION" \
  --cli-input-json "file://$MERGEDW" --query 'LastModified' --output text >/dev/null
aws lambda wait function-updated --function-name "$FN" --region "$REGION"

echo "== 4/4 함수 URL =="
# 브라우저는 CloudFront 의 /api/ask 를 부르고, CloudFront(OAC)가 SigV4 로 서명해 이 URL 을 부른다.
# 그래서 인증은 AWS_IAM 이어야 한다. NONE 으로 내리면 OAC 서명 요청이 403 으로 튕긴다 —
# 2026-09-05 배포 때 이 줄이 NONE 이라 운영 "지구에 묻기"가 3시간 죽어 있었다.
# 함수 정책(cloudfront-oac, FunctionUrlAuthType=AWS_IAM)은 CloudFront 쪽 설정과 짝이므로 여기서 건드리지 않는다.
URLCFG="--auth-type AWS_IAM --cors AllowOrigins=$ORIGIN,AllowMethods=POST,AllowHeaders=content-type,MaxAge=300"
if aws lambda get-function-url-config --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  URL="$(aws lambda update-function-url-config --function-name "$FN" --region "$REGION" $URLCFG --query 'FunctionUrl' --output text)"
else
  # shellcheck disable=SC2086
  URL="$(aws lambda create-function-url-config --function-name "$FN" --region "$REGION" $URLCFG --query 'FunctionUrl' --output text)"
  echo "   새 URL 은 CloudFront 오리진(OAC)에 연결하고, 함수 정책에 cloudfront-oac 문장(FunctionUrlAuthType=AWS_IAM)을 추가해야 한다"
fi

echo
echo "EARTHUS LLM 배포 완료"
echo "  함수 URL: $URL"
echo "  모델 후보: $MODELS · 허용 오리진: $ORIGIN"

fi   # VERIFY_ONLY

# ── 배포 가드(지시서 §14): 함수 URL 인증이 AWS_IAM 이 아니면 실패. /api/ask 가 CloudFront 를 거쳐 200 인지도 본다.
AUTH="$(aws lambda get-function-url-config --function-name "$FN" --region "$REGION" --query AuthType --output text)"
if [ "$AUTH" != "AWS_IAM" ]; then
  echo "❌ 배포 가드 FAIL — 함수 URL AuthType=$AUTH (CloudFront OAC 는 AWS_IAM 이어야 한다)"
  exit 1
fi
BODY='{"q":"hello","lang":"ko","layers":[{"id":"clouds","label":"clouds","badge":"OBSERVED","value":"south"}],"view":{"lat":35,"lon":128,"altKm":3000}}'
HASH="$(printf '%s' "$BODY" | sha256sum | cut -d' ' -f1)"
# MSYS_NO_PATHCONV=1 상태에선 /dev/null 이 리터럴로 넘어가 curl 이 exit 23 을 낸다 — 이 호출만 변환을 되살린다
CODE="$(env -u MSYS_NO_PATHCONV curl -s -o /dev/null -w '%{http_code}' -X POST "${ORIGIN}/api/ask" -H 'content-type: application/json' -H "x-amz-content-sha256: $HASH" --data-binary "$BODY" || echo 000)"
if [ "$CODE" != "200" ]; then
  echo "❌ 배포 가드 FAIL — ${ORIGIN}/api/ask HTTP $CODE (기대 200)"
  exit 1
fi
echo "✅ 배포 가드 PASS — AuthType=AWS_IAM · /api/ask 200"

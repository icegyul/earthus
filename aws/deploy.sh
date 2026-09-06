#!/usr/bin/env bash
# earthus — Lambda 배포 스크립트
#
#   ./deploy.sh celestrak-proxy
#
# 처음 실행하면 실행 역할과 함수를 만들고, 두 번째부터는 코드만 갱신한다.
set -euo pipefail

FN="${1:-celestrak-proxy}"
# 프로필 리전(us-east-2)을 따르면 서울 함수의 복사본이 생긴다 — deploy-lite/deploy-python 과 같이 서울로 못 박는다.
REGION="${REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$REGION"
BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"   # ⚠️ 버킷이 실제로 있는 리전 (Lambda 리전과 다를 수 있음)
ROLE="earthus-lambda-${FN}"
DIR="$(cd "$(dirname "$0")" && pwd)/${FN}"

[ -d "$DIR" ] || { echo "❌ ${DIR} 없음"; exit 1; }

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

echo "▸ 함수: ${FN}   리전: ${REGION}"

# ── 1. 실행 역할 ─────────────────────────────────────────────
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "▸ 역할 있음: ${ROLE}"
else
  echo "▸ 역할 생성: ${ROLE}"
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null

  # 로그 기록 권한
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  # 캐시 버킷 접근 (이 버킷만)
  aws iam put-role-policy --role-name "$ROLE" --policy-name cache-bucket \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
        \"Resource\":\"arn:aws:s3:::${BUCKET}/*\"
      }]
    }"

  echo "▸ 역할 전파 대기 (10초)"   # IAM 은 즉시 반영되지 않는다
  sleep 10
fi

# ── 2. 패키징 ────────────────────────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$DIR"/*.mjs "$TMP"/
# @aws-sdk/client-s3 는 Lambda Node.js 20+ 런타임에 기본 포함되어 있어 번들 불필요
# Windows(Git Bash)엔 zip 이 없다 — python 으로 묶는다. 실패하면 멈춘다.
if command -v zip >/dev/null 2>&1; then
  (cd "$TMP" && zip -qr function.zip .)
else
  python - "$(cygpath -w "$TMP" 2>/dev/null || echo "$TMP")" <<'PY'
import os, sys, zipfile
src = sys.argv[1]
with zipfile.ZipFile(os.path.join(src, "function.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            if f == "function.zip": continue
            full = os.path.join(root, f); z.write(full, os.path.relpath(full, src))
PY
fi
[ -s "$TMP/function.zip" ] || { echo "❌ 패키징 실패"; exit 1; }
ZIPFILE="$(cygpath -w "$TMP/function.zip" 2>/dev/null || echo "$TMP/function.zip")"
SIZE=$(du -h "$TMP/function.zip" | cut -f1)
echo "▸ 패키지: ${SIZE}"

# ── 3. 함수 생성 또는 갱신 ───────────────────────────────────
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  echo "▸ 코드 갱신"
  aws lambda update-function-code \
    --function-name "$FN" --zip-file "fileb://${ZIPFILE}" \
    --query 'LastModified' --output text
  # 코드 갱신이 끝나기 전에 설정을 바꾸면 ResourceConflictException 이 난다
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 8
  # ⚠️ --environment 는 합치지 않고 **통째로 덮어쓴다** — API 키가 날아간다.
  #    기존 값을 읽어 합쳐서 넘긴다. 값은 화면에 찍지 않는다.
  ENVCUR="$(mktemp)"; ENVNEW="$(mktemp)"; chmod 600 "$ENVCUR" "$ENVNEW"
  # Windows 파이썬·aws CLI 는 Git Bash 의 /tmp 경로를 못 연다 — Windows 경로로 바꿔 넘긴다
  ENVCURW="$(cygpath -w "$ENVCUR" 2>/dev/null || echo "$ENVCUR")"; ENVNEWW="$(cygpath -w "$ENVNEW" 2>/dev/null || echo "$ENVNEW")"
  aws lambda get-function-configuration --function-name "$FN" \
      --query 'Environment.Variables' --output json 2>/dev/null > "$ENVCUR" \
      || echo '{}' > "$ENVCUR"
  CUR="$ENVCURW" BKT="$BUCKET" BRG="$BUCKET_REGION" \
    python3 - "$ENVNEWW" <<'PY'
import json, os, sys
cur = json.load(open(os.environ["CUR"])) or {}
kept = [k for k in cur if k not in ("CACHE_BUCKET", "CACHE_REGION")]
cur["CACHE_BUCKET"] = os.environ["BKT"]
cur["CACHE_REGION"] = os.environ["BRG"]
json.dump({"Variables": cur}, open(sys.argv[1], "w"))
print("  · 기존 환경변수 보존: " + (", ".join(sorted(kept)) if kept else "(없음)"))
PY
  aws lambda update-function-configuration \
    --function-name "$FN" --timeout 300 --memory-size 1024 \
    --environment "file://$ENVNEWW" \
    --query 'LastModified' --output text >/dev/null
  rm -f "$ENVCUR" "$ENVNEW"
else
  echo "▸ 함수 생성"
  aws lambda create-function \
    --function-name "$FN" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://${ZIPFILE}" \
    --timeout 300 \
    --memory-size 1024 \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query 'FunctionArn' --output text
fi

# ── 4. 함수 URL (공개 엔드포인트) ────────────────────────────
if aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  URL=$(aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text)
else
  echo "▸ 함수 URL 생성"
  URL=$(aws lambda create-function-url-config \
    --function-name "$FN" --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["GET"],"MaxAge":86400}' \
    --query FunctionUrl --output text)
  # 인증 없는 호출 허용
  aws lambda add-permission --function-name "$FN" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal '*' --function-url-auth-type NONE >/dev/null
fi

echo ""
echo "✅ 배포 완료"
echo "   ${URL}"
echo ""
echo "   확인: curl -s '${URL}' | head -c 400"

# ── 배포 가드: us-east-2 에 같은 이름이 있으면 실패(삭제는 별도 승인)
if DUP="$(aws lambda get-function --function-name "$FN" --region us-east-2 --query 'Configuration.[FunctionArn,LastModified]' --output text 2>/dev/null)"; then
  echo "❌ 배포 가드 FAIL — us-east-2 에 복사본이 있다: $DUP"; exit 1
fi
echo "✅ 배포 가드 PASS — ${FN} 은 ${REGION} 에만 있다"

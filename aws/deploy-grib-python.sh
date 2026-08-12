#!/usr/bin/env bash
# ecCodes가 필요한 GRIB/BUFR Python Lambda 전용 배포.
# 사용: bash aws/deploy-grib-python.sh tpw-grid
#
# ⚠️ 일반 deploy-python.sh는 실행한 Mac의 wheel을 묶을 수 있다. Lambda는 Python 3.12
# Linux x86_64이므로 검증된 manylinux_2_28 wheel만 URL로 받아 패키징한다.
set -euo pipefail

FN="${1:?함수 폴더 이름이 필요합니다 (예: tpw-grid)}"
# TPW Lambda는 한국 공공 API·NOMADS outbound과 같은 서울 리전 운영 계약을 따른다.
# 로컬 AWS 기본 리전이 다르더라도 실수로 다른 리전에 함수를 만들지 않는다.
REGION="${AWS_REGION:-ap-northeast-2}"
BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"
PYVER="3.12"
MEMORY="${LAMBDA_MEMORY_MB:-1024}"
ROLE="earthus-lambda-${FN}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DIR="${ROOT}/${FN}"

[ -f "${DIR}/handler.py" ] || { echo "❌ ${DIR}/handler.py 없음"; exit 1; }
TIMEOUT=420
if [ -f "${DIR}/timeout-seconds.txt" ]; then
  TIMEOUT="$(tr -d '[:space:]' < "${DIR}/timeout-seconds.txt")"
fi
case "$TIMEOUT" in
  ''|*[!0-9]*) echo "❌ timeout-seconds.txt는 정수여야 합니다"; exit 1 ;;
esac

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
echo "▸ 함수: ${FN} · ${REGION} · timeout ${TIMEOUT}s · memory ${MEMORY}MB"

if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  sleep 10
fi

# ⚠️ TPW 함수는 공개 버킷 전체를 읽거나 쓸 이유가 없다. 산출물 한 개만 PutObject 한다.
# 역할이 이미 있어도 매 배포마다 이 경계를 수렴시켜 예전 광범위 정책이 남지 않게 한다.
aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name "$ROLE" --policy-name cache-bucket \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Action\":\"s3:PutObject\",
      \"Resource\":\"arn:aws:s3:::${BUCKET}/wind/tpw-ea.json\"
    }]
  }"

PKG_DIR="$(mktemp -d)"
ZIP_PATH="/tmp/${FN}-grib.zip"
trap 'rm -rf "$PKG_DIR" "$ZIP_PATH"' EXIT

python3 - "$PKG_DIR" <<'PY'
# -*- coding: utf-8 -*-
import io, json, sys, urllib.request, zipfile
target = sys.argv[1]

def grab(package, version, required):
    meta = json.load(urllib.request.urlopen(
        f"https://pypi.org/pypi/{package}/{version}/json", timeout=60))
    urls = [item["url"] for item in meta["urls"]
            if all(part in item["filename"] for part in required)
            and "aarch64" not in item["filename"] and "arm64" not in item["filename"]]
    if not urls:
        raise SystemExit(f"❌ {package} {version}: Linux x86_64 wheel 없음")
    print("  ·", urls[0].split("/")[-1])
    raw = urllib.request.urlopen(urls[0], timeout=300).read()
    zipfile.ZipFile(io.BytesIO(raw)).extractall(target)

grab("eccodes", "2.42.0", ["cp312", "manylinux_2_28", "x86_64"])
grab("numpy", "2.3.2", ["cp312", "manylinux", "x86_64"])
grab("cffi", "1.17.1", ["cp312", "manylinux", "x86_64"])
grab("attrs", "25.3.0", ["py3-none"])
grab("pycparser", "2.22", ["py3-none"])
grab("findlibs", "0.1.2", ["py3-none"])
PY

cp "${DIR}/handler.py" "${PKG_DIR}/handler.py"
(cd "$PKG_DIR" && zip -qr "$ZIP_PATH" .)
echo "▸ 패키지: 해제 $(du -sh "$PKG_DIR" | cut -f1) · 압축 $(du -h "$ZIP_PATH" | cut -f1)"

if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" \
    --zip-file "fileb://${ZIP_PATH}" --query LastModified --output text
  aws lambda wait function-updated --function-name "$FN" --region "$REGION" 2>/dev/null || sleep 8
  # --environment 는 통째로 교체된다. 미래에 추가된 비밀·운영 설정을 배포가 지우지 않도록
  # 기존 값을 읽어 CACHE_* 두 항목만 수렴시킨다. 값은 출력하지 않는다.
  ENV_CURRENT="$(mktemp)"
  ENV_NEXT="$(mktemp)"
  chmod 600 "$ENV_CURRENT" "$ENV_NEXT"
  aws lambda get-function-configuration --function-name "$FN" --region "$REGION" \
    --query 'Environment.Variables' --output json > "$ENV_CURRENT"
  CURRENT="$ENV_CURRENT" TARGET="$ENV_NEXT" CACHE_BUCKET="$BUCKET" CACHE_REGION="$BUCKET_REGION" \
    python3 - <<'PY'
# -*- coding: utf-8 -*-
import json, os
values = json.load(open(os.environ["CURRENT"], encoding="utf-8")) or {}
values["CACHE_BUCKET"] = os.environ["CACHE_BUCKET"]
values["CACHE_REGION"] = os.environ["CACHE_REGION"]
with open(os.environ["TARGET"], "w", encoding="utf-8") as stream:
    json.dump({"Variables": values}, stream)
print("  · 환경변수 이름 보존: " + ", ".join(sorted(values)))
PY
  aws lambda update-function-configuration --function-name "$FN" --region "$REGION" \
    --timeout "$TIMEOUT" --memory-size "$MEMORY" \
    --environment "file://${ENV_NEXT}" \
    --query LastModified --output text
  rm -f "$ENV_CURRENT" "$ENV_NEXT"
else
  aws lambda create-function --function-name "$FN" --region "$REGION" \
    --runtime "python${PYVER}" --role "$ROLE_ARN" --handler handler.handler \
    --zip-file "fileb://${ZIP_PATH}" --timeout "$TIMEOUT" --memory-size "$MEMORY" \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query FunctionArn --output text
fi

echo "✅ ${FN} 코드·timeout·memory·환경설정 반영"

#!/usr/bin/env bash
# EARTHUS 2.0 — tropical-intelligence Lambda deploy.
# Reuses the ecCodes wheel strategy already proven by deploy-ecmwf.sh.
set -euo pipefail

FN="tropical-intelligence"
REGION="$(aws configure get region)"
BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"
PYVER="3.12"
ROLE="earthus-lambda-${FN}"
DIR="$(cd "$(dirname "$0")" && pwd)/${FN}"

[ -n "$REGION" ] || { echo "❌ AWS region is not configured"; exit 1; }
[ -d "$DIR" ] || { echo "❌ ${DIR} 없음"; exit 1; }

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

echo "▸ 함수: ${FN}   리전: ${REGION}"

if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "▸ 새 역할 전파 대기"
  sleep 10
fi

# Always refresh the inline S3 policy because this Lambda needs ListBucket for
# run-to-run persistence, unlike the original ecmwf-ingest path.
aws iam put-role-policy --role-name "$ROLE" --policy-name cache-bucket \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:ListBucket\"],
        \"Resource\":\"arn:aws:s3:::${BUCKET}\",
        \"Condition\":{\"StringLike\":{\"s3:prefix\":[\"archive/tropical-intelligence/*\"]}}
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
        \"Resource\":\"arn:aws:s3:::${BUCKET}/*\"
      }
    ]
  }"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▸ Linux x86_64 ecCodes wheels 다운로드"
python3 - "$TMP" <<'PY'
import io, json, sys, urllib.request, zipfile
tmp = sys.argv[1]

def grab(pkg, ver, must):
    data = json.load(urllib.request.urlopen(
        f"https://pypi.org/pypi/{pkg}/{ver}/json", timeout=60))
    urls = [
        f["url"] for f in data["urls"]
        if all(piece in f["filename"] for piece in must)
        and "aarch64" not in f["filename"] and "arm64" not in f["filename"]
    ]
    if not urls:
        raise SystemExit(f"❌ {pkg} {ver}: wheel not found ({must})")
    print("  ·", urls[0].split("/")[-1])
    blob = urllib.request.urlopen(urls[0], timeout=300).read()
    zipfile.ZipFile(io.BytesIO(blob)).extractall(tmp)

grab("eccodes",   "2.42.0", ["cp312", "manylinux_2_28", "x86_64"])
grab("numpy",     "2.3.2",  ["cp312", "manylinux", "x86_64"])
grab("cffi",      "1.17.1", ["cp312", "manylinux", "x86_64"])
grab("attrs",     "25.3.0", ["py3-none"])
grab("pycparser", "2.22",   ["py3-none"])
grab("findlibs",  "0.1.2",  ["py3-none"])
PY

cp "$DIR/handler.py" "$TMP/"
python3 -m py_compile "$DIR/handler.py"
(cd "$TMP" && zip -qr "/tmp/${FN}.zip" .)

echo "▸ package: extracted $(du -sh "$TMP" | cut -f1), zip $(du -h "/tmp/${FN}.zip" | cut -f1)"

if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  echo "▸ 코드 갱신"
  aws lambda update-function-code --function-name "$FN" \
    --zip-file "fileb:///tmp/${FN}.zip" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 8
  aws lambda update-function-configuration --function-name "$FN" \
    --runtime "python${PYVER}" --handler handler.handler \
    --timeout 600 --memory-size 1024 \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 8
else
  echo "▸ 함수 생성"
  aws lambda create-function --function-name "$FN" \
    --runtime "python${PYVER}" --role "$ROLE_ARN" --handler handler.handler \
    --zip-file "fileb:///tmp/${FN}.zip" \
    --timeout 600 --memory-size 1024 \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query 'FunctionArn' --output text
fi

rm -f "/tmp/${FN}.zip"

echo
echo "✅ Lambda code deployed."
echo "   First verify manually before scheduling:"
echo "   aws lambda invoke --function-name ${FN} --cli-read-timeout 600 /tmp/tropical-intelligence.json"
echo "   cat /tmp/tropical-intelligence.json"
echo
echo "   Then inspect S3:"
echo "   s3://${BUCKET}/events/tropical-guidance-v2.json"
echo
echo "⚠️ Do not mark the UI provider READY until the Lambda response and generated S3 document are verified."

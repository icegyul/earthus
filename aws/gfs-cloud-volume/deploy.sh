#!/usr/bin/env bash
set -euo pipefail

: "${CACHE_BUCKET:?CACHE_BUCKET is required}"
: "${EARTHUS_LAMBDA_ROLE_ARN:?EARTHUS_LAMBDA_ROLE_ARN is required}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
CACHE_REGION="${CACHE_REGION:-}"
FUNCTION_NAME="${FUNCTION_NAME:-earthus-gfs-cloud-volume}"
RULE_NAME="${RULE_NAME:-earthus-gfs-cloud-volume-3h}"
SCHEDULE_EXPRESSION="${SCHEDULE_EXPRESSION:-rate(3 hours)}"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
PYTHON_ABI="cp${PYTHON_VERSION/./}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

for cmd in aws python3 zip; do command -v "$cmd" >/dev/null || { echo "$cmd required" >&2; exit 2; }; done

if [[ -z "$CACHE_REGION" ]]; then
  CACHE_REGION="$(aws s3api get-bucket-location --bucket "$CACHE_BUCKET" --query 'LocationConstraint' --output text 2>/dev/null || true)"
  case "$CACHE_REGION" in None|null|'') CACHE_REGION='us-east-1' ;; esac
fi
export CACHE_REGION

echo "Lambda region: $AWS_REGION"
echo "Cache region:  $CACHE_REGION"
echo "Host Python:   $(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
echo "Target Python: $PYTHON_VERSION / $PYTHON_ABI / manylinux_2_28_x86_64"

# Build for the Lambda runtime, not for the operator Mac.  The host may be Python 3.9,
# while the Lambda runtime is Python 3.12.  Pin the target ABI/platform explicitly and
# ignore host Requires-Python evaluation; pip still installs only binary cp312/Linux wheels.
python3 -m pip install \
  --disable-pip-version-check \
  --platform manylinux_2_28_x86_64 \
  --implementation cp \
  --python-version "$PYTHON_VERSION" \
  --abi "$PYTHON_ABI" \
  --ignore-requires-python \
  --only-binary=:all: \
  --target "$BUILD/package" \
  -r "$ROOT/requirements.txt"

cp "$ROOT/handler.py" "$BUILD/package/handler.py"
(
  cd "$BUILD/package"
  python3 - <<'PY'
import ast, pathlib
ast.parse(pathlib.Path('handler.py').read_text())
print('handler.py syntax PASS')
PY
  zip -qr "$BUILD/function.zip" .
)

if aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --zip-file "fileb://$BUILD/function.zip" >/dev/null
  aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
  aws lambda update-function-configuration \
    --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
    --runtime "python${PYTHON_VERSION}" --handler handler.lambda_handler \
    --timeout 180 --memory-size 1536 --ephemeral-storage Size=2048 \
    --environment "Variables={CACHE_BUCKET=$CACHE_BUCKET,CACHE_REGION=$CACHE_REGION,GFS_CLOUD_Z_LEVELS=32}" >/dev/null
else
  aws lambda create-function \
    --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
    --runtime "python${PYTHON_VERSION}" --handler handler.lambda_handler \
    --role "$EARTHUS_LAMBDA_ROLE_ARN" --zip-file "fileb://$BUILD/function.zip" \
    --timeout 180 --memory-size 1536 --ephemeral-storage Size=2048 \
    --environment "Variables={CACHE_BUCKET=$CACHE_BUCKET,CACHE_REGION=$CACHE_REGION,GFS_CLOUD_Z_LEVELS=32}" >/dev/null
fi
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

aws events put-rule --region "$AWS_REGION" --name "$RULE_NAME" --schedule-expression "$SCHEDULE_EXPRESSION" --state ENABLED >/dev/null
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
FUNCTION_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
RULE_ARN="arn:aws:events:${AWS_REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}"
aws events put-targets --region "$AWS_REGION" --rule "$RULE_NAME" --targets "Id=1,Arn=$FUNCTION_ARN" >/dev/null
aws lambda add-permission --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
  --statement-id "${RULE_NAME}-invoke" --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true

aws lambda invoke --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' "$BUILD/invoke.json" >/dev/null
cat "$BUILD/invoke.json"
python3 - "$BUILD/invoke.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
if r.get('statusCode') not in (None,200): raise SystemExit('GFS Lambda failed: '+str(r))
body=r.get('body')
if isinstance(body,str):
    try: b=json.loads(body)
    except Exception: b={}
    if b.get('ready') is False: raise SystemExit('GFS producer failed: '+str(b.get('error')))
print('GFS invoke response accepted')
PY
aws s3api head-object --region "$CACHE_REGION" --bucket "$CACHE_BUCKET" --key clouds/gfs/volume/east-asia/manifest.json >/dev/null
aws s3api head-object --region "$CACHE_REGION" --bucket "$CACHE_BUCKET" --key clouds/gfs/volume/east-asia/density.u8 >/dev/null

echo "GFS CLOUD VOLUME PRODUCER READY: $FUNCTION_NAME / $RULE_NAME"

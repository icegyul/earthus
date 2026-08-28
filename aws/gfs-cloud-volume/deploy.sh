#!/usr/bin/env bash
set -euo pipefail

# EARTHUS GFS cloud-volume Lambda deploy helper.
# Nothing is deployed unless the operator executes this script with explicit AWS credentials.
# Required:
#   CACHE_BUCKET=...
#   EARTHUS_LAMBDA_ROLE_ARN=arn:aws:iam::...:role/...
# Optional:
#   AWS_REGION=ap-northeast-2
#   FUNCTION_NAME=earthus-gfs-cloud-volume
#   RULE_NAME=earthus-gfs-cloud-volume-3h
#   SCHEDULE_EXPRESSION='rate(3 hours)'
#   PYTHON_VERSION=3.12

: "${CACHE_BUCKET:?CACHE_BUCKET is required}"
: "${EARTHUS_LAMBDA_ROLE_ARN:?EARTHUS_LAMBDA_ROLE_ARN is required}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
FUNCTION_NAME="${FUNCTION_NAME:-earthus-gfs-cloud-volume}"
RULE_NAME="${RULE_NAME:-earthus-gfs-cloud-volume-3h}"
SCHEDULE_EXPRESSION="${SCHEDULE_EXPRESSION:-rate(3 hours)}"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

command -v aws >/dev/null || { echo 'aws CLI required' >&2; exit 2; }
command -v python3 >/dev/null || { echo 'python3 required' >&2; exit 2; }

# Build Lambda-compatible manylinux wheels even when this script runs on macOS.
python3 -m pip install \
  --disable-pip-version-check \
  --platform manylinux_2_28_x86_64 \
  --implementation cp \
  --python-version "$PYTHON_VERSION" \
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
  aws lambda update-function-configuration \
    --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
    --runtime "python${PYTHON_VERSION}" --handler handler.lambda_handler \
    --timeout 180 --memory-size 1536 --ephemeral-storage Size=2048 \
    --environment "Variables={CACHE_BUCKET=$CACHE_BUCKET,CACHE_REGION=$AWS_REGION,GFS_CLOUD_Z_LEVELS=32}" >/dev/null
else
  aws lambda create-function \
    --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
    --runtime "python${PYTHON_VERSION}" --handler handler.lambda_handler \
    --role "$EARTHUS_LAMBDA_ROLE_ARN" --zip-file "fileb://$BUILD/function.zip" \
    --timeout 180 --memory-size 1536 --ephemeral-storage Size=2048 \
    --environment "Variables={CACHE_BUCKET=$CACHE_BUCKET,CACHE_REGION=$AWS_REGION,GFS_CLOUD_Z_LEVELS=32}" >/dev/null
fi
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

aws events put-rule --region "$AWS_REGION" --name "$RULE_NAME" --schedule-expression "$SCHEDULE_EXPRESSION" --state ENABLED >/dev/null
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
FUNCTION_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
RULE_ARN="arn:aws:events:${AWS_REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}"
aws events put-targets --region "$AWS_REGION" --rule "$RULE_NAME" --targets "Id=1,Arn=$FUNCTION_ARN" >/dev/null
aws lambda add-permission --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
  --statement-id "${RULE_NAME}-invoke" --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RULE_ARN" >/dev/null 2>&1 || true

# Run once now, then prove the generated manifest exists before declaring producer-ready.
aws lambda invoke --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --payload '{}' "$BUILD/invoke.json" >/dev/null
cat "$BUILD/invoke.json"
aws s3api head-object --region "$AWS_REGION" --bucket "$CACHE_BUCKET" --key clouds/gfs/volume/east-asia/manifest.json >/dev/null
aws s3api head-object --region "$AWS_REGION" --bucket "$CACHE_BUCKET" --key clouds/gfs/volume/east-asia/density.u8 >/dev/null

echo "GFS CLOUD VOLUME PRODUCER READY: $FUNCTION_NAME / $RULE_NAME"

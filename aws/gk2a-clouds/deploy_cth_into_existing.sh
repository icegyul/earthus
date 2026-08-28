#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
CACHE_REGION="${CACHE_REGION:-}"
FUNCTION_NAME="${FUNCTION_NAME:-gk2a-clouds}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for bin in aws python3 curl unzip zip; do command -v "$bin" >/dev/null || { echo "$bin required" >&2; exit 2; }; done

python3 - <<PY
import ast, pathlib
for name in ['cth_pipeline.py','combined_handler.py']:
    ast.parse((pathlib.Path(r'$ROOT')/name).read_text())
    print(name, 'syntax PASS')
PY

CODE_URL="$(aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --query 'Code.Location' --output text)"
curl -fsSL "$CODE_URL" -o "$WORK/current.zip"
unzip -q "$WORK/current.zip" -d "$WORK/package"
cp "$ROOT/handler.py" "$WORK/package/handler.py"
cp "$ROOT/cth_pipeline.py" "$WORK/package/cth_pipeline.py"
cp "$ROOT/combined_handler.py" "$WORK/package/combined_handler.py"
(
  cd "$WORK/package"
  zip -qr "$WORK/next.zip" .
)

aws lambda update-function-code --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --zip-file "fileb://$WORK/next.zip" >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --handler combined_handler.handler >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

if [[ -n "${CACHE_BUCKET:-}" ]]; then
  python3 - "$AWS_REGION" "$FUNCTION_NAME" "$CACHE_BUCKET" "$CACHE_REGION" "$WORK/env.json" <<'PY'
import json,subprocess,sys
region,name,bucket,cache_region,out=sys.argv[1:]
raw=subprocess.check_output(['aws','lambda','get-function-configuration','--region',region,'--function-name',name,'--query','Environment.Variables','--output','json'])
env=json.loads(raw or b'{}') or {}
env['CACHE_BUCKET']=bucket
if cache_region:
    env['CACHE_REGION']=cache_region
elif not env.get('CACHE_REGION'):
    env['CACHE_REGION']=region
open(out,'w').write(json.dumps({'Variables':env}))
PY
  aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --environment "file://$WORK/env.json" >/dev/null
  aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
fi

aws lambda invoke --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"cthOnly":true}' "$WORK/invoke.json" >/dev/null
cat "$WORK/invoke.json"

python3 - "$WORK/invoke.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
if r.get('cthReady') is not True:
    raise SystemExit('GK2A CTH diagnostic failed: '+str(r.get('cthError')))
print('GK2A CTH diagnostic PASS', (r.get('cth') or {}).get('validAt'))
PY

BUCKET="${CACHE_BUCKET:-$(aws lambda get-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --query 'Environment.Variables.CACHE_BUCKET' --output text)}"
[[ -n "$BUCKET" && "$BUCKET" != "None" ]] || { echo 'CACHE_BUCKET unresolved' >&2; exit 3; }
if [[ -z "$CACHE_REGION" ]]; then
  CACHE_REGION="$(aws lambda get-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --query 'Environment.Variables.CACHE_REGION' --output text 2>/dev/null || true)"
  case "$CACHE_REGION" in None|null|'') CACHE_REGION="$AWS_REGION" ;; esac
fi
aws s3api head-object --region "$CACHE_REGION" --bucket "$BUCKET" --key clouds/gk2a/cth/manifest.json >/dev/null
aws s3api head-object --region "$CACHE_REGION" --bucket "$BUCKET" --key clouds/gk2a/cth/grid.json >/dev/null

echo "GK2A REAL CTH PRODUCER READY: $FUNCTION_NAME"

#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
CACHE_REGION="${CACHE_REGION:-}"
FUNCTION_NAME="${FUNCTION_NAME:-gk2a-clouds}"
KMA_KEY_SOURCE_FUNCTION="${KMA_KEY_SOURCE_FUNCTION:-kma-fcst}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for bin in aws python3 curl unzip zip; do command -v "$bin" >/dev/null || { echo "$bin required" >&2; exit 2; }; done

python3 - <<PY
import ast, pathlib
for name in ['cth_pipeline.py','cth_pipeline_lcc.py','combined_handler.py']:
    ast.parse((pathlib.Path(r'$ROOT')/name).read_text())
    print(name, 'syntax PASS')
PY

CODE_URL="$(aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --query 'Code.Location' --output text)"
curl -fsSL "$CODE_URL" -o "$WORK/current.zip"
unzip -q "$WORK/current.zip" -d "$WORK/package"
cp "$ROOT/handler.py" "$WORK/package/handler.py"
cp "$ROOT/cth_pipeline.py" "$WORK/package/cth_pipeline.py"
cp "$ROOT/cth_pipeline_lcc.py" "$WORK/package/cth_pipeline_lcc.py"
cp "$ROOT/combined_handler.py" "$WORK/package/combined_handler.py"
(
  cd "$WORK/package"
  zip -qr "$WORK/next.zip" .
)

aws lambda update-function-code --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --zip-file "fileb://$WORK/next.zip" >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --handler combined_handler.handler >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

# Preserve every existing environment variable and ensure the CTH runtime has the same
# KMA API Hub credential already used by proven KMA collectors. The secret value is never printed.
KMA_SOURCE_USED="$(python3 - "$AWS_REGION" "$FUNCTION_NAME" "$KMA_KEY_SOURCE_FUNCTION" "${CACHE_BUCKET:-}" "$CACHE_REGION" "$WORK/env.json" <<'PY'
import json, subprocess, sys
region, target, preferred, bucket, cache_region, out = sys.argv[1:]

def env_of(name):
    try:
        raw = subprocess.check_output([
            'aws','lambda','get-function-configuration','--region',region,
            '--function-name',name,'--query','Environment.Variables','--output','json'
        ], stderr=subprocess.DEVNULL)
        return json.loads(raw or b'{}') or {}
    except Exception:
        return {}

env = env_of(target)
if bucket:
    env['CACHE_BUCKET'] = bucket
if cache_region:
    env['CACHE_REGION'] = cache_region
elif not env.get('CACHE_REGION'):
    env['CACHE_REGION'] = region

source_used = 'target-existing'
if not str(env.get('KMA_HUB_KEY') or '').strip():
    candidates=[]
    for name in [preferred,'kma-fcst','kma-normal','kma-radar','kma-upper','kma-warn','kma-aws']:
        if name and name not in candidates and name != target:
            candidates.append(name)
    key = ''
    for name in candidates:
        source_env = env_of(name)
        value = str(source_env.get('KMA_HUB_KEY') or '').strip()
        if value:
            key = value
            source_used = name
            break
    if not key:
        raise SystemExit('KMA_HUB_KEY was not found in existing KMA Lambda environments')
    env['KMA_HUB_KEY'] = key

open(out,'w').write(json.dumps({'Variables': env}))
print(source_used)
PY
)"
echo "KMA_HUB_KEY source: $KMA_SOURCE_USED (value hidden)"
aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --environment "file://$WORK/env.json" >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

aws lambda invoke --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"cthOnly":true}' "$WORK/invoke.json" >/dev/null
cat "$WORK/invoke.json"

python3 - "$WORK/invoke.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
if r.get('cthReady') is not True:
    raise SystemExit('GK2A CTH diagnostic failed: '+str(r.get('cthError')))
cth=r.get('cth') or {}
print('GK2A CTH diagnostic PASS', cth.get('validAt'), cth.get('sourceTransport'), cth.get('sourceId'), cth.get('geolocationMethod'))
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

#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
CACHE_REGION="${CACHE_REGION:-}"
FUNCTION_NAME="${FUNCTION_NAME:-gk2a-clouds}"
KMA_KEY_SOURCE_FUNCTION="${KMA_KEY_SOURCE_FUNCTION:-kma-fcst}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PY_BIN="$(command -v python3 || command -v python)"
# Windows(Git Bash): python·aws 는 Windows 실행파일이라 POSIX 경로(/d/...)를 못 읽는다.
# 이 둘에 넘기는 경로는 반드시 winpath 를 거친다 — 한쪽만 변환하면 서로 다른 파일을 본다.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
for bin in aws curl unzip; do command -v "$bin" >/dev/null || { echo "$bin required" >&2; exit 2; }; done
[ -n "$PY_BIN" ] || { echo "python required" >&2; exit 2; }

"$PY_BIN" - <<PY
import ast, pathlib
for name in ['cth_pipeline.py','cth_pipeline_lcc.py','combined_handler.py']:
    ast.parse((pathlib.Path(r'$(winpath "$ROOT")')/name).read_text(encoding='utf-8'))
    print(name, 'syntax PASS')
PY

CODE_URL="$(aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --query 'Code.Location' --output text)"
curl -fsSL "$CODE_URL" -o "$WORK/current.zip"
unzip -q "$WORK/current.zip" -d "$WORK/package"
cp "$ROOT/handler.py" "$WORK/package/handler.py"
cp "$ROOT/cth_pipeline.py" "$WORK/package/cth_pipeline.py"
cp "$ROOT/cth_pipeline_lcc.py" "$WORK/package/cth_pipeline_lcc.py"
cp "$ROOT/combined_handler.py" "$WORK/package/combined_handler.py"
# KMA 허브 호출 회계 — combined_handler/cth_pipeline 이 import 한다. 빠지면 Lambda 가 import 에서 죽는다.
SHARED="$(cd "$ROOT/.." && pwd)/_shared/kma_hub.py"
[ -f "$SHARED" ] || { echo "kma_hub.py not found: $SHARED" >&2; exit 2; }
cp "$SHARED" "$WORK/package/kma_hub.py"
"$PY_BIN" - "$(winpath "$WORK/package")" "$(winpath "$WORK/next.zip")" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, src).replace(os.sep, '/'))
PY

aws lambda update-function-code --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --zip-file "fileb://$(winpath "$WORK/next.zip")" >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --handler combined_handler.handler >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

# Preserve every existing environment variable and ensure the CTH runtime has the same
# KMA API Hub credential already used by proven KMA collectors. The secret value is never printed.
KMA_SOURCE_USED="$("$PY_BIN" - "$AWS_REGION" "$FUNCTION_NAME" "$KMA_KEY_SOURCE_FUNCTION" "${CACHE_BUCKET:-}" "$CACHE_REGION" "$(winpath "$WORK/env.json")" <<'PY'
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
aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --environment "file://$(winpath "$WORK/env.json")" >/dev/null
aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

aws lambda invoke --region "$AWS_REGION" --function-name "$FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"cthOnly":true}' "$(winpath "$WORK/invoke.json")" >/dev/null
cat "$WORK/invoke.json"

"$PY_BIN" - "$(winpath "$WORK/invoke.json")" <<'PY'
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

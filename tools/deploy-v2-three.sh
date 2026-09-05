#!/usr/bin/env bash
set -euo pipefail

# EARTHUS v2-three(Three.js 정본 지구) → earthus.net/v2 배포.
# 소스: prototype/v2-deploy (자체완결 번들 — vendor/assets/data 내부화, 경로 재작성 완료본)
# 대상: s3://earthus-cache-kr/app/v2/*  (CloudFront E193CZEBLWEB56, OriginPath /app)
# 기존 deploy-real-living-earth-v2.sh의 안전 가드(프로덕션 타겟 검증·루트 불변 증명)를 계승한다.
# 이전 Cesium v2를 되돌리려면 기존 스크립트를 다시 실행하면 된다.

# Windows Git Bash 픽스: AWS CLI 파이썬 UTF-8 강제(cp949 콘솔).
# 경로 변환 금지(MSYS_NO_PATHCONV)는 cloudfront --paths 호출에만 국한 — 전역이면 curl -o /tmp가 깨진다.
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
# 배포 전용 IAM 프로필 (earthus-deploy · 영구 키). 다른 프로필은 EARTHUS_AWS_PROFILE로 지정.
export AWS_PROFILE="${EARTHUS_AWS_PROFILE:-earthus-deploy}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prototype/v2-deploy"
BUCKET="${EARTHUS_APP_BUCKET:-earthus-cache-kr}"
S3_REGION="${EARTHUS_APP_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
DISTRIBUTION_ID="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-E193CZEBLWEB56}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://earthus.net}"

for cmd in aws curl python cmp grep; do
  command -v "$cmd" >/dev/null || { echo "$cmd required" >&2; exit 2; }
done
PY=python; command -v python3 >/dev/null && PY=python3

[[ -f "$SRC/index.html" ]] || { echo "missing $SRC/index.html — 번들을 먼저 빌드하세요" >&2; exit 2; }
for path in js/main.js js/ui-shell.js js/sim-ocean.js js/local-terrain.js js/intel-feed.js \
  vendor/three-r184.module.min.js vendor/three.core.min.js \
  assets/physical-earth/ne2-base-8192.jpg data/country-reference.json; do
  [[ -f "$SRC/$path" ]] || { echo "missing $SRC/$path" >&2; exit 2; }
done
grep -F '../vendor/three-r184.module.min.js' "$SRC/js/main.js" >/dev/null \
  || { echo 'bundle path rewrite check failed (vendor)' >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ROOT_ORIGIN="${PUBLIC_ORIGIN%/}"
for root_path in / /index.html; do
  safe_name="$(printf '%s' "$root_path" | sed 's#^/$#root#; s#^/##; s#/#_#g')"
  curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ROOT_ORIGIN$root_path" \
    -o "$TMP/root-before-$safe_name"
done

cat > "$TMP/v2-entry.html" <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/v2/"><title>EARTHUS V2</title></head><body><script>location.replace('/v2/')</script><a href="/v2/">EARTHUS V2</a><!-- EARTHUS_V2_ENTRY_REDIRECT --></body></html>
EOF

echo '== 1/5 Production target guard =='
aws sts get-caller-identity >/dev/null
aws cloudfront get-distribution --id "$DISTRIBUTION_ID" --output json > "$TMP/distribution.json"
"$PY" - "$TMP/distribution.json" "$BUCKET" <<'PYEOF'
import json,sys
j=json.load(open(sys.argv[1]))
c=j['Distribution']['DistributionConfig']
aliases=set((c.get('Aliases') or {}).get('Items') or [])
assert 'earthus.net' in aliases, f'earthus.net alias missing: {sorted(aliases)}'
origins=(c.get('Origins') or {}).get('Items') or []
want=sys.argv[2]+'.s3.us-east-2.amazonaws.com'
matched=[o for o in origins if o.get('DomainName')==want and o.get('OriginPath')=='/app']
assert matched, f'expected app origin not found: {want} /app'
print('PASS CloudFront target', j['Distribution']['Id'], want, '/app')
PYEOF

echo '== 2/5 Upload v2-deploy bundle =='
DEPLOY_FILES=()
while IFS= read -r path; do DEPLOY_FILES+=("$path"); done < <(
  cd "$SRC" && find . -type f | sed 's#^\./##' | sort
)

content_type(){
  case "$1" in
    *.html) echo 'text/html; charset=utf-8' ;;
    *.js|*.mjs) echo 'text/javascript; charset=utf-8' ;;
    *.css) echo 'text/css; charset=utf-8' ;;
    *.json) echo 'application/json; charset=utf-8' ;;
    *.svg) echo 'image/svg+xml' ;;
    *.png) echo 'image/png' ;;
    *.jpg|*.jpeg) echo 'image/jpeg' ;;
    *.txt) echo 'text/plain; charset=utf-8' ;;
    *) echo 'application/octet-stream' ;;
  esac
}

cache_control(){
  case "$1" in
    index.html) echo 'no-cache, max-age=0, must-revalidate' ;;
    js/*) echo 'public, max-age=60' ;;
    vendor/*|assets/*|data/*) echo 'public, max-age=86400, stale-while-revalidate=604800' ;;
    *) echo 'public, max-age=60' ;;
  esac
}

# 원격 목록을 한 번만 받아, 내용이 같은 파일은 건너뛴다.
# 왜: 파일마다 aws CLI를 새로 띄우면 180개에 15분이 걸려 반복 배포가 막힌다.
#     ETag는 단일 파트 업로드일 때 MD5와 같다. 멀티파트('-' 포함)는 크기만 비교한다.
#     FORCE_UPLOAD=1 이면 메타데이터(Content-Type·Cache-Control)까지 전부 다시 쓴다.
declare -A REMOTE_ETAG REMOTE_SIZE
if [[ "${FORCE_UPLOAD:-0}" != "1" ]]; then
  aws s3api list-objects-v2 --region "$S3_REGION" --bucket "$BUCKET" \
    --prefix "$PREFIX/v2/" --output json > "$TMP/remote-list.json" 2>/dev/null || echo '{}' > "$TMP/remote-list.json"
  while IFS=$'\t' read -r k sz et; do
    [[ -n "$k" ]] || continue
    REMOTE_ETAG["$k"]="$et"
    REMOTE_SIZE["$k"]="$sz"
  done < <("$PY" - "$TMP/remote-list.json" "$PREFIX/v2/" <<'PYEOF'
import json, sys
j = json.load(open(sys.argv[1]))
pre = sys.argv[2]
for o in j.get('Contents') or []:
    k = o['Key']
    if not k.startswith(pre):
        continue
    print(f"{k[len(pre):]}\t{o['Size']}\t{(o.get('ETag') or '').strip('\"')}")
PYEOF
)
fi

# 로컬 해시는 파이썬을 한 번만 띄워 전부 계산한다 (윈도우에서 프로세스 기동이 업로드보다 비싸다)
declare -A LOCAL_MD5 LOCAL_SIZE
while IFS=$'\t' read -r k sz md; do
  [[ -n "$k" ]] || continue
  LOCAL_MD5["$k"]="$md"
  LOCAL_SIZE["$k"]="$sz"
done < <("$PY" - "$SRC" <<'PYEOF'
import hashlib, os, sys
root = sys.argv[1]
for base, _dirs, files in os.walk(root):
    for name in files:
        p = os.path.join(base, name)
        rel = os.path.relpath(p, root).replace(os.sep, '/')
        with open(p, 'rb') as fh:
            data = fh.read()
        print(f"{rel}\t{len(data)}\t{hashlib.md5(data).hexdigest()}")
PYEOF
)

skipped=0
for path in "${DEPLOY_FILES[@]}"; do
  et="${REMOTE_ETAG[$path]:-}"
  if [[ -n "$et" ]]; then
    if [[ "$et" == *-* ]]; then
      [[ "${REMOTE_SIZE[$path]}" == "${LOCAL_SIZE[$path]}" ]] && { skipped=$((skipped+1)); continue; }
    else
      [[ "${LOCAL_MD5[$path]}" == "$et" ]] && { skipped=$((skipped+1)); continue; }
    fi
  fi
  aws s3 cp "$SRC/$path" "s3://$BUCKET/$PREFIX/v2/$path" \
    --region "$S3_REGION" \
    --content-type "$(content_type "$path")" \
    --cache-control "$(cache_control "$path")" \
    --only-show-errors
  echo "PASS wrote s3://$BUCKET/$PREFIX/v2/$path"
done
echo "SKIP 내용이 같아 건너뛴 파일 ${skipped}개 (전부 다시 쓰려면 FORCE_UPLOAD=1)"

for key in "$PREFIX/v2/index.html" "$PREFIX/v2/"; do
  aws s3api put-object \
    --region "$S3_REGION" --bucket "$BUCKET" --key "$key" \
    --body "$SRC/index.html" \
    --content-type 'text/html; charset=utf-8' \
    --cache-control 'no-cache, no-store, must-revalidate' >/dev/null
  echo "PASS wrote s3://$BUCKET/$key"
done
aws s3api put-object \
  --region "$S3_REGION" --bucket "$BUCKET" --key "$PREFIX/v2" \
  --body "$TMP/v2-entry.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'no-cache, no-store, must-revalidate' >/dev/null
echo "PASS wrote s3://$BUCKET/$PREFIX/v2"

echo '== 2b/5 Publish /Intelligence alias (menu-facing name; /v2 stays a hidden direct address) =='
# earth-switch.js 의 메뉴는 /v2 를 걸지 않고 /Intelligence 만 건다. 실제 자산은
# 그대로 /v2/ 에 있다 — 통째로 복제하지 않고, index.html 사본에 <base href="/v2/">
# 하나만 얹어서 상대경로(./js/main.js 등)가 항상 /v2/ 를 가리키게 만든다.
# <base> 가 문서의 기준 URI를 못박으므로, 슬래시 유무와 무관하게 세 키 모두
# 같은 바이트를 올려도 된다(=/v2 처럼 별도 리다이렉트 페이지가 필요 없다).
"$PY" - "$SRC/index.html" "$TMP/intelligence-alias.html" <<'PYEOF'
import sys
src, dst = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()
marker = '<head>'
i = html.find(marker)
assert i != -1, 'no <head> found to inject <base> after'
i += len(marker)
out = html[:i] + '\n<base href="/v2/">' + html[i:]
open(dst, 'w', encoding='utf-8').write(out)
PYEOF
for key in "$PREFIX/Intelligence" "$PREFIX/Intelligence/" "$PREFIX/Intelligence/index.html"; do
  aws s3api put-object \
    --region "$S3_REGION" --bucket "$BUCKET" --key "$key" \
    --body "$TMP/intelligence-alias.html" \
    --content-type 'text/html; charset=utf-8' \
    --cache-control 'no-cache, no-store, must-revalidate' >/dev/null
  echo "PASS wrote s3://$BUCKET/$key"
done

echo '== 3/5 S3 byte-for-byte proof (핵심 파일) =='
for path in index.html js/main.js vendor/three-r184.module.min.js data/country-reference.json; do
  mkdir -p "$TMP/remote/$(dirname "$path")"
  aws s3 cp "s3://$BUCKET/$PREFIX/v2/$path" "$TMP/remote/$path" --region "$S3_REGION" --only-show-errors
  cmp "$SRC/$path" "$TMP/remote/$path"
  echo "PASS s3://$BUCKET/$PREFIX/v2/$path"
done

echo '== 4/5 CloudFront V2-only invalidation =='
INV_ID="$(MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/v2' '/v2/' '/v2/index.html' '/v2/*' \
           '/Intelligence' '/Intelligence/' '/Intelligence/index.html' \
  --query 'Invalidation.Id' --output text)"
echo "CREATED invalidation $INV_ID"

echo '== 5/5 Public convergence + root unchanged =='
ORIGIN="${PUBLIC_ORIGIN%/}"
fetch_v2_marker(){
  local url="$1" out="$2"
  curl -fsS --max-time 20 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "$url" -o "$out" || return 1
  # 마커는 절대 바뀌지 않는 것으로 — 예전엔 <title>을 봤는데 제목을 고치자 배포가 헛 실패했다.
  grep -F 'id="scene"' "$out" >/dev/null \
    && grep -F './js/main.js?v=' "$out" >/dev/null \
    && grep -F "$(grep -o 'main\.js?v=[0-9]*' "$SRC/index.html" | head -1)" "$out" >/dev/null
}
PUBLIC_READY=0
for attempt in $(seq 1 60); do
  if fetch_v2_marker "$ORIGIN/v2/" "$TMP/v2-slash.html" \
    && fetch_v2_marker "$ORIGIN/v2/index.html" "$TMP/v2-index.html"; then
    PUBLIC_READY=1; break
  fi
  sleep 3
done
[[ "$PUBLIC_READY" == 1 ]] || { echo 'FAIL: public /v2/ has not converged to the new build' >&2; exit 4; }
echo "PASS $ORIGIN/v2/ -> v2-three HTML"

INTEL_READY=0
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ORIGIN/Intelligence/" -o "$TMP/intel-check.html" \
    && grep -F '<base href="/v2/">' "$TMP/intel-check.html" >/dev/null; then
    INTEL_READY=1; break
  fi
  sleep 3
done
[[ "$INTEL_READY" == 1 ]] || { echo 'FAIL: public /Intelligence/ has not converged' >&2; exit 4; }
echo "PASS $ORIGIN/Intelligence/ -> v2-three HTML (base href=/v2/)"

for path in /v2/js/main.js /v2/vendor/three-r184.module.min.js /v2/data/country-reference.json /v2/assets/brand/earthus-wordmark-white.svg; do
  curl -fsS --max-time 30 -H 'Cache-Control: no-cache' "$ORIGIN$path" -o "$TMP/pub-$(basename "$path")"
  echo "PASS $ORIGIN$path"
done

for root_path in / /index.html; do
  safe_name="$(printf '%s' "$root_path" | sed 's#^/$#root#; s#^/##; s#/#_#g')"
  curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ROOT_ORIGIN$root_path" -o "$TMP/root-after-$safe_name"
  cmp "$TMP/root-before-$safe_name" "$TMP/root-after-$safe_name"
  echo "PASS unchanged production root $root_path"
done

echo 'EARTHUS v2-three DEPLOYED: https://earthus.net/v2/  (menu-facing alias: https://earthus.net/Intelligence/)'

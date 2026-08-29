#!/usr/bin/env bash
set -euo pipefail

# EARTHUS V2 isolated static deploy + public truth verification.
# Scope is intentionally limited to prototype/v2 -> s3://earthus-cache-kr/app/v2*.
# It never syncs prototype/ root and never writes app/js or EARTHUS 1.0 root assets.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V2="$ROOT/prototype/v2"
BUCKET="${EARTHUS_APP_BUCKET:-earthus-cache-kr}"
S3_REGION="${EARTHUS_APP_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
DISTRIBUTION_ID="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-E193CZEBLWEB56}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://earthus.net}"

for cmd in aws curl python3 cmp grep; do
  command -v "$cmd" >/dev/null || { echo "$cmd required" >&2; exit 2; }
done

[[ -f "$V2/index.html" ]] || { echo "missing $V2/index.html" >&2; exit 2; }
for path in \
  js/real-living-earth.js \
  js/gk2a-cth-relief.js \
  js/gfs-cloud-volume.js \
  js/resource-tasks.js \
  js/loading-ui.js \
  css/loading.css
  do
    [[ -f "$V2/$path" ]] || { echo "missing $V2/$path" >&2; exit 2; }
  done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/v2-entry.html" <<'EOF'
<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=/v2/"><title>EARTHUS V2</title></head><body><script>location.replace('/v2/')</script><a href="/v2/">EARTHUS V2</a><!-- EARTHUS_V2_ENTRY_REDIRECT --></body></html>
EOF

echo '== 1/5 Production target guard =='
aws sts get-caller-identity >/dev/null
aws cloudfront get-distribution --id "$DISTRIBUTION_ID" --output json > "$TMP/distribution.json"
python3 - "$TMP/distribution.json" "$BUCKET" <<'PY'
import json,sys
j=json.load(open(sys.argv[1]))
d=j['Distribution']
c=d['DistributionConfig']
aliases=set((c.get('Aliases') or {}).get('Items') or [])
assert 'earthus.net' in aliases, f'earthus.net alias missing: {sorted(aliases)}'
origins=(c.get('Origins') or {}).get('Items') or []
want=sys.argv[2]+'.s3.us-east-2.amazonaws.com'
matched=[o for o in origins if o.get('DomainName')==want and o.get('OriginPath')=='/app']
assert matched, f'expected app origin not found: {want} /app'
print('PASS CloudFront target', d['Id'], want, '/app')
PY

echo '== 2/5 Upload V2 only =='
# No --delete: preserve any independently deployed V2 evidence/assets until explicitly audited.
aws s3 sync "$V2/" "s3://$BUCKET/$PREFIX/v2/" \
  --region "$S3_REGION" \
  --exclude '.DS_Store' \
  --cache-control 'public, max-age=60'

# CloudFront uses the S3 REST origin with OriginPath=/app. A request for /v2/
# therefore asks S3 for the literal key app/v2/. Put the real V2 HTML at all
# three entry keys so neither directory-index assumptions nor root error fallback
# can return EARTHUS 1.0.
for key in "$PREFIX/v2/index.html" "$PREFIX/v2/"; do
  aws s3api put-object \
    --region "$S3_REGION" \
    --bucket "$BUCKET" \
    --key "$key" \
    --body "$V2/index.html" \
    --content-type 'text/html; charset=utf-8' \
    --cache-control 'no-cache, no-store, must-revalidate' >/dev/null
  echo "PASS wrote s3://$BUCKET/$key"
done
aws s3api put-object \
  --region "$S3_REGION" \
  --bucket "$BUCKET" \
  --key "$PREFIX/v2" \
  --body "$TMP/v2-entry.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'no-cache, no-store, must-revalidate' >/dev/null
echo "PASS wrote s3://$BUCKET/$PREFIX/v2"

echo '== 3/5 S3 byte-for-byte proof =='
for path in \
  index.html \
  js/real-living-earth.js \
  js/gk2a-cth-relief.js \
  js/gfs-cloud-volume.js
  do
    mkdir -p "$TMP/remote/$(dirname "$path")"
    aws s3 cp "s3://$BUCKET/$PREFIX/v2/$path" "$TMP/remote/$path" --region "$S3_REGION" --only-show-errors
    cmp "$V2/$path" "$TMP/remote/$path"
    echo "PASS s3://$BUCKET/$PREFIX/v2/$path"
  done
aws s3 cp "s3://$BUCKET/$PREFIX/v2/" "$TMP/remote-v2-slash.html" --region "$S3_REGION" --only-show-errors
cmp "$V2/index.html" "$TMP/remote-v2-slash.html"
echo "PASS s3://$BUCKET/$PREFIX/v2/ is V2 HTML"

echo '== 4/5 CloudFront V2-only invalidation =='
# earthus-deploy can CreateInvalidation but currently cannot GetInvalidation.
# Do not call the waiter. Public-route convergence below is the actual acceptance gate.
INV_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/v2' '/v2/' '/v2/index.html' '/v2/*' \
  --query 'Invalidation.Id' --output text)"
echo "CREATED invalidation $INV_ID (GetInvalidation permission not required)"

echo '== 5/5 Public runtime + data proof =='
ORIGIN="${PUBLIC_ORIGIN%/}"

fetch_v2_marker(){
  local url="$1" out="$2"
  curl -fsS --max-time 20 -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "$url" -o "$out" || return 1
  grep -F 'EARTHUS 2.0 · Living Earth' "$out" >/dev/null \
    && grep -F './js/real-living-earth.js' "$out" >/dev/null
}

# Invalidation completion is verified by content, not by cloudfront:GetInvalidation.
PUBLIC_READY=0
for attempt in $(seq 1 45); do
  if fetch_v2_marker "$ORIGIN/v2/" "$TMP/v2-slash.html" \
    && fetch_v2_marker "$ORIGIN/v2/index.html" "$TMP/v2-index.html"; then
    PUBLIC_READY=1
    break
  fi
  sleep 2
done
if [[ "$PUBLIC_READY" != 1 ]]; then
  echo 'FAIL: public /v2/ or /v2/index.html is still not the deployed V2 HTML' >&2
  for path in /v2/ /v2/index.html; do
    echo "--- $ORIGIN$path" >&2
    curl -sS -D - -o "$TMP/diag.html" -H 'Cache-Control: no-cache' "$ORIGIN$path" | sed -n '1,20p' >&2 || true
    grep -oE '<title>[^<]+' "$TMP/diag.html" | head -1 >&2 || true
  done
  exit 4
fi
echo "PASS $ORIGIN/v2/ -> V2 HTML"
echo "PASS $ORIGIN/v2/index.html -> V2 HTML"

curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ORIGIN/v2" -o "$TMP/v2-noslash.html"
if grep -F 'EARTHUS_V2_ENTRY_REDIRECT' "$TMP/v2-noslash.html" >/dev/null || grep -F 'EARTHUS 2.0 · Living Earth' "$TMP/v2-noslash.html" >/dev/null; then
  echo "PASS $ORIGIN/v2 -> V2 entry"
else
  echo "FAIL $ORIGIN/v2 is not a V2 entry" >&2
  grep -oE '<title>[^<]+' "$TMP/v2-noslash.html" | head -1 >&2 || true
  exit 4
fi

for path in \
  /v2/js/real-living-earth.js \
  /v2/js/gk2a-cth-relief.js \
  /v2/js/gfs-cloud-volume.js
  do
    curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ORIGIN$path" -o "$TMP/$(basename "$path")"
    echo "PASS $ORIGIN$path"
  done

curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ORIGIN/clouds/gk2a/cth/manifest.json" -o "$TMP/cth.json"
curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "$ORIGIN/clouds/gfs/volume/east-asia/manifest.json" -o "$TMP/gfs.json"
python3 - "$TMP/cth.json" "$TMP/gfs.json" <<'PY'
import json,sys
cth=json.load(open(sys.argv[1])); gfs=json.load(open(sys.argv[2]))
assert cth.get('ready') is True and cth.get('synthetic') is False
assert cth.get('truthClass') == 'OBSERVED_DERIVED_OFFICIAL_L2'
assert cth.get('sourceTransport') == 'KMA_API_HUB'
assert cth.get('geolocationMethod') == 'kma-nmsc-ea-lcc-wgs84-official-2km'
assert gfs.get('ready') is True and gfs.get('production') is True and gfs.get('synthetic') is False
state=gfs.get('cloudState') or {}
assert state.get('truthClass') == 'MODELLED_NWP'
assert state.get('sourceId') == 'NOAA_NCEP_GFS_0P50_NOMADS'
assert (state.get('volume') or {}).get('densityReady') is True
assert (state.get('volume') or {}).get('verticalStructureReady') is True
print('PASS public truth manifests')
print('GK2A',cth.get('validAt'),cth.get('width'),cth.get('height'))
print('GFS',state.get('validAt'),gfs.get('dimensions'),gfs.get('byteLength'))
PY

echo 'EARTHUS V2 NETWORK ENTRY + STATIC + PUBLIC DATA: READY FOR BROWSER RENDER ACCEPTANCE'

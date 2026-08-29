#!/usr/bin/env bash
set -euo pipefail

# EARTHUS V2 isolated static deploy + public truth verification.
# Scope is intentionally limited to prototype/v2 -> s3://earthus-cache-kr/app/v2/.
# It never syncs prototype/ root and never writes app/js or EARTHUS 1.0 root assets.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V2="$ROOT/prototype/v2"
BUCKET="${EARTHUS_APP_BUCKET:-earthus-cache-kr}"
S3_REGION="${EARTHUS_APP_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
DISTRIBUTION_ID="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-E193CZEBLWEB56}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://earthus.net}"

for cmd in aws curl python3 cmp; do
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
# HTML must not remain stale while iterating on browser acceptance.
aws s3 cp "$V2/index.html" "s3://$BUCKET/$PREFIX/v2/index.html" \
  --region "$S3_REGION" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'no-cache, no-store, must-revalidate'

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

echo '== 4/5 CloudFront V2-only invalidation =='
INV_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/v2' '/v2/' '/v2/*' \
  --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$INV_ID"
echo "PASS invalidation $INV_ID"

echo '== 5/5 Public runtime + data proof =='
ORIGIN="${PUBLIC_ORIGIN%/}"
curl -fsS --max-time 30 "$ORIGIN/v2/" -o "$TMP/v2.html"
grep -F 'EARTHUS 2.0 · Living Earth' "$TMP/v2.html" >/dev/null
grep -F './js/real-living-earth.js' "$TMP/v2.html" >/dev/null
for path in \
  /v2/js/real-living-earth.js \
  /v2/js/gk2a-cth-relief.js \
  /v2/js/gfs-cloud-volume.js
  do
    curl -fsS --max-time 30 "$ORIGIN$path" -o "$TMP/$(basename "$path")"
    echo "PASS $ORIGIN$path"
  done

curl -fsS --max-time 30 "$ORIGIN/clouds/gk2a/cth/manifest.json" -o "$TMP/cth.json"
curl -fsS --max-time 30 "$ORIGIN/clouds/gfs/volume/east-asia/manifest.json" -o "$TMP/gfs.json"
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

echo 'EARTHUS V2 STATIC + PUBLIC DATA: READY FOR BROWSER RENDER ACCEPTANCE'

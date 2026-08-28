#!/usr/bin/env bash
set -euo pipefail

# EARTHUS V2 real-data producer closeout.
# Executes both real cloud producers, verifies S3 artifacts, and optionally verifies
# the public origin that the browser consumes. No synthetic fallback is generated.
#
# Required:
#   CACHE_BUCKET=...
#   EARTHUS_LAMBDA_ROLE_ARN=...   # only used when GFS Lambda must be created
#
# Optional:
#   AWS_REGION=ap-northeast-2
#   GK2A_FUNCTION_NAME=gk2a-clouds
#   GFS_FUNCTION_NAME=earthus-gfs-cloud-volume
#   PUBLIC_ORIGIN=https://earthus.net

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${CACHE_BUCKET:?CACHE_BUCKET is required}"
: "${EARTHUS_LAMBDA_ROLE_ARN:?EARTHUS_LAMBDA_ROLE_ARN is required}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
GK2A_FUNCTION_NAME="${GK2A_FUNCTION_NAME:-gk2a-clouds}"
GFS_FUNCTION_NAME="${GFS_FUNCTION_NAME:-earthus-gfs-cloud-volume}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"

for cmd in aws curl python3; do
  command -v "$cmd" >/dev/null || { echo "$cmd required" >&2; exit 2; }
done

export AWS_REGION CACHE_BUCKET EARTHUS_LAMBDA_ROLE_ARN

echo '== 1/4 GK2A CTH producer =='
FUNCTION_NAME="$GK2A_FUNCTION_NAME" \
  bash "$ROOT/aws/gk2a-clouds/deploy_cth_into_existing.sh"

echo '== 2/4 NOAA GFS volume producer =='
FUNCTION_NAME="$GFS_FUNCTION_NAME" \
  bash "$ROOT/aws/gfs-cloud-volume/deploy.sh"

echo '== 3/4 S3 truth artifacts =='
for key in \
  clouds/gk2a/cth/manifest.json \
  clouds/gk2a/cth/grid.json \
  clouds/gfs/volume/east-asia/manifest.json \
  clouds/gfs/volume/east-asia/density.u8
  do
    aws s3api head-object --region "$AWS_REGION" --bucket "$CACHE_BUCKET" --key "$key" >/dev/null
    printf 'PASS s3://%s/%s\n' "$CACHE_BUCKET" "$key"
  done

# Validate the truth flags from the generated manifests themselves.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
aws s3 cp "s3://$CACHE_BUCKET/clouds/gk2a/cth/manifest.json" "$TMP/cth.json" --region "$AWS_REGION" --only-show-errors
aws s3 cp "s3://$CACHE_BUCKET/clouds/gfs/volume/east-asia/manifest.json" "$TMP/gfs.json" --region "$AWS_REGION" --only-show-errors
python3 - "$TMP/cth.json" "$TMP/gfs.json" <<'PY'
import json,sys
cth=json.load(open(sys.argv[1])); gfs=json.load(open(sys.argv[2]))
assert cth.get('ready') is True and cth.get('synthetic') is False
assert cth.get('truthClass') == 'OBSERVED_DERIVED_OFFICIAL_L2'
assert cth.get('units') == 'm' and cth.get('validAt')
assert gfs.get('ready') is True and gfs.get('production') is True and gfs.get('synthetic') is False
state=gfs.get('cloudState') or {}
assert state.get('truthClass') == 'MODELLED_NWP'
assert state.get('sourceId') == 'NOAA_NCEP_GFS_0P50_NOMADS'
assert (state.get('volume') or {}).get('densityReady') is True
assert (state.get('volume') or {}).get('verticalStructureReady') is True
print('PASS manifest truth gates')
print('GK2A CTH',cth['validAt'],cth.get('width'),cth.get('height'),cth.get('geolocationMethod'))
print('GFS VOLUME',state['validAt'],gfs.get('dimensions'),gfs.get('byteLength'))
PY

echo '== 4/4 Public browser artifacts =='
if [[ -n "$PUBLIC_ORIGIN" ]]; then
  ORIGIN="${PUBLIC_ORIGIN%/}"
  for path in \
    /clouds/gk2a/cth/manifest.json \
    /clouds/gk2a/cth/grid.json \
    /clouds/gfs/volume/east-asia/manifest.json \
    /clouds/gfs/volume/east-asia/density.u8
    do
      curl -fsSI --max-time 20 "$ORIGIN$path" >/dev/null
      echo "PASS $ORIGIN$path"
    done
else
  echo 'SKIP public-origin verification: set PUBLIC_ORIGIN=https://earthus.net'
fi

echo 'REAL LIVING EARTH DATA PRODUCERS: READY'

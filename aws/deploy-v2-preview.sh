#!/usr/bin/env bash
# EARTHUS 2.0 scoped preview deployment — add-only. Does NOT sync/overwrite EARTHUS 1.0 root assets.
set -euo pipefail
BUCKET="${EARTHUS_BUCKET:-earthus-cache-kr}"
REGION="${EARTHUS_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V2="$ROOT/prototype/v2"
E2="$ROOT/prototype/js/earthus2"
[[ -f "$V2/index.html" ]] || { echo "missing $V2/index.html" >&2; exit 2; }
[[ -d "$E2" ]] || { echo "missing $E2" >&2; exit 2; }

echo "Scoped upload only: ${PREFIX}/v2 + ${PREFIX}/js/earthus2"
aws s3 sync "$V2" "s3://${BUCKET}/${PREFIX}/v2/" --region "$REGION" --cache-control 'public, max-age=60'
aws s3 sync "$E2" "s3://${BUCKET}/${PREFIX}/js/earthus2/" --region "$REGION" --cache-control 'public, max-age=60'

fix_type(){
  local base="$1" pattern="$2" type="$3"
  while IFS= read -r file; do
    local rel="${file#$ROOT/prototype/}"
    aws s3 cp "s3://${BUCKET}/${PREFIX}/${rel}" "s3://${BUCKET}/${PREFIX}/${rel}" \
      --region "$REGION" --metadata-directive REPLACE --content-type "$type" --cache-control 'public, max-age=60' >/dev/null
  done < <(find "$base" -type f -name "$pattern" | sort)
}
fix_type "$V2" '*.html' 'text/html; charset=utf-8'
fix_type "$V2" '*.css' 'text/css; charset=utf-8'
fix_type "$V2" '*.js' 'text/javascript; charset=utf-8'
fix_type "$E2" '*.js' 'text/javascript; charset=utf-8'
fix_type "$E2" '*.json' 'application/json; charset=utf-8'

if [[ -n "${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  aws cloudfront create-invalidation --distribution-id "$EARTHUS_CLOUDFRONT_DISTRIBUTION_ID" \
    --paths '/v2/*' '/js/earthus2/*' >/dev/null
  echo "CloudFront invalidation requested for /v2/* and /js/earthus2/*"
else
  echo "CloudFront distribution id not supplied; no invalidation was invented."
fi

echo "Upload finished. This is not a release PASS until tools/earthus2-v2/verify_v2_live.mjs passes."

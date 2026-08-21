#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUCKET="earthus-cache-kr"
APP_PREFIX="app"
DISTRIBUTION_ID="E193CZEBLWEB56"
REGION="us-east-2"

upload() {
  local public_path="$1" content_type="$2"
  local source_path="$REPO_ROOT/prototype/$public_path"
  [[ -f "$source_path" ]] || {
    printf 'Missing deployment source: %s\n' "$source_path" >&2
    exit 1
  }
  aws s3 cp "$source_path" "s3://$BUCKET/$APP_PREFIX/$public_path" \
    --region "$REGION" \
    --content-type "$content_type" \
    --cache-control 'no-cache' \
    --metadata-directive REPLACE \
    --only-show-errors
}

upload index.html 'text/html; charset=utf-8'
upload sw.js 'text/javascript; charset=utf-8'
upload css/tourism-flow.css 'text/css; charset=utf-8'
upload css/v8-shell.css 'text/css; charset=utf-8'
upload js/tourism-flow-contract.js 'text/javascript; charset=utf-8'
upload js/tourism-density-grid.js 'text/javascript; charset=utf-8'
upload js/tourism-density-labels.js 'text/javascript; charset=utf-8'
upload js/layers/tourism-flow.js 'text/javascript; charset=utf-8'
upload js/layers/registry.js 'text/javascript; charset=utf-8'
upload js/main.js 'text/javascript; charset=utf-8'
upload js/ui-tourism.js 'text/javascript; charset=utf-8'
upload js/ui-source.js 'text/javascript; charset=utf-8'
upload js/v8/provenance-dock.js 'text/javascript; charset=utf-8'

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/' '/index.html' '/sw.js' '/css/tourism-flow.css' '/css/v8-shell.css' \
    '/js/tourism-flow-contract.js' '/js/tourism-density-grid.js' \
    '/js/tourism-density-labels.js' '/js/layers/tourism-flow.js' \
    '/js/layers/registry.js' '/js/main.js' '/js/ui-tourism.js' '/js/ui-source.js' \
    '/js/v8/provenance-dock.js' \
  --output json

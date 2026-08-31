#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"
node --test tools/earthus2-v02/*.test.mjs
find prototype/js/earthus2/v02 -type f -name '*.js' -print0 | while IFS= read -r -d '' file; do
  node --check "$file"
done
node tools/earthus2-v02/generate_engine_waves.mjs docs/earthus-2.0/v02/engine-catalog.v02.json >/tmp/earthus-v02-waves.json
if [[ -f PACKAGE_MANIFEST.json ]]; then
  node tools/earthus2-v02/verify_package_manifest.mjs "$ROOT"
fi

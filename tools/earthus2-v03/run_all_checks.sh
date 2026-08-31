#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node --test "$ROOT/tools/earthus2-v02"/*.test.mjs
node --test "$ROOT/tools/earthus2-v03"/*.test.mjs
find "$ROOT/prototype/js/earthus2/v03" -name '*.js' -print0 | while IFS= read -r -d '' f; do node --check "$f"; done
node "$ROOT/tools/earthus2-v03/verify_v03_package.mjs"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node --test "$ROOT/tools/earthus2-v05"/*.test.mjs
find "$ROOT/prototype/js/earthus2/v05" -name "*.js" -print0 | while IFS= read -r -d "" f; do node --check "$f"; done

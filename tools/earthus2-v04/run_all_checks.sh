#!/usr/bin/env bash
set -euo pipefail
PKG="$(cd "$(dirname "$0")/../.." && pwd)"
# Previous foundation regression suites without old package-manifest checks
node --test "$PKG"/tools/earthus2-v02/*.test.mjs
find "$PKG/prototype/js/earthus2/v02" -name '*.js' -print0 | while IFS= read -r -d '' f; do node --check "$f" >/dev/null; done
node --test "$PKG"/tools/earthus2-v03/*.test.mjs
find "$PKG/prototype/js/earthus2/v03" -name '*.js' -print0 | while IFS= read -r -d '' f; do node --check "$f" >/dev/null; done
# v0.4 tests
for f in "$PKG"/tools/earthus2-v04/*.test.mjs; do node --test "$f"; done
# v0.4 syntax
find "$PKG/prototype/js/earthus2/v04" -name '*.js' -print0 | while IFS= read -r -d '' f; do node --check "$f" >/dev/null; done
node "$PKG/tools/earthus2-v04/verify_v04_package.mjs"

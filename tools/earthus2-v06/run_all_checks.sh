#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# v0.2-v0.4 broad regression; v0.5 and v0.6 focused checks
node --test "$ROOT"/tools/earthus2-v02/*.test.mjs
node --test "$ROOT"/tools/earthus2-v03/*.test.mjs
for f in "$ROOT"/tools/earthus2-v04/*.test.mjs; do node --test "$f"; done
node --test "$ROOT"/tools/earthus2-v05/*.test.mjs
node --test "$ROOT"/tools/earthus2-v06/*.test.mjs
find "$ROOT/prototype/js/earthus2/v02" "$ROOT/prototype/js/earthus2/v03" "$ROOT/prototype/js/earthus2/v04" "$ROOT/prototype/js/earthus2/v05" "$ROOT/prototype/js/earthus2/v06" -name '*.js' -print0 | while IFS= read -r -d '' f; do node --check "$f" >/dev/null; done

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node --test "$ROOT/tools/earthus2-v2"/*.test.mjs
for d in "$ROOT"/tools/earthus2-v02 "$ROOT"/tools/earthus2-v03 "$ROOT"/tools/earthus2-v04 "$ROOT"/tools/earthus2-v05 "$ROOT"/tools/earthus2-v06 "$ROOT"/tools/earthus2-v07 "$ROOT"/tools/earthus2-v08 "$ROOT"/tools/earthus2-v09 "$ROOT"/tools/earthus2-v10; do
  [[ -d "$d" ]] || continue
  mapfile -t tests < <(find "$d" -maxdepth 1 -type f -name '*.test.mjs' | sort)
  ((${#tests[@]})) && node --test "${tests[@]}"
done
while IFS= read -r f; do cp "$f" /tmp/earthus-v2-check.mjs; node --check /tmp/earthus-v2-check.mjs >/dev/null; done < <(find "$ROOT/prototype/js/earthus2" "$ROOT/prototype/v2" -name '*.js' -type f | sort)
python3 - <<'PY' "$ROOT/prototype/js/earthus2/config/wiring-manifest.v1.json" "$ROOT/prototype/js/earthus2/config/menu-composition-rules.v1.json"
import json,sys
for p in sys.argv[1:]:
    with open(p,encoding='utf-8') as f: json.load(f)
print('JSON contracts: PASS')
PY
echo "EARTHUS 2.0 accelerator + backend foundation checks: PASS"

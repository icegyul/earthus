#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
while IFS= read -r f; do cp "$f" /tmp/earthus-v2-check.mjs; node --check /tmp/earthus-v2-check.mjs >/dev/null; done < <(find prototype/js/earthus2 prototype/v2 -name '*.js' -type f | sort)
node --test tools/earthus2-v2/*.test.mjs
for d in tools/earthus2-v02 tools/earthus2-v03 tools/earthus2-v04 tools/earthus2-v05 tools/earthus2-v06 tools/earthus2-v07 tools/earthus2-v08 tools/earthus2-v09 tools/earthus2-v10; do
  [[ -d "$d" ]] || continue
  mapfile -t tests < <(find "$d" -maxdepth 1 -type f -name '*.test.mjs' | sort)
  ((${#tests[@]})) && node --test "${tests[@]}"
done
# Existing repository regressions are run if present. Never invent PASS for absent tests.
for f in tools/test_v8_*.mjs tools/test_tourism_*.mjs; do [[ -e "$f" ]] || continue; echo "Existing regression: $f"; node "$f"; done
if command -v git >/dev/null; then git diff --check; fi
echo "Repository checks complete. Browser/live/real-device evidence is still required before DONE."

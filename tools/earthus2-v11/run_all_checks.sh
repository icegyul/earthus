#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
while IFS= read -r f; do cp "$f" /tmp/earthus-v11-check.mjs; node --check /tmp/earthus-v11-check.mjs >/dev/null; done < <(find prototype/js/earthus2/v11 -name '*.js' -type f | sort)
node --test tools/earthus2-v11/*.test.mjs
python3 -c "import json; json.load(open('prototype/js/earthus2/v11/config/advanced-intelligence-capabilities.v1.json',encoding='utf-8')); print('v11 JSON contract: PASS')"
echo 'EARTHUS Advanced Intelligence Backend v1.0 checks: PASS'

#!/usr/bin/env bash
set -euo pipefail

# prototype/v2-three (개발 소스) → prototype/v2-deploy (자체완결 번들).
# deploy-v2-three.sh는 번들만 올리므로, 소스를 고치면 반드시 이 스크립트를 먼저 돌려야 한다.
# 재작성 규칙:
#   ../../vendor/            → ../vendor/            (vendor를 번들 안으로 복사)
#   ../../js/earthus2/v02/   → ../engine/            (v02 엔진 트리를 번들 안으로 복사)
#   ../v2/assets/ · ../data/ → ./assets/ · ./data/   (번들 루트 기준)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prototype/v2-three"
OUT="$ROOT/prototype/v2-deploy"
VENDOR="$ROOT/prototype/vendor"
ENGINE="$ROOT/prototype/js/earthus2/v02"

[[ -f "$SRC/index.html" ]] || { echo "missing $SRC/index.html" >&2; exit 2; }
[[ -d "$VENDOR" ]] || { echo "missing $VENDOR" >&2; exit 2; }
[[ -d "$ENGINE" ]] || { echo "missing $ENGINE" >&2; exit 2; }

# 인구 격자 목록은 항상 파일에서 다시 뽑는다 — 격자를 추가하고 목록을 잊으면 메뉴가 거짓말을 한다
if command -v node >/dev/null; then
  node "$ROOT/tools/build-popgrid-index.mjs"
fi

echo "== 1/4 소스 복사 =="
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$SRC"/. "$OUT"/
rm -f "$OUT/NEXT_STEPS.md"

echo "== 2/4 vendor · engine · 외부 자산 내부화 =="
mkdir -p "$OUT/vendor" "$OUT/engine" "$OUT/assets/physical-earth" "$OUT/data"
cp -r "$VENDOR"/. "$OUT/vendor"/
cp -r "$ENGINE"/. "$OUT/engine"/
# 소스가 문서 기준 상대경로로 밖을 참조하는 두 곳 — 번들 안으로 끌어온다
cp -r "$ROOT/prototype/v2/assets/physical-earth"/. "$OUT/assets/physical-earth"/
cp "$ROOT/prototype/data/country-reference.json" "$OUT/data/country-reference.json"

echo "== 3/4 경로 재작성 =="
while IFS= read -r -d '' f; do
  sed -i \
    -e 's#\.\./\.\./js/earthus2/v02/#../engine/#g' \
    -e "s#'\.\./\.\./js/earthus2/v02'#'../engine'#g" \
    -e 's#\.\./\.\./vendor/#../vendor/#g' \
    -e 's#\.\./v2/assets/#./assets/#g' \
    -e "s#'\.\./data/#'./data/#g" \
    -e 's#"\.\./data/#"./data/#g' \
    "$f"
done < <(find "$OUT/js" -name '*.js' -print0)

echo "== 4/4 번들 무결성 검사 =="
fail=0
# 번들 밖을 가리키는 상대 경로가 남아 있으면 프로덕션에서 403이 난다
leftover="$(grep -rn -E "\.\./\.\./|\.\./v2/|from '\.\./js/" "$OUT/js" || true)"
if [[ -n "$leftover" ]]; then
  echo "FAIL 번들 밖 참조가 남았습니다:" >&2
  printf '%s\n' "$leftover" >&2
  fail=1
fi
# import 대상 파일이 실제로 번들에 있는지 확인
python - "$OUT" <<'PYEOF'
import os, re, sys
root = sys.argv[1]
missing = []
pat = re.compile(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""")
for base, _dirs, files in os.walk(os.path.join(root, 'js')):
    for name in files:
        if not name.endswith('.js'):
            continue
        p = os.path.join(base, name)
        for spec in pat.findall(open(p, encoding='utf-8').read()):
            if not spec.startswith('.'):
                continue
            target = os.path.normpath(os.path.join(base, spec.split('?')[0]))
            if not os.path.exists(target):
                missing.append(f"{os.path.relpath(p, root)} -> {spec}")
if missing:
    print('FAIL 존재하지 않는 import:', file=sys.stderr)
    for m in missing:
        print('  ' + m, file=sys.stderr)
    sys.exit(1)
print('PASS 모든 상대 import가 번들 안에 있습니다')
PYEOF
[[ $fail -eq 0 ]] || exit 1

# index.html과 main.js의 캐시 버전이 소스와 같은지 (스테일 번들 방지)
src_v="$(grep -o 'main\.js?v=[0-9]*' "$SRC/index.html" | head -1)"
out_v="$(grep -o 'main\.js?v=[0-9]*' "$OUT/index.html" | head -1)"
[[ "$src_v" == "$out_v" ]] || { echo "FAIL 캐시 버전 불일치 $src_v vs $out_v" >&2; exit 1; }
echo "PASS 번들 준비 완료 ($out_v) → $OUT"

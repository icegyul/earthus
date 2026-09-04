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
    -e 's#\.\./\.\./js/aetherus/#./aetherus/#g' \
    -e 's#\.\./v2/assets/#./assets/#g' \
    -e "s#'\.\./data/#'./data/#g" \
    -e 's#"\.\./data/#"./data/#g' \
    "$f"
done < <(find "$OUT/js" -name '*.js' -print0)

# AETHERUS 정본 모듈 — 세 지구가 함께 쓰는 하나의 우주(prototype/js/aetherus/).
# ⚠️ 재작성이 **끝난 뒤에** 복사한다. 이 트리는 이미 번들 기준으로 맞는 경로를
#    쓰고 있어서, 위 sed 를 같이 맞으면 ../../vendor/ 가 ../vendor/ 로 바뀌어
#    js/aetherus/ 에서 한 칸 모자란 곳(js/vendor/)을 가리키게 된다.
# ⚠️ 번들 안에서도 소스와 **같은 깊이**(js/aetherus/)에 둔다 — core.js 가
#    ../../vendor/satellite-6.0.2.min.js 를 자기 모듈 URL 기준으로 찾기 때문이다.
mkdir -p "$OUT/js/aetherus"
cp -r "$ROOT/prototype/js/aetherus"/. "$OUT/js/aetherus"/
[[ -f "$OUT/js/aetherus/core.js" ]] || { echo 'FAIL aetherus 정본 모듈 복사 실패' >&2; exit 1; }
grep -F "'./aetherus/layer-three.js'" "$OUT/js/aetherus-link.js" >/dev/null   || { echo 'FAIL aetherus 경로 재작성 확인 실패' >&2; exit 1; }

# v02 말고 다른 엔진 갈래(v03~v11 등)를 불러오는 파일이 새로 들어올 수 있다.
# v02만 재작성하던 탓에 v11 import가 번들 밖으로 새어 운영이 죽었다(2026-09-03).
# → 참조된 갈래를 찾아 그 트리를 번들 안으로 복사하고 경로를 바꾼다.
vers="$(grep -rhoE '\.\./\.\./js/earthus2/[A-Za-z0-9_-]+/' "$OUT/js" 2>/dev/null \
  | sed -E 's#.*/earthus2/([^/]+)/#\1#' | sort -u || true)"
for v in $vers; do
  src_tree="$ROOT/prototype/js/earthus2/$v"
  if [[ ! -d "$src_tree" ]]; then
    echo "FAIL 참조된 엔진 갈래가 없습니다: $v" >&2
    exit 1
  fi
  rm -rf "$OUT/engine-$v"
  cp -r "$src_tree" "$OUT/engine-$v"
  while IFS= read -r -d '' f; do
    sed -i -e "s#\.\./\.\./js/earthus2/$v/#../engine-$v/#g" "$f"
  done < <(find "$OUT/js" -name '*.js' -print0)
  echo "   엔진 갈래 $v 내부화 → engine-$v/"
done

echo "== 4/4 번들 무결성 검사 =="
fail=0
# 번들 밖을 가리키는 상대 경로가 남아 있으면 프로덕션에서 403이 난다.
# ⚠️ js/ 바로 아래 파일 기준의 규칙이다. js/aetherus/ 는 한 칸 더 깊어서
#    ../../vendor/ 가 번들 안(vendor/)을 가리킨다 — 정본 모듈을 소스와 같은
#    깊이에 두는 이유다. 그 트리는 아래에서 따로, 실제 파일 존재로 검사한다.
leftover="$(grep -rn -E "\.\./\.\./|\.\./v2/|from '\.\./js/" "$OUT/js" --exclude-dir=aetherus || true)"
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
# 실패는 마지막 줄에 다시 찍는다 — tail로 잘라 봐도 놓치지 않게.
# (호출부에서 `build | tail -1 && deploy` 로 이으면 파이프 종료코드가 실패를 삼킨다)
# AETHERUS 정본 모듈은 자기 모듈 URL 기준으로 vendor 를 찾는다 —
# 경로 규칙 대신 **그 자리에 파일이 실제로 있는지**로 확인한다.
for rel in $(grep -rhoE "\'\.\.\/\.\.\/[^\']+\'" "$OUT/js/aetherus" | tr -d "\'" | sort -u); do
  target="$OUT/js/aetherus/$rel"
  [[ -f "$(python -c "import os,sys;print(os.path.normpath(sys.argv[1]))" "$target")" ]] || { echo "FAIL aetherus 정본 모듈이 번들 밖을 봅니다: $rel" >&2; fail=1; }
done
[[ $fail -ne 0 ]] || echo "PASS aetherus 정본 모듈 참조가 번들 안에 있습니다"

if [[ $fail -ne 0 ]]; then
  echo "FAIL 번들 무결성 검사 실패 — 배포하면 안 됩니다" >&2
  exit 1
fi

# index.html과 main.js의 캐시 버전이 소스와 같은지 (스테일 번들 방지)
src_v="$(grep -o 'main\.js?v=[0-9]*' "$SRC/index.html" | head -1)"
out_v="$(grep -o 'main\.js?v=[0-9]*' "$OUT/index.html" | head -1)"
[[ "$src_v" == "$out_v" ]] || { echo "FAIL 캐시 버전 불일치 $src_v vs $out_v" >&2; exit 1; }
echo "PASS 번들 준비 완료 ($out_v) → $OUT"

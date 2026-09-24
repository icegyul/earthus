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
# FOR ME 공용 부품(v1·v2 같이 씀) — 소스는 prototype/js/ 에 있고 v2 는 ../../js/ 로 읽는다.
# 번들 안으로 복사하고(js/shared/) 아래 3/4 에서 경로를 ./shared/ 로 바꾼다. (지시서 v2.0 STEP 2, 2026-09-07)
mkdir -p "$OUT/js/shared"
cp "$ROOT/prototype/js/for-me-row.js" "$ROOT/prototype/js/usage.js" "$OUT/js/shared/"
# 요금 판정 정본(access-mode.js) — Intelligence 띠(intel-strip.js, 2026-09-20 P1)가 잠금 판정을 여기서 한다.
# 사본을 만들지 않고 v1 과 같은 파일을 싣는다(import 없음 · 순수 함수).
cp "$ROOT/prototype/js/access-mode.js" "$OUT/js/shared/"
# (2026-09-24) 앱(TWA) 준비 — 앱 안 판정(app-context.js)과 뒤로 단추(back-close.js)도 v1 과 같은 파일을 싣는다
#   (지시서 §3-4 · §3-8-1). 둘 다 import 없는 순수 모듈이다. 사본을 따로 만들면 v1·v2 판정이 갈라진다.
# (2026-09-24 정정) back-close.js 는 이제 ./app-context.js?v=2 를 import 한다(웹 탭 무동작 판정, PD 결정). 둘이 같은 shared/ 에
#   있어야 그 상대 경로가 풀리고, v2 main.js 의 ./shared/app-context.js?v=2 와 같은 주소(한 벌)가 된다.
cp "$ROOT/prototype/js/app-context.js" "$ROOT/prototype/js/back-close.js" "$OUT/js/shared/"
# (2026-09-24, Phase 2) v2 잠금 카드 → v1 구독 화면 주소 규칙(subscribe-route.js). ./access-mode.js 를 import 하므로
#   access-mode.js 와 같은 shared/ 에 둔다 — v2 의 ./shared/access-mode.js 와 같은 주소(한 벌)가 된다.
cp "$ROOT/prototype/js/subscribe-route.js" "$OUT/js/shared/"
# EARTHUS 아이콘 시스템 — v1·v2 공용. 표(earthus-icons.js)도 그림(assets/earthus-icons/)도 한 벌뿐이다.
# ⚠️ shared/ 가 아니라 js/ 바로 아래에 둔다. 모듈이 그림 위치를 import.meta.url 기준
#    '../assets/earthus-icons/' 로 풀기 때문이다 — js/ 에 있어야 그게 번들 루트의 assets/ 를
#    가리킨다. shared/ 에 두면 한 칸 깊어져 '../../' 가 필요한데, 4/4 무결성 검사가
#    js/ 바로 아래의 '../../' 를 번들 밖 참조로 보고 배포를 막는다(실제로 한 번 막혔다).
cp "$ROOT/prototype/js/earthus-icons.js" "$OUT/js/"
mkdir -p "$OUT/assets/earthus-icons"
cp -r "$ROOT/prototype/assets/earthus-icons"/. "$OUT/assets/earthus-icons"/

echo "== 3/4 경로 재작성 =="
while IFS= read -r -d '' f; do
  sed -i \
    -e 's#\.\./\.\./js/earthus2/v02/#../engine/#g' \
    -e "s#'\.\./\.\./js/earthus2/v02'#'../engine'#g" \
    -e 's#\.\./\.\./vendor/#../vendor/#g' \
    -e 's#\.\./\.\./js/aetherus/#./aetherus/#g' \
    -e 's#\.\./\.\./js/for-me-row\.js#./shared/for-me-row.js#g' \
    -e 's#\.\./\.\./js/usage\.js#./shared/usage.js#g' \
    -e 's#\.\./\.\./js/access-mode\.js#./shared/access-mode.js#g' \
    -e 's#\.\./\.\./js/app-context\.js#./shared/app-context.js#g' \
    -e 's#\.\./\.\./js/back-close\.js#./shared/back-close.js#g' \
    -e 's#\.\./\.\./js/subscribe-route\.js#./shared/subscribe-route.js#g' \
    -e 's#\.\./\.\./js/earthus-icons\.js#./earthus-icons.js#g' \
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
# js/research/ 도 한 칸 더 깊어서(js/research/) ../../data·../../vendor 가 번들 안(data/·vendor/)을 가리킨다 —
# aetherus 와 같은 이유로 예외. 대상 파일은 아래 python 검사가 실제 존재로 확인한다. (2026-09-07)
leftover="$(grep -rn -E "\.\./\.\./|\.\./v2/|from '\.\./js/" "$OUT/js" --exclude-dir=aetherus --exclude-dir=research || true)"
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

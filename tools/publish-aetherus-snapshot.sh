#!/usr/bin/env bash
set -euo pipefail

# AETHERUS 궤도 인텔리전스 — S3 스냅샷 발행 (PD 결정: ① 상시 서버 없이 스냅샷)
#
# 로컬(또는 어디든)에서 도는 AETHERUS FastAPI를 호출해 결과를 정적 JSON으로 만들어
# s3://earthus-cache-kr/app/aetherus/ (정본) 와 app/v2/aetherus/ (호환) 두 곳에 올린다.
# 세 지구(EARTHUS / · Intelligence /v2 · WONDER /v3)가 모두 같은 출처(/aetherus/*)로
# 읽으므로 CORS가 필요 없고, 상시 가동 서버·DB 비용이 들지 않는다.
#
# 무엇을 발행하는가 (정직성 기준):
#  - conjunctions.json : 근접사건. TCA가 미래라 스냅샷으로도 유효하다 — 이 기능의 핵심 가치.
#  - status.json       : 정본 카탈로그 현황(객체 수·소스 신선도). 시각과 함께 그대로 쓴다.
#  - snapshot.json     : 위치 스냅샷. ⚠️ LEO는 초당 7.5km 이동하므로 위치는 즉시 낡는다.
#                        manifest.generated_at 을 근거로 프런트가 "N분 전 스냅샷"으로 표시하고,
#                        오래되면 위치를 그리지 않아야 한다. 실시간인 척하지 않는다.
#  - manifest.json     : 발행 시각·구성·정책. 프런트 판단 근거.
#
# 테스트 픽스처(TEST*/PHYS*)는 제외한다 — 프로덕션에 가짜 객체를 보이지 않기 위함.

export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
export AWS_PROFILE="${EARTHUS_AWS_PROFILE:-earthus-deploy}"

API="${AETHERUS_API:-http://127.0.0.1:8000/api}"
BUCKET="${EARTHUS_APP_BUCKET:-earthus-cache-kr}"
REGION="${EARTHUS_APP_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}/v2/aetherus"      # 호환용 — 이미 배포된 v2 번들이 읽는 곳
CANON_PREFIX="${EARTHUS_APP_PREFIX:-app}/aetherus"   # 정본 — 버전 없는 하나의 우주 (세 지구가 함께 읽는다)
DIST="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-E193CZEBLWEB56}"
ORIGIN="${PUBLIC_ORIGIN:-https://earthus.net}"

for cmd in aws curl python; do
  command -v "$cmd" >/dev/null || { echo "$cmd required" >&2; exit 2; }
done
PY=python; command -v python3 >/dev/null && PY=python3

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== 1/4 백엔드 조회 ($API) =="
fetch() { # fetch <path> <outfile>
  curl -fsS --max-time 45 "$API$1" -o "$2" || { echo "FAIL $1" >&2; return 1; }
  echo "  OK $1 ($(wc -c < "$2") bytes)"
}
fetch "/v1/catalog/status" "$TMP/status.json"
fetch "/v1/catalog/snapshot?limit=500" "$TMP/snapshot.raw.json"
fetch "/v1/conjunctions?limit=200" "$TMP/conjunctions.json"

echo "== 2/4 테스트 픽스처 제외 + 매니페스트 =="
"$PY" - "$TMP" <<'PYEOF'
import json, os, sys, io, datetime
tmp = sys.argv[1]
def load(n):
    with io.open(os.path.join(tmp, n), encoding='utf-8') as f:
        return json.load(f)
def dump(n, obj):
    with io.open(os.path.join(tmp, n), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

snap = load('snapshot.raw.json')
cat = (snap.get('data') or {}).get('catalog') or []
import re as _re
_COSPAR = _re.compile(r'^(19|20)(\d{2})-(\d{3})([A-Z]{1,3})$')
_THIS_YEAR = datetime.datetime.now(datetime.timezone.utc).year
def is_fixture(o):
    # ⚠️ 이름 접두어만 보던 판정은 새 주입 객체를 통과시켰다 (실측 2026-09-04:
    #    PROV DEB A~L · LEGACY M~O · ESTABLISHED NAME 이 살아서 나갔다).
    #    테스트가 주입한 객체도 provenance 모양은 진짜와 같아서 출처로는 구분이
    #    안 된다. 국제식별부호(COSPAR)의 실재 규약으로 가른다 —
    #    실물 2018-038A / 1999-025AHP,  주입 2082-490L / 1999-025001.
    #    같은 판정을 프런트(prototype/js/aetherus/core.js)도 한다.
    n = (o.get('canonical_name') or '').upper()
    if n.startswith('TEST') or n.startswith('PHYS-'):
        return True
    m = _COSPAR.match((o.get('cospar_id') or '').upper())
    if not m:
        return True
    if int(m.group(1) + m.group(2)) > _THIS_YEAR:
        return True
    try:
        return int(o.get('catalog_id')) >= 300000
    except (TypeError, ValueError):
        return False
kept = [o for o in cat if not is_fixture(o)]
dropped = len(cat) - len(kept)
# 궤도요소(OMM)를 동봉했는가. 이게 있으면 클라이언트가 서버와 같은 SGP4 를 돌려
# 스냅샷 시각을 벗어나서도 자리를 계산한다 — 위치 유효기간이 '분'에서 '일'로 바뀐다.
with_elements = sum(1 for o in kept if o.get('elements'))
snap.setdefault('data', {})['catalog'] = kept
snap['fixture_filtered'] = dropped
dump('snapshot.json', snap)

status = load('status.json')
conj = load('conjunctions.json')
events = ((conj.get('data') or {}).get('events')) or []

# ⚠️ 근접사건은 TCA 가 미래일 때만 스냅샷으로도 쓸모가 있다 — 이 파일이
#    정책란에 적어둔 근거가 그것이다. 그런데 스크리닝을 다시 돌리지 않으면 지난
#    번 결과가 그대로 남아 **전부 과거 사건인 목록**을 유효하다며 발행하게 된다
#    (실측 2026-09-04: 200건 전부 09-01T04:00 대). 여기서 거르고 개수를 적는다.
_now = datetime.datetime.now(datetime.timezone.utc)
def _future(ev):
    try:
        return datetime.datetime.fromisoformat(ev['tca']) >= _now
    except (KeyError, TypeError, ValueError):
        return False   # 시각을 모르는 사건은 유효하다고 말하지 않는다
_all_events = events
events = [e for e in _all_events if _future(e)]
events_past = len(_all_events) - len(events)
conj.setdefault('data', {})['events'] = events
dump('conjunctions.json', conj)
if events_past:
    print('  근접사건 %d건은 TCA 가 이미 지나 제외 (새 스크리닝 필요)' % events_past)

manifest = {
    'schema': 'earthus.aetherus.snapshot.v1',
    'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'source': 'AETHERUS Orbital API (server-side SGP4)',
    'files': {
        'status': 'status.json',
        'snapshot': 'snapshot.json',
        'conjunctions': 'conjunctions.json',
    },
    'counts': {
        'catalog_objects': len(kept),
        'catalog_objects_with_elements': with_elements,
        'fixtures_filtered': dropped,
        'conjunction_events': len(events),
        'conjunction_events_past_dropped': events_past,
    },
    'policy': {
        'positions': ('스냅샷 시각 기준 위치입니다. 위성은 초당 약 7.5km 이동하므로 '
                      '오래된 스냅샷의 위치는 그리지 않고 카탈로그 현황과 근접사건만 표시합니다.'),
        'position_max_age_s': 900,
        'elements': ('궤도요소(OMM)를 동봉하면 클라이언트가 서버와 같은 SGP4·같은 요소로 직접 풉니다. '
                     '그 경우 position_max_age_s(상태벡터 기준)가 아니라 요소 epoch 나이가 기준이며, '
                     '공개 GP 요소는 하루 1km 안팎으로 열화합니다.'),
        'element_max_age_s': 7 * 24 * 3600,
        'conjunctions': ('근접사건은 TCA가 미래인 것만 발행합니다 — 그래야 스냅샷으로도 유효합니다. '
                         '지난 사건은 제외하고 그 개수를 counts에 적습니다.'),
        'fixtures': ('테스트 주입 객체는 발행에서 제외했습니다 — 이름 접두어와 '
                     '국제식별부호(COSPAR) 실재 규약, 카탈로그 번호 범위로 가려냅니다.'),
    },
}
dump('manifest.json', manifest)
# 셸이 공개 확인에서 대조할 값 — 스키마 이름은 발행마다 같아 근거가 못 된다
with io.open(os.path.join(tmp, 'generated_at.txt'), 'w', encoding='utf-8') as f:
    f.write(manifest['generated_at'])
print('  카탈로그 %d개 (픽스처 %d개 제외, 궤도요소 %d개 동봉) · 근접사건 %d건 (과거 %d건 제외)'
      % (len(kept), dropped, with_elements, len(events), events_past))
PYEOF

echo "== 3/4 S3 업로드 =="
for f in manifest.json status.json snapshot.json conjunctions.json; do
  # 두 곳에 올린다 — 정본(버전 없음) 먼저, 그다음 이미 배포된 /v2 사본.
  for dest in "$CANON_PREFIX" "$PREFIX"; do
    aws s3 cp "$TMP/$f" "s3://$BUCKET/$dest/$f" \
      --region "$REGION" \
      --content-type 'application/json; charset=utf-8' \
      --cache-control 'public, max-age=60, stale-while-revalidate=600' \
      --only-show-errors
    echo "  PASS s3://$BUCKET/$dest/$f"
  done
done

echo "== 4/4 무효화 + 공개 확인 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths '/aetherus/*' '/v2/aetherus/*' \
  --query 'Invalidation.Id' --output text >/dev/null
# ⚠️ 방금 발행한 시각과 **같은 것**이 보일 때만 통과다. 스키마 이름은 발행마다
# 같아서, 그걸로 판정하면 CloudFront 가 들고 있는 직전 본을 보고도 PASS 를 낸다.
WANT="$(cat "$TMP/generated_at.txt")"
for attempt in $(seq 1 40); do
  if curl -fsS --max-time 15 -H 'Cache-Control: no-cache' "$ORIGIN/aetherus/manifest.json?cb=$RANDOM$attempt" -o "$TMP/pub.json" \
     && grep -qF "$WANT" "$TMP/pub.json"; then
    echo "PASS $ORIGIN/aetherus/manifest.json ($WANT)"
    "$PY" -c "import json,io,sys;d=json.load(io.open(sys.argv[1],encoding='utf-8'));print('  발행:',d['generated_at'],'| 객체',d['counts']['catalog_objects'],'| 근접사건',d['counts']['conjunction_events'])" "$TMP/pub.json"
    exit 0
  fi
  sleep 3
done
echo "FAIL: 공개 경로가 방금 발행분($WANT)으로 수렴하지 않았습니다" >&2
exit 4

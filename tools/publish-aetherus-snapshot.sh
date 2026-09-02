#!/usr/bin/env bash
set -euo pipefail

# AETHERUS 궤도 인텔리전스 — S3 스냅샷 발행 (PD 결정: ① 상시 서버 없이 스냅샷)
#
# 로컬(또는 어디든)에서 도는 AETHERUS FastAPI를 호출해 결과를 정적 JSON으로 만들어
# s3://earthus-cache-kr/app/v2/aetherus/ 에 올린다. 프런트는 같은 출처(/v2/aetherus/*)로
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
PREFIX="${EARTHUS_APP_PREFIX:-app}/v2/aetherus"
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
def is_fixture(o):
    n = (o.get('canonical_name') or '').upper()
    return n.startswith('TEST') or n.startswith('PHYS-')
kept = [o for o in cat if not is_fixture(o)]
dropped = len(cat) - len(kept)
snap.setdefault('data', {})['catalog'] = kept
snap['fixture_filtered'] = dropped
dump('snapshot.json', snap)

status = load('status.json')
conj = load('conjunctions.json')
events = ((conj.get('data') or {}).get('events')) or []

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
        'fixtures_filtered': dropped,
        'conjunction_events': len(events),
    },
    'policy': {
        'positions': ('스냅샷 시각 기준 위치입니다. 위성은 초당 약 7.5km 이동하므로 '
                      '오래된 스냅샷의 위치는 그리지 않고 카탈로그 현황과 근접사건만 표시합니다.'),
        'position_max_age_s': 900,
        'conjunctions': '근접사건의 TCA는 미래 시각이라 스냅샷으로도 유효합니다.',
        'fixtures': '테스트 픽스처(TEST*/PHYS-*)는 발행에서 제외했습니다.',
    },
}
dump('manifest.json', manifest)
print('  카탈로그 %d개 (픽스처 %d개 제외) · 근접사건 %d건'
      % (len(kept), dropped, len(events)))
PYEOF

echo "== 3/4 S3 업로드 =="
for f in manifest.json status.json snapshot.json conjunctions.json; do
  aws s3 cp "$TMP/$f" "s3://$BUCKET/$PREFIX/$f" \
    --region "$REGION" \
    --content-type 'application/json; charset=utf-8' \
    --cache-control 'public, max-age=60, stale-while-revalidate=600' \
    --only-show-errors
  echo "  PASS s3://$BUCKET/$PREFIX/$f"
done

echo "== 4/4 무효화 + 공개 확인 =="
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
  --distribution-id "$DIST" --paths '/v2/aetherus/*' \
  --query 'Invalidation.Id' --output text >/dev/null
for attempt in $(seq 1 40); do
  if curl -fsS --max-time 15 -H 'Cache-Control: no-cache' "$ORIGIN/v2/aetherus/manifest.json" -o "$TMP/pub.json" \
     && grep -q 'earthus.aetherus.snapshot.v1' "$TMP/pub.json"; then
    echo "PASS $ORIGIN/v2/aetherus/manifest.json"
    "$PY" -c "import json,io,sys;d=json.load(io.open(sys.argv[1],encoding='utf-8'));print('  발행:',d['generated_at'],'| 객체',d['counts']['catalog_objects'],'| 근접사건',d['counts']['conjunction_events'])" "$TMP/pub.json"
    exit 0
  fi
  sleep 3
done
echo 'FAIL: 공개 경로가 수렴하지 않았습니다' >&2
exit 4

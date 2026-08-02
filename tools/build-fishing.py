# -*- coding: utf-8 -*-
"""낚시 지점 만들기 — 방파제 · 선착장 · 항 · 섬

받은 요청
  "서핑처럼 낚시도 하자. 이건 근교 바다도 보여주면 되지 않을까? 섬도 그렇고"
  "방파제도 자료 얻을 수 있으면 해줘"

⚠️⚠️ **해변과 낚시 지점은 다른 곳이다.** 해수욕장 모래사장에서는 거의 안 한다.
   한국 바다낚시가 실제로 이뤄지는 곳은 셋이다.
     · 방파제(테트라)  — 접근이 쉽고 가장 흔하다
     · 항·포구·선착장  — 배낚시 출항지이자 그 자체로 포인트
     · 섬·갯바위       — 조황이 좋지만 **가장 위험하다**(고립·너울)

⚠️⚠️ **한국 OSM 은 모양은 있는데 이름이 없다.** 실측(2026-08-02, 전국):
        방파제  1,821개 — 한글 이름 **17개**
        선착장  3,105개 — 한글 이름 **64개**
        항구(seamark) 99개 — 46개, 그나마 대부분 '○○유람선'
        섬      2,810개 — 한글 이름 **1,293개**  ← 여기만 쓸 만하다
   → 이름 없는 방파제·선착장은 **가장 가까운 지명에서 이름을 빌린다.**
     ⚠️ 빌린 이름은 반드시 표시한다(derived). 공식 명칭이 아니다 —
        화면에도 "가장 가까운 지명에서 붙였습니다"라고 적는다.
     ⚠️ 거리 문턱을 종류마다 다르게 둔다. 섬은 작아서 800m 만 넘어가도
        "그 섬의 방파제"가 아니게 된다. 마을·해변은 1.5km 까지 본다.

⚠️ 방위(바다가 어느 쪽인가)는 내지 않는다.
   서핑은 "이 스웰이 이 해변에 들어오는가"라 방위가 판단의 절반이지만,
   낚시에서 중요한 것은 **물때·조류·수온·안전**이다. 낼 수 없는 값을 흉내내지 않는다.

쓰는 법
    python3 tools/get-fishing-raw.py      # Overpass 원자료 받기 (오래 걸린다)
    python3 tools/build-fishing.py prototype/data/fishing.json
"""
import json
import math
import os
import sys
import time

RAW_STRUCT = '/tmp/raw_struct.json'    # 방파제·선착장·항구·마리나
RAW_PLACE = '/tmp/raw_place.json'      # 마을·리·동 (이름을 빌릴 곳)
RAW_ISLAND = '/tmp/islands.json'       # 한글 이름 섬
BEACHES = 'prototype/data/beaches.json'

# 이름을 빌려올 최대 거리(m)
NEAR_ISLAND_M = 700      # ⚠️ 섬은 작다. 멀면 그 섬 것이 아니다.
NEAR_PLACE_M = 900       # 마을·해변
# ⚠️⚠️ 1,500m 로 잡았다가 "성산 방파제"가 1,446m 떨어진 성산에서 이름을 빌렸다.
#    그 정도면 다른 포구다. 900m 로 조였다.

# 이름을 빌리지 않을 지명.
# ⚠️ 행정구역은 지점 이름이 아니다 — "사량면 선착장"은 사량면 어디인지 못 알려준다.
#    실측: 같은 "사량면 선착장"이 세 개 나왔다.
BAD_TAIL = ('면', '읍', '시', '군', '구', '동')
# ⚠️ 유람선·관광 업체명은 낚시 지점 이름이 아니다. OSM 에 마리나로 들어와 있다.
BAD_WORD = ('유람선', '관광', '여객', '터미널', '호텔', '리조트')
SAME_M = 250             # 이보다 가까우면 같은 자리로 본다

REGIONS = [
    ("동해 북부 (고성·속초·양양)", (37.90, 128.40, 38.65, 129.00)),
    ("동해 중부 (강릉·동해·삼척)", (37.05, 128.70, 37.95, 129.45)),
    ("동해 남부 (울진·포항·경주)", (35.85, 129.05, 37.10, 129.75)),
    ("남해 동부 (부산·거제·통영)", (34.60, 128.20, 35.35, 129.35)),
    ("남해 서부 (여수·완도·해남)", (34.05, 126.20, 35.05, 128.30)),
    ("제주", (33.10, 126.10, 33.60, 127.00)),
    ("서해 중부 (태안·보령·서천)", (36.00, 126.00, 37.10, 126.75)),
    ("서해 북부 (인천·강화)", (37.10, 126.10, 37.80, 126.85)),
]


def km(a1, o1, a2, o2):
    R = 6371.0
    r = math.pi / 180
    dl = (o2 - o1) * r
    dp = (a2 - a1) * r
    h = math.sin(dp / 2) ** 2 + math.cos(a1 * r) * math.cos(a2 * r) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def is_ko(s):
    return any('가' <= c <= '힣' for c in str(s or ''))


def center(el):
    if el.get('type') == 'node':
        return el.get('lat'), el.get('lon')
    c = el.get('center') or {}
    return c.get('lat'), c.get('lon')


def region_of(la, lo):
    for name, (s, w, n, e) in REGIONS:
        if s <= la <= n and w <= lo <= e:
            return name
    return None


def kind_of(tags):
    if tags.get('man_made') == 'breakwater':
        return 'breakwater', '방파제'
    if tags.get('man_made') == 'pier':
        return 'pier', '선착장'
    if tags.get('leisure') == 'marina':
        return 'marina', '마리나'
    return 'harbour', '항·포구'


def load(path, key=None):
    if not os.path.exists(path):
        print(f'  ⚠️ 없음: {path}')
        return []
    d = json.load(open(path, encoding='utf-8'))
    return d.get(key, []) if key else d


def main():
    dst = sys.argv[1] if len(sys.argv) > 1 else 'prototype/data/fishing.json'

    struct = load(RAW_STRUCT)
    places = load(RAW_PLACE)
    islands = load(RAW_ISLAND)
    beaches = load(BEACHES, 'beaches')
    print(f'  원자료 — 구조물 {len(struct)} · 마을 {len(places)} '
          f'· 섬 {len(islands)} · 해변 {len(beaches)}')

    # ── 이름을 빌려올 곳들 ──────────────────────────────────
    anchors = []          # (lat, lon, 이름, 최대거리m)
    for el in islands:
        la, lo = center(el)
        t = el.get('tags') or {}
        nm = t.get('name:ko') or t.get('name')
        if la is None or not is_ko(nm):
            continue
        anchors.append((la, lo, nm.strip(), NEAR_ISLAND_M))
    for el in places:
        t = el.get('tags') or {}
        nm = (t.get('name:ko') or t.get('name') or '').strip()
        la, lo = center(el)
        if la is None or not is_ko(nm):
            continue
        # ⚠️ 행정구역 이름은 지점 이름이 될 수 없다 (위 주석 참고)
        if nm.endswith(BAD_TAIL) and len(nm) <= 4:
            continue
        if any(w in nm for w in BAD_WORD):
            continue
        anchors.append((la, lo, nm, NEAR_PLACE_M))
    for b in beaches:
        anchors.append((b['la'], b['lo'], b['n'], NEAR_PLACE_M))
    print(f'  이름을 빌릴 곳 {len(anchors)}개')

    def borrow(la, lo):
        """가장 가까운 지명. ⚠️ 종류마다 허용 거리가 다르다 — 섬은 짧게."""
        best, bd = None, 1e9
        for (a, o, nm, lim) in anchors:
            # 빠른 사각형 거르기 (전수 거리계산은 1,800 × 3,000 이라 느리다)
            if abs(a - la) > 0.02 or abs(o - lo) > 0.024:
                continue
            d = km(a, o, la, lo) * 1000
            if d <= lim and d < bd:
                best, bd = nm, d
        return best, (None if best is None else round(bd))

    # ── 섬 자체도 낚시 지점이다 ────────────────────────────
    out, seen = [], []

    def add(la, lo, name, kind, kindKo, derived=None, dkm=None):
        r = region_of(la, lo)
        if not r:
            return False
        for (a, o) in seen:
            if abs(a - la) < 0.004 and abs(o - lo) < 0.005 \
               and km(a, o, la, lo) * 1000 < SAME_M:
                return False
        seen.append((la, lo))
        rec = {'n': name, 'la': round(la, 5), 'lo': round(lo, 5),
               'r': r, 'k': kind, 'kko': kindKo}
        if derived:
            rec['d'] = 1                      # 빌린 이름
            if dkm is not None:
                rec['dm'] = dkm
        out.append(rec)
        return True

    for el in islands:
        la, lo = center(el)
        t = el.get('tags') or {}
        nm = (t.get('name:ko') or t.get('name') or '').strip()
        if la is None or not is_ko(nm):
            continue
        add(la, lo, nm, 'island', '섬')
    print(f'  섬 {len(out)}곳')

    named = borrowed = 0
    cand = []
    for el in struct:
        la, lo = center(el)
        if la is None:
            continue
        t = el.get('tags') or {}
        kind, kindKo = kind_of(t)
        nm = (t.get('name:ko') or t.get('name') or '').strip()
        if any(w in nm for w in BAD_WORD):
            continue                          # 유람선·터미널은 낚시 지점이 아니다
        if is_ko(nm):
            if add(la, lo, nm, kind, kindKo):
                named += 1
            continue
        # ⚠️ 이름이 없다 — 가장 가까운 지명에서 빌린다
        b, d = borrow(la, lo)
        if not b:
            continue                          # 빌릴 데가 없으면 버린다
        # "주문진해변 방파제" 가 아니라 "주문진 방파제" 로 다듬는다
        base = b
        for tail in ('해수욕장', '해변', '해안', '항', '포구', '리', '마을'):
            if base.endswith(tail) and len(base) > len(tail) + 1:
                base = base[:-len(tail)]
                break
        cand.append((la, lo, f'{base} {kindKo}', kind, kindKo, d))

    # ⚠️⚠️ 같은 이름을 여러 곳에 붙이면 안 된다. 실측에서 "사량면 선착장"이 셋이었다 —
    #    사용자는 어느 것이 어느 것인지 영영 알 수 없다.
    #    → 같은 빌린 이름은 **지명에 가장 가까운 하나만** 남긴다. 나머지는 버린다.
    #      (있는 것을 못 보여주는 손해보다, 구분 안 되는 셋을 보여주는 해가 크다)
    best = {}
    for c in cand:
        k = c[2]
        if k not in best or c[5] < best[k][5]:
            best[k] = c
    for (la, lo, nm2, kind, kindKo, d) in best.values():
        if add(la, lo, nm2, kind, kindKo, derived=True, dkm=d):
            borrowed += 1
    print(f'  구조물 — 이름 있음 {named} · 이름 빌림 {borrowed}')

    doc = {
        'generated': time.strftime('%Y-%m-%dT%H:%M:00Z', time.gmtime()),
        'source': 'OpenStreetMap contributors (ODbL)',
        'license': 'ODbL 1.0',
        'count': len(out),
        'named': sum(1 for s in out if not s.get('d')),
        'derived': sum(1 for s in out if s.get('d')),
        'nearIslandM': NEAR_ISLAND_M, 'nearPlaceM': NEAR_PLACE_M,
        'note': {
            'ko': '방파제·선착장·항·포구·섬입니다. OpenStreetMap 에서 뽑았습니다. '
                  '⚠️ 한국 OSM 은 방파제 1,821곳 중 이름이 붙은 것이 17곳뿐이라, '
                  '이름 없는 곳은 **가장 가까운 지명에서 이름을 빌렸습니다** — '
                  '공식 명칭이 아닙니다(화면에 "빌린 이름"으로 표시합니다). '
                  '⚠️ 낚시 허가·출입 통제는 담고 있지 않습니다 — '
                  '군사보호구역·사유지·통제구간이 섞여 있을 수 있습니다.',
            'en': 'Breakwaters, piers, harbours and islands from OpenStreetMap. '
                  'Most Korean breakwaters are unnamed in OSM, so names were borrowed '
                  'from the nearest place and are marked as such. '
                  'Access permissions are not included.',
        },
        'spots': out,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    kinds = {}
    for s in out:
        kinds[s['kko']] = kinds.get(s['kko'], 0) + 1
    print(f"\n✓ {dst} — {len(out)}곳 · {os.path.getsize(dst)/1024:.0f}KB")
    print('  ' + ' · '.join(f'{k} {v}' for k, v in sorted(kinds.items())))
    print(f"  이름 있음 {doc['named']} · 빌린 이름 {doc['derived']}")


if __name__ == '__main__':
    main()

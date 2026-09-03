# 도시 인구 격자 → EARTHUS 수직 막대(R-01/R-02)용 압축 그리드
#
# 왜: 지시서 R-01(맨해튼)·R-02(샌프란만)가 보존하라는 것은
#     "도시 전체에서 수많은 vertical bars 가 실제 지리 위에 솟는" 문법이다.
#     그런데 우리 국가 격자(tools/build-popgrid.py)는 나라 조각용이라 너무 성기다 —
#     미국 전체가 12,396칸이라 맨해튼(59km²)이 한 칸도 안 된다.
#     그래서 도시 창만 **100m 원해상도**에서 잘라 온다.
#
# 대상 국가는 다섯 나라뿐이다: 한국·일본·대만·영국·미국 (PD 지시).
# 그 외 국가에는 이 디자인을 넣지 않는다.
# 순서도 시장 우선순위를 따른다 — 한국이 언제나 먼저다.
#
# 출처: WorldPop R2025A (constrained, UN-adjusted) 100m, CC BY 4.0.
#   ⚠️ 미국은 이 방식으로 못 받는다. 100m 국가 파일이 1,444MB 이고 서버가 Range 요청을
#      무시하고 전체를 보낸다(실측 2026-09-03). 도시 창만 읽으려면 다른 경로가 필요하다 —
#      GHSL 100m 타일(창 단위, 타일당 ~400KB)이 후보지만 JRC 서버가 불안정하다.
#      미국은 그 경로가 안정될 때까지 비워 둔다. 없는 것을 성긴 자료로 채우지 않는다.
#
# 값 보존 원칙: 셀 값은 실제 인구수(명)다. 합쳐서 굵게 만들 때도 **합계를 보존**한다.
#   화면 높이 변환(제곱근)은 클라이언트가 하고 그 사실을 카드에 적는다.
#
# 사용: python tools/build-popcity.py seoul tokyo taipei london
#       (인자 없으면 전부)

import io
import json
import math
import os
import sys
import urllib.request
import zipfile   # noqa: F401  (GHSL 경로를 살릴 때 쓴다)

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

URL = ('https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/'
       '{ISO}/v1/100m/constrained/{iso}_pop_2025_CN_100m_R2025A_v1.tif')

CACHE = os.environ.get('POPCITY_CACHE') or os.path.join('out', 'popcity-cache')
OUT_DIR = os.path.join('prototype', 'v2-three', 'popcity')

# 도시 목록 — **한국이 먼저다** (PD 지시: "메뉴를 만들면 항상 한국 먼저").
# halfLat/halfLon 은 도시 창의 반폭(도). 광역권이 필요한 곳은 넓게 잡는다.
CITIES = [
    {'id': 'seoul',  'iso3': 'KOR', 'ko': '서울',     'en': 'Seoul',
     'lat': 37.5665, 'lon': 126.9780, 'halfLat': 0.30, 'halfLon': 0.40},
    {'id': 'tokyo',  'iso3': 'JPN', 'ko': '도쿄',     'en': 'Tokyo',
     'lat': 35.6812, 'lon': 139.7671, 'halfLat': 0.34, 'halfLon': 0.42},
    {'id': 'taipei', 'iso3': 'TWN', 'ko': '타이베이', 'en': 'Taipei',
     'lat': 25.0330, 'lon': 121.5654, 'halfLat': 0.26, 'halfLon': 0.29},
    {'id': 'london', 'iso3': 'GBR', 'ko': '런던',     'en': 'London',
     'lat': 51.5074, 'lon': -0.1278, 'halfLat': 0.28, 'halfLon': 0.45},
]

AGG = int(os.environ.get('POPCITY_AGG', '5'))       # 100m × 5 = 500m 칸
MIN_POP = float(os.environ.get('POPCITY_MIN', '5'))  # 이 아래는 담지 않는다(막대가 안 보인다)


def fetch(iso3):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{iso3.lower()}_100m.tif')
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    url = URL.format(ISO=iso3.upper(), iso=iso3.lower())
    print(f'  받는 중 {url.rsplit("/", 1)[-1]} …')
    req = urllib.request.Request(url, headers={'User-Agent': 'earthus/2.0 (+https://earthus.net)'})
    with urllib.request.urlopen(req, timeout=600) as r, open(path, 'wb') as f:
        got = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if got % (20 << 20) < (1 << 20):
                print(f'    {got/1e6:.0f} MB …')
    return path


def geo(im):
    """(lon0, lat0, dLon, dLat) — 좌상단 모서리와 화소 크기."""
    t = im.tag_v2
    sx, sy = t[33550][0], t[33550][1]
    tie = t[33922]
    return tie[3], tie[4], sx, sy


def build(city):
    tif = fetch(city['iso3'])
    im = Image.open(tif)
    lon0, lat0, dLon, dLat = geo(im)
    W, H = im.size
    # 창을 화소 좌표로
    x0 = int(math.floor((city['lon'] - city['halfLon'] - lon0) / dLon))
    x1 = int(math.ceil((city['lon'] + city['halfLon'] - lon0) / dLon))
    y0 = int(math.floor((lat0 - (city['lat'] + city['halfLat'])) / dLat))
    y1 = int(math.ceil((lat0 - (city['lat'] - city['halfLat'])) / dLat))
    x0 = max(0, x0); y0 = max(0, y0); x1 = min(W, x1); y1 = min(H, y1)
    if x1 <= x0 or y1 <= y0:
        raise RuntimeError(f'{city["id"]}: 창이 래스터 밖이다')
    # 합계를 보존하려면 배수로 잘라야 한다
    x1 -= (x1 - x0) % AGG
    y1 -= (y1 - y0) % AGG
    win = im.crop((x0, y0, x1, y1))
    px = win.load()
    ww, hh = win.size
    gw, gh = ww // AGG, hh // AGG
    cells = []
    total = 0.0
    mx = 0.0
    for gy in range(gh):
        for gx in range(gw):
            acc = 0.0
            for j in range(AGG):
                row = gy * AGG + j
                for i in range(AGG):
                    v = px[gx * AGG + i, row]
                    if v and v > 0:            # NoData 는 음수(-99999)로 온다
                        acc += v
            if acc >= MIN_POP:
                cells.append([gx, gy, round(acc, 1)])
                total += acc
                mx = max(mx, acc)
    out = {
        'schema': 'earthus.popcity.v1',
        'id': city['id'], 'iso3': city['iso3'], 'ko': city['ko'], 'en': city['en'],
        'source': 'WorldPop R2025A (constrained, UN-adjusted) 100m',
        'sourceUrl': 'https://www.worldpop.org/',
        'license': 'CC BY 4.0 — WorldPop, University of Southampton',
        'truthClass': 'MODEL_SIGNAL',
        'year': 2025,
        'note': {
            'ko': '**거주 인구**입니다 — 지금 그 자리에 있는 사람 수가 아닙니다. '
                  'WorldPop 이 위성·행정자료로 만든 격자 추정치이며 관측이 아닙니다. '
                  f'{AGG*100}m 칸으로 **합계를 보존해** 합쳤습니다.',
            'en': 'Residential population — not how many people are there right now. '
                  'A WorldPop gridded estimate from satellite and administrative data, '
                  f'not an observation. Aggregated to {AGG*100} m cells preserving the sum.',
        },
        'grid': {
            'lon0': round(lon0 + x0 * dLon, 8),
            'lat0': round(lat0 - y0 * dLat, 8),
            'dLon': round(dLon * AGG, 10),
            'dLat': round(dLat * AGG, 10),
            'nx': gw, 'ny': gh,
            'cellM': AGG * 100,
            'note': 'cells = [gx, gy, people]; lon = lon0 + (gx+0.5)*dLon, lat = lat0 - (gy+0.5)*dLat',
        },
        'stats': {'cells': len(cells), 'total': round(total), 'max': round(mx, 1)},
        'cells': cells,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    p = os.path.join(OUT_DIR, f'{city["id"]}.json')
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with io.open(p, 'w', encoding='utf-8') as f:
        f.write(body)
    print(f'  {city["ko"]:6s} {gw}×{gh} · 칸 {len(cells):,} · 총 {round(total):,}명 '
          f'· 최대 {mx:,.0f}명 · {len(body)/1024:.0f}KB')
    return out


def main():
    want = [a.lower() for a in sys.argv[1:]]
    picked = [c for c in CITIES if not want or c['id'] in want]
    idx = []
    for c in picked:
        print(f'[{c["ko"]}]')
        o = build(c)
        idx.append({k: o[k] for k in ('id', 'iso3', 'ko', 'en')} | {'stats': o['stats']})
    # 색인도 한국이 먼저인 순서 그대로 쓴다
    with io.open(os.path.join(OUT_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'schema': 'earthus.popcity.index.v1',
                   'note': '순서는 시장 우선순위다 — 한국이 먼저다.',
                   'cities': idx}, f, ensure_ascii=False)
    print(f'색인 {len(idx)}개')


if __name__ == '__main__':
    main()

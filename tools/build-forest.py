# 산림 피복 릴리프 — 지시서 R-04(이탈리아 산림 분포) 문법을 우리 대상국에
#
# R-04 가 보존하라는 것: "terrain 위 forest cover 를 높이/밀도/재질로 읽는
#   country-scale vegetation structure". 레퍼런스는 이탈리아지만 대상 국가는
#   한국·일본·대만·영국·미국뿐이다(PD 지시). 문법만 가져오고 나라는 우리 것으로 한다.
#   순서도 한국이 먼저다.
#
# 자료: ESA WorldCover 10m v200 (2021), CC BY 4.0.
#   AWS 공개 버킷 s3://esa-worldcover 에 3°×3° 타일로 올라와 있다(타일당 15~90MB).
#   클래스 10 = Tree cover. 그 비율이 곧 산림 피복률이다.
#
# ⚠️ 화소를 파이썬으로 세면 안 된다. 3°×3° 타일 하나가 36,000×36,000 = 13억 화소다.
#    대신 LUT(point)로 '나무=255' 이진 마스크를 만들고 BOX 로 축소한다 —
#    BOX 축소의 평균값이 **정확히 그 칸의 수관 비율**이다. 둘 다 C 속도다.
#
# 값 보존 원칙: 나온 값은 실제 수관 비율(0~1)이다. 화면 높이 변환은 클라이언트가 하고
#    그 사실을 카드에 적는다. 자료가 없는 곳(타일 밖)은 0 이 아니라 **비운다**(알파 0).
#
# 출력  prototype/v2-three/forest/{iso}-cover.png  (회색+알파)
#       prototype/v2-three/forest/index.json
#
# 사용: python tools/build-forest.py KOR TWN JPN   (인자 없으면 전부, 한국부터)

import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TILE_URL = ('https://esa-worldcover.s3.amazonaws.com/v200/2021/map/'
            'ESA_WorldCover_10m_2021_v200_{t}_Map.tif')
CACHE = os.environ.get('FOREST_CACHE') or os.path.join('out', 'worldcover-cache')
OUT_DIR = os.path.join('prototype', 'v2-three', 'forest')

TREE_CLASS = 10          # ESA WorldCover: 10 = Tree cover
WATER_CLASS = 80         # 80 = Permanent water bodies
SRC_DEG = 1.0 / 12000.0  # 10m ≈ 8.3333e-05°
OUT_DEG = float(os.environ.get('FOREST_OUT_DEG', '0.005'))   # ≈ 500 m
FACTOR = int(round(OUT_DEG / SRC_DEG))                        # 60
STRIP = FACTOR * 20                                           # 한 번에 읽을 원본 행 수

# 대상 국가 — **한국이 먼저다**(PD 지시). 그 밖의 나라는 넣지 않는다.
REGIONS = [
    {'iso3': 'KOR', 'ko': '한국', 'en': 'South Korea',
     'lat0': 33.0, 'lat1': 38.7, 'lon0': 125.0, 'lon1': 130.0},
    {'iso3': 'JPN', 'ko': '일본', 'en': 'Japan',
     'lat0': 30.5, 'lat1': 45.7, 'lon0': 129.0, 'lon1': 146.0},
    {'iso3': 'TWN', 'ko': '대만', 'en': 'Taiwan',
     'lat0': 21.8, 'lat1': 25.4, 'lon0': 119.9, 'lon1': 122.1},
]


def tiles_for(r):
    """WorldCover 타일은 남서 모서리 기준 3°×3° 다."""
    out = []
    la = int((r['lat0'] // 3) * 3)
    while la < r['lat1']:
        lo = int((r['lon0'] // 3) * 3)
        while lo < r['lon1']:
            ns = 'N' if la >= 0 else 'S'
            ew = 'E' if lo >= 0 else 'W'
            out.append((f'{ns}{abs(la):02d}{ew}{abs(lo):03d}', la, lo))
            lo += 3
        la += 3
    return out


def fetch(tile):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f'{tile}.tif')
    if os.path.exists(p) and os.path.getsize(p) > 100_000:
        return p
    url = TILE_URL.format(t=tile)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'earthus/2.0'})
        with urllib.request.urlopen(req, timeout=600) as rr, open(p, 'wb') as f:
            while True:
                c = rr.read(1 << 20)
                if not c:
                    break
                f.write(c)
        return p
    except Exception as e:                                    # noqa: BLE001
        # 바다뿐인 칸은 타일 자체가 없다. 그건 자료 없음이지 오류가 아니다.
        if os.path.exists(p):
            os.remove(p)
        print(f'    {tile}: 없음 ({str(e)[:40]})')
        return None


def build(r):
    nx = int(round((r['lon1'] - r['lon0']) / OUT_DEG))
    ny = int(round((r['lat1'] - r['lat0']) / OUT_DEG))
    cover = bytearray(nx * ny)        # 수관 비율 0~255
    has = bytearray(nx * ny)          # 자료가 닿은 칸만 255 — 없는 곳을 0 으로 칠하지 않는다
    t0 = time.time()
    for tile, tla, tlo in tiles_for(r):
        p = fetch(tile)
        if not p:
            continue
        im = Image.open(p)
        W, H = im.size
        # 타일 좌상단은 (tlo, tla+3)
        for y in range(0, H, STRIP):
            h = min(STRIP, H - y)
            h -= h % FACTOR
            if h <= 0:
                continue
            band = im.crop((0, y, W, y + h))
            # 나무만 255 로 (LUT — C 속도). 나머지는 0.
            mask = band.point([255 if i == TREE_CLASS else 0 for i in range(256)], mode='L')
            small = mask.resize((W // FACTOR, h // FACTOR), Image.BOX)  # 평균 = 수관 비율
            # 바다와 무자료는 '자료 없음'으로 둔다. 바다를 산림 0% 로 채우면
            # 평균이 국토 산림률과 다른 수가 되고(실측: 27.9% vs 실제 약 63%),
            # 화면에도 바다 위에 산림 레이어가 깔린다.
            lnd = band.point([0 if i in (0, WATER_CLASS) else 255 for i in range(256)], mode='L')
            lsmall = lnd.resize((W // FACTOR, h // FACTOR), Image.BOX)
            lp = lsmall.load()
            sp = small.load()
            sw, sh = small.size
            for sy in range(sh):
                lat = (tla + 3.0) - (y + (sy + 0.5) * FACTOR) * SRC_DEG
                oy = int((r['lat1'] - lat) / OUT_DEG)
                if oy < 0 or oy >= ny:
                    continue
                base = oy * nx
                for sx in range(sw):
                    lon = tlo + (sx + 0.5) * FACTOR * SRC_DEG
                    ox = int((lon - r['lon0']) / OUT_DEG)
                    if ox < 0 or ox >= nx:
                        continue
                    if lp[sx, sy] < 128:      # 칸의 절반 이상이 바다·무자료
                        continue
                    cover[base + ox] = sp[sx, sy]
                    has[base + ox] = 255
        print(f'    {tile} 누적 {time.time()-t0:.0f}s')
    # 회색=수관 비율, 알파=자료 있음. 없는 곳은 비운다.
    img = Image.merge('LA', (Image.frombytes('L', (nx, ny), bytes(cover)),
                             Image.frombytes('L', (nx, ny), bytes(has))))
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{r["iso3"].lower()}-cover.png')
    img.save(out, optimize=True)
    n = sum(1 for v in has if v)
    mean = (sum(cover) / max(1, n)) / 255.0
    print(f'  {r["ko"]:4s} {nx}×{ny} · 육지칸 {n:,} · 육지 평균 수관 {mean*100:.1f}% '
          f'· {os.path.getsize(out)/1024:.0f}KB · {time.time()-t0:.0f}s')
    return {
        'iso3': r['iso3'], 'ko': r['ko'], 'en': r['en'],
        'file': f'{r["iso3"].lower()}-cover.png',
        'bbox': [r['lon0'], r['lat0'], r['lon1'], r['lat1']],
        'nx': nx, 'ny': ny, 'cellDeg': OUT_DEG,
        'cells': n, 'meanCover': round(mean, 4),
    }


def main():
    want = [a.upper() for a in sys.argv[1:]]
    picked = [r for r in REGIONS if not want or r['iso3'] in want]
    idx = []
    for r in picked:
        print(f'[{r["ko"]}]')
        idx.append(build(r))
    p = os.path.join(OUT_DIR, 'index.json')
    old = []
    if os.path.exists(p):
        try:
            old = json.load(io.open(p, encoding='utf-8')).get('regions', [])
        except Exception:                                     # noqa: BLE001
            old = []
    keep = [x for x in old if x['iso3'] not in {i['iso3'] for i in idx}]
    merged = idx + keep
    order = {r['iso3']: i for i, r in enumerate(REGIONS)}      # 한국이 먼저
    merged.sort(key=lambda x: order.get(x['iso3'], 99))
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump({
            'schema': 'earthus.forest.index.v1',
            'source': 'ESA WorldCover 10m v200 (2021)',
            'sourceUrl': 'https://esa-worldcover.org/',
            'license': 'CC BY 4.0 — ESA WorldCover project',
            'truthClass': 'OBSERVED',
            'note': '클래스 10(Tree cover)의 비율. 회색=수관 비율, 알파=자료 있음. '
                    '순서는 시장 우선순위다 — 한국이 먼저다.',
            'regions': merged,
        }, f, ensure_ascii=False)
    print(f'색인 {len(merged)}개')


if __name__ == '__main__':
    main()

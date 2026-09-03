# 산림 감소 (2001~2023) — "산이 점차 줄어들고 있어, 개발 때문에"
#
# PD 지시: 산림 유형 대신 **줄어드는 것**을 보여준다. 대상은 한국만.
#
# 자료: Hansen Global Forest Change v1.11 (2000–2023), Maryland 대학.
#   `lossyear` 는 화소마다 **그 자리의 숲이 사라진 해**를 담는다 (0=없음, 1~23=2001~2023).
#   30m 해상도. 10°×10° 타일이고 한국은 40N_120E 하나로 덮인다(22MB).
#   출처 표기 의무: Hansen et al. (2013) Science 342:850-853.
#
# ⚠️ 이 값은 **모든 수관 소실**이다 — 개발만이 아니라 벌채·산불·병해충·수확도 포함한다.
#    "개발 때문"이라고 단정하면 우리가 원인을 만든 것이 된다. 카드에 그대로 적는다.
#    또한 소실이지 '순감소'가 아니다 — 다시 자란 곳은 여기 반영되지 않는다.
#
# 굽는 방법: 화소를 파이썬으로 세면 16억 번이라 못 쓴다. LUT + BOX 축소 두 번으로 끝낸다.
#   A = BOX(사라졌으면 255)            → 그 칸에서 **사라진 비율**
#   B = BOX(사라진 해 × 10)            → 모든 화소 평균이므로 (B/10)/(A/255) = **평균 소실 연도**
#   둘 다 C 속도다.
#
# 출력  prototype/v2-three/forest/kor-loss.png   (R=평균 소실연도 1~23, A=사라진 비율)
#       prototype/v2-three/forest/loss-index.json
#
# 사용: python tools/build-forestloss.py

import io
import json
import os
import time
import urllib.request

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

VER = 'GFC-2023-v1.11'
URL = f'https://storage.googleapis.com/earthenginepartners-hansen/{VER}/Hansen_{VER}_lossyear_{{t}}.tif'
CACHE = os.environ.get('LOSS_CACHE') or os.path.join('out', 'hansen-cache')
OUT_DIR = os.path.join('prototype', 'v2-three', 'forest')

SRC_DEG = 1.0 / 4000.0        # 30m ≈ 0.00025°
OUT_DEG = 0.0025              # ≈ 278 m
FACTOR = int(round(OUT_DEG / SRC_DEG))   # 10
STRIP = FACTOR * 200          # 원본 2000행씩
LAST_YEAR = 23                # 2023

# 한국만 (PD 지시).
REGION = {'iso3': 'KOR', 'ko': '한국', 'en': 'South Korea',
          'lat0': 33.0, 'lat1': 38.7, 'lon0': 125.0, 'lon1': 130.0}


def tiles_for(r):
    """Hansen 타일은 **좌상단** 기준 10°×10° 다 (예: 40N_120E = 30~40N, 120~130E)."""
    out = []
    la = int(((r['lat1'] + 9.999) // 10) * 10)
    while la - 10 < r['lat1'] and la >= r['lat0']:
        lo = int((r['lon0'] // 10) * 10)
        while lo < r['lon1']:
            out.append((f'{abs(la):02d}{"N" if la >= 0 else "S"}_{abs(lo):03d}'
                        f'{"E" if lo >= 0 else "W"}', la, lo))
            lo += 10
        la -= 10
    return out


def fetch(tile):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f'{tile}.tif')
    if os.path.exists(p) and os.path.getsize(p) > 100_000:
        return p
    req = urllib.request.Request(URL.format(t=tile), headers={'User-Agent': 'earthus/2.0'})
    with urllib.request.urlopen(req, timeout=900) as rr, open(p, 'wb') as f:
        while True:
            c = rr.read(1 << 20)
            if not c:
                break
            f.write(c)
    return p


def main():
    r = REGION
    nx = int(round((r['lon1'] - r['lon0']) / OUT_DEG))
    ny = int(round((r['lat1'] - r['lat0']) / OUT_DEG))
    frac = bytearray(nx * ny)     # 사라진 비율 0~255
    yr = bytearray(nx * ny)       # 평균 소실 연도 1~23 (0 = 소실 없음)
    t0 = time.time()
    # 사라진 해에 ×10 을 씌우는 LUT (23×10=230 ≤ 255)
    LUT_Y = [min(255, i * 10) if 1 <= i <= LAST_YEAR else 0 for i in range(256)]
    LUT_A = [255 if 1 <= i <= LAST_YEAR else 0 for i in range(256)]
    for tile, tla, tlo in tiles_for(r):
        print(f'  타일 {tile}')
        p = fetch(tile)
        im = Image.open(p)
        W, H = im.size
        for y in range(0, H, STRIP):
            h = min(STRIP, H - y)
            h -= h % FACTOR
            if h <= 0:
                continue
            band = im.crop((0, y, W, y + h))
            a = band.point(LUT_A, mode='L').resize((W // FACTOR, h // FACTOR), Image.BOX)
            b = band.point(LUT_Y, mode='L').resize((W // FACTOR, h // FACTOR), Image.BOX)
            ap, bp = a.load(), b.load()
            sw, sh = a.size
            for sy in range(sh):
                lat = tla - (y + (sy + 0.5) * FACTOR) * SRC_DEG
                oy = int((r['lat1'] - lat) / OUT_DEG)
                if oy < 0 or oy >= ny:
                    continue
                base = oy * nx
                for sx in range(sw):
                    av = ap[sx, sy]
                    if not av:
                        continue
                    lon = tlo + (sx + 0.5) * FACTOR * SRC_DEG
                    ox = int((lon - r['lon0']) / OUT_DEG)
                    if ox < 0 or ox >= nx:
                        continue
                    # 평균 소실 연도 = (B/10) / (A/255)
                    my = (bp[sx, sy] / 10.0) / (av / 255.0)
                    frac[base + ox] = av
                    yr[base + ox] = max(1, min(LAST_YEAR, int(round(my))))
            if (y // STRIP) % 4 == 0:
                print(f'    {y}/{H} · {time.time()-t0:.0f}s')
    img = Image.merge('LA', (Image.frombytes('L', (nx, ny), bytes(yr)),
                             Image.frombytes('L', (nx, ny), bytes(frac))))
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, 'kor-loss.png')
    img.save(out, optimize=True)
    n = sum(1 for v in frac if v)
    # 사라진 면적(㎢) — 칸 면적 × 비율. 위도에 따라 칸이 좁아지는 것까지 본다.
    import math
    area = 0.0
    for i, v in enumerate(frac):
        if not v:
            continue
        lat = r['lat1'] - (i // nx + 0.5) * OUT_DEG
        cell = (OUT_DEG * 111.32) * (OUT_DEG * 111.32 * math.cos(math.radians(lat)))
        area += cell * (v / 255.0)
    years = {}
    for i, v in enumerate(frac):
        if v:
            years[yr[i]] = years.get(yr[i], 0) + 1
    print(f'  {r["ko"]} {nx}×{ny} · 소실칸 {n:,} · 사라진 숲 약 {area:,.0f}㎢ '
          f'· {os.path.getsize(out)/1024:.0f}KB · {time.time()-t0:.0f}s')
    with io.open(os.path.join(OUT_DIR, 'loss-index.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'schema': 'earthus.forestloss.v1',
            'source': f'Hansen Global Forest Change {VER} (UMD)',
            'sourceUrl': 'https://glad.earthengine.app/view/global-forest-change',
            'cite': 'Hansen et al. (2013) Science 342:850-853',
            'license': 'CC BY 4.0',
            'truthClass': 'OBSERVED',
            'iso3': r['iso3'], 'ko': r['ko'], 'en': r['en'],
            'file': 'kor-loss.png',
            'bbox': [r['lon0'], r['lat0'], r['lon1'], r['lat1']],
            'nx': nx, 'ny': ny, 'cellDeg': OUT_DEG,
            'year0': 2000, 'lastYear': 2000 + LAST_YEAR,
            'cells': n, 'lostKm2': round(area),
            'byYear': {str(2000 + k): v for k, v in sorted(years.items())},
            'encoding': 'R = 평균 소실 연도(1~23 = 2001~2023, 0 = 소실 없음) · A = 그 칸에서 사라진 비율',
            'note': {
                'ko': '**모든 수관 소실**입니다 — 개발만이 아니라 벌채·산불·병해충·수확도 포함합니다. '
                      '소실이지 순감소가 아니며, 다시 자란 곳은 반영되지 않습니다.',
                'en': 'All tree-cover loss — not only development, but also logging, fire, disease and '
                      'harvest. It is loss, not net change; regrowth is not reflected.',
            },
        }, f, ensure_ascii=False)


if __name__ == '__main__':
    main()

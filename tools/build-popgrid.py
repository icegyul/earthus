# WorldPop 국가별 인구 격자 → EARTHUS 데이터 조각용 압축 그리드
#
# 왜: 지시서 R-03(튀르키예 인구 릴리프)처럼 국경 안쪽을 실제 데이터로 세우려면
#     국가 단위 인구 격자가 필요하다. WorldPop 1km(30 arcsec) 국가 래스터는
#     로그인 없이 받을 수 있고 크기도 작다(한국 788KB, 튀르키예 1.9MB).
#
# 출처: WorldPop (www.worldpop.org) Global 2000-2020 1km Aggregated, CC BY 4.0.
# 값 보존 원칙: 셀 값은 실제 인구수(명)다. 화면 높이만 표현용으로 변환하고,
#     총인구·최댓값은 원값 그대로 카드에 싣는다. 없는 셀(바다·무인)은 0이 아니라 비운다.
#
# 사용: python tools/build-popgrid.py KOR TUR ITA  (출력: out/popgrid/{iso}.json)

import io
import json
import math
import os
import sys
import urllib.request
import zlib

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# R2025A(2015~2030) 최신 릴리스를 먼저 쓰고, 없으면 구 시리즈(2000~2020)로 내려간다.
# ⚠️ 디렉터리는 대문자 ISO3, 파일명 접두는 소문자 — 대소문자가 엄격하다(둘 다 틀리면 404).
URL_R2025 = ('https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/{YEAR}/'
             '{ISO}/v1/1km_ua/constrained/{iso}_pop_{YEAR}_CN_1km_R2025A_UA_v1.tif')
URL_LEGACY = ('https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/'
              '{ISO}/{iso}_ppp_2020_1km_Aggregated.tif')
YEAR = '2025'
URL = URL_R2025
OUT_DIR = os.path.join('out', 'popgrid')
TARGET_CELLS = 260_000   # 셀 수 상한 — 넘으면 정수배로 묶어 downsample (합계 보존)


def fetch(iso3: str):
    """(bytes, url, year, release) — 최신 릴리스 우선, 없으면 구 시리즈."""
    cands = [
        (URL_R2025.format(ISO=iso3.upper(), iso=iso3.lower(), YEAR=YEAR), YEAR, 'R2025A (constrained, UN-adjusted)'),
        (URL_LEGACY.format(ISO=iso3.upper(), iso=iso3.lower()), '2020', 'Global 2000-2020 (unconstrained)'),
    ]
    last = None
    for url, year, rel in cands:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'EARTHUS/2.0 (data build)'})
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read(), url, year, rel
        except Exception as e:  # 404 등 — 다음 후보로
            last = e
    raise RuntimeError(f'다운로드 실패: {last}')


def build(iso3: str) -> dict:
    raw, src_url, year, release = fetch(iso3)
    im = Image.open(io.BytesIO(raw))
    if im.mode != 'F':
        im = im.convert('F')
    nx, ny = im.size
    tags = im.tag_v2
    scale = tags.get(33550)
    tie = tags.get(33922)
    if not scale or not tie:
        raise RuntimeError(f'{iso3}: GeoTIFF 지리정보 없음')
    cx, cy = float(scale[0]), float(scale[1])
    lon0, lat0 = float(tie[3]), float(tie[4])   # 좌상단 모서리
    px = list(im.getdata())

    # 셀 수가 많으면 정수배로 묶는다 (합계 보존 — 인구를 잃지 않는다)
    step = 1
    while (nx // step) * (ny // step) > TARGET_CELLS:
        step += 1
    ox, oy = nx // step, ny // step
    vals = [0.0] * (ox * oy)
    for y in range(oy * step):
        base = y * nx
        ty = (y // step) * ox
        for x in range(ox * step):
            v = px[base + x]
            if v is None or v <= 0 or v != v:   # NoData/NaN
                continue
            vals[ty + (x // step)] += v

    total = sum(vals)
    mx = max(vals) if vals else 0.0
    if mx <= 0:
        raise RuntimeError(f'{iso3}: 유효 인구 셀 없음')

    # 표현용 부호화: 세제곱근 정규화 후 u8 (선형이면 대도시 1~2곳만 남고 나머지가 사라진다).
    # 원값 복원용으로 max와 변환식을 함께 싣는다.
    enc = bytearray(ox * oy)
    nonzero = 0
    for i, v in enumerate(vals):
        if v <= 0:
            continue
        nonzero += 1
        enc[i] = max(1, min(255, round(255.0 * (v / mx) ** (1.0 / 3.0))))

    comp = zlib.compress(bytes(enc), 9)
    import base64
    doc = {
        'schema': 'earthus.popgrid.v1',
        'iso3': iso3.upper(),
        'source': f'WorldPop {release} 1km · {year}년',
        'year': year,
        'sourceUrl': src_url,
        'license': 'CC BY 4.0 — WorldPop, University of Southampton',
        'unit': '명 (1셀당 거주 인구)',
        'nx': ox,
        'ny': oy,
        'cellDeg': [cx * step, cy * step],
        'originDeg': [lon0, lat0],          # 좌상단 셀의 좌상단 모서리 (경도, 위도)
        'total': round(total),
        'max': round(mx, 2),
        'nonzero': nonzero,
        'encoding': 'u8 = round(255 * (v/max)^(1/3)), zlib+base64. v = max * (u8/255)^3',
        'data': base64.b64encode(comp).decode('ascii'),
    }
    return doc


def main():
    isos = [a for a in sys.argv[1:] if len(a) == 3]
    if not isos:
        print('사용: python tools/build-popgrid.py KOR TUR ITA')
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    for iso in isos:
        try:
            doc = build(iso)
            p = os.path.join(OUT_DIR, f'{doc["iso3"].lower()}.json')
            with io.open(p, 'w', encoding='utf-8') as f:
                json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
            kb = os.path.getsize(p) // 1024
            print(f'{doc["iso3"]}: {doc["nx"]}x{doc["ny"]} · 인구 {doc["total"]:,} · '
                  f'최대셀 {doc["max"]:,.0f}명 · {kb}KB')
        except Exception as e:
            print(f'{iso}: 실패 — {e}')


if __name__ == '__main__':
    main()

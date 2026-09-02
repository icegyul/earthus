# USGS 지진 카탈로그(2001~오늘) → EARTHUS 시간축 재생용 압축 바이너리
#
# 왜: PTWC의 "15년간의 지진" 영상처럼 시간순으로 쌓으면 판 경계가 저절로 드러난다.
#     우리는 3D 지구라 깊이를 색으로만이 아니라 값으로도 들고 간다.
#
# 출처: USGS Earthquake Hazards Program ComCat (FDSN event web service), 공공 도메인.
# 값 보존 원칙: 진앙·깊이·규모는 원값을 정밀도만 낮춰 담는다(위치 ~0.005°, 깊이 0.1km,
#     규모 0.05). 없는 값은 0으로 채우지 않고 그 지진을 버린다(버린 수는 헤더에 적는다).
#
# 사용: python tools/build-quakes.py [최소규모] [시작연도]
# 출력: out/quakes/quakes.bin (zlib) + out/quakes/quakes.json (헤더)

import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timezone

BASE = 'https://earthquake.usgs.gov/fdsnws/event/1'
OUT_DIR = os.path.join('out', 'quakes')
MIN_MAG = float(sys.argv[1]) if len(sys.argv) > 1 else 4.5
START_YEAR = int(sys.argv[2]) if len(sys.argv) > 2 else 2001
EPOCH = datetime(START_YEAR, 1, 1, tzinfo=timezone.utc)
PAGE_LIMIT = 19000            # USGS 단일 질의 상한 20000 — 여유를 두고 창을 쪼갠다


def get(url: str, tries: int = 4):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return json.loads(r.read().decode('utf-8'))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(2 + i * 3)
    raise RuntimeError(f'USGS 응답 실패: {url} — {last}')


def count(a: str, b: str) -> int:
    j = get(f'{BASE}/count?format=geojson&starttime={a}&endtime={b}&minmagnitude={MIN_MAG}')
    return int(j.get('count', 0)) if isinstance(j, dict) else int(j)


def fetch_window(a: str, b: str, out: list, depth: int = 0):
    """[a,b) 구간을 20000건 상한 아래로 쪼개며 모두 받는다."""
    n = count(a, b)
    if n == 0:
        print(f'  {a} → {b}: 0건')
        return
    if n > PAGE_LIMIT and depth < 8:
        ta = datetime.fromisoformat(a).replace(tzinfo=timezone.utc)
        tb = datetime.fromisoformat(b).replace(tzinfo=timezone.utc)
        mid = ta + (tb - ta) / 2
        m = mid.strftime('%Y-%m-%dT%H:%M:%S')
        print(f'  {a} → {b}: {n}건 — 상한 초과라 둘로 쪼갬')
        fetch_window(a, m, out, depth + 1)
        fetch_window(m, b, out, depth + 1)
        return
    url = (f'{BASE}/query?format=geojson&starttime={a}&endtime={b}'
           f'&minmagnitude={MIN_MAG}&orderby=time-asc')
    j = get(url)
    feats = j.get('features') or []
    out.extend(feats)
    print(f'  {a} → {b}: {len(feats)}건 (예상 {n})')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    now = datetime.now(timezone.utc)
    feats = []
    for year in range(START_YEAR, now.year + 1):
        a = f'{year}-01-01T00:00:00'
        b = f'{year + 1}-01-01T00:00:00'
        if year == now.year:
            b = now.strftime('%Y-%m-%dT%H:%M:%S')
        print(f'{year}:')
        fetch_window(a, b, feats)

    rows = []
    dropped = 0
    for f in feats:
        g = (f.get('geometry') or {}).get('coordinates') or []
        p = f.get('properties') or {}
        if len(g) < 3 or g[0] is None or g[1] is None or g[2] is None or p.get('mag') is None:
            dropped += 1          # 좌표·깊이·규모 중 하나라도 없으면 지어내지 않고 버린다
            continue
        t = p.get('time')
        if t is None:
            dropped += 1
            continue
        lon, lat, dep = float(g[0]), float(g[1]), float(g[2])
        mag = float(p['mag'])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            dropped += 1
            continue
        rows.append((t, lon, lat, max(0.0, dep), mag))
    rows.sort(key=lambda r: r[0])

    ep_ms = EPOCH.timestamp() * 1000.0
    lons = bytearray(); lats = bytearray(); deps = bytearray()
    mags = bytearray(); tdays = bytearray()
    max_day = 0
    max_mag = 0.0
    max_dep = 0.0
    for t, lon, lat, dep, mag in rows:
        day = int((t - ep_ms) / 86400000.0)
        day = max(0, min(65535, day))
        max_day = max(max_day, day)
        max_mag = max(max_mag, mag)
        max_dep = max(max_dep, dep)
        lons += struct.pack('<h', max(-32767, min(32767, round(lon * 181.0))))
        lats += struct.pack('<h', max(-32767, min(32767, round(lat * 362.0))))
        deps += struct.pack('<H', max(0, min(65535, round(dep * 10.0))))
        mags += struct.pack('<B', max(0, min(255, round((mag - 4.0) * 20.0))))
        tdays += struct.pack('<H', day)

    blob = zlib.compress(bytes(lons + lats + deps + mags + tdays), 9)
    with open(os.path.join(OUT_DIR, 'quakes.bin'), 'wb') as fh:
        fh.write(blob)

    header = {
        'schema': 'earthus.quakes.v1',
        'source': 'USGS Earthquake Hazards Program — ComCat (FDSN event service)',
        'sourceUrl': f'{BASE}/query?format=geojson&minmagnitude={MIN_MAG}&starttime={START_YEAR}-01-01',
        'license': 'Public domain (U.S. Geological Survey)',
        'retrieved': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'minMagnitude': MIN_MAG,
        'epoch': EPOCH.strftime('%Y-%m-%d'),
        'count': len(rows),
        'dropped': dropped,
        'days': max_day,
        'maxMagnitude': round(max_mag, 2),
        'maxDepthKm': round(max_dep, 1),
        'layout': ('zlib(deflate) 안에 배열 5개가 차례로: '
                   'lon int16(÷181 = 도), lat int16(÷362 = 도), depth uint16(÷10 = km), '
                   'mag uint8(÷20 + 4.0), day uint16(기준일로부터 일수)'),
        'bytes': len(blob),
    }
    with open(os.path.join(OUT_DIR, 'quakes.json'), 'w', encoding='utf-8') as fh:
        json.dump(header, fh, ensure_ascii=False)
    print(f"\n{len(rows):,}건 · 버린 것 {dropped}건 · {len(blob) / 1024:.0f}KB "
          f"· 최대 M{max_mag} · 최대깊이 {max_dep:.0f}km")


if __name__ == '__main__':
    main()

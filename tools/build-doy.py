# -*- coding: utf-8 -*-
"""날짜별 평년 분포 — "오늘이 얼마나 이례적인가"의 근거

받은 요청: 내 위치 날씨를 **원고처럼** 보여 달라
  (docs/weather-narrative-design.md — "이중 열돔에서 벗어난 한반도" 영상 스크립트)

⚠️⚠️ 그 원고가 좋은 이유는 **문장마다 검증 가능한 주장**이라는 것이다.
   "덥습니다"가 아니라 "평년보다 상위 5%"다. 그러려면 **평년 분포**가 있어야 한다.
   설계 당시엔 그 자료가 없어 화면을 비워 뒀다. 오늘 ASOS 30년을 적재해 생겼다.

무엇을 만드나
   지점 × 날짜(1~366) 마다 **분위수**를 미리 계산해 둔다.
     기온(평균·최고·최저) · 습도 · 일교차
   그러면 브라우저는 작은 표 하나만 받아 "오늘 28.4°C 는 상위 8%" 를 즉시 말할 수 있다.

⚠️ 왜 미리 계산하나
   원자료는 지점당 200KB(gzip)다. 화면을 열 때마다 그걸 받아 30년을 훑을 수는 없다.
   분위수 표는 지점당 **약 25KB** 로 줄어든다.

⚠️ **그날 ±7일 창**으로 모은다. 하루만 쓰면 표본이 30개뿐이라 분위수가 튄다.
   ±7 이면 30×15 = 450개가 된다. 계절이 크게 바뀌지 않는 폭이다.

⚠️ 표본이 모자라면 그 날짜는 **비운다.** 채우지 않는다.

    python3 tools/build-doy.py [출력폴더]
"""
import gzip
import json
import os
import sys
from datetime import date, timedelta

SRC = '/tmp/climate'
WIN = 7                    # 그날 ±7일
MIN_N = 120                # 이보다 적으면 그 날짜는 비운다
FIELDS = ['ta', 'tmax', 'tmin', 'hm']
# ⚠️ 분위수는 다섯만 낸다. 더 촘촘히 내면 파일만 커지고,
#    "상위 10%" 보다 잘게 말할 근거도 없다(표본 450개).
QS = [5, 10, 25, 50, 75, 90, 95]


def q(sorted_vals, p):
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p / 100.0
    lo, hi = int(k), min(int(k) + 1, len(sorted_vals) - 1)
    return round(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo), 1)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '/tmp/doy'
    os.makedirs(out_dir, exist_ok=True)
    stns = json.load(open(f'{SRC}/stations.json', encoding='utf-8'))
    done = 0
    for s in stns:
        p = f"{SRC}/{s['id']}.json.gz"
        if not os.path.exists(p):
            continue
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            doc = json.load(f)
        days = doc['days']

        # 날짜별 값 모으기 — (월,일) → {field: [값…]}
        bucket = {}
        for k, v in days.items():
            m, d = int(k[4:6]), int(k[6:8])
            b = bucket.setdefault((m, d), {})
            for fld in FIELDS:
                if fld in v:
                    b.setdefault(fld, []).append(v[fld])

        table = {}
        for m in range(1, 13):
            for d in range(1, 32):
                try:
                    c = date(2001, m, d)      # 윤년 아닌 해로 날짜 유효성만 본다
                except ValueError:
                    continue
                vals = {}
                for i in range(-WIN, WIN + 1):
                    dd = c + timedelta(days=i)
                    b = bucket.get((dd.month, dd.day))
                    if not b:
                        continue
                    for fld in FIELDS:
                        if fld in b:
                            vals.setdefault(fld, []).extend(b[fld])
                cell = {}
                for fld, arr in vals.items():
                    if len(arr) < MIN_N:
                        continue            # ⚠️ 모자라면 비운다
                    arr.sort()
                    cell[fld] = {'n': len(arr),
                                 'q': [q(arr, x) for x in QS]}
                if cell:
                    table[f'{m:02d}{d:02d}'] = cell

        rec = {
            'stn': doc['stn'], 'name': doc['name'],
            'lat': doc['lat'], 'lon': doc['lon'], 'alt': doc.get('alt'),
            'from': doc['from'], 'to': doc['to'],
            'winDays': WIN, 'minN': MIN_N, 'qs': QS, 'fields': FIELDS,
            'source': '기상청 ASOS 일자료 (API 허브 kma_sfcdd3)',
            'note': {'ko': f'그날 ±{WIN}일을 모아 낸 분위수입니다. '
                           f'표본이 {MIN_N}개 미만인 날짜는 비워 뒀습니다 — '
                           f'모자란 표본으로 "상위 몇 %"를 말하지 않습니다.'},
            'doy': table,
        }
        dst = f"{out_dir}/{doc['stn']}.json"
        with open(dst, 'w', encoding='utf-8') as f:
            json.dump(rec, f, ensure_ascii=False, separators=(',', ':'))
        done += 1
        if done % 20 == 0:
            print(f'  {done}지점 · 마지막 {doc["name"]} {os.path.getsize(dst)/1024:.0f}KB',
                  flush=True)

    # 색인 — 가장 가까운 지점을 찾으려면 좌표가 필요하다
    idx = []
    for fn in sorted(os.listdir(out_dir)):
        if not fn.endswith('.json') or fn == 'index.json':
            continue
        r = json.load(open(f'{out_dir}/{fn}', encoding='utf-8'))
        idx.append({'s': r['stn'], 'n': r['name'], 'la': r['lat'], 'lo': r['lon'],
                    'a': r.get('alt')})
    json.dump({'count': len(idx),
               'source': '기상청 ASOS',
               'note': {'ko': '가장 가까운 관측소를 좌표로 찾는다. '
                              '⚠️ 관측소가 멀거나 고도가 크게 다르면 그렇게 밝힌다 — '
                              '산 위와 산 아래는 같은 날씨가 아니다.'},
               'stations': idx},
              open(f'{out_dir}/index.json', 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    tot = sum(os.path.getsize(f'{out_dir}/{f}') for f in os.listdir(out_dir))
    print(f'\n✓ {done}지점 · 색인 {len(idx)} · 합계 {tot/1024/1024:.1f}MB')


if __name__ == '__main__':
    main()

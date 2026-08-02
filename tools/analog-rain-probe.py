# -*- coding: utf-8 -*-
"""비 확률 — 닮은 해가 **어디서도** 안 통하나

받은 질문: "비 확률은 그렇게 계산해도 나오면 진짜로 그 확률은 아닌거야?"
그 답으로 "지금 방법으로는 안 된다"까지만 말했다. 그럼 다른 방법·다른 곳은?

⚠️⚠️ **여러 번 시험하면 그중 하나는 우연히 좋아 보인다.**
   지역 7곳 × 계절 5개 = 35칸을 보면, 진짜 효과가 하나도 없어도
   두어 칸은 +10% 로 나온다. 그래서 규칙을 먼저 정한다:

     ① 무엇을 시험할지 **미리 적는다**(아래 네 가지). 돌린 뒤 늘리지 않는다.
     ② **전부 보고한다.** 좋은 것만 고르지 않는다.
     ③ 좋아 보이는 칸이 있으면 **그 안에서 계절별로 갈라 본다.**
        진짜 효과면 여러 계절에 걸쳐 같은 방향이어야 한다.
        한 계절만 좋으면 그건 우연으로 본다.

미리 정한 네 가지
   A. 지역별      — 지역이 다르면 통하는 곳이 있나
   B. 강수량      — "왔나/안 왔나"가 아니라 "얼마나"는 예측되나 (MAE)
   C. 장마 기준   — 90일 기온곡선 대신 **장마 시작일**로 닮음을 재면
   D. A × 계절    — A 에서 좋아 보인 곳을 계절로 갈라 확인
"""
import json
import math
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib.machinery import SourceFileLoader
AY = SourceFileLoader('ay', os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         'analog-year.py')).load_module()

SRC = '/tmp/climate'
DATES = [(4, 15), (6, 25), (8, 15), (10, 10), (12, 20)]
Y0, Y1 = 1996, 2025


# ── 지역 나누기 ────────────────────────────────────────────────
# ⚠️ 행정구역이 아니라 **비가 비슷하게 오는 덩어리**로 나눈다.
#    제주는 따로 — 장마·태풍이 가장 먼저 닿고 가장 세다.
def region_of(lat, lon):
    if lat < 33.8:
        return '제주'
    band = '남부' if lat < 35.6 else ('중부' if lat < 37.0 else '북부')
    side = '동' if lon >= 127.8 else '서'
    return f'{band}{side}'


def load_stations():
    p = f'{SRC}/stations.json'
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []


# ── 장마 시작일 (우리 정의) ─────────────────────────────────────
# ⚠️⚠️ **기상청 공식 장마 시작일이 아니다.** 기상청은 정체전선 위치를 보고 정하는데
#    우리는 그 자료가 없다. 대신 "5일 누적 강수가 40mm 를 처음 넘는 날"로 잡는다.
#    → 그래서 이 값을 화면에 "장마 시작"이라고 쓰면 안 된다. 여기서는 **닮음을 재는
#      내부 값**으로만 쓴다.
def monsoon_doy(doc, year):
    try:
        c0 = date(year, 6, 1)
    except ValueError:
        return None
    vals = []
    for i in range(0, 55):
        d = c0 + timedelta(days=i)
        v = doc['days'].get(AY.key(d.year, d.month, d.day))
        vals.append((v or {}).get('rn'))
    for i in range(4, len(vals)):
        w = [x for x in vals[i - 4:i + 1] if x is not None]
        if len(w) >= 4 and sum(w) >= 40:
            return i          # 6/1 부터 며칠째
    return None


def analogs_monsoon(doc, ty, years, n=8):
    """장마 시작일이 비슷한 해. ⚠️ 여름 날짜에만 뜻이 있다."""
    cur = monsoon_doy(doc, ty)
    if cur is None:
        return None
    scored = []
    for y in years:
        if y == ty:
            continue
        m = monsoon_doy(doc, y)
        if m is None:
            continue
        scored.append((abs(m - cur), y))
    if len(scored) < AY.SIM_MIN_YEARS:
        return None
    scored.sort()
    return [y for _, y in scored[:n]]


# ══ 시험 ═══════════════════════════════════════════════════════
def run(stns, dates, group_fn=None, target='rain', sim='both', n_ana=8,
        analog_fn=None):
    """group_fn(stn_meta) → 묶음 이름. None 이면 전체 하나로."""
    acc = {}
    for s in stns:
        doc = AY.load(s['id'])
        if not doc:
            continue
        g = group_fn(s) if group_fn else '전체'
        years = list(range(Y0, Y1 + 1))
        for (m, d) in dates:
            for ty in years:
                recs = AY.around(doc, ty, m, d)
                if target == 'rain':
                    rs = [AY.rained(r) for r in recs]
                    rs = [x for x in rs if x is not None]
                    if not rs:
                        continue
                    actual = any(rs)
                else:                       # 강수량 — 그 주 합
                    vs = [r['rn'] for r in recs if r.get('rn') is not None]
                    if not vs:
                        continue
                    actual = sum(vs)

                rest = [y for y in years if y != ty]
                if target == 'rain':
                    pc, nc = AY.year_prob(doc, m, d, rest)
                    if pc is None or nc < 10:
                        continue
                else:
                    cv = []
                    for y in rest:
                        vs = [r['rn'] for r in AY.around(doc, y, m, d)
                              if r.get('rn') is not None]
                        if vs:
                            cv.append(sum(vs))
                    if len(cv) < 10:
                        continue
                    pc = sum(cv) / len(cv)

                ay = (analog_fn(doc, ty, years, n_ana) if analog_fn
                      else (AY.analogs(doc, ty, m, d, years, n=n_ana, mode=sim)[0]))
                if not ay:
                    continue
                if target == 'rain':
                    pa, na = AY.year_prob(doc, m, d, ay)
                    if pa is None or na < AY.SIM_MIN_YEARS:
                        continue
                    ec, ea = AY.brier(pc, actual), AY.brier(pa, actual)
                else:
                    av = []
                    for y in ay:
                        vs = [r['rn'] for r in AY.around(doc, y, m, d)
                              if r.get('rn') is not None]
                        if vs:
                            av.append(sum(vs))
                    if len(av) < AY.SIM_MIN_YEARS:
                        continue
                    pa = sum(av) / len(av)
                    ec, ea = abs(pc - actual), abs(pa - actual)

                a = acc.setdefault(g, {'c': 0.0, 'a': 0.0, 'n': 0, 'bym': {}})
                a['c'] += ec; a['a'] += ea; a['n'] += 1
                bm = a['bym'].setdefault(m, {'c': 0.0, 'a': 0.0, 'n': 0})
                bm['c'] += ec; bm['a'] += ea; bm['n'] += 1
    return acc


def show(title, acc, unit=''):
    print(f'\n── {title} ' + '─' * max(0, 46 - len(title)))
    rows = []
    for g, v in acc.items():
        if not v['n']:
            continue
        c, a = v['c'] / v['n'], v['a'] / v['n']
        rows.append((g, c, a, (c - a) / c * 100 if c else 0, v['n'], v['bym']))
    rows.sort(key=lambda r: -r[3])
    for g, c, a, gain, n, bym in rows:
        mark = '✓' if a < c else '✗'
        print(f'  {g:6s} 평년 {c:.4f}{unit} · 닮은해 {a:.4f}{unit}  {gain:+6.1f}%  {mark}  n={n}')
    return rows


def main():
    stns = load_stations()
    have = [s for s in stns if os.path.exists(f'{SRC}/{s["id"]}.json.gz')]
    print(f'지점 {len(have)}곳')

    # A. 지역별 (비 여부)
    accA = run(have, DATES, group_fn=lambda s: region_of(s['lat'], s['lon']))
    rowsA = show('A. 지역별 · 비 왔나 (Brier)', accA)

    # D. A 에서 가장 좋아 보인 곳을 계절로 갈라 본다
    if rowsA and rowsA[0][3] > 0:
        g, _, _, gain, _, bym = rowsA[0]
        print(f'\n── D. "{g}" 를 계절로 갈라 확인 ({gain:+.1f}% 로 가장 좋아 보였다)')
        pos = 0
        for m in sorted(bym):
            v = bym[m]
            c, a = v['c'] / v['n'], v['a'] / v['n']
            gg = (c - a) / c * 100 if c else 0
            if gg > 0:
                pos += 1
            print(f'     {m:2d}월  {gg:+6.1f}%  n={v["n"]}')
        print(f'     → 5개 계절 중 {pos}개에서 나았다. '
              f'{"여러 계절에 걸쳐 같은 방향이다" if pos >= 4 else "⚠️ 우연으로 본다 — 한두 계절만 좋으면 신호가 아니다"}')
    else:
        print('\n── D. 건너뜀 — A 에서 평년을 이긴 지역이 하나도 없다')

    # B. 강수량 (MAE)
    accB = run(have, DATES, target='rain_mm')
    show('B. 강수량 mm (MAE)', accB, 'mm')

    # C. 장마 시작일로 닮음 (여름 날짜만)
    accC = run(have, [(6, 25), (8, 15)],
               analog_fn=lambda doc, ty, years, n: analogs_monsoon(doc, ty, years, n))
    show('C. 장마 시작일 기준 · 여름만 (Brier)', accC)


if __name__ == '__main__':
    main()

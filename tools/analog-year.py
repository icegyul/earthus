# -*- coding: utf-8 -*-
"""해마다 그날 — 닮은 해를 찾아 그날 날씨를 세고, **그 방법이 나은지 채점한다**

받은 요청
  "그 축제 해가 26년이다 그러면 그해 특징이 있을거 아냐. 6월달 장마 시작이
   비슷하거나 온도가 비슷하게 흘러가거나 그런 패턴이 있던 해를 여러개 찾아서
   확률로 알려주고, 다른점은 뭐뭐때문에 달라질 수 있다 이렇게 안내"

⚠️⚠️ **한 달 전 그날 날씨는 예보할 수 없다.** 수치예보 한계가 10~15일이다.
   그러니 이건 예보가 아니라 **셈**이다 — "해마다 그날 어땠나"를 센다.

⚠️⚠️ **닮은 해가 평년보다 낫다는 보장이 없다.**
   태풍 유사경로에서 똑같은 벽을 만났다. 검증 없이 "닮은 해 8년 중 5년 비 → 62%"를
   내놓으면 표본 8개짜리 확률을 파는 것이다.
   → 그래서 이 파일은 **먼저 채점하고 그다음 쓴다.**
     과거 30년으로 leave-one-out 검증을 하면 **오늘 당장** 답이 나온다:
       각 해를 "올해"로 놓고 나머지 해에서 닮은 해를 찾아,
       그 해의 실제 그날 날씨를 맞췄는지 Brier score 로 잰다.
     평년 확률의 Brier 와 견줘 **낫지 않으면 닮은 해를 화면에 내지 않는다.**

⚠️ 이건 축제만을 위한 것이 아니다. **범용**이다 —
   결혼식·등산·촬영·농사·행사 전부 같은 질문을 한다: "그날 거기 어떨까".

    python3 tools/analog-year.py backtest        # 방법이 나은지 채점
    python3 tools/analog-year.py build <out>     # 화면용 파일 만들기
"""
import gzip
import json
import math
import os
import sys
from datetime import date, timedelta

SRC = '/tmp/climate'

# ── 판정 기준 ────────────────────────────────────────────────
RAIN_MM = 1.0        # ⚠️ 이 이상을 "비 온 날"로 본다. 0.1mm 는 우산도 안 편다.
HEAVY_MM = 20.0      # 행사가 실제로 못 열리는 구간
WINDOW_D = 3         # 그날 ±3일을 같은 계절로 본다 (표본을 늘리려고)

# 닮음을 재는 창 — "올해가 어떻게 흘러왔나"
# ⚠️ 대상 날짜 **이전**만 본다. 이후를 보면 답을 미리 본 것이 된다(누설).
SIM_DAYS = 90
SIM_MIN_YEARS = 6    # 닮은 해가 이보다 적으면 확률을 말하지 않는다
ANALOG_N = 8         # 상위 몇 해를 닮은 해로 볼까


def load(stn):
    p = f'{SRC}/{stn}.json.gz'
    if not os.path.exists(p):
        return None
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)


def key(y, m, d):
    return f'{y:04d}{m:02d}{d:02d}'


def series(doc, field, y0, y1):
    """연도별 {날짜문자열: 값}"""
    out = {}
    for k, v in doc['days'].items():
        if field in v and y0 <= int(k[:4]) <= y1:
            out[k] = v[field]
    return out


def around(doc, year, month, day, w=WINDOW_D):
    """그해 그날 ±w 일의 기록"""
    try:
        c = date(year, month, day)
    except ValueError:
        return []
    out = []
    for i in range(-w, w + 1):
        d = c + timedelta(days=i)
        v = doc['days'].get(key(d.year, d.month, d.day))
        if v:
            out.append(v)
    return out


def rained(rec):
    r = rec.get('rn')
    return None if r is None else (r >= RAIN_MM)


def clim_prob(doc, month, day, years, w=WINDOW_D):
    """평년 확률 — 그 해들의 그날 ±w 를 전부 세어 비 온 비율.
       ⚠️ n 을 함께 돌려준다. n 없이 확률만 내면 근거 없는 권위가 생긴다."""
    hit = tot = 0
    for y in years:
        for rec in around(doc, y, month, day, w):
            r = rained(rec)
            if r is None:
                continue
            tot += 1
            hit += 1 if r else 0
    return (hit / tot if tot else None), tot


def year_prob(doc, month, day, years, w=WINDOW_D):
    """해 단위 확률 — 그 해에 그날 ±w 중 **하루라도** 비가 왔나.
       ⚠️ 행사는 하루짜리라 '날 단위'가 맞을 때도 있고 '해 단위'가 맞을 때도 있다.
          둘 다 낸다."""
    hit = tot = 0
    for y in years:
        recs = around(doc, y, month, day, w)
        rs = [rained(r) for r in recs]
        rs = [x for x in rs if x is not None]
        if not rs:
            continue
        tot += 1
        hit += 1 if any(rs) else 0
    return (hit / tot if tot else None), tot


def profile(doc, year, month, day, days=SIM_DAYS):
    """그해가 대상 날짜까지 **어떻게 흘러왔나** — 닮음을 재는 값.
       ⚠️ 대상 날짜 이후는 절대 안 본다(누설).
       ⚠️ 기온과 강수를 따로 낸다. 하나로 합치면 무엇 때문에 닮았는지 못 말한다."""
    try:
        c = date(year, month, day)
    except ValueError:
        return None
    ta, rn = [], []
    for i in range(days, 0, -1):
        d = c - timedelta(days=i)
        v = doc['days'].get(key(d.year, d.month, d.day))
        ta.append(v.get('ta') if v else None)
        rn.append(v.get('rn') if v else None)
    if sum(1 for x in ta if x is not None) < days * 0.7:
        return None
    return {'ta': ta, 'rn': rn}


def anomaly(profs):
    """여러 해 프로필의 평균을 빼서 편차로 만든다.
       ⚠️ 절대 기온으로 비교하면 **계절만 같으면 다 닮았다**고 나온다.
          그해가 평년보다 더웠나 추웠나가 우리가 찾는 것이다."""
    n = len(profs[0]['ta'])
    mean = []
    for i in range(n):
        vs = [p['ta'][i] for p in profs if p['ta'][i] is not None]
        mean.append(sum(vs) / len(vs) if vs else None)
    return mean


def sim_score(a, b, mean, mode='both'):
    """두 해가 얼마나 닮았나. 낮을수록 닮았다.
       ⚠️ 기온 편차의 RMSE + 누적 강수 차이. 둘의 무게를 같게 두었다 —
          어느 쪽이 더 중요한지 **모르기 때문**이다. 안다고 가정하지 않는다."""
    n = len(a['ta'])
    se = c = 0
    for i in range(n):
        if a['ta'][i] is None or b['ta'][i] is None or mean[i] is None:
            continue
        da = a['ta'][i] - mean[i]
        db = b['ta'][i] - mean[i]
        se += (da - db) ** 2
        c += 1
    if c < n * 0.5:
        return None
    t_rmse = math.sqrt(se / c)

    sa = sum(x for x in a['rn'] if x is not None)
    sb = sum(x for x in b['rn'] if x is not None)
    # 누적 강수는 mm 단위가 커서 그대로 더하면 기온을 압도한다 → 상대 차이로
    denom = max(50.0, (sa + sb) / 2)
    r_rel = abs(sa - sb) / denom
    if mode == 'temp':
        return t_rmse
    if mode == 'rain':
        return r_rel
    return t_rmse + r_rel * 3.0


def analogs(doc, target_year, month, day, years, n=ANALOG_N, mode='both'):
    """올해와 닮은 해 상위 n. ⚠️ target_year 자신은 뺀다."""
    cur = profile(doc, target_year, month, day)
    if not cur:
        return None, None
    others = [y for y in years if y != target_year]
    profs = {}
    for y in others:
        p = profile(doc, y, month, day)
        if p:
            profs[y] = p
    if len(profs) < SIM_MIN_YEARS:
        return None, None
    mean = anomaly(list(profs.values()) + [cur])
    scored = []
    for y, p in profs.items():
        s = sim_score(cur, p, mean, mode)
        if s is not None:
            scored.append((s, y))
    if len(scored) < SIM_MIN_YEARS:
        return None, None
    scored.sort()
    return [y for _, y in scored[:n]], scored


# ══ 채점 ═══════════════════════════════════════════════════════
def brier(pred, actual):
    return (pred - (1.0 if actual else 0.0)) ** 2


def backtest(stns, dates, y0=1996, y1=2025, n_ana=ANALOG_N, blend=0.0, sim='both'):
    """⚠️⚠️ **이 함수가 이 기능의 존재 이유다.**
       닮은 해 방식이 평년보다 나은지 오늘 답한다.
       각 해를 '올해'로 놓고 나머지 해에서 닮은 해를 찾아, 실제 그날을 맞췄는지 잰다."""
    tot = {'clim': 0.0, 'ana': 0.0, 'n': 0, 'skip': 0}
    per_month = {}
    for stn in stns:
        doc = load(stn)
        if not doc:
            continue
        years = list(range(y0, y1 + 1))
        for (m, d) in dates:
            for ty in years:
                recs = around(doc, ty, m, d)
                rs = [rained(r) for r in recs]
                rs = [x for x in rs if x is not None]
                if not rs:
                    continue
                actual = any(rs)
                rest = [y for y in years if y != ty]
                pc, nc = year_prob(doc, m, d, rest)
                if pc is None or nc < 10:
                    continue
                ay, _ = analogs(doc, ty, m, d, years, n=n_ana, mode=sim)
                if not ay:
                    tot['skip'] += 1
                    continue
                pa, na = year_prob(doc, m, d, ay)
                if pa is None or na < SIM_MIN_YEARS:
                    tot['skip'] += 1
                    continue
                # ⚠️ 섞기 — 닮은 해의 표본이 얇아 생기는 흔들림을 평년으로 눌러 준다
                if blend:
                    pa = blend * pc + (1 - blend) * pa
                tot['clim'] += brier(pc, actual)
                tot['ana'] += brier(pa, actual)
                tot['n'] += 1
                mm = per_month.setdefault(m, {'clim': 0.0, 'ana': 0.0, 'n': 0})
                mm['clim'] += brier(pc, actual)
                mm['ana'] += brier(pa, actual)
                mm['n'] += 1
    return tot, per_month


# ══ 기온 채점 ═══════════════════════════════════════════════════
# ⚠️ 강수와 **다른 대상**이다. 하루 강수는 거의 무작위에 가깝지만,
#    기온은 그해의 성질이 이어지는 편이라 닮은 해가 통할 여지가 있다.
#    ⚠️ 이것도 미리 정해 놓고 한 번만 돌린다. 될 때까지 바꾸면 짜맞추기다.
def backtest_temp(stns, dates, y0=1996, y1=2025, n_ana=15, sim='temp', mode='analog'):
    """⚠️⚠️ mode='recent' 는 **대조군**이다.
       닮은 해가 나은 게 아니라 그냥 **최근 해가 나은 것**일 수 있다(온난화).
       가까운 n년 평균이 닮은 해만큼 잘하면, 우리 유사도는 아무 일도 안 한 것이다."""
    tot = {'clim': 0.0, 'ana': 0.0, 'n': 0}
    for stn in stns:
        doc = load(stn)
        if not doc:
            continue
        years = list(range(y0, y1 + 1))
        for (m, d) in dates:
            for ty in years:
                recs = around(doc, ty, m, d)
                act = [r['ta'] for r in recs if r.get('ta') is not None]
                if not act:
                    continue
                actual = sum(act) / len(act)
                rest = [y for y in years if y != ty]
                cv = []
                for y in rest:
                    v = [r['ta'] for r in around(doc, y, m, d) if r.get('ta') is not None]
                    if v:
                        cv.append(sum(v) / len(v))
                if len(cv) < 10:
                    continue
                pc = sum(cv) / len(cv)
                if mode == 'recent':
                    ay = sorted([y for y in rest if y < ty], reverse=True)[:n_ana]
                    if len(ay) < SIM_MIN_YEARS:
                        ay = sorted(rest, key=lambda y: abs(y - ty))[:n_ana]
                else:
                    ay, _ = analogs(doc, ty, m, d, years, n=n_ana, mode=sim)
                if not ay:
                    continue
                av = []
                for y in ay:
                    v = [r['ta'] for r in around(doc, y, m, d) if r.get('ta') is not None]
                    if v:
                        av.append(sum(v) / len(v))
                if len(av) < SIM_MIN_YEARS:
                    continue
                pa = sum(av) / len(av)
                tot['clim'] += abs(pc - actual)
                tot['ana'] += abs(pa - actual)
                tot['n'] += 1
    return tot


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'backtest'
    stn_file = f'{SRC}/stations.json'
    stns = [s['id'] for s in json.load(open(stn_file, encoding='utf-8'))] \
        if os.path.exists(stn_file) else []
    have = [s for s in stns if os.path.exists(f'{SRC}/{s}.json.gz')]
    print(f'자료 있는 지점 {len(have)}/{len(stns)}')

    if cmd == 'backtest':
        # 계절을 고루 — 봄·장마·한여름·가을·겨울
        dates = [(4, 15), (6, 25), (8, 15), (10, 10), (12, 20)]
        use = have[:int(sys.argv[2])] if len(sys.argv) > 2 else have
        use = have
        # ⚠️⚠️ 변형을 **미리 정해 놓고** 한 번에 돌린다.
        #    보기 좋을 때까지 바꿔 가며 돌리면 그건 채점이 아니라 짜맞추기다.
        VARIANTS = [
            ('닮은해 8년',            dict(n_ana=8)),
            ('닮은해 15년',           dict(n_ana=15)),
            ('닮은해 15년 + 평년 반반', dict(n_ana=15, blend=0.5)),
            ('기온만으로 닮음 15년',    dict(n_ana=15, sim='temp')),
        ]
        for label, kw in VARIANTS:
            tot, pm = backtest(use, dates, **kw)
            if not tot['n']:
                print(f'{label}: 표본 없음'); continue
            bc, ba = tot['clim'] / tot['n'], tot['ana'] / tot['n']
            g = (bc - ba) / bc * 100 if bc else 0
            mark = '✓ 낫다' if ba < bc else '✗ 낫지 않다'
            print(f'{label:24s} 평년 {bc:.4f} · 이것 {ba:.4f}  {g:+5.1f}%  {mark}  n={tot["n"]}')
        print()
        for label, kw in [('기온 · 닮은해 15년(기온기준)', dict(n_ana=15, sim='temp')),
                          ('기온 · 닮은해 15년(둘다)',    dict(n_ana=15, sim='both')),
                          ('기온 · 닮은해 8년(기온기준)',  dict(n_ana=8, sim='temp')),
                          ('기온 · [대조] 최근 8년',      dict(n_ana=8, mode='recent')),
                          ('기온 · [대조] 최근 15년',     dict(n_ana=15, mode='recent'))]:
            t = backtest_temp(use, dates, **kw)
            if not t['n']:
                print(f'{label}: 표본 없음'); continue
            mc, ma = t['clim'] / t['n'], t['ana'] / t['n']
            g = (mc - ma) / mc * 100
            mark = '✓ 낫다' if ma < mc else '✗ 낫지 않다'
            print(f'{label:24s} 평년 MAE {mc:.3f}°C · 이것 {ma:.3f}°C  {g:+5.1f}%  {mark}  n={t["n"]}')


if __name__ == '__main__':
    main()

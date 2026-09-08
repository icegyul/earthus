# -*- coding: utf-8 -*-
"""태풍 어댑터 — PHASE 8 §8.

두 가지를 분명히 나눈다.

  ① 실측 팩트  — 만들 수 있다.
     ocean/ibtracs-wp.json (IBTrACS v04r01, NOAA NCEI) 이 1980년부터 서태평양
     6시간 간격 최적경로를 갖고 있다. 기간을 잘라 셀 수 있다.

  ② 예보 채점  — **못 한다.** 그리고 왜 못 하는지를 그대로 남긴다.
     예보 원문은 events/typhoon-official/archive/{태풍}/{기관}-{발표시각}.json 에
     발표마다 불변으로 보존돼 있다(typhoon-official/handler.py). 자료는 있다.
     그런데 그 접두사를 **나열할 수 없다** — 버킷 목록 조회가 403 이다
     (2026-09-08 실측: ?list-type=2&prefix=events/typhoon-official/archive/ → 403).
     키를 하나씩은 읽을 수 있지만, 어느 키가 있는지 모르면 기간 단위로 모을 수 없다.
     → FORECAST_ARCHIVE_NOT_ENUMERABLE. 점수를 지어내지 않는다.

⚠️ 개수와 세기를 섞지 않는다. "태풍 10개" 와 "최대 124노트" 는 서로 다른 이야기다.
   하나의 '태풍 활동 지수' 로 뭉치지 않는다 — 그런 지수를 우리가 정의한 적이 없다.

⚠️ 이번 시즌 자료는 **잠정치**다. IBTrACS 는 시즌 뒤 재분석으로 값이 바뀐다.
   그래서 기간 끝까지 점이 없으면 DATA_PARTIAL 로 내린다.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import report_period as rp             # noqa: E402
import report_contract as rc           # noqa: E402
import phenomenon_registry as reg      # noqa: E402
from base import ForecastAdapter       # noqa: E402

SOURCE_REF = "ocean/ibtracs-wp.json"
SOURCE = "IBTrACS v04r01 (NOAA NCEI) · 서태평양"
PHENOMENON = "hazards.typhoon"
FORECAST_ARCHIVE = "events/typhoon-official/archive"
MIN_YEARS = 20


def _day(pt):
    """점의 시각 'YYYY-MM-DD HH' → date. 모양이 다르면 None."""
    t = pt[3] if len(pt) > 3 else None
    if not isinstance(t, str) or len(t) < 10:
        return None
    try:
        y, m, d = (int(x) for x in t[:10].split("-"))
        return date(y, m, d)
    except ValueError:
        return None


def _in_period(pt, start, end):
    d = _day(pt)
    return bool(d and start <= d <= end)


def season_stats(doc, period):
    """기간 안의 태풍 활동. 셀 수 있는 것만 센다."""
    _, start, end = rp.parse(period)
    storms, max_wind, storm_days, formed = set(), None, 0, 0
    latest = None
    for s in (doc or {}).get("storms") or []:
        pts = [p for p in (s.get("pts") or []) if _in_period(p, start, end)]
        for p in (s.get("pts") or []):
            d = _day(p)
            if d and (latest is None or d > latest):
                latest = d
        if not pts:
            continue
        storms.add(s.get("sid"))
        days = {_day(p) for p in pts}
        storm_days += len({d for d in days if d})
        first = _day((s.get("pts") or [[None]])[0]) if s.get("pts") else None
        if first and start <= first <= end:
            formed += 1
        for p in pts:
            w = p[2] if len(p) > 2 else None
            if isinstance(w, (int, float)) and (max_wind is None or w > max_wind):
                max_wind = float(w)
    return {"storms": len(storms), "formed": formed, "stormDays": storm_days,
            "maxWindKt": max_wind, "latestPoint": latest.isoformat() if latest else None,
            "periodEnd": end.isoformat()}


def _history(doc, period, key):
    """해마다 같은 기간의 값. 순위를 내는 데 쓴다."""
    kind, start, _ = rp.parse(period)
    out = {}
    years = set()
    for s in (doc or {}).get("storms") or []:
        for p in (s.get("pts") or []):
            d = _day(p)
            if d:
                years.add(d.year)
    for y in sorted(years):
        if kind == rp.YEAR:
            per = str(y)
        elif kind == rp.QUARTER:
            per = "%d-Q%d" % (y, (start.month - 1) // 3 + 1)
        else:
            per = "%d-%02d" % (y, start.month)
        v = season_stats(doc, per).get(key)
        if v is not None:
            out[y] = v
    return out


def coverage(doc, period):
    """이 기간을 말할 수 있는가. 끝까지 자료가 없으면 부분이라고 적는다."""
    st = season_stats(doc, period)
    if not (doc or {}).get("storms"):
        return {"ok": False, "reason": "NO_OBSERVATION_ARCHIVE", "detail": "최적경로 자료가 없다"}
    latest, end = st.get("latestPoint"), st.get("periodEnd")
    closed = bool(latest and latest >= end)
    if not closed:
        return {"ok": True, "dataLabel": "DATA_PARTIAL", "periodClosed": False,
                "detail": "최적경로가 %s 까지만 있습니다(기간 끝 %s)" % (latest, end),
                "provisional": True}
    return {"ok": True, "dataLabel": "DATA_PARTIAL", "periodClosed": True, "provisional": True,
            "detail": "이번 시즌 최적경로는 잠정치이며 재분석으로 바뀔 수 있습니다"}


def build_facts(doc, period):
    """§5 ReportFact. 개수·형성·활동일·최대풍속을 따로 낸다."""
    st = season_stats(doc, period)
    if not st["storms"]:
        return []
    cov = coverage(doc, period)
    this_year = rp.parse(period)[1].year
    facts = []
    base = "fact:%s:typhoon" % rp.label(period)

    for key, metric, unit, label in (
        ("storms", "storm_count", "count", "활동한 태풍 수"),
        ("formed", "storm_formed", "count", "발생한 태풍 수"),
        ("stormDays", "storm_days", "day", "태풍 활동일"),
        ("maxWindKt", "max_wind", "kt", "최대풍속"),
    ):
        v = st.get(key)
        if v is None:
            continue
        hist = _history(doc, period, key)
        comparison = {"dataLabel": cov.get("dataLabel"), "provisional": True,
                      "rankScope": SOURCE, "metricLabel": label}
        # ⚠️ 기간이 아직 안 끝났으면 **순위를 내지 않는다.**
        #    9월 8일에 2026년 연간 태풍 수를 과거 '한 해 전체'와 견주면
        #    "올해는 태풍이 적다"는 거짓 결론이 나온다. 8개월치를 12개월치와 비교한 것뿐이다.
        period_closed = bool(cov.get("periodClosed"))
        if not period_closed:
            comparison["comparisonWithheld"] = "PERIOD_NOT_CLOSED"
            comparison["comparisonWithheldKo"] = (
                "기간이 끝나지 않아 과거와 견주지 않았습니다 — %s" % cov.get("detail"))
        if period_closed and len(hist) >= MIN_YEARS:
            ranked = sorted(hist.items(), key=lambda kv: -kv[1])
            rank = next((i + 1 for i, (y, _) in enumerate(ranked) if y == this_year), None)
            base_years = [hist[y] for y in hist if 1991 <= y <= 2020]
            comparison.update({
                "rankHigh": rank, "ofYears": len(ranked),
                "baselineFrom": 1991, "baselineTo": 2020,
                "baselineValue": round(sum(base_years) / len(base_years), 2) if base_years else None,
                "baselineYears": len(base_years),
            })
        facts.append(rc.make_fact(
            fact_id="%s:%s" % (base, metric), phenomenon_id=PHENOMENON, metric=metric,
            value=v, unit=unit, period=rp.label(period),
            source="%s · %s" % (SOURCE, label), truth_type="EARTHUS_ANALYSIS",
            comparison=comparison, sample_count=st["storms"],
            evidence_refs=[SOURCE_REF],
            layer_refs=[k for k in [reg.representative_layer_for(PHENOMENON)] if k]))
    return facts


class TyphoonAdapter(ForecastAdapter):
    phenomenon_id = PHENOMENON
    source = SOURCE
    model_id = None          # 최적경로는 모델 예보가 아니다
    model_version = "v04r01"

    def input_window(self, doc):
        # 예보 원문은 있으나 나열할 수 없다. 있다고도 없다고도 잘못 말하지 않는다.
        return {"archive": FORECAST_ARCHIVE, "enumerable": False}

    def output_window(self, doc):
        st = season_stats(doc, "%d" % (rp.parse("2026")[1].year))
        return {"to": st.get("latestPoint")} if st.get("latestPoint") else None

    def normalize(self, doc, period):
        return build_facts(doc, period)

    def evaluate(self, doc, period):
        return self.unavailable(
            "FORECAST_ARCHIVE_NOT_ENUMERABLE",
            "예보 원문은 %s 에 발표마다 보존돼 있으나 버킷 목록 조회가 403 이라 "
            "기간 단위로 모을 수 없습니다. 자격증명이 있는 환경에서는 가능합니다." % FORECAST_ARCHIVE)

# -*- coding: utf-8 -*-
"""기후 일별 시계열 어댑터 — PHASE 8 §1·§2 의 팩트 공급원.

왜 이 자료인가: 저장소에서 **기간을 잘라 평년과 견줄 수 있는 유일한 실측 이력**이다.
  wind/series/temp-daily.json    NOAA CPC 전지구 일별 기온   1979~   9개 지역
  ocean/series/sst-daily.json    NOAA OISST v2.1 해수면온도  1982~   5개 해역
  ocean/series/seaice-daily.json NSIDC Sea Ice Index v4.0    1979~   양극
  wind/series/korea-daily.json   기상청 관측(GHCN-Daily 경유) 1973~   한국 평균

자료 모양: series[지역]["연도"] = [그 해의 일별 값] — 1월 1일부터 날짜 순. 윤년은 366개다.

⚠️ 날짜를 **고정 색인으로 자르지 않는다.** 8월 1일은 평년 213번째 날이지만 윤년엔 214번째다.
   색인으로 자르면 평년 30년 중 윤년 8년이 하루씩 밀려 평년값이 조용히 틀어진다.
   그래서 실제 달력으로 센다.

⚠️ 평년은 1991~2020(WMO 표준 30년)이다. 이 창을 바꾸면 모든 편차가 바뀌므로
   팩트의 comparison 에 기준 연도를 **항상** 함께 싣는다.

⚠️ 순위는 **이 자료 안에서의 순위**다. "역사상"이 아니라 "이 자료 48년 중"이라고 적는다.
   자료가 시작되기 전은 우리가 모른다.

여기서 내는 값은 관측 그 자체가 아니라 **우리가 집계한 값**이다(truthType=EARTHUS_ANALYSIS).
원 관측 기관은 source 와 evidenceRefs 에 그대로 남긴다.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import report_period as rp        # noqa: E402
import report_contract as rc      # noqa: E402
from base import ForecastAdapter  # noqa: E402

BASE_FROM, BASE_TO = 1991, 2020          # WMO 표준 평년
MIN_BASE_YEARS = 20                      # 이보다 적으면 평년을 말하지 않는다
MIN_COVERAGE = 0.8                       # 기간의 80% 미만이 비면 팩트를 만들지 않는다

# 자료마다 무엇을 뜻하는지. 새 자료를 붙일 때 여기만 늘린다.
DATASETS = {
    "land_temp": {
        "ref": "wind/series/temp-daily.json",
        "source": "NOAA CPC Global Daily Temperature",
        "unit": "degC",
        "phenomenon": "weather.temperature",
        "anomalyPhenomenon": "weather.temperature_anomaly",
        "layerRefs": ["weather/temp"],
        "higherIsWarmer": True,
        "regionKey": "regions",
    },
    "sst": {
        "ref": "ocean/series/sst-daily.json",
        "source": "NOAA OISST v2.1",
        "unit": "degC",
        "phenomenon": "ocean.sst",
        "anomalyPhenomenon": "ocean.sst_anomaly",
        "layerRefs": ["ocean/sst"],
        "higherIsWarmer": True,
        "regionKey": "regions",
    },
    "seaice": {
        "ref": "ocean/series/seaice-daily.json",
        "source": "NSIDC Sea Ice Index v4.0",
        "unit": "10^6 km2",
        "phenomenon": "ocean.sea_ice",
        # 해빙 편차 현상은 레지스트리에 없다. 있는 것만 쓴다 — 새 현상 id 를 만들지 않는다.
        "anomalyPhenomenon": "ocean.sea_ice",
        "layerRefs": ["ocean/seaice"],
        "higherIsWarmer": False,          # 얼음은 적을수록 따뜻한 쪽이다
        "regionKey": "poles",
    },
    "korea_temp": {
        "ref": "wind/series/korea-daily.json",
        "source": "기상청 관측 (NOAA GHCN-Daily 경유)",
        "unit": "degC",
        "phenomenon": "weather.temperature",
        "anomalyPhenomenon": "weather.temperature_anomaly",
        "layerRefs": ["weather/temp"],
        "higherIsWarmer": True,
        "regionKey": None,                # 지역 축이 없다 — 한국 하나다
        "singleRegion": "kr",
    },
}


def _year_dates(year, n):
    """그 해 1월 1일부터 n일치 날짜. 자료 배열의 색인과 1:1 로 맞춘다."""
    o = date(year, 1, 1).toordinal()
    return [date.fromordinal(o + i) for i in range(n)]


def _series_of(doc, dataset, region):
    s = (doc or {}).get("series") or {}
    if DATASETS[dataset].get("regionKey") is None:
        return s if all(k.isdigit() for k in list(s)[:3]) else {}
    return s.get(region) or {}


# 원자료의 regions/poles 에는 한국어 이름만 있다. 영문 보고서에 쓸 이름을 여기서 준다.
# ⚠️ 자료에 없는 지역이 생기면 키 그대로 나온다 — 지어내지 않는다.
REGION_EN = {
    "land": "Global land", "asia": "Asia", "europe": "Europe", "africa": "Africa",
    "namerica": "North America", "samerica": "South America", "oceania": "Oceania",
    "arctic": "Arctic", "antarctic": "Antarctic", "kr": "Korea",
    "global": "Global", "60S60N": "60S-60N", "nh": "N. Hemisphere",
    "sh": "S. Hemisphere", "tropics": "Tropics 20S-20N",
}


def region_label_en(region):
    return REGION_EN.get(region, region)


def regions_of(doc, dataset):
    """이 자료가 가진 지역 키와 한국어 이름."""
    spec = DATASETS[dataset]
    if spec.get("regionKey") is None:
        return {spec["singleRegion"]: "한국"}
    raw = (doc or {}).get(spec["regionKey"]) or {}
    out = {}
    for k, v in raw.items():
        out[k] = v.get("ko") if isinstance(v, dict) else v
    return out


def _collect(years_map, period):
    """기간에 속하는 (날짜, 값)만 고른다. 달력으로 센다 — 색인으로 자르지 않는다."""
    _, start, end = rp.parse(period)
    out = []
    for y in range(start.year, end.year + 1):
        arr = years_map.get(str(y))
        if not arr:
            continue
        for d, v in zip(_year_dates(y, len(arr)), arr):
            if start <= d <= end and v is not None:
                out.append((d, float(v)))
    return out


def _period_mean(years_map, period):
    vals = _collect(years_map, period)
    if not vals:
        return None, 0
    return sum(v for _, v in vals) / len(vals), len(vals)


def _same_period_in(year, period):
    """'2026-08'을 다른 해의 같은 기간으로 옮긴다. 분기·연간도 같은 규칙."""
    kind, start, _ = rp.parse(period)
    if kind == rp.YEAR:
        return str(year)
    if kind == rp.QUARTER:
        return "%d-Q%d" % (year, (start.month - 1) // 3 + 1)
    return "%d-%02d" % (year, start.month)


def _daily_baseline(years_map, period):
    """(월, 일) → 평년값. 윤년 2월 29일은 윤년만 기여한다 — 그래서 날짜로 센다."""
    _, start, end = rp.parse(period)
    need = set()
    cur = start
    while cur <= end:
        need.add((cur.month, cur.day))
        cur = date.fromordinal(cur.toordinal() + 1)
    acc = {}
    for y in range(BASE_FROM, BASE_TO + 1):
        arr = years_map.get(str(y))
        if not arr:
            continue
        for d, v in zip(_year_dates(y, len(arr)), arr):
            key = (d.month, d.day)
            if v is None or key not in need:
                continue
            acc.setdefault(key, []).append(float(v))
    return {k: sum(v) / len(v) for k, v in acc.items() if v}


def analyze(doc, dataset, region, period):
    """한 지역·한 기간의 실측 요약. 값이 없으면 None — 0 으로 채우지 않는다."""
    spec = DATASETS[dataset]
    years = _series_of(doc, dataset, region)
    if not years:
        return None
    expected = len(rp.days(period))
    mean, n_days = _period_mean(years, period)
    if mean is None or expected == 0:
        return None
    coverage = n_days / expected
    if coverage < MIN_COVERAGE:
        return {"region": region, "dataLabel": "INSUFFICIENT_DATA", "coverage": round(coverage, 3),
                "days": n_days, "expectedDays": expected,
                "detail": "기간의 %d%%만 있다" % round(coverage * 100)}

    # 평년: 같은 기간을 1991~2020 에서 잘라 해마다 평균 낸 뒤 그 평균
    base_years = []
    for y in range(BASE_FROM, BASE_TO + 1):
        m, k = _period_mean(years, _same_period_in(y, period))
        if m is not None and k / expected >= MIN_COVERAGE:
            base_years.append(m)
    if len(base_years) < MIN_BASE_YEARS:
        return {"region": region, "dataLabel": "INSUFFICIENT_DATA", "coverage": round(coverage, 3),
                "days": n_days, "expectedDays": expected,
                "detail": "평년 표본이 %d년뿐이다" % len(base_years)}
    baseline = sum(base_years) / len(base_years)
    spread = (sum((b - baseline) ** 2 for b in base_years) / len(base_years)) ** 0.5

    # 순위: 이 자료가 가진 모든 해 중 같은 기간끼리
    hist = []
    for ys in sorted(years):
        if not ys.isdigit():
            continue
        m, k = _period_mean(years, _same_period_in(int(ys), period))
        if m is not None and k / expected >= MIN_COVERAGE:
            hist.append((m, int(ys)))
    this_year = rp.parse(period)[1].year
    ranked = sorted(hist, key=lambda x: -x[0])
    rank_high = next((i + 1 for i, (_, y) in enumerate(ranked) if y == this_year), None)
    rank_low = (len(ranked) - rank_high + 1) if rank_high else None

    # 지속: 이 기간에 평년보다 따뜻했던(얼음은 적었던) 날이 며칠이고, 가장 길게 몇 날 이어졌나
    dbase = _daily_baseline(years, period)
    warm_days, run, best_run = 0, 0, 0
    for d, v in _collect(years, period):
        b = dbase.get((d.month, d.day))
        if b is None:
            continue
        warmer = (v > b) if spec["higherIsWarmer"] else (v < b)
        if warmer:
            warm_days += 1
            run += 1
            best_run = max(best_run, run)
        else:
            run = 0

    anomaly = mean - baseline
    return {
        "region": region,
        "regionLabel": regions_of(doc, dataset).get(region, region),
        "regionLabelEn": region_label_en(region),
        "dataLabel": "DATA_COMPLETE" if coverage >= 0.99 else "DATA_PARTIAL",
        "coverage": round(coverage, 3),
        "days": n_days,
        "expectedDays": expected,
        "mean": round(mean, 3),
        "baseline": round(baseline, 3),
        "baselineSpread": round(spread, 3),
        "baselineYears": len(base_years),
        "anomaly": round(anomaly, 3),
        # 몇 도가 큰지는 지역마다 다르다. 평년의 해간 표준편차로 나눠 비교 가능하게 만든다.
        "anomalySigma": round(anomaly / spread, 3) if spread > 0 else None,
        "rankHigh": rank_high,
        "rankLow": rank_low,
        "ofYears": len(ranked),
        "warmSideDays": warm_days,
        "longestRun": best_run,
        "higherIsWarmer": spec["higherIsWarmer"],
    }


def build_facts(doc, dataset, period, regions=None):
    """§5 ReportFact. 자료가 부족한 지역은 팩트를 만들지 않는다."""
    spec = DATASETS[dataset]
    names = regions_of(doc, dataset)
    facts = []
    for region in (regions or names):
        a = analyze(doc, dataset, region, period)
        if not a or a.get("dataLabel") == "INSUFFICIENT_DATA":
            continue
        label = names.get(region, region)
        base = "%s:%s:%s" % (rp.label(period), dataset, region)
        comparison = {
            "baselineFrom": BASE_FROM, "baselineTo": BASE_TO,
            "baselineValue": a["baseline"], "baselineYears": a["baselineYears"],
            "anomaly": a["anomaly"], "anomalySigma": a["anomalySigma"],
            "rankHigh": a["rankHigh"], "rankLow": a["rankLow"], "ofYears": a["ofYears"],
            # '이 자료 안에서의 순위'라는 사실을 팩트 자체가 들고 다닌다
            "rankScope": spec["source"],
            "regionKey": region, "regionLabel": label,
            "regionLabelEn": region_label_en(region), "dataset": dataset,
            "higherIsWarmer": spec["higherIsWarmer"],
            "dataLabel": a["dataLabel"],
        }
        facts.append(rc.make_fact(
            fact_id="fact:%s:mean" % base, phenomenon_id=spec["phenomenon"], metric="mean",
            value=a["mean"], unit=spec["unit"], period=rp.label(period),
            source="%s · %s" % (spec["source"], label), truth_type="EARTHUS_ANALYSIS",
            comparison=comparison, sample_count=a["days"],
            evidence_refs=[spec["ref"]], layer_refs=spec["layerRefs"]))
        facts.append(rc.make_fact(
            fact_id="fact:%s:anomaly" % base, phenomenon_id=spec["anomalyPhenomenon"],
            metric="anomaly", value=a["anomaly"], unit=spec["unit"], period=rp.label(period),
            source="%s · %s · 평년 %d~%d" % (spec["source"], label, BASE_FROM, BASE_TO),
            truth_type="EARTHUS_ANALYSIS", comparison=comparison, sample_count=a["days"],
            evidence_refs=[spec["ref"]], layer_refs=spec["layerRefs"]))
        facts.append(rc.make_fact(
            fact_id="fact:%s:warm_side_days" % base, phenomenon_id=spec["anomalyPhenomenon"],
            metric="days_on_warm_side" if spec["higherIsWarmer"] else "days_below_baseline",
            value=a["warmSideDays"], unit="day", period=rp.label(period),
            source="%s · %s" % (spec["source"], label), truth_type="EARTHUS_ANALYSIS",
            comparison=dict(comparison, expectedDays=a["expectedDays"], longestRun=a["longestRun"]),
            sample_count=a["days"], evidence_refs=[spec["ref"]], layer_refs=spec["layerRefs"]))
    return facts


def coverage(doc, dataset, period):
    """이 기간을 말할 수 있는가. 없으면 왜 없는지 함께 돌려준다."""
    names = regions_of(doc, dataset)
    if not names:
        return {"ok": False, "reason": "NO_OBSERVATION_ARCHIVE", "detail": "지역 목록이 없다"}
    ok = [r for r in names if (analyze(doc, dataset, r, period) or {}).get("mean") is not None]
    if not ok:
        return {"ok": False, "reason": "NO_OBSERVATION_ARCHIVE",
                "detail": "%s 에 쓸 수 있는 지역이 없다" % rp.label(period)}
    return {"ok": True, "regions": len(ok), "of": len(names)}


class ClimateSeriesAdapter(ForecastAdapter):
    """§8 계약을 채우되, 이 자료에는 **예보가 없다**는 사실을 그대로 말한다."""

    def __init__(self, dataset):
        spec = DATASETS[dataset]
        self.dataset = dataset
        self.phenomenon_id = spec["phenomenon"]
        self.source = spec["source"]
        self.model_id = None            # 관측 자료다. 모델이 아니다.
        self.model_version = None

    def input_window(self, doc):
        return None                      # 예보 스냅샷이 없다

    def output_window(self, doc):
        names = list(regions_of(doc, self.dataset))
        if not names:
            return None
        years = [k for k in (_series_of(doc, self.dataset, names[0]) or {}) if k.isdigit()]
        return {"from": "%s-01-01" % min(years), "to": "%s-12-31" % max(years)} if years else None

    def normalize(self, doc, period):
        return build_facts(doc, self.dataset, period)

    def evaluate(self, doc, period):
        # 관측 이력이지 예보가 아니다. 채점할 예보가 없으므로 점수를 만들지 않는다.
        return self.unavailable("NO_SOURCE", "관측 이력 자료다 — 채점할 예보 스냅샷이 없다")


def period_series(doc, dataset, region, period, min_coverage=MIN_COVERAGE):
    """해마다 같은 기간의 평균. {연도: 값} — 교차도메인 상관을 낼 때 쓴다.

    기간을 못 채운 해는 넣지 않는다. 반쯤 빈 해를 넣으면 상관이 그 해에 끌려간다.
    """
    years = _series_of(doc, dataset, region)
    expected = len(rp.days(period))
    out = {}
    for ys in years:
        if not ys.isdigit():
            continue
        m, k = _period_mean(years, _same_period_in(int(ys), period))
        if m is not None and expected and k / expected >= min_coverage:
            out[int(ys)] = m
    return out

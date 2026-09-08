# -*- coding: utf-8 -*-
"""스토리 엔진 — FACT → SIGNIFICANCE → STORY (PHASE 8 §1).

파이프라인
  REPORT FACTS → 품질 거르기 → 중요도 → 묶기 → 지속 → 공간 범위
               → 교차도메인 → TOP STORIES → (서술은 narrative 가)

⚠️ 스토리는 **값을 담지 않는다.** factIds 로 팩트를 가리킨다.
   스토리에만 있는 숫자가 생기면 팩트를 고쳐도 보고서가 안 바뀐다 — 유령 숫자가 된다.

⚠️ 제목·요약은 여기서 **결정적으로** 만든다. LLM 이 아니다.
   그리고 문장에 쓴 숫자는 전부 그 스토리가 가리키는 팩트에서 뽑을 수 있어야 한다
   (narrative.validate_report_narrative 가 실제로 대조한다).

⚠️ 중요도는 위험도가 아니다. 제목에 '위험'·'경보' 같은 말을 쓰지 않는다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "adapters"))

import report_contract as rc            # noqa: E402
import report_period as rp              # noqa: E402
import significance as sig              # noqa: E402
import climate_series_adapter as cs     # noqa: E402

EXTREME_RANK = 3            # 기록 상·하위 3위 안이면 EXTREME
PERSISTENT_RATIO = 0.8      # 기간의 80% 이상 이어지면 PERSISTENT
WIDESPREAD_RATIO = 0.7      # 같은 방향 지역이 70% 이상이면 WIDESPREAD
FAST_CHANGE_SIGMA = 1.0     # 직전 기간 대비 편차가 1σ 넘게 움직이면 FAST_CHANGE
TOP_STORIES = 5

WHAT = {"sst": "해수면온도", "land_temp": "기온", "seaice": "해빙 면적", "korea_temp": "기온"}
WHAT_EN = {"sst": "sea surface temperature", "land_temp": "air temperature",
           "seaice": "sea ice extent", "korea_temp": "air temperature"}
PHEN_EN = {"weather.temperature": "temperature", "weather.wind": "wind"}
UNIT_TEXT = {"degC": "℃", "10^6 km2": "만 km²", "m/s": "m/s", "day": "일"}


# ── 1. 품질 거르기 ───────────────────────────────────────────────────────────
def quality_filter(facts):
    """§1 첫 단계. 못 믿을 팩트를 스토리로 만들지 않는다.

    거르는 것: 값이 없다 · 현상이 없다 · 표본이 0 이하 · 자료 라벨이 INSUFFICIENT
    """
    out = []
    for f in facts or []:
        if f.get("value") is None or not f.get("phenomenonId"):
            continue
        n = f.get("sampleCount")
        if n is not None and n <= 0:
            continue
        if (f.get("comparison") or {}).get("dataLabel") == "INSUFFICIENT_DATA":
            continue
        out.append(f)
    return out


def index_facts(facts):
    """(자료, 지역) → factId 목록. 스토리가 팩트를 가리킬 때 쓴다."""
    idx = {}
    for f in facts:
        c = f.get("comparison") or {}
        ds, reg = c.get("dataset"), c.get("regionKey")
        if ds and reg:
            idx.setdefault((ds, reg), []).append(f["factId"])
    return idx


# ── 2. 공간 범위 ─────────────────────────────────────────────────────────────
def spatial_extent(analyses, dataset, warm_side):
    """같은 자료 안에서 같은 방향으로 움직인 지역의 비율. 한 지역뿐이면 None."""
    same = [a for (ds, _), a in analyses.items() if ds == dataset and a.get("anomaly") is not None]
    if len(same) < 2:
        return None
    hits = 0
    for a in same:
        w = (a["anomaly"] > 0) == bool(a.get("higherIsWarmer", True))
        if w == warm_side:
            hits += 1
    return hits / len(same)


# ── 3. 스토리 만들기 ─────────────────────────────────────────────────────────
def _warm_side(a):
    return (a["anomaly"] > 0) == bool(a.get("higherIsWarmer", True))


def _classify(a, extent, prev):
    """스토리 종류. 하나만 고른다 — 가장 강한 이유를 앞세운다."""
    n = a.get("ofYears") or 0
    ranks = [x for x in (a.get("rankHigh"), a.get("rankLow")) if x]
    if n >= 10 and ranks and min(ranks) <= EXTREME_RANK:
        return "EXTREME"
    exp = a.get("expectedDays") or 0
    if exp and (a.get("longestRun") or 0) / exp >= PERSISTENT_RATIO:
        return "PERSISTENT"
    if extent is not None and extent >= WIDESPREAD_RATIO:
        return "WIDESPREAD"
    if prev and prev.get("anomalySigma") is not None and a.get("anomalySigma") is not None:
        if abs(a["anomalySigma"] - prev["anomalySigma"]) >= FAST_CHANGE_SIGMA:
            return "FAST_CHANGE"
    return None


def _unit(u):
    return UNIT_TEXT.get(u, u or "")


# 한국어 서수. 3위인데 "가장"이라고 쓰면 그건 그냥 틀린 문장이다.
_ORDINAL = {1: None, 2: "두 번째로", 3: "세 번째로", 4: "네 번째로", 5: "다섯 번째로"}


def _ordinal_ko(n):
    if n == 1:
        return "가장"
    return _ORDINAL.get(n) or ("%d번째로" % n)


def _rank_word(a):
    """이 자료 안에서 어느 쪽 끝인가. '역사상'이라고 쓰지 않는다.

    ⚠️ 순위를 무시하고 늘 '가장'이라고 쓰면 3위가 1위로 둔갑한다.
       서수를 순위에서 직접 만든다.
    """
    high, low = a.get("rankHigh"), a.get("rankLow")
    warm = bool(a.get("higherIsWarmer", True))
    if high and (not low or high <= low):
        return ("%s %s" % (_ordinal_ko(high), "높은" if warm else "많은"), high, "높은" if warm else "많은")
    if low:
        return ("%s %s" % (_ordinal_ko(low), "낮은" if warm else "적은"), low, "낮은" if warm else "적은")
    return (None, None, None)


def _period_word(period):
    kind, start, _ = rp.parse(period)
    if kind == rp.MONTH:
        return "%d월" % start.month
    if kind == rp.QUARTER:
        return "%d분기" % ((start.month - 1) // 3 + 1)
    return "한 해"


_MONTH_EN = ("", "January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December")


def _period_word_en(period):
    kind, start, _ = rp.parse(period)
    if kind == rp.MONTH:
        return _MONTH_EN[start.month]
    if kind == rp.QUARTER:
        return "Q%d" % ((start.month - 1) // 3 + 1)
    return "the year"


def _ordinal_en(n):
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return "%d%s" % (n, suf)


def climate_stories(analyses, facts, period, report_id, *, prev_analyses=None, link_count=None):
    """기후 시계열 → 스토리. 종류가 안 붙는 지역은 스토리로 만들지 않는다."""
    prev_analyses = prev_analyses or {}
    link_count = link_count or {}
    idx = index_facts(facts)
    by_fact = {f["factId"]: f for f in facts}
    out = []
    for (ds, reg), a in sorted(analyses.items()):
        if a.get("anomaly") is None or a.get("dataLabel") == "INSUFFICIENT_DATA":
            continue
        fact_ids = idx.get((ds, reg))
        if not fact_ids:
            continue
        warm = _warm_side(a)
        extent = spatial_extent(analyses, ds, warm)
        kind = _classify(a, extent, prev_analyses.get((ds, reg)))
        if not kind:
            continue
        spec = cs.DATASETS[ds]
        n_links = link_count.get((ds, reg), 0)
        factors = sig.factors_from_climate(
            a, spatial_extent=extent,
            cross_domain=min(1.0, n_links / 2.0) if n_links else None)
        scored = sig.score(spec["anomalyPhenomenon"], factors)
        if scored["score"] is None:
            continue

        label = a.get("regionLabel") or reg
        what = WHAT.get(ds, ds)
        anomaly_fact = next((by_fact[i] for i in fact_ids if i.endswith(":anomaly")), None)
        unit = _unit((anomaly_fact or {}).get("unit"))
        word, rank, side = _rank_word(a)

        label_en = a.get("regionLabelEn") or reg
        what_en = WHAT_EN.get(ds, ds)
        high_side = bool(a.get("rankHigh")) and (not a.get("rankLow")
                                                 or a["rankHigh"] <= a["rankLow"])
        side_en = ("highest" if spec["higherIsWarmer"] else "largest") if high_side             else ("lowest" if spec["higherIsWarmer"] else "smallest")

        if kind == "EXTREME" and word:
            title = "%s %s, 이 자료 %d년 중 %s %s" % (
                label, what, a["ofYears"], word, _period_word(period))
            title_en = "%s %s: %s %s in this %d-year record" % (
                label_en, what_en,
                ("the " + side_en) if rank == 1 else (_ordinal_en(rank) + " " + side_en),
                _period_word_en(period), a["ofYears"])
        elif kind == "PERSISTENT":
            title = "%s %s, %s 내내 평년을 벗어났습니다" % (label, what, _period_word(period))
            title_en = "%s %s stayed off normal all through %s" % (
                label_en, what_en, _period_word_en(period))
        elif kind == "WIDESPREAD":
            title = "%s %s, 같은 방향으로 움직인 지역이 넓었습니다" % (label, what)
            title_en = "%s %s moved the same way across a wide area" % (label_en, what_en)
        else:
            title = "%s %s, 직전 기간과 크게 달라졌습니다" % (label, what)
            title_en = "%s %s changed sharply from the previous period" % (label_en, what_en)

        parts = ["평년(%d~%d)보다 %+.3f%s 였습니다." % (
            cs.BASE_FROM, cs.BASE_TO, a["anomaly"], unit)]
        parts_en = ["%+.3f%s against the %d-%d normal." % (
            a["anomaly"], unit, cs.BASE_FROM, cs.BASE_TO)]
        if a.get("expectedDays"):
            parts.append("%d일 중 %d일이 평년의 %s 쪽이었고, 가장 길게 %d일 이어졌습니다." % (
                a["expectedDays"], a["warmSideDays"],
                "따뜻한" if spec["higherIsWarmer"] else "적은", a["longestRun"]))
            parts_en.append("%d of %d days sat on the %s side of normal, the longest run %d days." % (
                a["warmSideDays"], a["expectedDays"],
                "warm" if spec["higherIsWarmer"] else "low", a["longestRun"]))
        if rank and rank > 1:
            # 1위는 제목이 이미 말했다. 2위 아래만 순위를 덧붙인다.
            parts.append("이 자료의 %d년 가운데 %d번째로 %s 값입니다." % (a["ofYears"], rank, side))
            parts_en.append("That is the %s %s value in the %d years this dataset holds." % (
                _ordinal_en(rank), side_en, a["ofYears"]))

        out.append(rc.make_story(
            story_id="story:%s:%s.%s" % (rp.label(period), ds, reg),
            report_id=report_id,
            title=title,
            summary=" ".join(parts),
            title_en=title_en,
            summary_en=" ".join(parts_en),
            importance_score=scored["score"],
            confidence=factors.get("confidence"),
            story_type=kind,
            phenomenon_ids=[spec["phenomenon"], spec["anomalyPhenomenon"]],
            fact_ids=fact_ids,
            source_refs=[spec["ref"]],
            temporal_extent={"from": rp.parse(period)[1].isoformat(),
                             "to": rp.parse(period)[2].isoformat(),
                             "days": a.get("days"), "longestRun": a.get("longestRun")},
            spatial_extent={"scope": ds, "region": reg, "regionLabel": label,
                            "regionLabelEn": label_en,
                            "sameDirectionShare": round(extent, 3) if extent is not None else None},
            comparison=(anomaly_fact or {}).get("comparison"),
            factors=scored,
        ))
    return out


def cross_domain_stories(links, period, report_id, *, analyses=None):
    """§4 링크 → 스토리. 근거 수준이 곧 표현 강도다 — 문장이 그걸 넘지 못한다."""
    out = []
    for L in links or []:
        corr = (L.get("notes") or {}).get("correlation") or {}
        rd, n = corr.get("rDetrended"), corr.get("n") or 0
        strength = min(1.0, abs(rd)) if rd is not None else 0.3
        factors = {"cross_domain": strength,
                   "confidence": min(1.0, float(L.get("confidence") or 0.5)),
                   "rarity": 1.0 if (L.get("notes") or {}).get("bothExtreme") else 0.4}
        scored = sig.score(sig.CROSS_DOMAIN_KEY, factors)
        if scored["score"] is None:
            continue
        out.append(rc.make_story(
            story_id="story:%s" % L["linkId"].replace("link:", "x:"),
            report_id=report_id,
            title=L["explanation"]["ko"].split(".")[0] + ".",
            summary=L["explanation"]["ko"],
            title_en=(L["explanation"].get("en") or "").split(".")[0] + "." if L["explanation"].get("en") else None,
            summary_en=L["explanation"].get("en"),
            importance_score=scored["score"],
            confidence=L.get("confidence"),
            story_type="CROSS_DOMAIN",
            phenomenon_ids=[L["sourcePhenomenon"], L["targetPhenomenon"]],
            fact_ids=L["factRefs"],
            temporal_extent={"from": rp.parse(period)[1].isoformat(),
                             "to": rp.parse(period)[2].isoformat()},
            comparison={"correlation": corr},
            factors=scored,
            evidence_level=L["evidenceLevel"],
        ))
    return out


def forecast_stories(facts, verifications, surprises, period, report_id):
    """§1 FORECAST_HIT · FORECAST_MISS.

    ⚠️ 모델 비교는 **같은 변수·같은 리드·같은 기간**끼리만 한다(§10).
       비교 가능성이 확인되지 않으면 '어느 쪽이 나았다'를 쓰지 않는다.
    """
    out = []
    # (현상, 리드) → [(모델, mae, 표본, factId)]
    groups = {}
    for f in facts or []:
        c = f.get("comparison") or {}
        if f.get("metric") != "mae" or not c.get("modelId") or c.get("leadHours") is None:
            continue
        groups.setdefault((f["phenomenonId"], c["leadHours"]), []).append(
            (c["modelId"], f["value"], f.get("sampleCount"), f["factId"]))

    for (phen, lead), rows in sorted(groups.items()):
        if len(rows) < 2:
            continue                      # 비교 상대가 없으면 비교하지 않는다
        samples = [r[2] for r in rows if r[2]]
        if len(samples) != len(rows) or min(samples) < 100:
            continue                      # 표본 없는 비교 금지(§0-7)
        # 표본 수가 크게 다르면 같은 조건이 아니다 — 비교하지 않는다.
        if max(samples) > 1.1 * min(samples):
            continue
        rows.sort(key=lambda r: r[1])
        best, worst = rows[0], rows[-1]
        if best[1] >= worst[1]:
            continue
        gap = worst[1] - best[1]
        factors = {"forecast_surprise": min(1.0, gap / max(worst[1], 1e-9)),
                   "magnitude": min(1.0, worst[1] / 5.0),
                   "confidence": 1.0}
        scored = sig.score(sig.FORECAST_KEY, factors)
        name = {"weather.temperature": "기온", "weather.wind": "바람"}.get(phen, phen)
        out.append(rc.make_story(
            story_id="story:%s:forecast:%s:%dh" % (rp.label(period), phen, lead),
            report_id=report_id,
            title="%s %d시간 예보는 %s 쪽이 더 정확했습니다" % (name, lead, best[0]),
            summary=("평균절대오차가 %s %s · %s %s 였습니다(표본 %d, 같은 기간·같은 지점)."
                     % (best[0], best[1], worst[0], worst[1], min(samples))),
            title_en="%s at %dh: %s was the more accurate" % (
                PHEN_EN.get(phen, phen), lead, best[0]),
            summary_en=("Mean absolute error %s %s vs %s %s (n=%d, same period and stations)."
                        % (best[0], best[1], worst[0], worst[1], min(samples))),
            importance_score=scored["score"],
            confidence=1.0,
            story_type="FORECAST_HIT",
            phenomenon_ids=[phen],
            fact_ids=[r[3] for r in rows],
            temporal_extent={"from": rp.parse(period)[1].isoformat(),
                             "to": rp.parse(period)[2].isoformat()},
            comparison={"leadHours": lead, "models": [r[0] for r in rows],
                        "sampleCount": min(samples)},
            factors=scored,
        ))

    # 치우친 오차 = 우리가 예상과 달랐던 곳
    fact_by_model_lead = {}
    for f in facts or []:
        c = f.get("comparison") or {}
        if c.get("modelId") and c.get("leadHours") is not None:
            fact_by_model_lead.setdefault(
                (f["phenomenonId"], c["modelId"], c["leadHours"]), []).append(f["factId"])
    for s in surprises or []:
        key = (s.get("phenomenonId"), s.get("modelId"), s.get("leadHours"))
        refs = fact_by_model_lead.get(key)
        if not refs:
            continue
        factors = {"forecast_surprise": s["systematicRatio"],
                   "magnitude": min(1.0, abs(s["bias"]) / 2.0), "confidence": 1.0}
        scored = sig.score(sig.FORECAST_KEY, factors)
        name = {"weather.temperature": "기온", "weather.wind": "바람"}.get(
            s["phenomenonId"], s["phenomenonId"])
        out.append(rc.make_story(
            story_id="story:%s:miss:%s:%s:%sh" % (
                rp.label(period), s["phenomenonId"], s["modelId"], s["leadHours"]),
            report_id=report_id,
            # ⚠️ 제목에 모델 이름을 넣는다. 안 넣으면 GFS 와 ECMWF 두 줄이 글자까지
            #    똑같아 보여서, 목록에서 어느 쪽 이야기인지 알 수 없다.
            title="%s %s %s시간 예보가 한쪽으로 치우쳤습니다" % (
                s["modelId"], name, s["leadHours"]),
            summary=("%s 는 실측보다 %s 봤습니다 — 평균오차 %s, 평균절대오차 %s."
                     % (s["modelId"], s["directionKo"], s["bias"], s["mae"])),
            title_en="%s %s at %sh leaned one way" % (
                s["modelId"], PHEN_EN.get(s["phenomenonId"], s["phenomenonId"]), s["leadHours"]),
            summary_en=("%s ran %s against observations — mean error %s, mean absolute error %s."
                        % (s["modelId"], "high" if s["bias"] > 0 else "low", s["bias"], s["mae"])),
            importance_score=scored["score"],
            confidence=1.0,
            story_type="FORECAST_MISS",
            phenomenon_ids=[s["phenomenonId"]],
            fact_ids=refs,
            temporal_extent={"from": rp.parse(period)[1].isoformat(),
                             "to": rp.parse(period)[2].isoformat()},
            comparison={"modelId": s["modelId"], "leadHours": s["leadHours"],
                        "systematicRatio": s["systematicRatio"]},
            factors=scored,
        ))
    return out


def top_stories(all_stories, limit=TOP_STORIES):
    """§1 마지막 단계. 같은 자료의 같은 이야기로 목록이 채워지지 않게 다양성을 지킨다."""
    ranked = sig.rank_stories(all_stories)
    picked, seen_scope = [], {}
    for s in ranked:
        scope = (s.get("spatialExtent") or {}).get("scope") or s.get("storyType")
        if seen_scope.get(scope, 0) >= 2 and len(picked) < limit:
            continue          # 한 자료가 목록을 독차지하지 않게
        picked.append(s)
        seen_scope[scope] = seen_scope.get(scope, 0) + 1
        if len(picked) >= limit:
            break
    return picked

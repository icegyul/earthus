# -*- coding: utf-8 -*-
"""교차도메인 관계 (PHASE 8 §4).

EARTHUS 의 차별점이면서, 동시에 가장 거짓말하기 쉬운 자리다.

⚠️⚠️ "A 가 B 의 원인이다" 를 여기서 만들 수 없다.
   relation_type 목록에 인과가 없고, 설명 문장은 report_contract 의 FORBIDDEN_CAUSAL
   검사를 통과해야 한다. 통과 못 하면 링크 생성 자체가 실패한다.

⚠️ 상관은 인과가 아니고, **추세를 공유하는 상관은 상관도 아니다.**
   전지구 해수온과 육지 기온은 둘 다 40년간 올랐다. 그래서 원자료 상관계수는
   거의 항상 크게 나온다 — 그걸 근거라고 내밀면 "둘 다 더워졌다"를
   "둘이 연결돼 있다"로 바꿔 말하는 것뿐이다.
   그래서 **선형 추세를 뺀 뒤의 상관(rDetrended)** 으로 근거 수준을 정한다.
   원자료 상관도 같이 싣되, 판정에는 쓰지 않는다.

⚠️ 표본이 적으면 상관을 말하지 않는다. 8년치로 낸 r=0.9 는 우연이다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "adapters"))

import report_contract as rc            # noqa: E402
import report_period as rp              # noqa: E402
import climate_series_adapter as cs     # noqa: E402

MIN_YEARS = 20          # 이보다 짧으면 상관을 근거로 쓰지 않는다
R_ASSOCIATED = 0.5      # 추세 제거 후 이 정도면 '함께 움직였다'
R_CONNECTED = 0.7       # 이 정도면 '연결돼 있다'
EXTREME_RANK = 3        # 기록 상·하위 3위 안이면 이번 기간에 '극단'으로 본다

# 어떤 짝을 볼 것인가. 아무 짝이나 상관 내면 반드시 무언가는 걸린다(다중비교).
# 그래서 **물리적으로 볼 이유가 있는 짝만** 미리 적어 둔다.
#
# expectedSign 은 '알려진 관계라면 상관이 어느 쪽이어야 하는가'다.
#   바다가 따뜻할수록 얼음은 적다 → 해수온과 해빙 면적은 음(-)의 상관이어야 한다.
# ⚠️ 부호가 기대와 반대로 나오면 "알려진 관계와 어긋나지 않는다"고 말하면 안 된다.
#    그건 근거가 반대인데 결론만 가져다 붙이는 것이다. 그럴 땐 링크를 만들지 않는다.
CANDIDATE_PAIRS = (
    # (자료A, 지역A, 자료B, 지역B, 관계, 물리적 방향, 기대 부호)
    ("sst", "global", "land_temp", "land", "TEMPORAL_ASSOCIATION", False, None),
    ("sst", "nh", "land_temp", "namerica", "TEMPORAL_ASSOCIATION", False, None),
    ("sst", "nh", "land_temp", "europe", "TEMPORAL_ASSOCIATION", False, None),
    ("sst", "nh", "land_temp", "asia", "TEMPORAL_ASSOCIATION", False, None),
    # 해수온과 해빙: 바다가 따뜻하면 얼음이 덜 언다는 관계는 교과서에 있다.
    # 그래도 '이번 달 얼음이 적은 원인이 해수온'이라고는 말하지 않는다.
    ("sst", "nh", "seaice", "arctic", "PHYSICAL_RELATION", True, -1),
    ("sst", "sh", "seaice", "antarctic", "PHYSICAL_RELATION", True, -1),
    ("land_temp", "arctic", "seaice", "arctic", "PHYSICAL_RELATION", True, -1),
)

R_PHYSICAL_MIN = 0.3    # 알려진 관계라도 이보다 약하면 근거라고 하지 않는다


def pearson(xs, ys):
    """표본 상관계수. 표본이 3 미만이거나 분산이 0 이면 None."""
    n = len(xs)
    if n < 3 or len(ys) != n:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    syy = sum((b - my) ** 2 for b in ys)
    if sxx <= 0 or syy <= 0:
        return None
    return sxy / (sxx * syy) ** 0.5


def _detrend(years, vals):
    """연도에 대한 선형 추세를 뺀 잔차. 공통 추세로 생기는 가짜 상관을 지운다."""
    n = len(years)
    if n < 3:
        return None
    mx, my = sum(years) / n, sum(vals) / n
    sxx = sum((y - mx) ** 2 for y in years)
    if sxx <= 0:
        return None
    slope = sum((y - mx) * (v - my) for y, v in zip(years, vals)) / sxx
    return [v - (my + slope * (y - mx)) for y, v in zip(years, vals)]


def correlate(doc_a, ds_a, reg_a, doc_b, ds_b, reg_b, period):
    """두 자료의 같은 기간 연도별 값끼리 상관. 겹치는 해만 쓴다."""
    sa = cs.period_series(doc_a, ds_a, reg_a, period)
    sb = cs.period_series(doc_b, ds_b, reg_b, period)
    years = sorted(set(sa) & set(sb))
    if len(years) < MIN_YEARS:
        return {"n": len(years), "r": None, "rDetrended": None,
                "reason": "표본이 %d년뿐이다" % len(years)}
    xa = [sa[y] for y in years]
    xb = [sb[y] for y in years]
    r = pearson(xa, xb)
    da, db = _detrend(years, xa), _detrend(years, xb)
    rd = pearson(da, db) if da and db else None
    return {"n": len(years), "yearsFrom": years[0], "yearsTo": years[-1],
            "r": round(r, 3) if r is not None else None,
            "rDetrended": round(rd, 3) if rd is not None else None}


def _is_extreme(a):
    if not a:
        return False
    n = a.get("ofYears") or 0
    if n < 10:
        return False
    ranks = [x for x in (a.get("rankHigh"), a.get("rankLow")) if x]
    return bool(ranks) and min(ranks) <= EXTREME_RANK


def _evidence_level(rd, n, both_extreme, physical, expected_sign, same_warm_dir):
    """근거 수준을 규칙으로 정한다. 문장 생성기가 마음대로 올리지 못하게.

    핵심: 알려진 물리 관계를 인용하려면 **이 자료의 상관 부호가 그 관계와 맞아야** 한다.
    부호가 반대인데 "어긋나지 않는다"고 쓰면, 근거가 반박하는 결론을 내놓는 셈이다.
    """
    strength = abs(rd) if rd is not None else 0.0
    sign_ok = (rd is not None and expected_sign is not None
               and (rd > 0) == (expected_sign > 0) and strength >= R_PHYSICAL_MIN)

    if physical:
        if sign_ok and strength >= 0.6 and n >= 30:
            return "POSSIBLE_INFLUENCE"
        if sign_ok:
            return "CONSISTENT_WITH"
        # 기대와 부호가 다르거나 너무 약하다 — 관계를 주장하지 않는다.
        return "COINCIDING" if both_extreme else None

    if strength >= R_CONNECTED and n >= 30:
        return "CONNECTED"
    if strength >= R_ASSOCIATED and n >= MIN_YEARS:
        return "ASSOCIATED"
    if both_extreme and same_warm_dir:
        return "COINCIDING"
    return None


def build_links(docs, analyses, period, *, fact_index=None):
    """§4 CrossDomainLink 목록.

    docs      {자료이름: 원문서}
    analyses  {(자료이름, 지역): analyze() 결과}
    fact_index {(자료이름, 지역): [factId …]} — 링크가 팩트를 가리키게 한다

    돌려주는 것: (링크 목록, 상관계수 팩트 목록)
    """
    fact_index = fact_index or {}
    links, facts = [], []
    for ds_a, reg_a, ds_b, reg_b, relation, physical, expected_sign in CANDIDATE_PAIRS:
        if ds_a not in docs or ds_b not in docs:
            continue
        a = analyses.get((ds_a, reg_a))
        b = analyses.get((ds_b, reg_b))
        if not a or not b or a.get("mean") is None or b.get("mean") is None:
            continue
        refs = list(fact_index.get((ds_a, reg_a), [])) + list(fact_index.get((ds_b, reg_b), []))
        if not refs:
            continue   # 팩트 없이 관계를 주장하지 않는다

        corr = correlate(docs[ds_a], ds_a, reg_a, docs[ds_b], ds_b, reg_b, period)
        rd, n = corr.get("rDetrended"), corr.get("n") or 0
        both_extreme = _is_extreme(a) and _is_extreme(b)

        # '같은 방향'의 뜻은 자료마다 다르다. 얼음은 적을수록 따뜻한 쪽이다.
        warm_a = (a["anomaly"] > 0) == bool(a.get("higherIsWarmer", True))
        warm_b = (b["anomaly"] > 0) == bool(b.get("higherIsWarmer", True))
        sign_matches = warm_a == warm_b

        level = _evidence_level(rd, n, both_extreme, physical, expected_sign, sign_matches)
        if not level:
            continue

        # 상관이 근거일 때만 관계 종류를 통계로 바꾼다.
        rel = relation
        if rd is not None and abs(rd) >= R_ASSOCIATED and n >= MIN_YEARS and not physical:
            rel = "STATISTICAL_ASSOCIATION"
        if level == "POSSIBLE_INFLUENCE":
            rel = "POSSIBLE_INFLUENCE"

        # 상관계수도 **팩트**다. 근거 없이 문장에만 등장하는 숫자를 만들지 않는다.
        corr_fact = None
        if rd is not None:
            corr_fact = rc.make_fact(
                fact_id="fact:%s:corr:%s.%s~%s.%s" % (rp.label(period), ds_a, reg_a, ds_b, reg_b),
                phenomenon_id=cs.DATASETS[ds_a]["phenomenon"],
                metric="correlation_detrended",
                value=rd, unit=None, period=rp.label(period),
                source="%s vs %s (선형 추세 제거)" % (cs.DATASETS[ds_a]["source"],
                                                     cs.DATASETS[ds_b]["source"]),
                truth_type="EARTHUS_ANALYSIS",
                comparison=dict(corr),
                sample_count=n,
                evidence_refs=[cs.DATASETS[ds_a]["ref"], cs.DATASETS[ds_b]["ref"]])
            facts.append(corr_fact)
            refs = refs + [corr_fact["factId"]]

        la = _label(docs[ds_a], ds_a, reg_a)
        lb = _label(docs[ds_b], ds_b, reg_b)
        phrase = rc.EVIDENCE_PHRASE[level]["ko"]
        # ⚠️ 문장에 쓰는 숫자는 팩트 값과 **글자까지 같아야** 한다.
        #    %.2f 로 줄이면 0.548 이 0.55 로 찍혀, 보고서에 팩트에 없는 숫자가 실린다.
        #    서술 검증기가 그걸 잡아 발행을 막는다 — 막히는 게 옳다.
        detail = ("추세를 뺀 뒤 상관 %s (겹치는 %d년)" % (rd, n)) if rd is not None \
            else ("겹치는 해가 %d년이라 상관은 쓰지 않았습니다" % n)
        subject = "%s%s %s" % (la, _josa(la, "와"), lb)
        detail_en = ("detrended correlation %s over %d overlapping years" % (rd, n))             if rd is not None else ("only %d overlapping years, so no correlation was used" % n)
        links.append(rc.make_cross_domain_link(
            link_id="link:%s:%s.%s~%s.%s" % (rp.label(period), ds_a, reg_a, ds_b, reg_b),
            source_phenomenon=cs.DATASETS[ds_a]["phenomenon"],
            target_phenomenon=cs.DATASETS[ds_b]["phenomenon"],
            relation_type=rel,
            evidence_level=level,
            fact_refs=refs,
            confidence=min(a.get("coverage", 1), b.get("coverage", 1)),
            period=rp.label(period),
            explanation_ko="%s%s %s. %s." % (subject, _josa(lb, "가"), phrase, detail),
            explanation_en="%s and %s %s. %s." % (
                _label_en(ds_a, reg_a), _label_en(ds_b, reg_b),
                rc.EVIDENCE_PHRASE[level]["en"], detail_en),
            notes={"correlation": corr, "bothExtreme": both_extreme,
                   "sameWarmDirection": sign_matches,
                   "caveat": "상관은 방향을 말하지 않습니다. 추세를 제거한 값으로 판정했습니다."},
        ))
    return links, facts


def _label(doc, dataset, region):
    """'전 육지 육지 기온' 같은 중복을 만들지 않는다 — 지역 이름 + 무엇 하나씩."""
    names = cs.regions_of(doc, dataset)
    what = {"sst": "해수면온도", "land_temp": "기온",
            "seaice": "해빙 면적", "korea_temp": "기온"}.get(dataset, dataset)
    region_label = names.get(region, region)
    if what in region_label:
        return region_label
    return "%s %s" % (region_label, what)


WHAT_EN = {"sst": "sea surface temperature", "land_temp": "air temperature",
           "seaice": "sea ice extent", "korea_temp": "air temperature"}


def _label_en(dataset, region):
    return "%s %s" % (cs.region_label_en(region), WHAT_EN.get(dataset, dataset))


# 한국어 조사. 받침이 있으면 '과/이', 없으면 '와/가'.
_JOSA = {"와": ("와", "과"), "가": ("가", "이"), "는": ("는", "은")}


def _josa(word, kind):
    """앞말의 받침에 따라 조사를 고른다. 화면에 나가는 문장이라 틀리면 티가 난다."""
    pair = _JOSA.get(kind)
    if not pair or not word:
        return kind
    ch = word.strip()[-1]
    if not ("가" <= ch <= "힣"):
        return pair[0]
    has_final = (ord(ch) - 0xAC00) % 28 != 0
    return pair[1] if has_final else pair[0]

# -*- coding: utf-8 -*-
"""보고서 조립 — PHASE 8 §5 · §6 · §7 · §11.

팩트·스토리·관계·놀란 점·전망을 한 보고서로 묶는다. 계산은 전부 앞 단계가 끝냈다.

§5 월간   사건 중심. "이번 달 지구에 무슨 일이 있었나"
§6 분기   패턴 중심. 한 달짜리 사건보다 **3개월 이어진 변화**가 주인공이다
§7 연간   기억 중심. "그 해를 한눈에"

⚠️ 모든 절을 억지로 채우지 않는다(§5). 내용이 없으면 셋 중 하나다 — 축약·생략·자료부족.
   그런데 **생략과 자료부족을 구분한다.** 절을 통째로 지우면 독자는 그런 주제가
   아예 없다고 읽는다. 그래서 절은 남기고 dataLabel 로 왜 비었는지 말한다.

⚠️ 자료 라벨은 사실에서 나온다(§11). 손으로 붙이지 않는다.
   DATA_COMPLETE  쓸 자료가 다 있었다
   DATA_PARTIAL   일부만 있었다
   INSUFFICIENT_DATA  말할 만큼이 없었다
   NOT_EVALUABLE  애초에 평가할 대상이 없었다 (예: 우리 예보가 없는 현상)

⚠️ 이 파일은 문장을 만들지 않는다. 제목·요약은 stories 가, 채점 문장은 narrative 가 만든다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import report_contract as rc      # noqa: E402
import report_period as rp        # noqa: E402

# ── §5 월간 절 구성 ──────────────────────────────────────────────────────────
MONTHLY_LAYOUT = (
    ("cover", "표지", "Cover"),
    ("this_month", "이번 달의 지구", "This month on Earth"),
    ("top_stories", "가장 큰 변화", "Top Earth stories"),
    ("snapshot", "숫자로 본 지구", "Earth snapshot"),
    ("weather", "날씨", "Weather"),
    ("ocean", "바다", "Ocean"),
    ("land", "땅", "Land"),
    ("hazards", "재해", "Hazards"),
    ("people", "사람과 이동", "People / travel"),
    ("space", "우주", "Space"),
    ("what_surprised_us", "예상과 달랐던 것", "What surprised us"),
    ("forecast_review", "지난달 전망은 얼마나 맞았나", "Last month's forecast review"),
    ("what_we_got_wrong", "우리가 틀린 것", "What we got wrong"),
    ("next_outlook", "다음 달 전망", "Next month outlook"),
    ("explore", "지구를 직접 보기", "Explore the Earth"),
)

# ── §6 분기: 사건보다 **패턴** ───────────────────────────────────────────────
QUARTERLY_LAYOUT = (
    ("cover", "표지", "Cover"),
    ("quarter_in_one_page", "한 장으로 보는 분기", "The quarter in one page"),
    ("timeline", "3개월 지구 연표", "3-month Earth timeline"),
    ("persistent_changes", "계속된 변화", "Persistent changes"),
    ("reversals", "뒤집힌 것", "Reversals"),
    ("extremes", "극단값", "Extremes"),
    ("cross_domain", "분야를 가로지른 이야기", "Cross-domain stories"),
    ("regional", "지역 차이", "Regional differences"),
    ("forecast_performance", "예보 성적", "Forecast performance"),
    ("what_we_learned", "우리가 배운 것", "What we learned"),
    ("next_outlook", "다음 분기 전망", "Next quarter outlook"),
)

# ── §7 연간: 기억에 남게 ─────────────────────────────────────────────────────
ANNUAL_LAYOUT = (
    ("cover", "표지", "Cover"),
    ("the_year", "그 해의 지구", "The year on Earth"),
    ("top_changes", "가장 크게 달라진 열 가지", "Top 10 Earth changes"),
    ("biggest_events", "가장 큰 사건", "The biggest events"),
    ("longest_lasting", "가장 오래 간 변화", "The longest-lasting changes"),
    ("most_unexpected", "가장 뜻밖이던 것", "Most unexpected events"),
    ("cross_domain", "분야를 가로지른 이야기", "Major cross-domain stories"),
    ("regional", "지역별 지구", "Regional Earth"),
    ("forecast_review", "그 해 예보 성적", "Forecast review"),
    ("what_we_got_wrong", "우리가 틀린 것", "What we got wrong"),
    ("what_we_could_not_know", "우리가 알 수 없던 것", "What we could not know"),
    ("next_year", "다음 해", "The next year"),
)

LAYOUTS = {
    "RETROSPECTIVE_MONTHLY": MONTHLY_LAYOUT,
    "RETROSPECTIVE_QUARTERLY": QUARTERLY_LAYOUT,
    "RETROSPECTIVE_ANNUAL": ANNUAL_LAYOUT,
}

# 어느 절이 어떤 현상을 담는가. 팩트를 절에 나눌 때 쓴다.
DOMAIN_SECTION = {
    "weather": "weather", "ocean": "ocean", "land": "land",
    "hazards": "hazards", "people": "people", "travel": "people", "space": "space",
}

# §6 — 분기에서 '계속된 변화'로 볼 최소 지속 비율
PERSISTENT_QUARTER_RATIO = 0.6


def _label_for(count, expected):
    """§11 — 라벨을 사실에서 만든다. 손으로 고르지 않는다."""
    if not expected:
        return "NOT_EVALUABLE"
    if count == 0:
        return "INSUFFICIENT_DATA"
    if count >= expected:
        return "DATA_COMPLETE"
    return "DATA_PARTIAL"


def _domain_of(phenomenon_id):
    return (phenomenon_id or "").split(".")[0]


def in_period(fact_or_story, period):
    """이 보고서의 기간에 속하는가.

    ⚠️ 이걸 안 걸러서 실제로 틀렸다: 9월 보고서의 '날씨' 절에 **8월** 채점 팩트가
       들어갔다. 9월 호가 8월을 평가하는 건 맞지만, 그건 '지난달 전망 평가' 절의
       내용이지 '이번 달 날씨'가 아니다. 두 기간을 한 절에 섞으면 독자는
       8월 숫자를 9월 이야기로 읽는다.
    """
    want = rp.label(period)
    p = fact_or_story.get("period")
    if isinstance(p, str):
        return p == want
    t = fact_or_story.get("temporalExtent") or {}
    return bool(t.get("from")) and rp.contains(period, t["from"])


def domain_sections(facts, stories, period=None):
    """분야별 절. 팩트가 없는 분야는 비었다고 적고 남긴다 — 지우지 않는다."""
    by_section = {}
    for f in facts or []:
        if period and not in_period(f, period):
            continue
        sec = DOMAIN_SECTION.get(_domain_of(f.get("phenomenonId")))
        if sec:
            by_section.setdefault(sec, []).append(f["factId"])
    story_by_section = {}
    for s in stories or []:
        if period and not in_period(s, period):
            continue
        for p in s.get("phenomenonIds") or []:
            sec = DOMAIN_SECTION.get(_domain_of(p))
            if sec:
                story_by_section.setdefault(sec, set()).add(s["storyId"])
    return by_section, {k: sorted(v) for k, v in story_by_section.items()}


def build_sections(report_type, period, *, facts=None, stories=None, links=None,
                   surprise_section=None, evaluations=None, outlook=None,
                   quality=None, top_limit=5, featured=None):
    """§5·§6·§7 — 종류에 맞는 절을 만든다. 없는 절도 남기되 왜 비었는지 적는다."""
    layout = LAYOUTS.get(report_type)
    if not layout:
        raise ValueError("절 구성이 없는 리포트 종류: %s" % report_type)
    facts = list(facts or [])
    stories = list(stories or [])
    links = list(links or [])
    fact_sections, story_sections = domain_sections(facts, stories, period)
    # 이번 기간의 스토리만 '이번 달 이야기'가 된다. 지난 기간을 평가한 스토리
    # (예보 채점)는 forecast_review · what_we_got_wrong 절에서만 쓴다.
    own = [s for s in stories if in_period(s, period)]
    own_facts = [f for f in facts if in_period(f, period)]
    # ⚠️ 상위 목록을 중요도 순으로 그냥 자르면 한 자료가 목록을 통째로 먹는다.
    #    실제로 8월 상위 4개가 전부 '해수면온도 …가장 높은 8월' 이었다 — 지역만 다른 같은 이야기다.
    #    그래서 다양성을 지킨 목록(featured)을 받아 쓴다. 없으면 그때만 순서대로 자른다.
    feat = [s for s in (featured or []) if in_period(s, period)]
    top = feat[:top_limit] if feat else own[:top_limit]

    out = []
    for sid, ko, en in layout:
        sec = {"id": sid, "titleKo": ko, "titleEn": en}

        if sid == "cover":
            sec.update({"period": rp.label(period), "storyCount": len(own),
                        "factCount": len(own_facts),
                        "dataLabel": _label_for(len(own_facts), 1)})
        elif sid in ("this_month", "quarter_in_one_page", "the_year"):
            sec.update({"storyRefs": [s["storyId"] for s in top],
                        "dataLabel": _label_for(len(top), 1)})
        elif sid in ("top_stories", "top_changes", "biggest_events"):
            limit = 10 if sid == "top_changes" else top_limit
            picked = (feat or own)[:limit]
            sec.update({"storyRefs": [s["storyId"] for s in picked],
                        "dataLabel": _label_for(len(picked), 1)})
        elif sid == "snapshot":
            sec.update({"factRefs": [f["factId"] for f in own_facts],
                        "dataLabel": _label_for(len(own_facts), 1)})
        elif sid in DOMAIN_SECTION.values():
            refs = fact_sections.get(sid, [])
            sec.update({"factRefs": refs, "storyRefs": story_sections.get(sid, []),
                        "dataLabel": _label_for(len(refs), 1)})
            if not refs:
                # 왜 비었는지 말한다. '준비 중'이라고 쓰지 않는다.
                sec["reasonKo"] = "이 기간에 이 분야에서 집계할 수 있는 자료가 없었습니다."
                sec["reasonEn"] = "No aggregable data for this domain in this period."
        elif sid == "what_surprised_us":
            sec.update(surprise_section or {"empty": True, "dataLabel": "NOT_EVALUABLE"})
            sec.update({"id": sid, "titleKo": ko, "titleEn": en})
        elif sid in ("forecast_review", "forecast_performance"):
            evs = list(evaluations or [])
            sec.update({"evaluationRefs": [e.get("predictionId") for e in evs],
                        "dataLabel": _label_for(len(evs), 1)})
            if not evs:
                sec["reasonKo"] = "이 기간을 평가할 예보 스냅샷이 없습니다."
                sec["reasonEn"] = "No forecast snapshot covers this period."
        elif sid == "what_we_got_wrong":
            misses = [s for s in stories if s.get("storyType") == "FORECAST_MISS"]
            gaps = (surprise_section or {}).get("coverageGaps") or []
            sec.update({"storyRefs": [s["storyId"] for s in misses],
                        "coverageGaps": gaps,
                        "notComputable": (surprise_section or {}).get("notComputable") or [],
                        "dataLabel": _label_for(len(misses) + len(gaps), 1)})
        elif sid == "what_we_could_not_know":
            sec.update({"coverageGaps": (surprise_section or {}).get("coverageGaps") or [],
                        "notComputable": (surprise_section or {}).get("notComputable") or [],
                        "dataLabel": "DATA_COMPLETE"})
        elif sid in ("next_outlook", "next_year"):
            o = outlook or {}
            sec.update({"status": o.get("status"), "horizonClass": o.get("horizonClass"),
                        "sources": o.get("sources") or [], "excluded": o.get("excluded") or [],
                        "reasonKo": o.get("reasonKo"), "reasonEn": o.get("reasonEn"),
                        "dataLabel": o.get("dataLabel", "NOT_EVALUABLE")})
        elif sid == "cross_domain":
            sec.update({"linkRefs": [L["linkId"] for L in links],
                        "storyRefs": [s["storyId"] for s in stories
                                      if s.get("storyType") == "CROSS_DOMAIN"],
                        "dataLabel": _label_for(len(links), 1)})
        elif sid in ("persistent_changes", "longest_lasting"):
            keep = [s for s in own if s.get("storyType") == "PERSISTENT"
                    or (s.get("temporalExtent") or {}).get("longestRun")]
            sec.update({"storyRefs": [s["storyId"] for s in keep],
                        "dataLabel": _label_for(len(keep), 1)})
        elif sid == "extremes":
            keep = [s for s in own if s.get("storyType") == "EXTREME"]
            sec.update({"storyRefs": [s["storyId"] for s in keep],
                        "dataLabel": _label_for(len(keep), 1)})
        elif sid == "most_unexpected":
            keep = [s for s in stories if s.get("storyType") in ("UNEXPECTED", "FORECAST_MISS")]
            sec.update({"storyRefs": [s["storyId"] for s in keep],
                        "dataLabel": _label_for(len(keep), 1)})
        elif sid == "reversals":
            keep = [s for s in own if s.get("storyType") == "FAST_CHANGE"]
            sec.update({"storyRefs": [s["storyId"] for s in keep],
                        "dataLabel": _label_for(len(keep), 1)})
            if not keep:
                sec["reasonKo"] = "직전 기간과 견줄 자료가 아직 충분하지 않습니다."
        elif sid == "regional":
            regions = sorted({(s.get("spatialExtent") or {}).get("regionLabel")
                              for s in own} - {None})
            sec.update({"regions": regions,
                        "storyRefs": [s["storyId"] for s in own
                                      if (s.get("spatialExtent") or {}).get("regionLabel")],
                        "dataLabel": _label_for(len(regions), 1)})
        elif sid == "timeline":
            sec.update({"storyRefs": [s["storyId"] for s in own],
                        "dataLabel": _label_for(len(own), 1)})
        elif sid == "what_we_learned":
            sec.update({"linkRefs": [L["linkId"] for L in links],
                        "quality": (quality or {}).get("status"),
                        "dataLabel": _label_for(len(links), 1)})
        elif sid == "explore":
            # 보고서에서 현상으로 가는 문. 링크는 화면이 만든다 — 여기서는 대상만 준다.
            phen = sorted({p for s in own for p in (s.get("phenomenonIds") or [])})
            sec.update({"phenomenonIds": phen, "dataLabel": _label_for(len(phen), 1)})
        else:
            sec.update({"dataLabel": "INSUFFICIENT_DATA"})

        sec["empty"] = sec.get("dataLabel") in ("INSUFFICIENT_DATA", "NOT_EVALUABLE")
        out.append(sec)
    return out


def report_data_label(sections):
    """§11 — 보고서 전체 라벨. 가장 약한 절이 아니라 **본문 절들**을 본다.

    표지·탐색처럼 자료가 필요 없는 절이 전체 라벨을 끌어내리지 않게 한다.
    """
    skip = {"cover", "explore"}
    labels = [s.get("dataLabel") for s in sections if s.get("id") not in skip]
    if not labels:
        return "NOT_EVALUABLE"
    if all(x == "DATA_COMPLETE" for x in labels):
        return "DATA_COMPLETE"
    if any(x in ("DATA_COMPLETE", "DATA_PARTIAL") for x in labels):
        return "DATA_PARTIAL"
    if any(x == "INSUFFICIENT_DATA" for x in labels):
        return "INSUFFICIENT_DATA"
    return "NOT_EVALUABLE"


def attach(report, *, stories=None, links=None, sections=None, outlook=None,
           surprise_section=None, quality=None):
    """PHASE 8 내용물을 리포트 봉투에 붙인다. 봉투 규약은 report_contract 것 그대로."""
    out = dict(report)
    if stories is not None:
        out["stories"] = list(stories)
    if links is not None:
        out["crossDomainLinks"] = list(links)
    if sections is not None:
        out["sections"] = list(sections)
        out["dataLabel"] = report_data_label(sections)
        out["dataLabelText"] = rc.DATA_LABEL_TEXT.get(out["dataLabel"])
    if outlook is not None:
        out["outlook"] = outlook
    if surprise_section is not None:
        out["surprise"] = surprise_section
    if quality is not None:
        out["quality"] = quality
    out["canonicalUrl"] = rc.report_url(out.get("reportId"))
    return out

# -*- coding: utf-8 -*-
"""사건 분석 보고서 → 정기 리포트 팩트 — 지시서 §41 · §43 · §44 · §49.

`ocean/lab-reports.json` 을 기간으로 잘라 **셀 수 있는 것만** 센다.

무엇을 세는가 (§49 — 개수와 심각도를 섞지 않는다)
  · 기간 안에 우리가 **추적한** 사건 수 (종류별 · 지역별)
  · 종류별 최대 규모 — 종류마다 자가 다르므로 따로 낸다
  · 종료 사건 수
무엇을 세지 않는가
  · "심각도 점수" — 종류를 가로질러 더할 수 있는 심각도 척도가 없다
  · 평년 대비 — 사건 이력의 기후값이 없다. 없는 기준선을 만들지 않는다(§51)

⚠️ 이 어댑터의 시각은 **우리가 추적한 시각**이다. 사건이 일어난 시각이 아니다.
   lab-reports 의 detectedAt 은 계산기가 처음 본 때다. 사건 시각은 detail.timeline
   첫 항목에 있을 때만 쓴다 — 없으면 '기간 안'인지 판단하지 않고 뺀다.
   그래야 7월 지진이 9월 리포트의 '9월에 난 일'로 들어가지 않는다.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(_HERE)), "_shared"))
import report_period as rp        # noqa: E402
import report_contract as rc      # noqa: E402
import content_contract as cc     # noqa: E402

SOURCE_REF = "ocean/lab-reports.json"

# §44 지역. 경계는 대략이다 — 이 값으로 정밀 통계를 내지 않고 '어느 대륙권인가'만 본다.
# 남극/북극을 먼저 본다(위도가 결정적이므로).
REGIONS = (
    ("Antarctic", lambda la, lo: la <= -60),
    ("Arctic", lambda la, lo: la >= 66.5),
    ("Asia", lambda la, lo: 0 <= la < 66.5 and 25 <= lo <= 180),
    ("Europe", lambda la, lo: 35 <= la < 66.5 and -25 <= lo < 45),
    ("Africa", lambda la, lo: -35 <= la < 37 and -20 <= lo < 55),
    ("North America", lambda la, lo: 7 <= la < 66.5 and -170 <= lo < -50),
    ("South America", lambda la, lo: -60 < la < 13 and -85 <= lo < -30),
    ("Oceania", lambda la, lo: -50 < la < 0 and 110 <= lo <= 180),
)

# §45~§50 — 사건 종류를 리포트 영역으로 묶는다. 어느 영역에도 안 들어가는 종류는
# 억지로 넣지 않고 '기타'로 남긴다.
KIND_DOMAIN = {
    "cyclone": "ATMOSPHERE",
    "air-pollution": "ATMOSPHERE",
    "smoke-ash": "LAND",
    "bird-migration": "LAND",
    "ocean-drift": "OCEAN",
    "marine-bloom": "OCEAN",
    "earthquake": "HAZARDS",
    "aurora": "SPACE",
    "space-reentry": "SPACE",
}
DOMAINS = ("ATMOSPHERE", "OCEAN", "LAND", "CRYOSPHERE", "HAZARDS", "SPACE")

KIND_PHENOMENON = {
    "cyclone": "hazards.typhoon",
    "earthquake": "hazards.earthquake",
    "aurora": "space.aurora",
    "air-pollution": "weather.air_quality",
    "bird-migration": "land.bird_migration",
    "space-reentry": "space.orbital_debris",
    "smoke-ash": "hazards.wildfire",
    "ocean-drift": None,
    "marine-bloom": None,
}

KIND_KO = {
    "cyclone": "태풍", "earthquake": "지진", "smoke-ash": "산불 연기·화산재",
    "air-pollution": "황사·미세먼지", "ocean-drift": "해류 표류",
    "bird-migration": "철새 이동", "marine-bloom": "해파리·적조",
    "aurora": "오로라", "space-reentry": "위성·잔해 재진입",
}


def region_of(lat, lon):
    """좌표 → 지역. 어디에도 안 들어가면 None 이다. '기타'로 뭉개지 않는다."""
    if lat is None or lon is None:
        return None
    for name, test in REGIONS:
        try:
            if test(lat, lon):
                return name
        except TypeError:
            continue
    return None


def occurred_at(report):
    """사건이 일어난 때. 출처가 자기 연표를 줄 때만 있다. 없으면 None."""
    for row in (report.get("detail") or {}).get("timeline") or []:
        at = (row or {}).get("at")
        if isinstance(at, str) and len(at) >= 10 and at[4] == "-" and at[7] == "-":
            return at
    return None


def _pos(report):
    p = (report.get("detail") or {}).get("position") or {}
    return p.get("lat"), p.get("lon")


def select(doc, period):
    """기간에 속하는 사건을 고른다.

    돌려주는 것 (안, 밖, 시각없음). **시각 없는 것을 안으로 넣지 않는다** —
    넣으면 어느 달의 리포트에도 다 들어가고, 개수가 기간마다 부풀려진다.
    """
    inside, outside, undated = [], [], []
    for r in (doc or {}).get("reports") or []:
        at = occurred_at(r)
        if not at:
            undated.append(r)
        elif rp.contains(period, at[:10]):
            inside.append(r)
        else:
            outside.append(r)
    return inside, outside, undated


def _fact(fact_id, phenomenon_id, metric, value, *, unit=None, period_label=None,
          sample=None, source=None):
    return rc.make_fact(
        fact_id=fact_id, phenomenon_id=phenomenon_id or cc.CROSS_PHENOMENON,
        metric=metric, value=value, unit=unit, period=period_label,
        source=source or "EARTHUS LAB 사건 분석 보고서 집계",
        truth_type="EARTHUS_ANALYSIS", sample_count=sample,
        evidence_refs=[SOURCE_REF])


def build_facts(doc, period):
    """§41 EARTH IN NUMBERS — 셀 수 있는 것만 센다.

    값이 0 인 칸도 팩트로 만든다. '이 기간에 이 종류의 사건이 0건'은
    자료가 없는 것과 다른 사실이다 — 다만 그 종류의 계산기가 실제로 돌고 있을 때만이다.
    """
    label = rp.label(period)
    inside, _out, _und = select(doc, period)
    running = {s.get("kind") for s in (doc or {}).get("sources") or []
               if (s or {}).get("state") == "ok"}
    facts = []

    facts.append(_fact(f"fact:{label}:events:total", cc.CROSS_PHENOMENON,
                       "기간 안에 사건 시각이 확인된 분석 보고서", len(inside),
                       unit="건", period_label=label, sample=len(inside)))

    by_kind = {}
    for r in inside:
        by_kind.setdefault(r.get("kind"), []).append(r)
    for kind in sorted(running):
        rows = by_kind.get(kind, [])
        facts.append(_fact(f"fact:{label}:events:{kind}", KIND_PHENOMENON.get(kind),
                           f"{KIND_KO.get(kind, kind)} 분석 보고서", len(rows),
                           unit="건", period_label=label, sample=len(rows)))

    # §49 — 개수와 규모를 다른 팩트로 낸다. 한 줄에 섞지 않는다.
    quakes = [r for r in by_kind.get("earthquake", [])]
    mags = []
    for r in quakes:
        import re
        m = re.search(r"M(\d+(?:\.\d+)?)", str(r.get("title") or ""))
        if m:
            mags.append(float(m.group(1)))
    if mags:
        facts.append(_fact(f"fact:{label}:earthquake:max-magnitude", "hazards.earthquake",
                           "기간 안 최대 지진 규모", max(mags), unit="M",
                           period_label=label, sample=len(mags)))

    # §44 지역 — 좌표가 있는 것만. 좌표 없는 사건을 어느 지역에도 넣지 않는다.
    by_region, no_pos = {}, 0
    for r in inside:
        la, lo = _pos(r)
        reg = region_of(la, lo)
        if reg is None:
            no_pos += 1
            continue
        by_region[reg] = by_region.get(reg, 0) + 1
    for reg in sorted(by_region):
        facts.append(_fact(f"fact:{label}:region:{reg.replace(' ', '-')}", cc.CROSS_PHENOMENON,
                           f"{reg} 지역 사건", by_region[reg], unit="건",
                           period_label=label, sample=by_region[reg]))
    if no_pos:
        facts.append(_fact(f"fact:{label}:region:unlocated", cc.CROSS_PHENOMENON,
                           "좌표가 없어 지역을 배정하지 못한 사건", no_pos, unit="건",
                           period_label=label, sample=no_pos))

    # 영역별(§45~§50)
    by_domain = {}
    for r in inside:
        d = KIND_DOMAIN.get(r.get("kind"))
        if d:
            by_domain[d] = by_domain.get(d, 0) + 1
    for d in DOMAINS:
        if d in by_domain:
            facts.append(_fact(f"fact:{label}:domain:{d}", cc.CROSS_PHENOMENON,
                               f"{d} 영역 사건", by_domain[d], unit="건",
                               period_label=label, sample=by_domain[d]))
    return facts


def major_events(doc, period, *, top=10):
    """§43 · §126 — 주요 현상 카드. **왜 상위인지 이유를 함께 남긴다.**

    단순히 큰 숫자를 고르지 않는다. 순위 근거를 문자열로 적어 리포트가 그대로 보여 준다.
    """
    inside, _o, _u = select(doc, period)
    rows = []
    for r in inside:
        score, why = 0.0, []
        kind = r.get("kind")
        import re
        m = re.search(r"M(\d+(?:\.\d+)?)", str(r.get("title") or ""))
        if kind == "earthquake" and m:
            mag = float(m.group(1))
            score += min(1.0, max(0.0, (mag - 4.5) / 3.5)) * 0.45
            why.append(f"규모 M{mag}")
        snaps = r.get("snapshotCount") or 0
        if snaps:
            score += min(1.0, snaps / 40.0) * 0.2
            why.append(f"계산 회차 {snaps}")
        if r.get("endedAt"):
            score += 0.1
            why.append("사건이 종료돼 검증 가능")
        la, lo = _pos(r)
        reg = region_of(la, lo)
        if reg:
            score += 0.1
            why.append(f"{reg}")
        nfacts = len((r.get("detail") or {}).get("facts") or [])
        if nfacts:
            score += min(1.0, nfacts / 6.0) * 0.15
            why.append(f"확인된 항목 {nfacts}개")
        rows.append({
            "eventId": r.get("id"),
            "kind": kind,
            "kindKo": KIND_KO.get(kind, kind),
            "phenomenonId": KIND_PHENOMENON.get(kind),
            "title": r.get("title"),
            "headline": (r.get("detail") or {}).get("headline"),
            "occurredAt": occurred_at(r),
            "endedAt": r.get("endedAt"),
            "status": r.get("status"),
            "region": reg,
            "position": {"lat": la, "lon": lo} if la is not None else None,
            "sampleCount": snaps,
            "sourceRef": r.get("sourcePath") or SOURCE_REF,
            "rank": round(score, 4),
            # §126 — 이유 없는 순위를 만들지 않는다.
            "importanceReason": why,
        })
    rows.sort(key=lambda x: -x["rank"])
    return rows[:top]


def coverage(doc, period):
    """§67 — 이 기간을 다룰 수 있는가. 못 하면 왜 못 하는지."""
    reports = (doc or {}).get("reports") or []
    if not reports:
        return {"ok": False, "reason": "NO_DATA", "detail": "사건 보고서 색인이 비어 있다"}
    inside, outside, undated = select(doc, period)
    sources = (doc or {}).get("sources") or []
    degraded = [s.get("kind") for s in sources if (s or {}).get("state") != "ok"]
    return {
        "ok": bool(inside),
        "inPeriod": len(inside),
        "outOfPeriod": len(outside),
        # 시각을 확인할 수 없어 어느 기간에도 넣지 않은 것. 숨기지 않는다(§67).
        "undated": len(undated),
        "undatedNote": "사건 시각을 출처가 주지 않아 기간 집계에서 제외했다",
        "degradedSources": degraded,
        "indexGeneratedAt": (doc or {}).get("generatedAt"),
        "reason": None if inside else "NO_EVENTS_IN_PERIOD",
    }


def datasets(doc):
    """§65 — 스냅샷에 넣을 자료 목록. 색인이 말한 상태를 그대로 옮긴다."""
    rows = [{"ref": SOURCE_REF, "observedAt": (doc or {}).get("generatedAt"),
             "state": "AVAILABLE" if (doc or {}).get("reports") else "UNAVAILABLE"}]
    for s in (doc or {}).get("sources") or []:
        rows.append({
            "ref": (s or {}).get("key"),
            "sourceVersion": (s or {}).get("kind"),
            "observedAt": (doc or {}).get("generatedAt"),
            "state": "AVAILABLE" if (s or {}).get("state") == "ok" else "UNAVAILABLE",
        })
    return [r for r in rows if r.get("ref")]

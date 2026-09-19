# -*- coding: utf-8 -*-
"""사건 분석 보고서 → 콘텐츠 후보 — 지시서 §80 · §142 · §166.

입력은 **실제로 도는 자료** 하나다: `ocean/lab-reports.json`
  aws/lab-report-index/handler.py 가 3시간마다 현상별 계산기 결과를 합쳐 쓴다.
  2026-09-08 기준 218건 / 9종.

여기서 숫자를 만들지 않는다. `detail.facts[] = {label, value}` 를 **그대로 옮긴다.**
옮긴 문장은 곧바로 validation.py 의 숫자 검사를 통과해야 한다 — 통과 못 하면
그건 우리가 원문을 바꿔 적었다는 뜻이다.

⚠️ 종류↔현상 표는 프런트가 정본이다
   prototype/v2-three/js/phenomenon-registry.js 의 REPORT_KIND_PHENOMENON.
   여기 사본이 있는 이유는 파이썬이 그 파일을 읽을 수 없어서다.
   tools/test_distribution_reporting.mjs 가 두 표가 같은지 매번 확인한다 —
   어긋나면 시험이 깨진다. 손으로만 맞추지 않는다.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(_HERE)), "_shared"))

import content_contract as cc      # noqa: E402
import report_contract as rc       # noqa: E402
import eligibility as el           # noqa: E402

SOURCE_REF = "ocean/lab-reports.json"

# 프런트 REPORT_KIND_PHENOMENON 의 사본. null 인 2종도 그대로 둔다 —
# 억지로 현상을 붙이면 화면에서 엉뚱한 현상으로 간다.
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

# 종류별 진리등급. lab-report 는 우리 계산이지만 원자료 등급이 다르다.
KIND_TRUTH = {
    "cyclone": "OFFICIAL_FORECAST",
    "earthquake": "OFFICIAL_OBSERVATION",
    "aurora": "OFFICIAL_OBSERVATION",
    "air-pollution": "OFFICIAL_OBSERVATION",
    "bird-migration": "HISTORY",
    "space-reentry": "OFFICIAL_OBSERVATION",
    "smoke-ash": "OFFICIAL_OBSERVATION",
    "ocean-drift": "EARTHUS_ANALYSIS",
    "marine-bloom": "EARTHUS_ANALYSIS",
}

# 종류별 개별 자료 참조. 색인만 대면 "어느 계산기가 냈나"를 잃는다.
KIND_REF = {
    "cyclone": "ocean/cyclone-reports.json",
}

# 계산 중인 것과 끝난 것을 다르게 다룬다(§10 지속·신규).
STATUS_WEIGHT = {"DETECTED": 0.4, "ACTIVE": 1.0, "VERIFYING": 0.7,
                 "PRELIMINARY_REPORT": 0.6, "FINAL_REPORT": 0.5}

# 콘텐츠 유형 — 상태가 정한다. 끝난 사건은 속보가 아니다.
STATUS_CONTENT_TYPE = {
    "DETECTED": "BREAKING",
    "ACTIVE": "NOW",
    "VERIFYING": "NOW",
    "PRELIMINARY_REPORT": "DATA_STORY",
    "FINAL_REPORT": "DATA_STORY",
}


def dataset_refs(report):
    refs = [SOURCE_REF]
    own = report.get("sourcePath") or KIND_REF.get(report.get("kind"))
    if own and own not in refs:
        refs.append(own)
    return refs


def occurred_at(report):
    """사건이 **일어난** 때. 우리가 **본** 때(detectedAt)와 다르다.

    ⚠️ 저장소의 시각 4분법(intel-feed.js) 규약을 여기서도 지킨다:
       occurredAt · issuedAt · updatedAt · retrievedAt 은 서로 다른 시각이다.
       lab-reports 의 detectedAt 은 우리 계산기가 처음 본 때다 — 그것을 '언제'라고
       적으면 7월에 난 지진이 9월에 난 것처럼 읽힌다(실제로 그렇게 나왔다).

    출처가 자기 연표를 주면 그 첫 항목이 사건 시각이다. 없으면 **None** 이다 —
    detectedAt 으로 대신 채우지 않는다.
    """
    tl = (report.get("detail") or {}).get("timeline") or []
    for row in tl:
        at = (row or {}).get("at")
        if isinstance(at, str) and len(at) >= 10 and at[4] == "-" and at[7] == "-":
            return at
    return None


def geometry_of(report):
    """§103 — 좌표를 지어내지 않는다. 없으면 None 이고, 그러면 전지구 시점이 된다."""
    pos = ((report.get("detail") or {}).get("position") or {})
    lat, lon = pos.get("lat"), pos.get("lon")
    if lat is None or lon is None:
        return None
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return {"type": "point", "lat": lat, "lon": lon, "radiusKm": 200.0}


def facts_of(report, *, phenomenon_id):
    """detail.facts 를 리포트 팩트로 옮긴다. **값을 바꾸지 않는다.**

    값이 '—' 인 칸은 팩트를 만들지 않는다 — 값 없음을 값으로 만들면
    화면에 "—" 라는 사실이 있는 것처럼 나온다.
    """
    out = []
    d = report.get("detail") or {}
    eng = d.get("engine") or {}
    # 계산기 결과도 팩트다. 팩트로 만들지 않고 문장만 쓰면 그 숫자에 출처가 없다 —
    # 실제로 첫 실행에서 "본진 30일 경과" 의 30 이 출처 없는 숫자로 잡혔다.
    if eng.get("name") and eng.get("current") not in (None, "", "—", "-"):
        out.append(rc.make_fact(
            fact_id=f"fact:{report['id']}:engine",
            phenomenon_id=phenomenon_id or cc.CROSS_PHENOMENON,
            event_id=report["id"],
            metric=f"EARTHUS {eng['name']}",
            value=eng.get("current"),
            unit=eng.get("unit"),
            period=(report.get("detectedAt") or "")[:10] or None,
            source=eng.get("method"),
            truth_type="EARTHUS_ANALYSIS",     # 기관이 잰 값이 아니라 우리 계산이다
            sample_count=len(eng.get("rows") or []) or None,
            evidence_refs=dataset_refs(report),
        ))
    for i, row in enumerate(d.get("facts") or []):
        label = (row or {}).get("label")
        value = (row or {}).get("value")
        if value is None or (isinstance(value, str) and value.strip() in ("", "—", "-", "N/A")):
            continue
        out.append(rc.make_fact(
            fact_id=f"fact:{report['id']}:{i}",
            phenomenon_id=phenomenon_id or cc.CROSS_PHENOMENON,
            event_id=report["id"],
            metric=label,
            value=value,
            period=(report.get("detectedAt") or "")[:10] or None,
            source=(report.get("detail") or {}).get("headline"),
            truth_type=KIND_TRUTH.get(report.get("kind"), "EARTHUS_ANALYSIS"),
            sample_count=report.get("snapshotCount"),
            evidence_refs=dataset_refs(report),
        ))
    return out


def claims_of(report, facts, *, lang="ko"):
    """§12 — 관측/분석/해석을 나눈다.

    관측: 기관이 잰 값 (detail.facts)
    분석: 우리 계산기의 결과 (detail.engine · verification)
    해석: 여기서 만들지 않는다. 사람이 붙이거나, 승인된 분석 메타데이터가 있을 때만.
    """
    claims = []
    refs = dataset_refs(report)
    for f in facts:
        # 우리 계산은 ANALYZED, 기관이 준 값은 OBSERVED. 팩트의 진리등급이 그것을 정한다 —
        # 여기서 다시 판단하지 않는다.
        analyzed = f.get("truthType") == "EARTHUS_ANALYSIS" \
            and str(f.get("metric", "")).startswith("EARTHUS ")
        # ⚠️ 단위는 숫자에만 붙인다. 문장형 값에 붙이면
        #    "본진 30일 경과 — 추정 종료 회" 같은 말이 나온다(실제로 나왔다).
        numeric = isinstance(f.get("value"), (int, float)) and not isinstance(f.get("value"), bool)
        claims.append(cc.make_claim(
            text=f"{f['metric']}: {f['value']}"
                 + (f" {f['unit']}" if (f.get("unit") and numeric) else ""),
            claim_type="ANALYZED" if analyzed else "OBSERVED",
            source_refs=refs,
            fact_id=f["factId"],
            evidence_refs=refs,
            lang=lang,
        ))
    return claims


def signals_of(report, facts):
    """§10 — 자격 기준. 알 수 없는 것은 UNKNOWN 으로 둔다(0 이 아니다)."""
    d = report.get("detail") or {}
    sig = {
        "magnitude": el.UNKNOWN,
        "anomaly": el.UNKNOWN,
        "extent": el.UNKNOWN,
        "duration": el.UNKNOWN,
        "novelty": el.UNKNOWN,
        "public_relevance": el.UNKNOWN,
        "data_completeness": el.completeness(len(facts), max(len(d.get("facts") or []), 1)),
    }
    kind = report.get("kind")
    head = str(d.get("headline") or "")

    # 규모 — 종류마다 다른 자로 잰다. 한 자로 다 재면 지진 M5 와 태풍 30m/s 가 같아진다.
    if kind == "earthquake":
        import re
        m = re.search(r"M(\d+(?:\.\d+)?)", report.get("title") or head)
        if m:
            sig["magnitude"] = el.magnitude_earthquake(float(m.group(1)))
    elif kind == "cyclone":
        obs = d.get("observed") or []
        winds = [o.get("windMs") for o in obs if isinstance(o, dict) and o.get("windMs")]
        if winds:
            sig["magnitude"] = el.magnitude_wind(max(winds))

    # 지속 — 최초 탐지와 마지막 관측 사이.
    a, b = report.get("detectedAt"), report.get("endedAt") or report.get("lastSeen")
    if a and b:
        hours = _hours_between(a, b)
        if hours is not None:
            sig["duration"] = el.duration_hours(hours)

    # 새로움 — 회차가 많을수록 이미 다룬 것이다.
    n = report.get("snapshotCount")
    if isinstance(n, int) and n >= 0:
        sig["novelty"] = max(0.0, 1.0 - min(1.0, n / 40.0))

    # 공적 관련성 — 지금 다룰 수 있는 것은 '한국 관련 여부'뿐이다.
    # 인구 노출 자료가 없다. 없는 것을 있는 것처럼 계산하지 않는다.
    if kind in ("air-pollution", "bird-migration", "marine-bloom"):
        sig["public_relevance"] = 0.8      # 한국 대상 계산기다
    elif geometry_of(report):
        g = geometry_of(report)
        # 한반도 반경 대략. 정밀한 인구 노출이 아니라 '가까운가'만 본다.
        near = 30 <= g["lat"] <= 44 and 120 <= g["lon"] <= 135
        sig["public_relevance"] = 0.9 if near else 0.35

    return sig


def _hours_between(a, b):
    from datetime import datetime
    try:
        ta = datetime.fromisoformat(str(a).replace("Z", "+00:00"))
        tb = datetime.fromisoformat(str(b).replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0.0, (tb - ta).total_seconds() / 3600.0)


def candidates(doc, *, limit=None, kinds=None, min_status=None):
    """§80 — 콘텐츠 후보 목록. **아직 콘텐츠가 아니다.**

    generator.build() 가 이것을 받아 실제 콘텐츠 객체를 만든다.
    여기서는 원자료를 우리 어휘로 옮기기만 한다.
    """
    rows = []
    for r in (doc or {}).get("reports") or []:
        kind = r.get("kind")
        if kinds and kind not in kinds:
            continue
        if min_status and r.get("status") != min_status:
            continue
        phen = KIND_PHENOMENON.get(kind)
        facts = facts_of(r, phenomenon_id=phen)
        if not facts:
            # 팩트가 하나도 없으면 콘텐츠를 만들지 않는다. 제목만으로 게시하지 않는다.
            continue
        rows.append({
            "sourceKind": "lab-report",
            "reportKind": kind,
            "eventId": r["id"],
            "phenomenonId": phen,
            "phenomenonNote": None if phen else "이 종류에 대응하는 현상이 레지스트리에 없다",
            "title": r.get("title"),
            "headline": (r.get("detail") or {}).get("headline"),
            "summary": r.get("summary"),
            # ⚠️ 원문 그대로인 필드만 여기 넣는다. 우리가 만든 문장을 넣으면
            #    지어낸 숫자가 스스로를 인가한다(validation.numeric_pool 주석 참고).
            "sourceTexts": [t for t in (r.get("title"),
                                        (r.get("detail") or {}).get("headline"),
                                        r.get("summary")) if t],
            "status": r.get("status"),
            "contentType": STATUS_CONTENT_TYPE.get(r.get("status"), "NOW"),
            "eventTime": occurred_at(r),
            # 이것은 **우리가 지켜본 기간**이다. 사건이 지속된 기간이 아니다.
            "observationPeriod": {"from": (r.get("detectedAt") or "")[:10],
                                  "to": (r.get("endedAt") or r.get("lastSeen") or "")[:10]},
            "observationPeriodKind": "TRACKING",
            "geometry": geometry_of(r),
            "location": _location_text(r),
            "facts": facts,
            "claims": claims_of(r, facts),
            "signals": signals_of(r, facts),
            "truthType": KIND_TRUTH.get(kind, "EARTHUS_ANALYSIS"),
            "sourceCount": r.get("sourceCount") or len((r.get("detail") or {}).get("agencies") or []),
            "sampleCount": r.get("snapshotCount"),
            "datasetRefs": dataset_refs(r),
            "verified": r.get("status") in ("ACTIVE", "VERIFYING", "PRELIMINARY_REPORT", "FINAL_REPORT"),
            "statusWeight": STATUS_WEIGHT.get(r.get("status"), 0.5),
            "raw": r,
        })
    rows.sort(key=lambda x: (-(x["statusWeight"]), x.get("eventTime") or ""), reverse=False)
    return rows[:limit] if limit else rows


def _location_text(report):
    """장소 문구. 좌표만 있으면 좌표를 적는다 — 없는 지명을 붙이지 않는다."""
    g = geometry_of(report)
    title = report.get("title") or ""
    if "°" in title:
        return None            # 제목이 이미 좌표를 말한다
    if g:
        ns = "N" if g["lat"] >= 0 else "S"
        ew = "E" if g["lon"] >= 0 else "W"
        return f"{abs(g['lat']):.1f}°{ns} {abs(g['lon']):.1f}°{ew}"
    return None

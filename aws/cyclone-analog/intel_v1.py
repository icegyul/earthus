# -*- coding: utf-8 -*-
"""태풍 사건 패킷 → 인텔 패킷 v1 (INTELLIGENCE-LAYER-PLAN P1 · 계약 §C).

**새 값을 계산하지 않는다.** 이미 있는 공개 사건 패킷(ocean/cyclone-events/{id}.json)의 값과
NOAA OISST 격자(ocean/sst-global.json)를 v1 계약 모양으로 옮길 뿐이다. 모양이 틀리면
intel_contract 가 거절하고, 그때는 사건 패킷에 intel 을 싣지 않는다(옛 패킷은 그대로 나간다).

왜 사건 패킷 **안에** 싣나 (LAYER-PLAN §2.1 과 다른 점 — 기록해 둔다)
  계획은 intel/{phenomenonId}/{eventId}.json 따로였다. 그런데 intel/ 은 버킷 공개 접두사가 아니다
  (publication_privacy.BUCKET_PUBLIC_PREFIXES) — 거기 쓰면 앱이 못 읽는다. 그리고 화면은 사건을
  고를 때 이 패킷을 이미 받는다(intel-feed.js loadPacket). 안에 실으면 띠가 **새 요청 없이**
  그려진다 — 계약 §C-0 "SELECT·INFORMATION 은 이미 로드된 패킷만" 그대로다.

절별 출처
  current     detail.latestObserved (기관 실황: 최대풍속·중심 위치·이동 속도·등급)  OFFICIAL_OBSERVATION
  change      detail.intensity.trend (실황 두 시각의 풍속 차)                          OFFICIAL_OBSERVATION
  pattern     진행 방향·속도, 탐지 뒤 지속 시간, 기관 예보 폭                          (형태 설명 — 값 목록 아님)
  conditions  태풍 중심 격자칸의 해수면 온도 (NOAA OISST 1°)                           OFFICIAL_OBSERVATION
  related     한국 특보구역 350 km 이내면 weather.warning(co_located) ·
              해수온과의 교과서 관계(reference, Gray 1968 — phenomenon-relations.js 와 같은 문헌)
  next        기관 공식 예보(KMA·JMA·NHC, 유형 A OFFICIAL_FORECAST) · ECMWF(유형 A PROVIDER_FORECAST)
  importance  사건 패킷의 이유 목록 그대로(점수 아님)
  confidence  사건 패킷의 등급 + 그 규칙에 이름(formula_id)을 붙였다 — 규칙은 패킷 note 에 이미 적혀 있다
  uncertainty 사건 패킷 그대로(기관 폭 km · 앙상블 없음 null)

비워 둔 절 (coverage.missing 에 이유)
  anomaly     IBTrACS 같은 달·같은 해역 백분위는 기준선(EARTHUS_ANALYSIS) 계산이다. 계약 §I L-4
              ("EARTHUS_ANALYSIS 가 §J 새 엔진인가")가 PD 결정 대기라 이번엔 만들지 않는다.
"""
import sys
import os
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import intel_contract  # noqa: E402

CONFIDENCE_FORMULA = "cyclone.agency-agreement.v1"
WARN_RADIUS_KM = 350
GRAY_1968 = ("Gray, W. M. (1968). Global view of the origin of tropical disturbances and storms. "
             "Monthly Weather Review, 96(10), 669–700.")
_GRADE = {"high": "HIGH", "medium": "MEDIUM", "low": "LOW"}
_OFFICIAL = ("KMA", "JMA", "NHC", "JTWC", "CMA", "PAGASA", "CWA", "HKO")


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def sst_at(sst_doc, lat, lon):
    """1° OISST 격자에서 그 칸의 값. 육지·범위 밖·자료 없음이면 None — 이웃 칸으로 메우지 않는다."""
    try:
        res, lat0, lon0, nx, ny = (sst_doc[k] for k in ("res", "lat0", "lon0", "nx", "ny"))
        iy = round((lat - lat0) / res)
        ix = round((((lon + 180) % 360) - 180 - lon0) / res)
        if not (0 <= iy < ny and 0 <= ix < nx):
            return None
        v = sst_doc["sst"][iy * nx + ix]
        return v if _num(v) else None
    except (KeyError, TypeError, IndexError):
        return None


def _age_min(iso, now):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return round((now - t).total_seconds() / 60)
    except (TypeError, ValueError):
        return None


def build(packet, now, sst_doc=None):
    """사건 패킷(dict) → v1 인텔 패킷(dict). 계약 위반이면 IntelContractError."""
    det = packet.get("detail") or {}
    lo = det.get("latestObserved") or {}
    t = packet.get("time") or {}
    agency = lo.get("agency")
    src_obs = "%s 실황" % agency if agency else None
    missing = []
    out = {
        "schema": 1,
        "phenomenonId": "hazards.typhoon",
        "eventId": packet.get("eventId"),
        "time": {"observedAt": lo.get("at"), "issuedAt": t.get("lastRevisionAt"),
                 "retrievedAt": t.get("retrievedAt") or now.strftime("%Y-%m-%dT%H:%M:%SZ")},
    }
    if out["time"]["observedAt"] is None:
        del out["time"]["observedAt"]
    if out["time"]["issuedAt"] is None:
        del out["time"]["issuedAt"]

    # ── current ──────────────────────────────────────────────────────────
    vals = []
    if src_obs and lo.get("at"):
        for key, v, unit in (("maxWind", lo.get("windMs"), "m/s"), ("centerLat", lo.get("lat"), "deg"),
                             ("centerLon", lo.get("lon"), "deg"), ("moveSpeed", lo.get("speedKmh"), "km/h")):
            if _num(v):
                vals.append({"key": key, "value": v, "unit": unit, "kind": "OFFICIAL_OBSERVATION",
                             "source": src_obs, "at": lo["at"]})
        if lo.get("gradeKo"):
            vals.append({"key": "grade", "value": lo["gradeKo"], "unit": "category",
                         "kind": "OFFICIAL_OBSERVATION", "source": src_obs, "at": lo["at"]})
    if vals:
        out["current"] = {"values": vals}
    else:
        missing.append({"section": "current", "reason": "기관 실황이 사건 패킷에 없다"})

    # ── change ───────────────────────────────────────────────────────────
    trend = ((det.get("intensity") or {}).get("trend")) or {}
    if src_obs and _num(trend.get("deltaMs")) and _num(lo.get("windMs")) and trend.get("since"):
        out["change"] = {"windows": {"since": trend["since"]}, "items": [{
            "key": "maxWind", "delta": trend["deltaMs"], "from": round(lo["windMs"] - trend["deltaMs"], 1),
            "to": lo["windMs"], "unit": "m/s", "kind": "OFFICIAL_OBSERVATION", "source": src_obs,
            "at": lo["at"], "since": trend["since"]}]}
    else:
        missing.append({"section": "change", "reason": "실황이 두 시각 이상 쌓이지 않았다"})

    missing.append({"section": "anomaly",
                    "reason": "평년 대비(IBTrACS 백분위)는 기준선 계산이다 — 계약 §I L-4 PD 결정 대기라 만들지 않았다"})

    # ── pattern ──────────────────────────────────────────────────────────
    spread = (packet.get("uncertainty") or {}).get("agencySpreadKm")
    motion = {"courseKo": lo.get("courseKo"), "speedKmh": lo.get("speedKmh")} if lo.get("courseKo") else None
    persist = None
    det_at = t.get("detectedAt")
    if det_at:
        age = _age_min(det_at, now)
        persist = {"hoursSinceDetected": round(age / 60, 1)} if age is not None else None
    pattern = {k: v for k, v in (("motion", motion), ("persistence", persist),
                                 ("spread", {"agencySpreadKm": spread} if spread else None)) if v}
    if pattern:
        out["pattern"] = pattern
    else:
        missing.append({"section": "pattern", "reason": "진행 방향·지속 시간 자료가 없다"})

    # ── conditions (WHY 재료 — 함께 나타난 조건, 원인 주장이 아니다) ─────────────
    sst = sst_at(sst_doc or {}, lo.get("lat"), lo.get("lon")) if _num(lo.get("lat")) and _num(lo.get("lon")) else None
    if sst is not None and (sst_doc or {}).get("observed"):
        out["conditions"] = [{"key": "sstAtCenter", "value": sst, "unit": "°C", "kind": "OFFICIAL_OBSERVATION",
                              "source": "NOAA OISST v2.1 (1° 축약)", "at": sst_doc["observed"],
                              "noteKo": "태풍 중심이 있는 1° 격자칸의 해수면 온도 — 같은 자리에 함께 나타난 조건",
                              "noteEn": "Sea surface temperature of the 1° cell under the storm centre — a condition observed alongside"}]
    else:
        missing.append({"section": "conditions", "reason": "중심 위치의 해수면 온도를 읽지 못했다(육지·자료 없음)"})

    # ── related (IMPACT 재료) ────────────────────────────────────────────
    related = []
    near = (packet.get("importance") or {}).get("inputs", {}).get("nearestWarnRegionKm")
    if _num(near) and near <= WARN_RADIUS_KM:
        related.append({"phenomenonId": "weather.warning", "relation": "co_located",
                        "evidence": {"rule": "한국 특보구역 %d km 이내" % WARN_RADIUS_KM, "distanceKm": near,
                                     "ref": "aws/cyclone-analog/handler.py _nearest_warn_region_km"}})
    if "conditions" in out:
        related.append({"phenomenonId": "ocean.sst", "relation": "reference",
                        "evidence": {"citation": GRAY_1968,
                                     "noteKo": "교과서 관계 — 이번 사건에서 계산한 연결이 아니다"}})
    if related:
        out["related"] = related
    else:
        missing.append({"section": "related", "reason": "한국 특보구역 350 km 밖이고 연결할 관측이 없다"})

    # ── next (유형 A — 기관 인용만. 우리 예보를 만들지 않는다) ──────────────────
    items = []
    for f in det.get("official") or []:
        if f.get("agency") in _OFFICIAL and f.get("issued"):
            items.append({"type": "A", "kind": "OFFICIAL_FORECAST", "source": f.get("agencyKo") or f["agency"],
                          "issuedAt": f["issued"], "horizonH": f.get("horizonH"),
                          "headingKo": f.get("headingKo"), "peak": f.get("peak"), "weakenAt": f.get("weakenAt")})
    for m in det.get("models") or []:
        # ⚠️ models[] 에는 우리 계산(EARTHUS_MULTI_SOURCE)도 섞여 있다. 그것은 기관·제공자 인용(유형 A)이
        #    아니다 — 제공자 예보로 달면 우리 예보를 남의 것처럼 내보내는 셈이다. 유형 B(검증된 통계)로
        #    올릴 근거(채점 이력의 공개 기준)가 정해지기 전까지 NEXT 에 싣지 않는다.
        if str(m.get("agency") or "").upper().startswith("EARTHUS"):
            continue
        if m.get("issued"):
            items.append({"type": "A", "kind": "PROVIDER_FORECAST", "source": m.get("agencyKo") or m.get("agency"),
                          "issuedAt": m["issued"], "horizonH": m.get("horizonH"), "headingKo": m.get("headingKo")})
    if items:
        out["next"] = {"items": items}
    else:
        missing.append({"section": "next", "reason": "기관 예보가 사건 패킷에 없다"})

    imp = packet.get("importance")
    if imp and isinstance(imp.get("reasons"), list):
        out["importance"] = {"reasons": list(imp["reasons"]), "inputs": dict(imp.get("inputs") or {}),
                             "note": imp.get("note") or "점수 아님"}
    else:
        missing.append({"section": "importance", "reason": "이유 목록이 없다"})

    conf = packet.get("confidence") or {}
    grade = _GRADE.get(str(conf.get("level") or "").lower())
    if grade:
        out["confidence"] = {"grade": grade, "inputs": {
            "formula_id": CONFIDENCE_FORMULA, "sourceN": conf.get("sourceN"),
            "agencyAgreement24hKm": conf.get("agencyAgreement24hKm"), "freshnessMin": conf.get("freshnessMin"),
            "rule": conf.get("note")}}
    else:
        missing.append({"section": "confidence", "reason": "등급이 없다"})

    unc = packet.get("uncertainty")
    if isinstance(unc, dict) and unc:
        out["uncertainty"] = dict(unc)
    else:
        missing.append({"section": "uncertainty", "reason": "기관 폭 자료가 없다"})

    # ── sources ─────────────────────────────────────────────────────────
    srcs = []
    if agency:
        srcs.append({"id": "%s-observed" % agency.lower(), "kind": "OFFICIAL_OBSERVATION",
                     "ageMin": _age_min(lo.get("at"), now), "slaMin": 360, "state": None})
    for f in det.get("official") or []:
        if f.get("agency") in _OFFICIAL and f.get("issued"):
            srcs.append({"id": "%s-forecast" % f["agency"].lower(), "kind": "OFFICIAL_FORECAST",
                         "ageMin": _age_min(f["issued"], now), "slaMin": 720, "state": None})
    if "conditions" in out:
        srcs.append({"id": "noaa-oisst-v2.1", "kind": "OFFICIAL_OBSERVATION",
                     "ageMin": _age_min(sst_doc.get("observed"), now), "slaMin": 2880, "state": None})
    for s in srcs:
        s["state"] = "fresh" if s["ageMin"] is not None and s["ageMin"] <= s["slaMin"] else "aging"
    out["sources"] = srcs
    out["coverage"] = {"missing": missing}
    return intel_contract.require_valid(out, known_phenomena=None)

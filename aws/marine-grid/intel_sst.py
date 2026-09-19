# -*- coding: utf-8 -*-
"""해수면 온도(ocean.sst) → 인텔 패킷 v1 (INTELLIGENCE-LAYER-PLAN P3 · 계약 §C).

**새 값을 계산하지 않는다.** 이 Lambda 가 방금 받은 NOAA OISST 1° 격자(ocean/sst-global.json)와
marine-ea 가 이미 공개해 둔 평년 대비 격자(ocean/sst-anom-ea.json)에서 **격자칸 값을 옮길 뿐**이다.
모양이 틀리면 intel_contract 가 거절하고, 그때는 sst-global.json 에 intel=None 만 싣는다(격자는 그대로 나간다).

⚠️ 파일 이름을 intel_v1.py 로 두지 않았다 — cyclone-analog/intel_v1.py 와 이름이 같으면 한 pytest 실행에서
   먼저 불린 쪽이 sys.modules 에 남아 다른 함수의 시험이 엉뚱한 모듈을 부른다.

왜 sst-global.json **안에** 싣나 (cyclone-analog/intel_v1.py 와 같은 이유)
  intel/ 은 버킷 공개 접두사가 아니다(publication_privacy.BUCKET_PUBLIC_PREFIXES) — 거기 쓰면 앱이 못 읽는다.
  화면은 수온 레이어(ocean/sstfield)를 켤 때 이 문서를 이미 받는다(live-layers.js 'sstfield').
  안에 실으면 띠가 **새 요청 없이** 그려진다 — 계약 §C-0 "SELECT·INFORMATION 은 이미 로드된 패킷만".

기준 격자칸 (REF_CELLS)
  한국 세 바다에서 해안과 떨어진 1° 칸 하나씩이다. **해역 평균이 아니다** — 평균·면적가중·백분위는
  EARTHUS 기준선 계산이라(계약 §I L-4 PD 결정 대기) 만들지 않는다. 칸 좌표는 NOAA 0.25° 원격자의
  칸 중심(x.125)이어서 1° 전지구판과 0.5° 동아시아판이 **같은 원격자 칸**을 가리킨다. 칸이 격자점과
  정확히 맞지 않으면 읽지 않는다 — 가까운 칸으로 바꿔 읽지 않는다.

절별 출처
  current   기준 칸 3개의 OISST 일별 관측값                                     OFFICIAL_OBSERVATION
  anomaly   같은 칸의 (관측 − NOAA 1991–2020 일별 평년). 평년은 NOAA PSL 이 발표한 값이고,
            뺄셈은 marine-ea 가 이미 해서 공개한 sstAnom 을 옮긴다. 같은 관측일일 때만 싣는다.
            백분위는 싣지 않는다(L-4).                                          OFFICIAL_OBSERVATION
  related   hazards.typhoon — 교과서 관계(reference, Gray 1968; phenomenon-relations.js 와 같은 문헌)

비워 둔 절 (coverage.missing 에 이유)
  change·pattern  이 문서는 하루치 관측만 담는다 — 날짜 사이 변화는 변화 롤업(P2a)이 생기면 채운다
  conditions      수온과 같은 때·같은 자리에 잰 조건(바람·일사·혼합층)이 이 자료에 없다
  next            해수면 온도 기관 예보를 받는 수집기가 없다 — 우리 예보는 만들지 않는다
  importance·confidence·uncertainty  정의된 규칙·산식·오차장이 없다
"""
import os
import sys
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import intel_contract  # noqa: E402

PHENOMENON_ID = "ocean.sst"
SOURCE_OBS = "NOAA OISST v2.1 (0.25° 원격자를 1° 간격으로 표본)"
SOURCE_ANOM = "NOAA OISST v2.1 관측 − NOAA 1991–2020 일별 평년 (같은 칸)"
# engine-bridge.js LAYER_TRUTH — ocean/sstfield 1440분, ocean/sstanom 2880분
SLA_SST_MIN = 1440
SLA_ANOM_MIN = 2880
ANOM_BOX_KO = "동아시아 0.5° 상자(23–47°N, 114–150°E)"
GRAY_1968 = ("Gray, W. M. (1968). Global view of the origin of tropical disturbances and storms. "
             "Monthly Weather Review, 96(10), 669–700.")

# (key, 위도, 경도, 이름 ko, 이름 en) — 한국 먼저(시장 우선순위), 세 바다 하나씩.
REF_CELLS = (
    ("sstEastSea", 37.125, 130.125, "동해 기준 격자칸", "East Sea reference cell"),
    ("sstYellowSea", 36.125, 124.125, "서해 기준 격자칸", "Yellow Sea reference cell"),
    ("sstSouthSea", 34.125, 128.125, "남해 기준 격자칸", "South Sea reference cell"),
)
CELL_NOTE_KO = "NOAA OISST 격자칸 하나의 값 — 해역 평균이 아니다"
CELL_NOTE_EN = "Value of a single NOAA OISST grid cell — not a sea-area average"


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def cell_value(doc, var, lat, lon):
    """격자 문서에서 (lat, lon) 칸의 값. 칸 중심과 정확히 맞지 않거나, 범위 밖·육지·자료 없음이면 None."""
    try:
        res, lat0, lon0, nx, ny = (doc[k] for k in ("res", "lat0", "lon0", "nx", "ny"))
        fy, fx = (lat - lat0) / res, (lon - lon0) / res
        iy, ix = round(fy), round(fx)
        if abs(fy - iy) > 1e-6 or abs(fx - ix) > 1e-6:
            return None                      # 칸 중심이 아니다 — 가까운 칸으로 바꿔 읽지 않는다
        if not (0 <= iy < ny and 0 <= ix < nx):
            return None
        v = doc[var][iy * nx + ix]
        return v if _num(v) else None
    except (KeyError, TypeError, IndexError, ZeroDivisionError):
        return None


def _age_min(iso, now):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return round((now - t).total_seconds() / 60)
    except (TypeError, ValueError):
        return None


def _cell_meta(lat, lon, ko, en):
    return {"lat": lat, "lon": lon, "labelKo": ko, "labelEn": en, "noteKo": CELL_NOTE_KO, "noteEn": CELL_NOTE_EN}


def build(sst_doc, now, anom_doc=None):
    """sst-global 문서(dict) → v1 인텔 패킷(dict). 계약 위반이면 IntelContractError.

    anom_doc 은 marine-ea 의 ocean/sst-anom-ea.json. 없거나 관측일이 다르면 anomaly 절을 비운다.
    """
    observed = (sst_doc or {}).get("observed")
    missing = []
    out = {
        "schema": 1,
        "phenomenonId": PHENOMENON_ID,
        "eventId": None,
        "time": {"observedAt": observed, "issuedAt": (sst_doc or {}).get("issuedAt"),
                 "retrievedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ")},
    }
    for k in ("observedAt", "issuedAt"):
        if out["time"][k] is None:
            del out["time"][k]

    # ── current — 기준 칸의 관측값 ─────────────────────────────────────────
    vals = []
    if observed:
        for key, lat, lon, ko, en in REF_CELLS:
            v = cell_value(sst_doc, "sst", lat, lon)
            if v is None:
                continue
            vals.append({"key": key, "value": v, "unit": "°C", "kind": "OFFICIAL_OBSERVATION",
                         "source": SOURCE_OBS, "at": observed, **_cell_meta(lat, lon, ko, en)})
    if not vals:
        # 관측값이 없으면 교과서 연결 한 줄짜리 패킷이 된다 — 띠에 올릴 것이 없으니 만들지 않는다
        raise intel_contract.IntelContractError("기준 격자칸의 관측값을 읽지 못했다(관측일 없음·육지·자료 없음)")
    out["current"] = {"values": vals}

    missing.append({"section": "change",
                    "reason": "이 문서는 하루치 관측만 담는다 — 날짜 사이 변화는 변화 롤업(P2a)이 생기면 채운다"})

    # ── anomaly — NOAA 가 발표한 평년 대비 (같은 관측일만) ──────────────────────
    anom_items, anom_reason = [], None
    a_obs = (anom_doc or {}).get("observed") if isinstance(anom_doc, dict) else None
    if not isinstance(anom_doc, dict) or not anom_doc:
        anom_reason = "평년 대비 자료(ocean/sst-anom-ea.json)를 읽지 못했다"
    elif not observed or a_obs != observed:
        anom_reason = ("평년 대비 자료의 관측일(%s)이 수온 관측일(%s)과 다르다 — 다른 날의 값을 섞지 않는다"
                       % ((a_obs or "없음")[:10], (observed or "없음")[:10]))
    elif not anom_doc.get("period"):
        anom_reason = "평년 대비 자료에 평년 기간이 적혀 있지 않다 — 출처 없는 평년은 쓰지 않는다"
    else:
        cur = {v["key"]: v["value"] for v in vals}
        for key, lat, lon, ko, en in REF_CELLS:
            obs = cell_value(anom_doc, "sst", lat, lon)
            delta = cell_value(anom_doc, "sstAnom", lat, lon)
            if obs is None or delta is None:
                continue
            # 같은 날 같은 원격자 칸인데 두 문서의 관측값이 다르면 어느 쪽도 믿을 수 없다 — 싣지 않는다
            if key in cur and abs(cur[key] - obs) > 0.005:
                continue
            anom_items.append({"key": key, "value": obs, "baseline": round(obs - delta, 2), "delta": delta,
                               "unit": "°C", "kind": "OFFICIAL_OBSERVATION", "source": SOURCE_ANOM,
                               "at": a_obs, **_cell_meta(lat, lon, ko, en)})
        if not anom_items:
            anom_reason = "기준 격자칸에 평년 대비 값이 없다"
    if anom_items:
        doy = anom_doc.get("doy")
        out["anomaly"] = {
            "baseline": {"name": "NOAA OISST v2.1 일별 평년" + (" (연중 %s번째 날)" % doy if doy else ""),
                         "source": "NOAA PSL — sst.day.mean.ltm.1991-2020",
                         "period": str(anom_doc["period"])},
            "items": anom_items,
            "coverageKo": "평년 대비 값은 %s에만 있다 — 전지구 편차가 아니다" % ANOM_BOX_KO,
            "noteKo": "백분위·해역 평균은 싣지 않는다 — EARTHUS 기준선 계산은 계약 §I L-4 PD 결정 대기다",
        }
    else:
        missing.append({"section": "anomaly", "reason": anom_reason})

    missing.append({"section": "pattern",
                    "reason": "기준 칸의 값이 며칠째 이어지는지 셀 이력이 없다 — 변화 롤업(P2a) 전이다"})
    missing.append({"section": "conditions",
                    "reason": "해수면 온도와 같은 때·같은 자리에 잰 조건(바람·일사·혼합층)을 이 자료가 담지 않는다"})

    # ── related — 연결표(phenomenon-relations.js)에 있는 것만 ─────────────────────
    out["related"] = [{"phenomenonId": "hazards.typhoon", "relation": "reference",
                       "evidence": {"citation": GRAY_1968,
                                    "noteKo": "교과서 관계 — 이번 관측에서 계산한 연결이 아니다",
                                    "noteEn": "Textbook relation — not a link computed from this observation"}}]

    missing.append({"section": "next", "reason": "해수면 온도 기관 예보를 받는 수집기가 없다 — 우리 예보는 만들지 않는다"})
    missing.append({"section": "importance", "reason": "해수면 온도의 중요도 규칙이 정의되지 않았다 — 점수를 만들지 않는다"})
    missing.append({"section": "confidence", "reason": "정의된 산식(formula_id)이 없다 — 등급을 찍지 않는다"})
    missing.append({"section": "uncertainty", "reason": "OISST 오차장(err)을 받지 않는다"})

    # ── sources ─────────────────────────────────────────────────────────
    srcs = [{"id": "noaa-oisst-v2.1", "kind": "OFFICIAL_OBSERVATION",
             "ageMin": _age_min(observed, now), "slaMin": SLA_SST_MIN, "state": None}]
    if "anomaly" in out:
        srcs.append({"id": "noaa-oisst-v2.1-ltm-1991-2020", "kind": "OFFICIAL_OBSERVATION",
                     "ageMin": _age_min(a_obs, now), "slaMin": SLA_ANOM_MIN, "state": None})
    for s in srcs:
        s["state"] = "fresh" if s["ageMin"] is not None and s["ageMin"] <= s["slaMin"] else "aging"
    out["sources"] = srcs
    out["coverage"] = {"missing": missing}
    return intel_contract.require_valid(out, known_phenomena=None)

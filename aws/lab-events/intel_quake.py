# -*- coding: utf-8 -*-
"""지진 세션(lab-events) → 인텔 패킷 v1 (INTELLIGENCE-LAYER-PLAN P3 · 계약 §C).

**새 값을 계산하지 않는다.** lab-events 가 이미 받은 USGS·JMA/기상청(quake-asia)·쓰나미 게시문(tsunami-intl)과
이미 계산·채점해 공개하는 여진 기대수(Reasenberg–Jones 일반형)를 v1 계약 모양으로 옮길 뿐이다.
모양이 틀리면 intel_contract 가 거절하고, 그 사건은 패킷 문서에서 빠진다(보고서는 그대로 나간다).

⚠️ 파일 이름을 intel_v1.py 로 두지 않았다 — cyclone-analog/intel_v1.py 와 이름이 같으면 한 pytest 실행에서
   먼저 불린 쪽이 sys.modules 에 남아 다른 함수의 시험이 엉뚱한 모듈을 부른다.

왜 ocean/earthquake-intel.json 한 파일인가
  lab-events 의 결과(analysis/)는 비공개 접두사다. 공개 색인(ocean/lab-reports.json)은 1.4 MB 이고
  lab-report-index 가 칸을 골라 옮겨서 intel 칸은 조용히 빠진다. 사건 방은 그 색인을 받지도 않는다.
  그래서 USGS 사건 id → 패킷의 작은 지도를 공개 접두사 ocean/ 에 따로 둔다(ocean/lab-reports.json·
  ocean/tsunami-eta.json 과 같은 자리 — lab-events 역할(earthus-lambda-khoa-coast)이 이미 쓰는 접두사다).

절별 출처
  current     USGS 규모·깊이·진앙, 진앙 100 km 안 여진 수(M3+·M4+)·최대 여진, 같은 사건의 JMA·기상청 최대 진도
              (발생 시각 180초 안), 쓰나미 게시문 수                                          OFFICIAL_*
  change      회차 두 개 사이(24시간 전 회차, 없으면 첫 회차)의 여진 수·USGS 규모 수정          OFFICIAL_OBSERVATION
  pattern     본진 뒤 경과 구간별 실제 M4+ 여진 수 ↔ lab-events 가 이미 계산·채점한 RJ 일반형 기대수,
              그 채점(n·평균 오차). 기대수는 EARTHUS_FORECAST 로 표시 — 기관 값이 아니다
  related     hazards.tsunami computed — aws/tsunami-eta 가 이 사건의 도달시간을 계산했을 때만
              (phenomenon-relations.js 의 유일한 computed 연결)
  importance  lab-events 가 이 사건을 추적하는 기준(전지구 M6+·한일대만 상자 M5+)과 게시문 — 점수 아님
  uncertainty USGS 검토 상태·규모 수정

비워 둔 절 (coverage.missing 에 이유)
  conditions  지진과 같은 때·같은 자리에 잰 조건(응력·지각 변위) 관측이 이 계산기에 없다
  next        기관 여진 예보를 받는 수집기가 없다. RJ 일반형 기대수는 채점은 되지만 '검증된 통계 모델'(부록 B 유형 B)의
              합격 기준이 없고, 실측 대조에서 크게 어긋난다(예: 2026-09 페루 M6.7 본진 뒤 0~1일 기대 19.6회·실제 1회).
              태풍 패킷(cyclone-analog/intel_v1.py)이 EARTHUS 다중소스 예보를 NEXT 에 싣지 않는 것과 같은 규칙이다.
              RJ_NEXT_ACCEPTED 를 True 로 바꾸면(= PD 가 유형 B 로 인정) 채점된 사건에 한해 유형 B 로 싣는다.
  confidence  정의된 산식이 없다
"""
import os
import sys
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import intel_contract  # noqa: E402

PHENOMENON_ID = "hazards.earthquake"
SOURCE_USGS = "USGS ComCat"
SOURCE_COUNT = "USGS ComCat — 진앙 100 km 안 여진 수 (lab-events 집계)"
SOURCE_RJ = "EARTHUS 여진 기대수 (Reasenberg–Jones 1989 일반형)"
# lab-events handler.py 와 같은 값이어야 한다 — 시험이 대조한다(여기서 handler 를 import 하면 순환이 된다)
ASIA_BOX = (20.0, 50.0, 118.0, 150.0)
RJ_PARAMS = {"a": -1.67, "b": 0.91, "p": 1.08, "c": 0.05}
# 같은 사건으로 보는 기관 발표의 발생 시각 차이. lab-events 의 기관 목록은 120 km·3일 안의 **모든** 발표라
# 다른 작은 지진이 섞여 있다(실측: 미쓰카이도 M5.0 옆에 사흘 뒤 M3.9 가 붙어 있었다) — 시각으로 다시 가른다.
AGENCY_MATCH_S = 180
# lab-events 는 3시간마다 돈다(deploy-lab-events.sh cron(40 */3 * * ? *)) — 한 번 놓쳐도 늦음으로 보지 않는 폭
SLA_LAB_MIN = 240
CHANGE_HOURS = 24
# PD 결정 전에는 RJ 기대수를 NEXT(유형 B)에 싣지 않는다 — 모듈 주석 'next' 참고
RJ_NEXT_ACCEPTED = False
TSUNAMI_ETA_RULE = "바다 지진(M6.5 이상·진원 100 km 이하)마다 수심 격자에서 도달시간을 계산한다"


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _t(value):
    try:
        t = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _age_min(iso, now):
    t = _t(iso)
    return round((now - t).total_seconds() / 60) if t else None


def _val(key, value, unit, kind, source, at, ko, en, **extra):
    return {"key": key, "value": value, "unit": unit, "kind": kind, "source": source, "at": at,
            "labelKo": ko, "labelEn": en, **extra}


def same_event_agency_reports(snapshot, origin):
    """기관 발표 중 발생 시각이 본진과 AGENCY_MATCH_S 안인 것 — 기관마다 진도가 있는 첫 발표 하나."""
    o = _t(origin)
    picked = {}
    for q in (snapshot or {}).get("agencies") or []:
        at = _t(q.get("at"))
        if not (o and at and q.get("src") and q.get("intensity")):
            continue
        if abs((at - o).total_seconds()) > AGENCY_MATCH_S:
            continue
        picked.setdefault(q["src"], q)
    return list(picked.values())


def _base_snapshot(snaps):
    """change 의 기준 회차 — 마지막 회차보다 24시간 이상 앞선 것 중 가장 늦은 것, 없으면 첫 회차."""
    if len(snaps) < 2:
        return None
    last_at = _t(snaps[-1].get("at"))
    if not last_at:
        return None
    older = [s for s in snaps[:-1] if _t(s.get("at")) and _t(s["at"]) <= last_at - timedelta(hours=CHANGE_HOURS)]
    return older[-1] if older else snaps[0]


def _scored_windows(last):
    """본진 뒤 경과 구간(0~1·1~7·7~30일)의 실제 M4+ 와 RJ 기대수. 회차의 windows 를 쓴다(채점 행과 같은 값)."""
    out = []
    for w in (last or {}).get("windows") or []:
        if not all(_num(w.get(k)) for k in ("t1", "t2", "actual", "expected")):
            continue
        out.append({"window": "본진 뒤 %d~%d일" % (w["t1"], w["t2"]), "t1Days": w["t1"], "t2Days": w["t2"],
                    "observedM4": w["actual"], "observedKind": "OFFICIAL_OBSERVATION",
                    "rjExpectedM4": w["expected"], "rjKind": "EARTHUS_FORECAST"})
    return out


def _rj_score(session):
    s = next((x for x in session.get("scores") or [] if x.get("agency") == "EARTHUS_RJ"), None)
    return s if s and _num(s.get("n")) and s["n"] >= 1 else None


def build(session, now, eta_index=None):
    """lab-events 지진 세션(dict) → v1 인텔 패킷(dict). 계약 위반이면 IntelContractError."""
    f = session.get("facts") or {}
    snaps = session.get("snapshots") or []
    last = snaps[-1] if snaps else {}
    origin = f.get("time")
    uid = f.get("id") or str(session.get("id") or "").split(":", 1)[-1]
    if not (uid and origin and _num(f.get("mag")) and _num(f.get("lat")) and _num(f.get("lon"))):
        raise intel_contract.IntelContractError("본진 사실(id·시각·규모·진앙)이 없다 — 패킷을 만들지 않는다")
    missing = []
    out = {
        "schema": 1,
        "phenomenonId": PHENOMENON_ID,
        "eventId": session.get("id") or "earthquake:%s" % uid,
        "time": {"observedAt": origin, "issuedAt": last.get("at") or session.get("lastSeen"),
                 "retrievedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ")},
    }
    if not out["time"]["issuedAt"]:
        del out["time"]["issuedAt"]

    # ── current ──────────────────────────────────────────────────────────
    mag = last.get("mag") if _num(last.get("mag")) else f["mag"]
    depth = last.get("depthKm") if _num(last.get("depthKm")) else f.get("depthKm")
    vals = [_val("magnitude", mag, "M", "OFFICIAL_OBSERVATION", SOURCE_USGS, origin, "규모", "Magnitude")]
    if _num(depth):
        vals.append(_val("depthKm", depth, "km", "OFFICIAL_OBSERVATION", SOURCE_USGS, origin, "진원 깊이", "Depth"))
    vals.append(_val("epicenterLat", f["lat"], "deg", "OFFICIAL_OBSERVATION", SOURCE_USGS, origin, "진앙 위도", "Epicentre lat"))
    vals.append(_val("epicenterLon", f["lon"], "deg", "OFFICIAL_OBSERVATION", SOURCE_USGS, origin, "진앙 경도", "Epicentre lon"))
    if last.get("at"):
        for key, field, ko, en in (("aftershocksM3", "aftershockN", "여진 M3 이상 (100 km 안)", "Aftershocks M3+ (within 100 km)"),
                                   ("aftershocksM4", "aftershockM4", "여진 M4 이상 (100 km 안)", "Aftershocks M4+ (within 100 km)")):
            if _num(last.get(field)):
                vals.append(_val(key, last[field], "count", "OFFICIAL_OBSERVATION", SOURCE_COUNT, last["at"], ko, en,
                                 noteKo="본진 뒤 지금까지 누적"))
        big = last.get("largest") or {}
        if _num(big.get("mag")) and _t(big.get("time")):
            vals.append(_val("largestAftershock", big["mag"], "M", "OFFICIAL_OBSERVATION", SOURCE_USGS, big["time"],
                             "최대 여진", "Largest aftershock", place=big.get("place")))
        bulletins = [b for b in last.get("tsunami") or [] if _t(b.get("updated"))]
        if bulletins:
            vals.append(_val("tsunamiBulletins", len(bulletins), "count", "OFFICIAL_WARNING",
                             "PTWC·NTWC 게시문 (진앙 400 km·본진 2일 안)", max(b["updated"] for b in bulletins),
                             "쓰나미 게시문", "Tsunami bulletins",
                             bulletins=[{"center": b.get("center"), "category": b.get("category"),
                                         "updated": b.get("updated"), "url": b.get("url")} for b in bulletins]))
    agencies = same_event_agency_reports(last, origin)
    for q in agencies:
        vals.append(_val("maxIntensity%s" % q["src"], q["intensity"], "category", "OFFICIAL_OBSERVATION",
                         q.get("srcKo") or q["src"], q["at"], "최대 진도 (%s)" % (q.get("srcKo") or q["src"]),
                         "Max intensity (%s)" % q["src"], scaleKo="%s 진도 계급" % (q.get("srcKo") or q["src"]),
                         agencyMag=q.get("mag"), place=q.get("placeEn") or q.get("place")))
    out["current"] = {"values": vals}

    # ── change — 회차 두 개 사이 ───────────────────────────────────────────
    base = _base_snapshot(snaps)
    if base:
        items = []
        for key, field in (("aftershocksM3", "aftershockN"), ("aftershocksM4", "aftershockM4")):
            if _num(base.get(field)) and _num(last.get(field)):
                items.append({"key": key, "delta": last[field] - base[field], "from": base[field], "to": last[field],
                              "unit": "count", "kind": "OFFICIAL_OBSERVATION", "source": SOURCE_COUNT,
                              "at": last["at"], "since": base["at"]})
        if _num(base.get("mag")) and _num(last.get("mag")) and base["mag"] != last["mag"]:
            items.append({"key": "magnitude", "delta": round(last["mag"] - base["mag"], 2), "from": base["mag"],
                          "to": last["mag"], "unit": "M", "kind": "OFFICIAL_OBSERVATION", "source": SOURCE_USGS,
                          "at": last["at"], "since": base["at"], "noteKo": "USGS 규모 수정"})
        if items:
            hours = round((_t(last["at"]) - _t(base["at"])).total_seconds() / 3600, 1)
            out["change"] = {"windows": {"since": base["at"], "to": last["at"], "hours": hours}, "items": items}
    if "change" not in out:
        missing.append({"section": "change", "reason": "회차가 하나뿐이다 — 두 회차가 쌓이면 여진 수 변화를 적는다"})

    missing.append({"section": "anomaly",
                    "reason": "평년 대비(지역 지진 활동 기준선)는 EARTHUS 기준선 계산이다 — 계약 §I L-4 PD 결정 대기라 만들지 않았다"})

    # ── pattern — 여진 흐름 vs 이미 채점 중인 RJ 일반형 ────────────────────────
    seq = _scored_windows(last)
    score = _rj_score(session)
    pattern = {}
    if _num(last.get("daysSince")):
        pattern["persistence"] = {"daysSinceMainshock": last["daysSince"]}
    if seq:
        pattern["sequence"] = {
            "windows": seq,
            "model": {"name": "Reasenberg–Jones (1989) 일반형", "params": dict(RJ_PARAMS), "mMin": 4, "radiusKm": 100,
                      "noteKo": "캘리포니아 일반 매개변수 · 지역 보정 없음 — 이 사건에 맞춘 값이 아니다. 기준선 비교이지 예보 검증 합격이 아니다",
                      "noteEn": "Generic California parameters, no regional calibration — a baseline comparison, not a validated forecast"},
        }
        if score:
            pattern["sequence"]["scored"] = {"n": score["n"], "meanAbsError": score.get("meanAbsError"), "unit": "회",
                                             "noteKo": "회차마다 USGS 여진 수(100 km·M4+)로 채점한 평균 절대 오차"}
    if pattern:
        out["pattern"] = pattern
    else:
        missing.append({"section": "pattern", "reason": "본진 뒤 하루가 지나지 않아 비교할 구간이 없다"})

    missing.append({"section": "conditions",
                    "reason": "지진과 같은 때·같은 자리에 잰 조건(응력·지각 변위) 관측이 이 계산기에 없다 — 기관 발표와 쓰나미 게시문은 같은 사건의 다른 기록이지 조건이 아니다"})

    # ── related — 연결표의 computed 한 줄(지진→쓰나미)만 ───────────────────────
    eta = next((e for e in (eta_index or {}).get("events") or [] if str(e.get("usgsId")) == str(uid)), None)
    if eta:
        out["related"] = [{"phenomenonId": "hazards.tsunami", "relation": "computed",
                           "evidence": {"rule": TSUNAMI_ETA_RULE, "ref": "aws/tsunami-eta/handler.py",
                                        "output": eta.get("key"), "outputKind": "SIMULATION",
                                        "computedAt": eta.get("computedAt"),
                                        "noteKo": "도달시간은 SIMULATION_ONLY 계산이다 — 기관 쓰나미 정보가 아니다"}}]
    else:
        missing.append({"section": "related",
                        "reason": "쓰나미 도달시간 계산 대상이 아니다(M6.5 이상·진원 100 km 이하·바다·최근 10일) — 연결표에 있는 연결이 없다"})

    # ── next ─────────────────────────────────────────────────────────────
    fc = last.get("forecast") if isinstance(last.get("forecast"), dict) else None
    if RJ_NEXT_ACCEPTED and fc and score and _num(fc.get("expected")) and last.get("at"):
        out["next"] = {"items": [{
            "type": "B", "kind": "EARTHUS_FORECAST", "source": SOURCE_RJ, "issuedAt": last["at"],
            "key": "aftershocksM4", "expected": fc["expected"], "mMin": fc.get("mMin", 4), "from": fc.get("from"),
            "to": fc.get("to"), "scored": {"n": score["n"], "meanAbsError": score.get("meanAbsError")},
            "noteKo": "캘리포니아 일반 매개변수 · 지역 보정 없음 · 회차마다 USGS 여진 수로 채점 — 기관 예보가 아니다"}]}
    else:
        if not snaps:
            reason = "회차 자료가 없다"
        elif not fc:
            reason = "기관 여진 예보를 받는 수집기가 없다. EARTHUS 여진 기대수는 본진 30일 경과로 추정을 끝냈다"
        else:
            first = next((w for w in seq if w["t1Days"] == 0), None)
            eg = (" 이 사건 본진 뒤 0~1일은 기대 %s회·실제 %s회였다." % (first["rjExpectedM4"], first["observedM4"])) if first else ""
            sc = (" 채점 %s구간 평균 오차 %s회." % (score["n"], score.get("meanAbsError"))) if score else " 아직 채점된 구간이 없다."
            reason = ("기관 여진 예보를 받는 수집기가 없다. EARTHUS 여진 기대수(RJ 일반형)는 '검증된 통계 모델'(유형 B)의 "
                      "합격 기준이 정해지지 않아 NEXT 에 싣지 않는다 — 태풍 패킷과 같은 규칙." + sc + eg)
        missing.append({"section": "next", "reason": reason})

    # ── importance — lab-events 추적 기준을 옮긴다(점수 아님) ──────────────────
    reasons, in_box = [], ASIA_BOX[0] <= f["lat"] <= ASIA_BOX[1] and ASIA_BOX[2] <= f["lon"] <= ASIA_BOX[3]
    if mag >= 6:
        reasons.append("M%.1f — 전지구 M6 이상 추적 기준" % mag)
    if in_box and mag >= 5:
        reasons.append("한·일·대만 상자(20–50°N, 118–150°E) 안 M5 이상 추적 기준")
    bulletins = [b for b in last.get("tsunami") or [] if _t(b.get("updated"))]
    if bulletins:
        reasons.append("쓰나미 게시문 %d건 (%s)" % (len(bulletins), ", ".join(sorted({str(b.get("center")) for b in bulletins}))))
    for q in agencies:
        reasons.append("%s 최대 진도 %s" % (q.get("srcKo") or q["src"], q["intensity"]))
    if reasons:
        out["importance"] = {"reasons": reasons,
                             "inputs": {"mag": mag, "inAsiaBox": in_box, "tsunamiBulletins": len(bulletins),
                                        "usgsTsunamiFlag": f.get("tsunami")},
                             "note": "점수 아님 — lab-events 가 이 사건을 추적하는 기준과 기관 발표를 옮겼다"}
    else:
        missing.append({"section": "importance", "reason": "추적 기준에 걸린 이유가 없다"})

    missing.append({"section": "confidence", "reason": "정의된 산식(formula_id)이 없다 — 등급을 찍지 않는다"})

    status = last.get("usgsStatus") or f.get("usgsStatus")
    if status:
        unc = {"usgsReview": status,
               "noteKo": ("USGS 검토 완료 값" if status == "reviewed"
                          else "USGS 자동 산출 값 — 검토 뒤 규모·위치가 바뀔 수 있다")}
        if _num(f.get("mag")) and f["mag"] != mag:
            unc["magnitudeRevision"] = {"from": f["mag"], "to": mag}
        out["uncertainty"] = unc
    else:
        missing.append({"section": "uncertainty", "reason": "USGS 검토 상태가 없다"})

    # ── sources ─────────────────────────────────────────────────────────
    at = last.get("at") or session.get("lastSeen")
    srcs = [{"id": "usgs-comcat", "kind": "OFFICIAL_OBSERVATION", "ageMin": _age_min(at, now), "slaMin": SLA_LAB_MIN}]
    for q in agencies:
        srcs.append({"id": "%s-quake-report" % q["src"].lower(), "kind": "OFFICIAL_OBSERVATION",
                     "ageMin": _age_min(q["at"], now), "slaMin": None})
    for b in bulletins:
        srcs.append({"id": "%s-bulletin" % str(b.get("center") or "tsunami").lower(), "kind": "OFFICIAL_WARNING",
                     "ageMin": _age_min(b["updated"], now), "slaMin": None})
    if seq:
        srcs.append({"id": "earthus-rj-generic", "kind": "EARTHUS_FORECAST", "ageMin": _age_min(at, now), "slaMin": SLA_LAB_MIN})
    if eta:
        srcs.append({"id": "earthus-tsunami-eta", "kind": "SIMULATION", "ageMin": _age_min(eta.get("computedAt"), now), "slaMin": None})
    for s in srcs:
        # 한 번 나온 발표(게시문·기관 지진정보·계산 결과)는 늙지 않는다 — 신선도 대신 '발표됨'으로 둔다
        s["state"] = ("issued" if s["slaMin"] is None
                      else "fresh" if s["ageMin"] is not None and s["ageMin"] <= s["slaMin"] else "aging")
    out["sources"] = srcs
    out["coverage"] = {"missing": missing}
    return intel_contract.require_valid(out, known_phenomena=None)


def build_doc(sessions, now, eta_index=None, max_age_days=30, log=print):
    """ocean/earthquake-intel.json 본문 — USGS 사건 id → 패킷. 본진 30일 안(RJ 추정 구간)만 싣는다.

    사건 하나가 계약을 못 맞추면 그 사건만 빠진다. 빠진 수를 failed 에 적는다 — 조용히 줄지 않게.
    """
    packets, failed = {}, []
    for s in sessions:
        origin = _t((s.get("facts") or {}).get("time"))
        if not origin or now - origin > timedelta(days=max_age_days):
            continue
        uid = (s.get("facts") or {}).get("id") or str(s.get("id") or "").split(":", 1)[-1]
        try:
            packets[uid] = build(s, now, eta_index)
        except Exception as error:  # noqa: BLE001
            failed.append(uid)
            log(f"  인텔 v1 실패 {s.get('id')}: {error!r}"[:200])
    return {"schema": 1, "phenomenonId": PHENOMENON_ID, "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
            "windowDays": max_age_days, "count": len(packets), "failed": failed,
            "note": "키는 USGS 사건 id(피드 sourceEventId)다. lab-events 가 추적하는 사건(전지구 M6+·한일대만 M5+)만 있다.",
            "packets": packets}

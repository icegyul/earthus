# -*- coding: utf-8 -*-
"""SimulationRunRecord 검증기 + 런타임 등재표 (계약 §D·§E·§J-5·§J-6, SIMULATION_PLATFORM_MAPPING §6).

원장을 둘로 만들지 않는다. 정본 스키마는 SIMULATION_PLATFORM_MAPPING.md §6.2 의 SimulationRunRecord
이고, 계약 §E 가 칸 네 개(spatialExtent · temporalRange · approval · consent)를 더했다. 이 파일은
새 스키마를 만들지 않고 그 모양을 **검사**만 한다 — 쓰지 않고, 실행하지 않는다(§6.1 원칙 3).

거절하는 것 (§6.4 · §J-5 · §J-6)
  · 등재표 밖 runtime / modelId / modelVersion — 없는 모델을 부르지 않는다
  · truthStatus != 'SIMULATION' — 상수다. 계산하지 않는다
  · 빈 assumptions / limits — 한계 없는 계산 결과는 내보내지 않는다
  · validation.performed=false 인데 result 가 있다 — 안 한 검증의 결과를 0 으로 채우지 않는다
  · 새 칸 넷 중 하나라도 없다

새 칸 넷의 모양 — 계약이 이름만 정했다. 2026-09-20 에 이렇게 정했다(추천안, PD 확인 대상):
  spatialExtent  {bbox: [west, south, east, north], crs: "EPSG:4326"}   경도 -180~180, 위도 -90~90
  temporalRange  {start: ISO, end: ISO}                                 start ≤ end
  approval       {by: 사람, at: ISO, method: PER_RUN | STANDING_SCHEDULE, ref?}
                 by 는 사람이다 — system·lambda·scheduler 같은 계정은 승인할 수 없다(governance.py §2 태도).
                 STANDING_SCHEDULE 은 운영 중인 정기 계산(tsunami-eta 15분)의 것이다. 그 스케줄을 사람이
                 승인한 근거(ref: 스크립트·문서 경로)를 반드시 단다.
  consent        {scope: USER_REQUEST | OPERATOR_BATCH, at: ISO, revocable: true}
                 USER_REQUEST 는 §D ① 시뮬 사용 동의. OPERATOR_BATCH 는 이용자 자료가 들어가지 않는
                 운영자 정기 계산. revocable 은 항상 true — 철회할 수 없는 동의는 받지 않는다.

⚠️ 등재표의 lab-events · transport-simulator 는 **모델 식별자가 없다**(§6.3 실측). 그래서 그 런타임의
   기록은 지금 전부 거절된다. 식별자를 지어 넣지 않는다 — "UNKNOWN 이라는 모델"을 만들지 않는다.
"""
import re

TRUTH_STATUS = "SIMULATION"
RUN_STATES = ("REQUESTED", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED")
FORCING_KINDS = ("WIND", "DEPTH_GRID", "VECTOR_FIELD", "NONE")
APPROVAL_METHODS = ("PER_RUN", "STANDING_SCHEDULE")
CONSENT_SCOPES = ("USER_REQUEST", "OPERATOR_BATCH")
NEW_FIELDS = ("spatialExtent", "temporalRange", "approval", "consent")

# 런타임 → {modelId: modelVersion}. 원본과 어긋나면 시험이 깨진다
# (research-runtime models.py·models_v2.py 의 MODEL_ID/MODEL_VERSION, tsunami-eta handler.py MODEL_VERSION).
RUNTIMES = {
    "research-runtime": {
        "surface-passive-advection.v1": "0.1.0",
        "surface-passive-advection.v2.windage": "0.1.0",
    },
    "tsunami-eta": {"tsunami-eta": "eta-v1"},
    "lab-events": {},            # 모델 식별자 없음 (§6.3) — 등재 불가
    "transport-simulator": {},   # 〃
}

# 사람이 아닌 계정 — 승인·요청할 수 없다
_NON_HUMAN = re.compile(r"^(system|lambda|scheduler|cron|bot|auto|service|earthus)([:._-].*)?$", re.I)
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$")


class SimulationLinkError(ValueError):
    """SimulationRunRecord 가 계약을 어겼다 — 등재하지 않는다."""


def _s(v):
    return isinstance(v, str) and v.strip() != ""


def _iso(v):
    return isinstance(v, str) and bool(_ISO.match(v))


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _check_new_fields(rec, errors):
    ext = rec.get("spatialExtent")
    bbox = ext.get("bbox") if isinstance(ext, dict) else None
    if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4 and all(_num(x) for x in bbox)):
        errors.append("spatialExtent.bbox 는 [west, south, east, north] 숫자 넷이다 (§E)")
    else:
        w, s, e, n = bbox
        if not (-180 <= w <= 180 and -180 <= e <= 180 and -90 <= s <= n <= 90):
            errors.append("spatialExtent.bbox 범위가 틀렸다: %r" % (list(bbox),))
        if ext.get("crs") != "EPSG:4326":
            errors.append("spatialExtent.crs 는 EPSG:4326 이다")

    tr = rec.get("temporalRange")
    if not (isinstance(tr, dict) and _iso(tr.get("start")) and _iso(tr.get("end"))):
        errors.append("temporalRange 는 {start, end} ISO 시각이다 (§E)")
    elif tr["start"].replace("Z", "+00:00") > tr["end"].replace("Z", "+00:00"):
        errors.append("temporalRange.start 가 end 보다 늦다")

    ap = rec.get("approval")
    if not isinstance(ap, dict):
        errors.append("approval 이 없다 — 사람 승인 없이 등재하지 않는다 (§D ③)")
    else:
        if not _s(ap.get("by")) or _NON_HUMAN.match(ap["by"].strip()):
            errors.append("approval.by 는 사람이다: %r" % (ap.get("by"),))
        if not _iso(ap.get("at")):
            errors.append("approval.at 이 ISO 시각이 아니다")
        if ap.get("method") not in APPROVAL_METHODS:
            errors.append("approval.method 는 %s 중 하나다" % "/".join(APPROVAL_METHODS))
        elif ap["method"] == "STANDING_SCHEDULE" and not _s(ap.get("ref")):
            errors.append("approval: STANDING_SCHEDULE 은 스케줄 승인 근거 ref 를 단다")

    co = rec.get("consent")
    if not isinstance(co, dict):
        errors.append("consent 가 없다 (§D ①)")
    else:
        if co.get("scope") not in CONSENT_SCOPES:
            errors.append("consent.scope 는 %s 중 하나다" % "/".join(CONSENT_SCOPES))
        if not _iso(co.get("at")):
            errors.append("consent.at 이 ISO 시각이 아니다")
        if co.get("revocable") is not True:
            errors.append("consent.revocable 은 true 다 — 철회할 수 없는 동의는 받지 않는다")


def validate(rec):
    """위반 목록. 빈 목록이면 등재할 수 있다."""
    if not isinstance(rec, dict):
        return ["기록이 객체가 아니다"]
    errors = []
    runtime, model, version = rec.get("runtime"), rec.get("modelId"), rec.get("modelVersion")
    if runtime not in RUNTIMES:
        errors.append("등재표에 없는 runtime: %r" % (runtime,))
    else:
        models = RUNTIMES[runtime]
        if not models:
            errors.append("%s 는 모델 식별자가 없어 등재할 수 없다 (§6.3)" % runtime)
        elif model not in models:
            errors.append("%s 에 등재되지 않은 modelId: %r" % (runtime, model))
        elif version != models[model]:
            errors.append("modelVersion 이 등재본(%s)과 다르다: %r" % (models[model], version))

    ref = rec.get("runRef")
    if not _s(ref) or ":" not in ref:
        errors.append("runRef 는 {runtime}:{runId} 다")
    elif runtime and not ref.startswith(str(runtime) + ":"):
        errors.append("runRef 머리가 runtime 과 다르다: %s" % ref)
    elif not ref.split(":", 1)[1].strip():
        errors.append("runRef 의 runId 가 비었다")

    if not _s(rec.get("eventId")) or re.search(r"\s", rec.get("eventId") or " "):
        errors.append("eventId 가 없다 — 사건 없는 실행은 등재 대상이 아니다")
    if rec.get("status") not in RUN_STATES:
        errors.append("status 는 %s 중 하나다" % "/".join(RUN_STATES))
    if rec.get("truthStatus") != TRUTH_STATUS:
        errors.append("truthStatus 는 항상 'SIMULATION' 이다 — 받은 값: %r (J-6)" % (rec.get("truthStatus"),))

    dv = rec.get("datasetVersions")
    if not isinstance(dv, list) or not dv:
        errors.append("datasetVersions 가 비었다")
    else:
        for i, d in enumerate(dv):
            if not isinstance(d, dict) or not _s(d.get("datasetId")) or not _s(d.get("version")):
                errors.append("datasetVersions[%d] 는 {datasetId, version, sha256, evidenceKind} 다" % i)
                continue
            if d.get("sha256") is not None and not re.fullmatch(r"[0-9a-f]{64}", str(d.get("sha256"))):
                errors.append("datasetVersions[%d].sha256 는 64자 16진수거나 null 이다" % i)
            if not _s(d.get("evidenceKind")):
                errors.append("datasetVersions[%d].evidenceKind 가 없다" % i)

    fo = rec.get("forcing")
    if fo is not None and (not isinstance(fo, dict) or fo.get("kind") not in FORCING_KINDS):
        errors.append("forcing.kind 는 %s 중 하나다" % "/".join(FORCING_KINDS))

    for field in ("assumptions", "limits"):
        v = rec.get(field)
        if not isinstance(v, list) or not v or not all(_s(x) for x in v):
            errors.append("%s 가 비었다 — 비울 수 없다 (J-6)" % field)

    va = rec.get("validation")
    if not isinstance(va, dict) or not isinstance(va.get("performed"), bool):
        errors.append("validation 은 {planId, performed(bool), method, result, resultRef} 다")
    elif va["performed"] is False and va.get("result") is not None:
        errors.append("validation.performed=false 인데 result 가 있다 — 안 한 검증을 채우지 않는다")

    rp = rec.get("reproducibility")
    if rp is not None and not isinstance(rp, dict):
        errors.append("reproducibility 는 객체거나 null 이다")

    if not _s(rec.get("outputRef")):
        errors.append("outputRef 가 없다")
    for f in ("occurredAt", "computedAt", "retrievedAt", "createdAt"):
        if rec.get(f) is not None and not _iso(rec.get(f)):
            errors.append("%s 가 ISO 시각이 아니다" % f)
    if rec.get("status") == "SUCCEEDED" and not _iso(rec.get("computedAt")):
        errors.append("SUCCEEDED 인데 computedAt 이 없다")

    missing_new = [f for f in NEW_FIELDS if f not in rec]
    if missing_new:
        errors.append("계약 §E 필수 칸이 없다: %s (J-5)" % ", ".join(missing_new))
    _check_new_fields(rec, errors)
    return errors


def require_valid(rec):
    errors = validate(rec)
    if errors:
        raise SimulationLinkError("SimulationRunRecord 계약 위반 %d건: %s" % (len(errors), "; ".join(errors[:8])))
    return rec


# ── 등재 방향 어댑터 — 끝난 실행을 기록으로 옮긴다. 실행하지 않는다 ──────────────────

def _bbox_of(points):
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return [min(lons), min(lats), max(lons), max(lats)]


def _add_minutes(iso, minutes):
    from datetime import datetime, timedelta
    t = datetime.strptime(iso.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S%z")
    return (t + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")


def from_tsunami_eta(doc, *, event_id, output_ref, approval, consent, horizon_min=720):
    """tsunami-eta 산출물(earthus.tsunami-eta.v1) → SimulationRunRecord.

    값은 산출물에 있는 것만 옮긴다. 산출물이 안 주는 칸(specSha256·소스 해시)은 null 이다.
    공간 범위 = 진원 + 계산된 연안 관측소들의 외접 상자, 시간 범위 = 발생 ~ 발생+horizon(기본 12시간 =
    등시선 최대 720분).
    """
    ev, t, m = doc["event"], doc["time"], doc["method"]
    pts = [(ev["lon"], ev["lat"])] + [(s["lon"], s["lat"]) for s in doc.get("stations") or []
                                      if _num(s.get("lon")) and _num(s.get("lat"))]
    official = doc.get("official") or {}
    compare = official.get("compare") or []
    performed = bool(official.get("matched")) and bool(compare)
    return {
        "runRef": "tsunami-eta:%s" % ev["usgsId"],
        "eventId": event_id,
        "runtime": "tsunami-eta",
        "modelId": "tsunami-eta",
        "modelVersion": doc["modelVersion"],
        "status": "SUCCEEDED",
        "truthStatus": TRUTH_STATUS,
        "specSha256": None,
        "datasetVersions": [{"datasetId": "gebco-depth-grid-0.2deg", "version": doc["schema"],
                             "sha256": m.get("gridSha256"), "evidenceKind": "ANALYSIS"}],
        "forcing": {"kind": "DEPTH_GRID", "ref": "ocean/depth-grid.bin", "sha256": m.get("gridSha256"), "params": None},
        "assumptions": [m["ko"]],
        "limits": list(m["limits"]),
        "validation": {"planId": None, "performed": performed,
                       "method": "PTWC 게시문 ETA 표 대조" if performed else None,
                       "result": compare if performed else None,
                       "resultRef": official.get("bulletin") if performed else None},
        "reproducibility": {"modelSourceSha256": None, "dependencyLockSha256": None, "resultArraySha256": None,
                            "engineVersion": doc["modelVersion"], "python": None, "platform": None, "commit": None},
        "outputRef": output_ref,
        "lineage": None,
        "occurredAt": t.get("occurredAt"), "computedAt": t.get("computedAt"),
        "retrievedAt": t.get("retrievedAt"), "createdAt": t.get("computedAt"),
        "spatialExtent": {"bbox": _bbox_of(pts), "crs": "EPSG:4326"},
        "temporalRange": {"start": t["occurredAt"], "end": _add_minutes(t["occurredAt"], horizon_min)},
        "approval": approval,
        "consent": consent,
    }


def from_research_runtime(experiment, result, *, run_id, event_id, output_ref, approval, consent,
                          computed_at, validation=None):
    """research-runtime 실험(ExperimentSpec) + 결과 → SimulationRunRecord.

    assumptions 는 런타임 provenance 의 보간·육지·속도 변환 정책을 그대로 옮긴다(§6.3 "4종").
    검증을 주지 않으면 performed=false · result=null 이다.
    computed_at 은 원장(SQLite objects.created)의 실행 시각이다 — 결과 파일에는 없다.
    """
    p = result["provenance"]
    area = experiment["area"]
    start = experiment["startTimeUTC"]
    return {
        "runRef": "research-runtime:%s" % run_id,
        "eventId": event_id,
        "runtime": "research-runtime",
        "modelId": p["modelId"],
        "modelVersion": p["modelVersion"],
        "status": "SUCCEEDED" if result.get("qualityStatus") in ("COMPLETE", "PARTIAL") else "FAILED",
        "truthStatus": TRUTH_STATUS,
        "specSha256": p.get("specSha256"),
        "datasetVersions": [{"datasetId": p["datasetId"], "version": p["datasetVersion"],
                             "sha256": p.get("datasetSha256"), "evidenceKind": p.get("evidenceKind")}],
        "forcing": {"kind": "WIND" if experiment.get("windDataset") else "NONE",
                    "ref": (experiment.get("windDataset") or {}).get("datasetId") if experiment.get("windDataset") else None,
                    "sha256": None, "params": {"windage": experiment.get("windage")} if experiment.get("windage") else None},
        "assumptions": [x for x in (p.get("interpolation"), p.get("landPolicy"), p.get("velocityConversion"),
                                    "boundaryPolicy=%s" % experiment.get("boundaryPolicy")) if _s(x)],
        "limits": ["표층 수동 입자 — 확산·Stokes drift·3차원 흐름·유류 풍화는 없다 (research-runtime README)",
                   "강제자료 격자 해상도보다 작은 해안·만은 풀지 못한다"],
        "validation": validation or {"planId": experiment.get("validationPlanId"), "performed": False,
                                     "method": None, "result": None, "resultRef": None},
        "reproducibility": {"modelSourceSha256": p.get("modelSourceSha256"),
                            "dependencyLockSha256": p.get("dependencyLockSha256"),
                            "resultArraySha256": p.get("resultArraySha256"),
                            "engineVersion": p.get("engineVersion"), "python": p.get("python"),
                            "platform": p.get("platform"), "commit": p.get("commit")},
        "outputRef": output_ref,
        "lineage": None,
        "occurredAt": None, "computedAt": computed_at, "retrievedAt": None, "createdAt": computed_at,
        "spatialExtent": {"bbox": [area["west"], area["south"], area["east"], area["north"]], "crs": "EPSG:4326"},
        "temporalRange": {"start": start, "end": _add_minutes(start, experiment["durationSeconds"] / 60.0)},
        "approval": approval,
        "consent": consent,
    }

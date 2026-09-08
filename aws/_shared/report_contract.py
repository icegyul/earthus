# -*- coding: utf-8 -*-
"""EARTHUS V2 PHASE 2 STEP 2.9 · 2.10 — 리포트/예보검증 계약.

여기서 정하는 것은 **스키마와 파이프라인 경계**뿐이다. 생성 엔진을 여기서 만들지 않는다.
지침서: "전체 자동 생성 엔진을 완성하려고 무리하지 말고, schema 와 pipeline interfaces 를 먼저 고정한다."

새 계보를 만들지 않는다 (STEP 2.3 대조 결과)
  · 팩트 봉투는 aws/signal-foundation/canonical.py 의 earth.signal.v1 을 그대로 쓴다.
    value·unit·sourceValue·conversion·issuedAt·validFrom·validTo·revision·supersedes 가 이미 있다.
    여기서 다시 정의하면 두 번째 팩트 계보가 된다.
  · 리포트 수명주기·공개 접두사는 docs/LAB-REPORT-CONTRACT.md 가 이미 고정했다.
  · 불변 발행은 aws/typhoon-official 의 조건부 쓰기 패턴을 쓴다(IfNoneMatch="*").
  · 죽은 이름 earthus.report.v1(prototype/js/earthus2/v05/paid/report-api-engine.js)은
    **재사용하지 않는다.** 필드 모양이 전혀 달라 같은 이름에 두 뜻이 생긴다.

id 네임스페이스가 이미 5종이다. 섞지 않는다 — 리포트 id 와 신호 id 를 서로 다른 필드에 담는다.
  메뉴 scene/layer · 현상 domain.snake · 리포트 {kind}:{sourceId} · 신호 {provider}:{dataset}:{h}:{h}
"""

REPORT_SCHEMA = "earthus.report-engine.v1"
VERIFICATION_SCHEMA = "earthus.forecast-verification.v1"

# 지침서 §9 · §18. 여섯 발행물과 검증 리포트를 한 엔진에서 낸다.
REPORT_TYPES = (
    "RETROSPECTIVE_MONTHLY",
    "RETROSPECTIVE_QUARTERLY",
    "RETROSPECTIVE_ANNUAL",
    "OUTLOOK_NEXT_MONTH",
    "OUTLOOK_NEXT_QUARTER",
    "OUTLOOK_NEXT_YEAR",
    "FORECAST_VERIFICATION",
)

# 지침서 §23. 미완성 리포트를 조용히 발행하지 않는다 — BLOCKED 로 남긴다.
REPORT_STATUS = ("PENDING", "RUNNING", "BLOCKED", "READY_FOR_REVIEW", "PUBLISHED", "FAILED")

# 지침서 §16.4. 검증 불가는 점수가 아니라 사유다. 숫자를 지어내지 않는다.
NOT_VERIFIABLE = "NOT_VERIFIABLE"

# PHASE 0 감사가 확정한 사유들. 새 사유를 만들 때는 반드시 근거를 함께 적는다.
NOT_VERIFIABLE_REASONS = {
    "NO_OBSERVATION_ARCHIVE": "실측 이력이 없다 (예: 강수 — 수집기 자체가 없다)",
    "FORECAST_NOT_PRESERVED": "발행본이 매 실행 덮어써져 as-issued 를 복원할 수 없다",
    "FORECAST_NOT_OURS": "우리가 생산·보관하지 않는 남의 예보다 (예: 파고 — 클라이언트가 직접 호출)",
    "WINDOW_OPEN": "유효기간이 아직 안 닫혔다",
    "NO_MATCHING_TARGET": "예보 대상과 실측 대상을 맞출 수 없다",
}

# 지침서 §16.2 — 하나의 정확도 %로 뭉개지 않는다. 지표는 예보 종류를 따른다.
# 이미 도는 엔진들의 선례를 그대로 쓴다(aws/kma-verify, aws/cyclone-analog).
METRIC_SETS = {
    "continuous": ("mae", "rmse", "bias", "anomaly_direction_hit"),      # 기온 등 — kma-verify 선례
    "probabilistic": ("brier", "reliability", "calibration"),
    "categorical": ("hit_rate", "false_alarm_rate", "precision", "recall"),
    "track": ("track_error_km", "timing_error_h", "intensity_error", "landfall_class"),  # cyclone-analog 선례
    "ensemble": ("spread_skill", "coverage", "calibration"),
}


def _iso(v):
    return isinstance(v, str) and len(v) >= 10 and v[4] == "-" and v[7] == "-"


def make_report(*, report_id, report_type, period, generated_at, algorithm_version,
                data_snapshot_id, status="PENDING", version=1, published_at=None,
                sections=None, facts=None, forecasts=None, evaluations=None,
                provenance=None, phenomenon_ids=None):
    """리포트 봉투. 산문이 아니라 **팩트가 먼저** 온다(지침서 §12 · §32).

    facts 는 earth.signal.v1 봉투의 목록이거나 그 signalId 참조 목록이다.
    여기서 팩트 스키마를 다시 정의하지 않는다.
    """
    if report_type not in REPORT_TYPES:
        raise ValueError(f"알 수 없는 리포트 종류: {report_type}")
    if status not in REPORT_STATUS:
        raise ValueError(f"알 수 없는 상태: {status}")
    if not _iso(generated_at):
        raise ValueError("generated_at 은 ISO 시각이어야 한다")
    if not data_snapshot_id:
        # 지침서 §22 — 발행 리포트는 가변 실시간 자료에만 기대면 안 된다.
        raise ValueError("data_snapshot_id 가 없으면 리포트를 재현할 수 없다")
    return {
        "schemaVersion": REPORT_SCHEMA,
        "reportId": report_id,          # 리포트 네임스페이스. signalId 와 같은 필드에 담지 않는다.
        "type": report_type,
        "period": period,               # {"from": ISO, "to": ISO}
        "generatedAt": generated_at,
        "publishedAt": published_at,
        "version": version,
        "dataSnapshotId": data_snapshot_id,
        "algorithmVersion": algorithm_version,
        "status": status,
        "phenomenonIds": list(phenomenon_ids or []),   # 현상 네임스페이스(domain.snake)
        "sections": list(sections or []),
        "facts": list(facts or []),                    # earth.signal.v1 봉투 또는 signalId 참조
        "forecasts": list(forecasts or []),            # prediction snapshot 참조
        "evaluations": list(evaluations or []),        # verification 레코드
        "provenance": list(provenance or []),
    }


def make_prediction_snapshot(*, prediction_id, phenomenon_id, forecast_origin_time,
                             target_period, forecast_value=None, forecast_distribution=None,
                             confidence=None, model_id=None, model_version=None,
                             algorithm_version=None, source_ref=None, unit=None):
    """발행 시점의 예보를 그대로 얼린다 (지침서 §15 · §16).

    ⚠️ 이 레코드는 **절대 수정하지 않는다.** 갱신이 필요하면 새 prediction_id 를 만들고
       supersedes 로 잇는다. 쓰기는 aws/typhoon-official 의 조건부 쓰기 패턴을 쓴다:
           put_object(..., IfNoneMatch="*", CacheControl="public, max-age=31536000, immutable")
           412 PreconditionFailed = 이미 보존됨(오류가 아니다)
    """
    if not _iso(forecast_origin_time):
        raise ValueError("forecast_origin_time 은 ISO 시각이어야 한다")
    if forecast_value is None and forecast_distribution is None:
        raise ValueError("값도 분포도 없는 예보는 검증할 수 없다")
    return {
        "schemaVersion": VERIFICATION_SCHEMA,
        "recordType": "PREDICTION",
        "predictionId": prediction_id,
        "phenomenonId": phenomenon_id,
        "forecastOriginTime": forecast_origin_time,   # issuedAt
        "targetPeriod": target_period,                # {"from": ISO, "to": ISO} = validFrom/validTo
        "forecastValue": forecast_value,
        "forecastDistribution": forecast_distribution,
        "unit": unit,
        "confidence": confidence,
        "modelId": model_id,
        "modelVersion": model_version,
        "algorithmVersion": algorithm_version,
        "sourceRef": source_ref,
    }


def make_verification(*, prediction_id, phenomenon_id, metric_set,
                      observation_period=None, observation_value=None, observation_source=None,
                      scores=None, lead_hours=None, not_verifiable=None, notes=None):
    """검증 결과. 리드타임은 평균 내지 않는다 — 리드별 행을 남긴다(저장소 규약).

    검증이 불가능하면 not_verifiable 에 사유 키를 넣는다. **점수를 지어내지 않는다.**
    """
    if not_verifiable:
        if not_verifiable not in NOT_VERIFIABLE_REASONS:
            raise ValueError(f"알 수 없는 검증불가 사유: {not_verifiable}")
        return {
            "schemaVersion": VERIFICATION_SCHEMA,
            "recordType": "VERIFICATION",
            "predictionId": prediction_id,
            "phenomenonId": phenomenon_id,
            "status": NOT_VERIFIABLE,
            "reason": not_verifiable,
            "reasonText": NOT_VERIFIABLE_REASONS[not_verifiable],
            "notes": notes,
        }
    if metric_set not in METRIC_SETS:
        raise ValueError(f"알 수 없는 지표 묶음: {metric_set}")
    if observation_value is None:
        raise ValueError("실측이 없으면 검증이 아니다 — not_verifiable 을 쓴다")
    unknown = set(scores or {}) - set(METRIC_SETS[metric_set])
    if unknown:
        raise ValueError(f"{metric_set} 에 없는 지표: {sorted(unknown)}")
    return {
        "schemaVersion": VERIFICATION_SCHEMA,
        "recordType": "VERIFICATION",
        "predictionId": prediction_id,
        "phenomenonId": phenomenon_id,
        "status": "VERIFIED",
        "metricSet": metric_set,
        "leadHours": lead_hours,            # None 이면 리드 구분 없음. 여러 리드는 레코드를 나눈다.
        "observationPeriod": observation_period,
        "observationValue": observation_value,
        "observationSource": observation_source,   # 진실값 출처를 명시하고 섞지 않는다
        "scores": dict(scores or {}),
        "notes": notes,
    }


# 지침서 §24 — 발행 게이트. 통과 못 하면 PUBLISHED 로 올리지 않는다.
PUBLISH_GATES = (
    "data_snapshot_exists",
    "source_freshness_ok",
    "fact_schema_valid",
    "forecast_verified_or_marked_not_verifiable",
    "every_claim_maps_to_fact",
    "citations_exist",
    "no_unsupported_causal_language",
    "uncertainty_present_where_applicable",
    "version_frozen",
    "render_ok_desktop_mobile",
)


def can_publish(report, gate_results):
    """모든 게이트가 참일 때만 PUBLISHED. 아니면 무엇이 막았는지 함께 돌려준다."""
    blocked = [g for g in PUBLISH_GATES if not gate_results.get(g)]
    return (not blocked), blocked


# ═══ PHASE 6 — 스냅샷 · 팩트 · 예보 스냅샷 상태 ═══════════════════════════════
# PHASE 2 에서 정한 봉투 위에 얹는다. 새 계보를 만들지 않는다.

# §3 — 리포트 생애. PHASE 2 의 REPORT_STATUS 를 넓힌다(기존 값은 그대로 둔다).
REPORT_LIFECYCLE = ("DRAFT", "GENERATING", "VALIDATING", "PUBLISHED", "FAILED", "ARCHIVED")

# §14 — 예보 스냅샷 상태. LOCKED 이후 예보값은 불변이다.
FORECAST_STATUS = ("ACTIVE", "LOCKED", "VERIFIED", "EXPIRED")


# §6 — 자료 상태. 문제 있는 자료를 숨기지도, 과장하지도 않는다.
DATASET_STATE = ("AVAILABLE", "PARTIAL", "STALE", "UNAVAILABLE")


def make_data_snapshot(*, snapshot_id, created_at, datasets):
    """§4 — 리포트를 재현하려면 '그때 무엇을 봤는지'가 있어야 한다.

    datasets 는 [{ref, sourceVersion, observedAt, retrievedAt, checksum?, state}] 다.
    **모든 자료가 같은 시각이라고 가정하지 않는다** — 관측 시각과 우리가 받은 시각을 나눈다.
    """
    if not datasets:
        raise ValueError("자료가 하나도 없는 스냅샷은 만들 수 없다")
    rows = []
    for d in datasets:
        if not d.get("ref"):
            raise ValueError("dataset 에 ref 가 없다")
        state = d.get("state", "AVAILABLE")
        if state not in DATASET_STATE:
            raise ValueError(f"알 수 없는 자료 상태: {state}")
        rows.append({
            "ref": d["ref"],
            "sourceVersion": d.get("sourceVersion"),
            "observedAt": d.get("observedAt"),      # 원자료가 말하는 시각
            "retrievedAt": d.get("retrievedAt"),    # 우리가 받은 시각
            "checksum": d.get("checksum"),
            "state": state,
        })
    return {
        "schemaVersion": REPORT_SCHEMA,
        "snapshotId": snapshot_id,
        "createdAt": created_at,
        "datasets": rows,
    }




def make_fact(*, fact_id, phenomenon_id, metric, value, unit=None, period=None,
              source=None, truth_type=None, confidence=None, comparison=None,
              evidence_refs=None, sample_count=None, event_id=None, layer_refs=None):
    """§5 — 산문보다 먼저 있어야 하는 것. LLM 은 이걸 만들지도 고치지도 않는다.

    phenomenon_id 를 들고 있으면 보고서에서 그 현상으로 갈 수 있다(§20).
    """
    if value is None:
        raise ValueError("값이 없는 팩트는 만들지 않는다 — 없으면 팩트를 만들지 마라")
    if not phenomenon_id:
        raise ValueError("phenomenon_id 가 없으면 보고서에서 현상으로 갈 수 없다")
    return {
        "schemaVersion": REPORT_SCHEMA,
        "factId": fact_id,
        "phenomenonId": phenomenon_id,
        "eventId": event_id,
        "layerRefs": list(layer_refs or []),
        "metric": metric,
        "value": value,
        "unit": unit,
        "comparison": comparison,       # 평년 대비 등. 없으면 None — 지어내지 않는다
        "period": period,
        "source": source,
        "truthType": truth_type,        # OFFICIAL_OBSERVATION · PROVIDER_FORECAST · EARTHUS_ANALYSIS …
        "confidence": confidence,
        "sampleCount": sample_count,    # §18 — 점수에는 항상 표본 수를 같이 적는다
        "evidenceRefs": list(evidence_refs or []),
    }


def lock_prediction(snapshot):
    """§14 — 발행 후 예보값을 얼린다. 이후 값 변경은 새 prediction_id 로만 한다."""
    if snapshot.get("recordType") != "PREDICTION":
        raise ValueError("예보 스냅샷이 아니다")
    out = dict(snapshot)
    out["status"] = "LOCKED"
    return out


def assert_snapshot_unchanged(locked, candidate):
    """얼린 예보가 사후에 바뀌지 않았는지 확인한다.

    §0 의 '과거를 고쳐 맞은 것처럼 만들지 않는다' 를 코드로 강제하는 자리다.
    """
    for f in ("predictionId", "phenomenonId", "forecastOriginTime", "targetPeriod",
              "forecastValue", "forecastDistribution", "unit"):
        if locked.get(f) != candidate.get(f):
            raise ValueError(f"얼린 예보가 바뀌었다: {f}")
    return True

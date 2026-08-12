# -*- coding: utf-8 -*-
"""EARTHUS PR-02 source 권리·신선도·공급자 상태 평가.

세 상태를 섞지 않는다.

- policy: 법적/운영 승인이 있는가
- freshness: 자료 시각이 현재 사용 목적에 충분히 가까운가
- providerHealth: 수집 결과의 행 수·거절률이 계약 범위인가

하나가 실패해도 0·안전·허용으로 바꾸지 않고 표준 오류와 ``STATUS_ONLY``를 남긴다.
"""

import hashlib
import json
from datetime import datetime, timezone


SCHEMA_VERSION = "earth.source-governance.v1"
REGISTRY_SCHEMA_VERSION = "earth.source-registry.v1"
OPERATIONS = (
    "display", "cache", "history", "derivative", "redistribution",
    "paidExport", "APIResale", "AI",
)
POLICY_STATUSES = {"DRAFT", "APPROVED", "BLOCKED", "EXPIRED"}
RIGHT_DECISIONS = {"ALLOW", "ALLOW_WITH_ATTRIBUTION", "BLOCK", "UNKNOWN"}

ERRORS = {
    "SOURCE_NOT_REGISTERED": ("POLICY", "ERROR", False,
                              "등록되지 않은 자료원입니다.", "Source is not registered."),
    "SOURCE_POLICY_DRAFT": ("POLICY", "ERROR", False,
                            "자료원 정책이 아직 승인되지 않았습니다.", "Source policy is still draft."),
    "SOURCE_POLICY_BLOCKED": ("POLICY", "ERROR", False,
                              "자료원 정책이 차단되었습니다.", "Source policy is blocked."),
    "SOURCE_POLICY_EXPIRED": ("POLICY", "ERROR", False,
                              "자료원 정책이 만료되었습니다.", "Source policy has expired."),
    "SOURCE_REVIEW_DUE": ("POLICY", "ERROR", False,
                          "자료원 권리 재검토 기한이 지났습니다.", "Source rights review is overdue."),
    "SOURCE_NOT_EFFECTIVE": ("POLICY", "ERROR", False,
                             "자료원 정책의 효력이 아직 시작되지 않았습니다.",
                             "Source policy is not effective yet."),
    "SOURCE_APPROVAL_MISSING": ("POLICY", "ERROR", False,
                                "승인 근거 기록이 없습니다.", "Approval evidence is missing."),
    "SOURCE_ID_MISMATCH": ("POLICY", "ERROR", False,
                           "자료원 식별자가 registry와 다릅니다.", "Source id differs from the registry."),
    "SOURCE_LICENSE_DRIFT": ("POLICY", "ERROR", False,
                             "입력의 이용조건 상태가 registry와 다릅니다.",
                             "Input licence status differs from the registry."),
    "SOURCE_TERMS_DRIFT": ("POLICY", "ERROR", False,
                           "입력의 이용조건 주소가 registry와 다릅니다.",
                           "Input terms URL differs from the registry."),
    "SOURCE_URL_DRIFT": ("POLICY", "ERROR", False,
                         "입력의 자료원 주소가 registry와 다릅니다.",
                         "Input source URL differs from the registry."),
    "SOURCE_ATTRIBUTION_DRIFT": ("POLICY", "ERROR", False,
                                 "입력의 출처 표기가 registry와 다릅니다.",
                                 "Input attribution differs from the registry."),
    "RIGHT_NOT_GRANTED": ("RIGHTS", "ERROR", False,
                          "이 사용 범위는 허용되지 않았습니다.", "This use is not granted."),
    "RIGHT_UNKNOWN": ("RIGHTS", "ERROR", False,
                      "이 사용 범위의 권리를 확인하지 못했습니다.", "Rights for this use are unknown."),
    "ATTRIBUTION_MISSING": ("RIGHTS", "ERROR", False,
                            "필수 출처 표기가 없습니다.", "Required attribution is missing."),
    "SOURCE_TIME_MISSING": ("FRESHNESS", "ERROR", True,
                            "자료 시각이 없습니다.", "Source time is missing."),
    "SOURCE_TIME_INVALID": ("FRESHNESS", "ERROR", False,
                            "자료 시각 형식이 잘못되었습니다.", "Source time is invalid."),
    "SOURCE_TIME_IN_FUTURE": ("FRESHNESS", "ERROR", True,
                              "자료 시각이 허용 범위보다 미래입니다.",
                              "Source time is beyond the allowed future skew."),
    "SOURCE_AGING": ("FRESHNESS", "WARNING", True,
                     "자료가 갱신 대기 구간에 들어갔습니다.", "Source is entering its refresh grace window."),
    "SOURCE_STALE": ("FRESHNESS", "ERROR", True,
                     "자료가 허용된 최신성 범위를 넘었습니다.", "Source is stale."),
    "PROVIDER_TOO_FEW_RECORDS": ("PROVIDER", "ERROR", True,
                                 "수집 행 수가 최소 계약보다 적습니다.",
                                 "Provider returned fewer records than required."),
    "PROVIDER_REJECTION_RATE": ("PROVIDER", "WARNING", True,
                                "파서 거절률이 허용 범위를 넘었습니다.",
                                "Parser rejection rate exceeds the allowed threshold."),
}


def _iso(value):
    if value is None or str(value).strip() == "":
        return None, "SOURCE_TIME_MISSING"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None, "SOURCE_TIME_INVALID"
    if parsed.tzinfo is None:
        return None, "SOURCE_TIME_INVALID"
    return parsed.astimezone(timezone.utc), None


def _iso_z(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _hash(value, length=20):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:length]


def error(code, source_id, details=None):
    category, severity, retryable, ko, en = ERRORS[code]
    return {
        "code": code, "category": category, "severity": severity,
        "retryable": retryable, "sourceId": source_id,
        "message": {"ko": ko, "en": en}, "details": details or {},
    }


def _unique_errors(items):
    seen, out = set(), []
    for item in items:
        key = (item["code"], json.dumps(item.get("details") or {}, sort_keys=True))
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def validate_registry(registry, *, require_bundled_draft=False):
    errors = []
    required = {"schemaVersion", "registryId", "revision", "previousRevision",
                "status", "updatedAt", "entries"}
    missing = sorted(required - set(registry or {}))
    if missing:
        errors.append("registry missing: " + ",".join(missing))
        return errors
    if registry.get("schemaVersion") != REGISTRY_SCHEMA_VERSION:
        errors.append("registry schemaVersion")
    if registry.get("status") not in POLICY_STATUSES:
        errors.append("registry status")
    if _iso(registry.get("updatedAt"))[1]:
        errors.append("registry updatedAt")
    if require_bundled_draft and registry.get("status") != "DRAFT":
        # 코드에 묶인 registry는 제안안일 뿐이다. APPROVED는 Control Plane의
        # append-only 승인 기록 없이는 만들 수 없다.
        errors.append("bundled registry status must be DRAFT")
    ids = []
    for index, entry in enumerate(registry.get("entries") or []):
        prefix = f"entries[{index}]"
        needed = {"sourceId", "provider", "dataset", "sourceUrl", "termsUrl",
                  "attribution", "region", "freshnessPolicy", "providerHealthPolicy",
                  "rights", "expectedLicenseStatuses", "policyVersion", "status",
                  "reviewedAt", "reviewDueAt", "effectiveAt", "approvedAt", "approval",
                  "owner"}
        absent = sorted(needed - set(entry))
        if absent:
            errors.append(prefix + " missing: " + ",".join(absent))
            continue
        ids.append(entry["sourceId"])
        if entry["status"] not in POLICY_STATUSES:
            errors.append(prefix + " status")
        if (not str(entry.get("sourceUrl") or "").startswith("https://")
                or not str(entry.get("termsUrl") or "").startswith("https://")):
            errors.append(prefix + " https source/terms")
        if not str(entry.get("attribution") or "").strip():
            errors.append(prefix + " attribution")
        reviewed, reviewed_problem = _iso(entry.get("reviewedAt"))
        due, due_problem = _iso(entry.get("reviewDueAt"))
        if reviewed_problem or due_problem or due <= reviewed:
            errors.append(prefix + " review window")
        if set(entry["rights"]) != set(OPERATIONS):
            errors.append(prefix + " rights operations")
        if any(value not in RIGHT_DECISIONS for value in entry["rights"].values()):
            errors.append(prefix + " rights decision")
        if entry["status"] == "APPROVED":
            approval = entry.get("approval")
            approval_fields = {"actorId", "reason", "approvedAt", "effectiveAt",
                               "rollbackVersion", "evidenceRefs"}
            if not isinstance(approval, dict) or not approval_fields.issubset(approval):
                errors.append(prefix + " approval evidence")
            elif (approval.get("approvedAt") != entry.get("approvedAt")
                  or approval.get("effectiveAt") != entry.get("effectiveAt")):
                errors.append(prefix + " approval time mismatch")
            else:
                approved_at, approved_problem = _iso(entry.get("approvedAt"))
                effective_at, effective_problem = _iso(entry.get("effectiveAt"))
                if (approved_problem or effective_problem or effective_at < approved_at
                        or not str(approval.get("actorId") or "").strip()
                        or not str(approval.get("reason") or "").strip()
                        or not str(approval.get("rollbackVersion") or "").strip()
                        or not approval.get("evidenceRefs")):
                    errors.append(prefix + " approval evidence values")
        freshness = entry["freshnessPolicy"]
        if (not freshness.get("referenceFields")
                or int(freshness.get("freshForSeconds", -1)) < 0
                or int(freshness.get("staleAfterSeconds", -1))
                < int(freshness.get("freshForSeconds", 0))
                or int(freshness.get("maxFutureSkewSeconds", -1)) < 0):
            errors.append(prefix + " freshnessPolicy")
        health = entry["providerHealthPolicy"]
        if float(health.get("downRejectionRate", -1)) < float(
                health.get("degradedRejectionRate", 0)):
            errors.append(prefix + " providerHealthPolicy")
    if len(ids) != len(set(ids)):
        errors.append("duplicate sourceId")
    return errors


def registry_index(registry, *, require_bundled_draft=False):
    problems = validate_registry(registry, require_bundled_draft=require_bundled_draft)
    if problems:
        raise ValueError("; ".join(problems))
    return {entry["sourceId"]: entry for entry in registry["entries"]}


def _path_values(batch, path):
    if path.startswith("input."):
        value = (batch.get("input") or {}).get(path.split(".", 1)[1])
        return [value] if value is not None else []
    values = []
    parts = path.split(".")
    if parts[0] == "source":
        current = batch.get("source") or {}
        for part in parts[1:]:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if current is not None:
            values.append(current)
    for signal in batch.get("signals") or []:
        current = signal
        for part in parts:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if current is not None:
            values.append(current)
    return values


def evaluate_freshness(batch, entry, evaluated_at):
    source_id = entry["sourceId"]
    policy = entry["freshnessPolicy"]
    chosen = None
    invalid = []
    for field in policy["referenceFields"]:
        parsed = []
        for raw in _path_values(batch, field):
            value, problem = _iso(raw)
            if value is not None:
                parsed.append((value, raw))
            elif problem:
                invalid.append((field, raw, problem))
        if parsed:
            value, raw = max(parsed, key=lambda item: item[0])
            chosen = (field, value, raw, len(parsed))
            break

    if chosen is None:
        code = "SOURCE_TIME_INVALID" if invalid else "SOURCE_TIME_MISSING"
        return {
            "status": "UNKNOWN", "referenceField": None, "referenceAt": None,
            "referenceRaw": None, "referenceCount": 0, "ageSeconds": None,
            "freshForSeconds": policy["freshForSeconds"],
            "staleAfterSeconds": policy["staleAfterSeconds"],
            "error": error(code, source_id, {"invalid": invalid[:10]}),
        }

    field, reference, raw, count = chosen
    age = (evaluated_at - reference).total_seconds()
    if age < -int(policy["maxFutureSkewSeconds"]):
        status, problem = "FUTURE", error(
            "SOURCE_TIME_IN_FUTURE", source_id,
            {"referenceAt": _iso_z(reference), "evaluatedAt": _iso_z(evaluated_at),
             "maxFutureSkewSeconds": policy["maxFutureSkewSeconds"]})
    elif age <= int(policy["freshForSeconds"]):
        status, problem = "FRESH", None
    elif age <= int(policy["staleAfterSeconds"]):
        status, problem = "AGING", error("SOURCE_AGING", source_id, {"ageSeconds": round(age)})
    else:
        status, problem = "STALE", error("SOURCE_STALE", source_id, {"ageSeconds": round(age)})
    return {
        "status": status, "referenceField": field, "referenceAt": _iso_z(reference),
        "referenceRaw": raw, "referenceCount": count, "ageSeconds": round(age),
        "freshForSeconds": policy["freshForSeconds"],
        "staleAfterSeconds": policy["staleAfterSeconds"], "error": problem,
    }


def evaluate_provider_health(batch, entry, freshness):
    source_id = entry["sourceId"]
    policy = entry["providerHealthPolicy"]
    source_count = int(batch.get("sourceRecordCount") or 0)
    canonical_count = int(batch.get("canonicalRecordCount") or 0)
    rejected = int(batch.get("rejectedCount") or 0)
    denominator = max(source_count, canonical_count + rejected, 1)
    rejection_rate = rejected / denominator
    problems = []
    min_records = int(policy["minSourceRecords"])
    empty_valid = bool(policy["emptyIsValid"])
    too_few = source_count < min_records and not (empty_valid and source_count == 0)
    if too_few:
        problems.append(error("PROVIDER_TOO_FEW_RECORDS", source_id,
                              {"actual": source_count, "minimum": min_records}))
    if rejection_rate >= float(policy["degradedRejectionRate"]):
        problems.append(error("PROVIDER_REJECTION_RATE", source_id,
                              {"rate": round(rejection_rate, 6),
                               "degradedAt": policy["degradedRejectionRate"],
                               "downAt": policy["downRejectionRate"]}))

    if too_few or rejection_rate >= float(policy["downRejectionRate"]):
        status = "DOWN"
    elif freshness["status"] in {"STALE", "FUTURE", "UNKNOWN"}:
        status = "DEGRADED"
    elif problems:
        status = "DEGRADED"
    else:
        status = "HEALTHY"

    unknown_quality = sum(
        1 for signal in batch.get("signals") or []
        if (signal.get("quality") or {}).get("status") == "UNKNOWN")
    missing_values = sum(1 for signal in batch.get("signals") or []
                         if signal.get("value") is None)
    return {
        "status": status, "sourceRecordCount": source_count,
        "canonicalRecordCount": canonical_count, "rejectedCount": rejected,
        "rejectionRate": round(rejection_rate, 6), "minimumRecords": min_records,
        "emptyIsValid": empty_valid, "unknownSignalQualityCount": unknown_quality,
        "missingValueCount": missing_values,
        "lastSuccessfulAt": batch.get("processedAt") if canonical_count or empty_valid else None,
        "errors": problems,
    }


def _policy_errors(entry, evaluated_at):
    source_id, status = entry["sourceId"], entry["status"]
    if status == "DRAFT":
        return [error("SOURCE_POLICY_DRAFT", source_id)]
    if status == "BLOCKED":
        return [error("SOURCE_POLICY_BLOCKED", source_id)]
    if status == "EXPIRED":
        return [error("SOURCE_POLICY_EXPIRED", source_id)]
    if not entry.get("approvedAt") or not isinstance(entry.get("approval"), dict):
        return [error("SOURCE_APPROVAL_MISSING", source_id)]
    effective, effective_problem = _iso(entry.get("effectiveAt"))
    if effective_problem or effective is None or effective > evaluated_at:
        return [error("SOURCE_NOT_EFFECTIVE", source_id,
                      {"effectiveAt": entry.get("effectiveAt")})]
    due, due_problem = _iso(entry.get("reviewDueAt"))
    if due_problem or due is None or due <= evaluated_at:
        return [error("SOURCE_REVIEW_DUE", source_id,
                      {"reviewDueAt": entry.get("reviewDueAt")})]
    return []


def _metadata_errors(batch, entry):
    source_id = entry["sourceId"]
    signals = batch.get("signals") or []
    sources = [batch.get("source") or {}] + [signal.get("source") or {} for signal in signals]
    found_ids = sorted({source.get("sourceId") for source in sources if source.get("sourceId")})
    found_licenses = sorted({source.get("licenseStatus") for source in sources
                             if source.get("licenseStatus")})
    found_terms = sorted({source.get("termsUrl") for source in sources if source.get("termsUrl")})
    found_urls = sorted({source.get("url") for source in sources if source.get("url")})
    found_attributions = sorted({source.get("attribution") for source in sources
                                 if source.get("attribution")})
    out = []
    if found_ids and found_ids != [source_id]:
        out.append(error("SOURCE_ID_MISMATCH", source_id, {"found": found_ids}))
    expected_licenses = sorted(entry["expectedLicenseStatuses"])
    if found_licenses and any(value not in expected_licenses for value in found_licenses):
        out.append(error("SOURCE_LICENSE_DRIFT", source_id,
                         {"expected": expected_licenses, "found": found_licenses}))
    if found_terms and found_terms != [entry["termsUrl"]]:
        out.append(error("SOURCE_TERMS_DRIFT", source_id,
                         {"expected": entry["termsUrl"], "found": found_terms}))
    if found_urls and found_urls != [entry["sourceUrl"]]:
        out.append(error("SOURCE_URL_DRIFT", source_id,
                         {"expected": entry["sourceUrl"], "found": found_urls}))
    if found_attributions and found_attributions != [entry["attribution"]]:
        out.append(error("SOURCE_ATTRIBUTION_DRIFT", source_id,
                         {"expected": entry["attribution"], "found": found_attributions}))
    return out


def _operation_decisions(entry, batch, freshness, health, blocking_metadata, policy_problems):
    source_id = entry["sourceId"]
    out = {}
    for operation in OPERATIONS:
        problems = list(policy_problems) + list(blocking_metadata)
        conditions = []
        right = entry["rights"][operation]
        if not problems:
            if right == "BLOCK":
                problems.append(error("RIGHT_NOT_GRANTED", source_id, {"operation": operation}))
            elif right == "UNKNOWN":
                problems.append(error("RIGHT_UNKNOWN", source_id, {"operation": operation}))
            elif right == "ALLOW_WITH_ATTRIBUTION":
                if not str(entry.get("attribution") or "").strip():
                    problems.append(error("ATTRIBUTION_MISSING", source_id,
                                          {"operation": operation}))
                else:
                    conditions.append("ATTRIBUTION_REQUIRED")

        if not problems:
            if freshness["status"] == "AGING":
                conditions.append("AGING_LABEL")
            elif freshness["status"] == "STALE":
                if operation == "display":
                    conditions.append("STALE_LABEL")
                elif operation not in {"cache", "history"}:
                    problems.append(error("SOURCE_STALE", source_id,
                                          {"operation": operation}))
            elif freshness["status"] in {"UNKNOWN", "FUTURE"}:
                if operation in {"cache", "history"}:
                    conditions.append("QUARANTINE_ONLY")
                else:
                    problems.append(freshness["error"])

        if not problems and health["status"] == "DOWN":
            if operation in {"cache", "history"}:
                conditions.append("QUARANTINE_ONLY")
            else:
                problems.extend(health["errors"] or [
                    error("PROVIDER_TOO_FEW_RECORDS", source_id, {"operation": operation})])
        elif not problems and health["status"] == "DEGRADED":
            conditions.append("PROVIDER_DEGRADED_LABEL")

        out[operation] = {
            "rightsDecision": right,
            "decision": "BLOCK" if problems else "ALLOW",
            "conditions": sorted(set(conditions)),
            "errors": _unique_errors([item for item in problems if item]),
        }
    return out


def evaluate_batch(batch, entry, *, evaluated_at, registry_revision, evaluator_version):
    if not entry:
        raise ValueError("entry가 필요함")
    evaluated_dt, time_problem = _iso(evaluated_at)
    if time_problem:
        raise ValueError("evaluated_at은 timezone이 있는 ISO-8601이어야 함")
    freshness = evaluate_freshness(batch, entry, evaluated_dt)
    health = evaluate_provider_health(batch, entry, freshness)
    policy_problems = _policy_errors(entry, evaluated_dt)
    metadata_problems = _metadata_errors(batch, entry)
    operations = _operation_decisions(
        entry, batch, freshness, health, metadata_problems, policy_problems)

    display_allowed = operations["display"]["decision"] == "ALLOW"
    if policy_problems or metadata_problems:
        presentation_state = "POLICY_BLOCKED"
    elif freshness["status"] in {"UNKNOWN", "FUTURE"} or health["status"] == "DOWN":
        presentation_state = "UNKNOWN"
    elif freshness["status"] == "STALE":
        presentation_state = "STALE"
    elif freshness["status"] == "AGING" or health["status"] == "DEGRADED":
        presentation_state = "AGING"
    else:
        presentation_state = "READY"

    all_errors = list(policy_problems) + list(metadata_problems)
    if freshness.get("error"):
        all_errors.append(freshness["error"])
    all_errors.extend(health["errors"])
    for decision in operations.values():
        all_errors.extend(decision["errors"])
    source_input = batch.get("input") or {}
    evaluation_id = "gov:" + _hash({
        "sourceId": entry["sourceId"], "registryRevision": registry_revision,
        "policyVersion": entry["policyVersion"], "sourceSha256": source_input.get("sha256"),
        "evaluatedAt": _iso_z(evaluated_dt), "evaluatorVersion": evaluator_version,
    })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "evaluationId": evaluation_id,
        "evaluatedAt": _iso_z(evaluated_dt),
        "sourceId": entry["sourceId"],
        "policy": {
            "registryRevision": registry_revision, "policyVersion": entry["policyVersion"],
            "status": entry["status"], "reviewedAt": entry["reviewedAt"],
            "reviewDueAt": entry["reviewDueAt"], "effectiveAt": entry["effectiveAt"],
            "approvedAt": entry["approvedAt"], "owner": entry["owner"],
        },
        "freshness": freshness,
        "providerHealth": health,
        "operations": operations,
        "presentation": {
            "state": presentation_state,
            "dataVisible": bool(display_allowed and int(batch.get("canonicalRecordCount") or 0) > 0),
            "statusVisible": True,
            "safetyMeaning": "NO_INFERENCE",
        },
        "sourceBatch": {
            "schemaVersion": batch.get("schemaVersion"),
            "adapter": batch.get("adapter"),
            "processedAt": batch.get("processedAt"),
            "source": batch.get("source"),
            "input": source_input,
        },
        "errors": _unique_errors([item for item in all_errors if item]),
        "evaluator": {"name": "earthus-source-governance", "version": evaluator_version},
    }

"""EARTHUS LAB 분석 보고서 공통 색인.

현상별 계산기는 자기 결과 파일만 쓴다. 이 함수가 실제로 존재하는 결과 파일을 읽어
analysis/lab-reports.json 하나로 합친다. 자료가 없는 종류를 예시나 준비 중 카드로 만들지 않는다.

공개 색인에는 제목·상태·시각·표본 요약만 둔다. 유료 원행·계산 좌표·검증 상세는
각 계산기의 비공개 저장소와 권한 확인 경로가 맡는다.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
# CloudFront는 /ocean/*을 공개 데이터 원본으로 연결하지만 새 /analysis/* 동작은 없다.
# 현상별 내부 입력은 analysis/에 두고 브라우저가 읽는 최소 색인만 기존 공개 경로에 둔다.
OUTPUT_KEY = "ocean/lab-reports.json"

SOURCES = (
    ("cyclone", "ocean/cyclone-reports.json"),
    ("smoke-ash", "analysis/smoke-ash-reports.json"),
    ("air-pollution", "analysis/air-pollution-reports.json"),
    ("ocean-drift", "analysis/ocean-drift-reports.json"),
    ("bird-migration", "analysis/bird-migration-reports.json"),
    ("marine-bloom", "analysis/marine-bloom-reports.json"),
    ("aurora", "analysis/aurora-reports.json"),
    ("space-reentry", "analysis/space-reentry-reports.json"),
)

s3 = boto3.client("s3", region_name=REGION)


def _text(value):
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def public_report(kind, raw):
    """현상별 내부 형식을 공개 색인 최소 필드로 줄인다."""
    source_id = _text(raw.get("id"))
    if not source_id:
        return None
    report_kind = _text(raw.get("kind") or raw.get("phenomenon")) or kind
    report_id = source_id if source_id.startswith(f"{report_kind}:") else f"{report_kind}:{source_id}"
    title = _text(raw.get("title") or raw.get("name") or source_id)
    if not title:
        return None
    result = {
        "id": report_id,
        "kind": report_kind,
        "title": title,
        "status": _text(raw.get("status")) or "DETECTED",
        "access": _text(raw.get("access")) or "pro",
        "detectedAt": _text(raw.get("detectedAt")),
        "issuedAt": _text(raw.get("issuedAt")),
        "lastSeen": _text(raw.get("lastSeen")),
        "endedAt": _text(raw.get("endedAt")),
        "snapshotCount": _number(raw.get("snapshotCount")),
        "sourceCount": _number(raw.get("sourceCount")),
        "sampleCount": _number(raw.get("sampleCount")),
        "confidence": _text(raw.get("confidence")),
        "summary": _text(raw.get("summary") or raw.get("note")),
        "sourcePath": _text(raw.get("sourcePath")),
    }
    if kind == "cyclone":
        result["summary"] = (
            "IBTrACS 최종 경로가 확인된 경우에만 당시 기관·EARTHUS 계산 회차의 오차를 확정합니다."
            if result["status"] == "FINAL_REPORT"
            else "계산 회차를 보존하고 있으며 최종 관측 경로 확인 전에는 오차를 확정하지 않습니다."
        )
        result["sourceCount"] = len(raw.get("scores") or []) or None
    return {key: value for key, value in result.items() if value is not None}


def _read(key):
    try:
        body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404"):
            return None
        # 이 역할은 객체 GetObject만 있고 버킷 ListBucket은 없다. S3는 그 상태에서
        # 존재하지 않는 선택 입력을 404가 아니라 403으로 감춘다. analysis의 고정 후보
        # 경로만 미생성으로 취급한다. 이미 존재하는 태풍 입력의 권한 오류는 숨기지 않는다.
        if code == "AccessDenied" and key.startswith("analysis/") and key != OUTPUT_KEY:
            return None
        raise
    return json.loads(body)


def build_index():
    reports = []
    health = []
    for kind, key in SOURCES:
        try:
            payload = _read(key)
        except Exception as error:  # noqa: BLE001 - 오류 종류를 색인 상태로 남긴다.
            health.append({"kind": kind, "key": key, "state": "error", "reason": str(error)[:160]})
            continue
        if payload is None:
            health.append({"kind": kind, "key": key, "state": "missing"})
            continue
        source_reports = payload.get("reports") if isinstance(payload, dict) else None
        if not isinstance(source_reports, list):
            health.append({"kind": kind, "key": key, "state": "invalid", "reason": "reports is not a list"})
            continue
        accepted = [public_report(kind, raw) for raw in source_reports if isinstance(raw, dict)]
        accepted = [report for report in accepted if report]
        reports.extend(accepted)
        health.append({"kind": kind, "key": key, "state": "ok", "count": len(accepted)})

    seen = set()
    unique = []
    for report in sorted(
        reports,
        key=lambda item: item.get("endedAt") or item.get("lastSeen") or item.get("issuedAt")
        or item.get("detectedAt") or "",
        reverse=True,
    ):
        if report["id"] in seen:
            continue
        seen.add(report["id"])
        unique.append(report)
    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {"schemaVersion": 1, "generatedAt": stamp, "count": len(unique), "reports": unique, "sources": health}


def handler(event, context):
    payload = build_index()
    s3.put_object(
        Bucket=BUCKET,
        Key=OUTPUT_KEY,
        Body=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=300",
    )
    return {"ok": True, "count": payload["count"], "sources": payload["sources"]}

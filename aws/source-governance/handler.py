# -*- coding: utf-8 -*-
"""PR-01 canonical batch를 읽어 비공개 권리·신선도 shadow를 만든다.

운영 source 승인이나 기존 화면 전환을 하지 않는다. 번들 registry는 반드시 ``DRAFT``이며,
결과는 ``archive/governance/v1/``에서만 검증한다.
"""

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3

from policy import evaluate_batch, registry_index


BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
ROOT = os.path.dirname(__file__)
REGISTRY_PATH = os.path.join(ROOT, "registry.draft.json")
PREFIX = "archive/governance/v1"

SOURCES = {
    "kma.weather-warning.wrn-now-data": {
        "src": "archive/canonical/v1/kma-warning.json",
        "dst": f"{PREFIX}/kma-warning.json",
    },
    "kma.aws-1min.temperature": {
        "src": "archive/canonical/v1/kma-aws-temperature.json",
        "dst": f"{PREFIX}/kma-aws-temperature.json",
    },
    "noaa.ncep.gfs.pwat-0p25-f000": {
        "src": "archive/canonical/v1/noaa-gfs-tpw.json",
        "dst": f"{PREFIX}/noaa-gfs-tpw.json",
    },
}

s3 = boto3.client("s3", region_name=REGION)


def _code_version():
    digest = hashlib.sha256()
    for filename in ("policy.py", "handler.py", "registry.draft.json"):
        with open(os.path.join(ROOT, filename), "rb") as source:
            digest.update(filename.encode("utf-8"))
            digest.update(source.read())
    return "sha256:" + digest.hexdigest()[:20]


EVALUATOR_VERSION = os.environ.get("EVALUATOR_VERSION") or _code_version()


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _load_registry():
    with open(REGISTRY_PATH, encoding="utf-8") as source:
        registry = json.load(source)
    index = registry_index(registry, require_bundled_draft=True)
    return registry, index


def _get_json(key):
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    raw = obj["Body"].read()
    return json.loads(raw), {
        "bucket": BUCKET, "key": key, "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw), "etag": str(obj.get("ETag") or "").strip('"') or None,
        "lastModified": (obj.get("LastModified").astimezone(timezone.utc)
                         .isoformat(timespec="seconds").replace("+00:00", "Z")
                         if obj.get("LastModified") else None),
    }


def _put(key, document):
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"),
                     allow_nan=False).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=key, Body=raw,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="private, no-store")
    return len(raw)


def handler(event=None, context=None):
    event = event or {}
    registry, entries = _load_registry()
    only = event.get("only")
    source_ids = ([only] if isinstance(only, str) else list(only)) if only else list(SOURCES)
    unknown = [source_id for source_id in source_ids if source_id not in SOURCES]
    if unknown:
        raise ValueError("모르는 sourceId: " + ", ".join(unknown))
    evaluated_at = event.get("evaluatedAt") or _now()
    results, failures = {}, {}
    for source_id in source_ids:
        spec = SOURCES[source_id]
        try:
            if source_id not in entries:
                raise ValueError("SOURCE_NOT_REGISTERED")
            batch, batch_object = _get_json(spec["src"])
            evaluation = evaluate_batch(
                batch, entries[source_id], evaluated_at=evaluated_at,
                registry_revision=registry["revision"],
                evaluator_version=EVALUATOR_VERSION)
            evaluation["canonicalObject"] = batch_object
            size = _put(spec["dst"], evaluation)
            results[source_id] = {
                "source": spec["src"], "destination": spec["dst"],
                "policyStatus": evaluation["policy"]["status"],
                "freshness": evaluation["freshness"]["status"],
                "providerHealth": evaluation["providerHealth"]["status"],
                "presentation": evaluation["presentation"]["state"],
                "errors": len(evaluation["errors"]), "bytes": size,
            }
        except Exception as exc:  # noqa: BLE001 - source별 실패를 분리해 나머지 shadow는 남긴다.
            failures[source_id] = f"{type(exc).__name__}: {str(exc)[:240]}"

    if failures and not results:
        raise RuntimeError("governance 평가 전부 실패: "
                           + json.dumps(failures, ensure_ascii=False))
    print("[source-governance] " + json.dumps(
        {"ok": results, "failed": failures}, ensure_ascii=False, separators=(",", ":")))
    return {"ok": not failures, "evaluatedAt": evaluated_at,
            "registryRevision": registry["revision"],
            "results": results, "failures": failures}

# -*- coding: utf-8 -*-
"""기존 3개 EARTHUS 산출물을 읽어 private canonical shadow를 만든다.

원 JSON은 수정하거나 지우지 않는다. Activity/Safety/UI도 아직 이 파일을 읽지 않는다.
PR-01의 목적은 같은 원본으로 기존 reader와 ``earth.signal.v1`` reader를 나란히 검증하는
것이다. 산출물은 공개 UI가 아닌 ``archive/canonical/v1/``에 ``private, no-store``로 둔다.
"""

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

from adapters import adapt_kma_aws_temperature, adapt_kma_warning, adapt_tpw_grid


BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
PREFIX = "archive/canonical/v1"


def _code_version():
    """환경 설정이 없어도 어떤 변환 코드가 만든 결과인지 재현 가능하게 한다."""
    digest = hashlib.sha256()
    root = os.path.dirname(__file__)
    for filename in ("canonical.py", "adapters.py", "handler.py"):
        with open(os.path.join(root, filename), "rb") as source:
            digest.update(filename.encode("utf-8"))
            digest.update(source.read())
    return "sha256:" + digest.hexdigest()[:20]


PROCESSOR_VERSION = os.environ.get("PROCESSOR_VERSION") or _code_version()

SOURCES = {
    "kma-warning": {
        "src": "events/kma-warn.json", "dst": f"{PREFIX}/kma-warning.json",
        "adapter": adapt_kma_warning,
    },
    "kma-aws-temperature": {
        "src": "wind/kma-aws-min.json", "dst": f"{PREFIX}/kma-aws-temperature.json",
        "adapter": adapt_kma_aws_temperature,
    },
    "noaa-gfs-tpw": {
        "src": "wind/tpw-ea.json", "dst": f"{PREFIX}/noaa-gfs-tpw.json",
        "adapter": adapt_tpw_grid,
    },
}

s3 = boto3.client("s3", region_name=REGION)


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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


def _previous(key):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except ClientError as exc:
        # 첫 실행의 NoSuchKey만 정상으로 본다. 권한·리전·네트워크 오류를 숨기면
        # 정정 계보(supersedes)가 조용히 끊기므로 그 밖의 오류는 호출을 실패시킨다.
        code = str((exc.response.get("Error") or {}).get("Code") or "")
        if code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise


def _put(key, document):
    # NaN/Infinity를 JSON처럼 내보내면 downstream 언어마다 해석이 달라진다.
    body = json.dumps(document, ensure_ascii=False, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="private, no-store")
    return len(body)


def handler(event=None, context=None):
    event = event or {}
    only = event.get("only")
    names = ([only] if isinstance(only, str) else list(only)) if only else list(SOURCES)
    unknown = [name for name in names if name not in SOURCES]
    if unknown:
        raise ValueError("모르는 adapter: " + ", ".join(unknown))

    processed_at = _now()
    results, failures = {}, {}
    for name in names:
        spec = SOURCES[name]
        try:
            source, input_meta = _get_json(spec["src"])
            previous = _previous(spec["dst"])
            batch = spec["adapter"](
                source, input_meta=input_meta, processed_at=processed_at,
                version=PROCESSOR_VERSION, previous=previous)
            size = _put(spec["dst"], batch)
            results[name] = {
                "source": spec["src"], "destination": spec["dst"],
                "sourceRecords": batch["sourceRecordCount"],
                "canonicalRecords": batch["canonicalRecordCount"],
                "rejected": batch["rejectedCount"], "bytes": size,
            }
        except Exception as exc:  # noqa: BLE001 - 다른 adapter까지 함께 죽이지 않는다.
            failures[name] = f"{type(exc).__name__}: {str(exc)[:240]}"

    if failures and not results:
        raise RuntimeError("canonical adapter 전부 실패: " + json.dumps(failures, ensure_ascii=False))
    print("[signal-foundation] " + json.dumps({"ok": results, "failed": failures},
                                               ensure_ascii=False, separators=(",", ":")))
    return {"ok": not failures, "processedAt": processed_at,
            "results": results, "failures": failures}

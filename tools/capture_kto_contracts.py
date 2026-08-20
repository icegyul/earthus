#!/usr/bin/env python3
"""공공데이터포털 공식 Swagger HTML에서 KTO 계약 파일을 생성한다.

인증키나 실제 요청값은 읽지 않는다. 공개 Swagger의 파라미터 이름·필수 여부·
응답 필드 구조만 ``aws/tourism-flow/contracts/kto``에 고정한다.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path


OFFICIAL_SERVICES = {
    "related": ("15128560", "https://www.data.go.kr/data/15128560/openapi.do"),
    "localHub": ("15128559", "https://www.data.go.kr/data/15128559/openapi.do"),
    "concentration": ("15128555", "https://www.data.go.kr/data/15128555/openapi.do"),
    "visitors": ("15101972", "https://www.data.go.kr/data/15101972/openapi.do"),
    "barrierFree": ("15101897", "https://www.data.go.kr/data/15101897/openapi.do"),
    "wellness": ("15144030", "https://www.data.go.kr/data/15144030/openapi.do"),
    "english": ("15101753", "https://www.data.go.kr/data/15101753/openapi.do"),
    "diversity": ("15151365", "https://www.data.go.kr/data/15151365/openapi.do"),
    "demandStrength": ("15151868", "https://www.data.go.kr/data/15151868/openapi.do"),
}


def parse_swagger_html(source):
    match = re.search(r"const swaggerJson = `(.+?)`;", source, re.S)
    if not match:
        raise ValueError("OFFICIAL_SWAGGER_JSON_MISSING")
    return json.loads(html.unescape(match.group(1)))


def _response_item_fields(operation):
    response_schema = operation.get("responses", {}).get("200", {}).get("schema", {})
    fields = (response_schema.get("properties", {}).get("body", {}).get("properties", {})
              .get("items", {}).get("properties", {}).get("item", {})
              .get("properties", {}))
    return {
        str(name): str(config.get("type") or "unknown")
        for name, config in sorted(fields.items())
        if isinstance(config, dict)
    }


def contracts_from_swagger(service, official_url, spec, approved_operations, captured_at):
    host = str(spec.get("host") or "").strip().strip("/")
    if not host:
        raise ValueError("OFFICIAL_SWAGGER_HOST_MISSING")
    approved = set(approved_operations)
    results = {}
    for route, route_config in sorted(spec.get("paths", {}).items()):
        operation_name = route.strip("/")
        if operation_name not in approved:
            continue
        operation = route_config.get("get") or {}
        parameters = {}
        for parameter in [*route_config.get("parameters", []), *operation.get("parameters", [])]:
            if isinstance(parameter, dict) and parameter.get("name"):
                parameters[str(parameter["name"])] = parameter
        required = sorted(name for name, value in parameters.items() if value.get("required"))
        optional = sorted(name for name, value in parameters.items() if not value.get("required"))
        item_fields = _response_item_fields(operation)
        schema = {
            "provider": "KTO",
            "service": service,
            "operation": operation_name,
            "envelopeFields": ["resultCode", "resultMsg", "pageNo", "numOfRows", "totalCount", "items"],
            "itemFields": item_fields,
            "schemaVersion": "earthus.kto-schema.v1",
            "capturedAt": captured_at,
            "officialReferenceUrl": official_url,
        }
        fingerprint_shape = {
            "envelopeFields": schema["envelopeFields"],
            "itemFields": item_fields,
        }
        schema_hash = hashlib.sha256(json.dumps(
            fingerprint_shape,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")).hexdigest()
        contract = {
            "provider": "KTO",
            "service": service,
            "operation": operation_name,
            "method": "GET",
            "baseUrl": f"https://{host}",
            "requiredParameters": required,
            "optionalParameters": optional,
            "authParameter": "serviceKey",
            "secretAlias": "DATA_GO_KR_SERVICE_KEY",
            "schemaHash": schema_hash,
            "contractVersion": "earthus.kto-contract.v1",
            "capturedAt": captured_at,
            "officialReferenceUrl": official_url,
            "officialApiTitle": spec.get("info", {}).get("title"),
            "officialApiVersion": spec.get("info", {}).get("version"),
            "productionReady": False,
        }
        results[operation_name] = {"contract": contract, "schema": schema}
    missing = sorted(approved - set(results))
    if missing:
        raise ValueError(f"APPROVED_OPERATION_MISSING_IN_SWAGGER:{service}:{','.join(missing)}")
    return results


def _load_registry(root):
    path = root / "aws" / "tourism-flow" / "kto_provider.py"
    spec = importlib.util.spec_from_file_location("earthus_kto_provider_registry", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.KTO_SERVICES


def write_contracts(output_dir, contracts):
    for service, operations in contracts.items():
        service_dir = output_dir / service
        service_dir.mkdir(parents=True, exist_ok=True)
        for operation, documents in operations.items():
            for kind in ("contract", "schema"):
                path = service_dir / f"{operation}.{kind}.json"
                path.write_text(json.dumps(
                    documents[kind],
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                ) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--html-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--captured-at", default=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    registry = _load_registry(root)
    captured = {}
    for service, (_, official_url) in OFFICIAL_SERVICES.items():
        html_path = args.html_dir / f"earthus-kto-swagger-{service}.html"
        official_spec = parse_swagger_html(html_path.read_text(encoding="utf-8"))
        captured[service] = contracts_from_swagger(
            service,
            official_url,
            official_spec,
            registry[service]["operations"],
            args.captured_at,
        )
    write_contracts(args.output_dir, captured)
    print(json.dumps({
        "services": len(captured),
        "operations": sum(len(items) for items in captured.values()),
        "output": str(args.output_dir),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

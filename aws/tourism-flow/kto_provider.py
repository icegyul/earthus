"""한국관광공사 승인 서비스 계약.

비밀값은 이 모듈의 상수나 로그에 저장하지 않는다. 서비스 URL과 Operation은
관광 v1.2 개발 계약에 고정된 공개 계약만 보존한다.
"""

from __future__ import annotations

import json
import hashlib
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path


KTO_SERVICES = {
    "related": {
        "base_url": "https://apis.data.go.kr/B551011/TarRlteTarService1",
        "operations": ("areaBasedList1", "searchKeyword1"),
    },
    "localHub": {
        "base_url": "https://apis.data.go.kr/B551011/LocgoHubTarService1",
        "operations": ("areaBasedList1",),
    },
    "concentration": {
        "base_url": "https://apis.data.go.kr/B551011/TatsCnctrRateService",
        "operations": ("tatsCnctrRatedList",),
    },
    "visitors": {
        "base_url": "https://apis.data.go.kr/B551011/DataLabService",
        "operations": ("metcoRegnVisitrDDList", "locgoRegnVisitrDDList"),
    },
    "barrierFree": {
        "base_url": "https://apis.data.go.kr/B551011/KorWithService2",
        "operations": (
            "areaBasedList2", "locationBasedList2", "searchKeyword2",
            "areaBasedSyncList2", "detailCommon2", "detailIntro2",
            "detailInfo2", "detailImage2", "detailWithTour2",
            "ldongCode2", "lclsSystmCode2",
        ),
    },
    "wellness": {
        "base_url": "https://apis.data.go.kr/B551011/WellnessTursmService",
        "operations": (
            "ldongCode", "areaBasedList", "locationBasedList",
            "searchKeyword", "wellnessTursmSyncList", "detailCommon",
            "detailIntro", "detailInfo", "detailImage",
        ),
    },
    "english": {
        "base_url": "https://apis.data.go.kr/B551011/EngService2",
        "operations": (
            "areaBasedList2", "locationBasedList2", "searchKeyword2",
            "searchFestival2", "searchStay2", "areaBasedSyncList2",
            "detailCommon2", "detailIntro2", "detailInfo2",
            "detailImage2", "ldongCode2", "lclsSystmCode2",
        ),
    },
    "diversity": {
        "base_url": "https://apis.data.go.kr/B551011/AreaTarDivService",
        "operations": ("areaTouDivList", "areaExpDivList", "areaIntlDivList"),
    },
    "demandStrength": {
        "base_url": "https://apis.data.go.kr/B551011/AreaTarDemDsService",
        "operations": ("areaTarSjrnDsList", "areaTarExpDsList"),
    },
}


class KtoContractError(ValueError):
    """승인된 서비스/Operation 계약 밖의 요청."""


class KtoProviderDisabled(RuntimeError):
    """서버 전용 인증키가 없어 외부 호출을 비활성화한 상태."""


class KtoProviderError(RuntimeError):
    """TourAPI가 반환한 분류 가능한 오류."""

    def __init__(self, code, result_msg=""):
        policy = KTO_ERROR_POLICY.get(str(code), (False, "UNAVAILABLE"))
        self.code = str(code)
        self.result_msg = str(result_msg or "")[:200]
        self.retryable = policy[0]
        self.health_state = policy[1]
        super().__init__(f"KTO_PROVIDER_ERROR:{self.code}:{self.health_state}")


class KtoTransportError(RuntimeError):
    """URL과 인증키를 포함하지 않는 HTTP/응답 형식 오류."""

    def __init__(self, status=None, health_state="UNAVAILABLE", retryable=False):
        self.status = status
        self.health_state = health_state
        self.retryable = retryable
        label = status if status is not None else "INVALID_RESPONSE"
        super().__init__(f"KTO_TRANSPORT_ERROR:{label}:{health_state}")


class KtoSchemaDriftError(RuntimeError):
    """실응답이 고정된 공식 필드 계약과 전혀 맞지 않아 공개를 막은 상태."""

    health_state = "SCHEMA_DRIFT"
    retryable = False

    def __init__(self, service, operation):
        self.service = service
        self.operation = operation
        super().__init__(f"KTO_SCHEMA_DRIFT:{service}:{operation}")


KTO_ERROR_POLICY = {
    "01": (True, "DEGRADED"),
    "04": (False, "UNAVAILABLE"),
    "05": (True, "DEGRADED"),
    "10": (False, "SCHEMA_DRIFT"),
    "12": (False, "SCHEMA_DRIFT"),
    "20": (False, "AUTH_ERROR"),
    "22": (False, "QUOTA_EXHAUSTED"),
    "23": (True, "DEGRADED"),
    "29": (False, "UNAVAILABLE"),
    "30": (False, "AUTH_ERROR"),
    "31": (False, "AUTH_ERROR"),
}


def build_kto_url(service, operation, params=None, environ=None):
    """승인된 KTO 요청 URL을 만든다. 브라우저에서는 호출하지 않는다."""
    config = KTO_SERVICES.get(service)
    if not config or operation not in config["operations"]:
        raise KtoContractError(f"KTO_OPERATION_NOT_APPROVED:{service}:{operation}")
    env = os.environ if environ is None else environ
    raw_key = env.get("DATA_GO_KR_SERVICE_KEY") or env.get("DATA_GO_KR_KEY") or ""
    key = urllib.parse.unquote(str(raw_key).strip())
    if not key:
        raise KtoProviderDisabled("KTO_SERVICE_KEY_MISSING")
    values = {
        "serviceKey": key,
        "MobileOS": env.get("KTO_MOBILE_OS") or "ETC",
        "MobileApp": env.get("KTO_MOBILE_APP") or "EARTHUS",
        "_type": env.get("KTO_RESPONSE_TYPE") or "json",
        "pageNo": 1,
        "numOfRows": 100,
    }
    for name, value in (params or {}).items():
        if value is not None:
            values[name] = value
    validate_required_parameters(service, operation, values)
    query = urllib.parse.urlencode(values)
    return f"{config['base_url']}/{operation}?{query}"


@lru_cache(maxsize=128)
def load_operation_contract(service, operation):
    path = Path(__file__).with_name("contracts") / "kto" / service / f"{operation}.contract.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise KtoContractError(f"KTO_CONTRACT_FILE_MISSING:{service}:{operation}") from error


def validate_required_parameters(service, operation, values):
    contract = load_operation_contract(service, operation)
    missing = sorted(
        name for name in contract.get("requiredParameters", [])
        if values.get(name) is None or str(values.get(name)).strip() == ""
    )
    if missing:
        raise KtoContractError(
            f"KTO_REQUIRED_PARAMETER_MISSING:{service}:{operation}:{','.join(missing)}"
        )
    return True


def check_response_contract(service, operation, items):
    """값을 남기지 않고 실응답 필드가 고정 계약과 호환되는지만 확인한다."""
    schema_path = Path(__file__).with_name("contracts") / "kto" / service / f"{operation}.schema.json"
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise KtoContractError(f"KTO_SCHEMA_FILE_MISSING:{service}:{operation}") from error
    expected = set((schema.get("itemFields") or {}).keys())
    actual = {
        str(name)
        for item in (items if isinstance(items, list) else [])
        if isinstance(item, dict)
        for name in item
    }
    unexpected = sorted(actual - expected)
    recognized = sorted(actual & expected)
    if actual and not recognized:
        state = "SCHEMA_DRIFT"
    elif unexpected:
        state = "ADDITIVE_DRIFT"
    else:
        state = "MATCH"
    contract = load_operation_contract(service, operation)
    return {
        "state": state,
        "schemaHash": contract.get("schemaHash"),
        "recognizedFieldCount": len(recognized),
        "unexpectedFields": unexpected,
    }


def safe_request_url(url):
    """진단용 URL에서 인증키 쿼리를 완전히 제거한다."""
    parsed = urllib.parse.urlsplit(url)
    public_query = [
        (name, value)
        for name, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        if name.lower() != "servicekey"
    ]
    return urllib.parse.urlunsplit((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        urllib.parse.urlencode(public_query),
        parsed.fragment,
    ))


def normalize_tour_api_envelope(payload):
    """TourAPI의 단건 객체/다건 배열 응답을 같은 내부 형태로 바꾼다."""
    response = payload.get("response") if isinstance(payload, dict) else {}
    response = response if isinstance(response, dict) else {}
    header = response.get("header") if isinstance(response.get("header"), dict) else {}
    body = response.get("body") if isinstance(response.get("body"), dict) else {}
    result_code = str(header.get("resultCode") or "")
    if result_code not in ("00", "0000"):
        raise KtoProviderError(result_code or "MISSING", header.get("resultMsg"))
    items_container = body.get("items") if isinstance(body.get("items"), dict) else {}
    raw_items = items_container.get("item")
    if isinstance(raw_items, list):
        items = raw_items
    elif isinstance(raw_items, dict):
        items = [raw_items]
    else:
        items = []
    return {
        "resultCode": result_code,
        "resultMsg": str(header.get("resultMsg") or ""),
        "pageNo": int(body.get("pageNo") or 1),
        "numOfRows": int(body.get("numOfRows") or len(items)),
        "totalCount": int(body.get("totalCount") or len(items)),
        "items": items,
    }


def call_kto(service, operation, params=None, environ=None, open_url=None, sleep=None):
    """KTO를 서버에서 호출하고 승인된 재시도 범위 안에서 정규화한다."""
    env = os.environ if environ is None else environ
    opener = urllib.request.urlopen if open_url is None else open_url
    pause = time.sleep if sleep is None else sleep
    timeout_seconds = max(0.1, int(env.get("KTO_HTTP_TIMEOUT_MS") or 10000) / 1000)
    max_retries = max(0, min(5, int(env.get("KTO_MAX_RETRIES") or 3)))
    url = build_kto_url(service, operation, params, env)
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "earthus-tourism-flow/1.2"},
    )

    for attempt in range(max_retries + 1):
        try:
            with opener(request, timeout=timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return normalize_tour_api_envelope(payload)
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or error.code >= 500
            health = "QUOTA_EXHAUSTED" if error.code == 429 else "DEGRADED" if retryable else "UNAVAILABLE"
            wrapped = KtoTransportError(error.code, health, retryable)
        except (urllib.error.URLError, TimeoutError, OSError):
            # 원본 예외에는 request.full_url이 포함될 수 있어 그대로 전달하지 않는다.
            wrapped = KtoTransportError(None, "DEGRADED", True)
        except KtoProviderError as error:
            wrapped = error
        except (UnicodeDecodeError, json.JSONDecodeError):
            wrapped = KtoTransportError(None, "SCHEMA_DRIFT", False)

        if not wrapped.retryable or attempt >= max_retries:
            raise wrapped
        pause(min(2.0, 0.25 * (2 ** attempt)))

    raise KtoTransportError(None, "UNAVAILABLE", False)


def fetch_all_pages(service, operation, params=None, page_size=100, call=None, environ=None):
    """원래 업무 파라미터를 바꾸지 않고 TourAPI의 모든 페이지를 수집한다."""
    base_params = dict(params or {})
    size = max(1, min(1000, int(page_size)))
    caller = call or (lambda selected_service, selected_operation, selected_params: call_kto(
        selected_service,
        selected_operation,
        selected_params,
        environ=environ,
    ))
    items = []
    page_no = 1
    while page_no <= 10000:
        page = caller(service, operation, {
            **base_params,
            "pageNo": page_no,
            "numOfRows": size,
        })
        page_items = page.get("items") if isinstance(page, dict) else []
        page_items = page_items if isinstance(page_items, list) else []
        items.extend(page_items)
        total_count = int(page.get("totalCount") or len(items))
        if not page_items or len(items) >= total_count:
            break
        page_no += 1
    return items


def capture_contract(service, operation, normalized, request_params=None, captured_at=None):
    """성공 응답의 구조만 고정하고 요청값과 인증키는 버린다."""
    config = KTO_SERVICES.get(service)
    if not config or operation not in config["operations"]:
        raise KtoContractError(f"KTO_OPERATION_NOT_APPROVED:{service}:{operation}")
    params = request_params if isinstance(request_params, dict) else {}
    parameter_names = sorted(
        name for name in params
        if str(name).lower() != "servicekey"
    )
    items = normalized.get("items") if isinstance(normalized, dict) else []
    item_fields = sorted({
        str(field)
        for item in (items if isinstance(items, list) else [])
        if isinstance(item, dict)
        for field in item
    })
    schema_shape = {
        "result": ("resultCode", "resultMsg", "pageNo", "numOfRows", "totalCount", "items"),
        "itemFields": item_fields,
    }
    fingerprint = hashlib.sha256(json.dumps(
        schema_shape,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")).hexdigest()
    return {
        "provider": "KTO",
        "service": service,
        "operation": operation,
        "baseUrl": config["base_url"],
        "authMode": "DATA_GO_KR_SERVICE_KEY",
        "requestParameterNames": parameter_names,
        "responseItemFields": item_fields,
        "schemaHash": fingerprint,
        "contractVersion": "earthus.kto-contract.v1",
        "capturedAt": captured_at,
        "smokeStatus": "PASS",
        "productionReady": False,
    }

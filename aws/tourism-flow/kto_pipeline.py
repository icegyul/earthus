"""KTO 원문을 의미가 분리된 Earthus 관광 신호로 정규화한다.

현재값·공식 예측·과거 통계·분석지수를 서로 바꾸어 부르지 않는다. 알 수 없는
필드는 원문 보관 계층에서 유지하고, 정규화 계층에서는 값을 만들지 않는다.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path


OFFICIAL_REFERENCES = {
    "related": "https://www.data.go.kr/data/15128560/openapi.do",
    "localHub": "https://www.data.go.kr/data/15128559/openapi.do",
    "concentration": "https://www.data.go.kr/data/15128555/openapi.do",
    "visitors": "https://www.data.go.kr/data/15101972/openapi.do",
    "barrierFree": "https://www.data.go.kr/data/15101897/openapi.do",
    "wellness": "https://www.data.go.kr/data/15144030/openapi.do",
    "english": "https://www.data.go.kr/data/15101753/openapi.do",
    "diversity": "https://www.data.go.kr/data/15151365/openapi.do",
    "demandStrength": "https://www.data.go.kr/data/15151868/openapi.do",
}

ACCESSIBILITY_FIELDS = {
    "audioguide", "auditorium", "babysparechair", "bigprint", "blindhandicapetc",
    "braileblock", "brailepromotion", "elevator", "exit", "guidehuman", "guidesystem",
    "handicapetc", "hearinghandicapetc", "hearingroom", "helpdog", "infantsfamilyetc",
    "lactationroom", "parking", "promotion", "publictransport", "restroom", "room",
    "route", "signguide", "stroller", "ticketoffice", "videoguide", "wheelchair",
}

REQUIRED_NORMALIZED_FIELDS = {
    "RELATIVE_CONCENTRATION_FORECAST": (
        "tourismName", "targetDate", "relativeConcentrationRate",
    ),
    "HISTORICAL_REGION_VISITOR_METRIC": ("regionCode", "metricDate", "visitorMetric"),
    "RELATED_TOURISM_CONNECTION": (
        "sourceExternalId", "targetExternalId", "relationRank", "referenceMonth",
    ),
    "TOURISM_CONNECTIVITY_HUB": ("externalId", "connectivityRank", "referenceMonth"),
    "OFFICIAL_ACCESSIBILITY_FACTS": ("externalContentId", "officialFacts"),
    "REGIONAL_TOURISM_DIVERSITY_INDEX": ("referenceMonth", "indexCode", "indexValue"),
    "REGIONAL_TOURISM_DEMAND_STRENGTH_INDEX": ("referenceMonth", "indexCode", "indexValue"),
}


@lru_cache(maxsize=None)
def _contract_item_fields(service, operation):
    path = Path(__file__).parent / "contracts" / "kto" / service / f"{operation}.schema.json"
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return frozenset()
    fields = document.get("itemFields") if isinstance(document, dict) else {}
    return frozenset(fields if isinstance(fields, dict) else ())


def _official_fields(service, operation, item):
    allowed = _contract_item_fields(service, operation)
    return {
        name: value for name, value in item.items()
        if name in allowed and value is not None and value != ""
    }


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _date(value):
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return None


def _month(value):
    text = str(value or "").strip()
    if len(text) == 6 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}"
    return None


def _integer(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_concentration(item):
    return {
        "externalCodeSystem": "KTO_CONCENTRATION",
        "areaCode": str(item.get("areaCd") or "") or None,
        "areaName": str(item.get("areaNm") or "") or None,
        "districtCode": str(item.get("signguCd") or "") or None,
        "districtName": str(item.get("signguNm") or "") or None,
        "tourismName": str(item.get("tAtsNm") or "") or None,
        "targetDate": _date(item.get("baseYmd")),
        "relativeConcentrationRate": _number(item.get("cnctrRate")),
        "isLive": False,
        "isPopulation": False,
        "meaningKo": "가장 붐비는 시기를 100으로 본 상대 집중률 예측",
    }


def _normalize_visitor(item, operation):
    local = operation == "locgoRegnVisitrDDList"
    region_code = item.get("signguCode") if local else item.get("areaCode")
    region_name = item.get("signguNm") if local else item.get("areaNm")
    return {
        "externalCodeSystem": "KTO_VISITOR_LOCAL" if local else "KTO_VISITOR_METRO",
        "regionCode": str(region_code or "") or None,
        "regionName": str(region_name or "") or None,
        "aggregationLevel": "LOCAL_GOVERNMENT" if local else "METROPOLITAN_GOVERNMENT",
        "metricDate": _date(item.get("baseYmd")),
        "weekdayTypeCode": str(item.get("daywkDivCd") or "") or None,
        "weekdayTypeName": str(item.get("daywkDivNm") or "") or None,
        "visitorTypeCode": str(item.get("touDivCd") or "") or None,
        "visitorTypeName": str(item.get("touDivNm") or "") or None,
        "visitorMetric": _number(item.get("touNum")),
        "isLive": False,
        "isTouristCount": False,
        "canAggregateWithOtherLevels": False,
        "meaningKo": "일상생활권을 벗어나 일정 시간 머문 사람의 날짜별 지역 방문 통계",
    }


def _normalize_related(item):
    return {
        "externalProvider": "KTO",
        "externalService": "related",
        "sourceExternalId": str(item.get("tAtsCd") or "") or None,
        "sourceName": str(item.get("tAtsNm") or "") or None,
        "targetExternalId": str(item.get("rlteTatsCd") or "") or None,
        "targetName": str(item.get("rlteTatsNm") or "") or None,
        "relationRank": _integer(item.get("rlteRank")),
        "categories": [
            value for value in (
                str(item.get("rlteCtgryLclsNm") or "") or None,
                str(item.get("rlteCtgryMclsNm") or "") or None,
                str(item.get("rlteCtgrySclsNm") or "") or None,
            ) if value
        ],
        "referenceMonth": _month(item.get("baseYm")),
        "externalCodeSystem": "KTO_RELATED_TOURISM",
        "isPopularityRank": False,
        "isPeopleCount": False,
        "isLive": False,
        "meaningKo": "TMAP 차량 이동 조건을 기반으로 산출된 관광지 연관 순위",
    }


def _normalize_local_hub(item):
    lon, lat = _number(item.get("mapX")), _number(item.get("mapY"))
    return {
        "externalProvider": "KTO",
        "externalService": "localHub",
        "externalId": str(item.get("hubTatsCd") or "") or None,
        "name": str(item.get("hubTatsNm") or "") or None,
        "connectivityRank": _integer(item.get("hubRank")),
        "categories": [
            value for value in (
                str(item.get("hubCtgryLclsNm") or "") or None,
                str(item.get("hubCtgryMclsNm") or "") or None,
            ) if value
        ],
        "areaCode": str(item.get("areaCd") or "") or None,
        "areaName": str(item.get("areaNm") or "") or None,
        "districtCode": str(item.get("signguCd") or "") or None,
        "districtName": str(item.get("signguNm") or "") or None,
        "referenceMonth": _month(item.get("baseYm")),
        "position": {"lat": lat, "lon": lon} if lat is not None and lon is not None else None,
        "externalCodeSystem": "KTO_LOCAL_HUB",
        "isPopulationRank": False,
        "isPopularityRank": False,
        "isLive": False,
        "meaningKo": "TMAP 차량 이동 연결성을 기반으로 산출된 중심 관광지 순위",
    }


def _normalize_accessibility(item):
    facts = {
        name: str(item.get(name)).strip()
        for name in sorted(ACCESSIBILITY_FIELDS)
        if item.get(name) is not None and str(item.get(name)).strip()
    }
    return {
        "externalProvider": "KTO",
        "externalService": "barrierFree",
        "externalContentId": str(item.get("contentid") or "") or None,
        "officialFacts": facts,
        "sourceType": "OFFICIAL_ACCESSIBILITY_INFORMATION",
        "meaningKo": "한국관광공사가 제공한 무장애 여행 세부 항목",
    }


def _normalize_barrier_content(item, operation):
    lon, lat = _number(item.get("mapx")), _number(item.get("mapy"))
    return {
        "externalProvider": "KTO",
        "externalService": "barrierFree",
        "externalContentId": str(item.get("contentid") or "") or None,
        "contentTypeId": str(item.get("contenttypeid") or "") or None,
        "title": str(item.get("title") or "") or None,
        "position": {"lat": lat, "lon": lon} if lat is not None and lon is not None else None,
        "modifiedAtRaw": str(item.get("modifiedtime") or "") or None,
        "showFlag": str(item.get("showflag") or "") or None,
        "copyrightDivisionCode": str(item.get("cpyrhtDivCd") or "") or None,
        "accessibilityDetailState": "NOT_FETCHED",
        "sourceType": "OFFICIAL_BARRIER_FREE_TOURISM_INFORMATION",
        "officialFields": _official_fields("barrierFree", operation, item),
    }


def _normalize_wellness(item, operation):
    lon, lat = _number(item.get("mapX")), _number(item.get("mapY"))
    return {
        "externalProvider": "KTO",
        "externalService": "wellness",
        "externalContentId": str(item.get("contentId") or "") or None,
        "contentTypeId": str(item.get("contentTypeId") or "") or None,
        "title": str(item.get("title") or "") or None,
        "wellnessThemeCode": str(item.get("wellnessThemaCd") or "") or None,
        "officialLanguageCode": str(item.get("langDivCd") or "") or None,
        "position": {"lat": lat, "lon": lon} if lat is not None and lon is not None else None,
        "modifiedAtRaw": str(item.get("mdfcnDt") or "") or None,
        "sourceType": "OFFICIAL_WELLNESS_INFORMATION",
        "officialFields": _official_fields("wellness", operation, item),
    }


def _normalize_english(item, operation):
    lon, lat = _number(item.get("mapx")), _number(item.get("mapy"))
    return {
        "externalProvider": "KTO",
        "externalService": "english",
        "externalContentId": str(item.get("contentid") or "") or None,
        "contentTypeId": str(item.get("contenttypeid") or "") or None,
        "title": str(item.get("title") or "") or None,
        "address": str(item.get("addr1") or "") or None,
        "position": {"lat": lat, "lon": lon} if lat is not None and lon is not None else None,
        "language": "en",
        "translationType": "OFFICIAL_PROVIDER",
        "sourceType": "OFFICIAL_ENGLISH_TOURISM_INFORMATION",
        "officialFields": _official_fields("english", operation, item),
    }


REGIONAL_INDEX_PREFIX = {
    ("diversity", "areaTouDivList"): "touDivIx",
    ("diversity", "areaExpDivList"): "expDivIx",
    ("diversity", "areaIntlDivList"): "intlDivIx",
    ("demandStrength", "areaTarSjrnDsList"): "tarSjrnDsIx",
    ("demandStrength", "areaTarExpDsList"): "tarExpDsIx",
}


def _normalize_regional_index(item, service, operation):
    prefix = REGIONAL_INDEX_PREFIX[(service, operation)]
    return {
        "externalProvider": "KTO",
        "externalService": service,
        "externalCodeSystem": f"KTO_{service.upper()}_{operation}",
        "areaCode": str(item.get("areaCd") or "") or None,
        "areaName": str(item.get("areaNm") or "") or None,
        "districtCode": str(item.get("signguCd") or "") or None,
        "districtName": str(item.get("signguNm") or "") or None,
        "referenceMonth": _month(item.get("baseYm")),
        "indexCode": str(item.get(f"{prefix}Cd") or "") or None,
        "indexName": str(item.get(f"{prefix}Nm") or "") or None,
        "indexValue": _number(item.get(f"{prefix}Val")),
        "isLive": False,
        "isRecommendation": False,
        "sourceType": "REGIONAL_ANALYTICAL_INDEX",
    }


def _value_present(value):
    if value is None or value == "":
        return False
    if isinstance(value, (dict, list, tuple, set)):
        return bool(value)
    return True


def _quality_checked_items(semantic_type, operation, items):
    required = REQUIRED_NORMALIZED_FIELDS.get(semantic_type)
    if required is None and semantic_type in (
        "OFFICIAL_BARRIER_FREE_TOURISM_CONTENT",
        "OFFICIAL_WELLNESS_CONTENT",
        "OFFICIAL_ENGLISH_TOURISM_CONTENT",
    ):
        required = ("officialFields",) if "Code" in operation or "Code2" in operation else (
            "externalContentId", "officialFields",
        )
    required = required or ()
    checked = []
    for original in items:
        item = dict(original)
        missing = [name for name in required if not _value_present(item.get(name))]
        item["dataState"] = "DEGRADED" if missing else "AVAILABLE"
        item["reasonCodes"] = [
            "MISSING_" + re.sub(r"(?<!^)(?=[A-Z])", "_", name).upper()
            for name in missing
        ]
        checked.append(item)
    return checked


def _snapshot(service, operation, raw_items, fetched_at, semantic_type, source_type, source_name, items):
    checked_items = _quality_checked_items(semantic_type, operation, items)
    state = "UNAVAILABLE" if not raw_items else (
        "DEGRADED" if any(item["dataState"] == "DEGRADED" for item in checked_items)
        else "AVAILABLE"
    )
    return {
        "schemaVersion": "earthus.kto-normalized.v1",
        "provider": "KTO",
        "service": service,
        "operation": operation,
        "state": state,
        "semanticType": semantic_type,
        "sourceType": source_type,
        "fetchedAt": fetched_at,
        "items": checked_items,
        "provenance": {
            "sourceName": source_name,
            "sourceUrl": OFFICIAL_REFERENCES[service],
            "receivedAt": fetched_at,
        },
    }


def normalize_kto_snapshot(service, operation, envelope, fetched_at):
    raw_items = envelope.get("items") if isinstance(envelope, dict) else []
    raw_items = raw_items if isinstance(raw_items, list) else []
    if service == "concentration" and operation == "tatsCnctrRatedList":
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "RELATIVE_CONCENTRATION_FORECAST", "PROVIDER_FORECAST",
            "한국관광공사 관광지 집중률 방문자 추이 예측 정보",
            [_normalize_concentration(item) for item in raw_items if isinstance(item, dict)],
        )
    if service == "visitors" and operation in ("metcoRegnVisitrDDList", "locgoRegnVisitrDDList"):
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "HISTORICAL_REGION_VISITOR_METRIC", "HISTORICAL_STATISTIC",
            "한국관광공사 빅데이터 지역별 방문자수",
            [_normalize_visitor(item, operation) for item in raw_items if isinstance(item, dict)],
        )
    if service == "related" and operation in ("areaBasedList1", "searchKeyword1"):
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "RELATED_TOURISM_CONNECTION", "HISTORICAL_MOBILITY_CONNECTION",
            "한국관광공사 관광지별 연관 관광지 정보",
            [_normalize_related(item) for item in raw_items if isinstance(item, dict)],
        )
    if service == "localHub" and operation == "areaBasedList1":
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "TOURISM_CONNECTIVITY_HUB", "HISTORICAL_MOBILITY_CONNECTION",
            "한국관광공사 기초지자체 중심 관광지 정보",
            [_normalize_local_hub(item) for item in raw_items if isinstance(item, dict)],
        )
    if service == "barrierFree" and operation == "detailWithTour2":
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "OFFICIAL_ACCESSIBILITY_FACTS", "OFFICIAL_INFORMATION",
            "한국관광공사 무장애 여행 정보",
            [_normalize_accessibility(item) for item in raw_items if isinstance(item, dict)],
        )
    if service == "barrierFree" and operation in (
        "areaBasedList2", "locationBasedList2", "searchKeyword2", "areaBasedSyncList2",
        "detailCommon2", "detailIntro2", "detailInfo2", "detailImage2",
        "ldongCode2", "lclsSystmCode2",
    ):
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "OFFICIAL_BARRIER_FREE_TOURISM_CONTENT", "OFFICIAL_INFORMATION",
            "한국관광공사 무장애 여행 정보",
            [_normalize_barrier_content(item, operation) for item in raw_items if isinstance(item, dict)],
        )
    if service == "wellness" and operation in (
        "ldongCode", "areaBasedList", "locationBasedList", "searchKeyword",
        "wellnessTursmSyncList", "detailCommon", "detailIntro", "detailInfo", "detailImage",
    ):
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "OFFICIAL_WELLNESS_CONTENT", "OFFICIAL_INFORMATION",
            "한국관광공사 웰니스관광정보",
            [_normalize_wellness(item, operation) for item in raw_items if isinstance(item, dict)],
        )
    if service == "english" and operation in (
        "areaBasedList2", "locationBasedList2", "searchKeyword2", "searchFestival2",
        "searchStay2", "areaBasedSyncList2", "detailCommon2", "detailIntro2",
        "detailInfo2", "detailImage2", "ldongCode2", "lclsSystmCode2",
    ):
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "OFFICIAL_ENGLISH_TOURISM_CONTENT", "OFFICIAL_INFORMATION",
            "한국관광공사 영문 관광정보서비스",
            [_normalize_english(item, operation) for item in raw_items if isinstance(item, dict)],
        )
    if (service, operation) in REGIONAL_INDEX_PREFIX:
        diversity = service == "diversity"
        return _snapshot(
            service, operation, raw_items, fetched_at,
            "REGIONAL_TOURISM_DIVERSITY_INDEX" if diversity
            else "REGIONAL_TOURISM_DEMAND_STRENGTH_INDEX",
            "HISTORICAL_ANALYTICAL_INDEX",
            "한국관광공사 지역별 관광 다양성" if diversity
            else "한국관광공사 지역별 관광 수요 강도",
            [_normalize_regional_index(item, service, operation)
             for item in raw_items if isinstance(item, dict)],
        )
    raise ValueError(f"KTO_NORMALIZER_NOT_IMPLEMENTED:{service}:{operation}")

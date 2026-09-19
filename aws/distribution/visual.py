# -*- coding: utf-8 -*-
"""비주얼 사양 — 지시서 §18 · §19 · §20 · §21.

**여기서 그림을 그리지 않는다.** 사양과 메타데이터만 만든다.

왜 그리지 않나 — 이미 내려진 결정을 유지한다:
  aws/social-draft/handler.py 주석 그대로 —
  "Lambda(Amazon Linux)에 **한글 폰트가 없다.** 폰트를 넣으면 패키지가 커지고,
   무엇보다 사람이 어차피 보고 올릴 것이라 브라우저에서 그리는 편이 낫다."
  그리고 지구 장면은 Three.js 씬 안에서만 실제로 존재한다. 서버에서 지구를 다시
  그리면 화면과 다른 지구가 두 개 생긴다.

그래서 이 파일이 만드는 것은 **브라우저 스튜디오가 받아 그릴 수 있는 사양**이다.
카메라 위치는 사건 기하에서 자동으로 정한다(§20) — 사람이 매번 놓지 않는다.
"""
import math

VISUAL_SCHEMA = "earthus.visual-spec.v1"
VISUAL_VERSION = "earthus.visual/1.0.0"

# §18 템플릿 10종. 각 템플릿은 같은 영역을 갖고 배치만 다르다(§18 마지막 문단).
TEMPLATES = {
    "T01_BREAKING":        {"contentTypes": ("BREAKING",),        "accent": "#ff5b4a", "urgent": True},
    "T02_NOW":             {"contentTypes": ("NOW",),             "accent": "#ffb347", "urgent": False},
    "T03_EARTH_TODAY":     {"contentTypes": ("EARTH_TODAY",),     "accent": "#8fd0ff", "urgent": False},
    "T04_EARTH_WEEKLY":    {"contentTypes": ("EARTH_WEEKLY",),    "accent": "#8fd0ff", "urgent": False},
    "T05_PHENOMENON":      {"contentTypes": ("PHENOMENON",),      "accent": "#9fe6c0", "urgent": False},
    "T06_EARTH_FROM_SPACE":{"contentTypes": ("EARTH_FROM_SPACE",),"accent": "#c8b6ff", "urgent": False},
    "T07_DATA_STORY":      {"contentTypes": ("DATA_STORY",),      "accent": "#ecd7a6", "urgent": False},
    "T08_MONTHLY_EARTH":   {"contentTypes": ("MONTHLY_EARTH",),   "accent": "#9fb9ff", "urgent": False},
    "T09_QUARTERLY_EARTH": {"contentTypes": ("QUARTERLY_EARTH",), "accent": "#9fb9ff", "urgent": False},
    "T10_STATE_OF_EARTH":  {"contentTypes": ("ANNUAL_EARTH",),    "accent": "#ffffff", "urgent": False},
}
TEMPLATE_FOR_TYPE = {t: name for name, cfg in TEMPLATES.items() for t in cfg["contentTypes"]}

# §18 — 모든 템플릿이 갖춰야 하는 영역. 하나라도 빠지면 사양 검사가 막는다.
REQUIRED_AREAS = ("title", "geo", "data", "source", "timestamp", "brand", "confidence")

# 플랫폼별 캔버스. 실제 업로드 규격이다.
CANVAS = {
    "instagram": {"SINGLE_IMAGE": (1080, 1350), "CAROUSEL": (1080, 1350), "SHORT_VIDEO": (1080, 1920)},
    "x":         {"SINGLE_IMAGE": (1600, 900),  "TEXT": None, "THREAD": None, "LINK_POST": None},
    "facebook":  {"SINGLE_IMAGE": (1200, 630),  "TEXT": None, "LINK_POST": None, "SHORT_VIDEO": (1080, 1920)},
    "linkedin":  {"SINGLE_IMAGE": (1200, 627),  "TEXT": None, "LINK_POST": None},
    "youtube":   {"SHORT_VIDEO": (1080, 1920)},
    "threads":   {"SINGLE_IMAGE": (1080, 1350), "TEXT": None},
    "tiktok":    {"SHORT_VIDEO": (1080, 1920)},
}

# §20 카메라 — 사건 기하에서 자동으로 고른다.
# 반경(km) → 카메라 높이(km). 지구 반경 6371km 기준으로 화면에 담기게 잡은 값.
_HEIGHT_STEPS = ((25, 400), (100, 1200), (300, 3000), (1000, 8000), (3000, 16000))
GLOBAL_HEIGHT_KM = 24000


class VisualError(ValueError):
    pass


def _bbox(points):
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    return min(lats), min(lons), max(lats), max(lons)


def _span_km(lat0, lon0, lat1, lon1):
    """대략적인 대각선 거리(km). 정확한 측지 계산이 필요하지 않다 —
    카메라를 얼마나 뒤로 뺄지 정하는 데만 쓴다."""
    dlat = (lat1 - lat0) * 111.0
    mid = math.radians((lat0 + lat1) / 2.0)
    dlon = (lon1 - lon0) * 111.0 * max(0.1, math.cos(mid))
    return math.hypot(dlat, dlon)


def camera_for(geometry):
    """§20 — 기하에서 카메라를 정한다. 사람이 매번 놓지 않는다.

    geometry 는 셋 중 하나다:
      {"type":"point","lat":..,"lon":..,"radiusKm":..}
      {"type":"track"|"polygon","points":[[lat,lon],...]}
      {"type":"global"}
    모르는 모양이면 **전지구 시점**으로 물러난다. 임의의 좌표를 지어내지 않는다(§103).
    """
    if not geometry or geometry.get("type") == "global":
        return {"lat": 20.0, "lon": 130.0, "heightKm": GLOBAL_HEIGHT_KM,
                "heading": 0.0, "pitch": -90.0, "framing": "global",
                "reason": "기하가 없거나 전지구 대상"}

    gtype = geometry.get("type")
    if gtype == "point":
        lat, lon = geometry.get("lat"), geometry.get("lon")
        if lat is None or lon is None:
            return camera_for(None)
        span = float(geometry.get("radiusKm") or 50.0) * 2.0
    elif gtype in ("track", "polygon", "line"):
        pts = [p for p in (geometry.get("points") or [])
               if isinstance(p, (list, tuple)) and len(p) >= 2
               and p[0] is not None and p[1] is not None]
        if not pts:
            return camera_for(None)
        la0, lo0, la1, lo1 = _bbox(pts)
        lat, lon = (la0 + la1) / 2.0, (lo0 + lo1) / 2.0
        span = max(60.0, _span_km(la0, lo0, la1, lo1) * 1.4)
    else:
        return camera_for(None)

    height = GLOBAL_HEIGHT_KM
    for limit, h in _HEIGHT_STEPS:
        if span <= limit:
            height = h
            break
    framing = "closeup" if height <= 1200 else "region" if height <= 8000 else "hemisphere"
    return {"lat": round(lat, 4), "lon": round(lon, 4), "heightKm": height,
            "heading": 0.0, "pitch": -90.0, "framing": framing,
            "reason": f"기하 {gtype} · 대각 약 {span:.0f}km"}


def make_spec(content, *, platform, content_format, layers=None, chart=None):
    """§18 · §19 — 브라우저 스튜디오가 그대로 받아 그릴 수 있는 사양.

    실제 EARTHUS 자료에서만 그린다(§19). 스톡 사진 경로를 두지 않는다 —
    그런 필드가 있으면 언젠가 쓰이고, 그 순간 과학 콘텐츠가 아니게 된다.
    """
    ctype = content.get("type")
    template = TEMPLATE_FOR_TYPE.get(ctype)
    if not template:
        raise VisualError(f"{ctype} 에 맞는 템플릿이 없다")
    sizes = CANVAS.get(platform) or {}
    if content_format not in sizes:
        raise VisualError(f"{platform} 는 {content_format} 캔버스를 갖지 않는다")
    size = sizes[content_format]
    if size is None:
        return None      # 글만 있는 형식 — 그림이 필요 없다. None 은 오류가 아니다.

    cam = camera_for(content.get("geometry"))
    cfg = TEMPLATES[template]

    # §18 필수 영역을 여기서 전부 채운다. 비면 사양 검사가 잡는다.
    areas = {
        "title": content.get("title"),
        "geo": {"camera": cam, "layers": list(layers or []),
                "geometry": content.get("geometry")},
        "data": chart or _key_numbers(content),
        "source": " · ".join((content.get("datasetRefs") or [])[:3]) or None,
        "timestamp": content.get("eventTime") or content.get("generatedAt"),
        "brand": "EARTHUS",
        "confidence": content.get("confidence"),
        "cta": content.get("callToAction"),
    }
    missing = [a for a in REQUIRED_AREAS if not areas.get(a)]

    return {
        "schemaVersion": VISUAL_SCHEMA,
        "template": template,
        "accent": cfg["accent"],
        "urgent": cfg["urgent"],
        "platform": platform,
        "format": content_format,
        "canvas": {"w": size[0], "h": size[1]},
        "areas": areas,
        "missingAreas": missing,     # 비어 있어야 한다. 화면이 이걸 그대로 보여 준다
        "generatorVersion": VISUAL_VERSION,
    }


def _key_numbers(content):
    """분석 문장에서 숫자 카드를 만든다. 숫자를 새로 계산하지 않는다."""
    rows = []
    for c in content.get("claims") or []:
        if c.get("type") not in ("OBSERVED", "ANALYZED"):
            continue
        if not c.get("factId"):
            continue
        rows.append({"claimId": c["claimId"], "factId": c["factId"], "text": c["text"]})
        if len(rows) >= 4:
            break
    return {"kind": "facts", "rows": rows} if rows else None


def make_asset_metadata(*, asset_id, content_id, spec, captured_at, dataset_snapshot):
    """§21 — 그린 결과를 재현할 수 있게 남긴다.

    이것이 없으면 6개월 뒤 "이 그림은 어느 시점 자료인가"에 답할 수 없다.
    """
    if not spec:
        raise VisualError("사양 없이 자산 메타데이터를 만들 수 없다")
    cam = ((spec.get("areas") or {}).get("geo") or {}).get("camera") or {}
    return {
        "schemaVersion": VISUAL_SCHEMA,
        "assetId": asset_id,
        "sourceContentId": content_id,
        "visualType": f"{spec['template']}/{spec['format']}",
        "template": spec["template"],
        "cameraPosition": {"lat": cam.get("lat"), "lon": cam.get("lon"),
                           "heightKm": cam.get("heightKm")},
        "cameraOrientation": {"heading": cam.get("heading"), "pitch": cam.get("pitch")},
        "canvas": spec.get("canvas"),
        "dataLayer": ((spec.get("areas") or {}).get("geo") or {}).get("layers") or [],
        "datasetSnapshot": dataset_snapshot,
        "capturedAt": captured_at,
        "generatorVersion": VISUAL_VERSION,
    }


def validate_spec(spec):
    """사양이 그릴 수 있는 상태인가. 비어 있으면 무엇이 비었는지 말한다."""
    if spec is None:
        return True, []            # 글만 있는 형식 — 정상이다
    problems = []
    if spec.get("template") not in TEMPLATES:
        problems.append("알 수 없는 템플릿")
    for a in spec.get("missingAreas") or []:
        problems.append(f"비어 있는 영역: {a}")
    cam = ((spec.get("areas") or {}).get("geo") or {}).get("camera") or {}
    if cam.get("framing") != "global" and (cam.get("lat") is None or cam.get("lon") is None):
        problems.append("카메라 좌표가 없다")
    return (not problems), problems

# -*- coding: utf-8 -*-
"""3G 테스트용 입력 조립기.

⚠️ 운영 파일을 복사해 오지 않는다. 여기서 만드는 것은 **상류가 실제로 내보내는 필드 이름과
   모양**을 그대로 흉내 낸 최소 입력이다. 필드 이름의 근거는 `aws/gdelt-events/handler.py`
   416-499행(레코드 조립)과 556-575행(봉투)이다.
"""
import pathlib
import sys
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
FUNCTION = HERE.parent
SHARED = FUNCTION.parent / "_shared"
for path in (str(FUNCTION), str(SHARED)):
    if path not in sys.path:
        sys.path.insert(0, path)

GENERATED = "2026-09-13T10:35:00Z"
SOURCE = "GDELT 2.0 Events"


def body_of(document):
    """입력 객체를 **바이트**로. 조립기는 원본 본문을 받아야 원자료를 보관할 수 있다."""
    import json
    return json.dumps(document, ensure_ascii=False).encode("utf-8")


def assemble(document, *, ahead_min=25.0, **kwargs):
    """조립기 호출 한 줄. 기준 시각과 원본 본문을 함께 넘긴다.

    ⚠️ `source_body` 를 빼고 부르면 원자료를 만들 수 없어 조립이 중단된다 — 그것이 설계다
       (재료 없는 정본을 만들지 않는다). 테스트도 실제와 같은 조건으로 부른다.
    """
    import assembler
    kwargs.setdefault("now_epoch", now_for(document.get("generated") or GENERATED,
                                           ahead_min))
    kwargs.setdefault("source_body", body_of(document))
    return assembler.assemble(document, **kwargs)


def load_handler():
    """`handler.py` 를 **고유한 모듈 이름으로** 불러온다.

    ⚠️ 저장소의 함수마다 최상위 `handler.py` 가 있다(Lambda 가 그 이름을 요구한다).
       `import handler` 로 들이면 `sys.modules['handler']` 를 차지해서, 여러 함수의 테스트를
       **한 번에** 돌릴 때 남의 handler 가 우리 것으로 가려진다. 그래서 경로로 불러온다.
       (`assembler` · `normalize` 는 저장소에서 이 함수에만 있는 이름이라 그대로 둔다.)
    """
    import importlib.util
    name = "earth_events_handler"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, str(FUNCTION / "handler.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def epoch(iso):
    return datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc).timestamp()


def now_for(generated=GENERATED, ahead_min=25.0):
    """봉투 시각보다 `ahead_min` 분 뒤. 창(3시간) 안이어야 통과한다."""
    return epoch(generated) + ahead_min * 60.0


def gdelt_event(event_id="100000001", root="DIS", event_code="0233",
                place="Bordeaux, Gironde, France", country="FR",
                feature_id="F-BORDEAUX", geo_type="4", lat=44.84, lon=-0.58,
                url="https://alpha.example.com/news/fire-1", domain=None,
                title="Wildfire forces evacuations near Bordeaux",
                age_min=40, score=55, sources=3, mentions=9, outlets=2,
                alt=None, also_places=None, status=None, **extra):
    """상류 레코드 하나. 없는 값은 넣지 않는다(상류도 그렇게 한다)."""
    record = {
        "id": event_id,
        "lat": lat, "lon": lon,
        "place": place, "country": country,
        "root": root, "cameoRoot": "19" if root == "DIS" else root,
        "eventCode": event_code,
        "featureId": feature_id, "geoType": geo_type,
        "disaster": root == "DIS",
        "kindKo": "재난 보도" if root == "DIS" else "무력 충돌",
        "kindEn": "Disaster report" if root == "DIS" else "Armed clash",
        "sources": sources, "mentions": mentions, "outlets": outlets,
        "tone": -4.2,
        "url": url,
        "domain": domain if domain is not None else _host(url),
        "score": score,
        "ageMin": age_min,
        "status": status or ("confirmed" if score >= 60 else "unconfirmed"),
    }
    if title is not None:
        record["title"] = title
    if alt:
        record["alt"] = list(alt)
    if also_places:
        record["alsoPlaces"] = list(also_places)
    record.update(extra)
    return record


def _host(url):
    from urllib.parse import urlsplit
    return (urlsplit(url).netloc or "").lower().replace("www.", "")


def document(events, *, generated=GENERATED, window_hours=3, capped=False,
             max_events=150, source=SOURCE, drop=()):
    """봉투 + 사건. `drop` 에 적은 키는 아예 넣지 않는다(누락 시험용)."""
    doc = {
        "generated": generated,
        "sourceFile": "20260913103500",
        "windowHours": window_hours,
        "source": source,
        "sourceUrl": "https://www.gdeltproject.org/",
        "license": "Unlimited and unrestricted use; cite and link The GDELT Project",
        "termsUrl": "https://www.gdeltproject.org/about.html#termsofuse",
        "rules": {"confirmScore": 60, "minScore": 25, "dedupKm": 25,
                  "effectiveMinScore": 31, "cappedByLimit": capped,
                  "maxEvents": max_events},
        "counts": {"raw": 8005, "candidates": 789, "afterDedup": 269,
                   "shown": len(events), "confirmed": 0, "softDropped": 15,
                   "multiPlace": 0, "placeDoubt": 0},
        "events": list(events),
    }
    for key in drop:
        doc.pop(key, None)
    return doc

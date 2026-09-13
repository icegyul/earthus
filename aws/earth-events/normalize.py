# -*- coding: utf-8 -*-
"""정규화 — 출처별 원자료 → **source-agnostic 정규 레코드** (결정 ⑦).

이번 v1 의 유일한 어댑터는 GDELT(`events/global.json`)다. 향후 GDACS·USGS·KMA·위성은
같은 정규 레코드를 만드는 어댑터를 더하는 것으로 끝난다 — 뒷단을 고치지 않는다.

여기서 **숫자를 만들지 않는다.** 상류가 준 값을 옮기고, 없는 것은 없다고 적는다.
특히 시각은 지어내지 않는다(결정 ③).

정규 레코드의 축은 `docs/3G_SOURCE_SCOPE.md` §3.1 의 열 개다.
"""
import os
import sys
from urllib.parse import urlsplit

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))

import earth_event_id as eid                  # noqa: E402
import geolocate as geo                       # noqa: E402

SCHEMA = "earthus.earth-event-normalized/1"

GDELT_SYSTEM = "gdelt"
# 정본이 이미 분류했다 — docs/TRUTH_VOCABULARY_CANONICAL.md:148
GDELT_SOURCE_KIND = "NEWS"
# 대체 URL 은 상류가 최대 4개까지 담는다 (`gdelt-events/handler.py:498` `[:4]`).
# 기사 행으로 펼칠 때 그 상한을 그대로 쓴다 — 우리가 더 늘릴 수 있는 값이 아니다.
MAX_ALT_URLS = 4
# `alsoPlaces` 도 상류가 4개까지 담는다 (`handler.py:479` `< 4`).
MAX_ALSO_PLACES = 4

# 시간 정밀도 (결정 ③). SQL 에는 아직 이 칸이 없다 — 미결정 11.
PRECISION_EXACT = "EXACT"
PRECISION_ESTIMATED = "ESTIMATED"
PRECISION_RELATIVE = "RELATIVE"
PRECISION_UNKNOWN = "UNKNOWN"
TIME_PRECISIONS = (PRECISION_EXACT, PRECISION_ESTIMATED, PRECISION_RELATIVE, PRECISION_UNKNOWN)


class NormalizeError(ValueError):
    """정규화를 끝낼 수 없다. 부분 결과를 내지 않는다 (fail-closed)."""


def _int_or_none(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float_or_none(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None      # NaN 제외


def event_type_of(record):
    """사건 유형. 상류가 이미 정한 분류를 그대로 옮긴다 — 새 분류를 만들지 않는다.

    `root` 는 CAMEO 대분류 7종(`handler.py:99 ROOT`) 이거나, 재난 기사로 판정되면
    `"DIS"` 다(`handler.py:421`). 원본 CAMEO 코드는 `cameoRoot` 에 남아 있다.

    ⚠️ **`eventCode`(세분류)를 유형 키에 넣지 않는다.** 상류의 자체 중복제거는
       `(root, eventCode)` 가 같아야 합치지만(`handler.py:446`), 우리 유형은 한 단계
       거칠다. 근거는 결정 ④ 의 안정성 요구다 — 세분류는 회차마다 어느 기사가 대표로
       뽑히느냐에 따라 흔들리고, 흔들리면 같은 사건이 다른 id 로 갈라진다.
       세분류는 `event_type_detail` 에 보존해 근거로 남긴다.
    """
    root = str((record or {}).get("root") or (record or {}).get("cameoRoot") or "").strip()
    return ("%s:%s" % (GDELT_SYSTEM, root)) if root else None


def host_of(url):
    """매체 도메인. `gdelt-events/handler.py:218 domain_of()` 와 **같은 규칙**이다.

    독립 출처 회계가 '서로 다른 매체인가'로 세기 때문에, 규칙이 어긋나면 같은 배치에서
    상류와 우리가 다른 매체 수를 말하게 된다.
    """
    try:
        return (urlsplit(str(url or "")).netloc or "").lower().replace("www.", "")
    except ValueError:
        return ""


def articles_of(record, *, source_id, bucket_iso):
    """한 GDELT 사건에서 기사 행을 펼친다 — dedup 의 입력이 된다.

    ⚠️ 상류가 이미 병합했다(`merged` 필드). 그래서 우리가 보는 기사 목록은 GDELT 가 본
       것보다 적다 — head url + alt[] 뿐이다. 독립 출처 수가 실제보다 작게 나올 수 있고,
       작게 나오는 쪽이 결정 ① 의 보수적 방향과 같으므로 허용한다. 산출물에 그 사실을 적는다.
    ⚠️ `published_at` 을 지어내지 않는다. 정확 시각이 없으므로 버킷 시작 시각을 쓰고
       정밀도를 함께 적는다 — dedup 의 시간 창은 그 값으로 판단한다.
    ⚠️ 매체는 **url 마다 따로** 뽑는다. `record["domain"]` 은 대표 url 의 것이므로
       그것을 alt 에도 붙이면 서로 다른 매체가 한 매체로 세어져 독립 출처 수가 줄어든다
       (`article_dedup` 의 전재 판정이 '같은 매체'를 먼저 본다).
    """
    record = record or {}
    urls = []
    head = record.get("url")
    if head:
        urls.append(head)
    for alt in (record.get("alt") or [])[:MAX_ALT_URLS]:
        if alt and alt not in urls:
            urls.append(alt)
    rows = []
    for index, url in enumerate(urls):
        # 대표 url 의 도메인은 상류가 이미 적어 뒀다. 그 값을 우선 쓰고(같은 규칙이므로
        # 같은 결과여야 한다), alt 는 주소에서 뽑는다.
        publisher = (record.get("domain") if index == 0 else None) or host_of(url) or None
        rows.append({
            "article_id": "%s#%d" % (source_id, index),
            "url": url,
            "canonical_url": url,
            "publisher": publisher,
            "language": None,                      # GDELT 가 주지 않는다
            "title": record.get("title") or None,
            "published_at": bucket_iso,            # 버킷 시작 — 정확 시각이 아니다
            "published_at_precision": PRECISION_RELATIVE,
            "lat": _float_or_none(record.get("lat")),
            "lon": _float_or_none(record.get("lon")),
        })
    return rows


def normalize_gdelt_event(record, *, generated_epoch, generated_iso):
    """GDELT 사건 하나 → 정규 레코드 하나.

    `generated_epoch` 은 파일 봉투의 `generated` 다. `ageMin` 의 기준점이고,
    이것이 없으면 시간을 전혀 복원할 수 없다.
    """
    record = record or {}
    raw_id = str(record.get("id") or "").strip()
    if not raw_id:
        raise NormalizeError("GDELT 사건에 id 가 없다")
    source_event_id = eid.source_event_id(GDELT_SYSTEM, raw_id)

    event_type = event_type_of(record)
    place = geo.canonical_place(record)

    # ── 시간 (결정 ③·⑤) ────────────────────────────────────────────────────
    age_min = _int_or_none(record.get("ageMin"))
    bucket_iso, estimated_epoch, precision = None, None, PRECISION_UNKNOWN
    if generated_epoch is not None and age_min is not None:
        estimated_epoch = float(generated_epoch) - age_min * 60.0
        bucket_iso = eid.time_bucket(estimated_epoch)
        # 정확 시각이 아니다. ageMin 은 배치 주기·창에 묶인 상대값이다.
        precision = PRECISION_RELATIVE
    elif generated_epoch is not None:
        # ageMin 이 없다. 파일 시각으로 버킷만 정하고 정밀도는 모른다고 적는다.
        bucket_iso = eid.time_bucket(generated_epoch)
        precision = PRECISION_UNKNOWN

    return {
        "schema": SCHEMA,
        # 출처 식별
        "source_system": GDELT_SYSTEM,
        "source_id": "%s:%s" % (GDELT_SYSTEM, record.get("domain") or "unknown"),
        "source_kind": GDELT_SOURCE_KIND,
        "source_event_id": source_event_id,     # 결정 ③ — GlobalEventID 보존
        "official_event_id": None,              # GDELT 는 기관 사건 id 가 아니다
        # 사건 유형
        "event_type": event_type,
        "event_type_detail": str(record.get("eventCode") or "") or None,
        "title": record.get("title") or None,
        "kind_label": {"ko": record.get("kindKo") or None,
                       "en": record.get("kindEn") or None},
        # 위치
        "place": place,
        "also_places": list(record.get("alsoPlaces") or [])[:MAX_ALSO_PLACES],
        # 시간 — 정확 시각을 지어내지 않는다
        "time": {
            "source_age_min": age_min,               # 결정 ③ — 원본 보존
            "reference_generated": generated_iso,    # ageMin 의 기준점
            "estimated_event_epoch": estimated_epoch,
            "time_bucket": bucket_iso,
            "precision": precision,
            "occurred_at": None,                     # 정확 시각이 없다
            "issued_at": None,
        },
        # 교차검증 보조 — TRUTH_STATUS 입력으로 쓰지 않는다
        "cross_check": {
            "score": _int_or_none(record.get("score")),
            "mentions": _int_or_none(record.get("mentions")),
            "outlets": _int_or_none(record.get("outlets")),
            "sources": _int_or_none(record.get("sources")),
            "merged": _int_or_none(record.get("merged")),
            "upstream_status": record.get("status") or None,
            "tone": _float_or_none(record.get("tone")),
            "disaster": bool(record.get("disaster")),
        },
        # 기사 행 (dedup 입력)
        "articles": articles_of(record, source_id=source_event_id, bucket_iso=bucket_iso),
    }


def normalize_envelope(document):
    """파일 봉투에서 3G 가 반드시 읽어야 하는 것.

    `cappedByLimit` 와 `counts` 는 입력이 잘렸는지를 말하는 유일한 신호다.
    잘린 입력을 "그날의 전부"로 취급하면 산출물이 거짓이 된다.
    """
    document = document or {}
    rules = document.get("rules") or {}
    counts = document.get("counts") or {}
    return {
        "generated": document.get("generated"),
        "source": document.get("source"),
        "source_file": document.get("sourceFile"),
        "window_hours": _int_or_none(document.get("windowHours")),
        "license": document.get("license"),
        "terms_url": document.get("termsUrl"),
        "source_url": document.get("sourceUrl"),
        "capped": bool(rules.get("cappedByLimit")),
        "max_events": _int_or_none(rules.get("maxEvents")),
        "counts": {k: _int_or_none(v) for k, v in counts.items()},
        "rules": dict(rules),
    }


def normalize(document, *, generated_epoch):
    """봉투 + 사건 전부를 정규화한다. 사건 하나가 실패하면 **전체를 중단한다.**

    ⚠️ fail-closed — 부분 조립으로 canonical 을 만들지 않는다. 실패한 사건을 빼고
       나머지를 쓰면 그 산출물은 "그때 있던 사건 전부"가 아니게 되고, 색인이 그것을
       전부라고 말한다.
    """
    envelope = normalize_envelope(document)
    events = (document or {}).get("events")
    if not isinstance(events, list):
        raise NormalizeError("events 가 목록이 아니다")
    out = []
    for index, record in enumerate(events):
        if not isinstance(record, dict):
            raise NormalizeError("events[%d] 가 객체가 아니다: %s"
                                 % (index, type(record).__name__))
        try:
            out.append(normalize_gdelt_event(
                record, generated_epoch=generated_epoch,
                generated_iso=envelope.get("generated")))
        except NormalizeError:
            raise
        except Exception as exc:                      # noqa: BLE001
            raise NormalizeError("events[%d] 정규화 실패: %s: %s"
                                 % (index, type(exc).__name__, exc)) from exc
    return {"schema": SCHEMA, "envelope": envelope, "records": out}

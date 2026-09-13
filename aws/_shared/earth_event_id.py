# -*- coding: utf-8 -*-
"""EarthEvent canonical id — 결정 ②③④⑤⑦.

    evt_<sha256 앞 20 hex>      (80비트)

입력(v1): `event_type` · `canonical_place` · 3시간 UTC `time_bucket` · `event_key_version`
`primary_entities` 는 **v1 에서 제외**한다 (결정 ⑦ — 검증된 추출기가 없다).

⚠️ **"deterministic normalized event signature" 를 어떻게 읽었는가.**
   결정 ④ 가 v1 입력으로 넷을 적었고 그중 하나가 그 이름이다. 이것을 **다섯째 독립 입력이
   아니라 위 세 입력을 정규화해 이어 붙인 서명 문자열**로 읽었다. 근거:
     · 제목을 서명에 넣으면 결정 ④ 의 "GDELT 회차별 source ID 변경 → 동일 EarthEvent" 가
       깨진다. 대표 구성원이 교체되면 제목이 바뀌고, 실측으로 150건 중 6건은 제목이 아예 없다.
     · 다른 독립 입력 후보(엔티티)는 결정 ⑦ 이 v1 에서 뺐다.
   그래서 `signature()` 가 그 서명 문자열을 만들고 `event_id()` 가 그것을 해시한다.
   이 읽기가 틀렸다면 고칠 자리는 `signature()` 한 곳이다.

⚠️ **v11 `stableId` 를 쓰지 않는다.** 그것은 FNV-1a 32비트다. 하루 유입 상한
   150건 × 48회 = 7,200 사건/일 기준 생일 한계가 **92건**이라 충돌 시험을 통과할 수 없다.
   여기서 20 hex(80비트)를 쓰는 근거가 그 계산이다 — 1/1e6 유지 한계 약 1.55e9.

관련 문서: `docs/3G_EVENT_ID_SPEC.md` · `docs/3G_POLICY_DECISIONS.md`
"""
import hashlib
import re
import unicodedata
from datetime import datetime, timedelta, timezone

SCHEMA = "earthus.earth-event-id/1"

# 결정 ④ — 초기 버전. id 생성 규칙이 바뀌면 올린다. 기존 id 를 소급 변경하지 않는다.
EVENT_KEY_VERSION = 1

# 결정 ②③ — sha256 앞 20 hex = 80비트
ID_HEX = 20
ID_PREFIX = "evt_"
ID_PATTERN = re.compile(r"^evt_[0-9a-f]{%d}$" % ID_HEX)

# 결정 ⑤ — GDELT WINDOW_HOURS = 3 을 기준으로 3시간 UTC 버킷
TIME_BUCKET_HOURS = 3

_FIELD_SEP = "\x1f"      # 입력 사이. 값에 나타날 수 없는 문자를 쓴다
_ABSENT = ""             # 없음의 표현. 회차마다 같아야 한다(§결정 ④)

_SPACE = re.compile(r"\s+")


class EventIdError(ValueError):
    """id 를 만들 수 없다. 임의 값으로 대신 채우지 않는다."""


def time_bucket(epoch_seconds, hours=TIME_BUCKET_HOURS):
    """UTC 3시간 버킷의 시작 시각을 ISO 로. 정확 시각이 아니다.

    ⚠️ 결정 ⑤ — 이것을 실제 사건 발생 시각으로 취급하지 않는다. 버킷은 id 를 안정시키기
       위한 것이고, 시각 자체는 `source_age_min` 과 정밀도 표시로 따로 보존한다.
    """
    if epoch_seconds is None:
        return None
    try:
        moment = datetime.fromtimestamp(float(epoch_seconds), timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError) as exc:
        raise EventIdError("버킷을 만들 수 없는 시각: %r" % (epoch_seconds,)) from exc
    if hours <= 0:
        raise EventIdError("버킷 폭은 양수여야 한다: %r" % (hours,))
    floored = moment.replace(minute=0, second=0, microsecond=0)
    floored -= timedelta(hours=floored.hour % hours)
    return floored.strftime("%Y-%m-%dT%H:00:00Z")


def bucket_epoch(bucket_iso):
    """버킷 ISO → epoch 초. 결합이 시간 간격을 재는 데 쓴다."""
    if not bucket_iso:
        return None
    try:
        return datetime.strptime(bucket_iso, "%Y-%m-%dT%H:00:00Z").replace(
            tzinfo=timezone.utc).timestamp()
    except (TypeError, ValueError):
        return None


def _normalize(value):
    """정규화 — NFKC · 공백 접기 · 소문자. 값이 없으면 빈 문자열(없음의 고정 표현)."""
    if value is None:
        return _ABSENT
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if not text:
        return _ABSENT
    return _SPACE.sub(" ", text).lower()


def signature(*, event_type, place_key, time_bucket_iso,
              event_key_version=EVENT_KEY_VERSION):
    """지문에 들어가는 **정규화 서명 문자열**. 같은 대상이면 회차와 무관하게 같다.

    형식은 버전을 맨 앞에 둔다 — 버전이 다르면 나머지가 같아도 다른 서명이 된다.
    """
    if not isinstance(event_key_version, int) or event_key_version < 1:
        raise EventIdError("event_key_version 은 1 이상 정수여야 한다: %r"
                           % (event_key_version,))
    etype = _normalize(event_type)
    place = _normalize(place_key)
    bucket = _normalize(time_bucket_iso)
    # 세 입력이 모두 없으면 사건을 식별할 수 없다. id 를 지어 주지 않는다 —
    # 임의 id 를 주면 다음 실행이 그 자리를 덮어쓴다.
    if not any((etype, place, bucket)):
        raise EventIdError(
            "사건을 식별할 수 없다 — event_type · canonical_place · time_bucket 이 모두 없다")
    return _FIELD_SEP.join(("v%d" % event_key_version, etype, place, bucket))


def event_id(*, event_type, place_key, time_bucket_iso,
             event_key_version=EVENT_KEY_VERSION):
    """`evt_<20hex>`. 같은 입력이면 항상 같다."""
    sig = signature(event_type=event_type, place_key=place_key,
                    time_bucket_iso=time_bucket_iso,
                    event_key_version=event_key_version)
    digest = hashlib.sha256(sig.encode("utf-8")).hexdigest()[:ID_HEX]
    return ID_PREFIX + digest


def describe(*, event_type, place_key, time_bucket_iso,
             event_key_version=EVENT_KEY_VERSION):
    """id 와 그 근거를 함께. 산출물에 무엇으로 만든 id 인지 적기 위한 것이다."""
    sig = signature(event_type=event_type, place_key=place_key,
                    time_bucket_iso=time_bucket_iso,
                    event_key_version=event_key_version)
    return {
        "schema": SCHEMA,
        "eventId": ID_PREFIX + hashlib.sha256(sig.encode("utf-8")).hexdigest()[:ID_HEX],
        "eventKeyVersion": event_key_version,
        "inputs": {
            "eventType": _normalize(event_type) or None,
            "canonicalPlace": _normalize(place_key) or None,
            "timeBucket": _normalize(time_bucket_iso) or None,
            "primaryEntities": None,      # 결정 ⑦ — v1 에서 제외
        },
        "signatureSha256": hashlib.sha256(sig.encode("utf-8")).hexdigest(),
    }


def is_event_id(value):
    """우리 형식인가. 소비자는 id 를 파싱하지 않는다 — 이 검사만 쓴다."""
    return bool(isinstance(value, str) and ID_PATTERN.match(value))


def source_event_id(system, identifier):
    """source-local identifier. GDELT GlobalEventID 는 여기 보존된다(결정 ③).

    `earthus_source.source_id` 와 같은 `{system}:{identifier}` 규약을 쓴다.
    """
    system = _normalize(system)
    identifier = str(identifier or "").strip()
    if not system or not identifier:
        raise EventIdError("source_event_id 에 system 과 identifier 가 모두 필요하다")
    return "%s:%s" % (system, identifier)

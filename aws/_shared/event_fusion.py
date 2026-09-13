# -*- coding: utf-8 -*-
"""사건 결합 — `prototype/js/earthus2/v11/event/event-fusion.js` 의 Python 이식.

**알고리즘을 새로 만들지 않았다.** v11 의 `eventSimilarity` 를 그대로 옮겼다:
  · 유형이 다르면 즉시 탈락 (TYPE_MISMATCH)
  · 기관 사건 id 가 같으면 점수 1 (OFFICIAL_ID_MATCH)
  · 그 밖은 시간·거리·제목·지역 네 신호의 가중합
기본 정책값도 v11 과 같다 — `maxHours 72` · `maxMeters 250000`.

⚠️ **v11 의 `stableId` 는 옮기지 않았다.** 그것은 FNV-1a 32비트라
   `evt_<20hex>` 요구(결정 ②·③)를 만족할 수 없다. id 는 `earth_event_id.py` 가 만든다.
⚠️ **v11 의 `clusterEarthEvents` 도 옮기지 않았다.** 그 함수는 id 생성·필드 선택까지
   같이 하고 그 둘이 우리 결정과 다르다. 여기서는 **묶기만** 한다.

관련 문서: `docs/3G_POLICY_DECISIONS.md` · `docs/3G_EVENT_ID_SPEC.md`
"""
import math
import re
import unicodedata

SCHEMA = "earthus.event-fusion/1"

EARTH_RADIUS_M = 6371000.0

# v11 policy 기본값 (event-fusion.js 의 `policy.maxHours||72` · `policy.maxMeters||250000`)
DEFAULT_MAX_HOURS = 72.0
DEFAULT_MAX_METERS = 250000.0
# v11 의 병합 문턱. 같은 파일에서 읽어 옮겼다.
DEFAULT_MERGE_SCORE = 0.62

_WORD_SPLIT = re.compile(r"[^0-9A-Za-zÀ-ɏͰ-῿぀-鿿가-힯]+")


def haversine_meters(a_lat, a_lon, b_lat, b_lon):
    """두 점 사이 거리(m). 좌표가 하나라도 없으면 None — 0 이 아니다."""
    for value in (a_lat, a_lon, b_lat, b_lon):
        if value is None or not isinstance(value, (int, float)) or isinstance(value, bool):
            return None
        if math.isnan(float(value)):
            return None
    p1, p2 = math.radians(float(a_lat)), math.radians(float(b_lat))
    dp = math.radians(float(b_lat) - float(a_lat))
    dl = math.radians(float(b_lon) - float(a_lon))
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(x))


def tokens(text):
    """v11 의 `tokens` 와 같은 규칙 — NFKC 정규화 후 2자 이상만."""
    lowered = unicodedata.normalize("NFKC", str(text or "")).lower()
    return {t for t in _WORD_SPLIT.split(lowered) if len(t) > 1}


def jaccard(left, right):
    a, b = tokens(left), tokens(right)
    if not a or not b:
        return 0.0
    common = len(a & b)
    return common / float(len(a) + len(b) - common)


def event_similarity(left, right, policy=None):
    """v11 `eventSimilarity(a, b, policy)` 이식.

    돌려주는 것: {score, merge, reasons}
    """
    policy = policy or {}
    max_hours = float(policy.get("maxHours") or DEFAULT_MAX_HOURS)
    max_meters = float(policy.get("maxMeters") or DEFAULT_MAX_METERS)
    merge_at = float(policy.get("mergeScore") or DEFAULT_MERGE_SCORE)

    type_a = str((left or {}).get("eventType") or "").upper()
    type_b = str((right or {}).get("eventType") or "").upper()
    if not type_a or type_a != type_b:
        return {"score": 0.0, "merge": False, "reasons": ["TYPE_MISMATCH"]}

    official_a = (left or {}).get("officialEventId")
    official_b = (right or {}).get("officialEventId")
    if official_a and official_b and official_a == official_b:
        return {"score": 1.0, "merge": True, "reasons": ["OFFICIAL_ID_MATCH"]}

    hours = _hours_apart(left, right)
    dist = haversine_meters((left or {}).get("lat"), (left or {}).get("lon"),
                            (right or {}).get("lat"), (right or {}).get("lon"))
    name = jaccard((left or {}).get("title"), (right or {}).get("title"))
    region_a, region_b = (left or {}).get("region"), (right or {}).get("region")
    region = 1.0 if (region_a and region_b
                     and str(region_a).lower() == str(region_b).lower()) else 0.0

    # v11 과 같은 감쇠. 시간·좌표를 모르면 0 이 아니라 약한 기본값을 준다 —
    # 모른다는 것이 "멀다"는 뜻은 아니기 때문이다.
    time_score = 0.25 if hours is None else max(0.0, 1.0 - hours / max_hours)
    geo_score = (0.7 if region else 0.2) if dist is None \
        else max(0.0, 1.0 - dist / max_meters)

    score = 0.34 * time_score + 0.34 * geo_score + 0.22 * name + 0.10 * region
    reasons = []
    if hours is None:
        reasons.append("TIME_UNKNOWN")
    if dist is None:
        reasons.append("GEO_UNKNOWN")
    if name >= 0.5:
        reasons.append("TITLE_SIMILAR")
    if region:
        reasons.append("REGION_MATCH")
    return {"score": round(score, 4), "merge": score >= merge_at, "reasons": reasons}


def _hours_apart(left, right):
    """두 후보의 시간 간격(시간). 하나라도 모르면 None."""
    a = _bucket_or_time(left)
    b = _bucket_or_time(right)
    if a is None or b is None:
        return None
    return abs(a - b) / 3600.0


def _bucket_or_time(record):
    """결합에 쓸 시각. **정확 시각이 없으면 버킷 시각을 쓴다.**

    ⚠️ 결정 ③ — 정확 시각을 지어내지 않는다. `timeBucketEpoch` 는 3시간 버킷의
       시작 시각이고 그것이 정확 시각이 아님을 호출자가 안다.
    """
    if not isinstance(record, dict):
        return None
    for key in ("occurredEpoch", "timeBucketEpoch"):
        value = record.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None


def group(records, policy=None):
    """비슷한 후보를 묶는다. 돌려주는 것: [[record, …], …] — **id 를 만들지 않는다.**

    v11 `clusterEarthEvents` 와 다른 점: 묶기만 하고 대표 선정·id 생성·필드 선택을
    하지 않는다. 그 셋은 우리 결정(② ③ ④)이 따로 정했다.

    묶는 방식은 v11 과 같은 단일 연결(single-linkage)이다 — 한 구성원과라도 병합
    점수를 넘으면 같은 묶음이다.
    """
    items = [r for r in (records or []) if isinstance(r, dict)]
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    pairs = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            verdict = event_similarity(items[i], items[j], policy)
            if verdict["merge"]:
                pairs.append((i, j, verdict))
                a, b = find(i), find(j)
                if a != b:
                    parent[b] = a
    buckets = {}
    for index, item in enumerate(items):
        buckets.setdefault(find(index), []).append(item)
    # 결정적 순서: 묶음 안은 입력 순서, 묶음 사이는 첫 구성원의 입력 순서
    order = {}
    for index, item in enumerate(items):
        order.setdefault(find(index), index)
    return [buckets[key] for key in sorted(buckets, key=lambda k: order[k])]

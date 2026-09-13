# -*- coding: utf-8 -*-
"""PHASE 3G — Earth Event Assembler.

입력 하나(`events/global.json`)를 16 단계로 지나 **PRIVATE/SHADOW EarthEvent 정본**을 만든다.
새 엔진을 짜지 않았다 — 각 단계는 이미 있는 구현을 부르고, 이 파일은 **순서와 문(gate)** 만 갖는다.

    1  INPUT              입력 본문·해시 (핸들러가 읽어 온다)
    2  FRESHNESS          봉투 검사 · 신선도 · 잘림 신호            ← fail-closed
    3  NORMALIZE          normalize.py — 출처 비의존 정규 레코드
    4  SOURCE_RELATION    기사 ↔ 출처(earthus_source) 관계
    5  ARTICLE_DEDUP      _shared/article_dedup.deduplicate() + 계보
    6  EVENT_FUSION       _shared/event_fusion.group()
    7  CLAIM_EVIDENCE     _shared/claim_gate + 증거 노드
    8  INDEPENDENCE       article_dedup.independence_units_for()     ← 결정 ①
    9  TRUTH_STATUS       _shared/truth_vocabulary.judge()
   10  EARTH_EVENT        SQL earthus_earth_event 모양으로 조립
   11  EVENT_ID           _shared/earth_event_id.event_id()          ← 결정 ②③④
   12  CANONICAL_OUTPUT   PRIVATE / SHADOW 문서
   13  CANONICAL_WRITE    STAGING_ONLY (공개 접두사 쓰기 금지)
   14  RAW_ARCHIVE        원자료 보관 **참조** (적재기는 아직 없다)
   15  INDEX_CONSISTENCY  _shared/index_consistency.check(mode=FIXTURE)
   16  HEALTH             결과 요약

원칙
  · **FAILURE ≠ EMPTY.** 정상적으로 사건이 0건인 입력은 정상 empty 다. 읽을 수 없는 입력·
    봉투가 깨진 입력·창보다 오래된 입력은 **실패**이고, 그때 산출물을 만들지 않는다.
  · **공개 쓰기 0.** 이 조립기는 `events/` 에 쓰지 않는다. 정본은 `archive/` 아래다.
  · **숫자를 지어내지 않는다.** 퍼센트·신뢰도·발생시각을 만들지 않는다.
  · **승격은 다른 사람의 일이다.** 산출물은 항상 `release_state='SHADOW'` 다.

관련: `docs/3G_POLICY_DECISIONS.md` · `docs/NEWS_ENGINE_REUSE_MAP.md`
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_SHARED = os.path.join(os.path.dirname(_HERE), "_shared")
for _path in (_HERE, _SHARED):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import article_dedup as dedup                  # noqa: E402
import claim_gate                              # noqa: E402
import earth_event_id as eid                   # noqa: E402
import event_fusion as fusion                  # noqa: E402
import index_consistency                       # noqa: E402
import normalize as norm                       # noqa: E402
import provenance                              # noqa: E402
import raw_archive                              # noqa: E402
import publication_privacy as priv             # noqa: E402
import truth_vocabulary as truth               # noqa: E402

SCHEMA = "earthus.earth-event-assembly/1"
# index_consistency.SUPPORTED_SCHEMAS 가 아는 유일한 정본 판이다. 새 문자열을 만들지 않는다.
CANONICAL_SCHEMA = "earthus.earth-event.v1"

STAGES = (
    "INPUT", "FRESHNESS", "NORMALIZE", "SOURCE_RELATION", "ARTICLE_DEDUP",
    "EVENT_FUSION", "CLAIM_EVIDENCE", "INDEPENDENCE", "TRUTH_STATUS",
    "EARTH_EVENT", "EVENT_ID", "RAW_ARCHIVE", "CANONICAL_OUTPUT",
    "CANONICAL_WRITE", "INDEX_CONSISTENCY", "HEALTH",
)
# ⚠️ RAW_ARCHIVE 가 CANONICAL_* 보다 **앞**이다. 이유 둘:
#    ① 정본 문서가 원자료 키를 계보로 들고 있어야 한다(정본만 남고 재료가 사라지면 재계산 불가).
#    ② 원자료 쓰기가 실패하면 정본을 쓰지 않는다 — 재료 없는 정본을 만들지 않는다.

# ── 경로 (결정 ①) ──────────────────────────────────────────────────────────
CANONICAL_PREFIX = "archive/earth-events/canonical/v1/"
RAW_PREFIX = raw_archive.RAW_PREFIX
RAW_PATTERN = raw_archive.PART_PATTERN
INPUT_KEY = "events/global.json"

# ── 쓰기 모드 ───────────────────────────────────────────────────────────────
STAGING, LIVE = "STAGING", "LIVE"
WRITE_MODES = (STAGING, LIVE)

# ── 고정값 ─────────────────────────────────────────────────────────────────
SOURCE_SYSTEM = "gdelt"
SOURCE_KIND = "NEWS"                     # 정본이 이미 분류했다
EXPECTED_SOURCE = "GDELT 2.0 Events"     # 봉투의 `source` 값
# provenance.DATASET_PROVENANCE['events/global.json'] 의 cadence 가 30분이다.
UPSTREAM_CADENCE_MIN = 30
# 창(`windowHours`)보다 오래된 파일은 "지금"을 말하지 않는다. 봉투가 창을 알려 주므로
# 그 값을 쓰고, 없으면 아래 값으로 막는다(GDELT handler WINDOW_HOURS = 3).
DEFAULT_WINDOW_HOURS = 3
# DATA_STATE 판정 — 수집 주기의 두 배 안이면 LIVE, 그 밖이면 STALE.
LIVE_AGE_MIN = UPSTREAM_CADENCE_MIN * 2
# 증거 노드 종류. v11 EVIDENCE_KINDS 8종 중 뉴스에 해당하는 것.
EVIDENCE_KIND = "REPORTED"
# 사건 생애주기 초기값. SQL earthus_earth_event.lifecycle 기본값과 같다.
LIFECYCLE = "DETECTED"


class AssemblyError(RuntimeError):
    """조립을 끝낼 수 없다. **부분 산출물을 만들지 않는다.**"""


class StaleInputError(AssemblyError):
    """입력이 자기 관측 창보다 오래됐다. 빈 결과가 아니라 실패다."""


class PublicWriteRefused(AssemblyError):
    """공개 접두사에 쓰려 했다. 3G 는 공개 승격을 하지 않는다(결정 ⑨)."""


class LiveWriteRefused(AssemblyError):
    """운영 쓰기는 이번 승인 범위가 아니다."""


# ── 작은 도구 ───────────────────────────────────────────────────────────────
def sha256_hex(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def canonical_json(document):
    """정본 직렬화. 같은 내용이면 같은 바이트여야 한다 — 해시가 기준값이 되기 때문이다."""
    return json.dumps(document, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def parse_iso(text):
    """`2026-09-13T10:05:00Z` → epoch 초. 못 읽으면 None — 0 이 아니다."""
    if not text:
        return None
    value = str(text).strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.timestamp()


def public_release_allowed(state):
    """`prototype/js/earthus2/v11/core/contracts.js:18` 의 한 줄을 그대로 옮긴 것.

    새 어휘를 만들지 않는다(결정 ⑨). 3G 산출물은 항상 SHADOW 이므로 항상 False 다.
    """
    return state in ("ACTIVE", "CANARY")


def assert_not_public(key):
    """공개 접두사면 거부한다. 모르는 접두사도 거부한다 — 모르는 것을 안전하다고 하지 않는다."""
    visibility = priv.prefix_visibility(key)
    if visibility != "PRIVATE":
        raise PublicWriteRefused(
            "3G 정본은 PRIVATE 접두사에만 쓴다 — key=%s visibility=%s" % (key, visibility))
    return visibility


def canonical_key(event_id):
    """결정 ① — `archive/earth-events/canonical/v1/event_id=<earth_event_id>.json`"""
    if not eid.is_event_id(event_id):
        raise AssemblyError("우리 형식의 event_id 가 아니다: %r" % (event_id,))
    return "%sevent_id=%s.json" % (CANONICAL_PREFIX, event_id)


def archive_raw(document, *, source_body, generated_iso, mode, writer=None,
                allow_live=False):
    """결정 ① — 원자료를 만들고 **정본보다 먼저** 쓴다.

    `source_body` 가 없으면 보관하지 않는다. 그때 `object` 는 None 이고 `reason` 이 왜인지 적는다 —
    이 경우 호출자는 정본도 쓰지 않는다(재료 없는 정본을 만들지 않는다).

    쓰기 문은 정본과 같다: 모드 검사 · PRIVATE 접두사 확인 · `writer` 없으면 계획만.
    """
    if mode not in WRITE_MODES:
        raise AssemblyError("mode 는 %s 중 하나여야 한다: %r" % (WRITE_MODES, mode))
    if mode == LIVE and not allow_live:
        raise LiveWriteRefused(
            "운영 쓰기는 이번 승인 범위가 아니다 — mode=STAGING 으로 실행한다")
    if source_body is None:
        return {"prefix": None, "pattern": RAW_PATTERN, "object": None, "written": False,
                "reason": "원본 본문을 받지 못했다 — 원자료를 만들 수 없다(정본도 쓰지 않는다)"}
    try:
        built = raw_archive.build(document, source_key=INPUT_KEY,
                                  source_body=source_body, generated_iso=generated_iso)
    except raw_archive.RawArchiveError as exc:
        raise AssemblyError("원자료를 만들 수 없다: %s" % exc) from exc

    key = built["key"]
    assert_not_public(key)
    written = False
    if writer is not None:
        try:
            writer(key, built["body"])
        except PublicWriteRefused:
            raise
        except Exception as exc:                             # noqa: BLE001
            # 원자료 쓰기 실패는 정본 쓰기를 막는다(§12).
            raise AssemblyError("원자료 쓰기 실패 — 정본을 쓰지 않는다: %s: %s"
                                % (type(exc).__name__, exc)) from exc
        written = True
    return {
        "prefix": "%s%s/" % (RAW_PREFIX, built["partition"]),
        "pattern": RAW_PATTERN,
        "object": key,
        "bytes": built["bytes"],
        "sha256": built["sha256"],
        "sourceSha256": built["sourceSha256"],
        "sourceBytes": built["sourceBytes"],
        "partition": built["partition"],
        "eventCount": built["eventCount"],
        "lines": built["lines"],
        "uncompressedBytes": built["uncompressedBytes"],
        "gzip": {"mtime": raw_archive.GZIP_MTIME,
                 "compresslevel": raw_archive.GZIP_COMPRESSLEVEL,
                 "osByte": raw_archive.GZIP_OS_UNKNOWN},
        "written": written,
        "mode": mode,
        "reason": None,
    }


# ── 2 FRESHNESS ────────────────────────────────────────────────────────────
def check_freshness(document, *, now_epoch):
    """봉투를 검사한다. 여기서 막는 것이 fail-closed 목록이다.

    통과하는 것: 사건이 0건인 정상 입력 (FAILURE ≠ EMPTY).
    막는 것:
      · 문서가 객체가 아니다 / `events` 가 목록이 아니다
      · `source` 가 우리가 아는 출처가 아니다 (다른 파일을 읽고 있다)
      · `generated` 가 없거나 읽을 수 없다 (시간을 복원할 수 없다)
      · `generated` 가 미래다 (시계가 어긋났다 — 나이 계산이 음수가 된다)
      · 파일이 자기 관측 창보다 오래됐다 (지금을 말하지 않는다)
    """
    if not isinstance(document, dict):
        raise AssemblyError("입력이 객체가 아니다: %s" % type(document).__name__)
    if not isinstance(document.get("events"), list):
        raise AssemblyError("events 가 목록이 아니다 — 입력을 신뢰할 수 없다")
    source = document.get("source")
    if source != EXPECTED_SOURCE:
        raise AssemblyError("아는 출처가 아니다: %r (기대 %r)" % (source, EXPECTED_SOURCE))

    generated_iso = document.get("generated")
    generated_epoch = parse_iso(generated_iso)
    if generated_epoch is None:
        raise AssemblyError("봉투에 읽을 수 있는 generated 가 없다: %r" % (generated_iso,))
    if now_epoch is None:
        raise AssemblyError("기준 시각(now_epoch)이 없다 — 신선도를 판정할 수 없다")

    age_min = (float(now_epoch) - generated_epoch) / 60.0
    if age_min < -UPSTREAM_CADENCE_MIN:
        raise AssemblyError("입력의 generated 가 미래다 (%.1f분) — 시계가 어긋났다" % (-age_min,))

    window_hours = norm._int_or_none(document.get("windowHours")) or DEFAULT_WINDOW_HOURS
    max_age_min = window_hours * 60
    if age_min > max_age_min:
        raise StaleInputError(
            "입력이 자기 관측 창보다 오래됐다 — %.1f분 > %d분(windowHours=%d). "
            "이것은 빈 결과가 아니라 실패다." % (age_min, max_age_min, window_hours))

    rules = document.get("rules") or {}
    return {
        "generated": generated_iso,
        "generatedEpoch": generated_epoch,
        "ageMin": round(age_min, 1),
        "windowHours": window_hours,
        "maxAgeMin": max_age_min,
        "dataState": "LIVE" if age_min <= LIVE_AGE_MIN else "STALE",
        "eventCount": len(document["events"]),
        "normalEmpty": len(document["events"]) == 0,
        # 잘린 입력은 실패가 아니다 — 상류의 정상 동작이다. 다만 "그날의 전부"라고
        # 말할 수 없게 산출물에 표시한다.
        "truncated": bool(rules.get("cappedByLimit")),
        "maxEvents": norm._int_or_none(rules.get("maxEvents")),
        "counts": dict(document.get("counts") or {}),
        "provenance": provenance.resolve_dataset(INPUT_KEY),
    }


# ── 4 SOURCE_RELATION ──────────────────────────────────────────────────────
def build_sources(records):
    """`earthus_source` 모양의 행과 기사→출처 색인을 만든다.

    ⚠️ `independence_group` 은 **도메인 그대로** 다. 통신사 계열(로이터-계열 등)을
       하나로 묶는 표가 저장소에 없고, 없는 표를 지어내면 독립 출처 수가 틀어진다.
       계열 표가 생기면 여기 한 곳만 바뀐다.
    """
    rows, article_source, article_kind = {}, {}, {}
    for record in records:
        for article in record.get("articles") or ():
            publisher = article.get("publisher")
            if not publisher:
                continue                        # 매체를 모르는 기사는 출처 행을 만들지 않는다
            source_id = "%s:%s" % (SOURCE_SYSTEM, publisher)
            rows.setdefault(source_id, {
                "source_id": source_id,
                "publisher": publisher,
                "source_kind": SOURCE_KIND,
                "independence_group": publisher,
                "provider_ref": None,
                "dataset_ref": INPUT_KEY,
                "language": None,
                "region": None,
            })
            article_source[article["article_id"]] = publisher
            article_kind[article["article_id"]] = SOURCE_KIND
    return {
        "rows": [rows[key] for key in sorted(rows)],
        "articleSource": article_source,
        "articleKind": article_kind,
    }


# ── 5 ARTICLE_DEDUP ────────────────────────────────────────────────────────
def run_dedup(records):
    """기사 전부를 한 번에 묶는다.

    ⚠️ **사건별로 다시 부르지 않는다.** 같은 기사 쌍이 배치 전역과 사건 단위에서 다른
       판정을 받으면 회계가 둘로 갈라진다(`article_dedup.independence_units_for` 주석).
    """
    articles = []
    for record in records:
        articles.extend(record.get("articles") or ())
    return articles, dedup.deduplicate(articles)


# ── 6 EVENT_FUSION ─────────────────────────────────────────────────────────
def fusion_candidate(record, index):
    """정규 레코드 → 결합 후보. `event_fusion` 이 읽는 이름으로 맞춘다."""
    place = record.get("place") or {}
    time = record.get("time") or {}
    return {
        "_index": index,
        "eventType": record.get("event_type"),
        "officialEventId": record.get("official_event_id"),
        "title": record.get("title"),
        "lat": place.get("lat"),
        "lon": place.get("lon"),
        "region": place.get("country"),
        "timeBucketEpoch": eid.bucket_epoch(time.get("time_bucket")),
        # occurredEpoch 를 넣지 않는다 — 정확 시각을 모른다(결정 ③).
    }


def run_fusion(records, policy=None):
    """묶음만 만든다. 대표 선정·id 생성은 여기가 아니다(결정 ②③④가 따로 정했다)."""
    candidates = [fusion_candidate(record, index) for index, record in enumerate(records)]
    groups = fusion.group(candidates, policy)
    return [[records[item["_index"]] for item in bucket] for bucket in groups]


def identity_signature(members):
    """묶음의 신원 서명. 만들 수 없으면 None — 여기서 판정하지 않고 조립 단계가 실패한다."""
    head = representative(members)
    try:
        return eid.signature(event_type=head.get("event_type"),
                             place_key=(head.get("place") or {}).get("placeKey"),
                             time_bucket_iso=(head.get("time") or {}).get("time_bucket"))
    except eid.EventIdError:
        return None


def reconcile_identity(groups):
    """**같은 신원을 가진 묶음을 하나로 합친다.**

    결합(`event_fusion`)과 신원(결정 ④)이 서로 다른 것을 본다:
      · 결합은 좌표 거리(`haversine_meters`)로 본다 — v11 규칙을 그대로 쓴다
      · 신원은 `place_key`(확정 place_id 우선)로 본다 — 결정 ⑥
    그래서 같은 `featureId` 인데 좌표가 멀게 찍힌 두 묶음이 남을 수 있고, 그대로 두면
    **두 정본이 한 키를 다툰다.** 신원이 같으면 같은 EarthEvent 라는 것이 결정 ④ 이므로
    여기서 합친다. 결합 규칙을 고치지 않는 이유는 그것이 v11 테스트가 고정한 규칙이기 때문이다.

    돌려주는 것: (묶음 목록, 합쳐진 횟수)
    """
    order, buckets, unidentified = [], {}, []
    for group in groups:
        signature = identity_signature(group)
        if signature is None:
            unidentified.append(group)          # 신원을 만들 수 없다 — 조립 단계가 실패시킨다
            continue
        if signature not in buckets:
            buckets[signature] = list(group)
            order.append(signature)
        else:
            buckets[signature].extend(group)
    merged = [buckets[key] for key in order] + unidentified
    return merged, len(groups) - len(merged)


# ── 7 CLAIM_EVIDENCE ───────────────────────────────────────────────────────
def evidence_for(members, dedup_result):
    """증거 노드. **뿌리 기사 하나가 노드 하나** 다 — 전재본마다 만들지 않는다."""
    index = dedup_result.get("articles") or {}
    seen, nodes = set(), []
    for record in members:
        for article in record.get("articles") or ():
            entry = index.get(article["article_id"]) or {}
            root = entry.get("rootArticleId") or article["article_id"]
            if root in seen:
                continue
            seen.add(root)
            nodes.append({
                "evidence_id": "ev:%s" % root,
                "evidence_kind": EVIDENCE_KIND,
                "source_id": "%s:%s" % (SOURCE_SYSTEM, article.get("publisher") or "unknown"),
                "external_id": root,
                "title": article.get("title"),
                # 관측 시각을 지어내지 않는다. 기사 발행 시각도 정확값이 아니다(버킷이다).
                "observed_at": None,
                "source_url": article.get("url"),
                "source_kind": SOURCE_KIND,
                "payload": {"publishedAtPrecision": article.get("published_at_precision")},
            })
    return nodes


def gate_claims(members):
    """이 사건에 붙일 수 있는 주장이 있는가.

    ⚠️ GDELT 는 뉴스다. 기관 귀속(`officialSourceAttribution`)도 공식 특보
       (`officialWarning`)도 없으므로 **모든 주장이 거부된다.** 그것이 정답이다 —
       증거 없이 이름을 붙이지 않는다. 나중에 기관 출처가 붙으면 증거가 채워진다.
    """
    evidence = {}                 # 채울 근거가 없다. 빈 증거로 게이트를 지난다.
    claims = ("SOURCE_ATTRIBUTION", "SAFETY_ACTION")
    gated = claim_gate.gate_all(claims, evidence)
    official_safety = any(item["claimType"] == "SAFETY_ACTION"
                          for item in gated["allowed"])
    return gated, official_safety


# ── 8·9 INDEPENDENCE · TRUTH ───────────────────────────────────────────────
def independence_for(members, dedup_result, sources):
    """이 사건에 붙은 기사만 세어 독립 출처 수를 낸다(결정 ①)."""
    article_ids = [a["article_id"] for record in members
                   for a in (record.get("articles") or ())]
    return dedup.independence_units_for(
        dedup_result, article_ids,
        source_of=lambda aid: sources["articleSource"].get(aid),
        kind_of=lambda aid: sources["articleKind"].get(aid))


def judge_truth(*, independence_count, data_state, place_doubt):
    """두 축을 따로 돌려받는다 (정본 §2.1 규칙 3).

    ⚠️ 위치를 못 믿는 사건에는 교차검증을 붙이지 않는다. 여러 매체가 같은 기사를 보고
       썼어도 그 기사가 말하는 장소를 우리가 못 믿으면 "여럿이 같은 사건을 확인했다"가
       성립하지 않는다. SQL `earthus_earth_event_doubt_not_confirmed` 와 같은 방향이다.
    """
    verdict = truth.judge(source_kind=SOURCE_KIND,
                          independence_count=independence_count,
                          data_state=data_state, has_source=True)
    if place_doubt and verdict["corroborated"]:
        verdict = dict(verdict)
        verdict["corroborated"] = False
        verdict["reasons"] = list(verdict["reasons"]) + [
            "위치가 의심스러워 교차검증을 붙이지 않는다(placeDoubt)"]
    return verdict


# ── 10 EARTH_EVENT ─────────────────────────────────────────────────────────
def representative(members):
    """대표 레코드. **점수로 고르지 않는다** — 상류 점수는 우리가 만든 등급이 아니고,
    회차마다 흔들린다. 정렬 규칙만 쓴다: 제목이 있는 것 우선 → source_event_id 순.
    그래야 같은 묶음이면 회차와 무관하게 같은 대표가 나온다(결정 ④ 안정성).
    """
    return sorted(members, key=lambda r: (r.get("title") is None,
                                          str(r.get("source_event_id") or "")))[0]


def title_for(record):
    """제목. 없으면 **분류 + 지명 라벨**을 쓴다 — 헤드라인을 지어내지 않는다.

    실측: 150건 중 6건에 제목이 없다(상류가 GKG 에서 못 찾으면 넣지 않는다).
    SQL `earthus_earth_event.title` 은 not null 이므로 무언가는 있어야 하고,
    그 무언가는 사실 라벨이어야 한다.
    """
    if record.get("title"):
        return record["title"], "ARTICLE"
    label = ((record.get("kind_label") or {}).get("ko")
             or (record.get("kind_label") or {}).get("en"))
    place = (record.get("place") or {}).get("name")
    parts = [p for p in (label, place) if p]
    if parts:
        return " · ".join(parts), "LABEL"
    return "제목 없음", "NONE"


def assemble_event(members, *, envelope, freshness, dedup_result, sources):
    """묶음 하나 → EarthEvent 하나. SQL `earthus_earth_event` 칸 이름을 그대로 쓴다."""
    head = representative(members)
    place = head.get("place") or {}
    time = head.get("time") or {}

    independence = independence_for(members, dedup_result, sources)
    doubt = any((r.get("place") or {}).get("doubt") for r in members)
    verdict = judge_truth(independence_count=independence["count"],
                          data_state=freshness["dataState"], place_doubt=doubt)
    gated, official_safety = gate_claims(members)
    evidence = evidence_for(members, dedup_result)
    title, title_source = title_for(head)

    # 11 EVENT_ID — 못 만들면 실패다. 임의 id 로 채우지 않는다.
    try:
        identity = eid.describe(event_type=head.get("event_type"),
                                place_key=place.get("placeKey"),
                                time_bucket_iso=time.get("time_bucket"))
    except eid.EventIdError as exc:
        raise AssemblyError("event_id 를 만들 수 없다: %s" % exc) from exc

    lat, lon = place.get("lat"), place.get("lon")
    if lat is None or lon is None:
        lat = lon = None                       # 한쪽만 있는 좌표는 0도로 찍힌다

    return {
        "event_id": identity["eventId"],
        "event_key_version": identity["eventKeyVersion"],
        "kind": str(head.get("event_type") or "").split(":")[-1] or None,
        # ⚠️ 이 값의 어휘는 GDELT root(`DIS` 또는 CAMEO 대분류)다. SQL 주석이 말하는
        #    TC/EQ/FLOOD 어휘가 아니다 — 그 어휘로 옮기는 검증된 분류기가 없다.
        "kind_vocabulary": "gdelt-root",
        "kind_label": head.get("kind_label"),
        # 66종 레지스트리와 맞추는 규칙이 아직 없다. 지어내지 않고 비운다.
        "phenomenon_id": None,
        "title": title,
        "title_source": title_source,
        "where_text": place.get("name"),
        "latitude": lat,
        "longitude": lon,
        "location_precision": place.get("precision") or "NONE",
        "location_doubt": bool(doubt),
        # 시각 4분법 — 정확 시각을 모른다. retrieved_at 만 안다.
        "occurred_at": None,
        "issued_at": None,
        "updated_at": None,
        "retrieved_at": envelope.get("generated"),
        "time_bucket": time.get("time_bucket"),
        "time_precision": time.get("precision"),
        "source_age_min": time.get("source_age_min"),
        "lifecycle": LIFECYCLE,
        "truth_status": verdict["truthStatus"],
        "corroborated": verdict["corroborated"],
        "truth_reasons": verdict["reasons"],
        "data_state": freshness["dataState"],
        # 기관이 준 등급만 넣는다. GDELT 는 등급을 주지 않는다.
        "severity": None,
        "source_system": SOURCE_SYSTEM,
        "source_event_id": head.get("source_event_id"),
        "revision": 0,
        "independence_count": independence["count"],
        "independence": independence,
        "official_safety": bool(official_safety),
        # 12 — 항상 SHADOW. 승격은 3G 의 일이 아니다(결정 ⑨).
        "release_state": "SHADOW",
        "public_release_allowed": public_release_allowed("SHADOW"),
        "claims": gated,
        "evidence": evidence,
        "members": [{"sourceEventId": r.get("source_event_id"),
                     "eventTypeDetail": r.get("event_type_detail"),
                     "placeKey": (r.get("place") or {}).get("placeKey"),
                     "crossCheck": r.get("cross_check")} for r in members],
        "identity": identity,
    }


# ── 12 CANONICAL_OUTPUT ────────────────────────────────────────────────────
def canonical_document(event, *, envelope, freshness, raw=None):
    """S3 에 올라갈 정본 문서. 읽는 사람이 무엇을 못 믿어야 하는지까지 적는다.

    `raw` 는 원자료 보관 결과다. **계보의 다른 쪽 끝**이라서 정본에 박아 둔다 —
    정본만 남고 재료를 못 찾으면 판정 기준이 바뀌었을 때 다시 계산할 수 없다.
    """
    raw = raw or {}
    document = {
        "schema": CANONICAL_SCHEMA,
        "eventId": event["event_id"],
        "eventKeyVersion": event["event_key_version"],
        "releaseState": event["release_state"],
        "visibility": "PRIVATE",
        "event": {k: v for k, v in event.items() if k not in ("identity", "evidence",
                                                              "claims", "independence")},
        "identity": event["identity"],
        "independence": event["independence"],
        "claims": event["claims"],
        "evidence": event["evidence"],
        "input": {
            "key": INPUT_KEY,
            "generated": envelope.get("generated"),
            "sourceFile": envelope.get("source_file"),
            "source": envelope.get("source"),
            "license": envelope.get("license"),
            "termsUrl": envelope.get("terms_url"),
            "windowHours": envelope.get("window_hours"),
            # 계보 — 이 정본을 만든 원자료. 판정 기준이 바뀌면 여기서 다시 계산한다.
            "rawObject": raw.get("object"),
            "rawSha256": raw.get("sha256"),
            "sourceSha256": raw.get("sourceSha256"),
            # 잘린 입력이면 이 산출물은 "그때 있던 전부"가 아니다.
            "truncated": freshness["truncated"],
            "truncatedNote": ("상류가 maxEvents=%s 로 잘랐다 — 이 배치는 그 시각의 전부가 아니다"
                              % freshness["maxEvents"]) if freshness["truncated"] else None,
            "upstreamCounts": freshness["counts"],
            "provenance": freshness["provenance"],
        },
        "limits": [
            "정확 발생시각을 모른다 — time_bucket 은 3시간 버킷의 시작이고 사건 시각이 아니다",
            "상류가 기사를 이미 병합했다(merged) — 우리가 보는 기사 수는 GDELT 가 본 것보다 적다",
            "독립 출처 계열표가 없어 매체 도메인을 독립 단위로 쓴다",
        ],
    }
    if not eid.is_event_id(document["eventId"]):
        raise AssemblyError("정본에 우리 형식이 아닌 event_id 가 들어갔다")
    if document["releaseState"] != "SHADOW":
        raise AssemblyError("3G 산출물은 SHADOW 여야 한다: %s" % document["releaseState"])
    return document


# ── 13 CANONICAL_WRITE ─────────────────────────────────────────────────────
def write_canonical(documents, *, mode, writer=None, allow_live=False):
    """정본을 쓴다. **STAGING 이 기본이고 LIVE 는 거부된다.**

    `writer(key, body)` 를 주입받는다. 주지 않으면 아무것도 쓰지 않고 계획만 돌려준다 —
    `AWS_WRITE = 0` 을 코드로 보장하는 자리다.
    """
    if mode not in WRITE_MODES:
        raise AssemblyError("mode 는 %s 중 하나여야 한다: %r" % (WRITE_MODES, mode))
    if mode == LIVE and not allow_live:
        raise LiveWriteRefused(
            "운영 쓰기는 이번 승인 범위가 아니다 — mode=STAGING 으로 실행한다")

    plan, written = [], 0
    for document in documents:
        key = canonical_key(document["eventId"])
        assert_not_public(key)
        body = canonical_json(document)
        entry = {"key": key, "bytes": len(body), "sha256": sha256_hex(body),
                 "eventId": document["eventId"], "schema": document["schema"],
                 "written": False}
        if writer is not None:
            writer(key, body)
            entry["written"] = True
            written += 1
        plan.append(entry)
    return {"mode": mode, "count": len(plan), "written": written,
            "wroteNothing": written == 0, "objects": plan}


# ── 15 INDEX_CONSISTENCY ───────────────────────────────────────────────────
def index_rows(objects, events, *, written_at):
    """색인에 넣을 행. 아직 Postgres 에 적용하지 않는다 — 대조용 투영이다."""
    by_event = {e["event_id"]: e for e in events}
    rows = []
    for entry in objects:
        event = by_event[entry["eventId"]]
        rows.append({
            "eventId": entry["eventId"],
            "canonicalS3Key": entry["key"],
            "canonicalSha256": entry["sha256"],
            "canonicalSchema": entry["schema"],
            "canonicalWrittenAt": written_at,
            "releaseState": event["release_state"],
            "truthStatus": event["truth_status"],
            "independenceCount": event["independence_count"],
            "locationDoubt": event["location_doubt"],
            "timelineRefs": [],
        })
    return rows


def check_index(objects, events, *, written_at):
    """`index_consistency.check` 를 FIXTURE 모드로 돌린다.

    ⚠️ FIXTURE PASS 는 운영 PASS 가 아니다. `require_live()` 가 그것을 거부한다 —
       이 결과를 운영 근거로 쓰지 않는다.
    """
    canonical = {entry["key"]: {"eventId": entry["eventId"], "sha256": entry["sha256"],
                               "schema": entry["schema"]} for entry in objects}
    rows = index_rows(objects, events, written_at=written_at)
    return index_consistency.check(canonical, rows, index_consistency.FIXTURE), rows


# ── 전체 ───────────────────────────────────────────────────────────────────
def assemble(document, *, now_epoch, source_body=None, mode=STAGING,
             writer=None, allow_live=False, policy=None):
    """16 단계를 순서대로. 실패는 예외로 올라가고, 그때 산출물은 만들어지지 않는다."""
    stages = {}

    # 1 INPUT
    stages["INPUT"] = {
        "key": INPUT_KEY,
        "bytes": len(source_body) if source_body is not None else None,
        "sha256": sha256_hex(source_body) if source_body is not None else None,
    }

    # 2 FRESHNESS
    freshness = check_freshness(document, now_epoch=now_epoch)
    stages["FRESHNESS"] = freshness

    # 3 NORMALIZE
    # ⚠️ 정규화 실패는 조립 실패다. `NormalizeError` 를 그대로 올려 보내면 호출자가
    #    `AssemblyError` 만 잡고 있다가 놓친다 — 놓치면 실패가 조용히 빈 결과가 된다.
    try:
        normalized = norm.normalize(document, generated_epoch=freshness["generatedEpoch"])
    except norm.NormalizeError as exc:
        raise AssemblyError("정규화 실패로 조립을 중단한다: %s" % exc) from exc
    envelope, records = normalized["envelope"], normalized["records"]
    stages["NORMALIZE"] = {
        "records": len(records),
        "withTitle": sum(1 for r in records if r.get("title")),
        "withPlaceId": sum(1 for r in records
                           if (r.get("place") or {}).get("basis") == "PLACE_ID"),
        "placeDoubt": sum(1 for r in records if (r.get("place") or {}).get("doubt")),
        "timePrecision": _tally(r["time"]["precision"] for r in records),
    }

    # 정상 empty — 실패가 아니다. 산출물은 사건 0건의 배치다.
    if not records:
        stages["SOURCE_RELATION"] = {"rows": 0}
        stages["ARTICLE_DEDUP"] = {"articles": 0, "groups": 0}
        stages["EVENT_FUSION"] = {"groups": 0}
        stages["CLAIM_EVIDENCE"] = {"evidenceNodes": 0, "claimsAllowed": 0}
        stages["INDEPENDENCE"] = {"events": 0}
        stages["TRUTH_STATUS"] = {}
        stages["EARTH_EVENT"] = {"events": 0}
        stages["EVENT_ID"] = {"unique": 0}
        stages["CANONICAL_OUTPUT"] = {"documents": 0}
        # 사건이 0건이어도 **원자료는 보관한다** — "그 시각에 상류가 0건을 보냈다"는 것도
        # 사실이고, 나중에 재계산할 때 그 사실이 필요하다.
        stages["RAW_ARCHIVE"] = archive_raw(
            document, source_body=source_body, generated_iso=envelope.get("generated"),
            mode=mode, writer=writer, allow_live=allow_live)
        stages["CANONICAL_WRITE"] = write_canonical([], mode=mode, writer=writer,
                                                    allow_live=allow_live)
        consistency, rows = check_index([], [], written_at=envelope.get("generated"))
        stages["INDEX_CONSISTENCY"] = consistency
        stages["HEALTH"] = _health(stages, empty_reason="입력에 사건이 0건이다(정상 empty)")
        return {"schema": SCHEMA, "stages": stages, "events": [], "documents": [],
                "indexRows": rows, "envelope": envelope}

    # 4 SOURCE_RELATION
    sources = build_sources(records)
    stages["SOURCE_RELATION"] = {
        "rows": len(sources["rows"]),
        "articlesWithSource": len(sources["articleSource"]),
    }

    # 5 ARTICLE_DEDUP
    articles, dedup_result = run_dedup(records)
    stages["ARTICLE_DEDUP"] = {
        "articles": dedup_result["counts"]["articles"],
        "groups": dedup_result["counts"]["groups"],
        "duplicates": dedup_result["counts"]["duplicates"],
        "conflicts": dedup_result["counts"]["conflicts"],
        "batchIndependenceUnits": dedup.independence_units(dedup_result),
        "relations": _tally(entry["relation"] for entry in dedup_result["articles"].values()),
    }

    # 6 EVENT_FUSION
    fused = run_fusion(records, policy)
    groups, reconciled = reconcile_identity(fused)
    stages["EVENT_FUSION"] = {
        "inputRecords": len(records),
        "fusionGroups": len(fused),
        # 같은 신원을 가진 묶음을 합친 횟수. 0 이면 결합과 신원이 어긋난 곳이 없었다는 뜻이다.
        "identityReconciled": reconciled,
        "groups": len(groups),
        "merged": sum(1 for g in groups if len(g) > 1),
        "largest": max((len(g) for g in groups), default=0),
        "policy": {"maxHours": fusion.DEFAULT_MAX_HOURS,
                   "maxMeters": fusion.DEFAULT_MAX_METERS,
                   "mergeScore": fusion.DEFAULT_MERGE_SCORE},
    }

    # 7‥11 — 사건별 조립
    events = [assemble_event(members, envelope=envelope, freshness=freshness,
                             dedup_result=dedup_result, sources=sources)
              for members in groups]

    stages["CLAIM_EVIDENCE"] = {
        "evidenceNodes": sum(len(e["evidence"]) for e in events),
        "claimsAllowed": sum(len(e["claims"]["allowed"]) for e in events),
        "claimsRefused": sum(len(e["claims"]["refused"]) for e in events),
        "officialSafety": sum(1 for e in events if e["official_safety"]),
    }
    stages["INDEPENDENCE"] = {
        "events": len(events),
        "distribution": _tally(str(e["independence_count"]) for e in events),
        "unresolvedArticles": sum(len(e["independence"]["unresolved"]) for e in events),
        "corroborated": sum(1 for e in events if e["corroborated"]),
    }
    stages["TRUTH_STATUS"] = _tally(e["truth_status"] for e in events)

    # 같은 사건이 두 정본을 갖지 못한다 — id 가 겹치면 실패다.
    # `reconcile_identity()` 가 앞에서 같은 신원을 합쳤으므로 여기서 겹치는 일은 없어야 한다.
    # 그래도 남겨 둔다 — 신원 규칙이 바뀌었는데 이 문이 없으면 조용히 덮어쓰기가 된다.
    ids = [e["event_id"] for e in events]
    if len(set(ids)) != len(ids):
        collided = sorted({i for i in ids if ids.count(i) > 1})
        raise AssemblyError("event_id 충돌 %d건 — 같은 사건이 정본 둘을 갖게 된다: %s"
                            % (len(collided), collided[:3]))
    stages["EARTH_EVENT"] = {
        "events": len(events),
        "titleSource": _tally(e["title_source"] for e in events),
        "locationDoubt": sum(1 for e in events if e["location_doubt"]),
        "withPoint": sum(1 for e in events if e["latitude"] is not None),
        "releaseState": _tally(e["release_state"] for e in events),
    }
    stages["EVENT_ID"] = {
        "unique": len(set(ids)),
        "prefix": eid.ID_PREFIX,
        "hex": eid.ID_HEX,
        "eventKeyVersion": eid.EVENT_KEY_VERSION,
        "timeBucketHours": eid.TIME_BUCKET_HOURS,
    }

    # 12 RAW_ARCHIVE — 정본보다 먼저. 여기서 실패하면 정본을 쓰지 않는다(§12).
    raw = archive_raw(document, source_body=source_body,
                      generated_iso=envelope.get("generated"),
                      mode=mode, writer=writer, allow_live=allow_live)
    stages["RAW_ARCHIVE"] = raw
    if raw.get("object") is None:
        raise AssemblyError("원자료를 보관하지 못했다 — 정본을 쓰지 않는다: %s"
                            % raw.get("reason"))

    # 13 CANONICAL_OUTPUT
    documents = [canonical_document(e, envelope=envelope, freshness=freshness, raw=raw)
                 for e in events]
    stages["CANONICAL_OUTPUT"] = {
        "documents": len(documents),
        "schema": CANONICAL_SCHEMA,
        "visibility": _tally(d["visibility"] for d in documents),
        "publicReleaseAllowed": sum(1 for e in events if e["public_release_allowed"]),
        "rawObject": raw["object"],
        "lineageComplete": all(d["input"]["rawObject"] for d in documents),
    }

    # 14 CANONICAL_WRITE
    stages["CANONICAL_WRITE"] = write_canonical(documents, mode=mode, writer=writer,
                                                allow_live=allow_live)

    # 15 INDEX_CONSISTENCY
    consistency, rows = check_index(stages["CANONICAL_WRITE"]["objects"], events,
                                    written_at=envelope.get("generated"))
    stages["INDEX_CONSISTENCY"] = consistency

    # 16 HEALTH
    stages["HEALTH"] = _health(stages)
    return {"schema": SCHEMA, "stages": stages, "events": events,
            "documents": documents, "indexRows": rows, "envelope": envelope}


def _tally(values):
    out = {}
    for value in values:
        key = str(value)
        out[key] = out.get(key, 0) + 1
    return dict(sorted(out.items()))


def _health(stages, empty_reason=None):
    """건강 상태. 통과했다고 적을 수 있는 것만 적는다."""
    consistency = stages.get("INDEX_CONSISTENCY") or {}
    write = stages.get("CANONICAL_WRITE") or {}
    raw = stages.get("RAW_ARCHIVE") or {}
    # 상태 3분법 (§12). PARTIAL 은 "쓸 것을 다 못 썼다" 이고, 실패는 예외로 이미 빠져나갔다.
    planned = len((write.get("objects") or ()))
    if write.get("written", 0) == 0 and planned and not raw.get("written"):
        status = "SUCCESS"                 # dryRun — 계획만 만들었다
    elif write.get("written", 0) == planned and (raw.get("written") or not raw.get("object")):
        status = "SUCCESS"
    else:
        status = "PARTIAL"
    return {
        "status": status,
        "stages": list(STAGES),
        # HEALTH 자신은 아직 stages 에 들어가지 않았다 — 이 함수가 그것을 만들고 있다.
        "stagesRun": [name for name in STAGES if name in stages or name == "HEALTH"],
        "publicWrites": 0,
        "awsWrites": 0 if (write.get("wroteNothing") and not raw.get("written")) else None,
        "writeMode": write.get("mode"),
        "canonicalWritten": write.get("written", 0),
        "canonicalPlanned": planned,
        "rawObject": raw.get("object"),
        "rawWritten": bool(raw.get("written")),
        "rawSha256": raw.get("sha256"),
        "indexConsistency": consistency.get("status"),
        # FIXTURE 로 얻은 PASS 다. 운영 근거가 아니다.
        "indexConsistencyMode": consistency.get("mode"),
        "normalEmpty": bool(empty_reason),
        "emptyReason": empty_reason,
        "truncatedInput": (stages.get("FRESHNESS") or {}).get("truncated"),
    }

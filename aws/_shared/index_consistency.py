# -*- coding: utf-8 -*-
"""S3 정본 ↔ Postgres 색인 일관성 검사 — PHASE 3 STEP 4.

정본은 S3 다 (docs/EARTHUS_STORAGE_ARCHITECTURE.md §0.3). 색인은 파생이다.
그래서 불일치가 나오면 **S3 를 옳다고 보고 색인을 다시 만든다.** 이 파일은 그 판정만 한다 —
고치지 않고, 지우지 않고, 쓰지 않는다.

자격증명을 요구하지 않는다
  판독기를 주입받는다. 픽스처면 딕셔너리 두 개, 운영이면 boto3·psycopg 어댑터를 넣는다.
  그래서 AWS·Supabase 없이 전체 판정 로직을 시험할 수 있다.

⚠️⚠️ **mock PASS 를 production PASS 로 쓰지 않는다.**
  `mode` 는 필수 인자이고 결과에 박힌다. FIXTURE 로 돌린 PASS 를 운영 근거로 쓰려면
  `require_live(result)` 를 지나야 하고, 그 함수는 FIXTURE 결과를 **예외로 거부한다.**
  이 파일에는 mode 기본값이 없다 — 잊고 안 적으면 TypeError 가 난다.
"""

CONSISTENCY_SCHEMA = "earthus.index-consistency.v1"

FIXTURE, LIVE = "FIXTURE", "LIVE"
MODES = (FIXTURE, LIVE)

PASS, PARTIAL, FAIL = "PASS", "PARTIAL", "FAIL"

# 읽을 수 있는 정본 스키마. 새 판이 나오면 여기에 더한다 — 모르는 스키마를 통과시키지 않는다.
SUPPORTED_SCHEMAS = ("earthus.earth-event.v1",)

# 발견 종류와 그 무게.
#   BLOCKING     색인이 거짓말을 하고 있다. 그대로 서비스하면 안 된다 → FAIL
#   REBUILDABLE  S3 가 옳고 색인만 뒤처졌다. 다시 만들면 된다 → PARTIAL
BLOCKING = "BLOCKING"
REBUILDABLE = "REBUILDABLE"

FINDING_WEIGHT = {
    "ORPHAN_INDEX": BLOCKING,           # 색인이 없는 S3 객체를 가리킨다
    "CHECKSUM_MISMATCH": BLOCKING,      # 같은 키인데 내용이 다르다
    "EVENT_ID_MISMATCH": BLOCKING,      # 색인 행과 정본이 서로 다른 사건이라고 말한다
    "DUPLICATE_CANONICAL": BLOCKING,    # 한 사건이 정본 객체 둘을 갖는다
    "DUPLICATE_INDEX": BLOCKING,        # 한 사건이 색인 행 둘을 갖는다
    "UNSUPPORTED_SCHEMA": BLOCKING,     # 우리가 못 읽는 판이다
    "DANGLING_REFERENCE": BLOCKING,     # 타임라인이 없는 실행·기사를 가리킨다
    "MISSING_INDEX": REBUILDABLE,       # 정본은 있는데 색인 행이 없다
    "MISSING_CHECKSUM": REBUILDABLE,    # 색인에 기준 해시가 비어 있다
}


class ConsistencyError(ValueError):
    """FIXTURE 결과를 운영 근거로 쓰려 했다."""


def _finding(kind, **fields):
    return {"kind": kind, "weight": FINDING_WEIGHT[kind], **fields}


def check(canonical, index, mode, references=None):
    """S3 정본과 색인을 대조한다.

    canonical : {s3_key: {"eventId":…, "sha256":…, "schema":…}}          S3 쪽 판독 결과
    index     : [{"eventId":…, "canonicalS3Key":…, "canonicalSha256":…,
                  "canonicalSchema":…, "timelineRefs":[…]}, …]           Postgres 쪽 판독 결과
    mode      : FIXTURE | LIVE   (필수. 기본값 없음)
    references: {"simulationRuns": {...}, "articles": {...}} 형태의 해소 가능 참조 집합.
                주지 않으면 참조 검사를 **건너뛴 것으로 기록한다** — 통과했다고 적지 않는다.

    반환 {schema, mode, status, counts, checks, findings}
    """
    if mode not in MODES:
        raise ValueError(f"mode 는 {MODES} 중 하나여야 한다: {mode!r}")
    canonical = dict(canonical or {})
    rows = list(index or [])
    findings = []

    # ── 사건 id 별로 양쪽을 모은다 ──────────────────────────────────────────
    canonical_by_event = {}
    for key, record in sorted(canonical.items()):
        event_id = (record or {}).get("eventId")
        if not event_id:
            findings.append(_finding("EVENT_ID_MISMATCH", canonicalS3Key=key, reason="정본 객체에 eventId 가 없다"))
            continue
        canonical_by_event.setdefault(event_id, []).append(key)

    for event_id, keys in sorted(canonical_by_event.items()):
        if len(keys) > 1:
            findings.append(_finding("DUPLICATE_CANONICAL", eventId=event_id, canonicalS3Keys=sorted(keys)))

    index_by_event = {}
    for row in rows:
        index_by_event.setdefault(row.get("eventId"), []).append(row)
    for event_id, group in sorted(index_by_event.items(), key=lambda kv: str(kv[0])):
        if len(group) > 1:
            findings.append(_finding("DUPLICATE_INDEX", eventId=event_id, rowCount=len(group)))

    # ── 색인 행마다: 가리키는 정본이 있는가, 같은 사건인가, 해시가 같은가 ──
    for row in rows:
        event_id, key = row.get("eventId"), row.get("canonicalS3Key")
        record = canonical.get(key)
        if record is None:
            findings.append(_finding("ORPHAN_INDEX", eventId=event_id, canonicalS3Key=key))
            continue
        if record.get("eventId") != event_id:
            findings.append(_finding("EVENT_ID_MISMATCH", eventId=event_id, canonicalS3Key=key,
                                     canonicalEventId=record.get("eventId")))
        expected = row.get("canonicalSha256")
        if not expected:
            findings.append(_finding("MISSING_CHECKSUM", eventId=event_id, canonicalS3Key=key))
        elif expected != record.get("sha256"):
            findings.append(_finding("CHECKSUM_MISMATCH", eventId=event_id, canonicalS3Key=key,
                                     indexSha256=expected, canonicalSha256=record.get("sha256")))
        schema = row.get("canonicalSchema") or record.get("schema")
        if schema not in SUPPORTED_SCHEMAS:
            findings.append(_finding("UNSUPPORTED_SCHEMA", eventId=event_id, canonicalS3Key=key, schema=schema))
        elif record.get("schema") and row.get("canonicalSchema") and record["schema"] != row["canonicalSchema"]:
            findings.append(_finding("UNSUPPORTED_SCHEMA", eventId=event_id, canonicalS3Key=key,
                                     schema=row["canonicalSchema"], canonicalSchema=record["schema"],
                                     reason="색인과 정본이 다른 스키마를 말한다"))

    # ── 정본에는 있는데 색인에 없는 것 (되만들 수 있다) ─────────────────────
    indexed_keys = {row.get("canonicalS3Key") for row in rows}
    for key, record in sorted(canonical.items()):
        if key not in indexed_keys:
            findings.append(_finding("MISSING_INDEX", eventId=(record or {}).get("eventId"), canonicalS3Key=key))

    # ── 참조 해소: 타임라인이 가리키는 실행·기사가 실제로 있는가 ────────────
    reference_checked = references is not None
    if reference_checked:
        known = {"simulationRuns": set(references.get("simulationRuns") or ()),
                 "articles": set(references.get("articles") or ())}
        for row in rows:
            for ref in row.get("timelineRefs") or ():
                bucket = "simulationRuns" if ref.get("kind") == "SIMULATION" else "articles"
                value = ref.get("ref")
                if value and value not in known[bucket]:
                    findings.append(_finding("DANGLING_REFERENCE", eventId=row.get("eventId"),
                                             refKind=ref.get("kind"), ref=value))

    blocking = [f for f in findings if f["weight"] == BLOCKING]
    status = FAIL if blocking else (PARTIAL if findings else PASS)
    return {
        "schema": CONSISTENCY_SCHEMA,
        "mode": mode,
        "status": status,
        "counts": {"canonical": len(canonical), "indexRows": len(rows),
                   "findings": len(findings), "blocking": len(blocking)},
        "checks": {
            "indexPointsToCanonical": True,
            "eventIdMatches": True,
            "noOrphanIndex": True,
            "noDuplicateCanonicalEvent": True,
            "schemaCompatible": True,
            "checksumConsistent": True,
            # 참조 집합을 주지 않았으면 "검사했다"고 적지 않는다.
            "referenceConsistent": reference_checked,
        },
        "findings": findings,
    }


def require_live(result):
    """운영 판정으로 쓰기 전에 지나야 하는 문. FIXTURE 결과는 거부한다."""
    if result.get("mode") != LIVE:
        raise ConsistencyError(
            f"mode={result.get('mode')} 결과는 운영 근거가 될 수 없다. "
            "실제 S3·Postgres 판독기로 mode=LIVE 로 다시 돌려라.")
    if result.get("status") != PASS:
        raise ConsistencyError(f"운영 일관성 검사가 {result.get('status')} 다: "
                               f"{[f['kind'] for f in result.get('findings', [])]}")
    return result


def rebuild_plan(result):
    """색인만 다시 만들면 되는 것과, 사람이 봐야 하는 것을 갈라 준다.

    S3 가 정본이므로 REBUILDABLE 은 기계가 해결할 수 있다. BLOCKING 은 그렇지 않다 —
    색인이 정본과 다른 사건·다른 내용을 말하고 있으므로 왜 그렇게 됐는지부터 봐야 한다.
    """
    return {
        "reindex": sorted({f.get("canonicalS3Key") for f in result["findings"]
                           if f["weight"] == REBUILDABLE and f.get("canonicalS3Key")}),
        "needsHuman": [f for f in result["findings"] if f["weight"] == BLOCKING],
    }

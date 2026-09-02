"""객체 메타데이터 계보 — 결측은 채우고, 불일치는 덮어쓰지 않는다.

특허 관점의 핵심: 파편 분류가 이름 패턴 추론('...DEB')이 아니라 출처가 명시된
사실이어야 한다. 이 스위트는 그 사실이 어디서 왔는지 원문 아티팩트까지 추적
가능하며, 나중에 온 소스가 기존 사실을 조용히 갈아치울 수 없음을 고정한다.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from backend.database import get_db_session
from backend.domain.object_identity import ObjectIdentityResolver
from backend.ingestion.celestrak import celestrak_omm_uri
from backend.ingestion.errors import IdentityConflictError
from backend.ingestion.models import CanonicalObject, FetchedOmmDocument, ParsedOmmRecord
from backend.ingestion.providers.base import ObjectSelector, SourcePolicy
from backend.ingestion.ratelimit import PolicyDecision
from backend.ingestion.repository import (
    MetadataIdentityGateBypassed,
    SqlIngestionRepository,
    _record_metadata_provenance,
)
from backend.ingestion.service import IngestionService, ProviderRegistry
from backend.ingestion.storage import RawArtifactStore


def _record(catalog_id: str, *, name: str, object_type: str | None, cospar: str) -> dict:
    payload = {
        "OBJECT_NAME": name,
        "OBJECT_ID": cospar,
        "EPOCH": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f"),
        "MEAN_MOTION": 14.31,
        "ECCENTRICITY": 0.0021,
        "INCLINATION": 98.2,
        "RA_OF_ASC_NODE": 44.1,
        "ARG_OF_PERICENTER": 61.0,
        "MEAN_ANOMALY": 12.0,
        "EPHEMERIS_TYPE": 0,
        "CLASSIFICATION_TYPE": "U",
        "NORAD_CAT_ID": int(catalog_id),
        "ELEMENT_SET_NO": 999,
        "REV_AT_EPOCH": 100,
        "BSTAR": 0.0002,
        "MEAN_MOTION_DOT": 0.00001,
        "MEAN_MOTION_DDOT": 0,
    }
    if object_type is not None:
        payload["OBJECT_TYPE"] = object_type
    return payload


class RecordedProvider:
    """Serve one recorded response for a chosen source id (no network)."""

    def __init__(self, source_id: str, payload: dict) -> None:
        self.source_id = source_id
        self.payload = payload
        self.policy = SourcePolicy(source_id, 3600, 3600, source_id != "celestrak_gp")

    def request_uri(self, selector: ObjectSelector) -> str:
        return f"recorded://{self.source_id}/{selector.catalog_id}"

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        return FetchedOmmDocument(
            source_id=self.source_id,
            source_uri=self.request_uri(selector),
            retrieved_at=datetime.now(UTC),
            content=json.dumps([self.payload]).encode("utf-8"),
            media_type="application/json",
        )


class AlwaysFetchCoordinator:
    """Never serve a cache decision: each test wants the full ingest path."""

    async def acquire(self, policy, request_fingerprint, now):
        del policy, request_fingerprint, now
        return PolicyDecision("FETCH")

    async def record_success(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def record_rate_limited(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def record_unavailable(self, *args: object, **kwargs: object) -> None:
        del args, kwargs


async def _ingest(provider: RecordedProvider, catalog_id: str, tmp_path) -> None:
    repository = SqlIngestionRepository()
    service = IngestionService(
        provider=None,
        repository=repository,
        artifact_store=RawArtifactStore(tmp_path / "raw"),
        registry=ProviderRegistry({provider.source_id: provider}),
        coordinator=AlwaysFetchCoordinator(),
        identity_resolver=ObjectIdentityResolver(repository),
    )
    await service.ingest(provider.source_id, catalog_id)


async def _revisions(catalog_id: str) -> list[dict]:
    async with get_db_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT field_name, previous_value, incoming_value, outcome,"
                    " source_id, reason FROM object_metadata_revision"
                    " WHERE object_id = (SELECT id FROM space_object WHERE catalog_id = :cid)"
                    " ORDER BY created_at, field_name"
                ),
                {"cid": catalog_id},
            )
        ).mappings().all()
    return [dict(row) for row in rows]


async def _fresh_catalog_id(base: int) -> str:
    """A catalog id verified to be absent from space_object right now.

    Each test used to draw ``base + uuid4().int % 900`` and assume it was new.
    The database is persistent and the suite has run hundreds of times, so a
    900-wide band collides: the second ingest then met a pre-existing row and
    ``assert len(conflicts) == 1`` found two. The test failed for a reason that
    had nothing to do with what it was testing, and only inside a full run,
    which is the hardest kind of failure to read.

    Absence is now checked rather than assumed.
    """
    for _ in range(200):
        candidate = str(base + uuid.uuid4().int % 900)
        async with get_db_session() as session:
            taken = (
                await session.execute(
                    text("SELECT 1 FROM space_object WHERE catalog_id = :cid"),
                    {"cid": candidate},
                )
            ).first()
        if taken is None:
            return candidate
    raise AssertionError(
        f"no unused catalog id in the {base}-{base + 899} band; the test data has "
        "filled it and the band needs widening"
    )


async def _object_row(catalog_id: str) -> dict:
    async with get_db_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT catalog_id, canonical_name, cospar_id, object_type"
                    " FROM space_object WHERE catalog_id = :cid"
                ),
                {"cid": catalog_id},
            )
        ).mappings().one()
    return dict(row)


@pytest.mark.integration
async def test_absent_classification_is_filled_and_attributed(tmp_path):
    """CelesTrak은 OBJECT_TYPE을 말하지 않고 Space-Track은 말한다."""
    catalog_id = await _fresh_catalog_id(320000)

    # 1) CelesTrak 계열: 분류 없음 -> UNKNOWN 으로 생성된다.
    await _ingest(RecordedProvider("celestrak_gp", _record(catalog_id, name="PROV DEB A", object_type=None, cospar=f"2090-{catalog_id[-3:]}A")), catalog_id, tmp_path)
    assert (await _object_row(catalog_id))["object_type"] == "UNKNOWN"

    # 2) Space-Track 계열: 분류를 선언하므로 결측이 채워진다.
    await _ingest(RecordedProvider("spacetrack_gp", _record(catalog_id, name="PROV DEB A", object_type="DEBRIS", cospar=f"2090-{catalog_id[-3:]}A")), catalog_id, tmp_path)

    assert (await _object_row(catalog_id))["object_type"] == "DEBRIS"
    revisions = await _revisions(catalog_id)
    adopted = [r for r in revisions if r["field_name"] == "object_type" and r["outcome"] == "ADOPTED"]
    assert len(adopted) == 1
    assert adopted[0]["previous_value"] == "UNKNOWN"
    assert adopted[0]["incoming_value"] == "DEBRIS"
    assert adopted[0]["source_id"] == "spacetrack_gp"
    # 확증도 기록된다 — 동의 역시 증거다.
    assert any(r["outcome"] == "CONFIRMED" for r in revisions)


@pytest.mark.integration
async def test_disagreement_is_preserved_not_overwritten(tmp_path):
    """나중에 온 소스가 기존 사실을 조용히 갈아치울 수 없다."""
    catalog_id = await _fresh_catalog_id(321000)

    await _ingest(RecordedProvider("spacetrack_gp", _record(catalog_id, name="PROV DEB B", object_type="DEBRIS", cospar=f"2091-{catalog_id[-3:]}B")), catalog_id, tmp_path)
    assert (await _object_row(catalog_id))["object_type"] == "DEBRIS"

    # 다른 소스가 상충하는 분류를 주장한다.
    await _ingest(RecordedProvider("celestrak_gp", _record(catalog_id, name="PROV DEB B", object_type="PAYLOAD", cospar=f"2091-{catalog_id[-3:]}B")), catalog_id, tmp_path)

    # 저장값은 유지되고, 불일치는 증거로 남는다.
    assert (await _object_row(catalog_id))["object_type"] == "DEBRIS"
    conflicts = [
        r for r in await _revisions(catalog_id)
        if r["field_name"] == "object_type" and r["outcome"] == "CONFLICT"
    ]
    assert len(conflicts) == 1
    assert conflicts[0]["previous_value"] == "DEBRIS"
    assert conflicts[0]["incoming_value"] == "PAYLOAD"
    assert "kept" in conflicts[0]["reason"]


@pytest.mark.integration
async def test_metadata_lineage_is_append_only(tmp_path):
    """계보는 과학 기록과 같이 고쳐 쓸 수 없다."""
    catalog_id = await _fresh_catalog_id(322000)
    await _ingest(RecordedProvider("spacetrack_gp", _record(catalog_id, name="PROV DEB C", object_type="ROCKET BODY", cospar=f"2092-{catalog_id[-3:]}C")), catalog_id, tmp_path)

    async with get_db_session() as session:
        with pytest.raises(Exception, match="append-only"):
            await session.execute(
                text(
                    "UPDATE object_metadata_revision SET outcome = 'ADOPTED'"
                    " WHERE object_id = (SELECT id FROM space_object WHERE catalog_id = :cid)"
                ),
                {"cid": catalog_id},
            )


@pytest.mark.integration
async def test_provenance_reaches_the_raw_artifact(tmp_path):
    """'왜 DEBRIS인가'에 원문 아티팩트까지 답할 수 있어야 한다."""
    catalog_id = await _fresh_catalog_id(323000)
    await _ingest(RecordedProvider("spacetrack_gp", _record(catalog_id, name="PROV DEB D", object_type="DEBRIS", cospar=f"2093-{catalog_id[-3:]}D")), catalog_id, tmp_path)

    async with get_db_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT r.outcome, ra.content_sha256, ra.source_uri, ra.source_id"
                    " FROM object_metadata_revision r"
                    " JOIN raw_artifact ra ON ra.id = r.raw_artifact_id"
                    " WHERE r.field_name = 'object_type'"
                    "   AND r.object_id = (SELECT id FROM space_object WHERE catalog_id = :cid)"
                ),
                {"cid": catalog_id},
            )
        ).mappings().one()
    # 이 객체는 이 소스가 처음 만들었으므로 확립(ESTABLISHED)이다 — 다른 소스가
    # 확증한 것처럼 적으면 계보가 스스로를 과장한다.
    assert row["outcome"] == "ESTABLISHED"
    assert len(row["content_sha256"]) == 64
    assert row["source_id"] == "spacetrack_gp"


@pytest.mark.integration
async def test_classification_is_not_credited_to_a_silent_artifact(tmp_path):
    """분류는 그것을 선언한 응답에만 귀속된다.

    적대 감사(2026-09-01)가 잡은 결함의 회귀 방지: object_type 을 최신 궤도해의
    아티팩트 해시 옆에 실어 보내면, OBJECT_TYPE 을 말한 적 없는 CelesTrak 응답이
    분류의 근거로 지목된다.
    """
    from backend.ingestion.repository import SqlIngestionRepository as _Repo

    catalog_id = await _fresh_catalog_id(324000)
    # Space-Track 이 분류를 선언하고,
    await _ingest(RecordedProvider("spacetrack_gp", _record(catalog_id, name="PROV DEB E", object_type="DEBRIS", cospar=f"2094-{catalog_id[-3:]}E")), catalog_id, tmp_path)
    # 그 뒤 CelesTrak 이 (분류 없이) 더 최신 궤도해를 남긴다.
    await _ingest(RecordedProvider("celestrak_gp", _record(catalog_id, name="PROV DEB E", object_type=None, cospar=f"2094-{catalog_id[-3:]}E")), catalog_id, tmp_path)

    payload = await _Repo().get_object(catalog_id)
    assert payload["object_type"] == "DEBRIS"
    stated = payload["metadata_provenance"]["fields"]["object_type"]
    assert stated["stated_by"] == "spacetrack_gp"
    # 최신 궤도해는 CelesTrak 이지만 분류의 근거로 지목되어서는 안 된다.
    assert payload["provenance"]["source_ids"] == ["celestrak_gp"]
    assert stated["input_artifact_hash"] not in payload["provenance"]["input_artifact_hashes"]


@pytest.mark.integration
async def test_same_source_repeat_is_not_read_as_corroboration(tmp_path):
    """한 소스의 메아리를 교차 확증으로 적지 않는다."""
    catalog_id = await _fresh_catalog_id(325000)
    payload = _record(catalog_id, name="PROV DEB F", object_type="DEBRIS", cospar=f"2095-{catalog_id[-3:]}F")
    await _ingest(RecordedProvider("spacetrack_gp", payload), catalog_id, tmp_path)
    # 같은 소스가 다시 수집한다 (다른 아티팩트가 되도록 내용을 미세 변경).
    again = dict(payload)
    again["MEAN_ANOMALY"] = 12.5
    await _ingest(RecordedProvider("spacetrack_gp", again), catalog_id, tmp_path)

    outcomes = {r["outcome"] for r in await _revisions(catalog_id) if r["field_name"] == "object_type"}
    assert "SAME_SOURCE_REAFFIRMED" in outcomes
    assert "CONFIRMED" not in outcomes


@pytest.mark.integration
async def test_reprocessing_the_same_artifact_does_not_inflate_lineage(tmp_path):
    """같은 아티팩트 재처리가 계보 행 수를 부풀리지 않는다."""
    catalog_id = await _fresh_catalog_id(326000)
    payload = _record(catalog_id, name="PROV DEB G", object_type="ROCKET BODY", cospar=f"2096-{catalog_id[-3:]}G")
    provider = RecordedProvider("spacetrack_gp", payload)
    await _ingest(provider, catalog_id, tmp_path)
    first = len(await _revisions(catalog_id))
    # 동일 내용 = 동일 SHA-256 = 동일 아티팩트로 다시 수집.
    await _ingest(provider, catalog_id, tmp_path)
    assert len(await _revisions(catalog_id)) == first


class LegacyRecordedProvider:
    """P0-shaped CelesTrak provider: no registry, no identity resolver behind it."""

    def __init__(self, payload: dict) -> None:
        self.payload = payload

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        return FetchedOmmDocument(
            source_id="celestrak_gp",
            source_uri=f"recorded://legacy/celestrak_gp/{catalog_id}",
            retrieved_at=datetime.now(UTC),
            content=json.dumps([self.payload]).encode("utf-8"),
            media_type="application/json",
        )


async def _ingest_legacy(payload: dict, catalog_id: str, tmp_path) -> None:
    """Construct the service the way the pre-registry wiring did."""
    service = IngestionService(
        LegacyRecordedProvider(payload),
        SqlIngestionRepository(),
        RawArtifactStore(tmp_path / "raw-legacy"),
    )
    await service.ingest_catalog_id(catalog_id)


# ---------------------------------------------------------------------------
# 적대 감사 2차(2026-09-01) 지적 1: cospar_id x CONFLICT 는 사문이었다.
# ---------------------------------------------------------------------------


@pytest.mark.integration
async def test_cospar_disagreement_is_an_identity_conflict_not_a_metadata_dispute(tmp_path):
    """COSPAR 불일치는 신원 층에서 격리되며 메타데이터 충돌로 기록되지 않는다."""
    catalog_id = await _fresh_catalog_id(327000)
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(
                catalog_id,
                name="PROV DEB H",
                object_type="DEBRIS",
                cospar=f"2097-{catalog_id[-3:]}H",
            ),
        ),
        catalog_id,
        tmp_path,
    )

    # 같은 카탈로그 번호에 다른 COSPAR 를 주장한다.
    with pytest.raises(IdentityConflictError):
        await _ingest(
            RecordedProvider(
                "celestrak_gp",
                _record(
                    catalog_id,
                    name="PROV DEB H",
                    object_type="DEBRIS",
                    cospar=f"2098-{catalog_id[-3:]}Z",
                ),
            ),
            catalog_id,
            tmp_path,
        )

    # 저장값은 그대로이고, 다툼은 identity_conflict 로만 존재한다.
    assert (await _object_row(catalog_id))["cospar_id"] == f"2097-{catalog_id[-3:]}H"
    assert not [
        r
        for r in await _revisions(catalog_id)
        if r["field_name"] == "cospar_id" and r["outcome"] == "CONFLICT"
    ]
    async with get_db_session() as session:
        conflict_count = await session.scalar(
            text(
                "SELECT count(*) FROM identity_conflict"
                " WHERE existing_object_id = (SELECT id FROM space_object WHERE catalog_id = :cid)"
                "   AND conflict_type = 'CATALOG_CONFLICTING_COSPAR'"
            ),
            {"cid": catalog_id},
        )
    assert conflict_count == 1


@pytest.mark.integration
async def test_schema_refuses_the_unreachable_cospar_conflict_combination(tmp_path):
    """마이그레이션 015: 약속을 도달 가능한 조합으로 좁혔다.

    012 의 CHECK 는 3필드 x 전 결과값을 허용해, 실제로는 신원 층이 먼저 가져가는
    COSPAR 다툼까지 메타데이터 층이 방어하는 것처럼 보이게 했다.
    """
    catalog_id = await _fresh_catalog_id(328000)
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(
                catalog_id,
                name="PROV DEB I",
                object_type="DEBRIS",
                cospar=f"2099-{catalog_id[-3:]}I",
            ),
        ),
        catalog_id,
        tmp_path,
    )

    async with get_db_session() as session:
        with pytest.raises(Exception, match="cospar_conflict_unreachable"):
            await session.execute(
                text(
                    "INSERT INTO object_metadata_revision ("
                    "  object_id, field_name, previous_value, incoming_value, outcome,"
                    "  reason, source_id, raw_artifact_id, declared_at"
                    ") SELECT r.object_id, 'cospar_id', 'A', 'B', 'CONFLICT', 'forged',"
                    "  r.source_id, r.raw_artifact_id, r.declared_at"
                    " FROM object_metadata_revision r"
                    " WHERE r.object_id = (SELECT id FROM space_object WHERE catalog_id = :cid)"
                    " LIMIT 1"
                ),
                {"cid": catalog_id},
            )

    # 도달 가능한 조합은 그대로 허용된다 - 좁힌 것은 COSPAR 다툼 하나뿐이다.
    outcomes = {(r["field_name"], r["outcome"]) for r in await _revisions(catalog_id)}
    assert ("cospar_id", "ESTABLISHED") in outcomes


@pytest.mark.integration
async def test_metadata_lineage_fails_loudly_when_the_identity_gate_was_bypassed(tmp_path):
    """신원 게이트를 우회해 COSPAR 다툼이 도착하면 조용히 적지 않고 실패한다.

    해석기를 거치면 도달할 수 없는 상태를 직접 만들어 확인한다: 그 상황은
    이 레코드가 다른 객체에 붙기 직전이라는 뜻이므로 기록이 아니라 실패다.
    """
    catalog_id = await _fresh_catalog_id(329000)
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(
                catalog_id,
                name="PROV DEB J",
                object_type="DEBRIS",
                cospar=f"2080-{catalog_id[-3:]}J",
            ),
        ),
        catalog_id,
        tmp_path,
    )
    stored = await _object_row(catalog_id)
    async with get_db_session() as session:
        object_id, raw_artifact_id = (
            await session.execute(
                text(
                    "SELECT r.object_id::text, r.raw_artifact_id::text"
                    " FROM object_metadata_revision r"
                    " WHERE r.object_id = (SELECT id FROM space_object WHERE catalog_id = :cid)"
                    " LIMIT 1"
                ),
                {"cid": catalog_id},
            )
        ).one()

        matched = CanonicalObject(
            id=object_id,
            catalog_id=catalog_id,
            cospar_id=stored["cospar_id"],
            canonical_name=stored["canonical_name"],
            object_type=stored["object_type"],
        )
        record = ParsedOmmRecord(
            catalog_id=catalog_id,
            object_name=stored["canonical_name"],
            international_designator="1999-999ZZ",  # 저장값과 다른 COSPAR
            object_type=stored["object_type"],
            epoch=datetime.now(UTC),
            frame="TEME",
            time_system="UTC",
            theory="SGP4",
            mean_elements={},
            covariance=None,
            quality_grade="PUBLIC_GP",
            limitations=(),
        )
        with pytest.raises(MetadataIdentityGateBypassed):
            await _record_metadata_provenance(
                session,
                matched,
                record=record,
                source_id="celestrak_gp",
                raw_artifact_id=raw_artifact_id,
                created=False,
            )


# ---------------------------------------------------------------------------
# 지적 2: 메타데이터 충돌이 어떤 상태값에도 노출되지 않았다.
# ---------------------------------------------------------------------------


@pytest.mark.integration
async def test_disputed_metadata_is_surfaced_as_an_explicit_status(tmp_path):
    """다투어지는 값이 확정된 값처럼 제공되지 않는다."""
    catalog_id = await _fresh_catalog_id(330000)
    cospar = f"2081-{catalog_id[-3:]}K"
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(catalog_id, name="PROV DEB K", object_type="DEBRIS", cospar=cospar),
        ),
        catalog_id,
        tmp_path,
    )
    settled = await SqlIngestionRepository().get_object(catalog_id)
    assert settled["metadata_status"] == "CONSISTENT"
    assert settled["disputed_metadata_fields"] == []

    await _ingest(
        RecordedProvider(
            "celestrak_gp",
            _record(catalog_id, name="PROV DEB K", object_type="PAYLOAD", cospar=cospar),
        ),
        catalog_id,
        tmp_path,
    )

    payload = await SqlIngestionRepository().get_object(catalog_id)
    # 신원은 멀집하다 - 그래서 identity_status 만으로는 이 다툼을 알 수 없었다.
    assert payload["identity_status"] == "CANONICAL"
    assert payload["metadata_status"] == "DISPUTED"
    assert payload["disputed_metadata_fields"] == ["object_type"]
    assert payload["metadata_provenance"]["status"] == "DISPUTED"


@pytest.mark.integration
async def test_dispute_names_both_claims_and_the_artifact_that_made_them(tmp_path):
    """'preserved for review' 가 가리킬 리뷰 지점이 실제로 존재한다."""
    catalog_id = await _fresh_catalog_id(331000)
    cospar = f"2082-{catalog_id[-3:]}L"
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(catalog_id, name="PROV DEB L", object_type="ROCKET BODY", cospar=cospar),
        ),
        catalog_id,
        tmp_path,
    )
    await _ingest(
        RecordedProvider(
            "celestrak_gp",
            _record(catalog_id, name="PROV DEB L", object_type="PAYLOAD", cospar=cospar),
        ),
        catalog_id,
        tmp_path,
    )

    payload = await SqlIngestionRepository().get_object(catalog_id)
    disputes = payload["metadata_provenance"]["disputes"]
    assert [d["field"] for d in disputes] == ["object_type"]
    dispute = disputes[0]
    assert dispute["stored_value"] == "ROCKET BODY"
    claim = dispute["competing_claims"][0]
    assert claim["value"] == "PAYLOAD"
    assert claim["claimed_by"] == "celestrak_gp"
    assert claim["input_artifact_hash"].startswith("sha256:")
    assert len(claim["input_artifact_hash"]) == len("sha256:") + 64
    # 제공되는 값은 여전히 저장값이며, 그 사실이 명시된다.
    assert payload["object_type"] == "ROCKET BODY"
    assert "DISPUTED" in payload["metadata_provenance"]["note"]


# ---------------------------------------------------------------------------
# 지적 3: 레거시 persist_record 가 계보 없이 메타데이터를 덮어썼다.
# ---------------------------------------------------------------------------


@pytest.mark.integration
async def test_legacy_path_records_lineage_for_what_it_establishes(tmp_path):
    """레지스트리 없는 P0 경로도 계보를 남긴다."""
    catalog_id = await _fresh_catalog_id(332000)
    await _ingest_legacy(
        _record(
            catalog_id, name="LEGACY M", object_type="DEBRIS", cospar=f"2083-{catalog_id[-3:]}M"
        ),
        catalog_id,
        tmp_path,
    )

    revisions = await _revisions(catalog_id)
    assert {r["field_name"] for r in revisions} == {"object_type", "cospar_id", "canonical_name"}
    assert {r["outcome"] for r in revisions} == {"ESTABLISHED"}
    assert {r["source_id"] for r in revisions} == {"celestrak_gp"}


@pytest.mark.integration
async def test_legacy_path_cannot_overwrite_a_stated_value_without_a_trace(tmp_path):
    """배선이 바뀌어도 불변식은 흔적 없이 깨지지 않는다.

    이전 구현의 ON CONFLICT DO UPDATE 는 canonical_name 을 COALESCE 로 갈아치우고
    object_metadata_revision 에는 아무것도 쓰지 않았다.
    """
    catalog_id = await _fresh_catalog_id(333000)
    cospar = f"2084-{catalog_id[-3:]}N"
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(catalog_id, name="ESTABLISHED NAME", object_type="DEBRIS", cospar=cospar),
        ),
        catalog_id,
        tmp_path,
    )

    # 레거시 경로가 다른 이름을 들고 온다.
    await _ingest_legacy(
        _record(catalog_id, name="LEGACY RENAME", object_type="DEBRIS", cospar=cospar),
        catalog_id,
        tmp_path,
    )

    assert (await _object_row(catalog_id))["canonical_name"] == "ESTABLISHED NAME"
    conflicts = [
        r
        for r in await _revisions(catalog_id)
        if r["field_name"] == "canonical_name" and r["outcome"] == "CONFLICT"
    ]
    assert len(conflicts) == 1
    assert conflicts[0]["previous_value"] == "ESTABLISHED NAME"
    assert conflicts[0]["incoming_value"] == "LEGACY RENAME"
    assert conflicts[0]["source_id"] == "celestrak_gp"
    payload = await SqlIngestionRepository().get_object(catalog_id)
    assert payload["metadata_status"] == "DISPUTED"


@pytest.mark.integration
async def test_legacy_path_fails_instead_of_attaching_a_conflicting_cospar(tmp_path):
    """신원 해석기가 없는 경로는 COSPAR 다툼을 격리할 수 없으므로 명시적으로 실패한다."""
    catalog_id = await _fresh_catalog_id(334000)
    original_cospar = f"2085-{catalog_id[-3:]}O"
    await _ingest(
        RecordedProvider(
            "spacetrack_gp",
            _record(catalog_id, name="LEGACY O", object_type="DEBRIS", cospar=original_cospar),
        ),
        catalog_id,
        tmp_path,
    )

    with pytest.raises(MetadataIdentityGateBypassed):
        await _ingest_legacy(
            _record(
                catalog_id, name="LEGACY O", object_type="DEBRIS", cospar=f"2086-{catalog_id[-3:]}X"
            ),
            catalog_id,
            tmp_path,
        )

    # 값은 그대로이고, 실행은 실패로 남는다 - 원문 아티팩트는 보존된다.
    assert (await _object_row(catalog_id))["cospar_id"] == original_cospar
    fingerprint = hashlib.sha256(celestrak_omm_uri(catalog_id).encode("utf-8")).hexdigest()
    async with get_db_session() as session:
        status = await session.scalar(
            text(
                "SELECT status FROM ingestion_run"
                " WHERE request_fingerprint = :fp ORDER BY started_at DESC LIMIT 1"
            ),
            {"fp": fingerprint},
        )
    assert status == "FAILED"

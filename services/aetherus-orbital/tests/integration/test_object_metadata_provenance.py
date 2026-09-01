"""객체 메타데이터 계보 — 결측은 채우고, 불일치는 덮어쓰지 않는다.

특허 관점의 핵심: 파편 분류가 이름 패턴 추론('...DEB')이 아니라 출처가 명시된
사실이어야 한다. 이 스위트는 그 사실이 어디서 왔는지 원문 아티팩트까지 추적
가능하며, 나중에 온 소스가 기존 사실을 조용히 갈아치울 수 없음을 고정한다.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from backend.database import get_db_session
from backend.domain.object_identity import ObjectIdentityResolver
from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.providers.base import ObjectSelector, SourcePolicy
from backend.ingestion.ratelimit import PolicyDecision
from backend.ingestion.repository import SqlIngestionRepository
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
    catalog_id = str(320000 + uuid.uuid4().int % 900)

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
    catalog_id = str(321000 + uuid.uuid4().int % 900)

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
    catalog_id = str(322000 + uuid.uuid4().int % 900)
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
    catalog_id = str(323000 + uuid.uuid4().int % 900)
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

    catalog_id = str(324000 + uuid.uuid4().int % 900)
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
    catalog_id = str(325000 + uuid.uuid4().int % 900)
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
    catalog_id = str(326000 + uuid.uuid4().int % 900)
    payload = _record(catalog_id, name="PROV DEB G", object_type="ROCKET BODY", cospar=f"2096-{catalog_id[-3:]}G")
    provider = RecordedProvider("spacetrack_gp", payload)
    await _ingest(provider, catalog_id, tmp_path)
    first = len(await _revisions(catalog_id))
    # 동일 내용 = 동일 SHA-256 = 동일 아티팩트로 다시 수집.
    await _ingest(provider, catalog_id, tmp_path)
    assert len(await _revisions(catalog_id)) == first

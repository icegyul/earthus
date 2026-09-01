"""P1 partial parsing preserves raw bytes and quarantines each rejected row."""

import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from backend.domain.object_identity import ObjectIdentityResolver
from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.providers.base import ObjectSelector, SourcePolicy
from backend.ingestion.ratelimit import PolicyDecision
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import IngestionService, ProviderRegistry
from backend.ingestion.storage import RawArtifactStore

pytestmark = pytest.mark.integration


class PartialProvider:
    policy = SourcePolicy("celestrak_gp", 7200, 7200, False)

    def request_uri(self, selector: ObjectSelector) -> str:
        return f"https://example.test/celestrak/{selector.catalog_id}"

    async def fetch_current(self, selector: ObjectSelector) -> FetchedOmmDocument:
        content = json.dumps(
            [
                {
                    "NORAD_CAT_ID": selector.catalog_id,
                    "OBJECT_NAME": "PARTIAL TEST OBJECT",
                    "OBJECT_ID": "P1-PARTIAL",
                    "OBJECT_TYPE": "PAYLOAD",
                    "EPOCH": "2026-08-24T00:00:00Z",
                    "MEAN_MOTION": 15.0,
                    "ECCENTRICITY": 0.0,
                    "INCLINATION": 0.0,
                    "RA_OF_ASC_NODE": 0.0,
                    "ARG_OF_PERICENTER": 0.0,
                    "MEAN_ANOMALY": 0.0,
                },
                {"NORAD_CAT_ID": "not-a-decimal-id"},
            ]
        ).encode()
        return FetchedOmmDocument(
            source_id="celestrak_gp",
            source_uri=self.request_uri(selector),
            retrieved_at=datetime(2026, 8, 24, tzinfo=UTC),
            content=content,
            media_type="application/json",
        )


class FetchCoordinator:
    async def acquire(
        self, policy: SourcePolicy, request_fingerprint: str, now: datetime
    ) -> PolicyDecision:
        del policy, request_fingerprint, now
        return PolicyDecision("FETCH")

    async def record_success(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def record_rate_limited(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def record_unavailable(self, *args: object, **kwargs: object) -> None:
        del args, kwargs


@pytest.mark.asyncio
async def test_partial_document_persists_valid_record_and_rejection(db_session, tmp_path) -> None:
    repository = SqlIngestionRepository()
    service = IngestionService(
        provider=None,
        repository=repository,
        artifact_store=RawArtifactStore(tmp_path),
        registry=ProviderRegistry({"celestrak_gp": PartialProvider()}),
        coordinator=FetchCoordinator(),
        identity_resolver=ObjectIdentityResolver(repository),
    )

    result = await service.ingest("celestrak_gp", "123456789")

    rejection_count = await db_session.scalar(
        text(
            """
            SELECT count(*) FROM ingestion_record_rejection
            WHERE ingestion_run_id = CAST(:run_id AS uuid)
            """
        ),
        {"run_id": result.ingestion_run_id},
    )
    assert result.status == "PARTIAL"
    assert result.record_count == 1
    assert result.rejected_record_count == 1
    assert rejection_count == 1

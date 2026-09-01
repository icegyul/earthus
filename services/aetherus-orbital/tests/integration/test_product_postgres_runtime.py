from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier
from uuid import uuid4

import psycopg2
import pytest

try:
    from aetherus_product.postgres_storage import PostgresProductRepository
except ModuleNotFoundError:
    PostgresProductRepository = None  # type: ignore[assignment,misc]


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        pytest.skip("DATABASE_URL is required")
    return url


def _psycopg_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def test_product_records_survive_repository_restart_and_are_append_only() -> None:
    assert PostgresProductRepository is not None, "PostgreSQL product repository is not implemented"
    url = _database_url()
    key = f"P6-{uuid4()}"
    now = datetime.now(UTC)

    repo = PostgresProductRepository(url)
    created = repo.append_record(
        domain="ORBIT",
        record_type="PHASE_RUNTIME",
        entity_key=key,
        payload={"phase": "P6", "state": "EXECUTED"},
        observed_at=now,
        evidence_class="DERIVED",
        validation_state="RESEARCH_ONLY",
    )
    repo.close()

    reopened = PostgresProductRepository(url)
    stored = reopened.latest_record("ORBIT", "PHASE_RUNTIME", key)
    assert stored is not None
    assert stored["id"] == created["id"]
    assert stored["payload"] == {"phase": "P6", "state": "EXECUTED"}
    reopened.close()

    connection = psycopg2.connect(_psycopg_url(url))
    try:
        with pytest.raises(psycopg2.Error):
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE aetherus_product.product_record SET validation_state='VALIDATED' WHERE id=%s",
                    (created["id"],),
                )
        connection.rollback()
    finally:
        connection.close()


def test_p6_p12_artifacts_use_their_dedicated_postgres_tables() -> None:
    assert PostgresProductRepository is not None, "PostgreSQL product repository is not implemented"
    url = _database_url()
    suffix = uuid4().hex
    now = datetime.now(UTC)
    repo = PostgresProductRepository(url)
    try:
        genealogy = repo.append_genealogy_link(
            child_key=f"CHILD-{suffix}",
            parent_key=f"PARENT-{suffix}",
            origin_status="KNOWN",
            provenance={"evidence_id": f"E-{suffix}"},
        )
        fragmentation = repo.append_fragmentation_run(
            parent_key=f"PARENT-{suffix}",
            seed=17,
            model_version="fragmentation-test-v1",
            validation_state="RESEARCH_ONLY",
            output_hash=f"fragment-{suffix}",
            payload={"fragment_count": 2},
        )
        observation = repo.append_observation_record(
            object_key=f"OBJECT-{suffix}",
            observed_at=now,
            observer_class="STAGING_TEST",
            qa_state="ACCEPTED",
            evidence_class="OBSERVED",
            license_policy="CC-BY-4.0",
            payload_hash=f"observation-{suffix}",
            payload={"value": 1.25},
        )
        protect = repo.append_protect_ranking(
            protected_entity_key=f"OBJECT-{suffix}",
            generated_at=now,
            model_version="ocm-test-v1",
            ranking_hash=f"ranking-{suffix}",
            ranked_candidates=[{"candidate_id": "C1", "score": 0.8}],
            provenance={"mode": "COUNTERFACTUAL"},
        )
        dataset = repo.append_dataset_manifest(
            dataset_key=f"DATASET-{suffix}",
            version="1",
            content_hash=f"dataset-{suffix}",
            license_policy="CC-BY-4.0",
            provenance={"records": 1},
        )
        job = repo.upsert_job_run(
            job_key=f"JOB-{suffix}",
            idempotency_key=f"IDEMPOTENCY-{suffix}",
            status="SUCCEEDED",
            attempts=1,
            payload={"result_hash": suffix},
        )
        audit = repo.append_audit_event(
            tenant_id=f"TENANT-{suffix}",
            actor_id="TESTER",
            action="PHASE_EXECUTE",
            target_type="PHASE",
            target_id="P12",
            trace_id=suffix,
            payload={"status": "PASS"},
        )
    finally:
        repo.close()

    assert all(item["id"] for item in (genealogy, fragmentation, observation, protect, dataset, job, audit))


def test_product_runtime_selects_postgres_only_when_explicitly_enabled(monkeypatch, tmp_path) -> None:
    assert PostgresProductRepository is not None, "PostgreSQL product repository is not implemented"
    from aetherus_product import AetherusProductRuntime

    monkeypatch.setenv("AETHERUS_PRODUCT_POSTGRES", "1")
    monkeypatch.setenv("DATABASE_URL", _database_url())
    runtime = AetherusProductRuntime(db_path=str(tmp_path / "foundation.sqlite"), raw_root=tmp_path / "raw")
    try:
        assert isinstance(runtime.product_store, PostgresProductRepository)
        assert runtime.product_store.latest_universe(runtime.universe_session_id) is not None
    finally:
        if hasattr(runtime.product_store, "close"):
            runtime.product_store.close()
        runtime.repo.close()


def test_product_repository_serializes_concurrent_requests_on_shared_connection() -> None:
    """FastAPI sync endpoints share one repository across worker threads."""

    assert PostgresProductRepository is not None, "PostgreSQL product repository is not implemented"
    repo = PostgresProductRepository(_database_url())
    suffix = uuid4().hex
    barrier = Barrier(8)

    def append(index: int) -> dict:
        barrier.wait(timeout=5)
        return repo.append_record(
            domain="ORBIT",
            record_type="CONCURRENT_HTTP_SNAPSHOT",
            entity_key=f"{suffix}-{index}",
            payload={"request_index": index},
            observed_at=datetime.now(UTC),
            evidence_class="MODEL_SIGNAL",
            validation_state="SCREENING_ONLY",
        )

    try:
        with ThreadPoolExecutor(max_workers=8) as executor:
            created = list(executor.map(append, range(8)))
    finally:
        repo.close()

    assert len({row["id"] for row in created}) == 8

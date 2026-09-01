"""Golden fixture cross-validation against the real committed P1 raw snapshot."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import text

from backend.database import get_db_session
from backend.orbit.golden import (
    compare_within_tolerance,
    load_fixture,
    propagator_output_hash,
    recompute_fixture_samples,
)
from tests.integration.p5_real_seed import ingest_recorded_snapshot

FIXTURE_DIR = Path("tests/fixtures/golden")


def _fixture_paths() -> list[Path]:
    paths = sorted(FIXTURE_DIR.glob("p2_golden_*.json"))
    assert paths, "No committed golden fixtures were found"
    return paths


def test_golden_recomputation_matches_within_recorded_tolerance():
    for path in _fixture_paths():
        fixture = load_fixture(path)
        recomputed = recompute_fixture_samples(fixture)
        maxima = compare_within_tolerance(fixture, recomputed)
        for key, observed in maxima.items():
            limit = fixture["tolerance"][key]
            assert observed < limit, f"{path.name} {key}: {observed} >= {limit}"
        fresh_hash = propagator_output_hash(recomputed)
        assert fresh_hash == fixture["output_sha256"]


async def test_golden_fixture_chains_to_real_p1_raw_artifact_in_database(tmp_path):
    for path in _fixture_paths():
        fixture = load_fixture(path)
        sha256 = fixture["generated_from"]["raw_artifact_sha256"]
        await ingest_recorded_snapshot(
            Path("artifacts/raw/celestrak_gp") / f"{sha256}.json",
            tmp_path / "golden-raw",
        )
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT ra.id::text AS raw_artifact_id, ra.source_uri,
                           so.catalog_id
                    FROM raw_artifact AS ra
                    LEFT JOIN orbit_solution os ON os.source_artifact_id = ra.id
                    LEFT JOIN space_object so ON so.id = os.object_id
                    WHERE ra.content_sha256 = :hash
                    LIMIT 1
                    """
                ),
                {"hash": sha256},
            )
            row = result.mappings().one_or_none()
        assert row is not None, f"{path.name} does not chain to a persisted P1 artifact"
        assert row["catalog_id"] == fixture["input"]["catalog_id"]


def test_golden_fixture_input_elements_match_committed_snapshot_bytes():
    raw_dir = Path("artifacts/raw/celestrak_gp")
    available = {path.stem: path.read_bytes() for path in raw_dir.glob("*.json")}
    for path in _fixture_paths():
        fixture = load_fixture(path)
        sha256 = fixture["generated_from"]["raw_artifact_sha256"]
        assert sha256 in available, f"{sha256} missing from committed snapshots"
        content = available[sha256]
        assert hashlib.sha256(content).hexdigest() == sha256
        record = json.loads(content)[0]
        assert str(record["NORAD_CAT_ID"]) == fixture["input"]["catalog_id"]
        snapshot_epoch = datetime.fromisoformat(record["EPOCH"]).astimezone(UTC)
        fixture_epoch = datetime.fromisoformat(fixture["input"]["epoch"]).astimezone(UTC)
        assert snapshot_epoch == fixture_epoch
        assert float(record["MEAN_MOTION"]) == pytest.approx(
            fixture["input"]["mean_elements"]["mean_motion_rev_per_day"]
        )

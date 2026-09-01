"""SCREENING_RECOMPUTE_V1 physical counterfactual — end-to-end validation.

Unlike the legacy sim-seed corpus (metric values injected directly), every
number here flows through the real pipeline: recorded-style OMM ingestion ->
P4 screening over stored solutions -> operational baseline -> physical
counterfactual that re-runs the P4 physics with the target excluded.

Corpus geometry (all synthetic catalog ids, PUBLIC_GP grade):
  A(300001), B(300002), C(300003)  co-orbital at ~420 km, tiny phase offsets
                                   -> pairs A-B, A-C, B-C conjunct.
  E(300005), F(300006)             co-orbital at ~800 km -> pair E-F conjuncts,
                                   outside B's shell margin -> reusable region.
  D(300004)                        lone object at ~1400 km -> no edges.

REMOVE(B) must: drop exactly the B-incident edges, create no new edges,
attribute benefit to A and C only, agree numerically between the FULL and
AFFECTED_SUBGRAPH independent computation paths, and persist everything as
PUBLIC_SCREENING (never SIMULATION_ONLY).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from backend.benefit.models import METHOD_IDEALIZED, METHOD_PHYSICAL
from backend.benefit.repository import BenefitRepository
from backend.benefit.service import BenefitService
from backend.conjunction.service import ConjunctionService
from backend.database import get_db_session
from backend.ingestion.models import FetchedOmmDocument
from backend.ingestion.repository import SqlIngestionRepository
from backend.ingestion.service import IngestionService
from backend.ingestion.storage import RawArtifactStore

WINDOW_HOURS = 2.0

CORPUS = {
    # catalog_id: (name, mean_motion_rev_day, mean_anomaly_deg)
    "300001": ("PHYS-A", 15.495, 10.00),
    "300002": ("PHYS-B", 15.495, 10.01),
    "300003": ("PHYS-C", 15.495, 10.02),
    "300004": ("PHYS-D", 12.66, 40.00),
    "300005": ("PHYS-E", 14.28, 200.00),
    "300006": ("PHYS-F", 14.28, 200.01),
}


def _omm_record(catalog_id: str, epoch: datetime) -> dict:
    name, mean_motion, anomaly = CORPUS[catalog_id]
    return {
        "OBJECT_NAME": name,
        "OBJECT_ID": f"2026-{catalog_id[-3:]}A",
        "EPOCH": epoch.strftime("%Y-%m-%dT%H:%M:%S.%f"),
        "MEAN_MOTION": mean_motion,
        "ECCENTRICITY": 0.0005,
        "INCLINATION": 51.64,
        "RA_OF_ASC_NODE": 120.0,
        "ARG_OF_PERICENTER": 30.0,
        "MEAN_ANOMALY": anomaly,
        "EPHEMERIS_TYPE": 0,
        "CLASSIFICATION_TYPE": "U",
        "NORAD_CAT_ID": int(catalog_id),
        "ELEMENT_SET_NO": 999,
        "REV_AT_EPOCH": 1000,
        "BSTAR": 0.0001,
        "MEAN_MOTION_DOT": 0.00001,
        "MEAN_MOTION_DDOT": 0,
    }


class SyntheticCorpusProvider:
    """Recorded-style provider serving the deterministic physical corpus."""

    def __init__(self, epoch: datetime, retrieved_at: datetime) -> None:
        self.epoch = epoch
        self.retrieved_at = retrieved_at

    async def fetch_omm(self, catalog_id: str) -> FetchedOmmDocument:
        record = _omm_record(catalog_id, self.epoch)
        return FetchedOmmDocument(
            source_id="celestrak_gp",
            source_uri=f"recorded://physical-corpus/{catalog_id}",
            retrieved_at=self.retrieved_at,
            content=json.dumps([record]).encode("utf-8"),
            media_type="application/json",
        )


async def _seed_corpus(tmp_path) -> None:
    now = datetime.now(UTC)
    provider = SyntheticCorpusProvider(epoch=now - timedelta(minutes=30), retrieved_at=now)
    service = IngestionService(
        provider, SqlIngestionRepository(), RawArtifactStore(tmp_path / "raw")
    )
    for catalog_id in CORPUS:
        result = await service.ingest_catalog_id(catalog_id)
        assert result.object_id, f"corpus seed failed for {catalog_id}"


async def _run_status(run_id: str) -> dict:
    async with get_db_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT validation_state, status, data_status, result_hash,"
                    " reused_baseline_edge_count, scenario_edge_count,"
                    " baseline_edge_count, warnings_json"
                    " FROM scenario_run WHERE id = CAST(:run_id AS uuid)"
                ),
                {"run_id": run_id},
            )
        ).mappings().one()
    payload = dict(row)
    if isinstance(payload.get("warnings_json"), str):
        payload["warnings_json"] = json.loads(payload["warnings_json"])
    return payload


def _accounting(warnings: list[dict]) -> dict:
    entries = [w for w in warnings if w.get("code") == "PHYSICAL_RECOMPUTE_ACCOUNTING"]
    assert entries, "physical run must persist its recompute accounting"
    return entries[0]


@pytest.mark.integration
async def test_physical_remove_full_vs_affected_independent_equivalence(tmp_path):
    await _seed_corpus(tmp_path)

    screening = await ConjunctionService().run_screening(window_hours=WINDOW_HOURS)
    corpus_events = [
        event
        for event in screening["data"]["events"]
        if event["primary_catalog_id"] in CORPUS
        and event["secondary_catalog_id"] in CORPUS
    ]
    assert len(corpus_events) >= 4, (
        "corpus must physically produce at least A-B, A-C, B-C, E-F events; "
        f"got {[(e['primary_catalog_id'], e['secondary_catalog_id']) for e in corpus_events]}"
    )

    benefit = BenefitService()
    baseline = await benefit.build_baseline(horizon_hours=WINDOW_HOURS)
    assert baseline["data_status"] == "OK"
    baseline_id = baseline["data"]["baseline_snapshot_id"]

    scenario = await benefit.create_remove_scenario(
        target_ref="300002",
        baseline_snapshot_id=baseline_id,
        effective_time_raw=None,
        metric_types=None,
        recompute_mode="FULL",
    )
    scenario_id = scenario["data"]["scenario_id"]
    assert scenario["data"]["parameters"]["counterfactual_method"] == METHOD_PHYSICAL
    assert METHOD_PHYSICAL in scenario["data"]["assumptions"]

    full_run = await benefit.run_scenario(scenario_id, recompute_mode="FULL")
    fast_run = await benefit.run_scenario(scenario_id, recompute_mode="AFFECTED_SUBGRAPH")
    # Quarantined catalog residues fail SGP4 init and are honestly reported,
    # which downgrades an otherwise complete run to PARTIAL — accept both, but
    # only for that explicit reason.
    for run in (full_run, fast_run):
        assert run["data_status"] in ("OK", "PARTIAL"), run
        if run["data_status"] == "PARTIAL":
            assert run["status_reason"] == "COMPLETED_WITH_PROPAGATION_FAILURES"

    full_row = await _run_status(full_run["data"]["run_id"])
    fast_row = await _run_status(fast_run["data"]["run_id"])

    # (1) Independent-path numerical equivalence: same result hash from two
    # genuinely different computation paths.
    assert full_row["result_hash"] == fast_row["result_hash"]
    assert full_row["scenario_edge_count"] == fast_row["scenario_edge_count"]

    # (2) The paths are mechanically different: the affected run reuses the
    # physically-untouched E-F region instead of re-refining it.
    assert full_row["reused_baseline_edge_count"] == 0
    assert fast_row["reused_baseline_edge_count"] >= 1
    full_acct = _accounting(full_row["warnings_json"])
    fast_acct = _accounting(fast_row["warnings_json"])
    assert fast_acct["scenario_tca_refinements"] < full_acct["scenario_tca_refinements"]

    # (3) REMOVE physics: target edges gone, nothing invented.
    assert full_acct["removed_edges"] >= 2  # B-A and B-C at minimum
    assert full_acct["new_edges"] == 0
    assert fast_acct["new_edges"] == 0

    # (4) Physically derived results are operational-grade, not simulation.
    assert full_row["validation_state"] == "PUBLIC_SCREENING"
    assert fast_row["validation_state"] == "PUBLIC_SCREENING"

    # (5) Benefit attribution goes to B's physical neighbors only.
    benefits = await benefit.scenario_benefits(scenario_id)
    names = {
        row["catalog_id"]: row
        for row in benefits["data"]["beneficiaries"]
        if row["metric_type"] == "CONJUNCTION_EXPOSURE"
    }
    assert "300001" in names and "300003" in names, names.keys()
    assert all(cid not in names for cid in ("300004", "300005", "300006"))
    for row in names.values():
        assert row["benefit_value"] > 0.0
        assert row["baseline_value"] - row["scenario_value"] == row["benefit_value"]

    async with get_db_session() as session:
        benefit_states = (
            await session.execute(
                text(
                    "SELECT DISTINCT br.validation_state FROM benefit_result br"
                    " JOIN scenario_run sr ON sr.id = br.scenario_run_id"
                    " WHERE sr.scenario_id = CAST(:sid AS uuid)"
                ),
                {"sid": scenario_id},
            )
        ).scalars().all()
    assert benefit_states == ["PUBLIC_SCREENING"]

    # (6) Both counterfactual graphs are persisted with scenario provenance.
    async with get_db_session() as session:
        roles = (
            await session.execute(
                text(
                    "SELECT provenance_json->>'role' FROM baseline_graph_snapshot"
                    " WHERE provenance_json->>'scenario_id' = :sid"
                ),
                {"sid": scenario_id},
            )
        ).scalars().all()
    assert "SCENARIO_BASELINE_PRIME" in roles
    assert "SCENARIO_COUNTERFACTUAL" in roles


@pytest.mark.integration
async def test_idealized_stays_simulation_only_and_labeled(tmp_path):
    await _seed_corpus(tmp_path)
    await ConjunctionService().run_screening(window_hours=WINDOW_HOURS)
    benefit = BenefitService()
    baseline = await benefit.build_baseline(horizon_hours=WINDOW_HOURS)
    scenario = await benefit.create_remove_scenario(
        target_ref="300002",
        baseline_snapshot_id=baseline["data"]["baseline_snapshot_id"],
        effective_time_raw=None,
        metric_types=None,
        recompute_mode="FULL",
        counterfactual_method=METHOD_IDEALIZED,
    )
    assert "SIMULATION_ONLY: no physics is recomputed on this path." in (
        scenario["data"]["assumptions"]
    )
    run = await benefit.run_scenario(scenario["data"]["scenario_id"])
    row = await _run_status(run["data"]["run_id"])
    assert row["validation_state"] == "SIMULATION_ONLY"


@pytest.mark.integration
async def test_physical_edgeless_target_yields_honest_insufficient_data(tmp_path):
    """REMOVE of an edge-free object states the fact instead of inventing benefit."""
    await _seed_corpus(tmp_path)
    await ConjunctionService().run_screening(window_hours=WINDOW_HOURS)
    benefit = BenefitService()
    baseline = await benefit.build_baseline(horizon_hours=WINDOW_HOURS)

    scenario = await benefit.create_remove_scenario(
        target_ref="300004",  # D: propagable but zero incident edges
        baseline_snapshot_id=baseline["data"]["baseline_snapshot_id"],
        effective_time_raw=None,
        metric_types=None,
        recompute_mode="FULL",
    )
    run = await benefit.run_scenario(scenario["data"]["scenario_id"])
    assert run["data_status"] == "INSUFFICIENT_DATA"
    assert run["status_reason"] == "NO_BASELINE_EDGES_FOR_TARGET"
    benefits = await benefit.scenario_benefits(scenario["data"]["scenario_id"])
    assert benefits["data"]["beneficiary_count"] == 0

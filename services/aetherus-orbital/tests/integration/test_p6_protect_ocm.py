"""ORB-P6: PROTECT reverse ranking and candidate-OCM groups — end-to-end.

Built on the same physically-derived corpus as the P5 physical tests: every
ranking number and every removed/changed/new edge below comes out of the real
P4 pipeline re-run, never out of graph surgery.

Corpus (see test_p5_physical_counterfactual): A,B,C co-orbital at ~420 km
(pairs A-B, A-C, B-C conjunct), E,F co-orbital at ~800 km (pair E-F), D lone.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import text

from backend.benefit.service import BenefitService
from backend.conjunction.service import ConjunctionService
from backend.database import get_db_session
from tests.integration.test_p5_physical_counterfactual import (
    CORPUS,
    WINDOW_HOURS,
    _seed_corpus,
)


async def _prepare_baseline(tmp_path) -> tuple[BenefitService, str]:
    await _seed_corpus(tmp_path)
    await ConjunctionService().run_screening(window_hours=WINDOW_HOURS)
    benefit = BenefitService()
    baseline = await benefit.build_baseline(horizon_hours=WINDOW_HOURS)
    assert baseline["data_status"] == "OK"
    return benefit, baseline["data"]["baseline_snapshot_id"]


async def _scenario_row(scenario_id: str) -> dict:
    async with get_db_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT kind, target_object_id::text AS target,"
                    " protected_object_id::text AS protected"
                    " FROM intervention_scenario WHERE id = CAST(:sid AS uuid)"
                ),
                {"sid": scenario_id},
            )
        ).mappings().one()
    return dict(row)


@pytest.mark.integration
async def test_protect_ranking_orders_candidates_by_physical_benefit(tmp_path):
    benefit, baseline_id = await _prepare_baseline(tmp_path)

    # PROTECT A(300001): candidates must be exactly its physical neighbors B, C.
    result = await benefit.run_protect_ranking(
        protected_ref="300001", baseline_snapshot_id=baseline_id
    )
    assert result["data_status"] in ("OK", "PARTIAL")
    ranking = result["data"]["ranking"]
    catalogs = [row["candidate"]["catalog_id"] for row in ranking]
    assert set(catalogs) == {"300002", "300003"}, catalogs
    assert result["data"]["candidate_count"] == 2

    for row in ranking:
        # Each candidate removes exactly one A-incident pair -> exposure 1.0.
        assert row["benefits"]["CONJUNCTION_EXPOSURE"] == pytest.approx(1.0)
        assert row["new_edge_count"] == 0
        assert row["removed_edge_count"] >= 1
        assert row["scenario_graph_hash"]
    # Deterministic tie-break: equal benefit -> candidate id order.
    assert ranking[0]["rank"] == 1 and ranking[1]["rank"] == 2

    # Advisory wording is mandatory (P11 boundary preview).
    warning_codes = {w["code"] for w in result["warnings"]}
    assert "ADVISORY_ONLY" in warning_codes

    # Scenario persisted as kind=PROTECT with protected_object_id set, no target.
    scenario = await _scenario_row(result["data"]["scenario_id"])
    assert scenario["kind"] == "PROTECT"
    assert scenario["target"] is None
    assert scenario["protected"] is not None

    # Persisted benefit rows: beneficiary is always Y, candidate in provenance,
    # operational grade.
    async with get_db_session() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT br.validation_state, br.provenance_json"
                    " FROM benefit_result br WHERE br.scenario_run_id ="
                    " CAST(:rid AS uuid)"
                ),
                {"rid": result["data"]["run_id"]},
            )
        ).mappings().all()
    assert rows, "PROTECT must persist its ranking rows"
    for row in rows:
        assert row["validation_state"] == "PUBLIC_SCREENING"
        prov = row["provenance_json"]
        if isinstance(prov, str):
            prov = json.loads(prov)
        assert prov["query"] == "PROTECT"
        assert prov["candidate_object_id"]


@pytest.mark.integration
async def test_protect_edgeless_object_gets_honest_insufficient_data(tmp_path):
    benefit, baseline_id = await _prepare_baseline(tmp_path)
    result = await benefit.run_protect_ranking(
        protected_ref="300004", baseline_snapshot_id=baseline_id  # D: no edges
    )
    assert result["data_status"] == "INSUFFICIENT_DATA"
    assert result["status_reason"] == "NO_BASELINE_EDGES_FOR_PROTECTED"
    assert result["data"]["ranking"] == []


@pytest.mark.integration
async def test_ocm_group_reports_resolved_and_newly_created_edges(tmp_path):
    benefit, baseline_id = await _prepare_baseline(tmp_path)

    escape = {  # ~600 km: leaves A/C, approaches nobody
        "candidate_id": "raise-to-600km",
        "element_overrides": {"mean_motion_rev_per_day": 14.90},
    }
    reckless = {  # jumps into the E/F shell right between the pair
        "candidate_id": "into-ef-shell",
        "element_overrides": {
            "mean_motion_rev_per_day": CORPUS["300005"][1],
            "mean_anomaly_deg": 200.005,
        },
    }
    result = await benefit.run_ocm_group(
        target_ref="300002",
        candidates_payload=[escape, reckless],
        baseline_snapshot_id=baseline_id,
    )
    assert result["data_status"] in ("OK", "PARTIAL")
    assert result["data"]["nominal"]["target_risk"]["CONJUNCTION_EXPOSURE"] == (
        pytest.approx(2.0)  # B conjuncts A and C nominally
    )
    by_id = {e["candidate_id"]: e for e in result["data"]["candidates"]}

    clean = by_id["raise-to-600km"]
    assert clean["removed_edge_count"] >= 2  # A-B and B-C resolved
    assert clean["new_edge_count"] == 0
    assert clean["target_risk_delta"]["CONJUNCTION_EXPOSURE"] == pytest.approx(2.0)
    assert clean["objects_with_worsened_risk"] == []

    risky = by_id["into-ef-shell"]
    assert risky["removed_edge_count"] >= 2  # left A and C behind...
    assert risky["new_edge_count"] >= 1  # ...but created new E/F conjunctions
    worsened_catalogs = {
        w.get("catalog_id") for w in risky["objects_with_worsened_risk"]
    }
    assert worsened_catalogs & {"300005", "300006"}, risky[
        "objects_with_worsened_risk"
    ]

    warning_codes = {w["code"] for w in result["warnings"]}
    assert "ADVISORY_ONLY" in warning_codes
    assert "CANDIDATE_CREATES_NEW_CONJUNCTIONS" in warning_codes

    scenario = await _scenario_row(result["data"]["scenario_id"])
    assert scenario["kind"] == "CANDIDATE_OCM"

    # Candidate graphs persisted with their own roles and provenance.
    async with get_db_session() as session:
        roles = (
            await session.execute(
                text(
                    "SELECT provenance_json->>'role' FROM baseline_graph_snapshot"
                    " WHERE provenance_json->>'scenario_id' = :sid"
                ),
                {"sid": result["data"]["scenario_id"]},
            )
        ).scalars().all()
    assert roles.count("SCENARIO_OCM_CANDIDATE") == 2
    assert "SCENARIO_BASELINE_PRIME" in roles

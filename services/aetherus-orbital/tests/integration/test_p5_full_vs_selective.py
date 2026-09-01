"""BEN-003: full-vs-selective equivalence through the real service stack."""

import pytest

from tests.integration.p5_sim_seed import seed_simulation_baseline, simulation_edge

TOLERANCE = 1e-12


def _signature(payload):
    return sorted(
        (
            str(row["beneficiary_object_id"]),
            str(row["metric_type"]),
            round(float(row["baseline_value"]), 12),
            round(float(row["scenario_value"]), 12),
            round(float(row["benefit_value"]), 12),
        )
        for row in payload["data"]["beneficiaries"]
    )


class TestFullVsSelectiveEquivalence:
    async def test_ben003_equivalence_within_tolerance(
        self, benefit_repository, benefit_service
    ):
        catalog_ids = ("25544", "48274", "20580", "25994", "27424", "33591", "39084")
        resolved = []
        for catalog_id in catalog_ids:
            row = await benefit_repository.resolve_object(catalog_id)
            if row is not None:
                resolved.append((catalog_id, str(row["object_id"])))
        if len(resolved) < 7:
            pytest.skip("need seven stored canonical objects for the equivalence corpus")

        by_catalog = dict(resolved)
        a = by_catalog["25544"]  # target (ISS altitude band)
        b = by_catalog["48274"]
        c = by_catalog["20580"]
        d = by_catalog["25994"]
        e = by_catalog["27424"]
        f = by_catalog["33591"]
        g = by_catalog["39084"]

        # (first, second, exposure, pc) — far-band pairs (d,e),(e,f),(f,g),(d,g)
        # are deliberately disjoint from the target so selective recompute has
        # genuinely unaffected baseline edges to reuse.
        pairs = [
            (a, b, 1.0, 2.0e-4),
            (a, c, 1.0, 0.0),
            (b, c, 1.0, 3.0e-4),
            (c, d, 2.0, 0.0),
            (d, e, 1.0, 1.0e-4),
            (e, f, 2.0, 0.0),
            (f, g, 1.0, 4.0e-4),
            (d, g, 1.0, 0.0),
        ]
        edges = []
        for index, (first, second, exposure, pc) in enumerate(pairs):
            edges.append(
                simulation_edge(first, second, "CONJUNCTION_EXPOSURE", exposure, f"eq{index}")
            )
            if pc > 0.0:
                edges.append(simulation_edge(first, second, "PC", pc, f"eqp{index}"))
        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id="bg-test-ben003-v2",
            edges=edges,
            dataset="synthetic-remove-equivalence-v1",
        )
        scenario_id = await benefit_repository.create_scenario(
            kind="REMOVE",
            target_object_id=a,
            baseline_snapshot_id=baseline_id,
            effective_time=None,
            parameters={"dataset": "ben003"},
            assumptions=["IDEALIZED_REMOVAL"],
            requested_metrics=["CONJUNCTION_EXPOSURE", "PC", "MAX_PC"],
            model_version="p5-idealized-removal-v1",
            input_hash="sim-input-ben003",
        )

        full_run = await benefit_service.run_scenario(scenario_id, recompute_mode="FULL")
        fast_run = await benefit_service.run_scenario(
            scenario_id, recompute_mode="AFFECTED_SUBGRAPH"
        )

        assert full_run["data"]["run_status"] == "SUCCEEDED"
        assert fast_run["data"]["run_status"] == "SUCCEEDED"

        full_sig = _signature(full_run)
        fast_sig = _signature(fast_run)
        assert [row[:2] for row in full_sig] == [row[:2] for row in fast_sig]
        expected_beneficiaries = {b, c}
        assert {row[0] for row in full_sig} == expected_beneficiaries
        for full_row, fast_row in zip(full_sig, fast_sig, strict=True):
            for full_value, fast_value in zip(full_row[2:], fast_row[2:], strict=True):
                assert abs(full_value - fast_value) <= TOLERANCE

        # Science equality is stronger than tolerance: identical result hash.
        assert (
            full_run["provenance"]["result_hash"] == fast_run["provenance"]["result_hash"]
        )
        # Selective mode must actually reuse unaffected baseline edges: the
        # far-band kept edges touch no affected object.
        accounting = fast_run["data"]["edge_accounting"]
        affected_ids = {
            row["object_id"] for row in fast_run["data"]["affected_objects"]
        }
        expected_reused = sum(
            1
            for edge in edges
            if not edge.involves(a)
            and edge.object_a not in affected_ids
            and edge.object_b not in affected_ids
        )
        assert int(accounting["reused_baseline_edge_count"]) == expected_reused
        assert int(accounting["reused_baseline_edge_count"]) > 0
        assert int(accounting["baseline_edge_count"]) == len(edges)

        # Reason codes are disclosed per Master Spec F-8.
        reason_map = {
            row["object_id"]: row["reasons"]
            for row in full_run["data"]["affected_objects"]
        }
        assert "TARGET_SELF" in reason_map[a]
        assert "INCIDENT_NEIGHBOR" in reason_map[b]

        # Performance and physics accuracy stay separated.
        performance = {
            "full": full_run["data"]["performance"],
            "affected": fast_run["data"]["performance"],
        }
        for side in performance.values():
            assert int(side["compute_ms"]) >= 0
            assert int(side["peak_memory_bytes"]) >= 0

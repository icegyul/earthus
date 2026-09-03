"""A baseline built from the same inputs is not stored twice.

`risk_edge` held four million rows and 90% of the database because every call to
`build_baseline` wrote its whole edge set again. 1,397 baselines accumulated in
three days, ~3,000 edges each, append-only, and the inputs were usually
identical — the same P4 events and the same snapshots. Nothing ever looked for
the graph already sitting there.

At the observed rate that is 3 GB a day, which fills an ordinary 80 GB disk in
about three weeks. So this is not a storage-bill question; it is whether a
deployment survives its first month.

These tests hold both halves: an identical rebuild writes nothing, and a reused
answer says it was reused rather than passing an old graph off as a fresh one.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from backend.benefit.service import BenefitService
from backend.database import get_db_session

pytestmark = pytest.mark.integration


async def _counts() -> tuple[int, int]:
    async with get_db_session() as session:
        edges = (await session.execute(text("SELECT count(*) FROM risk_edge"))).scalar()
        snapshots = (
            await session.execute(text("SELECT count(*) FROM baseline_graph_snapshot"))
        ).scalar()
    return int(edges or 0), int(snapshots or 0)


class TestAnIdenticalRebuildWritesNothing:
    async def test_the_second_build_stores_no_rows(self):
        service = BenefitService()

        first = await service.build_baseline()
        if not first["data"]["edges_available"]:
            pytest.skip("no stored P4 input produces edges in this database")

        before_edges, before_snapshots = await _counts()
        second = await service.build_baseline()
        after_edges, after_snapshots = await _counts()

        assert second["data"]["reused_existing_baseline"] is True
        assert after_edges == before_edges, "a reused baseline wrote risk_edge rows"
        assert after_snapshots == before_snapshots, "a reused baseline wrote a snapshot"

    async def test_the_reused_graph_is_the_same_graph(self):
        """Reuse is only sound if the served graph really is the one asked for."""
        service = BenefitService()
        first = await service.build_baseline()
        if not first["data"]["edges_available"]:
            pytest.skip("no stored P4 input produces edges in this database")
        second = await service.build_baseline()

        assert second["data"]["edge_count"] == first["data"]["edge_count"]
        assert second["data"]["graph_hash"] == first["data"]["graph_hash"]


class TestAReusedAnswerSaysSo:
    async def test_the_payload_marks_the_reuse(self):
        """A stored graph from ten minutes ago must not read as one computed now."""
        service = BenefitService()
        first = await service.build_baseline()
        if not first["data"]["edges_available"]:
            pytest.skip("no stored P4 input produces edges in this database")
        second = await service.build_baseline()

        assert "reused_existing_baseline" in second["data"]
        assert second["data"]["reused_existing_baseline"] is True

    async def test_the_warning_names_the_reuse_and_the_horizon_caveat(self):
        service = BenefitService()
        first = await service.build_baseline()
        if not first["data"]["edges_available"]:
            pytest.skip("no stored P4 input produces edges in this database")
        second = await service.build_baseline()

        joined = " ".join(second["warnings"])
        assert "Reused the stored baseline" in joined
        # The reused row carries its own horizon, not this request's.
        assert "horizon" in joined


class TestTheMatchIsOnInputsNotTheClock:
    def test_the_horizon_is_not_part_of_the_lookup(self):
        """Including it would make every lookup miss, because it moves.

        The horizon does not decide the graph — the events that fell inside it
        do, and those are exactly what ``input_hash`` covers.
        """
        import inspect

        from backend.benefit.repository import BenefitRepository

        source = inspect.getsource(BenefitRepository.find_reusable_baseline)
        assert "input_hash" in source
        assert "config_hash" in source
        assert "model_version" in source
        assert "horizon_start" not in source
        assert "horizon_end" not in source

    def test_an_empty_baseline_is_never_reused(self):
        """A graph with no edges says 'we found nothing', which is time-sensitive."""
        import inspect

        from backend.benefit.repository import BenefitRepository

        source = inspect.getsource(BenefitRepository.find_reusable_baseline)
        assert "edge_count > 0" in source

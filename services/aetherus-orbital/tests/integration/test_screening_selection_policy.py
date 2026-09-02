"""Which objects an unscoped screening retains when the catalogue exceeds the bound.

Since the active-satellite ingestion the catalogue holds ~19k screenable
objects against a default bound of 2,000. Which tenth is retained used to be an
accident of ``ORDER BY catalog_id`` — the lowest NORAD numbers, i.e. the oldest
objects in the catalogue. The policy makes the choice explicit and recorded:

* EPOCH_DESC (default): freshest orbit-solution epochs first, simulation
  grades excluded. Stale elements propagate into fictional conjunctions, and
  probe fixtures written by tests must never crowd real objects out.
* CATALOG_ID_ASC: the historical ordering, kept for reproducing old runs.

A scoped call (explicit ``catalog_ids``) ignores the policy: the caller named
its population and gets exactly that, probe grades included, because test
corpora are legitimately simulation-graded.
"""

from __future__ import annotations

import pytest

from backend.benefit.models import SIMULATION_SOURCE_GRADES
from backend.conjunction.repository import ConjunctionRepository

pytestmark = pytest.mark.integration


def _grade(row: dict) -> str:
    quality = row.get("quality_json") or {}
    if isinstance(quality, str):
        import json

        quality = json.loads(quality)
    return str(quality.get("source_grade") or "").upper()


class TestDefaultPolicy:
    async def test_epoch_desc_retains_freshest_non_simulation_solutions(self):
        rows = await ConjunctionRepository().load_screenable_solutions(40, policy="EPOCH_DESC")
        if len(rows) < 2:
            pytest.skip("catalogue too small to exercise ordering")
        epochs = [row["epoch"] for row in rows]
        assert epochs == sorted(epochs, reverse=True), "not ordered freshest-first"
        assert not [row for row in rows if _grade(row) in SIMULATION_SOURCE_GRADES], (
            "a simulation-graded solution was retained by the default policy"
        )

    async def test_catalog_id_asc_is_still_available_for_reproduction(self):
        rows = await ConjunctionRepository().load_screenable_solutions(
            40, policy="CATALOG_ID_ASC"
        )
        ids = [str(row["catalog_id"]) for row in rows]
        assert ids == sorted(ids), "historical ordering must remain reproducible"

    async def test_unknown_policy_is_refused(self):
        with pytest.raises(ValueError):
            await ConjunctionRepository().load_screenable_solutions(5, policy="NEWEST_FIRST")

    async def test_scoped_calls_ignore_the_policy(self):
        """An explicit population is returned as named, probes included."""
        repository = ConjunctionRepository()
        sample = await repository.load_screenable_solutions(3, policy="CATALOG_ID_ASC")
        if not sample:
            pytest.skip("empty catalogue")
        wanted = [str(row["catalog_id"]) for row in sample]
        scoped = await repository.load_screenable_solutions(
            50, catalog_ids=wanted, policy="EPOCH_DESC"
        )
        assert sorted(str(row["catalog_id"]) for row in scoped) == sorted(wanted)

    def test_rule_text_names_the_retained_population(self):
        rule = ConjunctionRepository.selection_rule("EPOCH_DESC", scoped=False)
        assert "freshest" in rule and "simulation" in rule
        assert "caller-defined" in ConjunctionRepository.selection_rule("EPOCH_DESC", scoped=True)

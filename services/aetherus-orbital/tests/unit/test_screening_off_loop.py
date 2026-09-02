"""The accepted screening job must leave the event loop free to answer.

POST /v1/conjunctions/screen-runs returns a 202 and an ``asyncio`` task, but a
task that calls synchronous SGP4 never yields: measured 2026-09-03, /health went
from a 5.5 ms idle p50 to a 23.3 s worst case while one 5,000-object run
computed. These tests pin the seam that fixed it - the CPU-bound cascade runs on
a screening worker, not on the loop - so a later refactor cannot quietly put it
back.
"""

import asyncio
import threading
import time
from datetime import UTC, datetime
from typing import Any

import pytest

from backend.conjunction import service as service_module
from backend.conjunction.models import ScreeningConfig
from backend.conjunction.screen import CoarseScreenResult, PreparedCatalog
from backend.conjunction.service import ConjunctionService
from backend.offload import run_screening_off_loop

BLOCK_SECONDS = 0.6
TICK_SECONDS = 0.01
# The loop should tick ~60 times while a 0.6 s call runs off it. Ten is far
# above the zero a blocked loop manages and far below anything a slow machine
# would miss.
MIN_TICKS = 10


async def _tick_while(pending: asyncio.Future | asyncio.Task) -> int:
    """Count how many times the loop comes back around while ``pending`` runs."""
    ticks = 0
    while not pending.done():
        await asyncio.sleep(TICK_SECONDS)
        ticks += 1
    return ticks


class TestOffloadHelper:
    async def test_blocking_call_leaves_the_loop_free(self):
        task = asyncio.ensure_future(run_screening_off_loop(time.sleep, BLOCK_SECONDS))
        ticks = await _tick_while(task)
        await task
        assert ticks >= MIN_TICKS

    async def test_runs_off_the_loop_thread(self):
        loop_thread = threading.get_ident()
        worker_thread = await run_screening_off_loop(threading.get_ident)
        assert worker_thread != loop_thread

    async def test_exceptions_reach_the_caller_unchanged(self):
        sentinel = ValueError("refinement failed")

        def raise_it():
            raise sentinel

        with pytest.raises(ValueError) as caught:
            await run_screening_off_loop(raise_it)
        assert caught.value is sentinel


class _StubRepository:
    """Just enough repository for one screening that finds nothing."""

    def __init__(self) -> None:
        self.finalized: dict[str, Any] = {}

    async def load_screenable_solutions(self, max_objects, catalog_ids):
        return [
            {
                "object_id": f"object-{index}",
                "catalog_id": str(40000 + index),
                "orbit_solution_id": f"solution-{index}",
                "source_id": "stub",
                "retrieved_at": datetime.now(UTC),
                "content_sha256": "0" * 64,
                "epoch": datetime(2026, 8, 25, tzinfo=UTC),
                "frame": "TEME",
                "time_system": "UTC",
                "theory": "SGP4",
                "mean_elements_json": {
                    "mean_motion_rev_per_day": 15.5,
                    "eccentricity": 0.0005,
                    "inclination_deg": 51.6,
                    "ra_of_asc_node_deg": 120.0,
                    "arg_of_pericenter_deg": 30.0,
                    "mean_anomaly_deg": 0.0,
                    "bstar": 0.0,
                },
                "quality_json": {"source_grade": "PUBLIC_GP"},
            }
            for index in range(2)
        ]

    async def count_screenable_objects(self) -> int:
        return 2

    @staticmethod
    def selection_rule(policy, scoped) -> str:
        return "stub rule"

    async def create_screening_run(self, **kwargs) -> str:
        return "run-1"

    async def finalize_screening_run(self, run_id, **kwargs) -> None:
        self.finalized = {"run_id": run_id, **kwargs}


class TestScreeningRunKeepsTheLoop:
    async def test_slow_cascade_does_not_stall_the_loop(self, monkeypatch):
        """A slow cascade must cost the run wall-clock, never the loop."""

        def slow_screen(
            prepared: PreparedCatalog,
            window_start: datetime,
            window_stop: datetime,
            config: ScreeningConfig,
        ) -> CoarseScreenResult:
            time.sleep(BLOCK_SECONDS)
            return CoarseScreenResult(
                candidates=[],
                pairs_before_screening=1,
                pairs_after_shell=0,
                pairs_after_coarse=0,
                objects_propagated=len(prepared.objects),
                failures=list(prepared.failures),
            )

        monkeypatch.setattr(service_module, "coarse_screen", slow_screen)
        service = ConjunctionService(repository=_StubRepository())

        task = asyncio.ensure_future(service.run_screening(window_hours=0.05))
        ticks = await _tick_while(task)
        payload = await task

        assert ticks >= MIN_TICKS
        assert payload["data"]["pairs_after_coarse"] == 0

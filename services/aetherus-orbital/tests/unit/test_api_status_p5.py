from __future__ import annotations

import pytest

from backend.main import api_status


@pytest.mark.asyncio
async def test_api_status_matches_committed_p5_evidence_without_promoting_p6() -> None:
    payload = await api_status()
    phases = payload["implemented_phases"]
    assert phases["P5"]["status"] == "PASSED"
    for phase in ("P6", "P7", "P8", "P9", "P10", "P11", "P12"):
        assert phases[phase]["status"] == "NOT_STARTED"

"""Single staging entrypoint for the v0.6 product shell and P5 science API.

The v0.6 application owns ``/v1`` and ``/app``.  The existing P5 FastAPI
application is mounted last so its ``/api/v1`` science surface, ``/health`` and
``/ui`` remain byte-for-byte routed through the original handlers.

This entrypoint is also where the product surface stops being fixture-only:
the science bridge, the credential-free live providers and the conjunction
signal source are injected here. Every one of them is optional in
``create_app`` so the fixture-only app used by tests keeps its honest local
behaviour; wiring them in one place keeps that boundary explicit.
"""

from __future__ import annotations

from backend.main import app as orbital_app
from backend.providers_live import (
    NeoCloseApproachClient,
    SpaceWeatherClient,
    UpcomingLaunchClient,
)
from aetherus_integration import P5PostgresOrbitalBackend
from aetherus_integration.conjunction_signals import build_conjunction_signals
from services.api.main import create_app


async def _conjunction_signals(*, limit: int = 200):
    """Adapt the signal builder to the keyword-only shape routes call with."""
    return await build_conjunction_signals(limit=limit)


app = create_app(
    orbital_backend=P5PostgresOrbitalBackend(),
    space_weather_client=SpaceWeatherClient(),
    neo_client=NeoCloseApproachClient(),
    launch_client=UpcomingLaunchClient(),
    conjunction_signal_source=_conjunction_signals,
)
app.mount("/", orbital_app, name="p5-orbital-science")

"""Single staging entrypoint for the v0.6 product shell and P5 science API.

The v0.6 application owns ``/v1`` and ``/app``.  The existing P5 FastAPI
application is mounted last so its ``/api/v1`` science surface, ``/health`` and
``/ui`` remain byte-for-byte routed through the original handlers.
"""

from __future__ import annotations

from backend.main import app as orbital_app
from aetherus_integration import P5PostgresOrbitalBackend
from services.api.main import create_app


app = create_app(orbital_backend=P5PostgresOrbitalBackend())
app.mount("/", orbital_app, name="p5-orbital-science")

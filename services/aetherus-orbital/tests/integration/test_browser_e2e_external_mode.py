from __future__ import annotations

import importlib


def test_browser_e2e_can_target_the_running_integrated_app(monkeypatch) -> None:
    monkeypatch.setenv("AETHERUS_BROWSER_BASE_URL", "http://localhost:8000")
    from scripts import run_browser_e2e

    module = importlib.reload(run_browser_e2e)
    assert module.BASE == "http://localhost:8000"
    assert module.USE_EXTERNAL_SERVER is True

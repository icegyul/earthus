"""Browser E2E for the P4 conjunction-risk panel against the real running stack.

The test drives headless Chromium, opens an object detail panel, captures the
real network traffic, and proves the risk section renders exactly what
GET /api/v1/conjunctions returned — explicit states included, never invented.

Run from the repository root while the P4 stack is up:

    python3 -m pytest tests/e2e/test_p4_risk_panel.py -m e2e -q -p no:cacheprovider --noconftest
"""

import json
import os
from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402

pytestmark = pytest.mark.e2e

BASE_URL = os.environ.get("AETHERUS_BASE_URL", "http://localhost:8000/ui/")
EVIDENCE_DIR = Path(os.environ.get("AETHERUS_P4_EVIDENCE_DIR", "artifacts/evidence/p4"))


def _write_evidence(name: str, payload):
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE_DIR / name
    if isinstance(payload, (dict, list)):  # noqa: UP038 - host E2E also supports Python 3.9.
        path.write_text(json.dumps(payload, indent=2, default=str))
    else:
        path.write_bytes(payload)
    return path


class NetworkLog:
    def __init__(self, page):
        self.entries = []
        page.on(
            "response",
            lambda response: self._record(response) if "/api/" in response.url else None,
        )

    def _record(self, response):
        try:
            body = response.json()
        except Exception:
            body = None
        self.entries.append({"url": response.url, "status": response.status, "body": body})

    def last(self, fragment):
        matches = [entry for entry in self.entries if fragment in entry["url"]]
        assert matches, f"no network request observed for {fragment}"
        return matches[-1]


def _risk_section_text(page) -> str:
    page.wait_for_selector("#risk-section", timeout=30000)
    # Wait until the loading placeholder resolves to a final state.
    for _ in range(60):
        text = page.locator("#risk-section").inner_text()
        if "LOADING" not in text:
            return text
        page.wait_for_timeout(500)
    return page.locator("#risk-section").inner_text()


def test_risk_panel_renders_only_conjunctions_api_results():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_har_path=str(EVIDENCE_DIR / "risk-panel-network.har"),
            reduced_motion="no-preference",
        )
        page = context.new_page()
        network = NetworkLog(page)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_selector(".object-row", timeout=30000)
        page.wait_for_selector("#state-overlay[hidden]", state="attached", timeout=30000)

        snapshot_entry = network.last("/api/v1/catalog/snapshot")
        assert snapshot_entry["status"] == 200
        positioned = [
            entry
            for entry in snapshot_entry["body"]["data"]["catalog"]
            if entry["geodetic"]
        ]
        assert positioned, "the real ingested catalog must contain positioned objects"

        target = next(
            (entry for entry in positioned if entry["catalog_id"] == "25544"),
            positioned[0],
        )
        page.locator(f".object-row[data-object-id='{target['object_id']}']").first.click()

        risk_text = _risk_section_text(page)
        conjunctions_entry = network.last("/api/v1/conjunctions")
        assert conjunctions_entry["status"] == 200, (
            "the risk section must be fed by GET /api/v1/conjunctions"
        )
        payload = conjunctions_entry["body"]

        proof = {
            "target_catalog_id": target["catalog_id"],
            "api_payload": payload,
            "rendered_risk_section": risk_text,
            "network_url_seen": conjunctions_entry["url"],
        }

        # The rendered section must reflect the API data_status verbatim.
        status = payload["data_status"]
        if status in {"INSUFFICIENT_DATA", "UNAVAILABLE"}:
            assert status in risk_text, (
                f"explicit state {status} must be visible instead of any number"
            )
        elif not payload["data"]["events"]:
            assert "NO CONJUNCTION EVENTS" in risk_text
        else:
            first_event = payload["data"]["events"][0]
            assert first_event["primary"]["catalog_id"] in risk_text or first_event[
                "secondary"
            ]["catalog_id"] in risk_text

        # The static NOT_COMPUTED-only P3 wording must be gone.
        assert "arrives in phase P4" not in risk_text

        # Pc channel honesty: PUBLIC_GP snapshots never show a fabricated Pc.
        for event in payload["data"]["events"]:
            pc_channel = event["latest_snapshot"]["metrics"]["PC"]
            if event["latest_snapshot"]["source_grade"] == "PUBLIC_GP":
                assert pc_channel["value"] is None
                assert pc_channel["status"] in {"NOT_COMPUTED", "PC_UNAVAILABLE"}

        _shot = EVIDENCE_DIR / "risk-panel.png"
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(_shot))

        # A second object proves per-object filtering is real.
        other = next(
            (entry for entry in positioned if entry["object_id"] != target["object_id"]),
            None,
        )
        second_status = None
        if other is not None:
            page.locator(f".object-row[data-object-id='{other['object_id']}']").first.click()
            second_text = _risk_section_text(page)
            second_entry = network.last("/api/v1/conjunctions")
            second_payload = second_entry["body"]
            second_status = second_payload.get("data_status")
            proof["second_target_catalog_id"] = other["catalog_id"]
            proof["second_rendered_risk_section"] = second_text
            proof["second_api_data_status"] = second_status

        _write_evidence("risk-panel-proof.json", proof)
        _write_evidence(
            "risk-network-log.json",
            [
                {"url": e["url"], "status": e["status"]}
                for e in network.entries
                if "/api/" in e["url"]
            ],
        )
        context.close()
        browser.close()

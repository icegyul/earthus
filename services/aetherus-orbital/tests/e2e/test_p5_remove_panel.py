"""Browser E2E for the P5 REMOVE-simulation panel against the real stack.

Drives headless Chromium through the real UI flow (select object → SIMULATE
REMOVAL → assumption confirm → API chain) while capturing network traffic.
The proof must show every rendered value traces to the P5 API responses, and
that explicit unavailable states render verbatim when the stored catalog has
no baseline edges.

Run from the repository root while the P5 stack is up:

    python3 -m pytest tests/e2e/test_p5_remove_panel.py -m e2e -q -p no:cacheprovider --noconftest
"""

import json
import os
from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402

pytestmark = pytest.mark.e2e

BASE_URL = os.environ.get("AETHERUS_BASE_URL", "http://localhost:8000/ui/")
EVIDENCE_DIR = Path(os.environ.get("AETHERUS_P5_EVIDENCE_DIR", "artifacts/evidence/p5"))


def _write_evidence(name: str, payload):
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE_DIR / name
    if isinstance(payload, (dict, list)):  # noqa: UP038 - host E2E supports Python 3.9.
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

    def all(self, fragment):
        return [entry for entry in self.entries if fragment in entry["url"]]


def test_remove_panel_uses_real_p5_api_chain():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_har_path=str(EVIDENCE_DIR / "remove-panel-network.har"),
            reduced_motion="no-preference",
        )
        page = context.new_page()
        network = NetworkLog(page)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_selector(".object-row", timeout=30000)
        page.wait_for_selector("#state-overlay[hidden]", state="attached", timeout=30000)

        target = page.locator(".object-row[data-object-id]").first
        target_catalog = "unknown"
        snapshot_entry = network.last("/api/v1/catalog/snapshot")
        if snapshot_entry.get("body"):
            positioned = [
                entry
                for entry in snapshot_entry["body"]["data"]["catalog"]
                if entry["geodetic"]
            ]
            if positioned:
                preferred = next(
                    (e for e in positioned if e["catalog_id"] == "25544"),
                    positioned[0],
                )
                target = page.locator(
                    f".object-row[data-object-id='{preferred['object_id']}']"
                ).first
                target_catalog = preferred["catalog_id"]
        target.click()

        # The REMOVE simulation section is part of the detail panel.
        page.wait_for_selector("#benefit-section", timeout=30000)
        assert page.locator("#simulate-removal-btn").count() == 1

        # Assumption gate: IDEALIZED_REMOVAL wording before anything runs.
        page.locator("#simulate-removal-btn").click()
        confirm_text = page.locator("#benefit-confirm").inner_text()
        assert "IDEALIZED_REMOVAL" in confirm_text
        assert "No actual object is removed" in confirm_text

        page.screenshot(path=str(EVIDENCE_DIR / "remove-confirm.png"))

        # Run the real API chain from the browser.
        page.locator("#benefit-confirm-run").click()
        for _ in range(120):
            section_text = page.locator("#benefit-section").inner_text()
            if "COMPUTING" not in section_text:
                break
            page.wait_for_timeout(500)

        rendered = page.locator("#benefit-section").inner_text()

        # The panel always shows the simulation banner and never claims a real
        # removal; explicit states render verbatim from API payloads.
        assert "IDEALIZED_REMOVAL" in rendered
        assert "SIMULATION" in rendered.upper()

        baseline_entries = network.all("/api/v1/baselines")
        assert baseline_entries, "the flow must call POST /api/v1/baselines"
        assert baseline_entries[-1]["status"] == 202
        baseline_payload = baseline_entries[-1]["body"] or {}
        edges_available = bool(baseline_payload.get("data", {}).get("edges_available"))

        scenario_creates = [
            entry
            for entry in network.all("/api/v1/scenarios")
            if entry["url"].rstrip("/").endswith("/scenarios")
        ]
        scenario_runs = [e for e in network.all("/api/") if "/run" in e["url"]]
        benefits_queries = network.all("/benefits")

        proof = {
            "target_catalog_id": target_catalog,
            "baseline_response": baseline_payload,
            "baseline_edges_available": edges_available,
            "rendered_benefit_section": rendered,
        }

        if not edges_available:
            # Zero-event live catalog: no scenario may be created and no number
            # fabricated; the explicit state must render verbatim.
            assert not scenario_creates, (
                "a doomed scenario must not be created against an empty graph"
            )
            reason = baseline_payload.get("status_reason")
            assert reason and reason in rendered, (
                f"explicit baseline state {reason} must be visible"
            )
            assert "R(G₀)" not in rendered
            proof.update({
                "scenario_create_status": None,
                "scenario_run_status_code": None,
                "run_data_status": None,
                "run_reason": reason,
                "run_beneficiaries": [],
                "benefits_status_code": None,
            })
        else:
            assert scenario_creates, "the flow must call POST /api/v1/scenarios"
            assert scenario_creates[-1]["status"] == 202
            assert scenario_runs, "the flow must call POST /api/v1/scenarios/{id}/run"
            assert benefits_queries, "the flow must call GET /api/v1/scenarios/{id}/benefits"

            run_entry = scenario_runs[-1]
            run_payload = run_entry["body"] or {}
            data_status = run_payload.get("data_status")
            proof.update({
                "scenario_create_status": scenario_creates[-1]["status"],
                "scenario_run_status_code": run_entry["status"],
                "run_data_status": data_status,
                "run_reason": run_payload.get("status_reason"),
                "run_beneficiaries": (run_payload.get("data") or {}).get("beneficiaries"),
                "benefits_status_code": benefits_queries[-1]["status"],
            })
            if data_status == "OK":
                beneficiaries = run_payload["data"]["beneficiaries"]
                assert len(beneficiaries) >= 1
                first_metric = str(beneficiaries[0]["metric_type"])
                assert first_metric in rendered
            else:
                reason = run_payload.get("status_reason") or ""
                explicit_visible = (
                    (data_status in rendered)
                    or (reason in rendered)
                    or ("NO removable risk edge" in rendered)
                )
                assert explicit_visible, (
                    f"explicit state {data_status}/{reason} must be visible verbatim"
                )
                assert "R(G₀)" not in rendered

        page.screenshot(path=str(EVIDENCE_DIR / "remove-panel.png"))
        proof["screenshot"] = "remove-panel.png"
        _write_evidence("remove-panel-proof.json", proof)
        _write_evidence(
            "remove-network-log.json",
            [
                {"url": entry["url"], "status": entry["status"]}
                for entry in network.entries
                if "/api/" in entry["url"]
            ],
        )
        context.close()
        browser.close()

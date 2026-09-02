"""Browser E2E for the P3 explore UI against the real running Aetherus stack.

These tests drive headless Chromium, capture the real network traffic, and
prove mathematically that every rendered scene coordinate and the selected
orbit line derive from the Aetherus API responses — not from any client-side
propagation or hardcoded position.

Run from the repository root while the stack is up:

    python3 -m pytest tests/e2e -m e2e -q -p no:cacheprovider

Requires: python3 -m pip install -r requirements-e2e.txt
          python3 -m playwright install chromium
"""

import json
import math
import os
from pathlib import Path

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402

pytestmark = pytest.mark.e2e

BASE_URL = os.environ.get("AETHERUS_BASE_URL", "http://localhost:8000/ui/")
EVIDENCE_DIR = Path(os.environ.get("AETHERUS_EVIDENCE_DIR", "artifacts/evidence/p3"))
EARTH_KM = 6378.137
TOLERANCE = 1e-9


def scene_from_geodetic(lat_deg: float, lon_deg: float, alt_km: float) -> tuple[float, float, float]:
    """Independent host-side reimplementation of the presentation projection."""
    radius = 1.0 + alt_km / EARTH_KM
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    return (
        radius * math.cos(lat) * math.sin(lon),
        radius * math.sin(lat),
        -radius * math.cos(lat) * math.cos(lon),
    )


def assert_close(actual, expected, label, tolerance=TOLERANCE):
    assert actual == pytest.approx(expected, abs=tolerance), label


class NetworkLog:
    def __init__(self, page):
        self.entries = []
        page.on(
            "response",
            lambda response: self._record(response)
            if "/api/" in response.url or "/health" in response.url
            else None,
        )

    def _record(self, response):
        try:
            body = response.json()
        except Exception:
            body = None
        self.entries.append(
            {
                "url": response.url,
                "status": response.status,
                "body": body,
            }
        )

    def last(self, fragment):
        matches = [entry for entry in self.entries if fragment in entry["url"]]
        assert matches, f"no network request observed for {fragment}"
        return matches[-1]


def _write_evidence(name: str, payload):
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE_DIR / name
    if isinstance(payload, dict) or isinstance(payload, list):
        path.write_text(json.dumps(payload, indent=2, default=str))
    else:
        path.write_bytes(payload)
    return path


def _shot(page, name: str):
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE_DIR / name
    page.screenshot(path=str(path))
    return path


def test_explore_ui_renders_only_api_derived_positions():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_har_path=str(EVIDENCE_DIR / "explore-network.har"),
            reduced_motion="no-preference",
        )
        page = context.new_page()
        network = NetworkLog(page)
        page.goto(BASE_URL, wait_until="domcontentloaded")

        page.wait_for_selector(".object-row", timeout=30000)
        page.wait_for_selector("#state-overlay[hidden]", state="attached", timeout=30000)
        page.wait_for_timeout(1200)

        # --- 1. Network evidence: the UI fetched the real catalog snapshot ---
        snapshot_entry = network.last("/api/v1/catalog/snapshot")
        assert snapshot_entry["status"] == 200
        snapshot = snapshot_entry["body"]
        positioned = [e for e in snapshot["data"]["catalog"] if e["geodetic"]]
        assert positioned, "real ingested objects must be available for this E2E"

        # --- 2. Coordinate proof: rendered scene points == f(API geodetic) ---
        rendered = page.evaluate("window.__AETHERUS_P3__.rendered()")
        assert rendered, "the scene must expose its rendered object map"
        marker_proof = []
        checked = 0
        coverage = snapshot["data"]["coverage"]
        assert coverage["positioned_markers"] == len(positioned), (
            "coverage positioned_markers must equal the geodetic entry count"
        )
        assert coverage["positioned_markers"] == len(rendered), (
            "coverage positioned_markers must equal the rendered scene marker count"
        )
        assert coverage["catalog_entries"] == (
            coverage["positioned_markers"] + coverage["unavailable_entries"]
        )
        assert sum(coverage["unavailable_by_status"].values()) == coverage["unavailable_entries"]
        for entry in positioned:
            marker = rendered.get(entry["object_id"])
            assert marker is not None, f"{entry['catalog_id']} missing from the rendered map"
            assert marker["geodetic"] == entry["geodetic"], (
                "the UI must render the exact geodetic values returned by the API"
            )
            expected = scene_from_geodetic(
                entry["geodetic"]["lat_deg"],
                entry["geodetic"]["lon_deg"],
                entry["geodetic"]["alt_km"],
            )
            assert_close(marker["scene"]["x"], expected[0], f"x for {entry['catalog_id']}")
            assert_close(marker["scene"]["y"], expected[1], f"y for {entry['catalog_id']}")
            assert_close(marker["scene"]["z"], expected[2], f"z for {entry['catalog_id']}")
            marker_proof.append(
                {
                    "catalog_id": entry["catalog_id"],
                    "api_geodetic": entry["geodetic"],
                    "rendered_scene": marker["scene"],
                    "expected_scene": {
                        "x": expected[0],
                        "y": expected[1],
                        "z": expected[2],
                    },
                }
            )
            checked += 1
        assert checked >= 1
        assert checked == coverage["positioned_markers"]

        # --- 2b. Coverage labels must not overstate what is rendered ---
        coverage_text = page.locator("#coverage").inner_text()
        assert f"{coverage['positioned_markers']} positioned markers" in coverage_text
        assert f"{coverage['catalog_entries']} catalog entries" in coverage_text
        assert "rendered" not in coverage_text.lower()
        if coverage["unavailable_entries"]:
            assert f"{coverage['unavailable_entries']} unavailable" in coverage_text

        # --- 3. Coverage honesty: global density stays explicit ---
        assert coverage["global_density"] in {"AVAILABLE", "INSUFFICIENT_DATA"}
        if coverage["global_density"] == "INSUFFICIENT_DATA":
            assert "fabricate" in coverage["global_density_reason"]
            assert page.locator(".coverage__flag").inner_text().strip().lower().startswith("global view")

        # --- 4. Legend carries the mandatory size disclaimer ---
        legend_text = page.locator(".legend").inner_text()
        assert "does not represent actual object size" in legend_text

        # --- 5. Select an object; orbit line must come from the ephemeris API ---
        target = positioned[0]
        row = page.locator(
            f".object-row[data-object-id='{target['object_id']}']"
        ).first
        with page.expect_response(
            lambda response: "/ephemeris" in response.url, timeout=20000
        ) as response_info:
            row.click()
        ephemeris_response = response_info.value
        assert ephemeris_response.status == 200
        ephemeris = ephemeris_response.json()
        network.entries.append(
            {"url": ephemeris_response.url, "status": ephemeris_response.status, "body": ephemeris}
        )
        samples = ephemeris["data"]["samples"]
        assert samples, "ephemeris API must return samples"

        page.wait_for_function(
            "() => (window.__AETHERUS_P3__.orbitLine() || []).length > 1", timeout=15000
        )
        orbit_points = page.evaluate("window.__AETHERUS_P3__.orbitLine()")
        assert len(orbit_points) == len(samples)
        orbit_proof = []
        for index, sample in enumerate(samples):
            expected = scene_from_geodetic(
                sample["geodetic"]["lat_deg"],
                sample["geodetic"]["lon_deg"],
                sample["geodetic"]["alt_km"],
            )
            assert_close(orbit_points[index]["x"], expected[0], f"orbit x sample {index}")
            assert_close(orbit_points[index]["y"], expected[1], f"orbit y sample {index}")
            assert_close(orbit_points[index]["z"], expected[2], f"orbit z sample {index}")
            if index in {0, len(samples) // 2, len(samples) - 1}:
                orbit_proof.append(
                    {
                        "sample_index": index,
                        "sample_time": sample["sample_time"],
                        "api_geodetic": sample["geodetic"],
                        "rendered_scene": orbit_points[index],
                        "expected_scene": {
                            "x": expected[0],
                            "y": expected[1],
                            "z": expected[2],
                        },
                    }
                )

        # --- 6. Provenance drawer: source, epoch, age, model, frame ---
        detail = page.locator("#detail-body").inner_text()
        assert ephemeris["provenance"]["source_ids"][0] in detail
        assert ephemeris["provenance"]["model_id"] in detail
        assert ephemeris["provenance"]["frame"] in detail
        assert "Data age" in detail
        assert "NOT_COMPUTED" in detail, "risk section must stay explicit in P3"

        # --- 7. Time cursor moves along API samples only ---
        slider = page.locator("#time-slider")
        slider.evaluate("el => { el.value = String(Math.floor(el.max / 2)); el.dispatchEvent(new Event('input')); }")
        readout = page.locator("#time-readout").inner_text()
        mid_sample = samples[len(samples) // 2]
        assert mid_sample["sample_time"][11:19] in readout

        _shot(page, "desktop-focus.png")
        page.keyboard.press("Escape")

        page.evaluate("window.__AETHERUS_P3__.resetView()")
        page.wait_for_timeout(1200)
        _shot(page, "desktop-global.png")

        # --- 8. Keyboard accessibility: '/' search, arrows, Enter select ---
        page.keyboard.press("/")
        page.wait_for_timeout(200)
        assert page.evaluate("document.activeElement.id") == "search-input"
        page.keyboard.press("ArrowDown")
        page.keyboard.press("Enter")
        page.wait_for_selector("#detail-panel:not([hidden])", timeout=15000)
        page.keyboard.press("Escape")
        assert page.locator("#detail-panel").is_hidden()

        # --- 9. Network evidence artifact ---
        _write_evidence("network-log.json", network.entries)
        _write_evidence(
            "coordinate-proof.json",
            {
                "projection": "scene = f(lat,lon,alt): r=1+alt/6378.137; x=r·cos(lat)·sin(lon); y=r·sin(lat); z=-r·cos(lat)·cos(lon)",
                "tolerance": TOLERANCE,
                "catalog_markers": marker_proof,
                "selected_orbit_line": {
                    "object": ephemeris["data"]["catalog_id"],
                    "sample_count": len(samples),
                    "window": ephemeris["data"]["window"],
                    "verified_samples": orbit_proof,
                },
            },
        )
        _write_evidence(
            "api-samples.json",
            {
                "catalog_snapshot": snapshot,
                "ephemeris": ephemeris,
                "captured_urls": [entry["url"] for entry in network.entries],
            },
        )
        context.close()

        # --- 10. Error state: API unreachable must be explicit, never fabricated ---
        error_context = browser.new_context(viewport={"width": 1440, "height": 900})
        error_page = error_context.new_page()
        error_context.route(
            "**/api/v1/catalog/snapshot*", lambda route: route.abort()
        )
        error_page.goto(BASE_URL, wait_until="domcontentloaded")
        # Wait for the error state itself, not merely for a non-hidden node: the
        # overlay element exists from parse time, so a bare selector wait can
        # return an empty div and read '' as the error message.
        error_page.wait_for_function(
            "() => { const n = document.getElementById('state-overlay');"
            " return n && !n.hidden && n.innerText.trim().length > 0; }",
            timeout=20000,
        )
        error_text = error_page.locator("#state-overlay").inner_text()
        assert "Catalog unavailable" in error_text
        assert "Retry" in error_text
        _shot(error_page, "error-state.png")
        error_context.close()

        # --- 11. Mobile responsive layout at 390x844 ---
        mobile_context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            device_scale_factor=2,
            reduced_motion="reduce",
        )
        mobile_page = mobile_context.new_page()
        mobile_page.goto(BASE_URL, wait_until="domcontentloaded")
        mobile_page.wait_for_selector(".object-row", timeout=30000)
        mobile_page.wait_for_timeout(1200)
        assert mobile_page.evaluate("window.__AETHERUS_P3__.store.reducedMotion") is True

        layout = mobile_page.evaluate(
            """() => {
                const innerWidth = window.innerWidth;
                const scroll = selector => {
                    const node = document.querySelector(selector);
                    return node ? node.scrollWidth : null;
                };
                const box = selector => {
                    const node = document.querySelector(selector);
                    if (!node) return null;
                    const rect = node.getBoundingClientRect();
                    return {
                        x: Math.round(rect.left),
                        right: Math.round(rect.right),
                        y: Math.round(rect.top),
                        bottom: Math.round(rect.bottom),
                        width: Math.round(rect.width),
                    };
                };
                const selectors = ['.brand', '#coverage', '.search', '#list-panel', '.legend', '.lod-indicator'];
                const boxes = {};
                for (const selector of selectors) boxes[selector] = box(selector);
                return {
                    innerWidth,
                    innerHeight: window.innerHeight,
                    scrollWidth: {
                        documentElement: scroll('html'),
                        body: scroll('body'),
                        app: scroll('#app'),
                    },
                    boxes,
                };
            }"""
        )
        overflow_problems = [
            f"{name}={value}"
            for name, value in layout["scrollWidth"].items()
            if value is not None and value > layout["innerWidth"]
        ]
        box_problems = []
        for selector, rect in layout["boxes"].items():
            if rect is None:
                box_problems.append(f"{selector}: missing")
                continue
            if rect["x"] < 0 or rect["right"] > layout["innerWidth"]:
                box_problems.append(
                    f"{selector}: x={rect['x']} right={rect['right']} > {layout['innerWidth']}"
                )
        assert not overflow_problems, f"horizontal overflow at 390px: {overflow_problems}"
        assert not box_problems, f"elements outside the 390px viewport: {box_problems}"

        mobile_snapshot = mobile_page.evaluate(
            "window.__AETHERUS_P3__.apiLog().filter(e => e.path.includes('/catalog/snapshot')).length"
        )
        assert mobile_snapshot >= 1, "mobile view must load its own API snapshot"
        mobile_coverage = mobile_page.locator("#coverage").inner_text()
        assert "positioned markers" in mobile_coverage
        _shot(mobile_page, "mobile.png")
        _write_evidence(
            "layout-proof.json",
            {
                "viewport": {"width": 390, "height": 844},
                "inner_width": layout["innerWidth"],
                "scroll_width": layout["scrollWidth"],
                "boxes": layout["boxes"],
                "overflow_problems": overflow_problems,
                "box_problems": box_problems,
            },
        )
        mobile_context.close()
        browser.close()


def test_explore_ui_empty_catalog_state():
    """A catalog with no stored solutions shows the explicit empty state."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        empty_payload = {
            "request_id": "e2e-empty",
            "generated_at": "2026-08-25T00:00:00+00:00",
            "data_status": "UNAVAILABLE",
            "data": {
                "at": "2026-08-25T00:00:00+00:00",
                "catalog": [],
                "coverage": {
                    "objects_total": 0,
                    "objects_with_solution": 0,
                    "catalog_entries": 0,
                    "positioned_markers": 0,
                    "positioned_ok": 0,
                    "positioned_stale": 0,
                    "unavailable_entries": 0,
                    "unavailable_by_status": {},
                    "global_density": "INSUFFICIENT_DATA",
                    "global_density_reason": "No objects ingested.",
                    "sources": [],
                },
            },
            "provenance": {"model_id": "sgp4-vallado"},
            "warnings": ["The catalog is empty."],
        }

        def fulfill_snapshot(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(empty_payload),
            )

        context.route("**/api/v1/catalog/snapshot*", fulfill_snapshot)
        context.route("**/api/v1/catalog/status*", fulfill_snapshot)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_selector("#state-overlay:not([hidden])", timeout=20000)
        text = page.locator("#state-overlay").inner_text()
        assert "Catalog is empty" in text
        assert "never renders a synthetic catalog" in text
        _shot(page, "empty-catalog.png")
        context.close()
        browser.close()

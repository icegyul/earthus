from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

try:
    from aetherus_orbit.observation import GroundStationVisibilityEngine
except ModuleNotFoundError:
    GroundStationVisibilityEngine = None  # type: ignore[assignment,misc]

from aetherus_product import AetherusProductRuntime

from services.api.main import create_app

J2000_OVERHEAD_STATE = {
    "object_id": "VAL-A",
    "position_km": [1270.917571, -6883.669589, 0.0],
    "velocity_km_s": [7.37536, 1.361697, 0.0],
}
STATION = {"station_id": "EQUATOR-0", "latitude_deg": 0.0, "longitude_deg": 0.0, "altitude_m": 0.0}


def _runtime(tmp_path: Path) -> AetherusProductRuntime:
    return AetherusProductRuntime(
        db_path=str(tmp_path / "p9.sqlite"),
        raw_root=tmp_path / "raw",
        fixture_root=Path(__file__).resolve().parents[2] / "fixtures" / "official",
    )


def test_visibility_engine_computes_screening_window_from_state_and_station() -> None:
    assert GroundStationVisibilityEngine is not None, "P9 visibility engine is not implemented"
    engine = GroundStationVisibilityEngine()
    start = datetime(2000, 1, 1, 12, tzinfo=UTC)
    result = engine.compute(
        object_state=J2000_OVERHEAD_STATE,
        station=STATION,
        start_utc=start,
        end_utc=datetime(2000, 1, 1, 12, 20, tzinfo=UTC),
        step_s=10.0,
        minimum_elevation_deg=10.0,
        mount_rate_limit_deg_s=5.0,
    )
    assert result.validation_state == "SCREENING_ONLY"
    assert result.illumination_state == "NOT_COMPUTED"
    assert result.windows
    assert result.windows[0].max_elevation_deg > 80.0
    assert result.windows[0].start_utc == start
    assert result.provenance["frame_method"] == "GMST_WGS84_SCREENING"


def test_observation_reentry_and_photometry_outputs_are_persisted(tmp_path: Path) -> None:
    runtime = _runtime(tmp_path)
    client = TestClient(create_app(product=runtime))
    visibility = {
        "station": STATION,
        "object_state": J2000_OVERHEAD_STATE,
        "start_utc": "2000-01-01T12:00:00Z",
        "end_utc": "2000-01-01T12:20:00Z",
        "step_s": 10.0,
        "minimum_elevation_deg": 10.0,
        "mount_rate_limit_deg_s": 5.0,
    }
    try:
        response = client.post("/v1/observations/requests", json=visibility)
        assert response.status_code == 200, response.text
        assert response.json()["data"]["windows"]
        listed = client.get("/v1/observations/requests")
        assert listed.json()["data_status"] == "SCREENING_ONLY"
        assert listed.json()["data"][0]["object_id"] == "VAL-A"

        submission = client.post(
            "/v1/observations/submissions",
            json={
                "object_id": "VAL-A",
                "observed_at": "2026-08-31T00:00:00Z",
                "value": 12.5,
                "license_policy": "CC-BY-4.0",
                "expected_min": 0,
                "expected_max": 20,
            },
        )
        assert submission.status_code == 200
        assert submission.json()["data"]["observation"]["status"] == "ACCEPTED"

        reentry = client.post(
            "/v1/reentry/VAL-A",
            json={
                "tip": {
                    "nominal_utc": "2026-09-01T00:00:00Z",
                    "window_start_utc": "2026-08-31T20:00:00Z",
                    "window_end_utc": "2026-09-01T04:00:00Z",
                },
                "source_id": "OFFICIAL-TIP-TEST",
            },
        )
        assert reentry.status_code == 200, reentry.text
        assert client.get("/v1/reentry/VAL-A").json()["data"][0]["version"] == 1

        rotation = client.post(
            "/v1/objects/VAL-A/rotation",
            json={
                "times_s": [0, 1, 2, 3, 4, 5, 6, 7],
                "magnitudes": [1.0, 0.5, 1.0, 1.5, 1.0, 0.5, 1.0, 1.5],
                "min_period_s": 2,
                "max_period_s": 6,
            },
        )
        assert rotation.status_code == 200

        record_types = {item["record_type"] for item in runtime.product_store.list_records(domain="ORBIT")}
        assert {"OBSERVATION_PLAN", "CITIZEN_OBSERVATION", "REENTRY_REVISION", "ROTATION_ESTIMATE"} <= record_types
    finally:
        client.close()
        runtime.repo.close()

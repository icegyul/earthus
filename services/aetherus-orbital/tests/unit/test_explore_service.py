"""Unit tests for the P3 explore catalog service with a stubbed repository."""

import math
from datetime import UTC, datetime

import pytest

from backend.explore.errors import CatalogViewportError
from backend.explore.repository import ExploreRepository
from backend.explore.service import CatalogService, _lon_in_bbox, parse_bbox
from backend.orbit.frames import FrameAssumptions
from backend.orbit.models import MeanElements
from backend.orbit.propagator import Sgp4Propagator
from backend.orbit.repository import _json_dict, _numeric_elements

ISS_FIXTURE_ELEMENTS = {
    "mean_motion_rev_per_day": 15.49592931,
    "eccentricity": 0.00077005,
    "inclination_deg": 51.6333,
    "ra_of_asc_node_deg": 325.8142,
    "arg_of_pericenter_deg": 76.3746,
    "mean_anomaly_deg": 283.81,
    "bstar": 0.00017192817,
    "mean_motion_dot": 9.235e-5,
    "mean_motion_ddot": 0,
    "element_set_no": 999,
    "rev_at_epoch": 58222,
}


def iss_row(catalog_id="25544", **overrides):
    row = {
        "object_id": "0f0f0f0f-0000-4000-8000-000000000001",
        "catalog_id": catalog_id,
        "canonical_name": "ISS (ZARYA)",
        "cospar_id": "1998-067A",
        "object_type": "PAYLOAD",
        "origin_code": None,
        "object_status": None,
        "orbit_solution_id": "0f0f0f0f-0000-4000-8000-000000000002",
        "epoch": datetime(2026, 8, 23, 17, 25, 14, 504448, tzinfo=UTC),
        "frame": "TEME",
        "time_system": "UTC",
        "theory": "SGP4",
        "mean_elements_json": dict(ISS_FIXTURE_ELEMENTS),
        "quality_json": {
            "source_grade": "PUBLIC_GP",
            "limitations": ["PUBLIC_GP source; not operational."],
        },
        "source_id": "celestrak_gp",
        "content_sha256": "e746e2d57908e8085bc1364a6c6a43c2b1de1f3fd2502d7b1678d6d800e8b414",
        "retrieved_at": datetime(2026, 8, 24, 8, 12, 29, tzinfo=UTC),
    }
    row.update(overrides)
    return row


class StubRepository(ExploreRepository):
    def __init__(self, rows, objects_total=None, with_solution=None, sources=None):
        self._rows = rows
        self._objects_total = objects_total if objects_total is not None else len(rows)
        self._with_solution = with_solution if with_solution is not None else len(rows)
        self._sources = sources if sources is not None else []

    async def catalog_rows(self, limit):
        return self._rows[:limit]

    async def count_objects(self):
        return self._objects_total

    async def count_objects_with_solution(self):
        return self._with_solution

    async def source_health(self):
        return self._sources


def test_parse_bbox_accepts_valid_bounds_and_antimeridian():
    assert parse_bbox(" -10 , -20 , 30 , 40 ") == (-10.0, -20.0, 30.0, 40.0)
    assert parse_bbox("10,170,30,-170") == (10.0, 170.0, 30.0, -170.0)
    assert parse_bbox(None) is None
    assert parse_bbox("  ") is None


@pytest.mark.parametrize(
    "raw",
    ["1,2,3", "a,b,c,d", "100,0,10,10", "10,200,20,10", "20,0,10,10"],
)
def test_parse_bbox_rejects_invalid_viewports(raw):
    with pytest.raises(CatalogViewportError):
        parse_bbox(raw)


def test_longitude_bbox_supports_wrap():
    assert _lon_in_bbox(175.0, (10.0, 170.0, -10.0, -170.0))
    assert _lon_in_bbox(-175.0, (10.0, 170.0, -10.0, -170.0))
    assert not _lon_in_bbox(45.0, (10.0, 170.0, -10.0, -170.0))


async def test_snapshot_position_matches_direct_sgp4_propagation():
    """The rendered position must equal the real P2 propagator for the same input."""
    at = datetime(2026, 8, 23, 18, 0, 0, tzinfo=UTC)
    service = CatalogService(StubRepository([iss_row()]))
    payload = await service.snapshot(at.isoformat(), None, None)

    entry = payload["data"]["catalog"][0]
    elements = MeanElements(
        catalog_id="25544",
        epoch=iss_row()["epoch"],
        frame="TEME",
        time_system="UTC",
        theory="SGP4",
        mean_elements=_numeric_elements(_json_dict(iss_row()["mean_elements_json"])),
    )
    expected = Sgp4Propagator(elements, FrameAssumptions(ut1_utc_offset_seconds=0.0)).propagate(at)

    assert entry["position_status"] == "OK"
    assert entry["geodetic"]["lat_deg"] == pytest.approx(expected.lat_deg, abs=1e-9)
    assert entry["geodetic"]["lon_deg"] == pytest.approx(expected.lon_deg, abs=1e-9)
    assert entry["geodetic"]["alt_km"] == pytest.approx(expected.alt_km, abs=1e-6)
    assert all(math.isfinite(value) for value in entry["state"]["r_km"])
    assert entry["provenance"]["source_ids"] == ["celestrak_gp"]
    assert entry["provenance"]["quality_grade"] == "PUBLIC_GP"
    assert entry["provenance"]["input_artifact_hashes"][0].startswith("sha256:")
    assert entry["provenance"]["model_id"] == "sgp4-vallado"


async def test_snapshot_marks_stale_elements_beyond_threshold():
    at = datetime(2026, 9, 5, 0, 0, tzinfo=UTC)
    service = CatalogService(StubRepository([iss_row()]))
    payload = await service.snapshot(at.isoformat(), None, None)
    entry = payload["data"]["catalog"][0]
    assert entry["position_status"] == "STALE"
    assert payload["data_status"] == "STALE"
    assert entry["provenance"]["stale"] is True
    assert any("data-age" in warning for warning in entry["warnings"])


async def test_snapshot_reports_quarantine_without_fabricating_a_position():
    at = datetime(2026, 8, 23, 18, 0, 0, tzinfo=UTC)
    service = CatalogService(StubRepository([iss_row(catalog_id="NOT-NUMERIC")]))
    payload = await service.snapshot(at.isoformat(), None, None)
    entry = payload["data"]["catalog"][0]
    assert entry["position_status"] == "QUARANTINE"
    assert entry["geodetic"] is None
    assert entry["state"] is None
    assert payload["data_status"] == "PARTIAL"
    assert entry["provenance"] is None


async def test_snapshot_empty_catalog_is_explicitly_unavailable():
    service = CatalogService(StubRepository([], objects_total=0, with_solution=0))
    payload = await service.snapshot(None, None, None)
    assert payload["data_status"] == "UNAVAILABLE"
    assert payload["data"]["catalog"] == []
    assert any("catalog is empty" in warning.lower() for warning in payload["warnings"])


async def test_snapshot_applies_viewport_bbox_filter():
    at = datetime(2026, 8, 23, 18, 0, 0, tzinfo=UTC)
    service = CatalogService(StubRepository([iss_row()]))
    full = await service.snapshot(at.isoformat(), None, None)
    lat = full["data"]["catalog"][0]["geodetic"]["lat_deg"]
    lon = full["data"]["catalog"][0]["geodetic"]["lon_deg"]

    inside = await service.snapshot(at.isoformat(), f"{lat - 10},{lon - 10},{lat + 10},{lon + 10}", None)
    assert inside["data"]["catalog"]

    far_lat = -80.0 if lat < 0 else 80.0
    outside = await service.snapshot(at.isoformat(), f"{far_lat},0,{far_lat + 5},10", None)
    assert outside["data"]["catalog"] == []
    assert outside["data_status"] == "UNAVAILABLE"


async def test_snapshot_limit_bounds_and_global_density_state():
    at = datetime(2026, 8, 23, 18, 0, 0, tzinfo=UTC)
    service = CatalogService(StubRepository([iss_row()], objects_total=77, with_solution=4))
    payload = await service.snapshot(at.isoformat(), None, 1)
    assert len(payload["data"]["catalog"]) == 1
    coverage = payload["data"]["coverage"]
    assert coverage["objects_total"] == 77
    assert coverage["objects_with_solution"] == 4
    assert coverage["global_density"] == "INSUFFICIENT_DATA"
    assert "fabricate" in coverage["global_density_reason"]
    with pytest.raises(CatalogViewportError):
        await service.snapshot(at.isoformat(), None, 0)
    with pytest.raises(CatalogViewportError):
        await service.snapshot(at.isoformat(), None, 10_000)


async def test_coverage_positioned_markers_match_geodetic_entries():
    """Coverage must count only entries with a real geodetic fix as markers."""
    at = datetime(2026, 8, 23, 18, 0, 0, tzinfo=UTC)
    rows = [
        iss_row(),
        iss_row(catalog_id="NOT-NUMERIC", object_id="0f0f0f0f-0000-4000-8000-000000000009"),
    ]
    service = CatalogService(StubRepository(rows))
    payload = await service.snapshot(at.isoformat(), None, None)
    catalog = payload["data"]["catalog"]
    coverage = payload["data"]["coverage"]
    positioned = [entry for entry in catalog if entry["geodetic"] is not None]
    assert coverage["catalog_entries"] == len(catalog) == 2
    assert coverage["positioned_markers"] == len(positioned) == 1
    assert coverage["positioned_ok"] == 1
    assert coverage["positioned_stale"] == 0
    assert coverage["unavailable_entries"] == 1
    assert coverage["unavailable_by_status"] == {"QUARANTINE": 1}
    assert coverage["catalog_entries"] == (
        coverage["positioned_markers"] + coverage["unavailable_entries"]
    )


async def test_catalog_status_reports_source_health():
    sources = [
        {
            "source_id": "celestrak_gp",
            "last_success_at": datetime(2026, 8, 24, 8, 12, 29, tzinfo=UTC),
            "last_attempt_at": datetime(2026, 8, 24, 8, 12, 29, tzinfo=UTC),
            "successful_runs": 3,
            "total_runs": 4,
            "last_success_age_s": 3600.0,
        }
    ]
    service = CatalogService(StubRepository([], objects_total=77, with_solution=4, sources=sources))
    payload = await service.catalog_status()
    assert payload["data_status"] == "OK"
    coverage = payload["data"]["coverage"]
    assert coverage["sources"][0]["source_id"] == "celestrak_gp"
    assert coverage["global_density"] == "INSUFFICIENT_DATA"


def test_snapshot_provenance_declares_client_never_computes():
    service = CatalogService(StubRepository([]))
    provenance = service._snapshot_provenance()
    assert provenance["model_id"] == "sgp4-vallado"
    assert "client never computes positions" in provenance["position_origin"]

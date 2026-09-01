"""GET/POST /api/v1/conjunctions contract tests against stored results only."""

import pytest
from httpx import AsyncClient

from backend.main import app

pytestmark = pytest.mark.integration


@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as async_client:
        yield async_client


#: Objects to screen for these contract tests. Pair count is quadratic, so the
#: whole catalogue costs ~40 minutes while this bounded slice costs ~11s and
#: still yields real conjunctions (measured 2026-09-02: 150 objects → 10,878
#: pairs → 12 events; 400 objects → 100s; 800 objects → over 400s).
_SCREENING_SCOPE_OBJECTS = 150


#: Cache for the one screening run these tests share. Module-scoped async
#: fixtures cannot be used here: pytest-asyncio gives each test its own event
#: loop, and a connection opened on a module-scoped loop is then reused from a
#: different one ("attached to a different loop"). Caching inside a
#: function-scoped fixture gets the same single run while every DB call still
#: happens on the loop of the test that made it.
_SCREENED: dict[str, object] = {}


@pytest.fixture
async def _screened_once():
    """Ensure one real screening run exists before API assertions.

    Bounded to a slice of the real catalogue rather than synthetic objects, so
    the endpoint is exercised against genuine screening output, and run once for
    the whole module instead of once per test.

    The event count is asserted rather than assumed. Several tests here iterate
    over the returned events, and those loops pass vacuously when screening finds
    nothing — a scope that produced zero events would silently weaken them.
    """
    if "payload" in _SCREENED:
        return _SCREENED["payload"]

    from backend.conjunction.repository import ConjunctionRepository
    from backend.conjunction.service import ConjunctionService

    repository = ConjunctionRepository()
    catalogue = await repository.load_screenable_solutions(_SCREENING_SCOPE_OBJECTS)
    catalog_ids = [str(row["catalog_id"]) for row in catalogue]

    payload = await ConjunctionService(repository).run_screening(
        window_hours=6.0, catalog_ids=catalog_ids
    )
    assert payload["data"]["coverage"]["scope"] == "CATALOG_SUBSET"
    assert payload["data"]["events"], (
        "the bounded scope produced no conjunctions, so every event assertion in "
        "this module would pass without examining anything"
    )
    _SCREENED["payload"] = payload
    return payload


class TestConjunctionsEndpoint:
    async def test_envelope_shape(self, client, _screened_once):
        response = await client.get("/api/v1/conjunctions")
        assert response.status_code == 200
        payload = response.json()
        assert payload["request_id"]
        assert payload["generated_at"].endswith(("Z", "+00:00"))
        assert payload["data_status"] in {
            "OK",
            "PARTIAL",
            "STALE",
            "UNAVAILABLE",
            "INSUFFICIENT_DATA",
        }
        assert "data" in payload and "provenance" in payload and "warnings" in payload

    async def test_object_filter_is_respected(self, client, _screened_once):
        response = await client.get(
            "/api/v1/conjunctions", params={"object": "999999999-not-a-match"}
        )
        assert response.status_code == 200
        events = response.json()["data"]["events"]
        for event in events:
            assert event["primary"]["catalog_id"] == "999999999-not-a-match" or event[
                "secondary"
            ]["catalog_id"] == "999999999-not-a-match"

    async def test_threshold_without_metric_type_rejected(self, client):
        response = await client.get(
            "/api/v1/conjunctions", params={"threshold_max": 1000.0}
        )
        assert response.status_code == 422
        body = response.json()
        assert body["status"] == "INVALID_PARAMETER"

    async def test_threshold_with_metric_type_accepted(self, client, _screened_once):
        response = await client.get(
            "/api/v1/conjunctions",
            params={"metric_type": "MISS_DISTANCE", "threshold_min": 0.0},
        )
        assert response.status_code == 200
        for event in response.json()["data"]["events"]:
            miss = event["latest_snapshot"]["metrics"]["MISS_DISTANCE"]["value"]
            if miss is not None:
                assert miss >= 0.0

    async def test_unknown_metric_type_rejected(self, client):
        response = await client.get(
            "/api/v1/conjunctions", params={"metric_type": "RISK_SCORE"}
        )
        assert response.status_code == 422

    async def test_source_grade_filter(self, client, _screened_once):
        response = await client.get(
            "/api/v1/conjunctions", params={"source_grade": "PUBLIC_GP"}
        )
        assert response.status_code == 200
        for event in response.json()["data"]["events"]:
            assert event["latest_snapshot"]["source_grade"] == "PUBLIC_GP"

    async def test_time_window_filter(self, client, _screened_once):
        response = await client.get(
            "/api/v1/conjunctions",
            params={"start": "2099-01-01T00:00:00+00:00", "stop": "2099-01-02T00:00:00+00:00"},
        )
        assert response.status_code == 200
        assert response.json()["data"]["events"] == []

    async def test_naive_timestamps_rejected(self, client):
        response = await client.get(
            "/api/v1/conjunctions", params={"start": "2026-08-25T00:00:00"}
        )
        assert response.status_code == 422


class TestScreenRunEndpoint:
    async def test_screen_run_executes_and_reports_provenance(self, client):
        response = await client.post(
            "/api/v1/conjunctions/screen-runs",
            params={"window_hours": 2.0, "max_objects": _SCREENING_SCOPE_OBJECTS},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload["data"]["screening_run_id"]
        assert payload["provenance"]["model_id"] == "aetherus-ca-screening"
        assert payload["data_status"] in {"OK", "PARTIAL", "INSUFFICIENT_DATA", "UNAVAILABLE"}

    async def test_screen_run_rejects_out_of_bounds_window(self, client):
        response = await client.post(
            "/api/v1/conjunctions/screen-runs", params={"window_hours": 500.0}
        )
        assert response.status_code in {422, 400}

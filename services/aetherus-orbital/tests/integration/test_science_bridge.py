"""The widened science bridge must serve the real PostGIS catalog honestly.

Every case here runs against the live P1/P2/P4 store — no fixture doubles —
because the point of the bridge is that the product line stops seeing local
validation fixtures. The assertions guard the three ways this bridge could
quietly lie: inventing a value, collapsing the science set into the render
set, or substituting one metric channel for another.
"""

from __future__ import annotations

import json
import re

import pytest

from aetherus_integration import (
    OrbitalScienceCatalogBackend,
    P5PostgresOrbitalBackend,
)

pytestmark = pytest.mark.integration

# Real fragment clouds ingested into the live catalog. Names, not counts, are
# asserted: counts drift with every ingestion run and would make this brittle.
KNOWN_DEBRIS_CLOUDS = {
    "FENGYUN 1C DEB",
    "COSMOS 2251 DEB",
    "IRIDIUM 33 DEB",
    "COSMOS 1408 DEB",
}

# Any key that would let a screening feature masquerade as a risk metric.
FORBIDDEN_SYNTHETIC_KEYS = {
    "screening_score",
    "risk_score",
    "score",
    "severity_score",
    "threat_score",
    "danger_index",
}

UNKNOWN_OBJECT_REF = "AETHERUS-NO-SUCH-OBJECT-999999"


@pytest.fixture
def backend() -> P5PostgresOrbitalBackend:
    return P5PostgresOrbitalBackend()


def _walk_keys(payload: object) -> set[str]:
    """Collect every dict key anywhere in a nested payload."""
    found: set[str] = set()
    if isinstance(payload, dict):
        for key, value in payload.items():
            found.add(str(key))
            found |= _walk_keys(value)
    elif isinstance(payload, list | tuple):
        for item in payload:
            found |= _walk_keys(item)
    return found


def _assert_provenance(provenance: dict) -> None:
    assert provenance["scientific_source"] == "P5_POSTGRES"


def test_bridge_satisfies_widened_protocol(backend: P5PostgresOrbitalBackend) -> None:
    assert isinstance(backend, OrbitalScienceCatalogBackend)


# --------------------------------------------------------------------------- #
# (a) catalog serves the real debris population
# --------------------------------------------------------------------------- #


async def test_catalog_returns_real_debris_not_validation_fixtures(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.catalog(200)

    assert result["data_status"] in {"OK", "STALE", "PARTIAL"}
    entries = result["data"]["catalog"]
    assert entries, "the live catalog must not be empty for this bridge test"
    assert result["data"]["count"] == len(entries)

    names = {entry["canonical_name"] for entry in entries}
    assert names & KNOWN_DEBRIS_CLOUDS, (
        "the catalog page carries no known fragment cloud; the bridge may be "
        f"serving something other than the real catalog: {sorted(names)[:10]}"
    )
    # VAL-A/VAL-B are the local validation fixtures this bridge replaces.
    assert not {name for name in names if str(name).startswith("VAL-")}

    entry = entries[0]
    for key in (
        "object_id",
        "catalog_id",
        "canonical_name",
        "object_type",
        "position_status",
        "state",
        "geodetic",
        "provenance",
    ):
        assert key in entry

    coverage = result["data"]["coverage"]
    assert coverage["objects_total"] >= len(entries)
    assert coverage["objects_with_solution"] >= 1
    _assert_provenance(result["provenance"])
    assert result["provenance"]["objects_total"] == coverage["objects_total"]


async def test_catalog_positions_are_absent_or_real_never_zeroed(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.catalog(100)

    for entry in result["data"]["catalog"]:
        if entry["geodetic"] is None:
            # An unrenderable object must say why instead of sitting at 0,0.
            assert entry["position_status"] != "OK"
            assert entry["state"] is None
            assert entry["warnings"]
            continue
        assert entry["position_status"] in {"OK", "STALE"}
        assert -90.0 <= entry["geodetic"]["lat_deg"] <= 90.0
        assert -180.0 <= entry["geodetic"]["lon_deg"] <= 180.0
        assert entry["geodetic"]["alt_km"] > 0.0
        assert entry["provenance"]["input_artifact_hashes"]


async def test_catalog_reports_clamping_instead_of_silently_truncating(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.catalog(10_000)

    limit = result["data"]["limit"]
    assert limit["requested"] == 10_000
    assert limit["effective"] == limit["maximum"] < 10_000
    assert any("clamped" in warning for warning in result["warnings"])


# --------------------------------------------------------------------------- #
# (c) render subset never replaces the scientific subset
# --------------------------------------------------------------------------- #


async def test_render_set_keeps_science_subset_separate(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.render_set("LEO", None, None)
    data = result["data"]

    assert data["semantic_lod_only"] is True
    assert data["scientific_count"] == len(data["scientific_object_ids"])
    assert data["render_count"] == len(data["render_object_ids"])
    # The render subset may shrink; it may never contain an object the science
    # subset does not carry.
    assert set(data["render_object_ids"]) <= set(data["scientific_object_ids"])
    assert re.fullmatch(r"[0-9a-f]{64}", data["scientific_hash"])


async def test_render_lod_cap_does_not_move_the_scientific_hash(
    backend: P5PostgresOrbitalBackend,
) -> None:
    full = await backend.render_set("LEO", None, None)

    # Instance-level cap override: an aggressive LOD budget is configuration,
    # so it must shrink the drawn set and leave the science set untouched.
    backend.lod_engine.shell_limits = {**backend.lod_engine.shell_limits, "LEO": 5}
    capped = await backend.render_set("LEO", None, None)

    assert capped["data"]["render_count"] == 5
    assert capped["data"]["render_count"] < capped["data"]["scientific_count"]
    assert capped["data"]["scientific_object_ids"] == full["data"]["scientific_object_ids"]
    assert capped["data"]["scientific_hash"] == full["data"]["scientific_hash"]
    assert set(capped["data"]["render_object_ids"]) <= set(
        capped["data"]["scientific_object_ids"]
    )
    assert any("authoritative science set" in w for w in capped["warnings"])


async def test_render_set_prioritises_important_ids_without_widening_science(
    backend: P5PostgresOrbitalBackend,
) -> None:
    baseline = await backend.render_set("LEO", None, None)
    pinned = baseline["data"]["scientific_object_ids"][-1]

    backend.lod_engine.shell_limits = {**backend.lod_engine.shell_limits, "LEO": 3}
    result = await backend.render_set("LEO", [], [pinned])
    data = result["data"]

    assert data["render_object_ids"][0] == pinned
    assert data["scientific_hash"] == baseline["data"]["scientific_hash"]


async def test_render_set_drops_unknown_ids_instead_of_drawing_them(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.render_set("LEO", ["GHOST-1"], ["GHOST-2"])
    data = result["data"]

    assert data["unknown_requested_ids"] == ["GHOST-1", "GHOST-2"]
    assert "GHOST-1" not in data["render_object_ids"]
    assert "GHOST-2" not in data["render_object_ids"]
    assert "GHOST-1" not in data["scientific_object_ids"]
    assert any("dropped instead of drawn" in w for w in result["warnings"])


# --------------------------------------------------------------------------- #
# (b) risk graph exposes stored metrics and fabricates no score
# --------------------------------------------------------------------------- #


async def test_risk_graph_edges_carry_stored_metrics_only(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.risk_graph()
    edges = result["data"]["edges"]

    assert result["data"]["edge_count"] == len(edges)
    assert edges, "the live store must hold stored P4 conjunctions for this test"

    for edge in edges:
        miss = edge["metrics"]["MISS_DISTANCE"]
        assert miss["unit"] == "m"
        if miss["value"] is not None:
            assert miss["value"] > 0.0
            assert miss["status"] == "COMPUTED"
        pc = edge["metrics"]["PC"]
        # Pc is a separate channel: never derived from the geometry above.
        if pc["value"] is None:
            assert pc["status"] in {"NOT_COMPUTED", "PC_UNAVAILABLE"}
            assert pc["unavailable_reason"]
        assert edge["evidence"]["event_id"]
        assert edge["evidence"]["snapshot_id"]
        assert edge["evidence"]["input_hash"]
        assert edge["a"]["object_id"] != edge["b"]["object_id"]

    _assert_provenance(result["provenance"])
    assert re.fullmatch(r"[0-9a-f]{64}", result["data"]["snapshot_hash"])


async def test_risk_graph_invents_no_synthetic_score(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.risk_graph()

    keys = _walk_keys(result)
    assert not (keys & FORBIDDEN_SYNTHETIC_KEYS), (
        "the risk graph introduced a synthetic aggregate: "
        f"{sorted(keys & FORBIDDEN_SYNTHETIC_KEYS)}"
    )
    assert any("never converted into collision probability" in w for w in result["warnings"])
    # Nothing in the live store carries a covariance, so no Pc may appear.
    assert all(
        edge["metrics"]["PC"]["value"] is None for edge in result["data"]["edges"]
    )


async def test_risk_graph_payload_is_json_serialisable(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.risk_graph()
    assert json.loads(json.dumps(result))


# --------------------------------------------------------------------------- #
# (d) honest states for objects with no data
# --------------------------------------------------------------------------- #


async def test_object_risk_summarises_real_conjunctions(
    backend: P5PostgresOrbitalBackend,
) -> None:
    graph = await backend.risk_graph()
    catalog_id = graph["data"]["edges"][0]["a"]["catalog_id"]

    result = await backend.object_risk(catalog_id)
    data = result["data"]

    assert data["object"]["catalog_id"] == catalog_id
    assert data["event_count"] >= 1
    assert data["metrics"]["MISS_DISTANCE"]["status"] == "COMPUTED"
    assert data["metrics"]["MISS_DISTANCE"]["min_m"] > 0.0
    assert (
        data["metrics"]["MISS_DISTANCE"]["min_m"]
        <= data["metrics"]["MISS_DISTANCE"]["max_m"]
    )
    # Miss distance never stands in for Pc.
    assert data["metrics"]["PC"]["value"] is None
    assert data["metrics"]["PC"]["status"] == "NOT_COMPUTED"
    assert data["metrics"]["PC"]["unavailable_reasons"]
    assert not (_walk_keys(result) & FORBIDDEN_SYNTHETIC_KEYS)
    assert data["tca_window"]["first"] is not None


async def test_object_risk_says_unavailable_for_unknown_object(
    backend: P5PostgresOrbitalBackend,
) -> None:
    result = await backend.object_risk(UNKNOWN_OBJECT_REF)

    assert result["data_status"] == "UNAVAILABLE"
    assert result["status_reason"] == "OBJECT_NOT_IN_CATALOG"
    assert result["data"]["object"] is None
    assert result["data"]["metrics"] is None
    assert result["data"]["event_count"] == 0
    assert result["warnings"]


async def test_object_risk_reports_insufficient_data_for_unscreened_object(
    backend: P5PostgresOrbitalBackend,
) -> None:
    """An object in the catalog with no stored conjunction gets a state, not a 0."""
    catalog = await backend.catalog(60)
    result = None
    for entry in catalog["data"]["catalog"]:
        candidate = await backend.object_risk(entry["catalog_id"])
        if candidate["data"]["event_count"] == 0:
            result = candidate
            break
    if result is None:
        pytest.skip("every catalogued object on this page has a stored conjunction")

    assert result["data_status"] == "INSUFFICIENT_DATA"
    assert result["status_reason"] == "NO_STORED_CONJUNCTION_EVENT_FOR_OBJECT"
    assert result["data"]["object"] is not None
    assert result["data"]["metrics"]["MISS_DISTANCE"]["min_m"] is None
    assert result["data"]["metrics"]["MISS_DISTANCE"]["status"] == "NOT_COMPUTED"
    assert result["data"]["metrics"]["PC"]["value"] is None
    assert any("no risk value is invented" in w for w in result["warnings"])


# --------------------------------------------------------------------------- #
# genealogy: inference is labelled as inference
# --------------------------------------------------------------------------- #


async def _first_catalog_id_named(
    backend: P5PostgresOrbitalBackend, canonical_name: str
) -> str | None:
    row = await backend.identity_repository.find_object_by_name(canonical_name)
    return None if row is None else str(row["catalog_id"])


async def test_genealogy_infers_parent_and_labels_it_as_inference(
    backend: P5PostgresOrbitalBackend,
) -> None:
    catalog_id = await _first_catalog_id_named(backend, "FENGYUN 1C DEB")
    if catalog_id is None:
        pytest.skip("FENGYUN 1C DEB is not ingested in this store")

    result = await backend.genealogy(catalog_id)
    assert result is not None
    data = result["data"]

    assert data["is_fragment_by_naming"] is True
    assert data["inferred_parent_name"] == "FENGYUN 1C"
    assert data["launch_id"] == "1999-025"
    assert data["parent_candidate"] is not None
    assert data["parent_candidate"]["canonical_name"] == "FENGYUN 1C"
    assert data["parent_candidate"]["object_id"] != data["object"]["object_id"]
    assert data["parent_candidate"]["matched_by"] in {
        "COSPAR_PRIMARY_PIECE_LOOKUP",
        "PARENT_NAME_LOOKUP",
    }

    # The claim is never dressed up as an observation.
    assert result["data_status"] == "PARTIAL"
    assert data["origin_uncertainty"]["inference_only"] is True
    assert data["origin_uncertainty"]["confirmed_by_event_record"] is False
    assert data["breakup_event"]["status"] == "UNAVAILABLE"
    assert data["breakup_event"]["epoch"] is None

    rules = {item["rule"] for item in data["evidence"]}
    assert "CANONICAL_NAME_DEBRIS_SUFFIX" in rules
    assert "COSPAR_LAUNCH_DESIGNATOR" in rules

    provenance = result["provenance"]
    _assert_provenance(provenance)
    assert provenance["source_id"]
    assert provenance["source_uri"]
    assert provenance["retrieved_at"]
    assert provenance["content_sha256"]


async def test_genealogy_admits_when_the_parent_is_not_stored(
    backend: P5PostgresOrbitalBackend,
) -> None:
    catalog_id = await _first_catalog_id_named(backend, "COSMOS 1408 DEB")
    if catalog_id is None:
        pytest.skip("COSMOS 1408 DEB is not ingested in this store")
    if await backend.identity_repository.find_object_by_name("COSMOS 1408"):
        pytest.skip("the COSMOS 1408 parent row is present in this store")

    result = await backend.genealogy(catalog_id)
    assert result is not None
    data = result["data"]

    assert data["is_fragment_by_naming"] is True
    assert data["inferred_parent_name"] == "COSMOS 1408"
    assert data["parent_candidate"] is None
    assert result["status_reason"] == "PARENT_OBJECT_NOT_PRESENT_IN_CATALOG"
    assert data["origin_uncertainty"]["state"] == "PARENT_NAMED_BUT_NOT_STORED"


async def test_genealogy_claims_no_parent_for_an_intact_object(
    backend: P5PostgresOrbitalBackend,
) -> None:
    catalog_id = await _first_catalog_id_named(backend, "FENGYUN 1C")
    if catalog_id is None:
        pytest.skip("the intact FENGYUN 1C row is not ingested in this store")

    result = await backend.genealogy(catalog_id)
    assert result is not None
    data = result["data"]

    assert data["is_fragment_by_naming"] is False
    assert data["parent_candidate"] is None
    assert result["data_status"] == "INSUFFICIENT_DATA"
    assert data["origin_uncertainty"]["state"] == "NOT_A_FRAGMENT_BY_NAMING"


async def test_genealogy_returns_none_for_unknown_object(
    backend: P5PostgresOrbitalBackend,
) -> None:
    assert await backend.genealogy(UNKNOWN_OBJECT_REF) is None


async def test_genealogy_never_invents_a_launch_date(
    backend: P5PostgresOrbitalBackend,
) -> None:
    catalog_id = await _first_catalog_id_named(backend, "FENGYUN 1C DEB")
    if catalog_id is None:
        pytest.skip("FENGYUN 1C DEB is not ingested in this store")

    launch_date = (await backend.genealogy(catalog_id))["data"]["launch_date"]
    if launch_date["value"] is None:
        assert launch_date["status"] == "UNAVAILABLE"
        assert launch_date["reason"] == "LAUNCH_DATE_NULL_IN_CATALOG"
    else:
        assert launch_date["status"] == "OK"


# --------------------------------------------------------------------------- #
# the already-wired surface must not move
# --------------------------------------------------------------------------- #


async def test_existing_ephemeris_signature_and_provenance_unchanged(
    backend: P5PostgresOrbitalBackend,
) -> None:
    catalog = await backend.catalog(20)
    positioned = next(
        entry for entry in catalog["data"]["catalog"] if entry["geodetic"] is not None
    )

    result = await backend.ephemeris(positioned["catalog_id"], None)

    assert set(result) >= {
        "request_id",
        "generated_at",
        "data_status",
        "data",
        "provenance",
    }
    _assert_provenance(result["provenance"])

"""Adapter from the premium product surface to the verified P5 science stack."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol, runtime_checkable

from fastapi import HTTPException
from sqlalchemy import text

# Same canonical hash and LOD engine the product runtime already uses, so a
# render subset produced here is comparable with the one produced there.
from aetherus_domain import canonical_hash
from aetherus_visual import OrbitalShellLODEngine

from backend.config import settings
from backend.conjunction.service import ConjunctionService
from backend.database import get_db_session
from backend.explore.service import CatalogService
from backend.orbit.service import EphemerisService

SCIENTIFIC_SOURCE = "P5_POSTGRES"

# A synthesized aggregate would let a screening feature masquerade as a risk
# metric, so the bridge publishes the stored channels and nothing else.
NO_SYNTHETIC_SCORE_NOTE = (
    "No aggregate risk score is produced. miss_distance_m is a screening "
    "feature and is never converted into collision probability (Pc)."
)


class OrbitalScienceBackend(Protocol):
    """Narrow contract already wired into the product routes; do not widen it.

    Widening this Protocol would retroactively break every existing
    implementation (including the route-level fakes) under structural typing,
    so the extra surface lives in ``OrbitalScienceCatalogBackend`` below.
    """

    async def ephemeris(self, object_id: str, at: datetime | str | None) -> dict: ...

    async def conjunction_risk(
        self, conjunction_id: str, at: datetime | str | None
    ) -> dict: ...


@runtime_checkable
class OrbitalScienceCatalogBackend(OrbitalScienceBackend, Protocol):
    """Widened contract: real catalog, render/science split, risk and lineage."""

    async def catalog(self, limit: int) -> dict: ...

    async def render_set(
        self,
        view: str,
        viewport_query: list[str] | None,
        important_ids: list[str] | None,
    ) -> dict: ...

    async def risk_graph(self) -> dict: ...

    async def object_risk(self, object_id: str) -> dict: ...

    async def genealogy(self, object_id: str) -> dict | None: ...


def _moment(value: datetime | str | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise HTTPException(422, "at must be an offset-aware UTC instant")
    return parsed.astimezone(UTC)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _iso_or_none(value: Any) -> str | None:
    if isinstance(value, datetime | date):
        return value.isoformat()
    return None if value is None else str(value)


# ---------------------------------------------------------------------------
# Identity / lineage reads
# ---------------------------------------------------------------------------

# Fragment clouds are named "<PARENT> DEB" by the upstream catalog and their
# COSPAR piece suffix hangs off the parent launch designator. Both are naming
# conventions, not stored parentage, so every inference drawn from them is
# reported with the pattern that produced it.
_FRAGMENT_NAME_PATTERN = re.compile(r"^(?P<parent>.+?)\s+DEB$")
_COSPAR_PATTERN = re.compile(r"^(?P<launch>\d{4}-\d{3})(?P<piece>[A-Z]{1,3})$")


class CatalogIdentityRepository:
    """Read-only identity and lineage lookups; no science is recomputed here."""

    async def resolve_object(self, ref: str) -> dict[str, Any] | None:
        """Resolve a catalog_id or object UUID to the stored canonical row."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        so.id::text AS object_id,
                        so.catalog_id,
                        so.canonical_name,
                        so.cospar_id,
                        so.object_type,
                        so.origin_code,
                        so.status AS object_status,
                        so.launch_date,
                        so.decay_date,
                        (
                            SELECT count(*) FROM orbit_solution AS os
                            WHERE os.object_id = so.id AND os.format = 'OMM'
                        ) AS omm_solution_count
                    FROM space_object AS so
                    WHERE so.catalog_id = :ref OR so.id::text = :ref
                    ORDER BY so.catalog_id ASC
                    LIMIT 1
                    """
                ),
                {"ref": ref},
            )
            row = result.mappings().first()
            return dict(row) if row is not None else None

    async def object_source_provenance(self, object_id: str) -> dict[str, Any] | None:
        """Return the newest ingest artifact behind this object's OMM solution."""
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT
                        os.id::text AS orbit_solution_id,
                        os.source_id,
                        os.epoch,
                        ra.source_uri,
                        ra.retrieved_at,
                        ra.content_sha256
                    FROM orbit_solution AS os
                    LEFT JOIN raw_artifact AS ra ON ra.id = os.source_artifact_id
                    WHERE os.object_id = CAST(:object_id AS uuid) AND os.format = 'OMM'
                    ORDER BY os.epoch DESC, os.created_at DESC
                    LIMIT 1
                    """
                ),
                {"object_id": object_id},
            )
            row = result.mappings().first()
            return dict(row) if row is not None else None

    async def count_by_canonical_name(self, name: str) -> int:
        async with get_db_session() as session:
            result = await session.execute(
                text("SELECT count(*) FROM space_object WHERE canonical_name = :name"),
                {"name": name},
            )
            return int(result.scalar_one())

    async def count_launch_cohort(self, launch_id: str) -> int:
        async with get_db_session() as session:
            result = await session.execute(
                text("SELECT count(*) FROM space_object WHERE cospar_id LIKE :prefix"),
                {"prefix": f"{launch_id}%"},
            )
            return int(result.scalar_one())

    async def find_object_by_cospar(self, cospar_id: str) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text AS object_id, catalog_id, canonical_name,
                           cospar_id, object_type
                    FROM space_object
                    WHERE cospar_id = :cospar_id
                    LIMIT 1
                    """
                ),
                {"cospar_id": cospar_id},
            )
            row = result.mappings().first()
            return dict(row) if row is not None else None

    async def find_object_by_name(self, canonical_name: str) -> dict[str, Any] | None:
        async with get_db_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT id::text AS object_id, catalog_id, canonical_name,
                           cospar_id, object_type
                    FROM space_object
                    WHERE canonical_name = :canonical_name
                    LIMIT 1
                    """
                ),
                {"canonical_name": canonical_name},
            )
            row = result.mappings().first()
            return dict(row) if row is not None else None


class P5PostgresOrbitalBackend:
    """Expose P5 SGP4/TCA/Pc results without re-computing them in the UI layer."""

    def __init__(
        self,
        ephemeris_service: EphemerisService | None = None,
        conjunction_service: ConjunctionService | None = None,
        catalog_service: CatalogService | None = None,
        identity_repository: CatalogIdentityRepository | None = None,
    ) -> None:
        self.ephemeris_service = ephemeris_service or EphemerisService()
        self.conjunction_service = conjunction_service or ConjunctionService()
        self.catalog_service = catalog_service or CatalogService()
        self.identity_repository = identity_repository or CatalogIdentityRepository()
        self.lod_engine = OrbitalShellLODEngine()

    # ------------------------------------------------------------------ #
    # Already-wired surface — signatures and behaviour are frozen
    # ------------------------------------------------------------------ #

    async def ephemeris(self, object_id: str, at: datetime | str | None) -> dict:
        start = _moment(at)
        result = await self.ephemeris_service.ephemeris(
            object_id,
            start.isoformat(),
            (start + timedelta(seconds=1)).isoformat(),
            1,
        )
        result.setdefault("provenance", {})["scientific_source"] = SCIENTIFIC_SOURCE
        return result

    async def conjunction_risk(
        self, conjunction_id: str, at: datetime | str | None
    ) -> dict:
        del at  # P5 snapshots are immutable and carry their own snapshot/TCA times.
        result = await self.conjunction_service.list_conjunctions(
            object_ref=None,
            start_raw=None,
            stop_raw=None,
            source_grade=None,
            metric_type=None,
            threshold_min=None,
            threshold_max=None,
            limit_raw=200,
        )
        event = next(
            (row for row in result["data"]["events"] if row["event_id"] == conjunction_id),
            None,
        )
        if event is None:
            raise HTTPException(404, "conjunction not found in P5 persisted snapshots")
        snapshot = event["latest_snapshot"]
        pc = snapshot["metrics"]["PC"]
        return {
            "request_id": result["request_id"],
            "generated_at": result["generated_at"],
            "data_status": snapshot["validation_state"],
            "data": {
                "id": conjunction_id,
                "tca": event["tca"],
                "relative_geometry": {
                    "miss_distance_m": snapshot["miss_distance_m"],
                    "relative_speed_mps": snapshot["relative_speed_mps"],
                },
                "pc": pc["value"],
                "pc_status": pc["status"],
                "pc_unavailable_reason": pc["unavailable_reason"],
                "covariance_status": snapshot["covariance_status"],
                "validation_state": snapshot["validation_state"],
            },
            "provenance": {
                **snapshot["provenance"],
                "scientific_source": SCIENTIFIC_SOURCE,
                "model_version": snapshot["model_version"],
                "input_hash": snapshot["input_hash"],
            },
            "warnings": result.get("warnings", []),
        }

    # ------------------------------------------------------------------ #
    # Widened surface
    # ------------------------------------------------------------------ #

    async def catalog(self, limit: int) -> dict:
        """Serve the real P3 catalog snapshot; positions come from P2 SGP4."""
        maximum = settings.catalog_max_objects
        try:
            requested = int(limit)
        except (TypeError, ValueError) as error:
            raise HTTPException(422, "limit must be an integer") from error
        effective = max(1, min(requested, maximum))

        result = await self.catalog_service.snapshot(
            at_raw=None, bbox_raw=None, limit_raw=effective
        )
        warnings = list(result.get("warnings", []))
        if effective != requested:
            # Clamping is reported rather than silently applied, so the caller
            # never mistakes a truncated page for the whole catalog.
            warnings.append(
                f"Requested limit {requested} was clamped to {effective}; the "
                f"configured catalog page maximum is {maximum}."
            )
        coverage = result["data"]["coverage"]
        result["data"]["limit"] = {
            "requested": requested,
            "effective": effective,
            "maximum": maximum,
        }
        result["data"]["count"] = len(result["data"]["catalog"])
        result["provenance"]["scientific_source"] = SCIENTIFIC_SOURCE
        result["provenance"]["catalog_source"] = "P1_SPACE_OBJECT+P2_ORBIT_SOLUTION"
        result["provenance"]["objects_total"] = coverage["objects_total"]
        result["provenance"]["objects_with_solution"] = coverage["objects_with_solution"]
        result["warnings"] = warnings
        return result

    async def render_set(
        self,
        view: str = "GLOBAL",
        viewport_query: list[str] | None = None,
        important_ids: list[str] | None = None,
    ) -> dict:
        """Return a visual LOD subset that never narrows the scientific set.

        The scientific set is the full catalog page this bridge is allowed to
        serve; the render set is a capped, prioritised view of it. Both are
        returned side by side and ``scientific_hash`` is bound to the
        scientific set alone, so a shrinking render subset cannot silently
        stand in for the science subset (absolute rule 12).
        """
        catalog = await self.catalog(settings.catalog_max_objects)
        entries = catalog["data"]["catalog"]
        scientific_ids = [str(entry["catalog_id"]) for entry in entries]
        known = set(scientific_ids)

        normalised_view = str(view or "GLOBAL").upper()
        requested_viewport = [str(item) for item in (viewport_query or [])]
        requested_important = [str(item) for item in (important_ids or [])]
        # Ids the caller asked for that are not in the served catalog would
        # otherwise be drawn as objects that do not exist in the store.
        unknown_requested = sorted(
            {
                item
                for item in (*requested_viewport, *requested_important)
                if item not in known
            }
        )
        viewport = [item for item in requested_viewport if item in known]
        important = [item for item in requested_important if item in known]

        render_ids = self.lod_engine.render_set(
            scientific_ids,
            view=normalised_view,
            viewport_query=viewport,
            important_ids=important,
        )
        scientific_hash = canonical_hash(
            {"scientific_object_ids": sorted(scientific_ids)}
        )

        warnings = list(catalog.get("warnings", []))
        if unknown_requested:
            warnings.append(
                f"{len(unknown_requested)} requested render ids are absent from "
                "the served catalog page and were dropped instead of drawn."
            )
        if len(render_ids) < len(scientific_ids):
            warnings.append(
                "The render subset is smaller than the scientific subset; "
                "scientific_object_ids and scientific_hash remain the "
                "authoritative science set."
            )

        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now_iso(),
            "data_status": catalog["data_status"],
            "data": {
                "view": normalised_view,
                "lod_cap": self.lod_engine.shell_limits.get(normalised_view),
                "render_object_ids": render_ids,
                "scientific_object_ids": scientific_ids,
                "scientific_hash": scientific_hash,
                "render_count": len(render_ids),
                "scientific_count": len(scientific_ids),
                "unknown_requested_ids": unknown_requested,
                "id_kind": "CATALOG_ID",
                "semantic_lod_only": True,
            },
            "provenance": {
                **catalog["provenance"],
                "lod_engine_id": self.lod_engine.id,
                "render_rule": (
                    "Render subset is a visual LOD cap over the scientific set; "
                    "it never replaces or reduces the scientific set."
                ),
            },
            "warnings": warnings,
        }

    async def risk_graph(self) -> dict:
        """Derive edges from stored P4 conjunctions using stored metrics only."""
        result = await self.conjunction_service.list_conjunctions(
            object_ref=None,
            start_raw=None,
            stop_raw=None,
            source_grade=None,
            metric_type=None,
            threshold_min=None,
            threshold_max=None,
            limit_raw=settings.conjunctions_page_limit,
        )
        events = result["data"]["events"]
        edges = [_edge_from_event(event) for event in events]
        pc_states = sorted({edge["metrics"]["PC"]["status"] for edge in edges})

        return {
            "request_id": result["request_id"],
            "generated_at": result["generated_at"],
            "data_status": result["data_status"],
            "status_reason": result.get("status_reason"),
            "data": {
                "edge_count": len(edges),
                "edges": edges,
                "object_ids": sorted(
                    {edge["a"]["object_id"] for edge in edges}
                    | {edge["b"]["object_id"] for edge in edges}
                ),
                "snapshot_hash": canonical_hash(
                    [
                        {
                            "event_id": edge["evidence"]["event_id"],
                            "snapshot_id": edge["evidence"]["snapshot_id"],
                            "input_hash": edge["evidence"]["input_hash"],
                        }
                        for edge in sorted(
                            edges, key=lambda item: item["evidence"]["event_id"]
                        )
                    ]
                ),
                "pc_statuses_present": pc_states,
                "metric_channels": ["MISS_DISTANCE", "RELATIVE_SPEED", "PC", "MAX_PC"],
            },
            "provenance": {
                **result["provenance"],
                "scientific_source": SCIENTIFIC_SOURCE,
                "derivation": "STORED_P4_CONJUNCTION_LATEST_SNAPSHOT",
                "metric_policy": NO_SYNTHETIC_SCORE_NOTE,
            },
            "warnings": [*result.get("warnings", []), NO_SYNTHETIC_SCORE_NOTE],
        }

    async def object_risk(self, object_id: str) -> dict:
        """Summarise one object's stored conjunctions; absent Pc stays absent."""
        identity = await self.identity_repository.resolve_object(object_id)
        if identity is None:
            return {
                "request_id": str(uuid.uuid4()),
                "generated_at": _now_iso(),
                "data_status": "UNAVAILABLE",
                "status_reason": "OBJECT_NOT_IN_CATALOG",
                "data": {
                    "object_ref": object_id,
                    "object": None,
                    "event_count": 0,
                    "events": [],
                    "metrics": None,
                },
                "provenance": {
                    "scientific_source": SCIENTIFIC_SOURCE,
                    "lookup": "space_object BY catalog_id OR object_id",
                    "retrieved_at": _now_iso(),
                },
                "warnings": [
                    "No canonical object matches this identifier; no risk summary "
                    "is produced for an unknown object."
                ],
            }

        result = await self.conjunction_service.list_conjunctions(
            object_ref=object_id,
            start_raw=None,
            stop_raw=None,
            source_grade=None,
            metric_type=None,
            threshold_min=None,
            threshold_max=None,
            limit_raw=settings.conjunctions_page_limit,
        )
        events = result["data"]["events"]
        edges = [_edge_from_event(event) for event in events]

        miss_values = [
            edge["metrics"]["MISS_DISTANCE"]["value"]
            for edge in edges
            if edge["metrics"]["MISS_DISTANCE"]["value"] is not None
        ]
        speed_values = [
            edge["metrics"]["RELATIVE_SPEED"]["value"]
            for edge in edges
            if edge["metrics"]["RELATIVE_SPEED"]["value"] is not None
        ]
        pc_values = [
            edge["metrics"]["PC"]["value"]
            for edge in edges
            if edge["metrics"]["PC"]["value"] is not None
        ]
        pc_reasons = sorted(
            {
                str(edge["metrics"]["PC"]["unavailable_reason"])
                for edge in edges
                if edge["metrics"]["PC"]["value"] is None
                and edge["metrics"]["PC"]["unavailable_reason"] is not None
            }
        )
        tcas = sorted(edge["tca"] for edge in edges if edge["tca"] is not None)

        if not edges:
            data_status = "INSUFFICIENT_DATA"
            status_reason = "NO_STORED_CONJUNCTION_EVENT_FOR_OBJECT"
        else:
            data_status = result["data_status"]
            status_reason = result.get("status_reason")

        source = await self.identity_repository.object_source_provenance(
            identity["object_id"]
        )
        warnings = list(result.get("warnings", []))
        warnings.append(NO_SYNTHETIC_SCORE_NOTE)
        if not edges:
            warnings.append(
                "The object exists in the catalog but no stored screening run "
                "produced a conjunction for it; no risk value is invented."
            )

        return {
            "request_id": result["request_id"],
            "generated_at": result["generated_at"],
            "data_status": data_status,
            "status_reason": status_reason,
            "data": {
                "object_ref": object_id,
                "object": _identity_payload(identity),
                "event_count": len(edges),
                "events": edges,
                "metrics": {
                    "MISS_DISTANCE": {
                        "min_m": min(miss_values) if miss_values else None,
                        "max_m": max(miss_values) if miss_values else None,
                        "sample_count": len(miss_values),
                        "unit": "m",
                        "status": "COMPUTED" if miss_values else "NOT_COMPUTED",
                    },
                    "RELATIVE_SPEED": {
                        "max_mps": max(speed_values) if speed_values else None,
                        "sample_count": len(speed_values),
                        "unit": "m/s",
                        "status": "COMPUTED" if speed_values else "NOT_COMPUTED",
                    },
                    "PC": {
                        "value": None if not pc_values else max(pc_values),
                        "sample_count": len(pc_values),
                        "status": "COMPUTED" if pc_values else "NOT_COMPUTED",
                        "unavailable_reasons": pc_reasons,
                    },
                },
                "tca_window": {
                    "first": tcas[0] if tcas else None,
                    "last": tcas[-1] if tcas else None,
                },
            },
            "provenance": {
                **result["provenance"],
                "scientific_source": SCIENTIFIC_SOURCE,
                "derivation": "STORED_P4_CONJUNCTION_LATEST_SNAPSHOT",
                "object_source_id": (source or {}).get("source_id"),
                "object_source_uri": (source or {}).get("source_uri"),
                "object_retrieved_at": _iso_or_none((source or {}).get("retrieved_at")),
                "object_content_sha256": (source or {}).get("content_sha256"),
                "metric_policy": NO_SYNTHETIC_SCORE_NOTE,
            },
            "warnings": warnings,
        }

    async def genealogy(self, object_id: str) -> dict | None:
        """Report fragment lineage inferable from stored identity fields only.

        Returns ``None`` when no canonical object matches the identifier. When
        the object exists, every parentage claim is accompanied by the naming
        or COSPAR rule that produced it: the store holds no fragmentation-event
        record, so parentage is always an inference, never an observation.
        """
        identity = await self.identity_repository.resolve_object(object_id)
        if identity is None:
            return None

        canonical_name = identity.get("canonical_name")
        cospar_id = identity.get("cospar_id")
        evidence: list[dict[str, Any]] = []

        name_match = (
            _FRAGMENT_NAME_PATTERN.match(canonical_name.strip())
            if isinstance(canonical_name, str)
            else None
        )
        inferred_parent_name = name_match.group("parent") if name_match else None
        if name_match:
            cloud_size = await self.identity_repository.count_by_canonical_name(
                canonical_name
            )
            evidence.append(
                {
                    "rule": "CANONICAL_NAME_DEBRIS_SUFFIX",
                    "field": "space_object.canonical_name",
                    "observed": canonical_name,
                    "inferred_parent_name": inferred_parent_name,
                    "fragment_cloud_size_in_catalog": cloud_size,
                    "certainty": "NAMING_CONVENTION_ONLY",
                }
            )
        else:
            evidence.append(
                {
                    "rule": "CANONICAL_NAME_DEBRIS_SUFFIX",
                    "field": "space_object.canonical_name",
                    "observed": canonical_name,
                    "matched": False,
                    "certainty": "NO_FRAGMENT_NAMING_PATTERN",
                }
            )

        cospar_match = (
            _COSPAR_PATTERN.match(cospar_id.strip())
            if isinstance(cospar_id, str)
            else None
        )
        launch_id = cospar_match.group("launch") if cospar_match else None
        piece = cospar_match.group("piece") if cospar_match else None
        if cospar_match:
            cohort = await self.identity_repository.count_launch_cohort(launch_id or "")
            evidence.append(
                {
                    "rule": "COSPAR_LAUNCH_DESIGNATOR",
                    "field": "space_object.cospar_id",
                    "observed": cospar_id,
                    "launch_id": launch_id,
                    "piece": piece,
                    "launch_cohort_size_in_catalog": cohort,
                    "certainty": "DESIGNATOR_DERIVED",
                }
            )
        else:
            evidence.append(
                {
                    "rule": "COSPAR_LAUNCH_DESIGNATOR",
                    "field": "space_object.cospar_id",
                    "observed": cospar_id,
                    "matched": False,
                    "certainty": "NO_PARSABLE_COSPAR_ID",
                }
            )

        # Parentage is only claimed for objects the catalog itself names as
        # fragments. An intact object is never given a parent, and no object is
        # ever returned as its own parent.
        parent: dict[str, Any] | None = None
        parent_match_rule: str | None = None
        if name_match is not None:
            if launch_id is not None:
                primary_cospar = f"{launch_id}A"
                candidate = await self.identity_repository.find_object_by_cospar(
                    primary_cospar
                )
                if candidate is not None and (
                    candidate["object_id"] == identity["object_id"]
                ):
                    candidate = None
                evidence.append(
                    {
                        "rule": "COSPAR_PRIMARY_PIECE_LOOKUP",
                        "queried_cospar_id": primary_cospar,
                        "found": candidate is not None,
                        "found_canonical_name": (candidate or {}).get("canonical_name"),
                        "certainty": "CATALOG_ROW_PRESENT"
                        if candidate is not None
                        else "PARENT_ROW_ABSENT",
                    }
                )
                if candidate is not None:
                    parent = candidate
                    parent_match_rule = "COSPAR_PRIMARY_PIECE_LOOKUP"
            if parent is None and inferred_parent_name:
                candidate = await self.identity_repository.find_object_by_name(
                    inferred_parent_name
                )
                if candidate is not None and (
                    candidate["object_id"] == identity["object_id"]
                ):
                    candidate = None
                evidence.append(
                    {
                        "rule": "PARENT_NAME_LOOKUP",
                        "queried_canonical_name": inferred_parent_name,
                        "found": candidate is not None,
                        "certainty": "CATALOG_ROW_PRESENT"
                        if candidate is not None
                        else "PARENT_ROW_ABSENT",
                    }
                )
                if candidate is not None:
                    parent = candidate
                    parent_match_rule = "PARENT_NAME_LOOKUP"

        name_and_cospar_agree: bool | None = None
        if parent is not None and inferred_parent_name is not None:
            name_and_cospar_agree = (
                str(parent.get("canonical_name") or "").strip() == inferred_parent_name
            )

        if name_match is None:
            data_status = "INSUFFICIENT_DATA"
            uncertainty_state = "NOT_A_FRAGMENT_BY_NAMING"
            status_reason = (
                "OBJECT_IS_NOT_NAMED_AS_A_FRAGMENT"
                if cospar_match is not None
                else "NO_LINEAGE_EVIDENCE_IN_STORED_IDENTITY_FIELDS"
            )
        elif parent is not None:
            data_status = "PARTIAL"
            status_reason = "PARENT_INFERRED_FROM_IDENTIFIERS_NOT_FROM_EVENT_RECORD"
            uncertainty_state = "PARENT_CANDIDATE_MATCHED_BY_IDENTIFIER"
        else:
            data_status = "PARTIAL"
            status_reason = "PARENT_OBJECT_NOT_PRESENT_IN_CATALOG"
            uncertainty_state = "PARENT_NAMED_BUT_NOT_STORED"

        source = await self.identity_repository.object_source_provenance(
            identity["object_id"]
        )

        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": _now_iso(),
            "data_status": data_status,
            "status_reason": status_reason,
            "data": {
                "object": _identity_payload(identity),
                "is_fragment_by_naming": name_match is not None,
                "inferred_parent_name": inferred_parent_name,
                "launch_id": launch_id,
                "cospar_piece": piece,
                "parent_candidate": (
                    {
                        "object_id": parent["object_id"],
                        "catalog_id": parent["catalog_id"],
                        "canonical_name": parent["canonical_name"],
                        "cospar_id": parent["cospar_id"],
                        "object_type": parent["object_type"],
                        "matched_by": parent_match_rule,
                        "name_and_cospar_agree": name_and_cospar_agree,
                    }
                    if parent is not None
                    else None
                ),
                "breakup_event": {
                    "status": "UNAVAILABLE",
                    "reason": "NO_FRAGMENTATION_EVENT_RECORD_IN_STORE",
                    "epoch": None,
                    "cause": None,
                },
                "launch_date": {
                    "value": _iso_or_none(identity.get("launch_date")),
                    "status": (
                        "OK"
                        if identity.get("launch_date") is not None
                        else "UNAVAILABLE"
                    ),
                    "reason": (
                        None
                        if identity.get("launch_date") is not None
                        else "LAUNCH_DATE_NULL_IN_CATALOG"
                    ),
                },
                "evidence": evidence,
                "origin_uncertainty": {
                    "state": uncertainty_state,
                    "reason": (
                        "The catalog does not name this object as a fragment, so "
                        "no parent is claimed for it."
                        if name_match is None
                        else (
                            "Parentage is inferred from the catalog naming "
                            "convention and the COSPAR launch designator. The "
                            "store holds no fragmentation-event record, so this "
                            "lineage is an inference from identifiers, not an "
                            "observed parentage link."
                        )
                    ),
                    "inference_only": True,
                    "confirmed_by_event_record": False,
                },
            },
            "provenance": {
                "scientific_source": SCIENTIFIC_SOURCE,
                "derivation": "STORED_IDENTITY_FIELDS_ONLY",
                "source_id": (source or {}).get("source_id"),
                "source_uri": (source or {}).get("source_uri"),
                "retrieved_at": _iso_or_none((source or {}).get("retrieved_at")),
                "content_sha256": (source or {}).get("content_sha256"),
                "fields_used": [
                    "space_object.canonical_name",
                    "space_object.cospar_id",
                    "space_object.launch_date",
                ],
            },
            "warnings": [
                "Debris genealogy here is inferred from identifiers only; it is "
                "not an operational fragmentation attribution."
            ],
        }


def _identity_payload(identity: dict[str, Any]) -> dict[str, Any]:
    return {
        "object_id": identity["object_id"],
        "catalog_id": identity["catalog_id"],
        "canonical_name": identity["canonical_name"],
        "cospar_id": identity["cospar_id"],
        "object_type": identity["object_type"],
        "origin_code": identity["origin_code"],
        "object_status": identity["object_status"],
        "omm_solution_count": int(identity.get("omm_solution_count") or 0),
    }


def _edge_from_event(event: dict[str, Any]) -> dict[str, Any]:
    """Map one stored conjunction onto a graph edge without adding metrics."""
    snapshot = event["latest_snapshot"]
    metrics = snapshot["metrics"]
    return {
        "event_id": event["event_id"],
        "a": {
            "object_id": event["primary"]["object_id"],
            "catalog_id": event["primary"]["catalog_id"],
            "canonical_name": event["primary"]["canonical_name"],
        },
        "b": {
            "object_id": event["secondary"]["object_id"],
            "catalog_id": event["secondary"]["catalog_id"],
            "canonical_name": event["secondary"]["canonical_name"],
        },
        "tca": event["tca"],
        "event_status": event["event_status"],
        "metrics": {
            "MISS_DISTANCE": {
                "value": snapshot["miss_distance_m"],
                "unit": "m",
                "status": metrics["MISS_DISTANCE"]["status"],
                "channel_note": (
                    "Screening geometry only; not a collision probability."
                ),
            },
            "RELATIVE_SPEED": {
                "value": snapshot["relative_speed_mps"],
                "unit": "m/s",
                "status": (
                    "COMPUTED"
                    if snapshot["relative_speed_mps"] is not None
                    else "NOT_COMPUTED"
                ),
            },
            "PC": {
                "value": metrics["PC"]["value"],
                "method": metrics["PC"]["method"],
                "status": metrics["PC"]["status"],
                "unavailable_reason": metrics["PC"]["unavailable_reason"],
            },
            "MAX_PC": {
                "value": metrics["MAX_PC"]["value"],
                "method": metrics["MAX_PC"]["method"],
                "status": metrics["MAX_PC"]["status"],
            },
        },
        "covariance_status": snapshot["covariance_status"],
        "dilution_state": snapshot["dilution_state"],
        "tca_boundary_flag": snapshot["tca_boundary_flag"],
        "validation_state": snapshot["validation_state"],
        "evidence": {
            "event_id": event["event_id"],
            "snapshot_id": snapshot["snapshot_id"],
            "snapshot_at": snapshot["snapshot_at"],
            "source_event_id": event["source_event_id"],
            "model_version": snapshot["model_version"],
            "input_hash": snapshot["input_hash"],
            "source_grade": snapshot["source_grade"],
            "provenance": snapshot["provenance"],
        },
    }

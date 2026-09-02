from __future__ import annotations

import asyncio
import uuid

from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from aetherus_domain import CanonicalTimeContext, EvidenceClass, Scenario, SourceGrade, StateKind, StateVector, ValidationState
from aetherus_foundation import CoordinateReferenceFrameEngine, UniversalSpaceTimeEngine


class FrameTransformRequest(BaseModel):
    position_km: tuple[float, float, float]
    velocity_km_s: tuple[float, float, float] = (0.0, 0.0, 0.0)
    frame: str
    epoch_utc: datetime
    to_frame: str


class TrajectoryRequest(BaseModel):
    points: list[dict[str, Any]]
    source_label: str
    live: bool = False
    model_version: str | None = None
    assumptions: list[str] = Field(default_factory=list)
    target_orbit: dict[str, Any] | None = None
    stage_separations: list[dict[str, Any]] = Field(default_factory=list)


class PhotometryRequest(BaseModel):
    times_s: list[float]
    magnitudes: list[float]
    min_period_s: float = 1.0
    max_period_s: float = 100.0


class ObservationPlanRequest(BaseModel):
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    mount_rate_limit_deg_s: float = 5.0
    object_state: dict[str, Any] | None = None
    station: dict[str, Any] | None = None
    start_utc: datetime | None = None
    end_utc: datetime | None = None
    step_s: float = Field(default=30.0, gt=0, le=300)
    minimum_elevation_deg: float = Field(default=10.0, ge=-5, lt=90)


class CitizenObservationRequest(BaseModel):
    object_id: str
    observed_at: datetime
    value: float
    license_policy: str | None = None
    expected_min: float | None = None
    expected_max: float | None = None


class ReentryTipRequest(BaseModel):
    tip: dict[str, Any] | None = None
    source_id: str | None = None


class GenealogyWriteRequest(BaseModel):
    parent_id: str | None = None
    origin: str | None = None
    event_time_utc: datetime
    evidence_id: str
    known: bool = True


class ScenarioSpecRequest(BaseModel):
    kind: str
    target_object_ids: list[str]
    protected_object_ids: list[str] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)
    seed: int | None = None


class FragmentationRequest(ScenarioSpecRequest):
    fragment_count: int = Field(default=20, ge=1, le=10000)
    parent_state: dict[str, Any]
    encounter_states: list[dict[str, Any]] = Field(default_factory=list)
    horizon_s: float = Field(default=3600.0, gt=0, le=604800)
    step_s: float = Field(default=30.0, gt=0, le=3600)
    affected_distance_km: float = Field(default=5.0, gt=0, le=1000)


class CandidateRankingRequest(BaseModel):
    protected_active: bool = True
    candidates: list[dict[str, Any]]
    primary_state: dict[str, Any] | None = None
    encounter_states: list[dict[str, Any]] = Field(default_factory=list)
    horizon_s: float = Field(default=3600.0, gt=0, le=604800)
    step_s: float = Field(default=30.0, gt=0, le=3600)
    risk_threshold_km: float = Field(default=5.0, gt=0, le=1000)


class LaunchStateTransitionRequest(BaseModel):
    to_state: str
    at_utc: datetime
    evidence_id: str | None = None
    official: bool = False
    reason: str | None = None


class TelemetryIngestRequest(BaseModel):
    timestamp_utc: datetime
    metrics: dict[str, float]
    units: dict[str, str]
    source_id: str
    live: bool = False
    sequence: int | None = None


class SemanticZoomRequest(BaseModel):
    action: str
    object_id: str | None = None
    event_id: str | None = None
    scale: str | None = None


class DecisionRequest(BaseModel):
    baseline_scenario_id: UUID
    option_scenario_ids: list[str]
    criteria: list[str]
    policy: dict[str, float] | None = None


def _packet_number(packet, field: str) -> float | None:
    """Read one numeric input from the stored packet, or report its absence."""
    for holder in (getattr(packet, "event", None), packet):
        value = getattr(holder, field, None)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        payload = getattr(holder, "payload", None)
        if isinstance(payload, dict) and isinstance(payload.get(field), (int, float)):
            return float(payload[field])
    return None


def _packet_affected_count(packet) -> int | None:
    event = getattr(packet, "event", None)
    for field in ("affected_objects", "affected_object_ids", "object_ids"):
        value = getattr(event, field, None)
        if isinstance(value, int):
            return value
        if isinstance(value, (list, tuple, set)):
            return len(value)
    return None


def _decision_criteria(result: dict, criteria: list[str]) -> dict[str, float]:
    """Pull each requested criterion out of a stored execution, if present."""
    values: dict[str, float] = {}
    attributions = result.get("attributions") or []
    for name in criteria:
        if isinstance(result.get(name), (int, float)):
            values[name] = float(result[name]); continue
        deltas = [a.get("delta") for a in attributions
                  if a.get("metric_type") == name and isinstance(a.get("delta"), (int, float))]
        if deltas:
            # A removal lowers risk, so a negative delta is a benefit; score the
            # benefit rather than the signed delta.
            values[name] = float(-sum(deltas))
    return values


def _decision_new_risk(result: dict) -> float:
    new = result.get("new") or result.get("new_edges") or ()
    total = 0.0
    for item in new:
        value = item.get("value") if isinstance(item, dict) else None
        if isinstance(value, (int, float)):
            total += float(value)
    return total


#: Accepted counterfactual jobs for this process. The durable record is the
#: scenario_run row the job creates; this only maps a handle to a running task.
_COUNTERFACTUAL_JOBS: dict[str, Any] = {}


class PhysicalCounterfactualRequest(BaseModel):
    target_catalog_id: str
    horizon_hours: float | None = None
    recompute_mode: str = "FULL"
    #: Pair count is quadratic; an unbounded recompute over the ~19k-object
    #: catalogue takes tens of minutes. The response records the coverage.
    max_objects: int = 150
    #: Run synchronously instead of accepting a job. Only sensible for a small
    #: scope or for tooling that can wait minutes.
    wait: bool = False


def register_registry_routes(
    app: FastAPI,
    *,
    repo,
    require_product: Callable[[], Any],
    envelope: Callable[..., dict[str, Any]],
    jsonable: Callable[[Any], Any],
    orbital_backend=None,
    space_weather_client=None,
    neo_client=None,
    launch_client=None,
    conjunction_signal_source=None,
) -> None:
    """Expose the Engine Registry API surface without inventing scientific truth.

    Read endpoints return UNAVAILABLE/INSUFFICIENT_DATA when a live/official source is
    absent. Mutating scientific inputs are intentionally limited to explicit local
    validation/simulation paths in this continuation.

    Injected collaborators are all optional so the fixture-only app (and every
    test that builds it) keeps its existing honest-fixture behaviour; when a
    collaborator is supplied the route serves real source-backed truth instead.
    """

    async def _live(call: Callable[[], Any], *, unavailable_data: Any):
        """Run one live-provider call and translate its failures into honest states.

        A provider outage must never become a fabricated value, so every error
        path returns an explicit status with the provider's own reason.
        """
        from backend.ingestion.errors import (
            InsufficientDataError,
            ProviderUnavailableError,
            RateLimitedError,
        )

        try:
            result = await call()
        except RateLimitedError as error:
            return envelope(
                unavailable_data,
                data_status="UNAVAILABLE",
                warnings=[f"Provider is rate limited; no value is invented. {error}"],
            )
        except InsufficientDataError as error:
            return envelope(
                unavailable_data,
                data_status="INSUFFICIENT_DATA",
                warnings=[str(error)],
            )
        except ProviderUnavailableError as error:
            return envelope(
                unavailable_data,
                data_status="UNAVAILABLE",
                warnings=[str(error)],
            )
        payload = result.to_dict()
        status = payload.pop("status", "OK")
        notes = payload.pop("notes", [])
        skipped = payload.get("skipped_row_count") or 0
        warnings = list(notes)
        if skipped:
            warnings.append(
                f"{skipped} provider rows were skipped and counted, never silently dropped."
            )
        return envelope(payload, data_status=status, warnings=warnings)

    # E02 — canonical identity
    @app.get("/v1/objects")
    async def objects_list(limit: int = 200, source: str = "AUTO"):
        """Serve the real operational catalog when the science bridge is wired.

        ``source=FOUNDATION`` still exposes the local foundation entities
        (missions, launch vehicles) that the product store owns, so neither
        lineage hides the other.
        """
        if orbital_backend is not None and source != "FOUNDATION":
            catalog = getattr(orbital_backend, "catalog", None)
            if catalog is not None:
                return await catalog(limit)
        return envelope([o.model_dump(mode="json") for o in repo.list_canonicals(limit=limit)])

    # E03 — provenance
    @app.get("/v1/provenance/{provenance_id}")
    def provenance_detail(provenance_id: UUID):
        bundle = repo.get_provenance(provenance_id)
        if bundle is not None:
            return envelope(bundle.model_dump(mode="json"), provenance={"input_hash": bundle.provenance_hash})
        bundles = repo.provenance_for_evidence(provenance_id)
        if bundles:
            return envelope([b.model_dump(mode="json") for b in bundles], provenance={"evidence_id": str(provenance_id)})
        raise HTTPException(404, "provenance/evidence not found")

    # E04 — universal time
    @app.get("/v1/time/resolve")
    def time_resolve(
        at: datetime,
        mode: StateKind = StateKind.NOW,
        timezone_name: str | None = None,
        archived_snapshot_id: str | None = None,
        reconstructed_from_snapshot_ids: list[str] = Query(default=[]),
        model_id: str | None = None,
    ):
        try:
            if timezone_name:
                ctx = UniversalSpaceTimeEngine().resolve_local(
                    at, timezone_name, mode=mode, archived_snapshot_id=archived_snapshot_id,
                    reconstructed_from_snapshot_ids=reconstructed_from_snapshot_ids, model_id=model_id,
                )
            else:
                ctx = CanonicalTimeContext(
                    mode=mode, cursor_utc=at, archived_snapshot_id=archived_snapshot_id,
                    reconstructed_from_snapshot_ids=reconstructed_from_snapshot_ids, model_id=model_id,
                )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(ctx.model_dump(mode="json"))

    # E05 — coordinate/reference frames
    @app.post("/internal/frames/transform")
    def frame_transform(req: FrameTransformRequest):
        try:
            result = CoordinateReferenceFrameEngine().transform(
                StateVector(position_km=req.position_km, velocity_km_s=req.velocity_km_s, frame=req.frame, epoch_utc=req.epoch_utc),
                req.to_frame,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(
            result.model_dump(mode="json"), data_status=result.provenance.validation_state.value,
            provenance={"method": result.provenance.method}, warnings=result.provenance.limitations,
        )

    # E08/E09 — local research ephemeris and derived celestial geometry
    @app.get("/v1/space/objects/{object_id}")
    def space_object(object_id: str, at: datetime | None = None, observer: str = "SUN"):
        p = require_product()
        try:
            state = p.space.state(object_id, at or p.universe.current_time_utc, observer=observer)
        except (KeyError, ValueError) as exc:
            raise HTTPException(404, str(exc)) from exc
        return envelope(state, data_status=state.validation_state.value, provenance={"provider": state.provider, "kernel_version": state.kernel_version})

    @app.get("/v1/space/events")
    def space_events(a: str = "EARTH", b: str = "MARS", at: datetime | None = None, threshold_deg: float = 5.0):
        p = require_product(); when = at or p.universe.current_time_utc
        try:
            sa, sb = p.space.state(a, when), p.space.state(b, when)
            event = p.celestial_events.close_approach(sa, sb, threshold_deg=threshold_deg)
        except (KeyError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope([] if event is None else [jsonable(event)], data_status="RESEARCH_ONLY", warnings=["Derived local geometry; not labelled OFFICIAL."])

    # E10 — no current live SWPC source is fabricated in the offline runtime.
    @app.get("/v1/space-weather/current")
    async def space_weather_current():
        if space_weather_client is None:
            return envelope(None, data_status="UNAVAILABLE", warnings=["No space-weather provider is configured in this deployment."])
        return await _live(
            lambda: space_weather_client.fetch_planetary_k_index(max_samples=180),
            unavailable_data=None,
        )

    @app.get("/v1/space-weather/history")
    async def space_weather_history():
        if space_weather_client is None:
            return envelope([], data_status="UNAVAILABLE", warnings=["No space-weather provider is configured in this deployment."])
        # The 1-minute Kp feed is itself the recent archive SWPC publishes; a
        # longer history needs a separate ingested dataset, so say so instead of
        # padding this response.
        payload = await _live(
            lambda: space_weather_client.fetch_planetary_k_index(),
            unavailable_data=[],
        )
        payload.setdefault("warnings", []).append(
            "Recent SWPC 1-minute samples only; no long-term Kp archive is ingested."
        )
        return payload

    @app.get("/v1/space-weather/flares")
    async def space_weather_flares():
        if space_weather_client is None:
            return envelope([], data_status="UNAVAILABLE", warnings=["No space-weather provider is configured in this deployment."])
        return await _live(
            lambda: space_weather_client.fetch_latest_xray_flares(),
            unavailable_data=[],
        )

    @app.get("/v1/space/weather/drag-context")
    async def space_weather_drag_context():
        """E10 on the product surface, refusing to derive what it cannot.

        The Kp and X-ray routes return the provider payload directly, so E10
        never ran and its central statement never reached a client: no named
        atmospheric density model is wired to this service, therefore no density
        factor is produced. A response that simply omits the factor reads as if
        it merely happened to be missing today.
        """
        if space_weather_client is None:
            return envelope(None, data_status="UNAVAILABLE", warnings=["No space-weather provider is configured in this deployment."])
        payload = await _live(lambda: space_weather_client.fetch_planetary_k_index(max_samples=8), unavailable_data=None)
        data = payload.get("data") or {}
        samples = data.get("samples") or []
        if not samples:
            return envelope(None, data_status=payload.get("data_status", "UNAVAILABLE"),
                            warnings=payload.get("warnings") or ["No Kp sample was returned by the provider."])
        latest = samples[-1]
        observed_raw = latest.get("time_tag")
        if not observed_raw:
            return envelope(None, data_status="INSUFFICIENT_DATA",
                            warnings=["The provider sample carries no time tag; freshness cannot be judged."])
        observed = datetime.fromisoformat(str(observed_raw).replace("Z", "+00:00"))
        # Published Kp only. estimated_kp is the provider's own estimate and is
        # kept distinct from the measured index rather than merged into it.
        measurements = {}
        forecasts = {}
        if isinstance(latest.get("kp_index"), (int, float)):
            measurements["kp"] = float(latest["kp_index"])
        elif isinstance(latest.get("estimated_kp"), (int, float)):
            forecasts["kp"] = float(latest["estimated_kp"])
        engine = require_product().space_weather
        state = engine.normalize(
            observed_at=observed,
            received_at=datetime.now(timezone.utc),
            measurements=measurements,
            forecasts=forecasts,
            source_id=str(data.get("source_id") or "noaa_swpc"),
            source_grade=SourceGrade.OFFICIAL_PUBLIC,
        )
        drag = getattr(state, "drag_context", None) or {}
        return envelope(
            {
                "observed_at": observed.isoformat(),
                "indices": drag.get("indices", {}),
                "density_factor": drag.get("density_factor"),
                "density_factor_status": drag.get("density_factor_status"),
                "density_factor_reason": drag.get("density_factor_reason"),
                "normalized_by": engine.id,
            },
            data_status=getattr(state, "data_status", "OK"),
            warnings=["Kp is a dimensionless activity index and is not converted into any other quantity."],
        )

    # E11 — NASA/JPL SBDB close-approach data (public, no credential).
    @app.get("/v1/space/neo")
    async def neo_list(limit: int = 50, dist_max_au: float = 0.05):
        if neo_client is None:
            return envelope([], data_status="UNAVAILABLE", warnings=["No NEO provider is configured in this deployment."])
        return await _live(
            lambda: neo_client.fetch_close_approaches(limit=limit, dist_max_au=dist_max_au),
            unavailable_data=[],
        )

    @app.get("/v1/space/neo/{object_id}")
    async def neo_detail(object_id: str):
        if neo_client is None:
            return envelope({"object_id": object_id, "state": None}, data_status="UNAVAILABLE", warnings=["No NEO provider is configured in this deployment."])
        payload = await _live(
            lambda: neo_client.fetch_close_approaches(limit=200),
            unavailable_data=None,
        )
        data = payload.get("data") or {}
        raw_matches = [
            row for row in (data.get("approaches") or [])
            if str(row.get("designation", "")).strip().lower() == object_id.strip().lower()
        ]
        # E11 normalises each row instead of the route passing provider JSON
        # through untouched. The engine is what maps source grade onto a
        # validation state and refuses to promote an unsourced impact claim, so
        # skipping it dropped exactly the labelling that makes the row honest.
        engine = require_product().small_bodies
        matches = []
        for row in raw_matches:
            state = engine.normalize(
                {
                    "object_id": row.get("designation"),
                    "close_approach_utc": row.get("close_approach_utc"),
                    "nominal_distance_km": row.get("nominal_distance_km"),
                    "distance_uncertainty_km": row.get("distance_uncertainty_km"),
                    "impact_claim": row.get("impact_claim"),
                    "impact_claim_source": row.get("impact_claim_source"),
                },
                source_id=str(data.get("source_id") or "jpl_sbdb"),
                source_grade=SourceGrade.OFFICIAL_PUBLIC,
            )
            matches.append({
                **row,
                "normalized": {
                    "object_id": state.object_id,
                    "close_approach_utc": state.close_approach_utc.isoformat() if state.close_approach_utc else None,
                    "nominal_distance_km": state.nominal_distance_km,
                    "distance_uncertainty_km": state.distance_uncertainty_km,
                    "impact_claim": state.impact_claim,
                    "validation_state": state.validation_state.value,
                    "normalized_by": engine.id,
                },
            })
        if not matches:
            return envelope(
                {"object_id": object_id, "approaches": []},
                data_status="UNAVAILABLE",
                warnings=[f"No close approach for '{object_id}' in the queried window; nothing is inferred."],
            )
        return envelope(
            {"object_id": object_id, "approaches": matches, "units": data.get("units")},
            data_status=payload.get("data_status", "OK"),
            warnings=payload.get("warnings", []),
        )

    @app.get("/v1/space/missions")
    def deep_space_missions():
        # E12 normalises whatever has been ingested. The empty case is now a fact
        # about the store rather than a literal in this function.
        states=require_product().deep_space_states()
        return envelope(
            states,
            data_status="OK" if states else "UNAVAILABLE",
            warnings=[] if states else ["No source-backed deep-space mission state has been ingested."],
        )

    # E14-E19 — Control read surface. No telemetry/model values are invented.
    @app.get("/v1/launches/upcoming")
    async def upcoming_launches(limit: int = 10):
        if launch_client is not None:
            return await _live(
                lambda: launch_client.fetch_upcoming(limit=limit),
                unavailable_data=[],
            )
        p = require_product(); now = p.universe.current_time_utc; out=[]
        for mission in p.missions.list():
            hist=p.launch_schedule.history(mission.mission_id)
            if hist and hist[-1].start_utc and hist[-1].start_utc >= now:
                out.append({"mission":jsonable(mission),"window":jsonable(hist[-1])})
        return envelope(out, data_status="OK" if out else "UNAVAILABLE", warnings=[] if out else ["No source-backed future launch window has been loaded."])

    @app.get("/v1/missions/{mission_id}/window")
    def mission_window(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        hist=[jsonable(x) for x in p.launch_schedule.history(mission_id)]
        return envelope(hist, data_status="OK" if hist else "UNAVAILABLE", warnings=[] if hist else ["Mission exists, but no launch-window feed is loaded."])

    @app.get("/v1/missions/{mission_id}/state")
    def mission_state(mission_id: str):
        p=require_product(); m=p.missions.get(mission_id)
        if m is None: raise HTTPException(404,"mission not found")
        # E15 now exists for every registered mission instead of only for the
        # ones nothing ever created. Its countdown is anchored to the real
        # launch-window revision; transitions come from evidence, never from here.
        machine=p.ensure_launch_state(mission_id)
        countdown=p.launch_schedule.countdown_seconds(mission_id, datetime.now(timezone.utc))
        return envelope({
            "mission_id":mission_id,
            "state":machine.state.value,
            "registry_status":m.status,
            "transitions":[jsonable(x) for x in machine.history],
            "countdown_anchor_utc":machine.countdown_anchor.isoformat() if machine.countdown_anchor else None,
            "countdown_seconds":countdown,
            "source":"E15_STATE_MACHINE",
        }, data_status="OK", warnings=[] if machine.history else [
            "No state transition has been recorded; the machine reports its initial state."
        ])

    @app.post("/v1/missions/{mission_id}/state")
    def mission_state_transition(mission_id: str, req: LaunchStateTransitionRequest):
        p=require_product()
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        try:
            transition=p.transition_launch_state(
                mission_id, req.to_state, at_utc=req.at_utc,
                evidence_id=req.evidence_id, official=req.official, reason=req.reason,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(jsonable(transition),
                        data_status="OK",
                        warnings=[] if req.official else ["Unofficial transition; recorded as MODEL_SIGNAL."])

    @app.post("/v1/missions/{mission_id}/telemetry")
    def mission_telemetry_ingest(mission_id: str, req: TelemetryIngestRequest):
        """The writer E16 never had.

        ``telemetry_by_mission`` was initialised empty with no code path that
        could add to it, so the fusion engine was unreachable by construction.
        This adds the path; it adds no samples. Without an operator or official
        feed the read route below still reports UNAVAILABLE.
        """
        p=require_product()
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        try:
            sample=p.ingest_telemetry(
                mission_id, timestamp_utc=req.timestamp_utc, metrics=req.metrics,
                units=req.units, source_id=req.source_id, live=req.live, sequence=req.sequence,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(jsonable(sample), data_status="OK", warnings=[] if req.live else [
            "Modelled telemetry: recorded as MODEL_SIGNAL, never as observed."
        ])

    @app.get("/v1/missions/{mission_id}/telemetry")
    def mission_telemetry(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        fusion=p.telemetry_by_mission.get(mission_id); rows=[jsonable(x) for x in fusion.samples()] if fusion else []
        return envelope(rows, data_status="OK" if rows else "UNAVAILABLE", warnings=[] if rows else ["No live/official telemetry has been ingested; modelled telemetry is not fabricated."])

    @app.get("/v1/missions/{mission_id}/trajectory")
    def mission_trajectory(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        record=p.product_store.latest_record("CONTROL","TRAJECTORY",mission_id)
        return envelope(record["payload"] if record else None, data_status="OK" if record else "UNAVAILABLE", warnings=[] if record else ["No source-backed or explicitly modelled trajectory is stored."])

    @app.post("/v1/missions/{mission_id}/trajectory")
    def mission_trajectory_model(mission_id: str, req: TrajectoryRequest):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        if req.live:
            raise HTTPException(403,"Public API cannot self-declare telemetry/trajectory as live observed data; ingest through a verified provider/evidence path.")
        try:
            traj=p.trajectory.build(req.points,source_label=req.source_label,live=False,model_version=req.model_version,assumptions=req.assumptions,target_orbit=req.target_orbit,stage_separations=req.stage_separations)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        payload=jsonable(traj); p.product_store.append_record(domain="CONTROL",record_type="TRAJECTORY",entity_key=mission_id,payload=payload,observed_at=p.universe.current_time_utc,evidence_class="MODEL_SIGNAL",validation_state="RESEARCH_ONLY")
        return envelope(payload,data_status="RESEARCH_ONLY",warnings=["Explicitly modelled trajectory; never promoted to live telemetry."])

    @app.get("/v1/missions/{mission_id}/timeline")
    def mission_timeline(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        rows=[jsonable(x) for x in p.timeline.ordered() if x.payload.get("mission_id")==mission_id]
        return envelope(rows, data_status="OK" if rows else "UNAVAILABLE")

    @app.get("/v1/missions/{mission_id}/objects")
    def mission_objects(mission_id: str):
        p=require_product();
        if p.missions.get(mission_id) is None: raise HTTPException(404,"mission not found")
        rows=[jsonable(x) for x in p.handover.list_handovers(mission_id)]
        return envelope(rows, data_status="OK" if rows else "UNAVAILABLE")

    # E20-E25 — local validation orbit paths remain SCREENING_ONLY.
    def _validation_orbit_object(object_id: str, at: datetime | None = None):
        p=require_product(); snap=p.orbit_snapshot(at)
        for obj in snap["objects"]:
            if obj["object_id"]==object_id: return obj, snap
        raise HTTPException(404,"only explicit VAL-* validation objects have local orbit states")

    @app.get("/v1/objects/{object_id}/ephemeris")
    async def object_ephemeris(object_id: str, at: datetime | None = None):
        if orbital_backend is not None:
            return await orbital_backend.ephemeris(object_id, at)
        obj,_=_validation_orbit_object(object_id,at)
        return envelope(obj,data_status="SCREENING_ONLY",warnings=["Local validation fixture; not operational catalog ephemeris."])

    @app.get("/v1/conjunctions/{conjunction_id}/risk")
    async def conjunction_risk(conjunction_id: str, at: datetime | None = None):
        if orbital_backend is not None:
            return await orbital_backend.conjunction_risk(conjunction_id, at)
        p=require_product(); snap=p.orbit_snapshot(at)
        valid={"VAL-A:VAL-B","VAL-B:VAL-A","VALIDATION_PAIR"}
        if conjunction_id not in valid: raise HTTPException(404,"conjunction not found")
        return envelope(snap["risk"],data_status=snap["risk"]["validation_state"],warnings=["Pc remains null because covariance is unavailable."])

    @app.get("/v1/risk-graph")
    async def risk_graph():
        if orbital_backend is not None:
            real=getattr(orbital_backend,"risk_graph",None)
            if real is not None:
                return await real()
        p=require_product(); edges=[
            p.risk_graph.build_edge("VAL-A","VAL-B",metrics={"screening_score":0.20,"pc":None},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),
            p.risk_graph.build_edge("VAL-B","VAL-C",metrics={"screening_score":0.10,"pc":None},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),
        ]
        return envelope({"edges":[jsonable(x) for x in edges],"snapshot_hash":p.risk_graph.snapshot_hash(edges),"fixture_class":"VALIDATION_FIXTURE"},data_status="RESEARCH_ONLY",warnings=["screening_score is not collision probability (Pc)."])

    @app.get("/v1/objects/{object_id}/risk")
    async def object_risk(object_id: str):
        if orbital_backend is not None:
            real=getattr(orbital_backend,"object_risk",None)
            if real is not None:
                return await real(object_id)
        p=require_product()
        if object_id not in {"VAL-A","VAL-B","VAL-C"}: raise HTTPException(404,"local risk is only available for VAL-* fixtures")
        graph=(await risk_graph())["data"]; score=sum(float(e["metrics"].get("screening_score") or 0) for e in graph["edges"] if object_id in {e["a"],e["b"]})
        return envelope({"object_id":object_id,"screening_score":score,"pc":None,"fixture_class":"VALIDATION_FIXTURE"},data_status="RESEARCH_ONLY")

    @app.get("/v1/orbit/render-set")
    async def orbit_render_set(
        view: str = Query(default="GLOBAL", pattern="^(GLOBAL|LEO|MEO|GEO)$"),
        viewport_query: list[str] = Query(default=[]),
        important_ids: list[str] = Query(default=[]),
    ):
        if orbital_backend is not None:
            real=getattr(orbital_backend,"render_set",None)
            if real is not None:
                return await real(view=view,viewport_query=viewport_query,important_ids=important_ids)
        result=require_product().orbit_render_set(view=view,viewport_query=viewport_query,important_ids=important_ids)
        return envelope(
            result,
            data_status=result["data_status"],
            warnings=["Semantic LOD affects rendering only; scientific object selection and risk calculations are unchanged."],
        )

    @app.get("/v1/genealogy/{object_id}")
    async def genealogy(object_id: str):
        if orbital_backend is not None:
            real=getattr(orbital_backend,"genealogy",None)
            if real is not None:
                result=await real(object_id)
                if result is not None:
                    return result
        rows=require_product().genealogy_timeline(object_id)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE",warnings=[] if rows else ["No evidence-backed debris genealogy is stored for this object."])

    @app.post("/v1/genealogy/{object_id}")
    def genealogy_write(object_id: str, req: GenealogyWriteRequest):
        try:
            link=require_product().add_genealogy_link(
                child_id=object_id,parent_id=req.parent_id,origin=req.origin,
                event_time_utc=req.event_time_utc,evidence_id=req.evidence_id,known=req.known,
            )
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
        return envelope(
            jsonable(link),data_status="OK" if req.known else "INSUFFICIENT_DATA",
            provenance={"evidence_id":req.evidence_id},
        )

    # E26-E33 — simulation/research-only product tools.
    @app.post("/v1/scenarios/fragmentation")
    def fragmentation(req: FragmentationRequest):
        p=require_product()
        if req.seed is None: raise HTTPException(422,"fixed seed required")
        try:
            result=p.run_fragmentation_scenario(
                target_object_ids=req.target_object_ids,protected_object_ids=req.protected_object_ids,
                parameters=req.parameters,assumptions=req.assumptions,seed=req.seed,
                fragment_count=req.fragment_count,parent_state=req.parent_state,
                encounter_states=req.encounter_states,horizon_s=req.horizon_s,
                step_s=req.step_s,affected_distance_km=req.affected_distance_km,
            )
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope(jsonable(result),data_status="RESEARCH_ONLY",warnings=["SIMULATION_ONLY; fragment cloud is not observed debris."])

    @app.get("/v1/reentry")
    def reentry_list():
        p=require_product(); rows=[]
        for oid, seq in p.reentry._history.items(): rows.extend(jsonable(x) for x in seq)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE",warnings=[] if rows else ["No source-backed TIP/re-entry estimate has been ingested."])

    @app.get("/v1/reentry/{object_id}")
    def reentry_detail(object_id: str):
        rows=require_product().reentry_history(object_id)
        return envelope(rows,data_status="OK" if rows else "INSUFFICIENT_DATA")

    @app.post("/v1/reentry/{object_id}")
    def reentry_ingest(object_id: str, req: ReentryTipRequest):
        try:
            result=require_product().ingest_reentry_tip(object_id=object_id,tip=req.tip,source_id=req.source_id)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc
        return envelope(jsonable(result),data_status=result.validation_state.value,provenance={"source_id":req.source_id})

    @app.get("/v1/objects/{object_id}/rotation")
    def rotation_detail(object_id: str):
        return envelope({"object_id":object_id,"estimate":None},data_status="INSUFFICIENT_DATA",warnings=["Photometry samples are required; a period is not guessed."])

    @app.post("/v1/objects/{object_id}/rotation")
    def rotation_estimate(object_id: str, req: PhotometryRequest):
        result=require_product().estimate_rotation(
            object_id=object_id,times_s=req.times_s,magnitudes=req.magnitudes,
            min_period_s=req.min_period_s,max_period_s=req.max_period_s,
        )
        return envelope({"object_id":object_id,"estimate":jsonable(result)},data_status=result.validation_state.value)

    @app.get("/v1/observations/requests")
    def observation_requests():
        rows=require_product().observation_requests()
        return envelope(rows,data_status="SCREENING_ONLY" if rows else "INSUFFICIENT_DATA",warnings=[] if rows else ["No computed visibility windows are stored."])

    @app.post("/v1/observations/requests")
    def observation_plan(req: ObservationPlanRequest):
        if req.object_state is not None or req.station is not None:
            if req.object_state is None or req.station is None or req.start_utc is None or req.end_utc is None:
                raise HTTPException(422,"object_state, station, start_utc and end_utc are required together")
            try:
                result=require_product().compute_visibility(
                    object_state=req.object_state,station=req.station,start_utc=req.start_utc,
                    end_utc=req.end_utc,step_s=req.step_s,
                    minimum_elevation_deg=req.minimum_elevation_deg,
                    mount_rate_limit_deg_s=req.mount_rate_limit_deg_s,
                )
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            return envelope(
                jsonable(result),data_status=result.validation_state,provenance=result.provenance,
                warnings=["Screening visibility only; illumination is NOT_COMPUTED without an authoritative Sun vector."],
            )
        try: rows=require_product().observation_planning.plan(req.candidates,mount_rate_limit_deg_s=req.mount_rate_limit_deg_s)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope([jsonable(x) for x in rows],data_status="RESEARCH_ONLY")

    @app.post("/v1/observations/submissions")
    def observation_submit(req: CitizenObservationRequest):
        expected=None if req.expected_min is None or req.expected_max is None else (req.expected_min,req.expected_max)
        obs=require_product().submit_citizen_observation(object_id=req.object_id,observed_at=req.observed_at,value=req.value,license_policy=req.license_policy,expected_range=expected)
        hook=require_product().citizen_observations.intelligence_hook(obs)
        return envelope({"observation":jsonable(obs),"intelligence_hook":hook},data_status="OK" if obs.status=="ACCEPTED" else obs.status,warnings=[] if obs.status=="ACCEPTED" else [obs.reason or "observation not accepted"])

    @app.post("/v1/scene/{mode}/zoom")
    def scene_zoom(mode: str, req: SemanticZoomRequest):
        """E35 camera focus. The scientific object set never changes here."""
        try:
            result=require_product().semantic_zoom(
                mode, action=req.action, object_id=req.object_id,
                event_id=req.event_id, scale=req.scale,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope(result, data_status="OK", warnings=[] if result["scientific_hash_unchanged"] else [
            "Scientific hash changed during a visual-only action; investigate before trusting the scene."
        ])

    @app.get("/v1/scene/{mode}/semantics")
    def scene_semantics(mode: str):
        """E37 evidence tokens for what the scene draws, with promotion refused."""
        try:
            return envelope(require_product().scene_semantics(mode), data_status="OK")
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/v1/scenarios")
    def scenarios_list():
        return envelope(require_product().product_store.list_records(domain="ORBIT",record_type="SCENARIO_SPEC"))

    @app.post("/v1/scenarios")
    def scenario_create(req: ScenarioSpecRequest):
        try: s=require_product().create_validation_scenario(kind=req.kind,target_object_ids=req.target_object_ids,protected_object_ids=req.protected_object_ids,parameters=req.parameters,assumptions=req.assumptions,seed=req.seed)
        except ValueError as exc: raise HTTPException(422,str(exc)) from exc
        return envelope(s.model_dump(mode="json"),data_status="RESEARCH_ONLY")

    @app.post("/v1/scenarios/{scenario_id}/run")
    def scenario_run_by_id(scenario_id: str):
        """Run the research edge-deletion counterfactual on a VAL-* fixture.

        This is the engine the directive calls SIMULATION_ONLY, and the response
        says so: it is restricted to validation fixtures and every layer labels
        it RESEARCH_ONLY. For a catalogue object and a P5-compliant result use
        POST /v1/counterfactual/remove, which re-runs the screening pipeline
        instead of deleting edges from a stored graph.
        """
        try: result=require_product().run_scenario_id(scenario_id)
        except KeyError as exc: raise HTTPException(404,"scenario not found") from exc
        return envelope(result,data_status="RESEARCH_ONLY",warnings=[
            "Edge-deletion counterfactual over validation fixtures. The directive "
            "classifies this shape as SIMULATION_ONLY and it does not satisfy the "
            "P5 gate; POST /v1/counterfactual/remove runs the compliant engine.",
        ])

    @app.post("/v1/counterfactual/remove", status_code=202)
    async def counterfactual_remove(req: PhysicalCounterfactualRequest):
        """Accept a P5-compliant REMOVE counterfactual; poll for the result.

        The compliant engine existed only behind /api/v1, so a product client
        could obtain the research simulation and nothing else. This routes the
        same SCREENING_RECOMPUTE_V1 path through the science bridge.

        It returns a job rather than a result because the work is genuinely long:
        measured 2026-09-03, one run over a 150-object scope against a
        6,394-edge baseline took 446 s. Blocking a request on that is the same
        mistake POST /v1/conjunctions/screen-runs used to make.
        """
        backend = orbital_backend
        if backend is None or not hasattr(backend, "physical_counterfactual"):
            return envelope(None, data_status="UNAVAILABLE", warnings=[
                "No science backend is bound to this deployment; the P5-compliant "
                "counterfactual needs the stored screening pipeline.",
            ])
        # Refuse a bad identifier now, not inside a job the caller will poll for
        # minutes before learning the input was wrong.
        if hasattr(backend, "validate_counterfactual_target"):
            await backend.validate_counterfactual_target(req.target_catalog_id)

        if req.wait:
            return await backend.physical_counterfactual(
                req.target_catalog_id,
                horizon_hours=req.horizon_hours,
                recompute_mode=req.recompute_mode,
                max_objects=req.max_objects,
            )

        job_id = str(uuid.uuid4())
        job: dict[str, Any] = {
            "job_id": job_id,
            "status": "RUNNING",
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
            "poll": "/v1/counterfactual/jobs/" + job_id,
            "request": req.model_dump(mode="json"),
            "result": None,
            "error": None,
        }
        _COUNTERFACTUAL_JOBS[job_id] = job

        async def _run() -> None:
            try:
                job["result"] = await backend.physical_counterfactual(
                    req.target_catalog_id,
                    horizon_hours=req.horizon_hours,
                    recompute_mode=req.recompute_mode,
                    max_objects=req.max_objects,
                )
                job["status"] = "SUCCEEDED"
            except Exception as error:  # noqa: BLE001 - the job records its own failure
                job["status"] = "FAILED"
                job["error"] = {"type": type(error).__name__, "message": str(error)[:2000]}
            finally:
                job["finished_at"] = datetime.now(timezone.utc).isoformat()

        job["_task"] = asyncio.create_task(_run())
        return envelope(
            {k: v for k, v in job.items() if not k.startswith("_")},
            data_status="PENDING",
            warnings=["Job registry is in-process; this handle does not survive a restart."],
        )

    @app.get("/v1/counterfactual/jobs/{job_id}")
    def counterfactual_job(job_id: str):
        job = _COUNTERFACTUAL_JOBS.get(job_id)
        if job is None:
            raise HTTPException(404, "no such counterfactual job in this server process")
        status = {"RUNNING": "PENDING", "SUCCEEDED": "OK", "FAILED": "FAILED"}[job["status"]]
        return envelope({k: v for k, v in job.items() if not k.startswith("_")}, data_status=status)

    @app.get("/v1/scenarios/{scenario_id}/benefits")
    def scenario_benefits(scenario_id: str):
        result=require_product().scenario_execution(scenario_id)
        if result is None: return envelope(None,data_status="UNAVAILABLE",warnings=["Scenario has not been run."])
        attrs=result.get("result",{}).get("attributions",[])
        return envelope(attrs,data_status="RESEARCH_ONLY",warnings=["ATTRIBUTION_RESULT / COUNTERFACTUAL only; not observed benefit."])

    @app.get("/v1/scenarios/{scenario_id}/affected")
    def scenario_affected_v1(scenario_id: str):
        """E32 on the product surface.

        The affected subgraph is part of the directive's P8 gate (full-vs-selective
        equivalence), so it belongs where a client can see it and not only on the
        internal surface.
        """
        return scenario_affected(scenario_id)

    @app.get("/internal/scenarios/{scenario_id}/affected")
    def scenario_affected(scenario_id: str):
        p=require_product(); scenario=p.get_scenario(scenario_id)
        if scenario is None: raise HTTPException(404,"scenario not found")
        edges=[p.risk_graph.build_edge("VAL-A","VAL-B",metrics={"screening_score":0.2},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1"),p.risk_graph.build_edge("VAL-B","VAL-C",metrics={"screening_score":0.1},evidence_ids=["VALIDATION_FIXTURE"],config_version="validation-v1")]
        affected=p.affected_subgraph.affected(edges,scenario.target_object_ids) if hasattr(p,"affected_subgraph") else [e for e in edges if set(scenario.target_object_ids)&{e.a,e.b}]
        return envelope([jsonable(x) for x in affected],data_status="RESEARCH_ONLY")

    @app.post("/v1/protect/{protected_object_id}/candidates")
    def protect_candidates(protected_object_id: str, req: CandidateRankingRequest):
        if req.primary_state is not None:
            try:
                result=require_product().evaluate_ocm_candidates(
                    protected_object_id=protected_object_id,
                    primary_state=req.primary_state,
                    encounter_states=req.encounter_states,
                    candidates=req.candidates,
                    horizon_s=req.horizon_s,
                    step_s=req.step_s,
                    risk_threshold_km=req.risk_threshold_km,
                )
            except ValueError as exc:
                raise HTTPException(422,str(exc)) from exc
            return envelope(
                jsonable(result),data_status=result.validation_state,
                provenance=result.provenance,
                warnings=["Advisory two-body counterfactual only; no spacecraft command or Pc is generated."],
            )
        from aetherus_orbit import ProtectReverseQueryCandidateOCMComparisonEngine
        rows=ProtectReverseQueryCandidateOCMComparisonEngine().rank(protected_object_id=protected_object_id,candidates=req.candidates,protected_active=req.protected_active)
        return envelope([jsonable(x) for x in rows],data_status="RESEARCH_ONLY",warnings=["Advisory only; no spacecraft command generated."])

    @app.post("/v1/operations/fleets/{fleet_id}/maneuver-candidates")
    def fleet_maneuver_candidates(fleet_id: str, req: CandidateRankingRequest):
        from aetherus_orbit import ProtectReverseQueryCandidateOCMComparisonEngine
        rows=ProtectReverseQueryCandidateOCMComparisonEngine().rank(protected_object_id=fleet_id,candidates=req.candidates,protected_active=req.protected_active)
        return envelope({"fleet_id":fleet_id,"candidates":[jsonable(x) for x in rows],"advisory_only":True},data_status="RESEARCH_ONLY",warnings=["Candidate comparison only; automatic collision-avoidance commands are forbidden."])

    # E38-E44 — expose current intelligence ledger/packet without LLM invention.
    @app.get("/internal/intelligence/runs")
    def intelligence_runs():
        rows=list(require_product().intelligence_tasks.event_log)
        return envelope(rows,data_status="OK" if rows else "UNAVAILABLE")

    @app.get("/v1/intelligence/events/{event_id}/evidence")
    def intelligence_event_evidence(event_id: UUID):
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        return envelope([e.model_dump(mode="json") for e in packet.evidence],provenance={"event_id":str(event_id)})

    @app.get("/v1/intelligence/signals")
    async def intelligence_signals(limit:int=200, source:str="ALL"):
        """Serve stored signals plus, when wired, real P4 conjunction signals.

        Conjunction-derived signals are DERIVED evidence computed from stored
        screening results; they are merged in rather than replacing the store so
        the fixture lineage stays visible next to the live science.
        """
        stored=[x.model_dump(mode="json") for x in repo.list_signals(limit)]
        if conjunction_signal_source is None or source == "STORED":
            return envelope(stored)
        bundle=await conjunction_signal_source(limit=limit)
        derived=[s.model_dump(mode="json") for s in bundle.signals]
        if source == "CONJUNCTION":
            return envelope(derived, data_status=bundle.data_status, warnings=bundle.warnings)
        warnings=list(bundle.warnings)
        if bundle.status_reason:
            warnings.append(f"conjunction signals: {bundle.status_reason}")
        return envelope(
            stored + derived,
            data_status="OK" if (stored or derived) else bundle.data_status,
            warnings=warnings,
        )

    @app.get("/v1/intelligence/events")
    def intelligence_events(limit:int=200):
        return envelope([x.model_dump(mode="json") for x in repo.list_events(limit)])

    @app.get("/v1/intelligence/events/{event_id}/revisions")
    def intelligence_revisions(event_id:UUID):
        if repo.get_event(event_id) is None: raise HTTPException(404,"event not found")
        return envelope([r.model_dump(mode="json") for r in repo.revisions_for(event_id)])

    @app.get("/v1/intelligence/events/{event_id}/confidence")
    def intelligence_confidence(event_id:UUID):
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        return envelope({"confidence":packet.confidence.model_dump(mode="json"),"uncertainty":packet.uncertainty.model_dump(mode="json")},data_status=packet.event.validation_state.value)

    @app.get("/v1/intelligence/events/{event_id}/why")
    def intelligence_why(event_id:UUID):
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        return envelope({"why_it_matters":packet.why_it_matters,"known_limitations":packet.known_limitations,"allowed_claims":packet.allowed_claims,"prohibited_claims":packet.prohibited_claims},data_status=packet.event.validation_state.value)

    @app.get("/v1/intelligence/events/{event_id}/importance")
    def intelligence_importance(event_id:UUID):
        """E44 importance, scored from the stored packet only.

        Every input is read from what is already recorded; an absent input is
        named in the response instead of being replaced by a default, because a
        weighted score built on substituted numbers would look derived when it
        is not.
        """
        p=require_product()
        packet=repo.get_packet_for_event(event_id)
        if packet is None: raise HTTPException(404,"event packet not found")
        confidence=getattr(packet.confidence,"score",None)
        missing=[]
        if confidence is None: missing.append("confidence.score")
        magnitude=_packet_number(packet,"magnitude")
        if magnitude is None: missing.append("event.magnitude")
        change_rate=_packet_number(packet,"change_rate")
        if change_rate is None: missing.append("event.change_rate")
        affected=_packet_affected_count(packet)
        if affected is None: missing.append("event.affected_objects")
        if missing:
            return envelope(None, data_status="INSUFFICIENT_DATA", warnings=[
                "Importance was not scored; these inputs are absent from the stored "
                "packet and are not substituted: " + ", ".join(missing)
            ])
        result=p.importance_decision.importance(
            magnitude=magnitude, change_rate=change_rate,
            affected_objects=affected, confidence=confidence,
        )
        return envelope({
            "event_id":str(event_id),"score":result.score,
            "reasons":[dict(r) for r in result.reasons],
            "policy_version":result.policy_version,
        }, data_status=packet.event.validation_state.value)

    @app.post("/v1/intelligence/decision")
    def intelligence_decision(req: DecisionRequest):
        """E44 decision comparison — the directive's P11 decision packet.

        Advisory by construction: the engine strips command-shaped fields and
        stamps NO_AUTOMATIC_SPACECRAFT_COMMAND, and new risk is subtracted rather
        than hidden. Options come from stored scenario executions, so a decision
        can only compare things that were actually run.
        """
        p=require_product()
        options=[]
        missing=[]
        for scenario_id in req.option_scenario_ids:
            execution=p.scenario_execution(scenario_id)
            if execution is None:
                missing.append(scenario_id); continue
            result=execution.get("result",{})
            options.append({
                "scenario_id":scenario_id,
                "criteria":_decision_criteria(result, req.criteria),
                "new_risk":_decision_new_risk(result),
                "assumptions":execution.get("assumptions",[]),
                "provenance":{"result_hash":result.get("result_hash"),
                              "validation_state":execution.get("validation_state","RESEARCH_ONLY")},
            })
        if missing:
            return envelope(None, data_status="INSUFFICIENT_DATA", warnings=[
                "These scenarios have no stored execution and cannot be compared: "
                + ", ".join(missing)
            ])
        try:
            comparison=p.importance_decision.decision(
                baseline_scenario_id=req.baseline_scenario_id,
                options=options, criteria=req.criteria, policy=req.policy,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return envelope({
            "baseline_scenario_id":str(comparison.baseline_scenario_id),
            "criteria":list(comparison.criteria),
            "ranked_options":comparison.ranked_options,
            "advisory_only":comparison.advisory_only,
            "limitations":list(comparison.limitations),
            "generated_at":comparison.generated_at.isoformat(),
        }, data_status="RESEARCH_ONLY", warnings=[
            "ADVISORY_ONLY decision comparison over counterfactual scenarios; "
            "never an observed outcome and never a spacecraft command."
        ])

    @app.get("/v1/intelligence/scenarios/{scenario_id}/attribution")
    def intelligence_attribution(scenario_id:str):
        result=require_product().scenario_execution(scenario_id)
        if result is None:return envelope(None,data_status="UNAVAILABLE",warnings=["Scenario execution/attribution not available."])
        return envelope(result.get("result",{}).get("attributions",[]),data_status="RESEARCH_ONLY",warnings=["COUNTERFACTUAL attribution, never observed fact."])

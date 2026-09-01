"""Conjunction assessment orchestration: stored solutions in, honest states out."""

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from backend.config import settings
from backend.conjunction.errors import ConjunctionValidationError, ScreeningInvalidError
from backend.conjunction.models import (
    COARSE_MODEL_ID,
    COARSE_MODEL_VERSION,
    METRIC_TYPES,
    SNAPSHOT_VALIDATION_STATE,
    ScreeningConfig,
    ScreeningProvenance,
    TcaResult,
    build_config_hash,
)
from backend.conjunction.repository import ConjunctionRepository, to_mean_elements
from backend.conjunction.screen import coarse_screen, prepare_catalog
from backend.conjunction.tca import find_tca
from backend.orbit.errors import PropagationError
from backend.orbit.frames import FrameAssumptions
from backend.orbit.propagator import Sgp4Propagator
from backend.orbit.time_scale import require_utc_datetime

MAX_WINDOW_HOURS = 168.0


class ConjunctionService:
    """Run bounded conservative screenings and serve only persisted results."""

    def __init__(self, repository: ConjunctionRepository | None = None) -> None:
        self.repository = repository or ConjunctionRepository()

    async def run_screening(
        self,
        window_hours: float | None = None,
        config: ScreeningConfig | None = None,
        catalog_ids: list[str] | None = None,
        max_objects: int | None = None,
    ) -> dict[str, Any]:
        """Execute one bounded screening over stored P1/P2 solutions.

        ``catalog_ids`` narrows the population to an explicit set. Pair count is
        quadratic in the population, so a caller that only cares about a few
        objects should say so rather than pay for the whole catalogue. A scoped
        run is recorded as scoped: ``coverage`` in the payload and the run's
        config name the restriction, because a subset result must never be read
        as evidence that the full catalogue was screened.
        """
        effective_config = config or ScreeningConfig(
            window_hours=settings.screening_window_hours,
            coarse_step_seconds=settings.screening_coarse_step_seconds,
            screening_threshold_m=settings.screening_threshold_m,
            shell_margin_km=settings.screening_shell_margin_km,
            max_objects=settings.screening_max_objects,
            hbr_m=settings.screening_hbr_m,
            refine_step_seconds=settings.screening_refine_step_seconds,
        )
        requested_window = (
            effective_config.window_hours
            if window_hours is None
            else float(window_hours)
        )
        if not 0.01 <= requested_window <= MAX_WINDOW_HOURS:
            raise ScreeningInvalidError(
                "Screening window must lie between 0.01 and 168 hours",
                {"window_hours": requested_window},
            )
        overrides: dict[str, Any] = {"window_hours": requested_window}
        if max_objects is not None:
            # Population bound, distinct from catalog_ids: the caller does not know
            # which objects exist but does know how much work it can afford. Pair
            # count is quadratic, so this is the difference between seconds and
            # tens of minutes on the real catalogue.
            overrides["max_objects"] = int(max_objects)
        effective_config = ScreeningConfig(
            **{**effective_config.to_payload(), **overrides}
        )
        config_hash = build_config_hash(effective_config)

        started_at = datetime.now(UTC)
        window_start = started_at
        window_stop = started_at + timedelta(hours=requested_window)

        loaded = await self.repository.load_screenable_solutions(
            effective_config.max_objects, catalog_ids
        )
        coverage = {
            "scope": "CATALOG_SUBSET" if catalog_ids is not None else "FULL_CATALOGUE",
            "requested_catalog_ids": sorted(catalog_ids) if catalog_ids is not None else None,
            "objects_loaded": len(loaded),
            "max_objects": effective_config.max_objects,
        }
        entries: list[tuple[str, str, Any]] = []
        skipped: list[dict[str, Any]] = []
        solution_ids: list[str] = []
        provenance_rows: dict[str, dict[str, Any]] = {}
        for row in loaded:
            elements, quality = to_mean_elements(row)
            if (
                str(row.get("theory") or "").upper() != "SGP4"
                or str(row.get("frame") or "").upper() != "TEME"
                or str(row.get("time_system") or "").upper() != "UTC"
            ):
                skipped.append(
                    {
                        "catalog_id": str(row["catalog_id"]),
                        "reason": "SOLUTION_NOT_SGP4_TEME_UTC",
                    }
                )
                continue
            entries.append((str(row["object_id"]), str(row["catalog_id"]), elements))
            solution_ids.append(str(row["orbit_solution_id"]))
            provenance_rows[str(row["object_id"])] = {
                "catalog_id": str(row["catalog_id"]),
                "orbit_solution_id": str(row["orbit_solution_id"]),
                "source_id": row.get("source_id"),
                "epoch": elements.epoch.isoformat(),
                "retrieved_at": row["retrieved_at"].isoformat()
                if row.get("retrieved_at") is not None
                else None,
                "content_sha256": row.get("content_sha256"),
                "quality_grade": quality.get("source_grade"),
                "covariance_status": quality.get("covariance_status", "INSUFFICIENT_DATA"),
            }

        input_hash = _run_input_hash(solution_ids, effective_config, window_start, window_stop)
        run_id = await self.repository.create_screening_run(
            window_start=window_start,
            window_stop=window_stop,
            config_payload=effective_config.to_payload(),
            config_hash=config_hash,
            model_id=COARSE_MODEL_ID,
            model_version=COARSE_MODEL_VERSION,
            input_hash=input_hash,
        )

        if len(entries) < 2:
            data_status: str = "UNAVAILABLE"
            reason: str | None = (
                "NO_PROPAGABLE_SOLUTIONS"
                if not entries
                else "ONLY_ONE_PROPAGABLE_SOLUTION"
            )
            await self.repository.finalize_screening_run(
                run_id,
                status="SUCCEEDED",
                data_status="UNAVAILABLE",
                status_reason=reason,
                objects_considered=len(loaded),
                objects_propagated=len(entries),
                pairs_before_screening=0,
                pairs_after_coarse=0,
                propagation_failure_count=len(skipped),
                propagation_failures=skipped,
                events_found=0,
                validation_dataset_id=None,
                validation_dataset_version=None,
            )
            return _screening_payload(
                run_id=run_id,
                data_status="UNAVAILABLE",
                status_reason=reason,
                objects_considered=len(loaded),
                objects_propagated=len(entries),
                pairs_before=0,
                pairs_after=0,
                failures=skipped,
                events=[],
                window={"start": window_start.isoformat(), "stop": window_stop.isoformat()},
                config=effective_config.to_payload(),
                config_hash=config_hash,
                input_hash=input_hash,
                warnings=["No stored P1/P2 orbit_solution input could be screened."],
                coverage=coverage,
            )

        prepared = prepare_catalog(entries)
        screen = coarse_screen(prepared, window_start, window_stop, effective_config)
        failures = [
            {
                "catalog_id": failure.catalog_id,
                "object_id": failure.object_id,
                "stage": failure.stage,
                "reason": failure.reason,
            }
            for failure in screen.failures
        ]
        failures.extend(skipped)

        # Map prepared indices back to entries BY IDENTITY, never positionally:
        # objects that fail SGP4 initialization are dropped by prepare_catalog,
        # so a positional zip silently shifts every later pairing onto the
        # wrong elements (latent until an init-failing object sorts first).
        entry_by_object_id = {entry[0]: entry for entry in entries}
        index_to_entry = {
            obj.index: entry_by_object_id[obj.object_id] for obj in prepared.objects
        }

        events: list[dict[str, Any]] = []
        pair_failures: list[dict[str, Any]] = []
        for candidate in screen.candidates:
            entry_a = index_to_entry[candidate.index_a]
            entry_b = index_to_entry[candidate.index_b]
            state_a_fn, state_b_fn = _state_functions(entry_a[2], entry_b[2])
            try:
                tca_result = find_tca(
                    state_a_fn,
                    state_b_fn,
                    window_start=window_start,
                    window_stop=window_stop,
                    coarse_step_seconds=max(effective_config.refine_step_seconds, 5),
                )
            except PropagationError as error:
                pair_failures.append(
                    {
                        "catalog_id": f"{entry_a[1]}|{entry_b[1]}",
                        "stage": "tca_refinement",
                        "reason": error.message,
                    }
                )
                continue
            except ValueError as error:
                pair_failures.append(
                    {
                        "catalog_id": f"{entry_a[1]}|{entry_b[1]}",
                        "stage": "tca_refinement",
                        "reason": str(error),
                    }
                )
                continue

            if tca_result.miss_distance_m > effective_config.screening_threshold_m:
                continue
            event_id, snapshot_id = await self._persist_event_and_snapshot(
                run_id=run_id,
                entry_a=entry_a,
                entry_b=entry_b,
                tca_result=tca_result,
                effective_config=effective_config,
                config_hash=config_hash,
                input_hash=input_hash,
                provenance_rows=provenance_rows,
            )
            events.append(
                {
                    "event_id": event_id,
                    "snapshot_id": snapshot_id,
                    "primary_catalog_id": entry_a[1],
                    "secondary_catalog_id": entry_b[1],
                    "tca": tca_result.tca_utc.isoformat(),
                    "miss_distance_m": tca_result.miss_distance_m,
                    "relative_speed_mps": tca_result.relative_speed_mps,
                    "boundary_flag": tca_result.boundary_flag,
                }
            )

        all_failures = [*failures, *pair_failures]
        if len(events) > 0:
            data_status = "PARTIAL" if all_failures else "OK"
            reason = None if not all_failures else "COMPLETED_WITH_PROPAGATION_FAILURES"
        elif all_failures:
            data_status = "PARTIAL"
            reason = "NO_EVENTS_AND_PROPAGATION_FAILURES_PRESENT"
        else:
            data_status = "INSUFFICIENT_DATA"
            reason = "NO_CANDIDATE_PAIRS_WITHIN_THRESHOLD"

        await self.repository.finalize_screening_run(
            run_id,
            status="PARTIAL" if all_failures else "SUCCEEDED",
            data_status=data_status,
            status_reason=reason,
            objects_considered=len(loaded),
            objects_propagated=screen.objects_propagated,
            pairs_before_screening=screen.pairs_before_screening,
            pairs_after_coarse=screen.pairs_after_coarse,
            propagation_failure_count=len(all_failures),
            propagation_failures=all_failures,
            events_found=len(events),
            validation_dataset_id="stored-public-gp-catalog-v1",
            validation_dataset_version="p4",
        )

        warnings: list[str] = []
        if all_failures:
            warnings.append(
                f"{len(all_failures)} propagation/refinement failures recorded; "
                "results are PARTIAL, never silently complete."
            )
        if data_status == "INSUFFICIENT_DATA":
            warnings.append(
                "Coarse screening retained no candidate pairs within the "
                "configured threshold; no conjunction was fabricated."
            )

        return _screening_payload(
            run_id=run_id,
            data_status=data_status,
            status_reason=reason,
            objects_considered=len(loaded),
            objects_propagated=screen.objects_propagated,
            pairs_before=screen.pairs_before_screening,
            pairs_after=screen.pairs_after_coarse,
            failures=all_failures,
            events=events,
            window={"start": window_start.isoformat(), "stop": window_stop.isoformat()},
            config=effective_config.to_payload(),
            config_hash=config_hash,
            input_hash=input_hash,
            warnings=warnings,
            coverage=coverage,
        )

    async def _persist_event_and_snapshot(
        self,
        *,
        run_id: str,
        entry_a: tuple[str, str, Any],
        entry_b: tuple[str, str, Any],
        tca_result: TcaResult,
        effective_config: ScreeningConfig,
        config_hash: str,
        input_hash: str,
        provenance_rows: dict[str, dict[str, Any]],
    ) -> tuple[str, str]:
        primary_id, secondary_id = sorted([entry_a[0], entry_b[0]])
        primary_catalog = (
            entry_a[1] if entry_a[0] == primary_id else entry_b[1]
        )
        secondary_catalog = (
            entry_b[1] if entry_b[0] == secondary_id else entry_a[1]
        )
        source_event_id = f"self-screen:{primary_catalog}:{secondary_catalog}"
        event_id = await self.repository.upsert_event(
            primary_object_id=primary_id,
            secondary_object_id=secondary_id,
            source_event_id=source_event_id,
            tca=tca_result.tca_utc,
            screening_run_id=run_id,
        )

        prov_a = provenance_rows[primary_id]
        prov_b = provenance_rows[secondary_id]
        ages = [
            age
            for age in (
                _age_seconds(prov_a["retrieved_at"]),
                _age_seconds(prov_b["retrieved_at"]),
            )
            if age is not None
        ]
        provenance = ScreeningProvenance(
            screening_run_id=run_id,
            source_ids=[
                value
                for value in (prov_a["source_id"], prov_b["source_id"])
                if value
            ],
            source_snapshot_at=datetime.fromisoformat(prov_a["epoch"]),
            secondary_source_snapshot_at=datetime.fromisoformat(prov_b["epoch"]),
            retrieved_at=None,
            input_artifact_hashes=[
                f"sha256:{prov_a['content_sha256']}",
                f"sha256:{prov_b['content_sha256']}",
            ],
            model_id=COARSE_MODEL_ID,
            model_version=COARSE_MODEL_VERSION,
            config_hash=config_hash,
            input_hash=input_hash,
            source_age_seconds_max=max(ages) if ages else None,
            validation_dataset_id=None,
            validation_dataset_version=None,
        )

        # Metric channels stay separate: MISS_DISTANCE is always computed from
        # the refined TCA, while Pc exists only when both stored solutions carry
        # a usable covariance. PUBLIC_GP OMM never does, so snapshots record the
        # explicit NOT_COMPUTED state instead of any estimate.
        cov_available = (
            prov_a.get("covariance_status") not in (None, "INSUFFICIENT_DATA", "UNAVAILABLE")
            and prov_b.get("covariance_status") not in (None, "INSUFFICIENT_DATA", "UNAVAILABLE")
        )
        if not cov_available:
            pc_value = None
            pc_method = None
            pc_status = "NOT_COMPUTED"
            pc_reason = "COVARIANCE_MISSING_PUBLIC_GP"
            covariance_status = "INSUFFICIENT_DATA"
        else:
            # Covariance-bearing sources require the CDM path with validated
            # matrices; screening-only inputs cannot reach this branch yet.
            pc_value = None
            pc_method = None
            pc_status = "PC_UNAVAILABLE"
            pc_reason = "CDM_COVARIANCE_NOT_PROVIDED_BY_SCREENING_INPUT"
            covariance_status = "UNAVAILABLE"

        metrics = {
            "miss_distance_m": tca_result.miss_distance_m,
            "relative_speed_mps": tca_result.relative_speed_mps,
            "pc": pc_value,
            "pc_method": pc_method,
            "pc_status": pc_status,
            "pc_unavailable_reason": pc_reason,
            "covariance_status": covariance_status,
            "max_pc": None,
            "max_pc_method": None,
            "primary_covariance": None,
            "secondary_covariance": None,
            "dilution_state": None,
            "boundary_flag": tca_result.boundary_flag,
            "source_grade": prov_a["quality_grade"],
        }
        provenance_payload = provenance.to_payload()
        provenance_payload["validation_state"] = SNAPSHOT_VALIDATION_STATE
        provenance_payload["pc_rule"] = (
            "PUBLIC_GP carries no covariance; Pc stays NOT_COMPUTED and is "
            "never estimated from screening metrics."
        )
        return event_id, await self.repository.append_snapshot(
            event_id=event_id,
            snapshot_at=datetime.now(UTC),
            metrics=metrics,
            provenance_payload=provenance_payload,
            model_version=f"{COARSE_MODEL_VERSION}+sgp4",
            input_hash=input_hash,
        )

    async def list_conjunctions(
        self,
        *,
        object_ref: str | None,
        start_raw: str | None,
        stop_raw: str | None,
        source_grade: str | None,
        metric_type: str | None,
        threshold_min: float | None,
        threshold_max: float | None,
        limit_raw: int | None,
    ) -> dict[str, Any]:
        """Serve stored conjunctions with contract-enforced filters."""
        if metric_type is not None and metric_type not in METRIC_TYPES:
            raise ConjunctionValidationError(
                "metric_type must be one of PC, MAX_PC, MISS_DISTANCE",
                {"metric_type": metric_type},
            )
        if (threshold_min is not None or threshold_max is not None) and metric_type is None:
            raise ConjunctionValidationError(
                "metric_type is mandatory when a metric threshold is supplied",
                {"threshold_min": threshold_min, "threshold_max": threshold_max},
            )
        start = require_utc_datetime(start_raw, "start") if start_raw else None
        stop = require_utc_datetime(stop_raw, "stop") if stop_raw else None
        if start is not None and stop is not None and stop < start:
            raise ConjunctionValidationError(
                "conjunctions time filter stop must not precede start",
                {},
            )
        maximum = settings.conjunctions_page_limit
        limit = maximum if limit_raw is None else min(int(limit_raw), maximum)

        rows, _ = await self.repository.list_conjunctions(
            object_ref=object_ref,
            start=start,
            stop=stop,
            source_grade=source_grade,
            metric_type=metric_type,
            threshold_min=threshold_min,
            threshold_max=threshold_max,
            limit=limit,
        )

        latest_run = await self.repository.latest_run_summary()
        events = [_event_payload(row) for row in rows]
        if events:
            data_status = "OK"
            reason = None
        elif latest_run is None:
            data_status = "UNAVAILABLE"
            reason = "NO_SCREENING_RUN_EXECUTED"
        elif latest_run.get("data_status") == "OK":
            data_status = "OK"
            reason = "NO_CONJUNCTION_EVENT_MATCHES_FILTERS"
        else:
            data_status = str(latest_run.get("data_status"))
            reason = latest_run.get("status_reason")

        warnings: list[str] = []
        if latest_run is not None:
            failure_count = int(latest_run.get("propagation_failure_count") or 0)
            if failure_count:
                warnings.append(
                    f"Latest screening run recorded {failure_count} propagation failures."
                )
        if data_status == "INSUFFICIENT_DATA":
            warnings.append(
                "No stored conjunction matches; the last screening run found no "
                "candidate pair within its threshold."
            )

        return {
            "request_id": str(uuid.uuid4()),
            "generated_at": datetime.now(UTC).isoformat(),
            "data_status": data_status,
            "status_reason": reason,
            "data": {
                "count": len(events),
                "events": events,
            },
            "provenance": _run_provenance(latest_run),
            "warnings": warnings,
        }


def _state_functions(elements_a, elements_b):
    """Build TCA state callables from canonical mean elements via the P2 engine."""
    assumptions = FrameAssumptions(ut1_utc_offset_seconds=settings.ut1_utc_offset_seconds)
    propagator_a = Sgp4Propagator(elements_a, assumptions)
    propagator_b = Sgp4Propagator(elements_b, assumptions)

    def state_for(propagator):
        def state_fn(moment):
            sample = propagator.propagate(moment)
            return sample.r_teme_km, sample.v_teme_km_s

        return state_fn

    return state_for(propagator_a), state_for(propagator_b)


def _age_seconds(retrieved_at_iso: str | None) -> float | None:
    if not retrieved_at_iso:
        return None
    retrieved = datetime.fromisoformat(retrieved_at_iso)
    if retrieved.tzinfo is None:
        retrieved = retrieved.replace(tzinfo=UTC)
    return max((datetime.now(UTC) - retrieved).total_seconds(), 0.0)


def _run_input_hash(
    solution_ids: list[str],
    config: ScreeningConfig,
    window_start: datetime,
    window_stop: datetime,
) -> str:
    serialized = json.dumps(
        {
            "orbit_solution_ids": sorted(solution_ids),
            "config": config.to_payload(),
            "window_start": window_start.isoformat(),
            "window_stop": window_stop.isoformat(),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


#: MAX_PC 상태를 COMPUTED 로 부를 수 있는 유일한 근거. 다른 근거로 얻은 값은
#: 값으로서 유효하되 "우리가 계산했다"고 말해서는 안 된다.
_MAX_PC_BASIS_COMPUTED_INTERNAL = "COMPUTED_INTERNAL"
#: 근거가 기록되지 않은 값. 값의 존재로부터 상태를 추론하던 자리를 대신한다 —
#: 추론은 언제나 우리에게 유리한 방향이었으므로 결함으로 드러내야 한다.
_MAX_PC_STATUS_BASIS_UNRECORDED = "BASIS_UNRECORDED"


def _max_pc_channel(row: dict[str, Any]) -> dict[str, Any]:
    """Report MAX_PC with the basis it was actually obtained on.

    The status used to be inferred from the value being non-null, which would
    have credited Aetherus with computing any externally published screening
    metric the moment one was ingested. Status is now read from storage, and a
    value whose basis was never recorded is surfaced as a fault rather than
    guessed in the flattering direction.
    """
    value = row["max_pc"]
    basis = row.get("max_pc_basis")
    stored_status = row.get("max_pc_status")

    if value is None:
        status = stored_status or "NOT_COMPUTED"
    elif basis is None:
        status = _MAX_PC_STATUS_BASIS_UNRECORDED
    else:
        status = stored_status or _MAX_PC_STATUS_BASIS_UNRECORDED

    # 저장 상태가 근거와 모순되면 저장값을 따르지 않는다. COMPUTED 는 우리 계산에만
    # 허용되며, 그 외의 근거로 COMPUTED 가 적혀 있다면 그것이야말로 기록 결함이다.
    if status == "COMPUTED" and basis != _MAX_PC_BASIS_COMPUTED_INTERNAL:
        status = _MAX_PC_STATUS_BASIS_UNRECORDED

    return {
        "value": value,
        "method": row["max_pc_method"],
        "status": status,
        "basis": basis,
        "source_id": row.get("max_pc_source_id"),
        "content_sha256": row.get("max_pc_content_sha256"),
    }


def _event_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": row["event_id"],
        "tca": row["tca"].isoformat() if hasattr(row["tca"], "isoformat") else row["tca"],
        "source_event_id": row["source_event_id"],
        "first_seen_at": _iso_or_none(row["first_seen_at"]),
        "last_seen_at": _iso_or_none(row["last_seen_at"]),
        "event_status": row["event_status"],
        "primary": {
            "object_id": row["primary_object_id"],
            "catalog_id": row["primary_catalog_id"],
            "canonical_name": row["primary_name"],
        },
        "secondary": {
            "object_id": row["secondary_object_id"],
            "catalog_id": row["secondary_catalog_id"],
            "canonical_name": row["secondary_name"],
        },
        "latest_snapshot": {
            "snapshot_id": row["snapshot_id"],
            "snapshot_at": _iso_or_none(row["snapshot_at"]),
            "miss_distance_m": row["miss_distance_m"],
            "relative_speed_mps": row["relative_speed_mps"],
            "metrics": {
                "PC": {
                    "value": row["pc"],
                    "method": row["pc_method"],
                    "status": row["pc_status"],
                    "unavailable_reason": row["pc_unavailable_reason"],
                },
                "MAX_PC": _max_pc_channel(row),
                "MISS_DISTANCE": {
                    "value": row["miss_distance_m"],
                    "unit": "m",
                    "status": "COMPUTED" if row["miss_distance_m"] is not None else "NOT_COMPUTED",
                },
            },
            "covariance_status": row["covariance_status"],
            "dilution_state": row["dilution_state"],
            "tca_boundary_flag": row["tca_boundary_flag"],
            "source_grade": row["source_grade"],
            "validation_state": row["validation_state"],
            "model_version": row["model_version"],
            "input_hash": row["input_hash"],
            "provenance": row["provenance_json"]
            if isinstance(row["provenance_json"], dict)
            else {},
        },
    }


def _run_provenance(latest_run: dict[str, Any] | None) -> dict[str, Any]:
    if latest_run is None:
        return {"source_ids": [], "model_id": None, "model_version": None}
    return {
        "screening_run_id": latest_run.get("id"),
        "source_ids": ["celestrak_gp", "spacetrack_gp"],
        "model_id": latest_run.get("model_id"),
        "model_version": latest_run.get("model_version"),
        "config_hash": latest_run.get("config_hash"),
        "input_hash": latest_run.get("input_hash"),
        "window_start": latest_run.get("window_start"),
        "window_stop": latest_run.get("window_stop"),
        "pairs_before_screening": latest_run.get("pairs_before_screening"),
        "pairs_after_coarse": latest_run.get("pairs_after_coarse"),
        "objects_considered": latest_run.get("objects_considered"),
        "objects_propagated": latest_run.get("objects_propagated"),
        "events_found": latest_run.get("events_found"),
        "validation_dataset_id": latest_run.get("validation_dataset_id"),
        "validation_dataset_version": latest_run.get("validation_dataset_version"),
    }


def _iso_or_none(value: Any) -> str | None:
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return None if value is None else str(value)


def _screening_payload(
    *,
    run_id: str,
    data_status: str,
    status_reason: str | None,
    objects_considered: int,
    objects_propagated: int,
    pairs_before: int,
    pairs_after: int,
    failures: list[dict[str, Any]],
    events: list[dict[str, Any]],
    window: dict[str, str],
    config: dict[str, Any],
    config_hash: str,
    input_hash: str,
    warnings: list[str],
    coverage: dict[str, Any],
) -> dict[str, Any]:
    return {
        "request_id": str(uuid.uuid4()),
        "generated_at": datetime.now(UTC).isoformat(),
        "data_status": data_status,
        "status_reason": status_reason,
        "data": {
            "screening_run_id": run_id,
            "window": window,
            # 부분집합 스크리닝 결과를 전 카탈로그 커버리지로 오독하면 안 된다.
            "coverage": coverage,
            "objects_considered": objects_considered,
            "objects_propagated": objects_propagated,
            "pairs_before_screening": pairs_before,
            "pairs_after_coarse": pairs_after,
            "propagation_failures": failures,
            "events_found": len(events),
            "events": events,
        },
        "provenance": {
            "model_id": COARSE_MODEL_ID,
            "model_version": COARSE_MODEL_VERSION,
            "config": config,
            "config_hash": config_hash,
            "input_hash": input_hash,
        },
        "warnings": warnings,
    }

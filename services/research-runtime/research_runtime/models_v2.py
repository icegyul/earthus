"""surface-passive-advection.v2.windage — V1 advection plus a literature windage term.

    u_particle = u_HYCOM(15 m) + alpha * U10          (m/s + dimensionless * m/s = m/s)

V1 (models.py) is imported and reused; it is never modified. The composite forcing duck-types
RegularGrid so V1's RK4 oracle, boundary bisection and segment guard run unchanged on the
combined velocity — the Python reference and the OceanParcels kernel therefore share one
definition of "windage applied at every RK4 stage". alpha must be present in the spec
(no implicit default), within [0, 0.05], and is written to provenance with its source.
"""
from __future__ import annotations

import importlib.metadata
import math
from pathlib import Path
import platform
import subprocess
import time
import uuid

from . import models as v1
from .datasets import ForcingBoundary, RegularGrid, digest, number, utc_seconds, utc_string, validate_dataset
from .wind import WIND_READER_VERSION, WindField, validate_wind_dataset

MODEL_ID = "surface-passive-advection.v2.windage"
MODEL_VERSION = "0.1.0"
ALPHA_MIN, ALPHA_MAX = 0.0, 0.05
WINDAGE_UNIT = "dimensionless (m/s of drift per m/s of 10 m wind)"
WINDAGE_SOURCE = "Drogued SVP downwind slip 0.7 cm/s per 10 m/s wind (Niiler and Paduan, 1995) as quoted by Lumpkin & Pazos, 'Measuring surface currents with SVP drifters' (Cambridge, ch. 2); leeway form u_d = u_o + alpha*U10 per Sutherland et al. 2020 (Breivik & Allen 2008)."
WINDAGE_REFERENCE = "https://www.aoml.noaa.gov/phod/docs/LumpkinPazos.pdf ; https://arxiv.org/abs/2005.09527"
SNAPSHOT_FILES = ("__init__.py", "datasets.py", "models.py", "cli.py", "wind.py", "models_v2.py", "registry.py")


def _disk_source_snapshot():
    return {name: Path(__file__).with_name(name).read_text(encoding="utf-8") for name in SNAPSHOT_FILES}


_LOADED_SOURCE_SNAPSHOT = _disk_source_snapshot()


def model_source_snapshot():
    return dict(_LOADED_SOURCE_SNAPSHOT)


def model_source_sha256():
    return digest(model_source_snapshot())


def dependency_lock_text():
    return v1.dependency_lock_text()


def _check_loaded_source():
    if digest(_disk_source_snapshot()) != model_source_sha256():
        raise ValueError("v2 runtime source changed since import; restart the worker before executing or publishing results")
    v1._check_loaded_source()


def model_commit():
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10,
                              cwd=Path(__file__).resolve().parents[3]).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def describe():
    base = v1.describe()
    base.update({"modelId": MODEL_ID, "modelVersion": MODEL_VERSION,
                 "includedPhysics": ["windage: alpha * U10 at every RK4 stage"],
                 "excludedPhysics": ["Stokes drift (explicit)", "diffusion", "vertical mixing", "oil weathering", "cross-wind leeway"],
                 "windageAlphaRange": [ALPHA_MIN, ALPHA_MAX], "windReaderVersion": WIND_READER_VERSION,
                 "basedOn": {"modelId": v1.MODEL_ID, "modelVersion": v1.MODEL_VERSION}})
    return base


def _spec_values(spec, dataset, wind):
    """V1 spec rules with V1 identifiers swapped for V2, plus wind binding, alpha, plan and question."""
    if not isinstance(spec, dict):
        raise ValueError("ExperimentSpec must be an object")
    if spec.get("modelId") != MODEL_ID or spec.get("modelVersion") != MODEL_VERSION:
        raise ValueError(f"modelId/modelVersion must be {MODEL_ID}/{MODEL_VERSION}")
    for key in ("validationPlanId", "questionId"):
        if not isinstance(spec.get(key), str) or not spec[key].strip():
            raise ValueError(f"{key} is required for a v2 run")
    windage = spec.get("windage")
    if not isinstance(windage, dict) or "alpha" not in windage:
        raise ValueError("windage.alpha must be specified explicitly; no default is applied")
    alpha = windage["alpha"]
    if isinstance(alpha, bool) or not isinstance(alpha, (int, float)) or not math.isfinite(alpha) or not ALPHA_MIN <= alpha <= ALPHA_MAX:
        raise ValueError(f"windage.alpha must be a finite number in [{ALPHA_MIN}, {ALPHA_MAX}]")
    manifest = wind["manifest"]
    if spec.get("windDataset") != {"datasetId": manifest["datasetId"], "version": manifest["version"]}:
        raise ValueError("windDataset must bind exactly the selected wind dataset ID and immutable version")
    if spec.get("backend") == "analytic-reference":
        raise ValueError("v2 has no analytic-reference backend; OceanParcels is required")
    # Reuse V1 validation verbatim on a view with V1 identifiers (V1 code untouched).
    view = dict(spec, modelId=v1.MODEL_ID, modelVersion=v1.MODEL_VERSION)
    start, duration, step, output, points = v1._spec_values(view, dataset)
    return start, duration, step, output, points, float(alpha)


class CombinedForcing:
    """RegularGrid look-alike returning current + alpha*wind, so V1's RK4 oracle runs unchanged."""
    def __init__(self, grid, wind_field, alpha):
        self.current, self.wind, self.alpha = grid, wind_field, alpha
        self.grid, self.lon, self.lat, self.times, self.dx, self.dy = grid.grid, grid.lon, grid.lat, grid.times, grid.dx, grid.dy

    def unwrap(self, lon):
        return self.current.unwrap(lon)

    def velocity(self, time, lon, lat):
        u, v = self.current.velocity(time, lon, lat)
        wu, wv = self.wind.velocity(time, lon, lat)   # raises MISSING_FORCING outside the wind box/time; never zero
        return u + self.alpha * wu, v + self.alpha * wv


def AdvectionRK4Windage(particle, fieldset, time):  # pragma: no cover - executed by OceanParcels
    """RK4 with alpha*U10 added at all four stages (UV and UVW both in degrees/s here)."""
    (u1, v1) = fieldset.UV[particle]
    (a1, b1) = fieldset.UVW[particle]
    u1 = u1 + fieldset.alpha * a1
    v1 = v1 + fieldset.alpha * b1
    lon1, lat1 = (particle.lon + u1 * 0.5 * particle.dt, particle.lat + v1 * 0.5 * particle.dt)
    (u2, v2) = fieldset.UV[time + 0.5 * particle.dt, particle.depth, lat1, lon1, particle]
    (a2, b2) = fieldset.UVW[time + 0.5 * particle.dt, particle.depth, lat1, lon1, particle]
    u2 = u2 + fieldset.alpha * a2
    v2 = v2 + fieldset.alpha * b2
    lon2, lat2 = (particle.lon + u2 * 0.5 * particle.dt, particle.lat + v2 * 0.5 * particle.dt)
    (u3, v3) = fieldset.UV[time + 0.5 * particle.dt, particle.depth, lat2, lon2, particle]
    (a3, b3) = fieldset.UVW[time + 0.5 * particle.dt, particle.depth, lat2, lon2, particle]
    u3 = u3 + fieldset.alpha * a3
    v3 = v3 + fieldset.alpha * b3
    lon3, lat3 = (particle.lon + u3 * particle.dt, particle.lat + v3 * particle.dt)
    (u4, v4) = fieldset.UV[time + particle.dt, particle.depth, lat3, lon3, particle]
    (a4, b4) = fieldset.UVW[time + particle.dt, particle.depth, lat3, lon3, particle]
    u4 = u4 + fieldset.alpha * a4
    v4 = v4 + fieldset.alpha * b4
    particle_dlon += (u1 + 2 * u2 + 2 * u3 + u4) / 6.0 * particle.dt  # noqa
    particle_dlat += (v1 + 2 * v2 + 2 * v3 + v4) / 6.0 * particle.dt  # noqa


class _ParcelsWindageStepper:
    def __init__(self, dataset, wind, points, start, grid, wind_field, alpha):
        parcels, np, error = v1._parcels()
        if error:
            raise ValueError(error)
        self.parcels = parcels
        data = {key.upper(): np.array(dataset["grid"][key], dtype=np.float32) for key in ("u", "v")}
        dims = {"lon": np.array(grid.lon, dtype=np.float64), "lat": np.array(grid.lat, dtype=np.float64), "time": np.array(grid.times) - grid.times[0]}
        fieldset = parcels.FieldSet.from_data(data, dims, mesh="spherical", allow_time_extrapolation=False)
        # Wind on its own native Gaussian grid, same spherical unit conversion as U/V; None → NaN (never zero).
        wind_time = np.array(wind_field.times, dtype=np.float64) - grid.times[0]
        for name, key, kind in (("UW", "u", "U"), ("VW", "v", "V")):
            values = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in wind["grid"][key]], dtype=np.float32)
            field = parcels.Field(name, values, lon=np.array(wind_field.lon, dtype=np.float64), lat=np.array(wind_field.lat, dtype=np.float64),
                                  time=wind_time, mesh="spherical", fieldtype=kind, allow_time_extrapolation=False)
            fieldset.add_field(field)
        fieldset.add_vector_field(parcels.VectorField("UVW", fieldset.UW, fieldset.VW))
        fieldset.add_constant("alpha", float(alpha))
        self.pset = parcels.ParticleSet.from_list(fieldset, parcels.ScipyParticle, lon=[grid.unwrap(p[0]) for p in points],
                                                   lat=[p[1] for p in points], time=start - grid.times[0], lonlatdepth_dtype=np.float64)
        self.kernel = self.pset.Kernel(AdvectionRK4Windage)
        self.ids = list(range(len(points)))

    def step(self, dt, invalid):
        indices = [i for i, pid in enumerate(self.ids) if pid in invalid]
        if indices:
            self.pset.remove_indices(indices)
            self.ids = [pid for pid in self.ids if pid not in invalid]
        if not self.ids:
            return {}
        self.pset.execute(self.kernel, runtime=dt, dt=dt, verbose_progress=False)
        return {pid: (float(p.lon_nextloop), float(p.lat_nextloop)) for pid, p in zip(self.ids, self.pset)}


def wind_coverage(spec, dataset, wind):
    """CHECK A — explicit, before any run. Points, whole window, and the current-forcing box must lie inside the wind box."""
    start, duration, _, _, points, _ = _spec_values(spec, dataset, wind)
    field = WindField(wind)
    report = field.covers(start, start + duration, points)
    area = spec["area"]
    corners = [(area["west"], area["south"]), (area["east"], area["south"]), (area["west"], area["north"]), (area["east"], area["north"])]
    box = field.covers(start, start + duration, corners)
    report["experimentAreaInsideWindBox"] = box["ok"]
    report["experimentAreaProblems"] = box["problems"]
    report["ok"] = report["ok"] and box["ok"]
    return report


def preflight(spec, dataset, wind):
    model = describe()
    report = {"ok": False, "errors": [], "warnings": [], "estimate": {}, "model": model}
    try:
        dataset = validate_dataset(dataset)
        wind = validate_wind_dataset(wind)
        start, duration, step, output, points, alpha = _spec_values(spec, dataset, wind)
        coverage = wind_coverage(spec, dataset, wind)
        report["windCoverage"] = coverage
        if not coverage["ok"]:
            raise ValueError("WIND_COVERAGE: wind dataset does not cover the experiment window/area; run blocked (missing is never zero)")
        view = dict(spec, modelId=v1.MODEL_ID, modelVersion=v1.MODEL_VERSION)
        base = v1.preflight(view, dataset)
        if not base["ok"]:
            raise ValueError("; ".join(base["errors"]))
        if base["backend"] != "oceanparcels":
            raise ValueError("v2 requires the pinned OceanParcels adapter")
        forcing = CombinedForcing(RegularGrid(dataset), WindField(wind), alpha)
        for lon, lat in points:
            try:
                forcing.velocity(start, lon, lat)
            except ForcingBoundary as exc:
                raise ValueError(f"release has invalid combined forcing: {exc.status} ({getattr(exc, 'reason', '')})") from exc
        report["estimate"] = base["estimate"]
        report["backend"] = "oceanparcels"
        report["windage"] = {"alpha": alpha, "unit": WINDAGE_UNIT}
        report["warnings"] = base["warnings"] + ["Wind is NCEP-DOE R2 T62 (~1.9°) 6-hourly: synoptic-scale winds only.",
                                                  "Windage alpha is a literature value; it is not fitted to this cohort."]
        report["ok"] = True
    except (ValueError, TypeError, KeyError) as exc:
        report["errors"].append(str(exc))
    return report


def run_experiment(spec, dataset, wind, progress=None, cancelled=None, run_id=None):
    """Same loop as V1 (boundary bisection, ledger, hashes) on the combined forcing. Cancellation → InterruptedError."""
    def check_cancel():
        if cancelled and cancelled():
            raise InterruptedError("research run cancelled")
    check_cancel()
    _check_loaded_source()
    report = preflight(spec, dataset, wind)
    if not report["ok"]:
        raise ValueError("; ".join(report["errors"]))
    check_cancel()
    dataset, wind = validate_dataset(dataset), validate_wind_dataset(wind)
    start, duration, step, output, points, alpha = _spec_values(spec, dataset, wind)
    grid = RegularGrid(dataset)
    wind_field = WindField(wind)
    forcing = CombinedForcing(grid, wind_field, alpha)
    native = _ParcelsWindageStepper(dataset, wind, points, start, grid, wind_field, alpha)
    area = spec["area"]
    state = [{"lon": grid.unwrap(lon), "lat": lat, "status": "ACTIVE"} for lon, lat in points]
    trajectories = [{"particleId": i, "samples": [{"timeUTC": utc_string(start), "lon": (lon + 180) % 360 - 180, "lat": lat, "status": "ACTIVE"}]} for i, (lon, lat) in enumerate(points)]
    elapsed, next_output = 0, output
    wall_start = time.perf_counter()
    boundary_uncertainty = 0
    while elapsed < duration:
        check_cancel()
        dt = min(step, duration - elapsed, next_output - elapsed)
        invalid = set()
        for pid, particle in enumerate(state):
            if pid % 64 == 0:
                check_cancel()
            if particle["status"] != "ACTIVE":
                continue
            try:
                v1._reference_step(forcing, area, start + elapsed, particle["lon"], particle["lat"], dt)
            except ForcingBoundary as exc:
                lon, lat, prefix, status, uncertainty = v1._boundary_step(forcing, area, start + elapsed, particle["lon"], particle["lat"], dt, exc.status)
                particle.update(lon=lon, lat=lat, status=status)
                trajectories[pid]["samples"].append({"timeUTC": utc_string(start + elapsed + prefix), "lon": (lon + 180) % 360 - 180, "lat": lat, "status": status})
                invalid.add(pid)
                boundary_uncertainty = max(boundary_uncertainty, dt, uncertainty)
        positions = native.step(dt, invalid)
        check_cancel()
        for pid, (lon, lat) in positions.items():
            particle = state[pid]
            try:
                v1._segment_check(forcing, area, start + elapsed, particle["lon"], particle["lat"], lon, lat, dt)
            except ForcingBoundary as exc:
                raise ValueError(f"native result failed the boundary guard: {exc.status}") from exc
            if not math.isfinite(lon) or not math.isfinite(lat):
                raise ValueError("non-finite model result")
            particle.update(lon=lon, lat=lat)
        elapsed += dt
        if elapsed == next_output or elapsed == duration:
            for pid, particle in enumerate(state):
                if particle["status"] == "ACTIVE":
                    status = "COMPLETED" if elapsed == duration else "ACTIVE"
                    particle["status"] = status
                    trajectories[pid]["samples"].append({"timeUTC": utc_string(start + elapsed), "lon": (particle["lon"] + 180) % 360 - 180, "lat": particle["lat"], "status": status})
            next_output = min(duration, next_output + output)
        if progress:
            progress({"fraction": elapsed / duration, "elapsedSeconds": elapsed, "durationSeconds": duration,
                      "activeParticles": sum(p["status"] == "ACTIVE" for p in state)})
        if all(p["status"] != "ACTIVE" for p in state):
            break
    check_cancel()
    _check_loaded_source()
    for trajectory, particle in zip(trajectories, state):
        trajectory["finalStatus"] = particle["status"]
    counts = {status: sum(p["status"] == status for p in state) for status in v1.STATUSES}
    if sum(counts.values()) != len(points) or counts["ACTIVE"]:
        raise ValueError("particle ledger invalid")
    displacements = [v1.distance_m(points[i], (p["lon"], p["lat"])) for i, p in enumerate(state)]
    lock = dependency_lock_text()
    names = [line.split("==", 1)[0] for line in lock.splitlines() if "==" in line and not line.startswith("#")]
    manifest, wmanifest = dataset["manifest"], wind["manifest"]
    return {"schemaVersion": "1.0", "qualityStatus": "COMPLETE" if counts["COMPLETED"] == len(points) else "PARTIAL",
            "trajectories": trajectories,
            "summary": {"particleCount": len(points), "statusCounts": counts, "durationSeconds": duration, "elapsedSeconds": elapsed,
                        "meanDisplacementMeters": sum(displacements) / len(points), "maxDisplacementMeters": max(displacements),
                        "displacementMeters": displacements, "boundaryTimeResolutionSeconds": boundary_uncertainty,
                        "observationValidation": "NOT_PERFORMED"},
            "provenance": {"questionId": spec["questionId"], "validationPlanId": spec["validationPlanId"],
                           "modelId": MODEL_ID, "modelVersion": MODEL_VERSION, "modelCommit": model_commit(), "basedOnModelId": v1.MODEL_ID,
                           "backend": "oceanparcels", "engineVersion": v1.PARCELS_VERSION, "kernel": "AdvectionRK4Windage (windage at all four RK4 stages)",
                           "modelSourceSha256": model_source_sha256(), "modelSourceFiles": list(SNAPSHOT_FILES),
                           "specSha256": digest(spec), "runId": run_id or uuid.uuid4().hex,
                           "datasetId": manifest["datasetId"], "datasetVersion": manifest["version"], "datasetSha256": manifest["sha256"],
                           "sourceSha256": manifest.get("sourceSha256"), "surfaceDepthMeters": manifest["surfaceDepthMeters"],
                           "landMaskVersion": manifest["landMaskVersion"], "readerVersion": manifest["readerVersion"],
                           "timeStepSeconds": manifest["timeStepSeconds"], "evidenceKind": manifest["evidenceKind"],
                           "windDatasetId": wmanifest["datasetId"], "windDatasetVersion": wmanifest["version"], "windDatasetSha256": wmanifest["sha256"],
                           "windSourceSha256": wmanifest.get("sourceSha256"), "windReaderVersion": wmanifest["readerVersion"],
                           "windTimeStepSeconds": wmanifest["timeStepSeconds"], "windHeightMeters": wmanifest["heightMeters"], "windTimeMeaning": wmanifest["timeMeaning"],
                           "windage": {"alpha": alpha, "unit": WINDAGE_UNIT, "source": WINDAGE_SOURCE, "sourceReference": WINDAGE_REFERENCE,
                                       "selectionBasis": "drogue-attached SVP" if alpha == 0.0007 else "sensitivity value; not the preregistered primary"},
                           "windTimeInterpolation": "linear between 6-hourly frames; no extrapolation",
                           "windSpaceInterpolation": "bilinear on native Gaussian latitude nodes and 1.875° longitudes; no regridding",
                           "integrationMethod": "RK4", "integrationStepSeconds": step, "outputStepSeconds": output,
                           "resultArraySha256": digest(trajectories),
                           "environment": {"python": platform.python_version(), "platform": platform.platform(),
                                           "dependencies": {name: importlib.metadata.version(name) for name in names},
                                           "dependencyLockSha256": digest(lock)},
                           "python": platform.python_version(), "platform": platform.platform(),
                           "dependencies": {name: importlib.metadata.version(name) for name in names}, "dependencyLockSha256": digest(lock),
                           "positionPrecision": "float64", "forcingPrecision": "float32",
                           "velocityConversion": "OceanParcels Geographic: 111120 meters/degree; zonal cosine latitude (applied identically to current and wind)",
                           "interpolation": "bilinear space, linear time; no extrapolation",
                           "landPolicy": "conservative four-node wet stencil; stop at first invalid RK4 prefix; wind missing → MISSING_FORCING",
                           "wallSeconds": time.perf_counter() - wall_start, "warnings": report["warnings"]}}

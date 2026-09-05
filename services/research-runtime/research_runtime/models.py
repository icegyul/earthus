"""Registered deterministic surface-advection adapter and scientific guards.

OceanParcels is the only backend accepted for real forcing. The dependency-free
reference RK4 exists only for explicitly labelled synthetic numerical tests.
"""
from __future__ import annotations

from collections import Counter
from functools import lru_cache
import importlib.metadata
import math
import platform
from pathlib import Path
import sys
import time

from .datasets import ForcingBoundary, RegularGrid, digest, number, utc_seconds, utc_string, validate_dataset

MODEL_ID = "surface-passive-advection.v1"
MODEL_VERSION = "0.1.0"
PARCELS_VERSION = "3.1.4"
METERS_PER_DEGREE = 1852.0 * 60.0  # OceanParcels Geographic/GeographicPolar convention.
STATUSES = ("ACTIVE", "STRANDED", "OUT_OF_DOMAIN", "MISSING_FORCING", "COMPLETED")


def _disk_source_snapshot():
    return {name: Path(__file__).with_name(name).read_text(encoding="utf-8") for name in ("__init__.py", "datasets.py", "models.py", "cli.py")}


_LOADED_SOURCE_SNAPSHOT = _disk_source_snapshot()
_LOADED_LOCK_TEXT = Path(__file__).resolve().parents[1].joinpath("dependencies.lock.txt").read_text(encoding="utf-8")


def model_source_snapshot():
    return dict(_LOADED_SOURCE_SNAPSHOT)


def model_source_sha256():
    return digest(model_source_snapshot())


def dependency_lock_text():
    return _LOADED_LOCK_TEXT


def _check_loaded_source():
    if digest(_disk_source_snapshot()) != model_source_sha256():
        raise ValueError("runtime source changed since import; restart the worker before executing or publishing results")
    if Path(__file__).resolve().parents[1].joinpath("dependencies.lock.txt").read_text(encoding="utf-8") != _LOADED_LOCK_TEXT:
        raise ValueError("dependency lock changed since import; restart the worker")


@lru_cache(maxsize=1)
def _parcels():
    try:
        import parcels
        import numpy
        if parcels.__version__ != PARCELS_VERSION:
            return None, None, f"OceanParcels {PARCELS_VERSION} required; found {parcels.__version__}"
        return parcels, numpy, None
    except (ImportError, OSError) as exc:
        return None, None, f"OceanParcels {PARCELS_VERSION} unavailable ({type(exc).__name__}); install requirements.txt in an isolated environment"


def describe():
    parcels, _, error = _parcels()
    return {"modelId": MODEL_ID, "modelVersion": MODEL_VERSION, "engine": "OceanParcels", "engineVersion": PARCELS_VERSION,
            "available": parcels is not None, "availabilityReason": error, "grids": ["regular-latlon-a-grid"],
            "latitudeRange": [-80, 80], "integrationMethods": ["RK4"], "maxDurationSeconds": 259200,
            "maxParticles": 10000, "maxParticleSteps": 2000000, "maxOutputSamples": 500000,
            "excludedPhysics": ["windage", "Stokes drift", "diffusion", "vertical mixing", "oil weathering"],
            "validationStatus": "NUMERICAL_TESTS_ONLY", "observationValidation": "NOT_PERFORMED"}


def _spec_values(spec, dataset):
    if not isinstance(spec, dict):
        raise ValueError("ExperimentSpec must be an object")
    for key in ("projectId", "question"):
        if not isinstance(spec.get(key), str) or not spec[key].strip():
            raise ValueError(f"{key} is required")
    for key, value in {"schemaVersion": "1.0", "modelId": MODEL_ID, "modelVersion": MODEL_VERSION,
                       "integrationMethod": "RK4", "boundaryPolicy": "STOP_AT_FIRST_CROSSING"}.items():
        if spec.get(key) != value:
            raise ValueError(f"{key} must be {value}")
    manifest = dataset["manifest"]
    if spec.get("datasetVersions") != [{"datasetId": manifest["datasetId"], "version": manifest["version"]}]:
        raise ValueError("datasetVersions must bind exactly the selected dataset ID and immutable version")
    start = utc_seconds(spec.get("startTimeUTC"))
    duration = number(spec.get("durationSeconds"), "durationSeconds")
    step = number(spec.get("integrationStepSeconds"), "integrationStepSeconds")
    output = number(spec.get("outputStepSeconds"), "outputStepSeconds")
    if not 0 < duration <= 259200 or not 1 <= step <= duration or not 1 <= output <= duration:
        raise ValueError("duration must be in (0,72h]; integration/output steps in [1,duration]")
    if any(v != int(v) for v in (duration, step, output)):
        raise ValueError("v1 time steps and duration must use whole seconds")
    if start < utc_seconds(manifest["validTimeStartUTC"]) or start + duration > utc_seconds(manifest["validTimeEndUTC"]):
        raise ValueError("forcing does not cover the complete requested time range; extrapolation is forbidden")
    area = spec.get("area")
    if not isinstance(area, dict) or set(area) != {"west", "east", "south", "north"}:
        raise ValueError("area requires west/east/south/north")
    for key, value in area.items():
        number(value, f"area.{key}")
    if not -80 <= area["south"] < area["north"] <= 80 or not -180 <= area["west"] <= 180 or not -180 <= area["east"] <= 180 or area["west"] == area["east"]:
        raise ValueError("invalid area; west>east explicitly means a dateline crossing")
    release = spec.get("releaseDefinition")
    if not isinstance(release, dict) or release.get("type") != "points" or not isinstance(release.get("points"), list) or not release["points"]:
        raise ValueError("releaseDefinition requires type=points and nonempty points")
    points = []
    for point in release["points"]:
        if not isinstance(point, dict):
            raise ValueError("release point must be an object")
        lon, lat = number(point.get("lon"), "release.lon"), number(point.get("lat"), "release.lat")
        count = point.get("count", 1)
        if type(count) is not int or not 1 <= count <= 10000 or not -180 <= lon <= 180 or not -80 <= lat <= 80:
            raise ValueError("invalid release coordinate or count")
        points.extend([(lon, lat)] * count)
        if len(points) > 10000:
            raise ValueError("particle limit 10000 exceeded")
    if type(spec.get("particleCount")) is not int or spec["particleCount"] != len(points):
        raise ValueError("particleCount must equal the releaseDefinition count")
    if spec.get("backend") not in (None, "oceanparcels", "analytic-reference"):
        raise ValueError("unsupported backend")
    if spec.get("backend") == "analytic-reference" and manifest["evidenceKind"] != "SYNTHETIC_TEST":
        raise ValueError("analytic-reference backend is restricted to SYNTHETIC_TEST")
    return start, duration, step, output, points


def _inside_area(area, lon, lat):
    lon = (lon + 180) % 360 - 180
    longitude = area["west"] <= lon <= area["east"] if area["west"] < area["east"] else lon >= area["west"] or lon <= area["east"]
    return longitude and area["south"] <= lat <= area["north"]


def preflight(spec, dataset):
    model = describe()
    report = {"ok": False, "errors": [], "warnings": [], "estimate": {}, "model": model}
    try:
        dataset = validate_dataset(dataset)
        start, duration, step, output, points = _spec_values(spec, dataset)
        grid = RegularGrid(dataset)
        for lon, lat in points:
            if not _inside_area(spec["area"], lon, lat):
                raise ValueError("release coordinate lies outside the experiment area")
            try:
                grid.velocity(start, lon, lat)
            except ForcingBoundary as exc:
                raise ValueError(f"release has invalid forcing: {exc.status}") from exc
        synthetic = dataset["manifest"]["evidenceKind"] == "SYNTHETIC_TEST"
        backend = spec.get("backend") or ("oceanparcels" if model["available"] else "analytic-reference")
        if backend == "oceanparcels" and not model["available"] or not synthetic and not model["available"]:
            raise ValueError(model["availabilityReason"])
        if not synthetic and backend != "oceanparcels":
            raise ValueError("real forcing requires the pinned OceanParcels adapter")
        max_speed = max(math.hypot(u or 0, v or 0) for up, vp in zip(dataset["grid"]["u"], dataset["grid"]["v"]) for ur, vr in zip(up, vp) for u, v in zip(ur, vr))
        min_grid_m = min(grid.dx * METERS_PER_DEGREE * math.cos(math.radians(max(abs(grid.lat[0]), abs(grid.lat[-1])))), grid.dy * METERS_PER_DEGREE)
        recommended_step = math.floor(min_grid_m / (4 * max_speed)) if max_speed else int(duration)
        if step > recommended_step:
            raise ValueError(f"integrationStepSeconds exceeds grid-travel bound; use <= {recommended_step}s and verify convergence")
        steps = math.ceil(duration / step) + math.ceil(duration / output)
        output_samples = len(points) * (math.ceil(duration / output) + 1)
        if steps * len(points) > model["maxParticleSteps"] or output_samples > model["maxOutputSamples"]:
            raise ValueError("local worker resource limit exceeded; reduce particles or output frequency")
        report["estimate"] = {"particleStepsUpperBound": steps * len(points), "outputSamplesUpperBound": output_samples,
                              "recommendedMaxStepSeconds": recommended_step, "minimumGridLengthMeters": min_grid_m,
                              "costEstimate": None, "runtimeEstimateSeconds": None}
        report["backend"] = backend
        report["warnings"] = ["Observation validation has not been performed.",
                              "Land detection is conservative at forcing-cell resolution; crossing time is approximate.",
                              "Particle fractions are not probabilities, concentrations, or physical mass."]
        if synthetic:
            report["warnings"].insert(0, "SYNTHETIC_TEST: analytic fixture, not observations or an ocean forecast.")
        report["ok"] = True
    except (ValueError, TypeError, KeyError) as exc:
        report["errors"].append(str(exc))
    return report


def _angular(grid, area, t, lon, lat):
    if not _inside_area(area, lon, lat):
        raise ForcingBoundary("OUT_OF_DOMAIN")
    u, v = grid.velocity(t, lon, lat)
    return u / (METERS_PER_DEGREE * math.cos(math.radians(lat))), v / METERS_PER_DEGREE


def _reference_step(grid, area, t, lon, lat, dt):
    """RK4 numerical oracle plus the strict boundary guard used by both backends."""
    a, b = _angular(grid, area, t, lon, lat)
    c, d = _angular(grid, area, t + dt / 2, lon + dt * a / 2, lat + dt * b / 2)
    e, f = _angular(grid, area, t + dt / 2, lon + dt * c / 2, lat + dt * d / 2)
    g, h = _angular(grid, area, t + dt, lon + dt * e, lat + dt * f)
    end_lon, end_lat = lon + dt * (a + 2*c + 2*e + g) / 6, lat + dt * (b + 2*d + 2*f + h) / 6
    _segment_check(grid, area, t, lon, lat, end_lon, end_lat, dt)
    return end_lon, end_lat


def _segment_check(grid, area, t, lon, lat, end_lon, end_lat, dt):
    segments = max(1, math.ceil(max(abs(end_lon - lon) / grid.dx, abs(end_lat - lat) / grid.dy) * 4))
    for i in range(1, segments + 1):
        fraction = i / segments
        _angular(grid, area, t + fraction*dt, lon + fraction*(end_lon-lon), lat + fraction*(end_lat-lat))


def _boundary_step(grid, area, t, lon, lat, dt, initial_status):
    """Bisect the last safe RK4 prefix; never publish a point beyond a dry cell."""
    lower, upper = 0.0, dt
    last_lon, last_lat = lon, lat
    status = initial_status
    for _ in range(24):
        middle = (lower + upper) / 2
        try:
            last_lon, last_lat = _reference_step(grid, area, t, lon, lat, middle)
            lower = middle
        except ForcingBoundary as exc:
            status = exc.status
            upper = middle
    return last_lon, last_lat, lower, status, upper - lower


class _ParcelsStepper:
    def __init__(self, dataset, points, start, grid):
        parcels, np, error = _parcels()
        if error:
            raise ValueError(error)
        self.parcels = parcels
        data = {key.upper(): np.array(dataset["grid"][key], dtype=np.float32) for key in ("u", "v")}
        dims = {"lon": np.array(grid.lon, dtype=np.float64), "lat": np.array(grid.lat, dtype=np.float64), "time": np.array(grid.times) - grid.times[0]}
        fieldset = parcels.FieldSet.from_data(data, dims, mesh="spherical", allow_time_extrapolation=False)
        self.pset = parcels.ParticleSet.from_list(fieldset, parcels.ScipyParticle, lon=[grid.unwrap(p[0]) for p in points],
                                                   lat=[p[1] for p in points], time=start-grid.times[0], lonlatdepth_dtype=np.float64)
        self.ids = list(range(len(points)))

    def step(self, dt, invalid):
        indices = [i for i, pid in enumerate(self.ids) if pid in invalid]
        if indices:
            self.pset.remove_indices(indices)
            self.ids = [pid for pid in self.ids if pid not in invalid]
        if not self.ids:
            return {}
        self.pset.execute(self.parcels.AdvectionRK4, runtime=dt, dt=dt, verbose_progress=False)
        # Parcels 3 exposes end-of-step values through *_nextloop; lon is one step behind.
        return {pid: (float(p.lon_nextloop), float(p.lat_nextloop)) for pid, p in zip(self.ids, self.pset)}


def distance_m(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2-lat1, math.radians((b[0]-a[0]+180) % 360-180)
    value = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, max(0, value))))


def run_experiment(spec, dataset, progress=None, cancelled=None):
    """Run an immutable spec. Cancellation raises InterruptedError, never success."""
    def check_cancel():
        if cancelled and cancelled():
            raise InterruptedError("research run cancelled")
    check_cancel()
    _check_loaded_source()
    report = preflight(spec, dataset)
    if not report["ok"]:
        raise ValueError("; ".join(report["errors"]))
    check_cancel()
    dataset = validate_dataset(dataset)
    start, duration, step, output, points = _spec_values(spec, dataset)
    grid = RegularGrid(dataset)
    backend = report["backend"]
    native = _ParcelsStepper(dataset, points, start, grid) if backend == "oceanparcels" else None
    state = [{"lon": grid.unwrap(lon), "lat": lat, "status": "ACTIVE"} for lon, lat in points]
    trajectories = [{"particleId": i, "samples": [{"timeUTC": utc_string(start), "lon": (lon+180)%360-180, "lat": lat, "status": "ACTIVE"}]} for i, (lon, lat) in enumerate(points)]
    elapsed, next_output = 0, output
    wall_start = time.perf_counter()
    boundary_uncertainty = 0
    while elapsed < duration:
        check_cancel()
        dt = min(step, duration-elapsed, next_output-elapsed)
        predicted, invalid = {}, set()
        for pid, particle in enumerate(state):
            if pid % 64 == 0:
                check_cancel()
            if particle["status"] != "ACTIVE":
                continue
            try:
                predicted[pid] = _reference_step(grid, spec["area"], start+elapsed, particle["lon"], particle["lat"], dt)
            except ForcingBoundary as exc:
                lon, lat, prefix, status, uncertainty = _boundary_step(grid, spec["area"], start+elapsed, particle["lon"], particle["lat"], dt, exc.status)
                particle.update(lon=lon, lat=lat, status=status)
                trajectories[pid]["samples"].append({"timeUTC": utc_string(start+elapsed+prefix), "lon": (lon+180)%360-180, "lat": lat, "status": status})
                invalid.add(pid)
                boundary_uncertainty = max(boundary_uncertainty, dt, uncertainty)
        positions = native.step(dt, invalid) if native else predicted
        check_cancel()
        for pid, (lon, lat) in positions.items():
            particle = state[pid]
            # Independent validity guard also inspects the actual native result.
            try:
                _segment_check(grid, spec["area"], start+elapsed, particle["lon"], particle["lat"], lon, lat, dt)
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
                    trajectories[pid]["samples"].append({"timeUTC": utc_string(start+elapsed), "lon": (particle["lon"]+180)%360-180, "lat": particle["lat"], "status": status})
            next_output = min(duration, next_output+output)
        if progress:
            progress({"fraction": elapsed/duration, "elapsedSeconds": elapsed, "durationSeconds": duration,
                      "activeParticles": sum(p["status"] == "ACTIVE" for p in state)})
        if all(p["status"] != "ACTIVE" for p in state):
            break
    check_cancel()
    _check_loaded_source()
    for trajectory, particle in zip(trajectories, state):
        trajectory["finalStatus"] = particle["status"]
    counts = {status: sum(p["status"] == status for p in state) for status in STATUSES}
    if sum(counts.values()) != len(points) or counts["ACTIVE"]:
        raise ValueError("particle ledger invalid")
    displacements = [distance_m(points[i], (p["lon"], p["lat"])) for i, p in enumerate(state)]
    source_hash = model_source_sha256()
    lock = dependency_lock_text()
    names = [line.split("==", 1)[0] for line in lock.splitlines() if "==" in line and not line.startswith("#")]
    versions = {name: importlib.metadata.version(name) for name in names} if native else {}
    return {"schemaVersion": "1.0", "qualityStatus": "COMPLETE" if counts["COMPLETED"] == len(points) else "PARTIAL",
            "trajectories": trajectories,
            "summary": {"particleCount": len(points), "statusCounts": counts, "durationSeconds": duration,
                        "elapsedSeconds": elapsed, "meanDisplacementMeters": sum(displacements)/len(points),
                        "maxDisplacementMeters": max(displacements), "displacementMeters": displacements,
                        "boundaryTimeResolutionSeconds": boundary_uncertainty, "observationValidation": "NOT_PERFORMED"},
            "provenance": {"modelId": MODEL_ID, "modelVersion": MODEL_VERSION, "backend": backend,
                           "engineVersion": PARCELS_VERSION if native else "earthus-test-reference/1", "modelSourceSha256": source_hash,
                           "specSha256": digest(spec), "datasetSha256": dataset["manifest"]["sha256"],
                           "datasetId": dataset["manifest"]["datasetId"], "datasetVersion": dataset["manifest"]["version"],
                           "surfaceDepthMeters": dataset["manifest"]["surfaceDepthMeters"],
                           "landMaskVersion": dataset["manifest"]["landMaskVersion"], "readerVersion": dataset["manifest"]["readerVersion"],
                           "timeStepSeconds": dataset["manifest"]["timeStepSeconds"], "sourceSha256": dataset["manifest"].get("sourceSha256"),
                           "evidenceKind": dataset["manifest"]["evidenceKind"], "resultArraySha256": digest(trajectories),
                           "python": platform.python_version(), "platform": platform.platform(), "dependencies": versions,
                           "dependencyLockSha256": digest(lock),
                           "positionPrecision": "float64", "forcingPrecision": "float32" if native else "float64",
                           "velocityConversion": "OceanParcels Geographic: 111120 meters/degree; zonal cosine latitude",
                           "interpolation": "bilinear space, linear time; no extrapolation",
                           "landPolicy": "conservative four-node wet stencil; stop at first invalid RK4 prefix",
                           "wallSeconds": time.perf_counter()-wall_start, "warnings": report["warnings"]}}

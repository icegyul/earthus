"""Versioned, bounded regular A-grid input contract; no network fetches.

JSON is the normalized interchange reader. NetCDF providers must first produce
this contract and retain their source file SHA-256 and conversion history.
"""
from __future__ import annotations

from bisect import bisect_right
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math

READER_VERSION = "earthus-json-grid/1"
MAX_VALUES = 2_000_000
EVIDENCE_KINDS = {"OBSERVATION", "ANALYSIS", "REANALYSIS", "FORECAST", "SYNTHETIC_TEST"}


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def utc_seconds(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("UTC timestamp must be an ISO-8601 string ending in Z")
    try:
        date = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValueError("invalid UTC timestamp") from exc
    return date.timestamp()


def utc_string(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z").replace(".000000Z", "Z")


def number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    return value


def _axis(values, name, low, high):
    if not isinstance(values, list) or len(values) < 2:
        raise ValueError(f"grid.{name} requires at least two coordinates")
    for value in values:
        number(value, name)
        if not low <= value <= high:
            raise ValueError(f"grid.{name} outside supported coordinate range")
    step = values[1] - values[0]
    if step <= 0 or any(not math.isclose(b - a, step, rel_tol=1e-6, abs_tol=1e-8) for a, b in zip(values, values[1:])):
        raise ValueError(f"grid.{name} must be strictly increasing and regular")
    return step


def validate_dataset(payload):
    """Return a defensively copied, JSON-serializable dataset or raise ValueError."""
    if not isinstance(payload, dict) or not isinstance(payload.get("manifest"), dict) or not isinstance(payload.get("grid"), dict):
        raise ValueError("dataset requires manifest and grid objects")
    manifest, grid = payload["manifest"], payload["grid"]
    required_text = ("datasetId", "version", "evidenceKind", "sourceURI", "provider", "citation", "license",
                     "issuedAtUTC", "collectedAtUTC", "validTimeStartUTC", "validTimeEndUTC", "sha256", "hashScope",
                     "gridType", "crs", "calendar", "velocityUnits", "uDirection", "vDirection", "landMaskVersion", "readerVersion")
    for key in required_text:
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            raise ValueError(f"manifest.{key} is required")
    if manifest["evidenceKind"] not in EVIDENCE_KINDS:
        raise ValueError("unsupported evidenceKind")
    expected = {"hashScope": "canonical-grid-json", "gridType": "regular-latlon-a-grid", "crs": "EPSG:4326",
                "velocityUnits": "m/s", "uDirection": "eastward", "vDirection": "northward", "readerVersion": READER_VERSION}
    for key, value in expected.items():
        if manifest[key] != value:
            raise ValueError(f"manifest.{key} must be {value}")
    if manifest["calendar"] not in {"standard", "gregorian", "proleptic_gregorian"}:
        raise ValueError("unsupported calendar; no implicit conversion is permitted")
    if number(manifest.get("surfaceDepthMeters"), "surfaceDepthMeters") < 0:
        raise ValueError("surfaceDepthMeters must be nonnegative")
    if not isinstance(manifest.get("redistributionAllowed"), bool) or not isinstance(manifest.get("processingHistory"), list):
        raise ValueError("redistributionAllowed boolean and processingHistory list are required")
    if manifest["evidenceKind"] != "SYNTHETIC_TEST":
        source_hash = manifest.get("sourceSha256", "")
        if len(source_hash) != 64 or any(c not in "0123456789abcdef" for c in source_hash):
            raise ValueError("real forcing requires sourceSha256 for the original immutable file")
    for key in ("issuedAtUTC", "collectedAtUTC", "validTimeStartUTC", "validTimeEndUTC"):
        utc_seconds(manifest[key])
    _axis(grid.get("lon"), "lon", -360, 540)
    _axis(grid.get("lat"), "lat", -80, 80)
    if grid["lon"][-1] - grid["lon"][0] > 360:
        raise ValueError("longitude span cannot exceed 360 degrees")
    times = grid.get("timeUTC")
    if not isinstance(times, list) or len(times) < 2:
        raise ValueError("time-dependent forcing requires at least two UTC samples; snapshot input rejected")
    seconds = [utc_seconds(t) for t in times]
    if any(b <= a for a, b in zip(seconds, seconds[1:])):
        raise ValueError("forcing time axis must be strictly increasing")
    cadence = number(manifest.get("timeStepSeconds"), "manifest.timeStepSeconds")
    if cadence <= 0 or any(not math.isclose(b-a, cadence, rel_tol=1e-10, abs_tol=1e-6) for a, b in zip(seconds, seconds[1:])):
        raise ValueError("forcing has missing or irregular time steps; gaps must not be interpolated silently")
    if utc_seconds(manifest["validTimeStartUTC"]) != seconds[0] or utc_seconds(manifest["validTimeEndUTC"]) != seconds[-1]:
        raise ValueError("manifest valid time range must exactly match grid.timeUTC")
    nt, ny, nx = len(times), len(grid["lat"]), len(grid["lon"])
    if nt * ny * nx * 2 > MAX_VALUES:
        raise ValueError(f"dataset exceeds {MAX_VALUES} velocity values; subset before importing")
    for component in ("u", "v"):
        array = grid.get(component)
        if not isinstance(array, list) or len(array) != nt:
            raise ValueError(f"grid.{component} must have shape [time][lat][lon]")
        for plane in array:
            if not isinstance(plane, list) or len(plane) != ny:
                raise ValueError(f"grid.{component} latitude dimension mismatch")
            for row in plane:
                if not isinstance(row, list) or len(row) != nx:
                    raise ValueError(f"grid.{component} longitude dimension mismatch")
                for value in row:
                    if value is not None:
                        number(value, component)
                        if abs(value) > 20:
                            raise ValueError("surface current exceeds supported 20 m/s bound; check units and missing values")
    mask = grid.get("landMask")
    if not isinstance(mask, list) or len(mask) != ny or any(not isinstance(row, list) or len(row) != nx or any(type(v) is not bool for v in row) for row in mask):
        raise ValueError("landMask must be boolean [lat][lon], true means land")
    if digest(grid) != manifest["sha256"]:
        raise ValueError("grid SHA-256 mismatch")
    return deepcopy({"manifest": manifest, "grid": grid})


class ForcingBoundary(ValueError):
    def __init__(self, status):
        super().__init__(status)
        self.status = status


class RegularGrid:
    """Strict bilinear-space/linear-time guard with conservative dry-cell checks."""
    def __init__(self, dataset):
        self.grid = dataset["grid"]
        self.lon, self.lat = self.grid["lon"], self.grid["lat"]
        self.times = [utc_seconds(t) for t in self.grid["timeUTC"]]
        self.dx, self.dy = self.lon[1] - self.lon[0], self.lat[1] - self.lat[0]

    def unwrap(self, lon):
        center = (self.lon[0] + self.lon[-1]) / 2
        return lon + 360 * round((center - lon) / 360)

    @staticmethod
    def _bracket(axis, value):
        if value < axis[0] - 1e-10 or value > axis[-1] + 1e-10:
            raise ForcingBoundary("OUT_OF_DOMAIN")
        i = min(max(0, bisect_right(axis, value) - 1), len(axis) - 2)
        return i, min(1.0, max(0.0, (value - axis[i]) / (axis[i + 1] - axis[i])))

    def velocity(self, time, lon, lat):
        if time < self.times[0] or time > self.times[-1]:
            raise ForcingBoundary("MISSING_FORCING")
        xi, fx = self._bracket(self.lon, self.unwrap(lon))
        yi, fy = self._bracket(self.lat, lat)
        ti, ft = self._bracket(self.times, time)
        # Entire interpolation stencil must be wet, including zero-weight edges.
        if any(self.grid["landMask"][y][x] for y in (yi, yi + 1) for x in (xi, xi + 1)):
            raise ForcingBoundary("STRANDED")
        result = []
        for component in ("u", "v"):
            planes = []
            for t in (ti, ti + 1):
                values = [self.grid[component][t][y][x] for y, x in ((yi, xi), (yi, xi + 1), (yi + 1, xi), (yi + 1, xi + 1))]
                if any(v is None for v in values):
                    raise ForcingBoundary("MISSING_FORCING")
                a, b, c, d = values
                planes.append((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
            result.append(planes[0] * (1 - ft) + planes[1] * ft)
        return tuple(result)

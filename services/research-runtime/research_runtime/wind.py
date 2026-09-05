"""10 m wind forcing for surface-passive-advection.v2.windage.

Reader: NCEP-DOE Reanalysis 2 `uwnd.10m` / `vwnd.10m` NCSS subsets (NOAA PSL) → EARTHUS wind JSON.
Field:  bilinear interpolation on the *native Gaussian latitude nodes* (their spacing is not
        exactly regular), linear in time, no extrapolation, no regridding, no nearest-neighbour.
        Anything outside the wind box or time axis raises ForcingBoundary("MISSING_FORCING")
        with a wind-specific reason. A missing value is never replaced by zero.
"""
from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path

from .datasets import ForcingBoundary, canonical_bytes, digest, number, utc_seconds

WIND_READER_VERSION = "earthus-ncep-r2-wind/1"
WIND_GRID_TYPE = "gaussian-latlon-a-grid"
WIND_HEIGHT_M = 10


def _monotone(values, name):
    if not isinstance(values, list) or len(values) < 2:
        raise ValueError(f"wind grid.{name} requires at least two coordinates")
    for value in values:
        number(value, name)
    if any(b <= a for a, b in zip(values, values[1:])):
        raise ValueError(f"wind grid.{name} must be strictly increasing")


def validate_wind_dataset(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("manifest"), dict) or not isinstance(payload.get("grid"), dict):
        raise ValueError("wind dataset requires manifest and grid objects")
    manifest, grid = payload["manifest"], payload["grid"]
    for key in ("datasetId", "version", "evidenceKind", "sourceURI", "provider", "citation", "license",
                "issuedAtUTC", "collectedAtUTC", "validTimeStartUTC", "validTimeEndUTC", "sha256", "hashScope",
                "gridType", "crs", "calendar", "velocityUnits", "uDirection", "vDirection", "readerVersion", "variableKind", "timeMeaning"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            raise ValueError(f"wind manifest.{key} is required")
    expected = {"hashScope": "canonical-grid-json", "gridType": WIND_GRID_TYPE, "crs": "EPSG:4326", "velocityUnits": "m/s",
                "uDirection": "eastward", "vDirection": "northward", "readerVersion": WIND_READER_VERSION, "variableKind": "wind10m"}
    for key, value in expected.items():
        if manifest[key] != value:
            raise ValueError(f"wind manifest.{key} must be {value}")
    if manifest["evidenceKind"] not in {"REANALYSIS", "ANALYSIS", "FORECAST", "SYNTHETIC_TEST"}:
        raise ValueError("unsupported wind evidenceKind")
    if manifest["calendar"] not in {"standard", "gregorian", "proleptic_gregorian"}:
        raise ValueError("unsupported wind calendar")
    if number(manifest.get("heightMeters"), "heightMeters") != WIND_HEIGHT_M:
        raise ValueError("wind must be the 10 m level")
    if manifest["evidenceKind"] != "SYNTHETIC_TEST":
        source_hash = manifest.get("sourceSha256", "")
        if len(source_hash) != 64 or any(c not in "0123456789abcdef" for c in source_hash):
            raise ValueError("real wind requires sourceSha256 for the original immutable files")
    _monotone(grid.get("lon"), "lon")
    _monotone(grid.get("lat"), "lat")
    if grid["lon"][-1] - grid["lon"][0] > 360 or any(not -90 <= v <= 90 for v in grid["lat"]):
        raise ValueError("wind coordinates out of range")
    times = grid.get("timeUTC")
    if not isinstance(times, list) or len(times) < 2:
        raise ValueError("time-dependent wind requires at least two UTC samples")
    seconds = [utc_seconds(t) for t in times]
    cadence = number(manifest.get("timeStepSeconds"), "wind manifest.timeStepSeconds")
    if cadence <= 0 or any(not math.isclose(b - a, cadence, rel_tol=1e-10, abs_tol=1e-6) for a, b in zip(seconds, seconds[1:])):
        raise ValueError("wind has missing or irregular time steps; gaps must not be interpolated silently")
    if utc_seconds(manifest["validTimeStartUTC"]) != seconds[0] or utc_seconds(manifest["validTimeEndUTC"]) != seconds[-1]:
        raise ValueError("wind manifest valid time range must exactly match grid.timeUTC")
    nt, ny, nx = len(times), len(grid["lat"]), len(grid["lon"])
    for component in ("u", "v"):
        array = grid.get(component)
        if not isinstance(array, list) or len(array) != nt:
            raise ValueError(f"wind grid.{component} must have shape [time][lat][lon]")
        for plane in array:
            if not isinstance(plane, list) or len(plane) != ny or any(not isinstance(row, list) or len(row) != nx for row in plane):
                raise ValueError(f"wind grid.{component} dimension mismatch")
            for row in plane:
                for value in row:
                    if value is not None:
                        if abs(number(value, component)) > 120:
                            raise ValueError("wind speed component outside the provider valid range (±120 m/s)")
    if digest(grid) != manifest["sha256"]:
        raise ValueError("wind grid SHA-256 mismatch")
    return payload


class WindField:
    """Bilinear on native (non-uniform) nodes, linear in time, strict boundaries."""
    def __init__(self, dataset):
        self.grid = dataset["grid"]
        self.lon, self.lat = self.grid["lon"], self.grid["lat"]
        self.times = [utc_seconds(t) for t in self.grid["timeUTC"]]

    def unwrap(self, lon):
        center = (self.lon[0] + self.lon[-1]) / 2
        return lon + 360 * round((center - lon) / 360)

    @staticmethod
    def _bracket(axis, value, reason):
        if value < axis[0] - 1e-10 or value > axis[-1] + 1e-10:
            error = ForcingBoundary("MISSING_FORCING")
            error.reason = reason
            raise error
        i = min(max(0, bisect_right(axis, value) - 1), len(axis) - 2)
        return i, min(1.0, max(0.0, (value - axis[i]) / (axis[i + 1] - axis[i])))

    def velocity(self, time, lon, lat):
        """(u10, v10) in m/s. Raises ForcingBoundary(MISSING_FORCING) outside the box or time axis."""
        if time < self.times[0] or time > self.times[-1]:
            error = ForcingBoundary("MISSING_FORCING")
            error.reason = "WIND_TIME_OUTSIDE"
            raise error
        xi, fx = self._bracket(self.lon, self.unwrap(lon), "WIND_OUT_OF_DOMAIN")
        yi, fy = self._bracket(self.lat, lat, "WIND_OUT_OF_DOMAIN")
        ti, ft = self._bracket(self.times, time, "WIND_TIME_OUTSIDE")
        result = []
        for component in ("u", "v"):
            planes = []
            for t in (ti, ti + 1):
                values = [self.grid[component][t][y][x] for y, x in ((yi, xi), (yi, xi + 1), (yi + 1, xi), (yi + 1, xi + 1))]
                if any(v is None for v in values):
                    error = ForcingBoundary("MISSING_FORCING")
                    error.reason = "WIND_VALUE_MISSING"
                    raise error
                a, b, c, d = values
                planes.append((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
            result.append(planes[0] * (1 - ft) + planes[1] * ft)
        return tuple(result)

    def covers(self, start, end, points, margin_degrees=0.0):
        """CHECK A: explicit coverage report for a time window and release points (never silently)."""
        problems = []
        if start < self.times[0] or end > self.times[-1]:
            problems.append({"kind": "WIND_TIME_OUTSIDE", "windStartUTC": self.grid["timeUTC"][0], "windEndUTC": self.grid["timeUTC"][-1]})
        for index, (lon, lat) in enumerate(points):
            x = self.unwrap(lon)
            if not (self.lon[0] + margin_degrees <= x <= self.lon[-1] - margin_degrees) or not (self.lat[0] + margin_degrees <= lat <= self.lat[-1] - margin_degrees):
                problems.append({"kind": "WIND_OUT_OF_DOMAIN", "particleId": index, "lon": lon, "lat": lat})
        return {"ok": not problems, "problems": problems, "windBox": {"west": self.lon[0], "east": self.lon[-1], "south": self.lat[0], "north": self.lat[-1]},
                "windTime": {"startUTC": self.grid["timeUTC"][0], "endUTC": self.grid["timeUTC"][-1]}, "marginDegrees": margin_degrees}


def build_ncep_r2_wind_dataset(u_path, v_path, u_uri, v_uri, dataset_id, version, issued_at=None):
    """Two PSL NCSS NetCDF subsets (uwnd.10m, vwnd.10m) → validated wind dataset + acquisition record."""
    import netCDF4
    import numpy as np
    parts = {}
    for name, path, uri in (("u", Path(u_path), u_uri), ("v", Path(v_path), v_uri)):
        with netCDF4.Dataset(path) as data:
            var = data["uwnd" if name == "u" else "vwnd"]
            if var.units != "m/s":
                raise ValueError("wind units must be m/s")
            if "10 m" not in getattr(var, "long_name", "") and getattr(var, "level_desc", "") != "10 m":
                raise ValueError("wind variable is not the 10 m level")
            calendar = getattr(data["time"], "calendar", "standard")
            times = [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in netCDF4.num2date(data["time"][:], data["time"].units, calendar=calendar)]
            lat = [float(x) for x in data["lat"][:]]
            lon = [float(x) for x in data["lon"][:]]
            values = var[:]
            if values.ndim == 4:
                values = values[:, 0]
            masked = np.ma.getmaskarray(values)
            filled = np.ma.filled(values.astype(float), np.nan)
            filled[masked] = np.nan
            parts[name] = {"times": times, "lat": lat, "lon": lon, "values": filled, "calendar": calendar,
                           "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size, "uri": uri, "path": path.name,
                           "longName": getattr(var, "long_name", ""), "dataset": getattr(var, "dataset", ""), "title": getattr(data, "title", "")}
    u, v = parts["u"], parts["v"]
    if u["times"] != v["times"] or u["lat"] != v["lat"] or u["lon"] != v["lon"]:
        raise ValueError("u and v wind subsets differ in grid or time axis")
    lat_raw, lon_raw = u["lat"], u["lon"]
    # Latitude arrives north→south: reverse to ascending, reversing the data planes with it (no resampling).
    flip = lat_raw[0] > lat_raw[-1]
    lat = list(reversed(lat_raw)) if flip else list(lat_raw)
    # Longitude arrives 0..360: express in -180..180; the subset does not cross 0/360 so order is preserved.
    lon = [x - 360 if x >= 180 else x for x in lon_raw]
    if any(b <= a for a, b in zip(lon, lon[1:])):
        raise ValueError("wind longitude subset crosses the 0/360 seam; unsupported by this reader")
    def as_list(arr):
        arr = arr[:, ::-1, :] if flip else arr
        return [[[None if not math.isfinite(x) else float(x) for x in row] for row in plane.tolist()] for plane in arr]
    grid = {"lon": lon, "lat": lat, "timeUTC": u["times"], "u": as_list(u["values"]), "v": as_list(v["values"])}
    seconds = [utc_seconds(t) for t in u["times"]]
    cadence = seconds[1] - seconds[0]
    sources = [{k: part[k] for k in ("path", "uri", "sha256", "bytes", "longName", "dataset", "title")} for part in (u, v)]
    issued = issued_at or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    manifest = {
        "datasetId": dataset_id, "version": version, "evidenceKind": "REANALYSIS", "variableKind": "wind10m", "heightMeters": WIND_HEIGHT_M,
        "provider": "NOAA PSL — NCEP-DOE AMIP-II Reanalysis (Reanalysis-2)",
        "sourceURI": "https://psl.noaa.gov/data/gridded/data.ncep.reanalysis2.gaussian.html",
        "sourceSha256": digest(sources), "sourceSha256Scope": "SHA-256 of canonical JSON ordered original-subset metadata list (acquisition sources)",
        "citation": "Kanamitsu, M., et al. (2002). NCEP-DOE AMIP-II Reanalysis (R-2). Bull. Amer. Meteor. Soc., 83, 1631-1643. Data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at https://psl.noaa.gov. 10 m wind subset " + f"{u['times'][0]} to {u['times'][-1]}.",
        "license": "No restrictions stated by provider; acknowledgment of NOAA PSL requested.", "licenseURI": "https://psl.noaa.gov/data/gridded/data.ncep.reanalysis2.gaussian.html",
        "redistributionAllowed": True, "issuedAtUTC": issued, "issuedAtMeaning": "normalized-fixture-creation; not original analysis publication",
        "collectedAtUTC": issued, "validTimeStartUTC": u["times"][0], "validTimeEndUTC": u["times"][-1],
        "gridType": WIND_GRID_TYPE, "gridMeaning": "T62 Gaussian latitudes retained as stored (spacing ≈1.9047° but not exactly uniform); regular 1.875° longitudes",
        "crs": "EPSG:4326", "calendar": u["calendar"], "velocityUnits": "m/s", "uDirection": "eastward", "vDirection": "northward",
        "timeStepSeconds": cadence, "timeMeaning": "file time coordinate taken as the valid time of the 6-hourly forecast (provider long_name '6-Hourly Forecast of U-wind at 10 m')",
        "sha256": digest(grid), "hashScope": "canonical-grid-json", "readerVersion": WIND_READER_VERSION,
        "processingHistory": [
            {"operation": "PSL THREDDS NCSS subset", "sourceFiles": sources},
            {"operation": "netCDF4 mask-and-scale decode; drop singleton level axis", "fillPolicy": "missing values become null; never zero"},
            {"operation": "reverse latitude axis to ascending together with data planes (no resampling)", "applied": flip},
            {"operation": "express longitude in -180..180 without reordering", "rawLongitude": lon_raw, "rawLatitude": lat_raw},
        ],
    }
    dataset = validate_wind_dataset({"manifest": manifest, "grid": grid})
    return dataset, {"fixtureIssuedAtUTC": issued, "sources": sources, "sourceBundleSha256": digest(sources)}


def write_wind_dataset(dataset, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_bytes(dataset) + b"\n")
    return path

"""HYCOM NCSS NetCDF → EARTHUS JSON grid (regular lat/lon A-grid, single depth).

The first NetCDF reader of the research runtime. It is provider-specific on purpose:
it checks the CF names, units, calendar and distribution statement that the HYCOM
GOFS 3.1 subsets carry, refuses irregular grids and time gaps, and keeps the original
files' hashes in the manifest. It is not a general "upload any NetCDF" path.

Masked (land / below-bottom) nodes become landMask=true and u/v=None — never zero.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path
import re

import netCDF4
import numpy as np

from .datasets import digest, validate_dataset

READER = "earthus-hycom-netcdf/1"


def _regular(values, name, tolerance=2e-4):
    step = values[1] - values[0]
    if step <= 0 or any(abs((b - a) - step) > tolerance for a, b in zip(values, values[1:])):
        raise ValueError(f"{name} spacing is not regular; this reader only accepts regular lat/lon A-grids")
    return step


def read_hycom_parts(parts, expected_depth_m):
    """parts: list of (path, sourceURI). Returns (grid, sources, raw_axes, meta)."""
    sources, all_time, all_u, all_v = [], [], [], []
    raw_lat = raw_lon = None
    meta = {}
    for path, uri in parts:
        path = Path(path)
        with netCDF4.Dataset(path) as data:
            depths = data["depth"][:].tolist()
            if depths != [float(expected_depth_m)]:
                raise ValueError(f"{path.name}: depth {depths} != expected {expected_depth_m} m")
            if data["time"].calendar not in ("gregorian", "standard"):
                raise ValueError("unsupported calendar")
            if data["water_u"].standard_name != "eastward_sea_water_velocity" or data["water_v"].standard_name != "northward_sea_water_velocity":
                raise ValueError("unexpected velocity standard_name")
            if data["water_u"].units != "m/s" or data["water_v"].units != "m/s":
                raise ValueError("velocity units must be m/s")
            lat, lon = data["lat"][:].tolist(), data["lon"][:].tolist()
            if raw_lat is None:
                raw_lat, raw_lon = lat, lon
            elif lat != raw_lat or lon != raw_lon:
                raise ValueError("source parts differ in grid; no implicit regridding")
            times = [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in netCDF4.num2date(data["time"][:], data["time"].units, calendar=data["time"].calendar)]
            u, v = data["water_u"][:, 0], data["water_v"][:, 0]
            um, vm = np.ma.getmaskarray(u), np.ma.getmaskarray(v)
            uf, vf = np.ma.filled(u.astype(float), np.nan), np.ma.filled(v.astype(float), np.nan)
            uf[um] = np.nan
            vf[vm] = np.nan
            all_time.extend(times)
            all_u.extend(uf.tolist())
            all_v.extend(vf.tolist())
            translated = re.search(r"Translation Date = ([^\s]+)", getattr(data, "History", "")).group(1)
            meta.setdefault("distribution_statement", getattr(data, "distribution_statement", ""))
            meta.setdefault("conventions", getattr(data, "Conventions", ""))
            sources.append({"path": path.name, "sourceURI": uri, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                            "bytes": path.stat().st_size, "validTimeStartUTC": times[0], "validTimeEndUTC": times[-1],
                            "ncssTranslationTimeUTC": translated, "originalTimeUnits": data["time"].units,
                            "originalConventions": getattr(data, "Conventions", ""), "originalFieldType": getattr(data, "field_type", ""),
                            "uScaleFactor": float(getattr(data["water_u"], "scale_factor", 1.0)),
                            "vScaleFactor": float(getattr(data["water_v"], "scale_factor", 1.0))})
    if len(set(all_time)) != len(all_time):
        raise ValueError("duplicate frames across parts")
    seconds = [datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() for t in all_time]
    cadence = seconds[1] - seconds[0]
    gaps = [(all_time[i], all_time[i + 1]) for i in range(len(seconds) - 1) if seconds[i + 1] - seconds[i] != cadence]
    if gaps:
        raise ValueError(f"missing or irregular frames: {gaps}; gaps are never interpolated")
    _regular(raw_lat, "lat")
    _regular(raw_lon, "lon")
    # HYCOM labels are float32 renderings of a documented 0.08° grid — normalize to 2 decimals and record the correction.
    lat, lon = [round(x, 2) for x in raw_lat], [round(x, 2) for x in raw_lon]
    corrections = {"lat": max(abs(a - b) for a, b in zip(raw_lat, lat)), "lon": max(abs(a - b) for a, b in zip(raw_lon, lon))}
    # NCSS writes float32-derived labels (e.g. -52.56005859375 for -52.56). The worst case seen in a
    # 16-degree box is 5.9e-5 degrees, 0.07% of the 0.08 step — still a representation artefact, not a grid shift.
    if max(corrections.values()) >= 0.0001:
        raise ValueError("coordinate normalization exceeds float representation tolerance")
    nt, ny, nx = len(all_time), len(lat), len(lon)
    u_arr, v_arr = np.array(all_u), np.array(all_v)
    wet = np.isfinite(u_arr).all(axis=0) & np.isfinite(v_arr).all(axis=0)
    land_mask = (~wet).tolist()
    def as_list(arr):
        out = []
        for plane in arr:
            out.append([[None if not math.isfinite(x) else float(x) for x in row] for row in plane.tolist()])
        return out
    grid = {"lon": lon, "lat": lat, "timeUTC": all_time, "u": as_list(u_arr), "v": as_list(v_arr), "landMask": land_mask}
    meta.update({"cadenceSeconds": cadence, "corrections": corrections, "shape": [nt, ny, nx],
                 "maskedNodes": int((~wet).sum()), "uRange": [float(np.nanmin(u_arr)), float(np.nanmax(u_arr))],
                 "vRange": [float(np.nanmin(v_arr)), float(np.nanmax(v_arr))], "netCDF4Version": netCDF4.__version__})
    return grid, sources, (raw_lat, raw_lon), meta


def build_dataset(dataset_id, version, parts, depth_m, citation_area, fixture_issued_at=None):
    grid, sources, (raw_lat, raw_lon), meta = read_hycom_parts(parts, depth_m)
    issued = fixture_issued_at or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    if "Distribution unlimited" not in meta["distribution_statement"]:
        raise ValueError("distribution statement not found in source; refusing to mark redistributable")
    manifest = {
        "datasetId": dataset_id, "version": version, "evidenceKind": "REANALYSIS",
        "provider": "Naval Research Laboratory / Naval Oceanographic Office via HYCOM.org",
        "sourceURI": "https://www.hycom.org/dataserver/gofs-3pt1/reanalysis",
        "sourceSha256": digest(sources),
        "sourceSha256Scope": "SHA-256 of canonical JSON ordered original-subset metadata list (acquisition sources)",
        "citation": f"GOFS 3.1 HYCOM + NCODA global reanalysis GLBv0.08 expt_53.X (2015), {depth_m} m current subset {citation_area}, {grid['timeUTC'][0]} to {grid['timeUTC'][-1]}; acquired via HYCOM.org NCSS.",
        "license": "DoD Distribution A; approved for public release, distribution unlimited (source file distribution_statement).",
        "licenseURI": "https://www.hycom.org/dataserver/access-methods/thredds", "redistributionAllowed": True,
        "issuedAtUTC": issued, "issuedAtMeaning": "normalized-fixture-creation; not original model publication",
        "sourceIssuedAtUTC": None, "sourceIssuedAtStatus": "UNKNOWN: source subset exposes valid time and NCSS translation time only",
        "collectedAtUTC": max(s["ncssTranslationTimeUTC"] for s in sources),
        "validTimeStartUTC": grid["timeUTC"][0], "validTimeEndUTC": grid["timeUTC"][-1],
        "gridType": "regular-latlon-a-grid", "crs": "EPSG:4326", "calendar": "gregorian",
        "velocityUnits": "m/s", "uDirection": "eastward", "vDirection": "northward", "surfaceDepthMeters": depth_m,
        "spatialResolutionDegrees": {"lat": 0.08, "lon": 0.08}, "timeStepSeconds": meta["cadenceSeconds"],
        "sha256": digest(grid), "hashScope": "canonical-grid-json", "readerVersion": "earthus-json-grid/1",
        "netcdfReaderVersion": READER,
        "landMaskVersion": f"HYCOM-wet-validity-mask/53X-{dataset_id}",
        "landMaskMeaning": f"{meta['maskedNodes']} of {meta['shape'][1] * meta['shape'][2]} nodes are masked in at least one frame and are landMask=true with u/v=null. Wet-validity only; no independent coastline geometry.",
        "observationValidation": "NOT_PERFORMED",
        "supportedUse": "Offshore drifter-comparison forcing at drogue depth; no operational forecast or coastal validation.",
        "processingHistory": [
            {"operation": "NCSS subset", "sourceFiles": sources, "maximumHoursPerRequest": 21, "variables": ["water_u", "water_v"], "depthMeters": depth_m, "horizStride": 1},
            {"operation": "netCDF4 mask-and-scale decode; remove singleton depth; concatenate original frames", "netCDF4Version": meta["netCDF4Version"],
             "fillPolicy": "masked nodes become null and landMask=true; never zero", "regridding": False},
            {"operation": "Normalize documented 0.08 degree coordinate labels to two decimals; retain source values and original files",
             "rawLatitude": raw_lat, "rawLongitude": raw_lon, "maxAbsoluteCoordinateCorrectionDegrees": meta["corrections"], "vectorValuesInterpolated": False},
            {"operation": "Record provider wet-validity mask", "independentCoastlineValidated": False},
        ],
    }
    return validate_dataset({"manifest": manifest, "grid": grid}), sources, meta

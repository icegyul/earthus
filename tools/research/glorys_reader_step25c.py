"""STEP 25C — GLORYS12V1 daily-mean NetCDF (Copernicus Marine subset, STEP 25B) -> EARTHUS JSON grid contract.

Isolated reader: lives in tools/research, is never imported by the frozen research runtime, and only *uses* the frozen
validate_dataset/digest (read-only import) so the produced dataset satisfies exactly the same contract as the HYCOM inputs.
Provider-specific on purpose (mirrors netcdf_reader.py for HYCOM): checks CF names/units/calendar, single depth level equal to
the locked 15.81007 m native level, regular 1/12 degree grid, strictly daily 86400 s time axis with no gaps.
Masked nodes (land / below bottom) become landMask=true and u/v=None — never zero. Time labels are taken exactly as stored in
the source file (daily means labelled 00:00Z); no re-labelling, no shifting, no vertical or temporal interpolation.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402
from research_runtime.datasets import digest, validate_dataset  # noqa: E402  (frozen runtime, read-only use)

READER = "earthus-glorys-netcdf/1"
GRID_DEG = 1.0 / 12.0
LABEL_TOLERANCE = 1e-4  # float32 coordinate labels of the documented 1/12 degree grid (worst case ~2e-5 deg)


def read_glorys(path, expected_depth_m, depth_tolerance=1e-4):
    path = Path(path)
    with netCDF4.Dataset(path) as data:
        depths = [float(x) for x in np.array(data["depth"][:]).ravel()]
        if len(depths) != 1 or abs(depths[0] - expected_depth_m) > depth_tolerance:
            raise ValueError(f"{path.name}: depth {depths} != locked native level {expected_depth_m} m")
        t = data["time"]
        calendar = getattr(t, "calendar", "standard")
        if calendar not in ("gregorian", "standard", "proleptic_gregorian"):
            raise ValueError("unsupported calendar")
        for var, std in (("uo", "eastward_sea_water_velocity"), ("vo", "northward_sea_water_velocity")):
            if getattr(data[var], "standard_name", None) != std:
                raise ValueError(f"unexpected {var} standard_name")
            if getattr(data[var], "units", "").replace(" ", "") not in ("ms-1", "m/s"):
                raise ValueError(f"{var} units must be m s-1")
        raw_lat = [float(x) for x in np.array(data["latitude"][:], dtype=np.float64)]
        raw_lon = [float(x) for x in np.array(data["longitude"][:], dtype=np.float64)]
        times = [datetime(v.year, v.month, v.day, v.hour, v.minute, v.second, tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                 for v in netCDF4.num2date(t[:], t.units, calendar=calendar)]
        u, v = data["uo"][:, 0], data["vo"][:, 0]
        um, vm = np.ma.getmaskarray(u), np.ma.getmaskarray(v)
        uf, vf = np.ma.filled(u.astype(np.float64), np.nan), np.ma.filled(v.astype(np.float64), np.nan)
        uf[um] = np.nan; vf[vm] = np.nan
        attrs = {k: str(getattr(data, k)) for k in ("title", "source", "institution", "references", "Conventions") if k in data.ncattrs()}
        meta = {"originalTimeUnits": t.units, "originalCalendar": calendar, "uScaleFactor": float(getattr(data["uo"], "scale_factor", 1.0)),
                "vScaleFactor": float(getattr(data["vo"], "scale_factor", 1.0)), "uDtype": str(data["uo"].dtype), "attributes": attrs, "depthLevelMeters": depths[0]}
    seconds = [datetime.fromisoformat(x.replace("Z", "+00:00")).timestamp() for x in times]
    if len(times) < 2 or any(b - a != 86400 for a, b in zip(seconds, seconds[1:])):
        raise ValueError("time axis is not strictly daily (86400 s) without gaps; gaps are never interpolated")
    lat = [round(x * 12) / 12 for x in raw_lat]; lon = [round(x * 12) / 12 for x in raw_lon]
    corrections = {"lat": max(abs(a - b) for a, b in zip(raw_lat, lat)), "lon": max(abs(a - b) for a, b in zip(raw_lon, lon))}
    if max(corrections.values()) >= LABEL_TOLERANCE:
        raise ValueError("coordinate normalization exceeds float representation tolerance; grid is not the documented 1/12 degree grid")
    if any(b - a <= 0 for a, b in zip(lat, lat[1:])) or any(b - a <= 0 for a, b in zip(lon, lon[1:])):
        raise ValueError("axes must be strictly increasing")
    wet = np.isfinite(uf).all(axis=0) & np.isfinite(vf).all(axis=0)
    land_mask = (~wet).tolist()

    def as_list(arr):
        return [[[None if not math.isfinite(x) else float(x) for x in row] for row in plane.tolist()] for plane in arr]
    grid = {"lon": lon, "lat": lat, "timeUTC": times, "u": as_list(uf), "v": as_list(vf), "landMask": land_mask}
    source = {"path": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
              "validTimeStartUTC": times[0], "validTimeEndUTC": times[-1], **meta}
    meta.update({"corrections": corrections, "shape": [len(times), len(lat), len(lon)], "maskedNodes": int((~wet).sum()),
                 "uRange": [float(np.nanmin(uf)), float(np.nanmax(uf))], "vRange": [float(np.nanmin(vf)), float(np.nanmax(vf))],
                 "netCDF4Version": netCDF4.__version__, "numpyVersion": np.__version__})
    return grid, source, (raw_lat, raw_lon), meta


def build_dataset(dataset_id, version, path, depth_m, window_id, request, issued_at=None):
    grid, source, (raw_lat, raw_lon), meta = read_glorys(path, depth_m)
    issued = issued_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "datasetId": dataset_id, "version": version, "evidenceKind": "REANALYSIS",
        "provider": "Mercator Ocean International via Copernicus Marine Service (GLOBAL_MULTIYEAR_PHY_001_030)",
        "sourceURI": "https://doi.org/10.48670/moi-00021", "productId": "GLOBAL_MULTIYEAR_PHY_001_030", "cmemsDatasetId": "cmems_mod_glo_phy_my_0.083deg_P1D-m",
        "sourceSha256": source["sha256"], "sourceSha256Scope": "SHA-256 of the original Copernicus Marine subset NetCDF file (STEP 25B manifest)",
        "citation": f"Global Ocean Physics Reanalysis GLORYS12V1 (GLOBAL_MULTIYEAR_PHY_001_030, cmems_mod_glo_phy_my_0.083deg_P1D-m), daily mean uo/vo at the {depth_m} m native level, window {window_id}, {grid['timeUTC'][0]} to {grid['timeUTC'][-1]}; E.U. Copernicus Marine Service Information, DOI 10.48670/moi-00021.",
        "license": "Copernicus Marine Service licence (registered access; attribution required). Raw files are not redistributed by this repository.",
        "licenseURI": "https://marine.copernicus.eu/user-corner/service-commitments-and-licence", "redistributionAllowed": False,
        "issuedAtUTC": issued, "issuedAtMeaning": "normalized-fixture-creation; not original product publication",
        "collectedAtUTC": request["requestedAtUTC"], "validTimeStartUTC": grid["timeUTC"][0], "validTimeEndUTC": grid["timeUTC"][-1],
        "gridType": "regular-latlon-a-grid", "crs": "EPSG:4326", "calendar": "gregorian",
        "velocityUnits": "m/s", "uDirection": "eastward", "vDirection": "northward", "surfaceDepthMeters": depth_m,
        "depthMeaning": "single native GLORYS level nearest 15 m (15.81007 m as stored); no vertical interpolation, no depth search",
        "spatialResolutionDegrees": {"lat": GRID_DEG, "lon": GRID_DEG}, "timeStepSeconds": 86400,
        "timeMeaning": "daily mean fields carrying the source time label (00:00Z) exactly as stored; linear interpolation between existing bracketing daily frames only",
        "sha256": digest(grid), "hashScope": "canonical-grid-json", "readerVersion": "earthus-json-grid/1", "netcdfReaderVersion": READER,
        "landMaskVersion": f"GLORYS12V1-wet-validity-mask/{dataset_id}",
        "landMaskMeaning": f"{meta['maskedNodes']} of {meta['shape'][1] * meta['shape'][2]} nodes are masked in at least one frame and are landMask=true with u/v=null. Wet-validity only; no independent coastline geometry.",
        "observationValidation": "NOT_PERFORMED",
        "supportedUse": "TEST-02 forcing sensitivity (STEP 25A) at drogue depth; no operational forecast or coastal validation.",
        "processingHistory": [
            {"operation": "Copernicus Marine toolbox subset (STEP 25B, authorized access)", "sourceFile": source, "request": request, "variables": ["uo", "vo"], "depthMeters": depth_m},
            {"operation": "netCDF4 mask-and-scale decode; remove singleton depth; frames in stored order", "netCDF4Version": meta["netCDF4Version"], "numpyVersion": meta["numpyVersion"],
             "fillPolicy": "masked nodes become null and landMask=true; never zero", "regridding": False, "temporalInterpolation": False, "verticalInterpolation": False},
            {"operation": "Normalize documented 1/12 degree coordinate labels to k/12; retain source values and original files",
             "rawLatitude": raw_lat, "rawLongitude": raw_lon, "maxAbsoluteCoordinateCorrectionDegrees": meta["corrections"], "vectorValuesInterpolated": False},
            {"operation": "Record provider wet-validity mask", "independentCoastlineValidated": False},
        ],
    }
    return validate_dataset({"manifest": manifest, "grid": grid}), source, meta

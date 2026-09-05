"""Normalize the four saved public HYCOM NCSS subsets without fetching data.

Run from the repository with research-runtime and its dependencies on PYTHONPATH.
This is a fixture-specific conversion, not a general NetCDF upload reader.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

import netCDF4
import numpy as np
from research_runtime.datasets import canonical_bytes, digest, validate_dataset

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUTPUT = ROOT / "services/research-runtime/examples/hycom-2015-atlantic.dataset.json"
BASE = "https://ncss.hycom.org/thredds/ncss/GLBv0.08/expt_53.X/data/2015"
PARTS = [
    ("current-20150105T12.nc", "2015-01-05T12", "2015-01-06T09"),
    ("current-20150106T12.nc", "2015-01-06T12", "2015-01-07T09"),
    ("current-20150107T12.nc", "2015-01-07T12", "2015-01-08T09"),
    ("current-20150108T12.nc", "2015-01-08T12", "2015-01-08T12"),
]


def main():
    sources, all_time, all_u, all_v = [], [], [], []
    raw_lat = raw_lon = None
    for name, start, end in PARTS:
        source = HERE / name
        uri = (f"{BASE}?var=water_u&var=water_v&north=30&south=28&west=-60&east=-58"
               f"&horizStride=1&time_start={start}%3A00%3A00Z&time_end={end}%3A00%3A00Z"
               "&timeStride=1&vertCoord=0&addLatLon=true&accept=netcdf")
        with netCDF4.Dataset(source) as data:
            assert data["depth"][:].tolist() == [0.0], "This conversion only supports the acquired 0m fixture."
            assert data["time"].calendar == "gregorian"
            assert data["water_u"].standard_name == "eastward_sea_water_velocity"
            assert data["water_v"].standard_name == "northward_sea_water_velocity"
            assert data["water_u"].units == data["water_v"].units == "m/s"
            assert data.distribution_statement == "Approved for public release. Distribution unlimited."
            lat, lon = data["lat"][:].tolist(), data["lon"][:].tolist()
            if raw_lat is None:
                raw_lat, raw_lon = lat, lon
            assert lat == raw_lat and lon == raw_lon, "No implicit regridding between source parts."
            times = [time.strftime("%Y-%m-%dT%H:%M:%SZ") for time in netCDF4.num2date(
                data["time"][:], data["time"].units, calendar=data["time"].calendar)]
            u, v = data["water_u"][:, 0], data["water_v"][:, 0]
            # netCDF4 decodes source scale_factor and missing values before conversion.
            # All nodes in this deliberately offshore fixture must be finite/wet.
            assert not np.any(np.ma.getmaskarray(u)) and not np.any(np.ma.getmaskarray(v))
            assert np.all(np.isfinite(u)) and np.all(np.isfinite(v))
            all_time.extend(times)
            all_u.extend(u.astype(float).tolist())
            all_v.extend(v.astype(float).tolist())
            translated = re.search(r"Translation Date = ([^\s]+)", data.History).group(1)
            sources.append({"path": name, "sourceURI": uri, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                            "bytes": source.stat().st_size, "validTimeStartUTC": times[0], "validTimeEndUTC": times[-1],
                            "ncssTranslationTimeUTC": translated, "originalTimeUnits": data["time"].units,
                            "originalConventions": data.Conventions, "originalFieldType": data.field_type,
                            "uScaleFactor": float(data["water_u"].scale_factor),
                            "vScaleFactor": float(data["water_v"].scale_factor)})
    assert len(all_time) == 25 and len(set(all_time)) == 25
    seconds = [datetime.fromisoformat(time.replace("Z", "+00:00")).timestamp() for time in all_time]
    assert all(b - a == 10800 for a, b in zip(seconds, seconds[1:])), "Missing or duplicate source frame."
    lat, lon = [round(v, 2) for v in raw_lat], [round(v, 2) for v in raw_lon]
    corrections = {"lat": max(abs(a - b) for a, b in zip(raw_lat, lat)),
                   "lon": max(abs(a - b) for a, b in zip(raw_lon, lon))}
    assert max(corrections.values()) < 0.00004, "Coordinate normalization exceeds float representation tolerance."
    grid = {"lon": lon, "lat": lat, "timeUTC": all_time, "u": all_u, "v": all_v,
            "landMask": [[False for _ in lon] for _ in lat]}
    acquisition_file = HERE / "acquisition.json"
    if acquisition_file.exists():
        acquisition = json.loads(acquisition_file.read_text(encoding="utf-8"))
        assert acquisition["sources"] == sources, "Original files changed; register a new fixture version."
    else:
        acquisition = {"fixtureIssuedAtUTC": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                       "sources": sources, "sourceBundleSha256": digest(sources)}
        acquisition_file.write_text(json.dumps(acquisition, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "datasetId": "hycom-gofs31-53x-atlantic-20150105", "version": "2015-01-05T12_2015-01-08T12.earthus1",
        "evidenceKind": "REANALYSIS", "provider": "Naval Research Laboratory / Naval Oceanographic Office via HYCOM.org",
        "sourceURI": "https://www.hycom.org/dataserver/gofs-3pt1/reanalysis",
        "sourceSha256": acquisition["sourceBundleSha256"],
        "sourceSha256Scope": "SHA-256 of canonical JSON ordered original-subset metadata list in acquisition.json sources",
        "citation": "GOFS 3.1 HYCOM + NCODA global reanalysis GLBv0.08 expt_53.X (2015), 0 m current subset 28-30 N / 60-58 W, 2015-01-05 12Z to 2015-01-08 12Z; acquired 2026-09-04 UTC via HYCOM.org.",
        "license": "DoD Distribution A; approved for public release, distribution unlimited (source file distribution_statement).",
        "licenseURI": "https://www.hycom.org/dataserver/access-methods/thredds",
        "redistributionAllowed": True,
        "issuedAtUTC": acquisition["fixtureIssuedAtUTC"], "issuedAtMeaning": "normalized-fixture-creation; not original model publication",
        "sourceIssuedAtUTC": None, "sourceIssuedAtStatus": "UNKNOWN: source subset exposes valid time and NCSS translation time only",
        "collectedAtUTC": max(item["ncssTranslationTimeUTC"] for item in sources),
        "validTimeStartUTC": all_time[0], "validTimeEndUTC": all_time[-1],
        "gridType": "regular-latlon-a-grid", "crs": "EPSG:4326", "calendar": "gregorian",
        "velocityUnits": "m/s", "uDirection": "eastward", "vDirection": "northward", "surfaceDepthMeters": 0,
        "spatialResolutionDegrees": {"lat": 0.08, "lon": 0.08}, "timeStepSeconds": 10800,
        "sha256": digest(grid), "hashScope": "canonical-grid-json", "readerVersion": "earthus-json-grid/1",
        "landMaskVersion": "HYCOM-wet-validity-mask/53X-2015-atlantic-earthus1",
        "landMaskMeaning": "All 676 nodes have finite u/v in all 25 original frames. Wet-validity only; no independent coastline geometry.",
        "observationValidation": "NOT_PERFORMED", "supportedUse": "Offshore software integration and numerical convergence case; no operational forecast or coast validation.",
        "processingHistory": [
            {"operation": "NCSS subset", "sourceFiles": sources, "maximumHoursPerRequest": 21,
             "variables": ["water_u", "water_v"], "depthMeters": 0, "horizStride": 1},
            {"operation": "netCDF4 mask-and-scale decode; remove singleton depth; concatenate 25 original frames", "netCDF4Version": netCDF4.__version__,
             "fillPolicy": "Assert no missing values in this offshore fixture; never replace a missing value with zero", "regridding": False},
            {"operation": "Normalize documented 0.08 degree coordinate labels to two decimals; retain source values and original files",
             "rawLatitude": raw_lat, "rawLongitude": raw_lon, "maxAbsoluteCoordinateCorrectionDegrees": corrections,
             "vectorValuesInterpolated": False},
            {"operation": "Record provider wet-validity mask", "independentCoastlineValidated": False},
        ],
    }
    dataset = validate_dataset({"manifest": manifest, "grid": grid})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(canonical_bytes(dataset) + b"\n")
    report = {"dataset": str(OUTPUT.relative_to(ROOT)), "gridSha256": manifest["sha256"],
              "shape": [len(all_time), len(lat), len(lon)], "sourceBytes": sum(item["bytes"] for item in sources),
              "timeStepSeconds": 10800, "uRangeMps": [float(np.min(all_u)), float(np.max(all_u))],
              "vRangeMps": [float(np.min(all_v)), float(np.max(all_v))],
              "maxAbsoluteCoordinateCorrectionDegrees": corrections, "readerValidation": "PASSED", "observationValidation": "NOT_PERFORMED"}
    (HERE / "normalization-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

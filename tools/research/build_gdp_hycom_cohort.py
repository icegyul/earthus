"""PR-08 cohort: drogued GDP drifters vs HYCOM 15 m advection, January 2015, two regions.

Reads only the saved files under docs/research/fixtures/gdp-hycom-cohort-201501 (no network),
normalizes the HYCOM parts with the HYCOM NetCDF reader, packages the observations, runs the
fixed model once per region, and writes comparison reports. The pre-registered plan
(validation-plan.json) was written before any run; this script does not read the plan's
criteria to change anything — the verdict is computed afterwards by verdict_gdp_hycom_cohort.py.

Run from services/research-runtime with `.deps` on PYTHONPATH.
"""
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

from research_runtime.datasets import canonical_bytes, digest, validate_dataset
from research_runtime.models import preflight, run_experiment
from research_runtime.netcdf_reader import build_dataset
from research_runtime.validation import compare, validate_observations

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "docs/research/fixtures/gdp-hycom-cohort-201501"
OUT = ROOT / "services/research-runtime/examples"
EVID = ROOT / "docs/research/evidence/gdp-hycom-cohort-201501"
BASE = "https://ncss.hycom.org/thredds/ncss/GLBv0.08/expt_53.X/data/2015"
PARTS = [("current-20150105T12.nc", "2015-01-05T12", "2015-01-06T09"), ("current-20150106T12.nc", "2015-01-06T12", "2015-01-07T09"),
         ("current-20150107T12.nc", "2015-01-07T12", "2015-01-08T09"), ("current-20150108T12.nc", "2015-01-08T12", "2015-01-08T12")]
REGIONS = {
    "a": {"name": "tropical-north-atlantic", "north": 25, "south": 13, "west": -53, "east": -37},
    "b": {"name": "subtropical-north-atlantic", "north": 37, "south": 25, "west": -45, "east": -29},
}
START, END = "2015-01-05T12:00:00Z", "2015-01-08T12:00:00Z"
TRACKS_URI = ("https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_hourly_qc.csv?ID%2Ctime%2Clatitude%2Clongitude%2Cve%2Cvn%2Cgap%2Cdrogue_lost_date%2Ctypebuoy"
              "&ID=~%22(21 cohort IDs)%22&time%3E%3D2015-01-05T12%3A00%3A00Z&time%3C%3D2015-01-08T12%3A00%3A00Z")
INDEPENDENCE = ("HYCOM GOFS 3.1 reanalysis (NCODA) assimilates satellite altimetry, satellite/in-situ SST and in-situ T/S profiles; "
                "drifter positions and velocities are not assimilated (provider description, hycom.org/dataserver/gofs-3pt1/reanalysis). "
                "Provider assertion recorded; not independently certified.")


def uri(region, start, end):
    r = REGIONS[region]
    return (f"{BASE}?var=water_u&var=water_v&north={r['north']}&south={r['south']}&west={r['west']}&east={r['east']}"
            f"&horizStride=1&time_start={start}%3A00%3A00Z&time_end={end}%3A00%3A00Z&timeStride=1&vertCoord=15&addLatLon=true&accept=netcdf")


def load_tracks():
    source = (FIX / "tracks.csv").read_bytes()
    rows = list(csv.DictReader(source.decode("utf-8").splitlines()))
    assert rows[0]["time"] == "UTC"
    by_id = {}
    for row in rows[1:]:
        by_id.setdefault(row["ID"], []).append(row)
    return source, by_id


def inside(region, lat, lon):
    r = REGIONS[region]
    return r["south"] <= lat <= r["north"] and r["west"] <= lon <= r["east"]


def build_region(region, source, by_id, issued):
    parts = [(FIX / f"region-{region}" / name, uri(region, s, e)) for name, s, e in PARTS]
    dataset_id = f"hycom-gofs31-53x-{REGIONS[region]['name']}-20150105-15m"
    r = REGIONS[region]
    dataset, sources, meta = build_dataset(dataset_id, "2015-01-05T12_2015-01-08T12.earthus1", parts, 15,
                                           f"{r['south']}-{r['north']} N / {-r['west']}-{-r['east']} W", issued)
    (OUT / f"{dataset_id}.dataset.json").write_bytes(canonical_bytes(dataset) + b"\n")
    (FIX / f"region-{region}" / "acquisition.json").write_text(json.dumps({"fixtureIssuedAtUTC": issued, "sources": sources, "sourceBundleSha256": digest(sources), "reader": meta}, indent=2) + "\n", encoding="utf-8")
    # cohort members: drifters whose first sample lies in the region
    tracks, points = [], []
    for drifter_id, rows in sorted(by_id.items()):
        first = rows[0]
        lat, lon = float(first["latitude"]), float(first["longitude"])
        if first["time"] != START or not inside(region, lat, lon):
            continue
        samples = [{"timeUTC": row["time"], "lon": float(row["longitude"]), "lat": float(row["latitude"]),
                    "uMps": float(row["ve"]), "vMps": float(row["vn"]), "sourceGapSeconds": float(row["gap"])} for row in rows]
        lost = first["drogue_lost_date"].strip() or None
        tracks.append({"particleId": len(points), "trackId": f"GDP-{drifter_id}", "qualityControl": "PASSED",
                       "drogueStatus": "ATTACHED", "drogueLostAtUTC": lost, "depthMeters": 15, "nominalDrogueDepthMeters": 15,
                       "depthMeaning": "SVP drogue centred at 15 m (NOAA GDP); compared with HYCOM 15 m level",
                       "buoyType": first["typebuoy"], "independenceStatus": "INDEPENDENT", "independenceEvidence": INDEPENDENCE,
                       "samples": samples})
        points.append({"lon": lon, "lat": lat})
    obs_manifest = {
        "datasetId": f"noaa-gdp-hourly-qc-cohort-201501-region-{region}", "version": "v2.01-subset-earthus1",
        "evidenceKind": "OBSERVATION", "provider": "NOAA AOML Global Drifter Program", "sourceURI": TRACKS_URI,
        "sourceFile": "../tracks.csv", "sourceSha256": hashlib.sha256(source).hexdigest(),
        "qualityControl": "PROVIDER_QC", "qualityControlURI": "https://www.aoml.noaa.gov/phod/gdp/hourly_data.php",
        "citation": "Elipot, S.; Sykulski, A.; Lumpkin, R.; Centurioni, L.; Pazos, M. (2022). Hourly location, current velocity, and temperature collected from Global Drifter Program drifters world-wide. NOAA NCEI. doi:10.25921/x46c-3620. Cohort subset 2015-01-05 12Z to 2015-01-08 12Z; accessed 2026-09-05 UTC.",
        "license": "Creative Commons Attribution 4.0; NOAA GDP ERDDAP license attribute",
        "licenseURI": "https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_hourly_qc/index.html",
        "redistributionAllowed": True, "hashScope": "canonical-observation-tracks-json", "sha256": digest(tracks),
        "validTimeStartUTC": START, "validTimeEndUTC": END,
        "intendedUse": "Pre-registered drogued-drifter comparison cohort (validation-plan.json); drogue attached through the window by provider drogue_lost_date",
        "processingHistory": ["Removed ERDDAP units row; parsed numeric coordinates/velocities; kept every original hourly record",
                              "Cohort membership: first sample at window start inside the region; drogue_lost_date empty or after window end"],
    }
    observations = {"manifest": obs_manifest, "tracks": tracks}
    validate_observations(observations, source)
    obs_path = FIX / f"region-{region}" / "observations.json"
    obs_path.write_text(json.dumps(observations, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    spec = {"schemaVersion": "1.0", "projectId": "gdp-hycom-cohort-201501", "modelId": "surface-passive-advection.v1", "modelVersion": "0.1.0",
            "question": "Do drogued SVP drifters follow HYCOM 15 m reanalysis currents over 72 hours?",
            "datasetVersions": [{"datasetId": dataset_id, "version": dataset["manifest"]["version"]}],
            "area": {"west": r["west"], "east": r["east"], "south": r["south"], "north": r["north"]},
            "startTimeUTC": START, "durationSeconds": 259200, "releaseDefinition": {"type": "points", "points": points},
            "particleCount": len(points), "integrationMethod": "RK4", "integrationStepSeconds": 300, "outputStepSeconds": 3600,
            "boundaryPolicy": "STOP_AT_FIRST_CROSSING", "metrics": ["statusCounts", "displacementMeters"], "backend": "oceanparcels"}
    (OUT / f"{dataset_id}.experiment.json").write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    check = preflight(spec, dataset)
    assert check["ok"], check["errors"]
    t0 = time.perf_counter()
    result = run_experiment(spec, dataset)
    wall = time.perf_counter() - t0
    (OUT / f"{dataset_id}.result.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    report = compare(result, observations, source)
    EVID.mkdir(parents=True, exist_ok=True)
    (EVID / f"comparison-region-{region}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return {"region": region, "datasetId": dataset_id, "gridShape": meta["shape"], "maskedNodes": meta["maskedNodes"],
            "tracks": len(tracks), "eligible": report["eligibleTracks"], "excluded": report["excludedTracks"],
            "unavailable": len(report["unavailableHorizons"]), "qualityStatus": result["qualityStatus"], "wallSeconds": round(wall, 1),
            "summary": report["summary"], "resultArraySha256": result["provenance"]["resultArraySha256"], "datasetSha256": dataset["manifest"]["sha256"]}


def main():
    issued = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    source, by_id = load_tracks()
    out = [build_region(region, source, by_id, issued) for region in ("a", "b")]
    (EVID / "build-summary.json").write_text(json.dumps({"builtAtUTC": issued, "regions": out}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

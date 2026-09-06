"""Deterministic validator for STEP 17 Phase B forcing acquisition. exit 0 = PASS, exit 1 = FAIL.
Reads the manifest, the LOCKED protocol/preregistration, the cohort file and the acquired files' bytes (hash only)
plus the normalized JSON grids for coverage/finite/bounds/stencil checks. No model, no trajectory."""
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/research/step17-forcing-manifest.json"
PROTO_SHA = "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792"
PREREG_SHA = "b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378"
COHORT_SHA = "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"
DATA = ROOT / "data/research/step17"
SECRET_PATTERNS = (r"password", r"passwd", r"api[_-]?key", r"token=", r"authorization", r"Basic [A-Za-z0-9+/=]{8,}", r"copernicusmarine.*login")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def main():
    sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
    from research_runtime.datasets import RegularGrid, ForcingBoundary, utc_seconds, validate_dataset
    from research_runtime.wind import WindField, validate_wind_dataset
    import numpy as np
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    check(sha(ROOT / "docs/research/step17-forcing-protocol.md") == PROTO_SHA == m["protocolSha256"], "1 protocol SHA")
    check(sha(ROOT / "docs/research/step17-preregistration.json") == PREREG_SHA == m["preregistrationSha256"], "1 preregistration SHA")
    check(sha(ROOT / "docs/research/cohort-step16.json") == COHORT_SHA == m["cohortSha256"], "1 cohort SHA")
    for key in ("ruleId", "runUnits", "glorys", "primaryStatus", "aggregateForcingSha256", "modelRun", "trajectoryComputed"):
        check(key in m, f"1 manifest schema: {key}")
    check(m["modelRun"] is False and m["trajectoryComputed"] is False, "no model / trajectory")
    check(m["glorys"]["status"] in ("BLOCKED/PENDING", "ACQUIRED") and "reason" in m["glorys"], "GLORYS status recorded")
    cohort = json.loads((ROOT / "docs/research/cohort-step16.json").read_text(encoding="utf-8"))
    expected_units = {f"{rid}-{w['order']}": (w["start"], w["end"], sorted(w["newDrifterIds"])) for rid in cohort["selectedRegions"] for w in cohort["selectedWindowDetails"][rid]}
    check({u["windowId"]: (u["t0"], u["end"], sorted(u["drifterIds"])) for u in m["runUnits"]} == expected_units, "4 run units identical to STEP 16 (no add/remove)")
    check(sum(u["drifterCount"] for u in m["runUnits"]) == 23, "23 drifters")
    all_files = []
    text = MANIFEST.read_text(encoding="utf-8")
    check(not any(re.search(p, text, re.I) for p in SECRET_PATTERNS), "15 no secret leakage in manifest")
    for u in m["runUnits"]:
        wid = u["windowId"]
        t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        box = u["oceanDomain"]
        check(-40 <= box["south"] < box["north"] <= 40, f"{wid} latitude domain within [-40, 40]")
        # box = cohort t0 bbox ± 2.0 (clipped)
        pts = [(d["startLon"], d["startLat"]) for w in cohort["selectedWindowDetails"][u["region"]] if f"{u['region']}-{w['order']}" == wid for d in w["drifters"] if d["drifterId"] in u["drifterIds"]]
        lo, la = [p[0] for p in pts], [p[1] for p in pts]
        check(abs(box["west"] - (min(lo) - 2)) < 1e-9 and abs(box["east"] - (max(lo) + 2)) < 1e-9 and abs(box["south"] - max(-40, min(la) - 2)) < 1e-9 and abs(box["north"] - min(40, max(la) + 2)) < 1e-9, f"{wid} ocean buffer ±2.0°")
        wb = u["windDomain"]
        check(abs(wb["west"] - (box["west"] - 3)) < 1e-9 and abs(wb["east"] - (box["east"] + 3)) < 1e-9 and abs(wb["south"] - max(-90, box["south"] - 3)) < 1e-9 and abs(wb["north"] - min(90, box["north"] + 3)) < 1e-9, f"{wid} wind buffer ±3.0°")
        for f in u["hycom"]["files"] + u["ncep"]["files"]:
            path = DATA / wid / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]
            check(path.exists() and "sha256" in f and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"], f"{wid} file {f['filename']} exists/SHA/bytes")
            check(f.get("httpStatus") == 200 and "query" in f, f"{wid} file {f['filename']} status/query")
            if "sha256" in f:
                all_files.append({"filename": f["filename"], "sha256": f["sha256"], "bytes": f["bytes"]})
        check(u["forcingSha256"] == hashlib.sha256(canonical(sorted([{"filename": f["filename"], "sha256": f["sha256"], "bytes": f["bytes"]} for f in u["hycom"]["files"] + u["ncep"]["files"] if "sha256" in f], key=lambda x: x["filename"]))).hexdigest(), f"{wid} forcingSha256 deterministic")
        if u["status"] == "FORCING_ACQUISITION_PASS":
            hq, wq = u["hycom"]["qc"], u["ncep"]["qc"]
            check(hq["frames"] == 25 and hq["cadenceSeconds"] == 10800 and hq["timeStart"] == u["t0"] and hq["timeEnd"] == u["end"], f"{wid} HYCOM 25 frames × 3 h, t0..t0+72h")
            check(hq["withinPhysicalBounds"] and hq["missingRate"] < 1.0, f"{wid} HYCOM bounds/missing")
            check(all(s["wet"] for s in hq["releaseStencil"]) and len(hq["releaseStencil"]) == u["drifterCount"], f"{wid} release stencil wet")
            need_s, need_e = (t0 - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ"), (t0 + timedelta(hours=84)).strftime("%Y-%m-%dT%H:%M:%SZ")
            check(wq["cadenceSeconds"] == 21600 and wq["timeStart"] <= need_s and wq["timeEnd"] >= need_e, f"{wid} wind coverage t0-12h..t0+84h @6h")
            check(wq["withinPhysicalBounds"] and all(s["ok"] for s in wq["releaseStencil"]), f"{wid} wind bounds/stencil")
            # re-open normalized grids: variables, finite/bounds recomputed, domain coverage, reader policy flags
            hn = ROOT / u["hycom"]["normalized"]["file"]; wn = ROOT / u["ncep"]["normalized"]["file"]
            check(sha(hn) == u["hycom"]["normalized"]["fileSha256"] and sha(wn) == u["ncep"]["normalized"]["fileSha256"], f"{wid} normalized file SHA")
            ds = validate_dataset(json.loads(hn.read_text(encoding="utf-8"))); wd = validate_wind_dataset(json.loads(wn.read_text(encoding="utf-8")))
            check(ds["manifest"]["sha256"] == u["hycom"]["normalized"]["gridSha256"] and wd["manifest"]["sha256"] == u["ncep"]["normalized"]["gridSha256"], f"{wid} normalized grid SHA")
            check(ds["manifest"]["surfaceDepthMeters"] == 15 and wd["manifest"]["heightMeters"] == 10 and ds["manifest"]["velocityUnits"] == "m/s" == wd["manifest"]["velocityUnits"], f"{wid} variables/levels/units")
            g = ds["grid"]
            check(g["lon"][0] <= box["west"] + 0.081 and g["lon"][-1] >= box["east"] - 0.081 and g["lat"][0] <= box["south"] + 0.081 and g["lat"][-1] >= box["north"] - 0.081, f"{wid} HYCOM domain coverage")
            u_arr = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in g["u"]]); v_arr = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in g["v"]])
            check(np.nanmax(np.abs(u_arr)) <= 5 and np.nanmax(np.abs(v_arr)) <= 5 and abs(float(1 - (np.isfinite(u_arr) & np.isfinite(v_arr)).mean()) - hq["missingRate"]) < 1e-12, f"{wid} HYCOM finite/bounds/missing recomputed")
            hist = ds["manifest"]["processingHistory"]
            check(any(step.get("regridding") is False for step in hist) and any(step.get("vectorValuesInterpolated") is False for step in hist), f"{wid} no regridding / no value interpolation (reader policy)")
            check(ds["manifest"]["readerVersion"] == "earthus-json-grid/1" and ds["manifest"]["netcdfReaderVersion"] == "earthus-hycom-netcdf/1" and wd["manifest"]["readerVersion"] == "earthus-ncep-r2-wind/1", f"{wid} readers unchanged (versions)")
            grid = RegularGrid(ds); field = WindField(wd); ts = utc_seconds(u["t0"])
            for did, lon, lat in [(d["drifterId"], d["startLon"], d["startLat"]) for w in cohort["selectedWindowDetails"][u["region"]] if f"{u['region']}-{w['order']}" == wid for d in w["drifters"] if d["drifterId"] in u["drifterIds"]]:
                try:
                    grid.velocity(ts, lon, lat); field.velocity(ts, lon, lat)
                except ForcingBoundary as exc:
                    failures.append(f"{wid} stencil recheck {did}: {exc.status}")
            # no extrapolation: window end must be inside the forcing time axes (equal allowed)
            check(utc_seconds(u["end"]) <= utc_seconds(g["timeUTC"][-1]) and utc_seconds(u["end"]) <= utc_seconds(wd["grid"]["timeUTC"][-1]), f"{wid} no temporal extrapolation needed")
    check(m["aggregateForcingSha256"] == hashlib.sha256(canonical(sorted(all_files, key=lambda x: x["filename"]))).hexdigest(), "16 aggregate hash deterministic")
    statuses = [u["status"] for u in m["runUnits"]]
    expected = "FORCING_ACQUISITION_PASS" if all(s == "FORCING_ACQUISITION_PASS" for s in statuses) else ("FORCING_PARTIAL" if any(s == "FORCING_ACQUISITION_PASS" for s in statuses) else "FORCING_BLOCKED")
    check(m["primaryStatus"] == expected, "primary status arithmetic")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "primaryStatus": m["primaryStatus"], "glorys": m["glorys"]["status"], "manifestSha256": sha(MANIFEST)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

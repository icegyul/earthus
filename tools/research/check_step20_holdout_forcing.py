"""Deterministic validator for STEP 20 R1 holdout forcing (same checks as check_step17_forcing.py, applied to the holdout manifest):
product/dataset identity, 15 m / 10 m levels, 25 × 3 h ocean frames over t0..t0+72h, wind t0-12h..t0+84h @ 6 h, spatial coverage of the
ocean box, finite/bounds recomputed from the normalised grids, release stencils wet/available, no regridding, reader versions unchanged,
raw/normalised SHAs, aggregate SHA, run units identical to the STEP 20 preregistration holdout, STEP 17 files untouched, acquired after
the alpha lock. exit 0 = PASS, exit 1 = FAIL. No model, no trajectory."""
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/research/step20-holdout-forcing-manifest.json"
PREREG20 = ROOT / "docs/research/step20-preregistration.json"
DATA = ROOT / "data/research/step20/holdout/forcing"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-preregistration.json": "b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378",
        "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd"}
SECRET_PATTERNS = (r"password", r"passwd", r"api[_-]?key", r"token=", r"authorization", r"Basic [A-Za-z0-9+/=]{8,}")


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
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"0 locked file unchanged: {rel}")
    m = json.loads(MANIFEST.read_text(encoding="utf-8")); p = json.loads(PREREG20.read_text(encoding="utf-8"))
    # STEP 17 raw files untouched
    fm17 = json.loads((ROOT / "docs/research/step17-forcing-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / "data/research/step17" / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) == f["sha256"] for u in fm17["runUnits"] for f in u["hycom"]["files"] + u["ncep"]["files"]), "0 STEP 17 raw forcing untouched")
    check(m["protocolSha256"] == LOCK["docs/research/step17-forcing-protocol.md"] and m["preregistrationSha256"] == LOCK["docs/research/step17-preregistration.json"] and m["step17FilesModified"] is False, "1 STEP 17 protocol identity in manifest")
    check(m["alphaLockCommit"] == "73fafffb" and m["acquiredAfterAlphaLock"] is True and m["selectedAlphaArtifactSha256"] == LOCK["docs/research/step20-selected-alpha.json"] and m["substituteForcing"].startswith("NONE"), "1 acquired after alpha lock, no substitute")
    check(m["modelRun"] is False and m["trajectoryComputed"] is False, "1 no model / trajectory")
    check((ROOT / m["scopeFile"]).exists() and sha(ROOT / m["scopeFile"]) == m["scopeSha256"], "1 scope file recorded")
    hold = {u["windowId"]: u for u in p["holdout"]["runUnits"]}
    check({u["windowId"]: (u["t0"], u["end"], sorted(u["drifterIds"])) for u in m["runUnits"]} == {k: (v["t0"], v["end"], sorted(v["drifterIds"])) for k, v in hold.items()}, "2 run units identical to STEP 20 holdout (no add/remove)")
    check(sum(u["drifterCount"] for u in m["runUnits"]) == 13, "2 13 holdout drifters")
    text = MANIFEST.read_text(encoding="utf-8")
    check(not any(re.search(pat, text, re.I) for pat in SECRET_PATTERNS), "15 no secret leakage")
    all_files = []
    for u in m["runUnits"]:
        wid = u["windowId"]; t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); box = u["oceanDomain"]; wb = u["windDomain"]
        pts = [(d["lon"], d["lat"]) for d in hold[wid]["releasePositions"]]
        lo, la = [x[0] for x in pts], [x[1] for x in pts]
        check(-40 <= box["south"] < box["north"] <= 40, f"{wid} latitude domain within [-40, 40]")
        check(abs(box["west"] - (min(lo) - 2)) < 1e-9 and abs(box["east"] - (max(lo) + 2)) < 1e-9 and abs(box["south"] - max(-40, min(la) - 2)) < 1e-9 and abs(box["north"] - min(40, max(la) + 2)) < 1e-9, f"{wid} ocean buffer ±2.0° (STEP 17)")
        check(abs(wb["west"] - (box["west"] - 3)) < 1e-9 and abs(wb["east"] - (box["east"] + 3)) < 1e-9 and abs(wb["south"] - max(-90, box["south"] - 3)) < 1e-9 and abs(wb["north"] - min(90, box["north"] + 3)) < 1e-9, f"{wid} wind buffer ±3.0°")
        for f in u["hycom"]["files"] + u["ncep"]["files"]:
            path = DATA / wid / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]
            check(path.exists() and "sha256" in f and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"] and f.get("httpStatus") == 200, f"{wid} file {f['filename']} exists/SHA/bytes/200")
            check("expt_53.X" in f["query"] if f["product"].startswith("water") else "ncep.reanalysis2" in f["query"], f"{wid} product identity {f['filename']}")
            check(("vertCoord=15" in f["query"]) if f["product"].startswith("water") else (f["levelMeters"] == 10), f"{wid} level {f['filename']}")
            if "sha256" in f:
                all_files.append({"filename": f["filename"], "sha256": f["sha256"], "bytes": f["bytes"]})
        check(u["forcingSha256"] == hashlib.sha256(canonical(sorted([{"filename": f["filename"], "sha256": f["sha256"], "bytes": f["bytes"]} for f in u["hycom"]["files"] + u["ncep"]["files"] if "sha256" in f], key=lambda x: x["filename"]))).hexdigest(), f"{wid} forcingSha256 deterministic")
        check(u["status"] == "FORCING_ACQUISITION_PASS", f"{wid} status FORCING_ACQUISITION_PASS ({u['status']}: {u['statusReasons']})")
        if u["status"] != "FORCING_ACQUISITION_PASS":
            continue
        hq, wq = u["hycom"]["qc"], u["ncep"]["qc"]
        check(hq["frames"] == 25 and hq["cadenceSeconds"] == 10800 and hq["timeStart"] == u["t0"] and hq["timeEnd"] == u["end"], f"{wid} HYCOM 25 frames × 3 h, t0..t0+72h, no gap")
        check(hq["withinPhysicalBounds"] and hq["missingRate"] < 1.0 and all(s["wet"] for s in hq["releaseStencil"]) and len(hq["releaseStencil"]) == u["drifterCount"], f"{wid} HYCOM bounds / release stencil wet")
        need_s, need_e = (t0 - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ"), (t0 + timedelta(hours=84)).strftime("%Y-%m-%dT%H:%M:%SZ")
        check(wq["cadenceSeconds"] == 21600 and wq["timeStart"] <= need_s and wq["timeEnd"] >= need_e and wq["missingRate"] == 0.0 and wq["withinPhysicalBounds"] and all(s["ok"] for s in wq["releaseStencil"]), f"{wid} wind coverage/gaps/bounds/stencil")
        hn = ROOT / u["hycom"]["normalized"]["file"]; wn = ROOT / u["ncep"]["normalized"]["file"]
        check(sha(hn) == u["hycom"]["normalized"]["fileSha256"] and sha(wn) == u["ncep"]["normalized"]["fileSha256"], f"{wid} normalized file SHA")
        ds = validate_dataset(json.loads(hn.read_text(encoding="utf-8"))); wd = validate_wind_dataset(json.loads(wn.read_text(encoding="utf-8")))
        check(ds["manifest"]["sha256"] == u["hycom"]["normalized"]["gridSha256"] and wd["manifest"]["sha256"] == u["ncep"]["normalized"]["gridSha256"], f"{wid} normalized grid SHA")
        check(ds["manifest"]["surfaceDepthMeters"] == 15 and wd["manifest"]["heightMeters"] == 10 and ds["manifest"]["velocityUnits"] == "m/s" == wd["manifest"]["velocityUnits"], f"{wid} variables/levels/units")
        g = ds["grid"]
        check(g["lon"][0] <= box["west"] + 0.081 and g["lon"][-1] >= box["east"] - 0.081 and g["lat"][0] <= box["south"] + 0.081 and g["lat"][-1] >= box["north"] - 0.081, f"{wid} HYCOM spatial coverage of the ocean box")
        times = [utc_seconds(t) for t in g["timeUTC"]]
        check(all(b - a == 10800 for a, b in zip(times, times[1:])), f"{wid} HYCOM timestamps evenly 3 h (missing timestamp = 0)")
        u_arr = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in g["u"]]); v_arr = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in g["v"]])
        check(np.nanmax(np.abs(u_arr)) <= 5 and np.nanmax(np.abs(v_arr)) <= 5 and abs(float(1 - (np.isfinite(u_arr) & np.isfinite(v_arr)).mean()) - hq["missingRate"]) < 1e-12, f"{wid} HYCOM finite/bounds/missing recomputed")
        hist = ds["manifest"]["processingHistory"]
        check(any(step.get("regridding") is False for step in hist) and any(step.get("vectorValuesInterpolated") is False for step in hist), f"{wid} no regridding / no value interpolation")
        check(ds["manifest"]["readerVersion"] == "earthus-json-grid/1" and ds["manifest"]["netcdfReaderVersion"] == "earthus-hycom-netcdf/1" and wd["manifest"]["readerVersion"] == "earthus-ncep-r2-wind/1", f"{wid} readers unchanged")
        wt = [utc_seconds(t) for t in wd["grid"]["timeUTC"]]
        check(all(b - a == 21600 for a, b in zip(wt, wt[1:])), f"{wid} wind timestamps evenly 6 h")
        grid = RegularGrid(ds); field = WindField(wd); ts = utc_seconds(u["t0"])
        for d in hold[wid]["releasePositions"]:
            try:
                grid.velocity(ts, d["lon"], d["lat"]); field.velocity(ts, d["lon"], d["lat"])
            except ForcingBoundary as exc:
                failures.append(f"{wid} stencil recheck {d['drifterId']}: {exc.status}")
        check(utc_seconds(u["end"]) <= times[-1] and utc_seconds(u["end"]) <= wt[-1], f"{wid} no temporal extrapolation needed")
    check(m["aggregateForcingSha256"] == hashlib.sha256(canonical(sorted(all_files, key=lambda x: x["filename"]))).hexdigest(), "16 aggregate hash deterministic")
    check(m["primaryStatus"] == ("FORCING_ACQUISITION_PASS" if all(u["status"] == "FORCING_ACQUISITION_PASS" for u in m["runUnits"]) else "FORCING_BLOCKED"), "primary status arithmetic")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "primaryStatus": m["primaryStatus"], "manifestSha256": sha(MANIFEST)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

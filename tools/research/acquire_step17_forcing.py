"""STEP 17 Phase B — acquire PRIMARY forcing (HYCOM 15 m 3 h, NCEP-R2 10 m 6 h) for the four LOCKED run units and run QC.

Reads: LOCKED protocol/preregistration (SHA-checked) and cohort-step16.json (run units, t0 positions) — nothing else.
Writes: originals under data/research/step17/<window>/ (gitignored), normalized JSON under data/research/step17/normalized/,
        docs/research/step17-forcing-manifest.json. No model, no trajectory. GLORYS: BLOCKED/PENDING without credentials
        (no download attempted, no substitute). Readers are used unchanged; any reader limitation is recorded as FORCING_BLOCKED.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step17-forcing-protocol.md"
PREREG = ROOT / "docs/research/step17-preregistration.json"
COHORT = ROOT / "docs/research/cohort-step16.json"
DATA = ROOT / "data/research/step17"
MANIFEST = ROOT / "docs/research/step17-forcing-manifest.json"
PROTO_SHA = "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792"
PREREG_SHA = "b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378"
COHORT_SHA = "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"
HYCOM = "https://ncss.hycom.org/thredds/ncss/GLBv0.08/expt_53.X/data/{year}"
PSL = "https://psl.noaa.gov/thredds/ncss/grid/Datasets/ncep.reanalysis2/gaussian_grid/{var}.10m.gauss.{year}.nc"
ISSUED = "2026-09-06T05:00:00Z"  # fixed so normalized grid hashes are deterministic


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def fetch(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return {"httpStatus": 200, "retrievedAtUTC": None, "reused": True}
    req = urllib.request.Request(url, headers={"User-Agent": "EARTHUS-research/step17"})
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            data = resp.read()
            status = resp.status
    except urllib.error.HTTPError as err:
        return {"httpStatus": err.code, "retrievedAtUTC": now(), "error": str(err)[:200]}
    except Exception as err:  # network failure is a STOP condition, recorded not worked around
        return {"httpStatus": None, "retrievedAtUTC": now(), "error": type(err).__name__ + ": " + str(err)[:200]}
    if status != 200:
        return {"httpStatus": status, "retrievedAtUTC": now(), "error": "non-200"}
    path.write_bytes(data)
    return {"httpStatus": 200, "retrievedAtUTC": now()}


def run_units():
    cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    units = []
    for rid in cohort["selectedRegions"]:
        for w in cohort["selectedWindowDetails"][rid]:
            ids = set(w["newDrifterIds"])
            pts = [(d["drifterId"], d["startLon"], d["startLat"]) for d in w["drifters"] if d["drifterId"] in ids]
            lo, la = [p[1] for p in pts], [p[2] for p in pts]
            box = {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0}
            wind = {"south": max(-90.0, box["south"] - 3.0), "north": min(90.0, box["north"] + 3.0), "west": box["west"] - 3.0, "east": box["east"] + 3.0}
            t0 = datetime.strptime(w["start"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            units.append({"windowId": f"{rid}-{w['order']}", "region": rid, "t0": t0, "start": w["start"], "end": w["end"], "drifters": pts, "oceanBox": box, "windBox": wind})
    return units


def hycom_parts(unit):
    t0 = unit["t0"]
    edges = [(0, 21), (24, 45), (48, 69), (72, 72)]
    parts = []
    for a, b in edges:
        s, e = t0 + timedelta(hours=a), t0 + timedelta(hours=b)
        name = f"current-{s.strftime('%Y%m%dT%H')}.nc"
        b_ = unit["oceanBox"]
        url = (f"{HYCOM.format(year=s.year)}?var=water_u&var=water_v&north={b_['north']:.3f}&south={b_['south']:.3f}&west={b_['west']:.3f}&east={b_['east']:.3f}"
               f"&horizStride=1&time_start={s.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&time_end={e.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&timeStride=1&vertCoord=15&addLatLon=true&accept=netcdf")
        parts.append((name, url))
    return parts


def wind_parts(unit):
    t0 = unit["t0"]
    s, e = t0 - timedelta(hours=12), t0 + timedelta(hours=84)
    b = unit["windBox"]
    west = b["west"] % 360 if b["west"] < 0 else b["west"]
    east = b["east"] % 360 if b["east"] < 0 else b["east"]
    parts = []
    for var in ("uwnd", "vwnd"):
        years = sorted({s.year, e.year})
        for year in years:
            ys, ye = max(s, datetime(year, 1, 1, tzinfo=timezone.utc)), min(e, datetime(year, 12, 31, 18, tzinfo=timezone.utc))
            name = f"{var}.10m.gauss.{ys.strftime('%Y%m%dT%H')}-{ye.strftime('%Y%m%dT%H')}.nc"
            url = (f"{PSL.format(var=var, year=year)}?var={var}&north={b['north']:.3f}&south={b['south']:.3f}&west={west:.3f}&east={east:.3f}"
                   f"&time_start={ys.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&time_end={ye.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&accept=netcdf")
            parts.append((var, name, url))
    return parts


def main():
    if sha(PROTO) != PROTO_SHA or sha(PREREG) != PREREG_SHA or sha(COHORT) != COHORT_SHA:
        raise SystemExit("PHASE_B_BLOCKED_IMMUTABILITY")
    prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    if prereg["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("PHASE_B_BLOCKED_IMMUTABILITY: not locked")
    import sys
    sys.path.insert(0, str(ROOT / "services/research-runtime"))
    sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
    from research_runtime.datasets import RegularGrid, ForcingBoundary, utc_seconds, digest
    from research_runtime.netcdf_reader import build_dataset
    from research_runtime.wind import build_ncep_r2_wind_dataset, WindField, write_wind_dataset
    import netCDF4
    import numpy as np
    units = run_units()
    manifest = {"schemaVersion": "1.0", "createdAtUTC": now(), "ruleId": prereg["ruleId"], "protocolSha256": PROTO_SHA, "preregistrationSha256": PREREG_SHA, "cohortSha256": COHORT_SHA,
                "lockCommit": "551668ef", "normalizedIssuedAtUTC": ISSUED, "glorys": {"status": "BLOCKED/PENDING", "reason": "Copernicus Marine credentials not provided in this environment; no download attempted; no substitute forcing (protocol §3/§4)"},
                "runUnits": []}
    for unit in units:
        rec = {"windowId": unit["windowId"], "region": unit["region"], "t0": unit["start"], "end": unit["end"], "drifterCount": len(unit["drifters"]), "drifterIds": [d[0] for d in unit["drifters"]],
               "oceanDomain": unit["oceanBox"], "windDomain": unit["windBox"], "hycom": {"files": []}, "ncep": {"files": []}, "status": None, "statusReasons": []}
        folder = DATA / unit["windowId"]
        # ---- HYCOM ----
        parts = []
        for name, url in hycom_parts(unit):
            path = folder / "hycom" / name
            r = fetch(url, path)
            entry = {"dataset": "HYCOM GOFS 3.1 GLBv0.08 expt_53.X reanalysis", "product": "water_u/water_v", "depthMeters": 15, "temporalResolution": "3 h", "spatialResolution": "0.08°",
                     "filename": name, "query": url, **r}
            if path.exists():
                entry.update({"bytes": path.stat().st_size, "sha256": sha(path)})
                parts.append((path, url))
            rec["hycom"]["files"].append(entry)
        if len(parts) != 4:
            rec["status"] = "FORCING_BLOCKED"; rec["statusReasons"].append("HYCOM part(s) not retrievable")
        else:
            try:
                dataset, sources, meta = build_dataset(f"hycom-gofs31-53x-{unit['windowId'].lower()}-15m", f"{unit['start'][:13]}_{unit['end'][:13]}.earthus1", parts, 15,
                                                       f"{unit['oceanBox']['south']:.2f}..{unit['oceanBox']['north']:.2f} / {unit['oceanBox']['west']:.2f}..{unit['oceanBox']['east']:.2f}", ISSUED)
                nt, ny, nx = meta["shape"]
                u = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in dataset["grid"]["u"]])
                v = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in dataset["grid"]["v"]])
                finite = np.isfinite(u) & np.isfinite(v)
                qc = {"frames": nt, "expectedFrames": 25, "cadenceSeconds": meta["cadenceSeconds"], "shape": meta["shape"], "maskedNodes": meta["maskedNodes"],
                      "missingRate": float(1 - finite.mean()), "uRange": meta["uRange"], "vRange": meta["vRange"],
                      "withinPhysicalBounds": bool(abs(np.nanmin(u)) <= 5 and abs(np.nanmax(u)) <= 5 and abs(np.nanmin(v)) <= 5 and abs(np.nanmax(v)) <= 5),
                      "timeStart": dataset["grid"]["timeUTC"][0], "timeEnd": dataset["grid"]["timeUTC"][-1]}
                if nt != 25 or meta["cadenceSeconds"] != 10800 or dataset["grid"]["timeUTC"][0] != unit["start"] or dataset["grid"]["timeUTC"][-1] != unit["end"]:
                    rec["statusReasons"].append("HYCOM frame count/cadence/coverage differs from 25 × 3 h over t0..t0+72h")
                if not qc["withinPhysicalBounds"]:
                    rec["statusReasons"].append("HYCOM u/v outside [-5, 5] m/s")
                grid = RegularGrid(dataset)
                t0s = utc_seconds(unit["start"])
                stencil = []
                for did, lon, lat in unit["drifters"]:
                    try:
                        grid.velocity(t0s, lon, lat); stencil.append({"drifterId": did, "wet": True})
                    except ForcingBoundary as exc:
                        stencil.append({"drifterId": did, "wet": False, "status": exc.status})
                qc["releaseStencil"] = stencil
                if any(not s["wet"] for s in stencil):
                    rec["statusReasons"].append("release stencil not fully wet: " + ",".join(s["drifterId"] for s in stencil if not s["wet"]))
                out = DATA / "normalized" / f"{unit['windowId']}.hycom15m.dataset.json"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(digest_bytes := canonical(dataset) + b"\n")
                rec["hycom"].update({"qc": qc, "normalized": {"file": str(out.relative_to(ROOT)).replace("\\", "/"), "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"],
                                                                "fileSha256": hashlib.sha256(digest_bytes).hexdigest(), "readerVersion": dataset["manifest"]["netcdfReaderVersion"], "processingHistory": dataset["manifest"]["processingHistory"][1:]}})
            except Exception as exc:
                rec["status"] = "FORCING_BLOCKED"; rec["statusReasons"].append("HYCOM reader/validation: " + type(exc).__name__ + ": " + str(exc)[:300])
        # ---- NCEP wind ----
        wparts = {}
        for var, name, url in wind_parts(unit):
            path = folder / "ncep" / name
            r = fetch(url, path)
            entry = {"dataset": "NCEP-DOE Reanalysis 2 gaussian_grid", "product": var + ".10m", "levelMeters": 10, "temporalResolution": "6 h", "spatialResolution": "T62 Gaussian ≈1.9°",
                     "filename": name, "query": url, **r}
            if path.exists():
                entry.update({"bytes": path.stat().st_size, "sha256": sha(path)})
                wparts.setdefault(var, []).append((path, url))
            rec["ncep"]["files"].append(entry)
        if len(wparts.get("uwnd", [])) != 1 or len(wparts.get("vwnd", [])) != 1:
            rec["status"] = "FORCING_BLOCKED"; rec["statusReasons"].append("NCEP wind part(s) not retrievable or split across years (unsupported by protocol)")
        else:
            try:
                (up, uu), (vp, vu) = wparts["uwnd"][0], wparts["vwnd"][0]
                wind, acq = build_ncep_r2_wind_dataset(up, vp, uu, vu, f"ncep-doe-r2-10m-wind-{unit['windowId'].lower()}", f"{unit['start'][:13]}.earthus1", ISSUED)
                times = wind["grid"]["timeUTC"]
                need_start, need_end = (unit["t0"] - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ"), (unit["t0"] + timedelta(hours=84)).strftime("%Y-%m-%dT%H:%M:%SZ")
                wu = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in wind["grid"]["u"]])
                wv = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in wind["grid"]["v"]])
                wqc = {"frames": len(times), "expectedFrames": 17, "cadenceSeconds": wind["manifest"]["timeStepSeconds"], "timeStart": times[0], "timeEnd": times[-1],
                       "missingRate": float(1 - (np.isfinite(wu) & np.isfinite(wv)).mean()), "uRange": [float(np.nanmin(wu)), float(np.nanmax(wu))], "vRange": [float(np.nanmin(wv)), float(np.nanmax(wv))],
                       "withinPhysicalBounds": bool(np.nanmax(np.abs(wu)) <= 120 and np.nanmax(np.abs(wv)) <= 120)}
                if times[0] > need_start or times[-1] < need_end or wind["manifest"]["timeStepSeconds"] != 21600:
                    rec["statusReasons"].append("NCEP wind does not cover t0-12h..t0+84h at 6 h")
                field = WindField(wind)
                wstencil = []
                for did, lon, lat in unit["drifters"]:
                    try:
                        field.velocity(utc_seconds(unit["start"]), lon, lat); wstencil.append({"drifterId": did, "ok": True})
                    except ForcingBoundary as exc:
                        wstencil.append({"drifterId": did, "ok": False, "reason": getattr(exc, "reason", exc.status)})
                wqc["releaseStencil"] = wstencil
                if any(not s["ok"] for s in wstencil):
                    rec["statusReasons"].append("wind stencil unavailable at release: " + ",".join(s["drifterId"] for s in wstencil if not s["ok"]))
                wout = write_wind_dataset(wind, DATA / "normalized" / f"{unit['windowId']}.ncep10m.wind.json")
                rec["ncep"].update({"qc": wqc, "normalized": {"file": str(wout.relative_to(ROOT)).replace("\\", "/"), "gridSha256": wind["manifest"]["sha256"], "sourceSha256": wind["manifest"]["sourceSha256"],
                                                             "fileSha256": sha(wout), "readerVersion": wind["manifest"]["readerVersion"]}})
            except Exception as exc:
                rec["status"] = "FORCING_BLOCKED"; rec["statusReasons"].append("NCEP reader/validation: " + type(exc).__name__ + ": " + str(exc)[:300])
        if rec["status"] is None:
            rec["status"] = "FORCING_BLOCKED" if rec["statusReasons"] else "FORCING_ACQUISITION_PASS"
        files = [{"filename": f["filename"], "sha256": f["sha256"], "bytes": f["bytes"]} for f in rec["hycom"]["files"] + rec["ncep"]["files"] if "sha256" in f]
        rec["forcingSha256"] = hashlib.sha256(canonical(sorted(files, key=lambda x: x["filename"]))).hexdigest()
        manifest["runUnits"].append(rec)
        print(json.dumps({"window": unit["windowId"], "status": rec["status"], "reasons": rec["statusReasons"], "hycomFrames": rec["hycom"].get("qc", {}).get("frames"), "ncepFrames": rec["ncep"].get("qc", {}).get("frames")}), flush=True)
    statuses = [r["status"] for r in manifest["runUnits"]]
    manifest["primaryStatus"] = "FORCING_ACQUISITION_PASS" if all(s == "FORCING_ACQUISITION_PASS" for s in statuses) else ("FORCING_PARTIAL" if any(s == "FORCING_ACQUISITION_PASS" for s in statuses) else "FORCING_BLOCKED")
    all_files = [{"filename": f["filename"], "sha256": f["sha256"], "bytes": f["bytes"]} for r in manifest["runUnits"] for f in r["hycom"]["files"] + r["ncep"]["files"] if "sha256" in f]
    manifest["aggregateForcingSha256"] = hashlib.sha256(canonical(sorted(all_files, key=lambda x: x["filename"]))).hexdigest()
    manifest["modelRun"] = False; manifest["trajectoryComputed"] = False; manifest["secretsRecorded"] = False
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"primaryStatus": manifest["primaryStatus"], "glorys": manifest["glorys"]["status"], "aggregateForcingSha256": manifest["aggregateForcingSha256"]}), flush=True)


if __name__ == "__main__":
    main()

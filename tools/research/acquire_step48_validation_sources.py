"""STEP 48 - preregistered source acquisition for the LOCKED STEP 47 validation-extension cohort (acquisition only; no daily field,
no composite, no trajectory, no metric, no endpoint). Per locked window: HYCOM GOFS 3.1 GLBv0.08 expt_53.X 15 m 3-hourly via the STEP 17
NCSS mechanism in the two frozen layouts (four-part t0..t0+72h = 25 frames for condition A; six UTC-day files 00..21Z = the 48 registered
frames, the material required to reproduce HYCOM_DAILY), NCEP-DOE R2 10 m 6 h (STEP 17 wind_parts), GLORYS12V1 uo/vo at 15.81 m via the
official Copernicus Marine toolbox in the STEP 25B isolated venv (credentials by exit code only), and the WW3 GLOB-30M CFSR uss monthly
files for every month the windows touch (IFREMER anonymous FTP; own fetch, no shared log).
Geometry preparation: the STEP 47 manifest omits release positions and ocean boxes by design, so the per-window box is recomputed with the
identical frozen STEP 16 evaluate() on the 6 locked windows, restricted to the LOCKED new-unique drifter IDs; the recomputed ID set must
equal the locked set exactly or the acquisition stops. No cohort modification is possible.
Originals are never rewritten (fetch refuses to overwrite). Longitude rule (STEP 37 field 20): the reader axis must cover the window box in
the box's own -180..180 convention, otherwise the window is COORDINATE_BLOCKED with no transform. No performance, trajectory or evaluation
file is opened (guarded). Writes data/research/step48/ (gitignored) and docs/research/step48-validation-source-acquisition-manifest.json."""
import builtins
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
FORBIDDEN = ("trajector", "result.json", "evaluation", "paired-table", "-summary", "run-manifest", "replay-manifest", "step30", "step29-stokes-", "step25c-", "distance", "error_", "bootstrap")
_open = builtins.open
access = {"forbiddenInputAccess": 0}


def guarded_open(file, *a, **k):
    name = str(file).replace("\\", "/").lower()
    if any(t in name for t in FORBIDDEN) and "step48" not in name:
        access["forbiddenInputAccess"] += 1
        raise SystemExit(f"FORBIDDEN INPUT ACCESS: {file}")
    return _open(file, *a, **k)


builtins.open = guarded_open
sys.path.insert(0, str(ROOT / "tools/research"))
sys.path.insert(0, str(ROOT / "services/research-runtime"))
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import acquire_step17_forcing as a17  # noqa: E402
import glorys_reader_step25c as greader  # noqa: E402
import select_step16_cohort as s16  # noqa: E402
from research_runtime.netcdf_reader import build_dataset, read_hycom_parts  # noqa: E402
from research_runtime.wind import build_ncep_r2_wind_dataset  # noqa: E402

PROTO, M47, P46 = D / "step48-validation-source-acquisition-protocol.json", D / "step47-validation-extension-cohort-manifest.json", D / "step46-validation-extension-preregistration-protocol.json"
DATA = ROOT / "data/research/step48"
MANIFEST = D / "step48-validation-source-acquisition-manifest.json"
VENV = ROOT / "data/research/step25b/toolbox-venv"
FTP = "ftp://ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL"
FMT = "%Y-%m-%dT%H:%M:%SZ"
DATASET_ID, DEPTH = "cmems_mod_glo_phy_my_0.083deg_P1D-m", 15.81
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
M47_SHA = "32d3085010185d8c1a5734ef53be227252220b74a2526dbadf5c72de5eee2cca"
P46_SHA = "c824b053fdeea20336f1396dc503232492ab77e1f9d5f032586b23c47d66862d"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def now():
    return datetime.now(timezone.utc).strftime(FMT)


def ts(s):
    return datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def fetch(url, path, timeout=2400):
    """Download once. An existing file is reused and never rewritten."""
    if path.exists() and path.stat().st_size > 0:
        return {"status": "reused", "sha256": sha(path), "bytes": path.stat().st_size, "retrievedAtUTC": None}
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r, _open(tmp, "wb") as fh:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                fh.write(chunk)
        tmp.replace(path)
        return {"status": "ok", "sha256": sha(path), "bytes": path.stat().st_size, "retrievedAtUTC": now()}
    except Exception as exc:
        if tmp.exists():
            tmp.unlink()
        return {"status": "failed", "error": type(exc).__name__ + ": " + str(exc)[:200], "retrievedAtUTC": now()}


def nc_meta(path):
    from netCDF4 import Dataset
    with Dataset(path) as ds:
        return {"variables": sorted(ds.variables.keys()), "dimensions": {k: len(v) for k, v in ds.dimensions.items()}}


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    proto = load(PROTO); m47 = load(M47)
    # ---------- integrity gate ----------
    if sha(M47) != M47_SHA or sha(P46) != P46_SHA:
        raise SystemExit("VALIDATION_SOURCE_INVALID: STEP 46/47 identity")
    if m47["status"] != "VALIDATION_EXTENSION_COHORT_LOCKED":
        raise SystemExit("VALIDATION_SOURCE_BLOCKED: cohort not locked")
    raw_files = sorted(s16.RAW.glob("*-*-q*.csv"))
    obs_sha = hashlib.sha256(canonical([{"filename": f.name, "sha256": s16.sha(f), "bytes": f.stat().st_size} for f in raw_files])).hexdigest()
    if obs_sha != OBS_SHA or s16.sha(s16.COAST) != COAST_SHA:
        raise SystemExit("VALIDATION_SOURCE_INVALID: frozen observation or coastline identity")
    manifest = {"schemaVersion": "1.0", "ruleId": "validation-extension-preregistration-step46", "step": 48,
                "classification": "VALIDATION_EXTENSION_SOURCE_ACQUISITION", "protocolSha256": sha(PROTO),
                "step47ManifestSha256": sha(M47), "step47DerivationHash": m47["derivationHash"], "step46ProtocolSha256": sha(P46),
                "observationAggregateSha256": obs_sha, "coastlineSha256": s16.sha(s16.COAST),
                "reused": {t: sha(ROOT / t) for t in ("tools/research/acquire_step17_forcing.py", "tools/research/glorys_reader_step25c.py", "tools/research/select_step16_cohort.py")},
                "normalizedIssuedAtUTC": a17.ISSUED, "startedAtUTC": now(), "sources": proto["sources"],
                "geometry": [], "windows": [], "ww3": {"files": []}, "glorysAccess": {}, "credentialsInManifest": False,
                "scientificProcessing": False, "trajectoryComputed": False, "endpointCalculated": False, "performanceDataRead": False, "cohortModified": False}
    # ---------- geometry preparation from the frozen evaluation ----------
    cohort16 = load(D / "cohort-step16.json"); coast = s16.Coast(s16.COAST)
    tracks, caches, units = {}, {}, []
    for w in m47["selectedWindows"]:
        r = w["region"]
        if r not in tracks:
            tracks[r] = s16.load_region(r)[0]; caches[r] = {}
        eligible, _ = s16.evaluate(cohort16["regionResults"][r]["box"], tracks[r], int(ts(w["start"]).timestamp()), coast, caches[r])
        if len(eligible) != w["eligibleCount"] or sorted(e["drifterId"] for e in eligible) != w["eligibleDrifterIds"]:
            raise SystemExit(f"VALIDATION_SOURCE_INVALID: eligibility differs from the locked cohort at {w['windowId']}")
        chosen = sorted([e for e in eligible if e["drifterId"] in set(w["newUniqueDrifterIds"])], key=lambda e: e["drifterId"])
        if [e["drifterId"] for e in chosen] != w["newUniqueDrifterIds"]:
            raise SystemExit(f"VALIDATION_SOURCE_INVALID: locked new-ID set not reproduced at {w['windowId']}")
        la = [e["startLat"] for e in chosen]; lo = [e["startLon"] for e in chosen]
        box = {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0}
        wind = {"south": max(-90.0, box["south"] - 3.0), "north": min(90.0, box["north"] + 3.0), "west": box["west"] - 3.0, "east": box["east"] + 3.0}
        units.append({"windowId": w["windowId"], "region": r, "t0": ts(w["start"]), "start": w["start"], "end": w["end"], "requiredUtcDays": w["requiredUtcDays"],
                      "requiredFrameCount": w["requiredFrameCount"], "drifters": [(e["drifterId"], e["startLon"], e["startLat"]) for e in chosen], "oceanBox": box, "windBox": wind})
        manifest["geometry"].append({"windowId": w["windowId"], "region": r, "drifterIds": [e["drifterId"] for e in chosen], "oceanBox": box, "windBox": wind,
                                     "releasePositions": [{"drifterId": e["drifterId"], "lon": e["startLon"], "lat": e["startLat"]} for e in chosen],
                                     "lockedNewIdSetReproduced": True})
    # ---------- WW3 monthly files ----------
    for ym in proto["acquisition"]["ww3"]["months"]:
        fname = f"WW3-GLOB-30M_{ym}_uss.nc"; url = f"{FTP}/{ym[:4]}_CFSR/uss/{fname}"
        path = DATA / "DATA-06" / f"{ym[:4]}_CFSR" / fname
        r = fetch(url, path)
        rec = {"month": ym, "filename": fname, "url": url, "relativePath": str(path.relative_to(ROOT)).replace("\\", "/"), **r}
        if r["status"] in ("ok", "reused"):
            try:
                rec["netcdf"] = nc_meta(path)
            except Exception as exc:
                rec["status"] = "failed"; rec["error"] = f"unreadable: {exc}"
        manifest["ww3"]["files"].append(rec)
        print(json.dumps({"ww3": fname, "status": rec["status"], "bytes": rec.get("bytes")}), flush=True)
    # ---------- GLORYS credential check (exit code only) ----------
    py = VENV / "Scripts" / "copernicusmarine.exe"
    ok = py.exists() and subprocess.run([str(py), "login", "--check-credentials-valid"], capture_output=True).returncode == 0
    manifest["glorysAccess"] = {"toolboxPresent": py.exists(), "method": "copernicusmarine login --check-credentials-valid (exit code only)",
                                "credentialsValid": bool(ok), "credentialsEntered": False, "credentialsStored": False, "contentsRead": False}
    # ---------- per-window acquisition ----------
    norm = DATA / "forcing" / "normalized"; norm.mkdir(parents=True, exist_ok=True)
    for unit in units:
        wid = unit["windowId"]; box = unit["oceanBox"]; t0 = unit["t0"]
        rec = {"windowId": wid, "region": unit["region"], "t0": unit["start"], "end": unit["end"], "drifterIds": [d[0] for d in unit["drifters"]],
               "oceanBox": box, "windBox": unit["windBox"], "registeredFrames": unit["requiredFrameCount"], "requiredUtcDays": unit["requiredUtcDays"],
               "hycomWindowParts": [], "hycomDayParts": [], "ncep": [], "glorys": {}, "reasons": []}
        folder = DATA / "forcing" / wid
        # A: four-part 25-frame layout
        parts = []
        for name, url in a17.hycom_parts(unit):
            path = folder / "hycom" / name; r = fetch(url, path)
            e = {"filename": name, "query": url, "requestParameters": {"dataset": "GLBv0.08/expt_53.X", "year": unit["start"][:4], "var": ["water_u", "water_v"], "vertCoord": 15, "horizStride": 1, "timeStride": 1, "box": box},
                 "relativePath": str(path.relative_to(ROOT)).replace("\\", "/"), **r}
            if r["status"] in ("ok", "reused"):
                try:
                    e["netcdf"] = nc_meta(path)
                except Exception:
                    pass
                parts.append((path, url))          # read_hycom_parts expects (path, sourceURI) pairs
            rec["hycomWindowParts"].append(e)
            print(json.dumps({"window": wid, "hycom": name, "status": r["status"]}), flush=True)
        if len(parts) == 4:
            try:
                grid_full, sources, (rlat, rlon), meta = read_hycom_parts(parts, 15)
                lon0, lon1, lat0, lat1 = grid_full["lon"][0], grid_full["lon"][-1], grid_full["lat"][0], grid_full["lat"][-1]
                conv = "-180..180" if lon0 < 0 or lon1 <= 180 else "0..360"     # STEP 38 rule, verbatim
                covers = lon0 - 0.081 <= box["west"] and box["east"] <= lon1 + 0.081 and lat0 - 0.081 <= box["south"] and box["north"] <= lat1 + 0.081
                values = meta["shape"][0] * meta["shape"][1] * meta["shape"][2] * 2
                rec["hycomCoverage"] = {"frames": meta["shape"][0], "shape": meta["shape"], "valuesCount": values, "cadenceSeconds": meta["cadenceSeconds"],
                                        "readerLonRange": [lon0, lon1], "readerLatRange": [lat0, lat1], "boxConvention": "-180..180", "readerConvention": conv,
                                        "timeStart": grid_full["timeUTC"][0], "timeEnd": grid_full["timeUTC"][-1],
                                        "coversBoxInOwnConvention": bool(covers), "convention": "-180..180", "transformApplied": False}
                if not covers or conv != "-180..180":
                    rec["status"] = "COORDINATE_BLOCKED"; rec["reasons"].append("longitude convention mismatch or box not covered (registered rule: STOP, no transform)")
                elif meta["shape"][0] != 25 or meta["cadenceSeconds"] != 10800 or grid_full["timeUTC"][0] != unit["start"] or grid_full["timeUTC"][-1] != unit["end"]:
                    rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append(f"HYCOM window parts differ from 25 x 3 h over t0..t0+72h (frames {meta['shape'][0]}, cadence {meta['cadenceSeconds']})")
                elif values > 2_000_000:
                    rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append(f"native grid exceeds the runtime JSON contract ({values} values > 2000000); STEP 20 B-3 chunking required")
                else:
                    ds, _, _ = build_dataset(f"hycom-15m-{wid.lower()}", "step48-1", parts, 15, f"HYCOM GOFS 3.1 GLBv0.08 expt_53.X 15 m; {wid}", a17.ISSUED)
                    p = norm / f"{wid}.hycom15m.dataset.json"; p.write_bytes(canonical(ds) + b"\n")
                    rec["hycomDataset"] = {"relativePath": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": sha(p), "bytes": p.stat().st_size, "class": "DERIVED_PREPARATION"}
            except Exception as exc:
                rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append(f"HYCOM read failed: {type(exc).__name__}: {str(exc)[:160]}")
        else:
            rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append("one or more HYCOM window parts not retrievable")
        # B source: six UTC-day files
        for day in unit["requiredUtcDays"]:
            s = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            name = f"day-{day}.nc"
            url = (f"https://ncss.hycom.org/thredds/ncss/GLBv0.08/expt_53.X/data/{s.year}?var=water_u&var=water_v"
                   f"&north={box['north']:.3f}&south={box['south']:.3f}&west={box['west']:.3f}&east={box['east']:.3f}"
                   f"&horizStride=1&time_start={day}T00%3A00%3A00Z&time_end={day}T21%3A00%3A00Z&timeStride=1&vertCoord=15&addLatLon=true&accept=netcdf")
            path = folder / "hycom-days" / name; r = fetch(url, path)
            e = {"utcDay": day, "filename": name, "query": url, "relativePath": str(path.relative_to(ROOT)).replace("\\", "/"), **r}
            if r["status"] in ("ok", "reused"):
                try:
                    e["netcdf"] = nc_meta(path); e["frames"] = e["netcdf"]["dimensions"].get("time")
                except Exception as exc:
                    e["status"] = "failed"; e["error"] = f"unreadable: {exc}"
            rec["hycomDayParts"].append(e)
            print(json.dumps({"window": wid, "day": day, "status": e["status"], "frames": e.get("frames")}), flush=True)
        got = sum(1 for e in rec["hycomDayParts"] if e["status"] in ("ok", "reused"))
        frames = sum(e.get("frames") or 0 for e in rec["hycomDayParts"] if e["status"] in ("ok", "reused"))
        rec["hycomDayCoverage"] = {"filesRequired": len(unit["requiredUtcDays"]), "filesAcquired": got, "framesAcquired": frames, "framesRegistered": unit["requiredFrameCount"], "complete": got == len(unit["requiredUtcDays"]) and frames == unit["requiredFrameCount"]}
        if not rec["hycomDayCoverage"]["complete"] and rec.get("status") is None:
            rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append(f"HYCOM day-file coverage incomplete: {got}/{len(unit['requiredUtcDays'])} files, {frames}/{unit['requiredFrameCount']} frames")
        # NCEP wind
        wparts = {}
        for var, name, url in a17.wind_parts(unit):
            path = folder / "ncep" / name; r = fetch(url, path)
            e = {"variable": var, "filename": name, "query": url, "relativePath": str(path.relative_to(ROOT)).replace("\\", "/"), **r}
            rec["ncep"].append(e)
            if r["status"] in ("ok", "reused"):
                wparts.setdefault(var, []).append((path, url))
            print(json.dumps({"window": wid, "ncep": name, "status": r["status"]}), flush=True)
        if len(wparts.get("uwnd", [])) == 1 and len(wparts.get("vwnd", [])) == 1:
            try:
                (up, uu), (vp, vu) = wparts["uwnd"][0], wparts["vwnd"][0]
                wind, _ = build_ncep_r2_wind_dataset(up, vp, uu, vu, f"ncep-doe-r2-10m-wind-{wid.lower()}", f"{unit['start'][:13]}.earthus1", a17.ISSUED)
                times = wind["grid"]["timeUTC"]
                if times[0] > (t0 - timedelta(hours=12)).strftime(FMT) or times[-1] < (t0 + timedelta(hours=84)).strftime(FMT) or wind["manifest"]["timeStepSeconds"] != 21600:
                    rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append("NCEP wind does not cover t0-12h..t0+84h at 6 h")
                p = norm / f"{wid}.ncep10m.wind.json"; p.write_bytes(canonical(wind) + b"\n")
                rec["ncepDataset"] = {"relativePath": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": sha(p), "bytes": p.stat().st_size, "frames": len(wind["grid"]["timeUTC"]), "class": "DERIVED_PREPARATION"}
            except Exception as exc:
                rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append(f"NCEP wind dataset build failed: {type(exc).__name__}: {str(exc)[:160]}")
        else:
            rec["status"] = "FORCING_BLOCKED"; rec["reasons"].append("NCEP wind part(s) not retrievable or split across years")
        # GLORYS
        if ok:
            gbox = {"south": box["south"] - 0.5, "north": box["north"] + 0.5, "west": box["west"] - 0.5, "east": box["east"] + 0.5}
            start, end = (t0 - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00"), (ts(unit["end"]) + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
            gdir = DATA / "glorys"; gdir.mkdir(parents=True, exist_ok=True)
            fname = f"{wid}.glorys12v1.uo_vo.{DEPTH:.2f}m.nc"; out = gdir / fname
            cmd = [str(py), "subset", "-i", DATASET_ID, "-v", "uo", "-v", "vo", "-x", str(gbox["west"]), "-X", str(gbox["east"]), "-y", str(gbox["south"]), "-Y", str(gbox["north"]),
                   "-t", start, "-T", end, "-z", str(DEPTH), "-Z", str(DEPTH), "-o", str(gdir), "-f", fname, "--disable-progress-bar"]
            g = {"datasetId": DATASET_ID, "requestedTime": [start, end], "requestedBox": gbox, "requestedDepthMeters": DEPTH,
                 "command": " ".join(["copernicusmarine"] + cmd[1:]), "requestedAtUTC": now()}
            if out.exists() and out.stat().st_size > 0:
                g["status"] = "reused"
            else:
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
                g["status"] = "ok" if p.returncode == 0 and out.exists() else "failed"
                if g["status"] == "failed":
                    g["error"] = (p.stderr or p.stdout or "")[-300:]
            if g["status"] in ("ok", "reused"):
                g["sha256"] = sha(out); g["bytes"] = out.stat().st_size; g["relativePath"] = str(out.relative_to(ROOT)).replace("\\", "/")
                try:
                    request = {"requestedAtUTC": g["requestedAtUTC"], "requestedTime": g["requestedTime"], "requestedBox": gbox, "requestedDepthMeters": DEPTH,
                               "command": g["command"], "toolbox": {"isolatedVenv": str(VENV.relative_to(ROOT)).replace("\\", "/")}}
                    dataset, source, meta = greader.build_dataset(f"glorys12v1-15.81m-{wid}", "step48-1", out, 15.81007, wid, request)
                    p2 = norm / f"{wid}.glorys15.81m.dataset.json"; p2.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
                    gg = dataset["grid"]
                    g["dataset"] = {"relativePath": str(p2.relative_to(ROOT)).replace("\\", "/"), "sha256": sha(p2), "bytes": p2.stat().st_size,
                                    "frames": len(gg["timeUTC"]), "latRange": [gg["lat"][0], gg["lat"][-1]], "lonRange": [gg["lon"][0], gg["lon"][-1]],
                                    "depthMeters": meta.get("depth", 15.81007), "class": "DERIVED_PREPARATION"}
                    g["coversBox"] = bool(gg["lon"][0] <= box["west"] and gg["lon"][-1] >= box["east"] and gg["lat"][0] <= box["south"] and gg["lat"][-1] >= box["north"])
                    if not g["coversBox"]:
                        rec["status"] = "COORDINATE_BLOCKED"; rec["reasons"].append("GLORYS axis does not cover the window box")
                except Exception as exc:
                    g["status"] = "failed"; g["error"] = f"reader: {type(exc).__name__}: {str(exc)[:160]}"
            if g["status"] == "failed":
                rec["status"] = "CANDIDATE_BLOCKED"; rec["reasons"].append("GLORYS subset unavailable; no substitute product, level or depth")
            rec["glorys"] = g
            print(json.dumps({"window": wid, "glorys": g["status"]}), flush=True)
        else:
            rec["glorys"] = {"status": "CREDENTIALS_REQUIRED"}; rec["status"] = "CANDIDATE_BLOCKED"; rec["reasons"].append("Copernicus credentials not valid in this environment")
        if rec.get("status") is None:
            rec["status"] = "ACQUIRED"
        manifest["windows"].append(rec)
        print(json.dumps({"window": wid, "status": rec["status"], "reasons": rec["reasons"]}), flush=True)
    ws = [w["status"] for w in manifest["windows"]]
    ww3_ok = all(f["status"] in ("ok", "reused") for f in manifest["ww3"]["files"])
    manifest["summary"] = {"windows": len(ws), "acquired": ws.count("ACQUIRED"), "blocked": sum(1 for s in ws if s != "ACQUIRED"), "ww3Files": len(manifest["ww3"]["files"]), "ww3Ok": sum(1 for f in manifest["ww3"]["files"] if f["status"] in ("ok", "reused"))}
    manifest["status"] = "VALIDATION_SOURCE_ACQUISITION_PASS" if all(s == "ACQUIRED" for s in ws) and ww3_ok else "VALIDATION_SOURCE_BLOCKED"
    manifest["completedAtUTC"] = now(); manifest["forbiddenInputAccess"] = access["forbiddenInputAccess"]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], **manifest["summary"], "forbiddenInputAccess": access["forbiddenInputAccess"]}))
    return 0 if manifest["status"] == "VALIDATION_SOURCE_ACQUISITION_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())

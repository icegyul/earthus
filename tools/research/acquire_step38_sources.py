"""STEP 38 — preregistered source acquisition for the locked STEP 36 cohort under the locked STEP 37 protocol (acquisition only; no daily
field, no composite, no trajectory, no metric). Per window (docs/research/step36-cohort-extension-manifest.json, consumed as-is):
HYCOM GOFS 3.1 GLBv0.08 expt_53.X 15 m 3-hourly via the STEP 17 NCSS mechanism in two layouts (STEP 17 four-part t0..t0+72h = 25 frames;
six UTC-day files 00..21Z = the 48 registered frames), NCEP-DOE R2 10 m 6 h (STEP 17 wind_parts), GLORYS12V1 uo/vo at 15.81 m
(official Copernicus Marine toolbox, isolated venv, credentials by exit code only; box +-0.5 deg; t0-1d..end+1d), WW3 GLOB-30M CFSR
uss monthly files 2010-07..2010-10 (IFREMER anonymous FTP; own fetch, no shared log). Derived representations (runtime JSON datasets from
the unchanged readers: HYCOM condition A incl. STEP 20 B-3 chunks where needed, wind, GLORYS) are written separately under normalized/
and linked to the original hashes; originals are never rewritten (fetch refuses to overwrite). Longitude rule (STEP 37 field 20): the
reader axis must cover the STEP 36 box in the box's own -180..180 convention; otherwise the window is COORDINATE_BLOCKED (no transform).
No performance, trajectory or evaluation file is opened (guarded). Writes data/research/step38/ (gitignored) and
docs/research/step38-source-acquisition-manifest.json."""
import builtins
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
FORBIDDEN = ("trajector", "result.json", "evaluation", "paired-table", "-summary", "run-manifest", "replay-manifest", "step30", "step29-stokes-", "step25c-", "distance", "error_")
_open = builtins.open
access = {"forbiddenInputAccess": 0}


def guarded_open(file, *a, **k):
    name = str(file).replace("\\", "/").lower()
    if any(t in name for t in FORBIDDEN) and "step38" not in name:
        access["forbiddenInputAccess"] += 1; raise SystemExit(f"FORBIDDEN INPUT ACCESS: {file}")
    return _open(file, *a, **k)


builtins.open = guarded_open
sys.path.insert(0, str(ROOT / "tools/research")); sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import acquire_step17_forcing as a17  # noqa: E402
import build_step20_chunked_forcing as bc  # noqa: E402
import glorys_reader_step25c as greader  # noqa: E402
import netCDF4  # noqa: E402
from research_runtime.datasets import RegularGrid, ForcingBoundary, utc_seconds  # noqa: E402
from research_runtime.netcdf_reader import build_dataset, read_hycom_parts  # noqa: E402
from research_runtime.wind import build_ncep_r2_wind_dataset, WindField, write_wind_dataset  # noqa: E402

PROTO, P37, M36 = D / "step38-source-acquisition-protocol.json", D / "step37-experiment-preregistration-protocol.json", D / "step36-cohort-extension-manifest.json"
DATA = ROOT / "data/research/step38"
MANIFEST = D / "step38-source-acquisition-manifest.json"
VENV = ROOT / "data/research/step25b/toolbox-venv"
FTP = "ftp://ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL"
FMT = "%Y-%m-%dT%H:%M:%SZ"
DATASET_ID, DEPTH = "cmems_mod_glo_phy_my_0.083deg_P1D-m", 15.81


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


def fetch(url, path, timeout=1800):
    """Immutable download: refuses to overwrite an existing original; records status, timestamp, SHA, bytes."""
    if path.exists():
        return {"url": url, "status": "REFUSED_EXISTING_ORIGINAL", "httpStatus": None}
    rec = {"url": url, "requestedAtUTC": now()}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "EARTHUS-research/step38"}), timeout=timeout) as r:
            data = r.read(); rec["httpStatus"] = getattr(r, "status", None) or "ftp"
    except urllib.error.HTTPError as e:
        rec.update({"httpStatus": e.code, "status": "error", "error": str(e)[:200], "retrievedAtUTC": now()}); return rec
    except Exception as e:
        rec.update({"httpStatus": None, "status": "error", "error": type(e).__name__ + ": " + str(e)[:200], "retrievedAtUTC": now()}); return rec
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    rec.update({"status": "ok", "retrievedAtUTC": now(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "file": str(path.relative_to(ROOT)).replace("\\", "/")}); return rec


def nc_meta(path):
    with netCDF4.Dataset(path) as d:
        times = [t.strftime(FMT) for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
        lat, lon = d["lat"][:].tolist(), d["lon"][:].tolist()
        return {"variables": sorted(d.variables.keys()), "units": {v: str(d[v].units) for v in ("water_u", "water_v")}, "standardNames": {v: str(getattr(d[v], "standard_name", "")) for v in ("water_u", "water_v")}, "depthMeters": d["depth"][:].tolist(), "timeUnits": str(d["time"].units), "calendar": str(d["time"].calendar), "frames": len(times), "timeUTC": times,
                "grid": {"nLat": len(lat), "nLon": len(lon), "latRange": [lat[0], lat[-1]], "lonRange": [lon[0], lon[-1]], "latStep": round(lat[1] - lat[0], 6) if len(lat) > 1 else None, "lonStep": round(lon[1] - lon[0], 6) if len(lon) > 1 else None, "lonConvention": "-180..180" if lon[0] < 0 or lon[-1] <= 180 else "0..360"},
                "distributionStatement": str(getattr(d, "distribution_statement", "")), "title": str(getattr(d, "title", ""))[:120], "history": str(getattr(d, "History", ""))[:200]}


def scrub(text):
    return re.sub(r"(password|username|token)[^\n]*", r"\1 [REDACTED]", text or "", flags=re.I)[:600]


def main():
    proto = load(PROTO); p37 = load(P37); m36 = load(M36)
    if proto["step37ProtocolSha256"] != sha(P37) or proto["cohortManifestSha256"] != sha(M36) or proto["tools"]["tools/research/acquire_step38_sources.py"] != sha(__file__):
        raise SystemExit("STEP38_BLOCKED_IMMUTABILITY: protocol / STEP 37 / cohort / tool")
    if MANIFEST.exists():
        raise SystemExit("STEP38_BLOCKED: manifest exists; no overwrite")
    bc.DATA = DATA / "forcing"; norm = DATA / "forcing" / "normalized"; norm.mkdir(parents=True, exist_ok=True)
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "step37ProtocolSha256": sha(P37), "cohortManifestSha256": sha(M36), "tool": {"file": "tools/research/acquire_step38_sources.py", "sha256": sha(__file__)},
                "reused": {t: sha(ROOT / t) for t in ("tools/research/acquire_step17_forcing.py", "tools/research/build_step20_chunked_forcing.py", "tools/research/glorys_reader_step25c.py")}, "normalizedIssuedAtUTC": a17.ISSUED, "startedAtUTC": now(), "sources": proto["sources"], "windows": [], "ww3": {"files": []}, "glorysAccess": {}, "credentialsInManifest": False, "scientificProcessing": False, "trajectoryComputed": False, "performanceDataRead": False}
    # ---- WW3 monthly files (own fetch; no shared log) ----
    months = sorted({(ts(w["start"]) + timedelta(hours=3 * k)).strftime("%Y%m") for w in m36["windows"] for k in range(25)})
    for ym in months:
        fname = f"WW3-GLOB-30M_{ym}_uss.nc"; url = f"{FTP}/{ym[:4]}_CFSR/uss/{fname}"; path = DATA / "DATA-06" / f"{ym[:4]}_CFSR" / fname
        r = fetch(url, path, timeout=3600); rec = {"filename": fname, "month": ym, **r}
        if path.exists():
            rec.update({"file": str(path.relative_to(ROOT)).replace("\\", "/"), "bytes": path.stat().st_size, "sha256": sha(path)})
            with netCDF4.Dataset(path) as ds:
                tt = ds["time"]; times_ = netCDF4.num2date(tt[:], tt.units)
                rec["metadata"] = {"attributes": {k: str(getattr(ds, k)) for k in ("source", "product_version", "grid", "institution", "distribution_statement") if k in ds.ncattrs()}, "variables": sorted(ds.variables.keys()), "units": {v: str(ds[v].units) for v in ("uuss", "vuss") if v in ds.variables}, "frames": len(times_), "timeStart": datetime(times_[0].year, times_[0].month, times_[0].day, times_[0].hour).strftime(FMT), "timeEnd": datetime(times_[-1].year, times_[-1].month, times_[-1].day, times_[-1].hour).strftime(FMT), "lonRange": [float(ds["longitude"][0]), float(ds["longitude"][-1])], "latRange": [float(ds["latitude"][0]), float(ds["latitude"][-1])]}
        manifest["ww3"]["files"].append(rec); print(json.dumps({"ww3": fname, "status": rec["status"]}), flush=True)
    # ---- GLORYS access (exit code only) ----
    py = next((c for c in (VENV / "Scripts" / "copernicusmarine.exe", VENV / "bin" / "copernicusmarine") if c.exists()), None)
    auth = {"toolboxPresent": py is not None, "method": "copernicusmarine login --check-credentials-valid (exit code only)", "credentialsEntered": False, "credentialsStored": False, "contentsRead": False}
    if py:
        r = subprocess.run([str(py), "login", "--check-credentials-valid"], capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL); auth.update({"exitCode": r.returncode, "authenticated": r.returncode == 0, "checkedAtUTC": now()})
    else:
        auth.update({"exitCode": None, "authenticated": False})
    manifest["glorysAccess"] = auth
    for w in m36["windows"]:
        wid = w["windowId"]; t0 = ts(w["start"]); box = w["oceanBox"]
        unit = {"windowId": wid, "region": w["region"], "t0": t0, "start": w["start"], "end": w["end"], "drifters": [(d["drifterId"], d["startLon"], d["startLat"]) for d in sorted(w["drifters"], key=lambda d: d["drifterId"])], "oceanBox": box, "windBox": {"south": max(-90.0, box["south"] - 3.0), "north": min(90.0, box["north"] + 3.0), "west": box["west"] - 3.0, "east": box["east"] + 3.0}}
        rec = {"windowId": wid, "t0": w["start"], "end": w["end"], "drifterIds": [d[0] for d in unit["drifters"]], "oceanBox": box, "windBox": unit["windBox"], "registeredFrames": w["requiredFrameCount"], "requiredUtcDays": w["requiredUtcDays"], "hycomWindowParts": [], "hycomDayParts": [], "ncep": [], "glorys": {}, "reasons": []}
        folder = DATA / "forcing" / wid
        parts = []
        for name, url in a17.hycom_parts(unit):
            path = folder / "hycom" / name; r = fetch(url, path)
            e = {"filename": name, "query": url, "requestParameters": {"dataset": "GLBv0.08/expt_53.X", "year": "2010", "var": ["water_u", "water_v"], "vertCoord": 15, "horizStride": 1, "timeStride": 1, "box": box}, **r}
            if path.exists():
                e.update({"bytes": path.stat().st_size, "sha256": sha(path), "metadata": nc_meta(path)}); parts.append((path, url))
            rec["hycomWindowParts"].append(e)
        dparts = []
        for day in w["requiredUtcDays"]:
            s = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc); e_ = s + timedelta(hours=21)
            url = (f"{a17.HYCOM.format(year=s.year)}?var=water_u&var=water_v&north={box['north']:.3f}&south={box['south']:.3f}&west={box['west']:.3f}&east={box['east']:.3f}&horizStride=1&time_start={s.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&time_end={e_.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&timeStride=1&vertCoord=15&addLatLon=true&accept=netcdf")
            path = folder / "hycom-days" / f"day-{s.strftime('%Y%m%d')}.nc"; r = fetch(url, path)
            e = {"filename": path.name, "utcDay": day, "query": url, "requestParameters": {"dataset": "GLBv0.08/expt_53.X", "year": "2010", "var": ["water_u", "water_v"], "vertCoord": 15, "horizStride": 1, "timeStride": 1, "box": box, "timeStart": f"{day}T00:00:00Z", "timeEnd": f"{day}T21:00:00Z"}, **r}
            if path.exists():
                e.update({"bytes": path.stat().st_size, "sha256": sha(path), "metadata": nc_meta(path)}); dparts.append((path, url))
            rec["hycomDayParts"].append(e)
        got = sorted(t for e in rec["hycomDayParts"] for t in e.get("metadata", {}).get("timeUTC", []))
        rec["acquiredDayFrames"] = len(got); rec["missingRegisteredFrames"] = sorted(set(w["requiredFrames"]) - set(got)) if "requiredFrames" in w else sorted(set(f"{d}T{h:02d}:00:00Z" for d in w["requiredUtcDays"] for h in range(0, 24, 3)) - set(got))
        # ---- HYCOM normalization (condition A) + longitude rule ----
        if len(parts) == 4:
            try:
                base_id = f"hycom-gofs31-53x-{wid.lower()}-15m"; version = f"{w['start'][:13]}_{w['end'][:13]}.earthus1"; cite = f"{box['south']:.2f}..{box['north']:.2f} / {box['west']:.2f}..{box['east']:.2f}"
                grid_full, sources, (rlat, rlon), meta = read_hycom_parts(parts, 15); values = meta["shape"][0] * meta["shape"][1] * meta["shape"][2] * 2
                coord = {"readerLonRange": [grid_full["lon"][0], grid_full["lon"][-1]], "readerLatRange": [grid_full["lat"][0], grid_full["lat"][-1]], "boxConvention": "-180..180", "readerConvention": "-180..180" if grid_full["lon"][0] < 0 or grid_full["lon"][-1] <= 180 else "0..360", "transformApplied": False}
                coord["coversBox"] = grid_full["lon"][0] - 0.081 <= box["west"] and box["east"] <= grid_full["lon"][-1] + 0.081 and grid_full["lat"][0] - 0.081 <= box["south"] and box["north"] <= grid_full["lat"][-1] + 0.081
                coord["result"] = "PASS" if coord["coversBox"] and coord["readerConvention"] == coord["boxConvention"] else "COORDINATE_BLOCKED"
                rec["coordinateRule"] = coord
                if coord["result"] != "PASS":
                    rec["reasons"].append("longitude convention mismatch (registered rule: STOP, no transform)")
                nat = {"frames": meta["shape"][0], "shape": meta["shape"], "valuesCount": values, "cadenceSeconds": meta["cadenceSeconds"], "maskedNodes": meta["maskedNodes"], "uRange": meta["uRange"], "vRange": meta["vRange"], "timeStart": grid_full["timeUTC"][0], "timeEnd": grid_full["timeUTC"][-1], "fullLandMaskSha256": hashlib.sha256(canonical(grid_full["landMask"])).hexdigest()}
                if meta["shape"][0] != 25 or meta["cadenceSeconds"] != 10800 or grid_full["timeUTC"][0] != w["start"] or grid_full["timeUTC"][-1] != w["end"]:
                    rec["reasons"].append("HYCOM window parts differ from 25 x 3 h over t0..t0+72h")
                if coord["result"] == "PASS":
                    if values <= 2_000_000:
                        ds, _, _ = build_dataset(base_id, version, parts, 15, cite, a17.ISSUED); p = norm / f"{wid}.hycom15m.dataset.json"; p.write_bytes(canonical(ds) + b"\n")
                        nat.update({"chunked": False, "file": str(p.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(p), "gridSha256": ds["manifest"]["sha256"], "sourceSha256": ds["manifest"]["sourceSha256"], "datasetId": ds["manifest"]["datasetId"], "landMaskSha256": hashlib.sha256(canonical(ds["grid"]["landMask"])).hexdigest(), "derivedFromOriginals": [e["sha256"] for e in rec["hycomWindowParts"]]})
                        grid_for_stencil = RegularGrid(ds)
                    else:
                        chunks, union = bc.build_chunks(wid, base_id, rec["hycomWindowParts"], box, t0)
                        nat.update({"chunked": True, "chunkRule": "STEP 20 B-3", "chunks": {}, "landMaskSha256": hashlib.sha256(canonical(union)).hexdigest(), "derivedFromOriginals": [e["sha256"] for e in rec["hycomWindowParts"]]})
                        for name, (ds, cm) in chunks.items():
                            p = norm / f"{wid}.hycom15m.chunk{name}.dataset.json"; p.write_bytes(canonical(ds) + b"\n"); nat["chunks"][name] = {**cm, "file": str(p.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(p), "gridSha256": ds["manifest"]["sha256"], "sourceSha256": ds["manifest"]["sourceSha256"], "datasetId": ds["manifest"]["datasetId"]}
                        grid_for_stencil = RegularGrid(chunks["A"][0])
                    stencil = []
                    for did, lon, lat in unit["drifters"]:
                        try:
                            grid_for_stencil.velocity(utc_seconds(w["start"]), lon, lat); stencil.append({"drifterId": did, "wet": True})
                        except ForcingBoundary as exc:
                            stencil.append({"drifterId": did, "wet": False, "status": exc.status})
                    nat["releaseStencil"] = stencil
                    if any(not s["wet"] for s in stencil):
                        rec["reasons"].append("release stencil not fully wet: " + ",".join(s["drifterId"] for s in stencil if not s["wet"]))
                rec["hycomNative3h"] = nat
            except BaseException as exc:
                rec["reasons"].append("HYCOM reader/normalization: " + type(exc).__name__ + ": " + str(exc)[:300])
        else:
            rec["reasons"].append("HYCOM window part(s) not retrievable")
        if rec["missingRegisteredFrames"] or len(dparts) != 6:
            rec["reasons"].append(f"registered day frames missing: {len(rec['missingRegisteredFrames'])}")
        # ---- NCEP wind ----
        wparts = {}
        for var, name, url in a17.wind_parts(unit):
            path = folder / "ncep" / name; r = fetch(url, path); e = {"dataset": "NCEP-DOE Reanalysis 2 gaussian_grid", "product": var + ".10m", "filename": name, "query": url, **r}
            if path.exists():
                e.update({"bytes": path.stat().st_size, "sha256": sha(path)}); wparts.setdefault(var, []).append((path, url))
            rec["ncep"].append(e)
        if len(wparts.get("uwnd", [])) != 1 or len(wparts.get("vwnd", [])) != 1:
            rec["reasons"].append("NCEP wind part(s) not retrievable or split across years")
        else:
            try:
                (up, uu), (vp, vu) = wparts["uwnd"][0], wparts["vwnd"][0]
                wind, _ = build_ncep_r2_wind_dataset(up, vp, uu, vu, f"ncep-doe-r2-10m-wind-{wid.lower()}", f"{w['start'][:13]}.earthus1", a17.ISSUED); times = wind["grid"]["timeUTC"]
                if times[0] > (t0 - timedelta(hours=12)).strftime(FMT) or times[-1] < (t0 + timedelta(hours=84)).strftime(FMT) or wind["manifest"]["timeStepSeconds"] != 21600:
                    rec["reasons"].append("NCEP wind does not cover t0-12h..t0+84h at 6 h")
                field = WindField(wind); wst = []
                for did, lon, lat in unit["drifters"]:
                    try:
                        field.velocity(utc_seconds(w["start"]), lon, lat); wst.append({"drifterId": did, "ok": True})
                    except ForcingBoundary as exc:
                        wst.append({"drifterId": did, "ok": False, "reason": getattr(exc, "reason", exc.status)})
                if any(not s["ok"] for s in wst):
                    rec["reasons"].append("wind stencil unavailable at release")
                wout = write_wind_dataset(wind, norm / f"{wid}.ncep10m.wind.json")
                rec["wind"] = {"file": str(wout.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(wout), "gridSha256": wind["manifest"]["sha256"], "sourceSha256": wind["manifest"]["sourceSha256"], "frames": len(times), "timeStart": times[0], "timeEnd": times[-1], "lonRange": [wind["grid"]["lon"][0], wind["grid"]["lon"][-1]], "releaseStencil": wst, "derivedFromOriginals": [e["sha256"] for e in rec["ncep"] if "sha256" in e]}
            except Exception as exc:
                rec["reasons"].append("NCEP reader/validation: " + type(exc).__name__ + ": " + str(exc)[:300])
        # ---- GLORYS subset (authorized toolbox) ----
        g = {"status": "CREDENTIALS_REQUIRED"}
        if auth.get("authenticated"):
            gbox = {"west": round(box["west"] - 0.5, 5), "east": round(box["east"] + 0.5, 5), "south": round(box["south"] - 0.5, 5), "north": round(box["north"] + 0.5, 5)}
            start, end = (t0 - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00"), (ts(w["end"]) + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00"); gdir = DATA / "glorys"; gdir.mkdir(parents=True, exist_ok=True)
            fname = f"{wid}.glorys12v1.uo_vo.{DEPTH:.2f}m.nc"; out = gdir / fname
            cmd = [str(py), "subset", "-i", DATASET_ID, "-v", "uo", "-v", "vo", "-x", str(gbox["west"]), "-X", str(gbox["east"]), "-y", str(gbox["south"]), "-Y", str(gbox["north"]), "-t", start, "-T", end, "-z", str(DEPTH), "-Z", str(DEPTH), "-o", str(gdir), "-f", fname, "--disable-progress-bar"]
            g = {"requestedTime": [start, end], "requestedBox": gbox, "requestedDepthMeters": DEPTH, "variables": ["uo", "vo"], "command": " ".join(cmd[1:]), "requestedAtUTC": now()}
            if out.exists():
                g.update({"status": "REFUSED_EXISTING_ORIGINAL"})
            else:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, stdin=subprocess.DEVNULL); g.update({"exitCode": r.returncode, "outputScrubbed": scrub(r.stdout + r.stderr), "retrievedAtUTC": now()})
                if r.returncode == 0 and out.exists():
                    g.update({"file": str(out.relative_to(ROOT)).replace("\\", "/"), "bytes": out.stat().st_size, "sha256": sha(out), "status": "ok"})
                    try:
                        request = {"requestedAtUTC": g["requestedAtUTC"], "requestedTime": g["requestedTime"], "requestedBox": gbox, "requestedDepthMeters": DEPTH, "command": g["command"], "toolbox": {"isolatedVenv": str(VENV.relative_to(ROOT)).replace("\\", "/")}}
                        dataset, source, meta = greader.build_dataset(f"glorys12v1-15.81m-{wid}", "step38-1", out, 15.81007, wid, request)
                        p = norm / f"{wid}.glorys15.81m.dataset.json"; p.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")); gg = dataset["grid"]
                        g["normalized"] = {"file": str(p.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(p), "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"], "shape": meta["shape"], "timeUTC": gg["timeUTC"], "lonRange": [gg["lon"][0], gg["lon"][-1]], "latRange": [gg["lat"][0], gg["lat"][-1]], "depthLevelMeters": meta["depthLevelMeters"], "areaInsideGrid": gg["lon"][0] <= box["west"] and box["east"] <= gg["lon"][-1] and gg["lat"][0] <= box["south"] and box["north"] <= gg["lat"][-1], "timeBracketsWindow": gg["timeUTC"][0] <= w["start"] and w["end"] <= gg["timeUTC"][-1], "derivedFromOriginal": g["sha256"]}
                        if not (g["normalized"]["areaInsideGrid"] and g["normalized"]["timeBracketsWindow"]):
                            g["status"] = "COVERAGE_FAIL"
                    except Exception as exc:
                        g["status"] = "READER_FAIL"; g["error"] = type(exc).__name__ + ": " + str(exc)[:300]
                else:
                    g["status"] = "error"
        rec["glorys"] = g
        if g.get("status") != "ok":
            rec["reasons"].append(f"GLORYS {g.get('status')}")
        rec["hycomStatus"] = "ACQUIRED" if not any(x for x in rec["reasons"] if not x.startswith("GLORYS")) else "BLOCKED"
        rec["candidateStatus"] = "ACQUIRED" if g.get("status") == "ok" and rec["hycomStatus"] == "ACQUIRED" else "BLOCKED"
        manifest["windows"].append(rec); print(json.dumps({"window": wid, "hycom": rec["hycomStatus"], "candidate": rec["candidateStatus"], "dayFrames": rec["acquiredDayFrames"], "missing": len(rec["missingRegisteredFrames"]), "coord": rec.get("coordinateRule", {}).get("result"), "chunked": rec.get("hycomNative3h", {}).get("chunked"), "reasons": rec["reasons"]}), flush=True)
    manifest["completedAtUTC"] = now(); hs = [w["hycomStatus"] for w in manifest["windows"]]; cs = [w["candidateStatus"] for w in manifest["windows"]]
    manifest["status"] = "ACQUIRED" if all(s == "ACQUIRED" for s in hs + cs) and all(f["status"] == "ok" for f in manifest["ww3"]["files"]) else ("PARTIAL" if any(s == "ACQUIRED" for s in hs) else "BLOCKED")
    manifest["forbiddenInputAccess"] = access["forbiddenInputAccess"]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "hycom": hs.count("ACQUIRED"), "candidate": cs.count("ACQUIRED"), "ww3": sum(1 for f in manifest["ww3"]["files"] if f["status"] == "ok"), "forbiddenInputAccess": access["forbiddenInputAccess"]}))
    return 0 if manifest["status"] == "ACQUIRED" else 1


if __name__ == "__main__":
    raise SystemExit(main())

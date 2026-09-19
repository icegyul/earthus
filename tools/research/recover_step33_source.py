"""STEP 33 — SOURCE AVAILABILITY RECOVERY (no scientific run). For every registered frame that was missing in STEP 32 Phase B (B2 gate,
docs/research/step32-forcing-quality.json), re-query the SAME registered source individually: HYCOM GOFS 3.1 GLBv0.08 expt_53.X
/data/2011 via the STEP 17 NCSS mechanism, water_u/water_v, vertCoord 15, horizStride 1, timeStride 1, the window's registered ocean bbox,
time_start = time_end = the missing timestamp (exact-frame query) plus one bracketing query (timestamp -3 h .. +3 h) as evidence of the
neighbouring frames. Every response is recorded (URL, parameters, retrieval timestamp, HTTP status, body kind, SHA-256, bytes) and, when a
NetCDF dataset is returned, parsed with the unchanged reader (netcdf_reader.read_hycom_parts): time axis, coordinates, variables, units,
depth, grid, distribution statement, compared with the STEP 32 acquisition record of the same window (axes, depth, units, statement).
Classification per frame: AVAILABLE (exact timestamp returned with both variables), SOURCE_ABSENT (server answered and the timestamp is not
in the returned axis / no data in range), ACQUISITION_ERROR (network / server error; availability undetermined). Window status:
WINDOW_RECOVERABLE only if every missing frame is AVAILABLE and MATCH; otherwise WINDOW_BLOCKED (never promoted to PASS). Nothing in STEP 32
is read except the locked matrix and the acquisition / quality manifests; no trajectory, result, metric or evaluation file is opened (guarded
open). Writes data/research/step33/ (gitignored) and docs/research/step33-source-recovery-manifest.json."""
import builtins
import hashlib
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
FORBIDDEN = ("trajector", "result.json", "evaluation", "paired-table", "-summary", "run-manifest", "replay-manifest", "candidate", "daily-derivation", "glorys", "stokes", "step30", "step29", "step25", "step20")
_open = builtins.open
access = {"forbiddenInputAccess": 0, "opened": 0}


def guarded_open(file, *args, **kwargs):
    name = str(file).replace("\\", "/").lower()
    if any(t in name for t in FORBIDDEN) and "step33" not in name:
        access["forbiddenInputAccess"] += 1; raise SystemExit(f"FORBIDDEN INPUT ACCESS: {file}")
    access["opened"] += 1; return _open(file, *args, **kwargs)


builtins.open = guarded_open
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
from research_runtime.netcdf_reader import read_hycom_parts  # noqa: E402

PROTO, MATRIX, ACQ, QC = D / "step33-source-recovery-protocol.json", D / "step32-temporal-experiment-matrix.json", D / "step32-forcing-acquisition-manifest.json", D / "step32-forcing-quality.json"
DATA = ROOT / "data/research/step33"
MANIFEST = D / "step33-source-recovery-manifest.json"
HYCOM = "https://ncss.hycom.org/thredds/ncss/GLBv0.08/expt_53.X/data/{year}"
FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def now():
    return datetime.now(timezone.utc).strftime(FMT)


def ts(s):
    return datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def url_for(box, s, e):
    return (f"{HYCOM.format(year=s.year)}?var=water_u&var=water_v&north={box['north']:.3f}&south={box['south']:.3f}&west={box['west']:.3f}&east={box['east']:.3f}"
            f"&horizStride=1&time_start={s.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&time_end={e.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&timeStride=1&vertCoord=15&addLatLon=true&accept=netcdf")


def request(url, path):
    rec = {"url": url, "requestedAtUTC": now(), "httpStatus": None, "bodyKind": None, "bytes": 0, "sha256": None}
    req = urllib.request.Request(url, headers={"User-Agent": "EARTHUS-research/step33-recovery"})
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = resp.read(); rec["httpStatus"] = resp.status; rec["contentType"] = resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as err:
        body = err.read()[:2000] if hasattr(err, "read") else b""
        rec.update({"httpStatus": err.code, "bodyKind": "http-error", "serverMessage": body.decode("utf-8", "replace")[:600], "retrievedAtUTC": now()}); return rec, None
    except Exception as err:
        rec.update({"bodyKind": "network-error", "error": type(err).__name__ + ": " + str(err)[:300], "retrievedAtUTC": now()}); return rec, None
    rec["retrievedAtUTC"] = now(); rec["bytes"] = len(data); rec["sha256"] = hashlib.sha256(data).hexdigest()
    rec["bodyKind"] = "netcdf" if data[:4] in (b"CDF\x01", b"CDF\x02", b"\x89HDF") else "non-netcdf"
    if rec["bodyKind"] != "netcdf":
        rec["serverMessage"] = data[:600].decode("utf-8", "replace")
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data); rec["file"] = str(path.relative_to(ROOT)).replace("\\", "/")
    return rec, path


def nc_meta(path):
    with netCDF4.Dataset(path) as d:
        times = [t.strftime(FMT) for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
        lat, lon = d["lat"][:].tolist(), d["lon"][:].tolist()
        return {"timeUTC": times, "variables": sorted(d.variables.keys()), "units": {v: str(d[v].units) for v in ("water_u", "water_v") if v in d.variables}, "standardNames": {v: str(getattr(d[v], "standard_name", "")) for v in ("water_u", "water_v") if v in d.variables},
                "depthMeters": d["depth"][:].tolist(), "grid": {"nLat": len(lat), "nLon": len(lon), "latRange": [lat[0], lat[-1]], "lonRange": [lon[0], lon[-1]], "latStep": round(lat[1] - lat[0], 6) if len(lat) > 1 else None, "lonStep": round(lon[1] - lon[0], 6) if len(lon) > 1 else None},
                "distributionStatement": str(getattr(d, "distribution_statement", "")), "calendar": str(d["time"].calendar), "rawLat": lat, "rawLon": lon}


def main():
    proto = load(PROTO); M = load(MATRIX); A = load(ACQ); Q = load(QC)
    if sha(MATRIX) != proto["frozen"]["experimentMatrixSha256"] or sha(ACQ) != proto["frozen"]["step32Outputs"]["docs/research/step32-forcing-acquisition-manifest.json"] or sha(QC) != proto["frozen"]["step32Outputs"]["docs/research/step32-forcing-quality.json"] or proto["tool"]["sha256"] != sha(__file__):
        raise SystemExit("STEP33_BLOCKED_IMMUTABILITY")
    if MANIFEST.exists():
        raise SystemExit("STEP33_BLOCKED: manifest exists; no overwrite")
    mw = {w["windowId"]: w for w in M["windows"]}; aw = {w["windowId"]: w for w in A["windows"]}
    blocked = [w for w in Q["windows"] if w["status"] == "WINDOW_BLOCKED"]
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "tool": {"file": "tools/research/recover_step33_source.py", "sha256": sha(__file__)}, "source": proto["sourceBinding"], "startedAtUTC": now(), "windows": [], "frames": [], "scientificRun": False, "modelRunCount": 0, "performanceDataRead": False}
    for qw in blocked:
        wid = qw["windowId"]; w = mw[wid]; box = w["oceanBox"]; ref = aw[wid]
        ref_meta = next((e["metadata"] for e in ref["hycomDayParts"] if "metadata" in e), None); ref_axes = None
        if ref_meta is not None:
            # axes of the STEP 32 day files (identical across that window's files, B2-verified) re-read from the first day file
            p0 = ROOT / "data/research/step32/forcing" / wid / "hycom-days" / ref["hycomDayParts"][0]["filename"]
            with netCDF4.Dataset(p0) as d0:
                ref_axes = (d0["lat"][:].tolist(), d0["lon"][:].tolist())
        wrec = {"windowId": wid, "t0": w["t0"], "missingRegisteredFrames": qw["missingRegisteredFrames"], "step32Status": qw["status"], "frames": [], "oceanBox": box}
        for t in qw["missingRegisteredFrames"]:
            tt = ts(t); folder = DATA / wid
            exact, epath = request(url_for(box, tt, tt), folder / f"exact-{tt.strftime('%Y%m%dT%H')}.nc")
            bracket, bpath = request(url_for(box, tt - timedelta(hours=3), tt + timedelta(hours=3)), folder / f"bracket-{tt.strftime('%Y%m%dT%H')}.nc")
            frame = {"windowId": wid, "timestamp": t, "source": proto["sourceBinding"]["product"], "experiment": "expt_53.X", "year": "2011", "requestParameters": {"var": ["water_u", "water_v"], "vertCoord": 15, "horizStride": 1, "timeStride": 1, "box": box}, "exactQuery": exact, "bracketQuery": bracket, "step32Record": {"acquisitionStatus": ref["status"], "missingInStep32": t in qw["missingRegisteredFrames"], "dayFileFrames": next((e["metadata"]["frames"] for e in ref["hycomDayParts"] if e.get("utcDay") == t[:10] and "metadata" in e), None)}}
            cls = None; parsed = {}
            for key, rec, path in (("exact", exact, epath), ("bracket", bracket, bpath)):
                if path is not None and rec["bodyKind"] == "netcdf":
                    try:
                        parsed[key] = nc_meta(path)
                    except Exception as exc:
                        rec["parseError"] = type(exc).__name__ + ": " + str(exc)[:200]
            ex_times = parsed.get("exact", {}).get("timeUTC", []); br_times = parsed.get("bracket", {}).get("timeUTC", [])
            frame["returnedTimeAxis"] = {"exact": ex_times, "bracket": br_times}
            if exact["bodyKind"] == "netcdf" and t in ex_times and all(v in parsed["exact"]["variables"] for v in ("water_u", "water_v")):
                cls = "AVAILABLE"
            elif exact["bodyKind"] in ("network-error",) or (exact["bodyKind"] == "http-error" and exact["httpStatus"] and exact["httpStatus"] >= 500) or (bracket["bodyKind"] == "network-error"):
                cls = "ACQUISITION_ERROR"
            elif (exact["bodyKind"] == "netcdf" and t not in ex_times) or (exact["bodyKind"] in ("http-error", "non-netcdf") and exact["httpStatus"] in (400, 404) and bracket["bodyKind"] == "netcdf" and t not in br_times) or (exact["bodyKind"] in ("http-error", "non-netcdf") and bracket["bodyKind"] == "netcdf"):
                cls = "SOURCE_ABSENT"
            else:
                cls = "ACQUISITION_ERROR"
            frame["classification"] = cls; frame["evidence"] = {"exactStatus": exact["httpStatus"], "exactBody": exact["bodyKind"], "exactMessage": exact.get("serverMessage", "")[:300], "bracketStatus": bracket["httpStatus"], "bracketBody": bracket["bodyKind"], "bracketNeighbours": [x for x in br_times if x != t]}
            if cls == "AVAILABLE":
                pm = parsed["exact"]; frame["metadata"] = {k: v for k, v in pm.items() if k not in ("rawLat", "rawLon")}
                try:
                    grid, sources, (rlat, rlon), meta = read_hycom_parts([(epath, exact["url"])], 15)
                    frame["readerValidation"] = {"reader": "netcdf_reader.read_hycom_parts (unchanged)", "frames": meta["shape"][0], "shape": meta["shape"], "maskedNodes": meta["maskedNodes"], "uRange": meta["uRange"], "vRange": meta["vRange"], "cadenceOK": True, "sourceSha256": sources[0]["sha256"]}
                    cmp = {"axesEqualToStep32DayFiles": ref_axes is not None and (rlat, rlon) == ref_axes, "depthEqual": pm["depthMeters"] == [15.0] == ref_meta["depthMeters"], "unitsEqual": pm["units"] == ref_meta["units"], "distributionStatementEqual": pm["distributionStatement"] == ref_meta["distributionStatement"], "variablesEqual": pm["variables"] == ref_meta["variables"], "timestampExact": ex_times == [t]}
                    frame["comparison"] = cmp; frame["comparisonResult"] = "MATCH" if all(cmp.values()) else "MISMATCH"
                except Exception as exc:
                    frame["readerValidation"] = {"error": type(exc).__name__ + ": " + str(exc)[:300]}; frame["comparisonResult"] = "MISMATCH"
            wrec["frames"].append(frame); manifest["frames"].append(frame)
            print(json.dumps({"window": wid, "timestamp": t, "class": cls, "exact": [exact["httpStatus"], exact["bodyKind"]], "bracketNeighbours": frame["evidence"]["bracketNeighbours"], "compare": frame.get("comparisonResult")}), flush=True)
        classes = [f["classification"] for f in wrec["frames"]]
        wrec["windowStatus"] = "WINDOW_RECOVERABLE" if classes and all(c == "AVAILABLE" for c in classes) and all(f.get("comparisonResult") == "MATCH" for f in wrec["frames"]) else "WINDOW_BLOCKED"
        wrec["classificationCounts"] = {c: classes.count(c) for c in ("AVAILABLE", "SOURCE_ABSENT", "ACQUISITION_ERROR")}
        manifest["windows"].append(wrec)
    counts = {c: sum(1 for f in manifest["frames"] if f["classification"] == c) for c in ("AVAILABLE", "SOURCE_ABSENT", "ACQUISITION_ERROR")}
    rec_n = sum(1 for w in manifest["windows"] if w["windowStatus"] == "WINDOW_RECOVERABLE")
    if counts["ACQUISITION_ERROR"]:
        status = "ACQUISITION_ERROR"
    elif rec_n == len(manifest["windows"]):
        status = "RECOVERY_COMPLETE"
    elif rec_n > 0:
        status = "PARTIAL_RECOVERY"
    else:
        status = "SOURCE_ABSENT"
    manifest.update({"frameClassificationCounts": counts, "recoveredWindows": rec_n, "remainingBlockedWindows": len(manifest["windows"]) - rec_n, "status": status, "forbiddenInputAccess": access["forbiddenInputAccess"], "completedAtUTC": now()})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "counts": counts, "recovered": rec_n, "forbiddenInputAccess": access["forbiddenInputAccess"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

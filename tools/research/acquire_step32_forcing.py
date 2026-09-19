"""STEP 32 Phase B — B1: acquire the preregistered HYCOM GOFS 3.1 expt_53.X 15 m 3-hourly source and NCEP-DOE R2 10 m 6 h wind for the
eight locked expanded-holdout / temporal-test windows (docs/research/step32-temporal-experiment-matrix.json), and normalize condition A.
Reuses verbatim: acquire_step17_forcing.fetch / hycom_parts / wind_parts / ISSUED (STEP 17 identity: ocean box = t0 bbox +-2 deg, lat
clipped; wind box = +-3 deg; wind t0-12h..t0+84h), research_runtime.netcdf_reader.build_dataset (unchanged reader), the STEP 20 B-3
chunker build_step20_chunked_forcing.build_chunks (for windows whose 25-frame dataset exceeds datasets.MAX_VALUES) and the STEP 17 wind
builder. Two HYCOM acquisitions per window from the same NCSS service: (1) the STEP 17 four-part layout t0..t0+72h (25 frames; condition A
exactly as STEP 17/20 produce it) and (2) six complete UTC-day files 00..21Z for D-1..D+4 (48 registered frames; source of the daily means,
B3). Overlapping frames of (1) and (2) are cross-checked bitwise in B2. No alternative product, no interpolation, no fill. Performance
files are never opened. Writes data/research/step32/forcing/<wid>/ (gitignored) and docs/research/step32-forcing-acquisition-manifest.json."""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research")); sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import acquire_step17_forcing as a17  # noqa: E402  (helpers only; its main() is never called)
import build_step20_chunked_forcing as bc  # noqa: E402  (B-3 chunker; its main() is never called)
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402
from research_runtime.datasets import RegularGrid, ForcingBoundary, utc_seconds, digest  # noqa: E402
from research_runtime.netcdf_reader import build_dataset, read_hycom_parts  # noqa: E402
from research_runtime.wind import build_ncep_r2_wind_dataset, WindField, write_wind_dataset  # noqa: E402

MATRIX, PREREG, PB = D / "step32-temporal-experiment-matrix.json", D / "step32-preregistration.json", D / "step32-phase-b-preregistration.json"
DATA = ROOT / "data/research/step32/forcing"
MANIFEST = D / "step32-forcing-acquisition-manifest.json"
FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def ts(s):
    return datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)


def day_parts(unit, days):
    b = unit["oceanBox"]; parts = []
    for day in days:
        s = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc); e = s + timedelta(hours=21)
        url = (f"{a17.HYCOM.format(year=s.year)}?var=water_u&var=water_v&north={b['north']:.3f}&south={b['south']:.3f}&west={b['west']:.3f}&east={b['east']:.3f}"
               f"&horizStride=1&time_start={s.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&time_end={e.strftime('%Y-%m-%dT%H')}%3A00%3A00Z&timeStride=1&vertCoord=15&addLatLon=true&accept=netcdf")
        parts.append((f"day-{s.strftime('%Y%m%d')}.nc", url, day))
    return parts


def nc_meta(path):
    with netCDF4.Dataset(path) as d:
        times = [t.strftime(FMT) for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
        lat, lon = d["lat"][:].tolist(), d["lon"][:].tolist()
        return {"variables": sorted(d.variables.keys()), "units": {v: str(d[v].units) for v in ("water_u", "water_v")}, "standardNames": {v: str(getattr(d[v], "standard_name", "")) for v in ("water_u", "water_v")},
                "depthMeters": d["depth"][:].tolist(), "timeUnits": str(d["time"].units), "calendar": str(d["time"].calendar), "frames": len(times), "timeUTC": times,
                "grid": {"nLat": len(lat), "nLon": len(lon), "latRange": [lat[0], lat[-1]], "lonRange": [lon[0], lon[-1]], "latStep": round(lat[1] - lat[0], 6) if len(lat) > 1 else None, "lonStep": round(lon[1] - lon[0], 6) if len(lon) > 1 else None},
                "distributionStatement": str(getattr(d, "distribution_statement", "")), "title": str(getattr(d, "title", ""))[:120], "history": str(getattr(d, "History", ""))[:200]}


def main():
    q = load(PREREG); M = load(MATRIX); pb = load(PB)
    if sha(MATRIX) != q["experimentMatrixSha256"] or q["status"] != "PREREGISTRATION LOCKED" or pb["experimentMatrixSha256"] != sha(MATRIX) or pb["tools"]["tools/research/acquire_step32_forcing.py"] != sha(__file__):
        raise SystemExit("STEP32_BLOCKED_IMMUTABILITY: matrix / preregistration / tool")
    if MANIFEST.exists():
        raise SystemExit("STEP32_BLOCKED: acquisition manifest exists; no overwrite")
    bc.DATA = DATA
    manifest = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B1", "experimentMatrixSha256": sha(MATRIX), "phaseBPreregistrationSha256": sha(PB), "tool": {"file": "tools/research/acquire_step32_forcing.py", "sha256": sha(__file__)},
                "reused": {"acquire_step17_forcing.py": sha(ROOT / "tools/research/acquire_step17_forcing.py"), "build_step20_chunked_forcing.py": sha(ROOT / "tools/research/build_step20_chunked_forcing.py")}, "product": M["conditions"]["A"]["product"], "alternativeProduct": "NONE",
                "normalizedIssuedAtUTC": a17.ISSUED, "startedAtUTC": a17.now(), "windows": [], "modelRun": False, "trajectoryComputed": False, "performanceDataRead": False}
    for w in M["windows"]:
        wid = w["windowId"]; t0 = ts(w["t0"])
        unit = {"windowId": wid, "region": w["region"], "t0": t0, "start": w["t0"], "end": w["end"], "drifters": [(d["drifterId"], d["lon"], d["lat"]) for d in sorted(w["releasePositions"], key=lambda d: d["drifterId"])], "oceanBox": w["oceanBox"], "windBox": w["windBox"]}
        rec = {"windowId": wid, "t0": w["t0"], "end": w["end"], "drifterIds": [d[0] for d in unit["drifters"]], "oceanBox": w["oceanBox"], "windBox": w["windBox"], "registeredFrames": w["requiredFrameCount"], "hycomWindowParts": [], "hycomDayParts": [], "ncep": [], "reasons": []}
        folder = DATA / wid
        # ---- (1) STEP 17 layout: t0..t0+72h in four parts ----
        parts = []
        for name, url in a17.hycom_parts(unit):
            path = folder / "hycom" / name; r = a17.fetch(url, path)
            entry = {"filename": name, "query": url, "requestParameters": {"dataset": "GLBv0.08/expt_53.X", "year": str(t0.year), "var": ["water_u", "water_v"], "vertCoord": 15, "horizStride": 1, "timeStride": 1, "box": w["oceanBox"]}, **r}
            if path.exists():
                entry.update({"bytes": path.stat().st_size, "sha256": sha(path), "metadata": nc_meta(path)}); parts.append((path, url))
            rec["hycomWindowParts"].append(entry)
        # ---- (2) six complete UTC days (48 registered frames) ----
        dparts = []
        for name, url, day in day_parts(unit, w["requiredUtcDays"]):
            path = folder / "hycom-days" / name; r = a17.fetch(url, path)
            entry = {"filename": name, "utcDay": day, "query": url, "requestParameters": {"dataset": "GLBv0.08/expt_53.X", "year": str(t0.year), "var": ["water_u", "water_v"], "vertCoord": 15, "horizStride": 1, "timeStride": 1, "box": w["oceanBox"], "timeStart": f"{day}T00:00:00Z", "timeEnd": f"{day}T21:00:00Z"}, **r}
            if path.exists():
                entry.update({"bytes": path.stat().st_size, "sha256": sha(path), "metadata": nc_meta(path)}); dparts.append((path, url))
            rec["hycomDayParts"].append(entry)
        got = sorted(t for e in rec["hycomDayParts"] for t in e.get("metadata", {}).get("timeUTC", []))
        rec["acquiredDayFrames"] = len(got); rec["missingRegisteredFrames"] = sorted(set(w["requiredFrames"]) - set(got)); rec["unexpectedFrames"] = sorted(set(got) - set(w["requiredFrames"]))
        # ---- normalize condition A (STEP 17 reader, unchanged); B-3 chunking when the 25-frame dataset exceeds MAX_VALUES ----
        if len(parts) == 4:
            try:
                base_id = f"hycom-gofs31-53x-{wid.lower()}-15m"; version = f"{w['t0'][:13]}_{w['end'][:13]}.earthus1"; cite = f"{w['oceanBox']['south']:.2f}..{w['oceanBox']['north']:.2f} / {w['oceanBox']['west']:.2f}..{w['oceanBox']['east']:.2f}"
                grid_full, sources, _, meta = read_hycom_parts(parts, 15)
                values = meta["shape"][0] * meta["shape"][1] * meta["shape"][2] * 2
                nat = {"frames": meta["shape"][0], "shape": meta["shape"], "valuesCount": values, "cadenceSeconds": meta["cadenceSeconds"], "maskedNodes": meta["maskedNodes"], "uRange": meta["uRange"], "vRange": meta["vRange"], "timeStart": grid_full["timeUTC"][0], "timeEnd": grid_full["timeUTC"][-1], "fullLandMaskSha256": hashlib.sha256(canonical(grid_full["landMask"])).hexdigest()}
                if meta["shape"][0] != 25 or meta["cadenceSeconds"] != 10800 or grid_full["timeUTC"][0] != w["t0"] or grid_full["timeUTC"][-1] != w["end"]:
                    rec["reasons"].append("HYCOM window parts differ from 25 x 3 h over t0..t0+72h")
                out = DATA / "normalized"; out.mkdir(parents=True, exist_ok=True)
                if values <= 2_000_000:
                    ds, _, _ = build_dataset(base_id, version, parts, 15, cite, a17.ISSUED)
                    p = out / f"{wid}.hycom15m.dataset.json"; p.write_bytes(canonical(ds) + b"\n")
                    nat.update({"chunked": False, "file": str(p.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(p), "gridSha256": ds["manifest"]["sha256"], "sourceSha256": ds["manifest"]["sourceSha256"], "datasetId": ds["manifest"]["datasetId"], "version": version, "landMaskSha256": hashlib.sha256(canonical(ds["grid"]["landMask"])).hexdigest()})
                    chunks, union = bc.build_chunks(wid, f"eqtest-{wid.lower()}", rec["hycomWindowParts"], w["oceanBox"], t0); eq = bc.equivalence(chunks, ds)
                    nat["chunkEquivalenceSelfTest"] = {k: eq[k] for k in ("axesEqual", "landMaskEqual", "framesCompared", "framesEqual", "equivalent")}
                    grid_for_stencil = RegularGrid(ds)
                else:
                    chunks, union = bc.build_chunks(wid, base_id, rec["hycomWindowParts"], w["oceanBox"], t0)
                    nat.update({"chunked": True, "chunkRule": "STEP 20 B-3: chunk A parts [0,1] -> segment t0..t0+36h; chunk B parts [1,2,3] -> segment t0+36h..t0+72h; landMask = union over all 25 frames; values untouched", "chunks": {}, "landMaskSha256": hashlib.sha256(canonical(union)).hexdigest()})
                    for name, (ds, cm) in chunks.items():
                        p = out / f"{wid}.hycom15m.chunk{name}.dataset.json"; p.write_bytes(canonical(ds) + b"\n")
                        nat["chunks"][name] = {**cm, "file": str(p.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(p), "gridSha256": ds["manifest"]["sha256"], "sourceSha256": ds["manifest"]["sourceSha256"], "datasetId": ds["manifest"]["datasetId"]}
                    grid_for_stencil = RegularGrid(chunks["A"][0])
                stencil = []
                for did, lon, lat in unit["drifters"]:
                    try:
                        grid_for_stencil.velocity(utc_seconds(w["t0"]), lon, lat); stencil.append({"drifterId": did, "wet": True})
                    except ForcingBoundary as exc:
                        stencil.append({"drifterId": did, "wet": False, "status": exc.status})
                nat["releaseStencil"] = stencil
                if any(not s["wet"] for s in stencil):
                    rec["reasons"].append("release stencil not fully wet: " + ",".join(s["drifterId"] for s in stencil if not s["wet"]))
                rec["hycomNative3h"] = nat
            except Exception as exc:
                rec["reasons"].append("HYCOM reader/normalization: " + type(exc).__name__ + ": " + str(exc)[:300])
        else:
            rec["reasons"].append("HYCOM window part(s) not retrievable")
        if rec["missingRegisteredFrames"] or len(dparts) != 6:
            rec["reasons"].append(f"registered day frames missing: {len(rec['missingRegisteredFrames'])}")
        # ---- NCEP wind (STEP 17 verbatim) ----
        wparts = {}
        for var, name, url in a17.wind_parts(unit):
            path = folder / "ncep" / name; r = a17.fetch(url, path)
            entry = {"dataset": "NCEP-DOE Reanalysis 2 gaussian_grid", "product": var + ".10m", "filename": name, "query": url, **r}
            if path.exists():
                entry.update({"bytes": path.stat().st_size, "sha256": sha(path)}); wparts.setdefault(var, []).append((path, url))
            rec["ncep"].append(entry)
        if len(wparts.get("uwnd", [])) != 1 or len(wparts.get("vwnd", [])) != 1:
            rec["reasons"].append("NCEP wind part(s) not retrievable or split across years")
        else:
            try:
                (up, uu), (vp, vu) = wparts["uwnd"][0], wparts["vwnd"][0]
                wind, _ = build_ncep_r2_wind_dataset(up, vp, uu, vu, f"ncep-doe-r2-10m-wind-{wid.lower()}", f"{w['t0'][:13]}.earthus1", a17.ISSUED)
                times = wind["grid"]["timeUTC"]; need_s, need_e = (t0 - timedelta(hours=12)).strftime(FMT), (t0 + timedelta(hours=84)).strftime(FMT)
                if times[0] > need_s or times[-1] < need_e or wind["manifest"]["timeStepSeconds"] != 21600:
                    rec["reasons"].append("NCEP wind does not cover t0-12h..t0+84h at 6 h")
                field = WindField(wind); wst = []
                for did, lon, lat in unit["drifters"]:
                    try:
                        field.velocity(utc_seconds(w["t0"]), lon, lat); wst.append({"drifterId": did, "ok": True})
                    except ForcingBoundary as exc:
                        wst.append({"drifterId": did, "ok": False, "reason": getattr(exc, "reason", exc.status)})
                if any(not s["ok"] for s in wst):
                    rec["reasons"].append("wind stencil unavailable at release")
                wout = write_wind_dataset(wind, DATA / "normalized" / f"{wid}.ncep10m.wind.json")
                rec["wind"] = {"file": str(wout.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(wout), "gridSha256": wind["manifest"]["sha256"], "sourceSha256": wind["manifest"]["sourceSha256"], "frames": len(times), "timeStart": times[0], "timeEnd": times[-1], "releaseStencil": wst}
            except Exception as exc:
                rec["reasons"].append("NCEP reader/validation: " + type(exc).__name__ + ": " + str(exc)[:300])
        rec["status"] = "FORCING_BLOCKED" if rec["reasons"] else "ACQUIRED"
        manifest["windows"].append(rec)
        print(json.dumps({"window": wid, "status": rec["status"], "dayFrames": rec["acquiredDayFrames"], "missing": len(rec["missingRegisteredFrames"]), "chunked": rec.get("hycomNative3h", {}).get("chunked"), "values": rec.get("hycomNative3h", {}).get("valuesCount"), "reasons": rec["reasons"]}), flush=True)
    manifest["completedAtUTC"] = a17.now(); manifest["status"] = "ACQUIRED" if all(r["status"] == "ACQUIRED" for r in manifest["windows"]) else "PARTIAL"
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "windows": len(manifest["windows"])}))
    return 0 if manifest["status"] == "ACQUIRED" else 1


if __name__ == "__main__":
    raise SystemExit(main())

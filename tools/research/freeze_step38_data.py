"""STEP 38 — acquisition quality gate and DATA FREEZE (no scientific processing). From the acquisition manifest and the files on disk:
per window, the STEP 32 B2 checks (source identity, file integrity, coordinates incl. the longitude rule, time axis, variables, spatial and
temporal coverage, missing frames, units, release stencil, reproducibility = overlap frames of the two HYCOM layouts bitwise equal and the
reader re-run reproduces the recorded grid SHA), plus GLORYS (identity, coverage) and WW3 (identity, variables, units, monthly axis)
gates -> per window HYCOM_PASS / WINDOW_BLOCKED / FAIL and CANDIDATE_PASS / CANDIDATE_BLOCKED. Then writes the data-freeze manifest
classifying every artefact as A ORIGINAL SOURCE FILE, B DERIVED/REPACKAGED FILE (linked to the original hashes), C METADATA or
D ACQUISITION LOG, each with SHA-256 and bytes; originals are immutable from this point. No trajectory, error, delta, endpoint,
bootstrap, comparison or performance value is computed. Writes docs/research/step38-data-freeze-manifest.json."""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402
from research_runtime.netcdf_reader import read_hycom_parts  # noqa: E402
import build_step20_chunked_forcing as bc  # noqa: E402

PROTO, ACQ, M36 = D / "step38-source-acquisition-protocol.json", D / "step38-source-acquisition-manifest.json", D / "step36-cohort-extension-manifest.json"
OUT = D / "step38-data-freeze-manifest.json"
FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def frames_of(path):
    with netCDF4.Dataset(path) as d:
        times = [t.strftime(FMT) for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
        u, v = d["water_u"][:, 0], d["water_v"][:, 0]
        uf, vf = np.ma.filled(u.astype(float), np.nan), np.ma.filled(v.astype(float), np.nan); uf[np.ma.getmaskarray(u)] = np.nan; vf[np.ma.getmaskarray(v)] = np.nan
        return times, uf, vf, d["lat"][:].tolist(), d["lon"][:].tolist(), {"depth": d["depth"][:].tolist(), "units": (str(d["water_u"].units), str(d["water_v"].units)), "std": (str(getattr(d["water_u"], "standard_name", "")), str(getattr(d["water_v"], "standard_name", ""))), "dist": str(getattr(d, "distribution_statement", ""))}


def main():
    proto = load(PROTO); A = load(ACQ); m36 = load(M36)
    if A["protocolSha256"] != sha(PROTO) or proto["tools"]["tools/research/freeze_step38_data.py"] != sha(__file__) or A["cohortManifestSha256"] != sha(M36):
        raise SystemExit("STEP38_BLOCKED_IMMUTABILITY")
    if OUT.exists():
        raise SystemExit("STEP38_BLOCKED: freeze manifest exists; no overwrite")
    bc.DATA = ROOT / "data/research/step38/forcing"; mw = {w["windowId"]: w for w in m36["windows"]}
    ww3 = {f["month"]: f for f in A["ww3"]["files"]}; ww3ok = {}
    for ym, f in ww3.items():
        ok = f.get("status") == "ok" and (ROOT / f["file"]).exists() and sha(ROOT / f["file"]) == f["sha256"]
        md = f.get("metadata", {}); at = md.get("attributes", {})
        ww3ok[ym] = {"integrity": ok, "identity": "GLOBMULTI" in at.get("source", "") and at.get("product_version") == "1.0" and at.get("grid") == "glob_30m" and at.get("distribution_statement") == "No restrictions", "variables": all(v in md.get("variables", []) for v in ("uuss", "vuss")), "units": all(md.get("units", {}).get(v, "").replace(" ", "") in ("m/s", "ms-1") for v in ("uuss", "vuss")), "monthlyAxis": md.get("timeStart", "")[:7].replace("-", "") == ym}
        ww3ok[ym]["status"] = "PASS" if all(ww3ok[ym].values()) else "FAIL"
    windows = []; artefacts = []
    def art(cat, path, extra):
        p = ROOT / path; artefacts.append({"category": cat, "file": path, "sha256": sha(p), "bytes": p.stat().st_size, **extra})
    for rec in A["windows"]:
        wid = rec["windowId"]; w = mw[wid]; box = w["oceanBox"]; c = {k: True for k in ("sourceIdentity", "fileIntegrity", "coordinates", "longitudeRule", "timeAxis", "variables", "spatialCoverage", "temporalCoverage", "missingFrames", "units", "releaseStencil", "reproducibility")}; notes = []
        axes = None; day_frames = {}; win_frames = {}
        files = [(ROOT / "data/research/step38/forcing" / wid / "hycom" / e["filename"], e, "window") for e in rec["hycomWindowParts"]] + [(ROOT / "data/research/step38/forcing" / wid / "hycom-days" / e["filename"], e, "day") for e in rec["hycomDayParts"]]
        for path, e, kind in files:
            if "sha256" not in e or not path.exists() or sha(path) != e["sha256"] or path.stat().st_size != e["bytes"]:
                c["fileIntegrity"] = False; notes.append(f"integrity {e['filename']}"); continue
            art("A_ORIGINAL_SOURCE", str(path.relative_to(ROOT)).replace("\\", "/"), {"source": "HYCOM GOFS 3.1 GLBv0.08 expt_53.X 2010", "window": wid, "layout": kind, "retrievedAtUTC": e.get("retrievedAtUTC"), "url": e["query"]})
            if "expt_53.X/data/2010?" not in e["query"] or "vertCoord=15" not in e["query"] or "var=water_u&var=water_v" not in e["query"]:
                c["sourceIdentity"] = False; notes.append(f"query identity {e['filename']}")
            try:
                times, uf, vf, lat, lon, meta = frames_of(path)
            except Exception as exc:
                c["fileIntegrity"] = False; notes.append(f"unreadable {e['filename']}: {type(exc).__name__}"); continue
            if meta["depth"] != [15.0] or "Distribution unlimited" not in meta["dist"] or meta["std"] != ("eastward_sea_water_velocity", "northward_sea_water_velocity"):
                c["sourceIdentity"] = False; notes.append(f"identity attributes {e['filename']}")
            if meta["units"] != ("m/s", "m/s"):
                c["units"] = False
            if axes is None:
                axes = (lat, lon)
            elif (lat, lon) != axes:
                c["coordinates"] = False; notes.append(f"axes differ {e['filename']}")
            steps = {round(b - a, 4) for a, b in zip(lat, lat[1:])} | {round(b - a, 4) for a, b in zip(lon, lon[1:])}
            if any(abs(s - 0.08) > 0.0005 for s in steps):
                c["coordinates"] = False; notes.append("grid step not 0.08")
            for k, t in enumerate(times):
                if not np.isfinite(uf[k]).any() or not np.isfinite(vf[k]).any():
                    notes.append(f"frame entirely masked {t}"); continue
                (day_frames if kind == "day" else win_frames)[t] = (uf[k], vf[k])
            if kind == "day" and times != [f"{e['utcDay']}T{h:02d}:00:00Z" for h in range(0, 24, 3)]:
                c["timeAxis"] = False; notes.append(f"day axis {e['filename']} {len(times)} frames")
        if axes is not None:
            lat, lon = axes
            c["longitudeRule"] = (lon[0] < 0 or lon[-1] <= 180) and rec.get("coordinateRule", {}).get("result") == "PASS" and rec["coordinateRule"]["transformApplied"] is False
            c["spatialCoverage"] = lat[0] - 0.081 <= box["south"] and box["north"] <= lat[-1] + 0.081 and lon[0] - 0.081 <= box["west"] and box["east"] <= lon[-1] + 0.081
        else:
            c["spatialCoverage"] = False; c["longitudeRule"] = False
        t0 = datetime.strptime(w["start"], FMT).replace(tzinfo=timezone.utc); exp_win = [(t0 + timedelta(hours=3 * k)).strftime(FMT) for k in range(25)]
        req = [f"{d}T{h:02d}:00:00Z" for d in w["requiredUtcDays"] for h in range(0, 24, 3)]; missing = sorted(set(req) - set(day_frames))
        if sorted(win_frames) != exp_win:
            c["timeAxis"] = False; c["temporalCoverage"] = False; notes.append("window layout not 25 contiguous frames")
        if missing:
            c["temporalCoverage"] = False; c["missingFrames"] = False
        nat = rec.get("hycomNative3h", {}); wind = rec.get("wind", {})
        c["releaseStencil"] = bool(nat.get("releaseStencil")) and all(s["wet"] for s in nat.get("releaseStencil", [])) and bool(wind.get("releaseStencil")) and all(s["ok"] for s in wind.get("releaseStencil", []))
        overlap = [t for t in exp_win if t in day_frames and t in win_frames]; equal = sum(1 for t in overlap if np.array_equal(day_frames[t][0], win_frames[t][0], equal_nan=True) and np.array_equal(day_frames[t][1], win_frames[t][1], equal_nan=True))
        repro = {"overlapFrames": len(overlap), "overlapEqual": equal}
        try:
            parts = [(ROOT / "data/research/step38/forcing" / wid / "hycom" / e["filename"], e["query"]) for e in rec["hycomWindowParts"]]
            if nat.get("chunked"):
                chunks, _ = bc.build_chunks(wid, f"hycom-gofs31-53x-{wid.lower()}-15m", rec["hycomWindowParts"], box, t0); repro["readerReproduced"] = all(chunks[n][0]["manifest"]["sha256"] == nat["chunks"][n]["gridSha256"] for n in chunks)
            elif nat.get("file"):
                grid, _, _, meta = read_hycom_parts(parts, 15); repro["readerReproduced"] = hashlib.sha256(json.dumps(grid["landMask"], separators=(",", ":")).encode()).hexdigest() == nat["landMaskSha256"] and sha(ROOT / nat["file"]) == nat["fileSha256"] and load(ROOT / nat["file"])["manifest"]["sha256"] == nat["gridSha256"]
            else:
                repro["readerReproduced"] = False
        except Exception as exc:
            repro["readerReproduced"] = False; notes.append("reader re-run: " + type(exc).__name__)
        c["reproducibility"] = len(overlap) == 25 and equal == 25 and repro.get("readerReproduced", False)
        for e in rec["ncep"]:
            if "sha256" in e and (ROOT / "data/research/step38/forcing" / wid / "ncep" / e["filename"]).exists():
                art("A_ORIGINAL_SOURCE", f"data/research/step38/forcing/{wid}/ncep/{e['filename']}", {"source": "NCEP-DOE R2 10 m 6 h 2010", "window": wid, "retrievedAtUTC": e.get("retrievedAtUTC"), "url": e["query"]})
        for key, f in (("hycomNative3h", nat), ("wind", wind)):
            if f.get("file"):
                art("B_DERIVED_REPACKAGED", f["file"], {"window": wid, "derivedFromOriginals": f.get("derivedFromOriginals", []), "gridSha256": f.get("gridSha256"), "reader": "netcdf_reader.build_dataset" if key == "hycomNative3h" else "wind.build_ncep_r2_wind_dataset"})
            for n, ch in f.get("chunks", {}).items():
                art("B_DERIVED_REPACKAGED", ch["file"], {"window": wid, "chunk": n, "derivedFromOriginals": f.get("derivedFromOriginals", []), "gridSha256": ch["gridSha256"], "reader": "netcdf_reader.build_dataset + STEP 20 B-3 chunker"})
        g = rec.get("glorys", {}); gc = {"acquired": g.get("status") == "ok", "integrity": bool(g.get("file")) and (ROOT / g["file"]).exists() and sha(ROOT / g["file"]) == g.get("sha256"), "identity": g.get("requestedDepthMeters") == 15.81 and g.get("variables") == ["uo", "vo"] and "cmems_mod_glo_phy_my_0.083deg_P1D-m" in g.get("command", ""), "coverage": g.get("normalized", {}).get("areaInsideGrid") is True and g.get("normalized", {}).get("timeBracketsWindow") is True, "depthLevel": abs(float(g.get("normalized", {}).get("depthLevelMeters", 0) or 0) - 15.81007) < 1e-4}
        months = sorted({(t0 + timedelta(hours=3 * k)).strftime("%Y%m") for k in range(25)}); gc["ww3Months"] = {m: ww3ok.get(m, {}).get("status") for m in months}
        if gc["acquired"] and gc["integrity"]:
            art("A_ORIGINAL_SOURCE", g["file"], {"source": "GLORYS12V1 cmems_mod_glo_phy_my_0.083deg_P1D-m 15.81 m", "window": wid, "retrievedAtUTC": g.get("retrievedAtUTC"), "command": g.get("command")})
            if g.get("normalized", {}).get("file"):
                art("B_DERIVED_REPACKAGED", g["normalized"]["file"], {"window": wid, "derivedFromOriginals": [g["sha256"]], "gridSha256": g["normalized"]["gridSha256"], "reader": "glorys_reader_step25c.build_dataset"})
        hy = "WINDOW_BLOCKED" if missing else ("HYCOM_PASS" if all(c.values()) else "FAIL")
        cand = "CANDIDATE_PASS" if hy == "HYCOM_PASS" and all(gc[k] for k in ("acquired", "integrity", "identity", "coverage", "depthLevel")) and all(v == "PASS" for v in gc["ww3Months"].values()) else "CANDIDATE_BLOCKED"
        windows.append({"windowId": wid, "hycomStatus": hy, "candidateStatus": cand, "checks": c, "glorysChecks": gc, "missingRegisteredFrames": missing, "registeredFrames": len(req), "acquiredDayFrames": len(day_frames), "reproducibility": repro, "notes": notes[:20], "chunked": nat.get("chunked")})
        print(json.dumps({"window": wid, "hycom": hy, "candidate": cand, "fails": [k for k, v in c.items() if not v], "glorysFails": [k for k, v in gc.items() if v is False], "overlapEqual": equal}), flush=True)
    for ym, f in ww3.items():
        if f.get("status") == "ok":
            art("A_ORIGINAL_SOURCE", f["file"], {"source": "WW3 GLOB-30M CFSR uss", "month": ym, "retrievedAtUTC": f.get("retrievedAtUTC"), "url": f["url"]})
    for meta_file in ("docs/research/step38-source-acquisition-protocol.json", "docs/research/step38-source-acquisition-manifest.json", "docs/research/step37-experiment-preregistration-protocol.json", "docs/research/step36-cohort-extension-manifest.json"):
        art("C_METADATA", meta_file, {})
    freeze = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "acquisitionManifestSha256": sha(ACQ), "cohortManifestSha256": sha(M36), "tool": {"file": "tools/research/freeze_step38_data.py", "sha256": sha(__file__)}, "frozenAtUTC": datetime.now(timezone.utc).strftime(FMT),
              "windows": windows, "ww3": ww3ok, "summary": {"hycomPass": sum(1 for w in windows if w["hycomStatus"] == "HYCOM_PASS"), "windowBlocked": sum(1 for w in windows if w["hycomStatus"] == "WINDOW_BLOCKED"), "fail": sum(1 for w in windows if w["hycomStatus"] == "FAIL"), "candidatePass": sum(1 for w in windows if w["candidateStatus"] == "CANDIDATE_PASS"), "candidateBlocked": sum(1 for w in windows if w["candidateStatus"] == "CANDIDATE_BLOCKED")},
              "artefacts": artefacts, "artefactCounts": {cat: sum(1 for a in artefacts if a["category"] == cat) for cat in ("A_ORIGINAL_SOURCE", "B_DERIVED_REPACKAGED", "C_METADATA", "D_ACQUISITION_LOG")}, "totalBytes": {cat: sum(a["bytes"] for a in artefacts if a["category"] == cat) for cat in ("A_ORIGINAL_SOURCE", "B_DERIVED_REPACKAGED", "C_METADATA")}, "originalsImmutable": True, "scientificProcessing": False, "trajectoryComputed": False, "endpointComputed": False, "bootstrapRun": False}
    n = len(windows); freeze["status"] = "SOURCE_ACQUISITION_COMPLETE" if freeze["summary"]["hycomPass"] == n and freeze["summary"]["candidatePass"] == n else ("SOURCE_ACQUISITION_PARTIAL" if freeze["summary"]["hycomPass"] > 0 else "SOURCE_ACQUISITION_BLOCKED")
    freeze["artefacts"].append({"category": "D_ACQUISITION_LOG", "file": "docs/research/step38-source-acquisition-manifest.json", "sha256": sha(ACQ), "bytes": ACQ.stat().st_size, "note": "per-request acquisition log embedded in the acquisition manifest"}); freeze["artefactCounts"]["D_ACQUISITION_LOG"] = 1
    OUT.write_text(json.dumps(freeze, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": freeze["status"], **freeze["summary"], "artefacts": freeze["artefactCounts"], "bytes": freeze["totalBytes"]}))
    return 0 if freeze["status"] == "SOURCE_ACQUISITION_COMPLETE" else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""STEP 32 Phase B — B2 quality gate on the acquired HYCOM source (before any daily derivation or model run). Per window, from the raw
files and the acquisition manifest: 1 source identity (expt_53.X 2011 query, distribution statement, depth 15 m, standard names) ·
2 file integrity (SHA-256 / bytes re-hashed, readable) · 3 coordinates (identical 0.08 deg axes across all ten files, cover the ocean box) ·
4 time axis (day files exactly 00..21Z of their day; window parts contiguous 25 x 3 h t0..t0+72h) · 5 variables · 6 spatial coverage ·
7 temporal coverage (all 48 registered frames present) · 8 missing frames (absent or entirely masked frame) · 9 units m/s · 10 release
stencil (ocean and wind) · 11 reproducibility (overlapping frames of the two acquisitions bitwise equal; reader re-run reproduces the
normalized grid SHA). Status per window: PASS / WINDOW_BLOCKED (any registered frame missing) / FAIL (identity, integrity, coordinate,
unit or stencil failure). BLOCKED is never converted to PASS. Writes docs/research/step32-forcing-quality.json (or --out DIR)."""
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

MATRIX, ACQ = D / "step32-temporal-experiment-matrix.json", D / "step32-forcing-acquisition-manifest.json"
OUT = D / "step32-forcing-quality.json"
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
        return times, uf, vf, d["lat"][:].tolist(), d["lon"][:].tolist(), {"depth": d["depth"][:].tolist(), "units": (str(d["water_u"].units), str(d["water_v"].units)), "std": (str(getattr(d["water_u"], "standard_name", "")), str(getattr(d["water_v"], "standard_name", ""))), "dist": str(getattr(d, "distribution_statement", "")), "cal": str(d["time"].calendar)}


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) / OUT.name if "--out" in argv else OUT
    M = load(MATRIX); A = load(ACQ)
    if A["experimentMatrixSha256"] != sha(MATRIX):
        raise SystemExit("STEP32_BLOCKED_IMMUTABILITY: acquisition manifest not bound to the locked matrix")
    mw = {w["windowId"]: w for w in M["windows"]}; report = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B2", "acquisitionManifestSha256": sha(ACQ), "experimentMatrixSha256": sha(MATRIX), "tool": {"file": "tools/research/check_step32_forcing.py", "sha256": sha(__file__)}, "windows": []}
    bc.DATA = ROOT / "data/research/step32/forcing"
    for rec in A["windows"]:
        wid = rec["windowId"]; w = mw[wid]; c = {k: True for k in ("sourceIdentity", "fileIntegrity", "coordinates", "timeAxis", "variables", "spatialCoverage", "temporalCoverage", "missingFrames", "units", "releaseStencil", "reproducibility")}; notes = []
        axes = None; day_frames = {}; win_frames = {}; blocked = []
        files = [(ROOT / "data/research/step32/forcing" / wid / "hycom" / e["filename"], e, "window") for e in rec["hycomWindowParts"]] + [(ROOT / "data/research/step32/forcing" / wid / "hycom-days" / e["filename"], e, "day") for e in rec["hycomDayParts"]]
        for path, e, kind in files:
            if "sha256" not in e or not path.exists():
                c["fileIntegrity"] = False; notes.append(f"missing file {e['filename']}"); continue
            if sha(path) != e["sha256"] or path.stat().st_size != e["bytes"]:
                c["fileIntegrity"] = False; notes.append(f"SHA/bytes mismatch {e['filename']}")
            if "expt_53.X/data/2011?" not in e["query"] or "vertCoord=15" not in e["query"] or "var=water_u&var=water_v" not in e["query"]:
                c["sourceIdentity"] = False; notes.append(f"query identity {e['filename']}")
            try:
                times, uf, vf, lat, lon, meta = frames_of(path)
            except Exception as exc:
                c["fileIntegrity"] = False; notes.append(f"unreadable {e['filename']}: {type(exc).__name__}"); continue
            if meta["depth"] != [15.0] or "Distribution unlimited" not in meta["dist"] or meta["std"] != ("eastward_sea_water_velocity", "northward_sea_water_velocity") or meta["cal"] not in ("gregorian", "standard"):
                c["sourceIdentity"] = False; notes.append(f"identity attributes {e['filename']}")
            if meta["units"] != ("m/s", "m/s"):
                c["units"] = False; notes.append(f"units {e['filename']}")
            if axes is None:
                axes = (lat, lon)
            elif (lat, lon) != axes:
                c["coordinates"] = False; notes.append(f"axes differ {e['filename']}")
            steps = {round(b - a, 4) for a, b in zip(lat, lat[1:])} | {round(b - a, 4) for a, b in zip(lon, lon[1:])}
            if any(abs(s - 0.08) > 0.0005 for s in steps):
                c["coordinates"] = False; notes.append(f"grid step not 0.08: {sorted(steps)[:3]}")
            for k, t in enumerate(times):
                fr = (uf[k], vf[k])
                if not np.isfinite(uf[k]).any() or not np.isfinite(vf[k]).any():
                    blocked.append(t); notes.append(f"frame entirely masked {t}")
                (day_frames if kind == "day" else win_frames)[t] = fr
            if kind == "day":
                exp = [f"{e['utcDay']}T{h:02d}:00:00Z" for h in range(0, 24, 3)]
                if times != exp:
                    c["timeAxis"] = False; notes.append(f"day file time axis {e['filename']}: {len(times)} frames")
        if axes is not None:
            lat, lon = axes; b = w["oceanBox"]
            if not (lat[0] - 0.081 <= b["south"] and b["north"] <= lat[-1] + 0.081 and lon[0] - 0.081 <= b["west"] and b["east"] <= lon[-1] + 0.081):
                c["spatialCoverage"] = False; notes.append("axes do not cover the ocean box")
        else:
            c["spatialCoverage"] = False
        t0 = datetime.strptime(w["t0"], FMT).replace(tzinfo=timezone.utc); exp_win = [(t0 + timedelta(hours=3 * k)).strftime(FMT) for k in range(25)]
        if sorted(win_frames) != exp_win:
            c["timeAxis"] = False; notes.append("window parts are not 25 contiguous 3 h frames")
        missing = sorted(set(w["requiredFrames"]) - set(day_frames)) + [t for t in blocked if t in w["requiredFrames"]]
        if missing:
            c["temporalCoverage"] = False; c["missingFrames"] = False
        if not all(t in win_frames for t in exp_win):
            c["temporalCoverage"] = False
        c["variables"] = c["variables"] and all("water_u" in e.get("metadata", {}).get("variables", []) and "water_v" in e.get("metadata", {}).get("variables", []) for _, e, _ in files if "metadata" in e)
        nat = rec.get("hycomNative3h", {}); wind = rec.get("wind", {})
        c["releaseStencil"] = bool(nat.get("releaseStencil")) and all(s["wet"] for s in nat.get("releaseStencil", [])) and bool(wind.get("releaseStencil")) and all(s["ok"] for s in wind.get("releaseStencil", []))
        # reproducibility: overlapping frames bitwise equal across the two acquisitions; reader re-run reproduces the recorded grid SHA
        overlap = [t for t in exp_win if t in day_frames and t in win_frames]; equal = sum(1 for t in overlap if np.array_equal(day_frames[t][0], win_frames[t][0], equal_nan=True) and np.array_equal(day_frames[t][1], win_frames[t][1], equal_nan=True))
        repro = {"overlapFrames": len(overlap), "overlapEqual": equal}
        try:
            parts = [(ROOT / "data/research/step32/forcing" / wid / "hycom" / e["filename"], e["query"]) for e in rec["hycomWindowParts"]]
            if nat.get("chunked"):
                chunks, union = bc.build_chunks(wid, f"hycom-gofs31-53x-{wid.lower()}-15m", rec["hycomWindowParts"], w["oceanBox"], t0)
                repro["readerRerun"] = {n: chunks[n][0]["manifest"]["sha256"] == nat["chunks"][n]["gridSha256"] for n in chunks}; repro["readerReproduced"] = all(repro["readerRerun"].values())
            else:
                grid, _, _, meta = read_hycom_parts(parts, 15); repro["readerReproduced"] = hashlib.sha256(json.dumps(grid["landMask"], separators=(",", ":")).encode()).hexdigest() == nat.get("landMaskSha256") and meta["shape"][0] == 25
                ds = load(ROOT / nat["file"]); repro["normalizedFileSha"] = sha(ROOT / nat["file"]) == nat["fileSha256"]; repro["gridShaRecorded"] = ds["manifest"]["sha256"] == nat["gridSha256"]; repro["readerReproduced"] = repro["readerReproduced"] and repro["normalizedFileSha"] and repro["gridShaRecorded"]
        except Exception as exc:
            repro["readerReproduced"] = False; notes.append("reader re-run: " + type(exc).__name__ + ": " + str(exc)[:200])
        c["reproducibility"] = len(overlap) == 25 and equal == 25 and repro.get("readerReproduced", False)
        fails = [k for k, v in c.items() if not v]
        status = "WINDOW_BLOCKED" if missing else ("FAIL" if fails else "PASS")
        report["windows"].append({"windowId": wid, "status": status, "checks": c, "missingRegisteredFrames": missing, "registeredFrames": len(w["requiredFrames"]), "acquiredDayFrames": len(day_frames), "windowFrames": len(win_frames), "reproducibility": repro, "notes": notes[:20], "acquisitionStatus": rec["status"], "chunked": nat.get("chunked")})
        print(json.dumps({"window": wid, "status": status, "fails": fails, "missing": len(missing), "overlapEqual": equal}), flush=True)
    report["summary"] = {s: sum(1 for w in report["windows"] if w["status"] == s) for s in ("PASS", "WINDOW_BLOCKED", "FAIL")}; report["status"] = "PASS" if report["summary"]["PASS"] == len(report["windows"]) else ("PARTIAL" if report["summary"]["PASS"] else "FAIL")
    out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], **report["summary"]}))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())

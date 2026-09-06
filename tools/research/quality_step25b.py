"""STEP 25B — GLORYS quality gates G1–G11 (deterministic; `--out DIR` for the reproducibility re-run). Reads the acquisition manifest and
any acquired NetCDF files (netCDF4 from the research-runtime .deps, read-only). With no acquired files (CREDENTIALS_REQUIRED) every
gate is NOT_EVALUATED and every window is NOT_ACQUIRED; nothing is filled, interpolated or substituted. MODEL_RUN = FORBIDDEN."""
import csv
import hashlib
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
PROTO = ROOT / "docs/research/step25b-glorys-acquisition-protocol.json"
MANIFEST = ROOT / "docs/research/step25b-glorys-acquisition-manifest.json"
ACCESS = ROOT / "docs/research/step25b-glorys-access-status.json"
GATES = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def epoch(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def assess(path, w, depth_expected):
    import netCDF4, numpy as np
    r = {"file": str(Path(path).relative_to(ROOT)).replace("\\", "/"), "sha256": sha(path), "bytes": Path(path).stat().st_size}
    with netCDF4.Dataset(path) as ds:
        lon = np.array(ds.variables["longitude"][:], float); lat = np.array(ds.variables["latitude"][:], float)
        t = ds.variables["time"]; times = [datetime(v.year, v.month, v.day, v.hour, v.minute, v.second, tzinfo=timezone.utc).timestamp() for v in netCDF4.num2date(t[:], t.units, calendar=getattr(t, "calendar", "standard"))]
        dep = [float(x) for x in np.array(ds.variables["depth"][:]).ravel()] if "depth" in ds.variables else []
        r["G3"] = bool(np.all(np.diff(lon) > 0) and np.all(np.diff(lat) > 0) and np.allclose(np.diff(lon), np.diff(lon)[0], atol=1e-4) and np.allclose(np.diff(lat), np.diff(lat)[0], atol=1e-4) and lat.min() >= -90 and lat.max() <= 90)
        d = np.diff(times); r["G4"] = bool(len(times) >= 2 and np.all(d > 0) and np.allclose(d, 86400))
        r["timestamps"] = [datetime.fromtimestamp(x, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") for x in times]
        r["G5"] = all(v in ds.variables for v in ("uo", "vo")) and all(ds.variables[v].ndim == 4 for v in ("uo", "vo") if v in ds.variables)
        r["units"] = {v: getattr(ds.variables[v], "units", None) for v in ("uo", "vo") if v in ds.variables}; r["G9"] = all((u or "").replace(" ", "") in ("ms-1", "m/s") for u in r["units"].values()) and bool(r["units"])
        r["depthLevels"] = dep; r["depthNative"] = len(dep) == 1 and abs(dep[0] - depth_expected) < 0.05
        box = w["oceanBox"]; r["G6"] = bool(lon.min() <= box["west"] and box["east"] <= lon.max() and lat.min() <= box["south"] and box["north"] <= lat.max())
        t0, t1 = epoch(w["t0"]), epoch(w["end"]); r["G7"] = any(x <= t0 for x in times) and any(x >= t1 for x in times) and all(b - a == 86400 for a, b in zip(times, times[1:]))
        r["missingSourceFrames"] = [] if r["G7"] else ["daily frame(s) missing or gap in bracketing range"]
        if r["G5"] and r["G6"]:
            u = ds.variables["uo"][:]; v = ds.variables["vo"][:]
            lonsel = np.where((lon >= box["west"]) & (lon <= box["east"]))[0]; latsel = np.where((lat >= box["south"]) & (lat <= box["north"]))[0]
            sub = np.ma.getmaskarray(u[:, 0][:, latsel][:, :, lonsel]) | np.ma.getmaskarray(v[:, 0][:, latsel][:, :, lonsel]); r["missingFractionBox"] = float(sub.mean()); r["G8"] = True
            ok = True
            for drf in w["releasePositions"]:
                i = int(np.searchsorted(lon, drf["lon"])); j = int(np.searchsorted(lat, drf["lat"])); ii = [max(0, i - 1), min(len(lon) - 1, i)]; jj = [max(0, j - 1), min(len(lat) - 1, j)]
                for ti in (max(k for k, x in enumerate(times) if x <= t0), min(k for k, x in enumerate(times) if x >= t1)) if r["G7"] else ():
                    for var in (u, v):
                        for a in jj:
                            for b in ii:
                                if np.ma.is_masked(var[ti, 0, a, b]):
                                    ok = False
            r["G10"] = ok if r["G7"] else None
        else:
            r["missingFractionBox"] = None; r["G8"] = None; r["G10"] = None
    return r


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    proto = load(PROTO); m = load(MANIFEST); acc = load(ACCESS)
    depth = proto["depth"]["nearestNativeLevelMeters"]; windows = proto["windows"]; per = {x["windowId"]: x for x in m.get("windows", [])}
    results = []; matrix = []
    for w in windows:
        f = per.get(w["windowId"])
        if not f or f.get("status") != "ok":
            results.append({"windowId": w["windowId"], "status": "NOT_ACQUIRED", "reason": f.get("status") if f else m.get("reason", "not acquired"), "gates": {g: "NOT_EVALUATED" for g in GATES}})
            matrix.append([w["windowId"], w["role"], "NOT_ACQUIRED", "N/A", "N/A", "N/A", "N/A", "NOT_ACQUIRED"]); continue
        path = ROOT / f["file"]; g2 = path.exists() and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"]
        r = assess(path, w, depth) if g2 else {}
        gates = {"G1": "PASS" if m["product"]["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" else "FAIL", "G2": "PASS" if g2 else "FAIL", "G3": "PASS" if r.get("G3") else "FAIL", "G4": "PASS" if r.get("G4") else "FAIL", "G5": "PASS" if r.get("G5") else "FAIL",
                 "G6": "PASS" if r.get("G6") else "FAIL", "G7": "PASS" if r.get("G7") else "FAIL", "G8": "PASS" if r.get("G8") else "FAIL", "G9": "PASS" if r.get("G9") else "FAIL", "G10": "PASS" if r.get("G10") else "FAIL", "G11": "PENDING_VALIDATOR"}
        window_status = "DATASET_BLOCKED" if any(gates[g] == "FAIL" for g in GATES[:10]) else "WINDOW_PASS"
        if not r.get("G7"):
            window_status = "DATASET_BLOCKED"
        results.append({"windowId": w["windowId"], "status": window_status, "gates": gates, "depthNative15m": r.get("depthNative"), "detail": r})
        matrix.append([w["windowId"], w["role"], gates["G6"], gates["G7"], r.get("missingFractionBox"), gates["G10"], f"{gates['G4']} depth {r.get('depthLevels')}", window_status])
    n_pass = sum(1 for x in results if x["status"] == "WINDOW_PASS"); n_acq = sum(1 for x in results if x["status"] != "NOT_ACQUIRED")
    if acc["accessStatus"] != "AUTHORIZED":
        status = "STEP25B_CREDENTIALS_REQUIRED"
    elif n_acq == 0:
        status = "STEP25B_GLORYS_BLOCKED"
    elif any(x["status"] == "DATASET_BLOCKED" for x in results) or n_pass < 7:
        status = "STEP25B_PARTIAL_COVERAGE" if n_pass > 0 else "STEP25B_DATA_QUALITY_FAILED"
    else:
        status = "STEP25B_GLORYS_READY_FOR_TEST"
    paired = [x["windowId"] for x in results if x["status"] == "WINDOW_PASS" and x["windowId"] != "KE-H2"]
    gates_doc = {"ruleId": proto["ruleId"], "accessStatus": acc["accessStatus"], "depthRule": proto["depth"], "gateDefinitions": proto["gates"], "windows": results, "windowsPass": n_pass, "windowsAcquired": n_acq, "keH2": next((x["status"] for x in results if x["windowId"] == "KE-H2"), None),
                 "test02Eligibility": {"status": status, "pairedWindowsEligible": paired, "acceptedForTestMeaning": "technically eligible for the preregistered TEST-02; NOT 'better than HYCOM'"}, "substitutionPerformed": False, "interpolationPerformed": False, "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0}
    (out / "step25b-glorys-quality-gates.json").write_bytes((json.dumps(gates_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(["windowId", "role", "G6_spatial", "G7_temporal", "missingFractionBox", "G10_releaseStencil", "timeAxisDepth", "status"]); wr.writerows(matrix)
    (out / "step25b-glorys-coverage-matrix.csv").write_bytes(buf.getvalue().encode("utf-8"))
    summary = {"ruleId": proto["ruleId"], "status": status, "accessStatus": acc["accessStatus"], "toolbox": acc["tool"], "windowsAcquired": n_acq, "windowsPass": n_pass, "pairedWindowsEligible": paired, "keH2GlorysCoverageFact": gates_doc["keH2"], "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "trajectoryCount": 0, "frozenAlpha": 0.002, "comparisonAlpha": 0.0,
               "statements": ["STEP25B performs data acquisition and quality validation only.", "STEP25A experimental design remains unchanged.", "No model performance result is generated.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "GLORYS acceptance for TEST-02 does not imply superiority over HYCOM."], "interpretation": "DATA ACQUISITION / QUALITY ASSESSMENT ONLY"}
    (out / "step25b-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": status, "windowsAcquired": n_acq, "windowsPass": n_pass}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

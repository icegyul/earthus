"""STEP 27C — quality gates G1–G11 for the D20 condition x window (same logic as the locked STEP 27B tool; paths differ) on the newly acquired native-level GLORYS files, plus the depth
identity gate (returned native level within 0.01 m of the protocol's expected nearest native level; the stored value is
authoritative). Gate logic G3–G10 is the locked STEP 25B assess() (quality_step25b.py, imported read-only) applied at the acquired
depth. D15 is never re-read from new data; its STEP 25B file SHAs are re-verified unchanged. Deterministic; `--out DIR` for the
independent re-run. MODEL_RUN = FORBIDDEN."""
import csv
import hashlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); sys.path.insert(0, str(ROOT / "tools/research"))
import quality_step25b as q25  # noqa: E402  (locked STEP 25B gate implementation, read-only use)

PROTO = ROOT / "docs/research/step27c-d20-acquisition-protocol.json"
MANIFEST = ROOT / "docs/research/step27c-d20-acquisition-manifest.json"
ACCESS = ROOT / "docs/research/step27c-d20-access-status.json"
M25B = ROOT / "docs/research/step25b-glorys-acquisition-manifest.json"
GATES = q25.GATES
DEPTH_TOL = 0.01


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    proto = load(PROTO); m = load(MANIFEST); acc = load(ACCESS); m25b = load(M25B)
    d15_unchanged = all(sha(ROOT / w["file"]) == w["sha256"] for w in m25b["windows"] if w["status"] == "ok")
    m27b = load(ROOT / "docs/research/step27-depth-acquisition-manifest.json"); d0510_unchanged = all(sha(ROOT / x["file"]) == x["sha256"] for d in m27b["depths"] for x in d["windows"] if x["status"] == "ok")
    depths_out = []; matrix = []
    for cond in proto["depthConditions"]:
        rec = next(d for d in m["depths"] if d["id"] == cond["id"])
        entry = {"id": cond["id"], "targetMeters": cond["targetMeters"], "expectedNativeLevelMeters": cond["expectedNativeLevelMeters"], "acquisitionStatus": rec["acquisitionStatus"], "windows": []}
        if rec["acquisitionStatus"] != "ACQUIRE":
            entry.update({"status": cond["blockedStatus"], "reason": rec.get("reason")})
            for w in proto["windows"]:
                entry["windows"].append({"windowId": w["windowId"], "status": "NOT_ACQUIRED", "gates": {g: "NOT_EVALUATED" for g in GATES}, "depthIdentity": "NOT_EVALUATED"})
                matrix.append([cond["id"], w["windowId"], w["role"], "N/A", "NOT_ACQUIRED", "N/A", "N/A", "N/A", "N/A", "NOT_ACQUIRED"])
            depths_out.append(entry); continue
        per = {x["windowId"]: x for x in rec["windows"]}; levels = set()
        for w in proto["windows"]:
            f = per.get(w["windowId"])
            if not f or f.get("status") != "ok":
                entry["windows"].append({"windowId": w["windowId"], "status": "NOT_ACQUIRED", "reason": f.get("status") if f else "missing", "gates": {g: "NOT_EVALUATED" for g in GATES}, "depthIdentity": "NOT_EVALUATED"})
                matrix.append([cond["id"], w["windowId"], w["role"], "N/A", "NOT_ACQUIRED", "N/A", "N/A", "N/A", "N/A", "NOT_ACQUIRED"]); continue
            path = ROOT / f["file"]; g2 = path.exists() and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"]
            lv = f["returnedDepthLevelsMeters"]; ident = len(lv) == 1 and abs(lv[0] - cond["expectedNativeLevelMeters"]) <= DEPTH_TOL
            levels.add(round(lv[0], 6) if lv else None)
            r = q25.assess(path, w, lv[0]) if (g2 and lv) else {}
            gates = {"G1": "PASS" if m["product"]["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and m["product"]["datasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" else "FAIL", "G2": "PASS" if g2 else "FAIL"}
            for g in ("G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10"):
                gates[g] = "PASS" if r.get(g) else "FAIL"
            gates["G11"] = "PENDING_VALIDATOR"
            ws = "DEPTH_IDENTITY_FAIL" if not ident else ("DATASET_BLOCKED" if not r.get("G7") else ("DEPTH_SPECIFIC_FORCING_UNAVAILABLE" if not r.get("G10") else ("DATASET_BLOCKED" if any(gates[g] == "FAIL" for g in GATES[:10]) else "WINDOW_PASS")))
            entry["windows"].append({"windowId": w["windowId"], "role": w["role"], "status": ws, "gates": gates, "depthIdentity": "PASS" if ident else "FAIL", "returnedDepthLevelsMeters": lv, "detail": r})
            matrix.append([cond["id"], w["windowId"], w["role"], lv[0] if lv else "N/A", "PASS" if ident else "FAIL", gates["G6"], gates["G7"], r.get("missingFractionBox"), gates["G10"], ws])
        eligible = [x["windowId"] for x in entry["windows"] if x["status"] == "WINDOW_PASS" and x["windowId"] != "KE-H2"]
        paired = [w["windowId"] for w in proto["windows"] if w["windowId"] != "KE-H2"]
        entry.update({"returnedNativeLevelsMeters": sorted(x for x in levels if x is not None), "actualNativeLevelMeters": sorted(levels)[0] if len(levels) == 1 and None not in levels else None, "pairedWindowsPass": eligible,
                      "status": "DEPTH_IDENTITY_FAIL" if any(x["status"] == "DEPTH_IDENTITY_FAIL" for x in entry["windows"]) else ("DEPTH_READY" if len(eligible) == len(paired) else ("DEPTH_PARTIAL_COVERAGE" if eligible else "DEPTH_QUALITY_FAILED"))})
        depths_out.append(entry)
    ready = [d["id"] for d in depths_out if d["status"] == "DEPTH_READY"]; missing = [c["id"] for c in proto["depthConditions"]]
    if acc["accessStatus"] != "AUTHORIZED":
        status = "STEP27C_CREDENTIALS_REQUIRED"
    elif not (d15_unchanged and d0510_unchanged):
        status = "STEP27C_DATA_QUALITY_FAILED"
    elif any(d["status"] == "DEPTH_IDENTITY_FAIL" for d in depths_out):
        status = "STEP27C_DEPTH_IDENTITY_FAILED"
    elif len(ready) == len(missing):
        status = "STEP27C_D20_READY"
    elif ready:
        status = "STEP27C_PARTIAL_COVERAGE"
    else:
        status = "STEP27C_DATA_QUALITY_FAILED"
    gates_doc = {"ruleId": proto["ruleId"], "accessStatus": acc["accessStatus"], "depthIdentityToleranceMeters": DEPTH_TOL, "gateImplementation": {"file": "tools/research/quality_step25b.py", "sha256": sha(ROOT / "tools/research/quality_step25b.py")}, "depths": depths_out, "d15": {"unchanged": d15_unchanged, "levelMeters": 15.81007, "reacquired": False}, "d05d10": {"unchanged": d0510_unchanged, "reacquired": False, "levelsMeters": [5.078224, 9.572997]},
                 "status": status, "substitutionPerformed": False, "interpolationPerformed": False, "verticalInterpolation": False, "depthSelection": False, "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0}
    (out / "step27c-d20-quality-gates.json").write_bytes((json.dumps(gates_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(["depth", "windowId", "role", "returnedLevelMeters", "depthIdentity", "G6_spatial", "G7_temporal", "missingFractionBox", "G10_releaseStencil", "status"]); wr.writerows(matrix)
    (out / "step27c-d20-coverage-matrix.csv").write_bytes(buf.getvalue().encode("utf-8"))
    summary = {"ruleId": proto["ruleId"], "status": status, "accessStatus": acc["accessStatus"], "depths": {d["id"]: {"status": d["status"], "actualNativeLevelMeters": d.get("actualNativeLevelMeters"), "expectedNativeLevelMeters": d["expectedNativeLevelMeters"], "pairedWindowsPass": d.get("pairedWindowsPass", []), "reason": d.get("reason")} for d in depths_out},
               "d15": gates_doc["d15"], "d05d10": gates_doc["d05d10"], "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "trajectoryCount": 0, "newObservations": 0, "verticalInterpolation": False, "depthSelection": False, "alpha": 0.002, "alphaModified": False, "statements": proto["requiredStatements"], "interpretation": "DATA ACQUISITION / QUALITY ASSESSMENT ONLY"}
    (out / "step27c-d20-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": status, "depths": {d["id"]: d["status"] for d in depths_out}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

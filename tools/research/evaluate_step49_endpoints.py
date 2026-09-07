"""STEP 49 - endpoint RAW MATERIAL only, for the locked STEP 47 validation-extension cohort.
Per drifter i and horizon h in 24/48/72 h: E_A,i(h), E_B,i(h), E_C,i(h) = haversine(model position at exactly t0+h, observed position at
exactly t0+h), R = 6371008.8 m, km; delta_i(h) = E_C,i(h) - E_A,i(h); delta_BA,i(h) = E_B,i(h) - E_A,i(h). Exact drifter_id + exact UTC
timestamp pairing; NOT_AVAILABLE is never imputed, substituted or removed. Per window and horizon the A/B/C valid counts and the paired
C-A count are reported, plus the valid-window count under the frozen STEP 46 definition (a window with >= 1 valid C-A pair at 72 h).
DELIBERATELY NOT COMPUTED HERE: Theta_validation, any descriptive label, any bootstrap, any interval, any hypothesis decision. STEP 49 is
execution only; the preregistered aggregation and uncertainty belong to the next step. Helpers (trajectory position parsing, haversine) are
imported unchanged from the frozen STEP 39 evaluator. Writes data/research/step49/step49-endpoint-raw.{csv,json} (`--out DIR` for replay)."""
import csv
import hashlib
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research"))
import evaluate_step39 as E39  # noqa: E402  (positions / haversine / helpers, unchanged)

BR = ROOT / "data/research/step49/bridge"
COHORT, RUNS_T, RUNS_C = BR / "step49-cohort-matrix.json", ROOT / "data/research/step49/step49-temporal-run-manifest.json", ROOT / "data/research/step49/step49-candidate-run-manifest.json"
OBS_DIR = ROOT / "data/research/step15/noaa-gdp-hourly-qc"
OUT = ROOT / "data/research/step49"
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    out.mkdir(parents=True, exist_ok=True)
    M, RT, RC = load(COHORT), load(RUNS_T), load(RUNS_C)
    if RT["status"] != "STEP32_RUNS_PASS" or RC["status"] != "STEP32_RUNS_PASS" or RT["conditions"] != ["A", "B"] or RC["conditions"] != ["C"]:
        print(json.dumps({"status": "EVALUATION_BLOCKED", "reason": [RT.get("status"), RC.get("status")]})); return 2
    model, inputs, terminal = {}, [], {}
    for r in RT["runs"] + RC["runs"]:
        if r.get("status") != "COMPLETED":
            print(json.dumps({"status": "EVALUATION_BLOCKED_RUN", "runId": r.get("runId"), "runStatus": r.get("status")})); return 2
        actual = sha(ROOT / r["trajectoriesFile"])
        inputs.append({"runId": r["runId"], "window": r["windowId"], "condition": r["condition"], "file": r["trajectoriesFile"],
                       "expected": r["trajectoriesSha256"], "actual": actual, "verified": actual == r["trajectoriesSha256"],
                       "finalStatusCounts": r["finalStatusCounts"]})
        for e in r["endpoints72h"]:
            terminal[(r["windowId"], e["drifterId"], r["condition"])] = e["finalStatus"]
        for did, pts in E39.positions(ROOT / r["trajectoriesFile"]).items():
            model.setdefault((r["windowId"], did), {})[r["condition"]] = pts
    if not all(x["verified"] for x in inputs):
        print(json.dumps({"status": "EVALUATION_BLOCKED_INPUT_INTEGRITY"})); return 2
    rows, obs_files, windows_out = [], {}, []
    for w in M["windows"]:
        wid = w["windowId"]
        t0 = datetime.strptime(w["start"], FMT).replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        tsd = {h: (t0 + timedelta(hours=h)).strftime(FMT) for h in H}
        obs = {}
        for path in sorted(OBS_DIR.glob(f"{w['region']}-{w['start'][:4]}-q*.csv")):
            obs_files[str(path.relative_to(ROOT)).replace("\\", "/")] = sha(path)
            with open(path, encoding="utf-8", newline="") as fh:
                reader = csv.reader(fh); next(reader); next(reader)
                for r in reader:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], FMT).replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        counts = {h: {"A": 0, "B": 0, "C": 0, "pairedCA": 0, "pairedBA": 0} for h in H}
        for did in sorted(w["drifterIds"]):
            mm = model.get((wid, did), {}); o = obs.get(did, {})
            rec = {"window": wid, "region": w["region"], "drifter_id": did}
            for h in H:
                pa, pb, pc, ob = mm.get("A", {}).get(tsd[h]), mm.get("B", {}).get(tsd[h]), mm.get("C", {}).get(tsd[h]), o.get(tsd[h])
                ea = E39.hav(*pa, *ob) if pa and ob else NA
                eb = E39.hav(*pb, *ob) if pb and ob else NA
                ec = E39.hav(*pc, *ob) if pc and ob else NA
                rec[f"error_A_{h}h"] = E39.r3(ea); rec[f"error_B_{h}h"] = E39.r3(eb); rec[f"error_C_{h}h"] = E39.r3(ec)
                rec[f"delta_CA_{h}h"] = E39.r3(ec - ea) if NA not in (ea, ec) else NA
                rec[f"delta_BA_{h}h"] = E39.r3(eb - ea) if NA not in (ea, eb) else NA
                rec[f"observationPresent_{h}h"] = bool(ob)
                counts[h]["A"] += ea != NA; counts[h]["B"] += eb != NA; counts[h]["C"] += ec != NA
                counts[h]["pairedCA"] += rec[f"delta_CA_{h}h"] != NA; counts[h]["pairedBA"] += rec[f"delta_BA_{h}h"] != NA
            for cond in ("A", "B", "C"):
                rec[f"finalStatus_{cond}"] = terminal.get((wid, did, cond))
            if rec["delta_CA_72h"] != NA:
                rec["invalidReason_CA_72h"] = None
            elif not rec["observationPresent_72h"]:
                rec["invalidReason_CA_72h"] = "OBSERVATION_ABSENT"
            else:
                missing = [c for c in ("A", "C") if rec[f"error_{c}_72h"] == NA]
                rec["invalidReason_CA_72h"] = "; ".join(f"{c}:{terminal.get((wid, did, c)) or 'MODEL_POSITION_ABSENT'}" for c in missing)
            rec["missingSide_CA_72h"] = None if rec["delta_CA_72h"] != NA else ",".join(c for c in ("A", "C") if rec[f"error_{c}_72h"] == NA) or "OBSERVATION"
            rows.append(rec)
        windows_out.append({"windowId": wid, "region": w["region"], "start": w["start"], "end": w["end"],
                            "registeredDrifters": len(w["drifterIds"]), "perHorizon": {f"{h}h": counts[h] for h in H},
                            "validForPrimaryEndpoint72h": counts[72]["pairedCA"] >= 1})
    header = list(rows[0].keys())
    buf = io.StringIO(newline=""); wcsv = csv.writer(buf, lineterminator="\n"); wcsv.writerow(header)
    for r in rows:
        wcsv.writerow(["" if r[k] is None else r[k] for k in header])
    csv_path = out / "step49-endpoint-raw.csv"; csv_path.write_text(buf.getvalue(), encoding="utf-8")
    valid_windows = [x["windowId"] for x in windows_out if x["validForPrimaryEndpoint72h"]]
    doc = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "step": 49, "status": "ENDPOINT_RAW_MATERIAL_COMPLETE",
           "scope": "raw endpoint material only; Theta_validation, descriptive label, bootstrap, interval and hypothesis decision are NOT computed in STEP 49",
           "endpointDefinition": {"perDrifter": "E_X,i(h) = haversine(model position at exactly t0+h, observed position at exactly t0+h), R = 6371008.8 m, km",
                                  "delta": "delta_i(h) = E_C,i(h) - E_A,i(h)", "secondary": "delta_BA,i(h) = E_B,i(h) - E_A,i(h)",
                                  "horizonsHours": list(H), "pairing": "exact drifter_id and exact UTC timestamp", "naHandling": "NOT_AVAILABLE never imputed, substituted or removed"},
           "cohortMatrixSha256": sha(COHORT), "temporalRunManifestSha256": sha(RUNS_T), "candidateRunManifestSha256": sha(RUNS_C),
           "observationFiles": obs_files, "inputTrajectories": inputs, "windows": windows_out,
           "validWindowCount": len(valid_windows), "validWindows": valid_windows,
           "validWindowDefinition": "a registered window with >= 1 valid C-A pair at 72 h (frozen STEP 46 definition)",
           "rows": rows, "rowCount": len(rows), "tableFile": (str(csv_path.relative_to(ROOT)).replace("\\", "/") if csv_path.is_relative_to(ROOT) else csv_path.name), "tableSha256": sha(csv_path),
           "ThetaComputed": False, "labelComputed": False, "bootstrapRun": False, "hypothesisEvaluated": False,
           "imputation": 0, "substitution": 0, "manualExclusion": 0}
    json_path = out / "step49-endpoint-raw.json"; json_path.write_bytes(canonical(doc) + b"\n")
    print(json.dumps({"status": doc["status"], "rows": len(rows), "validWindowCount": len(valid_windows), "validWindows": valid_windows,
                      "perHorizon": {f"{h}h": {k: sum(x["perHorizon"][f"{h}h"][k] for x in windows_out) for k in ("A", "B", "C", "pairedCA", "pairedBA")} for h in H},
                      "tableSha256": doc["tableSha256"][:16]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

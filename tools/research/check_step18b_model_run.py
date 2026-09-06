"""Deterministic validator for STEP 18b Phase B (model run manifest). exit 0 = PASS, exit 1 = FAIL.
Recomputes file SHAs, row counts, schema, status vocabulary, per-run parameters against the LOCKED
preregistration, and confirms replay matched. It does not interpret results."""
import csv
import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/research/step18b-model-manifest.json"
PREREG = ROOT / "docs/research/step18b-preregistration.json"
LOCK = {"protocol": "73e8aa1405aa82c6ae283962f8efaabdfa5331a5dc6109471b1e6bd0ebf813bc", "prereg": "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316",
        "rule": "7e9ab639f0c36ca747ff5f292f2c78eaa3eaae8da078311ce26f76e964bc49eb", "step18Manifest": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "cohort": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
        "forcingManifest": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86"}
COLUMNS = ["run_id", "drifter_id", "timestamp", "lat", "lon", "alpha", "status", "valid"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    m = json.loads(MANIFEST.read_text(encoding="utf-8")); p = json.loads(PREREG.read_text(encoding="utf-8"))
    check(sha(ROOT / "docs/research/step18b-model-protocol.md") == LOCK["protocol"] == m["protocolSha256"] == m["step18bProtocolSha256"], "1 protocol SHA unchanged")
    check(sha(ROOT / "docs/research/step18-model-manifest.json") == LOCK["step18Manifest"] == m["step18BlockedRun"]["manifestSha256"] and m["step18BlockedRun"]["status"] == "MODEL_RUN_BLOCKED_PREFLIGHT", "1 STEP 18 BLOCKED lineage")
    check(sha(PREREG) == LOCK["prereg"] == m["preregistrationSha256"], "1 preregistration SHA unchanged")
    check(sha(ROOT / "docs/research/step18b-model-rule-sha256.txt") == LOCK["rule"] == m["modelRuleSha256"], "1 rule file SHA unchanged")
    check(sha(ROOT / "docs/research/cohort-step16.json") == LOCK["cohort"] == m["cohortSha256"], "1 cohort SHA")
    check(sha(ROOT / "docs/research/step17-forcing-manifest.json") == LOCK["forcingManifest"] == m["forcingManifestSha256"], "1 forcing manifest SHA")
    check(m["ruleId"] == p["ruleId"] and m["glorys"] == "NOT USED" and m["randomSeed"] is None and m["deterministic"] is True, "1 rule id / no GLORYS / deterministic")
    check(m["modelId"] == p["model"]["modelId"] and m["modelVersion"] == p["model"]["modelVersion"], "1 model id/version")
    units = {u["windowId"]: u for u in p["runUnits"]}; alphas = {r["runId"]: r["alpha"] for r in p["runs"]}
    expected_ids = {f"{rid}-{wid}" for rid in alphas for wid in units}
    check({r["runId"] for r in m["runs"]} == expected_ids and len(m["runs"]) == 8, "2 exactly the 8 preregistered runs")
    check([r["runId"] for r in m["runs"]] == [f"{rid}-{wid}" for wid in units for rid in alphas], "2 run order KE-1 A,B → KE-2 → AG-1 → AG-2")
    cohort = json.loads((ROOT / "docs/research/cohort-step16.json").read_text(encoding="utf-8"))
    for r in m["runs"]:
        rid, wid = r["runId"].rsplit("-", 2)[0], r["windowId"]; u = units[wid]
        check(r["alpha"] == alphas[rid], f"{r['runId']} alpha matches preregistration")
        check(r["integrationStepSeconds"] == p["time"]["integrationStepSeconds"] and r["outputStepSeconds"] == p["time"]["outputStepSeconds"] and r["durationSeconds"] == p["time"]["durationSeconds"], f"{r['runId']} time parameters")
        check(r["area"] == u["computationArea"] == r["computationArea"] and r["forcingSha256"] == u["forcingSha256"] and r["gridSha256"] == u["hycomGridSha256"] and r["windGridSha256"] == u["ncepGridSha256"], f"{r['runId']} area/forcing binding")
        check(r["drifterCount"] == u["drifterCount"] and r["released"] + len(r["releaseFailures"]) == u["drifterCount"], f"{r['runId']} drifter count 23-cohort")
        if r.get("status") != "COMPLETED":
            failures.append(f"{r['runId']} status {r.get('status')}"); continue
        check(r["replayMatched"] is True and r["replay"]["replayResultSha256"] == r["resultArraySha256"], f"{r['runId']} replay matched")
        csv_path, res_path = ROOT / r["trajectoriesFile"], ROOT / r["resultFile"]
        check(csv_path.exists() and sha(csv_path) == r["trajectoriesSha256"], f"{r['runId']} trajectories SHA")
        check(res_path.exists() and sha(res_path) == r["resultSha256"], f"{r['runId']} result SHA")
        if not csv_path.exists():
            continue
        with open(csv_path, encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh); header = next(reader); rows = list(reader)
        check(header == COLUMNS and len(rows) == r["rows"], f"{r['runId']} schema/rows")
        t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ"); t72 = (t0 + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ")
        ids = sorted(u["drifterIds"]); seen = {}
        prev = None
        for row in rows:
            check(row[0] == r["runId"] and row[1] in ids and row[6] in ("ACTIVE", "COMPLETED", "OUT_OF_DOMAIN", "FORCING_UNAVAILABLE"), f"{r['runId']} row vocabulary")
            check(row[7] == ("true" if row[6] in ("ACTIVE", "COMPLETED") else "false"), f"{r['runId']} valid flag")
            check(row[5] == ("0.0007" if r["alpha"] == 0.0007 else "0"), f"{r['runId']} alpha column")
            check(-40 <= float(row[3]) <= 40, f"{r['runId']} latitude within [-40, 40]")
            if row[7] == "true":
                ca = u["computationArea"]; check(ca["west"] - 1e-6 <= float(row[4]) <= ca["east"] + 1e-6 and ca["south"] - 1e-6 <= float(row[3]) <= ca["north"] + 1e-6, f"{r['runId']} valid rows inside computation area")
            key = (row[1], row[2]); check(prev is None or key > prev, f"{r['runId']} row order"); prev = key
            seen.setdefault(row[1], []).append(row)
        check(set(seen) == set(ids), f"{r['runId']} every cohort drifter present")
        for did, drows in seen.items():
            last = drows[-1]
            check(last[6] in ("COMPLETED", "OUT_OF_DOMAIN", "FORCING_UNAVAILABLE"), f"{r['runId']} {did} terminal status")
            check(all(x[6] == "ACTIVE" for x in drows[:-1]), f"{r['runId']} {did} no rows after termination")
            if last[6] == "COMPLETED":
                check(last[2] == t72 and len(drows) == 289, f"{r['runId']} {did} completed run has 289 samples ending t0+72h")
            for x in drows[:-1]:
                secs = (datetime.strptime(x[2], "%Y-%m-%dT%H:%M:%SZ") - t0).total_seconds(); check(secs % 900 == 0, f"{r['runId']} {did} valid rows on 900 s grid")
            start = next(d for w in cohort["selectedWindowDetails"][u["region"]] for d in w["drifters"] if d["drifterId"] == did and f"{u['region']}-{w['order']}" == wid)
            check(abs(float(drows[0][3]) - start["startLat"]) < 1e-6 and abs(float(drows[0][4]) - start["startLon"]) < 1e-6 and drows[0][2] == u["t0"], f"{r['runId']} {did} released at t0 observed position")
    statuses = [r.get("status") for r in m["runs"]]
    expected = "MODEL_RUN_PASS" if all(s == "COMPLETED" for s in statuses) and all(r.get("replayMatched") for r in m["runs"]) else ("MODEL_RUN_BLOCKED_PREFLIGHT" if "MODEL_RUN_BLOCKED_PREFLIGHT" in statuses else "MODEL_RUN_FAIL")
    check(m["status"] == expected, "3 status arithmetic")
    completed = any(s == "COMPLETED" for s in statuses)
    check((m["metrics"] is None and not completed) or (m["metrics"] is not None and m["metrics"]["acceptanceThresholds"].startswith("NONE")), "3 metrics only when a run completed; descriptive only")
    check(m["interpretation"] == "NOT PERFORMED", "3 no interpretation")
    check(m["resultFilesCommitted"] is False and "data/research/step18b/" in (ROOT / ".gitignore").read_text(encoding="utf-8"), "3 result files not committed")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": sorted(set(failures))[:40], "status": m["status"], "manifestSha256": sha(MANIFEST)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

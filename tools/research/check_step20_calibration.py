"""Deterministic validator for STEP 20 Phase B-1 (calibration runs + alpha selection). exit 0 = PASS, exit 1 = FAIL.
Checks STEP 20 ancestry and locked files, the 20-run calibration manifest (exact five alphas, exact calibration IDs, replay,
alpha 0/0.0007 reproduction of STEP 18b), independently recomputes M3 at 24/48/72 h from the trajectory CSVs + observations,
re-derives the 72h→48h→24h→smaller-alpha selection, verifies the selected-alpha artifact integrity, the holdout firewall
(no holdout data, no R1 forcing, no holdout runs), and reproducibility by an independent re-run into a temp directory."""
import csv
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREREG = ROOT / "docs/research/step20-preregistration.json"
CAL_MANIFEST = ROOT / "docs/research/step20-calibration-manifest.json"
EVAL = ROOT / "docs/research/step20-calibration-evaluation.json"
TABLE = ROOT / "docs/research/step20-calibration-table.csv"
SUMMARY = ROOT / "docs/research/step20-calibration-summary.json"
ARTIFACT = ROOT / "docs/research/step20-selected-alpha.json"
LOCK = {"docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selection-rule-sha256.txt": "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7", "tools/research/check_step20_preregistration.py": "ce197824c10dc063df40439871614fa35196cb08a7cede533244b468d8fe32b3",
        "docs/research/step20-holdout-derivation.json": "68dce1d200c73fd6f1c392446f61d2d240c40068bd34992efce8c14622becfb8",
        "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step18-model-protocol.md": "519b3d35bc13524b3e0a30f5521cd2e696ffecdceead58535b0c4959ac3bea2b",
        "docs/research/step18b-model-protocol.md": "73e8aa1405aa82c6ae283962f8efaabdfa5331a5dc6109471b1e6bd0ebf813bc", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation-protocol.md": "920475967d4dd1a0b10a9f96f10c83291f92df767e906c50b0973e82b9af52b3", "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
ALPHAS = [0.0, 0.0003, 0.0007, 0.001, 0.002]
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def hav(lon1, lat1, lon2, lat2):  # independent implementation (spherical law of cosines form avoided; use haversine)
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIUS_M * math.atan2(math.sqrt(h), math.sqrt(1 - h)) / 1000


def median(v):
    v = sorted(v); mid = len(v) // 2
    return (v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2) if v else None


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"1 locked file unchanged: {rel}")
    p = json.loads(PREREG.read_text(encoding="utf-8")); cm = json.loads(CAL_MANIFEST.read_text(encoding="utf-8")); e = json.loads(EVAL.read_text(encoding="utf-8"))
    s = json.loads(SUMMARY.read_text(encoding="utf-8")); art = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    m18b = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r[f]) == r[k] for r in m18b["runs"] for k, f in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile"))), "1 STEP 18b trajectories untouched")
    # 2 manifest: 20 runs, fixed order, five alphas, calibration IDs, replay, step18b reproduction
    units = {u["windowId"]: u for u in p["calibration"]["runUnits"]}
    check(cm["status"] == "CALIBRATION_RUNS_PASS" and len(cm["runs"]) == 20 and cm["lockCommit"] == "155995dd" and cm["holdoutAccess"] == 0 and cm["forcingDownloads"] == 0, "2 manifest status / counters")
    check([float(a) for a in cm["alphaCandidates"]] == ALPHAS == [float(a) for a in p["alphaCandidates"]], "2 exact five alphas")
    expected_order = [f"step20-cal-alpha{cm['alphaText'][str(int(a)) if a == 0 else str(a)]}-{w}" for w in ("KE-1", "KE-2", "AG-1", "AG-2") for a in ALPHAS]
    check([r["runId"] for r in cm["runs"]] == expected_order, "2 fixed run order (unit outer, alpha inner)")
    s18 = {(r["windowId"], r["alpha"]): r["resultArraySha256"] for r in m18b["runs"]}
    for r in cm["runs"]:
        u = units[r["windowId"]]
        check(r["status"] == "COMPLETED" and r["replayMatched"] is True and r["replay"]["replayResultSha256"] == r["resultArraySha256"], f"2 {r['runId']} completed + replay")
        check(r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200 and r["area"] == u["computationArea"] and r["forcingSha256"] == u["forcingSha256"]
              and r["gridSha256"] == u["hycomGridSha256"] and r["windGridSha256"] == u["ncepGridSha256"] and r["drifterCount"] == u["drifterCount"] == r["released"], f"2 {r['runId']} parameters / forcing identity")
        check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] and sha(ROOT / r["resultFile"]) == r["resultSha256"], f"2 {r['runId']} output SHA")
        if (r["windowId"], float(r["alpha"])) in s18:
            check(r.get("matchesStep18b") is True and r["resultArraySha256"] == s18[(r["windowId"], float(r["alpha"]))], f"2 {r['runId']} reproduces STEP 18b result array")
        check("KE-H" not in r["runId"] and "holdout" not in r["runId"].lower(), f"2 {r['runId']} not a holdout run")
    # 3 independent M3 recomputation and selection re-derivation
    ids_expected = {(w, d) for w, u in units.items() for d in u["drifterIds"]}
    with open(TABLE, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh); rows = list(reader); cols = reader.fieldnames
    check(len(rows) == 23 and {(r["unit"], r["drifter_id"]) for r in rows} == ids_expected and [r["drifter_id"] for r in rows] == sorted(r["drifter_id"] for r in rows), "3 table 23 rows, exact calibration IDs, sorted")
    at = {a: cm["alphaText"][str(int(a)) if a == 0 else str(a)] for a in ALPHAS}
    check(all(f"error_{h}h_alpha{at[a]}" in cols for h in (24, 48, 72) for a in ALPHAS) and cols[:3] == ["drifter_id", "unit", "region"] and cols[-1] == "in_selection_set", "3 table columns")
    cohort = json.loads((ROOT / "docs/research/cohort-step16.json").read_text(encoding="utf-8"))
    model = {}
    for r in cm["runs"]:
        with open(ROOT / r["trajectoriesFile"], encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                check(row["alpha"] == r["alphaText"] and row["run_id"] == r["runId"], f"3 {r['runId']} alpha column")
                if row["valid"] == "true":
                    model.setdefault((r["windowId"], row["drifter_id"], float(r["alpha"])), {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    errors = {}
    for wid, u in units.items():
        t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); tsh = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in (24, 48, 72)}
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{u['region']}-{u['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for row in rd:
                    if row[0] in u["drifterIds"] and row[1] in tsh.values():
                        obs[(row[0], row[1])] = (float(row[3]), float(row[2]))
        for d in u["drifterIds"]:
            for a in ALPHAS:
                for h in (24, 48, 72):
                    pos = model.get((wid, d, a), {}).get(tsh[h]); ob = obs.get((d, tsh[h]))
                    errors[(d, a, h)] = hav(*pos, *ob) if pos and ob else NA
    tbl = {(r["drifter_id"], a, h): (NA if r[f"error_{h}h_alpha{at[a]}"] == NA else float(r[f"error_{h}h_alpha{at[a]}"])) for r in rows for a in ALPHAS for h in (24, 48, 72)}
    for key, v in errors.items():
        t = tbl[key]; check((v == NA and t == NA) or (v != NA and t != NA and abs(v - t) <= 0.0015), f"3 M3 recomputation {key}")
    sel_ids = sorted({r["drifter_id"] for r in rows if r["in_selection_set"] == "true"})
    exp_sel = sorted({d for (d, a, h) in errors if all(errors[(d, b, 72)] != NA for b in ALPHAS)})
    check(sel_ids == exp_sel and s["selectionSetN"] == len(exp_sel) == art["selectionSetN"], "3 selection set = valid 72 h for all five alphas")
    tol = p["alphaSelectionRule"]["tieToleranceKm"]
    keys = {a: tuple(median([errors[(d, a, h)] for d in exp_sel]) for h in (72, 48, 24)) for a in ALPHAS}
    best = sorted(ALPHAS, key=lambda a: (keys[a][0], keys[a][1], keys[a][2], a))[0]
    # tolerance-aware hierarchy: walk the sorted order and confirm the first is strictly better or tied-and-smaller
    for a in ALPHAS:
        if a == best:
            continue
        lvl = next((i for i in range(3) if abs(keys[best][i] - keys[a][i]) > tol), None)
        check((lvl is not None and keys[best][lvl] < keys[a][lvl]) or (lvl is None and best < a), f"3 hierarchy: selected beats or ties-smaller vs alpha {a}")
    check(float(s["selectedAlpha"]) == best == float(art["selectedAlpha"]) and float(e["summary"]["selectedAlpha"]) == best, f"3 selected alpha re-derived = {best}")
    for rk in s["ranking"]:
        a = float(rk["alpha"]); check(abs(rk["M3_median_72h"] - keys[a][0]) < 1e-5 and abs(rk["M3_median_48h"] - keys[a][1]) < 1e-5 and abs(rk["M3_median_24h"] - keys[a][2]) < 1e-5, f"3 ranking medians alpha {a}")
    check([float(rk["alpha"]) for rk in s["ranking"]] == sorted(ALPHAS, key=lambda a: (keys[a][0], keys[a][1], keys[a][2], a)), "3 ranking order")
    check(s["notUsedForSelection"] == ["mean", "max", "M1", "M2", "M4", "M5", "sign test", "holdout"] and s["holdoutAccess"] == 0 and s["acceptanceThresholds"] == "NONE" and s["interpretation"] == "NONE", "3 selection inputs / no threshold / no interpretation")
    for reg in ("KE", "AG"):
        check(s["perRegion"][reg]["n"] == sum(1 for r in rows if r["region"] == reg), f"3 regional n {reg}")
    for w in units:
        check(s["perUnit"][w]["n"] == units[w]["drifterCount"], f"3 unit n {w}")
    check(s["perUnit"]["AG-2"]["n"] == 1 and "unit:AG-2" in s["smallN"], "3 AG-2 n=1 visible and flagged")
    # 4 artifact integrity
    content = {k: v for k, v in art.items() if k not in ("contentSha256", "createdAtUTC")}
    check(hashlib.sha256(canonical(content)).hexdigest() == art["contentSha256"], "4 selected-alpha artifact content SHA")
    check(art["ruleId"] == p["ruleId"] and art["step20LockCommit"] == "155995dd" and art["holdoutUsed"] is False and art["frozen"] is True and art["selectionHierarchy"] == ["72h M3 median", "48h M3 median", "24h M3 median", "smaller alpha"], "4 artifact fields")
    check(art["calibrationInputHashes"]["calibrationManifestSha256"] == sha(CAL_MANIFEST) and all(sha(ROOT / x["file"]) == x["sha256"] for x in art["calibrationInputHashes"]["trajectoryFiles"]) and len(art["candidateResults"]) == 5, "4 artifact input hashes / five candidates")
    check(e["tableSha256"] == sha(TABLE) and e["summarySha256"] == sha(SUMMARY) and art["evaluationTableSha256"] == sha(TABLE) and e["status"] == "CALIBRATION_COMPLETE", "4 evaluation SHAs")
    # 5 holdout firewall
    check(not (ROOT / "data/research/step20/holdout").exists() and not (ROOT / "docs/research/step20-holdout-forcing-manifest.json").exists() and not (ROOT / "docs/research/step20-holdout-manifest.json").exists(), "5 no holdout forcing/runs")
    check(not any("KE-H" in str(q) for q in (ROOT / "data/research/step20").rglob("*")), "5 no holdout files under step20 results")
    check(e["holdoutAccess"] == 0 and e["forcingDownloads"] == 0 and e["holdoutEvaluation"] == 0, "5 evaluation counters zero")
    # 6 reproducibility: independent re-run
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step20_calibration.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        ok = proc.returncode == 0 and sha(Path(tmp) / "step20-calibration-table.csv") == sha(TABLE) and sha(Path(tmp) / "step20-calibration-summary.json") == sha(SUMMARY)
        if ok:
            a2 = json.loads((Path(tmp) / "step20-selected-alpha.json").read_text(encoding="utf-8")); ok = a2["contentSha256"] == art["contentSha256"] and a2["selectedAlpha"] == art["selectedAlpha"]
        check(ok, "6 reproducibility: table/summary byte-identical, artifact content SHA identical")
    check(e["tool"]["sha256"] == sha(ROOT / "tools/research/evaluate_step20_calibration.py"), "6 tool SHA recorded")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "selectedAlpha": art["selectedAlpha"], "artifactContentSha256": art["contentSha256"], "artifactFileSha256": sha(ARTIFACT)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

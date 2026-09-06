"""Independent validator for STEP 20 Phase B-6 holdout outputs. exit 0 = PASS, exit 1 = FAIL.
Recomputes M3 (own haversine) from the holdout trajectory CSVs and STEP 15 observations for every drifter/alpha/horizon, paired deltas,
wins/losses/ties, per-unit strata, top-3, sign test, M1/M2/M4/M5 presence; checks 12 drifters (KE-H1 5 + KE-H3 7), 2 alpha conditions,
KE-H2 excluded and recorded FORCING_UNAVAILABLE, no cohort leakage (holdout ids disjoint from calibration), no alpha reselection,
gate PASS, manifest/replay integrity, locked files unchanged, and reproducibility (independent evaluator re-run to a temp dir)."""
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
PREREG20 = ROOT / "docs/research/step20-preregistration.json"
MANIFEST = ROOT / "docs/research/step20-b6-holdout-manifest.json"
EVAL = ROOT / "docs/research/step20-b6-holdout-evaluation.json"
TABLE = ROOT / "docs/research/step20-b6-holdout-table.csv"
SUMMARY = ROOT / "docs/research/step20-b6-holdout-summary.json"
GATE = ROOT / "docs/research/step20-b6-segmentation-gate.json"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selection-rule-sha256.txt": "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-b3-forcing-resolution-protocol.md": "b7a2ad2309553c05f261598773df7ca5295a8dcd92ef76fd3467e4d1787ef466",
        "docs/research/step20-b3-forcing-resolution-preregistration.json": "c4348d8b3c306df2f8661f26a72e8a42261fbfabac2c606115b716d059874095", "docs/research/step20-b3-forcing-resolution-selection-rule.json": "87f7750bd3f95089402da565a8801677955f2e078c8616905752bef9e17e9126",
        "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701", "docs/research/step20-holdout-forcing-manifest.json": "8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b",
        "docs/research/step20-b5-numerical-equivalence-protocol.md": "a61140347320519b623eeb382d18470a0759d4e51597c4d2896730889a737f42", "docs/research/step20-b5-numerical-equivalence-preregistration.json": "ab5048a417ec1af3deab2634b0f8868277533b49aee38d02528ef1419e949918",
        "docs/research/step20-b5-numerical-equivalence-selection-rule.json": "dd3916b840b921165771c022e29db5b72b3a26769775503044fef5c004cc7595", "docs/research/step20-b4-segmentation-gate.json": "9e3d3dd9e98287a3a0d06a8a8fe190d5189f595cf6b81055d6e41d30e2aaed02"}
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def hav(lon1, lat1, lon2, lat2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIUS_M * math.atan2(math.sqrt(h), math.sqrt(1 - h)) / 1000


def median(v):
    v = sorted(v); mid = len(v) // 2
    return round(v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2, 3) if v else None


def near(a, b, tol=0.001):
    return a is not None and b is not None and abs(a - b) <= tol + 1e-9


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"1 locked file unchanged: {rel}")
    for name in ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"1 runtime unchanged: {name}")
    p = json.loads(PREREG20.read_text(encoding="utf-8")); m = json.loads(MANIFEST.read_text(encoding="utf-8")); e = json.loads(EVAL.read_text(encoding="utf-8")); s = json.loads(SUMMARY.read_text(encoding="utf-8")); g = json.loads(GATE.read_text(encoding="utf-8"))
    m18b = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r[f]) == r[k] for r in m18b["runs"] for k, f in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile"))), "1 STEP 18b trajectories untouched")
    # 2 gate and manifest
    check(g["status"] == "SEGMENTATION_EQUIVALENCE_PASS" and m["gateStatus"] == g["status"] and m["gateSha256"] == sha(GATE) and e["gateSha256"] == sha(GATE), "2 segmentation gate PASS recorded")
    t0g, t2g = (next(t for t in g["tests"] if t["alpha"] == a) for a in (0.0, 0.002))
    check(t0g["bitwiseIdentical"] and all(t0g["conditions"].values()) and all(t2g["conditions"].values()) and t2g["maxAbsDeltaDeg"] <= 1e-12 and all(v <= 1e-6 for v in t2g["endpointMaxSeparationKm"].values()) and g["forcingEquivalence"]["E_forcingValuesExact"] and g["forcingEquivalence"]["F_landMaskExact"], "2 gate conditions A–J + alpha 0 bitwise")
    check(m["status"] == "HOLDOUT_RUNS_PASS" and m["selectedAlpha"] == 0.002 and m["baselineAlpha"] == 0.0 and m["otherAlphasRun"] == 0 and m["holdoutEvaluatedOnce"] is True, "2 manifest status / alphas")
    modeled = [r for r in m["runs"] if r.get("modeled")]; unav = [r for r in m["runs"] if not r.get("modeled")]
    check(len(modeled) == 4 and [(r["windowId"], r["alpha"]) for r in modeled] == [("KE-H1", 0.002), ("KE-H1", 0.0), ("KE-H3", 0.002), ("KE-H3", 0.0)], "2 exactly 4 modeled runs in order")
    check(len(unav) == 2 and all(r["windowId"] == "KE-H2" and r["status"] == "FORCING_UNAVAILABLE" and r["missingRequiredOceanFrames"] == ["2010-08-18T12:00:00Z"] for r in unav), "2 KE-H2 recorded FORCING_UNAVAILABLE, not modeled")
    for r in modeled:
        check(r["status"] == "COMPLETED" and r["replayMatched"] is True and all(x["matched"] for x in r["replay"]) and r["integrationStepSeconds"] == 300 and r["outputStepSeconds"] == 900 and r["durationSeconds"] == 259200, f"2 {r['runId']} completed/replay/timesteps")
        check(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] and sha(ROOT / r["resultFile"]) == r["resultSha256"], f"2 {r['runId']} output SHA")
        check((r["windowId"] == "KE-H1") == r["segmented"] and (r["continuedParticles"] == 5 if r["segmented"] else True), f"2 {r['runId']} segmentation flag")
    units = {u["windowId"]: u for u in p["holdout"]["runUnits"]}
    cal_ids = {d for u in p["calibration"]["runUnits"] for d in u["drifterIds"]}
    ids = {(w, d) for w in ("KE-H1", "KE-H3") for d in units[w]["drifterIds"]}
    check(len(ids) == 12 and not ({d for _, d in ids} & cal_ids), "3 12 holdout ids, disjoint from calibration (no leakage)")
    # 3 table & independent recomputation
    with open(TABLE, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh); rows = list(reader); cols = reader.fieldnames
    check(len(rows) == 12 and {(r["unit"], r["drifter_id"]) for r in rows} == ids and [r["drifter_id"] for r in rows] == sorted(r["drifter_id"] for r in rows) and "KE-H2" not in {r["unit"] for r in rows}, "3 table 12 rows, exact ids, KE-H2 excluded")
    check(cols == ["drifter_id", "unit", "error_A_24h", "error_B_24h", "delta_24h", "error_A_48h", "error_B_48h", "delta_48h", "error_A_72h", "error_B_72h", "delta_72h", "endpoint_A_72h", "endpoint_B_72h", "A_B_separation_72h", "path_A", "path_B", "observed_72h"], "3 columns")
    model = {}
    for r in modeled:
        with open(ROOT / r["trajectoriesFile"], encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                check(row["alpha"] == r["alphaText"], f"3 {r['runId']} alpha column")
                if row["valid"] == "true":
                    model.setdefault((r["windowId"], row["drifter_id"], float(r["alpha"])), {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    err = {}
    for w in ("KE-H1", "KE-H3"):
        u = units[w]; t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); tsh = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in (24, 48, 72)}
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"KE-{u['t0'][:4]}-q*.csv")):
            with open(path, encoding="utf-8", newline="") as fh:
                rd = csv.reader(fh); next(rd); next(rd)
                for row in rd:
                    if row[0] in u["drifterIds"] and row[1] in tsh.values():
                        obs[(row[0], row[1])] = (float(row[3]), float(row[2]))
        for d in u["drifterIds"]:
            for a in (0.002, 0.0):
                for h in (24, 48, 72):
                    pos = model.get((w, d, a), {}).get(tsh[h]); ob = obs.get((d, tsh[h])); err[(d, a, h)] = hav(*pos, *ob) if pos and ob else NA
    tol = p["holdoutComparison"]["tieToleranceKm"]
    for r in rows:
        for h in (24, 48, 72):
            a, b, dd = float(r[f"error_A_{h}h"]), float(r[f"error_B_{h}h"]), float(r[f"delta_{h}h"])
            check(err[(r["drifter_id"], 0.002, h)] != NA and abs(err[(r["drifter_id"], 0.002, h)] - a) <= 0.0015 and abs(err[(r["drifter_id"], 0.0, h)] - b) <= 0.0015 and abs((a - b) - dd) <= 0.0015, f"3 M3 recomputation {r['drifter_id']} {h}h")
            check(r[f"endpoint_A_72h"] != NA and r["path_A"] != NA and r["A_B_separation_72h"] != NA and r["observed_72h"] != NA, f"3 secondary metrics present {r['drifter_id']}")
    # 4 summary re-derived
    for h in (24, 48, 72):
        dl = [float(r[f"delta_{h}h"]) for r in rows]; o = s["overall"][f"{h}h"]
        check(o["n"] == 12 and o["notAvailable"] == 0 and o["wins_alpha0.002"] == sum(1 for d in dl if d < -tol) and o["losses_alpha0.002"] == sum(1 for d in dl if d > tol) and o["ties"] == sum(1 for d in dl if abs(d) <= tol), f"4 wins/losses/ties {h}h")
        check(near(o["delta"]["median_delta"], median(dl)) and near(o["error_alpha0.002"]["median"], median([float(r[f"error_A_{h}h"]) for r in rows])) and near(o["error_alpha0"]["median"], median([float(r[f"error_B_{h}h"]) for r in rows])) and o["error_alpha0.002"]["mean"] is not None, f"4 overall medians/means {h}h")
        for w in ("KE-H1", "KE-H3"):
            ur = [r for r in rows if r["unit"] == w]; u = s["perUnit"][w]; ud = [float(r[f"delta_{h}h"]) for r in ur]
            check(u["n"] == len(ur) == units[w]["drifterCount"] and u["smallN"] is True and near(u[f"{h}h"]["delta"]["median_delta"], median(ud)) and u[f"{h}h"]["wins_alpha0.002"] == sum(1 for d in ud if d < -tol) and u[f"{h}h"]["losses_alpha0.002"] == sum(1 for d in ud if d > tol), f"4 unit {w} {h}h")
        top = s["topErrors"][f"{h}h"]; exp = sorted(rows, key=lambda r: -float(r[f"error_A_{h}h"]))[:3]
        check([t["drifter_id"] for t in top] == [r[0 if False else "drifter_id"] for r in exp], f"4 top-3 {h}h")
        st = s["exploratorySignTest"][f"{h}h"]; n = o["wins_alpha0.002"] + o["losses_alpha0.002"]; k = min(o["wins_alpha0.002"], o["losses_alpha0.002"])
        check(st["n"] == n == 12 and "EXPLORATORY" in st["label"] and abs(st["p"] - min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)) < 1e-6, f"4 sign test {h}h")
    hs = s["holdout"]
    check(hs["preregistered"] == 13 and hs["evaluable"] == 12 and hs["unavailable"] == 1 and hs["evaluated"] == 12 and hs["KE-H2"]["status"] == "FORCING_UNAVAILABLE" and hs["KE-H2"]["modelRun"] is False and hs["AG"] == "HOLDOUT_UNAVAILABLE", "4 holdout accounting 13/12/1, KE-H2, AG")
    check(s["alphaReselection"] is False and s["acceptanceThresholds"] == "NONE" and s["interpretation"] == "NONE" and e["positionalToleranceInM3"] is None and s["outlierPolicyApplied"] == {"removed": 0, "winsorized": 0, "trimmed": 0, "weighted": 0}, "4 no reselection / threshold / interpretation / outlier handling")
    check(e["tableSha256"] == sha(TABLE) and e["summarySha256"] == sha(SUMMARY) and e["holdoutManifestSha256"] == sha(MANIFEST) and all(x["verified"] and sha(ROOT / x["file"]) == x["expected"] for x in e["inputFileShas"]), "4 evaluation SHAs / input integrity")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step20_b6_holdout.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and sha(Path(tmp) / "step20-b6-holdout-table.csv") == sha(TABLE) and sha(Path(tmp) / "step20-b6-holdout-summary.json") == sha(SUMMARY), "5 reproducibility: re-run table/summary byte-identical")
    check(e["tool"]["sha256"] == sha(ROOT / "tools/research/evaluate_step20_b6_holdout.py") and m["orchestrator"]["sha256"] == sha(ROOT / "tools/research/run_step20_b6_holdout.py") and m["segmentedModule"]["sha256"] == sha(ROOT / "tools/research/step20_segmented.py"), "5 tool SHAs recorded")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "evaluationSha256": sha(EVAL), "tableSha256": sha(TABLE), "summarySha256": sha(SUMMARY), "manifestSha256": sha(MANIFEST)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

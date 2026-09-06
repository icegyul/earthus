"""Deterministic validator for STEP 19 Phase B outputs. exit 0 = PASS, exit 1 = FAIL.
Re-derives the summary from the paired table, checks rows/ids/columns/horizons, A/B alpha, tie rule, unit stratification,
top-3 and leave-one-out tables, exploratory sign test arithmetic, manifest consistency record, result integrity record,
reproducibility (independent re-run to a temp dir) and the absence of thresholds/interpretation. No interpretation."""
import csv
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREREG = ROOT / "docs/research/step19-preregistration.json"
EVAL = ROOT / "docs/research/step19-evaluation.json"
TABLE = ROOT / "docs/research/step19-paired-table.csv"
SUMMARY = ROOT / "docs/research/step19-summary.json"
LOCK = {"protocol": "920475967d4dd1a0b10a9f96f10c83291f92df767e906c50b0973e82b9af52b3", "prereg": "02e73093bbcf44a89c26887d7cddcc243c01ae37c45b30f789ee04838bac14dd",
        "rule": "ce3d466bb4ba973a797ca6de5044491c90699f6c66ff6113ab7d44a4f561599d", "manifest": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe"}
NA = "NOT_AVAILABLE"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def median(v):
    v = sorted(v); mid = len(v) // 2
    return round(v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2, 3) if v else None


def near(a, b, tol=0.001):
    """Table values are rounded to 3 decimals; an even-n median of rounded values may differ from the full-precision median by <= 0.001 km."""
    return a is not None and b is not None and abs(a - b) <= tol + 1e-9


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    p = json.loads(PREREG.read_text(encoding="utf-8")); e = json.loads(EVAL.read_text(encoding="utf-8")); s = json.loads(SUMMARY.read_text(encoding="utf-8"))
    check(sha(ROOT / "docs/research/step19-evaluation-protocol.md") == LOCK["protocol"] == e["protocolSha256"] and sha(PREREG) == LOCK["prereg"] == e["preregistrationSha256"]
          and sha(ROOT / "docs/research/step19-evaluation-rule-sha256.txt") == LOCK["rule"] == e["evaluationRuleSha256"], "1 STEP 19 LOCK unchanged and recorded")
    check(sha(ROOT / "docs/research/step18b-model-manifest.json") == LOCK["manifest"] == e["step18bManifestSha256"], "1 STEP 18b manifest unchanged")
    check(e["status"] == "EVALUATION_COMPLETE" and e["ruleId"] == p["ruleId"] == s["ruleId"], "1 status / rule id")
    check(len(e["inputFileShas"]) == 16 and all(x["verified"] and sha(ROOT / x["file"]) == x["expected"] for x in e["inputFileShas"]), "2 result integrity 16/16 (re-verified now)")
    check(e["comparison"]["A"]["alpha"] == 0.0007 and e["comparison"]["B"]["alpha"] == 0.0 and e["comparison"]["A"]["runId"] == "step18-A-alpha0007" and e["comparison"]["B"]["runId"] == "step18-B-alpha0", "3 A/B alpha and run ids")
    check(e["horizons"] == [24, 48, 72] == s["horizons"], "3 horizons")
    # table
    with open(TABLE, encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh); header = next(reader); rows = list(reader)
    check(header == p["pairedTable"]["columns"], "4 fixed columns")
    check(len(rows) == 23 == e["pairs"]["total"] == s["pairCount"], "4 23 rows")
    units = {u["windowId"]: u for u in json.loads((ROOT / "docs/research/step18b-preregistration.json").read_text(encoding="utf-8"))["runUnits"]}
    expected_ids = {(u["windowId"], d) for u in units.values() for d in u["drifterIds"]}
    check({(r[1], r[0]) for r in rows} == expected_ids and [r[0] for r in rows] == sorted(r[0] for r in rows), "4 expected drifter ids / order")
    check(sha(TABLE) == e["tableSha256"] and sha(SUMMARY) == e["summarySha256"], "4 table/summary SHA recorded")
    col = {c: i for i, c in enumerate(header)}
    tol = p["primaryError"]["tieToleranceKm"]

    def val(r, c):
        return NA if r[col[c]] == NA else float(r[col[c]])
    for r in rows:
        for h in (24, 48, 72):
            a, b, d = val(r, f"error_A_{h}h"), val(r, f"error_B_{h}h"), val(r, f"delta_{h}h")
            check(NA not in (a, b, d) and abs((a - b) - d) <= 0.0015, f"4 delta = error_A - error_B {r[0]} {h}h")
    # summary re-derived from the table
    for h in (24, 48, 72):
        deltas = [val(r, f"delta_{h}h") for r in rows]
        o = s["overall"][f"{h}h"]
        check(o["A_wins"] == sum(1 for d in deltas if d < -tol) and o["B_wins"] == sum(1 for d in deltas if d > tol) and o["ties"] == sum(1 for d in deltas if abs(d) <= tol), f"5 wins/ties {h}h")
        check(o["A_wins"] + o["B_wins"] + o["ties"] == o["n"] == 23 and o["notAvailable"] == 0, f"5 wins sum = n {h}h")
        check(near(o["delta"]["median_delta"], median(deltas)) and near(o["error_A"]["median"], median([val(r, f"error_A_{h}h") for r in rows])) and near(o["error_B"]["median"], median([val(r, f"error_B_{h}h") for r in rows])), f"5 medians {h}h")
        check(o["error_A"]["n"] == 23 and all(k in o["error_A"] for k in ("n", "median", "mean", "min", "max")) and all(k in o["delta"] for k in ("median_delta", "mean_delta", "min_delta", "max_delta")), f"5 summary fields {h}h")
        for wid in units:
            ur = [r for r in rows if r[1] == wid]; u = s["perUnit"][wid]
            ud = [val(r, f"delta_{h}h") for r in ur]
            check(u["n"] == len(ur) and near(u[f"{h}h"]["median_delta"], median(ud)) and u[f"{h}h"]["A_wins"] == sum(1 for d in ud if d < -tol) and u[f"{h}h"]["B_wins"] == sum(1 for d in ud if d > tol)
                  and near(u[f"{h}h"]["median_A"], median([val(r, f"error_A_{h}h") for r in ur])) and near(u[f"{h}h"]["median_B"], median([val(r, f"error_B_{h}h") for r in ur])), f"6 unit {wid} {h}h")
        # top-3
        top = s["topErrors"][f"{h}h"]; exp = sorted(rows, key=lambda r: -val(r, f"error_A_{h}h"))[:3]
        check([t["drifter_id"] for t in top] == [r[0] for r in exp], f"7 top-3 {h}h")
        # sign test arithmetic
        st = s["exploratorySignTest"][f"{h}h"]; n = o["A_wins"] + o["B_wins"]; k = min(o["A_wins"], o["B_wins"])
        check(st["label"] == "EXPLORATORY" and st["n"] == n and st["threshold"] is None and abs(st["p"] - min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)) < 1e-6, f"8 sign test {h}h")
    check(s["perUnit"]["AG-2"]["n"] == 1 and set(s["perUnit"]) == {"KE-1", "KE-2", "AG-1", "AG-2"}, "6 AG-2 n=1 visible, four units")
    # leave-one-out
    loo = e["leaveOneOut"]
    check(len(loo) == 23 and [l["leftOut"] for l in loo] == [r[0] for r in rows], "9 leave-one-out 23 rows")
    for l in loo:
        rest = [r for r in rows if r[0] != l["leftOut"]]
        for h in (24, 48, 72):
            ud = [val(r, f"delta_{h}h") for r in rest]
            check(near(l[f"{h}h"]["median_delta"], median(ud)) and l[f"{h}h"]["A_wins"] == sum(1 for d in ud if d < -tol) and l[f"{h}h"]["B_wins"] == sum(1 for d in ud if d > tol), f"9 leave-one-out {l['leftOut']} {h}h")
    # secondary metrics consistency record
    mc = e["manifestConsistency"]
    check(mc["toleranceKm"] == 0.001 and mc["checked"] == 23 * 12, "10 manifest consistency checked 276 values")
    check(isinstance(mc["inconsistent"], list), "10 inconsistencies listed (not corrected)")
    for r in rows:
        check(abs(val(r, "A_B_separation_72h")) >= 0 and val(r, "observed_72h") != NA and val(r, "endpoint_A_72h") != NA and val(r, "path_A") != NA, f"10 secondary metrics present {r[0]}")
    check(e["outlierPolicyApplied"] == {"removed": 0, "winsorized": 0, "trimmed": 0, "replaced": 0}, "11 no outlier handling")
    check(e["acceptanceThresholds"] == "NONE" and e["interpretation"] == "NONE" and s["interpretation"] == "NONE" and "NOT statistically independent" in s["independenceNote"], "12 no threshold / no interpretation / independence note")
    # reproducibility: independent re-run
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step19.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and sha(Path(tmp) / "step19-paired-table.csv") == sha(TABLE) and sha(Path(tmp) / "step19-summary.json") == sha(SUMMARY), "13 reproducibility: re-run table/summary identical")
    check(e["tool"]["sha256"] == sha(ROOT / "tools/research/evaluate_step19.py"), "13 tool SHA recorded")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": e["status"], "evaluationSha256": sha(EVAL), "tableSha256": sha(TABLE), "summarySha256": sha(SUMMARY)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

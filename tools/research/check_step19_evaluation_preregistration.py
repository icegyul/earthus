"""Deterministic validator for STEP 19 Phase A (independent evaluation preregistration). exit 0 = PASS, exit 1 = FAIL.
Cross-checks protocol text, preregistration JSON and SHA file; verifies immutable ancestry (STEP 16/17/18/18b), the 16
STEP 18b result files against the STEP 18b manifest, and parses horizons, tie tolerance, table columns, statistics
items and prohibitions from the protocol text. No analysis performed; nothing hand-written PASS."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step19-evaluation-protocol.md"
PREREG = ROOT / "docs/research/step19-preregistration.json"
RULE_SHA = ROOT / "docs/research/step19-evaluation-rule-sha256.txt"
ANCESTRY = {
    "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
    "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
    "docs/research/step18b-model-protocol.md": "73e8aa1405aa82c6ae283962f8efaabdfa5331a5dc6109471b1e6bd0ebf813bc",
    "docs/research/step18b-preregistration.json": "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316",
    "docs/research/step18b-model-rule-sha256.txt": "7e9ab639f0c36ca747ff5f292f2c78eaa3eaae8da078311ce26f76e964bc49eb",
    "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
}
COMMITS = {"step16CohortCommit": "5bc3590b", "step17PhaseBCommit": "cc4d8c48", "step18LockCommit": "d505cc5e", "step18PhaseBCommit": "5607ac1a", "step18bLockCommit": "5b9567e5", "step18bModelCommit": "75020d98", "step18bManifestCommit": "a9225f77"}
RULE_ID = "evaluation-protocol-step19-paired-ab-24-48-72h"
SECRET_PATTERNS = (r"password", r"passwd", r"api[_-]?key", r"token=", r"authorization", r"Basic [A-Za-z0-9+/=]{8,}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def commit_exists(short):
    try:
        return subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip() == "commit"
    except (OSError, subprocess.SubprocessError):
        return False


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    text = PROTO.read_text(encoding="utf-8")
    p = json.loads(PREREG.read_text(encoding="utf-8"))
    proto_sha = sha(PROTO)
    rule_map = {l.split()[1]: l.split()[0] for l in RULE_SHA.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(p.get("protocolDocumentSha256") == proto_sha and rule_map.get("docs/research/step19-evaluation-protocol.md") == proto_sha, "1 protocol SHA cross-reference")
    check(rule_map.get("docs/research/step19-preregistration.json") == sha(PREREG), "1 rule file preregistration SHA")
    check(f"Rule ID: **{RULE_ID}**" in text and p.get("ruleId") == RULE_ID, "1 rule ID")
    check("Status: PREREGISTRATION LOCKED" in text and p.get("status") == "PREREGISTRATION LOCKED", "1 LOCK status in both")
    # 2 ancestry
    ic = p.get("immutabilityCheck", {})
    for rel, expected in ANCESTRY.items():
        check(sha(ROOT / rel) == expected, f"2 ancestor unchanged: {rel}")
        check(expected in text, f"2 ancestor SHA cited in protocol: {rel}")
    for key, short in COMMITS.items():
        check(ic.get(key) == short and commit_exists(short) and short in text, f"2 ancestor commit {key}={short}")
    obs = json.loads((ROOT / "docs/research/step15-observation-manifest.json").read_text(encoding="utf-8"))["observationSha256"]
    check(ic.get("observationSha256") == obs and obs in text, "2 observationSha256")
    # 3 STEP 18b result integrity: 16 files match manifest and preregistration copies
    m = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(m["status"] == "MODEL_RUN_PASS" and m["replayMatched"] is True and len(m["runs"]) == 8 and p["evaluates"]["manifestSha256"] == ANCESTRY["docs/research/step18b-model-manifest.json"], "3 STEP 18b manifest MODEL_RUN_PASS / replay matched")
    runs = {r["runId"]: r for r in p["inputs"]["trajectoryRuns"]}
    for r in m["runs"]:
        q = runs.get(r["runId"])
        check(q is not None and q["trajectoriesSha256"] == r["trajectoriesSha256"] and q["resultSha256"] == r["resultSha256"] and q["alpha"] == r["alpha"] and q["rows"] == r["rows"], f"3 preregistration copies manifest SHAs {r['runId']}")
        for key, fkey in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile")):
            path = ROOT / r[fkey]
            check(path.exists() and sha(path) == r[key], f"3 result file SHA {r[fkey]}")
    check(len(runs) == 8 and {r["alpha"] for r in runs.values()} == {0.0007, 0.0}, "3 eight runs, two alphas")
    check("EVALUATION_BLOCKED_RESULT_INTEGRITY" in text and "EVALUATION_BLOCKED_RESULT_INTEGRITY" in p["inputs"]["integrityRule"], "3 integrity block rule")
    # 4 design parsed from text
    d = p["design"]
    check(d["primaryComparison"]["A"]["alpha"] == 0.0007 and d["primaryComparison"]["B"]["alpha"] == 0.0 and "**RUN A (α=0.0007) vs RUN B (α=0)**" in text, "4 primary comparison A vs B")
    hz = re.search(r"지평: \*\*(\d+) h · (\d+) h · (\d+) h\*\*", text)
    check(hz and [int(x) for x in hz.groups()] == [24, 48, 72] == d["horizonsHours"], "4 horizons 24/48/72 parsed")
    check("정확한 UTC timestamp 일치만" in text and "관측 보간 없음" in text and "no interpolation" in d["timestampMatching"], "4 exact UTC, no interpolation")
    check("통계적으로 독립이 아니다" in text and "NOT statistically independent" in d["independence"], "4 non-independence stated")
    pe = p["primaryError"]
    tol = re.search(r"\|delta\| ≤ ([0-9e.-]+) km", text)
    check(tol and float(tol.group(1)) == pe["tieToleranceKm"] == 1e-6, "4 tie tolerance parsed")
    check("delta(d,h) = error_A − error_B" in text and pe["delta"].startswith("error_A - error_B") and "6371008.8" in text and "6371008.8" in pe["distance"], "4 delta definition and distance constant")
    check("**엄격히** 낮음" in text and "strictly lower" in pe["win"] and pe["noBetterClaimBeforeFullDistribution"] is True and '"better"라고 부르지 않는다' in text, "4 win definition / no 'better' claim")
    # 5 secondary metrics unchanged
    s18b = json.loads((ROOT / "docs/research/step18b-preregistration.json").read_text(encoding="utf-8"))["metrics"]
    sm = p["secondaryMetrics"]
    check(sm["M1"] == s18b["M1"] and sm["M2"] == s18b["M2"] and sm["M5"] == s18b["M5"] and sm["definitionsChanged"] is False, "5 M1/M2/M5 definitions identical to STEP 18b")
    ct = re.search(r"\|차이\| ≤ ([0-9.]+) km", text)
    check(ct and float(ct.group(1)) == sm["manifestConsistencyToleranceKm"], "5 manifest consistency tolerance parsed")
    # 6 summary statistics / stratification
    ss = p["summaryStatistics"]
    check(ss["perMetricHorizonRun"] == ["n", "median", "mean", "min", "max"] and "**n, median, mean, min, max**" in text, "6 summary items")
    check(ss["pairedDelta"] == ["median delta", "mean delta", "min delta", "max delta", "A wins", "B wins", "ties"] and "**A wins / B wins / ties**" in text, "6 paired delta items")
    check(ss["stratification"]["units"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and ss["stratification"]["poolingHidesUnits"] is False and "AG-2는 n=1로 그대로 보인다" in text, "6 unit stratification, AG-2 n=1 visible")
    # 7 outlier policy
    op = p["outlierPolicy"]
    check(all(op[k] is False for k in ("remove", "winsorize", "trim", "replaceObservations", "removeAG2", "removeLargeError")), "7 outlier policy flags")
    check("제거·winsorize·trim·관측 대체 금지" in text and "Leave-one-out" in text and op["influenceReport"]["topErrorsPerHorizon"] == 3 and "상위 3개" in text, "7 influence reporting")
    # 8 table columns parsed from text
    cols_txt = re.search(r"열 정확히:\n`([^`]+)`", text)
    cols = [c.strip() for c in cols_txt.group(1).split(",")] if cols_txt else []
    check(cols == p["pairedTable"]["columns"] and cols[:11] == ["drifter_id", "unit", "error_A_24h", "error_B_24h", "delta_24h", "error_A_48h", "error_B_48h", "delta_48h", "error_A_72h", "error_B_72h", "delta_72h"]
          and {"endpoint_A_72h", "endpoint_B_72h", "A_B_separation_72h"} <= set(cols), "8 paired table columns")
    check(p["pairedTable"]["rows"] == 23 and "23행" in text and p["pairedTable"]["silentOmission"] is False, "8 table 23 rows, no silent omission")
    # 9 inference rules
    inf = p["inference"]
    check(inf["independentSampleTTest"] is False and inf["assumeIndependence"] is False and inf["confidenceIntervals"] is False and inf["primary"] == "descriptive paired analysis", "9 no t-test / independence / CI")
    check(inf["exploratory"]["label"] == "EXPLORATORY" and inf["exploratory"]["changesPrimary"] is False and inf["exploratory"]["pValueThreshold"] is None and "EXPLORATORY" in text and "정확 부호검정" in text, "9 exploratory sign test labelled, no threshold")
    check("p-value threshold" in text and p["acceptanceThresholds"] == "NONE" and "PASS/FAIL 판정 기준이 없다" in text, "9 no acceptance threshold")
    # 10 post-hoc prohibitions and phase A flags
    check(len(p["postHocProhibited"]) >= 8 and "## 9. 사후 수정 금지" in text, "10 post-hoc prohibitions")
    check(all(p[k] is False for k in ("analysisPerformed", "statisticsComputed", "plotsCreated")) and p["interpretation"] == "NONE", "10 phase A flags")
    check(not (ROOT / "docs/research/step19-evaluation.json").exists() and not (ROOT / "docs/research/step19-paired-table.csv").exists() and not (ROOT / "tools/research/evaluate_step19.py").exists(), "10 no analysis outputs exist")
    check(p["phaseBOutputs"]["plots"] == "NONE" and "그래프는 이 protocol의 산출물이 아니다" in text, "10 no plots")
    for path in (PROTO, PREREG, RULE_SHA):
        check(not any(re.search(pat, path.read_text(encoding="utf-8"), re.I) for pat in SECRET_PATTERNS), f"11 no secret pattern in {path.name}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleId": p.get("ruleId"), "status": p.get("status"),
                      "protocolSha256": proto_sha, "preregistrationSha256": sha(PREREG), "ruleFileSha256": sha(RULE_SHA)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

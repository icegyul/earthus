"""Deterministic validator for STEP 20 Phase A (generalization / parameter-validation preregistration). exit 0 = PASS, exit 1 = FAIL.
Checks ancestry (STEP 16/17/18/18b/19, STEP 18b trajectories, STEP 19 outputs), protocol/preregistration/rule-file cross-references,
the alpha candidate set, calibration/holdout definitions (holdout re-derived from the derivation file and its rule), the selection rule,
tie rule, horizons, primary/secondary metrics, spatial strata, small-n, outlier, leakage, forcing, no-threshold and descriptive-inference
policies, and that no STEP 20 model output exists. Constants are parsed from the protocol text; nothing is hand-written PASS."""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step20-generalization-protocol.md"
PREREG = ROOT / "docs/research/step20-preregistration.json"
RULE_SHA = ROOT / "docs/research/step20-selection-rule-sha256.txt"
DERIV = ROOT / "docs/research/step20-holdout-derivation.json"
ANCESTRY = {
    "docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792",
    "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
    "docs/research/step18-model-protocol.md": "519b3d35bc13524b3e0a30f5521cd2e696ffecdceead58535b0c4959ac3bea2b",
    "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb",
    "docs/research/step18b-model-protocol.md": "73e8aa1405aa82c6ae283962f8efaabdfa5331a5dc6109471b1e6bd0ebf813bc",
    "docs/research/step18b-preregistration.json": "02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316",
    "docs/research/step18b-model-rule-sha256.txt": "7e9ab639f0c36ca747ff5f292f2c78eaa3eaae8da078311ce26f76e964bc49eb",
    "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
    "docs/research/step19-evaluation-protocol.md": "920475967d4dd1a0b10a9f96f10c83291f92df767e906c50b0973e82b9af52b3",
    "docs/research/step19-preregistration.json": "02e73093bbcf44a89c26887d7cddcc243c01ae37c45b30f789ee04838bac14dd",
    "docs/research/step19-evaluation-rule-sha256.txt": "ce3d466bb4ba973a797ca6de5044491c90699f6c66ff6113ab7d44a4f561599d",
    "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4",
    "docs/research/step19-paired-table.csv": "10a629e421f2045da67d27385f54c2aa7761acfb770a0058decd5a1e1154d4bb",
    "docs/research/step19-summary.json": "061474f4666d163cdbb0a61f8661d7d0884f6130ae8330135bb5633e84490470",
    "tools/research/evaluate_step19.py": "7706587944a527e55138a7cdd299e62c395bce5c9d2a1ea97c878f9ac26a3784",
    "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
}
COMMITS = {"step17LockCommit": "551668ef", "step18LockCommit": "d505cc5e", "step18bLockCommit": "5b9567e5", "step18bModelCommit": "75020d98", "step18bManifestCommit": "a9225f77", "step19LockCommit": "5f27dc2d", "step19OutputsCommit": "2a681ec2", "step16CohortCommit": "5bc3590b"}
RULE_ID = "model-protocol-step20-generalization-parameter-validation"
ALPHAS = [0, 0.0003, 0.0007, 0.0010, 0.0020]
SECRET_PATTERNS = (r"password", r"passwd", r"api[_-]?key", r"token=", r"authorization", r"Basic [A-Za-z0-9+/=]{8,}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def commit_exists(short):
    try:
        return subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip() == "commit"
    except (OSError, subprocess.SubprocessError):
        return False


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    text = PROTO.read_text(encoding="utf-8"); p = json.loads(PREREG.read_text(encoding="utf-8")); der = json.loads(DERIV.read_text(encoding="utf-8"))
    proto_sha = sha(PROTO)
    rule_map = {l.split()[1]: l.split()[0] for l in RULE_SHA.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(p.get("protocolDocumentSha256") == proto_sha and rule_map.get("docs/research/step20-generalization-protocol.md") == proto_sha, "1 protocol SHA cross-reference")
    check(rule_map.get("docs/research/step20-preregistration.json") == sha(PREREG) and rule_map.get("docs/research/step20-holdout-derivation.json") == sha(DERIV) == p["holdout"]["derivationSha256"], "1 rule file SHAs (preregistration, derivation)")
    check(f"Rule ID: **{RULE_ID}**" in text and p.get("ruleId") == RULE_ID == der["ruleId"], "1 rule ID")
    check("Status: PREREGISTRATION LOCKED" in text and p["status"] == "PREREGISTRATION LOCKED" and p["dataRequirementStatus"] == "STEP20_DATA_REQUIREMENT_BLOCKED" and "STEP20_DATA_REQUIREMENT_BLOCKED" in text, "1 LOCK + data requirement status")
    # 2 ancestry
    ic = p["immutabilityCheck"]
    for rel, expected in ANCESTRY.items():
        check(sha(ROOT / rel) == expected, f"2 ancestor unchanged: {rel}")
        check(expected[:8] in text, f"2 ancestor cited: {rel}")
    for key, short in COMMITS.items():
        check(ic.get(key) == short and commit_exists(short) and short in text, f"2 commit {key}={short}")
    m18b = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r[f]) == r[k] for r in m18b["runs"] for k, f in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile"))), "2 STEP 18b trajectory/result files untouched")
    check(json.loads((ROOT / "docs/research/step18-model-manifest.json").read_text(encoding="utf-8"))["status"] == "MODEL_RUN_BLOCKED_PREFLIGHT" and ic["step18PhaseB"].startswith("BLOCKED"), "2 STEP 18 Phase B remains BLOCKED")
    # 3 alpha candidates parsed from text
    m = re.search(r"α ∈ \{([0-9., ]+)\}", text)
    parsed = [float(x) for x in m.group(1).split(",")] if m else []
    check(parsed == [float(a) for a in ALPHAS] == [float(a) for a in p["alphaCandidates"]], "3 alpha candidate set {0, 0.0003, 0.0007, 0.0010, 0.0020} in order")
    check(p["expectedWinner"] is None and "expected winner" in text and "예상" not in text.split("## 1.")[0][-200:], "3 no expected winner")
    check("STEP 19" in text and "DESCRIPTIVE ONLY" in text and "NOT established" in p["step19Result"], "3 STEP 19 descriptive-only statement")
    # 4 model identical to STEP 18b
    s18b = json.loads((ROOT / "docs/research/step18b-preregistration.json").read_text(encoding="utf-8"))
    check(p["time"] == s18b["time"] and p["interpolation"] == s18b["interpolation"] and p["model"]["equation"] == s18b["model"]["equation"] and p["model"]["mechanicsChangeAllowed"] is False, "4 model/time/interpolation identical to STEP 18b")
    check("300 s" in text and "900 s" in text and "cos φ" in text and "bilinear" in text and "linear 시간 보간" in text, "4 model mechanics in text")
    # 5 calibration = STEP 18b run units
    calib = {u["windowId"]: u for u in p["calibration"]["runUnits"]}
    for u in s18b["runUnits"]:
        c = calib.get(u["windowId"])
        check(c is not None and c["t0"] == u["t0"] and c["end"] == u["end"] and sorted(c["drifterIds"]) == sorted(u["drifterIds"]) and c["forcingSha256"] == u["forcingSha256"] and c["computationArea"] == u["computationArea"], f"5 calibration unit {u['windowId']} = STEP 18b")
        check(f"| {u['windowId']} | {u['t0']} | {u['end']} | {u['drifterCount']} |" in text, f"5 calibration unit {u['windowId']} in text")
    check(len(calib) == 4 and p["calibration"]["uniqueDrifters"] == 23, "5 calibration 4 units / 23 drifters")
    # 6 holdout: re-derive from the derivation file under its stated rule
    rule = der["rule"]; sep = re.search(r"cutoff_r = 그 해역의 마지막 calibration 창 종료 \+ \*\*(\d+)일\*\*", text)
    check(sep and int(sep.group(1)) == rule["separationDays"] == p["holdout"]["temporalSeparationDays"] == 30, "6 separation days parsed (30)")
    check(rule["coverageEnd"] == "2015-12-31T23:59:59Z" and "2015-12-31T23:59:59Z" in text and rule["stopWhenUniqueDrifters"] == 10 and rule["maximumWindows"] == 6 and rule["minimumStartSeparationHours"] == 72, "6 holdout rule constants")
    check(der["forbiddenInputAccess"] == 0 and der["modelRun"] is False and der["forcingAccessed"] is False and der["trajectoryComputed"] is False, "6 derivation used observations only")
    check(der["derivationHash"] in text and der["derivationHash"] == p["holdout"]["derivationHash"], "6 derivation hash cited")
    cohort = json.loads((ROOT / "docs/research/cohort-step16.json").read_text(encoding="utf-8"))
    audit = json.loads((ROOT / "docs/research/step16-selection-audit.json").read_text(encoding="utf-8"))
    for rid, reg in der["regions"].items():
        calib_ids = {d for w in cohort["selectedWindowDetails"][rid] for d in w["newDrifterIds"]}
        last_end = max(ts(w["end"]) for w in cohort["selectedWindowDetails"][rid]); cutoff = last_end + timedelta(days=rule["separationDays"])
        check(ts(reg["cutoff"]) == cutoff and set(reg["calibrationDrifterIds"]) == calib_ids, f"6 {rid} cutoff / calibration ids")
        cands = [r for r in audit["rows"] if r["region"] == rid and r["eligibleWindow"] and ts(r["start"]) >= cutoff and ts(r["end"]) <= ts(rule["coverageEnd"])]
        check(len(cands) == reg["candidateEligibleWindows"] and [r["date"] for r in cands] == reg["candidateDates"], f"6 {rid} candidate windows from audit")
        sel = reg["selected"]; ids = []
        last = None
        for w in sel:
            check(last is None or (ts(w["start"]) - last).total_seconds() >= rule["minimumStartSeparationHours"] * 3600, f"6 {rid} {w['windowId']} start separation")
            check(not (set(w["newDrifterIds"]) & calib_ids) and not (set(w["newDrifterIds"]) & set(ids)) and len(w["newDrifterIds"]) > 0 and ts(w["start"]) >= cutoff, f"6 {rid} {w['windowId']} new ids disjoint from calibration/holdout")
            check(any(r["date"] == w["date"] and r["eligibleCount"] == w["eligibleCount"] for r in cands), f"6 {rid} {w['windowId']} is an eligible candidate")
            ids += w["newDrifterIds"]; last = ts(w["start"])
        expected_status = "HOLDOUT_UNAVAILABLE" if not cands else ("HOLDOUT_MET" if len(ids) >= rule["stopWhenUniqueDrifters"] else "HOLDOUT_UNMET")
        check(reg["status"] == expected_status and reg["holdoutUniqueDrifters"] == len(ids) == len(set(ids)) and p["holdout"]["regions"][rid]["status"] == expected_status, f"6 {rid} status arithmetic ({expected_status})")
        check(len(sel) <= rule["maximumWindows"], f"6 {rid} max windows")
    hold = {u["windowId"]: u for u in p["holdout"]["runUnits"]}
    for rid, reg in der["regions"].items():
        for w in reg["selected"]:
            h = hold.get(w["windowId"])
            check(h is not None and h["t0"] == w["start"] and h["end"] == w["end"] and h["drifterIds"] == w["newDrifterIds"] and h["forcingStatus"].startswith("NOT ACQUIRED"), f"6 preregistration holdout unit {w['windowId']}")
            check(f"| {w['windowId']} | {w['start']} | {w['end']} | {len(w['newDrifterIds'])} |" in text, f"6 holdout unit {w['windowId']} in text")
    check(der["regions"]["KE"]["status"] == "HOLDOUT_MET" and der["regions"]["AG"]["status"] == "HOLDOUT_UNAVAILABLE" and "HOLDOUT_UNAVAILABLE" in text, "6 KE MET / AG UNAVAILABLE recorded")
    check(p["holdout"]["statement"] == "Holdout data are not used for parameter selection, model modification, threshold tuning, or protocol modification." and p["holdout"]["statement"] in text, "6 holdout statement verbatim")
    # 7 data requirements
    dr = p["dataRequirements"]
    check(dr["status"] == "STEP20_DATA_REQUIREMENT_BLOCKED" and dr["R1"]["phaseADownload"] is False and "HYCOM" in dr["R1"]["what"] and "NCEP" in dr["R1"]["what"] and dr["R2"]["decisionTakenHere"] is None and dr["designNotWeakened"] is True, "7 data requirements R1/R2")
    check("(R1)" in text and "(R2)" in text and "Phase A에서는 다운로드하지 않는다" in text, "7 R1/R2 in text")
    # 8 selection rule parsed
    sr = p["alphaSelectionRule"]
    check("**primary = S 위 72 h M3 median**" in text and "**secondary = 48 h M3 median**" in text and "**tertiary = 24 h M3 median**" in text and "**더 작은 α**" in text, "8 selection rule levels in text")
    check(sr["primary"].startswith("72 h M3 median") and sr["secondary"].startswith("48 h") and sr["tertiary"].startswith("24 h") and sr["finalTie"] == "smaller alpha" and sr["holdoutUsed"] is False and sr["meanUsedForSelection"] is False and sr["frozenAfterSelection"] is True, "8 selection rule JSON")
    tie = re.search(r"tie\(\|차이\| ≤ ([0-9e.-]+) km\)", text)
    check(tie and float(tie.group(1)) == sr["tieToleranceKm"] == p["holdoutComparison"]["tieToleranceKm"] == 1e-6, "8 tie tolerance parsed")
    check("choose whichever" not in text.lower() and "lowest holdout" not in text.lower(), "8 no holdout-based selection")
    # 9 horizons, primary metric, holdout comparison
    hz = re.search(r"지평 (\d+) h·(\d+) h·(\d+) h", text)
    check(hz and [int(x) for x in hz.groups()] == [24, 48, 72] == p["primaryMetric"]["horizonsHours"] == p["holdoutComparison"]["horizonsHours"], "9 horizons 24/48/72")
    check("6371008.8" in text and "6371008.8" in p["primaryMetric"]["distance"] and "no interpolation" in p["primaryMetric"]["timestampMatching"] and "보간 없음" in text, "9 haversine + exact UTC")
    check(p["holdoutComparison"]["acceptanceThreshold"] == "NONE" and p["acceptanceThresholds"] == "NONE" and "Acceptance threshold 없음" in text, "9 no acceptance threshold")
    check(set(p["holdoutComparison"]["report"]) >= {"n", "median", "mean", "min", "max", "wins", "losses", "ties"} and "wins, losses, ties" in text, "9 holdout report items")
    check(len(p["generalizationReporting"]["allowedConclusions"]) == 6 and p["generalizationReporting"]["binaryPassFail"] is False and "PASS/FAIL로 압축하지 않는다" in text, "9 six conclusions, no binary")
    # 10 secondary metrics
    check(p["secondaryMetrics"]["M1"] == s18b["metrics"]["M1"] and p["secondaryMetrics"]["M2"] == s18b["metrics"]["M2"] and p["secondaryMetrics"]["M5"] == s18b["metrics"]["M5"] and "M4(generalized)" in text and "NOT_APPLICABLE" in p["secondaryMetrics"]["M4"] and p["secondaryMetrics"]["postHocMetrics"] == "PROHIBITED", "10 secondary metrics incl. generalized M4")
    # 11 strata, small-n, outlier
    check(p["spatialStrata"]["required"] == ["KE", "AG"] and set(p["spatialStrata"]["neverSilentlyExcluded"]) == {"AG-2", "KE-H2"} and p["spatialStrata"]["poolingHidesRegions"] is False and "AG-2(n=1)와 KE-H2(n=1)는 절대 조용히 제외하지 않는다" in text, "11 spatial strata / small units visible")
    check(p["smallSamplePolicy"]["signTestMinimumN"] == 10 and "n < 5인 층은 명시적으로 표시" in text and "n ≥ 10" in text, "11 small-n policy")
    op = p["outlierPolicy"]
    check(all(op[k] is False for k in ("remove", "winsorize", "trim", "replace", "manualExclusion", "failuresRedefinedAfterResults")) and op["topErrorsPerHorizon"] == 3 and "제거·winsorize·trim·대체·수동 제외 금지" in text and "top-3" in text, "11 outlier policy")
    # 12 inference & leakage & forcing
    ip = p["inferencePolicy"]
    check(ip["primary"] == "DESCRIPTIVE" and ip["independenceAssumed"] is False and ip["independentSampleTTest"] is False and ip["anova"] is False and ip["confidenceIntervals"] is False and ip["exploratory"]["acceptanceCriterion"] is False
          and set(ip["acknowledged"]) == {"shared forcing", "shared temporal windows", "regional correlation", "possible common model error"} and "EXPLORATORY, nominal" in text and "\"significant\" 문구 금지" in text, "12 inference policy")
    need = {"selecting alpha after seeing holdout results", "modifying alpha candidates after seeing results", "changing the selection metric after seeing results", "changing calibration/holdout windows after seeing results", "removing unfavorable drifters",
            "changing spatial bounds after seeing results", "changing forcing after seeing results", "re-running only failed/favorable alpha values", "redefining model failure states after seeing results"}
    check(need <= set(p["leakagePrevention"]) and "## 14. 누출 방지" in text, "12 leakage prevention list")
    fp = p["forcingPolicy"]
    check(fp["step17Immutable"] is True and fp["phaseADownload"] is False and fp["substituteForcing"] == "PROHIBITED" and fp["glorys"] == "NOT USED" and "STEP 17 forcing 불변" in text, "12 forcing policy")
    # 13 nothing executed
    ph = p["phaseA"]
    check(ph["modelRuns"] == 0 and ph["newTrajectoryCsvs"] == 0 and ph["forcingDownloads"] == 0 and ph["holdoutResultsInspected"] is False and ph["alphaChosenFromStep19"] is False, "13 phase A counters zero")
    check(not (ROOT / "data/research/step20").exists() and not any((ROOT / "docs/research").glob("step20-*manifest*.json")) and not (ROOT / "docs/research/step20-alpha-selection.json").exists(), "13 no STEP 20 outputs")
    check("data/research/step20/" in (ROOT / ".gitignore").read_text(encoding="utf-8"), "13 .gitignore blocks step20 results")
    check("모델 실행 0회, 새 trajectory 0개, forcing 다운로드 0회" in text, "13 zero-run statement in text")
    for path in (PROTO, PREREG, RULE_SHA, DERIV):
        check(not any(re.search(pat, path.read_text(encoding="utf-8"), re.I) for pat in SECRET_PATTERNS), f"14 no secret pattern in {path.name}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleId": p.get("ruleId"), "status": p.get("status"), "dataRequirementStatus": p.get("dataRequirementStatus"),
                      "protocolSha256": proto_sha, "preregistrationSha256": sha(PREREG), "selectionRuleFileSha256": sha(RULE_SHA), "derivationSha256": sha(DERIV)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

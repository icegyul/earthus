"""Verify the STEP 14 preregistration files before commit. exit 0 = PASS, exit 1 = FAIL.

Checks only the rule/question documents; opens no observation, forcing or result file.
"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/research"
RULE = DOCS / "cohort-selection-rule-step14.json"
QUESTION = DOCS / "research-question-step14.json"
PREREG = DOCS / "step14-preregistration.md"
STEP13_RULE = DOCS / "cohort-selection-rule-v2.json"
STEP13_COHORT = DOCS / "cohort-step12.json"
EXPECTED_REGIONS = {"GS": (32, 40, -75, -55), "KE": (30, 40, 135, 160), "AG": (-40, -30, 15, 35), "BM": (-40, -30, -60, -45)}
# Tokens that only occur when result DATA is embedded/referenced (the prohibited-input lists legitimately name "model trajectories").
FORBIDDEN_TOKENS = ("resultArraySha256", "separationMeters", "run-primary.json", "comparison-v1-v2.json", ".result.json", "deltaV2MinusV1Km")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    rule = json.loads(RULE.read_text(encoding="utf-8"))
    question = json.loads(QUESTION.read_text(encoding="utf-8"))
    prereg = PREREG.read_text(encoding="utf-8")
    check(rule["ruleId"] == "cohort-selection-rule-step14-multi-year", "1 ruleId")
    check(rule["observationPeriod"]["startDate"] == "2010-01-01" and rule["observationPeriod"]["endDate"] == "2020-12-31", "1 observationPeriod 2010-01-01~2020-12-31")
    boxes = {r["id"]: (r["south"], r["north"], r["west"], r["east"]) for r in rule["regions"]}
    check(boxes == EXPECTED_REGIONS, "2 regions == STEP 13 regions")
    old = json.loads(STEP13_RULE.read_text(encoding="utf-8"))
    old_boxes = {r["id"]: (r["south"], r["north"], r["west"], r["east"]) for r in old["candidateRegions"]["regions"]}
    check(boxes == old_boxes, "2 regions identical to cohort-selection-rule-v2")
    adv = rule["advectionCriteria"]
    check(adv["A1"]["threshold"] == 0.30 and adv["A1"]["operator"] == ">=" and adv["A1"]["unit"] == "m/s", "3 A1 == 0.30 m/s")
    check(adv["A2"]["threshold"] == 40 and adv["A2"]["operator"] == ">=" and adv["A2"]["unit"] == "km", "4 A2 == 40 km")
    check(adv["A3"]["threshold"] == 90 and adv["A3"]["operator"] == "<=", "5 A3 == 90 deg")
    check(rule["regionMinimumEligible"] == 8, "6 eligibleMinimum == 8")
    check(rule["totalMinimumEligible"] == 20, "7 totalMinimum == 20")
    check(rule["requiredRegions"] == 2, "8 requiredRegions == 2")
    check(rule["horizonHours"] == 72, "9 horizon == 72h")
    check(rule["dailyStartUTC"] == "12:00", "10 daily start == 12Z")
    check(rule["forcingBlind"] is True, "11 forcingBlind")
    check(rule["modelBlind"] is True, "12 modelBlind")
    check(rule["previousStepBlockedPreserved"] is True and rule["previousStep"]["status"] == "COHORT SELECTION BLOCKED", "13 previousStepBlockedPreserved")
    check(rule["previousStep"]["cohortFileSha256"] == sha(STEP13_COHORT), "13 STEP 13 cohort file unchanged")
    check(rule["supersedesSha256"] == sha(STEP13_RULE), "13 STEP 12 rule unchanged")
    text = RULE.read_text(encoding="utf-8") + QUESTION.read_text(encoding="utf-8") + prereg
    check(not any(tok in text for tok in FORBIDDEN_TOKENS), "14 no HYCOM/GLORYS/V1/V2 result references")
    check(rule["noResultLeakage"] is True and "HYCOM" in rule["prohibitedInputsDuringSelection"] and "GLORYS" in rule["prohibitedInputsDuringSelection"], "14 prohibited inputs declared")
    check(question["computationPerformed"] is False and question["cohortSelected"] is False and rule["status"].startswith("RULE_FIXED"), "15 no model execution / no selection")
    check(question["questionId"] == "Q3-multi-year-advection-regime-cohort-availability" and question["ruleId"] == rule["ruleId"], "question binds rule")
    check("관측기간만 2010–2020으로 확대" in prereg and "실제 cohort selection 전에 commit" in prereg, "preregistration statements present")
    check(not (DOCS / "cohort-step14.json").exists(), "no STEP 14 cohort file exists yet")
    report = {"result": "PASS" if not failures else "FAIL", "failures": failures,
              "sha256": {p.name: sha(p) for p in (RULE, QUESTION, PREREG)}}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

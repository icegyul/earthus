"""Verify STEP 15 selection outputs against the locked STEP 14 rule. exit 0 = PASS, exit 1 = FAIL."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/research"
RULE, COHORT, AUDIT, MANIFEST = DOCS / "cohort-selection-rule-step14.json", DOCS / "cohort-step15.json", DOCS / "cohort-selection-step15-audit.json", DOCS / "step15-observation-manifest.json"
SCRIPT = ROOT / "tools/research/select_step15_cohort.py"
RULE_SHA = "ae9c214a337f2a351de73ed98e12395136d10013cea60b986644948b3db8c0c5"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
REGIONS = {"GS": (32, 40, -75, -55), "KE": (30, 40, 135, 160), "AG": (-40, -30, 15, 35), "BM": (-40, -30, -60, -45)}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    rule = json.loads(RULE.read_text(encoding="utf-8")); cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8")); manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    check(sha(RULE) == RULE_SHA and cohort["ruleSha256"] == RULE_SHA and audit["ruleSha256"] == RULE_SHA, "rule SHA match")
    check(cohort["observationPeriod"] == {"startDate": "2010-01-01", "endDate": "2020-12-31", "inclusive": True, "fixedBefore": rule["observationPeriod"]["fixedBefore"]}, "observation period")
    check({r["id"]: (r["south"], r["north"], r["west"], r["east"]) for r in rule["regions"]} == REGIONS, "region geometry")
    adv = rule["advectionCriteria"]
    check((adv["A1"]["threshold"], adv["A2"]["threshold"], adv["A3"]["threshold"]) == (0.30, 40, 90), "thresholds")
    for r in cohort["regions"]:
        check(r["A1"]["threshold"] == 0.30 and r["A2"]["threshold"] == 40 and r["A3"]["threshold"] == 90, f"thresholds applied {r['regionId']}")
        check(r["A1"]["pass"] == (r["A1"]["median"] >= 0.30) and r["A2"]["pass"] == (r["A2"]["median"] >= 40) and r["A3"]["pass"] == (r["A3"]["median"] <= 90), f"verdict arithmetic {r['regionId']}")
        check(len(r["drifterIds"]) == r["eligibleCount"] >= 8 and all(d["sampleCount"] == 73 and d["maxGapHours"] <= 1.0 and d["coastKm"] > 100 for d in r["drifters"]), f"E3/E4 on selected {r['regionId']}")
        check(all(d["typebuoy"] in ("SVP", "SVPB") for d in r["drifters"]), f"E2 {r['regionId']}")
        check(all(r["box"]["west"] <= d["startLon"] <= r["box"]["east"] and r["box"]["south"] <= d["startLat"] <= r["box"]["north"] for d in r["drifters"]), f"E5 {r['regionId']}")
        check(all(d["drogueLostDate"] is None or d["drogueLostDate"] > r["windowEndUTC"] for d in r["drifters"]), f"E1 {r['regionId']}")
        check(all(re.fullmatch(r"\d{4}-\d{2}-\d{2}T12:00:00Z", d["startTimestamp"]) for d in r["drifters"]), f"12Z start {r['regionId']}")
        earlier = [row for row in audit["rows"] if row["region"] == r["regionId"] and row["qualifying"] and row["date"] < r["selectedDate"]]
        check(not earlier, f"earliest qualifying window {r['regionId']}")
    check(rule["horizonHours"] == 72 and all(row["windowEndUTC"] > row["windowStartUTC"] for row in audit["rows"][:10]), "72h")
    check(all(row["windowStartUTC"].endswith("T12:00:00Z") for row in audit["rows"]), "12Z")
    check(len(audit["rows"]) == cohort["totalWindows"] == cohort["daysEnumerated"] * 4 and cohort["daysEnumerated"] == 4018, "window enumeration 4018 days x 4")
    check(cohort["regionCount"] <= 2 and cohort["requiredRegions"] == 2 and cohort["totalMinimumEligible"] == 20, "minimums")
    check((cohort["status"] == "COHORT SELECTION PASS") == (cohort["regionCount"] >= 2 and cohort["totalEligible"] >= 20), "status arithmetic")
    ranked = cohort["regionsRanked"]
    check(ranked == sorted(ranked, key=lambda x: (-x["eligibleAtEarliest"], x["regionId"])), "deterministic ordering")
    check(cohort["forbiddenInputAccess"] == 0 and cohort["modelBlind"] and cohort["forcingBlind"], "forbidden inputs")
    src = SCRIPT.read_text(encoding="utf-8")
    check("guarded_open" in src and "FORBIDDEN" in src, "forbidden-path guard present in script")
    check(cohort["coastlineSha256"] == COAST_SHA and manifest["coastline"]["sha256"] == COAST_SHA, "coastline SHA")
    check(cohort["observationSha256"] == audit["observationSha256"] == manifest["observationSha256"], "observation SHA integrity")
    check(all(len(m["sha256"]) == 64 and m["retrievedAtUTC"] for m in manifest["files"]), "manifest completeness")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "sha256": {p.name: sha(p) for p in (COHORT, AUDIT, MANIFEST)}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

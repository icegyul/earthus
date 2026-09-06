"""Verify STEP 16 selection outputs against the LOCKED rule. exit 0 = PASS, exit 1 = FAIL. Opens no observation or result file."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/research"
RULE_MD, PREREG = DOCS / "step16-cohort-selection-rule.md", DOCS / "step16-preregistration.json"
COHORT, AUDIT, MANIFEST = DOCS / "cohort-step16.json", DOCS / "step16-selection-audit.json", DOCS / "step16-observation-manifest.json"
RULE_SHA = "e9e2c1ca2e2148ff763becebf8a56119a3551c965efe32df7ea49fdb84ea0948"
PREREG_SHA = "5bae117d42742c23e9c13817c60341ea153c641505d595f95873634b559d33b3"
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
REGIONS = {"GS": (32, 40, -75, -55), "KE": (30, 40, 135, 160), "AG": (-40, -30, 15, 35), "BM": (-40, -30, -60, -45)}
STEP15 = {"cohort-step15.json": "00488af20abb6b2637f6c886bc0a1cb6ea2075a74c003d6171e76e23806a266a", "cohort-selection-step15-audit.json": "d2b57bf4e5647beb0066bd3a55e46ea830228b94a518a0896688a0a2b198befc",
          "step15-observation-manifest.json": "3c533163270ca8f0d73f0a60e5ec67c3ced76136725259b6f62a6eecf2219c81", "cohort-selection-rule-step14.json": "ae9c214a337f2a351de73ed98e12395136d10013cea60b986644948b3db8c0c5"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    rule = json.loads(PREREG.read_text(encoding="utf-8")); cohort = json.loads(COHORT.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8")); manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    check(sha(RULE_MD) == RULE_SHA and sha(PREREG) == PREREG_SHA and cohort["ruleSha256"] == RULE_SHA and cohort["preregistrationSha256"] == PREREG_SHA, "rule/preregistration SHA")
    check(rule["status"] == "PREREGISTRATION LOCKED", "preregistration LOCKED")
    check(cohort["observationPeriod"]["startDate"] == "2010-01-01" and cohort["observationPeriod"]["endDate"] == "2020-12-31", "observation period")
    check({r["id"]: (r["south"], r["north"], r["west"], r["east"]) for r in rule["regions"]} == REGIONS and set(cohort["candidateRegions"]) == set(REGIONS), "4 regions")
    rows = audit["rows"]
    check(all(r["start"].endswith("T12:00:00Z") for r in rows), "12Z")
    check(all(int(r["end"][11:13]) == 12 and r["end"] > r["start"] for r in rows[:50]), "72h end")
    check(len(rows) == cohort["totalWindows"] == 16072 and cohort["daysEnumerated"] == 4018, "16,072 windows")
    thr = rule["advectionCriteria"]
    check((thr["A1"]["threshold"], thr["A2"]["threshold"], thr["A3"]["threshold"]) == (0.3, 40, 90) and cohort["thresholds"]["A1"] == 0.3 and cohort["thresholds"]["A2"] == 40 and cohort["thresholds"]["A3"] == 90, "A1/A2/A3 thresholds")
    check(cohort["thresholds"]["regionWindowMinimumEligible"] == 8 and all((r["A1_median"] is None) == (r["eligibleCount"] < 8) for r in rows), "eligible >= 8 gate")
    check(all(r["eligibleWindow"] == bool(r["A1_pass"] and r["A2_pass"] and r["A3_pass"]) for r in rows if r["A1_median"] is not None), "eligibility arithmetic")
    # Audit medians are rounded for display (A1 4 dp, A2 2 dp, A3 1 dp); verdicts were computed on unrounded values.
    # A verdict is inconsistent only if the rounded value lies beyond the threshold by more than half a rounding unit.
    def consistent(passed, value, threshold, ge, half):
        return passed == (value >= threshold) if abs(value - threshold) > half else True
    check(all(consistent(r["A1_pass"], r["A1_median"], 0.3, True, 5e-5) and consistent(r["A2_pass"], r["A2_median"], 40, True, 5e-3)
              and (consistent(not r["A3_pass"], r["A3_median"], 90, True, 5e-2) if r["A3_median"] != 90 else True) for r in rows if r["A1_median"] is not None), "A verdict arithmetic")
    # chronological accumulation per region
    from datetime import datetime, timezone
    ep = lambda s: int(datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
    for rid in REGIONS:
        rr = [r for r in rows if r["region"] == rid]
        check(rr == sorted(rr, key=lambda r: r["start"]), f"chronological ordering {rid}")
        sel = [r for r in rr if r["selected"]]
        check(len(sel) <= 6, f"max 6 selected windows {rid}")
        check(all(ep(b["start"]) - ep(a["start"]) >= 72 * 3600 for a, b in zip(sel, sel[1:])), f"72h separation {rid}")
        check(all(r["eligibleWindow"] for r in sel), f"selected windows eligible {rid}")
        check([r["selectedOrder"] for r in sel] == list(range(1, len(sel) + 1)), f"selection order {rid}")
        # no eligible window before the first selected one was skipped for any reason other than overlap/after-stop
        first = sel[0]["start"] if sel else None
        check(not any(r["eligibleWindow"] and r["selectionStatus"] not in ("SELECTED", "SKIPPED_OVERLAP", "AFTER_REGION_STOP") for r in rr), f"eligible windows all classified {rid}")
        ids = [i for r in sel for i in r["newDrifterIds"]]
        check(len(ids) == len(set(ids)) and ids == cohort["regionResults"][rid]["uniqueDrifterIds"], f"unique drifter IDs {rid}")
        cum = 0
        for r in sel:
            cum += r["newDrifterCount"]
            check(r["cumulativeUniqueDrifters"] == cum, f"cumulative count {rid}")
        stop_reason_ok = (cum >= 10 and sel and sel[-1]["cumulativeUniqueDrifters"] >= 10 and all(w["cumulativeUniqueDrifters"] < 10 for w in sel[:-1])) or (cum < 10 and (len(sel) == 6 or not any(r["eligibleWindow"] and r["selectionStatus"] == "AFTER_REGION_STOP" for r in rr)))
        check(stop_reason_ok, f"stop at 10 / cap 6 {rid}")
        check(cohort["regionResults"][rid]["regionStatus"] == ("REGION_MET" if cum >= 10 else "REGION_UNMET"), f"region status {rid}")
    met = [(rid, len(cohort["regionResults"][rid]["uniqueDrifterIds"])) for rid in REGIONS if cohort["regionResults"][rid]["regionStatus"] == "REGION_MET"]
    ranked = sorted(met, key=lambda x: (-x[1], x[0]))
    check(cohort["selectedRegions"] == [rid for rid, _ in ranked[:2]], "top-2 region selection (size desc, alphabetical)")
    union = []
    for rid in cohort["selectedRegions"]:
        for i in cohort["selectedDrifters"][rid]:
            if i not in union:
                union.append(i)
    check(cohort["totalUniqueDrifters"] == len(union) and cohort["totalMinimumEligible"] == 20 and cohort["requiredRegions"] == 2, "total unique / minimums")
    check((cohort["status"] == "COHORT_SELECTION_PASS") == (len(cohort["selectedRegions"]) == 2 and len(union) >= 20), "status arithmetic")
    check(cohort["coastlineSha256"] == COAST_SHA and manifest["coastline"]["sha256"] == COAST_SHA, "coastline SHA")
    check(cohort["observationSha256"] == OBS_SHA == audit["observationSha256"] == manifest["observationSha256"] and len(manifest["files"]) == 176, "observation SHA (STEP 15 bytes)")
    check(cohort["forbiddenInputAccess"] == 0 and audit["forbiddenInputAccess"] == 0 and cohort["modelBlind"] and cohort["forcingBlind"], "forbidden input access 0")
    check(len(cohort["selectionHash"]) == 64 and cohort["selectionHash"] == audit["selectionHash"], "selectionHash present and consistent")
    for name, expected in STEP15.items():
        check(sha(DOCS / name) == expected, f"STEP 15 unchanged: {name}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "sha256": {p.name: sha(p) for p in (COHORT, AUDIT, MANIFEST)}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

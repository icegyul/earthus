"""Independent fail-closed validator for STEP 45C (authorized validation cohort derivation). exit 0 = PASS.
Verifies the 30 mandated items: STEP 45B / 44 / 45A identities and ancestry · STEP 35 eligibility SHA · STEP 15 observation aggregate SHA
(176 files, recomputed) and coastline SHA · authorized field list exactly 7 · KE-only observation access (no other region file read) ·
authorized temporal range and the recorded extra interval · frozen STEP 16 E1-E5 / A1-A3 logic (every selected and every logged window's
eligible count re-derived and compared with the frozen audit count) · 88 excluded IDs and their list hash · ±72 h prior-window exclusions
inherited · KE rank-1 rule recomputed from frozen metadata · candidate window list, chronological order, >= 72 h separation between selected
windows · per-window eligible IDs, new-ID calculation and cumulative unique IDs recomputed independently · first-prefix rule, 6 / 20 gate and
max 12 · no manual selection · no performance / forcing / trajectory / model access · deterministic derivation (independent re-run into a
temporary directory compared byte for byte apart from createdAtUTC) · manifest / status / report consistency · observation-access audit.
Deterministic output."""
import hashlib
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
MAN, STAT, REP = D / "step45c-validation-cohort-manifest.json", D / "step45c-validation-cohort-status.json", D / "step45c-validation-cohort-report.md"
P44_SHA = "6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f"
R45A_SHA = "d186cf424eb691d2e7b0d0f12ae2967c027c3e75d07956a5197a840cc3fc781f"
AM45B_SHA = "88398dc62fb6a18e1fe5d2d8d83feff17a77f2aa4c9d0c9136008c47d38a2e4b"
ELIG35_SHA = "d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b"
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
COMMITS = {"step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9", "step45a": "b0f0274f14ae491e34f0bcb85874056d92260f46", "step45b": "7249c38d355f97c4f264d2f4d7611ce5013bd8d7", "step36": "043a09b8539955868651a06e7c2c44e3c606803f"}
FIELDS = ["ID", "time", "latitude", "longitude", "gap", "drogue_lost_date", "typebuoy"]
FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    M, S = load(MAN), load(STAT); T = REP.read_text(encoding="utf-8")
    sys.path.insert(0, str(ROOT / "tools/research"))
    import select_step16_cohort as s16
    import builtins
    builtins.open = s16._open
    # 1-3 authorisation identities and ancestry
    A = M["authorization"]
    check(A["step44ProtocolSha256"] == sha(D / "step44-validation-preregistration-protocol.json") == P44_SHA, "2 STEP 44 identity")
    check(A["step45aRecordSha256"] == sha(D / "step45a-validation-input-recovery.json") == R45A_SHA, "3 STEP 45A identity")
    check(A["step45bAmendmentSha256"] == sha(D / "step45b-validation-protocol-amendment.json") == AM45B_SHA, "1 STEP 45B identity")
    for k, c in COMMITS.items():
        check(git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1-3 ancestry {k}")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "1-3 no tracked research file modified")
    # 4-5 frozen sources
    check(A["step35EligibilitySha256"] == sha(D / "step35-window-eligibility.json") == ELIG35_SHA, "4 STEP 35 eligibility SHA")
    raw = sorted(s16.RAW.glob("*-*-q*.csv"))
    entries = [{"filename": f.name, "sha256": s16.sha(f), "bytes": f.stat().st_size} for f in raw]
    obs = hashlib.sha256(canonical(entries)).hexdigest()
    check(obs == OBS_SHA == M["source"]["observationAggregateSha256"] and len(raw) == 176 == M["source"]["filesInAggregate"], "5 STEP 15 observation aggregate SHA (176 files)")
    check(sha(s16.COAST) == COAST_SHA == M["source"]["coastlineSha256"], "5 coastline SHA")
    # 6-8 scope
    am = load(D / "step45b-validation-protocol-amendment.json")
    check(M["authorizedFields"] == FIELDS == am["allowedFields"]["fields"] and len(FIELDS) == 7, "6 authorized field list = exactly 7")
    check(M["geographicScope"]["region"] == "KE" and M["geographicScope"]["otherRegionsRead"] == [] and all(f.startswith("KE-") for f in M["source"]["regionFilesRead"]) and M["source"]["regionFileCount"] == len(M["source"]["regionFilesRead"]), "7 KE-only observation access")
    R = load(D / "step44-validation-preregistration-protocol.json")["4_validationCohortRule"]
    check(M["temporalScope"]["t0"] == R["calendarPeriod"]["t0"] == "2010-11-18T12:00:00Z" and M["temporalScope"]["t1"] == R["calendarPeriod"]["t1"] and "extraIntervalRead" in M["temporalScope"] and "regionFileScopeNote" in M["temporalScope"], "8 authorized temporal range and recorded extra interval")
    # 10-11 exclusions
    E = M["exclusionIdentity"]
    check(E["excludedDrifterIdCount"] == 88 == R["exclusionIdentity"]["excludedDrifterIdCount"] and E["sha256OfSortedIdList"] == R["exclusionIdentity"]["sha256OfSortedIdList"] == hashlib.sha256("\n".join(sorted(R["exclusionIdentity"]["excludedDrifterIds"])).encode()).hexdigest(), "10 88 excluded IDs unchanged")
    check(E["priorWindowStartsByRegion"] == R["exclusionIdentity"]["priorWindowStartsByRegion"], "11 ±72 h prior-window exclusions inherited")
    # 12-13 region ranking and candidate list, recomputed from frozen metadata
    elig = load(D / "step35-window-eligibility.json")
    counts = {r: sum(1 for w in elig["windows"] if w["region"] == r and w["windowEligible"] and R["calendarPeriod"]["t0"] <= w["start"] <= R["calendarPeriod"]["t1"]) for r in R["regionRule"]["candidates"]}
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    check(counts == M["regionRanking"]["counts"] == {"KE": 26, "BM": 3, "AG": 0} and ranked[0][0] == "KE" == M["regionRanking"]["selectedRegion"] and "not observations" in M["regionRanking"]["source"], "12 KE rank-1 rule recomputed from frozen metadata")
    cands = sorted([w for w in elig["windows"] if w["region"] == "KE" and w["windowEligible"] and R["calendarPeriod"]["t0"] <= w["start"] <= R["calendarPeriod"]["t1"]], key=lambda r: (r["start"], r["region"]))
    check(len(cands) == 26 == M["candidateWindowsExamined"] and [e["start"] for e in M["accumulationLog"]] == [c["start"] for c in cands], "13-14 candidate window list and chronological order")
    # 9, 16-19 independent re-derivation of eligibility, new IDs, cumulative and prefix
    coast = s16.Coast(s16.COAST); tracks, ke_files, _ = s16.load_region("KE"); cache = {}
    excluded = set(R["exclusionIdentity"]["excludedDrifterIds"]); box = load(D / "cohort-step16.json")["regionResults"]["KE"]["box"]
    ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)
    sel, ids, last, prefix = [], [], None, None
    for c in cands:
        t0 = ts(c["start"])
        if last is not None and (t0 - last) < timedelta(hours=72):
            continue
        eligible, _ = s16.evaluate(box, tracks, int(t0.timestamp()), coast, cache)
        check(len(eligible) == c["auditEligibleCount"], f"9 frozen STEP 16 eligibility reproduces the audit count at {c['start']}")
        eids = sorted(e["drifterId"] for e in eligible)
        new = sorted(i for i in eids if i not in excluded and i not in ids)
        if not new:
            continue
        ids.extend(new); last = t0
        sel.append({"start": c["start"], "eligibleDrifterIds": eids, "newUniqueDrifterIds": new, "cumulative": len(ids)})
        if prefix is None and len(sel) >= 6 and len(ids) >= 20:
            prefix = len(sel); break
        if len(sel) >= 12:
            break
    W = M["selectedWindows"]
    check(len(W) == len(sel) and all(w["start"] == s["start"] and w["eligibleDrifterIds"] == s["eligibleDrifterIds"] and w["newUniqueDrifterIds"] == s["newUniqueDrifterIds"] and w["cumulativeUniqueDrifters"] == s["cumulative"] for w, s in zip(W, sel)), "16-18 per-window eligible IDs, new-ID calculation and cumulative unique IDs reproduced")
    check(sorted(ids) == M["cohort"]["drifterIds"] and len(ids) == M["cohort"]["uniqueDrifters"] and M["cohort"]["firstPrefixWindowCount"] == prefix, "19 first-prefix rule reproduced")
    starts = [w["start"] for w in W]
    check(starts == sorted(starts) and all((ts(b) - ts(a)) >= timedelta(hours=72) for a, b in zip(starts, starts[1:])), "15 >= 72 h separation between selected windows")
    # 20-22 gate and status
    G = M["gate"]
    check(G["minimumWindows"] == 6 and G["minimumUniqueDrifters"] == 20 and G["maximumWindows"] == 12 and len(W) <= 12, "20-21 gate thresholds and max 12")
    ok = len(W) >= 6 and len(ids) >= 20
    check(G["satisfied"] == ok and M["status"] == ("VALIDATION_COHORT_LOCKED" if ok else "VALIDATION_COHORT_BLOCKED") == S["status"], "20 status follows the gate deterministically")
    if not ok:
        check(S["ruleRelaxed"] is False and S["periodExtended"] is False and S["regionAdded"] is False and S["thresholdReduced"] is False and S["separationAltered"] is False and S["manualSelection"] is False, "22 blocked without relaxation, extension, region addition or manual selection")
    check(M["noExperiment"]["manualSelection"] is False, "22 no manual selection")
    # 14 independence
    I = M["independence"]
    check(I["overlapWithPrimaryDrifterIds"] == [] and I["overlapWithExcludedIds"] == [] and I["allStartsAfterT0"] is True and I["overlapWithPrimaryWindowStarts"] == [], "14 independence: no ID or window overlap")
    # 23-26 no scientific access
    N = M["noExperiment"]
    check(N["modelRun"] == 0 and N["trajectoryComputed"] is False and N["forcingDownloaded"] is False and N["velocityRead"] is False and N["bootstrapRun"] == 0 and N["performanceInspected"] is False and N["errorCalculated"] is False and N["sourceSelected"] is False and N["parameterTuned"] is False, "23-26 no performance / forcing / trajectory / model access")
    au = M["sourceAccessAudit"]
    check(au["forbiddenInputAccess"] == 0 and au["observationFilesRead"] == M["source"]["regionFileCount"] == 44 and au["observationRecordsRead"] > 0, "30 observation-access audit integrity")
    # 27-29 deterministic re-run and consistency
    core = {"region": "KE", "period": [R["calendarPeriod"]["t0"], R["calendarPeriod"]["t1"]], "selected": [{k: w[k] for k in ("windowId", "start", "end", "eligibleDrifterIds", "newUniqueDrifterIds")} for w in W], "drifterIds": sorted(ids), "prefix": prefix}
    check(M["derivationHash"] == hashlib.sha256(canonical(core)).hexdigest() == S["derivationHash"], "27 deterministic derivation hash reproduced")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/derive_step45c_validation_cohort.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        p = Path(tmp) / "step45c-validation-cohort-manifest.json"
        strip = lambda d: {k: v for k, v in d.items() if k != "createdAtUTC"}
        check(p.exists() and strip(load(p)) == strip(M), "29 independent re-run byte-identical apart from createdAtUTC")
    check(S["manifestSha256"] == sha(MAN) and S["deriverSha256"] == sha(ROOT / "tools/research/derive_step45c_validation_cohort.py") and S["replay"]["byteIdenticalExceptCreatedAtUTC"] is True, "28 status consistent with manifest and deriver")
    for s in (M["status"], M["derivationHash"][:16], "KE", "26", "88", str(len(W)), str(len(ids)), OBS_SHA, "no validation performance"):
        check(s in T, f"28 report states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": M["status"], "candidates": len(cands), "selectedWindows": len(W),
                      "uniqueDrifters": len(ids), "gateSatisfied": ok, "derivationHash": M["derivationHash"][:16], "observationFilesRead": au["observationFilesRead"], "forbiddenInputAccess": au["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Independent fail-closed validator for STEP 47 (validation-extension cohort derivation). exit 0 = PASS.
Verifies the 32 mandated items: STEP 46 / 45C / 45B / 44 identities and ancestry · STEP 35 eligibility SHA · STEP 15 observation aggregate
SHA (176 files, recomputed) and coastline SHA · authorized field list exactly 7 · observation content read only for regions in the domain
(GS never read) · frozen t0 / t1 · frozen STEP 16 E1-E5 / A1-A3 logic (every evaluated window's eligible count re-derived and compared with
the frozen audit count) · 88 excluded IDs and their list hash · ±72 h prior-window exclusions inherited · chronological (start, region)
ordering with alphabetical tie-break · same-region >= 72 h separation · per-window eligible IDs, new-ID sets and cumulative unique counts
recomputed independently · first-prefix rule, >= 6 windows, >= 20 unique drifters, max 12 · no performance / forcing / trajectory / model /
bootstrap access · primary-versus-extension independence · deterministic derivation and replay identity (independent re-run compared byte
for byte apart from createdAtUTC) · manifest / status / report consistency · data-minimisation compliance · observation-access audit.
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
MAN, STAT, REP = D / "step47-validation-extension-cohort-manifest.json", D / "step47-validation-extension-cohort-status.json", D / "step47-validation-extension-cohort-report.md"
SHAS = {"docs/research/step46-validation-extension-preregistration-protocol.json": "c824b053fdeea20336f1396dc503232492ab77e1f9d5f032586b23c47d66862d",
        "docs/research/step45c-validation-cohort-manifest.json": "65a9fc5a5efe40f266c94e0db9d93c969f702fde897a9030e1b01fbf264c4856",
        "docs/research/step45b-validation-protocol-amendment.json": "88398dc62fb6a18e1fe5d2d8d83feff17a77f2aa4c9d0c9136008c47d38a2e4b",
        "docs/research/step44-validation-preregistration-protocol.json": "6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f",
        "docs/research/step35-window-eligibility.json": "d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b"}
COMMITS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4",
           "step40": "2b1a7baa7ef9e69d25cecbff2b09fca8700fca80", "step42": "bae85245e827f53ee9782201c442ea7849c04e82", "step43": "15970d9735330fb937e86af449c1deef6763b5d1",
           "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9", "step45b": "7249c38d355f97c4f264d2f4d7611ce5013bd8d7", "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd",
           "step46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7"}
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
REGIONS = ["AG", "BM", "KE"]
FIELDS = ["ID", "time", "latitude", "longitude", "gap", "drogue_lost_date", "typebuoy"]
T0, T1 = "2010-11-18T12:00:00Z", "2015-12-31T21:00:00Z"
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
    # 1-5 identities and ancestry
    for rel, h in SHAS.items():
        check(sha(ROOT / rel) == h, f"1-5 identity {rel}")
    A = M["authorization"]
    check(A["step46ProtocolSha256"] == SHAS["docs/research/step46-validation-extension-preregistration-protocol.json"] and A["step45cManifestSha256"] == SHAS["docs/research/step45c-validation-cohort-manifest.json"] and A["step45bAmendmentSha256"] == SHAS["docs/research/step45b-validation-protocol-amendment.json"] and A["step44ProtocolSha256"] == SHAS["docs/research/step44-validation-preregistration-protocol.json"] and A["step35EligibilitySha256"] == SHAS["docs/research/step35-window-eligibility.json"], "1-5 manifest records the lock identities")
    for k, c in {**COMMITS, "runtime": "155995dd"}.items():
        check(git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1-4 ancestry {k}")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "1-5 no tracked research file modified")
    # 6 observation aggregate and coastline
    raw = sorted(s16.RAW.glob("*-*-q*.csv"))
    obs = hashlib.sha256(canonical([{"filename": f.name, "sha256": s16.sha(f), "bytes": f.stat().st_size} for f in raw])).hexdigest()
    check(obs == OBS_SHA == M["source"]["observationAggregateSha256"] and len(raw) == 176 == M["source"]["filesInAggregate"], "6 STEP 15 observation aggregate SHA")
    check(sha(s16.COAST) == COAST_SHA == M["source"]["coastlineSha256"], "6 coastline SHA")
    # 7-9 scope
    am = load(D / "step45b-validation-protocol-amendment.json")
    check(M["authorizedFields"] == FIELDS == am["allowedFields"]["fields"] and len(FIELDS) == 7, "7 authorized field list = exactly 7")
    GD = M["geographicDomain"]; P46 = load(D / "step46-validation-extension-preregistration-protocol.json")
    check(sorted(GD["regions"]) == REGIONS == sorted(P46["6_extensionDomain"]["candidateRegionSet"]) and GD["allMandatory"] is True and GD["ranking"] is False and GD["subsetting"] is False and GD["quotas"] is False and GD["balancing"] is False and GD["regionDiscardedForSmallContribution"] is False, "8 KE / BM / AG only, all mandatory, no ranking or quotas")
    check(all(r in REGIONS for r in M["source"]["regionsRead"]) and "GS" not in M["source"]["regionsRead"] and M["independence"]["gsObservationContentRead"] is False and all(f.startswith(r + "-") for r, fl in M["source"]["regionFilesRead"].items() for f in fl), "8 no GS or out-of-domain observation content read")
    check(M["temporalScope"]["t0"] == T0 == P46["10_temporalRule"]["t0_extension"] and M["temporalScope"]["t1"] == T1 == P46["10_temporalRule"]["t1_extension"] and M["temporalScope"]["temporallyIndependentOfOriginalValidation"] is False, "9 frozen t0 / t1 and the temporal-overlap disclosure")
    # 11-12 exclusions
    X = M["exclusionIdentity"]; X46 = P46["5_independentDataRequirement"]["exclusionIdentity"]
    check(X["excludedDrifterIdCount"] == 88 == X46["excludedDrifterIdCount"] and X["sha256OfSortedIdList"] == X46["sha256OfSortedIdList"] == hashlib.sha256("\n".join(sorted(X46["excludedDrifterIds"])).encode()).hexdigest(), "11 88 excluded IDs unchanged")
    check(X["priorWindowStartsByRegion"] == X46["priorWindowStartsByRegion"], "12 ±72 h prior-window exclusions inherited")
    # 13 candidate set and ordering, recomputed
    elig = load(D / "step35-window-eligibility.json"); cohort = load(D / "cohort-step16.json")
    counts = {r: sum(1 for w in elig["windows"] if w["region"] == r and w["windowEligible"] and T0 <= w["start"] <= T1) for r in REGIONS}
    check(counts == M["regionCounts"]["recomputed"] == {"KE": 26, "BM": 3, "AG": 0} and M["regionCounts"]["step46AuditExpectation"] == counts and M["regionCounts"]["match"] is True, "15 per-region counts recomputed and equal to the STEP 46 audit expectation")
    cands = sorted([w for w in elig["windows"] if w["region"] in REGIONS and w["windowEligible"] and T0 <= w["start"] <= T1], key=lambda r: (r["start"], r["region"]))
    check(len(cands) == M["candidateWindowCount"] == 29 and [(c["region"], c["start"]) for c in cands] == [(e["region"], e["start"]) for e in M["accumulationLog"]], "13 candidate window list and (start, region) chronological ordering")
    # 10, 14-18 independent re-derivation
    coast = s16.Coast(s16.COAST); excluded = set(X46["excludedDrifterIds"])
    ts = lambda s: datetime.strptime(s, FMT).replace(tzinfo=timezone.utc)
    tracks, caches = {}, {}
    sel, ids, last, prefix = [], [], {}, None
    for c in cands:
        r = c["region"]; t0 = ts(c["start"])
        if r in last and (t0 - last[r]) < timedelta(hours=72):
            continue
        if r not in tracks:
            tracks[r] = s16.load_region(r)[0]; caches[r] = {}
        eligible, _ = s16.evaluate(cohort["regionResults"][r]["box"], tracks[r], int(t0.timestamp()), coast, caches[r])
        check(len(eligible) == c["auditEligibleCount"], f"10 frozen E1-E5 / A1-A3 reproduces the audit count at {r} {c['start']}")
        eids = sorted(e["drifterId"] for e in eligible)
        new = sorted(i for i in eids if i not in excluded and i not in ids)
        if not new:
            continue
        ids.extend(new); last[r] = t0
        sel.append({"region": r, "start": c["start"], "eligibleDrifterIds": eids, "newUniqueDrifterIds": new, "cumulative": len(ids)})
        if prefix is None and len(sel) >= 6 and len(ids) >= 20:
            prefix = len(sel); break
        if len(sel) >= 12:
            break
    W = M["selectedWindows"]
    check(len(W) == len(sel) and all(w["region"] == s["region"] and w["start"] == s["start"] and w["eligibleDrifterIds"] == s["eligibleDrifterIds"] and w["newUniqueDrifterIds"] == s["newUniqueDrifterIds"] and w["newUniqueCount"] == len(s["newUniqueDrifterIds"]) and w["cumulativeUniqueDrifters"] == s["cumulative"] for w, s in zip(W, sel)), "15-17 per-window eligible IDs, new-ID sets and cumulative unique counts reproduced")
    check(sorted(ids) == M["cohort"]["drifterIds"] == S["cohort"]["drifterIds"] and len(ids) == M["cohort"]["uniqueDrifters"] and M["cohort"]["firstPrefixWindowCount"] == prefix, "18 first-prefix rule reproduced")
    for r in REGIONS:
        starts = [ts(w["start"]) for w in W if w["region"] == r]
        check(all((b - a) >= timedelta(hours=72) for a, b in zip(starts, starts[1:])), f"14 same-region >= 72 h separation: {r}")
    check([w["start"] for w in W] == sorted(w["start"] for w in W), "13 selected windows in chronological order")
    # 19-21 gate
    G = M["gate"]; ok = len(W) >= 6 and len(ids) >= 20 and len(W) <= 12
    check(G["minimumWindows"] == 6 and G["minimumUniqueDrifters"] == 20 and G["maximumWindows"] == 12 and G["satisfied"] == ok and G["validWindowGateEvaluatedHere"] is False, "19-21 gate thresholds; >= 4 valid-window gate not evaluated here")
    check(M["status"] == ("VALIDATION_EXTENSION_COHORT_LOCKED" if ok else "VALIDATION_EXTENSION_COHORT_BLOCKED") == S["status"] and M["cohort"]["isCohort"] == ok, "20 status follows the gate deterministically")
    check(S["gateRelaxed"] is False and S["domainExpanded"] is False and S["t1Extended"] is False and S["regionsAdded"] is False and S["manualSelection"] is False, "21 gate not relaxed, domain not expanded")
    # 22-26 no scientific access
    N = M["noExperiment"]
    check(N["modelRun"] == 0 and N["trajectoryComputed"] is False and N["forcingDownloaded"] is False and N["velocityRead"] is False and N["bootstrapRun"] == 0 and N["performanceInspected"] is False and N["endpointCalculated"] is False and N["sourceCompared"] is False and N["parameterTuned"] is False and N["manualSelection"] is False and M["validationPerformanceAccessed"] is False, "22-26 no performance / forcing / trajectory / model / bootstrap access")
    # 27 independence
    I = M["independence"]; P44 = load(D / "step44-validation-preregistration-protocol.json")["1_primaryExperimentFrozen"]
    check(sorted(set(ids) & set(P44["primaryDrifterIds"])) == [] == I["overlapWithPrimaryDrifterIds"] and sorted(set(ids) & excluded) == [] == I["overlapWithExcludedIds"] and I["overlapWithPrimaryWindowStarts"] == [] and I["allStartsAtOrAfterT0"] is True, "27 primary / extension independence")
    # 28-29 determinism and replay
    core = {"domain": REGIONS, "period": [T0, T1], "selected": [{k: w[k] for k in ("windowId", "region", "start", "end", "eligibleDrifterIds", "newUniqueDrifterIds")} for w in W], "drifterIds": sorted(ids), "prefix": prefix}
    check(M["derivationHash"] == hashlib.sha256(canonical(core)).hexdigest() == S["derivationHash"], "28 deterministic derivation hash reproduced")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(ROOT / "tools/research/derive_step47_validation_extension_cohort.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        p = Path(tmp) / "step47-validation-extension-cohort-manifest.json"
        strip = lambda d: {k: v for k, v in d.items() if k != "createdAtUTC"}
        check(p.exists() and strip(load(p)) == strip(M), "29 independent re-run identical apart from createdAtUTC")
    # 30-32 consistency, minimisation, audit
    check(S["manifestSha256"] == sha(MAN) and S["deriverSha256"] == sha(ROOT / "tools/research/derive_step47_validation_extension_cohort.py") and S["originalValidationStatus"] == "VALIDATION_COHORT_BLOCKED" and S["originalValidationUnchanged"] is True and S["temporallyIndependentOfOriginalValidation"] is False and S["primaryResultUnchanged"]["Theta_km"] == -31.331, "30 status consistent with manifest; original block and primary result unchanged")
    keys = set().union(*[set(w) for w in W])
    check(not (keys & {"latitude", "longitude", "positions", "track", "samples"}) and all(isinstance(w.get("eligibleDrifterIds"), list) for w in W), "31 data minimisation: no observation records retained in the manifest")
    au = M["sourceAccessAudit"]
    check(au["forbiddenInputAccess"] == 0 and au["observationFilesRead"] == sum(len(v) for v in M["source"]["regionFilesRead"].values()) and au["observationRecordsRead"] > 0 and set(au["driftersLoaded"]) == set(M["source"]["regionsRead"]), "32 observation-access audit integrity")
    for s in (M["status"], M["derivationHash"][:16], "KE", "BM", "AG", str(len(W)), str(len(ids)), OBS_SHA, "VALIDATION_COHORT_BLOCKED", "geographically independent"):
        check(s in T, f"30 report states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": M["status"], "regionCounts": counts, "candidates": len(cands),
                      "selectedWindows": len(W), "uniqueDrifters": len(ids), "gateSatisfied": ok, "derivationHash": M["derivationHash"][:16],
                      "regionsRead": M["source"]["regionsRead"], "observationFilesRead": au["observationFilesRead"], "forbiddenInputAccess": au["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

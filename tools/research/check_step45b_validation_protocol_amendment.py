"""Independent fail-closed validator for STEP 45B (pre-execution validation-protocol input-scope amendment). exit 0 = PASS.
Checks the 30 mandated items: STEP 44 and STEP 45A lock identities and STEP 36 / 41 / 42 / 43 ancestry · STEP 44 protocol and STEP 45A
record byte-unchanged (blob == working copy; STEP 44 not modified in place) · the exact frozen STEP 15 source identity recorded and equal to
the SHA in the frozen provenance records · read-only access grant, purpose limited to identity recovery, explicit allowed-field list with
per-field justification (equal to the fields the frozen STEP 16 evaluation reads) · temporal scope with an explicit margin · geographic scope
KE only, BM / AG / GS content access not authorised · no model, forcing, trajectory, performance, bootstrap or tuning authorisation · every
STEP 44 cohort rule unchanged (6 / 20 / max 12, 88 excluded IDs and their list hash, 72 h separation, first prefix, no manual selection) ·
primary result unchanged and declared not used for selection · data-minimisation contract · complete amendment history · the CRITICAL ACCESS
GATE: the STEP 15 dataset has not been opened (declared flags, no derived identity artefact exists, no committed artefact carries observation
records) · deterministic amendment identity hash recomputed · amendment / report consistency. Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
AM, REP = D / "step45b-validation-protocol-amendment.json", D / "step45b-validation-protocol-amendment-report.md"
STEP44_COMMIT, STEP45A_COMMIT = "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9", "b0f0274f14ae491e34f0bcb85874056d92260f46"
ANC = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step41": "9a3223089099bcb09a2589cc8a4bda82fcb47ae5", "step42": "bae85245e827f53ee9782201c442ea7849c04e82",
       "step43": "15970d9735330fb937e86af449c1deef6763b5d1", "step44": STEP44_COMMIT, "step45a": STEP45A_COMMIT}
P44_REL, P44_SHA = "docs/research/step44-validation-preregistration-protocol.json", "6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f"
R45A_REL, R45A_SHA = "docs/research/step45a-validation-input-recovery.json", "d186cf424eb691d2e7b0d0f12ae2967c027c3e75d07956a5197a840cc3fc781f"
FIELDS = ["ID", "time", "latitude", "longitude", "gap", "drogue_lost_date", "typebuoy"]
FORBIDDEN_USES = ["model evaluation", "trajectory integration", "velocity extraction", "forcing extraction", "candidate evaluation", "baseline evaluation", "error calculation", "validation scoring", "parameter selection", "source selection", "bootstrap", "hypothesis testing", "performance inspection"]


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    A = load(AM); T = REP.read_text(encoding="utf-8")
    # 1-3 locks and ancestry
    for k, c in {**ANC, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"1-3 ancestry {k}")
        check(A["parentProvenance"][k].startswith(c), f"1-3 parent provenance {k}")
    check(A["baseProtocol"]["lockCommit"] == STEP44_COMMIT and A["discovery"]["step45aLockCommit"] == STEP45A_COMMIT, "1-2 STEP 44 / 45A lock identities recorded")
    # 4-5 base records unchanged, STEP 44 not modified in place
    check(sha(ROOT / P44_REL) == P44_SHA == A["baseProtocol"]["sha256"] and git("rev-parse", f"{STEP44_COMMIT}:{P44_REL}").stdout.strip() == git("hash-object", P44_REL).stdout.strip() and A["baseProtocol"]["modifiedInPlace"] is False, "4 STEP 44 protocol unchanged and not modified in place")
    check(sha(ROOT / R45A_REL) == R45A_SHA == A["discovery"]["step45aRecordSha256"] and git("rev-parse", f"{STEP45A_COMMIT}:{R45A_REL}").stdout.strip() == git("hash-object", R45A_REL).stdout.strip(), "5 STEP 45A record unchanged")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "4-5 no tracked research file modified")
    # 6-7 source identity is the frozen provenance identity
    P35 = load(D / "step35-phase-a-protocol.json"); OBSM = load(D / "step16-observation-manifest.json"); S = A["authorizedSource"]
    obs = P35["inputs"]["observationSha256"]
    check(S["frozenSourceIdentity"] == obs == OBSM["observationSha256"] and obs.startswith("22c0ecff") and len(obs) == 64, "6 exact frozen STEP 15 source identity recorded")
    check(S["path"] == "data/research/step15/noaa-gdp-hourly-qc/" and S["committed"] is False and S["tracked"] is False and "identityVerificationBeforeAccess" in S and S["auxiliaryFrozenInput"]["sha256"] == P35["inputs"]["coastlineSha256"], "7 source is frozen provenance; auxiliary coastline bound")
    # 8-9 read-only, purpose limited
    N = A["newAuthorizationRule"]
    check(N["readOnly"] is True and N["regenerate"] is False and N["redownload"] is False and N["modify"] is False and N["overwrite"] is False and N["substituteAnotherSource"] is False, "8 access scope read-only")
    check(len(A["purpose"]["allowed"]) == 1 and "eligible drifter IDs" in A["purpose"]["allowed"][0] and set(A["purpose"]["forbidden"]) == set(FORBIDDEN_USES), "9 purpose limited to identity recovery; forbidden uses complete")
    # 10 allowed fields
    F = A["allowedFields"]
    check(F["fields"] == FIELDS and set(F["justification"]) == set(FIELDS) and F["additionalFieldsRequireAmendment"] is True and F["silentFieldAddition"] == "forbidden", "10 allowed fields explicitly defined and justified")
    check(F["toolSha256"] == sha(ROOT / "tools/research/select_step16_cohort.py"), "10 STEP 16 evaluation tool identity")
    src = (ROOT / "tools/research/select_step16_cohort.py").read_text(encoding="utf-8")
    check(all(f'row["{f}"]' in src for f in FIELDS), "10 allowed fields equal the fields the frozen STEP 16 evaluation reads")
    # 11 temporal scope
    P44 = load(ROOT / P44_REL); R = P44["4_validationCohortRule"]; TS = A["temporalScope"]
    check(TS["validationPeriodT0"] == R["calendarPeriod"]["t0"] == "2010-11-18T12:00:00Z" and TS["validationPeriodT1"] == R["calendarPeriod"]["t1"] and TS["marginBeforeT0Hours"] == 0 and TS["marginAfterT1Hours"] == 72 and TS["broadeningForConvenience"] == "forbidden" and "marginJustification" in TS, "11 temporal scope and explicit margin")
    # 12-13 geographic scope
    G = A["geographicScope"]
    check(G["region"] == "KE" and G["box"] == R["regionRule"]["boxes"]["KE"] and "determinedBy" in G and "metadata only" in G["determinedBy"], "12 geographic scope = KE")
    check("NOT AUTHORIZED" in G["bmAgObservationContentAccess"] and G["otherRegions"] == "NOT AUTHORIZED" and "NOT AUTHORIZED" in G["gs"], "13 no BM / AG / GS content access authorised")
    # 14-17 no model / forcing / trajectory / performance / bootstrap / tuning
    acc = A["accessState"]
    check(acc["modelRun"] == 0 and acc["bootstrapRun"] == 0 and acc["forcingDownloaded"] is False and acc["trajectoryComputed"] is False and acc["performanceCalculated"] is False and acc["cohortDerived"] is False, "14-16 no model / forcing / trajectory / performance / bootstrap")
    check(all(u in A["purpose"]["forbidden"] for u in ("parameter selection", "source selection", "bootstrap", "performance inspection")), "17 no parameter tuning or source selection authorised")
    # 18-21 cohort rule unchanged
    C = A["cohortRuleUnchanged"]; E = R["exclusionIdentity"]
    check(C["anyRuleChangedByThisAmendment"] is False and C["minimumWindows"] == R["minimumWindows"] == 6 and C["minimumUniqueDrifters"] == R["minimumUniqueDrifters"] == 20 and C["maximumWindows"] == R["maximumWindows"] == 12, "18-19 6 / 20 / max 12 unchanged")
    check(C["excludedDrifterIdCount"] == E["excludedDrifterIdCount"] == 88 and C["excludedIdListSha256"] == E["sha256OfSortedIdList"] == hashlib.sha256("\n".join(E["excludedDrifterIds"]).encode()).hexdigest(), "20 88 exclusion IDs unchanged")
    check(C["startSeparationHours"] == 72 and C["step20And32Exclusions"].startswith("±72 h") and C["firstPrefixRule"] == R["firstPrefixRule"] and C["chronologicalOrdering"] == R["chronologicalOrdering"] and C["eligibility"] == R["eligibility"] and C["manualAddOrRemove"] == "forbidden" and C["performanceBasedSelection"] == "forbidden", "21 72 h rule, prefix rule, eligibility and no-manual-selection unchanged")
    check(A["step15IsNotANewEligibilityRule"]["evaluationFunction"].startswith("the frozen STEP 16 evaluate() applied verbatim") and len(A["step15IsNotANewEligibilityRule"]["prohibited"]) == 6, "21 STEP 15 is an input source, not a new eligibility rule")
    # 22-23 primary result
    PP = A["primaryExperimentProtection"]; R40 = load(D / "step40-bootstrap-result.json")
    check(PP["Theta_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and PP["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == [-72.0725, -11.7435] and PP["H1"] == R40["successRule"]["H1"] == "SUPPORTED" and PP["candidateStatus"] == "CANDIDATE_ONLY" and PP["operationalPromotion"] is False and PP["primaryRecordsModified"] == 0, "22 primary result unchanged")
    check(PP["step40ResultUsedForSelection"] is False and "was NOT used to choose the validation source, region, period, drifters, or selection rule" in PP["statement"], "23 STEP 40 result not used for selection")
    L = A["leakageControls"]
    check(L["step40ResultIsFrozenHistory"] is True and L["selectionRuleEstablishedInStep44"] is True and L["identitiesFoundAbsentInStep45A"] is True and L["step15UsedOnlyAsUpstreamIdentitySource"] is True and L["validationPerformanceObserved"] is False and L["validationTrajectoriesExecuted"] is False and L["validationForcingInspected"] is False and L["validationModelResultInspected"] is False, "23 leakage controls stated")
    # 24 data minimisation
    M = A["dataMinimization"]
    check(M["derivedStructure"] == ["window_id", "window_start", "window_end", "region", "eligible_drifter_ids", "eligible_count", "source_observation_reference"] and len(M["perMappingProvenanceRequired"]) == 9 and "trajectory results" in M["excludedFromDerivedArtefact"] and F["retention"].startswith("only the minimal"), "24 data minimisation defined")
    # 25-27 amendment history and pre-execution state
    H = A["amendmentHistory"]
    check(len(H) == 1 and all(k in H[0] for k in ("amendmentId", "field", "oldValue", "newValue", "reason", "timestampUTC", "commitSha", "headAtCreation", "validationDataAccessedBeforeAmendment", "validationResultsAccessedBeforeAmendment", "status")), "25 amendment history complete")
    check(H[0]["validationDataAccessedBeforeAmendment"] is False and H[0]["validationResultsAccessedBeforeAmendment"] is False and A["type"].startswith("PRE-EXECUTION"), "26-27 pre-execution amendment; nothing accessed before the lock")
    check(acc["experimentDataAccessed"] is False and acc["validationResultsAccessed"] is False, "26-27 experimentDataAccessed / validationResultsAccessed false")
    # 16 CRITICAL ACCESS GATE: the STEP 15 dataset has not been opened
    check(acc["step15ContentOpened"] is False and acc["step15FilesRead"] == 0 and acc["observationRecordsRead"] == 0, "GATE declared: STEP 15 content not opened")
    derived = [p.name for p in D.glob("step45*.json") if p.name not in ("step45a-validation-input-recovery.json", "step45b-validation-protocol-amendment.json")]
    check(not derived and not list(D.glob("step45-validation-cohort*.json")) and not list(D.glob("step45c*")), f"GATE: no derived identity / cohort artefact exists: {derived}")
    # the artefacts may NAME the observation fields (they must, to bound the scope) but must carry no observation VALUES
    # and no drifter identities: no dict with numeric latitude+longitude, no list of >=3 drifter-id-like strings.
    def carries_observation_content(node):
        if isinstance(node, dict):
            if isinstance(node.get("latitude"), (int, float)) and isinstance(node.get("longitude"), (int, float)):
                return True
            return any(carries_observation_content(v) for v in node.values())
        if isinstance(node, list):
            if sum(1 for x in node if isinstance(x, str) and re.fullmatch(r"\d{5,6}", x)) >= 3:
                return True
            return any(carries_observation_content(x) for x in node)
        return False
    check(not carries_observation_content(A), "GATE: amendment carries no observation values and no drifter identities")
    check(not re.search(r'"(latitude|longitude)"\s*:\s*-?\d', json.dumps(A)) and not re.search(r"\b\d{5,6}\b\s*,\s*\d{5,6}\b", T), "GATE: no observation record content in the STEP 45B artefacts")
    check(git("ls-files", "data/research/step15").stdout.strip() == "", "GATE: STEP 15 dataset not tracked / not staged")
    # 28 deterministic amendment identity
    core = {k: A[k] for k in ("amendmentId", "baseProtocol", "newAuthorizationRule", "authorizedSource", "allowedFields", "temporalScope", "geographicScope", "cohortRuleUnchanged", "dataMinimization")}
    check(A["amendmentIdentityHash"] == hashlib.sha256(json.dumps(core, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest(), "28 deterministic amendment identity hash")
    # 29 report consistency
    for s in ("STEP44-AMENDMENT-001-INPUT-SCOPE", A["baseProtocol"]["sha256"][:16], obs, "data/research/step15/noaa-gdp-hourly-qc/", "read-only", "KE", "2010-11-18T12:00:00Z",
              "experimentDataAccessed", "-31.331 km", "[-72.0725, -11.7435] km", "CANDIDATE_ONLY", "88", "STEP 44 remains permanently immutable", "not a new eligibility rule"):
        check(s in T, f"29 report states: {s!r}")
    for f in FIELDS:
        check(f in T, f"29 report lists allowed field: {f}")
    check(A["automaticCommit"] is False and A["push"] is False, "29 no automatic commit / push")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "amendmentId": A["amendmentId"], "amendmentIdentityHash": A["amendmentIdentityHash"][:16],
                      "sourceIdentity": obs[:16], "region": G["region"], "fields": len(FIELDS), "step15ContentOpened": acc["step15ContentOpened"],
                      "experimentDataAccessed": acc["experimentDataAccessed"], "cohortRuleChanged": C["anyRuleChangedByThisAmendment"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

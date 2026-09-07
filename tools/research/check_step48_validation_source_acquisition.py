"""Independent fail-closed validator for STEP 48 (validation-extension source acquisition and data freeze). exit 0 = PASS.
Verifies: STEP 46 / 47 / 45B / 44 / 38 / 37 / 36 ancestry and identities · the locked STEP 47 cohort is consumed unchanged (status,
derivation hash, 6 windows, 25 drifters, per-window locked new-ID sets equal to the geometry actually acquired) · the frozen STEP 15
observation aggregate and coastline identities · frozen model configuration and parameters equal to the STEP 39 execution record · frozen
source identities (HYCOM expt_53.X, NCEP-DOE R2, GLORYS12V1 cmems_mod_glo_phy_my_0.083deg_P1D-m at the native level, WW3 GLOB-30M CFSR) with
no substitution · per-window coverage: 25 native 3-hourly frames, the six UTC-day files and their registered frame count, NCEP 6-hourly
coverage of t0-12h..t0+84h, GLORYS frames and depth · coordinate convention -180..180 with no transform applied · every artefact in the
acquisition manifest present on disk at the recorded SHA-256 and byte size, re-hashed here · the freeze manifest inventory, its hash, the
ORIGINAL_SOURCE / DERIVED_PREPARATION separation and the immutability flags · that no trajectory, model, endpoint, error, bootstrap or
performance computation occurred and the primary result and cohort are unmodified · deterministic freeze replay (the freeze tool re-run into
a temporary directory reproduces the same inventory hash) · status consistency across protocol, acquisition manifest, freeze manifest,
status record and report. A blocked source is never reported as success. Deterministic output."""
import hashlib
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, ACQ, FREEZE, STAT, REP = (D / "step48-validation-source-acquisition-protocol.json", D / "step48-validation-source-acquisition-manifest.json",
                                 D / "step48-validation-data-freeze-manifest.json", D / "step48-validation-source-acquisition-status.json",
                                 D / "step48-validation-source-acquisition-report.md")
M47, P46 = D / "step47-validation-extension-cohort-manifest.json", D / "step46-validation-extension-preregistration-protocol.json"
M47_SHA = "32d3085010185d8c1a5734ef53be227252220b74a2526dbadf5c72de5eee2cca"
P46_SHA = "c824b053fdeea20336f1396dc503232492ab77e1f9d5f032586b23c47d66862d"
OBS_SHA = "22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841"
COAST_SHA = "6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6"
COMMITS = {"step36": "043a09b8539955868651a06e7c2c44e3c606803f", "step37": "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d", "step38": "23e78f863fb092aa9e3c36e4d74d4afd4393e7f4",
           "step44": "5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9", "step45b": "7249c38d355f97c4f264d2f4d7611ce5013bd8d7", "step45c": "fa9c0590d634a6d6f30cc8a6cd2797c94e0ae7dd",
           "step46": "f7be980e3aa1e71c4cc96b7aca699e1d4b1faec7"}
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
    P, A, F, S = load(PROTO), load(ACQ), load(FREEZE), load(STAT)
    T = REP.read_text(encoding="utf-8")
    m47 = load(M47)
    # 1 ancestry and identities
    for k, c in {**COMMITS, "runtime": "155995dd"}.items():
        check(git("cat-file", "-t", c).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", c, "HEAD").returncode == 0, f"ancestry {k}")
        check(P["ancestry"].get(k, c).startswith(c) if k in P["ancestry"] else True, f"ancestry field {k}")
    check(sha(M47) == M47_SHA == A["step47ManifestSha256"] == F["step47ManifestSha256"] and sha(P46) == P46_SHA == A["step46ProtocolSha256"], "STEP 46 / 47 identity")
    check(git("diff", "--quiet", "HEAD", "--", "docs/research", "tools/research").returncode == 0, "no tracked research file modified")
    check(A["protocolSha256"] == sha(PROTO) == F["protocolSha256"] and F["acquisitionManifestSha256"] == sha(ACQ), "protocol / manifest cross-identity")
    # 2 locked cohort consumed unchanged
    check(m47["status"] == "VALIDATION_EXTENSION_COHORT_LOCKED" and A["step47DerivationHash"] == m47["derivationHash"] == F["step47DerivationHash"] and A["cohortModified"] is False and F["cohortModified"] is False, "locked cohort consumed unchanged")
    locked = {w["windowId"]: w for w in m47["selectedWindows"]}
    check(len(A["windows"]) == len(locked) == 6 and {w["windowId"] for w in A["windows"]} == set(locked), "6 locked windows acquired")
    geo = {g["windowId"]: g for g in A["geometry"]}
    for wid, w in locked.items():
        g = geo.get(wid)
        check(g is not None and g["drifterIds"] == w["newUniqueDrifterIds"] and g["lockedNewIdSetReproduced"] is True, f"locked new-ID set reproduced: {wid}")
        if g:
            la = [p["lat"] for p in g["releasePositions"]]; lo = [p["lon"] for p in g["releasePositions"]]
            box = {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0}
            check(g["oceanBox"] == box, f"ocean box follows the frozen STEP 36 formula: {wid}")
            check(g["windBox"] == {"south": max(-90.0, box["south"] - 3.0), "north": min(90.0, box["north"] + 3.0), "west": box["west"] - 3.0, "east": box["east"] + 3.0}, f"wind box = ocean box +- 3 deg: {wid}")
    check(sum(len(g["drifterIds"]) for g in A["geometry"]) == m47["cohort"]["uniqueDrifters"] == 25, "25 locked drifters covered by the acquired geometry")
    # 3 frozen observation / coastline identity
    check(A["observationAggregateSha256"] == OBS_SHA == F["observationAggregateSha256"] and A["coastlineSha256"] == COAST_SHA == F["coastlineSha256"], "frozen observation and coastline identities")
    # 4 model configuration frozen
    X39 = load(D / "step39-execution-record.json")["E_modelConfiguration"]; mc = P["modelConfiguration"]
    check(mc["alpha"] == X39["alpha"] == 0.002 and mc["stokesMultiplier"] == X39["stokesCoefficient"] == 1.0 and mc["depthA_B_m"] == X39["depthA_B_m"] == 15.0 and mc["depthC_m"] == X39["depthC_m"] == 15.81007 and mc["dtSeconds"] == X39["integrationStepSeconds"] == 300 and mc["outputSeconds"] == X39["outputStepSeconds"] == 900 and mc["horizonsHours"] == X39["horizonsHours"] == [24, 48, 72] and mc["runtimeCommit"] == "155995dd" and mc["tuning"] is False and mc["recalibration"] is False and mc["optimisation"] is False, "frozen model configuration and parameters")
    # 5 source identities, no substitution
    acq = P["acquisition"]
    check("expt_53.X" in acq["hycom"]["endpoint"] and acq["hycom"]["vertCoord"] == 15 and acq["hycom"]["variables"] == ["water_u", "water_v"], "HYCOM source identity")
    check("ncep.reanalysis2" in acq["ncep"]["endpoint"], "NCEP-R2 source identity")
    check(acq["glorys"]["datasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and acq["glorys"]["nativeDepthMeters"] == 15.81007 and acq["glorys"]["alternativeLevel"] is False and acq["glorys"]["substituteWithHycom"] is False, "GLORYS source identity and depth")
    check(acq["ww3"]["product"].startswith("WW3 GLOB-30M CFSR") and acq["ww3"]["version"] == "1.0" and acq["ww3"]["stokesMultiplier"] == 1.0 and acq["ww3"]["sharedLogAppended"] is False, "WW3 source identity and Stokes multiplier 1.0")
    check(F["sourceIdentities"]["glorys"] == acq["glorys"]["datasetId"] and F["sourceIdentities"]["hycom"] == acq["hycom"]["product"], "freeze records the frozen source identities")
    # 6 months / years actually needed
    months = sorted({d[:4] + d[5:7] for w in m47["selectedWindows"] for d in w["requiredUtcDays"]})
    check(acq["ww3"]["months"] == months and sorted(f["month"] for f in A["ww3"]["files"]) == months, "WW3 months cover exactly the window days")
    # 7 per-window coverage and coordinate integrity
    for w in A["windows"]:
        wid = w["windowId"]; lw = locked[wid]
        cov = w.get("hycomCoverage") or {}; day = w.get("hycomDayCoverage") or {}; g = w.get("glorys") or {}
        check(w["status"] == "ACQUIRED", f"{wid}: acquisition status ACQUIRED")
        check(cov.get("frames") == 25, f"{wid}: 25 native 3-hourly HYCOM frames")
        check(day.get("filesRequired") == len(lw["requiredUtcDays"]) and day.get("filesAcquired") == day.get("filesRequired") and day.get("framesAcquired") == lw["requiredFrameCount"] and day.get("complete") is True, f"{wid}: HYCOM day-file coverage complete ({lw['requiredFrameCount']} registered frames)")
        check(cov.get("coversBoxInOwnConvention") is True and cov.get("convention") == "-180..180" and cov.get("transformApplied") is False, f"{wid}: coordinate convention -180..180, no transform")
        nf = (w.get("ncepDataset") or {}).get("frames")
        check(nf is not None and nf >= 17, f"{wid}: NCEP 6-hourly coverage of t0-12h..t0+84h")
        check(g.get("status") in ("ok", "reused") and g.get("coversBox") is True, f"{wid}: GLORYS subset acquired and covers the box")
        gd = g.get("dataset") or {}
        check(gd.get("depthMeters") in (15.81007, 15.81), f"{wid}: GLORYS native depth level")
        check(len(w["drifterIds"]) == len(lw["newUniqueDrifterIds"]), f"{wid}: drifter count matches the locked window")
    # 8 every recorded artefact present on disk at the recorded hash (re-hashed here)
    inv = {e["relativePath"]: e for e in F["inventory"]}
    checked = 0
    for w in A["windows"]:
        entries = w["hycomWindowParts"] + w["hycomDayParts"] + w["ncep"]
        for e in entries:
            if e["status"] in ("ok", "reused"):
                p = ROOT / e["relativePath"]
                check(p.is_file() and sha(p) == e["sha256"] and p.stat().st_size == e["bytes"], f"artefact on disk at recorded hash: {e['relativePath']}")
                check(e["relativePath"] in inv, f"artefact in freeze inventory: {e['relativePath']}")
                checked += 1
    for f in A["ww3"]["files"]:
        if f["status"] in ("ok", "reused"):
            p = ROOT / f["relativePath"]
            check(p.is_file() and sha(p) == f["sha256"] and p.stat().st_size == f["bytes"] and f["relativePath"] in inv, f"WW3 artefact: {f['relativePath']}")
            checked += 1
    check(checked >= 6 * (4 + 6 + 2) + len(months), "all required artefacts verified")
    # 9 freeze inventory integrity
    recomputed = hashlib.sha256(canonical([{k: e[k] for k in ("relativePath", "sha256", "bytes", "class")} for e in F["inventory"]])).hexdigest()
    check(recomputed == F["inventoryHash"], "freeze inventory hash reproduced")
    for e in F["inventory"]:
        p = ROOT / e["relativePath"]
        check(p.is_file() and p.stat().st_size == e["bytes"], f"inventory entry present: {e['relativePath']}")
    check(F["artefactCounts"]["ORIGINAL_SOURCE"] > 0 and F["artefactCounts"]["DERIVED_PREPARATION"] > 0 and all(("/normalized/" in e["relativePath"]) == (e["class"] == "DERIVED_PREPARATION") for e in F["inventory"]), "ORIGINAL_SOURCE / DERIVED_PREPARATION separation")
    check(F["originalsImmutable"] is True and F["originalsRewritten"] is False and F["derivedFilesHashed"] is True and F["integrityFailures"] == [], f"freeze integrity: {F['integrityFailures'][:5]}")
    # 10 no scientific computation, primary result untouched
    for rec, label in ((A, "acquisition"), (F, "freeze")):
        check(rec.get("scientificProcessing") is False and rec.get("trajectoryComputed") is False and rec.get("endpointCalculated") is False and rec.get("performanceDataRead", rec.get("performanceInspected")) is False, f"no scientific computation in the {label} manifest")
    check(F["bootstrapRun"] is False and F["errorCalculated"] is False and F["primaryResultModified"] is False, "no bootstrap / error calculation; primary result not modified")
    R40 = load(D / "step40-bootstrap-result.json"); pr = P["primaryResult"]
    check(pr["Theta_km"] == R40["primary"]["ThetaObserved_km"] == -31.331 and pr["CI95_km"] == [R40["primary"]["Q0.025_km"], R40["primary"]["Q0.975_km"]] == [-72.0725, -11.7435] and pr["H1"] == R40["successRule"]["H1"] == "SUPPORTED" and pr["candidateStatus"] == "CANDIDATE_ONLY" and pr["operationalPromotion"] is False and pr["PRIMARY_RESULT_MODIFIED"] is False, "PRIMARY_RESULT_MODIFIED = FALSE")
    check(A["credentialsInManifest"] is False and "password" not in json.dumps(A).lower() and A["glorysAccess"]["credentialsEntered"] is False and A["glorysAccess"]["contentsRead"] is False, "no credential material in the manifest")
    check(A.get("forbiddenInputAccess", 0) == 0, "no forbidden input access during acquisition")
    # 11 status consistency and blocked-never-success
    ok = A["status"] == "VALIDATION_SOURCE_ACQUISITION_PASS"
    check(F["status"] == A["status"] == S["status"], "status consistent across acquisition, freeze and status record")
    check(P["blockedNeverReportedAsSuccess"] is True and (not ok or (all(w["status"] == "ACQUIRED" for w in A["windows"]) and all(f["status"] in ("ok", "reused") for f in A["ww3"]["files"]))), "a blocked source is never reported as success")
    check(S["stageSeparation"]["step48"] == "SOURCE LOCK" and S["stageSeparation"]["stagesCombined"] is False, "stage separation recorded")
    # 12 deterministic freeze replay
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(ROOT / "tools/research/freeze_step48_validation_data.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        p = Path(tmp) / "step48-validation-data-freeze-manifest.json"
        strip = lambda d: {k: v for k, v in d.items() if k != "frozenAtUTC"}
        check(p.exists() and strip(load(p)) == strip(F), "freeze replay identical apart from frozenAtUTC")
    for s in (A["status"], "25", "6", "expt_53.X", "cmems_mod_glo_phy_my_0.083deg_P1D-m", "WW3 GLOB-30M CFSR", "-180..180", "PRIMARY_RESULT_MODIFIED"):
        check(s in T, f"report states: {s!r}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": A["status"],
                      "windows": len(A["windows"]), "acquired": sum(1 for w in A["windows"] if w["status"] == "ACQUIRED"),
                      "ww3Files": len(A["ww3"]["files"]), "artefacts": len(F["inventory"]), "totalBytes": F["totalBytes"],
                      "inventoryHash": F["inventoryHash"][:16], "artefactsVerified": checked}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

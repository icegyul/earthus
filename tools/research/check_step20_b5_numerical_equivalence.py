"""Deterministic validator for STEP 20 Phase B-5 (numerical equivalence revision). exit 0 = PASS, exit 1 = FAIL.
Verifies: ancestry and locked files (STEP 17/18/18b/19/20, alpha artifact, B-3, B-4 gate record); the B-4 gate result and the
observed maximum difference are preserved (re-derived from the gate trajectories and the calibration reference, not copied);
tolerance = 1e-12 degrees and the structural exact-equality list parsed from the protocol text; endpoint condition J threshold;
no runtime modification (blob comparison with the STEP 20 lock commit); no forcing modification (raw SHAs); no alpha change;
no cohort change; no holdout execution. Nothing hand-written PASS."""
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step20-b5-numerical-equivalence-protocol.md"
PREREG = ROOT / "docs/research/step20-b5-numerical-equivalence-preregistration.json"
RULE = ROOT / "docs/research/step20-b5-numerical-equivalence-selection-rule.json"
GATE = ROOT / "docs/research/step20-b4-segmentation-gate.json"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selection-rule-sha256.txt": "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-b3-forcing-resolution-protocol.md": "b7a2ad2309553c05f261598773df7ca5295a8dcd92ef76fd3467e4d1787ef466", "docs/research/step20-b3-forcing-resolution-preregistration.json": "c4348d8b3c306df2f8661f26a72e8a42261fbfabac2c606115b716d059874095",
        "docs/research/step20-b3-forcing-resolution-selection-rule.json": "87f7750bd3f95089402da565a8801677955f2e078c8616905752bef9e17e9126", "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701",
        "docs/research/step20-holdout-forcing-manifest.json": "8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b", "docs/research/step20-b4-segmentation-gate.json": "9e3d3dd9e98287a3a0d06a8a8fe190d5189f595cf6b81055d6e41d30e2aaed02"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664")
RUNTIME_FILES = ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py")
RADIUS_M = 6371008.8


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def hav_m(a, b):
    p1, p2 = math.radians(a[1]), math.radians(b[1]); h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(h))


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    text = PROTO.read_text(encoding="utf-8"); p = json.loads(PREREG.read_text(encoding="utf-8")); r = json.loads(RULE.read_text(encoding="utf-8")); g = json.loads(GATE.read_text(encoding="utf-8"))
    proto_sha = sha(PROTO)
    check(p["protocolDocumentSha256"] == proto_sha == r["shaRegistry"]["protocol"] and p["selectionRuleSha256"] == sha(RULE), "1 protocol/rule SHA cross-reference")
    check("Status: PREREGISTRATION LOCKED" in text and p["status"] == r["status"] == "PREREGISTRATION LOCKED" and p["supersedes"] is None and "does not delete, modify or supersede" in text, "1 LOCK, non-superseding")
    check(p["revisionId"] == r["revisionId"] == "step20-b5-numerical-equivalence-revision" and "STEP 20 (155995dd) → selected-alpha lock (73fafffb) → B-3 forcing resolution (9113e8b5) → B-4 segmentation gate record (869bc664)" in text, "1 revision id and ancestry chain in text")
    # 2 ancestry / locked files / runtime / forcing
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 locked file unchanged: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit" and short in text, f"2 commit {short} present and cited")
    for name in RUNTIME_FILES:
        rel = f"services/research-runtime/research_runtime/{name}"
        blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged since STEP 20 lock: {name}")
    check("MAX_VALUES = 2_000_000" in (ROOT / "services/research-runtime/research_runtime/datasets.py").read_text(encoding="utf-8"), "2 MAX_VALUES unchanged")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8"))
    check(hashlib.sha256(canonical({k: v for k, v in art.items() if k not in ("contentSha256", "createdAtUTC")})).hexdigest() == art["contentSha256"] == r["shaRegistry"]["selectedAlphaContent"] and float(art["selectedAlpha"]) == 0.002 == r["alpha"]["primary"] and r["alpha"]["baseline"] == 0.0, "2 alpha artifact / alpha 0.002 & 0 locked")
    fm17 = json.loads((ROOT / "docs/research/step17-forcing-manifest.json").read_text(encoding="utf-8")); b2 = json.loads((ROOT / "docs/research/step20-holdout-forcing-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / "data/research/step17" / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) == f["sha256"] for u in fm17["runUnits"] for f in u["hycom"]["files"] + u["ncep"]["files"]), "2 STEP 17 raw forcing unchanged")
    check(all(sha(ROOT / "data/research/step20/holdout/forcing" / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) == f["sha256"] for u in b2["runUnits"] for f in u["hycom"]["files"] + u["ncep"]["files"]), "2 R1 raw forcing unchanged")
    m18b = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / x[f]) == x[k] for x in m18b["runs"] for k, f in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile"))), "2 STEP 18b trajectories untouched")
    # 3 B-4 gate result preserved and observed maximum re-derived
    check(g["status"] == "SEGMENTED_EQUIVALENCE_FAIL" and r["b4GateRecord"]["status"] == g["status"] and r["b4GateRecord"]["preserved"] is True, "3 B-4 gate FAIL preserved")
    t0, t2 = (next(t for t in g["tests"] if t["alpha"] == a) for a in (0.0, 0.002))
    check(t0["resultArrayIdentical"] and t0["csvBitwiseIdentical"] and t0["trajectoriesListIdentical"] and not t2["resultArrayIdentical"] and t2["csvBitwiseIdentical"] and not t2["trajectoriesListIdentical"], "3 alpha 0 bitwise PASS / alpha 0.002 bitwise FAIL preserved")
    check("alpha=0: bitwise identical — PASS" in text and "alpha=0.002: bitwise identical — FAIL" in text and "5.684e-14" in text, "3 B-4 facts stated in text")
    seg = json.loads((ROOT / "data/research/step20/holdout/gate/KE-1.alpha0.002.segmented.result.json").read_text(encoding="utf-8"))
    ref = json.loads((ROOT / "data/research/step20/calibration/KE-1/alpha0.002.result.json").read_text(encoding="utf-8"))
    mx = 0.0; nd = 0; n = 0; first = None; struct = True; ends = {}
    for a, b in zip(seg["trajectories"], ref["trajectories"]):
        struct &= len(a["samples"]) == len(b["samples"]) and a["particleId"] == b["particleId"] and a["finalStatus"] == b["finalStatus"]
        for sa, sb in zip(a["samples"], b["samples"]):
            n += 1; struct &= sa["timeUTC"] == sb["timeUTC"] and sa["status"] == sb["status"]
            d = max(abs(sa["lon"] - sb["lon"]), abs(sa["lat"] - sb["lat"])); nd += d > 0; mx = max(mx, d)
            if d > 0 and first is None:
                first = sa["timeUTC"]
            if sa["timeUTC"] in ("2010-05-12T12:00:00Z", "2010-05-13T12:00:00Z", "2010-05-14T12:00:00Z"):
                ends[sa["timeUTC"]] = max(ends.get(sa["timeUTC"], 0.0), hav_m((sa["lon"], sa["lat"]), (sb["lon"], sb["lat"])))
    obs = r["b4GateRecord"]["observed"]
    check(struct and n == 2312 == obs["samplesCompared"] and nd == 519 == obs["differingSamples"] and abs(mx - obs["maxAbsDeltaLonDeg"]) < 1e-20 and mx == 5.684341886080802e-14 and first >= obs["onlyAfterUTC"], "3 observed maximum re-derived (519/2312, 5.684e-14 deg, after split)")
    check(all(abs(ends[k] - obs["endpointSeparationMeters"][h]) < 1e-15 for k, h in (("2010-05-12T12:00:00Z", "24h"), ("2010-05-13T12:00:00Z", "48h"), ("2010-05-14T12:00:00Z", "72h"))), "3 endpoint separations re-derived")
    # 4 criterion parsed from text
    tol = re.search(r"ABSOLUTE TOLERANCE ≤ ([0-9e.-]+) degrees", text)
    check(tol and float(tol.group(1)) == 1e-12 == r["criterion"]["level2Positional"]["absoluteToleranceDegrees"] == p["criterion"]["level2Positional"]["absoluteToleranceDegrees"], "4 tolerance 1e-12 degrees parsed")
    per = re.search(r"≤ \*\*([0-9e.-]+) deg\*\* AND", text)
    check(per and float(per.group(1)) == 1e-12, "4 per-coordinate rule in text")
    j = re.search(r"max endpoint separation at every horizon ≤ \*\*([0-9e.-]+) km", text)
    check(j and float(j.group(1)) == 1e-6 == r["criterion"]["endpointImpact"]["conditionJ"]["maxSeparationKm"], "4 condition J threshold parsed (1e-6 km)")
    for item in ("timestamps", "particle IDs", "particle ordering", "sample count", "output ordering", "status", "release coordinates", "landMask", "forcing frame identity", "forcing values", "chunk overlap values"):
        check(item in r["criterion"]["level1Structural"]["exact"] and item in text, f"4 structural exact field: {item}")
    check(len(r["criterion"]["passConditions"]) == 10 and all(text.count(f" {c} ") >= 1 or c in text for c in ("A timestamps exact", "J 24/48/72 h endpoint separation")) and r["criterion"]["alphaZeroBitwiseStillRequired"] is True, "4 conditions A–J and alpha-0 bitwise requirement")
    check(r["criterion"]["level2Positional"]["isScientificMetric"] is False and r["criterion"]["level2Positional"]["appliedToM3"] is False and "no tolerance is applied anywhere in the M3 evaluation" in text, "4 tolerance not a scientific metric / not applied to M3")
    check(mx <= 1e-12 and all(v / 1000 <= 1e-6 for v in ends.values()), "4 observed B-4 values fall within the locked criterion (informational)")
    # 5 anti-leakage, untouched, holdout state, counters
    al = r["antiLeakage"]
    check(al["toleranceFixedBeforeGateReexecution"] and al["toleranceFixedBeforeHoldout"] and al["changeAfterLock"] == "PROHIBITED" and al["holdoutRead"] is False and "Disclosure on timing" in text and "no further tolerance revision" in text, "5 anti-leakage and timing disclosure")
    u = r["untouched"]
    check(all(u[k] is False for k in ("runtimeModification", "windTimeOriginCodeChange", "parcelsSourceChange", "floatingPointModeChange", "compilerChange", "precisionChange", "forcingModification", "timestepChange", "alphaReselection", "otherAlphaRuns", "cohortReselection", "chunkDefinitionChange")), "5 untouched flags")
    hs = r["holdoutState"]
    check(hs["evaluable"] == 12 and hs["evaluated"] == 0 and hs["KE-H2"].startswith("FORCING_UNAVAILABLE") and "2010-08-18T12:00:00Z" in hs["KE-H2"] and hs["AG"] == "HOLDOUT_UNAVAILABLE" and "KE-H1 n=5 NOT RUN, KE-H3 n=7 NOT RUN, KE-H2 n=1 FORCING_UNAVAILABLE" in text, "5 holdout state untouched")
    check(p["modelRun"] is False and p["holdoutExecuted"] is False and p["runtimeModified"] is False and p["forcingModified"] is False and p["alphaReselected"] is False and p["cohortReselected"] is False and r["counters"] == {"modelRuns": 0, "holdoutExecution": 0, "forcingDownloads": 0}, "5 counters zero")
    check(not (ROOT / "data/research/step20/holdout/trajectories").exists() and not (ROOT / "docs/research/step20-b4-holdout-manifest.json").exists() and not any((ROOT / "docs/research").glob("step20-b*-holdout-evaluation.json")), "5 no holdout execution artifacts")
    check(r["shaRegistry"]["gateTool"] == sha(ROOT / "tools/research/gate_step20_segmentation.py") and r["shaRegistry"]["segmentedModule"] == sha(ROOT / "tools/research/step20_segmented.py"), "5 gate tool / segmented module SHAs recorded")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "revisionId": p["revisionId"], "status": p["status"], "protocolSha256": proto_sha, "preregistrationSha256": sha(PREREG), "selectionRuleSha256": sha(RULE)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

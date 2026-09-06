"""Deterministic validator for STEP 20 Phase B-3 (forcing resolution revision). exit 0 = PASS, exit 1 = FAIL.
Checks the STEP 20 immutable ancestry and selected-alpha artifact, the original cohort/rule, the KE-H1 chunked-reading rule and its
recorded reader-equivalence evidence (re-verified against the chunk files), the KE-H2 FORCING_UNAVAILABLE rule and gap evidence
(re-verified from the raw source file), KE-H3 availability, no alpha/cohort reselection, no interpolation/substitution, and that
no holdout model output exists. Constants parsed from the protocol text; nothing hand-written PASS."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step20-b3-forcing-resolution-protocol.md"
PREREG = ROOT / "docs/research/step20-b3-forcing-resolution-preregistration.json"
RULE = ROOT / "docs/research/step20-b3-forcing-resolution-selection-rule.json"
B3M = ROOT / "docs/research/step20-b3-holdout-forcing-manifest.json"
B2M = ROOT / "docs/research/step20-holdout-forcing-manifest.json"
LOCK = {"docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selection-rule-sha256.txt": "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7", "docs/research/step20-holdout-derivation.json": "68dce1d200c73fd6f1c392446f61d2d240c40068bd34992efce8c14622becfb8",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-holdout-forcing-manifest.json": "8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "904a27a9", "86213644")
RUNTIME_FILES = ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    text = PROTO.read_text(encoding="utf-8"); p = json.loads(PREREG.read_text(encoding="utf-8")); r = json.loads(RULE.read_text(encoding="utf-8")); b3 = json.loads(B3M.read_text(encoding="utf-8"))
    # 1 cross references
    proto_sha = sha(PROTO)
    check(p["protocolDocumentSha256"] == proto_sha == r["shaRegistry"]["protocol"] and p["selectionRuleSha256"] == sha(RULE), "1 protocol/rule SHA cross-reference")
    check("Status: PREREGISTRATION LOCKED" in text and p["status"] == "PREREGISTRATION LOCKED" == r["status"] and p["supersedesStep20"] is False and r["supersedesStep20"] is False and "does **not** supersede STEP 20" in text, "1 LOCK, does not supersede STEP 20")
    check(p["revisionId"] == r["revisionId"] == "step20-b3-forcing-resolution-revision" and "STEP20-B3 FORCING RESOLUTION REVISION" in text, "1 revision id")
    # 2 ancestry
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 locked file unchanged: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit" and short in text, f"2 commit {short} present and cited")
    ic = p["immutabilityCheck"]
    check(ic["step20ProtocolSha256"] == LOCK["docs/research/step20-generalization-protocol.md"] and ic["step20PreregistrationSha256"] == LOCK["docs/research/step20-preregistration.json"] and ic["step20SelectionRuleSha256"] == LOCK["docs/research/step20-selection-rule-sha256.txt"], "2 STEP 20 SHAs recorded")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8"))
    content = {k: v for k, v in art.items() if k not in ("contentSha256", "createdAtUTC")}
    check(hashlib.sha256(canonical(content)).hexdigest() == art["contentSha256"] == ic["selectedAlphaContentSha256"] == "27e0c940a4beed5b6a1068b83856ba1711300f91b45905f93b1de5c5bfccebc3" and float(art["selectedAlpha"]) == 0.002, "2 selected-alpha artifact content SHA / alpha 0.002")
    m18b = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / x[f]) == x[k] for x in m18b["runs"] for k, f in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile"))), "2 STEP 18b trajectories untouched")
    check(json.loads((ROOT / "docs/research/step18-model-manifest.json").read_text(encoding="utf-8"))["status"] == "MODEL_RUN_BLOCKED_PREFLIGHT", "2 STEP 18 remains BLOCKED")
    # runtime/reader code unchanged: compare to HEAD blobs of the STEP 20 lock commit
    for name in RUNTIME_FILES:
        rel = f"services/research-runtime/research_runtime/{name}"
        blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and hashlib.sha256(blob).hexdigest() == hashlib.sha256((ROOT / rel).read_bytes()).hexdigest() or (blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n")), f"2 runtime file unchanged since STEP 20 lock: {name}")
    check("MAX_VALUES = 2_000_000" in (ROOT / "services/research-runtime/research_runtime/datasets.py").read_text(encoding="utf-8"), "2 MAX_VALUES unchanged")
    # 3 original cohort/rule and alpha/cohort policies
    p20 = json.loads((ROOT / "docs/research/step20-preregistration.json").read_text(encoding="utf-8"))
    hold = {u["windowId"]: u for u in p20["holdout"]["runUnits"]}
    check({u["windowId"]: (u["t0"], sorted(u["drifterIds"])) for u in b3["runUnits"]} == {k: (v["t0"], sorted(v["drifterIds"])) for k, v in hold.items()}, "3 holdout units identical to STEP 20 (no reselection)")
    check(r["alpha"] == {"primary": 0.002, "baseline": 0.0, "locked": True, "reselection": False, "otherCandidatesRunOnHoldout": False} and r["cohort"] == {"reselection": False, "newHoldout": False, "replacementForKEH2": False}, "3 alpha/cohort policies")
    check("Alpha: 0.002 LOCKED. Baseline: 0 LOCKED. No alpha reselection. No cohort reselection. No new holdout." in text, "3 required statement in text")
    # 4 KE-H1 chunk rule parsed and evidence re-verified
    m = re.search(r"25 × 123 × 333 × 2 = \*\*([\d,]+) values > ([\d,]+)\*\*", text)
    check(m and int(m.group(1).replace(",", "")) == 2047950 and int(m.group(2).replace(",", "")) == 2000000, "4 KE-H1 value count parsed")
    k1 = next(u for u in b3["runUnits"] if u["windowId"] == "KE-H1")
    check(k1["status"] == "FORCING_AVAILABLE_CHUNKED" and k1["chunked"] is True and k1["fullWindowValues"] == 2047950 and k1["hycom"]["overlapFrames"] == 8 and k1["hycom"]["overlapBitwiseEqual"] is True and k1["hycom"]["framesCoveredByChunks"] is True, "4 KE-H1 chunk record")
    for c, exp_frames, exp_seg in (("A", 16, [0, 36]), ("B", 17, [36, 72])):
        ch = k1["hycom"]["chunks"][c]; path = ROOT / ch["file"]
        check(path.exists() and sha(path) == ch["fileSha256"] == r["shaRegistry"][f"keH1Chunk{c}"] and ch["frames"] == exp_frames and ch["shape"][1:] == [123, 333] and ch["values"] <= 2000000 and ch["withinPhysicalBounds"], f"4 KE-H1 chunk {c} file/frames/values")
        ds = json.loads(path.read_text(encoding="utf-8"))
        check(ds["manifest"]["sha256"] == ch["gridSha256"] and ds["manifest"]["netcdfReaderVersion"] == "earthus-hycom-netcdf/1" and ds["manifest"]["readerVersion"] == "earthus-json-grid/1", f"4 KE-H1 chunk {c} grid SHA / reader versions")
        hist = ds["manifest"]["processingHistory"][-1]
        check(hist["valuesModified"] is False and hist["framesInterpolated"] is False and hist["modelSegmentHours"] == exp_seg, f"4 KE-H1 chunk {c} no value modification, segment hours")
        check(f"chunk {c} = parts" in text, f"4 chunk {c} definition in text")
    check(all(s["wet"] for s in k1["hycom"]["chunks"]["A"]["releaseStencilAtSegmentStart"]) and len(k1["hycom"]["chunks"]["A"]["releaseStencilAtSegmentStart"]) == 5, "4 KE-H1 release stencils wet (chunk A)")
    eq = b3["equivalenceTests"]
    check(set(eq) == {"KE-H3", "KE-1", "KE-2", "AG-1", "AG-2"} and all(v["equivalent"] and v["framesCompared"] == v["framesEqual"] == 33 and v["landMaskEqual"] and v["axesEqual"] for v in eq.values()), "4 reader equivalence 5 datasets × 33 frames bitwise")
    check("165/165 equal" in text and r["failure1"]["readerEquivalenceVerified"] == {k: {"framesCompared": v["framesCompared"], "framesEqual": v["framesEqual"], "axesEqual": v["axesEqual"], "landMaskEqual": v["landMaskEqual"], "equivalent": v["equivalent"]} for k, v in eq.items()}, "4 equivalence evidence cited")
    gate = r["failure1"]["runEquivalenceGate"]
    cal = {x["runId"]: x for x in json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8"))["runs"]}
    check(all(cal[k]["resultArraySha256"].startswith(v["resultArraySha256"]) and cal[k]["trajectoriesSha256"].startswith(v["trajectoriesSha256Prefix"]) for k, v in gate["reference"].items()) and "SEGMENTED_EQUIVALENCE_FAIL" in text and "HOLDOUT_BLOCKED_SEGMENTATION" in text, "4 run-equivalence gate references calibration hashes")
    check(all(tok in text for tok in ("resampling", "smoothing", "extrapolation", "zero-fill", "frame duplication", "value modification", "spatial domain reduction", "temporal domain reduction")) and len(r["failure1"]["prohibited"]) >= 10, "4 KE-H1 prohibitions")
    # 5 KE-H2 gap rule and evidence re-verified from raw
    k2 = next(u for u in b3["runUnits"] if u["windowId"] == "KE-H2")
    check(k2["status"] == "FORCING_UNAVAILABLE" and k2["missingRequiredOceanFrames"] == ["2010-08-18T12:00:00Z"] and k2["availableAdjacentFrames"]["2010-08-18T12:00:00Z"] == ["2010-08-18T09:00:00Z", "2010-08-18T15:00:00Z"] and k2["rawFramesPresent"] == 24, "5 KE-H2 gap record")
    sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
    import netCDF4
    frames = []
    for f in sorted((ROOT / "data/research/step20/holdout/forcing/KE-H2/hycom").glob("*.nc")):
        with netCDF4.Dataset(f) as d:
            frames += [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
    check("2010-08-18T12:00:00Z" not in frames and "2010-08-18T09:00:00Z" in frames and "2010-08-18T15:00:00Z" in frames and len(frames) == 24, "5 KE-H2 gap re-verified from raw source")
    check("2010-08-18T12:00:00Z" in text and "IF a required ocean forcing frame is absent" in text and "NO INTERPOLATION. NO MODEL RUN" in text and r["failure2"]["postHocExclusion"] is False, "5 KE-H2 rule in text, not post hoc")
    check(all(tok in r["failure2"]["prohibited"] for tok in ("temporal interpolation", "nearest-neighbor substitution", "previous-frame duplication", "next-frame duplication", "zero-fill", "model-side extrapolation", "other HYCOM product", "GLORYS", "ERA5")), "5 KE-H2 prohibitions")
    # 6 KE-H3 and holdout set arithmetic
    k3 = next(u for u in b3["runUnits"] if u["windowId"] == "KE-H3")
    check(k3["status"] == "FORCING_AVAILABLE" and r["keH3"]["status"] == "FORCING_AVAILABLE" and "KE-H3: FORCING_AVAILABLE" in text, "6 KE-H3 available")
    hs = r["holdoutSet"]
    check(hs["preregistered"] == 13 and hs["evaluable"] == 12 and hs["unavailable"] == 1 and b3["evaluableDrifters"] == 12 and b3["unavailableDrifters"] == 1, "6 13 / 12 / 1 arithmetic")
    check("PREREGISTERED HOLDOUT: 13 · FORCING-AVAILABLE EVALUABLE HOLDOUT: 12 · FORCING-UNAVAILABLE: 1" in text and "13-drifter holdout result" in text and "HOLDOUT_UNAVAILABLE" in text, "6 wording rule and AG status in text")
    # 7 unchanged metric/model statements, counters, no model output
    check("R = 6371008.8" in text and "300 s integration substep" in text and "900 s output" in text and "never across a missing source frame" in text, "7 unchanged metric/model in text")
    check(p["modelRun"] is False and p["trajectoryComputed"] is False and p["interpolationOfMissingSourceFrame"] is False and p["glorys"] is False and p["era5"] is False and p["counters"] == {"modelRuns": 0, "holdoutTrajectories": 0, "forcingDownloads": 0}, "7 counters zero")
    check(not (ROOT / "data/research/step20/holdout/trajectories").exists() and not (ROOT / "docs/research/step20-holdout-manifest.json").exists() and not (ROOT / "docs/research/step20-holdout-evaluation.json").exists(), "7 no holdout model output")
    b2 = json.loads(B2M.read_text(encoding="utf-8"))
    check(all(sha(ROOT / "data/research/step20/holdout/forcing" / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) == f["sha256"] for u in b2["runUnits"] for f in u["hycom"]["files"] + u["ncep"]["files"]), "7 raw R1 files unchanged (no re-download)")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "revisionId": p["revisionId"], "status": p["status"], "protocolSha256": proto_sha, "preregistrationSha256": sha(PREREG), "selectionRuleSha256": sha(RULE)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

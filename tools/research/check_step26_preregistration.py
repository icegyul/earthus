"""Independent validator for STEP 26 Phase A (forcing decomposition preregistration). exit 0 = PASS. Deterministic output.
Checks: 1 ancestry · 2 immutable STEP 17–25C (+ runtime at 155995dd) · 3 exactly four conditions · 4 exact six windows · 5 alpha 0.002 ·
6 HYCOM daily 8-frame rule · 7 GLORYS coarse bilinear rule · 8 exact HYCOM target-grid identity (axes SHA recomputed from the normalized
files) · 9 exact native depths · 10 explicit 0.810070 m depth difference · 11 no vertical interpolation · 12 no new data · 13 no alpha search ·
14 M3 definition · 15 M1/M2/M4/M5 · 16 calibration/holdout separation · 17 KE-H2 exclusion · 18 no model execution · 19 reproducibility
requirement · 20 no model-selection language; plus feasibility facts (HYCOM frame coverage) recomputed from the locked normalized files."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, RULE, PREREG, MATRIX, SUMMARY = D / "step26-forcing-decomposition-protocol.md", D / "step26-forcing-decomposition-rule.json", D / "step26-preregistration.json", D / "step26-experiment-matrix.json", D / "step26-summary.json"
LOCK = {"docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701", "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd",
        "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd", "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b",
        "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7", "docs/research/step24b-license-status.json": "7f9a8b9983dd3849e852d31514b6b512ed12195457930c70a104f24dcf8807ef",
        "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1", "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734",
        "docs/research/step25b-glorys-quality-gates.json": "56dcc6182d14346d6345de82bf16ad5b438f9ce739ba45a15d8807fd1b5cfb12", "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab",
        "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d",
        "docs/research/step25c-evaluation.json": "974073b81757f47f2f205ffdd49b46dda37733f1163b5169709d6b373d5894f5", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "322f0e57", "4bb4342b", "275d06e6", "e0e7cfd2", "15a81d25", "c34c6d97", "db6cea2f", "2841f511", "1a6a3173", "c6179242", "c17bd469", "929d3468", "aee3943c", "4953719d", "156db9db", "c974ce42")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
SELECTION = re.compile(r"\b(GLORYS selected|HYCOM selected|best forcing|optimal forcing|optimal|superior|validated|proven|production[- ]ready)\b", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def axes_sha(grid):
    return hashlib.sha256(json.dumps({"lon": grid["lon"], "lat": grid["lat"]}, separators=(",", ":")).encode()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 ancestry: {short}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    R = load(RULE); q = load(PREREG); M = load(MATRIX); S = load(SUMMARY); proto = PROTO.read_text(encoding="utf-8"); p25c = load(D / "step25c-test02-protocol.json")
    check(q["protocolSha256"] == sha(PROTO) and q["ruleSha256"] == sha(RULE) and q["experimentMatrixSha256"] == sha(MATRIX) and q["validator"]["sha256"] == sha(__file__) and q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "c974ce42", "0 lock cross references")
    check(R["ruleId"] == q["ruleId"] == M["ruleId"] == S["ruleId"] == "forcing-decomposition-step26" and R["baseCommit"] == "c974ce42", "0 rule id / base")
    conds = R["conditions"]; ids = [c["id"] for c in conds]
    check(ids == ["A", "B", "C", "D"] and [c["name"] for c in conds] == ["HYCOM_NATIVE_3H", "HYCOM_DAILY", "GLORYS_NATIVE_DAILY", "GLORYS_COARSE_DAILY"] and len(conds) == 4, "3 exactly four conditions")
    check([w["windowId"] for w in R["windows"]] == WINDOWS and "KE-H2" not in [w["windowId"] for w in R["windows"]] and R["excluded"]["KE-H2"]["paired"] is False and "STEP 20" in R["excluded"]["KE-H2"]["reason"], "4/17 exact six windows; KE-H2 excluded")
    p25w = {w["windowId"]: w for w in p25c["windows"]}
    for w in R["windows"]:
        pw = p25w[w["windowId"]]
        check(w["t0"] == pw["t0"] and w["drifterIds"] == pw["drifterIds"] and w["role"] == pw["role"] and w["releasePositions"] == pw["releasePositions"] and w["computationArea"] == pw["computationArea"] and w["wind"] == pw["wind"] and w["hycomReference"] == pw["hycomBaseline"]["0.002"], f"4 window identity = STEP 25C: {w['windowId']}")
    check(R["alpha"]["value"] == 0.002 and R["alpha"]["search"] is False and R["alpha"]["reselection"] is False and R["alpha"]["windageTuning"] is False and R["alpha"]["step20Changed"] is False, "5/13 alpha 0.002, no search")
    B = conds[1]; check(B["temporal"]["algorithm"] == "hycom-daily-8frame-mean/1" and B["temporal"]["requiredFramesPerDay"] == ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] and B["temporal"]["missingFramePolicy"] == "day absent; window blocked if the day is required; no interpolation, no gap filling" and B["spatial"]["resolutionDegrees"] == 0.08 and B["depthMeters"] == 15.0 and B["temporal"]["label"] == "00:00Z of the averaged UTC day", "6 HYCOM daily 8-frame rule")
    Dc = conds[3]; check(Dc["spatial"]["algorithm"] == "glorys-to-hycom-grid-bilinear/1" and Dc["spatial"]["interpolation"] == "bilinear" and Dc["spatial"]["stencilRule"] == "target node valid only if all four GLORYS stencil nodes are wet in every frame; otherwise null and landMask=true" and all(Dc["spatial"][k] is False for k in ("smoothing", "extrapolation", "nearestNeighbourSubstitution", "zeroFill", "temporalTransformation")) and Dc["depthMeters"] == 15.81007 and Dc["sourceCondition"] == "C", "7/11 GLORYS coarse bilinear rule")
    # 8 exact HYCOM target-grid identity: recompute axes SHA from the normalized files
    for w in R["windows"]:
        g = load(ROOT / w["hycomGrid"]["file"])["grid"]; check(axes_sha(g) == w["hycomGrid"]["axesSha256"] and len(g["lon"]) == w["hycomGrid"]["shape"][1] and len(g["lat"]) == w["hycomGrid"]["shape"][0] and sha(ROOT / w["hycomGrid"]["file"]) == w["hycomGrid"]["fileSha256"], f"8 HYCOM target grid identity: {w['windowId']}")
        gl = load(ROOT / w["glorysNormalized"]["file"])["grid"]; check(sha(ROOT / w["glorysNormalized"]["file"]) == w["glorysNormalized"]["fileSha256"] and gl["lon"][0] <= g["lon"][0] and g["lon"][-1] <= gl["lon"][-1] and gl["lat"][0] <= g["lat"][0] and g["lat"][-1] <= gl["lat"][-1], f"8 HYCOM grid inside GLORYS extent: {w['windowId']}")
        # feasibility facts: complete UTC days from the locked HYCOM frames
        times = sorted({t for f in w["hycomFrames"]["files"] for t in load(ROOT / f)["grid"]["timeUTC"]})
        days = {}
        for t in times:
            days.setdefault(t[:10], set()).add(t[11:16])
        complete = sorted(d for d, hs in days.items() if hs == set(B["temporal"]["requiredFramesPerDay"]))
        check(times[0] == w["t0"] and times[-1] == w["end"] and len(times) == 25 and complete == w["hycomFrames"]["completeUtcDays"] and len(complete) == 2 and w["hycomFrames"]["requiredDailyLabels"] == w["hycomFrames"]["requiredDailyLabels"][:5] and len(w["hycomFrames"]["requiredDailyLabels"]) == 5 and w["conditionB"]["status"] == "STEP26_DATA_BLOCKED", f"12 feasibility fact (frames / complete days / B blocked): {w['windowId']}")
    check(conds[0]["depthMeters"] == 15.0 and conds[1]["depthMeters"] == 15.0 and conds[2]["depthMeters"] == 15.81007 and conds[3]["depthMeters"] == 15.81007, "9 exact native depths")
    da = R["depthAudit"]; check(da["hycomDepthMeters"] == 15.0 and da["glorysDepthMeters"] == 15.81007 and abs(da["depthDifferenceMeters"] - 0.81007) < 1e-9 and da["identicalDepthForcing"] is False and da["attributedInStep26"] is False and da["verticalInterpolation"] is False and da["commonDepthInvented"] is False and "0.810070" in proto and "0.810070" in json.dumps(S), "10 explicit 0.810070 m depth difference")
    check(all(c["verticalInterpolation"] is False for c in conds) and R["forbidden"]["verticalInterpolation"] is False and R["forbidden"]["depthSearch"] is False, "11 no vertical interpolation")
    check(R["dataPolicy"]["newDownload"] is False and R["dataPolicy"]["newObservation"] is False and R["dataPolicy"]["newWindow"] is False and set(R["dataPolicy"]["sources"]) == {"STEP17 HYCOM", "STEP20 B-3 HYCOM (holdout)", "STEP25B GLORYS", "STEP17/STEP20 NCEP-R2 wind", "STEP15/16 observations"} and S["newDataCount"] == 0, "12 no new data")
    m = R["metrics"]; check(m["M3"]["radiusMeters"] == 6371008.8 and m["M3"]["horizonsHours"] == [24, 48, 72] and m["M3"]["primaryStatistic"] == "median" and m["M3"]["secondaryStatistic"] == "mean" and m["M3"]["observationInterpolation"] is False and m["M3"]["exactUTC"] is True and set(m["M3"]["report"]) >= {"n", "median", "mean", "min", "max", "NOT_AVAILABLE"} and m["tieToleranceKm"] == 1e-6 and m["delta"] == "error(condition X) - error(condition Y), km", "14 M3 definition")
    check(all(k in m for k in ("M1", "M2", "M4", "M5")) and m["secondaryOnly"] == ["M1", "M2", "M4", "M5"], "15 M1/M2/M4/M5 secondary")
    check(R["strata"] == ["overall", "calibration", "holdout", "perWindow"] and R["calibrationWindows"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and R["holdoutWindows"] == ["KE-H1", "KE-H3"] and R["poolingRule"].startswith("never combined without label"), "16 calibration / holdout separation")
    check(R["phaseA"]["modelRunCount"] == 0 and S["modelRunCount"] == 0 and S["trajectoryCount"] == 0 and R["phaseA"]["derivedFieldsCreated"] == 0 and R["phaseA"]["regriddingPerformed"] is False and S["interpretation"] == "NONE" and not (ROOT / "data/research/step26").exists() and not any(D.glob("step26-*run*")) and not any(D.glob("step26-*evaluation*")), "18 no model execution / no derived data in Phase A")
    rp = R["reproducibility"]; check(set(rp["derivedForcing"]) >= {"sourceSha256", "derivationScriptSha256", "targetGridSha256", "derivedFieldSha256"} and set(rp["run"]) >= {"configurationSha256", "forcingSha256", "runnerSha256", "resultSha256"} and rp["independentRerun"] is True and rp["conditionCMustEqualStep25C"] is True, "19 reproducibility requirement")
    text = proto + json.dumps(R, ensure_ascii=False) + json.dumps(M, ensure_ascii=False) + json.dumps(S, ensure_ascii=False)
    allowed_context = re.sub(r"Forbidden:[^\n]*|forbiddenLanguage[^\]]*\]|\"forbidden\"[^}]*}", "", text)
    check(not SELECTION.search(allowed_context), "20 no model-selection language")
    check(R["allowedLanguage"] == ["descriptive difference", "temporal sensitivity", "spatial representation sensitivity", "product difference"] and R["outlierPolicy"] == {"removal": False, "trimming": False, "winsorization": False, "weighting": False, "caseDeletion": False, "highestErrorReportedDescriptively": True}, "20/21 language / outlier policy")
    comps = M["comparisons"]; check([c["id"] for c in comps] == [1, 2, 3, 4] and [(c["X"], c["Y"]) for c in comps] == [("A", "B"), ("C", "D"), ("B", "D"), ("A", "C")] and comps[0]["status"] == "BLOCKED" and comps[2]["status"] == "BLOCKED" and comps[1]["status"] == "EXECUTABLE_PHASE_B" and comps[3]["status"] == "EXECUTABLE_PHASE_B" and comps[2]["type"] == "PRODUCT_COMPARISON" and comps[3]["hycomRerun"] is False and M["phaseBPlannedRuns"] == 12 and M["executedRuns"] == 0, "matrix: comparisons, statuses, planned runs")
    check(S["status"] == "PREREGISTRATION_LOCKED" and S["conditionB"] == "STEP26_DATA_BLOCKED" and S["comparisons"] == {str(c["id"]): c["status"] for c in comps} and S["alpha"] == 0.002 and S["windows"] == 6 and S["conditions"] == 4, "summary consistent")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleSha256": sha(RULE), "protocolSha256": sha(PROTO), "conditions": len(conds), "windows": len(R["windows"]), "modelRunCount": S["modelRunCount"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

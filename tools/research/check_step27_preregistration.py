"""Independent validator for STEP 27 Phase A (depth sensitivity preregistration). exit 0 = PASS. Deterministic output.
Checks: ancestry (incl. a4474eb8) · STEP 17–26 immutability (+ runtime at 155995dd) · exactly four depths · exact native depth values
(D15 = 15.81007 exact; others target/expected with nearest-native rule) · no vertical interpolation · alpha 0.002 · six windows · four
depth conditions · 24 planned runs · M3 definition · M1/M2/M4/M5 · holdout separation · no depth optimization · no new data · no model
execution; plus the data-availability fact recomputed from the raw STEP 25B files (depth dimension length 1 = 15.81007 m only ->
STEP27_DATA_BLOCKED)."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, RULE, PREREG, MATRIX, SUMMARY = D / "step27-depth-sensitivity-protocol.md", D / "step27-depth-rule.json", D / "step27-preregistration.json", D / "step27-experiment-matrix.json", D / "step27-summary.json"
LOCK = {"docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b",
        "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd", "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd",
        "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b", "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7",
        "docs/research/step24b-license-status.json": "7f9a8b9983dd3849e852d31514b6b512ed12195457930c70a104f24dcf8807ef", "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1",
        "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734", "docs/research/step25b-glorys-quality-gates.json": "56dcc6182d14346d6345de82bf16ad5b438f9ce739ba45a15d8807fd1b5cfb12",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step26-forcing-decomposition-rule.json": "b0ee1dc154998b6d2d140581636a1d11412bd57bceafbf0c0a3980697b91787c", "docs/research/step26-preregistration.json": "de082a8ef0ef893c4e492160eef518af1ada8c6de8e83f440cc37fcde10814ce",
        "docs/research/step26-summary.json": "d908506d058180c12017cc887b597b007fefb9c5a794a10c4eaba8abf9d25b03", "docs/research/step26-phase-b-preregistration.json": "c43e2f0ffe5a288de2d876bc6bd504a394a1b1cfabf0df77b390b2f10d786a8b",
        "docs/research/step26-forcing-decomposition-manifest.json": "b4c01e83c979bee89563f8d05aba0289020bd34af30bdf52c151e0700a9f110e", "docs/research/step26-derived-forcing-manifest.json": "82ec1df67d17fe93ed4331bd8acaf0058b11d64b746ef67b7b70ea9a878464d8",
        "docs/research/step26-evaluation.json": "b3ae47b32c2efb6174b760fa4bf47048b8bb3af9397f16c7c122813a621f7386", "docs/research/step26-paired-table.csv": "9fb9ba7bb4db09651a3edf079cea7802b9bb470b66b8033e9a0264e6baa8cb23",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "9e26d8cb", "a4474eb8")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
SELECTION = re.compile(r"\b(best depth|optimal depth|optimal|superior|validated|proven|selected depth|depth selected|production[- ]ready)\b", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"ancestry: {short}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"runtime unchanged: {name}")
    R = load(RULE); q = load(PREREG); M = load(MATRIX); S = load(SUMMARY); proto = PROTO.read_text(encoding="utf-8"); p25c = load(D / "step25c-test02-protocol.json"); b25 = load(D / "step25b-glorys-acquisition-manifest.json")
    check(q["protocolSha256"] == sha(PROTO) and q["ruleSha256"] == sha(RULE) and q["experimentMatrixSha256"] == sha(MATRIX) and q["validator"]["sha256"] == sha(__file__) and q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "a4474eb8", "lock cross references")
    check(R["ruleId"] == q["ruleId"] == M["ruleId"] == S["ruleId"] == "depth-sensitivity-step27" and R["baseCommit"] == "a4474eb8", "rule id / base")
    depths = R["depths"]; check([d["id"] for d in depths] == ["D05", "D10", "D15", "D20"] and len(depths) == 4 and [d["targetMeters"] for d in depths] == [5, 10, 15, 20], "exactly four depths, targets 5/10/15/20 m")
    d15 = depths[2]; check(d15["nativeLevelMeters"] == 15.81007 and d15["exact"] is True and d15["role"] == "control" and R["control"] == "D15" and R["controlFixedBeforeResults"] is True, "D15 = 15.81007 m exact control")
    check(all(abs(d["expectedNativeLevelMeters"] - e) < 1e-3 for d, e in zip(depths, (5.078, 9.573, 15.81007, 21.599))) and all(d["rule"] == "single native GLORYS level nearest the target, exact value read from file metadata; no vertical interpolation, no averaging, no depth search" for d in depths), "expected native levels / nearest-native rule")
    check(all(d["verticalInterpolation"] is False for d in depths) and R["forbidden"]["verticalInterpolation"] is False and R["forbidden"]["verticalAveraging"] is False and R["forbidden"]["depthSearch"] is False, "no vertical interpolation")
    check(R["alpha"] == {"value": 0.002, "alpha0Runs": 0, "search": False, "reselection": False, "step20Changed": False}, "alpha 0.002 only")
    check([w["windowId"] for w in R["windows"]] == WINDOWS and R["excluded"]["KE-H2"]["paired"] is False and R["excluded"]["AG-holdout"] == "UNAVAILABLE; not invented", "six windows; KE-H2 excluded")
    p25w = {w["windowId"]: w for w in p25c["windows"]}
    for w in R["windows"]:
        pw = p25w[w["windowId"]]; check(w["t0"] == pw["t0"] and w["drifterIds"] == pw["drifterIds"] and w["role"] == pw["role"] and w["releasePositions"] == pw["releasePositions"] and w["computationArea"] == pw["computationArea"] and w["wind"] == pw["wind"] and w["glorysBox"] == pw["oceanBox"], f"window identity = STEP 25C: {w['windowId']}")
    check(R["conditions"] == [{"id": d["id"], "name": f"GLORYS_{d['id']}", "depthTargetMeters": d["targetMeters"], "runs": 6} for d in depths] and len(R["conditions"]) == 4, "four depth conditions")
    check(R["runMatrix"]["plannedRuns"] == 24 and R["runMatrix"]["conditions"] == 4 and R["runMatrix"]["windows"] == 6 and R["runMatrix"]["order"] == ["D05", "D10", "D15", "D20"] and M["plannedRuns"] == 24 and M["executedRuns"] == 0 and len(M["cells"]) == 24, "24 planned runs")
    m = R["metrics"]; check(m["M3"]["radiusMeters"] == 6371008.8 and m["M3"]["horizonsHours"] == [24, 48, 72] and m["M3"]["primaryStatistic"] == "median" and m["M3"]["secondaryStatistic"] == "mean" and m["M3"]["observationInterpolation"] is False and m["M3"]["exactUTC"] is True and m["tieToleranceKm"] == 1e-6 and m["delta"] == "error(depth) - error(D15), km; negative = alternative depth lower error", "M3 definition")
    check(all(k in m for k in ("M1", "M2", "M4", "M5")) and m["secondaryOnly"] == ["M1", "M2", "M4", "M5"] and m["M4"].startswith("72 h") and R["depthSeparation"]["horizonsHours"] == [24, 48, 72] and R["depthSeparation"]["pairs"] == ["D05 vs D15", "D10 vs D15", "D20 vs D15"], "M1/M2/M4/M5 and depth separation")
    check(R["comparisons"] == ["D05 vs D15", "D10 vs D15", "D20 vs D15"], "pairwise comparisons vs D15")
    check(R["calibrationWindows"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and R["holdoutWindows"] == ["KE-H1", "KE-H3"] and R["holdoutRole"] == "descriptive only; never used to choose a depth; no re-ranking" and R["strata"] == ["overall", "calibration", "holdout", "perWindow"], "holdout separation")
    no = R["noDepthOptimization"]; check(all(no[k] is False for k in ("addDepthAfterResults", "removeDepthAfterResults", "interpolateToBestDepth", "selectFromHoldout", "combineLayers", "weightedProfile", "operationalWinner")) and no["sensitivityOnly"] is True, "no depth optimization")
    check(R["dataPolicy"]["newDownloadInPhaseA"] is False and R["dataPolicy"]["newObservation"] is False and R["dataPolicy"]["newWindow"] is False and R["dataPolicy"]["replacementData"] is False and S["newDataCount"] == 0, "no new data")
    check(R["phaseA"]["modelRunCount"] == 0 and S["modelRunCount"] == 0 and S["trajectoryCount"] == 0 and S["interpretation"] == "NONE" and not (ROOT / "data/research/step27").exists() and not any(D.glob("step27-*run*")) and not any(D.glob("step27-*evaluation*")), "no model execution")
    # data-availability fact recomputed from the raw STEP 25B files
    sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); import netCDF4  # noqa: E402
    levels = {}
    for w in b25["windows"]:
        with netCDF4.Dataset(ROOT / w["file"]) as ds:
            levels[w["windowId"]] = [round(float(x), 6) for x in ds["depth"][:]]
        check(sha(ROOT / w["file"]) == w["sha256"], f"raw GLORYS file SHA: {w['windowId']}")
    check(all(v == [15.81007] for v in levels.values()) and R["dataAvailability"]["levelsPresentInAcquiredFiles"] == [15.81007] and R["dataAvailability"]["status"] == "STEP27_DATA_BLOCKED" and R["dataAvailability"]["missingConditions"] == ["D05", "D10", "D20"] and S["dataStatus"] == "STEP27_DATA_BLOCKED", "data-availability fact: only 15.81007 m present -> STEP27_DATA_BLOCKED")
    check(M["conditionStatus"] == {"D05": "STEP27_DATA_BLOCKED", "D10": "STEP27_DATA_BLOCKED", "D15": "AVAILABLE (STEP 25C Condition C forcing)", "D20": "STEP27_DATA_BLOCKED"}, "matrix condition status")
    rp = R["reproducibility"]; check(set(rp["perRun"]) >= {"depth", "sourceForcingSha256", "configurationSha256", "runnerSha256", "readerSha256", "resultSha256", "replayResultSha256"} and rp["independentReplay"] is True and rp["d15MustEqualStep25C"] is True, "reproducibility")
    check(R["outlierPolicy"] == {"removal": False, "trimming": False, "winsorization": False, "weighting": False, "manualExclusion": False} and R["statisticalPolicy"]["independenceAssumed"] is False and R["statisticalPolicy"]["independentSampleTests"] is False and R["statisticalPolicy"]["signTest"] == "nominal only, n >= 10, never a selection criterion", "outlier / statistical policy")
    text = proto + json.dumps(R, ensure_ascii=False) + json.dumps(M, ensure_ascii=False) + json.dumps(S, ensure_ascii=False)
    scan = re.sub(r"No depth optimization[^\n]*|forbiddenLanguage[^\]]*\]|\"noDepthOptimization\"[^}]*}", "", text)
    check(not SELECTION.search(scan), "no depth-selection language")
    check(S["status"] == "PREREGISTRATION_LOCKED" and S["depths"] == 4 and S["control"] == "D15 15.810070 m" and S["windows"] == 6 and S["plannedRuns"] == 24 and S["alpha"] == 0.002 and S["verticalInterpolation"] is False, "summary consistent")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleSha256": sha(RULE), "protocolSha256": sha(PROTO), "depths": len(depths), "windows": len(R["windows"]), "plannedRuns": R["runMatrix"]["plannedRuns"], "dataStatus": S["dataStatus"], "modelRunCount": S["modelRunCount"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

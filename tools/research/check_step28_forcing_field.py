"""Independent validator for STEP 28 (ocean forcing field agreement / AVISO reference diagnostic). `--phase A` (lock) or `--phase B`.
exit 0 = PASS. Deterministic output. Phase A verifies the locked design: 1 ancestry · 2 immutability (STEP 17–27 + runtime + STEP 23
AVISO file SHAs) · 3 dataset identity · 4 AVISO reference-only role · 5 exact timestamp rule (registered timestamps recomputed from the
AVISO files; HYCOM 12Z frame presence and the KE-H2 missing frame recomputed from the locked HYCOM datasets) · 6 common-grid intersection
rule · 7 valid-cell mask rule · 8 no interpolation across AVISO time gaps · 9-12 vector/magnitude/direction/correlation definitions ·
13 depth labels (exact native levels) · 14 no trajectory execution · 15 no new data · 16 no parameter tuning · 17 calibration/holdout labels ·
18 reproducibility requirement · 19 no ground-truth language. Phase B (later) additionally re-derives the field metrics."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, PREREG, MATRIX = D / "step28-forcing-field-protocol.md", D / "step28-preregistration.json", D / "step28-experiment-matrix.json"
LOCK = {"docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701",
        "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd", "docs/research/step23-data-acquisition-manifest.json": "2f47cba7e29edc06a1f71bb4e2ed9dc373910e81e1f454b80595e955fd149b9a",
        "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b", "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7",
        "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1", "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d", "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6",
        "docs/research/step27-depth-rule.json": "603435292009708e7516eb39b2ba8ff705b4331dbc93f4ab98c9e55b3b217ca4", "docs/research/step27-depth-forcing-manifest.json": "14f6218a24948d3170bd74c3512f7693c3bc376914fdfd978c4ec197b964ac47",
        "docs/research/step27-depth-manifest.json": "b5ef8cf1706666e38806db38e53b112def678a4718a3b6f5f3e644fb4120d3f0", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step27-depth-paired-table.csv": "9482e9ddb553e6ff2c1f4901553cb2a692705670cb0f3d7ae8384ffce09f8a9b", "docs/research/step27-depth-evaluation.json": "14167bf78e7ee64d557152e6f3d67af01ffc5d1f819bc3d76515222931b0aa9d",
        "docs/research/step27b-r2-rule.json": "22fa3ad36e4e2870104a9e8862e0ab63f5c8f3742987a68c571d5a05eb0a98b0", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
        "data/research/step23/DATA-03/erdTAgeo1day/KE-1.erdTAgeo1day.nc": "18d6d75692e34379b6c0afeaa9233bea56850f0bbb4caada89886fc257482919", "data/research/step23/DATA-03/erdTAgeo1day/KE-2.erdTAgeo1day.nc": "0750f095bca4e5901beb05ce0d5174a9400cd1e7f087cc56cc934917f0841148",
        "data/research/step23/DATA-03/erdTAgeo1day/KE-H1.erdTAgeo1day.nc": "cf2a248d6a8ccda2a78b8798fa4ecaec3f4c5f75c32ad6dae3456adb0247c2d7", "data/research/step23/DATA-03/erdTAgeo1day/KE-H2.erdTAgeo1day.nc": "8dcd1db9a27d6d730786b82aa21b426fb21ca7ad2f55c594ee0d75a714bc6abf",
        "data/research/step23/DATA-03/erdTAgeo1day/KE-H3.erdTAgeo1day.nc": "bca272caa2841f8c78279598335d4ff4de9735c6fbcf32b96155a2ce35bcf0db"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "2a5c8f9a", "d5fb2a62", "d242165d", "b9078805", "0c2b3cb7", "3338c7e4")
TRUTH = re.compile(r"ground[- ]truth|AVISO proves|proves (GLORYS|HYCOM)|is correct|is wrong|\bcause[sd]?\b|proven mechanism|\bproven\b|\boptimal\b|\bsuperior\b", re.I)
EXPECTED_T = {"KE-1": "2010-05-12T12:00:00Z", "KE-2": "2010-06-30T12:00:00Z", "KE-H1": "2010-08-11T12:00:00Z", "KE-H2": "2010-08-18T12:00:00Z", "KE-H3": "2010-11-17T12:00:00Z"}


def sha(path):
    import hashlib
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "A"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 ancestry: {short}")
    for name in ("datasets.py", "models.py", "models_v2.py", "wind.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    q = load(PREREG); M = load(MATRIX); proto = PROTO.read_text(encoding="utf-8"); R = q["rules"]
    check(q["status"] == "PREREGISTRATION LOCKED" and q["protocolSha256"] == sha(PROTO) and q["experimentMatrixSha256"] == sha(MATRIX) and q["validator"]["sha256"] == sha(__file__) and q["gitCommitAtDesign"] == "3338c7e4" and q["ruleId"] == M["ruleId"] == "forcing-field-agreement-step28", "0 lock cross references")
    ds = R["datasets"]
    check(ds["HYCOM"]["identity"] == "HYCOM GOFS 3.1 GLBv0.08 expt_53.X" and ds["HYCOM"]["depthMeters"] == 15.0 and ds["HYCOM"]["cadence"] == "3-hourly instantaneous" and ds["GLORYS"]["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and ds["GLORYS"]["datasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and ds["GLORYS"]["primaryDepthMeters"] == 15.81007 and ds["AVISO"]["datasetId"] == "erdTAgeo1day" and ds["AVISO"]["variables"] == ["u_current", "v_current"] and ds["AVISO"]["resolutionDegrees"] == 0.25 and ds["AVISO"]["longitudeConvention"] == "0..360", "3 dataset identity")
    av = ds["AVISO"]; check(av["role"] == "REFERENCE FIELD DIAGNOSTIC" and av["groundTruth"] is False and av["isDrifterVelocity"] is False and av["addedToHYCOM"] is False and av["addedToGLORYS"] is False and av["usedForAlphaTuning"] is False and av["sshDerivedVelocity"] is False and av["erdTAssh1dayUsed"] is False, "4 AVISO reference-only role")
    tr = R["timeRule"]; check(tr["exactTimestampOnly"] is True and tr["interpolationAcrossAvisoFrames"] is False and tr["manufacturedTimestamps"] is False and tr["hycomMatch"] == "instantaneous frame at exactly T must exist; missing -> HYCOM comparisons BLOCKED for that window (no substitution)" and tr["glorysMatch"] == "daily-mean frame of the UTC day containing T (label T - 12 h); same-UTC-day match, disclosed product-cadence difference; not interpolation", "5 exact timestamp rule / 8 no interpolation across AVISO gaps")
    # recompute registered AVISO timestamps from the files and HYCOM frame presence from the locked datasets
    sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); import netCDF4  # noqa: E402
    fm17 = load(D / "step17-forcing-manifest.json"); b3 = load(D / "step20-b3-holdout-forcing-manifest.json")
    for w in R["windows"]:
        wid = w["windowId"]
        if w["avisoTimestamp"] is None:
            check(w["fieldStatus"] == "NO_EXACT_AVISO_TIME" and wid in ("AG-1", "AG-2"), f"5 {wid} NO_EXACT_AVISO_TIME")
            continue
        with netCDF4.Dataset(ROOT / w["avisoFile"]) as nc:
            t = nc["time"]; times = [x.strftime("%Y-%m-%dT%H:%M:%SZ") for x in netCDF4.num2date(t[:], t.units)]
            check(sha(ROOT / w["avisoFile"]) == w["avisoSha256"] and w["avisoTimestamp"] == EXPECTED_T[wid] and w["avisoTimestamp"] in times and w["t0"] <= w["avisoTimestamp"] <= w["end"] and w["avisoFramesInFile"] == times and all(v in nc.variables for v in ("u_current", "v_current")), f"5 {wid} AVISO timestamp registered = file frame inside window")
        if wid in ("KE-1", "KE-2", "AG-1", "AG-2"):
            hfiles = [next(x for x in fm17["runUnits"] if x["windowId"] == wid)["hycom"]["normalized"]["file"]]
        else:
            h = next(x for x in b3["runUnits"] if x["windowId"] == wid).get("hycom", {}); hfiles = [h["chunks"][c]["file"] for c in sorted(h["chunks"])] if "chunks" in h else ([h["normalized"]["file"]] if h.get("normalized") else [])
        htimes = sorted({tt for f in hfiles for tt in load(ROOT / f)["grid"]["timeUTC"]})
        present = w["avisoTimestamp"] in htimes
        check(w["hycomFrameAtT"] == present and (w["comparisonsExecutable"] == ["A", "B", "C"] if present else w["comparisonsExecutable"] == ["C"]) and (wid != "KE-H2" or (not present and w["hycomFrameAtT"] is False)), f"5 {wid} HYCOM frame at T recomputed (present={present}); KE-H2 A/B blocked")
        check(w["glorysFrameLabel"] == w["avisoTimestamp"][:10] + "T00:00:00Z" and (w["glorysD15File"].endswith(f"{wid}.glorys15.81m.dataset.json") if wid != "KE-H2" else w["glorysD15File"].endswith("KE-H2.glorys12v1.uo_vo.15.81m.nc")) and sha(ROOT / w["glorysD15File"]) == w["glorysD15FileSha256"], f"5 {wid} GLORYS same-UTC-day frame label / D15 file SHA")
    sp = R["spatialRule"]; check(sp["comparisonNodes"] == "AVISO 0.25 degree nodes inside the STEP 25A ocean box and inside the HYCOM and GLORYS grid extents" and sp["sampling"] == "bilinear at AVISO nodes from the native HYCOM / GLORYS fields" and sp["extrapolation"] is False and sp["secondaryGrid"] == "HYCOM native 0.08 degree nodes with GLORYS sampled bilinearly (comparison A only)", "6 common-grid intersection rule")
    vm = R["validCellRule"]; check(vm["hycom"] == "all four stencil nodes non-null at the matched frame" and vm["glorys"] == "all four stencil nodes landMask false" and vm["aviso"] == "node value not masked" and vm["pairedComparison"] == "only cells valid in every compared field" and all(vm[k] is False for k in ("zeroFill", "landSubstitution", "nearestNeighbour", "smoothing")), "7 valid-cell mask rule")
    mt = R["metrics"]; check(mt["vectorDifference"] == "sqrt((u_model - u_ref)^2 + (v_model - v_ref)^2)" and mt["speed"] == "sqrt(u^2 + v^2)" and mt["relativeSpeedDifference"] == "(|V_model| - |V_ref|) / |V_ref|; NOT_AVAILABLE where |V_ref| == 0 exactly; no epsilon" and mt["bearing"] == "atan2(u, v) in degrees clockwise from north; defined only when speed != 0 exactly" and mt["signedDirectionDifference"] == "wrap(bearing_model - bearing_ref) in (-180, 180]; positive = model clockwise from reference" and mt["absoluteDirectionDifference"] == "|signed| in [0, 180]" and mt["correlation"] == "Pearson r of u and of v across common cells; NOT_AVAILABLE if zero variance" and mt["rmsVectorDifference"] == "sqrt(mean(|delta|^2))" and mt["percentiles"] == [10, 25, 50, 75, 90] and mt["biasWordForbidden"] is True, "9-12 vector / magnitude / direction / correlation definitions")
    dp = R["depthDiagnostic"]; check([d["id"] for d in dp["levels"]] == ["D05", "D10", "D15", "D20"] and [d["nativeLevelMeters"] for d in dp["levels"]] == [5.078224182128906, 9.572997093200684, 15.81007, 18.495559692382812] and dp["ranking"] is False and dp["preferredDepth"] is False and dp["newAcquisition"] is False and dp["verticalInterpolation"] is False, "13 depth labels = exact native levels; no ranking")
    check(R["modelRun"] == "FORBIDDEN" and R["trajectoryRuns"] == 0 and R["metricsNotComputed"] == ["M1", "M2", "M3", "M4", "M5"] and not any(D.glob("step28-*evaluation*")) and not (D / "step28-figures").exists() and not any(D.glob("step28-field-*")), "14 no trajectory execution (Phase A: no field outputs)")
    check(R["dataPolicy"] == {"newAVISO": False, "newHYCOM": False, "newGLORYS": False, "newWind": False, "newObservations": False, "sources": ["STEP17 HYCOM", "STEP20 B-3 HYCOM", "STEP25B/25C GLORYS", "STEP27 GLORYS depth fields", "STEP23 AVISO erdTAgeo1day", "STEP20/21/25C/27 metadata"]}, "15 no new data")
    check(R["parameters"] == {"alpha": 0.002, "modified": False, "depthModified": False, "windageModified": False, "forcingWeights": False, "blendingCoefficients": False, "optimization": False}, "16 no parameter tuning")
    check(R["labels"]["calibration"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and R["labels"]["holdout"] == ["KE-H1", "KE-H3"] and R["labels"]["KE-H2"] == "field-reference coverage window; STEP 20 pairing unchanged" and R["labels"]["holdoutUsedToChooseForcing"] is False, "17 calibration / holdout labels")
    check(R["reproducibility"] == {"evaluatorRerunByteIdentical": True, "figuresDeterministic": True, "sourceShaRecorded": True, "validatorRunTwice": True}, "18 reproducibility requirement")
    text = proto + json.dumps(R, ensure_ascii=False) + json.dumps(M, ensure_ascii=False)
    scan = re.sub(r"(?i)never state[^\n]*|forbidden[^\n]*|\*\*not ground truth\*\*|not ground truth|groundTruth\W+false|\"forbiddenLanguage\"[^\]]*\]|\"allowedLanguage\"[^\]]*\]|not: full surface current[^\n]*", "", text)
    check(not TRUTH.search(scan), "19 no ground-truth / causal / selection language")
    check([w["windowId"] for w in R["windows"]] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"] and M["executedComparisons"] == 0 and M["figuresCreated"] == 0 and len(M["cells"]) == 7 * 3, "matrix: 7 windows x 3 comparisons registered, none executed")
    check(R["evidenceClasses"] == ["DIRECTLY_SUPPORTED", "SUPPORTED_INDICATION", "PLAUSIBLE_BUT_UNTESTED", "INSUFFICIENT_EVIDENCE"] and len(R["questions"]) == 6, "evidence classes / Q1-Q6")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": phase, "protocolSha256": sha(PROTO), "eligibleWindows": [w["windowId"] for w in R["windows"] if w["fieldStatus"] == "ELIGIBLE"], "modelRun": R["trajectoryRuns"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

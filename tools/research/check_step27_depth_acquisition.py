"""Independent validator for STEP 27B (missing native depth acquisition and quality gate). `--phase A` (lock) or `--phase B` (full).
exit 0 = PASS. Deterministic output (no timestamps). Checks: 1 ancestry · 2 immutability (STEP 17–27 locks + runtime) · 3 product
identity · 4/5/6 D05/D10/D20 native depth (returned level re-read from the files; expected nearest native from the recorded level list) ·
7 exact windows · 8 spatial coverage · 9 temporal coverage · 10 variables · 11 units · 12 missing source frames · 13 release stencil ·
14 no vertical interpolation · 15 no substitution · 16 D15 unchanged (STEP 25B file SHAs) · 17 no model run · 18 no alpha modification ·
19 no depth selection · 20 SHA integrity of every acquired file · 21 reproducibility (quality tool re-run byte-identical); credential scan."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, PREREG, RULE = D / "step27b-depth-acquisition-protocol.json", D / "step27b-preregistration.json", D / "step27b-rule-sha256.txt"
MANIFEST, GATESF, MATRIX, ACCESS, SUMMARY = D / "step27-depth-acquisition-manifest.json", D / "step27-depth-quality-gates.json", D / "step27-depth-coverage-matrix.csv", D / "step27-depth-access-status.json", D / "step27-depth-summary.json"
LOCK = {"docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653",
        "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1", "docs/research/step25b-glorys-acquisition-protocol.json": "0a542a94ee0c04a54ac7bd543c7f89eb0462e0a19e89668c969935178dc76eb9",
        "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734", "docs/research/step25b-glorys-quality-gates.json": "56dcc6182d14346d6345de82bf16ad5b438f9ce739ba45a15d8807fd1b5cfb12",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step26-forcing-decomposition-rule.json": "b0ee1dc154998b6d2d140581636a1d11412bd57bceafbf0c0a3980697b91787c", "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6",
        "docs/research/step26-forcing-decomposition-manifest.json": "b4c01e83c979bee89563f8d05aba0289020bd34af30bdf52c151e0700a9f110e", "docs/research/step27-depth-rule.json": "603435292009708e7516eb39b2ba8ff705b4331dbc93f4ab98c9e55b3b217ca4",
        "docs/research/step27-depth-sensitivity-protocol.md": "80e0398999dc4ecf99172dc540efbecaebcdf632c6ae95aa703fab22644dcdbb", "docs/research/step27-preregistration.json": "192824c2042e2c3fc6971c150048b9e5f509ea7f46244beef2e309f2a364dfa0",
        "docs/research/step27-experiment-matrix.json": "162141ebedd9cca6b7c998072707628d0999b6488c5a9e333f590f477f02abb5", "docs/research/step27-summary.json": "130efeb130bd51cad59dddf79c492c6caaff7046a15e7dffb9ded7f6f97bfbab",
        "tools/research/quality_step25b.py": "fd06dee31b3d0377dc09dd6a6cd9298944a598bc7af6d3d42d7298352a16c82f", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "2a5c8f9a")
WINDOWS7 = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"]
SECRET_VALUE = (r"password\s*[:=]\s*\S{4,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}", r"Basic [A-Za-z0-9+/=]{12,}")
SELECTION = re.compile(r"\b(best depth|optimal depth|optimal|superior|validated|proven|selected depth|depth selected)\b", re.I)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 ancestry: {short}")
    for name in ("datasets.py", "models.py", "models_v2.py", "wind.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    p = load(PROTO); q = load(PREREG); r27 = load(D / "step27-depth-rule.json"); p25b = load(D / "step25b-glorys-acquisition-protocol.json"); m25b = load(D / "step25b-glorys-acquisition-manifest.json")
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step27b-depth-acquisition-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step27b-preregistration.json") == sha(PREREG) and q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "2a5c8f9a", "0 lock cross references")
    for t in ("tools/research/acquire_step27b.py", "tools/research/quality_step27b.py", "tools/research/check_step27_depth_acquisition.py"):
        check(rule.get(t) == sha(ROOT / t), f"0 tool locked before acquisition: {t}")
    check(p["ruleId"] == q["ruleId"] == "missing-native-depth-acquisition-step27b" and p["MODEL_RUN"] == "FORBIDDEN" and p["step27RuleSha256"] == sha(D / "step27-depth-rule.json"), "0 rule id / MODEL_RUN / STEP 27 rule bound")
    check(p["product"]["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and p["product"]["datasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and p["product"]["variables"] == ["uo", "vo"], "3 product identity")
    levels = p["nativeLevelListMeters"]; conds = {c["id"]: c for c in p["depthConditions"]}
    check([c["id"] for c in p["depthConditions"]] == ["D05", "D10", "D20"] and len(levels) == 50 and 15.81007 in [round(x, 5) for x in levels], "depth conditions D05/D10/D20; native level list recorded (50 levels incl. 15.81007)")
    for cid, target, exp in (("D05", 5, 5.078224), ("D10", 10, 9.572997), ("D20", 20, 21.598816)):
        nearest = min(levels, key=lambda x: abs(x - target)); c = conds[cid]
        check(c["targetMeters"] == target and abs(c["expectedNativeLevelMeters"] - exp) < 1e-3 and abs(c["nearestNativeLevelMeters"] - nearest) < 1e-6 and c["verticalInterpolation"] is False, f"4/5/6 {cid} target / expected / nearest recorded")
        check((c["acquisitionStatus"] == "ACQUIRE") == (abs(nearest - c["expectedNativeLevelMeters"]) <= 0.01), f"4/5/6 {cid} acquisition only when expected == nearest native (else identity ambiguous, blocked)")
    check(c["id"] == "D20" and conds["D20"]["acquisitionStatus"] == "BLOCKED_DEPTH_IDENTITY_AMBIGUOUS" and conds["D20"]["blockedStatus"] == "DEPTH_IDENTITY_AMBIGUOUS" and abs(conds["D20"]["nearestNativeLevelMeters"] - 18.49556) < 1e-4, "6 D20: rule (nearest to 20 m = 18.49556) conflicts with expected 21.59882 -> blocked, not chosen")
    check([w["windowId"] for w in p["windows"]] == WINDOWS7 and all(w["subsetBox"] == b["subsetBox"] and w["t0"] == b["t0"] and w["releasePositions"] == b["releasePositions"] for w, b in zip(p["windows"], p25b["windows"])) and p["pairedWindows"] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"], "7 exact windows/boxes = STEP 25B; KE-H2 coverage fact only")
    check(p["d15"]["levelMeters"] == 15.81007 and p["d15"]["reacquire"] is False and p["d15"]["modify"] is False and p["forbidden"] == {"verticalInterpolation": False, "verticalAveraging": False, "multiLevelExtraction": False, "substitution": False, "fill": False, "regrid": False, "smoothing": False, "depthSelection": False, "alphaModification": False, "modelRun": False}, "11/14/15/18/19 D15 immutable; forbidden list")
    if phase == "A":
        check(not any(x.exists() for x in (MANIFEST, GATESF, MATRIX, ACCESS, SUMMARY)) and not (ROOT / "data/research/step27").exists(), "Phase A: no acquisition outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    m = load(MANIFEST); g = load(GATESF); acc = load(ACCESS); S = load(SUMMARY)
    check(m["credentialsInManifest"] is False and m["modelRunCount"] == 0 and acc["authentication"]["credentialsEntered"] is False and acc["authentication"]["credentialsStored"] is False and acc["credentialExistence"]["contentsRead"] is False and m["accessStatus"] == acc["accessStatus"] and (acc["accessStatus"] == "AUTHORIZED") == (acc["authentication"].get("authenticated") is True), "access record")
    for rel in [str(x.relative_to(ROOT)) for x in D.glob("step27-depth-*") if x.is_file()] + [str(x.relative_to(ROOT)) for x in D.glob("step27b-*") if x.is_file()] + ["tools/research/acquire_step27b.py"]:
        txt = (ROOT / rel).read_text(encoding="utf-8", errors="replace"); scan = chr(10).join(l for l in txt.splitlines() if 'r"' not in l and "r'" not in l)
        for pat in SECRET_VALUE:
            check(not re.search(pat, scan, re.I), f"credential-shaped value in {rel}")
    check(all(sha(ROOT / w["file"]) == w["sha256"] for w in m25b["windows"] if w["status"] == "ok") and g["d15"]["unchanged"] is True and g["d15"]["reacquired"] is False, "16 D15 unchanged (STEP 25B file SHAs)")
    sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); import netCDF4, numpy as np  # noqa: E402
    n_files = 0
    for d in m["depths"]:
        c = conds[d["id"]]; gd = next(x for x in g["depths"] if x["id"] == d["id"])
        if c["acquisitionStatus"] != "ACQUIRE":
            check(not d["windows"] and gd["status"] == c["blockedStatus"] and not (ROOT / "data/research/step27" / d["id"]).exists(), f"{d['id']} not acquired (blocked as preregistered)"); continue
        check([w["windowId"] for w in d["windows"]] == WINDOWS7, f"7 {d['id']} windows acquired in order")
        for w in d["windows"]:
            gw = next(x for x in gd["windows"] if x["windowId"] == w["windowId"]); pw = next(x for x in p["windows"] if x["windowId"] == w["windowId"])
            if w["status"] != "ok":
                check(gw["status"] == "NOT_ACQUIRED", f"{d['id']}/{w['windowId']} not ok recorded"); continue
            path = ROOT / w["file"]; n_files += 1
            check(path.exists() and sha(path) == w["sha256"] and path.stat().st_size == w["bytes"] and "password" not in w["command"].lower() and "nearest" in w["command"] and f"-z {c['targetMeters']} -Z {c['targetMeters']}" in w["command"], f"20 SHA integrity / single-level nearest request: {d['id']}/{w['windowId']}")
            with netCDF4.Dataset(path) as ds:
                dep = [float(x) for x in np.array(ds["depth"][:]).ravel()]; lon = np.array(ds["longitude"][:], float); lat = np.array(ds["latitude"][:], float); t = ds["time"]; nt = len(t[:])
                check(len(dep) == 1 and abs(dep[0] - c["expectedNativeLevelMeters"]) <= 0.01 and dep == w["returnedDepthLevelsMeters"] and gw["depthIdentity"] == "PASS", f"4/5/6 {d['id']} native depth identity: {w['windowId']} ({dep})")
                check(all(v in ds.variables for v in ("uo", "vo")) == (gw["gates"]["G5"] == "PASS") and all(getattr(ds.variables[v], "units", "").replace(" ", "") in ("ms-1", "m/s") for v in ("uo", "vo") if v in ds.variables) == (gw["gates"]["G9"] == "PASS"), f"10/11 variables/units: {d['id']}/{w['windowId']}")
                check(bool(np.all(np.diff(lon) > 0) and np.all(np.diff(lat) > 0)) == (gw["gates"]["G3"] == "PASS") and len(gw["detail"]["timestamps"]) == nt, f"coordinates / time axis: {d['id']}/{w['windowId']}")
            box = pw["oceanBox"]; check((lon.min() <= box["west"] and box["east"] <= lon.max() and lat.min() <= box["south"] and box["north"] <= lat.max()) == (gw["gates"]["G6"] == "PASS"), f"8 spatial coverage: {d['id']}/{w['windowId']}")
            check((gw["gates"]["G7"] == "PASS") == (not gw["detail"].get("missingSourceFrames")) and gw["detail"]["timestamps"][0] <= w["t0"] and w["end"] <= gw["detail"]["timestamps"][-1], f"9/12 temporal coverage / missing frames: {d['id']}/{w['windowId']}")
            check((gw["gates"]["G10"] == "PASS") == bool(gw["detail"].get("G10")), f"13 release stencil: {d['id']}/{w['windowId']}")
        paired = [x["windowId"] for x in gd["windows"] if x["status"] == "WINDOW_PASS" and x["windowId"] != "KE-H2"]
        exp = "DEPTH_IDENTITY_FAIL" if any(x["status"] == "DEPTH_IDENTITY_FAIL" for x in gd["windows"]) else ("DEPTH_READY" if len(paired) == 6 else ("DEPTH_PARTIAL_COVERAGE" if paired else "DEPTH_QUALITY_FAILED"))
        check(gd["status"] == exp and gd["pairedWindowsPass"] == paired, f"{d['id']} status arithmetic ({exp})")
    ready = [x["id"] for x in g["depths"] if x["status"] == "DEPTH_READY"]
    exp_status = "STEP27B_CREDENTIALS_REQUIRED" if acc["accessStatus"] != "AUTHORIZED" else ("STEP27B_DATA_QUALITY_FAILED" if (not g["d15"]["unchanged"] or any(x["status"] == "DEPTH_IDENTITY_FAIL" for x in g["depths"])) else ("STEP27B_READY_FOR_TEST" if len(ready) == 3 else ("STEP27B_PARTIAL_COVERAGE" if ready else "STEP27B_DATA_QUALITY_FAILED")))
    check(g["status"] == S["status"] == exp_status, f"status arithmetic ({exp_status})")
    check(g["substitutionPerformed"] is False and g["interpolationPerformed"] is False and g["verticalInterpolation"] is False and g["depthSelection"] is False and g["modelRunCount"] == 0 and S["modelRunCount"] == 0 and S["trajectoryCount"] == 0 and S["newObservations"] == 0 and S["alpha"] == 0.002 and S["alphaModified"] is False and not any(D.glob("step27-*run*")) and not any(D.glob("step27-*evaluation*")) and not any((ROOT / "data/research/step27").glob("**/*.trajectories.csv")), "14/15/17/18/19 no interpolation / substitution / model run / alpha change / depth selection")
    check(g["gateImplementation"]["sha256"] == LOCK["tools/research/quality_step25b.py"], "gate implementation = locked STEP 25B tool")
    for st in p["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    text = json.dumps(S, ensure_ascii=False) + json.dumps({k: v for k, v in g.items() if k != "depths"}, ensure_ascii=False)
    check(not SELECTION.search(text), "19 no depth-selection language")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/quality_step27b.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step27-depth-quality-gates.json", "step27-depth-coverage-matrix.csv", "step27-depth-summary.json")), "21 G11 reproducibility: quality outputs byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "status": S["status"], "accessStatus": acc["accessStatus"], "filesVerified": n_files, "depths": {x["id"]: x["status"] for x in g["depths"]}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

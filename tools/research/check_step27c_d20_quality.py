"""Independent validator for STEP 27C (D20 native depth acquisition and quality gate). `--phase A` (lock) or `--phase B` (full). exit 0 = PASS.
Deterministic output. Checks: 1 ancestry · 2 immutability (STEP 17–27B-r2 locks + runtime) · 3 product identity · 4 exact request
(-z 20 -Z 20 --coordinates-selection-method nearest) · 5 returned native depth re-read from every file · 6 tolerance 0.01 m vs 18.49556 ·
7 single vertical level · 8 no interpolation (native coordinate = inventory value; no resampling flags) · 9 variables · 10 coordinates ·
11 time axis · 12 coverage (spatial + temporal) · 13 missingness recorded · 14 units · 15 release stencil · 16 SHA integrity ·
17 no model artifacts · 18 model run count 0 · 19 D05/D10/D15 unchanged · 20 STEP 27B-r2 consistency; G11 reproducibility (quality re-run)."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, PREREG, RULE = D / "step27c-d20-acquisition-protocol.json", D / "step27c-preregistration.json", D / "step27c-rule-sha256.txt"
MANIFEST, GATESF, MATRIX, ACCESS, SUMMARY = D / "step27c-d20-acquisition-manifest.json", D / "step27c-d20-quality-gates.json", D / "step27c-d20-coverage-matrix.csv", D / "step27c-d20-access-status.json", D / "step27c-d20-summary.json"
LOCK = {"docs/research/step27-depth-rule.json": "603435292009708e7516eb39b2ba8ff705b4331dbc93f4ab98c9e55b3b217ca4", "docs/research/step27-preregistration.json": "192824c2042e2c3fc6971c150048b9e5f509ea7f46244beef2e309f2a364dfa0",
        "docs/research/step27b-depth-acquisition-protocol.json": "38be0a2ebae7c448bc675e05cce3b8e37e9521f95e58724f07fdd039282c967b", "docs/research/step27b-preregistration.json": "33974129106c5afbde1fdb1ca26767b88e8212bfd5c4901994ded317c2d9d0a6",
        "docs/research/step27-depth-acquisition-manifest.json": "6cb007f956a225d91c0bcfdd616e3ef4ddc18cd32ef59e6ef092ce47589170bc", "docs/research/step27-depth-quality-gates.json": "77afc61c98648088463f013152fdc6f3f0df04f7bda15dc7cfd660f6a96336fd",
        "docs/research/step27-depth-summary.json": "8a55ff9975e550290577e3b4333b668d92cc5d2a9a0df7fa02417028ea280dd7", "docs/research/step27b-r2-rule.json": "22fa3ad36e4e2870104a9e8862e0ab63f5c8f3742987a68c571d5a05eb0a98b0",
        "docs/research/step27b-r2-preregistration.json": "c6ae12632a4995bcbe7c537dade1b86895a668efb89c8bd646f13fe5d938ed5d", "docs/research/step27b-r2-depth-identity-protocol.md": "15125882f0cb84b607039f9c694ae6faa43abaad078b496abf442aed784b3581",
        "tools/research/quality_step25b.py": "fd06dee31b3d0377dc09dd6a6cd9298944a598bc7af6d3d42d7298352a16c82f", "tools/research/acquire_step27b.py": "e4a4ac4010bf76585945307382020819d30d81176a68580ac73fbc8c3516c628", "tools/research/quality_step27b.py": "9e8a86347f79a0f29179ecbd80f1beafebdd8eb8ac93394a590d78067fb8559d",
        "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734", "docs/research/step25b-glorys-acquisition-protocol.json": "0a542a94ee0c04a54ac7bd543c7f89eb0462e0a19e89668c969935178dc76eb9",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "2a5c8f9a", "d5fb2a62", "d242165d", "b9078805")
WINDOWS7 = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"]
SECRET_VALUE = (r"password\s*[:=]\s*\S{4,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}", r"Basic [A-Za-z0-9+/=]{12,}")
D20 = 18.49556


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
    for name in ("datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    p = load(PROTO); q = load(PREREG); r2 = load(D / "step27b-r2-rule.json"); p25b = load(D / "step25b-glorys-acquisition-protocol.json"); m25b = load(D / "step25b-glorys-acquisition-manifest.json"); m27b = load(D / "step27-depth-acquisition-manifest.json")
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step27c-d20-acquisition-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step27c-preregistration.json") == sha(PREREG) and q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "b9078805", "0 lock cross references")
    for t in ("tools/research/acquire_step27c.py", "tools/research/quality_step27c.py", "tools/research/check_step27c_d20_quality.py"):
        check(rule.get(t) == sha(ROOT / t), f"0 tool locked before acquisition: {t}")
    check(p["ruleId"] == q["ruleId"] == "d20-acquisition-quality-gate-step27c" and p["MODEL_RUN"] == "FORBIDDEN" and p["step27bR2RuleSha256"] == sha(D / "step27b-r2-rule.json"), "0 rule id / MODEL_RUN / bound to STEP 27B-r2")
    check(p["product"]["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and p["product"]["datasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and p["product"]["variables"] == ["uo", "vo"], "3 product identity")
    conds = p["depthConditions"]; c = conds[0]
    check(len(conds) == 1 and c["id"] == "D20" and c["targetMeters"] == 20 and abs(c["expectedNativeLevelMeters"] - r2["d20"]["nativeLevelMeters"]) < 1e-9 and abs(c["expectedNativeLevelMeters"] - D20) < 1e-5 and c["acquisitionStatus"] == "ACQUIRE" and c["verticalInterpolation"] is False and c["request"] == "-z 20 -Z 20 --coordinates-selection-method nearest", "4/20 D20 condition = STEP 27B-r2 (18.49556 m), exact request")
    check(p["nativeLevelListMeters"] == r2["nativeLevelListMeters"] and abs(min(p["nativeLevelListMeters"], key=lambda x: abs(x - 20)) - D20) < 1e-5 and p["rejectedAlternativeMeters"] == 21.598816, "20 native level list identical to STEP 27B-r2; nearest recomputed; alternative rejected")
    check([w["windowId"] for w in p["windows"]] == WINDOWS7 and all(w["subsetBox"] == b["subsetBox"] and w["t0"] == b["t0"] and w["releasePositions"] == b["releasePositions"] for w, b in zip(p["windows"], p25b["windows"])) and p["pairedWindows"] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"], "exact windows/boxes = STEP 25B; KE-H2 coverage fact only")
    check(p["preserved"] == {"D05": 5.078224182128906, "D10": 9.572997093200684, "D15": 15.81007, "reacquire": False, "modify": False} and p["forbidden"]["verticalInterpolation"] is False and p["forbidden"]["multiLevelExtraction"] is False and p["forbidden"]["substitution"] is False and p["forbidden"]["depthComparison"] is False and p["forbidden"]["modelRun"] is False, "preserved depths; forbidden list")
    if phase == "A":
        check(not any(x.exists() for x in (MANIFEST, GATESF, MATRIX, ACCESS, SUMMARY)) and not (ROOT / "data/research/step27/D20").exists(), "Phase A: no acquisition outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    m = load(MANIFEST); g = load(GATESF); acc = load(ACCESS); S = load(SUMMARY)
    check(m["credentialsInManifest"] is False and m["modelRunCount"] == 0 and acc["authentication"]["credentialsEntered"] is False and acc["authentication"]["credentialsStored"] is False and acc["credentialExistence"]["contentsRead"] is False and m["accessStatus"] == acc["accessStatus"] and (acc["accessStatus"] == "AUTHORIZED") == (acc["authentication"].get("authenticated") is True), "access record")
    for rel in [str(x.relative_to(ROOT)) for x in D.glob("step27c-*") if x.is_file()] + ["tools/research/acquire_step27c.py"]:
        txt = (ROOT / rel).read_text(encoding="utf-8", errors="replace"); scan = chr(10).join(l for l in txt.splitlines() if 'r"' not in l and "r'" not in l)
        for pat in SECRET_VALUE:
            check(not re.search(pat, scan, re.I), f"credential-shaped value in {rel}")
    check(all(sha(ROOT / w["file"]) == w["sha256"] for w in m25b["windows"] if w["status"] == "ok") and all(sha(ROOT / x["file"]) == x["sha256"] for d in m27b["depths"] for x in d["windows"] if x["status"] == "ok") and g["d15"]["unchanged"] is True and g["d05d10"]["unchanged"] is True, "19 D05/D10/D15 unchanged (STEP 25B / 27B file SHAs)")
    sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); import netCDF4, numpy as np  # noqa: E402
    d = m["depths"][0]; gd = g["depths"][0]; n_files = 0
    check(len(m["depths"]) == 1 and d["id"] == "D20" and [w["windowId"] for w in d["windows"]] == WINDOWS7 and len(g["depths"]) == 1, "D20 only; seven windows in order")
    for w in d["windows"]:
        gw = next(x for x in gd["windows"] if x["windowId"] == w["windowId"]); pw = next(x for x in p["windows"] if x["windowId"] == w["windowId"])
        if w["status"] != "ok":
            check(gw["status"] == "NOT_ACQUIRED", f"{w['windowId']} not ok recorded"); continue
        path = ROOT / w["file"]; n_files += 1
        check(path.exists() and sha(path) == w["sha256"] and path.stat().st_size == w["bytes"] and "password" not in w["command"].lower() and "--coordinates-selection-method nearest" in w["command"] and "-z 20 -Z 20" in w["command"] and w["requestedDepthTargetMeters"] == 20, f"4/16 SHA integrity / exact request: {w['windowId']}")
        with netCDF4.Dataset(path) as ds:
            dep = [float(x) for x in np.array(ds["depth"][:]).ravel()]; lon = np.array(ds["longitude"][:], float); lat = np.array(ds["latitude"][:], float); t = ds["time"]; nt = len(t[:])
            check(len(ds.dimensions["depth"]) == 1 and len(dep) == 1, f"7 single vertical level: {w['windowId']}")
            check(abs(dep[0] - D20) <= 0.01 and dep == w["returnedDepthLevelsMeters"] and gw["depthIdentity"] == "PASS" and any(abs(dep[0] - x) < 1e-6 for x in p["nativeLevelListMeters"]), f"5/6/8 returned native depth = inventory value within tolerance, not resampled: {w['windowId']} ({dep})")
            check(all(v in ds.variables for v in ("uo", "vo")) == (gw["gates"]["G5"] == "PASS") and all(getattr(ds.variables[v], "units", "").replace(" ", "") in ("ms-1", "m/s") for v in ("uo", "vo") if v in ds.variables) == (gw["gates"]["G9"] == "PASS"), f"9/14 variables/units: {w['windowId']}")
            check(bool(np.all(np.diff(lon) > 0) and np.all(np.diff(lat) > 0)) == (gw["gates"]["G3"] == "PASS") and len(gw["detail"]["timestamps"]) == nt == 6, f"10/11 coordinates / time axis (6 frames): {w['windowId']}")
        box = pw["oceanBox"]; check((lon.min() <= box["west"] and box["east"] <= lon.max() and lat.min() <= box["south"] and box["north"] <= lat.max()) == (gw["gates"]["G6"] == "PASS"), f"12 spatial coverage: {w['windowId']}")
        check((gw["gates"]["G7"] == "PASS") == (not gw["detail"].get("missingSourceFrames")) and gw["detail"]["timestamps"][0] <= w["t0"] and w["end"] <= gw["detail"]["timestamps"][-1], f"12 temporal coverage / missing frames: {w['windowId']}")
        check(isinstance(gw["detail"].get("missingFractionBox"), (int, float)) and (gw["gates"]["G10"] == "PASS") == bool(gw["detail"].get("G10")), f"13/15 missingness recorded / release stencil: {w['windowId']}")
    paired = [x["windowId"] for x in gd["windows"] if x["status"] == "WINDOW_PASS" and x["windowId"] != "KE-H2"]
    exp_d = "DEPTH_IDENTITY_FAIL" if any(x["status"] == "DEPTH_IDENTITY_FAIL" for x in gd["windows"]) else ("DEPTH_READY" if len(paired) == 6 else ("DEPTH_PARTIAL_COVERAGE" if paired else "DEPTH_QUALITY_FAILED"))
    check(gd["status"] == exp_d and gd["pairedWindowsPass"] == paired and abs((gd.get("actualNativeLevelMeters") or 0) - D20) <= 0.01, f"D20 status arithmetic ({exp_d})")
    exp_status = "STEP27C_CREDENTIALS_REQUIRED" if acc["accessStatus"] != "AUTHORIZED" else ("STEP27C_DEPTH_IDENTITY_FAILED" if exp_d == "DEPTH_IDENTITY_FAIL" else ("STEP27C_DATA_QUALITY_FAILED" if not (g["d15"]["unchanged"] and g["d05d10"]["unchanged"]) else ("STEP27C_D20_READY" if exp_d == "DEPTH_READY" else ("STEP27C_PARTIAL_COVERAGE" if paired else "STEP27C_DATA_QUALITY_FAILED"))))
    check(g["status"] == S["status"] == exp_status, f"status arithmetic ({exp_status})")
    check(g["substitutionPerformed"] is False and g["interpolationPerformed"] is False and g["verticalInterpolation"] is False and g["depthSelection"] is False and g["modelRunCount"] == 0 and S["modelRunCount"] == 0 and S["trajectoryCount"] == 0 and S["newObservations"] == 0 and S["alpha"] == 0.002 and S["alphaModified"] is False and not any(D.glob("step27-*run*")) and not any(D.glob("step27-*evaluation*")) and not any((ROOT / "data/research/step27").glob("**/*.trajectories.csv")), "17/18 no model artifacts / model run count 0 / no interpolation / no substitution / no depth choice")
    check(g["gateImplementation"]["sha256"] == LOCK["tools/research/quality_step25b.py"], "gate implementation = locked STEP 25B tool")
    for st in p["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/quality_step27c.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step27c-d20-quality-gates.json", "step27c-d20-coverage-matrix.csv", "step27c-d20-summary.json")), "G11 reproducibility: quality outputs byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "status": S["status"], "accessStatus": acc["accessStatus"], "filesVerified": n_files, "d20": gd["status"], "actualNativeLevelMeters": gd.get("actualNativeLevelMeters")}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

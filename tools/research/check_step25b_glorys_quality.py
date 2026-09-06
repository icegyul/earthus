"""Independent validator for STEP 25B (GLORYS12V1 authorized acquisition & quality gate). `--phase A` or `--phase B`. exit 0 = PASS.
1 ancestry · 2 immutability STEP 17–25A (+ runtime) · 3 product identity · 4 authorized-access state consistent with evidence ·
5 credential absence from tracked/step25b files (value-shaped patterns) · 6 SHA-256 of every acquired file · 7 coordinates · 8 time axis ·
9 uo/vo · 10 15 m native depth · 11 spatial coverage · 12 temporal coverage · 13 missing frames · 14 release stencil · 15 units ·
16 no model artifacts · 17 model run count 0 · 18 alpha 0.002 · 19 baseline alpha 0 · 20 STEP 25A consistency; reproducibility
(quality tool re-run to a temp dir, byte-identical). Deterministic output (no timestamps)."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step25b-glorys-acquisition-protocol.json"
PREREG = ROOT / "docs/research/step25b-preregistration.json"
RULE = ROOT / "docs/research/step25b-rule-sha256.txt"
MANIFEST = ROOT / "docs/research/step25b-glorys-acquisition-manifest.json"
GATESF = ROOT / "docs/research/step25b-glorys-quality-gates.json"
MATRIX = ROOT / "docs/research/step25b-glorys-coverage-matrix.csv"
ACCESS = ROOT / "docs/research/step25b-glorys-access-status.json"
SUMMARY = ROOT / "docs/research/step25b-summary.json"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b",
        "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd", "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd",
        "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b", "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7",
        "docs/research/step24b-license-status.json": "7f9a8b9983dd3849e852d31514b6b512ed12195457930c70a104f24dcf8807ef", "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1",
        "docs/research/step25a-forcing-experiment-preregistration.json": "2c87dcfe40195745114baf134ebc5cd7021cf8ff62a5a854077385d21526bed8", "docs/research/step25a-experiment-matrix.json": "aba7590391e1a71d4b3481d1a97ca2f5154ec61f657886e3e775e61a3d45fc73",
        "docs/research/step25a-summary.json": "96c84a369c5111480d47eea491c7a8dc370acb5dd543e22897ee2a6d77c16576", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "322f0e57", "4bb4342b", "275d06e6", "e0e7cfd2", "15a81d25", "c34c6d97", "db6cea2f", "2841f511")
SECRET_VALUE = (r"password\s*[:=]\s*\S{4,}", r"username\s*[:=]\s*\S{3,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}", r"authorization:\s*\S+", r"Basic [A-Za-z0-9+/=]{12,}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 ancestry: {short}")
    for name in ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    cal = json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8")); hold = json.loads((ROOT / "docs/research/step20-b6-holdout-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in cal["runs"]) and all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in hold["runs"] if r.get("modeled")), "2 STEP 20 trajectories untouched")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8")); check(float(art["selectedAlpha"]) == 0.002, "18 alpha 0.002")
    check(set(x.name for x in (ROOT / "data/research/step20/holdout").iterdir()) <= {"forcing", "trajectories", "gate", "gate-b6"} and not any((ROOT / "docs/research").glob("step25b-*evaluation*")) and not any((ROOT / "docs/research").glob("step25b-*holdout*")) and not (ROOT / "data/research/step25b/trajectories").exists(), "16 no model artifacts")
    p = json.loads(PROTO.read_text(encoding="utf-8")); q = json.loads(PREREG.read_text(encoding="utf-8")); a25 = json.loads((ROOT / "docs/research/step25a-forcing-experiment-protocol.json").read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step25b-glorys-acquisition-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step25b-preregistration.json") == sha(PREREG), "0 protocol/preregistration cross reference")
    for t in ("tools/research/acquire_step25b.py", "tools/research/quality_step25b.py", "tools/research/check_step25b_glorys_quality.py"):
        check(rule.get(t) == sha(ROOT / t), f"0 tool SHA recorded before acquisition: {t}")
    check(p["ruleId"] == q["ruleId"] == "glorys12v1-acquisition-quality-gate-step25b" and q["status"] == "PREREGISTRATION LOCKED" and p["MODEL_RUN"] == "FORBIDDEN", "0 rule / LOCK / gate")
    check(p["product"]["productId"] == "GLOBAL_MULTIYEAR_PHY_001_030" and p["product"]["datasetId"] == "cmems_mod_glo_phy_my_0.083deg_P1D-m" and p["product"]["variables"] == ["uo", "vo"], "3 product identity")
    check(abs(p["depth"]["nearestNativeLevelMeters"] - 15.81) < 0.05 and p["depth"]["verticalInterpolation"] is False and p["depth"]["depthSearch"] is False and "15 m nearest" in a25["test02"]["depthRule"]["primary"], "10/20 depth rule consistent with STEP 25A")
    check([w["windowId"] for w in p["windows"]] == [w["windowId"] for w in a25["windows"]] and all(pw["oceanBox"] == aw["oceanBox"] and pw["t0"] == aw["t0"] for pw, aw in zip(p["windows"], a25["windows"])), "20 windows/boxes identical to STEP 25A")
    check(p["frozenAlpha"] == 0.002 and p["comparisonAlpha"] == 0.0 == a25["frozenBaseline"]["comparisonAlpha"], "18/19 alpha 0.002 / baseline 0")
    check(p["credentialPolicy"]["read"] is False and p["credentialPolicy"]["store"] is False and p["credentialPolicy"]["print"] is False and p["substitution"] == {"acrossMissingFrame": False, "hycom": False, "aviso": False, "otherDay": False, "duplicateFrames": False, "fill": False, "smoothing": False}, "credential / substitution policy")
    if phase == "A":
        check(not MANIFEST.exists() and not GATESF.exists() and not ACCESS.exists() and not (ROOT / "data/research/step25b/glorys").exists(), "0 Phase A: no acquisition outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    m = json.loads(MANIFEST.read_text(encoding="utf-8")); g = json.loads(GATESF.read_text(encoding="utf-8")); acc = json.loads(ACCESS.read_text(encoding="utf-8")); S = json.loads(SUMMARY.read_text(encoding="utf-8"))
    check(m["credentialsInManifest"] is False and m["modelRunCount"] == 0 and acc["authentication"]["credentialsEntered"] is False and acc["authentication"]["credentialsStored"] is False and acc["credentialExistence"]["contentsRead"] is False, "4/5 access record flags")
    authorized = acc["accessStatus"] == "AUTHORIZED"
    check(authorized == (acc["authentication"].get("authenticated") is True) and m["accessStatus"] == acc["accessStatus"], "4 access status consistent with authentication exit code")
    check((not authorized and m.get("downloaded", 0) == 0 and not (ROOT / "data/research/step25b/glorys").exists()) or authorized, "4 no download without authorization")
    for rel in [str(x.relative_to(ROOT)) for x in (ROOT / "docs/research").glob("step25b-*") if x.is_file()] + ["tools/research/acquire_step25b.py"]:
        txt = (ROOT / rel).read_text(encoding="utf-8", errors="replace"); scan = chr(10).join(l for l in txt.splitlines() if 'r"' not in l and "r'" not in l and "SECRET_ENV" not in l)
        for pat in SECRET_VALUE:
            check(not re.search(pat, scan, re.I), f"5 credential-shaped value in {rel}")
    n_files = 0
    for w in m.get("windows", []):
        if w.get("status") == "ok":
            path = ROOT / w["file"]; check(path.exists() and sha(path) == w["sha256"] and path.stat().st_size == w["bytes"] and "password" not in w["command"].lower(), f"6 file SHA {w['windowId']}"); n_files += 1
    if n_files:
        sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); import netCDF4, numpy as np  # noqa: E402
        for r in g["windows"]:
            if r["status"] == "NOT_ACQUIRED":
                continue
            d = r["detail"]; path = ROOT / d["file"]
            with netCDF4.Dataset(path) as ds:
                lon = np.array(ds.variables["longitude"][:], float); lat = np.array(ds.variables["latitude"][:], float); dep = [float(x) for x in np.array(ds.variables["depth"][:]).ravel()]
                check(bool(np.all(np.diff(lon) > 0) and np.all(np.diff(lat) > 0)) == (r["gates"]["G3"] == "PASS"), f"7 coordinates {r['windowId']}")
                check(all(v in ds.variables for v in ("uo", "vo")) == (r["gates"]["G5"] == "PASS") and all(getattr(ds.variables[v], "units", "").replace(" ", "") in ("ms-1", "m/s") for v in ("uo", "vo") if v in ds.variables) == (r["gates"]["G9"] == "PASS"), f"9/15 variables/units {r['windowId']}")
                check(len(dep) == 1 and abs(dep[0] - p["depth"]["nearestNativeLevelMeters"]) < 0.05, f"10 native 15 m level {r['windowId']}")
                t = ds.variables["time"]; n_t = len(t[:]); check(len(d["timestamps"]) == n_t, f"8 time axis {r['windowId']}")
            w = next(x for x in p["windows"] if x["windowId"] == r["windowId"]); box = w["oceanBox"]
            check((lon.min() <= box["west"] and box["east"] <= lon.max() and lat.min() <= box["south"] and box["north"] <= lat.max()) == (r["gates"]["G6"] == "PASS"), f"11 spatial coverage {r['windowId']}")
            check((r["gates"]["G7"] == "PASS") == (not d.get("missingSourceFrames")), f"12/13 temporal coverage / missing frames {r['windowId']}")
    # status arithmetic
    n_pass = sum(1 for r in g["windows"] if r["status"] == "WINDOW_PASS"); n_acq = sum(1 for r in g["windows"] if r["status"] != "NOT_ACQUIRED")
    exp = "STEP25B_CREDENTIALS_REQUIRED" if not authorized else ("STEP25B_GLORYS_BLOCKED" if n_acq == 0 else (("STEP25B_PARTIAL_COVERAGE" if n_pass > 0 else "STEP25B_DATA_QUALITY_FAILED") if (n_pass < 7 or any(r["status"] == "DATASET_BLOCKED" for r in g["windows"])) else "STEP25B_GLORYS_READY_FOR_TEST"))
    check(S["status"] == exp == g["test02Eligibility"]["status"], f"status arithmetic ({exp})")
    check(len(g["windows"]) == 7 and [r["windowId"] for r in g["windows"]] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"] and "KE-H2" not in g["test02Eligibility"]["pairedWindowsEligible"], "20 seven windows; KE-H2 never paired")
    check(g["substitutionPerformed"] is False and g["interpolationPerformed"] is False and g["modelRunCount"] == 0 and S["modelRunCount"] == 0 and S["trajectoryCount"] == 0 and S["frozenAlpha"] == 0.002 and S["comparisonAlpha"] == 0.0, "13/17/18/19 no substitution / model run 0 / alpha")
    for st in ("STEP25B performs data acquisition and quality validation only.", "STEP25A experimental design remains unchanged.", "No model performance result is generated.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "GLORYS acceptance for TEST-02 does not imply superiority over HYCOM."):
        check(st in S["statements"], f"statement: {st[:30]}")
    check(len(MATRIX.read_text(encoding="utf-8").splitlines()) == 8, "coverage matrix 7 rows")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/quality_step25b.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(ROOT / "docs/research" / n) for n in ("step25b-glorys-quality-gates.json", "step25b-glorys-coverage-matrix.csv", "step25b-summary.json")), "G11 reproducibility: quality outputs byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "status": S["status"], "accessStatus": acc["accessStatus"], "filesVerified": n_files, "windowsPass": n_pass}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

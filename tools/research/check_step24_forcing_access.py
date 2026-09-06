"""Independent validator for STEP 24 (P1 forcing access resolution & experiment registration). `--phase A` or `--phase B`.
exit 0 = PASS, exit 1 = FAIL. Checks: 1 ancestry, 2 immutability of STEP 17–23 locked files and runtime, 3 no credential strings in
tracked/step24 files and no credential values recorded, 4 no model-run artifacts, 5 product identity copied from STEP 23 / evidence,
6 coverage calculations re-derived from STEP 23 gates, 7 license status consistent with the evidence rule, 8 experiment matrix
consistency, 9 frozen alpha 0.002 / 0, 10 frozen baseline; reproducibility: derive step re-run to a temp dir, byte-identical.
Prints deterministic output (no timestamps) so two validator runs can be compared byte-for-byte."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step24-forcing-access-protocol.json"
PREREG = ROOT / "docs/research/step24-forcing-access-preregistration.json"
RULE = ROOT / "docs/research/step24-rule-sha256.txt"
OUTS = ["step24-data-access-status.json", "step24-license-status.json", "step24-future-experiment-matrix.json", "step24-future-experiment-matrix.csv", "step24-summary.json"]
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498",
        "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b",
        "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd", "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd",
        "docs/research/step22-future-test-matrix.json": "55f6afd8c9c63f93e6472fed12fc636f1468160e1deaa5840c7c5c221d09ba93", "docs/research/step23-data-acquisition-protocol.json": "e2388a62a82b9f9c1f68b0275ec1e83da6dbbe7820c3b4739bb786bcedf01ff9",
        "docs/research/step23-data-acquisition-manifest.json": "2f47cba7e29edc06a1f71bb4e2ed9dc373910e81e1f454b80595e955fd149b9a", "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b",
        "docs/research/step23-data-requirement-status.json": "24825f53a615bfecde79972f7a4b8ad53079b71defeb5d66e7d7700f83e01873", "docs/research/step23-data-coverage-matrix.csv": "de035584c4198687c1dbfe7c04465dfa977581bf8004973f5a9dc6d037828012",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "322f0e57", "4bb4342b")
SECRET_VALUE = (r"password\s*[:=]\s*\S{4,}", r"passwd\s*[:=]\s*\S{4,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}", r"authorization:\s*\S+", r"Basic [A-Za-z0-9+/=]{12,}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 locked file unchanged: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 commit {short}")
    for name in ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8")); check(float(art["selectedAlpha"]) == 0.002, "9 frozen alpha 0.002")
    # 3 credentials: tracked research files + step24 files; only value-shaped patterns (regex definitions in validators are not values)
    tracked = subprocess.run(["git", "ls-files", "docs/research", "tools/research"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    for rel in tracked + [str(p.relative_to(ROOT)) for p in (ROOT / "docs/research").glob("step24-*") if p.is_file()]:
        try:
            txt = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        scan = chr(10).join(l for l in txt.splitlines() if 'r"' not in l and "r'" not in l)  # skip raw-string regex definitions (validator pattern lists), keep every data line
        for pat in SECRET_VALUE:
            check(not re.search(pat, scan, re.I), f"3 credential-shaped value in {rel}: {pat}")
    # 4 model-run artifacts
    hold_dirs = set(p.name for p in (ROOT / "data/research/step20/holdout").iterdir())
    check(hold_dirs <= {"forcing", "trajectories", "gate", "gate-b6"} and not (ROOT / "data/research/step24").exists() and not any((ROOT / "docs/research").glob("step24-*manifest*.json")) and not any((ROOT / "docs/research").glob("step24-*evaluation*")), "4 no model-run artifacts")
    cal = json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8")); hold = json.loads((ROOT / "docs/research/step20-b6-holdout-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in cal["runs"]) and all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in hold["runs"] if r.get("modeled")), "4 STEP 20 trajectories untouched")
    p = json.loads(PROTO.read_text(encoding="utf-8")); q = json.loads(PREREG.read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step24-forcing-access-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step24-forcing-access-preregistration.json") == sha(PREREG), "0 protocol/preregistration SHA cross-reference")
    for t in ("tools/research/assess_step24.py", "tools/research/check_step24_forcing_access.py"):
        check(rule.get(t) == sha(ROOT / t), f"0 tool SHA recorded before investigation: {t}")
    fb = p["frozenBaseline"]
    check(fb["alpha"] == 0.002 and fb["baselineAlpha"] == 0.0 and "HYCOM GOFS 3.1 GLBv0.08 expt_53.X" in fb["ocean"] and "NCEP-DOE R2" in fb["wind"] and fb["integrationStepSeconds"] == 300 and fb["outputStepSeconds"] == 900 and fb["modifiable"] is False, "10 frozen baseline")
    check(p["MODEL_RUN"] == "FORBIDDEN" and q["status"] == "PREREGISTRATION LOCKED" and p["ruleId"] == q["ruleId"] == "p1-forcing-access-resolution-step24", "11 MODEL_RUN gate / LOCK / rule id")
    s23 = json.loads((ROOT / "docs/research/step23-data-requirement-status.json").read_text(encoding="utf-8"))
    check(p["step23Status"]["DATA-01"] == s23["DATA-01"]["status"] and p["step23Status"]["DATA-06"] == s23["DATA-06"]["status"] and p["step23Status"]["DATA-03"]["erdTAgeo1day"] == s23["DATA-03"]["erdTAgeo1day"]["status"], "5 STEP 23 statuses copied exactly into the protocol")
    check(len(p["officialSources"]) >= 4 and all("url" in d and "purpose" in d and "id" in d for d in p["officialSources"]) and [t["id"] for t in p["futureTests"]] == [f"TEST-0{i}" for i in range(1, 9)], "0 official sources and TEST-01..08 preregistered")
    if phase == "A":
        check(not any((ROOT / "docs/research" / n).exists() for n in OUTS) and not (ROOT / "docs/research/step24-evidence").exists(), "0 Phase A: no assessment outputs/evidence")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    A = json.loads((ROOT / "docs/research/step24-data-access-status.json").read_text(encoding="utf-8")); L = json.loads((ROOT / "docs/research/step24-license-status.json").read_text(encoding="utf-8")); M = json.loads((ROOT / "docs/research/step24-future-experiment-matrix.json").read_text(encoding="utf-8")); S = json.loads((ROOT / "docs/research/step24-summary.json").read_text(encoding="utf-8"))
    run = json.loads((ROOT / "docs/research/step24-run.json").read_text(encoding="utf-8")); idx = json.loads((ROOT / "docs/research/step24-evidence/index.json").read_text(encoding="utf-8"))
    check(all(run["outputs"][n] == sha(ROOT / "docs/research" / n) for n in OUTS) and run["evidenceIndexSha256"] == sha(ROOT / "docs/research/step24-evidence/index.json") and run["modelRunCount"] == 0 and run["tool"]["sha256"] == sha(ROOT / "tools/research/assess_step24.py"), "4 run record / output SHAs")
    for d in idx["documents"]:
        if d.get("status") not in ("error", None):
            check((ROOT / "docs/research/step24-evidence" / f"{d['id']}.bin").exists() and sha(ROOT / "docs/research/step24-evidence" / f"{d['id']}.bin") == d["sha256"], f"5 evidence file {d['id']} SHA")
    check(set(d["id"] for d in idx["documents"]) == set(d["id"] for d in p["officialSources"]) and idx["credentialExistence"]["contentsRead"] is False, "5 all preregistered sources attempted; credential contents never read")
    check(A["MODEL_RUN"] == "FORBIDDEN" and A["modelRunCount"] == 0 and A["downloadsOfForcing"] == 0 and A["credentialsEntered"] is False and A["DATA-01"]["credentialsFabricated"] is False and A["DATA-01"]["downloadPerformed"] is False, "4/11 access record gates")
    # 7 license consistency with evidence rule
    lic = L["DATA-06"]; explicit = lic["explicitLicenseStatements"]
    expected = "LICENSE_UNKNOWN" if not explicit else ("LICENSE_CONFIRMED" if any(re.search(r"(cc[- ]by|creative commons|etalab|licence ouverte|open licen[cs]e)", e["snippet"], re.I) for e in explicit) else ("LICENSE_RESTRICTED" if any(re.search(r"restricted|not permitted|prohibited", e["snippet"], re.I) for e in explicit) else "LICENSE_UNKNOWN"))
    check(lic["status"] == expected and lic["modelUseAllowed"] == (expected == "LICENSE_CONFIRMED") and A["DATA-06"]["status"] == lic["status"] and S["DATA-06"] == lic["status"], f"7 DATA-06 license status consistent with evidence rule ({expected})")
    check(lic["determinations"]["noExplicitLicenseExists"] == (not explicit) and lic["product"]["productVersion"].startswith("1.0"), "7 license determinations")
    # DATA-01 access consistency
    d1 = A["DATA-01"]; cred = A["credentialExistence"]
    exp1 = "CREDENTIALS_REQUIRED" if not (cred["copernicusmarine_credentials_file"] or cred["env_COPERNICUSMARINE"]) else ("ACCESS_PATH_AVAILABLE" if A["toolbox"]["installed"] else "TOOLBOX_REQUIRED")
    check(d1["status"] == exp1 == S["DATA-01"] and d1["D_registrationRequired"] is True and d1["C_officialAnonymousDownloadPath"] is False and "BLOCKED/PENDING" in d1["step17GlorysRecord"] and d1["depthSelection"].startswith("NOT MADE"), f"5 DATA-01 access status ({exp1})")
    check([w["windowId"] for w in d1["requiredWindowsIfAccessGranted"]] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"] and all(w["variables"] == ["uo", "vo"] and w["depthInventoryRequested"] == ["surface", "5 m", "10 m", "15 m", "20 m"] for w in d1["requiredWindowsIfAccessGranted"]), "5 DATA-01 required windows/variables/depth inventory")
    # 6 DATA-03 coverage re-derived from STEP 23 gates
    g23 = json.loads((ROOT / "docs/research/step23-data-quality-gates.json").read_text(encoding="utf-8")); geo = g23["datasets"]["DATA-03"]["products"]["erdTAgeo1day"]
    cov = [w["windowId"] for w in geo["windowStatus"] if w["covered"]]
    check(A["DATA-03"]["eligibleWindowsTest03"] == cov and A["DATA-03"]["eligibleDrifters"] == sum(w["drifterCount"] for w in p["windows"] if w["windowId"] in cov) and all(x["eligibleForTest03"] == (x["windowId"] in cov) for x in A["DATA-03"]["perWindow"]), "6 DATA-03 coverage re-derived from STEP 23 gates")
    r3 = A["DATA-03"]["rules"]; check(r3["treatedAsObservedDrifterVelocity"] is False and r3["addedToHYCOM"] is False and r3["usedToTuneAlpha"] is False and r3["formulationChosen"] is False, "6 DATA-03 rules")
    # 8 matrix consistency
    tests = {t["id"]: t for t in M["tests"]}
    check(list(tests) == [f"TEST-0{i}" for i in range(1, 9)] and M["executed"] == 0 and M["MODEL_RUN"] == "FORBIDDEN" and all(all(k in t for k in ("requiredDataset", "currentAvailability", "licenseStatus", "coverage", "missingness", "requiredVariables", "requiredDepth", "numericalCompatibility", "holdoutUsable", "prerequisites", "status")) for t in tests.values()), "8 matrix fields")
    t6 = tests["TEST-06"]["registeredDesign"]
    check(t6["alpha"] == {"primary": 0.002, "baseline": 0.0, "frozen": True, "search": False} and t6["stokesCoefficient"] == 1.0 and t6["coefficientSearch"] is False and t6["runInStep24"] is False and tests["TEST-06"]["licenseStatus"] == lic["status"] and tests["TEST-06"]["status"] == ("ELIGIBLE" if lic["status"] == "LICENSE_CONFIRMED" else "REGISTERED_CONDITIONAL_ON_LICENSE"), "8 TEST-06 registered design consistent")
    check(tests["TEST-02"]["status"] == ("BLOCKED_CREDENTIALS_REQUIRED" if exp1 == "CREDENTIALS_REQUIRED" else tests["TEST-02"]["status"]) and tests["TEST-03"]["coverage"].startswith(f"{len(cov)}/7"), "8 TEST-02/03 consistent with access/coverage")
    check([x.get("priority") for x in M["priorityOrder"] if "priority" in x] == [1, 2, 3, 4, 5] and "DATA-01" in M["priorityOrder"][0]["item"] and "DATA-06" in M["priorityOrder"][1]["item"], "8 priority order")
    csv_rows = (ROOT / "docs/research/step24-future-experiment-matrix.csv").read_text(encoding="utf-8").splitlines()
    check(len(csv_rows) == 9 and csv_rows[0].startswith("id,name,requiredDataset"), "8 matrix CSV rows")
    # 15/16 statuses and statements
    exp_overall = "STEP24_CREDENTIALS_REQUIRED" if exp1 == "CREDENTIALS_REQUIRED" and lic["status"] != "LICENSE_CONFIRMED" else ("STEP24_LICENSE_BLOCKED" if lic["status"] != "LICENSE_CONFIRMED" else ("STEP24_ACCESS_RESOLUTION_COMPLETE" if exp1 == "ACCESS_PATH_AVAILABLE" else "STEP24_CREDENTIALS_REQUIRED"))
    check(S["status"] == exp_overall == A["overallStatus"] and S["status"] != "STEP24_ACCESS_RESOLUTION_COMPLETE" or exp_overall == "STEP24_ACCESS_RESOLUTION_COMPLETE", f"15 overall status arithmetic ({exp_overall})")
    for st in ("STEP24 does not establish that any new forcing is superior to the frozen HYCOM+NCEP baseline.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "No model performance conclusion is generated in STEP24."):
        check(st in S["statements"], f"16 statement present: {st[:40]}")
    check(S["frozenAlpha"] == 0.002 and S["frozenBaselineAlpha"] == 0.0 and S["modelRunCount"] == 0, "9 frozen alpha in summary")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/assess_step24.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(ROOT / "docs/research" / n) for n in OUTS), "13 reproducibility: derived outputs byte-identical on independent re-run")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "status": S["status"], "DATA-01": S["DATA-01"], "DATA-03": S["DATA-03"], "DATA-06": S["DATA-06"], "outputs": {n: sha(ROOT / "docs/research" / n) for n in OUTS}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Independent validator for STEP 27B-r2 (D20 native depth identity resolution, Phase A). exit 0 = PASS. Deterministic output.
Verifies: ancestry (incl. 2a5c8f9a, d5fb2a62, d242165d) · STEP 27 and STEP 27B immutability (+ STEP 17-26 locks, runtime) · native-level
list identical to the STEP 27B protocol inventory · 20 m distance calculation recomputed · D20 = 18.49556 m (literal nearest) · D05 =
5.078224 · D10 = 9.572997 · D15 = 15.81007 · no performance-based selection (no STEP 27 run/evaluation artifacts exist; performanceInspected
false) · no model execution · no new observations · no existing artifact modification · lock cross references."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
PROTO, RULE, PREREG = D / "step27b-r2-depth-identity-protocol.md", D / "step27b-r2-rule.json", D / "step27b-r2-preregistration.json"
LOCK = {"docs/research/step27-depth-rule.json": "603435292009708e7516eb39b2ba8ff705b4331dbc93f4ab98c9e55b3b217ca4", "docs/research/step27-depth-sensitivity-protocol.md": "80e0398999dc4ecf99172dc540efbecaebcdf632c6ae95aa703fab22644dcdbb",
        "docs/research/step27-preregistration.json": "192824c2042e2c3fc6971c150048b9e5f509ea7f46244beef2e309f2a364dfa0", "docs/research/step27-experiment-matrix.json": "162141ebedd9cca6b7c998072707628d0999b6488c5a9e333f590f477f02abb5",
        "docs/research/step27-summary.json": "130efeb130bd51cad59dddf79c492c6caaff7046a15e7dffb9ded7f6f97bfbab", "tools/research/check_step27_preregistration.py": "af4b997e7fa770fc6fde99d2ae16ba94aa8a11b1ae748f4434166379ec267f21",
        "docs/research/step27b-depth-acquisition-protocol.json": "38be0a2ebae7c448bc675e05cce3b8e37e9521f95e58724f07fdd039282c967b", "docs/research/step27b-preregistration.json": "33974129106c5afbde1fdb1ca26767b88e8212bfd5c4901994ded317c2d9d0a6",
        "docs/research/step27b-rule-sha256.txt": "a67d6a3d4715866198ed1e3cefdf8958a55752e5a9a3302071e7e8afd133a58c", "tools/research/acquire_step27b.py": "e4a4ac4010bf76585945307382020819d30d81176a68580ac73fbc8c3516c628",
        "tools/research/quality_step27b.py": "9e8a86347f79a0f29179ecbd80f1beafebdd8eb8ac93394a590d78067fb8559d", "tools/research/check_step27_depth_acquisition.py": "0a6dd94d3160067fb1a945c5b34d264209f631bb2e8a75f52f17139b1ede8cfc",
        "docs/research/step27-depth-access-status.json": "506a184c22dad724c109389239525fe19510a2824bd011f526bddd7bd2afe882", "docs/research/step27-depth-acquisition-manifest.json": "6cb007f956a225d91c0bcfdd616e3ef4ddc18cd32ef59e6ef092ce47589170bc",
        "docs/research/step27-depth-quality-gates.json": "77afc61c98648088463f013152fdc6f3f0df04f7bda15dc7cfd660f6a96336fd", "docs/research/step27-depth-coverage-matrix.csv": "e1f72dda2af9fb4a21eaf4009f2d9bee876c42469731a15e8d764ed669da4f24",
        "docs/research/step27-depth-summary.json": "8a55ff9975e550290577e3b4333b668d92cc5d2a9a0df7fa02417028ea280dd7", "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step26-forcing-decomposition-rule.json": "b0ee1dc154998b6d2d140581636a1d11412bd57bceafbf0c0a3980697b91787c",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "2a5c8f9a", "d5fb2a62", "d242165d")


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
    for name in ("datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"runtime unchanged: {name}")
    R = load(RULE); q = load(PREREG); p27b = load(D / "step27b-depth-acquisition-protocol.json"); r27 = load(D / "step27-depth-rule.json"); g27b = load(D / "step27-depth-quality-gates.json"); proto = PROTO.read_text(encoding="utf-8")
    check(q["protocolSha256"] == sha(PROTO) and q["ruleSha256"] == sha(RULE) and q["validator"]["sha256"] == sha(__file__) and q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "d242165d" and R["ruleId"] == q["ruleId"] == "d20-depth-identity-step27b-r2" and R["baseCommit"] == "d242165d", "lock cross references")
    check(R["superseding"] is False and R["step27RuleSha256"] == LOCK["docs/research/step27-depth-rule.json"] and R["step27bProtocolSha256"] == LOCK["docs/research/step27b-depth-acquisition-protocol.json"], "non-superseding; bound to STEP 27 / 27B SHAs")
    levels = p27b["nativeLevelListMeters"]; check(R["nativeLevelListMeters"] == levels and len(levels) == 50, "native-level list identical to STEP 27B inventory")
    target = 20.0; nearest = min(levels, key=lambda x: abs(x - target)); alt = 21.598816
    check(abs(nearest - 18.49556) < 1e-5 and abs(R["d20"]["nativeLevelMeters"] - nearest) < 1e-9 and abs(R["d20"]["nativeLevelMeters"] - 18.49556) < 1e-5, "D20 = 18.49556 m (literal nearest)")
    check(abs(R["d20"]["distanceMeters"] - abs(nearest - target)) < 1e-6 and abs(R["d20"]["distanceMeters"] - 1.50444) < 1e-5 and abs(R["d20"]["alternativeDistanceMeters"] - abs(min(levels, key=lambda x: abs(x - alt)) - target)) < 1e-6 and abs(R["d20"]["alternativeDistanceMeters"] - 1.598816) < 1e-5 and R["d20"]["distanceMeters"] < R["d20"]["alternativeDistanceMeters"], "20 m distance calculation recomputed")
    check(R["d20"]["rule"] == "literal nearest native level to 20 m" and R["d20"]["rejectedAlternativeMeters"] == 21.598816 and R["d20"]["verticalInterpolation"] is False and R["d20"]["performanceInspected"] is False and "18.495560" in proto and "21.598816" in proto and "1.504440" in proto and "1.598816" in proto, "D20 resolution stated; alternative rejected; no performance basis")
    check(r27["depths"][3]["targetMeters"] == 20 and r27["depths"][3]["rule"].startswith("single native GLORYS level nearest the target"), "STEP 27 rule text is the nearest-native rule")
    pre = R["preserved"]; d27 = {d["id"]: d for d in g27b["depths"]}
    check(abs(pre["D05"] - 5.078224) < 1e-6 and abs(pre["D10"] - 9.572997) < 1e-6 and pre["D15"] == 15.81007 and abs(d27["D05"]["actualNativeLevelMeters"] - 5.078224) < 1e-6 and abs(d27["D10"]["actualNativeLevelMeters"] - 9.572997) < 1e-6 and d27["D05"]["status"] == "DEPTH_READY" and d27["D10"]["status"] == "DEPTH_READY" and g27b["d15"]["unchanged"] is True, "D05 / D10 / D15 preserved and unchanged")
    check(R["phaseA"] == {"modelRunCount": 0, "depthComparisons": 0, "d20Acquisitions": 0, "newObservations": 0, "performanceInspected": False, "operationalDepthChosen": False} and not (ROOT / "data/research/step27" / "D20").exists() and not any(D.glob("step27-*run*")) and not any(D.glob("step27-*evaluation*")) and not any((ROOT / "data/research/step27").glob("**/*.trajectories.csv")), "no model execution / no D20 acquisition / no performance artifacts")
    plan = R["acquisitionPlanStep27C"]; check(plan["request"] == "-z 20 -Z 20 --coordinates-selection-method nearest" and abs(plan["requiredReturnedLevelMeters"] - 18.49556) < 1e-5 and plan["toleranceMeters"] == 0.01 and plan["windows"] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"] and plan["gates"] == ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"] and plan["executedHere"] is False, "STEP 27C plan registered, not executed")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "d20NativeLevelMeters": R["d20"]["nativeLevelMeters"], "distanceMeters": R["d20"]["distanceMeters"], "alternativeDistanceMeters": R["d20"]["alternativeDistanceMeters"], "modelRunCount": R["phaseA"]["modelRunCount"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Independent validator for STEP 24b (DATA-06 license evidence scope correction). `--phase A` or `--phase B`. exit 0 = PASS.
1 ancestry STEP 17–24; 2 immutability STEP 17–24 (incl. STEP 24 outputs and tools); 3 DATA-06 evidence contains no cmems_terms /
copernicus document; 4 every evidence source is on ftp.ifremer.fr under /ifremer/ww3/; 5 every license claim maps to a stored document
with matching SHA-256 and quoted text present in that document; 6 no credentials (values) in step24b files; 7 no model-run artifacts;
8 model run count 0; 9 alpha 0.002; 10 STEP 20 conclusion unchanged; status arithmetic re-derived; reproducibility (derive to temp dir,
byte-identical). Output is deterministic (no timestamps) so two runs compare byte-for-byte."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREREG = ROOT / "docs/research/step24b-preregistration.json"
RULE = ROOT / "docs/research/step24b-rule-sha256.txt"
EVID = ROOT / "docs/research/step24b-evidence"
OUTS = ["step24b-license-evidence-scope-correction.json", "step24b-license-status.json", "step24b-evidence-index.json", "step24b-summary.json"]
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb",
        "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe", "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd",
        "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd", "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b",
        "docs/research/step23-data-requirement-status.json": "24825f53a615bfecde79972f7a4b8ad53079b71defeb5d66e7d7700f83e01873", "docs/research/step24-forcing-access-protocol.json": "6db9e6c47510b9361aa5019e4840ff2db6a9db11307f2fb8b8dc747e86d53db5",
        "docs/research/step24-forcing-access-preregistration.json": "12a08d625c1416dc83cefbac82ab58de1065bddf50d5bc0fb5a46aed550f3b2b", "docs/research/step24-license-status.json": "2fed50d520b63fb3303926c78ec4668926db9cfb41f025df7d59a6cfed07a3e2",
        "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7", "docs/research/step24-summary.json": "4b29c5d2be8f9e5b4dac3d105cb8bdd80f75e7cc8b4611047b1cb7f2413ff390",
        "docs/research/step24-run.json": "9a8554f49450a4b9359eebf89e44317adee6e9f9bdb0983a5e36bb4749330ac3", "docs/research/step24-evidence/index.json": "6bfce2f35f8dfe5de0b054a162da1d144f81e35c8ae09c20fc20f51c9eca94a2",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "322f0e57", "4bb4342b", "275d06e6", "e0e7cfd2")
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
    for t in ("tools/research/assess_step24.py", "tools/research/check_step24_forcing_access.py"):
        blob = subprocess.run(["git", "show", f"275d06e6:{t}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / t).read_bytes().replace(b"\r\n", b"\n"), f"2 STEP 24 tool unchanged: {t}")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8")); check(float(art["selectedAlpha"]) == 0.002, "9 alpha 0.002 unchanged")
    h20 = json.loads((ROOT / "docs/research/step20-b6-holdout-summary.json").read_text(encoding="utf-8")); check(h20["interpretation"] == "NONE" and h20["alphaReselection"] is False, "10 STEP 20 conclusion record unchanged")
    hold_dirs = set(p.name for p in (ROOT / "data/research/step20/holdout").iterdir())
    check(hold_dirs <= {"forcing", "trajectories", "gate", "gate-b6"} and not (ROOT / "data/research/step24b").exists() and not any((ROOT / "docs/research").glob("step24b-*manifest*")) and not any((ROOT / "docs/research").glob("step24b-*evaluation*")), "7 no model-run artifacts")
    q = json.loads(PREREG.read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step24b-preregistration.json") == sha(PREREG) and rule.get("tools/research/assess_step24b.py") == sha(ROOT / "tools/research/assess_step24b.py") and rule.get("tools/research/check_step24b_license_scope.py") == sha(__file__), "0 preregistration/tool SHAs recorded before evidence collection")
    check(q["status"] == "PREREGISTRATION LOCKED" and q["ruleId"] == "data06-license-evidence-scope-correction-step24b" and q["parentStep24Commit"] == "e0e7cfd2" and q["MODEL_RUN"] == "FORBIDDEN", "0 LOCK / parent / gate")
    check(all("ftp.ifremer.fr/ifremer/ww3/" in s["url"] for s in q["sources"]) and not any("copernicus" in s["url"] or "cmems" in s["id"] for s in q["sources"]) and len(q["sources"]) >= 5, "4 preregistered sources all IFREMER ww3 tree, none Copernicus")
    if phase == "A":
        check(not EVID.exists() and not any((ROOT / "docs/research" / n).exists() for n in OUTS), "0 Phase A: no evidence/outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "preregistrationSha256": sha(PREREG)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    idx = json.loads((EVID / "index.json").read_text(encoding="utf-8")); L = json.loads((ROOT / "docs/research/step24b-license-status.json").read_text(encoding="utf-8"))["DATA-06"]
    E = json.loads((ROOT / "docs/research/step24b-evidence-index.json").read_text(encoding="utf-8")); C = json.loads((ROOT / "docs/research/step24b-license-evidence-scope-correction.json").read_text(encoding="utf-8")); S = json.loads((ROOT / "docs/research/step24b-summary.json").read_text(encoding="utf-8")); run = json.loads((ROOT / "docs/research/step24b-run.json").read_text(encoding="utf-8"))
    check(run["outputs"] == {n: sha(ROOT / "docs/research" / n) for n in OUTS} and run["evidenceIndexSha256"] == sha(EVID / "index.json") and run["modelRunCount"] == 0 and run["tool"]["sha256"] == sha(ROOT / "tools/research/assess_step24b.py"), "8 run record / output SHAs / model run count 0")
    docs = {d["id"]: d for d in idx["documents"]}
    check(set(docs) == {s["id"] for s in q["sources"]} and all("ftp.ifremer.fr/ifremer/ww3/" in d["url"] for d in docs.values()), "4 all sources attempted, IFREMER domain only")
    for d in docs.values():
        if d.get("status") == "ok":
            check((EVID / f"{d['id']}.bin").exists() and sha(EVID / f"{d['id']}.bin") == d["sha256"], f"5 evidence file {d['id']} SHA")
    txt_all = json.dumps(L, ensure_ascii=False) + json.dumps(E, ensure_ascii=False)
    check("cmems_terms" not in txt_all and "cmems_stac_product" not in txt_all.replace('"forbiddenDocumentIds": ["cmems_terms", "cmems_stac_product"]', "") and "copernicus" not in txt_all.lower().replace("copernicusevidenceused", "").replace("copernicusdocuments", ""), "3 no Copernicus evidence in DATA-06 records")
    check(L["copernicusEvidenceUsed"] is False and E["copernicusDocuments"] == 0 and E["orphanClaims"] == 0, "3 scope flags")
    # 5 every claim maps to a stored document; quoted text present in that document
    orphan = 0
    for c in L["applicableLicenseStatements"]:
        d = docs.get(c["document"]); ok = d is not None and d.get("status") == "ok" and c["documentSha256"] == d["sha256"] and "ftp.ifremer.fr/ifremer/ww3/" in c["url"]
        if ok:
            body = re.sub(r"\s+", " ", (EVID / f"{c['document']}.bin").read_bytes().decode("utf-8", "replace"))
            ok = c["text"][:120] in body
        orphan += 0 if ok else 1
    check(orphan == 0, f"5 every applicable claim maps to its IFREMER source with quoted text ({orphan} orphans)")
    check(all(x["document"] in docs for x in E["claims"]), "5 evidence index claims resolve to consulted documents")
    # status arithmetic re-derived
    named = [c for c in L["applicableLicenseStatements"] if "license" in c["categories"] and re.search(r"licence ouverte|etalab|creative commons|cc[- ]by|licen[cs]ed under|terms of use|conditions of use|conditions d'utilisation", c["text"], re.I)]
    restr = [c for c in L["applicableLicenseStatements"] if "restriction" in c["categories"] and re.search(r"not permitted|prohibited|forbidden|restricted to|only with (written )?permission|prior authori[sz]ation", c["text"], re.I)]
    exp = "LICENSE_RESTRICTED" if restr else ("LICENSE_CONFIRMED" if named else "LICENSE_UNKNOWN")
    check(L["finalLicenseStatus"] == exp and L["modelUseAllowed"] == (exp == "LICENSE_CONFIRMED") and S["DATA-06"] == exp and S["status"] == {"LICENSE_CONFIRMED": "STEP24B_LICENSE_CONFIRMED", "LICENSE_RESTRICTED": "STEP24B_LICENSE_RESTRICTED", "LICENSE_UNKNOWN": "STEP24B_LICENSE_UNKNOWN"}[exp], f"status arithmetic ({exp})")
    check(L["determination"]["1_explicitLicenseExists"] == bool(named), "determination consistent")
    check(S["DATA-01"] == "CREDENTIALS_REQUIRED" and S["DATA-03"] == "REFERENCE_ELIGIBLE_PARTIAL" and S["modelRunCount"] == 0 and S["frozenAlpha"] == 0.002 and S["MODEL_RUN"] == "FORBIDDEN", "8/9 summary statuses")
    check(C["parentStep24Commit"] == "e0e7cfd2" and C["step24FilesImmutable"] is True and C["modelRunCount"] == 0 and C["datasetsChanged"] is False and C["step24StatusUnchanged"] == "STEP24_CREDENTIALS_REQUIRED" and "cmems_terms" in C["defect"], "correction record fields")
    for st in ("STEP24 remains immutable.", "STEP24b supersedes only the DATA-06 license-evidence scope.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "No model performance conclusion is generated."):
        check(st in C["statements"] and st in S["statements"], f"statement present: {st[:30]}")
    for rel in [str(p.relative_to(ROOT)) for p in (ROOT / "docs/research").glob("step24b-*") if p.is_file()] + ["tools/research/assess_step24b.py"]:
        txt = (ROOT / rel).read_text(encoding="utf-8", errors="replace"); scan = chr(10).join(l for l in txt.splitlines() if 'r"' not in l and "r'" not in l)
        for pat in SECRET_VALUE:
            check(not re.search(pat, scan, re.I), f"6 credential-shaped value in {rel}")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/assess_step24b.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(ROOT / "docs/research" / n) for n in OUTS), "reproducibility: outputs byte-identical on independent re-run")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "status": S["status"], "DATA-06": S["DATA-06"], "applicableStatements": len(L["applicableLicenseStatements"]), "outputs": {n: sha(ROOT / "docs/research" / n) for n in OUTS}}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Independent validator for STEP 29 Phase A (Stokes drift license / experiment gate). exit 0 = PASS. Deterministic output.
Verifies: ancestry (incl. 4942421a) · immutability (STEP 17–28 locks + runtime + DATA-06 file SHAs) · DATA-06 identity (attributes re-read
from every file) · evidence source scope (only IFREMER/SHOM documents and the files' own attributes; Copernicus material absent) · license
claim/source mapping (every claim maps to a SHA-verified source; status follows the locked rule from the re-read attributes) · no
credential exposure · no data download (only STEP 23 files referenced) · no model run · no alpha modification · frozen TEST-06 structure
(control/treatment/structural baseline, coefficient 1.0, alpha 0.002 / 0, windows, terms separate) · no causal / improvement / ground-truth
language · reproducibility (assessment re-run to a temp dir byte-identical)."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402

PROTO, PREREG, LIC, EVI, DES, SUM = D / "step29-stokes-license-protocol.md", D / "step29-preregistration.json", D / "step29-stokes-license-status.json", D / "step29-stokes-evidence-index.json", D / "step29-stokes-experiment-design.json", D / "step29-summary.json"
LOCK = {"docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step23-data-acquisition-manifest.json": "2f47cba7e29edc06a1f71bb4e2ed9dc373910e81e1f454b80595e955fd149b9a", "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b",
        "docs/research/step24-license-status.json": "2fed50d520b63fb3303926c78ec4668926db9cfb41f025df7d59a6cfed07a3e2", "docs/research/step24b-license-status.json": "7f9a8b9983dd3849e852d31514b6b512ed12195457930c70a104f24dcf8807ef",
        "docs/research/step25a-forcing-experiment-protocol.json": "792ea745f11dc0e468daae97e053e8c374e9d5bc3c7483c6247f3302b93f07f1", "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab",
        "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step27-depth-manifest.json": "b5ef8cf1706666e38806db38e53b112def678a4718a3b6f5f3e644fb4120d3f0", "docs/research/step28-preregistration.json": "0b9da69cdbd4ea1df4d8d6bd0084463b8162388d4b12371990910b1020668b16",
        "docs/research/step28-field-summary.json": "a81350b33403e1da48384a2217e156ed9bbdaa3e1da685c17bbe08df5aab4175", "docs/research/step28-field-table.csv": "5b07fbe5cf5ed80d6e1268cecd2a229d2651bf95b868c0e35fd7a4f19d05a3f3",
        "docs/research/step28-field-evaluation.json": "c7c3e217516ecf515da221fef62bfa2778def1297e3cff578a2b62f9ada1576e", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
        "docs/research/step24b-evidence/ifremer_hindcast_readme.bin": "474be33ab38a948baed777be2336d457e0f3fb4ca0440f8433ffc7763ad9d342", "docs/research/step24b-evidence/ifremer_hindcast_readme_netcdf.bin": "b4c7818e0b162aab474c8a10b331f813e8c7a609b056e6a4d4156a3556d5d843",
        "docs/research/step24b-evidence/ifremer_hindcast_readme_sav.bin": "221b3fdf1f445c311cbe9fe9ebb9b038209157a4ac157d1b6c50b3d8e23be444", "docs/research/step24b-evidence/ifremer_global_readme.bin": "9a4fa39056451ff8affc33bea67afe91e754027d028644df6cd70cf869d4e69a"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "3338c7e4", "79a0d69d", "4942421a")
CAUSAL = re.compile(r"missing cause|will improve|is the cause|\bcauses\b|\bproves?\b|ground[- ]truth(?!,? not|\))|\boptimal\b|\bsuperior\b|Stokes drift (is|will) (the|going|improv)", re.I)
SECRET = (r"password\s*[:=]\s*\S{4,}", r"api[_-]?key\s*[:=]\s*\S{8,}", r"token\s*[:=]\s*[A-Za-z0-9_\-\.]{16,}")


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
    q = load(PREREG); L = load(LIC); E = load(EVI); G = load(DES); S = load(SUM); proto = PROTO.read_text(encoding="utf-8")
    check(q["status"] == "PREREGISTRATION LOCKED" and q["gitCommitAtDesign"] == "4942421a" and q["protocolSha256"] == sha(PROTO) and q["licenseStatusSha256"] == sha(LIC) and q["evidenceIndexSha256"] == sha(EVI) and q["experimentDesignSha256"] == sha(DES) and q["summarySha256"] == sha(SUM) and q["validator"]["sha256"] == sha(__file__) and q["tools"]["tools/research/assess_step29.py"] == sha(ROOT / "tools/research/assess_step29.py"), "lock cross references")
    check(L["ruleId"] == E["ruleId"] == G["ruleId"] == S["ruleId"] == "stokes-license-and-experiment-gate-step29" and L["dataset"] == "DATA-06" and "WAVEWATCH III GLOBMULTI" in L["product"] and "GLOB-30M" in L["product"] and "CFSR" in L["product"] and L["productVersion"] == ["1.0"] and L["priorStatus"] == "LICENSE_UNKNOWN", "DATA-06 identity / prior status")
    # re-read the six files: SHA vs STEP 23 manifest, attributes, identity
    m23 = load(D / "step23-data-acquisition-manifest.json"); files = []
    def walk(o):
        if isinstance(o, dict):
            if "file" in o and "DATA-06" in str(o.get("file")) and "sha256" in o:
                files.append(o)
            for v in o.values():
                walk(v)
        if isinstance(o, list):
            for v in o:
                walk(v)
    walk(m23); files = sorted(files, key=lambda f: f["file"]); dist = set(); n_ok = 0
    for f in files:
        p = ROOT / f["file"]; ok = sha(p) == f["sha256"]; n_ok += ok
        with netCDF4.Dataset(p) as ds:
            a = {k: str(getattr(ds, k)) for k in ("distribution_statement", "institution", "product_version", "source", "grid", "forcing_wind") if k in ds.ncattrs()}; dist.add(a.get("distribution_statement")); nt = len(ds["time"][:]); units = {v: str(ds[v].units).replace(" ", "") for v in ("uuss", "vuss")}
        check(ok and a.get("institution") == "SHOM and Ifremer" and a.get("product_version") == "1.0" and "GLOBMULTI" in a.get("source", "") and a.get("grid") == "glob_30m" and all(u in ("m/s", "ms-1") for u in units.values()), f"DATA-06 identity re-read: {p.name}")
        fe = next(x for x in E["documents"] if x.get("file") == f["file"]); check(fe["sha256"] == f["sha256"] and fe["shaVerified"] is True and fe["attributes"].get("distribution_statement") == a.get("distribution_statement"), f"evidence index file record: {p.name}")
    check(len(files) == 6 and n_ok == 6, "six DATA-06 files, all SHA-verified (no new download)")
    expected = "LICENSE_CONFIRMED" if dist == {"No restrictions"} and n_ok == 6 else "LICENSE_UNKNOWN"
    check(L["finalLicenseStatus"] == expected == S["licenseStatus"] and L["distributionStatementValues"] == sorted(dist) and L["modelUseAllowed"] == (expected == "LICENSE_CONFIRMED"), f"license status follows the locked rule from the re-read attributes ({expected})")
    srcs = {d["sha256"]: d for d in E["documents"] if "sha256" in d}
    check(all(c["sourceSha256"] in srcs and c["productApplicable"] is True and c["source"] in [f["file"] for f in files] for c in L["applicableStatements"]) and len(L["applicableStatements"]) == 6 and all(m["sourceSha256"] in srcs for m in E["claimSourceMapping"]), "claim / source mapping (every claim maps to a SHA-verified downloaded file)")
    for r in L["readmeDocuments"]:
        check(sha(ROOT / r["file"]) == r["sha256"] and r["licenseTermsFound"] is False and r["citationRequirementFound"] is False and "ifremer" in r["id"], f"README evidence: {r['id']}")
    text_all = json.dumps(L, ensure_ascii=False) + json.dumps(E, ensure_ascii=False) + proto
    check(L["copernicusEvidenceUsed"] is False and not re.search(r"copernicus", re.sub(r"Copernicus (Marine )?terms \(unrelated product\)|no Copernicus material used|Copernicus terms, unrelated|\"copernicusEvidenceUsed\": false", "", text_all), re.I), "no Copernicus contamination (only the exclusion statement mentions it)")
    check(all(o["appliesToDownloadedFiles"] is False for o in L["alternativeCandidates"]) and all(o["role"].startswith("ALTERNATIVE_CANDIDATE") for o in L["alternativeCandidates"]) and all("new preregistration" in o["role"] for o in L["alternativeCandidates"]), "alternative candidates recorded, not substituted")
    for pat in SECRET:
        check(not re.search(pat, text_all, re.I), "no credential exposure")
    check(E["newDownloads"] == 0 and E["credentialsInvolved"] is False and G["newDownloads"] == 0 and S["newData"] == 0 and not any((ROOT / "data/research").glob("step29*")), "no data download")
    check(G["MODEL_RUN"] == "FORBIDDEN" and G["modelRunCount"] == 0 and S["modelRunCount"] == 0 and not any(D.glob("step29-*run*")) and not any(D.glob("step29-*evaluation*")) and not any(D.glob("step29-*trajector*")), "no model run")
    check(G["alpha"] == 0.002 and G["alphaModified"] is False and G["control"]["alpha"] == 0.002 and G["treatment"]["alpha"] == 0.002 and G["structuralBaseline"]["pair"].endswith("alpha = 0") and S["alpha"] == 0.002 and load(D / "step20-selected-alpha.json")["selectedAlpha"] == 0.002, "alpha 0.002 unchanged; alpha 0 structural baseline")
    check(G["stokesCoefficient"] == 1.0 and G["coefficientSearch"] is False and G["alphaSearch"] is False and S["stokesCoefficient"] == 1.0, "Stokes coefficient 1.0; no search")
    check(G["control"]["ocean"].startswith("GLORYS12V1 native 15.810070 m") and G["treatment"]["ocean"].startswith("GLORYS12V1 native 15.810070 m") and "WW3" in G["treatment"]["stokes"] and "NCEP" in G["treatment"]["wind"] and G["treatment"]["equation"] == "dX/dt = U_ocean + U_Stokes + alpha * U_wind" and G["control"]["equation"] == "dX/dt = U_ocean + alpha * U_wind", "frozen TEST-06 structure")
    check(len(G["termsKeptSeparate"]) == 3 and "Stokes for current" in G["substitutionsForbidden"] and "AVISO for any term" in G["substitutionsForbidden"], "terms kept separate; substitutions forbidden")
    check(G["windows"]["calibration"] == ["KE-1", "KE-2", "AG-1", "AG-2"] and G["windows"]["holdout"] == ["KE-H1", "KE-H3"] and G["windows"]["KE-H2"].startswith("coverage fact only") and G["windows"]["AG-holdout"] == "UNAVAILABLE" and G["step20Modified"] is False, "window definitions")
    ts = G["technicalSuitability"]; check(ts["evaluated"] == (expected in ("LICENSE_CONFIRMED", "LICENSE_RESTRICTED")) and ts["cadenceSeconds"] == 10800 and ts["spatialResolutionDegrees"] == 0.5 and set(ts["variables"]) == {"uuss", "vuss"} and ts["gates"]["G7"] == "PASS" and ts["windowsNotCovered"] == [] and len(ts["windowsCovered"]) == 7 and "KE-2" in ts["caveat"], "technical suitability from frozen STEP 23 gates")
    check(G["decision"]["case"] == {"LICENSE_CONFIRMED": "A", "LICENSE_RESTRICTED": "B", "LICENSE_UNKNOWN": "C", "DATASET_BLOCKED": "D"}[expected] and G["decision"]["test06Status"] == ("ELIGIBLE_PENDING_EXECUTION_PROTOCOL" if expected == "LICENSE_CONFIRMED" else "BLOCKED") and S["test06Status"] == G["decision"]["test06Status"] and len(G["acceptanceForFutureTest"]) == 10, "decision tree / TEST-06 status")
    check(G["hypothesisStatus"].startswith("hypothesis only") and G["evidenceRationaleFromStep28"]["caveat"].endswith("not ground truth"), "hypothesis framing / AVISO caveat")
    scan = re.sub(r"hypothesisStatus\": \"[^\"]*\"|no claim that[^\"]*|not ground truth|\"caveat\": \"[^\"]*\"|no statement that[^\"]*|a hypothesis, not a claim[^\n]*", "", json.dumps(G, ensure_ascii=False) + json.dumps(S, ensure_ascii=False) + proto)
    check(not CAUSAL.search(scan), "no causal / improvement / ground-truth / selection language")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/assess_step29.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step29-stokes-license-status.json", "step29-stokes-evidence-index.json", "step29-stokes-experiment-design.json", "step29-summary.json")), "reproducibility: assessment re-run byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "licenseStatus": L["finalLicenseStatus"], "test06": G["decision"]["test06Status"], "modelRunCount": S["modelRunCount"], "filesVerified": n_ok}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

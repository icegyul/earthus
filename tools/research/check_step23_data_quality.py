"""Independent validator for STEP 23 (P1 data acquisition & quality gate). `--phase A` (preregistration only) or `--phase B`.
exit 0 = PASS, exit 1 = FAIL. Checks: ancestry commits and locked SHAs (STEP 17–22), alpha artifact unchanged, runtime unchanged,
no model run (no new trajectory dirs / manifests), no alpha selection; protocol/preregistration/rule-file cross references incl. tool SHAs;
Phase B: acquisition manifest and log consistency, every acquired file SHA/bytes re-hashed, no credential strings in outputs, coverage
re-derived independently for a sample of windows from the raw NetCDF (time bracketing, box inside grid, release stencil), gate
arithmetic, DATA-01 blocked with credentials-absent evidence, KE-H2 coverage-only, no interpolation/substitution flags,
reproducibility (quality tool re-run to a temp dir, byte-identical)."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step23-data-acquisition-protocol.json"
PREREG = ROOT / "docs/research/step23-data-acquisition-preregistration.json"
RULE = ROOT / "docs/research/step23-rule-sha256.txt"
MANIFEST = ROOT / "docs/research/step23-data-acquisition-manifest.json"
GATESF = ROOT / "docs/research/step23-data-quality-gates.json"
MATRIX = ROOT / "docs/research/step23-data-coverage-matrix.csv"
STATUS = ROOT / "docs/research/step23-data-requirement-status.json"
LOGF = ROOT / "docs/research/step23-acquisition/acquisition-log.jsonl"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
        "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4", "docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00",
        "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step20-holdout-forcing-manifest.json": "8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b",
        "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701", "docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd",
        "docs/research/step21-diagnostic-table.csv": "e52dc35d6750cc7260e05341d48b7eaa886dfc389f1880547a39b184dbdbbe78", "docs/research/step22-limitation-assessment.json": "88eeb25543025d9697ffd4e5cadcf1a0dd376a4eccc7752df009752b7fc4bd3b",
        "docs/research/step22-data-requirement-register.json": "5b965572137270e7c71aa6377d5ca6548b233ab1521cc63a8c63a4dc255ea61a", "docs/research/step22-future-test-matrix.json": "55f6afd8c9c63f93e6472fed12fc636f1468160e1deaa5840c7c5c221d09ba93",
        "docs/research/step22-summary.json": "0093d1c0ab8c73195c76b11da1ddf0609555f5ff49c2698069e31b0a76f4e5bd", "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "7b3d2a0e", "ed746129", "63c3e5dd", "7b0453b8", "82f725aa", "a7f62873")
SECRET = (r"password", r"passwd", r"api[_-]?key", r"token=", r"authorization:", r"Basic [A-Za-z0-9+/=]{12,}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"1 locked file unchanged: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 commit {short}")
    for name in ("netcdf_reader.py", "datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"1 runtime unchanged: {name}")
    art = json.loads((ROOT / "docs/research/step20-selected-alpha.json").read_text(encoding="utf-8")); check(float(art["selectedAlpha"]) == 0.002, "1 alpha 0.002 unchanged")
    cal = json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8")); hold = json.loads((ROOT / "docs/research/step20-b6-holdout-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in cal["runs"]) and all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in hold["runs"] if r.get("modeled")), "1 STEP 20 trajectories untouched")
    check(set(p.name for p in (ROOT / "data/research/step20/holdout").iterdir()) <= {"forcing", "trajectories", "gate", "gate-b6"} and not any((ROOT / "docs/research").glob("step2[3-9]-*holdout-manifest*")) and not any((ROOT / "docs/research").glob("step23-*evaluation*")), "1 no model run artifacts")
    p = json.loads(PROTO.read_text(encoding="utf-8")); q = json.loads(PREREG.read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step23-data-acquisition-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step23-data-acquisition-preregistration.json") == sha(PREREG), "2 protocol/preregistration SHA cross-reference")
    for t in ("tools/research/acquire_step23.py", "tools/research/quality_step23.py", "tools/research/check_step23_data_quality.py"):
        check(rule.get(t) == sha(ROOT / t), f"2 tool SHA recorded before execution: {t}")
    check(p["ruleId"] == q["ruleId"] == "p1-data-acquisition-quality-gate-step23" and q["status"] == "PREREGISTRATION LOCKED" and p["targets"] == ["DATA-01", "DATA-03", "DATA-06"] and p["frozenBaseline"]["alpha"] == 0.002 and p["otherDataAcquired"] is False, "2 rule / targets / baseline")
    check([w["windowId"] for w in p["windows"]] == ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H2", "KE-H3"] and all(p["prohibited"][k] is False for k in p["prohibited"]) and len(p["gates"]) == 11, "2 seven windows, prohibitions, 11 gates")
    check(q["immutabilityCheck"]["credentialFilesPresent"] == {"copernicusmarine": False, "netrc": False, "cdsapirc": False} and q["immutabilityCheck"]["copernicusmarineToolbox"] is False, "2 credential/toolbox absence recorded (existence only)")
    if phase == "A":
        check(not MANIFEST.exists() and not GATESF.exists() and not (ROOT / "data/research/step23").exists() and not LOGF.exists(), "3 Phase A: no acquisition/quality outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG)}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    m = json.loads(MANIFEST.read_text(encoding="utf-8")); g = json.loads(GATESF.read_text(encoding="utf-8")); st = json.loads(STATUS.read_text(encoding="utf-8"))
    check(m["protocolSha256"] == sha(PROTO) and m["credentialsEntered"] is False and m["modelRuns"] == 0 and m["alphaChanged"] is False and m["acquisitionLogSha256"] == sha(LOGF), "3 manifest provenance / counters / log SHA")
    log_lines = [json.loads(l) for l in LOGF.read_text(encoding="utf-8").splitlines() if l.strip()]
    check(all("timestamp" in l and ("url" in l or "dataset" in l) for l in log_lines) and len(log_lines) >= 5, "3 acquisition log entries")
    alltext = MANIFEST.read_text(encoding="utf-8") + LOGF.read_text(encoding="utf-8") + GATESF.read_text(encoding="utf-8")
    for pat in SECRET:
        check(not re.search(pat, alltext, re.I), f"3 no credential string in outputs: {pat}")
    # DATA-01
    d1 = m["datasets"]["DATA-01"]; check(d1["downloaded"] is False and d1["status"] == "DATASET_BLOCKED" and d1["credentialFilesPresent"]["copernicusmarine_credentials_file"] is False and d1["toolboxInstalled"] is False and g["datasets"]["DATA-01"]["status"] == "DATASET_BLOCKED" and st["DATA-01"]["status"] == "DATASET_BLOCKED", "4 DATA-01 blocked with credential-absence evidence, no download")
    # files re-hashed
    n_files = 0
    for did, prod in m["datasets"]["DATA-03"]["products"].items():
        for f in prod.get("files", []):
            if f.get("status") in ("ok", "reused"):
                path = ROOT / f["file"]; check(path.exists() and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"] and "griddap" in f["query"] and "?" in f["query"], f"4 DATA-03 {did} {f['windowId']} file/SHA/query"); n_files += 1
    for f in m["datasets"]["DATA-06"]["files"]:
        if f["status"] in ("ok", "reused"):
            path = ROOT / f["file"]; check(path.exists() and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"] and f["url"].startswith("ftp://ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL/") and "_uss.nc" in f["filename"], f"4 DATA-06 {f['filename']} file/SHA/url"); n_files += 1
    check(n_files >= 1, "4 at least one file acquired")
    # independent coverage re-derivation from raw NetCDF: DATA-06 KE-1 and AG-1 (single-month windows) and DATA-03 geostrophic KE-1
    sys.path.insert(0, str(ROOT / "services/research-runtime/.deps")); import netCDF4, numpy as np  # noqa: E402
    wins = {w["windowId"]: w for w in p["windows"]}

    def epoch(s):
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()

    def rederive(path, varnames, w):
        with netCDF4.Dataset(path) as ds:
            lon = np.array(ds.variables["longitude" if "longitude" in ds.variables else "lon"][:], float); lat = np.array(ds.variables["latitude" if "latitude" in ds.variables else "lat"][:], float)
            t = ds.variables["time"]; times = [datetime(v.year, v.month, v.day, v.hour, v.minute, v.second, tzinfo=timezone.utc).timestamp() for v in netCDF4.num2date(t[:], t.units, calendar=getattr(t, "calendar", "standard"))]
            box = w["oceanBox"]; conv = (lambda x: x % 360) if lon.max() > 180 else (lambda x: x)
            g6 = lon.min() <= conv(box["west"]) <= lon.max() and lon.min() <= conv(box["east"]) <= lon.max() and lat.min() <= box["south"] and box["north"] <= lat.max()
            g7 = any(x <= epoch(w["t0"]) for x in times) and any(x >= epoch(w["end"]) for x in times)
            ti = max(i for i, x in enumerate(times) if x <= epoch(w["t0"])) if g7 else None
            ok_rel = True
            if g7:
                for d in w["releasePositions"]:
                    arr = ds.variables[varnames[0]][ti]
                    while arr.ndim > 2:
                        arr = arr[0]
                    j = int(np.argmin(np.abs(lat - d["lat"]))); i = int(np.argmin(np.abs(lon - conv(d["lon"]))))
                    v = arr[j, i] if arr.shape[0] == len(lat) else arr[i, j]
                    ok_rel &= not (np.ma.is_masked(v) or not np.isfinite(float(np.ma.filled(v, np.nan))))
            return bool(g6), bool(g7), bool(ok_rel), all(v in ds.variables for v in varnames)
    d6 = g["datasets"]["DATA-06"]
    for wid in ("KE-1", "AG-1", "KE-H3"):
        w = wins[wid]; month = w["t0"][:7].replace("-", ""); f = next((x for x in m["datasets"]["DATA-06"]["files"] if x["filename"].split("_")[1] == month and x["status"] in ("ok", "reused")), None)
        if f:
            g6, g7, rel, vars_ok = rederive(ROOT / f["file"], ["uuss", "vuss"], w); ws = next(x for x in d6["windowStatus"] if x["windowId"] == wid)
            check(vars_ok and g6 and g7 and (ws["covered"] == (g6 and g7 and rel)), f"5 DATA-06 {wid} coverage re-derived (G5/G6/G7/nearest-node release) consistent with gates")
    geo = g["datasets"]["DATA-03"]["products"].get("erdTAgeo1day", {})
    fgeo = next((x for x in m["datasets"]["DATA-03"]["products"]["erdTAgeo1day"]["files"] if x["windowId"] == "KE-1" and x.get("status") in ("ok", "reused")), None)
    if fgeo:
        g6, g7, rel, vars_ok = rederive(ROOT / fgeo["file"], ["u_current", "v_current"], wins["KE-1"]); ws = next(x for x in geo["windowStatus"] if x["windowId"] == "KE-1")
        check(vars_ok and (ws["covered"] == (g6 and g7 and rel)), "5 DATA-03 geostrophic KE-1 coverage re-derived consistent with gates")
    # gate arithmetic and statuses
    allowed = {"ACCEPTED_FOR_FUTURE_TEST", "DATASET_BLOCKED", "PARTIAL_COVERAGE", "LICENSE_STATUS_UNKNOWN", "INSUFFICIENT_EVIDENCE"}
    for did, prod in g["datasets"]["DATA-03"]["products"].items():
        check(prod["status"] in allowed, f"6 DATA-03 {did} status allowed")
        if "gates" in prod:
            core_fail = any(prod["gates"][x] == "FAIL" for x in ("G2", "G3", "G4", "G5", "G8", "G9")); n_cov = len(prod["windowsCovered"])
            exp = "DATASET_BLOCKED" if core_fail or n_cov == 0 else ("ACCEPTED_FOR_FUTURE_TEST" if n_cov == 7 else "PARTIAL_COVERAGE")
            check(prod["status"] == exp, f"6 DATA-03 {did} status arithmetic ({exp})")
            check(all(w not in prod["windowsCovered"] for w in ("AG-1", "AG-2")), f"6 DATA-03 {did} 2015 windows not claimed covered (product ends 2012)")
    core_fail6 = any(d6["gates"][x] == "FAIL" for x in ("G2", "G3", "G4", "G5", "G8", "G9")); n6 = len(d6["windowsCovered"])
    exp6 = "DATASET_BLOCKED" if core_fail6 or n6 == 0 else ("LICENSE_STATUS_UNKNOWN" if d6["licenseStatus"].startswith("LICENSE_STATUS_UNKNOWN") else ("ACCEPTED_FOR_FUTURE_TEST" if n6 == 7 else "PARTIAL_COVERAGE"))
    check(d6["status"] == exp6 and d6["status"] in allowed, f"6 DATA-06 status arithmetic ({exp6})")
    check(g["substitutionPerformed"] is False and g["interpolationPerformed"] is False and g["modelRuns"] == 0 and st["modelRuns"] == 0 and st["alphaChanged"] is False and st["bestDatasetSelected"] is False and st["step20_21_22Revised"] is False and "coverage recorded only" in st["KE-H2"], "6 no substitution / no model / no best-dataset / KE-H2 coverage-only")
    rows = MATRIX.read_text(encoding="utf-8").splitlines()
    check(rows[0] == "dataset,product,windowId,spatial,temporal,missingFractionBox,releaseStencil,status" and sum(1 for r in rows[1:] if r.startswith("DATA-06,")) == 7 and sum(1 for r in rows[1:] if r.startswith("DATA-01,")) == 7, "7 coverage matrix rows")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/quality_step23.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        check(proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(ROOT / "docs/research" / n) for n in ("step23-data-quality-gates.json", "step23-data-coverage-matrix.csv", "step23-data-requirement-status.json")), "8 reproducibility (G11): quality outputs byte-identical on independent re-run")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "filesVerified": n_files, "DATA-01": g["datasets"]["DATA-01"]["status"], "DATA-03": {k: v["status"] for k, v in g["datasets"]["DATA-03"]["products"].items()}, "DATA-06": d6["status"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

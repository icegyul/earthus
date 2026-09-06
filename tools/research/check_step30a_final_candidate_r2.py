"""Independent validator for STEP 30A Phase B, revision r2 (final candidate vs frozen HYCOM baseline; evaluation only).
r2 changes versus the locked r1 (kept unchanged on disk): (a) median comparisons use tolerance 0.001 km because the validator recomputes
medians from the 3-decimal table while the evaluator uses full precision (even-n medians can differ by 0.001); (b) the overclaim scan of
the summary statements excludes the preregistered required statements (the locked statement "not ground truth" matched the scan).
Both defects are validator-side; the evaluation outputs are unchanged. r2 is bound to step30a-validator-r2-preregistration.json. `--phase A` (Phase B lock:
no outputs may exist) or `--phase B` (full). exit 0 = PASS. Checks: 1 ancestry (26 commits incl. 94d414b6) · 2 immutability (STEP 17-30A
locks, runtime byte-identical to 155995dd) · 3 baseline trajectory SHA · 4 candidate trajectory SHA · 5 exact pairing (both positions and
the observation at the exact timestamp, recomputed from the files) · 6 exact timestamps (t0 + 24/48/72 h) · 7 M3 recomputed for every drifter
x source x horizon · 8 M1/M2/M4/M5 recomputed · 9 W/L/T recounted · 10 72 h decision rule recomputed · 11 calibration/holdout separation ·
12 KE-H2 exclusion · 13 three-way context equal to the frozen STEP 25C / STEP 29 tables and STEP 29 context equal to the frozen evaluation ·
14 no new trajectory files (STEP 29 inventory = 24 manifest files; no data/research/step30a) · 15 MODEL_RUN_COUNT 0 and evaluator has no
runtime import · 16 alpha 0.002 in every trajectory row · 17 Stokes coefficient 1.0 (STEP 29 manifest treatment runs) · 18 depths unchanged
(15.81007 / 15.0) · 19 no outlier manipulation (n + NA = n_drifters; per-window sum = overall) · 20 reproducibility (evaluator re-run
byte-identical; manifest identical except createdAtUTC). Plus language scan and required statements. Deterministic output."""
import csv
import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
RULE, PA, PB = D / "step30a-rule.json", D / "step30a-preregistration.json", D / "step30a-phase-b-preregistration.json"
TABLE, WTABLE, SUMMARY, EVAL, MANIFEST = D / "step30a-final-candidate-table.csv", D / "step30a-final-candidate-window-summary.csv", D / "step30a-final-candidate-summary.json", D / "step30a-final-candidate-evaluation.json", D / "step30a-final-candidate-manifest.json"
EVALUATOR = ROOT / "tools/research/evaluate_step30a_final_candidate.py"
R2 = D / "step30a-validator-r2-preregistration.json"
R1 = ROOT / "tools/research/check_step30a_final_candidate.py"
LOCK = {"docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653",
        "docs/research/step25c-test02-protocol.json": "7ff8468ea8399b8bf9d563980a184203b1b69c55a52cf7a493d1c140c97901ab", "docs/research/step25c-run-manifest.json": "75d6a52b212b40e9e331bd06f362e888e1592873e150f942f8b0320add307e2d",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-summary.json": "42965f31980b47ca9f5dedecc9976a969a6e00d22e9bf227464fbbeea460e78d",
        "docs/research/step25c-evaluation.json": "974073b81757f47f2f205ffdd49b46dda37733f1163b5169709d6b373d5894f5",
        "docs/research/step26-phase-b-summary.json": "bc242bb58cf98630c529e6c5f8dfaf1e05bce5b218ced248ced29aab22a3fce6", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step28-field-summary.json": "a81350b33403e1da48384a2217e156ed9bbdaa3e1da685c17bbe08df5aab4175", "docs/research/step29-stokes-license-status.json": "8a8640ac534c1fb9b8551a4a1e777f8a96d6f6c271d896246ed13b8cf93cb24b",
        "docs/research/step29-phase-b-preregistration.json": "82101494c9035557613905d7c26815aabf384f231a827a07452f7c3ab3917745", "docs/research/step29-stokes-manifest.json": "8906b46090db07a9254382b6fa953f871833d611ad6958eac44e9f5c7459e936",
        "docs/research/step29-stokes-paired-table.csv": "972ec47f28c637a8116e2f107f71c2e0a64cc10e2421a96181c2242f1ac9c568", "docs/research/step29-stokes-summary.json": "921783b2db14cb069f4578cb4a7aff29edf0672866c61eb495b7883a20a61e1f",
        "docs/research/step29-stokes-evaluation.json": "acb1a5389e64e6e2f31207f7c32af4ed8f02c4a681ec3c349f96163ba9e2813b", "docs/research/step29-stokes-forcing-manifest.json": "a38e1672472592bd1e90c6c671514178e501b613033dad17f9cd970d3dad7d44",
        "docs/research/step29-stokes-replay-manifest.json": "71cc1da4137671efb683fa76d11080ee8bf5b91874da86bb5581cd9929828875", "tools/research/check_step29_stokes_execution.py": "d38203064cf8a9033120c940ceac891aa7f9b0ac600b556434006f110ee2d1a6",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
        "docs/research/step30a-final-candidate-protocol.md": "8ae362c325c324efeac40854fa67a0168d60c2b28f45f667678e5a4da1c464fb", "docs/research/step30a-rule.json": "9251be51fc3fc8cc3a3b9570a0b3902c01e653754389da55852bdd4e83ab803d",
        "docs/research/step30a-preregistration.json": "2abab8c30d4a45c6d2925155e5114663c1de1af73ad6ca24268e9f7179a9db8c", "docs/research/step30a-summary.json": "ce3ca53efd89f89483c67ad5ee42bb1f01c0eda56b6b7d86449dd29b46b2e97b",
        "tools/research/check_step30a_preregistration.py": "4ad23777535fc67665f9a500eff520ed662f9797aafb2c145b0669c083c5e01b"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "3338c7e4", "79a0d69d", "4942421a", "289815d6", "f0149153", "94d414b6")
WINDOWS = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
CAL, HOLD = ["KE-1", "KE-2", "AG-1", "AG-2"], ["KE-H1", "KE-H3"]
COUNTS = {"KE-1": 8, "KE-2": 5, "AG-1": 9, "AG-2": 1, "KE-H1": 5, "KE-H3": 7}
RADIUS_M = 6371008.8; NA = "NOT_AVAILABLE"; H = (24, 48, 72); TOL = 1e-6
LANG = re.compile(r"\boptimal\b|\bsuperior\b|\bproves?\b|\bproven\b|\bvalidated\b|production[- ]ready|\bcauses?\b|ground truth|statistically significant|generali[sz]", re.I)
RUNTIME = re.compile(r"research_runtime|models_v2|run_experiment|build_spec|rk4|netCDF4|copernicusmarine|glorys_reader|build_step29_forcing|run_step29", re.I)
OUTPUT_LABELS = {"CANDIDATE_DESCRIPTIVELY_FAVORED", "HYCOM_DESCRIPTIVELY_FAVORED", "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def positions(path):
    out, alphas = {}, set()
    with open(path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            alphas.add(row["alpha"])
            if row["valid"] == "true":
                out.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return out, alphas


def median(v):
    v = sorted(v)
    if not v:
        return None
    m = len(v) // 2
    return round(v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2, 3)


def close(a, b, eps=0.0015):
    if a == NA or b == NA or a is None or b is None:
        return a == b or (a in (NA, None) and b in (NA, None))
    return abs(float(a) - float(b)) <= eps


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in COMMITS:
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 immutability: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    rule, pa, pb = load(RULE), load(PA), load(PB)
    check(pb["status"] == "PREREGISTRATION LOCKED" and pb["phase"] == "B" and pb["phaseALock"] == "94d414b6" and pb["ruleSha256"] == sha(RULE) and pb["phaseAPreregistrationSha256"] == sha(PA) and pa["ruleSha256"] == sha(RULE) and pb["ruleId"] == rule["ruleId"] == "final-candidate-benchmark-step30a", "Phase B preregistration bound to Phase A lock")
    for t in ("tools/research/evaluate_step30a_final_candidate.py", "tools/research/check_step30a_final_candidate.py"):
        check(pb["tools"].get(t) == sha(ROOT / t), f"tool locked before evaluation: {t}")
    r2 = load(R2)
    check(r2["status"] == "VALIDATOR REVISION LOCKED" and r2["r1"]["sha256"] == pb["tools"]["tools/research/check_step30a_final_candidate.py"] == sha(R1) and r2["r2"]["sha256"] == sha(Path(__file__)) and r2["phaseBLock"] == "d30607c8" and r2["evaluatorSha256"] == pb["tools"]["tools/research/evaluate_step30a_final_candidate.py"], "validator r2 bound to disclosure record; r1 unchanged")
    check(pb["modelRunCount"] == 0 and pb["newData"] == 0 and pb["alpha"] == 0.002 and pb["stokesCoefficient"] == 1.0 and pb["candidateDepthMeters"] == 15.81007 and pb["baselineDepthMeters"] == 15.0 and pb["observationSha256"] == rule["observationSha256"], "Phase B preregistration constants")
    for rel, expected in pb["frozenInputs"].items():
        check(sha(ROOT / rel) == expected, f"2 frozen input unchanged: {rel}")
    check(not RUNTIME.search(EVALUATOR.read_text(encoding="utf-8")), "15 evaluator imports no runtime / reader / builder")
    wins = {w["windowId"]: w for w in rule["windows"]}
    check([w["windowId"] for w in rule["windows"]] == WINDOWS and all(w["drifterCount"] == COUNTS[w["windowId"]] == len(w["drifterIds"]) for w in rule["windows"]), "windows and drifter counts per rule")
    m29 = load(D / "step29-stokes-manifest.json"); t29runs = {r["windowId"]: r for r in m29["runs"] if r["condition"] == "treatment" and r["alpha"] == 0.002}
    p25 = load(D / "step25c-test02-protocol.json"); p25w = {w["windowId"]: w for w in p25["windows"]}
    for wid, w in wins.items():
        check(w["candidate"]["file"] == t29runs[wid]["trajectoriesFile"] and w["candidate"]["sha256"] == t29runs[wid]["trajectoriesSha256"], f"4 candidate identity = STEP 29 treatment alpha 0.002: {wid}")
        check(w["baseline"]["file"] == p25w[wid]["hycomBaseline"]["0.002"]["file"] and w["baseline"]["sha256"] == p25w[wid]["hycomBaseline"]["0.002"]["sha256"], f"3 baseline identity = STEP 25C hycomBaseline 0.002: {wid}")
        check(t29runs[wid]["stokesCoefficient"] == 1.0 and t29runs[wid]["alpha"] == 0.002, f"17 Stokes coefficient 1.0 / alpha 0.002 in STEP 29 manifest: {wid}")
    check(m29["stokesCoefficient"] == 1.0 and m29["modelRunCount"] == 24 and len(m29["runs"]) == 24, "17 STEP 29 manifest coefficient 1.0, 24 frozen runs")
    check(rule["candidate"]["depthMeters"] == 15.81007 == p25["modelB"]["depthMeters"] and rule["baseline"]["depthMeters"] == 15.0 and "15.81" in (D / "step29-stokes-forcing-manifest.json").read_text(encoding="utf-8"), "18 depths unchanged (15.81007 candidate / 15.0 baseline)")
    if phase == "A":
        check(not any(x.exists() for x in (TABLE, WTABLE, SUMMARY, EVAL, MANIFEST)) and not (ROOT / "data/research/step30a").exists(), "Phase B lock: no outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A"}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    ev, S, M = load(EVAL), load(SUMMARY), load(MANIFEST)
    check(ev["ruleSha256"] == sha(RULE) == M["ruleSha256"] and ev["phaseBPreregistrationSha256"] == sha(PB) == M["phaseBPreregistrationSha256"] and ev["tableSha256"] == sha(TABLE) and ev["summarySha256"] == sha(SUMMARY) and M["evaluator"]["sha256"] == sha(EVALUATOR) == pb["tools"]["tools/research/evaluate_step30a_final_candidate.py"] and all(sha(ROOT / o["file"]) == o["sha256"] for o in M["outputs"].values()) and ev["observationSha256"] == rule["observationSha256"], "output chain cross references / observation SHA")
    check(M["modelRunCount"] == 0 == S["modelRunCount"] == ev["modelRunCount"] and M["trajectoriesGenerated"] == 0 and M["forcingBuilt"] == 0 and M["newData"] == 0 == S["newData"] and M["evaluationOnly"] is True, "15 MODEL_RUN_COUNT = 0 / NEW_DATA = 0")
    check(not (ROOT / "data/research/step30a").exists(), "14 no data/research/step30a")
    inventory = sorted(str(p.relative_to(ROOT)).replace("\\", "/") for p in (ROOT / "data/research/step29/trajectories").rglob("*.csv"))
    expected_inv = {r["trajectoriesFile"]: r["trajectoriesSha256"] for r in m29["runs"]}
    check(inventory == sorted(expected_inv) and all(sha(ROOT / f) == s for f, s in expected_inv.items()), f"14 STEP 29 trajectory inventory = 24 manifest files, SHAs unchanged ({len(inventory)} files)")
    pts = {}; alpha_all = set()
    for wid, w in wins.items():
        for side in ("candidate", "baseline"):
            actual = sha(ROOT / w[side]["file"]); check(actual == w[side]["sha256"], f"{'4' if side == 'candidate' else '3'} trajectory SHA on disk: {wid} {side}")
            rec = [x for x in ev["inputTrajectories"] if x["window"] == wid and x["side"] == side]; check(len(rec) == 1 and rec[0]["actual"] == actual and rec[0]["verified"] is True and rec[0]["expected"] == w[side]["sha256"], f"3/4 evaluation records trajectory SHA: {wid} {side}")
            pts[(wid, side)], alphas = positions(ROOT / w[side]["file"]); alpha_all |= alphas
    check(alpha_all == {"0.002"} and S["alpha"] == 0.002 and rule["candidate"]["alpha"] == 0.002 == rule["baseline"]["alpha"], "16 alpha = 0.002 in every trajectory row")
    check(S["stokesCoefficient"] == 1.0 and S["candidateDepthMeters"] == 15.81007 and S["baselineDepthMeters"] == 15.0, "17/18 summary coefficient and depths")
    with open(TABLE, encoding="utf-8", newline="") as fh:
        table = list(csv.DictReader(fh))
    with open(D / "step25c-paired-table.csv", encoding="utf-8", newline="") as fh:
        t25 = {(r["unit"], r["drifter_id"]): r for r in csv.DictReader(fh)}
    with open(D / "step29-stokes-paired-table.csv", encoding="utf-8", newline="") as fh:
        t29 = {(r["unit"], r["drifter_id"]): r for r in csv.DictReader(fh)}
    rows = {(r["unit"], r["drifter_id"]): r for r in table}
    check(len(table) == 35 and len(rows) == 35 and set(r["unit"] for r in table) == set(WINDOWS) and "KE-H2" not in set(r["unit"] for r in table) and all(sum(1 for r in table if r["unit"] == w) == COUNTS[w] for w in WINDOWS), "5/12 pairing table 35 rows; six windows; KE-H2 absent")
    check(S["excluded"]["KE-H2"]["paired"] is False and "HYCOM" in S["excluded"]["KE-H2"]["reason"] and S["excluded"]["AG-holdout"] == "UNAVAILABLE", "12 KE-H2 exclusion recorded with reason; AG holdout unavailable")
    check(all(r["role"] == ("CALIBRATION" if r["unit"] in CAL else "HOLDOUT") for r in table), "11 role per window")
    compared = mism = 0; deltas = {h: [] for h in H}; strata_rows = {"overall": [], "calibration": [], "holdout": []}
    for wid, w in wins.items():
        t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        ts = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in H}
        check(ts[24].endswith("12:00:00Z") and ts[72] == w["end"], f"6 exact timestamps t0+24/48/72 h: {wid}")
        obs = {}
        for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{w['region']}-{w['t0'][:4]}-q*.csv")):
            rel = str(path.relative_to(ROOT)).replace("\\", "/"); check(ev["observationFiles"].get(rel) == sha(path), f"observation file SHA recorded: {rel}")
            with open(path, encoding="utf-8", newline="") as fh:
                reader = csv.reader(fh); next(reader); next(reader)
                for r in reader:
                    if r[0] in w["drifterIds"]:
                        t = datetime.strptime(r[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if t0 <= t <= t1:
                            obs.setdefault(r[0], {})[r[1]] = (float(r[3]), float(r[2]))
        release = {d["drifterId"]: (d["lon"], d["lat"]) for d in w["releasePositions"]}
        for did in w["drifterIds"]:
            row = rows.get((wid, did)); check(row is not None, f"5 drifter present: {wid}/{did}")
            if row is None:
                continue
            strata_rows["overall"].append(row); strata_rows["calibration" if wid in CAL else "holdout"].append(row)
            pc_all, ph_all = pts[(wid, "candidate")].get(did, {}), pts[(wid, "baseline")].get(did, {})
            for h in H:
                pc, ph, ob = pc_all.get(ts[h]), ph_all.get(ts[h]), obs.get(did, {}).get(ts[h])
                ec = hav(*pc, *ob) if pc and ob else NA; eh = hav(*ph, *ob) if ph and ob else NA
                for mine, col in ((ec, f"error_CAND_{h}h"), (eh, f"error_HYCOM_{h}h")):
                    compared += 1
                    if not close(mine, row[col], 0.001):
                        mism += 1
                d = row[f"delta_{h}h"]
                check((ec == NA or eh == NA) == (d == NA) and (d == NA or abs(float(ec) - float(eh) - float(d)) <= 0.0015), f"5/7 delta = E_cand - E_HYCOM exact pairing: {wid}/{did}/{h}h")
                if d != NA:
                    deltas[h].append(float(d))
                sep = hav(*pc, *ph) if pc and ph else NA; check(close(sep, row[f"sep_CAND_HYCOM_{h}h"], 0.001), f"8 M4 separation: {wid}/{did}/{h}h")
                check(close(t25.get((wid, did), {}).get(f"error_H002_{h}h", NA), row[f"threeway_A_HYCOM_{h}h"], 0.0005) and close(t25.get((wid, did), {}).get(f"error_G002_{h}h", NA), row[f"threeway_B_GLORYS_{h}h"], 0.0005) and close(t29.get((wid, did), {}).get(f"error_T002_{h}h", NA), row[f"threeway_C_STOKES_{h}h"], 0.0005), f"13 three-way values = frozen tables: {wid}/{did}/{h}h")
                check(close(row[f"threeway_A_HYCOM_{h}h"], row[f"error_HYCOM_{h}h"], 0.0015) and close(row[f"threeway_C_STOKES_{h}h"], row[f"error_CAND_{h}h"], 0.0015), f"7/13 recomputed errors agree with frozen STEP 25C H002 / STEP 29 T002: {wid}/{did}/{h}h")
            for side, tag, pp in (("candidate", "CAND", pc_all), ("baseline", "HYCOM", ph_all)):
                order = sorted(pp)
                check(close(hav(*release[did], *pp[ts[72]]) if ts[72] in pp else NA, row[f"endpoint_{tag}_72h"], 0.001), f"8 M1 endpoint: {wid}/{did}/{tag}")
                check(close(sum(hav(*pp[a], *pp[b]) for a, b in zip(order, order[1:])) if len(order) > 1 else NA, row[f"path_{tag}"], 0.002), f"8 M2 path: {wid}/{did}/{tag}")
            o = obs.get(did, {}); check(close(hav(*release[did], *o[ts[72]]) if ts[72] in o and w["t0"] in o else NA, row["observed_72h"], 0.001), f"8 M5 observed: {wid}/{did}")
    check(mism == 0 and compared == 35 * 3 * 2, f"7 independent M3 recomputation ({mism} mismatches of {compared})")
    check(ev["crossCheck"]["allAgree"] is True and ev["crossCheck"]["compared"] == 35 * 3 * 2 and ev["crossCheck"]["disagreements"] == 0, "13 evaluation cross-check all agree")
    def wlt(ds):
        return sum(1 for x in ds if x < -TOL), sum(1 for x in ds if x > TOL), sum(1 for x in ds if abs(x) <= TOL)
    for name, rs in strata_rows.items():
        b = S["strata"][name]; check(b["n_drifters"] == len(rs) == {"overall": 35, "calibration": 23, "holdout": 12}[name], f"11 stratum size: {name}")
        for h in H:
            ds = [float(r[f"delta_{h}h"]) for r in rs if r[f"delta_{h}h"] != NA]; o = b[f"{h}h"]; w_, l_, t_ = wlt(ds)
            check(o["n"] == len(ds) and o["n"] + o["notAvailable"] == b["n_drifters"] and (o["wins_candidate"], o["losses_candidate"], o["ties"]) == (w_, l_, t_) and w_ + l_ + t_ == o["n"], f"9/19 W/L/T recount and n + NA = n_drifters: {name} {h}h")
            check(close(o["delta"]["median"], median(ds), 0.001) and close(o["error_candidate"]["median"], median([float(r[f"error_CAND_{h}h"]) for r in rs if r[f"delta_{h}h"] != NA]), 0.001) and close(o["error_HYCOM"]["median"], median([float(r[f"error_HYCOM_{h}h"]) for r in rs if r[f"delta_{h}h"] != NA]), 0.001), f"7 medians recomputed (tolerance 0.001 km, rounded table): {name} {h}h")
            tw = o["threeWayFrozen"]; full = [r for r in rs if NA not in (r[f"threeway_A_HYCOM_{h}h"], r[f"threeway_B_GLORYS_{h}h"], r[f"threeway_C_STOKES_{h}h"])]
            check(tw["n_allThree"] == len(full) and tw["median_C_minus_A_step30a"] == median([float(r[f"threeway_C_STOKES_{h}h"]) - float(r[f"threeway_A_HYCOM_{h}h"]) for r in full]) and tw["median_C_minus_B_step29"] == median([float(r[f"threeway_C_STOKES_{h}h"]) - float(r[f"threeway_B_GLORYS_{h}h"]) for r in full]) and tw["median_B_minus_A_step25c"] == median([float(r[f"threeway_B_GLORYS_{h}h"]) - float(r[f"threeway_A_HYCOM_{h}h"]) for r in full]), f"13 three-way medians recomputed: {name} {h}h")
            if o["signTest"].get("reported"):
                n, k = o["signTest"]["n"], o["signTest"]["k"]; check(n >= 10 and o["signTest"]["p_nominal"] == round(min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 6), f"sign test nominal only: {name} {h}h")
        check(all(k in b for k in ("M1_endpoint72h", "M2_totalPath", "M4_separation72h", "M5_observed72h")), f"8 M1/M2/M4/M5 present: {name}")
    check(set(S["perWindow"]) == set(WINDOWS) and all(S["perWindow"][w]["n_drifters"] == COUNTS[w] for w in WINDOWS) and all(sum(S["perWindow"][w][f"{h}h"]["n"] for w in WINDOWS) == S["strata"]["overall"][f"{h}h"]["n"] for h in H), "11/19 per-window blocks (AG-2 kept); per-window n sums to overall")
    def exp_label(o):
        med, w_, l_ = o["delta"]["median"], o["wins_candidate"], o["losses_candidate"]
        if med is None or w_ + l_ == 0:
            return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
        if med < -TOL and w_ / (w_ + l_) >= 2 / 3:
            return "CANDIDATE_DESCRIPTIVELY_FAVORED"
        if med > TOL and l_ / (w_ + l_) >= 2 / 3:
            return "HYCOM_DESCRIPTIVELY_FAVORED"
        return "NO_CLEAR_DESCRIPTIVE_DIFFERENCE"
    for name in strata_rows:
        check(S["descriptiveLabel"]["byStratum"][name] == exp_label(S["strata"][name]["72h"]), f"10 label per locked rule: {name}")
    ov = S["strata"]["overall"]["72h"]; w_, l_, t_ = wlt(deltas[72])
    check(S["descriptiveLabel"]["primary"] == S["descriptiveLabel"]["byStratum"]["overall"] == exp_label({"delta": {"median": median(deltas[72])}, "wins_candidate": w_, "losses_candidate": l_}) in OUTPUT_LABELS and close(S["primary72h"]["delta_median"], median(deltas[72]), 0.001) and S["primary72h"]["delta_median"] == ov["delta"]["median"] and (S["primary72h"]["wins_candidate"], S["primary72h"]["losses_candidate"], S["primary72h"]["ties"]) == (w_, l_, t_) and M["descriptiveLabel"] == S["descriptiveLabel"]["primary"], "10 primary 72 h decision recomputed from table")
    check(S["labelRules"] == rule["interpretationRule"] and S["tieToleranceKm"] == 1e-6, "10 rule unchanged")
    s29 = load(D / "step29-stokes-evaluation.json")["summary"]; c29 = S["step29Context"]["72h"]
    check(c29["overall"] == {"median_delta": -3.496, "wins_stokes": 19, "losses_stokes": 14, "ties": 0} and c29["holdout"] == {"median_delta": -3.832, "wins_stokes": 8, "losses_stokes": 4, "ties": 0} and all(c29[k]["median_delta"] == s29["strata"][k]["72h"]["primary_alpha0.002"]["delta"]["median_delta"] for k in c29) and S["step29Context"]["descriptiveLabel"] == s29["descriptiveLabel"], "13 STEP 29 context equals frozen evaluation")
    for h in H:
        top = S["topCandidateErrors"][f"{h}h"]; ordered = sorted((r for r in table if r[f"error_CAND_{h}h"] != NA), key=lambda r: -float(r[f"error_CAND_{h}h"]))[:3]
        check([(x["unit"], x["drifter_id"], x["error_candidate"]) for x in top] == [(r["unit"], r["drifter_id"], float(r[f"error_CAND_{h}h"])) for r in ordered], f"16 top-3 candidate errors: {h}h")
    check(S["outlierPolicyApplied"] == {"removed": 0, "trimmed": 0, "winsorized": 0, "weighted": 0, "deleted": 0, "postHocExclusions": 0} and S["alphaSelection"] == "NONE" and S["coefficientSelection"] == "NONE" and S["depthSelection"] == "NONE" and S["forcingSelection"] == "NONE" and S["holdoutUsedForSelection"] is False and S["reranking"] is False and S["physicalExplanationClaimed"] is False and S["statisticalSignificanceClaimed"] is False and S["interpretation"] == "DESCRIPTIVE ONLY", "19 no outlier manipulation / no selection / descriptive only")
    with open(WTABLE, encoding="utf-8", newline="") as fh:
        wt = list(csv.DictReader(fh))
    check(len(wt) == 27 and all(any(r["stratum"] == name and int(r["horizon_h"]) == h and int(r["wins_candidate"]) == S["strata" if name in S["strata"] else "perWindow"][name][f"{h}h"]["wins_candidate"] and r["delta_median"] == str(S["strata" if name in S["strata"] else "perWindow"][name][f"{h}h"]["delta"]["median"] if S["strata" if name in S["strata"] else "perWindow"][name][f"{h}h"]["delta"]["median"] is not None else NA) for r in wt) for name in list(S["strata"]) + WINDOWS for h in H), "window summary CSV consistent with summary JSON")
    for st in pb["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    check(not LANG.search(json.dumps({k: v for k, v in S.items() if k not in ("strata", "perWindow", "statements", "step29Context", "question")}, ensure_ascii=False)) and not LANG.search(" ".join(st for st in S["statements"] if st not in pb["requiredStatements"])), "no overclaim language (preregistered required statements excluded)")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(EVALUATOR), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        same = proc.returncode == 0 and all(sha(Path(tmp) / n.name) == sha(n) for n in (TABLE, WTABLE, SUMMARY, EVAL))
        m2 = load(Path(tmp) / MANIFEST.name) if proc.returncode == 0 else {}
        check(same and {k: v for k, v in m2.items() if k != "createdAtUTC"} == {k: v for k, v in M.items() if k != "createdAtUTC"}, "20 reproducibility: evaluator re-run byte-identical (manifest except createdAtUTC)")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "validator": "r2", "label": S["descriptiveLabel"]["primary"], "primary72h": S["primary72h"], "modelRunCount": M["modelRunCount"], "m3Compared": compared}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

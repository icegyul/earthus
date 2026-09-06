"""Independent validator for STEP 21 (model adequacy diagnosis). `--phase A` (preregistration only: outputs must be absent) or
`--phase B` (diagnostic outputs present). exit 0 = PASS, exit 1 = FAIL.
Checks: ancestry commits and locked SHAs (STEP 17–20 incl. B-3/B-4/B-5/B-6 records, runtime files), alpha artifact unchanged,
protocol/preregistration/rule-file cross references (incl. this validator's own SHA), no new alpha (only 0 and 0.002 used), no holdout
leakage (holdout ids disjoint from calibration; no selection fields), KE-H2 excluded and recorded, no observation/drifter removal
(23 + 12 rows), Haversine radius, 24/48/72 h, unit counts, independent recomputation of position errors, displacements, bearings,
east/north offsets and growth classes for every row, STEP 20 consistency, directional/growth summaries re-derived, figure SHAs,
reproducibility (independent re-run to a temp dir, byte-identical table/summary/figures)."""
import csv
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step21-model-adequacy-protocol.json"
PREREG = ROOT / "docs/research/step21-model-adequacy-preregistration.json"
RULE = ROOT / "docs/research/step21-model-adequacy-rule-sha256.txt"
TABLE = ROOT / "docs/research/step21-diagnostic-table.csv"
SUMMARY = ROOT / "docs/research/step21-diagnostic-summary.json"
RUN = ROOT / "docs/research/step21-diagnostic-run.json"
FIGDIR = ROOT / "docs/research/step21-diagnostic-figures"
LOCK = {"docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792", "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb",
        "docs/research/step18b-model-protocol.md": "73e8aa1405aa82c6ae283962f8efaabdfa5331a5dc6109471b1e6bd0ebf813bc", "docs/research/step18b-model-manifest.json": "923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe",
        "docs/research/step19-evaluation-protocol.md": "920475967d4dd1a0b10a9f96f10c83291f92df767e906c50b0973e82b9af52b3", "docs/research/step19-evaluation.json": "9baa0c6ae4fd38fbd0ea72e479736d0eb8f43f49aac6cebc8dcfa0051490b5f4",
        "docs/research/step20-generalization-protocol.md": "65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00", "docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4",
        "docs/research/step20-selection-rule-sha256.txt": "5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-calibration-table.csv": "a15df2a059ba11e5e3900f10b29ad3cfed1dca610c8ad421898374cd31a8425f",
        "docs/research/step20-b3-forcing-resolution-protocol.md": "b7a2ad2309553c05f261598773df7ca5295a8dcd92ef76fd3467e4d1787ef466", "docs/research/step20-b4-segmentation-gate.json": "9e3d3dd9e98287a3a0d06a8a8fe190d5189f595cf6b81055d6e41d30e2aaed02",
        "docs/research/step20-b5-numerical-equivalence-protocol.md": "a61140347320519b623eeb382d18470a0759d4e51597c4d2896730889a737f42", "docs/research/step20-b6-segmentation-gate.json": "b5cca409e6f62a8afc26c39c43ad6b49791f4689c0c9825c7cd35a7dd75ccafa",
        "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-evaluation.json": "c03be570b5b2cc229f9b0454b6899f43ae4390f77309ce165650035df3673cea",
        "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step20-b6-holdout-table.csv": "d21d029bba4e09a15ef19a393f0d8389df0e5750cb1459ed0b1e92372aeea681",
        "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "7b3d2a0e", "ed746129")
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
H = (24, 48, 72)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def hav(lon1, lat1, lon2, lat2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIUS_M * math.atan2(math.sqrt(h), math.sqrt(1 - h)) / 1000


def bearing(lon1, lat1, lon2, lat2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    return (math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) + 360) % 360


def fnum(x):
    return NA if x == NA else float(x)


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
    m18b = json.loads((ROOT / "docs/research/step18b-model-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r[f]) == r[k] for r in m18b["runs"] for k, f in (("trajectoriesSha256", "trajectoriesFile"), ("resultSha256", "resultFile"))), "1 STEP 18b trajectories untouched")
    cal = json.loads((ROOT / "docs/research/step20-calibration-manifest.json").read_text(encoding="utf-8")); hold = json.loads((ROOT / "docs/research/step20-b6-holdout-manifest.json").read_text(encoding="utf-8"))
    check(all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in cal["runs"]) and all(sha(ROOT / r["trajectoriesFile"]) == r["trajectoriesSha256"] for r in hold["runs"] if r.get("modeled")), "1 STEP 20 trajectories untouched")
    # 2 protocol / preregistration / rule file
    p = json.loads(PROTO.read_text(encoding="utf-8")); q = json.loads(PREREG.read_text(encoding="utf-8"))
    rule = {l.split()[1]: l.split()[0] for l in RULE.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(rule.get("docs/research/step21-model-adequacy-protocol.json") == sha(PROTO) == q["protocolSha256"] and rule.get("docs/research/step21-model-adequacy-preregistration.json") == sha(PREREG), "2 protocol/preregistration SHA cross-reference")
    check(rule.get("tools/research/check_step21_model_adequacy.py") == sha(__file__) and rule.get("tools/research/diagnose_step21.py") == sha(ROOT / "tools/research/diagnose_step21.py"), "2 validator / diagnostic tool SHA recorded before execution")
    check(p["ruleId"] == q["ruleId"] == "model-adequacy-diagnosis-step21" and q["status"] == "PREREGISTRATION LOCKED" and p["descriptiveOnly"] is True, "2 rule id / LOCK / descriptive")
    check(p["haversineRadiusMeters"] == 6371008.8 and p["horizonsHours"] == [24, 48, 72] and set(p["alphasUsed"]) == {0.0, 0.002} and p["newAlphaCandidates"] == 0 and p["alphaReselection"] is False, "2 radius / horizons / alphas 0 & 0.002 only / no reselection")
    check(p["holdoutUsedForSelection"] is False and p["outlierPolicy"]["remove"] is False and p["outlierPolicy"]["winsorize"] is False and p["outlierPolicy"]["trim"] is False and p["outlierPolicy"]["reweight"] is False and p["thresholdsIntroduced"] is False and p["confirmatoryPValues"] is False, "2 leakage / outlier / statistical policy")
    check(p["excludedUnits"] == [{"unit": "KE-H2", "n": 1, "status": "FORCING_UNAVAILABLE"}] and set(p["units"]) == {"KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"}, "2 KE-H2 excluded by protocol, six units")
    check(len(p["questions"]) == 10 and set(p["growthClasses"]) == {"A", "B", "C", "D"} and {"A", "B", "C", "D"} <= set(p["adequacyCategories"]), "2 Q1-Q10, growth classes, adequacy categories")
    if phase == "A":
        check(not TABLE.exists() and not SUMMARY.exists() and not RUN.exists() and not FIGDIR.exists(), "3 Phase A: no diagnostic outputs exist")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A", "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "validatorSha256": sha(__file__)}, ensure_ascii=False, indent=2))
        return 0 if not failures else 1
    # 3 outputs
    s = json.loads(SUMMARY.read_text(encoding="utf-8")); run = json.loads(RUN.read_text(encoding="utf-8"))
    with open(TABLE, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    check(run["status"] == "STEP21_DIAGNOSTIC_COMPLETE" and run["tableSha256"] == sha(TABLE) and run["summarySha256"] == sha(SUMMARY) and run["tool"]["sha256"] == sha(ROOT / "tools/research/diagnose_step21.py"), "3 run record SHAs")
    p20 = json.loads((ROOT / "docs/research/step20-preregistration.json").read_text(encoding="utf-8"))
    cal_ids = {(u["windowId"], d) for u in p20["calibration"]["runUnits"] for d in u["drifterIds"]}; hold_ids = {(u["windowId"], d) for u in p20["holdout"]["runUnits"] for d in u["drifterIds"] if u["windowId"] != "KE-H2"}
    check({(r["unit"], r["drifter_id"]) for r in rows if r["dataset"] == "CALIBRATION"} == cal_ids and {(r["unit"], r["drifter_id"]) for r in rows if r["dataset"] == "HOLDOUT"} == hold_ids and len(rows) == 35, "3 23 calibration + 12 holdout rows, no removal, KE-H2 absent")
    check(not ({d for _, d in cal_ids} & {d for _, d in hold_ids}) and s["datasets"]["excluded"][0]["unit"] == "KE-H2" and s["datasets"]["excluded"][0]["status"] == "FORCING_UNAVAILABLE", "3 no cohort leakage; KE-H2 exclusion recorded")
    for u, n in (("KE-1", 8), ("KE-2", 5), ("AG-1", 9), ("AG-2", 1), ("KE-H1", 5), ("KE-H3", 7)):
        check(s["perUnit"][u]["n"] == n == sum(1 for r in rows if r["unit"] == u) and s["perUnit"][u]["smallN"] == (n < 10), f"3 unit count {u}")
    check(s["haversineRadiusMeters"] == 6371008.8 and s["horizonsHours"] == [24, 48, 72] and s["alphaReselection"] is False and s["thresholdsIntroduced"] is False and s["pValues"] is False and s["interpretation"] == "DESCRIPTIVE ONLY" and s["outlierPolicyApplied"] == {"removed": 0, "trimmed": 0, "winsorized": 0, "reweighted": 0}, "3 summary policy fields")
    # 4 independent recomputation for every row
    sys.path.insert(0, str(ROOT / "tools/research")); import run_step18b_model as r18  # noqa: E402
    cohort = json.loads((ROOT / "docs/research/cohort-step16.json").read_text(encoding="utf-8"))
    rel_all = {}
    for u in p20["calibration"]["runUnits"]:
        for d, lon, lat in r18.release_points(cohort, u):
            rel_all[(u["windowId"], d)] = (lon, lat, u["t0"], u["region"])
    for u in p20["holdout"]["runUnits"]:
        for d in u["releasePositions"]:
            rel_all[(u["windowId"], d["drifterId"])] = (d["lon"], d["lat"], u["t0"], u["region"])
    tracks = {}
    for r in cal["runs"]:
        if float(r["alpha"]) in (0.0, 0.002):
            tracks[(r["windowId"], float(r["alpha"]))] = r["trajectoriesFile"]
    for r in hold["runs"]:
        if r.get("modeled"):
            tracks[(r["windowId"], float(r["alpha"]))] = r["trajectoriesFile"]
    pos = {}
    for (w, a), f in tracks.items():
        with open(ROOT / f, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["valid"] == "true":
                    pos[(w, row["drifter_id"], a, row["timestamp"])] = (float(row["lon"]), float(row["lat"]))
    obs_cache = {}
    n_checked = 0
    for r in rows:
        w, d = r["unit"], r["drifter_id"]; lon0, lat0, t0s, region = rel_all[(w, d)]
        t0 = datetime.strptime(t0s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if (region, t0s[:4]) not in obs_cache:
            ob = {}
            for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{region}-{t0s[:4]}-q*.csv")):
                with open(path, encoding="utf-8", newline="") as fh:
                    rd = csv.reader(fh); next(rd); next(rd)
                    for row in rd:
                        ob[(row[0], row[1])] = (float(row[3]), float(row[2]))
            obs_cache[(region, t0s[:4])] = ob
        ob = obs_cache[(region, t0s[:4])]
        for h in H:
            ts = (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ"); o = ob.get((d, ts))
            check(o is not None and abs(hav(lon0, lat0, *o) - float(r[f"obs_disp_{h}h"])) <= 0.0015, f"4 obs displacement {d} {h}h")
            for key, a in (("a002", 0.002), ("a0", 0.0)):
                pm = pos.get((w, d, a, ts)); n_checked += 1
                check(pm is not None and abs(hav(*pm, *o) - float(r[f"E{h}_{key}"])) <= 0.0015 and abs(hav(lon0, lat0, *pm) - float(r[f"model_disp_{h}h_{key}"])) <= 0.0015, f"4 error/displacement {d} {h}h {key}")
                bd = abs(bearing(lon0, lat0, *pm) - bearing(lon0, lat0, *o)) % 360; bd = min(bd, 360 - bd)
                check(abs(bd - float(r[f"bearing_diff_{h}h_{key}"])) <= 0.0015, f"4 bearing diff {d} {h}h {key}")
                dx = (pm[0] - o[0]) * math.cos(math.radians(o[1])) * math.pi / 180 * RADIUS_M / 1000; dy = (pm[1] - o[1]) * math.pi / 180 * RADIUS_M / 1000
                check(abs(dx - float(r[f"east_offset_{h}h_{key}"])) <= 0.0015 and abs(dy - float(r[f"north_offset_{h}h_{key}"])) <= 0.0015, f"4 offsets {d} {h}h {key}")
            check(abs((float(r[f"E{h}_a002"]) - float(r[f"E{h}_a0"])) - float(r[f"delta_{h}h"])) <= 0.0015, f"4 delta {d} {h}h")
        for key in ("a002", "a0"):
            e = [float(r[f"E{h}_{key}"]) for h in H]; cls = "A" if e[0] <= e[1] <= e[2] else ("B" if e[1] < e[0] else "C")
            check(r[f"growth_class_{key}"] == cls and abs((e[1] - e[0]) - float(r[f"growth_48_24_{key}"])) <= 0.0015 and abs((e[2] - e[1]) - float(r[f"growth_72_48_{key}"])) <= 0.0015, f"4 growth {d} {key}")
    # 5 STEP 20 consistency and summaries re-derived
    check(s["step20Consistency"]["inconsistent"] == [] and s["step20Consistency"]["checked"] == 35 * 6, "5 STEP 20 consistency 0 inconsistencies")
    for ds in ("CALIBRATION", "HOLDOUT"):
        items = [r for r in rows if r["dataset"] == ds]; b = s["overall"][ds]
        for key in ("a002", "a0"):
            check(b[key]["growth_class_counts"] == {c: sum(1 for r in items if r[f"growth_class_{key}"] == c) for c in "ABCD"}, f"5 growth class counts {ds} {key}")
            for h in H:
                v = sorted(float(r[f"E{h}_{key}"]) for r in items); mid = len(v) // 2; med = v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2
                check(abs(b[key][f"E{h}"]["median"] - med) <= 0.0015 and b[key][f"E{h}"]["n"] == len(items), f"5 median E{h} {ds} {key}")
                check(b[key][f"east_sign_counts_{h}h"]["east"] == sum(1 for r in items if float(r[f"east_offset_{h}h_{key}"]) > 0), f"5 east/west counts {ds} {key} {h}h")
        for h in H:
            check(b[f"delta_sign_counts_{h}h"]["neg"] == sum(1 for r in items if float(r[f"delta_{h}h"]) < -1e-6) and b[f"delta_sign_counts_{h}h"]["pos"] == sum(1 for r in items if float(r[f"delta_{h}h"]) > 1e-6), f"5 delta sign counts {ds} {h}h")
        top = [t["drifter_id"] for t in b["highest_error_cases_72h_a002"]]; exp = [r["drifter_id"] for r in sorted(items, key=lambda r: -float(r["E72_a002"]))[:3]]
        check(top == exp, f"5 highest-error cases {ds}")
    # 6 figures and reproducibility
    check(len(run["figures"]) == 6 and all((FIGDIR / f["file"]).exists() and sha(FIGDIR / f["file"]) == f["sha256"] for f in run["figures"]), "6 six figures with recorded SHAs")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/diagnose_step21.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        ok = proc.returncode == 0 and sha(Path(tmp) / "step21-diagnostic-table.csv") == sha(TABLE) and sha(Path(tmp) / "step21-diagnostic-summary.json") == sha(SUMMARY)
        ok = ok and all(sha(Path(tmp) / "step21-diagnostic-figures" / f["file"]) == f["sha256"] for f in run["figures"])
        check(ok, "6 reproducibility: table, summary and figures byte-identical on independent re-run")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "phase": "B", "rowsChecked": len(rows), "valuesRecomputed": n_checked, "tableSha256": sha(TABLE), "summarySha256": sha(SUMMARY)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

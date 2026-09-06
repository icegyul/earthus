"""Independent validator for STEP 28 Phase B (field diagnostic execution). `--phase A` (Phase B lock) or `--phase B` (full). exit 0 = PASS.
Verifies: 1 ancestry (incl. 79a0d69d) · 2 locked SHAs (STEP 17–28 Phase A, AVISO/HYCOM/GLORYS sources) · 3 no new download (only
registered files referenced; their SHAs unchanged) · 4 no model artifacts · 5 exact AVISO timestamps (re-read from files) · 6 HYCOM
exact-frame availability (re-read) · 7 GLORYS same-UTC-day rule (label = T - 12 h; no shift) · 8 common AVISO grid (nodes recomputed) ·
9 valid-cell rule (mask recomputed) · 10-13 du/dv, speed, direction, Pearson arithmetic recomputed independently for every evaluated
window and comparison · 14 depth labels · 15 KE-H2 handling (C only) · 16 AG exclusion · 17 trajectory context = frozen STEP 25C table
(not recomputed) · 18 no parameter selection · 19 reproducibility (evaluator re-run to a temp dir byte-identical incl. figures);
KE-H2 normalization value check; language scan. Deterministic output."""
import csv
import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
from bisect import bisect_right
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402

PREREG, PBLOCK, MANIFEST, EVAL, TABLE, WSUM, SUMMARY = D / "step28-preregistration.json", D / "step28-phase-b-preregistration.json", D / "step28-field-comparison-manifest.json", D / "step28-field-evaluation.json", D / "step28-field-table.csv", D / "step28-field-window-summary.csv", D / "step28-field-summary.json"
LOCK = {"docs/research/step28-forcing-field-protocol.md": "b67dbf811525f0862ac1514ec97f5f89a6ea62ee114417329c8b16ba9f129e36", "docs/research/step28-preregistration.json": "0b9da69cdbd4ea1df4d8d6bd0084463b8162388d4b12371990910b1020668b16",
        "docs/research/step28-experiment-matrix.json": "f487fb63dd72cb03c7b2c09a4ca907b9a0fed446143b0d743c8910a6d66eddd4", "tools/research/check_step28_forcing_field.py": "2834555df48cf0cf45bf39b2e65c7a19ac5d715e532a6e5e9d757a9bebeaa1ee",
        "docs/research/step25c-paired-table.csv": "3a5c6b1a339c050a053279514299004a7be5bd614cf6e542433953888c78e002", "docs/research/step25c-glorys-forcing-manifest.json": "9febefe0d4e4ecc24f98fee13c6aa5d788d4ee34b94fd97626e5305163f72e19",
        "docs/research/step27-depth-forcing-manifest.json": "14f6218a24948d3170bd74c3512f7693c3bc376914fdfd978c4ec197b964ac47", "docs/research/step27-depth-execution-summary.json": "d9c54f1df827af17b25c388b71f3b57357fc80d8db713f713572cf578322ae03",
        "docs/research/step25b-glorys-acquisition-manifest.json": "8dfd07815328074fefa029a41e911130984386d50d3ca86cd8c123e1f0d8b734", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
        "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701",
        "tools/research/glorys_reader_step25c.py": "11b7d987434a55a9e42a9776e851fad49b8ec65d2df0f23130c7a7e6234ab63e",
        "data/research/step23/DATA-03/erdTAgeo1day/KE-1.erdTAgeo1day.nc": "18d6d75692e34379b6c0afeaa9233bea56850f0bbb4caada89886fc257482919", "data/research/step23/DATA-03/erdTAgeo1day/KE-2.erdTAgeo1day.nc": "0750f095bca4e5901beb05ce0d5174a9400cd1e7f087cc56cc934917f0841148",
        "data/research/step23/DATA-03/erdTAgeo1day/KE-H1.erdTAgeo1day.nc": "cf2a248d6a8ccda2a78b8798fa4ecaec3f4c5f75c32ad6dae3456adb0247c2d7", "data/research/step23/DATA-03/erdTAgeo1day/KE-H2.erdTAgeo1day.nc": "8dcd1db9a27d6d730786b82aa21b426fb21ca7ad2f55c594ee0d75a714bc6abf",
        "data/research/step23/DATA-03/erdTAgeo1day/KE-H3.erdTAgeo1day.nc": "bca272caa2841f8c78279598335d4ff4de9735c6fbcf32b96155a2ce35bcf0db", "data/research/step25b/glorys/KE-H2.glorys12v1.uo_vo.15.81m.nc": "bfc66034654eb10b1c2d7f2570d31cca6e10ccc4a925e355663593c58d8a7ce7"}
COMMITS = ("551668ef", "d505cc5e", "5b9567e5", "5f27dc2d", "155995dd", "73fafffb", "9113e8b5", "869bc664", "c395a098", "ed746129", "7b0453b8", "a7f62873", "4bb4342b", "e0e7cfd2", "db6cea2f", "2841f511", "929d3468", "c974ce42", "86266b3a", "a4474eb8", "d5fb2a62", "d242165d", "b9078805", "0c2b3cb7", "3338c7e4", "79a0d69d")
TRUTH = re.compile(r"ground[- ]truth(?! \(|\)|,? not)|AVISO proves|proves (GLORYS|HYCOM)|(GLORYS|HYCOM) (is|was) (correct|wrong|incorrect)|\bcaused?\b|proven mechanism|\bproven\b|\boptimal\b|\bsuperior\b", re.I)
NA = "NOT_AVAILABLE"
TOL = 1e-6


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def field(g, k, comp, mask=None):
    F = np.array([[np.nan if v is None else v for v in row] for row in g[comp][k]], dtype=np.float64)
    if mask is not None:
        F[mask] = np.nan
    return F


def sample(lon, lat, F, x, y):
    if x < lon[0] or x > lon[-1] or y < lat[0] or y > lat[-1]:
        return np.nan
    i = min(max(0, bisect_right(lon, x) - 1), len(lon) - 2); j = min(max(0, bisect_right(lat, y) - 1), len(lat) - 2)
    fx = (x - lon[i]) / (lon[i + 1] - lon[i]); fy = (y - lat[j]) / (lat[j + 1] - lat[j]); a, b, c, d = F[j, i], F[j, i + 1], F[j + 1, i], F[j + 1, i + 1]
    if any(np.isnan(v) for v in (a, b, c, d)):
        return np.nan
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def recompute(um, vm, ur, vr):
    du, dv = um - ur, vm - vr; vec = np.hypot(du, dv); sm, sr = np.hypot(um, vm), np.hypot(ur, vr)
    both = (sm != 0) & (sr != 0); bm = (np.degrees(np.arctan2(um[both], vm[both])) + 360) % 360; br = (np.degrees(np.arctan2(ur[both], vr[both])) + 360) % 360
    sd = (bm - br + 180) % 360 - 180; sd[sd == -180] = 180
    nz = sr != 0; rel = (sm[nz] - sr[nz]) / sr[nz]
    return {"nCells": len(um), "medianVecDiff": float(np.median(vec)), "meanVecDiff": float(vec.mean()), "maxVecDiff": float(vec.max()), "rmsVecDiff": math.sqrt(float((vec ** 2).mean())), "medianModelSpeed": float(np.median(sm)), "medianRefSpeed": float(np.median(sr)),
            "medianRelSpeedDiff": float(np.median(rel)) if nz.any() else NA, "nDirection": int(both.sum()), "medianAbsDirDiff": float(np.median(np.abs(sd))) if both.any() else NA, "fractionCW": float((sd > 0).mean()) if both.any() else NA,
            "pearsonU": float(np.corrcoef(um, ur)[0, 1]) if len(um) > 1 and np.std(um) > 0 and np.std(ur) > 0 else NA, "pearsonV": float(np.corrcoef(vm, vr)[0, 1]) if len(vm) > 1 and np.std(vm) > 0 and np.std(vr) > 0 else NA}


def close(a, b):
    if a == NA or b == NA:
        return a == b
    return abs(float(a) - float(b)) <= TOL * max(1.0, abs(float(b)))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "B"
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for rel, expected in LOCK.items():
        check(sha(ROOT / rel) == expected, f"2 locked SHA: {rel}")
    for short in COMMITS:
        check(subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() == "commit", f"1 ancestry: {short}")
    for name in ("datasets.py", "models.py", "models_v2.py", "wind.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"2 runtime unchanged: {name}")
    q = load(PREREG); pb = load(PBLOCK); R = q["rules"]
    check(pb["status"] == "PREREGISTRATION LOCKED" and pb["phaseAPreregistrationSha256"] == sha(PREREG) and pb["phaseALock"] == "79a0d69d" and pb["ruleId"] == q["ruleId"], "Phase B preregistration bound to Phase A")
    for t in ("tools/research/prepare_step28_fields.py", "tools/research/evaluate_step28_fields.py", "tools/research/check_step28_field_execution.py", "tools/research/glorys_reader_step25c.py"):
        check(pb["tools"].get(t) == sha(ROOT / t), f"tool locked before execution: {t}")
    QR = pb["questionRules"]; check(QR["majorityFraction"] == 0.75 and QR["magnitudeThresholdRelative"] == 0.25 and QR["directionThresholdDegrees"] == 30 and QR["patternCorrelationThreshold"] == 0.5 and QR["depthMaterialRelativeChange"] == 0.10 and abs(QR["rankConsistentFraction"] - 5 / 6) < 1e-9, "question rules preregistered")
    if phase == "A":
        check(not any(x.exists() for x in (MANIFEST, EVAL, TABLE, WSUM, SUMMARY)) and not (D / "step28-figures").exists() and not (ROOT / "data/research/step28").exists(), "Phase B lock: no outputs")
        print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "phase": "A"}, ensure_ascii=False, indent=2)); return 0 if not failures else 1
    m = load(MANIFEST); ev = load(EVAL); S = load(SUMMARY)
    check(m["phaseAPreregistrationSha256"] == sha(PREREG) == ev["phaseAPreregistrationSha256"] and m["phaseBPreregistrationSha256"] == sha(PBLOCK) == ev["phaseBPreregistrationSha256"] and ev["manifestSha256"] == sha(MANIFEST) and ev["tableSha256"] == sha(TABLE) and ev["windowSummarySha256"] == sha(WSUM) and ev["summarySha256"] == sha(SUMMARY) and ev["tool"]["sha256"] == pb["tools"]["tools/research/evaluate_step28_fields.py"], "output chain cross references")
    check(m["modelRunCount"] == 0 and m["newDownloads"] == 0 and S["modelRunCount"] == 0 and S["newDownloads"] == 0 and m["readerSha256"] == LOCK["tools/research/glorys_reader_step25c.py"] and not any(D.glob("step28-*run*")) and not any((ROOT / "data/research/step28").glob("**/*.trajectories.csv")) and not any((ROOT / "data/research/step28").glob("**/*.nc")), "3/4 no new download, no model artifacts")
    check(S["parameters"] == R["parameters"] and S["avisoRole"].startswith("REFERENCE FIELD DIAGNOSTIC") and S["interpretation"] == "DESCRIPTIVE ONLY" and S["notAvailable"]["AG-1"].startswith("NOT AVAILABLE") and S["notAvailable"]["AG-2"].startswith("NOT AVAILABLE") and S["labels"] == R["labels"], "16/18 AG exclusion / no parameter selection / labels")
    rw = {w["windowId"]: w for w in R["windows"]}; table = {}
    with open(TABLE, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            table[(row["windowId"], row["grid"], row["comparison"], row["model"])] = row
    sep = {}
    with open(D / "step25c-paired-table.csv", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["GH_sep72h_alpha0.002"] != NA:
                sep.setdefault(row["unit"], []).append(float(row["GH_sep72h_alpha0.002"]))
    for w in m["windows"]:
        wid = w["windowId"]; pw = rw[wid]; so = next(x for x in S["windows"] if x["windowId"] == wid)
        if w["fieldStatus"] != "ELIGIBLE":
            check(so["status"] == "NO_EXACT_AVISO_TIME" and wid in ("AG-1", "AG-2"), f"16 {wid} excluded"); continue
        T = w["avisoTimestamp"]; check(T == pw["avisoTimestamp"], f"5 {wid} timestamp = Phase A")
        with netCDF4.Dataset(ROOT / w["aviso"]["file"]) as nc:
            t = nc["time"]; times = [x.strftime("%Y-%m-%dT%H:%M:%SZ") for x in netCDF4.num2date(t[:], t.units)]; k = w["aviso"]["frameIndex"]
            check(sha(ROOT / w["aviso"]["file"]) == w["aviso"]["sha256"] == pw["avisoSha256"] and times[k] == T, f"5 {wid} AVISO exact frame")
            alon = np.array(nc["longitude"][:], float); alat = np.array(nc["latitude"][:], float); au = np.ma.filled(nc["u_current"][k, 0].astype(np.float64), np.nan); av = np.ma.filled(nc["v_current"][k, 0].astype(np.float64), np.nan)
        alon = np.where(alon > 180, alon - 360, alon)
        has_h = w["hycom"]["status"] == "PASS"; check(has_h == pw["hycomFrameAtT"] and (wid != "KE-H2" or not has_h), f"6/15 {wid} HYCOM exact-frame availability (KE-H2 C only)")
        gd = w["glorys"]["D15"]; check(gd["frameLabel"] == T[:10] + "T00:00:00Z" and sha(ROOT / gd["file"]) == gd["fileSha256"], f"7 {wid} GLORYS same-UTC-day label / SHA")
        gg = load(ROOT / gd["file"]); check(gg["grid"]["timeUTC"][gd["frameIndex"]] == gd["frameLabel"] and gg["manifest"]["surfaceDepthMeters"] == 15.81007 and gg["manifest"]["sha256"] == gd["gridSha256"], f"7 {wid} GLORYS frame index / depth")
        if wid == "KE-H2":
            check(gd.get("normalizedHere") is True and gd["valueCheck"]["mismatches"] == 0 and gd["sourceSha256"].startswith("bfc66034654eb10b") and gd["readerSha256"] == LOCK["tools/research/glorys_reader_step25c.py"], "15 KE-H2 normalization: locked reader, no value change")
        glon, glat = np.array(gg["grid"]["lon"]), np.array(gg["grid"]["lat"]); gmask = np.array(gg["grid"]["landMask"], bool); gu, gv = field(gg["grid"], gd["frameIndex"], "u", gmask), field(gg["grid"], gd["frameIndex"], "v", gmask)
        if has_h:
            hg = load(ROOT / w["hycom"]["file"])["grid"]; check(hg["timeUTC"][w["hycom"]["frameIndex"]] == T and sha(ROOT / w["hycom"]["file"]) == w["hycom"]["sha256"] and w["hycom"]["file"] in pw["hycomFiles"], f"6 {wid} HYCOM frame at T / SHA")
            hlon, hlat = np.array(hg["lon"]), np.array(hg["lat"]); hu, hv = field(hg, w["hycom"]["frameIndex"], "u"), field(hg, w["hycom"]["frameIndex"], "v")
        box = pw["oceanBox"]
        si = [i for i, x in enumerate(alon) if box["west"] <= x <= box["east"] and glon[0] <= x <= glon[-1] and (not has_h or hlon[0] <= x <= hlon[-1])]; sj = [j for j, y in enumerate(alat) if box["south"] <= y <= box["north"] and glat[0] <= y <= glat[-1] and (not has_h or hlat[0] <= y <= hlat[-1])]
        pts = [(alon[i], alat[j], au[j, i], av[j, i]) for j in sj for i in si]
        U = {"AVISO": np.array([p[2] for p in pts]), "GLORYS": np.array([sample(glon, glat, gu, p[0], p[1]) for p in pts])}; V = {"AVISO": np.array([p[3] for p in pts]), "GLORYS": np.array([sample(glon, glat, gv, p[0], p[1]) for p in pts])}
        if has_h:
            U["HYCOM"] = np.array([sample(hlon, hlat, hu, p[0], p[1]) for p in pts]); V["HYCOM"] = np.array([sample(hlon, hlat, hv, p[0], p[1]) for p in pts])
        valid = np.ones(len(pts), bool)
        for kname in U:
            valid &= ~np.isnan(U[kname]) & ~np.isnan(V[kname])
        check(so["primaryGrid"]["nodesInBox"] == len(pts) and so["primaryGrid"]["nCommonValid"] == int(valid.sum()), f"8/9 {wid} common grid nodes / valid-cell count recomputed ({len(pts)}, {int(valid.sum())})")
        comps = ([("A", "HYCOM", "GLORYS"), ("B", "HYCOM", "AVISO")] if has_h else []) + [("C", "GLORYS", "AVISO")]
        check(set(so["comparisons"]) >= {c for c, _, _ in comps} and (("A" in so["comparisons"]) == has_h), f"15 {wid} comparisons present per eligibility")
        for cid, mn, rn in comps:
            rc = recompute(U[mn][valid], V[mn][valid], U[rn][valid], V[rn][valid]); row = table[(wid, "AVISO_PRIMARY", cid, mn)]; sc = so["comparisons"][cid]
            for key in ("medianVecDiff", "meanVecDiff", "maxVecDiff", "rmsVecDiff", "medianModelSpeed", "medianRefSpeed", "medianRelSpeedDiff", "medianAbsDirDiff", "fractionCW", "pearsonU", "pearsonV"):
                check(close(row[key], rc[key]) and close(sc[key], rc[key]), f"10-13 {wid} {cid} {key} recomputed")
            check(int(row["nCells"]) == rc["nCells"] == sc["nCells"] and int(row["nDirection"]) == rc["nDirection"], f"10 {wid} {cid} counts")
        for did, spec in w["glorys"].items():
            if did in ("D15", "depthNote") or not isinstance(spec, dict):
                continue
            g2 = load(ROOT / spec["file"])["grid"]; check(sha(ROOT / spec["file"]) == spec["fileSha256"] and g2["timeUTC"][spec["frameIndex"]] == gd["frameLabel"], f"14 {wid} {did} file / same-day frame")
            mk = np.array(g2["landMask"], bool); du_, dv_ = field(g2, spec["frameIndex"], "u", mk), field(g2, spec["frameIndex"], "v", mk); lo, la = np.array(g2["lon"]), np.array(g2["lat"])
            DU = np.array([sample(lo, la, du_, p[0], p[1]) for p in pts]); DV = np.array([sample(lo, la, dv_, p[0], p[1]) for p in pts]); vd = valid & ~np.isnan(DU) & ~np.isnan(DV)
            rc = recompute(DU[vd], DV[vd], U["AVISO"][vd], V["AVISO"][vd]); sd = so["depthDiagnostic"][did]
            check(abs(sd["nativeLevelMeters"] - spec["nativeLevelMeters"]) < 1e-9 and sd["nCells"] == rc["nCells"] and close(sd["medianVecDiff"], rc["medianVecDiff"]) and close(sd["pearsonU"], rc["pearsonU"]), f"14 {wid} {did} depth diagnostic recomputed")
        tc = so["trajectoryContext"]["step25cMedianGlorysHycomSeparation72hKm"]; check((tc == NA and wid not in sep) or (wid in sep and close(tc, float(np.median(sep[wid])))), f"17 {wid} trajectory context = frozen STEP 25C table")
    lab = S["questions"]; check(all(k in lab for k in ("Q1", "Q2_Q3", "Q4", "Q5", "Q6")) and lab["Q6"]["causalAttribution"] is False and lab["Q5"]["noDepthRanking"] is True and all(lab[k]["evidence"] in R["evidenceClasses"] for k in ("Q1", "Q2_Q3", "Q4", "Q5", "Q6")), "Q1-Q6 present with evidence classes")
    for st in pb["requiredStatements"]:
        check(st in S["statements"], f"statement: {st[:40]}")
    text = json.dumps({k: v for k, v in S.items() if k not in ("windows", "figures", "labels", "statements", "avisoRole")}, ensure_ascii=False)
    check(not TRUTH.search(re.sub(r"\"caveat\": \"[^\"]*\"|\"causalAttribution\": false", "", text)), "no ground-truth / causal / selection language")
    figs = ev["figures"]; check(len(figs) >= 25 and all((D / f["file"]).exists() and sha(D / f["file"]) == f["sha256"] for f in figs), "figures exist and match recorded SHAs")
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run([sys.executable, str(ROOT / "tools/research/evaluate_step28_fields.py"), "--out", tmp], cwd=ROOT, capture_output=True, text=True)
        ok = proc.returncode == 0 and all(sha(Path(tmp) / n) == sha(D / n) for n in ("step28-field-table.csv", "step28-field-window-summary.csv", "step28-field-summary.json", "step28-field-evaluation.json"))
        ok = ok and all(sha(Path(tmp) / f["file"]) == f["sha256"] for f in figs)
        check(ok, "19 reproducibility: evaluation + figures byte-identical")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": [f for f in failures if f][:40], "phase": "B", "windows": S["eligibleWindows"], "Q1": lab["Q1"]["label"], "Q2Q3": lab["Q2_Q3"]["label"], "Q4": lab["Q4"]["label"], "Q5": lab["Q5"]["label"], "Q6": lab["Q6"]["label"], "modelRunCount": S["modelRunCount"]}, ensure_ascii=False, indent=2))
    return 0 if not [f for f in failures if f] else 1


if __name__ == "__main__":
    raise SystemExit(main())

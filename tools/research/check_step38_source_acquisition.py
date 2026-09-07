"""Independent validator for STEP 38 (preregistered source acquisition and data freeze; no experiment). exit 0 = PASS. Verifies:
1 STEP 37 lock identity (74d19f0a is HEAD or ancestor; STEP 37 files at their committed content) · 2 STEP 36 cohort identity unchanged ·
3 nine windows · 4 twenty drifters · 5 exact source identities (HYCOM expt_53.X 2010, NCEP-R2 2010, GLORYS12V1 15.81 m, WW3 GLOB-30M
CFSR 201007-201010) · 6 requested periods per window · 7 requested resolutions (0.08 deg / 3 h; 1/12 deg daily; 0.5 deg 3 h; 6 h) ·
8 source / version identity from file attributes · 9 acquisition timestamps · 10 SHA-256 and bytes recorded for every file · 11 originals
immutable (every A artefact re-hashed) · 12 no substitution (no other product / experiment / version in any request) · 13 longitude
convention rule checked per window (reader axis -180..180 covers the -180..180 box; no transform) · 14 BLOCKED branches recorded ·
15-20 no trajectory / model / performance / tuning / endpoint / bootstrap (no such files; flags) · 21 freeze manifest internally
consistent (artefact SHAs on disk, categories, counts, bytes, per-window statuses recomputed from the files) · 22 deterministic replay of the
metadata validation (overlap-frame equality and missing-frame detection recomputed). Also STEP 16-31 locks and runtime unchanged."""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research")); sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import check_step32_preregistration as pa  # noqa: E402
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402

PROTO, ACQ, FRZ, STATUS, REPORT = D / "step38-source-acquisition-protocol.json", D / "step38-source-acquisition-manifest.json", D / "step38-data-freeze-manifest.json", D / "step38-source-acquisition-status.json", D / "step38-source-acquisition-report.md"
FMT = "%Y-%m-%dT%H:%M:%SZ"
STEP37 = {"docs/research/step37-experiment-preregistration-protocol.json": "eae40cde", "docs/research/step37-experiment-preregistration-status.json": "61de721a", "docs/research/step37-experiment-preregistration-report.md": "dfac0db5", "tools/research/check_step37_experiment_preregistration.py": "679eec94"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def frames(path):
    with netCDF4.Dataset(path) as d:
        times = [t.strftime(FMT) for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
        u, v = d["water_u"][:, 0], d["water_v"][:, 0]; uf, vf = np.ma.filled(u.astype(float), np.nan), np.ma.filled(v.astype(float), np.nan); uf[np.ma.getmaskarray(u)] = np.nan; vf[np.ma.getmaskarray(v)] = np.nan
        return times, uf, vf, d["lon"][:].tolist()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    for short in pa.COMMITS + ("ee64354d", "043a09b8", "74d19f0a"):
        check(git("cat-file", "-t", short).stdout.strip() == "commit" and git("merge-base", "--is-ancestor", short, "HEAD").returncode == 0, f"1 ancestry: {short}")
    P, A, F, ST = load(PROTO), load(ACQ), load(FRZ), load(STATUS); rep = REPORT.read_text(encoding="utf-8")
    check(git("rev-parse", "74d19f0a").stdout.strip() == "74d19f0a9661a41d63a08c56bbd3f91e9d8b312d" == P["step37LockCommit"] and all(sha(ROOT / f).startswith(h) for f, h in STEP37.items()) and P["step37ProtocolSha256"] == sha(D / "step37-experiment-preregistration-protocol.json") == A["step37ProtocolSha256"], "1 STEP 37 lock identity and files unchanged")
    q = load(D / "step32-preregistration.json"); P37 = load(D / "step37-experiment-preregistration-protocol.json")
    for rel, expected in pa.LOCK.items():
        exp = expected or q["sourceBinding"].get(rel); check(exp is not None and sha(ROOT / rel) == exp, f"immutability: {rel}")
    for rel, expected in P37["ancestry"]["frozenInputs"].items():
        check(sha(ROOT / rel) == expected, f"2 frozen input unchanged: {rel}")
    for name in ("__init__.py", "datasets.py", "models.py", "models_v2.py", "wind.py", "cli.py", "cli_v2.py", "registry.py", "netcdf_reader.py"):
        rel = f"services/research-runtime/research_runtime/{name}"; blob = subprocess.run(["git", "show", f"155995dd:{rel}"], cwd=ROOT, capture_output=True).stdout
        check(blob and blob.replace(b"\r\n", b"\n") == (ROOT / rel).read_bytes().replace(b"\r\n", b"\n"), f"runtime unchanged: {name}")
    M36 = load(D / "step36-cohort-extension-manifest.json"); mw = {w["windowId"]: w for w in M36["windows"]}
    check(P["cohortManifestSha256"] == sha(D / "step36-cohort-extension-manifest.json") == A["cohortManifestSha256"] == F["cohortManifestSha256"] == P37["cohort"]["sha256"] and M36["derivationHash"].startswith("46892c37"), "2 STEP 36 cohort identity unchanged")
    check(len(M36["windows"]) == 9 == len(A["windows"]) == len(F["windows"]) and [w["windowId"] for w in A["windows"]] == list(mw), "3 nine windows")
    ids = [i for w in M36["windows"] for i in w["drifterIds"]]; check(len(ids) == 20 == len(set(ids)) and all(sorted(r["drifterIds"]) == sorted(mw[r["windowId"]]["drifterIds"]) for r in A["windows"]), "4 twenty drifters")
    check(A["protocolSha256"] == sha(PROTO) == F["protocolSha256"] and F["acquisitionManifestSha256"] == sha(ACQ) and ST["freezeManifestSha256"] == sha(FRZ) and ST["acquisitionManifestSha256"] == sha(ACQ) and P["tools"]["tools/research/acquire_step38_sources.py"] == A["tool"]["sha256"] and P["tools"]["tools/research/freeze_step38_data.py"] == F["tool"]["sha256"] and P["tools"]["tools/research/check_step38_source_acquisition.py"] == sha(__file__), "provenance chain: protocol -> acquisition -> freeze -> status; tools locked")
    fw = {w["windowId"]: w for w in F["windows"]}; artefacts = F["artefacts"]; artsha = {a["file"]: a for a in artefacts}
    for rec in A["windows"]:
        wid = rec["windowId"]; w = mw[wid]; box = w["oceanBox"]; t0 = datetime.strptime(w["start"], FMT).replace(tzinfo=timezone.utc)
        for e in rec["hycomWindowParts"] + rec["hycomDayParts"]:
            check("GLBv0.08/expt_53.X/data/2010?" in e["query"] and "var=water_u&var=water_v" in e["query"] and "vertCoord=15" in e["query"] and "horizStride=1" in e["query"] and "timeStride=1" in e["query"] and f"north={box['north']:.3f}" in e["query"] and f"west={box['west']:.3f}" in e["query"] and e.get("retrievedAtUTC") and e.get("sha256") and e.get("bytes"), f"5-10 HYCOM request identity / timestamp / SHA: {wid} {e['filename']}")
            if e.get("metadata"):
                check(e["metadata"]["depthMeters"] == [15.0] and e["metadata"]["units"] == {"water_u": "m/s", "water_v": "m/s"} and abs(e["metadata"]["grid"]["lonStep"] - 0.08) < 0.0005 and "Distribution unlimited" in e["metadata"]["distributionStatement"], f"7-8 HYCOM resolution / version attributes: {wid} {e['filename']}")
        got = sorted(t for e in rec["hycomDayParts"] for t in e.get("metadata", {}).get("timeUTC", [])); req = [f"{d}T{h:02d}:00:00Z" for d in w["requiredUtcDays"] for h in range(0, 24, 3)]
        check(rec["missingRegisteredFrames"] == sorted(set(req) - set(got)) and (got[:1] == [f"{w['requiredUtcDays'][0]}T00:00:00Z"] if got else True), f"6 requested period = registered days: {wid}")
        for e in rec["ncep"]:
            check("ncep.reanalysis2" in e["query"] and ".2010.nc" in e["query"] and e.get("sha256") and e.get("retrievedAtUTC"), f"5 NCEP-R2 2010 identity / SHA / timestamp: {wid} {e.get('filename')}")
        cr = rec.get("coordinateRule", {}); check(cr.get("boxConvention") == "-180..180" and cr.get("transformApplied") is False and cr.get("result") in ("PASS", "COORDINATE_BLOCKED") and (cr.get("result") == "PASS") == (cr.get("readerConvention") == "-180..180" and cr.get("coversBox") is True), f"13 longitude rule checked, no transform: {wid}")
        g = rec.get("glorys", {}); check(g.get("status") in ("ok", "CREDENTIALS_REQUIRED", "error", "COVERAGE_FAIL", "READER_FAIL", "REFUSED_EXISTING_ORIGINAL") and (g.get("status") != "ok" or ("cmems_mod_glo_phy_my_0.083deg_P1D-m" in g["command"] and g["requestedDepthMeters"] == 15.81 and g.get("sha256") and g.get("retrievedAtUTC") and "password" not in g["command"].lower())), f"5/12 GLORYS identity, no substitution, no credentials: {wid}")
        # replay of metadata validation: missing frames + overlap equality recomputed from the original files
        day = {}; win = {}
        for e, sub in [(e, "hycom") for e in rec["hycomWindowParts"]] + [(e, "hycom-days") for e in rec["hycomDayParts"]]:
            p = ROOT / "data/research/step38/forcing" / wid / sub / e["filename"]
            if p.exists() and "sha256" in e:
                check(sha(p) == e["sha256"] and p.stat().st_size == e["bytes"] and artsha.get(str(p.relative_to(ROOT)).replace("\\", "/"), {}).get("sha256") == e["sha256"], f"10/11 original immutable and frozen: {wid}/{e['filename']}")
                ts_, uf, vf, lon = frames(p)
                for k, t in enumerate(ts_):
                    (day if sub == "hycom-days" else win)[t] = (uf[k], vf[k])
        exp_win = [(t0 + timedelta(hours=3 * k)).strftime(FMT) for k in range(25)]; overlap = [t for t in exp_win if t in day and t in win]; equal = sum(1 for t in overlap if np.array_equal(day[t][0], win[t][0], equal_nan=True) and np.array_equal(day[t][1], win[t][1], equal_nan=True))
        fz = fw[wid]; check(fz["reproducibility"]["overlapFrames"] == len(overlap) and fz["reproducibility"]["overlapEqual"] == equal and fz["missingRegisteredFrames"] == sorted(set(req) - set(day)) and fz["hycomStatus"] == ("WINDOW_BLOCKED" if fz["missingRegisteredFrames"] else ("HYCOM_PASS" if all(fz["checks"].values()) else "FAIL")), f"21/22 freeze statuses reproduced from the files: {wid}")
        check(fz["candidateStatus"] == ("CANDIDATE_PASS" if fz["hycomStatus"] == "HYCOM_PASS" and all(fz["glorysChecks"][k] for k in ("acquired", "integrity", "identity", "coverage", "depthLevel")) and all(v == "PASS" for v in fz["glorysChecks"]["ww3Months"].values()) else "CANDIDATE_BLOCKED"), f"14 candidate branch status rule: {wid}")
    for f in A["ww3"]["files"]:
        check(f["month"] in ("201007", "201008", "201009", "201010") and f["url"].endswith(f"2010_CFSR/uss/WW3-GLOB-30M_{f['month']}_uss.nc") and (f.get("status") != "ok" or (f.get("sha256") and f.get("retrievedAtUTC") and f["metadata"]["attributes"].get("product_version") == "1.0" and f["metadata"]["attributes"].get("grid") == "glob_30m")), f"5/8 WW3 identity: {f['filename']}")
    check(sorted(f["month"] for f in A["ww3"]["files"]) == ["201007", "201008", "201009", "201010"], "5 WW3 months 201007-201010 exactly")
    for a in artefacts:
        p = ROOT / a["file"]; check(p.exists() and sha(p) == a["sha256"] and p.stat().st_size == a["bytes"] and a["category"] in ("A_ORIGINAL_SOURCE", "B_DERIVED_REPACKAGED", "C_METADATA", "D_ACQUISITION_LOG"), f"11/21 artefact frozen: {a['file']}")
        if a["category"] == "B_DERIVED_REPACKAGED":
            check(a.get("derivedFromOriginals") and all(any(x["sha256"] == h for x in artefacts if x["category"] == "A_ORIGINAL_SOURCE") for h in a["derivedFromOriginals"]), f"21 derived file linked to frozen originals: {a['file']}")
    check(F["artefactCounts"] == {c: sum(1 for a in artefacts if a["category"] == c) for c in ("A_ORIGINAL_SOURCE", "B_DERIVED_REPACKAGED", "C_METADATA", "D_ACQUISITION_LOG")} and F["originalsImmutable"] is True and F["scientificProcessing"] is False and F["trajectoryComputed"] is False and F["endpointComputed"] is False and F["bootstrapRun"] is False, "21 freeze manifest counts and flags")
    n = len(F["windows"]); s = F["summary"]; exp_status = "SOURCE_ACQUISITION_COMPLETE" if s["hycomPass"] == n and s["candidatePass"] == n else ("SOURCE_ACQUISITION_PARTIAL" if s["hycomPass"] else "SOURCE_ACQUISITION_BLOCKED")
    check(F["status"] == exp_status == ST["status"] and f"ACQUISITION STATUS: {exp_status}" in rep, "14/21 final status rule and status/report consistency")
    check(not any(p.name.endswith("trajectories.csv") or p.name == "result.json" for p in (ROOT / "data/research/step38").rglob("*")) and not any(D.glob("step38-*run*")) and not any(D.glob("step38-*trajector*")) and not any(D.glob("step38-*evaluation*")) and not any(D.glob("step38-*daily*")) and not any(D.glob("step38-*candidate-forcing*")) and all(ST[k] is False for k in ("scientificExperimentExecuted", "trajectoryExecuted", "modelExecuted", "parameterTuning", "forcingSelection", "endpointComputed", "bootstrapRun", "performanceEvaluated")) and A["forbiddenInputAccess"] == 0 == ST["forbiddenInputAccess"] and A["credentialsInManifest"] is False and "password" not in json.dumps(A).lower().replace("password [redacted]", "").replace("password\" not in", ""), "15-20 no trajectory / model / performance / tuning / endpoint / bootstrap; no credentials")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures[:40], "status": F["status"], "summary": s, "artefacts": F["artefactCounts"], "forbiddenInputAccess": A["forbiddenInputAccess"]}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

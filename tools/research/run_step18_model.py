"""STEP 18 Phase B orchestration: immutable precheck → 8 runs (4 units × RUN A/RUN B) → CSV export →
separate-process replay → metrics M1–M5 → manifest. Model physics live only in research_runtime (unchanged).
Every rule applied here is copied from the LOCKED docs/research/step18-preregistration.json; nothing is tuned."""
import csv
import hashlib
import io
import json
import math
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
sys.path.insert(0, str(SERVICE)); sys.path.insert(0, str(SERVICE / ".deps"))
PREREG = ROOT / "docs/research/step18-preregistration.json"
PROTO = ROOT / "docs/research/step18-model-protocol.md"
RULE_FILE = ROOT / "docs/research/step18-model-rule-sha256.txt"
MANIFEST = ROOT / "docs/research/step18-model-manifest.json"
OUT = ROOT / "data/research/step18"
LOCKED = {  # STEP 18 Phase A LOCK (commit d505cc5e) and its immutable parents
    PROTO: "519b3d35bc13524b3e0a30f5521cd2e696ffecdceead58535b0c4959ac3bea2b",
    PREREG: "f02b17379140c8d0f7304dc2f15d512341c089b6773d2b4f6021da382972ecf4",
    RULE_FILE: "1a107b7edd49844e01e881de46c4bef477ac7dae336beac431dbd6efafd1388c",
    ROOT / "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
    ROOT / "docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792",
    ROOT / "docs/research/step17-preregistration.json": "b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378",
    ROOT / "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
}
COMMITS = ("7091c5cb", "5bc3590b", "551668ef", "cc4d8c48", "d505cc5e")
QUESTION_ID = "Q2-advection-regime-and-product-independence"
RADIUS_M = 6371008.8
COLUMNS = ["run_id", "drifter_id", "timestamp", "lat", "lon", "alpha", "status", "valid"]
STATUS_MAP = {"MISSING_FORCING": "FORCING_UNAVAILABLE", "STRANDED": "FORCING_UNAVAILABLE", "ACTIVE": "ACTIVE", "COMPLETED": "COMPLETED"}
BOUNDARY_TOL_DEG = 1e-6  # bisection resolution of the runtime boundary step (2^-24 of a 300 s step); not a physics rule
LOG = []


def log(phase, status, **info):
    entry = {"utc": utc_now(), "phase": phase, "status": status, **info}
    LOG.append(entry); print(json.dumps(entry, ensure_ascii=False), flush=True)


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def haversine_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def stats(values):
    v = sorted(x for x in values if x is not None)
    if not v:
        return {"n": 0, "median": None, "mean": None, "min": None, "max": None}
    mid = len(v) // 2
    return {"n": len(v), "median": round(v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2, 3), "mean": round(sum(v) / len(v), 3), "min": round(v[0], 3), "max": round(v[-1], 3)}


class Stop(Exception):
    pass


def precheck(prereg):
    for path, expected in LOCKED.items():
        if sha(path) != expected:
            raise Stop(f"MODEL_RUN_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    for short in COMMITS:
        if subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
            raise Stop(f"MODEL_RUN_BLOCKED_IMMUTABILITY: commit {short} missing")
    if prereg["status"] != "PREREGISTRATION LOCKED" or prereg["modelRun"] is not False:
        raise Stop("MODEL_RUN_BLOCKED_IMMUTABILITY: preregistration not LOCKED")
    checker = subprocess.run([sys.executable, str(ROOT / "tools/research/check_step18_model_preregistration.py")], cwd=ROOT, capture_output=True, text=True)
    if checker.returncode != 0:
        raise Stop("MODEL_RUN_BLOCKED_IMMUTABILITY: preregistration checker FAIL")
    if MANIFEST.exists() or OUT.exists():
        raise Stop("MODEL_RUN_BLOCKED_IMMUTABILITY: step18 outputs already exist; a rerun must not overwrite a prior result")
    fm = load(ROOT / "docs/research/step17-forcing-manifest.json")
    for u in prereg["runUnits"]:
        f = next(x for x in fm["runUnits"] if x["windowId"] == u["windowId"])
        for kind, key in (("hycom", "hycomFileSha256"), ("ncep", "ncepFileSha256")):
            p = ROOT / f[kind]["normalized"]["file"]
            if sha(p) != u[key] or f[kind]["normalized"]["fileSha256"] != u[key]:
                raise Stop(f"MODEL_RUN_BLOCKED_IMMUTABILITY: normalized {kind} {u['windowId']}")
        for x in f["hycom"]["files"] + f["ncep"]["files"]:
            p = ROOT / "data/research/step17" / u["windowId"] / ("hycom" if x["product"].startswith("water") else "ncep") / x["filename"]
            if sha(p) != x["sha256"]:
                raise Stop(f"MODEL_RUN_BLOCKED_IMMUTABILITY: raw forcing {x['filename']}")
    return fm


def release_points(cohort, unit):
    order = int(unit["windowId"].split("-")[1])
    window = next(w for w in cohort["selectedWindowDetails"][unit["region"]] if w["order"] == order)
    rows = sorted((d for d in window["drifters"] if d["drifterId"] in unit["drifterIds"]), key=lambda d: d["drifterId"])
    if len(rows) != unit["drifterCount"]:
        raise Stop("cohort/prereg drifter mismatch")
    return [(d["drifterId"], d["startLon"], d["startLat"]) for d in rows]


def build_spec(prereg, unit, dataset, wind, run, points):
    return {"schemaVersion": "1.0", "projectId": "earthus-research-step18", "question": "STEP 18 open-loop trajectory production (Q2 follow-up)", "questionId": QUESTION_ID,
            "validationPlanId": prereg["ruleId"], "modelId": prereg["model"]["modelId"], "modelVersion": prereg["model"]["modelVersion"],
            "datasetVersions": [{"datasetId": dataset["manifest"]["datasetId"], "version": dataset["manifest"]["version"]}],
            "windDataset": {"datasetId": wind["manifest"]["datasetId"], "version": wind["manifest"]["version"]},
            "windage": {"alpha": run["alpha"]}, "area": unit["modelArea"], "startTimeUTC": unit["t0"], "durationSeconds": prereg["time"]["durationSeconds"],
            "releaseDefinition": {"type": "points", "points": [{"lon": lon, "lat": lat} for _, lon, lat in points]}, "particleCount": len(points),
            "integrationMethod": "RK4", "integrationStepSeconds": prereg["time"]["integrationStepSeconds"], "outputStepSeconds": prereg["time"]["outputStepSeconds"],
            "boundaryPolicy": "STOP_AT_FIRST_CROSSING", "metrics": [], "backend": "oceanparcels"}


def map_status(status, lon, lat, area):
    if status in STATUS_MAP:
        return STATUS_MAP[status]
    # runtime OUT_OF_DOMAIN: model-domain boundary → OUT_OF_DOMAIN; forcing-grid edge inside the domain → FORCING_UNAVAILABLE (§5)
    at_boundary = min(abs(lat - area["south"]), abs(lat - area["north"]), abs(lon - area["west"]), abs(lon - area["east"])) <= BOUNDARY_TOL_DEG
    return "OUT_OF_DOMAIN" if at_boundary else "FORCING_UNAVAILABLE"


def export_rows(run_id, alpha_text, ids, result, area, preflight_failed):
    rows = []
    for pid, trajectory in enumerate(result["trajectories"]):
        for s in trajectory["samples"]:
            status = map_status(s["status"], s["lon"], s["lat"], area)
            rows.append([run_id, ids[pid], s["timeUTC"], f"{s['lat']:.6f}", f"{s['lon']:.6f}", alpha_text, status, "true" if status in ("ACTIVE", "COMPLETED") else "false"])
    for did, lon, lat, t0 in preflight_failed:
        rows.append([run_id, did, t0, f"{lat:.6f}", f"{lon:.6f}", alpha_text, "FORCING_UNAVAILABLE", "false"])
    rows.sort(key=lambda r: (r[1], r[2]))
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n"); w.writerow(COLUMNS); w.writerows(rows)
    return buf.getvalue().encode("utf-8"), rows


def execute(prereg, cohort, fm, unit, run, models_v2, cli_v2, validate_dataset, validate_wind_dataset):
    f = next(x for x in fm["runUnits"] if x["windowId"] == unit["windowId"])
    dataset = validate_dataset(load(ROOT / f["hycom"]["normalized"]["file"])); wind = validate_wind_dataset(load(ROOT / f["ncep"]["normalized"]["file"]))
    if dataset["manifest"]["sha256"] != unit["hycomGridSha256"] or wind["manifest"]["sha256"] != unit["ncepGridSha256"]:
        raise Stop("MODEL_RUN_BLOCKED_IMMUTABILITY: grid sha")
    all_points = release_points(cohort, unit)
    run_id = f"{run['runId']}-{unit['windowId']}"
    alpha_text = "0.0007" if run["alpha"] == 0.0007 else "0"
    # release stencil probe (§5 releasePreflightFailure): a failing drifter is recorded, not dropped from the cohort
    from research_runtime.datasets import RegularGrid, ForcingBoundary, utc_seconds
    from research_runtime.wind import WindField
    forcing = models_v2.CombinedForcing(RegularGrid(dataset), WindField(wind), run["alpha"])
    kept, failed = [], []
    for did, lon, lat in all_points:
        try:
            forcing.velocity(utc_seconds(unit["t0"]), lon, lat); kept.append((did, lon, lat))
        except ForcingBoundary as exc:
            failed.append((did, lon, lat, unit["t0"])); log("release", "FORCING_UNAVAILABLE", window=unit["windowId"], drifter=did, runtime=exc.status)
    spec = build_spec(prereg, unit, dataset, wind, run, kept)
    check = models_v2.preflight(spec, dataset, wind)
    record = {"runId": run_id, "windowId": unit["windowId"], "alpha": run["alpha"], "role": run["role"], "drifterCount": unit["drifterCount"], "released": len(kept),
              "releaseFailures": [d for d, *_ in failed], "integrationStepSeconds": spec["integrationStepSeconds"], "outputStepSeconds": spec["outputStepSeconds"],
              "durationSeconds": spec["durationSeconds"], "area": unit["modelArea"], "datasetVersions": spec["datasetVersions"], "windDataset": spec["windDataset"],
              "forcingSha256": unit["forcingSha256"], "gridSha256": dataset["manifest"]["sha256"], "windGridSha256": wind["manifest"]["sha256"],
              "preflight": {"ok": check["ok"], "errors": check["errors"], "estimate": check.get("estimate")}}
    if not check["ok"]:
        record["status"] = "MODEL_RUN_BLOCKED_PREFLIGHT"; log("preflight", "BLOCKED", runId=run_id, errors=check["errors"]); return record
    log("run", "START", runId=run_id, particles=len(kept))
    t = time.perf_counter(); started = utc_now()
    try:
        result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    except Exception as exc:  # protocol §10: preserve, record, one identical retry
        log("run", "EXCEPTION", runId=run_id, error=str(exc))
        try:
            result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id); record["retried"] = True
        except Exception as exc2:
            record.update(status="MODEL_RUN_FAIL", error=str(exc2)); return record
    prov = result["provenance"]
    if prov["windage"]["alpha"] != run["alpha"] or prov["integrationStepSeconds"] != spec["integrationStepSeconds"] or prov["outputStepSeconds"] != spec["outputStepSeconds"]:
        record.update(status="MODEL_RUN_FAIL", error="post-run parameter verification failed"); return record
    out_dir = OUT / unit["windowId"]; out_dir.mkdir(parents=True, exist_ok=True)
    result_path = out_dir / f"{run['runId']}.result.json"
    result_path.write_bytes(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8"))
    csv_bytes, rows = export_rows(run_id, alpha_text, [d for d, *_ in kept], result, unit["modelArea"], failed)
    csv_path = out_dir / f"{run['runId']}.trajectories.csv"; csv_path.write_bytes(csv_bytes)
    counts = {}
    for r in rows:
        counts[r[6]] = counts.get(r[6], 0) + 1
    final = {}
    for tr in result["trajectories"]:
        last = tr["samples"][-1]; key = map_status(last["status"], last["lon"], last["lat"], unit["modelArea"]); final[key] = final.get(key, 0) + 1
    for d, *_ in failed:
        final["FORCING_UNAVAILABLE"] = final.get("FORCING_UNAVAILABLE", 0) + 1
    record.update({"status": "COMPLETED", "startedAtUTC": started, "completedAtUTC": utc_now(), "wallSeconds": round(time.perf_counter() - t, 1),
                   "modelCommit": prov["modelCommit"], "modelSourceSha256": prov["modelSourceSha256"], "specSha256": prov["specSha256"], "resultArraySha256": prov["resultArraySha256"],
                   "environment": prov["environment"], "resultFile": str(result_path.relative_to(ROOT)).replace("\\", "/"), "resultSha256": sha(result_path),
                   "trajectoriesFile": str(csv_path.relative_to(ROOT)).replace("\\", "/"), "trajectoriesSha256": sha(csv_path), "rows": len(rows),
                   "rowStatusCounts": counts, "finalStatusCounts": final, "runtimeStatusCounts": result["summary"]["statusCounts"], "qualityStatus": result["qualityStatus"],
                   "boundaryTimeResolutionSeconds": result["summary"]["boundaryTimeResolutionSeconds"]})
    # separate-process replay (§8): bundle export + `python -m research_runtime.cli_v2 replay`
    bundles = out_dir / "bundles"; bundles.mkdir(exist_ok=True)
    bundle = Path(cli_v2.export_bundle(spec, dataset, wind, result, bundles / f"{run['runId']}.zip"))
    proc = subprocess.run([sys.executable, "-m", "research_runtime.cli_v2", "replay", str(bundle)], capture_output=True, text=True, cwd=SERVICE, env={**__import__("os").environ, "PYTHONPATH": ".;.deps"})
    outcome = {}
    if "{" in proc.stdout:  # cli_v2 prints one indented JSON object; take the first brace onward
        try:
            outcome = json.loads(proc.stdout[proc.stdout.find("{"):])
        except json.JSONDecodeError:
            outcome = {}
    matched = proc.returncode == 0 and outcome.get("matched") is True and outcome.get("resultArraySha256") == prov["resultArraySha256"]
    record["replay"] = {"process": "separate python -m research_runtime.cli_v2 replay", "bundle": str(bundle.relative_to(ROOT)).replace("\\", "/"), "bundleSha256": sha(bundle),
                        "returncode": proc.returncode, "replayResultSha256": outcome.get("resultArraySha256"), "stderrTail": proc.stderr[-400:] if not matched else ""}
    record["replayMatched"] = matched
    if not matched:
        record["status"] = "MODEL_RUN_FAIL"; record["error"] = "replay mismatch"
    log("run", record["status"], runId=run_id, wall=record["wallSeconds"], replayMatched=matched, final=final)
    return record


def load_observations(unit):
    """STEP 15 hourly QC rows for the unit's drifters inside [t0, t0+72h]; exact timestamps only."""
    year = unit["t0"][:4]; obs = {}
    t0 = datetime.strptime(unit["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
    for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{unit['region']}-{year}-q*.csv")):
        with open(path, encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh); next(reader); next(reader)
            for row in reader:
                if row[0] in unit["drifterIds"]:
                    ts = datetime.strptime(row[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    if t0 <= ts <= t1:
                        obs.setdefault(row[0], {})[row[1]] = (float(row[3]), float(row[2]))
    return obs


def metrics(prereg, runs):
    per = {}  # (windowId, drifter) -> {runId: {ts: (lon, lat)}}
    for rec in runs:
        if rec.get("status") != "COMPLETED":
            continue
        with open(ROOT / rec["trajectoriesFile"], encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row["valid"] == "true":
                    per.setdefault((rec["windowId"], row["drifter_id"]), {}).setdefault(rec["alpha"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    drifters = []
    for unit in prereg["runUnits"]:
        obs = load_observations(unit)
        t0 = datetime.strptime(unit["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        hz = {h: (t0 + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ") for h in (24, 48, 72)}
        for did, lon0, lat0 in release_points(load(ROOT / "docs/research/cohort-step16.json"), unit):
            entry = {"windowId": unit["windowId"], "drifterId": did, "runs": {}}
            o = obs.get(did, {})
            entry["M5_observed72hKm"] = round(haversine_km(lon0, lat0, *o[hz[72]]), 3) if hz[72] in o and unit["t0"] in o else "NOT_AVAILABLE"
            series = per.get((unit["windowId"], did), {})
            for alpha in (0.0007, 0.0):
                pts = series.get(alpha, {})
                ts_sorted = sorted(pts)
                m1 = round(haversine_km(lon0, lat0, *pts[hz[72]]), 3) if hz[72] in pts else "NOT_AVAILABLE"
                m2 = round(sum(haversine_km(*pts[a], *pts[b]) for a, b in zip(ts_sorted, ts_sorted[1:])), 3) if len(ts_sorted) > 1 else "NOT_AVAILABLE"
                valid_h = round((datetime.strptime(ts_sorted[-1], "%Y-%m-%dT%H:%M:%SZ") - t0.replace(tzinfo=None)).total_seconds() / 3600, 2) if ts_sorted else 0
                m3 = {h: (round(haversine_km(*pts[hz[h]], *o[hz[h]]), 3) if hz[h] in pts and hz[h] in o else "NOT_AVAILABLE") for h in (24, 48, 72)}
                hourly = [haversine_km(*pts[t], *o[t]) for t in ts_sorted if t in o and t.endswith(":00:00Z")]
                entry["runs"][str(alpha)] = {"M1_endpoint72hKm": m1, "M2_totalPathKm": m2, "validHours": valid_h, "M3_positionErrorKm": m3, "M3_hourlySeries": stats(hourly)}
            a, b = series.get(0.0007, {}), series.get(0.0, {})
            common = sorted(set(a) & set(b))
            sep = [haversine_km(*a[t], *b[t]) for t in common]
            e72 = entry["runs"]["0.0007"]["M3_positionErrorKm"][72], entry["runs"]["0.0"]["M3_positionErrorKm"][72]
            entry["M4_alphaEffect"] = {"separationKm": {h: (round(haversine_km(*a[hz[h]], *b[hz[h]]), 3) if hz[h] in a and hz[h] in b else "NOT_AVAILABLE") for h in (24, 48, 72)},
                                      "separationSeries": stats(sep), "pairedError72hDiffKm_AminusB": round(e72[0] - e72[1], 3) if "NOT_AVAILABLE" not in e72 else "NOT_AVAILABLE"}
            drifters.append(entry)
    def agg(items):
        out = {}
        for alpha in ("0.0007", "0.0"):
            out[alpha] = {"M1_endpoint72hKm": stats([d["runs"][alpha]["M1_endpoint72hKm"] for d in items if d["runs"][alpha]["M1_endpoint72hKm"] != "NOT_AVAILABLE"]),
                          "M2_totalPathKm": stats([d["runs"][alpha]["M2_totalPathKm"] for d in items if d["runs"][alpha]["M2_totalPathKm"] != "NOT_AVAILABLE"]),
                          "M3_positionErrorKm": {h: stats([d["runs"][alpha]["M3_positionErrorKm"][h] for d in items if d["runs"][alpha]["M3_positionErrorKm"][h] != "NOT_AVAILABLE"]) for h in (24, 48, 72)}}
        out["M4_separation72hKm"] = stats([d["M4_alphaEffect"]["separationKm"][72] for d in items if d["M4_alphaEffect"]["separationKm"][72] != "NOT_AVAILABLE"])
        out["M4_pairedError72hDiffKm_AminusB"] = stats([d["M4_alphaEffect"]["pairedError72hDiffKm_AminusB"] for d in items if d["M4_alphaEffect"]["pairedError72hDiffKm_AminusB"] != "NOT_AVAILABLE"])
        out["M5_observed72hKm"] = stats([d["M5_observed72hKm"] for d in items if d["M5_observed72hKm"] != "NOT_AVAILABLE"])
        return out
    return {"perDrifter": drifters, "perRunUnit": {u["windowId"]: agg([d for d in drifters if d["windowId"] == u["windowId"]]) for u in prereg["runUnits"]}, "overall": agg(drifters),
            "definitions": prereg["metrics"], "acceptanceThresholds": "NONE (protocol §9)", "interpretation": "NOT PERFORMED in Phase B"}


def main():
    prereg = load(PREREG)
    started = utc_now()
    try:
        fm = precheck(prereg)
    except Stop as exc:
        log("precheck", "BLOCKED", reason=str(exc)); print(str(exc)); return 2
    log("precheck", "PASS", head=subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip())
    from research_runtime import models_v2, cli_v2
    from research_runtime.datasets import validate_dataset
    from research_runtime.wind import validate_wind_dataset
    cohort = load(ROOT / "docs/research/cohort-step16.json")
    runs = []
    for unit in prereg["runUnits"]:
        for run in prereg["runs"]:
            try:
                runs.append(execute(prereg, cohort, fm, unit, run, models_v2, cli_v2, validate_dataset, validate_wind_dataset))
            except Stop as exc:
                runs.append({"runId": f"{run['runId']}-{unit['windowId']}", "windowId": unit["windowId"], "alpha": run["alpha"], "status": str(exc).split(":")[0], "error": str(exc)})
                log("run", "BLOCKED", runId=f"{run['runId']}-{unit['windowId']}", reason=str(exc))
    complete = all(r.get("status") == "COMPLETED" and r.get("replayMatched") for r in runs) and len(runs) == 8
    status = "MODEL_RUN_PASS" if complete else ("MODEL_RUN_BLOCKED_PREFLIGHT" if any(r.get("status") == "MODEL_RUN_BLOCKED_PREFLIGHT" for r in runs) else "MODEL_RUN_FAIL")
    met = metrics(prereg, runs) if any(r.get("status") == "COMPLETED" for r in runs) else None
    manifest = {"schemaVersion": "1.0", "ruleId": prereg["ruleId"], "status": status, "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "modelRuleSha256": sha(RULE_FILE),
                "modelRuleFileContent": RULE_FILE.read_text(encoding="utf-8").splitlines(), "cohortSha256": LOCKED[ROOT / "docs/research/cohort-step16.json"],
                "forcingManifestSha256": LOCKED[ROOT / "docs/research/step17-forcing-manifest.json"], "aggregateForcingSha256": fm["aggregateForcingSha256"],
                "observationSha256": prereg["immutabilityCheck"]["observationSha256"], "lockCommit": "d505cc5e",
                "modelId": prereg["model"]["modelId"], "modelVersion": prereg["model"]["modelVersion"],
                "modelSourceSha256": next((r["modelSourceSha256"] for r in runs if "modelSourceSha256" in r), None), "modelCommit": next((r["modelCommit"] for r in runs if "modelCommit" in r), None),
                "environment": next((r["environment"] for r in runs if "environment" in r), None), "orchestrator": {"file": "tools/research/run_step18_model.py", "sha256": sha(__file__)},
                "statusMapping": prereg["statusRules"]["runtimeMapping"], "boundaryClassificationToleranceDegrees": BOUNDARY_TOL_DEG,
                "runs": runs, "outputSchema": {"columns": COLUMNS, "rules": prereg["output"]["columnRules"], "rowOrder": prereg["output"]["rowOrder"]},
                "metrics": met, "glorys": "NOT USED", "startedAtUTC": started, "createdAtUTC": utc_now(), "deterministic": True, "randomSeed": None,
                "resultFilesCommitted": False, "interpretation": "NOT PERFORMED", "log": LOG}
    MANIFEST.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    log("manifest", status, file=str(MANIFEST.relative_to(ROOT)))
    return 0 if status == "MODEL_RUN_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())

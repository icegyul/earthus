"""STEP 10 orchestration only: plan → integrity → coverage → runs → comparison → replay → evidence → verdict.

Physics lives in research_runtime.models_v2, statistics in comparison_v2, the verdict in validation_v2,
serialization in evidence_v2. Every phase gate stops the pipeline; nothing is zero-filled or skipped.

    python ../../tools/research/run_v2_cohort.py --dry-run      # phases A-G + parameter/provenance probes, no cohort integration
    python ../../tools/research/run_v2_cohort.py                # full pipeline (only after a PASS dry run)
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

from research_runtime import comparison_v2, evidence_v2, models_v2, validation_v2
from research_runtime import models as v1
from research_runtime.cli_v2 import export_bundle
from research_runtime.datasets import digest, utc_seconds, validate_dataset
from research_runtime.validation import compare
from research_runtime.wind import WindField, validate_wind_dataset

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/research-runtime"
FIX = ROOT / "docs/research/fixtures/gdp-hycom-cohort-201501"
V1_EVID = ROOT / "docs/research/evidence/gdp-hycom-cohort-201501"
V2_EVID = ROOT / "docs/research/evidence/gdp-hycom-cohort-201501-v2"
PLAN = FIX / "validation-plan-v2.json"
PLAN_COMMIT = "23fce909"
QUESTION_ID = "Q-gdp-hycom-cohort-201501-v2-windage"
REGIONS = {"a": "hycom-gofs31-53x-tropical-north-atlantic-20150105-15m", "b": "hycom-gofs31-53x-subtropical-north-atlantic-20150105-15m"}
WIND_FILE = SERVICE / "examples/ncep-doe-r2-10m-wind-natl-20150105.wind.json"
BOOTSTRAP_SEED = 20260905


class Stop(Exception):
    pass


def log(phase, status, **info):
    print(json.dumps({"phase": phase, "status": status, **info}, ensure_ascii=False), flush=True)
    if status not in ("PASS", "INFO", "DONE"):
        raise Stop(f"{phase}: {status}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def phase_a_plan():
    plan = load(PLAN)
    log("A plan load", "PASS", planId=plan["planId"], alphaPrimary=plan["windage"]["alphaPrimary"], sensitivity=plan["windage"]["alphaSensitivity"])
    return plan


def phase_b_plan_integrity(plan):
    committed = subprocess.run(["git", "show", f"{PLAN_COMMIT}:{PLAN.relative_to(ROOT).as_posix()}"], capture_output=True, cwd=ROOT).stdout
    working = PLAN.read_bytes()
    if not committed:
        log("B plan integrity", "FAIL", reason="plan not found in commit " + PLAN_COMMIT)
    if hashlib.sha256(committed).hexdigest() != hashlib.sha256(working).hexdigest():
        log("B plan integrity", "FAIL", reason="working plan differs from the pre-registered commit")
    if plan["model"]["modelId"] != models_v2.MODEL_ID or plan["model"]["modelVersion"] != models_v2.MODEL_VERSION:
        log("B plan integrity", "FAIL", reason="plan model id/version differs from the registered V2 adapter")
    log("B plan integrity", "PASS", planSha256=sha(PLAN), planCommit=PLAN_COMMIT)
    return sha(PLAN)


def phase_c_observations(immutable):
    obs = {}
    tracks_sha = sha(FIX / "tracks.csv")
    if tracks_sha != immutable["sha256"]["tracks.csv"]:
        log("C observation SHA", "FAIL", file="tracks.csv")
    for region in REGIONS:
        path = FIX / f"region-{region}" / "observations.json"
        if sha(path) != immutable["sha256"][f"region-{region}/observations.json"]:
            log("C observation SHA", "FAIL", file=path.name, region=region)
        package = load(path)
        v1_report = load(V1_EVID / f"comparison-region-{region}.json")
        if sha(V1_EVID / f"comparison-region-{region}.json") != immutable["sha256"][f"comparison-region-{region}.json"]:
            log("C observation SHA", "FAIL", file=f"comparison-region-{region}.json (V1 frozen)")
        if package["manifest"]["sha256"] != v1_report["observationTracksSha256"]:
            log("C observation SHA", "FAIL", reason="observation tracks hash differs from V1 frozen comparison")
        obs[region] = {"package": package, "source": (FIX / "tracks.csv").read_bytes(), "v1Report": v1_report, "tracksSha256": package["manifest"]["sha256"]}
    log("C observation SHA", "PASS", tracksCsvSha256=tracks_sha, tracks={r: obs[r]["tracksSha256"] for r in obs})
    return obs


def phase_d_hycom(immutable, plan):
    datasets = {}
    for region, dataset_id in REGIONS.items():
        path = SERVICE / "examples" / f"{dataset_id}.dataset.json"
        if not path.exists():
            log("D HYCOM SHA", "BLOCKED", reason=f"{path.name} missing; regenerate with tools/research/build_gdp_hycom_cohort.py from the hashed .nc originals")
        dataset = validate_dataset(load(path))
        expected = immutable["datasetSha256"][region]
        if dataset["manifest"]["sha256"] != expected or plan["datasets"]["current"][f"region{region.upper()}"] != expected:
            log("D HYCOM SHA", "FAIL", region=region, got=dataset["manifest"]["sha256"], expected=expected)
        for source in dataset["manifest"]["processingHistory"][0]["sourceFiles"]:
            if sha(FIX / f"region-{region}" / source["path"]) != source["sha256"] or immutable["sha256"][f"region-{region}/{source['path']}"] != source["sha256"]:
                log("D HYCOM SHA", "FAIL", region=region, file=source["path"])
        datasets[region] = dataset
    log("D HYCOM SHA", "PASS", datasets={r: d["manifest"]["sha256"] for r, d in datasets.items()})
    return datasets


def phase_e_wind(plan):
    if not WIND_FILE.exists():
        log("E wind SHA", "BLOCKED", reason="wind dataset missing; run tools/research/build_wind_dataset.py")
    wind = validate_wind_dataset(load(WIND_FILE))
    files = {"uwnd": FIX / "wind-ncep-r2/uwnd.10m.gauss.2015-0105-0108.nc", "vwnd": FIX / "wind-ncep-r2/vwnd.10m.gauss.2015-0105-0108.nc"}
    for key, path in files.items():
        if sha(path) != plan["datasets"]["wind"]["sourceSha256"][key]:
            log("E wind SHA", "FAIL", file=path.name, reason="original wind file differs from the pre-registered hash")
    sources = wind["manifest"]["processingHistory"][0]["sourceFiles"]
    if {s["path"]: s["sha256"] for s in sources} != {p.name: sha(p) for p in files.values()}:
        log("E wind SHA", "FAIL", reason="normalized wind manifest does not cite the pre-registered originals")
    log("E wind SHA", "PASS", windGridSha256=wind["manifest"]["sha256"], windSourceSha256=wind["manifest"]["sourceSha256"],
        window=[wind["grid"]["timeUTC"][0], wind["grid"]["timeUTC"][-1]], box=[wind["grid"]["lon"][0], wind["grid"]["lon"][-1], wind["grid"]["lat"][0], wind["grid"]["lat"][-1]])
    return wind


def build_specs(plan, obs, datasets, wind, alpha):
    specs = {}
    for region, dataset_id in REGIONS.items():
        base = load(SERVICE / "examples" / f"{dataset_id}.experiment.json")
        tracks = obs[region]["package"]["tracks"]
        points = [{"lon": t["samples"][0]["lon"], "lat": t["samples"][0]["lat"]} for t in tracks]
        if base["releaseDefinition"]["points"] != points:
            log("F cohort", "FAIL", region=region, reason="release points differ from the frozen observation starts")
        spec = dict(base)
        spec.update({"modelId": models_v2.MODEL_ID, "modelVersion": models_v2.MODEL_VERSION, "questionId": QUESTION_ID,
                     "validationPlanId": plan["planId"], "question": plan["question"],
                     "windDataset": {"datasetId": wind["manifest"]["datasetId"], "version": wind["manifest"]["version"]},
                     "windage": {"alpha": alpha}, "backend": "oceanparcels"})
        specs[region] = spec
    return specs


def phase_f_cohort(plan, obs):
    total = sum(len(obs[r]["package"]["tracks"]) for r in obs)
    if total != plan["cohort"]["tracks"] or len(obs) != plan["cohort"]["regions"]:
        log("F cohort", "FAIL", tracks=total, regions=len(obs))
    for region in obs:
        for track in obs[region]["package"]["tracks"]:
            if track["drogueStatus"] != "ATTACHED" or track["samples"][0]["timeUTC"] != plan["cohort"]["window"]["startUTC"]:
                log("F cohort", "FAIL", region=region, track=track["trackId"])
    log("F cohort", "PASS", tracks=total, regions=len(obs), perRegion={r: len(obs[r]["package"]["tracks"]) for r in obs})


def phase_g_check_a(plan, obs, datasets, wind, specs):
    """CHECK A on actual evaluation needs: every hourly observed position, every RK4 stage instant, the release points and the area."""
    field = WindField(wind)
    report = {"regions": {}, "problems": []}
    for region, spec in specs.items():
        start = utc_seconds(spec["startTimeUTC"]); end = start + spec["durationSeconds"]
        step = spec["integrationStepSeconds"]
        instants = [start + k * step for k in range(int((end - start) / step) + 1)] + [start + k * step + step / 2 for k in range(int((end - start) / step))]
        if min(instants) < field.times[0] or max(instants) > field.times[-1]:
            report["problems"].append({"region": region, "kind": "WIND_TIME_OUTSIDE", "need": [spec["startTimeUTC"], end], "have": [wind["grid"]["timeUTC"][0], wind["grid"]["timeUTC"][-1]]})
        checked = 0
        for track in obs[region]["package"]["tracks"]:
            for sample in track["samples"]:
                try:
                    field.velocity(utc_seconds(sample["timeUTC"]), sample["lon"], sample["lat"])
                    checked += 1
                except Exception as exc:  # ForcingBoundary carries .reason
                    report["problems"].append({"region": region, "track": track["trackId"], "timeUTC": sample["timeUTC"], "lon": sample["lon"], "lat": sample["lat"],
                                               "kind": getattr(exc, "reason", str(exc))})
        pre = models_v2.wind_coverage(spec, datasets[region], wind)
        if not pre["ok"]:
            report["problems"].extend([dict(p, region=region) for p in pre["problems"] + pre["experimentAreaProblems"]])
        report["regions"][region] = {"observedSamplesEvaluable": checked, "rk4InstantsChecked": len(instants), "releaseAndAreaCoverage": pre["ok"]}
    report["ok"] = not report["problems"]
    log("G CHECK A wind coverage", "PASS" if report["ok"] else "FAIL", **{k: v for k, v in report.items() if k != "problems"}, problemCount=len(report["problems"]))
    return report


def probe_provenance_schema():
    """Synthetic 1-particle, 1-hour V2 run (NOT the cohort) to prove the provenance keys exist before the real runs."""
    from tests.test_v2_windage import current, spec, wind as synthetic_wind  # reuse the unit-test fixtures
    result = models_v2.run_experiment(spec(alpha=0.0007), current(), synthetic_wind(), run_id="probe")
    required = ["questionId", "validationPlanId", "modelId", "modelVersion", "modelCommit", "modelSourceSha256", "datasetId", "datasetVersion", "datasetSha256",
                "windDatasetId", "windDatasetVersion", "windDatasetSha256", "windSourceSha256", "windReaderVersion", "windage", "windTimeInterpolation",
                "windSpaceInterpolation", "integrationMethod", "runId", "resultArraySha256", "environment"]
    missing = [k for k in required if k not in result["provenance"]] + [f"windage.{k}" for k in ("alpha", "unit", "source", "sourceReference", "selectionBasis") if k not in result["provenance"]["windage"]]
    return {"ok": not missing, "missing": missing, "probe": "synthetic 1 particle × 1 h; no cohort integration"}


def run_region(spec, dataset, wind, obs_entry, region, alpha, immutable_plan_sha, obs_sha_all):
    created = evidence_v2.utc_now()
    run_id = hashlib.sha256(f"{spec['validationPlanId']}:{region}:{alpha}:{created}".encode()).hexdigest()[:32]
    started = evidence_v2.utc_now(); t0 = time.perf_counter()
    result = models_v2.run_experiment(spec, dataset, wind, run_id=run_id)
    completed = evidence_v2.utc_now()
    report = compare(result, obs_entry["package"], obs_entry["source"])
    prov = result["provenance"]
    if prov["windage"]["alpha"] != alpha or prov["modelId"] != models_v2.MODEL_ID or prov["modelVersion"] != models_v2.MODEL_VERSION:
        raise Stop("post-run parameter verification failed")
    record = {"runId": run_id, "region": region, "alpha": alpha, "modelId": prov["modelId"], "modelVersion": prov["modelVersion"], "modelCommit": prov["modelCommit"],
              "modelSourceSha256": prov["modelSourceSha256"], "validationPlanSha256": immutable_plan_sha, "observationSha256": obs_entry["tracksSha256"],
              "HYCOMSha256": prov["datasetSha256"], "windSha256": prov["windDatasetSha256"], "parametersSha256": digest(spec), "resultSha256": prov["resultArraySha256"],
              "environment": prov["environment"], "createdAtUTC": created, "startedAtUTC": started, "completedAtUTC": completed, "wallSeconds": round(time.perf_counter() - t0, 1),
              "qualityStatus": result["qualityStatus"], "statusCounts": result["summary"]["statusCounts"],
              "eligibleTracks": report["eligibleTracks"], "excludedTracks": report["excludedTracks"], "unavailableHorizons": report["unavailableHorizons"]}
    return record, result, report, spec


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--evidence-dir", default=str(V2_EVID))
    args = parser.parse_args(argv)
    try:
        immutable = load(V1_EVID / "IMMUTABLE-V1.json")
        plan = phase_a_plan()
        plan_sha = phase_b_plan_integrity(plan)
        obs = phase_c_observations(immutable)
        datasets = phase_d_hycom(immutable, plan)
        wind = phase_e_wind(plan)
        phase_f_cohort(plan, obs)
        primary = plan["windage"]["alphaPrimary"]
        specs = build_specs(plan, obs, datasets, wind, primary)
        coverage = phase_g_check_a(plan, obs, datasets, wind, specs)
        for region, spec in specs.items():
            check = models_v2.preflight(spec, datasets[region], wind)
            if not check["ok"]:
                log("G preflight", "FAIL", region=region, errors=check["errors"])
        log("PRIMARY parameters", "INFO", modelId=models_v2.MODEL_ID, modelVersion=models_v2.MODEL_VERSION, alpha=primary,
            windDataset=specs["a"]["windDataset"], validationPlanId=plan["planId"], questionId=QUESTION_ID, v1SourceSha256=v1.model_source_sha256(),
            v2SourceSha256=models_v2.model_source_sha256())
        probe = probe_provenance_schema()
        log("provenance schema probe", "PASS" if probe["ok"] else "FAIL", **probe)
        evidence_dir = Path(args.evidence_dir)
        log("output path", "PASS", evidenceDir=str(evidence_dir), exists=evidence_dir.exists())
        if args.dry_run:
            log("DRY RUN", "DONE", result="PASS", note="no cohort integration executed")
            return 0
        # ---- PHASE H: primary ----
        package = evidence_v2.EvidencePackage(evidence_dir)
        package.copy("validation-plan-v2.json", PLAN)
        primary_records, primary_results, primary_reports, rows_primary = {}, {}, {}, []
        for region, spec in specs.items():
            rec, res, rep, _ = run_region(spec, datasets[region], wind, obs[region], region, primary, plan_sha, None)
            primary_records[region], primary_results[region], primary_reports[region] = rec, res, rep
            rows_primary.extend(comparison_v2.paired_v1_v2(obs[region]["v1Report"], rep, region))
            log("H primary run", "INFO", region=region, runId=rec["runId"], quality=rec["qualityStatus"], statusCounts=rec["statusCounts"], wallSeconds=rec["wallSeconds"], resultSha256=rec["resultSha256"])
        missing_forcing = {r: primary_records[r]["statusCounts"].get("MISSING_FORCING", 0) for r in primary_records}
        if any(missing_forcing.values()):
            log("H primary missing-forcing policy", "INFO", missingForcing=missing_forcing, policy="particles stopped at first missing wind/current; never zero-filled; horizons after stop are UNAVAILABLE")
        # ---- PHASE I: sensitivity ----
        sensitivity_records, rows_by_alpha = [], {primary: rows_primary}
        for alpha in plan["windage"]["alphaSensitivity"]:
            if alpha == primary:
                continue
            rows = []
            for region, spec in build_specs(plan, obs, datasets, wind, alpha).items():
                rec, res, rep, _ = run_region(spec, datasets[region], wind, obs[region], region, alpha, plan_sha, None)
                rec["role"] = "SENSITIVITY"
                sensitivity_records.append(rec)
                rows.extend(comparison_v2.paired_v1_v2(obs[region]["v1Report"], rep, region))
                log("I sensitivity run", "INFO", region=region, alpha=alpha, runId=rec["runId"], quality=rec["qualityStatus"], wallSeconds=rec["wallSeconds"])
            rows_by_alpha[alpha] = rows
        # ---- PHASE J/K/L ----
        paired = comparison_v2.paired_summary(rows_primary)
        baselines = comparison_v2.baseline_summary(rows_primary)
        boot = comparison_v2.bootstrap(rows_primary, BOOTSTRAP_SEED)
        log("J/K/L comparison", "INFO", paired72=paired["72"], baselines72={k: baselines["72"][k] for k in ("n", "model", "stationary", "initialVelocity")})
        # ---- PHASE M: separate-process replay of the primary runs ----
        replay = {"matched": True, "runs": []}
        bundles = SERVICE / ".local-data" / "v2-bundles"
        for region in specs:
            bundle = export_bundle(specs[region], datasets[region], wind, primary_results[region], bundles / f"primary-{region}-{primary_records[region]['runId']}.zip")
            proc = subprocess.run([sys.executable, "-m", "research_runtime.cli_v2", "replay", str(bundle)], capture_output=True, text=True, cwd=SERVICE,
                                  env={**__import__("os").environ, "PYTHONPATH": f"{SERVICE};{SERVICE / '.deps'}"})
            outcome = {}
            try:
                outcome = json.loads(proc.stdout.strip().splitlines()[-1]) if proc.stdout.strip() else {}
            except json.JSONDecodeError:
                pass
            ok = proc.returncode == 0 and outcome.get("matched") is True and outcome.get("resultArraySha256") == primary_records[region]["resultSha256"]
            replay["runs"].append({"region": region, "runId": primary_records[region]["runId"], "bundle": bundle.name, "bundleSha256": sha(bundle), "process": "separate python -m research_runtime.cli_v2 replay",
                                   "returncode": proc.returncode, "matched": ok, "replayResultSha256": outcome.get("resultArraySha256"), "expectedResultSha256": primary_records[region]["resultSha256"],
                                   "stderr": proc.stderr[-800:] if not ok else ""})
            replay["matched"] = replay["matched"] and ok
            log("M replay", "INFO", region=region, matched=ok)
        # ---- PHASE N: evidence ----
        package.put("model.json", {"primary": models_v2.describe(), "basedOn": v1.describe(), "v1SourceSha256": v1.model_source_sha256(), "v2SourceSha256": models_v2.model_source_sha256(),
                                   "comparatorSourceSha256": sha(SERVICE / "research_runtime/validation.py"), "comparatorNote": "research_runtime.validation.compare — identical function for V1 (frozen) and V2"})
        package.put("observation.json", {r: {"manifest": obs[r]["package"]["manifest"], "tracks": [t["trackId"] for t in obs[r]["package"]["tracks"]], "tracksSha256": obs[r]["tracksSha256"]} for r in obs})
        package.put("dataset.json", {r: datasets[r]["manifest"] for r in datasets})
        package.put("wind-dataset.json", wind["manifest"])
        package.put("parameters.json", {"primary": {"alpha": primary, "source": models_v2.WINDAGE_SOURCE, "reference": models_v2.WINDAGE_REFERENCE, "unit": models_v2.WINDAGE_UNIT},
                                        "sensitivity": [a for a in plan["windage"]["alphaSensitivity"] if a != primary], "specs": {r: specs[r] for r in specs}, "specSha256": {r: digest(specs[r]) for r in specs}})
        package.put("run-primary.json", {"role": "PRIMARY", "alpha": primary, "runs": primary_records, "coverage": coverage})
        package.put("run-sensitivity.json", {"role": "SENSITIVITY — never changes the primary verdict", "runs": sensitivity_records})
        package.put("comparison-v1-v2.json", {"role": "PRIMARY", "rows": rows_primary, "summary": paired, "v1Reports": {r: obs[r]["v1Report"]["modelResultArraySha256"] for r in obs}})
        package.put("comparison-baselines.json", {"role": "PRIMARY", "summary": baselines, "metricDefinition": primary_reports["a"]["method"]})
        package.put("bootstrap.json", boot)
        package.put("sensitivity.json", {"table": comparison_v2.sensitivity_table(rows_by_alpha, primary), "rowsByAlpha": {str(a): r for a, r in rows_by_alpha.items()}})
        package.put("replay.json", replay)
        for region in specs:
            package.put(f"comparison-region-{region}-v2.json", primary_reports[region])
        # ---- PHASE O: verdict ----
        complete = all(r["totalTracks"] == r["eligibleTracks"] + len(r["excludedTracks"]) for r in primary_reports.values())
        result = validation_v2.verdict(plan, rows_primary, primary, len(specs), set(package.files) | {"verdict.json"}, replay, complete)
        package.put("verdict.json", result)
        package.manifest(lineage=["questionId " + QUESTION_ID, "validation-plan-v2.json " + plan_sha, "observation.json", "dataset.json", "wind-dataset.json", "model.json", "parameters.json",
                                  "run-primary.json", "comparison-v1-v2.json", "comparison-baselines.json", "replay.json", "verdict.json"],
                         external={"IMMUTABLE-V1.json": sha(V1_EVID / "IMMUTABLE-V1.json"), "tracks.csv": sha(FIX / "tracks.csv"), "planCommit": PLAN_COMMIT,
                                   "hycomDatasetSha256": {r: datasets[r]["manifest"]["sha256"] for r in datasets}, "windGridSha256": wind["manifest"]["sha256"]})
        log("O verdict", "DONE", verdict=result["verdict"], failed=result["failedCriteria"], v2Accepted=result["v2Accepted"], v2ImprovesV1=result["v2ImprovesV1"])
        return 0
    except Stop as stop:
        print(json.dumps({"phase": "PIPELINE", "status": "STOPPED", "reason": str(stop)}), flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

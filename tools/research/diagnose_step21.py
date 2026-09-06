"""STEP 21 — MODEL ADEQUACY & ERROR SOURCE DIAGNOSIS (descriptive only). Reads the frozen STEP 20 calibration trajectories
(alpha 0 and 0.002 only), the frozen STEP 20 B-6 holdout trajectories (12 evaluable drifters; KE-H2 excluded, recorded), the STEP 15
observations and the locked release positions. Computes, per drifter x horizon (24/48/72 h) x alpha: position error, model endpoint
displacement, observed displacement, model path length (900 s and hourly-subsampled), observed path length (hourly), path-excess ratio,
displacement/path ratios, error growth (E48-E24, E72-E48, E72/E24), displacement bearings and absolute bearing difference, signed
east-west / north-south endpoint offsets (km), growth class A/B/C/D, paired alpha delta (consistency-checked against the STEP 20 tables),
delta sign persistence, cumulative alpha separation and windage projection toward the observation. Unit tables, highest-error cases,
six SVG figures. No thresholds, no removal, no reselection, no p-values, no interpretation. Haversine R = 6371008.8 m.
`--out DIR` for the reproducibility re-run (all outputs deterministic; no timestamps in table/summary/figures)."""
import csv
import hashlib
import io
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
RADIUS_M = 6371008.8
NA = "NOT_AVAILABLE"
H = (24, 48, 72)
ALPHAS = {"a002": 0.002, "a0": 0.0}
LOCKED = {"docs/research/step20-preregistration.json": "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          "docs/research/step20-calibration-manifest.json": "41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498", "docs/research/step20-calibration-table.csv": "a15df2a059ba11e5e3900f10b29ad3cfed1dca610c8ad421898374cd31a8425f",
          "docs/research/step20-b6-holdout-manifest.json": "968da55a4553c00f373d6a0f26bc2b1c9e3f3af421d37db7a1e58e99a5727653", "docs/research/step20-b6-holdout-table.csv": "d21d029bba4e09a15ef19a393f0d8389df0e5750cb1459ed0b1e92372aeea681",
          "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hav_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * RADIUS_M * math.asin(math.sqrt(a)) / 1000


def bearing_deg(lon1, lat1, lon2, lat2):
    """Initial great-circle bearing from point 1 to point 2, degrees clockwise from north in [0, 360)."""
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2); y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def bearing_diff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def local_km(lon, lat, lon_ref, lat_ref):
    """East / north offsets (km) of (lon, lat) relative to (lon_ref, lat_ref), equirectangular at the reference latitude."""
    return (lon - lon_ref) * math.cos(math.radians(lat_ref)) * math.pi / 180 * RADIUS_M / 1000, (lat - lat_ref) * math.pi / 180 * RADIUS_M / 1000


def median(v):
    v = sorted(x for x in v if x is not None and x != NA)
    if not v:
        return None
    mid = len(v) // 2
    return round(v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2, 3)


def stats(v):
    w = sorted(x for x in v if x is not None and x != NA)
    return {"n": len(w), "median": median(w), "mean": round(sum(w) / len(w), 3) if w else None, "min": round(w[0], 3) if w else None, "max": round(w[-1], 3) if w else None}


def r3(x):
    return NA if x == NA or x is None else round(x, 3)


def sign(x):
    return NA if x == NA else ("neg" if x < -1e-6 else ("pos" if x > 1e-6 else "zero"))


def observations(region, year, ids, t0, t1):
    obs = {}
    for path in sorted((ROOT / "data/research/step15/noaa-gdp-hourly-qc").glob(f"{region}-{year}-q*.csv")):
        with open(path, encoding="utf-8", newline="") as fh:
            rd = csv.reader(fh); next(rd); next(rd)
            for row in rd:
                if row[0] in ids:
                    t = datetime.strptime(row[1], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    if t0 <= t <= t1:
                        obs.setdefault(row[0], {})[row[1]] = (float(row[3]), float(row[2]))
    return obs


def load_tracks(csv_path):
    tracks = {}
    with open(csv_path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["valid"] == "true":
                tracks.setdefault(row["drifter_id"], {})[row["timestamp"]] = (float(row["lon"]), float(row["lat"]))
    return tracks


def path_len(pts, ts_list):
    seq = [pts[t] for t in ts_list if t in pts]
    return sum(hav_km(*a, *b) for a, b in zip(seq, seq[1:])) if len(seq) == len(ts_list) else NA


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    figdir = out / "step21-diagnostic-figures"; figdir.mkdir(parents=True, exist_ok=True)
    for rel, expected in LOCKED.items():
        if sha(ROOT / rel) != expected:
            print(json.dumps({"status": "STEP21_BLOCKED_IMMUTABILITY", "file": rel})); return 2
    p20 = load(ROOT / "docs/research/step20-preregistration.json"); cal = load(ROOT / "docs/research/step20-calibration-manifest.json"); hold = load(ROOT / "docs/research/step20-b6-holdout-manifest.json")
    cohort = load(ROOT / "docs/research/cohort-step16.json")
    import run_step18b_model as r18
    # ---- assemble datasets: (dataset, unit, region, year, t0, releases{id:(lon,lat)}, tracks{alphaKey:{id:{ts:(lon,lat)}}}) ----
    groups = []
    for u in p20["calibration"]["runUnits"]:
        rel = {d: (lon, lat) for d, lon, lat in r18.release_points(cohort, u)}
        tr = {}
        for key, a in ALPHAS.items():
            run = next(r for r in cal["runs"] if r["windowId"] == u["windowId"] and float(r["alpha"]) == a)
            if sha(ROOT / run["trajectoriesFile"]) != run["trajectoriesSha256"]:
                print(json.dumps({"status": "STEP21_BLOCKED_IMMUTABILITY", "file": run["trajectoriesFile"]})); return 2
            tr[key] = load_tracks(ROOT / run["trajectoriesFile"])
        groups.append(("CALIBRATION", u["windowId"], u["region"], u["t0"], rel, tr))
    excluded = []
    for u in p20["holdout"]["runUnits"]:
        runs = [r for r in hold["runs"] if r["windowId"] == u["windowId"]]
        if not any(r.get("modeled") for r in runs):
            excluded.append({"unit": u["windowId"], "n": u["drifterCount"], "status": runs[0]["status"], "missingRequiredOceanFrames": runs[0].get("missingRequiredOceanFrames"), "reason": "forcing unavailable in STEP 20 B-3/B-6; no trajectory exists; excluded from every trajectory-based diagnostic"}); continue
        rel = {d["drifterId"]: (d["lon"], d["lat"]) for d in u["releasePositions"]}
        tr = {}
        for key, a in ALPHAS.items():
            run = next(r for r in runs if float(r["alpha"]) == a)
            if sha(ROOT / run["trajectoriesFile"]) != run["trajectoriesSha256"]:
                print(json.dumps({"status": "STEP21_BLOCKED_IMMUTABILITY", "file": run["trajectoriesFile"]})); return 2
            tr[key] = load_tracks(ROOT / run["trajectoriesFile"])
        groups.append(("HOLDOUT", u["windowId"], u["region"], u["t0"], rel, tr))
    # ---- per-drifter metrics ----
    rows = []; tracks_for_fig = {}
    for dataset, unit, region, t0s, rel, tr in groups:
        t0 = datetime.strptime(t0s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = t0 + timedelta(hours=72)
        obs = observations(region, t0s[:4], set(rel), t0, t1)
        hourly = {h: [(t0 + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(h + 1)] for h in H}
        q15 = {h: [(t0 + timedelta(minutes=15 * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(4 * h + 1)] for h in H}
        ts = {h: hourly[h][-1] for h in H}
        for did in sorted(rel):
            lon0, lat0 = rel[did]; o = obs.get(did, {}); rec = {"drifter_id": did, "dataset": dataset, "unit": unit, "region": region}
            for h in H:
                ob = o.get(ts[h]); rec[f"obs_disp_{h}h"] = hav_km(lon0, lat0, *ob) if ob else NA
                rec[f"obs_bearing_{h}h"] = bearing_deg(lon0, lat0, *ob) if ob and rec[f"obs_disp_{h}h"] >= 1e-6 else NA
                rec[f"obs_path_hourly_{h}h"] = path_len(o, hourly[h])
            for key in ALPHAS:
                pts = tr[key].get(did, {})
                for h in H:
                    pm, ob = pts.get(ts[h]), o.get(ts[h])
                    rec[f"E{h}_{key}"] = hav_km(*pm, *ob) if pm and ob else NA
                    rec[f"model_disp_{h}h_{key}"] = hav_km(lon0, lat0, *pm) if pm else NA
                    rec[f"model_path_{h}h_{key}"] = path_len(pts, q15[h]); rec[f"model_path_hourly_{h}h_{key}"] = path_len(pts, hourly[h])
                    rec[f"model_bearing_{h}h_{key}"] = bearing_deg(lon0, lat0, *pm) if pm and rec[f"model_disp_{h}h_{key}"] >= 1e-6 else NA
                    rec[f"bearing_diff_{h}h_{key}"] = bearing_diff(rec[f"model_bearing_{h}h_{key}"], rec[f"obs_bearing_{h}h"]) if NA not in (rec[f"model_bearing_{h}h_{key}"], rec[f"obs_bearing_{h}h"]) else NA
                    if pm and ob:
                        dx, dy = local_km(pm[0], pm[1], ob[0], ob[1]); rec[f"east_offset_{h}h_{key}"] = dx; rec[f"north_offset_{h}h_{key}"] = dy
                    else:
                        rec[f"east_offset_{h}h_{key}"] = rec[f"north_offset_{h}h_{key}"] = NA
                    dm, do, lm, lo = rec[f"model_disp_{h}h_{key}"], rec[f"obs_disp_{h}h"], rec[f"model_path_hourly_{h}h_{key}"], rec[f"obs_path_hourly_{h}h"]
                    rec[f"disp_ratio_{h}h_{key}"] = dm / do if NA not in (dm, do) and do >= 1e-6 else NA
                    rec[f"path_ratio_hourly_{h}h_{key}"] = lm / lo if NA not in (lm, lo) and lo >= 1e-6 else NA
                    rec[f"path_excess_{h}h_{key}"] = rec[f"model_path_{h}h_{key}"] / dm if NA not in (rec[f"model_path_{h}h_{key}"], dm) and dm >= 1e-6 else NA
                    rec[f"endpoint_over_path_{h}h_{key}"] = dm / rec[f"model_path_{h}h_{key}"] if NA not in (rec[f"model_path_{h}h_{key}"], dm) and rec[f"model_path_{h}h_{key}"] >= 1e-6 else NA
                e24, e48, e72 = rec[f"E24_{key}"], rec[f"E48_{key}"], rec[f"E72_{key}"]
                rec[f"growth_48_24_{key}"] = e48 - e24 if NA not in (e24, e48) else NA
                rec[f"growth_72_48_{key}"] = e72 - e48 if NA not in (e48, e72) else NA
                rec[f"growth_ratio_72_24_{key}"] = e72 / e24 if NA not in (e24, e72) and e24 >= 1e-6 else NA
                rec[f"growth_class_{key}"] = "D" if NA in (e24, e48, e72) else ("A" if e24 <= e48 <= e72 else ("B" if e48 < e24 else "C"))
            for h in H:
                a, b = rec[f"E{h}_a002"], rec[f"E{h}_a0"]; rec[f"delta_{h}h"] = a - b if NA not in (a, b) else NA
                pa, pb, ob = tr["a002"].get(did, {}).get(ts[h]), tr["a0"].get(did, {}).get(ts[h]), o.get(ts[h])
                rec[f"alpha_sep_{h}h"] = hav_km(*pa, *pb) if pa and pb else NA
                if pa and pb and ob:
                    wx, wy = local_km(pa[0], pa[1], pb[0], pb[1]); ex, ey = local_km(ob[0], ob[1], pb[0], pb[1]); e2 = ex * ex + ey * ey
                    rec[f"windage_toward_obs_{h}h"] = (wx * ex + wy * ey) / e2 if e2 >= 1e-12 else NA
                else:
                    rec[f"windage_toward_obs_{h}h"] = NA
            signs = [sign(rec[f"delta_{h}h"]) for h in H]
            rec["delta_sign_24_48_72"] = "/".join(signs); rec["delta_sign_persistent"] = NA if NA in signs else (signs[0] == signs[1] == signs[2] and signs[0] != "zero")
            rec["delta_sign_changes"] = NA if NA in signs else sum(1 for a, b in zip(signs, signs[1:]) if a != b)
            rows.append(rec)
            tracks_for_fig[(dataset, unit, did)] = {"obs": [o[t] for t in hourly[72] if t in o], "a002": [tr["a002"].get(did, {}).get(t) for t in hourly[72]], "a0": [tr["a0"].get(did, {}).get(t) for t in hourly[72]], "rel": (lon0, lat0)}
    rows.sort(key=lambda r: (r["dataset"], r["unit"], r["drifter_id"]))
    # ---- STEP 20 consistency (calibration table / B-6 table) ----
    ref = {}
    with open(ROOT / "docs/research/step20-calibration-table.csv", encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            for h in H:
                ref[("CALIBRATION", r["drifter_id"], h)] = (float(r[f"error_{h}h_alpha0.002"]), float(r[f"error_{h}h_alpha0"]))
    with open(ROOT / "docs/research/step20-b6-holdout-table.csv", encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            for h in H:
                ref[("HOLDOUT", r["drifter_id"], h)] = (float(r[f"error_A_{h}h"]), float(r[f"error_B_{h}h"]))
    incons = []
    for rec in rows:
        for h in H:
            ra, rb = ref[(rec["dataset"], rec["drifter_id"], h)]
            if abs(rec[f"E{h}_a002"] - ra) > 0.0015 or abs(rec[f"E{h}_a0"] - rb) > 0.0015:
                incons.append({"drifter_id": rec["drifter_id"], "horizon": h, "step21": (r3(rec[f"E{h}_a002"]), r3(rec[f"E{h}_a0"])), "step20": (ra, rb)})
    # ---- table ----
    cols = ["drifter_id", "dataset", "unit", "region"] + [k for k in rows[0] if k not in ("drifter_id", "dataset", "unit", "region")]
    buf = io.StringIO(newline=""); w = csv.writer(buf, lineterminator="\n"); w.writerow(cols)
    for rec in rows:
        w.writerow([rec[c] if isinstance(rec[c], (str, bool)) or rec[c] is None else r3(rec[c]) for c in cols])
    table = buf.getvalue().encode("utf-8"); (out / "step21-diagnostic-table.csv").write_bytes(table)
    # ---- aggregates ----
    def block(items):
        b = {"n": len(items), "smallN": len(items) < 10}
        for key in ALPHAS:
            kb = {}
            for h in H:
                kb[f"E{h}"] = stats([r[f"E{h}_{key}"] for r in items]); kb[f"bearing_diff_{h}h"] = stats([r[f"bearing_diff_{h}h_{key}"] for r in items])
                kb[f"east_offset_{h}h"] = stats([r[f"east_offset_{h}h_{key}"] for r in items]); kb[f"north_offset_{h}h"] = stats([r[f"north_offset_{h}h_{key}"] for r in items])
                kb[f"model_disp_{h}h"] = stats([r[f"model_disp_{h}h_{key}"] for r in items]); kb[f"disp_ratio_{h}h"] = stats([r[f"disp_ratio_{h}h_{key}"] for r in items])
                kb[f"path_ratio_hourly_{h}h"] = stats([r[f"path_ratio_hourly_{h}h_{key}"] for r in items]); kb[f"path_excess_{h}h"] = stats([r[f"path_excess_{h}h_{key}"] for r in items])
                kb[f"east_sign_counts_{h}h"] = {"east": sum(1 for r in items if r[f"east_offset_{h}h_{key}"] != NA and r[f"east_offset_{h}h_{key}"] > 0), "west": sum(1 for r in items if r[f"east_offset_{h}h_{key}"] != NA and r[f"east_offset_{h}h_{key}"] < 0)}
                kb[f"north_sign_counts_{h}h"] = {"north": sum(1 for r in items if r[f"north_offset_{h}h_{key}"] != NA and r[f"north_offset_{h}h_{key}"] > 0), "south": sum(1 for r in items if r[f"north_offset_{h}h_{key}"] != NA and r[f"north_offset_{h}h_{key}"] < 0)}
            kb["growth_48_24"] = stats([r[f"growth_48_24_{key}"] for r in items]); kb["growth_72_48"] = stats([r[f"growth_72_48_{key}"] for r in items]); kb["growth_ratio_72_24"] = stats([r[f"growth_ratio_72_24_{key}"] for r in items])
            kb["growth_class_counts"] = {c: sum(1 for r in items if r[f"growth_class_{key}"] == c) for c in "ABCD"}
            b[key] = kb
        for h in H:
            b[f"obs_disp_{h}h"] = stats([r[f"obs_disp_{h}h"] for r in items]); b[f"delta_{h}h"] = stats([r[f"delta_{h}h"] for r in items]); b[f"alpha_sep_{h}h"] = stats([r[f"alpha_sep_{h}h"] for r in items])
            b[f"windage_toward_obs_{h}h"] = stats([r[f"windage_toward_obs_{h}h"] for r in items]); b[f"delta_sign_counts_{h}h"] = {s: sum(1 for r in items if sign(r[f"delta_{h}h"]) == s) for s in ("neg", "pos", "zero")}
        b["obs_path_hourly_72h"] = stats([r["obs_path_hourly_72h"] for r in items])
        b["delta_sign_persistent_count"] = sum(1 for r in items if r["delta_sign_persistent"] is True); b["delta_sign_change_counts"] = {k: sum(1 for r in items if r["delta_sign_changes"] == k) for k in (0, 1, 2)}
        b["highest_error_cases_72h_a002"] = [{"drifter_id": r["drifter_id"], "unit": r["unit"], "E72_a002": r3(r["E72_a002"]), "E72_a0": r3(r["E72_a0"]), "obs_disp_72h": r3(r["obs_disp_72h"]), "model_disp_72h_a002": r3(r["model_disp_72h_a002"]), "bearing_diff_72h_a002": r3(r["bearing_diff_72h_a002"])}
                                              for r in sorted(items, key=lambda r: -(r["E72_a002"] if r["E72_a002"] != NA else -1))[:3]]
        e72 = [r["E72_a002"] for r in items if r["E72_a002"] != NA]
        b["top1_share_of_sum_E72_a002"] = round(max(e72) / sum(e72), 3) if e72 and sum(e72) > 0 else NA
        return b
    summary = {"ruleId": "model-adequacy-diagnosis-step21", "phase": "B DIAGNOSTIC", "descriptiveOnly": True, "haversineRadiusMeters": RADIUS_M, "horizonsHours": list(H), "alphas": ALPHAS,
               "bearingDefinition": "initial great-circle bearing from the release point to the endpoint, degrees clockwise from north; absolute difference folded to [0, 180]; NOT_AVAILABLE when displacement < 1e-6 km",
               "offsetDefinition": "east/north offset of the model endpoint relative to the observed endpoint, km, equirectangular at the observed latitude (positive = model east / north of observation)",
               "pathLengthNote": "model path from 900 s samples (model_path) and from hourly subsamples (model_path_hourly); observed path from hourly samples only; ratios use hourly/hourly for fairness",
               "windageTowardObsDefinition": "projection of (P_alpha0.002 - P_alpha0) onto (P_obs - P_alpha0) divided by |P_obs - P_alpha0|^2 (local km); positive = windage displaces toward the observation",
               "datasets": {"CALIBRATION": {"n": sum(1 for r in rows if r["dataset"] == "CALIBRATION"), "units": ["KE-1", "KE-2", "AG-1", "AG-2"], "source": "STEP 20 calibration runs (alpha 0 and 0.002 only; other alphas not used)"},
                            "HOLDOUT": {"n": sum(1 for r in rows if r["dataset"] == "HOLDOUT"), "units": ["KE-H1", "KE-H3"], "source": "STEP 20 B-6 holdout runs (frozen; not used for any selection)"}, "excluded": excluded},
               "overall": {ds: block([r for r in rows if r["dataset"] == ds]) for ds in ("CALIBRATION", "HOLDOUT")},
               "perUnit": {u: block([r for r in rows if r["unit"] == u]) for u in ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]},
               "perRegionCalibration": {reg: block([r for r in rows if r["dataset"] == "CALIBRATION" and r["region"] == reg]) for reg in ("KE", "AG")},
               "step20Consistency": {"toleranceKm": 0.001, "checked": len(rows) * 6, "inconsistent": incons},
               "step20FrozenReference": "Calibration-selected alpha=0.002 did not show a consistent performance advantage over alpha=0 on the 12 evaluable KE holdout drifters.",
               "adequacyCategories": {"A": "magnitude error dominant", "B": "directional error dominant", "C": "temporal error growth dominant", "D": "regional / event-dependent error dominant", "rule": "no threshold; indicators recorded; categorisation is descriptive text in the report, 'INSUFFICIENT EVIDENCE' where indicators do not separate"},
               "outlierPolicyApplied": {"removed": 0, "trimmed": 0, "winsorized": 0, "reweighted": 0}, "alphaReselection": False, "thresholdsIntroduced": False, "pValues": False, "interpretation": "DESCRIPTIVE ONLY"}
    (out / "step21-diagnostic-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    figures = make_figures(rows, tracks_for_fig, figdir)
    run = {"status": "STEP21_DIAGNOSTIC_COMPLETE", "tableSha256": hashlib.sha256(table).hexdigest(), "summarySha256": sha(out / "step21-diagnostic-summary.json"), "figures": figures, "rows": len(rows),
           "tool": {"file": "tools/research/diagnose_step21.py", "sha256": sha(__file__)}, "inputs": LOCKED, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "deterministic": True, "randomSeed": None}
    (out / "step21-diagnostic-run.json").write_bytes((json.dumps(run, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({k: run[k] for k in ("status", "rows", "tableSha256", "summarySha256")} | {"inconsistent": len(incons)}))
    return 0


# ---------------- deterministic SVG figures (no library) ----------------
def jitter(did, mod):
    """Deterministic per-drifter jitter (SHA-based; Python's str hash is process-randomised and must not be used)."""
    return int(hashlib.sha256(did.encode("utf-8")).hexdigest(), 16) % mod


def svg_header(w, h, title, meta):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="Arial, sans-serif" font-size="11">',
            f'<rect width="{w}" height="{h}" fill="white"/>', f'<text x="12" y="18" font-size="14" font-weight="bold">{title}</text>', f'<text x="12" y="34" fill="#444">{meta}</text>']


def axis(x0, y0, x1, y1, xmax, ymax, xlabel, ylabel, ticks=5):
    s = [f'<line x1="{x0}" y1="{y1}" x2="{x1}" y2="{y1}" stroke="#000"/>', f'<line x1="{x0}" y1="{y0}" x2="{x0}" y2="{y1}" stroke="#000"/>']
    for i in range(ticks + 1):
        xv = xmax * i / ticks; xp = x0 + (x1 - x0) * i / ticks; yv = ymax * i / ticks; yp = y1 - (y1 - y0) * i / ticks
        s.append(f'<text x="{xp:.1f}" y="{y1 + 14}" text-anchor="middle" font-size="9">{xv:.3g}</text>'); s.append(f'<text x="{x0 - 4}" y="{yp + 3:.1f}" text-anchor="end" font-size="9">{yv:.3g}</text>')
        s.append(f'<line x1="{x0}" y1="{yp:.1f}" x2="{x1}" y2="{yp:.1f}" stroke="#eee"/>')
    s.append(f'<text x="{(x0 + x1) / 2:.1f}" y="{y1 + 28}" text-anchor="middle">{xlabel}</text>')
    s.append(f'<text x="{x0 - 38}" y="{(y0 + y1) / 2:.1f}" text-anchor="middle" transform="rotate(-90 {x0 - 38} {(y0 + y1) / 2:.1f})">{ylabel}</text>')
    return s


def write_svg(path, lines):
    data = ("\n".join(lines) + "\n</svg>\n").encode("utf-8"); path.write_bytes(data); return {"file": path.name, "sha256": hashlib.sha256(data).hexdigest()}


def make_figures(rows, tracks, figdir):
    figs = []
    color = {"CALIBRATION": "#1f77b4", "HOLDOUT": "#d62728"}
    n_c, n_h = sum(1 for r in rows if r["dataset"] == "CALIBRATION"), sum(1 for r in rows if r["dataset"] == "HOLDOUT")
    meta = f"datasets: CALIBRATION n={n_c} (blue), HOLDOUT n={n_h} (red); alpha 0.002 = filled, alpha 0 = hollow; metric: haversine R=6371008.8 m, exact UTC; axes start at 0, full range"
    # FIGURE 1: position error per horizon (dot plot)
    vals = [r[f"E{h}_{k}"] for r in rows for h in H for k in ALPHAS if r[f"E{h}_{k}"] != NA]; ymax = max(vals) * 1.05
    s = svg_header(760, 420, "FIGURE 1 — Observed vs model position error at 24/48/72 h (per drifter)", meta); x0, y0, x1, y1 = 60, 50, 730, 370
    s += axis(x0, y0, x1, y1, 3, ymax, "horizon (1=24h, 2=48h, 3=72h)", "position error (km)")
    for r in rows:
        for i, h in enumerate(H):
            for j, k in enumerate(ALPHAS):
                if r[f"E{h}_{k}"] == NA:
                    continue
                xp = x0 + (x1 - x0) * ((i + 1) / 3) - 40 + j * 20 + (jitter(r["drifter_id"], 11) - 5); yp = y1 - (y1 - y0) * r[f"E{h}_{k}"] / ymax
                fill = color[r["dataset"]] if k == "a002" else "none"
                s.append(f'<circle cx="{xp:.1f}" cy="{yp:.1f}" r="3" fill="{fill}" stroke="{color[r["dataset"]]}"/>')
    figs.append(write_svg(figdir / "figure1_position_error.svg", s))
    # FIGURE 2: error growth lines E24→E48→E72 (alpha 0.002)
    s = svg_header(760, 420, "FIGURE 2 — Error growth E24 → E48 → E72 per drifter (alpha 0.002 solid, alpha 0 dashed)", meta); s += axis(x0, y0, x1, y1, 72, ymax, "hours", "position error (km)")
    for r in rows:
        for k, dash in (("a002", ""), ("a0", ' stroke-dasharray="4 3"')):
            pts = [(x0 + (x1 - x0) * h / 72, y1 - (y1 - y0) * r[f"E{h}_{k}"] / ymax) for h in H if r[f"E{h}_{k}"] != NA]
            if len(pts) == 3:
                s.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{color[r["dataset"]]}" stroke-opacity="0.6"{dash}/>')
    figs.append(write_svg(figdir / "figure2_error_growth.svg", s))
    # FIGURE 3: observed vs model displacement at 72h
    dv = [r["obs_disp_72h"] for r in rows if r["obs_disp_72h"] != NA] + [r[f"model_disp_72h_{k}"] for r in rows for k in ALPHAS if r[f"model_disp_72h_{k}"] != NA]; m3 = max(dv) * 1.05
    s = svg_header(560, 560, "FIGURE 3 — Observed vs model 72 h endpoint displacement (1:1 line)", meta); s += axis(70, 50, 530, 500, m3, m3, "observed 72 h displacement (km)", "model 72 h displacement (km)")
    s.append(f'<line x1="70" y1="500" x2="530" y2="50" stroke="#888" stroke-dasharray="6 4"/>')
    for r in rows:
        if r["obs_disp_72h"] == NA:
            continue
        for k in ALPHAS:
            if r[f"model_disp_72h_{k}"] == NA:
                continue
            xp = 70 + 460 * r["obs_disp_72h"] / m3; yp = 500 - 450 * r[f"model_disp_72h_{k}"] / m3
            s.append(f'<circle cx="{xp:.1f}" cy="{yp:.1f}" r="3.5" fill="{color[r["dataset"]] if k == "a002" else "none"}" stroke="{color[r["dataset"]]}"/>')
    figs.append(write_svg(figdir / "figure3_displacement.svg", s))
    # FIGURE 4: bearing difference at 72h per unit
    units = ["KE-1", "KE-2", "AG-1", "AG-2", "KE-H1", "KE-H3"]
    s = svg_header(760, 420, "FIGURE 4 — Absolute bearing difference observed vs model 72 h displacement, per unit", meta); s += axis(x0, y0, x1, y1, len(units), 180, "unit (1 KE-1, 2 KE-2, 3 AG-1, 4 AG-2, 5 KE-H1, 6 KE-H3)", "|bearing difference| (deg)")
    for r in rows:
        i = units.index(r["unit"])
        for j, k in enumerate(ALPHAS):
            if r[f"bearing_diff_72h_{k}"] == NA:
                continue
            xp = x0 + (x1 - x0) * (i + 0.5) / len(units) - 12 + j * 16 + (jitter(r["drifter_id"], 7) - 3); yp = y1 - (y1 - y0) * r[f"bearing_diff_72h_{k}"] / 180
            s.append(f'<circle cx="{xp:.1f}" cy="{yp:.1f}" r="3" fill="{color[r["dataset"]] if k == "a002" else "none"}" stroke="{color[r["dataset"]]}"/>')
    figs.append(write_svg(figdir / "figure4_bearing_difference.svg", s))
    # FIGURE 5: paired delta per drifter per horizon (bars, symmetric axis)
    dl = [abs(r[f"delta_{h}h"]) for r in rows for h in H if r[f"delta_{h}h"] != NA]; dmax = max(dl) * 1.05
    s = svg_header(900, 460, "FIGURE 5 — Paired error difference delta = E(alpha 0.002) - E(alpha 0) per drifter (bars: 24h, 48h, 72h)", meta)
    x0b, y0b, x1b, y1b = 60, 50, 880, 400; ymid = (y0b + y1b) / 2
    s.append(f'<line x1="{x0b}" y1="{ymid}" x2="{x1b}" y2="{ymid}" stroke="#000"/>'); s.append(f'<line x1="{x0b}" y1="{y0b}" x2="{x0b}" y2="{y1b}" stroke="#000"/>')
    for i in range(-2, 3):
        yp = ymid - (y1b - y0b) / 2 * i / 2; s.append(f'<text x="{x0b - 4}" y="{yp + 3:.1f}" text-anchor="end" font-size="9">{dmax * i / 2:.3g}</text>'); s.append(f'<line x1="{x0b}" y1="{yp:.1f}" x2="{x1b}" y2="{yp:.1f}" stroke="#eee"/>')
    s.append(f'<text x="{x0b - 40}" y="{ymid:.1f}" text-anchor="middle" transform="rotate(-90 {x0b - 40} {ymid:.1f})">delta (km); negative = alpha 0.002 lower error</text>')
    bw = (x1b - x0b) / len(rows)
    for i, r in enumerate(rows):
        for j, h in enumerate(H):
            if r[f"delta_{h}h"] == NA:
                continue
            hgt = (y1b - y0b) / 2 * r[f"delta_{h}h"] / dmax; xp = x0b + bw * i + bw * (0.1 + 0.27 * j)
            s.append(f'<rect x="{xp:.1f}" y="{min(ymid, ymid - hgt):.1f}" width="{bw * 0.25:.1f}" height="{abs(hgt):.1f}" fill="{color[r["dataset"]]}" fill-opacity="{0.35 + 0.3 * j}"/>')
        s.append(f'<text x="{x0b + bw * (i + 0.5):.1f}" y="{y1b + 12}" text-anchor="middle" font-size="7" transform="rotate(60 {x0b + bw * (i + 0.5):.1f} {y1b + 12})">{r["drifter_id"]}</text>')
    figs.append(write_svg(figdir / "figure5_paired_delta.svg", s))
    # FIGURE 6: 72h trajectory divergence examples — three highest E72 (alpha 0.002) cases, one per panel
    top = sorted([r for r in rows if r["E72_a002"] != NA], key=lambda r: -r["E72_a002"])[:3]
    s = svg_header(960, 380, "FIGURE 6 — 72 h trajectory divergence: three highest-error cases (obs black, alpha 0.002 solid colour, alpha 0 dashed)", meta)
    for pi, r in enumerate(top):
        t = tracks[(r["dataset"], r["unit"], r["drifter_id"])]; pts = [p for p in t["obs"]] + [p for p in t["a002"] if p] + [p for p in t["a0"] if p]
        lons, lats = [p[0] for p in pts], [p[1] for p in pts]; px0 = 20 + pi * 315; w_, h_ = 290, 290; py0 = 50
        lon_min, lon_max, lat_min, lat_max = min(lons), max(lons), min(lats), max(lats); span = max(lon_max - lon_min, (lat_max - lat_min) / max(0.2, math.cos(math.radians((lat_min + lat_max) / 2))), 0.05) * 1.1
        def X(lon): return px0 + w_ * (lon - (lon_min + lon_max) / 2) / span + w_ / 2
        def Y(lat): return py0 + h_ / 2 - h_ * (lat - (lat_min + lat_max) / 2) / span / max(0.2, math.cos(math.radians((lat_min + lat_max) / 2)))
        s.append(f'<rect x="{px0}" y="{py0}" width="{w_}" height="{h_}" fill="none" stroke="#999"/>')
        s.append(f'<text x="{px0 + 4}" y="{py0 + h_ + 14}" font-size="10">{r["dataset"]} {r["unit"]} drifter {r["drifter_id"]}: E72 a0.002={r3(r["E72_a002"])} km, a0={r3(r["E72_a0"])} km; lon {lon_min:.2f}..{lon_max:.2f}, lat {lat_min:.2f}..{lat_max:.2f}</text>')
        for key, stroke, dash in (("obs", "#000", ""), ("a002", color[r["dataset"]], ""), ("a0", color[r["dataset"]], ' stroke-dasharray="4 3"')):
            seq = [p for p in t[key] if p]
            if len(seq) > 1:
                s.append(f'<polyline points="{" ".join(f"{X(p[0]):.1f},{Y(p[1]):.1f}" for p in seq)}" fill="none" stroke="{stroke}" stroke-width="1.5"{dash}/>')
        s.append(f'<circle cx="{X(t["rel"][0]):.1f}" cy="{Y(t["rel"][1]):.1f}" r="4" fill="#000"/>')
    figs.append(write_svg(figdir / "figure6_trajectory_divergence.svg", s))
    return figs


if __name__ == "__main__":
    raise SystemExit(main())

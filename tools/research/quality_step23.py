"""STEP 23 Phase B — DATA QUALITY GATES G1–G11 on the acquired files (no model, no metric, no substitution). Reads the acquisition
manifest and the raw NetCDF files (netCDF4 from .deps), evaluates every gate per dataset and per window, and writes
docs/research/step23-data-quality-gates.json, step23-data-coverage-matrix.csv, step23-data-requirement-status.json.
Deterministic (`--out DIR` for the reproducibility re-run; timestamps excluded)."""
import csv
import hashlib
import io
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402

PROTO = ROOT / "docs/research/step23-data-acquisition-protocol.json"
MANIFEST = ROOT / "docs/research/step23-data-acquisition-manifest.json"
GATES = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def epoch(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def times_of(ds):
    t = ds.variables["time"]; vals = netCDF4.num2date(t[:], t.units, calendar=getattr(t, "calendar", "standard"))
    return [datetime(v.year, v.month, v.day, v.hour, v.minute, v.second, tzinfo=timezone.utc).timestamp() for v in vals]


def axis(ds, names):
    for n in names:
        if n in ds.variables:
            return n, np.array(ds.variables[n][:], dtype=float)
    return None, None


def regular(a):
    d = np.diff(a); return bool(len(a) > 1 and np.all(d > 0) or np.all(d < 0)) and bool(np.allclose(d, d[0], rtol=0, atol=1e-3 * abs(d[0]) + 1e-6))


def to_lon_conv(lon, lon_axis):
    """Map a -180..180 longitude to the axis convention (0..360 if the axis exceeds 180)."""
    return lon % 360 if lon_axis.max() > 180 else ((lon + 180) % 360) - 180


def stencil_missing(field2d, lat_axis, lon_axis, lon, lat):
    """True if any of the 4 nodes around (lon, lat) is masked/NaN. field2d masked array [lat][lon]."""
    lonc = to_lon_conv(lon, lon_axis)
    if lonc < lon_axis.min() or lonc > lon_axis.max() or lat < lat_axis.min() or lat > lat_axis.max():
        return None
    i = int(np.searchsorted(lon_axis if lon_axis[0] < lon_axis[-1] else lon_axis[::-1], lonc)); j_axis = lat_axis if lat_axis[0] < lat_axis[-1] else lat_axis[::-1]; j = int(np.searchsorted(j_axis, lat))
    li = [max(0, i - 1), min(len(lon_axis) - 1, i)]; lj = [max(0, j - 1), min(len(lat_axis) - 1, j)]
    if lon_axis[0] > lon_axis[-1]:
        li = [len(lon_axis) - 1 - x for x in li]
    if lat_axis[0] > lat_axis[-1]:
        lj = [len(lat_axis) - 1 - x for x in lj]
    vals = [field2d[jj, ii] for jj in lj for ii in li]
    return any(np.ma.is_masked(v) or (isinstance(v, float) and math.isnan(v)) or (hasattr(v, "mask") and bool(np.ma.getmask(v))) for v in vals)


def window_checks(ds, varnames, w, lon_axis, lat_axis, times, cadence_note):
    """G6/G7/G8/G10 for one window on an open dataset. Returns dict."""
    t0, t1 = epoch(w["t0"]), epoch(w["end"]); box = w["oceanBox"]
    lon_min, lon_max = float(lon_axis.min()), float(lon_axis.max()); lat_min, lat_max = float(lat_axis.min()), float(lat_axis.max())
    bw, be = to_lon_conv(box["west"], lon_axis), to_lon_conv(box["east"], lon_axis)
    g6 = lon_min <= bw <= lon_max and lon_min <= be <= lon_max and lat_min <= box["south"] <= lat_max and lat_min <= box["north"] <= lat_max
    before = [t for t in times if t <= t0]; after = [t for t in times if t >= t1]
    g7 = bool(before) and bool(after)
    res = {"windowId": w["windowId"], "G6_spatialCoverage": g6, "G7_temporalCoverage": g7, "bracketFrames": {"t0_le": datetime.fromtimestamp(max(before), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if before else None, "end_ge": datetime.fromtimestamp(min(after), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if after else None},
           "framesInsideWindow": sum(1 for t in times if t0 <= t <= t1), "cadence": cadence_note}
    if not (g6 and g7):
        res.update({"G8_missingness": None, "G10_releaseCoverage": None, "missingFractionBox": None}); return res
    ti0 = times.index(max(before)); ti1 = times.index(min(after))
    lonsel = np.where((lon_axis >= min(bw, be) - 1e-9) & (lon_axis <= max(bw, be) + 1e-9))[0]; latsel = np.where((lat_axis >= box["south"] - 1e-9) & (lat_axis <= box["north"] + 1e-9))[0]
    miss = []; release_ok = True; release_detail = []
    for vn in varnames:
        var = ds.variables[vn]
        for ti in (ti0, ti1):
            arr = var[ti]
            while arr.ndim > 2:
                arr = arr[0]
            sub = arr[np.ix_(latsel, lonsel)] if arr.shape[0] == len(lat_axis) else arr[np.ix_(lonsel, latsel)].T
            m = np.ma.getmaskarray(sub) | ~np.isfinite(np.ma.filled(sub.astype(float), np.nan))
            miss.append(float(m.mean()))
            for d in w["releasePositions"]:
                sm = stencil_missing(arr if arr.shape[0] == len(lat_axis) else arr.T, lat_axis, lon_axis, d["lon"], d["lat"])
                release_detail.append({"drifterId": d["drifterId"], "var": vn, "frame": "t0_le" if ti == ti0 else "end_ge", "stencilMissing": sm})
                if sm is None or sm:
                    release_ok = False
    res.update({"missingFractionBox": round(max(miss), 6), "G8_missingness": True, "G10_releaseCoverage": release_ok, "releaseStencilChecks": len(release_detail), "releaseStencilFailures": [x for x in release_detail if x["stencilMissing"] in (None, True)][:20]})
    return res


def assess_file(path, varnames, windows, expected_units, kind):
    with netCDF4.Dataset(path) as ds:
        lon_name, lon_axis = axis(ds, ("longitude", "lon")); lat_name, lat_axis = axis(ds, ("latitude", "lat"))
        g3 = lon_axis is not None and lat_axis is not None and regular(lon_axis) and regular(lat_axis) and float(lat_axis.min()) >= -90 and float(lat_axis.max()) <= 90 and float(lon_axis.min()) >= -180 and float(lon_axis.max()) <= 360
        times = times_of(ds); d = np.diff(times)
        g4 = len(times) >= 2 and bool(np.all(d > 0))
        cadence = {"medianSeconds": float(np.median(d)) if len(d) else None, "minSeconds": float(d.min()) if len(d) else None, "maxSeconds": float(d.max()) if len(d) else None, "regular": bool(len(d) and np.allclose(d, d[0]))}
        present = [v for v in varnames if v in ds.variables]; g5 = len(present) == len(varnames)
        units = {v: getattr(ds.variables[v], "units", None) for v in present}
        g9 = all((u or "").replace(" ", "").lower() in {x.replace(" ", "").lower() for x in expected_units} for u in units.values())
        depth = None
        for dn in ("depth", "altitude"):
            if dn in ds.variables:
                depth = {dn: [float(x) for x in np.array(ds.variables[dn][:]).ravel()[:5]]}
        info = {"file": str(Path(path).relative_to(ROOT)).replace("\\", "/"), "sha256": sha(path), "bytes": Path(path).stat().st_size, "lonAxis": {"name": lon_name, "min": float(lon_axis.min()), "max": float(lon_axis.max()), "n": int(len(lon_axis)), "spacing": float(abs(lon_axis[1] - lon_axis[0]))}, "latAxis": {"name": lat_name, "min": float(lat_axis.min()), "max": float(lat_axis.max()), "n": int(len(lat_axis)), "spacing": float(abs(lat_axis[1] - lat_axis[0]))},
                "time": {"n": len(times), "start": datetime.fromtimestamp(times[0], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "end": datetime.fromtimestamp(times[-1], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **cadence}, "variables": present, "units": units, "verticalReference": depth,
                "globalAttributes": {k: str(ds.getncattr(k))[:200] for k in ds.ncattrs() if k.lower() in ("title", "institution", "source", "references", "history", "conventions", "license", "comment", "product_version", "product", "forcing", "model")},
                "G3_coordinateValidity": bool(g3), "G4_timeAxisValidity": bool(g4), "G5_variableAvailability": bool(g5), "G9_unitValidity": bool(g9), "windows": []}
        if g3 and g4 and g5:
            for w in windows:
                info["windows"].append(window_checks(ds, present, w, lon_axis, lat_axis, times, cadence["medianSeconds"]))
    return info


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    proto = load(PROTO); m = load(MANIFEST); windows = proto["windows"]
    result = {"ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "manifestSha256": sha(MANIFEST), "gateDefinitions": proto["gates"], "datasets": {}, "modelRuns": 0, "substitutionPerformed": False, "interpolationPerformed": False}
    matrix = []
    # DATA-01 (blocked)
    d1 = m["datasets"]["DATA-01"]
    result["datasets"]["DATA-01"] = {"product": d1["attempted"], "gates": {g: ("PASS" if g == "G1" else "NOT_EVALUATED") for g in GATES}, "status": "DATASET_BLOCKED", "reason": d1["blockReason"], "licenseStatus": d1["licenseStatus"], "comparability": "not assessable (no data)", "depthInventory": d1["depthInventory"]}
    for w in windows:
        matrix.append({"dataset": "DATA-01", "product": "GLORYS12V1", "windowId": w["windowId"], "spatial": "N/A", "temporal": "N/A", "missingFractionBox": "N/A", "releaseStencil": "N/A", "status": "DATASET_BLOCKED"})
    # DATA-03
    d3 = {"products": {}}
    for did, prod in m["datasets"]["DATA-03"]["products"].items():
        meta = prod["metadata"]
        if not prod.get("downloaded"):
            cov = [{"windowId": w["windowId"], "covered": bool(meta.get("timeCoverageStart") and meta.get("timeCoverageEnd") and meta["timeCoverageStart"] <= w["t0"] and w["end"] <= meta["timeCoverageEnd"])} for w in windows]
            d3["products"][did] = {"role": prod["role"], "metadataOnly": True, "productPeriod": [meta.get("timeCoverageStart"), meta.get("timeCoverageEnd")], "windowCoverage": cov, "status": "DATASET_BLOCKED" if not any(c["covered"] for c in cov) else "PARTIAL_COVERAGE", "reason": "no window inside the product period held by the server; no download issued" if not any(c["covered"] for c in cov) else "not downloaded"}
            for c in cov:
                matrix.append({"dataset": "DATA-03", "product": did, "windowId": c["windowId"], "spatial": "N/A", "temporal": "covered" if c["covered"] else "outside product period", "missingFractionBox": "N/A", "releaseStencil": "N/A", "status": "metadata only"})
            continue
        varnames = ["u_current", "v_current"] if did == "erdTAgeo1day" else ["ssh", "sshd"]; units = ["m s-1", "m/s", "meter/sec"] if did == "erdTAgeo1day" else ["m", "meters"]
        files = []; per_window = {}
        for f in prod["files"]:
            if f.get("status") in ("ok", "reused") and f.get("file"):
                path = ROOT / f["file"]; g2 = path.exists() and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"]
                w = next(x for x in windows if x["windowId"] == f["windowId"])
                info = assess_file(path, varnames, [w], units, did) if g2 else {"G3_coordinateValidity": False, "G4_timeAxisValidity": False, "G5_variableAvailability": False, "G9_unitValidity": False, "windows": []}
                info.update({"windowId": f["windowId"], "G2_fileIntegrity": bool(g2), "query": f.get("query")}); files.append(info)
                per_window[f["windowId"]] = info
            else:
                per_window[f["windowId"]] = {"windowId": f["windowId"], "status": f.get("status"), "windows": []}
        gates = {"G1": "PASS", "G2": "PASS" if files and all(x["G2_fileIntegrity"] for x in files) else "FAIL", "G3": "PASS" if files and all(x["G3_coordinateValidity"] for x in files) else "FAIL", "G4": "PASS" if files and all(x["G4_timeAxisValidity"] for x in files) else "FAIL",
                 "G5": "PASS" if files and all(x["G5_variableAvailability"] for x in files) else "FAIL", "G9": "PASS" if files and all(x["G9_unitValidity"] for x in files) else "FAIL"}
        wstat = []
        for w in windows:
            info = per_window.get(w["windowId"], {}); wc = info.get("windows", [])
            if not wc:
                wstat.append({"windowId": w["windowId"], "covered": False, "reason": info.get("status", "no file"), "G6": None, "G7": None, "G8": None, "G10": None, "missingFractionBox": None})
                matrix.append({"dataset": "DATA-03", "product": did, "windowId": w["windowId"], "spatial": "no file", "temporal": info.get("status", "no file"), "missingFractionBox": "N/A", "releaseStencil": "N/A", "status": "NOT_COVERED"}); continue
            c = wc[0]; ok = bool(c["G6_spatialCoverage"] and c["G7_temporalCoverage"] and c["G10_releaseCoverage"])
            wstat.append({"windowId": w["windowId"], "covered": ok, "G6": c["G6_spatialCoverage"], "G7": c["G7_temporalCoverage"], "G8": c["G8_missingness"], "G10": c["G10_releaseCoverage"], "missingFractionBox": c["missingFractionBox"], "bracketFrames": c["bracketFrames"], "framesInsideWindow": c["framesInsideWindow"]})
            matrix.append({"dataset": "DATA-03", "product": did, "windowId": w["windowId"], "spatial": "PASS" if c["G6_spatialCoverage"] else "FAIL", "temporal": f"PASS bracket {c['bracketFrames']['t0_le']}..{c['bracketFrames']['end_ge']}" if c["G7_temporalCoverage"] else "FAIL", "missingFractionBox": c["missingFractionBox"], "releaseStencil": "PASS" if c["G10_releaseCoverage"] else "FAIL", "status": "COVERED" if ok else "NOT_COVERED"})
        covered = [x for x in wstat if x["covered"]]
        gates.update({"G6": "PASS" if covered and all(x["G6"] for x in covered) else ("PARTIAL" if covered else "FAIL"), "G7": "PASS" if len(covered) == len(windows) else ("PARTIAL" if covered else "FAIL"), "G8": "PASS" if covered and all(x["G8"] for x in covered) else "FAIL", "G10": "PASS" if len(covered) == len(windows) else ("PARTIAL" if covered else "FAIL"), "G11": "PENDING_VALIDATOR"})
        core_fail = any(gates[g] == "FAIL" for g in ("G2", "G3", "G4", "G5", "G8", "G9"))
        status = "DATASET_BLOCKED" if core_fail or not covered else ("ACCEPTED_FOR_FUTURE_TEST" if len(covered) == len(windows) else "PARTIAL_COVERAGE")
        d3["products"][did] = {"role": prod["role"], "gates": gates, "status": status, "windowsCovered": [x["windowId"] for x in covered], "windowsNotCovered": [x["windowId"] for x in wstat if not x["covered"]], "files": files, "windowStatus": wstat,
                               "licenseStatus": prod["licenseStatus"], "licenseText": prod.get("licenseText"), "provenance": {k: meta.get(k) for k in ("datasetId", "title", "institution", "timeCoverageStart", "timeCoverageEnd", "latResolution", "lonResolution", "infoUrl")},
                               "comparability": {"geographicDomain": "global grid; window boxes covered where G6 PASS", "timeStandard": "UTC (seconds since 1970-01-01)", "observationWindows": "2010 windows only (product ends 2012-12)", "variableSemantics": "geostrophic surface velocity at altitude 0 (not total surface velocity)" if did == "erdTAgeo1day" else "absolute SSH / SSH deviation (reference field, not velocity)", "units": "m s-1" if did == "erdTAgeo1day" else "m", "coordinateSystem": "regular 0.25 deg lat/lon, lon 0..360 (converted from -180..180 at request)", "depthInterpretation": "surface geostrophic (altitude 0) vs baseline 15 m Eulerian — different physical quantity; reference only"},
                               "referenceOnlyNote": "altimetry-derived velocity is not assumed equal to drifter velocity"}
    result["datasets"]["DATA-03"] = d3
    # DATA-06
    d6 = m["datasets"]["DATA-06"]; files = []; g2_all = True
    for f in d6["files"]:
        if f["status"] in ("ok", "reused") and f.get("file"):
            path = ROOT / f["file"]; g2 = path.exists() and sha(path) == f["sha256"] and path.stat().st_size == f["bytes"]; g2_all &= bool(g2)
            month = f["filename"].split("_")[1]
            wins = [w for w in windows if w["t0"][:7].replace("-", "") == month or datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ").strftime("%Y%m") == month]
            info = assess_file(path, ["uuss", "vuss"], wins, ["m s-1", "m/s"], "ww3") if g2 else {"G3_coordinateValidity": False, "G4_timeAxisValidity": False, "G5_variableAvailability": False, "G9_unitValidity": False, "windows": []}
            info.update({"filename": f["filename"], "G2_fileIntegrity": bool(g2), "url": f["url"]}); files.append(info)
        else:
            g2_all = False; files.append({"filename": f["filename"], "G2_fileIntegrity": False, "status": f["status"], "error": f.get("error"), "windows": []})
    # per-window: a window may span two monthly files (KE-2 Jun 30 → Jul 3); combine: covered if bracketed within one file OR t0 in file A and end in file B with contiguous cadence
    wstat = []
    for w in windows:
        checks = [c for fi in files for c in fi.get("windows", []) if c["windowId"] == w["windowId"]]
        m_t0 = w["t0"][:7].replace("-", ""); m_end = datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ").strftime("%Y%m")
        if m_t0 == m_end:
            c = checks[0] if checks else None
            ok = bool(c and c["G6_spatialCoverage"] and c["G7_temporalCoverage"] and c["G10_releaseCoverage"]); wstat.append({"windowId": w["windowId"], "covered": ok, "detail": c, "spansMonths": False})
        else:
            fa = next((fi for fi in files if fi.get("filename", "").split("_")[1] == m_t0), None); fb = next((fi for fi in files if fi.get("filename", "").split("_")[1] == m_end), None)
            ca = next((c for c in (fa or {}).get("windows", []) if c["windowId"] == w["windowId"]), None); cb = next((c for c in (fb or {}).get("windows", []) if c["windowId"] == w["windowId"]), None)
            # month A must contain t0 (bracket t0_le) and month B must contain end (bracket end_ge); cadence contiguity across the boundary is assumed only if both files have 3 h cadence and A ends at the last 3 h slot of the month
            ok = bool(ca and cb and ca["G6_spatialCoverage"] and cb["G6_spatialCoverage"] and ca["bracketFrames"]["t0_le"] and cb["bracketFrames"]["end_ge"] and fa["time"]["regular"] and fb["time"]["regular"] and (epoch(fb["time"]["start"]) - epoch(fa["time"]["end"])) == fa["time"]["medianSeconds"])
            wstat.append({"windowId": w["windowId"], "covered": ok, "spansMonths": True, "monthA": ca, "monthB": cb, "boundaryGapSeconds": (epoch(fb["time"]["start"]) - epoch(fa["time"]["end"])) if fa and fb and "time" in fa and "time" in fb else None,
                          "releaseStencilA": ca["G10_releaseCoverage"] if ca else None})
            if ok and ca and ca["G10_releaseCoverage"] is False:
                wstat[-1]["covered"] = False
        c = wstat[-1]
        det = c.get("detail") or c.get("monthA") or {}
        matrix.append({"dataset": "DATA-06", "product": "WW3-GLOB-30M CFSR uss", "windowId": w["windowId"], "spatial": "PASS" if det.get("G6_spatialCoverage") else "FAIL", "temporal": ("PASS (spans 2 monthly files, contiguous)" if c.get("spansMonths") and c["covered"] else ("PASS" if c["covered"] else "FAIL")), "missingFractionBox": det.get("missingFractionBox", "N/A"), "releaseStencil": "PASS" if det.get("G10_releaseCoverage") else "FAIL", "status": "COVERED" if c["covered"] else "NOT_COVERED"})
    covered = [x for x in wstat if x["covered"]]
    gates = {"G1": "PASS", "G2": "PASS" if g2_all and files else "FAIL", "G3": "PASS" if files and all(x.get("G3_coordinateValidity") for x in files) else "FAIL", "G4": "PASS" if files and all(x.get("G4_timeAxisValidity") for x in files) else "FAIL", "G5": "PASS" if files and all(x.get("G5_variableAvailability") for x in files) else "FAIL",
             "G6": "PASS" if covered and len(covered) == len(windows) else ("PARTIAL" if covered else "FAIL"), "G7": "PASS" if len(covered) == len(windows) else ("PARTIAL" if covered else "FAIL"), "G8": "PASS" if covered else "FAIL", "G9": "PASS" if files and all(x.get("G9_unitValidity") for x in files) else "FAIL", "G10": "PASS" if len(covered) == len(windows) else ("PARTIAL" if covered else "FAIL"), "G11": "PENDING_VALIDATOR"}
    core_fail = any(gates[g] == "FAIL" for g in ("G2", "G3", "G4", "G5", "G8", "G9"))
    lic = d6["licenseStatus"]
    status = "DATASET_BLOCKED" if core_fail or not covered else ("LICENSE_STATUS_UNKNOWN" if lic.startswith("LICENSE_STATUS_UNKNOWN") else ("ACCEPTED_FOR_FUTURE_TEST" if len(covered) == len(windows) else "PARTIAL_COVERAGE"))
    result["datasets"]["DATA-06"] = {"product": d6["product"]["product"], "provider": d6["product"]["provider"], "gates": gates, "status": status, "qualityStatusIgnoringLicense": "ACCEPTED_FOR_FUTURE_TEST" if (not core_fail and covered and len(covered) == len(windows)) else ("PARTIAL_COVERAGE" if covered and not core_fail else "DATASET_BLOCKED"),
                                     "windowsCovered": [x["windowId"] for x in covered], "windowsNotCovered": [x["windowId"] for x in wstat if not x["covered"]], "files": files, "windowStatus": wstat, "licenseStatus": lic, "granularityNote": d6["product"].get("granularity"),
                                     "comparability": {"geographicDomain": "global 0.5 deg; window boxes covered where G6 PASS", "timeStandard": "UTC", "observationWindows": "all 7 windows within acquired months", "variableSemantics": "surface Stokes drift (uuss/vuss), not Eulerian current", "units": "m s-1", "coordinateSystem": "regular 0.5 deg lat/lon (convention recorded per file)", "depthInterpretation": "surface (wave) quantity vs baseline 15 m Eulerian — additive transport term candidate; no depth equivalence"}}
    (out / "step23-data-quality-gates.json").write_bytes((json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(["dataset", "product", "windowId", "spatial", "temporal", "missingFractionBox", "releaseStencil", "status"])
    for r in matrix:
        wr.writerow([r[k] for k in ("dataset", "product", "windowId", "spatial", "temporal", "missingFractionBox", "releaseStencil", "status")])
    (out / "step23-data-coverage-matrix.csv").write_bytes(buf.getvalue().encode("utf-8"))
    status_doc = {"ruleId": proto["ruleId"], "interpretation": "DATA ACQUISITION / QUALITY ASSESSMENT ONLY", "modelRuns": 0, "alphaChanged": False, "step20_21_22Revised": False,
                  "DATA-01": {"status": "DATASET_BLOCKED", "reason": d1["blockReason"], "futureTestEligibility": "NOT ELIGIBLE (no data)"},
                  "DATA-03": {k: {"status": v["status"], "windowsCovered": v.get("windowsCovered", []), "futureTestEligibility": ("ELIGIBLE for 2010 windows only (TEST-03), reference role" if v["status"] in ("PARTIAL_COVERAGE", "ACCEPTED_FOR_FUTURE_TEST") else "NOT ELIGIBLE")} for k, v in d3["products"].items()},
                  "DATA-06": {"status": status, "qualityStatusIgnoringLicense": result["datasets"]["DATA-06"]["qualityStatusIgnoringLicense"], "windowsCovered": [x["windowId"] for x in covered], "futureTestEligibility": "quality sufficient for TEST-06 on covered windows; use conditional on license confirmation" if covered and not core_fail else "NOT ELIGIBLE"},
                  "KE-H2": "coverage recorded only; STEP 20 result not revised", "bestDatasetSelected": False}
    (out / "step23-data-requirement-status.json").write_bytes((json.dumps(status_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"DATA-01": "DATASET_BLOCKED", "DATA-03": {k: v["status"] for k, v in d3["products"].items()}, "DATA-06": status, "DATA-06-gates": gates}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

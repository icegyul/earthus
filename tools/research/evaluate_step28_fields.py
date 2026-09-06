"""STEP 28 Phase B — ocean forcing field agreement diagnostic. Per eligible window at the exact AVISO timestamp T: fields on the AVISO
0.25 degree native nodes inside the ocean box (HYCOM and GLORYS sampled bilinearly, 4-node stencil validity, AVISO node not masked; only
cells valid in every compared field), comparisons A HYCOM vs GLORYS, B HYCOM vs AVISO, C GLORYS vs AVISO (model = first, reference =
second); secondary HYCOM_NATIVE_FIELD_DIAGNOSTIC (A on HYCOM native nodes, GLORYS sampled); depth diagnostic (C for GLORYS D05/D10/D15/D20
where registered); trajectory context from the frozen STEP 25C paired table (no M3 recomputation); deterministic SVG figures 1-7 per
window; descriptive Q1-Q6 classification per the locked Phase B rules. No model run, no parameter change, no download.
Deterministic; `--out DIR` for the independent re-run (figures go to DIR/step28-figures)."""
import csv
import hashlib
import io
import json
import math
import sys
from bisect import bisect_right
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402

PREREG, PBLOCK, MANIFEST = D / "step28-preregistration.json", D / "step28-phase-b-preregistration.json", D / "step28-field-comparison-manifest.json"
TABLE25C = D / "step25c-paired-table.csv"
NA = "NOT_AVAILABLE"
PCT = [10, 25, 50, 75, 90]
TCOLS = ["windowId", "role", "timestamp", "grid", "comparison", "model", "reference", "glorysDepthMeters", "nCells", "medianVecDiff", "meanVecDiff", "minVecDiff", "maxVecDiff", "p10VecDiff", "p25VecDiff", "p50VecDiff", "p75VecDiff", "p90VecDiff", "rmsVecDiff", "medianAbsDu", "medianAbsDv", "meanAbsDu", "meanAbsDv",
         "medianModelSpeed", "medianRefSpeed", "meanModelSpeed", "meanRefSpeed", "nRelSpeed", "medianRelSpeedDiff", "meanRelSpeedDiff", "nDirection", "medianAbsDirDiff", "meanAbsDirDiff", "p10AbsDirDiff", "p25AbsDirDiff", "p50AbsDirDiff", "p75AbsDirDiff", "p90AbsDirDiff", "medianSignedDirDiff", "fractionCW", "fractionCCW", "fractionZero", "pearsonU", "pearsonV"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def r6(x):
    return NA if x is None or x == NA or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), 6)


def grid_arrays(g):
    lon = np.array(g["lon"], float); lat = np.array(g["lat"], float)
    return lon, lat


def field_at(g, k, comp):
    return np.array([[np.nan if v is None else v for v in row] for row in g[comp][k]], dtype=np.float64)


def bilinear(lon, lat, F, xs, ys):
    """Sample F[lat, lon] at points (xs, ys); NaN when outside or any stencil node NaN. Pure numpy, deterministic."""
    out = np.full(len(xs), np.nan)
    for n, (x, y) in enumerate(zip(xs, ys)):
        if x < lon[0] or x > lon[-1] or y < lat[0] or y > lat[-1]:
            continue
        i = min(max(0, bisect_right(lon, x) - 1), len(lon) - 2); j = min(max(0, bisect_right(lat, y) - 1), len(lat) - 2)
        fx = (x - lon[i]) / (lon[i + 1] - lon[i]); fy = (y - lat[j]) / (lat[j + 1] - lat[j])
        a, b, c, d = F[j, i], F[j, i + 1], F[j + 1, i], F[j + 1, i + 1]
        if np.isnan(a) or np.isnan(b) or np.isnan(c) or np.isnan(d):
            continue
        out[n] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    return out


def bearing(u, v):
    return (np.degrees(np.arctan2(u, v)) + 360.0) % 360.0


def wrap(d):
    d = (d + 180.0) % 360.0 - 180.0
    d[d == -180.0] = 180.0
    return d


def pearson(a, b):
    if len(a) < 2 or np.std(a) == 0 or np.std(b) == 0:
        return NA
    return float(np.corrcoef(a, b)[0, 1])


def metrics(um, vm, ur, vr):
    n = len(um)
    if n == 0:
        return {"nCells": 0}
    du, dv = um - ur, vm - vr; vec = np.sqrt(du ** 2 + dv ** 2); sm, sr = np.sqrt(um ** 2 + vm ** 2), np.sqrt(ur ** 2 + vr ** 2)
    out = {"nCells": int(n), "medianVecDiff": np.median(vec), "meanVecDiff": vec.mean(), "minVecDiff": vec.min(), "maxVecDiff": vec.max()}
    for p, val in zip(PCT, np.percentile(vec, PCT)):
        out[f"p{p}VecDiff"] = val
    out.update({"rmsVecDiff": math.sqrt(float((vec ** 2).mean())), "medianAbsDu": np.median(np.abs(du)), "medianAbsDv": np.median(np.abs(dv)), "meanAbsDu": np.abs(du).mean(), "meanAbsDv": np.abs(dv).mean(),
                "medianModelSpeed": np.median(sm), "medianRefSpeed": np.median(sr), "meanModelSpeed": sm.mean(), "meanRefSpeed": sr.mean()})
    nz = sr != 0.0; rel = (sm[nz] - sr[nz]) / sr[nz]
    out.update({"nRelSpeed": int(nz.sum()), "medianRelSpeedDiff": np.median(rel) if nz.any() else NA, "meanRelSpeedDiff": rel.mean() if nz.any() else NA})
    both = (sm != 0.0) & (sr != 0.0)
    if both.any():
        sd = wrap(bearing(um[both], vm[both]) - bearing(ur[both], vr[both])); ad = np.abs(sd)
        out.update({"nDirection": int(both.sum()), "medianAbsDirDiff": np.median(ad), "meanAbsDirDiff": ad.mean()})
        for p, val in zip(PCT, np.percentile(ad, PCT)):
            out[f"p{p}AbsDirDiff"] = val
        out.update({"medianSignedDirDiff": np.median(sd), "fractionCW": float((sd > 0).mean()), "fractionCCW": float((sd < 0).mean()), "fractionZero": float((sd == 0).mean())})
    else:
        out.update({"nDirection": 0, "medianAbsDirDiff": NA, "meanAbsDirDiff": NA, "medianSignedDirDiff": NA, "fractionCW": NA, "fractionCCW": NA, "fractionZero": NA})
        for p in PCT:
            out[f"p{p}AbsDirDiff"] = NA
    out.update({"pearsonU": pearson(um, ur), "pearsonV": pearson(vm, vr)})
    return out


def svg_map(path, title, labels, lon, lat, values, vmin, vmax, kind):
    """Deterministic SVG raster; values shape (nlat, nlon); NaN cells drawn grey. kind: speed | diff | dir."""
    nlat, nlon = values.shape; cell = 6; w, h = nlon * cell + 40, nlat * cell + 90
    def colour(v):
        if np.isnan(v):
            return "#c8c8c8"
        if kind == "dir":
            t = (v + 180.0) / 360.0; t = min(max(t, 0.0), 1.0)  # blue (CCW, negative) -> white -> red (CW, positive)
            if t < 0.5:
                s = t / 0.5; return "#%02x%02x%02x" % (int(30 + 225 * s), int(60 + 195 * s), 255)
            s = (t - 0.5) / 0.5; return "#%02x%02x%02x" % (255, int(255 - 195 * s), int(255 - 225 * s))
        t = 0.0 if vmax <= vmin else min(max((v - vmin) / (vmax - vmin), 0.0), 1.0)
        return "#%02x%02x%02x" % (int(20 + 235 * t), int(40 + 120 * (1 - abs(2 * t - 1))), int(200 - 190 * t))
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">', f'<rect width="{w}" height="{h}" fill="#ffffff"/>', f'<text x="8" y="16" font-family="monospace" font-size="11">{title}</text>']
    for k, lab in enumerate(labels):
        parts.append(f'<text x="8" y="{30 + 11 * k}" font-family="monospace" font-size="9">{lab}</text>')
    y0 = 30 + 11 * len(labels) + 6
    for j in range(nlat):
        for i in range(nlon):
            parts.append(f'<rect x="{20 + i * cell}" y="{y0 + (nlat - 1 - j) * cell}" width="{cell}" height="{cell}" fill="{colour(values[j, i])}"/>')
    scale = f"scale: {vmin:.3f} .. {vmax:.3f} (values above the maximum are drawn at the maximum colour; none are truncated in the table)" if kind != "dir" else "scale: -180 (blue, model counter-clockwise) .. 0 (white) .. +180 (red, model clockwise) degrees"
    parts.append(f'<text x="8" y="{h - 6}" font-family="monospace" font-size="9">{scale}; lon {lon[0]:.3f}..{lon[-1]:.3f}, lat {lat[0]:.3f}..{lat[-1]:.3f}; grey = not valid</text></svg>')
    Path(path).write_text("\n".join(parts), encoding="utf-8")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    figdir = out / "step28-figures"; figdir.mkdir(parents=True, exist_ok=True)
    q = load(PREREG); pb = load(PBLOCK); m = load(MANIFEST); R = q["rules"]; QR = pb["questionRules"]
    if m["phaseAPreregistrationSha256"] != sha(PREREG) or m["phaseBPreregistrationSha256"] != sha(PBLOCK):
        print(json.dumps({"status": "EVALUATION_BLOCKED_IMMUTABILITY"})); return 2
    # trajectory context (frozen STEP 25C table; per-window median GLORYS-HYCOM 72 h separation)
    sep = {}
    with open(TABLE25C, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["GH_sep72h_alpha0.002"] != NA:
                sep.setdefault(row["unit"], []).append(float(row["GH_sep72h_alpha0.002"]))
    traj = {k: float(np.median(v)) for k, v in sep.items()}
    rows = []; windows_out = []; figures = []
    for w in m["windows"]:
        wid = w["windowId"]
        if w["fieldStatus"] != "ELIGIBLE":
            windows_out.append({"windowId": wid, "role": w["role"], "status": "NO_EXACT_AVISO_TIME", "reason": w.get("reason")}); continue
        T = w["avisoTimestamp"]; box = w["oceanBox"]
        with netCDF4.Dataset(ROOT / w["aviso"]["file"]) as nc:
            alon = np.array(nc["longitude"][:], float); alat = np.array(nc["latitude"][:], float); k = w["aviso"]["frameIndex"]
            au = np.ma.filled(nc["u_current"][k, 0].astype(np.float64), np.nan); av = np.ma.filled(nc["v_current"][k, 0].astype(np.float64), np.nan)
        alon180 = np.where(alon > 180.0, alon - 360.0, alon)
        gd15 = load(ROOT / w["glorys"]["D15"]["file"])["grid"]; glon, glat = grid_arrays(gd15); kg = w["glorys"]["D15"]["frameIndex"]
        gu, gv = field_at(gd15, kg, "u"), field_at(gd15, kg, "v")
        gmask = np.array(gd15["landMask"], bool); gu[gmask] = np.nan; gv[gmask] = np.nan  # landMask = masked in any frame (stencil rule)
        has_h = w["hycom"]["status"] == "PASS"
        if has_h:
            hg = load(ROOT / w["hycom"]["file"])["grid"]; hlon, hlat = grid_arrays(hg); kh = w["hycom"]["frameIndex"]; hu, hv = field_at(hg, kh, "u"), field_at(hg, kh, "v")
        # primary grid: AVISO nodes inside the box and inside both model extents
        sel_i = [i for i, x in enumerate(alon180) if box["west"] <= x <= box["east"] and glon[0] <= x <= glon[-1] and (not has_h or hlon[0] <= x <= hlon[-1])]
        sel_j = [j for j, y in enumerate(alat) if box["south"] <= y <= box["north"] and glat[0] <= y <= glat[-1] and (not has_h or hlat[0] <= y <= hlat[-1])]
        xs = np.array([alon180[i] for j in sel_j for i in sel_i]); ys = np.array([alat[j] for j in sel_j for i in sel_i])
        AU = np.array([au[j, i] for j in sel_j for i in sel_i]); AV = np.array([av[j, i] for j in sel_j for i in sel_i])
        GU, GV = bilinear(glon, glat, gu, xs, ys), bilinear(glon, glat, gv, xs, ys)
        valid = ~np.isnan(AU) & ~np.isnan(AV) & ~np.isnan(GU) & ~np.isnan(GV)
        if has_h:
            HU, HV = bilinear(hlon, hlat, hu, xs, ys), bilinear(hlon, hlat, hv, xs, ys); valid &= ~np.isnan(HU) & ~np.isnan(HV)
        wo = {"windowId": wid, "role": w["role"], "timestamp": T, "status": "EVALUATED", "primaryGrid": {"type": "AVISO 0.25 degree native nodes inside the ocean box and both model extents", "nodesInBox": int(len(xs)), "nCommonValid": int(valid.sum()), "lonRange": [float(alon180[sel_i[0]]), float(alon180[sel_i[-1]])], "latRange": [float(alat[sel_j[0]]), float(alat[sel_j[-1]])]},
              "cadence": {"HYCOM": "instantaneous at T" if has_h else "NO_EXACT_HYCOM_TIME", "GLORYS": f"daily mean of the UTC day containing T (label {w['glorys']['D15']['frameLabel']})", "AVISO": "daily product frame at T"}, "comparisons": {}, "depthDiagnostic": {}, "trajectoryContext": {"step25cMedianGlorysHycomSeparation72hKm": traj.get(wid, NA), "source": "docs/research/step25c-paired-table.csv GH_sep72h_alpha0.002 (frozen; not recomputed)"}}
        comps = []
        if has_h:
            comps += [("A", "HYCOM", "GLORYS", HU, HV, GU, GV), ("B", "HYCOM", "AVISO", HU, HV, AU, AV)]
        comps.append(("C", "GLORYS", "AVISO", GU, GV, AU, AV))
        for cid, mn, rn, um, vm, ur, vr in comps:
            met = metrics(um[valid], vm[valid], ur[valid], vr[valid]); wo["comparisons"][cid] = {"model": mn, "reference": rn, "grid": "AVISO_PRIMARY", "glorysDepthMeters": 15.81007, **{k: r6(v) if k != "nCells" and not k.startswith("n") else v for k, v in met.items()}}
            rows.append({"windowId": wid, "role": w["role"], "timestamp": T, "grid": "AVISO_PRIMARY", "comparison": cid, "model": mn, "reference": rn, "glorysDepthMeters": 15.81007, **met})
        # secondary: HYCOM native nodes (A only)
        if has_h:
            hi = [i for i, x in enumerate(hlon) if box["west"] <= x <= box["east"] and glon[0] <= x <= glon[-1]]; hj = [j for j, y in enumerate(hlat) if box["south"] <= y <= box["north"] and glat[0] <= y <= glat[-1]]
            hxs = np.array([hlon[i] for j in hj for i in hi]); hys = np.array([hlat[j] for j in hj for i in hi]); HUn = np.array([hu[j, i] for j in hj for i in hi]); HVn = np.array([hv[j, i] for j in hj for i in hi])
            GUn, GVn = bilinear(glon, glat, gu, hxs, hys), bilinear(glon, glat, gv, hxs, hys); vn = ~np.isnan(HUn) & ~np.isnan(HVn) & ~np.isnan(GUn) & ~np.isnan(GVn)
            met = metrics(HUn[vn], HVn[vn], GUn[vn], GVn[vn]); wo["comparisons"]["A_HYCOM_NATIVE_FIELD_DIAGNOSTIC"] = {"model": "HYCOM", "reference": "GLORYS", "grid": "HYCOM_NATIVE_FIELD_DIAGNOSTIC", "glorysDepthMeters": 15.81007, "nodesInBox": int(len(hxs)), **{k: r6(v) if not k.startswith("n") else v for k, v in met.items()}}
            rows.append({"windowId": wid, "role": w["role"], "timestamp": T, "grid": "HYCOM_NATIVE_FIELD_DIAGNOSTIC", "comparison": "A", "model": "HYCOM", "reference": "GLORYS", "glorysDepthMeters": 15.81007, **met})
        # depth diagnostic (C per level on the same common cells; a level enters only where its own stencil is valid)
        for did in ("D05", "D10", "D15", "D20"):
            if did not in w["glorys"]:
                continue
            spec = w["glorys"][did]
            if did == "D15":
                DU, DV, lvl = GU, GV, 15.81007
            else:
                gg = load(ROOT / spec["file"])["grid"]; lo, la = grid_arrays(gg); kk = spec["frameIndex"]; du_, dv_ = field_at(gg, kk, "u"), field_at(gg, kk, "v"); mk = np.array(gg["landMask"], bool); du_[mk] = np.nan; dv_[mk] = np.nan
                DU, DV, lvl = bilinear(lo, la, du_, xs, ys), bilinear(lo, la, dv_, xs, ys), spec["nativeLevelMeters"]
            vd = valid & ~np.isnan(DU) & ~np.isnan(DV); met = metrics(DU[vd], DV[vd], AU[vd], AV[vd])
            wo["depthDiagnostic"][did] = {"nativeLevelMeters": lvl, "comparison": "C GLORYS vs AVISO", **{k: r6(v) if not k.startswith("n") else v for k, v in met.items()}}
            rows.append({"windowId": wid, "role": w["role"], "timestamp": T, "grid": "AVISO_PRIMARY", "comparison": "C", "model": f"GLORYS_{did}", "reference": "AVISO", "glorysDepthMeters": lvl, **met})
        # figures 1-7 on the AVISO primary grid
        nlat, nlon = len(sel_j), len(sel_i); shape = (nlat, nlon)
        def grid2(vals):
            arr = np.full(len(xs), np.nan); arr[valid] = vals[valid]; return arr.reshape(shape)
        sp = {"AVISO": np.sqrt(AU ** 2 + AV ** 2), "GLORYS": np.sqrt(GU ** 2 + GV ** 2)}
        if has_h:
            sp["HYCOM"] = np.sqrt(HU ** 2 + HV ** 2)
        smax = max(float(np.nanmax(grid2(v))) for v in sp.values()); lonr = [float(alon180[i]) for i in sel_i]; latr = [float(alat[j]) for j in sel_j]
        base = [f"window {wid} ({w['role']})", f"timestamp {T} (AVISO frame; HYCOM instantaneous at T; GLORYS daily mean of the UTC day, label {w['glorys']['D15']['frameLabel']})", "grid AVISO 0.25 degree native nodes", f"valid common cells {int(valid.sum())} of {len(xs)}"]
        def fig(n, name, title, vals, vmin, vmax, kind, extra):
            p = figdir / f"{wid}.fig{n}.{name}.svg"; svg_map(p, f"FIGURE {n} {title}", base + extra, lonr, latr, vals, vmin, vmax, kind); figures.append({"windowId": wid, "figure": n, "file": f"step28-figures/{p.name}", "sha256": sha(p)})
        if has_h:
            fig(1, "hycom-speed", "HYCOM speed (m/s)", grid2(sp["HYCOM"]), 0.0, smax, "speed", ["dataset HYCOM GOFS 3.1 GLBv0.08, 0.08 degree, 15.000 m"])
        fig(2, "glorys-speed", "GLORYS speed (m/s)", grid2(sp["GLORYS"]), 0.0, smax, "speed", ["dataset GLORYS12V1, 1/12 degree, 15.810070 m"])
        fig(3, "aviso-speed", "AVISO geostrophic speed (m/s) - REFERENCE FIELD", grid2(sp["AVISO"]), 0.0, smax, "speed", ["dataset AVISO erdTAgeo1day, 0.25 degree, surface geostrophic"])
        diffs = {"C": np.sqrt((GU - AU) ** 2 + (GV - AV) ** 2)}
        if has_h:
            diffs["A"] = np.sqrt((HU - GU) ** 2 + (HV - GV) ** 2); diffs["B"] = np.sqrt((HU - AU) ** 2 + (HV - AV) ** 2)
        dmax = max(float(np.nanmax(grid2(v))) for v in diffs.values())
        if has_h:
            fig(4, "hycom-glorys-vecdiff", "|HYCOM - GLORYS| vector difference (m/s)", grid2(diffs["A"]), 0.0, dmax, "diff", ["HYCOM 15.000 m vs GLORYS 15.810070 m"])
            fig(5, "hycom-aviso-vecdiff", "|HYCOM - AVISO| vector difference (m/s)", grid2(diffs["B"]), 0.0, dmax, "diff", ["HYCOM 15.000 m vs AVISO surface geostrophic reference"])
        fig(6, "glorys-aviso-vecdiff", "|GLORYS - AVISO| vector difference (m/s)", grid2(diffs["C"]), 0.0, dmax, "diff", ["GLORYS 15.810070 m vs AVISO surface geostrophic reference"])
        if has_h:
            both = valid & (np.sqrt(HU ** 2 + HV ** 2) != 0) & (np.sqrt(GU ** 2 + GV ** 2) != 0); sd = np.full(len(xs), np.nan); sd[both] = wrap(bearing(HU[both], HV[both]) - bearing(GU[both], GV[both]))
            fig(7, "hycom-glorys-dirdiff", "HYCOM - GLORYS signed direction difference (deg)", sd.reshape(shape), -180.0, 180.0, "dir", ["positive = HYCOM rotated clockwise from GLORYS"])
        windows_out.append(wo)
    # table
    buf = io.StringIO(newline=""); wr = csv.writer(buf, lineterminator="\n"); wr.writerow(TCOLS)
    for r in rows:
        wr.writerow([r6(r.get(c)) if c not in ("windowId", "role", "timestamp", "grid", "comparison", "model", "reference", "nCells", "nRelSpeed", "nDirection") else r.get(c, NA) for c in TCOLS])
    table = buf.getvalue().encode("utf-8"); (out / "step28-field-table.csv").write_bytes(table)
    # window summary
    wb = io.StringIO(newline=""); ww = csv.writer(wb, lineterminator="\n")
    ww.writerow(["windowId", "role", "timestamp", "nCommonValid", "medianSpeedHYCOM", "medianSpeedGLORYS", "medianSpeedAVISO", "A_medianVecDiff", "B_medianVecDiff", "C_medianVecDiff", "A_medianAbsDirDiff", "B_medianAbsDirDiff", "C_medianAbsDirDiff", "A_pearsonU", "A_pearsonV", "B_pearsonU", "B_pearsonV", "C_pearsonU", "C_pearsonV", "step25cTrajSep72hKm", "A_impliedDisplacement72hKm"])
    ev = []
    for wo in windows_out:
        if wo["status"] != "EVALUATED":
            ww.writerow([wo["windowId"], wo["role"], NA, 0] + [NA] * 17); continue
        c = wo["comparisons"]; A = c.get("A", {}); B = c.get("B", {}); C = c["C"]; ts = wo["trajectoryContext"]["step25cMedianGlorysHycomSeparation72hKm"]
        implied = r6(A["medianVecDiff"] * 259200 / 1000) if A else NA
        ww.writerow([wo["windowId"], wo["role"], wo["timestamp"], wo["primaryGrid"]["nCommonValid"], A.get("medianModelSpeed", NA), C["medianModelSpeed"], C["medianRefSpeed"], A.get("medianVecDiff", NA), B.get("medianVecDiff", NA), C["medianVecDiff"], A.get("medianAbsDirDiff", NA), B.get("medianAbsDirDiff", NA), C["medianAbsDirDiff"], A.get("pearsonU", NA), A.get("pearsonV", NA), B.get("pearsonU", NA), B.get("pearsonV", NA), C["pearsonU"], C["pearsonV"], r6(ts), implied])
        ev.append(wo)
    (out / "step28-field-window-summary.csv").write_bytes(wb.getvalue().encode("utf-8"))
    # Q1-Q6 per locked Phase B rules
    withA = [wo for wo in ev if "A" in wo["comparisons"]]; withBC = [wo for wo in ev if "B" in wo["comparisons"]]
    def cls(cond_count, total, rule_frac):
        return cond_count / total >= rule_frac if total else False
    q1 = []
    for wo in withA:
        ts = wo["trajectoryContext"]["step25cMedianGlorysHycomSeparation72hKm"]; imp = wo["comparisons"]["A"]["medianVecDiff"] * 259200 / 1000
        ratio = imp / ts if ts not in (NA, 0) else NA; q1.append({"windowId": wo["windowId"], "impliedDisplacement72hKm": r6(imp), "trajectorySeparation72hKm": r6(ts), "ratio": r6(ratio), "class": ("COMPARABLE_ORDER" if 1 / 3 <= ratio <= 3 else ("FIELD_SMALLER" if ratio < 1 / 3 else "FIELD_LARGER")) if ratio != NA else NA})
    q1_counts = {k: sum(1 for x in q1 if x["class"] == k) for k in ("COMPARABLE_ORDER", "FIELD_SMALLER", "FIELD_LARGER")}; q1_label = next((k for k, v in q1_counts.items() if cls(v, len(q1), QR["majorityFraction"])), "MIXED")
    closer = [{"windowId": wo["windowId"], "B_medianVecDiff": wo["comparisons"]["B"]["medianVecDiff"], "C_medianVecDiff": wo["comparisons"]["C"]["medianVecDiff"], "closer": "GLORYS" if wo["comparisons"]["C"]["medianVecDiff"] < wo["comparisons"]["B"]["medianVecDiff"] else ("HYCOM" if wo["comparisons"]["B"]["medianVecDiff"] < wo["comparisons"]["C"]["medianVecDiff"] else "TIE")} for wo in withBC]
    nG = sum(1 for x in closer if x["closer"] == "GLORYS"); nH = sum(1 for x in closer if x["closer"] == "HYCOM")
    q23_label = "GLORYS descriptively closer to the AVISO surface-geostrophic reference under the tested field metric" if cls(nG, len(closer), QR["majorityFraction"]) else ("HYCOM descriptively closer to the AVISO surface-geostrophic reference under the tested field metric" if cls(nH, len(closer), QR["majorityFraction"]) else "no clear field-level difference")
    q4 = []
    for wo in withA:
        a = wo["comparisons"]["A"]; rel = abs(a["medianRelSpeedDiff"]) if a["medianRelSpeedDiff"] != NA else NA; dd = a["medianAbsDirDiff"]; ru, rv = a["pearsonU"], a["pearsonV"]
        mag = rel != NA and rel >= QR["magnitudeThresholdRelative"]; dr = dd != NA and dd >= QR["directionThresholdDegrees"]; pat = (ru != NA and ru < QR["patternCorrelationThreshold"]) or (rv != NA and rv < QR["patternCorrelationThreshold"])
        dom = "MAGNITUDE_AND_DIRECTION" if mag and dr else ("MAGNITUDE" if mag else ("DIRECTION" if dr else ("SPATIAL_STRUCTURE" if pat else "NONE_DOMINANT")))
        q4.append({"windowId": wo["windowId"], "absMedianRelSpeedDiff": r6(rel), "medianAbsDirDiff": r6(dd), "pearsonU": r6(ru), "pearsonV": r6(rv), "lowPatternCorrelation": pat, "dominant": dom})
    q4_counts = {}
    for x in q4:
        q4_counts[x["dominant"]] = q4_counts.get(x["dominant"], 0) + 1
    q4_label = next((k for k, v in sorted(q4_counts.items()) if cls(v, len(q4), QR["majorityFraction"])), "MIXED")
    q5 = []
    for wo in ev:
        dd = wo["depthDiagnostic"]
        if "D05" not in dd or dd["D15"]["nCells"] == 0:
            continue
        base = dd["D15"]["medianVecDiff"]; chg = {k: r6((dd[k]["medianVecDiff"] - base) / base) if base else NA for k in ("D05", "D10", "D20")}
        q5.append({"windowId": wo["windowId"], "D15_medianVecDiff": base, "relativeChange": chg, "maxAbsRelativeChange": r6(max(abs(v) for v in chg.values())), "material": max(abs(v) for v in chg.values()) > QR["depthMaterialRelativeChange"]})
    q5_label = "MATERIAL_CHANGE_WITH_DEPTH" if cls(sum(1 for x in q5 if x["material"]), len(q5), QR["majorityFraction"]) else "NO_MATERIAL_CHANGE_WITH_DEPTH"
    pairs = [(wo["trajectoryContext"]["step25cMedianGlorysHycomSeparation72hKm"], wo["comparisons"]["A"]["medianVecDiff"]) for wo in withA if wo["trajectoryContext"]["step25cMedianGlorysHycomSeparation72hKm"] != NA]
    conc = disc = 0
    for i in range(len(pairs)):
        for j in range(i + 1, len(pairs)):
            s = (pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]); conc += s > 0; disc += s < 0
    q6_frac = conc / (conc + disc) if conc + disc else NA
    q6_label = NA if q6_frac == NA else ("RANK_CONSISTENT" if q6_frac >= QR["rankConsistentFraction"] else ("RANK_INCONSISTENT" if q6_frac <= 1 - QR["rankConsistentFraction"] else "MIXED"))
    questions = {"Q1": {"question": R["questions"]["Q1"], "perWindow": q1, "counts": q1_counts, "label": q1_label, "evidence": "DIRECTLY_SUPPORTED" if len(q1) >= 3 else "INSUFFICIENT_EVIDENCE", "rule": QR["Q1"]},
                 "Q2_Q3": {"question": R["questions"]["Q2"], "perWindow": closer, "counts": {"GLORYS": nG, "HYCOM": nH}, "label": q23_label, "evidence": "DIRECTLY_SUPPORTED" if len(closer) >= 3 else "INSUFFICIENT_EVIDENCE", "rule": QR["Q2Q3"], "caveat": "AVISO is a surface geostrophic reference field, not ground truth"},
                 "Q4": {"question": R["questions"]["Q3"], "perWindow": q4, "counts": q4_counts, "label": q4_label, "evidence": "SUPPORTED_INDICATION" if len(q4) >= 3 else "INSUFFICIENT_EVIDENCE", "rule": QR["Q4"]},
                 "Q4_consistency": {"question": R["questions"]["Q4"], "label": "CONSISTENT" if len(set(x["dominant"] for x in q4)) == 1 and q4 else ("MIXED" if q4 else NA), "evidence": "SUPPORTED_INDICATION" if len(q4) >= 3 else "INSUFFICIENT_EVIDENCE"},
                 "Q5": {"question": R["questions"]["Q5"], "perWindow": q5, "label": q5_label, "evidence": "DIRECTLY_SUPPORTED" if len(q5) >= 3 else "INSUFFICIENT_EVIDENCE", "rule": QR["Q5"], "noDepthRanking": True},
                 "Q6": {"question": R["questions"]["Q6"], "pairs": [{"trajectorySeparationKm": r6(a), "A_medianVecDiff": r6(b)} for a, b in pairs], "concordantPairs": conc, "discordantPairs": disc, "concordantFraction": r6(q6_frac), "label": q6_label, "evidence": "PLAUSIBLE_BUT_UNTESTED" if len(pairs) >= 4 else "INSUFFICIENT_EVIDENCE", "rule": QR["Q6"], "causalAttribution": False}}
    summary = {"ruleId": q["ruleId"], "phase": "B", "status": "STEP28_COMPLETE", "avisoRole": "REFERENCE FIELD DIAGNOSTIC (not ground truth)", "eligibleWindows": [wo["windowId"] for wo in ev], "notAvailable": {"AG-1": "NOT AVAILABLE (NO_EXACT_AVISO_TIME)", "AG-2": "NOT AVAILABLE (NO_EXACT_AVISO_TIME)"}, "KE-H2": "C only (HYCOM exact frame missing per STEP 20; STEP 20 unchanged)",
               "cadenceDistinction": m["cadenceNote"], "labels": R["labels"], "windows": windows_out, "questions": questions, "figures": figures, "modelRunCount": 0, "newDownloads": 0, "parameters": R["parameters"], "interpretation": "DESCRIPTIVE ONLY", "statements": pb["requiredStatements"]}
    (out / "step28-field-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evaluation = {"schemaVersion": "1.0", "ruleId": q["ruleId"], "phase": "B", "status": "EVALUATION_COMPLETE", "phaseAPreregistrationSha256": sha(PREREG), "phaseBPreregistrationSha256": sha(PBLOCK), "manifestSha256": sha(MANIFEST), "tableSha256": hashlib.sha256(table).hexdigest(), "windowSummarySha256": sha(out / "step28-field-window-summary.csv"), "summarySha256": sha(out / "step28-field-summary.json"),
                  "rows": len(rows), "figures": figures, "tool": {"file": "tools/research/evaluate_step28_fields.py", "sha256": sha(__file__)}, "numpy": np.__version__, "deterministic": True, "modelRunCount": 0}
    (out / "step28-field-evaluation.json").write_bytes((json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "EVALUATION_COMPLETE", "windows": [wo["windowId"] for wo in ev], "rows": len(rows), "figures": len(figures), "Q1": q1_label, "Q2Q3": q23_label, "Q4": q4_label, "Q5": q5_label, "Q6": q6_label}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

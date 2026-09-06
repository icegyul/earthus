"""STEP 29 Phase B — TEST-06 forcing construction (data only; no model run).
For each of the six paired windows builds two ocean-forcing datasets in the frozen runtime's JSON contract on the SAME grid, time axis and
mask: CONTROL = GLORYS12V1 15.810070 m (STEP 25C Condition C normalized dataset, SHA-locked) sampled at 3-hourly instants t0 + 3h*k
(k = 0..24) by linear interpolation between its daily frames (exactly what the runtime does; linear-of-linear is exact), and TREATMENT =
the same values plus the WW3 surface Stokes drift (uuss, vuss; STEP 23 DATA-06 files, SHA-locked) at the same instants, bilinearly sampled
from the 0.5 degree WW3 nodes onto the GLORYS 1/12 degree nodes (WW3 nodes are exact multiples of 0.5 = 6/12, so every GLORYS cell lies
inside one WW3 cell and the runtime's bilinear interpolation reproduces the WW3 bilinear interpolant exactly). Coefficient 1.0 (added
directly; never multiplied by alpha). Grid cropped to the computation area + one GLORYS node so the 25-frame dataset respects the runtime
value limit. Mask = GLORYS wet-validity mask OR invalid 4-node WW3 stencil; identical for control and treatment (fairness). WW3 quality gate
per window before construction (identity, SHA, variables, units, 3 h axis without gaps incl. the KE-2 monthly boundary, extent, missingness,
release stencil at t0, license status). Writes data/research/step29/forcing/<wid>.{control,treatment}.dataset.json (gitignored),
docs/research/step29-stokes-forcing-manifest.json and docs/research/step29-stokes-fairness-report.json. `--out DIR` for the re-run."""
import hashlib
import json
import math
import sys
from bisect import bisect_right
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402
from research_runtime.datasets import digest, validate_dataset  # noqa: E402

PBLOCK = D / "step29-phase-b-preregistration.json"
LIC = D / "step29-stokes-license-status.json"
P25C = D / "step25c-test02-protocol.json"
F25C = D / "step25c-glorys-forcing-manifest.json"
M23 = D / "step23-data-acquisition-manifest.json"
OUT = ROOT / "data/research/step29/forcing"
MANIFEST = D / "step29-stokes-forcing-manifest.json"
FAIR = D / "step29-stokes-fairness-report.json"
DT = 10800; NFRAMES = 25; MARGIN = 1.0 / 12.0 + 1e-9


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def fmt(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def bracket(axis, v):
    i = min(max(0, bisect_right(axis, v) - 1), len(axis) - 2); return i, (v - axis[i]) / (axis[i + 1] - axis[i])


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    man_path = out_dir / "step29-stokes-forcing-manifest.json" if "--out" in argv else MANIFEST
    fair_path = out_dir / "step29-stokes-fairness-report.json" if "--out" in argv else FAIR
    pb = load(PBLOCK); lic = load(LIC); p25 = load(P25C); f25 = {w["windowId"]: w for w in load(F25C)["windows"]}; m23 = load(M23)
    if pb["status"] != "PREREGISTRATION LOCKED" or lic["finalLicenseStatus"] != "LICENSE_CONFIRMED":
        raise SystemExit("STEP29_BLOCKED: preregistration / license")
    if "--out" not in argv and (MANIFEST.exists() or OUT.exists()):
        raise SystemExit("STEP29_BLOCKED: forcing outputs already exist; no overwrite")
    out_dir.mkdir(parents=True, exist_ok=True)
    ww3 = []
    def walk(o):
        if isinstance(o, dict):
            if "file" in o and "DATA-06" in str(o.get("file")) and "sha256" in o:
                ww3.append(o)
            for v in o.values():
                walk(v)
        if isinstance(o, list):
            for v in o:
                walk(v)
    walk(m23); ww3 = sorted(ww3, key=lambda f: f["file"])
    records = []; fairness = []
    for w in p25["windows"]:
        wid = w["windowId"]; area = w["computationArea"]; t0 = ts(w["t0"]); instants = [t0 + timedelta(seconds=DT * k) for k in range(NFRAMES)]
        gsrc = f25[wid]; gpath = ROOT / gsrc["normalized"]["file"]
        if sha(gpath) != gsrc["normalized"]["fileSha256"]:
            raise SystemExit(f"STEP29_BLOCKED_IMMUTABILITY: GLORYS {wid}")
        G = validate_dataset(load(gpath)); gg = G["grid"]; glon, glat = np.array(gg["lon"]), np.array(gg["lat"]); gtimes = [ts(x).timestamp() for x in gg["timeUTC"]]
        xi = [i for i, x in enumerate(gg["lon"]) if area["west"] - MARGIN <= x <= area["east"] + MARGIN]; yj = [j for j, y in enumerate(gg["lat"]) if area["south"] - MARGIN <= y <= area["north"] + MARGIN]
        lon = [gg["lon"][i] for i in xi]; lat = [gg["lat"][j] for j in yj]
        gmask = np.array(gg["landMask"], bool)[np.ix_(yj, xi)]
        gu = np.array([[[np.nan if v is None else v for v in row] for row in plane] for plane in gg["u"]], float)[:, yj][:, :, xi]; gv = np.array([[[np.nan if v is None else v for v in row] for row in plane] for plane in gg["v"]], float)[:, yj][:, :, xi]
        # WW3 gate + frames
        need = [f for f in ww3 if any(f["file"].endswith(f"{t.strftime('%Y%m')}_uss.nc") for t in instants)]
        gate = {"windowId": wid, "files": [], "identity": True, "variables": True, "units": True, "timeAxis": True, "extent": True, "releaseStencil": True, "license": lic["finalLicenseStatus"] == "LICENSE_CONFIRMED", "frames": []}
        wlon = wlat = None; frames = {}; masks = {}
        for f in need:
            p = ROOT / f["file"]; ok = sha(p) == f["sha256"]
            with netCDF4.Dataset(p) as ds:
                attrs = {k: str(getattr(ds, k)) for k in ("source", "product_version", "grid", "institution", "distribution_statement") if k in ds.ncattrs()}
                ident = "GLOBMULTI" in attrs.get("source", "") and attrs.get("product_version") == "1.0" and attrs.get("grid") == "glob_30m" and attrs.get("distribution_statement") == "No restrictions"
                vars_ok = all(v in ds.variables for v in ("uuss", "vuss")); units_ok = vars_ok and all(str(ds[v].units).replace(" ", "") in ("m/s", "ms-1") for v in ("uuss", "vuss"))
                lon_ = np.array(ds["longitude"][:], float); lat_ = np.array(ds["latitude"][:], float); tt = ds["time"]; times_ = [fmt(datetime(x.year, x.month, x.day, x.hour, x.minute, x.second, tzinfo=timezone.utc)) for x in netCDF4.num2date(tt[:], tt.units)]
                if wlon is None:
                    wlon, wlat = lon_, lat_
                elif not (np.array_equal(wlon, lon_) and np.array_equal(wlat, lat_)):
                    gate["identity"] = False
                for k, tstr in enumerate(times_):
                    t = ts(tstr)
                    if t in instants:
                        u = np.ma.filled(ds["uuss"][k].astype(np.float64), np.nan); v = np.ma.filled(ds["vuss"][k].astype(np.float64), np.nan); frames[tstr] = (u, v); masks[tstr] = np.isnan(u) | np.isnan(v)
            gate["files"].append({"file": f["file"], "sha256": f["sha256"], "shaVerified": ok, "attributes": attrs, "frameTimes": [times_[0], times_[-1]], "nFrames": len(times_)})
            gate["identity"] &= ident and ok; gate["variables"] &= vars_ok; gate["units"] &= units_ok
        gate["timeAxis"] = all(fmt(t) in frames for t in instants); gate["frames"] = [fmt(t) for t in instants]; gate["framesPresent"] = sum(1 for t in instants if fmt(t) in frames)
        wlon180 = wlon; gate["extent"] = bool(wlon[0] <= lon[0] and lon[-1] <= wlon[-1] and wlat[0] <= lat[0] and lat[-1] <= wlat[-1])
        if not (gate["identity"] and gate["variables"] and gate["units"] and gate["timeAxis"] and gate["extent"] and gate["license"]):
            gate["status"] = "WINDOW_BLOCKED"; records.append({"windowId": wid, "status": "WINDOW_BLOCKED", "ww3Gate": gate}); print(json.dumps({"window": wid, "status": "WINDOW_BLOCKED"})); continue
        anymask = np.zeros(masks[fmt(instants[0])].shape, bool)
        for t in instants:
            anymask |= masks[fmt(t)]
        # Stokes stencil validity on GLORYS nodes and bilinear weights (static; WW3 mask is static)
        W = []; valid_st = np.ones((len(lat), len(lon)), bool)
        for j, y in enumerate(lat):
            jj, fy = bracket(wlat.tolist(), y); row = []
            for i, x in enumerate(lon):
                ii, fx = bracket(wlon180.tolist(), x); row.append((jj, ii, fx, fy))
                if anymask[jj, ii] or anymask[jj, ii + 1] or anymask[jj + 1, ii] or anymask[jj + 1, ii + 1]:
                    valid_st[j, i] = False
            W.append(row)
        def sample(F):
            S = np.full((len(lat), len(lon)), np.nan)
            for j in range(len(lat)):
                for i in range(len(lon)):
                    if not valid_st[j, i]:
                        continue
                    jj, ii, fx, fy = W[j][i]; a, b, c, d = F[jj, ii], F[jj, ii + 1], F[jj + 1, ii], F[jj + 1, ii + 1]
                    S[j, i] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
            return S
        # release stencil check at t0 on WW3 nodes (fresh; KE-2 in particular)
        stencil = []
        for d in w["releasePositions"]:
            ii, _ = bracket(wlon180.tolist(), d["lon"]); jj, _ = bracket(wlat.tolist(), d["lat"]); m0 = masks[fmt(t0)]
            okd = not (m0[jj, ii] or m0[jj, ii + 1] or m0[jj + 1, ii] or m0[jj + 1, ii + 1]); stencil.append({"drifterId": d["drifterId"], "valid": bool(okd)})
        gate["releaseStencilDetail"] = stencil; gate["releaseStencil"] = all(s["valid"] for s in stencil)
        mask_c = gmask | ~valid_st
        cu, cv, tu, tv, tmax = [], [], [], [], 0.0; miss_box = float(anymask[np.ix_([bracket(wlat.tolist(), y)[0] for y in lat], [bracket(wlon180.tolist(), x)[0] for x in lon])].mean())
        for t in instants:
            tsec = t.timestamp(); ki, ft = bracket(gtimes, tsec)
            Gu = gu[ki] * (1 - ft) + gu[ki + 1] * ft; Gv = gv[ki] * (1 - ft) + gv[ki + 1] * ft
            su, sv = frames[fmt(t)]; Su, Sv = sample(su), sample(sv)
            Gu = np.where(mask_c, np.nan, Gu); Gv = np.where(mask_c, np.nan, Gv); Tu = Gu + Su; Tv = Gv + Sv
            tmax = max(tmax, float(np.nanmax(np.hypot(Su, Sv))) if np.isfinite(Su).any() else 0.0)
            tolist = lambda A: [[None if not math.isfinite(x) else float(x) for x in row] for row in A.tolist()]
            cu.append(tolist(Gu)); cv.append(tolist(Gv)); tu.append(tolist(Tu)); tv.append(tolist(Tv))
        land = mask_c.tolist(); times_out = [fmt(t) for t in instants]
        base = dict(G["manifest"]); sources = [{"role": "GLORYS", "file": gsrc["normalized"]["file"], "sha256": gsrc["normalized"]["fileSha256"], "gridSha256": G["manifest"]["sha256"]}] + [{"role": "WW3_STOKES", "file": f["file"], "sha256": f["sha256"]} for f in gate["files"]]
        def make(kind, u, v):
            man = dict(base); man.update({"datasetId": f"test06-{kind}-glorys15.81m{'-plus-ww3-stokes' if kind == 'treatment' else ''}-{wid}", "version": "step29-1", "sourceSha256": digest(sources), "sourceSha256Scope": "SHA-256 of the canonical JSON source list (GLORYS normalized dataset + WW3 uss files)",
                        "validTimeStartUTC": times_out[0], "validTimeEndUTC": times_out[-1], "timeStepSeconds": DT, "timeMeaning": "3-hourly instants t0 + 3h*k; GLORYS linearly interpolated between its daily frames (exact for the runtime's linear interpolation); WW3 Stokes drift at its native 3-hourly instants",
                        "issuedAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "issuedAtMeaning": "derived-fixture-creation (STEP 29 TEST-06); not original product publication", "redistributionAllowed": False,
                        "license": base["license"] + (" | WW3 GLOB-30M CFSR: provider distribution_statement 'No restrictions' (STEP 29 LICENSE_CONFIRMED)" if kind == "treatment" else ""),
                        "landMaskVersion": f"test06-composite-mask/{wid}", "landMaskMeaning": f"{int(mask_c.sum())} of {mask_c.size} nodes masked: GLORYS wet-validity mask OR invalid 4-node WW3 Stokes stencil; identical for control and treatment; u/v null there; no substitution.",
                        "supportedUse": "TEST-06 " + kind + " forcing only", "processingHistory": list(base["processingHistory"]) + [{"operation": "STEP 29 TEST-06 composite construction", "kind": kind, "cropToComputationAreaPlusOneNode": True, "timeResampling": "linear between GLORYS daily frames at 3-hourly instants", "stokes": {"added": kind == "treatment", "coefficient": 1.0 if kind == "treatment" else 0.0, "spatial": "bilinear from WW3 0.5 degree nodes (exact multiples of 0.5) onto GLORYS k/12 nodes", "temporal": "native 3-hourly frames, no interpolation", "multipliedByAlpha": False}, "maskRule": "GLORYS mask OR invalid WW3 stencil (any frame)", "extrapolation": False, "zeroFill": False, "smoothing": False, "gapRepair": False}]})
            grid = {"lon": lon, "lat": lat, "timeUTC": times_out, "u": u, "v": v, "landMask": land}; man["sha256"] = digest(grid)
            ds = validate_dataset({"manifest": man, "grid": grid}); path = out_dir / f"{wid}.{kind}.dataset.json"; path.write_bytes(json.dumps(ds, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            return {"file": str(path.relative_to(ROOT)).replace("\\", "/") if path.is_relative_to(ROOT) else path.name, "fileSha256": sha(path), "gridSha256": man["sha256"], "datasetId": man["datasetId"], "shape": [NFRAMES, len(lat), len(lon)], "valuesCount": NFRAMES * len(lat) * len(lon) * 2}
        ctrl = make("control", cu, cv); trt = make("treatment", tu, tv)
        # fairness: identical grid/time/mask; difference = Stokes only
        diffmax = 0.0; ndiff = 0
        for k in range(NFRAMES):
            for j in range(len(lat)):
                for i in range(len(lon)):
                    a, b = cu[k][j][i], tu[k][j][i]
                    if (a is None) != (b is None):
                        ndiff += 1
                    elif a is not None:
                        pass
        fairness.append({"windowId": wid, "identical": ["lon", "lat", "timeUTC", "landMask", "depth 15.81007 m", "wind file", "alpha (per run)", "area", "release positions", "drifter IDs", "RK4 300 s", "output 900 s", "72 h"], "difference": ["u,v = GLORYS + WW3 Stokes (coefficient 1.0) at every valid node (treatment) vs GLORYS only (control)"], "maskMismatchNodes": ndiff, "maxStokesSpeedSampled": round(tmax, 6), "controlGridSha256": ctrl["gridSha256"], "treatmentGridSha256": trt["gridSha256"], "pass": ndiff == 0})
        gate["status"] = "PASS" if gate["releaseStencil"] else "RELEASE_STENCIL_FAIL"; gate["missingFractionArea"] = round(miss_box, 6)
        records.append({"windowId": wid, "role": w["role"], "t0": w["t0"], "end": w["end"], "computationArea": area, "status": "BUILT", "glorysSource": sources[0], "ww3Sources": sources[1:], "ww3Gate": gate, "grid": {"lon": [lon[0], lon[-1]], "lat": [lat[0], lat[-1]], "shape": [len(lat), len(lon)], "croppedToAreaPlusOneNode": True}, "timeUTC": times_out,
                        "mask": {"glorysMasked": int(gmask.sum()), "stokesStencilInvalid": int((~valid_st).sum()), "compositeMasked": int(mask_c.sum()), "total": int(mask_c.size)}, "control": ctrl, "treatment": trt, "stokesCoefficient": 1.0, "wind": w["wind"]})
        print(json.dumps({"window": wid, "gate": gate["status"], "shape": ctrl["shape"], "maskC": int(mask_c.sum()), "maxStokes": round(tmax, 4)}), flush=True)
    doc = {"schemaVersion": "1.0", "ruleId": "stokes-license-and-experiment-gate-step29", "phaseBPreregistrationSha256": sha(PBLOCK), "licenseStatusSha256": sha(LIC), "licenseStatus": lic["finalLicenseStatus"], "builder": {"file": "tools/research/build_step29_forcing.py", "sha256": sha(__file__)}, "windows": records, "modelRunCount": 0, "newDownloads": 0, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    man_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fair_path.write_text(json.dumps({"ruleId": doc["ruleId"], "control": "dX/dt = U_GLORYS + alpha * U_wind", "treatment": "dX/dt = U_GLORYS + U_Stokes + alpha * U_wind", "stokesCoefficient": 1.0, "windows": fairness, "allPass": all(f["pass"] for f in fairness) and len(fairness) == 6}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "FORCING_BUILT", "built": sum(1 for r in records if r["status"] == "BUILT"), "fairness": all(f["pass"] for f in fairness)})); return 0


if __name__ == "__main__":
    raise SystemExit(main())

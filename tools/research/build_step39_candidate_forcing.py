"""STEP 39 variant (derived from the validated STEP 32 tool by identity/path patches only; algorithm unchanged): STEP 36 cohort windows + STEP 38 acquisition manifest (glorys per window; ww3 files), data/research/step39 outputs.
STEP 32 Phase B — B6 (forcing): candidate composite forcing per locked window, the STEP 29 TEST-06 treatment construction applied
unchanged to the new windows: GLORYS12V1 15.810070 m (STEP 32 normalized dataset, SHA-verified) sampled at the 25 three-hourly instants
t0 + 3h*k by linear interpolation between its daily frames (exact for the runtime's linear interpolation) plus WW3 GLOB-30M CFSR surface
Stokes drift (uuss, vuss) at its native 3-hourly instants, bilinearly sampled from the 0.5 deg WW3 nodes onto the GLORYS k/12 nodes,
coefficient 1.0, added inside U_ocean (never multiplied by alpha). Grid cropped to the computation area + one GLORYS node. Mask = GLORYS
wet-validity mask OR invalid 4-node WW3 stencil (any frame). WW3 quality gate per window (identity, SHA, variables, units, 3 h axis without
gaps, extent, release stencil, STEP 29 license status LICENSE_CONFIRMED). Where the 25-frame composite exceeds the runtime value limit the
STEP 20 B-3 rule is applied on the frame axis (chunk A = frames 0..15 -> segment t0..t0+36h; chunk B = frames 8..24 -> segment t0+36h..
t0+72h; mask identical by construction). No extrapolation, zero fill, smoothing, gap repair. Writes data/research/step32/forcing/candidate/
<wid>.treatment[.chunkA|.chunkB].dataset.json and docs/research/step32-candidate-forcing-manifest.json (`--out DIR` for a re-run)."""
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

MATRIX, ACQ, LIC = D / "step36-cohort-extension-manifest.json", D / "step38-source-acquisition-manifest.json", D / "step29-stokes-license-status.json"
LIC_SHA = "8a8640ac534c1fb9b8551a4a1e777f8a96d6f6c271d896246ed13b8cf93cb24b"
OUT = ROOT / "data/research/step39/forcing/candidate"
MANIFEST = D / "step39-candidate-forcing-manifest.json"
DT = 10800; NFRAMES = 25; MARGIN = 1.0 / 12.0 + 1e-9; MAX_VALUES = 2_000_000
CHUNKS = {"A": (0, 16, [0, 36]), "B": (8, 25, [36, 72])}


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
    man_path = out_dir / MANIFEST.name if "--out" in argv else MANIFEST
    M = load(MATRIX); A = load(ACQ); lic = load(LIC)
    if A["cohortManifestSha256"] != sha(MATRIX) or sha(LIC) != LIC_SHA or lic["finalLicenseStatus"] != "LICENSE_CONFIRMED":
        raise SystemExit("STEP32_BLOCKED_IMMUTABILITY: matrix / acquisition / license")
    if "--out" not in argv and man_path.exists():
        raise SystemExit("STEP32_BLOCKED: candidate forcing manifest exists; no overwrite")
    out_dir.mkdir(parents=True, exist_ok=True)
    ww3 = sorted(A["ww3"]["files"], key=lambda f: f["file"]); gl = {x["windowId"]: x["glorys"] for x in A["windows"]}; records = []
    for w in M["windows"]:
        w = dict(w); w["t0"] = w["start"]; w["releasePositions"] = [{"drifterId": d["drifterId"], "lon": d["startLon"], "lat": d["startLat"]} for d in w["drifters"]]; w["role"] = "NEW_HOLDOUT"
        wid = w["windowId"]; box = w["oceanBox"]; area = {"west": box["west"], "east": box["east"], "south": max(box["south"], -40.0), "north": min(box["north"], 40.0)}; t0 = ts(w["t0"]); instants = [t0 + timedelta(seconds=DT * k) for k in range(NFRAMES)]
        g = gl[wid]
        if g.get("status") != "ok" or "normalized" not in g:
            records.append({"windowId": wid, "status": "WINDOW_BLOCKED", "reason": f"GLORYS {g.get('status')}"}); print(json.dumps({"window": wid, "status": "WINDOW_BLOCKED"})); continue
        gpath = ROOT / g["normalized"]["file"]
        if sha(gpath) != g["normalized"]["fileSha256"]:
            raise SystemExit(f"STEP32_BLOCKED_IMMUTABILITY: GLORYS normalized {wid}")
        G = validate_dataset(load(gpath)); gg = G["grid"]; gtimes = [ts(x).timestamp() for x in gg["timeUTC"]]
        xi = [i for i, x in enumerate(gg["lon"]) if area["west"] - MARGIN <= x <= area["east"] + MARGIN]; yj = [j for j, y in enumerate(gg["lat"]) if area["south"] - MARGIN <= y <= area["north"] + MARGIN]
        lon = [gg["lon"][i] for i in xi]; lat = [gg["lat"][j] for j in yj]
        gmask = np.array(gg["landMask"], bool)[np.ix_(yj, xi)]
        gu = np.array([[[np.nan if v is None else v for v in row] for row in plane] for plane in gg["u"]], float)[:, yj][:, :, xi]; gv = np.array([[[np.nan if v is None else v for v in row] for row in plane] for plane in gg["v"]], float)[:, yj][:, :, xi]
        need = [f for f in ww3 if any(f["file"].endswith(f"{t.strftime('%Y%m')}_uss.nc") for t in instants)]
        gate = {"windowId": wid, "files": [], "identity": True, "variables": True, "units": True, "timeAxis": True, "extent": True, "releaseStencil": True, "license": True, "frames": []}
        wlon = wlat = None; frames = {}; masks = {}
        for f in need:
            p = ROOT / f["file"]; ok = f.get("status") == "ok" and p.exists() and sha(p) == f["sha256"]
            if not ok:
                gate["identity"] = False; gate["files"].append({"file": f["file"], "shaVerified": False}); continue
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
                    if ts(tstr) in instants:
                        u = np.ma.filled(ds["uuss"][k].astype(np.float64), np.nan); v = np.ma.filled(ds["vuss"][k].astype(np.float64), np.nan); frames[tstr] = (u, v); masks[tstr] = np.isnan(u) | np.isnan(v)
            gate["files"].append({"file": f["file"], "sha256": f["sha256"], "shaVerified": ok, "attributes": attrs, "frameTimes": [times_[0], times_[-1]], "nFrames": len(times_)})
            gate["identity"] &= ident; gate["variables"] &= vars_ok; gate["units"] &= units_ok
        gate["timeAxis"] = all(fmt(t) in frames for t in instants); gate["frames"] = [fmt(t) for t in instants]; gate["framesPresent"] = sum(1 for t in instants if fmt(t) in frames)
        gate["extent"] = bool(wlon is not None and wlon[0] <= lon[0] and lon[-1] <= wlon[-1] and wlat[0] <= lat[0] and lat[-1] <= wlat[-1])
        if not (gate["identity"] and gate["variables"] and gate["units"] and gate["timeAxis"] and gate["extent"] and gate["license"]):
            gate["status"] = "WINDOW_BLOCKED"; records.append({"windowId": wid, "status": "WINDOW_BLOCKED", "ww3Gate": gate}); print(json.dumps({"window": wid, "status": "WINDOW_BLOCKED", "gate": {k: gate[k] for k in ("identity", "variables", "units", "timeAxis", "extent")}})); continue
        anymask = np.zeros(masks[fmt(instants[0])].shape, bool)
        for t in instants:
            anymask |= masks[fmt(t)]
        W = []; valid_st = np.ones((len(lat), len(lon)), bool)
        for j, y in enumerate(lat):
            jj, fy = bracket(wlat.tolist(), y); row = []
            for i, x in enumerate(lon):
                ii, fx = bracket(wlon.tolist(), x); row.append((jj, ii, fx, fy))
                if anymask[jj, ii] or anymask[jj, ii + 1] or anymask[jj + 1, ii] or anymask[jj + 1, ii + 1]:
                    valid_st[j, i] = False
            W.append(row)
        def sample(F):
            S = np.full((len(lat), len(lon)), np.nan)
            for j in range(len(lat)):
                for i in range(len(lon)):
                    if valid_st[j, i]:
                        jj, ii, fx, fy = W[j][i]; a, b, c, d = F[jj, ii], F[jj, ii + 1], F[jj + 1, ii], F[jj + 1, ii + 1]; S[j, i] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
            return S
        stencil = []
        for d in w["releasePositions"]:
            ii, _ = bracket(wlon.tolist(), d["lon"]); jj, _ = bracket(wlat.tolist(), d["lat"]); m0 = masks[fmt(t0)]
            stencil.append({"drifterId": d["drifterId"], "valid": bool(not (m0[jj, ii] or m0[jj, ii + 1] or m0[jj + 1, ii] or m0[jj + 1, ii + 1]))})
        gate["releaseStencilDetail"] = stencil; gate["releaseStencil"] = all(s["valid"] for s in stencil); gate["status"] = "PASS" if gate["releaseStencil"] else "RELEASE_STENCIL_FAIL"
        mask_c = gmask | ~valid_st; tu, tv, tmax = [], [], 0.0
        tolist = lambda A_: [[None if not math.isfinite(x) else float(x) for x in row] for row in A_.tolist()]
        for t in instants:
            ki, ft = bracket(gtimes, t.timestamp()); Gu = gu[ki] * (1 - ft) + gu[ki + 1] * ft; Gv = gv[ki] * (1 - ft) + gv[ki + 1] * ft
            su, sv = frames[fmt(t)]; Su, Sv = sample(su), sample(sv); Gu = np.where(mask_c, np.nan, Gu); Gv = np.where(mask_c, np.nan, Gv)
            tmax = max(tmax, float(np.nanmax(np.hypot(Su, Sv))) if np.isfinite(Su).any() else 0.0); tu.append(tolist(Gu + Su)); tv.append(tolist(Gv + Sv))
        land = mask_c.tolist(); times_out = [fmt(t) for t in instants]; base = dict(G["manifest"])
        sources = [{"role": "GLORYS", "file": g["normalized"]["file"], "sha256": g["normalized"]["fileSha256"], "gridSha256": G["manifest"]["sha256"]}] + [{"role": "WW3_STOKES", "file": f["file"], "sha256": f["sha256"]} for f in gate["files"]]
        def make(suffix, fr, kmask_note):
            man = dict(base); tt = times_out[fr[0]:fr[1]]
            man.update({"datasetId": f"step39-treatment-glorys15.81m-plus-ww3-stokes-{wid}{suffix}", "version": "step39-1" + suffix, "sourceSha256": digest(sources), "sourceSha256Scope": "SHA-256 of the canonical JSON source list (GLORYS normalized dataset + WW3 uss files)",
                        "validTimeStartUTC": tt[0], "validTimeEndUTC": tt[-1], "timeStepSeconds": DT, "timeMeaning": "3-hourly instants t0 + 3h*k; GLORYS linearly interpolated between its daily frames; WW3 Stokes drift at its native 3-hourly instants" + kmask_note,
                        "issuedAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "issuedAtMeaning": "derived-fixture-creation (STEP 39 candidate forcing, STEP 29 TEST-06 treatment construction); not original product publication", "redistributionAllowed": False,
                        "license": base["license"] + " | WW3 GLOB-30M CFSR: provider distribution_statement 'No restrictions' (STEP 29 LICENSE_CONFIRMED)", "landMaskVersion": f"step32-composite-mask/{wid}", "landMaskMeaning": f"{int(mask_c.sum())} of {mask_c.size} nodes masked: GLORYS wet-validity mask OR invalid 4-node WW3 Stokes stencil; u/v null there; no substitution.",
                        "supportedUse": "STEP 39 candidate validation forcing only", "processingHistory": list(base["processingHistory"]) + [{"operation": "STEP 29 TEST-06 composite construction applied in STEP 32 (treatment)", "cropToComputationAreaPlusOneNode": True, "timeResampling": "linear between GLORYS daily frames at 3-hourly instants", "stokes": {"added": True, "coefficient": 1.0, "spatial": "bilinear from WW3 0.5 degree nodes onto GLORYS k/12 nodes", "temporal": "native 3-hourly frames, no interpolation", "multipliedByAlpha": False}, "maskRule": "GLORYS mask OR invalid WW3 stencil (any frame)", "extrapolation": False, "zeroFill": False, "smoothing": False, "gapRepair": False, "chunk": suffix or None, "builderScript": "tools/research/build_step39_candidate_forcing.py", "builderSha256": sha(__file__)}]})
            grid = {"lon": lon, "lat": lat, "timeUTC": tt, "u": tu[fr[0]:fr[1]], "v": tv[fr[0]:fr[1]], "landMask": land}; man["sha256"] = digest(grid)
            ds = validate_dataset({"manifest": man, "grid": grid}); path = out_dir / f"{wid}.treatment{suffix}.dataset.json"; path.write_bytes(json.dumps(ds, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            return {"file": str(path.relative_to(ROOT)).replace("\\", "/") if path.is_relative_to(ROOT) else path.name, "fileSha256": sha(path), "gridSha256": man["sha256"], "datasetId": man["datasetId"], "frames": len(tt), "timeStart": tt[0], "timeEnd": tt[-1], "shape": [len(tt), len(lat), len(lon)], "valuesCount": len(tt) * len(lat) * len(lon) * 2}
        values = NFRAMES * len(lat) * len(lon) * 2
        if values <= MAX_VALUES:
            trt = {"chunked": False, **make("", (0, NFRAMES), "")}
        else:
            trt = {"chunked": True, "chunkRule": "STEP 20 B-3 applied on the frame axis: chunk A frames 0..15 -> segment t0..t0+36h; chunk B frames 8..24 -> segment t0+36h..t0+72h; identical mask by construction", "valuesCountFull": values, "chunks": {}}
            for name, (a_, b_, segh) in CHUNKS.items():
                trt["chunks"][name] = {**make(f".chunk{name}", (a_, b_), f"; temporal chunk {name}"), "segment": [fmt(t0 + timedelta(hours=segh[0])), fmt(t0 + timedelta(hours=segh[1]))]}
        records.append({"windowId": wid, "role": "NEW_HOLDOUT", "t0": w["t0"], "end": w["end"], "computationArea": area, "status": "BUILT", "glorysSource": sources[0], "ww3Sources": sources[1:], "ww3Gate": gate, "grid": {"lon": [lon[0], lon[-1]], "lat": [lat[0], lat[-1]], "shape": [len(lat), len(lon)], "croppedToAreaPlusOneNode": True}, "timeUTC": times_out,
                        "mask": {"glorysMasked": int(gmask.sum()), "stokesStencilInvalid": int((~valid_st).sum()), "compositeMasked": int(mask_c.sum()), "total": int(mask_c.size)}, "treatment": trt, "stokesCoefficient": 1.0, "maxStokesSpeedSampled": round(tmax, 6), "depthMeters": 15.81007})
        print(json.dumps({"window": wid, "gate": gate["status"], "chunked": trt["chunked"], "values": values, "maskC": int(mask_c.sum()), "maxStokes": round(tmax, 4)}), flush=True)
    doc = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B6-forcing", "cohortManifestSha256": sha(MATRIX), "acquisitionManifestSha256": sha(ACQ), "licenseStatusSha256": LIC_SHA, "licenseStatus": lic["finalLicenseStatus"], "builder": {"file": "tools/research/build_step39_candidate_forcing.py", "sha256": sha(__file__)}, "construction": "STEP 29 TEST-06 treatment (tools/research/build_step29_forcing.py algorithm) applied unchanged", "stokesCoefficient": 1.0, "stokesMultipliedByAlpha": False,
           "windows": records, "builtCount": sum(1 for r in records if r["status"] == "BUILT"), "modelRunCount": 0, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    man_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "FORCING_BUILT", "built": doc["builtCount"], "blocked": sum(1 for r in records if r["status"] != "BUILT")})); return 0 if doc["builtCount"] == len(records) else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""STEP 26 Phase B — Condition D GLORYS_COARSE_DAILY: deterministic bilinear interpolation of the STEP 25C normalized GLORYS
daily fields (Condition C source, SHA-locked) onto the exact immutable HYCOM lon/lat nodes of each window (axes SHA locked in the
STEP 26 Phase A rule file). Algorithm id glorys-to-hycom-grid-bilinear/1. A target node is valid only if all four GLORYS stencil
nodes are wet (landMask false, i.e. valid in every frame); otherwise null and landMask=true. No nearest-neighbour substitution,
zero fill, smoothing, extrapolation, or temporal change. Time labels and cadence identical to C. Writes
data/research/step26/forcing/<wid>.glorys-coarse.dataset.json (gitignored) and docs/research/step26-derived-forcing-manifest.json.
`--out DIR` derives to another directory (independent derivation validation). Pure Python floats; no randomness."""
import hashlib
import json
import sys
from bisect import bisect_right
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
from research_runtime.datasets import digest, validate_dataset  # noqa: E402  (frozen runtime, read-only use)

RULE = ROOT / "docs/research/step26-forcing-decomposition-rule.json"
PREREG = ROOT / "docs/research/step26-preregistration.json"
OUT = ROOT / "data/research/step26/forcing"
MANIFEST = ROOT / "docs/research/step26-derived-forcing-manifest.json"
ALGORITHM = "glorys-to-hycom-grid-bilinear/1"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def axes_sha(grid):
    return hashlib.sha256(json.dumps({"lon": grid["lon"], "lat": grid["lat"]}, separators=(",", ":")).encode()).hexdigest()


def bracket(axis, value):
    if value < axis[0] or value > axis[-1]:
        return None
    i = min(max(0, bisect_right(axis, value) - 1), len(axis) - 2)
    return i, (value - axis[i]) / (axis[i + 1] - axis[i])


def derive(src, target_lon, target_lat):
    g = src["grid"]; lon, lat, mask = g["lon"], g["lat"], g["landMask"]
    xs = [bracket(lon, x) for x in target_lon]; ys = [bracket(lat, y) for y in target_lat]
    if any(b is None for b in xs + ys):
        raise ValueError("target node outside the GLORYS extent; extrapolation is forbidden")
    valid = [[not (mask[yi][xi] or mask[yi][xi + 1] or mask[yi + 1][xi] or mask[yi + 1][xi + 1]) for (xi, _) in xs] for (yi, _) in ys]
    out = {"u": [], "v": []}
    for comp in ("u", "v"):
        for plane in g[comp]:
            rows = []
            for j, (yi, fy) in enumerate(ys):
                row = []
                for i, (xi, fx) in enumerate(xs):
                    if not valid[j][i]:
                        row.append(None); continue
                    a, b, c, d = plane[yi][xi], plane[yi][xi + 1], plane[yi + 1][xi], plane[yi + 1][xi + 1]
                    row.append((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
                rows.append(row)
            out[comp].append(rows)
    land = [[not v for v in row] for row in valid]
    return {"lon": list(target_lon), "lat": list(target_lat), "timeUTC": list(g["timeUTC"]), "u": out["u"], "v": out["v"], "landMask": land}, sum(1 for row in valid for v in row if not v)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else OUT
    manifest_path = out_dir / "step26-derived-forcing-manifest.json" if "--out" in argv else MANIFEST
    R = load(RULE); q = load(PREREG)
    if sha(RULE) != q["ruleSha256"] or q["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP26_BLOCKED_IMMUTABILITY: rule/preregistration")
    if "--out" not in argv and (MANIFEST.exists() or OUT.exists()):
        raise SystemExit("STEP26_BLOCKED: derived forcing already exists; no overwrite")
    out_dir.mkdir(parents=True, exist_ok=True)
    cond = R["conditions"][3]; records = []
    for w in R["windows"]:
        src_path = ROOT / w["glorysNormalized"]["file"]
        if sha(src_path) != w["glorysNormalized"]["fileSha256"]:
            raise SystemExit(f"STEP26_BLOCKED_IMMUTABILITY: GLORYS source {w['windowId']}")
        src = validate_dataset(load(src_path))
        hy = load(ROOT / w["hycomGrid"]["file"])["grid"]
        if axes_sha(hy) != w["hycomGrid"]["axesSha256"] or sha(ROOT / w["hycomGrid"]["file"]) != w["hycomGrid"]["fileSha256"]:
            raise SystemExit(f"STEP26_BLOCKED_IMMUTABILITY: HYCOM target grid {w['windowId']}")
        grid, masked = derive(src, hy["lon"], hy["lat"])
        sm = src["manifest"]
        manifest = dict(sm)
        manifest.update({"datasetId": f"glorys12v1-coarse-hycomgrid-15.81m-{w['windowId']}", "version": "step26-1", "spatialResolutionDegrees": {"lat": 0.08, "lon": 0.08}, "sha256": digest(grid),
                         "issuedAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "issuedAtMeaning": "derived-fixture-creation (STEP 26 Condition D); not original product publication",
                         "landMaskVersion": f"GLORYS12V1-coarse-stencil-mask/{w['windowId']}", "landMaskMeaning": f"{masked} of {len(hy['lat']) * len(hy['lon'])} HYCOM-grid nodes have at least one GLORYS stencil node masked and are landMask=true with u/v=null; no substitution.",
                         "derivedFrom": {"conditionC": {"datasetId": sm["datasetId"], "version": sm["version"], "gridSha256": sm["sha256"], "fileSha256": w["glorysNormalized"]["fileSha256"], "rawSha256": w["glorysNormalized"]["rawSha256"]}},
                         "supportedUse": "STEP 26 Condition D (spatial representation sensitivity) only",
                         "processingHistory": list(sm["processingHistory"]) + [{"operation": ALGORITHM, "interpolation": "bilinear", "targetGrid": {"source": w["hycomGrid"]["file"], "axesSha256": w["hycomGrid"]["axesSha256"], "resolutionDegrees": 0.08}, "stencilRule": cond["spatial"]["stencilRule"],
                                                                              "smoothing": False, "extrapolation": False, "nearestNeighbourSubstitution": False, "zeroFill": False, "temporalTransformation": False, "verticalInterpolation": False, "derivationScript": "tools/research/derive_step26_coarse.py", "derivationScriptSha256": sha(__file__)}]})
        dataset = validate_dataset({"manifest": manifest, "grid": grid})
        path = out_dir / f"{w['windowId']}.glorys-coarse.dataset.json"
        path.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        fields = [{"timeUTC": t, "uSha256": hashlib.sha256(json.dumps(grid["u"][k], separators=(",", ":")).encode()).hexdigest(), "vSha256": hashlib.sha256(json.dumps(grid["v"][k], separators=(",", ":")).encode()).hexdigest(),
                   "sourceTimeUTC": src["grid"]["timeUTC"][k], "dimensions": [len(grid["lat"]), len(grid["lon"])]} for k, t in enumerate(grid["timeUTC"])]
        records.append({"windowId": w["windowId"], "role": w["role"], "source": {"file": w["glorysNormalized"]["file"], "fileSha256": w["glorysNormalized"]["fileSha256"], "gridSha256": sm["sha256"], "rawGlorysSha256": w["glorysNormalized"]["rawSha256"], "timestamps": src["grid"]["timeUTC"], "sourceShape": [len(src["grid"]["timeUTC"]), len(src["grid"]["lat"]), len(src["grid"]["lon"])]},
                        "targetGrid": {"file": w["hycomGrid"]["file"], "axesSha256": w["hycomGrid"]["axesSha256"], "shape": [len(hy["lat"]), len(hy["lon"])], "resolutionDegrees": 0.08, "immutable": True},
                        "interpolation": "bilinear", "algorithm": ALGORITHM, "maskRule": cond["spatial"]["stencilRule"], "depthMeters": 15.81007, "verticalInterpolation": False, "temporalTransformation": False,
                        "derived": {"file": str(path.relative_to(ROOT)).replace("\\", "/") if path.is_relative_to(ROOT) else path.name, "fileSha256": sha(path), "gridSha256": dataset["manifest"]["sha256"], "datasetId": dataset["manifest"]["datasetId"], "version": "step26-1", "shape": [len(grid["timeUTC"]), len(grid["lat"]), len(grid["lon"])], "maskedNodes": masked, "fields": fields}, "status": "DERIVED"})
        print(json.dumps({"window": w["windowId"], "shape": records[-1]["derived"]["shape"], "masked": masked, "gridSha256": dataset["manifest"]["sha256"][:16]}), flush=True)
    doc = {"schemaVersion": "1.0", "ruleId": R["ruleId"], "ruleSha256": sha(RULE), "condition": "D GLORYS_COARSE_DAILY", "algorithm": ALGORITHM, "derivationScript": {"file": "tools/research/derive_step26_coarse.py", "sha256": sha(__file__)}, "windows": records, "windowCount": len(records), "modelRunCount": 0}
    manifest_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "DERIVED", "windows": len(records)})); return 0


if __name__ == "__main__":
    raise SystemExit(main())

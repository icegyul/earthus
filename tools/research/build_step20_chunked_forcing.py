"""STEP 20 Phase B-3: deterministic TEMPORAL CHUNKING of holdout forcing for units whose full 72 h dataset exceeds the immutable
runtime limit (datasets.MAX_VALUES = 2,000,000 values, enforced by validate_dataset — V1 immutable source, never changed).

Rule (locked in docs/research/step20-b3-forcing-resolution-protocol.md §3): the SAME raw NCSS files (same SHA) are read by the
UNCHANGED reader (netcdf_reader.build_dataset) as two overlapping temporal chunks —
  chunk A = parts {day1, day2}       → frames t0+0h .. t0+45h (16 frames)   used for model segment 1: t0 .. t0+36h
  chunk B = parts {day2, day3, day4} → frames t0+24h .. t0+72h (17 frames)  used for model segment 2: t0+36h .. t0+72h
and each chunk's landMask is replaced by the union of the wet-validity mask over ALL 25 frames of the full window (exactly what the
single reader computes), so every value the model can see is identical to a single-reader dataset. No value is modified,
resampled, interpolated, extrapolated, filled or duplicated; the spatial/temporal domain is not reduced.

Equivalence proof (§9): the same procedure is applied to a unit the single reader CAN process (KE-H3, and the four STEP 17 calibration
units); each chunk frame must be bitwise identical to the single-reader dataset frame, and the union landMask must equal the single-reader
landMask. Any difference → STOP. KE-H2 is confirmed FORCING_UNAVAILABLE from the raw source frames (gap evidence recorded). No model run."""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402  (.deps)
import numpy as np  # noqa: E402
from research_runtime.datasets import RegularGrid, ForcingBoundary, utc_seconds, digest, validate_dataset  # noqa: E402
from research_runtime.netcdf_reader import build_dataset  # noqa: E402

B2 = ROOT / "docs/research/step20-holdout-forcing-manifest.json"
B2_SHA = "8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b"
FM17 = ROOT / "docs/research/step17-forcing-manifest.json"
FM17_SHA = "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86"
PREREG20 = ROOT / "docs/research/step20-preregistration.json"
DATA = ROOT / "data/research/step20/holdout/forcing"
OUT = ROOT / "docs/research/step20-b3-holdout-forcing-manifest.json"
ISSUED = "2026-09-06T05:00:00Z"
SEGMENT_HOURS = 36
CHUNKS = {"A": {"parts": [0, 1], "segment": [0, 36]}, "B": {"parts": [1, 2, 3], "segment": [36, 72]}}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def raw_union_mask(paths):
    """Wet-validity union over ALL frames of the raw parts, computed exactly as the single reader does (finite in every frame)."""
    wet = None; frames = []
    for path in paths:
        with netCDF4.Dataset(path) as d:
            u, v = d["water_u"][:, 0], d["water_v"][:, 0]
            uf, vf = np.ma.filled(u.astype(float), np.nan), np.ma.filled(v.astype(float), np.nan)
            uf[np.ma.getmaskarray(u)] = np.nan; vf[np.ma.getmaskarray(v)] = np.nan
            w = np.isfinite(uf).all(axis=0) & np.isfinite(vf).all(axis=0)
            wet = w if wet is None else (wet & w)
            frames += [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in netCDF4.num2date(d["time"][:], d["time"].units, calendar=d["time"].calendar)]
    return (~wet).tolist(), sorted(frames)


def build_chunks(window_id, dataset_id_base, hycom_files, box, t0):
    """Returns {chunk: (dataset, meta)} built by the unchanged reader, with landMask := union over all 25 raw frames."""
    paths = [(DATA / window_id / "hycom" / f["filename"], f["query"]) for f in hycom_files]
    union_mask, all_frames = raw_union_mask([p for p, _ in paths])
    expected = [(t0 + timedelta(hours=3 * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(25)]
    if all_frames != expected:
        raise SystemExit(f"{window_id}: raw frames differ from the 25 expected: missing {sorted(set(expected) - set(all_frames))}")
    chunks = {}
    for name, spec in CHUNKS.items():
        parts = [paths[i] for i in spec["parts"]]
        seg_s, seg_e = (t0 + timedelta(hours=spec["segment"][0])).strftime("%Y-%m-%dT%H:%M:%SZ"), (t0 + timedelta(hours=spec["segment"][1])).strftime("%Y-%m-%dT%H:%M:%SZ")
        ds, sources, meta = build_dataset(f"{dataset_id_base}-chunk{name.lower()}", f"{seg_s[:13]}_{seg_e[:13]}.earthus1.chunk{name}", parts, 15,
                                          f"{box['south']:.2f}..{box['north']:.2f} / {box['west']:.2f}..{box['east']:.2f}", ISSUED)
        native_mask = ds["grid"]["landMask"]
        ds["grid"]["landMask"] = union_mask                      # single-reader semantics: masked in ANY of the 25 frames
        ds["manifest"]["sha256"] = digest(ds["grid"])
        ds["manifest"]["landMaskVersion"] = f"HYCOM-wet-validity-mask/53X-{window_id}-full-window-union"
        ds["manifest"]["landMaskMeaning"] = f"{sum(union_mask[i][j] for i in range(len(union_mask)) for j in range(len(union_mask[0])))} of {len(union_mask) * len(union_mask[0])} nodes masked in at least one of the 25 full-window frames (union applied to this temporal chunk; identical to single-reader semantics)"
        ds["manifest"]["processingHistory"].append({"operation": "STEP 20 B-3 temporal chunk: same raw files, unchanged reader; landMask replaced by the full-window union mask; u/v untouched",
                                                    "chunk": name, "parts": [p.name for p, _ in parts], "modelSegmentHours": spec["segment"], "valuesModified": False, "framesInterpolated": False,
                                                    "nativeChunkMaskDiffersFromUnion": native_mask != union_mask})
        ds = validate_dataset(ds)
        chunks[name] = (ds, {"frames": len(ds["grid"]["timeUTC"]), "timeStart": ds["grid"]["timeUTC"][0], "timeEnd": ds["grid"]["timeUTC"][-1], "shape": meta["shape"],
                             "values": meta["shape"][0] * meta["shape"][1] * meta["shape"][2] * 2, "segment": [seg_s, seg_e], "nativeMaskDiffers": native_mask != union_mask, "parts": [p.name for p, _ in parts]})
    return chunks, union_mask


def equivalence(chunks, full):
    """Bitwise comparison of every chunk frame against the single-reader dataset frame; landMask must equal."""
    fg = full["grid"]; idx = {t: i for i, t in enumerate(fg["timeUTC"])}
    report = {"axesEqual": all(chunks[c][0]["grid"]["lon"] == fg["lon"] and chunks[c][0]["grid"]["lat"] == fg["lat"] for c in chunks), "framesCompared": 0, "framesEqual": 0, "landMaskEqual": all(chunks[c][0]["grid"]["landMask"] == fg["landMask"] for c in chunks)}
    for c, (ds, _) in chunks.items():
        for i, t in enumerate(ds["grid"]["timeUTC"]):
            report["framesCompared"] += 1
            if ds["grid"]["u"][i] == fg["u"][idx[t]] and ds["grid"]["v"][i] == fg["v"][idx[t]]:
                report["framesEqual"] += 1
    report["equivalent"] = report["axesEqual"] and report["landMaskEqual"] and report["framesCompared"] == report["framesEqual"]
    return report


def main():
    if sha(B2) != B2_SHA or sha(FM17) != FM17_SHA:
        raise SystemExit("B3_BLOCKED_IMMUTABILITY")
    b2 = json.loads(B2.read_text(encoding="utf-8")); fm17 = json.loads(FM17.read_text(encoding="utf-8")); p20 = json.loads(PREREG20.read_text(encoding="utf-8"))
    hold = {u["windowId"]: u for u in p20["holdout"]["runUnits"]}
    for u in b2["runUnits"]:
        for f in u["hycom"]["files"] + u["ncep"]["files"]:
            if sha(DATA / u["windowId"] / ("hycom" if f["product"].startswith("water") else "ncep") / f["filename"]) != f["sha256"]:
                raise SystemExit(f"B3_BLOCKED_IMMUTABILITY: raw {f['filename']}")
    out = {"schemaVersion": "1.0", "phase": "STEP 20 B-3 forcing resolution", "b2ManifestSha256": B2_SHA, "chunkRule": {"segmentHours": SEGMENT_HOURS, "chunks": CHUNKS, "landMask": "union over all 25 full-window frames", "readerChanged": False, "runtimeChanged": False},
           "equivalenceTests": {}, "runUnits": [], "modelRun": False, "trajectoryComputed": False, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    # --- equivalence tests on datasets the single reader can process: KE-H3 (holdout, B-2 PASS) and the four STEP 17 calibration units ---
    tests = [("KE-H3", DATA, next(u for u in b2["runUnits"] if u["windowId"] == "KE-H3"))] + [(u["windowId"], ROOT / "data/research/step17", u) for u in fm17["runUnits"]]
    for wid, root, u in tests:
        full = validate_dataset(json.loads((ROOT / u["hycom"]["normalized"]["file"]).read_text(encoding="utf-8")))
        t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        saved = DATA; globals()["DATA"] = root
        try:
            chunks, _ = build_chunks(wid, f"eqtest-{wid.lower()}", u["hycom"]["files"], u["oceanDomain"], t0)
        finally:
            globals()["DATA"] = saved
        rep = equivalence(chunks, full); rep["fullGridSha256"] = full["manifest"]["sha256"]; rep["nativeChunkMaskDiffers"] = {c: m["nativeMaskDiffers"] for c, (_, m) in chunks.items()}
        out["equivalenceTests"][wid] = rep
        print(json.dumps({"equivalence": wid, **{k: rep[k] for k in ("axesEqual", "landMaskEqual", "framesCompared", "framesEqual", "equivalent", "nativeChunkMaskDiffers")}}), flush=True)
        if not rep["equivalent"]:
            raise SystemExit(f"CHUNK_EQUIVALENCE_FAIL {wid}")
    # --- holdout units ---
    for u in b2["runUnits"]:
        wid = u["windowId"]; t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        rec = {"windowId": wid, "t0": u["t0"], "end": u["end"], "drifterIds": u["drifterIds"], "drifterCount": u["drifterCount"], "oceanDomain": u["oceanDomain"], "windDomain": u["windDomain"], "forcingSha256": u["forcingSha256"],
               "b2Status": u["status"], "b2Reasons": u["statusReasons"], "ncep": u["ncep"]}
        _, frames = raw_union_mask([DATA / wid / "hycom" / f["filename"] for f in u["hycom"]["files"]])
        expected = [(t0 + timedelta(hours=3 * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(25)]
        missing = sorted(set(expected) - set(frames))
        if missing:
            adj = {m: [f for f in frames if abs((datetime.strptime(f, "%Y-%m-%dT%H:%M:%SZ") - datetime.strptime(m, "%Y-%m-%dT%H:%M:%SZ")).total_seconds()) == 10800] for m in missing}
            rec.update({"status": "FORCING_UNAVAILABLE", "resolution": "source frame absent in HYCOM expt_53.X; never interpolated, duplicated, filled or substituted; unit not modeled",
                        "missingRequiredOceanFrames": missing, "availableAdjacentFrames": adj, "rawFramesPresent": len(frames)})
        elif u["status"] == "FORCING_ACQUISITION_PASS":
            rec.update({"status": "FORCING_AVAILABLE", "resolution": "single-reader dataset (B-2 PASS) used as is", "hycom": {k: u["hycom"][k] for k in ("files", "qc", "normalized")}, "chunked": False})
        else:
            chunks, union_mask = build_chunks(wid, f"hycom-gofs31-53x-{wid.lower()}-15m", u["hycom"]["files"], u["oceanDomain"], t0)
            ndir = DATA / "normalized"; ndir.mkdir(parents=True, exist_ok=True)
            rec.update({"status": "FORCING_AVAILABLE_CHUNKED", "resolution": "deterministic temporal chunking (2 overlapping chunks, unchanged reader, full-window union landMask); model segments t0..t0+36h and t0+36h..t0+72h",
                        "hycom": {"files": u["hycom"]["files"], "chunks": {}}, "chunked": True, "fullWindowValues": 25 * len(union_mask) * len(union_mask[0]) * 2, "runtimeLimit": 2000000})
            grid_full = None
            for name, (ds, meta) in chunks.items():
                path = ndir / f"{wid}.hycom15m.chunk{name}.dataset.json"; blob = canonical(ds) + b"\n"; path.write_bytes(blob)
                g = ds["grid"]; u_arr = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in g["u"]]); v_arr = np.array([[[np.nan if x is None else x for x in row] for row in plane] for plane in g["v"]])
                grid = RegularGrid(ds); stencil = []
                for d in hold[wid]["releasePositions"]:
                    try:
                        grid.velocity(utc_seconds(meta["segment"][0]) if name == "A" else utc_seconds(meta["segment"][0]), d["lon"], d["lat"]); stencil.append({"drifterId": d["drifterId"], "wet": True})
                    except ForcingBoundary as exc:
                        stencil.append({"drifterId": d["drifterId"], "wet": False, "status": exc.status})
                rec["hycom"]["chunks"][name] = {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "fileSha256": hashlib.sha256(blob).hexdigest(), "gridSha256": ds["manifest"]["sha256"], "datasetId": ds["manifest"]["datasetId"], "version": ds["manifest"]["version"],
                                                **meta, "missingRate": float(1 - (np.isfinite(u_arr) & np.isfinite(v_arr)).mean()), "withinPhysicalBounds": bool(np.nanmax(np.abs(u_arr)) <= 5 and np.nanmax(np.abs(v_arr)) <= 5),
                                                "releaseStencilAtSegmentStart": stencil if name == "A" else "evaluated at run time from segment-1 end positions"}
            # overlap frames between chunks must be bitwise identical
            a, b = chunks["A"][0]["grid"], chunks["B"][0]["grid"]; ia = {t: i for i, t in enumerate(a["timeUTC"])}
            overlap = [t for t in b["timeUTC"] if t in ia]
            rec["hycom"]["overlapFrames"] = len(overlap); rec["hycom"]["overlapBitwiseEqual"] = all(a["u"][ia[t]] == b["u"][b["timeUTC"].index(t)] and a["v"][ia[t]] == b["v"][b["timeUTC"].index(t)] for t in overlap) and a["landMask"] == b["landMask"]
            rec["hycom"]["framesCoveredByChunks"] = sorted(set(a["timeUTC"]) | set(b["timeUTC"])) == expected
            if not (rec["hycom"]["overlapBitwiseEqual"] and rec["hycom"]["framesCoveredByChunks"]):
                raise SystemExit(f"CHUNK_CONSISTENCY_FAIL {wid}")
        out["runUnits"].append(rec)
        print(json.dumps({"window": wid, "status": rec["status"]}), flush=True)
    out["summary"] = {u["windowId"]: u["status"] for u in out["runUnits"]}
    out["evaluableDrifters"] = sum(u["drifterCount"] for u in out["runUnits"] if u["status"].startswith("FORCING_AVAILABLE"))
    out["unavailableDrifters"] = sum(u["drifterCount"] for u in out["runUnits"] if u["status"] == "FORCING_UNAVAILABLE")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(OUT.relative_to(ROOT)), "summary": out["summary"], "evaluable": out["evaluableDrifters"], "unavailable": out["unavailableDrifters"], "sha256": sha(OUT)}), flush=True)


if __name__ == "__main__":
    main()

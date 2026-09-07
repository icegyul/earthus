"""STEP 48 - deterministic data freeze for the acquired validation-extension sources. Inventory and verification only:
walks data/research/step48/, records every file with SHA-256, byte size, relative path and artefact class (ORIGINAL_SOURCE for the raw
NCSS / FTP / toolbox downloads, DERIVED_PREPARATION for the runtime JSON datasets built by the frozen readers), re-verifies every hash and
size against the acquisition manifest, checks the per-window required-frame and coverage records, the coordinate convention and the source
identities, and writes docs/research/step48-validation-data-freeze-manifest.json. Originals are never modified or rewritten. No trajectory,
model, endpoint, error, bootstrap or performance computation occurs here (`--out DIR` for the independent replay)."""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
DATA = ROOT / "data/research/step48"
ACQ = D / "step48-validation-source-acquisition-manifest.json"
PROTO = D / "step48-validation-source-acquisition-protocol.json"
FMT = "%Y-%m-%dT%H:%M:%SZ"


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def artefact_class(rel):
    return "DERIVED_PREPARATION" if "/normalized/" in rel else "ORIGINAL_SOURCE"


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_dir = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out_dir.mkdir(parents=True, exist_ok=True)
    acq, proto = load(ACQ), load(PROTO)
    failures = []
    # ---- inventory ----
    files = sorted(p for p in DATA.rglob("*") if p.is_file() and not p.name.endswith(".part"))
    inventory = []
    for p in files:
        rel = str(p.relative_to(ROOT)).replace("\\", "/")
        inventory.append({"relativePath": rel, "sha256": sha(p), "bytes": p.stat().st_size, "class": artefact_class(rel)})
    by_path = {e["relativePath"]: e for e in inventory}
    # ---- verify every manifest-recorded artefact against the inventory ----
    recorded = []
    for f in acq["ww3"]["files"]:
        if f["status"] in ("ok", "reused"):
            recorded.append(("ww3:" + f["month"], f["relativePath"], f["sha256"], f["bytes"]))
    for w in acq["windows"]:
        for e in w["hycomWindowParts"] + w["hycomDayParts"] + w["ncep"]:
            if e["status"] in ("ok", "reused"):
                recorded.append((f"{w['windowId']}:{e['filename']}", e["relativePath"], e["sha256"], e["bytes"]))
        for key in ("hycomDataset", "ncepDataset"):
            if key in w:
                d = w[key]; recorded.append((f"{w['windowId']}:{key}", d["relativePath"], d["sha256"], d["bytes"]))
        g = w.get("glorys") or {}
        if g.get("status") in ("ok", "reused") and "relativePath" in g:
            recorded.append((f"{w['windowId']}:glorys", g["relativePath"], g["sha256"], g["bytes"]))
            if "dataset" in g:
                d = g["dataset"]; recorded.append((f"{w['windowId']}:glorysDataset", d["relativePath"], d["sha256"], d["bytes"]))
    for label, rel, h, n in recorded:
        e = by_path.get(rel)
        if e is None:
            failures.append(f"missing on disk: {label} {rel}")
        elif e["sha256"] != h or e["bytes"] != n:
            failures.append(f"checksum/size mismatch: {label} {rel}")
    # ---- coverage / coordinate / identity checks ----
    windows = []
    for w in acq["windows"]:
        cov = w.get("hycomCoverage") or {}
        day = w.get("hycomDayCoverage") or {}
        g = w.get("glorys") or {}
        entry = {"windowId": w["windowId"], "region": w["region"], "status": w["status"], "t0": w["t0"], "end": w["end"],
                 "oceanBox": w["oceanBox"], "drifters": len(w["drifterIds"]),
                 "hycomNativeFrames": cov.get("frames"), "hycomFramesExpected": 25,
                 "hycomDayFiles": [day.get("filesAcquired"), day.get("filesRequired")], "hycomDayFrames": [day.get("framesAcquired"), day.get("framesRegistered")],
                 "hycomCoversBox": cov.get("coversBoxInOwnConvention"), "coordinateConvention": cov.get("convention"), "transformApplied": cov.get("transformApplied"),
                 "ncepFrames": (w.get("ncepDataset") or {}).get("frames"),
                 "glorysStatus": g.get("status"), "glorysFrames": (g.get("dataset") or {}).get("frames"), "glorysDepthMeters": (g.get("dataset") or {}).get("depthMeters"), "glorysCoversBox": g.get("coversBox"),
                 "variables": {"hycom": ["water_u", "water_v"], "ncep": ["uwnd", "vwnd"], "glorys": ["uo", "vo"]},
                 "depths": {"A_B": 15.0, "C": 15.81007}}
        if entry["hycomNativeFrames"] != 25:
            failures.append(f"{w['windowId']}: HYCOM native frames {entry['hycomNativeFrames']} != 25")
        if not day.get("complete"):
            failures.append(f"{w['windowId']}: HYCOM day-file coverage incomplete")
        if cov.get("coversBoxInOwnConvention") is not True or cov.get("transformApplied") is not False:
            failures.append(f"{w['windowId']}: coordinate coverage/convention check failed")
        if g.get("status") not in ("ok", "reused") or g.get("coversBox") is not True:
            failures.append(f"{w['windowId']}: GLORYS coverage check failed")
        if (g.get("dataset") or {}).get("depthMeters") not in (15.81007, 15.81):
            failures.append(f"{w['windowId']}: GLORYS depth is not the frozen native level")
        if w["status"] != "ACQUIRED":
            failures.append(f"{w['windowId']}: acquisition status {w['status']}")
        windows.append(entry)
    ww3 = [{"month": f["month"], "filename": f["filename"], "status": f["status"], "sha256": f.get("sha256"), "bytes": f.get("bytes"),
            "variables": (f.get("netcdf") or {}).get("variables")} for f in acq["ww3"]["files"]]
    for f in ww3:
        if f["status"] not in ("ok", "reused"):
            failures.append(f"WW3 {f['month']}: {f['status']}")
    counts = {"ORIGINAL_SOURCE": sum(1 for e in inventory if e["class"] == "ORIGINAL_SOURCE"), "DERIVED_PREPARATION": sum(1 for e in inventory if e["class"] == "DERIVED_PREPARATION")}
    status = "VALIDATION_SOURCE_ACQUISITION_PASS" if not failures and acq["status"] == "VALIDATION_SOURCE_ACQUISITION_PASS" else ("VALIDATION_SOURCE_BLOCKED" if acq["status"] == "VALIDATION_SOURCE_BLOCKED" else "VALIDATION_SOURCE_INVALID")
    freeze = {"schemaVersion": "1.0", "ruleId": "validation-extension-preregistration-step46", "step": 48, "classification": "VALIDATION_EXTENSION_DATA_FREEZE",
              "status": status, "protocolSha256": sha(PROTO), "acquisitionManifestSha256": sha(ACQ),
              "step47ManifestSha256": acq["step47ManifestSha256"], "step47DerivationHash": acq["step47DerivationHash"],
              "observationAggregateSha256": acq["observationAggregateSha256"], "coastlineSha256": acq["coastlineSha256"],
              "sourceIdentities": {"hycom": proto["acquisition"]["hycom"]["product"], "ncep": proto["acquisition"]["ncep"]["product"],
                                   "glorys": proto["acquisition"]["glorys"]["datasetId"], "ww3": proto["acquisition"]["ww3"]["product"] + " v" + proto["acquisition"]["ww3"]["version"]},
              "windows": windows, "ww3": ww3, "artefactCounts": counts, "totalBytes": sum(e["bytes"] for e in inventory),
              "inventory": inventory, "inventoryHash": hashlib.sha256(canonical([{k: e[k] for k in ("relativePath", "sha256", "bytes", "class")} for e in inventory])).hexdigest(),
              "originalsImmutable": True, "originalsRewritten": False, "derivedFilesHashed": True,
              "integrityFailures": failures,
              "scientificProcessing": False, "trajectoryComputed": False, "endpointCalculated": False, "errorCalculated": False, "bootstrapRun": False, "performanceInspected": False,
              "primaryResultModified": False, "cohortModified": False,
              "frozenAtUTC": datetime.now(timezone.utc).strftime(FMT)}
    (out_dir / "step48-validation-data-freeze-manifest.json").write_text(json.dumps(freeze, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "files": len(inventory), **counts, "totalBytes": freeze["totalBytes"], "inventoryHash": freeze["inventoryHash"][:16], "failures": failures[:10]}, ensure_ascii=False))
    return 0 if status == "VALIDATION_SOURCE_ACQUISITION_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())

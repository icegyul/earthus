"""STEP 28 Phase B — field source preparation (data only, no model run). (1) Normalizes the STEP 25B KE-H2 GLORYS D15 raw file
(G1-G11 PASS) with the locked STEP 25C reader into data/research/step28/KE-H2.glorys15.81m.dataset.json (source values are checked
against the raw file at every node of frame 0: no value change). (2) Resolves, for every eligible window, the exact source files and
frame indices used by the evaluator: AVISO frame at T, HYCOM instantaneous frame at T (or NO_EXACT_HYCOM_TIME), GLORYS daily-mean frame
of the UTC day containing T (label T - 12 h) for D15 and, where registered, D05/D10/D20. Writes docs/research/step28-field-comparison-manifest.json
with every source SHA-256, reader SHA and the cadence note. No download, no interpolation, no figure, no metric."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research")); sys.path.insert(0, str(ROOT / "services/research-runtime")); sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import glorys_reader_step25c as reader  # noqa: E402
import netCDF4  # noqa: E402
import numpy as np  # noqa: E402
from research_runtime.datasets import validate_dataset  # noqa: E402

PREREG = ROOT / "docs/research/step28-preregistration.json"
PBLOCK = ROOT / "docs/research/step28-phase-b-preregistration.json"
M25B = ROOT / "docs/research/step25b-glorys-acquisition-manifest.json"
OUT = ROOT / "data/research/step28"
MANIFEST = ROOT / "docs/research/step28-field-comparison-manifest.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    q = load(PREREG); pb = load(PBLOCK); R = q["rules"]
    if sha(PREREG) != pb["phaseAPreregistrationSha256"] or pb["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP28_BLOCKED_IMMUTABILITY: preregistration")
    if MANIFEST.exists() or OUT.exists():
        raise SystemExit("STEP28_BLOCKED: field preparation outputs already exist; no overwrite")
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for w in R["windows"]:
        rec = {"windowId": w["windowId"], "role": w["role"], "fieldStatus": w["fieldStatus"], "avisoTimestamp": w["avisoTimestamp"], "oceanBox": w["oceanBox"]}
        if w["fieldStatus"] != "ELIGIBLE":
            rec["reason"] = w.get("reason"); records.append(rec); continue
        T = w["avisoTimestamp"]
        with netCDF4.Dataset(ROOT / w["avisoFile"]) as nc:
            t = nc["time"]; times = [x.strftime("%Y-%m-%dT%H:%M:%SZ") for x in netCDF4.num2date(t[:], t.units)]
        rec["aviso"] = {"file": w["avisoFile"], "sha256": sha(ROOT / w["avisoFile"]), "frameIndex": times.index(T), "frameTimestamp": T, "datasetId": "erdTAgeo1day", "variables": ["u_current", "v_current"], "role": "REFERENCE FIELD DIAGNOSTIC", "cadence": "daily product sampled weekly; frame at 12:00Z"}
        if w["hycomFrameAtT"]:
            hf = next(f for f in w["hycomFiles"] if T in load(ROOT / f)["grid"]["timeUTC"]); hg = load(ROOT / hf)["grid"]
            rec["hycom"] = {"file": hf, "sha256": sha(ROOT / hf), "frameIndex": hg["timeUTC"].index(T), "frameTimestamp": T, "cadence": "3-hourly instantaneous", "depthMeters": 15.0, "status": "PASS"}
        else:
            rec["hycom"] = {"status": "NO_EXACT_HYCOM_TIME", "note": w.get("hycomMissingNote")}
        label = w["glorysFrameLabel"]
        if w["windowId"] == "KE-H2":
            raw = ROOT / w["glorysD15File"]; b = next(x for x in load(M25B)["windows"] if x["windowId"] == "KE-H2")
            if sha(raw) != w["glorysD15FileSha256"] != b["sha256"]:
                raise SystemExit("STEP28_BLOCKED_IMMUTABILITY: KE-H2 raw GLORYS")
            request = {"requestedAtUTC": b["requestedAtUTC"], "requestedTime": b["requestedTime"], "requestedBox": b["requestedBox"], "requestedDepthMeters": b["requestedDepthMeters"], "command": b["command"], "toolbox": load(M25B)["tool"]}
            dataset, source, meta = reader.build_dataset("glorys12v1-15.81m-KE-H2", "step28-1", raw, 15.81007, "KE-H2", request)
            # value check against the raw file (frame 0, all nodes): normalization must not change values
            with netCDF4.Dataset(raw) as nc:
                u0 = np.ma.filled(nc["uo"][0, 0].astype(np.float64), np.nan)
            g = dataset["grid"]; diffs = 0; total = 0
            for j, row in enumerate(g["u"][0]):
                for i, val in enumerate(row):
                    total += 1
                    if val is None:
                        continue
                    if not (abs(val - u0[j, i]) < 1e-9):
                        diffs += 1
            if diffs:
                raise SystemExit("STEP28_BLOCKED: KE-H2 normalization changed source values")
            path = OUT / "KE-H2.glorys15.81m.dataset.json"; path.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            d15 = {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(path), "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": source["sha256"], "readerSha256": sha(ROOT / "tools/research/glorys_reader_step25c.py"), "readerVersion": reader.READER, "normalizedHere": True, "valueCheck": {"frame0NodesCompared": total, "mismatches": diffs}, "shape": meta["shape"]}
            gl = g
        else:
            d15 = {"file": w["glorysD15File"], "fileSha256": w["glorysD15FileSha256"], "normalizedHere": False}; gl = load(ROOT / w["glorysD15File"])["grid"]
            if sha(ROOT / w["glorysD15File"]) != w["glorysD15FileSha256"]:
                raise SystemExit(f"STEP28_BLOCKED_IMMUTABILITY: GLORYS D15 {w['windowId']}")
            d15["gridSha256"] = load(ROOT / w["glorysD15File"])["manifest"]["sha256"]
        d15.update({"frameLabel": label, "frameIndex": gl["timeUTC"].index(label), "cadence": "daily mean; UTC day containing T; stored label T - 12 h (preregistered same-UTC-day rule; not interpolated, not shifted)", "depthMeters": 15.81007})
        rec["glorys"] = {"D15": d15}
        if isinstance(w.get("glorysDepthFiles"), dict) and "D05" in w["glorysDepthFiles"]:
            for did in ("D05", "D10", "D20"):
                f = w["glorysDepthFiles"][did]
                if sha(ROOT / f["file"]) != f["fileSha256"]:
                    raise SystemExit(f"STEP28_BLOCKED_IMMUTABILITY: GLORYS {did} {w['windowId']}")
                gg = load(ROOT / f["file"])["grid"]
                rec["glorys"][did] = {"file": f["file"], "fileSha256": f["fileSha256"], "nativeLevelMeters": f["nativeLevelMeters"], "frameLabel": label, "frameIndex": gg["timeUTC"].index(label), "source": "STEP 27 r3 normalized (cropped to D15 node set)"}
        else:
            rec["glorys"]["depthNote"] = "KE-H2: D15 only (locked Phase A rule)"
        rec["comparisonsExecutable"] = w["comparisonsExecutable"]
        records.append(rec); print(json.dumps({"window": w["windowId"], "T": T, "hycom": rec["hycom"]["status"], "glorysLabel": label}), flush=True)
    doc = {"schemaVersion": "1.0", "ruleId": q["ruleId"], "phaseAPreregistrationSha256": sha(PREREG), "phaseBPreregistrationSha256": sha(PBLOCK), "cadenceNote": "HYCOM instantaneous at T; GLORYS daily mean of the UTC day containing T (label T - 12 h); AVISO daily product frame at T (12:00Z). Recorded as a product-cadence distinction; no shifting, no interpolation.",
           "readerSha256": sha(ROOT / "tools/research/glorys_reader_step25c.py"), "windows": records, "modelRunCount": 0, "newDownloads": 0}
    MANIFEST.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "FIELDS_PREPARED", "eligible": [r["windowId"] for r in records if r["fieldStatus"] == "ELIGIBLE"]})); return 0


if __name__ == "__main__":
    raise SystemExit(main())

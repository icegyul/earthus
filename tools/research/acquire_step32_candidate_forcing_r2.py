"""REVISION r2 (STEP 32 Phase B, uncommitted file-level revision; r1 kept unchanged on disk; see docs/research/step32-phase-b-revisions.json): windows blocked at the B2 gate are recorded WINDOW_BLOCKED and not acquired.
STEP 32 Phase B — B6 (data): acquire the candidate forcing for the eight locked windows, exactly as STEP 25B / STEP 23 did.
GLORYS12V1 (GLOBAL_MULTIYEAR_PHY_001_030, cmems_mod_glo_phy_my_0.083deg_P1D-m, uo/vo, single native level 15.81 m) via the official
Copernicus Marine toolbox in the isolated venv of STEP 25B (console script; stdin closed; `login --check-credentials-valid` exit code only;
credential contents are never read, printed or stored); subset box = ocean box +-0.5 deg (STEP 25B rule), time t0-1 day 00:00 .. end+1 day
00:00. WW3 GLOB-30M CFSR surface Stokes drift monthly files (DATA-06 identity) via the IFREMER anonymous FTP used in STEP 23. GLORYS files
are normalized with the locked STEP 25C reader (glorys_reader_step25c.build_dataset). No substitute product. Writes
data/research/step32/glorys/, data/research/step32/DATA-06/ (gitignored) and docs/research/step32-candidate-acquisition-manifest.json."""
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "tools/research"))
import glorys_reader_step25c as reader  # noqa: E402  (locked STEP 25C reader)
import acquire_step23 as a23  # noqa: E402  (fetch helper; its main() is never called)

MATRIX, PB, QC = D / "step32-temporal-experiment-matrix.json", D / "step32-phase-b-preregistration.json", D / "step32-forcing-quality.json"
VENV = ROOT / "data/research/step25b/toolbox-venv"
GDATA, WDATA, NORM = ROOT / "data/research/step32/glorys", ROOT / "data/research/step32/DATA-06", ROOT / "data/research/step32/forcing/normalized"
MANIFEST = D / "step32-candidate-acquisition-manifest.json"
DATASET_ID, PRODUCT_ID, DEPTH = "cmems_mod_glo_phy_my_0.083deg_P1D-m", "GLOBAL_MULTIYEAR_PHY_001_030", 15.81
FTP = "ftp://ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def scrub(text):
    return re.sub(r"(password|username|token)[^\n]*", r"\1 [REDACTED]", text or "", flags=re.I)[:600]


def main():
    M = load(MATRIX); pb = load(PB)
    if pb["experimentMatrixSha256"] != sha(MATRIX) or pb["tools"]["tools/research/acquire_step32_candidate_forcing_r2.py"] != sha(__file__):
        raise SystemExit("STEP32_BLOCKED_IMMUTABILITY: matrix / tool")
    if MANIFEST.exists():
        raise SystemExit("STEP32_BLOCKED: candidate acquisition manifest exists; no overwrite")
    py = next((c for c in (VENV / "Scripts" / "copernicusmarine.exe", VENV / "bin" / "copernicusmarine") if c.exists()), None)
    if py is None:
        raise SystemExit("STEP32_BLOCKED: Copernicus Marine toolbox not present")
    r = subprocess.run([str(py), "login", "--check-credentials-valid"], capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL)
    auth = {"method": "copernicusmarine login --check-credentials-valid (exit code only)", "exitCode": r.returncode, "authenticated": r.returncode == 0, "checkedAtUTC": now(), "credentialsEntered": False, "credentialsStored": False, "contentsRead": False}
    manifest = {"schemaVersion": "1.0", "ruleId": M["ruleId"], "phase": "B6-data", "experimentMatrixSha256": sha(MATRIX), "phaseBPreregistrationSha256": sha(PB), "tool": {"file": "tools/research/acquire_step32_candidate_forcing_r2.py", "sha256": sha(__file__), "revision": "r2"}, "qualityReportSha256": sha(QC), "reader": {"file": "tools/research/glorys_reader_step25c.py", "sha256": sha(ROOT / "tools/research/glorys_reader_step25c.py")},
                "glorys": {"productId": PRODUCT_ID, "datasetId": DATASET_ID, "depthMeters": DEPTH, "toolbox": {"isolatedVenv": str(VENV.relative_to(ROOT)).replace("\\", "/"), "consoleScript": py.name}, "authentication": auth, "boxRule": "ocean box +-0.5 deg (STEP 25B)", "timeRule": "t0 - 1 day 00:00 .. end + 1 day 00:00"},
                "ww3": {"product": "WW3 GLOB-30M CFSR surface Stokes drift (uuss/vuss), IFREMER hindcast, DATA-06 identity", "endpoint": FTP, "files": []}, "credentialsInManifest": False, "startedAtUTC": now(), "windows": [], "modelRun": False, "performanceDataRead": False}
    if not auth["authenticated"]:
        manifest.update({"status": "CREDENTIALS_REQUIRED", "completedAtUTC": now()}); MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"); print(json.dumps({"status": "CREDENTIALS_REQUIRED"})); return 1
    qc = {x["windowId"]: x["status"] for x in load(QC)["windows"]}; evaluable = [w for w in M["windows"] if qc[w["windowId"]] == "PASS"]
    for w in M["windows"]:
        if qc[w["windowId"]] != "PASS":
            manifest["windows"].append({"windowId": w["windowId"], "status": "WINDOW_BLOCKED", "reason": f"HYCOM source {qc[w['windowId']]} (B2); no candidate acquisition for a blocked window"})
    months = sorted({(datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ") + timedelta(hours=3 * k)).strftime("%Y%m") for w in evaluable for k in range(25)})
    for ym in months:
        fname = f"WW3-GLOB-30M_{ym}_uss.nc"; url = f"{FTP}/{ym[:4]}_CFSR/uss/{fname}"; path = WDATA / f"{ym[:4]}_CFSR" / fname
        if path.exists():
            rec = {"filename": fname, "url": url, "status": "ok", "bytes": path.stat().st_size, "sha256": sha(path), "reused": True}
        else:
            rr = a23.fetch(url, path, timeout=3600); rec = {"filename": fname, "url": url, **{k: rr.get(k) for k in ("status", "bytes", "sha256", "error")}, "retrievedAtUTC": now()}
        rec["file"] = str(path.relative_to(ROOT)).replace("\\", "/"); manifest["ww3"]["files"].append(rec); print(json.dumps({"ww3": fname, "status": rec["status"]}), flush=True)
    GDATA.mkdir(parents=True, exist_ok=True); NORM.mkdir(parents=True, exist_ok=True)
    for w in evaluable:
        wid = w["windowId"]; t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ"); t1 = datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ"); b = w["oceanBox"]
        box = {"west": round(b["west"] - 0.5, 5), "east": round(b["east"] + 0.5, 5), "south": round(b["south"] - 0.5, 5), "north": round(b["north"] + 0.5, 5)}
        start, end = (t0 - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00"), (t1 + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
        fname = f"{wid}.glorys12v1.uo_vo.{DEPTH:.2f}m.nc"; out = GDATA / fname
        cmd = [str(py), "subset", "-i", DATASET_ID, "-v", "uo", "-v", "vo", "-x", str(box["west"]), "-X", str(box["east"]), "-y", str(box["south"]), "-Y", str(box["north"]), "-t", start, "-T", end, "-z", str(DEPTH), "-Z", str(DEPTH), "-o", str(GDATA), "-f", fname, "--disable-progress-bar"]
        rec = {"windowId": wid, "t0": w["t0"], "end": w["end"], "requestedTime": [start, end], "requestedBox": box, "requestedDepthMeters": DEPTH, "variables": ["uo", "vo"], "command": " ".join(c for c in cmd[1:] if "password" not in c.lower()), "requestedAtUTC": now()}
        if out.exists():
            rec.update({"reused": True, "exitCode": 0})
        else:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, stdin=subprocess.DEVNULL); rec.update({"exitCode": r.returncode, "outputScrubbed": scrub(r.stdout + r.stderr)})
        if rec["exitCode"] == 0 and out.exists():
            rec.update({"file": str(out.relative_to(ROOT)).replace("\\", "/"), "bytes": out.stat().st_size, "sha256": sha(out), "status": "ok"})
            try:
                request = {"requestedAtUTC": rec["requestedAtUTC"], "requestedTime": rec["requestedTime"], "requestedBox": box, "requestedDepthMeters": DEPTH, "command": rec["command"], "toolbox": manifest["glorys"]["toolbox"]}
                dataset, source, meta = reader.build_dataset(f"glorys12v1-15.81m-{wid}", "step32-1", out, 15.81007, wid, request)
                path = NORM / f"{wid}.glorys15.81m.dataset.json"; path.write_bytes(json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
                g = dataset["grid"]; inside = g["lon"][0] <= b["west"] and b["east"] <= g["lon"][-1] and g["lat"][0] <= b["south"] and b["north"] <= g["lat"][-1]; covers = g["timeUTC"][0] <= w["t0"] and w["end"] <= g["timeUTC"][-1]
                rec["normalized"] = {"file": str(path.relative_to(ROOT)).replace("\\", "/"), "fileSha256": sha(path), "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"], "datasetId": dataset["manifest"]["datasetId"], "readerVersion": reader.READER, "shape": meta["shape"], "timeUTC": g["timeUTC"], "depthLevelMeters": meta["depthLevelMeters"], "maskedNodes": meta["maskedNodes"], "uRange": meta["uRange"], "vRange": meta["vRange"], "areaInsideGrid": inside, "timeBracketsWindow": covers}
                if not (inside and covers):
                    rec["status"] = "COVERAGE_FAIL"
            except Exception as exc:
                rec["status"] = "READER_FAIL"; rec["error"] = type(exc).__name__ + ": " + str(exc)[:300]
        else:
            rec["status"] = "error"
        manifest["windows"].append(rec); print(json.dumps({"window": wid, "status": rec["status"], "shape": rec.get("normalized", {}).get("shape")}), flush=True)
    manifest.update({"status": "ACQUIRED" if all(x["status"] in ("ok", "WINDOW_BLOCKED") for x in manifest["windows"]) and any(x["status"] == "ok" for x in manifest["windows"]) and all(f["status"] == "ok" for f in manifest["ww3"]["files"]) else "PARTIAL", "completedAtUTC": now()})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "glorys": sum(1 for x in manifest["windows"] if x["status"] == "ok"), "ww3": sum(1 for f in manifest["ww3"]["files"] if f["status"] == "ok")}))
    return 0 if manifest["status"] == "ACQUIRED" else 1


if __name__ == "__main__":
    raise SystemExit(main())

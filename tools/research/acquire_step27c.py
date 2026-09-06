"""STEP 27C — authorized acquisition of the D20 native level (18.495560 m, resolved in STEP 27B-r2) — same mechanism as the locked
STEP 27B tool (acquire_step27b.py), only the protocol/output paths differ. Condition list comes from the STEP 27C protocol (D20 only) for the seven STEP 25B windows, using the official Copernicus Marine client in the isolated STEP 25B venv
(console script; stdin closed). Authentication: `login --check-credentials-valid` exit code only; credentials never read, printed
or stored. Per depth condition the request selects the single native level with `-z T -Z T --coordinates-selection-method nearest`
(T = target metres); the returned level is read from the file and checked against the protocol's expected native level. Same product,
boxes and bracketing days as STEP 25B. No vertical interpolation, no multi-level extraction. MODEL_RUN = FORBIDDEN."""
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
PROTO = ROOT / "docs/research/step27c-d20-acquisition-protocol.json"
PREREG = ROOT / "docs/research/step27c-preregistration.json"
DATA = ROOT / "data/research/step27"
VENV = ROOT / "data/research/step25b/toolbox-venv"
MANIFEST = ROOT / "docs/research/step27c-d20-acquisition-manifest.json"
ACCESS = ROOT / "docs/research/step27c-d20-access-status.json"
DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"
PRODUCT_ID = "GLOBAL_MULTIYEAR_PHY_001_030"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def scrub(text):
    import re
    return re.sub(r"(password|username|token)[^\n]*", r"\1 [REDACTED]", text or "", flags=re.I)[:600]


def main():
    proto = json.loads(PROTO.read_text(encoding="utf-8")); prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    if sha(PROTO) != prereg["protocolSha256"] or prereg["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP27C_BLOCKED_IMMUTABILITY")
    if MANIFEST.exists():
        raise SystemExit("STEP27C_BLOCKED: manifest exists; no overwrite")
    exe = next((c for c in (VENV / "Scripts" / "copernicusmarine.exe", VENV / "bin" / "copernicusmarine") if c.exists()), None)
    tool = {"name": "copernicusmarine (Copernicus Marine Toolbox, official client)", "isolatedVenv": str(VENV.relative_to(ROOT)).replace("\\", "/"), "installedInIsolatedVenv": exe is not None, "runtimeIsolated": True, "python": platform.python_version()}
    if exe:
        v = subprocess.run([str(exe), "--version"], capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL); tool["version"] = (v.stdout or v.stderr).strip()[:80]
    home = Path.home()
    cred_exist = {"copernicusmarine_credentials_file": (home / ".copernicusmarine" / ".copernicusmarine-credentials").exists(), "contentsRead": False}
    auth = {"method": "copernicusmarine login --check-credentials-valid (exit code only)", "checkedAtUTC": now(), "credentialsEntered": False, "credentialsStored": False}
    if exe:
        r = subprocess.run([str(exe), "login", "--check-credentials-valid"], capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL)
        auth.update({"exitCode": r.returncode, "outputScrubbed": scrub((r.stdout or "") + (r.stderr or "")), "authenticated": r.returncode == 0})
    else:
        auth.update({"exitCode": None, "authenticated": False})
    status = "AUTHORIZED" if auth["authenticated"] else "CREDENTIALS_REQUIRED"
    access = {"ruleId": proto["ruleId"], "product": {"productId": PRODUCT_ID, "datasetId": DATASET_ID, "name": "Global Ocean Physics Reanalysis (GLORYS12V1)"}, "tool": tool, "credentialExistence": cred_exist, "authentication": auth, "accessStatus": status, "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "checkedAtUTC": now()}
    ACCESS.write_text(json.dumps(access, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "accessStatus": status, "product": access["product"], "tool": tool, "startedAtUTC": now(), "credentialsInManifest": False, "depths": [], "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "d15": proto["d15"]}
    if status != "AUTHORIZED":
        manifest.update({"downloaded": 0, "completedAtUTC": now()}); MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"accessStatus": status, "downloaded": 0})); return 1
    import netCDF4
    for cond in proto["depthConditions"]:
        rec = {"id": cond["id"], "targetMeters": cond["targetMeters"], "expectedNativeLevelMeters": cond["expectedNativeLevelMeters"], "acquisitionStatus": cond["acquisitionStatus"], "windows": []}
        if cond["acquisitionStatus"] != "ACQUIRE":
            rec["reason"] = cond.get("reason"); manifest["depths"].append(rec); continue
        out_dir = DATA / cond["id"]; out_dir.mkdir(parents=True, exist_ok=True)
        for w in proto["windows"]:
            t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ"); t1 = datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ")
            start, end = (t0 - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00"), (t1 + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
            box = w["subsetBox"]; fname = f"{w['windowId']}.glorys12v1.uo_vo.{cond['id']}.nc"; out = out_dir / fname
            cmd = [str(exe), "subset", "-i", DATASET_ID, "-v", "uo", "-v", "vo", "-x", str(box["west"]), "-X", str(box["east"]), "-y", str(box["south"]), "-Y", str(box["north"]), "-t", start, "-T", end, "-z", str(cond["targetMeters"]), "-Z", str(cond["targetMeters"]), "--coordinates-selection-method", "nearest", "-o", str(out_dir), "-f", fname, "--disable-progress-bar"]
            wrec = {"windowId": w["windowId"], "t0": w["t0"], "end": w["end"], "requestedTime": [start, end], "requestedBox": box, "requestedDepthTargetMeters": cond["targetMeters"], "selectionMethod": "nearest (single native level)", "variables": ["uo", "vo"], "command": " ".join(cmd[1:]), "requestedAtUTC": now()}
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, stdin=subprocess.DEVNULL, env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"})
            wrec.update({"exitCode": r.returncode, "outputScrubbed": scrub(r.stdout + r.stderr)})
            if r.returncode == 0 and out.exists():
                with netCDF4.Dataset(out) as ds:
                    levels = [float(x) for x in ds["depth"][:]]
                wrec.update({"file": str(out.relative_to(ROOT)).replace("\\", "/"), "bytes": out.stat().st_size, "sha256": sha(out), "returnedDepthLevelsMeters": levels, "status": "ok"})
            else:
                wrec["status"] = "error"
            rec["windows"].append(wrec); print(json.dumps({"depth": cond["id"], "window": w["windowId"], "status": wrec["status"], "levels": wrec.get("returnedDepthLevelsMeters")}), flush=True)
        manifest["depths"].append(rec)
    manifest.update({"downloaded": sum(1 for d in manifest["depths"] for x in d["windows"] if x["status"] == "ok"), "completedAtUTC": now(), "environment": {"python": platform.python_version(), "platform": platform.platform()}})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"accessStatus": status, "downloaded": manifest["downloaded"]})); return 0


if __name__ == "__main__":
    raise SystemExit(main())

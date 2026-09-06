"""STEP 25B — GLORYS12V1 authorized acquisition (Copernicus Marine toolbox in an ISOLATED venv; never the trajectory runtime).
Steps: (1) toolbox presence/version in data/research/step25b/toolbox-venv (installed by the orchestrating shell; recorded here);
(2) authentication state via `copernicusmarine login --check-credentials-valid` — exit code only; credential contents are never read,
printed or stored; (3) if authenticated: per-window `subset` of uo/vo at the 15 m nearest native level over the locked box and the
bracketing daily window into data/research/step25b/glorys/ (gitignored), SHA-256 recorded; (4) manifest. If not authenticated:
STATUS = CREDENTIALS_REQUIRED, no download. MODEL_RUN = FORBIDDEN."""
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step25b-glorys-acquisition-protocol.json"
PREREG = ROOT / "docs/research/step25b-preregistration.json"
DATA = ROOT / "data/research/step25b/glorys"
VENV = ROOT / "data/research/step25b/toolbox-venv"
MANIFEST = ROOT / "docs/research/step25b-glorys-acquisition-manifest.json"
ACCESS = ROOT / "docs/research/step25b-glorys-access-status.json"
DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"
PRODUCT_ID = "GLOBAL_MULTIYEAR_PHY_001_030"
SECRET_ENV = ("COPERNICUSMARINE_SERVICE_USERNAME", "COPERNICUSMARINE_SERVICE_PASSWORD")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def venv_python():
    for cand in (VENV / "Scripts" / "python.exe", VENV / "bin" / "python"):
        if cand.exists():
            return cand
    return None


def scrub(text):
    """Remove anything that could be a credential from tool output before recording it."""
    import re
    return re.sub(r"(password|username|token)[^\n]*", r"\1 [REDACTED]", text or "", flags=re.I)[:600]


def main():
    proto = json.loads(PROTO.read_text(encoding="utf-8")); prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    if sha(PROTO) != prereg["protocolSha256"] or prereg["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP25B_BLOCKED_IMMUTABILITY")
    if MANIFEST.exists():
        raise SystemExit("STEP25B_BLOCKED: manifest exists; no overwrite")
    py = venv_python()
    tool = {"name": "copernicusmarine (Copernicus Marine Toolbox, official client)", "isolatedVenv": str(VENV.relative_to(ROOT)).replace("\\", "/"), "installedInIsolatedVenv": py is not None, "runtimeIsolated": True, "installationMethod": "python -m venv + pip install copernicusmarine (no credentials involved)"}
    if py:
        v = subprocess.run([str(py), "-m", "copernicusmarine", "--version"], capture_output=True, text=True, timeout=300)
        tool["version"] = (v.stdout or v.stderr).strip()[:80]; tool["versionCheckedAtUTC"] = now()
    home = Path.home()
    cred_exist = {"copernicusmarine_credentials_file": (home / ".copernicusmarine" / ".copernicusmarine-credentials").exists(), "netrc": (home / ".netrc").exists() or (home / "_netrc").exists(), "env": all(k in os.environ for k in SECRET_ENV), "contentsRead": False}
    auth = {"method": "copernicusmarine login --check-credentials-valid (exit code only)", "checkedAtUTC": now(), "credentialsEntered": False, "credentialsStored": False}
    if py:
        r = subprocess.run([str(py), "-m", "copernicusmarine", "login", "--check-credentials-valid"], capture_output=True, text=True, timeout=300, env={k: v for k, v in os.environ.items()})
        auth.update({"exitCode": r.returncode, "outputScrubbed": scrub((r.stdout or "") + (r.stderr or "")), "authenticated": r.returncode == 0})
    else:
        auth.update({"exitCode": None, "authenticated": False, "note": "toolbox not available"})
    status = "AUTHORIZED" if auth["authenticated"] else "CREDENTIALS_REQUIRED"
    access = {"ruleId": proto["ruleId"], "product": {"productId": PRODUCT_ID, "datasetId": DATASET_ID, "name": "Global Ocean Physics Reanalysis (GLORYS12V1)", "doi": "10.48670/moi-00021", "resolution": "1/12 deg (~8 km)", "levels": 50, "cadence": "daily mean"}, "tool": tool, "credentialExistence": cred_exist, "authentication": auth,
              "accessStatus": status, "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "step17GlorysRecord": "BLOCKED/PENDING — historically immutable", "checkedAtUTC": now()}
    ACCESS.write_text(json.dumps(access, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "accessStatus": status, "product": access["product"], "tool": tool, "startedAtUTC": now(), "credentialsInManifest": False, "windows": [], "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0}
    if status != "AUTHORIZED":
        manifest.update({"downloaded": 0, "reason": "no authorized Copernicus Marine credentials in this environment (existence check only); acquisition stopped per STEP 25B §3", "completedAtUTC": now()})
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"accessStatus": status, "downloaded": 0})); return 1
    DATA.mkdir(parents=True, exist_ok=True)
    depth = proto["depth"]["nearestNativeLevelMeters"]
    for w in proto["windows"]:
        t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ"); t1 = datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ")
        start, end = (t0 - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00"), (t1 + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
        box = w["subsetBox"]; fname = f"{w['windowId']}.glorys12v1.uo_vo.{depth:.2f}m.nc"; out = DATA / fname
        cmd = [str(py), "-m", "copernicusmarine", "subset", "-i", DATASET_ID, "-v", "uo", "-v", "vo", "-x", str(box["west"]), "-X", str(box["east"]), "-y", str(box["south"]), "-Y", str(box["north"]), "-t", start, "-T", end, "-z", str(depth), "-Z", str(depth), "-o", str(DATA), "-f", fname, "--disable-progress-bar"]
        rec = {"windowId": w["windowId"], "t0": w["t0"], "end": w["end"], "requestedTime": [start, end], "requestedBox": box, "requestedDepthMeters": depth, "variables": ["uo", "vo"], "command": " ".join(c for c in cmd[3:] if "password" not in c.lower()), "requestedAtUTC": now()}
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        rec.update({"exitCode": r.returncode, "outputScrubbed": scrub(r.stdout + r.stderr)})
        if r.returncode == 0 and out.exists():
            rec.update({"file": str(out.relative_to(ROOT)).replace("\\", "/"), "bytes": out.stat().st_size, "sha256": sha(out), "status": "ok"})
        else:
            rec["status"] = "error"
        manifest["windows"].append(rec); print(json.dumps({"window": w["windowId"], "status": rec["status"]}), flush=True)
    manifest.update({"downloaded": sum(1 for x in manifest["windows"] if x["status"] == "ok"), "completedAtUTC": now(), "environment": {"python": platform.python_version(), "platform": platform.platform()}})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"accessStatus": status, "downloaded": manifest["downloaded"]})); return 0


if __name__ == "__main__":
    raise SystemExit(main())

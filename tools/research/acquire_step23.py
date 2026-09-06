"""STEP 23 Phase B — P1 data acquisition under the LOCKED STEP 23 protocol. Anonymous endpoints only; no credential is read or
entered. DATA-01: checks for Copernicus credentials/toolbox (existence only) and records DATASET_BLOCKED if absent (no download).
DATA-03: AVISO geostrophic currents (erdTAgeo1day) and SSH (erdTAssh1day) per-window subsets via ERDDAP griddap NetCDF; OSCAR /
NESDIS coverage recorded from server metadata only. DATA-06: IFREMER WW3 CFSR 'uss' monthly global files via anonymous FTP.
Every request is appended to docs/research/step23-acquisition/acquisition-log.jsonl; raw files go to data/research/step23/ (gitignored)."""
import hashlib
import json
import os
import platform
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step23-data-acquisition-protocol.json"
PREREG = ROOT / "docs/research/step23-data-acquisition-preregistration.json"
DATA = ROOT / "data/research/step23"
LOGDIR = ROOT / "docs/research/step23-acquisition"
LOG = LOGDIR / "acquisition-log.jsonl"
MANIFEST = ROOT / "docs/research/step23-data-acquisition-manifest.json"
ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap"
FTP = "ftp://ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL"
UA = "EARTHUS-research/step23"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(entry):
    LOGDIR.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def fetch(url, path, timeout=1800):
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {"timestamp": now(), "url": url, "file": str(path.relative_to(ROOT)).replace("\\", "/"), "tool": f"python {platform.python_version()} urllib"}
    if path.exists():
        entry.update({"status": "reused", "bytes": path.stat().st_size, "sha256": sha(path)}); log(entry); return entry
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(); status = getattr(resp, "status", 200)
        if status not in (200, None):
            entry.update({"status": f"http {status}"}); log(entry); return entry
        path.write_bytes(data); entry.update({"status": "ok", "httpStatus": status or "ftp", "bytes": len(data), "sha256": sha(path)})
    except Exception as exc:
        entry.update({"status": "error", "error": f"{type(exc).__name__}: {str(exc)[:200]}"})
    log(entry); return entry


def erddap_meta(dataset_id):
    import csv, io
    url = f"{ERDDAP}/info/{dataset_id}/index.csv"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
            rows = list(csv.DictReader(io.StringIO(r.read().decode("utf-8", "replace"))))
        g = {r["Attribute Name"]: r["Value"] for r in rows if r["Variable Name"] == "NC_GLOBAL"}
        meta = {"datasetId": dataset_id, "title": g.get("title"), "institution": g.get("institution"), "license": g.get("license", "")[:300], "timeCoverageStart": g.get("time_coverage_start"), "timeCoverageEnd": g.get("time_coverage_end"),
                "lat": [g.get("geospatial_lat_min"), g.get("geospatial_lat_max")], "lon": [g.get("geospatial_lon_min"), g.get("geospatial_lon_max")], "latResolution": g.get("geospatial_lat_resolution"), "lonResolution": g.get("geospatial_lon_resolution"),
                "variables": [r["Variable Name"] for r in rows if r["Row Type"] == "variable"], "queriedAtUTC": now(), "infoUrl": url}
        log({"timestamp": now(), "url": url, "status": "metadata", "datasetId": dataset_id}); return meta
    except Exception as exc:
        log({"timestamp": now(), "url": url, "status": "error", "error": str(exc)[:200]}); return {"datasetId": dataset_id, "error": str(exc)[:200]}


def main():
    proto = json.loads(PROTO.read_text(encoding="utf-8")); prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    if sha(PROTO) != prereg["protocolSha256"] or prereg["status"] != "PREREGISTRATION LOCKED":
        raise SystemExit("STEP23_BLOCKED_IMMUTABILITY")
    if MANIFEST.exists():
        raise SystemExit("STEP23_BLOCKED: acquisition manifest already exists; no overwrite")
    windows = proto["windows"]
    manifest = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "preregistrationSha256": sha(PREREG), "startedAtUTC": now(), "credentialsEntered": False, "datasets": {}}
    # ---------------- DATA-01 ----------------
    home = Path.home()
    cred = {"copernicusmarine_credentials_file": (home / ".copernicusmarine" / ".copernicusmarine-credentials").exists(), "netrc": (home / ".netrc").exists() or (home / "_netrc").exists(), "cdsapirc": (home / ".cdsapirc").exists()}
    try:
        import copernicusmarine  # noqa: F401
        toolbox = True
    except Exception:
        toolbox = False
    manifest["datasets"]["DATA-01"] = {"requirement": "higher-resolution ocean current", "attempted": "GLORYS12V1 via copernicusmarine toolbox", "credentialFilesPresent": cred, "toolboxInstalled": toolbox, "downloaded": False,
                                       "status": "DATASET_BLOCKED", "blockReason": "credentials/toolbox absent (existence check only; nothing read or entered); STEP 17 BLOCKED/PENDING preserved" if not (toolbox and cred["copernicusmarine_credentials_file"]) else "toolbox present but acquisition not attempted automatically",
                                       "candidates": proto["sources"]["DATA-01"]["priority"], "depthInventory": "NOT AVAILABLE (no access)", "licenseStatus": "Copernicus Marine free with attribution (not verified from file: no access)"}
    log({"timestamp": now(), "dataset": "DATA-01", "status": "blocked", "reason": manifest["datasets"]["DATA-01"]["blockReason"]})
    # ---------------- DATA-03 ----------------
    d3 = {"requirement": "surface current / altimetry reference", "products": {}}
    for did, role in (("jplOscar", "surface current (OSCAR) — metadata only"), ("nesdisSSH1day", "SSHA + geostrophic (NESDIS) — metadata only")):
        d3["products"][did] = {"role": role, "metadata": erddap_meta(did), "downloaded": False}
    for did, varlist, role in (("erdTAgeo1day", "u_current,v_current", "AVISO absolute geostrophic surface current, 0.25 deg, ~weekly"), ("erdTAssh1day", "ssh,sshd", "AVISO absolute SSH and SSH deviation, 0.25 deg, ~weekly")):
        meta = erddap_meta(did); files = []
        for w in windows:
            t0 = datetime.strptime(w["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc); t1 = datetime.strptime(w["end"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            ts, te = (t0 - timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%SZ"), (t1 + timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%SZ")
            box = w["oceanBox"]; s, n = max(-90, box["south"] - 3), min(90, box["north"] + 3); wl, el = box["west"] - 3, box["east"] + 3
            wl360, el360 = wl % 360, el % 360  # product longitude convention 0..360
            cov = meta.get("timeCoverageStart") and meta.get("timeCoverageEnd") and meta["timeCoverageStart"] <= ts and te <= meta["timeCoverageEnd"]
            entry = {"windowId": w["windowId"], "requestedTime": [ts, te], "requestedBox": {"south": s, "north": n, "west": wl, "east": el, "productLon": [wl360, el360]}, "withinProductPeriod": bool(cov)}
            if not cov:
                entry["status"] = "outside product period (no request issued)"; files.append(entry); log({"timestamp": now(), "dataset": "DATA-03", "product": did, "windowId": w["windowId"], "status": "skipped", "reason": "outside product period"}); continue
            query = "".join(f"{v}%5B({ts}):1:({te})%5D%5B(0.0):1:(0.0)%5D%5B({s}):1:({n})%5D%5B({wl360}):1:({el360})%5D," for v in varlist.split(",")).rstrip(",")
            url = f"{ERDDAP}/griddap/{did}.nc?{query}"
            path = DATA / "DATA-03" / did / f"{w['windowId']}.{did}.nc"
            r = fetch(url, path, timeout=600); entry.update({"query": url, "file": r.get("file"), "status": r["status"], "bytes": r.get("bytes"), "sha256": r.get("sha256"), "error": r.get("error")}); files.append(entry)
        d3["products"][did] = {"role": role, "metadata": meta, "downloaded": any(f.get("status") in ("ok", "reused") for f in files), "files": files, "licenseText": (meta.get("license") or "")[:300], "licenseStatus": "ERDDAP standard notice: free use/redistribution, not for legal use (see licenseText)"}
    manifest["datasets"]["DATA-03"] = d3
    # ---------------- DATA-06 ----------------
    d6 = {"requirement": "wave / Stokes drift", "product": proto["sources"]["DATA-06"]["priority"][0], "files": [], "licenseStatus": "LICENSE_STATUS_UNKNOWN (no license file on the FTP directory; IFREMER hindcast is distributed openly, citation required — to be confirmed)"}
    for fname in proto["sources"]["DATA-06"]["files"]:
        year = fname.split("_")[1][:4]; url = f"{FTP}/{year}_CFSR/uss/{fname}"; path = DATA / "DATA-06" / f"{year}_CFSR" / fname
        r = fetch(url, path, timeout=3600); d6["files"].append({"filename": fname, "url": url, **{k: r.get(k) for k in ("status", "bytes", "sha256", "error", "file")}})
        print(json.dumps({"DATA-06": fname, "status": r["status"], "bytes": r.get("bytes")}), flush=True)
    d6["downloaded"] = all(f["status"] in ("ok", "reused") for f in d6["files"])
    manifest["datasets"]["DATA-06"] = d6
    manifest.update({"completedAtUTC": now(), "acquisitionLog": str(LOG.relative_to(ROOT)).replace("\\", "/"), "acquisitionLogSha256": sha(LOG), "tool": {"file": "tools/research/acquire_step23.py", "sha256": sha(__file__)}, "modelRuns": 0, "alphaChanged": False,
                     "environment": {"python": platform.python_version(), "platform": platform.platform()}})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST.relative_to(ROOT)), "DATA-01": manifest["datasets"]["DATA-01"]["status"], "DATA-03": {k: v["downloaded"] for k, v in d3["products"].items()}, "DATA-06": d6["downloaded"]}), flush=True)


if __name__ == "__main__":
    main()

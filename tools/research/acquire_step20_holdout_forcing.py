"""STEP 20 Phase B-2 (R1): acquire HOLDOUT forcing for KE-H1/H2/H3 under the STEP 17 forcing protocol, unchanged.
Reuses acquire_step17_forcing.py verbatim (same HYCOM GOFS 3.1 expt_53.X 15 m 3 h NCSS queries, same NCEP-DOE R2 10 m 6 h
queries, same normalisation/QC), with only the run-unit source (STEP 20 preregistration holdout units) and the output
location (data/research/step20/holdout/forcing/, docs/research/step20-holdout-forcing-manifest.json) changed.
STEP 17 forcing files are never touched. Scope (bounds/timestamps) is written BEFORE any download."""
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))
import acquire_step17_forcing as a17  # noqa: E402

PREREG20 = ROOT / "docs/research/step20-preregistration.json"
ALPHA = ROOT / "docs/research/step20-selected-alpha.json"
LOCKED = {PREREG20: "1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4", ALPHA: "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          ROOT / "docs/research/step17-forcing-protocol.md": a17.PROTO_SHA, ROOT / "docs/research/step17-preregistration.json": a17.PREREG_SHA,
          ROOT / "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86"}
DATA = ROOT / "data/research/step20/holdout/forcing"
MANIFEST = ROOT / "docs/research/step20-holdout-forcing-manifest.json"
SCOPE = ROOT / "docs/research/step20-holdout-forcing-scope.json"


def holdout_units():
    p = json.loads(PREREG20.read_text(encoding="utf-8"))
    units = []
    for u in p["holdout"]["runUnits"]:
        pts = [(d["drifterId"], d["lon"], d["lat"]) for d in u["releasePositions"]]
        assert [d for d, *_ in pts] == u["drifterIds"]
        lo, la = [x[1] for x in pts], [x[2] for x in pts]
        box = {"south": max(-40.0, min(la) - 2.0), "north": min(40.0, max(la) + 2.0), "west": min(lo) - 2.0, "east": max(lo) + 2.0}   # STEP 17 §2 verbatim
        wind = {"south": max(-90.0, box["south"] - 3.0), "north": min(90.0, box["north"] + 3.0), "west": box["west"] - 3.0, "east": box["east"] + 3.0}
        t0 = datetime.strptime(u["t0"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        units.append({"windowId": u["windowId"], "region": u["region"], "t0": t0, "start": u["t0"], "end": u["end"], "drifters": pts, "oceanBox": box, "windBox": wind})
    return units


def main():
    for path, expected in LOCKED.items():
        if a17.sha(path) != expected:
            raise SystemExit(f"R1_BLOCKED_IMMUTABILITY: {path.relative_to(ROOT)}")
    if subprocess.run(["git", "cat-file", "-t", "73fafffb"], cwd=ROOT, capture_output=True, text=True).stdout.strip() != "commit":
        raise SystemExit("R1_BLOCKED_IMMUTABILITY: alpha lock commit missing")
    if MANIFEST.exists() or DATA.exists():
        raise SystemExit("R1_BLOCKED: holdout forcing already exists; no overwrite")
    units = holdout_units()
    scope = {"ruleId": "model-protocol-step20-generalization-parameter-validation", "purpose": "R1 holdout forcing scope, computed before any download", "afterAlphaLockCommit": "73fafffb",
             "createdAtUTC": a17.now(), "forcingProtocol": "STEP 17 (551668ef) verbatim: ocean box = t0 bbox ± 2.0°, lat clipped to [-40, 40]; wind box = ocean box ± 3.0°; ocean t0..t0+72h @3 h (25 frames); wind t0-12h..t0+84h @6 h (17 frames)",
             "units": [{"windowId": u["windowId"], "startUTC": u["start"], "endUTC": u["end"], "drifterCount": len(u["drifters"]), "drifterIds": [d for d, *_ in u["drifters"]],
                        "releaseLatRange": [min(x[2] for x in u["drifters"]), max(x[2] for x in u["drifters"])], "releaseLonRange": [min(x[1] for x in u["drifters"]), max(x[1] for x in u["drifters"])],
                        "oceanBox": u["oceanBox"], "windBox": u["windBox"],
                        "requiredOceanTimestamps": [(u["t0"] + timedelta(hours=3 * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(25)],
                        "requiredWindTimestamps": [(u["t0"] - timedelta(hours=12) + timedelta(hours=6 * i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(17)],
                        "hycomQueries": [url for _, url in a17.hycom_parts(u)], "ncepQueries": [url for _, _, url in a17.wind_parts(u)]} for u in units]}
    SCOPE.write_text(json.dumps(scope, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scope": str(SCOPE.relative_to(ROOT)), "units": [(s["windowId"], s["oceanBox"]) for s in scope["units"]]}), flush=True)
    a17.DATA, a17.MANIFEST, a17.run_units = DATA, MANIFEST, holdout_units   # only the unit source and the output location change
    a17.main()
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    m.update({"phase": "STEP 20 Phase B-2 R1 holdout forcing acquisition", "step20RuleId": "model-protocol-step20-generalization-parameter-validation", "step20LockCommit": "155995dd",
              "alphaLockCommit": "73fafffb", "acquiredAfterAlphaLock": True, "selectedAlphaArtifactSha256": LOCKED[ALPHA], "step20PreregistrationSha256": LOCKED[PREREG20],
              "step17ForcingProtocolSha256": a17.PROTO_SHA, "step17ForcingManifestSha256": LOCKED[ROOT / "docs/research/step17-forcing-manifest.json"], "step17FilesModified": False,
              "scopeFile": str(SCOPE.relative_to(ROOT)), "scopeSha256": a17.sha(SCOPE), "unitSource": "docs/research/step20-preregistration.json holdout.runUnits (KE-H1, KE-H2, KE-H3)",
              "substituteForcing": "NONE (no GLORYS, no ERA5, no other HYCOM/NCEP product)", "acquisitionTool": {"file": "tools/research/acquire_step20_holdout_forcing.py", "sha256": a17.sha(__file__)}})
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST.relative_to(ROOT)), "primaryStatus": m["primaryStatus"], "manifestSha256": a17.sha(MANIFEST)}), flush=True)


if __name__ == "__main__":
    main()

"""Deterministic validator for STEP 18 Phase A (model/trajectory preregistration). exit 0 = PASS, exit 1 = FAIL.
Checks the protocol document, the preregistration JSON and the SHA file against each other and against the
immutable parents (STEP 15/16/17). Constants are parsed from the protocol text; nothing is hand-written PASS.
No model run, no trajectory, no result file may exist."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step18-model-protocol.md"
PREREG = ROOT / "docs/research/step18-preregistration.json"
RULE_SHA = ROOT / "docs/research/step18-model-rule-sha256.txt"
PARENTS = {
    "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
    "docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792",
    "docs/research/step17-preregistration.json": "b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378",
    "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
}
PARENT_COMMITS = {"step15Commit": "7091c5cb", "step16CohortCommit": "5bc3590b", "step17LockCommit": "551668ef", "step17PhaseBCommit": "cc4d8c48"}
RULE_ID = "model-protocol-step18-openloop-72h-alpha0007"
SECRET_PATTERNS = (r"password", r"passwd", r"api[_-]?key", r"token=", r"authorization", r"Basic [A-Za-z0-9+/=]{8,}")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def commit_exists(short):
    try:
        return subprocess.run(["git", "cat-file", "-t", short], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip() == "commit"
    except (OSError, subprocess.SubprocessError):
        return False


def main():
    failures = []
    check = lambda ok, msg: failures.append(msg) if not ok else None
    text = PROTO.read_text(encoding="utf-8")
    p = json.loads(PREREG.read_text(encoding="utf-8"))
    # 1 cross references: protocol SHA in JSON, both SHAs in the rule file
    proto_sha = sha(PROTO)
    lines = [l.split() for l in RULE_SHA.read_text(encoding="utf-8").splitlines() if l.strip()]
    rule_map = {l[1]: l[0] for l in lines if len(l) == 2}
    check(p.get("protocolDocumentSha256") == proto_sha, "1 preregistration.protocolDocumentSha256 == sha(protocol)")
    check(rule_map.get("docs/research/step18-model-protocol.md") == proto_sha, "1 rule file protocol SHA")
    check(rule_map.get("docs/research/step18-preregistration.json") == sha(PREREG), "1 rule file preregistration SHA")
    check(f"Rule ID: **{RULE_ID}**" in text and p.get("ruleId") == RULE_ID, "1 rule ID consistent")
    check("Status: PREREGISTRATION LOCKED" in text and p.get("status") == "PREREGISTRATION LOCKED", "1 LOCK status in both")
    # 2 parents immutable
    for rel, expected in PARENTS.items():
        check(sha(ROOT / rel) == expected, f"2 parent unchanged: {rel}")
        check(expected in text, f"2 parent SHA cited in protocol: {rel}")
    ic = p.get("immutabilityCheck", {})
    for key, short in PARENT_COMMITS.items():
        check(ic.get(key) == short and commit_exists(short), f"2 parent commit {key}={short}")
    check(ic.get("step16CohortSha256") == PARENTS["docs/research/cohort-step16.json"] and ic.get("step17ProtocolSha256") == PARENTS["docs/research/step17-forcing-protocol.md"]
          and ic.get("step17PreregistrationSha256") == PARENTS["docs/research/step17-preregistration.json"] and ic.get("step17ForcingManifestSha256") == PARENTS["docs/research/step17-forcing-manifest.json"], "2 immutabilityCheck SHAs")
    fm = json.loads((ROOT / "docs/research/step17-forcing-manifest.json").read_text(encoding="utf-8"))
    check(ic.get("aggregateForcingSha256") == fm["aggregateForcingSha256"], "2 aggregateForcingSha256 matches manifest")
    obs = json.loads((ROOT / "docs/research/step15-observation-manifest.json").read_text(encoding="utf-8"))["observationSha256"]
    check(ic.get("observationSha256") == obs and obs in text, "2 observationSha256 matches STEP 15 manifest")
    # 3 run units identical to STEP 17 manifest (no add/remove, same domains and forcing SHAs)
    units = {u["windowId"]: u for u in p.get("runUnits", [])}
    for u in fm["runUnits"]:
        q = units.get(u["windowId"])
        check(q is not None and q["t0"] == u["t0"] and q["end"] == u["end"] and sorted(q["drifterIds"]) == sorted(u["drifterIds"]) and q["drifterCount"] == u["drifterCount"]
              and q["oceanDomain"] == u["oceanDomain"] and q["forcingSha256"] == u["forcingSha256"]
              and q["hycomGridSha256"] == u["hycom"]["normalized"]["gridSha256"] and q["ncepGridSha256"] == u["ncep"]["normalized"]["gridSha256"], f"3 run unit {u['windowId']} identical to STEP 17")
        if q:
            check(q["modelArea"] == {"west": u["oceanDomain"]["west"], "east": u["oceanDomain"]["east"], "south": -40.0, "north": 40.0}, f"3 model area {u['windowId']} = lat[-40,40] x locked lon")
            check(u["hycom"]["normalized"]["gridSha256"][:8] in text and u["ncep"]["normalized"]["gridSha256"][:8] in text, f"3 grid SHAs cited in protocol {u['windowId']}")
    check(len(units) == 4 and sum(u["drifterCount"] for u in units.values()) == 23 and p.get("cohort", {}).get("uniqueDrifters") == 23, "3 four run units / 23 drifters")
    # 4 model equation and conversion
    check("dX/dt = U_ocean(15 m) + α · U_wind(10 m)" in text and p["model"]["equation"].startswith("dX/dt = U_ocean(15 m) + alpha * U_wind(10 m)"), "4 equation")
    check("cos φ" in text and "1852 × 60" in text and "cos(lat)" in p["model"]["coordinateConversion"], "4 spherical geographic conversion (no fixed km/deg)")
    check("15 m 층 하나만" in text and p["model"]["depth"].startswith("15 m only"), "4 15 m depth only")
    check(p["model"]["observationUsedByModel"] is False and p["model"]["randomSeed"] is None and p["model"]["deterministic"] is True, "4 open-loop, deterministic, no RNG")
    check(p["model"]["modelId"] == "surface-passive-advection.v2.windage" and p["model"]["modelVersion"] == "0.1.0", "4 model id/version")
    # 5 time: parse from text
    out_step = re.search(r"출력·평가 시간 간격 = (\d+) s", text)
    int_step = re.search(r"RK4 내부 적분 간격 = (\d+) s", text)
    check(out_step and int(out_step.group(1)) == 900 == p["time"]["outputStepSeconds"], "5 output step 900 s")
    check(int_step and int(int_step.group(1)) == p["time"]["integrationStepSeconds"] and 900 % int(int_step.group(1)) == 0, "5 integration substep divides 900 s")
    bounds = dict(re.findall(r"(KE-1|KE-2|AG-1|AG-2) (\d+) s", text))
    check(len(bounds) == 4 and all(int(b) >= p["time"]["integrationStepSeconds"] for b in bounds.values()) and {k: int(v) for k, v in bounds.items()} == p["time"]["gridTravelBoundSeconds"], "5 integration step within every grid-travel bound (documented)")
    check(p["time"]["durationSeconds"] == 259200 and p["time"]["outputSamplesPerDrifter"] == 259200 // 900 + 1 and "정확히 t0+72h" in text, "5 72 h, last timestamp t0+72h, 289 samples")
    # 6 interpolation flags
    ip = p["interpolation"]
    check(all(ip[k] is False for k in ("extrapolation", "regridding", "smoothing", "zeroFill", "landValues", "frameDuplication")) and ip["spatial"].startswith("bilinear") and ip["temporal"].startswith("linear"), "6 interpolation policy")
    check("외삽 없음" in text and "regridding" in text and "결측 0 대체" in text, "6 prohibitions in protocol text")
    # 7 domain and status vocabulary
    check(p["domain"]["latitude"] == [-40.0, 40.0] and "[−40°, +40°]" in text, "7 latitude domain")
    st = p["statusRules"]
    check(st["vocabulary"] == ["OUT_OF_DOMAIN", "FORCING_UNAVAILABLE"], "7 exactly two status names")
    check(st["runtimeMapping"]["MISSING_FORCING"] == "FORCING_UNAVAILABLE" and st["runtimeMapping"]["STRANDED"] == "FORCING_UNAVAILABLE", "7 runtime status mapping documented")
    check("MISSING_FORCING → FORCING_UNAVAILABLE" in text and "STRANDED → FORCING_UNAVAILABLE" in text, "7 mapping in protocol text")
    check(st["independentPerRun"] is True and "AG-1" in st and "−39.8" in text, "7 independent per run; AG-1 case documented")
    check("제거하지 않는다" in text and "never removed" in st["onTermination"], "7 drifter never removed")
    # 8 runs
    runs = {r["runId"]: r for r in p["runs"]}
    check(set(runs) == {"step18-A-alpha0007", "step18-B-alpha0"} and runs["step18-A-alpha0007"]["alpha"] == 0.0007 and runs["step18-B-alpha0"]["alpha"] == 0.0, "8 RUN A/B alpha")
    s17 = json.loads((ROOT / "docs/research/step17-preregistration.json").read_text(encoding="utf-8"))["alpha"]
    check(s17["primary"] == 0.0007 and s17["control"] == 0.0 and s17["locked"] is True, "8 alpha equals STEP 17 locked alpha")
    check(p["otherAlphaRuns"] == "PROHIBITED" and p["precomputedAlphaRuns"] is False and len(p["runOrder"]) == 8, "8 no other alpha, 8 runtime calls")
    check("| **RUN A** = `step18-A-alpha0007` | 0.0007 |" in text and "| **RUN B** = `step18-B-alpha0` | 0 (control) |" in text, "8 runs in protocol text")
    # 9 output schema
    cols = ["run_id", "drifter_id", "timestamp", "lat", "lon", "alpha", "status", "valid"]
    check(p["output"]["columns"] == cols and "`" + ", ".join(cols) + "`" in text, "9 output columns fixed")
    check(p["output"]["committed"] is False and p["output"]["root"] == "data/research/step18/" and "commit하지 않는다" in text, "9 outputs not committed")
    check(set(p["output"]["columnRules"]["status"]) == {"ACTIVE", "COMPLETED", "OUT_OF_DOMAIN", "FORCING_UNAVAILABLE"}, "9 status column values")
    check("NOT INCLUDED" in p["output"]["optionalVelocityColumns"] and "포함하지 않는다" in text, "9 optional velocity columns decided (excluded)")
    # 10 manifest fields and metrics
    need = {"protocolSha256", "modelRuleSha256", "cohortSha256", "forcingManifestSha256", "runs[].runId", "runs[].drifterCount", "runs[].alpha", "runs[].integrationStepSeconds", "runs[].outputStepSeconds", "outputSchema", "runs[].trajectoriesSha256", "runs[].replayMatched"}
    check(need <= set(p["manifest"]["fields"]), "10 manifest fields cover the mandated list")
    mt = p["metrics"]
    check(all(k in mt for k in ("M1", "M2", "M3", "M4", "M5")) and all(f"| {k} " in text for k in ("M1", "M2", "M3", "M4", "M5")), "10 five metrics in both")
    check(mt["acceptanceThresholds"].startswith("NONE") and "판정 기준(PASS/FAIL 임계값)은 이 protocol에서 두지 않는다" in text, "10 no acceptance threshold (explicit)")
    check("통계 독립성을 보장하지 않는다" in text and "independence" in mt["independenceNote"], "10 temporal overlap ≠ independence")
    check("신뢰구간은 산출하지 않는다" in text and mt["confidenceIntervals"].startswith("none"), "10 no CI for deterministic model")
    check("6371008.8" in text and "6371008.8" in mt["distance"], "10 distance constant")
    # 11 failure policy and prohibitions
    fp = p["failurePolicy"]
    check(all(k in fp for k in ("inputShaMismatch", "preflightError", "runtimeException", "replayMismatch", "earlyTermination")) and "MODEL_RUN_BLOCKED_IMMUTABILITY" in text and "MODEL_RUN_FAIL" in text, "11 failure policy")
    check(len(p["prohibited"]) >= 8 and "## 11. 금지" in text, "11 prohibitions")
    # 12 nothing executed
    check(p["modelRun"] is False and p["trajectoryComputed"] is False and p["resultFilesCreated"] is False, "12 flags: no run / no trajectory / no result files")
    check(not (ROOT / "data/research/step18").exists(), "12 data/research/step18 does not exist")
    check(not (ROOT / "docs/research/step18-model-manifest.json").exists(), "12 no model manifest yet")
    check("data/research/step18/" in (ROOT / ".gitignore").read_text(encoding="utf-8"), "12 .gitignore blocks step18 outputs")
    # 13 secrets
    for path in (PROTO, PREREG, RULE_SHA):
        check(not any(re.search(pat, path.read_text(encoding="utf-8"), re.I) for pat in SECRET_PATTERNS), f"13 no secret pattern in {path.name}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleId": p.get("ruleId"), "status": p.get("status"),
                      "protocolSha256": proto_sha, "preregistrationSha256": sha(PREREG), "ruleFileSha256": sha(RULE_SHA)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

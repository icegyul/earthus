"""Deterministic validator for STEP 18b Phase A (model/trajectory preregistration revision). exit 0 = PASS, exit 1 = FAIL.
Cross-checks protocol text, preregistration JSON and SHA file; verifies the immutable ancestry (STEP 17, STEP 18 LOCK,
STEP 18 BLOCKED manifest); verifies the computation area = STEP 17 ocean box with the latitude clip rule and its
containment in the wind box; parses constants from the protocol text. Nothing executed; nothing hand-written PASS."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step18b-model-protocol.md"
PREREG = ROOT / "docs/research/step18b-preregistration.json"
RULE_SHA = ROOT / "docs/research/step18b-model-rule-sha256.txt"
ANCESTRY = {
    "docs/research/cohort-step16.json": "8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474",
    "docs/research/step17-forcing-protocol.md": "db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792",
    "docs/research/step17-preregistration.json": "b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378",
    "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86",
    "docs/research/step18-model-protocol.md": "519b3d35bc13524b3e0a30f5521cd2e696ffecdceead58535b0c4959ac3bea2b",
    "docs/research/step18-preregistration.json": "f02b17379140c8d0f7304dc2f15d512341c089b6773d2b4f6021da382972ecf4",
    "docs/research/step18-model-rule-sha256.txt": "1a107b7edd49844e01e881de46c4bef477ac7dae336beac431dbd6efafd1388c",
    "docs/research/step18-model-manifest.json": "02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb",
}
COMMITS = {"step15Commit": "7091c5cb", "step16CohortCommit": "5bc3590b", "step17LockCommit": "551668ef", "step17PhaseBCommit": "cc4d8c48", "step18LockCommit": "d505cc5e", "step18PhaseBCommit": "5607ac1a"}
RULE_ID = "model-protocol-step18b-openloop-72h-alpha0007"
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
    proto_sha = sha(PROTO)
    rule_map = {l.split()[1]: l.split()[0] for l in RULE_SHA.read_text(encoding="utf-8").splitlines() if len(l.split()) == 2}
    check(p.get("protocolDocumentSha256") == proto_sha and rule_map.get("docs/research/step18b-model-protocol.md") == proto_sha, "1 protocol SHA cross-reference")
    check(rule_map.get("docs/research/step18b-preregistration.json") == sha(PREREG), "1 rule file preregistration SHA")
    check(f"Rule ID: **{RULE_ID}**" in text and p.get("ruleId") == RULE_ID, "1 rule ID")
    check("Status: PREREGISTRATION LOCKED" in text and p.get("status") == "PREREGISTRATION LOCKED", "1 LOCK status in both")
    # 2 ancestry immutable and cited
    ic = p.get("immutabilityCheck", {})
    for rel, expected in ANCESTRY.items():
        check(sha(ROOT / rel) == expected, f"2 ancestor unchanged: {rel}")
        check(expected in text, f"2 ancestor SHA cited in protocol: {rel}")
    for key, short in COMMITS.items():
        check(ic.get(key) == short and commit_exists(short) and short in text, f"2 ancestor commit {key}={short}")
    check(ic.get("step18ProtocolSha256") == ANCESTRY["docs/research/step18-model-protocol.md"] and ic.get("step18PreregistrationSha256") == ANCESTRY["docs/research/step18-preregistration.json"]
          and ic.get("step18ModelRuleSha256") == ANCESTRY["docs/research/step18-model-rule-sha256.txt"] and ic.get("step18ManifestSha256") == ANCESTRY["docs/research/step18-model-manifest.json"], "2 STEP 18 SHAs recorded")
    s18m = json.loads((ROOT / "docs/research/step18-model-manifest.json").read_text(encoding="utf-8"))
    sup = p.get("supersedesForExecution", {})
    check(s18m["status"] == "MODEL_RUN_BLOCKED_PREFLIGHT" and sup.get("phaseBStatus") == "MODEL_RUN_BLOCKED_PREFLIGHT" and sup.get("runsExecuted") == "0/8" and sup.get("blockReason") == "WIND_COVERAGE"
          and all(r["status"] == "MODEL_RUN_BLOCKED_PREFLIGHT" and "WIND_COVERAGE" in r["preflight"]["errors"][0] for r in s18m["runs"]) and len(s18m["runs"]) == 8, "2 STEP 18 BLOCKED lineage recorded (0/8, WIND_COVERAGE)")
    check("MODEL_RUN_BLOCKED_PREFLIGHT, 0 / 8 runs executed, reason WIND_COVERAGE" in text and sup.get("step18Rerun") is False and sup.get("step18Modified") is False, "2 STEP 18 not rerun / not modified")
    fm = json.loads((ROOT / "docs/research/step17-forcing-manifest.json").read_text(encoding="utf-8"))
    check(ic.get("aggregateForcingSha256") == fm["aggregateForcingSha256"], "2 aggregateForcingSha256")
    obs = json.loads((ROOT / "docs/research/step15-observation-manifest.json").read_text(encoding="utf-8"))["observationSha256"]
    check(ic.get("observationSha256") == obs and obs in text, "2 observationSha256")
    s18 = json.loads((ROOT / "docs/research/step18-preregistration.json").read_text(encoding="utf-8"))
    # 3 run units identical to STEP 17; computation area = ocean box with latitude clip; inside wind box; cited in table
    units = {u["windowId"]: u for u in p.get("runUnits", [])}
    for u in fm["runUnits"]:
        q = units.get(u["windowId"]); box = u["oceanDomain"]; wb = u["windDomain"]
        check(q is not None and q["t0"] == u["t0"] and q["end"] == u["end"] and sorted(q["drifterIds"]) == sorted(u["drifterIds"]) and q["drifterCount"] == u["drifterCount"]
              and q["oceanDomain"] == box and q["forcingSha256"] == u["forcingSha256"] and q["hycomGridSha256"] == u["hycom"]["normalized"]["gridSha256"] and q["ncepGridSha256"] == u["ncep"]["normalized"]["gridSha256"]
              and q["hycomFileSha256"] == u["hycom"]["normalized"]["fileSha256"] and q["ncepFileSha256"] == u["ncep"]["normalized"]["fileSha256"], f"3 run unit {u['windowId']} identical to STEP 17")
        if q:
            area = q["computationArea"]
            check(area == {"west": box["west"], "east": box["east"], "south": max(box["south"], -40.0), "north": min(box["north"], 40.0)}, f"3 {u['windowId']} area = ocean box, lat clipped to [-40,40]")
            check(-40 <= area["south"] < area["north"] <= 40, f"3 {u['windowId']} area within experiment domain")
            check(wb["west"] <= area["west"] and area["east"] <= wb["east"] and wb["south"] <= area["south"] and area["north"] <= wb["north"], f"3 {u['windowId']} area corners inside wind box (CHECK A)")
            row = re.search(rf"\| {u['windowId']} \| ([^|]+) \|", text)
            nums = [float(x) for x in re.findall(r"−?-?\d+\.?\d*", row.group(1).replace("−", "-"))] if row else []
            check(len(nums) == 4 and all(abs(a - b) < 1e-5 for a, b in zip(nums, (area["west"], area["east"], area["south"], area["north"]))), f"3 {u['windowId']} area table in protocol matches JSON")
    check(len(units) == 4 and sum(u["drifterCount"] for u in units.values()) == 23 and p["cohort"]["uniqueDrifters"] == 23, "3 four units / 23 drifters")
    check("model computation area = locked ocean forcing coverage ∩ experiment domain" in text and "south = max(box.south, −40), north = min(box.north, +40)" in text, "3 clipping rule stated in protocol")
    # 4 everything else identical to STEP 18
    for key in ("model", "time", "interpolation", "runs", "runOrder", "metrics", "failurePolicy", "lockPolicy"):
        check(p.get(key) == s18.get(key), f"4 {key} identical to STEP 18")
    check(p["output"]["columns"] == s18["output"]["columns"] and p["output"]["columnRules"] == s18["output"]["columnRules"] and p["output"]["root"] == "data/research/step18b/", "4 output schema identical, new root")
    check(p["output"]["velocityColumns"] == "PROHIBITED" and "velocity 열 금지" in text, "4 velocity columns prohibited")
    check("dX/dt = U_ocean(15 m) + α · U_wind(10 m)" in text and "cos φ를 매 RK4 단계에서 현재 위도로 평가" in text and "15 m 층만" in text, "4 equation / conversion / depth in text")
    out_step = re.search(r"출력·평가 시간 간격 = (\d+) s", text); int_step = re.search(r"RK4 내부 적분 간격 = (\d+) s", text)
    check(out_step and int(out_step.group(1)) == 900 == p["time"]["outputStepSeconds"] and int_step and int(int_step.group(1)) == 300 == p["time"]["integrationStepSeconds"], "4 900 s output / 300 s substep")
    bounds = {k: int(v) for k, v in re.findall(r"(KE-1|KE-2|AG-1|AG-2) (\d+) s", text)}
    check(bounds == {"KE-1": 655, "KE-2": 733, "AG-1": 579, "AG-2": 663} == p["time"]["gridTravelBoundSeconds"] and all(b >= 300 for b in bounds.values()), "4 grid-travel bounds unchanged and satisfied")
    check("289 샘플" in text and p["time"]["outputSamplesPerDrifter"] == 289 and "정확히 t0+72h" in text, "4 289 samples, last t0+72h")
    runs = {r["runId"]: r["alpha"] for r in p["runs"]}
    check(runs == {"step18-A-alpha0007": 0.0007, "step18-B-alpha0": 0.0} and "| **RUN A** = `step18-A-alpha0007` | 0.0007 |" in text and "| **RUN B** = `step18-B-alpha0` | 0 (control) |" in text, "4 RUN A/B alpha")
    s17a = json.loads((ROOT / "docs/research/step17-preregistration.json").read_text(encoding="utf-8"))["alpha"]
    check(s17a["primary"] == 0.0007 and s17a["control"] == 0.0 and s17a["locked"] is True, "4 alpha equals STEP 17 locked alpha")
    check(len(p["runOrder"]) == 8 and "1 KE-1 A · 2 KE-1 B · 3 KE-2 A · 4 KE-2 B · 5 AG-1 A · 6 AG-1 B · 7 AG-2 A · 8 AG-2 B" in text, "4 8 runs fixed order")
    # 5 status vocabulary / mapping
    st = p["statusRules"]
    check(st["vocabulary"] == ["OUT_OF_DOMAIN", "FORCING_UNAVAILABLE"] and st["runtimeMapping"]["MISSING_FORCING"] == "FORCING_UNAVAILABLE" and st["runtimeMapping"]["STRANDED"] == "FORCING_UNAVAILABLE", "5 status vocabulary/mapping")
    check("MISSING_FORCING → FORCING_UNAVAILABLE" in text and "STRANDED → FORCING_UNAVAILABLE" in text and "±40° 규칙은 **global/domain status rule로 유지**" in text, "5 ±40 rule kept, mapping in text")
    check(p["domain"]["globalStatusLatitude"] == [-40.0, 40.0] and st["boundaryClassificationToleranceDegrees"] == 1e-6 and "1e-6°" in text, "5 global ±40 rule and tolerance documented")
    # 6 forcing unchanged / no zero fill / no GLORYS
    f = p["forcing"]
    check(f["newDownload"] is False and f["step17DataModified"] is False and f["missingWindZeroFill"] is False and f["glorys"] == "NOT USED", "6 forcing policy flags")
    check("새 forcing 다운로드 금지" in text and "결측 바람을 0으로 대체하지 않는다" in text and "GLORYS는 쓰지 않는다" in text, "6 forcing policy in text")
    # 7 replay / manifest / metrics
    check("replayMatched" in p["replay"]["criterion"] and "MODEL_RUN_FAIL" in p["replay"]["criterion"] and "## 9. Replay" in text, "7 replay rule")
    need = {"ruleId", "step18BlockedRun", "step18ProtocolSha256", "step18PreregistrationSha256", "forcingManifestSha256", "cohortSha256", "modelParameters", "runs[].computationArea", "runs[].runId", "runs[].alpha", "runs[].resultSha256", "metrics", "status", "replayMatched"}
    check(need <= set(p["manifest"]["fields"]) and p["manifest"]["file"] == "docs/research/step18b-model-manifest.json", "7 manifest fields")
    check(all(f"| {k} " in text for k in ("M1", "M2", "M3", "M4", "M5")) and p["metrics"]["acceptanceThresholds"].startswith("NONE") and "판정 기준(PASS/FAIL 임계값)은 이 protocol에서 두지 않는다" in text, "7 metrics, no threshold")
    check("통계 독립성을 보장하지 않는다" in text and "신뢰구간은 산출하지 않는다" in text and "6371008.8" in text, "7 independence / no CI / distance constant")
    # 8 nothing executed
    check(all(p[k] is False for k in ("modelRun", "trajectoryComputed", "metricsComputed", "replayPerformed", "resultFilesCreated")), "8 flags: nothing executed")
    check(not (ROOT / "data/research/step18b").exists() and not (ROOT / "docs/research/step18b-model-manifest.json").exists(), "8 no step18b outputs / manifest")
    check("data/research/step18b/" in (ROOT / ".gitignore").read_text(encoding="utf-8"), "8 .gitignore blocks step18b outputs")
    check("STEP 18 재실행" in text and "rerunning STEP 18" in p["prohibited"], "8 STEP 18 rerun prohibited")
    for path in (PROTO, PREREG, RULE_SHA):
        check(not any(re.search(pat, path.read_text(encoding="utf-8"), re.I) for pat in SECRET_PATTERNS), f"9 no secret pattern in {path.name}")
    print(json.dumps({"result": "PASS" if not failures else "FAIL", "failures": failures, "ruleId": p.get("ruleId"), "status": p.get("status"),
                      "protocolSha256": proto_sha, "preregistrationSha256": sha(PREREG), "ruleFileSha256": sha(RULE_SHA)}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

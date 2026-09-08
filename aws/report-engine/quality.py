# -*- coding: utf-8 -*-
"""자료 품질검사 (PHASE 7 §4).

FAIL 이면 발행 단계로 가지 않는다. WARN 은 보고서에 한계를 적고 계속 간다.
문제 있는 자료를 숨기지도, 과장하지도 않는다.
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import report_period as rp   # noqa: E402

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"

# 물리적으로 불가능한 값을 거른다. 넓게 잡되 명백한 쓰레기는 잡는다.
RANGES = {
    "mae": (0.0, 100.0),      # 음수 절대오차는 존재할 수 없다
    "rmse": (0.0, 200.0),
    "me": (-100.0, 100.0),
    "n": (1, 10_000_000),
}


def _chk(name, ok, level, detail):
    return {"check": name, "status": PASS if ok else level, "detail": None if ok else detail}


def check_verify_daily(doc, *, period=None, now=None, stale_days=3):
    """kma-verify 일별 채점 자료 검사. 다른 어댑터가 생기면 같은 모양으로 만든다.

    돌려주는 것: DataQuality {datasetId, checkedAt, status, checks, warnings, failures}
    """
    now = now or datetime.now(timezone.utc)
    checks = []
    doc = doc or {}
    days = doc.get("days") or {}

    # 1) 스키마
    checks.append(_chk("schema", isinstance(days, dict) and "generated" in doc, FAIL,
                       "days 또는 generated 가 없다"))
    # 2) 자료 존재
    checks.append(_chk("not_empty", bool(days), FAIL, "채점된 날이 하나도 없다"))
    # 3) 리드 기준 — 2026-08 사고 이후 observation-time 이 아니면 숫자를 믿을 수 없다
    checks.append(_chk("lead_basis", doc.get("leadBasis") == "observation-time", FAIL,
                       f"leadBasis 가 observation-time 이 아니다: {doc.get('leadBasis')}"))
    # 4) 신선도
    gen = doc.get("generated")
    fresh_ok, fresh_detail = True, None
    if gen:
        try:
            g = datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            age = (now - g).days
            fresh_ok = age <= stale_days
            fresh_detail = f"{age}일 지났다"
        except ValueError:
            fresh_ok, fresh_detail = False, f"시각 형식이 아니다: {gen}"
    else:
        fresh_ok, fresh_detail = False, "generated 가 없다"
    checks.append(_chk("freshness", fresh_ok, WARN, fresh_detail))

    # 5) 값 범위 · 6) 자료형 · 7) 결측
    bad_range, bad_type, missing = [], [], []
    for day, combos in days.items():
        for key, v in (combos or {}).items():
            if not isinstance(v, dict):
                bad_type.append(f"{day}/{key}")
                continue
            for f in ("me", "mae", "rmse", "n"):
                if f not in v or v[f] is None:
                    missing.append(f"{day}/{key}.{f}")
                    continue
                if not isinstance(v[f], (int, float)):
                    bad_type.append(f"{day}/{key}.{f}")
                    continue
                lo, hi = RANGES[f]
                if not lo <= v[f] <= hi:
                    bad_range.append(f"{day}/{key}.{f}={v[f]}")
    checks.append(_chk("datatype", not bad_type, FAIL, f"자료형 이상 {len(bad_type)}건: {bad_type[:3]}"))
    checks.append(_chk("range", not bad_range, FAIL, f"범위 밖 {len(bad_range)}건: {bad_range[:3]}"))
    checks.append(_chk("missing", not missing, WARN, f"결측 {len(missing)}건: {missing[:3]}"))

    # 8) 날짜 형식 · 중복
    bad_day = [d for d in days if not (len(d) == 10 and d[4] == "-" and d[7] == "-")]
    checks.append(_chk("timestamp", not bad_day, FAIL, f"날짜 형식 이상: {bad_day[:3]}"))
    # dict 라 키 중복은 구조상 불가능하다. 그 사실을 검사로 남겨 둔다.
    checks.append(_chk("duplicate", True, FAIL, None))

    # 9) 단위 — 변수별 단위를 어댑터가 붙인다. 여기서는 알려진 변수인지만 본다.
    unknown_vars = set()
    for combos in days.values():
        for key in (combos or {}):
            parts = key.split("|")
            if len(parts) == 3 and parts[1] not in ("temperature_2m", "wind_speed_10m"):
                unknown_vars.add(parts[1])
    checks.append(_chk("unit", not unknown_vars, WARN,
                       f"단위를 모르는 변수: {sorted(unknown_vars)}"))

    # 10) 출처 일관성
    checks.append(_chk("source_consistency", bool(doc.get("source")), WARN, "source 표기가 없다"))

    # 11) 기간 덮임 — 기간을 준 경우에만
    if period:
        covered = [d for d in days if rp.contains(period, d)]
        checks.append(_chk("period_coverage", bool(covered), FAIL,
                           f"{rp.label(period)} 에 채점된 날이 없다"))

    failures = [c for c in checks if c["status"] == FAIL]
    warnings = [c for c in checks if c["status"] == WARN]
    status = FAIL if failures else (WARN if warnings else PASS)
    return {
        "datasetId": "wind/series/verify-daily.json",
        "checkedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": status,
        "checks": checks,
        "warnings": warnings,
        "failures": failures,
    }


def blocks_publication(quality):
    """FAIL 이면 발행하지 않는다. WARN 은 막지 않되 보고서에 한계를 남긴다."""
    return bool(quality) and quality.get("status") == FAIL

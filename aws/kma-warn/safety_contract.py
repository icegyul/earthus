"""KMA warning revision command contract.

공식 command code의 의미를 문자열 포함 검사로 추측하지 않는다.
1 발표, 2 대치, 3 해제, 4 해제예보 연장. 모르는 값은 UNKNOWN으로 보존한다.
"""


def command_state(value):
    raw = str(value or "").strip()
    compact = "".join(raw.split())
    if compact in {"1", "발표"}:
        return "PUBLISHED"
    if compact in {"2", "대치"}:
        return "REPLACED"
    if compact in {"3", "해제"}:
        return "RELEASED"
    if compact in {"4", "해제예보연장", "해제예고연장"}:
        return "RELEASE_FORECAST_EXTENDED"
    return "UNKNOWN"


def latest_by_region_kind(records):
    """입력 순서·중복과 무관하게 (region, kind)의 최신 발표만 남긴다."""
    latest = {}
    for record in records:
        region_id = str(record.get("reg_id") or "").strip()
        kind = str(record.get("wrn") or "").strip()
        issued = str(record.get("tm_fc") or "").strip()
        if not region_id or not kind or len(issued) < 12 or not issued[:12].isdigit():
            continue
        key = (region_id, kind)
        previous = latest.get(key)
        if previous is None or str(previous.get("tm_fc") or "") < issued:
            latest[key] = dict(record)
    return latest

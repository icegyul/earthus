# -*- coding: utf-8 -*-
"""공식 특보 → CAP 1.2 정규화 필드 (지시서 v1.1 §4.4 · 착수 지시 P0).

특보 기록마다 `cap` 객체를 **옆에 하나 더 단다.** 원문 필드는 그대로 두고 고치지 않는다
(원문 재작성 금지). 새 배지·새 표는 없다 — 특보는 계속 OFFICIAL_WARNING 이다.

출처별로 정직하게 다르다
  NWS (world-alerts)  api.weather.gov 가 CAP 원본 필드를 준다 → **그대로 옮긴다.** 매핑 없음.
  기상청 (kma-warn)     API허브 wrn_now_data 는 CAP 형식이 아니다(2026-09-20 기준, 허브 목록에서
                       CAP 엔드포인트를 확인하지 못했다 — 확인 못 한 것이지 없다는 뜻이 아니다).
                       원본이 **말한 것만** 옮긴다: 특보 수준 → severity, 명령 코드 → msgType,
                       발효 시각 → onset. 긴급도·확실도·대응·만료는 원본에 없으므로 Unknown/null.
  JMA (jma-warn)       r8 map.json 도 CAP 이 아니다. 状態(発表·継続·解除) → msgType, 発表 시각 → onset,
                       관서 → senderName, 관서가 쓴 headlineText 원문 → headline. 특보 코드가 경보인지
                       주의보인지 우리는 이름을 붙이지 않는다(handler 규칙) → severity 도 Unknown.

⚠️⚠️ Unknown 을 추측으로 채우지 않는다. '주의보면 Expected 겠지' 같은 긴급도를 지어 넣으면 푸시·배너가
   그 추측을 기관 판단처럼 보여 준다. CAP 1.2 는 바로 이런 경우를 위해 Unknown 을 둔다.
⚠️ status ∈ {Test, Exercise, Draft, System} 은 화면·푸시에 내보내지 않는다 — displayable() 이 거른다.
"""

CAP_VERSION = "CAP-1.2"

STATUS = ("Actual", "Exercise", "System", "Test", "Draft")
MSG_TYPE = ("Alert", "Update", "Cancel", "Ack", "Error")
URGENCY = ("Immediate", "Expected", "Future", "Past", "Unknown")
SEVERITY = ("Extreme", "Severe", "Moderate", "Minor", "Unknown")
CERTAINTY = ("Observed", "Likely", "Possible", "Unlikely", "Unknown")
RESPONSE_TYPE = ("Shelter", "Evacuate", "Prepare", "Execute", "Avoid", "Monitor", "Assess", "AllClear", "None")
NOT_FOR_DISPLAY = ("Exercise", "System", "Test", "Draft")
FIELDS = ("status", "msgType", "urgency", "severity", "certainty", "responseType",
          "senderName", "headline", "instruction", "onset", "expires")

# ── 기상청 — 우리 매핑표 (원본이 CAP 이 아니므로 매핑이 우리 판단이라는 것을 기록에 남긴다) ──
# 특보 수준 → severity. 수준의 순서(예비<주의보<경보<중대경보)만 옮긴다. 예비특보는 발효 전
# 예고라 severity 가 아니라 urgency=Future 로만 표시한다(심각도를 말하지 않는다).
KMA_LEVEL_SEVERITY = {"주의보": "Moderate", "경보": "Severe", "중대경보": "Extreme", "예비특보": "Unknown"}
# 명령 상태(safety_contract.command_state) → msgType
KMA_COMMAND_MSGTYPE = {"PUBLISHED": "Alert", "REPLACED": "Update",
                       "RELEASE_FORECAST_EXTENDED": "Update", "RELEASED": "Cancel"}
# JMA 状態 → msgType
JMA_STATUS_MSGTYPE = {"発表": "Alert", "継続": "Update", "解除": "Cancel"}


class CapError(ValueError):
    pass


def _cap(**fields):
    out = {"version": CAP_VERSION}
    for f in FIELDS:
        out[f] = fields.get(f)
    out["mappedBy"] = fields.get("mappedBy")      # 'source' | 'earthus-map' — 누가 채웠나
    return out


def validate(cap):
    """어휘 밖 값이면 위반 목록. None 은 허용(원본이 말하지 않은 칸)."""
    errs = []
    for field, allowed in (("status", STATUS), ("msgType", MSG_TYPE), ("urgency", URGENCY),
                           ("severity", SEVERITY), ("certainty", CERTAINTY), ("responseType", RESPONSE_TYPE)):
        v = cap.get(field)
        if v is not None and v not in allowed:
            errs.append("cap.%s=%r 는 CAP 1.2 어휘 밖이다" % (field, v))
    if cap.get("status") is None:
        errs.append("cap.status 가 없다 — 실제 발표인지 모르면 내보내지 않는다")
    return errs


def displayable(cap):
    """화면·푸시에 내보내도 되는가. 시험·연습·초안·시스템 메시지는 안 된다."""
    return bool(cap) and cap.get("status") == "Actual" and not validate(cap)


def _kst_iso(yyyymmddhhmm):
    s = str(yyyymmddhhmm or "")
    if len(s) < 12 or not s[:12].isdigit():
        return None
    return "%s-%s-%sT%s:%s:00+09:00" % (s[0:4], s[4:6], s[6:8], s[8:10], s[10:12])


def from_kma(rec, *, upcoming=False):
    """kma-warn 기록 하나 → cap. 원본 필드(rec)는 건드리지 않는다."""
    level = rec.get("level")
    return _cap(
        status="Actual",
        msgType=KMA_COMMAND_MSGTYPE.get(rec.get("commandState")),
        urgency="Future" if upcoming or level == "예비특보" else "Unknown",
        severity=KMA_LEVEL_SEVERITY.get(level, "Unknown"),
        certainty="Unknown",
        responseType=None,
        senderName="기상청",
        headline=None,            # API 가 문장을 주지 않는다 — 우리가 짓지 않는다
        instruction=None,
        onset=_kst_iso(rec.get("effectiveKst")),
        expires=None,             # 해제 예정 시각을 주지 않는다
        mappedBy="earthus-map",
    )


def from_nws(props):
    """api.weather.gov alert properties → cap. CAP 원본이라 그대로 옮긴다."""
    p = props or {}
    return _cap(
        status=p.get("status"),
        msgType=p.get("messageType"),
        urgency=p.get("urgency"),
        severity=p.get("severity"),
        certainty=p.get("certainty"),
        responseType=p.get("response"),
        senderName=p.get("senderName"),
        headline=p.get("headline"),
        instruction=p.get("instruction"),
        onset=p.get("onset") or p.get("effective"),
        expires=p.get("expires"),
        mappedBy="source",
    )


def from_jma(*, statuses, office, headline, report_datetime):
    """jma-warn 구역 항목 → cap. 한 구역에 여러 종류가 있으면 하나라도 発表 면 Alert, 아니면 Update."""
    types = {JMA_STATUS_MSGTYPE.get(s) for s in statuses or ()}
    msg = "Alert" if "Alert" in types else ("Update" if "Update" in types else None)
    return _cap(
        status="Actual",
        msgType=msg,
        urgency="Unknown",
        severity="Unknown",       # 코드에 경보/주의보 이름을 붙이지 않는다(jma-warn 규칙)
        certainty="Unknown",
        responseType=None,
        senderName=office,
        headline=headline,        # 관서가 쓴 원문(일본어) 그대로 — 번역하지 않는다
        instruction=None,
        onset=report_datetime,
        expires=None,
        mappedBy="earthus-map",
    )

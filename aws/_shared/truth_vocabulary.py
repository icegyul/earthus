# -*- coding: utf-8 -*-
"""정본 진실 어휘 — 값집합을 **SQL 도메인에서 읽는다.**

⚠️ 값을 이 파일에 베껴 적지 않는다. `aws/_shared/sql/20260913_earth_event_core.sql` 의
   `create domain … check (value in (…))` 네 개가 정본이고, 여기서는 그것을 파싱한다.
   베껴 적으면 한 곳만 고쳐지는 사고가 난다 — SQL 머리말이 같은 이유로 표마다 CHECK 를
   베껴 쓰지 말라고 적어 두었다.

승격 규칙(§TRUTH_STATUS)은 `docs/TRUTH_VOCABULARY_CANONICAL.md` §2.1 의 표 그대로다.
새 규칙을 만들지 않는다. 이 파일이 하는 일은 그 표를 코드로 옮기는 것뿐이다.

관련 결정: `docs/3G_TRUTH_RULES.md` (B3) · `docs/3G_POLICY_DECISIONS.md`
"""
import os
import re

SCHEMA = "earthus.truth-vocabulary/1"

_HERE = os.path.dirname(os.path.abspath(__file__))
SQL_PATH = os.path.join(_HERE, "sql", "20260913_earth_event_core.sql")

# SQL 도메인 이름 → 이 모듈이 노출하는 이름
_DOMAINS = {
    "earthus_truth_status": "TRUTH_STATUS",
    "earthus_source_kind": "SOURCE_KIND",
    "earthus_data_state": "DATA_STATE",
    "earthus_release_state": "RELEASE_STATE",
}


class VocabularyError(RuntimeError):
    """정본을 읽을 수 없거나 어휘에 없는 값을 썼다."""


def _read_domains(path=None):
    """SQL 에서 도메인 네 개의 값집합을 읽는다. 하나라도 없으면 던진다."""
    path = path or SQL_PATH
    try:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    except OSError as exc:
        raise VocabularyError("정본 SQL 을 읽지 못했다: %s" % (exc,)) from exc
    found = {}
    for domain, name in _DOMAINS.items():
        # create domain <name> as text check (value in ('A','B',…));
        match = re.search(
            r"create\s+domain\s+%s\s+as\s+text\s*check\s*\(\s*value\s+in\s*\(([^)]*)\)\s*\)"
            % re.escape(domain), text, re.IGNORECASE | re.DOTALL)
        if not match:
            raise VocabularyError("SQL 에 도메인이 없다: %s" % domain)
        values = tuple(v.strip().strip("'") for v in match.group(1).split(",") if v.strip())
        if not values:
            raise VocabularyError("도메인 값집합이 비었다: %s" % domain)
        found[name] = values
    return found


_LOADED = _read_domains()

TRUTH_STATUS = _LOADED["TRUTH_STATUS"]
SOURCE_KIND = _LOADED["SOURCE_KIND"]
DATA_STATE = _LOADED["DATA_STATE"]
RELEASE_STATE = _LOADED["RELEASE_STATE"]

# ── 승격 규칙의 상수 (docs/TRUTH_VOCABULARY_CANONICAL.md §2.1) ────────────────
# FACT 는 기관이 잰 것이다. 매체 보도는 여기 들어가지 않는다.
FACT_SOURCE_KINDS = ("OFFICIAL", "OBSERVATION", "SATELLITE")
# CORROBORATED 문턱. 정본 :125 "독립 출처 2개 이상" — 우리가 정한 값이 아니다.
CORROBORATION_MIN = 2
# 시간 축. TIME_MODE 는 v02/v11 어휘를 그대로 쓴다(정본 §3).
FORECAST_TIME_MODES = ("FORECAST",)
SCENARIO_TIME_MODES = ("SCENARIO",)

DEFAULT_TRUTH_STATUS = "UNKNOWN"


def require(value, vocabulary, label):
    """어휘에 있는 값인지. 아니면 던진다. 조용히 기본값으로 바꾸지 않는다."""
    if value not in vocabulary:
        raise VocabularyError("%s 어휘에 없다: %r (허용: %s)"
                              % (label, value, ", ".join(vocabulary)))
    return value


def truth_status(*, source_kind, data_state=None, independence_count=0,
                 time_mode=None, produced_by=None, observation_within_sla=None,
                 has_source=False, is_simulation_output=False):
    """`docs/TRUTH_VOCABULARY_CANONICAL.md` §2.1 표를 그대로 판정한다.

    돌려주는 것: (status, reasons)  — reasons 는 왜 그 값인지 사람이 읽는 목록.

    ⚠️ 기본값은 UNKNOWN 이다. 승격은 근거가 있을 때만 일어난다(정본 §2.1 규칙 1).
    ⚠️ FORECAST·SIMULATION 은 FACT 로 승격될 수 없다(규칙 2, 단방향).
    ⚠️ CORROBORATED 는 FACT 와 **다른 축**이다(규칙 3). 둘 다면 둘 다 돌려준다 —
       하나로 눌러 담지 않는다. 그래서 이 함수는 status 하나가 아니라
       `corroborated` 를 따로 알려 준다.
    ⚠️ 퍼센트를 만들지 않는다(규칙 4).
    """
    reasons = []
    if source_kind is not None:
        require(source_kind, SOURCE_KIND, "SOURCE_KIND")
    if data_state is not None:
        require(data_state, DATA_STATE, "DATA_STATE")

    # 단방향 축을 먼저 본다 — 이들은 FACT 로 올라갈 수 없다.
    if is_simulation_output or (time_mode in SCENARIO_TIME_MODES):
        reasons.append("시뮬레이션 산출물 또는 TIME_MODE=SCENARIO")
        return "SIMULATION", reasons
    if time_mode in FORECAST_TIME_MODES:
        reasons.append("TIME_MODE=FORECAST")
        return "FORECAST", reasons

    if source_kind in FACT_SOURCE_KINDS:
        if data_state == "UNAVAILABLE":
            reasons.append("기관 출처이나 DATA_STATE=UNAVAILABLE — FACT 아님")
        elif observation_within_sla is False:
            reasons.append("기관 출처이나 관측시각이 SLA 밖 — FACT 아님")
        elif observation_within_sla is None:
            # SLA 값이 정본에 없다. 모르면 올리지 않는다.
            reasons.append("기관 출처이나 SLA 판정 불가 — FACT 로 올리지 않는다")
        else:
            reasons.append("SOURCE_KIND=%s · DATA_STATE 정상 · SLA 안" % source_kind)
            return "FACT", reasons

    if source_kind == "MODEL" and produced_by == "EARTHUS":
        reasons.append("SOURCE_KIND=MODEL · 산출자 EARTHUS")
        return "INFERRED", reasons

    if source_kind == "NEWS":
        reasons.append("SOURCE_KIND=NEWS 단독")
        return "REPORTED", reasons

    if has_source:
        reasons.append("출처는 있으나 위 어디에도 들어가지 않는다")
        return "CLAIM", reasons

    reasons.append("판정 근거가 없다")
    return DEFAULT_TRUTH_STATUS, reasons


def corroborated(independence_count):
    """독립 출처가 문턱 이상인가. `CORROBORATED` 는 별도 축이다.

    ⚠️ 기사 수를 넣지 않는다. `independence_count` 는 독립 원천 단위 수다 —
       `aws/_shared/article_dedup.py` 의 계보 회계가 정한다(결정 ①).
    """
    try:
        count = int(independence_count)
    except (TypeError, ValueError):
        return False, "독립 출처 수를 알 수 없다"
    if count >= CORROBORATION_MIN:
        return True, "독립 출처 %d개 ≥ %d" % (count, CORROBORATION_MIN)
    return False, "독립 출처 %d개 < %d" % (count, CORROBORATION_MIN)


def judge(*, source_kind, independence_count=0, **kwargs):
    """한 번에 두 축을 돌려준다: {truthStatus, corroborated, reasons}.

    사건 조립기가 부르는 자리다. 두 축을 하나로 눌러 담지 않는 것이 정본 규칙 3 이다.
    """
    status, reasons = truth_status(source_kind=source_kind,
                                   independence_count=independence_count, **kwargs)
    is_corr, why = corroborated(independence_count)
    out = {
        "schema": SCHEMA,
        "truthStatus": status,
        "corroborated": bool(is_corr),
        "independenceCount": int(independence_count or 0),
        "reasons": list(reasons) + [why],
    }
    # 단방향 축에는 교차검증을 붙이지 않는다 — 미래·가정에는 "여럿이 봤다"가 성립하지 않는다.
    if status in ("FORECAST", "SIMULATION"):
        out["corroborated"] = False
        out["reasons"].append("단방향 축이므로 교차검증을 붙이지 않는다")
    return out

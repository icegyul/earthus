# -*- coding: utf-8 -*-
"""EARTHUS 리포트 기간 — 정본 하나 (PHASE 6 §32).

기간 계산을 파일마다 따로 만들면 월간 보고서와 전망이 서로 다른 9월을 말하게 된다.
분기 경계·연말 넘김·다음 기간 계산을 여기 한 곳에서만 한다.

규칙
  MONTH    달력 월
  QUARTER  Q1=1~3 · Q2=4~6 · Q3=7~9 · Q4=10~12
  YEAR     1/1 ~ 12/31
  기간은 [start, end] 로 **양끝 포함**이다. end 는 그 기간의 마지막 날이다.
"""
from calendar import monthrange
from datetime import date

MONTH = "MONTH"
QUARTER = "QUARTER"
YEAR = "YEAR"
KINDS = (MONTH, QUARTER, YEAR)


class PeriodError(ValueError):
    """기간 문자열이 규약과 다르다."""


def _month_end(y, m):
    return date(y, m, monthrange(y, m)[1])


def parse(period):
    """'2026-09' · '2026-Q3' · '2026' → (kind, start, end).

    형식이 아니면 던진다. 조용히 오늘로 대체하지 않는다 — 그러면 어느 달의
    보고서인지가 실행 시각에 따라 달라진다.
    """
    if not isinstance(period, str):
        raise PeriodError("기간은 문자열이어야 한다")
    p = period.strip().upper()
    if len(p) == 4 and p.isdigit():
        y = int(p)
        return YEAR, date(y, 1, 1), date(y, 12, 31)
    if len(p) == 7 and p[4] == "-" and p[5] == "Q":
        y = int(p[:4])
        q = int(p[6])
        if not 1 <= q <= 4:
            raise PeriodError(f"분기는 Q1~Q4 다: {period}")
        m0 = (q - 1) * 3 + 1
        return QUARTER, date(y, m0, 1), _month_end(y, m0 + 2)
    if len(p) == 7 and p[4] == "-" and p[5:].isdigit():
        y, m = int(p[:4]), int(p[5:])
        if not 1 <= m <= 12:
            raise PeriodError(f"달은 01~12 다: {period}")
        return MONTH, date(y, m, 1), _month_end(y, m)
    raise PeriodError(f"알 수 없는 기간 형식: {period} (2026-09 · 2026-Q3 · 2026)")


def label(period):
    """정규화한 표기. parse 를 통과한 것만 돌려준다."""
    kind, start, _ = parse(period)
    if kind == YEAR:
        return f"{start.year}"
    if kind == QUARTER:
        return f"{start.year}-Q{(start.month - 1) // 3 + 1}"
    return f"{start.year}-{start.month:02d}"


def next_period(period):
    """다음 기간. 전망의 대상 기간을 여기서만 만든다 — 연말 넘김을 두 번 구현하지 않는다."""
    kind, start, _ = parse(period)
    if kind == MONTH:
        y, m = (start.year + 1, 1) if start.month == 12 else (start.year, start.month + 1)
        return label(f"{y}-{m:02d}")
    if kind == QUARTER:
        q = (start.month - 1) // 3 + 1
        y, q = (start.year + 1, 1) if q == 4 else (start.year, q + 1)
        return f"{y}-Q{q}"
    return f"{start.year + 1}"


def previous_period(period):
    """이전 기간. '지난달 전망은 얼마나 맞았나' 가 이걸 쓴다."""
    kind, start, _ = parse(period)
    if kind == MONTH:
        y, m = (start.year - 1, 12) if start.month == 1 else (start.year, start.month - 1)
        return label(f"{y}-{m:02d}")
    if kind == QUARTER:
        q = (start.month - 1) // 3 + 1
        y, q = (start.year - 1, 4) if q == 1 else (start.year, q - 1)
        return f"{y}-Q{q}"
    return f"{start.year - 1}"


def contains(period, day):
    """day('YYYY-MM-DD' 또는 date)가 이 기간 안인가. 검증 표본을 고를 때 쓴다."""
    _, start, end = parse(period)
    if isinstance(day, str):
        try:
            y, m, d = (int(x) for x in day[:10].split("-"))
            day = date(y, m, d)
        except Exception:
            return False
    return start <= day <= end


def days(period):
    """기간에 속한 날짜 문자열 목록. 일별 채점 자료를 기간으로 자를 때 쓴다."""
    _, start, end = parse(period)
    out, cur = [], start
    while cur <= end:
        out.append(cur.isoformat())
        cur = date.fromordinal(cur.toordinal() + 1)
    return out


REPORT_TYPE_FOR = {
    MONTH: "RETROSPECTIVE_MONTHLY",
    QUARTER: "RETROSPECTIVE_QUARTERLY",
    YEAR: "RETROSPECTIVE_ANNUAL",
}
OUTLOOK_TYPE_FOR = {
    MONTH: "OUTLOOK_NEXT_MONTH",
    QUARTER: "OUTLOOK_NEXT_QUARTER",
    YEAR: "OUTLOOK_NEXT_YEAR",
}

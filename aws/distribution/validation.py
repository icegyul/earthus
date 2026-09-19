# -*- coding: utf-8 -*-
"""사실 검증 게이트 — 지시서 §73 · §74 · §75 · §99 · §165.

이 파일이 지시서 전체에서 가장 중요한 곳이다.
**문장 안의 모든 숫자가 기계가 읽을 수 있는 출처에 실제로 있어야 한다.**
없으면 통과시키지 않는다. 경고가 아니라 거부다.

어떻게 확인하나
  콘텐츠를 만들 때 `numericPool` 을 함께 만든다 — 그 콘텐츠가 쓸 수 있는 숫자의 전부다.
  풀은 세 곳에서만 온다:
    ① 팩트의 값과 지표 이름   ② 기간 경계
    ③ 어댑터가 "원문 그대로"라고 명시한 문자열(sourceTexts) — 기관이 준 제목·헤드라인
  문장이 풀에 없는 숫자를 말하면 거부한다. **생성된 글에서는 풀을 만들지 않는다** —
  그러면 지어낸 숫자가 스스로를 인가한다.

허용 오차를 왜 두나
  "1.35" 를 "약 1.4" 로 적는 것은 반올림이지 날조가 아니다. 그래서 유효숫자 기준
  반올림 일치를 허용한다. 다만 **자릿수가 바뀌면 허용하지 않는다** — 1.4 와 14 는 다른 사실이다.

무엇을 허용하지 않나
  · 풀에 없는 숫자
  · 출처 메타데이터에 없는 날짜
  · 승인된 분석 없이 쓴 인과
  · 우리가 예보를 생산하지 않는 영역에서의 예측
  · 미해결 자리표시자(TODO, TBD, {{ }}, XXX)
  · 고아 참조(가리키는 팩트가 없는 claim)
"""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import content_contract as cc     # noqa: E402
import provenance as prov         # noqa: E402

VALIDATOR_VERSION = "earthus.validator/1.0.0"

# §99 — 남아 있으면 안 되는 자리표시자.
PLACEHOLDERS = ("TODO", "TBD", "FIXME", "XXX", "{{", "}}", "<<", "PLACEHOLDER", "LOREM")

# 숫자로 세지 않는 것. 연도·순번은 날짜 검사가 따로 본다.
_ORDINAL_KO = re.compile(r"제?\s*\d+\s*(회|차|번|호)")
# 조항 참조(§102 · No. 3)는 자료 숫자가 아니다. 문서를 가리키는 말이다.
_SECTION_REF = re.compile(r"[§#]\s*\d+(\.\d+)*")


class Severity:
    ERROR = "ERROR"        # 발행을 막는다
    WARNING = "WARNING"    # 막지 않지만 화면에 보인다
    INFO = "INFORMATION"   # 기록만 한다


def _issue(sev, code, message, where=None):
    return {"severity": sev, "code": code, "message": message, "where": where}


def _numeric(x):
    """참값은 숫자가 아니다.

    ⚠️ 파이썬에서 bool 은 int 의 하위형이라 isinstance(True, int) 가 참이다.
       그래서 comparison 에 들어 있는 True/False 가 풀에 1.0/0.0 으로 섞여 들어갔다
       — 그러면 캡션이 아무 근거 없이 "0" 이나 "1" 을 말해도 검증을 통과한다.
       value 쪽은 이미 bool 을 걸러내고 있었다(아래 isinstance(v, bool) 분기).
       같은 규칙을 나머지 자리에도 적용한다. (INTEGRATION-1 종단 시험이 잡아냈다:
       기후 팩트의 higherIsWarmer=False 가 0.0 으로 새어 들어왔다.)
    """
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def numeric_pool(facts, *, period=None, extra=None, source_texts=None):
    """§74 — 이 콘텐츠가 말해도 되는 숫자의 전부.

    팩트 값, 지표 이름, 표본 수, 기간 경계, 그리고 **원문에서 글자 그대로 옮겨 온
    문자열**(source_texts)에 있는 숫자만 들어간다.

    ⚠️ source_texts 는 원자료 문서의 필드여야 한다 — 생성된 제목이 아니다.
       생성물에서 풀을 만들면 지어낸 숫자가 스스로를 인가한다. 그래서 어댑터가
       "이건 원문 그대로다"라고 명시한 문자열만 받는다.
    """
    pool = set()

    def add(v):
        try:
            pool.add(float(v))
        except (TypeError, ValueError):
            return

    for f in facts or []:
        # ⚠️ 지표 이름(label)도 출처 문서의 글자다. 실제로 "여진 M3+ / M4+" 같은 label 이
        #    숫자를 들고 온다 — 여기서 빼면 원문을 그대로 옮긴 문장이 날조로 잡힌다.
        for n in cc.numbers_in(f.get("metric") or ""):
            add(n)
        v = f.get("value")
        if isinstance(v, bool):
            pass
        elif isinstance(v, (int, float)):
            add(v)
        elif isinstance(v, str):
            # 문자열 팩트값 안의 숫자도 출처에 실재하는 숫자다 ("M6.3", "근지점 196.0 km").
            for n in cc.numbers_in(v):
                add(n)
        elif isinstance(v, dict):
            for x in v.values():
                if _numeric(x):
                    add(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                if _numeric(x):
                    add(x)
        add(f.get("sampleCount"))
        comp = f.get("comparison")
        if isinstance(comp, dict):
            for x in comp.values():
                if _numeric(x):
                    add(x)
    if period:
        for key in ("from", "to"):
            s = (period or {}).get(key)
            if isinstance(s, str) and len(s) >= 10:
                add(int(s[0:4]))
                add(int(s[5:7]))
                add(int(s[8:10]))
    for t in source_texts or ():
        for n in cc.numbers_in(t or ""):
            add(n)
    for x in extra or ():
        add(x)
    return pool


def date_pool(facts, *, period=None, extra=None, source_texts=None):
    """§74 — 이 콘텐츠가 말해도 되는 날짜의 전부.

    숫자 풀과 같은 원리다. 팩트 값·지표 이름 안에 **글자 그대로** 있는 날짜만 들어간다.
    기관이 준 발생 시각을 옮겨 적는 것은 날조가 아니다. 없는 날짜를 만드는 것이 날조다.
    """
    out = set()

    def add_text(t):
        for d in cc.dates_in(t or ""):
            out.add(d)
            out.add(d[:7])

    for f in facts or []:
        add_text(str(f.get("metric") or ""))
        v = f.get("value")
        if isinstance(v, str):
            add_text(v)
        elif isinstance(v, dict):
            for x in v.values():
                if isinstance(x, str):
                    add_text(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                if isinstance(x, str):
                    add_text(x)
        add_text(str(f.get("period") or ""))
    for key in ("from", "to"):
        s = (period or {}).get(key)
        if isinstance(s, str):
            add_text(s)
    for t in source_texts or ():
        add_text(str(t))
    for s in extra or ():
        add_text(str(s))
    return out


def _matches_pool(n, pool):
    """풀 안에 n 과 같다고 볼 수 있는 값이 있나.

    반올림 허용: 소수 첫째 자리까지, 그리고 정수 반올림.
    **자릿수(10배)가 다르면 절대 같다고 하지 않는다.**
    """
    for p in pool:
        if p == n:
            return True
        if abs(p) >= 1e-9 and abs(n) >= 1e-9:
            if abs(p - n) < 1e-9:
                return True
            # 같은 자릿수 안에서의 반올림만 허용
            if abs(p) / 10.0 < abs(n) < abs(p) * 10.0:
                if round(p, 1) == round(n, 1) or round(p) == round(n):
                    return True
                # 백분율 표기(0.42 → 42)는 허용하지 않는다. 명시적으로 팩트에 넣어야 한다.
        elif abs(p) < 1e-9 and abs(n) < 1e-9:
            return True
    return False


def check_numbers(text, pool, *, where=None):
    """§74 — 문장 안 숫자가 전부 풀에 있는가."""
    out = []
    cleaned = _SECTION_REF.sub(" ", str(text))
    cleaned = _ORDINAL_KO.sub(" ", cleaned)
    # 시각 안의 숫자는 날짜 검사가 본다 — 여기서는 뺀다.
    # ⚠️ 순서가 중요하다. 시:분:초를 먼저 지우지 않으면 '11:17:00Z' 의 초가 0 으로 남아
    #    출처에 없는 숫자로 잡힌다.
    cleaned = re.sub(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?",
                     " ", cleaned)
    cleaned = re.sub(r"\d{1,2}:\d{2}(:\d{2})?", " ", cleaned)
    cleaned = re.sub(r"\d{4}-\d{2}(-\d{2})?", " ", cleaned)
    for n in cc.numbers_in(cleaned):
        if not _matches_pool(n, pool):
            out.append(_issue(Severity.ERROR, "NUMBER_NOT_IN_SOURCE",
                              f"출처에 없는 숫자: {n:g}", where))
    return out


def check_dates(text, allowed, *, where=None):
    """§74 — 문장 안 날짜가 출처 메타데이터에 있는가.

    allowed 는 ISO 날짜/연-월 문자열 집합이다. 연-월만 있으면 그 달의 날짜는 허용한다
    (월간 리포트가 그 달의 날을 말하는 것은 정상이다).
    """
    out = []
    months = {a[:7] for a in allowed}
    for d in cc.dates_in(text):
        if d in allowed:
            continue
        if len(d) == 10 and d[:7] in months:
            continue
        if len(d) == 7 and d in months:
            continue
        out.append(_issue(Severity.ERROR, "DATE_NOT_IN_SOURCE",
                          f"출처에 없는 날짜: {d}", where))
    return out


def check_language(text, *, lang="ko", causal_allowed=False, predictive_allowed=False, where=None):
    """§23 · §74 — 근거 없이 쓸 수 없는 말."""
    out = []
    sens = cc.SENSATIONAL_KO if lang == "ko" else cc.SENSATIONAL_EN
    for w in sens:
        if w in text:
            out.append(_issue(Severity.ERROR, "SENSATIONAL_LANGUAGE",
                              f"근거 없이 쓸 수 없는 표현: {w}", where))
    if not causal_allowed:
        causal = cc.CAUSAL_KO if lang == "ko" else cc.CAUSAL_EN
        for w in causal:
            if w in text:
                out.append(_issue(Severity.ERROR, "UNSUPPORTED_CAUSALITY",
                                  f"승인된 분석 없이 인과를 말한다: {w.strip()}", where))
    if not predictive_allowed:
        pred = cc.PREDICTIVE_KO if lang == "ko" else cc.PREDICTIVE_EN
        for w in pred:
            if w in text:
                out.append(_issue(Severity.ERROR, "UNSUPPORTED_PREDICTION",
                                  f"우리가 생산하지 않는 예보를 말한다: {w.strip()}", where))
        if lang == "ko":
            # 어간마다 달라지는 '-ㄹ 것' 구성은 문법으로 잡는다(목록으로는 못 잡는다).
            hit = cc.predictive_ko(text)
            if hit:
                out.append(_issue(Severity.ERROR, "UNSUPPORTED_PREDICTION",
                                  f"우리가 생산하지 않는 예보를 말한다: {hit.strip()}", where))
    for p in PLACEHOLDERS:
        if p in text:
            out.append(_issue(Severity.ERROR, "UNRESOLVED_PLACEHOLDER",
                              f"자리표시자가 남아 있다: {p}", where))
    return out


def validate_content(content, *, facts=None, allowed_dates=None,
                     causal_claim_ids=(), predictive_claim_ids=()):
    """§73 — 발행 전 열 가지 확인. 하나라도 ERROR 면 발행하지 않는다.

    facts 를 주면 숫자 풀을 그것으로 만든다. 안 주면 콘텐츠가 들고 있는
    `numericPool` 을 쓴다. 둘 다 없으면 **숫자를 쓴 문장은 전부 거부한다** —
    확인할 방법이 없는데 통과시키면 검증이 장식이 된다.
    """
    issues = []
    src_texts = content.get("sourceTexts") or ()
    pool = set(content.get("numericPool") or ())
    if facts:
        pool |= numeric_pool(facts, period=content.get("observationPeriod"),
                             source_texts=src_texts)
    elif src_texts:
        pool |= numeric_pool([], source_texts=src_texts)
    dates = set(allowed_dates or ()) | set(content.get("datePool") or ())
    dates |= date_pool(facts or [], period=content.get("observationPeriod"),
                       source_texts=src_texts)
    for key in ("from", "to"):
        v = (content.get("observationPeriod") or {}).get(key)
        if v:
            dates.add(v[:10])
            dates.add(v[:7])
    if content.get("eventTime"):
        dates.add(str(content["eventTime"])[:10])
        dates.add(str(content["eventTime"])[:7])
    if content.get("generatedAt"):
        dates.add(str(content["generatedAt"])[:10])
        dates.add(str(content["generatedAt"])[:7])

    fact_ids = {f.get("factId") for f in (facts or [])}

    # 1 · 2 · 3 — 사건/현상/리포트를 가리키는가 (make_content 가 이미 막지만 다시 본다)
    if not (content.get("phenomenonIds") or content.get("eventIds") or content.get("reportIds")):
        issues.append(_issue(Severity.ERROR, "ORPHAN_CONTENT", "현상·사건·리포트를 가리키지 않는다"))

    # 4 · 5 — 시각과 장소
    if content.get("eventTime") and not cc.dates_in(str(content["eventTime"])):
        issues.append(_issue(Severity.ERROR, "INVALID_DATE",
                             f"시각 형식이 아니다: {content['eventTime']}"))
    geo = content.get("geometry")
    if geo and geo.get("type") == "point":
        lat, lon = geo.get("lat"), geo.get("lon")
        if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            issues.append(_issue(Severity.ERROR, "INVALID_LOCATION", f"좌표가 올바르지 않다: {geo}"))

    # 6 — 신뢰도
    if content.get("confidence") not in cc.CONFIDENCE:
        issues.append(_issue(Severity.ERROR, "INVALID_CONFIDENCE", "알 수 없는 신뢰도"))
    elif content.get("confidence") != "UNKNOWN" and not content.get("confidenceReason"):
        issues.append(_issue(Severity.ERROR, "CONFIDENCE_WITHOUT_REASON",
                             "신뢰도에 이유가 없다"))

    # 7 · 8 — 문장별 검사, 고아 참조
    for c in content.get("claims") or []:
        where = c.get("claimId")
        lang = c.get("lang", content.get("language", "ko"))
        if c.get("factId") and fact_ids and c["factId"] not in fact_ids:
            issues.append(_issue(Severity.ERROR, "ORPHAN_REFERENCE",
                                 f"가리키는 팩트가 없다: {c['factId']}", where))
        if c.get("type") == "OBSERVED" and not c.get("sourceRefs"):
            issues.append(_issue(Severity.ERROR, "NO_SOURCE", "관측 문장에 출처가 없다", where))
        issues += check_numbers(c.get("text", ""), pool, where=where)
        issues += check_dates(c.get("text", ""), dates, where=where)
        issues += check_language(
            c.get("text", ""), lang=lang, where=where,
            causal_allowed=(where in causal_claim_ids),
            # 해석 문장이면서 예보 팩트를 가리키는 것만 예측 표현을 쓸 수 있다
            predictive_allowed=(where in predictive_claim_ids))

    # 제목·요약도 같은 잣대로 본다 — 제목이 검사에서 빠지면 제목에 숫자를 지어낼 수 있다.
    for field in ("title", "subtitle", "summary"):
        t = content.get(field)
        if not t:
            continue
        issues += check_numbers(t, pool, where=field)
        issues += check_dates(t, dates, where=field)
        issues += check_language(t, lang=content.get("language", "ko"), where=field)

    # 9 — 출처 사슬
    chain = prov.resolve_content(content)
    for b in chain["brokenLinks"]:
        issues.append(_issue(Severity.ERROR, "BROKEN_PROVENANCE", b))

    # 10 — 비주얼 사양
    for pv in (content.get("platformVersions") or {}).values():
        limit = cc.PLATFORM_LIMITS.get(pv.get("platform"))
        if limit and pv.get("textLength", 0) > limit:
            issues.append(_issue(Severity.ERROR, "PLATFORM_INVALID",
                                 f"{pv['platform']} 한도 초과", pv.get("platform")))
        fmts = cc.PLATFORM_FORMATS.get(pv.get("platform"), ())
        if pv.get("format") and pv["format"] not in fmts:
            issues.append(_issue(Severity.ERROR, "PLATFORM_INVALID",
                                 f"{pv['platform']} 는 {pv['format']} 를 받지 않는다", pv.get("platform")))

    errors = [i for i in issues if i["severity"] == Severity.ERROR]
    return {
        "validator": VALIDATOR_VERSION,
        "status": "FAILED" if errors else "PASSED",
        "problems": errors,
        "warnings": [i for i in issues if i["severity"] == Severity.WARNING],
        "info": [i for i in issues if i["severity"] == Severity.INFO],
        "numericPoolSize": len(pool),
        "provenance": chain,
    }


def validate_report(report):
    """§73 · §99 — 리포트도 같은 잣대로 본다.

    §99 의 예외: `empty=True` 이고 사유가 적힌 절은 빈 것이 정상이다.
    사유 없이 빈 절은 막는다 — 그것이 '조용히 빠진 것'이다.
    """
    issues = []
    facts = report.get("facts") or []
    pool = numeric_pool(facts, period=report.get("period"))
    dates = set()
    for key in ("from", "to"):
        v = (report.get("period") or {}).get(key)
        if v:
            dates.add(v[:10])
            dates.add(v[:7])
    if report.get("generatedAt"):
        dates.add(str(report["generatedAt"])[:10])

    if not report.get("dataSnapshotId"):
        issues.append(_issue(Severity.ERROR, "NO_SNAPSHOT", "자료 스냅샷이 없다"))
    if not report.get("algorithmVersion"):
        issues.append(_issue(Severity.ERROR, "NO_VERSION", "알고리즘 버전이 없다"))

    for f in facts:
        if f.get("value") is None:
            issues.append(_issue(Severity.ERROR, "FACT_WITHOUT_VALUE",
                                 f"값이 없는 팩트: {f.get('factId')}"))
        if not f.get("phenomenonId"):
            issues.append(_issue(Severity.ERROR, "FACT_WITHOUT_PHENOMENON",
                                 f"현상이 없는 팩트: {f.get('factId')}"))
        if not f.get("evidenceRefs"):
            issues.append(_issue(Severity.WARNING, "FACT_WITHOUT_EVIDENCE",
                                 f"증거 참조가 없는 팩트: {f.get('factId')}"))

    for s in report.get("sections") or []:
        sid = s.get("id")
        if not sid:
            issues.append(_issue(Severity.ERROR, "SECTION_WITHOUT_ID", "절에 id 가 없다"))
        # ⚠️ 절이 내용을 담는 칸은 여럿이다. 일부만 보면 채워진 절이 '빈 절'로 잡힌다 —
        #    실제로 주요 현상(cards)과 자료 품질(coverage) 절이 그렇게 잡혔다.
        FILLED = ("factRefs", "evaluationRefs", "body", "rows", "cards", "months",
                  "coverage", "period")
        empty = s.get("empty") or not any(s.get(k) for k in FILLED)
        if empty and not (s.get("reasonKo") or s.get("reasonEn") or s.get("notAvailable")):
            issues.append(_issue(Severity.ERROR, "EMPTY_SECTION_WITHOUT_REASON",
                                 f"빈 절에 사유가 없다: {sid}", sid))
        for text in (s.get("body"), s.get("titleKo"), s.get("summary")):
            if not text:
                continue
            issues += check_numbers(text, pool, where=sid)
            issues += check_dates(text, dates, where=sid)
            issues += check_language(text, lang="ko", where=sid)
        # 고아 참조
        known = {f.get("factId") for f in facts}
        for r in s.get("factRefs") or []:
            if r not in known:
                issues.append(_issue(Severity.ERROR, "ORPHAN_REFERENCE",
                                     f"없는 팩트를 가리킨다: {r}", sid))

    for e in report.get("evaluations") or []:
        if not e.get("predictionId"):
            issues.append(_issue(Severity.ERROR, "VERIFICATION_WITHOUT_PREDICTION",
                                 "예보 스냅샷 없이 만들어진 검증"))
        if e.get("status") == "VERIFIED" and not (e.get("scores") or {}):
            issues.append(_issue(Severity.ERROR, "VERIFIED_WITHOUT_SCORES",
                                 "검증됐다면서 점수가 없다"))

    chain = prov.resolve_report(report)
    for b in chain["brokenLinks"]:
        issues.append(_issue(Severity.ERROR, "BROKEN_PROVENANCE", b))

    errors = [i for i in issues if i["severity"] == Severity.ERROR]
    return {
        "validator": VALIDATOR_VERSION,
        "status": "FAILED" if errors else "PASSED",
        "problems": errors,
        "warnings": [i for i in issues if i["severity"] == Severity.WARNING],
        "info": [i for i in issues if i["severity"] == Severity.INFO],
        "numericPoolSize": len(pool),
        "provenance": chain,
    }

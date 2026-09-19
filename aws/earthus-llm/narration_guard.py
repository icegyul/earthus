# -*- coding: utf-8 -*-
"""서술 후처리 — 서술자(LLM) 답을 보낸 패킷·스냅샷과 글자로 대조한다 (계약 §C-2 · §J-4).

프롬프트 규칙은 모델이 어길 수 있는 약속이다. 여기는 서버가 실제로 내보내는 바이트를 정한다.
정규식·문자열 비교만 한다 — 문장을 해석하려 들지 않는다(§C-2 "그 이상으로 키우지 않는다").

일곱 검사 (§C-2 표 순서 = 사유 코드 순서)
  CAUSAL             FORBIDDEN_CAUSAL 9어휘. intel_contract 가 어휘 정본(intel-vocab.json)에서 읽은
                     것을 그대로 쓴다 — 이 파일에 목록을 베껴 적지 않는다(§C-3)
  PERCENT            % · 확률 어휘. 패킷의 quotedOfficial 문자열을 **한 글자도 안 바꾸고** 옮긴 자리만 통과
  CONFIDENCE_NUMBER  신뢰·confidence 낱말과 같은 문장, 앞뒤 20자 안의 숫자. 등급은 4단계 낱말뿐이다
  MISSING_SECTION    coverage.missing 절(서술자 뷰의 missingSections)을 이름으로 부른다.
                     없는 절은 이름 없이 고정 문장(FIXED_TEXT.sectionMissing)으로만 말한다(규칙 7)
  EVACUATION         대피·피난·피해액과 영문 대응어
  WARNING_LIFTED     유효한 특보(kind=OFFICIAL_WARNING, 종료가 아닌 status)가 뷰에 있는데 해제·종료·lifted·cancelled
  NUMBER             스냅샷·패킷에 없는 수치. 소수 자리 반올림만 허용한다(29.29 → 29.3 · 29).
                     단위 변환(35 m/s → 126 km/h)·자릿수 다름(29.29 → 293)은 새 수치다

하나라도 걸리면 답 **전체**를 FIXED_TEXT.insufficient 로 바꾸고 사유 코드를 남긴다.
문장을 골라 지우지 않는다(§C-2 "부분 삭제 금지") — 앞뒤를 잃은 문장이 더 위험하다.

정해 둔 것 (골든셋 tests/golden_narration.json 이 고정한다)
  · 대조 원본은 모델이 본 것 전부다: 스냅샷(패킷 뷰가 그 안에 있다) + 패킷 뷰.
    JSON 으로 적은 글자에서 숫자를 뽑으므로 키("24"·"48")·시각("2026-09-19T12:00Z" → 2026·9·19·12)·
    출처 이름("OISST v2.1" → 2.1)의 숫자도 원본이다.
  · 질문의 숫자는 원본이 아니다. 질문은 스냅샷이 아니다 — 사용자가 적은 숫자를 서술자가 사실처럼
    되받는 것도 막는다(§C-2 "스냅샷에 없는 수치").
  · 부호는 보지 않는다. 하이픈이 날짜·범위와 구별되지 않아서다(−3 과 3 을 같은 수로 본다).
  · % · 확률 어휘는 부정문이어도 걸린다("확률이 아닙니다"). 낱말을 쓰지 않는 것이 규칙이다.
  · 패킷 없는 대화(지구와 대화)에서는 화면 글자 — 켜진·켤 수 있는 레이어의 이름·값, 보는 곳의 값 —
    를 그대로 옮긴 자리도 % 검사에서 뺀다. 레이어 값은 '육지 평균 수관 12.3%' 처럼 이미 %를 달고
    온다(main.js askSnapshot 의 value = 레이어 note). 값 안의 'N%' 조각도 그대로 옮기면 통과한다
    ('약 12%' 는 걸린다).
    패킷이 있으면 계약 문언 그대로 quotedOfficial 만 통과시킨다.
  · 빠진 절 이름은 부정문이어도 걸린다. 규칙 7 이 이름 대신 고정 문장을 쓰라고 한다.
    영문 절 키가 흔한 낱말(next·current)이라 헛걸림이 있을 수 있다 — 막는 쪽으로 틀린다.
  · 특보가 뷰에 없으면 해제 어휘를 보지 않는다(§C-2 는 "유효한데" 만 막는다).

handler 는 모델을 부르기 전 문(門)에서 사유 코드 두 개를 더 쓴다 — PACKET_INVALID(계약 위반 패킷) ·
SECTION_NOT_AVAILABLE(물은 절의 재료가 없다). 둘 다 이 모듈의 REASONS 밖이다.

⚠️ 아래 낱말 표(확률·대피·해제·신뢰·절 이름)는 intel-vocab.json 에 아직 없다. 서버에서만 쓰므로
   여기 두었다. JS 가 같은 표를 쓰게 되면 어휘 정본으로 옮긴다(§C-3 "두 언어에 중복해 박지 않는다").
"""
import json
import os
import re
import sys
from decimal import Decimal, InvalidOperation

_HERE = os.path.dirname(os.path.abspath(__file__))
# Lambda 에서는 _shared 모듈이 zip 루트에 평평하게 들어가 그냥 잡힌다. 저장소에서는 ../_shared 를 본다.
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import intel_contract  # noqa: E402
import cap_map  # noqa: E402

# 사유 코드 — §C-2 표 순서. 여러 개 걸리면 이 순서로 적는다.
REASONS = ("CAUSAL", "PERCENT", "CONFIDENCE_NUMBER", "MISSING_SECTION",
           "EVACUATION", "WARNING_LIFTED", "NUMBER")

INSUFFICIENT = intel_contract.FIXED_TEXT["insufficient"]

# ── 낱말 표 ─────────────────────────────────────────────────────────────
PERCENT_WORDS = re.compile(
    r"[%％]|확률|퍼센트|가능성"
    r"|\bper\s?cent(?:age)?s?\b|\bprobabilit(?:y|ies)\b|\bchances?\b|\blikelihood\b", re.I)
# 화면 값 안의 'N%' 조각 — 앞이 숫자·점이면 다른 수의 꼬리다('81%' 안의 '1%' 가 아니다).
PERCENT_TOKEN = re.compile(r"(?<![\d.])\d+(?:\.\d+)?\s?[%％]")

CONFIDENCE_WORDS = re.compile(r"신뢰|확신|\bconfiden(?:ce|t)\b", re.I)
CONFIDENCE_WINDOW = 20      # 낱말 앞뒤 글자 수. 같은 문장 안에서만 본다

EVACUATION_WORDS = re.compile(
    r"대피|피난|피해액|피해\s?금액|손실액|손해액"
    r"|\bevacuat\w*|\bshelter[- ]in[- ]place\b|\btake\s+shelter\b"
    r"|\bdamage\s+(?:costs?|estimates?|amounts?|bills?)\b"
    r"|\b(?:economic|insured|financial|monetary)\s+loss(?:es)?\b", re.I)

LIFTED_WORDS = re.compile(r"해제|종료|\blifted\b|\bcancel(?:l)?ed\b", re.I)

# 특보가 끝났다는 status — CAP 정규화(cap_map)가 '취소'로 옮기는 원문 상태들. 여기에 새로 적지 않는다.
_CANCEL = "Cancel"
assert _CANCEL in cap_map.MSG_TYPE
TERMINATED_STATUS = frozenset(
    {_CANCEL}
    | {k for k, v in cap_map.KMA_COMMAND_MSGTYPE.items() if v == _CANCEL}
    | {k for k, v in cap_map.JMA_STATUS_MSGTYPE.items() if v == _CANCEL})

_WARNING_KIND = "OFFICIAL_WARNING"
assert _WARNING_KIND in intel_contract.EVIDENCE_KIND

# 패킷 절(PACKET_SECTIONS)을 부르는 말. 영문은 절 키(낱말 경계), 한국어는 그 절만 가리키는 말만 둔다.
# current 는 한국어 대응어('현재'·'지금')가 너무 흔해 영문 키만 본다.
SECTION_NAMES = {
    "current": (r"\bcurrent\b",),
    "change": (r"\bchanges?\b", "변화"),
    "anomaly": (r"\banomal(?:y|ies|ous)\b", "평년", "이상값", "이상치"),
    "pattern": (r"\bpatterns?\b", "패턴"),
    "conditions": (r"\bconditions?\b", "조건"),
    "related": (r"\brelated\b", "관련 현상", "연결된 현상"),
    "next": (r"\bnext\b", "예보", "전망"),
    "importance": (r"\bimportance\b", "중요도"),
    "confidence": (r"\bconfiden(?:ce|t)\b", "신뢰"),
    "uncertainty": (r"\buncertaint(?:y|ies)\b", "불확실"),
}
_SECTION_RE = {name: re.compile("|".join(words), re.I) for name, words in SECTION_NAMES.items()}

# 숫자 — 천 단위 쉼표(1,200)와 소수. 부호는 보지 않는다(머리말).
NUMBER = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")
# 문장 끝 — 숫자 사이의 점(29.3 · v2.1)은 끝이 아니다.
_SENTENCE_END = re.compile(r"[!?。\n]|\.(?!\d)|(?<!\d)\.")


def insufficient_text(lang="ko"):
    """교체 문장 — 어휘 정본의 고정 문장. 언어를 모르면 한국어."""
    return INSUFFICIENT["en" if lang == "en" else "ko"]


def _sentences(text):
    return [s for s in _SENTENCE_END.split(text) if s.strip()]


def _walk(node):
    """중첩 구조 안의 모든 dict 를 차례로."""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, (list, tuple)):
        for value in node:
            yield from _walk(value)


def quoted_official(*nodes):
    """quotedOfficial 문자열 전부(문자열 하나 또는 문자열 목록). 긴 것부터 — 겹칠 때 긴 인용을 먼저 지운다."""
    found = set()
    for node in nodes:
        for item in _walk(node):
            value = item.get("quotedOfficial")
            values = value if isinstance(value, list) else [value]
            found.update(v for v in values if isinstance(v, str) and v.strip())
    return sorted(found, key=lambda s: (-len(s), s))


def screen_quotes(snapshot):
    """패킷 없는 대화에서 그대로 옮겨도 되는 화면 글자 — 레이어 이름·값과 그 안의 'N%' 조각, 보는 곳의 값."""
    found = set()
    if not isinstance(snapshot, dict):
        return []
    rows = list(snapshot.get("레이어") or []) + list(snapshot.get("켤수있는레이어") or [])
    texts = [row.get(key) for row in rows if isinstance(row, dict) for key in ("이름", "값")]
    point = snapshot.get("보는곳의값")
    if isinstance(point, dict):
        texts.extend(point.values())
    for value in texts:
        if isinstance(value, str) and value.strip():
            found.add(value.strip())
            found.update(match.group(0) for match in PERCENT_TOKEN.finditer(value))
    return sorted(found, key=lambda s: (-len(s), s))


def _strip_quote(text, quote):
    """인용 자리를 지운다. 숫자로 시작·끝나는 인용은 다른 수의 일부를 지우지 않게 경계를 건다."""
    pattern = re.escape(quote)
    if quote[:1].isdigit():
        pattern = r"(?<![\d.])" + pattern
    if quote[-1:].isdigit():
        pattern += r"(?!\d)"
    return re.sub(pattern, " ", text)


def active_warnings(view):
    """뷰 안의 유효한 특보 메타 id. kind=OFFICIAL_WARNING 이고 status 가 비지 않았으며 종료 상태가 아닌 것.

    status 어휘는 원본마다 다르다(CAP msgType · 기상청 명령 상태 · JMA 状態). 모르는 값은 유효로 본다 —
    '끝났다'고 말해도 되는지 모르면 말하지 못하게 하는 쪽으로 닫는다.
    """
    out = []
    for item in _walk(view):
        status = item.get("status")
        if item.get("kind") != _WARNING_KIND or not isinstance(status, str) or not status.strip():
            continue
        status = status.strip()
        if status in TERMINATED_STATUS or LIFTED_WORDS.search(status):
            continue
        out.append(str(item.get("id") or "?"))
    return out


def number_corpus(*nodes):
    """모델이 본 것에 적힌 숫자 전부. JSON 글자에서 뽑는다 — 키·시각·이름 속 숫자까지."""
    corpus = set()
    for node in nodes:
        if node is None:
            continue
        text = node if isinstance(node, str) else json.dumps(node, ensure_ascii=False, default=str)
        for match in NUMBER.finditer(text):
            try:
                corpus.add(Decimal(match.group(0).replace(",", "")))
            except InvalidOperation:
                continue
    return corpus


def number_ok(token, corpus):
    """답의 숫자 하나가 원본 숫자의 그대로 또는 소수 자리 반올림인가.

    답이 소수 d 자리로 적었으면 원본과의 차가 0.5×10⁻ᵈ 이하여야 한다. 반올림 방식(올림·은행가)을
    가리지 않고 받되, 자릿수가 다르거나 단위를 바꾼 값은 차가 커서 걸린다.
    """
    text = token.replace(",", "")
    try:
        value = Decimal(text)
    except InvalidOperation:
        return False
    places = len(text.split(".", 1)[1]) if "." in text else 0
    tolerance = Decimal(5) / (Decimal(10) ** (places + 1))
    return any(abs(value - ref) <= tolerance for ref in corpus)


def check(answer, view=None, *, snapshot=None, lang="ko"):
    """답 하나를 일곱 검사에 대조한다.

    answer    모델이 낸 답 문장
    view      서술자에게 보낸 패킷 뷰(intel_contract.narrator_view 의 결과). 없으면 None
    snapshot  모델에게 보낸 스냅샷 전체(숫자 대조 원본). 없으면 None
    돌려주는 것: {passed, reasons(사유 코드, REASONS 순서), details(기록용), answer(내보낼 문장)}
    """
    text = answer if isinstance(answer, str) else ""
    hits = []

    for word in intel_contract.causal_hits(text):
        hits.append(("CAUSAL", word))

    quotes = set(quoted_official(view, snapshot))
    if view is None:
        quotes.update(screen_quotes(snapshot))          # 패킷 없는 대화에서만 (머리말)
    unquoted = text
    for quote in sorted(quotes, key=lambda s: (-len(s), s)):
        unquoted = _strip_quote(unquoted, quote)
    for match in PERCENT_WORDS.finditer(unquoted):
        hits.append(("PERCENT", match.group(0)))

    for sentence in _sentences(text):
        for match in CONFIDENCE_WORDS.finditer(sentence):
            lo = max(0, match.start() - CONFIDENCE_WINDOW)
            near = NUMBER.search(sentence[lo:match.end() + CONFIDENCE_WINDOW])
            if near:
                hits.append(("CONFIDENCE_NUMBER", "%s~%s" % (match.group(0), near.group(0))))

    missing = view.get("missingSections") if isinstance(view, dict) else None
    for section in missing or []:
        pattern = _SECTION_RE.get(section)
        found = pattern.search(text) if pattern else None
        if found:
            hits.append(("MISSING_SECTION", "%s:%s" % (section, found.group(0))))

    for match in EVACUATION_WORDS.finditer(text):
        hits.append(("EVACUATION", match.group(0)))

    live = active_warnings(view)
    if live:
        for match in LIFTED_WORDS.finditer(text):
            hits.append(("WARNING_LIFTED", "%s(%s)" % (match.group(0), ",".join(live))))

    corpus = number_corpus(snapshot, view)
    for match in NUMBER.finditer(text):
        if not number_ok(match.group(0), corpus):
            hits.append(("NUMBER", match.group(0)))

    reasons = [code for code in REASONS if any(code == hit[0] for hit in hits)]
    passed = not reasons
    return {
        "passed": passed,
        "reasons": reasons,
        "details": ["%s:%s" % hit for hit in hits],
        "answer": text if passed else insufficient_text(lang),
    }

# -*- coding: utf-8 -*-
"""캡션 엔진 — 지시서 §22 · §23 · §12 · §25 · §105.

문장을 **조립**한다. 만들지 않는다.

왜 LLM 을 여기 두지 않았나(§13)
  지시서는 AI 로 문구를 다듬는 것을 허용한다. 하지만 이 엔진의 입력은 이미
  `claim` 객체 — 문장 하나마다 출처가 붙은 것 — 이다. LLM 을 통과시키면
  claim 과 최종 문장이 어긋나고, 그때부터 "이 문장은 어디서 왔는가"에 답할 수 없다.
  다듬기가 필요하면 **claim 을 먼저 고치고** 다시 조립한다.
  기존 aws/social-draft/handler.py 가 이미 같은 결정을 했다 — 그 선례를 따른다.

플랫폼별로 다른 글을 쓰지 않는다(§14). 같은 블록을 **길이만 다르게** 자른다.
그래서 X 판과 인스타 판이 서로 다른 숫자를 말할 수 없다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import content_contract as cc   # noqa: E402

CAPTION_VERSION = "earthus.caption/1.0.0"

NL = chr(10)   # 줄바꿈. 이 파일이 만드는 글은 줄바꿈이 뜻을 갖는다(블록 구분).

# §22 블록 순서. 이름을 바꾸면 검증기(validation.py)의 블록 검사가 깨진다.
BLOCKS = ("HOOK", "WHAT", "WHERE", "WHEN", "WHY", "DATA", "CONFIDENCE", "SOURCE", "CTA")

# ⚠️⚠️ 어떤 플랫폼에서도 자르지 않는 블록.
# aws/social-draft/handler.py 의 fit() 이 같은 규칙을 쓴다 — 경고를 먼저 지우면 안 된다.
NEVER_TRIM = ("CONFIDENCE", "SOURCE")

LABELS = {
    "ko": {"HOOK": "", "WHAT": "무슨 일", "WHERE": "어디", "WHEN": "언제",
           "WHY": "왜 중요한가", "DATA": "숫자", "CONFIDENCE": "신뢰도",
           "SOURCE": "출처", "CTA": ""},
    "en": {"HOOK": "", "WHAT": "What", "WHERE": "Where", "WHEN": "When",
           "WHY": "Why it matters", "DATA": "Data", "CONFIDENCE": "Confidence",
           "SOURCE": "Source", "CTA": ""},
}

# §12 — 3분법을 문장 앞에 그대로 붙인다. 해석을 사실처럼 보이게 두지 않는다.
CLAIM_PREFIX = {
    "ko": {"OBSERVED": "관측:", "ANALYZED": "분석:", "INTERPRETED": "해석:"},
    "en": {"OBSERVED": "Observed:", "ANALYZED": "Analyzed:", "INTERPRETED": "Interpreted:"},
}

CONFIDENCE_TEXT = {
    "ko": {"HIGH": "높음", "MEDIUM": "보통", "LOW": "낮음", "UNKNOWN": "판단 근거 없음"},
    "en": {"HIGH": "High", "MEDIUM": "Medium", "LOW": "Low", "UNKNOWN": "Not determined"},
}

# §105 — CTA 는 마케팅 문구가 아니라 어디로 가는지다.
CTA = {
    "ko": {"phenomenon": "지구에서 이 현상 보기", "event": "지구에서 이 사건 보기",
           "report": "전체 리포트 읽기", "map": "지도에서 보기"},
    "en": {"phenomenon": "See this phenomenon on EARTHUS", "event": "See this event on EARTHUS",
           "report": "Read the full report", "map": "Open the map"},
}


class CaptionError(ValueError):
    pass


def _sensational(text, lang):
    words = cc.SENSATIONAL_KO if lang == "ko" else cc.SENSATIONAL_EN
    return [w for w in words if w in text]


def build_blocks(content, *, lang="ko", link=None):
    """§22 — 콘텐츠 하나에서 블록 사전을 만든다.

    없는 블록은 **넣지 않는다.** 빈 제목만 남기면 화면에 빈 칸이 생기고,
    빈 칸은 사람이 "자료가 있는데 안 보여 주나"로 읽는다.
    """
    if lang not in cc.LANGUAGES:
        raise CaptionError(f"지원하지 않는 언어: {lang}")
    claims = [c for c in (content.get("claims") or []) if c.get("lang", lang) == lang] \
        or list(content.get("claims") or [])

    by_type = {"OBSERVED": [], "ANALYZED": [], "INTERPRETED": []}
    for c in claims:
        by_type.setdefault(c.get("type"), []).append(c)

    out = {}

    # HOOK — 제목 그대로. 형용사를 새로 붙이지 않는다.
    out["HOOK"] = content.get("title") or ""

    # WHAT — 관측 문장이 먼저 온다. 해석이 앞에 오면 해석이 사실처럼 읽힌다.
    what = [c["text"] for c in by_type["OBSERVED"][:2]]
    if not what:
        what = [c["text"] for c in by_type["ANALYZED"][:1]]
    if what:
        out["WHAT"] = " ".join(what)

    if content.get("location"):
        out["WHERE"] = str(content["location"])

    # §101 · §102 — 시각을 섞지 않는다. 사건이 난 때와 우리가 지켜본 기간은 다르다.
    per = content.get("observationPeriod") or {}
    lines = []
    if content.get("eventTime"):
        lines.append(("발생 " if lang == "ko" else "Occurred ") + str(content["eventTime"]))
    if per.get("from") and per.get("to"):
        span = per["from"] if per["from"] == per["to"] else f"{per['from']} ~ {per['to']}"
        kind = content.get("observationPeriodKind")
        if kind == "TRACKING":
            label = "EARTHUS 추적 " if lang == "ko" else "EARTHUS tracked "
        else:
            label = "관측 " if lang == "ko" else "Observed "
        lines.append(label + span)
    if lines:
        out["WHEN"] = NL.join(lines)

    # WHY — 해석 문장. 없으면 이 블록 자체가 없다. 지어내지 않는다.
    why = [c["text"] for c in by_type["INTERPRETED"][:1]]
    if why:
        out["WHY"] = f"{CLAIM_PREFIX[lang]['INTERPRETED']} {why[0]}"

    # DATA — 분석 문장(숫자가 있는 것). 관측 문장 중 남은 것도 여기로.
    data = [c["text"] for c in by_type["ANALYZED"][:3]]
    if len(by_type["OBSERVED"]) > 2:
        data += [c["text"] for c in by_type["OBSERVED"][2:4]]
    if data:
        out["DATA"] = "\n".join(f"· {d}" for d in data)

    # CONFIDENCE — 언제나 있다. 이유까지 적는다(§11).
    conf = content.get("confidence") or "UNKNOWN"
    reasons = content.get("confidenceReason") or []
    ctext = CONFIDENCE_TEXT[lang].get(conf, conf)
    out["CONFIDENCE"] = ctext + (f" — {' · '.join(reasons[:2])}" if reasons else "")

    # SOURCE — 언제나 있다. 자료 참조를 그대로 적는다.
    srcs = []
    for c in claims:
        for r in c.get("sourceRefs") or []:
            if r not in srcs:
                srcs.append(r)
    for r in content.get("datasetRefs") or []:
        if r not in srcs:
            srcs.append(r)
    out["SOURCE"] = " · ".join(srcs[:4]) if srcs else ("출처 없음" if lang == "ko" else "No source")

    if link:
        kind = "report" if content.get("reportIds") else "event" if content.get("eventIds") else "phenomenon"
        out["CTA"] = f"{CTA[lang][kind]} {link}"

    return out


def render(blocks, *, lang="ko", limit=None, hashtags=None):
    """블록을 한 덩어리 글로 만든다. limit 을 넘으면 **자를 수 있는 것만** 자른다.

    자르는 순서: DATA → WHY → WHERE/WHEN → WHAT.
    CONFIDENCE 와 SOURCE 는 끝까지 남는다(NEVER_TRIM).
    """
    tags = ("\n\n" + " ".join(hashtags)) if hashtags else ""

    def compose(keys):
        parts = []
        for b in BLOCKS:
            if b not in keys or not blocks.get(b):
                continue
            label = LABELS[lang].get(b) or ""
            parts.append(f"[{label}]\n{blocks[b]}" if label else str(blocks[b]))
        return "\n\n".join(parts)

    keys = [b for b in BLOCKS if blocks.get(b)]
    text = compose(keys)
    if limit is None or len(text) + len(tags) <= limit:
        return text + tags

    # 자르기 — 뒤에서부터 뺀다. 뺄 수 없는 블록은 건너뛴다.
    for drop in ("DATA", "WHY", "WHERE", "WHEN", "WHAT"):
        if drop in NEVER_TRIM:
            continue
        if drop in keys:
            keys.remove(drop)
            text = compose(keys)
            if len(text) + len(tags) <= limit:
                return text + tags

    # 그래도 넘치면 HOOK 을 줄인다. 신뢰도·출처는 끝까지 남긴다.
    fixed = compose([b for b in keys if b in NEVER_TRIM])
    room = limit - len(tags) - len(fixed) - 4
    hook = (blocks.get("HOOK") or "")[:max(0, room)].rstrip()
    if room <= 0:
        # 한도가 신뢰도+출처보다 작다 — 자르면 뜻이 바뀐다. 잘라 내보내지 않는다.
        raise CaptionError(f"한도 {limit}자 안에 신뢰도와 출처를 담을 수 없다")
    return f"{hook}\n\n{fixed}{tags}"


def caption_for(content, *, platform, lang="ko", link=None, hashtags=None):
    """§14 — 플랫폼 판 하나의 본문. 마스터 블록에서 길이만 맞춘다."""
    limit = cc.PLATFORM_LIMITS.get(platform)
    if limit is None:
        raise CaptionError(f"알 수 없는 플랫폼: {platform}")
    blocks = build_blocks(content, lang=lang, link=link)
    text = render(blocks, lang=lang, limit=limit, hashtags=hashtags)
    bad = _sensational(text, lang)
    if bad:
        # §23 — 자극적 표현은 걸러 내지 않고 **거부한다.** 조용히 지우면 원인이 안 고쳐진다.
        raise CaptionError(f"근거 없이 쓸 수 없는 표현: {bad}")
    return text


def all_languages(content, *, platform, link=None, hashtags=None):
    """§25 — 한국어·영어 판을 같은 마스터에서 만든다. 숫자는 양쪽이 같다.

    단위를 번역하지 않는다 — m/s 는 어느 언어에서도 m/s 다.
    """
    out = {}
    for lang in cc.LANGUAGES:
        try:
            out[lang] = caption_for(content, platform=platform, lang=lang,
                                    link=link, hashtags=hashtags)
        except CaptionError as e:
            out[lang] = None
            out.setdefault("errors", {})[lang] = str(e)
    return out

"""AI 뉴스 브리핑 — 확정 이벤트를 사실 단위로 다시 쓰고 문장마다 출처를 붙인다.

무엇을 만드나
  중요도·관심도가 높은 **확정** 이벤트만 골라, Claude 가 웹 검색으로 직접 확인한
  사실을 짧은 항목으로 정리한다. 항목마다 그 사실의 근거가 된 기사 링크가 붙는다.
  결과를 S3 events/briefs.json 에 써두고 앱이 읽는다.

왜 배치인가 (브라우저가 직접 부르지 않는 이유)
  · API 키를 브라우저에 둘 수 없다. 정적 앱이라 소스가 그대로 보이고,
    키가 노출되면 남이 우리 요금으로 API 를 쓴다.
  · 그리고 이 계정은 Lambda Function URL 익명 호출이 403 이다 (조직 정책 추정).
    구름·바람·산불처럼 "미리 만들어 S3 에 두고 앱이 파일을 읽는" 구조면 그 제약을 안 받는다.
  · 부수 효과로 비용이 예측 가능해진다 — 사용자 수와 무관하게 회당 N건이다.

⚠️⚠️ 저작권 — 이게 이 파일에서 가장 중요하다 (인수인계 §5-3)
  §5-3 은 "기사 본문을 재생산하지 말 것"이다. 여기서 하는 일은 그 방침의 **변경**이다:
  기사 내용에서 사실을 추출해 **새 문장으로** 쓴다. 그래서 지켜야 할 선을 코드로 박는다.
    · 원문 문장을 그대로 옮기지 않는다 (프롬프트가 금지 + 응답을 후검사한다)
    · 항목마다 출처 URL 을 반드시 붙인다. 출처 없는 항목은 **버린다**
    · 검색으로 확인되지 않은 것은 쓰지 않는다 — 추측·전망·사상자 추정 금지
    · 기사 본문을 우리 쪽에 저장하지 않는다. 남는 건 우리가 쓴 문장과 링크뿐이다
  이래도 회색 지대가 남는다. 원문으로 가는 링크를 눈에 잘 띄게 두는 것이 최소한의 예의다.

⚠️ 사실이 아닌 것을 사실처럼 쓰지 않는다.
   확인 못 한 것은 unresolved 에 "아직 확인되지 않음"으로 남긴다. 비워두지 않는다.
   AI 가 썼다는 사실도 앱에 표시한다 — 숨기면 그게 속이는 것이다.

동작
  1) events/global.json 을 읽는다
  2) status == "confirmed" 이고 중요도가 높은 상위 N건을 고른다
  3) 이미 브리핑이 있는 이벤트는 건너뛴다 (같은 걸 매번 다시 만들면 돈만 쓴다)
  4) 건당 Claude 1회 호출 (웹 검색 + 구조화 출력, 한국어·영어 동시)
  5) events/briefs.json 에 병합해 쓴다

환경변수
  ANTHROPIC_API_KEY  (필수) — 없으면 아무것도 쓰지 않고 그대로 끝낸다
  CACHE_BUCKET       (필수)
  BRIEF_MAX          회당 최대 브리핑 수 (기본 4)
  BRIEF_TTL_HOURS    브리핑 보관 시간 (기본 36)
  BRIEF_MODEL        기본 claude-opus-5
  BRIEF_EFFORT       기본 high
"""

import json
import math
import os
import re
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
SRC_KEY = "events/global.json"
DST_KEY = "events/briefs.json"

MODEL = os.environ.get("BRIEF_MODEL", "claude-opus-5")
EFFORT = os.environ.get("BRIEF_EFFORT", "high")
MAX_BRIEFS = int(os.environ.get("BRIEF_MAX", "4"))
TTL_HOURS = int(os.environ.get("BRIEF_TTL_HOURS", "36"))

s3 = boto3.client("s3", region_name=REGION)


# ══════════════════════════════════════════════════════════════
# 무엇을 브리핑할지 고른다
# ══════════════════════════════════════════════════════════════

# ⚠️ 중요도를 우리가 새로 발명하지 않는다. gdelt-events 가 이미 계산한 값을 쓴다:
#      score      교차검증 점수 (100점 만점, 60 이상이 confirmed)
#      sources    보도 문서 수
#      merged     같은 사건으로 합쳐진 건수 = 여러 곳에서 독립 보도됐다는 신호
#      disaster   재난 여부
#    여기서 하는 일은 "그중 무엇을 먼저 정리할까"의 순서 매기기뿐이다.
def interest(e):
    """관심도. 값이 클수록 먼저 브리핑한다."""
    v = float(e.get("score") or 0)
    v += min(20, (e.get("merged") or 1) * 4)          # 독립 보도가 많을수록
    v += min(15, (e.get("sources") or 0) * 0.25)      # 보도 문서 수 (포화시킴)
    if e.get("disaster"):
        v += 10                                       # 재난은 지금 알아야 하는 정보다
    # ⚠️ 오래된 것은 내린다. "지금 무슨 일이 났나"가 이 화면의 질문이다.
    v -= min(25, (e.get("ageMin") or 0) / 60 * 3)
    return v


_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for",
         "from", "with", "as", "by", "is", "are", "was", "were", "after",
         "over", "into", "says", "say", "said", "amid", "near", "more", "than"}


def title_tokens(t):
    return {w for w in _WORD.findall((t or "").lower())
            if len(w) > 2 and w not in _STOP}


def same_story(a, b):
    """두 이벤트가 같은 사건인가.

    ⚠️ `(나라, CAMEO분류)` 로 걸렀더니 실측에서 두 가지가 새어 나왔다:
         · 스페인과 프랑스가 같은 보르도 산불 기사를 각각 물고 왔다 (나라가 다르니 통과)
         · 요르단강 서안 같은 사건이 코드 19/18 로 두 번 (분류가 다르니 통과)
       걸러야 하는 단위는 나라도 분류도 아니라 **사건**이다.
       그래서 제목 겹침과 지리적 거리를 본다.
    """
    ta, tb = title_tokens(a.get("title")), title_tokens(b.get("title"))
    if ta and tb:
        j = len(ta & tb) / max(1, len(ta | tb))
        if j >= 0.6:                       # 제목이 사실상 같다
            return True
    # 제목이 달라도 아주 가까우면 같은 사건일 가능성이 높다
    return km_between(a["lat"], a["lon"], b["lat"], b["lon"]) <= 150


def km_between(la1, lo1, la2, lo2):
    """대원 거리. gdelt-events 와 같은 계산을 쓴다."""
    p = math.pi / 180
    return 6371.0 * math.acos(max(-1.0, min(1.0,
        math.sin(la1 * p) * math.sin(la2 * p)
        + math.cos(la1 * p) * math.cos(la2 * p) * math.cos((lo2 - lo1) * p))))


def pick(events, existing_ids, limit):
    cand = [e for e in events
            if e.get("status") == "confirmed" and e.get("id") not in existing_ids]
    # 제목이 없으면 검색 단서가 약하다 — Claude 가 엉뚱한 기사를 찾을 위험이 커진다.
    cand = [e for e in cand if (e.get("title") or "").strip()]
    cand.sort(key=interest, reverse=True)

    # ⚠️ 한 나라가 네 자리를 다 차지하지 않게 한다. 서로 다른 곳 네 군데가
    #    "지금 지구에서 무슨 일이 나는지"를 보여준다.
    out, per_country = [], {}
    for e in cand:
        if any(same_story(e, p) for p in out):
            continue
        c = e.get("country") or "?"
        if per_country.get(c, 0) >= 2:
            continue
        per_country[c] = per_country.get(c, 0) + 1
        out.append(e)
        if len(out) >= limit:
            break
    return out


# ══════════════════════════════════════════════════════════════
# Claude 호출
# ══════════════════════════════════════════════════════════════

SYSTEM = """You write short factual briefs about breaking events for a live-Earth \
globe app. Readers tap a marker on the globe and want to know what is actually \
happening there right now.

Use the web_search tool to find current reporting before you write. Write only \
what your searches actually establish.

HARD RULES — these are not style preferences.

1. Never reproduce sentences from the articles you read. Every sentence you write \
must be your own wording, stating a fact. Do not quote. If a specific official \
statement matters, report its substance in your own words and attribute the speaker \
("the prefecture said evacuations were mandatory"), never as a quotation.

2. Every bullet must carry at least one source you actually retrieved via \
web_search, with its real URL. A bullet you cannot source must be omitted \
entirely. Do not invent, guess, or reconstruct URLs.

3. Report only what the sources establish. No speculation about causes, no \
projected casualty or damage figures, no forecasts of what will happen next \
unless an official body issued that forecast and you cite it.

4. Numbers, times, and places must match a source exactly. If two sources \
disagree, say so in the bullet and cite both. If a widely-asked question is not \
answered by any source, put it in `unresolved` — do not leave it out silently.

5. Write both Korean and English. The Korean is not a translation of the \
English — write each so it reads naturally to that reader. Korean uses \
plain declarative endings (…했다 / …이다), not honorifics.

STYLE
- headline: one line, what happened and where. No clickbait, no adjectives that \
aren't in the sources.
- summary: one or two sentences a reader can act on.
- bullets: 3 to 6. Each is one fact. Lead with the number or the place, not \
with framing. Keep each under about 40 words.
- context: 0 to 4 short label/value pairs a reader would want next \
(area affected, evacuation count, wind speed, alert level, roads closed). \
Only from sources.
- unresolved: what is still unknown. Empty list only if genuinely nothing is open.
- confidence: high only if several independent outlets agree on the core facts."""

SCHEMA = {
    "type": "object",
    "properties": {
        "headline_ko": {"type": "string"},
        "headline_en": {"type": "string"},
        "summary_ko": {"type": "string"},
        "summary_en": {"type": "string"},
        "bullets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ko": {"type": "string"},
                    "en": {"type": "string"},
                    "sources": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string"},
                                "title": {"type": "string"},
                            },
                            "required": ["url", "title"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["ko", "en", "sources"],
                "additionalProperties": False,
            },
        },
        "context": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label_ko": {"type": "string"},
                    "label_en": {"type": "string"},
                    "value_ko": {"type": "string"},
                    "value_en": {"type": "string"},
                },
                "required": ["label_ko", "label_en", "value_ko", "value_en"],
                "additionalProperties": False,
            },
        },
        "unresolved_ko": {"type": "array", "items": {"type": "string"}},
        "unresolved_en": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["headline_ko", "headline_en", "summary_ko", "summary_en",
                 "bullets", "context", "unresolved_ko", "unresolved_en",
                 "confidence"],
    "additionalProperties": False,
}


def ask(client, ev):
    """이벤트 하나를 브리핑한다. 실패하면 예외를 올린다 (부분 결과를 쓰지 않는다)."""
    place = ev.get("place") or "unknown location"
    title = (ev.get("title") or "").strip()
    kind = ev.get("kindEn") or "event"
    hint_urls = [u for u in ([ev.get("url")] + (ev.get("alt") or [])) if u][:5]

    user = (
        f"Event to brief:\n"
        f"- Reported as: {kind}\n"
        f"- Location: {place} ({ev.get('lat')}, {ev.get('lon')})\n"
        f"- A headline seen in coverage: {title}\n"
        f"- Coverage volume: {ev.get('sources', 0)} documents, "
        f"{ev.get('merged', 1)} independently coded reports\n"
        f"- Some URLs that surfaced (starting points only — verify and search "
        f"for more; do not cite one you did not open):\n"
        + "".join(f"    {u}\n" for u in hint_urls)
        + "\nSearch for current reporting on this, then write the brief."
    )

    messages = [{"role": "user", "content": user}]

    # ⚠️ 서버 도구를 쓰면 stop_reason 이 "pause_turn" 으로 끊길 수 있다
    #    (검색 반복 상한). 그러면 지금까지의 응답을 그대로 되돌려 이어 붙인다.
    #    ⚠️ "계속해" 같은 사용자 메시지를 넣으면 안 된다 — 서버가 알아서 이어받는다.
    for _ in range(4):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=SYSTEM,
            messages=messages,
            tools=[{"type": "web_search_20260209", "name": "web_search",
                    "max_uses": 8}],
            output_config={"effort": EFFORT,
                           "format": {"type": "json_schema", "schema": SCHEMA}},
            thinking={"type": "adaptive"},
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError(f"refusal: {getattr(resp.stop_details, 'category', None)}")
        if resp.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": resp.content})
    else:
        raise RuntimeError("pause_turn 이 계속 이어짐 — 포기")

    if resp.stop_reason == "max_tokens":
        raise RuntimeError("max_tokens — 잘린 JSON 은 쓰지 않는다")

    text = "".join(b.text for b in resp.content if b.type == "text")
    if not text.strip():
        raise RuntimeError("빈 응답")
    data = json.loads(text)

    # 검색이 실제로 무엇을 찾았는지 — 링크를 지어냈는지 검사하는 데 쓴다
    found = set()
    for b in resp.content:
        if b.type == "web_search_tool_result":
            c = getattr(b, "content", None)
            # ⚠️ 성공은 목록, 실패는 객체 하나로 온다. 인덱싱 전에 분기해야 한다.
            if isinstance(c, list):
                for r in c:
                    u = getattr(r, "url", None)
                    if u:
                        found.add(u)

    usage = resp.usage
    return data, found, {
        "in": usage.input_tokens, "out": usage.output_tokens,
        "searches": len(found),
    }


# ══════════════════════════════════════════════════════════════
# 후검사 — 프롬프트만 믿지 않는다
# ══════════════════════════════════════════════════════════════

def host_of(u):
    try:
        h = urllib.parse.urlparse(u).netloc.lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:                                        # noqa: BLE001
        return ""


"""따옴표 문자 — 여는/닫는 구분 없이 한 묶음으로 본다.
⚠️ 홑따옴표(')는 넣지 않는다. 영어의 소유격(Bordeaux's)까지 걸려서 정상 문장을 버린다."""
_QUOTES = "\"“”「」『』"
_QUOTED = re.compile("[" + re.escape(_QUOTES) + "]"
                     "([^" + re.escape(_QUOTES) + "]{60,})"
                     "[" + re.escape(_QUOTES) + "]")


def looks_quoted(s):
    """따옴표로 감싼 긴 덩어리가 있으면 원문 인용일 수 있다.
    ⚠️ 짧은 것(고유명사·작전명·기관명)은 통과시킨다. 잡고 싶은 건 문장 인용이다."""
    m = _QUOTED.search(s)
    return m.group(1)[:60] if m else None


def clean(data, found_urls, ev):
    """지켜야 할 선을 응답에 실제로 적용한다.

    ⚠️ 여기서 버린 것을 조용히 넘기지 않는다. dropped 에 이유를 남겨
       앱과 로그가 "몇 개를 왜 버렸는지" 볼 수 있게 한다.
    """
    dropped = []
    bullets = []

    for b in (data.get("bullets") or []):
        ko = (b.get("ko") or "").strip()
        en = (b.get("en") or "").strip()
        if not ko or not en:
            dropped.append("빈 항목")
            continue

        q = looks_quoted(ko) or looks_quoted(en)
        if q:
            dropped.append(f"원문 인용 의심: {q}…")
            continue

        # 출처 검사 — 검색으로 실제로 열어본 URL 만 남긴다.
        srcs = []
        for s in (b.get("sources") or []):
            u = (s.get("url") or "").strip()
            if not u.startswith(("http://", "https://")):
                continue
            # ⚠️ 검색 결과에 없던 URL 은 지어낸 것일 수 있다. 도메인이라도 일치해야 한다.
            #    (검색 결과 URL 과 최종 기사 URL 이 리다이렉트로 달라지는 경우가 있어
            #     완전 일치를 요구하면 정상 출처도 버리게 된다.)
            h = host_of(u)
            if not h:
                continue
            if u not in found_urls and h not in {host_of(f) for f in found_urls}:
                dropped.append(f"검색에 없던 출처: {h}")
                continue
            srcs.append({"url": u, "host": h,
                         "title": (s.get("title") or "").strip()[:160]})

        if not srcs:
            dropped.append("출처 없음")
            continue

        # 같은 매체 중복 제거 — "3곳"처럼 보이게 하지 않는다
        seen, uniq = set(), []
        for s in srcs:
            if s["host"] in seen:
                continue
            seen.add(s["host"])
            uniq.append(s)

        bullets.append({"ko": ko, "en": en, "sources": uniq[:4]})

    if not bullets:
        raise RuntimeError(f"남은 항목이 없다 (버린 이유: {dropped})")

    hosts = sorted({s["host"] for b in bullets for s in b["sources"]})

    return {
        "id": ev["id"],
        "lat": ev["lat"], "lon": ev["lon"],
        "place": ev.get("place"), "country": ev.get("country"),
        "kindKo": ev.get("kindKo"), "kindEn": ev.get("kindEn"),
        "disaster": bool(ev.get("disaster")),
        "score": ev.get("score"),
        "headline": {"ko": data["headline_ko"], "en": data["headline_en"]},
        "summary": {"ko": data["summary_ko"], "en": data["summary_en"]},
        "bullets": bullets,
        "context": data.get("context") or [],
        "unresolved": {"ko": data.get("unresolved_ko") or [],
                       "en": data.get("unresolved_en") or []},
        "confidence": data.get("confidence") or "low",
        "outlets": hosts,
        "dropped": dropped,          # 숨기지 않는다
        "writtenBy": MODEL,          # AI 가 썼다는 사실을 앱이 표시한다
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
    }


# ══════════════════════════════════════════════════════════════

def load_json(key, default):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except s3.exceptions.NoSuchKey:
        return default
    except Exception as e:                                   # noqa: BLE001
        print(f"[load] {key} 실패 {e!r}")
        return default


def handler(event, context):
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        # ⚠️ 키가 없다고 빈 파일을 쓰면 안 된다. 기존 브리핑이 지워진다.
        print("[skip] ANTHROPIC_API_KEY 없음 — 아무것도 쓰지 않고 끝낸다")
        return {"ok": False, "reason": "no_api_key", "wrote": False}

    import anthropic                                          # 키가 있을 때만 필요

    src = load_json(SRC_KEY, {})
    events = src.get("events") or []
    if not events:
        return {"ok": False, "reason": "no_events", "wrote": False}

    prev = load_json(DST_KEY, {})
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=TTL_HOURS)

    # 오래된 브리핑은 버린다. 사흘 전 산불을 "지금"이라고 보여주면 안 된다.
    kept = []
    for b in (prev.get("briefs") or []):
        try:
            when = datetime.strptime(b["at"], "%Y-%m-%dT%H:%M:00Z").replace(tzinfo=timezone.utc)
        except Exception:                                     # noqa: BLE001
            continue
        if when >= cutoff:
            kept.append(b)

    # ⚠️ 이벤트가 사라졌으면(더 이상 확정 아님) 브리핑도 내린다.
    live_ids = {e["id"] for e in events}
    kept = [b for b in kept if b["id"] in live_ids]

    have = {b["id"] for b in kept}
    targets = pick(events, have, MAX_BRIEFS)
    print(f"[pick] 확정 {sum(1 for e in events if e.get('status')=='confirmed')}건 중 "
          f"{len(targets)}건 브리핑 (기존 유지 {len(kept)}건)")

    client = anthropic.Anthropic(api_key=key)
    made, failed, cost = [], [], {"in": 0, "out": 0}

    for ev in targets:
        t0 = time.time()
        try:
            data, found, u = ask(client, ev)
            made.append(clean(data, found, ev))
            cost["in"] += u["in"]
            cost["out"] += u["out"]
            print(f"[ok] {ev['id']} {ev.get('place')} "
                  f"검색{u['searches']} {time.time()-t0:.0f}s "
                  f"in{u['in']} out{u['out']}")
        except Exception as e:                                # noqa: BLE001
            # ⚠️ 한 건 실패로 전체를 버리지 않는다. 나머지는 쓴다.
            failed.append({"id": ev["id"], "why": repr(e)[:200]})
            print(f"[fail] {ev['id']} {ev.get('place')} {e!r}")

    if not made and not kept:
        print("[skip] 쓸 것이 없다 — 기존 파일을 건드리지 않는다")
        return {"ok": False, "reason": "nothing", "failed": failed, "wrote": False}

    briefs = made + kept
    briefs.sort(key=lambda b: b.get("at", ""), reverse=True)

    out = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "sourceGenerated": src.get("generated"),
        "model": MODEL,
        "effort": EFFORT,
        "ttlHours": TTL_HOURS,
        # ⚠️ 앱이 이 문구를 화면에 그대로 띄운다. AI 가 썼다는 사실을 숨기지 않는다.
        "notice": {
            "ko": "각 항목은 AI가 웹 검색으로 확인한 사실을 다시 쓴 것입니다. "
                  "원문 기사를 그대로 옮기지 않으며, 항목마다 근거 기사로 이어집니다. "
                  "정확한 내용은 원문을 확인하세요.",
            "en": "Each point is rewritten by AI from facts verified via web search. "
                  "No article text is reproduced; every point links to its source. "
                  "Check the original reporting for detail.",
        },
        "counts": {"new": len(made), "kept": len(kept),
                   "failed": len(failed), "total": len(briefs)},
        "failed": failed,
        "usage": cost,
        "briefs": briefs,
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST_KEY, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=600")
    print(f"[out] 신규 {len(made)} + 유지 {len(kept)} = {len(briefs)}건, "
          f"{len(body)/1024:.0f}KB, 토큰 in{cost['in']} out{cost['out']}")
    return {"ok": True, **out["counts"], "bytes": len(body)}

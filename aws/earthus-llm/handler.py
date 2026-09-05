# EARTHUS LLM 프록시 — 지구와 대화 (개발지시서 v5.3 §17C)
#
# 브라우저는 이 Lambda에만 말을 건다. 제미니 키는 여기 환경변수에만 있고
# 번들에는 절대 들어가지 않는다 (정적 페이지라 넣으면 누구나 읽는다).
#
# §17C가 정한 선을 이 파일이 강제한다:
#   - LLM은 **우리가 이미 확보한 근거(snapshot)** 만 설명한다.
#   - 근거에 없는 원인·수치·확률·좌표를 지어내지 않는다. 없으면 없다고 말한다.
#   - 관측/모델/시뮬레이션을 뭉뚱그리지 않는다 (배지를 그대로 인용한다).
#   - 3D는 **승인된 Scene Tool** 로만 움직인다. 도구 밖의 행동은 무시된다.
#
# 이 파일이 하지 않는 것: 웹 검색, 기사 요약, 예보 생성. 그건 다른 계층의 일이다.
import json
import os
import time
import urllib.error
import urllib.request

# 모델 하나를 박아두면 그 모델이 폐지되는 날 조용히 죽는다 (2.5 계열이 실제로 그렇게 됐다).
# 게다가 가용성이 모델마다 흔들린다 — 같은 순간에 3.8은 답하고 3.6은 503이었다.
# 그래서 후보를 순서대로 두드리고 처음 답하는 것을 쓴다.
MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_MODELS", "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite"
).split(",") if m.strip()]
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"

ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "https://earthus.net")
MAX_Q = 400          # 질문 길이 상한 (자)
MAX_LAYERS = 60      # 스냅샷에 담을 레이어 수 상한
MAX_OUT = 3000       # 응답 토큰 상한 — 비용과 남용을 함께 막는다
# ⚠️ Gemini 3.x 는 사고(thinking) 토큰이 이 예산을 같이 먹는다. 1200으로 뒀더니
#    답이 문장 중간에서 잘려 JSON 이 깨졌다(실측 2026-09-03). 넉넉히 준다.

# 승인된 Scene Tool. 브라우저가 실행할 수 있는 것과 정확히 같아야 한다.
# 여기 없는 이름을 모델이 부르면 버린다.
SCENE_TOOLS = {
    "showLayer": ["id"],
    "hideLayer": ["id"],
    "flyTo": ["lat", "lon", "altKm"],
    "openCard": ["id"],
}

SYSTEM = """당신은 EARTHUS의 지구 해설자입니다. {LANG_LINE}

절대 규칙 — 어기면 답변으로서 실패입니다:
1. 아래 <snapshot>에 실제로 있는 값만 사용합니다. 스냅샷에 없는 수치·원인·확률·좌표를
   지어내지 않습니다. 일반 상식으로 채우지도 않습니다.
2. 물어본 것이 스냅샷에 없으면 {NO_DATA}라고 말하고,
   무엇이 있어야 답할 수 있는지 한 줄로 알려줍니다. insufficient 를 true 로 둡니다.
3. 각 값에는 배지가 붙어 있습니다. 그 성격을 뭉개지 마세요.
   OBSERVED=공식 관측, OFFICIAL=공식 예보, WARNING=공식 특보,
   MODEL=제공자 모델, DERIVED=EARTHUS 자체 분석, SIMULATION=시뮬레이션.
   관측과 모델을 같은 문장에서 같은 무게로 말하지 않습니다.
   예보를 "지금 이렇다"로 바꿔 말하지 않습니다.
4. 자료의 나이(ageMin)가 그 레이어의 기준(slaMin)을 넘었으면 그 사실을 함께 말합니다.
5. 원인을 묻는 질문에는, 스냅샷의 값들 사이의 관계로 설명할 수 있는 만큼만 말하고
   {CORR}를 분명히 합니다. 기사나 통념을 끌어오지 않습니다.
6. 스냅샷에 답할 자료가 없지만 <snapshot>의 "켤수있는레이어" 중에 답에 필요한 것이 있으면,
   그 레이어의 showLayer 를 actions 에 넣고 answer 에 "이 자료를 켜면 답할 수 있습니다: (이름)" 을
   덧붙입니다. insufficient 는 그대로 true 입니다. 켜지 않은 자료의 값을 미리 말하지 않습니다.

답변 형식: 3~5문장. 숫자를 말할 때는 출처 레이어 이름을 함께 적습니다.

3D 조작: 답을 보여주는 데 도움이 되면 actions 에 넣습니다. 없어도 됩니다.
사용 가능한 도구는 이것뿐입니다:
  showLayer {id}          — 레이어를 켠다 (id 는 스냅샷의 레이어 id)
  hideLayer {id}          — 레이어를 끈다
  flyTo {lat, lon, altKm} — 그 지점으로 이동 (altKm 은 20~20000)
  openCard {id}           — 그 레이어의 근거 카드를 연다
"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "insufficient": {"type": "boolean"},
        "used": {"type": "array", "items": {"type": "string"}},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tool": {"type": "string"},
                    "id": {"type": "string"},
                    "lat": {"type": "number"},
                    "lon": {"type": "number"},
                    "altKm": {"type": "number"},
                },
                "required": ["tool"],
            },
        },
    },
    "required": ["answer", "insufficient", "used"],
}

# 컨테이너 안에서만 사는 아주 성긴 속도 제한.
# 컨테이너가 새로 뜨면 초기화되므로 완전한 방어가 아니다 — 남용을 늦출 뿐이다.
# 진짜 방어가 필요해지면 DynamoDB 로 옮긴다.
_BUCKET = {}
RATE_N = 12          # 창당 허용 횟수
RATE_WINDOW = 60.0   # 창 길이(초)


def rate_ok(ip):
    now = time.time()
    hits = [t for t in _BUCKET.get(ip, []) if now - t < RATE_WINDOW]
    if len(hits) >= RATE_N:
        _BUCKET[ip] = hits
        return False
    hits.append(now)
    _BUCKET[ip] = hits
    if len(_BUCKET) > 500:          # 메모리가 무한히 늘지 않게
        for k in list(_BUCKET)[:200]:
            _BUCKET.pop(k, None)
    return True


def reply(code, body):
    return {
        "statusCode": code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": ALLOW_ORIGIN,
            "access-control-allow-headers": "content-type",
            "access-control-allow-methods": "POST, OPTIONS",
            "cache-control": "no-store",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def compact_snapshot(payload):
    """브라우저가 보낸 화면 상태를 모델이 읽을 수 있는 최소 형태로 줄인다.
    여기서 자르는 이유는 비용이 아니라 **초점**이다 — 화면에 없는 것을 근거로
    삼으면 안 되므로, 지금 켜져 있는 것만 넘긴다."""
    view = payload.get("view") or {}
    out = {
        "지금(UTC)": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "보는곳": {
            "lat": view.get("lat"), "lon": view.get("lon"),
            "고도km": view.get("altKm"), "지형과장": view.get("exagger"),
        },
        "레이어": [],
    }
    if payload.get("focus"):
        out["선택한나라"] = str(payload["focus"])[:120]
    # 화면 한가운데에서 실제로 읽히는 값. 이게 없으면 모델은 레이어 이름만 보고
    # "알 수 없다"밖에 못 한다(실측 2026-09-03). 인코딩을 되돌린 원값이다.
    pt = payload.get("point")
    if isinstance(pt, dict) and pt:
        out["보는곳의값"] = {str(k)[:24]: v for k, v in list(pt.items())[:12]
                          if isinstance(v, (int, float, str))}
    # 켤 수 있는 레이어(지금 꺼진 것) — 모델이 "이걸 켜면 답할 수 있다"고 제안할 때만 쓴다(지시서 H).
    # 값은 싣지 않는다: 켜지 않은 자료의 값을 근거로 삼으면 안 된다.
    avail = []
    for l in (payload.get("available") or [])[:MAX_LAYERS]:
        if isinstance(l, dict) and l.get("id"):
            avail.append({"id": str(l["id"])[:40], "이름": str(l.get("label", ""))[:60], "배지": str(l.get("badge", ""))[:24]})
    if avail:
        out["켤수있는레이어"] = avail
    for l in (payload.get("layers") or [])[:MAX_LAYERS]:
        if not isinstance(l, dict):
            continue
        row = {
            "id": str(l.get("id", ""))[:40],
            "이름": str(l.get("label", ""))[:60],
            "배지": str(l.get("badge", ""))[:24],
        }
        for k, ko in (("ageMin", "자료나이분"), ("slaMin", "기준분"),
                      ("value", "값"), ("source", "출처")):
            if l.get(k) not in (None, ""):
                row[ko] = l[k] if k in ("ageMin", "slaMin") else str(l[k])[:300]
        out["레이어"].append(row)
    return out


def call_one(key, model, body):
    req = urllib.request.Request(
        ENDPOINT.format(m=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


# 기기 언어를 따른다. 화면은 영어인데 답만 한국어로 오면 그건 제품이 아니다.
# 규칙(근거 밖으로 나가지 않기·배지 구분)은 언어와 무관하게 같아야 하므로
# 지시문 본문은 하나로 두고 답변 언어 줄만 갈아 끼운다.
LANG_LINE = {
    "ko": "한국어로 답합니다.",
    "en": "Answer in English. Keep the Korean layer names as-is when you cite them,"
          " and put a short English gloss in parentheses the first time.",
}
# 지시문 안에 박아둔 정형구도 언어를 따라야 한다. 영어로 답하면서 이 문장만
# 한국어로 나오면 답변에 한국어가 섞인다(실측 2026-09-03).
NO_DATA = {
    "ko": '"지금 화면의 자료로는 알 수 없습니다"',
    "en": '"I cannot tell from what is on screen right now"',
}
CORR = {
    "ko": '"이건 상관관계이지 확정된 원인이 아닙니다"',
    "en": '"this is a correlation, not an established cause"',
}


def call_gemini(key, snapshot, question, lang="ko"):
    system = (SYSTEM
              .replace("{LANG_LINE}", LANG_LINE.get(lang, LANG_LINE["ko"]))
              .replace("{NO_DATA}", NO_DATA.get(lang, NO_DATA["ko"]))
              .replace("{CORR}", CORR.get(lang, CORR["ko"])))
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{
            "role": "user",
            "parts": [{"text":
                       "<snapshot>\n"
                       + json.dumps(snapshot, ensure_ascii=False, indent=1)
                       + "\n</snapshot>\n\n질문: " + question}],
        }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": MAX_OUT,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }
    last = None
    for model in MODELS:
        try:
            return call_one(key, model, body), model
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:200]
            print(f"[gemini] {model} HTTP {e.code} {detail}")
            last = e
            # 400은 우리 요청이 잘못된 것이다 — 다른 모델로 바꿔도 똑같다.
            if e.code == 400:
                raise
            # 404(폐지) · 429(할당량) · 5xx(과부하)는 다음 후보로 넘어간다.
        except Exception as e:                                # noqa: BLE001
            # 시간 초과·연결 끊김도 실측된 실패 양상이다 (flash-latest·3.7-flash).
            print(f"[gemini] {model} {type(e).__name__}: {e}")
            last = e
    raise last if last else RuntimeError("후보 모델이 비어 있습니다")


def clean_actions(raw):
    """모델이 부른 도구 중 승인된 것만, 인자까지 검사해 남긴다.
    도구 밖의 행동은 조용히 버린다 — 3D는 승인된 문법으로만 움직인다(§17C)."""
    out = []
    for a in (raw or [])[:4]:
        if not isinstance(a, dict):
            continue
        tool = a.get("tool")
        if tool not in SCENE_TOOLS:
            continue
        act = {"tool": tool}
        ok = True
        for arg in SCENE_TOOLS[tool]:
            v = a.get(arg)
            if v is None:
                ok = False
                break
            if arg in ("lat", "lon", "altKm"):
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    ok = False
                    break
                if arg == "lat" and not -90 <= v <= 90:
                    ok = False
                    break
                if arg == "lon" and not -180 <= v <= 180:
                    ok = False
                    break
                if arg == "altKm":
                    v = max(20.0, min(20000.0, v))
            else:
                v = str(v)[:40]
            act[arg] = v
        if ok:
            out.append(act)
    return out


def handler(event, context):
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method", "POST")
    if method == "OPTIONS":
        return reply(204, {})
    if method != "POST":
        return reply(405, {"error": "POST만 받습니다"})

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        # 키가 없으면 지어내지 않고 그대로 알린다.
        return reply(503, {"error": "GEMINI_API_KEY 없음", "insufficient": True})

    ip = http.get("sourceIp", "?")
    if not rate_ok(ip):
        return reply(429, {"error": "잠시 뒤에 다시 물어봐 주세요 (분당 12회)"})

    try:
        payload = json.loads(event.get("body") or "{}")
    except (ValueError, TypeError):
        return reply(400, {"error": "본문이 JSON이 아닙니다"})

    # 기기 언어. 모르는 값이 오면 한국어로 둔다 — 임의의 언어로 답하지 않는다.
    lang = "en" if str(payload.get("lang") or "ko").lower().startswith("en") else "ko"
    q = str(payload.get("q") or "").strip()
    if not q:
        return reply(400, {"error": "질문이 비어 있습니다"})
    if len(q) > MAX_Q:
        return reply(400, {"error": f"질문이 너무 깁니다 ({MAX_Q}자까지)"})

    snapshot = compact_snapshot(payload)
    if not snapshot["레이어"]:
        # 켜진 레이어가 없으면 근거가 없다. 모델을 부르지 않는다 —
        # 부르면 반드시 일반 상식으로 답하려 든다.
        return reply(200, {
            "answer": ("No layers are on, so there is nothing to ground an answer in. "
                       "Turn on a layer from the menu and ask again.")
            if lang == "en" else
            ("지금 켜진 레이어가 없어서 근거로 삼을 자료가 없습니다. "
             "왼쪽 메뉴에서 보고 싶은 레이어를 켜고 다시 물어봐 주세요."),
            "insufficient": True, "used": [], "actions": [],
        })

    try:
        raw, used_model = call_gemini(key, snapshot, q, lang)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        print(f"[gemini] HTTP {e.code} {detail}")
        return reply(502, {"error": f"모델 호출 실패 (HTTP {e.code})", "insufficient": True})
    except Exception as e:                                   # noqa: BLE001
        print(f"[gemini] {type(e).__name__}: {e}")
        return reply(502, {"error": "모델 호출 실패", "insufficient": True})

    try:
        cand = raw["candidates"][0]
        text = "".join(p.get("text", "") for p in cand["content"]["parts"])
        # 예산이 모자라 잘린 응답은 '반쯤 맞는 답'이라 제일 위험하다. 뭉개지 말고 그렇다고 말한다.
        if cand.get("finishReason") == "MAX_TOKENS":
            print(f'[gemini] MAX_TOKENS 로 잘림 · {len(text)}자')
            return reply(502, {"error": "답변이 길이 제한에 걸려 잘렸습니다", "insufficient": True})
        parsed = json.loads(text)
    except (KeyError, IndexError, ValueError, TypeError) as e:
        # 스키마를 지키지 못한 응답은 쓰지 않는다. 반쯤 맞는 답이 제일 위험하다.
        print(f"[gemini] 응답 해석 실패: {type(e).__name__}: {e} · {str(raw)[:300]}")
        return reply(502, {"error": "모델 응답을 해석하지 못했습니다", "insufficient": True})

    usage = raw.get("usageMetadata") or {}
    return reply(200, {
        "answer": str(parsed.get("answer", ""))[:4000],
        "insufficient": bool(parsed.get("insufficient")),
        "used": [str(u)[:60] for u in (parsed.get("used") or [])][:12],
        "actions": clean_actions(parsed.get("actions")),
        "model": used_model,
        "tokens": usage.get("totalTokenCount"),
    })

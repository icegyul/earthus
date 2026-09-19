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
#
# 인텔 패킷 동봉 (INTELLIGENCE-LAYER-PLAN P4 · 계약 §C-1·§C-2) — 2026-09-20
#   요청에 intelPacket 이 있으면 intel_contract.narrator_view() 를 거친 모양만 스냅샷에 싣는다.
#   원본 패킷은 모델에게 가지 않는다(confidence 내부 수치·coverage 는 빠진다).
#   모델 답은 narration_guard 가 스냅샷·패킷과 글자로 대조하고, 하나라도 걸리면 답 전체를
#   고정 문장으로 바꾼다. 응답의 guard 칸이 그 판정이다.
import json
import os
import sys
import time
import urllib.error
import urllib.request

# 같은 폴더의 narration_guard 와 _shared 의 intel_contract. Lambda 에서는 둘 다 zip 루트에 평평하게
# 들어가 그냥 잡힌다. 저장소·시험에서는 자기 폴더와 ../_shared 를 경로에 넣는다(cyclone-analog 와 같은 관용구).
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
sys.path.insert(0, _HERE)
import intel_contract  # noqa: E402
import narration_guard  # noqa: E402

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
7. <snapshot>의 "인텔패킷" 에서 "missingSections" 에 있는 절은 없다고 말합니다.
   절 이름을 부르지 않고 {SECTION_MISSING} 라고만 씁니다. 그 절을 다른 값·상식으로 메우지 않습니다.
8. 인텔패킷의 confidence 는 등급({GRADES}) 하나뿐입니다. 등급을 숫자·백분율·확률로
   바꾸지 않고, 등급을 말하는 문장에 숫자를 붙이지 않습니다.

인텔패킷을 읽는 법 (스냅샷에 있을 때만):
  - 왜(WHY)를 물으면 conditions 만 인용합니다. conditions 는 함께 나타난 조건이지 원인이 아닙니다.
  - 앞으로(NEXT)를 물으면 next 항목 중 kind 가 {FORECAST_KINDS} 인 것만 인용하고,
    기관(source)과 발표 시각(issuedAt)을 함께 적습니다.
  - % 와 확률은 quotedOfficial 문장을 한 글자도 바꾸지 않고 옮길 때만 씁니다.
  - 대피·피난·피해액은 말하지 않습니다. 유효한 특보를 해제·종료됐다고 말하지 않습니다.
  - 숫자는 적힌 그대로 씁니다(소수 자리 반올림만). 단위를 바꾸거나 새로 계산하지 않습니다.

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
# 규칙 7 의 고정 문장·규칙 8 의 등급·NEXT 의 예보 종류는 어휘 정본(intel-vocab.json)에서 읽는다.
# 지시문에 베껴 적으면 정본이 바뀌는 날 지시문만 옛말을 한다.
SECTION_MISSING = {lang: '"%s"' % text for lang, text in intel_contract.FIXED_TEXT["sectionMissing"].items()}
GRADES = "/".join(intel_contract.CONFIDENCE_GRADE)
FORECAST_KINDS = "·".join(k for k in intel_contract.EVIDENCE_KIND if k.endswith("_FORECAST"))


def system_prompt(lang="ko"):
    """언어에 맞춘 지시문. 규칙 본문은 하나이고 정형구만 갈아 끼운다."""
    return (SYSTEM
            .replace("{LANG_LINE}", LANG_LINE.get(lang, LANG_LINE["ko"]))
            .replace("{NO_DATA}", NO_DATA.get(lang, NO_DATA["ko"]))
            .replace("{CORR}", CORR.get(lang, CORR["ko"]))
            .replace("{SECTION_MISSING}", SECTION_MISSING.get(lang, SECTION_MISSING["ko"]))
            .replace("{GRADES}", GRADES)
            .replace("{FORECAST_KINDS}", FORECAST_KINDS))


# ── 인텔 패킷 동봉 (계약 §C-1) ─────────────────────────────────────────────
# 한 사건 패킷의 서술자 뷰는 수천 자다(태풍 픽스처 실측 3,493자). 넉넉히 두되 끝은 둔다 —
# 토큰 예산(MAX_OUT)과 별개로 입력이 무한히 커지지 않게.
MAX_PACKET = 40000
# 특보는 메타만 넘긴다(§C-1). 본문(headline·instruction 따위)은 화면이 원문 카드로 결정적으로 넣는다.
WARNING_META = ("id", "kind", "status", "issuedAt", "officialUrl", "ageMin", "slaMin")
PACKET_ERRORS = (intel_contract.IntelContractError, TypeError, AttributeError, ValueError, KeyError)


def enclose_packet(raw):
    """브라우저가 보낸 인텔 패킷 → 서술자 뷰. 원본은 모델에게 가지 않는다.

    narrator_view() 가 계약 검사(require_valid)·수리(normalize)를 하고 missing 절·confidence 내부
    수치를 뺀다. 여기서는 특보 출처를 메타 다섯 칸(+나이)만 남긴다. 계약 위반·크기 초과면 던진다 —
    부른 쪽이 모델을 부르지 않고 insufficient 로 닫는다.
    """
    view = intel_contract.narrator_view(raw)
    for src in view.get("sources") or []:
        if isinstance(src, dict) and src.get("kind") == "OFFICIAL_WARNING":
            for field in [f for f in src if f not in WARNING_META]:
                src.pop(field)
    if len(json.dumps(view, ensure_ascii=False)) > MAX_PACKET:
        raise intel_contract.IntelContractError("패킷 뷰가 %d자를 넘는다" % MAX_PACKET)
    return view


def closed(lang, reason):
    """모델을 부르지 않고 닫는 답 — 고정 문장과 사유 코드."""
    return {"answer": narration_guard.insufficient_text(lang), "insufficient": True,
            "used": [], "actions": [], "guard": {"passed": False, "reasons": [reason]}}


def call_gemini(key, snapshot, question, lang="ko"):
    system = system_prompt(lang)
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

    # 인텔 패킷 — 계약을 어긴 패킷은 서술자에게 가지 않는다. 패킷 없이 조용히 답하면 Intelligence
    # 질문이 패킷 밖 자료로 답해지므로, 모델을 부르지 않고 닫는다.
    intel_view = None
    if payload.get("intelPacket") is not None:
        try:
            intel_view = enclose_packet(payload["intelPacket"])
        except PACKET_ERRORS as e:
            print(f"[intel] 패킷 계약 위반 — 모델을 부르지 않는다: {type(e).__name__}: {str(e)[:300]}")
            return reply(200, closed(lang, "PACKET_INVALID"))
        snapshot["인텔패킷"] = intel_view

    # 5절 중 무엇을 묻는가(WHY/WHAT/NEXT/IMPACT/EVIDENCE). 그 절의 재료가 패킷에 없으면 모델을
    # 부르지 않는다 — 재료 없는 WHY 를 서술자가 상식으로 채우는 것이 가장 흔한 실패다(P4 게이트).
    section = payload.get("intelSection")
    if section is not None:
        if not isinstance(section, str) or section not in intel_contract.INTEL_SECTIONS:
            return reply(400, {"error": "모르는 절입니다: %s" % str(section)[:20]})
        if intel_contract.section_status(intel_view, section)["status"] != "available":
            return reply(200, closed(lang, "SECTION_NOT_AVAILABLE"))

    if not snapshot["레이어"] and intel_view is None:
        # 켜진 레이어가 없으면 근거가 없다. 모델을 부르지 않는다 —
        # 부르면 반드시 일반 상식으로 답하려 든다.
        return reply(200, {
            "answer": ("No layers are on, so there is nothing to ground an answer in. "
                       "Turn on a layer from the menu and ask again.")
            if lang == "en" else
            ("지금 켜진 레이어가 없어서 근거로 삼을 자료가 없습니다. "
             "왼쪽 메뉴에서 보고 싶은 레이어를 켜고 다시 물어봐 주세요."),
            "insufficient": True, "used": [], "actions": [],
            # 모델 답이 아니라 고정 안내라 걸릴 것이 없다. 200 답의 모양을 맞추려고 단다.
            "guard": {"passed": True, "reasons": []},
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

    # 서술 후처리(계약 §C-2) — 모델이 본 스냅샷·패킷과 글자로 대조한다. 걸리면 답 전체를 바꾼다.
    # 바뀐 답에는 모델이 고른 근거·3D 조작도 붙이지 않는다 — 같은 생성에서 나온 것이다.
    verdict = narration_guard.check(str(parsed.get("answer", ""))[:4000], intel_view,
                                    snapshot=snapshot, lang=lang)
    if not verdict["passed"]:
        print(f"[guard] 답 전체 교체 · {verdict['reasons']} · {verdict['details'][:8]}")
    passed = verdict["passed"]
    usage = raw.get("usageMetadata") or {}
    return reply(200, {
        "answer": verdict["answer"],
        "insufficient": bool(parsed.get("insufficient")) or not passed,
        "used": [str(u)[:60] for u in (parsed.get("used") or [])][:12] if passed else [],
        "actions": clean_actions(parsed.get("actions")) if passed else [],
        "model": used_model,
        "tokens": usage.get("totalTokenCount"),
        "guard": {"passed": passed, "reasons": verdict["reasons"]},
    })

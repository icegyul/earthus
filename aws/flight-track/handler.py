"""내 항공편 추적 프록시 (adsb.lol)

왜 OpenSky 에서 갈아탔나
  인수인계 §4-10 이 명시했다: "OpenSky 는 **비상업용 라이선스**라 유료 앱에 사용 불가".
  그걸 알고도 OpenSky 로 만들었던 게 잘못이었다.

  adsb.lol 은 다르다 (실측 확인):
    · 라이선스 **ODbL 1.0** — 상업적 사용 허용. 출처 표기 + 파생DB 공개 시 동일 라이선스.
      근거: https://www.adsb.lol/docs/open-data/api/  "License: ODbL 1.0"
      피더가 보내는 원자료는 CC0 로 권리 포기 (privacy-license 페이지)
    · 키·계정 불필요 — "The API is available to everyone."
    · **편명으로 바로 조회된다** → 후보를 찾아 사용자에게 고르게 하던 절차가 사라짐
    · 등록번호·기종·비상코드까지 온다 (§4-11 의 7700/7600/7500 필터가 가능해진다)
    · **전체 항적**을 준다 → 대권 근사가 아니라 실제 비행 경로를 그릴 수 있다

  ⚠️ 문서에 "rate limiting 과 API 키를 나중에 도입할 예정"이라고 적혀 있다.
     지금은 무제한이지만 영구 보장이 아니다. 응답을 캐시해 부담을 줄인다.

  ⚠️ 자원봉사 수신망이다. 대양·극지는 빈 구간이 있다.
     FlightRadar24 의 위성 ADS-B 와 다르다 — UI 에서 그렇게 말한다.

동작
  GET ?mode=find&num=KE081        편명(또는 호출부호)으로 항공기를 찾는다
  GET ?mode=track&hex=71be19      기체 하나의 현재 상태
  GET ?mode=trace&hex=71be19      기체의 전체 항적 (고도 포함)

⚠️ ODbL 준수: 응답에 attribution 을 실어 보내고, 앱이 화면에 표기한다.
"""

import gzip
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.adsb.lol/v2"
TRACE = "https://adsb.lol/data/traces"
UA = {"User-Agent": "earthus/0.1 (+globe app; ODbL attribution shown in-app)"}

ATTRIB = "Data: adsb.lol contributors, ODbL 1.0"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
}


def get(url, timeout=25):
    """adsb.lol 응답. trace 는 gzip 으로 오고 리다이렉트를 한 번 탄다."""
    req = urllib.request.Request(url, headers={**UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
        return json.loads(raw.decode("utf-8", "replace"))


def row(a):
    """adsb.lol 항공기 레코드 → 우리가 쓰는 형태.

    ⚠️ 값이 없으면 None 으로 둔다. 0 으로 채우면 "고도 0m" 처럼 읽힌다.
    ⚠️ alt_baro 가 문자열 'ground' 로 오는 경우가 있다 (지상 활주 중).
       숫자로 강제 변환하면 터지거나 0 이 된다.
    """
    alt = a.get("alt_baro")
    on_ground = alt == "ground"
    if on_ground:
        alt = 0
    if not isinstance(alt, (int, float)):
        alt = a.get("alt_geom") if isinstance(a.get("alt_geom"), (int, float)) else None

    return {
        "hex": a.get("hex"),
        "callsign": (a.get("flight") or "").strip() or None,
        "reg": a.get("r"),                    # 등록번호 (HL7619)
        "type": a.get("t"),                   # 기종 (A388 = A380)
        "desc": a.get("desc"),                # 기종 풀네임
        "lat": a.get("lat"), "lon": a.get("lon"),
        # ⚠️ ADS-B 고도는 피트다. m 로 바꿔 넘긴다 (앱 전체가 m 기준).
        "altFt": alt,
        "alt": round(alt * 0.3048) if isinstance(alt, (int, float)) else None,
        "onGround": on_ground,
        "gsKt": a.get("gs"),
        "vel": round(a.get("gs") * 0.514444, 1) if isinstance(a.get("gs"), (int, float)) else None,
        "track": a.get("track"),
        # baro_rate 는 ft/min → m/s
        "vrate": round(a.get("baro_rate") / 196.85, 1) if isinstance(a.get("baro_rate"), (int, float)) else None,
        "squawk": a.get("squawk"),
        # ⚠️ 비상 코드는 절대 가공하지 않는다 (7700 일반비상 / 7600 통신두절 / 7500 납치)
        "emergency": a.get("emergency") if a.get("emergency") not in (None, "none") else None,
        "seenPos": a.get("seen_pos"),         # 마지막 위치 수신 후 경과 초
    }


def digits(s):
    d = "".join(c for c in str(s or "") if c.isdigit())
    return d.lstrip("0") or d


def find(q):
    """편명으로 항공기를 찾는다.

    ⚠️ IATA 편명(KE081)과 관제 호출부호(KAL081)는 다르다.
       adsb.lol 은 호출부호로 색인돼 있다. 그래서 순서대로 시도한다:
         1) 입력값 그대로            (KAL081 을 넣은 사람은 바로 맞는다)
         2) 숫자만 맞는 것을 걸러낸다 (KE081 → 081 → KAL081 을 찾아낸다)
       항공사 코드표를 우리가 들고 있지 않다 — 공개 데이터셋이 금방 낡아
       폐업 항공사 코드를 들고 있는 걸 실측으로 확인했기 때문이다.
    """
    raw = (q.get("num") or "").strip().upper().replace(" ", "")
    if not raw:
        return {"error": "need num"}, 400

    out, tried = [], []

    # 1) 입력값 그대로
    try:
        j = get(f"{API}/callsign/{urllib.parse.quote(raw)}")
        tried.append(raw)
        out = [row(a) for a in (j.get("ac") or []) if a.get("lat") is not None]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    # 2) 숫자가 같은 호출부호를 넓게 찾는다 (KE081 → 081)
    if not out:
        num = digits(raw)
        if num:
            # 항로 주변 조회로 후보를 모은다 (좌표를 주면 그 반경에서 찾는다)
            try:
                lat, lon = float(q.get("lat", 0)), float(q.get("lon", 0))
                dist = int(float(q.get("dist", 250)))
            except (TypeError, ValueError):
                lat = lon = 0.0
                dist = 250
            if lat or lon:
                j = get(f"{API}/lat/{lat}/lon/{lon}/dist/{dist}")
                tried.append(f"{lat},{lon} r{dist}km")
                for a in (j.get("ac") or []):
                    cs = (a.get("flight") or "").strip()
                    if cs and digits(cs) == num and a.get("lat") is not None:
                        out.append(row(a))

    return {"tried": tried, "found": len(out), "aircraft": out[:8],
            "attribution": ATTRIB}, 200


def track(q):
    hx = (q.get("hex") or "").strip().lower()
    if len(hx) != 6:
        return {"error": "need hex (6 chars)"}, 400
    j = get(f"{API}/hex/{hx}")
    ac = j.get("ac") or []
    return {"state": row(ac[0]) if ac else None, "attribution": ATTRIB}, 200


def trace(q):
    """전체 항적. 고도별로 색을 칠하려면 이게 있어야 한다.

    trace 배열 구조 (tar1090 형식, 실측):
      [시간오프셋(초), lat, lon, alt(또는 'ground'), gs, track, flags, ...]
      기준 시각은 timestamp (epoch 초).

    ⚠️ 점이 수백~수천 개다 (실측 767개). 그대로 보내면 응답이 커지고
       Cesium 도 무거워진다. 위치·고도 변화가 의미 있는 점만 남긴다.
    """
    hx = (q.get("hex") or "").strip().lower()
    if len(hx) != 6:
        return {"error": "need hex (6 chars)"}, 400

    j = get(f"{TRACE}/{hx[-2:]}/trace_full_{hx}.json", timeout=40)
    base = j.get("timestamp") or 0
    pts = []
    last = None
    for p in (j.get("trace") or []):
        if len(p) < 4 or p[1] is None or p[2] is None:
            continue
        alt = p[3]
        ground = alt == "ground"
        if not isinstance(alt, (int, float)):
            alt = 0 if ground else None
        rec = {
            "t": round(base + (p[0] or 0)),
            "lat": round(p[1], 5), "lon": round(p[2], 5),
            "altFt": alt,
            "alt": round(alt * 0.3048) if isinstance(alt, (int, float)) else None,
            "ground": ground,
        }
        # 성기게 만든다: 위치가 3km 이상 움직였거나 고도가 300m 이상 변했을 때만.
        # ⚠️ 첫 점과 마지막 점은 무조건 남긴다 — 출발지와 현재 위치다.
        if last is None:
            pts.append(rec)
        else:
            dlat = abs(rec["lat"] - last["lat"]) * 111.0
            dlon = abs(rec["lon"] - last["lon"]) * 111.0
            moved = (dlat * dlat + dlon * dlon) ** 0.5
            dalt = abs((rec["alt"] or 0) - (last["alt"] or 0))
            if moved >= 3.0 or dalt >= 300:
                pts.append(rec)
            else:
                continue
        last = rec

    orig = j.get("trace") or []
    if orig and pts and pts[-1]["t"] != round(base + (orig[-1][0] or 0)):
        p = orig[-1]
        if p[1] is not None:
            alt = p[3] if isinstance(p[3], (int, float)) else 0
            pts.append({"t": round(base + p[0]), "lat": round(p[1], 5),
                        "lon": round(p[2], 5), "altFt": alt,
                        "alt": round(alt * 0.3048), "ground": p[3] == "ground"})

    return {
        "hex": j.get("icao"), "reg": j.get("r"), "type": j.get("t"),
        "desc": j.get("desc"),
        "points": len(pts), "rawPoints": len(orig),
        "trace": pts,
        "attribution": ATTRIB,
    }, 200


def handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod") or "GET").upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": CORS, "body": ""}

    q = event.get("queryStringParameters") or {}
    mode = q.get("mode", "track")
    try:
        if mode == "find":
            body, code = find(q)
        elif mode == "trace":
            body, code = trace(q)
        else:
            body, code = track(q)
    except urllib.error.HTTPError as e:
        # 429 는 adsb.lol 이 나중에 도입할 수 있다고 예고한 것이다
        body, code = {"error": f"adsb.lol {e.code}",
                      "throttled": e.code == 429}, 502
    except Exception as e:                                   # noqa: BLE001
        print("[flight]", repr(e))
        body, code = {"error": str(e)}, 502

    # 항적은 잘 안 변하므로 좀 더 오래, 현재 위치는 짧게 캐시한다
    age = 120 if mode == "trace" else 20
    return {
        "statusCode": code,
        "headers": {**CORS, "Cache-Control": f"public, max-age={age}"},
        "body": json.dumps(body, ensure_ascii=False, separators=(",", ":")),
    }

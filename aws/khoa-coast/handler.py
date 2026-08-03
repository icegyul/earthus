# -*- coding: utf-8 -*-
"""연안 실측 — 이안류 지수(해수욕장 10곳) + 조위관측소(45곳)

받은 요청
  "여기 강릉쪽 파도가 점차 세저서 입수가 금지되는 해수욕장이 생기나봐"
  "각 해변 마다 이안류 파도가 나오면 거기 위치에 있는 이용자에게 알림 줄 수 있어?"

  → 그때는 자료가 없어서 못 만들었다. 이제 국립해양조사원 API 승인이 나서 만든다.
    실제로 지금(2026-08-04 00:45) **경포 해수욕장이 "위험"(지수 103)** 으로 들어온다.

■ 원본  공공데이터포털 / 해양수산부 국립해양조사원
    이안류  apis.data.go.kr/1192136/ripCurrent/GetRipCurrentApiService
              beachCode(대문자 영문) + date(YYYYMMDD) + resultType=json
    조위    apis.data.go.kr/1192136/dtRecent/GetDTRecentApiService
              obsCode(DT_00xx) + resultType=json

■⚠️⚠️ **주소를 찾는 데 애를 먹었다. 다음 사람을 위해 적어 둔다.**
    · 기능 이름이 **대문자로 시작**한다 (GetRipCurrentApiService).
      getRipCurrentIndex 같은 소문자 추측은 전부 NO_OPENAPI_SERVICE_ERROR 가 난다.
    · 그런데 **파라미터는 소문자**다 (obsCode, beachCode, resultType).
      ObsCode 로 보내면 "필수값 없음"이 뜬다 — 키가 틀린 게 아니라 대소문자다.
    · 해수욕장 코드는 문서(.hwp)에 있고 API 로는 못 얻는다.
      국립해양조사원 미리보기 화면의 select 에 박혀 있어서 그걸 그대로 옮겼다.

■⚠️ **이안류는 여름 한정이다.**
    해수욕장 개장 기간에만 관측한다. 겨울에 비어 있는 것은 고장이 아니다.
    → 비어 있을 때 "이안류 없음(안전)"으로 읽히면 안 된다. 화면에 그렇게 적는다.

■⚠️⚠️ **등급을 우리가 계산하지 않는다.**
    지수값(lastScr)과 등급(lastScrCn: 관심/주의/경계/위험)을 **둘 다 기관이 준다.**
    우리가 지수에 임계값을 붙여 등급을 다시 만들면, 기관과 다른 답을 낼 수 있다.
    → 등급은 받은 것을 그대로 쓴다. 임계값은 우리가 정하지 않는다.

■⚠️ **"들어가도 된다"고 말하지 않는다.**
    이안류 지수가 '관심'이어도 입수 가능 여부는 해수욕장 관리자가 정한다.
    우리는 관측값과 기관 등급만 옮긴다.

결과  s3://<CACHE_BUCKET>/events/coast-kr.json
"""

import json
import os
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
# ⚠️ 키는 코드에 두지 않는다. 환경변수로만 받는다.
KEY = os.environ["DATA_GO_KR_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "events/coast-kr.json"
RIP = "https://apis.data.go.kr/1192136/ripCurrent/GetRipCurrentApiService"
TIDE = "https://apis.data.go.kr/1192136/dtRecent/GetDTRecentApiService"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

# 이안류 관측 해수욕장 — 국립해양조사원이 지금 서비스하는 전부다.
# ⚠️ 열 곳뿐이다. 전국 해수욕장은 250곳이 넘는다. 나머지는 **자료가 없는 것**이지
#    안전한 것이 아니다. 화면에 반드시 그렇게 적는다.
BEACHES = {
    "GYEONGPO": "경포", "GORAEBUL": "고래불", "NAKSAN": "낙산",
    "DAECHON": "대천", "MANGSANG": "망상", "SOKCHO": "속초",
    "SONGJUNG": "송정", "IMRANG": "임랑", "JUNGMUN": "중문", "HAE": "해운대",
}

# 조위관측소 — DT_0001~DT_0080 을 훑어 응답이 오는 것만 남긴 결과다(2026-08-04 실측 45곳).
# ⚠️ 번호가 중간중간 비어 있다(0009·0015·0019…). 폐지되었거나 아직 없는 번호다.
#    seq(1,80) 을 매번 훑으면 35번의 헛호출이 생기므로 살아 있는 것만 적어 둔다.
TIDE_CODES = [
    "DT_0001", "DT_0002", "DT_0003", "DT_0004", "DT_0005", "DT_0006", "DT_0007",
    "DT_0008", "DT_0010", "DT_0011", "DT_0012", "DT_0013", "DT_0014", "DT_0016",
    "DT_0017", "DT_0018", "DT_0020", "DT_0021", "DT_0022", "DT_0023", "DT_0024",
    "DT_0025", "DT_0026", "DT_0027", "DT_0028", "DT_0029", "DT_0031", "DT_0032",
    "DT_0035", "DT_0037", "DT_0039", "DT_0042", "DT_0043", "DT_0044", "DT_0049",
    "DT_0050", "DT_0051", "DT_0052", "DT_0056", "DT_0057", "DT_0061", "DT_0062",
    "DT_0063", "DT_0065", "DT_0068",
]

# 등급을 세기 순으로 — 기관이 주는 네 글자를 그대로 쓴다.
# ⚠️ 이 표는 **정렬용**이지 판정용이 아니다. 판정은 기관이 이미 했다.
RANK = {"관심": 1, "주의": 2, "경계": 3, "위험": 4}


def get(url, params):
    q = urllib.parse.urlencode(params, safe="%")
    # ⚠️ serviceKey 는 이미 URL 인코딩된 문자열이다. urlencode 가 다시 인코딩하면
    #    %2B 가 %252B 가 되어 "등록되지 않은 키"가 된다. 그래서 따로 붙인다.
    req = urllib.request.Request(f"{url}?serviceKey={KEY}&{q}", headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def items(doc):
    """공공데이터포털은 결과가 1건일 때 리스트가 아니라 **객체 하나**를 준다.
    ⚠️ 이걸 안 맞추면 1건짜리 관측소만 조용히 사라진다."""
    b = doc.get("body") or {}
    it = (b.get("items") or {}).get("item")
    if it is None:
        return []
    return it if isinstance(it, list) else [it]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def sea(v):
    """수온·염분 전용. ⚠️⚠️ **0.00 은 "0도"가 아니라 "안 잰다"는 뜻이다.**

    실측(2026-08-04 08시): 45곳 중 17곳이 wtem 0.00 · slntQty 0.00 을 보낸다.
    묵호를 보면 기온 27.7 · 기압 1013.2 · 조위 37.0 은 정상인데 그 둘만 0.00 이다.
    → 수온 센서가 없는 관측소가 빈칸 대신 0.00 을 채워 보내는 것이다.

    ⚠️ 그대로 쓰면 **8월 동해가 0°C** 로 나온다. 바닷물은 -1.8°C 에서 언다.
       염분 0 은 민물이라는 뜻이라 바다에서는 더더욱 불가능하다.
    ⚠️ 기온(artmp)에는 이 규칙을 쓰지 않는다 — 겨울에 0.0°C 는 실제로 있다.
       바다 값에만 적용한다."""
    x = num(v)
    return None if x is None or x == 0.0 else x


def one_beach(code, ymd):
    """한 해수욕장의 오늘치. 5분 간격이라 하루 288건까지 온다 —
    ⚠️ 전부 내보내면 파일이 커진다. **가장 최근 값 + 오늘 최고 등급**만 남긴다."""
    try:
        # ⚠️⚠️ **numOfRows 를 반드시 넘긴다. 기본값이 10 이다.**
        #    안 넘기면 하루치 중 **맨 앞 10건(00:00~00:45)** 만 온다.
        #    정렬해서 마지막을 골라도 그건 **자정 값**이다 —
        #    아침 8시에 "지금 위험"이라며 자정 등급을 보여주게 된다.
        #    오류도 안 나고, 값도 그럴듯해서 **눈으로는 절대 안 걸린다.**
        #    (실제로 그렇게 배포됐다가 화면의 '오래됨' 검사에서 잡혔다)
        #    5분 간격 × 하루 = 288건이라 300 이면 하루가 다 들어온다.
        d = get(RIP, {"beachCode": code, "date": ymd, "resultType": "json",
                      "numOfRows": 300, "pageNo": 1})
    except Exception as e:                                       # noqa: BLE001
        print(f"[coast] 이안류 {code} 실패: {str(e)[:60]}")
        return None
    rows = items(d)
    if not rows:
        return None
    rows.sort(key=lambda x: x.get("obsrvnDt") or "")
    last = rows[-1]
    # 오늘 가장 높았던 등급 — "아까 위험했다"가 지금 '관심'에 가려지면 안 된다.
    worst, worst_at = None, None
    for r in rows:
        g = r.get("lastScrCn")
        if g and RANK.get(g, 0) > RANK.get(worst or "", 0):
            worst, worst_at = g, r.get("obsrvnDt")
    return {
        "id": code, "ko": BEACHES.get(code, code),
        "name": last.get("obsvtrNm"),
        "lat": num(last.get("lat")), "lon": num(last.get("lot")),
        "at": last.get("obsrvnDt"),
        "score": num(last.get("lastScr")),
        "grade": last.get("lastScrCn"),
        "gradeRank": RANK.get(last.get("lastScrCn") or "", 0),
        "waveM": num(last.get("wvhgt")), "wavePeriodS": num(last.get("wvpd")),
        "seaTempC": sea(last.get("wtem")), "airTempC": num(last.get("artmp")),
        "windDir": last.get("wndrct"), "windMs": num(last.get("wspd")),
        "todayWorst": worst, "todayWorstAt": worst_at,
        "samples": len(rows),
    }


def one_tide(code):
    try:
        d = get(TIDE, {"obsCode": code, "resultType": "json"})
    except Exception as e:                                       # noqa: BLE001
        print(f"[coast] 조위 {code} 실패: {str(e)[:60]}")
        return None
    rows = items(d)
    if not rows:
        return None
    r = rows[0]
    return {
        "id": code, "name": r.get("obsvtrNm"),
        "lat": num(r.get("lat")), "lon": num(r.get("lot")),
        "at": r.get("obsrvnDt"),
        # ⚠️ 조위는 cm 로 온다. m 로 바꾸지 않는다 — 기관 표기가 cm 이고,
        #    바꾸면 다른 곳에서 본 숫자와 어긋난다.
        "tideCm": num(r.get("bscTdlvHgt")),
        "seaTempC": sea(r.get("wtem")), "airTempC": num(r.get("artmp")),
        "salinityPsu": sea(r.get("slntQty")),
        "pressureHpa": num(r.get("atmpr")),
        "windMs": num(r.get("wspd")), "windDir": num(r.get("wndrct")),
        "gustMs": num(r.get("maxMmntWspd")),
    }


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)
    ymd = now.strftime("%Y%m%d")

    # ⚠️ 55곳을 순서대로 부르면 25초 × 55 = 최악 20분이다. Lambda 가 먼저 끊긴다.
    #    동시에 부르되 8개로 묶는다 — 개발계정 트래픽(10,000/일)도 아껴야 한다.
    with ThreadPoolExecutor(max_workers=8) as ex:
        beaches = [b for b in ex.map(lambda c: one_beach(c, ymd), BEACHES) if b]
        # 오늘 자료가 아직 없으면(자정 직후) 어제로 한 번 더 — 비수기와 구분해야 한다.
        if not beaches:
            y = (now - timedelta(days=1)).strftime("%Y%m%d")
            beaches = [b for b in ex.map(lambda c: one_beach(c, y), BEACHES) if b]
        tides = [t for t in ex.map(one_tide, TIDE_CODES) if t]

    beaches.sort(key=lambda b: (-(b.get("gradeRank") or 0), b["ko"]))
    warn = [b for b in beaches if (b.get("gradeRank") or 0) >= 3]      # 경계·위험

    doc = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "generatedKst": now.strftime("%Y-%m-%d %H:%M"),
        "rip": {
            "count": len(beaches), "watched": len(BEACHES),
            "warnCount": len(warn),
            "warnNames": [b["ko"] for b in warn],
            "beaches": beaches,
        },
        "tide": {"count": len(tides), "stations": tides},
        "sources": [{
            "id": "KHOA", "ko": "해양수산부 국립해양조사원",
            "en": "Korea Hydrographic and Oceanographic Agency",
            "license": "공공누리 제1유형 (출처표시)",
            "via": "공공데이터포털 (data.go.kr)",
        }],
        "note": {
            "ko": (
                f"국립해양조사원이 5분마다 재는 값입니다. 이안류 {len(beaches)}곳 · "
                f"조위·수온 {len(tides)}곳.\n"
                "⚠️⚠️ 이안류를 재는 해수욕장은 **전국에서 10곳뿐입니다.** "
                "나머지 해수욕장이 비어 있는 것은 자료가 없는 것이지 "
                "이안류가 없다는 뜻이 **아닙니다.**\n"
                "⚠️ 이안류 관측은 **해수욕장 개장 기간에만** 합니다. "
                "겨울에 비어 있는 것은 고장이 아닙니다.\n"
                "⚠️ 등급(관심·주의·경계·위험)은 **국립해양조사원이 매긴 것**을 그대로 옮깁니다. "
                "저희가 지수에 기준을 붙여 다시 계산하지 않습니다.\n"
                "⚠️⚠️ 저희는 **들어가도 되는지 판단하지 않습니다.** "
                "입수 통제는 해수욕장 관리 주체가 정합니다. 현장 안내를 따르세요."
            ),
            "en": (
                "Observed every 5 minutes by KHOA. "
                "⚠️ Rip-current index covers only 10 beaches nationwide — an empty beach "
                "means no data, not no rip current. Measured during the bathing season only. "
                "Grades are KHOA's own; we do not re-derive them. "
                "We never advise whether it is safe to enter the water."
            ),
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=180")
    print(f"[coast] 이안류 {len(beaches)}곳(경계이상 {len(warn)}: {[b['ko'] for b in warn]}) · "
          f"조위 {len(tides)}곳 · {len(body)/1024:.0f}KB")
    return {"ok": bool(beaches or tides), "rip": len(beaches),
            "warn": [b["ko"] for b in warn], "tide": len(tides)}

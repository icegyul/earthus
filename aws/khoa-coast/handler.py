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


def get(url, params, timeout=25):
    q = urllib.parse.urlencode(params, safe="%")
    # ⚠️ serviceKey 는 이미 URL 인코딩된 문자열이다. urlencode 가 다시 인코딩하면
    #    %2B 가 %252B 가 되어 "등록되지 않은 키"가 된다. 그래서 따로 붙인다.
    req = urllib.request.Request(f"{url}?serviceKey={KEY}&{q}", headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
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


# ═══════════════════════════════════════════════════════════════════
# 정적 수집 2종 (2026-09-02 추가) — 연안 침수 범위 + 미래 해수면 상승 전망
#
# 이안류·조위와 달리 이 둘은 **바뀌지 않는 참조자료**다.
# 15분 스케줄에 태우면 트래픽만 태우므로, 수동 이벤트로만 돈다:
#   aws lambda invoke --payload '{"khoaFlood":true}'    → ocean/khoa/flood/*.json
#   ⚠️ 버킷 공개 정책은 app/celestrak/clouds/wind/events/ocean/solar 접두어뿐이다.
#      khoa/ 에 쓰면 Lambda 는 성공하는데 브라우저는 403 을 본다(실측 2026-09-02).
#      그래서 ocean/khoa/ 아래에 둔다.
#   aws lambda invoke --payload '{"khoaSealevel":true}' → ocean/khoa/sealevel-kr.json
#
# ■ 주소·규약 (앞사람의 메모 덕에 헤매지 않았다 — 이어서 적는다)
#   침수    waterlogged/GetWaterloggedApiService        sggCd(5자리)+type=json
#   해수면  changeClimateRising/GetChangeClimateRisingApiService
#           ymin/ymax/xmin/xmax + type=json — ⚠️ 미리보기 검증은 1도×1도 제한
#   ⚠️ 이 두 API 의 형식 파라미터는 resultType 이 아니라 **type** 이다.
#     (이안류·조위는 resultType — 같은 기관인데 API 마다 다르다)
#
# ■ 시군구코드는 API 로 못 얻는다 — KHOA 미리보기 화면(odmiApiViewData.do,
#   apiId=SV_AP_01_010)의 data-list 에 박힌 70곳을 그대로 옮겼다(2026-09-02).
#   ⚠️ 이 70곳이 기관이 서비스하는 전부다. 강원 동해안이 아예 없다 —
#     빠진 곳은 자료가 없는 것이지 침수가 없다는 뜻이 아니다. 화면에 적는다.
# ═══════════════════════════════════════════════════════════════════

FLOOD_URL = "https://apis.data.go.kr/1192136/waterlogged/GetWaterloggedApiService"
RISE_URL = "https://apis.data.go.kr/1192136/changeClimateRising/GetChangeClimateRisingApiService"

FLOOD_SGG = {
    "26110": "부산 중구", "26140": "부산 서구", "26170": "부산 동구",
    "26200": "부산 영도구", "26230": "부산 부산진구", "26290": "부산 남구",
    "26350": "부산 해운대구", "26380": "부산 사하구", "26440": "부산 강서구",
    "26500": "부산 수영구", "26710": "부산 기장군",
    "28110": "인천 중구", "28140": "인천 동구", "28185": "인천 연수구",
    "28200": "인천 남동구", "28260": "인천 서구", "28710": "인천 강화군", "28720": "인천 옹진군",
    "31110": "울산 중구", "31140": "울산 남구", "31170": "울산 동구",
    "31200": "울산 북구", "31710": "울산 울주군",
    "41220": "평택시", "41273": "안산시 단원구", "41390": "시흥시",
    "41570": "김포시", "41590": "화성시",
    "44180": "보령시", "44200": "아산시", "44210": "서산시", "44270": "당진시",
    "44770": "서천군", "44800": "홍성군", "44825": "태안군",
    "46110": "목포시", "46130": "여수시", "46150": "순천시", "46230": "광양시",
    "46770": "고흥군", "46780": "보성군", "46800": "장흥군", "46810": "강진군",
    "46820": "해남군", "46830": "영암군", "46840": "무안군", "46860": "함평군",
    "46870": "영광군", "46890": "완도군", "46900": "진도군", "46910": "신안군",
    "47130": "경주시",
    "48121": "창원 의창구", "48123": "창원 성산구", "48125": "창원 마산합포구",
    "48127": "창원 마산회원구", "48129": "창원 진해구",
    "48220": "통영시", "48240": "사천시", "48310": "거제시",
    "48820": "경남 고성군", "48840": "남해군", "48850": "하동군",
    "50110": "제주시", "50130": "서귀포시",
    "52130": "군산시", "52210": "김제시", "52790": "고창군", "52800": "부안군",
}


def wkt_multipolygon(s):
    """WKT MULTIPOLYGON → [[링(평탄 [lon,lat,...])...], ...]. 좌표는 6자리로 줄인다.
    정식 파서를 안 쓰는 이유: Lambda 의존성을 안 늘리려고.
    이 소스의 WKT 는 단일 기관 산출물이라 형식이 균일하다 — 그때만 허용되는 지름길."""
    s = s.strip()
    if not s.upper().startswith("MULTIPOLYGON"):
        return None
    body = s[s.find("((("):].strip()
    polys = []
    for poly_txt in body.strip("() ").split(")),(("):
        rings = []
        for ring_txt in poly_txt.split("),("):
            flat = []
            for pair in ring_txt.replace("(", "").replace(")", "").split(","):
                xy = pair.split()
                if len(xy) >= 2:
                    try:
                        flat.append(round(float(xy[0]), 6))
                        flat.append(round(float(xy[1]), 6))
                    except ValueError:
                        return None
            if len(flat) >= 6:
                rings.append(flat)
        if rings:
            polys.append(rings)
    return polys or None


def get_retry(url, params, tries=3, timeout=25):
    """data.go.kr 게이트웨이는 간헐적으로 SSL 핸드셰이크가 늦다(실측 2026-09-02:
    6개 동시 호출 중 1개가 25초 타임아웃). 한 번 실패로 전체를 버리지 않고 물러났다 다시 간다."""
    import time
    last = None
    for i in range(tries):
        try:
            return get(url, params, timeout=timeout)
        except Exception as e:                                   # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def _put(key, doc, cache="public, max-age=86400"):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl=cache)
    return len(body)


FLOOD_PAGE = 60


def collect_flood(codes=None):
    """연안 침수 범위 — 시군구별 파일 + 색인. 폴리곤은 받은 좌표 그대로(6자리 반올림만).
    codes 를 주면 그 시군구만 받고 색인은 S3 의 기존 색인과 합친다 —
    70곳을 한 번에 받으면 Lambda 시간(최대 15분)을 넘길 수 있어 10곳씩 나눠 부른다."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    index = []
    targets = [c for c in (codes or list(FLOOD_SGG)) if c in FLOOD_SGG]

    def one_sgg(code):
        rows = []
        page = 1
        while True:
            # ⚠️⚠️ 폴리곤 응답은 크다 — 해운대 199면이 약 6MB. 300건/25초로 받으면 전부 타임아웃이다
            #    (실측 2026-09-02: 70곳 전부 실패). 60건씩, 120초로 받는다.
            d = get_retry(FLOOD_URL, {"sggCd": code, "type": "json",
                                      "numOfRows": FLOOD_PAGE, "pageNo": page}, timeout=120)
            body = d.get("body") or {}
            got = items(d)
            rows += got
            total = int(body.get("totalCount") or 0)
            if page * FLOOD_PAGE >= total or not got:
                return rows, total
            page += 1

    def build(code):
        try:
            rows, total = one_sgg(code)
        except Exception as e:                                   # noqa: BLE001
            print(f"[flood] {code} {FLOOD_SGG[code]} 실패: {str(e)[:80]}")
            return None
        feats = []
        classes = {}
        b = [180.0, 90.0, -180.0, -90.0]
        for r in rows:
            geom = wkt_multipolygon(r.get("geom") or "")
            if not geom:
                continue
            cls = (r.get("flodVlCn") or "").strip()
            classes[cls] = classes.get(cls, 0) + 1
            for poly in geom:
                ring = poly[0]
                xs = ring[0::2]
                ys = ring[1::2]
                b = [min(b[0], min(xs)), min(b[1], min(ys)),
                     max(b[2], max(xs)), max(b[3], max(ys))]
            feats.append({"v": cls, "g": geom})
        if not feats:
            print(f"[flood] {code} {FLOOD_SGG[code]}: 자료 없음(total {total})")
            return {"sggCd": code, "name": FLOOD_SGG[code], "count": 0}
        size = _put(f"ocean/khoa/flood/{code}.json", {
            "generated": now, "sggCd": code, "name": FLOOD_SGG[code],
            "unit": "m (침수 깊이 구간)", "count": len(feats), "classes": classes,
            "bbox": [round(x, 5) for x in b],
            "source": "해양수산부 국립해양조사원 연안 침수 정보 (공공데이터포털)",
            "license": "공공누리 (출처표시)",
            "features": feats,
        })
        print(f"[flood] {code} {FLOOD_SGG[code]}: {len(feats)}면 · {size//1024}KB")
        return {"sggCd": code, "name": FLOOD_SGG[code], "count": len(feats),
                "classes": classes, "bbox": [round(x, 5) for x in b]}

    with ThreadPoolExecutor(max_workers=4) as ex:
        for rec in ex.map(build, targets):
            if rec:
                index.append(rec)

    # 부분 호출이면 기존 색인과 합친다 (같은 시군구는 새 결과로 덮는다)
    if codes:
        try:
            prev = json.loads(s3.get_object(Bucket=BUCKET, Key="ocean/khoa/flood-index.json")["Body"].read())
            done = {r["sggCd"] for r in index}
            index = [r for r in (prev.get("districts") or []) if r.get("sggCd") not in done] + index
        except Exception:                                        # noqa: BLE001
            pass
    index.sort(key=lambda r: r["sggCd"])

    covered = [r for r in index if r["count"]]
    _put("ocean/khoa/flood-index.json", {
        "generated": now,
        "districts": index,
        "coveredCount": len(covered),
        "totalPolygons": sum(r["count"] for r in index),
        "source": "해양수산부 국립해양조사원 연안 침수 정보 (공공데이터포털 data.go.kr)",
        "license": "공공누리 (출처표시)",
        "note": ("기관이 제공하는 연안 시군구 70곳만 담겨 있습니다. "
                 "여기 없는 지역(강원 동해안 등)은 자료가 없는 것이지 "
                 "침수 위험이 없다는 뜻이 아닙니다. 침수값은 깊이 구간(m)이며 "
                 "기관 산출값을 그대로 옮깁니다."),
    })
    print(f"[flood] 색인 {len(index)}곳 (자료 있는 곳 {len(covered)})")
    return {"ok": True, "districts": len(index), "covered": len(covered)}


def collect_sealevel():
    """미래 해수면 상승 전망 — 1도 타일로 전 해역을 긁어 시나리오·지표별로 묶는다."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")

    def one_box(box):
        y0, x0 = box
        rows = []
        page = 1
        while True:
            d = get_retry(RISE_URL, {"ymin": y0, "ymax": y0 + 1, "xmin": x0, "xmax": x0 + 1,
                               "type": "json", "numOfRows": 300, "pageNo": page})
            body = d.get("body") or {}
            got = items(d)
            rows += got
            total = int(body.get("totalCount") or 0)
            if page * 300 >= total or not got:
                return rows
            page += 1

    boxes = [(y, x) for y in range(32, 39) for x in range(124, 132)]
    groups = {}
    failed = []

    def safe_box(box):
        try:
            return box, one_box(box)
        except Exception as e:                                   # noqa: BLE001
            print(f"[sealevel] 타일 {box} 실패: {str(e)[:80]}")
            return box, None

    with ThreadPoolExecutor(max_workers=4) as ex:
        for box, rows in ex.map(safe_box, boxes):
            if rows is None:
                failed.append(list(box))
                continue
            for r in rows:
                ssp = r.get("sspSeCd")
                ind = r.get("swtrsfPredcSeCd")
                lat = r.get("lat")
                lon = r.get("lot")
                val = r.get("svyVlCnt")
                if None in (ssp, ind, lat, lon, val):
                    continue
                g = groups.setdefault((ssp, ind), {})
                # 타일 경계가 겹칠 수 있어 좌표로 중복을 없앤다
                g[(round(float(lat), 5), round(float(lon), 5))] = round(float(val), 3)

    out = []
    for (ssp, ind), pts in sorted(groups.items()):
        lats = []
        lons = []
        vals = []
        for (la, lo), v in sorted(pts.items()):
            lats.append(la)
            lons.append(lo)
            vals.append(v)
        out.append({"ssp": ssp, "indicator": ind, "count": len(vals),
                    "lat": lats, "lon": lons, "val": vals,
                    "min": min(vals), "max": max(vals)})
        print(f"[sealevel] {ssp} {ind}: {len(vals)}점 · {min(vals):.1f}~{max(vals):.1f}")

    size = _put("ocean/khoa/sealevel-kr.json", {
        "generated": now,
        "source": "해양수산부 국립해양조사원 — 지역 해양기후 수치모델 기반 미래 해수면 상승 전망",
        "via": "공공데이터포털 (data.go.kr)",
        "license": "공공누리 (출처표시)",
        "grid": "약 0.05° 해역 격자 · 한국 주변(위도 32~39, 경도 124~132)",
        "valueNote": "svyVlCnt 원값 그대로 — 단위·기준연도는 기관 명세(활용가이드) 기준",
        "tilesTotal": len(boxes),
        "tilesFailed": failed,            # 비어 있지 않으면 그 구역은 자료가 빠진 것 — 화면에 밝힌다
        "groups": out,
    })
    print(f"[sealevel] 그룹 {len(out)}개 · {size//1024}KB")
    return {"ok": bool(out), "groups": len(out), "failedTiles": len(failed),
            "counts": {f"{g['ssp']}/{g['indicator']}": g["count"] for g in out}}


_orig_handler = handler


def handler(event=None, context=None):                            # noqa: F811
    if isinstance(event, dict) and event.get("khoaFlood"):
        return collect_flood(event.get("codes"))
    if isinstance(event, dict) and event.get("khoaSealevel"):
        return collect_sealevel()
    return _orig_handler(event, context)

# -*- coding: utf-8 -*-
"""대기질 실측 — 에어코리아 673개 측정소 (한국환경공단)

왜 만들었나
  ⚠️ 지금 화면의 대기질은 유럽 CAMS **모델값**이다. 계산해서 만든 값이다.
     이 앱은 부이 파고도, 산 기온도, 늘 **실측을 앞세워** 왔다.
     대기질만 모델값인 것이 오히려 어긋나 있었다.
  → 한국 측정소가 **실제로 잰 값**을 가져온다. 모델을 대체하는 게 아니라 **앞에 세운다** —
     모델은 전 지구를 덮고, 실측은 정확하지만 한국뿐이다. 둘 다 필요하다.

■ 원본  apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty
          serviceKey, returnType=json, sidoName=전국, ver=1.3, numOfRows
        ⚠️ `sidoName=전국` 한 번이면 673곳이 다 온다. 시도별로 17번 부를 필요가 없다.
        ⚠️ ver=1.3 을 빼면 PM2.5 항목이 응답에서 통째로 빠진다. 오류는 안 난다.

■⚠️⚠️ **좌표는 별도 API 다** — MsrstnInfoInqireSvc/getMsrstnList (2026-08-04 승인됨)
   그 전에는 호출하면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 였다.
   ⚠️ 키가 틀린 게 아니라 **그 API 를 신청 안 한 것**이다. 메시지가 헷갈리게 돼 있다.

■⚠️⚠️⚠️ **dmX 가 위도, dmY 가 경도다. 이름이 반대로 읽힌다.**
     dmX "36.928577"   ← 위도
     dmY "127.6886158" ← 경도
   X 를 경도로 읽는 것이 상식이라 그대로 쓰기 쉬운데, 그러면 **측정소 673곳이
   전부 적도 근처 바다에 찍힌다.** 오류는 안 난다 — 지도만 조용히 틀린다.
   확인법: 음성읍은 충북이니 위도 36.9 · 경도 127.7 이어야 맞다.
   ⚠️ TM 좌표가 아니라 이미 WGS84 십진도라서 변환은 필요 없다
      (근접측정소 API 쪽이 TM 이다. 헷갈리지 말 것).

■⚠️ **등급을 우리가 계산하지 않는다.**
   khaiGrade / pm10Grade / pm25Grade (1~4) 를 환경부가 이미 매겨서 준다.
   농도에 우리가 임계값을 붙이면 환경부 발표와 다른 답이 나온다.

■⚠️ 결측 표기가 특이하다
   값이 "-" 또는 null 이고, Flag 에 사유("점검및교정","자료이상")가 들어온다.
   ⚠️ "-" 를 0 으로 읽으면 **고장난 측정소가 제일 깨끗한 곳이 된다.**

■⚠️ dataTime 에 "24:00" 이 온다
   자정을 전날 24시로 적는다. 파이썬 datetime 은 24시를 못 읽는다 —
   숫자로 다시 만들지 말고 **문자열 그대로** 내보낸다.

결과  s3://<CACHE_BUCKET>/wind/korea-air-obs.json
      ⚠️⚠️ `air/` 가 아니다. 버킷의 **공개 접두어 목록은 정책에 박혀 있고** app·clouds·
         wind·events 뿐이다. air/ 로 올리면 파일은 만들어지는데 화면에서 **403** 이 난다
         (실제로 그렇게 막혔다 — 오류가 아니라 조용한 접근 거부다).
         대기 격자(CAMS)도 같은 이유로 wind/air.json 에 있다.
"""

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ["DATA_GO_KR_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/korea-air-obs.json"
URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty"
STN = "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

# 환경부 통합대기환경지수 등급. ⚠️ 이름만 옮긴다 — 경계값은 우리가 정하지 않는다.
GRADE_KO = {"1": "좋음", "2": "보통", "3": "나쁨", "4": "매우 나쁨"}
GRADE_EN = {"1": "Good", "2": "Moderate", "3": "Unhealthy", "4": "Very unhealthy"}


def num(v):
    """⚠️ 결측이 "-" 로 온다. 0 으로 읽으면 고장난 곳이 가장 깨끗해진다."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "-", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def get(url, params, tries=3):
    """⚠️⚠️ **공공데이터포털은 간헐적으로 504 를 낸다.** 우리 잘못이 아니고,
    같은 요청을 몇 초 뒤에 다시 보내면 대개 된다.
    → 재시도가 없으면 하루 24번 도는 중 몇 번이 통째로 실패하고,
      화면에는 옛 값이 그대로 남아 아무도 모른다. (실제로 배포 중에 한 번 맞았다)"""
    q = urllib.parse.urlencode(params)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(f"{url}?serviceKey={KEY}&{q}", headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:                                   # noqa: BLE001
            last = e
            if i < tries - 1:
                # 2초 → 5초. 포털이 붐빌 때 바로 다시 때리면 같이 막힌다.
                time.sleep(2 + 3 * i)
    raise last


def page(n, rows=100):
    d = get(URL, {"returnType": "json", "numOfRows": rows, "pageNo": n,
                  "sidoName": "전국", "ver": "1.3"})
    body = (d.get("response") or {}).get("body") or {}
    return body.get("items") or [], body.get("totalCount")


def fetch():
    """⚠️⚠️ numOfRows=1000 으로 한 번에 받으면 **504 Gateway Timeout** 이 난다.
    (673곳뿐인데도 그렇다. 실제로 그렇게 막혔다.)
    포털 게이트웨이가 응답을 다 못 만들고 끊는 것이지 우리 timeout 이 아니다.
    → 100줄씩 나눠 받는다. 7번이면 끝난다."""
    out, total, n = [], None, 1
    while n <= 20:                              # 넉넉한 상한 — 무한루프 방지
        items, total = page(n)
        if not items:
            break
        out.extend(items)
        if total and len(out) >= int(total):
            break
        n += 1
    return out, total


def stations_xy():
    """측정소 좌표표. {측정소명: (위도, 경도, 주소)}

    ⚠️⚠️ **dmX 가 위도, dmY 가 경도다.** 파일 맨 위 주석 참고.
    ⚠️ 여기도 numOfRows 를 크게 잡으면 504 가 난다. 100줄씩 받는다.
    ⚠️ 실패해도 **전체를 죽이지 않는다** — 좌표만 없는 채로 값은 나가는 게 낫다.
    """
    out, n = {}, 1
    while n <= 15:
        d = get(STN, {"returnType": "json", "numOfRows": 100, "pageNo": n})
        items = ((d.get("response") or {}).get("body") or {}).get("items") or []
        if not items:
            break
        for s in items:
            lat, lon = num(s.get("dmX")), num(s.get("dmY"))
            # ⚠️ 한반도 밖 값은 버린다. 좌표가 비었거나 뒤바뀐 행이 섞이면
            #    지도에 엉뚱한 점 하나가 찍히는데, 그게 제일 눈에 띄고 제일 창피하다.
            if lat is None or lon is None:
                continue
            if not (32.0 <= lat <= 39.5 and 124.0 <= lon <= 132.5):
                print(f"[air-kr] ⚠️ 범위 밖 좌표 버림: {s.get('stationName')} {lat},{lon}")
                continue
            out[s.get("stationName")] = (lat, lon, s.get("addr"))
        n += 1
    return out


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)
    rows, total = fetch()

    # ⚠️ 좌표를 못 받아도 값은 내보낸다. 좌표는 "있으면 좋은 것"이지 전제가 아니다.
    try:
        xy = stations_xy()
    except Exception as e:                                       # noqa: BLE001
        xy = {}
        print(f"[air-kr] ⚠️ 좌표표 실패 — 지도 표시 없이 진행: {str(e)[:120]}")

    stations, by_sido, nogeo = [], {}, []
    for r in rows:
        name = r.get("stationName")
        pos = xy.get(name)
        st = {
            "name": name, "sido": r.get("sidoName"),
            "kind": r.get("mangName"),          # 도시대기 / 도로변대기 / 교외대기 …
            "at": r.get("dataTime"),            # ⚠️ "24:00" 이 있어 문자열 그대로 둔다
            "pm10": num(r.get("pm10Value")), "pm25": num(r.get("pm25Value")),
            "pm10_24h": num(r.get("pm10Value24")), "pm25_24h": num(r.get("pm25Value24")),
            "o3": num(r.get("o3Value")), "no2": num(r.get("no2Value")),
            "co": num(r.get("coValue")), "so2": num(r.get("so2Value")),
            "khai": num(r.get("khaiValue")),
            # 등급은 환경부가 매긴 것. 우리는 이름만 붙인다.
            "grade": r.get("khaiGrade"),
            "gradeKo": GRADE_KO.get(str(r.get("khaiGrade") or "")),
            "pm10Grade": r.get("pm10Grade"), "pm25Grade": r.get("pm25Grade"),
        }
        # 결측 사유가 있으면 남긴다 — "왜 비었나"를 말할 수 있어야 한다.
        flags = {k[:-4]: r.get(k) for k in
                 ("pm10Flag", "pm25Flag", "o3Flag", "no2Flag", "coFlag", "so2Flag")
                 if r.get(k)}
        if flags:
            st["flags"] = flags
        if pos:
            st["lat"], st["lon"] = pos[0], pos[1]
            # ⚠️ 주소를 넣는 이유: "우리 동네 측정소가 어디 있나"가 실제로 중요하다.
            #    도로변 측정소는 원래 높게 나오는데, 주소를 보면 그게 설명된다.
            st["addr"] = pos[2]
        else:
            # ⚠️ 좌표가 없는 측정소를 **조용히 버리지 않는다.** 값은 그대로 쓰되
            #    지도에만 안 찍고, 몇 곳이 그런지 밝힌다.
            nogeo.append(name)
        stations.append(st)
        by_sido.setdefault(st["sido"], []).append(st)

    sidos = []
    for name, xs in by_sido.items():
        pm25 = [x["pm25"] for x in xs]
        pm10 = [x["pm10"] for x in xs]
        # ⚠️ 평균과 함께 **몇 곳에서 쟀는지(n)** 를 반드시 같이 낸다.
        #    2곳 평균과 40곳 평균을 같은 굵기로 말하면 안 된다.
        worst = max((x for x in xs if x["pm25"] is not None),
                    key=lambda x: x["pm25"], default=None)
        sidos.append({
            "sido": name,
            "n": len(xs),
            "nPm25": sum(1 for v in pm25 if v is not None),
            "nPm10": sum(1 for v in pm10 if v is not None),
            "pm25": mean(pm25), "pm10": mean(pm10),
            "pm25Max": max([v for v in pm25 if v is not None], default=None),
            "pm10Max": max([v for v in pm10 if v is not None], default=None),
            "worstStation": worst["name"] if worst else None,
        })
    sidos.sort(key=lambda x: -(x["pm25"] or -1))

    have25 = sum(1 for s in stations if s["pm25"] is not None)
    have10 = sum(1 for s in stations if s["pm10"] is not None)
    at = next((s["at"] for s in stations if s["at"]), None)

    doc = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedKst": at,
        "count": len(stations), "totalCount": total,
        "have": {"pm25": have25, "pm10": have10},
        "sido": sidos,
        "stations": stations,
        # ⚠️ 좌표 유무를 **자료 안에** 적는다. 화면이 이걸 보고 지도 표시를 켠다.
        "hasCoordinates": bool(xy),
        "located": len(stations) - len(nogeo),
        # ⚠️ 좌표를 못 찾은 측정소 이름을 남긴다. 조용히 사라지면 원인을 못 찾는다.
        "noCoordinates": nogeo[:20] or None,
        "noCoordinatesCount": len(nogeo),
        "sources": [{
            "id": "AirKorea", "ko": "한국환경공단 에어코리아",
            "en": "Korea Environment Corporation — AirKorea",
            "license": "공공누리 제1유형 (출처표시)",
            "via": "공공데이터포털 (data.go.kr)",
        }],
        "note": {
            "ko": (
                f"전국 측정소 {len(stations)}곳이 **실제로 잰 값**입니다 "
                f"(초미세먼지 {have25}곳 · 미세먼지 {have10}곳, {at} 기준).\n"
                "⚠️ 지도의 대기질 색은 유럽 CAMS **모델값**이고, 이 숫자는 **실측**입니다. "
                "둘이 다를 수 있습니다 — 모델은 전 지구를 덮고, 실측은 정확하지만 한국뿐입니다.\n"
                + (f"⚠️ 좌표를 아는 측정소는 {len(stations) - len(nogeo)}곳이라, "
                   f"나머지 {len(nogeo)}곳은 값은 있지만 지도에 찍지 않습니다.\n"
                   if nogeo else "")
                + "⚠️ 시도 값은 **그 안 측정소들의 평균**입니다. 몇 곳에서 쟀는지(n)를 함께 적습니다. "
                "도로변 측정소는 원래 높게 나옵니다.\n"
                "⚠️ 등급(좋음·보통·나쁨·매우 나쁨)은 **환경부가 매긴 것**을 그대로 옮깁니다.\n"
                "⚠️ 값이 비어 있는 곳은 점검 중이거나 자료가 이상한 곳입니다. 0 이 아닙니다."
            ),
            "en": (
                f"Measured — not modelled — at {len(stations)} stations nationwide "
                f"({at} KST). The map's air layer is the European CAMS model; these are "
                "ground measurements, so they can disagree. Station coordinates are not "
                "yet available to us, so these are grouped by province only. Grades are "
                "the Ministry of Environment's own. Blank means the station is offline, "
                "not zero."
            ),
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=600")
    top = sidos[0] if sidos else {}
    print(f"[air-kr] {len(stations)}곳 · {at} · PM2.5 최고 시도 "
          f"{top.get('sido')} {top.get('pm25')} (n={top.get('nPm25')}) · {len(body)/1024:.0f}KB")
    return {"ok": bool(stations), "count": len(stations), "observedKst": at,
            "have": doc["have"]}

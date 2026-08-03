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

■⚠️⚠️ **측정소 좌표를 이 API 는 주지 않는다.**
   좌표는 별도 API(MsrstnInfoInqireSvc)이고 **아직 활용신청이 안 됐다** —
   호출하면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다(키 문제가 아니라 신청 문제).
   → 그래서 지금은 **지도에 점으로 찍지 않는다.** 시도 단위로 묶어서만 보여준다.
     승인이 나면 여기에 좌표를 붙이고 점으로 찍으면 된다. 그 전에 시청 좌표 같은 걸
     끼워 넣지 않는다 — 측정소는 시청에 있지 않다.

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


def page(n, rows=100):
    q = urllib.parse.urlencode({
        "returnType": "json", "numOfRows": rows, "pageNo": n,
        "sidoName": "전국", "ver": "1.3",
    })
    req = urllib.request.Request(f"{URL}?serviceKey={KEY}&{q}", headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        d = json.loads(r.read().decode("utf-8"))
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


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)
    rows, total = fetch()

    stations, by_sido = [], {}
    for r in rows:
        st = {
            "name": r.get("stationName"), "sido": r.get("sidoName"),
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
        # ⚠️ 좌표가 없다는 사실을 **자료 안에** 적는다. 화면이 이걸 보고 지도 표시를 끈다.
        "hasCoordinates": False,
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
                "⚠️⚠️ 측정소 **좌표를 아직 못 받아서 지도에 점으로 찍지 못합니다.** "
                "시도 단위로만 묶어 보여줍니다. (측정소 위치 API 승인 대기 중)\n"
                "⚠️ 시도 값은 **그 안 측정소들의 평균**입니다. 몇 곳에서 쟀는지(n)를 함께 적습니다. "
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

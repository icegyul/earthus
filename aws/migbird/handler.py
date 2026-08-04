# -*- coding: utf-8 -*-
"""철새 이동 정보 — 우리 동네 오리가 봄에 어디로 가나.

농림축산식품부 농림축산검역본부 역학조사과.
⚠️ 이용허락범위 **제한 없음** — 가공해도 되고 분석 문장을 만들어도 된다.

■⚠️⚠️⚠️ **이건 바다거북 같은 "경로"가 아니다.**
   원자료는 한 줄에 **출발지 하나, 도착지 하나**뿐이다. 중간 경로가 없다.
   거북은 발신기로 같은 개체를 계속 따라가 개체당 수천 점이 있었다.
   여기 179줄은 "언제 떠나 어디쯤 갔다" 두 칸이다.
   → 선을 곡선으로 잇되, **경로가 아니라 "여기서 저기로"** 라고 화면에 적는다.

■⚠️⚠️ **도착지에 점을 찍으면 안 된다.**
   "중국 지린성"은 19만㎢ — 남한의 두 배다. "북한"만 적힌 것도 10건이다.
   점을 찍으면 보는 사람은 **거기 갔다**고 읽는다. 그건 없는 정밀도를 지어내는 것이다.
   → 도착지는 **원(반경)** 으로 그린다. 반경이 곧 "이 안 어딘가"라는 뜻이다.
   출발지는 시·군 단위라 점으로 찍어도 된다(±12km).

■⚠️ 추적기 코드(`vt2031`)가 자료에 있다 — 기관은 진짜 GPS 트랙을 갖고 있다.
   공개된 건 요약 179줄뿐이다. 원본은 역학조사과(054-912-0438)에 문의할 것.

■⚠️ 파일은 API 가 아니라 기관 홈페이지에서 받는다.
   포털 설명은 XLSX·2024 라는데 실물은 **CSV·2021-2025** 다. 실물을 믿는다.
"""
import csv
import io
import json
import os
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import boto3

from places import HOME, AWAY, HOME_R, norm

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/migbird.json"
DETAIL = ("https://data.mafra.go.kr/opendata/data/indexOpenDataDetail.do"
          "?data_id=20230821000000002390")
DOWN = "https://data.mafra.go.kr/opendata/data/downloadOpenDataWebFile.do"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

SOURCE = "농림축산식품부 농림축산검역본부 (역학조사과)"
LICENSE = "공공누리 — 이용허락범위 제한 없음"


def fetch_csv():
    """⚠️⚠️ 세 가지를 다 맞춰야 파일이 온다. 하나라도 빠지면 '서비스 장애' HTML 이 온다.
       1. 상세 페이지를 먼저 열어 **세션 쿠키**를 받는다
       2. Referer 를 그 페이지로 준다
       3. ⚠️ 입력칸 **이름이 `data_id`** 다 — id 는 `file_data_id` 라 헷갈린다.
          `file_data_id` 로 보내면 조용히 장애 페이지가 온다.
    """
    jar = urllib.request.HTTPCookieProcessor()
    op = urllib.request.build_opener(jar)
    op.open(urllib.request.Request(DETAIL, headers=UA), timeout=45).read()

    body = urllib.parse.urlencode({
        "data_id": "20230821000000002390",
        "file_ty_code": "file",
        "file_sn": "1",
        "preview_ty_code": "prew",
    }).encode()
    req = urllib.request.Request(DOWN, data=body, headers={**UA, "Referer": DETAIL})
    with op.open(req, timeout=90) as r:
        raw = r.read()
        disp = r.headers.get("Content-Disposition", "")
    # ⚠️ 장애 페이지도 HTTP 200 이다. 첨부파일인지로 가른다.
    if "attachment" not in disp:
        raise RuntimeError(f"파일이 아니라 페이지가 왔다 ({len(raw)}바이트)")
    # ⚠️ EUC-KR(cp949) 이다. utf-8 로 읽으면 터진다.
    return raw.decode("cp949", "replace")


def handler(event=None, context=None):
    rows = [r for r in csv.reader(io.StringIO(fetch_csv()))
            if r and len(r) >= 8 and r[0].strip().isdigit()]
    print(f"[migbird] {len(rows)}줄")
    if not rows:
        raise RuntimeError("빈 파일이다 — 서식이 바뀌었는지 볼 것")

    trips = []
    miss = set()
    by_spc = defaultdict(int)
    by_year = defaultdict(int)
    places = {}          # 지명 → 화면에 그릴 자리

    for r in rows:
        spc = r[4].strip()
        a, b = norm(r[6]), norm(r[7])
        if a not in HOME or b not in AWAY:
            miss.add(a if a not in HOME else b)
            continue
        la, lo = HOME[a]
        lb, ob, rad = AWAY[b]
        places.setdefault(a, {"name": a, "lat": la, "lon": lo, "r": HOME_R, "home": True, "n": 0})
        places.setdefault(b, {"name": b, "lat": lb, "lon": ob, "r": rad, "home": False, "n": 0})
        places[a]["n"] += 1
        places[b]["n"] += 1
        yr = r[2].strip().replace("년", "")
        trips.append({
            "spc": spc,
            "yr": yr,
            # ⚠️ 날짜는 원문 그대로 둔다("'21.2.10"). 고쳐 쓰면 그것도 가공이다.
            "on": r[3].strip(),
            "tag": r[5].strip(),          # 추적기 코드
            "from": a, "to": b,
        })
        by_spc[spc] += 1
        by_year[yr] += 1

    if miss:
        # ⚠️ 조용히 버리지 않는다. 지명이 새로 생기면 places.py 에 넣어야 한다.
        print(f"[migbird] ⚠️ 좌표 없는 지명 {len(miss)}개 — places.py 에 추가할 것: {sorted(miss)}")

    doc = {
        "updated": datetime.now(KST).isoformat(timespec="seconds"),
        "source": SOURCE,
        "license": LICENSE,
        "trips": trips,
        "places": sorted(places.values(), key=lambda p: -p["n"]),
        "species": sorted(by_spc.items(), key=lambda kv: -kv[1]),
        "years": sorted(by_year.items()),
        "dropped": sorted(miss),
        "note": {
            "ko": "⚠️ 경로가 아닙니다. 떠난 곳과 도착한 곳 **두 지점**만 있는 자료라, "
                  "사이를 이은 선은 실제로 날아간 길이 아닙니다.\n"
                  "⚠️ 도착지는 성·도 단위라 **원으로 그렸습니다.** 원이 클수록 "
                  "'이 안 어딘가'라는 뜻입니다 — 가운데에 갔다는 뜻이 아닙니다.",
            "en": "Not a track — only departure and arrival places. Arrival areas are drawn "
                  "as circles because the source gives provinces, not points.",
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=21600")
    print(f"[migbird] ✔ {DST} — 이동 {len(trips)} · 지명 {len(places)} · "
          f"종 {len(by_spc)} · {len(body)/1024:.0f}KB")
    return {"ok": True, "trips": len(trips), "places": len(places), "dropped": len(miss)}

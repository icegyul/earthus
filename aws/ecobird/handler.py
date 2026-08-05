# -*- coding: utf-8 -*-
"""에코뱅크 — 전국 자연환경조사 조류 관측 지점.

국립생태원 에코뱅크(nie-ecobank.kr). 받은 요청: "에코뱅크 진행해"

■⚠️⚠️⚠️ **105만 건을 그대로 화면에 보낼 수 없다.**
   자연환경조사 조류만 1,053,574건이다. 점을 다 그리면 브라우저가 죽고,
   설령 살아도 남한이 통째로 한 덩어리 색으로 덮여 아무것도 안 보인다.
   → **격자로 묶는다.** 0.05°(약 5km) 칸마다 관측 건수와 종 수를 센다.
   ⚠️ 묶는 것은 화면 표시를 위한 통계 처리다. 공개 안내는 외부 활용용 API라고
      설명하지만 세부 이용약관은 로그인 뒤 신청 화면에 있다. 상업 이용·재배포를
      허용한다고 추정하지 않는다. 확인 전에는 무료 화면의 출처 표기만 하고,
      유료 상품·CSV/API 내보내기는 보류한다.
   ⚠️ **원본 건수를 함께 실어** 얼마나 묶였는지 밝힌다.

■⚠️⚠️ 좌표가 위경도가 아니다 — TM 투영이다. tm.py 머리말 참고.
   EPSG:5186 으로 확정했고 근거는 **백두대간 자료가 백두대간에 떨어진다**는 것이다.

■⚠️ 키를 밖으로 꺼내지 않는다. 요청은 이 함수 안에서만 만든다.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import boto3

from tm import parse_point, raw_xy

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ["ECOBANK_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "events/ecobird.json"
BASE = "https://www.nie-ecobank.kr/ecoapi"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

SETS = [
    ("자연환경조사", "NteeInfoService"),
    ("생태계정밀조사", "EcpeInfoService"),
    ("백두대간조사", "BgtsInfoService"),
]

# ⚠️⚠️ **1,000 으로 두면 105만 건에 1,054번 요청이라 15분 안에 못 끝낸다.**
#    찔러 보니 10,000 도 받아준다(응답 3MB) → 106번이면 끝난다.
#    ⚠️ 더 키우지 않는다. 응답이 커질수록 한 번 실패했을 때 다시 받는 값이 커진다.
PAGE = 10000
CELL = 0.05          # 격자 한 칸 ≈ 5km
# ⚠️ Lambda 가 15분이라 무한정 받을 수 없다. 남은 시간을 보고 멈춘다.
BUDGET_SEC = 720

# ⚠️⚠️⚠️ **"위치 없음"을 뜻하는 가짜 좌표가 **여러 가지** 섞여 있다.**
#    글자로 하나씩 맞추면 새 것이 나올 때마다 조용히 뚫린다. **값으로 거른다.**
#
#    ① `POINT(-70529.58 382209.83)` → 정확히 **36.0000N 124.0000E**
#       2013년 조사분 405/500 이 **전부 이 값 하나**였다. 꿩·집비둘기·물까치…
#       서로 다른 종인데 좌표가 똑같다. 거기는 **서해 한가운데 빈 바다**다.
#       ⚠️ 딱 떨어지는 값이라 우연이 아니다 — 누군가 "없음"을 이렇게 적었다.
#       ⚠️ 우리 남한 경계가 124.5°E 부터라 **우연히** 걸러졌다.
#          조금만 넓었으면 이 점들이 서해에 찍혔을 것이다.
#
#    ② `POINT(1.84467440194776e+15 …)` → **2⁶⁴** 근처 값.
#       **-1(값 없음)을 부호 없는 정수로 잘못 읽은 것**이다. 2017년 조사분.
#
#    ⚠️ 둘 다 '오류'가 아니라 **'위치 미기재'**다. 따로 세어 화면에 밝힌다 —
#       버린 수를 안 밝히면 "조사 안 한 곳"과 구분이 안 된다.
def no_location(x_y, ll):
    """위치를 적지 않은 자료인가."""
    if x_y is None or ll is None:
        return True
    x, y = x_y
    if abs(x) > 1e7 or abs(y) > 1e7:            # ② 말도 안 되게 큰 값
        return True
    la, lo = ll
    if abs(la - 36.0) < 1e-6 and abs(lo - 124.0) < 1e-6:   # ① 딱 떨어지는 자리표시
        return True
    return False


SOURCE = "국립생태원 에코뱅크 (전국 자연환경조사 · 생태계정밀조사 · 백두대간조사)"
LICENSE = "국립생태원 에코뱅크 OpenAPI · 세부 이용조건 확인 중"
SOURCE_URL = "https://www.nie-ecobank.kr/data/api/intrcn.do"


def get(url, params, tries=3):
    q = urllib.parse.urlencode(params)
    full = f"{url}?serviceKey={KEY}&{q}"
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers=UA), timeout=50) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:              # noqa: BLE001
            last = e
            time.sleep(1.2 * (i + 1))
    print(f"[ecobird] ⚠️ 못 받음: {last}")
    return None


def rows(doc):
    """⚠️ 인증 실패도 HTTP 200 으로 온다. header 를 봐야 안다."""
    if not doc:
        return None, 0
    h = doc.get("header") or {}
    if str(h.get("resultCode", "0")) not in ("0", "00"):
        print(f"[ecobird] ⚠️ API 거절: {h.get('resultMsg')}")
        return None, 0
    b = doc.get("body") or {}
    it = b.get("item") or []
    if isinstance(it, dict):
        it = [it]
    return it, int(b.get("totalCount") or 0)


def probe(svc="NteeInfoService", page=1):
    """왜 버려지는지 본다. ⚠️ 한 쪽만 받아 **버려지는 값을 그대로 찍는다** —
       개수만 세면 원인을 영영 모른다(바닷새에서 같은 실수를 했다)."""
    it, tc = rows(get(f"{BASE}/{svc}/attr/getBirdsPointAttr",
                      {"type": "json", "numOfRows": 500, "pageNo": page}))
    if not it:
        return {"ok": False, "why": "못 받음"}
    empty = weird = out = ok = 0
    shown = []
    for r in it:
        g = r.get("geom")
        if not g or "POINT" not in str(g):
            empty += 1
            if len(shown) < 6:
                shown.append(f"[빈칸] {g!r}")
            continue
        ll = parse_point(g)
        if not ll:
            weird += 1
            if len(shown) < 12:
                shown.append(f"[못품] {g!r}")
            continue
        la, lo = ll
        if not (33.0 <= la <= 39.0 and 124.5 <= lo <= 131.5):
            out += 1
            if len(shown) < 20:
                shown.append(f"[범위밖] {g} → {la:.4f},{lo:.4f}"
                             f"  yr={r.get('examinYear')} {r.get('spcsLcnm')}")
            continue
        ok += 1
    print(f"[probe] {svc} {page}쪽 {len(it)}건 — 정상 {ok} · 빈칸 {empty} · "
          f"못품 {weird} · 범위밖 {out}")
    for x in shown:
        print("   " + x)
    return {"ok": True, "good": ok, "empty": empty, "weird": weird, "out": out}


def handler(event=None, context=None):
    if (event or {}).get("probe"):
        return probe((event or {}).get("svc", "NteeInfoService"),
                     int((event or {}).get("page", 1)))
    started = time.time()
    grid = defaultdict(lambda: {"n": 0, "spc": set(), "yrs": set()})
    species = defaultdict(int)
    got = truncated = bad = noloc = 0
    per_set = {}

    for label, svc in SETS:
        url = f"{BASE}/{svc}/attr/getBirdsPointAttr"
        page = 1
        total = None
        n_here = 0
        while True:
            if time.time() - started > BUDGET_SEC:
                # ⚠️ 조용히 자르지 않는다. 얼마나 못 받았는지 남긴다.
                print(f"[ecobird] ⚠️⚠️ 시간이 다 됐다 — {label} {n_here}/{total} 에서 끊는다")
                truncated += (total or 0) - n_here
                break
            it, tc = rows(get(url, {"type": "json", "numOfRows": PAGE, "pageNo": page}))
            if it is None:
                break
            if total is None:
                total = tc
                print(f"[ecobird] {label} 전체 {tc:,}건")
            if not it:
                break
            for r in it:
                geom = (r.get("geom") or "").strip()
                xy = raw_xy(geom)
                ll = parse_point(geom)
                if no_location(xy, ll):
                    noloc += 1
                    continue
                la, lo = ll
                # ⚠️ 남한 밖이면 버린다. 좌표계를 잘못 골랐을 때 곧바로 드러난다.
                if not (33.0 <= la <= 39.0 and 124.5 <= lo <= 131.5):
                    bad += 1
                    continue
                nm = (r.get("spcsLcnm") or "").strip()
                yr = (r.get("examinYear") or "").strip()
                k = f"{int(la / CELL)}:{int(lo / CELL)}"
                g = grid[k]
                g["n"] += 1
                if nm:
                    g["spc"].add(nm)
                    species[nm] += 1
                if yr:
                    g["yrs"].add(yr)
            n_here += len(it)
            got += len(it)
            if total and n_here >= total:
                break
            page += 1
        per_set[label] = {"total": total or 0, "got": n_here}
        print(f"[ecobird] {label} {n_here:,}건 받음 · 누적 격자 {len(grid):,}칸")

    cells = []
    for k, v in grid.items():
        gy, gx = k.split(":")
        cells.append({
            "lat": round((int(gy) + 0.5) * CELL, 4),
            "lon": round((int(gx) + 0.5) * CELL, 4),
            "n": v["n"], "spc": len(v["spc"]),
        })
    cells.sort(key=lambda c: -c["n"])
    mapped = sum(c["n"] for c in cells)   # 실제로 지도에 올라간 관측 수
    top = sorted(species.items(), key=lambda kv: -kv[1])[:60]

    doc = {
        "updated": datetime.now(KST).isoformat(timespec="seconds"),
        "source": SOURCE, "sourceUrl": SOURCE_URL, "license": LICENSE,
        "cellDeg": CELL,
        "records": got,
        "mapped": mapped,
        "truncated": truncated,          # ⚠️ 못 받고 끊은 건수. 0 이면 전부 받은 것이다.
        "dropped": bad,                  # 좌표를 못 읽었거나 남한 밖 — 이건 진짜 이상한 것
        "noLocation": noloc,             # ⚠️ 기관이 "위치 없음"으로 적어 보낸 건수
        "sets": per_set,
        "speciesCount": len(species),
        "species": top,
        "cells": cells,
        "note": {
            # ⚠️⚠️ 지도에 올라간 수와 원본 수를 **둘 다** 적는다.
            #    원본 수만 적으면 27만 건이 지도에 있는 줄 알게 된다.
            "ko": f"⚠️ 점 하나가 관측 한 건이 아닙니다. 약 5km({CELL}°) 칸마다 "
                  f"묶은 것입니다.\n"
                  f"받은 기록 {got:,}건 중 지도에 올린 것은 {mapped:,}건입니다. "
                  f"⚠️ 나머지 {noloc:,}건은 **기관이 위치를 적지 않은 자료**입니다 — "
                  "저희가 못 읽은 것이 아니라 원본에 자리가 비어 있습니다.\n"
                  "⚠️ 조사하러 간 곳의 기록입니다. 빈 칸은 '새가 없다'가 아니라 "
                  "'그 칸은 조사 기록이 없다'는 뜻입니다.",
            "en": f"Each dot is a ~5 km cell. {mapped:,} of {got:,} records are mapped; "
                  f"{noloc:,} carry no location in the source. "
                  "Empty cells mean no survey record, not no birds.",
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=43200")
    print(f"[ecobird] ✔ {DST} — 관측 {got:,} · 격자 {len(cells):,}칸 · 종 {len(species)} · "
          f"버림 {bad:,} · 위치없음 {noloc:,} · 못받음 {truncated:,} · {len(body)/1024:.0f}KB")
    return {"ok": True, "records": got, "cells": len(cells), "truncated": truncated}

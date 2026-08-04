# -*- coding: utf-8 -*-
"""에코뱅크 — 전국 자연환경조사 조류 관측 지점.

국립생태원 에코뱅크(nie-ecobank.kr). 받은 요청: "에코뱅크 진행해"

■⚠️⚠️⚠️ **105만 건을 그대로 화면에 보낼 수 없다.**
   자연환경조사 조류만 1,053,574건이다. 점을 다 그리면 브라우저가 죽고,
   설령 살아도 남한이 통째로 한 덩어리 색으로 덮여 아무것도 안 보인다.
   → **격자로 묶는다.** 0.05°(약 5km) 칸마다 관측 건수와 종 수를 센다.
   ⚠️ 묶는 것은 '가공'이지만 이 자료는 이용허락 제한이 없다.
      그래도 **원본 건수를 함께 실어** 얼마나 묶였는지 밝힌다.

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

from tm import parse_point

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

PAGE = 1000
CELL = 0.05          # 격자 한 칸 ≈ 5km
# ⚠️ Lambda 가 15분이라 무한정 받을 수 없다. 남은 시간을 보고 멈춘다.
BUDGET_SEC = 720

SOURCE = "국립생태원 에코뱅크 (전국 자연환경조사 · 생태계정밀조사 · 백두대간조사)"
LICENSE = "국립생태원 에코뱅크 오픈API"


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


def handler(event=None, context=None):
    started = time.time()
    grid = defaultdict(lambda: {"n": 0, "spc": set(), "yrs": set()})
    species = defaultdict(int)
    got = truncated = bad = 0
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
                ll = parse_point(r.get("geom"))
                if not ll:
                    bad += 1
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
    top = sorted(species.items(), key=lambda kv: -kv[1])[:60]

    doc = {
        "updated": datetime.now(KST).isoformat(timespec="seconds"),
        "source": SOURCE, "license": LICENSE,
        "cellDeg": CELL,
        "records": got,
        "truncated": truncated,          # ⚠️ 못 받고 끊은 건수. 0 이면 전부 받은 것이다.
        "dropped": bad,                  # 좌표를 못 읽었거나 남한 밖
        "sets": per_set,
        "speciesCount": len(species),
        "species": top,
        "cells": cells,
        "note": {
            "ko": f"⚠️ 점 하나가 관측 한 건이 아닙니다. 약 5km({CELL}°) 칸마다 "
                  f"관측 건수를 묶은 것입니다 — 원본은 {got:,}건입니다.\n"
                  "⚠️ 조사하러 간 곳의 기록입니다. 빈 칸은 '새가 없다'가 아니라 "
                  "'그 칸은 조사 기록이 없다'는 뜻입니다.",
            "en": f"Each dot is a ~5 km cell, not one sighting ({got:,} records aggregated). "
                  "Empty cells mean no survey record, not no birds.",
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=43200")
    print(f"[ecobird] ✔ {DST} — 관측 {got:,} · 격자 {len(cells):,}칸 · 종 {len(species)} · "
          f"버림 {bad:,} · 못받음 {truncated:,} · {len(body)/1024:.0f}KB")
    return {"ok": True, "records": got, "cells": len(cells), "truncated": truncated}

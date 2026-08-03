# -*- coding: utf-8 -*-
"""낙뢰 — 한국(기상청) + 일본(JMA)을 하나로

받은 요청
  "윈디는 nowcast.de 자료 쓰던데 우리도 가능해?" → "낙뢰 한국과 일본꺼 모두 찾아서 넣어주고"

■⚠️ nowcast.de(LINET)는 **상용**이다
   가격·API 문서 페이지가 없고 영업 문의로만 받는다. 윈디는 라이선스 계약으로 쓴다.
   → 우리는 각 나라 기관이 **무료로 공개하는 것**을 쓴다. 범위는 좁지만 출처가 분명하다.

■ 원본
   기상청  apihub.kma.go.kr … 이미 kma-lightning Lambda 가 받고 있다 (events/kma-lightning.json)
   JMA     www.jma.go.jp/bosai/jmatile/data/nowc/{bt}/none/{vt}/surf/liden/data.geojson
           ⚠️ **5분 간격 점 자료**다. 최근 25분이면 500건 넘는다.
           ⚠️ 타일(.png)로는 404 가 난다 — liden 만 GeoJSON 이고 thns(뇌활동도)가 타일이다.
           ⚠️ **gzip 으로 온다.** Accept-Encoding 없이 받으면 UnicodeDecodeError 가 난다
              (실제로 그렇게 막혔다). 매직바이트로 확인해 푼다.

■⚠️⚠️ 동아시아에는 정지위성 낙뢰 관측기가 없다
   GOES 에는 GLM 이 달려 있지만 **히마와리·천리안2A 에는 없다.**
   그래서 이 지역 낙뢰는 지상 관측망이 유일한 길이고, 그게 nowcast 가 파는 것이다.
   → 우리 범위는 **한국과 일본뿐**이다. 화면에 그렇게 적는다. 전지구인 척하지 않는다.

결과  s3://<CACHE_BUCKET>/events/lightning.json
"""

import gzip
import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
CDN = os.environ.get("CDN_BASE", "https://earthus.net")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/lightning.json"
JMA = "https://www.jma.go.jp/bosai/jmatile/data/nowc"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)", "Accept-Encoding": "gzip"}
KST = timezone(timedelta(hours=9))

# ⚠️ 몇 분치를 보여줄까. 윈디처럼 "지금 치는 곳"을 보여주되 너무 길면 하늘이 점으로 덮인다.
WINDOW_MIN = 30


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        b = r.read()
    # ⚠️ gzip 여부를 **헤더가 아니라 매직바이트**로 본다 — 헤더를 안 주는 경우가 있다
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    return json.loads(b.decode("utf-8"))


def jp():
    """JMA 낙뢰 — 5분 간격 GeoJSON 을 창(WINDOW_MIN)만큼 모은다"""
    times = get(f"{JMA}/targetTimes_N3.json")
    slots = [e for e in times if "liden" in (e.get("elements") or [])]
    # ⚠️ 목록이 최신순인지 과거순인지 보장이 없다. 시각 문자열로 직접 정렬한다.
    slots.sort(key=lambda e: e["basetime"])
    need = max(1, WINDOW_MIN // 5)
    out = []
    for e in slots[-need:]:
        bt, vt = e["basetime"], e["validtime"]
        try:
            g = get(f"{JMA}/{bt}/none/{vt}/surf/liden/data.geojson?id=liden")
        except Exception as ex:                                  # noqa: BLE001
            print(f"[light] jma {bt} 건너뜀: {str(ex)[:60]}")
            continue
        for f in g.get("features", []):
            c = (f.get("geometry") or {}).get("coordinates") or []
            if len(c) < 2:
                continue
            p = f.get("properties") or {}
            # ⚠️ type 0/1 이 무엇인지 JMA 가 문서로 밝히지 않는다.
            #    대지방전(CG)/구름방전(CC) 으로 **짐작되지만 단정하지 않는다** —
            #    화면에는 종류를 적지 않고 위치와 시각만 쓴다.
            out.append({"lon": round(c[0], 4), "lat": round(c[1], 4),
                        "at": p.get("obstimeJST"), "src": "JMA", "t": p.get("type")})
    return out


def kr():
    """기상청 낙뢰 — 이미 kma-lightning 이 만들어 둔 것을 그대로 쓴다.
    ⚠️ 같은 자료를 두 번 받지 않는다. 그쪽이 죽으면 여기도 비는데, 그게 맞다 —
       우리가 몰래 다른 경로로 채우면 어느 쪽이 살아 있는지 알 수 없게 된다."""
    d = get(f"{CDN}/events/kma-lightning.json")
    out = []
    for s in d.get("strikes") or []:
        if s.get("lat") is None:
            continue
        out.append({"lon": s["lon"], "lat": s["lat"], "at": s.get("tm"),
                    "src": "KMA", "kA": s.get("kA"), "t": s.get("type")})
    return out, d.get("observedKst"), d.get("windowMinutes")


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)
    rows, errs, kobs, kwin = [], {}, None, None
    try:
        k, kobs, kwin = kr()
        rows += k
        print(f"[light] kma {len(k)}건")
    except Exception as e:                                       # noqa: BLE001
        errs["kma"] = str(e)[:120]
        print(f"[light] kma 실패: {e}")
    try:
        j = jp()
        rows += j
        print(f"[light] jma {len(j)}건")
    except Exception as e:                                       # noqa: BLE001
        errs["jma"] = str(e)[:120]
        print(f"[light] jma 실패: {e}")

    nk = sum(1 for r in rows if r["src"] == "KMA")
    nj = len(rows) - nk
    doc = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "windowMinutes": WINDOW_MIN,
        "count": len(rows), "korea": nk, "japan": nj,
        "kmaObservedKst": kobs, "kmaWindowMinutes": kwin,
        "errors": errs or None,
        "sources": [
            {"id": "KMA", "ko": "기상청", "license": "공공누리 제1유형 (출처표시)"},
            {"id": "JMA", "ko": "일본 기상청", "license": "출처표시"},
        ],
        "note": {
            "ko": f"최근 약 {WINDOW_MIN}분 안에 관측된 낙뢰입니다.\n"
                  "⚠️⚠️ **한국과 일본만 나옵니다.** 그 밖은 자료가 없어서 비어 있는 것이지 "
                  "낙뢰가 없는 것이 아닙니다.\n"
                  "⚠️ 동아시아 정지위성(히마와리·천리안2A)에는 낙뢰 관측기가 없습니다. "
                  "미국 GOES 에만 있습니다. 그래서 이 지역은 지상 관측망에 의존하고, "
                  "각 나라 기관이 자기 나라만 공개합니다.\n"
                  "⚠️ 두 기관의 탐지 방식과 기준이 서로 다릅니다 — "
                  "국경에서 점의 밀도가 달라 보여도 실제 낙뢰 차이가 아닐 수 있습니다.",
            "en": f"Lightning detected in roughly the last {WINDOW_MIN} minutes. "
                  "⚠️ Korea and Japan only — elsewhere is empty because we have no data, "
                  "not because there is no lightning. Himawari and Chollian-2A carry no "
                  "lightning mapper; only GOES does. Detection methods differ between the "
                  "two agencies, so density may change at the border for that reason alone.",
        },
        "strikes": rows,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=120")
    print(f"[light] 합계 {len(rows)}건 (한국 {nk} · 일본 {nj}) · {len(body)/1024:.0f}KB")
    return {"ok": bool(rows) or not errs, "count": len(rows),
            "korea": nk, "japan": nj, "errors": errs or None}

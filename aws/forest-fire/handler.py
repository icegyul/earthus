# -*- coding: utf-8 -*-
"""산불위험예보 — 산림청 국립산림과학원 (전국·시도·시군구)

■ 원본  apis.data.go.kr/1400377/forestPointV2
          forestPointListGeongugSearchV2  전국 1행
          forestPointListSidoSearchV2     시도 16행
          forestPointListSigunguSearchV2  시군구 250행 안팎
        파라미터: serviceKey, numOfRows, pageNo, _type=json
        ⚠️ 여기는 형식 파라미터가 `_type` 이다. 국립해양조사원 쪽은 `resultType` 이었다.
           기관마다 다르다 — 한쪽에서 됐다고 다른 쪽에 그대로 쓰면 XML 이 온다.

■ 갱신  3시간마다 (2·5·8·11·14·17·20·23시 분석 → 3·6·9·12·15·18·21·24시 제공)
        ⚠️ 그래서 **한 시간에 한 번 불러도 대부분 같은 값**이다. 3시간 주기로 돈다.

■⚠️⚠️ **등급 이름을 우리가 붙이지 않는다.**
   응답에 d1·d2·d3·d4 가 있고, 이것이 산림청이 정의한 네 단계별 **면적 비율(%)** 이다.
   지수 평균값(meanavg)에 우리가 임계값을 붙여 "높음"이라고 부르면,
   산림청이 발표한 등급과 다른 답이 나올 수 있다.
   → 지수는 숫자로, 단계는 **기관이 이미 나눠 준 면적 비율**로만 말한다.

■⚠️ **행정구역이 통합됐다 (2026년).**
   응답에 `전남광주통합특별시` 가 나온다. 예전 17개 시도로 하드코딩하면 한 곳이 통째로 빠진다.
   → 좌표표에 없는 이름이 와도 **버리지 않고** 좌표만 null 로 둔다.

■⚠️ 시군구 좌표는 이 API 가 주지 않는다.
   그래서 시군구는 **지도에 점으로 찍지 않는다.** 목록으로만 쓴다.
   억지로 시청 좌표를 넣으면 "그 지점의 위험도"로 잘못 읽힌다 — 실제로는 군 전체 평균이다.

결과  s3://<CACHE_BUCKET>/events/forest-fire-kr.json
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ["DATA_GO_KR_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "events/forest-fire-kr.json"
BASE = "https://apis.data.go.kr/1400377/forestPointV2"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

# 시도 대표 지점 — **도청·시청 소재지**다. 무게중심이 아니다.
# ⚠️ 지도에 찍을 때 "이 점의 위험도"가 아니라 "이 시도의 평균"이라고 적어야 한다.
SIDO_XY = {
    "서울특별시": (37.5665, 126.9780),
    "부산광역시": (35.1796, 129.0756),
    "대구광역시": (35.8714, 128.6014),
    "인천광역시": (37.4563, 126.7052),
    "대전광역시": (36.3504, 127.3845),
    "울산광역시": (35.5384, 129.3114),
    "세종특별자치시": (36.4800, 127.2890),
    "경기도": (37.2636, 127.0286),          # 수원 도청
    "강원특별자치도": (37.8813, 127.7300),   # 춘천 도청
    "충청북도": (36.6424, 127.4890),         # 청주 도청
    "충청남도": (36.6588, 126.6728),         # 홍성 도청
    "전북특별자치도": (35.8242, 127.1480),   # 전주 도청
    "전남광주통합특별시": (34.8161, 126.4630),  # 무안 전남도청
    "경상북도": (36.5684, 128.7294),         # 안동 도청
    "경상남도": (35.2280, 128.6811),         # 창원 도청
    "제주특별자치도": (33.4996, 126.5312),
}

# 산림청이 나눠 준 네 단계. ⚠️ 순서가 곧 세기다 (d1 이 가장 낮음).
STEPS = [("d1", "1단계"), ("d2", "2단계"), ("d3", "3단계"), ("d4", "4단계")]


def get(op, rows=500):
    url = f"{BASE}/{op}?serviceKey={KEY}&numOfRows={rows}&pageNo=1&_type=json"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        d = json.loads(r.read().decode("utf-8"))
    b = (d.get("response") or {}).get("body") or {}
    it = (b.get("items") or {}).get("item")
    if it is None:
        return []
    return it if isinstance(it, list) else [it]


def num(v):
    if v is None:
        return None
    try:
        # ⚠️ area 가 "   1,279,057" 처럼 **공백과 쉼표가 섞인 문자열**로 온다.
        #    float() 을 그냥 걸면 터진다. 실제로 그렇게 막혔다.
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def steps(r):
    """네 단계 면적 비율. ⚠️ 합이 100 이 아닐 수 있다(반올림). 보정하지 않는다 —
    보정하면 기관 발표와 숫자가 달라진다."""
    return {k: num(r.get(k)) for k, _ in STEPS}


def top_step(r):
    """면적이 가장 넓은 단계. ⚠️ '이 지역의 등급'이 아니라 '가장 넓은 단계'다."""
    best, bv = None, -1.0
    for k, ko in STEPS:
        v = num(r.get(k)) or 0.0
        if v > bv:
            best, bv = ko, v
    return best, bv


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)

    errs = {}
    nation, sido, sigungu = [], [], []
    for name, op, dst in (
        ("전국", "forestPointListGeongugSearchV2", nation),
        ("시도", "forestPointListSidoSearchV2", sido),
        ("시군구", "forestPointListSigunguSearchV2", sigungu),
    ):
        try:
            dst.extend(get(op))
        except Exception as e:                                   # noqa: BLE001
            errs[name] = str(e)[:120]
            print(f"[fire] {name} 실패: {e}")

    def pack(r, with_xy=False):
        o = {
            "at": r.get("analdate"),
            "sido": r.get("doname"),
            "areaHa": num(r.get("area")),
            "avg": num(r.get("meanavg")), "max": num(r.get("maxi")),
            "min": num(r.get("mini")), "std": num(r.get("std")),
            "steps": steps(r),
        }
        t, tv = top_step(r)
        o["topStep"], o["topStepPct"] = t, tv
        if r.get("sigun"):
            o["sigun"] = r.get("sigun")
            o["code"] = r.get("sigucode")
        if with_xy:
            xy = SIDO_XY.get(r.get("doname"))
            # ⚠️ 모르는 이름이면 버리지 않고 좌표만 비운다 (행정구역 통합 대비)
            o["lat"], o["lon"] = (xy[0], xy[1]) if xy else (None, None)
        return o

    kr = pack(nation[0]) if nation else None
    sd = sorted((pack(r, True) for r in sido), key=lambda x: -(x["avg"] or 0))
    sg = sorted((pack(r) for r in sigungu), key=lambda x: -(x["avg"] or 0))
    unmapped = sorted({x["sido"] for x in sd if x["lat"] is None})
    if unmapped:
        # ⚠️ 조용히 넘어가지 않는다. 행정구역이 또 바뀌면 여기서 먼저 보인다.
        print(f"[fire] ⚠️ 좌표 없는 시도: {unmapped}")

    # 4단계(가장 높은 단계)가 조금이라도 있는 곳 — 있으면 그게 오늘의 요점이다.
    hot = [x for x in sg if (x["steps"].get("d4") or 0) > 0 or (x["steps"].get("d3") or 0) > 0]

    doc = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "generatedKst": now.strftime("%Y-%m-%d %H:%M"),
        "analysedAt": (kr or {}).get("at") or (sd[0]["at"] if sd else None),
        "nation": kr,
        "sido": sd,
        "sigungu": sg,
        "elevatedCount": len(hot),
        "elevated": [{"sido": x["sido"], "sigun": x.get("sigun"),
                      "avg": x["avg"], "max": x["max"], "steps": x["steps"]}
                     for x in hot[:40]],
        "unmappedSido": unmapped or None,
        "errors": errs or None,
        "sources": [{
            "id": "NIFOS", "ko": "산림청 국립산림과학원",
            "en": "National Institute of Forest Science, Korea Forest Service",
            "license": "이용허락범위 제한 없음",
            "via": "공공데이터포털 (data.go.kr)",
        }],
        "note": {
            "ko": (
                "산림청 국립산림과학원이 지형·숲의 종류·날씨를 합쳐 계산한 산불위험지수입니다. "
                "3시간마다 갱신되고, 72시간까지 내다봅니다.\n"
                "⚠️ 숫자는 **행정구역 전체의 평균**입니다. 그 안에서도 산 능선과 골짜기가 다릅니다.\n"
                "⚠️ 단계별 비율(1~4단계)은 **산림청이 나눈 것**을 그대로 옮깁니다. "
                "저희가 지수에 기준을 붙여 '높음/낮음'이라 부르지 않습니다.\n"
                "⚠️ 시군구는 좌표를 주지 않아 **지도에 점으로 찍지 않고 목록으로만** 보여줍니다. "
                "시도 점은 도청·시청 자리이지 그 지점의 위험도가 아닙니다.\n"
                "⚠️ 숲이 없는 지역(도심 등)은 계산 대상이 아니라 값이 빠질 수 있습니다."
            ),
            "en": (
                "Forest-fire risk index from NIFOS (terrain + forest type + weather), "
                "updated every 3 hours out to 72 hours. Values are area averages. "
                "The 1–4 step shares are the agency's own classification; we do not "
                "re-label them. District points are provincial-office locations, not "
                "the risk at that spot."
            ),
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=900")
    print(f"[fire] 전국 avg {(kr or {}).get('avg')} · 시도 {len(sd)} · 시군구 {len(sg)} · "
          f"3~4단계 있는 곳 {len(hot)} · {len(body)/1024:.0f}KB")
    return {"ok": bool(sd or sg), "sido": len(sd), "sigungu": len(sg),
            "elevated": len(hot), "errors": errs or None}

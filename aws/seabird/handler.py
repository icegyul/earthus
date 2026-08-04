# -*- coding: utf-8 -*-
"""국가해양생태계종합조사 — 우리 바다에서 실제로 본 바닷새.
   해양수산부, 공공데이터포털 오픈API 2종을 붙여서 쓴다.

받은 요청
  "[승인] 해양수산부_국가해양생태계종합조사 바닷새 … 이거 신청했어"
  "데이터 보고 관련 메뉴 만들어주고"

■⚠️⚠️⚠️ **바닷새 API 하나로는 지도에 못 찍는다. 좌표가 없다.**
   실제로 받아서 28개 필드를 전부 확인했다. 위도·경도가 아예 없고
   위치는 `exmnLstaNo`(= 'SB01') **정점 번호 하나뿐**이다.
   좌표는 **조사지점(MarEcosysRschSiteInfoService)** 이 따로 준다.
   → 둘을 정점 번호로 이어붙여야 비로소 지도가 된다.
   ⚠️ 조사지점이 아직 활용신청 전이면 "등록되지 않은 서비스키"가 온다.
      그때는 **좌표 없이 통계만** 만들고 조용히 넘어간다 — 자료를 지어내지 않는다.

■⚠️⚠️ **serviceKey 를 다시 URL 인코딩하면 안 된다.**
   포털이 주는 키는 이미 인코딩되어 있다. `--data-urlencode` 로 한 번 더 감쌌더니
   `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 가 왔다. 키가 틀린 게 아니었다.
   그대로 문자열에 붙인다. (거북 핸들러와 같은 이유다)

■⚠️ **numOfRows 기본값이 10 이다.** 안 넘기면 19,739건 중 10건만 온다.

■ 이용허락범위 **제한 없음** — 바다거북(제4유형)과 다르다.
   가공해도 되고 분석 문장을 만들어도 된다. 출처만 밝힌다.
"""
import json
import os
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ["DATA_GO_KR_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "events/seabird.json"
BIRD = "https://apis.data.go.kr/1192000/MarEcosysRschSeaBirdInfoService/MarEcosysRschSeaBirdInfo"
SITE = "https://apis.data.go.kr/1192000/MarEcosysRschSiteInfoService/MarEcosysRschSiteInfo"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

PAGE = 1000          # 한 번에 받는 줄 수. 너무 키우면 504 가 온다(에어코리아에서 겪었다).
MAX_PAGES = 60       # 19,739건이면 20쪽이면 끝난다. 넉넉히 두되 무한루프는 막는다.

SOURCE = "해양수산부 국가해양생태계종합조사 (해양환경공단)"
LICENSE = "공공누리 — 이용허락범위 제한 없음"


def get(url, params, tries=3):
    """⚠️ serviceKey 는 이미 인코딩된 문자열이다. 다시 감싸지 않는다."""
    q = "&".join(f"{k}={v}" for k, v in params.items())
    full = f"{url}?serviceKey={KEY}&{q}"
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(full, headers=UA)
            with urllib.request.urlopen(req, timeout=50) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:          # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    print(f"[seabird] ⚠️ 못 받음: {last}")
    return None


def rows(doc):
    """⚠️ 기관마다 껍데기가 다르다. 여기는 `response` 래퍼가 **없다**.
       그리고 한 건만 오면 item 이 리스트가 아니라 **dict** 로 온다."""
    if not doc or "OpenAPI_ServiceResponse" in doc:
        if doc:
            h = doc["OpenAPI_ServiceResponse"].get("cmmMsgHeader", {})
            print(f"[seabird] ⚠️ API 거절: {h.get('returnAuthMsg')}")
        return None, 0
    b = (doc.get("response") or doc or {}).get("body") or {}
    it = (b.get("items") or {}).get("item") or []
    if isinstance(it, dict):
        it = [it]
    return it, int(b.get("totalCount") or 0)


def pages(url, extra=None):
    """전부 받아온다. ⚠️ 마지막 쪽에서 멈추는 조건을 두 개 둔다 —
       빈 쪽이 오거나, 받은 수가 totalCount 에 닿거나."""
    out, total = [], None
    for p in range(1, MAX_PAGES + 1):
        prm = {"numOfRows": PAGE, "pageNo": p, "type": "json"}
        prm.update(extra or {})
        it, tc = rows(get(url, prm))
        if it is None:
            return None            # 키가 거절당했다 — 빈 목록과 구분한다
        if total is None:
            total = tc
        out.extend(it)
        if not it or (total and len(out) >= total):
            break
    else:
        print(f"[seabird] ⚠️ {MAX_PAGES}쪽에서 끊었다 — 뒤가 더 있을 수 있다")
    return out


def num(v):
    try:
        x = float(str(v).strip())
        return x
    except Exception:                # noqa: BLE001
        return None


def site_coords():
    """정점 번호 → (위도, 경도). ⚠️ 아직 활용신청 전이면 None 이 온다."""
    got = pages(SITE)
    if got is None:
        print("[seabird] ⚠️⚠️ 조사지점 API 를 못 쓴다 → **좌표 없이** 통계만 만든다.")
        return None
    m = {}
    for r in got:
        code = (r.get("exmnLstaNo") or r.get("exmnStaNo") or "").strip()
        if not code:
            continue
        # ⚠️ 필드 이름을 못 봤다. 좌표처럼 생긴 것을 모두 훑어서 찾는다.
        la = lo = None
        for k, v in r.items():
            kl = k.lower()
            x = num(v)
            if x is None:
                continue
            if la is None and ("lat" in kl or kl.endswith("ycrd") or kl == "y"):
                la = x
            if lo is None and ("lot" in kl or "lon" in kl or kl.endswith("xcrd") or kl == "x"):
                lo = x
        # ⚠️ 우리 바다 밖이면 버린다. 이름이 뒤바뀐 자료를 여러 번 겪었다.
        if la is None or lo is None:
            continue
        if not (31.0 <= la <= 39.5 and 123.0 <= lo <= 133.0):
            la, lo = lo, la                      # 뒤바뀐 경우를 한 번 되돌려 본다
            if not (31.0 <= la <= 39.5 and 123.0 <= lo <= 133.0):
                print(f"[seabird] ⚠️ 범위 밖 좌표 버림: {code}")
                continue
        m[code] = (round(la, 5), round(lo, 5))
    print(f"[seabird] 조사지점 좌표 {len(m)}곳")
    return m


def handler(event=None, context=None):
    obs = pages(BIRD)
    if obs is None:
        raise RuntimeError("바닷새 API 가 키를 거절했다 — 활용신청을 확인할 것")
    print(f"[seabird] 관측 {len(obs)}건")

    coords = site_coords()

    spc = defaultdict(lambda: {"n": 0, "cnt": 0, "yrs": set(), "sci": "", "stations": set()})
    by_year = defaultdict(int)
    by_station = defaultdict(lambda: {"n": 0, "cnt": 0, "spc": set()})
    # ⚠️⚠️ 종마다 **등급을 세어서** 다수결로 정한다. 한 줄만 보고 정하면 안 된다.
    #    실제로 왜가리(1,961건)가 멸종위기 I급으로 나왔다 — 흔한 새다.
    #    잘못 입력된 줄 하나가 종 전체를 물들인 것이다.
    #    나머지 6종(저어새·황새·넓적부리도요·노랑부리백로·청다리도요사촌·흰꼬리수리)은
    #    실제로 I급이 맞았다. 코드 해석은 옳고, 자료 한 줄이 틀린 것이다.
    grades = defaultdict(lambda: defaultdict(int))

    for r in obs:
        name = (r.get("localNm") or "").strip()
        if not name:
            continue
        yr = (r.get("exmnYr") or "").strip()
        st = (r.get("exmnLstaNo") or "").strip()
        # ⚠️ 개체수가 비어 있는 줄이 있다. 0 으로 세지 않는다 — 못 센 것과 없는 것은 다르다.
        c = num(r.get("enttCnt"))

        s = spc[name]
        s["n"] += 1
        if c:
            s["cnt"] += int(c)
        if yr:
            s["yrs"].add(yr)
            by_year[yr] += 1
        s["sci"] = s["sci"] or (r.get("sciNm") or "").strip()
        if st:
            s["stations"].add(st)
            b = by_station[st]
            b["n"] += 1
            b["spc"].add(name)
            if c:
                b["cnt"] += int(c)
        g = (r.get("xtrmCrsisGrdCn") or "").strip()
        if g in ("1", "2"):
            grades[name][g] += 1

    def grade_of(name, total):
        """멸종위기 등급을 정한다.

        ⚠️⚠️ **이 자료는 등급을 일관되게 적지 않는다.** 같은 종인데 어떤 줄엔 적고
           어떤 줄엔 비어 있다. 그래서 처음에 다수결(절반 넘기)로 했더니
           **실제 II급인 붉은어깨도요(16/105)·큰뒷부리도요(42/302)·
           쇠제비갈매기(6/59)가 통째로 떨어졌다.** 규칙이 틀렸던 것이다.

        ⚠️ 그런데 왜가리는 **1,961줄 중 1줄**(0.05%)에만 I급이 적혀 있었다.
           왜가리는 흔한 새다 — 이건 오타다. 자릿수가 다르다.

        → 두 개를 함께 요구한다: **2줄 이상 그리고 5% 이상.**
           왜가리(0.05%)와 표본이 2줄뿐인 벌매는 떨어지고, 위 세 종은 통과한다.
        ⚠️ 임계값은 우리가 정한 것이다. 그래서 몇 줄 중 몇 줄이었는지를
           함께 내보내 화면에서 밝힐 수 있게 한다. 근거를 숨기지 않는다.
        """
        g = grades.get(name)
        if not g:
            return None
        top, n = max(g.items(), key=lambda kv: kv[1])
        if n < 2 or n * 20 < total:
            print(f"[seabird] ⚠️ '{name}' 등급 {top} 이 {n}/{total} 줄뿐 — 버린다")
            return None
        return {"grade": top, "rows": n, "of": total}

    species = sorted(
        ({"ko": k, "sci": v["sci"], "records": v["n"], "individuals": v["cnt"],
          "years": sorted(v["yrs"]), "stations": len(v["stations"]),
          "endangered": grade_of(k, v["n"])}
         for k, v in spc.items()),
        key=lambda x: -x["records"])

    stations = []
    for code, v in sorted(by_station.items()):
        row = {"code": code, "records": v["n"], "individuals": v["cnt"],
               "species": len(v["spc"])}
        if coords and code in coords:
            row["lat"], row["lon"] = coords[code]
        stations.append(row)

    mapped = sum(1 for s in stations if "lat" in s)
    doc = {
        "updated": datetime.now(KST).isoformat(timespec="seconds"),
        "source": SOURCE,
        "license": LICENSE,
        # ⚠️ 화면이 "지도에 왜 안 보이나"를 스스로 설명할 수 있게 숫자를 같이 넘긴다.
        "hasCoords": bool(coords),
        "records": len(obs),
        "years": sorted(by_year.items()),
        "speciesCount": len(species),
        "species": species,
        "stations": stations,
        "stationsMapped": mapped,
        "note": {
            "ko": "조사한 해에 그 자리에서 센 기록입니다. ⚠️ 지금 거기 있다는 뜻이 아니고, "
                  "조사하지 않은 곳에 새가 없다는 뜻도 아닙니다.",
            "en": "Counts recorded at survey stations in the survey year — not live positions, "
                  "and absence of a station does not mean absence of birds.",
        },
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=21600")
    print(f"[seabird] ✔ {DST} — 종 {len(species)} · 정점 {len(stations)}"
          f"(좌표 {mapped}) · {len(body)/1024:.0f}KB")
    return {"ok": True, "species": len(species), "stations": len(stations),
            "mapped": mapped, "records": len(obs)}

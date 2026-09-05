"""생활기상지수 — 자외선·대기확산·꽃가루

무엇을 넣고 무엇을 뺐나
  넣은 것: 자외선(UV), 대기확산, 꽃가루(참나무·소나무)
    → 우리가 직접 계산할 수 없는 것들이다. 기상청 모델 산출물이다.
  뺀 것: 체감온도
    → **우리가 더 잘 만들 수 있다.** 이 API 는 시도 17곳이지만
      우리는 AWS 736지점의 기온·습도·풍속을 이미 받고 있어서
      같은 공식으로 736곳에서 낼 수 있다. 앱에서 계산한다.

⚠️ h0, h3, h6 … h75 는 **발표시각으로부터 N시간 뒤**의 값이다.
   검증: 15시 발표에서 h0=2(흐림), h6=0(21시 밤), h12=0(새벽3시),
        h15=1(06시 새벽), h18=8(09시 아침) — 밤에 0, 아침에 오름. 앞뒤가 맞는다.
   ⚠️ 요청한 시각이 아니라 **응답의 date 를 기준**으로 세야 한다.
      3시간 간격으로 발표되므로 요청 시각과 발표 시각이 다르다.

⚠️ 지역코드는 행정표준코드(법정동 10자리)다. 그런데 두 가지 함정이 있다.
   ① 강원·전북은 **옛 코드(42·45)가 안 되고** 특별자치도 코드(51·52)만 된다.
      옛 코드를 쓰면 그 지역이 조용히 빠진다.
   ② **광주(29)·전남(46)은 이 자료에 아예 없다.** 시군구까지 훑어도 전부
      "검색결과가 없습니다"였다. 우리 잘못이 아니라 자료의 공백이다 —
      조용히 빼지 말고 출력에 적어서 화면에서 "자료 없음"이라고 말할 수 있게 한다.

⚠️ 꽃가루는 **3~6월에만** 나온다. 7월에 비는 건 고장이 아니다.
   API 가 그렇게 알려주므로(resultCode 99) 그 문구를 그대로 담는다.

출력
  wind/kma-life.json
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

HOST = "https://apihub.kma.go.kr"
LIV = "/api/typ02/openApi/LivingWthrIdxServiceV3/"
HEA = "/api/typ02/openApi/HealthWthrIdxServiceV2/"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "wind/kma-life.json"
KST = timezone(timedelta(hours=9))

# 실측으로 확인한 시도 코드. ⚠️ 41→강원 51, 45→전북 52 로 바뀐 것을 반영했다.
SIDO = [
    ("1100000000", "서울"), ("2600000000", "부산"), ("2700000000", "대구"),
    ("2800000000", "인천"), ("2900000000", "광주"), ("3000000000", "대전"),
    ("3100000000", "울산"), ("3600000000", "세종"), ("4100000000", "경기"),
    ("5100000000", "강원"), ("4300000000", "충북"), ("4400000000", "충남"),
    ("5200000000", "전북"), ("4600000000", "전남"), ("4700000000", "경북"),
    ("4800000000", "경남"), ("5000000000", "제주"),
]

IDX = [
    ("uv",   LIV + "getUVIdxV3",            "자외선지수",   "UV index"),
    ("disp", LIV + "getAirDiffusionIdxV3",  "대기확산지수", "Air dispersion index"),
    ("oak",  HEA + "getOakPollenRiskIdxV2", "참나무 꽃가루", "Oak pollen risk"),
    ("pine", HEA + "getPinePollenRiskIdxV2", "소나무 꽃가루", "Pine pollen risk"),
]

# 자외선 단계. 기상청 기준.
UV_LEVEL = [(11, "위험", "Extreme"), (8, "매우높음", "Very high"),
            (6, "높음", "High"), (3, "보통", "Moderate"), (0, "낮음", "Low")]

s3 = boto3.client("s3", region_name=REGION)


def get(path, **p):
    q = urllib.parse.urlencode({**p, "authKey": KEY, "dataType": "JSON",
                                "pageNo": "1", "numOfRows": "10"})
    with kma_hub.track(path), urllib.request.urlopen(urllib.request.Request(f"{HOST}{path}?{q}", headers=UA),
                                timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def uv_level(v):
    for lo, ko, en in UV_LEVEL:
        if v >= lo:
            return ko, en
    return "낮음", "Low"


def pick_now(item, issued, now):
    """발표시각으로부터 지금까지 몇 시간인지 세어 가장 가까운 h 값을 고른다."""
    try:
        base = datetime.strptime(issued[:10], "%Y%m%d%H").replace(tzinfo=KST)
    except (TypeError, ValueError):
        return None, None
    ahead = (now - base).total_seconds() / 3600
    # h0, h3, h6 … 3시간 간격. 음수(발표가 미래)면 h0.
    step = max(0, int(round(ahead / 3) * 3))
    for k in (step, step - 3, step + 3, 0):
        v = item.get(f"h{k}")
        if v not in (None, ""):
            try:
                return float(v), k
            except ValueError:
                return None, None
    return None, None


@kma_hub.accounted("kma-life")
def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    now = datetime.now(KST)
    # 3시간 간격 발표. 조금 물러나 물어야 이미 나온 것을 받는다.
    tm = (now - timedelta(hours=3)).strftime("%Y%m%d%H")

    out, seasons, missing = {}, {}, {}
    for key, path, ko, en in IDX:
        regions, gone = {}, []
        season_msg = None
        for code, name in SIDO:
            try:
                j = get(path, areaNo=code, time=tm)
            except Exception as e:                       # noqa: BLE001
                print(f"[life] {key}/{name} 실패 —", repr(e)[:70])
                continue
            hdr = (j.get("response") or {}).get("header") or {}
            rc = hdr.get("resultCode")
            if rc != "00":
                msg = hdr.get("resultMsg") or ""
                # ⚠️ '제공기간이 아닙니다' 는 고장이 아니라 계절 자료다. 구분해서 담는다.
                if "제공기간" in msg:
                    season_msg = msg
                    break                                # 지역을 더 돌 이유가 없다
                gone.append(name)
                continue
            items = (((j.get("response") or {}).get("body") or {})
                     .get("items") or {}).get("item") or []
            if not items:
                gone.append(name)
                continue
            it = items[0]
            v, ahead = pick_now(it, it.get("date"), now)
            if v is None:
                gone.append(name)
                continue
            rec = {"value": v, "issuedKst": it.get("date"), "aheadHours": ahead}
            if key == "uv":
                rec["levelKo"], rec["levelEn"] = uv_level(v)
            regions[name] = rec

        if season_msg:
            seasons[key] = season_msg
        if gone:
            missing[key] = gone
        out[key] = {"ko": ko, "en": en, "regions": regions}

    if not any(v["regions"] for v in out.values()) and not seasons:
        # 모든 지수가 비었고 계절 안내도 없다 = 조회 실패(403 용량 초과·timeout). 빈 문서로 덮지 않는다.
        # 2026-09-05 12:50Z 에 지수가 하나도 없는 문서가 올라갔다(PHASE 2 QA). 이전 산출물이 남아 STALE 로 보이는 것이 맞다.
        reason = "quota_exhausted" if kma_hub.stop() else "all-failed"
        print(f"[life] {reason} — S3 미기록 · 회계 {dict(kma_hub.ledger.counts)}")
        return {"ok": False, "reason": reason, "calls": kma_hub.ledger.counts["calls"]}

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 생활·보건기상지수 (API허브)",
        "sourceEn": "KMA living & health weather indices (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "note": {
            "ko": "시도 단위 지수입니다. 값은 발표시각 기준이며 3시간 간격으로 갱신됩니다. "
                  "⚠️ 꽃가루는 3~6월에만 제공됩니다 — 그 밖의 달에 비는 것은 정상입니다. "
                  "⚠️ 광주·전남은 이 지수 자료에 지역이 등록돼 있지 않아 값이 없습니다.",
            "en": "Province-level indices, issued every 3 hours. ⚠️ Pollen is provided only from "
                  "March to June. ⚠️ Gwangju and Jeonnam are not registered in this dataset.",
        },
        "scales": {
            "uv": "0~2 낮음 · 3~5 보통 · 6~7 높음 · 8~10 매우높음 · 11+ 위험",
            "disp": "값이 클수록 대기가 잘 흩어진다 (오염이 덜 쌓인다)",
        },
        # ⚠️ 빠진 지역을 반드시 적는다. 조용히 빼면 화면에서 "그냥 없는 것"이 된다.
        "missingRegions": missing,
        "outOfSeason": seasons,
        "indices": out,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=1800")
    got = {k: len(v["regions"]) for k, v in out.items()}
    print(f"[life] {got} · 결측 {missing} · 계절외 {list(seasons)}")
    return {"ok": True, "counts": got, "missing": missing,
            "outOfSeason": list(seasons.keys())}

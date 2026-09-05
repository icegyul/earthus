"""한국 산악예보 — 산 정상의 날씨

왜 좋은가
  우리 관측 지점은 거의 다 평지에 있다. 대관령(772m)이 제일 높은 축이다.
  이건 **설악산 정상 1708m** 같은 곳의 예보를 준다.
  같은 시각 산 아래와 정상의 기온 차를 그대로 보여줄 수 있는 자료다.

  그리고 드물게도 응답에 **위경도·고도·산 이름이 전부 들어 있다.**
  지점정보 API 를 따로 부를 필요가 없다.

⚠️ 필드명이 `bastTime` 이다. `baseTime` 이 아니다 — 기상청 쪽 오타지만
   그대로 와서, 고쳐 읽으면 값이 안 잡힌다.

⚠️ base_time 을 안 주면 "값을 입력해주세요"만 온다. 발표시각은 정해져 있다.
   0500 로 물어서 실패하면 앞 시각으로 물러난다.

⚠️ mountainNum 은 **산 하나**를 가리킨다. 1~165 까지 있다 (166부터 "지점정보를 확인하세요").
   처음에 "무엇을 주든 전체가 온다"고 잘못 봤다 — 131KB 가 컸기 때문인데,
   그건 한 산의 12개 항목 × 60여 시간이라 그만큼이었을 뿐이다.
   가드(산이 5곳 미만이면 덮어쓰지 않음)가 이걸 잡아냈다. 가드를 빼지 말 것.

⚠️ 한 번 수집에 165요청 · 약 20MB 다. 한도가 하루 20,000회 / 5GB 이므로
   3시간 간격(하루 8회 = 1,320회 · 0.16GB)으로 돈다.
   더 자주 돌 이유도 없다 — 동네예보 자체가 3시간마다 나온다.

⚠️ **순차로 돌면 제한시간을 넘는다.** 한 곳에 130KB·약 4초라 165곳이면 660초다.
   처음에 순차로 짰다가 600초 타임아웃이 났고, 실패한 호출이 재시도되면서
   같은 수집이 여러 번 겹쳐 돌았다. 동시 요청으로 받는다.
   ⚠️ 동시 수를 더 올리지 말 것. 남의 서버다.

출력
  s3://<CACHE_BUCKET>/wind/kma-mountain.json
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from concurrent.futures import ThreadPoolExecutor

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

API = "https://apihub.kma.go.kr/api/typ08/getMountainWeather"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "wind/kma-mountain.json"
KST = timezone(timedelta(hours=9))

# 동네예보 발표시각 (KST). 최신부터 거슬러 시도한다.
BASE_TIMES = ["2300", "2000", "1700", "1400", "1100", "0800", "0500", "0200"]

# 예보 항목 코드 → 뜻. 화면에 코드를 그대로 보여줄 수는 없다.
CAT = {
    "TMP": ("기온", "°C"), "T3H": ("기온", "°C"),
    "REH": ("습도", "%"), "WSD": ("풍속", "m/s"), "VEC": ("풍향", "deg"),
    "PCP": ("강수량", ""), "POP": ("강수확률", "%"), "SNO": ("적설", ""),
    "SKY": ("하늘", ""), "PTY": ("강수형태", ""),
    "UUU": ("동서바람", "m/s"), "VVV": ("남북바람", "m/s"),
    "TMX": ("최고기온", "°C"), "TMN": ("최저기온", "°C"), "WAV": ("파고", "m"),
}

s3 = boto3.client("s3", region_name=REGION)


def get(**p):
    q = urllib.parse.urlencode({**p, "authKey": KEY})
    with kma_hub.track("getMountainWeather"), urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA),
                                timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


MAX_NUM = 165          # 실측: 166 부터 "지점정보를 확인하여 주시기 바랍니다"


def find_base():
    """쓸 수 있는 가장 최근 발표시각을 1번 지점으로 찾는다.
    ⚠️ 165곳을 다 돌기 전에 이걸 먼저 정해야 한다.
       지점마다 다른 발표시각을 섞으면 같은 표 안에서 시각이 어긋난다."""
    now = datetime.now(KST)
    for day in (0, 1):
        d = (now - timedelta(days=day)).strftime("%Y%m%d")
        for bt in BASE_TIMES:
            if day == 0 and bt > now.strftime("%H%M"):
                continue
            try:
                j = get(mountainNum="1", base_date=d, base_time=bt)
            except urllib.error.HTTPError as e:
                if e.code == 403:
                    raise
                continue
            if isinstance(j, list) and j:
                return d, bt
    return None, None


def reduce_one(rows):
    """한 산의 응답(700여 줄)에서 **항목마다 가장 이른 예보값**을 남긴다.

    ⚠️ 165곳 응답을 다 모으면 10만 줄이 넘어 메모리가 위험하다. 받는 즉시 줄인다.

    ⚠️ 처음엔 "가장 이른 시각 한 묶음"만 집었는데, **항목마다 예보시각이 다르다.**
       그 결과 한라산·설악산·덕유산·오대산의 기온이 통째로 비었다 —
       그 시각 묶음에 TMP 가 없었을 뿐인데 자료가 없는 것처럼 보였다.
       그래서 항목별로 따로 가장 이른 값을 고른다.
       ⚠️ 대신 항목끼리 시각이 어긋날 수 있으므로, 기온의 시각을 따로 적어 둔다.
    """
    lat = lon = alt = name = None
    pick = {}                                             # cat -> (시각, 값)
    for r in rows:
        if name is None:
            name = r.get("stn_nm")
            try:
                lat, lon = float(r["lat"]), float(r["lon"])
            except (KeyError, TypeError, ValueError):
                return None
            try:
                alt = round(float(r.get("alt")), 0)
            except (TypeError, ValueError):
                alt = None
        cat = r.get("category")
        t = f"{r.get('fcstBase','')}{r.get('fcstTime','')}"
        if not cat or not t or cat not in CAT:
            continue
        if cat not in pick or t < pick[cat][0]:
            pick[cat] = (t, r.get("fcstValue"))
    if not name or not pick:
        return None

    rec = {"name": name, "lat": round(lat, 5), "lon": round(lon, 5), "alt": alt}
    for cat, (_t, v) in pick.items():
        rec[cat] = v
    for cat in ("TMP", "T3H"):
        if cat in pick:
            try:
                rec["temp_c"] = float(pick[cat][1])
                # ⚠️ 기온이 언제 것인지 반드시 남긴다. 다른 자료와 비교할 때
                #    시각을 안 맞추면 기온감률이 거꾸로 나온다 (실제로 그렇게 나왔다).
                rec["tempFcstKst"] = pick[cat][0]
            except (TypeError, ValueError):
                pass
            break
    rec["fcstKst"] = min(t for t, _ in pick.values())
    return rec


WORKERS = 8            # ⚠️ 올리지 말 것. 남의 서버다.


def fetch_latest():
    """165곳을 동시에 받아 곧바로 줄인다. 한 곳이 실패해도 나머지는 살린다."""
    d, bt = find_base()
    if not d:
        return None, None, []

    def one(n):
        try:
            j = get(mountainNum=str(n), base_date=d, base_time=bt)
        except Exception:                                 # noqa: BLE001
            return None
        return reduce_one(j) if isinstance(j, list) and j else None

    out = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for rec in ex.map(one, range(1, MAX_NUM + 1)):
            if rec:
                out.append(rec)
    bad = MAX_NUM - len(out)
    if bad:
        print(f"[mountain] 실패·빈 응답 {bad}곳")
    return d, bt, out


@kma_hub.accounted("kma-mountain")
def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    try:
        d, bt, out = fetch_latest()
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"ok": False, "reason": "not-approved", "api": "getMountainWeather"}
        raise
    if not out:
        return {"ok": False, "reason": "empty"}

    out.sort(key=lambda x: -(x.get("alt") or 0))
    if len(out) < 5:
        raise RuntimeError(f"산이 너무 적다 ({len(out)}) — 덮어쓰지 않는다")

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 산악예보 (API허브 getMountainWeather)",
        "sourceEn": "KMA mountain forecast (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "baseDateKst": d, "baseTimeKst": bt, "tz": "KST",
        "note": {
            "ko": "산 정상·중턱의 예보입니다. 관측값이 아니라 **예보**입니다. "
                  "해발고도가 함께 있으니 산 아래 관측소와 같은 시각으로 비교할 수 있습니다. "
                  "⚠️ 등산 계획은 반드시 기상청 공식 발표를 확인하세요.",
            "en": "Forecasts for mountain summits and slopes — forecast, not observation. "
                  "Elevation is included so summits can be compared with valley stations at the "
                  "same time. ⚠️ Always check official KMA announcements before hiking.",
        },
        "fields": {k: v[0] for k, v in CAT.items()},
        "count": len(out),
        # ⚠️ 발표시각마다 자료가 올라온 산이 다르다. 165곳을 물어도 다 오지 않는다.
        #    (실측: 한 회차 145곳, 다음 회차 124곳 — 한라산이 빠진 적도 있다.)
        #    몇 곳을 물었는지 같이 적어야 "빠진 게 아니라 아직 안 나온 것"임이 보인다.
        "requested": MAX_NUM,
        "peaks": out,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=1800")
    print(f"[mountain] {len(out)}곳 · 발표 {d} {bt} · {len(body)/1024:.0f}KB")
    return {"ok": True, "peaks": len(out), "base": f"{d} {bt}",
            "highest": out[0]["name"] if out else None}

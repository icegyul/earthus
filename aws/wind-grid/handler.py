"""전지구 기상 격자 → 파티클 애니메이션 + 색상 오버레이용 JSON

왜 서버에서 만드나
  윈디처럼 바람이 흐르는 애니메이션을 그리려면 격자 형태의 u/v 성분이 필요하다.
  그런데 Open-Meteo 는 지점 API 라 한 번에 100지점까지만 받는다 (그 이상은 414).
  전지구 5° 격자면 2,592지점 = 26회 요청이다.
  이걸 브라우저마다 하게 두면 사용자 수만큼 곱해진다.
  → 서버가 1시간에 한 번 받아 S3 에 올리고, 앱은 파일 하나만 받는다.

왜 GFS GRIB 를 직접 안 쓰나
  NOAA GFS 원본은 GRIB2 라 eccodes(C 라이브러리)가 필요하다.
  Docker·ECR 권한이 없어 zip Lambda 로 가야 하는데 GRIB 디코더를 zip 에 넣기는 위험하다.
  Open-Meteo 가 제공하는 값도 결국 GFS/ECMWF 이므로 데이터 자체는 같은 계열이다.

결과
  s3://<CACHE_BUCKET>/wind/global.json
  { time, res, lat0, lon0, nx, ny, u, v, t, rh, tmax, tmin, fu, fv, fcDate }
    u/v    = 지금 바람 동/북 성분(m/s)
    t      = 지금 기온(°C),  rh = 상대습도(%)
    tmax   = **내일** 최고기온(°C)
    tmin   = **내일** 최저기온(°C)
    fu/fv  = **내일** 대표 바람 동/북 성분(m/s)  ← 일 최대풍속 + 우세풍향
    fcDate = 그 "내일"이 언제인지 (지점 현지 날짜, YYYY-MM-DD)

  ⚠️ 예보는 "내일"이다. 오늘 값을 예보라고 부르면 안 된다 —
     이미 지나간 시간이 섞여 있어서 최고기온이 낮게 나온다.
     그래서 forecast_days=2 를 받아 **인덱스 1**(내일)을 쓴다.

  ⚠️ 지점마다 시간대가 다르다. timezone=auto 를 주면 각 지점의 현지 날짜로
     하루가 잘린다. 그래야 "그 지역의 내일 최고기온"이 된다.
     UTC 로 자르면 날짜변경선 근처에서 하루가 어긋난다.

⚠️ 변수를 늘려도 요청 수는 그대로다.
   Open-Meteo 의 분당 한도는 "요청 수" 기준이라, 한 요청에 변수를 여러 개
   담으면 공짜로 데이터가 늘어난다. 실측으로 확인했다 (5개 변수, 응답 2초).
   그래서 기온·습도 오버레이를 위해 별도 Lambda 를 돌릴 필요가 없다.
"""

import json
import math
import os
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
API = "https://api.open-meteo.com/v1/forecast"

# 격자 간격(도). 촘촘할수록 예쁘지만 요청 수가 제곱으로 는다.
#   5° → 72×36 = 2,592지점 = 26회 요청 ≈ 50초
#   4° → 90×45 = 4,050지점 = 41회 요청 ≈ 75초
# 전지구 뷰에서 파티클은 격자 사이를 보간해 흐르므로 5° 로도 제트기류·무역풍이 잘 보인다.
RES = 5.0
LAT_MAX = 80.0            # 극지는 격자가 수렴해 의미가 없다
BATCH = 100               # Open-Meteo 가 URL 길이로 막는 한계 (실측, 그 이상은 414)
PACE = 6.0                # 요청 사이 간격(초). 0.15초로 던졌더니 6회 만에 429 가 났다.

dst = boto3.client("s3", region_name=DST_REGION)


def grid_points():
    lons = [(-180.0 + i * RES) for i in range(int(360 / RES))]
    lats = [(-LAT_MAX + j * RES) for j in range(int(2 * LAT_MAX / RES) + 1)]
    return lats, lons


def fetch_batch(pts, tries=4):
    """pts = [(lat, lon), ...] 최대 BATCH 개.

    ⚠️ Open-Meteo 는 분당 한도가 있다. 쉬지 않고 던지면 6회쯤에서 429 가 시작된다
       (실측: 2,376지점 중 600개만 채워짐). 간격을 두고, 걸리면 점점 더 기다린다.
    """
    q = urllib.parse.urlencode({
        "latitude": ",".join(f"{p[0]:.2f}" for p in pts),
        "longitude": ",".join(f"{p[1]:.2f}" for p in pts),
        # ⚠️ 변수를 늘려도 요청 수는 그대로다 — 안개(시정)·가뭄(토양수분)을 공짜로 얻는다.
        "current": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m,"
                   "visibility,soil_moisture_0_to_1cm",
        # ⚠️ 변수를 늘려도 요청 수는 그대로다 (파일 머리말 참고). 예보는 공짜로 얻는다.
        "daily": "temperature_2m_max,temperature_2m_min,"
                 "wind_speed_10m_max,wind_direction_10m_dominant",
        # [0]=오늘, [1]=내일 … [7]=7일 뒤.
        # ⚠️ 요청 수는 그대로다 — 응답만 커진다(실측: 변수를 늘려도 한도는 요청 수 기준).
        #    앱은 여전히 내일([1])만 쓰고, 나머지는 예보 검증용으로 아카이브에만 들어간다.
        #    리드타임별 정확도("3일 전 예보는 얼마나 맞나")를 물으려면 이게 있어야 한다.
        "forecast_days": "8",
        "timezone": "auto",            # 지점 현지 날짜로 하루를 자른다
        "wind_speed_unit": "ms",
    })
    wait = 8
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{API}?{q}", timeout=45) as r:
                d = json.load(r)
            return d if isinstance(d, list) else [d]
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == tries - 1:
                raise
            print(f"  429 — {wait}초 대기 후 재시도")
            time.sleep(wait)
            wait *= 2
    return []


def handler(event, context):
    lats, lons = grid_points()
    ny, nx = len(lats), len(lons)
    order = [(la, lo) for la in lats for lo in lons]

    u = [0.0] * (nx * ny)
    v = [0.0] * (nx * ny)
    t2 = [None] * (nx * ny)      # 기온 °C
    rh = [None] * (nx * ny)      # 상대습도 %
    # ── 내일 예보 ──
    tmax = [None] * (nx * ny)
    tmin = [None] * (nx * ny)
    fu = [None] * (nx * ny)
    fv = [None] * (nx * ny)
    fc_dates = {}                # 현지 날짜 → 개수 (대표 날짜를 고르기 위해)
    # 지점별 UTC 오프셋(시간).
    #   ⚠️ fcDate 는 전지구 대표값 하나뿐이다. 날짜변경선 때문에 지점마다 "내일"이
    #      다른 날짜인데, 대표값만으로는 그걸 되살릴 수 없다.
    #      1년 뒤 "이 예보가 맞았나"를 따지려면 그 지역의 그날로 관측과 맞춰야 하고,
    #      그러려면 지점별 오프셋이 있어야 한다. 지금 안 남기면 복구할 수 없다.
    tzo = [None] * (nx * ny)
    # ── 리드타임별 예보 (D+1 ~ D+7) ──
    # ⚠️ 앱에는 안 쓴다. 아카이브 전용이다 (wind/global.json 을 키우면 안 된다).
    #    "3일 전 예보가 얼마나 맞았나"는 이 자료 없이는 영원히 물을 수 없다.
    lead_tmax = [[None] * (nx * ny) for _ in range(7)]
    lead_tmin = [[None] * (nx * ny) for _ in range(7)]
    vis = [None] * (nx * ny)     # 시정(m) — 안개
    soil = [None] * (nx * ny)    # 표층 토양수분(m³/m³) — 가뭄의 대용 지표
    ok = 0
    fail = 0
    daily_ok = 0

    for i in range(0, len(order), BATCH):
        chunk = order[i:i + BATCH]
        try:
            res = fetch_batch(chunk)
        except Exception as e:
            fail += len(chunk)
            print(f"[batch {i}] 실패: {e}")
            continue
        for k, item in enumerate(res):
            c = (item or {}).get("current") or {}
            sp = c.get("wind_speed_10m")
            dr = c.get("wind_direction_10m")
            idx = i + k
            if sp is None or dr is None or idx >= len(u):
                fail += 1
                continue
            # ⚠️ 기상에서 풍향은 "바람이 불어오는 쪽"이다.
            #    파티클은 불어가는 쪽으로 움직여야 하므로 180° 돌린다.
            th = math.radians(dr + 180.0)
            u[idx] = round(sp * math.sin(th), 1)   # 동쪽(+)
            v[idx] = round(sp * math.cos(th), 1)   # 북쪽(+)
            tv = c.get("temperature_2m")
            hv = c.get("relative_humidity_2m")
            t2[idx] = round(tv, 1) if tv is not None else None
            rh[idx] = int(hv) if hv is not None else None
            vv = c.get("visibility")
            sm = c.get("soil_moisture_0_to_1cm")
            vis[idx] = int(vv) if vv is not None else None
            soil[idx] = round(sm, 3) if sm is not None else None
            ok += 1

            # ── 내일(인덱스 1) 예보 ──
            # ⚠️ 값이 없으면 None 으로 둔다. 오늘 값으로 대신 채우면
            #    "예보"라고 표시된 자리에 이미 지나간 값이 들어간다.
            d = (item or {}).get("daily") or {}

            def day1(key):
                arr = d.get(key)
                return arr[1] if isinstance(arr, list) and len(arr) > 1 else None

            tx, tn = day1("temperature_2m_max"), day1("temperature_2m_min")
            ws, wd = day1("wind_speed_10m_max"), day1("wind_direction_10m_dominant")
            if tx is not None:
                tmax[idx] = round(tx, 1)
            if tn is not None:
                tmin[idx] = round(tn, 1)
            if ws is not None and wd is not None:
                # 현재 바람과 같은 규칙 — 풍향은 "불어오는 쪽"이므로 180° 돌린다
                fth = math.radians(wd + 180.0)
                fu[idx] = round(ws * math.sin(fth), 1)
                fv[idx] = round(ws * math.cos(fth), 1)
            # 리드타임별로 D+1..D+7 을 담는다
            for L in range(7):
                a1 = d.get("temperature_2m_max")
                a2 = d.get("temperature_2m_min")
                if isinstance(a1, list) and len(a1) > L + 1 and a1[L + 1] is not None:
                    lead_tmax[L][idx] = round(a1[L + 1], 1)
                if isinstance(a2, list) and len(a2) > L + 1 and a2[L + 1] is not None:
                    lead_tmin[L][idx] = round(a2[L + 1], 1)

            if tx is not None or ws is not None:
                daily_ok += 1
                dd = day1("time") or (d.get("time")[1] if isinstance(d.get("time"), list)
                                      and len(d.get("time")) > 1 else None)
                if dd:
                    fc_dates[dd] = fc_dates.get(dd, 0) + 1
            off = (item or {}).get("utc_offset_seconds")
            if off is not None:
                tzo[idx] = round(off / 3600.0, 1)
        time.sleep(PACE)   # 분당 한도를 넘지 않도록 간격을 둔다

    if ok < len(order) * 0.5:
        raise RuntimeError(f"격자 절반도 못 채움 ({ok}/{len(order)})")

    out = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "res": RES, "lat0": -LAT_MAX, "lon0": -180.0,
        "nx": nx, "ny": ny, "unit": "m/s",
        "source": "Open-Meteo (GFS/ECMWF)",
        "vars": ["u", "v", "t", "rh", "vis", "soil", "tmax", "tmin", "fu", "fv"],
        "u": u, "v": v, "t": t2, "rh": rh,
        # ⚠️ vis 는 미터다. 안개 판정은 화면 쪽 눈금에서 한다 (1km 미만이 안개).
        #    여기서 "안개다/아니다"로 바꾸지 않는다 — 원자료를 그대로 남긴다.
        "vis": vis, "soil": soil,
        # ── 내일 예보 ──
        # ⚠️ fcDate 는 "가장 많은 지점이 공유하는 현지 날짜"다. 전지구를 한 날짜로
        #    묶을 수는 없다(날짜변경선). 앱은 이 값을 "대체로 이 날짜"로만 쓴다.
        "tmax": tmax, "tmin": tmin, "fu": fu, "fv": fv,
        "fcDate": (max(fc_dates, key=fc_dates.get) if fc_dates else None),
        "fcFilled": daily_ok,
        # ⚠️ 앱은 tzo 를 쓰지 않는다. 아카이브 전용이다.
        #    지점별 현지 날짜를 되살리는 유일한 열쇠라, 이걸 빼면 나중에 예보 검증을
        #    할 수 없다. 다시 받을 수도 없다 — 예보는 갱신되면 덮어써진다.
        "tzo": tzo,
    }
    # ⚠️ 리드타임 예보는 **별도 파일**이다.
    #    global.json 에 넣으면 앱이 매시간 7배 커진 파일을 받게 된다.
    #    이건 아카이버만 읽는다.
    lead_doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "res": RES, "lat0": -LAT_MAX, "lon0": -180.0, "nx": nx, "ny": ny,
        "source": "Open-Meteo (GFS/ECMWF)",
        "note": "D+1..D+7 일별 최고·최저기온. 예보 정확도 검증 전용 — 앱은 쓰지 않는다.",
        "leads": [1, 2, 3, 4, 5, 6, 7],
        "tzo": tzo,
        "tmax": lead_tmax, "tmin": lead_tmin,
    }
    lead_body = json.dumps(lead_doc, separators=(",", ":")).encode()
    dst.put_object(Bucket=DST_BUCKET, Key="wind/forecast-leads.json",
                   Body=lead_body, ContentType="application/json",
                   CacheControl="public, max-age=1800")
    print(f"[lead] D+1~D+7 {len(lead_body)/1024:.0f}KB")

    body = json.dumps(out, separators=(",", ":")).encode()
    dst.put_object(
        Bucket=DST_BUCKET, Key="wind/global.json",
        Body=body, ContentType="application/json",
        CacheControl="public, max-age=1800",
    )
    tn = sum(1 for x in t2 if x is not None)
    print(f"[out] {nx}x{ny}  바람 {ok} 기온 {tn} 실패 {fail}  {len(body)/1024:.0f}KB")
    return {"ok": True, "nx": nx, "ny": ny, "filled": ok, "temp": tn,
            "failed": fail, "bytes": len(body)}

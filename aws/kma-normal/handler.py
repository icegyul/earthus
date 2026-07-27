"""한국 지상 평년값 — 기상청 공식 기준

왜 필요한가
  "오늘 서울이 평년보다 몇 도"를 **정식 기준**으로 말하려면 기상청 평년값이 있어야 한다.
  지금 우리 평년 기준선은 바다(NOAA OISST)뿐이라, 육상은 "평년보다"를 말할 수 없었다.

⚠️ 평년값은 **기간이 여러 개**다. 섞으면 안 된다.
     tmst=1991 → 1961~1990
     tmst=2001 → 1971~2000
     tmst=2011 → 1981~2010
     tmst=2021 → 1991~2020   ← 지금 쓰는 기준
   같은 날짜라도 기준 기간이 다르면 값이 다르다. 화면에 반드시 기간을 적는다.
   ⚠️ 우리 해수면온도 평년(OISST)도 1991~2020 이다 — 일부러 맞췄다.
      기준 기간이 다른 두 평년을 나란히 놓으면 비교가 성립하지 않는다.

⚠️ 결측이 **-99.9 / -99.90** 이다. 앞서 지상관측에서 쓴 -9/-99/-999 와 다르다.
   그대로 쓰면 습도 -99.9% 가 된다.

⚠️ 전체 지점(stn=0)으로 부르면 **그날 하루치만** 온다 (219줄).
   지점별 366일을 받으려면 stn 을 하나씩, MM1~DD2 로 한 해를 지정해야 한다.
   지점이 100곳 남짓이라 100번 부른다 — 하루 한 번만 도니 부담이 없다.

출력
  s3://<CACHE_BUCKET>/wind/kma-normal.json
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

UA = {"User-Agent": "earthus/0.1 (+globe app)"}
API = "https://apihub.kma.go.kr/api/typ01/url/sfc_norm1.php"
DST = "wind/kma-normal.json"
OBS = "wind/kma-aws.json"          # 어느 지점을 받을지는 실제 관측 목록에서 가져온다

PERIOD = "2021"                    # 1991~2020 — OISST 평년과 같은 기간
PERIOD_LABEL = "1991-2020"

s3 = boto3.client("s3", region_name=REGION)

# 일 평년값 열 순서 — help=1 의 **마지막 주석 줄**이 실제 열 순서다.
#   ST,STN,MM,DD,TA,TA_MAX,TA_MIN,RN,EV,WS,HM,PV,SS,CA_TOT,PA,PS
# ⚠️ 위쪽 설명 목록의 순서(RN → RN_DUR → EV → WS → HM)와 **다르다**.
#    설명 목록은 있을 수 있는 항목을 전부 나열한 것이고, 실제 자료에는 일부만 온다.
#    설명 순서대로 읽으면 풍속 자리에서 습도를 읽는다 — 값이 그럴듯해서 안 걸린다.
I_TA, I_TMAX, I_TMIN, I_RN = 4, 5, 6, 7
MISSING = {-99.9, -99.90, -9.0, -99.0, -999.0}


def get(**params):
    q = urllib.parse.urlencode({**params, "authKey": KEY})
    with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=60) as r:
        return r.read().decode("euc-kr", "replace")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f in MISSING else f


def parse(txt):
    """쉼표 구분 자료 줄만 뽑는다. ⚠️ 줄 끝에 '=' 가 붙어 있다."""
    out = []
    for line in txt.split("\n"):
        t = line.strip().rstrip("=").strip()
        if not t or t.startswith("#"):
            continue
        f = [x.strip() for x in t.split(",")]
        if len(f) < 8:
            continue
        try:
            mm, dd = int(float(f[2])), int(float(f[3]))
        except (ValueError, IndexError):
            continue
        out.append((mm, dd, num(f[I_TA]), num(f[I_TMAX]), num(f[I_TMIN]), num(f[I_RN])))
    return out


def station_ids():
    """관측 자료에 실제로 나오는 지점만 받는다.
    ⚠️ 없는 지점을 100번 물어보면 시간만 버린다."""
    try:
        j = json.loads(s3.get_object(Bucket=BUCKET, Key=OBS)["Body"].read())
        return [str(r["id"]) for r in j.get("stations", []) if r.get("id")]
    except Exception as e:                                   # noqa: BLE001
        print("[normal] 관측 목록을 못 읽음 —", repr(e)[:80])
        return []


def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}

    ids = event.get("stations") or station_ids()
    if not ids:
        raise RuntimeError("받을 지점 목록이 없다")

    out, fail = {}, []
    for sid in ids:
        try:
            rows = parse(get(tmst=PERIOD, norm="D", stn=sid,
                             MM1="1", DD1="1", MM2="12", DD2="31"))
        except urllib.error.HTTPError as e:
            if e.code == 403:
                return {"ok": False, "reason": "not-approved",
                        "message": "sfc_norm1 활용신청이 필요합니다."}
            fail.append(sid)
            continue
        except Exception:                                    # noqa: BLE001
            fail.append(sid)
            continue
        # 연중 일자 → [평균, 최고, 최저, 강수] 로 줄여 담는다.
        # ⚠️ 366칸으로 고정한다. 2020(윤년)을 기준으로 일자를 세므로
        #    2/29 자리가 항상 60번째로 고정되고, 해마다 색인이 밀리지 않는다.
        arr = [None] * 366
        for mm, dd, ta, tmax, tmin, rn in rows:
            try:
                doy = datetime(2020, mm, dd).timetuple().tm_yday - 1
            except ValueError:
                continue
            if 0 <= doy < 366:
                arr[doy] = [ta, tmax, tmin, rn]
        got = sum(1 for x in arr if x)
        if got >= 300:
            out[sid] = arr
        time.sleep(0.15)

    if len(out) < 20:
        raise RuntimeError(f"평년값을 받은 지점이 너무 적다 ({len(out)}) — 덮어쓰지 않는다")

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 지상 평년값 (API허브 sfc_norm1)",
        "sourceEn": "KMA surface climatological normals (API Hub)",
        "period": PERIOD_LABEL,
        "units": ["degC", "degC", "degC", "mm"],
        "fields": ["평균기온", "최고기온", "최저기온", "강수량"],
        "note": {
            "ko": f"{PERIOD_LABEL} 평년값입니다. 연중 일자(1~366)별 [평균기온, 최고기온, 최저기온, 강수량]입니다. "
                  "⚠️ 평년값은 기준 기간마다 값이 다릅니다 — 다른 기간과 섞어 쓰면 안 됩니다. "
                  "우리 해수면온도 평년(NOAA OISST)도 같은 1991–2020 기준으로 맞췄습니다.",
            "en": f"Climatological normals for {PERIOD_LABEL}: mean, max and min temperature and "
                  "precipitation by day of year (1–366). ⚠️ Normals differ by baseline period and "
                  "must not be mixed; our sea surface normals (NOAA OISST) use the same 1991–2020 "
                  "baseline.",
        },
        "count": len(out),
        "failed": fail[:20],
        "normals": out,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=86400")
    print(f"[normal] {len(out)}지점 · 실패 {len(fail)} · {len(body)/1024:.0f}KB")
    return {"ok": True, "stations": len(out), "failed": len(fail), "period": PERIOD_LABEL}

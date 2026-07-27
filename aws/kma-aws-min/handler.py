"""전국 방재기상관측(AWS) 매분자료 — 510지점

왜 이게 제일 먼저인가
  지금 쓰는 ASOS 97지점은 시·군에 하나꼴이라 "우리 동네"가 아니다.
  AWS 는 510지점, 읍·면 단위다. 게다가 **1분 주기**라 소나기가 들어오는 게 보인다.
  밀도가 올라가면 그 위에 얹는 기능(가장 가까운 관측소, 평년 대비, 고도별 기온차)이
  전부 같이 좋아진다. 그래서 이게 바탕이다.

⚠️ 결측 규칙이 **또 다르다.** 이 API 는 "-50 이하면 관측이 없거나 에러"라고 도움말에 적혀 있다.
   앞서 만든 수집기들은 -9 / -99 / -99.9 / -999 를 썼다. 같은 기관인데 API마다 다르다.
   그래서 여기서는 임계값 방식(-50 이하)을 쓴다.
   ⚠️ 풍향(0~360)·강수량(0 이상)에는 음수가 정상값으로 올 일이 없으니 안전하다.
      단 기온·이슬점에 -50 을 쓰는 건 한국이라 가능한 것이다. 남극 자료에 그대로 쓰면 안 된다.

⚠️ 좌표는 stn_inf 를 **inf=AWS** 로 받아야 한다. inf=SFC 는 ASOS 97지점뿐이다.
   ⚠️ stn_inf 헤더에는 STN 이 두 번 나온다(지점번호/지점주소코드). 먼저 나온 것을 써야 한다 —
      kma-aws 에서 이걸로 좌표가 29/97 만 붙은 적이 있다.

출력
  s3://<CACHE_BUCKET>/wind/kma-aws-min.json
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

HOST = "https://apihub.kma.go.kr"
OBS = "/api/typ01/cgi-bin/url/nph-aws2_min"
STN = "/api/typ01/url/stn_inf.php"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "wind/kma-aws-min.json"
STN_CACHE = "wind/kma-aws-stations.json"
KST = timezone(timedelta(hours=9))

MISSING_BELOW = -50.0          # 도움말 명시: -50 이하는 결측/에러

# 열 순서 — 주석의 자[尺] 줄에서 읽었다.
COLS = ["tm", "stn", "wd1", "ws1", "wds", "wss", "wd10", "ws10", "ta", "re",
        "rn15", "rn60", "rn12h", "rnday", "hm", "pa", "ps", "td"]

s3 = boto3.client("s3", region_name=REGION)


def get(path, **p):
    q = urllib.parse.urlencode({**p, "authKey": KEY})
    with urllib.request.urlopen(urllib.request.Request(f"{HOST}{path}?{q}", headers=UA),
                                timeout=90) as r:
        return r.read().decode("euc-kr", "replace")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f <= MISSING_BELOW else f


def stations():
    """AWS 지점번호 → 위경도·이름·고도. 하루 한 번만."""
    try:
        c = json.loads(s3.get_object(Bucket=BUCKET, Key=STN_CACHE)["Body"].read())
        age = (datetime.now(timezone.utc)
               - datetime.strptime(c["generated"], "%Y-%m-%dT%H:%M:00Z")
               .replace(tzinfo=timezone.utc)).total_seconds()
        if age < 86400 and c.get("stations"):
            return c["stations"]
    except Exception:                                    # noqa: BLE001
        pass

    txt = get(STN, inf="AWS", stn="", tm="")
    header, out = None, {}
    for line in txt.split("\n"):
        t = line.rstrip()
        if not t:
            continue
        if t.startswith("#"):
            if header is not None:
                continue                                  # 뒤 주석은 단위 줄이다
            cols = t.lstrip("#").split()
            if len(cols) > 3 and "STN" in cols:
                header = cols
            continue
        if header is None:
            continue
        f = t.split()
        # ⚠️ STN 이 두 번 나온다. **먼저 나온 것**이 지점번호다.
        idx = {}
        for i, c in enumerate(header):
            idx.setdefault(c, i)
        try:
            sid = f[idx.get("STN", 0)]
            lat, lon = float(f[idx["LAT"]]), float(f[idx["LON"]])
        except (KeyError, IndexError, ValueError):
            continue
        rec = {"lat": round(lat, 4), "lon": round(lon, 4)}
        for k, key in (("STN_KO", "name"), ("HT", "alt")):
            try:
                v = f[idx[k]]
                rec[key] = round(float(v), 1) if key == "alt" else v
            except (KeyError, IndexError, ValueError):
                pass
        out[sid] = rec
    if out:
        s3.put_object(Bucket=BUCKET, Key=STN_CACHE,
                      Body=json.dumps({"generated": datetime.now(timezone.utc)
                                       .strftime("%Y-%m-%dT%H:%M:00Z"),
                                       "count": len(out), "stations": out},
                                      ensure_ascii=False, separators=(",", ":")).encode(),
                      ContentType="application/json; charset=utf-8")
    return out


def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}

    # ⚠️ 지금 이 분의 자료는 아직 안 올라와 있다. 몇 분 물러나서 묻는다.
    now = datetime.now(KST)
    txt = ""
    for back in (3, 6, 12):
        tm = (now - timedelta(minutes=back)).strftime("%Y%m%d%H%M")
        try:
            txt = get(OBS, tm2=tm, stn="0", disp="0", help="0")
        except urllib.error.HTTPError as e:
            if e.code == 403:
                return {"ok": False, "reason": "not-approved", "api": "nph-aws2_min"}
            raise
        if any(l.strip() and not l.startswith("#") for l in txt.split("\n")):
            break

    try:
        stn = stations()
    except Exception as e:                               # noqa: BLE001
        print("[aws-min] 지점정보 실패 —", repr(e)[:80])
        stn = {}

    out, observed = [], None
    for line in txt.split("\n"):
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        f = t.split()
        if len(f) < 10:
            continue
        rec = {"id": f[1]}
        observed = observed or f[0]
        for i, name in enumerate(COLS):
            if i < 2 or i >= len(f):
                continue
            rec[name] = num(f[i])
        m = stn.get(f[1])
        if m:
            rec["name"] = m.get("name")
            rec["lat"], rec["lon"] = m["lat"], m["lon"]
            if m.get("alt") is not None:
                rec["alt"] = m["alt"]
        out.append(rec)

    if len(out) < 100:
        raise RuntimeError(f"지점이 너무 적다 ({len(out)}) — 덮어쓰지 않는다")

    withpos = sum(1 for r in out if r.get("lat") is not None)
    raining = sum(1 for r in out if (r.get("rn60") or 0) > 0)
    temps = [r["ta"] for r in out if r.get("ta") is not None]

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedKst": observed,
        "source": "기상청 방재기상관측 AWS 매분자료 (API허브)",
        "sourceEn": "KMA Automatic Weather System, 1-minute data (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "note": {
            "ko": "전국 방재기상관측망(AWS)의 1분 관측입니다. 예보가 아니라 실측입니다. "
                  "시각은 한국시(KST)이며, 자료가 올라오는 데 2~3분 걸립니다.",
            "en": "One-minute observations from Korea's AWS network — measurements, not forecasts. "
                  "Times are KST; data appears 2–3 minutes after the observation.",
        },
        "fields": {
            "ta": "기온 °C", "hm": "습도 %", "ws1": "1분 평균 풍속 m/s",
            "wd1": "1분 평균 풍향 deg", "wss": "최대 순간 풍속 m/s",
            "rn15": "15분 누적 강수 mm", "rn60": "60분 누적 강수 mm",
            "rnday": "일 누적 강수 mm", "ps": "해면기압 hPa", "td": "이슬점 °C",
        },
        "count": len(out),
        "withPosition": withpos,
        "rainingNow": raining,
        "tempRange": ([round(min(temps), 1), round(max(temps), 1)] if temps else None),
        "stations": out,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=300")
    print(f"[aws-min] {len(out)}지점 · 좌표 {withpos} · 강수 {raining} · {len(body)/1024:.0f}KB")
    return {"ok": True, "stations": len(out), "withPosition": withpos,
            "raining": raining, "observed": observed, "tempRange": doc["tempRange"]}

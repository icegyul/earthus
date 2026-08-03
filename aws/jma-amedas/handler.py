# -*- coding: utf-8 -*-
"""일본 AMeDAS 실측 — 1,286지점 · 10분

왜 만들었나
  ⚠️ 일본에 "한국처럼" 자료를 붙이려다 산 화면에서 막혔다. 그 화면의 값어치는
     **기상청 산악예보 − AWS 실측의 차이**인데 일본은 그 짝이 없다.
     그래서 화면을 억지로 채우는 대신 **일본이 실제로 가진 것**을 가져온다.

  AMeDAS 는 일본 기상청의 자동관측망이다. **1,286지점 · 10분**.
  ⚠️ 기상청 AWS 가 약 600지점이니 **두 배 이상 촘촘하다.**
  그리고 인증키가 필요 없다 — JMA 방재 사이트가 쓰는 JSON 을 그대로 공개한다.

원본  www.jma.go.jp/bosai/amedas/
        data/map/{YYYYMMDDHHMMSS}.json   10분 격자 (초 단위까지 파일명에 들어간다)
        const/amedastable.json           지점 이름·좌표·고도
결과  s3://<CACHE_BUCKET>/wind/jp-amedas.json

⚠️⚠️ **이건 "정식 API" 가 아니다.** JMA 가 규격을 보장한다고 문서로 약속한 적이 없다.
   널리 쓰이고 우리도 이미 지진·태풍에 같은 경로를 쓰지만,
   **어느 날 구조가 바뀌어도 공지가 없을 수 있다.** → health 감시에 반드시 넣는다.

⚠️ 값의 형식이 특이하다: 대부분 [값, 품질플래그] 쌍이다.
   플래그를 값으로 잘못 읽으면 기온이 0 으로 깔린다.
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/jp-amedas.json"
BASE = "https://www.jma.go.jp/bosai/amedas"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
JST = timezone(timedelta(hours=9))


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
        return json.load(r)


def val(v):
    """⚠️⚠️ AMeDAS 는 값을 **[값, 품질플래그]** 로 준다.
    그냥 float() 하면 리스트라 터지고, v[1] 을 쓰면 **플래그가 기온이 된다.**
    플래그 0 이 정상이고, 0 이 아니면 **값을 버린다** — 의심스러운 값을 그대로
    내보내면 그 지점만 조용히 틀린다."""
    if not isinstance(v, (list, tuple)) or len(v) < 2:
        return None
    x, flag = v[0], v[1]
    if x is None or flag != 0:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def dms(a):
    """지점표 좌표는 [도, 분] 이다. 십진도로 바꾼다.
    ⚠️ 그냥 a[0] 만 쓰면 **분이 통째로 버려져** 최대 1도(111km) 어긋난다."""
    try:
        return round(a[0] + a[1] / 60.0, 5)
    except (TypeError, IndexError):
        return None


def handler(event=None, context=None):
    tbl = get(f"{BASE}/const/amedastable.json")

    # ⚠️ 파일명이 10분 격자다. 지금 시각을 그대로 쓰면 아직 없는 파일을 짚는다.
    #    실측으로 20~30분 지연이 있어 넉넉히 뒤로 물러나 **찾아질 때까지** 내려간다.
    now = datetime.now(timezone.utc).astimezone(JST)
    obs, stamp = None, None
    t = now.replace(second=0, microsecond=0)
    t = t.replace(minute=t.minute // 10 * 10)
    for back in range(0, 9):                    # 최대 90분 전까지
        tt = t - timedelta(minutes=10 * back)
        try:
            obs = get(f"{BASE}/data/map/{tt:%Y%m%d%H%M%S}.json")
            stamp = tt
            break
        except Exception:                        # noqa: BLE001
            continue
    if not obs:
        return {"ok": False, "reason": "최근 90분 안에 관측 파일이 없습니다"}

    rows = []
    for sid, o in obs.items():
        m = tbl.get(sid)
        if not m:
            continue
        lat, lon = dms(m.get("lat") or []), dms(m.get("lon") or [])
        if lat is None or lon is None:
            continue
        r = {
            "id": sid,
            # ⚠️ 이름은 일본어(kjName)와 영문(enName)을 **둘 다** 남긴다.
            #    한국어는 여기서 만들지 않는다 — 화면이 규칙으로 옮긴다(jpname.js).
            "ja": m.get("kjName"), "en": m.get("enName"),
            "lat": lat, "lon": lon, "alt": m.get("alt"),
            "temp": val(o.get("temp")), "hum": val(o.get("humidity")),
            "wind": val(o.get("wind")), "wdir": val(o.get("windDirection")),
            "rain10": val(o.get("precipitation10m")),
            "rain1h": val(o.get("precipitation1h")),
            "rain24h": val(o.get("precipitation24h")),
            "sun1h": val(o.get("sun1h")),
            "snow": val(o.get("snow")),
            "pres": val(o.get("pressure")),
        }
        if any(r[k] is not None for k in ("temp", "wind", "rain10", "pres")):
            rows.append(r)

    have = lambda k: sum(1 for r in rows if r[k] is not None)
    doc = {
        "time": stamp.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "timeJst": stamp.strftime("%Y-%m-%d %H:%M"),
        "count": len(rows),
        "have": {"temp": have("temp"), "wind": have("wind"),
                 "rain10": have("rain10"), "hum": have("hum"), "pres": have("pres")},
        "source": "일본 기상청 AMeDAS",
        "sourceEn": "JMA AMeDAS",
        "note": {
            "ko": "일본 기상청 자동관측망이 10분마다 잰 값입니다. "
                  f"⚠️ 지점마다 재는 항목이 다릅니다 — 기온 {have('temp')}곳, "
                  f"바람 {have('wind')}곳, 기압 {have('pres')}곳입니다. "
                  "없는 항목은 그 지점이 안 재는 것이지 값이 0 인 것이 아닙니다.\n"
                  "⚠️ 이 경로는 JMA 가 방재 사이트용으로 공개한 JSON 이고 "
                  "**정식 API 로 규격을 보장한 것은 아닙니다.** 구조가 바뀌면 "
                  "공지 없이 끊길 수 있습니다.",
            "en": "JMA AMeDAS automatic observations, every 10 minutes. "
                  "Not all stations measure all elements.",
        },
        "stations": rows,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=300")
    lag = (now - stamp).total_seconds() / 60
    print(f"[amedas] {len(rows)}지점 · {stamp:%H:%M} JST ({lag:.0f}분 전) · "
          f"기온 {have('temp')} 바람 {have('wind')} · {len(body)/1024:.0f}KB")
    return {"ok": True, "count": len(rows), "timeJst": doc["timeJst"],
            "lagMin": round(lag), "have": doc["have"]}

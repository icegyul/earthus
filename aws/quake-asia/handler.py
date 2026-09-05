# -*- coding: utf-8 -*-
"""한국·일본 지진 — 그 나라 기관이 직접 낸 것

왜 만들었나
  ⚠️⚠️ 지금 앱의 지진은 **USGS 하나뿐**이다. 한국 지진을 미국 기관을 거쳐 보고 있다.
     기상청이 직접 주는 것을 안 쓰고 있었다 — 키는 이미 있었다.
  그리고 USGS 는 규모(M)만 준다. 사람에게 중요한 것은 **진도**다 —
  M5.8 이라도 멀면 안 흔들리고, M3 이라도 바로 밑이면 놀란다.
  기상청과 JMA 는 **지역별 진도**를 준다. 그게 이 자료를 쓰는 이유다.

원본
  기상청  apihub.kma.go.kr … eqk_now.php   (인증키 필요, 공공누리 제1유형)
  JMA     www.jma.go.jp/bosai/quake/data/list.json  (인증키 불필요)

결과  s3://<CACHE_BUCKET>/events/quake-asia.json

⚠️⚠️ **"조기경보"와 "속보"를 절대 뭉뚱그리지 않는다**
   기상청 TP 코드가 그 둘을 나눠 준다:
     11 지진조기경보 · 12 국외지진조기경보(시범)  → 흔들리기 **전**에 나갈 수 있는 것
     14 지진속보 · 3 국내지진통보 · 2 국외지진정보 → 흔들린 **뒤**
   ⚠️ 우리는 이 파일을 **주기적으로 받아** 만든다. 그래서 조기경보 전문이 들어와도
      사용자에게 닿을 때는 이미 흔들린 뒤일 가능성이 높다.
      → 화면에 "이건 조기경보 전문이지만 **우리 전달은 늦을 수 있다**"를 적는다.
        대피 시간을 주는 것처럼 보이게 하면 그건 거짓말이고, 사람이 다친다.
"""

import json
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ["KMA_HUB_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "events/quake-asia.json"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))
JST = KST                       # 같은 +09:00

# 기상청 전문 종류. ⚠️ 숫자를 화면에 내보내지 않는다 — 뜻을 적는다.
KMA_TP = {
    "2":  ("국외지진정보", False),
    "3":  ("국내지진통보", False),
    "5":  ("지진정보(재통보)", False),
    "10": ("지진현장경보", True),
    "11": ("지진조기경보", True),
    "12": ("국외지진조기경보(시범)", True),
    "14": ("지진속보", False),
}


def get(url, enc="utf-8"):
    with kma_hub.track(url, url), urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return r.read().decode(enc, "replace")


def num(v):
    try:
        f = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return None if f <= -90.0 else f      # 기상청 결측 표기


def kma():
    """기상청 — 한국어 본문과 **지역별 최대진도**가 함께 온다"""
    raw = get(f"https://apihub.kma.go.kr/api/typ01/url/eqk_now.php?authKey={KEY}", "euc-kr")
    out = []
    for line in raw.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # ⚠️ LOC 뒤로는 쉼표가 본문 안에도 들어간다(주소·비고). 앞 8칸만 나누고 나머지는 통째로 둔다.
        head = line.split(",")[0].split()
        if len(head) < 8:
            continue
        tp = head[0]
        name, early = KMA_TP.get(tp, ("지진정보", False))
        t = head[3].split(".")[0]
        try:
            at = datetime.strptime(t, "%Y%m%d%H%M%S").replace(tzinfo=KST)
        except ValueError:
            continue
        # ⚠️⚠️ 열 번호를 하나씩 밀려 읽어 **0건**이 나왔다. 헤더가
        #    "TM_EQK.MSC" 처럼 두 열을 **한 토막**으로 적어 놓아서 생긴 착각이다.
        #      [0]TP [1]TM_FC [2]SEQ [3]TM_EQK.MSC [4]MT [5]LAT [6]LON [7:]LOC
        #    ⚠️ 오류가 안 났다 — 경도 자리에 "일본"이 들어와 None 이 되고 조용히 건너뛰었다.
        #       "0건"만 보고 넘어갔으면 한국 지진이 영영 안 들어왔을 것이다.
        lat, lon, mag = num(head[5]), num(head[6]), num(head[4])
        if lat is None or lon is None:
            continue
        # ⚠️⚠️ **쉼표로 자르면 안 된다.** 값 안에 쉼표가 들어 있다:
        #      "…해역,최대진도 Ⅱ(경남,전남광주),국내 일부지역에서…"
        #    괄호 안의 시도 목록이 쉼표로 이어져 있어서, 순진하게 자르면
        #    위치가 "…해역 최대진도 Ⅱ(경남" 이 되고 진도가 "전남광주)" 가 된다.
        #    실측으로 정확히 그렇게 깨졌다.
        #    → **"최대진도" 라는 표지를 찾아** 그 앞뒤로 가른다. 괄호가 열리면 닫힐 때까지 붙인다.
        tail = line.split(None, 7)[7] if len(line.split(None, 7)) > 7 else ""
        tail = re.sub(r",=\s*$", "", tail.strip()).rstrip(",")
        loc, inten, rem = tail, None, None
        mk = tail.find("최대진도")
        if mk >= 0:
            loc = tail[:mk].rstrip(", ").strip()
            after = tail[mk:]
            # 괄호가 열렸으면 닫힐 때까지가 진도다 (그 안의 쉼표는 시도 구분자다)
            close = after.find(")")
            cut = close + 1 if ("(" in after[:close + 1] and close > 0) else after.find(",")
            if cut <= 0:
                cut = len(after)
            inten = after[:cut].strip()
            rem = after[cut:].lstrip(", ").strip() or None
        else:
            parts = tail.split(",")
            loc = parts[0].strip()
            rem = ",".join(parts[1:]).strip() or None
        out.append({
            "src": "KMA", "srcKo": "기상청", "kind": name,
            # ⚠️ **조기경보인지 아닌지를 자료에 남긴다.** 화면이 이걸로 문구를 바꾼다.
            "early": early,
            "at": at.isoformat(), "mag": mag,
            "lat": round(lat, 3), "lon": round(lon, 3),
            "place": loc or None,
            "intensity": inten,
            "remark": (rem or "").replace("\\n", " ").strip() or None,
        })
    return out


def jma():
    """JMA — ⚠️ **영문 지명이 함께 온다**(en_anm). 우리가 지어낼 필요가 없다."""
    d = json.loads(get("https://www.jma.go.jp/bosai/quake/data/list.json"))
    out = []
    for e in d:
        cod = e.get("cod") or ""
        # 형식 예: "+32.5+130.5-10000/"  (위도·경도·깊이 m)
        m = re.match(r"([+-][\d.]+)([+-][\d.]+)([+-]\d+)?", cod)
        if not m:
            continue
        at = e.get("at")
        if not at:
            continue
        depth = None
        if m.group(3):
            try:
                depth = round(abs(int(m.group(3))) / 1000, 1)
            except ValueError:
                depth = None
        try:
            mag = float(e["mag"]) if e.get("mag") not in (None, "") else None
        except (TypeError, ValueError):
            mag = None
        out.append({
            "src": "JMA", "srcKo": "일본 기상청", "kind": e.get("ttl") or "地震情報",
            "early": False,      # 이 목록은 발생 뒤 정보다
            "at": at if at.endswith(("Z", "+09:00")) else at + "+09:00",
            "mag": mag, "lat": float(m.group(1)), "lon": float(m.group(2)),
            "depthKm": depth,
            # ⚠️ 일본어 원문과 영문을 **둘 다** 남긴다. 한국어는 지어내지 않는다.
            "place": e.get("anm") or None,
            "placeEn": e.get("en_anm") or None,
            "intensity": e.get("maxi") or None,
        })
    return out


@kma_hub.accounted("quake-asia")
def handler(event=None, context=None):
    rows, errs = [], {}
    for name, fn in (("kma", kma), ("jma", jma)):
        try:
            r = fn()
            rows += r
            print(f"[quake] {name} {len(r)}건")
        except Exception as e:                                   # noqa: BLE001
            # ⚠️ 한쪽이 죽어도 나머지는 낸다. 둘 다 없을 때만 실패로 친다.
            errs[name] = str(e)[:120]
            print(f"[quake] {name} 실패: {e}")

    if not rows:
        return {"ok": False, "errors": errs}

    # ⚠️⚠️ **출처별로 자리를 나눠 자른다.** 그냥 최신순 120건으로 자르면
    #    JMA 가 하루 550건이라 **한국 지진이 통째로 밀려난다.**
    #    실측으로 기상청 1건이 목록에서 사라졌다 — 한국 앱에서 정확히 반대다.
    #    ⚠️ 오류가 안 난다. "합계 120건"만 보고 넘어가면 영영 모른다.
    per = {"KMA": 40, "JMA": 80}
    kept, seen = [], {}
    for r in sorted(rows, key=lambda r: r["at"], reverse=True):
        n = seen.get(r["src"], 0)
        if n >= per.get(r["src"], 40):
            continue
        seen[r["src"]] = n + 1
        kept.append(r)
    rows = sorted(kept, key=lambda r: r["at"], reverse=True)
    early = [r for r in rows if r.get("early")]

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "count": len(rows), "earlyCount": len(early),
        "sources": [
            {"id": "KMA", "ko": "기상청", "en": "Korea Meteorological Administration",
             "license": "공공누리 제1유형 (출처표시)"},
            {"id": "JMA", "ko": "일본 기상청", "en": "Japan Meteorological Agency",
             "license": "출처표시"},
        ],
        "errors": errs or None,
        "note": {
            "ko": "각 나라 기관이 직접 낸 지진 정보입니다. "
                  "⚠️ **규모(M)보다 진도가 중요합니다** — 규모는 지진 자체의 크기이고, "
                  "진도는 그 자리에서 얼마나 흔들렸는가입니다. "
                  "M5.8 이라도 멀면 안 느껴지고, M3 이라도 바로 밑이면 놀랍니다.\n"
                  "⚠️⚠️ **조기경보가 와도 저희 전달은 늦을 수 있습니다.** "
                  "저희는 이 자료를 주기적으로 받아 옮깁니다 — 흔들리기 전에 닿는다고 "
                  "약속하지 못합니다. 대피 판단은 기상청·JMA 의 공식 경보를 직접 받으십시오.",
            "en": "Official national agency reports. Intensity matters more than magnitude. "
                  "⚠️ We poll these feeds — an early-warning message may reach you after "
                  "the shaking. Do not rely on this for evacuation.",
        },
        "quakes": rows,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=60")
    print(f"[quake] 합계 {len(rows)}건 (조기경보 {len(early)}) · {len(body)/1024:.0f}KB")
    return {"ok": True, "count": len(rows), "early": len(early), "errors": errs or None}

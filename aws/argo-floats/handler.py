# -*- coding: utf-8 -*-
"""Argo 플로트 — 개발지시서 v5.3 R-11 Dive Replay

R-11 이 보존하라는 것:
  time-depth profile · route replay ·
  **actual track = solid, estimated horizontal path = dashed**
  "측정된 depth 와 추정 위치를 혼동하지 않는다"

Argo 는 이 문법이 자료 자체의 성질인 드문 경우다.
  · 플로트는 약 1,000m 에서 표류하다 2,000m 까지 내려갔다 올라온다.
  · **수심은 압력계로 실측**한다. 수온·염분도 그 수심마다 실측이다.
  · 그런데 **잠수 중 위치는 아무도 모른다.** GPS 는 수면에 떠 있을 때만 잡힌다.
    두 부상점 사이의 수평 경로는 우리가 이어 본 선일 뿐 관측이 아니다.
  → 부상점(측정)은 점으로, 그 사이(추정)는 점선으로 그린다. 지어낼 것이 없다.

자료: Ifremer ERDDAP (ArgoFloats). Argo 는 국제 공동 프로그램이고 자료는 공개다.
  ⚠️ ERDDAP 응답에 CORS 헤더가 없다 — 브라우저가 직접 못 받는다(실측).
     그래서 여기서 받아 S3 에 올린다. 사용자가 늘어도 원본에 부담을 주지 않는다.

출력  ocean/argo-floats.json
"""

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "ocean/argo-floats.json"
BASE = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json"
UA = "earthus/2.0 (+https://earthus.net)"

RECENT_DAYS = int(os.environ.get("ARGO_RECENT_DAYS", "20"))   # 최근에 살아 있는 플로트만
TRACK_DAYS = int(os.environ.get("ARGO_TRACK_DAYS", "400"))    # 궤적을 얼마나 거슬러 볼지
N_TRACK = int(os.environ.get("ARGO_N_TRACK", "60"))           # 궤적을 그릴 플로트 수
N_PROFILE = int(os.environ.get("ARGO_N_PROFILE", "18"))       # 단면까지 만들 플로트 수
CYCLES = int(os.environ.get("ARGO_CYCLES", "4"))              # 단면에 쓸 최근 사이클 수
MAX_LEVELS = 70                                               # 프로파일 층 상한(솎아낸다)
DEADLINE_S = int(os.environ.get("ARGO_DEADLINE_S", "780"))


def get(query, timeout=90, tries=2):
    url = BASE + "?" + query
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))["table"]
        except Exception as e:                                # noqa: BLE001
            last = e
            time.sleep(1.5)
    raise RuntimeError(f"ERDDAP 실패: {last} · {url[:140]}")


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def rows_of(table):
    cols = table["columnNames"]
    return [dict(zip(cols, r)) for r in table["rows"]]


def pick_spread(floats, n):
    """지구 전체에 고르게 흩어지도록 고른다.

    최근 자료만 정렬해서 앞에서 n 개를 자르면 특정 해역에 몰린다 —
    그러면 '전 지구를 떠다니는 관측망'이라는 사실이 화면에서 사라진다.
    10°×10° 칸마다 하나씩만 뽑는다.
    """
    seen = set()
    out = []
    for f in sorted(floats, key=lambda x: x["t"], reverse=True):
        key = (int(f["lat"] // 10), int(f["lon"] // 10))
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
        if len(out) >= n:
            break
    return out


def thin(levels, cap):
    """층을 고르게 솎는다. 값을 바꾸지 않고 개수만 줄인다."""
    if len(levels) <= cap:
        return levels
    step = len(levels) / float(cap)
    return [levels[int(i * step)] for i in range(cap)]


def handler(event, context):                                  # noqa: ARG001
    t0 = time.time()
    now = datetime.now(timezone.utc)

    # 1) 최근에 신호를 보낸 플로트의 마지막 부상점
    # ERDDAP 은 time%3E= 형태를 그대로 요구한다 — urlencode 로는 안 되어 직접 조립한다.
    tab = get("platform_number,cycle_number,time,latitude,longitude"
              "&time%3E=" + iso(now - timedelta(days=RECENT_DAYS)) + "&distinct()")
    # ⚠️ 미래로 찍힌 관측이 실제로 섞여 온다(실측: 2026-12-27). 플로트의 시각 필드가
    #    깨진 경우다. 미래의 관측은 관측이 아니다 — 하루 여유만 두고 버린다.
    future = iso(now + timedelta(days=1))
    recent = {}
    for r in rows_of(tab):
        if r["latitude"] is None or r["longitude"] is None or not r["time"]:
            continue
        if r["time"] > future:
            continue
        pid = r["platform_number"]
        cur = recent.get(pid)
        if cur is None or r["time"] > cur["t"]:
            recent[pid] = {"id": pid, "t": r["time"], "lat": r["latitude"],
                           "lon": r["longitude"], "cycle": r["cycle_number"]}
    picked = pick_spread(list(recent.values()), N_TRACK)
    if not picked:
        raise RuntimeError("ARGO_NO_RECENT_FLOATS")

    # 2) 고른 플로트의 궤적 — 정규식 하나로 묶어 한 번에 받는다(요청 수를 줄인다)
    ids = [f["id"] for f in picked]
    rx = "(" + "|".join(ids) + ")"
    tab = get("platform_number,cycle_number,time,latitude,longitude"
              "&platform_number=~" + urllib.parse.quote('"' + rx + '"')
              + "&time%3E=" + iso(now - timedelta(days=TRACK_DAYS)) + "&distinct()")
    tracks = {i: [] for i in ids}
    for r in rows_of(tab):
        if r["latitude"] is None or r["longitude"] is None:
            continue
        if r["time"] and r["time"] > future:
            continue
        if r["platform_number"] in tracks:
            tracks[r["platform_number"]].append({
                "t": r["time"], "lat": round(r["latitude"], 4),
                "lon": round(r["longitude"], 4), "c": r["cycle_number"],
            })
    for i in ids:
        tracks[i].sort(key=lambda x: x["t"])

    # 3) 앞쪽 몇 개는 수심 단면까지 만든다 — 사이클마다 프로파일을 따로 받아야 한다
    profiles = {}
    for f in picked[:N_PROFILE]:
        if time.time() - t0 > DEADLINE_S:
            break
        tr = tracks.get(f["id"]) or []
        cyc = [x["c"] for x in tr][-CYCLES:]
        got = []
        for c in cyc:
            if time.time() - t0 > DEADLINE_S:
                break
            try:
                tab = get("cycle_number,time,pres,temp,psal"
                          "&platform_number=" + urllib.parse.quote('"' + f["id"] + '"')
                          + "&cycle_number=" + str(c), timeout=60, tries=1)
            except Exception as e:                            # noqa: BLE001
                print(f"[argo] {f['id']} c{c} 프로파일 실패: {e}")
                continue
            lv = []
            for r in rows_of(tab):
                if r["pres"] is None or r["temp"] is None:
                    continue
                lv.append([round(r["pres"], 1), round(r["temp"], 3),
                           None if r["psal"] is None else round(r["psal"], 3)])
            if len(lv) < 8:
                continue
            lv.sort(key=lambda x: x[0])
            got.append({"c": c, "t": (rows_of(tab)[0]["time"] if tab["rows"] else None),
                        "lv": thin(lv, MAX_LEVELS)})
        if got:
            profiles[f["id"]] = got

    out = {
        "generated": iso(now),
        "source": "Argo · Ifremer ERDDAP (ArgoFloats)",
        "sourceUrl": "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html",
        "license": "Argo 자료는 공개입니다 (Argo Program · 국제 공동 관측망)",
        "truthClass": "OBSERVED",
        "note": {
            "ko": "플로트가 실제로 잰 값입니다. **수심(압력)·수온·염분은 실측**이고, "
                  "**잠수 중 위치는 관측되지 않습니다** — GPS 는 수면에 떠 있을 때만 잡힙니다. "
                  "부상점 사이를 잇는 선은 우리가 그은 추정 경로이며 관측이 아닙니다.",
            "en": "These are values the float actually measured. Depth (pressure), temperature "
                  "and salinity are measured; the position while submerged is not observed — GPS "
                  "fixes happen only at the surface. The line between surfacings is an estimated "
                  "path we drew, not an observation.",
        },
        "counts": {
            "activeFloats": len(recent),
            "tracked": len(picked),
            "withSection": len(profiles),
        },
        "floats": [{
            "id": f["id"],
            "last": {"t": f["t"], "lat": round(f["lat"], 4), "lon": round(f["lon"], 4), "c": f["cycle"]},
            "fixes": tracks.get(f["id"]) or [],
            "section": profiles.get(f["id"]),
        } for f in picked],
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=1800")
    print(f"[argo] 활성 {len(recent)} · 궤적 {len(picked)} · 단면 {len(profiles)} "
          f"· {len(body)/1024:.0f}KB · {time.time()-t0:.0f}s")
    return {"ok": True, "floats": len(picked), "sections": len(profiles), "bytes": len(body)}

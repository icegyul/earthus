# -*- coding: utf-8 -*-
"""알래스카 주노 빙하호(Suicide Basin) 아래 멘덴홀 강 — 기관 관측·예보 **인용** 수집기.

계약 §L-2 · §L-4 ② (EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14):
  "미국 알래스카 주노 | OFFICIAL_OBSERVATION(기관 인용) | NWS NWPS(MNDA2) + USGS NWIS(15052500)"

무엇을 하나
  · USGS NWIS 15052500 (MENDENHALL R NR AUKE BAY AK) 15분 실측 — 수위(ft)·유량(ft³/s)
  · NWS NWPS 게이지 MNDA2 — 공식 홍수 단계 문턱(action/minor/moderate/major)과
    NWS 알래스카 하천예보센터(APRFC)의 공식 예보 수위·유량
  두 기관 값을 **그대로** 옮긴다. 단위도 원본 그대로(ft·ft³/s·kcfs) 두고 화면이 표시할 때 바꾼다.

하지 않는 것 (⚠️ 이 파일의 경계)
  · 빙하호 붕괴 물길·도달 시각·침수 범위를 **계산하지 않는다.** 검증된 엔진이 없다
    (sim-questions.js hazards.glacial_lake_flood = not_available). Walder–Costa 같은 경험식은
    댐 형식마다 물리가 달라 한 곳의 식을 다른 곳에 쓰면 8~80배 틀린다(계약 §H 지리적 확장 원칙).
  · 이 지점은 **호수가 아니라 호수 아래 강**이다. 빙하호가 배수되면 이 강 수위가 오른다 —
    그래서 호수 상태의 간접 신호일 뿐이다. 화면에 그렇게 적는다.
  · 홍수 단계를 우리가 매기지 않는다. 문턱도 판정도 NWS 가 준 것(floodCategory)만 쓴다.

⚠️ 자리: 계약 초안은 'hazards/glof-alaska.json(가칭)' 이라 적었지만 hazards/ 는 버킷 공개
   접두사가 아니다(publication_privacy.BUCKET_PUBLIC_PREFIXES) — 거기 쓰면 앱이 못 읽는다.
   공개 사건 피드 자리인 events/ 에 쓴다.

결과  s3://<CACHE_BUCKET>/events/glof-alaska.json   (스케줄: aws/configure-glacial-lake-us-schedule.sh)
두 원본 모두 무인증·미국 정부 저작물(퍼블릭 도메인).
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

DST = "events/glof-alaska.json"
USGS_SITE = "15052500"
NWS_LID = "MNDA2"
USGS_URL = ("https://waterservices.usgs.gov/nwis/iv/?" + urllib.parse.urlencode(
    {"format": "json", "sites": USGS_SITE, "parameterCd": "00060,00065", "period": "P2D"}))
NWPS_GAUGE = f"https://api.water.noaa.gov/nwps/v1/gauges/{NWS_LID}"
NWPS_STAGEFLOW = f"https://api.water.noaa.gov/nwps/v1/gauges/{NWS_LID}/stageflow"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}

# 15분 관측이 이보다 오래되면 '지금'이라고 말하지 않는다.
LIVE_HOURS = 3
SERIES_HOURS = 48

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3", region_name=os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION"))
    return _s3


def get(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def parse_usgs(doc):
    """USGS iv JSON → {'stage': [(dt, ft, provisional)], 'flow': [...]}. 값이 숫자가 아니면 버린다."""
    out = {"stage": [], "flow": []}
    for ts in ((doc or {}).get("value") or {}).get("timeSeries") or []:
        code = (((ts.get("variable") or {}).get("variableCode") or [{}])[0]).get("value")
        key = {"00065": "stage", "00060": "flow"}.get(code)
        if not key:
            continue
        for v in ((ts.get("values") or [{}])[0].get("value") or []):
            t, val = _parse(v.get("dateTime")), v.get("value")
            try:
                num = float(val)
            except (TypeError, ValueError):
                continue
            if t is None or num <= -999990:        # USGS 결측 표시(-999999)
                continue
            out[key].append((t, num, "P" in (v.get("qualifiers") or [])))
    for key in out:
        out[key].sort(key=lambda r: r[0])
    return out


def hourly(series, now, hours=SERIES_HOURS):
    """최근 hours 시간을 한 시간에 하나(그 시간의 마지막 관측)로 줄인다 — 값은 바꾸지 않는다."""
    cut = now - timedelta(hours=hours)
    last = {}
    for t, v, _p in series:
        if t >= cut:
            last[t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")] = v
    return [{"at": k, "v": last[k]} for k in sorted(last)]


def build(usgs_doc, gauge_doc, stageflow_doc, now):
    """세 원본 → 공개 문서. 원본 하나가 없어도 나머지는 싣고, 없는 것은 errors 에 적는다."""
    errors = {}
    obs = parse_usgs(usgs_doc) if usgs_doc else {"stage": [], "flow": []}
    if not usgs_doc:
        errors["usgs"] = "받지 못함"
    st, fl = (obs["stage"][-1] if obs["stage"] else None), (obs["flow"][-1] if obs["flow"] else None)
    times = [x[0] for x in (st, fl) if x]
    newest = max(times) if times else None
    age_h = ((now - newest).total_seconds() / 3600) if newest else None
    live = age_h is not None and age_h <= LIVE_HOURS

    g = gauge_doc or {}
    if not gauge_doc:
        errors["nwps"] = "받지 못함"
    cats = ((g.get("flood") or {}).get("categories") or {})
    status = g.get("status") or {}
    fc = (stageflow_doc or {}).get("forecast") or {}
    fc_data = fc.get("data") or []

    doc = {
        "schema": "earthus.glof-alaska.v1",
        "generated": _iso_z(now),
        "live": live,
        "ageHours": round(age_h, 2) if age_h is not None else None,
        "liveThresholdHours": LIVE_HOURS,
        "site": {
            "usgsId": USGS_SITE, "nwsLid": NWS_LID,
            "name": g.get("name") or "Mendenhall River near Auke Bay",
            "lat": g.get("latitude"), "lon": g.get("longitude"),
            "noteKo": "빙하호(Suicide Basin) 아래 멘덴홀 강 지점 — 호수 자체가 아니라, 호수가 배수되면 오르는 강 수위다",
            "noteEn": "Mendenhall River below Suicide Basin — not the lake itself; the river rises when the lake drains",
        },
        "observed": None,
        "nws": {
            "floodCategories": {k: {"stageFt": (v or {}).get("stage"), "flowCfs": (v or {}).get("flow")}
                                for k, v in cats.items()} or None,
            "observedCategory": (status.get("observed") or {}).get("floodCategory"),
            "forecast": ({
                "issuedAt": fc.get("issuedTime"),
                "peakStageFt": max((d.get("primary") for d in fc_data if isinstance(d.get("primary"), (int, float))), default=None),
                "peakFlowKcfs": max((d.get("secondary") for d in fc_data if isinstance(d.get("secondary"), (int, float))), default=None),
                "category": (status.get("forecast") or {}).get("floodCategory"),
                "validUntil": fc_data[-1].get("validTime") if fc_data else None,
                "points": [{"at": d.get("validTime"), "stageFt": d.get("primary"), "flowKcfs": d.get("secondary")}
                           for d in fc_data],
                "kind": "OFFICIAL_FORECAST",
                "source": "NWS 알래스카 하천예보센터(APRFC) · NWPS MNDA2",
            } if fc_data else None),
        },
        "recent": {"stageFt": hourly(obs["stage"], now), "flowCfs": hourly(obs["flow"], now)},
        "sources": [
            {"id": "usgs-nwis-15052500", "name": "USGS NWIS 15052500", "kind": "OFFICIAL_OBSERVATION",
             "url": "https://waterdata.usgs.gov/monitoring-location/15052500/", "license": "퍼블릭 도메인(미국 정부 저작물)"},
            {"id": "nws-nwps-mnda2", "name": "NWS NWPS MNDA2", "kind": "OFFICIAL_FORECAST",
             "url": "https://water.noaa.gov/gauges/MNDA2", "license": "퍼블릭 도메인(미국 정부 저작물)"},
        ],
        "note": {
            "ko": ("미국 기관(USGS·NWS)의 관측과 예보를 그대로 옮긴 것입니다. 빙하호가 터질 때 물이 어디까지 가는지는 "
                   "계산하지 않습니다 — 검증된 계산 엔진이 없습니다. 대피·행동은 NWS 주노 예보소 발표를 따르세요."),
            "en": ("Agency observations and forecasts (USGS, NWS) passed through as published. We do not compute where "
                   "an outburst flood goes — there is no validated engine. Follow NWS Juneau for any action."),
        },
        "errors": errors or None,
    }
    if live and (st or fl):
        at = max(x[0] for x in (st, fl) if x)
        doc["observed"] = {
            "at": _iso_z(at),
            "stageFt": st[1] if st else None,
            "flowCfs": fl[1] if fl else None,
            "provisional": bool((st and st[2]) or (fl and fl[2])),
            "kind": "OFFICIAL_OBSERVATION",
            "source": "USGS NWIS 15052500",
        }
    elif not live:
        # ⚠️ 늙은 관측을 '지금'으로 내보내지 않는다. 마지막 시각만 적는다.
        doc["lastObservedAt"] = _iso_z(newest) if newest else None
    return doc


def _fetch(url):
    try:
        return get(url)
    except Exception as e:                          # noqa: BLE001
        print(f"[glacial-lake-us] 받기 실패 {url}: {str(e)[:120]}")
        return None


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    doc = build(_fetch(USGS_URL), _fetch(NWPS_GAUGE), _fetch(NWPS_STAGEFLOW), now)
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3().put_object(Bucket=os.environ["CACHE_BUCKET"], Key=DST, Body=body,
                    ContentType="application/json; charset=utf-8", CacheControl="public, max-age=600")
    print(f"[glacial-lake-us] live={doc['live']} 관측={doc['observed']} 오류={doc['errors']}")
    return {"ok": True, "live": doc["live"], "errors": doc["errors"]}

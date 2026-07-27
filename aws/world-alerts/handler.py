"""세계 기상특보 — 지금은 미국(NWS)

왜 미국부터인가
  우리 기상경보 레이어는 지금 한국(기상청)과 브라질(INMET)뿐이다.
  "다른 나라가 비어 있는 건 경보가 없어서가 아니라 우리가 안 받아서"라고 화면에 적어 뒀는데,
  그 문장을 지워 가는 첫 걸음이다.
  미국 NWS 를 먼저 고른 이유:
    · 신청 불필요 (User-Agent 헤더만)
    · 미국 정부 저작물 = 퍼블릭 도메인이라 재배포 제약이 없다
    · 토네이도·돌발홍수·폭염 등 우리에게 없는 종류가 들어온다 (실측: 107건 중 폭염 64, 토네이도 1)

⚠️ **경보의 82%에 좌표가 없다.** (실측 2026-07-27: 107건 중 25건만 geometry 보유)
   나머지는 `affectedZones` 라는 **구역 URL 목록**만 준다.
   구역을 하나씩 받아 폴리곤 중심을 계산해야 지도에 올릴 수 있다.
   ⚠️ 그런데 활성 경보 전체의 고유 구역은 993개다 — 매번 다 받으면 안 된다.
      **경보 하나당 대표 구역 하나만** 받으면 82회로 끝난다. 그리고 구역 좌표는
      거의 바뀌지 않으므로 S3 에 쌓아 두고 재사용한다.

⚠️ NWS API 에 `limit` 인자를 주면 **400** 이 난다 (실측). 인자 없이 부르거나
   `severity` 로 걸러야 한다. 전체는 2.3MB, severity=Severe,Extreme 이면 695KB 다.

⚠️ 한 번에 새 구역을 너무 많이 받지 않는다. NWS 는 초당 1회를 권한다.
   한 번 돌 때 상한을 두고, 못 받은 것은 다음 회차에 채운다.
   **덜 채워졌다는 사실을 파일에 적는다** — 조용히 빠지면 "그 지역엔 경보가 없나 보다"가 된다.

출력
  s3://<CACHE_BUCKET>/events/world-alerts.json   경보
  s3://<CACHE_BUCKET>/events/nws-zones.json      구역 좌표 캐시 (점점 채워진다)
"""

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")

# ⚠️ NWS 는 User-Agent 에 연락처를 요구한다. 없으면 403 이 날 수 있다.
UA = {"User-Agent": "earthus.net (dalur@kakao.com)"}
NWS = "https://api.weather.gov/alerts/active?severity=Severe,Extreme"
DST = "events/world-alerts.json"
ZONES = "events/nws-zones.json"

NEW_ZONES_PER_RUN = 60      # 한 회차에 새로 받을 구역 수 상한
SEV_RANK = {"Extreme": 3, "Severe": 2, "Moderate": 1, "Minor": 0, "Unknown": 0}

# 종류별 한국어·색. ⚠️ 없는 종류는 원문 그대로 두고 지어내지 않는다.
KIND = {
    "Extreme Heat Warning":       ("폭염경보", "🔥", "#e8590c"),
    "Extreme Heat Watch":         ("폭염주의보", "🔥", "#f08c00"),
    "Excessive Heat Warning":     ("폭염경보", "🔥", "#e8590c"),
    "Heat Advisory":              ("폭염주의보", "🔥", "#f08c00"),
    "Tornado Warning":            ("토네이도경보", "🌪️", "#c92a2a"),
    "Tornado Watch":              ("토네이도주의보", "🌪️", "#e03131"),
    "Severe Thunderstorm Warning": ("뇌우경보", "⛈️", "#5f3dc4"),
    "Severe Thunderstorm Watch":  ("뇌우주의보", "⛈️", "#7048e8"),
    "Flash Flood Warning":        ("돌발홍수경보", "🌊", "#1c7ed6"),
    "Flash Flood Watch":          ("돌발홍수주의보", "🌊", "#4dabf7"),
    "Flood Warning":              ("홍수경보", "🌊", "#1971c2"),
    "Flood Watch":                ("홍수주의보", "🌊", "#4dabf7"),
    "Winter Storm Warning":       ("겨울폭풍경보", "🌨️", "#74c0fc"),
    "Blizzard Warning":           ("눈보라경보", "🌨️", "#4dabf7"),
    "High Wind Warning":          ("강풍경보", "💨", "#37b24d"),
    "Hurricane Warning":          ("허리케인경보", "🌀", "#c92a2a"),
    "Tropical Storm Warning":     ("열대폭풍경보", "🌀", "#e8590c"),
    "Special Marine Warning":     ("해상특보", "🌊", "#0c8599"),
    "Red Flag Warning":           ("산불위험경보", "🔥", "#d9480f"),
    "Dense Fog Advisory":         ("짙은안개주의보", "🌫️", "#868e96"),
    "Ice Storm Warning":          ("착빙경보", "🧊", "#74c0fc"),
    "Storm Surge Warning":        ("폭풍해일경보", "🌊", "#5f3dc4"),
}
FALLBACK = ("⚠️", "#fa5252")

s3 = boto3.client("s3", region_name=REGION)


def get(url, timeout=45):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def load(key, default):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                    # noqa: BLE001
        return default


def put(key, doc, maxage):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")
    return len(body)


def centroid(geom):
    """폴리곤(또는 다중폴리곤)의 꼭짓점 평균.
    ⚠️ 무게중심이 아니라 꼭짓점 평균이다 — 경보 구역을 '한 점'으로 줄이는 근사일 뿐이고,
       화면에는 '구역 전체'라고 적어야 한다."""
    if not geom:
        return None

    def pts(c):
        if c and isinstance(c[0], (int, float)):
            yield c
        else:
            for x in (c or []):
                yield from pts(x)

    p = list(pts(geom.get("coordinates")))
    if not p:
        return None
    return (round(sum(x[1] for x in p) / len(p), 4),
            round(sum(x[0] for x in p) / len(p), 4))


def handler(event, context):
    cache = load(ZONES, {}) or {}
    zones = cache.get("zones") or {}
    known0 = len(zones)

    try:
        j = json.loads(get(NWS))
    except urllib.error.HTTPError as e:
        # ⚠️ limit 인자를 주면 400 이 난다. 여기 오면 URL 을 의심할 것.
        raise RuntimeError(f"NWS {e.code} — 인자를 확인하라 (limit 은 400)") from e

    feats = j.get("features") or []
    if not feats:
        return {"ok": False, "reason": "empty"}

    # 좌표가 없는 경보의 대표 구역만 모은다 (전체 구역이 아니라)
    need = []
    for f in feats:
        if f.get("geometry"):
            continue
        az = (f.get("properties") or {}).get("affectedZones") or []
        if az and az[0] not in zones:
            need.append(az[0])
    need = list(dict.fromkeys(need))[:NEW_ZONES_PER_RUN]

    fetched, failed = 0, 0
    for url in need:
        try:
            zg = json.loads(get(url, timeout=25)).get("geometry")
            c = centroid(zg)
            if c:
                zones[url] = list(c)
                fetched += 1
        except Exception:                                # noqa: BLE001
            failed += 1
        time.sleep(0.4)                                  # NWS 는 초당 1회를 권한다

    out, unplaced = [], 0
    for f in feats:
        p = f.get("properties") or {}
        ev = p.get("event") or ""
        c = centroid(f.get("geometry"))
        if not c:
            az = p.get("affectedZones") or []
            z = zones.get(az[0]) if az else None
            c = tuple(z) if z else None
        if not c:
            # ⚠️ 좌표를 지어내지 않는다. 아직 못 받은 것은 세어서 파일에 남긴다.
            unplaced += 1
            continue
        ko, icon, color = KIND.get(ev, (ev, *FALLBACK))
        out.append({
            "country": "US", "countryKo": "미국",
            "kind": ko, "kindEn": ev, "icon": icon, "color": color,
            "severity": p.get("severity"),
            "rank": SEV_RANK.get(p.get("severity"), 1),
            "lat": c[0], "lon": c[1],
            "area": (p.get("areaDesc") or "")[:120],
            "headline": (p.get("headline") or "")[:160],
            "effective": p.get("effective"), "expires": p.get("expires"),
            "area_wide": True,
            "_src": "미국 국립기상청 (NWS)",
            "_lic": "미국 정부 저작물 — 퍼블릭 도메인",
        })

    out.sort(key=lambda x: -x["rank"])
    kinds = {}
    for r in out:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1

    if fetched or failed:
        put(ZONES, {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
                    "count": len(zones), "zones": zones}, 86400)

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "미국 국립기상청 NWS (api.weather.gov)",
        "sourceEn": "US National Weather Service (api.weather.gov)",
        "license": "미국 정부 저작물 — 퍼블릭 도메인",
        "note": {
            "ko": "미국에서 지금 발효 중인 심각(Severe) 이상 특보입니다. "
                  "표시 위치는 경보 구역의 대표 지점이며 구역 전체가 대상입니다. "
                  "⚠️ 원자료에 좌표가 없는 경보는 구역 정보를 따로 받아 채우는 중이라 "
                  "일부가 아직 지도에 없을 수 있습니다(unplaced 참고).",
            "en": "US alerts currently in effect at Severe or above. Points are representative "
                  "locations; the whole zone is affected. ⚠️ Alerts without coordinates in the "
                  "source are being resolved gradually, so some may not be mapped yet.",
        },
        "count": len(out),
        # ⚠️ 못 올린 수와 캐시 채움 상태를 숨기지 않는다.
        "unplaced": unplaced,
        "zonesKnown": len(zones),
        "zonesFetchedThisRun": fetched,
        "zonesFailedThisRun": failed,
        "kinds": kinds,
        "alerts": out,
    }
    kb = put(DST, doc, 300)
    print(f"[world] 미국 {len(out)}건 · 미배치 {unplaced} · 구역 {known0}→{len(zones)} · {kb/1024:.0f}KB")
    return {"ok": True, "us": len(out), "unplaced": unplaced,
            "zones": len(zones), "newZones": fetched, "kinds": kinds}

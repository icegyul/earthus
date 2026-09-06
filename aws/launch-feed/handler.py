"""로켓 발사 축약본 — Launch Library 2 (The Space Devs)

왜 있나
  브라우저가 LL2 를 직접 불렀다. 그런데 LL2 무료 API 는 시간당 호출 한도가 아주 빡빡해서
  (실측 429 "Request was throttled") 사용자가 몇 명만 돼도 목록이 통째로 비었다.
  게다가 중계 주소(vidURLs)와 발사 시각 정보는 **mode=detailed 에만 들어 있는데**,
  그 응답은 30건에 380 KB 라 브라우저로 보낼 것이 못 된다.

무엇을 하나
  15분마다 서버가 한 번만 detailed 로 받아
    · 원본을 archive/launch-ll2/dt=…/hh=…/launches.json.gz 로 보존하고
    · 화면이 쓰는 필드만 남긴 events/launches.json (약 20~30 KB) 을 만든다.
  브라우저는 이 축약본만 읽는다 — LL2 를 직접 부르지 않으므로 429 가 사라진다.

무엇을 안 하나
  · 값을 만들지 않는다. LL2 가 비워 둔 것(미션 설명·중계 주소)은 비운 채로 둔다.
  · LL2 이미지(image/feature_image)는 싣지 않는다 — CC BY-NC 등 제3자 라이선스가 섞여 있다.
  · 받기에 실패하면 축약본을 덮어쓰지 않는다. 이전 파일이 남아 화면은 STALE 로 보인다.
"""
import gzip
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

SRC = ("https://ll.thespacedevs.com/2.2.0/launch/upcoming/"
       "?limit=30&mode=detailed&ordering=net&hide_recent_previous=true")
DST = "events/launches.json"
RAW_PREFIX = "archive/launch-ll2"
UA = {"User-Agent": "earthus.net (dalur@kakao.com)"}

# 중계 주소에서 남길 것. description 은 길어서 300자로 자른다(원본은 archive 에 있다).
VID_KEEP = ("publisher", "title", "url", "source", "start_time", "end_time")


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def videos(rec):
    """공식 중계·해설 링크. 우선순위(priority)가 낮을수록 앞이다 — LL2 규칙 그대로 따른다."""
    out = []
    seen = set()
    pool = (rec.get("vidURLs") or []) + ((rec.get("mission") or {}).get("vid_urls") or [])
    for v in sorted(pool, key=lambda x: x.get("priority") if isinstance(x.get("priority"), int) else 999):
        url = (v.get("url") or "").strip()
        if not url.startswith("https://") or url in seen:
            continue
        seen.add(url)
        item = {k: v.get(k) for k in VID_KEEP if v.get(k)}
        item["url"] = url
        kind = (v.get("type") or {}).get("name")
        if kind:
            item["kind"] = kind                    # 'Official Webcast' 등 — 공식인지 아닌지가 중요하다
        lang = (v.get("language") or {}).get("code")
        if lang:
            item["lang"] = lang
        desc = (v.get("description") or "").strip()
        if desc:
            item["description"] = desc[:300]
        out.append(item)
    return out[:6]


def links(rec):
    out = []
    seen = set()
    pool = (rec.get("infoURLs") or []) + ((rec.get("mission") or {}).get("info_urls") or [])
    for v in pool:
        url = (v.get("url") or "").strip()
        if not url.startswith("https://") or url in seen:
            continue
        seen.add(url)
        out.append({"title": (v.get("title") or v.get("source") or url)[:60], "url": url})
    return out[:4]


def compact(rec):
    pad = rec.get("pad") or {}
    loc = pad.get("location") or {}
    lat, lon = num(pad.get("latitude")), num(pad.get("longitude"))
    if not rec.get("id") or lat is None or lon is None:
        return None
    mis = rec.get("mission") or {}
    orb = mis.get("orbit") or {}
    cfg = (rec.get("rocket") or {}).get("configuration") or {}
    st = rec.get("status") or {}
    out = {
        "id": str(rec["id"]),
        "name": (rec.get("name") or "").strip(),
        "net": rec.get("net"),
        "windowStart": rec.get("window_start"),
        "windowEnd": rec.get("window_end"),
        "netPrecision": (rec.get("net_precision") or {}).get("name"),
        "status": st.get("name"),
        "statusAbbrev": st.get("abbrev"),
        "statusNote": (st.get("description") or "")[:200] or None,
        "provider": (rec.get("launch_service_provider") or {}).get("name"),
        "providerType": (rec.get("launch_service_provider") or {}).get("type"),
        "rocket": cfg.get("full_name") or cfg.get("name"),
        "rocketFamily": cfg.get("family"),
        "pad": pad.get("name"),
        "padWiki": pad.get("wiki_url") or None,
        "site": loc.get("name"),
        "country": loc.get("country_code"),
        "lat": lat, "lon": lon,
        "mission": mis.get("name") or None,
        "missionType": mis.get("type") or None,
        "missionDescription": (mis.get("description") or "").strip()[:900] or None,
        "orbit": orb.get("name") or None,
        "orbitAbbrev": orb.get("abbrev") or None,
        "webcastLive": rec.get("webcast_live") is True,
        "videos": videos(rec),
        "links": links(rec),
        "url": rec.get("url"),
    }
    return {k: v for k, v in out.items() if v not in (None, "", [], {})}


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    t0 = time.time()
    req = urllib.request.Request(SRC, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        # 429(호출 한도)·5xx — 축약본을 덮어쓰지 않는다. 이전 파일이 남아 화면은 STALE 로 보인다.
        print(f"[launch] HTTP {e.code} — 축약본 미기록")
        return {"ok": False, "reason": f"http-{e.code}"}
    except Exception as e:  # noqa: BLE001
        print(f"[launch] 조회 실패 {e!r} — 축약본 미기록")
        return {"ok": False, "reason": "fetch-failed"}
    fetch_ms = round((time.time() - t0) * 1000)
    doc = json.loads(raw.decode("utf-8"))
    results = doc.get("results") or []
    if not results:
        print("[launch] 결과 0건 — 축약본 미기록")
        return {"ok": False, "reason": "empty"}

    s3.put_object(Bucket=BUCKET, Key=f"{RAW_PREFIX}/dt={now:%Y-%m-%d}/hh={now:%H}/launches.json.gz",
                  Body=gzip.compress(raw, 6), ContentType="application/json", ContentEncoding="gzip")

    items = [x for x in (compact(r) for r in results) if x]
    out = {
        "schema": "earthus.launches.v1",
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "The Space Devs · Launch Library 2 (mode=detailed)",
        "license": "CC BY 4.0 (The Space Devs)",
        "note": {
            "ko": "예정 시각은 자주 바뀝니다 — 발사 기관 공지가 정본입니다. "
                  "중계 주소는 LL2 가 준 공식 링크 그대로이며, 없는 발사는 아직 공개되지 않은 것입니다.",
            "en": "Times change often; the agency notice is authoritative. Webcast links are relayed as given.",
        },
        "raw": {"bytes": len(raw), "fetchMs": fetch_ms, "count": len(results)},
        "count": len(items),
        "launches": items,
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl="no-cache")
    withvid = sum(1 for x in items if x.get("videos"))
    print(f"[launch] raw {len(raw)} B → compact {len(body)} B · {len(items)}건 · 중계 있는 발사 {withvid}건")
    return {"ok": True, "rawBytes": len(raw), "compactBytes": len(body), "count": len(items), "withVideos": withvid}

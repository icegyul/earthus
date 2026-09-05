"""GDACS 태풍 목록 축약본 — PHASE 1 (2026-09-05)

왜 있나
  브라우저가 gdacs.org MAP?eventtype=TC 원본(실측 1,971,763 bytes · 서버 18초 · 브라우저 15~106초)을
  직접 받았다. 그중 사건 카드가 쓰는 건 Point 좌표와 필드 7개뿐이다(intel-feed.js ingestTC).

무엇을 하나
  1. 원본을 받아 그대로 보존한다: archive/gdacs-tc-map/dt=YYYY-MM-DD/hh=HH/map.json.gz  (archiver 의 경로 규칙)
  2. Point 피처만, ingestTC 가 읽는 필드만 남긴 GeoJSON FeatureCollection 을 events/gdacs-tc.json 에 쓴다.
     필드 계약은 원본과 같다(같은 이름·같은 값). 브라우저 코드는 URL 만 바꾼다.
  3. 원본 조회에 실패하면 축약본을 덮어쓰지 않는다 — 이전 축약본이 남고 generated 가 묵어 STALE 로 보인다.

무엇을 안 하나
  · Polygon/LineString(1.40 MB)은 싣지 않는다. 사건을 열 때 getgeometry 로 받는 경로는 그대로다.
  · 값을 고치지 않는다. 이름 꼬리표('-26')도 원본대로 둔다(intel-feed 가 대조용으로 떼어 쓴다).
"""
import gzip
import json
import os
import time
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

SRC = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=TC"
DST = "events/gdacs-tc.json"
RAW_PREFIX = "archive/gdacs-tc-map"
UA = {"User-Agent": "earthus.net (dalur@kakao.com)"}
# ingestTC()가 읽는 필드(2026-09-05 조사) + 상태 판정에 쓰는 최소 메타. 여기 없는 건 싣지 않는다.
KEEP = ("eventtype", "eventid", "episodeid", "eventname", "name", "alertlevel", "alertscore", "episodealertlevel",
        "country", "iso3", "fromdate", "todate", "datemodified", "iscurrent", "istemporary", "severitydata")


def compact(doc):
    """Point 피처만 · KEEP 필드만. 같은 eventid 가 여러 Point 로 오면 episodeid 가 가장 큰 것만."""
    best = {}
    for f in doc.get("features") or []:
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        p = f.get("properties") or {}
        eid = p.get("eventid")
        if eid is None:
            continue
        ep = p.get("episodeid") or 0
        if eid in best and (best[eid]["properties"].get("episodeid") or 0) >= ep:
            continue
        sd = p.get("severitydata")
        props = {k: p.get(k) for k in KEEP if k in p}
        if isinstance(sd, dict):   # 풍속·등급만 — 원본은 항목당 수백 바이트
            props["severitydata"] = {k: sd.get(k) for k in ("severity", "severityunit", "severitytext") if k in sd}
        best[eid] = {"type": "Feature", "id": f.get("id"), "geometry": {"type": "Point", "coordinates": g.get("coordinates")}, "properties": props}
    return list(best.values())


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    t0 = time.time()
    with urllib.request.urlopen(urllib.request.Request(SRC, headers=UA), timeout=90) as r:
        raw = r.read()
    fetch_ms = round((time.time() - t0) * 1000)
    doc = json.loads(raw.decode("utf-8"))          # 깨진 JSON 이면 여기서 예외 → 축약본을 덮어쓰지 않는다
    raw_key = f"{RAW_PREFIX}/dt={now:%Y-%m-%d}/hh={now:%H}/map.json.gz"
    s3.put_object(Bucket=BUCKET, Key=raw_key, Body=gzip.compress(raw, 6), ContentType="application/json", ContentEncoding="gzip")
    feats = compact(doc)
    out = {
        "type": "FeatureCollection",
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "GDACS (JRC · UN) geteventlist/MAP?eventtype=TC — EARTHUS 축약본(Point 만, 카드 필드만)",
        "license": "CC-BY-4.0 (GDACS)",
        "raw": {"key": raw_key, "bytes": len(raw), "features": len(doc.get("features") or []), "fetchMs": fetch_ms},
        "note": {"ko": "원본은 archive/ 에 그대로 보존한다. 트랙·영향권(Polygon/LineString)은 사건을 열 때 getgeometry 로 따로 받는다."},
        "count": len(feats),
        "features": feats,
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body, ContentType="application/json; charset=utf-8", CacheControl="no-cache")
    print(f"[gdacs-tc] raw {len(raw)} B in {fetch_ms} ms → compact {len(body)} B · {len(feats)} events")
    return {"ok": True, "rawBytes": len(raw), "compactBytes": len(body), "events": len(feats), "fetchMs": fetch_ms}

"""기상청 HSR 레이더 강수 영상 — 공식 경계·범례·생산시각을 포함한 화면용 원본.

APIHub의 그래픽 경로는 투영된 레이더 격자와 국경/행정경계를 함께 렌더링한다.
직접 위경도로 재투영하지 않으므로 위치를 추측하지 않는다. PNG와 메타데이터를
각각 공개 캐시에 저장해 앱은 키를 노출하지 않고 최신 공식 영상을 보여 준다.
"""

import json
import os
import struct
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()
BASE = "https://apihub.kma.go.kr/api/typ03/cgi/rdr/nph-rdr_cmp1_img"
PNG_KEY = "wind/kma-radar.png"
META_KEY = "wind/kma-radar.json"
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
s3 = boto3.client("s3", region_name=REGION)


def requested_times(now=None):
    current = (now or datetime.now(timezone.utc)).astimezone(KST) - timedelta(minutes=5)
    current = current.replace(minute=(current.minute // 5) * 5, second=0, microsecond=0)
    return [(current - timedelta(minutes=offset)).strftime("%Y%m%d%H%M")
            for offset in (0, 5, 10, 15, 20, 25, 30)]


def fetch_image(tm):
    params = {
        "tm": tm, "cmp": "HSR", "qcd": "HSLP", "obs": "ECHD", "color": "C4",
        "aws": "0", "map": "HR", "grid": "2", "legend": "1", "size": "1000",
        "itv": "5", "zoom_level": "0", "zoom_x": "0000000", "zoom_y": "0000000",
        "authKey": KEY,
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as response:
        return response.read()


def png_size(body):
    if len(body) < 24 or body[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not-png")
    return struct.unpack(">II", body[16:24])


def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    body = None
    requested = None
    failures = []
    for candidate in requested_times():
        try:
            attempt = fetch_image(candidate)
            width, height = png_size(attempt)
            if len(attempt) < 10_000 or width < 600 or height < 600:
                raise ValueError(f"undersized:{width}x{height}:{len(attempt)}")
            body, requested = attempt, candidate
            break
        except Exception as error:  # noqa: BLE001 — 이전 생산시각으로 명시적 재시도
            failures.append(f"{candidate}:{type(error).__name__}")
    if body is None:
        raise RuntimeError("레이더 PNG 검증 실패 — 덮어쓰지 않는다: " + ",".join(failures))

    width, height = png_size(body)
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    meta = {
        "schemaVersion": "earthus.kma-radar.v1",
        "generated": generated,
        "requestedKst": requested,
        "observedTimeAuthority": "영상 상단에 기상청 생산시각을 원문 표시",
        "source": "기상청 레이더 HSR 강수량 합성영상 (API허브)",
        "sourceEn": "KMA HSR composite radar precipitation imagery (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "kind": "OBSERVATION_IMAGERY",
        "forecast": False,
        "updateMinutes": 5,
        "unit": "mm/h",
        "coverage": "대한민국 레이더 합성영역",
        "projection": "KMA rendered; boundaries and geolocation retained in source image",
        "image": {"url": "/wind/kma-radar.png", "width": width, "height": height,
                  "bytes": len(body)},
        "note": {
            "ko": "HSR은 지형차폐 영향을 줄인 레이더 강우량 실황입니다. 영상 상단 시각이 정본이며 예보가 아닙니다.",
            "en": "HSR is a terrain-aware radar rainfall observation. The timestamp printed in the image is authoritative; this is not a forecast.",
        },
    }
    s3.put_object(Bucket=BUCKET, Key=PNG_KEY, Body=body, ContentType="image/png",
                  CacheControl="public, max-age=180")
    s3.put_object(Bucket=BUCKET, Key=META_KEY,
                  Body=json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=180")
    return {"ok": True, "requestedKst": requested, "width": width, "height": height,
            "bytes": len(body), "fallbacks": len(failures)}

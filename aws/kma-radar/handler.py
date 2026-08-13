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
HISTORY_PREFIX = "wind/kma-radar-history"
HISTORY_SLOTS = 13  # 5분 × 13 = 최신 약 1시간, 고정 슬롯이라 저장량이 무한히 늘지 않는다.
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
s3 = boto3.client("s3", region_name=REGION)


def requested_times(now=None):
    current = (now or datetime.now(timezone.utc)).astimezone(KST) - timedelta(minutes=5)
    current = current.replace(minute=(current.minute // 5) * 5, second=0, microsecond=0)
    return [(current - timedelta(minutes=offset)).strftime("%Y%m%d%H%M")
            for offset in range(0, 65, 5)]


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


def load_previous_meta():
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=META_KEY)["Body"].read())
    except Exception:  # noqa: BLE001 — 첫 실행/옛 형식은 빈 이력으로 시작
        return {}


def history_slot(requested):
    moment = datetime.strptime(requested, "%Y%m%d%H%M").replace(tzinfo=KST)
    return int(moment.timestamp() // 300) % HISTORY_SLOTS


def merge_frames(previous, current):
    frames = [frame for frame in (previous.get("frames") or [])
              if isinstance(frame, dict)
              and frame.get("requestedKst") != current["requestedKst"]
              and frame.get("slot") != current["slot"]]
    frames.append(current)
    frames.sort(key=lambda frame: frame.get("requestedKst") or "")
    return frames[-HISTORY_SLOTS:]


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
    collected = [(requested, body, width, height)]
    # 운영 schedule은 한 장만 받는다. 배포 직후 명시적 수동 backfill에서만 최근 1시간을 채운다.
    # 실패한 과거 시각은 건너뛰고 현재 정본은 유지한다.
    if event.get("backfillFrames"):
        for candidate in requested_times():
            if candidate == requested:
                continue
            try:
                attempt = fetch_image(candidate)
                attempt_width, attempt_height = png_size(attempt)
                if len(attempt) < 10_000 or attempt_width < 600 or attempt_height < 600:
                    raise ValueError("undersized-backfill")
                collected.append((candidate, attempt, attempt_width, attempt_height))
            except Exception as error:  # noqa: BLE001 — 과거 한 장 실패는 현재 정본을 막지 않는다
                failures.append(f"backfill:{candidate}:{type(error).__name__}")

    slot = history_slot(requested)
    previous = load_previous_meta()
    frames = previous.get("frames") or []
    for frame_requested, frame_body, frame_width, frame_height in collected:
        frame_slot = history_slot(frame_requested)
        history_key = f"{HISTORY_PREFIX}/frame-{frame_slot:02d}.png"
        frame = {
            "slot": frame_slot,
            "requestedKst": frame_requested,
            "generated": generated,
            "url": f"/{history_key}",
            "width": frame_width,
            "height": frame_height,
            "bytes": len(frame_body),
        }
        frames = merge_frames({"frames": frames}, frame)
        s3.put_object(Bucket=BUCKET, Key=history_key, Body=frame_body, ContentType="image/png",
                      CacheControl="public, max-age=180")
    meta = {
        "schemaVersion": "earthus.kma-radar.v2",
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
        "frames": frames,
        "timeline": {
            "intervalMinutes": 5,
            "retentionFrames": HISTORY_SLOTS,
            "retentionMode": "CYCLIC_FIXED_SLOTS",
            "frameCount": len(frames),
            "authoritativeTimeField": "requestedKst",
        },
        "note": {
            "ko": "HSR은 지형차폐 영향을 줄인 레이더 강우량 실황입니다. 영상 상단 시각이 정본이며 예보가 아닙니다.",
            "en": "HSR is a terrain-aware radar rainfall observation. The timestamp printed in the image is authoritative; this is not a forecast.",
        },
    }
    s3.put_object(Bucket=BUCKET, Key=PNG_KEY, Body=body, ContentType="image/png",
                  CacheControl="public, max-age=180")
    # 같은 13개 키만 순환 덮어쓴다. 삭제/ListBucket 권한이나 무한 보존이 필요 없다.
    s3.put_object(Bucket=BUCKET, Key=META_KEY,
                  Body=json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=180")
    return {"ok": True, "requestedKst": requested, "width": width, "height": height,
            "bytes": len(body), "fallbacks": len(failures), "frames": len(frames),
            "historySlot": slot, "backfilled": max(0, len(collected) - 1)}

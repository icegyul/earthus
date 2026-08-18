"""전지구 해양 격자 → 파고 · 너울 · 해수면온도 · 해류

무엇을 담나 (한 번의 요청으로 전부)
  wave    유의파고 (m)              — "파도가 얼마나 높나"
  wdir    파향 (도)
  wper    파주기 (초)
  swell   너울 높이 (m)             — 멀리서 온 긴 파도. 맑은 날에도 위험한 그것.
  sper    너울 주기 (초)
  sst     해수면온도 (°C)
  cur     해류 속도 (m/s)           — 조류가 아니라 해류다. 아래 주의 참고.
  cdir    해류 방향 (도)

⚠️ "조류"와 "해류"는 다르다. 이 자료는 **해류**다.
   조류(tide)는 달·태양의 인력으로 하루 두 번 드나드는 것이고,
   해류(current)는 바람과 밀도차로 흐르는 큰 흐름이다.
   화면에 "조류"라고 쓰면 어민·낚시하는 사람에게 틀린 정보가 된다.
   물때표가 필요한 사람에게 이걸 주면 안 된다 — 그래서 "해류"로만 표기한다.

⚠️ 육지 지점은 값이 없다. 그대로 None 으로 둔다.
   0 으로 채우면 대륙이 "파고 0m 바다"로 칠해진다.

출처: Open-Meteo Marine API (기반: 각국 파랑모델)

결과
  s3://<CACHE_BUCKET>/ocean/marine-ea.json
"""

import json
import os
import re
import time
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
STATUS_DST = "wind/status/marine-ea.json"
COLLECTOR_REVISION = "marine-ea.2026-08-14.n1"
API = "https://marine-api.open-meteo.com/v1/marine"
OISST_DAILY = ("https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/"
               "sst.day.mean.{year}.nc.ascii")
OISST_NORMAL = ("https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/"
                "sst.day.mean.ltm.1991-2020.nc.ascii")

# ⚠️⚠️ **전지구 판(marine-grid)은 5° = 약 550km 다.**
#    한반도 전체가 격자 두세 칸이라 서해·동해·남해가 한 칸에 뭉뚱그려진다.
#    화면에서는 "남해에만 자료가 있는 것"처럼 보인다 — 실제로는 칸이 너무 큰 것이다.
#    → 동아시아만 **0.5° (약 55km)** 로 다시 잰다. 10배 촘촘하다.
# ⚠️ 상자는 천리안 동아시아 영상과 **같은 범위**로 맞췄다. 다른 상자를 쓰면
#    구름과 수온을 겹쳐 볼 때 경계가 어긋나 보인다.
RES = 0.5
LAT0, LAT1 = 23.0, 47.0
LON0, LON1 = 114.0, 150.0
BATCH = 100
PACE = 4.0     # ⚠️ 전지구판보다 점이 적어 조금 빨라도 된다. 더 줄이면 429 가 난다.

dst = boto3.client("s3", region_name=DST_REGION)

VARS = [
    ("wave_height", "wave", 2),
    ("wave_direction", "wdir", 0),
    ("wave_period", "wper", 1),
    ("swell_wave_height", "swell", 2),
    ("swell_wave_period", "sper", 1),
    ("sea_surface_temperature", "sst", 1),
    ("ocean_current_velocity", "cur", 2),
    ("ocean_current_direction", "cdir", 0),
]


def _previous_success():
    """직전 성공시각만 이어받는다. 상태 파일이 없거나 손상되면 추측하지 않는다."""
    try:
        body = dst.get_object(Bucket=DST_BUCKET, Key=STATUS_DST)["Body"].read(32768)
        doc = json.loads(body)
        value = doc.get("lastSuccessAt") if isinstance(doc, dict) else None
        return value if isinstance(value, str) and value.endswith("Z") else None
    except Exception:  # noqa: BLE001 — 첫 실행·옛 배포에는 상태 파일이 없다.
        return None


def write_status(started_at, state, reason, output_written, **details):
    """last-good 해양 격자와 이번 실행 상태를 분리해 기록한다.

    ⚠️ Lambda timeout은 Python 예외가 아니라 프로세스 강제 종료다. 제한시간 직전
    스스로 중단해 이 heartbeat를 남겨야 옛 자료가 정상처럼 보이지 않는다.
    """
    completed = datetime.now(timezone.utc)
    previous_success = _previous_success()
    last_success = (completed.strftime("%Y-%m-%dT%H:%M:%SZ")
                    if state == "SUCCEEDED" else previous_success)
    doc = {
        "schema": 2,
        "collector": "marine-ea",
        "revision": COLLECTOR_REVISION,
        "generated": completed.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lastAttemptAt": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lastSuccessAt": last_success,
        "state": state,
        "reason": reason,
        "outputKey": "ocean/marine-ea.json",
        "lastGood": "ocean/marine-ea.json" if last_success else None,
        "outputWritten": bool(output_written),
        "latencyMs": round((completed - started_at).total_seconds() * 1000),
        "quota": "UNKNOWN",
        "estimatedCost": "UNKNOWN",
    }
    doc.update({key: value for key, value in details.items() if value is not None})
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    dst.put_object(Bucket=DST_BUCKET, Key=STATUS_DST, Body=body,
                   ContentType="application/json; charset=utf-8", CacheControl="no-cache")
    return doc


def deadline_near(context, reserve_ms=90000):
    """상태 기록과 현재 batch 종료에 필요한 시간을 남긴다."""
    remaining = getattr(context, "get_remaining_time_in_millis", lambda: 600000)()
    return remaining < reserve_ms


def _oisst_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "earthus-marine-ea/1.0"})
    with urllib.request.urlopen(request, timeout=90) as r:
        return r.read().decode("utf-8", "replace")


def _oisst_time_len(year):
    """연도 OISST가 실제로 가진 마지막 일 인덱스. 미래 날짜를 요청하지 않는다."""
    text = _oisst_text(OISST_DAILY.format(year=year).replace(".ascii", ".dds"))
    match = re.search(r"Float64 time\[time = (\d+)\]", text)
    if not match:
        raise ValueError("OISST 시간축 길이를 읽지 못함")
    return int(match.group(1))


def _oisst_values(text, ny, nx):
    """OPeNDAP ASCII의 한 시간면을 [행][열]로 읽는다. 육지는 None이다."""
    rows = [None] * ny
    for line in text.splitlines():
        if not line.startswith("[0]["):
            continue
        try:
            head, tail = line.split(",", 1)
            row = int(head.split("][", 1)[1].rstrip("]"))
            values = [float(v.strip()) for v in tail.split(",")]
        except (ValueError, IndexError):
            continue
        if 0 <= row < ny:
            rows[row] = [None if abs(v) > 100 else round(v, 2) for v in values[:nx]]
    if any(row is None or len(row) != nx for row in rows):
        raise ValueError("OISST 격자가 완전하지 않음")
    return [value for row in rows for value in row]


def oisst_anomaly_ea(now):
    """동아시아 0.5° OISST 일별 관측 − 같은 날짜의 1991–2020 평년.

    Open-Meteo 모델 격자에서 NOAA 평년을 빼면 해상도와 자료 성격이 섞인다.
    편차는 같은 OISST 격자끼리만 빼며, 원본이 늦게 올라오면 마지막 실제 관측일을
    `observed`로 남긴다. 미래 날짜나 보간한 오늘값은 만들지 않는다.
    """
    ny, nx = 49, 73                    # 23.125..47.125N, 114.125..150.125E, 0.5°
    lat = "[452:2:548]"
    lon = "[456:2:600]"
    available = _oisst_time_len(now.year)
    last_error = None
    for back in range(8):
        observed = (now - timedelta(days=back)).date()
        year_start = datetime(observed.year, 1, 1, tzinfo=timezone.utc)
        step = (datetime(observed.year, observed.month, observed.day, tzinfo=timezone.utc) - year_start).days
        if step < 0 or step >= available:
            continue
        try:
            daily = _oisst_text(f"{OISST_DAILY.format(year=observed.year)}?sst[{step}:1:{step}]{lat}{lon}")
            current = _oisst_values(daily, ny, nx)
            doy = min(364, step)
            normal = _oisst_text(f"{OISST_NORMAL}?sst[{doy}:1:{doy}]{lat}{lon}")
            baseline = _oisst_values(normal, ny, nx)
            diff = [round(a - b, 2) if a is not None and b is not None else None
                    for a, b in zip(current, baseline)]
            count = sum(value is not None for value in diff)
            if count < 500:
                raise ValueError(f"바다 격자 부족 ({count}/{nx * ny})")
            return {
                "observed": f"{observed.isoformat()}T00:00:00Z", "doy": doy + 1,
                "time": f"{observed.isoformat()}T00:00:00Z",
                "res": 0.5, "lat0": 23.125, "lon0": 114.125, "nx": nx, "ny": ny,
                "source": "NOAA OISST v2.1 daily observation minus 1991-2020 daily climatology",
                "attribution": "NOAA PSL OISST v2.1",
                "period": "1991-2020", "sst": current, "sstAnom": diff, "sea": count,
                "units": {"sst": "°C", "sstAnom": "°C"},
                "vars": ["sst", "sstAnom"],
            }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"[oisst] {observed.isoformat()} 실패: {exc!r}")
    raise RuntimeError(f"최근 8일 OISST를 받지 못함: {last_error!r}")


def grid_points():
    lons = [LON0 + i * RES for i in range(int((LON1 - LON0) / RES) + 1)]
    lats = [LAT0 + j * RES for j in range(int((LAT1 - LAT0) / RES) + 1)]
    return lats, lons


def fetch_batch(pts, tries=4):
    q = urllib.parse.urlencode({
        "latitude": ",".join(f"{p[0]:.2f}" for p in pts),
        "longitude": ",".join(f"{p[1]:.2f}" for p in pts),
        "current": ",".join(v[0] for v in VARS),
        "timezone": "UTC",
        # Open-Meteo 해류 기본값은 km/h다. 출력 계약은 m/s이므로 요청부터 고정한다.
        "wind_speed_unit": "ms",
        "cell_selection": "sea",
    })
    wait = 8
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{API}?{q}", timeout=45) as r:
                d = json.load(r)
            rows = d if isinstance(d, list) else [d]
            for item in rows:
                current = (item or {}).get("current") or {}
                value = current.get("ocean_current_velocity")
                if value is None:
                    continue
                unit = ((item or {}).get("current_units") or {}).get("ocean_current_velocity")
                if unit == "km/h":
                    current["ocean_current_velocity"] = value / 3.6
                elif unit != "m/s":
                    raise ValueError(f"해류 단위 불명: {unit!r}")
            return rows
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == tries - 1:
                raise
            print(f"  429 — {wait}초 대기 후 재시도")
            time.sleep(wait)
            wait *= 2
    return []


def handler(event, context):
    started_at = datetime.now(timezone.utc)
    # OISST 편차는 Open-Meteo 모델 격자와 독립된 NOAA 일별 관측 자료다.
    # 운영 수집이 429 재시도 중일 때도 이 좁은 재생성 경로는 모델 API를 건드리지 않는다.
    if (event or {}).get("only") == "sst_anom":
        anomaly = oisst_anomaly_ea(datetime.now(timezone.utc))
        anom_body = json.dumps(anomaly, separators=(",", ":")).encode()
        dst.put_object(Bucket=DST_BUCKET, Key="ocean/sst-anom-ea.json", Body=anom_body,
                       ContentType="application/json", CacheControl="public, max-age=21600")
        print(f"[oisst] 단독 생성 {anomaly['sea']}칸 {anomaly['observed']}")
        return {"ok": True, "only": "sst_anom", "sea": anomaly["sea"],
                "observed": anomaly["observed"]}

    lats, lons = grid_points()
    ny, nx = len(lats), len(lons)
    order = [(la, lo) for la in lats for lo in lons]
    n = nx * ny

    out = {f: [None] * n for _, f, _ in VARS}
    sea = fail = 0

    for i in range(0, len(order), BATCH):
        if deadline_near(context):
            reason = "lambda-deadline-near-before-complete-grid"
            write_status(started_at, "FAILED", reason, False,
                         processedPointCount=i, totalPointCount=n,
                         sampleCount=sea, missing=fail,
                         sourceObservedAt=None)
            return {"ok": False, "status": "FAILED", "reason": reason,
                    "processed": i, "total": n}
        chunk = order[i:i + BATCH]
        try:
            res = fetch_batch(chunk)
        except Exception as e:                               # noqa: BLE001
            fail += len(chunk)
            print(f"[batch {i}] 실패: {e}")
            continue
        for k, item in enumerate(res):
            idx = i + k
            if idx >= n:
                continue
            c = (item or {}).get("current") or {}
            got = False
            for key, field, nd in VARS:
                v = c.get(key)
                if v is None:
                    continue                                 # ⚠️ 육지 — 채우지 않는다
                out[field][idx] = round(v, nd) if nd else int(round(v))
                got = True
            if got:
                sea += 1
        time.sleep(PACE)

    # ⚠️ 지구의 약 70%가 바다다. 격자점의 절반도 안 차면 무언가 잘못된 것이다.
    if sea < n * 0.35:
        reason = f"usable-grid-too-small:{sea}/{n}"
        write_status(started_at, "FAILED", reason, False,
                     processedPointCount=n, totalPointCount=n,
                     sampleCount=sea, missing=fail)
        raise RuntimeError(f"바다 격자를 너무 못 채움 ({sea}/{n})")

    # 수온 편차는 모델값에 다른 기관의 평년장을 억지로 빼지 않는다. 같은 NOAA
    # OISST 일별 관측과 평년을 같은 0.5° 칸에서 뺀 결과만 별도 파일에 기록한다.
    # ⚠️ OISST가 잠시 지연돼도 기존 수온·파고·해류 격자까지 멈추게 하지 않는다.
    try:
        anomaly = oisst_anomaly_ea(datetime.now(timezone.utc))
    except Exception as exc:  # noqa: BLE001
        anomaly = None
        print(f"[oisst] 편차는 이번 회차 보류: {exc!r}")

    doc = {
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z"),
        "res": RES, "lat0": LAT0, "lon0": LON0,
        "nx": nx, "ny": ny,
        "source": "Open-Meteo Marine",
        "units": {"wave": "m", "wdir": "°", "wper": "s", "swell": "m",
                  "sper": "s", "sst": "°C", "cur": "m/s", "cdir": "°"},
        "vars": [f for _, f, _ in VARS],
        "sea": sea,
        **out,
    }
    body = json.dumps(doc, separators=(",", ":")).encode()
    dst.put_object(Bucket=DST_BUCKET, Key="ocean/marine-ea.json", Body=body,
                   ContentType="application/json",
                   CacheControl="public, max-age=1800")
    if anomaly:
        anom_body = json.dumps(anomaly, separators=(",", ":")).encode()
        dst.put_object(Bucket=DST_BUCKET, Key="ocean/sst-anom-ea.json", Body=anom_body,
                       ContentType="application/json",
                       CacheControl="public, max-age=21600")
    counts = {f: sum(1 for v in out[f] if v is not None) for _, f, _ in VARS}
    write_status(started_at, "SUCCEEDED", "marine-grid-written", True,
                 dataGenerated=doc["time"], sourceObservedAt=doc["time"],
                 processedPointCount=n, totalPointCount=n,
                 sampleCount=sea, missing=fail, failureCount=fail,
                 outputBytes=len(body), anomalySampleCount=anomaly["sea"] if anomaly else 0)
    anom_note = (f" · OISST 편차 {anomaly['sea']}칸 {anomaly['observed']}"
                 if anomaly else " · OISST 편차 보류")
    print(f"[out] {nx}x{ny} 바다 {sea} 실패 {fail} {len(body)/1024:.0f}KB  {counts}{anom_note}")
    return {"ok": True, "sea": sea, "failed": fail, "bytes": len(body), "counts": counts,
            "anomalySea": anomaly["sea"] if anomaly else 0,
            "anomalyObserved": anomaly["observed"] if anomaly else None}

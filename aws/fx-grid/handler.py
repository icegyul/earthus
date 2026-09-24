# -*- coding: utf-8 -*-
"""동아시아 1° 예보 격자 — 태풍 화면의 시간 이동(타임라인)용

받은 지시
  "윈디 기준으로 시간을 정해서 위치를 잡아주면 될 거 같은데" +
  "타임라인 잡고 움직이면 그 시간대 위치, 플레이 버튼으로 시간대별 움직임"

지금 화면의 등압선(pressure-grid)과 바람 입자(wind-grid)는 **실황**이다.
타임라인으로 시간을 밀면 그 시각의 **모델 예보** 기압·바람이 필요하다.
그걸 여기서 만든다 — 같은 동아시아 1° 격자로, 6시간 간격 +120시간(5일).

⚠️ 5일에서 끊는 이유: 태풍의 공식 예보(위치·반경)가 120시간까지다.
   그 너머는 격자가 있어도 태풍을 그릴 근거가 없다 — 지어내게 된다.
⚠️ 격자·범위·한도 사정은 pressure-grid/handler.py 주석 참고 (같은 격자다).
⚠️ 바람은 Open-Meteo 가 속도·방향으로 주므로 여기서 u/v(동·북 성분)로
   바꿔 둔다 — 클라이언트 입자 엔진(windfield.js)이 u/v 를 먹는다.
   기상 방향은 "불어오는 쪽"이라 u = -spd·sin(dir), v = -spd·cos(dir).
   (2026-09-24 정정) 이제 원천이 NOAA GFS 라 u·v 성분(UGRD·VGRD 10 m)을 그대로 받는다 — 변환이 없다.

출력  wind/fx-ea.json
  { time, lat0, lon0, res, nx, ny, stepH, source,
    steps: [ { t, mslp[], u[], v[], min, max } × 21 ] }
  결측은 null 그대로 둔다 — 등압선은 빈 칸을 안 그린다(추정 금지).

(2026-09-24 정정) 원천을 Open-Meteo 지점 API(hourly, forecast_days=6) → **NOAA/NCEP GFS 0.5° NOMADS** 로 바꿨다
   (docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md S2). 한 회차(run)에서 지금에 가장 가까운 3시간 스텝 f0 을 잡고
   f0, f0+6, …, f0+120 을 부분 영역으로 받는다(21회 요청, 각 수십 KB). 0.5° 원격자의 정확한 1° 점만 쓴다 — 보간 없음.
   바뀌지 않은 것: 파일 이름 · 키 · 격자 · steps[].{t,h,min,max,mslp,u,v} · stepH · maxH.
   바뀐 것: steps[].t 가 "지금 정시 + 6h·k"가 아니라 **GFS 유효시각**이다(최대 1.5시간 차이). 모든 스텝이
      **한 회차**에서 나온다(예전 Open-Meteo 는 여러 모델을 이어 붙인 'best match'였다). modelRun 등 출처 키를 더했다.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import boto3

_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_AWS, "_shared"))

import nomads_gfs  # noqa: E402

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/fx-ea.json"
# (2026-09-24 정정) 옛 원천 — 기록으로 남긴다. 이 함수는 더 이상 부르지 않는다.
#   API = "https://api.open-meteo.com/v1/forecast"
NATIVE = "0p50"
NATIVE_RES = 0.5

# ⚠️ pressure-grid 와 반드시 같은 격자 — 클라이언트가 같은 그리기 코드를 쓴다
LAT0, LAT1 = 20.0, 50.0
LON0, LON1 = 110.0, 160.0
RES = 1.0
# (2026-09-24 정정) BATCH = 100 은 Open-Meteo 지점 묶음 크기였다. GRIB 부분 영역에는 묶음이 없다.
STEP_H = 6            # 6시간 간격
MAX_H = 120           # +5일 — 태풍 공식 예보의 한계에 맞춘다
DEADLINE_S = 240      # deploy-python.sh 기본 제한 300초 안에서 멈춘다 — 남은 스텝은 비우고 이유를 적는다

# ── 옛 Open-Meteo 경로의 사고 기록 (2026-09-24 정정: 코드는 걷어냈고 주석은 남긴다) ─────────────
#   "hourly": "pressure_msl,wind_speed_10m,wind_direction_10m", "forecast_days": 6  # 오늘 + 5일 → +120h 가 들어온다
#   ⚠️ 분당 한도 — pressure-grid 에서 실측으로 배운 그대로: 점점 더 기다린다
#   steps[k][i] = k번째 시각, i번째 점 (2026-09-24 검수: 옮기며 빠진 줄을 되살렸다 — 지금은 steps[k] 가 스텝 하나, 그 안의 mslp[i]·u[i]·v[i] 가 i번째 점)
#   "지금" 정시부터 6시간 간격으로 자른다.
#   ⚠️ 배열 첫 칸은 오늘 00시(UTC)다 — 지금이 아니다. 지금 시각을 찾는다.
#      (2026-09-24 정정) 지금은 회차 기준 예보시간(fh)으로 고른다 — '지금'에 가장 가까운 3시간 스텝이 f0 이다.
# ─────────────────────────────────────────────────────────────────────────────

VARIABLES = ("PRMSL", "UGRD", "VGRD")
LEVELS = (nomads_gfs.LEV_MSL, nomads_gfs.LEV_10M)
MIN_FILL = 0.7


def _grib2lite_path():
    """pressure-grid/handler.py 와 같은 관용구 — 패키저가 zip 루트에 넣는다(lambda_package.cross_function_files)."""
    for candidate in (
        os.path.join(_HERE, "grib2lite.py"),                                # 배포 패키지 루트
        os.path.join(_AWS, "gfs-cloud-forecast", "grib2lite.py"),           # 저장소
    ):
        if os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("grib2lite.py 를 찾지 못했다 — 패키지 루트, aws/gfs-cloud-forecast/")


def _load_grib2lite():
    import importlib.util
    if "grib2lite" in sys.modules:
        return sys.modules["grib2lite"]
    spec = importlib.util.spec_from_file_location("grib2lite", _grib2lite_path())
    mod = importlib.util.module_from_spec(spec)
    sys.modules["grib2lite"] = mod
    spec.loader.exec_module(mod)
    return mod


g2 = _load_grib2lite()


def _url(run, fh):
    return nomads_gfs.filter_url(run, fh, res=NATIVE, variables=VARIABLES, levels=LEVELS,
                                 bbox=(LAT0, LON0, LAT1, LON1))


def pick_run(now=None, get=None):
    """마지막 스텝(f0+120)까지 올라온 가장 최근 회차. → (회차, f0)

    ⚠️ GFS 는 회차 발표 뒤 몇 시간에 걸쳐 스텝이 차례로 올라온다. 첫 스텝만 보고 고르면
       뒤쪽 스텝이 비어 타임라인 끝이 사라진다 — 마지막 스텝이 있는지를 먼저 본다(gfs-cloud-forecast pick_run 과 같은 판단).
    """
    get = get or nomads_gfs.http_get
    now = now or datetime.now(timezone.utc)
    errors = []
    for run in nomads_gfs.candidate_runs(now):
        f0 = nomads_gfs.nearest_step(run, now)
        if f0 is None:
            continue
        try:
            get(_url(run, f0 + MAX_H), tries=1)
            return run, f0
        except Exception as e:  # noqa: BLE001
            errors.append("%s f%03d: %s" % (run.strftime("%Y%m%d%H"), f0 + MAX_H, str(e)[:60]))
    raise RuntimeError("f+120 까지 올라온 GFS 회차가 없다: " + " | ".join(errors))


def build_steps(run, f0, get=None, clock=time.monotonic):
    """회차 하나에서 스텝 21개 → (steps, 빠진 스텝 목록, 첫 스텝 채움 수)"""
    get = get or nomads_gfs.http_get
    lats, lons, pts = nomads_gfs.regular_points(LAT0, LAT1, LON0, LON1, RES)
    started = clock()
    steps, missing = [], []
    first_ok = 0
    for s_i in range(MAX_H // STEP_H + 1):
        fh = f0 + s_i * STEP_H
        if clock() - started > DEADLINE_S:
            missing.append({"h": s_i * STEP_H, "fh": fh, "why": "DEADLINE"})
            continue
        try:
            fields = nomads_gfs.read_fields(get(_url(run, fh)), g2)
        except Exception as e:  # noqa: BLE001
            missing.append({"h": s_i * STEP_H, "fh": fh, "why": str(e)[:80]})
            continue
        if "prmsl" not in fields:
            missing.append({"h": s_i * STEP_H, "fh": fh, "why": "PRMSL 없음"})
            continue
        msl = [round(v / 100.0, 1) if v is not None else None
               for v in nomads_gfs.sample(fields["prmsl"], pts, NATIVE_RES)]
        if "u10" in fields and "v10" in fields:
            uu = [round(v, 1) if v is not None else None
                  for v in nomads_gfs.sample(fields["u10"], pts, NATIVE_RES)]
            vv = [round(v, 1) if v is not None else None
                  for v in nomads_gfs.sample(fields["v10"], pts, NATIVE_RES)]
        else:
            # ⚠️ 바람이 없으면 비운다 — 0 으로 채우면 '바람 없음'이 된다.
            uu = [None] * len(pts)
            vv = [None] * len(pts)
        got = [v for v in msl if v is not None]
        if s_i == 0:
            first_ok = len(got)
        if not got:
            missing.append({"h": s_i * STEP_H, "fh": fh, "why": "빈 격자"})
            continue
        valid = nomads_gfs.valid_time(fields["prmsl"]["desc"]) or (run + timedelta(hours=fh))
        steps.append({
            "t": valid.strftime("%Y-%m-%dT%H:00:00Z"), "h": s_i * STEP_H, "fh": fh,
            "min": min(got), "max": max(got),
            "mslp": msl, "u": uu, "v": vv,
        })
    return steps, missing, first_ok, (len(lats), len(lons), len(pts))


def build_doc(run, f0, steps, missing, first_ok, dims, url0, now=None):
    now = now or datetime.now(timezone.utc)
    ny, nx, npts = dims
    return {
        "time": steps[0]["t"] if steps else now.strftime("%Y-%m-%dT%H:00:00Z"),
        "lat0": LAT0, "lon0": LON0, "res": RES, "nx": nx, "ny": ny,
        "stepH": STEP_H, "maxH": MAX_H,
        "unit": {"mslp": "hPa", "uv": "m/s"},
        "source": "NOAA/NCEP GFS 0.5° (NOMADS) 모델 예보",
        "note": {"ko": "모델이 계산한 예보입니다. 저희 예보가 아니며, 실황과 함께 "
                       "쓰지 않도록 화면에서 '예보 보기'를 명시합니다. "
                       "NOAA GFS 한 회차의 값입니다(수치모델 예측 · 기상청 예보 아님)."},
        "filled": first_ok, "failed": npts - first_ok,
        "dataKind": "MODEL_FORECAST",
        "model": "gfs_0p50",
        "modelRun": nomads_gfs.iso(run),
        "firstForecastHour": f0,
        "generatedAt": nomads_gfs.iso(now),
        "provider": "NOAA National Centers for Environmental Prediction",
        "sourceUrl": url0,
        "providerUrl": "https://www.nco.ncep.noaa.gov/pmb/products/gfs/",
        "termsUrl": "https://www.weather.gov/disclaimer",
        "attribution": "NOAA/NCEP GFS · NOMADS",
        "licenseStatus": "APPROVED_FREE",
        "derivation": "Native 0.5° GFS grid subsampled to exact 1° grid points; no interpolation; u/v = UGRD/VGRD 10 m",
        "stepsMissing": missing,
        "steps": steps,
    }


def handler(event=None, context=None):
    run, f0 = pick_run()
    steps, missing, first_ok, dims = build_steps(run, f0)
    npts = dims[2]
    if first_ok < npts * MIN_FILL:
        print(f"[fx] 쓰지 않음 — 첫 스텝 채움 {first_ok}/{npts} (옛 파일 유지)")
        return {"ok": False, "reason": f"filled {first_ok}/{npts}"}
    doc = build_doc(run, f0, steps, missing, first_ok, dims, _url(run, f0))
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=3600")
    print(f"[fx] {dims[1]}x{dims[0]} × {len(steps)}스텝 · run {doc['modelRun']} f{f0:03d}~ · "
          f"빠짐 {len(missing)} · {len(body) / 1024:.0f}KB")
    return {"ok": True, "steps": len(steps), "filled": first_ok, "missing": len(missing),
            "modelRun": doc["modelRun"], "bytes": len(body)}

# -*- coding: utf-8 -*-
"""동아시아 1° 해면기압 격자 — 등압선을 그리기 위한 것

받은 지적
  "기압배치에 고기압 저기압 배치를 등고선을 써서 보여주면 어때? 더 정확할거 같은데"

맞는 말이다. 기상학에서 기압을 읽는 방식이 그것이다 —
**등압선의 간격이 곧 바람 세기**다. 촘촘하면 세다. 색칠만으로는 그게 안 보인다.

⚠️⚠️ 그런데 기존 전지구 격자는 **5°(약 555km)** 다. 한반도 전체가 한 칸이다.
   그 격자로 매끄러운 등압선을 그리면 **없는 정밀도를 있는 척하는 것**이 된다 —
   555km 간격 점 넷을 이어 놓고 "여기 전선이 있다"처럼 보이게 된다.
   → 그래서 **이 영역만 1°(약 111km)** 로 따로 받는다.

⚠️ 범위를 동아시아로 잡은 이유
   "태풍이 북태평양 고기압 가장자리를 따라 간다"를 보려면 그 고기압이 화면에 들어와야
   한다. 여름 북태평양 고기압 중심은 대략 30N/150E 부근이다. 그래서 160E 까지 잡았다.
   ⚠️ 전지구를 1° 로 하면 격자가 25배(약 6만 점)라 Open-Meteo 한도에 걸린다.
      우리 사용자가 실제로 들여다보는 곳만 촘촘하게 한다.

실측(2026-08-03): 304점 6.8초. 아래 범위(1,581점)면 16회 요청, 약 11초.

⚠️⚠️ **바람도 같이 받는다 (2026-09-08).** Open-Meteo 는 요청 수로 한도를 세지
   변수 수로 세지 않는다 — 이미 던지는 16회 요청에 `wind_speed_10m`,
   `wind_direction_10m` 을 얹으면 **추가 요청 0회**로 1° 바람 격자가 나온다.
   왜 필요했나: 전지구 바람 격자가 5°(555km)라 **태풍이 통째로 격자 사이로
   빠진다.** 2026-09-08 실측 — 전지구 2,376칸의 최대 풍속이 23.8m/s 였고
   30m/s 이상은 0칸이었다. 같은 시각 일본 주변 5° 격자의 최대는 14.2m/s 다.
   화면에서 "태풍인데 바람이 전혀 안 느껴진다"가 된 이유가 이것이다.
   ⚠️ 1°(약 111km)도 태풍 눈벽(약 50km)을 온전히 담지는 못한다. 담는 것은
      **폭풍역**이다 — 그것만으로도 5° 가 놓치던 25~35m/s 가 살아난다.

출력  wind/pressure-ea.json   (mslp — 등압선)
      wind/wind-ea.json       (u·v — 바람 색면·입자 보강판)

(2026-09-24 정정) 원천을 Open-Meteo 지점 API → **NOAA/NCEP GFS 0.5° (NOMADS GRIB 필터)** 로 바꿨다.
   왜: Open-Meteo 무료 API 는 비상업 전용이고(약관 "apps that have subscriptions"), 2027-01-01 유료 개시 전에
   대량 격자부터 공공 원천으로 옮긴다(docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md S1).
   어떻게: 동아시아 부분 영역(20–50N · 110–160E)을 **요청 1회**로 받고(PRMSL · UGRD/VGRD 10 m),
   0.5° 원격자에서 **정확한 1° 점**만 뽑는다 — 보간·평균·결측 채움 없음(tpw-grid 와 같은 규칙).
   바뀌지 않은 것: 파일 이름 두 개 · 키(time·lat0·lon0·res·nx·ny·unit·mslp·u·v·min·max·filled·failed) · 격자 · 배열 순서.
   바뀐 것: `time` 이 "Lambda 가 돈 정시"에서 **GFS 가 그 값을 계산한 유효시각**이 됐다 — 지금에 가장 가까운 3시간 스텝이다.
      `source` 글이 바뀌었고 model·modelRun·validAt·dataKind·attribution·licenseStatus 를 더했다(더하기만).
   ⚠️ `clouds/gfs-fc` 의 m 프레임(8bit 해면기압)을 읽지 않은 이유: 1 hPa 눈금 양자화 값이고, 처음엔 940 hPa 에서
      잘려 태풍 중심 354칸이 평평해졌다(gfs-cloud-forecast/handler.py:146). 등압선은 원값으로 그린다.
"""

import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

import boto3

_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_AWS, "_shared"))

import nomads_gfs  # noqa: E402

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/pressure-ea.json"
DST_WIND = "wind/wind-ea.json"
# (2026-09-24 정정) 옛 원천 — 기록으로 남긴다. 이 함수는 더 이상 부르지 않는다.
#   API = "https://api.open-meteo.com/v1/forecast"
NATIVE = "0p50"
NATIVE_RES = 0.5

# 동아시아 — 북태평양 고기압이 들어오도록 동쪽을 넓게
LAT0, LAT1 = 20.0, 50.0
LON0, LON1 = 110.0, 160.0
RES = 1.0
# (2026-09-24 정정) BATCH = 100 은 Open-Meteo 지점 묶음 크기였다(좌표를 URL 에 이어 붙이므로 무한정 못 늘렸다).
#   GRIB 부분 영역은 한 번에 오므로 묶음이 없다.

# ── 옛 Open-Meteo 경로의 사고 기록 (2026-09-24 정정: 코드는 걷어냈고 주석은 남긴다) ─────────────
#   "current": "pressure_msl,wind_speed_10m,wind_direction_10m"
#   바람은 u/v 로 저장한다 — 클라이언트가 벡터 크기와 방향을 둘 다 쓴다.   ← 지금도 같은 규칙 (2026-09-24 검수: 옮기며 빠진 줄을 되살렸다)
#   ⚠️ 변수를 늘려도 **요청 수는 그대로**다. 바람은 여기 얹어서 공짜로 얻는다.
#   ⚠️⚠️ **Open-Meteo 는 분당 한도가 있다.** 쉬지 않고 던지면 6회쯤에서
#      429 가 시작된다 — 실측으로 1,581점 중 600점만 채워졌다.
#      wind-grid 에 이미 같은 로직이 있었는데 여기 안 옮겨서 그대로 걸렸다.
#      → 걸리면 **점점 더 기다린다.** 그래도 안 되면 그 묶음만 비운다(추정 안 함).
#   ⚠️ 결측을 채우지 않는다. 등압선은 빈 칸을 만나면 그 구간을 안 그린다.   ← 지금도 같은 규칙
#   ⚠️ 기상 풍향은 **불어오는 쪽**이다. 벡터는 불어가는 쪽이라 부호가 뒤집힌다.
#      이걸 틀리면 바람이 통째로 거꾸로 흐른다(소말리 제트로 검산 가능).
#      (2026-09-24 정정) GFS 는 u·v 성분(UGRD·VGRD)을 그대로 준다 — 풍향 변환이 없어졌고 뒤집을 일도 없다.
#   ⚠️ 묶음 사이 간격. 0.25 초로는 한도에 걸렸다 — 넉넉히 둔다.
# ─────────────────────────────────────────────────────────────────────────────

VARIABLES = ("PRMSL", "UGRD", "VGRD")
LEVELS = (nomads_gfs.LEV_MSL, nomads_gfs.LEV_10M)
MIN_FILL = 0.7          # 예전과 같은 문턱 — 이보다 적게 차면 쓰지 않고 옛 파일을 둔다


def _grib2lite_path():
    """grib2lite 를 경로로 찾는다. 배포 패키지는 루트에 평평하게, 저장소에서는 gfs-cloud-forecast 옆.

    ⚠️ sys.path 에 다른 함수 폴더를 넣지 않는다 — 같은 이름의 모듈이 서로를 가린다
       (aws/distribution/sources/verify_scorecard.py `_load` 주석의 사고). 패키저가 아래 관용구를 읽고
       zip 루트에 넣는다(aws/_shared/lambda_package.py cross_function_files).
    """
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


def fetch_now(now=None, get=None):
    """지금에 가장 가까운 스텝을 가진 가장 최근 회차. → (필드들, 회차, 스텝, 주소)"""
    get = get or nomads_gfs.http_get
    now = now or datetime.now(timezone.utc)
    errors = []
    for run in nomads_gfs.candidate_runs(now):
        fh = nomads_gfs.nearest_step(run, now)
        if fh is None:
            continue
        url = nomads_gfs.filter_url(run, fh, res=NATIVE, variables=VARIABLES, levels=LEVELS,
                                    bbox=(LAT0, LON0, LAT1, LON1))
        try:
            raw = get(url)
            fields = nomads_gfs.read_fields(raw, g2)
            if "prmsl" not in fields:
                raise ValueError("PRMSL 메시지 없음")
            return fields, run, fh, url
        except Exception as e:  # noqa: BLE001 — 아직 안 올라온 회차는 흔하다. 다음 회차로
            errors.append("%s f%03d: %s" % (run.strftime("%Y%m%d%H"), fh, str(e)[:80]))
    raise RuntimeError("NOAA GFS 회차를 못 찾음: " + " | ".join(errors))


def build(fields, run, fh, url, now=None):
    """GRIB 필드 → (pressure 문서, wind 문서 또는 None). S3 에 쓰지 않는다 — 시험이 이 함수를 본다."""
    now = now or datetime.now(timezone.utc)
    lats, lons, pts = nomads_gfs.regular_points(LAT0, LAT1, LON0, LON1, RES)
    ny, nx = len(lats), len(lons)

    raw_p = nomads_gfs.sample(fields["prmsl"], pts, NATIVE_RES)
    # Pa → hPa. ⚠️ 결측을 채우지 않는다.
    vals = [round(v / 100.0, 1) if v is not None else None for v in raw_p]
    ok = sum(1 for v in vals if v is not None)
    if ok < len(vals) * MIN_FILL:
        return None, None, {"ok": False, "reason": f"filled {ok}/{len(vals)}"}

    desc = fields["prmsl"]["desc"]
    valid = nomads_gfs.valid_time(desc) or (run + timedelta(hours=fh))
    issued = nomads_gfs.ref_time(desc)
    got = [v for v in vals if v is not None]
    common = {
        "time": valid.strftime("%Y-%m-%dT%H:00:00Z"),
        "lat0": LAT0, "lon0": LON0, "res": RES, "nx": nx, "ny": ny,
    }
    provenance = {
        "dataKind": "MODEL_FORECAST" if fh else "MODEL_ANALYSIS",
        "model": "gfs_0p50",
        "modelRun": nomads_gfs.iso(issued),
        "forecastHour": fh,
        "validAt": nomads_gfs.iso(valid),
        "generatedAt": nomads_gfs.iso(now),
        "provider": "NOAA National Centers for Environmental Prediction",
        "sourceUrl": url,
        "providerUrl": "https://www.nco.ncep.noaa.gov/pmb/products/gfs/",
        "termsUrl": "https://www.weather.gov/disclaimer",
        "attribution": "NOAA/NCEP GFS · NOMADS",
        "licenseStatus": "APPROVED_FREE",
        "derivation": "Native 0.5° GFS grid subsampled to exact 1° grid points; no interpolation",
    }
    doc = dict(common)
    doc.update({
        "unit": "hPa",
        "source": "NOAA/NCEP GFS 0.5° (NOMADS)",
        "filled": ok, "failed": len(vals) - ok,
        "min": min(got), "max": max(got),
        "note": {
            "ko": f"동아시아 {RES}° 해면기압 격자입니다. 등압선을 그리기 위한 자료로, "
                  f"전지구 격자(5°)로는 한반도가 한 칸이라 따로 받습니다. "
                  f"⚠️ 1°는 약 111km 입니다 — 그보다 작은 기압 변화는 이 자료에 없습니다. "
                  f"NOAA GFS 모델값이며 관측이 아닙니다.",
        },
        "mslp": vals,
    })
    doc.update(provenance)

    # ── 바람 1° 보강판 ────────────────────────────────────────────────
    # ⚠️ 기압이 충분히 찼는데 바람만 비었다면 그건 응답 형식이 바뀐 것이다.
    #    없는 자료를 0 으로 채우지 않는다 — 파일을 아예 안 쓰고 이유를 남긴다.
    wdoc = None
    if "u10" in fields and "v10" in fields:
        wu = [round(v, 2) if v is not None else None
              for v in nomads_gfs.sample(fields["u10"], pts, NATIVE_RES)]
        wv = [round(v, 2) if v is not None else None
              for v in nomads_gfs.sample(fields["v10"], pts, NATIVE_RES)]
        wok = sum(1 for a, b in zip(wu, wv) if a is not None and b is not None)
        if wok >= len(wu) * MIN_FILL:
            speeds = [math.hypot(a, b) for a, b in zip(wu, wv)
                      if a is not None and b is not None]
            wdoc = dict(common)
            wdoc.update({
                "unit": "m/s",
                "source": "NOAA/NCEP GFS 0.5° (NOMADS)",
                "filled": wok, "failed": len(wu) - wok,
                "max": round(max(speeds), 1) if speeds else None,
                # (2026-09-24 정정) 예전 derivation 은 WIND_DIR_TO_UV(u=-speed*sin(dir), v=-speed*cos(dir))였다.
                #   GFS 는 성분을 그대로 주므로 변환이 없다.
                "derivation": {
                    "method": "GRIB_UV_COMPONENTS",
                    "formula": "u=UGRD 10 m, v=VGRD 10 m (earth-relative)",
                    "inputs": ["UGRD:10 m above ground", "VGRD:10 m above ground"],
                },
                "note": {
                    "ko": f"동아시아 {RES}° 지상 10m 바람 격자입니다. 전지구 격자는 5°"
                          f"(약 555km)라 태풍이 격자 사이로 빠집니다. "
                          f"⚠️ 1°는 약 111km 입니다 — 태풍의 눈벽(약 50km)은 이 자료에도 "
                          f"없습니다. 담기는 것은 폭풍역의 넓이와 세기입니다.",
                },
                "u": wu, "v": wv,
            })
            for k, v in provenance.items():
                if k != "derivation":
                    wdoc[k] = v
    return doc, wdoc, None


def _put(key, doc):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=1800")
    return body


def handler(event=None, context=None):
    fields, run, fh, url = fetch_now()
    doc, wdoc, fail = build(fields, run, fh, url)
    if fail:
        print(f"[pressure] 쓰지 않음 — {fail['reason']} (옛 파일 유지)")
        return fail
    body = _put(DST, doc)
    print(f"[pressure] {doc['nx']}x{doc['ny']} · 채움 {doc['filled']}/{doc['nx'] * doc['ny']} · "
          f"{doc['min']:.1f}~{doc['max']:.1f}hPa · run {doc['modelRun']} f{fh:03d} · {len(body)/1024:.0f}KB")
    wind_written = False
    if wdoc is not None:
        wbody = _put(DST_WIND, wdoc)
        wind_written = True
        print(f"[wind-ea] 채움 {wdoc['filled']} · 최대 {wdoc['max']}m/s · {len(wbody)/1024:.0f}KB")
    else:
        print("[wind-ea] 건너뜀 — 바람 채움 70% 미만 또는 메시지 없음 (옛 파일 유지)")
    return {"ok": True, "nx": doc["nx"], "ny": doc["ny"], "filled": doc["filled"],
            "failed": doc["failed"], "windFilled": (wdoc or {}).get("filled", 0),
            "windWritten": wind_written, "modelRun": doc["modelRun"], "validAt": doc["validAt"]}

"""NOAA GMGSI 전지구 구름 합성본 → 앱이 바로 얹을 수 있는 PNG

왜 만들었나
  정지위성 낱장(GOES-East/West/Himawari)을 앱에서 직접 겹치면
  ① 원반 경계가 직선으로 잘려 보이고 ② GIBS 에 Meteosat 이 없어 유럽·아프리카가 빈다.
  SSEC RealEarth 는 이미 합성된 걸 주지만 워터마크가 찍히고 하루 1,000MP 한도가 있다.
  NOAA GMGSI 는 NOAA 가 직접 합성한 것이고 퍼블릭 도메인이다 —
  워터마크도, 한도도, 라이선스 제약도 없다.

원본
  s3://noaa-gmgsi-pds/GMGSI_LW/YYYY/MM/DD/HH/GLOBCOMPLIR_*.nc   (인증 불필요)
  3000×4999 격자, 위도 ±72.7°, 2.4km/px, 1시간 간격, 자료시각 +약 34분 지연
  data = "0-255 Brightness Temperature" — 값이 클수록 차갑고 = 구름

결과
  s3://<CACHE_BUCKET>/clouds/global.png   LA PNG — L=명암(입체감), A=구름량
  s3://<CACHE_BUCKET>/clouds/meta.json    { time, width, height, north, south }
"""

import json
import os
import re
from datetime import datetime, timedelta, timezone

import boto3
import h5py
import numpy as np
from botocore import UNSIGNED
from botocore.config import Config
from PIL import Image

SRC_BUCKET = "noaa-gmgsi-pds"

# 두 제품을 같이 쓴다. 역할이 다르다.
#   LW(장파적외)  = 구름이 "어디에" 있나. 온도를 재므로 밤에도 보인다. → 알파
#   VIS(가시광)   = 구름이 "어떻게 보이나". 햇빛에 비친 윗면은 밝고 옆면은 그늘져
#                   부피감이 생긴다. 밤에는 깜깜해서 못 쓴다.            → 명암
# 적외만 쓰면 평평한 흰 덩어리가 된다. 리빙어스가 입체적으로 보이는 이유가 가시광이다.
SRC_IR = "GMGSI_LW"
SRC_VIS = "GMGSI_VIS"
DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")

# 출력 가로 픽셀.
# 전지구 화면에서 지구는 폭 1000px 남짓이고 경도 180° 를 보여준다.
# 즉 360° 에 2000px 이면 화면 픽셀과 거의 1:1 이다. 그 이상은 안 보이는 해상도다.
# 실측 용량: 2048→1.2MB / 3072→2.5MB / 4096→4.1MB (회색조 PNG)
OUT_W = 2048

# 공개 버킷이라 서명 없이 읽는다. 서명해서 보내면 403 이 난다.
src = boto3.client("s3", config=Config(signature_version=UNSIGNED))
dst = boto3.client("s3", region_name=DST_REGION)


def latest_key(product):
    """가장 최근 시각의 .nc 키를 찾는다. 지연이 있어 몇 시간 거슬러 올라가며 찾는다."""
    now = datetime.now(timezone.utc)
    for back in range(0, 12):
        t = now - timedelta(hours=back)
        prefix = f"{product}/{t:%Y/%m/%d/%H}/"
        r = src.list_objects_v2(Bucket=SRC_BUCKET, Prefix=prefix)
        keys = [o["Key"] for o in r.get("Contents", []) if o["Key"].endswith(".nc")]
        if keys:
            return sorted(keys)[-1]
    raise RuntimeError(f"{product} 최근 12시간 자료를 못 찾음")


def obs_time(key):
    """파일명에서 관측 시각을 뽑는다: ..._s202607260200000_..."""
    m = re.search(r"_s(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})", key)
    if not m:
        return None
    y, mo, d, h, mi = (int(x) for x in m.groups())
    return f"{y:04d}-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:00Z"


def smooth1d(v, w=41):
    k = np.ones(w) / w
    p = np.pad(v, (w // 2, w // 2), mode="edge")
    return np.convolve(p, k, mode="valid")[: len(v)]


def to_alpha(data):
    """밝기 → 구름 불투명도.

    ⚠️ 전 지구에 하나의 임계를 쓰면 안 된다.
       적외는 "차가우면 밝다"인데 극지 겨울 지표는 구름만큼 차갑다.
       단일 임계로는 남극 쪽이 통째로 하얗게 칠해진다 (실제로 그렇게 나왔다).
    → 위도(행)마다 그 위도의 '맑은 하늘' 기준을 따로 잡는다.
      45 백분위를 맑음, 97 백분위를 짙은 구름으로 보고 그 사이를 부드럽게 잇는다.
      행별로 튀지 않게 위도 방향으로 평활한다.
    """
    lo = smooth1d(np.percentile(data, 45, axis=1))
    hi = smooth1d(np.percentile(data, 97, axis=1))
    hi = np.maximum(hi, lo + 45)          # 대비가 너무 좁아지면 노이즈가 구름이 된다

    t = np.clip((data - lo[:, None]) / (hi - lo)[:, None], 0, 1)
    return t * t * (3 - 2 * t)            # smoothstep — 가장자리를 부드럽게


def sun_cos(lat, lon, when):
    """각 지점의 태양 고도 cos(천정각). 1 = 머리 위, 0 이하 = 밤.

    가시광은 태양이 비스듬할수록 어둡게 찍힌다. 그 조명 차이를 나눠서 걷어내야
    구름 고유의 밝기(반사율)만 남는다. 안 그러면 아침·저녁 지역이 통째로 어둡다.
    """
    doy = when.timetuple().tm_yday
    hh = when.hour + when.minute / 60.0
    decl = np.radians(-23.44 * np.cos(np.radians(360 / 365 * (doy + 10))))
    ha = np.radians((hh - 12) * 15 + lon)
    latr = np.radians(lat)
    cosz = np.sin(latr) * np.sin(decl) + np.cos(latr) * np.cos(decl) * np.cos(ha)
    return cosz, ha


def luminance(alpha, vis, cosz, ha):
    """구름 명암 — 이게 입체감을 만든다.

    ① 가시광 반사율을 구름 픽셀 분포에 맞춰 늘린다.
       그냥 0~255 로 정규화하면 대부분 최대값에 몰려 평평해진다 (실제로 그랬다).
    ② 알파의 기울기로 능선 음영을 얹는다. 태양이 있는 쪽 사면은 밝고 반대는 어둡다.
    ③ 밤은 가시광이 없으므로 거의 흰색으로 두되 ② 만 약하게 남긴다.
    """
    cloud = alpha > 0.25
    day = np.clip((cosz - 0.02) / 0.25, 0, 1)          # 여명대에서 부드럽게 전환

    refl = vis / np.maximum(cosz, 0.15)                 # 조명 정규화
    lit = cloud & (day > 0.5)
    if lit.any():
        lo, hi = np.percentile(refl[lit], [12, 88])
    else:
        lo, hi = 0.0, 255.0
    if hi - lo < 1:
        hi = lo + 1
    tex = 0.45 + 0.55 * np.clip((refl - lo) / (hi - lo), 0, 1)

    gy, gx = np.gradient(alpha)
    relief = np.clip((gx * -np.sin(ha) + gy * 0.35) * 6.0, -0.35, 0.35)

    lum_day = np.clip(tex + relief, 0.35, 1.0)
    lum_night = np.clip(0.92 + relief * 0.5, 0.6, 1.0)
    return lum_day * day + lum_night * (1 - day)


def to_equirect(arr, lat_rows):
    """메르카토르 행 간격을 등간격 위도로 다시 샘플링한다.

    ⚠️ 이걸 안 하면 구름이 통째로 적도 쪽으로 밀린다 — 실제로 그랬다.
       GMGSI 는 등간격 격자가 아니라 **메르카토르** 격자다.
       파일의 lat 배열을 재보면 행 간격이 적도 0.0214° → ±72.7° 0.0720° 로
       3.4배 변한다 (= 1/cos(lat), 구면 메르카토르와 0.00003° 이내로 일치).

       그런데 Cesium 의 Rectangle 은 등간격(위도 선형)으로 텍스처를 입힌다.
       그래서 "메르카토르 그림을 등간격이라고 우기며" 붙이면 이렇게 어긋난다:
           실제 45°N 구름 → 화면 34.0°N  (1,218 km)
           실제 37°N 구름 → 화면 26.9°N  (1,124 km)
           실제 30°N 구름 → 화면 21.2°N  (  975 km)
       적도에서만 0 이라 적도 부근만 검증하면 못 잡는다. 실제로 못 잡았다.

       공식을 가정하지 않고 파일이 들고 있는 lat 배열을 그대로 써서 되샘플한다.
       나중에 NOAA 가 격자를 바꿔도 이 코드는 따라간다.
    """
    n = arr.shape[0]
    lat_dst = np.linspace(lat_rows[0], lat_rows[-1], n)
    # lat_rows 는 내림차순 → np.interp 가 요구하는 오름차순으로 뒤집어 넣는다
    idx = np.interp(lat_dst, lat_rows[::-1], np.arange(n)[::-1])
    i0 = np.clip(np.floor(idx).astype(np.int32), 0, n - 2)
    w = (idx - i0).astype(np.float32)[:, None]
    return arr[i0] * (1.0 - w) + arr[i0 + 1] * w


def fade_edges(a, rows, frac=0.04):
    """남북 끝을 서서히 투명하게.

    자료가 ±72.7° 에서 끊긴다. 그대로 두면 지구에 가로선이 그어진 것처럼 보인다.
    """
    n = max(1, int(rows * frac))
    ramp = np.linspace(0, 1, n)
    a[:n] *= ramp[:, None]
    a[-n:] *= ramp[::-1][:, None]
    return a


def handler(event, context):
    ir_key = latest_key(SRC_IR)
    obs = obs_time(ir_key)
    # 가시광은 같은 시각 것을 쓴다. 없으면 명암 없이 적외만으로 간다.
    try:
        vis_key = latest_key(SRC_VIS)
        if obs_time(vis_key) != obs:
            vis_key = None
    except Exception:
        vis_key = None
    print(f"[src] IR={ir_key}  VIS={vis_key}  관측 {obs}")

    src.download_file(SRC_BUCKET, ir_key, "/tmp/ir.nc")
    with h5py.File("/tmp/ir.nc", "r") as f:
        ir = f["data"][0].astype(np.float32)
        lat2d = f["lat"][:]
        lon2d = f["lon"][:]

    north, south = float(np.nanmax(lat2d)), float(np.nanmin(lat2d))
    alpha = to_alpha(ir)

    # 명암 — 가시광이 있으면 입체감을, 없으면 평평한 흰색
    if vis_key:
        src.download_file(SRC_BUCKET, vis_key, "/tmp/vis.nc")
        with h5py.File("/tmp/vis.nc", "r") as f:
            vis = f["data"][0].astype(np.float32)
        when = datetime.strptime(obs, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        cosz, ha = sun_cos(lat2d, lon2d, when)
        lum = luminance(alpha, vis, cosz, ha)
    else:
        print("[warn] 가시광 없음 — 평평한 흰 구름으로 진행")
        lum = np.ones_like(alpha)

    # 목표 크기로 줄인다. 정수배 슬라이싱은 계단이 생기므로 Pillow 로 리샘플한다.
    h, w = alpha.shape
    out_h = max(1, round(OUT_W * h / w))

    def shrink(arr):
        im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
        return np.asarray(im.resize((OUT_W, out_h), Image.LANCZOS)).astype(np.float32) / 255.0

    # 축소한 뒤의 각 행이 어느 위도인지 — 되샘플에 필요하다.
    # Pillow 는 행 번호 기준으로 균등하게 줄이므로 위도는 여전히 메르카토르 간격이다.
    src_rows = (np.arange(out_h) + 0.5) * h / out_h - 0.5
    lat_small = np.interp(src_rows, np.arange(h), lat2d[:, 0])

    # ⚠️ 순서가 중요하다: 되샘플 → 가장자리 페이드.
    #    반대로 하면 페이드 띠가 엉뚱한 위도로 옮겨간다.
    a_small = fade_edges(to_equirect(shrink(alpha), lat_small), out_h)
    l_small = to_equirect(shrink(lum), lat_small)

    """LA(회색+알파) 로 저장한다.
       L = 명암(구름이 어떻게 보이나), A = 구름량(어디에 있나).
       RGBA 는 R·G·B 가 같은 값이라 낭비다. LA 면 채널이 2개다.
       앱은 RGB=L, 알파=A 로 풀어 얹는다 (imagery.js 참고)."""
    la = np.empty((out_h, OUT_W, 2), np.uint8)
    la[..., 0] = (l_small * 255).astype(np.uint8)
    la[..., 1] = (a_small * 255).astype(np.uint8)

    png = "/tmp/global.png"
    Image.fromarray(la, mode="LA").save(png, optimize=True)
    size = os.path.getsize(png)
    print(f"[out] {OUT_W}x{out_h}  {size/1e6:.2f}MB  위도 {south:.2f}~{north:.2f}")

    dst.put_object(
        Bucket=DST_BUCKET, Key="clouds/global.png",
        Body=open(png, "rb").read(),
        ContentType="image/png",
        # 자료가 1시간 간격이라 30분 캐시. 그 사이엔 어차피 같은 그림이다.
        CacheControl="public, max-age=1800",
    )
    meta = {
        "time": obs, "source": ir_key, "shading": bool(vis_key),
        "width": OUT_W, "height": out_h,
        "north": north, "south": south,
        "credit": "NOAA NESDIS GMGSI",
        "format": "la8",   # L=명암, A=구름량
    }
    dst.put_object(
        Bucket=DST_BUCKET, Key="clouds/meta.json",
        Body=json.dumps(meta).encode(),
        ContentType="application/json",
        CacheControl="public, max-age=300",
    )
    return {"ok": True, **meta, "bytes": size}

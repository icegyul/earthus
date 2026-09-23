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
  (2026-09-23 추가) 같은 LA 그림의 WebP 변형 두 장 — PNG 는 그대로 두고 **더** 올린다.
  s3://<CACHE_BUCKET>/clouds/global.webp        3072 폭 · 명암 손실(q80) · 알파 무손실
  s3://<CACHE_BUCKET>/clouds/global-2048.webp   2048 폭(폰) · 같은 설정
  meta.json 의 variants 에 이름·바이트·sha256 을 적는다. **variants 에 없으면 앱은 PNG 를 쓴다.**
  근거·클라이언트 전환 계획: docs/CLOUD-WEBP-PLAN-2026-09-23.md
"""

import hashlib
import io
import json
import os
import re
import time
import warnings
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
# 받은 지적: "NOAA 위성 구름이 너무 해상도가 떨어져".
# Retina 2x에서 지구 폭이 1,600px까지 올라가면 보이는 반구 180°에 약 3,200px가
# 필요하다. 2048은 1x 화면에는 충분했지만 2x에서는 확대되어 결이 깨졌다.
# 원본 가로 4,999px를 넘겨 가짜 화소를 만들지 않고, 통신비와 디테일의 균형인
# 3,072px로 올린다. 실측 예상 PNG 약 2.5MB이며 시간당 1회 갱신이다.
# (2026-09-23 정정) 실제 PNG 는 약 2.5MB 가 아니라 5.4~5.5MB 다 — S3 head-object 5,381,747 B,
#   같은 날 13:00Z 판 5,477,495 B(earthus.net 에서 받아 잰 값). 명암(L) 채널이 들어가며 커졌다.
#   이 크기가 v1·v2 첫 화면에서 가장 큰 파일이라 아래 WebP 변형(WEBP_*)을 함께 만든다.
OUT_W = 3072

# ── WebP 변형 (2026-09-23 추가 — docs/PERF-LTE-PLAN-2026-09-23.md V1-6·V1-6b·V2-3) ──
# PNG 는 한 바이트도 바꾸지 않고 그대로 올린다. 변형은 **더** 올릴 뿐이고, 앱은 meta.json 의
# variants 에 적힌 것만 쓴다. 인코딩·검증·업로드 중 **예외**가 나도 PNG 경로는 그대로 간다.
# ⚠️ 단 메모리 초과(OOM)·제한시간 초과는 예외가 아니라 프로세스가 죽는 것이라, 인코딩이 PNG 업로드 앞에 있으므로
#    그 시각은 PNG·meta 도 나가지 않는다. 배포 전 REPORT 기준선 확인이 조건이다(docs/CLOUD-WEBP-PLAN-2026-09-23.md §5).
#
# ⚠️ 알파는 반드시 무손실(alpha_quality=100)이다. 알파가 '구름이 어디 있나'다.
#    imagery.js 의 "0은 계속 0, 1은 계속 1" 규칙 — 투명(자료 없음·맑음) 화소가 조금이라도
#    불투명해지면 없는 구름을 그리는 것이다. AVIF 는 그래서 탈락했다(투명 화소의 5.4~10.2 % 가 0 이 아니게 변함).
#    올리기 전에 되풀어서 알파가 입력과 **한 값도 다르지 않은지** 확인하고, 다르면 그 변형은 올리지 않는다.
# ⚠️ 명암(L)만 손실(q80)이다. v1 은 L 을 90~255 로 눌러 쓰고(imagery.js CLOUD_LUMA_LUT),
#    v2 관측 모드는 L 을 사실상 쓰지 않는다(tint = rgb/max → 흰색). 알파 0 아래의 L 은
#    두 앱 모두 캔버스(premultiplied)를 거치며 이미 0 이 되므로 exact=False(libwebp 가 그 자리 RGB 를 정리)로 둔다.
# ⚠️ method 는 3 이다. 4 이상이면 libwebp 가 알파 무손실 압축에 'TraceBackwards' 를 켜서
#    (알파 내부 품질 8×method ≥ 25) 3072 한 장이 3.4초 → 23.6초로 늘고 크기는 7 KB 커졌다
#    (2026-09-23 로컬 실측, Pillow 12.3.0 · libwebp 1.6.0: m3 3,037,640 B / m4 3,044,886 B / m6 2,981,602 B·173초).
# ⚠️ 2048 판은 **최종 LA(uint8)** 를 채널별로 줄여 만든다(원본 float 에서 다시 만들지 않는다).
#    그래야 로컬 시험(aws/gmgsi-clouds/tests)이 운영 global.png 한 장으로 Lambda 와 같은 바이트를 재현한다.
#    handler.py:44-51 "2048은 Retina 에서 결이 깨졌다"는 데스크톱 이야기다 — 2048 은 폰 전용이고
#    쓸지 말지는 PD 가 비교판(build/ux-mockups)을 보고 정한다.
WEBP_QUALITY = 80
WEBP_ALPHA_QUALITY = 100      # 100 = 알파 무손실. 낮추지 말 것(위 ⚠️).
WEBP_METHOD = 3
PHONE_W = 2048
# PNG 와 같은 캐시 — 자료가 1시간 간격이고, 같은 시각의 PNG 와 WebP 는 같은 그림이다.
CLOUD_CACHE_CONTROL = "public, max-age=1800"

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


# ⚠️⚠️ **자료 없음은 255 로 온다. _FillValue(-9999) 가 아니다.**
#    GMGSI 는 여러 정지위성을 이어 붙인 합성본이라 위성이 못 보는 자리가 남는다.
#    NOAA 는 그 자리를 파일 속성의 _FillValue 가 아니라 밝기 최댓값 255 로 채운다.
#    이 격자는 "값이 클수록 차갑고 = 구름" 이므로, 그대로 먹이면
#    **없는 자료가 가장 두꺼운 구름**이 된다.
#    2026-09-07 14:00Z 실측 — 실제 자료 최댓값은 231 이고 232~254 는 단 한 화소도
#    없는데 255 만 105,341 화소(0.70%)다. 즉 255 는 밝기가 아니라 '없음' 표시다.
#    이걸 구름으로 읽어서 93.6~108.9°E 중국 상공에 통짜 회색 쐐기가 그려졌다
#    (알파 255 · 밝기 234 고정 · 132px 구간 표준편차 0.0 — 구름이면 있을 수 없는 값).
GAP = 254.0


def _fill_gaps_1d(v):
    """행 통계가 NaN 이면 이웃 행에서 잇는다.
    ⚠️ smooth1d 는 컨볼루션이라 NaN 하나가 좌우 20행을 함께 NaN 으로 만든다."""
    idx = np.arange(len(v))
    good = np.isfinite(v)
    if not good.any():
        return np.zeros_like(v)
    return np.interp(idx, idx[good], v[good])


def to_alpha(data):
    """밝기 → 구름 불투명도.

    ⚠️ 전 지구에 하나의 임계를 쓰면 안 된다.
       적외는 "차가우면 밝다"인데 극지 겨울 지표는 구름만큼 차갑다.
       단일 임계로는 남극 쪽이 통째로 하얗게 칠해진다 (실제로 그렇게 나왔다).
    → 위도(행)마다 그 위도의 '맑은 하늘' 기준을 따로 잡는다.
      45 백분위를 맑음, 97 백분위를 짙은 구름으로 보고 그 사이를 부드럽게 잇는다.
      행별로 튀지 않게 위도 방향으로 평활한다.

    ⚠️ 자료가 없는 칸(255)은 백분위 계산에서도 빼야 한다. 넣어 두면 그 행의
       97 백분위가 255 쪽으로 끌려가 **주변 진짜 구름까지 옅어진다.**
    """
    gap = data >= GAP
    clean = np.where(gap, np.nan, data)

    lo = smooth1d(_fill_gaps_1d(np.nanpercentile(clean, 45, axis=1)))
    hi = smooth1d(_fill_gaps_1d(np.nanpercentile(clean, 97, axis=1)))
    hi = np.maximum(hi, lo + 45)          # 대비가 너무 좁아지면 노이즈가 구름이 된다

    t = np.clip((clean - lo[:, None]) / (hi - lo)[:, None], 0, 1)
    alpha = t * t * (3 - 2 * t)           # smoothstep — 가장자리를 부드럽게
    # 자료가 없는 자리는 **투명**하다. "구름이 없다"가 아니라 "모른다"는 뜻이고,
    # 우리가 아는 척하지 않는 쪽이 맞다. 바탕 지도가 그대로 비친다.
    return np.where(gap, 0.0, alpha)


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


def _shrink_la(la, out_w):
    """LA uint8 → 가로 out_w. 채널마다 따로 LANCZOS 로 줄인다.

    ⚠️ Pillow 의 LA.resize 는 알파를 곱한(La) 뒤 줄이고 되나눠서, 알파가 낮은 곳의 L 이
       반올림으로 뭉개진다. 서버의 shrink() 도 채널을 따로 줄이므로 같은 방식으로 한다.
    ⚠️ LANCZOS 는 음의 꼬리가 있어 0 과 구름 경계 옆에 음수가 생기지만 Pillow 가 0 으로 자른다.
       '줄이기 전 주변이 전부 0 인 화소는 줄인 뒤에도 0' 은 tests/check_real_png.py 가 실측으로 확인한다."""
    h, w = la.shape[:2]
    out_h = max(1, round(out_w * h / w))
    out = np.empty((out_h, out_w, 2), np.uint8)
    for c in range(2):
        im = Image.fromarray(np.ascontiguousarray(la[..., c]), mode="L")
        out[..., c] = np.asarray(im.resize((out_w, out_h), Image.LANCZOS))
    return out


def _webp_bytes(la):
    """LA uint8 → WebP 바이트. 명암 손실 q80, 알파 무손실(위 WEBP_* 참고)."""
    buf = io.BytesIO()
    Image.fromarray(la, mode="LA").save(
        buf, format="WEBP", lossless=False,
        quality=WEBP_QUALITY, alpha_quality=WEBP_ALPHA_QUALITY,
        method=WEBP_METHOD, exact=False,
    )
    return buf.getvalue()


def encode_variants(la):
    """최종 LA(uint8, H×W×2) 한 장으로 WebP 변형 두 장을 만든다. S3·환경변수에 손대지 않는다.

    반환: [{name, key, body, width, height, bytes, sha256, encodeMs, alphaExact}, ...]
    **알파가 입력과 한 값이라도 다른 변형은 빼고 돌려준다**(로그만 남긴다) — 올리지 않는다.
    tests/check_real_png.py 와 tests/test_webp_variants.py 가 이 함수를 그대로 부른다."""
    plans = [("webp", "clouds/global.webp", la)]
    # 폰 판은 **줄일 때만** 만든다. 늘려서 만든 화소는 가짜 화소다(위 OUT_W 주석의 원칙).
    if la.shape[1] > PHONE_W:
        plans.append(("webp2048", "clouds/global-2048.webp", _shrink_la(la, PHONE_W)))
    out = []
    for name, key, src_la in plans:
        t0 = time.perf_counter()
        body = _webp_bytes(src_la)
        enc_ms = round((time.perf_counter() - t0) * 1000)
        # 되풀어서 알파를 비교한다. 브라우저도 같은 libwebp 로 푼다 — 알파는 무손실이라 그대로 나온다.
        with Image.open(io.BytesIO(body)) as im:
            im.load()
            back = np.asarray(im.convert("RGBA"))
        alpha_exact = (back.shape[:2] == src_la.shape[:2]
                       and bool(np.array_equal(back[..., 3], src_la[..., 1])))
        h, w = src_la.shape[:2]
        print(f"[webp] {key} {w}x{h} {len(body)/1e6:.2f}MB {enc_ms}ms 알파일치={alpha_exact}")
        if not alpha_exact:
            print(f"[warn] {key} 알파가 입력과 다르다 — 이 변형은 올리지 않는다(앱은 PNG 를 쓴다)")
            continue
        out.append({
            "name": name, "key": key, "body": body,
            "width": w, "height": h, "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "encodeMs": enc_ms, "alphaExact": True,
        })
    return out


def upload_variants(client, bucket, variants):
    """변형을 올리고 meta.json 의 variants 필드를 돌려준다. 하나라도 실패하면 예외 — 호출한 쪽이 통째로 뺀다."""
    listed = {}
    for v in variants:
        client.put_object(
            Bucket=bucket, Key=v["key"], Body=v["body"],
            ContentType="image/webp",
            CacheControl=CLOUD_CACHE_CONTROL,
        )
        listed[v["name"]] = {
            "key": v["key"], "type": "image/webp",
            "width": v["width"], "height": v["height"],
            "bytes": v["bytes"], "sha256": v["sha256"],
            "quality": WEBP_QUALITY, "alpha": "lossless",
        }
    return listed


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
    gap_px = int((ir >= GAP).sum())
    print(f"[gap] 자료 없음(255) {gap_px} 화소 = {gap_px / ir.size * 100:.2f}% — 투명 처리")
    with warnings.catch_warnings():          # 행 전체가 빈 경우의 All-NaN 경고
        warnings.simplefilter("ignore", RuntimeWarning)
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

    # (2026-09-23 추가) WebP 변형은 PNG 를 올리기 **전에** 만든다 — 인코딩(수 초)이
    # 'PNG 는 새것 · meta.json 은 옛것' 사이에 끼면 그 틈이 길어진다. 예외가 나도 PNG 는 그대로 간다(OOM·시간 초과는 위 WEBP_* ⚠️).
    # (2026-09-23 정정) 순서를 뒤집었다: **PNG·meta 를 먼저 올리고** 그다음 변형을 만든다.
    #   배포 전 기준선(CloudWatch REPORT 24회)이 Max Memory Used 1,878 MB / 한도 2,048 MB 였다 — 인코딩 +225 MB 면 한도를 넘어
    #   프로세스가 죽을 수 있고, 위 순서였다면 그 시각 PNG·meta 까지 못 나갔다. 이제 죽어도 잃는 것은 이번 시각의 변형뿐이다
    #   (meta 에 variants 가 없으면 앱은 PNG 를 쓴다). 'PNG 는 새것·meta 는 옛것' 틈은 예전과 같은 길이로 돌아온다.
    #   메모리 자체도 memory-mb.txt(3008)로 올렸다(deploy-python.sh).
    # 원본 크기(3000×4999) 배열은 여기서부터 쓰지 않는다. libwebp 가 인코딩 동안 약 225MB 를 더 잡으므로
    # (로컬 실측, 프로세스 최고 작업 집합 증가분) 먼저 놓아 준다 — 다른 함수의 OOM 전례가 있다.
    alpha = lum = ir = lat2d = lon2d = a_small = l_small = None
    vis = cosz = ha = None

    png_body = open(png, "rb").read()
    dst.put_object(
        Bucket=DST_BUCKET, Key="clouds/global.png",
        Body=png_body,
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
    # (2026-09-23 추가) 덧붙이기만 한다 — 기존 키는 그대로라 옛 앱(v1 imagery.js · v2 main.js)은 모른 척 지나간다.
    meta["png"] = {"key": "clouds/global.png", "bytes": size,
                   "sha256": hashlib.sha256(png_body).hexdigest()}

    def put_meta(m):
        dst.put_object(
            Bucket=DST_BUCKET, Key="clouds/meta.json",
            Body=json.dumps(m).encode(),
            ContentType="application/json",
            CacheControl="public, max-age=300",
        )

    put_meta(meta)   # ① 변형 없이 — 여기까지가 예전과 같은 결과다

    # ② 변형. 하나라도 실패하면 variants 를 통째로 뺀다 —
    # meta.json 에 적힌 변형 = 이번 시각에 실제로 올라간 변형. 앱은 적힌 것만 쓴다.
    variants = []
    try:
        variants = encode_variants(la)
    except Exception as e:   # noqa: BLE001 — 어떤 실패든 PNG 경로를 막지 않는다(PNG·meta 는 이미 나갔다)
        print(f"[warn] WebP 변형 인코딩 실패 — PNG 만 쓴다: {e!r}")
    listed = {}
    if variants:
        try:
            listed = upload_variants(dst, DST_BUCKET, variants)
        except Exception as e:   # noqa: BLE001
            print(f"[warn] WebP 변형 업로드 실패 — meta 에 적지 않는다(앱은 PNG): {e!r}")
            listed = {}
    if listed:
        meta["variants"] = listed
        put_meta(meta)   # ③ 변형이 실제로 올라간 뒤에만 적는다
    return {"ok": True, **meta, "bytes": size}

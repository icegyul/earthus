# -*- coding: utf-8 -*-
"""천리안2A(GK-2A) 한반도 영상 → 앱이 바로 얹는 PNG

왜 만들었나
  지금 동아시아 구름은 NASA GIBS 를 거친 히마와리 가시광이다. 두 가지가 아쉽다.
    ① **밤에 빈 화면이다.** 가시광이라 그렇고, 그래서 "왜 안 보이는지" 안내문까지 붙여 놨다.
    ② 갱신이 10분인데 그 위에 GIBS 지연이 또 얹힌다.
  천리안2A 는 한반도만 잘라서 **2km · 2.5분**으로 준다. 우리 위성이고,
  NOAA 가 AWS 에 공개해 둔 것이라 인증도 한도도 워터마크도 없다.

원본
  s3://noaa-gk2a-pds/AMI/L1B/LA/YYYYMM/DD/HH/gk2a_ami_le1b_{ch}_la020ge_YYYYMMDDHHMM.nc
  500×500 · 2km · 2.5분 간격 · 실측 지연 약 13분 · 인증 불필요

결과
  s3://<CACHE_BUCKET>/clouds/gk2a/ir112.png   구름 (밤에도)
  s3://<CACHE_BUCKET>/clouds/gk2a/vi006.png   구름 (낮에 더 선명)
  s3://<CACHE_BUCKET>/clouds/gk2a/wv063.png   상층 수증기
  s3://<CACHE_BUCKET>/clouds/gk2a/meta.json   { time, bbox, channels{...} }

⚠️⚠️ **clouds/ 아래에 둔 이유** — 버킷의 공개 접두사가 고정이다
   (app· clouds· wind· events· ocean· solar· celestrak 일곱 개뿐).
   gk2a/ 로 올리면 파일은 멀쩡히 올라가는데 **읽을 때 403** 이 난다.
   대기질을 air/ 가 아니라 wind/ 아래 둔 것과 같은 이유다 — 그때도 똑같이 겪었다.

⚠️⚠️ 조용히 틀리는 것 넷 — 전부 실제로 밟아 봤다 (aws/gk2a-clouds/FINDINGS.md)
  ① y 축 부호가 CGMS 표준과 **반대**다  → 안 뒤집으면 오류도 없이 **빈 그림**
  ② DN_to_Radiance_Gain 이 **음수**다   → 뒤집으면 한낮 육지가 구름처럼 하얘진다
  ③ 복사휘도가 **파수(cm⁻¹)** 기준이다  → 파장식 쓰면 437°C 가 나온다
  ④ 16비트 중 **유효 13비트**다         → 안 떼면 불량 화소가 흰 점으로 박힌다
"""

import io
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

SRC_BUCKET = "noaa-gk2a-pds"
DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")

# ⚠️ 원본 버킷은 **서명 없이** 읽는다. 우리 자격증명을 붙이면 오히려 403 이 난다.
src = boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))
dst = boto3.client("s3", region_name=DST_REGION)

# ── 채널마다 **다른 영역·다른 격자** ─────────────────────────────
#  받은 지적: "범위도 작고" · "천리안은 안보여"
#
#  ⚠️⚠️ 처음엔 셋 다 한반도(LA) · 한 격자(1100×1150)로 뽑았다. 둘 다 틀렸다.
#     ① 범위 — LA 는 한반도만 덮는다. 지구본에서 우표만 하다.
#        적외·수증기는 **전면(FD)** 이 있고 36MB · 12초면 처리된다(실측).
#     ② 해상도 — 가시광 0.64㎛ 원본이 **0.5km** 인데 출력이 0.92~1.16km 였다.
#        **가장 자세한 채널의 자세함을 절반 넘게 버리고 있었다.**
#        → 가시광만 한반도에 딱 맞춰 0.5km 로 뽑는다.
#
#  area: 'FD' 전면 5500×5500(2km) | 'LA' 한반도 2000×2000(0.5km) 또는 500×500(2km)
AREAS = {
    # 전면 — 히마와리와 비슷한 범위. ⚠️ 격자를 더 키우면 PNG 가 8MB 를 넘는다(실측).
    "FD": {"lat": (-60.0, 60.0), "lon": (70.0, 190.0), "w": 1600, "h": 1600},
    # 한반도 — 가시광 0.5km 를 살리는 크기. 8°×8° 를 1780 화소면 약 0.5km/화소.
    "LA": {"lat": (32.0, 40.0), "lon": (123.5, 131.5), "w": 1780, "h": 1780},
}

# ── 채널 ────────────────────────────────────────────────────────
#  kind: 'ir'  적외/수증기 — 밝기온도로 바꿔 **차가울수록 하얗게**
#        'vis' 가시광     — 반사도 그대로 (낮에만 의미 있음)
#  res:  파일 이름에 박히는 해상도 꼬리.
#        ⚠️⚠️ **채널마다 다르다.** 적외·수증기는 2km(020ge)인데
#           가시광 0.64㎛ 는 0.5km(005ge), 나머지 가시광은 1km(010ge)다.
#           전부 020ge 로 찾으면 **가시광만 "파일이 없습니다"** 가 되는데,
#           목록에는 멀쩡히 있어서 원인을 찾기 어렵다 (실제로 겪었다).
#  gamma: 알파 곡선. ⚠️ 1 보다 작으면 **낮은(따뜻한) 구름 쪽이 살아난다.**
#        실측(강릉): 낮은 구름 꼭대기 21.6°C, 바다 25°C — 3°C 차이다.
#        선형으로 두면 alpha 0.14 라 사실상 안 보인다. 0.55 로 끌어올린다.
#        ⚠️ 그래도 완전히는 안 갈린다. 적외 11.2㎛ 자체의 한계다 —
#           화면(ui-source)에 그렇게 적어 두었다.
CHANNELS = {
    # rowbase — 위도줄마다 맑은 하늘을 재서 그보다 몇 도 찬지로 구름을 정한다.
    # dLo/dHi: 지표보다 이만큼 차면 보이기 시작 / 이만큼이면 완전히 덮는다 (°C)
    #  ⚠️⚠️ dLo 를 정할 때 **낮은 구름을 살리려다 지구를 덮을 뻔했다.**
    #     3°C 로 두면(강릉 낮은 구름이 바다보다 3.4°C 찼으니) 살긴 사는데,
    #     **면적의 52%가 40% 이상 불투명**해진다. 지금 쓰는 GMGSI 는 19% 다 —
    #     2.7배다. 지구본에 안개가 낀 것처럼 된다.
    #     → 10°C 로 올렸다(26%). 이 정도가 물리적으로도 "진짜 구름"이다.
    #  ⚠️ 그 대가로 **낮은 구름은 안 보인다.** 감추지 않고 화면(ui-source)에 적었고,
    #     낮에는 가시광 채널이 그 일을 한다. 적외 하나로는 원리상 안 되는 일이다.
    "ir112": {"kind": "ir", "area": "FD", "res": "020ge", "rowbase": True,
              "hot": 30.0, "cold": -75.0, "dLo": 10.0, "dHi": 55.0, "gamma": 1.1,
              "ko": "구름 (밤에도)"},
    # ⚠️ 수증기는 **구름 그림이 아니다.** 지표가 안 보이는 채널이라 rowbase 를 쓰지 않고
    #    통째로 덮는 게 맞다 — 원래 그렇게 보는 자료다.
    "wv063": {"kind": "ir", "area": "FD", "res": "020ge",
              "hot": -25.0, "cold": -62.0, "floor": 0.0, "gamma": 1.0,
              "ko": "상층 수증기"},
    # ⚠️ 한반도만 보는 영역이라 태양 보정이 필요 없다(범위 안에서 각도 차이가 작다).
    #    다만 밝기 기준은 전면과 **같은 반사도**를 쓴다 — 두 레이어를 번갈아 볼 때
    #    같은 구름이 다른 밝기로 나오면 어느 쪽이 맞는지 알 수 없게 된다.
    "vi006": {"kind": "vis", "area": "LA", "res": "005ge",
              "floor": 0.18, "hi": 0.65, "gamma": 0.8, "ko": "구름 (낮)"},

    # ⚠️⚠️⚠️ **"천리안은 구름이 안 보인다"의 진짜 원인이 여기 있었다.**
    #   받은 지적: "일본꺼는 잘 표현되는데 천리안은 안보여" (같은 시각 15분 차)
    #   원자료로 직접 재 보니(2026-08-04 10:40 KST, 서울·경기 2,500화소):
    #       구름 꼭대기 온도  19.3 ~ 25.7°C   맑은하늘 기준 24.2°C
    #       기준보다 10°C 이상 찬 화소 = **0.0%**   (5°C 이상도 0.0%)
    #   즉 그날 서울 위 구름은 **꼭대기가 지표보다 5°C도 안 찼다** — 아주 낮은 구름이다.
    #   적외는 온도로 구름을 찾으므로 **원리상 이 구름을 못 본다.** 위성 성능 차이가
    #   아니라 **채널 차이**였다. 화면의 히마와리 레이어는 가시광(햇빛 반사)이라 다 보인다.
    #   ⚠️ 문턱(dLo)을 낮춰서 풀 문제가 아니다. 2°C 까지 내려야 서울이 보이기 시작하는데,
    #      그러면 전지구가 잡음으로 덮인다(3°C 에서 이미 화면의 52%).
    #   → **같은 위성의 가시광을 전면(FD)으로** 쓴다. 낮에는 이게 답이다.
    #
    # ⚠️ vi006 은 전면(FD)에 **005ge(0.5km) 하나뿐**이고 파일이 480MB 다.
    #    통째로 float 로 올리면 22000² × 8바이트 = 3.9GB — Lambda 가 죽는다.
    #    → stride 로 **띄엄띄엄 읽는다**(아래 render 참고). 우리 FD 출력이
    #      1600px/120° = 약 8km/px 라 2km 원본이면 충분하고도 남는다.
    # ⚠️ vi008(1km, 138MB)이 더 가볍지만 쓰지 않는다 — 0.86㎛ 는 **식생이 밝게** 나와
    #    숲과 구름이 섞인다. 0.64㎛(vi006)는 식생이 어두워 구름만 하얗게 남는다.
    "vi006fd": {"ch": "vi006", "kind": "vis", "area": "FD", "res": "005ge",
                "stride": 8, "solar": True,
                # ⚠️ 반사도(0~1) 기준이다. 실측으로 정했다 — 지표 0.07 / 구름 0.37~1.15.
                "floor": 0.18, "hi": 0.65, "gamma": 0.9, "ko": "구름 (낮 · 전지구)"},
}

# 플랑크 상수 (파수 기준) ⚠️ 파장 기준 값과 섞으면 안 된다
C1, C2 = 1.191042e-5, 1.4387752      # mW/(m²·sr·cm⁻⁴), cm·K

# 지구·궤도
REQ, RPOL, ALT = 6378.137, 6356.7523, 42164.0


def _attr(f, k):
    """h5py 속성 — 스칼라/배열/바이트가 섞여 나온다"""
    v = f.attrs[k]
    if isinstance(v, bytes):
        return v.decode("utf-8", "replace")
    if isinstance(v, np.ndarray):
        return v.item() if v.size == 1 else v
    return v


def latest_key(ch, now=None):
    """가장 최근 파일 하나를 찾는다.
    ⚠️ 목록을 통째로 뒤지지 않는다. 시각을 알고 있으니 **최근 시간대부터** 좁혀 본다."""
    now = now or datetime.now(timezone.utc)
    cfg = CHANNELS[ch]
    area = cfg["area"]                              # 'FD' 전면 | 'LA' 한반도
    # ⚠️ 꼬리는 영역+해상도다: fd020ge / la005ge …
    tail = f"{area.lower()}{cfg['res']}"
    # ⚠️ 레이어 id 와 채널명이 다를 수 있다 (vi006fd → vi006).
    #    id 로 파일을 찾으면 "파일이 없습니다"만 나오고 원인을 못 찾는다.
    real = cfg.get("ch", ch)
    for back_h in range(0, 4):                     # 최대 4시간 전까지
        t = now - timedelta(hours=back_h)
        prefix = f"AMI/L1B/{area}/{t:%Y%m}/{t:%d}/{t:%H}/gk2a_ami_le1b_{real}_{tail}_"
        r = src.list_objects_v2(Bucket=SRC_BUCKET, Prefix=prefix)
        keys = sorted(o["Key"] for o in r.get("Contents", []))
        if keys:
            return keys[-1]
    return None


def _cos_sza(lat, lon, when):
    """태양 고도의 코사인 (0=지평선, 1=머리 위).

    ⚠️⚠️ **왜 필요한가 — 전면 가시광에서 한국 구름이 사라진 이유가 이것이다.**
      가시광은 "햇빛을 얼마나 되쏘았나"인데, 같은 구름이라도 **해가 비스듬히 드는
      곳은 어둡게** 들어온다. 그런데 밝기를 화면 전체의 99백분위 하나로 나누면,
      태양 바로 아래(가장 밝은 곳)가 기준이 되어 비껴 있는 곳은 통째로 문턱 아래로
      떨어진다.
      실측(2026-08-04 01:46 UTC): 태양이 153°E 위에 있었고, 한국(127°E)은
      26° 비껴 있어 서울·경기 알파가 평균 7.8/255 였다 — 구름이 있는데 안 보였다.
      → 되쏜 양을 **해가 든 각도로 나눠** 각도 차이를 지운다. 그러면 어디서든
        같은 구름이 같은 밝기가 된다. (위성 기관이 '반사도'를 낼 때 하는 그 계산이다)

    ⚠️ 정밀 천문 계산이 아니라 Spencer 근사다. 오차 0.5° 안쪽이라 밝기 보정에는 충분하다.
       ⚠️ 일식·월식 같은 걸 여기서 계산하지 않는다 — 그건 다른 화면이 한다.
    """
    doy = when.timetuple().tm_yday
    hh = when.hour + when.minute / 60.0
    g = 2 * np.pi * (doy - 1 + (hh - 12) / 24) / 365.0
    # 태양 적위 (Spencer 1971)
    decl = (0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g)
            - 0.006758 * np.cos(2 * g) + 0.000907 * np.sin(2 * g)
            - 0.002697 * np.cos(3 * g) + 0.001480 * np.sin(3 * g))
    # 균시차 (분)
    eq = 229.18 * (0.000075 + 0.001868 * np.cos(g) - 0.032077 * np.sin(g)
                   - 0.014615 * np.cos(2 * g) - 0.040849 * np.sin(2 * g))
    # 시간각 — ⚠️ 경도는 동경이 +. 부호를 틀리면 낮과 밤이 뒤집힌다.
    ha = np.radians((hh * 60 + eq + 4 * lon) / 4.0 - 180.0)
    la = np.radians(lat)
    return np.sin(la) * np.sin(decl) + np.cos(la) * np.cos(decl) * np.cos(ha)


def _geos_index(sub, ulx, uly, dx, dy, nx, ny, box):
    """등경위도 격자의 각 칸이 원본의 몇 번 화소인가 (CGMS 정지위성 변환)"""
    (LAT0, LAT1), (LON0, LON1) = box["lat"], box["lon"]
    W, H = box["w"], box["h"]
    lon = np.linspace(LON0, LON1, W, dtype=np.float32)[None, :]
    lat = np.linspace(LAT1, LAT0, H, dtype=np.float32)[:, None]
    la, lo = np.radians(lat), np.radians(lon)
    cl = np.arctan(0.993243 * np.tan(la))                       # 지심위도
    rl = RPOL / np.sqrt(1 - 0.00669438444 * np.cos(cl) ** 2)
    dl = lo - sub
    r1 = ALT - rl * np.cos(cl) * np.cos(dl)
    r2 = -rl * np.cos(cl) * np.sin(dl)
    r3 = rl * np.sin(cl)
    rn = np.sqrt(r1 ** 2 + r2 ** 2 + r3 ** 2)
    # ⚠️ 지구 뒤편은 안 보인다. 안 보이는 곳을 그리면 **없는 구름이 생긴다.**
    vis = (ALT * (ALT - r1) - r2 ** 2 - (r3 * REQ / RPOL) ** 2) > 0
    xs = np.arctan(-r2 / r1)
    # ⚠️⚠️ GK-2A 는 y 가 **북쪽으로 갈수록 커진다** — CGMS 표준식(-r3/rn)과 부호가 반대다.
    #    파일 모서리로 확인했다: 44.2°N ↔ y=0.117, 31.1°N ↔ y=0.089.
    #    안 뒤집으면 한반도가 통째로 화면 밖이라 **오류 없이 빈 그림**이 나온다.
    ys = np.arcsin(r3 / rn)
    col = (xs - ulx) / dx - 0.5
    row = (ys - uly) / dy - 0.5
    ok = vis & (col >= 0) & (col < nx - 1) & (row >= 0) & (row < ny - 1)
    # ⚠️ 최근접으로 뽑으면 원본보다 촘촘한 격자(가시광 0.5km)에서 계단이 그대로 남는다.
    #    이중선형으로 섞는다 — 없는 정보를 만드는 게 아니라 있는 값을 이어 주는 것이다.
    return col, row, ok


def render(ch, key):
    cfg = CHANNELS[ch]
    # ⚠️ 관측 시각은 **파일 이름**에서 뽑는다(..._202608040146.nc, UTC).
    #    지금 시각(now)을 쓰면 안 된다 — 원자료가 20~30분 늦게 올라오는 날이 있어
    #    태양 위치가 그만큼 어긋나고, 새벽·저녁에 밝기가 통째로 틀어진다.
    m = re.search(r"_(\d{12})\.nc$", key)
    when = (datetime.strptime(m.group(1), "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
            if m else datetime.now(timezone.utc))
    body = src.get_object(Bucket=SRC_BUCKET, Key=key)["Body"].read()
    with h5py.File(io.BytesIO(body), "r") as f:
        st = cfg.get("stride", 1)
        # ⚠️⚠️ 480MB 짜리 0.5km 전면 자료를 통째로 올리면 Lambda 가 메모리로 죽는다.
        #    h5py 의 **띄엄띄엄 읽기**로 필요한 만큼만 가져온다.
        #    stride=8 이면 22000² → 2750² (60MB). 우리 출력이 8km/px 라 2km 면 충분하다.
        #    ⚠️ 격자 간격(dx·dy)도 같이 늘려야 한다. 안 그러면 그림이 8배 어긋난다.
        raw = np.asarray(f["image_pixel_values"][::st, ::st] if st > 1
                         else f["image_pixel_values"])
        # ⚠️⚠️ 16비트 중 **유효 13비트**다. 위 2비트는 품질 플래그다 —
        #    안 떼면 불량 화소가 6만 대 값으로 튀어 흰 점이 박힌다.
        dn = (raw & 0x1FFF).astype(np.float64)
        ny, nx = dn.shape
        sub = float(_attr(f, "sub_longitude"))
        ulx, uly = float(_attr(f, "image_upperleft_x")), float(_attr(f, "image_upperleft_y"))
        lrx, lry = float(_attr(f, "image_lowerright_x")), float(_attr(f, "image_lowerright_y"))
        gain = float(_attr(f, "DN_to_Radiance_Gain"))
        off = float(_attr(f, "DN_to_Radiance_Offset"))
        # ⚠️⚠️ 가시광은 **파일이 주는 공식 계수**로 반사도를 만든다.
        #    예전엔 화면 전체의 99백분위로 나눠 밝기를 정했는데, 그러면
        #    ① 날마다 기준이 달라 어제와 오늘을 비교할 수 없고
        #    ② 화면 안에 아주 밝은 구름이 하나만 있어도 나머지가 통째로 어두워진다.
        #    실측(2026-08-04 11:00 KST): 그 방식으로 **서울 알파가 평균 2.4/255** 였다 —
        #    구름이 있는데 안 보였다. 반사도로 보면 지표 0.07 · 구름 0.37~1.15 로
        #    분명히 갈린다. 물리값이라 문턱을 근거 있게 정할 수 있다.
        # ⚠️ 적외·수증기 채널에는 이 속성이 **없다.** _attr 는 없으면 KeyError 를 낸다 —
        #    그대로 두면 구름(적외) 레이어가 통째로 죽는다.
        alb_c = (float(_attr(f, "Radiance_to_Albedo_c"))
                 if "Radiance_to_Albedo_c" in f.attrs else None)
        lam = float(_attr(f, "channel_center_wavelength"))

    box = AREAS[cfg["area"]]
    W, H = box["w"], box["h"]
    # ⚠️ 띄엄띄엄 읽었으면 화소 하나가 그만큼 넓어진 것이다.
    #    nx·ny 는 이미 줄어든 값이라 (lrx-ulx)/nx 가 자동으로 맞는다 —
    #    여기서 stride 를 또 곱하면 두 번 적용되어 그림이 찌그러진다.
    dx, dy = (lrx - ulx) / nx, (lry - uly) / ny
    col, row, ok = _geos_index(sub, ulx, uly, dx, dy, nx, ny, box)
    c0 = np.clip(np.floor(col), 0, nx - 2).astype(np.int32)
    r0 = np.clip(np.floor(row), 0, ny - 2).astype(np.int32)
    fc = (col - c0).astype(np.float32)
    fr = (row - r0).astype(np.float32)
    def sample(a):
        return (a[r0, c0] * (1 - fc) * (1 - fr) + a[r0, c0 + 1] * fc * (1 - fr)
                + a[r0 + 1, c0] * (1 - fc) * fr + a[r0 + 1, c0 + 1] * fc * fr)

    rad = gain * dn + off      # ⚠️ 적외는 gain 이 **음수**다 = 값이 클수록 차갑다
    if cfg["kind"] == "ir":
        # ⚠️⚠️ 복사휘도가 **파수(cm⁻¹)** 기준이다. 파장(㎛) 식을 쓰면 131~437°C 가 나온다
        #    (실제로 그렇게 나왔고, 물리적으로 불가능해서 바로 걸렸다).
        nu = 1e4 / lam
        v = ((C2 * nu) / np.log1p(C1 * nu ** 3 / np.maximum(rad, 1e-6)) - 273.15).astype(np.float32)
        s = sample(v)
        # 밝기는 절대온도 기준 — 색이 날마다 달라지면 어제와 비교가 안 된다
        t = np.clip((cfg["hot"] - s) / (cfg["hot"] - cfg["cold"]), 0, 1)
        gy = np.clip(t * 1.35, 0, 1)

        if cfg.get("rowbase"):
            # ⚠️⚠️ **고정 온도 문턱은 전면에서 못 쓴다.**
            #    실측: hot=30·cold=-75 로 두었더니 **남극해(-45~-60°)가 62.5% 불투명**이었다.
            #    구름이 아니라 그냥 차가운 바다다. 적도에서 극까지 지표 온도가
            #    40°C 넘게 다르니, 하나의 문턱이 어디선가는 반드시 틀린다.
            #
            #    → **위도줄마다 "맑은 하늘"을 그 줄에서 직접 잰다.**
            #      그 줄에서 가장 따뜻한 축(92 분위)이 곧 지표이고,
            #      구름은 "그보다 얼마나 찬가"다. 바깥 자료가 필요 없다.
            #    ⚠️ 그 위도가 통째로 구름에 덮인 날은 기준선도 구름이라 **덜 보인다.**
            #       고정 문턱이 대륙 하나를 통째로 칠하는 것보다는 낫다고 판단했다.
            m = np.where(ok, s, np.nan)
            with np.errstate(all="ignore"):
                base = np.nanpercentile(m, 92, axis=1).astype(np.float32)
            base = np.where(np.isfinite(base), base, np.nanmedian(base))
            # 줄마다 튀면 **가로줄 무늬**가 생긴다 — 25줄 이동평균으로 편다
            k = 25
            pad = np.pad(base, k // 2, mode="edge")
            base = np.convolve(pad, np.ones(k, np.float32) / k, mode="valid")
            dT = base[:, None] - s            # 지표보다 몇 도 찬가
            LO, HI = cfg["dLo"], cfg["dHi"]   # 이만큼 차면 보이기 시작 / 완전히 덮는다
            al = np.clip((dT - LO) / (HI - LO), 0, 1) ** cfg["gamma"]
        else:
            # ⚠️ 좁은 영역(한반도)에서는 고정 문턱으로 충분하다
            al = np.clip((t - cfg["floor"]) / max(1e-6, 1 - cfg["floor"]), 0, 1) ** cfg["gamma"]
        lo_c, hi_c = float(np.nanmin(s[ok])), float(np.nanmax(s[ok]))
        unit = "°C"
    else:
        # 가시광 = 햇빛을 얼마나 되쏘았나. ⚠️ 밤에는 0 에 가깝다 — 그게 정상이다.
        s = sample((rad * alb_c).astype(np.float32) if alb_c else rad.astype(np.float32))
        if cfg.get("solar"):
            # ⚠️⚠️ **해가 든 각도로 나눈다.** 안 하면 태양에서 비껴 있는 곳의 구름이
            #    통째로 사라진다 (_cos_sza 주석의 실측 참고).
            lonv = np.linspace(box["lon"][0], box["lon"][1], W, dtype=np.float32)[None, :]
            latv = np.linspace(box["lat"][1], box["lat"][0], H, dtype=np.float32)[:, None]
            mu = _cos_sza(latv, lonv, when).astype(np.float32)
            # ⚠️ 새벽·저녁에는 mu 가 0 에 가까워 **나누면 폭발한다.** 바닥을 둔다.
            #    0.30 은 태양고도 약 17° — 그보다 낮으면 그림자가 길어 구름 판별이 무의미하고,
            #    나누기가 3배를 넘어가면 잡음까지 같이 커진다.
            day = mu > 0.15
            s = np.where(day, s / np.maximum(mu, 0.30), 0.0).astype(np.float32)
            # ⚠️ 밤은 **아예 비운다.** 억지로 밝히면 잡음이 구름이 된다.
            #    "밤에는 안 보입니다"라고 화면에 적는 편이 정직하다.
            ok = ok & day
        # ⚠️⚠️ 반사도가 있으면 문턱을 **물리값으로 고정**한다.
        #    실측(전면, 2026-08-04 11:00 KST): 지표·바다 0.07 · 90분위 0.37 · 최대 1.15.
        #    → floor 0.18 은 지표 위·옅은 구름 아래다. hi 0.65 에서 완전히 하얘진다.
        #    ⚠️ 백분위로 잡으면 날마다 기준이 달라져 **어제와 비교가 안 된다.**
        hi = float(cfg.get("hi") or 0) or (
            0.65 if alb_c else (np.percentile(s[ok], 99.0) if ok.any() else 1.0))
        fl = float(cfg["floor"])
        gy = np.clip(s / max(hi, 1e-6), 0, 1)
        al = np.clip((s - fl) / max(1e-6, hi - fl), 0, 1) ** cfg["gamma"] if alb_c \
            else np.clip((gy - fl) / max(1e-6, 1 - fl), 0, 1) ** cfg["gamma"]
        lo_c, hi_c = (float(np.nanmin(s[ok])) if ok.any() else 0.0), float(hi)
        unit = "albedo" if alb_c else "radiance"

    # ⚠️ **LA(회색+알파) 2채널**로 보낸다. RGB 가 어차피 같은 값이라 3장을 보낼 이유가 없다 —
    #    실측으로 RGBA 4.63MB → LA 2.99MB (35% 절감). 폰에서 받는 파일이라 크다.
    #    GMGSI 가 쓰는 방식이고 브라우저가 알아서 R=G=B=L 로 푼다.
    g8 = (gy * 255).astype(np.uint8)
    a8 = (al * 255).astype(np.uint8)
    g8[~ok] = 0
    a8[~ok] = 0
    buf = io.BytesIO()
    Image.fromarray(np.stack([g8, a8], -1), "LA").save(buf, "PNG", optimize=True)
    png = buf.getvalue()
    dst.put_object(Bucket=DST_BUCKET, Key=f"clouds/gk2a/{ch}.png", Body=png,
                   ContentType="image/png", CacheControl="public, max-age=300")
    (la0, la1), (lo0, lo1) = box["lat"], box["lon"]
    return {"bytes": len(png), "min": round(lo_c, 1), "max": round(hi_c, 1),
            "unit": unit, "cover": round(float(ok.mean()) * 100, 1),
            # ⚠️ 채널마다 범위가 다르다. 하나로 두면 가시광(한반도)이
            #    전면 사각형에 늘어붙어 **엉뚱한 자리에 그려진다.**
            "bbox": {"south": la0, "north": la1, "west": lo0, "east": lo1},
            "width": W, "height": H, "area": cfg["area"]}


def handler(event=None, context=None):
    want = (event or {}).get("channels") or list(CHANNELS)
    out, tstamp = {}, None
    for ch in want:
        if ch not in CHANNELS:
            continue
        key = latest_key(ch)
        if not key:
            # ⚠️ 없으면 **없다고 둔다.** 옛 그림을 그대로 두면 언제 것인지 모른 채 보게 된다.
            out[ch] = {"ok": False, "reason": "최근 4시간 안에 파일이 없습니다"}
            continue
        m = re.search(r"_(\d{12})\.nc$", key)
        t = m.group(1) if m else None
        if tstamp is None or (t and t > tstamp):
            tstamp = t
        try:
            r = render(ch, key)
            r.update(ok=True, at=t, ko=CHANNELS[ch]["ko"])
            out[ch] = r
            print(f"[gk2a] {ch} {t} · {r['bytes']/1024:.0f}KB · "
                  f"{r['min']}~{r['max']}{r['unit']} · 덮음 {r['cover']}%")
        except Exception as e:                                   # noqa: BLE001
            out[ch] = {"ok": False, "reason": str(e)[:120]}
            print(f"[gk2a] {ch} 실패: {e}")

    iso = None
    if tstamp:
        iso = datetime.strptime(tstamp, "%Y%m%d%H%M").replace(
            tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    meta = {
        "time": iso,
        # ⚠️ 여기 bbox 는 **없다.** 채널마다 다르므로 channels[*].bbox 를 봐야 한다.
        #    옛 화면이 최상위 bbox 를 읽고 있었다면 그건 이제 틀린 값이다.
        "source": "천리안2A (GK-2A) · 기상청 국가기상위성센터 / NOAA AWS 공개데이터",
        "resolution_km": 2.0,
        "channels": out,
        "note": {
            "ko": "천리안2A 가 찍은 것입니다. 원본은 2.5분마다 나옵니다. "
                  "적외·수증기는 위성이 보는 전면(동아시아·서태평양)을, "
                  "가시광은 한반도를 0.5km 로 잘라 드립니다. "
                  "⚠️ 적외(구름·수증기)는 밤에도 보이지만, 가시광은 낮에만 보입니다. "
                  "⚠️ 적외 하나로는 낮은 구름과 따뜻한 바다를 깨끗이 가르지 못합니다 — "
                  "둘 다 20°C 근처라 자료 자체의 한계입니다.",
        },
    }
    dst.put_object(Bucket=DST_BUCKET, Key="clouds/gk2a/meta.json",
                   Body=json.dumps(meta, ensure_ascii=False).encode(),
                   ContentType="application/json; charset=utf-8",
                   CacheControl="public, max-age=120")
    return {"ok": any(v.get("ok") for v in out.values()), "time": iso, "channels": out}

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
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
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
    # ⚠️⚠️ **한반도(8°)와 전면(120°) 사이가 통째로 비어 있었다.**
    #    한반도 상자는 0.5km 로 선명한데 8°밖에 안 되고, 전면은 120°인데 8.35km 라
    #    그 사이 — 오키나와·대만·일본 남부 — 가 어느 쪽으로도 잘 안 보였다.
    #    태풍이 오키나와쯤 있을 때가 정확히 그 구간이다.
    #    → 2km/화소로 그 사이를 메운다. 삿포로(43.1N)부터 타이베이(25.0N)까지 들어간다.
    #    ⚠️ 화소를 더 키우지 말 것. 2000×1335 에서 PNG 가 이미 3MB 대다 —
    #       전면(1600²)이 3.1MB 였다. 폰으로 받는 그림이라는 걸 잊으면 안 된다.
    "EA": {"lat": (23.0, 47.0), "lon": (114.0, 150.0), "w": 2000, "h": 1335},
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
    # ⚠️⚠️⚠️ **밤에 낮은 구름을 보는 유일한 길.**
    #   가시광은 밤에 꺼지고, 적외 11.2㎛ 하나로는 낮은 구름을 원리상 못 본다.
    #   → 그래서 낮에는 가시광으로 메웠지만 **밤에는 메울 것이 없었다.**
    #
    #   기상기관들이 쓰는 방법이 있다: **두 파장의 온도 차(BTD)** 다.
    #   물방울로 된 낮은 구름·안개는 3.8㎛ 에서 방사율이 낮아 그 파장에서만
    #   더 차갑게 보인다. 그래서 T(11.2) − T(3.8) 이 **양수(+2~+6K)** 가 된다.
    #     맑은 하늘   ≈ 0
    #     낮은 물구름 +2 ~ +6 K   ← 이걸 찾는다
    #     높은 얼음구름 0 또는 음수
    #
    #   ⚠️⚠️ **낮에는 못 쓴다.** 3.8㎛ 에는 햇빛 반사가 크게 섞여 차이가 무의미해진다.
    #      → 해가 진 곳에서만 그린다. 가시광과 정확히 반대라 둘이 짝을 이룬다.
    #   2026-08-06 02:46 KST 운영 밤 자료를 눈과 화소 수로 확인했다:
    #      낮 영역은 비고, 전체 격자의 1.5%만 표시 문턱을 넘었다.
    #   ⚠️ 이 확인은 산출·마스킹이 작동한다는 뜻이지, 그 1.5%가 실제 안개 면적이라는
    #      뜻이 아니다. 지상 관측과 대조하기 전에는 계속 "후보"라고만 부른다.
    "nightlow": {"ch": "ir112", "pair": "sw038", "kind": "btd",
                 "area": "FD", "res": "020ge",
                 # ⚠️⚠️ **3.8㎛ 는 14비트다.** 아래 BITS 주석 참고.
                 "pairBits": 14,
                 # 단위는 K. 실측으로 다시 맞춰야 한다.
                 "floor": 1.5, "hi": 6.0, "gamma": 0.9,
                 "ko": "낮은 구름·안개 (밤)"},
    # 동아시아 2km — ⚠️ 낮에는 이것이 가장 쓸 만하다. 전면보다 4배 선명하고
    #    한반도 상자가 못 담는 오키나와·대만까지 덮는다.
    #    ⚠️ stride 4 (원본 2km) 로 읽는다. 8 로 읽으면 원본이 4km 가 되어
    #       2km 출력에 모자란다 — 확대해도 안 선명해진다.
    "vi006ea": {"ch": "vi006", "srcArea": "FD", "kind": "vis", "area": "EA", "res": "005ge",
                "stride": 4, "solar": True,
                "floor": 0.18, "hi": 0.65, "gamma": 0.9, "ko": "구름 (낮 · 동아시아 2km)"},
    # ⚠️ 적외는 원본이 이미 2km 라 stride 가 필요 없다. 밤에는 이쪽만 보인다.
    #    ⚠️ rowbase 를 쓰지 않는다 — 24° 안에서는 위도별 지표 온도 차이가 작아
    #       고정 문턱으로 충분하고, 좁은 상자에서 위도줄마다 기준을 다시 재면
    #       구름 낀 줄에서 기준선이 같이 내려가 오히려 덜 보인다.
    "ir112ea": {"ch": "ir112", "srcArea": "FD", "kind": "ir", "area": "EA", "res": "020ge",
                "hot": 25.0, "cold": -75.0, "floor": 0.14, "gamma": 0.85,
                "ko": "구름 (밤에도 · 동아시아 2km)"},
    "vi006fd": {"ch": "vi006", "kind": "vis", "area": "FD", "res": "005ge",
                "stride": 8, "solar": True,
                # ⚠️ 반사도(0~1) 기준이다. 실측으로 정했다 — 지표 0.07 / 구름 0.37~1.15.
                "floor": 0.18, "hi": 0.65, "gamma": 0.9, "ko": "구름 (낮 · 전지구)"},
}

# ⚠️⚠️⚠️ **채널마다 유효 비트 수가 다르다.** 이걸 하나로 두면 조용히 틀린다.
#   실측(2026-08-04):
#     ir112  원시 DN 최솟값  1,404 → 13비트로 충분  (온도 -113~57°C, 정상)
#     sw038  원시 DN 최솟값 14,092 → **13비트로 자르면 통째로 잘린다**
#            잘린 채로 계산하면 밝기온도가 **104°C** 로 나온다 (불가능한 값이라 걸렸다).
#            14비트로 읽으면 27.2°C — 한낮 지표 온도로 맞다.
#   ⚠️ 찾는 법: 복사휘도가 0 이 되는 DN = (0 - offset) / gain 을 구해
#      그 값이 들어가는 비트 수를 쓴다. ir112 는 8,017 (13비트), sw038 은 16,344 (14비트).
#   ⚠️ 최상위 2비트는 **품질 플래그**다. 값을 자르는 것만으로는 부족하다.
#      out_of_scan(32768)을 마스크로만 지우면 DN 0이 되어 플랑크 계산에 들어간다.
#      아래에서 good_pixel인 화소만 별도로 남긴다.
BITS = {"ir112": 13, "wv063": 13, "vi006": 13, "sw038": 14}

# 빠른 천리안 레이어가 쓰는 단계별 타일.
#   동아시아 2km → 한반도 0.5km(가시광일 때만)
# 256px 타일을 지구본 기본 지형·히마와리와 같은 Web Mercator XYZ 좌표에 맞춰 만들고,
# 실제 영상 사각형과 겹치는 조각만 올린다. 지역 사각형을 provider.rectangle로 제한하면
# Cesium 1.143이 확대 첫 프레임의 frustum을 NaN으로 만들어 중단했다(실화면 반복 재현).
# 화면 제공자는 전역으로 두되 레이어를 켜면 관측 범위로 이동하므로 없는 바깥 타일을 훑지 않는다.
TILED_CHANNELS = {"vi006ea", "ir112ea", "vi006"}
TILE_SIZE = 256
TILE_LEVELS = {
    # Web Mercator 256px 기준 z6가 동아시아에서 약 2.4km, z8이 한반도에서 약 0.6km다.
    "vi006ea": (0, 6),
    "ir112ea": (0, 6),
    "vi006": (0, 8),
}


def _mask(ch):
    return (1 << BITS.get(ch, 13)) - 1


def _mercator_y(lat):
    """위도(도) → Web Mercator 전지구 Y(북=0, 남=1)."""
    p = math.radians(max(-85.05112878, min(85.05112878, lat)))
    return (1.0 - math.asinh(math.tan(p)) / math.pi) / 2.0


def _to_mercator(image, south, north):
    """등위도 영상의 세로축을 Web Mercator Y 등간격으로 재표본화한다."""
    srca = np.asarray(image)
    h = image.height
    yn, ys = _mercator_y(north), _mercator_y(south)
    y = np.linspace(yn, ys, h, dtype=np.float64)
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * y))))
    sy = np.clip((north - lat) / (north - south) * (h - 1), 0, h - 1)
    y0 = np.floor(sy).astype(np.int32)
    y1 = np.minimum(y0 + 1, h - 1)
    f = (sy - y0)[:, None, None]
    warped = srca[y0] * (1.0 - f) + srca[y1] * f
    return Image.fromarray(np.rint(warped).astype(np.uint8), "LA")


def _upload_tile_pyramid(ch, at, image, box):
    """등경위도 한 장을 표준 Web Mercator XYZ 타일 좌표로 올린다.

    ⚠️ 두 슬롯을 번갈아 쓴다. 고정 경로 하나를 덮으면 업로드 중 새 조각과 옛
       조각이 섞이고, 시각별 경로를 계속 만들면 저장공간이 끝없이 는다.
       meta.json은 모든 타일 업로드가 끝난 뒤 갱신되므로 새 사용자는 완성된 슬롯만 본다.
    """
    when = datetime.strptime(at, "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
    slot = int(when.timestamp() // 600) % 2
    prefix = f"clouds/gk2a/tiles/{ch}/{slot}"
    resample = getattr(Image, "Resampling", Image).LANCZOS

    west, east = box["lon"]
    south, north = box["lat"]
    image = _to_mercator(image, south, north)
    bx0, bx1 = (west + 180.0) / 360.0, (east + 180.0) / 360.0
    by0, by1 = _mercator_y(north), _mercator_y(south)
    z_min, z_max = TILE_LEVELS[ch]
    uploads = []
    for z in range(z_min, z_max + 1):
        n = 1 << z
        span = 1.0 / n
        x0 = max(0, int(math.floor(bx0 * n)))
        x1 = min(n - 1, int(math.floor(bx1 * n - 1e-9)))
        y0 = max(0, int(math.floor(by0 * n)))
        y1 = min(n - 1, int(math.floor(by1 * n - 1e-9)))

        for y in range(y0, y1 + 1):
            ty0, ty1 = y * span, (y + 1) * span
            for x in range(x0, x1 + 1):
                tx0, tx1 = x * span, (x + 1) * span
                ix0, ix1 = max(bx0, tx0), min(bx1, tx1)
                iy0, iy1 = max(by0, ty0), min(by1, ty1)
                if ix0 >= ix1 or iy0 >= iy1:
                    continue

                sx0 = round((ix0 - bx0) / (bx1 - bx0) * image.width)
                sx1 = round((ix1 - bx0) / (bx1 - bx0) * image.width)
                sy0 = round((iy0 - by0) / (by1 - by0) * image.height)
                sy1 = round((iy1 - by0) / (by1 - by0) * image.height)
                dx0 = round((ix0 - tx0) / span * TILE_SIZE)
                dx1 = round((ix1 - tx0) / span * TILE_SIZE)
                dy0 = round((iy0 - ty0) / span * TILE_SIZE)
                dy1 = round((iy1 - ty0) / span * TILE_SIZE)
                if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                    continue

                part = image.crop((sx0, sy0, sx1, sy1)).resize(
                    (dx1 - dx0, dy1 - dy0), resample)
                tile = Image.new("LA", (TILE_SIZE, TILE_SIZE), (0, 0))
                tile.paste(part, (dx0, dy0))
                out = io.BytesIO()
                tile.save(out, "PNG", compress_level=6)
                uploads.append((f"{prefix}/{z}/{x}/{y}.png", out.getvalue()))

    def put(item):
        key, body = item
        dst.put_object(Bucket=DST_BUCKET, Key=key, Body=body,
                       ContentType="image/png", CacheControl="public, max-age=300")

    # boto3 클라이언트는 스레드 안전하다. 직렬 PUT 150여 회가 영상 계산보다 오래 걸려
    # Lambda 300초 제한을 넘길 수 있으므로 업로드만 병렬화한다. PNG 계산은 순서대로다.
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(put, uploads))

    return {
        "template": f"tiles/{ch}/{slot}/{{z}}/{{x}}/{{y}}.png",
        "tileWidth": TILE_SIZE,
        "tileHeight": TILE_SIZE,
        "minimumLevel": z_min,
        "maximumLevel": z_max,
        "tileCount": len(uploads),
        "scheme": "webmercator-global-v1",
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
    # ⚠️⚠️ **원본 영역과 우리 출력 상자는 다른 것이다.**
    #    NOAA 에 있는 폴더는 FD·LA 뿐이다. EA 는 **우리가 정한 출력 범위**이지
    #    원본 폴더가 아니다. 둘을 같은 값으로 쓰면 AMI/L1B/EA/ 를 찾다가
    #    "최근 4시간 안에 파일이 없습니다"가 뜬다 (실제로 그렇게 막혔다).
    area = cfg.get("srcArea", cfg["area"])          # 'FD' 전면 | 'LA' 한반도 (원본 폴더)
    # ⚠️ 꼬리는 원본 영역+해상도다: fd020ge / la005ge …
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


def latest_key_for(ch_name, area, res):
    """채널 이름으로 직접 최신 파일을 찾는다 (짝 채널 대체용).
    ⚠️ latest_key(ch) 는 CHANNELS 표를 거치는데, 짝 채널(sw038)은 표에 없다."""
    now = datetime.now(timezone.utc)
    tail = f"{area.lower()}{res}"
    for back_h in range(0, 4):
        t = now - timedelta(hours=back_h)
        prefix = f"AMI/L1B/{area}/{t:%Y%m}/{t:%d}/{t:%H}/gk2a_ami_le1b_{ch_name}_{tail}_"
        r = src.list_objects_v2(Bucket=SRC_BUCKET, Prefix=prefix)
        keys = sorted(o["Key"] for o in r.get("Contents", []))
        if keys:
            return keys[-1]
    return None


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


# ⚠️⚠️ **같은 원본을 두 번 내려받지 않는다.**
#    가시광 전면 파일이 **480MB** 다. 전면·동아시아를 따로 그리려고 두 번 받으면
#    1GB 를 받게 되고 Lambda 시간이 두 배가 된다. 한 번 실행 안에서만 재사용한다.
#    ⚠️ 전역에 두는 이유: 웜 스타트에서도 살아 있으면 **옛 시각 자료를 다시 그린다.**
#       그래서 handler 시작할 때 반드시 비운다.
_BODY = {}


def render(ch, key):
    cfg = CHANNELS[ch]
    # ⚠️ 관측 시각은 **파일 이름**에서 뽑는다(..._202608040146.nc, UTC).
    #    지금 시각(now)을 쓰면 안 된다 — 원자료가 20~30분 늦게 올라오는 날이 있어
    #    태양 위치가 그만큼 어긋나고, 새벽·저녁에 밝기가 통째로 틀어진다.
    m = re.search(r"_(\d{12})\.nc$", key)
    when = (datetime.strptime(m.group(1), "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
            if m else datetime.now(timezone.utc))
    body = _BODY.get(key)
    if body is None:
        body = src.get_object(Bucket=SRC_BUCKET, Key=key)["Body"].read()
        _BODY[key] = body
    with h5py.File(io.BytesIO(body), "r") as f:
        st = cfg.get("stride", 1)
        # ⚠️⚠️ 480MB 짜리 0.5km 전면 자료를 통째로 올리면 Lambda 가 메모리로 죽는다.
        #    h5py 의 **띄엄띄엄 읽기**로 필요한 만큼만 가져온다.
        #    stride=8 이면 22000² → 2750² (60MB). 우리 출력이 8km/px 라 2km 면 충분하다.
        #    ⚠️ 격자 간격(dx·dy)도 같이 늘려야 한다. 안 그러면 그림이 8배 어긋난다.
        raw = np.asarray(f["image_pixel_values"][::st, ::st] if st > 1
                         else f["image_pixel_values"])
        quality_shift = int(_attr(f["image_pixel_values"], "number_of_total_bits_per_pixel")) \
            - int(_attr(f["image_pixel_values"], "number_of_data_quality_flag_bits_per_pixel"))
        # ⚠️ conditionally_usable의 사용 조건은 파일에 없다. 조건을 모르는 화소를
        #    정상값처럼 쓰지 않고 NOAA가 good_pixel(0)로 표시한 것만 쓴다.
        quality_ok = (raw >> quality_shift) == 0
        # ⚠️ 마스크는 **실제 채널 이름**으로 고른다. 레이어 id 가 아니다
        #    (vi006fd → vi006). id 로 찾으면 기본값 13 이 조용히 쓰인다.
        MASK = _mask(cfg.get("ch", ch))
        # ⚠️⚠️ 16비트 중 **유효 13비트**다. 위 2비트는 품질 플래그다 —
        #    안 떼면 불량 화소가 6만 대 값으로 튀어 흰 점이 박힌다.
        dn = (raw & MASK).astype(np.float64)
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

    def sample_ok(a):
        """이중선형 보간에 섞이는 네 원본 화소가 모두 정상인지."""
        return (a[r0, c0] & a[r0, c0 + 1]
                & a[r0 + 1, c0] & a[r0 + 1, c0 + 1])

    ok = ok & sample_ok(quality_ok)

    rad = gain * dn + off      # ⚠️ 적외는 gain 이 **음수**다 = 값이 클수록 차갑다

    def planck(r, wl):
        """복사휘도 → 밝기온도(°C).
        ⚠️ **파수(cm⁻¹) 기준**이다. 파장 식을 쓰면 437°C 가 나온다."""
        nu = 1e4 / wl
        return ((C2 * nu) / np.log1p(C1 * nu ** 3 / np.maximum(r, 1e-6)) - 273.15).astype(np.float32)

    if cfg["kind"] == "btd":
        # ⚠️ 짝 파일은 **같은 시각·같은 격자**여야 한다. 파일 이름에서 채널만 바꿔 찾는다 —
        #    시각이 다르면 구름이 움직인 만큼 차이가 생겨 없는 안개가 나타난다.
        pkey = key.replace(f"_{cfg['ch']}_", f"_{cfg['pair']}_")
        try:
            pbody = src.get_object(Bucket=SRC_BUCKET, Key=pkey)["Body"].read()
        except src.exceptions.NoSuchKey:
            # ⚠️ 두 채널이 **같은 시각에 동시에 올라오지 않는다.** 몇 분 어긋난다.
            #    없으면 그 채널의 최신을 찾아 쓰되, **10분을 넘게 벌어지면 쓰지 않는다** —
            #    시간이 벌어진 만큼 구름이 움직여서 없는 안개가 만들어진다.
            alt = latest_key_for(cfg["pair"], cfg.get("srcArea", cfg["area"]), cfg["res"])
            if not alt:
                raise ValueError(f"짝 채널({cfg['pair']}) 파일을 못 찾았다")
            am = re.search(r"_(\d{12})\.nc$", alt)
            gap = abs((datetime.strptime(am.group(1), "%Y%m%d%H%M")
                       .replace(tzinfo=timezone.utc) - when).total_seconds()) / 60 if am else 999
            if gap > 10:
                raise ValueError(f"짝 채널이 {gap:.0f}분 어긋나 쓰지 않는다")
            print(f"[gk2a] {ch} 짝을 {gap:.0f}분 차이로 대체: {alt.split('/')[-1]}")
            pbody = src.get_object(Bucket=SRC_BUCKET, Key=alt)["Body"].read()
        with h5py.File(io.BytesIO(pbody), "r") as pf:
            pvalues = pf["image_pixel_values"]
            praw = np.asarray(pvalues)
            pquality_shift = int(_attr(pvalues, "number_of_total_bits_per_pixel")) \
                - int(_attr(pvalues, "number_of_data_quality_flag_bits_per_pixel"))
            pquality_ok = (praw >> pquality_shift) == 0
            # ⚠️ 짝 채널은 **비트 수가 다를 수 있다.** sw038 이 정확히 그렇다.
            pdn = (praw & ((1 << cfg.get("pairBits", BITS.get(cfg["pair"], 13))) - 1)
                   ).astype(np.float64)
            pgain = float(_attr(pf, "DN_to_Radiance_Gain"))
            poff = float(_attr(pf, "DN_to_Radiance_Offset"))
            plam = float(_attr(pf, "channel_center_wavelength"))
        if pdn.shape != dn.shape:
            raise ValueError(f"짝 격자가 다르다 {pdn.shape} vs {dn.shape}")
        ok = ok & sample_ok(pquality_ok)

        t11 = planck(rad, lam)
        t38 = planck(pgain * pdn + poff, plam)
        s = sample((t11 - t38).astype(np.float32))          # BTD (K)

        # ⚠️⚠️ **해가 떠 있으면 못 쓴다.** 3.8㎛ 에 햇빛 반사가 섞인다.
        #    낮에도 그리면 사막·바다가 통째로 "안개"가 된다.
        lonv = np.linspace(box["lon"][0], box["lon"][1], W, dtype=np.float32)[None, :]
        latv = np.linspace(box["lat"][1], box["lat"][0], H, dtype=np.float32)[:, None]
        mu = _cos_sza(latv, lonv, when).astype(np.float32)
        night = mu < 0.0                                    # 해가 지평선 아래
        ok = ok & night
        fl, hi = float(cfg["floor"]), float(cfg["hi"])
        al = np.where(night, np.clip((s - fl) / max(1e-6, hi - fl), 0, 1) ** cfg["gamma"], 0.0)
        # 밝기는 차이가 클수록 하얗게 — 짙은 안개가 더 두껍게 보인다
        gy = np.clip((s - fl) / max(1e-6, hi - fl), 0, 1)
        lo_c, hi_c = (float(np.nanmin(s[ok])) if ok.any() else 0.0,
                      float(np.nanmax(s[ok])) if ok.any() else 0.0)
        unit = "K(BTD)"
    elif cfg["kind"] == "ir":
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
        # ⚠️ 받은 지적: "천리안 가시광은 밝은 구름이 하얗게 뭉개진다".
        # 알파가 완전히 차는 기준(hi=0.65)을 밝기 상한으로도 써서, 그보다 밝은
        # 구름 내부는 전부 255가 됐다. 알파 문턱은 유지하되 밝기는 더 넓은
        # 반사도 구간을 로그 곡선으로 눌러 밝은 구름의 결을 남긴다.
        tone_hi = float(cfg.get("toneHi") or (1.20 if alb_c else hi))
        gy = (np.log1p(3.0 * np.clip(s, 0, tone_hi))
              / np.log1p(3.0 * max(tone_hi, 1e-6)))
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
    image = Image.fromarray(np.stack([g8, a8], -1), "LA")
    image.save(buf, "PNG", optimize=True)
    png = buf.getvalue()
    dst.put_object(Bucket=DST_BUCKET, Key=f"clouds/gk2a/{ch}.png", Body=png,
                   ContentType="image/png", CacheControl="public, max-age=300")
    (la0, la1), (lo0, lo1) = box["lat"], box["lon"]
    result = {"bytes": len(png), "min": round(lo_c, 1), "max": round(hi_c, 1),
            "unit": unit, "cover": round(float(ok.mean()) * 100, 1),
            # 실제로 알파가 생긴 출력 화소 비율. 등위도 격자라 면적 비율이 아니고,
            # BTD에서는 낮은 구름·안개의 후보 면적조차 아니다 — 화면에도 그렇게 적는다.
            "signal": round(float((a8 > 0).mean()) * 100, 1),
            # ⚠️ 채널마다 범위가 다르다. 하나로 두면 가시광(한반도)이
            #    전면 사각형에 늘어붙어 **엉뚱한 자리에 그려진다.**
            "bbox": {"south": la0, "north": la1, "west": lo0, "east": lo1},
            "width": W, "height": H, "area": cfg["area"]}
    if ch in TILED_CHANNELS:
        result["tiles"] = _upload_tile_pyramid(
            ch, when.strftime("%Y%m%d%H%M"), image, box)
    return result


def handler(event=None, context=None):
    requested = (event or {}).get("channels")
    want = requested or list(CHANNELS)
    # ⚠️ 웜 스타트에서 지난 실행의 원본이 남아 있으면 **옛 하늘을 다시 그린다.**
    _BODY.clear()
    out = {}
    # ⚠️ 부분 채널 실행은 운영 점검에 쓴다. 선택한 결과만 meta.json에 쓰면
    #    선택하지 않은 정상 채널이 전부 사라진다(2026-08-06 실제로 발생).
    #    부분 실행일 때만 기존 채널을 먼저 읽고, 이번 결과로 해당 채널만 교체한다.
    if requested and set(want) != set(CHANNELS):
        try:
            old = json.load(dst.get_object(
                Bucket=DST_BUCKET, Key="clouds/gk2a/meta.json")["Body"])
            if isinstance(old.get("channels"), dict):
                out.update(old["channels"])
        except Exception as e:                                  # noqa: BLE001
            print(f"[gk2a] 기존 메타 병합 생략: {e}")

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
        try:
            r = render(ch, key)
            r.update(ok=True, at=t, ko=CHANNELS[ch]["ko"])
            out[ch] = r
            print(f"[gk2a] {ch} {t} · {r['bytes']/1024:.0f}KB · "
                  f"{r['min']}~{r['max']}{r['unit']} · 덮음 {r['cover']}%")
        except Exception as e:                                   # noqa: BLE001
            out[ch] = {"ok": False, "reason": str(e)[:120]}
            print(f"[gk2a] {ch} 실패: {e}")

    # 부분 실행으로 보존한 채널까지 포함해 가장 최신 관측 시각을 계산한다.
    stamps = [v.get("at") for v in out.values()
              if isinstance(v, dict) and v.get("at")]
    tstamp = max(stamps) if stamps else None
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

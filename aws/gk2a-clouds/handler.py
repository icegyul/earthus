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

# ── 출력 격자 (등경위도) ─────────────────────────────────────────
#   LA 영역은 대략 31.1~44.2°N · 119.9~132.2°E 다. 그 안쪽으로 잡는다 —
#   가장자리는 위성이 비스듬히 보는 곳이라 늘어난다.
LAT0, LAT1 = 31.5, 43.5
LON0, LON1 = 120.5, 132.0
W, H = 1100, 1150          # 약 1.1km/px — 원본 2km 보다 촘촘히 뽑아 계단을 줄인다

# ── 채널 ────────────────────────────────────────────────────────
#  kind: 'ir'  적외/수증기 — 밝기온도로 바꿔 **차가울수록 하얗게**
#        'vis' 가시광     — 반사도 그대로, 밝을수록 하얗게 (낮에만 의미 있음)
#  hot/cold: 색을 입히는 기준(°C). ⚠️ 사진마다 자동으로 늘리지 않는다 —
#            그러면 **날마다 밝기가 달라져 어제와 비교가 안 된다.**
#  res: 파일 이름에 박히는 해상도 꼬리.
#       ⚠️⚠️ **채널마다 다르다.** 적외·수증기는 2km(la020ge)인데
#          가시광 0.64㎛ 는 0.5km(la005ge), 나머지 가시광은 1km(la010ge)다.
#          전부 la020ge 로 찾으면 **가시광만 "파일이 없습니다"** 가 되는데,
#          목록에는 멀쩡히 있어서 원인을 찾기 어렵다 (실제로 한 번 겪었다).
CHANNELS = {
    "ir112": {"kind": "ir",  "res": "la020ge", "hot": 35.0, "cold": -75.0,
              "a_from": 25.0, "a_span": 45.0, "ko": "구름 (밤에도)"},
    # ⚠️ 수증기는 실측 범위가 -60~-27°C 로 좁다. 기준을 넓게 잡으면 통째로 회색이 된다.
    "wv063": {"kind": "ir",  "res": "la020ge", "hot": -25.0, "cold": -62.0,
              "a_from": -22.0, "a_span": 30.0, "ko": "상층 수증기"},
    "vi006": {"kind": "vis", "res": "la005ge", "a_from": 0.14, "a_span": 0.34,
              "ko": "구름 (낮)"},
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
    res = CHANNELS[ch]["res"]
    for back_h in range(0, 4):                     # 최대 4시간 전까지
        t = now - timedelta(hours=back_h)
        prefix = f"AMI/L1B/LA/{t:%Y%m}/{t:%d}/{t:%H}/gk2a_ami_le1b_{ch}_{res}_"
        r = src.list_objects_v2(Bucket=SRC_BUCKET, Prefix=prefix)
        keys = sorted(o["Key"] for o in r.get("Contents", []))
        if keys:
            return keys[-1]
    return None


def _geos_index(sub, ulx, uly, dx, dy, nx, ny):
    """등경위도 격자의 각 칸이 원본의 몇 번 화소인가 (CGMS 정지위성 변환)"""
    lon = np.linspace(LON0, LON1, W)[None, :]
    lat = np.linspace(LAT1, LAT0, H)[:, None]
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
    return (np.clip(np.round(row), 0, ny - 1).astype(np.int32),
            np.clip(np.round(col), 0, nx - 1).astype(np.int32), ok)


def render(ch, key):
    cfg = CHANNELS[ch]
    body = src.get_object(Bucket=SRC_BUCKET, Key=key)["Body"].read()
    with h5py.File(io.BytesIO(body), "r") as f:
        raw = np.asarray(f["image_pixel_values"])
        # ⚠️⚠️ 16비트 중 **유효 13비트**다. 위 2비트는 품질 플래그다 —
        #    안 떼면 불량 화소가 6만 대 값으로 튀어 흰 점이 박힌다.
        dn = (raw & 0x1FFF).astype(np.float64)
        ny, nx = dn.shape
        sub = float(_attr(f, "sub_longitude"))
        ulx, uly = float(_attr(f, "image_upperleft_x")), float(_attr(f, "image_upperleft_y"))
        lrx, lry = float(_attr(f, "image_lowerright_x")), float(_attr(f, "image_lowerright_y"))
        gain = float(_attr(f, "DN_to_Radiance_Gain"))
        off = float(_attr(f, "DN_to_Radiance_Offset"))
        lam = float(_attr(f, "channel_center_wavelength"))

    dx, dy = (lrx - ulx) / nx, (lry - uly) / ny
    ri, ci, ok = _geos_index(sub, ulx, uly, dx, dy, nx, ny)

    rad = gain * dn + off      # ⚠️ 적외는 gain 이 **음수**다 = 값이 클수록 차갑다
    if cfg["kind"] == "ir":
        # ⚠️⚠️ 복사휘도가 **파수(cm⁻¹)** 기준이다. 파장(㎛) 식을 쓰면 131~437°C 가 나온다
        #    (실제로 그렇게 나왔고, 물리적으로 불가능해서 바로 걸렸다).
        nu = 1e4 / lam
        v = (C2 * nu) / np.log1p(C1 * nu ** 3 / np.maximum(rad, 1e-6)) - 273.15
        s = v[ri, ci]
        gy = np.clip((cfg["hot"] - s) / (cfg["hot"] - cfg["cold"]), 0, 1)
        # 투명도는 **밝기가 아니라 온도**로 정한다 — 지표(따뜻)는 비고 구름만 남는다
        al = np.clip((cfg["a_from"] - s) / cfg["a_span"], 0, 1)
        lo_c, hi_c = float(np.nanmin(s[ok])), float(np.nanmax(s[ok]))
        unit = "°C"
    else:
        # 가시광은 복사휘도를 그대로 쓴다. ⚠️ 밤에는 0 에 가깝다 — 그게 정상이다.
        s = rad[ri, ci]
        hi = np.percentile(s[ok], 99.0) if ok.any() else 1.0
        gy = np.clip(s / max(hi, 1e-6), 0, 1)
        al = np.clip((gy - cfg["a_from"]) / cfg["a_span"], 0, 1)
        lo_c, hi_c = float(np.nanmin(s[ok])), float(hi)
        unit = "radiance"

    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = (gy * 255).astype(np.uint8)[..., None]
    rgba[..., 3] = (al * 255).astype(np.uint8)
    rgba[~ok] = 0

    buf = io.BytesIO()
    Image.fromarray(rgba).save(buf, "PNG", optimize=True)
    png = buf.getvalue()
    dst.put_object(Bucket=DST_BUCKET, Key=f"clouds/gk2a/{ch}.png", Body=png,
                   ContentType="image/png", CacheControl="public, max-age=300")
    return {"bytes": len(png), "min": round(lo_c, 1), "max": round(hi_c, 1),
            "unit": unit, "cover": round(float(ok.mean()) * 100, 1)}


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
        "bbox": {"south": LAT0, "north": LAT1, "west": LON0, "east": LON1},
        "width": W, "height": H,
        "source": "천리안2A (GK-2A) · 기상청 국가기상위성센터 / NOAA AWS 공개데이터",
        "resolution_km": 2.0,
        "channels": out,
        "note": {
            "ko": "천리안2A 가 한반도만 잘라 2km 로 찍은 것입니다. 원본은 2.5분마다 나옵니다. "
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

#!/usr/bin/env python3
"""음영기복 → EARTHUS v3 지구 표면

v3 지구는 나라 폴리곤을 색으로 칠한 것이라 **땅이 평평했다**. 히말라야도 안데스도
로키도 없이 초록 한 판이었다. 산맥 겹은 따로 있었지만 그건 테두리 선이었고,
켜기 전에는 지구가 평지였다.

Natural Earth 의 음영기복(SR_50M)을 겹친다. 퍼블릭 도메인이고, 지도에 그늘을
넣으려고 만들어진 자료다. 10800×5400 으로 들어와 2048×1024 로 줄인다.

■ 왜 곱하지 않고 오버레이인가
   그늘만 씌우면 산이 어두워지기만 하고 해가 드는 비탈은 그대로다. 오버레이는
   중간 회색(128)을 기준으로 아래는 어둡게 위는 밝게 한다. 그래서 평지값을
   정확히 128 로 옮겨 놓아야 한다.

■ 평지값 206
   원본 5832만 화소 중 4089만(70%)이 값 206 이다. 바다다. 이 값을 128 로 옮기면
   바다에서는 오버레이가 아무 일도 하지 않는다 — 가리개(mask)가 필요 없다.

⚠️ 이것은 잰 높이가 아니라 **해를 북서쪽에 두고 계산한 그늘**이다. 지도책이
   쓰는 관례를 그대로 따른 것이고, 우리 화면의 낮/밤과는 무관하다.
   높이를 묻는 곳(산 이름표의 고도)에는 이 그림을 쓰지 않는다.

사용: python tools/build-relief.py
"""

import io
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None

# 10m 판(21600×10800). 50m 판(10800×5400)으로 시작했다가 능선이 뭉개져 올렸다 —
# 지구 텍스처가 4096 폭이라 2160 짜리 그늘은 두 배로 늘어나며 흐려졌다.
SRC = "https://naciscdn.org/naturalearth/10m/raster/SR_HR.zip"
NAME = "SR_HR.tif"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".tmp" / "relief" / "SR_HR.zip"
OUT = ROOT / "prototype" / "data" / "relief-5400.webp"

# 21600×10800 의 정확히 1/4. 나누어떨어지지 않는 크기로 줄이면 화소마다 섞는 원본
# 개수가 달라져 능선에 결이 생긴다. 지구 텍스처와 1:1 로 맞춰 둔 크기다.
#
# ⚠️ 여기가 선명도의 천장이 아니다. 원본은 도(度)당 60화소인데 가장 깊은 배율의
#    화면은 도당 39화소다 — 원본은 충분하고, 줄이는 우리가 줄이는 만큼만 잃는다.
#    5400 이면 도당 15화소. 화면을 따라가려면 14,000 폭이 필요한데 그건 텍스처
#    메모리가 감당하지 못한다. 그래서 남는 몫은 언샵으로 메운다.
W, H = 5400, 2700
FLAT = 206          # 원본에서 바다(평지)가 갖는 값. 10m 판도 같다(2.3억 중 1.6억 화소).
GAIN = 1.45         # 기복을 얼마나 세울까. 1.0 이면 원본 그대로

# 5배로 줄이면 화소 25개가 하나로 평균된다 — 능선의 잔결이 거기서 뭉개진다.
# 언샵 마스크로 그 결을 되살린다. 없는 산을 만드는 게 아니라, 평균이 먹어 버린
# 대비를 원래 있던 자리에 돌려놓는 것이다.
# 평지(128)는 균일하므로 언샵이 건드리지 않는다 — 바다는 그대로 128 로 남는다.
SHARP_R, SHARP_PCT, SHARP_TH = 1.4, 125, 2


def load():
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print("▸ 내려받는다 (44MB)")
        CACHE.write_bytes(urllib.request.urlopen(SRC, timeout=1800).read())
    z = zipfile.ZipFile(CACHE)
    return np.asarray(Image.open(io.BytesIO(z.read(NAME))))     # uint8 그대로 — 2.3억 화소다


def main():
    a = load()
    h, w = a.shape
    print(f"▸ 원본 {w}×{h}")

    # 넓이 평균으로 줄인다. 그냥 건너뛰면 능선이 들쭉날쭉 끊긴다.
    # ⚠️ 통째로 float32 로 올리면 900MB 다. 가로줄 묶음으로 잘라 가며 줄인다.
    fy, fx = h // H, w // W
    assert h == H * fy and w == W * fx, f"정수배가 아니다: {w}×{h} → {W}×{H}"
    small = np.empty((H, W), np.float32)
    step = 216
    for y0 in range(0, H, step):
        y1 = min(H, y0 + step)
        blk = a[y0 * fy:y1 * fy].astype(np.float32)
        small[y0:y1] = blk.reshape(y1 - y0, fy, W, fx).mean(axis=(1, 3))

    out = np.clip(128.0 + (small - FLAT) * GAIN, 0, 255).astype(np.uint8)

    sea = out[int(0.45 * H):int(0.55 * H), int(0.10 * W):int(0.18 * W)]   # 태평양
    print(f"  평지 확인: 태평양 평균 {sea.mean():.1f} (128 이어야 한다), 편차 {sea.std():.2f}")
    print(f"  값 범위 {out.min()}~{out.max()}, 분위 1/50/99 = "
          f"{np.percentile(out,1):.0f}/{np.percentile(out,50):.0f}/{np.percentile(out,99):.0f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(out, mode="L").filter(
        ImageFilter.UnsharpMask(radius=SHARP_R, percent=SHARP_PCT, threshold=SHARP_TH))
    a2 = np.asarray(im)
    sea2 = a2[int(0.45*H):int(0.55*H), int(0.10*W):int(0.18*W)]
    print(f"  날 세운 뒤: 태평양 평균 {sea2.mean():.1f} (128 그대로여야 한다), "
          f"땅 대비 {a2.std():.2f} ← {out.std():.2f}")
    im.save(OUT, format="WEBP", quality=88, method=6)
    png = OUT.with_suffix(".png")
    im.save(png, format="PNG", optimize=True)
    print(f"▸ {OUT.name}  {OUT.stat().st_size:,} B")
    print(f"  (참고) PNG 로는 {png.stat().st_size:,} B")
    png.unlink()


if __name__ == "__main__":
    main()

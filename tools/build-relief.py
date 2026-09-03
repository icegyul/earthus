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
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = "https://naciscdn.org/naturalearth/50m/raster/SR_50M.zip"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".tmp" / "relief" / "SR_50M.zip"
OUT = ROOT / "prototype" / "data" / "relief-2160.webp"

# 10800×5400 의 정확히 1/5. 나누어떨어지지 않는 크기로 줄이면 화소마다 섞는 원본
# 개수가 달라져 능선에 결이 생긴다.
W, H = 2160, 1080
FLAT = 206          # 원본에서 바다(평지)가 갖는 값
GAIN = 1.35         # 기복을 얼마나 세울까. 1.0 이면 원본 그대로


def load():
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print("▸ 내려받는다 (11MB)")
        CACHE.write_bytes(urllib.request.urlopen(SRC, timeout=900).read())
    z = zipfile.ZipFile(CACHE)
    return np.asarray(Image.open(io.BytesIO(z.read("SR_50M.tif"))), dtype=np.float32)


def main():
    a = load()
    h, w = a.shape
    print(f"▸ 원본 {w}×{h}")

    # 넓이 평균으로 줄인다. 그냥 건너뛰면 능선이 들쭉날쭉 끊긴다.
    fy, fx = h // H, w // W
    assert h == H * fy and w == W * fx, f"정수배가 아니다: {w}×{h} → {W}×{H}"
    small = a.reshape(H, fy, W, fx).mean(axis=(1, 3))

    out = np.clip(128.0 + (small - FLAT) * GAIN, 0, 255).astype(np.uint8)

    sea = out[int(0.45 * H):int(0.55 * H), int(0.10 * W):int(0.18 * W)]   # 태평양
    print(f"  평지 확인: 태평양 평균 {sea.mean():.1f} (128 이어야 한다), 편차 {sea.std():.2f}")
    print(f"  값 범위 {out.min()}~{out.max()}, 분위 1/50/99 = "
          f"{np.percentile(out,1):.0f}/{np.percentile(out,50):.0f}/{np.percentile(out,99):.0f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(out, mode="L")
    im.save(OUT, format="WEBP", quality=88, method=6)
    png = OUT.with_suffix(".png")
    im.save(png, format="PNG", optimize=True)
    print(f"▸ {OUT.name}  {OUT.stat().st_size:,} B")
    print(f"  (참고) PNG 로는 {png.stat().st_size:,} B")
    png.unlink()


if __name__ == "__main__":
    main()

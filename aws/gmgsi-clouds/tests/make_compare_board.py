# -*- coding: utf-8 -*-
"""PD 눈 확인용 비교판 — 원본 PNG / WebP 3072 / WebP 2048(폰) 을 v1 화면처럼 합성해 나란히 (2026-09-23).

원채널(L·A)이 아니라 **사용자가 보는 그림**으로 비교한다. v1 imagery.js 가 하는 일을 그대로 흉내 낸다.
  ① 캔버스에 그렸다 getImageData 로 읽는다 → 알파를 곱했다 되나누는 반올림(premultiply 왕복)
  ② L → CLOUD_LUMA_LUT (90 + L·165/255),  A → CLOUD_ALPHA_LUT (255·(A/255)^0.78)
  ③ 그 텍스처를 GPU 처럼 쌍선형으로 표본 → 바탕 위에 알파로 얹는다
생략·대역(판에도 적는다)
  · 바탕은 v1 의 GIBS 바탕 대신 v2 자산 Natural Earth II(ne2-base-4096.jpg, 어둡게 굽힌 판)를 쓴다
  · 구름 그림자 레이어(_cloudShadowCanvas)는 그리지 않는다 — 알파만 쓰고 알파는 세 판이 같다(2048 은 해상도만 다름)

  python aws/gmgsi-clouds/tests/make_compare_board.py --png <global.png> --meta <meta.json> \
      --webp-dir <check_real_png --out 폴더> --out build/ux-mockups/cloud-webp-compare-2026-09-23.png
"""
import argparse
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BASE_JPG = os.path.join(ROOT, "prototype", "v2", "assets", "physical-earth", "ne2-base-4096.jpg")
FONT = "C:/Windows/Fonts/malgun.ttf"
FONT_B = "C:/Windows/Fonts/malgunbd.ttf"

V1_LUMA = np.round(90 + np.arange(256) * 165 / 255).astype(np.float32)
V1_ALPHA = np.round(255 * np.power(np.arange(256) / 255, 0.78)).astype(np.float32)

# (제목, 서경음수 lon0, lon1, lat0(남), lat1(북), 확대 상자 (lon0, lon1, lat0, lat1))
REGIONS = [
    ("한반도·일본", 118, 148, 26, 46, (124, 131.5, 33, 38)),
    # 확대 상자는 13Z 영상에서 06Z 위치 북서쪽의 큰 대류 덩어리(약 138°E 17.5°N)에 둔다. 그것이 TWENTYFIVE-26 인지는 여기서 판정하지 않는다.
    ("서태평양 — 열대저압부 TWENTYFIVE-26 GDACS 06Z 위치(138.4°E 16.0°N) 주변 · 영상은 13Z",
     122, 146, 8, 26, (134, 142, 14.8, 20.1)),
    ("동태평양 — POLO-26 GDACS 09Z 위치(101.4°W 15.0°N) 주변 · 영상은 13Z",
     -112, -90, 6, 22, (-106, -98, 11.5, 16.8)),
    ("남극해 — 자료 끝(72.7°S)과 극 페이드 띠", 0, 40, -72.73, -52, (0, 12, -72.73, -64.8)),
]


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_B if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


def bilinear(arr, u, v):
    """arr (H,W[,C]) 를 화소 좌표 u(가로)·v(세로) 에서 쌍선형 표본. 가로는 경도라 감아 돈다."""
    H, W = arr.shape[:2]
    u0 = np.floor(u).astype(np.int64)
    v0 = np.floor(v).astype(np.int64)
    fu = (u - u0).astype(np.float32)
    fv = (v - v0).astype(np.float32)
    u1 = u0 + 1
    v1 = v0 + 1
    u0 %= W
    u1 %= W
    v0 = np.clip(v0, 0, H - 1)
    v1 = np.clip(v1, 0, H - 1)
    if arr.ndim == 3:
        fu = fu[..., None]
        fv = fv[..., None]
    a = arr[v0, u0] * (1 - fu) + arr[v0, u1] * fu
    b = arr[v1, u0] * (1 - fu) + arr[v1, u1] * fu
    return a * (1 - fv) + b * fv


def premultiply_roundtrip(L, A):
    """캔버스(premultiplied) 에 그렸다 getImageData 로 읽을 때의 반올림 — 알파 낮은 곳의 L 이 뭉개진다."""
    L = L.astype(np.int32)
    A = A.astype(np.int32)
    pm = (L * A + 127) // 255
    out = np.where(A > 0, np.minimum(255, (pm * 255 + A // 2) // np.maximum(A, 1)), 0)
    return out.astype(np.uint8)


def v1_texture(la):
    """v1 이 Cesium 에 올리는 RGBA 텍스처(여기서는 회색 한 채널 + 알파)."""
    L = premultiply_roundtrip(la[..., 0], la[..., 1])
    return V1_LUMA[L], V1_ALPHA[la[..., 1]]


def render(tex, base, north, south, box, out_w):
    """box 영역을 out_w 폭으로. 경위도 정사각(등장방형) 화면."""
    lon0, lon1, lat0, lat1 = box
    out_h = max(1, round(out_w * (lat1 - lat0) / (lon1 - lon0)))
    lon = lon0 + (np.arange(out_w) + 0.5) / out_w * (lon1 - lon0)
    lat = lat1 - (np.arange(out_h) + 0.5) / out_h * (lat1 - lat0)
    LON, LAT = np.meshgrid(lon, lat)
    bH, bW = base.shape[:2]
    bg = bilinear(base, (LON + 180) / 360 * bW - 0.5, (90 - LAT) / 180 * bH - 0.5)
    lum, alp = tex
    H, W = lum.shape
    u = (LON + 180) / 360 * W - 0.5
    v = (north - LAT) / (north - south) * H - 0.5
    c = bilinear(lum, u, v)
    a = bilinear(alp, u, v) / 255.0
    inside = (LAT <= north) & (LAT >= south)
    a = np.where(inside, a, 0.0)
    out = bg * (1 - a[..., None]) + c[..., None] * a[..., None]
    return np.clip(out, 0, 255)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--webp-dir", required=True)
    ap.add_argument("--report", help="check_real_png.py --json 결과(바이트·오차 표기용)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)

    meta = json.load(open(a.meta, encoding="utf-8"))
    north, south = float(meta["north"]), float(meta["south"])
    rep = json.load(open(a.report, encoding="utf-8")) if a.report else None

    def load_la(path):
        with Image.open(path) as im:
            im.load()
            if im.mode == "LA":
                return np.asarray(im).copy()
            rgba = np.asarray(im.convert("RGBA"))
            return np.stack([rgba[..., 0], rgba[..., 3]], axis=-1)

    png_path = a.png
    w_full = os.path.join(a.webp_dir, "global.webp")
    w_2048 = os.path.join(a.webp_dir, "global-2048.webp")
    sizes = {k: os.path.getsize(p) for k, p in (("png", png_path), ("webp", w_full), ("webp2048", w_2048))}
    las = {"png": load_la(png_path), "webp": load_la(w_full), "webp2048": load_la(w_2048)}
    texs = {k: v1_texture(v) for k, v in las.items()}
    base = np.asarray(Image.open(BASE_JPG).convert("RGB")).astype(np.float32)

    PW = 500           # 패널 폭
    GAP = 16
    MARGIN = 28
    cols = ["png", "webp", "webp2048"]
    col_title = {
        "png": f"원본 PNG · {sizes['png']:,} B",
        "webp": f"WebP 3072 · {sizes['webp']:,} B ({100 * sizes['webp'] / sizes['png']:.1f}%)",
        "webp2048": f"WebP 2048 폰 판 · {sizes['webp2048']:,} B ({100 * sizes['webp2048'] / sizes['png']:.1f}%)",
    }
    W = MARGIN * 2 + PW * 3 + GAP * 2

    blocks = []   # (kind, payload, height)
    f_h1, f_h2, f_t, f_s = font(30, True), font(22, True), font(18), font(15)

    head = [
        (f_h1, "관측 구름 WebP 비교 — 사용자 화면(v1 합성) 기준", (235, 240, 245)),
        (f_t, f"NOAA GMGSI 관측 {meta.get('time', '?')} · 운영 clouds/global.png 를 그대로 인코딩(aws/gmgsi-clouds/handler.py encode_variants)",
         (190, 200, 210)),
        (f_t, "알파(구름이 어디 있나)는 세 판 모두 입력과 한 값도 다르지 않다 — 3072 는 PNG 와 완전히 같고, 2048 은 줄인 알파와 완전히 같다.",
         (150, 220, 160)),
        (f_t, "WebP 는 밝기(L)만 손실(q80). 2048 은 폰 전용 후보 — 화면에서 GPU 처럼 쌍선형으로 늘려 그렸다(해상도 차이가 그대로 보인다).",
         (190, 200, 210)),
        (f_s, "바탕: Natural Earth II(v2 자산, v1 의 GIBS 바탕 대역) · 구름 그림자 레이어 생략 · L·A 는 v1 변환표(CLOUD_LUMA_LUT·CLOUD_ALPHA_LUT)와 캔버스 premultiply 왕복까지 적용",
         (140, 150, 160)),
        (f_s, "패널 아래 수치 = 같은 패널의 원본 PNG 합성과 화면 RGB 차이(0~255). 아래 줄은 위 패널의 흰 사각형을 확대한 것.",
         (140, 150, 160)),
        (f_s, "배율 참고: 3072 는 경도 1°에 8.5 texel, 2048 은 5.7 texel. (추정) 폰(폭 390 CSS px · DPR 3)에서 지구 지름이 화면 폭의 절반쯤이면",
         (140, 150, 160)),
        (f_s, "지구 가운데 1° 가 약 5 기기 px — 2048 은 전체 지구 화면에서 이미 겨우 맞는 밀도이고, 확대하는 순간부터 흐려진다.",
         (140, 150, 160)),
    ]
    if rep:
        v = rep["variants"]
        head.append((f_s, "전 지구 밝기 오차(알파>0): 3072 평균 {:.2f} · 99분위 {} · 최대 {}  |  2048 평균 {:.2f} · 99분위 {} · 최대 {}   (0~255)".format(
            v["webp"]["luminance"]["L_err_alpha_gt0"]["mean"], v["webp"]["luminance"]["L_err_alpha_gt0"]["p99"],
            v["webp"]["luminance"]["L_err_alpha_gt0"]["max"],
            v["webp2048"]["luminance"]["L_err_alpha_gt0"]["mean"], v["webp2048"]["luminance"]["L_err_alpha_gt0"]["p99"],
            v["webp2048"]["luminance"]["L_err_alpha_gt0"]["max"]), (140, 150, 160)))

    panels = []
    for title, lon0, lon1, lat0, lat1, zoom in REGIONS:
        box = (lon0, lon1, lat0, lat1)
        ov = {k: render(texs[k], base, north, south, box, PW) for k in cols}
        zm = {k: render(texs[k], base, north, south, zoom, PW) for k in cols}
        panels.append((title, box, zoom, ov, zm))

    head_h = MARGIN + sum(f.size + 12 for f, _, _ in head) + 10
    region_hs = []
    for title, box, zoom, ov, zm in panels:
        h_ov = ov["png"].shape[0]
        h_zm = zm["png"].shape[0]
        region_hs.append(40 + 28 + h_ov + 26 + h_zm + 26 + 34)
    H = head_h + sum(region_hs) + MARGIN

    board = Image.new("RGB", (W, H), (13, 17, 23))
    d = ImageDraw.Draw(board)
    y = MARGIN
    for f, text, col in head:
        d.text((MARGIN, y), text, font=f, fill=col)
        y += f.size + 12
    y += 10

    for (title, box, zoom, ov, zm), rh in zip(panels, region_hs):
        d.line([(MARGIN, y), (W - MARGIN, y)], fill=(48, 56, 66), width=1)
        d.text((MARGIN, y + 8), title, font=f_h2, fill=(235, 240, 245))
        ppd_ov = PW / (box[1] - box[0])
        ppd_zm = PW / (zoom[1] - zoom[0])
        scale = f"화면 배율 — 위 줄 1° 약 {ppd_ov:.0f} px · 아래 줄 1° 약 {ppd_zm:.0f} px"
        tw = d.textlength(scale, font=f_s)
        d.text((W - MARGIN - tw, y + 14), scale, font=f_s, fill=(140, 150, 160))
        y += 40
        for i, k in enumerate(cols):
            x = MARGIN + i * (PW + GAP)
            d.text((x, y), col_title[k], font=f_s, fill=(200, 210, 220))
        y += 28
        for row_name, imgs, sub in (("ov", ov, zoom), ("zm", zm, None)):
            h = imgs["png"].shape[0]
            ref = imgs["png"]
            for i, k in enumerate(cols):
                x = MARGIN + i * (PW + GAP)
                arr = imgs[k]
                board.paste(Image.fromarray(arr.round().astype(np.uint8)), (x, y))
                if sub is not None:
                    lon0, lon1, lat0, lat1 = box
                    zx0 = x + (sub[0] - lon0) / (lon1 - lon0) * PW
                    zx1 = x + (sub[1] - lon0) / (lon1 - lon0) * PW
                    zy0 = y + (lat1 - sub[3]) / (lat1 - lat0) * h
                    zy1 = y + (lat1 - sub[2]) / (lat1 - lat0) * h
                    d.rectangle([zx0, zy0, zx1, zy1], outline=(255, 255, 255), width=1)
                if k == "png":
                    cap = "기준"
                else:
                    diff = np.abs(np.round(arr) - np.round(ref)).max(axis=-1)
                    cap = f"원본과 차이 평균 {diff.mean():.2f} · 99분위 {np.percentile(diff, 99):.0f} · 최대 {diff.max():.0f}"
                d.text((x, y + h + 4), cap, font=f_s, fill=(160, 170, 180))
            y += h + 26
        y += 16

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    board = board.crop((0, 0, W, min(H, y + MARGIN)))
    board.save(a.out, optimize=True)
    print(json.dumps({"out": a.out, "size": board.size, "bytes": os.path.getsize(a.out), "inputs": sizes},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

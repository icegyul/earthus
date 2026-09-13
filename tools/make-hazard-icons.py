# -*- coding: utf-8 -*-
"""EARTHUS 아이콘 — 재난·경보 7종을 같은 재질로 그린다 (아이콘 시스템 v1.3).

왜 새로 그리나
  V1 재난 묶음 8줄 중 넷이 **자기 그림이 없어 남의 것을 빌려 쓰고 있었다**(실측):
      기상경보 → typhoon · 낙뢰 → typhoon · 각국 기관 재해 → storm-surge · 열돔 → temperature
  그래서 메뉴에서 태풍·기상경보·낙뢰 세 줄이 **같은 소용돌이**로 보였다. 낙뢰가 회오리로,
  기상경보가 토네이도로 읽히는 것이 그 때문이다. 빌려 쓰는 대신 각자 그림을 준다.

왜 이 파일이 있나 (손으로 그린 PNG 를 넣지 않는 이유)
  ① 재질·조명·투시가 7종에서 **똑같아야** 한다. 사람이 그리면 어긋난다.
  ② 크기가 4종(24·32·64·110)이고 4종 모두 같은 그림이어야 한다.
  ③ 다시 그릴 일이 생기면 이 파일만 고치면 된다.

기하 — 실측으로 맞춘 것이지 문서에서 베낀 것이 아니다
  · 24 · 32 · 64 : 원이 캔버스를 **꽉 채운다** (bbox = 캔버스, 비율 1.000)
  · 128          : 캔버스가 **110×110** 이고 원 지름 100 (비율 0.909, 여백 5px)
    ⚠️ 파일 이름의 -128 은 거짓말이다. 레지스트리가 그 이름을 정본으로 적고 있어 바꾸지 않는다.

화풍 — v1.2 여덟(uv·aqi·swell…)과 같은 유리구슬
  왼쪽 위에서 빛이 들어오는 짙은 유리구슬 + 위쪽 광택 + 테두리 빛 + 단색 기호 하나.
  v1.0 일곱(tsunami·wildfire…)의 풍경화 화풍은 **따르지 않는다** — 28px 에서 뭉개진다.
  기호는 구슬 지름의 60% 를 넘지 않는다.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT_DIRS = (
    os.path.join(REPO, "prototype", "assets", "earthus-icons"),
    # V2 번들은 이 폴더의 거울이다(tools/build-v2-bundle.sh 가 복사한다).
    # 빌드를 기다리지 않고 같이 써 둔다 — 두 폴더가 어긋나면 V2 가 옛 그림을 쓴다.
    os.path.join(REPO, "prototype", "v2-deploy", "assets", "earthus-icons"),
)

SIZES = (24, 32, 64, 128)
CANVAS = {24: 24, 32: 32, 64: 64, 128: 110}
DIAMETER_RATIO = {24: 1.0, 32: 1.0, 64: 1.0, 128: 100 / 110}
SS = 8                      # 초과표본 배율


# ── 구슬 ────────────────────────────────────────────────────────────────────
def _gradient(size, top_left, bottom_right):
    """왼쪽 위 → 오른쪽 아래 대각 그라디언트. 작게 만들어 키운다(부드럽고 빠르다)."""
    step = 192
    base = Image.new("RGB", (step, step))
    pixels = base.load()
    for y in range(step):
        for x in range(step):
            t = (x + y) / (2.0 * (step - 1))
            t = t ** 0.85                      # 위쪽을 조금 더 밝게 — 유리의 읽힘
            pixels[x, y] = tuple(
                int(round(top_left[i] + (bottom_right[i] - top_left[i]) * t))
                for i in range(3))
    return base.resize((size, size), Image.LANCZOS)


def orb(size, palette):
    """유리구슬 한 개. 재질·조명은 7종이 전부 같은 값을 쓴다."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body = _gradient(size, palette["light"], palette["dark"]).convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    image.paste(body, (0, 0), mask)

    # 안쪽 그림자 — 오른쪽 아래가 가라앉아야 구(球)로 읽힌다
    shade = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse(
        (size * 0.16, size * 0.16, size * 1.10, size * 1.10),
        fill=(0, 0, 0, 66))
    shade = shade.filter(ImageFilter.GaussianBlur(size * 0.10))
    image.alpha_composite(Image.composite(shade, Image.new("RGBA", (size, size),
                                                           (0, 0, 0, 0)), mask))

    # 테두리 빛 — 왼쪽 위만. 한 바퀴 다 두르면 스티커처럼 보인다
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(rim).arc((size * 0.02, size * 0.02, size * 0.98, size * 0.98),
                            start=170, end=340,
                            fill=palette["rim"] + (225,), width=max(2, int(size * 0.035)))
    rim = rim.filter(ImageFilter.GaussianBlur(size * 0.012))
    image.alpha_composite(Image.composite(rim, Image.new("RGBA", (size, size),
                                                         (0, 0, 0, 0)), mask))

    # 반사광 — 오른쪽 아래 테두리. 기존 여덟(uv·swell·aqi)이 갖고 있는 빛이고,
    # 이것이 없으면 구슬이 아니라 납작한 원판으로 보인다.
    bounce = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(bounce).arc((size * 0.03, size * 0.03, size * 0.97, size * 0.97),
                               start=18, end=142,
                               fill=palette["rim"] + (150,),
                               width=max(2, int(size * 0.028)))
    bounce = bounce.filter(ImageFilter.GaussianBlur(size * 0.020))
    image.alpha_composite(Image.composite(bounce, Image.new("RGBA", (size, size),
                                                            (0, 0, 0, 0)), mask))

    # 광택 — 위쪽의 부드러운 타원 하나
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse((size * 0.17, size * 0.07, size * 0.74, size * 0.36),
                                  fill=(255, 255, 255, 105))
    gloss = gloss.filter(ImageFilter.GaussianBlur(size * 0.035))
    image.alpha_composite(Image.composite(gloss, Image.new("RGBA", (size, size),
                                                           (0, 0, 0, 0)), mask))
    return image


# ── 기호 ────────────────────────────────────────────────────────────────────
# 좌표는 전부 0~1 정규화. 어떤 크기에서도 같은 그림이 되도록.
def _xy(box, x, y):
    left, top, width = box
    return (left + x * width, top + y * width)


def _poly(draw, box, points, fill):
    draw.polygon([_xy(box, x, y) for x, y in points], fill=fill)


def sym_live_alert(layer, box, ink, accent):
    """실시간 — 맥박(퍼지는 고리) + 중심 점. 회전체가 아니라 '살아 있다'로 읽혀야 한다."""
    draw = ImageDraw.Draw(layer)
    _, _, width = box
    cx, cy = _xy(box, 0.5, 0.5)
    for index, (radius, alpha, thickness) in enumerate(
            ((0.20, 255, 0.075), (0.33, 150, 0.060), (0.455, 80, 0.048))):
        r = radius * width
        draw.arc((cx - r, cy - r, cx + r, cy + r), start=0, end=360,
                 fill=ink[:3] + (alpha,), width=max(1, int(thickness * width)))
    r = 0.095 * width
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=accent)


def _disc(mask_draw, box, cx, cy, r, value):
    x, y = _xy(box, cx, cy)
    rr = r * box[2]
    mask_draw.ellipse((x - rr, y - rr, x + rr, y + rr), fill=value)


def sym_tsunami(layer, box, ink, accent):
    """쓰나미 — **말려 부서지는 큰 물마루 하나**.

    ⚠️ 두 번 실패하고 세 번째다. 손으로 찍은 꼭짓점은 24px 에서 갈고리로,
       좌우 대칭 sin 언덕은 **산봉우리**로 보였다. 파도가 산과 다른 점은 하나다 —
       배(barrel)가 파여 있고 마루가 앞으로 넘어간다. 그래서 원을 빼서 깎는다.
    잔물결(swell, 가는 물결 둘)과 한눈에 구분되어야 한다: 이쪽은 큰 덩어리 하나다.
    """
    size = layer.size[0]
    shape = Image.new("L", (size, size), 0)
    carve = Image.new("L", (size, size), 0)
    shape_draw, carve_draw = ImageDraw.Draw(shape), ImageDraw.Draw(carve)

    _disc(shape_draw, box, 0.470, 0.455, 0.345, 255)       # 파도 덩어리
    _disc(carve_draw, box, 0.605, 0.640, 0.275, 255)       # 배를 판다 — 오른쪽 아래
    _disc(carve_draw, box, 0.185, 0.905, 0.230, 255)       # 뒤쪽 아래를 깎아 세운다
    shape_draw.bitmap((0, 0), carve, fill=0)

    # 앞으로 넘어가는 입술 — 덩어리 끝에 붙는 둥근 혀
    _disc(shape_draw, box, 0.700, 0.300, 0.120, 255)
    # 바다 선
    left, top, width = box
    shape_draw.rounded_rectangle(
        (left + 0.02 * width, top + 0.855 * width,
         left + 0.98 * width, top + 0.965 * width),
        radius=0.062 * width, fill=255)

    body = Image.new("RGBA", (size, size), ink)
    layer.paste(body, (0, 0), shape)

    # 물거품 — 마루 능선 위에만 짧게
    foam = Image.new("L", (size, size), 0)
    foam_draw = ImageDraw.Draw(foam)
    cx, cy = _xy(box, 0.470, 0.455)
    r = 0.290 * width
    foam_draw.arc((cx - r, cy - r, cx + r, cy + r), start=212, end=336,
                  fill=255, width=max(1, int(0.095 * width)))
    foam = Image.composite(foam, Image.new("L", (size, size), 0), shape)
    layer.paste(Image.new("RGBA", (size, size), accent), (0, 0), foam)


def sym_wildfire(layer, box, ink, accent):
    """산불 — 큰 불꽃 하나 + 뒤로 오르는 연기 뭉치. 나무·풍경을 그리지 않는다."""
    draw = ImageDraw.Draw(layer)
    _, _, width = box
    # 연기 — 불꽃 뒤 오른쪽 위. 옅은 동그라미 셋이면 24px 에서도 연기로 읽힌다
    for cx, cy, r, alpha in ((0.685, 0.265, 0.105, 105), (0.795, 0.155, 0.082, 80),
                             (0.870, 0.072, 0.058, 58)):
        x, y = _xy(box, cx, cy)
        rr = r * width
        draw.ellipse((x - rr, y - rr, x + rr, y + rr), fill=ink[:3] + (alpha,))
    # 불꽃 — 아래가 넓고 위가 한 점으로 모이는 덩어리
    flame = [(0.46, 0.08), (0.585, 0.30), (0.66, 0.235), (0.715, 0.45),
             (0.715, 0.66), (0.60, 0.845), (0.40, 0.875), (0.255, 0.745),
             (0.235, 0.545), (0.325, 0.345), (0.375, 0.44), (0.395, 0.245)]
    _poly(draw, box, flame, ink)
    # 속불 — 한 가지 강조색만
    inner = [(0.475, 0.425), (0.585, 0.60), (0.565, 0.755), (0.445, 0.795),
             (0.355, 0.695), (0.375, 0.565)]
    _poly(draw, box, inner, accent)


def sym_weather_alert(layer, box, ink, accent):
    """기상경보 — 구름 + 느낌표. 소용돌이·토네이도로 읽히면 안 된다."""
    draw = ImageDraw.Draw(layer)
    _, _, width = box
    for cx, cy, r in ((0.275, 0.375, 0.175), (0.505, 0.285, 0.225), (0.735, 0.395, 0.165)):
        x, y = _xy(box, cx, cy)
        rr = r * width
        draw.ellipse((x - rr, y - rr, x + rr, y + rr), fill=ink)
    _poly(draw, box, [(0.10, 0.375), (0.90, 0.375), (0.90, 0.545), (0.10, 0.545)], ink)
    # 느낌표 — 구름 아래, 굵고 짧게. 세로로 길면 24px 에서 획 하나로 뭉친다
    _poly(draw, box, [(0.435, 0.615), (0.565, 0.615), (0.540, 0.815), (0.460, 0.815)], accent)
    x, y = _xy(box, 0.50, 0.915)
    rr = 0.070 * width
    draw.ellipse((x - rr, y - rr, x + rr, y + rr), fill=accent)


def sym_lightning(layer, box, ink, accent):
    """낙뢰 — 굵은 번개 하나. **회오리를 쓰지 않는다.**"""
    draw = ImageDraw.Draw(layer)
    bolt = [(0.58, 0.10), (0.30, 0.52), (0.46, 0.52), (0.36, 0.90),
            (0.70, 0.44), (0.52, 0.44), (0.62, 0.10)]
    _poly(draw, box, bolt, ink)
    _poly(draw, box, [(0.56, 0.16), (0.38, 0.48), (0.48, 0.48), (0.44, 0.62)], accent)


def sym_agency_hazard(layer, box, ink, accent):
    """각국 기관 재해 — 지구(자오선) + 경고 고리. 바다·건물을 그리지 않는다."""
    draw = ImageDraw.Draw(layer)
    _, _, width = box
    cx, cy = _xy(box, 0.5, 0.5)
    ring = 0.455 * width
    draw.arc((cx - ring, cy - ring, cx + ring, cy + ring), start=0, end=360,
             fill=accent, width=max(1, int(0.070 * width)))
    globe = 0.305 * width
    draw.ellipse((cx - globe, cy - globe, cx + globe, cy + globe),
                 outline=ink, width=max(1, int(0.055 * width)))
    draw.line([(cx - globe, cy), (cx + globe, cy)], fill=ink,
              width=max(1, int(0.050 * width)))
    meridian = globe * 0.52
    draw.ellipse((cx - meridian, cy - globe, cx + meridian, cy + globe),
                 outline=ink, width=max(1, int(0.045 * width)))


def sym_heat_dome(layer, box, ink, accent):
    """열돔 — **갇힌 열**: 열을 덮는 돔 + 그 아래 강한 해 + 빠져나가지 못하는 열 띠 둘.

    ⚠️ 처음엔 해 + 뻗는 빛살로 그렸다가 기존 `uv`(해 + 긴 빛살)와 **형태가 겹쳤다**.
       겹치면 메뉴에서 두 줄이 같은 그림이 된다. 열돔을 열돔이게 하는 것은 빛살이 아니라
       **덮개**다 — 그래서 돔을 silhouette 의 주인공으로 두고 빛살을 뺐다.
    """
    draw = ImageDraw.Draw(layer)
    _, _, width = box
    # 돔 — 위를 덮는 두꺼운 반원 테
    cx, cy = _xy(box, 0.50, 0.545)
    r = 0.435 * width
    draw.arc((cx - r, cy - r, cx + r, cy + r), start=182, end=358,
             fill=ink, width=max(1, int(0.085 * width)))
    # 해 — 돔 안에 갇힌 덩어리 하나. 빛살을 그리지 않는다(uv 와 겹친다)
    sx, sy = _xy(box, 0.50, 0.385)
    sr = 0.165 * width
    draw.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=ink)
    # 열 띠 — 돔 아래 갇혀 흐르는 두 줄
    for y in (0.685, 0.835):
        points = []
        for step in range(41):
            k = step / 40.0
            points.append(_xy(box, 0.175 + k * 0.65,
                              y + math.sin(k * math.pi * 2.1) * 0.042))
        draw.line(points, fill=accent, width=max(1, int(0.070 * width)), joint="curve")


# ── 7종 정의 ────────────────────────────────────────────────────────────────
# ink = 주 기호색 · accent = 강조(한 가지만) · light/dark = 구슬 · rim = 테두리 빛
ICONS = {
    "live-alert": {
        "ko": "실시간 경보", "en": "Live alert",
        "palette": {"light": (86, 120, 255), "dark": (18, 22, 120), "rim": (150, 185, 255)},
        "ink": (255, 255, 255, 255), "accent": (255, 214, 92, 255), "symbol": sym_live_alert,
    },
    "tsunami": {
        "ko": "쓰나미", "en": "Tsunami",
        "palette": {"light": (58, 176, 250), "dark": (2, 48, 150), "rim": (150, 226, 255)},
        "ink": (255, 255, 255, 255), "accent": (186, 240, 255, 255), "symbol": sym_tsunami,
    },
    "wildfire": {
        "ko": "산불", "en": "Wildfire",
        "palette": {"light": (255, 190, 84), "dark": (206, 46, 16), "rim": (255, 226, 174)},
        "ink": (255, 241, 214, 255), "accent": (255, 186, 64, 255), "symbol": sym_wildfire,
    },
    "weather-alert": {
        "ko": "기상경보", "en": "Weather alert",
        "palette": {"light": (92, 150, 236), "dark": (16, 44, 122), "rim": (162, 205, 255)},
        "ink": (240, 247, 255, 255), "accent": (255, 200, 64, 255), "symbol": sym_weather_alert,
    },
    "lightning-strike": {
        "ko": "낙뢰", "en": "Lightning",
        "palette": {"light": (126, 104, 250), "dark": (34, 18, 112), "rim": (188, 172, 255)},
        "ink": (255, 226, 92, 255), "accent": (255, 252, 214, 255), "symbol": sym_lightning,
    },
    "agency-hazard": {
        "ko": "각국 기관 재해", "en": "National agency hazards",
        "palette": {"light": (58, 186, 196), "dark": (10, 56, 96), "rim": (156, 236, 240)},
        "ink": (238, 252, 255, 255), "accent": (255, 176, 70, 255), "symbol": sym_agency_hazard,
    },
    "heat-dome": {
        "ko": "열돔", "en": "Heat dome",
        "palette": {"light": (255, 208, 104), "dark": (222, 62, 44), "rim": (255, 234, 182)},
        "ink": (255, 240, 198, 255), "accent": (255, 120, 72, 255), "symbol": sym_heat_dome,
    },
}


def render(slug, size):
    canvas = CANVAS[size]
    diameter = int(round(canvas * DIAMETER_RATIO[size]))
    big = diameter * SS
    spec = ICONS[slug]

    image = orb(big, spec["palette"])
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    # 기호 상자 — 구슬 지름의 60%
    side = big * 0.60
    box = ((big - side) / 2.0, (big - side) / 2.0, side)
    spec["symbol"](layer, box, spec["ink"], spec["accent"])

    # 기호에 아주 옅은 그림자 — 유리 위에 떠 있게
    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), (0, int(big * 0.012)), layer.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(big * 0.012))
    image.alpha_composite(shadow)
    image.alpha_composite(layer)

    # 구슬 밖으로 새지 않게 한 번 더 자른다
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    image.putalpha(Image.composite(image.split()[3], Image.new("L", (big, big), 0), mask))

    small = image.resize((diameter, diameter), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    offset = (canvas - diameter) // 2
    out.alpha_composite(small, (offset, offset))
    return out


def main(argv=None):
    argv = list(argv if argv is not None else sys.argv[1:])
    only = set(argv) or set(ICONS)
    written = []
    for slug in sorted(only):
        if slug not in ICONS:
            raise SystemExit("모르는 아이콘: %s" % slug)
        for size in SIZES:
            image = render(slug, size)
            for directory in OUT_DIRS:
                if not os.path.isdir(directory):
                    continue
                path = os.path.join(directory, "earthus-icon-%s-%d.png" % (slug, size))
                image.save(path, "PNG", optimize=True)
                written.append(path)
    for path in written:
        print("  ·", os.path.relpath(path, REPO).replace("\\", "/"),
              os.path.getsize(path), "bytes")
    print("총 %d개 파일" % len(written))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

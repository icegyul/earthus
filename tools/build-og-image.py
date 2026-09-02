# EARTHUS v2 공유 카드(OG) 이미지 생성 — 1200x630
#
# 왜: 링크를 만들어도 og:image가 없으면 카카오톡·슬랙·트위터에 빈 카드로 뜬다.
# 재료는 앱이 실제로 쓰는 베이스맵(Natural Earth II)이라 없는 그림을 지어내지 않는다.
#
# 사용: python tools/build-og-image.py

import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'prototype', 'v2', 'assets', 'physical-earth', 'ne2-base-8192.jpg')
OUT = os.path.join(ROOT, 'prototype', 'v2-three', 'assets', 'brand', 'og-earthus-v2.jpg')
W, H = 1200, 630

Image.MAX_IMAGE_PIXELS = None


def font(size, bold=False):
    for name in (('malgunbd.ttf', 'malgun.ttf') if bold else ('malgun.ttf',)):
        p = os.path.join('C:\\Windows\\Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    base = Image.open(SRC).convert('RGB')
    # 동아시아~태평양이 가운데 오도록 자른다 (앱 첫 화면과 같은 방향)
    bw, bh = base.size
    cx = int(bw * (118 + 180) / 360)          # 경도 118E
    cy = int(bh * (90 - 26) / 180)            # 위도 26N
    half_w = int(bw * 0.17)
    half_h = int(half_w * H / W)
    # 지도 밖으로 나가면 PIL이 검게 채운다 — 가장자리에 물리도록 밀어 넣는다
    cx = max(half_w, min(bw - half_w, cx))
    cy = max(half_h, min(bh - half_h, cy))
    box = (cx - half_w, cy - half_h, cx + half_w, cy + half_h)
    crop = base.crop(box).resize((W, H), Image.LANCZOS)

    # 어둡게 깔고 아래쪽으로 더 어둡게 — 글자가 읽히도록
    img = Image.blend(crop, Image.new('RGB', (W, H), (3, 6, 8)), 0.42)
    grad = Image.new('L', (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel((0, y), int(40 + 165 * (t ** 1.7)))
    veil = Image.new('RGB', (W, H), (3, 6, 8))
    img = Image.composite(veil, img, grad.resize((W, H)))

    glow = img.filter(ImageFilter.GaussianBlur(28))
    img = Image.blend(img, glow, 0.18)

    d = ImageDraw.Draw(img)
    # 워드마크: 브랜드 자간 그대로 한 글자씩
    title, x, y = 'EARTHUS', 72, 372
    f_title = font(74, bold=True)
    for ch in title:
        d.text((x, y), ch, font=f_title, fill=(244, 238, 233))
        x += d.textlength(ch, font=f_title) + 15

    d.text((74, 470), '지금 지구의 날씨 · 바다 · 재난을 실데이터로',
           font=font(28), fill=(207, 224, 238))
    d.text((74, 516), '25년치 지진 18만 건 · 실시간 관측 레이어 · 인구 데이터 조각',
           font=font(21), fill=(127, 149, 168))
    d.text((74, 560), 'earthus.net/v2', font=font(20, bold=True), fill=(127, 183, 245))

    img.save(OUT, 'JPEG', quality=88, optimize=True)
    print(f'{OUT} — {os.path.getsize(OUT) // 1024}KB {W}x{H}')


if __name__ == '__main__':
    main()

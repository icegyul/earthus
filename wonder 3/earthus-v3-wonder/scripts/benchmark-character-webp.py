# -*- coding: utf-8 -*-
"""EARTHUS V3 WONDER — 124종 캐릭터 WebP 변환 기준을 정하기 위한 벤치마크 (DECISION LOCK 4)

대표 3종(folklore 1 · prehistoric 1 · animal 1)을 품질×해상도 격자로 변환해 크기·PSNR 을 재고,
같은 부위를 1:1 로 잘라 붙인 접촉 시트를 만든다. 원본 PNG 는 **읽기만** 한다. 결과는 content/ 밖
benchmarks/ 에만 쓴다(레지스트리가 content/ 를 걸어 다니므로 벤치마크 산출물을 자산으로 오인하지 않게).

  python scripts/benchmark-character-webp.py --slugs haetae tyrannosaurus red-panda
"""
import argparse, io, json, math, os, sys, time
from PIL import Image, ImageDraw
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8')
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
DEFAULT_SOURCE = os.path.abspath(os.path.join(ROOT, '..', '..', 'prototype', 'v3-paper', 'pack124'))
OUT = os.path.join(ROOT, 'benchmarks', 'character-webp')

ap = argparse.ArgumentParser()
ap.add_argument('--source', default=DEFAULT_SOURCE)
ap.add_argument('--slugs', nargs='+', required=True)
ap.add_argument('--char-sizes', nargs='+', type=int, default=[1024, 768, 512])
ap.add_argument('--scene-widths', nargs='+', type=int, default=[1536, 1024, 768])
ap.add_argument('--qualities', nargs='+', type=int, default=[75, 85, 92])
a = ap.parse_args()
os.makedirs(OUT, exist_ok=True)

import numpy as np

def psnr(a_img, b_img, mask=None):
    """RGB PSNR(dB). mask 가 있으면 alpha>0 인 픽셀만 (투명 영역의 색은 보이지 않으므로 빼야 공정하다)."""
    aa = np.asarray(a_img.convert('RGB'), dtype=np.float64); bb = np.asarray(b_img.convert('RGB'), dtype=np.float64)
    d2 = (aa - bb) ** 2
    if mask is not None:
        m = np.asarray(mask) > 0
        d2 = d2[m]
    mse = d2.mean() if d2.size else 0
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)

def alpha_psnr(a_img, b_img):
    aa = np.asarray(a_img.getchannel('A'), dtype=np.float64); bb = np.asarray(b_img.getchannel('A'), dtype=np.float64)
    mse = ((aa - bb) ** 2).mean()
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)

def encode(im, q):
    buf = io.BytesIO(); t = time.time(); im.save(buf, 'WEBP', quality=q, method=6); dt = time.time() - t
    return buf.getvalue(), dt

results = []; crops = []   # crops: (label, PIL 256x256)
for slug in a.slugs:
    cp = os.path.join(a.source, 'characters', f'{slug}.png'); sp = os.path.join(a.source, 'scenes', f'{slug}_scene.png')
    if not (os.path.exists(cp) and os.path.exists(sp)): print(f'✗ 원본 없음: {slug}', file=sys.stderr); sys.exit(2)
    src = Image.open(cp).convert('RGBA'); src_bytes = os.path.getsize(cp)
    # 알파 경계(캐릭터가 실제로 차지하는 영역) — 얼굴 부근 1:1 비교용 자름 위치
    bbox = src.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    face = (bbox[0] + (bbox[2] - bbox[0]) // 2, bbox[1] + (bbox[3] - bbox[1]) // 5)  # 가로 중앙, 세로 위 1/5
    for size in a.char_sizes:
        ref = src if size == src.width else src.resize((size, size), Image.LANCZOS)
        mask = ref.getchannel('A').point(lambda v: 255 if v > 0 else 0)
        for q in a.qualities:
            data, dt = encode(ref, q)
            dec = Image.open(io.BytesIO(data)).convert('RGBA')
            r = dict(slug=slug, kind='character', size=f'{size}x{size}', quality=q, bytes=len(data), kb=round(len(data) / 1024, 1),
                     ratio=round(src_bytes / len(data), 1), psnr_rgb=round(psnr(ref, dec, mask), 2), psnr_alpha=round(alpha_psnr(ref, dec), 2), encode_s=round(dt, 2))
            results.append(r)
            with open(os.path.join(OUT, f'{slug}_{size}_q{q}.webp'), 'wb') as f: f.write(data)
            # 1:1 자름(원본 좌표계의 얼굴 부근 256px 을 각 해상도에서 같은 물리 영역으로) → 화면에 같은 크기로 보일 때의 차이
            s = size / src.width; fx, fy = int(face[0] * s), int(face[1] * s); half = int(128 * s)
            crop = dec.crop((fx - half, fy - half, fx + half, fy + half)).resize((256, 256), Image.NEAREST if s < 1 else Image.LANCZOS)
            crops.append((f'{slug} {size} q{q} {r["kb"]}KB', crop))
        print(f'  {slug:16s} character {size:4d}: ' + ' · '.join(f'q{x["quality"]} {x["kb"]}KB/{x["psnr_rgb"]}dB' for x in results if x['slug'] == slug and x['kind'] == 'character' and x['size'].startswith(str(size))))
    scene = Image.open(sp).convert('RGB'); scene_bytes = os.path.getsize(sp)
    for w in a.scene_widths:
        h = round(scene.height * w / scene.width)
        ref = scene if w == scene.width else scene.resize((w, h), Image.LANCZOS)
        for q in a.qualities[:2]:
            data, dt = encode(ref, q)
            dec = Image.open(io.BytesIO(data)).convert('RGB')
            r = dict(slug=slug, kind='scene', size=f'{w}x{h}', quality=q, bytes=len(data), kb=round(len(data) / 1024, 1),
                     ratio=round(scene_bytes / len(data), 1), psnr_rgb=round(psnr(ref, dec), 2), psnr_alpha=None, encode_s=round(dt, 2))
            results.append(r)
            with open(os.path.join(OUT, f'{slug}_scene_{w}_q{q}.webp'), 'wb') as f: f.write(data)
        print(f'  {slug:16s} scene     {w:4d}: ' + ' · '.join(f'q{x["quality"]} {x["kb"]}KB/{x["psnr_rgb"]}dB' for x in results if x['slug'] == slug and x['kind'] == 'scene' and x['size'].startswith(str(w))))

# 접촉 시트: 행 = slug, 열 = size×quality (얼굴 부근 1:1)
cols = len(a.char_sizes) * len(a.qualities); rows = len(a.slugs)
sheet = Image.new('RGB', (cols * 260, rows * 280), 'white'); d = ImageDraw.Draw(sheet)
for i, (label, crop) in enumerate(crops):
    x = (i % cols) * 260; y = (i // cols) * 280
    sheet.paste(crop.convert('RGB'), (x + 2, y + 20)); d.text((x + 4, y + 4), label, fill='black')
sheet.save(os.path.join(OUT, 'contact-sheet.png'))
json.dump(dict(generated_at=time.strftime('%Y-%m-%d %H:%M'), source=a.source, slugs=a.slugs, results=results), open(os.path.join(OUT, 'results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'✓ {len(results)} 변형, {OUT}')

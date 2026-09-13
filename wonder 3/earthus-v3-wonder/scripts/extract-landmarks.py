# -*- coding: utf-8 -*-
"""EARTHUS V3 WONDER — 지역 랜드마크 그림 반입 (PHASE 1-B)

기존 v3-paper 의 세계 지형 아틀라스(사내 ComfyUI 생성, 2026-09-07, 마젠타 키 배경)에서 셀을 잘라
알파 처리한 WebP 로 content/landmarks/ 에 넣는다. 원본 PNG 는 읽기만 한다. 새 지형을 만들어 내지 않는다 —
있는 그림을 그대로 쓴다("가짜 정밀 지형 금지").

  python scripts/extract-landmarks.py
"""
import json, os, sys, time
from PIL import Image
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8')
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
ASSETS = os.path.abspath(os.path.join(ROOT, '..', '..', 'prototype', 'v3-paper', 'assets'))
OUT = os.path.join(ROOT, 'content', 'landmarks')
CELL = 512
# [id, 아틀라스 파일, 열수, 셀, 원본 카탈로그 라벨, 출처 URL(원본 world-catalog.js 의 sourceUrls)]
LANDMARKS = [
    ('himalaya', 'world-terrain-atlas.png', 4, 0,  '히말라야산맥',   'https://en.wikipedia.org/wiki/Himalayas'),
    ('savanna',  'world-nature-atlas.png',  4, 10, '세렝게티 초원',  'https://en.wikipedia.org/wiki/Serengeti'),
    ('amazon',   'world-nature-atlas.png',  4, 2,  '아마존 열대우림', 'https://en.wikipedia.org/wiki/Amazon_rainforest'),
]

def key_alpha(rgba):
    """마젠타(255,0,255) 키 → 알파. 키에 가까울수록 투명. 가장자리의 분홍 번짐 픽셀은 이웃한 '진짜' 색의 평균으로 덮는다(unmatte)."""
    px = rgba.load(); w, h = rgba.size
    pink = lambda r, g, b: r > 140 and b > 140 and g < 150 and (r - g) > 50
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = max(abs(r - 255), abs(g - 0), abs(b - 255))      # 키와의 채널 최대 거리
            if d < 70: px[x, y] = (r, g, b, 0)
            elif d < 130: px[x, y] = (r, g, b, int(255 * (d - 70) / 60))
    # 2차: 반투명이거나 분홍기가 남은 픽셀은 반경 3 안의 불투명·비분홍 이웃 평균색으로
    src = rgba.copy(); sp = src.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a == 0 or not (a < 255 or pink(r, g, b)): continue
            rs = gs = bs = n = 0
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h:
                        r2, g2, b2, a2 = sp[xx, yy]
                        if a2 == 255 and not pink(r2, g2, b2): rs += r2; gs += g2; bs += b2; n += 1
            if n: px[x, y] = (rs // n, gs // n, bs // n, a if not pink(r, g, b) else min(a, 255))
            else: px[x, y] = (r, g, b, 0)
    return rgba

os.makedirs(OUT, exist_ok=True)
manifest = {'_note': 'v3-paper 세계 지형 아틀라스(사내 생성 그림, 2026-09-07)에서 잘라 온 지역 랜드마크. 지형의 대표 중심 그림이지 실제 면적·경계가 아니다. 원본은 prototype/v3-paper/assets/ 에 그대로 있다.',
            'generated_at': time.strftime('%Y-%m-%d %H:%M'), 'items': {}}
for id_, atlas, cols, cell, label, url in LANDMARKS:
    src = os.path.join(ASSETS, atlas)
    if not os.path.exists(src): print(f'✗ 원본 없음: {src}', file=sys.stderr); sys.exit(2)
    im = Image.open(src).convert('RGBA')
    cx, cy = (cell % cols) * CELL, (cell // cols) * CELL
    tile = key_alpha(im.crop((cx, cy, cx + CELL, cy + CELL)))
    bbox = tile.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox: tile = tile.crop(bbox)
    dst = os.path.join(OUT, f'{id_}.webp')
    tile.save(dst, 'WEBP', quality=85, method=6)
    manifest['items'][id_] = {'path': f'landmarks/{id_}.webp', 'label': label, 'atlas': f'prototype/v3-paper/assets/{atlas}', 'cell': cell, 'size': list(tile.size), 'bytes': os.path.getsize(dst), 'source_url': url,
                              'note': '겹종이 그림. 실제 크기·경계 아님'}
    print(f'  {id_:10s} {atlas} cell {cell:2d} → {tile.size[0]}×{tile.size[1]} {os.path.getsize(dst)//1024}KB ({label})')
json.dump(manifest, open(os.path.join(OUT, 'landmarks.json'), 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)   # LF 고정 — CRLF 면 체크아웃 뒤 레지스트리 sha256 이 어긋난다
print(f'✓ {len(LANDMARKS)} 랜드마크 → {OUT}  (landmarks.json)')
print('  다음: node scripts/build-registry.mjs')

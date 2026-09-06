# -*- coding: utf-8 -*-
"""v3 종이 지구 — assets/*.png 를 WebP(품질 85)로 변환한다. 배포 전에 한 번 돈다(aws/deploy-v3-paper.sh 가 부른다).

왜: 2026-09-07 실측으로 v3 첫 접속 52MB 중 34MB 가 PNG 였다. PNG 는 CloudFront 브로틀리가 못 줄이고,
    같은 그림을 WebP 85 로 바꾸면 3.7MB → 0.5MB 처럼 1/7 로 준다(무손실 WebP 는 28% 뿐이라 안 쓴다).
규칙:
  · 원본 PNG 는 그대로 둔다(제작 원본). 배포에는 .webp 만 올린다(deploy 스크립트가 assets/*.png 를 제외).
  · 소스(src/*.js, index.html)는 .webp 를 참조한다. 새 그림을 넣을 때도 PNG 로 넣고 이 스크립트를 돌리면 된다.
  · 이미 최신이면(webp 가 png 보다 새로우면) 건너뛴다.
  · 알파가 있는 PNG 는 알파를 유지한다. 키(마젠타) 아틀라스는 RGB 그대로다.
사용: python tools/v3-webp.py [--force]
"""
import os, sys, time
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prototype', 'v3-paper', 'assets')
QUALITY = 85
force = '--force' in sys.argv
total_png = total_webp = n = 0
for name in sorted(os.listdir(ROOT)):
    if not name.lower().endswith('.png'):
        continue
    src = os.path.join(ROOT, name)
    dst = os.path.join(ROOT, name[:-4] + '.webp')
    if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        total_png += os.path.getsize(src); total_webp += os.path.getsize(dst); n += 1
        continue
    im = Image.open(src)
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if has_alpha else 'RGB')
    t0 = time.time()
    im.save(dst, 'WEBP', quality=QUALITY, method=6)
    total_png += os.path.getsize(src); total_webp += os.path.getsize(dst); n += 1
    print(f"  {name:40s} {os.path.getsize(src)//1024:6d}KB -> {os.path.getsize(dst)//1024:5d}KB  {time.time()-t0:4.1f}s{'  (alpha)' if has_alpha else ''}")
print(f"webp {n}장  PNG {total_png//1048576}MB -> WebP {total_webp//1048576}MB")

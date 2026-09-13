# -*- coding: utf-8 -*-
"""EARTHUS V3 WONDER — 124종 캐릭터 PNG → WebP 런타임 자산 변환기

PD DECISION LOCK 2026-09-13 §4 (WEBP BASELINE, APPROVED):
  Character 1024px / WebP / quality 85     Scene 1024px / WebP / quality 85
  · 원본 PNG 는 절대 삭제하지 않는다. 원본(source)과 런타임(runtime)을 분리한다.
  · q85 는 절대 강제값이 아니다 — 자산별 예외는 content/characters/runtime-overrides.json 에 적는다.

분리 방식 (194MB PNG 를 새 프로젝트로 복사하지 않는다 — CLEANUP 지시서 §12):
  source  = 기존 pack124 PNG (읽기만). 어떤 파일을 읽었는지는 content/characters/source/source-manifest.json 에
            경로·바이트·sha256 으로 기록한다(출처 증명, 사본 아님).
  runtime = content/characters/runtime/{slug}.webp · {slug}_scene.webp

  python scripts/convert-characters-webp.py                 # 124종 전부 (이미 기준에 맞는 파일은 건너뜀)
  python scripts/convert-characters-webp.py --only yeti     # 일부
  python scripts/convert-characters-webp.py --force         # 전부 다시
"""
import argparse, hashlib, json, os, sys, time
from PIL import Image
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8')
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
DEFAULT_SOURCE = os.path.abspath(os.path.join(ROOT, '..', '..', 'prototype', 'v3-paper', 'pack124'))
RUNTIME = os.path.join(ROOT, 'content', 'characters', 'runtime')
SOURCE_DIR = os.path.join(ROOT, 'content', 'characters', 'source')
OVERRIDES = os.path.join(ROOT, 'content', 'characters', 'runtime-overrides.json')
BASELINE = {'character': {'max': 1024, 'quality': 85}, 'scene': {'max': 1024, 'quality': 85}}

ap = argparse.ArgumentParser()
ap.add_argument('--source', default=DEFAULT_SOURCE)
ap.add_argument('--only', action='append', default=[])
ap.add_argument('--force', action='store_true')
ap.add_argument('--method', type=int, default=6)
a = ap.parse_args()

chars_dir = os.path.join(a.source, 'characters'); scenes_dir = os.path.join(a.source, 'scenes')
if not (os.path.isdir(chars_dir) and os.path.isdir(scenes_dir)):
    print(f'✗ 원본을 못 찾았다: {a.source} (characters/, scenes/ 필요)', file=sys.stderr); sys.exit(2)
os.makedirs(RUNTIME, exist_ok=True); os.makedirs(SOURCE_DIR, exist_ok=True)
overrides = json.load(open(OVERRIDES, encoding='utf-8')) if os.path.exists(OVERRIDES) else {'_note': '', 'overrides': {}}
ov = overrides.get('overrides', {})

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()

def setting(slug, kind):
    s = dict(BASELINE[kind]); s.update(ov.get(slug, {}).get(kind, {})); return s

def is_current(dst, src, want_w):
    """이미 기준에 맞는 파일인가: png 보다 새롭고 폭이 목표와 같으면 건너뛴다."""
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src): return False
    try:
        with Image.open(dst) as im: return im.width == want_w
    except Exception: return False

slugs = sorted(f[:-4] for f in os.listdir(chars_dir) if f.endswith('.png'))
if a.only:
    missing = [s for s in a.only if s not in slugs]
    if missing: print(f'✗ 원본에 없는 slug: {missing}', file=sys.stderr); sys.exit(2)
    slugs = [s for s in slugs if s in a.only]

t0 = time.time(); n_done = n_skip = 0; png_bytes = webp_bytes = 0
src_manifest = {'_note': '런타임 WebP 의 원본 PNG 기록 — 사본이 아니라 출처 증명. 원본은 여기 적힌 경로에 그대로 있고 삭제하지 않는다.',
                'source_root': a.source, 'generated_at': time.strftime('%Y-%m-%d %H:%M'), 'baseline': BASELINE, 'entries': {}}
existing = json.load(open(os.path.join(SOURCE_DIR, 'source-manifest.json'), encoding='utf-8'))['entries'] if os.path.exists(os.path.join(SOURCE_DIR, 'source-manifest.json')) else {}

def convert(slug, kind, src, dst, mode):
    global n_done, n_skip, png_bytes, webp_bytes
    st = setting(slug, kind)
    with Image.open(src) as im0:
        w0, h0 = im0.size
        want_w = min(st['max'], w0)
        if not a.force and is_current(dst, src, want_w):
            n_skip += 1; png_bytes += os.path.getsize(src); webp_bytes += os.path.getsize(dst); return 'skip'
        im = im0.convert(mode)
        if want_w < w0:
            im = im.resize((want_w, round(h0 * want_w / w0)), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=st['quality'], method=a.method)
    n_done += 1; png_bytes += os.path.getsize(src); webp_bytes += os.path.getsize(dst)
    return f'{os.path.getsize(src)//1024}KB→{os.path.getsize(dst)//1024}KB q{st["quality"]}' + (' *override' if slug in ov and kind in ov[slug] else '')

for s in slugs:
    cp = os.path.join(chars_dir, f'{s}.png'); sp = os.path.join(scenes_dir, f'{s}_scene.png')
    r1 = convert(s, 'character', cp, os.path.join(RUNTIME, f'{s}.webp'), 'RGBA')
    r2 = convert(s, 'scene', sp, os.path.join(RUNTIME, f'{s}_scene.webp'), 'RGB')
    for kind, p in (('character', cp), ('scene', sp)):
        key = f'{s}:{kind}'
        prev = existing.get(key)
        if prev and prev.get('bytes') == os.path.getsize(p) and prev.get('mtime') == os.path.getmtime(p):
            src_manifest['entries'][key] = prev
        else:
            src_manifest['entries'][key] = {'path': os.path.relpath(p, a.source).replace(os.sep, '/'), 'bytes': os.path.getsize(p), 'mtime': os.path.getmtime(p), 'sha256': sha256(p)}
    print(f'  {s:28s} character {r1:>24s}   scene {r2:>24s}')

json.dump(src_manifest, open(os.path.join(SOURCE_DIR, 'source-manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'✓ 변환 {n_done} · 건너뜀 {n_skip} · PNG {png_bytes/1e6:.1f}MB → WebP {webp_bytes/1e6:.2f}MB · {time.time()-t0:.0f}s')
print(f'  원본 기록: content/characters/source/source-manifest.json ({len(src_manifest["entries"])} 항목)')
print('  다음: node scripts/build-registry.mjs')

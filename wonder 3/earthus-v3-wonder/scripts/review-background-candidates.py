# -*- coding: utf-8 -*-
"""EARTHUS V3 WONDER — 배경 후보 검수 도구 (PHASE 1-D §1)

benchmarks/background-candidates/*.webp 를 자동 검사(해상도·형식·크기·알파)하고, 눈 검수용 접촉 시트를 만든다.
접촉 시트에는 스펙 §4 의 구도 안내선(가운데 40% 안전영역, 폰 세로 가시 26%, 하단 28% 캐릭터 자리, 수평선 55~65%, 상단 12%)을 겹쳐 그린다.
승인은 하지 않는다 — 결과는 candidates-qa.json(자동) 이고, 눈 검수 판정은 사람이 candidates.json 의 visual_review 에 적는다.

  python scripts/review-background-candidates.py
"""
import json, os, sys, time
from PIL import Image, ImageDraw
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8')
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
CAND = os.path.join(ROOT, 'benchmarks', 'background-candidates')
SPEC = {'width': 2048, 'height': 1152, 'max_bytes': 512000, 'format': 'WEBP'}
man = json.load(open(os.path.join(CAND, 'candidates.json'), encoding='utf-8'))
ids = [k for k, v in man['candidates'].items() if v.get('status') == 'candidate']
rows = []; tiles = []
for id_ in ids:
    p = os.path.join(CAND, f'{id_}.webp'); im = Image.open(p); w, h = im.size; b = os.path.getsize(p)
    checks = {'resolution': (w, h) == (SPEC['width'], SPEC['height']), 'format_webp': im.format == 'WEBP', 'file_size_ok': b <= SPEC['max_bytes'], 'no_alpha': im.mode not in ('RGBA', 'LA')}
    rows.append({'id': id_, 'class': man['candidates'][id_]['class'], 'width': w, 'height': h, 'bytes': b, 'checks': checks, 'auto_pass': all(checks.values()), 'visual_review': man['candidates'][id_].get('visual_review', 'pending'), 'production_approved': False})
    t = im.convert('RGB').resize((512, 288), Image.LANCZOS); d = ImageDraw.Draw(t, 'RGBA')
    W, H = t.size
    d.rectangle([W * .30, 0, W * .70, H], outline=(255, 120, 0, 180), width=2)            # 가운데 40% 안전영역
    d.rectangle([W * .37, 0, W * .63, H], outline=(255, 0, 0, 160), width=1)               # 폰 세로 가시 26%
    d.rectangle([0, H * .72, W, H], fill=(0, 120, 255, 40))                                 # 하단 28% 캐릭터 자리
    d.line([0, H * .55, W, H * .55], fill=(0, 200, 0, 150), width=1); d.line([0, H * .65, W, H * .65], fill=(0, 200, 0, 150), width=1)  # 수평선 띠
    d.rectangle([0, 0, W, H * .12], fill=(120, 120, 120, 50))                               # 상단 12% 헤더
    tiles.append((f"{id_} · {man['candidates'][id_]['class']} · {b//1024}KB", t))
cols = 4; rows_n = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 520, rows_n * 310), 'white'); dr = ImageDraw.Draw(sheet)
for i, (label, t) in enumerate(tiles):
    x = (i % cols) * 520 + 4; y = (i // cols) * 310 + 18; sheet.paste(t, (x, y)); dr.text((x, y - 15), label, fill='black')
sheet_path = os.path.join(CAND, 'contact-sheet.png'); sheet.save(sheet_path)
out = {'_note': '후보 자동 검사. production_approved 는 항상 false — 승인은 PD. 눈 검수는 contact-sheet.png(구도 안내선 포함)로.', 'spec': SPEC, 'checked_at': time.strftime('%Y-%m-%d %H:%M'),
       'summary': {'total': len(rows), 'auto_pass': sum(r['auto_pass'] for r in rows), 'visual_ok': sum(r['visual_review'] == 'ok' for r in rows), 'production_approved': 0, 'bytes_total': sum(r['bytes'] for r in rows)}, 'candidates': rows}
json.dump(out, open(os.path.join(CAND, 'candidates-qa.json'), 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
s = out['summary']
print(f"✓ 후보 {s['total']}장 · 자동 검사 통과 {s['auto_pass']} · 눈 검수 ok {s['visual_ok']} · 합계 {s['bytes_total']//1024}KB · 접촉 시트 {sheet_path}")

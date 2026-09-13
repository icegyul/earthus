# -*- coding: utf-8 -*-
"""EARTHUS V3 WONDER — 배경 24장 자동 검사 (BACKGROUND_ASSET_SPEC_v1 §6 + PD PHASE 1-D §1)

각 파일에 대해 해상도·파일 크기·형식·알파·비율을 재고, 눈 검수(background-review.json)와 합쳐
content/pack-1.8/background-qa.json 을 쓴다. 어떤 배경도 여기서 자동으로 approved 가 되지 않는다 —
production_approved 는 PD 가 명시적으로 바꾸기 전까지 false 다.

  python scripts/check-backgrounds.py
"""
import json, os, sys, time
from PIL import Image
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8')
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
PACK = os.path.join(ROOT, 'content', 'pack-1.8')
SPEC = {'width': 2048, 'height': 1152, 'ratio': 16 / 9, 'format': 'WEBP', 'max_bytes': 512000, 'target_bytes': 358400, 'alpha': False}

catalog = json.load(open(os.path.join(PACK, 'background-catalog.json'), encoding='utf-8'))
review = json.load(open(os.path.join(PACK, 'background-review.json'), encoding='utf-8'))['backgrounds']
rows = []
for c in catalog:
    p = os.path.join(PACK, 'backgrounds', f"{c['id']}.webp")
    im = Image.open(p)
    w, h = im.size; fmt = im.format; alpha = im.mode in ('RGBA', 'LA')
    size = os.path.getsize(p)
    checks = {
        'resolution': w == SPEC['width'] and h == SPEC['height'],
        'ratio_16_9': abs(w / h - SPEC['ratio']) < 0.01,
        'format_webp': fmt == SPEC['format'],
        'file_size_ok': size <= SPEC['max_bytes'],
        'no_alpha': not alpha,
        'visual_review_ok': review[c['id']]['verdict'] == 'ok',       # 그림 내용(글자·UI·타장소·캐릭터·히어로카드 없음, paper-cut, 지역 적합)
    }
    # 눈 검수가 ok 일 때만 의미 있는 항목 — 지금은 전부 검수 불합격이라 측정 대상이 아니다
    pending_visual = ['paper_cut_consistency', 'region_suitability', 'mobile_crop_safe_area', 'contrast_against_character']
    rows.append({
        'id': c['id'], 'path': f"backgrounds/{c['id']}.webp", 'width': w, 'height': h, 'format': fmt, 'mode': im.mode, 'bytes': size,
        'checks': checks, 'pending_visual_checks': pending_visual if not checks['visual_review_ok'] else [],
        'review': review[c['id']], 'spec_pass': all(checks.values()), 'production_approved': False,
    })
out = {
    '_note': 'PHASE 1-D 배경 24장 검사. 자동(해상도·비율·형식·크기·알파) + 눈 검수 연결. production_approved 는 PD 승인 전까지 항상 false — 이 스크립트는 승인하지 않는다.',
    'spec': SPEC, 'checked_at': time.strftime('%Y-%m-%d %H:%M'),
    'summary': {
        'total': len(rows), 'spec_pass': sum(r['spec_pass'] for r in rows), 'production_approved': sum(r['production_approved'] for r in rows),
        'resolution_fail': sum(not r['checks']['resolution'] for r in rows), 'visual_fail': sum(not r['checks']['visual_review_ok'] for r in rows),
        'format_webp': sum(r['checks']['format_webp'] for r in rows), 'size_ok': sum(r['checks']['file_size_ok'] for r in rows),
        'bytes_total': sum(r['bytes'] for r in rows),
    },
    'backgrounds': rows,
}
json.dump(out, open(os.path.join(PACK, 'background-qa.json'), 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
s = out['summary']
print(f"✓ 배경 {s['total']}장 검사 → spec_pass {s['spec_pass']} · 해상도 미달 {s['resolution_fail']} · 눈 검수 불합격 {s['visual_fail']} · WebP {s['format_webp']} · 크기 OK {s['size_ok']} · production_approved {s['production_approved']}")
print('  결과: content/pack-1.8/background-qa.json  → 다음: node scripts/build-registry.mjs')

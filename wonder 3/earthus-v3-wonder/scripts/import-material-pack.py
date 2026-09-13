# EARTHUS V3 WONDER — Paper Earth Material v1 편입 (PD 2026-09-13 "이거 배경으로 적용시켜봐")
#
#   python scripts/import-material-pack.py [--zip <path>] [--report-only]
#
# 원본 ZIP 은 읽기만 한다. 하는 일:
#   1. ZIP 무결성·SHA-256·목록·manifest 읽기
#   2. 텍스처 10장을 실제 픽셀로 재기 — 크기·모드·평균색·이음새(좌우/상하 끝단 차이) → 타일링 가능 여부
#   3. assets/material/paper-earth/*.webp 로 바이트 그대로 복사(원본 보존, 덮어쓰기 가드)
#   4. assets/material/paper_earth_material_manifest.json (실측 + 쓰임 + 타일링 판정) 과
#      팩 원본 사본 둘(manifest·MATERIAL_INTEGRATION)을 assets/material/ 에 나란히 둔다 — docs/ 는 우리가 쓴 문서 자리다
#
# 이 팩은 **지리 정보가 구워져 있지 않다**(manifest geography_baked=false). 평평한 종이 재질 견본이고,
# 지리는 Natural Earth 자료가 담당한다. 합치는 곳은 두 군데다:
#   층 1·2·3·6·7·8 → packages/globe-engine/src/paper-texture.mjs 의 paintPaperEarthMaterial()
#   층 4·5        → packages/globe-engine/src/earth.mjs 의 applyMaterial()
import argparse, hashlib, json, math, os, sys, tempfile, zipfile
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--zip', default=os.path.join(os.path.dirname(ROOT), 'material pack_01', 'EARTHUS_V3_WONDER_PAPER_EARTH_MATERIAL_v1.zip'))
ap.add_argument('--report-only', action='store_true')
args = ap.parse_args()

# 어떤 층에 쓰는가 (docs/MATERIAL_INTEGRATION.md 의 Shader Layer 1~8 과 대응). tiling=True 면 반복해서 깐다.
USE = {
  'paper_ocean_albedo':  {'layer': 1, 'role': 'ocean-albedo',   'usedInV1': True,  'tiling': True,  'note': '바다 바탕 종이'},
  'paper_land_albedo':   {'layer': 2, 'role': 'land-albedo',    'usedInV1': True,  'tiling': True,  'note': '땅 기본 종이(초원·스텝)'},
  'paper_forest_albedo': {'layer': 2, 'role': 'forest-albedo',  'usedInV1': True,  'tiling': True,  'note': '숲·정글 띠'},
  'paper_desert_albedo': {'layer': 2, 'role': 'desert-albedo',  'usedInV1': True,  'tiling': True,  'note': '사막 띠'},
  'paper_ice_albedo':    {'layer': 2, 'role': 'ice-albedo',     'usedInV1': True,  'tiling': True,  'note': '극지 얼음(땅 + 바다 만년빙)'},
  'paper_fiber':         {'layer': 3, 'role': 'fiber-overlay',  'usedInV1': True,  'tiling': True,  'note': '전체 종이 섬유 한 겹'},
  'paper_normal':        {'layer': 4, 'role': 'normal-map',     'usedInV1': True,  'tiling': True,  'note': 'three.js normalMap (MirroredRepeat — 이음새 큼)'},
  'paper_roughness':     {'layer': 5, 'role': 'roughness-map',  'usedInV1': True,  'tiling': True,  'note': 'three.js roughnessMap'},
  'paper_height':        {'layer': 4, 'role': 'height',         'usedInV1': False, 'tiling': True,  'note': 'v1 미사용 — normalMap 과 같은 결이라 겹치면 골판지처럼 보인다. 등록만'},
  'paper_edge_softmask': {'layer': 8, 'role': 'edge-softmask',  'usedInV1': False, 'tiling': False, 'note': 'v1 미사용 — 카드 모양 마스크라 구면 해안선에는 안 맞는다(해안은 경로 합성으로 그린다). 등록만'},
}

def sha(b): return hashlib.sha256(b).hexdigest()

def measure(path):
    im = Image.open(path); im.load()
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    seam_h = float(np.abs(a[:, 0] - a[:, -1]).mean())
    seam_v = float(np.abs(a[0] - a[-1]).mean())
    return {'width': im.width, 'height': im.height, 'mode': im.mode, 'format': im.format,
            'meanRGB': [round(v, 1) for v in a.mean(axis=(0, 1)).tolist()],
            'stdRGB': [round(v, 1) for v in a.std(axis=(0, 1)).tolist()],
            'seamMeanDiff': {'leftRight': round(seam_h, 2), 'topBottom': round(seam_v, 2)}}

z = zipfile.ZipFile(args.zip); zb = open(args.zip, 'rb').read()
bad = z.testzip()
if bad: raise SystemExit(f'ZIP 손상: {bad}')
pack = json.loads(z.read('paper_earth_material_manifest.json').decode('utf-8'))
names = sorted(n for n in z.namelist() if n.startswith('textures/') and n.endswith('.webp'))
print(f'ZIP {os.path.basename(args.zip)}  {len(zb)} B  sha256 {sha(zb)}  testzip OK  textures {len(names)}  manifest {len(pack["textures"])}')
if len(names) != len(pack['textures']): raise SystemExit('manifest 와 파일 수가 다르다')

tmp = tempfile.mkdtemp(prefix='matpack-')
for n in names: z.extract(n, tmp)
byFile = {t['file']: t for t in pack['textures']}
out = {'schema': 'earthus-v3-wonder/paper-earth-material@1', 'name': pack['name'], 'type': pack['type'], 'version': '1.0.0',
       'sourcePack': {'file': os.path.basename(args.zip), 'sha256': sha(zb), 'manifestCopy': 'assets/material/paper_earth_material_manifest.pack-v1.json'},
       'declared': {k: pack.get(k) for k in ('resolution', 'geography_baked', 'labels_baked', 'characters_baked', 'ui_baked', 'status')},
       'shaderLayers': ['1 ocean base material', '2 land biome material', '3 fiber overlay', '4 height/normal', '5 matte roughness',
                        '6 coast cut-edge', '7 paper thickness shadow', '8 soft edge highlight'],
       'integration': {'note': '지리는 이 팩이 아니라 Natural Earth 자료가 정한다(geography_baked=false).',
                       'layers_1_2_3_6_7_8': 'packages/globe-engine/src/paper-texture.mjs → paintPaperEarthMaterial()',
                       'layers_4_5': 'packages/globe-engine/src/earth.mjs → applyMaterial()'},
       'loading': {'policy': 'on-demand', 'when': '첫 그림(절차적 종이 지구) 뒤에 받아서 재질만 갈아 끼운다 — 첫 화면을 늦추지 않는다',
                   'cache': 'shared/immutable by sha (?v=sha12)', 'halfRes': '작은 화면(min(W,H) < 600)에서는 1024 로 줄여 쓴다'},
       'count': len(names), 'textures': []}
problems = []
for n in names:
    f = os.path.basename(n); p = os.path.join(tmp, n); b = open(p, 'rb').read(); m = measure(p)
    declared = byFile.get(f)
    if not declared: problems.append(f'manifest 에 없는 파일: {f}')
    elif declared['sha256'] != sha(b): problems.append(f'sha256 불일치: {f}')
    elif declared['bytes'] != len(b): problems.append(f'bytes 불일치: {f}')
    key = f[:-5]
    u = USE.get(key)
    if not u: problems.append(f'쓰임이 정의되지 않은 텍스처: {f}')
    seam = max(m['seamMeanDiff']['leftRight'], m['seamMeanDiff']['topBottom'])
    out['textures'].append({'id': key, 'file': f, 'path': f'assets/material/paper-earth/{f}', 'bytes': len(b), 'sha256': sha(b),
                            'width': m['width'], 'height': m['height'], 'format': 'webp',
                            **({'layer': u['layer'], 'role': u['role'], 'usedInV1': u['usedInV1'], 'tiling': u['tiling'], 'note': u['note']} if u else {}),
                            'measured': m, 'seamSeverity': 'high' if seam > 20 else 'low' if seam < 12 else 'medium',
                            'wrap': 'mirrored-repeat' if seam > 20 else 'repeat',
                            'packUsage': declared.get('usage') if declared else None})
    if not args.report_only:
        d = os.path.join(ROOT, 'assets', 'material', 'paper-earth'); os.makedirs(d, exist_ok=True)
        dst = os.path.join(d, f)
        if os.path.exists(dst) and open(dst, 'rb').read() != b: raise SystemExit(f'덮어쓰기 금지: {dst} 가 다른 내용으로 이미 있다')
        open(dst, 'wb').write(b)

if problems:
    for p in problems: print('  ✗', p)
    raise SystemExit('팩 검사 실패')

def dump(obj, rel):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh: json.dump(obj, fh, ensure_ascii=False, indent=1); fh.write('\n')

if not args.report_only:
    dump(out, 'assets/material/paper_earth_material_manifest.json')
    with open(os.path.join(ROOT, 'assets', 'material', 'paper_earth_material_manifest.pack-v1.json'), 'wb') as fh:
        fh.write(z.read('paper_earth_material_manifest.json'))
    # 벤더 문서는 팩 사본 자리에 둔다 — docs/ 에 덮어쓰면 우리가 쓴 문서와 섞인다.
    with open(os.path.join(ROOT, 'assets', 'material', 'MATERIAL_INTEGRATION.pack-v1.md'), 'wb') as fh:
        fh.write(z.read('docs/MATERIAL_INTEGRATION.md'))
    ok = sum(1 for t in out['textures'] if sha(open(os.path.join(ROOT, t['path']), 'rb').read()) == t['sha256'])
    print(f'copied {ok}/{len(out["textures"])} byte-identical → assets/material/paper-earth/')

print(f"{'id':24} {'size':>11} {'bytes':>9} {'seam':>6} {'wrap':16} v1")
for t in out['textures']:
    s = t['measured']['seamMeanDiff']
    print(f"{t['id']:24} {t['width']}×{t['height']:<5} {t['bytes']:>9} {max(s['leftRight'], s['topBottom']):>6.1f} {t['wrap']:16} {'사용' if t.get('usedInV1') else '등록만'}")
print('총', sum(t['bytes'] for t in out['textures']) // 1024, 'KB ·  v1 사용', sum(1 for t in out['textures'] if t.get('usedInV1')), '/', len(out['textures']))

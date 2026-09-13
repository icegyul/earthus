# EARTHUS V3 WONDER — WONDER EARTH ASSETS v1.2 편입 (PD 2026-09-13 지시서)
#
#   python scripts/import-earth-assets.py [--zip <path>] [--report-only]
#
# 원본 ZIP 은 읽기만 한다. 하는 일:
#   1. ZIP 무결성·SHA-256·목록·manifest 를 읽고 **추정하지 않고 실측한다**(지시서 §1)
#   2. 16개 지역 × 5파일(color.avif · mask.png · height.png · normal.png · shape.svg)의
#      해상도·모드·알파·crop_px↔uv_bounds 일관성·shape.svg 실내용을 잰다
#   3. 지역들을 마스터 캔버스(2048×1024)에 합성해 **덮이지 않은 곳과 겹치는 곳**을 센다(지시서 §7 seam 검사)
#   4. assets/earth/ 로 바이트 그대로 복사하고 assets/earth/earth_assets_manifest.json 을 쓴다
#      (지역별 lat/lon 경계 + 실측 + 결함 목록 + LOD 정책)
#
# 이 팩은 **해상도 피라미드가 아니다**: 지역 파일은 2048×1024 마스터의 부분 잘라내기라
# 전지구 2048 텍스처와 픽셀 밀도가 같다. 확대용 고해상 타일은 v1.2 에 없다 — 보고서에 그대로 적는다.
import argparse, hashlib, json, os, re, sys, tempfile, zipfile
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--zip', default=os.path.join(os.path.dirname(ROOT), 'WONDER_EARTH_ASSETS_v1_2.zip'))
ap.add_argument('--report-only', action='store_true')
args = ap.parse_args()
PREFIX = 'WONDER_EARTH_ASSETS_v1_2/'
FILES = ['color.avif', 'mask.png', 'height.png', 'normal.png', 'shape.svg']

def sha(b): return hashlib.sha256(b).hexdigest()
def lonOf(x, W): return x / W * 360.0 - 180.0
def latOf(y, H): return 90.0 - y / H * 180.0

z = zipfile.ZipFile(args.zip); zb = open(args.zip, 'rb').read()
bad = z.testzip()
if bad: raise SystemExit(f'ZIP 손상: {bad}')
root = json.loads(z.read(PREFIX + 'manifest.json').decode('utf-8'))
MC = tuple(root['master_canvas'])
groups = [('continents', root['regions']['continents']), ('oceans', root['regions']['oceans']), ('polar', root['regions']['polar'])]
total = sum(len(v) for _, v in groups)
print(f'ZIP {os.path.basename(args.zip)}  {len(zb)} B  sha256 {sha(zb)}  testzip OK  지역 {total}  마스터 {MC[0]}×{MC[1]}')

tmp = tempfile.mkdtemp(prefix='wea-')
z.extractall(tmp)
defects, regions = [], []
cover = np.zeros((MC[1], MC[0]), np.int16)
composite = np.zeros((MC[1], MC[0], 3), np.float64)
order = {'ocean': 0, 'land': 1}

entries = []
for g, names in groups:
    for n in names: entries.append((g, n))
for g, n in entries:
    src = os.path.join(tmp, PREFIX, g, n)
    m = json.loads(open(os.path.join(src, 'manifest.json'), encoding='utf-8').read())
    x0, y0, x1, y1 = m['crop_px']; cw, ch = x1 - x0, y1 - y0
    meas, blob = {}, {}
    for f in FILES:
        p = os.path.join(src, f); b = open(p, 'rb').read(); blob[f] = b
        if f.endswith('.svg'):
            d = re.search(r'd="([^"]*)"', b.decode('utf-8'))
            meas[f] = {'bytes': len(b), 'pathLength': len(d.group(1)) if d else 0}
            if meas[f]['pathLength'] == 0: defects.append(f'{n}/shape.svg: path d 가 비어 있다 — 벡터 원본을 쓸 수 없다')
            continue
        im = Image.open(p); im.load()
        a = np.asarray(im)
        alpha = a[..., 3] if (a.ndim == 3 and a.shape[2] == 4) else None
        meas[f] = {'bytes': len(b), 'width': im.width, 'height': im.height, 'mode': im.mode,
                   'hasAlpha': alpha is not None,
                   'alphaLevels': int(len(np.unique(alpha))) if alpha is not None else None,
                   'alphaCoverage': round(float((alpha > 127).mean()), 4) if alpha is not None else None,
                   'softEdgePct': round(float(((alpha > 8) & (alpha < 247)).mean()) * 100, 2) if alpha is not None else None}
        if (im.width, im.height) != (cw, ch):
            defects.append(f'{n}/{f}: 크기 {im.width}×{im.height} ≠ crop {cw}×{ch}')
    u = m['uv_bounds']
    if not all(abs(a - b) < 1e-6 for a, b in zip(u, [x0 / MC[0], y0 / MC[1], x1 / MC[0], y1 / MC[1]])):
        defects.append(f'{n}: uv_bounds 가 crop_px/master 와 다르다')
    col = Image.open(os.path.join(src, 'color.avif')); col.load()
    ca = np.asarray(col)
    alpha = ca[..., 3] if ca.shape[2] == 4 else np.full(ca.shape[:2], 255, np.uint8)
    if meas['color.avif']['softEdgePct'] is not None and meas['color.avif']['softEdgePct'] < 0.5:
        pass    # 이진 마스크 — 아래에서 한 번만 모아 보고한다
    w = (alpha.astype(np.float64) / 255.0)[..., None]
    sl = (slice(y0, y1), slice(x0, x1))
    composite[sl] = composite[sl] * (1 - w) + ca[..., :3].astype(np.float64) * w
    cover[sl] += (alpha > 127)
    regions.append({'id': n, 'group': g, 'kind': m['kind'], 'cropPx': m['crop_px'], 'uvBounds': u,
                    'lonMin': round(lonOf(x0, MC[0]), 4), 'lonMax': round(lonOf(x1, MC[0]), 4),
                    'latMax': round(latOf(y0, MC[1]), 4), 'latMin': round(latOf(y1, MC[1]), 4),
                    'wrapsDateline': x0 == 0 and x1 == MC[0],
                    'files': {f: {'path': f'assets/earth/{g}/{n}/{f}', 'sha256': sha(blob[f]), **meas[f]} for f in FILES},
                    'bytes': sum(len(blob[f]) for f in FILES), 'note': m.get('note', '')})

binary = [r['id'] for r in regions if (r['files']['color.avif']['softEdgePct'] or 0) < 0.5]
if binary: defects.append(f'color.avif 알파가 이진(부드러운 가장자리 0%)인 지역 {len(binary)}/{total} — 그대로 겹치면 해안에 계단이 생긴다')
holes = int((cover == 0).sum()); overlaps = int((cover > 1).sum())
if holes: defects.append(f'어느 지역에도 덮이지 않는 픽셀 {holes} ({holes / cover.size * 100:.2f}%) — 지역만으로는 전지구가 안 채워진다')
if overlaps: defects.append(f'두 지역 이상이 겹치는 픽셀 {overlaps} ({overlaps / cover.size * 100:.2f}%)')

ov = Image.open(os.path.join(tmp, PREFIX, 'shared', 'overview_1k.avif')); ov.load()
ovb = z.read(PREFIX + 'shared/overview_1k.avif')
ovm = json.loads(z.read(PREFIX + 'shared/overview_manifest.json').decode('utf-8'))
ovDiff = float(np.abs(composite - np.asarray(ov.convert('RGB').resize(MC, Image.LANCZOS)).astype(np.float64)).mean())

# 지역 파일의 픽셀 밀도 = 마스터와 같다 → 확대용 고해상이 아니다
density = {r['id']: round((r['cropPx'][2] - r['cropPx'][0]) / max(1e-9, (r['lonMax'] - r['lonMin'])), 3) for r in regions}
masterDensity = round(MC[0] / 360.0, 3)
if all(abs(v - masterDensity) < 0.01 for v in density.values()):
    defects.append(f'모든 지역이 마스터와 같은 픽셀 밀도({masterDensity} px/°)다 — v1.2 에는 확대용 고해상 타일이 없다')

out = {
    'schema': 'earthus-v3-wonder/earth-assets@1', 'product': root['product'], 'version': '1.2',
    'sourcePack': {'file': os.path.basename(args.zip), 'sha256': sha(zb), 'manifestCopy': 'assets/earth/manifest.pack-v1_2.json', 'readmeCopy': 'assets/earth/README.pack-v1_2.md'},
    'projection': root['projection'], 'masterCanvas': list(MC),
    'declared': {'rules': root.get('rules', []), 'runtimeStrategy': root.get('runtime_strategy', []), 'colorSource': root.get('color_source'), 'styleRules': root.get('style_rules', [])},
    'overview': {'path': 'assets/earth/shared/overview_1k.avif', 'sha256': sha(ovb), 'bytes': len(ovb), 'width': ov.width, 'height': ov.height,
                 'clouds': ovm.get('clouds'), 'labels': ovm.get('labels'), 'purpose': ovm.get('purpose')},
    'lod': {'0': 'shared/overview_1k.avif — 전지구 한 장, 부팅 직후 한 번', '1': '보이는 지역의 color(+normal) 만 uv_bounds 자리에 합성',
            '2+': 'v1.2 에 없음 — 지역 파일은 마스터의 잘라내기라 픽셀 밀도가 같다'},
    'composite': {'holesPx': holes, 'holesPct': round(holes / cover.size * 100, 3), 'overlapPx': overlaps, 'overlapPct': round(overlaps / cover.size * 100, 3),
                  'overviewMeanDiff': round(ovDiff, 2), 'baseRequired': 'LOD0 오버뷰를 바탕에 깔아야 구멍이 메워진다'},
    'pixelDensityPerDegree': {'master': masterDensity, 'regions': density},
    'defects': defects, 'count': len(regions), 'regions': regions,
}

def dump(obj, rel):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh: json.dump(obj, fh, ensure_ascii=False, indent=1); fh.write('\n')

if not args.report_only:
    for g, n in entries:
        d = os.path.join(ROOT, 'assets', 'earth', g, n); os.makedirs(d, exist_ok=True)
        for f in FILES:
            b = z.read(f'{PREFIX}{g}/{n}/{f}')
            dst = os.path.join(d, f)
            if os.path.exists(dst) and open(dst, 'rb').read() != b: raise SystemExit(f'덮어쓰기 금지: {dst}')
            open(dst, 'wb').write(b)
    sd = os.path.join(ROOT, 'assets', 'earth', 'shared'); os.makedirs(sd, exist_ok=True)
    open(os.path.join(sd, 'overview_1k.avif'), 'wb').write(ovb)
    open(os.path.join(ROOT, 'assets', 'earth', 'manifest.pack-v1_2.json'), 'wb').write(z.read(PREFIX + 'manifest.json'))
    open(os.path.join(ROOT, 'assets', 'earth', 'README.pack-v1_2.md'), 'wb').write(z.read(PREFIX + 'README.md'))
    dump(out, 'assets/earth/earth_assets_manifest.json')
    ok = sum(1 for r in regions for f in FILES if sha(open(os.path.join(ROOT, r['files'][f]['path']), 'rb').read()) == r['files'][f]['sha256'])
    print(f'copied {ok}/{len(regions) * len(FILES)} byte-identical → assets/earth/')

print(f"\n{'region':18} {'kind':6} {'crop':>14} {'lon':>16} {'lat':>16} {'알파':>8} {'shape d':>8}")
for r in regions:
    c = r['files']['color.avif']
    print(f"  {r['id']:18} {r['kind']:6} {c['width']:>5}×{c['height']:<6} {r['lonMin']:>7.1f}~{r['lonMax']:<7.1f} {r['latMin']:>7.1f}~{r['latMax']:<7.1f} {c['alphaLevels'] or 0:>4}단계 {r['files']['shape.svg']['pathLength']:>6}")
print(f"\n합성: 구멍 {holes} ({holes/cover.size*100:.2f}%) · 겹침 {overlaps} ({overlaps/cover.size*100:.2f}%) · 오버뷰와 평균차 {ovDiff:.1f}")
print(f"픽셀 밀도: 마스터 {masterDensity} px/° · 지역 {min(density.values())}~{max(density.values())} px/°")
print(f"\n결함 {len(defects)}:")
for d in defects: print('  ✗', d)

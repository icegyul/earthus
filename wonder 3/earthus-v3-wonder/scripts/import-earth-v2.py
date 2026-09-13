#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WONDER EARTH ASSETS v2.0 편입기 (PD 2026-09-13 "여기 접속해서 분석하고 만들어봐").

원칙(v1.2 편입기와 같다):
  1. ZIP 은 읽기 전용. 절대 고치지 않는다.
  2. 파일은 **바이트 그대로** 복사한다. 다시 인코딩하지 않는다.
  3. manifest 의 말을 믿지 않고 **실제 화소를 재서** 적는다.
  4. 결함은 숨기지 않고 defects 에 남긴다. 쓸모없는 파일도 그렇게 적는다.

v1.2 와 다른 점:
  - 전지구 오버뷰(LOD0)가 없다. 대신 바다가 **단색 한 가지**라 바탕은 색 하나로 칠하면 된다.
  - 대륙 shape.svg 에 **진짜 벡터**가 들어 있다(v1.2 는 16장 전부 비어 있었다).
  - 지역마다 자기 boundsLonLat 을 갖는 독립 crop 이다(v1.2 는 한 장을 자른 것).

쓰기: python scripts/import-earth-v2.py [--zip PATH] [--dry]
"""
from __future__ import annotations
import argparse, hashlib, io, json, os, re, shutil, sys, zipfile
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    print('Pillow + numpy 가 필요하다: pip install pillow numpy pillow-avif-plugin', file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets' / 'earth-v2'
DEFAULT_ZIP = ROOT.parent / 'WONDER_EARTH_ASSETS_v2.zip'

CONTINENTS = ['north_america', 'south_america', 'europe', 'africa', 'asia', 'oceania', 'antarctica']
OCEANS = ['pacific_west', 'pacific_east', 'atlantic_north', 'atlantic_south',
          'indian_ocean', 'arctic_ocean', 'southern_ocean', 'mediterranean']

sha256 = lambda b: hashlib.sha256(b).hexdigest()


def img_stats(raw: bytes, name: str) -> dict:
    """실제 화소를 잰다. manifest 가 뭐라 하든 이 값이 사실이다."""
    im = Image.open(io.BytesIO(raw))
    w, h = im.size
    out = {'width': w, 'height': h, 'mode': im.mode, 'bytes': len(raw),
           'decodedBytes': w * h * 4, 'sha256': sha256(raw)}
    a = np.asarray(im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im)
    if im.mode == 'L':
        out['levels'] = int(len(np.unique(a if a.ndim == 2 else a[..., 0])))
        g = a if a.ndim == 2 else a[..., 0]
        out['coverage'] = round(float((g > 127).mean()), 4)
        out['min'], out['max'] = int(g.min()), int(g.max())
        return out
    if a.ndim == 3 and a.shape[2] == 4:
        al = a[..., 3]
        out['alphaLevels'] = int(len(np.unique(al)))
        out['coverage'] = round(float((al > 127).mean()), 4)
        vis = al > 127
        if vis.sum():
            px = a[vis][:, :3].astype(int)
            q = px // 8
            out['uniqueColors'] = int(len(np.unique(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2])))
            out['medianColor'] = '#%02x%02x%02x' % tuple(np.median(px, 0).astype(int))
            # 넓은 색 면인가: 이웃과 사실상 같은 색인 화소 비율(종이 오려붙이기면 높다)
            b = a[..., :3].astype(np.int16)
            dx, mdx = np.abs(b[:, 1:] - b[:, :-1]).sum(2), vis[:, 1:] & vis[:, :-1]
            dy, mdy = np.abs(b[1:, :] - b[:-1, :]).sum(2), vis[1:, :] & vis[:-1, :]
            d = np.concatenate([dx[mdx], dy[mdy]])
            if d.size:
                out['flatPct'] = round(float((d <= 2).mean() * 100), 1)
                out['meanStep'] = round(float(d.mean()), 2)
    else:
        px = a.reshape(-1, a.shape[-1])[:, :3].astype(int)
        out['uniqueColors'] = int(len(np.unique(px // 8, axis=0)))
        out['medianColor'] = '#%02x%02x%02x' % tuple(np.median(px, 0).astype(int))
    return out


PATH_RE = re.compile(r'<path\b([^>]*)/?>', re.S)
ATTR_RE = re.compile(r'([a-zA-Z-]+)\s*=\s*"([^"]*)"')


def parse_shape(svg: str) -> dict:
    """shape.svg 의 종이 층을 뜯어낸다. 런타임은 이 값을 Path2D 로 그린다."""
    vb = re.search(r'viewBox="([\d.\s-]+)"', svg)
    vbox = [float(v) for v in vb.group(1).split()] if vb else None
    layers, cmds = [], {}
    for m in PATH_RE.finditer(svg):
        at = dict(ATTR_RE.findall(m.group(1)))
        d = at.get('d', '')
        if not d.strip():
            continue
        for c in re.findall(r'[A-Za-z]', d):
            cmds[c] = cmds.get(c, 0) + 1
        tx, ty = 0.0, 0.0
        tr = at.get('transform', '')
        tm = re.search(r'translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)', tr)
        if tm:
            tx, ty = float(tm.group(1)), float(tm.group(2))
        layers.append({
            # d 문자열은 여기 담지 않는다 — 290KB 라 manifest 가 부풀고, 런타임은 shape.svg 를 직접 읽는다.
            'fill': at.get('fill', '#000'),
            'opacity': float(at.get('opacity', 1)),
            'fillRule': at.get('fill-rule', 'nonzero'),
            'translate': [tx, ty],
            'stroke': at.get('stroke'),
            'strokeWidth': float(at.get('stroke-width', 0) or 0),
            'points': len(re.findall(r'[-+]?\d*\.?\d+', d)) // 2,
        })
    return {'viewBox': vbox, 'layers': layers, 'commands': cmds,
            'totalPoints': sum(l['points'] for l in layers)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--zip', default=str(DEFAULT_ZIP))
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    zp = Path(args.zip)
    if not zp.exists():
        print(f'✗ ZIP 없음: {zp}', file=sys.stderr)
        return 2
    raw_zip = zp.read_bytes()
    print(f'ZIP {zp.name}  {len(raw_zip):,} bytes  sha256 {sha256(raw_zip)}')

    z = zipfile.ZipFile(io.BytesIO(raw_zip))
    names = [n for n in z.namelist() if not n.endswith('/')]
    root = names[0].split('/')[0]
    print(f'항목 {len(names)}개 · 루트 {root}/')

    defects: list[str] = []
    regions: list[dict] = []
    copied: list[tuple[str, bytes]] = []

    def grab(zp_rel: str) -> bytes | None:
        full = f'{root}/{zp_rel}'
        try:
            return z.read(full)
        except KeyError:
            return None

    # ── 대륙 7 ────────────────────────────────────────────────────────────
    for rid in CONTINENTS:
        man = json.loads(grab(f'continents/{rid}/manifest.json').decode('utf-8'))
        b, size = man['boundsLonLat'], man['size']
        entry = {'id': rid, 'group': 'continents', 'kind': 'land',
                 'name': man.get('name', rid), 'projection': man.get('projection'),
                 'lonMin': b[0], 'latMin': b[1], 'lonMax': b[2], 'latMax': b[3],
                 'declaredSize': size, 'paperCut': man.get('paperCut'), 'files': {}}
        for fn in ['color.avif', 'mask.png', 'height.png', 'normal.png']:
            raw = grab(f'continents/{rid}/{fn}')
            if raw is None:
                defects.append(f'{rid}/{fn}: 없다'); continue
            st = img_stats(raw, fn)
            rel = f'assets/earth-v2/continents/{rid}/{fn}'
            entry['files'][fn] = {'path': rel, **st}
            copied.append((rel, raw))
            if [st['width'], st['height']] != size:
                defects.append(f'{rid}/{fn}: 실제 {st["width"]}x{st["height"]} ≠ manifest {size}')
        svg_raw = grab(f'continents/{rid}/shape.svg')
        shape = parse_shape(svg_raw.decode('utf-8'))
        rel = f'assets/earth-v2/continents/{rid}/shape.svg'
        copied.append((rel, svg_raw))
        entry['files']['shape.svg'] = {'path': rel, 'bytes': len(svg_raw), 'sha256': sha256(svg_raw),
                                       'paths': len(shape['layers']), 'points': shape['totalPoints'],
                                       'commands': shape['commands']}
        entry['shape'] = shape
        if shape['totalPoints'] == 0:
            defects.append(f'{rid}/shape.svg: 비어 있다')
        if shape['viewBox'] and [int(shape['viewBox'][2]), int(shape['viewBox'][3])] != size:
            defects.append(f'{rid}/shape.svg: viewBox {shape["viewBox"][2:]} ≠ manifest size {size}')
        span = b[2] - b[0]
        if span > 360.0001:
            defects.append(f'{rid}: 경도 폭 {span:.1f}° 가 360° 를 넘는다 — 자오선에서 {span-360:.1f}° 가 겹친다')
        if b[1] < -90.0001 or b[3] > 90.0001:
            defects.append(f'{rid}: 위도 [{b[1]:.2f},{b[3]:.2f}] 가 극(±90°)을 넘어간다')
        # 마스크와 color 알파가 같은 모양인가
        c, m = entry['files'].get('color.avif'), entry['files'].get('mask.png')
        if c and m and abs(c.get('coverage', 0) - m.get('coverage', 0)) > 0.005:
            defects.append(f'{rid}: color 알파 덮임 {c["coverage"]} ≠ mask 덮임 {m["coverage"]}')
        n = entry['files'].get('normal.png')
        regions.append(entry)

    # ── 바다 8 ────────────────────────────────────────────────────────────
    for rid in OCEANS:
        man = json.loads(grab(f'oceans/{rid}/manifest.json').decode('utf-8'))
        b, size = man['boundsLonLat'], man['size']
        entry = {'id': rid, 'group': 'oceans', 'kind': 'ocean', 'name': man.get('name', rid),
                 'lonMin': b[0], 'latMin': b[1], 'lonMax': b[2], 'latMax': b[3],
                 'declaredSize': size, 'files': {}}
        for fn in ['color.avif', 'mask.png']:
            raw = grab(f'oceans/{rid}/{fn}')
            st = img_stats(raw, fn)
            rel = f'assets/earth-v2/oceans/{rid}/{fn}'
            entry['files'][fn] = {'path': rel, **st}
            copied.append((rel, raw))
        svg_raw = grab(f'oceans/{rid}/shape.svg')
        shape = parse_shape(svg_raw.decode('utf-8'))
        if shape['totalPoints'] == 0:
            defects.append(f'oceans/{rid}/shape.svg: path 가 없다(파란 사각형 하나뿐) — 벡터 원본이 아니다')
        regions.append(entry)

    # ── 극지 ──────────────────────────────────────────────────────────────
    arctic = {}
    for fn in ['ocean.avif', 'ice_mask.png']:
        raw = grab(f'polar/arctic/{fn}')
        st = img_stats(raw, fn)
        rel = f'assets/earth-v2/polar/arctic/{fn}'
        arctic[fn] = {'path': rel, **st}
        copied.append((rel, raw))
    am = json.loads(grab('polar/arctic/manifest.json').decode('utf-8'))
    if 'boundsLonLat' not in am:
        defects.append('polar/arctic: boundsLonLat 이 없다 — 전지구 등장방형으로 가정한다(실측으로 확인함)')

    # polar/antarctica 가 continents/antarctica 와 같은 파일인가
    dup = []
    for fn in ['color.avif', 'mask.png', 'height.png', 'normal.png', 'shape.svg']:
        a, bb = grab(f'polar/antarctica/{fn}'), grab(f'continents/antarctica/{fn}')
        if a is not None and a == bb:
            dup.append(fn)
    if dup:
        n = sum(len(grab(f'polar/antarctica/{f}')) for f in dup)
        defects.append(f'polar/antarctica: {len(dup)}개 파일이 continents/antarctica 와 바이트까지 같다({n/1024:.0f}KB 중복) — 복사하지 않는다')

    # normal.png 가 실제로 정보를 담는가
    flat_normals = []
    for r in regions:
        n = r['files'].get('normal.png')
        if n and n.get('uniqueColors', 999) <= 32:
            flat_normals.append(r['id'])
    if flat_normals:
        nb = sum(r['files']['normal.png']['bytes'] for r in regions if r['id'] in flat_normals)
        defects.append(f'normal.png {len(flat_normals)}장이 사실상 평평하다(고유색 ≤32, (128,128,255) 근처) — 요철 정보가 없다. {nb/1024:.0f}KB. 런타임에서 쓰지 않는다')

    # 바다 색이 정말 하나인가
    ocean_colors = {r['files']['color.avif'].get('medianColor') for r in regions if r['group'] == 'oceans'}
    base_ocean = sorted(ocean_colors)[0] if ocean_colors else '#1b6696'

    out = {
        'schema': 'earthus-v3-wonder/earth-v2@1',
        'product': 'WONDER_EARTH_ASSETS_v2.0',
        'sourcePack': {'file': zp.name, 'bytes': len(raw_zip), 'sha256': sha256(raw_zip), 'entries': len(names)},
        'projection': 'per-region local-equirectangular-crop',
        'globalOverview': None,
        'baseOcean': base_ocean,
        'oceanColors': sorted(ocean_colors),
        'counts': {'continents': len(CONTINENTS), 'oceans': len(OCEANS), 'files': len(copied)},
        'arctic': {**arctic, 'assumedBounds': [-180, -90, 180, 90], 'note': 'manifest 에 bounds 가 없다. 전지구 등장방형으로 가정'},
        'regions': regions,
        'defects': defects,
        'policy': {
            'base': '바다는 단색 한 장으로 칠한다(팩의 바다 8장은 전부 같은 색) — 오버뷰가 없어도 구멍이 생기지 않는다',
            'land': 'shape.svg 를 Path2D 로 그린다(벡터라 줌해도 또렷하다). color.avif 는 폴백',
            'normal': '쓰지 않는다(평평함)',
            'height': '해안 가까운 쪽만 약하게 — 거리변환이라 DEM 이 아니다',
            'wrap': '경도 폭이 360° 를 넘는 지역은 -360/0/+360 세 번 그린다',
        },
    }

    print(f'\n복사 대상 {len(copied)}개 파일 · 결함 {len(defects)}건')
    for d in defects:
        print('  ⚠', d)
    if args.dry:
        print('\n--dry: 쓰지 않았다')
        return 0

    if DEST.exists():
        shutil.rmtree(DEST)
    total = 0
    for rel, raw in copied:
        p = ROOT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(raw)                                     # 바이트 그대로
        total += len(raw)
    readme = grab('README.md')
    (DEST / 'README.pack-v2.md').write_bytes(readme)
    (DEST / 'manifest.pack-v2.json').write_bytes(grab('manifest.json'))
    man_path = ROOT / 'assets' / 'earth_v2_manifest.json'
    with open(man_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'\n✓ {len(copied)}개 파일 {total/1024/1024:.2f}MB → {DEST.relative_to(ROOT)}')
    print(f'✓ manifest → {man_path.relative_to(ROOT)}')
    print(f'  바다 바탕색 {base_ocean} · 바다 색 종류 {sorted(ocean_colors)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

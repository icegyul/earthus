# EARTHUS V3 WONDER — Background Pack v1 편입 (PD 2026-09-13 "BACKGROUND PACK INSERTION")
#
#   python scripts/import-background-pack.py [--zip <path>] [--report-only]
#
# 하는 일 (원본 ZIP 은 읽기만 한다):
#   1. ZIP 무결성(testzip)·SHA-256·목록·manifest 를 읽는다
#   2. 24장을 임시 폴더에 풀어 실제 픽셀을 잰다 — 크기·비율·가장자리 여백(카탈로그 시트 흔적)·이웃 그림 잔재·유효 해상도(1/4 PSNR)
#   3. 눈 검수 메모(NOTES) 와 합쳐 assets/background_quality_report.json 을 쓴다 (ACCEPT / REJECT / REVIEW + productionStatus)
#   4. assets/background/*.webp 로 바이트 그대로 복사하고(원본 보존), assets/background_manifest.json (실측·상태·safeCrop·region·version·hash) 을 쓴다
#   5. 팩 manifest 원본은 assets/background_manifest.pack-v1.json 으로, 가이드는 docs/BACKGROUND_PRODUCTION_GUIDE_v1.md 로 바이트 그대로 복사
# 판정 규칙(PD): 글자·지역명·UI·버튼·로고·워터마크·캐릭터·다른 장소 썸네일·카드 프레임·인포그래픽·합성 흔적 → PRODUCTION_REJECT.
#   내용 위반(글자·UI·캐릭터 등)은 눈 검수 결과를 NOTES/VIOLATIONS 에 적는다. 시트 여백·이웃 잔재는 자동 측정으로 잡고 safeCropPx 로 화면에서 잘라낸다.
#   상태: 내용 위반 → REJECT(런타임 로드 금지) · 여백/잔재/저해상만 → REVIEW(safe-crop 후보로 런타임 허용, production 은 REJECT) · 흠 없음 → ACCEPT
import argparse, hashlib, io, json, math, os, sys, tempfile, zipfile
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image, ImageFilter
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--zip', default=os.path.join(os.path.dirname(ROOT), 'EARTHUS_V3_WONDER_BACKGROUND_PACK_v1.zip'))
ap.add_argument('--report-only', action='store_true')
args = ap.parse_args()

# 눈 검수 메모 (2026-09-13, 1024px 미리보기 + 가장자리 확대 시트). 내용 위반이 보이면 VIOLATIONS 에 적는다 → REJECT.
NOTES = {
 '01': '우주+지구 반구. 좌우 12~16px 밝은 여백. 글자·UI 없음',
 '02': '서울 스카이라인·남산타워·벚꽃. 왼쪽 68px 흰 여백, 오른쪽 12px',
 '03': '부산 항만·대교. 좌 70·우 43·위 11px 여백',
 '04': '경주 한옥·단풍·산. 왼쪽 41px 여백, 왼쪽 가장자리에 이웃 그림 색 잔재',
 '05': '제주 바다·한라산·유채. 왼쪽 73px 흰 여백',
 '06': '푸른 하늘·구름. 흰 여백 0 이나 왼쪽 띠에 이웃 그림(초록·파랑) 잔재',
 '07': '노을 하늘·해. 오른쪽 10px 여백, 왼쪽 가장자리에 이웃 하늘(파랑) 잔재',
 '08': '은하수 밤하늘. 왼쪽 68px 흰 여백',
 '09': '설산 연봉. 좌우 13px 여백',
 '10': '티베트 궁전·설산. 왼쪽 67px 여백',
 '11': '사하라 사구·해. 좌 70·우 49px 여백',
 '12': '사바나 아카시아. 좌 29·우 44px 여백',
 '13': '숲·계곡. 좌 32·우 25px 여백',
 '14': '정글 폭포. 좌 48·우 12px 여백',
 '15': '얕은 바다·산호 해변. 좌 59·우 37px 여백',
 '16': '수중 암초·빛줄기. 왼쪽 39px 여백',
 '17': '열대 섬. 좌우 13px 여백, 왼쪽 가장자리에 이웃 바다색 잔재',
 '18': '절벽 해안. 왼쪽 68px 여백',
 '19': '분화 화산. 좌 69·우 48·아래 11px 여백',
 '20': '사막 오아시스·야자. 좌 27·우 42px 여백',
 '21': '초원·설산. 좌 33·우 30px 여백 (위쪽 흰 구름은 여백 아님)',
 '22': '툰드라 빙원. 좌 50·우 20px 여백',
 '23': '협곡·강. 좌 58·우 37px 여백',
 '24': '오로라·설원. 왼쪽 39px 여백',
}
VIOLATIONS = {}   # 예: {'02': ['text']} — 2026-09-13 눈 검수: 24장 모두 글자·UI·로고·워터마크·캐릭터 없음
SKY_TOP_FALSE_POSITIVE = {'21'}   # 위쪽 흰 띠가 구름인 파일 — 여백으로 세지 않는다

REGION_MAP = {'earth': [], 'seoul': ['east-asia'], 'busan': ['east-asia'], 'gyeongju': ['east-asia'], 'jeju': ['east-asia'], 'day': [], 'sunset': [], 'night': [],
  'himalaya': ['south-asia'], 'tibet': ['south-asia'], 'sahara': ['north-africa'], 'savanna': ['africa'], 'forest': ['europe'], 'jungle': ['south-america'], 'ocean_shallow': ['southeast-asia'], 'underwater': [],
  'island': ['oceania'], 'coast': ['east-asia'], 'volcano': [], 'desert_oasis': ['middle-east'], 'grassland': ['north-america'], 'tundra': ['siberia', 'polar'], 'canyon': ['north-america'], 'aurora': ['polar']}
GEO = {'seoul': {'lat': 37.57, 'lon': 126.98, 'radiusKm': 60}, 'busan': {'lat': 35.18, 'lon': 129.08, 'radiusKm': 60}, 'gyeongju': {'lat': 35.86, 'lon': 129.22, 'radiusKm': 40}, 'jeju': {'lat': 33.5, 'lon': 126.53, 'radiusKm': 60}}
LOADING = {'world': 'on-demand', 'korea': 'region-lazy', 'atmosphere': 'on-demand', 'region': 'region-lazy'}

def sha(b): return hashlib.sha256(b).hexdigest()

def measure(path):
    im = Image.open(path); im.load(); rgb = im.convert('RGB'); a = np.asarray(rgb).astype(np.float32); H, W, _ = a.shape
    lum = a.mean(axis=2)
    def strip(means, stds):
        n = 0
        for m, s in zip(means, stds):
            if m > 215 and s < 32: n += 1
            else: break
        return n
    colm, cols, rowm, rows_ = lum.mean(axis=0), lum.std(axis=0), lum.mean(axis=1), lum.std(axis=1)
    white = {'left': strip(colm, cols), 'right': strip(colm[::-1], cols[::-1]), 'top': strip(rowm, rows_), 'bottom': strip(rowm[::-1], rows_[::-1])}
    d = lambda e, r: round(float(np.linalg.norm(e - r)))
    delta = {'left': d(a[:, :40].mean(axis=(0, 1)), a[:, 120:280].mean(axis=(0, 1))), 'right': d(a[:, -40:].mean(axis=(0, 1)), a[:, -280:-120].mean(axis=(0, 1))),
             'top': d(a[:40].mean(axis=(0, 1)), a[120:280].mean(axis=(0, 1))), 'bottom': d(a[-40:].mean(axis=(0, 1)), a[-280:-120].mean(axis=(0, 1)))}
    small = rgb.resize((W // 4, H // 4), Image.LANCZOS).resize((W, H), Image.BICUBIC); b = np.asarray(small).astype(np.float32)
    mse = float(((a - b) ** 2).mean()); psnr = round(10 * math.log10(255 ** 2 / mse), 1) if mse > 0 else 99.0
    return {'w': W, 'h': H, 'mode': im.mode, 'format': im.format, 'white': white, 'delta': delta, 'psnr_quarter': psnr}

z = zipfile.ZipFile(args.zip); zbytes = open(args.zip, 'rb').read()
bad = z.testzip()
if bad: raise SystemExit(f'ZIP 손상: {bad}')
names = sorted(n for n in z.namelist() if n.startswith('assets/background/') and n.endswith('.webp'))
pack = json.loads(z.read('assets/background_manifest.json').decode('utf-8'))
print(f'ZIP {os.path.basename(args.zip)}  {len(zbytes)} B  sha256 {sha(zbytes)}  testzip OK  entries {len(z.namelist())}  webp {len(names)}  manifest count {pack["count"]}')
if len(names) != 24 or pack['count'] != 24 or len(pack['assets']) != 24: raise SystemExit('24 가 아니다')

tmp = tempfile.mkdtemp(prefix='bgpack-')
for n in names: z.extract(n, tmp)
report = {'schema': 'earthus-v3-wonder/background-quality-report@1', 'pack': os.path.basename(args.zip), 'packSha256': sha(zbytes), 'reviewedAt': '2026-09-13',
  'reviewer': 'Claude Code — 눈 검수(1024px 미리보기 + 가장자리 확대 시트) + 자동 측정(scripts/import-background-pack.py)',
  'rule': 'PD 2026-09-13: 글자·지역명·UI·버튼·로고·워터마크·캐릭터·다른 장소 썸네일·카드 프레임·인포그래픽·합성 흔적 중 하나라도 있으면 PRODUCTION_REJECT. 통과: standalone·paper-cut 2.5D·16:9·전경 공간·합성 적합·mobile crop',
  'method': {'whiteStripPx': '가장자리에서 안쪽으로 밝고(평균 >215) 균일한(표준편차 <32) 열/행 수 = 카탈로그 시트 여백', 'edgeColorDelta': '가장자리 40px 띠 평균색 vs 안쪽 120~280px 띠 평균색 거리(0~441) = 이웃 그림 잔재(>60 의심)', 'psnrVsQuarterDb': '1/4 로 줄였다 키운 것과의 PSNR — 47~50 dB 면 유효 해상도 ≈ 480p'},
  'pdDecision': {'at': '2026-09-13', 'by': 'PD (PHASE 1 START AUTHORIZATION)', 'verdict': 'RUNTIME CANDIDATE ONLY · PRODUCTION APPROVAL = REJECT FOR NOW',
    'reasons': ['catalog crop residue', 'effective resolution approximately 480p', 'upscaled source', 'production quality 부족'],
    'keep': '삭제하지 않는다 — candidate/fallback 으로 유지. 향후 같은 Asset ID 로 production art 를 교체한다(version·sha 만 갱신).'},
  'summary': {}, 'assets': []}
manifest = {'schema': 'earthus-v3-wonder/background-manifest@1', 'version': pack['version'], 'product': pack['product'], 'assetType': 'background',
  'sourcePack': {'file': os.path.basename(args.zip), 'sha256': sha(zbytes), 'manifestCopy': 'assets/background_manifest.pack-v1.json'}, 'count': 24, 'categories': pack['categories'],
  'rules': pack['rules'] + ['REVIEW/ACCEPT 만 런타임 로드, REJECT 는 등록만(load blocked)', 'safeCropPx 는 카탈로그 시트 여백을 화면에서 잘라내는 값 — 원본 파일은 손대지 않는다', '교체 시 id·path 유지, version·sha256 만 갱신'],
  'loading': {**LOADING, 'unload': 'environment close → unpin → LRU 30MB', 'cache': 'immutable by sha (?v=sha12)'}, 'assets': []}
counts = {'ACCEPT': 0, 'REJECT': 0, 'REVIEW': 0}
for a in pack['assets']:
    f = os.path.basename(a['path']); k = f[:2]; p = os.path.join(tmp, 'assets/background', f); b = open(p, 'rb').read(); m = measure(p)
    w = dict(m['white']); d = m['delta']
    if k in SKY_TOP_FALSE_POSITIVE: w['top'] = 0
    composite = any(w.values()) or d['left'] > 60 or d['right'] > 60
    crop = {'left': max(w['left'], 40 if d['left'] > 60 else 0), 'right': max(w['right'], 40 if d['right'] > 60 else 0), 'top': max(w['top'], 16), 'bottom': max(w['bottom'], 16)}
    viol = VIOLATIONS.get(k, [])
    ratio_ok = abs(m['w'] / m['h'] - 16 / 9) < 0.01
    status = 'REJECT' if viol or not ratio_ok else ('REVIEW' if (composite or m['psnr_quarter'] >= 45) else 'ACCEPT')
    reasons = []
    if viol: reasons.append('내용 위반: ' + ', '.join(viol))
    if not ratio_ok: reasons.append('16:9 아님')
    if composite: reasons.append('카탈로그 시트 여백/이웃 그림 잔재(합성 흔적)')
    if m['psnr_quarter'] >= 45: reasons.append('유효 해상도 ≈480p → 2048×1152 규격 미달(업스케일)')
    counts[status] += 1
    report['assets'].append({'id': a['id'], 'file': f, 'category': a['category'], 'slug': a['slug'], 'width': m['w'], 'height': m['h'], 'ratio16_9': ratio_ok, 'bytes': len(b), 'sha256': sha(b),
      'checks': {'text': 'text' in viol, 'placeName': 'placeName' in viol, 'ui': 'ui' in viol, 'button': 'button' in viol, 'logo': 'logo' in viol, 'watermark': 'watermark' in viol, 'character': 'character' in viol,
                 'otherPlaceThumbnail': d['left'] > 150 or d['right'] > 150, 'cardFrame': False, 'infographic': False, 'compositeTrace': composite,
                 'standalone': True, 'paperCut2_5D': 'partial (AI 일러스트 — 종이 결·레이어 약함)', 'foregroundSpace': True, 'mobileCrop': True},
      'measured': {'whiteStripPx': m['white'], 'edgeColorDelta': d, 'psnrVsQuarterDb': m['psnr_quarter'], 'effectiveResolution': '≈480p (업스케일)' if m['psnr_quarter'] >= 45 else 'native'},
      'status': status, 'productionStatus': 'PRODUCTION_REJECT' if reasons else 'CANDIDATE', 'reasons': reasons, 'safeCropPx': crop, 'note': NOTES.get(k, '')})
    manifest['assets'].append({'id': a['id'], 'category': a['category'], 'slug': a['slug'], 'region': REGION_MAP[a['slug']], 'geo': GEO.get(a['slug']), 'path': 'assets/background/' + f, 'format': 'webp',
      'width': m['w'], 'height': m['h'], 'bytes': len(b), 'version': '1.0.0', 'sha256': sha(b), 'status': status, 'productionStatus': report['assets'][-1]['productionStatus'],
      'load': 'blocked-by-review' if status == 'REJECT' else LOADING[a['category']], 'safeCropPx': crop, 'focal': {'x': 0.5, 'y': 0.62}, 'quality': a.get('quality'), 'source': a.get('source')})
    if not args.report_only:
        os.makedirs(os.path.join(ROOT, 'assets', 'background'), exist_ok=True)
        dst = os.path.join(ROOT, 'assets', 'background', f)
        if os.path.exists(dst) and open(dst, 'rb').read() != b: raise SystemExit(f'덮어쓰기 금지: {dst} 가 다른 내용으로 이미 있다')
        open(dst, 'wb').write(b)
report['summary'] = {'total': len(report['assets']), **counts, 'productionReject': sum(1 for x in report['assets'] if x['productionStatus'] == 'PRODUCTION_REJECT'), 'contentViolations': sum(1 for x in report['assets'] if any(k in VIOLATIONS for k in [x['file'][:2]])),
  'verdict': f"ACCEPT {counts['ACCEPT']} · REJECT {counts['REJECT']} · REVIEW {counts['REVIEW']} — REVIEW 는 safe-crop 후보로만 런타임 허용, production_approved 0"}
def dump(obj, rel):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh: json.dump(obj, fh, ensure_ascii=False, indent=1); fh.write('\n')
dump(report, 'assets/background_quality_report.json')
if not args.report_only:
    dump(manifest, 'assets/background_manifest.json')
    with open(os.path.join(ROOT, 'assets', 'background_manifest.pack-v1.json'), 'wb') as fh: fh.write(z.read('assets/background_manifest.json'))
    with open(os.path.join(ROOT, 'docs', 'BACKGROUND_PRODUCTION_GUIDE_v1.md'), 'wb') as fh: fh.write(z.read('docs/BACKGROUND_PRODUCTION_GUIDE_v1.md'))
    ok = sum(1 for a in manifest['assets'] if sha(open(os.path.join(ROOT, a['path']), 'rb').read()) == a['sha256'])
    print(f'copied {ok}/24 byte-identical · manifest assets/background_manifest.json · guide docs/BACKGROUND_PRODUCTION_GUIDE_v1.md')
print('quality:', report['summary'])
for x in report['assets']: print(f"  {x['file']:30} {x['status']:6} crop L{x['safeCropPx']['left']:>3} R{x['safeCropPx']['right']:>3} T{x['safeCropPx']['top']:>3} B{x['safeCropPx']['bottom']:>3}  psnr¼ {x['measured']['psnrVsQuarterDb']}")

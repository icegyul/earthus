# -*- coding: utf-8 -*-
"""EARTHUS V3 WONDER — 배경 24장 **후보** 생성기 (PHASE 1-D §1, 로컬 ComfyUI Z-Image Turbo)

BACKGROUND_ASSET_SPEC_v1 대로 2048×1152 종이 오려 붙인 풍경을 만들어 benchmarks/background-candidates/ 에 둔다.
· content/ 에 넣지 않는다. 후보는 눈 검수(글자·UI·캐릭터·타장소·히어로카드 없음, 구도, 대비) 뒤 PD 가 승인해야 production 이 된다.
· 이 스크립트는 어떤 것도 approved 로 표시하지 않는다.

  python scripts/gen-backgrounds.py --probe            # himalaya 급 1장으로 시간·VRAM 확인
  python scripts/gen-backgrounds.py --only tibet_01    # 일부
  python scripts/gen-backgrounds.py --all              # 24장
"""
import argparse, io, json, os, sys, time, urllib.request, uuid
from PIL import Image
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8')
    except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.path.join(ROOT, 'benchmarks', 'background-candidates')
WORKFLOW = 'C:/ai/comfyui-mcp-server/workflows/z_image.json'
API = 'http://127.0.0.1:8188'
W, H = 2048, 1152

# ⚠️ 'diorama' 를 쓰면 그림 둘레에 찢은 종이 테두리(프레임)가 생긴다(2026-09-13 프로브). 스펙은 frame/border 금지 → full-bleed 를 명시한다.
# ⚠️ 'torn-paper edges' 도 테두리로 해석된다. 풍경 요소 하나하나가 종이 조각이라고 말하고, 화면 전체를 채우라고 한다.
STYLE = ('flat layered papercraft landscape illustration, {scene}, every mountain, hill, cloud, tree and ground band is a cut colored-paper shape stacked in depth with soft shadows between the layers, '
         'matte cardboard and colored paper textures, 2.5D paper art, warm natural colors, wide 16:9, the landscape fills the whole picture from edge to edge, '
         'empty flat ground band across the lower third (open space for a character), horizon around the middle, gentle clean composition, children\'s picture book style, '
         'no vignette, no frame, no border, no paper window, no card, no text, no letters, no writing, no watermark, no logo, no signature, no people, no animals, no creatures')

SCENES = {
    'sky_island_01':     ('world',      'paper sky stage seen from above the clouds, layered paper cloud banks, a few small floating paper islands far away, pale blue sky, cloud floor as the ground'),
    'korea_seoul_01':    ('korea',      'Seoul in paper, Han river with one bridge, Namsan mountain with a tower silhouette behind paper buildings, hanji paper texture, daytime, riverside flat ground'),
    'korea_busan_01':    ('korea',      'Busan coast in paper, sea and beach, Gwangan bridge silhouette in the distance on the right, low mountains behind, sandy flat ground'),
    'korea_gyeongju_01': ('korea',      'Gyeongju in paper, round grassy royal tomb mounds, a stone observatory tower in the distance on the left, pine trees at the sides, grass flat ground'),
    'korea_jeju_01':     ('korea',      'Jeju island in paper, Hallasan mountain silhouette, small volcanic cone hills, a low black stone wall, yellow rapeseed flower fields, late afternoon light, field flat ground'),
    'aurora_01':         ('atmosphere', 'polar night sky with green and purple aurora curtains made of paper layers, snowfield horizon, pale blue-grey snow ground'),
    'night_01':          ('atmosphere', 'night landscape in paper, navy sky, paper full moon and stars, two layers of low hill silhouettes, dark meadow ground in a mid tone'),
    'sunset_01':         ('atmosphere', 'sunset over the sea in paper, layered orange pink purple sky bands, sea horizon, calm water ground'),
    'australia_01':      ('region',     'Australian outback in paper, red desert plain with a big rounded rock like Uluru, sparse shrubs, red earth ground'),
    'cave_01':           ('region',     'FULL:flat layered papercraft illustration of the inside of a dark cavern, the whole picture is underground rock: layered dark brown and grey cut-paper rock walls, paper stalactites hanging from the top edge, paper stalagmites rising at the left and right sides, one soft warm light beam falling from a small hole in the ceiling onto a flat lit cave floor that spans the lower third, matte paper textures, 2.5D paper art, wide 16:9, edge to edge, no sky, no clouds, no hills, no trees, no plants, no outside landscape, no cave mouth, no window, no frame, no border, no text, no letters, no watermark, no people, no animals'),
    'coast_01':          ('region',     'cliff coast in paper, layered cliffs at the sides, wave layers, open sea in the middle, wet sand ground'),
    'desert_01':         ('region',     'southwest desert in paper, flat-topped red mesa rocks in the distance, a few cacti at the sides, pale sand plain ground'),
    'forest_01':         ('region',     'temperate forest in paper, layers of conifer and broadleaf trees, an open path through the middle, dirt path and leaves ground'),
    'grassland_01':      ('region',     'rolling green grassland in paper, three layers of hills, sky with clouds, grass ground'),
    'ice_01':            ('region',     'FULL:flat layered papercraft illustration of Antarctica, pale sky with a few paper clouds, a long white and pale blue ice shelf cliff across the middle, a few paper icebergs floating on dark blue water, a flat pale blue-grey snow band across the lower third, matte paper textures, 2.5D paper art, wide 16:9, edge to edge, only ice snow water and sky, no trees, no plants, no rocks, no mountains, no frame, no border, no text, no letters, no watermark, no people, no animals'),
    'island_01':         ('region',     'tropical island in paper, turquoise shallow sea, a small island with palm trees at the sides, light beige sand beach ground'),
    'jungle_01':         ('region',     'Amazon rainforest in paper, big leaf layers, thick trees, a river and mist behind, riverbank soil ground'),
    'ocean_01':          ('region',     'FULL:flat layered papercraft illustration of the open ocean, pale sky with a few paper clouds in the upper half, a straight horizon at the middle, below it many straight horizontal bands of blue cut-paper waves getting lighter toward the bottom, small wave crests, calm water band across the lower third, matte paper textures, 2.5D paper art, wide 16:9, edge to edge, only sky and sea, no land, no hills, no island, no trees, no boat, no frame, no border, no text, no letters, no watermark, no people, no animals, no fish'),
    'sahara_01':         ('region',     'Sahara dunes in paper, large sand dune layers, a tiny oasis with palms far away at the side, sand ground'),
    'savanna_01':        ('region',     'Serengeti savanna in paper, yellow grassland, two or three acacia trees at the sides, a snow-capped mountain silhouette in the far distance, dry grass ground'),
    'tajmahal_01':       ('region',     'Taj Mahal in paper, white marble domed mausoleum in the middle distance above the horizon, long reflecting pool and gardens, garden path ground'),
    'tibet_01':          ('region',     'Tibetan plateau in paper, snow mountain ridge layers, tiny prayer flag lines at the side, wide plateau grass ground'),
    'underwater_01':     ('region',     'underwater coral reef in paper, blue water, light beams from above, coral layers at the sides, no fish, sandy sea floor ground'),
    'volcano_01':        ('region',     'volcano landscape in paper, one distant volcano with a thin wisp of smoke, dark lava rock layers, clear sky, hardened lava flat ground, calm, no eruption'),
}

ap = argparse.ArgumentParser()
ap.add_argument('--probe', action='store_true'); ap.add_argument('--all', action='store_true'); ap.add_argument('--only', action='append', default=[])
ap.add_argument('--seed', type=int, default=7100); ap.add_argument('--timeout', type=int, default=600)
a = ap.parse_args()

def api(path, data=None):
    req = urllib.request.Request(API + path, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())

def generate(id_, seed):
    wf = json.load(open(WORKFLOW, encoding='utf-8'))
    for k, v in wf.items():
        ins = v.get('inputs', {})
        for key, val in list(ins.items()):
            if val == 'PARAM_PROMPT': ins[key] = SCENES[id_][1][5:] if SCENES[id_][1].startswith('FULL:') else STYLE.format(scene=SCENES[id_][1])
            elif val == 'PARAM_INT_WIDTH': ins[key] = W
            elif val == 'PARAM_INT_HEIGHT': ins[key] = H
            elif val == 'PARAM_INT_SEED': ins[key] = seed
        if v.get('class_type') == 'SaveImage': ins['filename_prefix'] = f'wonder-bg/{id_}'
    t0 = time.time()
    pid = api('/prompt', {'prompt': wf, 'client_id': str(uuid.uuid4())})['prompt_id']
    while True:
        h = api(f'/history/{pid}')
        if pid in h and h[pid].get('outputs'): break
        if time.time() - t0 > a.timeout: raise TimeoutError(id_)
        time.sleep(1.5)
    imgs = [im for o in h[pid]['outputs'].values() for im in o.get('images', [])]
    im = imgs[0]
    with urllib.request.urlopen(f"{API}/view?filename={urllib.request.quote(im['filename'])}&subfolder={urllib.request.quote(im.get('subfolder',''))}&type={im.get('type','output')}", timeout=60) as r: png = r.read()
    return png, round(time.time() - t0, 1)

ids = list(SCENES) if a.all else a.only if a.only else (['tibet_01'] if a.probe else [])
if not ids: print('대상 없음: --probe | --only <id> | --all'); sys.exit(2)
os.makedirs(os.path.join(OUT, 'png'), exist_ok=True)
manifest_path = os.path.join(OUT, 'candidates.json')
cand = json.load(open(manifest_path, encoding='utf-8')) if os.path.exists(manifest_path) else {'_note': '배경 후보(승인 아님). PD 눈 검수·승인 전까지 production 에 쓰지 않는다. content/ 밖.', 'spec': {'width': W, 'height': H, 'type': 'webp', 'quality': 85}, 'candidates': {}}
for i, id_ in enumerate(ids):
    seed = a.seed + list(SCENES).index(id_)
    try:
        png, secs = generate(id_, seed)
    except Exception as e:
        print(f'  ✗ {id_}: {e}'); cand['candidates'][id_] = {'status': 'failed', 'error': str(e)}; continue
    im = Image.open(io.BytesIO(png)).convert('RGB')
    if im.size != (W, H): im = im.resize((W, H), Image.LANCZOS)
    png_path = os.path.join(OUT, 'png', f'{id_}.png'); im.save(png_path, 'PNG')
    webp_path = os.path.join(OUT, f'{id_}.webp'); im.save(webp_path, 'WEBP', quality=85, method=6)
    b = os.path.getsize(webp_path)
    cand['candidates'][id_] = {'class': SCENES[id_][0], 'status': 'candidate', 'production_approved': False, 'visual_review': 'pending', 'seed': seed, 'model': 'z_image_turbo_int8 (local ComfyUI)', 'seconds': secs,
                               'png': f'png/{id_}.png', 'webp': f'{id_}.webp', 'bytes': b, 'size': [W, H], 'prompt': (SCENES[id_][1][5:] if SCENES[id_][1].startswith('FULL:') else STYLE.format(scene=SCENES[id_][1]))}
    print(f'  {id_:20s} {secs:6.1f}s  webp {b//1024}KB  {"OK ≤500KB" if b <= 512000 else "⚠ 크기 초과"}')
    json.dump(cand, open(manifest_path, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
print(f'✓ {len(ids)}장 → {OUT} (candidates.json). 승인 아님 — 접촉 시트로 눈 검수 뒤 PD 결정.')

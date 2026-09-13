// WONDER EARTH ASSETS v1.2 — 편입한 지구 자산과 LOD 사다리를 검사한다(PD 2026-09-13 지시서 §1·§5·§7·§10·§11).
// 실제 픽셀 품질은 브라우저 검증의 몫. 여기서는 파일·해시·좌표·가시성 계산·합성 순서가 규칙대로인지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { visibleCapDeg, angularDistanceDeg, regionExtent, regionsInView, createEarthAtlas } from '../packages/globe-engine/src/earth-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'earth', 'earth_assets_manifest.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'registry', 'asset-registry.json'), 'utf8'));
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const FILES = ['color.avif', 'mask.png', 'height.png', 'normal.png', 'shape.svg'];

test('자산 팩: 16개 지역 · 파일 81장이 실제로 있고 bytes·sha256 이 manifest 와 같다', () => {
  assert.equal(manifest.count, 16);
  assert.equal(manifest.regions.length, 16);
  assert.deepEqual(manifest.masterCanvas, [2048, 1024]);
  const ids = new Set(), paths = new Set();
  let n = 0;
  for (const r of manifest.regions) {
    assert.ok(!ids.has(r.id), `id 중복 ${r.id}`); ids.add(r.id);
    for (const k of FILES) {
      const f = r.files[k];
      assert.ok(f, `${r.id}/${k} 없음`);
      const abs = path.join(ROOT, f.path);
      assert.ok(fs.existsSync(abs), `없음: ${f.path}`);
      assert.equal(fs.statSync(abs).size, f.bytes, f.path);
      assert.equal(sha256(abs), f.sha256, f.path);
      assert.ok(!paths.has(f.path), `path 중복 ${f.path}`); paths.add(f.path);
      n++;
    }
  }
  const ov = path.join(ROOT, manifest.overview.path);
  assert.ok(fs.existsSync(ov));
  assert.equal(sha256(ov), manifest.overview.sha256);
  assert.equal(manifest.overview.width, 1024);
  assert.equal(manifest.overview.height, 512);
  assert.equal(n + 1, 81, 'manifest 수 = 실제 파일 수');
  assert.match(manifest.sourcePack.sha256, /^[0-9a-f]{64}$/);
});

test('좌표: uvBounds 가 cropPx 와 맞고, 위경도 경계가 등장방형 환산과 일치한다', () => {
  const [MW, MH] = manifest.masterCanvas;
  for (const r of manifest.regions) {
    const [x0, y0, x1, y1] = r.cropPx;
    const [u0, v0, u1, v1] = r.uvBounds;
    assert.ok(u0 >= 0 && v0 >= 0 && u1 <= 1 && v1 <= 1, `${r.id} uv 범위 밖`);
    assert.ok(Math.abs(u0 - x0 / MW) < 1e-6 && Math.abs(v0 - y0 / MH) < 1e-6, `${r.id} uv0`);
    assert.ok(Math.abs(u1 - x1 / MW) < 1e-6 && Math.abs(v1 - y1 / MH) < 1e-6, `${r.id} uv1`);
    // 그림 크기 = crop 크기 (지역 파일은 마스터의 잘라내기다)
    assert.equal(r.files['color.avif'].width, x1 - x0, `${r.id} 폭`);
    assert.equal(r.files['color.avif'].height, y1 - y0, `${r.id} 높이`);
    for (const k of FILES.filter(f => f !== 'shape.svg')) {
      assert.equal(r.files[k].width, r.files['color.avif'].width, `${r.id}/${k} 폭이 color 와 다르다`);
      assert.equal(r.files[k].height, r.files['color.avif'].height, `${r.id}/${k} 높이가 color 와 다르다`);
    }
    assert.ok(Math.abs(r.lonMin - (u0 * 360 - 180)) < 0.01, `${r.id} lonMin`);
    assert.ok(Math.abs(r.latMax - (90 - v0 * 180)) < 0.01, `${r.id} latMax`);
    assert.ok(r.latMax > r.latMin, `${r.id} 위도 뒤집힘`);
  }
});

test('결함 기록: 빈 shape.svg 16건과 마스크 구멍이 manifest 에 정직하게 적혀 있다', () => {
  assert.ok(Array.isArray(manifest.defects) && manifest.defects.length > 0);
  const empty = manifest.defects.filter(d => /shape\.svg/.test(d) && /비어/.test(d));
  assert.equal(empty.length, 16, 'shape.svg 16장 전부 비어 있다 — vector-first 불가');
  // 마스크만 쓰면 구멍이 남는다 → LOD0 바탕이 필수라는 실측이 기록돼 있어야 한다
  assert.ok(manifest.composite.holesPct > 0, '마스크 합성 구멍 실측');
  assert.match(manifest.composite.baseRequired, /LOD0/);
  // 지역 픽셀 밀도가 마스터와 같다 = 확대용 LOD2/3 이 없다
  for (const r of manifest.regions) {
    const d = r.files['color.avif'].width / (r.lonMax - r.lonMin);
    assert.ok(Math.abs(d - manifest.pixelDensityPerDegree.master) < 0.01, `${r.id} 밀도 ${d}`);
    assert.equal(manifest.pixelDensityPerDegree.regions[r.id], manifest.pixelDensityPerDegree.master);
  }
  assert.match(manifest.lod['2+'], /없음/, 'LOD2 이상이 없다는 사실을 숨기지 않는다');
});

test('가시성: 카메라가 멀수록 더 넓게 보고, 각거리는 구면 계산과 맞다', () => {
  assert.ok(visibleCapDeg(3.58) > visibleCapDeg(2.03), '멀수록 넓다');
  assert.ok(Math.abs(visibleCapDeg(2) - 60) < 0.01, 'd=2 → 60°');
  assert.equal(visibleCapDeg(0.5), visibleCapDeg(1.0001), '1 아래 거리는 막는다');
  assert.ok(Number.isFinite(visibleCapDeg(NaN)), 'NaN 이 들어와도 숫자를 돌려준다');
  assert.ok(Math.abs(angularDistanceDeg(0, 0, 0, 90) - 90) < 1e-6);
  assert.ok(Math.abs(angularDistanceDeg(37.5, 127, 37.5, 127)) < 1e-6);
  assert.ok(Math.abs(angularDistanceDeg(0, 179, 0, -179) - 2) < 1e-6, '날짜변경선을 건너도 2°');
});

test('지역 고르기: 서울을 보면 아시아가 가장 가깝고 남극은 안 뽑는다', () => {
  const near = regionsInView(manifest.regions, { lat: 37.5, lon: 127, dist: 2.03 }, { max: 6 });
  assert.equal(near[0].id, 'Asia', `가장 가까운 것이 Asia 가 아니다: ${near.map(x => x.id)}`);
  assert.ok(!near.some(r => r.id === 'Antarctica'), '반대편 극지를 받지 않는다');
  assert.ok(near.length <= 6, 'max 를 지킨다');
  // 부에노스아이레스 쪽을 보면 남아메리카가 먼저다
  const sa = regionsInView(manifest.regions, { lat: -34, lon: -58, dist: 2.03 }, { max: 4 });
  assert.equal(sa[0].id, 'South_America');
  assert.ok(!sa.some(r => r.id === 'Asia'));
  // 북극 위에서는 Arctic 이 0°
  const arctic = regionsInView(manifest.regions, { lat: 89, lon: 0, dist: 3.58 }, { max: 3 });
  assert.equal(arctic[0].id, 'Arctic');
  assert.equal(arctic[0].distanceDeg, 0);
  // 멀어질수록 더 많이 본다
  const far = regionsInView(manifest.regions, { lat: 0, lon: 0, dist: 9 }, { max: 16 });
  const close = regionsInView(manifest.regions, { lat: 0, lon: 0, dist: 1.3 }, { max: 16 });
  assert.ok(far.length > close.length, `${far.length} > ${close.length}`);
});

test('지역 고르기: 경도를 한 바퀴 도는 띠(극지·태평양)는 경도 거리로 버리지 않는다', () => {
  const arctic = manifest.regions.find(r => r.id === 'Arctic');
  const e = regionExtent(arctic);
  assert.equal(e.full, true);
  assert.equal(e.lonC, 0);
  for (const lon of [-170, -90, 0, 90, 170]) {
    const hit = regionsInView([arctic], { lat: 80, lon, dist: 2.03 }, { max: 1 });
    assert.equal(hit.length, 1, `경도 ${lon} 에서 북극이 빠졌다`);
  }
});

// ── 아틀라스 합성: 가짜 캔버스로 "무엇을 어떤 순서로 그렸는지"만 본다(픽셀은 브라우저 몫) ──
function fakeCanvas(w, h) {
  const ops = [];
  const ctx = {
    ops, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: '',
    drawImage: (img, ...a) => ops.push({ op: 'draw', img: img?.tag ?? 'canvas', gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, args: a }),
    fillRect: (...a) => ops.push({ op: 'fillRect', gco: ctx.globalCompositeOperation, fill: ctx.fillStyle, args: a }),
    clearRect: () => ops.push({ op: 'clear' }),
  };
  return { width: w, height: h, getContext: () => ctx, ownerDocument: { createElement: () => fakeCanvas(w, h) }, _ctx: ctx };
}
const img = (tag, w, h) => ({ tag, width: w, height: h });

test('아틀라스: LOD0 바탕이 먼저다 — 바탕 없이 지역을 그리려 하면 거부한다', () => {
  const cc = fakeCanvas(2048, 1024);
  const atlas = createEarthAtlas({ colorCanvas: cc, manifest });
  assert.throws(() => atlas.paintRegion('Africa', { color: img('color', 418, 434) }), /LOD0/);
  assert.throws(() => { atlas.paintBase(img('ov', 1024, 512)); atlas.paintRegion('없는지역', { color: img('c', 1, 1) }); }, /모르는 지역/);
});

test('아틀라스: 지역은 uv 자리에 놓이고, 마스크(destination-in)는 층마다 딱 한 번만 부른다', () => {
  const cc = fakeCanvas(2048, 1024), nc = fakeCanvas(2048, 1024);
  const atlas = createEarthAtlas({ colorCanvas: cc, normalCanvas: nc, manifest });
  const base = atlas.paintBase(img('overview', 1024, 512));
  assert.deepEqual([base.w, base.h], [2048, 1024]);
  assert.equal(nc._ctx.ops.filter(o => o.op === 'fillRect').length, 1, '노멀 캔버스는 평평한 값으로 채운다');

  const africa = manifest.regions.find(r => r.id === 'Africa');
  const [x0, y0, x1, y1] = africa.cropPx;
  const w = x1 - x0, h = y1 - y0;
  cc._ctx.ops.length = 0;
  const res = atlas.paintRegion('Africa', { color: img('color', w, h), height: img('height', w, h), normal: img('normal', w, h) });
  assert.deepEqual(res.rect, { x: x0, y: y0, w, h }, 'uvBounds 가 가리키는 자리에 그대로');

  const color = cc._ctx.ops.find(o => o.img === 'color');
  assert.equal(color.gco, 'source-over');
  assert.deepEqual(color.args, [x0, y0, w, h]);
  const shade = cc._ctx.ops.find(o => o.gco === 'multiply');
  assert.ok(shade && shade.alpha > 0 && shade.alpha < 0.5, '높이 그늘은 얕게 얹는다');
  assert.equal(cc._ctx.globalCompositeOperation, 'source-over', '합성 모드를 원래대로 돌려놓는다');
  assert.equal(cc._ctx.globalAlpha, 1);

  // 스크래치 캔버스: height 용 한 번, normal 용 한 번 — 각각 destination-in 을 딱 한 번만 쓴다(기둥마다 부르면 캔버스가 통째로 지워진다)
  const scratchOps = atlas.stats().regionsPainted === 1 ? null : null;
  assert.equal(atlas.has('Africa'), true);
  assert.deepEqual(atlas.loadedIds(), ['Africa']);
  void scratchOps;
});

test('아틀라스: destination-in 은 층마다 한 번, 지우기(clearRect)가 그 앞에 온다', () => {
  // 스크래치 캔버스를 직접 잡아 본다 — ownerDocument.createElement 가 돌려주는 것을 가로챈다.
  const made = [];
  const cc = fakeCanvas(2048, 1024);
  cc.ownerDocument = { createElement: () => { const c = fakeCanvas(2048, 1024); made.push(c); return c; } };
  const nc = fakeCanvas(2048, 1024);
  const atlas = createEarthAtlas({ colorCanvas: cc, normalCanvas: nc, manifest });
  atlas.paintBase(img('overview', 1024, 512));
  const r = manifest.regions.find(x => x.id === 'Europe');
  const w = r.cropPx[2] - r.cropPx[0], h = r.cropPx[3] - r.cropPx[1];
  atlas.paintRegion('Europe', { color: img('color', w, h), height: img('height', w, h), normal: img('normal', w, h) });
  assert.equal(made.length, 1, '스크래치 캔버스는 하나를 다시 쓴다');
  const ops = made[0]._ctx.ops;
  const di = ops.filter(o => o.op === 'draw' && o.gco === 'destination-in');
  assert.equal(di.length, 2, 'height 용 1 + normal 용 1 = 정확히 2번');
  for (const d of di) assert.equal(d.img, 'color', '마스크는 언제나 color 의 알파다');
  const clears = ops.filter(o => o.op === 'clear');
  assert.equal(clears.length, 2, '층마다 먼저 지운다');
  assert.ok(ops.indexOf(clears[0]) < ops.indexOf(di[0]), '지우기가 마스크보다 앞이다');
});

test('아틀라스: 안 보이는 지역은 목록에서 지운다(forget)', () => {
  const cc = fakeCanvas(2048, 1024);
  const atlas = createEarthAtlas({ colorCanvas: cc, manifest });
  atlas.paintBase(img('overview', 1024, 512));
  for (const id of ['Africa', 'Europe', 'Asia']) {
    const r = manifest.regions.find(x => x.id === id);
    atlas.paintRegion(id, { color: img('color', r.cropPx[2] - r.cropPx[0], r.cropPx[3] - r.cropPx[1]) });
  }
  assert.equal(atlas.forget(['Asia']), 2);
  assert.deepEqual(atlas.loadedIds(), ['Asia']);
  assert.equal(atlas.stats().evicted, 2);
  assert.equal(atlas.forget(['Asia']), 0, '같은 목록을 또 줘도 더 지우지 않는다');
});

test('레지스트리: 지구 자산 81장이 earth-region 종류로 등록되고 decodedBytes 를 갖는다', () => {
  const rows = registry.assets.filter(a => a.kind === 'earth-region');
  assert.equal(rows.length, 81, `등록 81장이어야 한다(16×5 + 오버뷰): ${rows.length}`);
  const byPath = new Map(rows.map(a => [a.path, a]));
  for (const r of manifest.regions) for (const k of FILES) {
    const row = byPath.get(r.files[k].path);
    assert.ok(row, `미등록: ${r.files[k].path}`);
    assert.equal(row.sha256, r.files[k].sha256, r.files[k].path);
    assert.equal(row.bytes, r.files[k].bytes, r.files[k].path);
    assert.equal(row.root, 'project', 'assets/ 는 프로젝트 루트 기준이다');
    if (k !== 'shape.svg') assert.equal(row.decodedBytes, row.width * row.height * 4, `${row.path} decodedBytes`);
  }
  const ov = byPath.get(manifest.overview.path);
  assert.ok(ov && ov.lod === 0 && ov.role === 'overview');
  assert.equal(new Set(rows.map(a => a.id)).size, 81, 'id 중복 0');
  assert.equal(new Set(rows.map(a => a.path)).size, 81, 'path 중복 0');
});

test('로딩 정책: 부팅 경로는 지구 자산을 미리 받지 않는다(§5 · §11-2)', () => {
  const main = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'earth-main.mjs'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'index.html'), 'utf8');
  assert.ok(!/(preload|prefetch)[^\n]*assets\/earth\//.test(html), 'index.html 이 지구 자산을 preload 하면 안 된다');
  assert.ok(!/assets\/earth\/(continents|oceans|polar)\//.test(main), '지역 파일 경로를 코드에 박지 않는다 — manifest 가 정한다');
  // manifest 는 승급 함수 안에서만 받는다
  const fn = main.slice(main.indexOf('async function upgradeToEarthAssets'), main.indexOf('async function streamRegions'));
  assert.ok(fn.includes("loadJson('assets/earth/earth_assets_manifest.json')"), '승급 함수가 manifest 를 받는다');
  assert.equal(main.split("assets/earth/earth_assets_manifest.json").length - 1, 1, 'manifest 를 받는 자리는 한 곳뿐이다');
  // 그린 뒤에는 원본 그림을 놓아 준다(2048×731 한 장이 6MB)
  assert.ok(/assets\.unload\(man\.overview\.path\)/.test(main), '오버뷰를 그린 뒤 놓아 준다');
  assert.ok(/for \(const k of \['color\.avif', 'normal\.png', 'height\.png'\]\) assets\.unload/.test(main), '지역 그림을 그린 뒤 놓아 준다');
  assert.ok(/if \(camera\.dragging\) break;/.test(main), '돌리는 중에는 굽지 않는다');
});

// ── 종이 마무리(§3) — 실제 픽셀을 만드는 함수라 가짜 ImageData 로 직접 검사한다 ──
function pixelCanvas(W, H, fill) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const [r, g, b] = fill(i % W, (i / W) | 0); data[i*4] = r; data[i*4+1] = g; data[i*4+2] = b; data[i*4+3] = 255; }
  const store = { data, width: W, height: H };
  const ctx = {
    getImageData: (x, y, w, h) => { const out = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = ((y + j) * W + (x + i)) * 4, d = (j * w + i) * 4;
        out[d] = data[s]; out[d+1] = data[s+1]; out[d+2] = data[s+2]; out[d+3] = data[s+3]; }
      return { data: out, width: w, height: h }; },
    putImageData: (im, x, y) => { for (let j = 0; j < im.height; j++) for (let i = 0; i < im.width; i++) {
      const s = (j * im.width + i) * 4, d = ((y + j) * W + (x + i)) * 4;
      data[d] = im.data[s]; data[d+1] = im.data[s+1]; data[d+2] = im.data[s+2]; data[d+3] = im.data[s+3]; } },
    createPattern: () => null, save() {}, restore() {}, fillRect() {}, drawImage() {},
  };
  return { width: W, height: H, getContext: () => ctx, _px: (x, y) => [data[(y*W+x)*4], data[(y*W+x)*4+1], data[(y*W+x)*4+2]], _store: store };
}
const eqRgb = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('종이 마무리: 사실적 수심도를 종이 바다 3층으로 바꾸고, 땅은 위도 팔레트로 칠한다', async () => {
  const { paperize, PAPER_SEA, hsl2rgb } = await import('../packages/globe-engine/src/earth-assets.mjs');
  // 왼쪽 절반은 파란 바다(깊이 세 단계), 오른쪽 절반은 갈색 땅
  const c = pixelCanvas(64, 32, (x) => x < 32 ? [20, 60, 140 + (x % 3) * 40] : [150, 120, 80]);
  const r = paperize(c, { landToneAt: () => 'hsl(100 30% 50%)', coast: true, dither: 0 });
  assert.ok(r.landPct > 45 && r.landPct < 55, `땅 비율 ${r.landPct}% — 절반이어야 한다`);
  assert.ok(r.coastPx > 0, '해안선이 그어져야 한다');
  // 바다는 팔레트 3색 중 하나다
  const sea = c._px(5, 10);
  assert.ok(PAPER_SEA.some(p => eqRgb(sea, p)), `바다색이 팔레트가 아니다: ${sea}`);
  // 땅은 위도색(hsl 100 30%) 계열이다 — 원래 갈색(150,120,80)에서 초록으로 바뀐다
  const land = c._px(45, 10);
  assert.ok(land[1] > land[0] && land[1] > land[2], `땅이 초록 계열이 아니다: ${land}`);
  for (const dl of [-11, -3, 6, 15]) void dl;
  assert.ok([-11,-3,6,15].some(dl => eqRgb(land, hsl2rgb(100, 30, 50 + dl), 3)), `땅이 층 4색 중 하나가 아니다: ${land}`);
});

test('종이 마무리: 해안선은 땅이 바다에 닿는 자리에만 긋는다(나라 경계에는 긋지 않는다)', async () => {
  const { paperize, PAPER_COAST } = await import('../packages/globe-engine/src/earth-assets.mjs');
  const c = pixelCanvas(40, 20, x => x < 20 ? [20, 60, 150] : [150, 120, 80]);
  paperize(c, { landToneAt: () => 'hsl(100 30% 50%)', coast: true, dither: 0 });
  const edge = c._px(20, 10), inland = c._px(30, 10);
  const nearCream = p => p[0] > inland[0] + 10 && p[2] > inland[2] + 10;
  assert.ok(nearCream(edge), `해안 첫 칸이 크림색으로 밝아져야 한다: ${edge} vs 내륙 ${inland}`);
  assert.ok(!nearCream(inland), '내륙에는 선을 긋지 않는다');
  assert.ok(PAPER_COAST[0] > 200, '단면색은 밝은 크림이다');
});

test('종이 마무리: 네모만 다시 칠해도 전체와 같은 결과가 나온다(같은 위도·같은 디더)', async () => {
  const { paperize } = await import('../packages/globe-engine/src/earth-assets.mjs');
  const fill = (x, y) => (x + y) % 7 < 3 ? [20, 60, 120 + (x % 4) * 30] : [140, 130, 90];
  const whole = pixelCanvas(64, 32, fill), part = pixelCanvas(64, 32, fill);
  const tone = lat => `hsl(${Math.round(100 + lat / 3)} 30% 50%)`;
  paperize(whole, { landToneAt: tone, coast: false });
  paperize(part, { landToneAt: tone, coast: false, rect: { x: 16, y: 8, w: 24, h: 12 } });
  let same = 0, total = 0;
  for (let y = 9; y < 19; y++) for (let x = 17; x < 39; x++) { total++; if (eqRgb(whole._px(x, y), part._px(x, y), 0)) same++; }
  assert.equal(same, total, `네모 안이 전체 칠과 달라졌다 (${same}/${total})`);
  // 네모 밖은 손대지 않는다
  assert.deepEqual(part._px(2, 2), fill(2, 2), '네모 밖을 건드렸다');
});

test('네모 자르기·합치기: 캔버스 밖으로 나가지 않고, 해안 이웃을 보려고 1px 넓힌다', async () => {
  const { clampRect, unionRect } = await import('../packages/globe-engine/src/earth-assets.mjs');
  assert.deepEqual(clampRect(null, 100, 50), { x: 0, y: 0, w: 100, h: 50 });
  assert.deepEqual(clampRect({ x: -5, y: -5, w: 20, h: 20 }, 100, 50), { x: 0, y: 0, w: 20, h: 20 });
  assert.deepEqual(clampRect({ x: 90, y: 40, w: 50, h: 50 }, 100, 50), { x: 90, y: 40, w: 10, h: 10 });
  const u = unionRect([{ x: 10, y: 10, w: 10, h: 10 }, { x: 30, y: 5, w: 10, h: 10 }], 100, 50);
  assert.deepEqual(u, { x: 9, y: 4, w: 32, h: 17 }, '두 네모를 감싸고 사방 1px 씩 넓힌다');
  assert.deepEqual(unionRect([], 100, 50), { x: 0, y: 0, w: 100, h: 50 }, '빈 목록이면 전체');
});

test('종이 마무리: 디더가 층 경계의 한 줄 단차를 흩는다', async () => {
  const { paperize } = await import('../packages/globe-engine/src/earth-assets.mjs');
  // 바다 층 문턱(lum≈80.8)을 가로지르는 그라데이션. 디더가 없으면 한 줄에서 **모든 화소가 같은 방향으로** 갈린다 — 그게 눈에 보이는 선이다.
  const grad = x => { const v = 60 + x * 4; return [Math.round(v * 0.18), Math.round(v * 0.34), Math.round(v * 0.8)]; };
  const lum = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  // 부호를 살려서 평균한다: 한 방향으로 쏠리면 선, 위아래로 섞이면 오돌토돌한 결이다.
  const coherence = c => { let worst = 0;
    for (let x = 0; x < 63; x++) { let s = 0; for (let y = 0; y < 16; y++) s += lum(c._px(x + 1, y)) - lum(c._px(x, y));
      worst = Math.max(worst, Math.abs(s / 16)); }
    return +worst.toFixed(2); };
  const flat = pixelCanvas(64, 16, grad), dith = pixelCanvas(64, 16, grad);
  paperize(flat, { coast: false, dither: 0 });
  paperize(dith, { coast: false, dither: 13 });
  const f = coherence(flat), d = coherence(dith);
  assert.ok(f > 8, `디더가 없으면 한 줄이 통째로 갈려야 한다: ${f}`);
  assert.ok(d < f * 0.6, `디더가 단차를 60% 아래로 낮춰야 한다: ${d} vs ${f}`);
});

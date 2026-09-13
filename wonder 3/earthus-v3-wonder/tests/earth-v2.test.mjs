// WONDER EARTH ASSETS v2.0 — 편입한 벡터 종이 지구를 검사한다(PD 2026-09-13 "분석하고 만들어봐").
// 실제 그림 품질은 브라우저 검증의 몫. 여기서는 파일·해시·좌표·SVG 파싱·합성 순서가 규칙대로인지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsePaperShape, regionPlacement, wrapOffsets, createPaperGlobeV2 } from '../packages/globe-engine/src/earth-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'earth_v2_manifest.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'registry', 'asset-registry.json'), 'utf8'));
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const conts = manifest.regions.filter(r => r.group === 'continents');
const oceans = manifest.regions.filter(r => r.group === 'oceans');

test('자산 팩: 대륙 7 · 바다 8 · 파일 53장이 실제로 있고 bytes·sha256 이 manifest 와 같다', () => {
  assert.equal(conts.length, 7);
  assert.equal(oceans.length, 8);
  const paths = new Set();
  let n = 0;
  for (const r of manifest.regions) {
    for (const [fn, f] of Object.entries(r.files)) {
      const abs = path.join(ROOT, f.path);
      assert.ok(fs.existsSync(abs), `없음: ${f.path}`);
      assert.equal(fs.statSync(abs).size, f.bytes, f.path);
      assert.equal(sha256(abs), f.sha256, f.path);
      assert.ok(!paths.has(f.path), `path 중복 ${f.path}`); paths.add(f.path);
      n++;
      void fn;
    }
  }
  for (const f of Object.values(manifest.arctic)) {
    if (typeof f !== 'object' || !f.path) continue;
    assert.ok(fs.existsSync(path.join(ROOT, f.path)), f.path);
    assert.equal(sha256(path.join(ROOT, f.path)), f.sha256, f.path);
    n++;
  }
  assert.equal(n, 53, 'manifest 수 = 실제 파일 수');
  assert.equal(manifest.counts.files, 53);
  assert.match(manifest.sourcePack.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.globalOverview, null, 'v2 에는 전지구 오버뷰가 없다 — 바다 단색이 그 자리를 대신한다');
});

test('바다: 8장이 전부 같은 단색이라 바탕을 색 하나로 칠할 수 있다', () => {
  assert.equal(manifest.oceanColors.length, 1, `바다 색이 여러 가지면 색 하나로 칠하면 안 된다: ${manifest.oceanColors}`);
  assert.equal(manifest.baseOcean, manifest.oceanColors[0]);
  assert.match(manifest.baseOcean, /^#[0-9a-f]{6}$/);
  for (const r of oceans) {
    const c = r.files['color.avif'];
    assert.equal(c.medianColor, manifest.baseOcean, `${r.id} 바다색이 다르다`);
    assert.ok(c.uniqueColors <= 8, `${r.id} 고유색 ${c.uniqueColors} — 단색이 아니다`);
  }
});

test('화풍: 대륙은 넓은 단색 면이다 (v1.2 기복도와 수치로 갈린다)', () => {
  for (const r of conts) {
    const c = r.files['color.avif'];
    assert.ok(c.uniqueColors <= 24, `${r.id} 고유색 ${c.uniqueColors} — 종이 단색이라기엔 많다`);
    assert.ok(c.meanStep <= 8, `${r.id} 이웃 색차 ${c.meanStep} — 연속 계조에 가깝다`);
    assert.match(c.medianColor, /^#[0-9a-f]{6}$/);
  }
  // 같은 프로젝트의 v1.2 팩과 비교 — 있으면 대조하고, 없으면 건너뛴다
  const v12 = path.join(ROOT, 'assets', 'earth_assets_manifest.json');
  if (fs.existsSync(v12)) {
    const old = JSON.parse(fs.readFileSync(v12, 'utf8'));
    const worstNew = Math.max(...conts.map(r => r.files['color.avif'].uniqueColors));
    const bestOld = Math.min(...old.regions.map(r => r.files['color.avif'].uniqueColors ?? 9999));
    assert.ok(worstNew < bestOld, `v2 최대 고유색 ${worstNew} 가 v1.2 최소 ${bestOld} 보다 적어야 한다`);
  }
});

test('벡터: 대륙 7장 shape.svg 에 실제 폴리곤이 있다 (v1.2 는 16장 전부 비어 있었다)', () => {
  for (const r of conts) {
    const s = r.shape;
    assert.ok(s.totalPoints > 500, `${r.id} 점 ${s.totalPoints} — 너무 적다`);
    assert.equal(s.layers.length, 4, `${r.id} 종이 층이 4개가 아니다`);
    // 이 팩의 d 는 M/L/Z 만 쓴다. 곡선이 들어오면 Path2D 는 읽지만 우리 파서 가정이 바뀐다.
    assert.deepEqual(Object.keys(s.commands).sort(), ['L', 'M', 'Z']);
    assert.deepEqual([s.viewBox[2], s.viewBox[3]], r.declaredSize, `${r.id} viewBox ≠ size`);
    const fill = s.layers.find(l => l.opacity >= 0.999 && !l.stroke);
    assert.ok(fill, `${r.id} 채우기 층이 없다`);
    assert.equal(fill.fillRule, 'evenodd', `${r.id} 채우기가 evenodd 가 아니면 호수 구멍이 메워진다`);
    assert.equal(s.layers.filter(l => l.translate[1] !== 0).length, 2, `${r.id} 아래로 민 그림자 층이 2개여야 한다`);
    assert.ok(s.layers.some(l => l.stroke), `${r.id} 테두리 층이 없다`);
  }
  for (const r of oceans) {
    assert.ok(!r.shape || (r.shape.totalPoints ?? 0) === 0, `${r.id} 바다 shape 은 비어 있다(파란 사각형)`);
  }
});

test('결함 기록: 360° 초과 경도 · 평평한 노멀 · 중복 파일이 manifest 에 정직하게 적혀 있다', () => {
  const d = manifest.defects.join('\n');
  assert.match(d, /경도 폭 381\.6° 가 360° 를 넘는다/);
  assert.equal(manifest.defects.filter(x => /360° 를 넘는다/.test(x)).length, 3, 'europe·oceania·antarctica 세 곳');
  assert.match(d, /위도 \[-90\.80,-62\.47\] 가 극\(±90°\)을 넘어간다/);
  assert.match(d, /normal\.png 7장이 사실상 평평하다/);
  assert.match(d, /polar\/antarctica: 5개 파일이 continents\/antarctica 와 바이트까지 같다/);
  assert.equal(manifest.defects.filter(x => /oceans\/.*shape\.svg: path 가 없다/.test(x)).length, 8);
  // 실제로 평평한지 수치로 확인 — 결함 문구만 믿지 않는다
  for (const r of conts) {
    const n = r.files['normal.png'];
    assert.ok(n.uniqueColors <= 32, `${r.id} normal 고유색 ${n.uniqueColors}`);
  }
});

test('좌표: 선언한 bounds 가 등장방형 배치 계산과 맞고, 대륙이 제자리에 온다', () => {
  const CW = 2048, CH = 1024;
  const af = conts.find(r => r.id === 'africa');
  const p = regionPlacement(af, CW, CH, af.shape.viewBox);
  // 아프리카: lon −19.69~53.20, lat −36.98~39.52
  assert.ok(Math.abs(p.ox - ((af.lonMin + 180) / 360) * CW) < 1e-6);
  assert.ok(Math.abs(p.oy - ((90 - af.latMax) / 180) * CH) < 1e-6);
  // viewBox 의 (0,0) 은 좌상단 = (lonMin, latMax)
  const x0 = p.ox, y0 = p.oy;
  assert.ok(Math.abs((x0 / CW) * 360 - 180 - af.lonMin) < 1e-6);
  assert.ok(Math.abs(90 - (y0 / CH) * 180 - af.latMax) < 1e-6);
  // viewBox 의 오른쪽 아래는 (lonMax, latMin)
  const x1 = p.ox + p.sx * af.shape.viewBox[2], y1 = p.oy + p.sy * af.shape.viewBox[3];
  assert.ok(Math.abs((x1 / CW) * 360 - 180 - af.lonMax) < 1e-4);
  assert.ok(Math.abs(90 - (y1 / CH) * 180 - af.latMin) < 1e-4);
});

test('감기: 경도 폭이 360° 를 넘는 대륙은 여러 번 그려야 잘리지 않는다', () => {
  const CW = 2048, CH = 1024;
  const eu = conts.find(r => r.id === 'europe');
  const pe = regionPlacement(eu, CW, CH, eu.shape.viewBox);
  const offs = wrapOffsets(pe, CW);
  assert.ok(offs.length >= 2, `폭 ${pe.spanLon}° 인데 ${offs.length}번만 그린다`);
  assert.ok(offs.includes(0));
  // 아프리카는 한 번이면 충분하다(자오선을 건너지 않는다)
  const af = conts.find(r => r.id === 'africa');
  assert.deepEqual(wrapOffsets(regionPlacement(af, CW, CH, af.shape.viewBox), CW), [0]);
});

test('SVG 파싱: 종이 층 구실(채우기·그림자 2장·테두리)을 제대로 갈라낸다', () => {
  const svg = fs.readFileSync(path.join(ROOT, conts.find(r => r.id === 'africa').files['shape.svg'].path), 'utf8');
  const s = parsePaperShape(svg);
  assert.deepEqual(s.viewBox, [0, 0, 1951, 1536]);
  assert.equal(s.layers.length, 4);
  assert.ok(s.fill && s.fill.opacity === 1 && !s.fill.stroke);
  assert.equal(s.fill.fillRule, 'evenodd');
  assert.equal(s.fill.fill, '#cdaa5c');
  assert.equal(s.shadows.length, 2);
  assert.deepEqual(s.shadows.map(l => l.ty), [10, 5], '그림자는 아래로 10px·5px');
  assert.ok(s.shadows.every(l => l.fill === '#a78436'), '그림자는 제 대륙의 어두운 색');
  assert.ok(s.rim && /rgba\(255,255,255/.test(s.rim.stroke));
  assert.ok(s.fill.d.startsWith('M'), 'd 가 M 으로 시작한다');
  // defs 안의 filter 는 path 가 아니다 — 층으로 세면 안 된다
  assert.ok(svg.includes('<filter'), '팩에 filter 가 선언돼 있다');
  assert.equal(s.layers.filter(l => !l.d).length, 0);
});

// ── 합성 순서: 가짜 캔버스로 "무엇을 어떤 순서로 그렸는지" 만 본다 ──
// Path2D 는 브라우저 전역이라 Node 에는 없다. 모양은 브라우저가 그리고, 여기서는 **순서**만 본다.
globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
function fakeCanvas(w, h, made) {
  const ops = [];
  const ctx = {
    ops, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '',
    save() { ops.push({ op: 'save' }); }, restore() { ops.push({ op: 'restore' }); },
    setTransform: (...a) => ops.push({ op: 'setTransform', args: a }),
    translate: (...a) => ops.push({ op: 'translate', args: a }),
    fill: (p, rule) => ops.push({ op: 'fill', rule, fill: ctx.fillStyle, alpha: ctx.globalAlpha, gco: ctx.globalCompositeOperation }),
    stroke: () => ops.push({ op: 'stroke', stroke: ctx.strokeStyle, lineWidth: ctx.lineWidth }),
    fillRect: (...a) => ops.push({ op: 'fillRect', fill: ctx.fillStyle, gco: ctx.globalCompositeOperation, args: a }),
    clearRect: () => ops.push({ op: 'clear' }),
    drawImage: (img, ...a) => ops.push({ op: 'draw', tag: img?._tag ?? 'img', gco: ctx.globalCompositeOperation, alpha: ctx.globalAlpha, args: a }),
    getImageData: (x, y, w2, h2) => ({ data: new Uint8ClampedArray(w2 * h2 * 4), width: w2, height: h2 }),
    putImageData: () => ops.push({ op: 'put' }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const c = { width: w, height: h, getContext: () => ctx, _ctx: ctx, _tag: `c${made?.length ?? 0}` };
  c.ownerDocument = { createElement: () => { const n = fakeCanvas(w, h, made); made?.push(n); return n; } };
  return c;
}
const shapeOf = id => parsePaperShape(fs.readFileSync(path.join(ROOT, conts.find(r => r.id === id).files['shape.svg'].path), 'utf8'));

test('합성: 바다를 먼저 칠하고, 그림자는 땅 합집합 밖에만 남긴다', () => {
  const made = [];
  const cc = fakeCanvas(2048, 1024, made);
  const g = createPaperGlobeV2({ colorCanvas: cc, manifest });
  const o = g.paintOcean();
  assert.equal(o.color, manifest.baseOcean);
  const first = cc._ctx.ops.find(x => x.op === 'fillRect');
  assert.equal(first.fill, manifest.baseOcean, '바다는 색 하나로 전면을 칠한다');

  const shapes = new Map([['africa', shapeOf('africa')], ['asia', shapeOf('asia')], ['europe', shapeOf('europe')]]);
  const r = g.paintLand(shapes, { depthPx: 3 });
  assert.equal(r.painted, 3);
  // 스크래치 캔버스: 합집합 1 + 그림자 1 + 테두리 1
  assert.ok(made.length >= 3, `스크래치 캔버스 ${made.length}`);
  const shadow = made[1]._ctx.ops;
  const cut = shadow.filter(x => x.op === 'draw' && x.gco === 'destination-out');
  assert.equal(cut.length, 1, '그림자에서 땅을 오려 내는 것은 딱 한 번(유라시아 한복판 선을 없애는 핵심)');
  assert.ok(shadow.some(x => x.op === 'fill' && x.alpha === 0.55), '종이 단면 진한 층');
  assert.ok(shadow.some(x => x.op === 'fill' && x.alpha === 0.32), '종이 단면 옅은 층');
});

test('합성: 북쪽 테두리는 "땅 − 아래로 민 땅" 이다 (교집합을 쓰면 대륙이 통째로 하얘진다)', () => {
  const made = [];
  const cc = fakeCanvas(2048, 1024, made);
  const g = createPaperGlobeV2({ colorCanvas: cc, manifest });
  g.paintOcean();
  g.paintLand(new Map([['africa', shapeOf('africa')]]), { depthPx: 3, rimPx: 1.4, rimAlpha: 0.16 });
  const rim = made[made.length - 1]._ctx.ops;
  const draws = rim.filter(x => x.op === 'draw');
  assert.equal(draws.length, 2, '합집합을 두 번 그린다(제자리 · 아래로 민 것)');
  assert.equal(draws[0].gco, 'source-over');
  assert.equal(draws[1].gco, 'destination-out', '아래로 민 땅을 **빼야** 북쪽 띠만 남는다');
  assert.ok(draws[1].args[1] > 0, `아래(+y)로 밀어야 한다: ${draws[1].args}`);   // drawImage(img, dx, dy) → args = [dx, dy]
  assert.ok(rim.some(x => x.op === 'fillRect' && x.gco === 'source-in' && x.fill === '#fff'));
});

test('합성: 종이 두께는 캔버스 화소로 고정한다 (팩의 10px 를 그대로 쓰면 대륙마다 달라진다)', () => {
  // 팩이 적은 ty=10 을 그대로 쓰면 아프리카 2.8px · 유럽 9.3px 가 된다(실측). 우리는 같게 만든다.
  const scale = (id, H = 1024) => {
    const r = conts.find(x => x.id === id);
    return (r.latMax - r.latMin) / 180 * H / r.shape.viewBox[3] * 10;
  };
  assert.ok(Math.abs(scale('africa') - scale('europe')) > 3, '팩 그대로면 대륙마다 두께가 3px 넘게 벌어진다');
  const made = [];
  const cc = fakeCanvas(2048, 1024, made);
  const g = createPaperGlobeV2({ colorCanvas: cc, manifest });
  g.paintOcean();
  const r = g.paintLand(new Map([['africa', shapeOf('africa')], ['europe', shapeOf('europe')]]), { depthPx: 3 });
  assert.equal(r.depthPx, 3);
  const offs = made[1]._ctx.ops.filter(x => x.op === 'setTransform').map(x => x.args[5]);
  const af = conts.find(x => x.id === 'africa'), eu = conts.find(x => x.id === 'europe');
  const oyAf = ((90 - af.latMax) / 180) * 1024, oyEu = ((90 - eu.latMax) / 180) * 1024;
  // 유럽은 자오선을 건너 세 번 그려지므로 **개수**가 아니라 값의 집합을 비교한다
  const uniq = (v0) => [...new Set(offs.filter(v => Math.abs(v - v0) < 4).map(v => +(v - v0).toFixed(2)))].sort((a, b) => a - b);
  const depthAf = uniq(oyAf), depthEu = uniq(oyEu);
  assert.deepEqual(depthAf, [1.5, 3], `아프리카 두께 ${depthAf}`);
  assert.deepEqual(depthEu, depthAf, '두 대륙의 종이 두께가 같아야 한다');
});

test('기본 크기가 바뀌어도 배치가 따라간다(벡터라 다시 구우면 그만큼 또렷해진다)', () => {
  const af = conts.find(r => r.id === 'africa');
  const a = regionPlacement(af, 2048, 1024, af.shape.viewBox);
  const b = regionPlacement(af, 4096, 2048, af.shape.viewBox);
  assert.ok(Math.abs(b.sx / a.sx - 2) < 1e-9, '가로 배율이 정확히 두 배');
  assert.ok(Math.abs(b.sy / a.sy - 2) < 1e-9);
  assert.ok(Math.abs(b.ox / a.ox - 2) < 1e-9);
});

test('레지스트리: 지구 v2 53장이 earth-v2 종류로 등록되고 쓸모없는 것은 usable=false 다', () => {
  const rows = registry.assets.filter(a => a.kind === 'earth-v2');
  assert.equal(rows.length, 53);
  const byPath = new Map(rows.map(a => [a.path, a]));
  for (const r of manifest.regions) for (const f of Object.values(r.files)) {
    const row = byPath.get(f.path);
    assert.ok(row, `미등록: ${f.path}`);
    assert.equal(row.sha256, f.sha256, f.path);
    assert.equal(row.bytes, f.bytes, f.path);
    assert.equal(row.root, 'project');
  }
  // 평평한 노멀 7 + 빈 바다 shape 8 = 15... 중 노멀만 usable=false(바다 shape 은 애초에 등록 파일이 아니다)
  const unusable = rows.filter(a => a.usable === false);
  assert.ok(unusable.length >= 7, `쓸모없다고 표시된 것 ${unusable.length}`);
  assert.ok(unusable.every(a => a.role === 'normal' || a.role === 'shape'));
  assert.ok(rows.filter(a => a.role === 'normal').every(a => a.usable === false), '평평한 노멀은 전부 막혀 있어야 한다');
  // 대륙 shape 은 첫 화면에 받는다(지구 그 자체다)
  const shapes = rows.filter(a => a.role === 'shape' && a.group === 'continents');
  assert.equal(shapes.length, 7);
  assert.ok(shapes.every(a => a.load === 'boot-vector' && a.usable === true));
  assert.equal(new Set(rows.map(a => a.id)).size, 53, 'id 중복 0');
});

test('로딩 정책: 첫 화면은 벡터 7장 + 얼음 마스크뿐이다', () => {
  const main = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'earth-main.mjs'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'index.html'), 'utf8');
  assert.ok(!/(preload|prefetch)[^\n]*assets\/earth-v2\//.test(html), 'index.html 이 지구 자산을 preload 하면 안 된다');
  assert.ok(!/assets\/earth-v2\/(continents|oceans|polar)\//.test(main), '지역 경로를 코드에 박지 않는다 — manifest 가 정한다');
  const fn = main.slice(main.indexOf('async function upgradeToEarthV2'), main.indexOf('function bakeV2'));
  assert.ok(fn.includes("loadJson('assets/earth_v2_manifest.json')"));
  assert.equal(main.split('assets/earth_v2_manifest.json').length - 1, 1, 'manifest 를 받는 자리는 한 곳뿐');
  // 바다 그림 8장은 받지 않는다 — 색 하나로 칠하니까
  assert.ok(!/color\.avif/.test(fn), '바다·대륙 색 그림을 첫 화면에 받지 않는다');
  assert.ok(fn.includes("assets.unload(man.arctic['ice_mask.png'].path)"), '얼음 마스크는 쓰고 나면 놓아 준다');
  // 굽는 중 손이 지구를 만지고 있으면 미룬다
  assert.ok(/camera\.dragging \|\| camera\.animating/.test(main.slice(main.indexOf('function maybeSharpenV2'))));
});

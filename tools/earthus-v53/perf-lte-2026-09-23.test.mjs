// 폰 LTE 첫 화면 — PERF-LTE-PLAN-2026-09-23 V2-7 · V2-5 · V2-6 회귀 잠금.
//   V2-7  같은 모듈을 ?v= 가 다른 두 지정자로 불러 모듈이 두 벌 떴다(phenomenon-registry ?v=4 · ?v=5).
//   V2-5  폰의 밤 불빛은 GIBS 2단계 15장(2560×1280). 3단계 50장(5120×2560)은 폰 텍스처 한도를 넘었다.
//   V2-6  폰 기본 지도 4096 은 NE2 원판에서 다시 구운 WebP. 못 열면 같은 크기 JPG 로 한 번 더.
// 완료 기준은 '금지'가 아니라 결과로 쓴다 — 실제로 함수를 돌려 캔버스 크기·타일 주소·고른 파일을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V2 = path.join(ROOT, 'prototype/v2-three');
const PE = path.join(ROOT, 'prototype/v2/assets/physical-earth');
const mainSrc = readFileSync(path.join(V2, 'js/main.js'), 'utf8');

// ─── V2-7 ───────────────────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(n)) out.push(p);
  }
  return out;
}
function specifierMap() {
  const pat = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  const map = new Map();   // 대상 파일 → Map(쿼리 → [가져가는 파일])
  for (const file of walk(V2)) {
    const src = readFileSync(file, 'utf8');
    const specs = [...src.matchAll(pat)].map((m) => m[1]);
    if (file.endsWith('.html')) specs.push(...[...src.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]));
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;
      const [p, q = ''] = spec.split('?');
      const target = path.normalize(path.join(path.dirname(file), p));
      if (!map.has(target)) map.set(target, new Map());
      const byQ = map.get(target);
      if (!byQ.has(q)) byQ.set(q, []);
      byQ.get(q).push(path.relative(V2, file));
    }
  }
  return map;
}

test('V2-7 — v2 의 어떤 모듈도 ?v= 가 다른 두 지정자로 불리지 않는다 (모듈이 두 벌 뜨지 않는다)', () => {
  const dup = [];
  for (const [target, byQ] of specifierMap()) {
    if (byQ.size > 1) dup.push(`${path.relative(ROOT, target)}: ${[...byQ].map(([q, fs]) => `?${q} ← ${fs.join(',')}`).join(' | ')}`);
  }
  assert.deepEqual(dup, [], `같은 파일을 서로 다른 URL 로 부르면 브라우저가 모듈을 두 번 받고 상태가 둘로 갈린다:\n${dup.join('\n')}`);
});

test('V2-7 — 현상 레지스트리는 네 곳 모두 한 지정자로 불린다', () => {
  const byQ = specifierMap().get(path.join(V2, 'js/phenomenon-registry.js'));
  assert.ok(byQ, '레지스트리를 부르는 곳을 못 찾았다');
  assert.equal(byQ.size, 1, `지정자가 ${byQ.size}개다: ${[...byQ.keys()].join(', ')}`);
  const importers = [...byQ.values()][0].map((f) => f.replace(/\\/g, '/')).sort();
  assert.deepEqual(importers, ['js/intel-questions.js', 'js/main.js', 'js/report-center.js', 'js/ui-shell.js']);
});

// ─── V2-5 ───────────────────────────────────────────────────────────────────────────────
// main.js 는 DOM 과 함께 떠서 import 할 수 없다 → loadGibsBase 원문을 꺼내 가짜 캔버스·이미지로 돌린다.
function extractLoadGibsBase() {
  const start = mainSrc.indexOf('  async function loadGibsBase(');
  assert.ok(start > 0, 'loadGibsBase 를 못 찾았다');
  const end = mainSrc.indexOf('\n  }\n', start);
  return mainSrc.slice(start, end + 4);
}
function runGibs({ level, okCount = Infinity } = {}) {
  const drawn = [];
  const urls = [];
  let canvas = null;
  const document = {
    createElement: () => (canvas = {
      width: 0, height: 0,
      getContext: () => ({ fillRect() {}, drawImage: (img, x, y) => drawn.push([x, y]), set fillStyle(_) {} }),
    }),
  };
  let seen = 0;
  class Image {
    set src(u) {
      urls.push(u);
      const ok = seen < okCount; seen += 1;
      queueMicrotask(() => (ok ? this.onload() : this.onerror()));
    }
  }
  class CanvasTexture { constructor(c) { this.image = c; } }
  const THREE = { CanvasTexture, RepeatWrapping: 1, ClampToEdgeWrapping: 2, LinearFilter: 3, SRGBColorSpace: 'srgb' };
  const fn = new Function('document', 'Image', 'THREE', `${extractLoadGibsBase()}\nreturn loadGibsBase;`)(document, Image, THREE);
  const st = { layer: 'VIIRS_Black_Marble', date: '2016-01-01', res: '500m', ext: 'png' };
  const p = level == null ? fn(st) : fn(st, 0, level);
  return p.then((r) => ({ r, urls, drawn, canvas }));
}

test('V2-5 — 2단계: 15장(5×3)을 받아 2560×1280 에 그린다 (캔버스 높이는 타일 수가 아니라 180° 에서)', async () => {
  const { r, urls, drawn, canvas } = await runGibs({ level: 2 });
  assert.equal(urls.length, 15);
  assert.ok(urls.every((u) => /\/500m\/2\/\d\/\d\.png$/.test(u)), urls[0]);
  assert.equal(canvas.width, 2560);
  assert.equal(canvas.height, 1280, '1536(3행×512)이면 셰이더가 위도를 17% 늘려 읽는다');
  assert.ok(drawn.some(([, y]) => y === 1024), '마지막 행(남위 54~90°)도 그린다 — 절반은 캔버스 밖으로 잘린다');
  assert.equal(r.level, 2);
  assert.equal(r.degPerPx, 0.140625);
  assert.equal(r.tex.image, canvas);
});

test('V2-5 — 기본값은 예전 그대로 3단계 50장 · 5120×2560 (위성 베이스 전환은 바뀌지 않는다)', async () => {
  const { r, urls, canvas } = await runGibs();
  assert.equal(urls.length, 50);
  assert.ok(urls.every((u) => /\/500m\/3\/\d\/\d\.png$/.test(u)));
  assert.equal(canvas.width, 5120);
  assert.equal(canvas.height, 2560);
  assert.equal(r.level, 3);
});

test('V2-5 — 문턱은 받은 단계 타일 수의 절반: 2단계는 15장 중 7장이면 실패, 8장이면 성공', async () => {
  await assert.rejects(runGibs({ level: 2, okCount: 7 }), /GIBS 타일 7\/15/);
  const { r } = await runGibs({ level: 2, okCount: 8 });
  assert.equal(r.ok, 8);
  await assert.rejects(runGibs({ level: 3, okCount: 24 }), /GIBS 타일 24\/50/);
});

test('V2-5 — 폰(또는 텍스처 한도 5120 미만)의 밤 불빛만 2단계를 받고, 해상도를 출처 줄에 적는다', () => {
  assert.match(mainSrc, /const nightLevel = \(isMobileUA \|\| \(maxTex > 0 && maxTex < 5120\)\) \? 2 : 3;/);
  assert.match(mainSrc, /\(\) => loadGibsBase\(st, 0, nightLevel\),\s*\n\s*\(\) => loadGibsBase\(st, 1, nightLevel\),\s*\n\s*\.\.\.NIGHT_FALLBACK\.map\(\(f\) => \(\) => loadGibsBase\(f, 0, nightLevel\)\),/);
  assert.match(mainSrc, /const resTxt = `\$\{degPerPx\.toFixed\(2\)\}°\/px`;/);
  // 위성 베이스(블루마블·트루컬러)는 단계를 넘기지 않는다 → 3단계 그대로
  assert.match(mainSrc, /const \{ tex, date, ok \} = await loadGibsBase\(st\);/);
});

// ─── V2-6 ───────────────────────────────────────────────────────────────────────────────
function basemapFor() {
  const m = mainSrc.match(/const BASEMAP_FOR = \(maxTex, mobile\) => \{[\s\S]*?\n\};/);
  assert.ok(m, 'BASEMAP_FOR 를 못 찾았다');
  return new Function(`${m[0]}\nreturn BASEMAP_FOR;`)();
}

test('V2-6 — 폰·4096 기기는 WebP 를 받고, JPG 를 대체 경로로 갖는다. 8192·2048 은 JPG 그대로', () => {
  const f = basemapFor();
  const phone = f(16384, true);
  assert.equal(phone.px, 4096);
  assert.equal(phone.url, '../v2/assets/physical-earth/ne2-base-4096.webp');
  assert.equal(phone.fallbackUrl, '../v2/assets/physical-earth/ne2-base-4096.jpg');
  assert.equal(f(4096, false).url, '../v2/assets/physical-earth/ne2-base-4096.webp');
  assert.deepEqual(f(16384, false), { url: '../v2/assets/physical-earth/ne2-base-8192.jpg', px: 8192 });
  assert.deepEqual(f(2048, true), { url: '../v2/assets/physical-earth/ne2-base-2048.jpg', px: 2048 });
  for (const u of [phone.url, phone.fallbackUrl, f(16384, false).url, f(2048, true).url]) {
    assert.ok(existsSync(path.join(V2, u)), `파일이 없다: ${u}`);
  }
  // WebP 가 안 열리면 JPG 로 한 번 더 받는다 — 바탕 지도가 없으면 지구가 색을 잃는다
  assert.match(mainSrc, /if \(!BASEMAP\.fallbackUrl\) throw err;[\s\S]{0,160}loadAsync\(BASEMAP\.fallbackUrl\)/);
});

test('V2-6 — WebP 는 진짜 4096×2048 WebP 이고, 영수증의 sha256·크기와 맞고, JPG 보다 작다', () => {
  const buf = readFileSync(path.join(PE, 'ne2-base-4096.webp'));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buf.toString('ascii', 12, 16), 'VP8 ', '손실 WebP(VP8) 한 장이어야 한다');
  // VP8 키프레임 머리: 시작 부호 9d 01 2a 뒤 14비트 폭·높이
  const o = 20 + 3;
  assert.deepEqual([...buf.subarray(o, o + 3)], [0x9d, 0x01, 0x2a]);
  assert.equal(buf.readUInt16LE(o + 3) & 0x3fff, 4096);
  assert.equal(buf.readUInt16LE(o + 5) & 0x3fff, 2048);
  const receipt = JSON.parse(readFileSync(path.join(PE, 'ne2-base.receipt.json'), 'utf8'));
  const w = receipt.outputs['ne2-base-4096.webp'];
  assert.ok(w, '영수증에 ne2-base-4096.webp 칸이 없다');
  assert.equal(w.sha256, createHash('sha256').update(buf).digest('hex'));
  assert.equal(w.bytes, buf.length);
  assert.match(w.bakedFrom, /다시 구운/);
  assert.ok(buf.length < receipt.outputs['ne2-base-4096.jpg'].bytes / 2, `${buf.length} B — JPG 의 절반도 안 줄었다`);
  // 옛 칸은 그대로다 (JPG 3장 · 타일)
  assert.equal(receipt.outputs['ne2-base-4096.jpg'].sha256,
    createHash('sha256').update(readFileSync(path.join(PE, 'ne2-base-4096.jpg'))).digest('hex'));
});

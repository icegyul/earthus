// Background Pack v1 (assets/background) — PD 2026-09-13 "BACKGROUND PACK INSERTION" §10 TEST
//   manifest count = 실제 파일 수 · 모든 path 존재 · 모든 WebP 읽힘(헤더·크기) · id 중복 0 · path 중복 0 · REJECT 는 런타임 등록(로드) 안 됨 · 24 배경 선택 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBackgroundSelector, motionFor, MOTION_BUDGET, LABEL_KO, coverLayout } from '../packages/wonder-environment/src/background-select.mjs';
import { REGIONS } from '../packages/globe-engine/src/regions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAN = path.join(ROOT, 'assets', 'background_manifest.json');
const QA = path.join(ROOT, 'assets', 'background_quality_report.json');
const REG = path.join(ROOT, 'content', 'registry', 'asset-registry.json');
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const quality = JSON.parse(fs.readFileSync(QA, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REG, 'utf8'));
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** WebP 헤더를 직접 읽어 크기를 낸다(RIFF/WEBP + VP8 / VP8L / VP8X). 못 읽으면 throw. */
function webpSize(f) {
  const b = fs.readFileSync(f);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', f); assert.equal(b.toString('ascii', 8, 12), 'WEBP', f);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), chunk };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff), chunk }; }
  if (chunk === 'VP8 ') { assert.equal(b[23], 0x9d); assert.equal(b[24], 0x01); assert.equal(b[25], 0x2a); return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, chunk }; }
  throw new Error(`알 수 없는 WebP 청크 ${chunk}: ${f}`);
}

test('배경 팩: manifest 24 = 실제 파일 24, 분류 world 1 · korea 4 · atmosphere 3 · region 16, 원본 ZIP sha 기록', () => {
  const files = fs.readdirSync(path.join(ROOT, 'assets', 'background')).filter(f => f.endsWith('.webp'));
  assert.equal(manifest.count, 24); assert.equal(manifest.assets.length, 24); assert.equal(files.length, 24, 'manifest count = actual file count');
  const cats = manifest.assets.reduce((m, a) => (m[a.category] = (m[a.category] ?? 0) + 1, m), {});
  assert.deepEqual(cats, { world: 1, korea: 4, atmosphere: 3, region: 16 });
  assert.deepEqual(manifest.categories, cats);
  assert.match(manifest.sourcePack.sha256, /^[0-9a-f]{64}$/);
  assert.ok(fs.existsSync(path.join(ROOT, manifest.sourcePack.manifestCopy)), '팩 manifest 원본 사본');
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'BACKGROUND_PRODUCTION_GUIDE_v1.md')));
});

test('배경 팩: 모든 path 존재 · bytes/sha256 일치 · WebP 읽힘(헤더 크기 = manifest 크기, 16:9 1920×1080) · id/path 중복 0', () => {
  const ids = new Set(), paths = new Set();
  for (const a of manifest.assets) {
    const f = path.join(ROOT, a.path);
    assert.ok(fs.existsSync(f), `없음: ${a.path}`);
    assert.equal(fs.statSync(f).size, a.bytes, a.path);
    assert.equal(sha256(f), a.sha256, a.path);
    const s = webpSize(f);
    assert.equal(s.w, a.width, `${a.path} width`); assert.equal(s.h, a.height, `${a.path} height`);
    assert.ok(Math.abs(a.width / a.height - 16 / 9) < 0.01, `${a.path} 16:9`);
    assert.equal(a.format, 'webp');
    assert.ok(!ids.has(a.id), `id 중복 ${a.id}`); ids.add(a.id);
    assert.ok(!paths.has(a.path), `path 중복 ${a.path}`); paths.add(a.path);
    for (const k of ['id', 'category', 'slug', 'region', 'path', 'width', 'height', 'format', 'bytes', 'version', 'sha256', 'status', 'load', 'safeCropPx', 'focal']) assert.ok(a[k] !== undefined, `${a.id}.${k}`);
    assert.ok(['ACCEPT', 'REJECT', 'REVIEW'].includes(a.status), a.id);
    const c = a.safeCropPx; assert.ok(c.left + c.right < a.width * 0.1 && c.top + c.bottom < a.height * 0.1, `${a.id} safe-crop 이 10% 넘음`);
  }
});

test('배경 품질 보고서: 24장 전부 기록, 상태가 manifest 와 같고, 내용 위반 0, REJECT 는 load 가 막힌다 (2026-09-13: ACCEPT 0 · REJECT 0 · REVIEW 24)', () => {
  assert.equal(quality.assets.length, 24); assert.equal(quality.summary.total, 24);
  for (const q of quality.assets) {
    const a = manifest.assets.find(x => x.id === q.id); assert.ok(a, q.id);
    assert.equal(a.status, q.status, q.id); assert.equal(a.sha256, q.sha256, q.id);
    for (const k of ['text', 'placeName', 'ui', 'button', 'logo', 'watermark', 'character', 'cardFrame', 'infographic']) assert.equal(q.checks[k], false, `${q.id} ${k}`);
    if (q.status === 'REJECT') assert.equal(a.load, 'blocked-by-review', q.id);
    if (q.productionStatus === 'PRODUCTION_REJECT') assert.ok(q.reasons.length > 0, q.id);
  }
  assert.equal(quality.summary.contentViolations, 0);
  assert.deepEqual([quality.summary.ACCEPT, quality.summary.REJECT, quality.summary.REVIEW], [0, 0, 24], '2026-09-13 검수 결과');
  assert.equal(quality.summary.productionReject, 24, '시트 여백/잔재·≈480p → production 승인 0');
});

test('레지스트리: environment-background 24 등록(필수 필드), REJECT 는 등록되되 load 차단, 로드 가능 수 = REVIEW+ACCEPT', () => {
  const bgs = registry.assets.filter(a => a.kind === 'environment-background');
  assert.equal(bgs.length, 24); assert.equal(registry.counts.environment_backgrounds, 24);
  for (const a of bgs) {
    for (const k of ['id', 'category', 'slug', 'region', 'path', 'width', 'height', 'format', 'bytes', 'version', 'sha256', 'status', 'load']) assert.ok(a[k] !== undefined, `${a.id}.${k}`);
    assert.equal(a.root, 'project'); assert.ok(a.path.startsWith('assets/background/'));
    const m = manifest.assets.find(x => x.id === a.id); assert.equal(a.sha256, m.sha256); assert.equal(a.bytes, m.bytes);
    if (a.status === 'REJECT') assert.equal(a.load, 'blocked-by-review');
    else assert.ok(['region-lazy', 'on-demand'].includes(a.load), `${a.id} ${a.load}`);
  }
  assert.equal(registry.counts.environment_backgrounds_loadable, bgs.filter(a => a.status !== 'REJECT').length);
  assert.ok(registry.sources['background-pack-v1']?.sha256 === manifest.sourcePack.sha256);
  assert.ok(!bgs.some(a => a.load === 'preload' || a.load === 'boot'), '24장 어느 것도 boot/preload 가 아니다');
});

test('배경 선택 24: 환경 지정 24 id 전부 · 한국 4 좌표 · 지역 12 · 극 남북 · 대기 3 시각 · 바다/미배정은 id 로만, REJECT 는 절대 안 골라진다', () => {
  const sel = createBackgroundSelector(manifest);
  for (const a of manifest.assets) {
    const r = sel.select({ envBackground: a.id });
    if (a.status === 'REJECT') assert.equal(r.asset, null, `${a.id} REJECT 는 선택 불가`);
    else { assert.equal(r.asset?.id, a.id); assert.equal(r.reason, 'environment'); }
  }
  const korea = [[37.57, 126.98, 'seoul'], [35.18, 129.08, 'busan'], [35.86, 129.22, 'gyeongju'], [33.5, 126.53, 'jeju']];
  for (const [lat, lon, slug] of korea) { const r = sel.select({ lat, lon, regionId: 'east-asia' }); assert.equal(r.asset?.slug, slug, slug); assert.equal(r.reason, 'korea'); }
  assert.equal(sel.select({ lat: 35.68, lon: 139.69, regionId: 'east-asia' }).asset?.slug, 'coast', '도쿄는 한국 반경 밖 → 동아시아 지역 배경');
  const expect = { 'east-asia': 'coast', europe: 'forest', 'north-africa': 'sahara', 'south-asia': 'himalaya', 'southeast-asia': 'ocean_shallow', 'north-america': 'grassland', 'south-america': 'jungle', oceania: 'island', africa: 'savanna', 'middle-east': 'desert_oasis', siberia: 'tundra' };
  for (const r of REGIONS) {
    if (r.id === 'polar') continue;
    const got = sel.select({ regionId: r.id, lat: r.centers[0].lat, lon: r.centers[0].lon });
    assert.equal(got.asset?.slug, expect[r.id], `${r.id} → ${got.asset?.slug}`); assert.equal(got.reason, 'region');
  }
  assert.equal(sel.select({ regionId: 'polar', lat: 85, lon: 0 }).asset?.slug, 'aurora'); assert.equal(sel.select({ regionId: 'polar', lat: -80, lon: 0 }).asset?.slug, 'tundra');
  assert.equal(sel.select({ hour: 10 }).asset?.slug, 'day'); assert.equal(sel.select({ hour: 18 }).asset?.slug, 'sunset'); assert.equal(sel.select({ hour: 23 }).asset?.slug, 'night'); assert.equal(sel.select({ hour: 3 }).asset?.slug, 'night');
  assert.equal(sel.select({}).asset, null, '아무 근거 없으면 null(종이 폴백)');
  for (const slug of ['earth', 'underwater', 'volcano', 'tibet', 'canyon']) assert.ok(manifest.assets.some(a => a.slug === slug), slug);
  const idsReachable = new Set();
  for (const a of manifest.assets) if (sel.select({ envBackground: a.id }).asset) idsReachable.add(a.id);
  assert.equal(idsReachable.size, 24, '24 전부 선택 가능(REJECT 0 인 현재)');
});

test('모바일 crop: 375×812 · 390×844 · 1440×900 · 1024×768 에서 24장 전부 safe-crop 안전 상자가 화면을 덮는다(시트 여백 0px 노출), 세로 폰은 아래쪽(전경) 우선', () => {
  for (const [Cw, Ch] of [[375, 812], [390, 844], [1440, 900], [1024, 768]]) {
    for (const a of manifest.assets) {
      const L = coverLayout(a, Cw, Ch);
      assert.ok(L.coversViewport, `${a.id} @${Cw}×${Ch}: safe ${JSON.stringify(L.safe)}`);
      assert.ok(L.w >= Cw - 1e-6 && L.h >= Ch - 1e-6, `${a.id} @${Cw}×${Ch} 그림이 화면보다 작다`);
      if (Ch > Cw) {
        // 세로 폰: 위(하늘)를 더 잘라내고 아래(지형·전경 공간)를 남긴다 — 그림 아래쪽 여백선이 화면 아래와 거의 맞닿는다
        assert.ok(Math.abs(L.safe.bottom - Ch) <= (L.safe.bottom - L.safe.top) * 0.4, `${a.id} @${Cw}×${Ch} 아래쪽 우선 배치`);
        assert.ok(L.visibleFraction.w < 0.35 && L.visibleFraction.h > 0.9, `${a.id} 세로 폰 가시 비율 ${JSON.stringify(L.visibleFraction)}`);
      }
    }
  }
  const noCrop = coverLayout({ width: 1920, height: 1080, safeCropPx: { left: 0, right: 0, top: 0, bottom: 0 }, focal: { x: .5, y: .5 } }, 1920, 1080);
  assert.ok(Math.abs(noCrop.scale - 1) < 1e-9 && Math.abs(noCrop.x) < 1e-9 && Math.abs(noCrop.y) < 1e-9, '여백 없고 같은 크기면 1:1');
});

test('배경 모션: MAIN 1 + SECONDARY ≤ 2, 24 slug 전부 배정, 한국어 라벨 24', () => {
  for (const a of manifest.assets) {
    const m = motionFor(a.slug);
    assert.ok(typeof m.main === 'string' && m.main.length > 0, a.slug);
    assert.ok(m.secondary.length <= MOTION_BUDGET.secondary, `${a.slug} secondary ${m.secondary.length}`);
    assert.ok(!m.secondary.includes(m.main), `${a.slug} main 과 secondary 가 겹친다`);
    assert.ok(typeof LABEL_KO[a.slug] === 'string' && LABEL_KO[a.slug].length > 0, `${a.slug} 라벨`);
  }
  assert.equal(motionFor('nope', { main: 'clouds', secondary: ['a', 'b', 'c'] }).secondary.length, 2, '예산 초과분은 잘린다');
});

// Paper Earth Material v1 — 종이 재질 팩의 편입·등록·위도 배정을 검사한다.
// 그림 합성 자체(캔버스)는 브라우저 검증의 몫. 여기서는 파일·해시·쓰임·띠 배정이 규칙대로인지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SWATCH_ZONES, SWATCH_FEATHER, SWATCH_NAMES, swatchAlphaAt, swatchWeightsAt } from '../packages/globe-engine/src/paper-texture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAN = path.join(ROOT, 'assets', 'material', 'paper_earth_material_manifest.json');
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'registry', 'asset-registry.json'), 'utf8'));
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('재질 팩: 10장 편입, 실제 파일과 bytes·sha256 일치, 전부 2048² WebP, 원본 ZIP sha 기록', () => {
  assert.equal(manifest.count, 10); assert.equal(manifest.textures.length, 10);
  const dir = path.join(ROOT, 'assets', 'material', 'paper-earth');
  assert.equal(fs.readdirSync(dir).filter(f => f.endsWith('.webp')).length, 10, 'manifest 수 = 실제 파일 수');
  const ids = new Set(), paths = new Set();
  for (const t of manifest.textures) {
    const f = path.join(ROOT, t.path);
    assert.ok(fs.existsSync(f), `없음: ${t.path}`);
    assert.equal(fs.statSync(f).size, t.bytes, t.path);
    assert.equal(sha256(f), t.sha256, t.path);
    assert.equal(t.width, 2048); assert.equal(t.height, 2048); assert.equal(t.format, 'webp');
    assert.ok(!ids.has(t.id), `id 중복 ${t.id}`); ids.add(t.id);
    assert.ok(!paths.has(t.path), `path 중복 ${t.path}`); paths.add(t.path);
    assert.ok(t.path.startsWith('assets/material/paper-earth/'), t.path);
    for (const k of ['id', 'role', 'layer', 'usedInV1', 'tiling', 'wrap', 'measured', 'seamSeverity']) assert.ok(t[k] !== undefined, `${t.id}.${k}`);
  }
  assert.match(manifest.sourcePack.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.declared.geography_baked, false, '지리는 이 팩이 아니라 자료가 정한다');
  assert.equal(manifest.declared.labels_baked, false);
  assert.equal(manifest.declared.characters_baked, false);
  assert.equal(manifest.declared.ui_baked, false);
  // 벤더 문서·manifest 원본은 팩 사본 자리에 둔다(docs/ 는 우리가 쓴 문서 자리)
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'material', 'MATERIAL_INTEGRATION.pack-v1.md')));
  assert.ok(fs.existsSync(path.join(ROOT, manifest.sourcePack.manifestCopy)));
  assert.ok(!fs.existsSync(path.join(ROOT, 'docs', 'MATERIAL_INTEGRATION.md')), '벤더 문서를 docs/ 에 덮어쓰지 않는다');
});

test('재질 팩: manifest 의 integration 이 실제로 있는 파일과 함수를 가리킨다', () => {
  const it = manifest.integration;
  assert.equal(typeof it, 'object');
  for (const key of ['layers_1_2_3_6_7_8', 'layers_4_5']) {
    const [file, fn] = it[key].split(' → ');
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${key}: ${file} 이 없다`);
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(src.includes(fn.replace('()', '')), `${key}: ${file} 안에 ${fn} 이 없다`);
  }
});

test('재질 팩: v1 에 쓰는 8장의 쓰임이 모두 정해져 있고, 이음새가 큰 것은 거울 반복으로 깐다', () => {
  const used = manifest.textures.filter(t => t.usedInV1);
  assert.equal(used.length, 8, 'v1 사용 8장');
  const roles = used.map(t => t.role).sort();
  assert.deepEqual(roles, ['desert-albedo', 'fiber-overlay', 'forest-albedo', 'ice-albedo', 'land-albedo', 'normal-map', 'ocean-albedo', 'roughness-map']);
  for (const t of manifest.textures) {
    const seam = Math.max(t.measured.seamMeanDiff.leftRight, t.measured.seamMeanDiff.topBottom);
    assert.equal(t.wrap, seam > 20 ? 'mirrored-repeat' : 'repeat', `${t.id} 이음새 ${seam}`);
    if (t.usedInV1 && t.wrap === 'mirrored-repeat') assert.equal(t.role, 'normal-map', '거울 반복이 필요한 것은 three 재질에 직접 물리는 노멀뿐');
  }
  const unused = manifest.textures.filter(t => !t.usedInV1).map(t => t.id).sort();
  assert.deepEqual(unused, ['paper_edge_softmask', 'paper_height'], '안 쓰는 둘은 등록만 하고 이유를 적어 둔다');
  for (const t of manifest.textures.filter(t => !t.usedInV1)) assert.ok(t.note.length > 10, `${t.id} 미사용 이유`);
  assert.equal(manifest.shaderLayers.length, 8, 'MATERIAL_INTEGRATION.md 의 층 8개');
});

test('레지스트리: paper-material 10장 등록(root project · on-demand), 어느 것도 boot/preload 가 아니다', () => {
  const mat = registry.assets.filter(a => a.kind === 'paper-material');
  assert.equal(mat.length, 10);
  assert.equal(registry.counts.paper_material, 10);
  assert.equal(registry.counts.paper_material_used_v1, 8);
  for (const a of mat) {
    assert.equal(a.root, 'project'); assert.equal(a.load, 'on-demand');
    const m = manifest.textures.find(t => t.id === a.id);
    assert.ok(m, a.id); assert.equal(a.sha256, m.sha256); assert.equal(a.bytes, m.bytes); assert.equal(a.path, m.path);
    for (const k of ['role', 'layer', 'width', 'height', 'format', 'version', 'wrap']) assert.ok(a[k] !== undefined, `${a.id}.${k}`);
  }
  assert.ok(!mat.some(a => ['boot', 'preload'].includes(a.load)), '첫 화면에 재질을 받지 않는다');
  assert.equal(registry.sources['paper-earth-material-v1'].sha256, manifest.sourcePack.sha256);
});

test('위도 배정: 적도·온대는 숲 종이, 사막 띠는 모래 종이, 극지는 얼음 종이 — 남북 대칭이고 구성비 합은 1', () => {
  const cases = [[0, 'forest'], [8, 'forest'], [26, 'desert'], [50, 'forest'], [85, 'ice'], [-3, 'forest'], [-26, 'desert'], [-80, 'ice']];
  for (const [lat, want] of cases) {
    const wts = swatchWeightsAt(lat);
    const top = SWATCH_NAMES.reduce((a, b) => (wts[b] > wts[a] ? b : a));
    assert.equal(top, want, `${lat}° → ${top} (${JSON.stringify(wts)})`);
  }
  for (let lat = -90; lat <= 90; lat += 1) {
    const w = swatchWeightsAt(lat);
    const sum = SWATCH_NAMES.reduce((a, k) => a + w[k], 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${lat}° 합 ${sum}`);
    for (const k of SWATCH_NAMES) assert.ok(w[k] >= 0 && w[k] <= 1, `${lat}° ${k} ${w[k]}`);
    assert.deepEqual(swatchWeightsAt(-lat), w, `${lat}° 남북 대칭`);
  }
  // 초원·스텝 띠(사이 구간)는 기본 종이가 우세하다
  for (const lat of [16, 37]) assert.ok(swatchWeightsAt(lat).land > 0.5, `${lat}° 는 기본 종이`);
});

test('위도 배정: 띠 경계는 5° 에 걸쳐 섞인다(자로 그은 듯 끊기지 않는다), 바탕 종이는 늘 1', () => {
  assert.equal(SWATCH_FEATHER, 5);
  assert.equal(swatchAlphaAt('land', 0), 1);
  assert.equal(swatchAlphaAt('land', 90), 1);
  for (const [name, zones] of Object.entries(SWATCH_ZONES)) {
    for (const [lo, hi] of zones) {
      if (lo > 0) {
        assert.ok(swatchAlphaAt(name, lo - SWATCH_FEATHER - 0.5) < 0.02, `${name} ${lo}° 아래는 안 덮는다`);
        assert.ok(Math.abs(swatchAlphaAt(name, lo) - 0.5) < 0.02, `${name} ${lo}° 에서 반쯤`);
      }
      if (hi < 90) {
        assert.ok(Math.abs(swatchAlphaAt(name, hi) - 0.5) < 0.02, `${name} ${hi}° 에서 반쯤`);
        assert.ok(swatchAlphaAt(name, hi + SWATCH_FEATHER + 0.5) < 0.02, `${name} ${hi}° 위는 안 덮는다`);
      }
      assert.ok(swatchAlphaAt(name, (lo + hi) / 2) > 0.98, `${name} 한가운데는 꽉 덮는다`);
    }
  }
  // 사막 띠에서 숲 종이가 나오면 안 된다(사하라에 정글이 서는 일 방지)
  assert.equal(swatchAlphaAt('forest', 26), 0);
  assert.equal(swatchAlphaAt('desert', 5), 0);
  assert.equal(swatchAlphaAt('ice', 50), 0);
});

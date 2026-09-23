// 폰 LTE 첫 화면 — PERF-LTE-PLAN-2026-09-23 V2-1(폰은 z3 한 장) · V2-2(지구 먼저, 지형은 나중에) 회귀 잠금.
//   사고: 덮개가 지형 z4 256장(18.54 MB · 버지니아 · HTTP/1.1)을 다 받을 때까지 걷히지 않아 폰 LTE 23.97 s 가 걸렸다.
//   완료 기준은 결과로 쓴다 — 실제 파일(무손실 WebP 헤더·크기·sha)과 실제 함수(globalTerrainKm)를 돌려 본다.
//   브라우저 측정(덮개 4.4~4.6 s · elevation-tiles-prod 0건 · z3 캔버스 = 원본 타일 화소 일치)은
//   build/perf-investigation/v2-terrain-check.mjs 가 한다(여기는 저장소 안에서 되는 것만).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalTerrainKm } from '../../prototype/v2-three/js/flood-overlay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V2 = path.join(ROOT, 'prototype/v2-three');
const mainSrc = readFileSync(path.join(V2, 'js/main.js'), 'utf8').replace(/\r\n/g, '\n');
const constOf = (name) => {
  const m = mainSrc.match(new RegExp(`const ${name} = ([^;]+);`));
  assert.ok(m, `main.js 에 ${name} 이 없다`);
  return m[1].trim();
};

test('V2-1 폰 지형 한 장은 번들 안의 무손실 WebP 2048×2048 이고 영수증 sha 와 같다', () => {
  const rel = JSON.parse(constOf('TERRAIN_Z3_URL').replace(/'/g, '"'));
  assert.equal(rel, 'assets/terrain/terrarium-z3.webp', 'index.html 기준 상대 경로(data/icesheet.png 와 같은 규칙)');
  const file = path.join(V2, rel);
  assert.ok(existsSync(file), `${rel} 이 없다 — 번들에 안 실리면 폰은 z4 타일로 돌아간다`);
  const buf = readFileSync(file);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buf.toString('ascii', 12, 16), 'VP8L', '손실 VP8 이면 빨강 1 차이 = 높이 256 m 가 깨진다');
  assert.equal(buf[20], 0x2f, 'VP8L 서명');
  const bits = buf.readUInt32LE(21);
  assert.equal((bits & 0x3fff) + 1, 2048, '폭');
  assert.equal(((bits >>> 14) & 0x3fff) + 1, 2048, '높이');
  assert.equal(Number(constOf('TERRAIN_Z3_SIZE')), 2048);
  const receipt = JSON.parse(readFileSync(path.join(V2, 'assets/terrain/terrarium-z3.receipt.json'), 'utf8'));
  assert.equal(receipt.output.sha256, createHash('sha256').update(buf).digest('hex'));
  assert.equal(receipt.output.bytes, buf.length);
  assert.equal(receipt.losslessCheck.result, 'PASS');
  assert.equal(receipt.source.zoom, 3);
  assert.ok(Array.isArray(receipt.attribution.required) && receipt.attribution.required.length >= 11, '출처 의무 11항목');
});

test('V2-1 z3 한 장은 1:1 로만 그린다 — 크기가 다르면 확대·축소하지 않고 거절해 타일로 간다', () => {
  const body = mainSrc.slice(mainSrc.indexOf('function loadTerrariumMosaic('), mainSrc.indexOf('// 셰이더', mainSrc.indexOf('function loadTerrariumMosaic(')));
  assert.match(body, /img\.naturalWidth !== size \|\| img\.naturalHeight !== size/);
  assert.match(body, /canvas\.width = size;\s*canvas\.height = size;/);
  assert.match(body, /ctx\.drawImage\(img, 0, 0\);/, '인자 3개 — 목적지 크기를 주면 캔버스가 채널마다 보간한다');
  assert.doesNotMatch(body, /drawImage\(img, 0, 0, /);
  // 폰(isMobileUA 또는 굵은 포인터)만 z3, 실패하면 예전 z4 타일 길
  assert.match(mainSrc, /const terrainLite = isMobileUA \|\| !!\(window\.matchMedia && window\.matchMedia\('\(pointer: coarse\)'\)\.matches\);/);
  assert.match(mainSrc, /if \(terrainLite\) \{\s*try \{\s*const r = await loadTerrariumMosaic\(TERRAIN_Z3_URL\);\s*return \{ \.\.\.r, z: 3 \};/);
  assert.match(mainSrc, /const r = await loadTerrariumHeightCanvas\([^)]*\) => \{[^}]*\}\);\s*return \{ \.\.\.r, z: TERRARIUM_ZOOM \};/);
});

test('V2-2 덮개는 지형을 기다리지 않는다 — 지형은 main() 끝에서, 덮개를 걷은 뒤에 얹는다', () => {
  const main = mainSrc.slice(mainSrc.indexOf('async function main()'));
  // 주석(사고 기록)은 옛 줄을 인용하므로 빼고 본다. 지형을 await 하는 줄은 terrainPromise 안(async 콜백)에만 있어야 한다.
  const code = main.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const beforeBase = code.slice(0, code.indexOf('const baseTex = await basePromise;'));
  const outsidePromise = beforeBase.slice(0, beforeBase.indexOf('const terrainPromise ='));
  assert.ok(outsidePromise.length > 1000 && beforeBase.includes('const terrainPromise ='));
  assert.doesNotMatch(outsidePromise, /await loadTerrarium/, '덮개 앞에서 256장을 기다리던 줄');
  assert.equal((code.match(/await loadTerrarium(HeightCanvas|Mosaic)\(/g) || []).length, 2, 'terrainPromise 안의 두 줄뿐');
  assert.match(main, /const terrainPromise = basePromise\.then\(async \(\) => \{/, '바탕 지도 뒤에 시작한다');
  const done = main.indexOf("loading.classList.add('done');");
  const apply = main.indexOf('terrainPromise.then(applyTerrain)');
  assert.ok(done > 0 && apply > done, 'applyTerrain 은 덮개를 걷은 뒤에 건다(위 const 들의 TDZ)');
  // 받는 동안의 상태: uHasHeight 0 · 페이드 0 · detail 없음
  assert.match(main, /uHasHeight: \{ value: hasHeight \},/);
  assert.match(main, /uTerrainFade: \{ value: 0 \},/);
  assert.match(main, /let detail = hasHeight \? new DetailTerrain/);
  assert.match(main, /get detail\(\) \{ return detail; \}/, '__earthus.detail 이 null 로 굳지 않게');
  // 도착하면 켠다 — 다 그린 캔버스만 넣는다(heightAtJs 캐시의 전제)
  const a = main.slice(main.indexOf('const applyTerrain = '), apply);
  for (const line of ['baseHeightCanvas = hCanvas;', 'uniforms.uHeightMap.value = heightTex;', 'uniforms.uHasHeight.value = 1;',
    'detail = new DetailTerrain(uniforms, baseHeightCanvas);', 'terrainFadeT0 = performance.now();', 'replaceAfterTerrain();']) {
    assert.ok(a.includes(line), `applyTerrain 에 없다: ${line}`);
  }
  // 실패는 덮개(opacity 0) 대신 알림으로 — :5133 과 같은 사고를 되풀이하지 않는다
  assert.match(main, /photoFallbackForNoTerrain\(\);\s*toast\('지형 데이터를 받지 못했습니다/);
  assert.doesNotMatch(main, /if \(!hasHeight\) \{\s*\/\/ 지형 전체 실패 폴백/, '이 자리의 hasHeight 는 늘 0 이다 — 모든 세션이 사진 100% 가 된다');
});

test('V2-2 페이드는 지구 셰이더에만 곱하고 uExagger·uHasHeight 는 건드리지 않는다', () => {
  const vert = mainSrc.slice(mainSrc.indexOf('const EARTH_VERT ='), mainSrc.indexOf('const EARTH_FRAG ='));
  assert.match(vert, /vec3 p = vUnit \* \(1\.0 \+ disp \* uTerrainFade\);/);
  const frag = mainSrc.slice(mainSrc.indexOf('const EARTH_FRAG ='), mainSrc.indexOf('const EARTH_FRAG =') + 20000);
  assert.match(frag, /\* \(1\.0 - poleFade\) \* uTerrainFade;/, '음영');
  assert.match(frag, /float photoMix = mix\(1\.0, uPhotoMix, uTerrainFade\);/, '받는 동안 바탕 지도 100%');
  // 프레임 루프: 0.6 s smoothstep, 끝나면 다시 세우기
  assert.equal(Number(constOf('TERRAIN_FADE_MS')), 600);
  assert.match(mainSrc, /uniforms\.uTerrainFade\.value = k \* k \* \(3 - 2 \* k\);/);
  assert.match(mainSrc, /prefers-reduced-motion: reduce/);
  // 과장 값은 페이드와 무관하게 예전 식 그대로(구름 껍질·표식이 같이 읽는다)
  assert.match(mainSrc, /uniforms\.uExagger\.value = Math\.min\(exagUser, exagCeil\);/);
});

test('출처 문구는 기기가 실제로 얹은 단계를 말한다 — 폰 z3 약 19.6 km/px · PC z4 약 9.8 km/px', () => {
  const km = JSON.parse(constOf('TERRAIN_LEVEL_KM').replace(/(\d+):/g, '"$1":'));
  assert.equal(km[3], +(40075 / 2048).toFixed(1));
  assert.equal(km[4], +(40075 / 4096).toFixed(1));
  // 고정 문구 '전역 z4 + 지역' · 'Terrarium z4 · 적도 약 9.8' 가 화면 글자로 남아 있지 않다
  const code = mainSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /'AWS Terrarium 실고도 — 전역 z4/);
  assert.doesNotMatch(code, /<br\/>전역 z4 \+ 지역/);
  assert.doesNotMatch(code, /AWS Terrarium z4 · 적도 약 9\.8 km\/px/);
  assert.equal((code.match(/\$\{terrainLevelText\(\)\}/g) || []).length, 3, '실지형 카드 · 배경 지구 카드 · 등심선 카드');
  const sea = readFileSync(path.join(V2, 'js/seafloor.js'), 'utf8');
  assert.match(sea, /고도맵\(AWS \$\{this\.terrainLabel\}\)/);
  assert.match(mainSrc, /seafloor\.terrainLabel = `Terrarium z\$\{z\} · 적도 약 \$\{TERRAIN_LEVEL_KM\[z\]\} km\/px`;/);
  const reg = readFileSync(path.join(V2, 'js/phenomenon-registry.js'), 'utf8');
  assert.match(reg, /PC 는 z4 · 적도 약 9\.8 km\/px, 폰·태블릿은 z3 · 약 19\.6 km\/px/);
  // 잠기는 땅 카드 ③ 은 얹힌 고도맵의 폭에서 센다
  assert.equal(Math.round(globalTerrainKm({ image: { width: 2048 } })), 20);
  assert.equal(Math.round(globalTerrainKm({ image: { width: 4096 } })), 10);
  assert.equal(globalTerrainKm(null), null);
});

test('캐시 토큰 — 바뀐 모듈은 새 ?v= 로 불린다', () => {
  const html = readFileSync(path.join(V2, 'index.html'), 'utf8');
  // 2026-09-23 정정: 정확한 토큰을 박으면 다음 변경(200 B5)이 이 시험을 깬다 — 지키려는 것은 '지형을 실은 뒤로 199 아래로 돌아가지 않는다'.
  const mv = html.match(/src="\.\/js\/main\.js\?v=(\d+)-[a-z0-9-]+"/);
  assert.ok(mv && Number(mv[1]) >= 199, 'main.js 캐시 토큰이 지형 이전 값이다');
  assert.match(mainSrc, /from '\.\/seafloor\.js\?v=3'/);
  assert.match(mainSrc, /from '\.\/live-layers\.js\?v=40-terrain'/);
  assert.match(mainSrc, /from '\.\/intel-strip\.js\?v=2'/);
  assert.match(readFileSync(path.join(V2, 'js/live-layers.js'), 'utf8'), /from '\.\/flood-overlay\.js\?v=2'/);
  assert.match(readFileSync(path.join(V2, 'js/intel-strip.js'), 'utf8'), /from '\.\/intel-questions\.js\?v=2'/);
  for (const f of ['main.js', 'report-center.js', 'ui-shell.js', 'intel-questions.js']) {
    assert.match(readFileSync(path.join(V2, 'js', f), 'utf8'), /phenomenon-registry\.js\?v=6'/, f);
  }
  // 덮개 글자가 i18n 에 의해 '지형 데이터 로딩 준비…' 로 되돌아가지 않는다
  assert.doesNotMatch(html, /id="load-msg" data-i18n=/);
});

// ── 반박 검수(2026-09-23) — 지형이 뒤에 오면서 생긴 '평평한 창'에서 **지어낸 0 m** 가 새지 않는다 ──
//   사고: 덮개가 지형을 기다리지 않게 되자, 그 사이(폰 약 6.5 s · PC LTE 약 33 s)에 heightAtJs ≡ 0 이었다.
//   네팔을 누르면 '최고 고도 (근사) 0 m', 해구 표는 해구마다 '0 m', 물어보기 문맥은 '지면고도_m: 0' 이었다.
//   결과로 쓴다: 지형 전에는 숫자가 **없어야** 하고, 지형 뒤에는 숫자가 **나와야** 한다.
test('검수 — 해구 표: 고도맵 전에는 —, 얹힌 뒤에는 수심이 나온다', async () => {
  const { SeaFloor } = await import('../../prototype/v2-three/js/seafloor.js');
  const sf = new SeaFloor({ add() {} }, () => 0, () => '');
  sf.trenches = [{ ko: '마리아나 해구', id: 1, minD: 0, deepest: { lat: 11.37, lon: 142.59, d: 0 }, anchor: { lat: 11.37, lon: 142.59 }, dense: [] }];
  const before = sf.card();
  assert.doesNotMatch(before, /<span class="v">0 m<\/span>/, '지형 전 0 m 는 지어낸 값이다');
  assert.match(before, /<span class="v">—<\/span>/);
  assert.match(sf.trenchCard(sf.trenches[0]), /고도맵 아직 없음/);
  sf.terrainReady = true;
  sf.trenches[0].minD = -9131; sf.trenches[0].deepest.d = -9131;
  assert.match(sf.card(), /-9,131 m/, '지형 뒤에는 수심이 나와야 한다');
  assert.doesNotMatch(sf.trenchCard(sf.trenches[0]), /고도맵 아직 없음/);
});

test('검수 — 나라 카드 최고 고도 · 물어보기 지면고도는 고도맵이 있을 때만 숫자다', () => {
  const fn = mainSrc.slice(mainSrc.indexOf('const countryMaxHRow = '), mainSrc.indexOf('focus.onChange = (f) => {'));
  assert.match(fn, /if \(!baseHeightCanvas\)/);
  assert.match(fn, /지형 받는 중…/);
  assert.match(fn, /'UNAVAILABLE'/);
  const onChange = mainSrc.slice(mainSrc.indexOf('focus.onChange = (f) => {'), mainSrc.indexOf('const focusLiveRow'));
  assert.match(onChange, /\+ maxHRow/);
  assert.doesNotMatch(onChange, /heightAtJs\(/, '나라 카드는 countryMaxHRow 로만 고도를 읽는다');
  // 지형 도착 뒤 같은 나라의 줄을 다시 센다 · 실패하면 UNAVAILABLE 로 바꾼다
  assert.match(mainSrc, /tryIt\('focusMaxH'/);
  assert.match(mainSrc, /seafloor\.terrainReady = true/);
  assert.match(mainSrc, /const hM = baseHeightCanvas \? heightAtJs\(lat, lon\) : NaN;/);
  // 확대 창이 못 서도 전역 부조는 선다
  assert.match(mainSrc, /try \{ detail = new DetailTerrain\(uniforms, baseHeightCanvas\); \} catch/);
});

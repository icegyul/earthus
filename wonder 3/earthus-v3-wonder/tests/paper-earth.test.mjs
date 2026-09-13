// Paper Earth Core (PHASE 1) — 종이 지구의 순수 계산부. three·DOM 없이 검사한다.
// 그림 자체(캔버스 굽기)는 브라우저 검증의 몫이고, 여기서는 색·띠·장식 앵커·구름/별/이름표 계획이 규칙대로인지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { biomeAt, landToneAt, paperTone, BIOME_ANCHORS, TERRAIN_RANGES } from '../packages/globe-engine/src/paper-texture.mjs';
import { CONTINENT_TAGS, cloudPlan, starPlan } from '../packages/globe-engine/src/ambient.mjs';

const hsl = s => { const m = /^hsl\((-?\d+) (\d+)% (\d+)%\)$/.exec(s); assert.ok(m, `hsl 형식: ${s}`); return { h: +m[1], s: +m[2], l: +m[3] }; };

test('paper-earth: 위도 → 생물군 띠 (적도 숲 · 사막 · 온대 · 극지), 남북 대칭', () => {
  const cases = [[0, 'tropical'], [8, 'tropical'], [15, 'savanna'], [26, 'desert'], [38, 'steppe'], [50, 'temperate'], [62, 'taiga'], [80, 'polar'], [90, 'polar']];
  for (const [lat, name] of cases) { assert.equal(biomeAt(lat), name, `${lat}°`); assert.equal(biomeAt(-lat), name, `${-lat}°`); }
  assert.equal(biomeAt(23.5), 'desert', '사하라·칼라하리 위도는 모래');
  assert.equal(biomeAt(-3), 'tropical', '아마존 위도는 정글');
});

test('paper-earth: 땅 종이색은 위도에 따라 이어지고(끊김 없음), 기준 위도에서는 기준색 그대로', () => {
  for (const a of BIOME_ANCHORS) {
    const c = hsl(landToneAt(a.at));
    assert.deepEqual([c.h, c.s, c.l], [a.h, a.s, a.l], a.name);
    assert.deepEqual(hsl(landToneAt(-a.at)), c, `${a.name} 남반구 대칭`);
  }
  // 1° 씩 훑어도 밝기·색상이 갑자기 튀지 않는다(종이 띠가 자로 그은 듯 끊기면 안 된다)
  let prev = hsl(landToneAt(0));
  for (let lat = 1; lat <= 90; lat++) {
    const c = hsl(landToneAt(lat));
    assert.ok(Math.abs(c.l - prev.l) <= 4, `밝기 급변 ${lat}°: ${prev.l} → ${c.l}`);
    assert.ok(Math.abs(c.h - prev.h) <= 12, `색상 급변 ${lat}°: ${prev.h} → ${c.h}`);
    prev = c;
  }
  assert.ok(hsl(landToneAt(5)).h > 100 && hsl(landToneAt(5)).h < 150, '적도는 초록');
  assert.ok(hsl(landToneAt(26)).h < 60, '사막 띠는 모래색');
  assert.ok(hsl(landToneAt(85)).l > 80, '극지는 흰 종이');
});

test('paper-earth: 나라별 색 차이는 아주 옅게만(오려 붙인 낱장 느낌), 같은 코드는 늘 같은 값', () => {
  for (const code of ['KR', 'BR', 'CA', 'AQ', '']) {
    const t = paperTone(code, 30), t2 = paperTone(code, 30);
    assert.deepEqual(t, t2, `${code} 는 결정적이어야 한다`);
    assert.ok(t.alpha <= 0.12, `${code} alpha ${t.alpha} — 띠 색을 덮으면 안 된다`);
    assert.ok(Math.abs(t.hueShift) <= 6 && Math.abs(t.lightShift) <= 4, code);
  }
  assert.notDeepEqual(paperTone('KR', 30), paperTone('JP', 30), '나라마다 조금씩 달라야 한다');
  assert.equal(paperTone('AQ', -80).biome, 'polar');
});

test('paper-earth: 장식 산줄기 앵커는 실제 좌표 범위 안이고 id 가 겹치지 않는다 (고도 자료 아님 — 장식)', () => {
  assert.ok(TERRAIN_RANGES.length >= 12);
  const ids = new Set();
  for (const r of TERRAIN_RANGES) {
    assert.ok(!ids.has(r.id), `id 중복 ${r.id}`); ids.add(r.id);
    for (const [lat, lon] of [r.a, r.b]) {
      assert.ok(lat >= -90 && lat <= 90, `${r.id} lat ${lat}`);
      assert.ok(lon >= -180 && lon <= 180, `${r.id} lon ${lon}`);
    }
  }
  const him = TERRAIN_RANGES.find(r => r.id === 'himalaya');
  assert.ok(him.a[0] > 25 && him.b[0] > 25 && him.a[1] > 65 && him.b[1] < 100, '히말라야는 아시아 남쪽');
  const andes = TERRAIN_RANGES.find(r => r.id === 'andes');
  assert.ok(andes.a[1] < -60 && andes.b[0] < 0, '안데스는 남아메리카 서쪽');
});

test('ambient: 종이 구름 10장 — 지구 가까이(1.03~1.16) 떠서 아주 느리게 흐르고, 경도가 한쪽에 몰리지 않는다', () => {
  const c = cloudPlan();
  assert.equal(c.length, 10);
  for (const x of c) {
    assert.ok(x.r >= 1.03 && x.r <= 1.16, `r ${x.r}`);
    assert.ok(Math.abs(x.lat) <= 64, `lat ${x.lat}`);
    assert.ok(x.lon >= -180 && x.lon <= 180, `lon ${x.lon}`);
    assert.ok(x.degPerSec > 0.3 && x.degPerSec < 0.9, `속도 ${x.degPerSec} — 한 바퀴 7분보다 느려야 한다`);
    assert.ok(x.size >= 0.17 && x.size <= 0.30, `size ${x.size}`);
    assert.ok([0, 1, 2].includes(x.shape));
  }
  const quads = new Set(c.map(x => Math.floor((x.lon + 180) / 90)));
  assert.ok(quads.size >= 3, '경도 네 구역 중 셋 이상에 퍼져 있어야 한다');
  assert.deepEqual(cloudPlan(), c, '같은 씨앗이면 같은 배치');
  assert.equal(cloudPlan(4).length, 4);
});

test('ambient: 별은 지구보다 훨씬 먼 구면에, 이름표는 대륙 6개만 (과도한 라벨 금지)', () => {
  const s = starPlan();
  assert.equal(s.length, 420);
  for (const p of s) {
    const R = Math.hypot(p.x, p.y, p.z);
    assert.ok(R > 20 && R < 40, `별 거리 ${R} — 카메라(≈3.6)보다 훨씬 멀어야 한다`);
    assert.ok(p.alpha > 0 && p.alpha <= 1);
  }
  assert.equal(CONTINENT_TAGS.length, 6);
  const ids = new Set(CONTINENT_TAGS.map(t => t.id));
  assert.equal(ids.size, 6);
  for (const t of CONTINENT_TAGS) {
    assert.ok(t.lat >= -60 && t.lat <= 70, `${t.id} lat`);
    assert.ok(t.lon >= -180 && t.lon <= 180, `${t.id} lon`);
    assert.ok(t.ko.length > 0 && t.en.length > 0);
  }
  assert.ok(!CONTINENT_TAGS.some(t => /바다|Ocean|해/.test(t.ko + t.en)), '바다 이름표는 넣지 않는다');
});

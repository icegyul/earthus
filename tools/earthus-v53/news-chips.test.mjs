// 지역 뉴스 레이어 — 분홍 막대·점이 없고, 지역마다 네모칸이 선다 (지시서 people.news 0단계 · H4)
//
// 이 파일이 지키는 것은 둘이다.
//   ① 금지: 뉴스 레이어를 세운 결과에 선(Line·LineSegments)과 점(Points)이 하나도 없다 —
//      PD 가 막대기 기호를 전면 금지했다. 기사 수를 높이로 말하던 1px 분홍 수직선이 여기 있었다.
//   ② 결과: 막대를 없앤 자리에 **네모칸이 실제로 만들어진다** — 지역마다 하나, 글자는 '지역 + 건수',
//      자리는 지역 대표점, 높이는 기사 수와 무관. ①만 시험하면 아무것도 안 그리는 레이어가 통과한다.
//
// 브라우저가 필요 없다. 캔버스는 '무엇을 그리라고 했는지'만 받아 적는 가짜로 대신한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

// ---- 가짜 캔버스: fillText 로 무엇을 썼는지, 그라데이션을 만들었는지만 기록한다 ----
const drawn = [];
let gradients = 0;
const fakeCtx = () => ({
  font: '',
  measureText: (t) => ({ width: String(t).length * 20 }),
  beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {},
  fillText(t) { drawn.push(String(t)); },
  createLinearGradient() { gradients += 1; return { addColorStop() {} }; },
  createRadialGradient() { gradients += 1; return { addColorStop() {} }; },
});
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas', '뉴스 네모칸은 캔버스만 만든다');
    const ctx = fakeCtx();
    return { width: 0, height: 0, getContext: () => ctx };
  },
};

const { LiveLayers, NEWS_CHIP_MAX, newsChipSpecs, newsChipOpacity } =
  await import('../../prototype/v2-three/js/live-layers.js');

const item = (region, i) => ({
  region, source: '시험 매체', title: `${region} 기사 ${i}`, link: `https://example.org/${i}`,
  utc: '2026-09-20T00:00:00Z',
});
// 지역마다 건수가 다르다 — 막대가 있던 시절엔 이 차이가 높이가 됐다.
const FIXTURE = {
  source: 'test fixture', generated: '2026-09-20T01:00:00Z',
  items: [
    ...Array.from({ length: 7 }, (_, i) => item('동남아', i)),
    ...Array.from({ length: 2 }, (_, i) => item('중동', i)),
    ...Array.from({ length: 4 }, (_, i) => item('남미', i)),
    item('어디에도 없는 지역', 0),          // 대표점이 없는 지역은 그리지 않는다
  ],
};

const layers = (heightAt = () => 0) => new LiveLayers(new THREE.Scene(), heightAt, () => 1, () => '');
const all = (obj) => { const out = []; obj.traverse((o) => out.push(o)); return out; };
const latLonOf = (v) => {
  const u = v.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(u.y)), lon: THREE.MathUtils.radToDeg(Math.atan2(u.x, u.z)) };
};

test('뉴스 레이어에 선도 점도 없다 — 분홍 막대 5개·점 5개가 사라졌다', () => {
  const g = layers().buildNews(FIXTURE);
  for (const o of all(g)) {
    assert.ok(!o.isLine, `선이 남아 있다: ${o.type}`);            // Line · LineSegments · LineLoop 전부 isLine
    assert.ok(!o.isPoints, `점이 남아 있다: ${o.type}`);
    assert.ok(!o.isMesh, `기둥이 될 수 있는 메시가 있다: ${o.type}`);
  }
});

test('막대를 없앤 자리에 네모칸이 선다 — 지역마다 하나, 글자는 지역 이름 + 건수', () => {
  drawn.length = 0;
  const g = layers().buildNews(FIXTURE);
  const chips = all(g).filter((o) => o.isSprite);
  assert.equal(chips.length, 3, '기사가 있는 지역 3곳에 네모칸 3개');
  const byRegion = Object.fromEntries(chips.map((c) => [c.userData.newsChip.region, c]));
  assert.deepEqual(Object.keys(byRegion).sort(), ['남미', '동남아', '중동']);
  assert.equal(byRegion['동남아'].userData.newsChip.count, 7);
  assert.equal(byRegion['중동'].userData.newsChip.count, 2);
  assert.equal(byRegion['남미'].userData.newsChip.count, 4);
  // 캔버스에 실제로 쓴 글자 — 막대 높이가 하던 말을 숫자가 한다.
  for (const want of ['동남아 7건', '중동 2건', '남미 4건']) {
    assert.ok(drawn.includes(want), `'${want}' 를 그리지 않았다 (그린 것: ${drawn.join(' | ')})`);
  }
  assert.ok(!drawn.some((t) => /▸|▶|→/.test(t)), '누를 수 없는데 누름 표시를 달았다');
  assert.equal(gradients, 0, '네모칸에 그라데이션을 쓰지 않는다');
  for (const c of chips) assert.ok(c.material.map && c.material.map.isTexture, '네모칸에 그림이 없다');
});

test('네모칸은 지역 대표점에 고정된다 — 그리고 높이는 기사 수와 무관하다', () => {
  const g = layers().buildNews(FIXTURE);
  const chips = all(g).filter((o) => o.isSprite);
  const radii = chips.map((c) => c.position.length());
  // 지형 0m · 과장 1 → 전부 같은 반경. 기사 7건짜리가 2건짜리보다 높이 서 있으면 막대의 뜻이 남은 것이다.
  for (const r of radii) assert.ok(Math.abs(r - radii[0]) < 1e-9, `반경이 다르다: ${radii.join(', ')}`);
  assert.ok(radii[0] > 1 && radii[0] < 1.01, `지표에 붙어 있지 않다: ${radii[0]}`);
  // 동남아 네모칸은 동남아 위에 있다 (대략의 상자 — 대표점 좌표를 시험에 베끼지 않는다)
  const sea = latLonOf(chips.find((c) => c.userData.newsChip.region === '동남아').position);
  assert.ok(sea.lat > -11 && sea.lat < 29 && sea.lon > 92 && sea.lon < 141, `동남아 네모칸 위치: ${JSON.stringify(sea)}`);
  const sam = latLonOf(chips.find((c) => c.userData.newsChip.region === '남미').position);
  assert.ok(sam.lat > -56 && sam.lat < 13 && sam.lon > -82 && sam.lon < -34, `남미 네모칸 위치: ${JSON.stringify(sam)}`);
});

test('지형이 높은 곳에서는 네모칸이 지형 위로 올라간다 (산에 묻히지 않는다)', () => {
  const flat = all(layers(() => 0).buildNews(FIXTURE)).filter((o) => o.isSprite);
  const high = all(layers(() => 3000).buildNews(FIXTURE)).filter((o) => o.isSprite);
  assert.ok(high[0].position.length() > flat[0].position.length());
});

test('기사가 없거나 대표점이 없는 지역뿐이면 아무것도 세우지 않는다 — 터지지도 않는다', () => {
  assert.equal(all(layers().buildNews({ items: [] })).filter((o) => o.isSprite).length, 0);
  assert.equal(all(layers().buildNews({})).filter((o) => o.isSprite).length, 0);
  assert.equal(all(layers().buildNews({ items: [item('어디에도 없는 지역', 0)] })).filter((o) => o.isSprite).length, 0);
});

test('네모칸 개수에는 상한이 있다 — 지역을 늘려도 텍스처가 무한정 늘지 않는다', () => {
  const regions = {};
  const by = {};
  for (let i = 0; i < 15; i += 1) {
    regions[`지역${i}`] = [i, i * 10];
    by[`지역${i}`] = Array.from({ length: i + 1 }, (_, k) => item(`지역${i}`, k));
  }
  const specs = newsChipSpecs(by, regions);
  assert.equal(specs.length, NEWS_CHIP_MAX);
  assert.ok(NEWS_CHIP_MAX <= 6, '모바일 상한(지시서: 6)을 넘겼다');
  // 많은 지역부터 남긴다
  assert.deepEqual(specs.map((s) => s.count), [15, 14, 13, 12, 11, 10]);
  assert.equal(specs[0].text, '지역14 15건');
});

test('지구 뒤편·지평선 너머의 네모칸은 보이지 않는다 (깊이 검사를 껐으므로 직접 감춘다)', () => {
  const p = { x: 0, y: 0, z: 1.004 };
  assert.equal(newsChipOpacity(p, { x: 0, y: 0, z: 2.9 }), 1, '정면인데 흐리다');
  assert.equal(newsChipOpacity(p, { x: 0, y: 0, z: -2.9 }), 0, '지구 뒤편인데 보인다');
  assert.equal(newsChipOpacity(p, { x: 2.9, y: 0, z: 0 }), 0, '90° 옆(지평선 너머)인데 보인다');
  // 낮은 고도(약 3,200km)에서는 지평선이 가깝다 — cosθ 0.5 는 1.2만 km 에서는 보이지만 여기서는 지평선 너머다.
  const at = (dist, deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    return { x: Math.sin(a) * dist, y: 0, z: Math.cos(a) * dist };
  };
  assert.ok(newsChipOpacity(p, at(2.9, 60)) > 0, '1.2만 km · 60° 는 지평선 안쪽이다');
  assert.equal(newsChipOpacity(p, at(1.5, 60)), 0, '3천 km · 60° 는 지평선 너머다 — 지구를 뚫고 보이면 안 된다');
  // 지평선 근처에서는 뚝 끊기지 않고 흐려진다
  const near = newsChipOpacity(p, at(2.9, 66));
  assert.ok(near > 0 && near < 1, `지평선 근처 불투명도: ${near}`);
  // 카메라가 네모칸보다 낮으면(도시 축척) 지역 묶음은 감춘다
  assert.equal(newsChipOpacity(p, { x: 0, y: 0, z: 1.002 }), 0);
});

test('그리기 직전에 카메라를 받아 불투명도를 정한다 — tick 에 카메라가 없어도 된다', () => {
  const g = layers().buildNews(FIXTURE);
  g.updateMatrixWorld(true);
  const chip = all(g).find((o) => o.isSprite);
  assert.equal(chip.material.depthTest, false, '깊이 검사를 켜면 네모칸 안쪽 절반이 구면에 잘린다');
  assert.equal(chip.material.depthWrite, false);
  assert.equal(chip.material.sizeAttenuation, false, '화면에서 크기가 고정이어야 읽힌다');
  const cam = new THREE.PerspectiveCamera(48, 1, 0.005, 200);
  cam.position.copy(chip.position).normalize().multiplyScalar(2.9);   // 네모칸 바로 위
  cam.updateMatrixWorld(true);
  chip.onBeforeRender(null, null, cam);
  assert.equal(chip.material.opacity, 1);
  cam.position.multiplyScalar(-1);                                     // 지구 반대편
  cam.updateMatrixWorld(true);
  chip.onBeforeRender(null, null, cam);
  assert.equal(chip.material.opacity, 0);
});

test('같은 글자의 텍스처는 다시 그리지 않고, 안 쓰게 된 글자의 텍스처는 푼다', () => {
  const L = layers();
  const a = all(L.buildNews(FIXTURE)).filter((o) => o.isSprite);
  const b = all(L.buildNews(FIXTURE)).filter((o) => o.isSprite);   // 지형 과장 변경 = 같은 자료로 다시 세움
  const texOf = (list, region) => list.find((c) => c.userData.newsChip.region === region).material.map;
  assert.equal(texOf(a, '동남아'), texOf(b, '동남아'), '같은 글자인데 텍스처를 새로 그렸다 — 과장 슬라이더를 끌면 쌓인다');
  let disposed = 0;
  texOf(b, '중동').addEventListener('dispose', () => { disposed += 1; });
  const fewer = { ...FIXTURE, items: FIXTURE.items.filter((it) => it.region !== '중동') };
  L.buildNews(fewer);
  assert.equal(disposed, 1, "'중동 2건' 텍스처가 풀리지 않았다");
  // 갱신 길(disposeObj)은 네모칸 텍스처도 푼다 — 30분마다 새로 세우므로 새면 안 된다
  const g = L.buildNews(FIXTURE);
  let freed = 0;
  all(g).filter((o) => o.isSprite).forEach((c) => c.material.map.addEventListener('dispose', () => { freed += 1; }));
  L.disposeObj(g);
  assert.equal(freed, 3);
});

test('켰을 때 자료가 있는 곳을 잴 수 있다 — coverage 가 네모칸에서도 선다', async () => {
  const L = layers();
  L.build = async () => L.buildFromData('news', FIXTURE);
  assert.equal((await L.toggle('news')).on, true);
  assert.ok(L.coverage('news'), '네모칸만 있는 레이어에서 coverage 가 null — 켜도 지구가 반응하지 않는다');
});

test('카드 문장이 화면과 맞는다 — 막대를 말하지 않고 네모칸을 말한다', () => {
  const L = layers();
  L.buildNews(FIXTURE);
  const meta = L.metaNews(FIXTURE);
  assert.ok(!/막대/.test(meta.cardHtml), '없앤 막대를 카드가 아직 설명한다');
  assert.match(meta.cardHtml, /네모칸의 숫자 = 기사 수/);
  assert.match(meta.cardHtml, /특정 지점의 사건 위치가 아닙니다/, '지역 단위라는 고지가 빠졌다');
  assert.match(meta.cardHtml, /<b>동남아<\/b> 7건/);
  assert.match(meta.cardHtml, /href="https:\/\/example\.org\/0"/, '원문 링크가 빠졌다');
  assert.equal(meta.badge, 'LIVE');
});

// 2026-09-20 — 제목·매체·링크는 남의 RSS 가 준 글자다. 카드는 innerHTML 로 들어가므로 그대로 넣으면
// 따옴표 하나로 속성이 열리고 javascript: 링크가 통과한다. 막대 제거 작업 중에 발견해 같이 막았다.
test('남의 RSS 글자가 카드에서 마크업이 되지 않는다 — 글자는 escape, 링크는 http(s) 만', () => {
  const L = layers();
  const hostile = {
    ...FIXTURE,
    source: 'feeds <img src=x onerror=alert(1)>',
    items: [
      { region: '동남아', title: '"><img src=x onerror=alert(1)>', link: 'https://example.org/a" onmouseover="alert(1)', source: '<b>매체</b>', utc: FIXTURE.items[0].utc },
      { region: '동남아', title: '링크가 자바스크립트', link: 'javascript:alert(1)', source: '매체', utc: FIXTURE.items[0].utc },
    ],
  };
  L.buildNews(hostile);
  const html = L.metaNews(hostile).cardHtml;
  assert.doesNotMatch(html, /<img/i, '제목·출처의 태그가 그대로 나갔다');
  assert.doesNotMatch(html, /<b>매체<\/b>/, '매체 이름의 태그가 그대로 나갔다');
  assert.doesNotMatch(html, /href="javascript:/i, 'javascript: 링크가 통과했다');
  assert.doesNotMatch(html, /" onmouseover="/, '링크의 따옴표가 속성을 열었다');
  // 결과: 글자는 글자로 남고, 링크 없는 기사도 제목은 보인다
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /링크가 자바스크립트/);
});

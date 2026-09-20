// 주인공 레이어(색면 · 바람)가 켜진 동안의 무대 정리 — 2026-09-20, 합친 화면을 브라우저에서 직접 보고 넣은 것들.
//   ① 풍속 색면(windgrid)이 GFS 10 m 프레임을 새 렌더러로 그린다(descriptor 한 줄) — Open-Meteo 5° 선형 램프가 아니다
//   ② '바람'을 켜면 풍속 색면이 같이 깔리고 입자는 흰색(시안 02) · 우리가 같이 켠 것만 같이 끈다
//   ③ 색면이 켜져 있으면 구름이 꺼진다(흰 베일이 구간색을 바꿔 범례와 어긋난다) · 입자만이면 옅게
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './../v2-test-dom.mjs';

const lf = (s) => s.replace(/\r\n/g, '\n');
const src = (rel) => lf(readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8'));

const { FIELD_DESCRIPTORS, isFieldLayerId } = await import('../../prototype/v2-three/js/field-layer.js');
const { scaleOf, isolineSpec, SCALE_FOR_LAYER } = await import('../../prototype/v2-three/js/field-scales.js');
// 진짜 판정 모듈 — 아래 '진짜 starLayers 를 돌린다' 시험이 main.js 의 리터럴에 그대로 물린다.
const { CLOUD_LEVEL, createCloudYield } = await import('../../prototype/v2-three/js/cloud-yield.js');

test('풍속 색면은 입자와 같은 GFS 10 m 프레임을 크기(magnitudeRG)로 그린다 — 등풍속선은 없다', () => {
  const d = FIELD_DESCRIPTORS.windgrid;
  assert.ok(d, "'windgrid' descriptor 가 없다 — 예전 5° 선형 램프로 돌아간다");
  assert.equal(d.layerId, 'windgrid', '레이어 id 는 개명하지 않는다');
  assert.equal(d.fieldId, 'wind10');
  assert.equal(d.mode, 'magnitudeRG');
  assert.equal(d.scaleId, 'wind');
  assert.equal(SCALE_FOR_LAYER.windgrid, 'wind', '색 눈금표의 레이어 매핑과 어긋난다');
  assert.equal(isFieldLayerId('windgrid'), true);
  // 풍속 등치선은 일부러 없다(입자가 그 몫을 한다) — 단추도 그리지 않는다(죽은 토글 금지)
  assert.equal(isolineSpec(scaleOf('wind')), null);
  assert.deepEqual([...d.isolineChoices], []);
  assert.doesNotMatch(src('ui-shell.js'), /id: 'windgrid'[^}]*Open-Meteo/, '메뉴 출처가 아직 Open-Meteo 라고 말한다');
  assert.match(src('ui-shell.js'), /id: 'windgrid'[^}]*NOAA GFS 0\.5°/);
});

test("LiveLayers.starLayer — 색면이 있으면 'field', 입자만이면 'wind', 없으면 null", async () => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  const host = Object.create(LiveLayers.prototype);
  host.layers = {};
  host.activeIds = function activeIds() { return Object.keys(this.layers).filter((k) => this.layers[k].on); };
  assert.equal(host.starLayer(), null);
  host.layers.wind = { on: true };
  assert.equal(host.starLayer(), 'wind');
  host.layers.tempgrid = { on: true };
  assert.equal(host.starLayer(), 'field', '색면이 입자보다 먼저다 — 구름을 완전히 꺼야 한다');
  // 2026-09-20 작업 D3 — 바다 3종과 대기질이 새 렌더러로 옮겨졌다. descriptor 를 더하면 자동으로 같은 대접을 받는다.
  host.layers.tempgrid.on = false; host.layers.wind.on = false; host.layers.buoys = { on: true };
  assert.equal(host.starLayer(), null, '색면이 아닌 레이어(부이 점 등)는 주인공이 아니다 — 구름을 끄지 않는다');
  // 바다 3종은 2026-09-20 작업 D3 에서 새 렌더러로 옮겨졌다 — 이제 색면이라 구름을 물린다
  host.layers.sstfield = { on: true };
  assert.equal(host.starLayer(), 'field', '새 렌더러로 옮긴 색면(수온)도 구름을 끄는 주인공이다');
  // 강수(raingrid)는 작업 D2 에서 옮겨 갔다 — descriptor 가 있으니 이제 주인공이다.
  host.layers.sstfield.on = false; host.layers.raingrid = { on: true };
  assert.equal(host.starLayer(), 'field', '새 렌더러로 옮긴 색면(강수)도 구름을 끄는 주인공이다');
  // 아직 옮기지 않은 옛 색면은 주인공으로 치지 않는다(구름을 끄지 않는다). 자외선은 PD 표에 색 눈금이 없어
  // descriptor 를 만들 수 없다(field-layer.js 의 '자외선(uvgrid)은 없다') — 옛 캔버스 램프 그대로다.
  host.layers.raingrid.on = false; host.layers.uvgrid = { on: true };
  assert.equal(host.starLayer(), null, '옛 색면(자외선 5° 그라데이션)은 주인공이 아니다');
});

test('main.js 가 매 프레임 무대를 정리한다 — 구름 불투명도 · 바람 밑 풍속 색면 · 입자 색', () => {
  const main = src('main.js');
  assert.match(main, /starLayers\.tick\(dt\);/, '틱에서 부르지 않는다');
  const at = main.indexOf('const starLayers = {');
  assert.ok(at > 0);
  const body = main.slice(at, main.indexOf('\n  };', at));
  // 2026-09-20 작업 E3 ②③ — 끄고 옅게 하고 그대로 두는 세 갈래의 **판정**은 js/cloud-yield.js 가 한다(손이 이기는 규칙 ·
  // 색면이 실제로 그려지는지). main.js 는 그 판정을 불투명도로 옮기기만 한다 — 조건을 두 벌로 만들지 않는다.
  assert.match(body, /say\.level === CLOUD_LEVEL\.OFF \? 0 : say\.level === CLOUD_LEVEL\.DIM \? CLOUD_OPACITY_WIND_ONLY : CLOUD_OPACITY_FULL/, '색면이 있으면 구름을 끈다(0)');
  assert.match(body, /cloudYield\.read\(\{/, '구름 판정을 cloud-yield.js 에 묻지 않는다');
  assert.match(main, /const CLOUD_OPACITY_FULL = clouds\.uniforms\.uOpacity\.value;/, '원래 불투명도를 숫자로 다시 적지 않는다 — CloudManager 가 정한 값을 기억한다');
  // 구름 예보의 비·뇌우 층도 구름과 같은 비율로 물러난다 — 구름만 끄면 색면 위에 보라색 뇌우 표시만 남는다(운영에서 실측)
  assert.match(body, /pu\.value = PRECIP_OPACITY_FULL \* \(CLOUD_OPACITY_FULL > 0 \? u\.value \/ CLOUD_OPACITY_FULL : 1\)/);
  // 색면이 깔려 있으면(기온이든 풍속이든) 입자는 흰색 — 색은 밑의 색면과 범례가 말한다.
  // 2026-09-20 정정 — 여기만 '켜져 있으면'을 보고 있었다. 구름·윤곽선과 **같은 drawing** 을 본다:
  // 예보 범위 밖이라 색면이 안 보이는데 입자만 흰색으로 남으면 색을 말해 줄 것이 화면에 하나도 없다.
  assert.match(body, /windLayer\.setColorMode\(star === 'field' && drawing \? 'white' : 'speed'\)/);
  // 색면은 한 번에 하나라, 기온을 보는 중에 풍속 색면을 자동으로 깔면 기온이 조용히 꺼진다 — 깔린 색면이 없을 때만 깐다
  /* ⚠️ 2026-09-21 — 술어가 **배타 묶음과 같은 넓이**여야 한다. isFieldLayerId 는 FIELD_DESCRIPTORS 만 보는데
     잠기는 땅(slr)도 같은 묶음이다 — 안 세면 바람을 켤 때 풍속 색면이 자동으로 깔리며 그것을 조용히 내린다
     (2026-09-21 반박 검증이 잡은 자리). */
  assert.match(body, /const otherFieldOn = liveLayers\.activeIds\(\)\.some\(\(id\) => id !== 'windgrid' && \(isFieldLayerId\(id\) \|\| id === 'slr'\)\)/);
  assert.match(body, /const want = windOn \? \(!speedOn && !otherFieldOn\) : \(this\.autoSpeed && speedOn\);/);
  assert.match(body, /liveLayers\.toggle\('windgrid'\)/);
  // 우리가 같이 켠 것만 같이 끈다 — 사용자가 따로 켠 풍속 색면을 바람을 끌 때 같이 끄면 안 된다
});

// 2026-09-20 정정 — 위 시험은 main.js 를 **글자로** 대조한다. 글자가 맞아도 배선이 틀릴 수 있어서(판정은 cloud-yield 가
// 하지만 그 결과를 불투명도로 옮기는 것은 여기다), 진짜 starLayers 를 **돌려서** 구름 불투명도가 목표에 닿는지 본다.
// main.js 는 통째로 들일 수 없다(DOM·WebGL·네트워크) — 그 객체 리터럴만 떼어 가짜 이웃과 함께 부른다.
/** main.js 의 starLayers 리터럴을 그대로 떼어 부른다. 돌려주는 것은 { star, clouds, wind, outlines } — 화면에 닿는 값들. */
function runStarLayers() {
  const main = src('main.js');
  const at = main.indexOf('const starLayers = {');
  const body = `${main.slice(at, main.indexOf('\n  };', at))}\n};\nreturn starLayers;`;
  const stage = {
    clouds: { mode: 'obs', uniforms: { uOpacity: { value: 0.92 } }, precip: { uniforms: { uOpacity: { value: 0.7 } } } },
    wind: { colorMode: null },
    outlines: { visible: null, ticks: 0 },
    field: { star: null, sf: null },
  };
  const liveLayers = {
    layers: {},
    starLayer: () => stage.field.star,
    starField: () => stage.field.sf,
    activeIds: () => Object.keys(liveLayers.layers).filter((k) => liveLayers.layers[k].on),
    toggle: async () => {},
  };
  const make = new Function(
    'liveLayers', 'FIELD_DESCRIPTORS', 'cloudYield', 'i18n', 'fieldOutlines', 'CLOUD_LEVEL',
    'CLOUD_OPACITY_WIND_ONLY', 'CLOUD_OPACITY_FULL', 'PRECIP_OPACITY_FULL', 'clouds', 'windLayer', 'isFieldLayerId', 'shell',
    body,
  );
  const cloudYield = createCloudYield();
  const layers = make(
    liveLayers, FIELD_DESCRIPTORS, cloudYield, { ko: true },
    { setVisible(v) { stage.outlines.visible = v; }, tick() { stage.outlines.ticks += 1; } },
    CLOUD_LEVEL, 0.28, 0.92, 0.7, stage.clouds,
    { setColorMode(m) { stage.wind.colorMode = m; } },
    isFieldLayerId, { refreshFlyout() {} },
  );
  // 불투명도는 프레임마다 목표로 **다가간다**(남은 거리 × dt × 5 · 60fps 면 한 프레임에 1/12). 그래서 한 프레임만 돌려서는
  // 목표에 안 닿는다 — 0.004 보다 가까워지면 딱 붙는 마지막 줄까지 가도록 넉넉히 돌린다(200 프레임 = 3.3초).
  // 숫자를 박지 않고 **목표에 견준다** — 감속 상수를 바꿔도 이 시험은 '닿는가'만 묻는다.
  stage.settle = (frames = 200) => { for (let i = 0; i < frames; i += 1) layers.tick(1 / 60); return stage.clouds.uniforms.uOpacity.value; };
  return { layers, stage, liveLayers, cloudYield };
}

test('진짜 starLayers 를 돌린다 — 구름 불투명도가 0 · 옅게 · 그대로에 실제로 닿는다', () => {
  const { stage, liveLayers, cloudYield } = runStarLayers();
  const FULL = 0.92; const DIM = 0.28;

  // ① 아무것도 없으면 구름은 그대로다.
  assert.equal(stage.settle(), FULL);
  assert.equal(stage.wind.colorMode, 'speed');
  assert.equal(stage.outlines.visible, false);

  // ② 색면이 그려지는 중 → 구름 0 · 비·뇌우도 같이 0 · 입자는 흰색 · 윤곽선이 선다.
  liveLayers.layers.tempgrid = { on: true };
  stage.field = { star: 'field', sf: { id: 'tempgrid', drawing: true } };
  assert.equal(stage.settle(), 0, '색면이 주인공인데 구름이 물러나지 않았다');
  assert.equal(stage.clouds.precip.uniforms.uOpacity.value, 0, '구름은 꺼졌는데 뇌우 표시만 색면 위에 남았다');
  assert.equal(stage.wind.colorMode, 'white');
  assert.equal(stage.outlines.visible, true);

  // ③ 같은 색면이 예보 범위 밖으로 밀려 안 그려진다 → 구름이 돌아온다(맨 지구 금지) · 입자 색도 · 윤곽선도.
  stage.field.sf.drawing = false;
  assert.equal(stage.settle(), FULL, '색면이 안 보이는데 구름까지 눌러 맨 지구만 남았다');
  assert.equal(stage.wind.colorMode, 'speed', '색면이 안 보이는데 입자만 흰색으로 남았다');
  assert.equal(stage.outlines.visible, false);

  // ④ 다시 그려지면 물리고, 그때 사용자가 구름 단추를 누르면 그 손이 이긴다(죽은 토글 금지).
  stage.field.sf.drawing = true;
  assert.equal(stage.settle(), 0);
  cloudYield.handPicked();
  assert.equal(stage.settle(), FULL, '구름 단추를 눌렀는데 화면이 그대로다 — 죽은 토글이다');

  // ⑤ 색면을 껐다 켜면 손자국이 지워져 다시 물린다.
  stage.field = { star: null, sf: null };
  stage.settle(1);
  stage.field = { star: 'field', sf: { id: 'tempgrid', drawing: true } };
  assert.equal(stage.settle(), 0);

  // ⑥ 입자만이면 옅게 — 옛 규칙 그대로다.
  liveLayers.layers.tempgrid.on = false;
  liveLayers.layers.wind = { on: true };
  stage.field = { star: 'wind', sf: null };
  assert.equal(stage.settle(), DIM);
});

// 2026-09-20 반박 검증 — 색면은 한 번에 하나다. 두 색면은 같은 반지름·같은 renderOrder·불투명 0.8 이라
// 나중 것이 앞의 것을 덮고, 범례는 하나뿐이라 어느 쪽과도 맞지 않는 색이 화면에 남는다(브라우저에서 재현했다).
test('색면 켜기는 다른 색면을 끈다 — 입자(바람)는 색면이 아니라 그대로 흐른다', async () => {
  const { toggleFieldLayer } = await import('../../prototype/v2-three/js/field-layer.js');
  const off = [];
  const host = {
    layers: { tempgrid: { on: true, obj: { visible: true } }, wind: { on: true, obj: { visible: true } } },
    _fields: {
      tempgrid: { active: true, off() { off.push('tempgrid'); this.active = false; } },
      windgrid: { active: false, object: { visible: false }, off() { off.push('windgrid'); }, on: async () => ({ on: true }) },
    },
  };
  const r = await toggleFieldLayer(host, 'windgrid');
  assert.equal(r.on, true);
  assert.deepEqual(off, ['tempgrid'], '다른 색면을 끄지 않았다 — 두 색면이 겹쳐 그려진다');
  assert.equal(host.layers.tempgrid.on, false);
  assert.equal(host.layers.tempgrid.obj.visible, false);
  assert.equal(host.layers.wind.on, true, '입자는 색면이 아니다 — 끄면 안 된다');
});

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
  // 강수도 같은 날 옮겨졌다(작업 D2) — 옛 5° 그라데이션이 아니라 GFS 강수율 구간색이다
  host.layers.sstfield.on = false; host.layers.raingrid = { on: true };
  assert.equal(host.starLayer(), 'field');
  host.layers.raingrid.on = false;
  assert.equal(host.starLayer(), null, '켜진 색면이 없으면 구름이 돌아온다');
});

test('main.js 가 매 프레임 무대를 정리한다 — 구름 불투명도 · 바람 밑 풍속 색면 · 입자 색', () => {
  const main = src('main.js');
  assert.match(main, /starLayers\.tick\(dt\);/, '틱에서 부르지 않는다');
  const at = main.indexOf('const starLayers = {');
  assert.ok(at > 0);
  const body = main.slice(at, main.indexOf('\n  };', at));
  assert.match(body, /star === 'field' \? 0 : star === 'wind' \? CLOUD_OPACITY_WIND_ONLY : CLOUD_OPACITY_FULL/, '색면이 있으면 구름을 끈다(0)');
  assert.match(main, /const CLOUD_OPACITY_FULL = clouds\.uniforms\.uOpacity\.value;/, '원래 불투명도를 숫자로 다시 적지 않는다 — CloudManager 가 정한 값을 기억한다');
  // 구름 예보의 비·뇌우 층도 구름과 같은 비율로 물러난다 — 구름만 끄면 색면 위에 보라색 뇌우 표시만 남는다(운영에서 실측)
  assert.match(body, /pu\.value = PRECIP_OPACITY_FULL \* \(CLOUD_OPACITY_FULL > 0 \? u\.value \/ CLOUD_OPACITY_FULL : 1\)/);
  // 색면이 깔려 있으면(기온이든 풍속이든) 입자는 흰색 — 색은 밑의 색면과 범례가 말한다
  assert.match(body, /windLayer\.setColorMode\(star === 'field' \? 'white' : 'speed'\)/);
  // 색면은 한 번에 하나라, 기온을 보는 중에 풍속 색면을 자동으로 깔면 기온이 조용히 꺼진다 — 깔린 색면이 없을 때만 깐다
  assert.match(body, /const otherFieldOn = liveLayers\.activeIds\(\)\.some\(\(id\) => id !== 'windgrid' && isFieldLayerId\(id\)\)/);
  assert.match(body, /const want = windOn \? \(!speedOn && !otherFieldOn\) : \(this\.autoSpeed && speedOn\);/);
  assert.match(body, /liveLayers\.toggle\('windgrid'\)/);
  // 우리가 같이 켠 것만 같이 끈다 — 사용자가 따로 켠 풍속 색면을 바람을 끌 때 같이 끄면 안 된다
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

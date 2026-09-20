// 레지스트리가 내린 화면을 아직 '준비됨'이라 적고 있었다 (2026-09-21).
//
// 무엇이 잘못돼 있었나
//   2026-09-21 에 취미 화면 셋(hobby/surf · hobby/fishing · hobby/para)을 내렸다 — v2 가 v1 모듈을
//   거쳐 브라우저에서 Open-Meteo 를 직접 부르고 있었고, 그 값들은 우리 격자로 못 낸다.
//   ui-shell.js 의 메뉴 줄은 state:'UNAVAILABLE' 로 고쳤는데 **현상 레지스트리는 안 고쳤다**:
//   availability 가 'ready'(서핑·낚시)/'partial'(패러글라이딩)로 남고 capabilities.current·evidence
//   도 참이었다. 레지스트리는 화면이 '무엇을 할 수 있다고 선언하는 자리'다 — 거기가 거짓이면
//   그것을 읽는 모든 것(ui-shell 능력 게이팅 · report-center · main.js askPhenomenon)이 거짓을 물려받는다.
//
// 이 시험이 지키는 것
//   ① 내린 화면의 현상은 능력을 하나도 주장하지 않는다
//   ② 그 판정의 근거는 '산출물이 그 내린 화면뿐'이라는 사실이다 — 살아 있는 레이어가 다시 붙으면 시험이 깨진다
//   ③ availability 어휘를 새로 만들지 않는다
//   ④ 함께 내리면 안 되는 것(해변·낚시터 장소 목록 · 나머지 취미 화면)은 그대로 살아 있다
//
// ⚠️ 숫자를 박지 않는다 — 내린 화면이 몇 개인지는 ext-scene.js 의 WITHDRAWN 에서 센다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { WITHDRAWN } from '../../prototype/v2-three/js/ext-scene.js';
import { PHENOMENA, LAYER_PHENOMENON, phenomenonForLayer } from '../../prototype/v2-three/js/phenomenon-registry.js';

const withdrawnKeys = Object.keys(WITHDRAWN);

/** 내린 화면 키(scene/layer) → 그 화면이 속한 현상 id */
const phenomenonIdOf = (key) => (LAYER_PHENOMENON[key] || {}).phenomenon || null;

test('시험이 실제로 무언가를 세고 있다 — 내린 화면도 현상도 0 이 아니다', () => {
  assert.ok(withdrawnKeys.length > 0, 'ext-scene.js 의 WITHDRAWN 을 못 읽었다 — 아래가 전부 공허하게 통과한다');
  assert.ok(Object.keys(PHENOMENA).length > 0, '레지스트리를 못 읽었다');
  for (const key of withdrawnKeys) {
    assert.ok(LAYER_PHENOMENON[key], `${key} 가 LAYER_PHENOMENON 에 없다 — 레지스트리와 메뉴가 어긋났다`);
    assert.ok(phenomenonIdOf(key), `${key} 가 현상에 이어져 있지 않다`);
  }
});

test('내린 화면의 현상은 능력을 하나도 주장하지 않는다', () => {
  for (const key of withdrawnKeys) {
    const pid = phenomenonIdOf(key);
    const p = PHENOMENA[pid];
    assert.ok(p, `${pid} 가 PHENOMENA 에 없다`);
    const claimed = Object.entries(p.capabilities).filter(([, v]) => v).map(([k]) => k);
    assert.deepEqual(claimed, [],
      `${key}(${pid}) 가 내려 있는데 아직 ${claimed.join(' · ')} 를 할 수 있다고 적는다`);
  }
});

test('내린 화면의 현상은 availability 로 준비됐다고 말하지 않는다', () => {
  for (const key of withdrawnKeys) {
    const pid = phenomenonIdOf(key);
    const a = PHENOMENA[pid].availability;
    assert.ok(a !== 'ready' && a !== 'partial',
      `${key}(${pid}) 의 availability 가 '${a}' 다 — 눌러도 아무것도 안 나오는 화면이다`);
  }
});

test('내린 화면의 현상은 왜 아무것도 없는지 적어 둔다 — 빈 칸으로 두지 않는다', () => {
  for (const key of withdrawnKeys) {
    const p = PHENOMENA[phenomenonIdOf(key)];
    for (const field of ['evidenceProfile', 'temporalMode', 'scope']) {
      assert.ok(typeof p[field] === 'string' && p[field].length > 5,
        `${key} 의 ${field} 가 비었다 — 모르는 것과 없는 것을 가르지 못한다`);
    }
    // 내린 뒤에도 옛 근거 등급을 그대로 달고 있으면, 그것을 읽는 쪽이 값이 있다고 믿는다.
    assert.doesNotMatch(p.evidenceProfile, /PROVIDER_FORECAST|OFFICIAL_OBSERVATION/,
      `${key} 의 evidenceProfile 이 아직 살아 있는 화면의 근거 등급을 말한다`);
  }
});

test('능력을 통째로 내린 근거는 산출물이 그 내린 화면뿐이라는 사실이다', () => {
  // 현상 하나에 살아 있는 레이어가 같이 달려 있다면, 능력을 전부 false 로 내리는 것이 도리어 거짓이 된다.
  // 누군가 살아 있는 레이어를 이 현상에 다시 붙이면 여기서 걸리고, 그때 다시 생각해야 한다.
  const withdrawnSet = new Set(withdrawnKeys);
  for (const key of withdrawnKeys) {
    const pid = phenomenonIdOf(key);
    const alive = PHENOMENA[pid].dataProducts.filter((d) => !withdrawnSet.has(d));
    assert.deepEqual(alive, [],
      `${pid} 에 살아 있는 레이어 ${alive.join(' · ')} 가 붙어 있다 — 능력을 전부 false 로 둘 근거가 사라졌다`);
  }
});

test('availability 어휘를 새로 만들지 않았다', () => {
  // 읽는 쪽(ui-shell 능력 게이팅 · report-center · main.js askPhenomenon)은 이 파일이 쓰던 낱말만 안다.
  const VOCAB = new Set(['ready', 'partial', 'planned']);
  const unknown = [...new Set(Object.values(PHENOMENA).map((p) => p.availability))].filter((a) => !VOCAB.has(a));
  assert.deepEqual(unknown, [], `레지스트리에 없던 availability 낱말이 생겼다: ${unknown.join(' · ')}`);
});

test('멀쩡한 현상까지 같이 내리지 않았다 — 시험이 공허하지 않다는 증거', () => {
  const ready = Object.entries(PHENOMENA)
    .filter(([, p]) => p.availability === 'ready' && Object.values(p.capabilities).some(Boolean));
  assert.ok(ready.length > 10, `능력을 가진 현상이 ${ready.length}개뿐이다 — 너무 많이 내렸다`);
});

test('해변·낚시터 장소 목록은 내리지 않았다 — 사라진 것은 장소가 아니라 물 상태다', () => {
  // ocean/surf(해변 271곳 + 낚시터 946곳, OBSERVED)는 hobby/surf 와 **다른 현상**이다.
  // 이름이 같은 id 때문에 둘을 한 덩어리로 취급하면, 지구에 찍힌 지점들이 말없이 같이 내려간다.
  const spots = phenomenonForLayer('ocean', 'surf');
  const surf = phenomenonForLayer('hobby', 'surf');
  assert.ok(spots && surf);
  assert.notEqual(spots.label.ko, surf.label.ko, 'ocean/surf 와 hobby/surf 가 같은 현상이 됐다');
  assert.equal(spots.availability, 'ready', '해변·낚시터 장소 목록까지 같이 내려갔다');
  assert.ok(Object.values(spots.capabilities).some(Boolean), '장소 목록이 아무것도 못 하는 현상이 됐다');
});

/* 내린 현상의 scope 가 '아직 살아 있는 것'을 말할 때, 그 수는 실제로 그려지는 수여야 한다.
   처음 쓸 때 옛 scope 의 합계(해변 1,027 = 한국 271 + 일본 756)를 그대로 옮겨 적었다 —
   그 일본 자료를 읽던 것은 **내린 v1 모듈**이고, 살아 있는 ocean/surf 는 한국 파일 둘만 읽는다.
   없는 것을 있는 척하지 않으려고 고치는 파일에서 그 짓을 하면 안 된다. 그래서 자료에서 센다. */
const dataCount = (path, key) => {
  const j = JSON.parse(readFileSync(new URL(`../../prototype/data/${path}`, import.meta.url), 'utf8'));
  return (j[key] || []).length;
};
const LIVE_SRC = readFileSync(new URL('../../prototype/v2-three/js/live-layers.js', import.meta.url), 'utf8');

test('살아 있다고 적은 장소 수가 실제로 그려지는 수와 같다', () => {
  const kr = { beaches: dataCount('beaches.json', 'beaches'), fishing: dataCount('fishing.json', 'spots') };
  const jp = { beaches: dataCount('jp/beaches.json', 'beaches'), fishing: dataCount('jp/fishing.json', 'spots') };
  assert.ok(kr.beaches > 0 && kr.fishing > 0 && jp.beaches > 0 && jp.fishing > 0, '자료 파일을 못 읽었다');

  const surf = PHENOMENA['ocean.surf_conditions'].scope;
  const fish = PHENOMENA['ocean.fishing_conditions'].scope;
  assert.ok(surf.includes(`해변 ${kr.beaches}곳`), `서핑 scope 의 한국 해변 수가 자료(${kr.beaches})와 다르다`);
  assert.ok(fish.includes(`낚시터 ${kr.fishing}곳`), `낚시 scope 의 한국 낚시터 수가 자료(${kr.fishing})와 다르다`);
  // 일본 자료는 파일로만 남아 있다 — 그렇게 적었는지, 수가 맞는지 함께 본다.
  assert.ok(surf.includes(`일본 해변 ${jp.beaches}곳`) && /어떤 화면도 그리지 않는다/.test(surf));
  assert.ok(fish.includes(`일본 낚시터 ${jp.fishing}곳`) && /어떤 화면도 그리지 않는다/.test(fish));
});

test('그 말이 참이다 — ocean/surf 는 한국 파일 둘만 읽는다', () => {
  const at = LIVE_SRC.indexOf("case 'surf':");
  assert.ok(at > 0, "live-layers.js 의 case 'surf' 를 못 찾았다");
  const body = LIVE_SRC.slice(at, at + 600);
  assert.match(body, /\.\/data\/beaches\.json/);
  assert.match(body, /\.\/data\/fishing\.json/);
  assert.doesNotMatch(body, /jp\//, 'ocean/surf 가 일본 자료도 읽는다 — 그렇다면 scope 를 다시 써야 한다');
});

test('내리지 않은 취미 화면은 그대로 산다', () => {
  // 취미 씬 전체를 내린 것이 아니다 — 새는 길을 가진 셋만 내렸다.
  const hobbyKeys = Object.keys(LAYER_PHENOMENON).filter((k) => k.startsWith('hobby/'));
  const stillAlive = hobbyKeys.filter((k) => !withdrawnKeys.includes(k));
  assert.ok(stillAlive.length > 0, '취미 씬에 남은 화면이 없다 — 전제가 틀렸다');
  const capable = stillAlive.filter((k) => {
    const pid = phenomenonIdOf(k);
    return pid && Object.values(PHENOMENA[pid].capabilities).some(Boolean);
  });
  assert.ok(capable.length > 0, `남은 취미 화면 ${stillAlive.length}개가 전부 능력 0 이다 — 같이 쓸려 내려갔다`);
});

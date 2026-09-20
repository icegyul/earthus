// '지구에 묻기'의 레이어 표가 맨 id 라 화면끼리 서로 덮고 있었다 (2026-09-21).
//
// 무엇이 잘못돼 있었나
//   main.js 의 layerIndex 가 `${sc.id}/${l.id}` 복합키가 아니라 **맨 id** 로 만들어져 있었다.
//   같은 맨 id 가 두 씬에 있으면 뒤에 오는 씬이 앞을 덮고, 덮인 레이어는 표에서 통째로 사라진다.
//   SCENES 순서가 ocean → hobby 라 마지막 승자는 hobby 였다:
//     (1) ocean/surf(해변 271곳 + 낚시터 946곳 · OBSERVED)를 켜 놓고 물어도 스냅샷에 안 들어가
//         모델이 지구에 찍힌 1,217개 지점을 볼 수 없었다
//     (2) 모델이 showLayer('surf') 를 제안하면 해변이 아니라 **내린 화면**이 열렸다
//     (3) openCard('surf') 는 '서핑 — 내린 화면' 제목에 '확인 불가' 배지를 달고
//         해변 271곳의 내용을 냈다 — liveLayers 의 카드 표도 맨 id 이기 때문이다
//
// 레지스트리·i18n·ui-shell 은 2026-09 에 같은 이유로 복합키로 옮겼다(LAYER_PHENOMENON ·
// L_EN_BY_KEY · LAYER_BY_KEY). main.js 의 이 표 하나가 남아 있었다.
//
// ⚠️ 숫자를 박지 않는다 — 충돌이 몇 건인지는 SCENES 에서 센다.
import '../v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SCENES } from '../../prototype/v2-three/js/ui-shell.js';

const lf = (s) => s.replace(/\r\n/g, '\n');
const MAIN = lf(readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8'));

const allLayers = SCENES.flatMap((s) => (s.layers || []).map((l) => ({ scene: s.id, l })));
/** 맨 id → 그 id 를 쓰는 복합키들 */
const byBareId = new Map();
for (const { scene, l } of allLayers) {
  if (!byBareId.has(l.id)) byBareId.set(l.id, []);
  byBareId.get(l.id).push(`${scene}/${l.id}`);
}
const collisions = [...byBareId.entries()].filter(([, keys]) => keys.length > 1);

// ── ① 자료 쪽 — 맨 id 로 표를 만들면 레이어가 실제로 사라진다 ────────────────────

test('맨 id 로 세우면 레이어를 잃는다 — 이 시험의 전제가 아직 참이다', () => {
  assert.ok(allLayers.length > 0, 'SCENES 를 못 읽었다 — 아래가 전부 공허하게 통과한다');
  assert.ok(collisions.length > 0,
    '맨 id 가 겹치는 짝이 하나도 없다 — 그렇다면 이 결함은 사라진 것이고 시험도 다시 써야 한다');
  // 잃는 수 = 전체 레이어 - 서로 다른 맨 id 수. 숫자를 박지 않고 센다.
  const lost = allLayers.length - byBareId.size;
  assert.equal(lost, collisions.reduce((n, [, keys]) => n + keys.length - 1, 0));
  assert.ok(lost > 0, `맨 id 표가 ${lost}개를 잃는다 — 0 이면 아래 검사가 뜻이 없다`);
});

test('복합키로 세우면 하나도 잃지 않는다', () => {
  const composite = new Map();
  for (const { scene, l } of allLayers) composite.set(`${scene}/${l.id}`, l);
  assert.equal(composite.size, allLayers.length, '복합키인데도 겹치는 레이어가 있다');
});

test('덮이는 짝은 서로 다른 화면이다 — 하나로 뭉뚱그리면 안 되는 이유', () => {
  // 이름도 상태도 다르다. '같은 것의 중복'이 아니라 '다른 두 화면이 같은 이름을 쓰고 있다'는 뜻이다.
  const differing = collisions.filter(([bare]) => {
    const rows = allLayers.filter((x) => x.l.id === bare).map((x) => x.l);
    return new Set(rows.map((l) => l.name)).size > 1;
  });
  assert.ok(differing.length > 0, '겹치는 짝이 전부 이름까지 같다 — 그러면 덮여도 해가 없다');
  // surf 가 그 대표다: 한쪽은 장소 목록(OBSERVED), 한쪽은 내린 화면(UNAVAILABLE).
  const surf = allLayers.filter((x) => x.l.id === 'surf');
  assert.equal(surf.length, 2, 'surf 짝이 사라졌거나 늘었다 — 시험의 예시를 다시 골라야 한다');
  assert.notEqual(surf[0].l.state, surf[1].l.state, 'surf 두 화면의 상태가 같아졌다');
  assert.equal(surf[surf.length - 1].scene, 'hobby', '마지막 승자가 더 이상 hobby 가 아니다');
});

// ── ② 코드 쪽 — main.js 가 더 이상 맨 id 로 표를 세우지 않는다 ─────────────────
// main.js 는 import 하면 WebGL 과 DOM 을 요구한다. 저장소가 하는 대로 소스에서 계약을 본다.

test('layerIndex 는 복합키로 세운다', () => {
  assert.match(MAIN, /layerIndex\.set\(`\$\{sc\.id\}\/\$\{l\.id\}`/,
    'layerIndex 가 복합키로 세워지지 않는다');
  assert.doesNotMatch(MAIN, /layerIndex\.set\(l\.id\s*,/,
    '맨 id 로 세우는 옛 줄이 남아 있다 — 덮어쓰기가 되살아난다');
});

test('표를 읽는 곳은 전부 한 해석기를 지난다 — 손으로 get 하는 자리를 남기지 않는다', () => {
  assert.match(MAIN, /const askLayer = \(id\) =>/, '맨 id 를 어떻게 받을지 정한 자리가 없다');
  for (const fn of ['showLayer', 'hideLayer', 'openCard', 'layerName']) {
    const at = MAIN.indexOf(`${fn}:`) >= 0 ? MAIN.indexOf(`${fn}:`) : MAIN.indexOf(`${fn} =`);
    assert.ok(at > 0, `${fn} 을 못 찾았다`);
    const body = MAIN.slice(at, at + 400);
    assert.match(body, /askLayer\(id\)/, `${fn} 이 해석기를 거치지 않고 표를 직접 뒤진다`);
  }
});

test('맨 id 가 두 씬에 걸치면 고르지 않는다 — 마지막 승자를 몰래 집지 않는다', () => {
  const at = MAIN.indexOf('const askLayer = (id) =>');
  const body = MAIN.slice(at, at + 400);
  // ① 복합키 정확히 맞으면 그것 ② 쓰는 씬이 하나뿐이면 그것 ③ 아니면 null
  assert.match(body, /layerIndex\.has\(key\)/, '복합키를 먼저 보지 않는다');
  assert.match(body, /length === 1/, '씬이 하나뿐일 때만 맨 id 를 받는 조건이 없다');
  assert.match(body, /: null/, '애매하면 null 을 주는 길이 없다');
  // null 이 그냥 삼켜지지 않는다 — ask-earth.js 가 '버린 것'으로 적는다.
  const ASK = lf(readFileSync(new URL('../../prototype/v2-three/js/ask-earth.js', import.meta.url), 'utf8'));
  assert.match(ASK, /if \(!label\) \{ dropped\.push/, '이름을 못 찾은 제안이 조용히 지나간다');
});

test('확장 화면(LAB·취미)의 카드를 liveLayers 에 묻지 않는다', () => {
  const at = MAIN.indexOf('openCard: (id) =>');
  assert.ok(at > 0, 'openCard 를 못 찾았다');
  const body = MAIN.slice(at, at + 900);
  assert.match(body, /e\.sid === 'lab' \|\| e\.sid === 'hobby'/,
    '확장 화면을 가르는 분기가 없다 — 맨 id 가 같은 다른 화면의 카드가 나온다');
  assert.match(body, /liveLayers\.card\(e\.l\.id\)/, '나머지 화면의 카드를 못 연다');
  assert.doesNotMatch(body, /liveLayers\.card\(id\)/,
    '모델이 준 id 를 그대로 카드 표에 넣고 있다 — 그 표도 맨 id 다');
});

test('스냅샷이 모델에게 주는 id 가 복합키다', () => {
  const at = MAIN.indexOf('const askSnapshot = ()');
  const body = MAIN.slice(at, at + 900);
  assert.match(body, /for \(const \[key, e\] of layerIndex\)/, '스냅샷이 표를 복합키로 훑지 않는다');
  assert.match(body, /available\.push\(\{ id: key,/);
  assert.match(body, /layers\.push\(\{ id: key,/);
});

test('되돌리기(restore)도 같은 이름을 쓴다 — 켠 것과 끄는 것이 어긋나면 장면이 안 돌아온다', () => {
  const at = MAIN.indexOf('const askCapture = ()');
  const body = MAIN.slice(at, at + 600);
  // 담는 쪽이 layerIndex 의 키를 그대로 쓰고, 푸는 쪽은 askTools 를 거친다(= askLayer 해석기).
  assert.match(body, /\[\.\.\.layerIndex\.entries\(\)\]/);
  assert.match(MAIN.slice(MAIN.indexOf('const askRestore = ')), /askTools\.(hide|show)Layer\(id\)/);
});

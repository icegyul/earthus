// 유료 v2 화면이 1.0 모듈을 거쳐 Open-Meteo 를 직접 부르던 길 — 그 길을 막은 결과 시험 (2026-09-21).
//
// 무엇이 잘못돼 있었나
//   point-readout.test.mjs 는 **v2-three/js/*.js 의 글자**만 본다. 그래서 "브라우저 직호출은
//   route.js 하나뿐" 으로 읽혔는데, 사실은 ext-scene.js 의 ctx.v1() 이 절대경로 /js/… 로
//   1.0 모듈을 런타임에 들여오고, 그 모듈 안에서 취미 화면 셋이 api.open-meteo.com ·
//   marine-api.open-meteo.com 을 직접 불렀다. 소스 글자만 세면 영원히 안 보이는 구멍이다.
//
// 그래서 이 시험은 **빌려 오는 목록을 따라간다**:
//   ext/*.js 가 ctx.v1('X') 로 빌리는 1.0 모듈을 모으고(같은 ext 안의 공용 모듈 경유도 따라간다),
//   그 파일이 Open-Meteo 를 부르는지 실제 파일에서 읽는다. 부르는 것이 하나라도 있으면
//   그 화면은 WITHDRAWN 에 있어야 하고, 그 모듈은 ctx.v1 의 세관(V1_DENY)에 있어야 한다.
//   ⚠️ 숫자를 박지 않는다 — 어느 화면이 몇 개인지는 소스와 표에서 센다.
//
// ⚠️ lab/today · lab/charts 는 여기 안 걸린다. 그 둘이 빌리는 today.js · ui-charts.js 는
//    **호출자를 직접 들고 있지 않다.** (그 아래로 동적 import 를 따라가면 place.js ·
//    layers/weather.js 같은 호출자가 모듈 그래프에 들어오긴 하지만, v2 가 부르는 함수
//    — gridOverlay.load() · stats.regions() · pointLayers.landobs 읽기 — 중 그 호출을
//    실행하는 것은 없다. '길은 있지만 눌러도 안 부른다'.) 그래서 직접 빌림만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { ExtScene, MODULES, V1_DENY, WITHDRAWN } from '../../prototype/v2-three/js/ext-scene.js';
import { BUOY_KM } from '../../prototype/v2-three/js/point-readout.js';

const EXT_DIR = new URL('../../prototype/v2-three/js/ext/', import.meta.url);
const V1_DIR = new URL('../../prototype/js/', import.meta.url);

// ════════════════════════════════════════════════════════════════════════════════════════════
//  ① 빌려 오는 목록을 따라가 새는 곳을 찾는다
// ════════════════════════════════════════════════════════════════════════════════════════════

const BORROW_RE = /\bv1\(\s*'([^']+)'/g;
const SIBLING_RE = /from\s+'\.\/([A-Za-z0-9._-]+\.js)'/g;
const KEY_RE = /\bkey:\s*'([^']+)'/;

// ⚠️ config.js 는 주소를 **적어 둔 표**다 — 부르는 자리가 아니다. 여기서 세면 config.js 를
//    빌리는 화면이 전부 거짓으로 걸린다(lab/today · hobby/vessel …).
const URL_TABLE = 'config.js';
const CALLS_RE = /(https?:\/\/[a-z0-9.-]*open-meteo\.com|API\.(?:METEO|MARINE|WEATHER_POINT)\b)/i;

const extFiles = readdirSync(EXT_DIR).filter((f) => f.endsWith('.js'));
const textOf = (dir, f) => readFileSync(new URL(f, dir), 'utf8');

/** 한 ext 파일이 직접 적은 ctx.v1('X') 들 */
function ownBorrows(text) {
  return [...text.matchAll(BORROW_RE)].map((m) => m[1]);
}

/** 그 화면이 실제로 들여오는 1.0 모듈 — 자기 것 + 같은 ext 폴더의 공용 모듈이 대신 빌리는 것 */
function borrowsOf(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = textOf(EXT_DIR, file);
  const out = ownBorrows(text);
  for (const [, sib] of text.matchAll(SIBLING_RE)) {
    if (extFiles.includes(sib)) out.push(...borrowsOf(sib, seen));
  }
  return [...new Set(out)];
}

/** 그 1.0 모듈이 Open-Meteo 를 부르는 줄을 갖고 있나 */
function callsOpenMeteo(path) {
  if (path === URL_TABLE) return false;
  let text;
  try { text = readFileSync(new URL(path, V1_DIR), 'utf8'); }
  catch { return false; }                       // 없는 파일은 이 시험이 답할 문제가 아니다
  return text.split('\n').some((l) => CALLS_RE.test(l));
}

/** 화면 키 → 새는 1.0 모듈 목록 */
function leaksByScreen() {
  const out = new Map();
  for (const f of extFiles) {
    const key = KEY_RE.exec(textOf(EXT_DIR, f))?.[1];
    if (!key) continue;                          // 공용 모듈(hobby-sea-common 등)은 key 가 없다
    const leaks = borrowsOf(f).filter(callsOpenMeteo).sort();
    if (leaks.length) out.set(key, leaks);
  }
  return out;
}

test('시험이 실제로 무언가를 세고 있다 — 빌림도 새는 곳도 0 이 아니다', () => {
  const borrowed = new Set(extFiles.flatMap((f) => borrowsOf(f)));
  assert.ok(borrowed.size > 5, `ctx.v1 빌림을 못 읽었다 (${borrowed.size}) — 정규식이 죽으면 아래가 전부 공허하게 통과한다`);
  assert.ok(leaksByScreen().size > 0, 'Open-Meteo 를 부르는 1.0 모듈을 하나도 못 찾았다');
});

test('1.0 모듈을 거쳐 Open-Meteo 를 부르던 화면은 전부 내려가 있다', () => {
  const leaking = [...leaksByScreen().keys()].sort();
  assert.deepEqual(leaking, Object.keys(WITHDRAWN).sort(),
    `새는 화면과 내린 화면이 다르다 — 새는 곳: ${leaking.join(', ')}`);
});

test('새는 1.0 모듈은 ctx.v1 의 세관에도 올라 있다 — 다른 화면이 같은 길로 못 나간다', () => {
  const leaks = [...new Set([...leaksByScreen().values()].flat())].sort();
  assert.deepEqual(leaks, Object.keys(V1_DENY).sort());
  for (const [path, why] of Object.entries(V1_DENY)) {
    assert.ok(why.host.includes('open-meteo.com'), `${path} 의 거절 이유에 호스트가 없다`);
    assert.ok(WITHDRAWN[why.key], `${path} 가 가리키는 화면 ${why.key} 이 WITHDRAWN 에 없다`);
  }
});

test('세관이 주소표는 막지 않는다 — config.js 를 막으면 멀쩡한 화면이 같이 죽는다', () => {
  assert.equal(V1_DENY[URL_TABLE], undefined);
  // 이 표를 빌려 쓰는 화면이 실제로 있다(막으면 그 화면들이 다 넘어진다).
  const users = extFiles.filter((f) => borrowsOf(f).includes(URL_TABLE));
  assert.ok(users.length > 0, 'config.js 를 빌리는 화면이 없다면 이 시험의 전제가 틀렸다');
});

test('내린 키는 모듈 표에 있는 키다 — 오타로 잠그면 아무것도 안 막힌다', () => {
  for (const key of Object.keys(WITHDRAWN)) {
    assert.ok(MODULES[key], `WITHDRAWN 의 ${key} 가 MODULES 에 없다`);
  }
});

test('내린 화면의 문장이 다른 파일의 상수를 글자로 베껴 쓰지 않는다', () => {
  // 처음엔 서핑 카드에 '120km 안 부이' 라고 적었다. 그 120 은 **내린** hobby-sea-common.js 의 값이고,
  // 지금 실제로 도는 길(point-readout.js)은 다른 수다. 한쪽만 바뀌면 카드가 거짓말을 한다.
  assert.equal(typeof BUOY_KM, 'number', '살아 있는 길의 부이 반경 상수를 못 읽었다');
  for (const [key, w] of Object.entries(WITHDRAWN)) {
    for (const lang of ['ko', 'en']) {
      const copy = Object.values(w[lang]).join(' ');
      const hits = [...copy.matchAll(/\d+\s*(?:km|킬로)/gi)].map((m) => m[0]);
      assert.deepEqual(hits, [], `${key}.${lang} 이 거리를 글자로 적었다(${hits.join(', ')}) — 상수가 사는 파일에서 따로 움직인다`);
    }
  }
});

test('내린 화면의 문장이 한국어·영어 둘 다 있고 빈 칸이 없다', () => {
  for (const [key, w] of Object.entries(WITHDRAWN)) {
    for (const lang of ['ko', 'en']) {
      for (const field of ['title', 'cant', 'why', 'instead']) {
        assert.ok(w[lang]?.[field]?.length > 5, `${key}.${lang}.${field} 가 비었다`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════
//  ② 눌렀을 때 — 모듈을 받지 않고, 이유를 적은 카드가 선다
// ════════════════════════════════════════════════════════════════════════════════════════════

class FakeGroup {
  constructor() { this.children = []; this.visible = true; }
  add(o) { this.children.push(o); return o; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); }
}

// ExtScene 은 생성자에서 ext.css 를 <head> 에 붙인다. 노드에는 document 가 없으니 최소한만 세운다.
globalThis.document = globalThis.document || {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, querySelectorAll: () => [] }),
  head: { appendChild() {} },
};

const scene = (ko = true) => new ExtScene({
  scene: { add() {} },
  THREE: { Group: FakeGroup },
  heightAt: () => 0,
  getExagger: () => 1,
  flyTo() {},
  cam: () => ({ lat: 35, lon: 128, altKm: 900 }),
  badge: (s) => s,
  i18n: { ko, lang: ko ? 'ko' : 'en' },
  refresh() {},
});

for (const key of Object.keys(WITHDRAWN)) {
  test(`${key} 를 눌러도 1.0 모듈을 받지 않는다 — 카드가 이유를 말한다`, async () => {
    const ext = scene();
    const st = await ext.open(key);
    assert.deepEqual(st, { on: true });
    assert.equal(ext.modules.has(key), false, '내린 화면인데 모듈을 받았다 — 그 순간 호출자가 런타임에 들어온다');
    assert.equal(ext.group.children.length, 0, '내린 화면이 지구에 무언가를 그렸다');
    assert.equal(ext.group.visible, false);
    assert.equal(ext.badge, 'UNAVAILABLE');

    const w = WITHDRAWN[key];
    const card = ext.card();
    assert.ok(card.includes(w.host), `카드가 어느 주소를 부르던 것인지 말하지 않았다 (${w.host})`);
    assert.ok(card.includes(w.v1) && card.includes(w.call), '어느 모듈의 어느 함수였는지 말하지 않았다');
    assert.match(card, /비상업/, '왜 유료 서비스에서 못 쓰는지 말하지 않았다');
    assert.ok(card.includes(w.ko.cant), '무슨 값을 못 내는지 말하지 않았다');
    assert.ok(!card.includes('ext:__retry'), "다시 눌러도 같은 이유로 안 열린다 — '다시 시도' 단추를 붙이면 안 된다");
    // 제목이 키(hobby/para)가 아니라 사람 말이다.
    assert.equal(ext.title, w.ko.title);
  });
}

test('영어 화면도 같은 사실을 말한다 — 한쪽만 고쳐 두지 않는다', async () => {
  const key = Object.keys(WITHDRAWN)[0];
  const ext = scene(false);
  await ext.open(key);
  const card = ext.card();
  assert.ok(card.includes(WITHDRAWN[key].host));
  assert.match(card, /non-commercial/);
  assert.equal(ext.title, WITHDRAWN[key].en.title);
});

test('같은 항목을 다시 누르면 꺼진다 — 다른 화면과 같은 규칙이다', async () => {
  const key = Object.keys(WITHDRAWN)[0];
  const ext = scene();
  await ext.open(key);
  assert.deepEqual(await ext.open(key), { on: false });
  assert.equal(ext.active, null);
  assert.equal(ext.card(), '');
});

test('내린 화면끼리 갈아타도 모듈은 하나도 안 받는다', async () => {
  const keys = Object.keys(WITHDRAWN);
  const ext = scene();
  for (const key of keys) {
    const st = await ext.open(key);
    assert.deepEqual(st, { on: true }, `${key} 로 갈아탈 때 다른 답이 왔다`);
    assert.equal(ext.active, key);
    assert.equal(ext.card().includes(WITHDRAWN[key].host), true, `${key} 카드가 앞 화면 것으로 남아 있다`);
  }
  assert.equal(ext.modules.size, 0, '갈아타는 사이에 1.0 모듈이 하나라도 들어왔다');
  assert.equal(ext.group.children.length, 0);
});

test('내린 화면에서는 카드 단추도 지구 클릭도 조용히 아무 일 없다', async () => {
  const key = Object.keys(WITHDRAWN)[0];
  const ext = scene();
  await ext.open(key);
  assert.deepEqual(ext.handleAction('ext:tab', { tab: 'how' }), { handled: true });
  assert.equal(ext.pick(35, 128), null);
  ext.rebuild();
  assert.equal(ext.group.children.length, 0);
});

test('세관은 카드가 아니라 문 자체다 — 어느 화면이 빌리려 해도 거절한다', async () => {
  const ext = scene();
  for (const [path, why] of Object.entries(V1_DENY)) {
    await assert.rejects(() => ext.ctx.v1(path), (e) => {
      assert.ok(e.message.includes(path), `거절 이유에 모듈 이름이 없다: ${e.message}`);
      assert.ok(e.message.includes(why.host), `거절 이유에 주소가 없다: ${e.message}`);
      return true;
    });
  }
});

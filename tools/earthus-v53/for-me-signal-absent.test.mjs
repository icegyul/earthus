// DEV-DIRECTIVE 2026-09-20 · W2 뒤처리 — **묻지 않은 것**과 **답이 없는 것**을 가른다.
//
// 무엇이 잘못돼 있었나: 시간별 파고는 이제 요청 자체를 하지 않는다(main.js 가 data.waveHourly = null 로
//   못박는다 — 브라우저가 marine-api.open-meteo.com 의 hourly 를 직접 부르던 길을 걷어냈고, 우리 수집기
//   aws/marine-grid 는 `current=` 로 **한 시각**만 받는다). 그런데 파고 카드의 status 한 줄이 아직
//   '시간별 예보 응답 없음' 이라 적어 **제공기관이 대답을 못 준 것처럼** 말했다. 앞선 커밋이 같은 함수의
//   두 자리(certain.reasons · engine)는 고쳤는데 이 한 줄을 빠뜨렸다.
//
// 여기서 잠그는 것 둘:
//   ① 파고 카드의 세 자리(status · reasons · engine)가 **같은 말**을 한다 — '우리 자료에 없음'.
//   ② 파일 전체에 같은 병이 더 없다 — '시간별'과 '응답 없음'이 한 줄에 같이 있으면 떨어진다.
//
// ⚠️ 다른 '응답 없음' 은 거짓이 아니다. 공식 태풍 발표·쓰나미 게시문·지진 목록·해양 격자는 main.js
//    loadForMe 가 **실제로 받으러 간다**(keys{}). 그것들이 null 이면 정말 응답이 없었던 것이다.
//    그래서 이 시험은 '시간별' 과 짝지어진 자리만 잡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { evaluateForMe, waveCard } from '../../prototype/v2-three/js/for-me-signal.js';

const SRC_URL = new URL('../../prototype/v2-three/js/for-me-signal.js', import.meta.url);
const MAIN_URL = new URL('../../prototype/v2-three/js/main.js', import.meta.url);
const src = () => readFileSync(SRC_URL, 'utf8');

const NOW = Date.parse('2026-09-20T09:00:00+09:00');
const PLACE = { lat: 35.0, lon: 125.0, name: '내 동네' };

/** ocean/marine*.json 과 같은 모양의 작은 5° 격자 — 한 칸에만 파고를 넣는다(행 0 = 남쪽). */
const grid = (wave = 1.4) => {
  const nx = 72; const ny = 33;
  const arr = new Array(nx * ny).fill(null);
  arr[23 * nx + 61] = wave;          // lat 35 · lon 125
  return { time: '2026-09-20T00:00:00Z', res: 5, lat0: -80, lon0: -180, nx, ny, source: 'Open-Meteo Marine', wave: arr };
};

test('시간별 파고는 요청 자체를 하지 않는다 — main.js 가 못박은 자리가 그대로다', () => {
  const main = readFileSync(MAIN_URL, 'utf8');
  assert.match(main, /data\.waveHourly = null;/,
    '이 시험의 전제가 깨졌다 — 시간별 파고를 다시 받기 시작했다면 아래 문장들도 다시 봐야 한다');
});

test("파고 카드가 '응답 없음'이라 적지 않는다 — 묻지 않은 것은 우리 자료에 없는 것이다", () => {
  const card = waveCard(PLACE, [grid()], { stations: [] }, { now: NOW, hourly: null });
  assert.ok(card, '파고 격자가 있는데 카드를 안 세웠다');
  for (const [where, text] of [['status', card.status], ['basis', card.basis.text]]) {
    assert.ok(!/응답 없음/.test(text),
      `${where} 가 '${text}' — 묻지 않은 것을 제공기관이 답을 못 준 것처럼 적었다`);
  }
  assert.match(card.status, /우리 자료에 없음/, "status 가 '우리 자료에 없음' 쪽으로 말을 맞추지 않았다");
});

test('파고 카드의 세 자리가 같은 말을 한다 — 한 곳만 고치면 카드가 두 말을 한다', () => {
  const card = waveCard(PLACE, [grid()], { stations: [] }, { now: NOW, hourly: null });
  const hourlyEngine = card.engine.find((e) => /시간별/.test(e.name));
  assert.ok(hourlyEngine && hourlyEngine.used === false, '시간별 예보 줄이 엔진 목록에 없다');
  const places = [card.status, hourlyEngine.text, ...card.certain.reasons.filter((r) => /시간별/.test(r))];
  assert.equal(places.length, 3, '시간별 예보를 말하는 자리가 세 곳이 아니다 — 시험이 셋을 다 보고 있지 않다');
  for (const text of places) {
    assert.ok(!/응답 없음/.test(text), `'${text}' 가 아직 응답 없음이라 적는다`);
  }
});

test('시간별 예보가 없어도 격자값으로 판정은 한다 — 판단 불가로 미루지 않는다', () => {
  const card = waveCard(PLACE, [grid(3.1)], { stations: [] }, { now: NOW, threshold: 2.0, hourly: null });
  assert.equal(card.state, 'signal', '격자값이 임계를 넘는데 신호로 세우지 않았다');
  assert.equal(card.facts.wave, 3.1);
});

test('같은 병이 파일 어디에도 더 없다 — 묻지 않은 것을 응답 없음이라 적은 줄', () => {
  const bad = src().split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => !line.trimStart().startsWith('//') && /시간별/.test(line) && /응답 없음/.test(line));
  assert.deepEqual(bad.map(({ n, line }) => `${n}: ${line.trim()}`), [],
    '시간별 파고는 요청하지 않는다 — 그 자리에 응답 없음은 거짓이다');
});

test("받지 못한 것은 여전히 '응답 없음'이라 적는다 — 실제로 받으러 가는 것들이다", () => {
  // main.js loadForMe 는 공식 태풍 발표·쓰나미 게시문·지진 목록을 실제로 받으러 간다.
  // 그것이 null 이면 정말 응답이 없었던 것이므로 말을 바꾸면 그쪽이 거짓이 된다.
  const main = readFileSync(MAIN_URL, 'utf8');
  const cards = evaluateForMe(PLACE, { official: null, tsunami: null, quakes: null }, { now: NOW });
  for (const [kind, key] of [['cyclone', 'official'], ['tsunami', 'tsunami'], ['quake', 'quakes']]) {
    assert.ok(new RegExp(`${key}: '/events/`).test(main), `${key} 를 받으러 가는 줄이 main.js 에 없다`);
    const card = cards.find((c) => c.kind === kind);
    assert.equal(card.state, 'unknown', '자료 없음을 안전으로 바꾸지 않는다');
    assert.match(card.basis.text, /응답 없음/);
  }
});

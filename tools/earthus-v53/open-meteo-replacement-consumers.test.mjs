// 2026-09-24 · STREAM D 검수 — pressure-grid·fx-grid 원천을 Open-Meteo → NOAA GFS(NOMADS)로 바꾼 뒤 v1 소비자 쪽.
//
// 무엇이 잘못돼 있었나 (검수에서 찾은 것):
//   ① ui-timeline.js 가 예보 격자를 칸 번호로 집었다(d.steps[i]). 새 fx-grid 는 받지 못한 스텝을 **빼고** 쓴다
//      (aws/fx-grid/handler.py stepsMissing). +24h 가 빠진 날 '+24시간' 칸에 +30h 격자가 조용히 그려진다.
//   ② 화면 출처 줄(ui-source.js)이 등압선·바람을 여전히 "Open-Meteo" 라고 적었다 — 동아시아 1° 판은 NOAA GFS 가 된다.
//      예보 칩은 "모델(GFS·ECMWF)" 을 박아 두었다.
//
// 결과로 잠근다: 빠진 스텝이 있어도 **그 시각의 격자가 나와야** 하고(없으면 없음), 출처 줄에 **실제 원천 둘이 다 있어야** 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const timeline = stripComments(read('prototype/js/ui-timeline.js'));

/* ui-timeline.js 의 실제 선택식을 소스에서 꺼내 그대로 돌린다 — 시험이 따로 만든 흉내가 아니다. */
function stepPicker() {
  const m = timeline.match(/const st = (d\?\.steps\?\.find\([^;]+\)[^;]*);/);
  assert.ok(m, 'ui-timeline.js 는 스텝을 steps.find(...) 로 골라야 한다(칸 번호 인덱싱 금지)');
  // eslint-disable-next-line no-new-func
  return new Function('d', 'STEP_H', 'i', `const self = { _i: i }; return (${m[1].replace(/this\./g, 'self.')});`);
}

const STEP_H = 6;
const step = (h) => ({ t: `h${h}`, h, mslp: [1000 + h], u: [0], v: [0], min: 1000, max: 1000 });

test('빠진 스텝이 있어도 각 칸은 자기 시각의 격자를 받는다', () => {
  const pick = stepPicker();
  // +24h(인덱스 4)가 빠진 문서 — 새 fx-grid 가 실제로 내는 모양
  const doc = { steps: [0, 6, 12, 18, 30, 36].map(step) };
  assert.equal(pick(doc, STEP_H, 3).h, 18);
  assert.equal(pick(doc, STEP_H, 4), null, '+24h 칸은 +30h 격자가 아니라 "없음"이어야 한다');
  assert.equal(pick(doc, STEP_H, 5).h, 30, '+30h 칸은 +30h 격자를 받아야 한다');
  assert.equal(pick(null, STEP_H, 2), null);
});

test('옛 파일(빠짐 없는 21스텝)에서도 같은 칸을 고른다', () => {
  const pick = stepPicker();
  const doc = { steps: Array.from({ length: 21 }, (_, k) => step(k * 6)) };
  for (let i = 0; i <= 20; i += 1) assert.equal(pick(doc, STEP_H, i).h, i * 6);
});

test('예보 칩은 모델 이름을 박지 않고 문서의 model 을 본다', () => {
  assert.doesNotMatch(timeline, /모델\(GFS·ECMWF\)과/, '옛 고정 문구가 남아 있다');
  assert.match(timeline, /d\?\.model \? 'NOAA GFS'/);
});

test('출처 줄: 등압선·바람은 NOAA GFS(동아시아)와 Open-Meteo(전지구)를 둘 다 적는다', () => {
  const src = read('prototype/js/ui-source.js');
  for (const key of ['wind', 'pressure']) {
    const m = src.match(new RegExp(`\\n  ${key}:\\s*\\{ ko: '([^']+)',\\s*\\n?\\s*en: '([^']+)'`));
    assert.ok(m, `${key} 줄을 찾지 못했다`);
    for (const label of [m[1], m[2]]) {
      assert.match(label, /NOAA\/NCEP GFS/, `${key}: 동아시아 1° 판의 실제 원천(NOAA)이 있어야 한다`);
      assert.match(label, /Open-Meteo/, `${key}: 전지구 5° 판의 원천(Open-Meteo)이 있어야 한다`);
    }
  }
});

test('서버 산출물이 소비자가 읽는 키(h·model)를 싣는다', () => {
  const fx = read('aws/fx-grid/handler.py');
  assert.match(fx, /"t": valid\.strftime\([^)]*\), "h": s_i \* STEP_H/);
  assert.match(fx, /"model": "gfs_0p50"/);
  assert.match(fx, /"stepsMissing": missing/);
});

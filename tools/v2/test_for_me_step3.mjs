// FOR ME STEP 3 검사 — 파고 시간별 창 · 사건 방용 지진 카드 · 피드 항목↔카드 매칭 (2026-09-07)
//   node tools/v2/test_for_me_step3.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = process.env.EARTHUS_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(repo, 'tools/v2/fixtures/forme', n), 'utf8'));
const m = await import(pathToFileURL(path.join(repo, 'prototype/v2-three/js/for-me-signal.js')).href);
const NOW = Date.parse('2026-09-06T12:10:00Z');
const H = 3600_000;
const out = {};

/* 1. 시간별 파고 — Open-Meteo hourly 모양을 흉내 낸 합성 자료: 지금 1.2 m, +18h 부터 2.6 m 로 올라 +30h 최대 3.1 m, +40h 아래로 */
const times = [], wave = [], swell = [], ww = [], per = [];
for (let h = -2; h < 72; h++) {
  const t = new Date(NOW + h * H).toISOString().slice(0, 16);
  const v = h < 18 ? 1.2 : h < 30 ? 2.6 : h < 34 ? 3.1 : h < 40 ? 2.2 : 1.0;
  times.push(t); wave.push(v); swell.push(v * 0.6); ww.push(v * 0.4); per.push(8);
}
const series = m.waveHourlySeries({ hourly: { time: times, wave_height: wave, swell_wave_height: swell, wind_wave_height: ww, wave_period: per } });
assert.ok(series && series.length >= 70, '시간별 시리즈');
assert.equal(m.waveHourlySeries({}), null, '모양이 다르면 null');
const win = m.waveWindow(series, 2.0, NOW);
assert.ok(win && !win.none, '임계 초과 창');
assert.equal(Math.round((win.startMs - NOW) / H), 18, '초과 시작 +18h');
assert.equal(Math.round((win.endMs - NOW) / H), 39, '연속 끝 +39h');
assert.equal(win.peakWave, 3.1, '최대 3.1 m');
assert.ok(!win.startNow && !win.openEnd);
const quietWin = m.waveWindow(series.map((x) => ({ ...x, wave: 1.0 })), 2.0, NOW);
assert.ok(quietWin && quietWin.none && quietWin.maxWave === 1.0, '초과 없으면 none + 최대값');

/* 2. 파고 카드 — 지금 격자는 임계 미만이어도 시간별 예보로 신호 */
const busan = { lat: 35.1, lon: 129.04, name: '부산' };
const data = { marineEa: fx('marine-ea.json'), marine: fx('marine.json'), buoys: fx('kma-buoy.json') };
const cardNow = m.waveCard(busan, [data.marineEa, data.marine], data.buoys, { threshold: 2.0, now: NOW, hourly: series });
assert.equal(cardNow.state, 'signal');
assert.ok(cardNow.when && Math.round((cardNow.when.startMs - NOW) / H) === 18, 'WHEN = 시간별 창');
assert.ok(cardNow.timeline.length === 4 && cardNow.timeline[0].label === '지금', '타임라인 4칸');
assert.ok(cardNow.timeline.some((t) => t.level === 'in' || t.level === 'peak'), '초과 구간 표시');
assert.ok(cardNow.why.some((w) => w.key === 'wavefc' && /최대 3\.1 m/.test(w.value)), '왜: 예보 최대값');
assert.ok(cardNow.certain.reasons.some((r) => /시간별 예보 \d+시간/.test(r)));
assert.match(cardNow.engineSummary, /개 자료 중 \d+개 같은 방향/);
// 시간별이 없으면 예전과 같이 격자만 — 상태 문구가 '응답 없음'
const cardNoH = m.waveCard(busan, [data.marineEa, data.marine], data.buoys, { threshold: 2.0, now: NOW, hourly: null });
assert.equal(cardNoH.when, null); assert.match(cardNoH.status, /응답 없음/);
// 큰 임계(4 m)면 시간별로도 조용 — 3일 내 최대만 적힌다
const cardQuiet = m.waveCard(busan, [data.marineEa, data.marine], data.buoys, { threshold: 4.0, now: NOW, hourly: series });
assert.equal(cardQuiet.state, 'quiet');
assert.ok(cardQuiet.why.some((w) => w.key === 'wavefc' && /3일 내 최대/.test(w.value)));
out.wave = { state: cardNow.state, start: m.fmtKst(cardNow.when.startMs), end: m.fmtKst(cardNow.when.endMs), peak: cardNow.when.peakWave, tl: cardNow.timeline.map((t) => `${t.label}:${t.level}`) };

/* 3. 사건 방용 지진 카드 (USGS 피드 항목) */
const evNear = { id: 'eq-x1', kind: 'EQ', lat: 34.5, lon: 129.5, mag: 5.4, whenT: NOW - 3 * H, where: '대한해협', depthKm: 12, source: 'USGS' };
const qNear = m.quakeCardFromEvent(busan, evNear);
assert.equal(qNear.state, 'signal'); assert.ok(qNear.facts.km < 400 && qNear.facts.mag === 5.4);
assert.match(qNear.basis.text, /400 km 안 M5\+ 규칙/);
const evFar = { ...evNear, id: 'eq-x2', lat: 20.0, lon: 140.0 };
assert.equal(m.quakeCardFromEvent(busan, evFar).state, 'quiet');
const evSmall = { ...evNear, id: 'eq-x3', mag: 4.2 };
assert.equal(m.quakeCardFromEvent(busan, evSmall).state, 'quiet');
const evTitleOnly = { ...evNear, id: 'eq-x4', mag: null, title: 'M6.2 지진' };
assert.equal(m.quakeCardFromEvent(busan, evTitleOnly).facts.mag, 6.2, '숫자 없으면 제목의 M6.2 를 읽는다');
assert.equal(m.quakeCardFromEvent(busan, { id: 'bad' }), null);
out.quake = { near: qNear.state, far: 'quiet' };

/* 4. 피드 항목 ↔ 카드 매칭 */
const full = { official: fx('typhoon-official.json'), ecmwf: fx('typhoon-ecmwf.json'), marineEa: data.marineEa, marine: data.marine, buoys: data.buoys, fcst: fx('kma-fcst.json'), quakes: fx('quake-asia.json'), tsunami: fx('tsunami-intl.json'), tsunamiEta: fx('tsunami-eta.json') };
const cards = m.evaluateForMe(busan, full, { now: NOW });
const tcItem = { id: 'tc-1001318', kind: 'TC', stormName: 'KROVANH', title: '태풍 KROVANH-26' };
assert.equal(m.matchCardForRoom(cards, tcItem)?.id, 'KROVANH', 'GDACS 이름 → 공식 key');
assert.equal(m.matchCardForRoom(cards, { id: 'tc-9', kind: 'TC', stormName: 'NOSUCH' }), null, '공식 발표에 없으면 null');
const qc = cards.find((c) => c.kind === 'quake');
if (qc) {
  const it = { id: 'eq-z', kind: 'EQ', lat: 0, lon: 0, mag: qc.facts.mag, whenT: qc.basis.issueMs };
  assert.equal(m.matchCardForRoom(cards, it)?.id, qc.id, '같은 시각·규모의 지진은 같은 카드');
}
assert.equal(m.matchCardForRoom(cards, { id: 'x', kind: 'VOLCANO' }), null);
out.match = { tc: 'KROVANH', quakeCardsInBusan: cards.filter((c) => c.kind === 'quake').length };

console.log(JSON.stringify(out, null, 1));
console.log('PASS test_for_me_step3');

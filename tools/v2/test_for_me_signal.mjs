// FOR ME 판정 엔진 검사 (지시서 v2.0 §8 검증 항목을 node 로). 브라우저 없이 돈다.
//   node tools/v2/test_for_me_signal.mjs
// 픽스처는 2026-09-06 15:25Z 실데이터(태풍 KROVANH 활성) — tools/v2/fixtures/forme/
//   1. 실제 태풍 사례: 오키나와 나하(26.21N 127.68E) — JMA 강풍역(남서 440 km) 안 → signal, WHEN 있음
//   2. 태풍 없는 사례: 부산 — KROVANH 1,000 km 밖 → quiet, 파고·지진은 자료대로
//   3. 자료 없음 사례: 전부 null → 카드 4장 모두 unknown(판단 불가), 절대 quiet 아님
//   4. 무엇이 달라졌나: 직전 발표(KMA 06Z·JMA 18:45)를 같은 함수로 계산해 비교
//   5. 규율: 확률 % 없음, 원시 개수, 배지 이름은 engine-bridge 가 아는 것만
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = process.env.EARTHUS_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(repo, 'tools/v2/fixtures/forme', n), 'utf8'));
const m = await import(pathToFileURL(path.join(repo, 'prototype/v2-three/js/for-me-signal.js')).href);

const NOW = Date.parse('2026-09-06T12:10:00Z');           // JMA 강풍역 창(21:00~00:00 KST) 안의 시각 — 나하가 '영향권 안'인 순간
const data = { official: fx('typhoon-official.json'), ecmwf: fx('typhoon-ecmwf.json'), marineEa: fx('marine-ea.json'), marine: fx('marine.json'),
               buoys: fx('kma-buoy.json'), fcst: fx('kma-fcst.json'), quakes: fx('quake-asia.json'), tsunami: fx('tsunami-intl.json'), tsunamiEta: fx('tsunami-eta.json') };
const out = {};

/* 1. 실제 태풍 사례 — 나하 */
const naha = { lat: 26.21, lon: 127.68, name: '나하' };
const cardsN = m.evaluateForMe(naha, data, { now: NOW });
const kro = cardsN.find((c) => c.kind === 'cyclone' && c.id === 'KROVANH');
assert.ok(kro, 'KROVANH 카드');
assert.equal(kro.state, 'signal', '나하는 JMA 강풍역 안');
assert.match(kro.basis.text, /일본 기상청.*강풍역 안.*발표/, '판단 기준에 기관·반경 종류·발표시각');
assert.ok(kro.when && kro.when.startNow, 'h=0 에 이미 안 → 지금부터');
assert.equal(kro.when.widthH, 6);
assert.ok(kro.why.some((w) => w.key === 'approach' && /km/.test(w.value)), '왜: 태풍 접근 거리');
assert.ok(kro.why.every((w) => w.source), '원인마다 자료명');
assert.ok(kro.certain && ['높음', '보통', '낮음'].includes(kro.certain.gradeKo), '등급');
assert.ok(kro.certain.reasons.some((r) => /기관 예보 \d\/\d/.test(r)), '이유에 원시 개수');
assert.ok(kro.certain.reasons.some((r) => /KMA.*반경 자료가 없어/.test(r)), 'KMA 는 반경 없음으로 제외');
assert.ok(kro.certain.reasons.some((r) => /앙상블 \d+\/51/.test(r)), 'ECMWF 51 멤버 원시 개수');
assert.ok(!kro.certain.reasons.join(' ').includes('%'), '확률 % 없음');
assert.ok(kro.engine.some((e) => /한국 기상청/.test(e.name) && e.used === false), 'WHY ENGINE: KMA ○ 미사용');
assert.ok(kro.engine.some((e) => /일본 기상청/.test(e.name) && e.used === true), 'WHY ENGINE: JMA ●');
assert.ok(kro.engine.some((e) => /ASCAT/.test(e.name) && e.used === false && /미연결/.test(e.text)), 'ASCAT 미연결 그대로');
assert.ok(kro.engine.find((e) => /해양 모델/.test(e.name)).hit === true, '파고 임계 초과는 방향 일치');
{ const mm = kro.engineSummary.match(/^(\d+)개 자료 중 (\d+)개 같은 방향$/); assert.ok(mm, '요약 형식'); assert.ok(+mm[2] >= 3 && +mm[2] <= +mm[1], '같은 방향 = JMA·앙상블·파고 최소 3'); }
assert.ok(kro.timeline.length >= 3 && kro.timeline[0].label === '지금', '예상 변화 타임라인');
assert.ok(!kro.why.some((w) => w.key === 'wind'), '한국 밖(나하)엔 동네예보 지점 없음 → 강풍 줄 없음');
/* 1b. 같은 자료, 창이 지난 시각(09/07 02:00 KST) → 지남: quiet + 지난 창 기록. 자료 없음이 아니므로 unknown 이 아니다 */
const kroLate = m.evaluateForMe(naha, data, { now: Date.parse('2026-09-06T17:00:00Z') }).find((c) => c.id === 'KROVANH');
assert.equal(kroLate.state, 'quiet', '창이 지나면 신호 없음');
assert.match(kroLate.basis.text, /안이었으나 .* 지남/, '판단 기준에 지남 사실');
assert.ok(kroLate.facts.pastWindow && kroLate.facts.pastWindow.endMs < Date.parse('2026-09-06T17:00:00Z'));
assert.ok(kroLate.engine.find((e) => /일본 기상청/.test(e.name)).hit === false, '지난 발표는 방향 일치로 세지 않음');
out.nahaLate = { state: kroLate.state, basis: kroLate.basis.text };
out.naha = { state: kro.state, grade: kro.certain.gradeKo, when: [m.fmtKst(kro.when.startMs), m.fmtKst(kro.when.endMs)], nearest: kro.facts.nearestKm, ens: kro.facts.ens?.n };

/* 2. 태풍 없는 사례 — 부산 */
const busan = { lat: 35.1, lon: 129.04, name: '부산' };
const cardsB = m.evaluateForMe(busan, data, { now: NOW });
const kroB = cardsB.find((c) => c.kind === 'cyclone' && c.id === 'KROVANH');
assert.equal(kroB.state, 'quiet', '부산은 강풍역 밖');
assert.equal(kroB.when, null);
assert.ok(kroB.facts.nearestKm > 800);
assert.ok(kroB.why.some((w) => w.key === 'wind') && kroB.why.some((w) => w.key === 'wave'), '한국 안: 동네예보·파고 줄 있음');
const waveB = cardsB.find((c) => c.kind === 'wave');
assert.ok(waveB && waveB.state !== 'unknown', '파고 카드는 격자로 판정');
assert.ok(cardsB.filter((c) => c.kind === 'quake').every((c) => c.facts.km <= 400 && c.facts.mag >= 5), '지진은 400 km·M5+ 만');
assert.ok(!cardsB.some((c) => c.kind === 'tsunami'), 'Information 게시문뿐 → 쓰나미 카드 없음');
const sumB = m.summarize(cardsB);
assert.ok(['signal', 'quiet'].includes(sumB.level));
out.busan = { cyclone: kroB.state, nearest: kroB.facts.nearestKm, wave: waveB.state, waveM: waveB.facts.wave, quakes: cardsB.filter((c) => c.kind === 'quake').length, summary: sumB.text };

/* 3. 자료 없음 사례 */
const cardsX = m.evaluateForMe(busan, { official: null, ecmwf: null, marineEa: null, marine: null, buoys: null, fcst: null, quakes: null, tsunami: null, tsunamiEta: null }, { now: NOW });
assert.equal(cardsX.length, 4, '태풍·쓰나미·지진·파고 4장');
assert.ok(cardsX.every((c) => c.state === 'unknown'), '전부 판단 불가');
assert.ok(cardsX.every((c) => /판단 불가/.test(c.basis.text)));
assert.equal(m.summarize(cardsX).level, 'unknown', '자료 없음은 안전이 아니다');
out.nodata = cardsX.map((c) => `${c.kind}:${c.state}`);

/* 4. 무엇이 달라졌나 — 직전 발표 재계산 */
const storm = data.official.storms.find((s) => s.key === 'KROVANH');
const packet = fx('packet-1001318.json');
const issues = m.issuesFromPacket(packet);
assert.ok(issues.KMA.length >= 5 && issues.JMA.length >= 5, '패킷에 기관별 발표 이력');
const prev = m.previousIssues(packet, storm);
assert.deepEqual(prev.map((p) => p.sourceRef).sort(), ['events/typhoon-official/archive/KROVANH/JMA-202609061845.json', 'events/typhoon-official/archive/KROVANH/KMA-202609060600.json'], '직전 발표 = KMA 06Z · JMA 18:45');
const prevStorm = m.stormFromArchives([fx('arch-KMA-202609060600.json'), fx('arch-JMA-202609061845.json')], storm);
assert.equal(prevStorm.agencies.length, 2);
const ctx = { ecmwf: data.ecmwf, grids: [data.marineEa, data.marine], buoys: data.buoys, fcst: data.fcst, now: NOW };
const curCard = m.typhoonCard(naha, storm, ctx), prevCard = m.typhoonCard(naha, prevStorm, ctx);
const ch = m.typhoonChanged(curCard, prevCard);
assert.ok(ch && ch.lines.length, '변화 줄');
assert.ok(ch.prevIssueMs < ch.curIssueMs, '직전 → 현재 순서');
const hist = Object.values(issues).flat().sort((a, b) => b.issueMs - a.issueMs).slice(0, 2)
  .map((x) => m.historyLine(m.typhoonCard(naha, m.stormFromArchives([fx('arch-' + x.sourceRef.split('/').pop())], storm), ctx), x));
assert.ok(hist.every((h) => h.agency && h.issueMs && ['signal', 'quiet', 'unknown'].includes(h.state)), '이력 줄');
out.changed = { prev: m.fmtKst(ch.prevIssueMs), cur: m.fmtKst(ch.curIssueMs), lines: ch.lines };

/* 5. 배지 이름 — engine-bridge 가 아는 것만 */
const KNOWN = new Set(['LIVE', 'OBSERVED', 'OFFICIAL_FORECAST', 'MODEL_SIGNAL', 'MODEL', 'SIMULATION_ONLY', 'DERIVED', 'DEMO', 'HISTORY', 'OFFICIAL_OBSERVATION', 'OFFICIAL_WARNING', 'PROVIDER_FORECAST', 'EARTHUS_ANALYSIS', 'EARTHUS_FORECAST', 'ESTIMATED_DISTRIBUTION', 'SIMULATION', 'VISUALIZATION_ONLY', 'LOADING', 'OFFICIAL_INFORMATION', 'STALE', 'UNAVAILABLE', 'INSUFFICIENT_DATA', 'LOCKED', 'PRO']);
for (const c of [...cardsN, ...cardsB, ...cardsX]) for (const b of c.badges || []) assert.ok(KNOWN.has(b), `모르는 배지: ${b}`);
/* 폴백 탐색기 — fetch 가 null 만 주면 null */
assert.equal(await m.findPreviousIssue(storm, async () => null), null);

console.log(JSON.stringify(out, null, 1));
console.log('PASS test_for_me_signal');

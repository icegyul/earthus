// 2026-09-23 PD — 지점 카드(js/point-card.js) 시험.
//   "기온 들어가면 지구가 색으로 바뀌는데 거기서 지역을 누르면 그때 창이 뜨면서 … 그때 인텔리전스 기능이 나와야 맞지"
//   · "버튼 누르면 다른 안내화면 나오지 말고".
//
// 결과로 잠근다(금지만 시험하면 아무 말도 안 하는 카드가 통과한다 — AGENTS.md '일하는 법' 2):
//   ① 값이 맨 위에 **나와야** 한다 — 25 km 안의 신선한 관측이면 관측이, 아니면 모델 칸값이.
//   ② 출처 줄이 **나와야** 한다 — 관측(기관·지점·시각·거리)과 모델(이름·런·유효).
//   ③ 왜 · ④ 앞으로 5일 · 확률 — 재료가 없으면 그 자리에 **이유 한 줄이 나와야** 한다(빈 칸도, 다른 화면도 아님).
//   ⑤ 입구 단추가 같은 자리에 **있어야** 한다 — 능력이 없으면 누르면 이유를 말하는 sim-why.
//   그리고: 인과 금지어가 카드 글에 없고, 관측은 타임라인이 '지금'일 때만 섞인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  POINT_OBS_MAX_KM, anomalyFor, fmtDelta, kstLeapIndex, loadPointDays, loadPointNormal, loadPointObs, nearestObs, normalFor, pointCardHtml, readPointNow,
} from '../../prototype/v2-three/js/point-card.js';
import { FIELD_DESCRIPTORS } from '../../prototype/v2-three/js/field-layer.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { readTicks } from '../../prototype/v2-three/js/field-log.js';

const root = (rel) => new URL(`../../${rel}`, import.meta.url);
const vocab = JSON.parse(readFileSync(root('aws/_shared/contracts/intel-vocab.json'), 'utf8'));
const H = 3.6e6;
const NOW = Date.parse('2026-09-23T04:30:00Z');   // 13:30 KST
const SEOUL = { lat: 37.57, lon: 126.97 };

// 프레임 저장소 흉내 — gfs-frames.js 의 api 모양(loaded · has · framesFor · fieldSpec · info · ensure · sampleAt).
const fakeFrames = ({ runMs = Date.parse('2026-09-22T18:00:00Z'), value = 26.2 } = {}) => {
  const frames = [];
  for (let h = 0; h <= 120; h += 3) frames.push({ h, t: runMs + h * H, url: `t${h}` });
  const ensured = [];
  return {
    loaded: true,
    has: (id) => id === 'temp',
    framesFor: () => frames,
    fieldSpec: () => ({ channels: [{ transfer: 'linear', scale: 0.5, offset: -80 }] }),
    info: () => ({ model: 'GFS', runMs, resolutionDeg: 0.5 }),
    async ensure(id, t) { ensured.push(t); return {}; },
    sampleAt: (id, t) => ({ value: value + ((t - runMs) / H) * 0.01, values: [value], decoded: true, exact: true, outOfRange: null }),
    ensured,
  };
};

// 켜진 색면 객체 흉내 — FieldLayer 의 desc · frames · scale · timeBus · cellWord · sampleAt.
const fakeField = ({ desc = FIELD_DESCRIPTORS.tempgrid, frames = fakeFrames(), tMs = NOW, sample } = {}) => ({
  desc, frames, scale: scaleOf(desc.scaleId), timeBus: { validMs: () => tMs }, cellWord: () => null,
  sampleAt(lat, lon) {
    if (sample !== undefined) return sample;
    const s = frames.sampleAt(desc.fieldId, tMs, lat, lon);
    return s ? Object.assign(s, readTicks(frames.fieldSpec().channels[0])) : null;
  },
});

const kmaSite = (over = {}) => ({ src: 'KMA', id: '108', name: '서울', lat: 37.5714, lon: 126.9658, temp: 27.4, obsMs: NOW - 30 * 60e3, ...over });

test('nearestObs — 25 km 안 · 신선한 · 기온이 있는 지점만(격자 vs 실측 규칙)', () => {
  const near = nearestObs([kmaSite()], SEOUL.lat, SEOUL.lon, { nowMs: NOW });
  assert.equal(near.site.id, '108');
  assert.ok(near.km < 2);
  // 30 km 떨어진 지점은 그 자리 값이 못 된다
  assert.equal(nearestObs([kmaSite({ lat: SEOUL.lat + 0.3 })], SEOUL.lat, SEOUL.lon, { nowMs: NOW }), null);
  // 늙은 관측(KMA 187분 상한)은 '지금'이 아니다
  assert.equal(nearestObs([kmaSite({ obsMs: NOW - 5 * H })], SEOUL.lat, SEOUL.lon, { nowMs: NOW }), null);
  // 결측(null)은 0 °C 가 아니다
  assert.equal(nearestObs([kmaSite({ temp: null })], SEOUL.lat, SEOUL.lon, { nowMs: NOW }), null);
  assert.equal(POINT_OBS_MAX_KM, 25);
});

test('평년 비교 — 뺄셈은 서버 패킷만, 평년 최고·최저는 그날(한국 날짜) 칸', () => {
  const aws = { intel: { schema: 1, anomaly: { baseline: { period: '1991-2020' }, items: [{ stationId: 108, value: 24.1, baseline: 21.8, delta: 2.3, at: '어제' }] } } };
  assert.deepEqual(anomalyFor(aws, '108'), { value: 24.1, delta: 2.3, baseline: 21.8, at: '어제', period: '1991-2020' });
  assert.equal(anomalyFor(aws, '159'), null);
  assert.equal(anomalyFor({}, '108'), null);
  // 2월 29일은 늘 60번째 칸(0부터 59) · 9월 23일 KST 는 2000 달력의 266번째(0부터 266)
  assert.equal(kstLeapIndex(Date.parse('2024-02-29T03:00:00Z')), 59);
  assert.equal(kstLeapIndex(Date.parse('2026-09-22T16:00:00Z')), 266);   // UTC 22일 16시 = KST 23일 01시
  const rows = []; rows[266] = [22.1, 27.0, 18.3, 3.1];
  assert.deepEqual(normalFor({ normals: { 108: rows }, period: '1991-2020' }, '108', Date.parse('2026-09-22T16:00:00Z')), { tmax: 27.0, tmin: 18.3, period: '1991-2020' });
  assert.equal(fmtDelta(2.3), '+2.3');
  assert.equal(fmtDelta(-1.25), '−1.3');
});

test('앞으로 5일 — 매일 15시 KST(06Z) 정시 한 장씩, 지금 이후만, 런 끝을 넘지 않는다', async () => {
  const fr = fakeFrames();
  const d = await loadPointDays({ frames: fr, fieldId: 'temp', lat: SEOUL.lat, lon: SEOUL.lon, nowMs: NOW });
  assert.equal(d.ok, true);
  assert.ok(d.days.length >= 4 && d.days.length <= 5, `${d.days.length}`);
  for (const x of d.days) {
    assert.equal(new Date(x.t).getUTCHours(), 6);
    assert.ok(x.t > NOW);
    assert.ok(x.t <= Date.parse('2026-09-22T18:00:00Z') + 120 * H);
  }
  assert.deepEqual(fr.ensured, d.days.map((x) => x.t));   // 날마다 ensure 뒤에 읽었다
});

test('카드 — 관측이 있으면 관측이 크게 · 출처 두 줄 · 왜/확률은 이유 한 줄 · 입구 단추', () => {
  const desc = FIELD_DESCRIPTORS.tempgrid;
  const fr = fakeFrames();
  const now = readPointNow({ field: fakeField({ frames: fr }), lat: SEOUL.lat, lon: SEOUL.lon, ko: true });
  const pc = { ...SEOUL, fid: 'tempgrid', obs: { site: kmaSite(), km: 1.2 }, obsSource: '기상청 ASOS', obsLoading: false,
    anom: { value: 24.1, delta: 2.3, period: '1991-2020' }, normal: { tmax: 27.0, tmin: 18.3, period: '1991-2020' }, normalMiss: false,
    days: null, daysLoading: true };
  const html = pointCardHtml({ pc, now, isNow: true, ko: true });
  const bigAt = html.indexOf('pc-big');
  assert.ok(bigAt > 0 && html.indexOf('27.4') > bigAt, '관측값이 크게');
  assert.ok(html.indexOf('27.4') < html.indexOf('왜 이런'), '값이 해석보다 먼저(evidence-first)');
  assert.match(html, /평년보다 <b class="pc-warm">\+2\.3°<\/b>/);
  assert.match(html, /오늘 평년\(1991-2020\) 최고 27\.0° · 최저 18\.3°/);
  assert.match(html, /관측 · 기상청 ASOS 서울 · 9\/23 13:00 KST · 1 km/);
  assert.match(html, /MODEL · NOAA GFS 0\.5° · 런 09\/22 18Z · 유효 [^<]* · 이 칸 ~26\.\d °C/);   // 큰 숫자가 관측이면 칸값을 따로
  assert.ok(!/모델 · MODEL/.test(html), "'모델 · MODEL' 겹말 금지");
  assert.match(html, /해석 자료.*실려 있지 않습니다/);   // ③ 이유 한 줄
  assert.match(html, /앙상블.*연결되지 않았습니다/);     // 확률 이유 한 줄
  assert.match(html, /data-action="shell-play5d"/);
  assert.match(html, /data-action="sim-why" data-why="[^"]*모델 비교/);
  assert.match(html, /data-action="sim-why" data-why="기온에는 시뮬레이션 엔진이 없습니다\."/);   // 기온 simulation:false
  for (const w of vocab.FORBIDDEN_CAUSAL) assert.ok(!html.includes(w), `카드에 '${w}'`);
  assert.ok(!/준비 중|Coming Soon|제공 예정/.test(html), '빈 약속 문구 금지');
});

test('카드 — 관측이 없거나 타임라인이 지금이 아니면 모델 칸값이 크게, 관측을 섞지 않는다', () => {
  const desc = FIELD_DESCRIPTORS.tempgrid;
  const fr = fakeFrames();
  const now = readPointNow({ field: fakeField({ frames: fr }), lat: 10, lon: 150, ko: true });
  const base = { lat: 10, lon: 150, fid: 'tempgrid', obs: null, obsLoading: false, anom: null, normal: null, normalMiss: false, days: { ok: true, days: [], info: fr.info() }, daysLoading: false };
  const h1 = pointCardHtml({ pc: base, now, isNow: true, ko: true });
  assert.match(h1, /pc-big">~26\.\d °C<\/b><span class="pc-tag">모델 칸값/);
  assert.match(h1, /25 km 안에 최근 관측소가 없습니다/);
  assert.match(h1, /도시·지점의 관측값이 아닙니다/);
  assert.match(h1, /평년 비교는 한국 기상청 지점이 25 km 안에 있을 때만/);
  const h2 = pointCardHtml({ pc: { ...base, obs: { site: kmaSite(), km: 1 }, obsSource: '기상청' }, now, isNow: false, ko: true });
  assert.ok(!/pc-tag">관측/.test(h2), '예보 시각의 카드에 현재 관측을 크게 쓰지 않는다');
  assert.match(h2, /타임라인이 지금이 아니라 관측을 섞지 않습니다/);
});

test('카드 — 5일 값이 오면 날짜별 칸 + 모델 이름·런, 패킷의 WHY·NEXT 절은 그 자리에 편다', async () => {
  const desc = FIELD_DESCRIPTORS.tempgrid;
  const fr = fakeFrames();
  const days = await loadPointDays({ frames: fr, fieldId: 'temp', lat: SEOUL.lat, lon: SEOUL.lon, nowMs: NOW });
  const pc = { ...SEOUL, fid: 'tempgrid', obs: null, obsLoading: false, anom: null, normal: null, normalMiss: false, days, daysLoading: false };
  const html = pointCardHtml({ pc, now: readPointNow({ field: fakeField({ frames: fr }), ...SEOUL }), intelWhy: '<div class="card">WHY절</div>', intelNext: '<div class="card">NEXT절</div>', ko: true });
  assert.equal((html.match(/class="pc-day"/g) || []).length, days.days.length);
  assert.match(html, /매일 15시\(KST\) 모델값 · MODEL · NOAA GFS 0\.5° · 런 09\/22 18Z/);
  assert.ok(html.includes('WHY절') && !/해석 자료.*실려 있지 않습니다/.test(html), '패킷이 있으면 이유 줄 대신 그 절');
  assert.ok(html.indexOf('NEXT절') > html.indexOf('앞으로 5일'));
});

test('loadPointObs — OBS 숫자를 눌렀으면 그 지점을 그대로 · 평년은 따로(관측이 평년 문서를 기다리지 않는다)', async () => {
  const surfaceObs = { both: async () => ({ aws: { intel: null, stations: [] }, gts: null }) };
  const o = await loadPointObs({ surfaceObs, ...SEOUL, station: kmaSite(), nowMs: NOW });
  assert.equal(o.obs.site.id, '108');
  assert.equal('normal' in o, false, '평년은 loadPointNormal 이 따로 받는다');
  assert.deepEqual(o.obsFailed, { KMA: false, GTS: true }, '못 받은 문서를 적어 둔다 — 없음과 가른다');
  let asked = 0;
  const fetchJson = async (path) => { asked += 1; assert.equal(path, '/wind/kma-normal.json'); const rows = []; rows[kstLeapIndex(NOW)] = [22, 27, 18, 0]; return { normals: { 108: rows }, period: '1991-2020' }; };
  assert.deepEqual(await loadPointNormal({ fetchJson, stationId: '108', nowMs: NOW }), { tmax: 27, tmin: 18, period: '1991-2020' });
  await loadPointNormal({ fetchJson, stationId: '143', nowMs: NOW });
  assert.equal(asked, 1, '평년 문서(약 600 KB)는 한 번만 받는다');
  // 평년차 레이어가 이미 받아 둔 문서가 있으면 받지 않는다
  const rows = []; rows[kstLeapIndex(NOW)] = [1, 2, 3, 0];
  const never = () => { throw new Error('받으면 안 된다'); };
  assert.deepEqual(await loadPointNormal({ fetchJson: never, stationId: '1', nowMs: NOW, doc: { normals: { 1: rows } } }), { tmax: 2, tmin: 3, period: '1991-2020' });
});

test('반박 검증 — 예보 시각에는 평년 비교를 싣지 않는다 · 경우마다 맞는 이유 · 못 받음은 없음이 아니다', () => {
  const now = readPointNow({ field: fakeField(), ...SEOUL, ko: true });
  const base = { ...SEOUL, fid: 'tempgrid', obs: { site: kmaSite(), km: 1 }, obsSource: '기상청', obsLoading: false,
    anom: { value: 24.1, delta: 2.3, at: '2026-09-22', period: '1991-2020' }, normal: { tmax: 27, tmin: 18, period: '1991-2020' }, normalChecked: true,
    days: null, daysLoading: true };
  const fut = pointCardHtml({ pc: base, now, isNow: false, ko: true });
  assert.ok(!/평년보다|오늘 평년/.test(fut), '4일 뒤 모델값 밑에 오늘의 평년 비교를 싣지 않는다');
  assert.match(fut, /평년 비교는 지금 시각에만 적습니다/);
  const nowHtml = pointCardHtml({ pc: base, now, isNow: true, ko: true });
  assert.match(nowHtml, /9\/22 하루 평균 24\.1° · 평년보다 <b class="pc-warm">\+2\.3°<\/b> \(평년 1991-2020\)/, '패킷이 셈한 날을 적는다');
  // 대구 143 — 기상청 지점인데 평년 문서에 없다
  const daegu = pointCardHtml({ pc: { ...base, obs: { site: kmaSite({ id: '143', name: '대구' }), km: 5 }, anom: null, normal: null }, now, isNow: true, ko: true });
  assert.match(daegu, /대구 지점은 기상청 평년값 문서에 없습니다/);
  assert.ok(!/25 km 안에 있을 때만/.test(daegu), '25 km 안에 기상청 지점이 있는데 그 이유를 대지 않는다');
  // 평년은 있지만 기준 7개 지점이 아님
  const inch = pointCardHtml({ pc: { ...base, obs: { site: kmaSite({ id: '112', name: '인천' }), km: 3 }, anom: null }, now, isNow: true, ko: true });
  assert.match(inch, /기준 7개 지점/);
  // 관측 문서를 못 받았다
  const fail = pointCardHtml({ pc: { ...base, obs: null, anom: null, normal: null, obsFailed: { KMA: true, GTS: true } }, now, isNow: true, ko: true });
  assert.match(fail, /관측 문서\(기상청·GTS\)를 받지 못했습니다/);
  assert.ok(!/최근 관측소가 없습니다/.test(fail));
});

test('반박 검증 — GFS 가 아닌 색면에 GFS 라고 적지 않는다 · 5일 칸의 물결표 · 누적 모드 · 끝난 런의 이유', async () => {
  const html = pointCardHtml({ pc: { lat: 30, lon: 140, fid: 'sstfield', obsLoading: false, days: null, daysLoading: false }, now: null, ko: true });
  assert.ok(!/GFS/.test(html), '수온은 관측 분석장이다 — GFS 라고 적지 않는다');
  assert.match(html, /한 장뿐이라 날짜별 예보 값이 없습니다/);
  const fr = fakeFrames();
  const days = await loadPointDays({ frames: fr, fieldId: 'temp', ...SEOUL, nowMs: Date.parse('2026-09-23T10:00:00Z') });
  const pc = { ...SEOUL, fid: 'tempgrid', obs: null, obsLoading: false, days, daysLoading: false };
  const h = pointCardHtml({ pc, now: readPointNow({ field: fakeField({ frames: fr }), ...SEOUL }), ko: true });
  const vals = [...h.matchAll(/class="pc-day"><span>[^<]*<\/span><i[^>]*><\/i><b>([^<]*)<\/b>/g)].map((m) => m[1]);
  assert.equal(vals.length, days.days.length);
  for (const v of vals) assert.ok(v.startsWith('~'), `모델 칸값의 물결표를 떼지 않는다: ${v}`);
  assert.ok(days.days.length < 5);
  assert.match(h, /이 런의 예보는 9\/28 03:00 KST까지라 그 뒤 날짜는 적지 않습니다/);
  const acc = pointCardHtml({ pc, now: null, accum: true, ko: true });
  assert.match(acc, /누적 강수로 칠하는 중에는 날짜별 값을 적지 않습니다/);
  assert.ok(!/shell-play5d/.test(acc));
  // 예보 범위 밖이면 '프레임이 아직 없다'가 아니라 '범위 밖'
  const oor = readPointNow({ field: fakeField({ sample: { outOfRange: 'after' } }), ...SEOUL });
  assert.match(oor.r.text, /예보 범위 밖/);
  // 카드 구조 — 재생 중 제자리 갱신용
  assert.match(h, /^<div class="point-card" data-key="[^"]*"><div data-pc-live>/);
  assert.match(h, /data-action="point-field-settings" data-layer="tempgrid"/);
});

test('배선 — 누르면 지점 카드, 메뉴에서 색면을 고르면 시트를 열지 않는다, 폰에서는 탭 단추 줄을 걷는다', () => {
  const main = readFileSync(root('prototype/v2-three/js/main.js'), 'utf8');
  const shell = readFileSync(root('prototype/v2-three/js/ui-shell.js'), 'utf8');
  const html = readFileSync(root('prototype/v2-three/index.html'), 'utf8');
  // 지점 카드 분기가 국가 선택·해상 선택보다 앞에 선다(기온을 골랐는데 파도 카드가 뜨던 길)
  const tapAt = main.indexOf('openPointCard(lat, lon, pfid)');
  assert.ok(tapAt > 0 && tapAt < main.indexOf('const f = focus.pick(lat, lon);') && tapAt < main.indexOf('if (!hadSelection) marineSelect(lat, lon);'));
  assert.match(main, /shell\.openIntel\('point'\)/);
  assert.match(main, /getPoint: getPointHtml,/);
  assert.match(main, /if \(quiet && args\[2\] !== 'UNAVAILABLE'\) stageNote\(/);
  // (2026-09-24 정정) 한 장 시트 — 지점 카드는 이제 시트의 값 절이다(renderValue). 탭 단추 줄 자체가 없어져
  //   'point 모드에서만 탭 단추를 숨긴다'는 시험을 '어느 모드에도 탭 단추가 없다'로 옮겨 적는다.
  assert.match(shell, /const renderValue = \(el, point, room\) => \{[\s\S]{0,1400}?const html = hooks\.getPoint \? hooks\.getPoint\(\) : '';/);
  // 머리말(질문·능력 줄·궁금한 점·선택 장소·켜진 자료)은 여전히 값 위에 서지 않는다 — 한 장 시트(selection)는 머리말을 붙이기 전에 돌아간다.
  const sel = shell.indexOf("if (cx === 'selection') {");
  const pre = shell.indexOf('intelContent.prepend(header);');
  assert.ok(sel > 0 && pre > sel && /return;\s*\n\s*\}/.test(shell.slice(sel, pre)), '한 장 시트 위에 예전 머리말이 선다');
  assert.match(shell, /intel\.dataset\.tab = curTab;/);
  // 탭 단추가 없다(폭과 모드에 무관) — ✕ 는 머리(.intel-head)에 있고 머리는 숨기지 않는다.
  assert.ok(!/<button data-tab=/.test(shell), '탭 단추가 다시 생겼다');
  assert.match(shell, /<div class="intel-head">[\s\S]{0,200}id="intel-close"/);
  assert.ok(!/\.intel-head[^{]*\{[^}]*display:\s*none/.test(html), '시트 머리(✕)를 숨긴다');
  // 지점 카드의 머리글(현상 · 좌표)은 시트 머리로 올라간다 — 카드 안 같은 줄은 숨긴다(두 번 서지 않게).
  assert.match(html, /#intel\[data-tab="point"\] \.point-card \.pc-kicker \{ display: none; \}/);
  assert.match(shell, /else if \(curTab === 'point'\) \{ const k = intelContent\.querySelector\('\.point-card \.pc-kicker'\)/);
  // 반박 검증 — 폰에서 모든 모드의 탭을 걷으면 '예보·예정'·'이력'·'선택 자료'(색면 조작)에 갈 길이 없어진다. 지점 카드 모드만.
  // (2026-09-24 정정) 한 장 시트에서는 그 길이 **같은 장의 절**이다: 지점 카드 아래에 근거·예보·이력·시뮬레이션 절이 이어지고,
  //   색면 조작(등치선·간격·강수 누적·H/L)은 값 절 안의 '표시 설정' 접이다. 길이 0개가 되지 않았는지 본다.
  for (const id of ['why', 'next', 'history', 'scenario']) assert.match(shell, new RegExp(`secs\\.push\\(\\{ id: '${id}'`), `${id} 절이 한 장에서 빠졌다`);
  assert.match(shell, /const pointSettingsHtml = \(\) => \{/);
  assert.match(main, /getPointSettings: \(\) => \{/);
  assert.match(shell, /if \(a === 'point-field-settings'\) \{\s*\n\s*const d = intelContent\.querySelector\('details\[data-intel-more="settings"\]'\);/);
  assert.match(shell, /if \(!tab && curTab === 'point'\) tab = 'now';/);
  assert.match(shell, /if \(!intelOpen && curTab === 'point'\) \{ curTab = 'now';/);
  assert.match(shell, /cur\.dataset\.key === key/);
  assert.match(main, /const quiet = !!liveId && isFieldLayerId\(liveId\) && !liveLayers\.state\(liveId\)\.on;/);
  assert.match(main, /const POINT_SKIP = new Set\(\['wavefield'\]\);/);
  // ✕ 는 탭 줄 안에 있다 — 줄 전체를 숨기지 않는다
  assert.ok(!/#intel(\[data-tab="point"\])? \.intel-tabs \{[^}]*display: none/.test(html));
});

test('한 장 시트 — 예전 탭의 내용이 모두 한 장 안에 있다 · 절은 7단계 순서 · 재료 없는 절은 이유 한 줄', () => {
  const shell = readFileSync(root('prototype/v2-three/js/ui-shell.js'), 'utf8');
  const sheet = shell.slice(shell.indexOf('const renderSheet = (p) => {'), shell.indexOf('const renderIntel = () => {'));
  assert.ok(sheet.length > 0, 'renderSheet 가 없다');
  // 순서: 값 → 자료의 근거 → 예보·예정 → 이력 → 모델 비교 → Intelligence → 시뮬레이션
  const at = (re) => sheet.search(re);
  const order = [/const secs = \[\{ id: 'now' \}\]/, /id: 'why'/, /id: 'next'/, /id: 'history'/, /id: 'compare'/, /id: 'intel'/, /id: 'scenario'/].map(at);
  assert.ok(order.every((i) => i > 0), `절이 빠졌다: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, '절 순서가 7단계 문법과 다르다');
  // 예전 탭의 화면을 만들던 것들이 전부 한 장에서 불린다(사건·내 지역은 하단 바의 문맥)
  for (const call of ['whyHtml(', 'nextHtml()', 'historyHtml()', 'hooks.getScenario()', 'hooks.getNow()', 'hooks.getFeed()', 'hooks.getPoint']) {
    assert.ok(shell.slice(shell.indexOf('/* ── 한 장 시트'), shell.indexOf('const renderIntel = () => {')).includes(call), `${call} 가 한 장에서 빠졌다`);
  }
  // 예전 머리말의 조각이 절로 옮겨졌다 — 켜진 자료(끄기 단추)·선택 장소·출처 줄(근거 절) · 궁금한 점(시뮬레이션 절) · Intelligence 띠
  assert.match(sheet, /\$\{p\.srcLine\}\$\{p\.phenomenonLine\(\)\}\$\{p\.placeLine\}\$\{p\.timeNote\}\$\{p\.activeDetails\}/);
  assert.match(sheet, /const qs = `\$\{p\.simQuestionsHtml\(\)\}\$\{p\.regionLine\(\)\}\$\{p\.mapContextQuestions\(\)\}`;/);
  assert.match(sheet, /const strip = point \? '' : p\.intelStripBlock\(\);/);
  // 재료가 없으면 자리를 지키고 이유 한 줄(lineHtml) — 절을 지우지 않는다(이력·예보·비교·시뮬레이션)
  for (const id of ['next', 'history', 'compare', 'scenario']) assert.match(sheet, new RegExp(`lineHtml\\('${id}'`), `${id} 의 이유 한 줄이 없다`);
  // 지점 카드는 한 장에 한 번 — 모델 비교 절은 지점 카드가 자기 입구를 가질 때 두지 않는다
  assert.match(sheet, /if \(!point\) \{\s*\n\s*secs\.push\(\{ id: 'compare'/);
  // showTab(절) 은 다른 화면으로 가지 않는다 — 문맥을 두고 그 절을 펴서 굴린다
  assert.match(shell, /const SECTION_TABS = new Set\(\['why', 'next', 'history', 'scenario'\]\);/);
  assert.match(shell, /if \(SECTION_TABS\.has\(t\)\) \{[\s\S]{0,200}openSecs\.add\(t\);\s*\n\s*pendingScroll = t;/);
  // 편 접이는 다시 그려도 그대로(재생 중 220 ms)
  assert.match(shell, /intelContent\.addEventListener\('toggle', \(e\) => \{/);
  // (2026-09-24 적대 검토) 펴짐을 글에 구우면 '더 보기'를 누른 다음 그리기에서 절이 통째로 갈려 안쪽 접이(현재 켜진 자료)가 접혔다.
  //   펴짐은 글 밖(syncFolds)에서 맞추고, 절 글을 갈 때 안쪽 접이의 펴짐을 지킨다.
  assert.ok(!/const foldHtml = [^\n]*openSecs\.has/.test(shell), '접이 펴짐을 글에 구워 넣는다 — 편 순간 절이 다시 쓰인다');
  assert.match(sheet, /writeKeepingDetails\(el, x\.html\)/);
  assert.match(sheet, /\n\s*syncFolds\(\);/);
  // 닫으면 편 절을 잊는다 — 앞 선택에서 편 절이 다음 선택 아래 펴진 채 남지 않게(sticky 'point' 사고의 한 장판)
  assert.match(shell, /if \(!intelOpen\) \{ openSecs\.clear\(\); pendingScroll = null; \}/);
  // 시뮬레이션을 직접 부르면(태풍 가정 장면 · 쓰나미 질문 · FOR ME) 예전 탭처럼 getScenario() 본문이 **나와야** 한다 ·
  //   능력 없이 질문만 있으면 이유 한 줄이 질문보다 먼저 선다.
  assert.match(sheet, /const simAsked = tabIntent === 'scenario';/);
  assert.match(sheet, /simOk \|\| simAsked \? openHtml\('scenario', qs \+ hooks\.getScenario\(\)\)\s*\n\s*: `\$\{lineHtml\('scenario', simWhy\)\}\$\{qs\}`/);
  // 재생 중 굴려 내려 보던 자리가 밀리지 않는다 — 보이는 칸에서 시작하는 절의 top 을 쓰기 전후로 재어 되돌린다
  assert.match(sheet, /if \(anchor && anchor\.isConnected && !pendingScroll\) \{\s*\n\s*const d = anchor\.getBoundingClientRect\(\)\.top - anchorTop;\s*\n\s*if \(Math\.abs\(d\) >= 1\) intelBody\.scrollTop \+= d;/);
  // 절 제목·시트 머리는 스크린리더에도 제목이다
  assert.match(shell, /const lineHtml = \(id, why\) => `<div class="is-h" role="heading" aria-level="3">/);
  assert.match(shell, /<strong class="ih-title" role="heading" aria-level="2">/);
});

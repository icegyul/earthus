// 2026-09-24 PD 결정 (나) — v2 예보·확률 옆 고정 문구(js/forecast-notice.js) 시험.
//   docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md §00-2: 기상법 제17조에는 유·무료 구분이 없다. 기상예보업 등록(2026-12) 전까지 예보를 끄지 않고
//   "외국 수치모델 출력 — 기상청 예보가 아님"을 화면마다 같은 말로 분명히 한다.
//
// 결과로 잠근다(금지만 시험하면 아무 말도 안 하는 화면이 통과한다 — AGENTS.md '일하는 법' 2):
//   ① 모델 예보·확률을 보일 때 그 자리에 문구가 **나와야** 한다 — 모델 이름·실행 시각은 **보인 자료의 것**으로.
//   ② '지금'(관측·타임라인 0)에는 **없어야** 한다.
//   ③ 기관 발표(기상청·JMA·NHC 공식 태풍 경로 · 기관 NEXT 항목)에는 **없고** 기관 이름이 그대로 **있어야** 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FORECAST_EPS_MS, fmtNoticeRun, forecastNotice, forecastNoticeHtml, isForecastAt, isModelForecastKind,
} from '../../prototype/v2-three/js/forecast-notice.js';
import { NOW_EPS_MS } from '../../prototype/v2-three/js/time-bus.js';
import { createFieldLegend, legendView, LEGEND_NOTICE_CLASS } from '../../prototype/v2-three/js/field-legend.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { FIELD_DESCRIPTORS, FieldLayer, fieldCardLive } from '../../prototype/v2-three/js/field-layer.js';
import { pointCardHtml } from '../../prototype/v2-three/js/point-card.js';
import { intelSectionHtml } from '../../prototype/v2-three/js/intel-strip.js';
import { LiveLayers } from '../../prototype/v2-three/js/live-layers.js';
import { routeCardHtml } from '../../prototype/v2-three/js/route.js';

const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => lf(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'));
const H = 3.6e6;
const RUN = '2026-09-24T00:00:00Z';
const NOW = Date.parse('2026-09-24T06:30:00Z');
const KO = '수치모델 예측 · GFS 09/24 00Z — 기상청 예보 아님';
const EN = 'Model output · GFS 09/24 00Z — not an official KMA forecast';

// ─────────────────────────────────────────────────────────────── 문장 하나

test('문장 — ko/en 고정 글자 · 모델·실행 시각은 받은 것만 · 모르면 그 자리만 뺀다', () => {
  assert.equal(forecastNotice({ model: 'GFS', run: RUN, ko: true }), KO);
  assert.equal(forecastNotice({ model: 'GFS', run: RUN, lang: 'en' }), EN);
  assert.equal(forecastNotice({ model: 'GFS', run: Date.parse(RUN) }), KO, 'ms 도 같은 글자');
  assert.equal(forecastNotice({ model: 'GFS', run: new Date(RUN) }), KO, 'Date 도 같은 글자');
  // 실행 시각을 모르면 그 자리만 뺀다 — 나머지(모델 · 기상청 예보 아님)는 그대로.
  assert.equal(forecastNotice({ model: 'GFS', run: null }), '수치모델 예측 · GFS — 기상청 예보 아님');
  assert.equal(forecastNotice({ model: 'GFS', run: 'not a date' }), '수치모델 예측 · GFS — 기상청 예보 아님');
  // 모델 이름을 모르면 'GFS' 로 채우지 않는다.
  assert.equal(forecastNotice({ run: RUN }), '수치모델 예측 · 09/24 00Z — 기상청 예보 아님');
  assert.equal(forecastNotice({}), '수치모델 예측 — 기상청 예보 아님');
  assert.equal(forecastNotice({ lang: 'en' }), 'Model output — not an official KMA forecast');
  // ECMWF 태풍 파일의 run 꼴('YYYYMMDDHH' · aws/ecmwf-ingest)
  assert.equal(fmtNoticeRun('2026092412'), '09/24 12Z');
  assert.equal(fmtNoticeRun('2026139912'), '', '달력에 없는 글자를 시각으로 읽었다');
  assert.equal(forecastNotice({ model: 'ECMWF IFS (HRES + ENS)', run: '2026092400' }), '수치모델 예측 · ECMWF IFS (HRES + ENS) 09/24 00Z — 기상청 예보 아님');
  // HTML 조각: 이름표 하나 · 남의 자료 글자는 이스케이프
  const h = forecastNoticeHtml({ model: '<b>x</b>', run: RUN, tag: 'div' });
  assert.match(h, /^<div class="fc-notice" data-fc-notice>/);
  assert.ok(!h.includes('<b>'), '모델 이름을 HTML 로 해석했다');
});

test("예보인가 — 지금에서 한 눈금(60초) 넘게 앞일 때만 · 시간 버스의 '지금' 폭과 같다", () => {
  assert.equal(FORECAST_EPS_MS, NOW_EPS_MS, 'time-bus.js 의 지금 폭과 다르다');
  assert.equal(isForecastAt(NOW, NOW), false);
  assert.equal(isForecastAt(NOW + 30e3, NOW), false);
  assert.equal(isForecastAt(NOW + 3 * H, NOW), true);
  assert.equal(isForecastAt(NOW - 3 * H, NOW), false, '과거 프레임은 예보가 아니다');
  assert.equal(isForecastAt(NaN, NOW), false, '모르는 시각을 예보라 부르지 않는다');
});

test('성질 도장 — 모델·제공자·EARTHUS 모형은 붙이고, 기관 발표·관측은 붙이지 않는다', () => {
  for (const k of ['MODEL', 'MODEL_SIGNAL', 'PROVIDER_FORECAST', 'EARTHUS_FORECAST']) assert.equal(isModelForecastKind(k), true, k);
  for (const k of ['OFFICIAL_FORECAST', 'OFFICIAL_OBSERVATION', 'OFFICIAL_WARNING', 'OBSERVED', 'SIMULATION_ONLY', '', null]) assert.equal(isModelForecastKind(k), false, String(k));
});

// ─────────────────────────────────────────────────────────────── 범례 (색면 · 바람 입자가 같이 쓴다)

const fakeDoc = () => {
  const doc = {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(), ownerDocument: doc, parentNode: null, children: [], attrs: {}, style: {},
        className: '', id: '', textContent: '', title: '', hidden: false,
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
        replaceChildren(...kids) { this.children = []; kids.forEach((k) => this.appendChild(k)); },
      };
    },
  };
  doc.body = doc.createElement('body');
  return doc;
};
const byClass = (root, cls) => root.children.find((c) => c.className.split(' ').includes(cls));

test('범례 — 고지를 넘기면 마지막 줄에 서고 상자에 fl-has-fc 가 붙는다 · 안 넘기면(지금) 숨고 이름표도 없다', () => {
  assert.equal(legendView({ scale: scaleOf('temp'), notice: KO }).notice, KO);
  assert.equal(legendView({ scale: scaleOf('temp') }).notice, '', '고지를 안 넘겼는데 지어냈다');
  const doc = fakeDoc();
  const lg = createFieldLegend({ doc, getLang: () => 'ko', now: () => NOW });
  const root = lg.mount(doc.body);
  lg.show({ scale: scaleOf('temp'), source: 'MODEL · NOAA GFS 0.5°', run: RUN, valid: NOW + 24 * H, notice: KO });
  const fc = byClass(root, 'fl-fc');
  assert.equal(fc.hidden, false);
  assert.equal(fc.textContent, KO);
  assert.ok(root.className.split(' ').includes(LEGEND_NOTICE_CLASS), '상자가 고지 줄의 자리를 만들지 않는다');
  // 타임라인을 '지금'으로 — 층이 고지를 비워 넘긴다
  lg.show({ scale: scaleOf('temp'), source: 'MODEL · NOAA GFS 0.5°', run: RUN, valid: NOW });
  assert.equal(fc.hidden, true);
  assert.ok(!root.className.split(' ').includes(LEGEND_NOTICE_CLASS));
  // 폰 접힘에서도 고지는 숨지 않는다(풀이만 접힌다) — CSS 규칙
  const html = read('prototype/v2-three/index.html');
  assert.match(html, /#field-legend\.fl-collapsed\.fl-has-fc \{ grid-template-rows: 13px 6px 12px auto; \}/, '세로 폰 접힘에 고지 줄 자리가 없다');
  assert.ok(!/\.fl-fc \{[^}]*display: none/.test(html.replace('#field-legend .fl-fc[hidden] { display: none; }', '')), '고지 줄을 CSS 로 숨긴다');
});

// ─────────────────────────────────────────────────────────────── 색면 층의 판정 (field-layer.js forecastNoticeText)

const fakeLayer = ({ offsetMs, badge = 'MODEL', info = { model: 'GFS', run: RUN, runMs: Date.parse(RUN), resolutionDeg: 0.5 } } = {}) => {
  const layer = Object.create(FieldLayer.prototype);
  Object.assign(layer, {
    active: true, desc: { ...FIELD_DESCRIPTORS.tempgrid, badge }, status: { kind: 'interp' },
    frames: { info: () => info, loaded: true },
    timeBus: { offsetMs, validMs: () => NOW + offsetMs },
  });
  Object.defineProperty(layer, 'ko', { value: true });
  return layer;
};

test('색면 층 — 타임라인이 앞이면 매니페스트의 모델·런으로 고지 · 지금·과거·한 시각 자료·관측 분석장은 빈 글자', () => {
  assert.equal(fakeLayer({ offsetMs: 24 * H }).forecastNoticeText(), KO);
  assert.equal(fakeLayer({ offsetMs: 0 }).forecastNoticeText(), '', "'지금'의 모델 칸값에 예보 고지를 붙였다");
  assert.equal(fakeLayer({ offsetMs: -6 * H }).forecastNoticeText(), '', '과거 프레임에 예보 고지를 붙였다');
  assert.equal(fakeLayer({ offsetMs: 24 * H, info: { single: true, validMs: NOW } }).forecastNoticeText(), '', '한 시각짜리 자료에 붙였다');
  assert.equal(fakeLayer({ offsetMs: 24 * H, badge: 'OBSERVED' }).forecastNoticeText(), '', '관측 분석장에 붙였다');
  // 매니페스트가 모델을 안 실으면 지어내지 않는다
  assert.equal(fakeLayer({ offsetMs: 24 * H, info: { run: RUN } }).forecastNoticeText(), '수치모델 예측 · 09/24 00Z — 기상청 예보 아님');
  // 색면 카드의 시각 줄 — 고지가 있으면 같은 덩어리 안
  assert.match(fieldCardLive({ info: { model: 'GFS', runMs: Date.parse(RUN) }, validMs: NOW + 24 * H, status: { kind: 'loading' }, notice: KO, ko: true }), /class="fc-notice">수치모델 예측 · GFS 09\/24 00Z — 기상청 예보 아님</);
  assert.ok(!/fc-notice/.test(fieldCardLive({ info: { model: 'GFS', runMs: Date.parse(RUN) }, validMs: NOW, status: { kind: 'loading' }, notice: '', ko: true })));
});

// ─────────────────────────────────────────────────────────────── 지점 카드 (point-card.js)

const pcNow = (tMs) => ({
  r: { ok: true, text: '~24.5 °C', color: '#f00' }, info: { model: 'GFS', runMs: Date.parse(RUN), resolutionDeg: 0.5 }, tMs,
  desc: FIELD_DESCRIPTORS.tempgrid, missing: false,
});
const pc = (over = {}) => ({ fid: 'tempgrid', lat: 37.57, lon: 126.97, id: 1, rev: 0, obs: null, obsLoading: false, ...over });

test("지점 카드 — '앞으로 5일' 줄에는 늘 고지 · 큰 숫자는 타임라인이 앞일 때만 고지 · 지금은 없다", () => {
  const days = { ok: true, info: { model: 'GFS', runMs: Date.parse(RUN), resolutionDeg: 0.5 },
    days: [1, 2, 3, 4, 5].map((d) => ({ t: NOW + d * 24 * H, sample: { value: 24, values: [24], decoded: true, exact: true } })), lastT: NOW + 120 * H };
  const now0 = pointCardHtml({ pc: pc({ days }), now: pcNow(NOW), isNow: true, nowMs: NOW });
  const live0 = /<div data-pc-live>([\s\S]*?)<\/div><div class="pc-sec">/.exec(now0)[1];
  assert.ok(!/fc-notice/.test(live0), "'지금'의 값 줄에 예보 고지를 붙였다");
  const next = /<h4>앞으로 5일<\/h4>([\s\S]*?)<div class="pc-actions">/.exec(now0)[1];
  assert.match(next, /class="fc-notice"[^>]*>수치모델 예측 · GFS 09\/24 00Z — 기상청 예보 아님</, "'앞으로 5일' 모델값 옆에 고지가 없다");
  // 타임라인 +24h — 큰 숫자가 모델 예보다
  const fut = pointCardHtml({ pc: pc({ days }), now: pcNow(NOW + 24 * H), isNow: false, nowMs: NOW });
  const live1 = /<div data-pc-live>([\s\S]*?)<\/div><div class="pc-sec">/.exec(fut)[1];
  assert.match(live1, /수치모델 예측 · GFS 09\/24 00Z — 기상청 예보 아님/, '예보 시각의 큰 숫자 옆에 고지가 없다');
  // 영어 화면
  const en = pointCardHtml({ pc: pc({ days }), now: pcNow(NOW + 24 * H), isNow: false, nowMs: NOW, ko: false });
  assert.match(en, /Model output · GFS 09\/24 00Z — not an official KMA forecast/);
});

// ─────────────────────────────────────────────────────────────── Intelligence NEXT

test('Intelligence NEXT — 기관 예보 줄은 기관 이름 그대로(고지 없음) · 제공자 모델 줄에만 고지(패킷의 source·issuedAt)', () => {
  const V1 = JSON.parse(read('tools/earthus-v53/fixtures/intel-v1-typhoon-1001322.json'));
  const html = intelSectionHtml({ packet: V1, section: 'NEXT', i18n: { ko: true } });
  const rows = html.split('<div class="stat">').slice(1);
  const kma = rows.find((r) => r.includes('한국 기상청'));
  const jma = rows.find((r) => r.includes('일본 기상청'));
  const ec = rows.find((r) => r.includes('ECMWF 모델'));
  assert.ok(kma && jma && ec, 'NEXT 절에 기관·모델 줄이 다 없다');
  assert.ok(!/fc-notice/.test(kma) && !/fc-notice/.test(jma), '기관 공식 예보에 모델 고지를 붙였다');
  assert.match(kma, /기관 인용/);
  // (2026-09-24 정정 · 적대 검토) 예전 기대값 'ECMWF 모델 09/19 14Z' 는 결함을 잠그고 있었다 — issuedAt(14:40 UTC)은 우리 수집기가 ECMWF 파일을
  //   만든 시각(handler.py ecmwf_doc.generated)이지 모델 실행 시각이 아니다(ECMWF 에 14Z 런은 없다). 패킷에 run 이 없으니 실행 시각 자리는 빠져야 한다.
  assert.match(ec, /수치모델 예측 · ECMWF 모델 — 기상청 예보 아님/);
  assert.ok(!/\d{2}\/\d{2} \d{2}Z/.test(ec), '패킷의 발표(파일 생성) 시각을 모델 실행 시각처럼 적었다');
  // 기관 줄에는 기관 이름이 **있어야** 한다(고지 대신)
  assert.match(jma, /일본 기상청/);
  // 사건 방 '기관별 다음 위치' 표(ui-shell.js eventNextHtml)도 같은 까닭으로 r.issued(파일 생성 시각)를 실행 시각으로 넘기지 않는다
  const shell = read('prototype/v2-three/js/ui-shell.js');
  assert.match(shell, /rows\.filter\(\(r\) => !r\.official\)\.map\(\(r\) => forecastNoticeHtml\(\{ model: r\.agency, run: null,/);
});

// ─────────────────────────────────────────────────────────────── 태풍 — 공식 경로 vs 앙상블

test('태풍 — 공식 트랙 카드는 발표기관 이름(고지 없음) · ECMWF 앙상블 카드는 파일의 모델·런으로 고지', () => {
  const official = LiveLayers.prototype.metaTyphoon.call({}, {
    generated: '2026-09-24T06:00:00Z', count: 1,
    storms: [{ name: 'T', agencies: [{ agency: 'KMA', agencyKo: '기상청', steps: [{ h: 0, lat: 20, lon: 130, hpa: 960, windMs: 40 }, { h: 72, lat: 30, lon: 128 }] }] }],
  });
  assert.match(official.cardHtml, /기상청·JMA·NHC 공식 태풍 정보/);
  assert.match(official.cardHtml, /\(기상청\)/);
  assert.ok(!/기상청 예보 아님|fc-notice/.test(official.cardHtml), '공식 경로에 모델 고지를 붙였다');
  const ens = LiveLayers.prototype.metaTyEns.call({ _ensMembers: 51 }, {
    generated: '2026-09-24T06:00:00Z', run: '2026092400', agency: 'ECMWF', model: 'IFS (HRES + ENS)', source: 'ECMWF Open Data', license: 'CC-BY-4.0',
    storms: [{ name: 'T', ensemble: { totalMembers: 51, members: [] } }],
  });
  assert.match(ens.cardHtml, /수치모델 예측 · ECMWF IFS \(HRES \+ ENS\) 09\/24 00Z — 기상청 예보 아님/);
});

test('내 동네 태풍 카드 — 앙상블 개수(n/51) 옆 고지 · 모델·런은 ECMWF 파일 머리에서(for-me-signal)', () => {
  const src = read('prototype/v2-three/js/for-me-signal.js');
  assert.match(src, /ens\.run = ens\.run \|\| ecmwf\?\.run \|\| null;/);
  assert.match(src, /ens\.model = \[ecmwf\?\.agency, ecmwf\?\.model\]\.filter\(Boolean\)\.join\(' '\) \|\| null;/);
  const main = read('prototype/v2-three/js/main.js');
  const at = main.indexOf("statRow('얼마나 확실'");
  assert.ok(at > 0);
  assert.match(main.slice(at, at + 500), /\+ \(c\.certain && ens \? forecastNoticeHtml\(\{ model: ens\.model, run: ens\.run/, "'얼마나 확실 · 앙상블 n/51' 바로 밑에 고지가 없다");
});

// ─────────────────────────────────────────────────────────────── 타임라인 · 구름 · 항로

test('타임라인 — 앞(예보)이고 모델 예보가 칠해져 있을 때만 막대 안 둘째 줄 · 막대 높이 셈이 따라온다', () => {
  const main = read('prototype/v2-three/js/main.js');
  const shell = read('prototype/v2-three/js/ui-shell.js');
  const html = read('prototype/v2-three/index.html');
  // main.js timeNote(m) 가 notice 를 돌려준다 — m > 0 이고 (GFS 구름 · 바람 입자 · 예보를 칠한 색면) 일 때만
  assert.match(main, /timeNote: \(m = 0\) => \{/);
  assert.match(main, /if \(m > 0\) \{\n\s*const fieldFc = [^\n]*forecastNoticeText\(\)\);\n\s*if \(clouds\.mode === 'gfs' \|\| windLayer\.on \|\| fieldFc\) \{/);
  assert.match(main, /return \{ short, full, notice \};/);
  // ui-shell: 시간 버스를 먼저 옮기고 문구를 묻는다 · 막대 안 #ts-notice
  assert.match(shell, /hooks\.onTimeOffset\(m \* 60000\);\n\s*const n = m !== 0 && hooks\.timeNote \? hooks\.timeNote\(m\) : null;/);
  assert.match(shell, /<span id="ts-notice" class="fc-notice" role="note" hidden><\/span>/);
  assert.match(shell, /paintTsNotice\(n && n\.notice\);/);
  // 글자 10px 이상 · 세로 폰 막대 높이 40 → 56 (사슬이 셈으로 따라 오른다)
  const fc = /\n {2}\.fc-notice \{([^}]*)\}/.exec(html);
  assert.ok(fc && parseFloat(/font-size: ([\d.]+)px/.exec(fc[1])[1]) >= 10, '고지 글자가 10px 미만');
  assert.match(html, /:root\.fc-on \{ --ts-h: 56px; \}/);
  assert.match(html, /:root\.fc-on \{ --hud-lift: 76px; --nav-lift: 76px; \}/);
});

test('구름 GFS 줄 — 유효 시각이 앞일 때만 첫 줄 끝에 고지(좌하단 출처 줄이 그대로 옮긴다)', () => {
  const main = read('prototype/v2-three/js/main.js');
  assert.match(main, /const fcHtml = isForecastAt\(valid\.getTime\(\), Date\.now\(\)\) \? ` · \$\{forecastNoticeHtml\(\{ model: g\.model, run: g\.run, ko: i18n\.ko \}\)\} ?` : '';/);
  // 넓은 화면 막대가 고지 줄 폭만큼 넓어져 좌하단 출처 독 밑으로 들어가지 않는다(첫 촬영 정정) — 폭 셈에서 0
  assert.match(read('prototype/v2-three/index.html'), /#ts-notice \{ flex: 1 0 100%; width: 0; min-width: 100%;/);
  assert.match(main, /model: mf\.model \|\| '', texCache/, '구름 매니페스트의 모델 이름을 쥐지 않는다');
});

test('항로 — 도착 시각 예보 줄 바로 밑에 제공자 고지(실행 시각은 응답에 없어 뺀다) · 값이 없으면 고지도 없다', () => {
  const stops = [{ iata: 'ICN', city: '인천', lat: 37.46, lon: 126.44 }, { iata: 'NRT', city: '나리타', lat: 35.77, lon: 140.39 }];
  const legs = [{ from: stops[0], to: stops[1], km: 1200, min: 120, bearing: 90, arr: NOW + 3 * H }];
  const with_ = routeCardHtml(stops, legs, [{ now: { temp: 20 } }, { now: { temp: 21 }, at: { temp: 22 } }], '');
  assert.match(with_, /그때 예보 — [^\n]*<\/div><div class="fc-notice" data-fc-notice>수치모델 예측 · Open-Meteo — 기상청 예보 아님<\/div>/);
  const without = routeCardHtml(stops, legs, [{ now: { temp: 20 } }, { now: { temp: 21 } }], '');
  assert.ok(!/fc-notice/.test(without));
});

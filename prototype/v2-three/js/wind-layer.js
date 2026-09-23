// EARTHUS v2 — 바람 층 (DEV-DIRECTIVE 2026-09-20 · W3 배선 · 작업 B2)
//
// 무엇이 없어 있었나: 바람 입자 엔진(wind-particles.js)은 만들어졌지만 아무 데도 이어져 있지 않았다. 화면의 '바람'은 여전히
//   관측소마다 선분 하나 위를 점 2개가 왕복하는 막대기였다(live-layers.js buildWind). PD: "바람은 왜 윈드 애니메이션이 없어?
//   지역마다 막대기가 나오면 되겠어?"
//
// 이 파일이 하는 일 — **접착제**다. 계산도 그리기도 여기서 새로 하지 않는다:
//   프레임 저장소(gfs-frames.js)  → 'wind10'(GFS 0.5° · 지상 10 m · R=u G=v) 두 키프레임의 CPU 사본
//   시간 버스(time-bus.js)        → 타임라인이 가리키는 유효 시각 하나
//   입자 엔진(wind-particles.js)  → setField(두 프레임) · setMix(사이 비율) · update(dt, 카메라)
//   색 눈금표(field-scales.js)    → 입자의 풍속 구간색과 경계. **이 파일에는 색도 경계도 적혀 있지 않다.**
//   범례(field-legend.js)         → m/s + kt 두 줄 · 'MODEL · GFS 0.5° · 런 · 유효' · 입자 과장 고지 · 12시간 넘으면 '지연'
//
// 규칙 셋:
//   ① **키프레임이 바뀔 때만** 픽셀을 다시 청한다. 타임라인을 같은 두 프레임 사이에서 밀면 setMix 하나만 바뀐다 —
//      매 프레임 청하면 41장 재생 중 초당 60번 캐시를 뒤지고, 폰에서는 그것이 열이다.
//   ② 프레임이 없으면(매니페스트 실패 · 이 런에 wind10 없음 · 그림 받기 실패 · 예보 범위 밖) **막대기로 물러나지 않는다.**
//      '자료 없음'과 이유를 말하고 아무것도 그리지 않는다. 끝 프레임을 범위 밖 시각의 바람이라고 흘리지도 않는다.
//   ③ 꺼져 있는 동안 tick 은 아무것도 하지 않는다 — 시간 버스도 듣지 않는다(꺼진 층이 프레임을 계속 받으면 안 된다).
//   ④ (2026-09-20 작업 E3) 늦게 온 장을 **순서로 버리지 않는다.** 재생은 0.22초마다 한 칸인데 프레임 한 장은 0.8초쯤
//      걸린다 — 옛 규칙(청한 순서 seq 가 다르면 버린다)은 재생 중 들어오는 장을 전부 떨어뜨려 입자가 첫 두 장에
//      얼어붙었다. 이제 **시간 거리**로 가른다(frame-arrival.js): 지금 엔진에 든 구간보다 지금 시각에 가까우면 넣는다.
//      넣은 뒤에는 다음 한 장을 미리 청한다(prefetchAfter) — 저장소가 중복과 캐시를 맡는다.
//      ⚠️ 거리로 가르는 것은 **넣을까 말까**뿐이다. **화면을 비울까 말까**는 거리가 아니라 '지금 구간인가'로 가른다
//         (syncTime 의 isCurrentSpan) — 지나친 구간의 실패가 잘 흐르던 입자를 '자료 없음'으로 지우면 안 된다.
//
// 켜고 끄는 주인은 LiveLayers 다(레이어 id 'wind' — 개명하지 않는다). 이 층은 deps.isOn() 을 tick 에서 물어 따라간다 —
//   LiveLayers.toggle · clearAll 에 줄을 끼우지 않으려고(그 두 곳은 같은 묶음의 다른 작업도 고친다).
//   입자 물체는 LiveLayers 가 쥔 자리표(빈 Group)의 자식이 **아니다.** LiveLayers 는 갱신·지형 과장 변경 때 레이어 물체를
//   dispose 하고 새로 짓는다 — 입자 버퍼(폰 3.8 MB · 데스크톱 13.8 MB)를 그 길에 태우지 않는다.
//
// v2 제품 의도: 이 층은 '지금 부는 바람'이 아니라 **5일 예보 바람을 시간축으로 읽는 작업 공간**의 한 장이다.
//   모델 격자값이다 — 도시값·관측값처럼 말하지 않는다. 클릭 값에는 '~'와 격자점 좌표·거리·눈금(0.5 m/s)을 붙인다.
//
// DOM · THREE 를 직접 부르지 않는다(입자 엔진이 THREE 를 쓴다). 계산은 순수 함수로 밖에 냈고, 층은 의존을 전부 주입받는다 —
// tools/earthus-v53/wind-layer.test.mjs 가 가짜 프레임 저장소·진짜 시간 버스·진짜 입자 엔진으로 그대로 부른다.
// ⚠️ import 주소는 ?v= 까지 다른 모듈과 똑같이 — ES 모듈은 URL 전체로 구분된다(다르면 시간 버스·프레임 캐시가 둘이 된다).

import { timeBus as sharedTimeBus } from './time-bus.js?v=1';
import { sharedGfsFrames } from './gfs-frames.js?v=2';
import { acceptsArrival, forecastHourAt, sameSpan } from './frame-arrival.js?v=1';
import { scaleOf, legendModel, bandIndex, KT_PER_MS } from './field-scales.js?v=1';
import { fieldLegend as sharedLegend, legendMetaLine } from './field-legend.js?v=1';
import { WindParticles, particleBudgetFor, particleCountFor, sampleWind, WIND_CALM_MS, WIND_SPEED_BOUNDS_MS } from './wind-particles.js?v=1';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const WIND_FIELD_ID = 'wind10';

/* 기기 상한(입자 수). 18,000 / 5,000 은 정본 엔진의 flowRenderBudget 과 같은 숫자다(지시서 W3 '입자 수').
   상한일 뿐이다 — 실제 수는 아래 windBudget 이 화면 CSS 픽셀 밀도에서 정하고, 1440×900 이면 2,817개다.
   입자 버퍼는 이 수로 **한 번만** 잡힌다(바람을 처음 켤 때 — 안 켜는 사람에게는 한 바이트도 안 잡는다). */
export const WIND_DEVICE_CAP = Object.freeze({ desktop: 18000, phone: 5000 });

/* 클릭 값의 눈금. 8bit 프레임의 한 눈금이 0.502 m/s 다(매니페스트 fields.wind10 scale) — 그보다 잘게 말하면 없는 정밀도다. */
export const WIND_READOUT_STEP_MS = 0.5;

/* 색면(풍속 구간색 껍질)과 **같은 반지름**에 둔다 — 시차 방지(wind-particles.js 생성자 주석). 이만큼만 띄운다: 같은 깊이에서
   깊이 시험이 어느 쪽으로 넘어가든 입자가 껍질 뒤로 숨지 않게. 0.0004 = 2.5 km — 전지구 뷰에서 0.1 px 도 안 된다. */
export const WIND_SHELL_LIFT = 0.0004;

/* ⚠️ 2026-09-20 반박 검증: 입자가 색면보다 **위**에 떠 있었다. 이 주석이 말하는 '색면 껍질'은 옛 buildField 의 고정 껍질
   (과장된 최고봉 위 · 과장 50× 에서 반지름 1.075 = 해발 478 km)이었는데, 풍속 색면은 이제 새 렌더러라 지표(1 + 0.0012)에 붙는다.
   그래서 화면 중심에서 떨어진 곳의 입자 무늬가 색면·해안선보다 바깥으로 밀려 그려졌다(고도 3,000 km 에서 10° 떨어진 곳 약 100 px:
   태풍 소용돌이의 중심이 색면의 눈과 어긋난다). main.js 가 이제 1 + FIELD_LIFT 를 준다 — 아래 카메라 고도 규칙은 그보다 낮아질 때의
   안전장치로만 남는다(지표 껍질에서는 사실상 걸리지 않는다).
   가까이 내려가면 껍질이 카메라보다 **높아진다.** 색면 껍질은 '과장된 최고봉(9 km × 과장) 위'라서 과장 50× 에서 고도 475 km 다 —
   그 아래로 줌하면 카메라가 껍질 안으로 들어가 입자가 통째로 사라진다(전지구 색면도 같은 한계다). 바람은 한반도·태풍까지 당겨 보는
   레이어라 그 절벽을 두지 않는다: 입자 반지름은 카메라 고도의 이 비율을 넘지 않는다.
   0.7 인 이유 — main.js tick 이 카메라 둘레(2.5°·5.5° 링) 지형을 카메라 고도의 65% 아래로 묶고(exagCeil = 0.65 × 고도),
   near 평면을 고도의 25% 에 둔다. 0.7 이면 입자는 그 지형보다 위 · near 평면(카메라에서 25%)보다 먼 곳(30%)에 놓인다.
   전지구 뷰(거리 3.0)에서는 껍질이 그대로 이긴다 — 이 규칙은 고도 약 680 km(과장 50×) 아래에서만 걸린다. */
export const WIND_CAMERA_ALT_FRACTION = 0.7;

/** 입자 반지름 = min(색면 껍질, 1 + 카메라 고도 × 0.7). 지표(1.0012 — 입자 엔진 기본값) 아래로는 내려가지 않는다. */
export function windRadiusFor(shellR, camDist) {
  if (!(shellR > 0)) return 1.0012;
  if (!(camDist > 1)) return shellR;
  return Math.max(1.0012, Math.min(shellR, 1 + (camDist - 1) * WIND_CAMERA_ALT_FRACTION));
}

/** 가장자리 페이드가 시작될 facing — 껍질이 지구보다 크면(과장 50× 에서 7.5%) 껍질의 바깥 띠가 지구 윤곽 밖 우주 위에 그려져
 *  바람이 지구 밖에서 흐르는 것처럼 보인다. 시선이 지구(반지름 1)에 접하는 자리의 껍질 점은 facing = √(1 − 1/r²) 이다
 *  (카메라 거리와 무관 — wind-particles.js setLimbLo 주석). 그 값부터 페이드하면 선이 지구 윤곽에서 끝난다. */
export function windLimbLoFor(r) {
  return r > 1 ? Math.sqrt(1 - 1 / (r * r)) : 0;
}

const TITLE = Object.freeze({ ko: '바람 · 10 m 풍속', en: 'Wind · 10 m speed' });
const SOURCE = 'MODEL · GFS 0.5°';
const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);

// ---------------------------------------------------------------- 순수 계산

/** 어느 상한을 쓸지. main.js isMobileUA · gfs-frames.js budgetFor 와 같은 정규식이다 — 기기 판정을 세 벌로 만들지 않으려고. */
export function windDeviceCap(nav) {
  const ua = (nav && nav.userAgent) || '';
  return /Android|iPhone|iPad|iPod/i.test(ua) ? WIND_DEVICE_CAP.phone : WIND_DEVICE_CAP.desktop;
}

/** 입자 예산 = min(기기 상한, 화면 CSS 픽셀 밀도) × 발열 배율(ThermalGovernor particleScale 1 · 0.65 · 0.3 · 0).
 *  ⚠️ 발열 배율을 **기기 상한**에 곱하면 아무 일도 안 일어난다 — 18,000 × 0.3 = 5,400 은 여전히 밀도 예산(2,817)보다 커서
 *     화면의 입자 수가 그대로다. 지시서 W3 완료 기준 ④는 "발열 시 눈에 띄게 줄고"다. 그래서 밀도 예산에 곱한다. */
export function windBudget({ widthCss, heightCss, particleScale = 1, cap = WIND_DEVICE_CAP.desktop } = {}) {
  const density = particleBudgetFor(widthCss, heightCss);
  const k = Number.isFinite(particleScale) ? clamp01(particleScale) : 1;
  return Math.floor(Math.min(cap, density) * k);
}

/** 풍향(도) — **불어오는 쪽**(기상 관례). 북 0° · 동 90° · 남 180° · 서 270°.
 *  u = 동쪽으로 가는 성분 · v = 북쪽으로 가는 성분(매니페스트 fields.wind10 channels 의 component).
 *  동쪽으로 부는 바람(u>0, v=0)은 서쪽에서 온다 → 270°. 입자가 흘러가는 쪽과 **정반대**다 — 화살표가 아니라 이름이다('서풍').
 *  무풍(0.4 m/s 미만 — wind-particles.js WIND_CALM_MS: 0 m/s 도 바이트 128 = 0.36 m/s 로 풀린다)은 방향이 없다 → null. */
export function windFromDeg(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  if (Math.hypot(u, v) < WIND_CALM_MS) return null;
  const d = Math.atan2(-u, -v) * R2D;
  return ((d % 360) + 360) % 360;
}

const COMPASS16 = Object.freeze(['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']);
const COMPASS16_KO = Object.freeze(['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서']);

/** 도 → 16방위 { code:'W', ko:'서' }. 22.5° 칸의 가운데가 방위다(348.75°~11.25° = N). */
export function compass16(deg) {
  if (!Number.isFinite(deg)) return null;
  const i = ((Math.round(deg / 22.5) % 16) + 16) % 16;
  return { code: COMPASS16[i], ko: COMPASS16_KO[i] };
}

/** 가장 가까운 격자점. grid 는 프레임 저장소 fieldSpec().grid — { ni, nj, lon0, lat0, dLon, dLat(크기), wraps } · 행 0 = 북. */
export function nearestGridPoint(grid, lat, lon) {
  if (!grid || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let j = Math.round((grid.lat0 - lat) / grid.dLat);
  j = Math.max(0, Math.min(grid.nj - 1, j));
  let i = Math.round((lon - grid.lon0) / grid.dLon);
  i = grid.wraps ? ((i % grid.ni) + grid.ni) % grid.ni : Math.max(0, Math.min(grid.ni - 1, i));
  const gLat = grid.lat0 - j * grid.dLat;
  const gLon = grid.lon0 + i * grid.dLon;
  // 대권 거리(km) — 누른 자리와 값을 읽은 자리가 얼마나 떨어져 있는지 카드가 말한다.
  const p1 = lat * D2R; const p2 = gLat * D2R;
  const dl = (gLon - lon) * D2R;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  return { i, j, lat: gLat, lon: gLon, km };
}

/** 매니페스트가 말한 wind10 명세 → 입자 엔진이 받는 디코드·격자. 못 읽으면 이유를 던진다(값을 지어내지 않는다).
 *  ⚠️ 채널 **순서**를 확인한다 — CPU 사본은 매니페스트가 적은 순서대로 채널을 남긴다. G 가 먼저면 u 와 v 가 뒤바뀐다.
 *  ⚠️ 저장소의 grid.dLat 은 **크기**(양수)다. 입자 엔진은 행 0 = 북을 음수 dLat 으로 받는다 — 부호를 안 뒤집으면 남북이 뒤집힌다. */
export function windFieldSpecOf(field) {
  if (!field || !field.decodable || !field.grid || !Array.isArray(field.channels)) {
    throw new Error('자료 없음 — 매니페스트에 10 m 바람의 디코드 상수가 없습니다(값을 지어내지 않습니다)');
  }
  const [r, g] = field.channels;
  if (field.channels.length < 2 || r.name !== 'R' || g.name !== 'G') {
    throw new Error('자료 없음 — 10 m 바람 프레임의 채널 순서가 R=u · G=v 가 아닙니다');
  }
  if (r.transfer !== 'linear' || g.transfer !== 'linear' || r.scale !== g.scale || r.offset !== g.offset) {
    throw new Error('자료 없음 — 10 m 바람의 u·v 디코드 식이 서로 다릅니다(입자 엔진은 한 식만 받습니다)');
  }
  if (!field.grid.wraps) throw new Error('자료 없음 — 10 m 바람 격자가 경도로 한 바퀴 돌지 않습니다');
  const gr = field.grid;
  return {
    w: gr.ni, h: gr.nj,
    decode: { scale: r.scale, offset: r.offset },
    grid: { lon0: gr.lon0, dLon: gr.dLon, lat0: gr.lat0, dLat: -gr.dLat },
  };
}

/** 클릭 값(순수). u·v 는 m/s. 풍속은 0.5 m/s 눈금으로 말한다. */
export function windReadoutModel({ u, v, point, clicked, scale = scaleOf('wind') } = {}) {
  const speed = Math.hypot(u, v);
  if (!Number.isFinite(speed)) return null;
  const shown = Math.round(speed / WIND_READOUT_STEP_MS) * WIND_READOUT_STEP_MS;
  const fromDeg = windFromDeg(u, v);
  const dir = compass16(fromDeg);
  const band = legendModel(scale).find((b) => b.index === bandIndex(scale, speed)) || null;
  return {
    speedMs: shown,
    speedKt: Math.round(shown * KT_PER_MS),
    calm: fromDeg == null,
    fromDeg: fromDeg == null ? null : Math.round(fromDeg),
    dir,
    band: band ? { label: band.label, color: band.color } : null,
    point: point || null,
    clicked: clicked || null,
  };
}

const fmtLatLon = (lat, lon) => `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(1)}°`;
const stat = (k, v) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`;

/** 클릭 카드(순수 · HTML 글자). 풍향은 불어오는 쪽이다 — 그렇게 적었다고 카드가 말한다. */
export function windReadoutHtml(m, meta) {
  if (!m) return '';
  const dirTxt = m.calm
    ? '무풍에 가까움(방향 없음)'
    : `${m.dir.ko}풍 · ${m.dir.code} ${m.fromDeg}° <span style="opacity:.7">(불어오는 쪽)</span>`;
  const dot = m.band ? `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.band.color};margin-right:5px"></i>` : '';
  return stat('풍속', `~${m.speedMs.toFixed(1)} m/s <span style="opacity:.7">(~${m.speedKt} kt)</span>`)
    + stat('풍향', dirTxt)
    + (m.band ? stat('구간', `${dot}${m.band.label}`) : '')
    + (m.point ? stat('격자점', `${fmtLatLon(m.point.lat, m.point.lon)} · 누른 곳에서 ${Math.round(m.point.km)} km`) : '')
    + stat('Level', '10 m')
    + stat('Model', 'GFS 0.5°')
    + `<p>${meta || ''}</p>`
    + '<p>모델 <b>격자점 값</b>입니다(0.5° ≈ 55 km 평균 · 눈금 0.5 m/s) — 그 동네의 관측값이 아닙니다.'
    + (m.speedMs >= 20 ? ' 이 격자는 태풍 중심의 최대풍속을 무디게 담습니다 — 공식 최대풍속은 재해 › 태풍에서 확인하세요.' : '')
    + '</p>';
}

// 카드에서 바람 부분만 갈아 끼울 수 있게 감싼다 — main.js 의 lockedNote.body 는 글자 사본이라, 칩을 눌러도
// 그대로 두면 다시 그릴 때 옛 칩이 'on' 으로 돌아온다(recard 주석).
const CARD_OPEN = '<div data-wind-card="1">';
const CARD_CLOSE = '</div><!--/wind-card-->';
const INTENSITY_LABEL = Object.freeze({ 1: '약 ⅓', 2: '중 ⅔', 3: '전부' });

/** Inspector 카드(순수 · HTML 글자). view = { intensity, particles, particleScale, metaLine, stale, statusLine, interp } */
export function windCardHtml(view) {
  const chips = [1, 2, 3].map((k) => `<button type="button" data-action="wind-intensity" data-k="${k}"`
    + ` class="${view.intensity === k ? 'on' : ''}" aria-pressed="${view.intensity === k}">${INTENSITY_LABEL[k]}</button>`).join('');
  return `${CARD_OPEN}`
    + '<b>바람 흐름</b> — 전지구 10 m 바람을 따라 입자가 흐릅니다. 저기압은 북반구에서 반시계, 남반구에서 시계 방향 소용돌이로 읽힙니다.'
    // 선택지가 하나뿐인 것은 칩으로 가장하지 않는다(지시서 W3 Inspector) — 고를 수 없는 것은 글자다.
    + stat('Level', '10 m')
    + stat('Model', 'GFS 0.5°')
    + (view.statusLine ? `<p><b>${view.statusLine}</b></p>` : '')
    + (view.interp ? stat('시각', view.interp) : '')
    + `<div class="stat"><span class="k">입자 강도</span><span class="v">${view.particles.toLocaleString('en-US')}개`
    + `${view.particleScale < 1 ? ` · 발열 보호 ${view.particleScale}×` : ''}</span></div>`
    + `<div class="seg" role="group" aria-label="입자 강도">${chips}</div>`
    + `<p>${view.metaLine || ''}${view.stale ? ' — 새 런이 12시간 넘게 오지 않았습니다' : ''}</p>`
    // 색면이 깔려 있으면 입자는 흰색이다(main.js starLayers) — 카드가 화면과 다른 말을 하면 안 된다.
    + `<p>${view.colorMode === 'white'
      ? '입자는 <b>흰색</b>입니다 — 풍속의 색은 밑에 깔린 색면과 그 범례가 말합니다.'
      : '입자 색 = 풍속 구간(범례와 같은 표).'} 입자 속도와 꼬리 길이는 방향과 상대 세기를 보이기 위한 <b>과장 표현</b>입니다. `
    + '타임라인을 밀면 5일 예보가 흐르고(유효 시각은 범례에 나옵니다), 지구를 누르면 그 자리의 격자점 바람을 읽습니다.</p>'
    + '<p>출처 NOAA GFS 0.5° · 지상 10 m · 3시간 간격 5일 예보. <b>모델값이며 관측이 아닙니다</b> — 지상 관측은 일기도 기입 모형에 있습니다.</p>'
    + `${CARD_CLOSE}`;
}

// ---------------------------------------------------------------- 층

/**
 * deps (전부 선택 — 브라우저에서는 parent · isOn · particleScale · shellRadius · exagger 면 된다)
 *   frames          프레임 저장소(기본: 앱이 나눠 쓰는 하나)
 *   timeBus         시간 버스(기본: 앱이 나눠 쓰는 하나)
 *   legend          범례(기본: 앱이 나눠 쓰는 하나) · null 이면 범례를 건드리지 않는다
 *   parent          입자 물체를 걸 자리(.add(obj)) — LiveLayers.group. 지구와 같은 좌표계(원점 = 지구 중심 · 회전 없음)여야 한다
 *   isOn()          레이어가 켜져 있나 — LiveLayers 의 'wind' 상태를 읽는 함수. tick 이 매 프레임 묻는다(객체를 만들지 말 것)
 *   particleScale() 발열 배율 — main.js ThermalGovernor.budget.particleScale
 *   shellRadius()   풍속 색면과 같은 반지름 — LiveLayers.airShell().radius (지형 과장이 바뀌면 달라진다)
 *   exagger()       지형 과장 — 이 값이 바뀔 때만 shellRadius() 를 다시 묻는다(그 함수는 부를 때마다 객체를 만든다)
 *   onChange()      시각·키프레임·자료 상태가 바뀌었다(켜져 있을 때만) — 카드를 글자 사본으로 쥔 쪽이 recard 로 갈아 끼운다
 *   viewport(out)   out.w · out.h 에 화면 **CSS 픽셀**을 쓴다(기본 window.innerWidth/Height — main.js 가 캔버스를 그 크기로 잡는다)
 *   cap · nav · storage · lang() · createParticles(opts)   시험·기기 판정용
 */
export function createWindLayer(deps = {}) {
  const frames = deps.frames || sharedGfsFrames();
  const bus = deps.timeBus || sharedTimeBus;
  const legend = deps.legend === undefined ? sharedLegend : deps.legend;
  const scale = scaleOf('wind');
  const isOn = deps.isOn || (() => false);
  const particleScale = deps.particleScale || (() => 1);
  const shellRadius = deps.shellRadius || null;
  const exagger = deps.exagger || (() => 1);
  const cap = deps.cap || windDeviceCap(deps.nav || globalThis.navigator);
  const lang = deps.lang || (() => 'ko');
  const viewport = deps.viewport || ((o) => {
    o.w = (typeof window !== 'undefined' && window.innerWidth) || 0;
    o.h = (typeof window !== 'undefined' && window.innerHeight) || 0;
  });
  const storage = deps.storage !== undefined ? deps.storage : (() => {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  })();
  const makeParticles = deps.createParticles || ((opts) => new WindParticles(opts));

  let particles = null;
  let spec = null;               // windFieldSpecOf 결과(세대가 바뀌면 다시 읽는다)
  let on = false;
  let offBus = null;
  let offSwap = null;
  let status = 'idle';           // idle · loading · ready · out-of-range · no-data
  let reason = '';
  let key = null;                // 지금 입자 엔진에 들어 있는 키프레임 ('세대|a.h|b.h')
  let heldSpan = null;           // 그 키프레임의 구간 { ha, hb } — 늦게 온 장과 시간 거리를 견준다(frame-arrival.js)
  let pendingKey = null;         // 청해 놓고 아직 안 온 키프레임
  let pending = null;            // 그 약속(같은 키프레임을 두 번 청하지 않는다)
  let gen = 0;                   // 켜고 끈 세대 — 꺼진 층에는 늦게 온 장을 넣지 않는다
  let lastBr = null;
  let lastT = NaN;
  let colorMode = 'speed';
  let legendOurs = false;
  let lastSig = '';
  let slow = 0;
  let lastEx = NaN;
  let shellR = 0;
  let lastR = NaN;
  let lastPs = NaN;
  let viewW = 0; let viewH = 0; let viewFov = 0;
  const vp = { w: 0, h: 0 };
  const fwd = { x: 0, y: 0, z: -1 };
  const readTmp = { u: 0, v: 0 };
  const legendArgs = { scale, title: TITLE, source: SOURCE, run: null, valid: null, note: undefined };
  // staleFails — 지나친 구간의 장이 탈났지만 화면을 비우지 않고 조용히 버린 횟수(2026-09-20 F1 정정). lateDrops 와 뜻이 다르다:
  //   lateDrops = 성한데 더 먼 장 · staleFails = 탈났는데 지금 구간이 아닌 장.
  const counters = { pixelRequests: 0, fieldSets: 0, mixSets: 0, updates: 0, prefetches: 0, lateDrops: 0, staleFails: 0 };

  let intensity = 3;
  try {
    const saved = storage ? Number(storage.getItem('earthus.wind.intensity')) : NaN;
    if (saved === 1 || saved === 2 || saved === 3) intensity = saved;
  } catch (e) { /* 저장소가 막힌 브라우저 — 기본값으로 */ }

  const token = () => { const i = frames.info && frames.info(); return i ? (i.generatedAt || i.run || '') : ''; };
  const fNum = (h) => `f${String(h).padStart(3, '0')}`;
  const nowMs = () => (frames.timeAt ? frames.timeAt(0) : Date.now());   // 저장소와 같은 시계(런 나이 '지연' 판정)

  function ensureParticles() {
    if (particles) return particles;
    // 경계도 색도 눈금표에서 온다. 엔진의 셰이더 배열은 길이가 고정(경계 7 · 색 8)이라, 표가 그 길이가 아니면
    // 조용히 어긋난 색으로 그리지 말고 멈춘다 — 표를 고친 사람이 바로 알아야 한다.
    if (scale.breaks.length !== WIND_SPEED_BOUNDS_MS.length) {
      throw new Error('자료 없음 — 색 눈금표(풍속)의 구간 수가 입자 엔진과 다릅니다');
    }
    const r = shellRadius ? shellRadius() + WIND_SHELL_LIFT : 0;
    // depthTest 를 끈다 — 입자는 이제 색면과 같은 지표 높이(1 + FIELD_LIFT)에 있어서, 과장된 지형이 그 위로 솟으면
    // 산이 입자를 가린다(과장 50× 에서 히말라야는 반지름 1.07). 지구 뒤편은 깊이가 아니라 facing(uLimb)이 지운다.
    particles = makeParticles(r > 0 ? { maxParticles: cap, radius: r, depthTest: false } : { maxParticles: cap, depthTest: false });
    particles.setSpeedColors(scale.colors);          // 엔진의 임시 색(WIND_SPEED_COLORS_TEMP)을 쓰지 않는다
    if (particles.uniforms && particles.uniforms.uBounds) particles.uniforms.uBounds.value = Array.from(scale.breaks);
    particles.setColorMode(colorMode);
    particles.setIntensity(intensity);
    particles.setVisible(false);
    if (deps.parent && particles.object) deps.parent.add(particles.object);
    return particles;
  }

  function fail(why) {
    status = 'no-data'; reason = why; key = null; heldSpan = null;
    if (particles) particles.setField(null);         // 입자 0 — 막대기로 물러나지 않는다
    publish();
  }

  // 지금 이 시각에는 그릴 것이 없다 — 늦게 온 장이 그 화면을 되살리면 안 된다(frame-arrival.js 의 stale).
  const blocked = () => status === 'out-of-range' || status === 'no-data';

  /** 지금 시각과 그 시각이 끼고 있는 구간을 한 번에 묻는다. 저장소가 탈이 나면 br = null — 거리를 못 잰다. */
  function nowBracket() {
    const tMs = bus.validMs();
    let br = null;
    try { br = frames.bracket(WIND_FIELD_ID, tMs); } catch (e) { br = null; }
    return { tMs, br };
  }

  /** 도착한 장이 **지금 시각의 구간**인가. 범위 밖이면 거짓이다 — 그 시각에는 그릴 구간이 아예 없다.
   *  탈난 장이 화면을 비울 수 있는 것은 이때뿐이다(syncTime 의 fail 문지기). */
  const isCurrentSpan = (ha, hb, br) => !!br && !br.outOfRange && sameSpan({ ha, hb }, { ha: br.a.h, hb: br.b.h });

  /** 도착한 장 { ha, hb } 을 지금 엔진에 든 것과 **시간 거리**로 견준다. 저장소가 탈이 나면 거리를 못 재고 → 넣지 않는다. */
  function takesArrival(ha, hb, at = nowBracket()) {
    const cur = at.br;
    const ok = acceptsArrival({
      arriving: { ha, hb },
      held: heldSpan,
      current: cur && !cur.outOfRange ? { ha: cur.a.h, hb: cur.b.h } : null,
      hourNow: forecastHourAt(cur, at.tMs),
      stale: blocked(),
    });
    if (!ok) counters.lateDrops += 1;
    return { ok, cur };
  }

  /** 재생이 다음 구간으로 넘어갈 때 끊기지 않게 한 장 앞을 받아 둔다. 저장소가 중복과 캐시를 맡는다(field-layer.prefetchAfter 와 같은 길). */
  function prefetchAfter(hb) {
    const list = frames.framesFor ? frames.framesFor(WIND_FIELD_ID) : null;
    if (!list || !list.length) return;
    const at = list.findIndex((f) => f && f.h === hb);
    const next = at >= 0 ? list[at + 1] : null;
    if (!next) return;
    counters.prefetches += 1;
    Promise.resolve(frames.pixels(WIND_FIELD_ID, next.h)).catch(() => {});
  }

  /** 시간 버스가 부른다(그리고 1분마다 한 번 — '지금'이 흐른다). 돌려주는 약속은 키프레임이 들어간 뒤에 풀린다(true = 흐른다). */
  function syncTime() {
    const tMs = bus.validMs();
    lastT = tMs;
    let br = null;
    try { br = frames.has(WIND_FIELD_ID) ? frames.bracket(WIND_FIELD_ID, tMs) : null; } catch (e) { br = null; }
    lastBr = br;
    if (!br) {
      pendingKey = null; pending = null;
      fail('이 GFS 런에는 10 m 바람 프레임이 없습니다');
      return Promise.resolve(false);
    }
    if (br.outOfRange) {
      // 끝 프레임을 범위 밖 시각의 바람이라고 흘리지 않는다(gfs-frames.js 머리말 '쓰는 쪽이 알아야 할 것').
      pendingKey = null; pending = null;
      status = 'out-of-range'; reason = '예보 범위 밖 — 이 시각의 GFS 바람 프레임이 없습니다'; key = null; heldSpan = null;
      if (particles) particles.setField(null);
      publish();
      return Promise.resolve(false);
    }
    const k = `${token()}|${br.a.h}|${br.b.h}`;
    if (k === key) {
      // 같은 두 프레임 사이 — 픽셀을 다시 청하지 않는다. 비율만 바뀐다.
      // 다른 구간을 청해 둔 것이 있어도 버리지 않는다: 그것이 도착할 무렵 시각이 그쪽으로 가 있으면 넣는 것이 맞고,
      // 여기로 돌아와 있으면 아래 도착 판정이 '더 멀다'고 떨어뜨린다(frame-arrival.js).
      if (particles) { particles.setMix(br.mix); counters.mixSets += 1; }
      status = 'ready'; reason = '';
      publish();
      return Promise.resolve(true);
    }
    if (k === pendingKey && pending) { publish(); return pending; }   // 같은 두 장을 이미 청했다 — 다시 청하지 않는다
    const myGen = gen;
    pendingKey = k;
    if (status !== 'ready') status = 'loading';
    const ha = br.a.h; const hb = br.b.h;
    counters.pixelRequests += ha === hb ? 1 : 2;
    const pa = frames.pixels(WIND_FIELD_ID, ha);
    const pb = ha === hb ? pa : frames.pixels(WIND_FIELD_ID, hb);
    const mine = Promise.all([pa, pb]).then(([a, b]) => {
      if (myGen !== gen) return false;                // 그 사이 껐다 — 꺼진 층이 입자 엔진을 만지지 않는다
      // 내 자리표만 지운다. 두 장이 한꺼번에 오는 중일 수 있어서(빠른 스크럽), 남의 자리표를 지우면
      // 그쪽을 '안 청한 것'으로 여겨 같은 두 장을 다시 청한다.
      if (pendingKey === k) { pendingKey = null; pending = null; }
      const at = nowBracket();
      // 받은 것이 **성한지 먼저** 본다. 그리고 탈난 장이 화면을 비울 수 있는 것은 그것이 **지금 시각의 구간**일 때뿐이다.
      //   ⚠️ 2026-09-20 정정 — 여기에 '거리 판정을 아래 검사들보다 먼저 한다'고 적고 그렇게 두었더니 거꾸로였다:
      //   스크럽으로 **지나친** 구간의 장이 탈나도 거리 판정은 '지금 든 것보다 가깝다'며 통과시켰고, 그 실패가 fail() 을 불렀다.
      //   fail() 이 status 를 'no-data' 로 만들면 blocked() 가 참이 되어 **바로 뒤에 도착하는 지금 구간의 멀쩡한 두 장까지**
      //   stale 로 떨어졌다(재생 중에는 늘 서너 구간이 떠 있어 한 장만 실패해도 입자가 통째로 사라졌다).
      //   그래서 순서는 성한가 → (탈났으면) 지금 구간인가 → 거리 다. 지금 구간의 진짜 실패는 그대로 말한다.
      let bad = !a || !b ? '바람 프레임 그림을 받지 못했습니다' : '';
      if (!bad) {
        if (!spec) spec = windFieldSpecOf(frames.fieldSpec(WIND_FIELD_ID));
        if (a.w !== spec.w || a.h !== spec.h || b.w !== spec.w || b.h !== spec.h
          || !a.names || a.names[0] !== 'R' || a.names[1] !== 'G') bad = '받은 바람 프레임의 크기·채널이 목록과 다릅니다';
      }
      if (bad) {
        if (!isCurrentSpan(ha, hb, at.br)) { counters.staleFails += 1; return false; }
        fail(bad); return false;
      }
      // 늦게 왔다고 버리지 않는다 — **지금 시각에 더 가까운 장**이면 지금 든 것보다 낫다(frame-arrival.js 머리말).
      const { ok: take, cur } = takesArrival(ha, hb, at);
      if (!take) return false;
      // 받는 사이 같은 두 프레임 안에서 시각이 움직였을 수 있다 — 비율은 지금 것으로.
      const mix = cur && !cur.outOfRange && cur.a.h === ha && cur.b.h === hb ? cur.mix : br.mix;
      ensureParticles().setField({
        w: spec.w, h: spec.h, dataA: a.data, dataB: a === b ? null : b.data, mix, decode: spec.decode, grid: spec.grid,
      });
      counters.fieldSets += 1;
      key = k; heldSpan = { ha, hb }; status = 'ready'; reason = '';
      publish();
      prefetchAfter(hb);                              // 다음 한 장을 미리 — 재생이 구간을 넘을 때 끊기지 않게
      return true;
    }).catch((e) => {
      if (myGen !== gen) return false;
      if (pendingKey === k) { pendingKey = null; pending = null; }
      // 못 받은 장이 **지금 시각의 구간이 아니면** 화면을 비우지 않는다 — 스크럽으로 지나친 구간 하나가 실패했다고
      // 잘 흐르던 입자를 '자료 없음'으로 지우면 안 된다. 지금 시각의 구간이면 그때 실패를 말한다.
      //   ⚠️ 2026-09-20 정정 — 여기서도 거리 판정(takesArrival)으로 갈랐는데, 그것은 '지나친 구간'을 통과시킨다(위 .then 의 정정).
      //   비울까 말까는 거리가 아니라 **같은 구간인가**로 가른다.
      if (!isCurrentSpan(ha, hb, nowBracket().br)) { counters.staleFails += 1; return false; }
      fail(String((e && e.message) || e).replace(/^자료 없음 — /, ''));
      return false;
    });
    pending = mine;
    publish();
    return mine;
  }

  // 상태가 바뀌었다(시각 · 키프레임 · 자료 없음) — 범례를 고쳐 쓰고, 열려 있는 카드를 쥔 쪽(main.js)에 알린다.
  // 카드는 main.js 가 글자 사본으로 쥐고 있어서, 알리지 않으면 타임라인을 밀어도 카드의 '유효 시각'이 옛 글로 남는다.
  //   알리는 것은 **카드에 적힌 것이 바뀌었을 때만**이다(상태 · 두 프레임 · 받는 중). 유효 시각은 범례가 말하고, 두 프레임 사이의
  //   비율(재생 중 0.2초마다 바뀐다)은 카드에 적지 않는다 — 그때마다 패널을 통째로 다시 그리면 읽던 자리가 튄다.
  function publish() {
    paintLegend();
    if (!on || !deps.onChange) return;
    const br = lastBr;
    const sig = `${status}|${reason}|${br && br.a ? `${br.a.h}|${br.b.h}` : ''}|${pendingKey ? 1 : 0}`;
    if (sig === lastSig) return;
    lastSig = sig;
    try { deps.onChange(); } catch (e) { /* 듣는 쪽의 탈이 바람을 세우면 안 된다 */ }
  }

  function paintLegend() {
    if (!legend || !on) return;
    const info = frames.info ? frames.info() : null;
    const blocked = status === 'out-of-range' || status === 'no-data';
    legendArgs.source = pendingKey ? `${SOURCE} · 프레임 받는 중` : SOURCE;
    legendArgs.run = info ? info.run : null;
    legendArgs.valid = blocked ? null : lastT;        // 범위 밖 시각을 '유효'라고 적지 않는다
    // 풀이 줄: 평소에는 눈금표의 입자 과장 고지(undefined 면 범례가 그것을 쓴다), 자료가 없으면 그 이유.
    // 영어 화면에는 영어로 — 이유의 세부(한국어 문장)는 카드가 말하고, 범례의 한 줄은 상태만 옮긴다.
    legendArgs.note = blocked
      ? { ko: reason, en: status === 'out-of-range' ? 'Outside the forecast range — no GFS wind frame for this time' : 'No data — GFS 10 m wind frames are unavailable' }
      : undefined;
    // 주인을 밝혀 그린다 — 풍속 색면(세기 10)이 깔려 있으면 그쪽 범례가 화면을 갖고, 색면을 끄면 이 범례가 바로 돌아온다.
    legend.show(legendArgs, LEGEND_OWNER, LEGEND_PRIORITY_WIND);
    legendOurs = true;
  }

  // 다른 색면이 그 사이 범례를 가져갔으면(제목이 우리 것이 아니다) 남의 범례를 끄지 않는다.
  // 범례 주인 이름과 세기 — 색면(field-layer.js LEGEND_PRIORITY_FIELD = 10)보다 낮다: 색면이 깔리면 색을 설명하는 쪽이 이긴다.
  // 그때 입자의 '과장 표현' 고지는 사라지지 않는다 — 풍속 눈금표의 legendNote 가 같은 글이라 색면 범례가 그것을 쓴다.
  const LEGEND_OWNER = 'wind-particles';
  const LEGEND_PRIORITY_WIND = 5;

  function hideLegend() {
    if (!legend || !legendOurs) return;
    legendOurs = false;
    // 범례에 주인이 생겼다(field-legend.js · 2026-09-20) — 내 것만 놓으면 남은 주인(풍속 색면 등)의 범례가 바로 돌아온다.
    if (legend.release) { legend.release(LEGEND_OWNER); return; }
    const el = legend.el;
    const shown = el && el.children && el.children[0] ? el.children[0].textContent : null;
    if (shown == null || shown === TITLE.ko || shown === TITLE.en) legend.hide();
  }

  function setOn(next) {
    if (next === on) return;
    on = next;
    if (on) {
      if (particles) particles.setVisible(true);
      slow = 0; lastEx = NaN; lastR = NaN; lastPs = NaN; viewW = 0;
      offSwap = frames.onSwap
        ? frames.onSwap(() => { key = null; heldSpan = null; pendingKey = null; pending = null; spec = null; gen += 1; if (on) syncTime(); })
        : null;
      offBus = bus.on(() => { syncTime(); });          // 바로 한 번 불린다 — 타임라인을 민 뒤에 켜도 그 시각에서 시작한다
    } else {
      if (offBus) offBus();
      if (offSwap) offSwap();
      offBus = null; offSwap = null;
      gen += 1; pendingKey = null; pending = null;      // 오는 중인 응답은 버린다 — 꺼진 층이 입자 엔진을 만지지 않는다
      if (particles) particles.setVisible(false);
      hideLegend();
    }
  }

  // 지금 화면·발열·강도에서 그려질 입자 수(카드용). 엔진의 targetCount 와 같은 셈이다 — 칩을 누른 직후에는 엔진의 count 가
  // 아직 옛 값이라(다음 프레임에 바뀐다) 엔진에 묻지 않고 같은 식으로 센다.
  function plannedCount() {
    if (status === 'out-of-range' || status === 'no-data') return 0;
    viewport(vp);
    return particleCountFor(windBudget({ widthCss: vp.w, heightCss: vp.h, particleScale: particleScale(), cap }), intensity, cap);
  }

  const api = {
    /** LiveLayers.fetchFor('wind') 가 부른다. 목록 → wind10 있음 → 지금 시각의 두 프레임까지 **실제로 받아 본 뒤** 풀린다.
     *  안 되면 이유를 던진다 — LiveLayers.toggle 이 그것을 '자료 없음' 카드로 낸다. 20분마다의 갱신도 이 길이다(새 런 확인). */
    async load() {
      const mf = await frames.load();
      if (!mf) throw new Error('자료 없음 — GFS 예보 목록(clouds/gfs-fc/manifest.json)을 받지 못했습니다');
      if (!frames.has(WIND_FIELD_ID)) {
        const i = frames.info();
        throw new Error(`자료 없음 — 이 GFS 런(${(i && i.run) || '시각 미상'})에는 10 m 바람 프레임이 실려 있지 않습니다`);
      }
      spec = windFieldSpecOf(frames.fieldSpec(WIND_FIELD_ID));
      ensureParticles();
      const ok = await syncTime();
      // 예보 범위 밖은 '켜짐'이다(타임라인을 되돌리면 흐른다) — 범례와 카드가 범위 밖이라고 말한다. 그 밖의 실패는 켜지 않는다.
      if (!ok && status === 'no-data') throw new Error(`자료 없음 — ${reason}`);
      const i = frames.info();
      return { run: i && i.run, frames: frames.framesFor(WIND_FIELD_ID).length };
    },

    /** 매 프레임(main.js tick). 꺼져 있으면 아무것도 하지 않는다. camera = THREE 카메라(.position · .matrixWorld · .fov). */
    tick(dt, camera) {
      const want = !!isOn();
      if (want !== on) setOn(want);
      if (!on || !particles) return;
      slow += dt;
      if (slow >= 60) { slow = 0; syncTime(); }         // 오프셋이 그대로여도 '지금'은 흐른다 — 1분에 한 번 비율을 다시 잰다
      viewport(vp);
      const fov = camera.fov || 48;
      const ps = particleScale();
      if (vp.w !== viewW || vp.h !== viewH || fov !== viewFov || ps !== lastPs) {
        viewW = vp.w; viewH = vp.h; viewFov = fov; lastPs = ps;
        particles.setView({ fovDeg: fov, widthCss: vp.w, heightCss: vp.h });
        particles.setBudget(windBudget({ widthCss: vp.w, heightCss: vp.h, particleScale: ps, cap }));
      }
      if (shellRadius) {
        const ex = exagger();
        if (ex !== lastEx) { lastEx = ex; shellR = shellRadius() + WIND_SHELL_LIFT; }
        const r = windRadiusFor(shellR, Math.hypot(camera.position.x, camera.position.y, camera.position.z));
        if (!(Math.abs(r - lastR) <= 1e-5)) {            // lastR 이 NaN(막 켰다)이면 참 — 부등호를 뒤집어 쓰면 영영 안 들어간다
          lastR = r;
          particles.setRadius(r);
          if (particles.setLimbLo) particles.setLimbLo(windLimbLoFor(r));
        }
      }
      // 카메라가 보는 방향 = 월드 행렬의 −Z 축. 틸트 화면에서 입자를 시야 밖에 뿌리지 않게 엔진에 넘긴다.
      // (행렬은 직전 렌더에서 갱신된 것이라 한 프레임 늦다 — 뿌릴 캡을 고르는 데는 충분하다.)
      const e = camera.matrixWorld && camera.matrixWorld.elements;
      if (e) { fwd.x = -e[8]; fwd.y = -e[9]; fwd.z = -e[10]; }
      // 자료가 없을 때(범위 밖 등)도 부른다 — 엔진이 입자 수 0 을 보고 물체를 숨긴다. 안 부르면 마지막 꼬리가 얼어붙은 채 남는다.
      particles.update(dt, camera.position, e ? fwd : null);
      counters.updates += 1;
    },

    /** 입자 강도 칩 — 1 = 예산의 1/3 · 2 = 2/3 · 3 = 전부. 실제 입자 수가 다음 프레임에 바뀐다. */
    setIntensity(k) {
      intensity = k === 1 ? 1 : k === 2 ? 2 : 3;
      if (particles) particles.setIntensity(intensity);
      try { if (storage) storage.setItem('earthus.wind.intensity', String(intensity)); } catch (e) { /* 무시 */ }
      return intensity;
    },
    get intensity() { return intensity; },

    /** 다음 묶음의 전환 함수: 풍속 색면이 밑에 깔리면 'white'(입자는 방향만 말한다), 걷히면 'speed'(입자가 풍속 구간색). */
    setColorMode(mode) {
      const next = mode === 'white' ? 'white' : 'speed';
      const changed = next !== colorMode;
      colorMode = next;
      if (particles) particles.setColorMode(colorMode);
      // 카드가 '입자 색 = 풍속 구간'이라고 적어 두는데 색면 위에서는 입자가 흰색이다 — 바뀌면 떠 있는 카드를 갈아 끼운다.
      if (changed && on) publish();
      return colorMode;
    },
    get colorMode() { return colorMode; },

    /** 지구 클릭. 켜져 있지 않으면 null(다른 선택 흐름으로 넘긴다). 켜져 있으면 늘 카드를 준다 — 값이 없으면 왜 없는지. */
    readoutAt(lat, lon) {
      if (!on) return null;
      const title = `모델 바람 · ${fmtLatLon(lat, lon)}`;
      const info = frames.info ? frames.info() : null;
      const metaOf = (valid) => legendMetaLine({ source: SOURCE, run: info && info.run, valid, lang: lang(), now: nowMs() }).text;
      if (status === 'out-of-range' || status === 'no-data') {
        return { title, badge: 'UNAVAILABLE', html: `<p><b>자료 없음</b> — ${reason}</p><p>${metaOf(null)}</p>`, model: null };
      }
      // 값은 **지금 화면에 흐르는 바로 그 격자**(입자 엔진에 들어 있는 두 프레임 · 같은 비율)에서 읽는다 — 네트워크 0건.
      // ⚠️ 프레임 저장소의 sampleAt 으로 읽지 않는다: 그쪽은 두 프레임이 **캐시에 남아 있을 때만** 값을 준다. 저장소는 구름·기온과
      //    나눠 쓰는 LRU(폰 32 MB ≈ 20장)라 다른 레이어가 우리 두 장을 밀어낼 수 있다 — 입자는 계속 흐르는데(엔진이 바이트를 쥐고 있다)
      //    클릭은 영영 '받는 중'이 된다. 화면에 보이는 것과 클릭 값이 같은 자료에서 나와야 한다는 점에서도 이쪽이 맞다.
      const f = particles && particles.sim ? particles.sim.field : null;
      const br = lastBr;
      if (status !== 'ready' || pendingKey || !f || !spec || !br || br.outOfRange) {
        // 새 키프레임을 청해 놓은 동안은 화면의 격자가 옛 시각 것이다 — 그 값을 새 시각의 값이라고 말하지 않는다(곧 들어온다).
        return { title, badge: 'LOADING', html: '<p role="status">이 시각의 바람 프레임을 받는 중입니다 — 잠시 뒤 다시 눌러 주세요.</p>', model: null };
      }
      // 저장소와 같은 모양의 격자 명세(dLat 은 크기)로 격자점을 찾는다. 격자점에서 읽으므로 공간 보간이 없다(이웃 가중치 0).
      const pt = nearestGridPoint({ ni: spec.w, nj: spec.h, lon0: spec.grid.lon0, lat0: spec.grid.lat0, dLon: spec.grid.dLon, dLat: -spec.grid.dLat, wraps: true }, lat, lon);
      const w = pt ? sampleWind(f, pt.lat, pt.lon, readTmp) : null;
      if (!w) {
        return { title, badge: 'UNAVAILABLE', html: `<p><b>자료 없음</b> — 이 격자점에는 바람 값이 비어 있습니다.</p><p>${metaOf(lastT)}</p>`, model: null };
      }
      const m = windReadoutModel({ u: w.u, v: w.v, point: pt, clicked: { lat, lon }, scale });
      const between = br.a !== br.b && br.mix > 0 ? ` · ${fNum(br.a.h)}↔${fNum(br.b.h)} 모델 프레임 사이 보간(${br.gapH}시간 간격)` : '';
      return { title, badge: 'MODEL', html: windReadoutHtml(m, `${metaOf(lastT)}${between}`), model: m };
    },

    cardHtml() {
      const info = frames.info ? frames.info() : null;
      const blocked = status === 'out-of-range' || status === 'no-data';
      // 유효 시각은 여기 적지 않는다 — 분 단위로 흐르는 값이라 글자 사본인 카드에서는 금방 옛 글이 된다. 범례가 늘 말한다.
      const meta = legendMetaLine({ source: SOURCE, run: info && info.run, valid: null, lang: lang(), now: nowMs() });
      const br = lastBr;
      const interp = !blocked && br && !br.outOfRange
        ? (br.a === br.b ? `${fNum(br.a.h)} 프레임 그대로`
          : `${fNum(br.a.h)}↔${fNum(br.b.h)} 모델 프레임 사이 보간${br.gapH > 3 ? ` · 간격 ${br.gapH}시간` : ''}`)
        : '';
      const ps = particleScale();
      return windCardHtml({
        intensity,
        particles: plannedCount(),
        particleScale: Number.isFinite(ps) ? ps : 1,
        metaLine: meta.text,
        stale: meta.stale,
        statusLine: blocked ? `자료 없음 — ${reason}` : '',
        interp,
        colorMode,
      });
    },

    /** lockedNote.body(글자 사본) 안의 바람 카드만 지금 상태로 갈아 끼운다 — 칩을 누른 뒤 main.js 가 부른다. */
    recard(bodyHtml) {
      const s = String(bodyHtml || '');
      const a = s.indexOf(CARD_OPEN);
      const b = s.indexOf(CARD_CLOSE);
      if (a < 0 || b < a) return s;
      return s.slice(0, a) + api.cardHtml() + s.slice(b + CARD_CLOSE.length);
    },

    /** LiveLayers 가 쥐는 meta — 읽는 순간의 상태다(getter). 다시 켤 때 LiveLayers 는 처음 받은 meta 를 그대로 쓴다. */
    meta() {
      return {
        get badge() { return 'MODEL'; },
        get note() { return api.note(); },
        get cardHtml() { return api.cardHtml(); },
      };
    },
    /** 메뉴 줄 옆의 짧은 글. */
    note() {
      if (status === 'out-of-range') return '예보 범위 밖';
      if (status === 'no-data') return '자료 없음';
      const info = frames.info ? frames.info() : null;
      const run = info && Number.isFinite(info.runMs) ? `GFS ${String(new Date(info.runMs).getUTCHours()).padStart(2, '0')}Z` : 'GFS';
      return `${run} · 10 m · 입자 ${plannedCount().toLocaleString('en-US')}`;
    },

    /** 콘솔 확인용: __earthusWind.state() */
    state() {
      return {
        on, status, reason, key, pendingKey, intensity, colorMode, cap,
        validMs: lastT, a: lastBr && lastBr.a ? lastBr.a.h : null, b: lastBr && lastBr.b ? lastBr.b.h : null,
        mix: lastBr ? lastBr.mix : null, outOfRange: lastBr ? lastBr.outOfRange : null,
        ...counters,
        particles: particles && particles.stats ? particles.stats() : null,
      };
    },
    /** 청해 놓은 키프레임이 들어갈 때까지 기다린다(없으면 바로). 시험과 콘솔 확인용 — 그리기 경로는 기다리지 않는다. */
    settled() { return pending || Promise.resolve(status === 'ready'); },
    get particles() { return particles; },
    get on() { return on; },

    dispose() {
      setOn(false);
      if (particles) particles.dispose();
      particles = null; key = null; heldSpan = null; status = 'idle';
    },
  };

  return api;
}

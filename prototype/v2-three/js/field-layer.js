// EARTHUS v2 — 색면 레이어의 공용 접착제 (DEV-DIRECTIVE 2026-09-20 · W1 "한 번 잘 만들어 여섯 번 쓴다" · W2 기온이 첫 손님)
//
// 무엇이 잘못돼 있었나: 기온(레이어 id 'tempgrid')은 Open-Meteo 5°(한 칸 555 km) **한 시각**을 선형 램프로 칠한 그라데이션이었다.
// v2 는 5일을 예보하는 유료 분석 공간인데 타임라인을 밀어도 기온은 '지금'에 멈춰 있었고, 등온선·숫자·범례가 없었고,
// 카드는 모델값을 '관측 범위'라고 적었고, 지점 기온은 브라우저가 api.open-meteo.com 을 직접 불러 받았다.
//
// 이 파일이 하는 일: 이미 있는 부품 다섯을 **descriptor 한 장으로 묶는다.**
//   프레임 저장소(gfs-frames.js) → 시간 버스(time-bus.js) → 셰이더 색면(field-renderer.js) + 숫자 라벨(field-labels.js) + 범례(field-legend.js)
//   on():  frames.load → timeBus.on → bracket(유효 시각) → 두 프레임의 텍스처·CPU 사본 → setFrames(A, B, mix)
//          프레임이 오기 전에는 그리지 않는다(빈 색·검은 구 금지). 세대가 바뀌면(onSwap) 다시 청한다.
//   off(): 구독 해제 + 범례 hide + 라벨 정리. 꺼진 뒤에는 시간 버스가 불러도 아무것도 하지 않는다.
//   풍속·기압·강수는 다음 묶음에서 FIELD_DESCRIPTORS 에 한 줄씩 더해 같은 길을 탄다 — 로직을 베끼지 않는다.
//
// 이 파일이 **하지 않는 것** — 값을 지어내지 않는 대신 밝힌다:
//   · GFS 프레임이 없으면(매니페스트 실패 · 그 필드 없음) 옛 5° 그라데이션으로 **물러나지 않는다.** '자료 없음'과 이유를 말한다.
//   · 시각이 예보 범위 밖이면 끝 프레임을 늘여 칠하지 않는다. 색면과 라벨을 숨기고 카드·범례가 '예보 범위 밖'이라 말한다.
//   · 두 프레임 사이면 '모델 프레임 사이 보간'이라고 간격(3시간 · 빠진 스텝이 있으면 6시간…)과 함께 말한다.
//   · 누른 자리의 값은 프레임의 CPU 사본에서 읽는다(frames.sampleAt) — **네트워크 호출 0건.** 0.5°C 눈금으로 반올림하고 '~' 를 붙이고
//     "0.5° 격자(약 55 km) 평균"이라고 적는다. 모델 격자값을 도시값·관측값처럼 찍지 않는다(8bit 눈금과 격자 평균에서 0.1°C 는 안 나온다).
//
// 카드의 조작은 **실제로 동작하는 것만** 그린다: 등온선 켬/끔 · 2°C | 5°C. 고를 것이 하나뿐인 것(모델 GFS · 고도 2 m)은
// 단추로 가장하지 않고 글자로 적는다(지시서 W3 'Inspector' — 죽은 토글 금지).
//
// DOM 은 주입받는다(doc). 없으면 카드 갱신을 건너뛸 뿐이다 — 시험은 가짜 프레임 저장소·시간 버스·범례로 이 파일을 그대로 부른다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { i18n } from './i18n.js?v=11';
import { timeBus as sharedTimeBus } from './time-bus.js?v=1';
import { decodeByte, sharedGfsFrames } from './gfs-frames.js?v=1';
import { fieldLegend as sharedLegend } from './field-legend.js?v=1';
import { bandColor, formatValue, isolineSpec, scaleOf } from './field-scales.js?v=1';
import { logReadout, readTicks, topBandNote } from './field-log.js?v=1';
import { FieldRenderer, halfStepOf } from './field-renderer.js?v=1';
import { FIELD_LABEL_CAP, FieldLabels, labelLevels, labelText, pickLabelSpots, thinField } from './field-labels.js?v=1';
import { FieldSymbols, SYMBOL_CAP, symbolCardRow } from './field-symbols.js?v=1';

// 레이어 id → 무엇을 어떻게 그리나. 레이어 id·현상 id 는 개명하지 않는다(현상 레지스트리 규칙) — 'tempgrid' 그대로다.
//   fieldId   프레임 저장소의 필드(gfs-frames.js) · scaleId  색 눈금표(field-scales.js)
//   mode      'scalar' | 'magnitudeRG'(풍속) · mask  'none' | 'ocean'
//   isolineChoices  카드에 단추로 낼 등치선 간격 — 눈금표에 실제로 있는 것만 나온다
export const FIELD_DESCRIPTORS = Object.freeze({
  tempgrid: Object.freeze({
    layerId: 'tempgrid', fieldId: 'temp', scaleId: 'temp', mode: 'scalar', mask: 'none',
    title: Object.freeze({ ko: '전지구 기온 · 지상 2 m', en: 'Global temperature · 2 m' }),
    quantity: Object.freeze({ ko: '기온', en: 'Temperature' }),
    isoName: Object.freeze({ ko: '등온선', en: 'Isotherms' }),
    isolineChoices: Object.freeze(['2', '5']),
  }),
  // 풍속(2026-09-20) — 시안 02: 풍속 구간색 8단 위로 흰 입자가 흐른다. 자료는 입자(js/wind-layer.js)와 같은 GFS 10 m u·v 프레임이고
  // 셰이더가 디코드한 뒤 크기를 구한다(magnitudeRG). 풍속 등치선은 일부러 없다(눈금표 wind.isoline = null — 입자가 그 몫을 한다).
  // 예전 'windgrid' 는 Open-Meteo 5°(한 칸 555 km) 한 시각의 선형 램프였다: 전지구 최대가 23.8 m/s 라 태풍이 격자 사이로 빠졌다.
  windgrid: Object.freeze({
    layerId: 'windgrid', fieldId: 'wind10', scaleId: 'wind', mode: 'magnitudeRG', mask: 'none',
    title: Object.freeze({ ko: '전지구 풍속 · 지상 10 m', en: 'Global wind speed · 10 m' }),
    quantity: Object.freeze({ ko: '풍속', en: 'Wind speed' }),
    isoName: Object.freeze({ ko: '등풍속선', en: 'Isotachs' }),
    isolineChoices: Object.freeze([]),
  }),
  // 강수(2026-09-20 W4) — 시안 03: mm/h 구간색 8단 + **강한 코어 윤곽**(10 mm/h 한 줄). 자료는 GFS 강수율 프레임의 R 채널이고
  // **log10 으로 실려 있다**(transfer) — 0.05 ~ 30 mm/h 를 255칸에. 맨 아래 칸(0.1 mm/h 미만)은 눈금표가 불투명도 0 으로
  // 두었으므로 칠하지 않는다: 안 오는 곳을 파랗게 칠하면 지구 전체가 비가 된다.
  // 예전 'raingrid' 는 Open-Meteo 5°(한 칸 555 km) 한 시각의 선형 램프였다 — 소나기 하나가 한반도만 한 네모가 됐다.
  // 누적(1h · 3h · 24h)은 아직 없다. 눈금표에 단위 전환(mm)이 준비돼 있지만 **단추를 그리지 않는다** — 누를 때 아무 일도
  // 안 나는 토글을 만들지 않는다(죽은 토글 금지). apcp 버킷 합산은 다음 묶음이다.
  raingrid: Object.freeze({
    layerId: 'raingrid', fieldId: 'precip', scaleId: 'precip', mode: 'scalar', mask: 'none', transfer: 'log10',
    // ⚠️ 제목에 '지금'을 넣지 않는다 — 이것은 범례의 제목이고 바로 아래 줄에 유효 시각이 선다. T+72h 를 보는 중에
    //    '지금 내리는 세기 · 유효 09/23 09:00 KST' 라고 적히면 카드가 화면과 다른 말을 한다(2026-09-20 반박 검증의 그 사고).
    title: Object.freeze({ ko: '전지구 강수 · 강수율', en: 'Global precipitation · rate' }),
    quantity: Object.freeze({ ko: '강수율', en: 'Precipitation rate' }),
    isoName: Object.freeze({ ko: '강한 코어 윤곽', en: 'Heavy-core outline' }),
    isolineChoices: Object.freeze([]),
    zeroText: Object.freeze({ ko: '비 없음', en: 'No rain' }),
  }),
  // 해면기압(2026-09-20 D1) — 지시서 W1 표: "색면은 옅게 · 4 hPa 등압선 + H/L 기호". 색면의 불투명도는 눈금표가 정한다
  // (field-scales.js pressure 의 칸마다 0.4 → 팔레트 알파 102 → 셰이더에서 × FIELD_OPACITY 0.8 = 0.32. 선이 주인공이다).
  // 등압선 간격은 4 hPa 하나뿐이라 간격 단추가 없다 — 선택지가 하나면 단추로 가장하지 않는다(죽은 토글 금지).
  // symbols 훅은 이 한 줄뿐이다: FieldLayer 가 field-symbols.js 의 층을 만들어 키프레임마다 먹인다(기온·풍속에는 없다).
  // 예전 'presgrid' 는 Open-Meteo 5° 한 시각의 선형 램프(live-layers.js PRES_RAMP)였고 등압선도 H/L 도 없었다.
  presgrid: Object.freeze({
    layerId: 'presgrid', fieldId: 'mslp', scaleId: 'pressure', mode: 'scalar', mask: 'none', symbols: 'pressureCenters',
    title: Object.freeze({ ko: '전지구 기압 · 해면', en: 'Global pressure · sea level' }),
    quantity: Object.freeze({ ko: '해면기압', en: 'Sea-level pressure' }),
    isoName: Object.freeze({ ko: '등압선', en: 'Isobars' }),
    symbolName: Object.freeze({ ko: '고·저기압 기호 H/L', en: 'High/low centres' }),
    isolineChoices: Object.freeze([]),
  }),
});

// 매니페스트를 이보다 오래 안 읽었으면 다시 읽는다. 같은 런은 3시간마다 다시 구워지고 새 런은 6시간마다 온다(gfs-frames.js) —
// 페이지를 하루 열어 둔 사람이 어제 런을 계속 보지 않게. 30분이면 조건부 GET 한 번(no-cache)이다.
// 범례 주인의 세기 — 색면이 바람 입자(5)보다 세다. 색면은 화면에 칠해진 색을 설명하고, 입자의 과장 고지는 그 눈금표의 legendNote 로 따라온다.
export const LEGEND_PRIORITY_FIELD = 10;

/** 전 해상도 CPU 사본의 **모든 바이트**에서 값의 범위. 두 프레임을 합쳐 본다(화면은 그 사이를 섞으므로 둘 다 화면에 닿는다).
 *  scalar 는 채널 하나, magnitudeRG 는 두 채널의 크기 — 크기의 최댓값은 채널별 최댓값으로 셈할 수 없어 칸마다 잰다. */
export function fullRangeOf(pxA, pxB, channels, mode = 'scalar') {
  let min = Infinity;
  let max = -Infinity;
  const look = (px) => {
    if (!px || !px.data) return;
    const n = px.channels || 1;
    const len = px.data.length;
    if (mode === 'magnitudeRG' && n >= 2 && channels.length >= 2) {
      for (let i = 0; i + 1 < len; i += n) {
        const u = decodeByte(channels[0], px.data[i]);
        const v = decodeByte(channels[1], px.data[i + 1]);
        const m = Math.hypot(u, v);
        if (m < min) min = m;
        if (m > max) max = m;
      }
      return;
    }
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < len; i += n) { const b = px.data[i]; if (b < lo) lo = b; if (b > hi) hi = b; }
    // 단조 증가 인코딩(linear · log10)이라 바이트의 min/max 가 값의 min/max 다 — 260,000 칸을 값으로 풀지 않는다.
    for (const b of [lo, hi]) { const x = decodeByte(channels[0], b); if (x < min) min = x; if (x > max) max = x; }
  };
  look(pxA);
  look(pxB);
  return Number.isFinite(min) ? { min, max } : null;
}
export const FIELD_MANIFEST_RELOAD_MS = 30 * 60 * 1000;
// 켠 뒤 첫 두 프레임을 이보다 오래 못 받으면 '받지 못했다'고 말한다. 그림 받기에는 타임아웃이 없다(THREE.ImageLoader) —
// 느린 회선에서 요청이 끊기지 않고 멈추면 메뉴가 '켜는 중'에 영영 머문다(main.js 지형 타일 로딩이 같은 이유로 15초 타임아웃을 둔다).
export const FIELD_FIRST_FRAME_TIMEOUT_MS = 20 * 1000;

const H = 3600_000;
const p2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산 — 글자와 판정. 시험이 그대로 부른다.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** 모델 런은 UTC 주기로 부른다('09/20 00Z') — field-legend.js 의 런 표기와 같은 꼴. */
export const fmtRun = (ms) => {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())} ${p2(d.getUTCHours())}Z`;
};
/** 유효 시각: 한국어 화면은 KST, 영어 화면은 UTC — 시간대를 늘 글자로 밝힌다(범례와 같은 규칙). */
export const fmtValid = (ms, ko = true) => {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + (ko ? 9 * H : 0));
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} ${ko ? 'KST' : 'UTC'}`;
};
const fmtPoint = (lat, lon) => `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(1)}°`;

/** 'MODEL · NOAA GFS 0.5°' — 모델 이름과 해상도는 매니페스트가 말한 것이다. */
export const sourceLabel = (info) => {
  const res = info && Number.isFinite(info.resolutionDeg) ? ` ${info.resolutionDeg}°` : '';
  return `MODEL · NOAA ${(info && info.model) || 'GFS'}${res}`;
};

/** '0.5° 격자(약 55 km)' — 적도에서 1° ≈ 111.2 km, 5 km 단위로 말한다(그보다 잘게 말할 정밀도가 아니다). */
export const cellLabel = (resDeg, ko = true) => {
  if (!(resDeg > 0)) return ko ? '모델 격자' : 'model grid';
  const km = Math.max(5, Math.round((resDeg * 111.195) / 5) * 5);
  return ko ? `${resDeg}° 격자(약 ${km} km)` : `${resDeg}° grid (~${km} km)`;
};

/**
 * bracket(gfs-frames)과 받는 중인지 → 화면에 말할 상태.
 *   kind  'nodata' | 'outOfRange' | 'loading' | 'interp'(두 프레임 사이) | 'exact'(프레임 그대로)
 */
export const fieldStatusOf = ({ br, loading = false, reason = null, frames = null } = {}) => {
  if (reason) return { kind: 'nodata', reason };
  if (!br) return { kind: 'nodata', reason: 'NO_FRAMES' };
  const first = frames && frames.length ? frames[0].t : null;
  const last = frames && frames.length ? frames[frames.length - 1].t : null;
  if (br.outOfRange) return { kind: 'outOfRange', side: br.outOfRange, first, last };
  if (loading) return { kind: 'loading', a: br.a, b: br.b };
  if (br.mix > 0 && br.a !== br.b) return { kind: 'interp', a: br.a, b: br.b, mix: br.mix, gapH: br.gapH };
  return { kind: 'exact', a: br.a };
};

const REASON_TEXT = {
  NO_MANIFEST: { ko: '예보 목록(clouds/gfs-fc/manifest.json)을 받지 못했습니다', en: 'the forecast manifest could not be loaded' },
  NO_FIELD: { ko: '이 예보 런에는 이 필드의 프레임이 없습니다', en: 'this model run carries no frames for this field' },
  NO_DECODE: { ko: '이 필드를 값으로 푸는 상수가 예보 목록에 없습니다', en: 'the manifest has no decode constants for this field' },
  NO_FRAMES: { ko: '프레임 목록이 비어 있습니다', en: 'the frame list is empty' },
  FRAME_FAILED: { ko: '이 시각의 프레임을 받지 못했습니다', en: 'the frame for this time could not be loaded' },
};
export const reasonText = (code, ko = true) => (REASON_TEXT[code] ? REASON_TEXT[code][ko ? 'ko' : 'en'] : String(code || ''));

/** 상태 한 줄. short 는 범례의 풀이 줄(좁다), 긴 쪽은 카드. */
export const statusText = (st, { ko = true, short = false } = {}) => {
  if (!st) return '';
  switch (st.kind) {
    case 'nodata': return ko ? `자료 없음 — ${reasonText(st.reason, true)}` : `No data — ${reasonText(st.reason, false)}`;
    case 'outOfRange': {
      if (short) return ko ? '예보 범위 밖 — 색면을 숨겼습니다' : 'Outside the forecast range — field hidden';
      const span = st.first != null ? `${fmtValid(st.first, ko)} ~ ${fmtValid(st.last, ko)}` : '';
      return ko
        ? `예보 범위 밖 — 이 런의 프레임은 ${span} 입니다. 끝 프레임을 늘여 칠하지 않고 색면을 숨겼습니다.`
        : `Outside the forecast range — this run covers ${span}. The field is hidden rather than stretched.`;
    }
    case 'loading': return ko ? '프레임을 받는 중…' : 'Loading frames…';
    case 'interp': {
      if (short) return ko ? `모델 프레임 사이 보간(${st.gapH}시간 간격)` : `Interpolated between model frames (${st.gapH} h apart)`;
      return ko
        ? `모델 프레임 사이 보간 — ${fmtValid(st.a.t, true)} 와 ${fmtValid(st.b.t, true)} 프레임 사이(${st.gapH}시간 간격)를 값으로 이었습니다.`
        : `Interpolated between model frames — ${fmtValid(st.a.t, false)} and ${fmtValid(st.b.t, false)} (${st.gapH} h apart), blended by value.`;
    }
    case 'exact': return short ? '' : (ko ? `모델 프레임 그대로 — ${fmtValid(st.a.t, true)}` : `Model frame as issued — ${fmtValid(st.a.t, false)}`);
    default: return '';
  }
};

/**
 * 누른 자리의 값 — frames.sampleAt 의 결과를 화면의 말로.  → { ok, value, text, note } | { ok:false, text }
 *   눈금(step)은 매니페스트의 디코드 scale 에서 온다(기온 0.5). 그 눈금으로 반올림하고 '~' 를 붙인다.
 *   로그로 실린 자료(강수율)에는 그 상수 눈금이 없다 — 표본이 step 대신 floor(자료의 바닥)를 달고 오고, 글자는 field-log.js 가 짓는다.
 */
export const readoutOf = (sample, { scale, mode = 'scalar', resolutionDeg = null, zeroText = null, ko = true } = {}) => {
  if (!sample) return { ok: false, text: ko ? '값을 읽을 프레임이 아직 없습니다' : 'No frame to read from yet' };
  if (sample.outOfRange) return { ok: false, text: ko ? '예보 범위 밖 — 값을 말하지 않습니다' : 'Outside the forecast range — no value is given' };
  if (!sample.decoded) return { ok: false, text: ko ? '이 필드는 값으로 풀 수 없습니다' : 'This field cannot be decoded' };
  const raw = mode === 'magnitudeRG' ? Math.hypot(sample.values[0], sample.values[1]) : sample.value;
  if (!Number.isFinite(raw)) return { ok: false, text: '—' };
  if (sample.floor != null) {   // 로그 자료 — 상수 눈금으로 반올림하지 않는다(field-log.js 머리말)
    return logReadout({ scale, raw, floor: sample.floor, cell: cellLabel(resolutionDeg, ko), zeroText, ko });
  }
  const step = sample.step > 0 ? sample.step : 0.5;
  const value = Math.round(raw / step) * step;
  const text = `~${formatValue(scale, value)}`;
  const note = ko ? `${cellLabel(resolutionDeg, true)} 평균 · ${formatValue(scale, step).replace(/^[+−]/, '')} 눈금`
    : `${cellLabel(resolutionDeg, false)} mean · ${formatValue(scale, step).replace(/^[+−]/, '')} steps`;
  return { ok: true, value, text, note, color: bandColor(scale, value) };
};

/** 카드 묶음의 바깥 표시 — main.js 의 lockedNote.body(문자열) 안에서 이 레이어의 카드만 갈아 끼우려고 앞뒤에 표를 단다. */
const cardOpen = (id) => `<div data-field-card="${esc(id)}">`;
const cardClose = (id) => `</div><!--/field-card:${esc(id)}-->`;
/** body 안의 이 레이어 카드를 새 글로 바꾼다. 없으면 body 그대로(다른 카드가 떠 있다 — 건드리지 않는다). */
export const swapFieldCard = (body, id, inner) => {
  if (typeof body !== 'string') return body;
  const a = body.indexOf(cardOpen(id));
  if (a < 0) return body;
  const end = cardClose(id);
  const b = body.indexOf(end, a);
  if (b < 0) return body;
  return body.slice(0, a) + cardOpen(id) + inner + end + body.slice(b + end.length);
};

const pressed = (on) => (on
  ? 'border:1px solid var(--accent);color:var(--accent);background:rgba(120,180,255,0.14);border-radius:8px;font-family:inherit;'
  : 'border:1px solid rgba(120,160,200,0.30);color:inherit;background:none;border-radius:8px;font-family:inherit;');

/**
 * 카드 안쪽 글(순수).  model = { id, desc, scale, info, validMs, status, isoOn, isoChoice, choices, stats, probe, ko }
 * 조작은 실제로 동작하는 것만: 등온선 켬/끔 · 간격 선택. 등치선이 없는 눈금(풍속)은 그 줄이 통째로 없다.
 */
/** 카드에서 **시각을 따라 바뀌는 줄**만: 출처·런·유효 시각 · 상태 · 모델 범위 · 누른 곳. 타임라인이 움직이는 동안 이 덩어리만 갈아 끼운다. */
export const fieldCardLive = (m) => {
  const ko = m.ko !== false;
  const meta = [sourceLabel(m.info)];
  if (m.info && Number.isFinite(m.info.runMs)) meta.push(`${ko ? '런' : 'run'} ${fmtRun(m.info.runMs)}`);
  if (Number.isFinite(m.validMs)) meta.push(`${ko ? '유효' : 'valid'} ${fmtValid(m.validMs, ko)}`);
  const lines = [esc(meta.join(' · '))];
  const st = statusText(m.status, { ko });
  if (st) lines.push(esc(st));
  if (m.stats && Number.isFinite(m.stats.min)) {
    // '이 두 프레임'이라고 적는다 — 화면은 두 프레임 사이를 섞은 값이라 어느 한 프레임의 범위가 아니다.
    lines.push(`${ko ? '모델 범위' : 'Model range'} ${esc(formatValue(m.scale, m.stats.min))} ~ ${esc(formatValue(m.scale, m.stats.max))}`
      + `<span style="opacity:.7"> (${ko ? '이 두 프레임 · 전지구' : 'these two frames · global'})</span>`);
  }
  if (m.probe) {
    lines.push(`${ko ? '누른 곳' : 'Picked'} ${esc(fmtPoint(m.probe.lat, m.probe.lon))} — <b>${esc(m.probe.text)}</b>`
      + `${m.probe.note ? `<span style="opacity:.8"> · ${esc(m.probe.note)}</span>` : ''}`);
  }
  return lines.join('<br/>');
};

export const fieldCardInner = (m) => {
  const ko = m.ko !== false;
  const L = (o) => (o ? (o[ko ? 'ko' : 'en'] || o.ko || '') : '');
  const unit = m.scale.unit;
  const lines = [];
  // 칸 수는 **칠하는 칸**만 센다 — 강수는 경계 8 + 1 = 9칸이지만 맨 아래(0.1 mm/h 미만)는 칠하지 않아 화면에도 범례에도 8칸이다.
  const painted = m.scale.alpha.filter((a) => a > 0).length;
  lines.push(`<b>${esc(L(m.desc.title))}</b> — ${ko
    ? `${painted}단 구간색입니다. 색 사이를 섞지 않습니다 — 색 경계 = 범례 경계 = 등치선 값.`
    : `${painted} solid bands. Colours are never blended — band edge = legend edge = isoline value.`}`);
  lines.push(`<span data-field-live>${fieldCardLive(m)}</span>`);
  const btn = (action, data, on, text) => `<button data-action="${action}" data-layer="${esc(m.id)}" ${data} aria-pressed="${on ? 'true' : 'false'}" style="${pressed(on)}">${esc(text)}</button>`;
  // 등치선이 있는 눈금이면 켬/끔은 늘 낸다. 간격 단추는 **선택지가 둘 이상일 때만** — 기압은 4 hPa 하나뿐이라
  // 단추가 없고 굵은 선 간격만 글자로 적힌다(선택지가 하나면 단추로 가장하지 않는다 · 지시서 W3 '죽은 토글 금지').
  if (m.scale.isolines) {
    const steps = (m.choices || []).map((c) => btn('field-iso-step', `data-choice="${esc(c)}"`, m.isoOn && m.isoChoice === c, `${c}${unit}`)).join('');
    const spec = isolineSpec(m.scale, m.isoChoice);
    const every = spec && spec.interval ? (ko ? ` ${spec.interval}${unit} 마다` : ` every ${spec.interval}${unit}`) : '';
    // 간격이 고르지 않은 눈금은 그을 값을 글자로 적는다('10 mm/h 이상') — 선이 무엇을 두르고 있는지 색 없이도 읽힌다.
    const only = (spec && !spec.interval && spec.levels && spec.levels.length)
      ? (ko ? ` · ${spec.levels.map((v) => labelText(m.scale, v)).join(' · ')} 이상` : ` · at ${spec.levels.map((v) => labelText(m.scale, v)).join(' · ')} and above`)
      : '';
    const major = spec && spec.majorEvery ? (ko ? ` · ${spec.majorEvery}${unit} 마다 굵은 선과 숫자` : ` · bold line and number every ${spec.majorEvery}${unit}`) : '';
    lines.push(`<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px">${esc(L(m.desc.isoName))} `
      + btn('field-iso', `data-set="${m.isoOn ? 'off' : 'on'}"`, m.isoOn, m.isoOn ? (ko ? '켬' : 'On') : (ko ? '끔' : 'Off'))
      + `${steps}</span><span style="opacity:.8">${ko ? '흰 선' : 'White lines'}${steps ? '' : every}${major}${only}</span>`);
  }
  // H/L 기호 — descriptor 에 symbols 훅이 있는 레이어(기압)에만. 글은 field-symbols.js 가 만든다(로직을 여기 두지 않는다).
  if (m.symbolName) lines.push(symbolCardRow(m, btn));
  lines.push(ko
    ? `이 색면은 <b>관측이 아니라 수치예보 모델값</b>입니다 — ${esc(cellLabel(m.info && m.info.resolutionDeg, true))} 한 칸의 평균이라 도시·지점의 값과 다를 수 있습니다.`
    : `This field is <b>model output, not observation</b> — a ${esc(cellLabel(m.info && m.info.resolutionDeg, false))} cell mean that can differ from a city or station value.`);
  lines.push(ko
    ? '타임라인을 밀면 5일 예보가 3시간 간격 프레임 사이를 값으로 이어 움직입니다. 지구를 누르면 그 자리의 모델값을 범례 아래에 적습니다(네트워크 조회 없음).'
    : 'Drag the timeline: the 5-day forecast moves by value-blending 3-hourly frames. Tap the globe to read the model value there (no network request).');
  return lines.join('<br/>');
};

export const fieldCardHtml = (m) => cardOpen(m.id) + fieldCardInner(m) + cardClose(m.id);

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  레이어
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * new FieldLayer(descriptor, deps)
 *   deps: { frames, timeBus, legend, parent, terrain, geometry, heightAt, getExagger, isPhone, doc, onCard, getLang,
 *           segments, makeLabelTexture, setInterval, clearInterval, now }
 *     frames · timeBus · legend  없으면 앱이 나눠 쓰는 하나(sharedGfsFrames · timeBus · fieldLegend)
 *     parent    그릴 것을 붙일 THREE.Group(LiveLayers.group) · terrain·geometry  지구의 uniform 묶음과 지오메트리(field-renderer.js 머리말)
 *     onCard    (swap) => void — 카드 글이 바뀌면 부른다. swap(body) 는 body 안의 이 레이어 카드만 새 글로 바꾼 문자열을 돌려준다.
 */
export class FieldLayer {
  constructor(descriptor, deps = {}) {
    this.desc = descriptor;
    this.id = descriptor.layerId;
    this.deps = deps;
    this.frames = deps.frames || sharedGfsFrames();
    this.timeBus = deps.timeBus || sharedTimeBus;
    this.legend = deps.legend || sharedLegend;
    this.scale = scaleOf(descriptor.scaleId);
    if (!this.scale) throw new RangeError(`field-layer: 눈금표에 '${descriptor.scaleId}' 가 없다`);
    const spec0 = isolineSpec(this.scale);
    // 단추로 낼 간격 — descriptor 가 바란 것 중 눈금표에 실제로 있는 것만(없는 선택지를 그리지 않는다).
    this.choices = spec0 && spec0.choices ? (descriptor.isolineChoices || []).filter((c) => spec0.choices.includes(c)) : [];
    this.isoOn = !!spec0;
    this.isoChoice = spec0 ? spec0.choice : null;
    this.active = false;
    this.gen = 0;          // on/off 세대 — 늦게 온 응답이 꺼진 레이어를 되살리지 않게
    this.req = 0;          // 프레임 요청 번호 — 타임라인을 빨리 밀 때 옛 응답이 새 그림을 덮지 않게
    this.key = null;       // 지금 물려 있는 두 프레임 'a|b'
    this.status = { kind: 'idle' };
    this.stats = null;
    this.probePoint = null;
    this.renderer = null;
    this.labels = null;
    this.symbols = null;   // descriptor.symbols 가 있는 레이어(기압)만 — field-symbols.js
    this.symbolsOn = !!descriptor.symbols;
    this.group = null;
    this.thin = null;
    this.unsubTime = null;
    this.unsubSwap = null;
    this.reloadTimer = null;
    this.firstTimer = null;
    this.firstDone = null;
    this.lastInner = null;  // 마지막으로 내보낸 카드 글 · 단추 모양 — 같으면 DOM 을 건드리지 않는다
    this.lastShape = null;
    this.lastLoadAt = 0;
    this.requests = 0;     // 새 키프레임을 청한 횟수(시험·콘솔 확인용)
  }

  get ko() { const g = this.deps.getLang; return (g ? g() : i18n.lang) !== 'en'; }

  get object() { this.ensureObjects(); return this.group; }

  ensureObjects() {
    if (this.group) return;
    const d = this.deps;
    this.renderer = new FieldRenderer({
      scale: this.scale, mode: this.desc.mode, mask: this.desc.mask, transfer: this.desc.transfer || 'linear',
      terrain: d.terrain || null, geometry: d.geometry || null, segments: d.segments,
    });
    this.labels = new FieldLabels({
      maxFront: d.isPhone ? FIELD_LABEL_CAP.phone : FIELD_LABEL_CAP.desktop,
      heightAt: d.heightAt || null, getExagger: d.getExagger || null,
      ...(d.makeLabelTexture ? { makeTexture: d.makeLabelTexture } : {}),
    });
    // H/L 기호(기압) — descriptor 의 훅 하나로 붙는다. 기온·풍속은 이 줄을 지나가지 않는다.
    if (this.desc.symbols === 'pressureCenters') {
      this.symbols = new FieldSymbols({
        scale: this.scale, cap: d.isPhone ? SYMBOL_CAP.phone : SYMBOL_CAP.desktop,
        heightAt: d.heightAt || null, getExagger: d.getExagger || null,
        ...(d.makeSymbolTexture ? { makeTexture: d.makeSymbolTexture } : {}),
      });
      this.symbols.setEnabled(this.symbolsOn);
    }
    // 라벨의 지평선 흐림·앞 반구 상한은 색면이 그려지기 직전에 돈다 — main.js 의 프레임 루프에 줄을 더하지 않는다.
    this.renderer.onFrame = (camera) => {
      if (this.labels.group.visible) this.labels.tick(camera);
      if (this.symbols && this.symbols.group.visible) this.symbols.tick(camera);
    };
    this.group = new THREE.Group();
    this.group.add(this.renderer.mesh);
    this.group.add(this.labels.group);
    if (this.symbols) this.group.add(this.symbols.group);
    this.labels.group.visible = false;
    if (d.parent && d.parent.add) d.parent.add(this.group);
  }

  // 왜 못 그리나 — 그릴 수 있으면 null. 그라데이션으로 물러나지 않는다: 이유를 말하고 끝낸다.
  unavailableReason() {
    const f = this.frames;
    if (!f.loaded) return 'NO_MANIFEST';
    if (!f.has(this.desc.fieldId)) return 'NO_FIELD';
    const spec = f.fieldSpec(this.desc.fieldId);
    const need = this.desc.mode === 'magnitudeRG' ? 2 : 1;
    if (!spec.decodable || !spec.channels || spec.channels.length < need) return 'NO_DECODE';
    // 디코드 식은 descriptor 가 바란 것과 매니페스트가 실은 것이 **같아야** 한다. 다르면 셰이더가 다른 식으로 풀어
    // 조용히 틀린 값을 칠한다 — 그리지 않고 이유를 말한다(인코더가 바뀌면 여기서 걸린다).
    const want = this.desc.transfer || 'linear';
    if (spec.channels.slice(0, need).some((c) => c.transfer !== want)) return 'NO_DECODE';
    return null;
  }

  applyFieldSpec() {
    const spec = this.frames.fieldSpec(this.desc.fieldId);
    this.renderer.setField({ channels: spec.channels, uv: this.frames.uvTransform(this.desc.fieldId), grid: spec.grid });
    this.renderer.setIsolines(isolineSpec(this.scale, this.isoChoice), this.isoOn);
    // 기호도 같은 디코드 상수를 쓴다 — 이 저장소 어디에도 870·940 을 적지 않는다(매니페스트가 정본이다).
    if (this.symbols) this.symbols.decode = spec.channels[0];
    this.spec = spec;
  }

  /** 켠다. → { on:true } | { on:false, error:'자료 없음 — 이유' }. 첫 두 프레임이 물릴 때까지(또는 못 받는다고 판정될 때까지) 기다린다. */
  async on() {
    if (this.active) return { on: true };
    this.active = true;
    const gen = ++this.gen;
    this.status = { kind: 'loading' };
    try { await this.frames.load(); } catch (e) { /* load 는 던지지 않는다 — 가짜 저장소가 던져도 아래에서 '없음'으로 읽힌다 */ }
    this.lastLoadAt = this.nowMs();
    if (gen !== this.gen) return { on: false };               // 받는 사이 꺼졌다
    const why = this.unavailableReason();
    if (why) return this.fail(why);
    this.ensureObjects();
    this.applyFieldSpec();
    this.unsubSwap = this.frames.onSwap(() => this.onSwap());
    const first = new Promise((resolve) => { this.firstDone = resolve; });
    const setT = this.deps.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    if (setT) {
      this.firstTimer = setT(() => {
        this.firstTimer = null;
        if (gen !== this.gen || !this.firstDone) return;
        this.req += 1;                                        // 뒤늦게 오는 것은 버린다 — 이미 '못 받았다'고 말했다
        this.status = { kind: 'nodata', reason: 'FRAME_FAILED' };
        this.settleFirst();
      }, this.deps.firstFrameTimeoutMs || FIELD_FIRST_FRAME_TIMEOUT_MS);
    }
    this.unsubTime = this.timeBus.on(() => this.onTime());    // 듣기 시작하면 지금 시각으로 바로 한 번 부른다(time-bus.js)
    const setI = this.deps.setInterval || (typeof setInterval === 'function' ? setInterval : null);
    if (setI) this.reloadTimer = setI(() => this.reloadIfStale(), FIELD_MANIFEST_RELOAD_MS);
    await first;
    if (gen !== this.gen) return { on: false };
    if (this.status.kind === 'nodata') return this.fail(this.status.reason);
    return { on: true };
  }

  fail(reason) {
    this.off();
    this.status = { kind: 'nodata', reason };
    return { on: false, error: statusText(this.status, { ko: this.ko }) };
  }

  /** 끈다. 구독을 풀고 범례를 감추고 라벨을 치운다. 이 뒤로는 시간 버스가 불러도 아무것도 하지 않는다. */
  off() {
    this.active = false;
    this.gen += 1;
    this.req += 1;
    if (this.unsubTime) { this.unsubTime(); this.unsubTime = null; }
    if (this.unsubSwap) { this.unsubSwap(); this.unsubSwap = null; }
    if (this.reloadTimer != null) {
      const clr = this.deps.clearInterval || (typeof clearInterval === 'function' ? clearInterval : null);
      if (clr) clr(this.reloadTimer);
      this.reloadTimer = null;
    }
    this.settleFirst();
    if (this.renderer) this.renderer.setVisible(false);
    if (this.labels) { this.labels.clear(); this.labels.group.visible = false; }
    if (this.symbols) this.symbols.clear();                   // 스프라이트·짝·키를 비운다(텍스처는 돌려쓰려고 남긴다)
    // 범례는 앱에 하나다 — **내 것일 때만** 물러난다. 남은 주인(바람 입자 등)이 있으면 그쪽 범례가 바로 돌아온다.
    if (this.legend.release) this.legend.release(`field:${this.id}`); else this.legend.hide();
    this.key = null;
    this.probePoint = null;
    this.lastInner = null;
    this.lastShape = null;
    this.status = { kind: 'idle' };
  }

  nowMs() { return this.deps.now ? this.deps.now() : Date.now(); }

  reloadIfStale() {
    if (!this.active) return;
    this.lastLoadAt = this.nowMs();
    Promise.resolve(this.frames.load()).catch(() => {});      // 세대가 바뀌었으면 onSwap 이 온다
  }

  onSwap() {
    if (!this.active) return;
    this.key = null;                                          // 쥐고 있던 텍스처는 옛 세대의 것이다 — 다시 청한다
    const why = this.unavailableReason();
    if (why) { this.setStatus({ kind: 'nodata', reason: why }); this.hideDrawing(); return; }
    this.applyFieldSpec();
    this.onTime();
  }

  hideDrawing() {
    if (this.renderer) this.renderer.setVisible(false);
    if (this.labels) this.labels.group.visible = false;
    if (this.symbols) this.symbols.setVisible(false);
  }

  settleFirst() {
    if (this.firstTimer != null) {
      const clr = this.deps.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null);
      if (clr) clr(this.firstTimer);
      this.firstTimer = null;
    }
    if (this.firstDone) { const f = this.firstDone; this.firstDone = null; f(); }
  }

  // 시간 버스가 부른다. 같은 두 프레임 사이면 섞는 비율만 바꾼다(재생 중 하는 일은 이것뿐이다).
  onTime() {
    if (!this.active) return;                                 // 꺼진 레이어는 프레임을 받지 않는다
    const id = this.desc.fieldId;
    const tMs = this.timeBus.validMs();
    const list = this.frames.framesFor(id);
    const br = this.frames.bracket(id, tMs);
    if (!br || br.outOfRange) {
      this.req += 1;                                          // 오고 있는 프레임이 있어도 그리지 않는다
      this.hideDrawing();
      this.setStatus(fieldStatusOf({ br, frames: list }));
      this.settleFirst();
      return;
    }
    const key = `${br.a.h}|${br.b.h}`;
    if (key === this.key) {
      // 같은 키프레임. 텍스처를 다시 받아 쓴다 — LRU 에 '방금 썼다'는 표시이기도 하다(gfs-frames.js 머리말). 쫓겨났으면 아래로 내려가 다시 청한다.
      const ta = this.frames.textureNow(id, br.a.h);
      const tb = br.b === br.a ? ta : this.frames.textureNow(id, br.b.h);
      if (ta && tb) {
        this.req += 1;                                        // 다른 구간을 청해 둔 것이 있으면 버린다 — 늦게 와서 지금 그림을 덮지 않게
        this.renderer.setFrames(ta, tb, br.mix);
        if (this.symbols) this.symbols.setMix(br.mix);        // 사이에서는 찾지 않는다 — 대권을 따라 옮길 뿐이다
        this.showDrawing();
        this.setStatus(fieldStatusOf({ br, frames: list }));
        return;
      }
    }
    const req = ++this.req;
    this.requests += 1;
    this.setStatus(fieldStatusOf({ br, loading: true, frames: list }));
    const hours = br.a === br.b ? [br.a.h] : [br.a.h, br.b.h];
    Promise.all(hours.map((h) => this.frames.pixels(id, h))).then((px) => {
      if (req !== this.req || !this.active) return;           // 그 사이 시각이 다른 구간으로 갔거나 꺼졌다
      const ta = this.frames.textureNow(id, br.a.h);
      const tb = br.b === br.a ? ta : this.frames.textureNow(id, br.b.h);
      if (!ta || !tb || px.some((p) => !p)) {
        this.key = null;
        this.hideDrawing();
        this.setStatus({ kind: 'nodata', reason: 'FRAME_FAILED' });
        this.settleFirst();
        return;
      }
      // 받는 동안 같은 구간 안에서 시각이 움직였을 수 있다 — 비율은 지금 시각으로 다시 센다.
      const now = this.frames.bracket(id, this.timeBus.validMs()) || br;
      const mix = (now.a.h === br.a.h && now.b.h === br.b.h) ? now.mix : br.mix;
      this.renderer.setFrames(ta, tb, mix);
      this.key = key;
      this.rebuildLabels(key, px[0], px[1] || null);
      if (this.symbols) {                                     // 키프레임이 바뀔 때만 찾는다(두 프레임 각각) — 그 사이는 setMix
        this.symbols.update(key, px[0], px[1] || px[0],
          { grid: this.spec.grid, hourA: br.a.h, hourB: br.b.h, gapH: br.gapH || 3 });
        this.symbols.setMix(mix);
      }
      this.showDrawing();
      this.setStatus(fieldStatusOf({ br: { ...br, mix }, frames: list }));
      this.settleFirst();
      this.prefetchAfter(br.b);
    }).catch(() => {
      if (req !== this.req || !this.active) return;
      this.key = null;
      this.hideDrawing();
      this.setStatus({ kind: 'nodata', reason: 'FRAME_FAILED' });
      this.settleFirst();
    });
  }

  showDrawing() {
    this.renderer.setVisible(true);
    this.labels.group.visible = this.isoOn;                   // 라벨은 등치선의 숫자다 — 선을 끄면 같이 꺼진다
    if (this.symbols) this.symbols.setVisible(true);          // 기호는 제 토글을 따른다(등압선과 별개다)
  }

  // 재생이 다음 구간으로 넘어갈 때 끊기지 않게 한 장 앞을 받아 둔다(프레임은 immutable 이라 HTTP 캐시에도 남는다).
  prefetchAfter(frame) {
    const list = this.frames.framesFor(this.desc.fieldId);
    const at = list.indexOf(frame);
    const next = at >= 0 ? list[at + 1] : null;
    if (next) Promise.resolve(this.frames.pixels(this.desc.fieldId, next.h)).catch(() => {});
  }

  // 키프레임이 바뀔 때만 온다(onTime 의 같은-키 길은 여기 오지 않는다). 2° 로 솎아 주 레벨의 라벨 자리를 다시 찾는다.
  rebuildLabels(key, pxA, pxB) {
    const spec = this.spec;
    this.labels.update(key, () => {
      this.thin = thinField({ pxA, pxB, channels: spec.channels, grid: spec.grid, mode: this.desc.mode }, this.thin);
      // ⚠️ 카드의 '모델 범위'는 라벨용으로 2° 로 솎은 격자의 **두 프레임 가운데 값** 범위였다 — 화면에 칠한 값이 아니다.
      //    운영 프레임 실측(2026-09-20 반박 검증): 카드 42.3 °C vs 실제 44.0 °C. 가장 더운 곳을 누르면 카드의 최댓값보다 높았다.
      //    전 해상도 CPU 사본의 바이트 min/max 에서 두 프레임 각각의 범위를 셈한다(720×361 두 장에 1 ms 안 · 키프레임에만).
      this.stats = fullRangeOf(pxA, pxB, spec.channels, this.desc.mode);
      const iso = isolineSpec(this.scale, this.isoChoice);
      const levels = labelLevels(iso, this.thin.min, this.thin.max);
      const cap = (this.deps.isPhone ? FIELD_LABEL_CAP.phone : FIELD_LABEL_CAP.desktop) * 2;
      return pickLabelSpots(this.thin, levels, { maxTotal: cap, shift: halfStepOf(spec.channels, this.desc.mode) })
        .map((s) => ({ lat: s.lat, lon: s.lon, level: s.level, text: labelText(this.scale, s.level) }));
    });
  }

  setStatus(st) {
    this.status = st;
    this.publish();
  }

  // ---------------------------------------------------------------- 조작

  /** 카드의 단추. 돌려주는 것이 참이면 이 레이어의 것이었다. */
  handleAction(action, ds = {}) {
    if (ds.layer && ds.layer !== this.id) return false;
    if (action === 'field-iso') {
      this.isoOn = ds.set ? ds.set === 'on' : !this.isoOn;
    } else if (action === 'field-iso-step') {
      if (!this.choices.includes(String(ds.choice))) return false;
      this.isoChoice = String(ds.choice);
      this.isoOn = true;                                      // 간격을 고르는 것은 선을 보겠다는 뜻이다
    } else if (action === 'field-symbols') {
      if (!this.symbols) return false;                        // 기호가 없는 레이어(기온·풍속)에는 이 단추가 없다
      this.symbolsOn = ds.set ? ds.set === 'on' : !this.symbolsOn;
      this.symbols.setEnabled(this.symbolsOn);
      this.publish();
      return true;
    } else return false;
    if (this.renderer) {
      this.renderer.setIsolines(isolineSpec(this.scale, this.isoChoice), this.isoOn);
      if (this.active && this.renderer.mesh.visible) this.labels.group.visible = this.isoOn;
    }
    this.publish();
    return true;
  }

  /** 지구를 눌렀다 — 그 자리의 모델값을 범례와 카드에 적는다. 네트워크 0건. 레이어가 꺼져 있으면 아무것도 하지 않는다. */
  probe(lat, lon) {
    if (!this.active || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    this.probePoint = { lat, lon };
    this.publish();
    return this.readProbe();
  }

  sampleAt(lat, lon) {
    // 범위 밖이면 읽지 않는다. 저장소는 끝 프레임의 값을 outOfRange 표시와 함께 주지만(그 프레임이 캐시에 있을 때), 그 값은 이 시각의 값이 아니다.
    if (this.status.kind === 'outOfRange') return { outOfRange: this.status.side };
    let s = null;
    try { s = this.frames.sampleAt(this.desc.fieldId, this.timeBus.validMs(), lat, lon); } catch (e) { s = null; }
    // 선형은 상수 눈금(0.5 · 0.50196 → 0.5 · 1 → 1), 로그는 눈금 대신 자료의 바닥(floor) — readoutOf 가 그것을 보고 길을 가른다.
    if (s && this.spec && this.spec.channels) Object.assign(s, readTicks(this.spec.channels[0]));
    return s;
  }

  readProbe() {
    if (!this.probePoint) return null;
    const info = this.frames.info ? this.frames.info() : null;
    const r = readoutOf(this.sampleAt(this.probePoint.lat, this.probePoint.lon),
      { scale: this.scale, mode: this.desc.mode, resolutionDeg: info && info.resolutionDeg, zeroText: this.desc.zeroText, ko: this.ko });
    return { ...this.probePoint, ...r };
  }

  /**
   * 지점 값 카드(main.js pointWeather 가 부른다). 레이어가 꺼져 있으면 null — 부른 쪽이 제 길로 간다.
   * → { title, html, badge } · html 은 카드 안쪽 글. 프레임의 CPU 사본에서 읽는다 — 네트워크 호출 0건.
   */
  readoutNote(lat, lon) {
    if (!this.active) return null;
    const ko = this.ko;
    const info = this.frames.info ? this.frames.info() : null;
    const r = readoutOf(this.sampleAt(lat, lon),
      { scale: this.scale, mode: this.desc.mode, resolutionDeg: info && info.resolutionDeg, zeroText: this.desc.zeroText, ko });
    const q = this.desc.quantity[ko ? 'ko' : 'en'];
    const stat = (k, v) => `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
    const meta = [sourceLabel(info)];
    if (info && Number.isFinite(info.runMs)) meta.push(`${ko ? '런' : 'run'} ${fmtRun(info.runMs)}`);
    meta.push(`${ko ? '유효' : 'valid'} ${fmtValid(this.timeBus.validMs(), ko)}`);
    const st = statusText(this.status, { ko, short: true });
    const html = stat(q, r.ok ? r.text : '—') + stat(ko ? '지점' : 'Point', fmtPoint(lat, lon))
      + `<p>${esc(r.ok ? r.note : r.text)}${r.ok ? (ko ? ' — 도시·지점의 관측값이 아닙니다.' : ' — not a city or station observation.') : ''}</p>`
      + `<p>${esc(meta.join(' · '))}${st ? ` · ${esc(st)}` : ''}</p>`
      + `<p style="opacity:.75">${ko ? '화면에 칠해진 프레임에서 읽었습니다 — 네트워크 조회 없음.' : 'Read from the frame on screen — no network request.'}</p>`;
    return { title: ko ? `지점 ${q}(모델 격자값)` : `Point ${q.toLowerCase()} (model grid value)`, html, badge: r.ok ? 'MODEL_SIGNAL' : 'UNAVAILABLE' };
  }

  // ---------------------------------------------------------------- 말하기 (범례 · 카드)

  cardModel(probe = this.active ? this.readProbe() : null) {
    const info = this.frames.info && this.frames.loaded ? this.frames.info() : null;
    const ko = this.ko;
    return {
      id: this.id, desc: this.desc, scale: this.scale, info, ko,
      validMs: this.active ? this.timeBus.validMs() : null,
      status: this.status, isoOn: this.isoOn, isoChoice: this.isoChoice, choices: this.choices,
      stats: this.stats, probe,
      // 기호(기압). 이름이 없으면 카드에 그 줄이 통째로 없다 — 기온·풍속이 그렇다.
      symbolName: this.symbols && this.desc.symbolName ? (this.desc.symbolName[ko ? 'ko' : 'en'] || this.desc.symbolName.ko) : null,
      symbolsOn: this.symbolsOn, symbolReady: this.symbols ? this.symbols.ready : true,
      shown: this.symbols ? this.symbols.shown : null,
    };
  }

  cardHtml() { return fieldCardHtml(this.cardModel()); }

  /** 메뉴 줄의 짧은 상태(LiveLayers.state().note). */
  note() {
    const info = this.frames.info && this.frames.loaded ? this.frames.info() : null;
    const run = info && Number.isFinite(info.runMs) ? ` · ${this.ko ? '런' : 'run'} ${fmtRun(info.runMs)}` : '';
    return `${sourceLabel(info).replace(/^MODEL · /, '')}${run}`;
  }

  publish() {
    if (!this.active) return;
    const ko = this.ko;
    const info = this.frames.info ? this.frames.info() : null;
    const probe = this.readProbe();
    const short = statusText(this.status, { ko, short: true });
    // 범례의 풀이 줄은 하나다. 못 그리는 사정(범위 밖 · 받는 중 · 없음)이 먼저고, 그다음이 누른 곳의 값, 그다음이 '프레임 사이 보간'.
    const blocked = this.status.kind !== 'interp' && this.status.kind !== 'exact';
    const probeLine = probe ? `${ko ? '누른 곳' : 'Picked'} ${fmtPoint(probe.lat, probe.lon)} ${probe.text}${probe.note ? ` · ${probe.note}` : ''}` : '';
    this.legend.show({
      scale: this.scale, title: this.desc.title, source: sourceLabel(info),
      run: info ? info.run : null, valid: this.timeBus.validMs(),
      // 아무 일도 없을 때 비는 한 줄: 자료가 눈금표의 **맨 위 칸을 못 채우면** 그 사실을 말한다(강수율은 30 mm/h 에서 포화 —
      // '≥ 50 mm/h' 칸은 이 자료로 나오지 않는다). 천장은 매니페스트에서 온다(field-log.js topBandNote).
      note: blocked ? short : (probeLine || short || topBandNote(this.scale, this.spec && this.spec.channels && this.spec.channels[0], ko)),
    }, `field:${this.id}`, LEGEND_PRIORITY_FIELD);
    const model = this.cardModel(probe);
    const inner = fieldCardInner(model);
    if (inner === this.lastInner) return;                     // 글자가 그대로면 DOM 도 문자열도 건드리지 않는다
    // 떠 있는 카드를 제자리에서 고친다. 단추의 모양(켬/끔 · 간격)이 그대로면 시각을 따라 바뀌는 덩어리만 갈아 끼운다 —
    // 재생 중(220ms 마다 한 걸음)에 카드를 통째로 갈면 누르려던 단추가 손가락 밑에서 새 것으로 바뀐다.
    const shape = `${this.isoOn}|${this.isoChoice}|${this.symbolsOn}|${ko}`;
    const doc = this.deps.doc || (typeof document !== 'undefined' ? document : null);
    if (doc && doc.querySelectorAll) {
      for (const el of doc.querySelectorAll(`[data-field-card="${this.id}"]`)) {
        const live = shape === this.lastShape && el.querySelector ? el.querySelector('[data-field-live]') : null;
        if (live) live.innerHTML = fieldCardLive(model); else el.innerHTML = inner;
      }
    }
    this.lastInner = inner;
    this.lastShape = shape;
    // 떠 있는 카드의 **원본 문자열**도 같이 바꾼다 — 패널이 다시 그려질 때(renderIntel) 옛 유효 시각이 되살아나지 않게.
    if (this.deps.onCard) this.deps.onCard((body) => swapFieldCard(body, this.id, inner));
  }

  dispose() {
    this.off();
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    if (this.renderer) this.renderer.dispose();
    if (this.labels) this.labels.dispose();
    if (this.symbols) this.symbols.dispose();
    this.renderer = null; this.labels = null; this.symbols = null; this.group = null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  LiveLayers 에 붙이는 자리 — live-layers.js 에는 몇 줄만 두고 로직은 여기 둔다(세 작업이 그 파일을 동시에 고친다).
//  host = LiveLayers 인스턴스. host.layers[id] 의 모양({ on, obj, data, meta, loading })을 지켜 state · card · activeIds · coverage 가 그대로 돈다.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const isFieldLayerId = (id) => Object.prototype.hasOwnProperty.call(FIELD_DESCRIPTORS, id);

const fieldOf = (host, id) => {
  host._fields = host._fields || {};
  if (!host._fields[id]) {
    host._fields[id] = new FieldLayer(FIELD_DESCRIPTORS[id], {
      parent: host.group, heightAt: host.heightAt, getExagger: host.getExagger, ...(host._fieldDeps || {}),
    });
  }
  return host._fields[id];
};

/** LiveLayers.toggle(id) 가 색면 레이어일 때 가는 길. 돌려주는 모양은 toggle 과 같다: { on, badge? , error? }. */
export async function toggleFieldLayer(host, id) {
  const field = fieldOf(host, id);
  const cur = host.layers[id];
  // ⚠️ 색면은 한 번에 하나다. 두 색면(기온 + 풍속)은 같은 반지름 · 같은 renderOrder · 불투명 0.8 이라 나중에 만들어진 쪽이
  //    앞의 것을 덮고, 범례는 하나뿐이라 어느 쪽과도 맞지 않는 색이 화면에 남는다(2026-09-20 반박 검증 · 브라우저 재현).
  //    '켜기'일 때 다른 색면을 먼저 끈다 — 입자(바람)는 색면이 아니라 그대로 흐른다.
  if (!(cur && (cur.on || cur.loading))) {
    for (const other of Object.keys(host._fields || {})) {
      if (other === id) continue;
      const oc = host.layers[other];
      if (!oc || !(oc.on || oc.loading)) continue;
      host._fields[other].off();
      if (oc.loading) delete host.layers[other];
      else { oc.on = false; if (oc.obj) oc.obj.visible = false; }
    }
  }
  if (cur && (cur.on || cur.loading)) {                       // 켜져 있거나 켜는 중 — 끈다(받는 중이던 것은 세대 번호가 버린다)
    field.off();
    if (cur.loading) delete host.layers[id]; else { cur.on = false; if (cur.obj) cur.obj.visible = false; }
    return { on: false };
  }
  const entry = host.layers[id] = { on: false, loading: true, field, data: null };
  const st = await field.on();
  if (host.layers[id] !== entry) return { on: false };        // 그 사이 끄거나 전부 껐다
  if (!st.on) {
    delete host.layers[id];
    return { on: false, error: st.error };                    // 옛 그라데이션으로 물러나지 않는다 — 이유를 말한다
  }
  entry.loading = false;
  entry.on = true;
  entry.obj = field.object;
  entry.obj.visible = true;
  // 카드·짧은 상태는 읽을 때마다 지금 것을 낸다(타임라인을 밀면 유효 시각이 바뀐다).
  entry.meta = { badge: 'MODEL', get note() { return field.note(); }, get cardHtml() { return field.cardHtml(); } };
  return { on: true, badge: 'MODEL' };
}

/** 켜져 있는 색면 레이어(없으면 null). id 를 주면 그 레이어만. */
export const activeField = (host, id = null) => {
  const fields = host._fields || {};
  for (const k of Object.keys(fields)) if ((!id || k === id) && fields[k].active) return fields[k];
  return null;
};

/** 전부 끄기(LiveLayers.clearAll). */
export const clearFieldLayers = (host) => { for (const f of Object.values(host._fields || {})) f.off(); };

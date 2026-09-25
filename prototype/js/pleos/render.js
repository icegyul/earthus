// EARTHUS Pleos — 화면 그리기 (문자열 HTML, 모든 값 escape)
//
// 화면은 두 가지뿐이다.
//   DRIVING_SAFE (DRIVING · RESTRICTED · UNKNOWN): 현재 위치 · 현재 날씨 · 특보·재난 · 길안내 연결
//   PARKED: 7개 도크(지구·날씨·위성·바다·대기·재난·지역) + 패널 + 장소 카드
// ⚠️ 버튼을 그리지 않는 것은 편의일 뿐 안전 경계가 아니다. 실행은 app.js dispatch → guardAction 이 다시 판단한다.
// ⚠️ 무한 애니메이션 없음 (HANDOVER §5). 문구는 고정 문장만 쓴다 (무작위 문구 금지).

import { safetyGateMarkup } from '../safety-gate-ui.js';
import { ACTION } from './actions.js';
import { freshnessLabel } from './freshness.js';

export const DOCKS = Object.freeze([
  { id: 'earth', label: '지구' },
  { id: 'weather', label: '날씨' },
  { id: 'satellite', label: '위성' },
  { id: 'ocean', label: '바다' },
  { id: 'air', label: '대기' },
  { id: 'disaster', label: '재난' },
  { id: 'local', label: '지역' },
]);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NONE = '자료 없음';

const kst = iso => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 9 * 3600_000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} KST`;
};

function sourceLabel(card, ref) {
  const s = (card?.sources || []).find(x => x.id === ref);
  if (s) return s.label;
  if (ref === 'open-meteo') return 'Open-Meteo (모델)';
  return ref || null;
}

/** 값 하나 + 출처 + 시각. 값이 없으면 '자료 없음' 과 그 상태를 적는다. */
function valueLine(label, point, card) {
  if (!point || point.value === null || point.value === undefined) {
    return `<div class="pl-row"><span>${esc(label)}</span><b>${NONE}</b></div>`;
  }
  const at = kst(point.observedAt) || kst(point.validAt);
  const src = sourceLabel(card, point.sourceRef);
  const meta = [src, at ? (point.observedAt ? `관측 ${at}` : `기준 ${at}`) : null, point.dataState !== 'AVAILABLE' ? point.dataState : null]
    .filter(Boolean).join(' · ');
  return `<div class="pl-row"><span>${esc(label)}</span><b>${esc(point.value)}${esc(point.unit || '')}</b>`
    + `<small>${esc(meta || '출처 정보 없음')}</small></div>`;
}

function locationCard(s) {
  const loc = s.location;
  const body = loc
    ? `<b>${esc(s.region?.label || '행정구역 찾지 못함')}</b><small>${esc(`${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)} · 차량 위치${s.region?.approximate ? ' · 행정구역 근사' : ''}`)}</small>`
    : `<b>위치 없음</b><small>차량 위치를 받지 못했습니다</small>`;
  return `<section class="pl-card" data-card="${ACTION.MAP}"><h3>현재 위치</h3>${body}</section>`;
}

function weatherCard(s) {
  if (!s.location) return `<section class="pl-card" data-card="${ACTION.CURRENT_WEATHER}"><h3>현재 날씨</h3><b>${NONE}</b><small>위치가 있어야 조회합니다</small></section>`;
  if (s.loadError) return `<section class="pl-card" data-card="${ACTION.CURRENT_WEATHER}"><h3>현재 날씨</h3><b>연결 실패</b><small>${esc(s.loadError)}</small></section>`;
  const card = s.weather?.card;
  if (!card) return `<section class="pl-card" data-card="${ACTION.CURRENT_WEATHER}"><h3>현재 날씨</h3><b>불러오는 중</b></section>`;
  const c = card.current || {};
  return `<section class="pl-card" data-card="${ACTION.CURRENT_WEATHER}"><h3>현재 날씨</h3>`
    + valueLine('기온', c.temperature, card)
    + valueLine('1시간 강수', c.precipitation60m, card)
    + valueLine('바람', c.windSpeed, card)
    + `</section>`;
}

function warningCard(s, { driving }) {
  const gate = s.weather?.warning?.safety ?? null;
  const f = s.weather?.warning?.freshness ?? null;
  let html = gate
    ? safetyGateMarkup(gate, 'ko', { countryCode: s.countryCode })
    : `<section class="safety-gate safety-gate--unknown" data-safety-status="UNKNOWN"><h4>특보 확인 안 됨</h4><p>${s.location ? '특보 자료를 아직 받지 못했습니다' : '위치가 있어야 특보구역을 대조합니다'}</p></section>`;
  // ⚠️ 운전 중에는 외부 브라우저로 나가는 링크를 그리지 않는다.
  if (driving) html = html.replace(/<a [^>]*>.*?<\/a>/g, '');
  const status = f ? `<small class="pl-fresh" data-freshness="${esc(f.status)}">특보 자료 상태 · ${esc(freshnessLabel(f.status))}${f.observedAt ? ` · ${esc(kst(f.observedAt))}` : ''}</small>` : '';
  return `<section class="pl-card pl-warning" data-card="${ACTION.DISASTER_ALERT}"><h3>특보·재난</h3>${html}${status}</section>`;
}

function directionsCard(s, ctx) {
  const target = s.selectedPlace;
  if (!target) return '';
  if (!ctx.canOpenDirections) {
    return `<section class="pl-card" data-card="${ACTION.DIRECTIONS}"><h3>길안내</h3><b>${esc(target.name || '선택한 장소')}</b><small>차량 길안내 연결 없음</small></section>`;
  }
  return `<section class="pl-card" data-card="${ACTION.DIRECTIONS}"><h3>길안내</h3>`
    + `<button class="pl-btn" data-action="${ACTION.DIRECTIONS}">${esc(target.name || '선택한 장소')}로 길안내</button></section>`;
}

export function renderDriving(s, ctx) {
  const label = s.drivingState === 'UNKNOWN' ? '운전 상태 확인 안 됨 · 간단 화면' : '운전 중 · 간단 화면';
  return `<div class="pl-screen pl-driving" data-product="EARTHUS" data-platform="PLEOS" data-mode="DRIVING_SAFE" data-driving-state="${esc(s.drivingState)}">`
    + `<header class="pl-top"><strong class="pl-brand">EARTHUS</strong><span class="pl-mode">${esc(label)}</span></header>`
    + `<main class="pl-driving-grid">${warningCard(s, { driving: true })}${weatherCard(s)}${locationCard(s)}${directionsCard(s, ctx)}</main>`
    + (s.notice ? `<p class="pl-notice" role="status">${esc(s.notice)}</p>` : '')
    + `</div>`;
}

function hourlyList(card) {
  const rows = (card?.hourly || []).slice(0, 6);
  if (!rows.length) return `<p>${NONE}</p>`;
  return `<div class="pl-hours">${rows.map(r => `<div><span>${esc(kst(r.validAt) || '—')}</span><b>${r.temperature?.value ?? '—'}${esc(r.temperature?.unit || '')}</b><small>${esc(sourceLabel(card, r.temperature?.sourceRef) || '')}</small></div>`).join('')}</div>`;
}

function placeCardHtml(pc, ctx) {
  const src = pc.source?.name ? `${pc.source.name}${pc.source.license ? ` · ${pc.source.license}` : ''}` : '출처 정보 없음';
  const time = pc.observedAt ? `관측 ${kst(pc.observedAt)}` : (pc.referenceAt ? `자료 기준 ${kst(pc.referenceAt)}` : '관측 시각 없음');
  const dir = pc.actions.DIRECTIONS;
  const dirBtn = dir.allowed && ctx.canOpenDirections
    ? `<button class="pl-btn" data-action="${ACTION.DIRECTIONS}">길안내</button>`
    : `<small>${ctx.canOpenDirections ? '길안내 사용할 수 없음' : '차량 길안내 연결 없음'}</small>`;
  return `<section class="pl-place" data-place-id="${esc(pc.id)}">`
    + `<h3>${esc(pc.name || '이름 없음')}</h3>`
    + `<div class="pl-row"><span>분류</span><b>${esc(pc.category || NONE)}</b></div>`
    + `<div class="pl-row"><span>지역</span><b>${esc(pc.region || NONE)}</b></div>`
    + `<div class="pl-row"><span>상태</span><b>${esc(pc.status || NONE)}</b><small>${esc(freshnessLabel(pc.freshness.status))}</small></div>`
    + `<small>${esc(src)} · ${esc(time)}</small>`
    + (pc.context.suppressed ? `<p class="pl-suppressed">안전 정보 우선 · 여가 안내를 표시하지 않습니다</p>` : '')
    + `<div class="pl-actions">${dirBtn}</div></section>`;
}

function panelBody(s, ctx) {
  const card = s.weather?.card;
  switch (s.dock) {
    case 'weather':
      return weatherCard(s)
        + (s.showForecast ? `<section class="pl-card"><h3>시간별 예보</h3>${hourlyList(card)}</section>`
          : `<button class="pl-btn" data-action="${ACTION.FORECAST}">시간별 예보 보기</button>`);
    case 'disaster':
      return warningCard(s, { driving: false });
    case 'air': {
      const a = card?.details?.airQuality;
      return `<section class="pl-card"><h3>대기질</h3>`
        + `<div class="pl-row"><span>등급</span><b>${esc(a?.grade || NONE)}</b><small>${esc(a?.stationName ? `${a.stationName} 측정소${a.stationDistanceKm !== null ? ` · ${a.stationDistanceKm}km` : ''}` : '')}</small></div>`
        + valueLine('PM10', a?.pm10, card) + valueLine('PM2.5', a?.pm25, card) + `</section>`;
    }
    case 'ocean': {
      const w = card?.details?.waves;
      const h = w && Number.isFinite(Number(w.wave_height)) ? `${w.wave_height}m` : NONE;
      return `<section class="pl-card"><h3>바다</h3><div class="pl-row"><span>파고</span><b>${esc(h)}</b><small>${w ? `Open-Meteo Marine${w.time ? ` · 기준 ${esc(w.time)}` : ''}` : ''}</small></div></section>`;
    }
    case 'local': {
      if (s.selectedCard) return placeCardHtml(s.selectedCard, ctx) + `<button class="pl-btn pl-ghost" data-action="LOCAL_DISCOVERY">목록으로</button>`;
      if (!s.places) return `<p>${s.location ? '불러오는 중' : '위치가 있어야 주변 장소를 찾습니다'}</p>`;
      const failed = s.places.sources.filter(x => x.status === 'ERROR').map(x => x.id);
      return `<ul class="pl-list">${s.places.places.map(p => `<li><button data-action="${ACTION.PLACE_DETAIL}" data-arg="${esc(p.id)}"><b>${esc(p.name || '이름 없음')}</b><small>${esc(p.distanceKm)}km · ${esc(p.source?.name || '출처 정보 없음')}</small></button></li>`).join('')}</ul>`
        + (failed.length ? `<small>일부 자료 연결 실패: ${esc(failed.join(', '))}</small>` : '');
    }
    case 'earth':
    case 'satellite':
      return `<section class="pl-card"><h3>${s.dock === 'earth' ? '지구' : '위성 관측'}</h3><p>이 화면에는 아직 연결하지 않았습니다. 웹 EARTHUS 에서 볼 수 있습니다.</p></section>`;
    default:
      return '';
  }
}

export function renderParked(s, ctx) {
  const dock = DOCKS.map(d => `<button class="pl-dock-item${s.dock === d.id ? ' is-active' : ''}" data-action="${ACTION.DOCK_NAVIGATION}" data-arg="${d.id}" aria-pressed="${s.dock === d.id}">${esc(d.label)}</button>`).join('');
  const panel = s.dock ? `<aside class="pl-panel" data-panel="${esc(s.dock)}">${panelBody(s, ctx)}</aside>` : '';
  return `<div class="pl-screen pl-parked" data-product="EARTHUS" data-platform="PLEOS" data-mode="PARKED" data-driving-state="PARKED">`
    + `<header class="pl-top"><strong class="pl-brand">EARTHUS</strong><span class="pl-mode">주차 중</span></header>`
    + `<main class="pl-parked-main"><div class="pl-summary">${warningCard(s, { driving: false })}${locationCard(s)}</div>${panel}</main>`
    + `<nav class="pl-dock" aria-label="EARTHUS">${dock}</nav>`
    + (s.notice ? `<p class="pl-notice" role="status">${esc(s.notice)}</p>` : '')
    + `</div>`;
}

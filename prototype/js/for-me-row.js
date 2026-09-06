// FOR ME 한 줄 — v1·v2 공용 부품 (2026-09-06, docs/V1-V2-UPSELL-MAP-2026-09-06.md 「화면별 삽입 계획」)
//
// 무엇인가
//   어느 메뉴에 있든 "이 현상이 내 위치에 영향을 주는가?" 를 누를 수 있게 하는 버튼 한 줄이다.
//   FOR ME 는 별도 메뉴가 아니라 EARTHUS 전체를 관통하는 공통 기능이다 (PD 원칙).
//   태풍을 보다가 내 위치를 묻고, 해양을 보다가 내 동네를 등록하는 흐름이 여기서 시작된다.
//
// 세 상태 (docs 표 그대로)
//   unset   동네 미설정  → "📍 내 동네 고르기 · 이 태풍이 내 위치에 영향 주는지 알려드립니다"
//   signal  신호 있음    → "⚠️ 강릉 · 영향 가능성 있음 · 언제·왜 → 🔒 EXPLORER"
//   quiet   신호 없음    → "강릉 · 지금은 영향 신호 없음 · 감시 중"
//
// 규율
//   · v1 은 예/아니오(signal)만 판단해 넘긴다. 시간·이유·크기는 v2 가 계산한다.
//   · 무료에서 보이는 것은 "상태"뿐이다. 이 줄에 시각·거리·원인을 쓰지 않는다 (Paywall 원칙).
//   · 이 파일은 Cesium·three 를 모른다. v1(prototype/js)과 v2(prototype/v2-three/js)가 같이 import 한다.
//     배포 경로: /js/for-me-row.js — v2 는 ../../js/for-me-row.js 로 읽는다 (vendor 와 같은 방식).
//   · 개인 식별자는 어디에도 보내지 않는다. 계측 이벤트 이름에는 메뉴 이름만 붙는다.

/* ── 내 동네 저장 — 키는 하나뿐이다 ──────────────────────────
   v2 MY EARTH 가 이미 쓰던 키를 그대로 쓴다 (v2-three/js/main.js:3138).
   earthus.net 한 origin 이라 /(v1) 과 /v2/ 가 같은 localStorage 를 본다.
   형식: { lat, lon, name? }  — name 은 화면 표시용이고 없어도 된다. */
export const MYPLACE_KEY = 'earthus.myplace';

function storage() {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

export function getMyPlace() {
  const ls = storage();
  if (!ls) return null;
  try {
    const p = JSON.parse(ls.getItem(MYPLACE_KEY) || 'null');
    if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return null;
    if (Math.abs(+p.lat) > 90 || Math.abs(+p.lon) > 180) return null;
    return { lat: +p.lat, lon: +p.lon, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : undefined };
  } catch (_) { return null; }
}

/** 동네를 저장한다. overwrite=false 면 이미 고른 동네가 있을 때 건드리지 않는다.
    ⚠️ v1 GPS 가 v2 에서 손으로 고른 동네를 조용히 덮어쓰면 안 된다 — GPS 쪽은 overwrite:false 로 부른다. */
export function setMyPlace(place, { overwrite = true } = {}) {
  const ls = storage();
  if (!ls) return null;
  if (!overwrite && getMyPlace()) return getMyPlace();
  const lat = +place?.lat, lon = +place?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const out = { lat: +lat.toFixed(4), lon: +lon.toFixed(4) };
  if (typeof place.name === 'string' && place.name.trim()) out.name = place.name.trim().slice(0, 40);
  try { ls.setItem(MYPLACE_KEY, JSON.stringify(out)); } catch (_) { /* 저장 못 해도 앱은 돈다 */ }
  return out;
}

/* ── 계측 이름 — 클릭 수가 아니라 깔때기 ─────────────────────
   무엇을 눌렀는지 + 그 뒤 어디까지 갔는지를 단계별로 센다 (PD 정정 2026-09-06).
   서버 RPC(usage_bump) 허용 목록과 **같은 이름**이어야 한다.
   supabase/migrations/20260906_forme_funnel_events.sql 이 이 목록에서 생성된다 —
   tools/v1/test_for_me_row.mjs 가 둘이 같은지 검사한다. */
export const FORME_MENUS = Object.freeze(['cyclone', 'quake', 'tsunami', 'wave', 'weather', 'air', 'search']);
export const FORME_STEPS = Object.freeze(['shown', 'signal', 'clicked', 'v2_opened', 'explorer_cta', 'intelligence_cta']);

/** 허용 이름 전체 — set_location 1개 + 메뉴 7종 × 단계 6개 = 43개 */
export function formeEventNames() {
  const out = ['forme.set_location'];
  for (const m of FORME_MENUS) for (const s of FORME_STEPS) out.push(`forme.${s}.${m}`);
  return out;
}

/** 메뉴 이름이 목록에 있는지. 목록 밖 이름으로 이벤트를 만들지 않는다. */
export function isFormeMenu(kind) { return FORME_MENUS.includes(kind); }

/* ── v1 → v2 이어 세기 ─────────────────────────────────────
   두 앱이 다른 페이지라 클릭과 도착을 잇는 값이 필요하다.
   v1 이 from=forme.<menu> 를 붙여 보내고, v2 가 로드 시 읽어 forme.v2_opened.<menu> 를 찍는다.
   좌표·사람·세션은 넘기지 않는다. 메뉴 이름만 넘긴다. */
export function forMeDeepLink({ kind, id, base = '/v2/' } = {}) {
  const q = new URLSearchParams();
  q.set('tab', 'my');
  if (id) q.set('event', String(id).slice(0, 80));
  if (isFormeMenu(kind)) q.set('from', `forme.${kind}`);
  return `${base}?${q.toString()}`;
}

/** v2 쪽: 주소의 from=forme.<menu> 를 읽는다. 없거나 목록 밖이면 null. */
export function readFromParam(search = globalThis.location?.search || '') {
  const m = /(?:^|[?&])from=forme\.([a-z]+)(?:&|$)/.exec(String(search));
  return m && isFormeMenu(m[1]) ? m[1] : null;
}

/* ── 글자 ─────────────────────────────────────────────────── */
const NOUN = {
  cyclone: ['태풍', 'typhoon'], quake: ['지진', 'earthquake'], tsunami: ['쓰나미', 'tsunami'],
  wave: ['파도', 'wave'], weather: ['날씨', 'weather'], air: ['대기질', 'air quality'], search: ['현상', 'event'],
};

/** 상태 판정. signal 은 호출자가 예/아니오로 넘긴다 (v1 은 그 시트에 있는 자료로만 판단). */
export function forMeState({ place = getMyPlace(), signal = null } = {}) {
  if (!place) return 'unset';
  return signal === true ? 'signal' : 'quiet';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 동네 이름이 없으면 좌표를 짧게 — "37.75N 128.88E" */
export function placeLabel(place) {
  if (!place) return '';
  if (place.name) return place.name;
  return `${Math.abs(place.lat).toFixed(2)}${place.lat >= 0 ? 'N' : 'S'} ${Math.abs(place.lon).toFixed(2)}${place.lon >= 0 ? 'E' : 'W'}`;
}

/** 한 줄의 HTML. 화면 부품이 없는 곳(테스트·서버)에서도 쓸 수 있게 문자열로 만든다.
    ⚠️ 쓰나미 시트는 우리 해석을 한 줄도 넣지 않는 규칙(ui.js:331)이 있어
       호출자가 text 를 직접 넘길 수 있다 ("기관 발표 구역에 포함/미포함"). */
export function forMeRowHtml({ kind, id, signal = null, place = getMyPlace(), ko = true, text = null, href = null } = {}) {
  const state = forMeState({ place, signal });
  const noun = (NOUN[kind] || NOUN.search)[ko ? 0 : 1];
  const link = href || forMeDeepLink({ kind, id });
  let left, right;
  if (state === 'unset') {
    left = ko ? '📍 내 동네 고르기' : '📍 Set my place';
    right = text || (ko ? `이 ${noun}이 내 위치에 영향 주는지 알려드립니다` : `See whether this ${noun} affects your location`);
  } else if (state === 'signal') {
    left = `⚠️ ${esc(placeLabel(place))} · ${text || (ko ? '영향 가능성 있음' : 'possible impact')}`;
    right = ko ? '언제 · 왜 → 🔒 EXPLORER' : 'when · why → 🔒 EXPLORER';
  } else {
    left = `${esc(placeLabel(place))} · ${text || (ko ? '지금은 영향 신호 없음' : 'no impact signal now')}`;
    right = ko ? '감시 중' : 'watching';
  }
  return `<button type="button" class="forme-row forme-${state}" data-forme-kind="${esc(kind || '')}" data-forme-state="${state}" data-forme-href="${esc(link)}">`
    + `<span class="forme-left">${left}</span><span class="forme-right">${right}</span></button>`;
}

/** 한 줄을 실제 DOM 에 붙이고 계측·클릭을 연결한다.
    @param container  붙일 부모 요소
    @param opts       forMeRowHtml 인자
    @param track      (eventName) => void   — usage.track 을 넘긴다. 없으면 세지 않는다.
    @param onPick     동네 미설정 상태에서 눌렀을 때 (동네 고르기 창을 여는 쪽이 넘긴다)
    @param navigate   (href) => void        — 기본은 location.assign */
export function mountForMeRow(container, opts = {}, { track = null, onPick = null, navigate = null } = {}) {
  if (!container || typeof container.insertAdjacentHTML !== 'function') return null;
  const kind = isFormeMenu(opts.kind) ? opts.kind : null;
  container.insertAdjacentHTML('beforeend', forMeRowHtml(opts));
  const el = container.lastElementChild;
  if (!el) return null;
  const state = el.dataset.formeState;
  if (kind && typeof track === 'function') {
    track(`forme.shown.${kind}`);
    if (state === 'signal') track(`forme.signal.${kind}`);
  }
  el.addEventListener('click', () => {
    if (kind && typeof track === 'function') track(`forme.clicked.${kind}`);
    if (state === 'unset' && typeof onPick === 'function') { onPick(kind); return; }
    const href = el.dataset.formeHref;
    if (typeof navigate === 'function') navigate(href);
    else if (globalThis.location) globalThis.location.assign(href);
  });
  return el;
}

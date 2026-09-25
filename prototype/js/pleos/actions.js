// EARTHUS Pleos — 기능 이름 정본 (canonical action registry)
//
// 운전 중 안전 판단에 쓰는 기능 이름은 이 파일 하나에서만 정한다.
// ⚠️ ui_PLEOS 참고 킷(V29/V33)은 같은 기능을 `time-playback`/`satellite_playback`,
//    `local_discovery`/`local_explore` 처럼 서로 다른 이름으로 불렀고, 게이트가 아는 이름과
//    화면이 부르는 이름이 달라 운전 중에 위성 재생·주변 탐색이 그대로 허용됐다 (2026-09-25 확인).
//    그래서 옛 이름은 ALIASES 로만 받아 정본 이름으로 바꾸고, 목록에 없는 이름은 막는다.
//
// 이 파일은 DOM·네트워크·Node 모듈을 쓰지 않는 순수 데이터다. 네이티브 Car App 쪽에서도
// 같은 표를 옮겨 쓸 수 있게 둔다 (docs/pleos/VERIFIED_POLICY.md §3).

export const PLEOS_ACTIONS_VERSION = 'earthus.pleos-actions.v1.0.0';

export const ACTION = Object.freeze({
  MAP: 'MAP',
  CURRENT_WEATHER: 'CURRENT_WEATHER',
  DISASTER_ALERT: 'DISASTER_ALERT',
  DIRECTIONS: 'DIRECTIONS',
  SATELLITE_PLAYBACK: 'SATELLITE_PLAYBACK',
  TIME_PLAYBACK: 'TIME_PLAYBACK',
  LOCAL_DISCOVERY: 'LOCAL_DISCOVERY',
  PLACE_DETAIL: 'PLACE_DETAIL',
  FORECAST: 'FORECAST',
  DOCK_NAVIGATION: 'DOCK_NAVIGATION',
  LAYER_TOGGLE: 'LAYER_TOGGLE',
  RESERVATION: 'RESERVATION',
  COUPON: 'COUPON',
  VIDEO_PLAYBACK: 'VIDEO_PLAYBACK',
  KEYBOARD_SEARCH: 'KEYBOARD_SEARCH',
  COMPLEX_FILTER: 'COMPLEX_FILTER',
  SETTINGS: 'SETTINGS',
});

// 우선순위: 앞쪽이 이긴다. 재난 안전(SAFETY)은 여가·상업보다 항상 먼저다.
export const PRIORITY = Object.freeze([
  'SAFETY',
  'SYSTEM',
  'CURRENT_ENVIRONMENT',
  'USER_SELECTION',
  'LOCAL_DISCOVERY',
  'COMMERCIAL',
]);

// 기능별 정책. drivingAllowed=true 인 것만 운전 중(DRIVING/RESTRICTED/UNKNOWN)에 허용한다.
// requiresCapability 가 있으면 주차 중에도 그 실제 기능(백엔드·딥링크 계약)이 있어야 허용한다.
const policy = (tier, drivingAllowed, extra = {}) => Object.freeze({ tier, drivingAllowed, ...extra });

export const ACTION_POLICY = Object.freeze({
  [ACTION.DISASTER_ALERT]: policy('SAFETY', true),
  [ACTION.MAP]: policy('SYSTEM', true),
  [ACTION.DIRECTIONS]: policy('SYSTEM', true),
  [ACTION.SETTINGS]: policy('SYSTEM', false),
  [ACTION.CURRENT_WEATHER]: policy('CURRENT_ENVIRONMENT', true),
  [ACTION.FORECAST]: policy('CURRENT_ENVIRONMENT', false),
  [ACTION.SATELLITE_PLAYBACK]: policy('CURRENT_ENVIRONMENT', false),
  [ACTION.TIME_PLAYBACK]: policy('CURRENT_ENVIRONMENT', false),
  [ACTION.DOCK_NAVIGATION]: policy('USER_SELECTION', false),
  [ACTION.LAYER_TOGGLE]: policy('USER_SELECTION', false),
  [ACTION.PLACE_DETAIL]: policy('USER_SELECTION', false),
  [ACTION.KEYBOARD_SEARCH]: policy('USER_SELECTION', false),
  [ACTION.COMPLEX_FILTER]: policy('USER_SELECTION', false),
  [ACTION.VIDEO_PLAYBACK]: policy('USER_SELECTION', false),
  [ACTION.LOCAL_DISCOVERY]: policy('LOCAL_DISCOVERY', false),
  // ⚠️ EARTHUS 운영 코드에는 실제 예약·쿠폰 실행이 없다 (HANDOVER-2026-08-22 §0: Decision·예약 실행 SHADOW/BLOCKED).
  //    capability 가 주입되지 않으면 주차 중에도 막는다. 샘플 구현으로 채우지 않는다.
  [ACTION.RESERVATION]: policy('COMMERCIAL', false, { requiresCapability: 'transactions' }),
  [ACTION.COUPON]: policy('COMMERCIAL', false, { requiresCapability: 'transactions' }),
});

// 옛 이름 → 정본 이름. 여기 없는 이름은 등록되지 않은 기능이다.
export const ACTION_ALIASES = Object.freeze({
  map: ACTION.MAP,
  current_weather: ACTION.CURRENT_WEATHER,
  weather: ACTION.CURRENT_WEATHER,
  disaster_alert: ACTION.DISASTER_ALERT,
  directions: ACTION.DIRECTIONS,
  satellite_playback: ACTION.SATELLITE_PLAYBACK,
  'time-playback': ACTION.TIME_PLAYBACK,
  time_playback: ACTION.TIME_PLAYBACK,
  local_discovery: ACTION.LOCAL_DISCOVERY,
  local_explore: ACTION.LOCAL_DISCOVERY,
  deep_detail: ACTION.PLACE_DETAIL,
  forecast: ACTION.FORECAST,
  reservation: ACTION.RESERVATION,
  reservation_flow: ACTION.RESERVATION,
  coupon: ACTION.COUPON,
  video_playback: ACTION.VIDEO_PLAYBACK,
  keyboard_search: ACTION.KEYBOARD_SEARCH,
  complex_filters: ACTION.COMPLEX_FILTER,
  complex_filter: ACTION.COMPLEX_FILTER,
  settings: ACTION.SETTINGS,
});

/** 정본 이름을 돌려준다. 모르는 이름이면 null (호출 쪽이 막아야 한다). */
export function canonicalAction(name) {
  if (typeof name !== 'string' || !name) return null;
  if (Object.prototype.hasOwnProperty.call(ACTION_POLICY, name)) return name;
  const alias = ACTION_ALIASES[name] ?? ACTION_ALIASES[name.toLowerCase()];
  return alias ?? null;
}

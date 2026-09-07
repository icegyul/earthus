// 메뉴가 말하는 범위와 시간축. 지원 범위 밖에서 빈 지구를 정상 결과로 읽지 않게 한다.
const KOREA = new Set(['radar','airq','warn','tempanom','kmasea','khoasl126','khoasl245','khoasl370','khoasl585','khoaflood','wildfire','lightning','discover','bf','wl','en','visitors','related','forestloss']);
const EAST_ASIA = new Set(['cloud-gk2a','cloud-ea','cloud-fog','cloud-wv','cloud-vol','mysky']);
const STATIC = new Set(['terrain','satdetail','forest','forestloss','base-ne2','base-bluemarble','base-night','isobath','trenches','poptower','sculpt','pop','plates','crustal','eqhistory','eqdepth','photos','galaxy','surf','bf','wl','en','visitors','related']);
const MOVING = new Set(['cloud-gfs','tyoff','seoul']);
const EXCLUDED_CLEAR = new Set(['terrain','satdetail','locate','globe','cloud-off','mysky','feed','eq','tc','typhoonsim','marine','solar','photos','galaxy','livemix']);
export function menuCoverage(id, ko = true) {
  if (KOREA.has(id)) return ko ? '한국' : 'Korea';
  if (EAST_ASIA.has(id)) return ko ? '동아시아' : 'East Asia';
  if (id === 'warnworld') return ko ? '미국' : 'United States';
  if (id === 'seoul' || id === 'livemix') return ko ? '서울' : 'Seoul';
  if (id === 'seaice') return ko ? '극지' : 'Polar regions';
  if (id === 'poptower') return ko ? '지원 도시 선택' : 'Supported cities';
  if (id === 'locate' || id === 'marine') return ko ? '선택 지점' : 'Selected point';
  return ko ? '지원 범위는 자료 상세에서 확인' : 'Coverage in data details';
}
export function menuTime(id, ko = true) {
  if (id === 'tyens') return ko ? '전체 예보 구간 · 시간 막대와 별도' : 'Full forecast range, independent of timeline';
  if (id === 'cloud-vol') return ko ? '자료 기준 시각 고정' : 'Dataset time fixed';
  if (MOVING.has(id)) return ko ? '예보 시간축 연결' : 'Forecast timeline';
  if (STATIC.has(id)) return ko ? '자료 기준일 고정' : 'Dataset date fixed';
  return ko ? '각 자료 시각 · 재생 시간과 별도' : 'Source time, independent of playback';
}
export function canClearLayer(id) { return !EXCLUDED_CLEAR.has(id) && !id.startsWith('base-'); }
export function matchesMenu(query, fields) {
  const terms=String(query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack=fields.filter(Boolean).join(' ').toLocaleLowerCase();
  return terms.every(t=>haystack.includes(t));
}
// UI 소유권만 관리한다. 지난 요청은 데이터 캐시에 남아도 마지막 선택의 결과를 덮을 수 없다.
export function createSelectionGate() {
  let revision=0;
  return { next() { const id=++revision; return () => id===revision; }, invalidate() { revision++; } };
}

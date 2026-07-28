// 한국 기상특보 — 지금 내가 있는 곳에 걸린 특보를 알린다
//
// ⚠️ 정직하게 말해야 하는 한계가 둘 있다.
//
//   ① 특보구역의 **경계선은 공개돼 있지 않다.**
//      대신 관측지점마다 특보구역코드가 달려 있어서,
//      **가장 가까운 관측지점의 구역 = 내 구역**으로 본다 (사실상 보로노이 분할).
//      구역 경계 바로 옆에서는 어긋날 수 있으니 화면에 구역 이름을 함께 적는다.
//
//   ② 우리는 기상청이 아니다.
//      실제 대응은 기상청 공식 발표를 따라야 한다. 화면에 그렇게 적는다.
//
// ⚠️ 알림은 **앱이 열려 있을 때만** 뜬다. alarms.js 에 적어둔 것과 같은 제약이다.
//    백그라운드 푸시는 서버(VAPID)가 필요하다.

import { API } from './config.js';
import { i18n } from './i18n.js';
import { myLocation } from './mylocation.js';
import { toast } from './ui.js';

const LS_SEEN = 'earthus.warnSeen';     // 이미 알린 특보 (같은 걸 계속 울리지 않기 위해)
const LS_OFF = 'earthus.warnOff';       // 사용자가 끈 경우

// 한국 대략 범위. 여기 밖이면 이 기능을 아예 켜지 않는다.
// ⚠️ 넉넉하게 잡는다 — 제주 남단(33.1)과 최북단(38.6), 독도(131.9)를 다 포함해야 한다.
const KR = { s: 32.5, n: 39.0, w: 124.0, e: 132.5 };

// 가장 가까운 관측지점을 찾을 최대 거리. 이걸 넘으면 '내 구역'을 못 정한다.
const ZONE_MAX_KM = 60;
const REFRESH_MS = 10 * 60_000;

const inKorea = (lat, lon) =>
  lat >= KR.s && lat <= KR.n && lon >= KR.w && lon <= KR.e;

/** 두 지점 거리(km). 하버사인. */
function distKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const warn = {
  data: null,
  mine: [],            // 내 위치 기준 가까운 순
  off: localStorage.getItem(LS_OFF) === '1',
  _timer: null,

  /**
   * ⚠️ **한국에 있을 때만** 받는다.
   *    특보 자료는 실황 107KB + 구역표 64KB = 171KB 다.
   *    앱을 켜는 사람 대부분은 한국 밖에 있고, 그들에게는 쓸 일이 없는 자료다.
   *    (한국탭 '특보' 탭을 직접 열면 그때 refresh() 가 따로 받는다.)
   *
   * ⚠️ 위치는 앱이 뜬 뒤 몇 초 지나 도착한다. 그래서 여기서 한 번 보고 끝내지 않고,
   *    main.js 가 위치를 받은 뒤 warn.recheck() 를 부를 때 다시 판단하게 한다.
   */
  async init() {
    await this.maybeStart();
    return this;
  },

  /** 한국 안이면 받기 시작한다. 이미 시작했으면 아무것도 하지 않는다. */
  async maybeStart() {
    if (this._timer) return true;
    const c = myLocation.coords;
    if (!c || !inKorea(c.lat, c.lon)) return false;
    await this.refresh();
    // 특보는 자주 바뀐다. 열어둔 채로도 갱신되게 한다.
    this._timer = setInterval(() => this.refresh(), REFRESH_MS);
    return true;
  },

  async refresh() {
    try {
      // 지점→구역 표는 하루에 한 번만 바뀐다. 한 번 받아두고 다시 안 받는다.
      if (!this._zones) {
        this._zones = await fetch(`${API.EVENTS}/kma-warn-stations.json`)
          .then(r => (r.ok ? r.json() : null)).catch(() => null);
      }
      const r = await fetch(`${API.EVENTS}/kma-warn.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.data = await r.json();
    } catch (e) {
      // ⚠️ 조용히 넘어간다. 특보를 못 받았다고 지구본이 안 돌 이유는 없다.
      console.warn('[특보] 못 받음 —', e.message);
      return;
    }
    this.recheck();
  },

  /**
   * 자료는 그대로 두고 **내 위치만 다시 맞춰본다.**
   *
   * ⚠️ 왜 따로 필요한가: 앱이 뜰 때 특보를 받는 시점에는 위치 권한 응답이 아직 안 왔다.
   *    그때 계산한 '내 주변'은 빈 채로 굳고, 위치가 몇 초 뒤 도착해도 갱신되지 않는다.
   *    실제로 "내 주변에 특보 없음"이라고 나오는데 2km 앞에 폭염경보가 있었다.
   *    특보에서 이런 거짓 안심은 그냥 버그가 아니라 위험하다.
   */
  recheck() {
    /* ⚠️ 위치가 늦게 도착하면 init() 때는 '한국 밖'이라 안 받았을 수 있다.
       그때 그냥 돌아가면 한국에 있는 사람이 특보를 영영 못 본다. 여기서 다시 시작한다. */
    if (!this.data) { this.maybeStart(); return; }
    this._match();
    this._notify();
    document.dispatchEvent(new CustomEvent('earthus:warn', { detail: this.summary() }));
  },

  /**
   * 내가 **속한 특보구역**의 특보만 고른다.
   *
   * ⚠️ 예전에는 반경 30km 로 골랐다. 그러면 옆 시·군 특보까지 딸려 온다 —
   *    대구에서 달성군·경산시 것까지 14건이 떴다. 내 지역 특보가 아니다.
   *
   * 경계선 자료는 공개돼 있지 않지만, 관측지점마다 특보구역코드가 달려 있다.
   * 그래서 **가장 가까운 관측지점의 구역 = 내 구역**으로 본다 (사실상 보로노이 분할).
   * ⚠️ 구역 평균 좌표로 고르면 안 된다 — 넓은 구역일수록 중심이 멀어져 불리해진다.
   *
   * 상위 구역(도·광역시)에 걸린 특보도 나에게 해당하므로 같이 본다.
   */
  _match() {
    this.mine = [];
    this.zone = null;
    const c = myLocation.coords;
    if (!c || !inKorea(c.lat, c.lon)) return;

    const pts = this._zones?.stations || [];
    let best = null;
    for (const p of pts) {
      const km = distKm(c.lat, c.lon, p.lat, p.lon);
      if (km <= ZONE_MAX_KM && (!best || km < best.km)) best = { ...p, km };
    }
    if (!best) return;                       // 구역을 못 정하면 아무것도 알리지 않는다
    this.zone = { id: best.zone, name: best.zoneName, station: best.name, km: Math.round(best.km) };

    const act = (this.data && this.data.active) || [];
    this.mine = act
      .filter(w => w.regionId === best.zone || w.parentId === best.zone)
      .map(w => ({
        ...w,
        km: (w.lat != null && w.lon != null)
          ? Math.round(distKm(c.lat, c.lon, w.lat, w.lon)) : null,
      }))
      .sort((a, b) => b.levelRank - a.levelRank);
  },

  /** 새로 뜬 것만 한 번 알린다. */
  _notify() {
    if (this.off || !this.mine.length) return;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(LS_SEEN) || '{}'); } catch (_) {}

    const fresh = this.mine.filter(w => seen[`${w.regionId}:${w.kind}`] !== w.issuedKst);
    if (!fresh.length) return;

    // 가장 심한 것 하나만 띄운다. 377건을 다 띄우면 알림이 아니라 소음이다.
    const top = fresh.slice().sort((a, b) => b.levelRank - a.levelRank)[0];
    const ko = i18n.lang === 'ko';
    // ⚠️ 영어에서 등급이 한국어로 새지 않게 한다 (levelEn — 파일 끝 참고)
    toast(ko
      ? `${top.icon} ${top.region} ${top.kind}${top.level}`
      : `${top.icon} ${top.region}: ${top.kindEn || top.kind} ${levelEn(top.level)}`);

    fresh.forEach(w => { seen[`${w.regionId}:${w.kind}`] = w.issuedKst; });
    // ⚠️ 무한정 쌓이면 저장소가 는다. 최근 200건만 남긴다.
    const keys = Object.keys(seen);
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(k => delete seen[k]);
    localStorage.setItem(LS_SEEN, JSON.stringify(seen));
  },

  setOff(v) {
    this.off = !!v;
    localStorage.setItem(LS_OFF, v ? '1' : '0');
  },

  /** 배너·패널이 쓸 요약 */
  summary() {
    const d = this.data;
    if (!d) return { ready: false };
    const c = myLocation.coords;
    return {
      ready: true,
      inKorea: !!(c && inKorea(c.lat, c.lon)),
      zone: this.zone,
      mine: this.mine,
      top: this.mine[0] || null,
      activeCount: d.activeCount,
      kinds: d.kinds,
      observedKst: d.observedKst,
      note: d.note,
    };
  },
};

/* 특보 등급을 영문으로.
 * ⚠️ 기상청 자료에는 kindEn 은 있는데 **levelEn 이 없다**(실측: levelEn = null).
 *    그래서 영어 설정에서 "Heat 주의보" 처럼 섞여 나왔다.
 * ⚠️ 실측으로 확인한 등급은 셋뿐이다: 주의 · 경보 · 중대경보.
 *    표에 없는 값이 오면 **원문을 그대로 돌려준다** — 지어내지 않는다.
 *    (예비특보 같은 것이 새로 들어올 수 있다)
 */
const LEVEL_EN = {
  '주의':     'Advisory',
  '주의보':   'Advisory',
  '경보':     'Warning',
  '중대경보': 'Emergency Warning',
  '예비특보': 'Preliminary',
};
export function levelEn(level) {
  return LEVEL_EN[String(level || '').trim()] || level || '';
}

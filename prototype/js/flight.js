// 내 항공편 — 공항 검색 · 예상 항로 · 실시간 추적
//
// 세 부분이 성격이 다르다. 섞지 않는다.
//
//   1) 공항·항로  — 순수 계산. 공항 좌표(공개 도메인)와 대권항로 공식이면 끝난다.
//                   서버도, 키도, 네트워크도 필요 없다. 항상 정확하다.
//   2) 예약        — 우리는 항공권을 팔지 않는다 (여행업 등록이 필요하다).
//                   제휴 링크로 판매처에 보내고 성사되면 수수료를 받는다.
//   3) 실시간 추적 — **adsb.lol** (ODbL 1.0). CORS 가 막혀 Lambda 프록시를 거친다.
//                   ⚠️ OpenSky 에서 갈아탔다. §4-10 이 "OpenSky 는 비상업용 라이선스라
//                      유료 앱에 사용 불가"라고 명시했는데 그걸 어기고 있었다.
//                      adsb.lol 은 ODbL 이라 상업적 사용이 가능하고, 출처 표기가 조건이다.
//                   덤으로 편명 직접 조회와 **실제 항적**을 얻었다.
//
// ⚠️ 편명(KE081)에서 관제 호출부호(KAL081)를 우리가 추측하지 않는다.
//    공개된 항공사 코드표는 폐업사·변경분이 섞여 금방 낡는다
//    (실제로 널리 쓰이는 데이터셋에서 이미 없어진 항공사 코드를 여럿 확인했다).
//    → adsb.lol 은 호출부호로 색인돼 있어 KAL081 은 바로 맞는다.
//      KE081 처럼 IATA 편명을 넣으면 항로 주변에서 숫자가 같은 것을 걸러낸다.
//      확정 뒤에는 기체 고유주소(hex)로 추적하므로 다른 비행기가 섞일 수 없다.
//
// 자료: OurAirports (공개 도메인 — "All data is released to the Public Domain")
//       adsb.lol (ODbL 1.0) — 출처 표기 의무. 화면에 반드시 띄운다.

import { API } from './config.js';
import { fetchT } from './net.js';
import { CONFIG } from './config.local.js';
import { i18n } from './i18n.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const RE = 6371;                       // km

/* ── 공항 ─────────────────────────────────────────────────────
   [iata, name, city, country, lat, lon, rank]  rank 0=대형 1=중형 2=소형 */
let AIRPORTS = null;
let loading = null;

export async function airports() {
  if (AIRPORTS) return AIRPORTS;
  if (!loading) {
    loading = fetch('data/airports.json')
      .then(r => { if (!r.ok) throw new Error('airports ' + r.status); return r.json(); })
      .then(rows => (AIRPORTS = rows.map(([iata, name, city, cc, lat, lon, rank]) =>
        ({ iata, name, city, cc, lat, lon, rank }))));
  }
  return loading;
}

/** 공항 검색 — IATA 코드가 정확히 맞으면 최우선, 그다음 도시·이름 */
export function search(list, q, limit = 8) {
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  const out = [];
  for (const a of list) {
    const iata = a.iata.toLowerCase();
    let score;
    if (iata === s) score = 0;
    else if (a.city.toLowerCase().startsWith(s)) score = 1;
    else if (a.name.toLowerCase().startsWith(s)) score = 2;
    else if (a.city.toLowerCase().includes(s)) score = 3;
    else if (a.name.toLowerCase().includes(s)) score = 4;
    else continue;
    out.push({ a, score: score * 10 + a.rank });
  }
  out.sort((x, y) => x.score - y.score);
  return out.slice(0, limit).map(x => x.a);
}

export const byIata = (list, code) =>
  list.find(a => a.iata === String(code || '').toUpperCase()) || null;

/* ── 대권항로 ──────────────────────────────────────────────────
   비행기는 지도 위 직선이 아니라 지구 위 최단거리(대권)를 따라간다.
   메르카토르 지도에서 휘어 보이는 그 선이다. Cesium 지구본에서는 그냥 직선으로 보인다.

   ⚠️ 실제 항로는 대권과 다르다. 제트기류·영공·항로점(waypoint)·ETOPS 때문이다.
      그래서 UI 에서 "예상"이라고 쓴다. 실제 위치는 추적에서 따로 보여준다. */
export function greatCircle(from, to, n = 128) {
  const φ1 = from.lat * D2R, λ1 = from.lon * D2R;
  const φ2 = to.lat * D2R,   λ2 = to.lon * D2R;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (!Number.isFinite(d) || d === 0) return [{ ...from }, { ...to }];

  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push({ lat: Math.atan2(z, Math.hypot(x, y)) * R2D, lon: Math.atan2(y, x) * R2D });
  }
  return pts;
}

/** 대권 거리 (km) */
export function distanceKm(a, b) {
  const φ1 = a.lat * D2R, φ2 = b.lat * D2R;
  const dφ = φ2 - φ1, dλ = (b.lon - a.lon) * D2R;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 순항 속도로 어림한 비행 시간.
    ⚠️ 어디까지나 어림이다 — 실제는 바람·활주 대기·항로 우회로 달라진다. */
export function roughDuration(km) {
  const CRUISE = 860;                  // km/h, 대형기 순항 대지속도의 대표값
  const GROUND = 0.6;                  // 이·착륙·활주 여유 (시간)
  const h = km / CRUISE + GROUND;
  return { hours: Math.floor(h), minutes: Math.round((h % 1) * 60) };
}

/** 항로상 진행률 0~1 — 현재 위치가 어디쯤인지 */
export function progressAlong(from, to, at) {
  const total = distanceKm(from, to);
  if (total < 1) return 0;
  const done = distanceKm(from, at);
  return Math.max(0, Math.min(1, done / total));
}

/* ── 실시간 추적 ──────────────────────────────────────────────── */

export const tracker = {
  flight: null,        // { from, to, num, callsign, hex }
  state: null,         // 마지막 위치
  trace: null,         // 실제 항적
  error: null,
  attribution: null,   // ODbL 출처 표기 — 화면에 반드시 띄운다
  _timer: null,
  _subs: [],

  onChange(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; },
  emit() { this._subs.forEach(f => f(this)); },

  async _get(params) {
    if (!API.FLIGHT) throw new Error('FLIGHT_PROXY_NOT_CONFIGURED');
    const u = new URL(API.FLIGHT);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetchT(u, { cache: 'no-cache' });
    let j;
    try { j = await r.json(); } catch { throw new Error('bad response ' + r.status); }
    if (!r.ok) throw new Error(j.throttled ? 'THROTTLED' : (j.error || 'request failed'));
    if (j.attribution) this.attribution = j.attribution;
    return j;
  },

  /**
   * 편명으로 항공기를 찾는다.
   * ⚠️ OpenSky 때는 후보를 여러 개 보여주고 사용자가 고르게 했다.
   *    adsb.lol 은 호출부호로 직접 색인돼 있어 바로 맞는다 — 그 절차가 사라졌다.
   *    다만 IATA 편명(KE081)을 넣으면 숫자 대조로 찾으므로 여러 개가 나올 수 있다.
   */
  async find(num, near) {
    const p = { mode: 'find', num };
    if (near) { p.lat = near.lat; p.lon = near.lon; p.dist = 600; }
    const j = await this._get(p);
    return j.aircraft || [];
  },

  /** 이 기체를 내 항공편으로 확정하고 추적을 시작한다 */
  async start(flight) {
    this.stop();
    this.flight = flight;
    this.error = null;
    await Promise.allSettled([this.poll(), this.loadTrace()]);
    /* 30초 간격.
       ⚠️ OpenSky 때는 크레딧(400/일) 때문에 90초였다. adsb.lol 은 현재 한도가 없어
          더 자주 볼 수 있다. 다만 문서가 "나중에 rate limit 도입 예정"이라고 하므로
          과하게 짧게 두지 않는다. Lambda 응답도 20초 캐시가 걸려 있다. */
    this._timer = setInterval(() => this.poll(), 30_000);
    this.emit();
  },

  stop() { clearInterval(this._timer); this._timer = null; },

  clear() {
    this.stop();
    this.flight = null; this.state = null; this.trace = null; this.error = null;
    this.emit();
  },

  async poll() {
    if (!this.flight?.hex) return;
    try {
      const j = await this._get({ mode: 'track', hex: this.flight.hex });
      /* ⚠️ state 가 null 로 오는 건 오류가 아니다.
         착륙했거나 수신 범위 밖(대양 한가운데)이거나 트랜스폰더가 꺼진 것이다.
         마지막 위치는 지우지 않고 "몇 분 전 위치"로 남긴다. */
      if (j.state) { this.state = j.state; this.error = null; }
      else this.error = 'NO_SIGNAL';
    } catch (e) {
      this.error = e.message;
    }
    this.emit();
  },

  /** 전체 항적. 자주 안 바뀌므로 따로 불러 캐시한다. */
  async loadTrace() {
    if (!this.flight?.hex) return;
    try {
      const j = await this._get({ mode: 'trace', hex: this.flight.hex });
      this.trace = j.trace || null;
      this.traceMeta = { points: j.points, raw: j.rawPoints, reg: j.reg, type: j.type };
    } catch (e) {
      console.warn('[trace]', e.message);
      this.trace = null;
    }
    this.emit();
  },

  /** 마지막 수신으로부터 몇 분 지났나 */
  ageMin() {
    const s = this.state?.seenPos;
    return s == null ? null : Math.max(0, Math.round(s / 60));
  },
};

/* ── 예약 연결 (제휴 수수료 모델) ──────────────────────────────
   두 가지를 구분해야 한다. 섞으면 규제가 완전히 달라진다.

     ✅ 제휴(affiliate) 송출 — 우리는 링크만 보내고, 사용자는 판매처에서 결제한다.
        성사되면 판매처가 우리에게 수수료를 준다.
        여행업 등록도, 결제 대행 계약도, PCI-DSS 도 필요 없다.
        우리는 돈을 받지도 보관하지도 않기 때문이다. 이게 지금 모델이다.

     ❌ 직접 판매 — 우리 화면에서 결제를 받고 발권한다.
        국내에서는 여행업 등록(관광진흥법)과 PG 계약이 필요하다. 하지 않는다.

   ⚠️ 제휴라도 지켜야 하는 것
     · 제휴 링크임을 표시해야 한다 (표시광고법 / FTC 모두 요구).
       "이 링크로 예약하면 수수료를 받습니다"를 UI 에 쓴다.
     · 수수료 때문에 순서를 바꾸지 않는다. 요율이 높은 곳을 위로 올리면
       그 순간 사용자에게 손해가 가고, 그건 광고이지 추천이 아니다.
     · 우리는 예약 내용을 받지 않는다 — 받을 이유가 없고, 받으면 개인정보가 된다.

   제휴 ID 는 config.local.js 의 CONFIG.AFFIL 에 넣는다 (git 에 올리지 않는다).
   승인 전에는 값이 비어 있고, 그때는 일반 검색 링크로 나간다 — 동작은 같다. */
export function bookingLinks(from, to, dateISO) {
  const d = (dateISO || '').slice(0, 10);
  const ko = i18n.lang === 'ko';
  const A = CONFIG.AFFIL || {};

  /** 제휴 파라미터를 붙인다. 값이 없으면 그냥 원래 링크. */
  const tag = (url, params) => {
    const entries = Object.entries(params).filter(([, v]) => v);
    if (!entries.length) return { url, affiliate: false };
    const u = new URL(url);
    entries.forEach(([k, v]) => u.searchParams.set(k, v));
    return { url: u.toString(), affiliate: true };
  };

  const out = [];

  /* 스카이스캐너 — 제휴 프로그램 운영 (Partners / Impact 등 네트워크 경유).
     associateid 가 제휴 식별자다. */
  out.push({
    name: ko ? '스카이스캐너' : 'Skyscanner',
    note: ko ? '항공사·여행사 최저가 비교' : 'Compare airlines and agencies',
    ...tag(
      `https://www.skyscanner.co.kr/transport/flights/${from.iata.toLowerCase()}/${to.iata.toLowerCase()}/${d.replace(/-/g, '').slice(2)}/`,
      { associateid: A.skyscanner }),
  });

  /* Kiwi.com — Travelpayouts/Impact 로 제휴 가능. */
  out.push({
    name: 'Kiwi.com',
    note: ko ? '경유 조합까지 찾아주는 검색' : 'Finds mixed-carrier itineraries',
    ...tag(`https://www.kiwi.com/en/search/results/${from.iata}/${to.iata}/${d}`,
      { affilid: A.kiwi }),
  });

  /* 구글 항공권 — 제휴 프로그램이 없다. 수수료가 안 나오지만 비교용으로는 제일 낫다.
     ⚠️ 수수료가 없다고 목록에서 빼지 않는다. 그게 사용자를 위한 순서다. */
  out.push({
    name: ko ? '구글 항공권' : 'Google Flights',
    note: ko ? '가격 추이까지 볼 수 있음 (제휴 아님)' : 'Price trends (not an affiliate)',
    url: `https://www.google.com/travel/flights?q=${encodeURIComponent(
      `Flights from ${from.iata} to ${to.iata} on ${d}`)}`,
    affiliate: false,
  });

  return out;
}

/** 제휴 링크가 하나라도 있나 — UI 가 고지 문구를 띄울지 판단한다 */
export function hasAffiliate() {
  const A = CONFIG.AFFIL || {};
  return !!(A.skyscanner || A.kiwi);
}

// 기상청 동네예보 — 한국 안에서는 이걸 쓴다
//
// 왜 Open-Meteo 대신인가
//   ① 한국 안에서는 기상청이 더 낫다. 5km 격자에 예보관이 손을 댄 **공식 예보**다.
//      Open-Meteo 는 전지구 모델(GFS·ECMWF)을 그대로 뽑은 값이라 한반도 지형이
//      거칠게 반영된다.
//   ② Open-Meteo 무료 API 는 비상업 전용이다(2026-08-02 약관 확인).
//      기상청은 공공누리라 무료이고 조건은 출처 표기뿐이다.
//
// ⚠️ 한국 밖에서는 쓰지 않는다. 동네예보는 한반도 격자만 있다.
// ⚠️ 지점은 ASOS 97곳이다. 사용자 자리의 격자가 아니라 **가장 가까운 지점**이므로
//    화면에 그렇게 적어야 한다. (warn.js 가 특보구역을 정하는 방식과 같은 근사다)

import { API } from './config.js';

const SRC = `${API.WIND}/kma-fcst.json`;

/* 한국 대략 범위 — warn.js·ui-weather.js 와 같은 상자를 쓴다. */
export const inKorea = (lat, lon) =>
  lat != null && lon != null &&
  lat >= 32.5 && lat <= 39.0 && lon >= 124.0 && lon <= 132.5;

/* 하늘상태(SKY) × 강수형태(PTY) → 사람이 읽는 말.
   ⚠️ PTY 가 0 이 아니면 그게 이긴다 — 비가 오는데 "구름많음"이라고 하면 안 된다. */
const SKY_KO = { 1: '맑음', 3: '구름많음', 4: '흐림' };
const SKY_EN = { 1: 'Clear', 3: 'Partly cloudy', 4: 'Cloudy' };
const PTY_KO = { 1: '비', 2: '비/눈', 3: '눈', 4: '소나기', 5: '빗방울', 6: '빗방울/눈날림', 7: '눈날림' };
const PTY_EN = { 1: 'Rain', 2: 'Rain/snow', 3: 'Snow', 4: 'Showers', 5: 'Drizzle', 6: 'Drizzle/flurries', 7: 'Flurries' };

export function condText(sky, pty, ko = true) {
  if (pty) return (ko ? PTY_KO : PTY_EN)[pty] || (ko ? '강수' : 'Precipitation');
  return (ko ? SKY_KO : SKY_EN)[sky] || '—';
}

/** 두 지점 거리(km). 하버사인. */
function distKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 'YYYYMMDDHHMM' → Date (KST 기준 문자열을 그대로 로컬로 읽는다) */
function parseKst(s) {
  const t = String(s || '');
  if (t.length < 12) return null;
  // ⚠️ KST 를 명시한다. 브라우저가 다른 시간대면 몇 시간 어긋난다.
  return new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`
    + `T${t.slice(8, 10)}:${t.slice(10, 12)}:00+09:00`);
}

export const kmaFcst = {
  _doc: null,
  _at: 0,
  _loading: null,

  /** 파일을 받아 둔다. 15분 캐시 — 동네예보는 3시간마다 바뀐다. */
  async load() {
    if (this._doc && Date.now() - this._at < 15 * 60_000) return this._doc;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const r = await fetch(SRC, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this._doc = await r.json();
        this._at = Date.now();
      } catch (e) {
        /* ⚠️ 조용히 넘어간다. 기상청을 못 받으면 부르는 쪽이 Open-Meteo 로 돌아간다 —
           날씨 화면이 통째로 비는 것보다 낫다. */
        console.warn('[동네예보] 못 받음 —', e.message);
        this._doc = null;
      }
      this._loading = null;
      return this._doc;
    })();
    return this._loading;
  },

  /**
   * 내 자리에서 가장 가까운 지점의 예보.
   * @returns {null | {name, km, baseKst, now, hours, days, source, license}}
   */
  async at(lat, lon) {
    if (!inKorea(lat, lon)) return null;
    const doc = await this.load();
    const pts = doc?.points;
    if (!pts || !pts.length) return null;

    let best = null;
    for (const p of pts) {
      const km = distKm(lat, lon, p.lat, p.lon);
      if (!best || km < best.km) best = { p, km };
    }
    if (!best) return null;
    const p = best.p;

    /* 지금 시각 이후만 남긴다.
       ⚠️ 발표가 몇 시간 전이라 앞부분은 이미 지난 시각이다. 그대로 두면
          "지금 기온"이 몇 시간 전 예보가 된다. */
    const now = Date.now();
    const hours = (p.hourly || [])
      .map(h => ({ ...h, at: parseKst(h.tm) }))
      .filter(h => h.at && h.at.getTime() >= now - 60 * 60_000);

    return {
      name: p.name,
      km: Math.round(best.km),
      baseKst: p.baseKst,
      now: hours[0] || null,          // '지금'에 가장 가까운 예보 시각
      hours,
      days: p.days || p.daily || {},
      source: doc.source, sourceEn: doc.sourceEn, license: doc.license,
      note: doc.note,
    };
  },
};

// 위성 통과 예보 — "내 머리 위로 언제 지나가나"
//
// 이게 왜 중요한가
//   지구본에서 위성이 도는 걸 보는 것과 "오늘 밤 9시 14분에 내 위로 지나간다"는
//   전혀 다른 경험이다. 후자는 밖에 나가 하늘을 보게 만든다.
//   NOAA 기상위성은 한발 더 나가서, 그 시간에 SDR 수신기를 켜면
//   내 손으로 위성 사진을 받을 수 있다 (수신은 면허가 필요 없다).
//
// 계산
//   SGP4 로 위성 위치를 구하고, 관측자 기준 앙각(elevation)이 0을 넘는 구간을 찾는다.
//   앙각 0 = 지평선. 실제로는 건물·산이 있으니 10° 이상을 "쓸 만한 통과"로 본다.
//
// ⚠️ 계산량 주의. 1분 간격으로 48시간이면 위성 하나당 2,880번 SGP4 다.
//    한 위성만 계산한다 (사용자가 선택한 것). 전체를 돌리면 폰이 멈춘다.

import { i18n } from './i18n.js';

const STEP_S = 30;           // 탐색 간격(초). 촘촘할수록 정확하지만 느리다.
const MIN_PEAK_DEG = 10;     // 최대앙각이 이보다 낮으면 건물에 가려 못 본다
const REFINE_S = 2;          // 시작·끝 시각을 이 정밀도로 다듬는다

/** 특정 시각의 앙각(도). 지평선 아래면 음수. */
function elevationAt(rec, obsGd, when) {
  const pv = satellite.propagate(rec, when);
  if (!pv?.position) return null;
  const gmst = satellite.gstime(when);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const la = satellite.ecfToLookAngles(obsGd, ecf);
  return {
    el: satellite.radiansToDegrees(la.elevation),
    az: satellite.radiansToDegrees(la.azimuth),
    km: la.rangeSat,
  };
}

/* 앙각이 0을 지나는 순간을 이분법으로 좁힌다.
   ⚠️ 뜰 때와 질 때는 부호가 반대로 움직인다.
      뜰 때: t0 에서 음수 → t1 에서 양수
      질 때: t0 에서 양수 → t1 에서 음수
      한 가지 로직으로 처리하면 지는 시각이 엉뚱하게 나온다.
      rising 으로 방향을 받아 구분한다. */
function crossing(rec, obsGd, t0, t1, rising) {
  let a = t0, b = t1;
  while (b - a > REFINE_S * 1000) {
    const m = (a + b) / 2;
    const e = elevationAt(rec, obsGd, new Date(m));
    if (!e) break;
    const above = e.el >= 0;
    // 찾는 것은 "부호가 바뀌는 지점". 중간점이 아직 구간 앞쪽 상태면 a 를 당긴다.
    if (above === rising) b = m; else a = m;
  }
  return new Date((a + b) / 2);
}

/**
 * 앞으로 hours 시간 동안의 통과 목록
 * @param rec   satrec (SGP4)
 * @param obs   { lat, lon, alt }  alt 는 km
 * @returns [{ start, peak, end, maxEl, startAz, endAz, minKm, minutes }]
 */
export function computePasses(rec, obs, hours = 48, limit = 6) {
  if (!rec || !obs) return [];
  const obsGd = {
    longitude: satellite.degreesToRadians(obs.lon),
    latitude: satellite.degreesToRadians(obs.lat),
    height: (obs.alt ?? 0.05),
  };

  const out = [];
  const t0 = Date.now();
  const end = t0 + hours * 3600_000;
  let prev = null, riseT = null, peak = null;

  for (let t = t0; t <= end; t += STEP_S * 1000) {
    const e = elevationAt(rec, obsGd, new Date(t));
    if (!e) continue;

    if (prev !== null && prev < 0 && e.el >= 0) {
      // 떠오름
      riseT = crossing(rec, obsGd, t - STEP_S * 1000, t, true);
      peak = { el: e.el, az: e.az, km: e.km, at: new Date(t) };
    } else if (riseT && e.el >= 0) {
      if (e.el > peak.el) peak = { el: e.el, az: e.az, km: e.km, at: new Date(t) };
    } else if (riseT && prev >= 0 && e.el < 0) {
      // 짐
      const setT = crossing(rec, obsGd, t - STEP_S * 1000, t, false);
      if (peak.el >= MIN_PEAK_DEG) {
        const s0 = elevationAt(rec, obsGd, riseT);
        const s1 = elevationAt(rec, obsGd, setT);
        out.push({
          start: riseT, peak: peak.at, end: setT,
          maxEl: +peak.el.toFixed(0),
          startAz: s0 ? +s0.az.toFixed(0) : null,
          endAz: s1 ? +s1.az.toFixed(0) : null,
          minKm: Math.round(peak.km),
          minutes: +((setT - riseT) / 60000).toFixed(1),
        });
        if (out.length >= limit) break;
      }
      riseT = null; peak = null;
    }
    prev = e.el;
  }
  return out;
}

/** 방위각 → 16방위 (통과 방향 안내용) */
export function azName(deg) {
  if (deg == null) return '—';
  const ko = ['북','북북동','북동','동북동','동','동남동','남동','남남동',
              '남','남남서','남서','서남서','서','서북서','북서','북북서'];
  const en = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
              'S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return (i18n.lang === 'ko' ? ko : en)[i];
}

/** 최대앙각 → 볼 만한 정도 */
export function passQuality(el) {
  const ko = i18n.lang === 'ko';
  if (el >= 70) return ko ? '거의 머리 위 — 아주 잘 보임' : 'Nearly overhead — excellent';
  if (el >= 45) return ko ? '높이 지나감 — 잘 보임' : 'High pass — good';
  if (el >= 25) return ko ? '중간 높이' : 'Medium pass';
  return ko ? '낮게 지나감 — 건물에 가릴 수 있음' : 'Low pass — may be blocked';
}

/* ── 직접 수신 가능한 위성 ─────────────────────────────────────
   ⚠️ "수신"만 가능하다. 송신은 무선국 허가가 필요하고, 폰에는 장비도 없다.
      수신은 면허가 필요 없다 — 라디오를 듣는 것과 같다.
   아래 주파수는 공개된 값이다. SDR 수신기(2만원대)와 안테나가 있으면
   위성이 머리 위를 지날 때 직접 신호를 받을 수 있다. */
export const DOWNLINK = {
  'NOAA 15': { mhz: 137.62, mode: 'APT', what: { ko: '기상 영상', en: 'Weather image' } },
  'NOAA 18': { mhz: 137.9125, mode: 'APT', what: { ko: '기상 영상', en: 'Weather image' } },
  'NOAA 19': { mhz: 137.10, mode: 'APT', what: { ko: '기상 영상', en: 'Weather image' } },
  'METEOR-M2 3': { mhz: 137.90, mode: 'LRPT', what: { ko: '기상 영상(디지털)', en: 'Weather image (digital)' } },
  'METEOR-M2 4': { mhz: 137.10, mode: 'LRPT', what: { ko: '기상 영상(디지털)', en: 'Weather image (digital)' } },
  'ISS (ZARYA)': { mhz: 145.80, mode: 'FM/APRS', what: { ko: '아마추어 무선 중계', en: 'Amateur radio repeater' } },
};

export function downlinkOf(name) {
  if (DOWNLINK[name]) return DOWNLINK[name];
  // NOAA 계열은 이름이 조금씩 달라질 수 있어 앞부분으로도 본다
  const key = Object.keys(DOWNLINK).find(k => name?.startsWith(k.split(' ')[0]) && name.includes(k.split(' ')[1] || ''));
  return key ? DOWNLINK[key] : null;
}

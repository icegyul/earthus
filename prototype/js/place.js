// 지점 정보 — 탭한 곳이 어디인지, 그리고 바다면 파도가 어떤지
//
// 지구를 탭하면 좌표만 나오던 걸 "어느 나라 어느 도시"까지 알려준다.
// 바다를 탭하면 파고·파향·주기를 준다 — 항해하는 사람에게 필요한 값이다.

import { API } from './config.js';
import { fetchT } from './net.js';
import { i18n } from './i18n.js';

/* 결과를 캐시한다. 같은 지역을 여러 번 탭하는 일이 잦고,
   무료 API 라 불필요한 호출을 줄이는 게 예의다. 0.05° ≈ 5km 단위로 묶는다. */
const cache = new Map();
const key = (lat, lon) => `${(lat / 0.05 | 0)},${(lon / 0.05 | 0)}`;

/** 역지오코딩 — 국가 / 시도 / 시군구 / 동 */
export async function lookupPlace(lat, lon) {
  const k = key(lat, lon);
  if (cache.has(k)) return cache.get(k);

  const lang = i18n.lang === 'ko' ? 'ko' : 'en';
  const url = `${API.REVGEO}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=${lang}`;
  let out = null;
  try {
    const r = await fetchT(url, { timeout: 8_000 });   // 탭 즉시 반응이 중요 — 짧게
    if (r.ok) {
      const j = await r.json();
      // 바다 한가운데면 국가명이 비어서 온다 — 그게 곧 "바다"라는 신호다
      const parts = [j.principalSubdivision, j.city, j.locality]
        .filter((v, i, a) => v && a.indexOf(v) === i);   // 중복 제거 (시=도인 경우)
      out = {
        country: j.countryName || null,
        countryCode: j.countryCode || null,
        region: j.principalSubdivision || null,
        city: j.city || j.locality || null,
        detail: parts.join(' '),
        isOcean: !j.countryName,
      };
    }
  } catch (_) { /* 실패해도 좌표는 보여줄 수 있다 */ }

  cache.set(k, out);
  return out;
}

/* ── 파도 ──────────────────────────────────────────────────────
   ⚠️ 육지 좌표를 넣어도 200 이 오는데 값이 전부 null 이다.
      "응답이 왔다"로 판단하면 안 되고 wave_height 가 실제로 있는지 봐야 한다. */
export async function lookupWaves(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3),
    current: 'wave_height,wave_direction,wave_period,'
           + 'swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height',
    timezone: 'auto',
  });
  try {
    const r = await fetchT(`${API.MARINE}?${q}`);
    if (!r.ok) return null;
    const c = (await r.json()).current;
    if (!c || c.wave_height == null) return null;   // 육지
    return c;
  } catch (_) { return null; }
}

/** 방위각 → 16방위 */
export function compass(deg) {
  if (deg == null) return '—';
  const ko = ['북','북북동','북동','동북동','동','동남동','남동','남남동',
              '남','남남서','남서','서남서','서','서북서','북서','북북서'];
  const en = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
              'S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return (i18n.lang === 'ko' ? ko : en)[i];
}

/** 파고 → 사람이 아는 말. 항해자가 쓰는 기준(Douglas sea scale)에 맞췄다. */
export function seaState(m) {
  const ko = i18n.lang === 'ko';
  if (m == null) return '—';
  if (m < 0.1) return ko ? '고요' : 'Calm';
  if (m < 0.5) return ko ? '잔물결' : 'Rippled';
  if (m < 1.25) return ko ? '약간 높음' : 'Slight';
  if (m < 2.5) return ko ? '보통' : 'Moderate';
  if (m < 4) return ko ? '높음' : 'Rough';
  if (m < 6) return ko ? '매우 높음' : 'Very rough';
  if (m < 9) return ko ? '거침' : 'High';
  return ko ? '매우 거침 — 항해 위험' : 'Very high — dangerous';
}

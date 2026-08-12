// 한국 자료 묶음 — 기상청 API허브에서 받은 것들
//
// ⚠️ 전부 한꺼번에 받지 않는다. 탭을 열 때 그 탭 것만 받는다.
//    한국탭을 안 여는 사용자(대부분)에게 수백 KB 를 내려받게 하면 안 된다.
//
// ⚠️ 여기 자료는 모두 **기상청 원자료**다. 출처 표기는 이용 조건이지 장식이 아니다.
//    공공누리 제1유형 — 출처만 밝히면 상업적 이용도 된다.

import { API } from './config.js';

const CACHE_MS = 5 * 60_000;

/** 한국 대략 범위. 제주 남단(33.1)~최북단(38.6), 독도(131.9)를 다 포함하도록 넉넉히. */
export const KR_BOX = { s: 32.5, n: 39.0, w: 124.0, e: 132.5 };
export const inKorea = (lat, lon) =>
  lat >= KR_BOX.s && lat <= KR_BOX.n && lon >= KR_BOX.w && lon <= KR_BOX.e;

/** 두 지점 거리(km) */
export function distKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const SRC = {
  aws:      `${API.WIND}/kma-aws-min.json`,     // 736지점 매분 관측
  asos:     `${API.WIND}/kma-aws.json`,         // 97지점 정시 관측
  forecast: `${API.WIND}/kma-fcst.json`,        // 97개 5km 대표격자·약 5일 예보
  mountain: `${API.WIND}/kma-mountain.json`,    // 산 정상 예보
  normal:   `${API.WIND}/kma-normal.json`,      // 평년값 1991–2020
  upperNow: `${API.WIND}/kma-upper.json`,       // 레윈존데 최신 안정도 원값
  upper:    `${API.WIND}/series/upper-daily.json`, // 2010~ 전국 일별 집계
  verify:   `${API.WIND}/series/verify-daily.json`,
  ocean:    `${API.OCEAN}/kma-buoy.json`,       // 해상 194지점
  warn:     `${API.EVENTS}/kma-warn.json`,
  lightning: `${API.EVENTS}/kma-lightning.json`,      // 최근 60분 낙뢰
  radar:    `${API.WIND}/kma-radar.json`,       // HSR 공식 레이더 PNG 메타
  lgtDaily:  `${API.EVENTS}/kma-lightning-daily.json`,
  episodes: `${API.EVENTS}/kma-warn-episodes.json`,
  life:     `${API.WIND}/kma-life.json`,          // 자외선·대기확산·꽃가루
  // ⚠️ 지도에 칠하는 대기질 색은 유럽 CAMS **모델값**이다.
  //    이건 한국 측정소 673곳이 **실제로 잰 값**이다. 둘은 다를 수 있고,
  //    다르면 다르다고 적는다 — 모델을 지우지 않는다(모델은 전 지구를 덮는다).
  airobs:   `${API.WIND}/korea-air-obs.json`,     // 에어코리아 실측 673지점
  fire:     `${API.EVENTS}/forest-fire-kr.json`,  // 산불위험예보 (산림청)
};

const _cache = {};

/** 필요한 것만, 필요할 때. 5분 안에 다시 부르면 받아둔 걸 쓴다. */
export async function get(name) {
  const url = SRC[name];
  if (!url) throw new Error(`모르는 자료: ${name}`);
  const c = _cache[name];
  if (c && Date.now() - c.at < CACHE_MS) return c.data;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const data = await r.json();
  _cache[name] = { at: Date.now(), data };
  return data;
}

/** 내 위치에서 가장 가까운 관측소. 없으면 null. */
export function nearest(list, lat, lon, maxKm = 200) {
  let best = null;
  for (const s of list) {
    if (s.lat == null || s.lon == null) continue;
    const km = distKm(lat, lon, s.lat, s.lon);
    if (km <= maxKm && (!best || km < best.km)) best = { ...s, km };
  }
  return best;
}

/**
 * 체감온도 (기상청 공식).
 *
 * 왜 API 를 안 쓰고 직접 계산하나
 *   기상청 체감온도 API 는 시도 17곳 단위다. 우리는 AWS 736지점의
 *   기온·습도·풍속을 이미 받고 있어서, 같은 공식으로 736곳에서 낼 수 있다.
 *
 * ⚠️ 여름식과 겨울식은 **적용 범위가 다르다.** 아무 때나 쓰면 안 된다.
 *      여름철 체감온도 : 기온 ≥ 25°C 에서만 의미가 있다 (습도 기반)
 *      겨울철 체감온도 : 기온 ≤ 10°C 이고 풍속 ≥ 1.3 m/s 에서만 (바람 기반)
 *    그 사이(10~25°C)에서는 체감온도라는 개념 자체를 쓰지 않는다 — 기온을 그대로 쓴다.
 *    범위를 무시하고 식을 돌리면 봄가을에 엉뚱한 값이 나온다.
 *
 * @returns {{v:number, kind:'heat'|'chill'|'plain'}}
 */
export function feelsLike(ta, rh, wsMs) {
  if (ta == null) return null;

  // 여름 — 습구온도(Stull 근사)를 거쳐 계산한다
  if (ta >= 25 && rh != null) {
    const tw = ta * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
      + Math.atan(ta + rh) - Math.atan(rh - 1.67633)
      + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
    const v = -0.2442 + 0.55399 * tw + 0.45535 * ta
      - 0.0022 * tw * tw + 0.00278 * tw * ta + 3.0;
    return { v, kind: 'heat' };
  }

  // 겨울 — 바람이 있어야 성립한다. ⚠️ 풍속은 km/h 로 넣는다.
  if (ta <= 10 && wsMs != null && wsMs >= 1.3) {
    const vk = Math.pow(wsMs * 3.6, 0.16);
    const v = 13.12 + 0.6215 * ta - 11.37 * vk + 0.3965 * ta * vk;
    return { v, kind: 'chill' };
  }

  // 그 사이 — 체감온도를 따로 말하지 않는다
  return { v: ta, kind: 'plain' };
}

/**
 * 평년 대비 편차.
 * ⚠️ 평년값은 **연중 일자(1~366)** 로 들어 있고, 2020년(윤년) 기준으로 색인돼 있다.
 *    그냥 Date 의 날짜수를 쓰면 평년이 아닌 해에 하루씩 밀린다.
 */
export function normalFor(normals, stationId, date = new Date()) {
  const arr = normals?.normals?.[String(stationId)];
  if (!arr) return null;
  const y = date.getFullYear();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const start = Date.UTC(y, 0, 1);
  let doy = Math.floor((Date.UTC(y, date.getMonth(), date.getDate()) - start) / 86400000);
  // 윤년이 아니면 3월 1일부터 한 칸씩 당겨져 있으므로 2/29 자리를 건너뛴다
  if (!leap && doy >= 59) doy += 1;
  const v = arr[doy];
  return v ? { mean: v[0], max: v[1], min: v[2], rain: v[3] } : null;
}

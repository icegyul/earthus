// 지점 날씨·대기질 API — 좌표 하나를 주면 "지금 거기 나가도 되나"에 답한다
//
// 왜 만들었나
//   스냅앤스포츠(축구·풋살 앱)가 경기장 근처 날씨·대기오염을 보여주려 한다.
//   그런데 같은 계산을 두 앱이 따로 하면 두 곳이 서로 다른 답을 하게 된다.
//   → **한 곳에서 계산하고 둘 다 그걸 쓴다.** earthus 화면도 이걸 쓸 수 있다.
//
// ⚠️⚠️ 이 API 는 **판단하지 않는다.** "경기하기 좋음" 같은 말을 만들지 않는다.
//    우리는 기상청도 환경부도 아니다. 값과 등급(기관이 매긴 것)을 그대로 옮기고,
//    무엇이 걸리는지(폭염특보·미세먼지 나쁨)를 사실로만 적는다.
//    "취소하세요"는 주최자가 할 판단이지 우리 판단이 아니다.
//
// ⚠️ 시설 종류(축구장/풋살장/공원/공연장)를 이 API 는 모른다. 알 필요도 없다.
//    좌표만 받는다 — 종류가 늘어나도 이쪽은 안 바뀐다.
//
// 요청  GET /?lat=37.49&lon=126.96
//       GET /?lat=..&lon=..&lang=en
//       ⚠️ 여러 곳을 한 번에: /?spots=37.49,126.96;37.51,127.01  (최대 20곳)
//
// 응답  { spots: [ { lat, lon, air:{...}, weather:{...}, flags:[...] } ], sources:[...] }

const AIR_URL = 'https://earthus.net/wind/korea-air-obs.json';
const OM_URL  = 'https://api.open-meteo.com/v1/forecast';

// 한국 대략 범위 — 밖이면 대기질 실측은 없다고 정직하게 말한다
const KR = { s: 32.5, n: 39.0, w: 124.0, e: 132.5 };
const inKorea = (lat, lon) => lat >= KR.s && lat <= KR.n && lon >= KR.w && lon <= KR.e;

// 측정소 목록은 자주 안 바뀐다. 컨테이너가 살아 있는 동안 재사용한다.
let airCache = null, airAt = 0;
const AIR_TTL = 8 * 60 * 1000;   // 자료 자체가 매시간 갱신 — 8분이면 충분

/** 두 지점 거리(km). 하버사인. */
function distKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function loadAir() {
  if (airCache && Date.now() - airAt < AIR_TTL) return airCache;
  const r = await fetch(AIR_URL, { headers: { 'User-Agent': 'earthus-spot-air/1.0' } });
  if (!r.ok) throw new Error('air ' + r.status);
  const j = await r.json();
  airCache = j; airAt = Date.now();
  return j;
}

/** 가장 가까운 측정소.
 *  ⚠️ 거리를 **반드시 함께 돌려준다.** 30km 떨어진 측정소 값을
 *     "여기 대기질"이라고 말하면 안 된다 — 사당동 호우 때 배운 것과 같은 문제다. */
function nearestStation(air, lat, lon) {
  let best = null, bestKm = Infinity;
  for (const s of air.stations || []) {
    if (s.lat == null || s.lon == null) continue;
    // 값이 하나도 없는 측정소는 후보에서 뺀다 — 가까워도 소용없다
    if (s.pm25 == null && s.pm10 == null) continue;
    const km = distKm(lat, lon, s.lat, s.lon);
    if (km < bestKm) { bestKm = km; best = s; }
  }
  return best ? { station: best, km: Math.round(bestKm * 10) / 10 } : null;
}

const GRADE = {
  1: { ko: '좋음', en: 'Good' },
  2: { ko: '보통', en: 'Moderate' },
  3: { ko: '나쁨', en: 'Unhealthy' },
  4: { ko: '매우 나쁨', en: 'Very unhealthy' },
};

/** Open-Meteo 실황 + 오늘 최고/최저 */
async function loadWeather(spots) {
  // ⚠️ 여러 지점을 한 번에 물어본다. 지점마다 호출하면 무료 한도를 금방 태운다.
  const lats = spots.map(s => s.lat).join(',');
  const lons = spots.map(s => s.lon).join(',');
  const q = new URLSearchParams({
    latitude: lats, longitude: lons,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,'
           + 'weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    timezone: 'Asia/Seoul', forecast_days: '1',
  });
  const r = await fetch(`${OM_URL}?${q}`, { headers: { 'User-Agent': 'earthus-spot-air/1.0' } });
  if (!r.ok) throw new Error('open-meteo ' + r.status);
  const j = await r.json();
  // ⚠️ 지점이 1곳이면 배열이 아니라 객체 하나로 온다. 실제로 여기서 터진 적이 있다.
  return Array.isArray(j) ? j : [j];
}

/** 실제로 걸리는 것만 사실로 적는다. 조언은 하지 않는다. */
function buildFlags(w, airInfo, ko) {
  const out = [];
  const cur = w?.current || {};
  const day = w?.daily || {};
  const tmax = day.temperature_2m_max?.[0];
  const feels = cur.apparent_temperature;
  const rain = cur.precipitation;
  const gust = cur.wind_gusts_10m;
  const uv = day.uv_index_max?.[0];

  /* ⚠️ 임계값은 기상청 특보 기준(폭염주의보 33℃ / 경보 35℃, 체감온도 기준)을 따른다.
     우리가 새로 만든 숫자가 아니다. 그래서 화면에도 "기상청 기준"이라고 밝힌다. */
  if (feels != null && feels >= 35) {
    out.push({ level: 'high', code: 'heat',
      ko: `체감온도 ${feels.toFixed(0)}℃ — 기상청 폭염경보 기준(35℃) 이상`,
      en: `Feels like ${feels.toFixed(0)}°C — at or above KMA heat warning threshold (35°C)` });
  } else if (feels != null && feels >= 33) {
    out.push({ level: 'mid', code: 'heat',
      ko: `체감온도 ${feels.toFixed(0)}℃ — 기상청 폭염주의보 기준(33℃) 이상`,
      en: `Feels like ${feels.toFixed(0)}°C — at or above KMA heat advisory threshold (33°C)` });
  }

  if (rain != null && rain > 0) {
    out.push({ level: rain >= 3 ? 'high' : 'mid', code: 'rain',
      ko: `지금 비 ${rain} mm/h`, en: `Raining now, ${rain} mm/h` });
  }

  // 돌풍 — 공을 다루는 종목에서 실제로 문제가 되는 값
  if (gust != null && gust >= 10) {
    out.push({ level: gust >= 14 ? 'high' : 'mid', code: 'wind',
      ko: `순간풍속 ${gust.toFixed(0)} m/s`, en: `Gusts ${gust.toFixed(0)} m/s` });
  }

  if (uv != null && uv >= 8) {
    out.push({ level: uv >= 11 ? 'high' : 'mid', code: 'uv',
      ko: `자외선 지수 ${uv.toFixed(0)} (매우 높음 이상)`,
      en: `UV index ${uv.toFixed(0)} (very high or extreme)` });
  }

  /* 대기질 — ⚠️ 등급은 **환경부가 매긴 것**을 그대로 옮긴다.
     우리가 농도에 임계값을 새로 붙이면 환경부 발표와 다른 답이 나온다. */
  const g = airInfo?.grade;
  if (g === 4 || g === 3) {
    out.push({ level: g === 4 ? 'high' : 'mid', code: 'air',
      ko: `대기질 ${GRADE[g].ko} (환경부 등급 · ${airInfo.stationName} 측정소, ${airInfo.km}km)`,
      en: `Air quality ${GRADE[g].en} (KME grade · ${airInfo.stationName} station, ${airInfo.km}km)` });
  }
  return out;
}

function parseSpots(qs) {
  // 단일: lat/lon,  다중: spots=lat,lon;lat,lon
  if (qs.spots) {
    return qs.spots.split(';').slice(0, 20).map(p => {
      const [a, b] = p.split(',').map(Number);
      return { lat: a, lon: b };
    }).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  }
  const lat = Number(qs.lat), lon = Number(qs.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [{ lat, lon }] : [];
}

export const handler = async (event) => {
  const qs = event?.queryStringParameters || {};
  const ko = (qs.lang || 'ko') !== 'en';
  const spots = parseSpots(qs);

  const json = (body, status = 200) => ({
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // ⚠️ 스냅앤스포츠(다른 도메인)가 브라우저에서 직접 부를 수 있어야 한다.
      'Access-Control-Allow-Origin': '*',
      // 실황이라 오래 캐시하면 거짓이 된다. 5분.
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(body),
  });

  if (!spots.length) {
    return json({ error: 'NO_COORDS',
      ko: 'lat·lon 또는 spots 파라미터가 필요합니다. 예: ?lat=37.49&lon=126.96',
      en: 'lat/lon or spots parameter required.' }, 400);
  }

  // ⚠️ 대기질이 실패해도 날씨는 준다. 하나가 죽어서 전부 안 나오면 안 된다.
  const [wRes, aRes] = await Promise.allSettled([loadWeather(spots), loadAir()]);
  const weathers = wRes.status === 'fulfilled' ? wRes.value : [];
  const air = aRes.status === 'fulfilled' ? aRes.value : null;

  const out = spots.map((sp, i) => {
    const w = weathers[i] || null;
    let airInfo = null;

    if (air) {
      const near = nearestStation(air, sp.lat, sp.lon);
      /* ⚠️ 30km 를 넘으면 "여기 대기질"이라고 하지 않는다.
         측정소가 멀면 값이 있어도 그 자리의 공기가 아니다.
         멀다는 사실과 거리를 함께 돌려주고, 쓸지 말지는 받는 쪽이 정한다. */
      if (near) {
        const s = near.station;
        airInfo = {
          stationName: s.name, km: near.km,
          tooFar: near.km > 30,
          pm25: s.pm25, pm10: s.pm10,
          grade: s.grade != null ? Number(s.grade) : null,
          gradeText: s.grade != null ? (ko ? GRADE[Number(s.grade)]?.ko : GRADE[Number(s.grade)]?.en) : null,
          o3: s.o3, no2: s.no2,
          observedKst: s.at || air.observedKst || null,
          addr: s.addr || null,
        };
      }
    }

    const cur = w?.current || {};
    const day = w?.daily || {};
    return {
      lat: sp.lat, lon: sp.lon,
      inKorea: inKorea(sp.lat, sp.lon),
      weather: w ? {
        temp: cur.temperature_2m ?? null,
        feels: cur.apparent_temperature ?? null,
        humidity: cur.relative_humidity_2m ?? null,
        precip: cur.precipitation ?? null,
        windSpeed: cur.wind_speed_10m ?? null,
        windGust: cur.wind_gusts_10m ?? null,
        windDir: cur.wind_direction_10m ?? null,
        code: cur.weather_code ?? null,
        tmax: day.temperature_2m_max?.[0] ?? null,
        tmin: day.temperature_2m_min?.[0] ?? null,
        rainChance: day.precipitation_probability_max?.[0] ?? null,
        uvMax: day.uv_index_max?.[0] ?? null,
        observedAt: cur.time || null,
      } : null,
      // ⚠️ 한국 밖이면 실측 대기질이 아예 없다. null 과 "좋음"은 다르다.
      air: airInfo,
      flags: buildFlags(w, airInfo, ko),
    };
  });

  return json({
    generated: new Date().toISOString(),
    count: out.length,
    spots: out,
    sources: [
      { id: 'AirKorea', ko: '한국환경공단 에어코리아 (실측)',
        en: 'Korea Environment Corporation — AirKorea (measured)',
        license: '공공누리 제1유형 (출처표시)', via: '공공데이터포털' },
      { id: 'Open-Meteo', ko: 'Open-Meteo (GFS/ECMWF 모델)',
        en: 'Open-Meteo (GFS/ECMWF models)' },
    ],
    note: {
      ko: '⚠️ 이 API 는 "경기하기 좋다/나쁘다"를 판단하지 않습니다. '
        + '값과 기관이 매긴 등급을 그대로 옮기고, 걸리는 항목만 사실로 적습니다. '
        + '대기질은 가장 가까운 측정소 값이며 거리를 함께 드립니다 — '
        + '30km 를 넘으면 tooFar 가 true 입니다. 날씨는 모델값(실측 아님)입니다.',
      en: 'This API does not judge whether conditions are good or bad. It reports '
        + 'measurements and the grades assigned by government agencies. Air quality '
        + 'comes from the nearest station with its distance; tooFar is true beyond 30km. '
        + 'Weather is model output, not measured.',
    },
    // ⚠️ 실패를 숨기지 않는다. 빈 값과 고장을 구분할 수 있어야 한다.
    failed: [
      wRes.status === 'rejected' ? 'weather' : null,
      aRes.status === 'rejected' ? 'air' : null,
    ].filter(Boolean),
  });
};

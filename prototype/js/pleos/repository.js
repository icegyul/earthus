// EARTHUS Pleos — 자료 저장소 (기존 EARTHUS 자료 경로 재사용)
//
// 새 공급자·새 엔드포인트를 만들지 않는다. 본 앱이 이미 쓰는 경로만 부른다.
//
// ── 네트워크 호출 근거 (V38.1 지시서 §7) ─────────────────────────────────────
// | 호출 | 왜 번들 불가 | 왜 캐시로 부족 | 필요 신선도 | 빈도 | 장애 시 표시 | 제약 |
// | events/kma-warn.json | 특보는 실시간 발표 | 30분 넘으면 판단 불가(safety-engine) | ≤30분 | 화면 갱신 때 | "특보 확인 안 됨" (없음 아님) | 공공누리 |
// | events/kma-warn-stations.json | 하루 1회 바뀜 | 세션당 1회 받고 재사용 | 1일 | 세션 1회 | 구역 불명 → UNKNOWN | 공공누리 |
// | Open-Meteo forecast | 현재 날씨 | 모델 갱신 1시간 | ≤1시간 | 화면 갱신 때 | 값별 "자료 없음" | Open-Meteo 약관 (상업 전환 전 확인: OPEN_METEO_COMMERCIAL_READY) |
// | kma-fcst / korea(aws·airobs·life) | 관측·예보 실시간 | 15~90분 기준 | 원천별 | kma-fcst 15분 캐시 | 값별 STALE/MISSING | 공공누리 |
// | tourism/seoul-flow.json | 5분 인구 스냅샷 | LIVE/STALE 판정 필요 | 5분 | 주차 중 지역 탭 열 때 | 원천 상태 그대로 | 서울 열린데이터 |
// | data/beaches.json (정적) | 번들된 정적 파일 | force-cache | 파일 generated | 1회 | 목록 없음 표시 | ODbL |
// 행정구역 이름은 data/korea-admin-reference.json (정적, force-cache) 로 기기 안에서 찾는다.
//
// ⚠️ place.js·beaches.js 를 import 하지 않는다. 둘 다 i18n.js 를 끌고 오고, i18n.js 에는 우주 제품 화면 문구가
//    함께 들어 있어 Pleos 그래프에 다른 제품 문자열이 섞인다. 그래서 같은 원천을 직접 읽는다.
//    - 행정구역: place.js 오프라인 경로와 같은 korea-admin-reference.js koreaAdminAt()
//    - 해변: beaches.js load() 와 같은 파일·같은 필드 대응 (beaches.js:128-133, 시험이 대응을 고정)
//    - 바다 파고(place.js lookupWaves)는 v1 에서 연결하지 않았다. 화면에 "연결하지 않음"으로 적는다.
//
// 요청 규칙: 같은 요청 동시 중복 제거 · 위치가 바뀌면 마지막 요청만 반영 · 재시도 없음(무한 재시도 금지)
//           · 오류와 "0건"을 구분 · 원천의 출처·시각을 지우지 않는다.

import { API } from '../config.js';
import { fetchT } from '../net.js';
import { buildWeatherQueryV7, buildWeatherCardModel } from '../weather-contract-v7.js';
import { loadWeatherInputsV7 } from '../weather-data-v7.js';
import { kmaFcst } from '../kma-fcst.js';
import { get as getKorea } from '../korea.js';
import { evaluateWarningSafety, warningFreshness, distanceKm, inKorea } from '../safety-engine.js';
import { koreaAdminAt } from '../korea-admin-reference.js';
import { validateTourismSnapshot } from '../tourism-flow-contract.js';
import { fromTourismPlace, fromBeach } from './place-card.js';
import { describeFreshness } from './freshness.js';

export const PLEOS_REPOSITORY_VERSION = 'earthus.pleos-repository.v1.0.0';

const errorText = e => String(e?.message || e || 'FAILED').slice(0, 160);

/** beaches.js load() 의 한국 해변 대응과 같다 (beaches.js:128-133). */
export function mapBeachesDocument(doc) {
  const list = (doc?.beaches || []).map(b => ({
    name: b.n, nameEn: b.en || null,
    lat: b.la, lon: b.lo, region: b.r, country: 'kr',
  }));
  return { list, meta: { generated: doc?.generated ?? null, source: doc?.source ?? null, license: doc?.license ?? null } };
}

function defaultDeps(fetchJson) {
  return {
    fetchWarnSnapshot: () => fetchJson(`${API.EVENTS}/kma-warn.json`, { cache: 'no-cache' }),
    fetchWarnZones: () => fetchJson(`${API.EVENTS}/kma-warn-stations.json`),
    fetchWeather: (lat, lon) => fetchJson(`${API.METEO}?${buildWeatherQueryV7(lat, lon)}`),
    fetchKmaForecast: (lat, lon) => kmaFcst.at(lat, lon),
    fetchKorea: name => getKorea(name),
    fetchTourism: () => fetchJson(`${API.TOURISM}/seoul-flow.json`, { cache: 'no-cache' }),
    loadBeaches: async () => mapBeachesDocument(await fetchJson('data/beaches.json', { cache: 'force-cache' })),
    lookupRegion: async (lat, lon) => (inKorea(lat, lon) ? koreaAdminAt(lat, lon) : null),
  };
}

export function createPleosRepository({ deps: overrides = {}, nowMs = () => Date.now(), fetchImpl = fetchT } = {}) {
  const fetchJson = async (url, opts = {}) => {
    const r = await fetchImpl(url, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const deps = { ...defaultDeps(fetchJson), ...overrides };
  const inflight = new Map();
  const seq = { weather: 0, places: 0 };
  let zones = null;
  let lastSnapshot = null;

  const once = (key, fn) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
  const keyOf = p => `${Number(p.lat).toFixed(3)},${Number(p.lon).toFixed(3)}`;

  async function warningAt(point) {
    return once(`warn:${keyOf(point)}`, async () => {
      let fetchError = null;
      try {
        if (!zones) zones = await deps.fetchWarnZones();
      } catch (e) { fetchError = errorText(e); }
      try {
        lastSnapshot = await deps.fetchWarnSnapshot();
      } catch (e) {
        // ⚠️ 새로 못 받으면 이전 스냅샷을 쓰되, 판단은 safety-engine 의 신선도 기준(45분)에 맡긴다.
        //    자료가 아예 없으면 PROVIDER_UNAVAILABLE 이다. 어떤 경우에도 "특보 없음"으로 바꾸지 않는다.
        fetchError = errorText(e);
      }
      const now = nowMs();
      const safety = evaluateWarningSafety({ snapshot: lastSnapshot, zones, coords: point, nowMs: now });
      const wf = warningFreshness(lastSnapshot, now);
      return {
        safety,
        fetchError,
        freshness: describeFreshness({
          sourceState: lastSnapshot ? wf.status : null,
          source: lastSnapshot?.source ?? '기상청 기상특보',
          observedAt: lastSnapshot?.generated ?? null,
          error: !lastSnapshot && !!fetchError,
          nowMs: now,
        }),
      };
    });
  }

  async function weatherAt(point) {
    const mySeq = ++seq.weather;
    const warning = await warningAt(point);
    const inputs = await loadWeatherInputsV7(point, {
      fetchWeather: deps.fetchWeather,
      fetchKmaForecast: deps.fetchKmaForecast,
      fetchKorea: deps.fetchKorea,
      fetchWarningGate: async () => warning.safety,
    });
    if (mySeq !== seq.weather) return { stale: true };
    const card = buildWeatherCardModel({ ...inputs, now: new Date(nowMs()).toISOString() });
    return { stale: false, card, warning, errors: inputs.errors };
  }

  async function regionAt(point) {
    try {
      const p = await deps.lookupRegion(point.lat, point.lon);
      if (!p) return null;
      return {
        label: [p.regionKo, p.nameKo].filter(Boolean).join(' ') || null,
        approximate: true,
        reference: { source: p.source ?? null, boundaryYear: p.boundaryYear ?? null },
      };
    } catch { return null; }
  }

  /** 주차 중 '지역' 목록. 기존 관광 인구 스냅샷과 해변 목록만 쓴다. */
  async function nearbyPlaces(point, { limit = 8 } = {}) {
    const mySeq = ++seq.places;
    const sources = [];
    const places = [];
    try {
      const snap = await once('tourism', deps.fetchTourism);
      validateTourismSnapshot(snap);
      snap.places.forEach(p => places.push(fromTourismPlace(p, snap)));
      sources.push({ id: 'seoul-flow', status: 'OK', count: snap.places.length, generatedAt: snap.generatedAt ?? null });
    } catch (e) {
      sources.push({ id: 'seoul-flow', status: 'ERROR', error: errorText(e) });
    }
    try {
      const { list, meta } = await once('beaches', deps.loadBeaches);
      list.forEach(b => places.push(fromBeach(b, meta)));
      sources.push({ id: 'beaches', status: 'OK', count: list.length, generatedAt: meta?.generated ?? null });
    } catch (e) {
      sources.push({ id: 'beaches', status: 'ERROR', error: errorText(e) });
    }
    if (mySeq !== seq.places) return { stale: true };
    const ranked = places
      .filter(p => p.id && p.lat !== null && p.lon !== null)
      .map(p => ({ place: p, km: distanceKm(point.lat, point.lon, p.lat, p.lon) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, limit)
      .map(({ place, km }) => ({ ...place, distanceKm: Math.round(km * 10) / 10 }));
    return { stale: false, places: ranked, sources };
  }

  return { warningAt, weatherAt, regionAt, nearbyPlaces };
}

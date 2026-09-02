// EARTHUS 1.0 — 여행 발견 (TRAVEL DISCOVERY · 한국관광 데이터랩 출품 모듈)
//
// 유명한 곳 검색이 아니라 오늘 갈 곳을 데이터로 발견한다.
// 점수 공식과 하드게이트는 v2-three/js/travel.js 와 같다. 두 앱이 같은 질문에
// 다른 답을 내면 어느 쪽도 근거로 쓸 수 없기 때문이다.
//
//   오늘 점수 = 목적 밀도(무장애·웰니스·영문, 로그) 0.6 + 덜 붐빔(외지인 방문자 역순) 0.4
//   특보 발효 또는 대기질 나쁨(등급 3 이상)이면 후보에서 빼고, 뺐다는 사실을 남긴다.
//
// 원칙
// - 값을 만들지 않는다. 방문자 자료가 없는 지역은 0.5 중립으로 두고 그렇다고 적는다.
// - 라벨은 EARTHUS DISCOVERY. 한국관광공사 공식 추천이 아니다.
// - 이동통신 기반 방문자수는 관광객 수가 아니다. 그 문구를 화면에서 지우지 않는다.

import { API } from './config.js';

const DATA_URL = 'data/tourism/kto-discovery.json';
const GATE_TTL_MS = 5 * 60 * 1000;
const AIR_STATION_MAX_KM = 40;

export const DISCOVERY_MODES = Object.freeze({
  discover: { ko: '오늘 발견', en: 'Discover today', key: 'score' },
  bf: { ko: '무장애 여행지', en: 'Barrier-free', key: 'barrierFree' },
  wl: { ko: '웰니스 관광지', en: 'Wellness', key: 'wellness' },
  en: { ko: '영문 콘텐츠', en: 'English content', key: 'english' },
  visitors: { ko: '방문자 스냅샷', en: 'Visitor snapshot', key: 'visitorsDomestic' },
});

const clamp01 = value => Math.min(Math.max(Number(value) || 0, 0), 1);

function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h)));
}

async function getJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 시군구 하나의 하드게이트 판정. 값을 만들지 않고 근거를 그대로 돌려준다. */
export function gateForRegion(region, gates) {
  const out = { warn: null, air: null, blocked: false };
  const warnDoc = gates?.warn;
  if (warnDoc && !warnDoc.error) {
    const shortName = region.nameKo.replace(/[시군구]$/, '');
    const hits = (warnDoc.active || []).filter(entry => {
      const area = String(entry.region || '');
      const parent = String(entry.parent || '');
      return area.includes(region.nameKo)
        || (parent && region.province.startsWith(parent.slice(0, 2)) && area.includes(shortName));
    }).sort((a, b) => (b.levelRank || 0) - (a.levelRank || 0));
    if (hits.length) { out.warn = hits[0]; out.blocked = true; }
  }
  const airDoc = gates?.air;
  if (airDoc && !airDoc.error) {
    const stations = (airDoc.stations || airDoc.items || [])
      .filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lon));
    let nearest = null;
    let nearestKm = Infinity;
    for (const station of stations) {
      const km = distanceKm(region, station);
      if (km < nearestKm) { nearestKm = km; nearest = station; }
    }
    if (nearest && nearestKm < AIR_STATION_MAX_KM) {
      const pm25Grade = Number(nearest.pm25Grade) || null;
      const pm10Grade = Number(nearest.pm10Grade) || null;
      out.air = {
        station: nearest.name || '', km: nearestKm, at: nearest.at || '',
        pm25: Number.isFinite(Number(nearest.pm25)) ? Number(nearest.pm25) : null,
        pm10: Number.isFinite(Number(nearest.pm10)) ? Number(nearest.pm10) : null,
        gradeKo: nearest.gradeKo || '', pm25Grade, pm10Grade,
      };
      // 등급은 에어코리아가 매긴 것을 그대로 쓴다(1 좋음·2 보통·3 나쁨·4 매우나쁨).
      if ((pm25Grade != null && pm25Grade >= 3) || (pm10Grade != null && pm10Grade >= 3)) {
        out.blocked = true;
      }
    }
  }
  return out;
}

/**
 * 시군구별 오늘 점수. 성분(density·quiet·gate)을 그대로 붙여 돌려주므로
 * 카드에서 가중치를 숨기지 않고 보여줄 수 있다.
 */
export function scoreRegions(regions, gates) {
  const densities = regions.map(region => Math.log1p(
    region.barrierFree + region.wellness * 4 + region.english * 0.3,
  ));
  const densityMax = Math.max(...densities, 1e-6);
  const domestic = regions.map(region => (
    region.visitors && Number.isFinite(region.visitors.domestic) ? region.visitors.domestic : null
  ));
  const known = domestic.filter(value => value != null).sort((a, b) => a - b);
  const percentile = value => (value == null || !known.length
    ? null
    : known.findIndex(x => x >= value) / Math.max(1, known.length - 1));

  return regions.map((region, index) => {
    const density = densities[index] / densityMax;
    const rank = percentile(domestic[index]);
    // 방문자 자료가 없으면 붐빔을 모른다. 0.5 중립으로 두고 모른다고 적는다.
    const quiet = rank == null ? 0.5 : 1 - rank;
    const gate = gateForRegion(region, gates);
    return {
      ...region,
      visitorsDomestic: domestic[index] == null ? 0 : domestic[index],
      components: { density, quiet, quietKnown: rank != null, gate },
      score: gate.blocked ? 0 : clamp01(0.6 * density + 0.4 * quiet),
    };
  });
}

export const travelDiscovery = {
  data: null,
  gates: { warn: null, air: null, at: 0 },
  _dataPromise: null,

  /** 집계 파일(시군구 228곳). tools/build_kto_discovery.py 산출물. */
  async ensureData() {
    if (this.data) return this.data;
    if (!this._dataPromise) {
      this._dataPromise = getJson(DATA_URL, 20000).catch(error => {
        this._dataPromise = null;
        throw error;
      }).then(doc => { this.data = doc; return doc; });
    }
    return this._dataPromise;
  },

  /** 실시간 게이트: 기상청 특보 · 에어코리아 실측. 실패해도 발견을 막지 않는다. */
  async ensureGates() {
    if (Date.now() - this.gates.at < GATE_TTL_MS && (this.gates.warn || this.gates.air)) {
      return this.gates;
    }
    const safe = (url, ms) => getJson(url, ms).catch(error => ({ error: String(error?.message || error) }));
    const [warn, air] = await Promise.all([
      safe(`${API.EVENTS}/kma-warn.json`, 15000),
      safe(`${API.WIND || API.AIR}/korea-air-obs.json`, 20000),
    ]);
    this.gates = { warn, air, at: Date.now() };
    return this.gates;
  },

  /** 모드별 상위 후보. 게이트에 걸린 지역은 목록 뒤로 밀되 지우지 않는다. */
  async rank(mode = 'discover', limit = 12) {
    const data = await this.ensureData();
    const gates = await this.ensureGates();
    const scored = scoreRegions(data.regions || [], gates);
    const key = (DISCOVERY_MODES[mode] || DISCOVERY_MODES.discover).key;
    const ordered = [...scored].sort((a, b) => {
      if (a.components.gate.blocked !== b.components.gate.blocked) {
        return a.components.gate.blocked ? 1 : -1;
      }
      return (b[key] || 0) - (a[key] || 0);
    });
    return {
      mode,
      generatedAt: data.generatedAt,
      provenance: data.provenance || {},
      notes: data.notes || {},
      assignment: data.assignment || '',
      blockedCount: scored.filter(region => region.components.gate.blocked).length,
      total: scored.length,
      items: ordered.slice(0, limit),
    };
  },

  /** 한 지역의 연관 관광지(공식 차량 이동 기반). 없으면 빈 배열. */
  relatedFor(region) {
    const related = this.data?.related || {};
    const samples = region?.barrierFreeSample || [];
    for (const name of samples) {
      if (related[name]) return { source: name, edges: related[name] };
    }
    return { source: null, edges: [] };
  },
};

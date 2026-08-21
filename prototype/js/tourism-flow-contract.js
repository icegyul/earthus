// EARTHUS 관광·인간 흐름 정규화 계약 v1.
//
// 원칙
//   · 기관 혼잡 등급을 Earthus가 만든 점수로 바꾸지 않는다.
//   · 현재/기관 예측/추세를 서로 다른 필드와 sourceType으로 보존한다.
//   · 집계 인구만으로 이동 방향이나 화살표를 만들지 않는다.
//   · LIVE는 관측 시각이 신선하고 대체값이 아닐 때만 붙인다.

export const DATA_STATE = Object.freeze({
  LIVE: 'LIVE', DEGRADED: 'DEGRADED', STALE: 'STALE', UNAVAILABLE: 'UNAVAILABLE',
});

export const SOURCE_TYPE = Object.freeze({
  OFFICIAL_OBSERVATION: 'OFFICIAL_OBSERVATION',
  OFFICIAL_FORECAST: 'OFFICIAL_FORECAST',
  DERIVED_TREND: 'DERIVED_TREND',
});

const LEVEL_RANK = Object.freeze({
  '여유': 1, '보통': 2, '약간 붐빔': 3, '붐빔': 4,
  'relaxed': 1, 'normal': 2, 'slightly crowded': 3, 'crowded': 4,
});

const LEVEL_COLOR = Object.freeze({ 1: '#f5d58a', 2: '#f7aa45', 3: '#ef672e', 4: '#d93222' });

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 서울 API의 timezone 없는 문자는 KST로만 해석한다. */
export function parseSeoulTime(value) {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const s = Number(m[6] ?? 0);
  const at = new Date(Date.UTC(y, mo - 1, d, h - 9, mi, s));
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
}

function officialRows(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const direct = raw['SeoulRtd.citydata_ppltn'] || raw.citydata_ppltn || raw.CITYDATA_PPLTN;
  return Array.isArray(direct) ? direct : (direct ? [direct] : []);
}

function rankOf(level) {
  const text = String(level ?? '').trim();
  return LEVEL_RANK[text] ?? LEVEL_RANK[text.toLocaleLowerCase()] ?? null;
}

function populationRange(row, forecast = false) {
  const min = numberOrNull(row?.[forecast ? 'FCST_PPLTN_MIN' : 'AREA_PPLTN_MIN']);
  const max = numberOrNull(row?.[forecast ? 'FCST_PPLTN_MAX' : 'AREA_PPLTN_MAX']);
  return min == null || max == null ? null : { min, max };
}

export function normalizeSeoulPopulation(raw, options = {}) {
  const row = officialRows(raw)[0];
  if (!row) return Object.freeze({
    id: null, state: DATA_STATE.UNAVAILABLE, stateLabelKo: '자료 없음',
    reasonCodes: Object.freeze(['PROVIDER_RESPONSE_EMPTY']), provenance: null,
  });

  const code = String(row.AREA_CD || '').trim();
  const receivedAt = new Date(options.receivedAt || Date.now()).toISOString();
  const nowMs = new Date(options.now || receivedAt).getTime();
  const observedAt = parseSeoulTime(row.PPLTN_TIME);
  const observedMs = observedAt ? Date.parse(observedAt) : NaN;
  const ageMin = Number.isFinite(observedMs) ? Math.max(0, (nowMs - observedMs) / 60_000) : Infinity;
  const freshMinutes = Number(options.freshMinutes ?? 15);
  const unavailableMinutes = Number(options.unavailableMinutes ?? 120);
  const replacement = String(row.REPLACE_YN || '').toUpperCase() === 'Y';
  const reasonCodes = [];
  let state = DATA_STATE.LIVE;
  if (!Number.isFinite(observedMs) || ageMin > unavailableMinutes) {
    state = DATA_STATE.UNAVAILABLE;
    reasonCodes.push(!observedAt ? 'OBSERVED_AT_MISSING' : 'OBSERVATION_TOO_OLD');
  } else if (ageMin > freshMinutes) {
    state = DATA_STATE.STALE;
    reasonCodes.push('OBSERVATION_STALE');
  } else if (replacement) {
    state = DATA_STATE.DEGRADED;
    reasonCodes.push('PROVIDER_REPLACEMENT_VALUE');
  }

  const catalog = Array.isArray(options.catalog) ? options.catalog : [];
  const place = catalog.find(item => item.code === code) || null;
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) {
    reasonCodes.push('OFFICIAL_AREA_GEOMETRY_MISSING');
  }
  const position = place ? Object.freeze({
    lat: Number(place.lat), lon: Number(place.lon), source: '서울시 주요 121장소 영역',
  }) : null;

  const forecast = String(row.FCST_YN || '').toUpperCase() === 'Y' && Array.isArray(row.FCST_PPLTN)
    ? row.FCST_PPLTN.map(item => {
      const at = parseSeoulTime(item.FCST_TIME);
      const level = String(item.FCST_CONGEST_LVL || '').trim() || null;
      return at ? Object.freeze({
        at, level, rank: rankOf(level), populationRange: populationRange(item, true),
        sourceType: SOURCE_TYPE.OFFICIAL_FORECAST,
      }) : null;
    }).filter(Boolean)
    : [];

  const level = String(row.AREA_CONGEST_LVL || '').trim() || null;
  const rank = rankOf(level);
  const item = {
    id: code ? `earthus:tourism:seoul:${code}` : null,
    code,
    category: place?.category || null,
    nameKo: String(row.AREA_NM || place?.nameKo || code || '이름 없음'),
    nameEn: place?.nameEn || null,
    state,
    stateLabelKo: state === DATA_STATE.LIVE ? 'LIVE'
      : state === DATA_STATE.DEGRADED ? '제한된 실시간'
        : state === DATA_STATE.STALE ? '지난 관측' : '자료 없음',
    reasonCodes: Object.freeze(reasonCodes),
    observedAgeMinutes: Number.isFinite(ageMin) ? Math.round(ageMin * 10) / 10 : null,
    position,
    official: Object.freeze({
      level, rank, message: String(row.AREA_CONGEST_MSG || '').trim() || null,
      populationRange: populationRange(row), color: LEVEL_COLOR[rank] || '#9aa6b2',
      replacement, sourceType: SOURCE_TYPE.OFFICIAL_OBSERVATION,
    }),
    forecast: Object.freeze(forecast),
    flow: Object.freeze({
      scalarTrend: null,
      direction: Object.freeze({
        state: 'UNAVAILABLE', value: null,
        reason: 'OD 또는 이동 경로 근거가 없어 방향 화살표를 만들지 않습니다.',
      }),
    }),
    provenance: Object.freeze({
      sourceId: 'seoul-citydata-ppltn',
      sourceName: '서울특별시 실시간 인구데이터',
      sourceUrl: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do',
      observedAt, receivedAt,
      schemaVersion: 'earthus.tourism-flow.v1', processorVersion: 'tourism-flow-contract.v1',
      license: '공공누리 제1유형', redisplay: '출처표시 · 상업적 이용 및 변경 가능',
    }),
  };
  return Object.freeze(item);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Theil–Sen 계열의 pairwise median slope. 집계량만 반환하며 방향 벡터는 없다. */
export function deriveScalarTrend(history, config = {}) {
  const rows = (Array.isArray(history) ? history : [])
    .map(row => ({ at: Date.parse(row.observedAt), value: Number(row.midpoint) }))
    .filter(row => Number.isFinite(row.at) && Number.isFinite(row.value))
    .sort((a, b) => a.at - b.at);
  if (rows.length < 3) return Object.freeze({
    state: 'UNAVAILABLE', direction: 'UNKNOWN', perHour: null, flowDirection: null,
    method: 'robust pairwise median slope', reason: '관측 이력이 3개 미만입니다.',
  });
  const slopes = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const hours = (rows[j].at - rows[i].at) / 3_600_000;
      if (hours > 0) slopes.push((rows[j].value - rows[i].value) / hours);
    }
  }
  const perHour = median(slopes) ?? 0;
  const base = Math.max(1, median(rows.map(row => row.value)) || 1);
  const ratio = perHour / base;
  const threshold = Number(config.relativePerHourThreshold ?? 0.08);
  const direction = ratio >= threshold ? 'INCREASING' : ratio <= -threshold ? 'DECREASING' : 'STABLE';
  return Object.freeze({
    state: 'READY', direction, perHour: Math.round(perHour), relativePerHour: ratio,
    flowDirection: null, sourceType: SOURCE_TYPE.DERIVED_TREND,
    method: 'robust pairwise median slope', sampleCount: rows.length,
  });
}

export function evaluateBestTime(item, context = {}) {
  if (!item || ![DATA_STATE.LIVE, DATA_STATE.DEGRADED].includes(item.state) || !item.forecast?.length) {
    return Object.freeze({ state: 'UNAVAILABLE', at: null, labelKo: '공식 혼잡 예측 자료 없음' });
  }
  if (context.safetyGate?.blocksPositiveRecommendation) {
    return Object.freeze({ state: 'WITHHELD', at: null, labelKo: '공식 안전 근거 때문에 추천을 보류합니다.' });
  }
  const reference = Date.parse(context.now || item.provenance?.receivedAt || new Date().toISOString());
  const candidates = item.forecast.filter(row => row.rank != null && Date.parse(row.at) >= reference);
  if (!candidates.length) return Object.freeze({ state: 'UNAVAILABLE', at: null, labelKo: '비교할 공식 혼잡 예측 없음' });
  const selected = [...candidates].sort((a, b) => a.rank - b.rank
    || ((a.populationRange?.max ?? Infinity) - (b.populationRange?.max ?? Infinity))
    || Date.parse(a.at) - Date.parse(b.at))[0];
  const accessible = context.accessibility?.state === 'OPEN' && context.accessibility?.sourceId;
  return Object.freeze({
    state: accessible ? 'READY' : 'CROWD_ONLY', at: selected.at, level: selected.level,
    labelKo: accessible
      ? `공식 운영정보와 혼잡도 기준 · ${selected.level}`
      : `혼잡도 기준 가장 여유로운 시각 · ${selected.level}`,
    caveatKo: accessible ? null : '운영시간·입장 가능 여부는 확인되지 않았습니다.',
    basis: accessible ? 'OFFICIAL_CROWD_AND_ACCESSIBILITY' : 'OFFICIAL_CROWD_FORECAST_ONLY',
  });
}

export function rankAlternatives(items, selectedId, limit = 3) {
  return Object.freeze((Array.isArray(items) ? items : [])
    .filter(item => item?.id !== selectedId
      && [DATA_STATE.LIVE, DATA_STATE.DEGRADED].includes(item?.state)
      && item?.official?.rank != null)
    .sort((a, b) => a.official.rank - b.official.rank
      || ((a.official.populationRange?.max ?? Infinity) - (b.official.populationRange?.max ?? Infinity)))
    .slice(0, limit)
    .map(item => Object.freeze({
      id: item.id, nameKo: item.nameKo, nameEn: item.nameEn, level: item.official.level,
      rank: item.official.rank, basis: 'OFFICIAL_CURRENT_CONGESTION', observedAt: item.provenance?.observedAt,
    })));
}

export function buildTourismSnapshot(options = {}) {
  const catalog = Array.isArray(options.catalog) ? options.catalog : [];
  const responses = Array.isArray(options.responses) ? options.responses : [];
  const historyByCode = options.historyByCode || {};
  const places = responses.flatMap(raw => officialRows(raw).map(row => {
    const normalized = normalizeSeoulPopulation({
      RESULT: raw?.RESULT,
      'SeoulRtd.citydata_ppltn': [row],
    }, options);
    const scalarTrend = deriveScalarTrend(historyByCode[normalized.code] || []);
    return Object.freeze({
      ...normalized,
      flow: Object.freeze({ ...normalized.flow, scalarTrend }),
    });
  })).filter(place => place.id);
  const state = places.some(place => place.state === DATA_STATE.LIVE) ? DATA_STATE.LIVE
    : places.some(place => place.state === DATA_STATE.DEGRADED) ? DATA_STATE.DEGRADED
      : places.some(place => place.state === DATA_STATE.STALE) ? DATA_STATE.STALE
        : DATA_STATE.UNAVAILABLE;
  const mode = options.mode === 'FULL' ? 'FULL' : 'SAMPLE';
  const total = Number(options.officialTotal ?? 121);
  const available = places.filter(place => place.state !== DATA_STATE.UNAVAILABLE).length;
  const snapshot = Object.freeze({
    schemaVersion: 'earthus.tourism-flow.v1',
    generatedAt: new Date(options.receivedAt || Date.now()).toISOString(),
    state,
    provider: Object.freeze({
      id: 'seoul-citydata-ppltn', mode,
      endpointClass: 'OFFICIAL_PUBLIC_API',
    }),
    coverage: Object.freeze({
      available, total, fullCoverage: mode === 'FULL' && available === total,
      noteKo: mode === 'FULL'
        ? `서울시 공식 ${available}/${total}곳 응답`
        : '서울시 샘플 키 범위 · 광화문·덕수궁 1곳만 공식 조회',
    }),
    quality: Object.freeze({
      live: places.filter(place => place.state === DATA_STATE.LIVE).length,
      degraded: places.filter(place => place.state === DATA_STATE.DEGRADED).length,
      stale: places.filter(place => place.state === DATA_STATE.STALE).length,
      unavailable: places.filter(place => place.state === DATA_STATE.UNAVAILABLE).length,
      withOfficialForecast: places.filter(place => place.forecast?.length).length,
      withDirectionEvidence: places.filter(place => place.flow?.direction?.state === 'READY').length,
    }),
    places: Object.freeze(places),
    source: Object.freeze({
      name: '서울특별시 실시간 인구데이터',
      url: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do',
      license: '공공누리 제1유형',
    }),
  });
  validateTourismSnapshot(snapshot);
  return snapshot;
}

export function validateTourismSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== 'earthus.tourism-flow.v1') throw new Error('SNAPSHOT_SCHEMA_INVALID');
  if (!Object.values(DATA_STATE).includes(snapshot.state)) throw new Error('SNAPSHOT_STATE_INVALID');
  if (!Array.isArray(snapshot.places)) throw new Error('SNAPSHOT_PLACES_INVALID');
  for (const place of snapshot.places) {
    if (!place?.id || !Object.values(DATA_STATE).includes(place.state)) throw new Error('PLACE_CONTRACT_INVALID');
    if (place.state !== DATA_STATE.LIVE && place.stateLabelKo === 'LIVE') {
      throw new Error('STALE_CANNOT_BE_LIVE');
    }
    if (!place.provenance?.sourceId || !place.provenance?.receivedAt) {
      throw new Error('PLACE_PROVENANCE_MISSING');
    }
    if (place.flow?.direction?.state !== 'READY' && place.flow?.direction?.value) {
      throw new Error('FLOW_DIRECTION_WITHOUT_EVIDENCE');
    }
  }
  return true;
}

/**
 * 고정 크기 3D 표시 셀은 기관 추정 인구 범위를 낮은 상대 높이로 옮긴다.
 * 바닥 크기는 공식 구역·건물 면적이 아니며, 인구/면적을 수용력이나 안전 밀도로 해석하지 않는다.
 */
export function towerVisual(item, at = null) {
  if (!item?.position || item.state === DATA_STATE.UNAVAILABLE) return null;
  let evidence = item.official;
  let evidenceAt = item.provenance?.observedAt || null;
  let sourceType = SOURCE_TYPE.OFFICIAL_OBSERVATION;
  if (at && item.forecast?.length) {
    const wanted = Date.parse(at);
    const best = item.forecast
      .map(row => ({ row, gap: Math.abs(Date.parse(row.at) - wanted) }))
      .filter(pair => Number.isFinite(pair.gap) && pair.gap <= 45 * 60_000)
      .sort((a, b) => a.gap - b.gap)[0]?.row;
    if (best) {
      evidence = best;
      evidenceAt = best.at;
      sourceType = SOURCE_TYPE.OFFICIAL_FORECAST;
    }
  }
  const rank = Number(evidence?.rank);
  if (![1, 2, 3, 4].includes(rank)) return null;
  const range = evidence?.populationRange;
  const min = numberOrNull(range?.min), max = numberOrNull(range?.max);
  const midpoint = min != null && max != null ? (min + max) / 2 : null;
  // 50,000명 이상은 같은 상단 높이로 눌러 극단값이 도시 전체를 가리지 않게 한다.
  // 짝수 미터로 반올림하는 것은 표시 안정화일 뿐 실제 건물 높이라는 뜻이 아니다.
  const quantifiedHeight = midpoint == null ? null : Math.round((8 + 172
    * Math.sqrt(Math.min(50_000, Math.max(0, midpoint)) / 50_000)) / 2) * 2;
  const fallbackHeights = { 1: 44, 2: 84, 3: 132, 4: 172 };
  return Object.freeze({
    heightMeters: quantifiedHeight ?? fallbackHeights[rank], footprintMeters: 420,
    primitive: 'AREA_MARKER', footprintMeaning: 'FIXED_DISPLAY_CELL_NOT_OFFICIAL_AREA',
    color: LEVEL_COLOR[rank], alpha: item.state === DATA_STATE.STALE ? 0.66 : 0.9,
    level: evidence.level, rank, sourceType,
    at: evidenceAt ? new Date(evidenceAt).toISOString() : null,
    live: sourceType === SOURCE_TYPE.OFFICIAL_OBSERVATION && item.state === DATA_STATE.LIVE,
    animated: false,
    legendKo: '블록 높이 = 서울시 공식 추정 인구 범위 · 색 = 기관 혼잡 등급 · 바닥 = 고정 표시 셀',
  });
}

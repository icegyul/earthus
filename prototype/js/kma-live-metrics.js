// 기상청 Live 화면의 순수 집계 함수.
//
// 화면용 순위·분포를 서버나 AI가 지어내지 않게 원자료 배열만 입력으로 받는다.
// 임계값으로 '위험/안전'을 새로 붙이지 않고, 극값·표본수·경험적 백분위만 돌려준다.

const number = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) ? Number(value) : null;

export function parseKmaTime(value) {
  const text = String(value || '').replace(/[^0-9]/g, '');
  if (text.length < 10) return null;
  const minute = text.length >= 12 ? text.slice(10, 12) : '00';
  const second = text.length >= 14 ? text.slice(12, 14) : '00';
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
    + `T${text.slice(8, 10)}:${minute}:${second}+09:00`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function parseKmaUtcTime(value) {
  const text = String(value || '').replace(/[^0-9]/g, '');
  if (text.length < 10) return null;
  const minute = text.length >= 12 ? text.slice(10, 12) : '00';
  const second = text.length >= 14 ? text.slice(12, 14) : '00';
  const date = new Date(Date.UTC(
    Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)),
    Number(text.slice(8, 10)), Number(minute), Number(second),
  ));
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseEvidenceTime(value, compactZone = 'KST') {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{10,14}$/.test(text.replace(/[^0-9]/g, ''))) {
    return compactZone === 'UTC' ? parseKmaUtcTime(text) : parseKmaTime(text);
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function evidenceTime(doc, { compactZone = 'KST', itemKeys = [] } = {}) {
  const direct = [doc?.observedAt, doc?.observedKst, doc?.requestedKst, doc?.issuedAt,
    doc?.validAt, doc?.generated, doc?.generatedAt];
  for (const value of direct) {
    const parsed = parseEvidenceTime(value, compactZone);
    if (parsed) return parsed;
  }
  const values = [];
  for (const key of itemKeys) {
    for (const row of doc?.[key] || []) {
      for (const field of ['tm', 'observedAt', 'issuedAt', 'time']) {
        const parsed = parseEvidenceTime(row?.[field], compactZone);
        if (parsed) values.push(parsed);
      }
    }
  }
  return values.sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

/**
 * 서로 다른 기상 근거를 같은 시각으로 둔갑시키지 않는 비교용 시간축.
 *
 * 레이더·낙뢰·AWS·특보의 최신 근거시각과 표본수만 정렬한다. 값을 평균하거나
 * 공간/시간 보간하지 않으며, 시각을 찾을 수 없는 source도 UNKNOWN 행으로 보존한다.
 */
export function evidenceTimeline({ radar = null, lightning = null, aws = null, warning = null } = {}, nowMs = Date.now()) {
  const specs = [
    {
      id: 'RADAR', kind: 'OBSERVATION_IMAGERY', doc: radar,
      at: evidenceTime(radar), count: radar?.image?.bytes != null ? 1 : null,
      countLabel: 'frame', precision: radar?.updateMinutes ? `${radar.updateMinutes} min` : null,
    },
    {
      id: 'LIGHTNING', kind: 'DETECTION', doc: lightning,
      at: evidenceTime(lightning, { itemKeys: ['strikes'] }),
      count: number(lightning?.count) ?? number(lightning?.totalDetected),
      countLabel: 'detections', precision: lightning?.windowMinutes ? `${lightning.windowMinutes} min window` : null,
    },
    {
      id: 'AWS', kind: 'GROUND_OBSERVATION', doc: aws,
      at: evidenceTime(aws, { itemKeys: ['stations'] }),
      count: number(aws?.count) ?? (Array.isArray(aws?.stations) ? aws.stations.length : null),
      countLabel: 'stations', precision: 'station observations',
    },
    {
      id: 'WARNING', kind: 'OFFICIAL_BULLETIN', doc: warning,
      at: evidenceTime(warning, { itemKeys: ['warnings', 'items'] }),
      count: number(warning?.activeCount) ?? number(warning?.count)
        ?? (Array.isArray(warning?.warnings) ? warning.warnings.length : null),
      countLabel: 'active records', precision: 'official bulletin',
    },
  ];
  const rows = specs.filter(spec => spec.doc).map(spec => {
    const atMs = spec.at?.getTime() ?? null;
    const ageMinutes = atMs == null ? null : Math.max(0, Math.floor((nowMs - atMs) / 60_000));
    return Object.freeze({
      id: spec.id,
      kind: spec.kind,
      at: spec.at?.toISOString() || null,
      ageMinutes,
      count: spec.count,
      countLabel: spec.countLabel,
      precision: spec.precision,
      source: spec.doc.source || spec.doc.sourceEn || null,
      state: atMs == null ? 'UNKNOWN' : (atMs > nowMs + 5 * 60_000 ? 'FUTURE_CLOCK_SKEW' : 'OBSERVED'),
    });
  });
  rows.sort((a, b) => {
    if (a.at === null) return 1;
    if (b.at === null) return -1;
    return b.at.localeCompare(a.at) || a.id.localeCompare(b.id);
  });
  return Object.freeze(rows);
}

export function nearestForecastHour(point, nowMs = Date.now()) {
  const hours = (point?.hourly || []).map(row => ({ ...row, at: parseKmaTime(row.tm) }))
    .filter(row => row.at && row.at.getTime() >= nowMs - 60 * 60_000);
  return hours[0] || null;
}

export function forecastHighlights(points, nowMs = Date.now()) {
  const candidates = (points || []).map(point => {
    const hour = nearestForecastHour(point, nowMs);
    return hour ? { id: point.id, name: point.name, lat: point.lat, lon: point.lon, ...hour } : null;
  }).filter(Boolean);
  // 결측 한 칸 때문에 서로 다른 유효시각이 한 순위에 섞이지 않게 가장 많이 공유하는 시각만 비교한다.
  const counts = candidates.reduce((map, row) => map.set(row.tm, (map.get(row.tm) || 0) + 1), new Map());
  const validAt = [...counts.entries()].sort((a, b) => b[1] - a[1]
    || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || null;
  const rows = candidates.filter(row => row.tm === validAt);
  const ranked = (field, direction = 'desc') => rows.filter(row => number(row[field]) !== null)
    .sort((a, b) => direction === 'asc'
      ? number(a[field]) - number(b[field]) : number(b[field]) - number(a[field]));
  return Object.freeze({
    sampleCount: rows.length,
    validAt,
    hottest: Object.freeze(ranked('t').slice(0, 5)),
    coolest: Object.freeze(ranked('t', 'asc').slice(0, 5)),
    wettest: Object.freeze(ranked('pop').slice(0, 5)),
    windiest: Object.freeze(ranked('ws').slice(0, 5)),
  });
}

export function empiricalPercentile(values, current) {
  const clean = (values || []).map(number).filter(value => value !== null).sort((a, b) => a - b);
  const target = number(current);
  if (!clean.length || target === null) return null;
  const below = clean.filter(value => value < target).length;
  const same = clean.filter(value => value === target).length;
  return Math.round(((below + same * 0.5) / clean.length) * 100);
}

export function upperAirSummary(nowDoc, seriesDoc) {
  const stations = nowDoc?.stations || [];
  const values = key => stations.map(row => number(row[key])).filter(value => value !== null);
  const mean = xs => xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
  const extrema = (xs, type) => xs.length ? (type === 'min' ? Math.min(...xs) : Math.max(...xs)) : null;
  const times = stations.map(row => String(row.tm || '')).filter(Boolean).sort();
  const latestAt = times[times.length - 1] || null;
  const latestDay = latestAt?.slice(0, 8);
  const today = latestDay && seriesDoc?.days?.[latestDay] ? seriesDoc.days[latestDay] : null;
  const historical = Object.entries(seriesDoc?.days || {}).filter(([day]) => day !== latestDay).map(([, row]) => row);
  const metric = (key, current) => ({
    value: current,
    percentile: empiricalPercentile(historical.map(row => row[key]), current),
    historicalN: historical.map(row => number(row[key])).filter(value => value !== null).length,
  });
  return Object.freeze({
    stationCount: stations.length,
    latestAt,
    missing: Object.freeze({
      cape: stations.length - values('cape').length,
      tpw: stations.length - values('tpw').length,
      ki: stations.length - values('ki').length,
      li: stations.length - values('li').length,
    }),
    tpw: Object.freeze(metric('tpw', today?.tpw ?? mean(values('tpw')))),
    ki: Object.freeze(metric('ki', today?.ki ?? mean(values('ki')))),
    li: Object.freeze(metric('li', today?.li ?? mean(values('li')))),
    capeMax: Object.freeze(metric('capeMax', today?.capeMax ?? extrema(values('cape'), 'max'))),
  });
}

export function windProfileSummary(doc) {
  const stations = (doc?.stations || []).map(station => {
    const levels = (station.levels || []).filter(row => number(row.heightM) !== null)
      .sort((a, b) => number(a.heightM) - number(b.heightM) || String(a.mode).localeCompare(String(b.mode)));
    const withWind = levels.filter(row => number(row.windSpeedMs) !== null);
    const strongest = [...withWind].sort((a, b) => number(b.windSpeedMs) - number(a.windSpeedMs))[0] || null;
    const sampleStep = Math.max(1, Math.ceil(levels.length / 12));
    return Object.freeze({
      stn: String(station.stn || ''),
      levelCount: levels.length,
      missingWind: levels.length - withWind.length,
      minHeightM: levels.length ? number(levels[0].heightM) : null,
      maxHeightM: levels.length ? number(levels[levels.length - 1].heightM) : null,
      strongest: strongest ? Object.freeze({ heightM: number(strongest.heightM),
        windSpeedMs: number(strongest.windSpeedMs), mode: strongest.mode }) : null,
      // 실제 관측 행만 성긴 표본으로 고른다. 고도 사이를 보간해 새 값을 만들지 않는다.
      sampledLevels: Object.freeze(levels.filter((_row, index) => index % sampleStep === 0).slice(0, 12)),
    });
  }).filter(station => station.levelCount > 0).sort((a, b) => a.stn.localeCompare(b.stn));
  return Object.freeze({
    observedUtc: doc?.observedUtc || null,
    stationCount: stations.length,
    levelCount: stations.reduce((sum, station) => sum + station.levelCount, 0),
    stations: Object.freeze(stations),
  });
}

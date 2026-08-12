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

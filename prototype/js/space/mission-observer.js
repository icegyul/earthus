// Coordinates stay in memory. Manual city selection uses the existing offline place catalogue.
export function normalizeObserver(value) {
  if (value?.lat == null || value?.lon == null || value.lat === '' || value.lon === '') return null;
  const lat = Number(value.lat), lon = Number(value.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, alt: 0, name: String(value.name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`),
    source: value.source || '선택 좌표' };
}

export function parseObserverInput(input, places = []) {
  const text = String(input || '').trim();
  const coordinates = text.match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
  if (coordinates) return normalizeObserver({ lat: coordinates[1], lon: coordinates[2], source: '직접 입력 좌표' });
  const name = text.toLocaleLowerCase().replace(/\s+/g, '');
  const city = places.find(p => [p.ko, p.en, `${p.ko} · ${p.countryKo}`]
    .some(label => String(label).toLocaleLowerCase().replace(/\s+/g, '') === name));
  return city ? normalizeObserver({ ...city, name: `${city.ko} · ${city.countryKo}`, source: '지명표 대표 좌표' }) : null;
}

// NOAA SWPC JSON timestamps without an offset are UTC, never the browser's local timezone.
export function parseNoaaTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let text = value.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) text += 'Z';
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function latestNoaaKp(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map(row => {
    if (row?.kp_index == null || row.kp_index === '') return null;
    const value = Number(row.kp_index), observedAt = parseNoaaTimestamp(row.time_tag);
    return observedAt && Number.isFinite(value) && value >= 0 && value <= 9 ? { value, observedAt } : null;
  }).filter(Boolean).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] || null;
}

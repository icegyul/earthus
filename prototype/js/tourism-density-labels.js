function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function midpoint(place) {
  const minimum = finite(place?.official?.populationRange?.min);
  const maximum = finite(place?.official?.populationRange?.max);
  return minimum == null || maximum == null ? 0 : (minimum + maximum) / 2;
}

function adminFor(adminByPlaceId, placeId) {
  if (adminByPlaceId instanceof Map) return adminByPlaceId.get(placeId) || null;
  return adminByPlaceId?.[placeId] || null;
}

function rankCandidate(left, right) {
  return (finite(right?.rank) ?? finite(right?.priority) ?? 0)
      - (finite(left?.rank) ?? finite(left?.priority) ?? 0)
    || (finite(right?.populationMidpoint) ?? 0) - (finite(left?.populationMidpoint) ?? 0)
    || (finite(right?.observedAtMs) ?? 0) - (finite(left?.observedAtMs) ?? 0)
    || String(left?.id || '').localeCompare(String(right?.id || ''), 'ko');
}

function placeCandidate(place, admin) {
  const placeNameKo = String(place?.nameKo || '').trim();
  const districtNameKo = String(admin?.nameKo || '').trim();
  const rank = finite(place?.official?.rank) ?? 0;
  const populationMidpoint = midpoint(place);
  const observedAtMs = Date.parse(place?.provenance?.observedAt || '') || 0;
  return Object.freeze({
    id: `place:${place.id}`,
    kind: 'place',
    text: districtNameKo ? `${districtNameKo} · ${placeNameKo}` : placeNameKo,
    placeId: place.id,
    placeNameKo,
    districtNameKo: districtNameKo || null,
    lat: Number(place.position.lat),
    lon: Number(place.position.lon),
    rank,
    populationMidpoint,
    observedAtMs,
    priority: rank,
  });
}

export function buildTourismLabelCandidates(places, adminByPlaceId, options = {}) {
  const lod = ['overview', 'district', 'detail'].includes(options?.lod) ? options.lod : 'overview';
  const fallbackLimit = lod === 'detail' ? 12 : 10;
  const limit = Math.max(0, Math.floor(finite(options?.limit) ?? fallbackLimit));
  const eligible = (Array.isArray(places) ? places : []).filter(place =>
    place?.id && String(place?.nameKo || '').trim()
      && Number.isFinite(Number(place?.position?.lat))
      && Number.isFinite(Number(place?.position?.lon)),
  );

  if (lod !== 'overview') {
    return Object.freeze(eligible.map(place => placeCandidate(
      place, adminFor(adminByPlaceId, place.id),
    )).sort(rankCandidate).slice(0, limit));
  }

  const districts = new Map();
  const fallback = [];
  for (const place of eligible) {
    const admin = adminFor(adminByPlaceId, place.id);
    const districtNameKo = String(admin?.nameKo || '').trim();
    if (!districtNameKo) {
      fallback.push(placeCandidate(place, null));
      continue;
    }
    const regionNameKo = String(admin?.regionKo || '').trim();
    const key = `${regionNameKo}:${districtNameKo}`;
    const weight = Math.max(1, midpoint(place));
    const row = districts.get(key) || {
      id: `district:${key}`,
      kind: 'district',
      text: districtNameKo,
      districtNameKo,
      regionNameKo: regionNameKo || null,
      latWeight: 0,
      lonWeight: 0,
      totalWeight: 0,
      rank: 0,
      populationMidpoint: 0,
      observedAtMs: 0,
      placeIds: [],
    };
    row.latWeight += Number(place.position.lat) * weight;
    row.lonWeight += Number(place.position.lon) * weight;
    row.totalWeight += weight;
    row.rank = Math.max(row.rank, finite(place?.official?.rank) ?? 0);
    row.populationMidpoint += midpoint(place);
    row.observedAtMs = Math.max(row.observedAtMs, Date.parse(place?.provenance?.observedAt || '') || 0);
    row.placeIds.push(place.id);
    districts.set(key, row);
  }

  const districtCandidates = [...districts.values()].map(row => Object.freeze({
    id: row.id,
    kind: row.kind,
    text: row.text,
    districtNameKo: row.districtNameKo,
    regionNameKo: row.regionNameKo,
    lat: row.latWeight / row.totalWeight,
    lon: row.lonWeight / row.totalWeight,
    rank: row.rank,
    populationMidpoint: row.populationMidpoint,
    observedAtMs: row.observedAtMs,
    priority: row.rank,
    placeIds: Object.freeze(row.placeIds),
  }));
  return Object.freeze([...districtCandidates, ...fallback].sort(rankCandidate).slice(0, limit));
}

function projectedRect(projectedRects, candidate, index) {
  if (projectedRects instanceof Map) return projectedRects.get(candidate.id);
  if (Array.isArray(projectedRects)) return projectedRects[index];
  return projectedRects?.[candidate.id];
}

function usableRect(rect) {
  return rect?.visible !== false
    && [rect?.left, rect?.top, rect?.right, rect?.bottom].every(Number.isFinite)
    && rect.right > rect.left && rect.bottom > rect.top
    && rect.right > 0 && rect.bottom > 0
    && (rect.viewportWidth == null || rect.left < rect.viewportWidth)
    && (rect.viewportHeight == null || rect.top < rect.viewportHeight);
}

function intersects(left, right) {
  return left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top;
}

export function selectNonOverlappingLabels(candidates, projectedRects, limit) {
  const maximum = Math.max(0, Math.floor(finite(limit) ?? 0));
  if (!maximum) return Object.freeze([]);
  const indexed = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({ candidate, rect: projectedRect(projectedRects, candidate, index) }))
    .filter(item => usableRect(item.rect))
    .sort((left, right) => rankCandidate(left.candidate, right.candidate));
  const selected = [];
  const occupied = [];
  for (const item of indexed) {
    if (occupied.some(rect => intersects(rect, item.rect))) continue;
    selected.push(item.candidate);
    occupied.push(item.rect);
    if (selected.length >= maximum) break;
  }
  return Object.freeze(selected);
}

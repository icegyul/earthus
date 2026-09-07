const PRIORITY = Object.freeze({ SAFETY: 100, ITINERARY: 80, WEATHER: 70, POI: 60, INTELLIGENCE: 40, MEDIA: 10 });

export function buildOfflineTripPackPlan({
  tripId,
  countryId,
  startAt,
  endAt,
  entitlement = 'FREE',
  maxBytes = 150 * 1024 * 1024,
  assets = [],
}) {
  if (!tripId || !countryId || !startAt || !endAt || Date.parse(startAt) > Date.parse(endAt)) throw new TypeError('valid trip identity and range are required');
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new RangeError('maxBytes must be positive');
  const eligible = assets.filter((asset) => {
    if (!asset?.id || !Number.isFinite(asset.bytes) || asset.bytes < 0) return false;
    if (asset.rightsAllowed === false) return false;
    if (asset.premium === true && entitlement === 'FREE') return false;
    return true;
  }).map((asset) => ({ ...asset, priority: PRIORITY[asset.kind] ?? 0 }))
    .sort((a, b) => b.priority - a.priority || a.bytes - b.bytes || a.id.localeCompare(b.id));

  const selected = [];
  let bytes = 0;
  for (const asset of eligible) {
    if (bytes + asset.bytes > maxBytes && asset.kind !== 'SAFETY') continue;
    selected.push(asset);
    bytes += asset.bytes;
  }
  const includedIds = new Set(selected.map((asset) => asset.id));
  const missingSafety = assets.filter((asset) => asset.kind === 'SAFETY' && asset.rightsAllowed !== false && !includedIds.has(asset.id));
  if (missingSafety.length) return Object.freeze({ allowed: false, reason: 'SAFETY_ASSET_BUDGET_FAILURE', missingSafety: Object.freeze(missingSafety.map((x) => x.id)) });

  return Object.freeze({
    allowed: true,
    schemaVersion: 'earthus.offline-trip-pack.v2.0',
    tripId,
    countryId,
    startAt,
    endAt,
    entitlement,
    bytes,
    maxBytes,
    assetIds: Object.freeze(selected.map((asset) => asset.id)),
    safetyAlwaysIncluded: true,
    expiresAt: new Date(Date.parse(endAt) + 48 * 3600 * 1000).toISOString(),
  });
}

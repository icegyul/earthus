const PRECISION = Object.freeze({
  EXACT_PUBLIC: 'EXACT_PUBLIC',
  CITY: 'CITY',
  REGION: 'REGION',
  COUNTRY: 'COUNTRY',
  MAP_DISABLED: 'MAP_DISABLED',
});

export function resolvePublicLocationPrecision(input = {}) {
  const explicit = String(input.locationPrecision || '').toUpperCase();
  if (Object.values(PRECISION).includes(explicit)) return explicit;
  if (input.publicAddress || (Number.isFinite(input.lat) && Number.isFinite(input.lon) && input.coordinatesExplicitlyPublished === true)) return PRECISION.EXACT_PUBLIC;
  if (input.city) return PRECISION.CITY;
  if (input.region) return PRECISION.REGION;
  if (input.country) return PRECISION.COUNTRY;
  return PRECISION.MAP_DISABLED;
}

export function publicMapLocator(input = {}) {
  const precision = resolvePublicLocationPrecision(input);
  if (precision === PRECISION.EXACT_PUBLIC) {
    if (input.publicAddress) return { precision, address: input.publicAddress };
    return { precision, lat: input.lat, lon: input.lon };
  }
  if (precision === PRECISION.CITY) return { precision, label: input.city, disambig: [input.region, input.country].filter(Boolean).join(', ') || null };
  if (precision === PRECISION.REGION) return { precision, label: input.region, disambig: input.country || null };
  if (precision === PRECISION.COUNTRY) return { precision, label: input.country };
  return { precision, disabled: true };
}

export { PRECISION };

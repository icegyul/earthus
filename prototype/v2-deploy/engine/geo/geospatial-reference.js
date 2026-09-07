import { haversineMeters } from '../core/math.js';

export function normalizeLongitude(value) {
  if (!Number.isFinite(value)) throw new TypeError('longitude must be finite');
  let result = ((value + 180) % 360 + 360) % 360 - 180;
  if (result === -180 && value > 0) result = 180;
  return result;
}

export function validateLatitude(value) {
  if (!Number.isFinite(value) || value < -90 || value > 90) throw new RangeError('latitude must be in [-90,90]');
  return value;
}

export function unwrapLongitudes(longitudes) {
  if (!Array.isArray(longitudes) || !longitudes.length) return [];
  const result = [normalizeLongitude(longitudes[0])];
  for (let index = 1; index < longitudes.length; index += 1) {
    let next = normalizeLongitude(longitudes[index]);
    while (next - result.at(-1) > 180) next -= 360;
    while (next - result.at(-1) < -180) next += 360;
    result.push(next);
  }
  return result;
}

function flattenCoordinates(geometry) {
  if (!geometry || typeof geometry !== 'object') throw new TypeError('geometry is required');
  switch (geometry.type) {
    case 'Point': return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString': return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon': return geometry.coordinates.flat(1);
    case 'MultiPolygon': return geometry.coordinates.flat(2);
    default: throw new TypeError(`unsupported geometry type: ${geometry.type}`);
  }
}

export function geometryBounds(geometry) {
  const coordinates = flattenCoordinates(geometry).filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (!coordinates.length) throw new TypeError('geometry has no valid coordinates');
  const lats = coordinates.map((point) => validateLatitude(point[1]));
  const normalized = coordinates.map((point) => normalizeLongitude(point[0]));
  const unwrapped = unwrapLongitudes(normalized);
  const span = Math.max(...unwrapped) - Math.min(...unwrapped);
  const naiveSpan = Math.max(...normalized) - Math.min(...normalized);
  const chosen = span <= naiveSpan ? unwrapped : normalized;
  const westRaw = Math.min(...chosen);
  const eastRaw = Math.max(...chosen);
  const centerRaw = (westRaw + eastRaw) / 2;
  return Object.freeze({
    west: normalizeLongitude(westRaw),
    east: normalizeLongitude(eastRaw),
    south: Math.min(...lats),
    north: Math.max(...lats),
    centerLon: normalizeLongitude(centerRaw),
    centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitudeSpanDeg: eastRaw - westRaw,
    latitudeSpanDeg: Math.max(...lats) - Math.min(...lats),
    crossesAntimeridian: chosen === unwrapped && naiveSpan > 180,
  });
}

function ringCentroid(ring) {
  const valid = ring.filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (!valid.length) return null;
  const unwrapped = unwrapLongitudes(valid.map((point) => point[0]));
  return {
    lon: normalizeLongitude(unwrapped.reduce((sum, value) => sum + value, 0) / unwrapped.length),
    lat: valid.reduce((sum, point) => sum + point[1], 0) / valid.length,
  };
}

export function geometryCentroid(geometry) {
  if (geometry.type === 'Point') return Object.freeze({ lon: normalizeLongitude(geometry.coordinates[0]), lat: validateLatitude(geometry.coordinates[1]) });
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (polygons) {
    const centers = polygons.map((polygon) => ringCentroid(polygon[0] ?? [])).filter(Boolean);
    if (centers.length) {
      const unwrapped = unwrapLongitudes(centers.map((center) => center.lon));
      return Object.freeze({ lon: normalizeLongitude(unwrapped.reduce((sum, value) => sum + value, 0) / unwrapped.length), lat: centers.reduce((sum, center) => sum + center.lat, 0) / centers.length });
    }
  }
  const bounds = geometryBounds(geometry);
  return Object.freeze({ lon: bounds.centerLon, lat: bounds.centerLat });
}

function pointInRing(point, ring) {
  const x = normalizeLongitude(point.lon);
  const y = validateLatitude(point.lat);
  const lons = unwrapLongitudes(ring.map((entry) => entry[0]));
  const reference = lons[0] ?? x;
  let px = x;
  while (px - reference > 180) px -= 360;
  while (px - reference < -180) px += 360;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = lons[i]; const yi = ring[i][1];
    const xj = lons[j]; const yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (px < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!polygons) throw new TypeError('pointInGeometry supports Polygon/MultiPolygon only');
  return polygons.some((polygon) => {
    if (!pointInRing(point, polygon[0] ?? [])) return false;
    return !(polygon.slice(1).some((hole) => pointInRing(point, hole)));
  });
}

export function geometryApproxDiameterM(geometry) {
  const bounds = geometryBounds(geometry);
  const northWest = { lat: bounds.north, lon: bounds.west };
  const southEast = { lat: bounds.south, lon: bounds.east };
  return haversineMeters(northWest, southEast);
}

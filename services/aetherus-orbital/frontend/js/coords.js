/**
 * Presentation-only coordinate helpers.
 *
 * No propagation and no frame math beyond placing an API-supplied geodetic
 * fix into the scene: lat/lon/alt arrive from the Aetherus API, this module
 * only converts degrees + kilometres into scene units.
 */

export const EARTH_EQUATORIAL_KM = 6378.137;
export const SCENE_EARTH_RADIUS = 1;
export const KM_TO_SCENE = SCENE_EARTH_RADIUS / EARTH_EQUATORIAL_KM;

const DEG = Math.PI / 180;

export function geodeticToScene(latDeg, lonDeg, altKm) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const radius = SCENE_EARTH_RADIUS + altKm * KM_TO_SCENE;
  const cosLat = Math.cos(lat);
  return {
    x: radius * cosLat * Math.sin(lon),
    y: radius * Math.sin(lat),
    z: radius * cosLat * Math.cos(lon) * -1,
  };
}

export function formatAge(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function formatNum(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUtc(iso) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${parsed.toISOString().replace("T", " ").replace(".000Z", "Z").replace(/\.\d+Z$/, "Z")}`;
}

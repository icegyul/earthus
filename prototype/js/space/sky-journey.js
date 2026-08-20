// Aetherus My Sky journey math.
//
// Astronomy engine outputs horizontal coordinates with azimuth north=0/east=90 and geometric altitude.
// This module maps that local observer frame into the same right-handed y-up convention used by the
// Aetherus WebGL camera without pretending ENU is an inertial/galactic frame.
//
// Local render axes:
//   +X = east, +Y = up, -Z = north.
// Therefore looking north at the horizon is camera direction (0,0,-1), east is (+1,0,0),
// and zenith is (0,+1,0). This is a view-space bridge only; it never feeds back into ephemerides.

import {
  finiteVector,
  horizontalToEnu,
  normalizeVector,
} from './coordinates.js';

export const MY_SKY_RENDER_FRAME = 'observer-local-enu-right-handed-y-up';

export function horizontalToMySkyDirection(horizontal) {
  const enu = horizontalToEnu(horizontal);
  return Object.freeze(normalizeVector({
    x: enu.x,
    y: enu.z,
    z: -enu.y,
  }));
}

export function cameraYawPitchForDirection(direction) {
  const value = normalizeVector(finiteVector(direction, 'MY_SKY_DIRECTION'));
  return Object.freeze({
    yaw: Math.atan2(value.x, value.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, value.y))),
  });
}

export function mySkyCardinalDirection(cardinal) {
  const id = String(cardinal || '').trim().toUpperCase();
  const directions = {
    N: { x: 0, y: 0, z: -1 },
    E: { x: 1, y: 0, z: 0 },
    S: { x: 0, y: 0, z: 1 },
    W: { x: -1, y: 0, z: 0 },
    Z: { x: 0, y: 1, z: 0 },
  };
  if (!directions[id]) throw new RangeError(`UNKNOWN_MY_SKY_CARDINAL:${id || 'empty'}`);
  return Object.freeze({ ...directions[id] });
}

export function skyJourneySelfTest(tolerance = 1e-12) {
  const north = horizontalToMySkyDirection({ altitudeDeg: 0, azimuthDeg: 0 });
  const east = horizontalToMySkyDirection({ altitudeDeg: 0, azimuthDeg: 90 });
  const zenith = horizontalToMySkyDirection({ altitudeDeg: 90, azimuthDeg: 0 });
  const max = (...values) => Math.max(...values.map(Math.abs));
  const northError = max(north.x, north.y, north.z + 1);
  const eastError = max(east.x - 1, east.y, east.z);
  const zenithError = max(zenith.x, zenith.y - 1, zenith.z);
  const camera = cameraYawPitchForDirection(east);
  return Object.freeze({
    ok: northError <= tolerance && eastError <= tolerance && zenithError <= tolerance
      && Math.abs(camera.yaw - Math.PI / 2) <= tolerance && Math.abs(camera.pitch) <= tolerance,
    northError,
    eastError,
    zenithError,
    eastYawError: Math.abs(camera.yaw - Math.PI / 2),
  });
}

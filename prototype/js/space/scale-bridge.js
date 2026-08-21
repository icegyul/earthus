// Aetherus multi-scale render bridge.
//
// 물리 좌표를 바꾸지 않고 "어떤 단계에서 어떻게 보일지"만 결정한다.
// solar AU / galactocentric kpc / experience scene-unit은 서로 다른 단위이며,
// 합성 결과에 scaleMode 메타데이터를 남겨 화면 과장이 물리값처럼 재사용되지 않게 한다.

import {
  addVectors,
  finiteVector,
  normalizeVector,
  radialDisplayVector,
  scaleVector,
  subtractVectors,
  toAetherusRender,
} from './coordinates.js';

export const SCALE_BRIDGE = Object.freeze({
  solarOrbit: 'solar-radial-log-v1',
  solarTrail: 'solar-displacement-direction-exaggerated-v1',
  galactic: 'galactocentric-linear-v1',
});

export function solarOrbitDisplayRadius(au) {
  const radius = Number(au);
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('ORBIT_RADIUS_AU_REQUIRED');
  // 태양계 근접 뷰와 Solar Motion이 같은 화면 반지름 함수를 써야 현재 행성 점과
  // 과거 trail 끝점이 정확히 포개진다. 물리 AU는 그대로 두고 이 함수에서만
  // Experience용 반지름을 만든다.
  return 3.5 + 7 * Math.log1p(radius * 1.4);
}

export function solarOrbitOffsetRender(physicalGalacticAu) {
  const displayGalactic = radialDisplayVector(physicalGalacticAu, solarOrbitDisplayRadius);
  return Object.freeze({
    render: Object.freeze(toAetherusRender(displayGalactic)),
    displayGalactic: Object.freeze(displayGalactic),
    scaleMode: SCALE_BRIDGE.solarOrbit,
  });
}

// 실제 태양/SSB의 1년 변위는 은하 크기에 비해 너무 작다. 방향은 물리 변위에서 얻고,
// 길이만 Experience용 halfTravelSceneUnits로 독립 확대한다.
export function solarTrailCenterRender({
  physicalKpc,
  midpointKpc,
  halfTravelSceneUnits = 42,
  fallbackDirectionGalactic = null,
  progress = 0.5,
} = {}) {
  const physical = finiteVector(physicalKpc, 'GALACTOCENTRIC_POSITION');
  const midpointValue = finiteVector(midpointKpc, 'GALACTOCENTRIC_MIDPOINT');
  const halfTravel = Number(halfTravelSceneUnits);
  if (!Number.isFinite(halfTravel) || halfTravel <= 0) throw new RangeError('POSITIVE_TRAVEL_SCENE_SCALE_REQUIRED');
  const displacement = subtractVectors(physical, midpointValue);
  const length = Math.hypot(displacement.x, displacement.y, displacement.z);
  let displayGalactic;
  if (length > 0) {
    const direction = normalizeVector(displacement);
    const magnitude = Math.abs(Number(progress) * 2 - 1) * halfTravel;
    displayGalactic = scaleVector(direction, magnitude);
  } else if (fallbackDirectionGalactic) {
    const signedDistance = (Number(progress) * 2 - 1) * halfTravel;
    displayGalactic = scaleVector(normalizeVector(fallbackDirectionGalactic), signedDistance);
  } else {
    displayGalactic = { x: 0, y: 0, z: 0 };
  }
  return Object.freeze({
    render: Object.freeze(toAetherusRender(displayGalactic)),
    displayGalactic: Object.freeze(displayGalactic),
    physicalDisplacementKpc: Object.freeze(displacement),
    scaleMode: SCALE_BRIDGE.solarTrail,
  });
}

export function composeSolarExperienceRender({ centerRender, orbitRender }) {
  return Object.freeze({
    render: Object.freeze(addVectors(centerRender, orbitRender)),
    scaleMode: `${SCALE_BRIDGE.solarTrail}+${SCALE_BRIDGE.solarOrbit}`,
  });
}

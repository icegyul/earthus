// 8행성 태양중심 황도 좌표 (J2000 ecliptic, AU)
//
// 정본 출처: NASA/JPL Solar System Dynamics,
// "Keplerian Elements for Approximate Positions of the Major Planets"
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Table 1 (1800 AD–2050 AD). 상수는 표의 요소와 세기당 변화율을 그대로 옮겼다.
// ⚠️ 근사식이다. 항해·관측 조준·우주비행에 쓰지 말고 JPL Horizons를 써야 한다.

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;
const J2000 = 2_451_545.0;

// [a, e, I, L, long.peri., long.node.] / [각 세기당 변화율]
export const PLANET_ELEMENTS = Object.freeze({
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
            [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
            [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
            [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
});

const wrapRadians = angle => {
  const wrapped = angle % (Math.PI * 2);
  return wrapped > Math.PI ? wrapped - Math.PI * 2
    : wrapped < -Math.PI ? wrapped + Math.PI * 2 : wrapped;
};

export function julianDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) throw new RangeError('VALID_DATE_REQUIRED');
  return value.getTime() / DAY_MS + 2_440_587.5;
}

function elementsAt(id, date) {
  const table = PLANET_ELEMENTS[id];
  if (!table) throw new RangeError(`UNKNOWN_PLANET:${id}`);
  const jd = julianDate(date);
  const centuries = (jd - J2000) / 36_525;
  const year = 2000 + centuries * 100;
  if (year < 1800 || year > 2050) throw new RangeError('DATE_OUTSIDE_JPL_TABLE_1');
  return table[0].map((base, index) => base + table[1][index] * centuries);
}

function coordinates(elements, eccentricAnomaly) {
  const [a, e, inclinationDeg, , perihelionDeg, nodeDeg] = elements;
  const orbitalX = a * (Math.cos(eccentricAnomaly) - e);
  const orbitalY = a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly);
  const inclination = inclinationDeg * DEG;
  const node = nodeDeg * DEG;
  const perihelionArgument = (perihelionDeg - nodeDeg) * DEG;
  const cw = Math.cos(perihelionArgument), sw = Math.sin(perihelionArgument);
  const co = Math.cos(node), so = Math.sin(node);
  const ci = Math.cos(inclination), si = Math.sin(inclination);
  return {
    x: (cw * co - sw * so * ci) * orbitalX + (-sw * co - cw * so * ci) * orbitalY,
    y: (cw * so + sw * co * ci) * orbitalX + (-sw * so + cw * co * ci) * orbitalY,
    z: sw * si * orbitalX + cw * si * orbitalY,
  };
}

export function planetPosition(id, date = new Date()) {
  const elements = elementsAt(id, date);
  const [, e, , longitudeDeg, perihelionDeg] = elements;
  const meanAnomaly = wrapRadians((longitudeDeg - perihelionDeg) * DEG);
  let eccentricAnomaly = meanAnomaly + e * Math.sin(meanAnomaly);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const delta = (eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomaly)
      / (1 - e * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }

  const { x, y, z } = coordinates(elements, eccentricAnomaly);
  return { id, x, y, z, au: Math.hypot(x, y, z), longitudeDeg: (Math.atan2(y, x) / DEG + 360) % 360 };
}

export function planetOrbit(id, date = new Date(), samples = 180) {
  const elements = elementsAt(id, date);
  return Array.from({ length: samples + 1 }, (_, index) =>
    coordinates(elements, index / samples * Math.PI * 2));
}

export function planetPositions(date = new Date()) {
  return Object.fromEntries(Object.keys(PLANET_ELEMENTS).map(id => [id, planetPosition(id, date)]));
}

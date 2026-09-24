// EARTHUS 새 탭 — 2D 정사영 지구 (2026-09-24 · 지시서 §4-1 B안 · §4-3)
//
// 무엇을 하나: 등장방형(경위도 격자) 그림 두 장 — 바탕(Natural Earth II)과 구름(NOAA GMGSI la8) — 을
//   한쪽 면만 보이는 정사영 원반 한 장으로 합친다. DOM·캔버스를 모른다(순수 함수) — 그래서 node --test 가 그대로 부른다.
//
// 규칙(지시서가 정한 것 — 바꾸면 완료 기준이 깨진다)
//   ① 합성은 **자료가 바뀔 때만** 한다(구름 시각 또는 중심 경도가 바뀔 때). 여는 순간에는 합성본을 그리기만 한다.
//      매번 2048 WebP 를 풀고 화소마다 투영하면 저사양 기기에서 200 ms 를 넘는다(지시서 §4-1 B안 조건).
//   ② WebGL 을 쓰지 않는다 · 렌더 루프가 없다. 한 번 계산하고 끝난다(HANDOVER §5 발열).
//   ③ 구름 자료가 없는 위도(meta.north / meta.south 밖, 약 ±72.7°)는 **그리지 않는다** — 지어내지 않는다.
//      경계 3° 안쪽만 옅게 한다(prototype/v2-three/js/main.js loadGmgsi 의 featherEdges 와 같은 뜻 — 벽처럼 서지 않게).
//   ④ 바탕: assets/ne2-base-2048.jpg — prototype/v2/assets/physical-earth/ne2-base-2048.jpg 의 사본.
//      sha256 a566de4b…2ef8 이 영수증(ne2-base.receipt.json)과 일치함을 2026-09-24 확인. Natural Earth II 1:50m, 퍼블릭 도메인.
//
// 좌표 규약: 등장방형 그림은 x=0 이 180°W, 동쪽으로 증가 · y=0 이 북쪽 끝(바탕 90°N, 구름 meta.north).
//   원반 좌표 (x, y) 는 −1..1, y 가 위쪽이다. 중심 = (lat0, lon0). 새 탭은 lat0 = 20°N, lon0 = 내 장소 경도.

export const CENTER_LAT_DEG = 20;
export const COMPOSITE_SIZE = 1024;
export const NIGHT_SIZE = 256;
const DEG = Math.PI / 180;

// 중심 (lat0, lon0) 의 시선 좌표계 — C: 원반 중심을 향하는 단위벡터, E: 동쪽, N: 북쪽. 지구 고정 좌표(x=0°E, z=북극).
export function viewBasis(lat0Deg, lon0Deg) {
  const p = lat0Deg * DEG, l = lon0Deg * DEG;
  const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
  return {
    C: [cp * cl, cp * sl, sp],
    E: [-sl, cl, 0],
    N: [-sp * cl, -sp * sl, cp],
  };
}

// 원반 좌표 → 위경도. 원반 밖이면 null.
export function orthoInverse(x, y, lat0Deg, lon0Deg, basis) {
  const r2 = x * x + y * y;
  if (r2 > 1) return null;
  const b = basis || viewBasis(lat0Deg, lon0Deg);
  const z = Math.sqrt(1 - r2);
  const px = x * b.E[0] + y * b.N[0] + z * b.C[0];
  const py = x * b.E[1] + y * b.N[1] + z * b.C[1];
  const pz = x * b.E[2] + y * b.N[2] + z * b.C[2];
  return { lat: Math.asin(Math.max(-1, Math.min(1, pz))) / DEG, lon: Math.atan2(py, px) / DEG };
}

// 위경도 → 원반 좌표. visible = 앞면(시선 쪽 반구)인가.
export function orthoForward(latDeg, lonDeg, lat0Deg, lon0Deg, basis) {
  const b = basis || viewBasis(lat0Deg, lon0Deg);
  const p = latDeg * DEG, l = lonDeg * DEG;
  const P = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  return { x: dot(P, b.E), y: dot(P, b.N), visible: dot(P, b.C) >= 0 };
}

// 등장방형 RGBA 표본(쌍선형). 가로는 날짜변경선에서 감는다. out[0..3] 에 쓴다.
function sampleBilinear(img, fx, fy, out) {
  const W = img.width, H = img.height, d = img.data;
  let x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  let y1 = y0 + 1;
  if (y0 < 0) y0 = 0;
  if (y1 > H - 1) y1 = H - 1;
  if (y0 > H - 1) y0 = H - 1;
  x0 = ((x0 % W) + W) % W;
  const x1 = (x0 + 1) % W;
  const i00 = (y0 * W + x0) * 4, i10 = (y0 * W + x1) * 4, i01 = (y1 * W + x0) * 4, i11 = (y1 * W + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * tx;
    const b = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * tx;
    out[c] = a + (b - a) * ty;
  }
}

/**
 * 바탕 + 구름 → 정사영 원반 RGBA (size×size). 원반 밖은 투명, 테두리는 화소 덮임만큼 반투명.
 * @param {{data:Uint8ClampedArray,width:number,height:number}} base  등장방형 전구(90°N..90°S)
 * @param {null|{data:Uint8ClampedArray,width:number,height:number,north:number,south:number}} cloud  la8(밝기=RGB, 구름=알파). null 이면 바탕만.
 * @param {{size?:number, lat0?:number, lon0:number}} opt
 */
export function renderComposite(base, cloud, opt) {
  const size = opt.size || COMPOSITE_SIZE;
  const lat0 = opt.lat0 == null ? CENTER_LAT_DEG : opt.lat0;
  const b = viewBasis(lat0, opt.lon0);
  const out = new Uint8ClampedArray(size * size * 4);
  const r = size / 2;
  const s = [0, 0, 0, 0], c = [0, 0, 0, 0];
  const FEATHER = 3; // °, 구름 자료 경계 안쪽만 옅게
  for (let j = 0; j < size; j++) {
    const y = (r - (j + 0.5)) / r;
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - r) / r;
      const rho = Math.sqrt(x * x + y * y);
      const cover = Math.max(0, Math.min(1, (1 - rho) * r + 0.5));
      if (cover <= 0) continue;
      // 테두리 화소는 원 위의 점으로 당겨 표본을 뜬다
      const k = rho > 1 ? 1 / rho : 1;
      const xx = x * k, yy = y * k;
      const z = Math.sqrt(Math.max(0, 1 - xx * xx - yy * yy));
      const px = xx * b.E[0] + yy * b.N[0] + z * b.C[0];
      const py = xx * b.E[1] + yy * b.N[1] + z * b.C[1];
      const pz = xx * b.E[2] + yy * b.N[2] + z * b.C[2];
      const lat = Math.asin(Math.max(-1, Math.min(1, pz))) / DEG;
      const lon = Math.atan2(py, px) / DEG;
      sampleBilinear(base, ((lon + 180) / 360) * base.width - 0.5, ((90 - lat) / 180) * base.height - 0.5, s);
      let R = s[0], G = s[1], B = s[2];
      if (cloud && lat <= cloud.north && lat >= cloud.south) {
        const span = cloud.north - cloud.south;
        sampleBilinear(cloud, ((lon + 180) / 360) * cloud.width - 0.5, ((cloud.north - lat) / span) * cloud.height - 0.5, c);
        let a = c[3] / 255;
        a *= Math.min(1, (cloud.north - lat) / FEATHER) * Math.min(1, (lat - cloud.south) / FEATHER);
        if (a > 0) {
          R = R * (1 - a) + c[0] * a;
          G = G * (1 - a) + c[1] * a;
          B = B * (1 - a) + c[2] * a;
        }
      }
      // 가장자리 어둡게(구의 입체감). 자료값이 아니라 그리기 효과다.
      const limb = 0.8 + 0.2 * Math.sqrt(z);
      const o = (j * size + i) * 4;
      out[o] = R * limb;
      out[o + 1] = G * limb;
      out[o + 2] = B * limb;
      out[o + 3] = 255 * cover;
    }
  }
  return out;
}

// 태양 고도(°) → 밤 덮개 불투명도. +2° 위는 0, −8° 아래는 최대. 사이는 부드럽게(경계가 칼처럼 서지 않게).
export const NIGHT_MAX_ALPHA = 0.72;
export function nightAlpha(elevDeg) {
  if (elevDeg >= 2) return 0;
  if (elevDeg <= -8) return NIGHT_MAX_ALPHA;
  const t = (2 - elevDeg) / 10;
  return NIGHT_MAX_ALPHA * t * t * (3 - 2 * t);
}

/**
 * 밤 덮개 RGBA (size×size) — 여는 순간 한 번 계산한다. 화소마다 삼각함수가 없다(태양 벡터와의 내적 하나).
 * @param {{size?:number, lat0?:number, lon0:number, sun:{latRad:number, lonRad:number}}} opt
 */
export function renderNight(opt) {
  const size = opt.size || NIGHT_SIZE;
  const lat0 = opt.lat0 == null ? CENTER_LAT_DEG : opt.lat0;
  const b = viewBasis(lat0, opt.lon0);
  const S = [Math.cos(opt.sun.latRad) * Math.cos(opt.sun.lonRad), Math.cos(opt.sun.latRad) * Math.sin(opt.sun.lonRad), Math.sin(opt.sun.latRad)];
  const out = new Uint8ClampedArray(size * size * 4);
  const r = size / 2;
  for (let j = 0; j < size; j++) {
    const y = (r - (j + 0.5)) / r;
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - r) / r;
      const rho = Math.sqrt(x * x + y * y);
      const cover = Math.max(0, Math.min(1, (1 - rho) * r + 0.5));
      if (cover <= 0) continue;
      const k = rho > 1 ? 1 / rho : 1;
      const xx = x * k, yy = y * k;
      const z = Math.sqrt(Math.max(0, 1 - xx * xx - yy * yy));
      const px = xx * b.E[0] + yy * b.N[0] + z * b.C[0];
      const py = xx * b.E[1] + yy * b.N[1] + z * b.C[1];
      const pz = xx * b.E[2] + yy * b.N[2] + z * b.C[2];
      const sinH = px * S[0] + py * S[1] + pz * S[2];
      const a = nightAlpha(Math.asin(Math.max(-1, Math.min(1, sinH))) / DEG);
      const o = (j * size + i) * 4;
      out[o] = 3; out[o + 1] = 7; out[o + 2] = 18;
      out[o + 3] = 255 * a * cover;
    }
  }
  return out;
}

// 합성본의 열쇠 — 이 셋 중 하나라도 바뀌면 다시 합성한다. 그 밖(여는 시각)에는 절대 다시 합성하지 않는다.
export function compositeKey(cloudTime, lon0, size) {
  return `v1|${cloudTime || 'no-cloud'}|${Number(lon0).toFixed(2)}|${CENTER_LAT_DEG}|${size || COMPOSITE_SIZE}`;
}

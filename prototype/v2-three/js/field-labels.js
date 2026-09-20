// EARTHUS v2 — 등치선 숫자 라벨 (DEV-DIRECTIVE 2026-09-20 · W1 §4 · W2 "지구 위 20°C · 30°C · −10°C")
//
// 무엇이 없어 있었나: v2 의 색면에는 숫자가 없었다. 색을 값으로 되돌리려면 범례와 색을 눈으로 맞춰 봐야 했다.
// 5일을 예보하는 화면에서는 예보 시각의 색면 위에 현재 관측 숫자를 얹을 수도 없다(관측과 예보가 섞인다 — 지시서 W1 ⑦).
// 그래서 예보 시각에는 **등치선의 라벨이 숫자 역할**을 한다.
//
// 선은 셰이더가 긋는다(field-renderer.js). 이 파일은 **라벨 자리만** 찾는다:
//   프레임의 CPU 사본을 2° 로 솎은 격자(720×361 → 180×91)에서 마칭 스퀘어로 주 레벨(기온 10°C 마다) 등치선을 따라가
//   긴 선부터, 서로 겹치지 않게, 자리를 고른다.
//   · **키프레임이 바뀔 때만** 돈다(bracket 의 a·b). 타임라인이 두 프레임 사이를 지나는 동안(mix 만 변한다)에는 다시 돌지 않는다 —
//     41프레임 재생 중 CPU 재계산이 0 이어야 폰이 뜨거워지지 않는다. 720×361 을 통째로 돌리면 폰에서 끊긴다(지시서 W1-4).
//   · 그 대가: 두 프레임 사이에서 선은 움직이는데 라벨은 서 있다. 그래서 자리는 **두 프레임의 가운데 값**((A+B)/2)에서 찾고
//     (어긋남이 3시간치가 아니라 1.5시간치가 된다), 두 프레임의 차가 작은 곳(바다 · 일교차가 작은 곳)을 먼저 고른다.
//   · 선이 색 경계와 같은 자리에 서도록 안/밖 규칙을 색면과 맞췄다: '안' = v ≥ 레벨(구간 규칙의 '아래 경계 포함').
//     셰이더는 구간과 선을 '읽히는 값'(v + 반 눈금)으로 정한다(field-renderer.js 머리말) — 그래서 자리는 레벨 − 반 눈금의 선에서 찾는다(shift).
//
// v1 의 contour-math.js 를 들여오지 않았다. 지시서 W1-4 는 그 파일을 '수정 없이 v2 로' 쓰라고 했지만, 이 묶음의 작업 지시가
// 그것을 뒤집었다 — v2 모듈은 prototype/js/ 를 런타임에 import 하지 않는다(v1 과 v2 는 다른 서비스다). 여기 것은 v2 의 것으로 새로 지었고
// 하는 일도 다르다: 선을 그리지 않고, 경도를 감고, 두 프레임의 흔들림을 재고, 라벨 자리만 돌려준다.
//
// 라벨은 화면과 나란한 스프라이트다(시안 01 의 라벨도 선을 따라 눕지 않는다). 글자마다 텍스처 한 장을 돌려쓴다 —
//   "20°C" 가 여섯 군데 서도 텍스처는 한 장이다(이 저장소의 선례: live-layers.js 뉴스 네모칸 _newsChipTexture).
//   깊이 검사는 끈다(스프라이트 판의 절반이 구면 안쪽으로 들어가 잘린다 — 같은 선례의 주석). 대신 지평선에서 흐려지고 뒤편은 0 이다.
//   앞 반구에 보이는 수는 데스크톱 24 · 폰 12 를 넘지 않는다.
//
// 계산은 DOM·THREE 없는 순수 함수다(시험이 그대로 부른다). 그리기(FieldLabels)만 THREE 를 쓰고, 캔버스는 주입받을 수 있다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { decodeByte } from './gfs-frames.js?v=1';
import { formatValue } from './field-scales.js?v=1';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const R_M = 6371000;

// 앞 반구에 한꺼번에 보이는 라벨 수의 상한(지시서 W1-4). 전지구에는 그 두 배까지 자리를 잡아 둔다 — 어느 쪽을 봐도 비지 않게.
export const FIELD_LABEL_CAP = Object.freeze({ desktop: 24, phone: 12 });
// 솎는 간격(도). 2° = 0.5° 격자의 네 칸마다 한 점 → 180×91.
export const FIELD_LABEL_GRID_DEG = 2;
// 라벨끼리의 최소 간격(도 · 구면 위 각거리). 전지구 뷰(1° ≈ 5px)에서 14° ≈ 70px — 라벨 폭(약 46px)이 겹치지 않는다.
export const FIELD_LABEL_MIN_SEP_DEG = 14;
// 이보다 짧은 등치선에는 라벨을 달지 않는다(도). 점 같은 고립 봉우리마다 숫자가 서면 지도가 숫자로 덮인다.
export const FIELD_LABEL_MIN_LINE_DEG = 10;
// 한 선 위에서 라벨 사이의 간격(도). 대륙을 가로지르는 선에 두세 개.
export const FIELD_LABEL_ALONG_DEG = 45;
// 이 위도 너머에는 라벨을 세우지 않는다. 극에서는 2° 격자의 한 행이 한 점에 모여 등치선이 뭉개진다.
export const FIELD_LABEL_MAX_LAT = 72;
// 라벨 높이 — 화면 높이에 대한 비율(sizeAttenuation:false · 시야각 48°). 900px 화면에서 약 20px. 뉴스 네모칸(0.030)보다 작다.
export const FIELD_LABEL_SCALE = 0.022;
// 지형 위로 띄우는 높이(지구 반지름 단위). 색면(0.0012)보다 위 — 비스듬히 볼 때 글자가 선 위에 앉는다.
export const FIELD_LABEL_LIFT = 0.003;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** '20.0 °C' → '20°C'. 라벨은 주 레벨(정수)이라 소수 0 을 떼고, 도(°) 단위는 숫자에 붙인다. 글자·부호는 field-scales.formatValue 것이다. */
export const labelText = (scale, level) => formatValue(scale, level).replace(/([.,]0+)(?=\s|$)/, '').replace(/\s+(?=°)/, '');

/**
 * 프레임의 CPU 사본을 솎아 값 격자로. 두 프레임이 오면 **가운데 값**(mid)과 **두 프레임의 차**(spread)를 같이 낸다.
 *   pxA · pxB  {w, h, channels, data}(gfs-frames pixels) · channels  fieldSpec(id).channels · grid  fieldSpec(id).grid
 *   mode 'magnitudeRG' 면 값 = |(R, G)|(풍속). 솎는 점은 격자점 그대로다(평균하지 않는다 — 없는 값을 만들지 않는다).
 *   out 을 주면 그 배열을 다시 쓴다(키프레임마다 새로 잡지 않는다).
 */
export const thinField = ({ pxA, pxB = null, channels, grid, mode = 'scalar', stepDeg = FIELD_LABEL_GRID_DEG }, out = null) => {
  const sx = Math.max(1, Math.round(stepDeg / grid.dLon));
  const sy = Math.max(1, Math.round(stepDeg / grid.dLat));
  // 한 바퀴 도는 격자는 마지막 열 다음이 첫 열이다(720 ÷ 4 = 180열 · 이음 칸은 traceContours 가 만든다). 위도는 두 극을 다 담는다(91행).
  const nxUse = grid.wraps ? Math.floor(grid.ni / sx) : Math.floor((grid.ni - 1) / sx) + 1;
  const ny = Math.floor((grid.nj - 1) / sy) + 1;
  const n = nxUse * ny;
  const t = (out && out.mid && out.mid.length === n) ? out : { mid: new Float32Array(n), spread: new Float32Array(n) };
  const valueOf = (px, o) => {
    const a = decodeByte(channels[0], px.data[o]);
    if (mode !== 'magnitudeRG') return a;
    return Math.hypot(a, decodeByte(channels[1], px.data[o + 1]));
  };
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nxUse; i += 1) {
      const o = ((j * sy) * grid.ni + i * sx) * pxA.channels;
      const va = valueOf(pxA, o);
      const vb = pxB ? valueOf(pxB, o) : va;
      const m = (va + vb) / 2;
      t.mid[j * nxUse + i] = m;
      t.spread[j * nxUse + i] = Math.abs(va - vb);
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  t.nx = nxUse; t.ny = ny; t.lon0 = grid.lon0; t.lat0 = grid.lat0;
  t.dLon = grid.dLon * sx; t.dLat = grid.dLat * sy; t.wraps = !!grid.wraps;
  t.min = min; t.max = max;
  return t;
};

/**
 * 어느 값에 라벨을 다나 — 등치선 명세(field-scales.isolineSpec)의 label 규칙대로, 자료 범위 안의 것만.
 *   'major'    굵은 선(majorEvery 의 배수)에만 — 기온 10°C 마다
 *   'all'      모든 선 · 'emphasis' 강조값에만 · 'none' 없음
 */
export const labelLevels = (spec, min, max) => {
  if (!spec || spec.label === 'none' || !(max >= min)) return [];
  const inRange = (v) => v > min && v <= max;          // 안 = v ≥ 레벨 — 최솟값과 같은 레벨은 넘을 곳이 없다
  const every = (step) => {
    const out = [];
    if (!(step > 0)) return out;
    for (let k = Math.ceil(min / step); k * step <= max; k += 1) if (inRange(k * step)) out.push(k * step);
    return out;
  };
  if (spec.label === 'major') return every(spec.majorEvery || spec.interval);
  if (spec.label === 'emphasis') return (spec.emphasize || []).filter(inRange);
  if (spec.levels) return spec.levels.filter(inRange);
  return every(spec.interval);
};

const angDeg = (la1, lo1, la2, lo2) => {
  const a = Math.sin(la1 * D2R) * Math.sin(la2 * D2R) + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.cos((lo1 - lo2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, a))) * R2D;
};
const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * 마칭 스퀘어 — 값 격자에서 레벨 하나의 등치선을 **이어진 선**으로 돌려준다.  → [{ pts: [[lon, lat], …], closed, lengthDeg }]
 *   '안' = v ≥ level(색면의 구간 규칙과 같다). 경도로 한 바퀴 도는 격자는 마지막 열과 첫 열 사이에도 칸이 있다 —
 *   날짜변경선에서 선이 끊기지 않는다. 안장(대각으로 마주 본 두 꼭짓점만 안)은 칸의 평균으로 가른다.
 */
export const traceContours = (t, level) => {
  const { nx, ny, mid } = t;
  const cols = t.wraps ? nx : nx - 1;
  const at = (i, j) => mid[j * nx + (i % nx)];
  // 변 번호: 가로 변 H(i, j) = (i,j)–(i+1,j) · 세로 변 V(i, j) = (i,j)–(i,j+1)
  const H = (i, j) => j * nx + (i % nx);
  const V = (i, j) => nx * ny + j * nx + (i % nx);
  const point = new Map();     // 변 번호 → [lon, lat]
  const crossH = (i, j) => {
    const k = H(i, j);
    if (!point.has(k)) {
      const a = at(i, j); const b = at(i + 1, j);
      const f = (level - a) / (b - a);
      point.set(k, [t.lon0 + (i + f) * t.dLon, t.lat0 - j * t.dLat]);
    }
    return k;
  };
  const crossV = (i, j) => {
    const k = V(i, j);
    if (!point.has(k)) {
      const a = at(i, j); const b = at(i, j + 1);
      const f = (level - a) / (b - a);
      point.set(k, [t.lon0 + (i % nx) * t.dLon + (i >= nx ? 360 : 0), t.lat0 - (j + f) * t.dLat]);
    }
    return k;
  };
  const segs = [];             // [변 번호, 변 번호]
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const tl = at(i, j) >= level; const tr = at(i + 1, j) >= level;
      const br = at(i + 1, j + 1) >= level; const bl = at(i, j + 1) >= level;
      const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = () => crossH(i, j); const bottom = () => crossH(i, j + 1);
      const left = () => crossV(i, j); const right = () => crossV(i + 1, j);
      switch (code) {
        case 1: case 14: segs.push([left(), bottom()]); break;
        case 2: case 13: segs.push([bottom(), right()]); break;
        case 3: case 12: segs.push([left(), right()]); break;
        case 4: case 11: segs.push([top(), right()]); break;
        case 6: case 9: segs.push([top(), bottom()]); break;
        case 7: case 8: segs.push([left(), top()]); break;
        default: {                                   // 5 · 10 — 안장
          const centerIn = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 >= level;
          if ((code === 5) === centerIn) { segs.push([left(), top()]); segs.push([bottom(), right()]); }
          else { segs.push([left(), bottom()]); segs.push([top(), right()]); }
        }
      }
    }
  }
  // 변을 공유하는 선분끼리 잇는다.
  const byEdge = new Map();
  segs.forEach((s, idx) => { for (const e of s) { const l = byEdge.get(e); if (l) l.push(idx); else byEdge.set(e, [idx]); } });
  const used = new Uint8Array(segs.length);
  const walk = (startSeg, fromEdge) => {
    const chain = [];
    let seg = startSeg; let edge = fromEdge;
    for (;;) {
      const next = (byEdge.get(edge) || []).find((k) => k !== seg && !used[k]);
      if (next == null) break;
      used[next] = 1;
      edge = segs[next][0] === edge ? segs[next][1] : segs[next][0];
      chain.push(edge);
      seg = next;
    }
    return chain;
  };
  const lines = [];
  for (let s = 0; s < segs.length; s += 1) {
    if (used[s]) continue;
    used[s] = 1;
    const fwd = walk(s, segs[s][1]);
    const closed = fwd.length > 0 && fwd[fwd.length - 1] === segs[s][0];
    const back = closed ? [] : walk(s, segs[s][0]);
    const edges = [...back.reverse(), segs[s][0], segs[s][1], ...fwd];
    const pts = edges.map((e) => point.get(e));
    let lengthDeg = 0;
    for (let k = 1; k < pts.length; k += 1) lengthDeg += angDeg(pts[k - 1][1], pts[k - 1][0], pts[k][1], pts[k][0]);
    lines.push({ pts, closed, lengthDeg });
  }
  return lines;
};

/**
 * 라벨 자리 고르기.  → [{ lat, lon, level, text? }] 우선순위 순(앞의 것이 먼저 보인다).
 *   thin    thinField 의 결과 · levels  labelLevels 의 결과
 *   한 선 위에서는 alongDeg 마다 한 자리를 잡되, 그 둘레에서 두 프레임의 차(spread)가 가장 작은 꼭짓점을 고른다.
 *   shift  셰이더가 구간·등치선을 정할 때 값에 더하는 반 눈금(field-renderer.js halfStepOf). 선은 v + shift = 레벨, 곧 v = 레벨 − shift 에 선다 —
 *          라벨도 그 선을 따라간다(글자는 레벨 그대로 '20°C').
 *   전체에서는 긴 선부터, 이미 고른 자리와 minSepDeg 이상 떨어진 것만, maxTotal 개까지.
 */
export const pickLabelSpots = (thin, levels, {
  maxTotal = FIELD_LABEL_CAP.desktop * 2, minSepDeg = FIELD_LABEL_MIN_SEP_DEG, minLineDeg = FIELD_LABEL_MIN_LINE_DEG,
  alongDeg = FIELD_LABEL_ALONG_DEG, maxLat = FIELD_LABEL_MAX_LAT, shift = 0,
} = {}) => {
  const spreadAt = (lon, lat) => {
    const i = Math.round((wrapLon(lon) - thin.lon0) / thin.dLon);
    const j = Math.max(0, Math.min(thin.ny - 1, Math.round((thin.lat0 - lat) / thin.dLat)));
    const ii = thin.wraps ? ((i % thin.nx) + thin.nx) % thin.nx : Math.max(0, Math.min(thin.nx - 1, i));
    return thin.spread[j * thin.nx + ii];
  };
  const cands = [];
  for (const level of levels) {
    for (const line of traceContours(thin, level - shift)) {
      if (line.lengthDeg < minLineDeg) continue;
      const count = Math.max(1, Math.min(8, Math.round(line.lengthDeg / alongDeg)));
      // 꼭짓점마다 선을 따라 잰 거리
      const cum = [0];
      for (let k = 1; k < line.pts.length; k += 1) {
        cum.push(cum[k - 1] + angDeg(line.pts[k - 1][1], line.pts[k - 1][0], line.pts[k][1], line.pts[k][0]));
      }
      for (let c = 0; c < count; c += 1) {
        const target = ((c + 0.5) / count) * line.lengthDeg;
        const win = line.lengthDeg / count / 4;        // 제자리에서 앞뒤 1/4 구간 안에서만 고른다 — 라벨이 한쪽으로 몰리지 않게
        let best = -1; let bestCost = Infinity;
        for (let k = 0; k < line.pts.length; k += 1) {
          const off = Math.abs(cum[k] - target);
          if (off > win || Math.abs(line.pts[k][1]) > maxLat) continue;
          const cost = spreadAt(line.pts[k][0], line.pts[k][1]) + off / Math.max(win, 1e-6) * 0.25;
          if (cost < bestCost) { bestCost = cost; best = k; }
        }
        if (best < 0) continue;
        const [lon, lat] = line.pts[best];
        cands.push({ lat, lon: wrapLon(lon), level, score: Math.min(line.lengthDeg, 180) - bestCost * 6 - Math.abs(lat) * 0.2 });
      }
    }
  }
  cands.sort((p, q) => q.score - p.score);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= maxTotal) break;
    if (picked.some((p) => angDeg(p.lat, p.lon, c.lat, c.lon) < minSepDeg)) continue;
    picked.push({ lat: c.lat, lon: c.lon, level: c.level });
  }
  return picked;
};

/**
 * 라벨의 불투명도 — 지평선 위에서 1, 지평선에서 0, 지구 뒤편에서 0. 깊이 검사를 껐으므로 가려져야 할 라벨을 여기서 감춘다.
 *   보인다 ⇔ 카메라가 그 점의 접평면 위에 있다 ⇔ cosθ > |P| / |C|.  고정 문턱이 아닌 이유: 지평선의 cosθ 는 고도마다 다르다.
 *   (live-layers.js newsChipOpacity 와 같은 식이다 — 저쪽을 import 하면 순환이 생겨 숫자 인자판을 따로 둔다. 객체를 만들지 않는다.)
 */
export const labelOpacity = (px, py, pz, cx, cy, cz) => {
  const pl = Math.hypot(px, py, pz);
  const cl = Math.hypot(cx, cy, cz);
  if (!pl || !cl) return 0;
  const horizon = pl / cl;
  if (horizon >= 1) return 0;
  const facing = (px * cx + py * cy + pz * cz) / (pl * cl);
  return Math.max(0, Math.min(1, (facing - horizon) / (1 - horizon) / 0.18));
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  그리기
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

// 글자 한 장. 판 없이 흰 글자 + 어두운 테두리(시안 01) — 어느 구간색 위에서도 읽힌다. 그라데이션을 쓰지 않는다.
const canvasLabelTexture = (text) => {
  const S = 2;                  // 레티나에서 또렷하게 — 2배로 그리고 절반 크기로 보인다
  // ⚠️ 한글 폰트를 지정한다 — 안 하면 안드로이드·윈도우에서 대체 폰트로 떨어진다(뉴스 네모칸의 교훈). 숫자·°C 뿐이어도 같은 글꼴이라야 한다.
  const font = `700 ${13 * S}px "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const pad = 5 * S;
  const c = document.createElement('canvas');
  c.width = Math.ceil(probe.measureText(text).width + pad * 2);
  c.height = 20 * S;
  const x = c.getContext('2d');
  x.font = font;
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 3.2 * S;
  x.strokeStyle = 'rgba(8,12,18,0.88)';
  x.strokeText(text, pad, c.height / 2 + S * 0.5);
  x.fillStyle = '#ffffff';
  x.fillText(text, pad, c.height / 2 + S * 0.5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, w: c.width, h: c.height };
};

/**
 * new FieldLabels({ maxFront, heightAt, getExagger, makeTexture, renderOrder })
 *   maxFront     앞 반구에 한꺼번에 보이는 수의 상한(FIELD_LABEL_CAP)
 *   heightAt     (lat, lon) → m · getExagger () → 지형 과장 — 라벨을 색면처럼 지형 위에 세운다
 *   makeTexture  (text) → { tex, w, h } — 시험이 캔버스 없이 부를 수 있게 주입받는다
 * update(key, build): key 가 지난번과 같으면 **아무것도 하지 않는다**(build 를 부르지도 않는다). 달라졌으면 build() → [{lat, lon, text}].
 * tick(camera): 그리기 직전마다. 지평선 흐림 · 앞 반구 상한 · 과장이 바뀌었으면 높이 다시. 객체를 만들지 않는다.
 */
export class FieldLabels {
  constructor({
    maxFront = FIELD_LABEL_CAP.desktop, heightAt = null, getExagger = null, makeTexture = canvasLabelTexture, renderOrder = 7,
    lift = FIELD_LABEL_LIFT,
  } = {}) {
    this.group = new THREE.Group();
    this.maxFront = maxFront;
    this.heightAt = heightAt;
    this.getExagger = getExagger;
    this.makeTexture = makeTexture;
    this.renderOrder = renderOrder;
    this.lift = lift;
    this.textures = new Map();   // 글자 → { tex, w, h } — 라벨마다 새로 굽지 않는다
    this.pool = [];              // 스프라이트는 돌려쓴다
    this.count = 0;
    this.unit = new Float32Array(0);    // 라벨마다 [ux, uy, uz, 고도 m]
    this.key = null;
    this.builds = 0;             // 자리를 다시 계산한 횟수(시험·콘솔 확인용)
    this.lastExagger = NaN;
  }

  get object() { return this.group; }

  textureFor(text) {
    let e = this.textures.get(text);
    if (!e) { e = this.makeTexture(text); this.textures.set(text, e); }
    return e;
  }

  update(key, build) {
    if (key === this.key) return false;          // 키프레임이 그대로다 — 다시 계산하지 않는다
    this.key = key;
    this.builds += 1;
    this.setLabels(build() || []);
    return true;
  }

  setLabels(labels) {
    const n = labels.length;
    if (this.unit.length < n * 4) this.unit = new Float32Array(n * 4);
    while (this.pool.length < n) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0,
      }));
      spr.renderOrder = this.renderOrder;   // 색면(−1)·구름(1)·입자(4) 위, 뉴스 네모칸(8) 아래
      spr.frustumCulled = false;            // 절단 판정은 판 크기를 모른다(고정 화면 크기) — 많아야 수십 개라 그냥 그린다
      spr.visible = false;
      this.group.add(spr);
      this.pool.push(spr);
    }
    for (let i = 0; i < n; i += 1) {
      const l = labels[i];
      const la = l.lat * D2R; const lo = l.lon * D2R; const cl = Math.cos(la);
      this.unit[i * 4] = cl * Math.sin(lo);
      this.unit[i * 4 + 1] = Math.sin(la);
      this.unit[i * 4 + 2] = cl * Math.cos(lo);
      this.unit[i * 4 + 3] = this.heightAt ? Math.max(0, Number(this.heightAt(l.lat, l.lon)) || 0) : 0;
      const t = this.textureFor(l.text);
      const spr = this.pool[i];
      spr.material.map = t.tex;
      spr.material.needsUpdate = true;
      spr.material.opacity = 0;             // 첫 tick 이 정한다 — 그 전에는 지구 뒤편 것이 비치지 않게
      spr.scale.set((t.w / t.h) * FIELD_LABEL_SCALE, FIELD_LABEL_SCALE, 1);
      spr.userData.fieldLabel = l;
      spr.visible = true;
    }
    for (let i = n; i < this.pool.length; i += 1) this.pool[i].visible = false;
    this.count = n;
    this.lastExagger = NaN;                 // 자리를 새로 잡았으니 높이도 다시
    this.place();
  }

  // 지형 과장에 맞춰 반지름을 다시 준다. 과장이 그대로면 아무것도 하지 않는다.
  place() {
    const ex = this.getExagger ? Number(this.getExagger()) || 0 : 0;
    if (ex === this.lastExagger) return;
    this.lastExagger = ex;
    for (let i = 0; i < this.count; i += 1) {
      const r = 1 + (this.unit[i * 4 + 3] / R_M) * ex + this.lift;
      this.pool[i].position.set(this.unit[i * 4] * r, this.unit[i * 4 + 1] * r, this.unit[i * 4 + 2] * r);
    }
  }

  tick(camera) {
    if (!this.count || !camera) return 0;
    this.place();
    const m = camera.matrixWorld.elements;
    const cx = m[12]; const cy = m[13]; const cz = m[14];
    let shown = 0;
    for (let i = 0; i < this.count; i += 1) {
      const spr = this.pool[i];
      const p = spr.position;
      let a = labelOpacity(p.x, p.y, p.z, cx, cy, cz);
      // 우선순위 순으로 앞에서부터 센다 — 상한을 넘는 것은 흐리지 않고 끈다(같은 라벨이 늘 같은 순서라 깜빡이지 않는다).
      if (a > 0 && shown >= this.maxFront) a = 0;
      if (a > 0) shown += 1;
      spr.material.opacity = a;
    }
    return shown;
  }

  clear() {
    for (const spr of this.pool) { spr.visible = false; spr.material.opacity = 0; }
    this.count = 0;
    this.key = null;
  }

  dispose() {
    this.clear();
    for (const spr of this.pool) { this.group.remove(spr); spr.material.dispose(); }
    this.pool.length = 0;
    for (const e of this.textures.values()) if (e.tex && e.tex.dispose) e.tex.dispose();
    this.textures.clear();
  }
}

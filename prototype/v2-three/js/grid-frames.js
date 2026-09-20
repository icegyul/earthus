// EARTHUS v2 — JSON 격자 한 장을 프레임 저장소처럼 내놓는 어댑터 (DEV-DIRECTIVE 2026-09-20 · W1 렌더러를 바다·대기로 · 작업 D3)
//
// 무엇이 잘못돼 있었나: 바다 3종(sstfield · wavefield · sstanom)과 대기질(pm25grid)은 아직 옛 buildField 였다 —
// 격자를 72×36(또는 360×180) 캔버스에 **선형 램프로 칠하고** LinearFilter 로 늘린 그라데이션이고, 등치선·범례·숫자가 없다.
// 2026-09-20 핫픽스가 0.25° CPU 가림판(ocean-land-mask.js)을 껍질의 alphaMap 으로 걸어 '육지 위 색 0'까지는 갔지만,
// 그 판은 육지에 닿은 칸과 그 이웃 칸을 통째로 비우므로 **해안 15~40 km 와 다도해·대한해협이 계단 모양으로 빈다.**
// PD 에게 "W1 렌더러에서 해안선 단위로 고친다"고 약속한 것이 이 작업이다.
//
// 이 파일이 하는 일: **자료 한 장을 gfs-frames.js 와 같은 인터페이스로 내놓는다** — '프레임이 하나뿐인 저장소'다.
//   load · loaded · onSwap · framesFor · bracket · texture/textureNow · pixels · sampleAt · fieldSpec · uvTransform · info · runAge
//   FieldLayer 는 저장소를 이 인터페이스로만 쓰므로(field-layer.js 머리말) 색면·등치선·범례·라벨·카드·클릭 값이
//   기온·풍속과 **같은 길**로 돈다. 로직을 베끼지 않는다.
//
// 자료마다 다른 모양(격자 원점 · 간격 · 행 순서 · 결측 표기 · 값 이름)은 아래 GRID_SOURCES 의 작은 reader 가 흡수한다.
// 운영 파일을 공개 GET 으로 받아 실제 모양을 확인하고 적었다(2026-09-20):
//   ocean/sst-global.json    res 1    lat0 −79.875 lon0 −179.875  360×161  sst  결측 null (NOAA OISST v2.1 · 0.25° 를 네 칸마다 뽑음)
//   ocean/marine.json        res 5    lat0 −80     lon0 −180       72×33   wave 결측 null (Open-Meteo Marine 경유)
//   ocean/sst-anom-ea.json   res 0.5  lat0  23.125 lon0  114.125   73×49   sst·sstAnom 결측 null (동아시아만 — 전지구가 아니다)
//   wind/air.json            res 5    lat0 −80     lon0 −180       72×33   pm25 (Open-Meteo Air Quality · CAMS 경유)
//   넷 다 **행 0 = 남쪽**(lat = lat0 + y·res)이고 **점 격자**다(값이 그 점의 값이지 칸의 평균이 아니다).
//
// ── 값을 어떻게 싣나 — 8bit + 자료 눈금에 맞춘 scale/offset ─────────────────────────────────────────────────
//   Float·HalfFloat 를 쓰지 않은 이유는 성능이 아니라 **기존 길**이다. field-renderer.js 의 tapValue 는
//   floor(texel×255 + 0.5) 로 정수 바이트를 되돌린 뒤 uDecode(scale·offset)로 푼다 — 칠해진 칸과 클릭한 값의 칸이
//   같아지는 근거가 그 한 줄이다(그 파일 머리말 ①②). Float 텍스처로 가려면 그 줄을 갈라야 하고, 그러면 GFS 색면의
//   바이트 일치 근거가 함께 흔들린다. 그래서 자료를 **바이트로 양자화**하되 눈금을 자료에 맞춰 고른다:
//     sst      0.2 °C  offset −10   (−10 … 41.0 °C)     · 경계 0·4·…·32 와 등온선 1 °C·26·29 가 전부 눈금 위
//     sstAnom  0.05 °C offset −6    (−6 … 6.75 °C)      · 경계 ±0.5·±1.5 와 0 선이 눈금 위
//     wave     0.1 m   offset 0     (0 … 25.5 m)        · 경계 1·2·3·4·6·9 가 눈금 위 (0.05 로 하면 12.75 m 에서 잘린다)
//     pm25     5 µg/m³ offset 0     (0 … 1275 µg/m³)    · 경계 15·25·50·75·150 이 전부 5 의 배수 —
//              1 µg/m³ 로 잡으면 255 에서 잘려 산불·황사 때(CAMS 는 500 을 넘는다) 값을 말하지 못한다.
//              5° 격자(약 555 km) 한 점에 5 µg/m³ 보다 잘게 말할 정밀도가 없다.
//   ⚠️ 눈금(scale)은 **그 자체가 한 자리 유효숫자**여야 한다 — FieldLayer 가 클릭 값을 scale.toPrecision(1) 로 반올림한다.
//      0.15 같은 눈금을 쓰면 화면은 0.15 로 칠하고 글자는 0.2 로 말해 경계에서 둘이 갈린다.
//   ⚠️ 경계는 **눈금 위에** 있어야 한다((경계 − offset)/scale 이 정수). 셰이더가 '읽히는 값'(v + 반 눈금)으로 칸을 고르므로
//      경계가 눈금 사이에 걸치면 색 경계와 범례 경계가 어긋난다. checkLattice 가 저장소를 만들 때 이것을 던진다.
//
// ── 결측은 값이 아니다 ──────────────────────────────────────────────────────────────────────────────────────
//   육지의 SST null 을 0 이나 −10 으로 칠하면 해안에 가짜 값 띠가 선다. 그래서 채널을 둘 싣는다:
//     R = 값 바이트 · G = 결측 마스크(값 있음 255 · 없음 0).
//   셰이더는 네 칸을 **마스크로 가중해** 잇는다(field-renderer.js maskedGrid) — 결측 이웃은 무게 0 이라 섞이지 않는다.
//   결측 칸의 값 바이트는 0 이고 **아무도 읽지 않는다**: 셰이더는 무게 0, CPU 쪽(thinField · fullRangeOf · sampleAt)은
//   role 'mask' 채널을 보고 건너뛴다.
//
// ── 방향 (⚠️ DataTexture 는 flipY 가 적용되지 않는다) ────────────────────────────────────────────────────────
//   GFS 프레임은 그림(첫 행 = 북)이고 THREE 기본 flipY=true 라 **v = 1 이 북**이다. 셰이더 tapValue 도 그 규칙으로 읽는다
//   (uv.y = 1 − (row + 0.5)/nj · row 0 = 북).  DataTexture 는 ArrayBufferView 라 WebGL 이 flipY 를 무시한다 —
//   자료 배열의 첫 행이 그대로 v = 0 에 앉는다. 그래서 **텍스처 배열은 남쪽 행부터** 담아야 v = 1 이 북이 된다.
//   원본 JSON 이 이미 남쪽부터이므로 텍스처는 원본 순서 그대로다. 반대로 CPU 사본(pixels)은 gfs-frames 의 규약
//   (행 0 = 북)을 지켜야 thinField · fullRangeOf · sampleAt 이 그대로 돈다 — 그쪽만 행을 뒤집어 담는다.
//   두 배열의 방향을 시험이 잠근다(셰이더의 uv 식으로 되짚어 서울·부산 앞바다 칸을 찾는다).
//
// ── 격자 등록 (옛 식이 어긋나 있던 곳) ──────────────────────────────────────────────────────────────────────
//   옛 buildField 는 격자점 값을 floor((lon+180)/res) 픽셀에 넣었다 — 점이 픽셀 한가운데가 아니라 왼쪽 위 모서리에 앉는다.
//     5° 격자(파고·대기질): 2.5° ≈ 278 km 어긋남 ·  1° 수온: 0.375° ≈ 42 km ·  0.5° 편차: 0.125° ≈ 14 km.
//   여기서는 gfs-frames 의 uvTransformOf(grid, 'point') 를 그대로 쓴다 — 점 격자의 반 칸 보정이 그 안에 있다. 시험이 숫자로 잠근다.
//
// ── 시간: 이 자료들은 한 시각이다 ───────────────────────────────────────────────────────────────────────────
//   프레임이 하나뿐이므로 타임라인이 '지금'이 아니면 bracket 이 outOfRange 를 준다 — FieldLayer 가 이미 그 길에서
//   색면을 숨기고 카드·범례가 이유를 적는다. 예보인 척 끝 프레임을 늘여 칠하지 않는다.
//   '지금'의 폭은 시간 버스의 것과 같다(NOW_EPS_MS) — 슬라이더를 조금이라도 밀었으면 사용자는 예보를 보고 있다.
//
// 이 파일은 DOM 을 모른다. THREE · fetch 는 주입받고(시험이 가짜를 넣는다) 계산은 순수 함수로 밖에 냈다.

import { NOW_EPS_MS } from './time-bus.js?v=1';
import { decodeByte, uvTransformOf } from './gfs-frames.js?v=1';
import { scaleOf } from './field-scales.js?v=1';

export const GRID_BASE = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

// 값 있음/없음을 싣는 채널. 바이트 그대로 읽는다(scale 1 · offset 0) — 1/255 로 풀면 255×(1/255) 이 float32 에서
// 정확히 1.0 이 아니라 셰이더가 '값 있음'을 놓칠 수 있다. 셰이더도 JS 도 step(127.5, …) 하나로 가른다.
export const MASK_CHANNEL = Object.freeze({
  name: 'G', idx: 1, role: 'mask', transfer: 'linear', scale: 1, offset: 0, min: 0, max: 255,
});
export const MASK_ON = 255;
export const MASK_OFF = 0;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  자료 목록 — 한 줄 = 한 파일. descriptor.source 가 이 열쇠를 가리킨다(field-layer.js FIELD_DESCRIPTORS).
//    path       공개 GET 주소(S3 기준 상대) · timeKey  기준 시각을 담은 열쇠(먼저 있는 것)
//    staleH     이보다 늙으면 '지연'. OISST 는 하루치 분석장이라 이틀이 정상이고, 제공기관 격자는 반나절이다.
//    kind       화면에 적는 성질(OBSERVED | MODEL) · sourceName  출처 한 줄(경유하면 '경유'라고 적는다)
//    fields     값 배열 하나 = 한 필드. key 는 문서의 배열 이름, scaleId 는 색 눈금표(field-scales.js)의 열쇠.
//  ⚠️ 자외선(uvgrid)은 여기 없다 — PD 표에 색 눈금이 없다. 색을 지어내지 않는다(field-scales.js:266).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const GRID_SOURCES = Object.freeze({
  sstGlobal: Object.freeze({
    id: 'sstGlobal', path: '/ocean/sst-global.json', timeKey: ['observed', 'time'], staleH: 60,
    kind: 'OBSERVED', sourceName: 'NOAA OISST v2.1',
    // 0.25° 원본을 네 칸마다 **뽑은** 값이다 — 1° 칸의 평균이 아니다. 카드가 그렇게 말한다.
    cellWord: Object.freeze({ ko: '표본', en: 'sample' }),
    fields: Object.freeze({
      sst: Object.freeze({ id: 'sst', key: 'sst', scaleId: 'sst', unit: '°C', scale: 0.2, offset: -10, variable: 'sea surface temperature' }),
    }),
  }),
  marine: Object.freeze({
    id: 'marine', path: '/ocean/marine.json', timeKey: ['time'], staleH: 12,
    kind: 'MODEL', sourceName: 'Open-Meteo Marine 경유',
    cellWord: Object.freeze({ ko: '값', en: 'value' }),
    fields: Object.freeze({
      wave: Object.freeze({ id: 'wave', key: 'wave', scaleId: 'wave', unit: 'm', scale: 0.1, offset: 0, variable: 'significant wave height' }),
    }),
  }),
  sstAnomEa: Object.freeze({
    id: 'sstAnomEa', path: '/ocean/sst-anom-ea.json', timeKey: ['observed', 'time'], staleH: 60,
    kind: 'OBSERVED', sourceName: 'NOAA OISST v2.1 − 1991~2020 평년',
    cellWord: Object.freeze({ ko: '표본', en: 'sample' }),
    fields: Object.freeze({
      // 같은 파일에 두 배열이 있다 — 저장소는 하나고 파일도 한 번만 받는다.
      sstAnom: Object.freeze({ id: 'sstAnom', key: 'sstAnom', scaleId: 'sstAnom', unit: '°C', scale: 0.05, offset: -6, variable: 'SST anomaly' }),
      sst: Object.freeze({ id: 'sst', key: 'sst', scaleId: 'sst', unit: '°C', scale: 0.2, offset: -10, variable: 'sea surface temperature' }),
    }),
  }),
  air: Object.freeze({
    id: 'air', path: '/wind/air.json', timeKey: ['time'], staleH: 12,
    kind: 'MODEL', sourceName: 'Open-Meteo Air Quality (CAMS) 경유',
    cellWord: Object.freeze({ ko: '값', en: 'value' }),
    fields: Object.freeze({
      pm25: Object.freeze({ id: 'pm25', key: 'pm25', scaleId: 'pm25', unit: 'µg/m³', scale: 5, offset: 0, variable: 'PM2.5' }),
    }),
  }),
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const isValue = (v) => typeof v === 'number' && Number.isFinite(v);

/** 값 → 바이트. 범위를 벗어나면 끝에서 멈춘다(자리 표시가 아니라 '이 이상'이다 — 맨 위 칸의 색은 그대로 맞다). */
export const encodeByte = (v, ch) => {
  const b = Math.round((v - ch.offset) / ch.scale);
  return b < 0 ? 0 : (b > 255 ? 255 : b);
};

/**
 * 눈금표의 경계가 이 채널의 바이트 눈금 위에 있나 — 문제 글의 배열(없으면 빈 배열).
 * 이것이 깨지면 색 경계 ≠ 범례 경계 ≠ 등치선이 된다(field-renderer.js 머리말 '무엇을 그 규칙에 넣나').
 */
export const checkLattice = (ch, scale) => {
  const bad = [];
  if (!(ch.scale > 0)) bad.push(`눈금 ${ch.scale} 이 0 이하`);
  if (Number(ch.scale.toPrecision(1)) !== ch.scale) {
    bad.push(`눈금 ${ch.scale} 은 한 자리 유효숫자가 아니다 — 클릭 값(toPrecision(1))과 색면이 갈린다`);
  }
  if (!scale) return bad;
  const marks = [...scale.breaks];
  const iso = scale.isolines;
  if (iso && Array.isArray(iso.emphasize)) marks.push(...iso.emphasize);
  for (const x of marks) {
    const k = (x - ch.offset) / ch.scale;
    if (Math.abs(k - Math.round(k)) > 1e-6) bad.push(`경계 ${x} 이 눈금 ${ch.scale}(원점 ${ch.offset}) 위에 없다`);
    if (k < 0 || k > 255) bad.push(`경계 ${x} 이 8bit 범위 밖이다 (바이트 ${k.toFixed(1)})`);
  }
  return bad;
};

/**
 * 문서 한 장 → 격자.  → { ni, nj, lon0, lat0, dLon, dLat, wraps } | null
 * ⚠️ 돌려주는 lat0 은 **북쪽 끝**이다(gfs-frames 규약 · uvTransformOf 와 thinField 가 그렇게 읽는다).
 *    원본 JSON 의 lat0 은 남쪽 끝이므로 여기서 한 번만 뒤집어 말한다.
 */
export const readGridShape = (doc) => {
  if (!doc) return null;
  const res = Number(doc.res);
  const ni = Number(doc.nx);
  const nj = Number(doc.ny);
  const lon0 = Number(doc.lon0);
  const south = Number(doc.lat0);
  if (![res, ni, nj, lon0, south].every(Number.isFinite) || !(res > 0) || !(ni > 0) || !(nj > 0)) return null;
  return {
    ni, nj, lon0, lat0: south + (nj - 1) * res, dLon: res, dLat: res,
    wraps: Math.abs(ni * res - 360) < 1e-6,
  };
};

/**
 * 값 배열(원본 순서 · 행 0 = 남) → 두 벌.
 *   px   CPU 사본 — **행 0 = 북** · 칸마다 [값 바이트, 마스크](gfs-frames 의 pixels 규약)
 *   tex  텍스처 바이트 — **행 0 = 남** · RGBA(값, 마스크, 0, 255)
 *        DataTexture 는 flipY 가 없다 → 첫 행이 v = 0 에 앉는다. 남쪽부터 담아야 v = 1 이 북이 되어
 *        GFS 그림 텍스처(flipY 기본 true)와 셰이더에서 같은 방향이 된다(머리말 '방향').
 * stats 는 **값이 있는 칸만** 센다(결측의 값 바이트는 값이 아니다).
 */
export const quantizeGrid = (arr, grid, ch) => {
  const { ni, nj } = grid;
  const n = ni * nj;
  const px = new Uint8Array(n * 2);
  const tex = new Uint8Array(n * 4);
  let present = 0;
  let min = Infinity;
  let max = -Infinity;
  let clampedHi = 0;
  let clampedLo = 0;
  for (let ySouth = 0; ySouth < nj; ySouth += 1) {
    const yNorth = nj - 1 - ySouth;
    for (let x = 0; x < ni; x += 1) {
      const v = arr[ySouth * ni + x];
      const ok = isValue(v);
      const byte = ok ? encodeByte(v, ch) : 0;
      if (ok) {
        present += 1;
        if (v < min) min = v;
        if (v > max) max = v;
        if (byte === 255 && v > ch.offset + 255 * ch.scale + ch.scale / 2) clampedHi += 1;
        if (byte === 0 && v < ch.offset - ch.scale / 2) clampedLo += 1;
      }
      const o = (yNorth * ni + x) * 2;
      px[o] = byte;
      px[o + 1] = ok ? MASK_ON : MASK_OFF;
      const t = (ySouth * ni + x) * 4;
      tex[t] = byte;
      tex[t + 1] = ok ? MASK_ON : MASK_OFF;
      tex[t + 2] = 0;
      tex[t + 3] = 255;
    }
  }
  return {
    px: Object.freeze({ w: ni, h: nj, channels: 2, names: Object.freeze(['R', 'G']), data: px }),
    tex,
    present,
    total: n,
    min: present ? min : null,
    max: present ? max : null,
    clampedHi,
    clampedLo,
  };
};

// 칸 하나를 푼다. 경도는 감고(wraps) 위도는 끝 행에서 멈춘다 — 셰이더 tapValue 와 같은 규칙.
const tapAt = (px, ch, col, row, ni, nj, wraps) => {
  const x = wraps ? ((col % ni) + ni) % ni : Math.max(0, Math.min(ni - 1, col));
  const y = Math.max(0, Math.min(nj - 1, row));
  const o = (y * ni + x) * px.channels;
  return { v: decodeByte(ch, px.data[o]), m: px.data[o + 1] >= 128 ? 1 : 0 };
};

/**
 * 셰이더의 maskedGrid(field-renderer.js)를 JS 로 옮긴 것 — 시험이 '결과'를 이것으로 본다.
 *   네 칸을 **마스크로 가중해** 잇는다: 결측 이웃은 무게 0 이라 값과 섞이지 않는다.
 *   → { value, weight, all }   weight 0 = 네 칸이 다 결측(아무 말도 하지 않는다) · all 1 = 네 칸이 다 값이다
 * ⚠️ 무게의 합이 1 인지로 '네 칸이 다 있나'를 판정하면 안 된다 — float 에서 0.99999994 가 나온다. 곱(all)으로 가른다.
 */
export const maskedValueAt = ({ px, grid, channel, lat, lon }) => {
  const { ni, nj, wraps } = grid;
  let gx = (lon - grid.lon0) / grid.dLon;
  if (wraps) gx -= Math.floor(gx / ni) * ni;
  const gy = Math.max(0, Math.min(nj - 1, (grid.lat0 - lat) / grid.dLat));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const c00 = tapAt(px, channel, x0, y0, ni, nj, wraps);
  const c10 = tapAt(px, channel, x0 + 1, y0, ni, nj, wraps);
  const c01 = tapAt(px, channel, x0, y0 + 1, ni, nj, wraps);
  const c11 = tapAt(px, channel, x0 + 1, y0 + 1, ni, nj, wraps);
  const w00 = (1 - fx) * (1 - fy) * c00.m;
  const w10 = fx * (1 - fy) * c10.m;
  const w01 = (1 - fx) * fy * c01.m;
  const w11 = fx * fy * c11.m;
  const sw = w00 + w10 + w01 + w11;
  const value = sw > 0 ? (c00.v * w00 + c10.v * w10 + c01.v * w01 + c11.v * w11) / sw : NaN;
  return { value, weight: sw, all: c00.m * c10.m * c01.m * c11.m };
};

/**
 * 격자 밖인가 — 지역 격자(동아시아 편차)와 극지(OISST 는 ±80° 까지)에서 가장자리 칸을 늘여 칠하지 않으려는 판정.
 * 셰이더의 FIELD_CLIP_OUTSIDE 와 같은 식이다(연속 칸 좌표 기준 반 칸 여유).
 */
export const outsideGrid = (grid, lat, lon) => {
  const gy = (grid.lat0 - lat) / grid.dLat;
  if (gy < -0.5 || gy > grid.nj - 0.5) return true;
  if (grid.wraps) return false;
  const gx = (lon - grid.lon0) / grid.dLon;
  return gx < -0.5 || gx > grid.ni - 0.5;
};

/** 문서의 기준 시각(ms). 열쇠를 먼저 있는 것부터 본다. 못 읽으면 null — '지금'으로 치지 않는다. */
export const docTimeMs = (doc, keys) => {
  for (const k of keys) {
    const ms = Date.parse(doc && doc[k]);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
};

/** 세대를 가르는 글자. 같은 파일이 다시 구워지면 이 글자가 바뀐다 — 바뀔 때만 캐시를 버린다. */
export const docToken = (doc) => String((doc && (doc.issuedAt || doc.generated || doc.time || doc.observed)) || '');

/**
 * 프레임이 하나뿐인 저장소의 bracket. '지금'이면 그 한 장, 아니면 outOfRange 로 밝힌다.
 *   single:true 를 같이 준다 — 카드·범례가 '예보 범위 밖'이 아니라 '이 자료는 현재 시각만 있습니다'라고 말한다.
 */
export const bracketSingle = (frame, tMs, nowMs) => {
  if (!frame || !Number.isFinite(tMs) || !Number.isFinite(nowMs)) return null;
  if (Math.abs(tMs - nowMs) < NOW_EPS_MS) {
    return { a: frame, b: frame, mix: 0, exact: true, outOfRange: null, gapH: 0, single: true };
  }
  return { a: frame, b: frame, mix: 0, exact: false, outOfRange: tMs > nowMs ? 'after' : 'before', gapH: 0, single: true };
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  저장소
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * createGridFrames(source, deps)
 *   source  GRID_SOURCES 의 한 줄(또는 같은 모양의 객체)
 *   deps    { THREE, fetch, now, base } — 전부 선택. 브라우저에서는 THREE 만 주면 된다.
 * 파일은 **한 번만** 받는다. 같은 source 를 쓰는 레이어 둘(편차의 sst·sstAnom)이 같은 저장소를 나눠 쓴다.
 */
export function createGridFrames(source, deps = {}) {
  const base = deps.base || GRID_BASE;
  const url = `${base}${source.path}`;
  const now = deps.now || (() => Date.now());
  const doFetch = deps.fetch || ((u, init) => globalThis.fetch(u, init));
  let THREE = deps.THREE || null;

  // 눈금표와 어긋난 채로 배포되지 않게 — 만들 때 한 번 본다(조용히 자르지 않는다).
  const channelsOf = (f) => Object.freeze([
    Object.freeze({ name: 'R', idx: 0, role: 'value', transfer: 'linear', scale: f.scale, offset: f.offset,
      min: f.offset, max: f.offset + 255 * f.scale, clamped: true }),
    MASK_CHANNEL,
  ]);
  for (const f of Object.values(source.fields)) {
    const bad = checkLattice(channelsOf(f)[0], scaleOf(f.scaleId));
    if (bad.length) throw new RangeError(`grid-frames: '${source.id}.${f.id}' 눈금이 표와 어긋난다 — ${bad.join(' · ')}`);
  }

  let model = null;              // { doc, token, grid, validMs, fields, frames }
  let loading = null;
  let noDataReason = null;
  const built = new Map();       // fieldId → { px, tex, stats }
  const listeners = new Set();
  const counters = { fetches: 0, swaps: 0, builds: 0 };

  const need = () => { if (!model) throw new Error('GRID_FRAMES_NOT_LOADED'); return model; };
  const fieldOf = (id) => {
    const f = need().fields[id];
    if (!f) throw new RangeError(`GRID_FRAMES_UNKNOWN_FIELD:${id}`);
    return f;
  };

  function readDoc(doc) {
    const grid = readGridShape(doc);
    if (!grid) return null;
    const validMs = docTimeMs(doc, source.timeKey);
    if (!Number.isFinite(validMs)) return null;       // 기준 시각을 모르는 자료는 '지금'이라고 말할 수 없다
    const fields = {};
    for (const f of Object.values(source.fields)) {
      const arr = doc[f.key];
      if (!Array.isArray(arr) || arr.length !== grid.ni * grid.nj) continue;   // 없는 배열은 '없음'이지 오류가 아니다
      fields[f.id] = Object.freeze({
        id: f.id, spec: f, grid, cell: 'point', channels: channelsOf(f),
        decodable: true, windowed: false, unit: f.unit, variable: f.variable, level: null, note: null,
      });
    }
    const frame = Object.freeze({ h: 0, t: validMs, url });
    const frames = {};
    for (const id of Object.keys(fields)) frames[id] = Object.freeze([frame]);
    return Object.freeze({ doc, token: docToken(doc), grid, validMs, fields: Object.freeze(fields), frames: Object.freeze(frames) });
  }

  function load() {
    if (loading) return loading;
    loading = (async () => {
      let doc = null;
      try {
        counters.fetches += 1;
        const r = await doFetch(url, { cache: 'no-cache' });
        if (r && r.ok) doc = await r.json();
      } catch (e) { doc = null; }
      const next = doc ? readDoc(doc) : null;
      if (!next) {
        // 다시 읽다 실패하면 쥐고 있던 것을 그대로 둔다 — 한 번의 네트워크 탈로 멀쩡한 격자를 버리지 않는다.
        if (!model) noDataReason = doc ? 'NO_GRID' : 'NO_DOCUMENT';
        return model ? model.doc : null;
      }
      noDataReason = null;
      if (!model || model.token !== next.token) {
        const prev = model;
        model = next;
        for (const e of built.values()) { if (e.tex && e.tex.dispose) e.tex.dispose(); }
        built.clear();
        if (prev) {
          counters.swaps += 1;
          for (const fn of listeners) { try { fn(model, prev); } catch (e) { /* 듣는 쪽의 탈이 저장소를 죽이면 안 된다 */ } }
        }
      }
      return model.doc;
    })().finally(() => { loading = null; });
    return loading;
  }

  // 값 배열 → CPU 사본 + 텍스처. 한 필드당 한 번(세대가 바뀌면 다시).
  function ensure(id) {
    const f = fieldOf(id);
    const hit = built.get(id);
    // THREE 가 뒤늦게 온 경우(provide)에는 텍스처만 다시 짓는다 — 바이트는 그대로다.
    if (hit && (hit.tex || !THREE)) return hit;
    counters.builds += 1;
    const q = hit ? { ...hit.stats, px: hit.px, tex: hit.texBytes } : quantizeGrid(model.doc[f.spec.key], f.grid, f.channels[0]);
    let tex = null;
    if (THREE) {
      tex = new THREE.DataTexture(q.tex, f.grid.ni, f.grid.nj, THREE.RGBAFormat);
      // 셰이더는 늘 칸 한가운데를 읽는다(tapValue) — 보간이 낄 자리가 없으므로 NearestFilter 가 더 안전하다.
      // (GFS 프레임이 LinearFilter 인 것은 그 텍스처를 구름·입자 셰이더도 같이 읽기 때문이다 — 여기 것은 색면 전용이다.)
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.wrapS = f.grid.wraps ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace;      // 값이지 색이 아니다
      tex.needsUpdate = true;
    }
    const entry = {
      px: q.px, tex, texBytes: q.tex,
      stats: { present: q.present, total: q.total, min: q.min, max: q.max, clampedHi: q.clampedHi, clampedLo: q.clampedLo },
    };
    built.set(id, entry);
    return entry;
  }

  const api = {
    load,
    get loaded() { return !!model; },
    get noDataReason() { return model ? null : (noDataReason || 'NO_DOCUMENT'); },
    // 받아 둔 원본 문서 — main.js 의 Intelligence 띠가 레이어의 intel 패킷을 여기서 읽는다(새 요청 없음).
    document() { return model ? model.doc : null; },
    has(id) { return !!(model && model.fields[id]); },
    fieldSpec(id) { return fieldOf(id); },
    fields() { return Object.keys(need().fields); },
    uvTransform(id) { const f = fieldOf(id); return uvTransformOf(f.grid, f.cell); },
    framesFor(id) { fieldOf(id); return model.frames[id]; },
    bracket(id, tMs) { fieldOf(id); return bracketSingle(model.frames[id][0], tMs, now()); },
    timeAt(offsetMs = 0) { return now() + offsetMs; },

    texture(id, h = 0) { return Promise.resolve(api.textureNow(id, h)); },
    textureNow(id, h = 0) { fieldOf(id); return h === 0 ? ensure(id).tex : null; },
    pixels(id, h = 0) { return Promise.resolve(api.pixelsNow(id, h)); },
    pixelsNow(id, h = 0) { fieldOf(id); return h === 0 ? ensure(id).px : null; },
    async ensure(id) { fieldOf(id); ensure(id); return api.bracket(id, now()); },

    // 한 점의 값. 결측과 섞지 않는다(maskedValueAt) · 격자 밖이면 값이 없다.
    sampleAt(id, tMs, lat, lon) {
      const f = fieldOf(id);
      const br = api.bracket(id, tMs);
      if (!br || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const e = ensure(id);
      const out = outsideGrid(f.grid, lat, lon)
        ? { value: NaN, weight: 0, all: 0 }
        : maskedValueAt({ px: e.px, grid: f.grid, channel: f.channels[0], lat, lon });
      return {
        id, a: br.a, b: br.b, mix: 0, exact: br.exact, outOfRange: br.outOfRange, gapH: 0, single: true,
        interpolated: false, window: null, decoded: true, unit: f.unit, names: e.px.names,
        values: [out.value], value: out.value, weight: out.weight,
      };
    },
    sampler(id, tMs) {
      const f = fieldOf(id);
      const br = api.bracket(id, tMs);
      if (!br) return null;
      const e = ensure(id);
      return {
        id, a: br.a, b: br.b, mix: 0, exact: br.exact, outOfRange: br.outOfRange, gapH: 0,
        interpolated: false, window: null, decoded: true, unit: f.unit, names: e.px.names,
        sample: (lat, lon, out = []) => {
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          out[0] = outsideGrid(f.grid, lat, lon) ? NaN : maskedValueAt({ px: e.px, grid: f.grid, channel: f.channels[0], lat, lon }).value;
          return out;
        },
      };
    },

    /**
     * 화면이 말할 것. single:true 라 '런'도 '유효'도 아니다 — 자료가 말하는 기준 시각 하나다.
     * delayed 는 그 자료의 주기로 잰다(OISST 는 이틀이 정상 · 제공기관 격자는 반나절).
     */
    info() {
      if (!model) return null;
      const age = api.runAge();
      return {
        model: source.sourceName, sourceName: source.sourceName, kind: source.kind,
        agency: source.sourceName, cellWord: source.cellWord,
        resolutionDeg: model.grid.dLon, grid: model.grid,
        single: true, validMs: model.validMs, run: null, runMs: NaN,
        generatedAt: model.doc.issuedAt || null, stepMs: 0,
        ageH: age ? age.ageH : null, staleH: source.staleH, delayed: !!(age && age.delayed),
      };
    },
    runAge(nowMs = now()) {
      if (!model || !Number.isFinite(nowMs)) return null;
      const ageH = (nowMs - model.validMs) / 3.6e6;
      return { runMs: model.validMs, ageH, limitH: source.staleH, delayed: ageH > source.staleH };
    },
    // 값이 있는 칸 수·범위(카드가 읽는다). 아직 안 지었으면 짓는다.
    gridStats(id) { fieldOf(id); return ensure(id).stats; },

    onSwap(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    provide(more) { if (more && more.THREE && !THREE) THREE = more.THREE; return api; },
    stats() { return { fields: model ? Object.keys(model.fields).length : 0, built: built.size, ...counters }; },
    dispose() {
      for (const e of built.values()) { if (e.tex && e.tex.dispose) e.tex.dispose(); }
      built.clear();
      listeners.clear();
    },
  };
  return api;
}

// 자료 하나에 저장소 하나. 같은 파일을 두 레이어가 써도 **한 번만** 받는다.
const shared = new Map();
export function sharedGridFrames(sourceId, deps) {
  const source = GRID_SOURCES[sourceId];
  if (!source) throw new RangeError(`grid-frames: 모르는 자료 '${sourceId}'`);
  let store = shared.get(sourceId);
  if (!store) { store = createGridFrames(source, deps || {}); shared.set(sourceId, store); }
  else if (deps) store.provide(deps);
  return store;
}
/** 시험이 저장소를 새로 얻고 싶을 때. 앱은 부르지 않는다. */
export const resetSharedGridFrames = () => { for (const s of shared.values()) s.dispose(); shared.clear(); };

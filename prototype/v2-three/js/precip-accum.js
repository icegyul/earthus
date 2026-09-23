// EARTHUS v2 — 강수 누적(3시간 · 24시간) 파생 색면 (DEV-DIRECTIVE 2026-09-20 · W4 강수 · 작업 E2)
//
// 무엇이 없어 있었나: 'raingrid' 는 GFS 강수율(mm/h) 한 장만 칠했다. 카드에 누적 단추가 없었던 것은 빠뜨려서가 아니라
// **누를 때 아무 일도 안 나는 토글을 만들지 않으려고** 일부러 뺀 것이다(작업 D2 · field-layer.js raingrid 주석).
// 그래서 "어제 하루에 얼마나 왔나 · 앞으로 세 시간에 얼마나 오나"를 유료 화면이 말하지 못했다 — 5일을 예보하는 작업 공간인데
// 말할 수 있는 것이 '지금 이 순간의 세기' 하나였다.
//
// 이 파일이 하는 일: **원 자료를 더해 파생 색면 한 장을 브라우저에서 굽는다.** 새 수집은 없다.
//   운영 매니페스트의 fields.apcp 는 **구간 누적**(mm · log10)이고 steps[].apcpWindow = {fromH, toH} 가 그 장이 덮는 구간이다.
//   GFS 는 6시간마다 버킷을 비운다: h%6==3 이면 {h−3, h}(3시간) · h%6==0 이면 {h−6, h}(6시간) · f000 에는 아예 없다.
//   그래서 구간들이 **겹친다** — f006({0,6})은 f003({0,3})을 통째로 품는다. 눈 감고 더하면 앞 세 시간을 두 번 센다.
//
// ── 어떻게 겹치지 않게 고르나 (planAccumulation) ─────────────────────────────────────────────────────────────
//   끝(endH)에서 거꾸로 걷는다. 지금 커서에서 끝나는 구간 가운데 **목표 안에 들어오는 가장 긴 것**을 집고 커서를 그 구간의
//   시작으로 옮긴다. 목표 안에 드는 것이 없으면(3시간을 원하는데 6시간 버킷뿐인 h%6==0) 가장 짧은 것을 집고,
//   넘친 만큼을 **한 장 빼서** 잘라 낸다 — 운영 매니페스트의 apcp.note 가 적어 둔 그 식이다("3-hour amount at h%6==0 is a[h] − a[h−3]").
//   ⚠️ 이 규칙을 h%6 으로 외워 적지 않는다. 버킷 배치는 매니페스트가 말하는 것이고(apcpWindow), 인코더가 바뀌면 이 식도 같이
//      바뀌어야 한다 — 창(window)만 보고 걷는다. 시험은 '시간 칸마다 부호의 합이 목표 안에서 1 · 밖에서 0' 으로 잠근다.
//   앞 구간이 아예 없으면(런 시작 직후의 24시간) **있는 만큼만 더하고 몇 시간치인지 말한다.** 0 으로 칠하지 않는다.
//
// ── 어떻게 색면이 되나 (createAccumFrames) ───────────────────────────────────────────────────────────────────
//   더한 mm 를 다시 **8bit log10 값 텍스처 한 장**으로 굽는다. 그래야 W1 렌더러(field-renderer.js)를 한 글자도 안 고치고
//   그대로 쓴다 — 셰이더에게 이 장은 그냥 '로그로 실린 또 하나의 필드'다. 저장소 겉모습도 gfs-frames.js 와 같게 맞췄다
//   (load · has · fieldSpec · uvTransform · framesFor · bracket · pixels · texture · sampleAt · onSwap). FieldLayer 는
//   저장소를 갈아 끼우기만 하면 된다.
//   인코딩은 원 자료와 **같은 문법**이다(handler.py _apcp_byte): byte 0 = 없음 · 아니면 10^(byte/255 × logSpan + logLo).
//   범위만 0.1 ~ 1000 mm 로 넓혔다 — 24시간이면 250 mm 버킷 넷이 겹치지 않게 더해지므로 원 자료의 천장(250)으로는 잘린다.
//   한 칸이 값의 ×1.037 이다(원 자료는 ×1.031). 이미 로그로 눌린 자료를 다시 눌러 담는 것이라 더해진 오차는 그 급을 넘지 않는다.
//   ⚠️ flipY — DataTexture 는 THREE 기본이 **false** 다(그림 텍스처는 true). 우리 바이트는 gfs 프레임과 같은 차례(행 0 = 북위 90)로
//      담기므로 여기서 true 로 되돌려야 셰이더의 v = 1 − (row+0.5)/nj 와 맞는다. 안 하면 남반구의 비가 북반구에 칠해지는데
//      **클릭 값은 맞게 나온다**(CPU 사본은 따로 읽는다) — 화면만 보고는 못 찾을 자리라 크게 적는다. 시험이 잡을 수 없다.
//
// ── 단위는 세 곳에서 같이 바뀐다 ─────────────────────────────────────────────────────────────────────────────
//   범례 · 카드 · 클릭 값이 모두 **눈금표 하나**(field-scales.js 의 precipAccum)의 unit 을 읽는다. 누적을 고르면 그 한 장이
//   통째로 갈리므로 셋이 같이 mm 가 된다. 'mm/h 경계에 단위 글자만 바꿔 다는' 길(precip.altUnit 의 switch)은 쓰지 않는다 —
//   24시간이면 전지구가 맨 위 칸이 된다(그 이유는 field-scales.js 의 precipAccum 머리말).
//
// 이 파일은 DOM 을 모른다. 계산(계획 · 합산 · 인코딩)은 순수 함수로 밖에 냈고 시험이 그대로 부른다.
// THREE 는 주입받는다 — 텍스처를 굽는 한 줄에만 쓴다.

import * as ThreeModule from '../../vendor/three-r184.module.min.js';
import { ByteLru, applyValueTextureDefaults, decodeByte } from './gfs-frames.js?v=2';
import { shaderValueAt } from './field-renderer.js?v=1';
import { scaleOf } from './field-scales.js?v=1';

/** 카드 칩의 열쇠. 'rate' = 지금 그 시각의 강수율(mm/h) · 나머지는 누적 시간. 순서가 곧 칩 순서다. */
export const ACCUM_KEYS = Object.freeze(['rate', '3', '24']);

/** 누적이 읽는 원 자료의 필드 이름(구간 누적 mm). 저장소와 '누르기 전 고지'가 같은 것을 봐야 하므로 한 곳에 적는다. */
export const ACCUM_SOURCE = 'apcp';

// ⚠️ 1시간 칩은 **일부러 없다.** PD 시안 03 의 드롭다운은 '1h Accumulation' 이지만, GFS 가 내놓는 누적 버킷은
//    3시간이 가장 짧다(매니페스트 fields.apcp.note). 1시간 양은 3시간 버킷을 쪼개 지어내야 나온다 — 값을 지어내지 않는다.
//    그 자리는 '현재 강우'(mm/h)가 맡는다: 1시간 동안 그 세기가 이어졌다면 mm 의 수가 mm/h 의 수와 같다.
//    6시간은 h%6==0 에서 버킷 한 장 그대로라 공짜지만 PD 가 청하지 않아 만들지 않았다(칩을 스스로 늘리지 않는다).

/**
 * 파생 값 텍스처의 디코드 상수. 원 자료(apcp)와 **같은 문법**이고 범위만 넓다 — 왜 넓혀야 하는지는 머리말.
 * 모양은 gfs-frames.readManifest 가 만드는 채널과 같다(field-renderer · field-log · field-labels 가 그대로 읽는다).
 */
export const ACCUM_CHANNEL = Object.freeze({
  name: 'R', idx: 0, transfer: 'log10',
  logLo: -1,        // log10(0.1 mm)
  logSpan: 4,       // log10(1000 / 0.1)
  zeroByte: 0, min: 0.1, max: 1000, component: null,
});
const ACCUM_CHANNELS = Object.freeze([ACCUM_CHANNEL]);

/**
 * 파생 장을 쥐고 있는 상한(바이트). 한 장은 GPU RGBA 1.04 MB + CPU 사본 0.26 MB — 데스크톱은 여덟 장이면
 * 재생 중 되굽지 않는다.
 * ⚠️ 기기를 가려야 한다. 원 프레임 저장소는 폰 32 MB · 데스크톱 128 MB 로 가르는데(gfs-frames.js budgetFor),
 *    파생 캐시가 기기와 무관하게 12 MB 를 쓰면 폰이 파생 장만 아홉 장(GPU 9.4 MB)을 더 쥔다 — 폰 상한을
 *    따로 정해 둔 까닭과 어긋난다. 여기서는 세 장치(약 3.9 MB)까지만 쥔다: 재생 중 한 걸음 앞뒤를 덮는 수다.
 */
export const ACCUM_CACHE_BYTES = 12 * 1024 * 1024;
export const ACCUM_CACHE_BYTES_PHONE = 4 * 1024 * 1024;
/** 기기별 파생 캐시 상한(순수) — 저장소를 만드는 자리와 시험이 같은 수를 본다. */
export const accumCacheBytes = (isPhone) => (isPhone ? ACCUM_CACHE_BYTES_PHONE : ACCUM_CACHE_BYTES);

const HOUR_MS = 3.6e6;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산 — 계획 · 합산 · 인코딩. 시험이 이 함수들로 '결과'를 본다.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const spanOf = (f) => f.window.toH - f.window.fromH;

/**
 * endH 에 끝나는 hours 시간 누적을 **겹치지 않게** 만드는 계획.
 *   list   [{h, t, window:{fromH, toH}}, …] — gfs-frames.framesFor('apcp') 그대로(창이 없는 장은 건너뛴다)
 *   → { endH, hours, fromH, toH, coveredH, short, terms:[{h, sign, window}] } | null(더할 장이 하나도 없다)
 * terms 의 부호를 그대로 더하면 [fromH, toH] 가 **한 번씩만** 덮인다(coverageOf 가 그것을 센다).
 * short 면 앞 구간이 모자란 것이다 — 부른 쪽이 '몇 시간치'인지 말해야 한다(0 으로 칠하지 않는다).
 */
export function planAccumulation(list, endH, hours) {
  if (!Array.isArray(list) || !list.length || !(hours > 0) || !Number.isFinite(endH)) return null;
  const byEnd = new Map();
  for (const f of list) {
    const w = f && f.window;
    if (!w || !Number.isFinite(w.fromH) || !Number.isFinite(w.toH) || !(w.toH > w.fromH)) continue;
    const at = byEnd.get(w.toH);
    if (at) at.push(f); else byEnd.set(w.toH, [f]);
  }
  const want = endH - hours;
  const terms = [];
  let cursor = endH;
  while (cursor > want) {
    const cands = byEnd.get(cursor);
    if (!cands || !cands.length) break;                       // 앞으로 더 갈 장이 없다 — 여기까지만 더한다
    // 목표 안에 드는 것 중 가장 긴 것(장 수를 줄인다 = 더하기 횟수도 8bit 오차도 줄인다).
    // 하나도 안 들면 가장 짧은 것을 집는다 — 아래에서 넘친 만큼을 잘라 낸다.
    let pick = null;
    for (const f of cands) {
      const inside = f.window.fromH >= want;
      if (!pick) { pick = f; continue; }
      const pickInside = pick.window.fromH >= want;
      if (inside !== pickInside) { if (inside) pick = f; continue; }
      if (inside ? spanOf(f) > spanOf(pick) : spanOf(f) < spanOf(pick)) pick = f;
    }
    terms.push({ h: pick.h, sign: 1, window: pick.window });
    cursor = pick.window.fromH;
  }
  if (terms.length && cursor < want) {
    // 끝 조각이 목표 아래로 넘쳤다. 넘친 [cursor, want] 를 덮는 장이 있으면 **빼서** 자른다(매니페스트가 적어 둔 그 식).
    const cut = (byEnd.get(want) || []).find((f) => f.window.fromH === cursor);
    if (cut) { terms.push({ h: cut.h, sign: -1, window: cut.window }); cursor = want; }
    else { cursor = terms.pop().window.toH; }                 // 뺄 장이 없다 — 넘친 조각을 버리고 모자란 채로 말한다
  }
  if (!terms.length) return null;
  return Object.freeze({
    endH, hours, fromH: cursor, toH: endH,
    coveredH: endH - cursor,
    short: endH - cursor < hours,
    terms: Object.freeze(terms.map((t) => Object.freeze(t))),
  });
}

/**
 * 계획의 구간들을 부호대로 더하면 시간축의 한 칸(1시간)이 몇 번 덮이나.
 *   → { from, counts:[…] }  — counts[i] 는 [from+i, from+i+1) 의 부호 합. 1 과 0 말고는 전부 사고다(두 번 더했거나 구멍).
 * 시험이 이것으로 '두 번 더하지 않는다'를 잠근다.
 */
export function coverageOf(terms) {
  const list = (terms && terms.terms) || terms || [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of list) { lo = Math.min(lo, t.window.fromH); hi = Math.max(hi, t.window.toH); }
  if (!Number.isFinite(lo)) return { from: 0, counts: [] };
  const counts = new Array(hi - lo).fill(0);
  for (const t of list) for (let h = t.window.fromH; h < t.window.toH; h += 1) counts[h - lo] += t.sign;
  return { from: lo, counts };
}

/**
 * 시각을 덮는 장 = **그 시각 이하의 마지막 장**. 되돌아보는 누적이라서다(앞을 고르면 아직 오지 않은 비를 이미 온 것처럼 말한다).
 * 저장소의 bracket 과 '누르기 전 고지'가 같은 장을 고르도록 규칙을 여기 한 번만 적는다. 목록은 시간순이고 비어 있을 수 있다.
 */
export function frameAtOrBefore(list, tMs) {
  if (!Array.isArray(list) || !list.length || !Number.isFinite(tMs) || tMs < list[0].t) return null;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].t <= tMs) lo = mid; else hi = mid - 1;
  }
  return list[lo];
}

/**
 * 원 자료의 스텝마다 '그 시각까지 hours 시간' 계획을 세운 목록. 계획이 서지 않는 스텝(f000)은 목록에 없다.
 * 저장소와 '누르기 전 고지'가 **같은 목록**을 봐야 화면과 고지가 어긋나지 않으므로, 원 목록(매니페스트 한 세대에 한 벌인
 * 얼린 배열)을 열쇠로 기억해 둔다 — 세대가 바뀌면 gfs-frames 가 새 배열을 만들어 이 기억은 저절로 버려진다.
 */
const listMemo = new WeakMap();
const EMPTY_LIST = Object.freeze([]);
export function accumFrameList(src, hours) {
  if (!Array.isArray(src) || !src.length || !(hours > 0)) return EMPTY_LIST;
  let byHours = listMemo.get(src);
  if (!byHours) { byHours = new Map(); listMemo.set(src, byHours); }
  const hit = byHours.get(hours);
  if (hit) return hit;
  const out = [];
  for (const f of src) {
    const plan = planAccumulation(src, f.h, hours);
    if (!plan) continue;
    out.push(Object.freeze({
      h: f.h, t: f.t, url: f.url,
      window: Object.freeze({ fromH: plan.fromH, toH: plan.toH }),
      accum: plan,
    }));
  }
  const frozen = Object.freeze(out);
  byHours.set(hours, frozen);
  return frozen;
}

/**
 * 지금 커서에서 그 기간이 **몇 시간치인가** — 칩을 누르기 전에 말하기 위한 것이다.
 *   → { hours, coveredH, short } | null(이 시각에서 끝나는 구간이 아직 없다)
 * 왜 필요한가: 한 런은 제 시작 이전을 모른다. 첫 apcp 구간은 런+3h 에서 끝나므로 커서가 런+4h~런+24h 사이인 동안
 * '24시간 누적'은 3·6·9…시간치다(운영 매니페스트로 실측). GFS 는 6시간마다 돌고 발표까지 4~5시간이 걸리므로
 * 그 구간이 곧 '그 런이 최신인 내내'다 — 눌러 본 뒤에야 알게 하지 않는다.
 */
export function accumAvailability(src, tMs, hours) {
  const fr = frameAtOrBefore(accumFrameList(src, hours), tMs);
  if (!fr) return null;
  return { hours, coveredH: fr.accum.coveredH, short: fr.accum.short };
}

/** 바이트 → 값 표 256칸. 260,000 칸을 프레임마다 exp 로 풀면 폰이 뜨겁다 — 표를 한 번 만들어 쓴다. */
const decodeLut = (ch) => {
  const lut = new Float32Array(256);
  for (let b = 0; b < 256; b += 1) lut[b] = decodeByte(ch, b);
  return lut;
};

/**
 * 계획대로 더한 mm 한 장(Float32Array · 칸 차례는 CPU 사본 그대로 행 0 = 북).
 *   pixelsOf(h) → gfs-frames.pixels 의 결과 {w, h, channels, data} · ch  원 자료의 채널(apcp 의 R)
 * ⚠️ 바이트를 더하지 않는다 — **풀어서** 더한다. 로그 바이트의 합은 어떤 양도 아니다(곱이 된다).
 * 뺄셈이 만든 아주 작은 음수는 양이 아니라 8bit 로그 눈금의 잡음이다(한 칸이 값의 ×1.031) — 0 으로 눕힌다.
 */
export function sumAccumulation(terms, pixelsOf, ch, out = null) {
  const list = (terms && terms.terms) || terms || [];
  if (!list.length || !ch) return null;
  const lut = decodeLut(ch);
  let cells = -1;
  let acc = null;
  for (const t of list) {
    const px = pixelsOf(t.h);
    if (!px || !px.data) return null;
    const n = px.w * px.h;
    if (cells < 0) {
      cells = n;
      acc = (out && out.length === n) ? out : new Float32Array(n);
      acc.fill(0);
    } else if (n !== cells) return null;                      // 격자가 다른 장을 섞지 않는다
    const stride = px.channels || 1;
    const d = px.data;
    if (t.sign > 0) for (let i = 0, o = 0; i < cells; i += 1, o += stride) acc[i] += lut[d[o]];
    else for (let i = 0, o = 0; i < cells; i += 1, o += stride) acc[i] -= lut[d[o]];
  }
  for (let i = 0; i < cells; i += 1) if (!(acc[i] > 0)) acc[i] = 0;
  return acc;
}

/**
 * mm 한 장 → 8bit 값 텍스처의 바이트. handler.py `_apcp_byte` 와 **같은 식**이다(바닥 이하는 0 · 나머지는 로그 비율 반올림).
 * 바닥(0.1 mm) 바로 위가 0 으로 떨어지는 것도 원 자료와 같다 — 같은 문법을 지키는 쪽이 낫다.
 */
export function encodeAccumBytes(mm, ch = ACCUM_CHANNEL, out = null) {
  const n = mm.length;
  const bytes = (out && out.length === n) ? out : new Uint8Array(n);
  const { logLo, logSpan, zeroByte, min } = ch;
  for (let i = 0; i < n; i += 1) {
    const v = mm[i];
    if (!(v > min)) { bytes[i] = zeroByte; continue; }
    const t = (Math.log10(v) - logLo) / logSpan;
    bytes[i] = Math.round(Math.max(0, Math.min(1, t)) * 255);
  }
  return bytes;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  저장소 — 겉모습은 gfs-frames.js 와 같다. FieldLayer 는 갈아 끼우기만 한다.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * createAccumFrames(base, { hours, THREE, fieldId, sourceId, maxBytes })
 *   base      공용 GFS 프레임 저장소(sharedGfsFrames) — 원 자료(apcp)는 여기서 온다. 새 네트워크 호출은 없다.
 *   fieldId   이 저장소가 대답하는 필드 이름. FieldLayer 의 descriptor 가 부르는 그 이름 그대로다('precip') —
 *             레이어 id·현상 id 를 개명하지 않는 것과 같은 규칙이고, 여기서만 뜻이 '그 시각까지의 누적'으로 바뀐다.
 * 세대(런)가 바뀌면 원 자료가 갈리므로 구워 둔 장도 옛것이다 — 매니페스트의 generatedAt 이 바뀌면 통째로 버린다.
 */
export function createAccumFrames(base, opts = {}) {
  const hours = Number(opts.hours);
  const fieldId = opts.fieldId || 'precip';
  const sourceId = opts.sourceId || 'apcp';
  const THREE = opts.THREE || ThreeModule;                    // 시험은 가짜를 넣는다(DataTexture 의 flipY 기본값까지 흉내 낸다)
  const lru = new ByteLru(opts.maxBytes || ACCUM_CACHE_BYTES, (e) => {
    if (e.tex && e.tex.dispose) e.tex.dispose();
    e.px = null;
  });
  const inflight = new Map();
  const counters = { builds: 0, misses: 0 };
  let listCache = null;
  let listToken = null;
  let specCache = null;

  const tokenOf = () => {
    const i = base.info ? base.info() : null;
    return i ? (i.generatedAt || i.run || '') : null;
  };
  const wrongField = (id) => new RangeError(`precip-accum: 모르는 필드 '${id}'`);

  /** 원 자료의 스텝마다 '그 시각까지 hours 시간' 계획을 미리 세워 둔다. 계획이 없는 스텝(f000)은 목록에 없다. */
  function framesList() {
    const tok = tokenOf();
    if (tok === null) return [];
    if (listCache && listToken === tok) return listCache;
    listToken = tok;
    specCache = null;
    lru.clear();                                              // 세대가 바뀌었다 — 옛 원 자료로 구운 장을 새 세대에 쓰지 않는다
    // 목록 만들기는 모듈 위쪽 accumFrameList 한 곳에만 있다 — 카드의 '누르기 전 고지'가 보는 목록과 화면이 칠하는
    // 목록이 같아야 둘이 다른 말을 하지 않는다.
    listCache = accumFrameList(base.has(sourceId) ? base.framesFor(sourceId) : null, hours);
    return listCache;
  }

  const frameAt = (h) => framesList().find((f) => f.h === h) || null;

  function fieldSpec(id) {
    if (id !== fieldId) throw wrongField(id);
    const tok = tokenOf();
    if (specCache && listToken === tok) return specCache;
    framesList();
    const src = base.fieldSpec(sourceId);
    specCache = Object.freeze({
      id: fieldId, stepKey: fieldId, grid: src.grid, cell: src.cell,
      channels: ACCUM_CHANNELS,
      decodable: !!src.grid,
      windowed: true,                                         // 구간 누적 — 두 장을 시간으로 섞지 않는다
      unit: 'mm', variable: src.variable, level: src.level,
      note: '브라우저에서 겹치지 않는 GFS 누적 버킷을 더한 파생 장입니다 — 모델 강수율의 합산입니다.',
    });
    return specCache;
  }

  /**
   * 시각을 덮는 장 하나. **섞지 않는다** — a[h] 는 '그 구간 동안의 양'이라 두 장의 가운데 값은 어느 구간의 양도 아니다.
   * 그래서 늘 mix 0 이고, 고른 장은 그 시각 이하의 마지막 장이다(누적 창의 끝이 곧 화면이 말하는 유효 시각이다).
   */
  function bracket(id, tMs) {
    if (id !== fieldId) throw wrongField(id);
    const list = framesList();
    if (!list.length || !Number.isFinite(tMs)) return null;
    const first = list[0];
    const last = list[list.length - 1];
    if (tMs < first.t) return { a: first, b: first, mix: 0, exact: false, outOfRange: 'before', gapH: 0 };
    if (tMs > last.t) return { a: last, b: last, mix: 0, exact: false, outOfRange: 'after', gapH: 0 };
    // ⚠️ gfs-frames.js 의 sampler 는 구간 자료에서 **b** 를 고른다("시각 t 를 덮는 구간은 b 의 것이다"). 여기서는
    //    일부러 **a**(t 이하의 마지막 장)를 고른다 — 되돌아보는 누적이라서다. b 를 고르면 커서가 25:30 일 때 27시
    //    까지의 양을 칠하게 되고, 화면이 아직 오지 않은 1시간 30분의 비를 이미 온 것처럼 말한다. 맞추러 고치지 말 것.
    const a = frameAtOrBefore(list, tMs);                     // 그 규칙은 모듈 위쪽에 한 번만 적혀 있다
    return { a, b: a, mix: 0, exact: true, outOfRange: null, gapH: 0 };
  }

  function build(fr) {
    const need = [...new Set(fr.accum.terms.map((t) => t.h))];
    const born = listToken;
    counters.builds += 1;
    return Promise.all(need.map((h) => base.pixels(sourceId, h))).then((got) => {
      if (listToken !== born) return null;                    // 받는 사이 세대가 바뀌었다 — 옛 장을 새 캐시에 넣지 않는다
      if (got.some((p) => !p || !p.data)) return null;
      const spec = fieldSpec(fieldId);
      const grid = spec.grid;
      const px0 = got[0];
      if (!grid || px0.w !== grid.ni || px0.h !== grid.nj) return null;   // 격자가 안 맞으면 값을 읽지 않는다(gfs-frames 와 같은 규칙)
      const byH = new Map(need.map((h, i) => [h, got[i]]));
      const mm = sumAccumulation(fr.accum, (h) => byH.get(h), base.fieldSpec(sourceId).channels[0]);
      if (!mm) return null;
      const bytes = encodeAccumBytes(mm);
      if (!THREE) throw new Error('PRECIP_ACCUM_NEEDS_THREE');
      // 셰이더는 .rg 를 읽는다 — 그림 프레임과 같은 RGBA 한 벌로 올린다(R 이 값 · A 는 채우기).
      const rgba = new Uint8Array(bytes.length * 4);
      for (let i = 0, o = 0; i < bytes.length; i += 1, o += 4) { rgba[o] = bytes[i]; rgba[o + 3] = 255; }
      const tex = applyValueTextureDefaults(THREE, new THREE.DataTexture(rgba, px0.w, px0.h, THREE.RGBAFormat));
      tex.flipY = true;                                       // ⚠️ DataTexture 기본은 false — 머리말 'flipY'
      tex.needsUpdate = true;
      return {
        h: fr.h, tex, gpuBytes: rgba.length,
        px: Object.freeze({ w: px0.w, h: px0.h, channels: 1, names: Object.freeze(['R']), data: bytes }),
      };
    });
  }

  function entryOf(h) {
    const fr = frameAt(h);
    if (!fr) return Promise.resolve(null);
    const key = String(h);
    const hit = lru.get(key);
    if (hit) return Promise.resolve(hit);
    const waiting = inflight.get(key);
    if (waiting) return waiting;
    counters.misses += 1;
    const pr = Promise.resolve().then(() => build(fr)).then((entry) => {
      if (inflight.get(key) === pr) inflight.delete(key);
      if (!entry) return null;
      lru.set(key, entry, entry.gpuBytes + entry.px.data.byteLength);
      return entry;
    }).catch((err) => {
      if (inflight.get(key) === pr) inflight.delete(key);
      if (err && err.message === 'PRECIP_ACCUM_NEEDS_THREE') throw err;
      return null;                                            // 실패는 캐시하지 않는다 — 다시 청하면 다시 굽는다
    });
    inflight.set(key, pr);
    return pr;
  }

  const api = {
    load() { return base.load(); },
    get loaded() { return base.loaded; },
    get noDataReason() { return base.noDataReason; },
    get manifest() { return base.manifest; },
    info() { return base.info ? base.info() : null; },
    runAge(nowMs) { return base.runAge ? base.runAge(nowMs) : null; },
    timeAt(offsetMs = 0) { return base.timeAt(offsetMs); },
    fields() { return [fieldId]; },
    has(id) { return id === fieldId && !!base.loaded && base.has(sourceId) && framesList().length > 0; },
    fieldSpec,
    uvTransform(id) { if (id !== fieldId) throw wrongField(id); return base.uvTransform(sourceId); },
    framesFor(id) { if (id !== fieldId) throw wrongField(id); return framesList(); },
    bracket,
    texture(id, h) { if (id !== fieldId) throw wrongField(id); return entryOf(h).then((e) => (e ? e.tex : null)); },
    textureNow(id, h) { if (id !== fieldId) throw wrongField(id); const e = lru.get(String(h)); return e ? e.tex : null; },
    pixels(id, h) { if (id !== fieldId) throw wrongField(id); return entryOf(h).then((e) => (e ? e.px : null)); },
    pixelsNow(id, h) { if (id !== fieldId) throw wrongField(id); const e = lru.get(String(h)); return e ? e.px : null; },
    async ensure(id, tMs) {
      const br = bracket(id, tMs);
      if (!br) return null;
      await api.pixels(id, br.a.h);
      return br;
    },
    /**
     * 한 점의 누적 값(클릭 판독) — **네트워크 0건**이고, 값은 셰이더가 칠할 때 쓰는 그 식(shaderValueAt)으로 읽는다.
     * 그래야 손가락 밑에 칠해진 칸과 카드가 적는 칸이 어긋나지 않는다.
     */
    sampleAt(id, tMs, lat, lon) {
      if (id !== fieldId) throw wrongField(id);
      const br = bracket(id, tMs);
      if (!br) return null;
      const e = lru.get(String(br.a.h));
      if (!e || !e.px) return null;                           // 아직 안 구웠다 — 부른 쪽이 pixels 로 먼저 받는다
      const spec = fieldSpec(fieldId);
      if (!spec.grid) return null;
      const v = shaderValueAt({
        a: e.px, b: null, mix: 0, decode: spec.channels,
        uvT: base.uvTransform(sourceId), size: { ni: spec.grid.ni, nj: spec.grid.nj },
        wraps: spec.grid.wraps !== false, mode: 'scalar',
      }, lat, lon);
      if (!Number.isFinite(v)) return null;
      return {
        id: fieldId, a: br.a, b: br.b, mix: 0, exact: br.exact, outOfRange: br.outOfRange, gapH: 0,
        interpolated: false, window: br.a.window, accum: br.a.accum,
        decoded: true, unit: 'mm', names: e.px.names, values: [v], value: v,
      };
    },
    onSwap(fn) {
      if (!base.onSwap) return () => {};
      return base.onSwap((next, prev) => { listCache = null; specCache = null; lru.clear(); fn(next, prev); });
    },
    stats() { return { hours, entries: lru.size, bytes: lru.bytes, maxBytes: lru.maxBytes, ...counters }; },
    dispose() { inflight.clear(); lru.clear(); listCache = null; specCache = null; },
  };
  return api;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  FieldLayer 에 붙는 자리 — 로직은 전부 여기 둔다(field-layer.js 는 세 작업이 동시에 고치는 공용 파일이다).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 누적 모드의 descriptor. 원본(raingrid)에서 **바뀌는 것만** 덮어쓴다 — 레이어 id 도 필드 id 도 그대로다.
 * title 이 바뀌므로 범례 제목이 같이 바뀌고, scaleId 가 바뀌므로 색·경계·단위가 같이 바뀐다.
 */
const descCache = new Map();
export function accumDescriptorOf(baseDesc, hours) {
  const key = `${baseDesc.layerId}|${hours}`;
  const hit = descCache.get(key);
  if (hit) return hit;
  const desc = Object.freeze({
    ...baseDesc,
    scaleId: 'precipAccum',
    accumHours: hours,
    title: Object.freeze({ ko: `전지구 강수 · ${hours}시간 누적`, en: `Global precipitation · ${hours} h total` }),
    quantity: Object.freeze({ ko: `${hours}시간 누적 강수`, en: `${hours} h precipitation` }),
    isoName: Object.freeze({ ko: '누적 코어 윤곽', en: 'Heavy-total outline' }),
    zeroText: Object.freeze({ ko: '비 없음', en: 'No rain' }),
    // 카드의 '이 색면은 …입니다' 한 마디. 지시서 W4 의 글자 그대로다.
    nature: Object.freeze({ ko: '모델 강수율의 합산', en: 'a sum of the model precipitation buckets' }),
    // 카드의 닫는 줄 — 누적은 프레임 사이를 섞지 않으므로 기온·강수율의 그 문장을 쓰면 거짓이 된다.
    timelineNote: Object.freeze({
      ko: '타임라인을 밀면 누적 구간이 3시간씩 옮겨 갑니다 — 구간끼리 값을 섞지 않고, 그 구간이 끝나는 모델 프레임을 그대로 칠합니다. 지구를 누르면 그 자리의 누적량을 범례 아래에 적습니다(네트워크 조회 없음).',
      en: 'Dragging the timeline steps the accumulation window by 3 h — windows are never blended. Tap the globe to read the total there (no network request).',
    }),
  });
  descCache.set(key, desc);
  return desc;
}

/**
 * 카드가 읽는 지금 상태. 누적 훅이 없는 레이어(기온·바람·기압·바다)는 null 이라 카드에 이 줄이 통째로 없다.
 *   avail   **아직 안 고른** 기간마다 '지금 커서에서 몇 시간치인가'. 온전하면 그 칸이 없다.
 *   shape   이 줄의 글이 달라졌는지 가리는 서명 — field-layer.js 의 카드 모양 열쇠가 이것을 함께 읽는다.
 *           칩 줄은 시각을 따라 바뀌는 덩어리([data-field-live]) **밖**이라, 서명이 없으면 타임라인을 밀 때
 *           칩 줄만 옛 글로 남는다(고른 기간의 상태 줄은 갱신되는데 그 옆의 고지는 안 바뀌는 어긋남).
 */
export const accumCardState = (layer) => {
  const d = layer && layer.desc;
  if (!d || !d.accum) return null;
  const fr = layer.status && layer.status.a;
  const key = d.accumHours ? String(d.accumHours) : 'rate';
  // 고지는 **원 자료**(apcp) 목록에서 센다 — 아직 고르지 않은 기간에는 파생 저장소가 없고, 고지 하나 때문에
  // 저장소를 미리 만들어 텍스처를 굽지 않는다(폰 메모리).
  const base = layer.baseFrames || layer.frames;
  const tMs = layer.timeBus ? layer.timeBus.validMs() : NaN;
  const src = (base && base.loaded && base.has && base.has(ACCUM_SOURCE)) ? base.framesFor(ACCUM_SOURCE) : null;
  const avail = {};
  for (const k of ACCUM_KEYS) {
    if (k === 'rate' || k === key) continue;                  // 고른 기간은 상태 줄이 이미 말한다 — 두 번 적지 않는다
    const a = accumAvailability(src, tMs, Number(k));
    if (!a) avail[k] = 0;                                     // 이 시각에서 끝나는 구간이 아직 없다
    else if (a.short) avail[k] = a.coveredH;
  }
  return {
    key, keys: ACCUM_KEYS, avail,
    plan: (fr && fr.accum) || null,
    shape: `${key}|${ACCUM_KEYS.map((k) => (k in avail ? avail[k] : '')).join(',')}`,
  };
};

const chipLabel = (k, ko) => {
  if (k === 'rate') return ko ? '현재 강우' : 'Rate now';
  return ko ? `${k}시간 누적` : `${k} h total`;
};

/**
 * '아직 몇 시간치' 고지(순수). avail 은 accumCardState 가 센 것 — 온전한 기간은 칸이 아예 없다.
 * 왜 이 줄이 있나: 24시간 칩은 **런이 시작하고 24시간이 지나야** 24시간이 된다. 커서가 그 앞이면 눌러도
 * 3·6·9…시간치가 칠해진다. 지금은 앞 런의 자료를 붙이지 않으므로 고칠 수 있는 것은 '미리 말하는 것'이다.
 */
export const accumAheadText = (avail, ko = true) => {
  const keys = ACCUM_KEYS.filter((k) => k !== 'rate' && avail && k in avail);
  if (!keys.length) return '';
  const parts = keys.map((k) => (avail[k] > 0
    ? (ko ? `${k}시간 누적이 ${avail[k]}시간치입니다` : `the ${k} h total covers only ${avail[k]} h`)
    : (ko ? `${k}시간 누적은 이 시각에서 끝나는 구간이 아직 없습니다` : `the ${k} h total has no window ending here yet`)));
  return ko
    ? `지금 커서에서는 ${parts.join(' · ')} — 한 런은 제 시작 이전을 모릅니다. 타임라인을 앞으로 밀면 구간이 찹니다.`
    : `At this cursor ${parts.join(' · ')} — a run knows nothing before its own start; move the timeline forward and the window fills.`;
};

/**
 * 카드의 누적 칩 줄(순수). btn 은 field-layer.js 의 단추 만들기 — 단추 모양을 두 곳에 적지 않으려고 받아 쓴다.
 *   m = { accum:{key, keys, plan}, ko }
 * 글은 전부 이 모듈의 상수라 바깥에서 들어오는 글자가 없다(symbolCardRow 와 같은 규칙).
 */
export const accumCardRow = (m, btn) => {
  const ko = m.ko !== false;
  const a = m.accum;
  const chips = a.keys.map((k) => btn('field-accum', `data-window="${k}"`, a.key === k, chipLabel(k, ko))).join('');
  const what = a.key === 'rate'
    ? (ko
      ? '그 시각의 모델 강수율(mm/h)입니다 — 한 순간의 세기이지 양이 아닙니다.'
      : 'The model precipitation rate at that moment (mm/h) — an intensity, not an amount.')
    : (ko
      ? `그 시각까지 ${a.key}시간 동안의 양(mm)입니다 — 모델 강수율의 합산입니다. 겹치지 않는 GFS 누적 버킷만 더합니다(브라우저에서 · 새 수집 없음).`
      : `The amount over the ${a.key} h ending at that time (mm) — a sum of the model precipitation buckets, taken from non-overlapping GFS buckets in the browser.`);
  // 뺄셈으로 얻은 구간은 눈금이 거칠다 — 두 장이 각각 값의 ×1.031 로 눌려 있어 그 차의 분해능은 **덜어 낸 양의 약 3 %** 다.
  // ⚠️ 기간마다 뺄셈의 뜻이 다르다. 3시간은 장 하나에서 장 하나를 빼는 것(6시간 − 앞 3시간)이라 값 전체가 그 차이지만,
  //    24시간은 다섯 장을 더하고 **구간 앞머리 3시간 한 장만** 덜어 낸 것이라 거칠어지는 것은 그 3시간 몫뿐이다
  //    (운영 프레임으로 잰 파생 24시간 장의 왕복 상대오차는 최대 1.82 %). 한 문장을 둘에 돌려쓰면 24시간에서 거짓이 된다.
  const hasCut = !!(a.plan && a.plan.terms.some((t) => t.sign < 0));
  const cut = !hasCut ? '' : (a.key === '3'
    ? (ko
      ? '이 시각의 값은 6시간 버킷에서 앞 3시간 버킷을 <b>뺀</b> 것입니다 — 앞 구간의 양이 클수록 눈금이 거칠어집니다(그 양의 약 3 %).'
      : 'At this step the amount is a 6 h bucket <b>minus</b> the preceding 3 h bucket — the larger the earlier amount, the coarser this one (about 3 % of it).')
    : (ko
      ? '이 시각의 값은 버킷들을 더한 뒤 구간 앞머리의 3시간 한 장을 <b>덜어 내</b> 맞춘 것입니다 — 덜어 낸 그 3시간 양의 약 3 % 만큼만 거칠어집니다.'
      : 'At this step the buckets are summed and a single leading 3 h bucket is <b>taken off</b> to trim the window — only that trimmed amount is coarsened (about 3 % of it).'));
  // 아직 안 고른 기간이 지금 커서에서 몇 시간치인지 **누르기 전에** 적는다. 한 런은 제 시작 이전을 모르므로
  // 런이 막 나왔을 때(그 런이 최신인 내내다) '24시간 누적'은 3·6·9…시간치다 — 눌러 본 뒤에야 알게 하지 않는다.
  const ahead = accumAheadText(a.avail, ko);
  const why = ko
    ? '1시간 누적은 없습니다 — GFS 가 내놓는 누적 버킷은 3시간이 가장 짧아 1시간 양은 지어내야 합니다. 그 자리는 현재 강우가 맡습니다.'
    : 'There is no 1 h total — GFS publishes 3 h buckets at the finest, so a 1 h amount would have to be invented. Rate now stands in for it.';
  return `<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px">${ko ? '기간' : 'Period'} `
    + `${chips}</span><span style="opacity:.8">${what}</span>`
    + (cut ? `<br/><span style="opacity:.8">${cut}</span>` : '')
    + (ahead ? `<br/><span style="opacity:.8">${ahead}</span>` : '')
    + `<br/><span style="opacity:.7">${why}</span>`;
};

/**
 * 누적일 때의 상태 한 줄 — '그 시각의 값'이 아니라 '그 구간 동안의 양'이라고 말한다.
 * fmtValid 는 field-layer.js 의 시각 글자 함수를 받아 쓴다(시각 꼴을 두 곳에 적지 않는다).
 */
export const accumStatusText = (st, { ko = true, short = false, fmtValid = null } = {}) => {
  const fr = st && st.a;
  const acc = fr && fr.accum;
  if (!acc) return '';
  const span = fmtValid ? `${fmtValid(fr.t - acc.coveredH * HOUR_MS, ko)} ~ ${fmtValid(fr.t, ko)}` : '';
  const got = ko ? `${acc.coveredH}시간` : `${acc.coveredH} h`;
  if (!acc.short) {
    if (short) return ko ? `${got} 누적 · ${span}` : `${got} total · ${span}`;
    return ko
      ? `${got} 누적 — ${span} 동안의 양입니다. 모델 프레임 사이를 섞지 않고 그 구간이 끝나는 프레임을 그대로 칠합니다.`
      : `${got} total — the amount between ${span}. Windows are painted as issued, never blended.`;
  }
  const want = ko ? `${acc.hours}시간` : `${acc.hours} h`;
  if (short) return ko ? `${want} 중 ${got}치만 · ${span}` : `only ${got} of ${want} · ${span}`;
  return ko
    ? `${want}을 청했지만 이 런에는 ${got}치(${span})밖에 없습니다 — 모자란 앞 구간을 0 으로 칠하지 않고 있는 만큼만 더했습니다.`
    : `${want} was asked for, but this run only covers ${got} (${span}) — the missing hours are left out, not painted as zero.`;
};

/**
 * 누적일 때 범례의 풀이 줄. 누적이 아니면 null 이라 부른 쪽이 제 길로 간다.
 * 무엇을 고치나: 범례의 풀이 줄은 하나다. 누적에서는 statusText(short) 가 **늘** 구간 문구를 내놓으므로
 * (현재 강우에서는 빈 글자였다) 눈금표의 상시 고지(scaleNote — '0.5 mm 미만은 칠하지 않습니다')가 화면에서
 * 통째로 사라졌다. field-layer.js 의 scaleNote 주석이 스스로 적어 둔 규칙('둘 중 하나만 넘기면 나머지를 잃는다')을
 * 누적 갈래가 다시 깬 것이다. scaleNote 가 두 조각을 잇듯 여기서도 같은 가운뎃점으로 잇는다.
 */
export const accumLegendNote = (layer, short) => {
  if (!layer || !layer.desc || !layer.desc.accumHours || !short) return null;
  const note = layer.scaleNote ? layer.scaleNote() : '';
  return note ? `${short} · ${note}` : short;
};

/** 범례·카드가 말하는 유효 시각. 누적은 타임라인의 시각이 아니라 **그 구간의 끝**이다. 누적이 아니면 null. */
export const accumValidMs = (layer) => {
  const fr = layer && layer.status && layer.status.a;
  return (fr && fr.accum && Number.isFinite(fr.t)) ? fr.t : null;
};

/** 이 레이어의 누적 저장소(시간별로 하나 · 처음 쓸 때 만든다). base 는 원래 물려 있던 공용 GFS 저장소다. */
function storeFor(layer, hours) {
  layer._accumStores = layer._accumStores || new Map();
  let store = layer._accumStores.get(hours);
  if (!store) {
    store = createAccumFrames(layer.baseFrames, {
      hours, fieldId: layer.baseDesc.fieldId, sourceId: ACCUM_SOURCE,
      THREE: layer.deps.THREE || null,                        // 안 주면 저장소가 제 THREE 를 쓴다
      maxBytes: accumCacheBytes(!!layer.deps.isPhone),        // 원 프레임 저장소가 기기를 가르는 것과 같은 규칙
    });
    layer._accumStores.set(hours, store);
  }
  return store;
}

/**
 * 칩을 눌렀다 — descriptor · 눈금표 · 저장소를 **한꺼번에** 갈아 끼우고 지금 시각으로 다시 그린다.
 * 셰이더는 다시 만들지 않는다: 강수율도 누적도 로그로 실린 한 채널이라 같은 재질이 그대로 돈다(경계·팔레트만 바뀐다).
 */
export function applyAccumMode(layer, key) {
  if (!ACCUM_KEYS.includes(key)) return false;
  layer.baseDesc = layer.baseDesc || layer.desc;
  layer.baseFrames = layer.baseFrames || layer.frames;
  const hours = key === 'rate' ? 0 : Number(key);
  layer.desc = hours ? accumDescriptorOf(layer.baseDesc, hours) : layer.baseDesc;
  layer.frames = hours ? storeFor(layer, hours) : layer.baseFrames;
  // 다른 기간의 파생 장은 쥐고 있을 까닭이 없다 — 폰에서 색면 두 벌의 텍스처가 같이 남지 않게 비운다(다시 고르면 다시 굽는다).
  for (const [h, store] of (layer._accumStores || [])) if (h !== hours && store.dispose) store.dispose();
  layer.scale = scaleOf(layer.desc.scaleId);
  layer.key = null;                                           // 물려 있던 두 장은 다른 필드의 것이다
  layer.stats = null;
  layer.thin = null;
  layer.lastInner = null;
  layer.lastShape = null;
  if (layer.renderer) layer.renderer.setScale(layer.scale);
  if (layer.labels) layer.labels.clear();
  if (!layer.active) return true;
  const why = layer.unavailableReason();
  if (why) {
    layer.hideDrawing();
    layer.setStatus({ kind: 'nodata', reason: why });         // 누적 자료가 없으면 이유를 말한다 — 강수율로 되돌아가지 않는다
    return true;
  }
  // ⚠️ 그리기를 **먼저 멈춘다.** 위에서 눈금표(setScale → 경계·팔레트)와 아래의 applyFieldSpec(→ 디코드 상수)은 그 자리에서
  //    갈리는데, 물려 있는 텍스처는 아직 앞 모드의 것이다. 남겨 두면 파생 장이 구워질 때까지(폰 콜드 캐시에서 apcp 최대
  //    여섯 장, 0.5~2초) 셰이더가 **강수율 mm/h 바이트를 누적 mm 상수로 푼다** — 바이트 200 은 7.55 mm/h(노랑 칸)인데
  //    137 mm(맨 위 자홍 칸)로 읽혀 비 오는 곳이 통째로 두세 칸 위로 튄다. 3시간→24시간 전환도 같다(장은 3시간치인데
  //    카드는 이미 '24시간 누적'이라 적는다). 타임라인 이동과 달리 여기서는 '깜빡임 방지'가 근거가 되지 않는다 —
  //    남겨 둔 장이 지금 상수로는 **다른 물리량**이기 때문이다. 받는 중이라고 말하는 것이 틀린 값을 보여 주는 것보다 낫다.
  //    onTime() 의 성공 경로가 showDrawing() 을 부르므로 새 장이 오는 즉시 다시 선다.
  layer.hideDrawing();
  layer.applyFieldSpec();
  layer.onTime();
  return true;
}

/** 카드의 'field-accum' 단추. 이 레이어의 것이 아니면 거짓 — 부른 쪽이 제 길로 간다. */
export function accumAction(layer, ds = {}) {
  if (!layer || !layer.desc || !layer.desc.accum) return false;
  const key = String(ds.window || '');
  if (!ACCUM_KEYS.includes(key)) return false;
  const now = layer.desc.accumHours ? String(layer.desc.accumHours) : 'rate';
  if (key === now) return true;                               // 이미 그 칩이다 — 다시 굽지 않는다
  return applyAccumMode(layer, key);
}

// EARTHUS v2 — 해수면 상승 전망의 **숫자 원판** (2026-09-20 작업 E5)
//
// 무엇이 잘못돼 있었나: 'slr' 은 조위관측소 1,016곳을 **익명 원반**으로 찍었다. 색은 값을 말했지만 숫자가 없어
//   어느 것이 1.1 m 이고 어느 것이 0.4 m 인지 눌러 보기 전에는 알 수 없었고, 유럽·일본 연안에서는 원반이 서로 겹쳐
//   점 구름 한 덩어리가 됐다. PD: "저렇게 점으로 표기하면 되는거야? … 나라 도시 단위로 숫자 원판도 올리는게 맞을거 같은데?"
//
// 이 파일이 하는 일: 값을 **적은** 원판을 두 단계로 놓는다.
//   멀리서 → **나라 하나에 원판 하나.** 그 나라 관측소들의 중앙값을 적고 이름과 **관측소 수**를 붙인다.
//   가까이서 → 그 나라의 원판이 **관측소 하나하나로 갈라진다.** 이름은 관측소 이름이다.
//   겹치면 솎되, **솎은 수를 화면이 말한다**(범례 줄 · 카드 · 메뉴 한 줄 — 셋 다 flood-overlay.js 가 적는다).
//
// ── 나라 원판의 자리는 왜 '중심'이 아니라 **관측소 하나**인가 (⚠️ 이 규칙을 되돌리지 마라) ────────────────────
//   관측소들의 평균 자리(무게중심)를 쓰면 미국은 캔자스, 러시아는 시베리아 한복판, 호주는 사막 한가운데에
//   해수면 원판이 뜬다. PD 가 미리 막은 것이 바로 그것이다("몽골·중국 내륙에 해수면 원판이 뜨면 안 된다").
//   그래서 자리는 **메도이드**다: 평균 자리에 가장 가까운 **실제 관측소**. 원판은 언제나 조위관측소 위에 선다.
//   (시험이 잠근다 — 모든 나라 원판의 좌표가 그 나라 어느 관측소의 좌표와 정확히 같다.)
//
// ── 나라 셋 중 하나는 '나라 대표값'이라 부를 수 없다 (운영 자료 실측) ──────────────────────────────────────
//   ar6.json 1,016곳은 나라 113개에 나뉘는데 **관측소가 한 곳뿐인 나라가 40개**(35.4%)이고 두 곳 이하가 65개(57.5%)다.
//   나라별 관측소 수의 중앙값은 **2**. 그런 나라의 '중앙값'은 그 한 관측소의 값 그대로다.
//   → 원판의 이름줄이 늘 **관측소 수**를 같이 적고(`한국 · 23곳`), 한 곳뿐이면 **나라 이름 대신 관측소 이름**을 적는다
//     (`ZHAPO · 1곳`). 카드도 "나라 값이 아니라 관측소 한 곳의 값"이라고 말한다. 없는 대표성을 이름으로 지어내지 않는다.
//
// ── 갈라지는 기준 ─────────────────────────────────────────────────────────────────────────────────────────
//   그 나라가 **화면에서 차지하는 폭**(px)으로 정한다 = 각반경(radiusDeg · 자료에 매인 고정값) × 2 × 지금 화면의 눈금(px/°).
//   원판 하나가 약 34 px 이므로 원판 3.5개 폭(약 119 px)보다 넓게 퍼지면 갈라지고, 2.3개 폭(약 78 px)보다 좁아지면 다시 뭉친다.
//   두 문턱이 다른 것은 **되새김**(hysteresis)이다 — 하나면 그 경계에서 줌을 조금만 흔들어도 원판이 깜빡인다.
//   ⚠️ **보이는 관측소만으로 재면 안 된다**(실측으로 잡은 결함): 바짝 다가가 그 나라의 한 곳만 화면에 남으면 폭이 0 이 되어
//      나라 원판이 그대로 선다 — 화면 밖 관측소 115곳까지 대표한다고 말하는 꼴이다. 그래서 자료의 각반경을 쓴다.
//   ⚠️ 그래서 **지구 전체 뷰에서도 나라 단위가 아닌 나라가 있다**: 미국은 각반경 68.4°(대서양~알래스카~하와이)라
//      어떤 축척에서도 원판 하나에 들어가지 않는다. 한국 3.7° · 일본 14.8° 는 들어간다. 이것은 결함이 아니라 사실이다 —
//      미국 해안 전체를 값 하나로 적으면 그것이야말로 거짓말이다.
//
// 계산은 DOM · THREE 없는 순수 함수다(시험이 그대로 부른다). 그리기(SlrPlates)만 THREE 를 쓰고 캔버스는 주입받는다.

import * as THREE from '../../vendor/three-r184.module.min.js';

/* ── 크기 · 문턱 ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * 원판의 지름 — 화면 **높이에 대한 비율**이다(스프라이트 sizeAttenuation:false 의 단위 · field-labels.js FIELD_LABEL_SCALE 과 같은 규약).
 * 900 px 화면에서 약 34 px. 34 px 인 이유: 굵은 13 px 글자로 '−0.3' 네 글자가 들어가는 가장 작은 원이다
 * (그보다 작으면 숫자가 안 읽히고, 그보다 크면 연안 한 곳에 서너 개밖에 못 선다).
 */
export const SLR_PLATE_SCALE = 34 / 900;
/** 원판 지름(CSS px) — 화면 높이를 모를 때 쓰는 기준값. 실제로는 SLR_PLATE_SCALE × 화면 높이다. */
export const SLR_PLATE_PX = 34;
/**
 * 어두운 테 — 색 · 진하기 · 반지름에서 차지하는 비율. 밝은 칸(무채색 #f2f6f9)이 밝은 지구 위에서 사라지지 않게,
 * 그리고 원판끼리 맞닿아도 경계가 남게. **카드·범례의 작은 점도 이 색을 쓴다**(flood-overlay.js) —
 * 화면의 원판과 카드의 점이 다른 테를 갖지 않도록 한 곳에서만 정한다.
 */
export const SLR_PLATE_RIM = Object.freeze({ color: Object.freeze([0.031, 0.047, 0.071]), alpha: 0.92, frac: 0.1 });
/** 이름줄 높이(원판 지름에 대한 비율)와 글자 크기. */
export const SLR_PLATE_NAME = Object.freeze({ heightFrac: 0.44, fontPx: 11, maxChars: 16 });
/**
 * 솎는 간격 — 원판 지름의 1.18배. 지름과 같게 두면 두 원판이 가장자리에서 맞닿아 이름줄이 겹친다.
 * 이름줄은 원판보다 넓을 수 있으므로 여유가 필요하다.
 */
export const SLR_SEP_FRAC = 1.18;
/** 갈라짐·뭉침 문턱 — 원판 몇 개 폭인가(머리말 '갈라지는 기준'). 두 값이 달라야 경계에서 깜빡이지 않는다. */
export const SLR_LOD = Object.freeze({ splitPlates: 3.5, mergePlates: 2.3 });
/**
 * 한 화면에 세우는 원판 수의 상한. 데스크톱 40 · 폰 16.
 * 1440×900 에서 지구 원반은 약 800 px 이고 40 px 칸이 약 310칸인데, 그 1/8 을 넘으면 지구가 숫자로 덮여
 * **색이 말하는 큰 그림**(어디가 붉고 어디가 흰가)이 안 읽힌다. 폰(375 폭)은 칸이 1/2.5 이라 16 이다.
 */
export const SLR_PLATE_CAP = Object.freeze({ desktop: 40, phone: 16 });
/** 폰으로 치는 화면 폭(CSS px) — obs-labels.js 와 같은 경계. */
export const SLR_PHONE_W = 640;
/** 누를 때 원판 가장자리에서 더 봐주는 여유(CSS px) — 손가락. */
export const SLR_PLATE_SLOP_PX = 8;
/** 지평선 흐림이 이보다 옅으면 새로 세우지 않는다(이미 선 것은 0 까지 흐려지며 넘어간다). */
export const SLR_MIN_OPACITY = 0.35;
/** 글자 텍스처 보관 수의 상한 — 지구를 오래 돌리면 이름이 계속 늘어난다(관측소가 1,016곳이다). */
export const SLR_TEXTURE_CACHE = 160;

/* ── 순수 계산 ────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * 원판에 적는 글자 — 한 자리 소수. 음수 부호는 하이픈이 아니라 U+2212(−)다(obs-labels.js fmt1 과 같은 규약).
 * '−0.0' 은 '0.0' 으로 — 0 에 부호를 붙이면 '내려간다'는 뜻이 된다.
 */
export function plateText(v) {
  if (!Number.isFinite(v)) return '';
  let s = (Math.round(v * 10) / 10).toFixed(1);
  if (s === '-0.0') s = '0.0';
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/**
 * 나라 이름을 짧게 — 'Korea, Republic Of' → 'Korea'.
 * ⚠️ 줄이면 부딪히는 이름이 있다('Korea, Republic Of' 와 'Korea, Democratic People'S Republic Of' 가 둘 다 'Korea' 가 된다).
 *   그때는 **둘 다 원래 이름 그대로** 둔다 — 두 나라를 같은 이름으로 부르느니 긴 이름이 낫다.
 */
export function shortCountryNames(names) {
  const out = new Map();
  const count = new Map();
  for (const n of names) {
    const s = String(n).split(',')[0].trim() || String(n);
    count.set(s, (count.get(s) || 0) + 1);
  }
  for (const n of names) {
    const s = String(n).split(',')[0].trim() || String(n);
    out.set(n, count.get(s) > 1 ? String(n) : s);
  }
  return out;
}

/** 글자가 길면 잘라 말줄임 — 원판의 이름줄 폭을 묶어 둔다(텍스처가 끝없이 넓어지지 않게). */
export const clipName = (s, max = SLR_PLATE_NAME.maxChars) => {
  const t = String(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
};

/**
 * 관측소 목록 → 나라 묶음.  → [{ country, idx: [관측소 차례], medoid: 관측소 차례, lat, lon }]
 * 자리는 **메도이드**다(머리말) — 평균 자리에 가장 가까운 실제 관측소. 같은 거리면 앞선 차례.
 * stations 는 flood-overlay.floodStations 의 결과(단위벡터 x·y·z 를 들고 있다).
 */
export function countryGroups(stations = []) {
  const by = new Map();
  stations.forEach((s, i) => {
    const c = s.country || '';
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(i);
  });
  const out = [];
  for (const [country, idx] of by) {
    let mx = 0; let my = 0; let mz = 0;
    for (const i of idx) { mx += stations[i].x; my += stations[i].y; mz += stations[i].z; }
    const len = Math.hypot(mx, my, mz) || 1;
    mx /= len; my /= len; mz /= len;
    let medoid = idx[0];
    let best = -Infinity;
    for (const i of idx) {
      const d = stations[i].x * mx + stations[i].y * my + stations[i].z * mz;   // 내적이 클수록 가깝다
      if (d > best) { best = d; medoid = i; }
    }
      // 각반경 — 메도이드에서 가장 먼 관측소까지의 각거리(도). **자료에만 매인 수**라 한 번만 센다.
    // 갈라질지 정할 때 이 값에 화면 눈금(px/°)을 곱한다: 보이는 관측소만으로 재면 한 곳만 남았을 때 폭이 0 이 된다.
    let radiusDeg = 0;
    for (const i of idx) {
      const d = stations[i].x * stations[medoid].x + stations[i].y * stations[medoid].y + stations[i].z * stations[medoid].z;
      radiusDeg = Math.max(radiusDeg, (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI);
    }
    out.push({ country, idx, medoid, lat: stations[medoid].lat, lon: stations[medoid].lon, n: idx.length, radiusDeg });
  }
  // 차례는 자료 순서를 따른다(같은 자료면 같은 화면 — 시험이 되풀이할 수 있어야 한다).
  out.sort((a, b) => a.idx[0] - b.idx[0]);
  return out;
}

/** 값 배열에서 한 나라의 요약 — 중앙값 · 최소 · 최대. 관측소가 한 곳이면 셋이 같은 값이다(그 사실을 화면이 적는다). */
export function countrySummary(group, values) {
  const v = group.idx.map((i) => values[i]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const h = v.length >> 1;
  return { n: v.length, median: v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2, min: v[0], max: v[v.length - 1] };
}

/**
 * 나라를 갈라 놓을 것인가 — 되새김이 있는 두 문턱(머리말 '갈라지는 기준').
 *   was  지난번에 갈라져 있었나 · spanPx  그 나라 관측소들이 화면에서 차지하는 폭(px) · platePx  원판 지름(px)
 * 관측소가 한 곳뿐인 나라는 갈라질 것이 없다 — 늘 false 다.
 */
export function splitDecision(was, spanPx, n, platePx = SLR_PLATE_PX, lod = SLR_LOD) {
  if (!(n > 1)) return false;
  if (!Number.isFinite(spanPx)) return !!was;
  return was ? spanPx >= platePx * lod.mergePlates : spanPx > platePx * lod.splitPlates;
}

/**
 * 화면 좌표 목록의 폭 — 가장 멀리 떨어진 두 점의 거리에 가까운 값(경계상자의 대각선).
 * 실제 지름을 다 재려면 n² 이라, 원판 수를 정하는 데에는 경계상자로 충분하다(늘 실제 지름 이상이다 — 갈라지는 쪽으로 안전하다).
 */
export function spreadPx(pts) {
  if (!pts || pts.length < 2) return 0;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return Math.hypot(x1 - x0, y1 - y0);
}

/**
 * 겹치는 원판 솎기 — 앞의 것부터 받고, 이미 받은 것과 sepPx 안이면 버린다.
 *   cands  [{ x, y, … }] **우선순위 순**(부른 쪽이 정렬해서 준다) · → { shown, hidden }
 * hidden 은 '자리가 없어 못 세운 수'다 — 화면이 이 수를 말해야 한다(지시서: "솎은 것이 있으면 화면이 그 사실을 말해야 한다").
 */
export function thinPlates(cands = [], { sepPx = SLR_PLATE_PX * SLR_SEP_FRAC, cap = SLR_PLATE_CAP.desktop } = {}) {
  const shown = [];
  let hidden = 0;
  const s2 = sepPx * sepPx;
  for (const c of cands) {
    if (shown.length >= cap) { hidden += 1; continue; }
    let clash = false;
    for (const p of shown) {
      const dx = p.x - c.x; const dy = p.y - c.y;
      if (dx * dx + dy * dy < s2) { clash = true; break; }
    }
    if (clash) { hidden += 1; continue; }
    shown.push(c);
  }
  return { shown, hidden };
}

/**
 * 원판을 세우는 차례 — **한국 먼저**(시장 우선순위 · obs-labels.js 의 tier 규약과 같다), 그다음 |값| 이 큰 것부터.
 * |값| 인 이유: 가장 큰 상승(+4.15 m)과 **가장 크게 내려가는 곳**(−2.38 m · 보트니아만)이 같이 살아남아야 한다.
 * 값이 큰 쪽만 보면 이 레이어의 자랑인 '땅이 솟는 곳'이 영영 솎여 나간다.
 */
export const plateRank = (c) => (c.korea ? -1e6 : 0) - Math.abs(Number.isFinite(c.value) ? c.value : 0);

/**
 * 원판의 불투명도 — 지평선 위에서 1, 지평선에서 0, 지구 뒤편에서 0.
 * field-labels.js labelOpacity · live-layers.js newsChipOpacity 와 **같은 식**이다(시험이 두 벌의 값을 대조한다).
 * 저쪽을 import 하지 않는 것은 field-labels 가 프레임 해독기(gfs-frames)를 끌고 오기 때문이다 — 숫자 인자판만 쓴다.
 */
export function plateOpacity(px, py, pz, cx, cy, cz) {
  const pl = Math.hypot(px, py, pz);
  const cl = Math.hypot(cx, cy, cz);
  if (!pl || !cl) return 0;
  const horizon = pl / cl;
  if (horizon >= 1) return 0;
  const facing = (px * cx + py * cy + pz * cz) / (pl * cl);
  return Math.max(0, Math.min(1, (facing - horizon) / (1 - horizon) / 0.18));
}

/** #rrggbb → CIELAB 의 L*(0 = 검정 · 100 = 흰색). 명도차는 여기서 잰다 — 사람 눈이 느끼는 밝기가 이것이다. */
export function lStarOf(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const Y = 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
}
/** 원판 안 숫자에 쓰는 두 색. 검은 쪽은 테와 같은 어둠이다(#0f1720 ≈ L* 8). */
export const PLATE_INK = Object.freeze({ dark: '#0f1720', light: '#ffffff' });
/**
 * 원판 안 숫자의 색 — **두 색 가운데 명도차가 큰 쪽**을 고른다. 문턱을 손으로 적지 않는다:
 * 두 잉크의 L* 한가운데를 넘으면 검은 글자, 아니면 흰 글자다(팔레트를 고쳐도 저절로 따라온다).
 * ⚠️ 이 레이어에서 가장 밝은 칸이 하필 **뜻이 반대인 음수 칸**(#f2f6f9)이다 — 거기서 숫자가 안 보이면
 *   '땅이 솟는 곳'을 못 읽는다. 청록 칸(#19b2d8 · L* 67)도 흰 글자로는 명도차가 33 뿐이라 검은 글자로 간다.
 */
export const plateInkFor = (hex) => (lStarOf(hex) > (lStarOf(PLATE_INK.dark) + lStarOf(PLATE_INK.light)) / 2
  ? PLATE_INK.dark : PLATE_INK.light);

/* ── 그리기 ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * 원판 한 장을 캔버스에 굽는다 — 색 원 + 어두운 테 + 가운데 숫자 + 아래 이름줄.
 * 시험은 이 함수를 쓰지 않는다(캔버스가 없다) — SlrPlates 에 makeTexture 를 넣어 가짜를 쓴다.
 */
export const plateTexture = ({ text, name, color, ink }) => {
  const S = 2;                                   // 레티나에서 또렷하게
  const D = SLR_PLATE_PX * S;
  const nameH = name ? Math.round(SLR_PLATE_PX * SLR_PLATE_NAME.heightFrac) * S : 0;
  const font = `800 ${13 * S}px "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif`;
  const nameFont = `700 ${SLR_PLATE_NAME.fontPx * S}px "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = nameFont;
  const nameW = name ? probe.measureText(name).width + 8 * S : 0;
  const c = document.createElement('canvas');
  c.width = Math.max(D, Math.ceil(nameW)) + 2 * S;
  c.height = D + nameH + 2 * S;
  const x = c.getContext('2d');
  const cx = c.width / 2;
  const cy = D / 2 + S;
  // 테를 먼저 크게, 그 위에 색 원 — 겹친 원판 사이에 늘 어두운 선이 남는다.
  const rim = `rgba(${SLR_PLATE_RIM.color.map((v) => Math.round(v * 255)).join(',')},${SLR_PLATE_RIM.alpha})`;
  x.beginPath(); x.arc(cx, cy, D / 2, 0, Math.PI * 2);
  x.fillStyle = rim; x.fill();
  x.beginPath(); x.arc(cx, cy, (D / 2) * (1 - SLR_PLATE_RIM.frac), 0, Math.PI * 2);
  x.fillStyle = color; x.fill();
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = ink;
  x.fillText(text, cx, cy + S * 0.5);
  if (name) {
    x.font = nameFont;
    x.lineJoin = 'round'; x.lineWidth = 3 * S;
    x.strokeStyle = 'rgba(8,12,18,0.9)';
    x.strokeText(name, cx, D + nameH / 2 + S * 0.5);
    x.fillStyle = '#eef4fa';
    x.fillText(name, cx, D + nameH / 2 + S * 0.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, w: c.width, h: c.height };
};

/**
 * new SlrPlates({ makeTexture, renderOrder, lift })
 *   setPlates([{ key, lat, lon, text, name, color, ink }])  — 자리·글자를 갈아 끼운다(스프라이트는 돌려쓴다)
 *   tick(camera)                                            — 지평선 흐림. 객체를 만들지 않는다.
 * 텍스처는 key 가 아니라 **보이는 모양**(글자·이름·색)으로 보관한다 — 같은 모양이면 한 장이다.
 */
export class SlrPlates {
  constructor({ makeTexture = plateTexture, renderOrder = 7, lift = 0, cacheMax = SLR_TEXTURE_CACHE } = {}) {
    this.group = new THREE.Group();
    this.makeTexture = makeTexture;
    this.renderOrder = renderOrder;
    this.lift = lift;
    this.cacheMax = cacheMax;
    this.textures = new Map();          // 모양 → { tex, w, h } (Map 은 넣은 차례를 지킨다 — 가장 오래된 것부터 버린다)
    this.pool = [];
    this.count = 0;
    this.plates = [];
    this.unit = new Float32Array(0);
  }

  get object() { return this.group; }

  /** 지금 서 있는 원판의 모양들(콘솔·시험용) — 글자 · 이름 · 색 · 숫자색. 화면에 실제로 나간 것 그대로다. */
  lastShapes() { return this.plates; }

  textureFor(shape) {
    const k = `${shape.text}|${shape.name || ''}|${shape.color}|${shape.ink}`;
    let e = this.textures.get(k);
    if (e) { this.textures.delete(k); this.textures.set(k, e); return e; }   // 다시 넣어 '최근'으로
    e = this.makeTexture(shape);
    this.textures.set(k, e);
    while (this.textures.size > this.cacheMax) {
      const oldest = this.textures.keys().next().value;
      const drop = this.textures.get(oldest);
      this.textures.delete(oldest);
      if (drop && drop.tex && drop.tex.dispose) drop.tex.dispose();
    }
    return e;
  }

  setPlates(list = []) {
    const n = list.length;
    if (this.unit.length < n * 3) this.unit = new Float32Array(n * 3);
    while (this.pool.length < n) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0,
      }));
      spr.renderOrder = this.renderOrder;
      spr.frustumCulled = false;         // 화면 고정 크기라 경계상자로 자를 수 없다
      spr.visible = false;
      this.group.add(spr);
      this.pool.push(spr);
    }
    const D2R = Math.PI / 180;
    for (let i = 0; i < n; i += 1) {
      const p = list[i];
      const la = p.lat * D2R; const lo = p.lon * D2R; const cl = Math.cos(la);
      const r = 1 + this.lift;
      const ux = cl * Math.sin(lo); const uy = Math.sin(la); const uz = cl * Math.cos(lo);
      this.unit[i * 3] = ux; this.unit[i * 3 + 1] = uy; this.unit[i * 3 + 2] = uz;
      const t = this.textureFor(p);
      const spr = this.pool[i];
      spr.material.map = t.tex;
      spr.material.needsUpdate = true;
      spr.material.opacity = 0;          // 첫 tick 이 정한다 — 그 전에 뒤편 것이 비치지 않게
      // 세로 크기는 텍스처 높이에 비례한다: 원판 지름이 늘 SLR_PLATE_SCALE 이도록 이름줄 몫을 곱해 준다.
      const h = (t.h / (SLR_PLATE_PX * 2)) * SLR_PLATE_SCALE;
      spr.scale.set((t.w / t.h) * h, h, 1);
      spr.position.set(ux * r, uy * r, uz * r);
      spr.userData.plate = p;
      spr.visible = true;
    }
    for (let i = n; i < this.pool.length; i += 1) { this.pool[i].visible = false; this.pool[i].material.opacity = 0; }
    this.count = n;
    this.plates = list;
  }

  tick(camera) {
    if (!camera) return 0;
    const m = camera.matrixWorld.elements;
    const cx = m[12]; const cy = m[13]; const cz = m[14];
    let shown = 0;
    for (let i = 0; i < this.count; i += 1) {
      const p = this.pool[i].position;
      const a = plateOpacity(p.x, p.y, p.z, cx, cy, cz);
      if (a > 0) shown += 1;
      this.pool[i].material.opacity = a;
    }
    return shown;
  }

  clear() {
    for (const spr of this.pool) { spr.visible = false; spr.material.opacity = 0; }
    this.count = 0;
    this.plates = [];
  }

  dispose() {
    this.clear();
    for (const spr of this.pool) { this.group.remove(spr); spr.material.dispose(); }
    this.pool.length = 0;
    for (const e of this.textures.values()) if (e && e.tex && e.tex.dispose) e.tex.dispose();
    this.textures.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

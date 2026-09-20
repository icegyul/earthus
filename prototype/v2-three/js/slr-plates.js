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
/**
 * 이름줄 높이(원판 지름에 대한 비율)와 글자 크기. `padPx` 는 이름 글자 좌우에 남기는 빈 자리(원판 34 px 기준) —
 * 굽는 캔버스의 폭과 솎기 상자의 폭이 **이 한 수를 같이 쓴다**. 이웃한 두 이름표 사이에 늘 이만큼이 빈다.
 */
export const SLR_PLATE_NAME = Object.freeze({ heightFrac: 0.44, fontPx: 11, maxChars: 16, padPx: 8 });
/**
 * 원판만 놓고 볼 때의 최소 간격 — 지름의 1.18배. 지름과 같게 두면 두 원판이 가장자리에서 맞닿는다.
 * ⚠️ 2026-09-21 — 예전에는 이 하나가 **이름표 몫까지** 맡았다("이름줄은 원판보다 넓을 수 있으므로 여유가 필요하다").
 *    폰 폭에서 실측하니 그 여유가 턱없이 모자랐다: 원판 30.7 px 에 간격 36 px 인데 `HANASAKI II` 이름표는 75 px 이라,
 *    36 px 떨어진 두 원판이 시험을 통과하고도 화면에서는 이름을 서로 덮었다(PD 실측 ①). 이제 이름표 폭은
 *    `plateBoxPx` 가 **재서** 쓰고, 이 값은 이름이 원판보다 좁을 때의 바닥으로만 남는다.
 */
export const SLR_SEP_FRAC = 1.18;
/** 갈라짐·뭉침 문턱 — 원판 몇 개 폭인가(머리말 '갈라지는 기준'). 두 값이 달라야 경계에서 깜빡이지 않는다. */
export const SLR_LOD = Object.freeze({ splitPlates: 3.5, mergePlates: 2.3 });
/**
 * 한 화면에 세우는 원판 수의 상한. 데스크톱 40 · 폰 16.
 * 1440×900 에서 지구 원반은 약 800 px 이고 40 px 칸이 약 310칸인데, 그 1/8 을 넘으면 지구가 숫자로 덮여
 * **색이 말하는 큰 그림**(어디가 붉고 어디가 흰가)이 안 읽힌다. 폰(375 폭)은 칸이 1/2.5 이라 16 이다.
 * ⚠️ 2026-09-21 — 이 두 수는 이제 `plateCapOf` 의 **바닥과 천장**이다. 아래 주석을 읽어라.
 */
export const SLR_PLATE_CAP = Object.freeze({ desktop: 40, phone: 16 });
/**
 * 원판이 화면에서 차지해도 되는 몫 — 화면을 원판 상자로 나눈 칸의 **1/8**.
 * 데스크톱 상한 40 이 나온 계산과 같은 몫이다(머리말) — 이제 지구 원반이 아니라 **화면**을 나눈다.
 * 지구 원반으로 나누는 셈은 바짝 다가가 지구가 화면을 가득 채울 때 틀린다(원반이 화면보다 커진다).
 */
export const SLR_CAP_FRAC = 1 / 8;

/**
 * 이 화면이 견디는 원판 수 — 화면(viewW×viewH)을 원판 상자(platePx × SLR_SEP_FRAC 사방)로 나눈 칸의 SLR_CAP_FRAC.
 * 데스크톱 상한을 천장으로, 폰 상한을 바닥으로 삼는다: 어떤 화면에서도 16 장은 세우고 40 장을 넘지 않는다.
 * ⚠️ 2026-09-21 폰 실측 ②: 예전에는 화면 폭만 보고 16 · 40 둘 중 하나를 썼다. 폰에서 훑어 본 판 10,200개 가운데
 *    9,360개(91.8%)가 상한에 걸려 **늘 정확히 16장**이었다 — 솎기가 센 것이 아니라 상한이 늘 먼저 닿았다.
 *    375×812 에서 원판은 30.7 px 이고 상자는 36.2 px 이라 칸이 10×22 = 220개, 그 1/8 은 27 이다.
 *    폭만 보면 이 세로 812 를 못 본다 — 폰은 세로로 길다.
 */
export const plateCapOf = (viewW, viewH, platePx = SLR_PLATE_PX) => {
  const box = Math.max(1, platePx * SLR_SEP_FRAC);
  const cells = Math.floor(Math.max(0, viewW) / box) * Math.floor(Math.max(0, viewH) / box);
  const n = Math.floor(cells * SLR_CAP_FRAC);
  return Math.max(SLR_PLATE_CAP.phone, Math.min(SLR_PLATE_CAP.desktop, n));
};
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

/** 줄였더니 부딪혀 **원래 이름을 그대로 쓰는** 나라인가. 그런 이름은 더 길게 허락한다(SLR_LONG_MAXCHARS). */
export const isCollidedName = (full, short) => String(full) === String(short);

/**
 * 부딪힌 이름에 주는 글자 수. 기본 16 자로 자르면 `Korea, Republic Of`(18자)가
 * **`Korea, Republic…`** 이 돼 한국 사용자가 제 나라 이름을 잘린 채로 본다(2026-09-21 폰 실측).
 * 부딪히는 나라는 운영 자료 113곳 가운데 **둘뿐**이다(남·북한) — 그 둘만 넉넉히 준다.
 * 이름표가 넓어지는 만큼은 `plateBoxPx` 가 재서 솎기에 반영하므로 겹치지 않는다.
 */
export const SLR_LONG_MAXCHARS = 24;

/** 글자가 길면 잘라 말줄임 — 원판의 이름줄 폭을 묶어 둔다(텍스처가 끝없이 넓어지지 않게). */
export const clipName = (s, max = SLR_PLATE_NAME.maxChars) => {
  const t = String(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
};

/** 이름줄에 쓰는 글꼴 — 굽는 쪽(plateTexture)과 재는 쪽(plateNameWidth)이 **한 글자열**을 나눠 쓴다. */
export const SLR_NAME_FONT = (px) => `700 ${px}px "Noto Sans KR", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif`;

/**
 * 글꼴이 없을 때의 글자 폭 어림(em 단위) — node 시험처럼 캔버스가 없는 곳에서 쓴다.
 * 한글·한자는 전각 1.0, 라틴 대문자·숫자는 0.62… 로 나눈다. 재 본 값보다 **넓게** 잡는 쪽으로 기울여 두었다:
 * 좁게 잡으면 겹치지 않는다고 믿고 겹치게 세운다(그것이 ① 의 결함이었다).
 */
const emOf = (ch) => {
  const c = ch.codePointAt(0);
  if (c >= 0x1100 && c <= 0x11ff) return 1;                       // 한글 자모
  if (c >= 0x2e80 && c <= 0xa4cf) return 1;                       // 한중일 한자 · 가나
  if (c >= 0xac00 && c <= 0xd7a3) return 1;                       // 한글 음절
  if (c >= 0xff01 && c <= 0xff60) return 1;                       // 전각 기호
  if (ch === ' ') return 0.28;
  if (ch === '.' || ch === ',' || ch === "'" || ch === ':') return 0.3;
  if (ch === '·' || ch === '-' || ch === '(' || ch === ')') return 0.42;
  if (ch === '…' || ch === '—') return 1;
  if (c >= 0x61 && c <= 0x7a) return 0.58;                        // 라틴 소문자
  return 0.62;                                                    // 라틴 대문자 · 숫자 · 나머지
};
const estimateNameWidth = (s, px) => { let w = 0; for (const ch of s) w += emOf(ch); return w * px; };

/**
 * 재 본 폭을 이름마다 한 번만 — 원판은 1초에 여러 번 다시 솎이고 이름은 1,016개뿐이다.
 * ⚠️ 글꼴이 늦게 서면 처음 잰 폭이 틀린 채로 굳는다(그러면 솎기 상자가 틀려 ① 이 되돌아온다).
 *    이 앱에 @font-face 는 없고 글꼴은 기기에 있는 것을 쓰지만, 그래도 글꼴이 다 선 뒤 한 번 비운다 — 값싼 보험이다.
 */
const nameWidths = new Map();
let nameProbe;
const nameProbeCtx = () => {
  if (nameProbe !== undefined) return nameProbe;
  nameProbe = null;
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) { ctx.font = SLR_NAME_FONT(SLR_PLATE_NAME.fontPx); nameProbe = ctx; }
      if (nameProbe && document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(() => nameWidths.clear()).catch(() => {});
      }
    }
  } catch { nameProbe = null; }
  return nameProbe;
};

/**
 * 이름줄 글자의 폭(원판 지름 34 px 기준의 CSS px). 캔버스가 있으면 **실제로 재고**, 없으면 위의 어림을 쓴다.
 * ⚠️ 이 한 함수를 **굽는 쪽과 솎는 쪽이 같이 부른다.** 두 벌이 되면 화면은 이만큼 넓게 그리고 솎기는 저만큼으로 재서,
 *    "안 겹친다"고 셈해 놓고 겹치게 세운다 — 그것이 2026-09-21 폰 실측 ① 의 뿌리였다.
 */
export function plateNameWidth(name) {
  const s = String(name ?? '');
  if (!s) return 0;
  const hit = nameWidths.get(s);
  if (hit !== undefined) return hit;
  const ctx = nameProbeCtx();
  let w;
  try { w = ctx ? ctx.measureText(s).width : estimateNameWidth(s, SLR_PLATE_NAME.fontPx); }
  catch { w = estimateNameWidth(s, SLR_PLATE_NAME.fontPx); }
  if (!Number.isFinite(w) || w <= 0) w = estimateNameWidth(s, SLR_PLATE_NAME.fontPx);
  nameWidths.set(s, w);
  return w;
}

/**
 * 화면에 그려지는 원판 한 장의 **상자**(CSS px) — 원판 + 이름줄. platePx 는 지금 화면의 원판 지름이다.
 * 폭은 원판과 이름표 가운데 넓은 쪽이고, 높이는 원판 + 이름줄이다. 솎기는 이 상자로 한다(원이 아니라).
 * 이름이 없으면 이름줄 몫이 빠진다 — 굽는 쪽(plateTexture)의 nameH 와 같은 가름이다.
 */
export function plateBoxPx(name, platePx = SLR_PLATE_PX) {
  const k = platePx / SLR_PLATE_PX;
  const s = String(name ?? '');
  const label = s ? plateNameWidth(s) + SLR_PLATE_NAME.padPx : 0;
  return {
    w: Math.max(SLR_PLATE_PX * SLR_SEP_FRAC, label) * k,
    h: SLR_PLATE_PX * (1 + (s ? SLR_PLATE_NAME.heightFrac : 0)) * k,
  };
}

/**
 * 원판의 자리(스프라이트 한가운데)에서 **동그라미 한가운데까지의 세로 어긋남**(CSS px · 화면 y 가 커지는 쪽이 +).
 * 텍스처는 위가 동그라미 · 아래가 이름줄인데 스프라이트는 그 전체를 가운데로 잡는다 — 동그라미는 이름줄 몫의 절반만큼 위에 있다.
 */
export const plateDiscOffsetPx = (platePx = SLR_PLATE_PX) => -(platePx * SLR_PLATE_NAME.heightFrac) / 2;

/**
 * 이 자리에 선 원판의 **숫자가 화면 안에 온전히 들어오나.** 이름표는 가장자리에서 잘려도 되지만
 * 값은 잘리면 안 된다 — 이 레이어에서 읽어야 하는 것은 값이다.
 * ⚠️ 2026-09-21 폰 실측 ②: 예전에는 지평선만 봤다. 그래서 375×812 화면에서 x=1785 · y=2011 처럼
 *    **화면 밖으로 투영된 후보**가 차례를 앞질러 상한을 다 먹고, 정작 화면 한가운데 한국 연안이 솎여 나갔다.
 */
export const plateOnScreen = (x, y, viewW, viewH, platePx = SLR_PLATE_PX, inset = null) => {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(viewW > 0) || !(viewH > 0)) return false;
  const r = platePx / 2;
  const dy = y + plateDiscOffsetPx(platePx);
  const i = inset || SLR_NO_INSET;
  return x >= r + i.left && x <= viewW - r - i.right
    && dy >= r + i.top && dy <= viewH - r - i.bottom;
};

/** 여백 없음 — 인수를 안 주면 이것이다(예전과 같은 동작). */
export const SLR_NO_INSET = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * 화면 네 변에서 **원판을 세우면 안 되는 띠**. 그 위에 화면 부품이 떠 있기 때문이다.
 * ⚠️ 2026-09-21 폰 실측 — 원판을 서로 안 겹치게 고치고 나니 이번에는 **화면 부품 뒤**로 들어갔다.
 *    375×812 에서 부품이 먹는 자리: 상단 막대 y 56~102 · 범례 108~197 · 하단 알약 600~654 ·
 *    출처 독 667~746 · 타임라인 762~802. 남는 띠는 y 202~596 뿐인데 솎기는 그것을 몰랐다.
 *    그래서 값이 UI 뒤에 숨거나 가장자리에서 잘렸다 — 읽으라고 그린 숫자를 읽을 수 없었다.
 * 부품의 실제 상자를 재서 넘긴다(수를 여기 박지 않는다 — 부품이 바뀌면 같이 움직여야 한다).
 */
export function plateInsetOf(boxes, viewW, viewH) {
  const out = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!(viewW > 0) || !(viewH > 0)) return out;
  for (const b of boxes || []) {
    if (!b || !(b.w > 0) || !(b.h > 0)) continue;
    // 화면을 가로로 가로지르는 부품(범례·타임라인)은 위/아래 띠로, 세로로 긴 것은 좌/우 띠로 친다.
    const wide = b.w >= viewW * 0.5;
    if (wide) {
      if (b.y + b.h / 2 < viewH / 2) out.top = Math.max(out.top, b.y + b.h);
      else out.bottom = Math.max(out.bottom, viewH - b.y);
    } else if (b.x + b.w / 2 < viewW / 2) out.left = Math.max(out.left, b.x + b.w);
    else out.right = Math.max(out.right, viewW - b.x);
  }
  // 화면의 절반을 넘게 먹으면 아무것도 못 세운다 — 그때는 여백을 포기하고 겹침을 받아들인다.
  if (out.top + out.bottom > viewH * 0.6) { out.top = 0; out.bottom = 0; }
  if (out.left + out.right > viewW * 0.6) { out.left = 0; out.right = 0; }
  return out;
}

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
 * 겹치는 원판 솎기 — 앞의 것부터 받고, 이미 받은 것과 **그려질 상자가 겹치면** 버린다.
 *   cands  [{ x, y, w?, h?, … }] **우선순위 순**(부른 쪽이 정렬해서 준다)
 *   → { shown, clashed, capped, hidden }   hidden = clashed + capped
 * 상자(w·h)를 들고 오면 네모끼리 겹침을 보고, 없으면 예전처럼 sepPx 원으로 본다(순수 시험이 그 길을 쓴다).
 * ⚠️ **겹친 것과 상한에 걸린 것을 따로 센다.** 화면은 "겹쳐 N곳 솎음"이라 적는데, 예전에는 상한에 잘린 수까지
 *    그 N 에 넣었다 — 폰에서는 그 둘 중 상한 쪽이 거의 전부였으므로(실측 ②) 화면이 하던 말이 사실이 아니었다.
 */
export function thinPlates(cands = [], { sepPx = SLR_PLATE_PX * SLR_SEP_FRAC, cap = SLR_PLATE_CAP.desktop } = {}) {
  const shown = [];
  let clashed = 0;
  let capped = 0;
  const s2 = sepPx * sepPx;
  for (const c of cands) {
    let clash = false;
    for (const p of shown) {
      const dx = Math.abs(p.x - c.x); const dy = Math.abs(p.y - c.y);
      if (p.w > 0 && c.w > 0) {
        if (dx < (p.w + c.w) / 2 && dy < (p.h + c.h) / 2) { clash = true; break; }
      } else if (dx * dx + dy * dy < s2) { clash = true; break; }
    }
    // 겹침을 먼저 본다 — 상한을 먼저 보면 뒤쪽 후보가 전부 '상한'으로 세어져, 겹쳐서 못 선 수를 알 수 없다.
    if (clash) { clashed += 1; continue; }
    if (shown.length >= cap) { capped += 1; continue; }
    shown.push(c);
  }
  return { shown, clashed, capped, hidden: clashed + capped };
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
  const nameFont = SLR_NAME_FONT(SLR_PLATE_NAME.fontPx * S);
  // ⚠️ 폭은 **솎기가 쓰는 그 함수**로 잰다(plateNameWidth). 여기서 따로 재면 그리는 폭과 솎는 폭이 갈라진다.
  const nameW = name ? (plateNameWidth(name) + SLR_PLATE_NAME.padPx) * S : 0;
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

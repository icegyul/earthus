// EARTHUS v2 — 로그로 실린 자료를 색면·범례·클릭 값으로 옮기는 한 장 (DEV-DIRECTIVE 2026-09-20 · W4 강수 · 작업 D2)
//
// 무엇이 잘못돼 있었나: 색면 부품(field-renderer · field-layer)은 **선형 디코드만** 알았다(`byte × scale + offset`).
// 그런데 운영 매니페스트가 값으로 싣는 필드 넷 가운데 둘(강수율 precip · 누적강수 apcp)과 구름 수액은 log10 로 실려 있다 —
// 강수율은 0.05 ~ 30 mm/h 를 255칸에 담느라 한 바이트가 값의 **×1.0126** 이다. 선형 상수(scale·offset)가 아예 없으므로
// 옛 길로 가면 `undefined` 가 uniform 에 들어가 색면이 통째로 NaN 이 되고, 클릭 값은 `scale.toPrecision` 에서 던진다.
//
// 이 파일이 하는 일 — 로그 자료에서만 다른 네 가지를 **한 곳에** 둔다(로직을 공용 파일에 흩지 않는다):
//   ① 셰이더 디코드 식의 JS 사본(shaderLogDecode) — 시험이 gfs-frames.decodeByte 와 바이트 256칸 전부를 대조한다.
//   ② 클릭 값의 눈금(readTicks) — 로그에는 **상수 눈금이 없다.** 선형처럼 반올림하지 않는다.
//   ③ 클릭 값의 글자(logValueText · logReadout) — 유효숫자 2자리. 0 은 '비 없음'.
//   ④ 자료가 눈금표의 맨 위 칸을 못 채울 때의 한 줄(topBandNote).
// 디코드 상수(logLo · logSpan · zeroByte · min · max)는 **여기 숫자로 적지 않는다** — 운영 매니페스트 fields{} 가 정본이다
// (aws/gfs-cloud-forecast/handler.py field_specs). 받은 채널에서 셈한다.
//
// ── ⚠️ '읽히는 값(+반 눈금)' 규칙을 로그에는 쓰지 않는다 — 지시와 다른 점이라 크게 적는다 ─────────────────────
//   선형 색면은 구간과 등치선을 보간값 v 가 아니라 v + 반 눈금(기온 0.25°C)으로 정한다(field-renderer.js 머리말).
//   그 규칙이 필요한 이유는 **경계가 자료의 눈금 위에 놓여 있어서**다: 기온 경계 30.0°C 는 바이트 220 의 값 그대로라
//   30.0 고원이 통째로 한 칸에 걸리고 색 경계가 0.5° 칸의 모서리를 따라 계단으로 꺾인다.
//   강수율은 사정이 다르다:
//     · 눈금이 값마다 다르다. 바이트 한 칸은 아래쪽에서 0.0006 mm/h, 위쪽에서 0.37 mm/h 다(비율로는 늘 ×1.0126) —
//       '반 눈금'은 더하기가 아니라 **곱하기**가 되고, 더하든 곱하든 한 상수로 말할 수 없다.
//     · 더 중요한 것: 구간 경계(0.1 · 0.5 · 1 · 2 · 5 · 10 · 20 · 50 mm/h)가 **바이트 값이 아니다.** 가장 가까운 것이
//       2 mm/h 인데 그마저 바이트 147(1.99889 mm/h)보다 0.06 % 위다. 어느 경계도 고원 위에 놓이지 않으므로
//       경계선은 이미 두 고원 사이의 **경사면 한가운데**를 지난다 — 떼어 놓을 계단이 없다.
//   그래서 로그 자료의 반 눈금은 **0** 이다(field-renderer.js halfStepOf 가 그렇게 돌려준다). 그 대가로 얻는 것이 크다:
//   칠해진 칸 = frames.sampleAt 이 돌려준 **그 값**의 칸이다(더하거나 뺀 값이 아니다 — 시험이 256 바이트 전부에서 본다).
//
// ── 클릭 값은 왜 유효숫자 2자리인가 ─────────────────────────────────────────────────────────────────────────
//   선형 자료는 '자료의 눈금으로 반올림한 값'을 말한다(기온 ~30.0 °C). 로그에는 그 눈금이 없으니 눈금표의 자릿수
//   (강수 소수 1자리)로 적을 법한데, 그러면 **아래쪽에서 거짓말이 된다**: 0.051 mm/h 를 '0.1 mm/h' 라고 적게 되고
//   그 값은 칠하지도 않는 칸이다(범례는 0.1 에서 시작한다). 로그 자료는 자릿수가 아니라 **유효숫자**로 읽어야 한다 —
//   0.051 · 0.44 · 2.4 · 24 mm/h. 색 점(bandColor)은 반올림하지 않은 값에서 뽑으므로 늘 칠해진 칸과 같다.
//
// ── 글자와 색 점은 **같은 칸**을 가리켜야 한다 (2026-09-20 반박 검증) ──────────────────────────────────────
//   전에는 여기 '남는 흠 하나' 라고만 적혀 있었다: 경계 바로 아래 값은 글자가 경계 숫자로 올라가면서 아래 칸의
//   색 점을 단다. 실제 출력은 적어 둔 것보다 나빴다 — 1.996 은 '~2.0' 이 아니라 소수 0 이 깎여 '~2 mm/h' 가 되고,
//   2.0 의 글자와 **글자 하나까지 같다.** 같은 글자가 서로 다른 색 점을 달면 '~' 로는 변명이 안 된다.
//   고친 길은 **값 우선**이다(글자 우선이 아니다): 색 점은 그대로 raw 의 칸(= 화면에 칠해진 칸)에서 뽑고,
//   글자는 유효숫자 2자리로 시작하되 그 글자의 수가 **다른 칸**에 떨어지면 한 자리씩 늘린다(logReadSig).
//   1.996 → '~1.996 mm/h'. 글자가 길어지는 것은 경계에서 0.3 % 안쪽인 값뿐이고, 그 대가로 카드가 화면과
//   같은 말을 한다 — PD 가 두 번 잡아낸 것이 '카드가 화면과 다른 말' 이다.
//   ⚠️ 글자 우선(반올림한 수로 색 점을 뽑기)은 고르지 않았다. 그러면 색 점이 손가락 밑에 칠해진 칸을 떠난다.
//
// 이 파일은 DOM · THREE · 네트워크를 모른다(순수 함수). 시험은 tools/earthus-v53/field-log.test.mjs.

import { bandColor, bandIndex } from './field-scales.js?v=1';

// GLSL 에는 log10 이 없다 — exp2(x × LOG2_10) 으로 10^x 를 셈한다. 셰이더(field-renderer.js FIELD_FRAG)에 적힌 글자와
// **같은 수**여야 한다(시험이 셰이더 소스에서 이 숫자를 찾는다). Math.log2(10) 과 같은 배정도 값이다.
export const FIELD_LOG2_10 = 3.321928094887362;

// 유효숫자 2자리로 적되 소수는 이 자리까지만(구름 수액 0.005 kg/m² 가 여기 닿는다).
export const LOG_TEXT_MAX_DIGITS = 3;

// 클릭 값의 글자가 제 칸에 남으려고 자리를 늘릴 때의 상한.
//   SIG    8bit 한 칸이 값의 ×1.0126(0.26 %)이라 유효숫자 5자리면 자료가 말할 수 있는 것을 이미 다 쓴 것이다.
//   DIGITS 늘리는 길에서는 소수 자릿수 상한(LOG_TEXT_MAX_DIGITS)을 풀어야 한다 — 경계 0.5 의 0.08 % 아래인
//          0.4996 mm/h 는 소수 세 자리로는 '0.500'(= 0.5)이 되어 아무리 유효숫자를 늘려도 제 칸에 못 남는다.
export const LOG_READ_MAX_SIG = 5;
const LOG_READ_MAX_DIGITS = 12;

/** 유효숫자 sig 자리로 적을 때의 소수 자릿수. 글자(logValueText)와 수(logValueNumber)가 **같은 자리**를 쓰게 한 곳에 둔다. */
const decimalsOf = (a, sig, maxDigits) => Math.max(0, Math.min(maxDigits, sig - 1 - Math.floor(Math.log10(a))));

const MINUS = '−';   // 하이픈이 아니라 빼기 기호 — field-scales.js 와 같은 규칙(tabular-nums 에서 줄이 맞는다)

/**
 * 매니페스트의 log10 채널 → 셰이더 uniform 이 쥐는 수 셋.
 *   span = logSpan / 255 (바이트 한 칸의 로그 폭) · lo = logLo · zeroByte = '없음'을 뜻하는 바이트
 * 셰이더는 값 = 10^(byte × span + lo) 로 푼다(handler.py field_specs 의 식 그대로).
 */
export const logUniforms = (ch) => ({
  span: Number(ch.logSpan) / 255,
  lo: Number(ch.logLo),
  zeroByte: Number.isFinite(ch.zeroByte) ? ch.zeroByte : 0,
});

/**
 * 셰이더의 tapValue 를 JS 로 옮긴 것 — **같은 식**이어야 한다. gfs-frames.decodeByte 와 같은 값을 내는지 시험이 본다
 * (한쪽만 고치면 화면의 색과 클릭 값이 갈린다). 바이트는 정수로 되돌린 것이라 0.5 문턱 비교가 정확하다.
 */
export const shaderLogDecode = (u, byte) => (Math.abs(byte - u.zeroByte) < 0.5
  ? 0
  : 2 ** ((byte * u.span + u.lo) * FIELD_LOG2_10));

/**
 * 클릭 값이 쓰는 눈금 표시. 선형은 상수 눈금(기온 0.5 · 기압 1)을, 로그는 눈금 대신 **칠하기 시작하는 바닥**(매니페스트 min)을 준다.
 *   → { step } | { floor }   — floor 가 있으면 읽는 쪽(field-layer.readoutOf)이 로그 길로 간다.
 * 선형 쪽은 옛 식(Number(scale.toPrecision(1)))을 그대로 옮긴 것이다: 0.50196 → 0.5 · 1 → 1.
 */
export const readTicks = (ch) => {
  if (!ch) return {};
  if (ch.transfer === 'log10') return { floor: Number.isFinite(ch.min) ? Number(ch.min) : 0 };
  return Number.isFinite(ch.scale) ? { step: Number(ch.scale.toPrecision(1)) } : {};
};

/**
 * 로그 자료의 값 한 개 → '2.4 mm/h'. **유효숫자 2자리**(소수 자릿수 고정이 아니다 — 머리말). 값 없음은 '—'.
 * sig·maxDigits 를 올려 부르는 곳은 클릭 값의 자리 늘리기 하나다(logReadSig) — 그 밖에서는 기본값으로 쓴다.
 */
export const logValueText = (scale, v, sig = 2, maxDigits = LOG_TEXT_MAX_DIGITS) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return `0 ${scale.unit}`;
  const digits = decimalsOf(a, sig, maxDigits);
  let s = a.toFixed(digits);
  if (digits > 0) s = s.replace(/\.?0+$/, '');   // toFixed(양수)는 늘 소수점이 있다 — '100' 의 0 을 깎을 길이 없다
  return `${v < 0 ? MINUS : ''}${s} ${scale.unit}`;
};

/**
 * logValueText 와 **같은 인수로 같은 수**. 글자가 어느 칸에 떨어지는지 보려고 둔다 —
 * 글자를 되읽어 수로 바꾸면(단위·빼기 기호를 떼어 내면) 두 길이 갈릴 수 있다. 한 자리 셈(decimalsOf)을 나눠 쓴다.
 */
export const logValueNumber = (v, sig = 2, maxDigits = LOG_TEXT_MAX_DIGITS) => {
  if (!Number.isFinite(v)) return NaN;
  const a = Math.abs(v);
  if (a === 0) return 0;
  return (v < 0 ? -1 : 1) * Number(a.toFixed(decimalsOf(a, sig, maxDigits)));
};

/**
 * 클릭 값의 글자가 쓸 유효숫자 자릿수 — 2 로 시작해, 그 자리로 적은 수가 raw 와 **다른 칸**에 떨어지면 한 자리씩 늘린다.
 * 색 점은 raw 에서 뽑으므로(bandColor) 이렇게 해야 글자와 색 점이 같은 칸을 가리킨다(머리말 '글자와 색 점').
 * 상한까지 가도 칸이 안 맞으면 상한을 돌려준다 — 자료가 말할 수 있는 것보다 더 적어 봐야 거짓 정밀도다.
 */
export const logReadSig = (scale, raw) => {
  const want = bandIndex(scale, raw);
  for (let sig = 2; sig < LOG_READ_MAX_SIG; sig += 1) {
    if (bandIndex(scale, logValueNumber(raw, sig, LOG_READ_MAX_DIGITS)) === want) return sig;
  }
  return LOG_READ_MAX_SIG;
};

/**
 * 자료가 눈금표의 **맨 위 칸을 못 채울** 때 그 사실을 한 줄로(아니면 빈 글자).
 * 강수율 프레임은 30 mm/h 에서 포화한다(매니페스트 fields.precip.channels.R.max) — 눈금표의 '≥ 50 mm/h' 칸은
 * 이 자료로는 나오지 않는다. 화면이 가질 수 없는 색을 범례에 세워 두고 말하지 않으면 그게 거짓말이다.
 * 천장은 **매니페스트에서만** 온다 — 이 파일에도 눈금표에도 30 이라고 적지 않는다.
 */
export const topBandNote = (scale, ch, ko = true) => {
  const breaks = scale && scale.breaks;
  const top = breaks && breaks.length ? breaks[breaks.length - 1] : NaN;
  const max = ch ? Number(ch.max) : NaN;
  if (!(Number.isFinite(top) && Number.isFinite(max) && max < top)) return '';
  const hi = logValueText(scale, max);
  const band = `≥ ${logValueText(scale, top)}`;
  return ko
    ? `이 자료는 ${hi} 에서 포화합니다 — '${band}' 칸은 이 자료로는 나오지 않습니다`
    : `This field saturates at ${hi} — the '${band}' band cannot occur in it`;
};

/**
 * 로그 자료의 클릭 값 — field-layer.readoutOf 가 상수 눈금이 없는 표본을 만나면 이리로 온다.
 *   { scale, raw(보간값), floor(자료의 바닥 · 매니페스트 min), cell('0.5° 격자(약 55 km)'), zeroText({ko,en}), ko }
 *   → { ok, value, text, note, color }  — readoutOf 와 같은 모양이다.
 * 바닥 아래(강수율은 바이트 0 = 0 mm/h)는 값을 말하지 않고 '비 없음(0.05 mm/h 미만)' 이라고 한다 — 0.0 mm/h 라고
 * 적으면 '정확히 0' 이라는 뜻이 되는데, 자료가 말할 수 있는 것은 '바닥 미만'까지다.
 */
export const logReadout = ({ scale, raw, floor = 0, cell = '', zeroText = null, ko = true } = {}) => {
  const none = (zeroText && (zeroText[ko ? 'ko' : 'en'] || zeroText.ko)) || (ko ? '없음' : 'None');
  const mean = ko ? `${cell} 평균` : `${cell} mean`;
  if (!Number.isFinite(raw)) return { ok: false, text: '—' };
  if (raw <= 0 || (floor > 0 && raw < floor)) {
    const text = floor > 0
      ? (ko ? `${none}(${logValueText(scale, floor)} 미만)` : `${none} (below ${logValueText(scale, floor)})`)
      : none;
    return { ok: true, value: 0, text, note: mean, color: null };
  }
  // 맨 아래 칸이 '칠하지 않는 칸'인 눈금(강수 0.1 mm/h 미만)에서, 값은 있는데 색이 없는 자리를 누를 수 있다.
  // 숫자만 뜨고 색 점이 없으면 고장으로 보인다 — 왜 안 칠하는지 적는다.
  const unpainted = scale.alpha[0] === 0 ? scale.breaks[0] : null;
  const hidden = unpainted != null && raw < unpainted;
  const note = hidden
    ? (ko ? `${mean} · ${logValueText(scale, unpainted)} 미만이라 칠하지 않습니다` : `${mean} · below ${logValueText(scale, unpainted)}, left unpainted`)
    : mean;
  // 글자는 제 칸에 남을 만큼만 자리를 늘린다(logReadSig) — 색 점은 늘 raw 의 칸이다(머리말 '글자와 색 점').
  // 칠하지 않는 칸의 경계(0.1 mm/h)도 눈금표의 경계라, 0.0997 mm/h 는 이 길에서 저절로 '~0.0997' 이 된다:
  // 전에는 '~0.1 mm/h' 라고 적어 놓고 바로 옆줄에서 '0.1 mm/h 미만이라 칠하지 않습니다' 라고 해 한 줄이 스스로를 반박했다.
  const sig = logReadSig(scale, raw);
  const shown = logValueNumber(raw, sig, sig > 2 ? LOG_READ_MAX_DIGITS : LOG_TEXT_MAX_DIGITS);
  // 자리를 상한까지 늘려도 글자가 경계를 못 넘어오면(경계에서 유효숫자 5자리 안쪽 — 보간값이라 드물게 가능하다)
  // 값을 말하지 않고 경계 하나로 말한다. 바닥 아래의 '비 없음(0.05 mm/h 미만)' 과 같은 문법이다.
  if (hidden && shown >= unpainted) {
    const edge = logValueText(scale, unpainted);
    return { ok: true, value: raw, text: ko ? `${edge} 미만` : `below ${edge}`, note, color: bandColor(scale, raw) };
  }
  return {
    ok: true,
    value: raw,
    text: `~${logValueText(scale, raw, sig, sig > 2 ? LOG_READ_MAX_DIGITS : LOG_TEXT_MAX_DIGITS)}`,
    note,
    color: bandColor(scale, raw),
  };
};

/**
 * 카드의 '모델 범위' 한 줄 — 로그로 실린 자료에서는 두 끝이 **값이 아닐 수 있다.**
 * 바닥(매니페스트 min) 미만은 모델이 낸 강수율이 아니라 '비 없음' 바이트이고, 천장(ch.max)은 모델의 최댓값이 아니라
 * **인코딩 천장**이다(운영 프레임 실측: 바이트 255 인 칸이 전지구에 하나뿐이었다). 그대로 두면 이 줄이 늘 같은 두 수
 * ('0.0 mm/h ~ 30.0 mm/h')로 굳어 자료를 아무것도 말하지 않는다. 자릿수도 클릭 값과 같은 길(logValueText)로 맞춘다 —
 * 전에는 이 줄만 formatValue 의 소수 1자리('30.0')라 바로 밑 클릭 값('~30')과 문법이 갈렸다.
 * 선형 자료(ch 가 로그가 아니거나 없을 때)는 부른 쪽의 formatValue 를 그대로 쓰라고 빈 글자를 돌려준다.
 */
export const logRangeText = (scale, stats, ch = null, zeroText = null, ko = true) => {
  if (!ch || ch.transfer !== 'log10' || !stats || !Number.isFinite(stats.min) || !Number.isFinite(stats.max)) return '';
  const none = (zeroText && (zeroText[ko ? 'ko' : 'en'] || zeroText.ko)) || (ko ? '없음' : 'None');
  const floor = Number(ch.min);
  const ceil = Number(ch.max);
  const lo = Number.isFinite(floor) && stats.min < floor
    ? (ko ? `${none}(${logValueText(scale, floor)} 미만)` : `${none} (below ${logValueText(scale, floor)})`)
    : logValueText(scale, stats.min);
  // 마지막 바이트를 값으로 푼 수는 천장과 딱 떨어지지 않는다(10^(logSpan+logLo) = 30.00000000000001) — 비율로 견준다.
  const capped = Number.isFinite(ceil) && ceil > 0 && stats.max >= ceil * (1 - 1e-9);
  const hi = logValueText(scale, stats.max) + (capped ? (ko ? ' (인코딩 천장)' : ' (encoding ceiling)') : '');
  return `${lo} ~ ${hi}`;
};

// EARTHUS v2 — 늦게 온 프레임을 넣을까 버릴까 (DEV-DIRECTIVE 2026-09-20 · 작업 E3 ① · B2 반박 검증)
//
// 무엇이 잘못돼 있었나: 바람 층(wind-layer.js)은 **청한 순서** 하나로 갈랐다 — 응답이 오는 사이에 시각이 한 번이라도
//   움직이면(`mine !== seq`) 받아 놓은 장을 통째로 버렸다. 재생은 0.22초마다 한 칸을 미는데 프레임 한 장은 그보다
//   오래 걸린다(운영 0.8초 안팎). 그래서 ▶ 를 누르면 청하기만 하고 **한 장도 안 들어가** 입자가 처음 두 장에 얼어붙은 채
//   시간 글자만 흘렀다. 순서는 '새것'을 뜻하지 않는다: 늦게 온 장이라도 **지금 시각에 더 가까운 장**이면 지금 든 것보다 낫다.
//
// 그래서 여기서 재는 것은 순서가 아니라 **시간 거리**다. 재는 자는 키프레임 구간 [ha, hb] 과 지금 시각의 예보 시각 h 다:
//   구간 안이면 0 · 구간 앞이면 ha − h · 뒤면 h − hb.
//   시각 하나가 아니라 구간으로 재는 이유: 엔진에 들어 있는 것도 구간이고, 같은 구간으로 되돌아온 스크럽
//   (3.5h → 9.5h → 3.5h)에서 옛 응답과 지금 든 것이 **같은 구간**일 때 '같은 거리'로 떨어져야 다시 올리지 않는다.
//
// 이 파일은 DOM · THREE · 저장소를 모른다 — 숫자만 받아 참/거짓을 낸다. 시험이 그대로 부른다.

/** 시간 거리(시간 단위). 구간 안이면 0. 구간이 없거나 시각을 모르면 Infinity — '가장 나쁜 것'으로 친다. */
export const bracketDistanceH = (span, hourNow) => {
  if (!span || !Number.isFinite(hourNow)) return Infinity;
  const a = Number(span.ha);
  const b = Number(span.hb);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hourNow < lo) return lo - hourNow;
  if (hourNow > hi) return hourNow - hi;
  return 0;
};

/** 두 구간이 같은가. 숫자로 견준다 — 열쇠 글자(런 표시가 섞인다)로 견주지 않는다. */
export const sameSpan = (a, b) => !!a && !!b
  && Number(a.ha) === Number(b.ha) && Number(a.hb) === Number(b.hb);

/**
 * 지금 도착한 장을 엔진에 넣을까.
 *   arriving  도착한 장의 구간 { ha, hb } · held  지금 엔진에 든 구간(비었으면 null) · current  지금 시각이 끼고 있는 구간
 *   hourNow   지금 시각의 예보 시각(h) · stale  지금 이 시각에는 그릴 자료가 없다(예보 범위 밖 · 자료 없음)
 * ① 든 것이 없으면 늦어도 넣는다 — 빈 화면보다 낫다.
 * ② 같은 구간이면 넣지 않는다 — 같은 그림을 다시 올리지 않는다.
 * ③ **지금 구간이면 거리가 같아도 넣는다.** 거리만으로 가르면 [3,6] 을 쥔 채 시각이 정확히 6h 에 닿았을 때
 *    새 구간 [6,6] 이 '둘 다 거리 0' 이라 떨어진다 — 그러면 열쇠가 어긋난 채 남아 재생 중 비율(setMix)도 멈춘다.
 * ④ 그 밖에는 **더 가까운 쪽**이 이긴다.
 */
export const acceptsArrival = ({ arriving = null, held = null, current = null, hourNow = NaN, stale = false } = {}) => {
  if (stale || !arriving) return false;
  if (!held) return true;
  if (sameSpan(arriving, held)) return false;
  if (sameSpan(arriving, current)) return true;
  return bracketDistanceH(arriving, hourNow) < bracketDistanceH(held, hourNow);
};

/**
 * 지금 시각의 '예보 시각'(h · 소수 포함). 끼고 있는 구간의 앞 프레임에서 잰다 — 런 시각을 여기 적지 않는다.
 * 범위 밖이면 br.a = br.b = 끝 프레임이라 h 가 구간 밖으로 나온다(그래서 거리가 0 이 아니다) — 그것이 맞는 셈이다.
 */
export const forecastHourAt = (br, tMs) => {
  if (!br || !br.a || !Number.isFinite(br.a.t) || !Number.isFinite(br.a.h) || !Number.isFinite(tMs)) return NaN;
  return br.a.h + (tMs - br.a.t) / 3600000;
};

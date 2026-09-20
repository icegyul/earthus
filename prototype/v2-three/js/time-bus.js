// EARTHUS v2 — 시간 하나 (DEV-DIRECTIVE 2026-09-20 · 7단계 문법 ④ "시간축을 움직인다")
//
// 무엇이 없어 있었나: 타임라인이 가리키는 시각을 듣는 곳이 main.js 안의 구름 하나뿐이었다
//   (슬라이더 → clouds.setForecastOffset(ms) 두 자리). 그래서 타임라인에 묶인 것이 구름·강수·태풍 경로·서울 혼잡 넷뿐이었고,
//   기온·바람·기압 렌더러가 같은 시각을 따라오려면 저마다 main.js 의 그 두 줄 옆에 자기 줄을 하나씩 더 끼워야 했다 —
//   메뉴가 11개면 11줄이고, 한 줄 빠뜨리면 그 메뉴만 '지금'에 멈춘다. v2 는 5일을 예보하는 서비스다: 시간은 하나여야 한다.
//
// 무엇인가: '지금에서 얼마나 떨어져 있나(offsetMs)' 하나를 들고, 바뀌면 듣는 쪽 전부에 알린다. 그게 전부다.
//   · 값은 **지금 기준 오프셋**이다(절대 시각이 아니다). 페이지를 오래 열어 두면 '지금'이 흐르므로 절대 시각은
//     읽는 순간에 셈한다 — validMs(). 프레임 저장소(gfs-frames.js)의 bracket(id, tMs) 에 그대로 넣는다.
//   · isNow() — 관측 숫자(OBS)는 타임라인이 '지금'일 때만 보인다(지시서 W1 ⑦: 예보 시각의 색면 위에 현재 관측을
//     얹으면 관측과 예보가 섞인다). '지금'의 폭은 프레임 간격의 절반이 아니라 **0 근처 한 눈금**이다 — 슬라이더를
//     조금이라도 밀었으면 사용자는 예보를 보고 있다.
//   · 듣는 쪽이 던져도 다른 쪽은 계속 듣는다(레이어 하나의 오류가 시간축 전체를 세우면 안 된다).
//
// DOM · THREE 를 모른다 — 시험이 그대로 부른다(tools/earthus-v53/time-bus.test.mjs).

// '지금'으로 치는 폭(ms). 타임라인 슬라이더의 한 눈금이 1분이라 그보다 작게 흔들리는 값은 '지금'이다.
export const NOW_EPS_MS = 60 * 1000;

export function createTimeBus({ now = () => Date.now() } = {}) {
  let offsetMs = 0;
  const subs = new Set();

  const notify = () => {
    for (const fn of [...subs]) {
      try { fn(offsetMs); } catch (e) { console.warn('[time-bus] 듣는 쪽 오류 — 다른 쪽은 계속 듣는다', e); }
    }
  };

  return {
    get offsetMs() { return offsetMs; },
    // 타임라인이 가리키는 유효 시각(ms). 읽는 순간의 '지금'에서 셈한다.
    validMs() { return now() + offsetMs; },
    isNow() { return Math.abs(offsetMs) < NOW_EPS_MS; },
    // 숫자가 아니면 무시한다 — NaN 이 한 번 들어가면 모든 레이어의 bracket 이 null 을 낸다.
    // 같은 값이면 알리지 않는다(슬라이더 input 이벤트는 같은 값으로도 여러 번 온다).
    set(ms) {
      const v = Number(ms);
      if (!Number.isFinite(v) || v === offsetMs) return false;
      offsetMs = v;
      notify();
      return true;
    },
    // 듣기 시작하면 **지금 값으로 한 번 바로 부른다** — 레이어를 타임라인을 민 뒤에 켜도 그 시각에서 시작한다.
    // 돌려주는 함수를 부르면 그만 듣는다(레이어를 끌 때 반드시 부른다 — 안 부르면 꺼진 레이어가 프레임을 계속 받는다).
    on(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      try { fn(offsetMs); } catch (e) { console.warn('[time-bus] 듣는 쪽 오류', e); }
      return () => subs.delete(fn);
    },
    listeners() { return subs.size; },
  };
}

// 앱 전체가 나눠 쓰는 하나. main.js 의 타임라인이 set 하고, 레이어 모듈은 이 파일을 import 해서 on 한다.
// ⚠️ 다른 모듈과 **같은 URL**(?v= 까지)로 import 해야 같은 인스턴스다 — ES 모듈은 URL 전체로 구분된다.
export const timeBus = createTimeBus();

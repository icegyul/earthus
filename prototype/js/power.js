// 발열 · 배터리 관리 + 애니메이션 시계
//
// 문제
//   Cesium 은 기본적으로 화면이 그대로여도 매 프레임 다시 그린다(requestRenderMode=false).
//   지구를 가만히 보고만 있어도 초당 60~120번 GPU 와 CPU 가 돈다. 폰이 뜨거워진다.
//
// 실측 (아이폰 크기 캔버스 750×1624, 위성 263개)
//   엔티티 갱신(SGP4)  6.6ms   ← 프레임 비용의 94%
//   렌더(GPU)          0.6ms
//   위성 끄면 합쳐서   0.4ms
//   → 120fps 로 계속 돌면 초당 792ms. CPU 코어 하나를 79% 태우는 셈이다.
//
// 대책은 셋이다.
//   1) SGP4 를 매 프레임 하지 않는다     → space.js 의 위치 캐시 (12배 절감)
//   2) 변한 게 없으면 아예 그리지 않는다  → requestRenderMode (이 파일)
//   3) 화면을 안 보고 있으면 전부 멈춘다  → visibilitychange (이 파일)
//
// ⚠️ requestRenderMode 를 켤 때의 함정
//    scene.preRender 는 "렌더가 일어날 때만" 불린다.
//    그래서 흘러가기(drift)를 preRender 에 걸어두면
//      렌더 없음 → tick 없음 → 렌더 요청 없음 → 영영 멈춤
//    이라는 교착에 빠진다.
//    → 애니메이션 시계는 렌더와 무관한 setInterval 로 따로 돌린다. 그게 이 파일이다.

import { viewer, scene } from './viewer.js';

/* 애니메이션이 필요할 때의 갱신율.
   30fps 면 지구가 천천히 흐르는 정도는 충분히 부드럽고,
   120fps 대비 작업량이 4분의 1 이다. */
const ANIM_FPS = 30;
const ANIM_MS = Math.round(1000 / ANIM_FPS);

export const power = {
  saving: localStorage.getItem('earthus.powerSave') === 'on',
  _needUntil: 0,       // 이 시각까지는 계속 그린다
  _gap: 0,             // 렌더 사이 최소 간격(ms) — 느린 애니메이션을 위한 것
  _lastRender: 0,
  _clock: null,
  _tickers: [],        // 매 틱 호출할 함수들 (drift 등)

  init() {
    scene.requestRenderMode = true;
    // "시뮬레이션 시각이 바뀌었다"는 이유로는 다시 그리지 않는다.
    // 우리가 필요할 때 requestRender() 로 직접 깨운다.
    scene.maximumRenderTimeChange = Infinity;

    // 렌더와 독립된 시계. 항상 돌지만 하는 일은 거의 없다(틱 함수 몇 개).
    this._clock = setInterval(() => this._tick(), ANIM_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._needUntil = 0;      // 즉시 멈춤
      else this.animate(800);                        // 돌아오면 잠깐 그려서 화면 복구
    });
    return this;
  },

  /* ⚠️⚠️ 여기 있던 setRippleCheck 를 없앴다. 발열의 원인이었다.
     ─────────────────────────────────────────────────────────────
     예전 동작: 매 틱(33ms) 모든 데이터소스의 모든 엔티티를 훑어
       /rip|arm\d|gyreflow/ 에 맞는 id 가 있으면 animate(200) 을 불렀다.

     그런데 지진 파문은 **최근 24시간** 지진 전부에 붙는다.
     실측: 규모 4.0+ 22건 → 파문 엔티티 66개, 그 지진들의 나이는 1.9~21.7시간.
       · 21시간 전 지진이 지금도 맥동한다 (알릴 것이 없는데 알리고 있다)
       · 파문이 하나라도 있으면 매 틱 animate(200) → **30fps 영구 렌더**
       · 파문 하나에 CallbackProperty 4개 → 프레임당 264회 평가
       · 그중 semiMajorAxis 변경은 Cesium 의 ellipse **지오메트리 재생성**을
         유발한다. 초당 약 2,000회. 이게 실제 발열의 대부분이다.
       · 게다가 판정 자체가 O(전체 엔티티) × 30Hz 였다 (위성·부이·산불 수천 개)

     그래서 requestRenderMode 를 켜놨는데도 지구는 영원히 쉬지 않았다.

     지금 방식: **끝나지 않는 애니메이션을 두지 않는다.**
       애니메이션을 만든 쪽이 animate(지속시간) 으로 필요한 만큼만 요청하고,
       그 시간이 지나면 스스로 정적인 모습으로 바꾼다.
       판정 스캔이 없어졌으므로 30Hz 로 도는 일은 틱 함수 몇 개뿐이다. */

  /** 매 틱 불릴 함수 등록 (drift 처럼 렌더와 무관하게 돌아야 하는 것) */
  onTick(fn) { this._tickers.push(fn); },

  /**
   * 앞으로 ms 동안 그림이 바뀔 예정이라고 알린다.
   *
   * @param ms   이만큼 동안 렌더를 요청한다
   * @param gap  렌더 사이 최소 간격(ms). 0 이면 시계 속도(30fps)대로.
   *
   * ⚠️ gap 이 왜 필요한가
   *    모든 애니메이션이 30fps 를 필요로 하지 않는다.
   *    자동 회전은 0.15°/s 다 — 33ms 동안 0.005° 움직인다. 10fps 로도 부드럽다.
   *    위성도 위치를 100ms 마다만 갱신하므로 30fps 로 그릴 이유가 없다.
   *    그런데 예전에는 구분이 없어서 느린 움직임까지 30fps 로 그렸다.
   *    카메라가 움직이면 타일 선택·전 엔티티 화면좌표가 다시 계산되므로
   *    이 차이가 발열에서 제일 크다.
   *
   * ⚠️ 여러 곳이 동시에 요청하면 **가장 빠른 요구**를 따른다(gap 의 최솟값).
   *    느린 쪽에 맞추면 빠른 애니메이션이 끊겨 보인다.
   */
  animate(ms = 300, gap = 0) {
    if (document.hidden) return;
    const now = performance.now();
    const until = now + ms;
    // 창이 이미 닫혀 있었다면 간격을 새로 정한다. 열려 있으면 더 빠른 쪽을 택한다.
    this._gap = now > this._needUntil ? gap : Math.min(this._gap, gap);
    if (until > this._needUntil) this._needUntil = until;
  },

  _tick() {
    if (document.hidden) return;
    for (const fn of this._tickers) {
      try { fn(); } catch (e) { console.warn('[power] ticker', e.message); }
    }
    /* ⚠️ 여기서 애니메이션을 스스로 연장하지 않는다.
       animate() 를 부른 쪽이 정한 시간이 지나면 렌더는 멈춘다.
       그게 requestRenderMode 를 켠 이유다. */
    const now = performance.now();
    if (now <= this._needUntil && now - this._lastRender >= this._gap) {
      this._lastRender = now;
      scene.requestRender();
    }
  },

  /** 지금 렌더를 계속 요청하고 있나 — 계측·검증용 */
  get animating() { return performance.now() <= this._needUntil; },

  /** 절전 모드 — 흘러가기를 끄고 애니메이션을 줄인다 */
  setSaving(on) {
    this.saving = on;
    localStorage.setItem('earthus.powerSave', on ? 'on' : 'off');
  },
};

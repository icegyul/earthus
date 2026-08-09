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
//    → 애니메이션 시계는 렌더와 무관한 짧은 setTimeout 으로 따로 돌린다.
//      단, 요청이 있을 때만 켜고 유휴가 되면 타이머 자체도 없앤다.

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
  _inTick: false,
  suspended: false,      // Cesium이 아닌 장면에서는 렌더 요청 자체를 막는다
  _tickers: [],        // 움직이는 동안 매 틱 호출할 함수들 (intro 등)
  _requests: new Map(),// 애니메이션 주인 → { until, gap }

  init() {
    scene.requestRenderMode = true;
    // "시뮬레이션 시각이 바뀌었다"는 이유로는 다시 그리지 않는다.
    // 우리가 필요할 때 requestRender() 로 직접 깨운다.
    scene.maximumRenderTimeChange = Infinity;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._requests.clear();
        this._needUntil = 0;
        this._stopClock();                           // 즉시 멈춤
      }
      else if (!this.suspended) this.animate(800);   // 돌아오면 잠깐 그려서 화면 복구
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

  /** 움직이는 동안 매 틱 불릴 함수 등록 */
  onTick(fn) { this._tickers.push(fn); },

  /**
   * 앞으로 ms 동안 그림이 바뀔 예정이라고 알린다.
   *
   * @param ms   이만큼 동안 렌더를 요청한다
   * @param gap  렌더 사이 최소 간격(ms). 0 이면 시계 속도(30fps)대로.
   * @param key  애니메이션 주인. 레이어를 끌 때 cancel(key) 로 남은 시간을 거둔다.
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
  animate(ms = 300, gap = 0, key = 'default') {
    if (document.hidden || this.suspended) return;
    const now = performance.now();
    const until = now + ms;
    const prev = this._requests.get(key);
    this._requests.set(key, {
      until: Math.max(prev?.until || 0, until),
      // 같은 주인이 아직 움직이는 중이면 더 빠른 요청을 지킨다.
      gap: prev?.until >= now ? Math.min(prev.gap, gap) : gap,
    });
    this._needUntil = Math.max(this._needUntil, until); // 기존 진단 손잡이 유지
    if (!this._inTick) this._schedule(0);
  },

  /** 레이어를 끄면 그 레이어가 남긴 렌더 시간도 즉시 거둔다. */
  cancel(key) {
    this._requests.delete(key);
    const active = this._active(performance.now());
    if (!active) this._stopClock();
  },

  /** Cesium을 숨긴 장면에서는 남은 애니메이션 예약까지 전부 거둔다. */
  suspend() {
    this.suspended = true;
    this._requests.clear();
    this._needUntil = 0;
    this._stopClock();
  },

  /** 지구 장면으로 돌아왔을 때 한 번 깨워 백버퍼를 복구한다. */
  resume() {
    this.suspended = false;
    this.animate(500, 0, 'scene-resume');
  },

  _active(now) {
    let until = 0, gap = Infinity;
    for (const [key, req] of this._requests) {
      if (req.until < now) { this._requests.delete(key); continue; }
      until = Math.max(until, req.until);
      gap = Math.min(gap, req.gap);
    }
    this._needUntil = until;
    if (!until) return null;
    return { until, gap: Number.isFinite(gap) ? gap : 0 };
  },

  _schedule(delay = ANIM_MS) {
    if (this._clock != null || document.hidden) return;
    this._clock = setTimeout(() => {
      this._clock = null;
      this._tick();
    }, delay);
  },

  _stopClock() {
    clearTimeout(this._clock);
    this._clock = null;
  },

  _tick() {
    if (document.hidden) { this._stopClock(); return; }
    this._inTick = true;
    for (const fn of this._tickers) {
      try { fn(); } catch (e) { console.warn('[power] ticker', e.message); }
    }
    this._inTick = false;
    /* ⚠️ 여기서 애니메이션을 스스로 연장하지 않는다.
       animate() 를 부른 쪽이 정한 시간이 지나면 렌더는 멈춘다.
       그게 requestRenderMode 를 켠 이유다. */
    const now = performance.now();
    const active = this._active(now);
    if (active && now - this._lastRender >= active.gap) {
      this._lastRender = now;
      scene.requestRender();
    }
    if (active) this._schedule(ANIM_MS);
  },

  /** 지금 렌더를 계속 요청하고 있나 — 계측·검증용 */
  get animating() { return !!this._active(performance.now()); },

  /** 절전 모드 — 흘러가기를 끄고 애니메이션을 줄인다 */
  setSaving(on) {
    this.saving = on;
    localStorage.setItem('earthus.powerSave', on ? 'on' : 'off');
  },
};

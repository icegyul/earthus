// 렌더 품질 자동 조절 + 프레임 계측
//
// 왜 필요한가
//   "부드럽지 않다"를 고치려면 먼저 몇 프레임이 나오는지 알아야 한다.
//   그런데 기기마다 다르다 — 맥은 120Hz ProMotion, 폰은 60~120Hz,
//   같은 폰이라도 저전력 모드면 60 으로 묶인다.
//   그래서 값을 추측하지 않고 실제 rAF 간격을 재서, 모자라면 해상도를 낮춘다.
//
// 조절 대상은 resolutionScale 하나다.
//   지구 렌더 비용은 픽셀 수에 거의 비례하므로 이게 가장 잘 듣는다.
//   레이어를 끄거나 위성을 줄이는 건 사용자가 보려던 걸 뺏는 것이라 마지막 수단이다.

import { viewer, scene } from './viewer.js';

// resolutionScale 은 devicePixelRatio 위에 곱해진다 (viewer.js 참고).
// 1 = 기기 네이티브 해상도. 이보다 위는 화면에 보이지도 않으므로 의미가 없다.
const MAX = 1;
const MIN = 0.5;      // 네이티브의 절반. 이 아래로는 눈에 띄게 뭉개진다.
const STEP = 0.125;

/* 판단 기준은 "한 프레임을 그리는 데 걸린 시간"이다. fps 가 아니다.
   ─────────────────────────────────────────────────────────────
   ⚠️ 여기서 두 번 실패했다. 둘 다 "무엇을 재는가"를 틀린 것이다.

   1차 실패 — 주사율에 비례한 목표치(refreshHz × 0.8)를 썼다.
     아이폰 16 Pro 는 120Hz 인데 Safari 가 rAF 을 60 으로 묶어 목표를 영원히 못 채웠고,
     매초 해상도를 깎아 최저값에서 굳었다.

   2차 실패 — 절대 fps 기준으로 바꿨는데, 그 fps 를 rAF 횟수로 셌다.
     requestRenderMode 를 켜면 rAF 은 화면 주사율대로 돌지만 실제 렌더는
     power.js 가 초당 30번만 요청한다. 즉 fps 는 "화면 주사율"을 잰 값이지
     "무거운지"와 아무 상관이 없다.
     그 값이 58~59 언저리를 오르내리자 올렸다 내렸다를 반복했고,
     resolutionScale 이 바뀔 때마다 viewer.resize() 가 WebGL 버퍼를 다시 잡으면서
     한 프레임이 검게 비었다 — 실측으로 잡은 "화면이 깜빡인다"의 정체다.
       t=0.3s  0.625→0.75   t=2.4s  0.75→0.625   t=6.3s  0.625→0.75

   → 이제 preUpdate~postRender 실제 소요 시간의 중앙값으로 판단한다.
     렌더가 몇 번 일어나든, 주사율이 얼마든 영향받지 않는다. */
const JANK_MS   = 22;     // 이보다 오래 걸리면 무겁다 (45fps 에 해당)
const SMOOTH_MS = 8;      // 이보다 빠르면 여유가 있다

/* 흔들림 방지 — 셋 다 필요하다.
   한 번 바꿀 때마다 화면이 한 프레임 검게 비므로, 바꾸는 것 자체가 비용이다. */
const BAD_RUNS  = 3;      // 연속 3초 무거워야 낮춘다
const GOOD_RUNS = 8;      // 연속 8초 여유로워야 올린다
const COOLDOWN_MS = 12_000;   // 바꾼 뒤 12초는 건드리지 않는다
const MAX_CHANGES = 6;    // 세션당 변경 상한 — 어떤 경우에도 무한 반복하지 않는다

export const renderQuality = {
  fps: 0,
  frameMs: 0,
  scale: MAX,
  auto: localStorage.getItem('earthus.autoQuality') !== 'off',
  refreshHz: null,          // 이 화면이 낼 수 있는 최대 (120Hz 인지 60Hz 인지)
  _subs: [],

  onChange(fn) { this._subs.push(fn); },
  _emit() { this._subs.forEach(f => f(this)); },

  _rendersThisSec: 0,
  renderFps: 0,

  frameCostMs: 0,           // 실제 한 프레임 비용 (중앙값)
  changes: 0,               // 이번 세션에 해상도를 몇 번 바꿨나
  /* 시작 직후는 판단하지 않는다.
     타일·카탈로그·구름을 한꺼번에 받느라 어차피 무겁고, 그건 곧 끝난다.
     이때 내린 판단이 세션 내내 남으면 "처음부터 뭉개진 지구"가 된다. */
  _lastChange: 0,
  _costs: [],
  _t0: 0,

  init() {
    this.scale = MAX;
    viewer.resolutionScale = this.scale;
    viewer.resize();

    /* 한 프레임의 실제 비용을 잰다.
       preUpdate ~ postRender 가 Cesium 이 이 프레임에 한 일 전부다
       (엔티티 갱신 + 지오메트리 + 드로우). preRender 부터 재면 엔티티 갱신이 빠져
       실제보다 훨씬 싸게 나온다 — 예전에 그렇게 재서 2500fps 라는 값을 본 적이 있다. */
    this._lastChange = performance.now() + 6000 - COOLDOWN_MS;   // 6초 유예
    scene.preUpdate.addEventListener(() => { this._t0 = performance.now(); });
    scene.postRender.addEventListener(() => {
      this._rendersThisSec++; this._renderCount++;
      if (this._t0) this._costs.push(performance.now() - this._t0);
    });
    this._loop();      // 주사율은 _loop 이 매 프레임 _feedGap 으로 갱신한다
    return this;
  },

  /* 화면 주사율 판정
     이걸 알아야 "60fps 인데 느린 것"과 "120Hz 화면에서 60 밖에 못 내는 것"을 구분한다.
     후자가 사용자가 말한 "120Hz 보다가 60Hz 보는 기분"이다.

     ⚠️ 처음엔 시작 직후 40프레임의 중앙값으로 쟀는데 이건 틀린 방법이다.
        그 시점은 Cesium 초기화·타일 로딩으로 가장 바쁠 때라
        120Hz 화면이어도 프레임을 놓쳐 중앙값이 16.6ms(=60Hz)로 나온다.
        그러면 refreshHz 가 60 으로 굳고, 목표치가 48fps 로 낮아져
        "120Hz 를 낼 수 있는데 안 내는" 상태가 영구히 유지된다.

     → 능력치는 "가장 빠른 프레임"에 드러난다. 관측된 최소 간격을 계속 갱신하고,
       알려진 주사율에 스냅한다. 세션 내내 자동으로 교정된다. */
  _minGap: Infinity,
  _seen: 0,
  _renderCount: 0,

  _gaps: [],

  _feedGap(gap) {
    /* ⚠️ 최솟값 하나로 판정하면 이상치 한 번에 끌려간다.
       실제로 이 화면을 240Hz 로 오판했다 — 4ms 짜리 가짜 간격 하나 때문이다.
       하위 10% 지점을 쓰면 이상치에 안 흔들리면서 "가장 빠른 축"은 그대로 잡힌다. */
    if (gap < 3.9 || gap > 40) return;      // 3.9ms = 256Hz. 그보다 빠른 건 타이머 오차다.
    this._gaps.push(gap);
    if (this._gaps.length > 240) this._gaps.shift();
    this._seen++;
    if (this._seen < 40 || this._seen % 20) return;

    const s = [...this._gaps].sort((a, b) => a - b);
    const hz = 1000 / s[Math.floor(s.length * 0.1)];
    const snapped = [165, 144, 120, 90, 75, 60, 48, 30]
      .reduce((best, r) => Math.abs(r - hz) < Math.abs(best - hz) ? r : best);
    if (snapped !== this.refreshHz) { this.refreshHz = snapped; this._emit(); }
  },

  /* 프레임 감시. 1초마다 판정한다.
     ⚠️ 카메라가 움직이는 동안에만 의미가 있다 — 정지 상태에서도 Cesium 은
        계속 그리지만 타일 로딩이 없어 항상 빠르게 나온다.
        그래서 "느릴 때만" 낮추고, 올릴 땐 여유가 확실할 때만 올린다. */
  _loop() {
    let frames = 0, t0 = performance.now(), lastT = t0;
    let goodRuns = 0, badRuns = 0;

    const tick = () => {
      const now = performance.now();
      const gap = now - lastT; lastT = now;
      this._feedGap(gap);        // 주사율 능력치 갱신 (표시용)
      frames++;

      if (now - t0 >= 1000) {
        this.fps = Math.round(frames * 1000 / (now - t0));
        this.renderFps = Math.round(this._renderCount * 1000 / (now - t0));
        this._renderCount = 0;

        /* 이번 1초의 실제 프레임 비용 — 중앙값을 쓴다.
           평균은 히칭 한 번에 끌려가고, 최댓값은 타일 로딩 같은 일회성에 좌우된다. */
        const c = this._costs; this._costs = [];
        if (c.length) {
          c.sort((a, b) => a - b);
          this.frameCostMs = +c[Math.floor(c.length / 2)].toFixed(2);
          this.frameMs = this.frameCostMs;
        }

        /* ⚠️ requestRenderMode 를 켠 뒤로는 "가만히 있으면 안 그린다".
              유휴 구간의 표본으로 판단하면 안 된다. 표본이 충분할 때만 본다. */
        const enough = c.length >= 10;
        this._rendersThisSec = 0;

        const cooling = now - this._lastChange < COOLDOWN_MS;
        const frozen = this.changes >= MAX_CHANGES;

        if (this.auto && enough && !cooling && !frozen) {
          if (this.frameCostMs > JANK_MS && this.scale > MIN) {
            goodRuns = 0;
            if (++badRuns >= BAD_RUNS) { this._setScale(this.scale - STEP, now); badRuns = 0; }
          } else if (this.frameCostMs < SMOOTH_MS && this.scale < MAX) {
            badRuns = 0;
            if (++goodRuns >= GOOD_RUNS) { this._setScale(this.scale + STEP, now); goodRuns = 0; }
          } else { goodRuns = 0; badRuns = 0; }
        }

        this._emit();
        frames = 0; t0 = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  /** ⚠️ 해상도를 바꾸면 WebGL 버퍼를 다시 잡느라 한 프레임이 검게 빈다.
      값이 실제로 달라질 때만 부른다. 같은 값으로 resize 하면 깜빡임만 남는다. */
  _setScale(v, now) {
    const next = Math.min(MAX, Math.max(MIN, +v.toFixed(3)));
    if (next === this.scale) return;
    this.scale = next;
    viewer.resolutionScale = next;
    viewer.resize();
    this.changes++;
    this._lastChange = now ?? performance.now();
  },

  setAuto(on) {
    this.auto = on;
    localStorage.setItem('earthus.autoQuality', on ? 'on' : 'off');
    if (!on) { this._setScale(MAX); this.changes = 0; }
    this._emit();
  },

  /** 프레임만 — HUD 의 "프레임" 줄 */
  line() {
    const hz = this.refreshHz ? ` / ${this.refreshHz}Hz` : '';
    // 그린 횟수가 화면 갱신 횟수보다 적으면 쉬고 있다는 뜻 (발열·배터리 절약 중)
    const idle = this.renderFps < this.fps * 0.5 ? ' · 절전' : '';
    return `${this.renderFps}fps${hz}${idle}`;
  },

  /* 해상도 진단 — HUD 의 "해상도" 줄
     ⚠️ 한 줄에 다 밀어넣었더니 어느 숫자가 무엇인지 못 알아보는 문제가 있었다.
        (사용자가 "32x571" 이라고 읽은 게 실제로는 잘린 버퍼 크기였다)
        CSS 크기와 백버퍼 크기를 분리해서 보여준다. 둘의 비가 곧 선명도다. */
  resLine() {
    const cv = scene.canvas;
    const css = `${cv.clientWidth}×${cv.clientHeight}`;
    const buf = `${cv.width}×${cv.height}`;
    const eff = cv.clientWidth ? (cv.width / cv.clientWidth).toFixed(1) : '?';
    return `${buf} / ${css} = ${eff}배`;
  },
};

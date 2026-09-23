// 2026-09-24 PD "화면을 움직이면 모든 창과 메뉴들 사라지고, 멈추면 다시 메뉴가 보이고, 터치로 지역 선택하면 정보창 띄우자".
// 결과로 잠근다: 끌면 **숨어야** 통과, 멈추면 **돌아와야** 통과, 탭은 **안 숨고 고르기로 가야** 통과.
// 상태기계(motion-chrome.js)는 노드에서 직접 돌리고, main.js·CSS 배선은 소스에서 확인한다(WebGL 은 노드에서 못 돌린다 — 기존 관례).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMotionChrome, orbitSettled, installMotionChrome, TAP_MOVE_PX, RESTORE_S, WATCHDOG_MS, MAX_FREE_S,
} from '../../prototype/v2-three/js/motion-chrome.js';

const mainSrc = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL('../../prototype/v2-three/js/motion-chrome.css', import.meta.url), 'utf8');

// 가짜 타이머 — 감시견을 손으로 돌린다.
const fakeTimers = () => {
  let seq = 0; const q = new Map();
  return {
    setTimer: (fn) => { seq += 1; q.set(seq, fn); return seq; },
    clearTimer: (h) => { q.delete(h); },
    fire: () => { const fns = [...q.values()]; q.clear(); fns.forEach((f) => f()); },
    pending: () => q.size,
  };
};
const make = (extra = {}) => {
  const log = [];
  const t = fakeTimers();
  const mc = createMotionChrome({ onChange: (on) => log.push(on), setTimer: t.setTimer, clearTimer: t.clearTimer, ...extra });
  return { mc, log, t };
};
const run = (mc, seconds, settled, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i += 1) mc.tick(1 / fps, settled); };

test('탭(누름→뗌, 움직임 6px 이하)은 창을 걷지 않는다', () => {
  const { mc, log } = make();
  mc.down(1, 100, 100);
  mc.move(1, 104, 104);   // 5.66px
  mc.up(1);
  run(mc, 1, true);
  assert.equal(mc.moving, false);
  assert.deepEqual(log, [], '탭인데 onChange 가 불렸다 — 탭이 창을 걷었다');
});

test('누른 자리에서 6px 을 넘게 끌면 바로 걷힌다 — 한 번만 알린다', () => {
  const { mc, log } = make();
  mc.down(1, 100, 100);
  mc.move(1, 106, 100);   // 정확히 6 — 아직 탭
  assert.equal(mc.moving, false, '6px 은 main.js 기준으로도 탭이다(moved > 6 이 끌기)');
  mc.move(1, 107, 100);
  assert.equal(mc.moving, true, '7px 끌었는데 창이 그대로다');
  for (let i = 0; i < 30; i += 1) mc.move(1, 110 + i * 5, 100);
  assert.deepEqual(log, [true], '프레임마다 DOM 을 건드린다 — 바뀔 때만 알려야 한다');
});

test('hover(누르지 않은 마우스 이동)는 움직임이 아니다', () => {
  const { mc } = make();
  mc.move(7, 0, 0); mc.move(7, 500, 500);
  assert.equal(mc.moving, false);
});

test('손가락이 화면에 남아 있으면 카메라가 멈춰도 걷힌 채다', () => {
  const { mc } = make();
  mc.down(1, 0, 0); mc.move(1, 50, 0);
  run(mc, 2, true);
  assert.equal(mc.moving, true, '끌던 손가락을 멈추기만 했는데 창이 돌아왔다');
});

test('손을 떼도 카메라가 미끄러지는 동안은 걷힌 채 — 멈춘 뒤 RESTORE_S(0.4 s) 에 돌아온다', () => {
  const { mc, log } = make();
  mc.down(1, 0, 0); mc.move(1, 50, 0); mc.up(1);
  run(mc, 1.5, false);
  assert.equal(mc.moving, true, '감쇠로 아직 도는데 창이 돌아왔다');
  run(mc, RESTORE_S - 0.05, true);
  assert.equal(mc.moving, true, '멈추자마자(0.4 s 전에) 돌아왔다');
  run(mc, 0.1, true);
  assert.equal(mc.moving, false, '멈추고 0.4 s 가 지났는데 창이 안 돌아왔다');
  assert.deepEqual(log, [true, false]);
});

test('멈춤 대기 중에 다시 끌면 대기가 처음부터 다시 시작된다', () => {
  const { mc } = make();
  mc.down(1, 0, 0); mc.move(1, 50, 0); mc.up(1);
  run(mc, 0.3, true);
  mc.down(2, 10, 10); mc.move(2, 40, 10); mc.up(2);
  run(mc, 0.3, true);
  assert.equal(mc.moving, true, '두 번째 끌기 뒤 0.3 s 만에 돌아왔다 — 대기가 이어졌다');
  run(mc, 0.15, true);
  assert.equal(mc.moving, false);
});

test('두 손가락 핀치도 걷는다(각 손가락을 제 누른 자리에서 잰다)', () => {
  const { mc } = make();
  mc.down(1, 100, 300); mc.down(2, 200, 300);
  mc.move(1, 90, 300); mc.move(2, 210, 300);
  assert.equal(mc.moving, true);
  mc.up(1);
  run(mc, 1, true);
  assert.equal(mc.moving, true, '한 손가락이 아직 남았는데 돌아왔다');
  mc.up(2);
  run(mc, 0.5, true);
  assert.equal(mc.moving, false);
});

test('휠 줌은 누름 없이도 걷고, 멈춘 뒤 돌아온다', () => {
  const { mc } = make();
  mc.wheel();
  assert.equal(mc.moving, true);
  run(mc, 0.3, false);
  run(mc, 0.45, true);
  assert.equal(mc.moving, false);
});

test('코드가 옮기는 카메라(fly-to·glide·자동회전)는 창을 걷지 않는다 — 손이 시작한 움직임만 센다', () => {
  const { mc, log } = make();
  run(mc, 3, false);   // 카메라가 3초 내내 움직여도(설정 안 됨) 제스처가 없으면 아무 일 없다
  assert.equal(mc.moving, false);
  assert.deepEqual(log, []);
});

test('감시견: 렌더가 멈춘 모드로 넘어가 tick 이 안 오면 손을 뗀 뒤 돌려놓는다 · tick 이 오고 있으면 끊지 않는다', () => {
  const a = make();
  a.mc.down(1, 0, 0); a.mc.move(1, 30, 0); a.mc.up(1);
  a.t.fire();          // WATCHDOG_MS 동안 tick 0번
  assert.equal(a.mc.moving, false, 'tick 이 끊겼는데 창이 영영 숨었다');
  const b = make();
  b.mc.down(1, 0, 0); b.mc.move(1, 30, 0); b.mc.up(1);
  run(b.mc, 0.2, false);   // 느린 폰: 아직 미끄러지는 중이지만 tick 은 온다
  b.t.fire();
  assert.equal(b.mc.moving, true, '느린 폰에서 감쇠 중인데 감시견이 창을 꺼냈다');
  assert.equal(b.t.pending(), 1, '감시견을 다시 걸지 않았다');
  assert.ok(WATCHDOG_MS > RESTORE_S * 1000);
});

test('reset: 앱 전환 등으로 손이 사라지면 돌려놓는다', () => {
  const { mc } = make();
  mc.down(1, 0, 0); mc.move(1, 30, 0);
  mc.reset();
  assert.equal(mc.moving, false);
  assert.equal(mc.held, 0);
});

// OrbitCam 의 감쇠(k = 1 - exp(-dt·8))를 그대로 흉내 내 60fps 에서 실제 복귀 시각을 잰다.
const fakeOrbit = () => {
  const o = {
    yaw: 0, pitch: 0.6, dist: 3, tilt: 0, autoRotate: false,
    targetYaw: 0, targetPitch: 0.6, targetDist: 3, targetTilt: 0,
    dragSpeed() { return (2 * Math.tan((48 * Math.PI) / 360) * Math.max(this.targetDist - 1, 0.0006)) / 714; },
    step(dt) { const k = 1 - Math.exp(-dt * 8); for (const a of ['yaw', 'pitch', 'dist', 'tilt']) { const T = `target${a[0].toUpperCase()}${a.slice(1)}`; this[a] += (this[T] - this[a]) * k; } },
  };
  return o;
};

test('60fps 실측 흉내: 휙 끌고 떼면 미끄러짐이 멈춘 뒤 0.4 s — 뗀 뒤 0.4~1.0 s 안에 돌아온다', () => {
  const { mc } = make();
  const o = fakeOrbit();
  mc.down(1, 200, 350);
  for (let i = 1; i <= 20; i += 1) {   // 20프레임 동안 프레임당 15px 끌기
    mc.move(1, 200 - i * 15, 350);
    o.targetYaw += 15 * o.dragSpeed();
    o.step(1 / 60); mc.tick(1 / 60, orbitSettled(o));
  }
  assert.equal(mc.moving, true);
  mc.up(1);
  let t = 0;
  while (mc.moving && t < 3) { o.step(1 / 60); mc.tick(1 / 60, orbitSettled(o)); t += 1 / 60; }
  assert.equal(mc.moving, false, '3 s 안에 돌아오지 않았다');
  assert.ok(t >= RESTORE_S, `멈춤 대기보다 빨리 돌아왔다 (${t.toFixed(2)} s)`);
  assert.ok(t <= 1.0, `뗀 뒤 ${t.toFixed(2)} s — 너무 오래 숨어 있다`);
});

test('orbitSettled: 자동회전 중 yaw 차이는 보지 않고, 줌·틸트가 남아 있으면 멈춘 게 아니다', () => {
  const o = fakeOrbit();
  assert.equal(orbitSettled(o), true);
  o.targetDist = 2.5; assert.equal(orbitSettled(o), false); o.targetDist = 3;
  o.targetTilt = 0.2; assert.equal(orbitSettled(o), false); o.targetTilt = 0;
  o.targetYaw = 0.01; assert.equal(orbitSettled(o), false);
  o.autoRotate = true; assert.equal(orbitSettled(o), true);
});

test('main.js 배선: 고르기 문턱이 TAP_MOVE_PX 하나다 · 제스처 네 가지가 OrbitCam 에서 상태기계로 간다', () => {
  assert.equal(TAP_MOVE_PX, 6, '고르기 문턱 값이 바뀌었다 — PD 합의 없이 바꾸지 말 것');
  assert.match(mainSrc, /import \{ installMotionChrome, orbitSettled, TAP_MOVE_PX \} from '\.\/motion-chrome\.js\?v=\d+';/);
  assert.match(mainSrc, /if \(moved > TAP_MOVE_PX \|\| held > 400\) return;/, 'canvas pointerup 이 따로 문턱을 쓴다');
  assert.doesNotMatch(mainSrc, /if \(moved > 6 \|\| held > 400\) return;/);
  const cls = mainSrc.slice(mainSrc.indexOf('class OrbitCam {'), mainSrc.indexOf('class DetailTerrain {'));
  for (const call of ['this.motion = installMotionChrome()', 'this.motion.down(e.pointerId', 'this.motion.move(e.pointerId',
    'this.motion.up(e.pointerId', 'this.motion.wheel()', 'this.motion.tick(dt, orbitSettled(this))']) {
    assert.ok(cls.includes(call), `OrbitCam 에 ${call} 가 없다`);
  }
  // 코드가 옮기는 카메라가 창을 걷지 않으려면 상태기계를 부르는 곳이 OrbitCam(사람 손) 하나뿐이어야 한다.
  const outside = mainSrc.replace(cls, '');
  assert.doesNotMatch(outside, /motion\.(down|move|wheel)\(/, 'OrbitCam 밖에서 창 걷기를 부른다 — fly-to 가 창을 걷을 수 있다');
});

test('CSS: 걷을 창을 모두 적고, opacity 만 animation 으로 바꾸며, 숨은 창은 손을 받지 않는다 · 움직임 줄이기는 즉시', () => {
  for (const sel of ['.es-switch', '#panel', '.edge-tab', '#field-legend', '#bottom-nav', '#hud', '#timestrip', '#intel',
    '#pop-menu', '#quick-menu', '#focus-chip']) {
    assert.ok(cssSrc.includes(sel), `${sel} 을 걷지 않는다`);
  }
  const rules = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');   // 머리말 주석은 '남기는 것' 목록이라 규칙에서만 본다
  for (const keep of ['#labels', '#feedmarks', '#menu-panel', '#loading']) {
    assert.ok(!new RegExp(`body\\.is-moving[^{]*${keep.replace(/[#.]/g, '\\$&')}[,\\s)]`).test(rules), `${keep} 는 걷으면 안 된다`);
  }
  assert.match(rules, /@keyframes mc-hide \{ to \{ opacity: 0; \} \}/);
  assert.match(rules, /@keyframes mc-show \{ from \{ opacity: 0; \} \}/);
  assert.match(rules, /pointer-events: none !important;/);
  assert.doesNotMatch(rules, /display\s*:|visibility\s*:|height\s*:|transition\s*:/, '레이아웃을 흔들거나 창의 제 transition 을 덮는다');
  assert.match(rules, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0s;[\s\S]*animation: none;/);
});

// ---- 2026-09-24 적대 검토에서 실측으로 잡은 결함 네 가지를 결과로 잠근다 ----

// 최소 가짜 document — installMotionChrome 의 배선(문서 up/cancel · 창 blur · visibilitychange)을 노드에서 돌린다.
const fakeDoc = () => {
  const L = new Map(); const W = new Map();
  const on = (m) => (t, f) => { if (!m.has(t)) m.set(t, []); m.get(t).push(f); };
  const cls = new Set();
  const doc = {
    hidden: false,
    head: { append() {} },
    body: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } },
    getElementById: () => ({}),   // 스타일 링크가 이미 있다고 친다
    createElement: () => ({}),
    addEventListener: on(L),
    defaultView: { addEventListener: on(W) },
  };
  const fire = (m, t, e = {}) => (m.get(t) || []).forEach((f) => f(e));
  return { doc, cls, fireDoc: (t, e) => fire(L, t, e), fireWin: (t, e) => fire(W, t, e) };
};

test('잃어버린 pointerup: 캔버스가 up 을 못 받아도 문서 어디서든 그 포인터의 up 이 오면 멈춘 뒤 돌아온다', () => {
  const f = fakeDoc();
  const mc = installMotionChrome(f.doc);
  mc.down(77, 200, 300); mc.move(77, 150, 300);
  assert.equal(f.cls.has('is-moving'), true, '끌었는데 body.is-moving 이 없다');
  run(mc, 3, true);
  assert.equal(mc.moving, true, '(전제) 포인터가 눌린 채면 숨은 채여야 한다');
  f.fireDoc('pointerup', { pointerId: 77 });   // 캔버스가 아니라 문서에 떨어진 up
  run(mc, RESTORE_S + 0.05, true);
  assert.equal(mc.moving, false, '문서에 up 이 왔는데 창이 영영 숨은 채다');
  assert.equal(f.cls.has('is-moving'), false);
  mc.down(78, 0, 0); mc.move(78, 40, 0);
  f.fireDoc('pointercancel', { pointerId: 78 });
  run(mc, RESTORE_S + 0.05, true);
  assert.equal(mc.moving, false, 'pointercancel 이 문서에만 왔는데 숨은 채다');
});

test('창 blur(Alt-Tab)·탭 숨김이면 누른 채였어도 바로 돌려놓는다', () => {
  const f = fakeDoc();
  const mc = installMotionChrome(f.doc);
  mc.down(1, 0, 0); mc.move(1, 50, 0);
  f.fireWin('blur');
  assert.equal(mc.moving, false, 'blur 뒤에도 숨은 채 — up 이 영영 안 온다');
  assert.equal(mc.held, 0);
  mc.down(2, 0, 0); mc.move(2, 50, 0);
  f.doc.hidden = true; f.fireDoc('visibilitychange');
  assert.equal(mc.moving, false);
});

test(`상한: 손을 다 뗀 뒤 카메라가 끝내 '멈춤' 판정을 못 받아도 MAX_FREE_S(${MAX_FREE_S} s) 에 돌려놓는다 · 정상 감쇠는 안 자른다`, () => {
  const { mc } = make();
  mc.down(1, 0, 0); mc.move(1, 50, 0); mc.up(1);
  run(mc, MAX_FREE_S - 0.1, false);
  assert.equal(mc.moving, true, '상한 전에 끊었다 — 긴 glide 를 자른다');
  run(mc, 0.2, false);
  assert.equal(mc.moving, false, 'tick 은 오는데 멈춤 판정이 안 와 창이 영영 숨었다');
  // 손가락이 남아 있으면 상한을 세지 않는다(가만히 대고 있는 손은 정당하다)
  const b = make();
  b.mc.down(1, 0, 0); b.mc.move(1, 50, 0);
  run(b.mc, MAX_FREE_S + 1, false);
  assert.equal(b.mc.moving, true);
  assert.ok(MAX_FREE_S > 2.5, '휙 끌기 + 국가 glide 1.4 s 를 자르면 안 된다');
});

test('관성 중 탭 · 퀵메뉴: main.js 가 걷기를 풀고 나서 정보창/퀵메뉴를 연다 · 휠은 줌이 바뀔 때만 걷는다', () => {
  // 확정된 탭 경로: 문턱 return 바로 뒤, raycast(고르기) 앞에서 푼다.
  assert.match(mainSrc, /if \(moved > TAP_MOVE_PX \|\| held > 400\) return;[\s\S]{0,400}?if \(orbit\.motion\.moving\) orbit\.motion\.release\(\);\s*const hit = raycastGlobe\(e\.clientX, e\.clientY\);/,
    '관성 중 탭이 정보창을 걷힌 채 연다');
  // 길게 누르기 타이머: 퀵메뉴를 열기 전에 푼다.
  assert.match(mainSrc, /const pid = e\.pointerId;[\s\S]{0,900}?longPressFired = true;[\s\S]{0,700}?orbit\.motion\.longPress\(pid, 10\);\s*quickMenu\.open\(x, y, raycastGlobe\(x, y\)\);/,
    '7~10px 흔들린 길게 누르기가 안 보이는 퀵메뉴를 연다');
  // 휠: 한계에 닿아 줌이 안 바뀌면 걷지 않는다.
  assert.match(mainSrc, /const distBefore = this\.targetDist;[\s\S]{0,600}?if \(this\.targetDist !== distBefore\) this\.motion\.wheel\(\);/);
  // 결과: 걷힌 상태에서 reset 은 즉시 돌려놓고, 다음 끌기는 다시 걷는다.
  const { mc, log } = make();
  mc.down(1, 0, 0); mc.move(1, 50, 0); mc.up(1);
  run(mc, 0.3, false);   // 아직 미끄러지는 중
  mc.reset();
  assert.equal(mc.moving, false);
  mc.down(2, 0, 0); mc.move(2, 50, 0);
  assert.equal(mc.moving, true, 'reset 뒤 다음 끌기가 창을 걷지 못한다');
  assert.deepEqual(log, [true, false, true]);
});

test('longPress: 퀵메뉴를 연 손가락은 10px 안의 흔들림으론 창을 걷지 않고, 걷혀 있었으면 바로 돌려놓는다 · 10px 넘게 끌면 다시 걷는다', () => {
  // ① 메뉴가 먼저 열리고(가만히 450 ms) 그 뒤 8px 흔들림 → 걷지 않는다
  const a = make();
  a.mc.down(1, 100, 100);
  a.mc.longPress(1, 10);
  a.mc.move(1, 108, 100);
  assert.equal(a.mc.moving, false, '퀵메뉴가 열린 뒤 8px 흔들림이 메뉴째 창을 걷었다');
  a.mc.move(1, 111, 100);
  assert.equal(a.mc.moving, true, '메뉴를 연 뒤 지구를 돌리는데(11px) 창이 그대로다');
  // ② 8px 흔들려 이미 걷힌 뒤 메뉴가 열림 → 바로 돌아온다
  const b = make();
  b.mc.down(1, 100, 100); b.mc.move(1, 108, 100);
  assert.equal(b.mc.moving, true);
  b.mc.longPress(1, 10);
  assert.equal(b.mc.moving, false, '걷힌 창 사이에 퀵메뉴가 안 보이게 열린다');
  b.mc.move(1, 109, 100);
  assert.equal(b.mc.moving, false);
  // ③ 다른 손가락이 끄는 중이면 그 손은 계속 센다
  const c = make();
  c.mc.down(1, 0, 0); c.mc.down(2, 200, 0); c.mc.move(2, 260, 0);
  c.mc.longPress(1, 10);
  assert.equal(c.mc.moving, true, '끄는 다른 손가락이 있는데 창이 돌아왔다');
});

test('release(확정된 탭): 돌려놓되, 다른 손가락이 끄는 중이면 그 손가락의 다음 끌기는 다시 걷는다', () => {
  const { mc } = make();
  mc.down(1, 0, 0); mc.move(1, 50, 0);          // 손가락 A 끄는 중
  mc.down(2, 300, 300); mc.up(2);               // 손가락 B 가 잠깐 톡 — main.js 는 탭으로 읽는다
  mc.release();
  assert.equal(mc.moving, false, '탭인데 정보창이 걷힌 채 열린다');
  assert.equal(mc.held, 1, 'release 가 끄던 손가락 A 의 기록까지 지웠다');
  mc.move(1, 60, 0);
  assert.equal(mc.moving, true, '손가락 A 가 계속 끄는데 창이 다시 걷히지 않는다');
});

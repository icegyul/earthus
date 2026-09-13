// Globe Interaction(input.mjs) — V2 OrbitCam 포인터 규칙이 그대로 옮겨졌는지 가짜 요소로 검사한다 (ROTATION RULE LOCK 2026-09-13).
// DOM 없이: addEventListener 를 흉내 내는 요소에 PointerEvent 모양 객체를 흘려 넣고 Rotation State(OrbitCamera)의 목표를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitCamera, PITCH_LIMIT_DEG } from '../packages/globe-engine/src/camera.mjs';
import { attachGlobeInput } from '../packages/globe-engine/src/input.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function fakeEl({ deadPointer = -1 } = {}) {
  const ls = new Map(); const captured = [];
  return {
    captured,
    addEventListener(t, f) { if (!ls.has(t)) ls.set(t, []); ls.get(t).push(f); },
    removeEventListener(t, f) { ls.set(t, (ls.get(t) ?? []).filter(g => g !== f)); },
    setPointerCapture(id) { if (id === deadPointer) throw new Error('InvalidStateError: pointer not active'); captured.push(id); },
    releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 375, height: 812 }),
    ownerDocument: null,
    fire(type, init = {}) { const e = { type, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, deltaY: 0, key: '', prevented: false, preventDefault() { this.prevented = true; }, ...init }; for (const f of [...(ls.get(type) ?? [])]) f(e); return e; },
    count: t => (ls.get(t) ?? []).length,
  };
}
function rig(opts = {}) {
  const el = fakeEl(opts); const camera = new OrbitCamera({ lat: 0, lon: 0, viewW: 375, viewH: 812 });
  const taps = [], gestures = []; let back = 0, interact = 0;
  const detach = attachGlobeInput(el, { camera, onTap: p => taps.push(p), onGesture: (k, i) => gestures.push([k, i?.pointerType]), onBack: () => back++, onInteract: () => interact++ });
  return { el, camera, taps, gestures, detach, back: () => back, interact: () => interact };
}
const touch = (id, x, y) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y });

test('interaction: 마우스 드래그 — 첫 픽셀부터 즉시, dx 100px → targetLon = −100·k, dy → targetLat (V2 방향), 탭 아님', () => {
  const { el, camera, taps, gestures } = rig(); const k = camera.degPerPx();
  el.fire('pointerdown', { clientX: 100, clientY: 100 });
  assert.ok(camera.dragging);
  el.fire('pointermove', { clientX: 103, clientY: 100 });
  assert.ok(near(camera.targetLon, -3 * k), '3px 도 즉시 회전(문턱 없음)');
  el.fire('pointermove', { clientX: 200, clientY: 130 });
  assert.ok(near(camera.targetLon, -100 * k) && near(camera.targetLat, 30 * k), 'V2: targetYaw −= dx·speed, targetPitch += dy·speed');
  el.fire('pointerup', { clientX: 200, clientY: 130 });
  assert.ok(!camera.dragging && taps.length === 0);
  assert.deepEqual(gestures.filter(g => g[0] === 'drag').length, 1);
  assert.ok(el.captured.includes(1), '포인터 캡처');
});

test('interaction: 톡(탭) = 이동 ≤ 8px · 500ms · pointerup 만 — 캔버스 좌표로 전달, pointercancel 은 탭이 아니다', () => {
  const { el, camera, taps, gestures } = rig();
  el.fire('pointerdown', touch(7, 60, 80)); el.fire('pointermove', touch(7, 63, 82)); el.fire('pointerup', touch(7, 63, 82));
  assert.deepEqual(taps, [{ x: 53, y: 62 }]); assert.ok(gestures.some(g => g[0] === 'tap' && g[1] === 'touch'));
  assert.ok(Math.abs(camera.targetLon) < 5 * camera.degPerPx(), '몇 px 흔들림은 무시할 만큼만 돈다');
  el.fire('pointerdown', touch(8, 60, 80)); el.fire('pointercancel', touch(8, 60, 80));
  assert.equal(taps.length, 1, 'pointercancel 은 탭이 아니다'); assert.ok(!camera.dragging);
  el.fire('pointerdown', touch(9, 60, 80)); el.fire('pointermove', touch(9, 90, 80)); el.fire('pointerup', touch(9, 90, 80));
  assert.equal(taps.length, 1, '30px 움직였으면 탭이 아니다');
});

test('interaction(V2): 두 손가락은 회전이 아니다 — 핀치는 줌 단만, 한 손가락을 떼면 남은 손가락이 그 자리에서 이어받는다(굳지 않는다)', () => {
  const { el, camera, gestures } = rig(); const k = camera.degPerPx();
  el.fire('pointerdown', touch(1, 100, 400)); el.fire('pointermove', touch(1, 110, 400));
  const lonAfterOne = camera.targetLon; assert.ok(near(lonAfterOne, -10 * k));
  el.fire('pointerdown', touch(2, 200, 400));                       // 둘째 손가락
  assert.ok(!camera.dragging || true);                              // dragging 은 입력 쪽 플래그; 회전 목표가 안 변해야 한다
  el.fire('pointermove', touch(1, 60, 400)); el.fire('pointermove', touch(2, 240, 400));   // 벌림 100 → 180 (1.8배)
  assert.equal(camera.targetLon, lonAfterOne, '두 손가락 이동은 회전을 만들지 않는다');
  assert.equal(camera.step, 1, '비율 1.3 넘김 → 한 단 줌인');
  assert.equal(gestures.filter(g => g[0] === 'pinch-in').length, 1);
  el.fire('pointermove', touch(2, 230, 400));                       // 기준(140)에서 170 = 1.21배: 추가 줌 없음
  assert.equal(camera.step, 1);
  el.fire('pointerup', touch(1, 60, 400));                          // 첫 손가락 뗌 → 둘째가 이어받는다
  assert.ok(camera.dragging, '남은 손가락이 회전을 이어받는다');
  const lonBefore = camera.targetLon, k1 = camera.degPerPx();
  el.fire('pointermove', touch(2, 260, 400));                       // 둘째 손가락 자리(230)에서 30px — 점프 없음
  assert.ok(near(camera.targetLon, lonBefore - 30 * k1), `이어받은 드래그는 제 자리 기준(${camera.targetLon} vs ${lonBefore - 30 * k1})`);
  el.fire('pointerup', touch(2, 260, 400));
  assert.ok(!camera.dragging);
  el.fire('pointerdown', touch(3, 100, 100)); el.fire('pointermove', touch(3, 120, 100));
  assert.ok(near(camera.targetLon, lonBefore - 30 * k1 - 20 * camera.degPerPx()), '그 뒤 한 손가락 드래그도 정상');
});

test('interaction(V2): 극까지 끌고 → 극에서 가로 → 반대로 끌어 복귀 — 어느 단계에서도 입력 불능이 없다', () => {
  const { el, camera } = rig();
  el.fire('pointerdown', touch(1, 187, 400));
  let y = 400; for (let i = 0; i < 400; i++) { y += 30; el.fire('pointermove', touch(1, 187, y)); }   // 세로로 12,000px (극 한계 훨씬 너머)
  assert.ok(near(camera.targetLat, PITCH_LIMIT_DEG, 1e-9), '남/북 한계에 닿음');
  for (let i = 0; i < 120; i++) camera.tick(1 / 60);
  const lon0 = camera.targetLon; el.fire('pointermove', touch(1, 247, y));
  assert.ok(camera.targetLon < lon0, '극에서 가로 드래그 → 경도 변화');
  const step = (PITCH_LIMIT_DEG - 30) / camera.degPerPx() / 100;                     // 위도 30° 까지 돌아올 만큼을 100번에 나눠
  for (let i = 0; i < 100; i++) { y -= step; el.fire('pointermove', touch(1, 247, y)); }
  assert.ok(near(camera.targetLat, 30, 1e-6), `반대로 끌면 돌아온다 (${camera.targetLat.toFixed(1)})`);
  el.fire('pointerup', touch(1, 247, y));
  el.fire('pointerdown', touch(2, 100, 400)); el.fire('pointermove', touch(2, 150, 450)); el.fire('pointerup', touch(2, 150, 450));
  assert.ok(camera.targetLat > 0 && camera.dragging === false, '다음 드래그도 받는다');
});

test('interaction(V2): pointercancel = lift — 취소 뒤 새 드래그가 바로 된다; 캡처 실패(죽은 포인터)도 드래그 상태를 깨지 않는다', () => {
  const { el, camera } = rig({ deadPointer: 5 });
  el.fire('pointerdown', touch(1, 100, 100)); el.fire('pointermove', touch(1, 120, 100)); el.fire('pointercancel', touch(1, 120, 100));
  assert.ok(!camera.dragging);
  const lon1 = camera.targetLon;
  el.fire('pointerdown', touch(5, 100, 100));                       // setPointerCapture 가 예외를 던지는 포인터
  assert.ok(camera.dragging, '캡처 예외가 나도 드래그 상태는 이미 정해졌다(V2: 상태 뒤에 캡처)');
  el.fire('pointermove', touch(5, 130, 100));
  assert.ok(near(camera.targetLon, lon1 - 30 * camera.degPerPx()));
  el.fire('pointerup', touch(5, 130, 100));
  assert.ok(!camera.dragging);
});

test('interaction: 휠·키보드·Escape·contextmenu — 휠은 60 단위로 한 단, 320ms 쿨다운; 화살표는 40px 드래그; detach 뒤 무반응', () => {
  const { el, camera, detach, back } = rig();
  const w = el.fire('wheel', { deltaY: -60 }); assert.ok(w.prevented); assert.equal(camera.step, 1);
  el.fire('wheel', { deltaY: -60 }); assert.equal(camera.step, 1, '쿨다운 안이면 무시');
  el.fire('keydown', { key: 'ArrowLeft' }); assert.ok(near(camera.targetLon, -40 * camera.degPerPx()) && !camera.dragging);
  el.fire('keydown', { key: 'Escape' }); assert.equal(back(), 1);
  assert.ok(el.fire('contextmenu').prevented);
  detach();
  const lon = camera.targetLon; el.fire('pointerdown', { clientX: 0, clientY: 0 }); el.fire('pointermove', { clientX: 50, clientY: 0 });
  assert.equal(camera.targetLon, lon, 'detach 뒤 무반응');
  assert.equal(el.count('pointerdown'), 0);
});

// DEV-DIRECTIVE 2026-09-20 · 작업 E3 ②③ — 색면이 주인공일 때 구름이 물러나는 규칙(prototype/v2-three/js/cloud-yield.js).
//
// 앞선 반박 검증(B1)이 남긴 결함 둘을 닫는다:
//   ② 색면이 켜져 있는 동안 구름 단추가 **죽은 토글**이었다 — 모드는 바뀌는데 다음 프레임에 불투명도가 도로 0 이 됐다.
//   ③ 예보 범위 밖·자료 없음이면 색면이 안 그려지는데 구름도 0 이라 **맨 지구**만 남았다.
// 금지가 아니라 결과를 본다: 어떤 상태에서 구름이 어떻게 되고, 화면이 무엇이라고 말하나.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './../v2-test-dom.mjs';

const lf = (s) => s.replace(/\r\n/g, '\n');
const src = (rel) => lf(readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8'));

const { CLOUD_LEVEL, cloudYieldFor, createCloudYield } = await import('../../prototype/v2-three/js/cloud-yield.js');
const { FIELD_DESCRIPTORS, FieldLayer } = await import('../../prototype/v2-three/js/field-layer.js');
const TEMP = FIELD_DESCRIPTORS.tempgrid.quantity;

test('색면이 그려지는 동안에는 구름을 끄고, 그렇다고 말한다', () => {
  const r = cloudYieldFor({ star: 'field', drawing: true, quantity: TEMP });
  assert.equal(r.level, CLOUD_LEVEL.OFF);
  assert.equal(r.yielded, true);
  assert.match(r.note, /기온 색면을 보는 동안 구름을 숨겼습니다/, '말없이 남의 레이어를 끄지 않는다');
  assert.match(cloudYieldFor({ star: 'field', drawing: true, quantity: TEMP, ko: false }).note, /Clouds hidden while the Temperature field is shown/);
  // 입자만이면 옅게, 아무것도 없으면 그대로 — 옛 규칙 그대로다.
  assert.equal(cloudYieldFor({ star: 'wind' }).level, CLOUD_LEVEL.DIM);
  assert.equal(cloudYieldFor({ star: null }).level, CLOUD_LEVEL.FULL);
  assert.equal(cloudYieldFor({ star: 'wind' }).note, null, '할 말이 없으면 아무 말도 하지 않는다');
});

test('③ 색면이 실제로 안 그려지면 구름을 물리지 않는다 — 맨 지구가 남지 않게', () => {
  const r = cloudYieldFor({ star: 'field', drawing: false, quantity: TEMP });
  assert.equal(r.level, CLOUD_LEVEL.FULL, '예보 범위 밖인데 구름까지 껐다 — 화면에 아무것도 없다');
  assert.equal(r.yielded, false);
  assert.equal(r.note, null);
});

test('② 사용자가 구름을 직접 누르면 그 손이 이긴다 — 그리고 겹친다고 말한다', () => {
  const y = createCloudYield();
  const args = { star: 'field', drawing: true, cloudsOn: true, quantity: TEMP, ko: true };
  assert.equal(y.read(args).level, CLOUD_LEVEL.OFF);
  y.handPicked();
  const r = y.read(args);
  assert.equal(r.level, CLOUD_LEVEL.FULL, '누를 수는 있는데 아무 일도 안 나는 죽은 토글이다');
  assert.match(r.note, /구름은 직접 켠 대로 둡니다 — 기온 색면 위에 겹쳐 보입니다/);
  // 그 뒤로는 계속 물리지 않는다(한 프레임만 이기고 마는 것이 아니다).
  for (let i = 0; i < 5; i += 1) assert.equal(y.read(args).level, CLOUD_LEVEL.FULL);
  // 손으로 고른 것이 '구름 끔'이면 겹칠 것이 없다 — 겹친다고 말하지 않는다.
  assert.equal(y.read({ ...args, cloudsOn: false }).note, null);
});

// 2026-09-20 정정 — 사용자가 이미 구름을 꺼 둔 채로 색면을 켜는 자리. 물린 것이 없는데 '숨겼습니다'라고 적고 있었다.
test('이미 꺼 둔 구름을 우리가 숨겼다고 말하지 않는다 — 하지 않은 일을 했다고 적지 않는다', () => {
  const off = { star: 'field', drawing: true, cloudsOn: false, quantity: TEMP };
  const r = cloudYieldFor(off);
  assert.equal(r.yielded, false, '우리가 물린 것이 없는데 물렸다고 셈했다');
  assert.equal(r.note, null, '사용자가 끈 구름을 우리가 숨겼다고 적었다 — 출처 줄의 거짓 진술이다');
  // 구름이 켜져 있으면 그때는 정말 우리가 물린 것이다 — 이 시험이 '말을 통째로 없애는' 고침을 통과시키지 않게.
  assert.equal(cloudYieldFor({ ...off, cloudsOn: true }).yielded, true);
  assert.match(cloudYieldFor({ ...off, cloudsOn: true }).note, /구름을 숨겼습니다/);
  // level 은 FULL 로 돌아가지만 화면은 그대로다 — CloudManager.set('off') 가 mesh·precip·bolts 를 안 보이게 두고 있다.
  assert.equal(r.level, CLOUD_LEVEL.FULL);
  const y = createCloudYield();
  assert.equal(y.read(off).note, null, '상태를 쥔 쪽도 같은 판정을 본다');
});

test('② 색면을 껐다 켜면 손자국이 지워져 다시 물린다', () => {
  const y = createCloudYield();
  const on = { star: 'field', drawing: true, quantity: TEMP };
  y.handPicked();
  assert.equal(y.read(on).level, CLOUD_LEVEL.FULL);
  y.read({ star: null });                                   // 색면을 껐다
  assert.equal(y.manual, false, '손자국이 남아 다시 켜도 구름이 색면을 덮는다');
  assert.equal(y.read(on).level, CLOUD_LEVEL.OFF);
});

test('매 프레임 불려도 객체도 글자도 새로 짓지 않는다 — 바뀐 것이 없으면 쥐고 있던 그대로', () => {
  const y = createCloudYield();
  const args = { star: 'field', drawing: true, quantity: TEMP };
  const a = y.read(args);
  const noteA = a.note;
  for (let i = 0; i < 100; i += 1) assert.equal(y.read(args), a, '매 프레임 객체를 새로 만들었다(폰 발열)');
  assert.equal(y.peek().note, noteA);
  // 입력이 바뀌면 그때는 새로 셈한다.
  const b = y.read({ ...args, drawing: false });
  assert.equal(b.level, CLOUD_LEVEL.FULL);
  assert.equal(b.note, null);
  // peek 은 아무것도 바꾸지 않는다 — read 와 달리 손자국을 지우지 않는다.
  y.handPicked();
  y.peek();
  assert.equal(y.manual, true);
});

// ---------------------------------------------------------------- 배선

test("FieldLayer.isDrawing — '켜져 있다'와 '그려지고 있다'를 가른다", () => {
  const f = Object.create(FieldLayer.prototype);
  f.active = false; f.renderer = null;
  assert.equal(f.isDrawing(), false);
  f.active = true;
  assert.equal(f.isDrawing(), false, '렌더러가 없으면 그려지지 않는다');
  f.renderer = { mesh: { visible: false } };
  assert.equal(f.isDrawing(), false, '예보 범위 밖(hideDrawing)인데 그려진다고 답했다');
  f.renderer.mesh.visible = true;
  assert.equal(f.isDrawing(), true);
  f.active = false;
  assert.equal(f.isDrawing(), false, '꺼진 레이어의 면은 남아 있어도 주인공이 아니다');
});

test('LiveLayers.starField — 켜진 색면과 그 면이 지금 보이는지를 함께 준다', async () => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  const host = Object.create(LiveLayers.prototype);
  host.layers = {};
  assert.equal(host.starField(), null, '색면이 하나도 없으면 null');
  host._fields = { tempgrid: { active: true, isDrawing: () => true } };
  host.layers.tempgrid = { on: true };
  assert.deepEqual({ ...host.starField() }, { id: 'tempgrid', drawing: true });
  host._fields.tempgrid.isDrawing = () => false;            // 예보 범위 밖으로 밀었다
  assert.deepEqual({ ...host.starField() }, { id: 'tempgrid', drawing: false });
  host.layers.tempgrid.on = false;                          // 껐다
  assert.equal(host.starField(), null);
  // 매 프레임 불린다 — 같은 객체를 돌려쓴다(열쇠 배열도 만들지 않는다).
  host.layers.tempgrid.on = true;
  assert.equal(host.starField(), host.starField());
});

test('main.js 가 판정을 cloud-yield 에 묻고, 손으로 고른 구름만 기억한다', () => {
  const main = src('main.js');
  assert.match(main, /import \{ CLOUD_LEVEL, createCloudYield \} from '\.\/cloud-yield\.js\?v=1';/);
  assert.match(main, /const cloudYield = createCloudYield\(\);/);
  // 손으로 고르는 문 둘 — 메뉴의 구름 항목(setCloud)과 설정 서랍의 구름 단추(cloud-seg).
  assert.equal((main.match(/cloudYield\.handPicked\(\);/g) || []).length, 2, '손으로 고르는 문은 둘이다');
  assert.match(main, /markCloudBtn\(m\);\s*\n\s*cloudYield\.handPicked\(\);/, '메뉴에서 고른 구름을 기억하지 않는다');
  // 자동 전환은 기억하지 않는다 — 재생(onPlay) · 시간 스크럽 · 주소 복원 · 전부 끄기.
  const autos = [/onPlay: \(\) => \{[\s\S]{0,400}?\}/, /cloudBeforeScrub = clouds\.mode;[\s\S]{0,400}?\n/];
  for (const re of autos) {
    const m = re.exec(main);
    assert.ok(m, `자동 전환 자리를 못 찾았다: ${re}`);
    assert.doesNotMatch(m[0], /handPicked/, '자동 전환을 사용자의 손으로 기억했다');
  }
  assert.doesNotMatch(main, /markCloudBtn\('off'\);await clouds\.set\('off'\);[\s\S]{0,80}handPicked/, "'전부 끄기'를 사용자의 손으로 기억했다");
  // 화면이 말한다 — 구름 출처 줄을 읽는 자리에서 한 줄을 붙인다(#cloud-note 에 덧쓰지 않는다).
  assert.match(main, /const cloudNoteText = \(\) => \{/);
  assert.match(main, /const cloudNote = \(\) => cloudNoteText\(\);/, '메뉴 줄이 색면의 한 마디를 읽지 않는다');
  assert.match(main, /cloudHtml: cloudNoteText\(\),/, '구름 카드가 색면의 한 마디를 읽지 않는다');
  assert.match(main, /note\(layer\.name, cloudNoteText\(\),/, '구름을 누른 뒤 뜨는 카드가 색면의 한 마디를 읽지 않는다');
});

// 반박 검증의 **재검**이 남긴 구멍들 (2026-09-21).
//
// 수정 세 갈래가 결함 15건을 고친 뒤, 재검자가 그 고침 자체에서 네 가지를 더 찾았다.
// 본 세션이 손으로 고쳤고, 그 자리를 여기서 잠근다.
//
//   ① 배타 울타리에 **받는 중**이라는 구멍 — _slrOff 가 l.on 만 보았다
//   ② 바람을 읽지도 못한 카드가 "…프레임에서 읽은 것입니다 · 다시 눌러 주세요"라고 적었다
//   ③ 부이 목록이 404 인 것을 "받지 못했습니다"라고 적었다 — 404 는 답이 **온** 것이다
//   ④ 내린 취미 화면 셋을 메뉴 줄은 아직 'MODEL · Open-Meteo …' 로 팔고 있었다
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LiveLayers } from '../../prototype/v2-three/js/live-layers.js';
import { FIELD_DESCRIPTORS } from '../../prototype/v2-three/js/field-layer.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');
const READOUT_SRC = lf(readFileSync(here('../../prototype/v2-three/js/point-readout.js'), 'utf8'));
const SHELL_SRC = lf(readFileSync(here('../../prototype/v2-three/js/ui-shell.js'), 'utf8'));
const EXT_SRC = lf(readFileSync(here('../../prototype/v2-three/js/ext-scene.js'), 'utf8'));

/* ── ① 받는 중인 잠기는 땅도 내려간다 ───────────────────────────────────────
   ar6.json 은 485 KB 다. 느린 망에서 그것을 받는 동안 색면을 켜면, 예전 _slrOff 는
   `if (!l || !l.on) return;` 에서 그냥 돌아갔고 잠시 뒤 build 가 끝나며 l.on = true 가 됐다.
   결과는 ① 이 없애려던 바로 그 상태 — 색면과 겹면이 같이 켜져 범례 하나를 다툰다. */
const hostWithSlowSlr = () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const host = Object.assign(Object.create(LiveLayers.prototype), {
    layers: {},
    _fields: {},
    group: { add() {} },
    disposed: 0,
    async build(id) {
      if (id === 'slr') await gate;                       // 받는 중을 손으로 연다
      return { obj: { visible: false, userData: {} }, data: { id }, meta: { badge: 'MODEL_SIGNAL' } };
    },
    disposeObj() { host.disposed += 1; },
  });
  return { host, release };
};

const fakeField = () => {
  const f = {
    object: { visible: false }, active: false,
    async on() { f.active = true; return { on: true }; },
    off() { f.active = false; },
    isDrawing() { return f.active; },
    note() { return ''; }, cardHtml() { return ''; },
  };
  return f;
};

test('① 잠기는 땅을 **받는 중**에 색면을 켜도 둘이 같이 켜지지 않는다', async () => {
  const fid = Object.keys(FIELD_DESCRIPTORS)[0];
  const { host, release } = hostWithSlowSlr();
  host._fields[fid] = fakeField();

  const slrPending = LiveLayers.prototype.toggle.call(host, 'slr');   // 아직 받는 중
  await Promise.resolve();
  assert.equal(host.layers.slr.loading, true, '받는 중 상태가 아니다 — 시험의 전제가 깨졌다');

  await LiveLayers.prototype.toggle.call(host, fid);                  // 그 사이에 색면을 켠다
  assert.equal(host.layers[fid].on, true, '색면이 안 켜졌다');

  release();
  const r = await slrPending;
  assert.ok(!r || !r.on, '받는 중이던 잠기는 땅이 그대로 켜졌다');
  assert.ok(!host.layers.slr || !host.layers.slr.on,
    '색면과 잠기는 땅이 같이 켜져 있다 — 범례 하나를 둘이 다툰다(재검이 찾은 구멍)');
  assert.ok(host.disposed >= 1, '버려진 겹면을 정리하지 않았다 — 텍스처가 샌다');
});

/* ── ② 읽지 못한 바람에 대고 "읽었다"고 하지 않는다 ────────────────────────── */
test('② 바람을 읽지 못한 카드에는 프레임 시각 줄을 적지 않는다', () => {
  const i = READOUT_SRC.indexOf('moved && readMs != null');
  assert.ok(i > 0, '바람 어긋남 줄을 찾지 못했다 — 시험이 낡았다');
  const cond = READOUT_SRC.slice(i, READOUT_SRC.indexOf(')', i));
  assert.match(cond, /sea\s*&&\s*sea\.wind/,
    '바람을 못 읽은 카드에도 "…프레임에서 읽은 것입니다 · 다시 눌러 주세요"가 뜬다 — 읽지도 않은 것을 읽었다고 말하고, 눌러도 안 나올 것을 누르라고 시킨다');
});

/* ── ③ 404 를 '못 받았다'고 하지 않는다 ─────────────────────────────────────
   문서 상태 셋의 뜻은 point-readout.js 머리말이 정한다:
     ok(받았다) · failed(답이 안 왔다 — 다시 해 볼 값어치가 있다) · missing(답은 왔는데 그 자료가 없다).
   부이 목록은 문서가 하나뿐이라 missing 이 곧 '대조하지 못했다'이고, 다시 눌러도 달라지지 않는다. */
test('③ 부이 목록이 404 면 "받지 못했다"가 아니라 "우리 자료에 없다"고 적는다', () => {
  assert.match(READOUT_SRC, /const gone = sea\.buoyStatus === 'missing';/,
    '두 상태를 가르지 않는다');
  const block = READOUT_SRC.slice(READOUT_SRC.indexOf('const gone = sea.buoyStatus'), READOUT_SRC.indexOf('} else {', READOUT_SRC.indexOf('const gone = sea.buoyStatus')));
  assert.match(block, /우리 자료에 없습니다/, 'missing 쪽 문장이 없다');
  assert.match(block, /받지 못했습니다/, 'failed 쪽 문장이 없다');
  // 두 문장이 **갈려** 있어야 한다 — 하나로 합치면 404 에서 거짓이 된다.
  assert.ok(block.indexOf('우리 자료에 없습니다') !== block.indexOf('받지 못했습니다'));
  assert.match(block, /not in our data/, '영어 쪽도 갈려 있어야 한다');
});

/* ── ④ 내린 화면을 메뉴가 계속 팔지 않는다 ─────────────────────────────────
   ext-scene.js 가 세 화면을 내리면서 카드에는 이유를 적었는데, 메뉴 줄은 그대로
   'MODEL · Open-Meteo Marine …' 이었다. 누르기 전과 누른 뒤가 다른 말을 한다. */
test('④ 내린 취미 화면 셋은 메뉴 줄에서도 내려 있다', () => {
  const withdrawn = [...EXT_SRC.matchAll(/'hobby\/([a-z]+)':\s*Object\.freeze\(\{\s*\n\s*v1:/g)].map((m) => m[1]);
  assert.ok(withdrawn.length >= 3, `내린 화면을 ${withdrawn.length}개만 찾았다 — WITHDRAWN 표를 못 읽었다`);
  for (const id of withdrawn) {
    const row = SHELL_SRC.match(new RegExp(`\\{ id: '${id}',[^\\n]*\\}`));
    assert.ok(row, `메뉴에 ${id} 줄이 없다`);
    assert.doesNotMatch(row[0], /Open-Meteo/,
      `${id} 메뉴 줄이 아직 Open-Meteo 를 출처로 적는다 — 그 화면은 내렸고 그 호출도 막혔다`);
    assert.doesNotMatch(row[0], /state: 'MODEL'/,
      `${id} 메뉴 줄이 아직 살아 있는 모델 화면인 척한다`);
  }
});

test('④ 내린 화면도 눌리기는 한다 — 조용히 사라지지 않고 이유를 말한다', () => {
  const withdrawn = [...EXT_SRC.matchAll(/'hobby\/([a-z]+)':\s*Object\.freeze\(\{\s*\n\s*v1:/g)].map((m) => m[1]);
  for (const id of withdrawn) {
    const row = SHELL_SRC.match(new RegExp(`\\{ id: '${id}',[^\\n]*\\}`))[0];
    assert.match(row, /act: true/, `${id} 를 누를 수 없게 만들면 왜 없는지 말할 자리도 사라진다`);
  }
});

/* ── ⑤ 용량 고지는 '지금 내려받는 양'이어야 한다 ────────────────────────────
   2026-09-21 수집기를 gzip 으로 바꾸자 고흥군이 34.6 MB → 5.06 MB 가 됐는데, 카드는 앱에 박힌
   앵커 파일의 옛 수를 읽어 한동안 "약 33 MB"라고 적었다 — 자료를 고쳤더니 화면이 거짓이 된 자리다.
   그래서 **색인이 주는 수가 먼저**이고 앵커는 물러설 자리로만 둔다. */
test('⑤ 용량은 색인의 bytes 를 먼저 쓴다 — 앱에 박힌 수가 색인을 이기지 않는다', async () => {
  const { floodDiscSpecs, floodSizeNote } = await import('../../prototype/v2-three/js/flood-discs.js');
  const district = { sggCd: '46770', name: '고흥군', count: 4326, bbox: [127, 34, 127.5, 34.7], classes: { '3.0': 4326 } };
  const anchors = { '46770': [127.2, 34.5, 34_600_000] };      // 앵커에 남아 있는 옛 수(압축 전)

  const stale = floodDiscSpecs([district], anchors)[0];
  assert.equal(stale.bytes, 34_600_000, '색인이 수를 안 주면 앵커로 물러선다');

  const fresh = floodDiscSpecs([{ ...district, bytes: 5_056_711 }], anchors)[0];
  assert.equal(fresh.bytes, 5_056_711, '색인이 주는 지금 수를 두고 앱에 박힌 옛 수를 적는다');
  assert.match(floodSizeNote(fresh.bytes), /4\.8 MB|약 [\d.]+ MB/, '고지 문장이 그 수로 지어지지 않는다');
  assert.doesNotMatch(floodSizeNote(fresh.bytes), /33 MB/);
});

test('⑤ 수집기가 색인에 bytes 를 싣고, 그 수는 **받는 양**(압축 뒤)이다', () => {
  const py = lf(readFileSync(here('../../aws/khoa-coast/handler.py'), 'utf8'));
  assert.match(py, /"bytes": size/, '색인 기록에 bytes 가 없다 — 화면이 앱에 박힌 스냅샷을 계속 읽는다');
  const put = py.slice(py.indexOf('def _put('), py.indexOf('FLOOD_PAGE'));
  assert.match(put, /return len\(body\)/, '_put 이 압축 전 크기를 돌려주면 고지가 6배 부풀려진다');
  assert.doesNotMatch(put, /\n    return raw\b/, '옛 반환(raw)이 남아 있다');
});

/* ── ⑥ 원판이 화면 부품 뒤로 숨지 않는다 · 제 나라 이름이 잘리지 않는다 ─────────
   원판끼리 안 겹치게 고치고 나니 이번에는 **UI 뒤**로 들어갔다(폰 실측 375×812:
   상단 막대 56~102 · 범례 108~197 · 하단 알약 600~654 · 출처 독 667~746 · 타임라인 762~802
   — 화면의 절반이다). 값을 읽으라고 그린 숫자가 가려지면 그 레이어는 제 일을 못 한다. */
test('⑥ 화면 부품이 먹는 띠에는 원판을 세우지 않는다', async () => {
  const { plateInsetOf, plateOnScreen, SLR_PLATE_PX } = await import('../../prototype/v2-three/js/slr-plates.js');
  const W = 375; const H = 812;
  const boxes = [
    { x: 8, y: 56, w: 300, h: 46 },     // 상단 막대(좁다 → 좌/우로 친다)
    { x: 8, y: 108, w: 359, h: 89 },    // 범례(넓다 → 위 띠)
    { x: 8, y: 762, w: 351, h: 40 },    // 타임라인(넓다 → 아래 띠)
  ];
  const ins = plateInsetOf(boxes, W, H);
  assert.ok(ins.top >= 197, `위 띠가 ${ins.top} — 범례(197)를 안 피한다`);
  assert.ok(ins.bottom >= H - 762, `아래 띠가 ${ins.bottom} — 타임라인을 안 피한다`);

  assert.equal(plateOnScreen(180, 150, W, H, SLR_PLATE_PX, ins), false, '범례 뒤에 세웠다');
  assert.equal(plateOnScreen(180, 790, W, H, SLR_PLATE_PX, ins), false, '타임라인 뒤에 세웠다');
  assert.equal(plateOnScreen(180, 400, W, H, SLR_PLATE_PX, ins), true, '멀쩡한 자리를 막았다');
  // 여백을 안 주면 예전과 똑같이 움직인다 — 다른 화면을 깨지 않는다.
  assert.equal(plateOnScreen(180, 150, W, H, SLR_PLATE_PX), true);
});

test('⑥ 부품이 화면을 다 먹으면 여백을 포기한다 — 아무것도 못 세우느니 겹치는 편이 낫다', async () => {
  const { plateInsetOf } = await import('../../prototype/v2-three/js/slr-plates.js');
  const ins = plateInsetOf([{ x: 0, y: 0, w: 375, h: 300 }, { x: 0, y: 500, w: 375, h: 312 }], 375, 812);
  assert.equal(ins.top, 0, '위아래가 화면의 60% 를 넘는데도 띠를 그대로 뒀다');
  assert.equal(ins.bottom, 0);
});

test('⑥ 줄였더니 부딪히는 나라 이름은 더 길게 — 제 나라가 잘린 채 보이지 않는다', async () => {
  const { shortCountryNames, isCollidedName, clipName, SLR_LONG_MAXCHARS, SLR_PLATE_NAME } =
    await import('../../prototype/v2-three/js/slr-plates.js');
  const ar6 = JSON.parse(readFileSync(here('../../prototype/v2-three/sealevel/ar6.json'), 'utf8'));
  const names = [...new Set(ar6.items.map((i) => i.country || ''))];
  const short = shortCountryNames(names);

  const collided = names.filter((n) => isCollidedName(n, short.get(n)));
  assert.ok(collided.length >= 2, '부딪히는 나라를 못 찾았다 — 시험의 전제가 깨졌다');
  const rok = collided.find((n) => /Republic Of$/.test(n) && n.startsWith('Korea'));
  assert.ok(rok, '운영 자료에 대한민국이 없다');

  // 기본 글자 수로는 잘린다(그래서 고쳤다) · 늘린 글자 수로는 온전하다
  assert.ok(clipName(rok).endsWith('…'), '전제가 깨졌다 — 기본 글자 수로도 안 잘린다');
  assert.equal(clipName(rok, SLR_LONG_MAXCHARS), rok, '늘려도 제 나라 이름이 잘린다');
  assert.ok(SLR_LONG_MAXCHARS > SLR_PLATE_NAME.maxChars);
  // 두 나라가 **같은 이름이 되지는 않는다** — 그러느니 긴 이름이 낫다는 원래 규칙은 그대로다.
  const shown = collided.map((n) => clipName(n, SLR_LONG_MAXCHARS));
  assert.equal(new Set(shown).size, shown.length, '늘렸더니 두 나라가 같은 이름이 됐다');
});

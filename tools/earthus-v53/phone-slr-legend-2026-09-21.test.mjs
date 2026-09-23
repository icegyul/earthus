// 2026-09-21 — PD 가 **실기기 폭(375×812 · dpr 2)** 에서 잰 세 가지를 잠근다.
//
//   ① 원판이 서로 이름을 덮었다.  솎기는 지름의 1.18배짜리 **원**으로 쟀는데 화면에 그려지는 것은
//      이름표까지 합친 **네모**다. 폰에서 원판은 30.7 px 인데 `HANASAKI II` 이름표는 그 두 배가 넘는다 —
//      36 px 떨어진 두 원판이 "안 겹친다"는 셈을 통과하고 화면에서는 글자를 겹쳐 썼다.
//   ② 1,016곳 가운데 16곳만 섰다.  까닭은 솎기가 세서가 아니라 **상한이 늘 먼저 닿아서**였고(폰 판 10,200개
//      가운데 9,360개), 그 상한을 **화면 밖 후보**가 먹고 있었다(선 원판의 67.4%가 화면 완전 밖).
//   ③ 범례가 화면 위 116 px 을 먹고 풀이 줄이 잘렸다.  폰에서 접을 수 있게 하되 **숨기는 것은 풀이뿐**이다.
//
// 숫자는 전부 상수와 운영 자료에서 셈한다 — 기댓값을 박아 두지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  SLR_DISC_LIFT, createFloodOverlay, floodCardInner, floodNote, floodStations, slrLegendArgs, stationPoint,
  plateThinBody, plateThinCounts,
} from '../../prototype/v2-three/js/flood-overlay.js';
import {
  SLR_CAP_FRAC, SLR_MIN_OPACITY, SLR_PLATE_CAP, SLR_PLATE_NAME, SLR_PLATE_PX, SLR_PLATE_SCALE, SLR_SEP_FRAC,
  clipName, plateBoxPx, plateCapOf, plateDiscOffsetPx, plateNameWidth, plateOnScreen, plateOpacity, thinPlates,
} from '../../prototype/v2-three/js/slr-plates.js';
import { createFieldLegend, legendView } from '../../prototype/v2-three/js/field-legend.js';
import { FIELD_DESCRIPTORS } from '../../prototype/v2-three/js/field-layer.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { resetSharedLandMask } from '../../prototype/v2-three/js/land-mask.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');           // 이 워크트리는 CRLF 로 풀릴 수 있다
const read = (rel) => lf(readFileSync(here(rel), 'utf8'));
const AR6 = JSON.parse(read('../../prototype/v2-three/sealevel/ar6.json'));
const PLATES_SRC = read('../../prototype/v2-three/js/slr-plates.js');
const HTML = read('../../prototype/v2-three/index.html');

/** PD 가 잰 폰 — CSS px. dpr 2 는 텍스처만 두 배로 굽고 이 셈에는 끼지 않는다(sizeAttenuation:false 규약). */
const PHONE = Object.freeze({ w: 375, h: 812 });
const DESKTOP = Object.freeze({ w: 1440, h: 900 });
const platePxAt = (h) => SLR_PLATE_SCALE * h;

/* ════════════════════════════════════════════════════════════════════════════
   ① 솎기의 상자는 **화면에 그려지는 그 상자**다
   ════════════════════════════════════════════════════════════════════════════ */

test('① 이름표 폭을 굽는 쪽과 솎는 쪽이 한 함수로 잰다 — 두 벌이면 안 겹친다고 셈해 놓고 겹치게 세운다', () => {
  // 글자로 잠근다: plateTexture 가 제 손으로 재지 않고 plateNameWidth 를 부른다.
  const tex = PLATES_SRC.slice(PLATES_SRC.indexOf('export const plateTexture'));
  assert.ok(/plateNameWidth\(name\)/.test(tex.slice(0, 1200)),
    'plateTexture 가 이름 폭을 따로 잰다 — 솎기와 갈라지는 순간 ① 이 되돌아온다');
  assert.ok(!/probe\.measureText/.test(tex.slice(0, 1200)), '옛 probe 가 남아 있다(재는 곳이 둘이다)');
  // 폭은 글자 수를 따라간다. 짧은 이름은 원판 바닥(SLR_SEP_FRAC)에 걸린다.
  const floor = SLR_PLATE_PX * SLR_SEP_FRAC;
  assert.equal(plateBoxPx('A', SLR_PLATE_PX).w, floor, '짧은 이름이 원판보다 좁으면 바닥은 원판 간격이다');
  assert.ok(plateNameWidth('HANASAKI II') > plateNameWidth('TOBA'), '긴 이름이 더 넓다');
  assert.ok(plateBoxPx('HANASAKI II', SLR_PLATE_PX).w > floor, '긴 이름표가 원판보다 좁게 잡힌다');
  // 높이는 원판 + 이름줄. 이름이 없으면 이름줄 몫이 빠진다(굽는 쪽 nameH 와 같은 가름).
  assert.equal(plateBoxPx('', SLR_PLATE_PX).h, SLR_PLATE_PX);
  assert.equal(plateBoxPx('X', SLR_PLATE_PX).h, SLR_PLATE_PX * (1 + SLR_PLATE_NAME.heightFrac));
  // 화면이 작아지면 상자도 같은 비율로 작아진다 — 원판이 화면 높이에 매이기 때문이다.
  const k = platePxAt(PHONE.h) / SLR_PLATE_PX;
  assert.ok(Math.abs(plateBoxPx('HANASAKI II', platePxAt(PHONE.h)).w - plateBoxPx('HANASAKI II', SLR_PLATE_PX).w * k) < 1e-9);
});

test('① PD 가 짚은 그 쌍 — 옛 원 규칙은 통과하고 상자 규칙은 떨어진다(자리는 상수에서 셈한다)', () => {
  const platePx = platePxAt(PHONE.h);
  const sep = platePx * SLR_SEP_FRAC;
  // 운영 자료에 정말 있는 이름인가 — 이름을 지어내서 시험하지 않는다.
  const names = floodStations(AR6.items).map((s) => clipName(s.name || String(s.id)));
  const long = names.find((n) => plateBoxPx(n, platePx).w > sep * 1.5);
  assert.ok(long, `ar6.json 에 이름표가 옛 간격의 1.5배를 넘는 관측소가 없다 — 시험의 전제가 깨졌다`);
  const box = plateBoxPx(long, platePx);
  // 옛 규칙이 '안 겹친다'고 보던 자리: 원 간격보다 한 뼘 멀다. 상자로 보면 이름표가 겹친다.
  const dx = sep * 1.01;
  assert.ok(dx > sep, '전제: 옛 원 규칙은 이 자리를 통과시킨다');
  assert.ok(dx < box.w, '전제: 상자로 보면 이 자리는 이름표가 겹친다');
  const both = [{ x: 0, y: 0, ...box }, { x: dx, y: 0, ...box }];
  assert.equal(thinPlates(both, { sepPx: sep, cap: 99 }).shown.length, 1, '상자 규칙이 겹치는 쪽을 안 솎았다');
  // 상자를 안 주면 옛 원 규칙 그대로다(순수 시험이 그 길을 쓴다 — 되돌리지 않는다)
  const bare = [{ x: 0, y: 0 }, { x: dx, y: 0 }];
  assert.equal(thinPlates(bare, { sepPx: sep, cap: 99 }).shown.length, 2, '상자가 없으면 옛 길이어야 한다');
});

/* ════════════════════════════════════════════════════════════════════════════
   ② 화면 밖은 후보가 아니고, 상한은 화면 크기에서 나온다
   ════════════════════════════════════════════════════════════════════════════ */

test('② 화면 밖은 후보가 아니다 — 동그라미가 온전히 들어와야 하고, 이름줄 몫만큼 위에 있다', () => {
  const p = platePxAt(PHONE.h);
  const r = p / 2;
  const off = plateDiscOffsetPx(p);
  assert.ok(off < 0, '동그라미는 스프라이트 한가운데보다 **위**에 있다(텍스처가 위 동그라미 · 아래 이름줄)');
  assert.equal(off, -(p * SLR_PLATE_NAME.heightFrac) / 2);
  assert.ok(plateOnScreen(PHONE.w / 2, PHONE.h / 2, PHONE.w, PHONE.h, p), '한가운데가 화면 밖이라 한다');
  assert.ok(!plateOnScreen(PHONE.w + 1, PHONE.h / 2, PHONE.w, PHONE.h, p), '오른쪽 밖을 들인다');
  assert.ok(!plateOnScreen(PHONE.w / 2, -1, PHONE.w, PHONE.h, p), '위쪽 밖을 들인다');
  assert.ok(!plateOnScreen(r - 0.5, PHONE.h / 2, PHONE.w, PHONE.h, p), '왼쪽 가장자리에 반쯤 잘린 숫자를 세운다');
  // 이름줄 몫 — 동그라미가 위로 밀려 있으므로 위쪽 경계는 그만큼 더 안쪽이다
  assert.ok(!plateOnScreen(PHONE.w / 2, r, PHONE.w, PHONE.h, p), '이름줄 어긋남을 안 보고 위쪽을 재고 있다');
  assert.ok(plateOnScreen(PHONE.w / 2, r - off + 0.01, PHONE.w, PHONE.h, p), '어긋남만큼 내려오면 들어와야 한다');
  assert.ok(!plateOnScreen(NaN, 10, PHONE.w, PHONE.h, p) && !plateOnScreen(10, 10, 0, 0, p));
});

test('② 상한은 화면에서 셈한다 — 폭만 보던 16 은 812 짜리 세로를 못 봤다', () => {
  const box = (h) => platePxAt(h) * SLR_SEP_FRAC;
  const cells = (w, h) => Math.floor(w / box(h)) * Math.floor(h / box(h));
  // 식이 그대로인가(숫자를 박지 않는다)
  for (const v of [PHONE, DESKTOP, { w: 768, h: 1024 }]) {
    const want = Math.max(SLR_PLATE_CAP.phone,
      Math.min(SLR_PLATE_CAP.desktop, Math.floor(cells(v.w, v.h) * SLR_CAP_FRAC)));
    assert.equal(plateCapOf(v.w, v.h, platePxAt(v.h)), want, `${v.w}×${v.h}`);
  }
  // 데스크톱은 그대로 천장(40)에 있다 — 이 고침이 넓은 화면의 그림을 바꾸지 않는다
  assert.equal(plateCapOf(DESKTOP.w, DESKTOP.h, platePxAt(DESKTOP.h)), SLR_PLATE_CAP.desktop);
  // 폰은 옛 16 보다 커졌다. 그래야 화면 밖을 걸러 낸 자리에 볼 값어치가 있는 것이 들어온다.
  assert.ok(plateCapOf(PHONE.w, PHONE.h, platePxAt(PHONE.h)) > SLR_PLATE_CAP.phone,
    '폰 상한이 그대로다 — ② 의 절반만 고친 것이다');
  assert.equal(plateCapOf(0, 0, SLR_PLATE_PX), SLR_PLATE_CAP.phone, '화면을 모를 때도 바닥은 준다');
});

test('② 솎은 수가 사실이다 — 겹친 것과 자리가 모자란 것을 가르고, 화면 밖은 어느 쪽에도 안 넣는다', () => {
  const box = { w: 10, h: 10 };
  // 겹치는 하나 + 상한에 잘리는 하나
  const out = thinPlates([
    { x: 0, y: 0, ...box }, { x: 1, y: 0, ...box }, { x: 100, y: 0, ...box }, { x: 200, y: 0, ...box },
  ], { cap: 2 });
  assert.equal(out.shown.length, 2);
  assert.equal(out.clashed, 1);
  assert.equal(out.capped, 1);
  assert.equal(out.hidden, out.clashed + out.capped);
  // 화면이 적는 글 — 상한에 잘린 수를 '겹쳐'라 부르지 않는다
  assert.equal(plateThinBody({ clashed: 3, capped: 0 }), '겹쳐 3곳');
  assert.match(plateThinBody({ clashed: 3, capped: 5 }), /겹쳐 3곳 · 자리가 모자라 5곳/);
  assert.equal(plateThinBody({ clashed: 0, capped: 0 }), '');
  // 옛 model 처럼 hidden 하나만 오면 전부 겹침으로 읽는다(카드·범례의 순수 시험이 그 꼴을 쓴다)
  assert.deepEqual(plateThinCounts({ hidden: 7 }), { clashed: 7, capped: 0 });
  const m = {
    scenario: 'ssp585', year: '2100', stations: 1016, globalMedian: 0.7, plateMode: 'station', plateShown: 20,
    clashed: 3, capped: 5, hidden: 8, countries: 113, soloCountries: 40, top: [], korea: [], koreaCount: 0,
  };
  for (const s of [slrLegendArgs(m).source, floodNote(m), floodCardInner(m)]) {
    assert.ok(s.includes('자리가 모자라 5곳'), `'${s.slice(0, 80)}…' 가 상한에 잘린 수를 안 말한다`);
    assert.ok(!/겹쳐서? 8곳/.test(s), '겹치지 않은 것을 겹쳤다고 적는다');
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   끝에서 끝까지 — 폰 폭에서 지구를 돌려 본다
   ════════════════════════════════════════════════════════════════════════════ */

const fakeLand = () => ({
  load: () => Promise.resolve(null), texture: () => null, raster: () => null, landAt: () => 1, info: () => null,
});
const fakeTerrain = () => ({
  uHeightMap: { value: { isTexture: true } }, uHasHeight: { value: 1 }, uExagger: { value: 50 },
  uDetailMap: { value: null }, uDetailRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uHasDetail: { value: 0 }, uDetailAmt: { value: 0 },
});
/** 가짜 텍스처 — 캔버스가 없다. 크기는 **굽는 쪽과 같은 셈**으로 낸다(plateNameWidth). */
const fakeTexture = () => (shape) => {
  const S = 2;
  const D = SLR_PLATE_PX * S;
  const nameH = shape.name ? Math.round(SLR_PLATE_PX * SLR_PLATE_NAME.heightFrac) * S : 0;
  const w = shape.name ? (plateNameWidth(shape.name) + SLR_PLATE_NAME.padPx) * S : 0;
  return { tex: { isTexture: true, dispose() {}, shape }, w: Math.max(D, Math.ceil(w)) + 2 * S, h: D + nameH + 2 * S };
};
const camAt = (lat, lon, r, w, h) => {
  const cam = new THREE.PerspectiveCamera(48, w / h, 0.005, 200);   // main.js 의 시야각
  const eye = stationPoint(lat, lon, r);
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
};
const overlayAt = (view) => createFloodOverlay(AR6, {
  terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4),
  landMask: fakeLand(), legend: { show() {}, release() {} }, makeTexture: fakeTexture(),
  getViewport: (out) => { out.w = view.w; out.h = view.h; return out; },
  now: (() => { let t = 0; return () => (t += 10_000); })(),                // 늘 다시 솎게
});
/** 지구를 골고루 훑는 카메라들 — 고도 · 위도 · 경도. 같은 자료면 같은 판이라 되풀이할 수 있다. */
const sweep = function* () {
  for (let r = 1.1; r <= 3.2; r += 0.35) {
    for (let la = -60; la <= 60; la += 30) for (let lo = -180; lo < 180; lo += 45) yield [la, lo, r];
  }
};

test('끝에서 끝까지 — 폰에서 선 원판은 전부 화면 안이고, 서로 이름을 덮지 않는다', (t) => {
  t.after(() => resetSharedLandMask());
  const flood = overlayAt(PHONE);
  const platePx = platePxAt(PHONE.h);
  let views = 0;
  let plates = 0;
  let offScreen = 0;
  let overlaps = 0;
  for (const [la, lo, r] of sweep()) {
    flood.tick(camAt(la, lo, r, PHONE.w, PHONE.h));
    views += 1;
    const shown = flood.shownPlates();
    const shapes = flood.plates.lastShapes();
    assert.equal(shapes.length, shown.length, '그린 것과 고른 것의 수가 다르다');
    const boxes = shapes.map((s) => plateBoxPx(s.name, platePx));
    plates += shown.length;
    for (const c of shown) if (!plateOnScreen(c.x, c.y, PHONE.w, PHONE.h, platePx)) offScreen += 1;
    for (let i = 0; i < shown.length; i += 1) {
      for (let j = i + 1; j < shown.length; j += 1) {
        if (Math.abs(shown[i].x - shown[j].x) < (boxes[i].w + boxes[j].w) / 2
          && Math.abs(shown[i].y - shown[j].y) < (boxes[i].h + boxes[j].h) / 2) overlaps += 1;
      }
    }
  }
  assert.ok(views > 100 && plates > 100, `훑은 판 ${views} · 원판 ${plates} — 표본이 너무 적다`);
  assert.equal(offScreen, 0, `화면 밖에 선 원판 ${offScreen}장 — 상한을 먹고 아무것도 보여 주지 않는다`);
  assert.equal(overlaps, 0, `이름표가 겹치는 쌍 ${overlaps}개 — 값을 읽을 수 없다`);
  flood.dispose();
});

test('끝에서 끝까지 — 한국 연안이 화면에 있으면 한국 원판이 선다(억지로 끼우지 않고, 차례로)', (t) => {
  t.after(() => resetSharedLandMask());
  const KR = 'Korea, Republic Of';
  const stations = floodStations(AR6.items);
  const krIdx = stations.map((s, i) => (s.country === KR ? i : -1)).filter((i) => i >= 0);
  assert.ok(krIdx.length > 1, '자료에 한국 관측소가 없다');
  const flood = overlayAt(PHONE);
  const platePx = platePxAt(PHONE.h);
  const isKr = (c) => (c.kind === 'station' ? stations[c.station].country : c.group.country) === KR;
  let withKr = 0;
  let shownKr = 0;
  for (const [la, lo, r] of sweep()) {
    const cam = camAt(la, lo, r, PHONE.w, PHONE.h);
    flood.tick(cam);
    // 한국 관측소가 이 판에서 정말 그릴 수 있는 자리에 있나 — 앱이 쓰는 그 잣대(지평선 + 화면 안)로 센다
    const cm = cam.matrixWorld.elements;
    const vp = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements;
    const drawable = krIdx.some((i) => {
      const p = stationPoint(stations[i].lat, stations[i].lon, 1 + SLR_DISC_LIFT);
      if (plateOpacity(p[0], p[1], p[2], cm[12], cm[13], cm[14]) < SLR_MIN_OPACITY) return false;
      const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (!(w > 0)) return false;
      const x = (((vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12]) / w) * 0.5 + 0.5) * PHONE.w;
      const y = (0.5 - ((vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]) / w) * 0.5) * PHONE.h;
      return plateOnScreen(x, y, PHONE.w, PHONE.h, platePx);
    });
    if (!drawable) continue;
    withKr += 1;
    if (flood.shownPlates().some(isKr)) shownKr += 1;
  }
  assert.ok(withKr > 5, `한국이 화면에 있는 판이 ${withKr}개뿐이다 — 표본이 너무 적다`);
  // 나머지는 '나라 원판이 서는 자리(메도이드)가 화면 밖'인 판이다 — 자리를 옮기지 않는다는 규칙의 값이다.
  assert.ok(shownKr / withKr >= 0.85,
    `한국이 화면에 있는 판 ${withKr}개 중 한국 원판은 ${shownKr}개에만 섰다`);
  flood.dispose();
});

/* ════════════════════════════════════════════════════════════════════════════
   ③ 범례 — 폰에서 접히되, 숨는 것은 **풀이뿐**이다
   ════════════════════════════════════════════════════════════════════════════ */

/** index.html 의 범례 절 한 곳만 본다(규칙이 거기에만 있다는 것은 field-legend.test.mjs 가 잠근다). */
const legendCss = () => {
  const from = HTML.indexOf('/* ---------- 색면 범례');
  const to = HTML.indexOf('/* ---------- ', from + 10);
  assert.ok(from > 0 && to > from, 'index.html 에 범례 절이 없다');
  return HTML.slice(from, to);
};
/** field-legend.js 가 쓰는 것만 갖춘 가짜 문서(field-legend.test.mjs 와 같은 뼈대) + 그 문서로 지은 범례. */
const fakeLegendDoc = (getLang = () => 'ko') => {
  const doc = {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(), ownerDocument: doc, parentNode: null, children: [], attrs: {}, style: {},
        className: '', id: '', textContent: '', title: '', hidden: false,
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
        replaceChildren(...kids) { this.children = []; kids.forEach((k) => this.appendChild(k)); },
      };
    },
  };
  doc.body = doc.createElement('body');
  return { doc, legend: createFieldLegend({ doc, getLang, now: () => Date.parse('2026-09-21T00:00:00Z') }) };
};

/** 줄 높이 목록 + 줄 간격 + 안쪽 여백 + 테두리 = 상자 높이. 숫자를 박지 않고 CSS 에서 셈한다. */
const boxHeight = (rows, gap = 3, padTop = 8, padBottom = 7, border = 2) => rows.reduce((a, b) => a + b, 0)
  + Math.max(0, rows.length - 1) * gap + padTop + padBottom + border;
const rowsOf = (block) => {
  const m = /grid-template-rows: ([^;]+);/.exec(block);
  assert.ok(m, `grid-template-rows 가 없다: ${block.slice(0, 60)}`);
  return m[1].trim().split(/\s+/).map((x) => (x === 'auto' ? null : parseInt(x, 10)));
};

test('③ 폰에서 범례를 접을 수 있다 — 접으면 풀이 한 줄만 사라진다', () => {
  const css = legendCss();
  const phone = /@media \(max-width: 720px\) \{([\s\S]*?)\n {2}\}/.exec(css);
  assert.ok(phone, '폰 구간이 없다');
  const block = phone[1];
  // 접는 규칙이 폰 구간 **안에만** 있다 — 넓은 화면에서는 이름표가 아무 일도 하지 않는다
  assert.ok(/\.fl-collapsed/.test(block), '폰 구간에 접힘 규칙이 없다');
  // (2026-09-24 정정 · 위 한 줄) 세로 폰 덩어리(@media (max-width: 720px) and (orientation: portrait))도 범례 절 안에 있고 접힘 줄 높이를 다시 적는다 —
  //   그것도 폰 구간이다. 뜻('넓은 화면에는 접힘 규칙이 없다')은 그대로: 두 폰 덩어리 밖의 .fl-collapsed 는 0 개여야 한다.
  const portraitBlock = (/@media \(max-width: 720px\) and \(orientation: portrait\) \{([\s\S]*?)\n {2}\}/.exec(css) || [, ''])[1];
  assert.ok(portraitBlock, '범례 절에 세로 폰 덩어리가 없다');
  assert.ok(!/fl-collapsed[^{]*\{[^}]*display:\s*none/.test(portraitBlock), '세로 폰 덩어리가 접힘으로 무엇을 숨긴다 — 접어서 숨기는 것은 폰 구간의 풀이 하나뿐이다');
  assert.equal((css.match(/\.fl-collapsed/g) || []).length, (block.match(/\.fl-collapsed/g) || []).length + (portraitBlock.match(/\.fl-collapsed/g) || []).length,
    '접힘 규칙이 폰 구간 밖에도 있다 — 넓은 화면의 범례까지 접힌다');
  // 숨는 것은 풀이뿐이다. 띠·경계 숫자·단위·출처는 접어도 남는다.
  const hidden = [...block.matchAll(/#field-legend\.fl-collapsed ([^{]+)\{([^}]*)\}/g)]
    .filter(([, , body]) => /display:\s*none/.test(body))
    .map(([, sel]) => sel.trim());
  assert.deepEqual(hidden, ['.fl-note'],
    `접어서 숨기는 것이 ${hidden.join(' · ') || '없음'} 이다 — 숨겨도 되는 것은 설명문뿐이다`);
  for (const keep of ['.fl-meta', '.fl-bands', '.fl-ticks', '.fl-alt', '.fl-title']) {
    assert.ok(!new RegExp(`fl-collapsed[^{]*\\${keep}`).test(block), `${keep} 을 접어서 숨긴다 — 출처·눈금·단위는 늘 있어야 한다`);
  }
  // 단추가 폰에서만 보인다
  assert.match(css, /#field-legend \.fl-fold \{[^}]*display: none;/, '넓은 화면에도 단추가 있다');
  assert.match(css, /#field-legend \.fl-fold \{[^}]*pointer-events: auto;/, '상자가 pointer-events:none 이라 단추가 안 눌린다');
  assert.match(block, /#field-legend \.fl-fold \{ display: block; \}/, '폰에서 단추가 안 보인다');
  assert.match(css, /#field-legend \.fl-fold\[hidden\] \{ display: none; \}/,
    'display:block 이 [hidden] 을 이겨 풀이 없는 눈금에도 단추가 남는다');
});

test('③ 폰에서 범례가 차지하는 높이 — 접으면 줄어들고, 펴면 글이 더 이상 잘리지 않는다', () => {
  const css = legendCss();
  const base = /\n {2}#field-legend \{([^}]*)\}/.exec(css)[1];
  const phone = /@media \(max-width: 720px\) \{([\s\S]*?)\n {2}\}/.exec(css)[1];
  const baseRows = rowsOf(base);
  const before = boxHeight(baseRows);
  assert.match(base, new RegExp(`height: ${before}px;`), `기본 상자 높이가 줄 높이 합과 다르다(${before})`);

  const phoneBase = /#field-legend \{([^}]*)\}/.exec(phone)[1];
  assert.match(phoneBase, /height: auto;/, '폰에서 높이가 고정이면 풀이가 또 잘린다');
  const open = rowsOf(phoneBase);
  assert.equal(open.length, baseRows.length, '폰의 줄 수가 다르다');
  assert.equal(open[open.length - 1], null, '폰에서 풀이 줄이 auto 가 아니다 — 세 줄짜리 풀이가 다시 잘린다');
  const collapsedRows = rowsOf(/#field-legend\.fl-collapsed \{([^}]*)\}/.exec(phone)[1]);
  assert.equal(collapsedRows.length, baseRows.length - 1, '접힌 줄 수가 하나 줄지 않았다');
  assert.deepEqual(collapsedRows, baseRows.slice(0, -1), '접힘이 풀이 말고 다른 줄을 건드린다');
  const after = boxHeight(collapsedRows);
  assert.ok(after < before, `접어도 안 줄었다 (${before} → ${after})`);
  // 줄어든 만큼은 **풀이 줄 + 그 줄 간격**이다 — 다른 것을 숨겨서 번 자리가 아니다
  assert.equal(before - after, baseRows[baseRows.length - 1] + 3);
});

test('③ 색면 9종을 폰 폭에서 다 재 본다 — 접힘 높이가 9종 모두 같고, 출처 줄은 9종 모두 남는다', () => {
  const css = legendCss();
  const phone = /@media \(max-width: 720px\) \{([\s\S]*?)\n {2}\}/.exec(css)[1];
  const collapsed = boxHeight(rowsOf(/#field-legend\.fl-collapsed \{([^}]*)\}/.exec(phone)[1]));
  const ids = Object.keys(FIELD_DESCRIPTORS);
  const rows = [];
  for (const id of ids) {
    const v = legendView({
      scale: scaleOf(FIELD_DESCRIPTORS[id].scale || id), source: 'MODEL · GFS 0.5°',
      run: '2026-09-20T18:00:00Z', valid: '2026-09-21T00:00:00Z', now: '2026-09-21T01:00:00Z',
    });
    assert.ok(v && v.cells.length > 0, `${id} 에 칸이 없다`);
    assert.ok(v.meta.includes('MODEL · GFS 0.5°'), `${id} 의 범례가 출처를 안 적는다`);
    rows.push({ id, cells: v.cells.length, note: (v.note || '').length });
  }
  // 해수면도 같은 상자를 쓴다 — 여기서 깨지면 색면 9종이 같이 깨진다
  const slr = legendView(slrLegendArgs({ scenario: 'ssp585', year: '2100', clashed: 351, capped: 0 }));
  assert.ok(slr.cells.length > 0 && slr.meta.includes('2100'));
  rows.push({ id: 'slr', cells: slr.cells.length, note: (slr.note || '').length });
  assert.equal(rows.length, 9, `색면이 ${rows.length}종이다 — 9종이 아니다`);
  // 상자 높이는 칸 수·풀이 길이와 무관하다(칸은 폭을 나눠 갖고, 풀이는 접혀 있다)
  assert.ok(rows.some((r) => r.note > 0) && rows.some((r) => r.note === 0), '풀이가 있는 것과 없는 것이 섞여 있어야 시험이 뜻이 있다');
  assert.ok(collapsed > 0);
  // 풀이가 없는 눈금에서는 접는 단추도 없다 — 펼쳐도 아무것도 안 나오는 단추는 죽은 토글이다
  const { doc, legend } = fakeLegendDoc();
  const root = legend.mount(doc.body);
  const fold = () => root.children.find((c) => c.className === 'fl-fold');
  for (const id of ids) {
    const sc = scaleOf(FIELD_DESCRIPTORS[id].scale || id);
    legend.show({ scale: sc, source: 'MODEL · GFS 0.5°' });
    const has = !!(sc.legendNote && (sc.legendNote.ko || sc.legendNote.en));
    assert.equal(fold().hidden, !has, `${id}: 풀이 ${has ? '있는데 단추가 없다' : '없는데 단추가 있다'}`);
  }
});

test('③ 접는 단추 — 기본은 접힘이고, 누르면 뒤집히며, 읽어 주는 이름이 따라 바뀐다', () => {
  const langBox = { v: 'ko' };
  const { doc, legend } = fakeLegendDoc(() => langBox.v);
  const lang = langBox;                            // 아래에서 바꾼다
  const root = legend.mount(doc.body);
  legend.show({ scale: scaleOf('temp'), source: 'MODEL · GFS 0.5°' });
  const fold = root.children.find((c) => c.className === 'fl-fold');
  assert.ok(fold, '접는 단추가 없다');
  assert.equal(fold.tagName, 'BUTTON');
  assert.equal(fold.getAttribute('type'), 'button', '폼 안에 들어가면 제출 단추가 된다');
  assert.equal(legend.folded(), true, '폰 기본은 접힘이다');
  assert.ok(root.className.split(' ').includes('fl-collapsed'));
  assert.equal(fold.getAttribute('aria-expanded'), 'false');
  const shut = fold.getAttribute('aria-label');
  assert.ok(shut && shut.length > 0, '읽어 주는 이름이 없다 — 화살표 하나로는 무엇을 하는 단추인지 알 수 없다');

  fold.onclick({ preventDefault() {} });
  assert.equal(legend.folded(), false);
  assert.ok(!root.className.split(' ').includes('fl-collapsed'));
  assert.equal(fold.getAttribute('aria-expanded'), 'true');
  assert.notEqual(fold.getAttribute('aria-label'), shut, '펴도 이름이 그대로다');
  // 레이어를 바꿔도 펴 둔 상태가 유지된다 — 한 번 편 사람에게 매번 다시 펴게 하지 않는다
  legend.show({ scale: scaleOf('wind'), source: 'MODEL · GFS 0.5°' });
  assert.equal(legend.folded(), false, '레이어를 바꾸니 도로 접혔다');
  // 언어를 바꾸면 단추의 이름도 따라온다
  const ko = fold.getAttribute('aria-label');
  lang.v = 'en';
  legend.refresh();
  assert.notEqual(fold.getAttribute('aria-label'), ko, '언어를 바꿔도 단추 이름이 한국어 그대로다');
  legend.folded(true);
  assert.equal(fold.getAttribute('aria-expanded'), 'false');
});

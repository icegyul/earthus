// EARTHUS v2 — 지구 위의 H/L 기호 (DEV-DIRECTIVE 2026-09-20 · '### W1' 표의 기압 줄 · 작업 D1)
//
// 무엇이 없어 있었나: 기압(레이어 id 'presgrid')은 Open-Meteo 5°(한 칸 555 km) **한 시각**의 선형 램프였다
// (live-layers.js buildField · PRES_RAMP). 등압선도 H/L 도 없어서 '어디가 높나'만 보이고 '얼마나 급한가'를 볼 수 없었다.
// 중심을 찾는 순수 모듈(pressure-centers.js)은 4차 선행에서 합쳐졌지만 **화면에 이어져 있지 않았다.**
//
// 이 파일이 하는 일: 그 모듈의 결과를 지구 위의 글자로 세운다. 색면·등압선은 공용 부품이 그대로 그린다
// (field-layer.js descriptor → field-renderer.js 셰이더) — 여기서 하는 것은 기호뿐이다.
//   descriptor.symbols === 'pressureCenters' 이면 FieldLayer 가 이 층을 만들어 훅 하나로 부른다:
//     update(key, pxA, pxB, …)  키프레임(bracket 의 a·b)이 바뀔 때만. 두 프레임에서 각각 찾아 matchCenters 로 잇는다.
//     setMix(mix)               두 키프레임 사이. lerpCenter 만 돈다 — **사이에서는 찾지 않는다**(pressure-centers.js '시간').
//     tick(camera)              그리기 직전마다. 지평선 흐림 · 앞 반구 상한. 객체를 만들지 않는다.
//   기온·풍속 descriptor 에는 symbols 키가 없다 — 그 레이어에는 아무 영향이 없다.
//
// ── 고지대는 그리지 않는다 ──────────────────────────────────────────────────────────────────────────────────
//   해면 경정 기압은 고지대에서 땅 밑의 없는 공기 기둥을 셈해 넣은 값이다. 운영 프레임 실측(2026-09-20 반박 검증)에서
//   기본 출력 H 12개 중 8개가 그 가짜였다 — 남극고원 1060 이 늘 1등이었다. 그래서 지구본이 이미 가진 고도
//   (LiveLayers.heightAt = main.js heightAtJs · AWS Terrarium z4)로 가림판을 **한 번** 굽고 findPressureCenters 에 넘긴다.
//   · 가림판은 지형이 안 변하므로 한 번만 굽는다(720×361 = 26만 번 · 실측 18 ms). 지형이 아직 안 왔으면(ok=false)
//     **기호를 그리지 않고** 카드가 그 이유를 말한다 — 다음 키프레임에 다시 굽는다.
//   · 그 규칙을 카드에 한 줄로 말한다(highTerrainNote) — 화면에서 남극·티베트에 H 가 없는 것이 고장이 아니라 결정이다.
//
// ── 몇 개를 보이나 ──────────────────────────────────────────────────────────────────────────────────────────
//   모듈은 전지구에서 종류당 40개까지 준다(pressure-centers.js CENTER_MAX_PER_KIND — 12 로 자르면 한국 쪽 저기압이
//   남극해 저기압에게 자리를 뺏긴다). 개수로 거르는 일은 **카메라를 아는 여기**가 한다:
//     ① 두드러짐이 임계(등압선 간격 = 4 hPa · 닫힌 등압선이 하나는 있다는 뜻) 미만이면 그리지 않는다.
//     ② 앞 반구에 보이는 것만 센다(지평선 너머는 알파 0). 종류마다 데스크톱 8 · 폰 5.
//     ③ **히스테리시스** — 직전 키프레임에 보이던 중심이 상한 자리를 먼저 갖는다. 없으면 순위 8·9 를 오가는 중심에서
//        L 이 깜빡인다(운영 실측: 기본 설정에서 3시간 스텝마다 L 2.1개가 나타나거나 사라졌고 그 대부분이 순위 문제였다).
//
// 글자: 'H' · 'L' 아래에 중심 기압("L 985" 을 두 줄로). 단위는 적지 않는다 — 범례가 말한다.
//   색은 눈금표 한 장에서 온다(field-scales.js pressure.symbols) — 색을 이 파일에 다시 적지 않는다.
//   글자마다 텍스처 한 장을 돌려쓴다(live-layers.js 뉴스 네모칸 · field-labels.js 의 선례): 같은 'H 1024' 가 세 군데 서도 한 장이다.
//   깊이 검사는 끈다(스프라이트 판의 절반이 구면 안쪽으로 들어가 잘린다) — 대신 지평선에서 흐려지고 뒤편은 0 이다.
//
// 계산은 DOM·THREE 없는 순수 함수로 밖에 냈다(시험이 그대로 부른다). 캔버스는 주입받을 수 있다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { labelOpacity } from './field-labels.js?v=1';
import { isolineSpec } from './field-scales.js?v=1';
import {
  CENTER_MATCH_DEG_PER_HOUR, CENTER_MATCH_HPA_PER_HOUR, buildHighTerrainMask,
  findPressureCenters, formatCenter, lerpCenter, matchCenters,
} from './pressure-centers.js?v=1';

const D2R = Math.PI / 180;
const R_M = 6371000;

// 앞 반구에 한꺼번에 보이는 수의 상한(종류마다). 지시 기본값이다 — 화면에서 잰 값이 아니다.
export const SYMBOL_CAP = Object.freeze({
  desktop: Object.freeze({ H: 8, L: 8 }),
  phone: Object.freeze({ H: 5, L: 5 }),
});
// 기호 높이 — 화면 높이에 대한 비율(sizeAttenuation:false · 시야각 48°). 900px 화면에서 약 36px(글자 20 + 숫자 11).
// 등치선 숫자 라벨(field-labels FIELD_LABEL_SCALE 0.022)보다 크다 — 기호가 읽는 순서의 앞이다.
export const SYMBOL_SCALE = 0.040;
// 지형 위로 띄우는 높이(지구 반지름 단위). 등치선 라벨(0.003)과 같은 높이 — 둘이 서로를 뚫고 지나가지 않는다.
export const SYMBOL_LIFT = 0.003;
// 기호끼리의 최소 화면 간격은 두지 않는다 — 모듈이 이미 8° 로 솎는다(CENTER_MIN_SEPARATION_DEG).
// 두 프레임의 중심을 잇는 반경·기압 문턱은 스텝 간격(gapH)에 비례한다(pressure-centers.js 의 상수).
export const SYMBOL_RENDER_ORDER = 7;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** 'L 985' → { glyph:'L', num:'985' }. 눈금 끝에 눌린 값은 num 이 '≤870' 이다(formatCenter 의 규칙 그대로). */
export const centerLabel = (c) => {
  const s = formatCenter(c);
  if (!s) return null;
  const sp = s.indexOf(' ');
  return { glyph: s.slice(0, sp), num: s.slice(sp + 1) };
};

/** 텍스처 캐시의 열쇠 = 화면에 적히는 글자 그대로. 같은 글자면 텍스처 한 장이다. */
export const symbolKey = (c) => formatCenter(c);

/**
 * 그릴 기호 목록 — 짝지은 줄들을 mix 에서 읽고, 보일 만한 것만, 보이던 것부터.
 *   pairs   matchCenters 의 결과 · mix 0~1
 *   minProminence  이보다 두드러지지 않은 중심은 그리지 않는다(hPa)
 *   carry   직전 키프레임에 **보이던** 중심 객체의 Set — 그 줄이 상한 자리를 먼저 갖는다(히스테리시스)
 * → [{ kind, lat, lon, hPa, alpha, phase, nearest, carried }] 우선순위 순.
 * 두드러짐은 가까운 쪽 키프레임의 것을 본다(lerpCenter 의 nearest) — mix 0.5 에서 한 번 바뀐다.
 */
export const rankSymbols = (pairs, mix, { minProminence = 0, carry = null } = {}) => {
  const out = [];
  for (const pair of pairs || []) {
    const c = lerpCenter(pair, mix);
    if (!c) continue;
    // 임계는 두 키프레임 **어느 쪽이든** 넘으면 통과다. 한 프레임만 4.0 을 밑돌아 기호가 깜빡이지 않게 —
    // 짝이 있다는 것은 같은 중심이라는 뜻이다.
    const promA = pair.a ? pair.a.prominence : -Infinity;
    const promB = pair.b ? pair.b.prominence : -Infinity;
    if (Math.max(promA, promB) < minProminence) continue;
    c.carried = !!(carry && pair.a && carry.has(pair.a));
    c.prominence = c.nearest.prominence;
    out.push(c);
  }
  // 보이던 것 먼저 → 두드러진 것 먼저 → 북쪽 → 서쪽(난수 없는 순서).
  out.sort((a, b) => (Number(b.carried) - Number(a.carried))
    || (b.prominence - a.prominence) || (a.lat - b.lat) || (a.lon - b.lon));
  return out;
};

/** 카드에 적는 고지대 규칙 한 줄. 화면에 남극·티베트 H 가 없는 것이 고장이 아니라 결정임을 말한다. */
export const highTerrainNote = (ko = true, ready = true) => {
  if (!ready) {
    return ko
      ? 'H·L 기호는 지형 고도를 받은 뒤에 섭니다 — 고지대의 해면 경정을 가려야 가짜 고기압이 생기지 않습니다.'
      : 'H/L symbols wait for the terrain heights — without them, sea-level reduction invents highs over high ground.';
  }
  return ko
    ? '고도 1,500 m 이상(남극·그린란드·티베트·안데스)에는 기호를 세우지 않습니다 — 해면기압은 그곳에서 땅 밑의 없는 공기를 셈해 넣은 값입니다.'
    : 'No symbols above 1,500 m (Antarctica, Greenland, Tibet, the Andes) — sea-level pressure there extrapolates air that is not present.';
};

/**
 * 카드의 기호 줄(순수). btn 은 field-layer.js 의 단추 만들기 — 단추 모양을 두 곳에 적지 않으려고 받아 쓴다.
 *   m = { id, symbolName, symbolsOn, symbolReady, shown, ko }
 */
export const symbolCardRow = (m, btn) => {
  const ko = m.ko !== false;
  const name = m.symbolName || (ko ? '고·저기압 기호' : 'H/L centres');
  const count = m.symbolsOn && m.shown
    ? `<span style="opacity:.8"> · ${ko ? `앞 반구 H ${m.shown.H} · L ${m.shown.L}` : `front hemisphere H ${m.shown.H} · L ${m.shown.L}`}</span>`
    : '';
  return `<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px">${name} `
    + btn('field-symbols', `data-set="${m.symbolsOn ? 'off' : 'on'}"`, m.symbolsOn, m.symbolsOn ? (ko ? '켬' : 'On') : (ko ? '끔' : 'Off'))
    + `</span><span style="opacity:.8">${highTerrainNote(ko, m.symbolReady !== false)}${count}</span>`;
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  그리기
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

// 글자 한 장 — 'H' 위에 크게, 중심 기압 아래에 작게. 판 없이 색 글자 + 어두운 테두리(시안 01 의 라벨과 같은 문법).
// ⚠️ 한글 폰트를 지정한다 — 안 하면 안드로이드·윈도우에서 대체 폰트로 떨어진다(뉴스 네모칸의 교훈).
const canvasSymbolTexture = (glyph, num, color) => {
  const S = 2;
  const family = '"Noto Sans KR", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif';
  const glyphFont = `800 ${23 * S}px ${family}`;
  const numFont = `700 ${13 * S}px ${family}`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = glyphFont;
  const gw = probe.measureText(glyph).width;
  probe.font = numFont;
  const nw = probe.measureText(num).width;
  const pad = 5 * S;
  const c = document.createElement('canvas');
  c.width = Math.ceil(Math.max(gw, nw) + pad * 2);
  c.height = 42 * S;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  const line = (text, font, cy, fill) => {
    x.font = font;
    x.lineWidth = 3.4 * S;
    x.strokeStyle = 'rgba(8,12,18,0.90)';
    x.strokeText(text, c.width / 2, cy);
    x.fillStyle = fill;
    x.fillText(text, c.width / 2, cy);
  };
  line(glyph, glyphFont, 15 * S, color);
  line(num, numFont, 33 * S, '#ffffff');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, w: c.width, h: c.height };
};

/**
 * new FieldSymbols({ scale, decode, cap, heightAt, getExagger, makeTexture, minProminence })
 *   scale        field-scales.js 의 얼린 눈금 — 색(symbols)과 두드러짐 임계(등압선 간격)가 여기서 온다
 *   decode       매니페스트 fields.mslp.channels.R — 이 파일에 870 도 940 도 적지 않는다
 *   heightAt     (lat, lon) → m. 지구본의 고도 샘플러(main.js heightAtJs). 없으면 기호를 그리지 않는다
 *   makeTexture  (glyph, num, color) → { tex, w, h } — 시험이 캔버스 없이 부를 수 있게 주입받는다
 */
export class FieldSymbols {
  constructor({
    scale, decode = null, cap = SYMBOL_CAP.desktop, heightAt = null, getExagger = null,
    makeTexture = canvasSymbolTexture, minProminence = null, renderOrder = SYMBOL_RENDER_ORDER, lift = SYMBOL_LIFT,
  } = {}) {
    this.group = new THREE.Group();
    this.scale = scale;
    this.decode = decode;
    this.cap = cap;
    this.heightAt = heightAt;
    this.getExagger = getExagger;
    this.makeTexture = makeTexture;
    this.renderOrder = renderOrder;
    this.lift = lift;
    // 두드러짐 임계는 **눈금표에서 센다** — 등압선 간격을 바꾸면 같이 바뀐다(숫자를 박지 않는다).
    const iso = scale ? isolineSpec(scale) : null;
    this.minProminence = Number.isFinite(minProminence) ? minProminence : ((iso && iso.interval > 0) ? iso.interval : 4);
    this.colors = (scale && scale.symbols) || { H: '#ffffff', L: '#ffffff' };
    this.enabled = true;
    this.textures = new Map();      // 'L 985' → { tex, w, h }
    this.pool = [];
    this.count = 0;
    this.unit = new Float32Array(0);  // 기호마다 [ux, uy, uz, 고도 m]
    this.list = [];                   // 지금 그리는 기호(rankSymbols 의 결과)
    this.pairs = [];
    this.byHour = new Map();          // 프레임 시각(h) → 중심 목록. 같은 장은 같은 결과다
    this.key = null;
    this.mask = null;
    this.maskTried = false;
    this.maskInfo = null;
    this.maskError = null;          // 고도를 읽다 던졌다(교차 출처로 더럽혀진 캔버스 등) — 기호만 없고 색면은 산다
    this.findError = null;
    this.carry = new Set();           // 직전 키프레임에 **보이던** 중심 객체
    this.visible = false;
    this.shown = { H: 0, L: 0 };
    this.finds = 0;                   // 프레임에서 중심을 찾은 횟수(시험·콘솔 확인용)
    this.builds = 0;                  // 키프레임이 바뀌어 다시 이은 횟수
    this.lastExagger = NaN;
    this.mix = 0;
  }

  get object() { return this.group; }

  /** 지형 고도를 못 받았으면 false — 카드가 그 사실을 말하고 기호를 그리지 않는다. */
  get ready() { return !!this.mask; }

  // 가림판은 한 번만 굽는다. 지형이 아직 안 왔으면(heightAtJs 가 어디서나 0) 다음 키프레임에 다시 해 본다.
  // ⚠️ heightAtJs 는 첫 호출에서 4096×4096 캔버스를 통째로 읽는다 — 타일이 교차 출처로 더럽혀졌으면 getImageData 가 던진다.
  //    기호는 색면의 덤이다: 던지면 기호만 없고 색면·등압선은 그대로 살아야 한다(아래 update 의 try 와 한 쌍).
  ensureMask(w, h, grid) {
    if (this.mask || typeof this.heightAt !== 'function') return this.mask;
    let built = null;
    try {
      built = buildHighTerrainMask({ w, h }, this.heightAt, { grid });
    } catch (e) {
      this.maskError = String((e && e.message) || e);
      this.maskInfo = { high: 0, known: 0, cells: w * h, ok: false };
      return null;
    }
    this.maskTried = true;
    this.maskInfo = { high: built.high, known: built.known, cells: built.cells, ok: built.ok };
    if (built.ok) this.mask = built.mask;
    return this.mask;
  }

  centersFor(hour, px, grid) {
    let list = this.byHour.get(hour);
    if (list) return list;
    this.finds += 1;
    list = findPressureCenters({ w: px.w, h: px.h, data: px.data, channels: px.channels },
      this.decode, { highMask: this.mask, grid });
    this.byHour.set(hour, list);
    // 키프레임 앞뒤 몇 장만 쥔다 — 41장을 다 쥐면 폰에서 배열 수십 개가 남는다.
    if (this.byHour.size > 6) this.byHour.delete(this.byHour.keys().next().value);
    return list;
  }

  /**
   * 키프레임이 바뀌었다 — 두 프레임에서 각각 찾아 잇는다. key 가 같으면 **아무것도 하지 않는다.**
   *   px      { w, h, channels, data } 두 장(b 가 없으면 a 하나) · grid  fieldSpec(id).grid · gapH  두 프레임의 간격(시간)
   */
  update(key, pxA, pxB, { grid, hourA, hourB, gapH = 3 } = {}) {
    if (key === this.key) return false;
    this.key = key;
    this.builds += 1;
    if (!pxA || !this.decode) { this.setSymbols([]); return true; }
    if (!this.ensureMask(pxA.w, pxA.h, grid)) { this.setSymbols([]); return true; }
    // 기호는 색면의 덤이다 — 여기서 무엇이 잘못돼도 색면과 등압선은 그대로 있어야 한다.
    // (매니페스트가 전지구가 아닌 격자를 말하면 findPressureCenters 가 던진다 · 디코드 상수가 낯선 꼴이어도 던진다.)
    try {
      const a = this.centersFor(hourA, pxA, grid);
      const b = (pxB && hourB !== hourA) ? this.centersFor(hourB, pxB, grid) : a;
      const g = gapH > 0 ? gapH : 3;
      this.pairs = matchCenters(a, b, g * CENTER_MATCH_DEG_PER_HOUR, g * CENTER_MATCH_HPA_PER_HOUR);
      this.place(this.mix, true);
    } catch (e) {
      this.findError = String((e && e.message) || e);
      this.pairs = [];
      this.setSymbols([]);
    }
    return true;
  }

  /** 두 키프레임 사이. 찾지 않는다 — 대권을 따라 옮기고 글자는 가까운 쪽 키프레임의 것이다. */
  setMix(mix) {
    const m = Math.max(0, Math.min(1, Number(mix) || 0));
    if (m === this.mix && this.count) return;
    this.mix = m;
    this.place(m, false);
  }

  place(mix, fresh) {
    if (fresh) this.carry = new Set(this.visibleCenters());
    this.setSymbols(rankSymbols(this.pairs, mix, { minProminence: this.minProminence, carry: this.carry }));
  }

  visibleCenters() {
    const out = [];
    for (let i = 0; i < this.count; i += 1) {
      if (this.pool[i].material.opacity > 0 && this.list[i]) out.push(this.list[i].nearest);
    }
    return out;
  }

  textureFor(c) {
    const key = symbolKey(c);
    let e = this.textures.get(key);
    if (!e) {
      const lab = centerLabel(c);
      e = this.makeTexture(lab.glyph, lab.num, this.colors[c.kind] || '#ffffff');
      this.textures.set(key, e);
    }
    return e;
  }

  setSymbols(list) {
    const n = list.length;
    if (this.unit.length < n * 4) this.unit = new Float32Array(n * 4);
    while (this.pool.length < n) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0,
      }));
      spr.renderOrder = this.renderOrder;
      spr.frustumCulled = false;          // 절단 판정은 판 크기를 모른다(고정 화면 크기) — 많아야 수십 개다
      spr.visible = false;
      this.group.add(spr);
      this.pool.push(spr);
    }
    for (let i = 0; i < n; i += 1) {
      const c = list[i];
      const la = c.lat * D2R;
      const lo = c.lon * D2R;
      const cl = Math.cos(la);
      this.unit[i * 4] = cl * Math.sin(lo);
      this.unit[i * 4 + 1] = Math.sin(la);
      this.unit[i * 4 + 2] = cl * Math.cos(lo);
      this.unit[i * 4 + 3] = this.heightAt ? Math.max(0, Number(this.heightAt(c.lat, c.lon)) || 0) : 0;
      const t = this.textureFor(c);
      const spr = this.pool[i];
      spr.material.map = t.tex;
      spr.material.needsUpdate = true;
      spr.material.opacity = 0;           // 첫 tick 이 정한다 — 그 전에는 지구 뒤편 것이 비치지 않게
      spr.scale.set((t.w / t.h) * SYMBOL_SCALE, SYMBOL_SCALE, 1);
      spr.userData.fieldSymbol = c;
      spr.visible = true;
    }
    for (let i = n; i < this.pool.length; i += 1) { this.pool[i].visible = false; this.pool[i].material.opacity = 0; }
    this.list = list;
    this.count = n;
    this.lastExagger = NaN;
    this.shown = { H: 0, L: 0 };
    this.placeRadius();
  }

  // 지형 과장에 맞춰 반지름을 다시 준다. 과장이 그대로면 아무것도 하지 않는다.
  placeRadius() {
    const ex = this.getExagger ? Number(this.getExagger()) || 0 : 0;
    if (ex === this.lastExagger) return;
    this.lastExagger = ex;
    for (let i = 0; i < this.count; i += 1) {
      const r = 1 + (this.unit[i * 4 + 3] / R_M) * ex + this.lift;
      this.pool[i].position.set(this.unit[i * 4] * r, this.unit[i * 4 + 1] * r, this.unit[i * 4 + 2] * r);
    }
  }

  /** 그리기 직전마다. 지평선 흐림 + 앞 반구 상한(종류마다). 객체를 만들지 않는다. → 보인 수 */
  tick(camera) {
    if (!this.count || !camera) return 0;
    this.placeRadius();
    const m = camera.matrixWorld.elements;
    const cx = m[12];
    const cy = m[13];
    const cz = m[14];
    let nH = 0;
    let nL = 0;
    for (let i = 0; i < this.count; i += 1) {
      const spr = this.pool[i];
      const p = spr.position;
      let a = labelOpacity(p.x, p.y, p.z, cx, cy, cz) * (this.list[i].alpha ?? 1);
      // 우선순위 순으로 앞에서부터 센다 — 상한을 넘는 것은 흐리지 않고 끈다(같은 기호가 늘 같은 순서라 깜빡이지 않는다).
      const isH = this.list[i].kind === 'H';
      if (a > 0 && (isH ? nH : nL) >= (isH ? this.cap.H : this.cap.L)) a = 0;
      if (a > 0) { if (isH) nH += 1; else nL += 1; }
      spr.material.opacity = a;
    }
    this.shown = { H: nH, L: nL };
    return nH + nL;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.group.visible = this.visible && this.enabled;
  }

  setVisible(v) {
    this.visible = !!v;
    this.group.visible = this.visible && this.enabled;
  }

  /** 카드·콘솔이 읽는 지금 상태. __earthusLive._fields.presgrid.symbols.state() */
  state() {
    return {
      enabled: this.enabled, visible: this.group.visible, ready: this.ready, mask: this.maskInfo,
      maskError: this.maskError, findError: this.findError,
      symbols: this.count, shown: { ...this.shown }, textures: this.textures.size,
      finds: this.finds, builds: this.builds, mix: this.mix,
    };
  }

  clear() {
    for (const spr of this.pool) { spr.visible = false; spr.material.opacity = 0; }
    this.count = 0;
    this.list = [];
    this.pairs = [];
    this.key = null;
    this.carry = new Set();
    this.shown = { H: 0, L: 0 };
    this.group.visible = false;
    this.visible = false;
  }

  dispose() {
    this.clear();
    for (const spr of this.pool) { this.group.remove(spr); spr.material.dispose(); }
    this.pool.length = 0;
    for (const e of this.textures.values()) if (e.tex && e.tex.dispose) e.tex.dispose();
    this.textures.clear();
    this.byHour.clear();
    this.mask = null;
  }
}

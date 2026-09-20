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
//   · ⚠️ 문턱은 둘이다(2026-09-20 2차 반박 검증): 1,500 m 만으로는 서남극·그린란드 빙상(790~1,430 m)이 남아
//     운영 41장에서 hPa 983~1005 짜리 파란 H 가 빙상 위에 40여 개 섰다 — 색면이 '저기압'으로 칠한 띠 위에서다.
//     |위도| ≥ 60° 에서만 문턱이 600 m 로 내려간다(pressure-centers.js POLAR_TERRAIN_M · 그 파일의 '왜 문턱이 둘인가').
//     카드 글은 그 두 숫자를 **상수에서 세어** 적는다 — 카드가 화면과 다른 말을 하던 것이 이 결함이었다.
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
// ── 쥐고 있는 중심은 **그 그림의 것**이다 (2026-09-20 반박 검증) ────────────────────────────────────────────
//   처음에는 찾은 결과를 예보 시각 h(0·3·…·120)로 쥐었다. h 는 **런마다 다시 쓰이는 번호**다 —
//   매니페스트를 30분마다 다시 읽어 00Z 가 06Z 로 갈리면(gfs-frames onSwap) 같은 h 의 그림이 통째로 바뀌는데
//   그 번호로 물으면 옛 런에서 찾은 중심이 그대로 나온다. 실측 재현: 75|78 을 본 뒤 런이 갈리면
//   'L 940 @(−62,107)' 이 남고 참값은 'L 935 @(−62,66.5)' 이었다(수천 km 떨어진 자리에 기호가 선다).
//   디코드 눈금이 바뀌어도(0.5/940 → 1/870 은 실제로 한 번 있었다) 옛 눈금으로 푼 숫자가 그대로 남았다.
//   그래서 **그림 객체 자체**를 열쇠로 쥔다(WeakMap): 같은 장이면 같은 결과이고, 런이 갈리면 저장소가
//   새 객체를 주므로 저절로 다시 찾는다. 몇 장을 쥘지 세지 않아도 프레임 저장소가 그 장을 버리면 같이 사라진다.
//   눈금(decode)이 바뀌면 숫자가 달라지므로 쥔 것을 전부 버리고 key 도 버린다 — 다음 update 가 같은 '75|78' 을
//   들고 와도 다시 찾는다(런이 갈릴 때 FieldLayer 는 제 key 만 비우고 같은 글자를 다시 보낸다).
//
// 계산은 DOM·THREE 없는 순수 함수로 밖에 냈다(시험이 그대로 부른다). 캔버스는 주입받을 수 있다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { labelOpacity } from './field-labels.js?v=1';
import { isolineSpec } from './field-scales.js?v=1';
import {
  CENTER_MATCH_DEG_PER_HOUR, CENTER_MATCH_HPA_PER_HOUR, HIGH_TERRAIN_M, POLAR_TERRAIN_M, buildHighTerrainMask,
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
    // ⚠️ 짝의 **양쪽**을 묻는다. 직전에 보이던 중심 객체는 그때 가까웠던 키프레임의 것이라(lerpCenter 의 nearest),
    //    앞으로 밀 때는 b 쪽 · 되감을 때는 a 쪽에 있다. 한쪽만 물으면 히스테리시스가 한 방향에서만 선다.
    c.carried = !!(carry && ((pair.a && carry.has(pair.a)) || (pair.b && carry.has(pair.b))));
    c.prominence = c.nearest.prominence;
    c.pair = pair;                 // 다음 키프레임에서 '보이던 것'을 되짚을 열쇠(FieldSymbols.visibleCenters)
    out.push(c);
  }
  // 보이던 것 먼저 → 두드러진 것 먼저 → 북쪽 → 서쪽(난수 없는 순서).
  out.sort((a, b) => (Number(b.carried) - Number(a.carried))
    || (b.prominence - a.prominence) || (a.lat - b.lat) || (a.lon - b.lon));
  return out;
};

/**
 * 디코드 상수의 지문. 이 글자가 바뀌면 같은 바이트가 다른 hPa 로 풀린다 — 쥐고 있던 중심을 버려야 한다.
 * 객체가 같은지로 묻지 않는다: 매니페스트를 다시 읽으면 **값이 같아도 새 객체**다(공연히 다 버리게 된다).
 */
export const decodeSignature = (d) => (d && Number.isFinite(d.scale) && Number.isFinite(d.offset)
  ? `${d.transfer || 'linear'}:${d.scale}:${d.offset}` : 'none');

/** 카드에 적는 고지대 규칙 한 줄. 화면에 남극·티베트 H 가 없는 것이 고장이 아니라 결정임을 말한다. */
export const highTerrainNote = (ko = true, ready = true) => {
  if (!ready) {
    return ko
      ? 'H·L 기호는 지형 고도를 받은 뒤에 섭니다 — 고지대의 해면 경정을 가려야 가짜 고기압이 생기지 않습니다.'
      : 'H/L symbols wait for the terrain heights — without them, sea-level reduction invents highs over high ground.';
  }
  // 숫자는 눈금표가 아니라 찾기 모듈의 상수에서 센다 — 문턱을 바꾸면 이 줄이 따라 바뀐다(두 곳에 적지 않는다).
  const hi = HIGH_TERRAIN_M.toLocaleString('en-US');
  const polar = POLAR_TERRAIN_M.toLocaleString('en-US');
  return ko
    ? `고도 ${hi} m 이상(티베트·안데스)과 극지 빙상 ${polar} m 이상(남극·그린란드)에는 기호를 세우지 않습니다 — 해면기압은 그곳에서 땅 밑의 없는 공기를 셈해 넣은 값입니다.`
    : `No symbols above ${hi} m (Tibet, the Andes) or above ${polar} m on the polar ice sheets (Antarctica, Greenland) — sea-level pressure there extrapolates air that is not present.`;
};

/**
 * 카드의 기호 줄(순수). btn 은 field-layer.js 의 단추 만들기 — 단추 모양을 두 곳에 적지 않으려고 받아 쓴다.
 *   m = { id, symbolName, symbolsOn, symbolReady, ko }
 * ⚠️ '앞 반구 H n · L n' 은 적지 않는다. 그 수는 tick(camera)이 **그리는 프레임마다** 다시 세는데 카드는
 *    상태가 바뀔 때만 다시 그려진다 — 타임라인을 세워 두고 지구를 돌리면 화면은 바뀌고 숫자는 그대로다.
 *    콘솔에는 살아 있다(state().shown) — 카드에 틀린 숫자를 적느니 적지 않는다.
 */
export const symbolCardRow = (m, btn) => {
  const ko = m.ko !== false;
  const name = m.symbolName || (ko ? '고·저기압 기호' : 'H/L centres');
  return `<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px">${name} `
    + btn('field-symbols', `data-set="${m.symbolsOn ? 'off' : 'on'}"`, m.symbolsOn, m.symbolsOn ? (ko ? '켬' : 'On') : (ko ? '끔' : 'Off'))
    + `</span><span style="opacity:.8">${highTerrainNote(ko, m.symbolReady !== false)}</span>`;
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
    // ⚠️ decode 는 접근자다(아래 get/set) — 캐시를 비우므로 **캐시보다 먼저** 놓일 수 없다. 여기서는 뒷받침만 둔다.
    this._decode = null;
    this._decodeSig = 'none';
    this.byPx = new WeakMap();        // 프레임 CPU 사본(객체) → 중심 목록. 저장소가 그 장을 버리면 같이 사라진다
    this.lastPxA = null;              // 직전 update 가 본 두 장 — 같은 key 라도 그림이 다르면 다시 찾는다
    this.lastPxB = null;
    this.hours = [null, null];        // 콘솔 확인용(캐시 열쇠가 아니다 — 위 머리 주석)
    this.key = null;
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
    this.mask = null;
    this.maskTried = false;
    this.maskInfo = null;
    this.maskError = null;          // 고도를 읽다 던졌다(교차 출처로 더럽혀진 캔버스 등) — 기호만 없고 색면은 산다
    this.findError = null;
    this.carry = new Set();           // 직전 키프레임에 **보이던** 중심 객체(place 가 읽는다)
    this.lastShown = new Set();       // tick 이 적는다 — 스프라이트 불투명도를 상태로 쓰지 않는다(rememberShown)
    this.visible = false;
    this.shown = { H: 0, L: 0 };
    this.finds = 0;                   // 프레임에서 중심을 찾은 횟수(시험·콘솔 확인용)
    this.builds = 0;                  // 키프레임이 바뀌어 다시 이은 횟수
    this.lastExagger = NaN;
    this.mix = 0;
  }

  get object() { return this.group; }

  /**
   * 디코드 상수. FieldLayer.applyFieldSpec 이 넣는다 — 켤 때 한 번, 런이 갈릴 때 한 번(onSwap).
   * 눈금이 바뀌면 쥐고 있던 중심의 hPa 는 옛 눈금으로 푼 숫자다 → 전부 버리고 다시 찾는다(머리 주석).
   */
  get decode() { return this._decode; }

  set decode(d) {
    const sig = decodeSignature(d);
    this._decode = d;
    if (sig === this._decodeSig) return;
    this._decodeSig = sig;
    this.forget();
  }

  /** 쥐고 있던 중심을 버린다 — 자료의 출처(런 · 디코드 눈금)가 바뀌었을 때. 스프라이트는 건드리지 않는다. */
  forget() {
    this.byPx = new WeakMap();
    this.lastPxA = null;
    this.lastPxB = null;
    this.key = null;
  }

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
      this.maskInfo = { high: 0, polar: 0, known: 0, cells: w * h, ok: false };
      return null;
    }
    this.maskTried = true;
    this.maskInfo = { high: built.high, polar: built.polar, known: built.known, cells: built.cells, ok: built.ok };
    if (built.ok) this.mask = built.mask;
    return this.mask;
  }

  // 열쇠는 **그림 객체**다(머리 주석 '쥐고 있는 중심은 그 그림의 것이다'). 프레임 저장소가 그 장을 버리면
  // WeakMap 의 줄도 같이 사라져, 41장을 다 쥐는 일도 몇 장만 쥐려고 세는 일도 없다.
  centersFor(px, grid) {
    let list = this.byPx.get(px);
    if (list) return list;
    this.finds += 1;
    list = findPressureCenters({ w: px.w, h: px.h, data: px.data, channels: px.channels },
      this.decode, { highMask: this.mask, grid });
    this.byPx.set(px, list);
    return list;
  }

  /**
   * 키프레임이 바뀌었다 — 두 프레임에서 각각 찾아 잇는다. key 가 같으면 **아무것도 하지 않는다.**
   *   px      { w, h, channels, data } 두 장(b 가 없으면 a 하나) · grid  fieldSpec(id).grid · gapH  두 프레임의 간격(시간)
   */
  update(key, pxA, pxB, { grid, hourA, hourB, gapH = 3 } = {}) {
    // ⚠️ 글자가 같아도(런이 갈리면 FieldLayer 는 같은 '75|78' 을 다시 보낸다) **그림이 다르면 다른 장**이다.
    if (key === this.key && pxA === this.lastPxA && pxB === this.lastPxB) return false;
    this.key = key;
    this.lastPxA = pxA;
    this.lastPxB = pxB;
    this.hours = [hourA ?? null, hourB ?? null];
    this.builds += 1;
    if (!pxA || !this.decode) {
      // 디코드 상수는 FieldLayer.applyFieldSpec 이 넣는다. 없으면 조용히 안 그리는 대신 이유를 남긴다.
      this.findError = pxA ? 'NO_DECODE' : 'NO_PIXELS';
      this.setSymbols([]);
      return true;
    }
    if (!this.ensureMask(pxA.w, pxA.h, grid)) { this.setSymbols([]); return true; }
    // 기호는 색면의 덤이다 — 여기서 무엇이 잘못돼도 색면과 등압선은 그대로 있어야 한다.
    // (매니페스트가 전지구가 아닌 격자를 말하면 findPressureCenters 가 던진다 · 디코드 상수가 낯선 꼴이어도 던진다.)
    try {
      const a = this.centersFor(pxA, grid);
      const b = (pxB && pxB !== pxA) ? this.centersFor(pxB, grid) : a;
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
    if (fresh) this.carry = this.lastShown;
    const list = rankSymbols(this.pairs, mix, { minProminence: this.minProminence, carry: this.carry });
    // 그리지 않고 키프레임을 잇달아 지나가도(타임라인을 빠르게 끌 때) 기억이 끊기지 않게, **이어진 줄**의 중심을
    // 표에 얹어 둔다. 보였다고 지어내는 것이 아니다 — 보이던 것과 같은 중심이라는 뜻이고,
    // 다음 tick 의 rememberShown 이 '정말 보인 것'으로 표를 다시 적는다.
    if (fresh) {
      for (const c of list) {
        if (!c.carried || !c.pair) continue;
        if (c.pair.a) this.lastShown.add(c.pair.a);
        if (c.pair.b) this.lastShown.add(c.pair.b);
      }
    }
    this.setSymbols(list);
  }

  // 마지막으로 **정말 보였던** 기호가 딛고 선 중심 객체들을 다시 적는다 — 두 키프레임의 것을 다 넣는다(rankSymbols 의 ⚠️).
  // ⚠️ 스프라이트의 불투명도로 되짚지 않는다: setSymbols 가 전부 0 으로 두고 다음 tick 이 되살리므로,
  //    그리기 전에 키프레임이 바뀌면(타임라인을 빠르게 끌면 그렇다) 보이던 것이 없는 셈이 되어 히스테리시스가 쉰다.
  rememberShown() {
    this.lastShown.clear();
    for (let i = 0; i < this.count; i += 1) {
      if (!(this.pool[i].material.opacity > 0)) continue;
      const p = this.list[i] && this.list[i].pair;
      if (!p) continue;
      if (p.a) this.lastShown.add(p.a);
      if (p.b) this.lastShown.add(p.b);
    }
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
      // ⚠️ 같은 텍스처인데도 needsUpdate 를 세우면 material.version 이 계속 올라 three 가 기호마다 프로그램·유니폼을
      //    다시 훑는다. setSymbols 는 시간 버스가 부를 때마다(재생 중 초 단위) 도는 자리다 — 바뀔 때만 세운다.
      if (spr.material.map !== t.tex) {
        spr.material.map = t.tex;
        spr.material.needsUpdate = true;
      }
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
    let flipped = false;
    for (let i = 0; i < this.count; i += 1) {
      const spr = this.pool[i];
      const p = spr.position;
      let a = labelOpacity(p.x, p.y, p.z, cx, cy, cz) * (this.list[i].alpha ?? 1);
      // 우선순위 순으로 앞에서부터 센다 — 상한을 넘는 것은 흐리지 않고 끈다(같은 기호가 늘 같은 순서라 깜빡이지 않는다).
      const isH = this.list[i].kind === 'H';
      if (a > 0 && (isH ? nH : nL) >= (isH ? this.cap.H : this.cap.L)) a = 0;
      if (a > 0) { if (isH) nH += 1; else nL += 1; }
      if ((a > 0) !== (spr.material.opacity > 0)) flipped = true;
      spr.material.opacity = a;
    }
    // '보였다'는 표는 **보이는 것이 바뀔 때만** 다시 적는다 — 매 프레임 Set 을 새로 담지 않는다(폰 발열).
    if (flipped) this.rememberShown();
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
      // 런이 갈렸는지 콘솔에서 보이게 — 눈금이 바뀌면 이 글자가 바뀌고 쥔 것이 버려진다(머리 주석).
      decode: this._decodeSig, key: this.key, hours: [...this.hours],
    };
  }

  clear() {
    for (const spr of this.pool) { spr.visible = false; spr.material.opacity = 0; }
    this.count = 0;
    this.list = [];
    this.pairs = [];
    // 레이어를 껐다 켜는 사이에 런이 갈릴 수 있다 — 쥔 것을 들고 넘어가지 않는다(머리 주석).
    this.forget();
    this.carry = new Set();
    this.lastShown.clear();
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
    this.mask = null;
  }
}

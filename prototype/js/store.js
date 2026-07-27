// 앱 상태 — 티어, 레이어 on/off, 카메라 상태
import { LAYER_DEFS, TIER, T } from './config.js';

const LS_TIER = 'earthus.tier';
const LS_LAYERS = 'earthus.layers';
const LS_DEFAULTS_VER = 'earthus.layerDefaultsVer';

/* 기본값을 바꿔도 이미 쓰던 사람에게는 반영되지 않는다.
   저장된 값이 항상 이기기 때문이다 (saved[id] ?? d.on).
   그래서 기본값을 의미 있게 바꿀 때마다 이 번호를 올린다.
   번호가 다르면 저장된 레이어 상태를 버리고 새 기본값으로 시작한다.
     1 → 최초
     2 → 구름 기본 켜짐, 야간 불빛을 메뉴에서 제거 (2026-07-26)
     3 → 위성 기본 켜짐 (2026-07-26)
     4 → 오로라·태풍·지진 기본 켜짐 (2026-07-26)
     5 → 쓰나미 경보 추가·기본 켜짐 / 부이·일식 추가 (2026-07-26)
     6 → 산불(FIRMS) 추가·기본 켜짐 (2026-07-26)
     7 → 이벤트 뉴스를 무료로 전환 (2026-07-26)
     8 → 티어 재조정: 모든 레이어를 무료로. 유료는 기능(알림·이력·심층)으로 (2026-07-26)

   ⚠️ LAYER_DEFS 의 on 값을 바꾸면 "반드시" 이 번호를 함께 올릴 것.
      실제로 한 번 어겼다: 2 로 올려 배포한 뒤 orbits 를 on:true 로 바꿨는데
      번호를 안 올려서, 그 사이에 접속한 기기는 orbits:false 가 저장된 채 굳었다.
      "내 기기에선 되는데 폰에선 안 되는" 증상으로 나타난다. */
const DEFAULTS_VER = '12';  // 12: 실제 위성 영상 레이어 추가

function loadLayerState() {
  const stale = localStorage.getItem(LS_DEFAULTS_VER) !== DEFAULTS_VER;
  if (stale) {
    localStorage.removeItem(LS_LAYERS);
    localStorage.setItem(LS_DEFAULTS_VER, DEFAULTS_VER);
  }
  const saved = stale ? {} : JSON.parse(localStorage.getItem(LS_LAYERS) || '{}');
  const s = {};
  LAYER_DEFS.forEach(d => { s[d.id] = saved[d.id] ?? d.on; });
  return s;
}

/* 한 번에 하나만 켜지는 묶음.
   ⚠️ 왜 필요한가 (받은 지적)
     "바람은 현재와 내일 두 가지가 있어. 둘 중 하나만 선택 가능하게 해줘.
      기온도 마찬가지야… 색으로 표현해주는 것도 하나만.
      합쳐지면 복잡해지고 느려지는 현상 생기니깐"

     맞는 말이다. 색 격자는 반투명으로 겹쳐 칠해진다. 두 장만 겹쳐도 무슨 색이
     무슨 값인지 알 수 없게 되고, 지금은 격자 레이어가 16종이라 최악의 경우
     16장이 겹친다. 그리기 비용도 그만큼 든다.

   ⚠️ 서로 배타적인 것만 묶는다. 지진과 산불처럼 성격이 다른 점 레이어는
      같이 봐야 의미가 있으므로 묶지 않는다. */
const EXCLUSIVE = [
  // 색 격자 — 한 장만. 두 장이 겹치면 색이 섞여 값을 읽을 수 없다.
  ['temp', 'tmax', 'tmin', 'humidity', 'fog', 'drought',
   'pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone',
   'sst', 'sstanom', 'wave', 'swell', 'current'],
  // 바람 파티클 — 지금 바람과 내일 바람이 같이 흐르면 어느 쪽인지 알 수 없다.
  ['wind', 'windfc'],
  // 바탕 영상 — 위성 사진에는 그날 구름이 이미 찍혀 있다. 구름을 또 얹으면 두 겹이 된다.
  ['truecolor', 'clouds', 'himawari', 'himaIR'],
];

export const store = {
  tier: localStorage.getItem(LS_TIER) || TIER.FREE,
  layers: loadLayerState(),
  height: 24_000_000,
  mode: 'ambient',          // ambient | explore
  cluster: true,
  pins: false,              // 핀 노출 구간인가 (T.PIN 이하)
  selected: null,
  _subs: { tier: [], layer: [], camera: [], select: [] },

  on(evt, fn) { this._subs[evt].push(fn); return () => {
    this._subs[evt] = this._subs[evt].filter(f => f !== fn);
  }; },
  emit(evt, ...a) { this._subs[evt].forEach(f => f(...a)); },

  /* ── 티어 ─────────────────────────────────────────────── */
  setTier(t) {
    this.tier = t;
    localStorage.setItem(LS_TIER, t);
    this.emit('tier', t);
  },
  isPaid() { return this.tier === TIER.PAID; },

  /** 이 레이어를 지금 쓸 수 있는가 (구현 여부만 본다 — 레이어는 전부 무료다) */
  canUse(def) {
    if (def.blocked) return false;
    return def.tier === TIER.FREE || this.isPaid();
  },

  /** 이 "기능"을 쓸 수 있는가 (PAID_CAP).
      ⚠️ 레이어와 다르다. 레이어는 무료, 기능이 유료다. */
  can(cap) { return this.isPaid(); },

  /* ── 레이어 ───────────────────────────────────────────── */
  isOn(id) {
    const def = LAYER_DEFS.find(d => d.id === id);
    if (!def || !this.canUse(def)) return false;
    return !!this.layers[id];
  },
  /** 같은 그룹에서 이미 켜져 있는 다른 레이어들 */
  _rivals(id) {
    const g = EXCLUSIVE.find(x => x.includes(id));
    if (!g) return [];
    return g.filter(x => x !== id && this.layers[x]);
  },

  toggle(id) { this.setLayer(id, !this.layers[id]); },

  setLayer(id, v) {
    /* ⚠️ 배타 그룹 — 켤 때만 나머지를 끈다. 끌 때는 아무것도 건드리지 않는다.
       (끄면서 다른 걸 켜주면 "껐는데 뭔가 켜졌다"가 되어 더 헷갈린다.) */
    const off = v ? this._rivals(id) : [];
    off.forEach(x => { this.layers[x] = false; });
    this.layers[id] = v;
    localStorage.setItem(LS_LAYERS, JSON.stringify(this.layers));
    // 끈 것부터 알린다 — 켜는 쪽이 먼저 그려지면 한 프레임 동안 둘 다 보인다
    off.forEach(x => this.emit('layer', x, false));
    this.emit('layer', id, v);
  },

  /** 이 레이어를 켜면 무엇이 꺼지는가 (메뉴가 미리 알려주기 위해) */
  wouldReplace(id) { return this._rivals(id); },

  /* ── 카메라 ───────────────────────────────────────────── */
  setHeight(h) {
    // ⚠️ 임계는 셋(CHROME / PIN / EXPAND)이다. 셋 다 감시해야 한다.
    //    예전엔 mode(CHROME)와 cluster(EXPAND) 변화만 감시해서,
    //    PIN 임계(1,500km)만 넘는 구간에서는 이벤트가 안 나갔다.
    //    → 전지구에서 "중요도 미달"로 꺼둔 핀이 확대해도 다시 안 켜졌다.
    const prev = { mode: this.mode, cluster: this.cluster, pins: this.pins };
    this.height = h;
    this.mode = h < T.CHROME ? 'explore' : 'ambient';
    this.cluster = h > T.EXPAND;
    this.pins = h <= T.PIN;
    if (this.mode !== prev.mode || this.cluster !== prev.cluster || this.pins !== prev.pins) {
      this.emit('camera', h, this.mode, this.cluster);
    }
  },
  pinsVisible() { return this.height <= T.PIN; },

  /* ── 선택 ─────────────────────────────────────────────── */
  select(meta) { this.selected = meta; this.emit('select', meta); },
  clearSelect() { this.selected = null; this.emit('select', null); },
};

// EARTHUS v2-three — 정본 엔진 브리지 (ENGINE BRIDGE)
//
// v2-three는 지금까지 정본 엔진(prototype/js/earthus2/v02, 61모듈)을 하나도 import하지 않고
// 같은 개념을 셸에 재구현해 왔다 (NEXT_STEPS.md §2). 그래서 정본을 고쳐도 제품이 안 바뀌었다.
// 이 파일이 그 이음매다 — 셸은 여기만 보고, 여기서 정본을 그대로 부른다.
// 정본 모듈은 수정하지 않는다 (읽기 전용). 셸 모양으로 맞추는 어댑팅만 여기서 한다.
//
// 연결한 정본 모듈
//   core/constants.js          DATA_STATE · EVIDENCE_KIND · THERMAL_STATE · SCENE_MODE · VISUAL_ENGINE
//   core/canonical-signal.js   deriveFreshnessState()  — 배지가 데이터 시각에 따라 실제로 강등된다
//   core/confidence.js         calculateConfidence() · confidenceBand()
//   core/resource-governor.js  EngineResourceGovernor · thermalBudget()  — §20 품질 스텝다운
//   core/scene-orchestrator.js buildScenePlan()        — 컨텍스트 디밍 · 라벨 예산
//   ops/provider-health.js     providerHealthState()   — 소스 건강 상태
//   geo/bathymetry-policy.js   depthVisualScale()

import {
  DATA_STATE, EVIDENCE_KIND, THERMAL_STATE, SCENE_MODE, VISUAL_ENGINE,
} from '../../js/earthus2/v02/core/constants.js';
import { deriveFreshnessState } from '../../js/earthus2/v02/core/canonical-signal.js';
import { calculateConfidence, confidenceBand } from '../../js/earthus2/v02/core/confidence.js';
import { EngineResourceGovernor, thermalBudget } from '../../js/earthus2/v02/core/resource-governor.js';
import { buildScenePlan, SceneOrchestrator } from '../../js/earthus2/v02/core/scene-orchestrator.js';
import { EarthusEngineRuntime } from '../../js/earthus2/v02/core/engine-runtime.js';
import { ENGINE_CLASS, ENGINE_LIFECYCLE } from '../../js/earthus2/v02/core/constants.js';
import { providerHealthState, PROVIDER_HEALTH } from '../../js/earthus2/v02/ops/provider-health.js';
import { depthVisualScale } from '../../js/earthus2/v02/geo/bathymetry-policy.js';

export {
  DATA_STATE, EVIDENCE_KIND, THERMAL_STATE, SCENE_MODE, VISUAL_ENGINE,
  calculateConfidence, confidenceBand, depthVisualScale, thermalBudget, PROVIDER_HEALTH,
};

// ---------------------------------------------------------------------------
// 1. 배지 어휘: 셸의 임시 문자열 → 정본 EVIDENCE_KIND
// ---------------------------------------------------------------------------
// 셸은 지금까지 'OBSERVED' / 'MODEL_SIGNAL'처럼 증거종류와 데이터상태를 한 문자열에
// 섞어 썼다. 정본은 둘을 분리한다: evidenceKind(무엇으로 아는가) × dataState(지금 살아있는가).
// 기존 호출부를 깨지 않기 위해 옛 문자열을 받아 정본 종류로 옮긴다.
const LEGACY_TO_KIND = Object.freeze({
  LIVE: EVIDENCE_KIND.VISUALIZATION_ONLY,
  OBSERVED: EVIDENCE_KIND.OFFICIAL_OBSERVATION,
  OFFICIAL_FORECAST: EVIDENCE_KIND.OFFICIAL_FORECAST,
  MODEL_SIGNAL: EVIDENCE_KIND.PROVIDER_FORECAST,
  SIMULATION_ONLY: EVIDENCE_KIND.SIMULATION,
  DERIVED: EVIDENCE_KIND.EARTHUS_ANALYSIS,
  DEMO: EVIDENCE_KIND.VISUALIZATION_ONLY,
  HISTORY: EVIDENCE_KIND.HISTORY,
});

// 증거종류 → 화면 표기 (기존 배지 텍스트를 유지해 화면이 갑자기 바뀌지 않게)
const KIND_BADGE = Object.freeze({
  [EVIDENCE_KIND.OFFICIAL_OBSERVATION]: ['live', 'OBSERVED', '공식 관측'],
  [EVIDENCE_KIND.OFFICIAL_FORECAST]: ['off', 'OFFICIAL', '공식 예보'],
  [EVIDENCE_KIND.OFFICIAL_WARNING]: ['off', 'WARNING', '공식 특보'],
  [EVIDENCE_KIND.PROVIDER_FORECAST]: ['model', 'MODEL', '제공자 모델'],
  [EVIDENCE_KIND.EARTHUS_ANALYSIS]: ['model', 'DERIVED', '자체 분석'],
  [EVIDENCE_KIND.EARTHUS_FORECAST]: ['model', 'FORECAST', '자체 예보'],
  [EVIDENCE_KIND.ESTIMATED_DISTRIBUTION]: ['model', 'ESTIMATED', '추정 분포'],
  [EVIDENCE_KIND.SIMULATION]: ['sim', 'SIMULATION', '시뮬레이션'],
  [EVIDENCE_KIND.HISTORY]: ['demo', 'HISTORY', '기록'],
  [EVIDENCE_KIND.VISUALIZATION_ONLY]: ['live', 'LIVE', '표현'],
});

// 데이터상태는 배지 뒤에 붙는다 — LIVE면 아무 것도 안 붙고, 늙으면 눈에 보이게 강등된다.
const STATE_SUFFIX = Object.freeze({
  [DATA_STATE.LIVE]: null,
  [DATA_STATE.DEGRADED]: ['stale', 'DEGRADED'],
  [DATA_STATE.STALE]: ['stale', 'STALE'],
  [DATA_STATE.UNAVAILABLE]: ['na', 'UNAVAILABLE'],
});

// 정본에 없는 것 — 준비도/과금은 진리등급이 아니라 상태 표시다. 그대로 둔다.
const NON_TRUTH = Object.freeze({
  STALE: ['stale', 'STALE'],
  UNAVAILABLE: ['na', 'UNAVAILABLE'],
  INSUFFICIENT_DATA: ['na', 'INSUFFICIENT_DATA'],
  LOCKED: ['locked', '준비 중'],
  PRO: ['locked', 'EXPLORER PRO'],
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 기존 dataBadge(state, extra)와 출력이 같다. 다만 어휘의 출처가 정본이다.
export function renderBadge(state, extra) {
  const nt = NON_TRUTH[state];
  if (nt) return `<span class="badge ${nt[0]}">${nt[1]}${extra ? ` · ${esc(extra)}` : ''}</span>`;
  const kind = LEGACY_TO_KIND[state] || (KIND_BADGE[state] ? state : null);
  if (!kind) return '';
  const b = KIND_BADGE[kind];
  return `<span class="badge ${b[0]}">${b[1]}${extra ? ` · ${esc(extra)}` : ''}</span>`;
}

// ---------------------------------------------------------------------------
// 2. 레이어별 진리등급 선언 + 신선도 SLA
// ---------------------------------------------------------------------------
// 지금까지 메뉴는 state를 문자열로 못박아, 데이터가 3일 묵어도 영원히 'OBSERVED'였다.
// 여기서 각 레이어의 증거종류와 SLA를 선언하고, 실제 데이터 시각으로 상태를 유도한다.
// slaMin = null 이면 시간에 따라 늙지 않는 것 (렌더링·정적 등재부 등).
const K = EVIDENCE_KIND;
export const LAYER_TRUTH = Object.freeze({
  // --- 2026-09-02 추가: 정합성 검사(tools/check-v2-consistency.mjs)가 배지 누락으로 잡아낸 것들 ---
  'land/seaice': { kind: K.OFFICIAL_OBSERVATION, slaMin: 4320 },
  'land/lst': { kind: K.OFFICIAL_OBSERVATION, slaMin: 4320 },
  'land/base-ne2': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'land/base-bluemarble': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  'land/base-truecolor': { kind: K.OFFICIAL_OBSERVATION, slaMin: 2880 },
  'land/base-night': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },

  'weather/radar': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'weather/raingrid': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/tempgrid': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/presgrid': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/windgrid': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/pm25grid': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/uvgrid': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/warnworld': { kind: K.OFFICIAL_WARNING, slaMin: 60 },

  'ocean/sstanom': { kind: K.OFFICIAL_OBSERVATION, slaMin: 2880 },
  'ocean/khoasl126': { kind: K.PROVIDER_FORECAST, slaMin: null },
  'ocean/khoasl245': { kind: K.PROVIDER_FORECAST, slaMin: null },
  'ocean/khoasl370': { kind: K.PROVIDER_FORECAST, slaMin: null },
  'ocean/khoasl585': { kind: K.PROVIDER_FORECAST, slaMin: null },
  'ocean/khoaflood': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  'ocean/slr': { kind: K.PROVIDER_FORECAST, slaMin: null },
  'ocean/surf': { kind: K.HISTORY, slaMin: null },

  'people/sculpt': { kind: K.ESTIMATED_DISTRIBUTION, slaMin: null },
  'people/livemix': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'people/pop': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  'people/news': { kind: K.VISUALIZATION_ONLY, slaMin: 120 },

  'hazards/eqhistory': { kind: K.HISTORY, slaMin: null },
  'hazards/eqdepth': { kind: K.HISTORY, slaMin: null },
  'hazards/plates': { kind: K.HISTORY, slaMin: null },
  'hazards/crustal': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  'hazards/tyens': { kind: K.PROVIDER_FORECAST, slaMin: 720 },
  'hazards/fireglobal': { kind: K.OFFICIAL_OBSERVATION, slaMin: 180 },

  'space/solaract': { kind: K.OFFICIAL_OBSERVATION, slaMin: 120 },
  'space/galaxy': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'space/aurora': { kind: K.OFFICIAL_FORECAST, slaMin: 90 },

  'land/terrain': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'land/satdetail': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'land/snow': { kind: K.OFFICIAL_OBSERVATION, slaMin: 1440 },
  'land/locate': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'land/globe': { kind: K.VISUALIZATION_ONLY, slaMin: null },

  'weather/cloud-off': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'weather/cloud-obs': { kind: K.OFFICIAL_OBSERVATION, slaMin: 180 },
  'weather/cloud-gk2a': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'weather/cloud-ea': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'weather/cloud-fog': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'weather/cloud-wv': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'weather/tempanom': { kind: K.EARTHUS_ANALYSIS, slaMin: 120 },
  'weather/mysky': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },
  'weather/cloud-gfs': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/cloud-vol': { kind: K.PROVIDER_FORECAST, slaMin: 360 },
  'weather/wind': { kind: K.OFFICIAL_OBSERVATION, slaMin: 90 },
  'weather/airq': { kind: K.OFFICIAL_OBSERVATION, slaMin: 120 },
  'weather/warn': { kind: K.OFFICIAL_WARNING, slaMin: 60 },

  'ocean/marine': { kind: K.PROVIDER_FORECAST, slaMin: 180 },
  'ocean/oceanfocus': { kind: K.VISUALIZATION_ONLY, slaMin: null },
  'ocean/typhoonsim': { kind: K.SIMULATION, slaMin: null },
  'ocean/buoys': { kind: K.OFFICIAL_OBSERVATION, slaMin: 180 },
  // 플로트는 약 열흘에 한 번 떠오른다 — 몇 시간 늙었다고 낡은 자료가 아니다.
  'ocean/argo': { kind: K.OFFICIAL_OBSERVATION, slaMin: 1440 },
  'ocean/kmasea': { kind: K.OFFICIAL_OBSERVATION, slaMin: 90 },
  'ocean/sstfield': { kind: K.OFFICIAL_OBSERVATION, slaMin: 1440 },
  'ocean/wavefield': { kind: K.PROVIDER_FORECAST, slaMin: 180 },
  'ocean/current': { kind: K.PROVIDER_FORECAST, slaMin: 180 },
  // 등심선은 관측 고도맵에서 우리가 유도한 표현이다 — 관측 그 자체가 아니다.
  'ocean/isobath': { kind: K.EARTHUS_ANALYSIS, slaMin: null },
  // SCUFN은 IHO/IOC가 공표한 해저 지물 등재부. 시간에 따라 늙는 관측이 아니라 기준 자료라 SLA 없음.
  'ocean/trenches': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },

  'people/seoul': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },

  'hazards/feed': { kind: K.OFFICIAL_OBSERVATION, slaMin: 90 },
  'hazards/eq': { kind: K.OFFICIAL_OBSERVATION, slaMin: 60 },
  'hazards/tc': { kind: K.OFFICIAL_WARNING, slaMin: 180 },
  'hazards/tyoff': { kind: K.OFFICIAL_FORECAST, slaMin: 360 },
  'hazards/tyens': { kind: K.PROVIDER_FORECAST, slaMin: 720 },
  'hazards/eqdepth': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  'hazards/plates': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  'ocean/khoaflood': { kind: K.OFFICIAL_OBSERVATION, slaMin: null },
  // 아날로그는 예보가 아니라 과거 통계에서 우리가 유도한 것 — 등급을 반드시 분리한다
  'hazards/tyanalog': { kind: K.EARTHUS_ANALYSIS, slaMin: null },
  'hazards/tsunami': { kind: K.OFFICIAL_WARNING, slaMin: 60 },
  'hazards/wildfire': { kind: K.OFFICIAL_FORECAST, slaMin: 720 },
  'hazards/lightning': { kind: K.OFFICIAL_OBSERVATION, slaMin: 30 },

  'space/sats': { kind: K.OFFICIAL_OBSERVATION, slaMin: 1440 },
  'space/starlink': { kind: K.OFFICIAL_OBSERVATION, slaMin: 1440 },
  'space/aeth-orbit': { kind: K.OFFICIAL_OBSERVATION, slaMin: 1440 },
  'space/launch': { kind: K.OFFICIAL_FORECAST, slaMin: 1440 },
  'space/solar': { kind: K.EARTHUS_ANALYSIS, slaMin: null },
  'space/photos': { kind: K.HISTORY, slaMin: null },
});

// 레이어별로 마지막에 받은 데이터의 시각 (ISO). live-layers 등이 여기에 기록한다.
const sourceAt = new Map();

export function recordSourceTime(key, isoOrDate) {
  if (!isoOrDate) return;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return;
  sourceAt.set(key, d.toISOString());
}

export function getSourceTime(key) {
  return sourceAt.get(key) || null;
}

// 정본 deriveFreshnessState로 지금 상태를 유도한다.
// SLA의 1배까지 LIVE, 2배까지 STALE, 그 뒤 UNAVAILABLE (정본 계약).
export function layerDataState(key) {
  const truth = LAYER_TRUTH[key];
  if (!truth || truth.slaMin == null) return DATA_STATE.LIVE;
  const at = sourceAt.get(key);
  if (!at) return DATA_STATE.LIVE; // 아직 안 받아본 것 — 없는 상태를 지어내지 않는다
  return deriveFreshnessState({
    referenceAt: at,
    liveSec: truth.slaMin * 60,
    staleSec: truth.slaMin * 120,
  });
}

const ageText = (iso) => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
};

// 레이어 배지: 증거종류 + (늙었으면) 데이터상태. 이게 재구현과 정본의 실제 차이다.
export function layerBadge(key, extra) {
  const truth = LAYER_TRUTH[key];
  if (!truth) return '';
  const b = KIND_BADGE[truth.kind];
  const st = layerDataState(key);
  const suffix = STATE_SUFFIX[st];
  const at = sourceAt.get(key);
  let out = `<span class="badge ${b[0]}">${b[1]}${extra ? ` · ${esc(extra)}` : ''}</span>`;
  if (suffix) out += ` <span class="badge ${suffix[0]}">${suffix[1]}${at ? ` · ${ageText(at)}` : ''}</span>`;
  return out;
}

export function layerTruthLine(key) {
  const truth = LAYER_TRUTH[key];
  if (!truth) return '';
  const b = KIND_BADGE[truth.kind];
  const at = sourceAt.get(key);
  const sla = truth.slaMin == null ? '시간 무관 (기준 자료·렌더링)' : `${truth.slaMin}분 이내 = LIVE · ${truth.slaMin * 2}분 초과 = UNAVAILABLE`;
  return `증거종류 ${b[2]} (${truth.kind})<br/>신선도 기준 ${sla}${at ? `<br/>마지막 데이터 시각 ${ageText(at)}` : ''}`;
}

// ---------------------------------------------------------------------------
// 3. 품질 스텝다운 (§20) — NEXT_STEPS에 "미구현"으로 남아 있던 것
// ---------------------------------------------------------------------------
// 실측 프레임레이트를 정본 THERMAL_STATE로 옮기고, thermalBudget()이 정한 예산을
// 렌더러에 적용한다. 값을 지어내지 않는다 — 측정한 fps만 쓴다.
export class ThermalGovernor {
  constructor({ onChange } = {}) {
    this.governor = new EngineResourceGovernor();
    this.scope = this.governor.createScope('v2-three.globe');
    this.governor.activatePrimary('v2-three.globe');
    this.state = THERMAL_STATE.NORMAL;
    this.budget = thermalBudget(this.state);
    this.fps = 0;
    this.onChange = onChange || null;
    this._frames = 0;
    this._since = 0;
    this._held = 0;
    this._prev = 0;
    this._gap = 0;
    // 탭이 숨겨지면 rAF가 초당 1회로 조여진다 — 그건 성능 저하가 아니라 브라우저 정책이다.
    // 창을 버리고 다시 보일 때부터 새로 측정한다 (백그라운드였다는 이유로 강등되면 안 된다).
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this._since = 0; this._frames = 0; this._held = 0; this._prev = 0; this._gap = 0;
      });
    }
  }

  // 매 프레임 호출. nowMs = performance.now()
  tick(nowMs) {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      this._since = 0; this._frames = 0; this._gap = 0; this._prev = 0;
      return; // 숨겨진 동안은 측정하지 않는다
    }
    if (!this._since) { this._since = nowMs; this._prev = nowMs; this._gap = 0; return; }
    // 프레임 간격을 본다. visibilityState가 'visible'이어도 창이 가려지면 브라우저가
    // rAF를 초당 몇 번으로 조인다 — 그건 성능 부하가 아니라 합성 정책이다.
    // 진짜로 느린 장면은 100~300ms로 "고르게" 느리지, 한 프레임만 2초씩 벌어지지 않는다.
    const gap = nowMs - this._prev;
    this._prev = nowMs;
    if (gap > this._gap) this._gap = gap;
    this._frames += 1;
    const dt = nowMs - this._since;
    if (dt < 2000) return;                       // 2초 창으로 평균 — 순간 튐에 반응하지 않는다
    if (this._gap > 500) {                       // 조여진 창 — 판단하지 않고 버린다
      // 루프가 3초 넘게 멈췄었다면 이전 판정은 지금을 설명하지 못한다.
      // 근거를 잃은 강등을 계속 들고 있지 않고 원위치에서 다시 측정한다.
      if (this._gap > 3000 && this.state !== THERMAL_STATE.NORMAL) {
        this.state = THERMAL_STATE.NORMAL;
        this.fps = 0;
        this.governor.setThermalState(THERMAL_STATE.NORMAL);
        this.budget = thermalBudget(THERMAL_STATE.NORMAL);
        if (this.onChange) this.onChange(this.budget, this.state, 0);
      }
      this._since = nowMs; this._frames = 0; this._gap = 0; this._held = 0;
      return;
    }
    this.fps = (this._frames * 1000) / dt;
    this._frames = 0;
    this._since = nowMs;
    this._gap = 0;
    this.scope.setMetric('fps', this.fps);

    // 정본 thermalBudget의 목표 fps(NORMAL 30 / BALANCED 28 / ECO 24)를 기준으로 단계 판정
    let next = this.state;
    if (this.fps < 16) next = THERMAL_STATE.SAFE;
    else if (this.fps < 22) next = THERMAL_STATE.ECO;
    else if (this.fps < 27) next = THERMAL_STATE.BALANCED;
    else if (this.fps > 32) next = THERMAL_STATE.NORMAL;

    // 히스테리시스: 한 단계 올라가려면 연속 3창(≈6초) 여유가 있어야 한다
    const up = LEVEL[next] < LEVEL[this.state];
    if (up && ++this._held < 3) return;
    if (!up) this._held = 0;
    if (next === this.state) return;
    this._held = 0;
    this.state = next;
    this.governor.setThermalState(next);
    this.budget = thermalBudget(next);
    if (this.onChange) this.onChange(this.budget, next, this.fps);
  }

  snapshot() {
    return { state: this.state, fps: Math.round(this.fps), budget: this.budget, scopes: this.governor.snapshot() };
  }

  dispose() { this.governor.disposeAll(); }
}

const LEVEL = Object.freeze({
  [THERMAL_STATE.NORMAL]: 0,
  [THERMAL_STATE.BALANCED]: 1,
  [THERMAL_STATE.ECO]: 2,
  [THERMAL_STATE.SAFE]: 3,
});

// ---------------------------------------------------------------------------
// 4. 씬 플랜 — 컨텍스트 디밍 · 라벨 예산 · 품질 배율
// ---------------------------------------------------------------------------
const SCENE_TO_CANON = Object.freeze({
  land: SCENE_MODE.LAND,
  weather: SCENE_MODE.ATMOSPHERE,
  ocean: SCENE_MODE.OCEAN,
  people: SCENE_MODE.URBAN,
  hazards: SCENE_MODE.EVENT,
  space: SCENE_MODE.SPACE,
});

const SCENE_TO_ENGINE = Object.freeze({
  land: VISUAL_ENGINE.RELIEF,
  weather: VISUAL_ENGINE.VOLUME,
  ocean: VISUAL_ENGINE.FIELD,
  people: VISUAL_ENGINE.TOWER,
  hazards: VISUAL_ENGINE.PULSE,
  space: VISUAL_ENGINE.TRACK,
});

export function scenePlan(sceneId, { thermalState = THERMAL_STATE.NORMAL, panelOpen = false, focus = null } = {}) {
  const scene = SCENE_TO_CANON[sceneId] || SCENE_MODE.LAND;
  const primaryEngine = SCENE_TO_ENGINE[sceneId] || VISUAL_ENGINE.RELIEF;
  const deviceClass = window.matchMedia('(max-width: 720px)').matches ? 'mobile' : 'desktop';
  try {
    return buildScenePlan({ scene, primaryEngine, focus, thermalState, panelOpen, deviceClass });
  } catch (e) {
    console.warn('[engine-bridge] scenePlan', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. 데이터 소스 건강 상태 — 지금까지 볼 방법이 아예 없던 것
// ---------------------------------------------------------------------------
const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

// 실제로 이 앱이 의존하는 소스. probe가 있으면 HEAD로 갱신 시각을 직접 확인한다.
export const PROVIDERS = Object.freeze([
  { id: 'gk2a', label: '천리안 GK2A 구름', origin: '1.0 S3 캐시', probe: `${S3}/clouds/gk2a/meta.json`, slaMin: 30 },
  { id: 'gmgsi', label: 'NOAA GMGSI 전지구 구름', origin: '1.0 S3 캐시', probe: `${S3}/clouds/meta.json`, slaMin: 180 },
  { id: 'kma-warn', label: 'KMA 기상 특보', origin: '1.0 S3 캐시', probe: `${S3}/events/kma-warn.json`, slaMin: 60 },
  { id: 'kma-aws', label: 'KMA AWS 지상 관측', origin: '1.0 S3 캐시', probe: `${S3}/wind/kma-aws.json`, slaMin: 90 },
  { id: 'lightning', label: 'KMA 낙뢰 관측망', origin: '1.0 S3 캐시', probe: `${S3}/events/kma-lightning.json`, slaMin: 30 },
  { id: 'airq', label: '에어코리아 대기질', origin: '1.0 S3 캐시', probe: `${S3}/wind/korea-air-obs.json`, slaMin: 120 },
  { id: 'buoys', label: '해양 부이 (NDBC 등)', origin: '1.0 S3 캐시', probe: `${S3}/ocean/buoys.json`, slaMin: 180 },
  { id: 'fire', label: '산림청 산불 위험지수', origin: '1.0 S3 캐시', probe: `${S3}/events/forest-fire-kr.json`, slaMin: 720 },
  { id: 'tsunami', label: '쓰나미 (PTWC·NWS)', origin: '1.0 S3 캐시', probe: `${S3}/events/tsunami-intl.json`, slaMin: 60 },
  { id: 'tyoff', label: '태풍 공식 트랙 (KMA·JMA·NHC)', origin: '1.0 S3 캐시', probe: `${S3}/events/typhoon-official.json`, slaMin: 360 },
  // 브라우저가 직접 부르는 서드파티 — 캐시 파이프라인 밖이라 HEAD 프로브 없이 호출 결과로만 판단
  { id: 'gdacs', label: 'GDACS 사건', origin: '브라우저 직접', slaMin: 180 },
  { id: 'usgs', label: 'USGS 지진', origin: '브라우저 직접', slaMin: 60 },
  { id: 'openmeteo', label: 'Open-Meteo (해상·예보)', origin: '브라우저 직접', slaMin: 180 },
  { id: 'gibs', label: 'NASA GIBS (눈·얼음)', origin: '브라우저 직접', slaMin: 1440 },
  { id: 'scufn', label: 'GEBCO SCUFN 가제티어', origin: '브라우저 직접', slaMin: null },
  { id: 'celestrak', label: 'CelesTrak TLE', origin: '1.0 S3 캐시', probe: `${S3}/celestrak/catalog.json.gz`, slaMin: 1440 },
  { id: 'spacedevs', label: 'TheSpaceDevs 발사 일정', origin: '브라우저 직접', slaMin: 1440 },
]);

const health = new Map(); // id → { state, lastSuccessAt, error }

// S3 캐시 경로 → (레이어 진리키, 제공자). 응답의 last-modified가 곧 파이프라인 갱신 시각이다.
const PATH_MAP = Object.freeze({
  '/ocean/buoys.json': { layer: 'ocean/buoys', provider: 'buoys' },
  '/events/kma-lightning.json': { layer: 'hazards/lightning', provider: 'lightning' },
  '/events/forest-fire-kr.json': { layer: 'hazards/wildfire', provider: 'fire' },
  '/events/kma-warn.json': { layer: 'weather/warn', provider: 'kma-warn' },
  '/events/tsunami-intl.json': { layer: 'hazards/tsunami', provider: 'tsunami' },
  '/events/typhoon-official.json': { layer: 'hazards/tyoff', provider: 'tyoff' },
  '/events/typhoon-ecmwf.json': { layer: 'hazards/tyens', provider: null },
  '/ocean/kma-buoy.json': { layer: 'ocean/kmasea', provider: null },
  '/ocean/khoa/flood-index.json': { layer: 'ocean/khoaflood', provider: null },
  '/tourism/seoul-flow.json': { layer: 'people/seoul', provider: null },
  '/wind/korea-air-obs.json': { layer: 'weather/airq', provider: 'airq' },
  '/wind/kma-aws.json': { layer: 'weather/wind', provider: 'kma-aws' },
  '/celestrak/catalog.json.gz': { layer: 'space/sats', provider: 'celestrak' },
  '/clouds/meta.json': { layer: 'weather/cloud-obs', provider: 'gmgsi' },
  '/clouds/gk2a/meta.json': { layer: 'weather/cloud-gk2a', provider: 'gk2a' },
});

const HOST_RULES = Object.freeze([
  { host: 'earthus.net/tourism', layer: 'people/seoul' },
  { host: 'gdacs.org', provider: 'gdacs', layer: 'hazards/tc' },
  { host: 'earthquake.usgs.gov', provider: 'usgs', layer: 'hazards/eq' },
  { host: 'open-meteo.com', provider: 'openmeteo', layer: 'ocean/marine' },
  { host: 'gibs.earthdata.nasa.gov', provider: 'gibs', layer: 'land/snow' },
  { host: 'services2.arcgis.com', provider: 'scufn', layer: 'ocean/trenches' },
  { host: 'll.thespacedevs.com', provider: 'spacedevs', layer: 'space/launch' },
]);

function observeFetch(url, ok, lastModified) {
  let hit = null;
  if (url.includes('earthus-cache-kr.s3')) {
    const path = url.slice(url.indexOf('.com/') + 4).split('?')[0];
    hit = PATH_MAP[path] || null;
  }
  if (!hit) hit = HOST_RULES.find((r) => url.includes(r.host)) || null;
  if (!hit) return;
  const at = (lastModified && !Number.isNaN(Date.parse(lastModified)))
    ? new Date(lastModified).toISOString()
    : new Date().toISOString();
  if (ok && hit.layer) recordSourceTime(hit.layer, at);
  if (hit.provider) reportProvider(hit.provider, ok, at);
}

// 모든 나가는 요청을 한 곳에서 관찰한다 — 각 모듈을 건드리지 않고 신선도·건강 상태를 모은다.
// 요청 자체는 그대로 통과시킨다 (반환값·에러 전파 불변).
let observerInstalled = false;
export function installFetchObserver() {
  if (observerInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  observerInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const p = orig(input, init);
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch { /* ignore */ }
    if (!url) return p;
    // 파생 프로미스에 거부 핸들러를 함께 붙여 미처리 거부를 만들지 않는다.
    p.then(
      (res) => { try { observeFetch(url, res.ok, res.headers.get('last-modified')); } catch { /* ignore */ } },
      () => { try { observeFetch(url, false, null); } catch { /* ignore */ } },
    );
    return p;
  };
}

// 브라우저 직접 호출 소스는 호출한 쪽이 결과를 알려준다.
export function reportProvider(id, ok, at = new Date().toISOString()) {
  const prev = health.get(id) || { fails: 0 };
  if (ok) health.set(id, { lastSuccessAt: at, fails: 0 });
  else health.set(id, { ...prev, fails: (prev.fails || 0) + 1, error: true });
}

export async function refreshProviderHealth() {
  const now = new Date().toISOString();
  await Promise.all(PROVIDERS.filter((p) => p.probe).map(async (p) => {
    try {
      const res = await fetch(p.probe, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lm = res.headers.get('last-modified');
      health.set(p.id, { lastSuccessAt: lm ? new Date(lm).toISOString() : now, fails: 0 });
    } catch (e) {
      const prev = health.get(p.id) || { fails: 0 };
      health.set(p.id, { ...prev, fails: (prev.fails || 0) + 1, error: String((e && e.message) || e) });
    }
  }));
  return providerSnapshot();
}

export function providerSnapshot() {
  const now = new Date().toISOString();
  return PROVIDERS.map((p) => {
    const h = health.get(p.id);
    if (!h || !h.lastSuccessAt) {
      return { ...p, state: h && h.fails ? PROVIDER_HEALTH.DOWN : null, lastSuccessAt: null, fails: (h && h.fails) || 0 };
    }
    const state = providerHealthState({
      lastSuccessAt: h.lastSuccessAt,
      nowAt: now,
      // SLA가 없는 기준 자료는 늙지 않는다 — 아주 큰 값으로 둔다
      freshnessSlaMinutes: p.slaMin == null ? 10 ** 7 : p.slaMin,
      consecutiveFailures: h.fails || 0,
    });
    return { ...p, state, lastSuccessAt: h.lastSuccessAt, fails: h.fails || 0 };
  });
}

const HEALTH_STYLE = Object.freeze({
  [PROVIDER_HEALTH.HEALTHY]: ['live', '정상'],
  [PROVIDER_HEALTH.DEGRADED]: ['stale', '불안정'],
  [PROVIDER_HEALTH.STALE]: ['stale', '지연'],
  [PROVIDER_HEALTH.DOWN]: ['na', '끊김'],
  [PROVIDER_HEALTH.QUOTA_EXHAUSTED]: ['na', '한도초과'],
  [PROVIDER_HEALTH.AUTH_ERROR]: ['na', '인증오류'],
  [PROVIDER_HEALTH.SCHEMA_DRIFT]: ['stale', '스키마변경'],
});

export function providerCardHtml() {
  const rows = providerSnapshot();
  const probed = rows.filter((r) => r.probe);
  const okN = probed.filter((r) => r.state === PROVIDER_HEALTH.HEALTHY).length;
  const line = (r) => {
    const s = r.state ? HEALTH_STYLE[r.state] : ['locked', '미확인'];
    const age = r.lastSuccessAt ? ageText(r.lastSuccessAt) : (r.probe ? '—' : '호출 전');
    return `<div class="stat"><span class="k">${esc(r.label)}</span>`
      + `<span class="v"><span class="badge ${s[0]}">${s[1]}</span> <span style="opacity:.7">${age}</span></span></div>`;
  };
  return `<div class="card"><div class="card-h">데이터 소스 상태 <span class="badge live">${okN}/${probed.length} 정상</span></div>
    <div class="card-b">
      <div style="opacity:.7;font-size:11px;margin-bottom:6px">1.0 S3 캐시 파이프라인 (HEAD로 갱신 시각 직접 확인)</div>
      <div class="stats">${rows.filter((r) => r.probe).map(line).join('')}</div>
      <div style="opacity:.7;font-size:11px;margin:8px 0 6px">브라우저 직접 호출 (호출한 결과로만 판단)</div>
      <div class="stats">${rows.filter((r) => !r.probe).map(line).join('')}</div>
      <div style="margin-top:8px;opacity:.7;font-size:11px">
        판정 정본 <code>ops/provider-health.js · providerHealthState()</code> —
        SLA 1배 초과 = 지연, 2배 초과 = 끊김. 값을 지어내지 않고 응답 헤더의 갱신 시각만 씁니다.
      </div>
    </div></div>`;
}

// ---------------------------------------------------------------------------
// 6. 엔진 런타임 — 정본 EarthusEngineRuntime + SceneOrchestrator
// ---------------------------------------------------------------------------
// 어댑터 등록 · 생명주기 · ResourceScope 소유 · 품질 전파 · 측정을 정본이 관리한다.
//
// 다만 "주 엔진은 항상 1개" 배타 규칙은 activate()를 호출한 엔진에만 적용된다.
// 전체화면 인수 뷰(시나리오·지역 3D·태양계 등)는 지금도 서로 배타적이라 activate()로
// 올리고, 지구 위에 겹쳐 보이는 오버레이(위성·부이·해구·볼륨)는 mount()까지만 하고
// activate()를 부르지 않는다 — 정본 배타 규칙을 적용하면 지금 동시에 켤 수 있는
// 레이어들이 서로를 없애 버리기 때문이다. 이 갈라짐은 의도적이고 여기 적어 둔다.
let runtime = null;
let orchestrator = null;

export function getRuntime() {
  if (!runtime) {
    runtime = new EarthusEngineRuntime();
    orchestrator = new SceneOrchestrator(runtime);
  }
  return runtime;
}

export function getOrchestrator() { getRuntime(); return orchestrator; }

export { ENGINE_CLASS, ENGINE_LIFECYCLE };

// 등록만 하고 활성화는 하지 않는 오버레이용 — mount()까지 올려 자원·품질 계약에 태운다
export async function registerAndMount(id, engineClass, adapter, context = {}) {
  const rt = getRuntime();
  try {
    rt.register({ id, engineClass, adapter });
    await rt.mount(id, context);
    return true;
  } catch (e) {
    console.warn('[engine-bridge] register/mount', id, e);
    return false;
  }
}

// 열상태가 바뀌면 등록된 모든 엔진에 예산을 내려보낸다 (정본 runtime.setThermalState).
export function broadcastThermal(state, budget) {
  const rt = getRuntime();
  try {
    rt.setThermalState(state);
    for (const e of rt.snapshot().engines) rt.setQuality(e.id, { budget, thermalState: state });
  } catch (e) {
    console.warn('[engine-bridge] broadcastThermal', e);
  }
}

const fmtN = (n) => (Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—');

export function engineCardHtml() {
  if (!runtime) return '';
  let snap;
  try { snap = runtime.snapshot(); } catch { return ''; }
  const globe = snap.engines.find((e) => e.id === 'globe');
  const g = globe ? globe.measurement : {};
  const rows = snap.engines.filter((e) => e.id !== 'globe').map((e) => {
    const m = e.measurement || {};
    const detail = m.active !== undefined
      ? (m.active ? '실행 중' : '대기')
      : `${m.on ? '켜짐' : '꺼짐'}${m.points ? ` · ${fmtN(m.points)}점` : ''}`;
    return `<div class="stat"><span class="k">${e.id}</span><span class="v">`
      + `<span class="badge ${e.lifecycle === 'ACTIVE' ? 'live' : e.lifecycle === 'ERROR' ? 'na' : 'locked'}">${e.lifecycle}</span>`
      + ` <span style="opacity:.7">${detail}</span></span></div>`;
  }).join('');
  return `<div class="card"><div class="card-h">엔진 런타임 <span class="badge live">${snap.engines.length}개 등록</span></div>
    <div class="card-b">
      <div class="stats">
        <div class="stat"><span class="k">드로우콜 · 삼각형</span><span class="v">${fmtN(g.drawCalls)} · ${fmtN(g.triangles)}</span></div>
        <div class="stat"><span class="k">지오메트리 · 텍스처</span><span class="v">${fmtN(g.geometries)} · ${fmtN(g.textures)}</span></div>
        <div class="stat"><span class="k">픽셀 배율</span><span class="v">${g.pixelRatio ?? '—'}×</span></div>
      </div>
      <div class="stats" style="margin-top:6px">${rows}</div>
      <div style="margin-top:8px;opacity:.7;font-size:11px">
        생명주기·자원 소유 정본 <code>core/engine-runtime.js</code> ·
        열상태는 <code>runtime.setThermalState()</code>로 전 엔진에 전파됩니다.
      </div>
    </div></div>`;
}

export const engineInfo = Object.freeze({
  path: '../../js/earthus2/v02',
  modules: [
    'core/constants', 'core/canonical-signal', 'core/confidence',
    'core/resource-governor', 'core/scene-orchestrator',
    'ops/provider-health', 'geo/bathymetry-policy',
  ],
});

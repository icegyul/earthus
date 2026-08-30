/* EARTHUS V2 — Progressive Planet Intelligence adapter.
 *
 * Runtime adapter only. It reuses FND-017 Planet Intelligence Orchestrator and the
 * existing Device/Network Governor. It is NOT a second intelligence engine.
 *
 * Responsibilities:
 * - derive semantic zoom scope with hysteresis
 * - build a bounded IntelligenceContext for Scene/Render policy
 * - compile one FND-017 execution plan
 * - apply a conservative Cesium resource/LOD budget without changing provider truth
 * - surface scene readiness through the existing resource-task loading UI
 * - expose truth/quality/fetch policy to the existing Earth Intelligence panel
 */
import { buildPlanetExecutionPlan } from '../../js/earthus2/v04/core/planet-intelligence-orchestrator.js';
import { deviceNetworkProfile } from '../../js/earthus2/v04/core/device-network-governor.js';

export const INTELLIGENCE_RUNTIME_VERSION = 'earthus.intelligence-runtime.v5.1';
export const VIEW_SCOPE = Object.freeze({
  GLOBAL: 'GLOBAL',
  CONTINENT: 'CONTINENT',
  COUNTRY: 'COUNTRY',
  REGION: 'REGION',
  LOCAL: 'LOCAL',
  UNDERWATER: 'UNDERWATER',
});

const DYNAMIC_PRIMARY = new Set(['FLOW', 'VOLUME', 'PULSE', 'TRACK', 'TOWER']);
const SCOPE_ORDER = Object.freeze([
  VIEW_SCOPE.GLOBAL,
  VIEW_SCOPE.CONTINENT,
  VIEW_SCOPE.COUNTRY,
  VIEW_SCOPE.REGION,
  VIEW_SCOPE.LOCAL,
  VIEW_SCOPE.UNDERWATER,
]);
const STAY_RANGE = Object.freeze({
  [VIEW_SCOPE.GLOBAL]: [5_000_000, Infinity],
  [VIEW_SCOPE.CONTINENT]: [1_300_000, 6_800_000],
  [VIEW_SCOPE.COUNTRY]: [280_000, 2_000_000],
  [VIEW_SCOPE.REGION]: [52_000, 480_000],
  [VIEW_SCOPE.LOCAL]: [-100, 105_000],
  [VIEW_SCOPE.UNDERWATER]: [-Infinity, -60],
});

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function finite(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

export function nominalViewScope(heightM) {
  const h = finite(heightM, 24_000_000);
  if (h < -100) return VIEW_SCOPE.UNDERWATER;
  if (h <= 75_000) return VIEW_SCOPE.LOCAL;
  if (h <= 350_000) return VIEW_SCOPE.REGION;
  if (h <= 1_600_000) return VIEW_SCOPE.COUNTRY;
  if (h <= 6_000_000) return VIEW_SCOPE.CONTINENT;
  return VIEW_SCOPE.GLOBAL;
}

export function resolveViewScope({ heightM, previousScope = null } = {}) {
  const h = finite(heightM, 24_000_000);
  if (previousScope && STAY_RANGE[previousScope]) {
    const [min, max] = STAY_RANGE[previousScope];
    if (h >= min && h <= max) return previousScope;
  }
  return nominalViewScope(h);
}

export function normalizeNetworkType(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('2g')) return '2G';
  if (raw.includes('3g')) return '3G';
  if (raw.includes('4g') || raw.includes('5g')) return '4G';
  if (raw === 'offline') return 'OFFLINE';
  return '4G';
}

export function buildDeviceProfile({ navigatorLike = globalThis.navigator, viewportWidth = globalThis.innerWidth, thermal = 'NORMAL', batteryPct = 100 } = {}) {
  const nav = navigatorLike || {};
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  const coarse = globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;
  const mobile = coarse || finite(viewportWidth, 1280) <= 760;
  const args = {
    deviceClass: mobile ? 'mobile' : 'desktop',
    network: normalizeNetworkType(connection.effectiveType),
    saveData: connection.saveData === true,
    batteryPct: finite(batteryPct, 100),
    thermal,
    prefersReducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
  };
  if (Number.isFinite(Number(nav.deviceMemory))) args.memoryGb = Number(nav.deviceMemory);
  const profile = deviceNetworkProfile(args);
  return Object.freeze({
    ...profile,
    observed: Object.freeze({
      deviceClass: args.deviceClass,
      deviceMemoryGb: Number.isFinite(Number(nav.deviceMemory)) ? Number(nav.deviceMemory) : null,
      effectiveType: connection.effectiveType || null,
      saveData: connection.saveData === true,
      batteryPct: Number.isFinite(Number(batteryPct)) ? Number(batteryPct) : null,
      thermalMeasured: thermal !== 'NORMAL' ? true : null,
    }),
  });
}

export function primaryEngineForIntent({ menu = 'EARTH', feature = null } = {}) {
  const f = String(feature || '').toLowerCase();
  if (menu === 'WEATHER') {
    if (f.includes('cloud')) return 'VOLUME';
    if (f.includes('wind')) return 'FLOW';
    return 'FIELD';
  }
  if (menu === 'OCEAN') {
    if (f.includes('current') || f.includes('wave') || f.includes('swell')) return 'FLOW';
    return f.includes('bathymetry') || f.includes('underwater') ? 'RELIEF' : 'FIELD';
  }
  if (menu === 'HAZARD') return 'TRACK';
  if (menu === 'HUMAN') return f.includes('tourism') || f.includes('crowd') ? 'TOWER' : 'BEACON';
  if (menu === 'PULSE') return 'PULSE';
  if (menu === 'SPACE') return 'TRACK';
  return 'RELIEF';
}

export function sceneForIntent({ menu = 'EARTH', scope = VIEW_SCOPE.GLOBAL } = {}) {
  if (scope === VIEW_SCOPE.UNDERWATER || menu === 'OCEAN') return 'OCEAN';
  if (menu === 'WEATHER') return 'ATMOSPHERE';
  if (menu === 'HAZARD' || menu === 'PULSE') return 'EVENT';
  if (menu === 'HUMAN') return 'URBAN';
  if (menu === 'SPACE') return 'SPACE';
  return 'LAND';
}

export function buildIntelligenceContext({
  scope = VIEW_SCOPE.GLOBAL,
  menu = 'EARTH',
  feature = null,
  truthState = 'DERIVED',
  eventId = null,
  scenarioId = null,
  comparisonId = null,
  evidencePanelOpen = false,
  uncertaintyMode = 'PRESERVE',
  longitudeDeg = null,
  latitudeDeg = null,
  altitudeM = null,
  moving = false,
} = {}) {
  return Object.freeze({
    schemaVersion: 'earthus.intelligence-context.v5.1',
    eventId,
    truthState,
    analysisMode: feature ? `${menu}:${feature}` : menu,
    scenarioId,
    comparisonId,
    evidencePanelOpen: !!evidencePanelOpen,
    uncertaintyMode,
    viewScope: scope,
    spatialContext: Object.freeze({ longitudeDeg, latitudeDeg, altitudeM }),
    cameraState: moving ? 'MOVING' : 'STABLE',
  });
}

function baseSse(scope) {
  return ({
    [VIEW_SCOPE.GLOBAL]: 3.5,
    [VIEW_SCOPE.CONTINENT]: 2.8,
    [VIEW_SCOPE.COUNTRY]: 2.15,
    [VIEW_SCOPE.REGION]: 1.55,
    [VIEW_SCOPE.LOCAL]: 1.25,
    [VIEW_SCOPE.UNDERWATER]: 1.05,
  })[scope] ?? 2;
}

function cacheBudget(scope) {
  return ({
    [VIEW_SCOPE.GLOBAL]: 120,
    [VIEW_SCOPE.CONTINENT]: 180,
    [VIEW_SCOPE.COUNTRY]: 260,
    [VIEW_SCOPE.REGION]: 320,
    [VIEW_SCOPE.LOCAL]: 380,
    [VIEW_SCOPE.UNDERWATER]: 300,
  })[scope] ?? 240;
}

export function buildProgressiveRenderPolicy({ scope, deviceProfile, executionPlan, moving = false } = {}) {
  if (!deviceProfile || !executionPlan) throw new TypeError('deviceProfile and executionPlan are required');
  const qualityPenalty = ({ FULL: 0, BALANCED: 0.45, LITE: 1.15, STATIC: 2.2 })[deviceProfile.quality] ?? 0.45;
  const motionPenalty = moving ? 0.65 : 0;
  const cacheScale = ({ FULL: 1, BALANCED: 0.82, LITE: 0.56, STATIC: 0.32 })[deviceProfile.quality] ?? 0.82;
  const dynamic = DYNAMIC_PRIMARY.has(executionPlan.primaryEngine) && deviceProfile.quality !== 'STATIC';
  return Object.freeze({
    scope,
    maximumScreenSpaceError: clamp(baseSse(scope) + qualityPenalty + motionPenalty, 1.05, 6.5),
    tileCacheSize: Math.max(48, Math.round(cacheBudget(scope) * cacheScale)),
    preloadSiblings: executionPlan.fetchPolicy === 'VISIBLE_PLUS_PREFETCH' && [VIEW_SCOPE.CONTINENT, VIEW_SCOPE.COUNTRY].includes(scope) && !moving,
    requestRenderMode: !dynamic,
    targetFps: moving ? Math.min(deviceProfile.maxFps || 30, 30) : deviceProfile.maxFps,
    cloudMode: executionPlan.cloudMode,
    fetchPolicy: executionPlan.fetchPolicy,
    progressiveRefinement: true,
    centerFirst: true,
  });
}

export function calculateSceneReadiness({ scope, viewer, realEarth } = {}) {
  const required = [];
  required.push({ id: 'BASE_SURFACE', ready: viewer?.scene?.globe?.tilesLoaded === true });
  const terrainTruth = realEarth?.terrainTruth?.() || 'UNINITIALIZED';
  if ([VIEW_SCOPE.COUNTRY, VIEW_SCOPE.REGION, VIEW_SCOPE.LOCAL].includes(scope)) {
    required.push({ id: 'TERRAIN', ready: terrainTruth === 'ESRI_TERRAIN3D' });
  }
  if (scope === VIEW_SCOPE.UNDERWATER) {
    const bathyTruth = realEarth?.bathymetryTruth?.() || 'UNINITIALIZED';
    required.push({ id: 'BATHYMETRY', ready: bathyTruth === 'ESRI_TOPOBATHY3D' });
  }
  const readyCount = required.filter(item => item.ready).length;
  return Object.freeze({
    kind: 'SCENE_READINESS_NOT_BYTES',
    required: Object.freeze(required.map(item => Object.freeze(item))),
    readyCount,
    total: required.length,
    ratio: required.length ? readyCount / required.length : 1,
    ready: readyCount === required.length,
  });
}

function truthStateForRuntime({ feature }) {
  // A renderer being available is not evidence that an observation is currently
  // loaded. Domain adapters promote truth state only after provider receipts are bound.
  return feature ? 'INSUFFICIENT_DATA' : 'DERIVED';
}

function copyPlan(plan) { return Object.freeze({ ...plan, warnings: Object.freeze([...(plan.warnings || [])]) }); }

export function installProgressivePlanetIntelligence({ viewer, realEarth, tasks = null } = {}) {
  if (!viewer?.scene?.globe || !realEarth) throw new Error('V2_PROGRESSIVE_INTELLIGENCE_RUNTIME_REQUIRED');
  const scene = viewer.scene;
  const globe = scene.globe;
  const original = Object.freeze({
    maximumScreenSpaceError: globe.maximumScreenSpaceError,
    tileCacheSize: globe.tileCacheSize,
    preloadSiblings: globe.preloadSiblings,
    requestRenderMode: scene.requestRenderMode,
  });
  let disposed = false;
  let previousScope = null;
  let selected = { menu: 'EARTH', feature: null };
  let snapshot = null;
  let refinementTask = null;
  let refinementTimer = null;
  let lastCameraChangeAt = performance.now();
  let stableTimer = null;
  let moving = false;
  let batteryPct = 100;

  function beginRefinement(fromScope, toScope) {
    if (!tasks?.begin || fromScope === toScope) return;
    try { refinementTask?.cancel?.('superseded by a newer planet scope'); } catch (_) {}
    refinementTask = tasks.begin('planet-refinement', {
      label: `${toScope} EARTH`,
      provider: 'FND-017 · Progressive Planet',
      stage: `${fromScope || 'BOOT'} → ${toScope} · resolving visible terrain/imagery`,
      indeterminate: true,
      retryable: false,
      cancellable: false,
    });
    clearInterval(refinementTimer);
    const started = performance.now();
    refinementTimer = setInterval(() => {
      if (disposed || !refinementTask) return clearInterval(refinementTimer);
      const readiness = calculateSceneReadiness({ scope: toScope, viewer, realEarth });
      const stage = readiness.required.filter(item => !item.ready).map(item => item.id).join(' + ') || 'scene ready';
      refinementTask.update({ stage: readiness.ready ? 'scene ready' : `${toScope} · ${stage} refining`, indeterminate: true });
      if (readiness.ready || performance.now() - started > 12_000) {
        if (readiness.ready) refinementTask.complete({ stage: 'ready' });
        else refinementTask.complete({ stage: 'base ready · detail continues progressively' });
        refinementTask = null;
        clearInterval(refinementTimer);
        refinementTimer = null;
      }
    }, 220);
  }

  function enforcePolicy(policy) {
    if (!policy) return;
    globe.maximumScreenSpaceError = policy.maximumScreenSpaceError;
    if ('tileCacheSize' in globe && Number.isFinite(policy.tileCacheSize)) globe.tileCacheSize = policy.tileCacheSize;
    globe.preloadSiblings = policy.preloadSiblings;
    if ('requestRenderMode' in scene) scene.requestRenderMode = policy.requestRenderMode;
  }
  function applyPolicy(policy) {
    enforcePolicy(policy);
    scene.requestRender();
  }

  function emit(detail) {
    try { document.dispatchEvent(new CustomEvent('earthus:v2-intelligence-context', { detail })); } catch (_) {}
  }

  function update(reason = 'camera') {
    if (disposed || viewer.isDestroyed?.()) return snapshot;
    const cart = viewer.camera.positionCartographic;
    if (!cart) return snapshot;
    const C = globalThis.Cesium;
    const altitudeM = finite(cart.height, 24_000_000);
    const nextScope = resolveViewScope({ heightM: altitudeM, previousScope });
    const changedScope = nextScope !== previousScope;
    const deviceProfile = buildDeviceProfile({ batteryPct });
    const truthState = truthStateForRuntime({ ...selected, realEarth });
    const context = buildIntelligenceContext({
      scope: nextScope,
      menu: selected.menu,
      feature: selected.feature,
      truthState,
      longitudeDeg: C?.Math ? C.Math.toDegrees(cart.longitude) : null,
      latitudeDeg: C?.Math ? C.Math.toDegrees(cart.latitude) : null,
      altitudeM,
      moving,
      evidencePanelOpen: document.getElementById('intel')?.hidden === false,
    });
    const primaryEngine = primaryEngineForIntent(selected);
    const sceneProfile = Object.freeze({ scene: sceneForIntent({ menu: selected.menu, scope: nextScope }), id: nextScope });
    const layerManifest = Object.freeze({ primaryEngine, contextEngine: null });
    const truthBudget = Object.freeze({ allowedFidelity: truthState === 'INSUFFICIENT_DATA' ? 'AGGREGATE_ONLY' : 'FULL' });
    const executionPlan = copyPlan(buildPlanetExecutionPlan({ sceneProfile, layerManifest, deviceProfile, truthBudget }));
    const renderPolicy = buildProgressiveRenderPolicy({ scope: nextScope, deviceProfile, executionPlan, moving });
    applyPolicy(renderPolicy);
    const readiness = calculateSceneReadiness({ scope: nextScope, viewer, realEarth });
    const next = Object.freeze({
      schemaVersion: INTELLIGENCE_RUNTIME_VERSION,
      engineId: 'FND-017',
      algorithmId: 'ALG-CORE-006',
      context,
      executionPlan,
      renderPolicy,
      readiness,
      capabilities: Object.freeze({
        intelligenceContext: 'RUNTIME_WIRED',
        progressiveScenePolicy: 'RUNTIME_WIRED',
        truthLensContext: 'RUNTIME_WIRED',
        observationGap: 'FOUNDATION_CODE',
        calibrationLedger: 'FOUNDATION_CODE',
        counterfactual: 'FOUNDATION_CODE',
        decisionTrace: 'FOUNDATION_CODE',
      }),
      reason,
      updatedAt: new Date().toISOString(),
    });
    const from = previousScope;
    previousScope = nextScope;
    snapshot = next;
    globalThis.__earthusV2IntelligenceSnapshot = next;
    if (changedScope) beginRefinement(from, nextScope);
    emit(next);
    return next;
  }

  function markMoving() {
    lastCameraChangeAt = performance.now();
    if (!moving) { moving = true; update('camera-moving'); }
    clearTimeout(stableTimer);
    stableTimer = setTimeout(() => {
      if (disposed) return;
      if (performance.now() - lastCameraChangeAt >= 220) {
        moving = false;
        update('camera-stable');
      }
    }, 240);
  }

  function onFeature(event) {
    const detail = event?.detail || {};
    selected = { menu: String(detail.menu || 'EARTH'), feature: detail.feature || null };
    update('intelligence-intent');
  }

  const removeChanged = viewer.camera.changed.addEventListener(markMoving);
  const removeMoveEnd = viewer.camera.moveEnd?.addEventListener?.(() => { moving = false; update('camera-move-end'); });
  // The legacy visual-fidelity controller also writes globe LOD. Because this
  // adapter is the FND-017 execution authority, re-assert the current policy
  // after render without scheduling another frame. This prevents policy drift
  // while preserving the existing presentation controller.
  const removePolicyGuard = scene.postRender.addEventListener(() => {
    const policy = snapshot?.renderPolicy;
    if (!policy) return;
    if (globe.maximumScreenSpaceError !== policy.maximumScreenSpaceError ||
        globe.preloadSiblings !== policy.preloadSiblings ||
        ('requestRenderMode' in scene && scene.requestRenderMode !== policy.requestRenderMode)) {
      enforcePolicy(policy);
    }
  });
  document.addEventListener('earthus:v2-feature-request', onFeature);

  if (globalThis.navigator?.getBattery) {
    globalThis.navigator.getBattery().then(battery => {
      if (disposed) return;
      batteryPct = clamp(finite(battery.level, 1) * 100, 0, 100);
      const onBattery = () => { batteryPct = clamp(finite(battery.level, 1) * 100, 0, 100); update('battery'); };
      battery.addEventListener?.('levelchange', onBattery);
    }).catch(() => {});
  }

  const heartbeat = setInterval(() => update('readiness'), 1500);
  update('install');

  const controller = Object.freeze({
    engineId: 'FND-017',
    version: INTELLIGENCE_RUNTIME_VERSION,
    update,
    snapshot: () => snapshot,
    setIntent(menu, feature = null) { selected = { menu: String(menu || 'EARTH'), feature }; return update('set-intent'); },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(heartbeat);
      clearInterval(refinementTimer);
      clearTimeout(stableTimer);
      try { refinementTask?.cancel?.('runtime disposed'); } catch (_) {}
      try { removeChanged?.(); } catch (_) {}
      try { removeMoveEnd?.(); } catch (_) {}
      try { removePolicyGuard?.(); } catch (_) {}
      document.removeEventListener('earthus:v2-feature-request', onFeature);
      globe.maximumScreenSpaceError = original.maximumScreenSpaceError;
      if ('tileCacheSize' in globe && Number.isFinite(original.tileCacheSize)) globe.tileCacheSize = original.tileCacheSize;
      globe.preloadSiblings = original.preloadSiblings;
      if ('requestRenderMode' in scene) scene.requestRenderMode = original.requestRenderMode;
      if (globalThis.__earthusV2IntelligenceSnapshot === snapshot) globalThis.__earthusV2IntelligenceSnapshot = null;
      scene.requestRender();
    },
  });
  return controller;
}

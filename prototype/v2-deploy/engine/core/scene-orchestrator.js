import { SCENE_MODE, THERMAL_STATE, VISUAL_ENGINE } from './constants.js';
import { clamp } from './math.js';

const SCENES = new Set(Object.values(SCENE_MODE));
const ENGINES = new Set(Object.values(VISUAL_ENGINE));
const STATIC_CONTEXT = new Set([VISUAL_ENGINE.RELIEF, VISUAL_ENGINE.FIELD, VISUAL_ENGINE.NETWORK, VISUAL_ENGINE.BEACON]);

const DEFAULT_PROFILES = Object.freeze({
  [SCENE_MODE.LAND]: Object.freeze({ outsideBrightness: 0.30, outsideSaturation: 0.25, terrainBrightness: 1.0, waterBrightness: 0.35, labelScale: 0.55 }),
  [SCENE_MODE.URBAN]: Object.freeze({ outsideBrightness: 0.22, outsideSaturation: 0.18, terrainBrightness: 0.65, waterBrightness: 0.25, labelScale: 0.45 }),
  [SCENE_MODE.OCEAN]: Object.freeze({ outsideBrightness: 0.20, outsideSaturation: 0.12, terrainBrightness: 0.25, waterBrightness: 1.0, labelScale: 0.40 }),
  [SCENE_MODE.ATMOSPHERE]: Object.freeze({ outsideBrightness: 0.24, outsideSaturation: 0.18, terrainBrightness: 0.35, waterBrightness: 0.35, labelScale: 0.35 }),
  [SCENE_MODE.EVENT]: Object.freeze({ outsideBrightness: 0.16, outsideSaturation: 0.10, terrainBrightness: 0.30, waterBrightness: 0.30, labelScale: 0.30 }),
  [SCENE_MODE.SPACE]: Object.freeze({ outsideBrightness: 0.12, outsideSaturation: 0.10, terrainBrightness: 0.20, waterBrightness: 0.20, labelScale: 0.25 }),
});

export function buildScenePlan({
  scene,
  primaryEngine,
  contextEngine = null,
  focus = null,
  thermalState = THERMAL_STATE.NORMAL,
  panelOpen = false,
  maxLabelsMobile = 5,
  maxLabelsDesktop = 8,
  deviceClass = 'desktop',
}) {
  if (!SCENES.has(scene)) throw new TypeError(`invalid scene: ${scene}`);
  if (!ENGINES.has(primaryEngine)) throw new TypeError(`invalid primaryEngine: ${primaryEngine}`);
  if (contextEngine && !STATIC_CONTEXT.has(contextEngine)) throw new TypeError(`contextEngine must be static: ${contextEngine}`);
  if (deviceClass === 'mobile' && primaryEngine === VISUAL_ENGINE.FLOW && contextEngine === VISUAL_ENGINE.VOLUME) {
    throw new Error('mobile hard rule violation: FLOW + VOLUME');
  }
  const profile = DEFAULT_PROFILES[scene];
  const qualityMultiplier = thermalState === THERMAL_STATE.NORMAL ? 1
    : thermalState === THERMAL_STATE.BALANCED ? 0.75
      : thermalState === THERMAL_STATE.ECO ? 0.4 : 0.1;
  const panelMultiplier = panelOpen ? 0.8 : 1;
  return Object.freeze({
    scene,
    primaryEngine,
    contextEngine,
    focus: focus ? structuredClone(focus) : null,
    contextDimming: Object.freeze({ ...profile }),
    transitionSeconds: deviceClass === 'mobile' ? 0.75 : 1.05,
    labelBudget: Math.max(0, Math.floor((deviceClass === 'mobile' ? maxLabelsMobile : maxLabelsDesktop) * panelMultiplier)),
    qualityScale: clamp(qualityMultiplier * panelMultiplier, 0.05, 1),
    renderContinuously: thermalState !== THERMAL_STATE.SAFE && [VISUAL_ENGINE.FLOW, VISUAL_ENGINE.VOLUME, VISUAL_ENGINE.PULSE, VISUAL_ENGINE.TRACK].includes(primaryEngine),
  });
}

export class SceneOrchestrator {
  #runtime;
  #state = null;

  constructor(runtime) {
    if (!runtime) throw new TypeError('runtime is required');
    this.#runtime = runtime;
  }

  async activate(plan, { primaryId, contextId = null, data = null, time = null } = {}) {
    if (!primaryId) throw new TypeError('primaryId is required');
    const previous = this.#state;
    if (previous?.primaryId && previous.primaryId !== primaryId) await this.#runtime.dispose(previous.primaryId);
    if (previous?.contextId && previous.contextId !== contextId) await this.#runtime.dispose(previous.contextId);

    const primarySnapshot = this.#runtime.snapshot().engines.find((entry) => entry.id === primaryId);
    if (!primarySnapshot) throw new Error(`primary engine is not registered: ${primaryId}`);
    if (primarySnapshot.lifecycle === 'REGISTERED') await this.#runtime.mount(primaryId, { scene: plan.scene });
    this.#runtime.setFocus(primaryId, plan.focus);
    this.#runtime.setQuality(primaryId, { scale: plan.qualityScale });
    if (data !== null) this.#runtime.setData(primaryId, data);
    if (time !== null) this.#runtime.setTime(primaryId, time);
    this.#runtime.activate(primaryId);

    if (contextId) {
      const contextSnapshot = this.#runtime.snapshot().engines.find((entry) => entry.id === contextId);
      if (!contextSnapshot) throw new Error(`context engine is not registered: ${contextId}`);
      if (contextSnapshot.lifecycle === 'REGISTERED') await this.#runtime.mount(contextId, { scene: plan.scene });
      this.#runtime.setFocus(contextId, plan.focus);
      this.#runtime.setQuality(contextId, { scale: plan.qualityScale });
      this.#runtime.activate(contextId);
    }
    this.#state = Object.freeze({ ...structuredClone(plan), primaryId, contextId });
    return this.#state;
  }

  snapshot() { return this.#state; }
}

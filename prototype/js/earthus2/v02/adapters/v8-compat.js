import { EVIDENCE_KIND, SCENE_MODE, VISUAL_ENGINE } from '../core/constants.js';

export const V8_REUSE_MAP = Object.freeze({
  truth: 'prototype/js/v8/truth-contract.js',
  sourceRegistry: 'prototype/js/v8/source-registry.js',
  unifiedTime: 'prototype/js/v8/unified-time.js',
  sceneState: 'prototype/js/v8/scene-state.js',
  runtimeCoordinator: 'prototype/js/v8/runtime-coordinator.js',
  visualLayerRegistry: 'prototype/js/v8/visual-layer-registry.js',
  sharedFlow: 'prototype/js/v8/shared-flow.js',
  humanRelief: 'prototype/js/v8/human-relief.js',
  oceanEngine: 'prototype/js/v8/ocean-engine.js',
  entitlement: 'prototype/js/v8/entitlement-contract.js',
  motionControllers: 'prototype/js/v8/motion-controllers.js',
  provenanceDock: 'prototype/js/v8/provenance-dock.js',
  thermal: 'prototype/js/power.js + prototype/js/render-quality.js',
});

const RENDERER_MAP = Object.freeze({
  RELIEF: VISUAL_ENGINE.RELIEF,
  FLOW: VISUAL_ENGINE.FLOW,
  FIELD: VISUAL_ENGINE.FIELD,
  VOLUME: VISUAL_ENGINE.VOLUME,
  EVENT: VISUAL_ENGINE.PULSE,
  ORBIT: VISUAL_ENGINE.TRACK,
  STORY: 'STORY_ORCHESTRATOR',
});

const DOMAIN_SCENE = Object.freeze({
  WEATHER: SCENE_MODE.ATMOSPHERE,
  AIR: SCENE_MODE.ATMOSPHERE,
  OCEAN: SCENE_MODE.OCEAN,
  HUMAN_CITY: SCENE_MODE.URBAN,
  OBSERVATION: SCENE_MODE.LAND,
  ECOLOGY: SCENE_MODE.LAND,
  HAZARD: SCENE_MODE.EVENT,
  ORBIT: SCENE_MODE.SPACE,
  STORY: SCENE_MODE.EVENT,
});

const TRUTH_MAP = Object.freeze({
  OBSERVED: EVIDENCE_KIND.OFFICIAL_OBSERVATION,
  OFFICIAL_FORECAST: EVIDENCE_KIND.OFFICIAL_FORECAST,
  OFFICIAL_WARNING: EVIDENCE_KIND.OFFICIAL_WARNING,
  MODEL_OUTPUT: EVIDENCE_KIND.PROVIDER_FORECAST,
  EARTHUS_DERIVED: EVIDENCE_KIND.EARTHUS_ANALYSIS,
  SIMULATION: EVIDENCE_KIND.SIMULATION,
});

export function adaptV8LayerDescriptor(descriptor) {
  if (!descriptor?.layerId || !descriptor?.renderer || !descriptor?.domain) throw new TypeError('v8 layer descriptor is incomplete');
  const primaryEngine = RENDERER_MAP[descriptor.renderer];
  if (!primaryEngine) throw new TypeError(`unsupported v8 renderer: ${descriptor.renderer}`);
  return Object.freeze({
    schemaVersion: 'earthus.visual-manifest.v2.0',
    legacySchemaVersion: descriptor.schemaVersion ?? '8.0',
    layerId: descriptor.layerId,
    scene: DOMAIN_SCENE[descriptor.domain] ?? SCENE_MODE.LAND,
    primaryEngine,
    timeModes: Object.freeze(['LIVE', 'FORECAST']),
    evidenceKinds: Object.freeze((descriptor.truthClasses ?? []).map((value) => TRUTH_MAP[value] ?? EVIDENCE_KIND.VISUALIZATION_ONLY)),
    sourceIds: Object.freeze([]),
    maxLabelsMobile: 5,
    maxLabelsDesktop: 8,
    qualityProfiles: Object.freeze([...(descriptor.qualityProfiles ?? [])]),
    reusedFromV8: true,
  });
}

export function assertNoDuplicateReuse(moduleIds) {
  const duplicates = moduleIds.filter((id) => Object.prototype.hasOwnProperty.call(V8_REUSE_MAP, id));
  if (duplicates.length) throw new Error(`existing v8 modules must be adapted, not reimplemented: ${duplicates.join(', ')}`);
  return true;
}

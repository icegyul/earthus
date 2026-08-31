import { EVIDENCE_KIND, SCENE_MODE, THERMAL_STATE, TIME_MODE, VISUAL_ENGINE } from '../core/constants.js';

const SCENES = new Set(Object.values(SCENE_MODE));
const ENGINES = new Set(Object.values(VISUAL_ENGINE));
const TIMES = new Set(Object.values(TIME_MODE));
const EVIDENCE = new Set(Object.values(EVIDENCE_KIND));
const THERMALS = new Set(Object.values(THERMAL_STATE));
const STATIC_CONTEXT = new Set([VISUAL_ENGINE.RELIEF, VISUAL_ENGINE.FIELD, VISUAL_ENGINE.NETWORK, VISUAL_ENGINE.BEACON]);

export function validateVisualManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return Object.freeze(['manifest must be an object']);
  if (typeof manifest.layerId !== 'string' || !manifest.layerId) errors.push('layerId is required');
  if (!SCENES.has(manifest.scene)) errors.push(`invalid scene: ${manifest.scene}`);
  if (!ENGINES.has(manifest.primaryEngine)) errors.push(`invalid primaryEngine: ${manifest.primaryEngine}`);
  if (manifest.contextEngine && !STATIC_CONTEXT.has(manifest.contextEngine)) errors.push(`contextEngine must be static: ${manifest.contextEngine}`);
  if (!Array.isArray(manifest.timeModes) || !manifest.timeModes.length) errors.push('timeModes are required');
  else for (const value of manifest.timeModes) if (!TIMES.has(value)) errors.push(`invalid time mode: ${value}`);
  if (!Array.isArray(manifest.evidenceKinds) || !manifest.evidenceKinds.length) errors.push('evidenceKinds are required');
  else for (const value of manifest.evidenceKinds) if (!EVIDENCE.has(value)) errors.push(`invalid evidence kind: ${value}`);
  if (!Number.isInteger(manifest.maxLabelsMobile) || manifest.maxLabelsMobile < 0) errors.push('maxLabelsMobile must be a non-negative integer');
  if (!Number.isInteger(manifest.maxLabelsDesktop) || manifest.maxLabelsDesktop < 0) errors.push('maxLabelsDesktop must be a non-negative integer');
  if (manifest.thermalFallback && !THERMALS.has(manifest.thermalFallback)) errors.push(`invalid thermalFallback: ${manifest.thermalFallback}`);
  if (!Array.isArray(manifest.sourceIds)) errors.push('sourceIds must be an array');
  return Object.freeze(errors);
}

export function createVisualManifest(input) {
  const errors = validateVisualManifest(input);
  if (errors.length) throw new TypeError(`invalid visual manifest: ${errors.join('; ')}`);
  return Object.freeze({
    schemaVersion: 'earthus.visual-manifest.v2.0',
    ...structuredClone(input),
  });
}

export function validateOneDataHero({ activePrimaryEngines, activeContextEngines }) {
  const errors = [];
  if ((activePrimaryEngines ?? []).length > 1) errors.push('more than one primary visual engine is active');
  if ((activeContextEngines ?? []).length > 1) errors.push('more than one static context engine is active');
  return Object.freeze(errors);
}

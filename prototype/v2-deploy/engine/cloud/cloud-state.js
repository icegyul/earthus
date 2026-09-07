import { clamp } from '../core/math.js';

export function retrieveCloudTopHeight({ brightnessTemperatureK, temperatureProfile, channelMethod = 'IR_WINDOW_MATCH', phaseCorrectionK = 0, parallaxCorrected = false, viewZenithDeg = null }) {
  if (!Number.isFinite(brightnessTemperatureK)) throw new TypeError('brightnessTemperatureK must be finite');
  const profile = (temperatureProfile ?? []).filter((level) => Number.isFinite(level?.heightM) && Number.isFinite(level?.temperatureK)).sort((a, b) => a.heightM - b.heightM);
  if (!profile.length) return Object.freeze({ heightM: null, state: 'UNKNOWN_NO_PROFILE', retrievalMethod: channelMethod, verticalUncertaintyM: null, qualityFlags: Object.freeze(['NO_PROFILE']) });
  const target = brightnessTemperatureK + phaseCorrectionK;
  const ranked = profile.map((level) => ({ level, delta: Math.abs(level.temperatureK - target) })).sort((a, b) => a.delta - b.delta);
  const best = ranked[0];
  const second = ranked[1];
  const ambiguity = second ? Math.abs(second.delta - best.delta) < 0.5 : false;
  const limbPenalty = Number.isFinite(viewZenithDeg) ? Math.max(0, viewZenithDeg - 55) * 25 : 0;
  const verticalUncertaintyM = 250 + best.delta * 300 + (ambiguity ? 500 : 0) + limbPenalty + (parallaxCorrected ? 0 : 400);
  const flags = [];
  if (!parallaxCorrected) flags.push('PARALLAX_NOT_CORRECTED');
  if (ambiguity) flags.push('PROFILE_MATCH_AMBIGUOUS');
  if (Number.isFinite(viewZenithDeg) && viewZenithDeg > 65) flags.push('HIGH_VIEW_ZENITH');
  return Object.freeze({
    heightM: best.level.heightM,
    temperatureDeltaK: best.delta,
    state: 'ESTIMATED',
    retrievalMethod: channelMethod,
    verticalUncertaintyM,
    parallaxCorrected,
    qualityFlags: Object.freeze(flags),
  });
}

export function retrieveCloudBaseHeight({ profile, relativeHumidityThreshold = 0.9, minimumLayerDepthM = 400, minimumCloudFraction = 0.35, lclHeightM = null, ceilometerHeightM = null }) {
  const levels = (profile ?? []).filter((level) => Number.isFinite(level?.heightM)).sort((a, b) => a.heightM - b.heightM);
  if (Number.isFinite(ceilometerHeightM)) return Object.freeze({ heightM: ceilometerHeightM, state: 'OBSERVED_CEILOMETER', verticalUncertaintyM: 50, qualityFlags: Object.freeze([]) });
  let start = null; let last = null;
  for (const level of levels) {
    const qualifies = Number.isFinite(level.relativeHumidity) && level.relativeHumidity >= relativeHumidityThreshold
      && Number.isFinite(level.cloudFraction) && level.cloudFraction >= minimumCloudFraction;
    if (!qualifies) { start = null; last = null; continue; }
    if (start === null) start = level.heightM;
    last = level.heightM;
    if (last - start >= minimumLayerDepthM) {
      const heightM = Number.isFinite(lclHeightM) ? (0.65 * start + 0.35 * lclHeightM) : start;
      return Object.freeze({ heightM, state: 'ESTIMATED_RH_LCL', verticalUncertaintyM: Number.isFinite(lclHeightM) ? 350 : 600, qualityFlags: Object.freeze(Number.isFinite(lclHeightM) ? [] : ['LCL_MISSING']) });
    }
  }
  return Object.freeze({ heightM: null, state: 'UNKNOWN_NO_SATURATED_LAYER', verticalUncertaintyM: null, qualityFlags: Object.freeze(['NO_PERSISTENT_LAYER']) });
}

export function detectCloudLayers(profile, { threshold = 0.35, minimumDepthM = 250 } = {}) {
  const levels = (profile ?? []).filter((level) => Number.isFinite(level?.heightM)).sort((a, b) => a.heightM - b.heightM);
  const layers = [];
  let active = null;
  for (const level of levels) {
    const cloudy = Number.isFinite(level.cloudFraction) && level.cloudFraction >= threshold;
    if (cloudy && !active) active = { baseM: level.heightM, topM: level.heightM, peakFraction: level.cloudFraction };
    else if (cloudy && active) { active.topM = level.heightM; active.peakFraction = Math.max(active.peakFraction, level.cloudFraction); }
    else if (!cloudy && active) {
      if (active.topM - active.baseM >= minimumDepthM) layers.push(active);
      active = null;
    }
  }
  if (active && active.topM - active.baseM >= minimumDepthM) layers.push(active);
  return Object.freeze({ layers: Object.freeze(layers.map((layer) => Object.freeze(layer))), multiLayerFlag: layers.length > 1 });
}

export function buildCloudDensityProfile(levels, weights = { cloudFraction: 0.35, relativeHumidity: 0.15, opticalDepth: 0.15, mask: 0.15, condensate: 0.20, uncertainty: 0.15 }) {
  return Object.freeze((levels ?? []).map((level) => {
    const density = clamp(
      weights.cloudFraction * clamp(level.cloudFraction ?? 0, 0, 1)
      + weights.relativeHumidity * clamp(level.relativeHumidity ?? 0, 0, 1)
      + weights.opticalDepth * clamp(level.opticalDepth ?? 0, 0, 1) * clamp(level.profileShape ?? 1, 0, 1)
      + weights.mask * clamp(level.cloudMask ?? 0, 0, 1)
      + weights.condensate * clamp(level.condensate ?? 0, 0, 1)
      - weights.uncertainty * clamp(level.uncertainty ?? 0, 0, 1),
      0, 1,
    );
    return Object.freeze({ ...structuredClone(level), density });
  }));
}

export function createCanonicalCloudState(input) {
  if (!input?.stateId || !input?.regionId || !input?.validAt || !input?.sourceSelection) throw new TypeError('cloud state is incomplete');
  const layers = Object.freeze((input.layers ?? []).map((layer) => Object.freeze(structuredClone(layer))));
  return Object.freeze({
    schemaVersion: 'earthus.cloud-state.v2.0',
    stateId: input.stateId,
    regionId: input.regionId,
    observedAt: input.observedAt ?? null,
    issuedAt: input.issuedAt ?? null,
    validAt: new Date(input.validAt).toISOString(),
    sourceSelection: Object.freeze(structuredClone(input.sourceSelection)),
    layers,
    lowCloudFraction: clamp(input.lowCloudFraction ?? 0, 0, 1),
    midCloudFraction: clamp(input.midCloudFraction ?? 0, 0, 1),
    highCloudFraction: clamp(input.highCloudFraction ?? 0, 0, 1),
    cloudTopHeightM: Number.isFinite(input.cloudTopHeightM) ? input.cloudTopHeightM : null,
    cloudBaseHeightM: Number.isFinite(input.cloudBaseHeightM) ? input.cloudBaseHeightM : null,
    opticalDepth: Number.isFinite(input.opticalDepth) ? Math.max(0, input.opticalDepth) : null,
    phase: input.phase ?? 'UNKNOWN',
    motion: input.motion ? Object.freeze(structuredClone(input.motion)) : null,
    confidence: clamp(input.confidence ?? 0, 0, 1),
    uncertainty: clamp(input.uncertainty ?? 1, 0, 1),
    retrievalMethod: input.retrievalMethod ?? 'MIXED',
    retrievalVersion: input.retrievalVersion ?? '0.2.0',
    verticalUncertaintyM: Number.isFinite(input.verticalUncertaintyM) ? input.verticalUncertaintyM : null,
    multiLayerFlag: input.multiLayerFlag === true,
    parallaxCorrected: input.parallaxCorrected === true,
    qualityFlags: Object.freeze([...(input.qualityFlags ?? [])]),
  });
}

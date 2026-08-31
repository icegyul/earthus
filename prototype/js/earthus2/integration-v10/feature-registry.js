import { TOP_MENU, SLOT } from '../frontend-v10/runtime/constants.js';

// Integration profile only: maps Earthus 2.0 product features to existing 1.0 layer ids.
// A mapping means "can reuse for preview/integration". It does NOT mean the 1.0 source is
// the final 2.0 production provider. Production provider choice is governed by Backend v1.0.
const defs = [
  // WEATHER / ATMOSPHERE
  ['weather.clouds', TOP_MENU.WEATHER, 'Clouds', ['clouds'], 'FIELD', ['NOW']],
  ['weather.temperature', TOP_MENU.WEATHER, 'Temperature', ['temp'], 'FIELD', ['NOW','FORECAST','HISTORY']],
  ['weather.humidity', TOP_MENU.WEATHER, 'Humidity', ['humidity'], 'FIELD', ['NOW','FORECAST']],
  ['weather.rain', TOP_MENU.WEATHER, 'Rain', ['rain'], 'FIELD', ['NOW','FORECAST']],
  ['weather.pressure', TOP_MENU.WEATHER, 'Pressure', ['pressure'], 'FIELD', ['NOW','FORECAST']],
  ['weather.tpw', TOP_MENU.WEATHER, 'Moisture / TPW', ['tpw'], 'FIELD', ['NOW','HISTORY']],
  ['weather.wind', TOP_MENU.WEATHER, 'Wind', ['wind'], 'FLOW', ['NOW']],
  ['weather.wind-forecast', TOP_MENU.WEATHER, 'Wind forecast', ['windfc'], 'FLOW', ['FORECAST']],
  ['air.pm25', TOP_MENU.WEATHER, 'PM2.5', ['pm25'], 'FIELD', ['NOW','FORECAST']],
  ['air.pm10', TOP_MENU.WEATHER, 'PM10', ['pm10'], 'FIELD', ['NOW','FORECAST']],
  ['air.aqi', TOP_MENU.WEATHER, 'Air quality', ['aqi'], 'FIELD', ['NOW','FORECAST']],
  ['air.ozone', TOP_MENU.WEATHER, 'Ozone', ['ozone'], 'FIELD', ['NOW','FORECAST']],
  ['air.dust', TOP_MENU.WEATHER, 'Dust', ['dust'], 'FIELD', ['NOW','FORECAST']],
  ['air.uv', TOP_MENU.WEATHER, 'UV', ['uv'], 'FIELD', ['NOW','FORECAST']],

  // OCEAN
  ['ocean.sst', TOP_MENU.OCEAN, 'Sea surface temperature', ['sst'], 'FIELD', ['NOW','HISTORY']],
  ['ocean.sst-anomaly', TOP_MENU.OCEAN, 'SST anomaly', ['sstanom'], 'FIELD', ['NOW','HISTORY']],
  ['ocean.wave', TOP_MENU.OCEAN, 'Wave', ['wave'], 'FIELD', ['NOW','FORECAST']],
  ['ocean.swell', TOP_MENU.OCEAN, 'Swell', ['swell'], 'FIELD', ['NOW','FORECAST']],
  // Current is scalar speed in current 1.0 evidence. Do not render as directional FLOW.
  ['ocean.surface-speed', TOP_MENU.OCEAN, 'Surface current speed', ['current'], 'FIELD', ['NOW','FORECAST']],

  // HAZARD
  ['hazard.cyclone', TOP_MENU.HAZARD, 'Cyclone / Typhoon', ['cyclone'], 'TRACK', ['NOW','FORECAST','HISTORY']],
  ['hazard.earthquake', TOP_MENU.HAZARD, 'Earthquake', ['quake'], 'PULSE', ['NOW','HISTORY']],
  ['hazard.tsunami', TOP_MENU.HAZARD, 'Tsunami', ['tsunami'], 'PULSE', ['NOW','HISTORY']],
  ['hazard.wildfire', TOP_MENU.HAZARD, 'Wildfire', ['wildfire'], 'PULSE', ['NOW','HISTORY']],
  ['hazard.lightning', TOP_MENU.HAZARD, 'Lightning', ['lightning'], 'PULSE', ['NOW','HISTORY']],

  // HUMAN / TRAVEL
  ['human.tourism', TOP_MENU.HUMAN, 'Tourism / Crowd', ['tourism'], 'RELIEF', ['NOW','FORECAST','HISTORY']],
  ['human.poi', TOP_MENU.HUMAN, 'Places', ['poi'], 'BEACON', ['NOW']],

  // SPACE. The layer mappings are reusable, but full AETHERUS scene transfer remains exclusive.
  ['space.aurora', TOP_MENU.SPACE, 'Aurora', ['aurora'], 'FIELD', ['NOW','FORECAST']],
  ['space.orbits', TOP_MENU.SPACE, 'Satellites', ['orbits'], 'TRACK', ['NOW']],

  // PULSE is an orchestrator, not a legacy render layer.
  ['pulse.news', TOP_MENU.PULSE, 'News', [], 'BEACON', ['NOW']],
  ['pulse.actions', TOP_MENU.PULSE, 'Actions', [], 'BEACON', ['NOW']],
  ['pulse.events', TOP_MENU.PULSE, 'Events', [], 'BEACON', ['NOW','HISTORY']],
];

export const FEATURE_DEFS = Object.freeze(defs.map(([id, menu, label, legacyLayerIds, renderer, timeModes]) => Object.freeze({
  id, menu, label, slot: SLOT.PRIMARY, legacyLayerIds: Object.freeze([...legacyLayerIds]),
  renderer, timeModes: Object.freeze([...timeModes]), integrationMode: legacyLayerIds.length ? 'LEGACY_PREVIEW_BRIDGE' : 'ORCHESTRATOR_ONLY',
})));

const byId = new Map(FEATURE_DEFS.map(def => [def.id, def]));

export function getFeature(id) {
  const def = byId.get(id);
  if (!def) throw new TypeError(`unknown Earthus 2.0 feature: ${id}`);
  return def;
}

export function featuresForMenu(menu) {
  return FEATURE_DEFS.filter(def => def.menu === menu);
}

export function hasFeature(id) { return byId.has(id); }

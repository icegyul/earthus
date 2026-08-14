import { evaluateOceanSafety, applyOceanSafetyGate } from '../../prototype/js/ocean/safety-gate.js';
import { renderOceanSafetyShadow } from '../../prototype/js/ocean/shadow-view.js';

const observedAt = '2026-08-14T09:50:00.000Z';
const fresh = Object.freeze({ status: 'FRESH', usable: true, ageMinutes: 10, reason: null });
const evidence = (kind, state, reason) => Object.freeze({
  schema: 'earthus.ocean-safety-evidence.v1', kind, state, official: true,
  sourceId: `fixture-${kind.toLowerCase()}`, generatedAt: observedAt, observedAt,
  freshness: fresh, reason, matches: [],
});
const wave = Object.freeze({
  schema: 'earthus.ocean-observation.v1', metric: 'WAVE_HEIGHT', value: 1.6, unit: 'm',
  sourceId: 'fixture-kma-marine', provenance: 'MEASURED', observedAt, validFrom: observedAt,
  quality: 'FRESH', freshness: fresh,
});
const temperature = Object.freeze({
  schema: 'earthus.ocean-observation.v1', metric: 'SEA_SURFACE_TEMPERATURE', value: 24.3,
  unit: 'degC', sourceId: 'fixture-kma-marine', provenance: 'MEASURED', observedAt,
  validFrom: observedAt, quality: 'FRESH', freshness: fresh,
});
const wavePolicy = Object.freeze({
  status: 'APPROVED', thresholdM: 4, revision: 'FIXTURE_ONLY',
});

function scenario(mode) {
  if (mode === 'blocked') return [
    evidence('LIGHTNING', 'ACTIVE', 'OFFICIAL_DISCHARGE_WITHIN_RADIUS'),
    evidence('TYPHOON', 'INACTIVE', 'OUTSIDE_OFFICIAL_AREAS_WITH_APPROVED_COVERAGE'),
    evidence('CLOSURE', 'INACTIVE', 'NO_ACTIVE_CLOSURE_IN_APPROVED_COVERAGE'),
  ];
  if (mode === 'clear') return [
    evidence('LIGHTNING', 'INACTIVE', 'NO_RECENT_DISCHARGE_WITHIN_APPROVED_COVERAGE'),
    evidence('TYPHOON', 'INACTIVE', 'OUTSIDE_OFFICIAL_AREAS_WITH_APPROVED_COVERAGE'),
    evidence('CLOSURE', 'INACTIVE', 'NO_ACTIVE_CLOSURE_IN_APPROVED_COVERAGE'),
  ];
  return [
    evidence('LIGHTNING', 'INACTIVE', 'NO_RECENT_DISCHARGE_WITHIN_APPROVED_COVERAGE'),
    evidence('TYPHOON', 'INACTIVE', 'OUTSIDE_OFFICIAL_AREAS_WITH_APPROVED_COVERAGE'),
    evidence('CLOSURE', 'UNKNOWN', 'OBSERVATION_IS_NOT_CLOSURE'),
  ];
}

function render(mode) {
  const safety = evaluateOceanSafety({
    evidence: scenario(mode), waveObservation: wave, extremeWavePolicy: wavePolicy,
  });
  const gatedResult = applyOceanSafetyGate({ candidateScore: 72, safety });
  document.getElementById('oceanShadowHost').innerHTML = renderOceanSafetyShadow({
    safety, gatedResult, observations: [wave, temperature], lang: 'ko',
    title: `Ocean Core · ${mode.toUpperCase()} fixture`,
  });
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  history.replaceState(null, '', `?mode=${encodeURIComponent(mode)}`);
  window.__oceanShadowState = Object.freeze({ mode, safety, gatedResult });
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => render(button.dataset.mode));
});
const requested = new URLSearchParams(location.search).get('mode');
render(['blocked', 'unknown', 'clear'].includes(requested) ? requested : 'unknown');
window.__oceanShadowReady = true;

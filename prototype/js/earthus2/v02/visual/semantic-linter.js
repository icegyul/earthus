import { EVIDENCE_KIND, TIME_MODE, VISUAL_ENGINE } from '../core/constants.js';

export function lintVisualSemantics(manifest, style = {}) {
  const findings = [];
  const evidence = new Set(manifest?.evidenceKinds ?? []);
  const timeModes = new Set(manifest?.timeModes ?? []);
  const accent = String(style.accentRole ?? '').toUpperCase();

  if (accent === 'RED' && !evidence.has(EVIDENCE_KIND.OFFICIAL_WARNING)) {
    findings.push({ severity: 'ERROR', code: 'RED_RESERVED_FOR_OFFICIAL_RISK', message: 'red accent is reserved for official or verified risk' });
  }
  if (timeModes.has(TIME_MODE.FORECAST) && style.forecastPattern === 'SOLID_CURRENT') {
    findings.push({ severity: 'ERROR', code: 'FORECAST_LOOKS_CURRENT', message: 'forecast must not use current-observation styling' });
  }
  if (evidence.has(EVIDENCE_KIND.SIMULATION) && style.simulationLabel !== true) {
    findings.push({ severity: 'ERROR', code: 'SIMULATION_LABEL_MISSING', message: 'simulation requires an explicit label' });
  }
  if (manifest?.primaryEngine === VISUAL_ENGINE.TOWER && style.fineGrid === true && style.actualGrid !== true) {
    findings.push({ severity: 'ERROR', code: 'FABRICATED_SPATIAL_PRECISION', message: 'fine towers require an actual verified grid' });
  }
  if ((manifest?.maxLabelsMobile ?? 0) > 8) findings.push({ severity: 'WARN', code: 'MOBILE_LABEL_BUDGET_HIGH', message: 'mobile labels exceed the Neo-Minimal budget' });
  if (style.alwaysAnimating === true && ![VISUAL_ENGINE.FLOW, VISUAL_ENGINE.VOLUME, VISUAL_ENGINE.TRACK, VISUAL_ENGINE.PULSE].includes(manifest?.primaryEngine)) {
    findings.push({ severity: 'WARN', code: 'UNNECESSARY_CONTINUOUS_ANIMATION', message: 'continuous animation is not justified for this engine' });
  }
  return Object.freeze(findings);
}

export function visualSemanticPass(findings) {
  return !(findings ?? []).some((finding) => finding.severity === 'ERROR');
}

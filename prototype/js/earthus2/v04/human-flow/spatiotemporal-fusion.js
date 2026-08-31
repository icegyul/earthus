import { DATA_STATE } from '../../v02/core/constants.js';

function referenceAt(signal) {
  return signal?.times?.observedAt ?? signal?.times?.validAt ?? signal?.times?.issuedAt ?? signal?.times?.receivedAt ?? null;
}

export function buildSpatiotemporalSnapshot(signals, { snapshotAt, freshnessByVariable = {}, defaultMaxAgeSec = 7200, requiredVariables = [] } = {}) {
  if (!Array.isArray(signals)) throw new TypeError('signals must be an array');
  const atMs = Date.parse(snapshotAt);
  if (!Number.isFinite(atMs)) throw new TypeError('snapshotAt must be ISO date-time');
  const grouped = new Map();
  const rejected = [];
  for (const signal of signals) {
    if (!signal?.variable) { rejected.push({ signalId: signal?.signalId ?? null, reason: 'MISSING_VARIABLE' }); continue; }
    const ref = referenceAt(signal); const refMs = Date.parse(ref);
    if (!Number.isFinite(refMs)) { rejected.push({ signalId: signal.signalId ?? null, reason: 'MISSING_REFERENCE_TIME' }); continue; }
    const maxAge = Number.isFinite(freshnessByVariable[signal.variable]) ? freshnessByVariable[signal.variable] : defaultMaxAgeSec;
    const ageSec = Math.abs(atMs - refMs) / 1000;
    if (ageSec > maxAge) { rejected.push({ signalId: signal.signalId ?? null, reason: 'OUTSIDE_STALENESS_WINDOW', ageSec }); continue; }
    if (!grouped.has(signal.variable)) grouped.set(signal.variable, []);
    grouped.get(signal.variable).push({ signal, ageSec, refMs });
  }
  const selected = {};
  for (const [variable, rows] of grouped) {
    rows.sort((a,b) => a.ageSec - b.ageSec || b.refMs - a.refMs);
    selected[variable] = rows[0].signal;
  }
  const missingRequired = requiredVariables.filter(v => !selected[v]);
  const state = missingRequired.length ? DATA_STATE.DEGRADED : Object.keys(selected).length ? DATA_STATE.LIVE : DATA_STATE.UNAVAILABLE;
  return Object.freeze({ snapshotAt: new Date(atMs).toISOString(), state, signals: Object.freeze(selected), missingRequired: Object.freeze(missingRequired), rejected: Object.freeze(rejected) });
}

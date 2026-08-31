export const INTELLIGENCE_STATES = Object.freeze(['DRAFT','SHADOW','CANARY','ACTIVE','ROLLBACK','RETIRED']);
export const EVIDENCE_KINDS = Object.freeze(['OBSERVED','OFFICIAL_FORECAST','OFFICIAL_WARNING','REPORTED','DETECTED','MODELLED','HISTORICAL','SIMULATION']);
export const DATA_STATES = Object.freeze(['LIVE','DEGRADED','STALE','UNAVAILABLE']);
const stateSet = new Set(INTELLIGENCE_STATES);
const evidenceSet = new Set(EVIDENCE_KINDS);
const dataStateSet = new Set(DATA_STATES);
export const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export function isoOrNull(value) { if (!value) return null; const t=Date.parse(value); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
export function requireState(value, fallback='SHADOW') { return stateSet.has(value) ? value : fallback; }
export function requireEvidenceKind(value) { return evidenceSet.has(value) ? value : null; }
export function requireDataState(value, fallback='UNAVAILABLE') { return dataStateSet.has(value) ? value : fallback; }
export function unavailable(reason='NO_EVIDENCE', extra={}) { return Object.freeze({ state:'UNAVAILABLE', reason, ...extra }); }
export function stableId(parts=[]) {
  const input=parts.map(v=>String(v??'')).join('|'); let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}
  return `ei_${(h>>>0).toString(16).padStart(8,'0')}`;
}
export function publicReleaseAllowed(state) { return state==='ACTIVE' || state==='CANARY'; }

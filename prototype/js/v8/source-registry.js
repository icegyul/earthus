const OPERATIONS = Object.freeze(['display', 'cache', 'history', 'derivative', 'redistribution', 'paidExport', 'apiResale', 'aiUse']);
const OPERATION_SET = new Set(OPERATIONS);
const TIME_KEYS = ['observedAt', 'issuedAt', 'validAt', 'receivedAt'];

function clone(value) { return structuredClone(value); }
function referenceTime(source) { return TIME_KEYS.map(key => source.times[key]).find(Boolean) ?? null; }

function validateSource(source) {
  if (!source || typeof source !== 'object') throw new TypeError('source is required');
  if (typeof source.sourceRef !== 'string' || !source.sourceRef.startsWith('src_')) throw new TypeError('sourceRef must start with src_');
  if (!source.provider?.name || !source.provider?.dataset) throw new TypeError('provider name and dataset are required');
  if (!source.times || TIME_KEYS.some(key => !(key in source.times))) throw new TypeError('all four source times are required, using null when unknown');
  if (!source.rights || OPERATIONS.some(operation => typeof source.rights[operation] !== 'boolean')) throw new TypeError('complete boolean rights matrix is required');
  return clone(source);
}

export class SourceRegistry {
  #current = new Map();
  #history = new Map();
  #now;

  constructor({ now = () => new Date().toISOString() } = {}) { this.#now = now; }

  register(source) {
    const snapshot = validateSource(source);
    const history = this.#history.get(snapshot.sourceRef) ?? [];
    history.push(snapshot);
    this.#history.set(snapshot.sourceRef, history);
    this.#current.set(snapshot.sourceRef, snapshot);
    return clone(snapshot);
  }

  get(sourceRef) { return this.#current.has(sourceRef) ? clone(this.#current.get(sourceRef)) : null; }
  history(sourceRef) { return (this.#history.get(sourceRef) ?? []).map(clone); }

  evaluateOperation(sourceRef, operation) {
    if (!OPERATION_SET.has(operation)) throw new TypeError(`unknown operation: ${operation}`);
    const source = this.#current.get(sourceRef);
    if (!source) return { state: 'UNKNOWN_SOURCE', sourceRef, operation };
    return { state: source.rights[operation] ? 'ALLOWED' : 'BLOCKED_RIGHTS', sourceRef, operation };
  }

  summarize(sourceRefs) {
    const sources = [...new Set(sourceRefs)].map(ref => this.#current.get(ref)).filter(Boolean);
    const nowMs = Date.parse(this.#now());
    const references = sources.map(referenceTime).filter(Boolean).sort();
    const staleCount = sources.filter(source => {
      const at = Date.parse(referenceTime(source));
      return Number.isFinite(nowMs) && Number.isFinite(at) && Number.isFinite(source.freshnessSeconds)
        ? (nowMs - at) / 1000 > source.freshnessSeconds
        : false;
    }).length;
    return Object.freeze({
      sourceCount: sources.length,
      oldestReferenceAt: references[0] ?? null,
      staleCount,
      operationStates: [...new Set(sources.map(source => source.operationState))].sort(),
    });
  }
}

export { OPERATIONS };

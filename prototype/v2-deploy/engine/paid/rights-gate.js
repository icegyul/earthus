const OPERATIONS = Object.freeze(['display', 'cache', 'history', 'derivative', 'redistribution', 'paidExport', 'apiResale', 'aiUse']);

export function evaluateRights(source, operation) {
  if (!OPERATIONS.includes(operation)) throw new TypeError(`unknown rights operation: ${operation}`);
  if (!source?.sourceId || !source?.rights) return Object.freeze({ state: 'UNKNOWN', reason: 'SOURCE_OR_RIGHTS_MISSING' });
  const value = source.rights[operation];
  if (value === true) return Object.freeze({ state: 'ALLOWED', sourceId: source.sourceId, operation });
  if (value === false) return Object.freeze({ state: 'BLOCKED', sourceId: source.sourceId, operation });
  return Object.freeze({ state: 'UNKNOWN', sourceId: source.sourceId, operation });
}

export function combineRights(sources, operation) {
  const evaluations = sources.map((source) => evaluateRights(source, operation));
  if (evaluations.some((item) => item.state === 'BLOCKED')) return Object.freeze({ state: 'BLOCKED', evaluations: Object.freeze(evaluations) });
  if (evaluations.some((item) => item.state === 'UNKNOWN')) return Object.freeze({ state: 'UNKNOWN', evaluations: Object.freeze(evaluations) });
  return Object.freeze({ state: 'ALLOWED', evaluations: Object.freeze(evaluations) });
}

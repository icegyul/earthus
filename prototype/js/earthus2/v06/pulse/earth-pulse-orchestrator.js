const SAFETY_TYPES = new Set(['OFFICIAL_WARNING','TSUNAMI','EARTHQUAKE','WILDFIRE','CYCLONE','FLOOD','EVACUATION']);

export function pulsePriority(event = {}, context = {}) {
  const officialSafety = event.officialSafety === true || SAFETY_TYPES.has(String(event.eventType || '').toUpperCase());
  if (officialSafety) return 1000 + Number(event.severity || 0) * 20;
  const freshness = Math.max(0, Math.min(1, Number(event.freshness ?? 0.5)));
  const confidence = Math.max(0, Math.min(1, Number(event.confidence ?? 0.5)));
  const relevance = Math.max(0, Math.min(1, Number(event.geographicRelevance ?? context.defaultRelevance ?? 0.5)));
  const interest = Math.max(0, Math.min(1, Number(event.publicInterest ?? 0.5)));
  const action = event.kind === 'ACTION' ? 0.08 : 0;
  return 100 * (0.3*freshness + 0.3*confidence + 0.25*relevance + 0.15*interest + action);
}

export function compileEarthPulse({ events = [], news = [], actions = [], context = {} } = {}) {
  const joined = [
    ...events.map((e) => ({ ...e, kind: e.kind || 'EVENT' })),
    ...news.map((e) => ({ ...e, kind: 'NEWS' })),
    ...actions.map((e) => ({ ...e, kind: 'ACTION' })),
  ];
  return joined.map((e) => ({ ...e, priorityScore: pulsePriority(e, context) })).sort((a,b) => b.priorityScore-a.priorityScore);
}

export function buildEarthEventDetail(event = {}) {
  return {
    id: event.id || null,
    title: event.title || null,
    status: event.status || 'UNKNOWN',
    observation: event.observation || [],
    official: event.official || [],
    news: event.news || [],
    actions: event.actions || [],
    earthusAnalysis: event.earthusAnalysis || [],
  };
}

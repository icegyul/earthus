// Purpose shortcuts reuse existing screens; no second data pipeline or layer state.
export const QUESTION_ENTRIES = Object.freeze([
  { id: 'weather', ko: '지금 날씨는 어떤가요?', en: 'What is the weather now?', subKo: '기상청 관측 · 레이더 · 공식예보', subEn: 'KMA observations · radar · forecasts' },
  { id: 'alerts', ko: '지금 어떤 경보가 있나요?', en: 'What alerts are current?', subKo: '기관 발표 · 재난 현황', subEn: 'Agency bulletins · event feed' },
  { id: 'ocean', ko: '바다 활동 전에 무엇을 볼까요?', en: 'What should I check at sea?', subKo: '파고 · 부이 · 서핑 · 낚시', subEn: 'Waves · buoys · surfing · fishing' },
  { id: 'travel', ko: '오늘 어디를 살펴볼까요?', en: 'Where can I explore today?', subKo: '지역별 근거와 여행 정보', subEn: 'Destinations and local evidence' },
  { id: 'sky', ko: '오늘 밤 하늘에서 무엇을 볼까요?', en: 'What is in the sky tonight?', subKo: '별보기 조건 · 유성우 · 일식', subEn: 'Sky conditions · meteor showers · eclipses' },
]);

export const EXPERT_SATELLITE_IDS = Object.freeze([
  'gk2aIR', 'gk2aNightLow', 'gk2aVIS', 'gk2aVISfd', 'gk2aIRea', 'gk2aVISea', 'gk2aWV', 'himaIR',
]);

export function matchesLayerQuery(text, query) {
  const haystack = String(text || '').normalize('NFKC').toLocaleLowerCase();
  return String(query || '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/)
    .filter(Boolean).every((word) => haystack.includes(word));
}

export function partitionLayerItems(items, quickIds) {
  const quick = new Set(quickIds);
  const expert = new Set(EXPERT_SATELLITE_IDS);
  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  return {
    quick: unique.filter((item) => quick.has(item.id)),
    regular: unique.filter((item) => !quick.has(item.id) && !expert.has(item.id)),
    expert: unique.filter((item) => !quick.has(item.id) && expert.has(item.id)),
  };
}

export function clearSelectedLayers(definitions, state) {
  const active = definitions.filter((item) => state.isOn(item.id)).map((item) => item.id);
  // Use the normal per-layer teardown event; replacing state leaves map entities alive.
  for (const id of active) state.setLayer(id, false);
  return active.length;
}

export async function openQuestionEntry(id, handlers) {
  if (!QUESTION_ENTRIES.some((entry) => entry.id === id) || typeof handlers[id] !== 'function') return false;
  await handlers[id]();
  return true;
}

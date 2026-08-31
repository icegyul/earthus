const TRUST_RANK = Object.freeze({
  OFFICIAL_API: 5,
  OFFICIAL_RSS: 5,
  OFFICIAL_PAGE: 4,
  OFFICIAL_EVENT_PLATFORM: 4,
  OFFICIAL_SOCIAL: 3,
  NEWS_REPORT: 2,
  COMMUNITY_REPORT: 1,
});

export function normalizeActionSource(source = {}) {
  const type = String(source.type || 'COMMUNITY_REPORT').toUpperCase();
  const trustRank = TRUST_RANK[type] ?? 0;
  return {
    id: String(source.id || ''),
    organization: String(source.organization || ''),
    type,
    trustRank,
    official: trustRank >= 3 && type !== 'NEWS_REPORT',
    url: source.url || null,
    feedUrl: source.feedUrl || null,
    allowedOperations: Array.isArray(source.allowedOperations) ? [...new Set(source.allowedOperations)] : ['DISPLAY_LINK'],
    attribution: source.attribution || source.organization || null,
  };
}

export function choosePreferredActionSource(sources = []) {
  const normalized = sources.map(normalizeActionSource).filter((s) => s.id || s.url);
  normalized.sort((a, b) => b.trustRank - a.trustRank || String(a.id).localeCompare(String(b.id)));
  return normalized[0] || null;
}

export { TRUST_RANK };

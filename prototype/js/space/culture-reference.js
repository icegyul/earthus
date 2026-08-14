// Aetherus Culture Layer v1 local shadow contract (Sheets 151-163).
// No provider fetch, copied quotation, auto-publish, cache write, timer or notification dispatch.

export const CULTURE_CATALOG_SCHEMA = 'earthus.aetherus-culture-catalog.v1';
export const CULTURE_WORK_TYPES = Object.freeze([
  'LITERATURE', 'FILM', 'DRAMA', 'MYTH', 'GAME', 'MUSIC', 'ART',
]);
export const CULTURE_RELATIONS = Object.freeze([
  'DIRECT_MENTION', 'SETTING', 'MOTIF', 'INSPIRED_BY', 'NAMESAKE',
]);
export const CULTURE_RIGHTS = Object.freeze([
  'UNKNOWN', 'RESTRICTED', 'EMBED_ONLY', 'METADATA_ONLY', 'PUBLIC_DOMAIN', 'LICENSED', 'CC_BY',
]);
const PUBLISHABLE_RIGHTS = new Set([
  'EMBED_ONLY', 'METADATA_ONLY', 'PUBLIC_DOMAIN', 'LICENSED', 'CC_BY',
]);

export class CultureReferenceError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'CultureReferenceError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new CultureReferenceError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:-]{1,160}$/.test(output), code); return output;
};
const text = (value, code, max = 1200) => {
  const output = String(value || '').trim();
  requireValue(output.length > 0 && output.length <= max, code); return output;
};
const utc = (value, code = 'CULTURE_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
const https = (value, code) => {
  let parsed;
  try { parsed = new URL(value); } catch { fail(code); }
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password, code);
  return parsed.toString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function normalizeRights(value) {
  requireValue(CULTURE_RIGHTS.includes(value?.status), 'CULTURE_RIGHTS_STATUS_INVALID');
  const status = value.status;
  const output = {
    status,
    creditText: value.creditText ? text(value.creditText, 'CULTURE_CREDIT_REQUIRED', 500) : null,
    sourceUrl: value.sourceUrl ? https(value.sourceUrl, 'CULTURE_RIGHTS_SOURCE_INVALID') : null,
    verifiedAt: value.verifiedAt ? utc(value.verifiedAt) : null,
    license: value.license ? text(value.license, 'CULTURE_LICENSE_INVALID', 240) : null,
    scope: value.scope ? text(value.scope, 'CULTURE_LICENSE_SCOPE_INVALID', 240) : null,
  };
  if (PUBLISHABLE_RIGHTS.has(status)) {
    requireValue(output.creditText && output.sourceUrl && output.verifiedAt,
      'CULTURE_RIGHTS_EVIDENCE_REQUIRED');
  }
  if (status === 'LICENSED') {
    requireValue(output.license && output.scope, 'CULTURE_LICENSE_EVIDENCE_REQUIRED');
  }
  if (status === 'CC_BY') {
    requireValue(/^CC BY(?: |$)/.test(output.license || ''), 'CULTURE_CC_BY_LICENSE_REQUIRED');
  }
  if (status === 'PUBLIC_DOMAIN') {
    requireValue(output.license === 'PUBLIC_DOMAIN', 'CULTURE_PUBLIC_DOMAIN_EVIDENCE_REQUIRED');
  }
  return freeze(output);
}

function normalizeSources(sources, relationType) {
  requireValue(Array.isArray(sources) && sources.length > 0,
    'CULTURE_SOURCE_REFERENCE_REQUIRED');
  const normalized = sources.map(source => {
    requireValue(['OFFICIAL', 'PRIMARY', 'SECONDARY'].includes(source?.authority),
      'CULTURE_SOURCE_AUTHORITY_INVALID');
    return freeze({
      id: token(source.id, 'CULTURE_SOURCE_ID_REQUIRED'),
      authority: source.authority,
      title: text(source.title, 'CULTURE_SOURCE_TITLE_REQUIRED', 500),
      url: https(source.url, 'CULTURE_SOURCE_URL_INVALID'),
      verifiedAt: utc(source.verifiedAt),
    });
  });
  requireValue(new Set(normalized.map(source => source.id)).size === normalized.length,
    'CULTURE_SOURCE_ID_DUPLICATE');
  if (relationType === 'DIRECT_MENTION' || relationType === 'NAMESAKE') {
    requireValue(normalized.some(source => source.authority === 'OFFICIAL'
      || source.authority === 'PRIMARY'), 'CULTURE_RELATION_PRIMARY_SOURCE_REQUIRED');
  }
  return freeze(normalized);
}

function normalizeMedia(value, rights) {
  const media = value && typeof value === 'object' ? value : {};
  const output = {
    officialTrailerUrl: media.officialTrailerUrl
      ? https(media.officialTrailerUrl, 'CULTURE_TRAILER_URL_INVALID') : null,
    officialStillUrl: media.officialStillUrl
      ? https(media.officialStillUrl, 'CULTURE_STILL_URL_INVALID') : null,
    cachedUrl: media.cachedUrl ? https(media.cachedUrl, 'CULTURE_CACHED_URL_INVALID') : null,
  };
  if (rights.status === 'EMBED_ONLY') {
    requireValue(output.officialTrailerUrl || output.officialStillUrl,
      'CULTURE_EMBED_LINK_REQUIRED');
    requireValue(output.cachedUrl === null, 'CULTURE_EMBED_ONLY_CACHE_FORBIDDEN');
  }
  if (rights.status === 'METADATA_ONLY') {
    requireValue(output.cachedUrl === null, 'CULTURE_METADATA_ONLY_CACHE_FORBIDDEN');
  }
  if (!['PUBLIC_DOMAIN', 'LICENSED', 'CC_BY'].includes(rights.status)) {
    requireValue(output.cachedUrl === null, 'CULTURE_MEDIA_CACHE_RIGHTS_REQUIRED');
  }
  return freeze(output);
}

export function normalizeCultureReference(raw) {
  requireValue(['DRAFT', 'VERIFIED', 'REJECTED'].includes(raw?.status),
    'CULTURE_REFERENCE_STATUS_INVALID');
  requireValue(CULTURE_WORK_TYPES.includes(raw?.workType), 'CULTURE_WORK_TYPE_INVALID');
  requireValue(CULTURE_RELATIONS.includes(raw?.relationType), 'CULTURE_RELATION_TYPE_INVALID');
  const rights = normalizeRights(raw.rights);
  const releaseYear = raw.releaseYear == null ? null : Number(raw.releaseYear);
  requireValue(releaseYear == null || (Number.isInteger(releaseYear)
    && releaseYear >= -4000 && releaseYear <= 3000), 'CULTURE_RELEASE_YEAR_INVALID');
  requireValue(raw.quotation == null, 'CULTURE_VERBATIM_QUOTATION_FORBIDDEN');
  requireValue(raw?.relationSummary?.authorship === 'EARTHUS_EDITORIAL',
    'CULTURE_EDITORIAL_SUMMARY_REQUIRED');
  const createdAt = utc(raw.createdAt);
  const updatedAt = utc(raw.updatedAt);
  requireValue(Date.parse(updatedAt) >= Date.parse(createdAt), 'CULTURE_UPDATE_BEFORE_CREATE');
  const output = {
    schema: 'earthus.culture-reference.v1',
    id: token(raw.id, 'CULTURE_REFERENCE_ID_REQUIRED'),
    status: raw.status,
    sourceProvider: token(raw.sourceProvider, 'CULTURE_SOURCE_PROVIDER_REQUIRED'),
    sourceAssetId: token(raw.sourceAssetId, 'CULTURE_SOURCE_ASSET_ID_REQUIRED'),
    celestialObjectId: token(raw.celestialObjectId, 'CULTURE_CELESTIAL_OBJECT_ID_REQUIRED'),
    workType: raw.workType,
    title: text(raw.title, 'CULTURE_TITLE_REQUIRED', 500),
    creator: text(raw.creator, 'CULTURE_CREATOR_REQUIRED', 500),
    releaseYear,
    relationType: raw.relationType,
    relationSummary: freeze({ text: text(raw.relationSummary.text,
      'CULTURE_RELATION_SUMMARY_REQUIRED'), authorship: 'EARTHUS_EDITORIAL' }),
    quotation: null,
    media: null,
    rights,
    sources: normalizeSources(raw.sources, raw.relationType),
    createdAt,
    updatedAt,
  };
  output.media = normalizeMedia(raw.media, rights);
  return freeze(output);
}

export function validateCultureCatalog(raw) {
  requireValue(raw?.schema === CULTURE_CATALOG_SCHEMA, 'CULTURE_CATALOG_SCHEMA_INVALID');
  requireValue(raw?.revision, 'CULTURE_CATALOG_REVISION_REQUIRED');
  requireValue(Array.isArray(raw?.items), 'CULTURE_CATALOG_ITEMS_REQUIRED');
  const items = raw.items.map(normalizeCultureReference);
  requireValue(new Set(items.map(item => item.id)).size === items.length,
    'CULTURE_REFERENCE_ID_DUPLICATE');
  const sourceKeys = items.map(item => `${item.sourceProvider}:${item.sourceAssetId}`);
  requireValue(new Set(sourceKeys).size === sourceKeys.length, 'CULTURE_PROVIDER_OBJECT_DUPLICATE');
  return freeze({ schema: CULTURE_CATALOG_SCHEMA, revision: String(raw.revision),
    fixtureOnly: raw.fixtureOnly === true, generatedAt: utc(raw.generatedAt), items });
}

export function evaluateCultureRights(reference) {
  const rights = reference?.rights;
  if (!rights || ['UNKNOWN', 'RESTRICTED'].includes(rights.status)) {
    return freeze({ state: 'BLOCKED_RIGHTS', publicReadAllowed: false,
      automaticPublishAllowed: false, reason: `RIGHTS_${rights?.status || 'MISSING'}` });
  }
  if (reference.status !== 'VERIFIED') {
    return freeze({ state: 'UNVERIFIED', publicReadAllowed: false,
      automaticPublishAllowed: false, reason: 'REFERENCE_NOT_VERIFIED' });
  }
  return freeze({ state: rights.status === 'METADATA_ONLY' ? 'METADATA_ONLY' : 'READY',
    publicReadAllowed: true, automaticPublishAllowed: false,
    reason: `RIGHTS_${rights.status}_HUMAN_REVIEWED` });
}

export function buildCulturePublicView(reference) {
  const gate = evaluateCultureRights(reference);
  if (!gate.publicReadAllowed) return freeze({ schema: 'earthus.culture-public.v1',
    id: reference?.id || null, state: gate.state, reason: gate.reason, item: null,
    automaticPublishAllowed: false });
  const metadataOnly = reference.rights.status === 'METADATA_ONLY';
  const embedOnly = reference.rights.status === 'EMBED_ONLY';
  const media = metadataOnly ? null : freeze({
    officialTrailerUrl: reference.media.officialTrailerUrl,
    officialStillUrl: reference.media.officialStillUrl,
    cachedUrl: embedOnly ? null : reference.media.cachedUrl,
    delivery: embedOnly ? 'OFFICIAL_LINK_OR_EMBED_ONLY' : 'RIGHTS_APPROVED',
  });
  return freeze({ schema: 'earthus.culture-public.v1', id: reference.id, state: gate.state,
    reason: gate.reason, automaticPublishAllowed: false,
    item: { celestialObjectId: reference.celestialObjectId, workType: reference.workType,
      title: reference.title, creator: reference.creator, releaseYear: reference.releaseYear,
      relationType: reference.relationType, relationSummary: reference.relationSummary,
      quotation: null, media, rights: reference.rights, sources: reference.sources,
      updatedAt: reference.updatedAt } });
}

export function searchCulture(catalog, { query = '', celestialObjectId = null,
  workType = null, relationType = null, limit = 50 } = {}) {
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'CULTURE_SEARCH_LIMIT_INVALID');
  if (workType != null) requireValue(CULTURE_WORK_TYPES.includes(workType), 'CULTURE_WORK_TYPE_INVALID');
  if (relationType != null) requireValue(CULTURE_RELATIONS.includes(relationType),
    'CULTURE_RELATION_TYPE_INVALID');
  const needle = String(query).trim().toLocaleLowerCase('en-US');
  const results = catalog.items.filter(item => {
    if (!evaluateCultureRights(item).publicReadAllowed) return false;
    if (celestialObjectId && item.celestialObjectId !== celestialObjectId) return false;
    if (workType && item.workType !== workType) return false;
    if (relationType && item.relationType !== relationType) return false;
    if (!needle) return true;
    return [item.title, item.creator, item.relationSummary.text, item.workType, item.relationType]
      .some(value => String(value).toLocaleLowerCase('en-US').includes(needle));
  }).slice(0, limit).map(buildCulturePublicView);
  return freeze({ schema: 'earthus.culture-search.v1', query: String(query),
    count: results.length, results });
}

export function buildCultureTimeline(catalog, { celestialObjectId } = {}) {
  const id = token(celestialObjectId, 'CULTURE_CELESTIAL_OBJECT_ID_REQUIRED');
  const items = catalog.items.filter(item => item.celestialObjectId === id
    && evaluateCultureRights(item).publicReadAllowed)
    .sort((a, b) => (a.releaseYear ?? Number.MAX_SAFE_INTEGER)
      - (b.releaseYear ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
    .map(buildCulturePublicView);
  return freeze({ schema: 'earthus.culture-timeline.v1', celestialObjectId: id,
    state: items.length ? 'READY' : 'UNAVAILABLE', count: items.length, items });
}

export function buildCultureProviderFailure({ lastGoodViews = [], failedAt, cachePolicy } = {}) {
  const at = utc(failedAt);
  const maxStaleSeconds = Number(cachePolicy?.maxStaleSeconds);
  const approved = cachePolicy?.status === 'APPROVED'
    && Number.isFinite(maxStaleSeconds) && maxStaleSeconds >= 0;
  const usable = approved ? lastGoodViews.filter(view => view?.item
    && Date.parse(at) - Date.parse(view.item.updatedAt) <= maxStaleSeconds * 1000) : [];
  if (!usable.length) return freeze({ schema: 'earthus.culture-fallback.v1',
    state: 'UNAVAILABLE', failedAt: at, items: [], reason: 'NO_APPROVED_STALE_FALLBACK' });
  return freeze({ schema: 'earthus.culture-fallback.v1', state: 'STALE', failedAt: at,
    items: usable, reason: 'LAST_GOOD_WITHIN_APPROVED_STALE_WINDOW' });
}

export function cultureMutationEvents(previous, next) {
  requireValue(next?.id && (!previous || previous.id === next.id), 'CULTURE_MUTATION_ID_MISMATCH');
  const rightsChanged = previous && previous.rights.status !== next.rights.status;
  return freeze([
    { type: 'CACHE_INVALIDATE', objectId: next.id },
    { type: 'SEARCH_REINDEX', objectId: next.id },
    ...(rightsChanged ? [{ type: 'RIGHTS_CHANGED', objectId: next.id,
      from: previous.rights.status, to: next.rights.status }] : []),
  ]);
}

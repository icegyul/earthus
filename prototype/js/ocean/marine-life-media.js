// Ocean Marine Life v1 local shadow.
// 원본은 항상 private이며 320/640/1280/2048 파생본만 moderation 이후 공개할 수 있다.

import { protectOceanLocation } from './location-policy.js';

export const MARINE_LIFE_MEDIA_SCHEMA = 'earthus.ocean-marine-life-media.v1';
export const MARINE_LIFE_DERIVATIVE_WIDTHS = Object.freeze([320, 640, 1280, 2048]);

export class MarineLifeMediaError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'MarineLifeMediaError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new MarineLifeMediaError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:-]{1,160}$/.test(output), code); return output;
};
const digest = (value, code = 'MARINE_LIFE_DIGEST_REQUIRED') => {
  const output = String(value || '').toLowerCase();
  requireValue(/^[a-f0-9]{64}$/.test(output), code); return output;
};
const utc = (value, code = 'MARINE_LIFE_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
const clone = value => globalThis.structuredClone
  ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function normalizeTaxonomy(value, { verified = false } = {}) {
  requireValue(value && typeof value === 'object', 'MARINE_LIFE_TAXONOMY_REQUIRED');
  const scientificName = String(value.scientificName || '').trim();
  requireValue(scientificName && scientificName.length <= 240, 'MARINE_LIFE_SCIENTIFIC_NAME_REQUIRED');
  const output = {
    canonicalId: token(value.canonicalId, 'MARINE_LIFE_CANONICAL_TAXON_ID_REQUIRED'),
    scientificName,
    rank: String(value.rank || '').trim() || null,
    taxonomyVersion: String(value.taxonomyVersion || '').trim() || null,
    sourceUrl: String(value.sourceUrl || '').trim() || null,
    status: verified ? 'VERIFIED' : 'SUGGESTED',
    suggestionClass: verified ? null : String(value.suggestionClass || 'HUMAN_SUGGESTION'),
    reviewerId: verified ? token(value.reviewerId, 'MARINE_LIFE_TAXONOMY_REVIEWER_REQUIRED') : null,
    reviewedAt: verified ? utc(value.reviewedAt) : null,
  };
  if (verified) {
    requireValue(value.suggestionClass !== 'AI_VERIFIED', 'MARINE_LIFE_AI_CANNOT_VERIFY');
    requireValue(output.taxonomyVersion && /^https:\/\//.test(output.sourceUrl),
      'MARINE_LIFE_TAXONOMY_EVIDENCE_REQUIRED');
  }
  return freeze(output);
}

function normalizeRights(value) {
  requireValue(value?.display === 'ALLOWED' && value?.derivative === 'ALLOWED'
    && value?.communityShare === 'ALLOWED', 'MARINE_LIFE_RIGHTS_DENIED');
  requireValue(String(value.credit || '').trim() && String(value.license || '').trim()
    && /^https:\/\//.test(String(value.sourceUrl || '')), 'MARINE_LIFE_RIGHTS_EVIDENCE_REQUIRED');
  return freeze({ display: 'ALLOWED', derivative: 'ALLOWED', communityShare: 'ALLOWED',
    credit: String(value.credit).trim(), license: String(value.license).trim(),
    sourceUrl: String(value.sourceUrl).trim() });
}

function normalizeDerivatives(items, originalDigest) {
  requireValue(Array.isArray(items) && items.length === MARINE_LIFE_DERIVATIVE_WIDTHS.length,
    'MARINE_LIFE_DERIVATIVE_SET_INCOMPLETE');
  const normalized = items.map(item => {
    const width = Number(item?.width), contentDigest = digest(item?.contentDigest);
    requireValue(MARINE_LIFE_DERIVATIVE_WIDTHS.includes(width), 'MARINE_LIFE_DERIVATIVE_WIDTH_INVALID');
    requireValue(Number.isInteger(item?.height) && item.height > 0, 'MARINE_LIFE_DERIVATIVE_HEIGHT_INVALID');
    requireValue(Number.isInteger(item?.byteLength) && item.byteLength > 0,
      'MARINE_LIFE_DERIVATIVE_LENGTH_INVALID');
    requireValue(contentDigest !== originalDigest, 'MARINE_LIFE_ORIGINAL_CANNOT_BE_DERIVATIVE');
    requireValue(['image/jpeg', 'image/webp'].includes(item?.mimeType),
      'MARINE_LIFE_DERIVATIVE_MIME_INVALID');
    requireValue(item?.exifGpsPresent === false, 'MARINE_LIFE_DERIVATIVE_EXIF_GPS_FORBIDDEN');
    return { width, height: item.height, byteLength: item.byteLength, mimeType: item.mimeType,
      contentDigest, recipeRevision: String(item.recipeRevision || '').trim(),
      privateKey: String(item.privateKey || '').trim(), publicUrl: null };
  }).sort((a, b) => a.width - b.width);
  requireValue(normalized.every((item, index) => item.width === MARINE_LIFE_DERIVATIVE_WIDTHS[index]),
    'MARINE_LIFE_DERIVATIVE_SET_INCOMPLETE');
  requireValue(new Set(normalized.map(item => item.contentDigest)).size === normalized.length,
    'MARINE_LIFE_DERIVATIVE_DIGEST_DUPLICATE');
  requireValue(normalized.every(item => item.recipeRevision && item.privateKey.startsWith('private/')),
    'MARINE_LIFE_DERIVATIVE_PROVENANCE_REQUIRED');
  return freeze(normalized);
}

export function createMemoryMarineLifeMediaRepository() {
  const records = new Map();
  return Object.freeze({
    kind: 'MEMORY_FIXTURE',
    async read(id) { return records.has(id) ? freeze(clone(records.get(id))) : null; },
    async write(value) { records.set(value.id, clone(value)); return freeze(clone(value)); },
    async list() { return freeze([...records.values()].map(clone)); },
  });
}

export function summarizeVerifiedTaxonomy(records = []) {
  requireValue(Array.isArray(records), 'MARINE_LIFE_RECORDS_REQUIRED');
  const byCanonicalId = {};
  records.filter(record => record?.taxonomy?.status === 'VERIFIED').forEach(record => {
    const id = record.taxonomy.canonicalId;
    byCanonicalId[id] = (byCanonicalId[id] || 0) + 1;
  });
  return freeze({ totalVerified: Object.values(byCanonicalId).reduce((sum, count) => sum + count, 0),
    byCanonicalId });
}

function publicLocationOf(record, policy) {
  if (record.sensitive) return freeze({
    schema: 'earthus.ocean-protected-location.v1', audience: 'PUBLIC', precision: 'REGION',
    coordinates: null, region: record.ownerLocation.region || null, exactStored: false,
    cacheControl: 'private, no-store', exifGpsAllowed: false, reason: 'SENSITIVE_SPECIES_GENERALIZED',
  });
  return protectOceanLocation(record.ownerLocationSource, {
    audience: 'PUBLIC', consent: true, policy,
  });
}

export function createMarineLifeMediaService({
  repository, locationPolicy, now = () => new Date(), idFactory = null,
} = {}) {
  requireValue(repository?.read && repository?.write, 'MARINE_LIFE_REPOSITORY_REQUIRED');
  const makeId = prefix => idFactory ? idFactory(prefix)
    : `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const readOwned = async (recordId, ownerId) => {
    const record = await repository.read(token(recordId, 'MARINE_LIFE_RECORD_ID_REQUIRED'));
    requireValue(record && record.ownerId === token(ownerId, 'MARINE_LIFE_OWNER_REQUIRED'),
      'MARINE_LIFE_NOT_AUTHORIZED');
    return record;
  };
  const revision = (record, expectedRevision) => requireValue(record.revision === expectedRevision,
    'MARINE_LIFE_REVISION_CONFLICT', { expectedRevision, actualRevision: record.revision });

  return Object.freeze({
    async registerPrivateOriginal({ recordId = null, ownerId, original, location,
      sensitive = false, taxonomySuggestion, rights } = {}) {
      const id = token(recordId || makeId('marine'), 'MARINE_LIFE_RECORD_ID_REQUIRED');
      const owner = token(ownerId, 'MARINE_LIFE_OWNER_REQUIRED');
      requireValue(!(await repository.read(id)), 'MARINE_LIFE_RECORD_EXISTS');
      requireValue(original?.privateKey?.startsWith(`private/${owner}/`),
        'MARINE_LIFE_ORIGINAL_MUST_BE_PRIVATE');
      requireValue(Number.isInteger(original?.byteLength) && original.byteLength > 0,
        'MARINE_LIFE_ORIGINAL_LENGTH_INVALID');
      requireValue(['image/jpeg', 'image/png', 'image/heic', 'image/dng'].includes(original?.mimeType),
        'MARINE_LIFE_ORIGINAL_MIME_INVALID');
      const ownerLocation = protectOceanLocation(location, {
        audience: 'OWNER', consent: true, policy: locationPolicy,
      });
      requireValue(ownerLocation.precision === 'EXACT', 'MARINE_LIFE_OWNER_LOCATION_POLICY_BLOCKED');
      const record = freeze({
        schema: MARINE_LIFE_MEDIA_SCHEMA, id, ownerId: owner, revision: 1,
        visibility: 'PRIVATE', state: 'ORIGINAL_PRIVATE', sensitive: sensitive === true,
        original: { contentDigest: digest(original.contentDigest), byteLength: original.byteLength,
          mimeType: original.mimeType, privateKey: original.privateKey,
          capturedAt: utc(original.capturedAt), publicUrl: null, exifGpsStored: false },
        ownerLocation, ownerLocationSource: { lat: Number(location.lat), lon: Number(location.lon),
          region: location.region || null },
        publicLocation: null,
        taxonomy: normalizeTaxonomy(taxonomySuggestion), rights: normalizeRights(rights),
        derivatives: [], moderation: null, publication: { publicPaths: [], invalidation: null },
        createdAt: utc(now()), updatedAt: utc(now()),
      });
      return repository.write(record);
    },

    async recordDerivatives({ recordId, ownerId, expectedRevision, derivatives } = {}) {
      const record = await readOwned(recordId, ownerId); revision(record, expectedRevision);
      requireValue(record.visibility === 'PRIVATE', 'MARINE_LIFE_DERIVATIVE_PRIVATE_STATE_REQUIRED');
      const next = freeze({ ...record, revision: record.revision + 1,
        state: 'DERIVATIVES_PRIVATE', derivatives: normalizeDerivatives(derivatives,
          record.original.contentDigest), updatedAt: utc(now()) });
      return repository.write(next);
    },

    async verifyTaxonomy({ recordId, ownerId, expectedRevision, taxonomy } = {}) {
      const record = await readOwned(recordId, ownerId); revision(record, expectedRevision);
      const next = freeze({ ...record, revision: record.revision + 1,
        taxonomy: normalizeTaxonomy(taxonomy, { verified: true }), updatedAt: utc(now()) });
      return repository.write(next);
    },

    async requestPublic({ recordId, ownerId, expectedRevision, explicitHumanConfirmation } = {}) {
      requireValue(explicitHumanConfirmation === true, 'MARINE_LIFE_HUMAN_CONFIRMATION_REQUIRED');
      const record = await readOwned(recordId, ownerId); revision(record, expectedRevision);
      requireValue(record.derivatives.length === MARINE_LIFE_DERIVATIVE_WIDTHS.length,
        'MARINE_LIFE_DERIVATIVES_REQUIRED');
      requireValue(record.taxonomy.status === 'VERIFIED', 'MARINE_LIFE_TAXONOMY_VERIFICATION_REQUIRED');
      const moderation = freeze({ id: makeId('moderation'), state: 'PENDING',
        requestedAt: utc(now()), resolvedAt: null, moderatorId: null, reason: null });
      const next = freeze({ ...record, revision: record.revision + 1,
        state: 'PUBLIC_REVIEW_PENDING', moderation, updatedAt: utc(now()) });
      return repository.write(next);
    },

    async resolveModeration({ recordId, moderatorId, decision, reason } = {}) {
      const record = await repository.read(token(recordId, 'MARINE_LIFE_RECORD_ID_REQUIRED'));
      requireValue(record?.moderation?.state === 'PENDING', 'MARINE_LIFE_MODERATION_NOT_PENDING');
      requireValue(['ACCEPTED', 'REJECTED'].includes(decision), 'MARINE_LIFE_MODERATION_DECISION_REQUIRED');
      const moderation = freeze({ ...record.moderation, state: decision,
        resolvedAt: utc(now()), moderatorId: token(moderatorId, 'MARINE_LIFE_MODERATOR_REQUIRED'),
        reason: String(reason || '').trim().slice(0, 500) || null });
      const next = freeze({ ...record, revision: record.revision + 1,
        state: decision === 'ACCEPTED' ? 'PUBLIC_UPLOAD_PENDING' : 'PRIVATE_REVIEW_REJECTED',
        moderation, updatedAt: utc(now()) });
      return repository.write(next);
    },

    async confirmPublicObjects({ recordId, ownerId, expectedRevision, receipts } = {}) {
      const record = await readOwned(recordId, ownerId); revision(record, expectedRevision);
      requireValue(record.state === 'PUBLIC_UPLOAD_PENDING' && record.moderation?.state === 'ACCEPTED',
        'MARINE_LIFE_PUBLIC_TRANSITION_REJECTED');
      requireValue(Array.isArray(receipts) && receipts.length === record.derivatives.length,
        'MARINE_LIFE_PUBLIC_RECEIPTS_INCOMPLETE');
      const byWidth = new Map(receipts.map(receipt => [Number(receipt.width), receipt]));
      const derivatives = record.derivatives.map(item => {
        const receipt = byWidth.get(item.width);
        requireValue(receipt && digest(receipt.contentDigest) === item.contentDigest,
          'MARINE_LIFE_PUBLIC_CHECKSUM_MISMATCH');
        requireValue(/^https:\/\//.test(receipt.publicUrl)
          && !receipt.publicUrl.includes(record.original.privateKey), 'MARINE_LIFE_PUBLIC_URL_INVALID');
        requireValue(receipt.cacheControl === 'public, max-age=31536000, immutable',
          'MARINE_LIFE_PUBLIC_CACHE_INVALID');
        return { ...item, publicUrl: receipt.publicUrl };
      });
      const publicPaths = derivatives.map(item => new URL(item.publicUrl).pathname).sort();
      const next = freeze({ ...record, revision: record.revision + 1, visibility: 'PUBLIC',
        state: 'PUBLIC', derivatives, publicLocation: publicLocationOf(record, locationPolicy),
        publication: { publicPaths, invalidation: null }, updatedAt: utc(now()) });
      return repository.write(next);
    },

    async confirmPrivatePurge({ recordId, ownerId, expectedRevision, explicitHumanConfirmation,
      deletionReceipts, invalidationReceipt, anonymousReadVerification } = {}) {
      requireValue(explicitHumanConfirmation === true, 'MARINE_LIFE_PRIVATE_CONFIRMATION_REQUIRED');
      const record = await readOwned(recordId, ownerId); revision(record, expectedRevision);
      requireValue(record.visibility === 'PUBLIC' && record.publication.publicPaths.length,
        'MARINE_LIFE_PRIVATE_TRANSITION_REJECTED');
      const deleted = new Set((deletionReceipts || []).filter(item => item?.deleted === true)
        .map(item => String(item.path)));
      requireValue(record.publication.publicPaths.every(path => deleted.has(path)),
        'MARINE_LIFE_PUBLIC_DELETE_INCOMPLETE');
      const invalidated = new Set(invalidationReceipt?.paths || []);
      requireValue(invalidationReceipt?.status === 'CREATED'
        && record.publication.publicPaths.every(path => invalidated.has(path)),
      'MARINE_LIFE_CDN_INVALIDATION_INCOMPLETE');
      requireValue(anonymousReadVerification?.status === 'VERIFIED_404'
        && record.publication.publicPaths.every(path => anonymousReadVerification.paths?.includes(path)),
      'MARINE_LIFE_ANONYMOUS_READ_STILL_AVAILABLE');
      const next = freeze({ ...record, revision: record.revision + 1, visibility: 'PRIVATE',
        state: 'PRIVATE_PURGED', derivatives: record.derivatives.map(item => ({ ...item, publicUrl: null })),
        publicLocation: null, publication: { publicPaths: [], invalidation: {
          id: invalidationReceipt.id || null, createdAt: utc(invalidationReceipt.createdAt),
          verified404At: utc(anonymousReadVerification.verifiedAt),
        } }, updatedAt: utc(now()) });
      return repository.write(next);
    },

    async loadOwner({ recordId, ownerId } = {}) { return readOwned(recordId, ownerId); },
    async authorizeOriginalRead({ recordId, principalId = null, objectKey = null } = {}) {
      const record = await repository.read(token(recordId, 'MARINE_LIFE_RECORD_ID_REQUIRED'));
      const allowed = Boolean(record && principalId && record.ownerId === String(principalId)
        && objectKey === record.original.privateKey);
      if (!allowed) return freeze({ allowed: false, httpStatus: 403,
        cacheControl: 'private, no-store', reason: 'PRIVATE_ORIGINAL' });
      return freeze({ allowed: true, httpStatus: 200, objectKey: record.original.privateKey,
        cacheControl: 'private, no-store', reason: 'OWNER_AUTHORIZED' });
    },
    async loadPublic({ recordId } = {}) {
      const record = await repository.read(token(recordId, 'MARINE_LIFE_RECORD_ID_REQUIRED'));
      if (!record || record.visibility !== 'PUBLIC') return null;
      return freeze({ schema: 'earthus.ocean-marine-life-public.v1', id: record.id,
        taxonomy: record.taxonomy, sensitive: record.sensitive, location: record.publicLocation,
        derivatives: record.derivatives.map(item => ({ width: item.width, height: item.height,
          contentDigest: item.contentDigest, mimeType: item.mimeType, publicUrl: item.publicUrl })),
        rights: record.rights, originalUrl: null });
    },
  });
}

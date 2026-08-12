// Aetherus Community local safety slice.
// Community는 Personal Universe와 다른 owner다. 이 모듈은 서버 공개나 좋아요·팔로워
// 점수를 만들지 않고, private draft → 명시적 사람 확인 → moderation request까지만
// 기록한다. moderation verdict와 reputation 계산도 서로를 직접 수정하지 않는다.

export const COMMUNITY_SCHEMAS = Object.freeze({
  post: 'earthus.community-post.v1',
  moderationRequest: 'earthus.community-moderation-request.v1',
  contribution: 'earthus.community-contribution.v1',
  reputation: 'earthus.community-reputation.v1',
});

const POST_STATES = new Set(['DRAFT', 'SUBMISSION_PENDING', 'WITHDRAWN']);
const MODERATION_STATES = new Set(['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']);
const PROVENANCE = new Set(['observation', 'calculated', 'reconstruction', 'simulation', 'ai', 'user-content']);
const CONTRIBUTION_DIMENSIONS = new Set(['OBSERVATION_QUALITY', 'CORRECTION', 'EQUIPMENT_REVIEW', 'SCIENCE_CONTRIBUTION']);

export class CommunitySafetyError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'CommunitySafetyError'; this.code = code; this.details = Object.freeze({ ...details }); }
}

const fail = (code, details = {}) => { throw new CommunitySafetyError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && !!value.trim();
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function token(value, code, maximum = 160) { const normalized = String(value || '').trim(); requireValue(/^[A-Za-z0-9._:-]+$/.test(normalized) && normalized.length <= maximum, code); return normalized; }
function utc(value, code = 'COMMUNITY_UTC_REQUIRED') { const date = value instanceof Date ? new Date(value.getTime()) : new Date(value); requireValue(Number.isFinite(date.getTime()), code); return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString(); }

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
async function digest(value) {
  requireValue(globalThis.crypto?.subtle?.digest, 'COMMUNITY_WEBCRYPTO_REQUIRED');
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
  const output = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(output), byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeProvenance(value) {
  requireValue(isObject(value) && PROVENANCE.has(value.classification), 'COMMUNITY_PROVENANCE_REQUIRED');
  requireValue(isText(value.sourceRevision) && value.sourceRevision.length <= 160, 'COMMUNITY_SOURCE_REVISION_REQUIRED');
  requireValue(isText(value.freshness) && value.freshness.length <= 100, 'COMMUNITY_FRESHNESS_REQUIRED');
  requireValue(isText(value.precision) && value.precision.length <= 100, 'COMMUNITY_PRECISION_REQUIRED');
  return freeze({ classification: value.classification, sourceRevision: value.sourceRevision.trim(), freshness: value.freshness.trim(), precision: value.precision.trim() });
}

function normalizeRights(value) {
  requireValue(isObject(value) && value.display === 'ALLOWED' && value.communityShare === 'ALLOWED', 'COMMUNITY_RIGHTS_DENIED');
  requireValue(isText(value.credit) && isText(value.license) && isText(value.sourceUrl) && /^https:\/\//.test(value.sourceUrl), 'COMMUNITY_RIGHTS_EVIDENCE_REQUIRED');
  return freeze({ display: 'ALLOWED', communityShare: 'ALLOWED', credit: value.credit.trim(), license: value.license.trim(), sourceUrl: value.sourceUrl.trim() });
}

function normalizePostInput(input, now) {
  requireValue(isObject(input), 'COMMUNITY_POST_INPUT_REQUIRED');
  const caption = String(input.caption || '').trim();
  requireValue(caption && caption.length <= 2000, 'COMMUNITY_CAPTION_REQUIRED');
  const approvedDerivative = input.approvedDerivative;
  requireValue(isObject(approvedDerivative) && approvedDerivative.reviewState === 'APPROVED', 'COMMUNITY_APPROVED_DERIVATIVE_REQUIRED');
  return freeze({
    derivativeAssetId: token(approvedDerivative.assetId, 'COMMUNITY_DERIVATIVE_ID_REQUIRED'),
    derivativeDigest: String(approvedDerivative.contentDigest || '').trim(),
    caption,
    provenance: normalizeProvenance(input.provenance),
    rights: normalizeRights(input.rights),
    audience: 'COMMUNITY',
    createdAtUtc: utc(now),
  });
}

export function createMemoryCommunityRepository() {
  const posts = new Map(); const moderation = new Map(); const contributions = new Map(); const commands = new Map();
  const by = map => ({ read: async id => map.has(id) ? freeze(clone(map.get(id))) : null, write: async value => { map.set(value.id, clone(value)); return freeze(clone(value)); } });
  return Object.freeze({ kind: 'MEMORY_FIXTURE', posts: by(posts), moderation: by(moderation), contributions: by(contributions),
    async listContributions(principalId) { return freeze([...contributions.values()].filter(value => value.principalId === principalId).map(clone)); },
    async readCommand(key) { return commands.has(key) ? freeze(clone(commands.get(key))) : null; },
    async writeCommand(value) { requireValue(!commands.has(value.key), 'COMMUNITY_COMMAND_EXISTS'); commands.set(value.key, clone(value)); },
  });
}

export function createCommunitySafetyService({ repository, now = () => new Date(), idFactory = null } = {}) {
  requireValue(repository?.posts?.read && repository?.moderation?.read && repository?.readCommand, 'COMMUNITY_REPOSITORY_REQUIRED');
  const id = prefix => idFactory ? idFactory(prefix) : `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  async function apply(keyValue, payload, operation) {
    const key = token(keyValue, 'COMMUNITY_IDEMPOTENCY_KEY_REQUIRED'); const payloadDigest = await digest(payload); const previous = await repository.readCommand(key);
    if (previous) { requireValue(previous.payloadDigest === payloadDigest, 'COMMUNITY_IDEMPOTENCY_CONFLICT'); return freeze({ status: 'DUPLICATE', result: previous.result }); }
    const result = await operation(); await repository.writeCommand({ key, payloadDigest, result: clone(result) }); return freeze({ status: 'APPLIED', result });
  }
  return Object.freeze({
    async createDraft({ postId = null, ownerId, input, idempotencyKey } = {}) {
      const postKey = token(postId || id('post'), 'COMMUNITY_POST_ID_REQUIRED'); const owner = token(ownerId, 'COMMUNITY_OWNER_REQUIRED');
      return apply(idempotencyKey || `draft:${postKey}`, { type: 'draft', postKey, owner, input }, async () => {
        requireValue(!(await repository.posts.read(postKey)), 'COMMUNITY_POST_EXISTS');
        const details = normalizePostInput(input, now());
        requireValue(isText(details.derivativeDigest) && /^[a-f0-9]{64}$/.test(details.derivativeDigest), 'COMMUNITY_DERIVATIVE_DIGEST_REQUIRED');
        return repository.posts.write(freeze({ schema: COMMUNITY_SCHEMAS.post, id: postKey, ownerId: owner, revision: 1, state: 'DRAFT', publication: { status: 'NOT_PUBLISHED', publicUrl: null }, ...details }));
      });
    },
    async requestHumanPublish({ postId, ownerId, expectedRevision, explicitHumanPublish, idempotencyKey } = {}) {
      const key = token(postId, 'COMMUNITY_POST_ID_REQUIRED'); const owner = token(ownerId, 'COMMUNITY_OWNER_REQUIRED');
      requireValue(explicitHumanPublish === true, 'COMMUNITY_HUMAN_PUBLISH_CONFIRMATION_REQUIRED'); requireValue(Number.isInteger(expectedRevision), 'COMMUNITY_EXPECTED_REVISION_REQUIRED');
      return apply(idempotencyKey, { type: 'publish-request', key, expectedRevision }, async () => {
        const post = await repository.posts.read(key); requireValue(post && post.ownerId === owner, 'COMMUNITY_NOT_AUTHORIZED'); requireValue(post.revision === expectedRevision, 'COMMUNITY_REVISION_CONFLICT'); requireValue(post.state === 'DRAFT', 'COMMUNITY_PUBLISH_TRANSITION_REJECTED');
        const request = freeze({ schema: COMMUNITY_SCHEMAS.moderationRequest, id: id('moderation'), postId: key, ownerId: owner, state: 'PENDING', requestedAtUtc: utc(now()), evidence: { provenance: post.provenance, rights: post.rights, derivativeDigest: post.derivativeDigest } });
        const next = freeze({ ...post, revision: post.revision + 1, state: 'SUBMISSION_PENDING', publication: { status: 'NOT_PUBLISHED', publicUrl: null }, moderationRequestId: request.id });
        await repository.moderation.write(request); await repository.posts.write(next); return freeze({ post: next, moderationRequest: request });
      });
    },
    async withdrawConsent({ postId, ownerId, expectedRevision, explicitUserConfirmation, idempotencyKey } = {}) {
      const key = token(postId, 'COMMUNITY_POST_ID_REQUIRED'); const owner = token(ownerId, 'COMMUNITY_OWNER_REQUIRED'); requireValue(explicitUserConfirmation === true, 'COMMUNITY_WITHDRAW_CONFIRMATION_REQUIRED');
      return apply(idempotencyKey, { type: 'withdraw', key, expectedRevision }, async () => {
        const post = await repository.posts.read(key); requireValue(post && post.ownerId === owner, 'COMMUNITY_NOT_AUTHORIZED'); requireValue(post.revision === expectedRevision, 'COMMUNITY_REVISION_CONFLICT'); requireValue(POST_STATES.has(post.state) && post.state !== 'WITHDRAWN', 'COMMUNITY_WITHDRAW_TRANSITION_REJECTED');
        const next = freeze({ ...post, revision: post.revision + 1, state: 'WITHDRAWN', withdrawnAtUtc: utc(now()), publication: { status: 'NOT_PUBLISHED', publicUrl: null } });
        await repository.posts.write(next);
        if (post.moderationRequestId) { const request = await repository.moderation.read(post.moderationRequestId); if (request?.state === 'PENDING') await repository.moderation.write(freeze({ ...request, state: 'WITHDRAWN', resolvedAtUtc: utc(now()) })); }
        return next;
      });
    },
    async loadPost({ postId, ownerId } = {}) { const post = await repository.posts.read(token(postId, 'COMMUNITY_POST_ID_REQUIRED')); requireValue(post && post.ownerId === token(ownerId, 'COMMUNITY_OWNER_REQUIRED'), 'COMMUNITY_NOT_AUTHORIZED'); return post; },
  });
}

// Moderator action is a separate owner boundary. ACCEPTED means reviewed evidence passed,
// not that a static/local prototype has published a URL.
export function createCommunityModerationService({ repository, now = () => new Date() } = {}) {
  requireValue(repository?.moderation?.read && repository?.posts?.read, 'COMMUNITY_REPOSITORY_REQUIRED');
  return Object.freeze({
    async resolve({ moderationRequestId, moderatorId, decision, reason } = {}) {
      const requestId = token(moderationRequestId, 'COMMUNITY_MODERATION_ID_REQUIRED'); token(moderatorId, 'COMMUNITY_MODERATOR_ID_REQUIRED'); requireValue(['ACCEPTED', 'REJECTED'].includes(decision), 'COMMUNITY_MODERATION_DECISION_REQUIRED');
      const request = await repository.moderation.read(requestId); requireValue(request?.state === 'PENDING', 'COMMUNITY_MODERATION_NOT_PENDING');
      const post = await repository.posts.read(request.postId); requireValue(post?.state === 'SUBMISSION_PENDING', 'COMMUNITY_POST_NOT_PENDING');
      const resolved = freeze({ ...request, state: decision, resolvedAtUtc: utc(now()), reason: isText(reason) ? reason.trim().slice(0, 500) : null });
      await repository.moderation.write(resolved);
      // No public URL is written here. Remote publishing belongs to a later authoritative adapter.
      return resolved;
    },
  });
}

export function createReputationService({ repository, now = () => new Date(), idFactory = null } = {}) {
  requireValue(repository?.contributions?.read && repository?.moderation?.read && repository?.listContributions, 'COMMUNITY_REPOSITORY_REQUIRED');
  const id = prefix => idFactory ? idFactory(prefix) : `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  return Object.freeze({
    async recordVerifiedContribution({ moderationRequestId, principalId, dimension, weight = 1 } = {}) {
      const request = await repository.moderation.read(token(moderationRequestId, 'COMMUNITY_MODERATION_ID_REQUIRED'));
      requireValue(request?.state === 'ACCEPTED', 'COMMUNITY_REPUTATION_MODERATION_REQUIRED'); requireValue(CONTRIBUTION_DIMENSIONS.has(dimension), 'COMMUNITY_REPUTATION_DIMENSION_REQUIRED'); requireValue(Number.isFinite(weight) && weight > 0 && weight <= 10, 'COMMUNITY_REPUTATION_WEIGHT_INVALID');
      const contribution = freeze({ schema: COMMUNITY_SCHEMAS.contribution, id: id('contribution'), principalId: token(principalId, 'COMMUNITY_PRINCIPAL_ID_REQUIRED'), moderationRequestId: request.id, dimension, weight, state: 'VERIFIED', recordedAtUtc: utc(now()) });
      return repository.contributions.write(contribution);
    },
    async retract({ contributionId, reason } = {}) { const value = await repository.contributions.read(token(contributionId, 'COMMUNITY_CONTRIBUTION_ID_REQUIRED')); requireValue(value?.state === 'VERIFIED', 'COMMUNITY_REPUTATION_RETRACTION_REJECTED'); return repository.contributions.write(freeze({ ...value, state: 'RETRACTED', retractedAtUtc: utc(now()), retractionReason: isText(reason) ? reason.trim().slice(0, 500) : null })); },
    async explain({ principalId } = {}) {
      const principal = token(principalId, 'COMMUNITY_PRINCIPAL_ID_REQUIRED');
      // A single total would turn distinct evidence types into unearned scientific authority.
      const dimensions = Object.fromEntries([...CONTRIBUTION_DIMENSIONS].map(dimension => [dimension, { verifiedCount: 0, retractedCount: 0, verifiedWeight: 0 }]));
      for (const contribution of await repository.listContributions(principal)) {
        const target = dimensions[contribution.dimension];
        if (contribution.state === 'VERIFIED') { target.verifiedCount += 1; target.verifiedWeight += contribution.weight; }
        if (contribution.state === 'RETRACTED') target.retractedCount += 1;
      }
      return freeze({ schema: COMMUNITY_SCHEMAS.reputation, principalId: principal, dimensions, totalScore: null, reason: 'DIMENSIONAL_ONLY_NO_GLOBAL_AUTHORITY' });
    },
  });
}

// Aetherus Citizen Science local safety contract.
// Public posts, AI quality labels, or a score never accept a science submission. A named
// campaign, required evidence, explicit consent, duplicate check, and human review are all required.

export const CITIZEN_SCIENCE_SCHEMAS = Object.freeze({ campaign: 'earthus.citizen-science-campaign.v1', submission: 'earthus.citizen-science-submission.v1', review: 'earthus.citizen-science-review.v1', partnerPackage: 'earthus.citizen-science-partner-package.v1' });
const CAMPAIGN_STATES = new Set(['DRAFT', 'OPEN', 'CLOSED']);
const SUBMISSION_STATES = new Set(['DRAFT', 'PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'RETRACTED']);
export class CitizenScienceError extends Error { constructor(code, details = {}) { super(code); this.name = 'CitizenScienceError'; this.code = code; this.details = Object.freeze({ ...details }); } }
const fail = (code, details = {}) => { throw new CitizenScienceError(code, details); };
const need = (value, code, details = {}) => { if (!value) fail(code, details); };
const text = value => typeof value === 'string' && !!value.trim();
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const token = (value, code, maximum = 160) => { const result = String(value || '').trim(); need(/^[A-Za-z0-9._:-]+$/.test(result) && result.length <= maximum, code); return result; };
const utc = value => { const date = value instanceof Date ? new Date(value.getTime()) : new Date(value); need(Number.isFinite(date.getTime()), 'SCIENCE_UTC_REQUIRED'); return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString(); };
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
async function hash(value) { need(globalThis.crypto?.subtle?.digest, 'SCIENCE_WEBCRYPTO_REQUIRED'); const output = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))); return Array.from(new Uint8Array(output), byte => byte.toString(16).padStart(2, '0')).join(''); }

export function createMemoryCitizenScienceRepository() {
  const campaigns = new Map(); const submissions = new Map(); const reviews = new Map(); const commands = new Map();
  const store = map => ({ read: async id => map.has(id) ? freeze(clone(map.get(id))) : null, write: async value => { map.set(value.id, clone(value)); return freeze(clone(value)); } });
  return Object.freeze({ kind: 'MEMORY_FIXTURE', campaigns: store(campaigns), submissions: store(submissions), reviews: store(reviews),
    async findSubmission(campaignId, observationId) { return freeze([...submissions.values()].filter(value => value.campaignId === campaignId && value.observationId === observationId).map(clone)); },
    async readCommand(key) { return commands.has(key) ? freeze(clone(commands.get(key))) : null; }, async writeCommand(value) { need(!commands.has(value.key), 'SCIENCE_COMMAND_EXISTS'); commands.set(value.key, clone(value)); },
  });
}

function campaignSpec(input, now) {
  need(input && typeof input === 'object', 'SCIENCE_CAMPAIGN_INPUT_REQUIRED');
  const requirements = input.requirements;
  need(requirements && typeof requirements === 'object' && Array.isArray(requirements.allowedObservationTypes) && requirements.allowedObservationTypes.length > 0, 'SCIENCE_CAMPAIGN_REQUIREMENTS_REQUIRED');
  return freeze({ schema: CITIZEN_SCIENCE_SCHEMAS.campaign, id: token(input.id, 'SCIENCE_CAMPAIGN_ID_REQUIRED'), ownerId: token(input.ownerId, 'SCIENCE_CAMPAIGN_OWNER_REQUIRED'), state: CAMPAIGN_STATES.has(input.state) ? input.state : 'DRAFT', createdAtUtc: utc(now), requirements: freeze({ allowedObservationTypes: [...new Set(requirements.allowedObservationTypes.map(value => token(value, 'SCIENCE_OBSERVATION_TYPE_INVALID')))], requiresWcs: requirements.requiresWcs === true, requiresLicense: requirements.requiresLicense !== false, locationPolicy: requirements.locationPolicy === 'COARSE_REGION' ? 'COARSE_REGION' : 'NOT_STORED' }) });
}
function submissionSpec(input, campaign, now, submissionId) {
  need(input && typeof input === 'object' && input.consent === true, 'SCIENCE_CONSENT_REQUIRED');
  need(campaign.requirements.allowedObservationTypes.includes(input.observationType), 'SCIENCE_OBSERVATION_TYPE_NOT_ALLOWED');
  need(text(input.observationId), 'SCIENCE_OBSERVATION_ID_REQUIRED');
  need(text(input.observedAtUtc) && Number.isFinite(Date.parse(input.observedAtUtc)), 'SCIENCE_OBSERVED_TIME_REQUIRED');
  need(input.provenance?.classification === 'observation', 'SCIENCE_OBSERVATION_PROVENANCE_REQUIRED');
  need(text(input.provenance?.sourceRevision) && text(input.provenance?.precision), 'SCIENCE_PROVENANCE_EVIDENCE_REQUIRED');
  if (campaign.requirements.requiresWcs) need(input.wcs?.status === 'VERIFIED' && text(input.wcs.solutionDigest), 'SCIENCE_WCS_VERIFICATION_REQUIRED');
  if (campaign.requirements.requiresLicense) need(input.rights?.share === 'ALLOWED' && text(input.rights?.license) && text(input.rights?.credit), 'SCIENCE_RIGHTS_REQUIRED');
  need(!('latitude' in (input.location || {})) && !('longitude' in (input.location || {})), 'SCIENCE_PRECISE_LOCATION_FORBIDDEN');
  if (campaign.requirements.locationPolicy === 'COARSE_REGION') need(text(input.location?.coarseRegion), 'SCIENCE_COARSE_REGION_REQUIRED');
  return freeze({ schema: CITIZEN_SCIENCE_SCHEMAS.submission, id: submissionId, campaignId: campaign.id, ownerId: token(input.ownerId, 'SCIENCE_OWNER_REQUIRED'), observationId: token(input.observationId, 'SCIENCE_OBSERVATION_ID_REQUIRED'), observationType: input.observationType, observedAtUtc: utc(input.observedAtUtc), state: 'PENDING_REVIEW', submittedAtUtc: utc(now), consent: true, provenance: freeze({ classification: 'observation', sourceRevision: input.provenance.sourceRevision.trim(), precision: input.provenance.precision.trim() }), wcs: campaign.requirements.requiresWcs ? freeze({ status: 'VERIFIED', solutionDigest: input.wcs.solutionDigest.trim() }) : null, rights: campaign.requirements.requiresLicense ? freeze({ share: 'ALLOWED', license: input.rights.license.trim(), credit: input.rights.credit.trim() }) : null, location: freeze({ policy: campaign.requirements.locationPolicy, coarseRegion: input.location?.coarseRegion?.trim() || null }), evidenceDigest: input.evidenceDigest && /^[a-f0-9]{64}$/.test(input.evidenceDigest) ? input.evidenceDigest : null });
}

export function createCitizenScienceService({ repository, now = () => new Date(), idFactory = null } = {}) {
  need(repository?.campaigns?.read && repository?.submissions?.read && repository?.findSubmission, 'SCIENCE_REPOSITORY_REQUIRED'); const id = prefix => idFactory ? idFactory(prefix) : `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  async function command(keyValue, payload, operation) { const key = token(keyValue, 'SCIENCE_IDEMPOTENCY_REQUIRED'); const digest = await hash(payload); const previous = await repository.readCommand(key); if (previous) { need(previous.digest === digest, 'SCIENCE_IDEMPOTENCY_CONFLICT'); return freeze({ status: 'DUPLICATE', result: previous.result }); } const result = await operation(); await repository.writeCommand({ key, digest, result: clone(result) }); return freeze({ status: 'APPLIED', result }); }
  return Object.freeze({
    async createCampaign({ input, idempotencyKey } = {}) { const campaign = campaignSpec(input, now()); return command(idempotencyKey || `campaign:${campaign.id}`, { type: 'campaign', campaign }, async () => { need(!(await repository.campaigns.read(campaign.id)), 'SCIENCE_CAMPAIGN_EXISTS'); return repository.campaigns.write(campaign); }); },
    async openCampaign({ campaignId, ownerId, idempotencyKey } = {}) { const key = token(campaignId, 'SCIENCE_CAMPAIGN_ID_REQUIRED'); return command(idempotencyKey, { type: 'open', key }, async () => { const campaign = await repository.campaigns.read(key); need(campaign?.ownerId === token(ownerId, 'SCIENCE_CAMPAIGN_OWNER_REQUIRED'), 'SCIENCE_NOT_AUTHORIZED'); need(campaign.state === 'DRAFT', 'SCIENCE_CAMPAIGN_TRANSITION_REJECTED'); return repository.campaigns.write(freeze({ ...campaign, state: 'OPEN', openedAtUtc: utc(now()) })); }); },
    async submit({ campaignId, input, idempotencyKey } = {}) { const campaign = await repository.campaigns.read(token(campaignId, 'SCIENCE_CAMPAIGN_ID_REQUIRED')); need(campaign?.state === 'OPEN', 'SCIENCE_CAMPAIGN_NOT_OPEN'); return command(idempotencyKey, { type: 'submit', campaignId, observationId: input?.observationId, evidenceDigest: input?.evidenceDigest }, async () => { const existing = await repository.findSubmission(campaign.id, token(input?.observationId, 'SCIENCE_OBSERVATION_ID_REQUIRED')); if (existing.length) return freeze({ duplicateOf: existing[0].id, state: existing[0].state }); const submission = submissionSpec(input, campaign, now(), id('submission')); return repository.submissions.write(submission); }); },
    async review({ submissionId, reviewerId, decision, reason, idempotencyKey } = {}) { const key = token(submissionId, 'SCIENCE_SUBMISSION_ID_REQUIRED'); return command(idempotencyKey, { type: 'review', key, decision, reason }, async () => { const submission = await repository.submissions.read(key); need(submission?.state === 'PENDING_REVIEW', 'SCIENCE_REVIEW_NOT_PENDING'); need(['ACCEPTED', 'REJECTED'].includes(decision), 'SCIENCE_REVIEW_DECISION_REQUIRED'); const review = freeze({ schema: CITIZEN_SCIENCE_SCHEMAS.review, id: id('review'), submissionId: key, reviewerId: token(reviewerId, 'SCIENCE_REVIEWER_ID_REQUIRED'), decision, reason: text(reason) ? String(reason).trim().slice(0, 500) : null, reviewedAtUtc: utc(now()) }); await repository.reviews.write(review); return repository.submissions.write(freeze({ ...submission, state: decision, reviewId: review.id, reviewedAtUtc: review.reviewedAtUtc })); }); },
    async retract({ submissionId, ownerId, explicitUserConfirmation, idempotencyKey } = {}) { need(explicitUserConfirmation === true, 'SCIENCE_RETRACT_CONFIRMATION_REQUIRED'); const key = token(submissionId, 'SCIENCE_SUBMISSION_ID_REQUIRED'); return command(idempotencyKey, { type: 'retract', key }, async () => { const submission = await repository.submissions.read(key); need(submission?.ownerId === token(ownerId, 'SCIENCE_OWNER_REQUIRED'), 'SCIENCE_NOT_AUTHORIZED'); need(SUBMISSION_STATES.has(submission.state) && submission.state !== 'RETRACTED', 'SCIENCE_RETRACTION_REJECTED'); return repository.submissions.write(freeze({ ...submission, state: 'RETRACTED', retractedAtUtc: utc(now()) })); }); },
    async partnerPackage({ submissionId, partnerId } = {}) { const submission = await repository.submissions.read(token(submissionId, 'SCIENCE_SUBMISSION_ID_REQUIRED')); need(submission?.state === 'ACCEPTED', 'SCIENCE_PARTNER_EXPORT_REVIEW_REQUIRED'); const core = { schema: CITIZEN_SCIENCE_SCHEMAS.partnerPackage, schemaVersion: 1, partnerId: token(partnerId, 'SCIENCE_PARTNER_ID_REQUIRED'), submissionId: submission.id, campaignId: submission.campaignId, observedAtUtc: submission.observedAtUtc, observationType: submission.observationType, provenance: submission.provenance, wcs: submission.wcs, rights: submission.rights, location: submission.location, // no owner id, personal note, raw bytes, or exact location
      exclusions: ['OWNER_ID', 'PERSONAL_NOTE', 'RAW_BYTES', 'EXACT_LOCATION'] }; return freeze({ ...core, packageDigest: await hash(core) }); },
  });
}

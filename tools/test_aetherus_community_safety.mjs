#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function importModule() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-community-safety-'));
  const source = await readFile(path.join(ROOT, 'prototype/js/space/community-safety.js'), 'utf8');
  const modulePath = path.join(directory, 'community-safety.mjs');
  await writeFile(modulePath, source);
  return import(pathToFileURL(modulePath).href);
}

const community = await importModule();
let tick = 0;
const now = () => new Date(Date.UTC(2026, 7, 12, 10, 0, tick++));
let ids = 0;
const idFactory = prefix => `${prefix}_fixture_${++ids}`;
const repository = community.createMemoryCommunityRepository();
const safety = community.createCommunitySafetyService({ repository, now, idFactory });
const moderation = community.createCommunityModerationService({ repository, now });
const reputation = community.createReputationService({ repository, now, idFactory });

const input = {
  approvedDerivative: { assetId: 'derivative-fixture', contentDigest: 'a'.repeat(64), reviewState: 'APPROVED' },
  caption: 'A reviewed private observation note.',
  provenance: { classification: 'observation', sourceRevision: 'review-fixture-r1', freshness: 'LOCAL_APPROVED', precision: 'WCS_UNVERIFIED' },
  rights: { display: 'ALLOWED', communityShare: 'ALLOWED', credit: 'Fixture photographer', license: 'CC BY 4.0', sourceUrl: 'https://example.test/asset' },
};
const drafted = await safety.createDraft({ postId: 'post-fixture', ownerId: 'principal-a', input, idempotencyKey: 'draft-post' });
assert.equal(drafted.status, 'APPLIED');
assert.equal(drafted.result.state, 'DRAFT');
assert.equal(drafted.result.publication.status, 'NOT_PUBLISHED');
const duplicateDraft = await safety.createDraft({ postId: 'post-fixture', ownerId: 'principal-a', input, idempotencyKey: 'draft-post' });
assert.equal(duplicateDraft.status, 'DUPLICATE');
await assert.rejects(() => safety.createDraft({ postId: 'post-bad-rights', ownerId: 'principal-a', idempotencyKey: 'bad-rights', input: { ...input, rights: { ...input.rights, communityShare: 'DENIED' } } }),
  error => error.code === 'COMMUNITY_RIGHTS_DENIED');
await assert.rejects(() => safety.requestHumanPublish({ postId: 'post-fixture', ownerId: 'principal-a', expectedRevision: 1, explicitHumanPublish: false, idempotencyKey: 'reject-no-human' }),
  error => error.code === 'COMMUNITY_HUMAN_PUBLISH_CONFIRMATION_REQUIRED');
await assert.rejects(() => safety.loadPost({ postId: 'post-fixture', ownerId: 'principal-b' }), error => error.code === 'COMMUNITY_NOT_AUTHORIZED');

const requested = await safety.requestHumanPublish({ postId: 'post-fixture', ownerId: 'principal-a', expectedRevision: 1, explicitHumanPublish: true, idempotencyKey: 'human-publish' });
assert.equal(requested.result.post.state, 'SUBMISSION_PENDING');
assert.equal(requested.result.post.publication.status, 'NOT_PUBLISHED');
assert.equal(requested.result.moderationRequest.state, 'PENDING');
const accepted = await moderation.resolve({ moderationRequestId: requested.result.moderationRequest.id, moderatorId: 'moderator-a', decision: 'ACCEPTED', reason: 'rights and provenance shown' });
assert.equal(accepted.state, 'ACCEPTED');
const postAfterModeration = await safety.loadPost({ postId: 'post-fixture', ownerId: 'principal-a' });
assert.equal(postAfterModeration.publication.status, 'NOT_PUBLISHED');

const contribution = await reputation.recordVerifiedContribution({ moderationRequestId: accepted.id, principalId: 'principal-a', dimension: 'OBSERVATION_QUALITY', weight: 2 });
assert.equal(contribution.state, 'VERIFIED');
let explanation = await reputation.explain({ principalId: 'principal-a' });
assert.equal(explanation.totalScore, null);
assert.equal(explanation.dimensions.OBSERVATION_QUALITY.verifiedWeight, 2);
const retracted = await reputation.retract({ contributionId: contribution.id, reason: 'source correction' });
assert.equal(retracted.state, 'RETRACTED');
explanation = await reputation.explain({ principalId: 'principal-a' });
assert.deepEqual(explanation.dimensions.OBSERVATION_QUALITY, { verifiedCount: 0, retractedCount: 1, verifiedWeight: 0 });

const withdrawn = await safety.withdrawConsent({ postId: 'post-fixture', ownerId: 'principal-a', expectedRevision: 2, explicitUserConfirmation: true, idempotencyKey: 'withdraw-post' });
assert.equal(withdrawn.result.state, 'WITHDRAWN');
assert.equal(withdrawn.result.publication.status, 'NOT_PUBLISHED');
const source = await readFile(path.join(ROOT, 'prototype/js/space/community-safety.js'), 'utf8');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'community safety slice must not add remote publish calls');
assert.doesNotMatch(source, /likes|followers|totalScore:\s*[0-9]/i, 'community safety must not equate popularity to scientific authority');
console.log('PASS: private draft, rights gate, human publish request, moderation separation, dimensional reputation retraction, and consent withdrawal');

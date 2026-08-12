// Aetherus Mission Media & Replay의 정적 첫 계약.
// 이 모듈은 provider API, 실시간 궤도, 자동 다운로드를 호출하지 않는다. 재생 시각은
// 호출자가 넘긴 값으로만 전진하며, 관측되지 않은 구간을 부드러운 궤적으로 보간하지 않는다.

import { assertAetherusCatalog } from './contracts.js';

export const MISSION_REPLAY_STATES = Object.freeze([
  'LOADING', 'PAUSED', 'PLAYING', 'SEEKING', 'COMPLETED', 'DEGRADED',
]);

const ROUTE_KEYS = Object.freeze([
  'aetherusMission', 'mission', 'missionRevision', 'replayAt', 'replayAsset',
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const AUTHORITY_RANK = Object.freeze({ OFFICIAL: 2, CURATED: 1 });

export class MissionReplayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionReplayError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionReplayError(code, message);
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function utc(value, code = 'INVALID_UTC') {
  if (typeof value !== 'string' || !UTC_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(code, 'A canonical UTC timestamp is required');
  }
  return new Date(value).toISOString();
}

function epoch(value, code) {
  return Date.parse(utc(value, code));
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function byId(items) {
  return new Map(items.map(item => [item.id, item]));
}

function sortedAssertions(assertions) {
  return [...assertions].sort((left, right) => {
    const authority = AUTHORITY_RANK[right.authority] - AUTHORITY_RANK[left.authority];
    if (authority) return authority;
    const valid = epoch(right.validFromUtc, 'INVALID_ASSERTION_TIME') - epoch(left.validFromUtc, 'INVALID_ASSERTION_TIME');
    if (valid) return valid;
    const asserted = epoch(right.assertedAtUtc, 'INVALID_ASSERTION_TIME') - epoch(left.assertedAtUtc, 'INVALID_ASSERTION_TIME');
    if (asserted) return asserted;
    return left.id.localeCompare(right.id);
  });
}

export function assertMissionMediaReplayArtifact(document) {
  return assertAetherusCatalog('mission-media-replay', document);
}

// 기존 사진 카탈로그를 원본 사실의 단일 소유자로 유지한다. 이 검사 없이 mission
// artifact만 추가하면 credit/license가 서로 달라져도 둘 다 화면에 남을 수 있다.
export function assertMissionMediaReferences(document, spacePhotoCatalog) {
  assertMissionMediaReplayArtifact(document);
  assertAetherusCatalog('space-photos', spacePhotoCatalog);
  const photos = byId(spacePhotoCatalog.items);
  document.mediaAssets.forEach(asset => {
    const photo = photos.get(asset.catalogAssetRef);
    if (!photo) fail('MISSING_CATALOG_ASSET', `Missing photo catalogue asset: ${asset.catalogAssetRef}`);
    if (asset.sourceUrl !== photo.full) {
      fail('SOURCE_URL_MISMATCH', `Mission media source URL differs: ${asset.id}`);
    }
    if (asset.rights.credit !== photo.credit || asset.rights.license !== photo.license) {
      fail('RIGHTS_METADATA_MISMATCH', `Mission media rights differ: ${asset.id}`);
    }
  });
  return document;
}

export function createMissionMediaReplayCatalog(document, { spacePhotoCatalog } = {}) {
  if (spacePhotoCatalog) assertMissionMediaReferences(document, spacePhotoCatalog);
  else assertMissionMediaReplayArtifact(document);
  const catalog = {
    artifact: clone(document.artifact),
    mission: clone(document.mission),
    timeline: clone(document.timeline).sort((left, right) =>
      epoch(left.occurredAtUtc, 'INVALID_EVENT_TIME') - epoch(right.occurredAtUtc, 'INVALID_EVENT_TIME')
        || left.id.localeCompare(right.id)),
    mediaAssets: clone(document.mediaAssets),
    layerSets: clone(document.layerSets),
    replayManifest: clone(document.replayManifest),
  };
  catalog.eventsById = byId(catalog.timeline);
  catalog.assetsById = byId(catalog.mediaAssets);
  catalog.layerSetsById = byId(catalog.layerSets);
  catalog.cueEvents = catalog.replayManifest.cueEventIds.map(id => {
    const event = catalog.eventsById.get(id);
    if (!event) fail('UNKNOWN_REPLAY_CUE', `Replay cue does not exist: ${id}`);
    return event;
  }).sort((left, right) => epoch(left.occurredAtUtc, 'INVALID_EVENT_TIME') - epoch(right.occurredAtUtc, 'INVALID_EVENT_TIME'));
  if (catalog.cueEvents.length === 0) fail('EMPTY_REPLAY', 'At least one replay cue is required');
  return freeze(catalog);
}

export function resolveMissionStatus(catalog, atUtc) {
  const atMs = epoch(atUtc, 'INVALID_STATUS_TIME');
  const applicable = catalog.mission.statusAssertions.filter(assertion =>
    epoch(assertion.validFromUtc, 'INVALID_ASSERTION_TIME') <= atMs);
  if (!applicable.length) {
    return freeze({ status: 'UNKNOWN', assertionId: null, source: null, sourceUrl: null, reason: 'NO_SOURCE_ASSERTION_AT_TIME' });
  }
  const selected = sortedAssertions(applicable)[0];
  return freeze({
    status: selected.status,
    assertionId: selected.id,
    authority: selected.authority,
    validFromUtc: selected.validFromUtc,
    source: selected.source,
    sourceUrl: selected.sourceUrl,
  });
}

export function evaluateMissionAssetRights(catalog, assetId, purpose = 'MISSION_REPLAY_DISPLAY') {
  if (!['MISSION_REPLAY_DISPLAY', 'MISSION_MEDIA_DISPLAY'].includes(purpose)) {
    fail('UNSUPPORTED_RIGHTS_PURPOSE', 'Unsupported mission asset purpose');
  }
  const asset = catalog.assetsById.get(assetId);
  if (!asset) return freeze({ allowed: false, code: 'ASSET_NOT_FOUND', assetId: null, purpose });
  if (asset.rights.display !== 'ALLOWED') {
    return freeze({ allowed: false, code: 'DISPLAY_NOT_LICENSED', assetId, purpose });
  }
  return freeze({
    allowed: true,
    code: 'ALLOWED',
    assetId,
    purpose,
    requiredAttribution: freeze({ credit: asset.rights.credit, license: asset.rights.license, sourceUrl: asset.sourceUrl }),
  });
}

function replayScene(catalog, atUtc) {
  const atMs = epoch(atUtc, 'INVALID_REPLAY_TIME');
  const past = catalog.cueEvents.filter(event => epoch(event.occurredAtUtc, 'INVALID_EVENT_TIME') <= atMs);
  const next = catalog.cueEvents.find(event => epoch(event.occurredAtUtc, 'INVALID_EVENT_TIME') > atMs) || null;
  const last = past.length ? past[past.length - 1] : null;
  const exact = catalog.cueEvents.find(event => epoch(event.occurredAtUtc, 'INVALID_EVENT_TIME') === atMs) || null;
  if (exact) {
    return freeze({
      availability: 'MILESTONE',
      event: exact,
      scene: freeze({ kind: 'MILESTONE', eventId: exact.id, provenance: exact.provenance }),
      gap: null,
    });
  }
  return freeze({
    availability: 'DATA_GAP',
    event: last,
    scene: null,
    // No interpolation is intentional: a missing source is not a trajectory.
    gap: freeze({
      fromUtc: last ? last.occurredAtUtc : null,
      toUtc: next ? next.occurredAtUtc : null,
      reason: 'MILESTONE_ONLY_NO_INTERPOLATION',
    }),
  });
}

function snapshot(catalog, atUtc, state, playbackRate = 1, selectedAssetId = null) {
  const canonicalUtc = utc(atUtc, 'INVALID_REPLAY_TIME');
  const scene = replayScene(catalog, canonicalUtc);
  const assetRights = selectedAssetId
    ? evaluateMissionAssetRights(catalog, selectedAssetId)
    : freeze({ allowed: true, code: 'NO_ASSET_SELECTED', assetId: null });
  const degraded = scene.availability === 'DATA_GAP' || !assetRights.allowed;
  return freeze({
    schema: 'earthus.mission-replay-session.v1',
    missionId: catalog.mission.id,
    artifactId: catalog.artifact.id,
    artifactRevision: catalog.artifact.revision,
    atUtc: canonicalUtc,
    state: degraded && state === 'PLAYING' ? 'DEGRADED' : state,
    playbackRate,
    selectedAssetId,
    status: resolveMissionStatus(catalog, canonicalUtc),
    scene,
    assetRights,
    replayProvenance: catalog.replayManifest.provenance,
    interpolation: catalog.replayManifest.interpolation,
  });
}

export function createMissionReplaySession(catalog, { atUtc, playbackRate = 1, selectedAssetId = null } = {}) {
  if (!catalog || !catalog.artifact) fail('INVALID_CATALOG', 'Mission replay catalogue is required');
  if (!Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 1000) {
    fail('INVALID_PLAYBACK_RATE', 'Playback rate must be finite and between 0 and 1000');
  }
  const initial = atUtc || catalog.cueEvents[0].occurredAtUtc;
  return snapshot(catalog, initial, 'LOADING', playbackRate, selectedAssetId);
}

export function reduceMissionReplay(catalog, session, command) {
  if (!session || session.schema !== 'earthus.mission-replay-session.v1') {
    fail('INVALID_SESSION', 'Mission replay session is required');
  }
  if (!isObject(command) || typeof command.type !== 'string') fail('INVALID_REPLAY_COMMAND', 'Command type is required');
  const startMs = epoch(catalog.cueEvents[0].occurredAtUtc, 'INVALID_EVENT_TIME');
  const endMs = epoch(catalog.cueEvents[catalog.cueEvents.length - 1].occurredAtUtc, 'INVALID_EVENT_TIME');
  const selectedAssetId = command.assetId === undefined ? session.selectedAssetId : command.assetId;
  if (command.type === 'LOADED') return snapshot(catalog, session.atUtc, 'PAUSED', session.playbackRate, selectedAssetId);
  if (command.type === 'PLAY') return snapshot(catalog, session.atUtc, 'PLAYING', session.playbackRate, selectedAssetId);
  if (command.type === 'PAUSE') return snapshot(catalog, session.atUtc, 'PAUSED', session.playbackRate, selectedAssetId);
  if (command.type === 'SEEK') {
    const targetMs = epoch(command.atUtc, 'INVALID_SEEK_TIME');
    if (targetMs < startMs || targetMs > endMs) fail('SEEK_OUT_OF_RANGE', 'Seek must remain within the artifact replay window');
    return snapshot(catalog, command.atUtc, 'SEEKING', session.playbackRate, selectedAssetId);
  }
  if (command.type === 'TICK') {
    if (!Number.isFinite(command.elapsedMs) || command.elapsedMs < 0) fail('INVALID_TICK', 'elapsedMs must be a non-negative finite number');
    if (!['PLAYING', 'DEGRADED'].includes(session.state)) return session;
    const nextMs = Math.min(endMs, epoch(session.atUtc, 'INVALID_REPLAY_TIME') + command.elapsedMs * session.playbackRate);
    const nextState = nextMs === endMs ? 'COMPLETED' : 'PLAYING';
    return snapshot(catalog, new Date(nextMs).toISOString(), nextState, session.playbackRate, selectedAssetId);
  }
  fail('UNKNOWN_REPLAY_COMMAND', `Unsupported replay command: ${command.type}`);
}

function urlFrom(input) {
  if (input instanceof URL) return new URL(input.toString());
  const value = String(input || 'https://earthus.net/');
  return new URL(value.includes('://') ? value : `https://earthus.net/${value.replace(/^\?/, '?')}`);
}

export function encodeMissionReplayLink(catalog, { atUtc, assetId = null } = {}, baseUrl = 'https://earthus.net/') {
  const url = urlFrom(baseUrl);
  ROUTE_KEYS.forEach(key => url.searchParams.delete(key));
  const canonicalUtc = utc(atUtc || catalog.cueEvents[0].occurredAtUtc, 'INVALID_REPLAY_TIME');
  if (assetId) {
    const rights = evaluateMissionAssetRights(catalog, assetId);
    if (!rights.allowed) fail(rights.code, 'Cannot create a public link to a blocked asset');
  }
  url.searchParams.set('aetherusMission', '1');
  url.searchParams.set('mission', catalog.mission.id);
  url.searchParams.set('missionRevision', String(catalog.artifact.revision));
  url.searchParams.set('replayAt', canonicalUtc);
  if (assetId) url.searchParams.set('replayAsset', assetId);
  return url;
}

export function decodeMissionReplayLink(input) {
  const url = urlFrom(input);
  const params = url.searchParams;
  const issues = [];
  const enabled = params.get('aetherusMission') === '1';
  const missionId = params.get('mission');
  const revisionText = params.get('missionRevision');
  const atUtc = params.get('replayAt');
  const assetId = params.get('replayAsset');
  if (!enabled) issues.push('NOT_A_MISSION_REPLAY_LINK');
  if (!missionId || !ID_PATTERN.test(missionId)) issues.push('INVALID_MISSION_ID');
  const revision = Number(revisionText);
  if (!Number.isInteger(revision) || revision < 1) issues.push('INVALID_MISSION_REVISION');
  if (!atUtc || !UTC_PATTERN.test(atUtc) || !Number.isFinite(Date.parse(atUtc))) issues.push('INVALID_REPLAY_TIME');
  if (assetId && !ID_PATTERN.test(assetId)) issues.push('INVALID_REPLAY_ASSET');
  return freeze({
    enabled,
    missionId: issues.includes('INVALID_MISSION_ID') ? null : missionId,
    revision: issues.includes('INVALID_MISSION_REVISION') ? null : revision,
    atUtc: issues.includes('INVALID_REPLAY_TIME') ? null : new Date(atUtc).toISOString(),
    assetId: issues.includes('INVALID_REPLAY_ASSET') ? null : assetId,
    issues: freeze(issues),
  });
}

export function restoreMissionReplayLink(catalog, input) {
  const decoded = decodeMissionReplayLink(input);
  if (decoded.issues.length) return freeze({ status: 'BLOCKED', reason: decoded.issues[0], route: decoded, session: null });
  if (decoded.missionId !== catalog.mission.id) {
    return freeze({ status: 'BLOCKED', reason: 'MISSION_NOT_IN_ARTIFACT', route: decoded, session: null });
  }
  if (decoded.revision !== catalog.artifact.revision) {
    return freeze({ status: 'BLOCKED', reason: 'REVISION_NOT_AVAILABLE', route: decoded, session: null });
  }
  if (decoded.assetId && !evaluateMissionAssetRights(catalog, decoded.assetId).allowed) {
    return freeze({ status: 'BLOCKED', reason: 'ASSET_NOT_RESTORABLE', route: decoded, session: null });
  }
  return freeze({
    status: 'RESTORED',
    reason: null,
    route: decoded,
    session: createMissionReplaySession(catalog, { atUtc: decoded.atUtc, selectedAssetId: decoded.assetId }),
  });
}

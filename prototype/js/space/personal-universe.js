// Aetherus Personal Universe — local-first ownership boundary.
// 이 기록은 AI Memory, Community Post, 원본 RAW archive와 다르다. 사용자의 발견·관측·
// 컬렉션 맥락만 보관하며, AI가 추천을 위해 몰래 쓰는 프로필이나 공개 게시물로 바꾸지 않는다.

export const PERSONAL_UNIVERSE_SCHEMAS = Object.freeze({
  universe: 'earthus.personal-universe.v1',
  record: 'earthus.personal-universe-record.v1',
  exportManifest: 'earthus.personal-universe-export-manifest.v1',
  exportPackage: 'earthus.personal-universe-export-package.v1',
  deletionReceipt: 'earthus.personal-universe-deletion-receipt.v1',
});

const RECORD_TYPES = new Set([
  'DISCOVERY', 'OBSERVATION_REFERENCE', 'MISSION_BOOKMARK', 'EQUIPMENT_ACHIEVEMENT', 'LEARNING_NOTE',
]);
const PROVENANCE = new Set(['observation', 'calculated', 'reconstruction', 'simulation', 'ai', 'user-content']);
const LOCATION_POLICIES = new Set(['NOT_STORED', 'COARSE_REGION']);
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export class PersonalUniverseError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'PersonalUniverseError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new PersonalUniverseError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && !!value.trim();
const clone = value => JSON.parse(JSON.stringify(value));

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function token(value, code, maximum = 160) {
  const normalized = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:-]+$/.test(normalized) && normalized.length <= maximum, code);
  return normalized;
}

function utc(value, code = 'PERSONAL_UNIVERSE_UTC_REQUIRED') {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  requireValue(Number.isFinite(date.getTime()), code);
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();
}

function bytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (typeof value === 'string') return new TextEncoder().encode(value);
  fail('PERSONAL_UNIVERSE_BYTES_REQUIRED');
}

export function personalUniverseCanonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(personalUniverseCanonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${personalUniverseCanonicalJson(value[key])}`).join(',')}}`;
}

export async function personalUniverseSha256(value, { cryptoRef = globalThis.crypto } = {}) {
  requireValue(cryptoRef?.subtle?.digest, 'PERSONAL_UNIVERSE_WEBCRYPTO_REQUIRED');
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes(value));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function base64Encode(value) {
  const source = bytes(value);
  let output = '';
  for (let index = 0; index < source.length; index += 3) {
    const a = source[index];
    const hasB = index + 1 < source.length;
    const hasC = index + 2 < source.length;
    const b = hasB ? source[index + 1] : 0;
    const c = hasC ? source[index + 2] : 0;
    const group = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(group >>> 18) & 63];
    output += BASE64_ALPHABET[(group >>> 12) & 63];
    output += hasB ? BASE64_ALPHABET[(group >>> 6) & 63] : '=';
    output += hasC ? BASE64_ALPHABET[group & 63] : '=';
  }
  return output;
}

function base64Decode(value) {
  requireValue(typeof value === 'string' && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
    'PERSONAL_UNIVERSE_BASE64_INVALID');
  const length = value.length ? (value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) : 0;
  const output = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(value[index]);
    const b = BASE64_ALPHABET.indexOf(value[index + 1]);
    const c = value[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 2]);
    const d = value[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 3]);
    const group = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < length) output[offset++] = (group >>> 16) & 255;
    if (offset < length) output[offset++] = (group >>> 8) & 255;
    if (offset < length) output[offset++] = group & 255;
  }
  return output;
}

function recordId(value) { return token(value, 'PERSONAL_UNIVERSE_RECORD_ID_REQUIRED'); }

function validatePrivacy(value) {
  requireValue(isObject(value) && value.visibility === 'PRIVATE', 'PERSONAL_UNIVERSE_PRIVATE_REQUIRED');
  requireValue(LOCATION_POLICIES.has(value.locationPolicy), 'PERSONAL_UNIVERSE_LOCATION_POLICY_REQUIRED');
  requireValue(!('latitude' in value) && !('longitude' in value) && !('preciseLocation' in value),
    'PERSONAL_UNIVERSE_PRECISE_LOCATION_FORBIDDEN');
  if (value.locationPolicy === 'COARSE_REGION') {
    requireValue(isText(value.coarseRegion) && value.coarseRegion.length <= 120,
      'PERSONAL_UNIVERSE_COARSE_REGION_REQUIRED');
  }
  return freeze({
    visibility: 'PRIVATE', locationPolicy: value.locationPolicy,
    coarseRegion: value.locationPolicy === 'COARSE_REGION' ? value.coarseRegion.trim() : null,
  });
}

function normalizeSourceContext(value) {
  requireValue(isObject(value), 'PERSONAL_UNIVERSE_SOURCE_CONTEXT_REQUIRED');
  requireValue(PROVENANCE.has(value.provenance), 'PERSONAL_UNIVERSE_PROVENANCE_REQUIRED');
  requireValue(isText(value.sourceRevision) && value.sourceRevision.length <= 160,
    'PERSONAL_UNIVERSE_SOURCE_REVISION_REQUIRED');
  requireValue(isText(value.freshness) && value.freshness.length <= 80,
    'PERSONAL_UNIVERSE_FRESHNESS_REQUIRED');
  requireValue(isText(value.precision) && value.precision.length <= 80,
    'PERSONAL_UNIVERSE_PRECISION_REQUIRED');
  return freeze({
    provenance: value.provenance,
    sourceRevision: value.sourceRevision.trim(),
    freshness: value.freshness.trim(),
    precision: value.precision.trim(),
    sourceUrl: isText(value.sourceUrl) && /^https:\/\//.test(value.sourceUrl) ? value.sourceUrl.trim() : null,
  });
}

function normalizeRecord(input, createdAtUtc) {
  requireValue(isObject(input), 'PERSONAL_UNIVERSE_RECORD_REQUIRED');
  const type = String(input.type || '').trim();
  requireValue(RECORD_TYPES.has(type), 'PERSONAL_UNIVERSE_RECORD_TYPE_REQUIRED');
  const subjectId = token(input.subjectId, 'PERSONAL_UNIVERSE_SUBJECT_ID_REQUIRED');
  const title = String(input.title || '').trim();
  requireValue(title && title.length <= 240, 'PERSONAL_UNIVERSE_TITLE_REQUIRED');
  const note = input.note === null || input.note === undefined ? null : String(input.note).trim();
  requireValue(note === null || note.length <= 4000, 'PERSONAL_UNIVERSE_NOTE_TOO_LONG');
  return freeze({
    schema: PERSONAL_UNIVERSE_SCHEMAS.record,
    recordId: recordId(input.recordId),
    type,
    subjectId,
    title,
    note,
    createdAtUtc,
    sourceContext: normalizeSourceContext(input.sourceContext),
    privacy: validatePrivacy(input.privacy),
    // A reference can point to a session/archive ID, but Personal never owns or deletes its raw bytes.
    linkedObservationId: input.linkedObservationId ? token(input.linkedObservationId, 'PERSONAL_UNIVERSE_OBSERVATION_ID_INVALID') : null,
  });
}

function commandDigest(payload) { return personalUniverseSha256(personalUniverseCanonicalJson(payload)); }

export function createMemoryPersonalUniverseRepository() {
  const universes = new Map();
  const receipts = new Map();
  const commands = new Map();
  return Object.freeze({
    kind: 'MEMORY_FIXTURE',
    async readUniverse(id) { const value = universes.get(id); return value ? freeze(clone(value)) : null; },
    async writeUniverse(value, expectedRevision) {
      const existing = universes.get(value.universeId);
      if (existing) requireValue(existing.revision === expectedRevision, 'PERSONAL_UNIVERSE_REVISION_CONFLICT', {
        expectedRevision, actualRevision: existing.revision,
      });
      else requireValue(expectedRevision === 0, 'PERSONAL_UNIVERSE_REVISION_CONFLICT');
      universes.set(value.universeId, clone(value));
      return freeze(clone(value));
    },
    async deleteUniverse(id, expectedRevision) {
      const existing = universes.get(id);
      requireValue(existing && existing.revision === expectedRevision, 'PERSONAL_UNIVERSE_REVISION_CONFLICT');
      universes.delete(id);
    },
    async readReceipt(id) { const value = receipts.get(id); return value ? freeze(clone(value)) : null; },
    async writeReceipt(value) {
      requireValue(!receipts.has(value.receiptId), 'PERSONAL_UNIVERSE_RECEIPT_EXISTS');
      receipts.set(value.receiptId, clone(value));
      return freeze(clone(value));
    },
    async readCommand(id) { const value = commands.get(id); return value ? freeze(clone(value)) : null; },
    async writeCommand(value) {
      requireValue(!commands.has(value.idempotencyKey), 'PERSONAL_UNIVERSE_COMMAND_EXISTS');
      commands.set(value.idempotencyKey, clone(value));
    },
  });
}

function sortedRecords(records) {
  return [...records].sort((a, b) => a.createdAtUtc.localeCompare(b.createdAtUtc) || a.recordId.localeCompare(b.recordId));
}

export function createPersonalUniverseService({ repository, now = () => new Date(), idFactory = null } = {}) {
  requireValue(repository?.readUniverse && repository?.writeUniverse && repository?.deleteUniverse,
    'PERSONAL_UNIVERSE_REPOSITORY_REQUIRED');
  const makeId = prefix => idFactory ? idFactory(prefix) : `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

  async function applyCommand(idempotencyKey, payload, operation) {
    const key = token(idempotencyKey, 'PERSONAL_UNIVERSE_IDEMPOTENCY_KEY_REQUIRED');
    const digest = await commandDigest(payload);
    const existing = await repository.readCommand(key);
    if (existing) {
      requireValue(existing.digest === digest, 'PERSONAL_UNIVERSE_IDEMPOTENCY_CONFLICT');
      return freeze({ status: 'DUPLICATE', result: existing.result });
    }
    const result = await operation();
    await repository.writeCommand({ idempotencyKey: key, digest, result: clone(result) });
    return freeze({ status: 'APPLIED', result });
  }

  return Object.freeze({
    async create({ universeId = null, ownerId, privacy = { locationPolicy: 'NOT_STORED' }, idempotencyKey } = {}) {
      const id = token(universeId || makeId('universe'), 'PERSONAL_UNIVERSE_ID_REQUIRED');
      const owner = token(ownerId, 'PERSONAL_UNIVERSE_OWNER_REQUIRED');
      return applyCommand(idempotencyKey || `create:${id}`, { type: 'create', id, owner }, async () => {
        requireValue(!(await repository.readUniverse(id)), 'PERSONAL_UNIVERSE_ALREADY_EXISTS');
        const createdAtUtc = utc(now());
        const universe = freeze({
          schema: PERSONAL_UNIVERSE_SCHEMAS.universe, universeId: id, ownerId: owner,
          revision: 1, state: 'PRIVATE', createdAtUtc, updatedAtUtc: createdAtUtc,
          defaultPrivacy: validatePrivacy({ visibility: 'PRIVATE', ...privacy }), records: [],
          // Explicit boundary: a Personal Universe delete/export does not access AI Memory or RAW archive.
          exclusions: freeze(['AI_MEMORY', 'OBSERVATION_RAW_BYTES', 'COMMUNITY_POSTS']),
        });
        return repository.writeUniverse(universe, 0);
      });
    },

    async addRecord({ universeId, ownerId, expectedRevision, record, idempotencyKey } = {}) {
      const id = token(universeId, 'PERSONAL_UNIVERSE_ID_REQUIRED');
      const owner = token(ownerId, 'PERSONAL_UNIVERSE_OWNER_REQUIRED');
      requireValue(Number.isInteger(expectedRevision) && expectedRevision > 0, 'PERSONAL_UNIVERSE_EXPECTED_REVISION_REQUIRED');
      return applyCommand(idempotencyKey, { type: 'add-record', id, expectedRevision, record }, async () => {
        const universe = await repository.readUniverse(id);
        requireValue(universe, 'PERSONAL_UNIVERSE_NOT_FOUND');
        requireValue(universe.ownerId === owner, 'PERSONAL_UNIVERSE_NOT_AUTHORIZED');
        requireValue(universe.revision === expectedRevision, 'PERSONAL_UNIVERSE_REVISION_CONFLICT');
        const nextRecord = normalizeRecord(record, utc(now()));
        requireValue(!universe.records.some(item => item.recordId === nextRecord.recordId), 'PERSONAL_UNIVERSE_RECORD_EXISTS');
        const next = freeze({ ...universe, revision: universe.revision + 1, updatedAtUtc: utc(now()),
          records: sortedRecords([...universe.records, nextRecord]) });
        return repository.writeUniverse(next, expectedRevision);
      });
    },

    async load({ universeId, ownerId } = {}) {
      const universe = await repository.readUniverse(token(universeId, 'PERSONAL_UNIVERSE_ID_REQUIRED'));
      requireValue(universe, 'PERSONAL_UNIVERSE_NOT_FOUND');
      requireValue(universe.ownerId === token(ownerId, 'PERSONAL_UNIVERSE_OWNER_REQUIRED'), 'PERSONAL_UNIVERSE_NOT_AUTHORIZED');
      return universe;
    },

    async exportPackage({ universeId, ownerId, exportId = null } = {}) {
      const universe = await this.load({ universeId, ownerId });
      const generatedAtUtc = utc(now());
      const manifestCore = {
        schema: PERSONAL_UNIVERSE_SCHEMAS.exportManifest, schemaVersion: 1,
        exportId: token(exportId || makeId('personal_export'), 'PERSONAL_UNIVERSE_EXPORT_ID_REQUIRED'),
        universeId: universe.universeId, revision: universe.revision, generatedAtUtc,
        recordCount: universe.records.length, digestAlgorithm: 'SHA-256',
        exclusions: [...universe.exclusions],
      };
      const snapshot = clone(universe);
      const snapshotBytes = new TextEncoder().encode(personalUniverseCanonicalJson(snapshot));
      const manifest = freeze({ ...manifestCore, snapshotDigest: await personalUniverseSha256(snapshotBytes) });
      const envelope = { schema: PERSONAL_UNIVERSE_SCHEMAS.exportPackage, schemaVersion: 1, manifest, snapshotBase64: base64Encode(snapshotBytes) };
      const packageBytes = new TextEncoder().encode(personalUniverseCanonicalJson(envelope));
      return freeze({ packageBytes, manifest, packageDigest: await personalUniverseSha256(packageBytes) });
    },

    async delete({ universeId, ownerId, expectedRevision, exportPackageBytes, explicitUserConfirmation, receiptId = null, idempotencyKey } = {}) {
      requireValue(explicitUserConfirmation === true, 'PERSONAL_UNIVERSE_DELETE_CONFIRMATION_REQUIRED');
      const id = token(universeId, 'PERSONAL_UNIVERSE_ID_REQUIRED');
      const owner = token(ownerId, 'PERSONAL_UNIVERSE_OWNER_REQUIRED');
      requireValue(Number.isInteger(expectedRevision) && expectedRevision > 0, 'PERSONAL_UNIVERSE_EXPECTED_REVISION_REQUIRED');
      const verified = await verifyPersonalUniverseExport(exportPackageBytes);
      return applyCommand(idempotencyKey, { type: 'delete', id, expectedRevision, packageDigest: verified.packageDigest }, async () => {
        const universe = await this.load({ universeId: id, ownerId: owner });
        requireValue(universe.revision === expectedRevision, 'PERSONAL_UNIVERSE_REVISION_CONFLICT');
        requireValue(verified.manifest.universeId === id && verified.manifest.revision === universe.revision,
          'PERSONAL_UNIVERSE_EXPORT_DOES_NOT_MATCH_CURRENT');
        const occurredAtUtc = utc(now());
        const receiptCore = {
          schema: PERSONAL_UNIVERSE_SCHEMAS.deletionReceipt, schemaVersion: 1,
          receiptId: token(receiptId || makeId('personal_delete'), 'PERSONAL_UNIVERSE_RECEIPT_ID_REQUIRED'),
          universeId: id, deletedRevision: universe.revision, occurredAtUtc,
          exportPackageDigest: verified.packageDigest,
          scopes: {
            personalUniverse: 'COMPLETED_LOCAL', localCache: 'COMPLETED_LOCAL', remoteReplica: 'NOT_CONFIGURED',
            aiMemory: 'OUT_OF_SCOPE_SEPARATE_SCHEMA', observationRawBytes: 'OUT_OF_SCOPE_ARCHIVE_OWNER', communityPosts: 'OUT_OF_SCOPE_COMMUNITY_OWNER',
          },
        };
        const receipt = freeze({ ...receiptCore, receiptDigest: await personalUniverseSha256(personalUniverseCanonicalJson(receiptCore)) });
        await repository.deleteUniverse(id, expectedRevision);
        await repository.writeReceipt(receipt);
        return receipt;
      });
    },

    async loadDeletionReceipt(receiptId) { return repository.readReceipt(token(receiptId, 'PERSONAL_UNIVERSE_RECEIPT_ID_REQUIRED')); },
  });
}

export async function verifyPersonalUniverseExport(packageBytes) {
  const raw = bytes(packageBytes);
  let envelope;
  try { envelope = JSON.parse(new TextDecoder().decode(raw)); } catch { fail('PERSONAL_UNIVERSE_EXPORT_JSON_INVALID'); }
  requireValue(envelope?.schema === PERSONAL_UNIVERSE_SCHEMAS.exportPackage && envelope.schemaVersion === 1,
    'PERSONAL_UNIVERSE_EXPORT_SCHEMA_INVALID');
  const manifest = envelope.manifest;
  requireValue(manifest?.schema === PERSONAL_UNIVERSE_SCHEMAS.exportManifest && manifest.schemaVersion === 1
    && manifest.digestAlgorithm === 'SHA-256', 'PERSONAL_UNIVERSE_EXPORT_MANIFEST_INVALID');
  const snapshotBytes = base64Decode(envelope.snapshotBase64);
  requireValue(await personalUniverseSha256(snapshotBytes) === manifest.snapshotDigest,
    'PERSONAL_UNIVERSE_EXPORT_SNAPSHOT_DIGEST_MISMATCH');
  let snapshot;
  try { snapshot = JSON.parse(new TextDecoder().decode(snapshotBytes)); } catch { fail('PERSONAL_UNIVERSE_EXPORT_SNAPSHOT_INVALID'); }
  requireValue(snapshot?.schema === PERSONAL_UNIVERSE_SCHEMAS.universe
    && snapshot.universeId === manifest.universeId && snapshot.revision === manifest.revision
    && snapshot.records?.length === manifest.recordCount, 'PERSONAL_UNIVERSE_EXPORT_CONTENT_MISMATCH');
  return freeze({ manifest: freeze(clone(manifest)), snapshot: freeze(snapshot), packageDigest: await personalUniverseSha256(raw) });
}

export async function verifyPersonalUniverseDeletionReceipt(receipt) {
  requireValue(receipt?.schema === PERSONAL_UNIVERSE_SCHEMAS.deletionReceipt && receipt.schemaVersion === 1
    && isText(receipt.receiptDigest), 'PERSONAL_UNIVERSE_RECEIPT_INVALID');
  const { receiptDigest, ...core } = receipt;
  requireValue(await personalUniverseSha256(personalUniverseCanonicalJson(core)) === receiptDigest,
    'PERSONAL_UNIVERSE_RECEIPT_DIGEST_MISMATCH');
  requireValue(core.scopes?.personalUniverse === 'COMPLETED_LOCAL' && core.scopes?.aiMemory === 'OUT_OF_SCOPE_SEPARATE_SCHEMA',
    'PERSONAL_UNIVERSE_RECEIPT_SCOPE_INVALID');
  return freeze(clone(receipt));
}

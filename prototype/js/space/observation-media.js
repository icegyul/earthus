// Aetherus Capture → Review → Archive local-first vertical slice.
//
// 사용자 RAW는 content digest와 별도 immutable asset identity로 보존한다. 파생물은
// 재현 가능한 recipe와 새 provenance를 가져야 하며, archive upload/export/delete는
// 명시적 checkpoint와 영수증 없이는 완료로 바뀌지 않는다. 실제 카메라 제어, 운영
// cloud storage, 계정 sync, FITS/RAW decoder는 이 모듈의 책임이 아니다.

export const OBSERVATION_MEDIA_DB_NAME = 'earthus-aetherus-observation-media';
export const OBSERVATION_MEDIA_DB_VERSION = 1;
export const OBSERVATION_MEDIA_SCHEMAS = Object.freeze({
  captureJob: 'earthus.capture-job.v1',
  rawAsset: 'earthus.observation-raw-asset.v1',
  reviewSet: 'earthus.observation-review-set.v1',
  recipe: 'earthus.processing-recipe.v1',
  derivativeAsset: 'earthus.observation-derivative-asset.v1',
  archiveObject: 'earthus.observation-archive-object.v1',
  uploadCheckpoint: 'earthus.archive-upload-checkpoint.v1',
  exportManifest: 'earthus.observation-export-manifest.v1',
  exportPackage: 'earthus.observation-export-package.v1',
  deletionReceipt: 'earthus.archive-deletion-receipt.v1',
});

const COLLECTIONS = Object.freeze([
  'captureJobs',
  'rawAssets',
  'reviewSets',
  'derivativeAssets',
  'archiveObjects',
  'uploadCheckpoints',
  'deletionReceipts',
  'exportRecords',
  'commands',
]);
const CAPTURE_TERMINAL_STATES = new Set(['COMPLETED', 'ABORTED', 'FAILED']);
const REVIEW_TERMINAL_STATES = new Set(['APPROVED', 'REJECTED', 'SOURCE_DELETED']);
const MEDIA_TYPES = new Set([
  'application/fits',
  'application/octet-stream',
  'image/dng',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);
const QUALITY_FLAGS = new Set([
  'ACCEPTABLE',
  'BLUR_PROXY_HIGH',
  'SATURATION_PROXY_HIGH',
  'BACKGROUND_PROXY_HIGH',
  'CALIBRATION_UNKNOWN',
  'WCS_UNVERIFIED',
]);
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export class ObservationMediaError extends Error {
  constructor(code, details = {}, cause = null) {
    super(code);
    this.name = 'ObservationMediaError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    if (cause) this.cause = cause;
  }
}

const fail = (code, details = {}, cause = null) => {
  throw new ObservationMediaError(code, details, cause);
};
const requireValue = (condition, code, details = {}) => {
  if (!condition) fail(code, details);
};
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && !!value.trim();
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const isUtc = value => isText(value) && /Z$/.test(value) && Number.isFinite(Date.parse(value));

function cloneValue(value) {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizedUtc(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  requireValue(Number.isFinite(date.getTime()), 'MEDIA_VALID_UTC_REQUIRED');
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();
}

function safeToken(value, code, maximum = 160) {
  const token = String(value || '').trim();
  requireValue(token && token.length <= maximum && /^[A-Za-z0-9._:-]+$/.test(token), code);
  return token;
}

function randomToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const values = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * 0xffffffff); });
  return Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value));
}

export function observationMediaBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (typeof value === 'string') return utf8Bytes(value);
  fail('MEDIA_BYTES_REQUIRED');
}

export function observationMediaCanonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(observationMediaCanonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${observationMediaCanonicalJson(value[key])}`).join(',')}}`;
}

export async function observationMediaSha256(value, { cryptoRef = globalThis.crypto } = {}) {
  requireValue(cryptoRef?.subtle?.digest, 'MEDIA_WEBCRYPTO_REQUIRED');
  const digest = await cryptoRef.subtle.digest('SHA-256', observationMediaBytes(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function encodeBase64(value) {
  const bytes = observationMediaBytes(value);
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    const group = (a << 16) | (b << 8) | c;
    result += BASE64_ALPHABET[(group >>> 18) & 63];
    result += BASE64_ALPHABET[(group >>> 12) & 63];
    result += hasB ? BASE64_ALPHABET[(group >>> 6) & 63] : '=';
    result += hasC ? BASE64_ALPHABET[group & 63] : '=';
  }
  return result;
}

function decodeBase64(value) {
  requireValue(typeof value === 'string' && value.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'MEDIA_BASE64_INVALID');
  const outputLength = value.length ? ((value.length / 4) * 3)
    - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) : 0;
  const bytes = new Uint8Array(outputLength);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(value[index]);
    const b = BASE64_ALPHABET.indexOf(value[index + 1]);
    const c = value[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 2]);
    const d = value[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 3]);
    const group = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < outputLength) bytes[offset++] = (group >>> 16) & 255;
    if (offset < outputLength) bytes[offset++] = (group >>> 8) & 255;
    if (offset < outputLength) bytes[offset++] = group & 255;
  }
  return bytes;
}

function mapStorageError(error) {
  if (error instanceof ObservationMediaError) return error;
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new ObservationMediaError('OBSERVATION_MEDIA_STORAGE_PRESSURE', {}, error);
  }
  return new ObservationMediaError('OBSERVATION_MEDIA_STORAGE_FAILED', {}, error);
}

function assertCollection(collection) {
  requireValue(COLLECTIONS.includes(collection), 'MEDIA_COLLECTION_UNSUPPORTED', { collection });
}

function revisionOf(record) {
  return record && Number.isInteger(record.revision) ? record.revision : null;
}

function assertPrecondition(existing, precondition) {
  if (precondition.exists === false) {
    requireValue(!existing, 'MEDIA_ALREADY_EXISTS', { collection: precondition.collection, id: precondition.id });
    return;
  }
  requireValue(!!existing, 'MEDIA_RECORD_NOT_FOUND', { collection: precondition.collection, id: precondition.id });
  if (precondition.revision !== undefined) {
    requireValue(revisionOf(existing) === precondition.revision, 'MEDIA_REVISION_CONFLICT', {
      collection: precondition.collection,
      id: precondition.id,
      expectedRevision: precondition.revision,
      actualRevision: revisionOf(existing),
    });
  }
  if (precondition.contentDigest !== undefined) {
    requireValue(existing.contentDigest === precondition.contentDigest, 'MEDIA_IMMUTABILITY_VIOLATION', {
      collection: precondition.collection,
      id: precondition.id,
    });
  }
}

function assertImmutableWrite(existing, write) {
  if (!existing) return;
  requireValue(existing.contentDigest && existing.contentDigest === write.value.contentDigest
    && existing.byteLength === write.value.byteLength, 'MEDIA_IMMUTABILITY_VIOLATION', {
    collection: write.collection,
    id: write.id,
  });
}

function normalizeMutation(mutation) {
  const normalized = {
    preconditions: mutation.preconditions || [],
    immutableWrites: mutation.immutableWrites || [],
    writes: mutation.writes || [],
    deletes: mutation.deletes || [],
    command: mutation.command || null,
    result: mutation.result || null,
  };
  [...normalized.preconditions, ...normalized.immutableWrites, ...normalized.writes, ...normalized.deletes]
    .forEach(item => assertCollection(item.collection));
  return normalized;
}

export function createMemoryObservationMediaRepository() {
  const stores = Object.fromEntries(COLLECTIONS.map(name => [name, new Map()]));
  let nextFailure = null;

  return Object.freeze({
    kind: 'MEMORY_FIXTURE',
    async read(collection, id) {
      assertCollection(collection);
      const value = stores[collection].get(id);
      return value === undefined ? null : deepFreeze(cloneValue(value));
    },
    async list(collection) {
      assertCollection(collection);
      return [...stores[collection].values()].map(value => deepFreeze(cloneValue(value)));
    },
    async applyMutation(input) {
      if (nextFailure) {
        const failure = nextFailure;
        nextFailure = null;
        throw new ObservationMediaError(failure);
      }
      const mutation = normalizeMutation(input);
      const existingCommand = mutation.command
        ? stores.commands.get(mutation.command.id)
        : null;
      if (existingCommand) {
        requireValue(existingCommand.digest === mutation.command.digest,
          'MEDIA_IDEMPOTENCY_CONFLICT', { commandId: mutation.command.id });
        return deepFreeze({ status: 'DUPLICATE', result: cloneValue(existingCommand.result) });
      }
      mutation.preconditions.forEach(item => assertPrecondition(stores[item.collection].get(item.id), item));
      mutation.immutableWrites.forEach(item => assertImmutableWrite(stores[item.collection].get(item.id), item));
      mutation.immutableWrites.forEach(item => {
        if (!stores[item.collection].has(item.id)) stores[item.collection].set(item.id, cloneValue(item.value));
      });
      mutation.writes.forEach(item => stores[item.collection].set(item.id, cloneValue(item.value)));
      mutation.deletes.forEach(item => stores[item.collection].delete(item.id));
      if (mutation.command) {
        stores.commands.set(mutation.command.id, cloneValue({
          id: mutation.command.id,
          digest: mutation.command.digest,
          result: mutation.result,
        }));
      }
      return deepFreeze({ status: 'APPLIED', result: cloneValue(mutation.result) });
    },
    failNextMutation(code = 'OBSERVATION_MEDIA_STORAGE_PRESSURE') { nextFailure = code; },
    rawRecord(collection, id) {
      const value = stores[collection]?.get(id);
      return value === undefined ? null : cloneValue(value);
    },
    corruptFixtureByte(collection, id, byteIndex = 0) {
      assertCollection(collection);
      const value = stores[collection].get(id);
      requireValue(value?.bytes instanceof Uint8Array && value.bytes.byteLength > byteIndex,
        'MEDIA_FIXTURE_BYTE_NOT_FOUND', { collection, id, byteIndex });
      value.bytes[byteIndex] ^= 0xff;
    },
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapStorageError(request.error));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(mapStorageError(transaction.error));
    transaction.onerror = () => {};
  });
}

function openObservationMediaDatabase(indexedDb) {
  requireValue(indexedDb?.open, 'OBSERVATION_MEDIA_INDEXEDDB_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(OBSERVATION_MEDIA_DB_NAME, OBSERVATION_MEDIA_DB_VERSION);
    request.onupgradeneeded = event => {
      if (event.oldVersion !== 0) return;
      COLLECTIONS.forEach(collection => request.result.createObjectStore(collection, { keyPath: 'id' }));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapStorageError(request.error));
    request.onblocked = () => reject(new ObservationMediaError('OBSERVATION_MEDIA_DATABASE_BLOCKED'));
  });
}

export function createIndexedDbObservationMediaRepository({ indexedDb = globalThis.indexedDB } = {}) {
  let databasePromise = null;
  const database = () => {
    databasePromise = databasePromise || openObservationMediaDatabase(indexedDb);
    return databasePromise;
  };
  return Object.freeze({
    kind: 'INDEXEDDB_LOCAL_AUTHORITATIVE',
    async read(collection, id) {
      assertCollection(collection);
      const db = await database();
      const transaction = db.transaction(collection, 'readonly');
      const value = await requestResult(transaction.objectStore(collection).get(id));
      await transactionDone(transaction);
      return value === undefined ? null : deepFreeze(cloneValue(value));
    },
    async list(collection) {
      assertCollection(collection);
      const db = await database();
      const transaction = db.transaction(collection, 'readonly');
      const values = await requestResult(transaction.objectStore(collection).getAll());
      await transactionDone(transaction);
      return (values || []).map(value => deepFreeze(cloneValue(value)));
    },
    async applyMutation(input) {
      const mutation = normalizeMutation(input);
      const names = new Set(['commands']);
      [...mutation.preconditions, ...mutation.immutableWrites, ...mutation.writes, ...mutation.deletes]
        .forEach(item => names.add(item.collection));
      const db = await database();
      const transaction = db.transaction([...names], 'readwrite');
      try {
        const commandRequest = mutation.command
          ? transaction.objectStore('commands').get(mutation.command.id)
          : null;
        const preconditionRequests = mutation.preconditions.map(item => ({
          item,
          request: transaction.objectStore(item.collection).get(item.id),
        }));
        const immutableRequests = mutation.immutableWrites.map(item => ({
          item,
          request: transaction.objectStore(item.collection).get(item.id),
        }));
        const [existingCommand, preconditions, immutables] = await Promise.all([
          commandRequest ? requestResult(commandRequest) : null,
          Promise.all(preconditionRequests.map(async entry => ({
            item: entry.item,
            value: await requestResult(entry.request),
          }))),
          Promise.all(immutableRequests.map(async entry => ({
            item: entry.item,
            value: await requestResult(entry.request),
          }))),
        ]);
        if (existingCommand) {
          requireValue(existingCommand.digest === mutation.command.digest,
            'MEDIA_IDEMPOTENCY_CONFLICT', { commandId: mutation.command.id });
          await transactionDone(transaction);
          return deepFreeze({ status: 'DUPLICATE', result: cloneValue(existingCommand.result) });
        }
        preconditions.forEach(entry => assertPrecondition(entry.value, entry.item));
        immutables.forEach(entry => assertImmutableWrite(entry.value, entry.item));
        immutables.forEach(entry => {
          if (!entry.value) transaction.objectStore(entry.item.collection).add(cloneValue(entry.item.value));
        });
        mutation.writes.forEach(item => transaction.objectStore(item.collection).put(cloneValue(item.value)));
        mutation.deletes.forEach(item => transaction.objectStore(item.collection).delete(item.id));
        if (mutation.command) {
          transaction.objectStore('commands').add(cloneValue({
            id: mutation.command.id,
            digest: mutation.command.digest,
            result: mutation.result,
          }));
        }
        await transactionDone(transaction);
        return deepFreeze({ status: 'APPLIED', result: cloneValue(mutation.result) });
      } catch (error) {
        try { transaction.abort(); } catch (_) { /* transaction may already be closed */ }
        throw mapStorageError(error);
      }
    },
  });
}

async function commandDescriptor(scope, idempotencyKey, payload) {
  const normalizedScope = safeToken(scope, 'MEDIA_COMMAND_SCOPE_REQUIRED');
  const normalizedKey = safeToken(idempotencyKey, 'MEDIA_IDEMPOTENCY_KEY_REQUIRED', 220);
  return {
    id: `${normalizedScope}:${normalizedKey}`,
    digest: await observationMediaSha256(observationMediaCanonicalJson(payload)),
  };
}

async function replayIdempotentCommand(repository, command) {
  const existing = await repository.read('commands', command.id);
  if (!existing) return null;
  requireValue(existing.digest === command.digest,
    'MEDIA_IDEMPOTENCY_CONFLICT', { commandId: command.id });
  return deepFreeze({ status: 'DUPLICATE', ...cloneValue(existing.result) });
}

function requireRevision(value) {
  requireValue(Number.isInteger(value) && value >= 0, 'MEDIA_EXPECTED_REVISION_REQUIRED');
  return value;
}

function captureTransition(job, allowed, state, occurredAtUtc, eventType) {
  requireValue(allowed.includes(job.state), 'CAPTURE_TRANSITION_REJECTED', {
    from: job.state,
    to: state,
  });
  const history = [...job.history, {
    revision: job.revision + 1,
    eventType,
    from: job.state,
    to: state,
    occurredAtUtc,
  }].slice(-24);
  return deepFreeze({
    ...cloneValue(job),
    state,
    revision: job.revision + 1,
    updatedAtUtc: occurredAtUtc,
    history,
  });
}

function validateCaptureInput({ imagingPlan, deviceCapabilities, storage, power, safetyGate }) {
  requireValue(isObject(imagingPlan) && isText(imagingPlan.revision)
    && isText(imagingPlan.targetId), 'CAPTURE_VALID_IMAGING_PLAN_REQUIRED');
  requireValue(isObject(deviceCapabilities) && isText(deviceCapabilities.adapterId)
    && deviceCapabilities.physicalControl === false
    && Number.isInteger(deviceCapabilities.maxFrameBytes)
    && deviceCapabilities.maxFrameBytes > 0
    && Array.isArray(deviceCapabilities.mediaTypes)
    && deviceCapabilities.mediaTypes.length > 0
    && deviceCapabilities.mediaTypes.every(type => MEDIA_TYPES.has(type)),
  'CAPTURE_VALID_DEVICE_CAPABILITIES_REQUIRED');
  requireValue(isObject(storage) && Number.isInteger(storage.availableBytes)
    && storage.availableBytes >= 0, 'CAPTURE_STORAGE_STATUS_REQUIRED');
  requireValue(isObject(power) && ['OK', 'LIMITED'].includes(power.status), 'CAPTURE_POWER_STATUS_REQUIRED');
  requireValue(isObject(safetyGate) && safetyGate.status === 'ALLOWED'
    && isText(safetyGate.sourceRevision) && isUtc(safetyGate.checkedAtUtc),
  'CAPTURE_SAFETY_GATE_REQUIRED');
}

export function createCaptureOrchestrator({ repository, now = () => new Date(), idFactory = randomToken } = {}) {
  requireValue(repository?.read && repository?.applyMutation, 'CAPTURE_REPOSITORY_REQUIRED');

  const transition = async ({ jobId, expectedRevision, idempotencyKey, allowed, state, eventType }) => {
    const id = safeToken(jobId, 'CAPTURE_JOB_ID_REQUIRED');
    const revision = requireRevision(expectedRevision);
    const command = await commandDescriptor('capture', idempotencyKey || `${eventType}:${id}:${revision}`, {
      jobId: id,
      expectedRevision: revision,
      eventType,
    });
    const replayed = await replayIdempotentCommand(repository, command);
    if (replayed) return replayed;
    const job = await repository.read('captureJobs', id);
    requireValue(job, 'CAPTURE_JOB_NOT_FOUND', { jobId: id });
    requireValue(job.revision === revision, 'MEDIA_REVISION_CONFLICT', {
      expectedRevision: revision,
      actualRevision: job.revision,
    });
    if (state === 'DRAINING') requireValue(job.rawAssetIds.length > 0, 'CAPTURE_EMPTY_JOB_NOT_COMPLETABLE');
    const occurredAtUtc = normalizedUtc(now());
    const next = captureTransition(job, allowed, state, occurredAtUtc, eventType);
    const result = { job: next, eventType };
    const applied = await repository.applyMutation({
      preconditions: [{ collection: 'captureJobs', id, revision }],
      writes: [{ collection: 'captureJobs', id, value: next }],
      command,
      result,
    });
    return deepFreeze({ status: applied.status, ...applied.result });
  };

  return Object.freeze({
    async queue({ jobId = null, sessionId, imagingPlan, deviceCapabilities, storage, power,
      safetyGate, idempotencyKey = null } = {}) {
      validateCaptureInput({ imagingPlan, deviceCapabilities, storage, power, safetyGate });
      const nonce = String(idFactory());
      const id = safeToken(jobId || `capture_${nonce.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}`,
        'CAPTURE_JOB_ID_REQUIRED');
      const normalizedSessionId = safeToken(sessionId, 'CAPTURE_SESSION_ID_REQUIRED');
      const occurredAtUtc = normalizedUtc(now());
      const job = deepFreeze({
        schema: OBSERVATION_MEDIA_SCHEMAS.captureJob,
        schemaVersion: 1,
        id,
        jobId: id,
        sessionId: normalizedSessionId,
        planRevision: imagingPlan.revision,
        targetId: imagingPlan.targetId,
        state: 'QUEUED',
        revision: 1,
        createdAtUtc: occurredAtUtc,
        updatedAtUtc: occurredAtUtc,
        deviceCapabilities: {
          adapterId: deviceCapabilities.adapterId,
          adapterMode: 'FILE_WORKER_PORT',
          physicalControl: false,
          maxFrameBytes: deviceCapabilities.maxFrameBytes,
          mediaTypes: [...deviceCapabilities.mediaTypes],
        },
        storage: { availableBytesAtQueue: storage.availableBytes },
        power: { statusAtQueue: power.status },
        safetyGate: cloneValue(safetyGate),
        rawAssetIds: [],
        frameCount: 0,
        byteCount: 0,
        telemetry: {
          commandCount: 1,
          networkRequestCount: 0,
          originalUploadCount: 0,
          physicalDeviceCommandCount: 0,
        },
        checkpoint: { lastRawAssetId: null, lastContentDigest: null, frameSequence: 0 },
        provenance: {
          classification: 'user-content',
          status: 'CAPTURE_JOB_METADATA_ONLY',
          observationSampleCount: 0,
        },
        history: [{ revision: 1, eventType: 'Capture.Queued', from: null, to: 'QUEUED', occurredAtUtc }],
        limitations: [
          'file-worker-port-only-no-camera-control',
          'action-time-is-not-independent-observation-verification',
          'no-cloud-upload-or-account-sync',
        ],
      });
      const command = await commandDescriptor('capture', idempotencyKey || `queue:${id}`, {
        jobId: id,
        sessionId: normalizedSessionId,
        planRevision: imagingPlan.revision,
        targetId: imagingPlan.targetId,
        adapterId: deviceCapabilities.adapterId,
      });
      const result = { job, eventType: 'Capture.Queued' };
      const applied = await repository.applyMutation({
        preconditions: [{ collection: 'captureJobs', id, exists: false }],
        writes: [{ collection: 'captureJobs', id, value: job }],
        command,
        result,
      });
      return deepFreeze({ status: applied.status, ...applied.result });
    },

    prepare(input) {
      return transition({ ...input, allowed: ['QUEUED'], state: 'PREPARING', eventType: 'Capture.Prepared' });
    },
    start(input) {
      return transition({ ...input, allowed: ['PREPARING'], state: 'CAPTURING', eventType: 'Capture.Started' });
    },
    pause(input) {
      return transition({ ...input, allowed: ['CAPTURING'], state: 'PAUSED', eventType: 'Capture.Paused' });
    },
    resume(input) {
      return transition({ ...input, allowed: ['PAUSED'], state: 'CAPTURING', eventType: 'Capture.Resumed' });
    },
    drain(input) {
      return transition({ ...input, allowed: ['CAPTURING'], state: 'DRAINING', eventType: 'Capture.Draining' });
    },

    async storeFrame({ jobId, expectedRevision, idempotencyKey, bytes, expectedDigest = null,
      observedAtUtc, mediaType, dimensions = null } = {}) {
      const id = safeToken(jobId, 'CAPTURE_JOB_ID_REQUIRED');
      const revision = requireRevision(expectedRevision);
      requireValue(MEDIA_TYPES.has(mediaType), 'CAPTURE_MEDIA_TYPE_REJECTED', { mediaType });
      requireValue(isUtc(observedAtUtc), 'CAPTURE_OBSERVED_UTC_REQUIRED');
      const rawBytes = observationMediaBytes(bytes);
      const contentDigest = await observationMediaSha256(rawBytes);
      if (expectedDigest !== null) requireValue(expectedDigest === contentDigest, 'CAPTURE_FRAME_CHECKSUM_MISMATCH');
      const command = await commandDescriptor('capture', idempotencyKey
        || `frame:${id}:${revision}:${contentDigest.slice(0, 16)}`, {
        jobId: id,
        expectedRevision: revision,
        contentDigest,
        observedAtUtc: normalizedUtc(observedAtUtc),
        mediaType,
      });
      const replayed = await replayIdempotentCommand(repository, command);
      if (replayed) return replayed;
      const job = await repository.read('captureJobs', id);
      requireValue(job, 'CAPTURE_JOB_NOT_FOUND', { jobId: id });
      requireValue(job.revision === revision, 'MEDIA_REVISION_CONFLICT', {
        expectedRevision: revision,
        actualRevision: job.revision,
      });
      requireValue(job.state === 'CAPTURING', 'CAPTURE_FRAME_STATE_REJECTED', { state: job.state });
      requireValue(job.deviceCapabilities.mediaTypes.includes(mediaType),
        'CAPTURE_MEDIA_TYPE_REJECTED', { mediaType });
      requireValue(rawBytes.byteLength > 0
        && rawBytes.byteLength <= job.deviceCapabilities.maxFrameBytes,
      'CAPTURE_FRAME_SIZE_REJECTED', { byteLength: rawBytes.byteLength });
      requireValue(job.byteCount + rawBytes.byteLength <= job.storage.availableBytesAtQueue,
        'CAPTURE_STORAGE_EXHAUSTED');
      const sequence = job.checkpoint.frameSequence + 1;
      const rawAssetId = safeToken(`raw_${id}_${String(sequence).padStart(6, '0')}_${contentDigest.slice(0, 16)}`,
        'CAPTURE_RAW_ASSET_ID_INVALID', 220);
      if (dimensions !== null) {
        requireValue(isObject(dimensions) && Number.isInteger(dimensions.width) && dimensions.width > 0
          && Number.isInteger(dimensions.height) && dimensions.height > 0,
        'CAPTURE_DIMENSIONS_INVALID');
      }
      const capturedAtUtc = normalizedUtc(now());
      const rawAsset = deepFreeze({
        schema: OBSERVATION_MEDIA_SCHEMAS.rawAsset,
        schemaVersion: 1,
        id: rawAssetId,
        assetId: rawAssetId,
        assetKind: 'RAW_OBSERVATION',
        immutable: true,
        contentId: `sha256:${contentDigest}`,
        contentDigest,
        digestAlgorithm: 'SHA-256',
        byteLength: rawBytes.byteLength,
        bytes: rawBytes,
        mediaType,
        dimensions: dimensions ? cloneValue(dimensions) : null,
        jobId: id,
        sessionId: job.sessionId,
        planRevision: job.planRevision,
        targetId: job.targetId,
        sequence,
        observedAtUtc: normalizedUtc(observedAtUtc),
        capturedAtUtc,
        provenance: {
          classification: 'observation',
          origin: 'USER_CAPTURED_RAW',
          evidence: 'RAW_BYTES_SHA256',
          revision: 1,
        },
        privacy: {
          originalFilenameStored: false,
          filePathStored: false,
          exifLocationStored: false,
          location: 'REDACTED_BY_DEFAULT',
        },
        reviewStatus: 'UNREVIEWED',
        archiveStatus: 'LOCAL_RAW_ONLY',
        limitations: [
          'media-container-not-decoded',
          'capture-time-is-device-recorded',
          'no-independent-astrometric-or-photometric-verification',
        ],
      });
      const next = deepFreeze({
        ...cloneValue(job),
        revision: revision + 1,
        updatedAtUtc: capturedAtUtc,
        rawAssetIds: [...job.rawAssetIds, rawAssetId],
        frameCount: job.frameCount + 1,
        byteCount: job.byteCount + rawBytes.byteLength,
        telemetry: { ...job.telemetry, commandCount: job.telemetry.commandCount + 1 },
        checkpoint: {
          lastRawAssetId: rawAssetId,
          lastContentDigest: contentDigest,
          frameSequence: sequence,
        },
        provenance: { ...job.provenance, observationSampleCount: job.frameCount + 1 },
        history: [...job.history, {
          revision: revision + 1,
          eventType: 'Capture.FrameStored',
          from: 'CAPTURING',
          to: 'CAPTURING',
          occurredAtUtc: capturedAtUtc,
          rawAssetId,
        }].slice(-24),
      });
      const rawAssetSummary = cloneValue(rawAsset);
      delete rawAssetSummary.bytes;
      const result = { job: next, rawAsset: rawAssetSummary, eventType: 'Capture.FrameStored' };
      const applied = await repository.applyMutation({
        preconditions: [
          { collection: 'captureJobs', id, revision },
          { collection: 'rawAssets', id: rawAssetId, exists: false },
        ],
        immutableWrites: [{ collection: 'rawAssets', id: rawAssetId, value: rawAsset }],
        writes: [{ collection: 'captureJobs', id, value: next }],
        command,
        result,
      });
      return deepFreeze({ status: applied.status, ...applied.result });
    },

    async finalize({ jobId, expectedRevision, idempotencyKey = null } = {}) {
      const id = safeToken(jobId, 'CAPTURE_JOB_ID_REQUIRED');
      const revision = requireRevision(expectedRevision);
      const job = await repository.read('captureJobs', id);
      requireValue(job?.state === 'DRAINING', 'CAPTURE_FINALIZE_STATE_REJECTED');
      requireValue(job.revision === revision, 'MEDIA_REVISION_CONFLICT');
      for (const rawAssetId of job.rawAssetIds) {
        const asset = await repository.read('rawAssets', rawAssetId);
        requireValue(asset && asset.immutable, 'CAPTURE_RAW_ASSET_MISSING', { rawAssetId });
        requireValue(await observationMediaSha256(asset.bytes) === asset.contentDigest,
          'CAPTURE_RAW_IMMUTABILITY_CHECK_FAILED', { rawAssetId });
      }
      return transition({
        jobId: id,
        expectedRevision: revision,
        idempotencyKey: idempotencyKey || `finalize:${id}:${revision}`,
        allowed: ['DRAINING'],
        state: 'COMPLETED',
        eventType: 'Capture.Completed',
      });
    },

    abort(input) {
      return transition({
        ...input,
        allowed: ['QUEUED', 'PREPARING', 'CAPTURING', 'PAUSED', 'DRAINING'],
        state: 'ABORTED',
        eventType: 'Capture.Aborted',
      });
    },

    async load(jobId) {
      return repository.read('captureJobs', safeToken(jobId, 'CAPTURE_JOB_ID_REQUIRED'));
    },
  });
}

function validateAssessment(assessment, rawAssetIds) {
  requireValue(isObject(assessment) && rawAssetIds.includes(assessment.rawAssetId),
    'REVIEW_ASSESSMENT_ASSET_INVALID');
  const metrics = assessment.metrics;
  requireValue(isObject(metrics), 'REVIEW_METRICS_REQUIRED');
  ['sharpnessProxy', 'backgroundMedianProxy', 'saturationFraction'].forEach(field => {
    const value = metrics[field];
    requireValue(value === null || isFiniteNumber(value), 'REVIEW_METRIC_INVALID', { field });
  });
  if (metrics.saturationFraction !== null) {
    requireValue(metrics.saturationFraction >= 0 && metrics.saturationFraction <= 1,
      'REVIEW_SATURATION_RANGE_INVALID');
  }
  requireValue(Array.isArray(assessment.flags) && assessment.flags.length > 0
    && assessment.flags.every(flag => QUALITY_FLAGS.has(flag)), 'REVIEW_FLAGS_INVALID');
  return {
    rawAssetId: assessment.rawAssetId,
    metrics: cloneValue(metrics),
    flags: [...new Set(assessment.flags)].sort(),
    measurementSource: assessment.measurementSource === 'USER'
      ? 'USER' : 'DETERMINISTIC_LOCAL_PROXY',
    sampleCount: 1,
  };
}

async function normalizeRecipe(recipe) {
  requireValue(isObject(recipe) && recipe.schema === OBSERVATION_MEDIA_SCHEMAS.recipe
    && recipe.schemaVersion === 1 && recipe.operation === 'LINEAR_LEVELS_U8',
  'REVIEW_RECIPE_UNSUPPORTED');
  const blackPoint = recipe.parameters?.blackPoint;
  const whitePoint = recipe.parameters?.whitePoint;
  requireValue(Number.isInteger(blackPoint) && Number.isInteger(whitePoint)
    && blackPoint >= 0 && whitePoint <= 255 && whitePoint > blackPoint,
  'REVIEW_RECIPE_PARAMETERS_INVALID');
  requireValue(recipe.processor?.kind === 'DETERMINISTIC_LOCAL'
    && recipe.processor?.version === 'aetherus-linear-levels-u8-v1',
  'REVIEW_RECIPE_PROCESSOR_INVALID');
  requireValue(Array.isArray(recipe.calibrationAssetIds), 'REVIEW_CALIBRATION_LIST_REQUIRED');
  requireValue(recipe.calibrationAssetIds.length === 0, 'REVIEW_CALIBRATION_DECODER_NOT_IMPLEMENTED');
  const normalized = {
    schema: OBSERVATION_MEDIA_SCHEMAS.recipe,
    schemaVersion: 1,
    operation: 'LINEAR_LEVELS_U8',
    parameters: { blackPoint, whitePoint },
    processor: {
      kind: 'DETERMINISTIC_LOCAL',
      version: 'aetherus-linear-levels-u8-v1',
    },
    calibrationAssetIds: [],
    output: { mediaType: 'application/octet-stream', sampleEncoding: 'U8_BYTE_PLANE' },
    limitations: [
      'generic-u8-byte-plane-fixture-only',
      'not-a-fits-raw-jpeg-png-decoder',
      'not-photometric-calibration',
      'not-ai-processing',
    ],
  };
  return deepFreeze({
    ...normalized,
    recipeDigest: await observationMediaSha256(observationMediaCanonicalJson(normalized)),
  });
}

function applyLinearLevels(bytes, recipe) {
  const input = observationMediaBytes(bytes);
  const output = new Uint8Array(input.length);
  const { blackPoint, whitePoint } = recipe.parameters;
  const scale = 255 / (whitePoint - blackPoint);
  for (let index = 0; index < input.length; index += 1) {
    output[index] = Math.max(0, Math.min(255, Math.round((input[index] - blackPoint) * scale)));
  }
  return output;
}

function reviewTransition(review, allowed, state, occurredAtUtc, eventType, patch = {}) {
  requireValue(allowed.includes(review.state), 'REVIEW_TRANSITION_REJECTED', {
    from: review.state,
    to: state,
  });
  return deepFreeze({
    ...cloneValue(review),
    ...cloneValue(patch),
    state,
    revision: review.revision + 1,
    updatedAtUtc: occurredAtUtc,
    history: [...review.history, {
      revision: review.revision + 1,
      eventType,
      from: review.state,
      to: state,
      occurredAtUtc,
    }].slice(-24),
  });
}

export function createReviewProcessor({ repository, now = () => new Date(), idFactory = randomToken } = {}) {
  requireValue(repository?.read && repository?.applyMutation, 'REVIEW_REPOSITORY_REQUIRED');

  const saveTransition = async ({ review, next, idempotencyKey, eventType, payload }) => {
    const command = await commandDescriptor('review', idempotencyKey
      || `${eventType}:${review.reviewId}:${review.revision}`, payload);
    const result = { reviewSet: next, eventType };
    const applied = await repository.applyMutation({
      preconditions: [{ collection: 'reviewSets', id: review.reviewId, revision: review.revision }],
      writes: [{ collection: 'reviewSets', id: review.reviewId, value: next }],
      command,
      result,
    });
    return deepFreeze({ status: applied.status, ...applied.result });
  };

  return Object.freeze({
    async create({ reviewId = null, rawAssetIds, idempotencyKey = null } = {}) {
      requireValue(Array.isArray(rawAssetIds) && rawAssetIds.length > 0
        && new Set(rawAssetIds).size === rawAssetIds.length, 'REVIEW_RAW_ASSETS_REQUIRED');
      const assets = [];
      for (const rawAssetId of rawAssetIds) {
        const asset = await repository.read('rawAssets', rawAssetId);
        requireValue(asset?.assetKind === 'RAW_OBSERVATION' && asset.immutable,
          'REVIEW_RAW_ASSET_NOT_FOUND', { rawAssetId });
        requireValue(await observationMediaSha256(asset.bytes) === asset.contentDigest,
          'REVIEW_RAW_IMMUTABILITY_CHECK_FAILED', { rawAssetId });
        assets.push(asset);
      }
      const nonce = String(idFactory()).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      const id = safeToken(reviewId || `review_${nonce}`, 'REVIEW_ID_REQUIRED');
      const occurredAtUtc = normalizedUtc(now());
      const reviewSet = deepFreeze({
        schema: OBSERVATION_MEDIA_SCHEMAS.reviewSet,
        schemaVersion: 1,
        id,
        reviewId: id,
        state: 'UNREVIEWED',
        revision: 1,
        createdAtUtc: occurredAtUtc,
        updatedAtUtc: occurredAtUtc,
        sessionIds: [...new Set(assets.map(asset => asset.sessionId))].sort(),
        rawAssetIds: [...rawAssetIds],
        rawDigests: Object.fromEntries(assets.map(asset => [asset.assetId, asset.contentDigest])),
        assessments: [],
        selectedAssetIds: [],
        derivativeAssetIds: [],
        processingRecipe: null,
        userDecision: null,
        provenance: {
          rawClassification: 'observation',
          derivativeClassification: null,
          sourceDerivativeIdentityShared: false,
        },
        history: [{ revision: 1, eventType: 'Review.Created', from: null, to: 'UNREVIEWED', occurredAtUtc }],
        limitations: [
          'quality-metrics-are-proxies-not-scientific-photometry',
          'no-scientific-submission',
          'no-ai-processing',
        ],
      });
      const command = await commandDescriptor('review', idempotencyKey || `create:${id}`, {
        reviewId: id,
        rawDigests: reviewSet.rawDigests,
      });
      const result = { reviewSet, eventType: 'Review.Created' };
      const applied = await repository.applyMutation({
        preconditions: [{ collection: 'reviewSets', id, exists: false }],
        writes: [{ collection: 'reviewSets', id, value: reviewSet }],
        command,
        result,
      });
      return deepFreeze({ status: applied.status, ...applied.result });
    },

    async assess({ reviewId, expectedRevision, assessments, idempotencyKey = null } = {}) {
      const review = await repository.read('reviewSets', safeToken(reviewId, 'REVIEW_ID_REQUIRED'));
      requireValue(review && review.revision === requireRevision(expectedRevision), 'MEDIA_REVISION_CONFLICT');
      requireValue(Array.isArray(assessments) && assessments.length === review.rawAssetIds.length,
        'REVIEW_ASSESSMENTS_INCOMPLETE');
      const normalized = assessments.map(item => validateAssessment(item, review.rawAssetIds));
      requireValue(new Set(normalized.map(item => item.rawAssetId)).size === review.rawAssetIds.length,
        'REVIEW_ASSESSMENT_DUPLICATE');
      const occurredAtUtc = normalizedUtc(now());
      const next = reviewTransition(review, ['UNREVIEWED'], 'ASSESSED', occurredAtUtc,
        'Review.Assessed', { assessments: normalized });
      return saveTransition({
        review,
        next,
        idempotencyKey,
        eventType: 'Review.Assessed',
        payload: { reviewId: review.reviewId, expectedRevision, assessments: normalized },
      });
    },

    async select({ reviewId, expectedRevision, selectedAssetIds, reason = null,
      idempotencyKey = null } = {}) {
      const review = await repository.read('reviewSets', safeToken(reviewId, 'REVIEW_ID_REQUIRED'));
      requireValue(review && review.revision === requireRevision(expectedRevision), 'MEDIA_REVISION_CONFLICT');
      requireValue(Array.isArray(selectedAssetIds) && selectedAssetIds.length > 0
        && new Set(selectedAssetIds).size === selectedAssetIds.length
        && selectedAssetIds.every(id => review.rawAssetIds.includes(id)), 'REVIEW_SELECTION_INVALID');
      const occurredAtUtc = normalizedUtc(now());
      const next = reviewTransition(review, ['ASSESSED'], 'SELECTED', occurredAtUtc,
        'Review.Selected', {
          selectedAssetIds: [...selectedAssetIds],
          userDecision: { type: 'SELECTION', reason: isText(reason) ? reason.trim().slice(0, 240) : null },
        });
      return saveTransition({
        review,
        next,
        idempotencyKey,
        eventType: 'Review.Selected',
        payload: { reviewId: review.reviewId, expectedRevision, selectedAssetIds: [...selectedAssetIds] },
      });
    },

    async process({ reviewId, expectedRevision, recipe, idempotencyKey = null } = {}) {
      const review = await repository.read('reviewSets', safeToken(reviewId, 'REVIEW_ID_REQUIRED'));
      requireValue(review && review.revision === requireRevision(expectedRevision), 'MEDIA_REVISION_CONFLICT');
      requireValue(review.state === 'SELECTED', 'REVIEW_PROCESS_STATE_REJECTED');
      const normalizedRecipe = await normalizeRecipe(recipe);
      const derivatives = [];
      const rawPreconditions = [];
      for (const rawAssetId of review.selectedAssetIds) {
        const raw = await repository.read('rawAssets', rawAssetId);
        requireValue(raw, 'REVIEW_SOURCE_DELETED', { rawAssetId });
        requireValue(raw.contentDigest === review.rawDigests[rawAssetId]
          && await observationMediaSha256(raw.bytes) === raw.contentDigest,
        'REVIEW_RAW_IMMUTABILITY_CHECK_FAILED', { rawAssetId });
        const outputBytes = applyLinearLevels(raw.bytes, normalizedRecipe);
        const contentDigest = await observationMediaSha256(outputBytes);
        const derivativeId = safeToken(`derivative_${rawAssetId}_${normalizedRecipe.recipeDigest.slice(0, 16)}`,
          'REVIEW_DERIVATIVE_ID_INVALID', 240);
        derivatives.push(deepFreeze({
          schema: OBSERVATION_MEDIA_SCHEMAS.derivativeAsset,
          schemaVersion: 1,
          id: derivativeId,
          assetId: derivativeId,
          assetKind: 'PROCESSED_DERIVATIVE',
          immutable: true,
          sourceRawAssetId: rawAssetId,
          sourceRawDigest: raw.contentDigest,
          contentId: `sha256:${contentDigest}`,
          contentDigest,
          digestAlgorithm: 'SHA-256',
          byteLength: outputBytes.byteLength,
          bytes: outputBytes,
          mediaType: normalizedRecipe.output.mediaType,
          createdAtUtc: normalizedUtc(now()),
          recipe: normalizedRecipe,
          provenance: {
            classification: 'calculated',
            origin: 'DETERMINISTIC_USER_RAW_DERIVATIVE',
            sourceAssetId: rawAssetId,
            sourceAssetDigest: raw.contentDigest,
            recipeDigest: normalizedRecipe.recipeDigest,
            aiGenerated: false,
          },
          limitations: [...normalizedRecipe.limitations],
        }));
        rawPreconditions.push({ collection: 'rawAssets', id: rawAssetId, contentDigest: raw.contentDigest });
      }
      const occurredAtUtc = normalizedUtc(now());
      const next = reviewTransition(review, ['SELECTED'], 'PROCESSED', occurredAtUtc,
        'Processing.Completed', {
          derivativeAssetIds: derivatives.map(asset => asset.assetId),
          processingRecipe: normalizedRecipe,
          provenance: {
            rawClassification: 'observation',
            derivativeClassification: 'calculated',
            sourceDerivativeIdentityShared: false,
          },
        });
      const command = await commandDescriptor('review', idempotencyKey
        || `process:${review.reviewId}:${review.revision}`, {
        reviewId: review.reviewId,
        expectedRevision: review.revision,
        recipeDigest: normalizedRecipe.recipeDigest,
        rawDigests: review.selectedAssetIds.map(id => review.rawDigests[id]),
      });
      const result = {
        reviewSet: next,
        derivatives: derivatives.map(asset => ({ ...asset, bytes: undefined })),
        eventType: 'Processing.Completed',
      };
      const applied = await repository.applyMutation({
        preconditions: [
          { collection: 'reviewSets', id: review.reviewId, revision: review.revision },
          ...rawPreconditions,
        ],
        immutableWrites: derivatives.map(asset => ({
          collection: 'derivativeAssets', id: asset.assetId, value: asset,
        })),
        writes: [{ collection: 'reviewSets', id: review.reviewId, value: next }],
        command,
        result,
      });
      return deepFreeze({ status: applied.status, ...applied.result });
    },

    async approve({ reviewId, expectedRevision, confirmedByUser, idempotencyKey = null } = {}) {
      requireValue(confirmedByUser === true, 'REVIEW_USER_APPROVAL_REQUIRED');
      const review = await repository.read('reviewSets', safeToken(reviewId, 'REVIEW_ID_REQUIRED'));
      requireValue(review && review.revision === requireRevision(expectedRevision), 'MEDIA_REVISION_CONFLICT');
      const occurredAtUtc = normalizedUtc(now());
      const next = reviewTransition(review, ['PROCESSED'], 'APPROVED', occurredAtUtc,
        'Derivative.Approved', {
          userDecision: { type: 'APPROVAL', confirmedAtUtc: occurredAtUtc, actorType: 'USER' },
        });
      return saveTransition({
        review,
        next,
        idempotencyKey,
        eventType: 'Derivative.Approved',
        payload: { reviewId: review.reviewId, expectedRevision, confirmedByUser: true },
      });
    },

    async reject({ reviewId, expectedRevision, confirmedByUser, reason = null,
      idempotencyKey = null } = {}) {
      requireValue(confirmedByUser === true, 'REVIEW_USER_REJECTION_REQUIRED');
      const review = await repository.read('reviewSets', safeToken(reviewId, 'REVIEW_ID_REQUIRED'));
      requireValue(review && review.revision === requireRevision(expectedRevision), 'MEDIA_REVISION_CONFLICT');
      requireValue(!REVIEW_TERMINAL_STATES.has(review.state), 'REVIEW_ALREADY_TERMINAL');
      const occurredAtUtc = normalizedUtc(now());
      const next = reviewTransition(review, ['UNREVIEWED', 'ASSESSED', 'SELECTED', 'PROCESSED'],
        'REJECTED', occurredAtUtc, 'Review.Rejected', {
          userDecision: {
            type: 'REJECTION',
            confirmedAtUtc: occurredAtUtc,
            actorType: 'USER',
            reason: isText(reason) ? reason.trim().slice(0, 240) : null,
          },
        });
      return saveTransition({
        review,
        next,
        idempotencyKey,
        eventType: 'Review.Rejected',
        payload: { reviewId: review.reviewId, expectedRevision, confirmedByUser: true, reason },
      });
    },

    async reproduce(derivativeAssetId) {
      const derivative = await repository.read('derivativeAssets',
        safeToken(derivativeAssetId, 'REVIEW_DERIVATIVE_ID_REQUIRED', 240));
      requireValue(derivative, 'REVIEW_DERIVATIVE_NOT_FOUND');
      requireValue(await observationMediaSha256(derivative.bytes) === derivative.contentDigest,
        'REVIEW_DERIVATIVE_CHECKSUM_MISMATCH');
      const raw = await repository.read('rawAssets', derivative.sourceRawAssetId);
      requireValue(raw, 'REVIEW_SOURCE_DELETED');
      requireValue(await observationMediaSha256(raw.bytes) === derivative.sourceRawDigest,
        'REVIEW_RAW_IMMUTABILITY_CHECK_FAILED');
      const reproduced = applyLinearLevels(raw.bytes, derivative.recipe);
      const contentDigest = await observationMediaSha256(reproduced);
      requireValue(contentDigest === derivative.contentDigest, 'REVIEW_RECIPE_NOT_REPRODUCIBLE');
      return deepFreeze({
        status: 'VERIFIED',
        derivativeAssetId: derivative.assetId,
        sourceRawAssetId: raw.assetId,
        sourceRawDigest: raw.contentDigest,
        recipeDigest: derivative.recipe.recipeDigest,
        contentDigest,
        byteLength: reproduced.byteLength,
      });
    },

    load(reviewId) {
      return repository.read('reviewSets', safeToken(reviewId, 'REVIEW_ID_REQUIRED'));
    },
  });
}

export function createMemoryMultipartArchiveAdapter({ adapterId = 'memory-multipart-fixture-v1' } = {}) {
  const uploads = new Map();
  const objects = new Map();
  let interruptPart = null;
  let corruptCompletion = false;
  let failDeletion = false;

  return Object.freeze({
    adapterId,
    adapterKind: 'TEST_MEMORY_ONLY',
    productionApproved: false,
    async beginUpload({ uploadId, objectKey, contentDigest, byteLength, partSize }) {
      const existing = uploads.get(uploadId);
      if (existing) {
        requireValue(existing.objectKey === objectKey && existing.contentDigest === contentDigest
          && existing.byteLength === byteLength && existing.partSize === partSize,
        'ARCHIVE_ADAPTER_UPLOAD_CONFLICT');
        return { status: 'RESUMED', uploadedParts: [...existing.parts.keys()].sort((a, b) => a - b) };
      }
      uploads.set(uploadId, { uploadId, objectKey, contentDigest, byteLength, partSize, parts: new Map() });
      return { status: 'STARTED', uploadedParts: [] };
    },
    async putPart({ uploadId, partNumber, bytes, contentDigest }) {
      const upload = uploads.get(uploadId);
      requireValue(upload, 'ARCHIVE_ADAPTER_UPLOAD_NOT_FOUND');
      if (interruptPart === partNumber) {
        interruptPart = null;
        const error = new Error('ARCHIVE_TRANSPORT_INTERRUPTED');
        error.code = 'ARCHIVE_TRANSPORT_INTERRUPTED';
        throw error;
      }
      const partBytes = observationMediaBytes(bytes);
      const existing = upload.parts.get(partNumber);
      if (existing) {
        requireValue(existing.contentDigest === contentDigest, 'ARCHIVE_ADAPTER_PART_CONFLICT');
        return { status: 'DUPLICATE', contentDigest, byteLength: existing.bytes.byteLength };
      }
      upload.parts.set(partNumber, { bytes: partBytes, contentDigest });
      return { status: 'STORED', contentDigest, byteLength: partBytes.byteLength };
    },
    async completeUpload({ uploadId, partCount }) {
      const upload = uploads.get(uploadId);
      requireValue(upload && upload.parts.size === partCount, 'ARCHIVE_ADAPTER_PARTS_INCOMPLETE');
      const output = new Uint8Array(upload.byteLength);
      let offset = 0;
      for (let index = 0; index < partCount; index += 1) {
        const part = upload.parts.get(index);
        requireValue(part, 'ARCHIVE_ADAPTER_PARTS_INCOMPLETE');
        output.set(part.bytes, offset);
        offset += part.bytes.byteLength;
      }
      const actualDigest = await observationMediaSha256(output);
      const returnedDigest = corruptCompletion
        ? `${actualDigest.slice(0, -1)}${actualDigest.endsWith('0') ? '1' : '0'}`
        : actualDigest;
      corruptCompletion = false;
      objects.set(upload.objectKey, {
        objectKey: upload.objectKey,
        bytes: output,
        contentDigest: actualDigest,
      });
      uploads.delete(uploadId);
      return { objectKey: upload.objectKey, contentDigest: returnedDigest, byteLength: output.byteLength };
    },
    async readObject(objectKey) {
      const object = objects.get(objectKey);
      return object ? cloneValue(object) : null;
    },
    async deleteObject(objectKey) {
      if (failDeletion) {
        failDeletion = false;
        const error = new Error('ARCHIVE_DELETE_TRANSPORT_FAILED');
        error.code = 'ARCHIVE_DELETE_TRANSPORT_FAILED';
        throw error;
      }
      const existed = objects.delete(objectKey);
      return { status: existed ? 'DELETED' : 'MISSING_ALREADY' };
    },
    interruptOnceAtPart(partNumber) { interruptPart = partNumber; },
    corruptNextCompletion() { corruptCompletion = true; },
    failNextDeletion() { failDeletion = true; },
  });
}

function retentionPolicy(value) {
  requireValue(isObject(value) && ['KEEP_UNTIL_USER_DELETE', 'KEEP_UNTIL_UTC'].includes(value.mode),
    'ARCHIVE_RETENTION_POLICY_REQUIRED');
  if (value.mode === 'KEEP_UNTIL_UTC') requireValue(isUtc(value.untilUtc), 'ARCHIVE_RETENTION_UTC_REQUIRED');
  requireValue(value.legalHold === false || value.legalHold === true, 'ARCHIVE_LEGAL_HOLD_REQUIRED');
  return {
    mode: value.mode,
    untilUtc: value.mode === 'KEEP_UNTIL_UTC' ? normalizedUtc(value.untilUtc) : null,
    legalHold: value.legalHold,
  };
}

async function verifiedAsset(repository, collection, id, expectedKind) {
  const asset = await repository.read(collection, id);
  requireValue(asset?.assetKind === expectedKind, 'ARCHIVE_ASSET_NOT_FOUND', { collection, id });
  requireValue(await observationMediaSha256(asset.bytes) === asset.contentDigest,
    'ARCHIVE_ASSET_CHECKSUM_MISMATCH', { id });
  return asset;
}

async function saveUploadCheckpoint(repository, previous, next) {
  const exists = !!previous;
  return repository.applyMutation({
    preconditions: [{
      collection: 'uploadCheckpoints',
      id: next.id,
      ...(exists ? { revision: previous.revision } : { exists: false }),
    }],
    writes: [{ collection: 'uploadCheckpoints', id: next.id, value: next }],
    result: { checkpoint: next },
  });
}

export function createObservationArchive({ repository, now = () => new Date(), idFactory = randomToken } = {}) {
  requireValue(repository?.read && repository?.applyMutation, 'ARCHIVE_REPOSITORY_REQUIRED');

  return Object.freeze({
    async stage({ archiveId = null, rawAssetId, derivativeAssetIds = [], retention,
      idempotencyKey = null } = {}) {
      const raw = await verifiedAsset(repository, 'rawAssets', rawAssetId, 'RAW_OBSERVATION');
      requireValue(Array.isArray(derivativeAssetIds)
        && new Set(derivativeAssetIds).size === derivativeAssetIds.length,
      'ARCHIVE_DERIVATIVE_LIST_INVALID');
      for (const derivativeAssetId of derivativeAssetIds) {
        const derivative = await verifiedAsset(repository, 'derivativeAssets', derivativeAssetId,
          'PROCESSED_DERIVATIVE');
        requireValue(derivative.sourceRawAssetId === rawAssetId, 'ARCHIVE_DERIVATIVE_SOURCE_MISMATCH');
      }
      const nonce = String(idFactory()).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      const id = safeToken(archiveId || `archive_${nonce}`, 'ARCHIVE_ID_REQUIRED');
      const occurredAtUtc = normalizedUtc(now());
      const archiveObject = deepFreeze({
        schema: OBSERVATION_MEDIA_SCHEMAS.archiveObject,
        schemaVersion: 1,
        id,
        archiveId: id,
        state: 'STAGING',
        revision: 1,
        createdAtUtc: occurredAtUtc,
        updatedAtUtc: occurredAtUtc,
        rawAssetId,
        rawDigest: raw.contentDigest,
        rawByteLength: raw.byteLength,
        derivativeAssetIds: [...derivativeAssetIds],
        retention: retentionPolicy(retention),
        replicas: [],
        cache: { status: 'NOT_CONFIGURED', entries: [] },
        exportIds: [],
        lastDeletionReceiptId: null,
        history: [{ revision: 1, eventType: 'Archive.Staged', from: null, to: 'STAGING', occurredAtUtc }],
        limitations: [
          'local-raw-first',
          'no-production-cloud-adapter',
          'no-provider-durability-claim',
          'no-automatic-local-original-deletion',
        ],
      });
      const command = await commandDescriptor('archive', idempotencyKey || `stage:${id}`, {
        archiveId: id,
        rawAssetId,
        rawDigest: raw.contentDigest,
        derivativeAssetIds,
        retention: archiveObject.retention,
      });
      const result = { archiveObject, eventType: 'Archive.Staged' };
      const applied = await repository.applyMutation({
        preconditions: [
          { collection: 'archiveObjects', id, exists: false },
          { collection: 'rawAssets', id: rawAssetId, contentDigest: raw.contentDigest },
        ],
        writes: [{ collection: 'archiveObjects', id, value: archiveObject }],
        command,
        result,
      });
      return deepFreeze({ status: applied.status, ...applied.result });
    },

    async commitLocal({ archiveId, expectedRevision, idempotencyKey = null } = {}) {
      const id = safeToken(archiveId, 'ARCHIVE_ID_REQUIRED');
      const archiveObject = await repository.read('archiveObjects', id);
      const revision = requireRevision(expectedRevision);
      requireValue(archiveObject && archiveObject.revision === revision, 'MEDIA_REVISION_CONFLICT');
      requireValue(archiveObject.state === 'STAGING', 'ARCHIVE_LOCAL_COMMIT_STATE_REJECTED');
      const raw = await verifiedAsset(repository, 'rawAssets', archiveObject.rawAssetId, 'RAW_OBSERVATION');
      requireValue(raw.contentDigest === archiveObject.rawDigest, 'ARCHIVE_RAW_DIGEST_CHANGED');
      const occurredAtUtc = normalizedUtc(now());
      const localReplica = {
        replicaId: `local:${id}`,
        adapterId: repository.kind,
        kind: 'LOCAL',
        objectKey: raw.assetId,
        state: 'VERIFIED',
        contentDigest: raw.contentDigest,
        byteLength: raw.byteLength,
        verifiedAtUtc: occurredAtUtc,
        backup: { status: 'NOT_CONFIGURED', expiresAtUtc: null },
      };
      const next = deepFreeze({
        ...cloneValue(archiveObject),
        state: 'HOT',
        revision: revision + 1,
        updatedAtUtc: occurredAtUtc,
        replicas: [localReplica],
        history: [...archiveObject.history, {
          revision: revision + 1,
          eventType: 'Archive.Stored',
          from: 'STAGING',
          to: 'HOT',
          occurredAtUtc,
        }].slice(-24),
      });
      const command = await commandDescriptor('archive', idempotencyKey || `commit-local:${id}:${revision}`, {
        archiveId: id,
        expectedRevision: revision,
        rawDigest: raw.contentDigest,
      });
      const result = { archiveObject: next, eventType: 'Archive.Stored' };
      const applied = await repository.applyMutation({
        preconditions: [
          { collection: 'archiveObjects', id, revision },
          { collection: 'rawAssets', id: raw.assetId, contentDigest: raw.contentDigest },
        ],
        writes: [{ collection: 'archiveObjects', id, value: next }],
        command,
        result,
      });
      return deepFreeze({ status: applied.status, ...applied.result });
    },

    async uploadReplica({ archiveId, adapter, explicitUserConsent, partSize = 1024 * 1024 } = {}) {
      requireValue(explicitUserConsent === true, 'ARCHIVE_UPLOAD_CONSENT_REQUIRED');
      requireValue(adapter?.adapterId && adapter?.beginUpload && adapter?.putPart
        && adapter?.completeUpload, 'ARCHIVE_UPLOAD_ADAPTER_REQUIRED');
      requireValue(Number.isInteger(partSize) && partSize > 0, 'ARCHIVE_PART_SIZE_INVALID');
      const id = safeToken(archiveId, 'ARCHIVE_ID_REQUIRED');
      let archiveObject = await repository.read('archiveObjects', id);
      requireValue(archiveObject && ['HOT', 'WARM', 'COLD'].includes(archiveObject.state),
        'ARCHIVE_UPLOAD_STATE_REJECTED');
      requireValue(!archiveObject.replicas.some(replica => replica.adapterId === adapter.adapterId
        && replica.state === 'VERIFIED'), 'ARCHIVE_REPLICA_ALREADY_VERIFIED');
      const raw = await verifiedAsset(repository, 'rawAssets', archiveObject.rawAssetId, 'RAW_OBSERVATION');
      requireValue(raw.contentDigest === archiveObject.rawDigest, 'ARCHIVE_RAW_DIGEST_CHANGED');
      const checkpointId = safeToken(`upload:${id}:${adapter.adapterId}`,
        'ARCHIVE_UPLOAD_CHECKPOINT_ID_INVALID', 240);
      let checkpoint = await repository.read('uploadCheckpoints', checkpointId);
      if (checkpoint) {
        requireValue(checkpoint.contentDigest === raw.contentDigest
          && checkpoint.partSize === partSize, 'ARCHIVE_UPLOAD_CHECKPOINT_CONFLICT');
        requireValue(['PAUSED', 'UPLOADING'].includes(checkpoint.state),
          'ARCHIVE_UPLOAD_CHECKPOINT_TERMINAL');
      } else {
        const occurredAtUtc = normalizedUtc(now());
        checkpoint = deepFreeze({
          schema: OBSERVATION_MEDIA_SCHEMAS.uploadCheckpoint,
          schemaVersion: 1,
          id: checkpointId,
          uploadId: checkpointId,
          archiveId: id,
          adapterId: adapter.adapterId,
          objectKey: `observations/${id}/${raw.assetId}`,
          contentDigest: raw.contentDigest,
          byteLength: raw.byteLength,
          partSize,
          partCount: Math.ceil(raw.byteLength / partSize),
          uploadedParts: [],
          state: 'UPLOADING',
          revision: 1,
          createdAtUtc: occurredAtUtc,
          updatedAtUtc: occurredAtUtc,
          attempts: 1,
          lastError: null,
        });
        await saveUploadCheckpoint(repository, null, checkpoint);
      }
      await adapter.beginUpload({
        uploadId: checkpoint.uploadId,
        objectKey: checkpoint.objectKey,
        contentDigest: checkpoint.contentDigest,
        byteLength: checkpoint.byteLength,
        partSize: checkpoint.partSize,
      });
      const uploaded = new Set(checkpoint.uploadedParts);
      for (let partNumber = 0; partNumber < checkpoint.partCount; partNumber += 1) {
        if (uploaded.has(partNumber)) continue;
        const start = partNumber * checkpoint.partSize;
        const end = Math.min(raw.byteLength, start + checkpoint.partSize);
        const partBytes = raw.bytes.slice(start, end);
        const partDigest = await observationMediaSha256(partBytes);
        try {
          const part = await adapter.putPart({
            uploadId: checkpoint.uploadId,
            partNumber,
            bytes: partBytes,
            contentDigest: partDigest,
          });
          requireValue(part.contentDigest === partDigest && part.byteLength === partBytes.byteLength,
            'ARCHIVE_UPLOAD_PART_VERIFICATION_FAILED', { partNumber });
        } catch (error) {
          const pausedAtUtc = normalizedUtc(now());
          const paused = deepFreeze({
            ...cloneValue(checkpoint),
            state: 'PAUSED',
            revision: checkpoint.revision + 1,
            updatedAtUtc: pausedAtUtc,
            lastError: String(error?.code || error?.message || 'ARCHIVE_UPLOAD_INTERRUPTED'),
          });
          await saveUploadCheckpoint(repository, checkpoint, paused);
          return deepFreeze({
            status: 'PAUSED',
            reason: paused.lastError,
            checkpoint: paused,
            automaticRetryCount: 0,
          });
        }
        const updatedAtUtc = normalizedUtc(now());
        const nextCheckpoint = deepFreeze({
          ...cloneValue(checkpoint),
          state: 'UPLOADING',
          revision: checkpoint.revision + 1,
          updatedAtUtc,
          uploadedParts: [...uploaded, partNumber].sort((a, b) => a - b),
          lastError: null,
        });
        await saveUploadCheckpoint(repository, checkpoint, nextCheckpoint);
        checkpoint = nextCheckpoint;
        uploaded.add(partNumber);
      }
      const completed = await adapter.completeUpload({
        uploadId: checkpoint.uploadId,
        partCount: checkpoint.partCount,
      });
      if (completed.contentDigest !== raw.contentDigest || completed.byteLength !== raw.byteLength) {
        const blockedAtUtc = normalizedUtc(now());
        const blocked = deepFreeze({
          ...cloneValue(checkpoint),
          state: 'BLOCKED',
          revision: checkpoint.revision + 1,
          updatedAtUtc: blockedAtUtc,
          lastError: 'ARCHIVE_UPLOAD_FINAL_CHECKSUM_MISMATCH',
        });
        await saveUploadCheckpoint(repository, checkpoint, blocked);
        fail('ARCHIVE_UPLOAD_FINAL_CHECKSUM_MISMATCH', { archiveId: id });
      }
      archiveObject = await repository.read('archiveObjects', id);
      const verifiedAtUtc = normalizedUtc(now());
      const remoteReplica = {
        replicaId: `remote:${adapter.adapterId}:${id}`,
        adapterId: adapter.adapterId,
        adapterKind: adapter.adapterKind || 'UNKNOWN',
        productionApproved: adapter.productionApproved === true,
        kind: 'REMOTE',
        objectKey: completed.objectKey,
        state: 'VERIFIED',
        contentDigest: raw.contentDigest,
        byteLength: raw.byteLength,
        verifiedAtUtc,
        backup: { status: 'NOT_CONFIGURED', expiresAtUtc: null },
      };
      const nextArchive = deepFreeze({
        ...cloneValue(archiveObject),
        revision: archiveObject.revision + 1,
        updatedAtUtc: verifiedAtUtc,
        replicas: [...archiveObject.replicas, remoteReplica],
        history: [...archiveObject.history, {
          revision: archiveObject.revision + 1,
          eventType: 'Replica.Verified',
          from: archiveObject.state,
          to: archiveObject.state,
          occurredAtUtc: verifiedAtUtc,
          replicaId: remoteReplica.replicaId,
        }].slice(-24),
      });
      const verifiedCheckpoint = deepFreeze({
        ...cloneValue(checkpoint),
        state: 'VERIFIED',
        revision: checkpoint.revision + 1,
        updatedAtUtc: verifiedAtUtc,
        lastError: null,
      });
      await repository.applyMutation({
        preconditions: [
          { collection: 'archiveObjects', id, revision: archiveObject.revision },
          { collection: 'uploadCheckpoints', id: checkpoint.id, revision: checkpoint.revision },
          { collection: 'rawAssets', id: raw.assetId, contentDigest: raw.contentDigest },
        ],
        writes: [
          { collection: 'archiveObjects', id, value: nextArchive },
          { collection: 'uploadCheckpoints', id: verifiedCheckpoint.id, value: verifiedCheckpoint },
        ],
        result: { archiveObject: nextArchive, checkpoint: verifiedCheckpoint },
      });
      return deepFreeze({
        status: 'VERIFIED',
        archiveObject: nextArchive,
        checkpoint: verifiedCheckpoint,
        automaticRetryCount: 0,
      });
    },

    async exportPackage({ archiveIds, exportId = null } = {}) {
      requireValue(Array.isArray(archiveIds) && archiveIds.length > 0
        && new Set(archiveIds).size === archiveIds.length, 'ARCHIVE_EXPORT_IDS_REQUIRED');
      const archives = [];
      const assetMap = new Map();
      for (const archiveId of [...archiveIds].sort()) {
        const archiveObject = await repository.read('archiveObjects', archiveId);
        requireValue(archiveObject && !['DELETED', 'DELETING'].includes(archiveObject.state),
          'ARCHIVE_EXPORT_OBJECT_UNAVAILABLE', { archiveId });
        archives.push(archiveObject);
        const raw = await verifiedAsset(repository, 'rawAssets', archiveObject.rawAssetId, 'RAW_OBSERVATION');
        assetMap.set(raw.assetId, raw);
        for (const derivativeAssetId of archiveObject.derivativeAssetIds) {
          const derivative = await verifiedAsset(repository, 'derivativeAssets', derivativeAssetId,
            'PROCESSED_DERIVATIVE');
          assetMap.set(derivative.assetId, derivative);
        }
      }
      const nonce = String(idFactory()).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      const id = safeToken(exportId || `export_${nonce}`, 'ARCHIVE_EXPORT_ID_REQUIRED');
      const exportedAtUtc = normalizedUtc(now());
      const assets = [...assetMap.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
      const manifestCore = {
        schema: OBSERVATION_MEDIA_SCHEMAS.exportManifest,
        schemaVersion: 1,
        exportId: id,
        exportedAtUtc,
        archiveObjects: archives.map(object => ({
          archiveId: object.archiveId,
          stateAtExport: object.state,
          rawAssetId: object.rawAssetId,
          rawDigest: object.rawDigest,
          derivativeAssetIds: [...object.derivativeAssetIds],
          retention: cloneValue(object.retention),
          replicaCount: object.replicas.filter(replica => replica.state === 'VERIFIED').length,
        })),
        assets: assets.map(asset => ({
          assetId: asset.assetId,
          assetKind: asset.assetKind,
          mediaType: asset.mediaType,
          byteLength: asset.byteLength,
          contentDigest: asset.contentDigest,
          digestAlgorithm: 'SHA-256',
          provenance: cloneValue(asset.provenance),
          sourceRawAssetId: asset.sourceRawAssetId || null,
          recipeDigest: asset.recipe?.recipeDigest || null,
        })),
        deletionReceiptsIncluded: [],
        privacy: {
          originalFilenamesIncluded: false,
          filePathsIncluded: false,
          exifLocationsIncluded: false,
        },
        limitations: [
          'json-envelope-first-slice-not-zip',
          'user-must-store-package-and-manifest-digest-together',
        ],
      };
      const manifestDigest = await observationMediaSha256(observationMediaCanonicalJson(manifestCore));
      const manifest = deepFreeze({ ...manifestCore, manifestDigest, digestAlgorithm: 'SHA-256' });
      const envelope = {
        schema: OBSERVATION_MEDIA_SCHEMAS.exportPackage,
        schemaVersion: 1,
        manifest,
        payloads: Object.fromEntries(assets.map(asset => [asset.assetId, encodeBase64(asset.bytes)])),
      };
      const packageBytes = utf8Bytes(observationMediaCanonicalJson(envelope));
      const packageDigest = await observationMediaSha256(packageBytes);
      const record = deepFreeze({
        id,
        exportId: id,
        createdAtUtc: exportedAtUtc,
        archiveIds: [...archiveIds].sort(),
        manifestDigest,
        packageDigest,
        byteLength: packageBytes.byteLength,
      });
      await repository.applyMutation({
        preconditions: [{ collection: 'exportRecords', id, exists: false }],
        writes: [{ collection: 'exportRecords', id, value: record }],
        result: { record },
      });
      return deepFreeze({
        schema: OBSERVATION_MEDIA_SCHEMAS.exportPackage,
        status: 'READY',
        exportId: id,
        manifest,
        manifestDigest,
        packageDigest,
        byteLength: packageBytes.byteLength,
        packageBytes,
      });
    },

    async delete({ archiveId, receiptId = null, explicitUserConfirmation,
      adapters = {} } = {}) {
      requireValue(explicitUserConfirmation === true, 'ARCHIVE_DELETE_CONFIRMATION_REQUIRED');
      const id = safeToken(archiveId, 'ARCHIVE_ID_REQUIRED');
      let archiveObject = await repository.read('archiveObjects', id);
      requireValue(archiveObject, 'ARCHIVE_OBJECT_NOT_FOUND');
      const nonce = String(idFactory()).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      const deletionReceiptId = safeToken(receiptId || `delete_${id}_${nonce}`,
        'ARCHIVE_DELETE_RECEIPT_ID_REQUIRED', 240);
      const existingReceipt = await repository.read('deletionReceipts', deletionReceiptId);
      if (existingReceipt) return deepFreeze({ status: 'DUPLICATE', receipt: existingReceipt });
      const requestedAtUtc = normalizedUtc(now());
      const linkedDerivativeIds = (await repository.list('derivativeAssets'))
        .filter(asset => asset.sourceRawAssetId === archiveObject.rawAssetId)
        .map(asset => asset.assetId);
      const deletionDerivativeIds = [...new Set([
        ...archiveObject.derivativeAssetIds,
        ...linkedDerivativeIds,
      ])].sort();
      if (archiveObject.retention.legalHold) {
        const blockedCore = {
          schema: OBSERVATION_MEDIA_SCHEMAS.deletionReceipt,
          schemaVersion: 1,
          id: deletionReceiptId,
          receiptId: deletionReceiptId,
          archiveId: id,
          status: 'BLOCKED_BY_LEGAL_HOLD',
          requestedAtUtc,
          completedAtUtc: null,
          rawAsset: { assetId: archiveObject.rawAssetId, contentDigest: archiveObject.rawDigest, status: 'PRESERVED' },
          derivatives: deletionDerivativeIds.map(assetId => ({ assetId, status: 'PRESERVED' })),
          replicas: archiveObject.replicas.map(replica => ({ replicaId: replica.replicaId, status: 'PRESERVED' })),
          cache: { status: archiveObject.cache.status },
          backups: archiveObject.replicas.map(replica => cloneValue(replica.backup)),
          reason: 'LEGAL_HOLD',
        };
        const receiptDigest = await observationMediaSha256(observationMediaCanonicalJson(blockedCore));
        const receipt = deepFreeze({ ...blockedCore, receiptDigest, digestAlgorithm: 'SHA-256' });
        await repository.applyMutation({
          preconditions: [
            { collection: 'archiveObjects', id, revision: archiveObject.revision },
            { collection: 'deletionReceipts', id: deletionReceiptId, exists: false },
          ],
          writes: [{ collection: 'deletionReceipts', id: deletionReceiptId, value: receipt }],
          result: { receipt },
        });
        return deepFreeze({ status: receipt.status, receipt });
      }
      const nowMs = Date.parse(requestedAtUtc);
      const backupBlocked = archiveObject.replicas.some(replica => {
        if (replica.backup?.status === 'NOT_CONFIGURED' || replica.backup?.status === 'EXPIRED') return false;
        if (replica.backup?.status === 'EXPIRES_AT' && isUtc(replica.backup.expiresAtUtc)) {
          return Date.parse(replica.backup.expiresAtUtc) > nowMs;
        }
        return true;
      });
      const remoteReplicas = archiveObject.replicas.filter(replica => replica.kind === 'REMOTE'
        && replica.state === 'VERIFIED');
      const missingAdapters = remoteReplicas.filter(replica => !adapters[replica.adapterId]);
      if (backupBlocked || missingAdapters.length) {
        const blockedCore = {
          schema: OBSERVATION_MEDIA_SCHEMAS.deletionReceipt,
          schemaVersion: 1,
          id: deletionReceiptId,
          receiptId: deletionReceiptId,
          archiveId: id,
          status: backupBlocked ? 'PENDING_BACKUP_EXPIRY' : 'BLOCKED_ADAPTER_REQUIRED',
          requestedAtUtc,
          completedAtUtc: null,
          rawAsset: { assetId: archiveObject.rawAssetId, contentDigest: archiveObject.rawDigest, status: 'PRESERVED' },
          derivatives: deletionDerivativeIds.map(assetId => ({ assetId, status: 'PRESERVED' })),
          replicas: archiveObject.replicas.map(replica => ({
            replicaId: replica.replicaId,
            status: replica.kind === 'REMOTE' && !adapters[replica.adapterId] ? 'ADAPTER_REQUIRED' : 'PRESERVED',
          })),
          cache: { status: archiveObject.cache.status },
          backups: archiveObject.replicas.map(replica => cloneValue(replica.backup)),
          reason: backupBlocked ? 'BACKUP_NOT_EXPIRED_OR_UNKNOWN' : 'REMOTE_DELETE_ADAPTER_MISSING',
        };
        const receiptDigest = await observationMediaSha256(observationMediaCanonicalJson(blockedCore));
        const receipt = deepFreeze({ ...blockedCore, receiptDigest, digestAlgorithm: 'SHA-256' });
        await repository.applyMutation({
          preconditions: [
            { collection: 'archiveObjects', id, revision: archiveObject.revision },
            { collection: 'deletionReceipts', id: deletionReceiptId, exists: false },
          ],
          writes: [{ collection: 'deletionReceipts', id: deletionReceiptId, value: receipt }],
          result: { receipt },
        });
        return deepFreeze({ status: receipt.status, receipt });
      }
      const deletingAtUtc = normalizedUtc(now());
      const deleting = deepFreeze({
        ...cloneValue(archiveObject),
        state: 'DELETING',
        revision: archiveObject.revision + 1,
        updatedAtUtc: deletingAtUtc,
        history: [...archiveObject.history, {
          revision: archiveObject.revision + 1,
          eventType: 'Deletion.Started',
          from: archiveObject.state,
          to: 'DELETING',
          occurredAtUtc: deletingAtUtc,
        }].slice(-24),
      });
      await repository.applyMutation({
        preconditions: [{ collection: 'archiveObjects', id, revision: archiveObject.revision }],
        writes: [{ collection: 'archiveObjects', id, value: deleting }],
        result: { archiveObject: deleting },
      });
      archiveObject = deleting;
      const replicaResults = archiveObject.replicas.map(replica => ({
        replicaId: replica.replicaId,
        adapterId: replica.adapterId,
        kind: replica.kind,
        objectKey: replica.objectKey,
        contentDigest: replica.contentDigest,
        status: replica.kind === 'LOCAL' ? 'PENDING_LOCAL_DELETE' : 'PENDING_REMOTE_DELETE',
      }));
      try {
        for (const result of replicaResults.filter(item => item.kind === 'REMOTE')) {
          const deletion = await adapters[result.adapterId].deleteObject(result.objectKey);
          result.status = deletion.status;
        }
      } catch (error) {
        const failedCore = {
          schema: OBSERVATION_MEDIA_SCHEMAS.deletionReceipt,
          schemaVersion: 1,
          id: deletionReceiptId,
          receiptId: deletionReceiptId,
          archiveId: id,
          status: 'INCOMPLETE_REMOTE_DELETE',
          requestedAtUtc,
          completedAtUtc: null,
          rawAsset: { assetId: archiveObject.rawAssetId, contentDigest: archiveObject.rawDigest, status: 'PRESERVED' },
          derivatives: deletionDerivativeIds.map(assetId => ({ assetId, status: 'PRESERVED' })),
          replicas: replicaResults,
          cache: { status: archiveObject.cache.status },
          backups: archiveObject.replicas.map(replica => cloneValue(replica.backup)),
          reason: String(error?.code || error?.message || 'REMOTE_DELETE_FAILED'),
        };
        const receiptDigest = await observationMediaSha256(observationMediaCanonicalJson(failedCore));
        const receipt = deepFreeze({ ...failedCore, receiptDigest, digestAlgorithm: 'SHA-256' });
        await repository.applyMutation({
          preconditions: [{ collection: 'deletionReceipts', id: deletionReceiptId, exists: false }],
          writes: [{ collection: 'deletionReceipts', id: deletionReceiptId, value: receipt }],
          result: { receipt },
        });
        return deepFreeze({ status: receipt.status, receipt });
      }
      const raw = await repository.read('rawAssets', archiveObject.rawAssetId);
      requireValue(raw && raw.contentDigest === archiveObject.rawDigest, 'ARCHIVE_RAW_DIGEST_CHANGED');
      const derivatives = [];
      for (const derivativeAssetId of deletionDerivativeIds) {
        const derivative = await repository.read('derivativeAssets', derivativeAssetId);
        if (derivative) derivatives.push(derivative);
      }
      const relatedReviews = (await repository.list('reviewSets')).filter(review =>
        review.rawAssetIds.includes(archiveObject.rawAssetId));
      const completedAtUtc = normalizedUtc(now());
      const completedCore = {
        schema: OBSERVATION_MEDIA_SCHEMAS.deletionReceipt,
        schemaVersion: 1,
        id: deletionReceiptId,
        receiptId: deletionReceiptId,
        archiveId: id,
        status: 'COMPLETED',
        requestedAtUtc,
        completedAtUtc,
        rawAsset: { assetId: raw.assetId, contentDigest: raw.contentDigest, status: 'DELETED' },
        derivatives: deletionDerivativeIds.map(assetId => ({
          assetId,
          contentDigest: derivatives.find(asset => asset.assetId === assetId)?.contentDigest || null,
          status: 'DELETED_OR_ALREADY_MISSING',
        })),
        replicas: replicaResults.map(result => ({
          ...result,
          status: result.kind === 'LOCAL' ? 'DELETED' : result.status,
        })),
        cache: { status: archiveObject.cache.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'CLEARED' },
        backups: archiveObject.replicas.map(replica => cloneValue(replica.backup)),
        reviewRecords: relatedReviews.map(review => ({ reviewId: review.reviewId, status: 'SOURCE_DELETED' })),
        reason: null,
      };
      const receiptDigest = await observationMediaSha256(observationMediaCanonicalJson(completedCore));
      const receipt = deepFreeze({ ...completedCore, receiptDigest, digestAlgorithm: 'SHA-256' });
      const deletedArchive = deepFreeze({
        ...cloneValue(archiveObject),
        state: 'DELETED',
        revision: archiveObject.revision + 1,
        updatedAtUtc: completedAtUtc,
        replicas: archiveObject.replicas.map(replica => ({ ...replica, state: 'DELETED' })),
        cache: { status: 'CLEARED', entries: [] },
        lastDeletionReceiptId: deletionReceiptId,
        history: [...archiveObject.history, {
          revision: archiveObject.revision + 1,
          eventType: 'Deletion.Completed',
          from: 'DELETING',
          to: 'DELETED',
          occurredAtUtc: completedAtUtc,
        }].slice(-24),
      });
      const reviewWrites = relatedReviews.map(review => ({
        collection: 'reviewSets',
        id: review.reviewId,
        value: deepFreeze({
          ...cloneValue(review),
          state: 'SOURCE_DELETED',
          revision: review.revision + 1,
          updatedAtUtc: completedAtUtc,
          derivativeAssetIds: [],
          history: [...review.history, {
            revision: review.revision + 1,
            eventType: 'Review.SourceDeleted',
            from: review.state,
            to: 'SOURCE_DELETED',
            occurredAtUtc: completedAtUtc,
          }].slice(-24),
        }),
      }));
      await repository.applyMutation({
        preconditions: [
          { collection: 'archiveObjects', id, revision: archiveObject.revision },
          { collection: 'rawAssets', id: raw.assetId, contentDigest: raw.contentDigest },
          ...derivatives.map(asset => ({
            collection: 'derivativeAssets', id: asset.assetId, contentDigest: asset.contentDigest,
          })),
          ...relatedReviews.map(review => ({
            collection: 'reviewSets', id: review.reviewId, revision: review.revision,
          })),
          { collection: 'deletionReceipts', id: deletionReceiptId, exists: false },
        ],
        writes: [
          { collection: 'archiveObjects', id, value: deletedArchive },
          { collection: 'deletionReceipts', id: deletionReceiptId, value: receipt },
          ...reviewWrites,
        ],
        deletes: [
          { collection: 'rawAssets', id: raw.assetId },
          ...derivatives.map(asset => ({ collection: 'derivativeAssets', id: asset.assetId })),
        ],
        result: { archiveObject: deletedArchive, receipt },
      });
      return deepFreeze({ status: 'COMPLETED', archiveObject: deletedArchive, receipt });
    },

    load(archiveId) {
      return repository.read('archiveObjects', safeToken(archiveId, 'ARCHIVE_ID_REQUIRED'));
    },
  });
}

export async function verifyObservationArchiveExport(packageBytes) {
  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(observationMediaBytes(packageBytes)));
  } catch (error) {
    fail('ARCHIVE_EXPORT_PARSE_FAILED', {}, error);
  }
  requireValue(envelope?.schema === OBSERVATION_MEDIA_SCHEMAS.exportPackage
    && envelope.schemaVersion === 1 && isObject(envelope.manifest)
    && isObject(envelope.payloads), 'ARCHIVE_EXPORT_SCHEMA_INVALID');
  const { manifestDigest, digestAlgorithm, ...manifestCore } = envelope.manifest;
  requireValue(digestAlgorithm === 'SHA-256'
    && await observationMediaSha256(observationMediaCanonicalJson(manifestCore)) === manifestDigest,
  'ARCHIVE_EXPORT_MANIFEST_CHECKSUM_MISMATCH');
  requireValue(Array.isArray(envelope.manifest.assets), 'ARCHIVE_EXPORT_ASSET_LIST_INVALID');
  for (const asset of envelope.manifest.assets) {
    const payload = decodeBase64(envelope.payloads[asset.assetId]);
    requireValue(payload.byteLength === asset.byteLength
      && await observationMediaSha256(payload) === asset.contentDigest,
    'ARCHIVE_EXPORT_ASSET_CHECKSUM_MISMATCH', { assetId: asset.assetId });
  }
  const packageDigest = await observationMediaSha256(observationMediaBytes(packageBytes));
  return deepFreeze({
    status: 'VERIFIED',
    exportId: envelope.manifest.exportId,
    manifestDigest,
    packageDigest,
    assetCount: envelope.manifest.assets.length,
    byteLength: observationMediaBytes(packageBytes).byteLength,
  });
}

export async function verifyObservationDeletionReceipt(receipt) {
  requireValue(receipt?.schema === OBSERVATION_MEDIA_SCHEMAS.deletionReceipt
    && receipt.digestAlgorithm === 'SHA-256' && isText(receipt.receiptDigest),
  'ARCHIVE_DELETE_RECEIPT_SCHEMA_INVALID');
  const { receiptDigest, digestAlgorithm, ...core } = receipt;
  requireValue(await observationMediaSha256(observationMediaCanonicalJson(core)) === receiptDigest,
    'ARCHIVE_DELETE_RECEIPT_CHECKSUM_MISMATCH');
  if (receipt.status === 'COMPLETED') {
    requireValue(receipt.completedAtUtc && receipt.rawAsset.status === 'DELETED'
      && receipt.replicas.every(replica => ['DELETED', 'MISSING_ALREADY'].includes(replica.status))
      && receipt.backups.every(backup => backup.status === 'NOT_CONFIGURED'
        || backup.status === 'EXPIRED'
        || (backup.status === 'EXPIRES_AT' && isUtc(backup.expiresAtUtc)
          && Date.parse(backup.expiresAtUtc) <= Date.parse(receipt.completedAtUtc))),
    'ARCHIVE_DELETE_RECEIPT_INCOMPLETE');
  }
  return deepFreeze({
    status: 'VERIFIED',
    receiptId: receipt.receiptId,
    deletionStatus: receipt.status,
    receiptDigest,
  });
}

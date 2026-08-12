// Aetherus Local Observation Session — PR-05
//
// 관측 계획을 이 기기의 append-only operation log와 crash checkpoint로 보존한다.
// 서버 sync, 실제 관측 판정, 장비 제어, 자동 병합은 구현하지 않는다. 다른 탭/기기의
// 입력이 충돌하면 last-write-wins로 덮지 않고 명시적으로 거부해 두 원본을 보존한다.

export const OBSERVATION_SESSION_SCHEMA = 'earthus.observation-session-checkpoint.v1';
export const OBSERVATION_SESSION_EVENT_SCHEMA = 'earthus.observation-session-event.v1';
export const OBSERVATION_SESSION_EXPORT_SCHEMA = 'earthus.observation-session-export.v1';
export const OBSERVATION_SESSION_DB_NAME = 'earthus-aetherus-observation-session';
export const OBSERVATION_SESSION_DB_VERSION = 1;

const PLAN_MANIFEST_SCHEMA = 'earthus.offline-observation-pack-manifest.v1';
const EVENT_STORE = 'events';
const CHECKPOINT_STORE = 'checkpoints';
const META_STORE = 'meta';
const SESSION_CHANNEL = 'earthus-aetherus-observation-session-v1';
const TERMINAL_STATES = new Set(['COMPLETED', 'ABORTED']);
const PAUSABLE_STATES = new Set(['PREPARING', 'ALIGNING', 'OBSERVING']);
const COMMAND_EVENT = Object.freeze({
  START_SESSION: 'Session.Started',
  MARK_PREPARED: 'Session.Prepared',
  MARK_ALIGNED: 'Session.Aligned',
  PAUSE_SESSION: 'Session.Paused',
  RESUME_SESSION: 'Session.Resumed',
  COMPLETE_SESSION: 'Session.Completed',
  ABORT_SESSION: 'Session.Aborted',
});

const deepClone = value => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizedUtc(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ObservationSessionError('SESSION_VALID_UTC_REQUIRED');
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();
}

function safeToken(value, code, maximum = 160) {
  const token = String(value || '').trim();
  if (!token || token.length > maximum || !/^[A-Za-z0-9._:-]+$/.test(token)) {
    throw new ObservationSessionError(code);
  }
  return token;
}

function validatePlanManifest(manifest) {
  if (!manifest || manifest.schema !== PLAN_MANIFEST_SCHEMA
    || manifest.mode !== 'PLAN_DATA_ONLY' || manifest.appShellIncluded !== false
    || !manifest.planRevision || manifest.embedded?.plan?.revision !== manifest.planRevision) {
    throw new ObservationSessionError('SESSION_VALID_PLAN_MANIFEST_REQUIRED');
  }
  return manifest;
}

function checkpointIdentity({ sessionId, revision, eventType, previousCheckpointId, commandDigest }) {
  return `checkpoint_${fnv1a(JSON.stringify({
    sessionId, revision, eventType, previousCheckpointId: previousCheckpointId || null, commandDigest,
  }))}`;
}

function eventIdentity(event) {
  return `event_${fnv1a(JSON.stringify({
    sessionId: event.sessionId,
    revision: event.revision,
    type: event.type,
    occurredAtUtc: event.occurredAtUtc,
    commandDigest: event.commandDigest,
  }))}`;
}

function stateAfter(checkpoint, event) {
  if (!checkpoint) {
    if (event.type !== 'Session.Started' || event.revision !== 1 || event.expectedRevision !== 0) {
      throw new ObservationSessionError('SESSION_FIRST_EVENT_MUST_START');
    }
    return { state: 'PREPARING', resumeState: null };
  }

  switch (event.type) {
    case 'Session.Prepared':
      if (checkpoint.state !== 'PREPARING') throw new ObservationSessionError('SESSION_PREPARE_TRANSITION_REJECTED');
      return { state: 'ALIGNING', resumeState: null };
    case 'Session.Aligned':
      if (checkpoint.state !== 'ALIGNING') throw new ObservationSessionError('SESSION_ALIGN_TRANSITION_REJECTED');
      return { state: 'OBSERVING', resumeState: null };
    case 'Session.Paused':
      if (!PAUSABLE_STATES.has(checkpoint.state)) throw new ObservationSessionError('SESSION_PAUSE_TRANSITION_REJECTED');
      return { state: 'PAUSED', resumeState: checkpoint.state };
    case 'Session.Resumed':
      if (checkpoint.state !== 'PAUSED' || !PAUSABLE_STATES.has(checkpoint.resumeState)) {
        throw new ObservationSessionError('SESSION_RESUME_TRANSITION_REJECTED');
      }
      return { state: checkpoint.resumeState, resumeState: null };
    case 'Session.Completed':
      if (checkpoint.state !== 'OBSERVING') throw new ObservationSessionError('SESSION_COMPLETE_TRANSITION_REJECTED');
      return { state: 'COMPLETED', resumeState: null };
    case 'Session.Aborted':
      if (TERMINAL_STATES.has(checkpoint.state)) throw new ObservationSessionError('SESSION_ABORT_TRANSITION_REJECTED');
      return { state: 'ABORTED', resumeState: null };
    default:
      throw new ObservationSessionError('SESSION_EVENT_TYPE_UNSUPPORTED');
  }
}

function checkpointFromEvent(checkpoint, event) {
  if (!event || event.schema !== OBSERVATION_SESSION_EVENT_SCHEMA) {
    throw new ObservationSessionError('SESSION_EVENT_SCHEMA_UNSUPPORTED');
  }
  const previousRevision = checkpoint?.revision || 0;
  const previousCheckpointId = checkpoint?.checkpointId || null;
  if (event.revision !== previousRevision + 1 || event.expectedRevision !== previousRevision) {
    throw new ObservationSessionError('SESSION_EVENT_SEQUENCE_INVALID');
  }
  if (event.previousCheckpointId !== previousCheckpointId) {
    throw new ObservationSessionError('SESSION_EVENT_CHAIN_INVALID');
  }
  if (checkpoint && (checkpoint.sessionId !== event.sessionId || checkpoint.ownerId !== event.ownerId)) {
    throw new ObservationSessionError('SESSION_OWNER_CONFLICT');
  }
  const expectedCheckpointId = checkpointIdentity({
    sessionId: event.sessionId,
    revision: event.revision,
    eventType: event.type,
    previousCheckpointId,
    commandDigest: event.commandDigest,
  });
  if (event.checkpointId !== expectedCheckpointId || event.eventId !== eventIdentity(event)) {
    throw new ObservationSessionError('SESSION_EVENT_IDENTITY_INVALID');
  }

  const next = stateAfter(checkpoint, event);
  const manifest = checkpoint?.planManifest || validatePlanManifest(event.payload?.planManifest);
  const createdAtUtc = checkpoint?.createdAtUtc || event.occurredAtUtc;
  const history = [...(checkpoint?.history || []), Object.freeze({
    revision: event.revision,
    type: event.type,
    from: checkpoint?.state || 'PLANNED',
    to: next.state,
    occurredAtUtc: event.occurredAtUtc,
    checkpointId: event.checkpointId,
  })].slice(-16);
  return deepFreeze({
    schema: OBSERVATION_SESSION_SCHEMA,
    schemaVersion: 1,
    sessionId: event.sessionId,
    revision: event.revision,
    checkpointId: event.checkpointId,
    ownerId: event.ownerId,
    planRevision: manifest.planRevision,
    state: next.state,
    resumeState: next.resumeState,
    executionMode: 'LOCAL_CHECKPOINT_ONLY',
    executionCapability: 'NONE',
    createdAtUtc,
    updatedAtUtc: event.occurredAtUtc,
    planManifest: manifest,
    observationRecords: Object.freeze([]),
    observationSampleCount: null,
    history: Object.freeze(history),
    sync: Object.freeze({
      status: 'LOCAL_ONLY',
      remoteAdapter: 'NOT_CONFIGURED',
      upload: 'NOT_IMPLEMENTED',
      pull: 'NOT_IMPLEMENTED',
      conflictPolicy: 'REJECT_AND_KEEP_BOTH',
    }),
    recovery: Object.freeze({
      authoritativeSource: 'INDEXEDDB_APPEND_LOG',
      checkpointEveryTransition: true,
      lastEventRevision: event.revision,
    }),
    limitations: Object.freeze([
      'not-an-observability-safety-success-or-pointing-claim',
      'no-physical-device-command',
      'no-server-sync-or-automatic-merge',
      'action-times-are-device-recorded-user-actions-not-observation-evidence',
    ]),
  });
}

function commandPayload(command) {
  return command.type === 'START_SESSION'
    ? { planManifest: deepClone(validatePlanManifest(command.planManifest)) }
    : {};
}

function commandDigest(command) {
  return `command_${fnv1a(JSON.stringify({ type: command.type, payload: commandPayload(command) }))}`;
}

function commandEvent({ command, checkpoint, ownerId, occurredAtUtc }) {
  const type = COMMAND_EVENT[command.type];
  if (!type) throw new ObservationSessionError('SESSION_COMMAND_UNSUPPORTED');
  const expectedRevision = Number(command.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new ObservationSessionError('SESSION_EXPECTED_REVISION_REQUIRED');
  }
  const sessionId = safeToken(command.sessionId, 'SESSION_ID_REQUIRED', 96);
  const normalizedOwnerId = safeToken(ownerId, 'SESSION_OWNER_ID_REQUIRED', 96);
  const idempotencyKey = safeToken(command.idempotencyKey, 'SESSION_IDEMPOTENCY_KEY_REQUIRED');
  if (checkpoint && expectedRevision !== checkpoint.revision) {
    throw new ObservationSessionError('SESSION_REVISION_CONFLICT', {
      expectedRevision,
      actualRevision: checkpoint.revision,
    });
  }
  if (!checkpoint && expectedRevision !== 0) {
    throw new ObservationSessionError('SESSION_REVISION_CONFLICT', {
      expectedRevision,
      actualRevision: 0,
    });
  }
  if (checkpoint && checkpoint.ownerId !== normalizedOwnerId) {
    throw new ObservationSessionError('SESSION_OWNER_CONFLICT');
  }
  const payload = commandPayload(command);
  const digest = commandDigest(command);
  const revision = expectedRevision + 1;
  const previousCheckpointId = checkpoint?.checkpointId || null;
  const checkpointId = checkpointIdentity({
    sessionId, revision, eventType: type, previousCheckpointId, commandDigest: digest,
  });
  const event = {
    schema: OBSERVATION_SESSION_EVENT_SCHEMA,
    schemaVersion: 1,
    eventKey: `${sessionId}:${String(revision).padStart(8, '0')}`,
    eventId: null,
    sessionId,
    revision,
    expectedRevision,
    previousCheckpointId,
    checkpointId,
    type,
    occurredAtUtc: normalizedUtc(occurredAtUtc),
    ownerId: normalizedOwnerId,
    idempotencyKey,
    commandDigest: digest,
    payload,
  };
  event.eventId = eventIdentity(event);
  return deepFreeze(event);
}

function replayEvents(events) {
  const ordered = [...(events || [])].sort((a, b) => a.revision - b.revision);
  let checkpoint = null;
  ordered.forEach(event => { checkpoint = checkpointFromEvent(checkpoint, event); });
  return checkpoint;
}

function sameCheckpoint(a, b) {
  return !!a && !!b && a.sessionId === b.sessionId && a.revision === b.revision
    && a.checkpointId === b.checkpointId && a.planRevision === b.planRevision;
}

function mapStorageError(error) {
  if (error instanceof ObservationSessionError) return error;
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new ObservationSessionError('SESSION_STORAGE_PRESSURE', {}, error);
  }
  return new ObservationSessionError('SESSION_STORAGE_FAILED', {}, error);
}

export class ObservationSessionError extends Error {
  constructor(code, details = {}, cause = null) {
    super(code);
    this.name = 'ObservationSessionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    if (cause) this.cause = cause;
  }
}

export function reduceObservationSession(events) {
  return replayEvents(events);
}

export function evaluateObservationSessionConflict(localExport, incomingExport) {
  const localEvents = localExport?.events || [];
  const incomingEvents = incomingExport?.events || [];
  const local = replayEvents(localEvents);
  const incoming = replayEvents(incomingEvents);
  if (!local || !incoming || local.sessionId !== incoming.sessionId) {
    throw new ObservationSessionError('SESSION_CONFLICT_INPUT_INVALID');
  }
  if (sameCheckpoint(local, incoming)) {
    return deepFreeze({ status: 'SAME', autoMergeAllowed: false, preserve: ['LOCAL_BRANCH'] });
  }
  const commonLength = Math.min(localEvents.length, incomingEvents.length);
  const commonPrefix = Array.from({ length: commonLength }, (_, index) =>
    localEvents[index]?.eventId === incomingEvents[index]?.eventId).every(Boolean);
  if (local.ownerId === incoming.ownerId && commonPrefix) {
    const direction = local.revision > incoming.revision ? 'LOCAL_AHEAD' : 'INCOMING_AHEAD';
    return deepFreeze({
      status: 'FAST_FORWARD_CANDIDATE',
      direction,
      autoMergeAllowed: false,
      preserve: ['LOCAL_BRANCH', 'INCOMING_BRANCH'],
    });
  }
  return deepFreeze({
    status: local.ownerId === incoming.ownerId ? 'REVISION_CONFLICT' : 'OWNER_CONFLICT',
    resolution: 'USER_CHOICE_REQUIRED_KEEP_BOTH',
    autoMergeAllowed: false,
    preserve: ['LOCAL_BRANCH', 'INCOMING_BRANCH'],
  });
}

function randomToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const values = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * 0xffffffff); });
  return Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
}

function requestResult(request, fallbackCode = 'SESSION_STORAGE_FAILED') {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapStorageError(request.error || new Error(fallbackCode)));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(mapStorageError(transaction.error || new Error('SESSION_STORAGE_ABORTED')));
    transaction.onerror = () => {};
  });
}

function openSessionDatabase(indexedDb) {
  if (!indexedDb?.open) return Promise.reject(new ObservationSessionError('SESSION_INDEXEDDB_UNAVAILABLE'));
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(OBSERVATION_SESSION_DB_NAME, OBSERVATION_SESSION_DB_VERSION);
    request.onupgradeneeded = event => {
      const database = request.result;
      if (event.oldVersion === 0) {
        const events = database.createObjectStore(EVENT_STORE, { keyPath: 'eventKey' });
        events.createIndex('sessionId', 'sessionId', { unique: false });
        events.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
        const checkpoints = database.createObjectStore(CHECKPOINT_STORE, { keyPath: 'sessionId' });
        checkpoints.createIndex('planRevision', 'planRevision', { unique: false });
        database.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapStorageError(request.error));
    request.onblocked = () => reject(new ObservationSessionError('SESSION_DATABASE_UPGRADE_BLOCKED'));
  });
}

export function createIndexedDbObservationSessionRepository({ indexedDb = globalThis.indexedDB } = {}) {
  let databasePromise = null;
  const database = () => {
    databasePromise = databasePromise || openSessionDatabase(indexedDb);
    return databasePromise;
  };

  const readEvents = async sessionId => {
    const db = await database();
    const transaction = db.transaction(EVENT_STORE, 'readonly');
    const index = transaction.objectStore(EVENT_STORE).index('sessionId');
    let request;
    if (globalThis.IDBKeyRange?.only) request = index.getAll(globalThis.IDBKeyRange.only(sessionId));
    else request = index.getAll();
    const result = await requestResult(request);
    await transactionDone(transaction);
    return (result || []).filter(event => event.sessionId === sessionId)
      .sort((a, b) => a.revision - b.revision);
  };

  const readCheckpoint = async sessionId => {
    const db = await database();
    const transaction = db.transaction(CHECKPOINT_STORE, 'readonly');
    const result = await requestResult(transaction.objectStore(CHECKPOINT_STORE).get(sessionId));
    await transactionDone(transaction);
    return result || null;
  };

  const saveRecovered = async checkpoint => {
    const db = await database();
    const transaction = db.transaction(CHECKPOINT_STORE, 'readwrite');
    transaction.objectStore(CHECKPOINT_STORE).put(deepClone(checkpoint));
    await transactionDone(transaction);
    return true;
  };

  return Object.freeze({
    async getOrCreateOwnerId(factory = randomToken) {
      const db = await database();
      const transaction = db.transaction(META_STORE, 'readwrite');
      const store = transaction.objectStore(META_STORE);
      const existing = await requestResult(store.get('device-owner'));
      const nonce = String(factory());
      const ownerId = existing?.value || `device_${fnv1a(nonce)}_${nonce.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`;
      if (!existing) store.put({ key: 'device-owner', value: ownerId, schemaVersion: 1 });
      await transactionDone(transaction);
      return ownerId;
    },

    async load(sessionId) {
      const [storedCheckpoint, events] = await Promise.all([
        readCheckpoint(sessionId), readEvents(sessionId),
      ]);
      if (!storedCheckpoint && !events.length) return { checkpoint: null, events: [], recovered: false };
      const replayed = replayEvents(events);
      if (!replayed) throw new ObservationSessionError('SESSION_EVENT_LOG_MISSING');
      const recovered = !sameCheckpoint(storedCheckpoint, replayed);
      if (storedCheckpoint && storedCheckpoint.revision > replayed.revision) {
        throw new ObservationSessionError('SESSION_CHECKPOINT_AHEAD_OF_LOG');
      }
      if (recovered) await saveRecovered(replayed);
      return { checkpoint: replayed, events, recovered };
    },

    async findByPlanRevision(planRevision) {
      const db = await database();
      const transaction = db.transaction(CHECKPOINT_STORE, 'readonly');
      const index = transaction.objectStore(CHECKPOINT_STORE).index('planRevision');
      let request;
      if (globalThis.IDBKeyRange?.only) request = index.getAll(globalThis.IDBKeyRange.only(planRevision));
      else request = index.getAll();
      const rows = await requestResult(request);
      await transactionDone(transaction);
      const candidates = (rows || []).filter(row => row.planRevision === planRevision)
        .sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
      if (!candidates.length) return { checkpoint: null, events: [], recovered: false };
      return this.load(candidates[0].sessionId);
    },

    async append({ event, checkpoint, expectedRevision }) {
      const db = await database();
      const transaction = db.transaction([EVENT_STORE, CHECKPOINT_STORE], 'readwrite');
      const events = transaction.objectStore(EVENT_STORE);
      const checkpoints = transaction.objectStore(CHECKPOINT_STORE);
      try {
        const duplicate = await requestResult(events.index('idempotencyKey').get(event.idempotencyKey));
        const current = await requestResult(checkpoints.get(event.sessionId));
        if (duplicate) {
          if (duplicate.commandDigest !== event.commandDigest || duplicate.sessionId !== event.sessionId) {
            transaction.abort();
            throw new ObservationSessionError('SESSION_IDEMPOTENCY_CONFLICT');
          }
          await transactionDone(transaction).catch(() => {});
          return { status: 'DUPLICATE', checkpoint: current || checkpoint };
        }
        const actualRevision = current?.revision || 0;
        if (actualRevision !== expectedRevision) {
          transaction.abort();
          throw new ObservationSessionError('SESSION_REVISION_CONFLICT', { expectedRevision, actualRevision });
        }
        events.add(deepClone(event));
        checkpoints.put(deepClone(checkpoint));
        await transactionDone(transaction);
        return { status: 'APPLIED', checkpoint };
      } catch (error) {
        if (transaction.readyState === 'active') transaction.abort();
        throw mapStorageError(error);
      }
    },

    async exportSession(sessionId) {
      const loaded = await this.load(sessionId);
      if (!loaded.checkpoint) throw new ObservationSessionError('SESSION_NOT_FOUND');
      return deepFreeze({
        schema: OBSERVATION_SESSION_EXPORT_SCHEMA,
        exportedAtUtc: normalizedUtc(new Date()),
        checkpoint: loaded.checkpoint,
        events: Object.freeze(loaded.events.map(event => deepFreeze(deepClone(event)))),
        sync: Object.freeze({ status: 'LOCAL_ONLY', remoteAdapter: 'NOT_CONFIGURED' }),
      });
    },
  });
}

export function createMemoryObservationSessionRepository() {
  const checkpoints = new Map();
  const events = new Map();
  const idempotency = new Map();
  let ownerId = null;
  let failNextWrite = null;

  const loadEvents = sessionId => [...(events.get(sessionId) || [])].map(deepClone);
  const repository = {
    async getOrCreateOwnerId(factory = randomToken) {
      ownerId = ownerId || `device_${fnv1a(String(factory()))}`;
      return ownerId;
    },
    async load(sessionId) {
      const stored = checkpoints.get(sessionId) || null;
      const log = loadEvents(sessionId);
      if (!stored && !log.length) return { checkpoint: null, events: [], recovered: false };
      const replayed = replayEvents(log);
      const recovered = !sameCheckpoint(stored, replayed);
      if (stored && stored.revision > replayed.revision) {
        throw new ObservationSessionError('SESSION_CHECKPOINT_AHEAD_OF_LOG');
      }
      if (recovered) checkpoints.set(sessionId, deepClone(replayed));
      return { checkpoint: replayed, events: log, recovered };
    },
    async findByPlanRevision(planRevision) {
      const rows = [...checkpoints.values()].filter(row => row.planRevision === planRevision)
        .sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
      if (!rows.length) return { checkpoint: null, events: [], recovered: false };
      return this.load(rows[0].sessionId);
    },
    async append({ event, checkpoint, expectedRevision }) {
      if (failNextWrite) {
        const failure = failNextWrite;
        failNextWrite = null;
        throw failure === 'quota'
          ? new ObservationSessionError('SESSION_STORAGE_PRESSURE')
          : new ObservationSessionError('SESSION_STORAGE_FAILED');
      }
      const duplicate = idempotency.get(event.idempotencyKey);
      const current = checkpoints.get(event.sessionId) || null;
      if (duplicate) {
        if (duplicate.commandDigest !== event.commandDigest || duplicate.sessionId !== event.sessionId) {
          throw new ObservationSessionError('SESSION_IDEMPOTENCY_CONFLICT');
        }
        return { status: 'DUPLICATE', checkpoint: deepFreeze(deepClone(current || checkpoint)) };
      }
      const actualRevision = current?.revision || 0;
      if (actualRevision !== expectedRevision) {
        throw new ObservationSessionError('SESSION_REVISION_CONFLICT', { expectedRevision, actualRevision });
      }
      const nextEvents = [...(events.get(event.sessionId) || []), deepClone(event)];
      events.set(event.sessionId, nextEvents);
      checkpoints.set(event.sessionId, deepClone(checkpoint));
      idempotency.set(event.idempotencyKey, deepClone(event));
      return { status: 'APPLIED', checkpoint };
    },
    async exportSession(sessionId) {
      const loaded = await this.load(sessionId);
      if (!loaded.checkpoint) throw new ObservationSessionError('SESSION_NOT_FOUND');
      return deepFreeze({
        schema: OBSERVATION_SESSION_EXPORT_SCHEMA,
        exportedAtUtc: normalizedUtc(new Date()),
        checkpoint: loaded.checkpoint,
        events: Object.freeze(loaded.events.map(event => deepFreeze(deepClone(event)))),
        sync: Object.freeze({ status: 'LOCAL_ONLY', remoteAdapter: 'NOT_CONFIGURED' }),
      });
    },
    simulateCrashAfterEventCommit(sessionId) { checkpoints.delete(sessionId); },
    failNextWrite(kind = 'quota') { failNextWrite = kind; },
    rawEvents(sessionId) { return loadEvents(sessionId); },
  };
  return Object.freeze(repository);
}

export function createObservationSessionService({
  repository,
  ownerId,
  now = () => new Date(),
  idFactory = randomToken,
} = {}) {
  if (!repository || !ownerId) throw new ObservationSessionError('SESSION_SERVICE_DEPENDENCY_REQUIRED');
  const notify = checkpoint => {
    if (!checkpoint || typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(SESSION_CHANNEL);
      channel.postMessage({
        type: 'SESSION_UPDATED', sessionId: checkpoint.sessionId,
        planRevision: checkpoint.planRevision, revision: checkpoint.revision,
      });
      channel.close();
    } catch (_) { /* IndexedDB commit remains authoritative when broadcast is unavailable. */ }
  };

  const execute = async command => {
    const loaded = await repository.load(command.sessionId);
    const current = loaded.checkpoint;
    const duplicate = loaded.events.find(event => event.idempotencyKey === command.idempotencyKey);
    if (duplicate) {
      if (duplicate.commandDigest !== commandDigest(command)) {
        throw new ObservationSessionError('SESSION_IDEMPOTENCY_CONFLICT');
      }
      return deepFreeze({
        status: 'DUPLICATE', checkpoint: current, event: duplicate,
        recoveredBeforeCommand: loaded.recovered,
      });
    }
    const event = commandEvent({ command, checkpoint: current, ownerId, occurredAtUtc: now() });
    const checkpoint = checkpointFromEvent(current, event);
    const result = await repository.append({ event, checkpoint, expectedRevision: command.expectedRevision });
    notify(result.checkpoint);
    return deepFreeze({ ...result, event, recoveredBeforeCommand: loaded.recovered });
  };

  return Object.freeze({
    ownerId,
    async start({ planManifest, sessionId = null, idempotencyKey = null } = {}) {
      const manifest = validatePlanManifest(planManifest);
      const nonce = String(idFactory());
      const generatedSessionId = sessionId || `session_${fnv1a(`${manifest.planRevision}:${nonce}`)}_${nonce.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`;
      return execute({
        type: 'START_SESSION',
        sessionId: generatedSessionId,
        expectedRevision: 0,
        idempotencyKey: idempotencyKey || `start:${generatedSessionId}`,
        planManifest: manifest,
      });
    },
    async dispatch({ sessionId, type, expectedRevision, idempotencyKey = null } = {}) {
      const key = idempotencyKey || `${String(type).toLowerCase()}:${sessionId}:${expectedRevision}`;
      return execute({ sessionId, type, expectedRevision, idempotencyKey: key });
    },
    load(sessionId) { return repository.load(sessionId); },
    findByPlanRevision(planRevision) { return repository.findByPlanRevision(planRevision); },
    exportSession(sessionId) { return repository.exportSession(sessionId); },
  });
}

export async function openLocalObservationSessionService(options = {}) {
  const repository = createIndexedDbObservationSessionRepository(options);
  const ownerId = await repository.getOrCreateOwnerId(options.idFactory || randomToken);
  return createObservationSessionService({ repository, ownerId, now: options.now, idFactory: options.idFactory });
}

export function observeObservationSessionUpdates(callback) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.onmessage = event => {
    if (event.data?.type === 'SESSION_UPDATED') callback(event.data);
  };
  return () => channel.close();
}

export function sessionShellResources({ locationHref, resourceNames = [] } = {}) {
  const origin = new URL(locationHref).origin;
  const allowed = new Set([
    '/index.html',
    '/manifest.webmanifest',
    '/data/celestial-bodies.json',
    '/space/planets/detail/mars.webp?v=20260810d',
  ]);
  resourceNames.forEach(name => {
    let url;
    try { url = new URL(name, locationHref); } catch (_) { return; }
    if (url.origin !== origin || !/\.(?:js|css|html|webmanifest)$/i.test(url.pathname)) return;
    allowed.add(`${url.pathname}${url.search}`);
  });
  return Object.freeze([...allowed].slice(0, 160));
}

export async function cacheLoadedSessionShell() {
  if (!globalThis.navigator?.serviceWorker || !globalThis.location || !globalThis.performance) {
    return Object.freeze({ status: 'UNAVAILABLE', cached: 0 });
  }
  const resources = sessionShellResources({
    locationHref: globalThis.location.href,
    resourceNames: globalThis.performance.getEntriesByType('resource').map(entry => entry.name),
  });
  const registration = await globalThis.navigator.serviceWorker.ready.catch(() => null);
  const worker = globalThis.navigator.serviceWorker.controller || registration?.active;
  if (!worker || typeof MessageChannel === 'undefined') {
    return Object.freeze({ status: 'UNAVAILABLE', cached: 0 });
  }
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = data => resolve(Object.freeze({
      status: data?.ok ? 'WARMED' : 'PARTIAL',
      cached: Number(data?.cached || 0),
      requested: resources.length,
      checksum: data?.checksum === 'SHA-256' ? 'SHA-256' : null,
      checksummed: Number(data?.checksummed || 0),
    }));
    channel.port1.onmessage = event => finish(event.data);
    worker.postMessage({ type: 'earthus:aetherus-cache-session-shell', resources }, [channel.port2]);
    setTimeout(() => finish({ ok: false, cached: 0 }), 3000);
  });
}

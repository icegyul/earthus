import { createHash } from 'node:crypto';

const PRIVATE_FIELDS = new Set([
  'userId', 'principalId', 'principalScope', 'privateRoute', 'preciseLocation',
  'savedPlaces', 'fullCalendar', 'privateContext', 'email', 'token', 'secret',
]);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function findPrivateField(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPrivateField(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_FIELDS.has(key)) return key;
    const found = findPrivateField(child);
    if (found) return found;
  }
  return null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function pointerKey(productType, spatialKey) {
  return `${productType}/${spatialKey}`;
}

export class MemoryMaterializedStore {
  constructor() {
    this.artifacts = new Map();
    this.pointers = new Map();
  }

  async putImmutable(id, artifact) {
    if (!this.artifacts.has(id)) this.artifacts.set(id, artifact);
    return this.artifacts.get(id);
  }

  async readArtifact(id) { return this.artifacts.get(id) || null; }
  async readPointer(key) { return this.pointers.get(key) || null; }

  async compareAndSetPointer(key, next) {
    const current = this.pointers.get(key);
    if (current && Number(current.generation || 0) > Number(next.generation || 0)) {
      throw new Error('MATERIALIZED_LATE_PUBLISH_BLOCKED');
    }
    this.pointers.set(key, deepFreeze({ ...next }));
    return this.pointers.get(key);
  }
}

export class MaterializedEarthService {
  constructor({ store, now = () => new Date().toISOString() } = {}) {
    if (!store) throw new Error('MATERIALIZED_STORE_REQUIRED');
    this.store = store;
    this.now = now;
  }

  async publish(spec = {}) {
    for (const required of [
      'productType', 'spatialScope', 'spatialKey', 'targetTime', 'schemaVersion',
      'policyVersion', 'modelVersion', 'dataRevision', 'shareScope', 'truthState',
    ]) {
      if (spec[required] == null || spec[required] === '') {
        throw new Error(`MATERIALIZED_FIELD_REQUIRED:${required}`);
      }
    }
    if (!Array.isArray(spec.sourceRefs) || spec.sourceRefs.length === 0) {
      throw new Error('MATERIALIZED_SOURCE_REFS_REQUIRED');
    }
    if (spec.shareScope === 'PUBLIC') {
      const privateField = findPrivateField(spec.payload);
      if (privateField) throw new Error(`PUBLIC_ARTIFACT_PRIVATE_FIELD:${privateField}`);
    }
    const generatedAt = this.now();
    const core = {
      schemaVersion: spec.schemaVersion,
      productType: spec.productType,
      spatialScope: spec.spatialScope,
      spatialKey: spec.spatialKey,
      targetTime: spec.targetTime,
      policyVersion: spec.policyVersion,
      modelVersion: spec.modelVersion,
      dataRevision: spec.dataRevision,
      dependencyFingerprint: hash([...(spec.dependencies || [])].sort()),
      truthState: spec.truthState,
      sourceRefs: [...spec.sourceRefs],
      confidenceClass: spec.confidenceClass || 'UNKNOWN',
      uncertaintyRef: spec.uncertaintyRef || null,
      shareScope: spec.shareScope,
      entitlementClass: spec.entitlementClass || null,
      payload: spec.payload || {},
    };
    const contentHash = hash(core);
    const artifactId = `ma_${contentHash}`;
    const artifact = deepFreeze({
      artifactId,
      contentHash: `sha256:${contentHash}`,
      generatedAt,
      freshUntil: spec.freshUntil || null,
      staleUntil: spec.staleUntil || null,
      ...core,
    });
    await this.store.putImmutable(artifactId, artifact);
    await this.store.compareAndSetPointer(pointerKey(spec.productType, spec.spatialKey), {
      artifactId,
      generation: Number(spec.generation || 0),
      updatedAt: generatedAt,
      dataRevision: spec.dataRevision,
    });
    return artifact;
  }

  async readCurrent(productType, spatialKey) {
    const pointer = await this.store.readPointer(pointerKey(productType, spatialKey));
    return pointer ? this.store.readArtifact(pointer.artifactId) : null;
  }
}

/* EARTHUS v5.2 public Materialized Earth reader.
 * Reads one compact C1 artifact. It never calls upstream providers and never
 * accepts private fields on this public surface.
 */
const CURRENT_URL = './data/materialized/current.json';
const PRIVATE_FIELDS = new Set([
  'userId', 'principalId', 'principalScope', 'privateRoute', 'preciseLocation',
  'savedPlaces', 'fullCalendar', 'privateContext', 'email', 'token', 'secret',
]);

function findPrivateField(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findPrivateField(child);
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

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function validate(doc) {
  if (doc?.schemaVersion !== 'earthus.materialized-current.v5.2') {
    throw new Error('MATERIALIZED_SCHEMA_MISMATCH');
  }
  if (doc.computeClass !== 'C1_MATERIALIZED_SHARED') {
    throw new Error('MATERIALIZED_FIRST_LOAD_CLASS_VIOLATION');
  }
  if (doc.shareScope !== 'PUBLIC') throw new Error('MATERIALIZED_PUBLIC_SCOPE_REQUIRED');
  if (!doc.earthVersion?.earthVersion || !Array.isArray(doc.artifactRefs)) {
    throw new Error('MATERIALIZED_VERSION_REFS_REQUIRED');
  }
  const privateField = findPrivateField(doc);
  if (privateField) throw new Error(`MATERIALIZED_PUBLIC_PRIVATE_FIELD:${privateField}`);
  return freeze(doc);
}

let documentState = null;
let errorState = null;
let inflight = null;

export async function loadMaterializedEarth({ force = false } = {}) {
  if (documentState && !force) return documentState;
  if (inflight) return inflight;
  inflight = fetch(CURRENT_URL, { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`MATERIALIZED_CURRENT_${response.status}`);
      return response.json();
    })
    .then(validate)
    .then(doc => {
      documentState = doc;
      errorState = null;
      document.dispatchEvent(new CustomEvent('earthus:v52-materialized-ready', {
        detail: controller.snapshot(),
      }));
      return doc;
    })
    .catch(error => {
      errorState = String(error?.message || error);
      console.warn('[v2/materialized-earth]', errorState);
      throw error;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

const controller = Object.freeze({
  version: 'earthus.materialized-runtime.v5.2',
  async refresh() { return loadMaterializedEarth({ force: true }); },
  snapshot() {
    if (!documentState) return null;
    return Object.freeze({
      schemaVersion: documentState.schemaVersion,
      generatedAt: documentState.generatedAt,
      computeClass: documentState.computeClass,
      shareScope: documentState.shareScope,
      earthVersion: documentState.earthVersion.earthVersion,
      artifactCount: documentState.artifactRefs.length,
      activeEventCount: Number(documentState.globalDigest?.payload?.activeEventCount || 0),
      stationCount: Number(documentState.regionSnapshot?.payload?.observation?.stationCount || 0),
      observedAt: documentState.regionSnapshot?.payload?.observation?.observedAt || null,
      modelAt: documentState.regionSnapshot?.payload?.forecast?.validAt || null,
      eventAt: documentState.eventCapsule?.payload?.generatedAt || null,
      costStatus: documentState.directInfraCost?.status || 'UNKNOWN',
      error: errorState,
    });
  },
});

globalThis.__earthusV52Materialized = controller;
document.addEventListener('earthus:v2-retry', event => {
  if (event.detail?.resource === 'materialized-earth') controller.refresh().catch(() => {});
});
loadMaterializedEarth().catch(() => {});

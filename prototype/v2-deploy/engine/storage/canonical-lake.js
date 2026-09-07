import { fnv1a64, stableStringify } from '../core/math.js';

function safeSegment(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim().replace(/[^A-Za-z0-9._=-]+/g, '_');
}

export function canonicalObjectKey({ dataset, region, validAt, resolution, schemaVersion, partition = 'normalized' }) {
  const date = new Date(validAt);
  if (Number.isNaN(date.getTime())) throw new TypeError('validAt must be an ISO date-time');
  const day = date.toISOString().slice(0, 10).replaceAll('-', '/');
  const hour = date.toISOString().slice(11, 13);
  return [
    'canonical',
    safeSegment(schemaVersion, 'schemaVersion'),
    safeSegment(dataset, 'dataset'),
    safeSegment(region, 'region'),
    day,
    hour,
    `${safeSegment(partition, 'partition')}-${safeSegment(resolution, 'resolution')}-${date.toISOString().replaceAll(':', '').replace('.000Z', 'Z')}.json`,
  ].join('/');
}

export function createRevisionManifest({ dataset, businessKey, observedAt, receivedAt, schemaVersion, processorVersion, objectKey, payloadFingerprint, previousRevisionId = null }) {
  if (!dataset || !businessKey || !receivedAt || !schemaVersion || !processorVersion || !objectKey) throw new TypeError('revision manifest is incomplete');
  const base = {
    schemaVersion: 'earthus.revision-manifest.v2.0',
    dataset,
    businessKey,
    observedAt: observedAt ?? null,
    receivedAt: new Date(receivedAt).toISOString(),
    sourceSchemaVersion: schemaVersion,
    processorVersion,
    objectKey,
    payloadFingerprint: payloadFingerprint ?? null,
    previousRevisionId,
  };
  return Object.freeze({ ...base, revisionId: `rev_${fnv1a64(stableStringify(base))}` });
}

export class WatermarkRegistry {
  #watermarks = new Map();

  advance(dataset, value, metadata = {}) {
    if (!dataset || !value) throw new TypeError('dataset and watermark value are required');
    const previous = this.#watermarks.get(dataset) ?? null;
    if (previous && String(value) < String(previous.value)) throw new RangeError('watermark cannot move backwards');
    const record = Object.freeze({ dataset, value, metadata: Object.freeze(structuredClone(metadata)), updatedAt: new Date().toISOString() });
    this.#watermarks.set(dataset, record);
    return record;
  }

  get(dataset) { return this.#watermarks.get(dataset) ?? null; }
}

export function backfillWindows({ from, to, windowDays = 30, overlapDays = 7 }) {
  const start = new Date(from); const end = new Date(to);
  if ([start, end].some((date) => Number.isNaN(date.getTime())) || start > end) throw new RangeError('invalid backfill range');
  if (!Number.isInteger(windowDays) || windowDays <= 0 || !Number.isInteger(overlapDays) || overlapDays < 0 || overlapDays >= windowDays) throw new RangeError('invalid window settings');
  const windows = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const windowEnd = new Date(Math.min(end.getTime(), cursor.getTime() + (windowDays - 1) * 86400000));
    windows.push(Object.freeze({ from: cursor.toISOString(), to: windowEnd.toISOString() }));
    if (windowEnd.getTime() >= end.getTime()) break;
    cursor = new Date(windowEnd.getTime() + (1 - overlapDays) * 86400000);
  }
  return Object.freeze(windows);
}

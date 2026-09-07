export function buildEventCapsule({ eventId, type, startAt, endAt, regionIds, datasets, reason, preserveRaw = false }) {
  if (!eventId || !type || !startAt || !endAt || !Array.isArray(regionIds) || !regionIds.length || !Array.isArray(datasets) || !datasets.length) {
    throw new TypeError('event capsule input is incomplete');
  }
  if (Date.parse(startAt) > Date.parse(endAt)) throw new RangeError('event startAt must not exceed endAt');
  return Object.freeze({
    schemaVersion: 'earthus.event-capsule.v2.0',
    eventId,
    type,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    regionIds: Object.freeze([...new Set(regionIds)].sort()),
    datasets: Object.freeze([...new Set(datasets)].sort()),
    reason: reason ?? 'IMPORTANT_EVENT',
    preserveRaw,
    archiveClass: 'LONG_TERM_EVENT',
    replayReady: true,
  });
}

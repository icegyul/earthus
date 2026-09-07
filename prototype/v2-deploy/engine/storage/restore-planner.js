export function buildRestorePlan({ archiveId, requestedChunks, entitlement, temporaryTtlHours = 48, priority = 'NORMAL' }) {
  if (!archiveId || !Array.isArray(requestedChunks) || !requestedChunks.length) throw new TypeError('archiveId and requestedChunks are required');
  if (!['PLUS', 'CONTROL', 'BUSINESS'].includes(entitlement)) return Object.freeze({ allowed: false, reason: 'ENTITLEMENT_REQUIRED' });
  if (!Number.isFinite(temporaryTtlHours) || temporaryTtlHours <= 0 || temporaryTtlHours > 72) throw new RangeError('temporaryTtlHours must be in (0,72]');
  const chunks = [...new Set(requestedChunks)].sort();
  return Object.freeze({
    allowed: true,
    archiveId,
    requestedChunks: Object.freeze(chunks),
    source: 'NAS_COLD_ARCHIVE',
    destinationPrefix: `restore/${archiveId}`,
    serveVia: 'S3_CLOUDFRONT_TEMPORARY',
    directNasServing: false,
    temporaryTtlHours,
    priority,
    restoreOrder: Object.freeze(chunks.map((chunk, index) => Object.freeze({ chunk, order: index + 1 }))),
  });
}

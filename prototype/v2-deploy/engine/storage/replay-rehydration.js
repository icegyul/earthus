export function buildReplayRehydrationPlan({
  archiveManifest,
  requestedRegion,
  fromAt,
  toAt,
  targetSchemaVersion,
  supportedProcessorVersions = [],
  outputPrefix = 'restore',
}) {
  if (!archiveManifest?.archiveId || !Array.isArray(archiveManifest.chunks)) throw new TypeError('valid archiveManifest is required');
  if (!requestedRegion || !fromAt || !toAt || Date.parse(fromAt) > Date.parse(toAt)) throw new TypeError('valid region and time range are required');
  const processorOk = supportedProcessorVersions.length === 0 || supportedProcessorVersions.includes(archiveManifest.processorVersion);
  if (!processorOk) return Object.freeze({ allowed: false, reason: 'PROCESSOR_VERSION_UNSUPPORTED' });
  if (targetSchemaVersion && archiveManifest.schemaVersion !== targetSchemaVersion) {
    return Object.freeze({ allowed: false, reason: 'SCHEMA_MIGRATION_REQUIRED', sourceSchemaVersion: archiveManifest.schemaVersion, targetSchemaVersion });
  }
  const chunks = archiveManifest.chunks.filter((chunk) => {
    const regionOk = chunk.region === requestedRegion || chunk.region === 'global';
    const overlap = Date.parse(chunk.toAt) >= Date.parse(fromAt) && Date.parse(chunk.fromAt) <= Date.parse(toAt);
    return regionOk && overlap;
  });
  if (!chunks.length) return Object.freeze({ allowed: false, reason: 'NO_MATCHING_CHUNKS' });
  return Object.freeze({
    allowed: true,
    archiveId: archiveManifest.archiveId,
    source: 'NAS_COLD_ARCHIVE',
    directNasServing: false,
    chunks: Object.freeze(chunks.map((chunk) => chunk.chunkId).sort()),
    temporaryS3Prefix: `${outputPrefix}/${archiveManifest.archiveId}/${requestedRegion}`,
    steps: Object.freeze(['FETCH_TO_TEMP_S3', 'VERIFY_CHECKSUM', 'MIGRATE_IF_DECLARED', 'REBUILD_SERVICE_TILES', 'PUBLISH_CLOUDFRONT_TEMP', 'EXPIRE_TEMP_OBJECTS']),
  });
}

import { fnv1a64, stableStringify } from '../../v02/core/math.js';
export function buildArchivePackagePlan({datasetId,region,startAt,endAt,logicalRecords,chunkBytes=64*1024*1024,format='ZARR_V3_SHARDED',schemaVersion,processorVersion}){
  if(!datasetId||!region||!schemaVersion||!processorVersion) throw new TypeError('dataset/region/schema/processor required');
  if(!Number.isFinite(logicalRecords)||logicalRecords<0) throw new RangeError('logicalRecords invalid');
  const start=Date.parse(startAt),end=Date.parse(endAt); if(!Number.isFinite(start)||!Number.isFinite(end)||start>end) throw new TypeError('time range invalid');
  const payload={datasetId,region,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),logicalRecords,chunkBytes,format,schemaVersion,processorVersion};
  return Object.freeze({...payload,archiveId:`arc_${fnv1a64(stableStringify(payload))}`,manifestRequired:true,checksumRequired:'SHA-256',directNasServing:false});
}

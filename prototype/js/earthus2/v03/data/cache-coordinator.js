const TIERS = Object.freeze({ GPU:'GPU', RAM:'RAM', DISK:'DISK', CDN:'CDN', ORIGIN:'ORIGIN' });
export function cacheKey({datasetId, regionId='global', lod=0, validAt, schemaVersion='1'}) {
  if (!datasetId || !validAt) throw new TypeError('datasetId and validAt required');
  return `${schemaVersion}/${datasetId}/${regionId}/lod-${lod}/${validAt}`;
}
export function cachePlan({ playback=false, frameIndex=0, totalFrames=1, mobile=false } = {}) {
  const gpuRadius=1, ramRadius=mobile?2:4, diskRadius=mobile?12:24;
  const range=(r)=>{const out=[];for(let i=Math.max(0,frameIndex-r);i<=Math.min(totalFrames-1,frameIndex+r);i++)out.push(i);return out;};
  return { [TIERS.GPU]:range(gpuRadius), [TIERS.RAM]:range(ramRadius), [TIERS.DISK]:playback?range(diskRadius):range(ramRadius), prefetchDirection:playback?'FORWARD':'BALANCED' };
}
export { TIERS };

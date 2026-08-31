export function buildDeltaPackPlan({ frameCount, keyframeEvery = 6, averageFullBytes, averageDeltaRatio = 0.28 }) {
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new RangeError('frameCount must be a positive integer');
  if (!Number.isInteger(keyframeEvery) || keyframeEvery <= 0) throw new RangeError('keyframeEvery must be positive');
  if (!Number.isFinite(averageFullBytes) || averageFullBytes <= 0) throw new RangeError('averageFullBytes must be positive');
  if (!Number.isFinite(averageDeltaRatio) || averageDeltaRatio <= 0 || averageDeltaRatio >= 1) throw new RangeError('averageDeltaRatio must be in (0,1)');
  const keyframes = Math.ceil(frameCount / keyframeEvery);
  const deltas = frameCount - keyframes;
  const fullBytes = frameCount * averageFullBytes;
  const packedBytes = keyframes * averageFullBytes + deltas * averageFullBytes * averageDeltaRatio;
  return Object.freeze({ frameCount, keyframes, deltas, fullBytes, packedBytes, savingRatio: 1 - packedBytes / fullBytes, randomAccessPenaltyFrames: keyframeEvery - 1 });
}

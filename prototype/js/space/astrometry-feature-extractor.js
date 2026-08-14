const finite = value => Number.isFinite(value);

export class AstrometryFeatureExtractionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AstrometryFeatureExtractionError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new AstrometryFeatureExtractionError(code, message);
}

function validateInput({ width, height, luminance } = {}) {
  if (!Number.isInteger(width) || width < 3 || !Number.isInteger(height) || height < 3) {
    fail('FEATURE_IMAGE_DIMENSIONS_INVALID', 'width and height must be integers >= 3');
  }
  if (!(luminance instanceof Uint8Array) && !(luminance instanceof Uint8ClampedArray)) {
    fail('FEATURE_IMAGE_LUMINANCE_INVALID', '8-bit luminance buffer required');
  }
  if (luminance.length !== width * height) {
    fail('FEATURE_IMAGE_LENGTH_MISMATCH', `${luminance.length} != ${width * height}`);
  }
}

function imageStatistics(luminance) {
  let mean = 0;
  let squaredDelta = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    const delta = luminance[index] - mean;
    mean += delta / (index + 1);
    squaredDelta += delta * (luminance[index] - mean);
  }
  return {
    mean,
    sigma: Math.sqrt(squaredDelta / Math.max(1, luminance.length - 1)),
  };
}

function isLocalMaximum(luminance, width, index, value) {
  return value >= luminance[index - width - 1]
    && value >= luminance[index - width]
    && value >= luminance[index - width + 1]
    && value >= luminance[index - 1]
    && value > luminance[index + 1]
    && value > luminance[index + width - 1]
    && value > luminance[index + width]
    && value > luminance[index + width + 1];
}

function centroidCandidate({ luminance, width, height, x, y, background }) {
  let weightedX = 0;
  let weightedY = 0;
  let flux = 0;
  let peak = 0;
  for (let yy = Math.max(0, y - 2); yy <= Math.min(height - 1, y + 2); yy += 1) {
    for (let xx = Math.max(0, x - 2); xx <= Math.min(width - 1, x + 2); xx += 1) {
      const sample = luminance[yy * width + xx];
      const weight = Math.max(0, sample - background);
      peak = Math.max(peak, sample);
      flux += weight;
      weightedX += xx * weight;
      weightedY += yy * weight;
    }
  }
  if (!(flux > 0)) return null;
  return { x: weightedX / flux, y: weightedY / flux, flux, peak };
}

export function extractStarFeatures({ width, height, luminance } = {}, {
  maxFeatures = 256,
  thresholdSigma = 3.25,
  minimumThreshold = 18,
  minimumSeparationPx = 4,
} = {}) {
  validateInput({ width, height, luminance });
  if (!Number.isInteger(maxFeatures) || maxFeatures < 1 || maxFeatures > 2048) {
    fail('FEATURE_LIMIT_INVALID', 'maxFeatures must be an integer from 1 to 2048');
  }
  if (!finite(thresholdSigma) || thresholdSigma < 1 || thresholdSigma > 12) {
    fail('FEATURE_THRESHOLD_SIGMA_INVALID', 'thresholdSigma must be from 1 to 12');
  }
  const statistics = imageStatistics(luminance);
  const threshold = Math.min(254, Math.max(
    statistics.mean + thresholdSigma * statistics.sigma,
    statistics.mean + minimumThreshold,
  ));
  const candidates = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value = luminance[index];
      if (value < threshold || !isLocalMaximum(luminance, width, index, value)) continue;
      const candidate = centroidCandidate({
        luminance,
        width,
        height,
        x,
        y,
        background: statistics.mean,
      });
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((left, right) => right.flux - left.flux || right.peak - left.peak);
  const separationSquared = minimumSeparationPx * minimumSeparationPx;
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some(feature => (feature.x - candidate.x) ** 2
      + (feature.y - candidate.y) ** 2 < separationSquared)) continue;
    selected.push(candidate);
    if (selected.length >= maxFeatures) break;
  }
  const features = selected.map((feature, index) => Object.freeze({
    id: `star-${String(index + 1).padStart(3, '0')}`,
    x: Math.round(feature.x * 1000) / 1000,
    y: Math.round(feature.y * 1000) / 1000,
    flux: Math.round(feature.flux * 1000) / 1000,
  }));
  return Object.freeze({
    schema: 'earthus.astrometry-feature-extraction.v1',
    image: Object.freeze({ width, height }),
    features: Object.freeze(features),
    diagnostics: Object.freeze({
      mean: Math.round(statistics.mean * 1000) / 1000,
      sigma: Math.round(statistics.sigma * 1000) / 1000,
      threshold: Math.round(threshold * 1000) / 1000,
      candidateCount: candidates.length,
      selectedCount: features.length,
      networkRequestCount: 0,
      originalUploadCount: 0,
    }),
  });
}

export function rgbaToLuminance({ width, height, rgba } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray))
    || rgba.length !== width * height * 4) {
    fail('RGBA_IMAGE_INVALID', 'width*height*4 RGBA bytes required');
  }
  const luminance = new Uint8ClampedArray(width * height);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    luminance[target] = Math.round(
      0.2126 * rgba[source] + 0.7152 * rgba[source + 1] + 0.0722 * rgba[source + 2],
    );
  }
  return luminance;
}

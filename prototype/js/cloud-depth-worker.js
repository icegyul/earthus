/* OffscreenCanvas 지원 브라우저에서만 쓰는 cloud-depth mask worker.
 * 입력 bitmap은 8192px/128MiB raster gate를 통과한 뒤에만 온다. */

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}
function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function alphaAt(red, green, blue, alpha, mode) {
  const sourceAlpha = clamp(alpha / 255);
  if (mode === 'alpha') return sourceAlpha;
  const high = Math.max(red, green, blue) / 255;
  const low = Math.min(red, green, blue) / 255;
  if (mode === 'infrared') return sourceAlpha * smoothstep(0.60, 0.88, high);
  const neutral = 1 - clamp((high - low) * 2.8);
  return sourceAlpha * smoothstep(0.58, 0.90, low) * neutral;
}

self.onmessage = event => {
  const { id, bitmap, width, height, mode } = event.data || {};
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const pixels = context.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = alphaAt(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2],
        pixels.data[i + 3], mode);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
      pixels.data[i + 3] = Math.round(255 * alpha);
    }
    context.putImageData(pixels, 0, 0);
    const result = canvas.transferToImageBitmap();
    self.postMessage({ id, result }, [result]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'WORKER_MASK_FAILED' });
  }
};

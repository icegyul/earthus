export function validateImsPng(bytes) {
  if (!bytes || bytes.length < 1024
      || bytes[0] !== 0x89 || bytes[1] !== 0x50
      || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error(`IMS_NOT_PNG:${bytes?.length || 0}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 2048) throw new Error(`IMS_IMAGE_WIDTH_MISMATCH:${width}`);
  if (height !== 1024) throw new Error(`IMS_IMAGE_HEIGHT_MISMATCH:${height}`);
  return Object.freeze({ width, height, bytes: bytes.length });
}

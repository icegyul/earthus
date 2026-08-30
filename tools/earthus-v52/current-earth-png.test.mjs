import test from 'node:test';
import assert from 'node:assert/strict';

import { validateImsPng } from '../../aws/current-earth-snow-ice/png-contract.mjs';

function pngHeader(width = 2048, height = 1024, byteLength = 1024) {
  const bytes = Buffer.alloc(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('valid sparse 2048x1024 IMS PNG is accepted below 10 KiB', () => {
  assert.deepEqual(validateImsPng(pngHeader()), { width: 2048, height: 1024, bytes: 1024 });
});

test('truncated or wrong-sized IMS image fails closed', () => {
  assert.throws(() => validateImsPng(pngHeader(1024, 1024)), /IMS_IMAGE_WIDTH_MISMATCH/);
  assert.throws(() => validateImsPng(Buffer.alloc(24)), /IMS_NOT_PNG/);
});

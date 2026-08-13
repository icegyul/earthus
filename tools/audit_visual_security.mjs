import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const index = fs.readFileSync('prototype/index.html', 'utf8');
const security = fs.readFileSync('prototype/js/satellite-security.js', 'utf8');
const registry = JSON.parse(fs.readFileSync('prototype/space/license-registry.v1.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync(
  'prototype/space/skybox/earthus-milky-way/sky-asset-manifest.v1.json', 'utf8'));

for (const [file, expected] of [
  ['/tmp/Cesium-1.143.0.js', '6pySA8bzGAn2+aYh8KWmvzl5DRnspbScFYUbrFcu2ayckTxx8gyn+/WNvNbPM9iG'],
  ['/tmp/satellite-6.0.2.min.js', 'J3D70NIZSVUuhQbp4W22OKF/xNWQjCEXmLxpnBp4CNDaQ+TbS1mmDZ2W3wlgqpKj'],
]) {
  if (fs.existsSync(file)) {
    const actual = crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64');
    assert.equal(actual, expected, `${file} SRI`);
  }
  assert.ok(index.includes(`integrity="sha384-${expected}"`));
}
assert.match(index, /name="referrer" content="strict-origin-when-cross-origin"/);
assert.match(security, /SATELLITE_PROVIDER_NOT_ALLOWED/);
assert.match(security, /maxDecodedBytes: 128 \* 1024 \* 1024/);
for (const provider of ['NOAA_GMGSI', 'GK2A', 'HIMAWARI_GIBS', 'SSEC_REALEARTH']) {
  assert.ok(registry.providers.some(item => item.id === provider), `${provider} license missing`);
}
assert.ok(registry.assets.some(item => item.id === manifest.processingVersion));
for (const item of manifest.variants) {
  const file = `prototype/space/skybox/earthus-milky-way/${item.file}`;
  assert.ok(fs.existsSync(file), `${item.file} missing`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), item.sha256);
}
console.log('visual security audit: SRI, input bounds, provider/license/asset hashes passed');

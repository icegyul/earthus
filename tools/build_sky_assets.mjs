import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const localRequire = createRequire(import.meta.url);
let sharp;
try { sharp = localRequire('sharp'); }
catch (error) {
  const modules = process.env.EARTHUS_NODE_MODULES;
  if (!modules) throw new Error('SHARP_REQUIRED: npm install sharp 또는 EARTHUS_NODE_MODULES 지정', { cause: error });
  sharp = createRequire(path.join(modules, 'package.json'))('sharp');
}

const SOURCE_URL = 'https://cdn.eso.org/images/large/eso0932a.jpg';
const SOURCE_PAGE = 'https://www.eso.org/public/images/eso0932a/';
const SOURCE_SHA256 = '60400c92c54b7c1bd12299c69e83b16e5b6256e7dabacc478c021758ecd28179';
const OUTPUT = path.resolve('prototype/space/skybox/earthus-milky-way');
const TRANSFORM = Object.freeze({ gamma: 1.25, brightness: 0.53, resample: 'lanczos3',
  webpQuality: 86, webpEffort: 6, sharpVersion: sharp.versions.sharp, scriptVersion: 'v1' });

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

async function sourceBuffer() {
  const sourceArg = process.argv.indexOf('--source');
  if (sourceArg >= 0) return fs.readFile(process.argv[sourceArg + 1]);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`SKY_SOURCE_HTTP_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function derive(source, width) {
  return sharp(source, { limitInputPixels: 40_000_000 })
    .gamma(TRANSFORM.gamma)
    .modulate({ brightness: TRANSFORM.brightness })
    .resize({ width, height: width / 2, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: TRANSFORM.webpQuality, effort: TRANSFORM.webpEffort, smartSubsample: false })
    .toBuffer();
}

const source = await sourceBuffer();
if (sha256(source) !== SOURCE_SHA256) throw new Error('SKY_SOURCE_HASH_MISMATCH');
const sourceMeta = await sharp(source).metadata();
if (sourceMeta.width !== 6000 || sourceMeta.height !== 3000) throw new Error('SKY_SOURCE_DIMENSION_MISMATCH');

const definitions = [['desktop-6k', 6000], ['desktop-4k', 4096], ['mobile-2k', 2048]];
const variants = [];
await fs.mkdir(OUTPUT, { recursive: true });
for (const [id, width] of definitions) {
  const buffer = await derive(source, width);
  const hash = sha256(buffer);
  const file = `panorama-${width}.${hash.slice(0, 16)}.webp`;
  await fs.writeFile(path.join(OUTPUT, file), buffer);
  variants.push({ id, width, height: width / 2, sha256: hash, file,
    bytes: buffer.length, mime: 'image/webp' });
}

const manifest = {
  schema: 'earthus.sky-asset.v1', processingVersion: 'earthus-milky-way-v1',
  source: { title: 'The Milky Way panorama', creator: 'ESO/S. Brunier',
    licenseId: 'CC-BY-4.0', pageUrl: SOURCE_PAGE, downloadUrl: SOURCE_URL,
    width: 6000, height: 3000, sha256: SOURCE_SHA256 },
  transform: TRANSFORM, variants,
};
const json = `${JSON.stringify(manifest, null, 2)}\n`;
await fs.writeFile(path.join(OUTPUT, 'sky-asset-manifest.v1.json'), json);
await fs.writeFile(path.join(OUTPUT, 'sky-asset-manifest.js'),
  `/* tools/build_sky_assets.mjs 생성물. 직접 편집하지 않는다. */\nexport const SKY_ASSET_MANIFEST = Object.freeze(${JSON.stringify(manifest, null, 2)});\n`);
process.stdout.write(`${json}`);

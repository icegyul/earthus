// Aetherus Astrometry Core — seeded feature-list plate solving.
//
// 첫 vertical slice는 브라우저/worker에서 실행 가능한 순수 계산과 서명 index 검증만
// 소유한다. 원본 이미지 source extraction, 외부 catalog ingestion, cloud solver는 아직 없다.
// 해가 하나 나온 것만으로 성공시키지 않고 hypothesis에 쓰지 않은 VALIDATION 별의
// residual까지 통과해야 VERIFIED가 된다.
//
// WCS 기준:
// - NASA FITS Support Office, FITS World Coordinate System
//   https://fits.gsfc.nasa.gov/fits_wcs.html
// - Greisen & Calabretta / Calabretta & Greisen FITS WCS Papers I·II

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const ARCSEC_PER_DEG = 3600;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const SAFE_ARTIFACT_PATH = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,191}$/;

export const ASTROMETRY_SOLVER_VERSION = 'aetherus-seeded-affine-v1';
export const ASTROMETRY_SCHEMAS = Object.freeze({
  request: 'earthus.astrometry-solve-request.v1',
  result: 'earthus.astrometry-solve-result.v1',
  wcs: 'earthus.astrometry-wcs.v1',
  indexManifest: 'earthus.astrometry-index-manifest.v1',
  indexShard: 'earthus.astrometry-index-shard.v1',
});

export const ASTROMETRY_TRUSTED_INDEX_KEYS = Object.freeze({
  // DEV fixture signer only. Production publication must use a separately approved,
  // rotatable offline signer and a replacement ADR before this trust root is promoted.
  'aetherus-astrometry-dev-fixture-20260812': Object.freeze({
    algorithm: 'Ed25519',
    scope: 'DEV_FIXTURE_ONLY',
    publicKeySpkiBase64: 'MCowBQYDK2VwAyEAKlV6AEEO8Q2mUdWWN2ugURUO479DGH/vid/xo1ISF0s=',
  }),
});

const STATE_TRANSITIONS = Object.freeze({
  QUEUED: Object.freeze(['EXTRACTING', 'CANCELLED', 'FAILED']),
  EXTRACTING: Object.freeze(['MATCHING', 'CANCELLED', 'FAILED']),
  MATCHING: Object.freeze(['FITTING', 'CANCELLED', 'FAILED']),
  FITTING: Object.freeze(['VERIFIED', 'CANCELLED', 'FAILED']),
  VERIFIED: Object.freeze([]),
  FAILED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap360 = value => ((value % 360) + 360) % 360;
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && !!value.trim();
const radians = value => Number(value) * DEG;
const degrees = value => Number(value) * RAD;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export class AstrometryContractError extends Error {
  constructor(code, path, message) {
    super(`${code}${path ? ` · ${path}` : ''}${message ? ` · ${message}` : ''}`);
    this.name = 'AstrometryContractError';
    this.code = code;
    this.path = path || null;
  }
}

const fail = (code, path, message) => {
  throw new AstrometryContractError(code, path, message);
};
const requireValue = (condition, code, path, message) => {
  if (!condition) fail(code, path, message);
};

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function utf8Bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
}

function base64Bytes(value) {
  requireValue(text(value), 'SIGNATURE_ENCODING_INVALID', 'signature', 'base64 text required');
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch (_) {
    fail('SIGNATURE_ENCODING_INVALID', 'signature', 'invalid base64');
  }
}

function cryptoApi(cryptoRef = globalThis.crypto) {
  requireValue(cryptoRef?.subtle, 'CRYPTO_UNAVAILABLE', 'crypto.subtle', 'Web Crypto required');
  return cryptoRef;
}

export async function sha256Hex(value, { cryptoRef = globalThis.crypto } = {}) {
  const digest = await cryptoApi(cryptoRef).subtle.digest('SHA-256', utf8Bytes(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function unsignedManifest(manifest) {
  const result = { ...manifest };
  delete result.signature;
  return result;
}

function validateManifestShape(manifest) {
  requireValue(isObject(manifest), 'INDEX_MANIFEST_INVALID', '$', 'object required');
  requireValue(manifest.schema === ASTROMETRY_SCHEMAS.indexManifest,
    'INDEX_SCHEMA_MISMATCH', 'schema', ASTROMETRY_SCHEMAS.indexManifest);
  requireValue(manifest.schemaVersion === 1, 'INDEX_SCHEMA_MISMATCH', 'schemaVersion', 'version 1 required');
  requireValue(ID_PATTERN.test(manifest.manifestId || ''), 'INDEX_MANIFEST_INVALID', 'manifestId', 'stable id required');
  requireValue(ID_PATTERN.test(manifest.revision || ''), 'INDEX_MANIFEST_INVALID', 'revision', 'stable revision required');
  requireValue(Array.isArray(manifest.solverCompatibility)
    && manifest.solverCompatibility.includes(ASTROMETRY_SOLVER_VERSION),
  'INDEX_SOLVER_INCOMPATIBLE', 'solverCompatibility', ASTROMETRY_SOLVER_VERSION);
  requireValue(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0,
    'INDEX_MANIFEST_INVALID', 'artifacts', 'non-empty array required');
  const paths = new Set();
  manifest.artifacts.forEach((artifact, index) => {
    const path = `artifacts[${index}]`;
    requireValue(isObject(artifact), 'INDEX_MANIFEST_INVALID', path, 'object required');
    requireValue(SAFE_ARTIFACT_PATH.test(artifact.path || '')
      && !artifact.path.startsWith('/')
      && !artifact.path.split('/').includes('..'),
    'INDEX_PATH_UNSAFE', `${path}.path`, 'relative safe path required');
    requireValue(!paths.has(artifact.path), 'INDEX_MANIFEST_INVALID', `${path}.path`, 'duplicate path');
    paths.add(artifact.path);
    requireValue(Number.isInteger(artifact.bytes) && artifact.bytes > 0,
      'INDEX_MANIFEST_INVALID', `${path}.bytes`, 'positive byte length required');
    requireValue(/^[a-f0-9]{64}$/.test(artifact.sha256 || ''),
      'INDEX_MANIFEST_INVALID', `${path}.sha256`, 'SHA-256 hex required');
    requireValue(ID_PATTERN.test(artifact.revision || ''),
      'INDEX_MANIFEST_INVALID', `${path}.revision`, 'revision required');
  });
  requireValue(isObject(manifest.signature), 'INDEX_SIGNATURE_MISSING', 'signature', 'detached signature required');
  requireValue(manifest.signature.algorithm === 'Ed25519',
    'INDEX_SIGNATURE_ALGORITHM_UNSUPPORTED', 'signature.algorithm', 'Ed25519 required');
  requireValue(ID_PATTERN.test(manifest.signature.keyId || ''),
    'INDEX_SIGNATURE_INVALID', 'signature.keyId', 'trusted key id required');
  requireValue(text(manifest.signature.valueBase64),
    'INDEX_SIGNATURE_INVALID', 'signature.valueBase64', 'signature required');
}

export async function verifyIndexManifest({
  manifest,
  artifacts,
  trustStore = ASTROMETRY_TRUSTED_INDEX_KEYS,
  cryptoRef = globalThis.crypto,
} = {}) {
  validateManifestShape(manifest);
  requireValue(isObject(artifacts), 'INDEX_ARTIFACTS_REQUIRED', 'artifacts', 'path-to-bytes map required');
  const verifiedArtifacts = {};
  for (const artifact of manifest.artifacts) {
    requireValue(Object.hasOwn(artifacts, artifact.path),
      'INDEX_ARTIFACT_MISSING', artifact.path, 'manifest artifact required');
    const bytes = utf8Bytes(artifacts[artifact.path]);
    requireValue(bytes.byteLength === artifact.bytes,
      'INDEX_LENGTH_MISMATCH', artifact.path, `${bytes.byteLength} != ${artifact.bytes}`);
    const digest = await sha256Hex(bytes, { cryptoRef });
    requireValue(digest === artifact.sha256,
      'INDEX_CHECKSUM_MISMATCH', artifact.path, `${digest} != ${artifact.sha256}`);
    verifiedArtifacts[artifact.path] = Object.freeze({
      path: artifact.path,
      revision: artifact.revision,
      bytes: bytes.byteLength,
      sha256: digest,
    });
  }
  const key = trustStore?.[manifest.signature.keyId];
  requireValue(key?.algorithm === 'Ed25519' && text(key.publicKeySpkiBase64),
    'INDEX_SIGNER_UNTRUSTED', 'signature.keyId', manifest.signature.keyId);
  let verified = false;
  try {
    const publicKey = await cryptoApi(cryptoRef).subtle.importKey(
      'spki',
      base64Bytes(key.publicKeySpkiBase64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    verified = await cryptoApi(cryptoRef).subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      base64Bytes(manifest.signature.valueBase64),
      utf8Bytes(canonicalJson(unsignedManifest(manifest))),
    );
  } catch (error) {
    if (error instanceof AstrometryContractError) throw error;
    fail('INDEX_SIGNATURE_VERIFIER_UNAVAILABLE', 'signature', error?.message || 'Ed25519 unavailable');
  }
  requireValue(verified, 'INDEX_SIGNATURE_INVALID', 'signature', 'detached signature did not verify');
  const manifestDigest = await sha256Hex(canonicalJson(unsignedManifest(manifest)), { cryptoRef });
  return deepFreeze({
    status: 'VERIFIED',
    schema: manifest.schema,
    manifestId: manifest.manifestId,
    revision: manifest.revision,
    manifestDigest,
    signer: Object.freeze({
      keyId: manifest.signature.keyId,
      algorithm: manifest.signature.algorithm,
      scope: key.scope || 'UNSPECIFIED',
    }),
    artifacts: verifiedArtifacts,
    provenance: manifest.provenance || null,
  });
}

function validateCatalogSource(source, index, path) {
  requireValue(isObject(source), 'INDEX_SHARD_INVALID', path, 'object required');
  requireValue(ID_PATTERN.test(source.id || ''), 'INDEX_SHARD_INVALID', `${path}.id`, 'stable id required');
  requireValue(finite(source.raDeg) && source.raDeg >= 0 && source.raDeg < 360,
    'INDEX_SHARD_INVALID', `${path}.raDeg`, '0 <= RA < 360 required');
  requireValue(finite(source.decDeg) && source.decDeg >= -90 && source.decDeg <= 90,
    'INDEX_SHARD_INVALID', `${path}.decDeg`, '-90 <= Dec <= 90 required');
  requireValue(['INDEX', 'VALIDATION'].includes(source.role),
    'INDEX_SHARD_INVALID', `${path}.role`, 'INDEX or VALIDATION required');
  return Object.freeze({
    id: source.id,
    raDeg: source.raDeg,
    decDeg: source.decDeg,
    role: source.role,
    magnitudeProxy: finite(source.magnitudeProxy) ? source.magnitudeProxy : null,
    order: index,
  });
}

export function openVerifiedIndexArtifact({
  artifactText,
  artifactPath,
  manifestVerification,
} = {}) {
  requireValue(manifestVerification?.status === 'VERIFIED',
    'INDEX_NOT_VERIFIED', 'manifestVerification', 'verified manifest required');
  const verification = manifestVerification.artifacts?.[artifactPath];
  requireValue(!!verification, 'INDEX_ARTIFACT_NOT_VERIFIED', artifactPath, 'artifact absent from manifest');
  let document;
  try { document = JSON.parse(artifactText); } catch (_) {
    fail('INDEX_SHARD_INVALID', artifactPath, 'valid JSON required');
  }
  requireValue(document.schema === ASTROMETRY_SCHEMAS.indexShard,
    'INDEX_SCHEMA_MISMATCH', 'schema', ASTROMETRY_SCHEMAS.indexShard);
  requireValue(document.schemaVersion === 1, 'INDEX_SCHEMA_MISMATCH', 'schemaVersion', 'version 1 required');
  requireValue(document.revision === verification.revision,
    'INDEX_REVISION_MISMATCH', 'revision', `${document.revision} != ${verification.revision}`);
  requireValue(Array.isArray(document.catalog) && document.catalog.length >= 8,
    'INDEX_SHARD_INVALID', 'catalog', 'at least 8 sources required');
  const catalog = document.catalog.map(validateCatalogSource);
  requireValue(new Set(catalog.map(source => source.id)).size === catalog.length,
    'INDEX_SHARD_INVALID', 'catalog', 'duplicate source id');
  requireValue(catalog.filter(source => source.role === 'INDEX').length >= 5,
    'INDEX_SHARD_INVALID', 'catalog', 'at least 5 INDEX sources required');
  requireValue(catalog.filter(source => source.role === 'VALIDATION').length >= 3,
    'INDEX_SHARD_INVALID', 'catalog', 'at least 3 VALIDATION sources required');
  return deepFreeze({
    schema: document.schema,
    schemaVersion: document.schemaVersion,
    indexId: document.indexId,
    revision: document.revision,
    coverage: document.coverage,
    catalog,
    provenance: document.provenance,
    rights: document.rights,
    verification: Object.freeze({
      status: 'VERIFIED',
      manifestId: manifestVerification.manifestId,
      manifestRevision: manifestVerification.revision,
      manifestDigest: manifestVerification.manifestDigest,
      artifactPath,
      artifactDigest: verification.sha256,
      signer: manifestVerification.signer,
    }),
  });
}

export function worldToTangent({ raDeg, decDeg, centerRaDeg, centerDecDeg }) {
  const ra = radians(raDeg);
  const dec = radians(decDeg);
  const ra0 = radians(centerRaDeg);
  const dec0 = radians(centerDecDeg);
  const delta = ra - ra0;
  const denominator = Math.sin(dec0) * Math.sin(dec)
    + Math.cos(dec0) * Math.cos(dec) * Math.cos(delta);
  if (!(denominator > 0)) fail('WCS_PROJECTION_OUTSIDE_HEMISPHERE', 'catalog', 'TAN denominator <= 0');
  return Object.freeze({
    xiDeg: degrees(Math.cos(dec) * Math.sin(delta) / denominator),
    etaDeg: degrees((Math.cos(dec0) * Math.sin(dec)
      - Math.sin(dec0) * Math.cos(dec) * Math.cos(delta)) / denominator),
  });
}

export function tangentToWorld({ xiDeg, etaDeg, centerRaDeg, centerDecDeg }) {
  const xi = radians(xiDeg);
  const eta = radians(etaDeg);
  const ra0 = radians(centerRaDeg);
  const dec0 = radians(centerDecDeg);
  const denominator = Math.cos(dec0) - eta * Math.sin(dec0);
  const ra = ra0 + Math.atan2(xi, denominator);
  const dec = Math.atan2(
    Math.sin(dec0) + eta * Math.cos(dec0),
    Math.hypot(denominator, xi),
  );
  return Object.freeze({ raDeg: wrap360(degrees(ra)), decDeg: degrees(dec) });
}

export function pixelToWorld(wcs, x, y) {
  requireValue(wcs?.schema === ASTROMETRY_SCHEMAS.wcs, 'WCS_INVALID', 'wcs.schema', 'WCS v1 required');
  const dx = Number(x) - wcs.crpix[0];
  const dy = Number(y) - wcs.crpix[1];
  return tangentToWorld({
    xiDeg: wcs.cd[0][0] * dx + wcs.cd[0][1] * dy,
    etaDeg: wcs.cd[1][0] * dx + wcs.cd[1][1] * dy,
    centerRaDeg: wcs.crval[0],
    centerDecDeg: wcs.crval[1],
  });
}

function normalizeFeature(feature, index) {
  requireValue(isObject(feature), 'FEATURE_LIST_INVALID', `featureList[${index}]`, 'object required');
  requireValue(ID_PATTERN.test(feature.id || ''), 'FEATURE_LIST_INVALID', `featureList[${index}].id`, 'stable id required');
  requireValue(finite(feature.x) && finite(feature.y),
    'FEATURE_LIST_INVALID', `featureList[${index}]`, 'finite x/y required');
  return Object.freeze({
    id: feature.id,
    x: feature.x,
    y: feature.y,
    flux: finite(feature.flux) ? feature.flux : 0,
    order: index,
  });
}

function normalizeRequest(request) {
  requireValue(isObject(request), 'SOLVE_REQUEST_INVALID', '$', 'object required');
  requireValue(request.schema === ASTROMETRY_SCHEMAS.request,
    'SOLVE_REQUEST_INVALID', 'schema', ASTROMETRY_SCHEMAS.request);
  requireValue(isObject(request.image), 'SOLVE_REQUEST_INVALID', 'image', 'image metadata required');
  requireValue(Number.isInteger(request.image.width) && request.image.width > 0
    && Number.isInteger(request.image.height) && request.image.height > 0,
  'SOLVE_REQUEST_INVALID', 'image', 'positive integer width/height required');
  requireValue(isObject(request.seed), 'SOLVE_REQUEST_INVALID', 'seed', 'seed required');
  requireValue(finite(request.seed.centerRaDeg) && request.seed.centerRaDeg >= 0 && request.seed.centerRaDeg < 360,
    'SOLVE_REQUEST_INVALID', 'seed.centerRaDeg', '0 <= RA < 360 required');
  requireValue(finite(request.seed.centerDecDeg) && request.seed.centerDecDeg > -90 && request.seed.centerDecDeg < 90,
    'SOLVE_REQUEST_INVALID', 'seed.centerDecDeg', '-90 < Dec < 90 required');
  requireValue(finite(request.seed.arcsecPerPixel) && request.seed.arcsecPerPixel > 0,
    'SOLVE_REQUEST_INVALID', 'seed.arcsecPerPixel', 'positive scale required');
  if (!Array.isArray(request.featureList)) {
    fail('FEATURE_EXTRACTION_NOT_IMPLEMENTED', 'featureList', 'initial slice accepts pre-extracted sources only');
  }
  requireValue(request.featureList.length >= 6,
    'INSUFFICIENT_SOURCES', 'featureList', 'at least 6 sources required');
  const features = request.featureList.map(normalizeFeature);
  requireValue(new Set(features.map(feature => feature.id)).size === features.length,
    'FEATURE_LIST_INVALID', 'featureList', 'duplicate feature id');
  return deepFreeze({
    schema: request.schema,
    image: Object.freeze({
      width: request.image.width,
      height: request.image.height,
      digest: text(request.image.digest) ? request.image.digest : null,
      originalUploadConsent: request.image.originalUploadConsent === true,
    }),
    seed: Object.freeze({
      centerRaDeg: request.seed.centerRaDeg,
      centerDecDeg: request.seed.centerDecDeg,
      arcsecPerPixel: request.seed.arcsecPerPixel,
      scaleToleranceFraction: clamp(finite(request.seed.scaleToleranceFraction)
        ? request.seed.scaleToleranceFraction : 0.22, 0.01, 1),
    }),
    featureList: features,
    options: Object.freeze({
      allowMirror: request.options?.allowMirror !== false,
      minIndexMatches: clamp(Number(request.options?.minIndexMatches) || 6, 5, 30),
      minValidationMatches: clamp(Number(request.options?.minValidationMatches) || 3, 3, 30),
      matchTolerancePixels: clamp(Number(request.options?.matchTolerancePixels) || 2.8, 0.5, 12),
      validationToleranceArcsec: clamp(Number(request.options?.validationToleranceArcsec) || 2.5, 0.1, 30),
      maxHypothesisFeatures: clamp(Number(request.options?.maxHypothesisFeatures) || 12, 6, 20),
      maxHypothesisCatalog: clamp(Number(request.options?.maxHypothesisCatalog) || 18, 6, 30),
    }),
  });
}

function transition(trace, next, detail = {}) {
  const current = trace.at(-1)?.state || 'QUEUED';
  requireValue(STATE_TRANSITIONS[current]?.includes(next),
    'SOLVE_TRANSITION_INVALID', `${current}->${next}`, 'transition not allowed');
  trace.push(Object.freeze({ state: next, ...detail }));
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = clamp(Math.ceil(fraction * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index];
}

function residualStats(valuesArcsec) {
  const values = [...valuesArcsec].sort((a, b) => a - b);
  if (!values.length) return Object.freeze({ count: 0, rmsArcsec: null, medianArcsec: null, p95Arcsec: null, maxArcsec: null });
  return Object.freeze({
    count: values.length,
    rmsArcsec: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
    medianArcsec: percentile(values, 0.5),
    p95Arcsec: percentile(values, 0.95),
    maxArcsec: values.at(-1),
  });
}

function pairList(points, point, minDistance) {
  const pairs = [];
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const a = point(points[first]);
      const b = point(points[second]);
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance >= minDistance) pairs.push({ first: points[first], second: points[second], distance });
    }
  }
  return pairs;
}

function similarityFromPairs(imageFirst, imageSecond, skyFirst, skySecond, mirrored) {
  const vx = imageSecond.x - imageFirst.x;
  const vy = imageSecond.y - imageFirst.y;
  const reflectedX = mirrored ? -vx : vx;
  const reflectedY = vy;
  const wx = skySecond.x - skyFirst.x;
  const wy = skySecond.y - skyFirst.y;
  const vLength = Math.hypot(reflectedX, reflectedY);
  const wLength = Math.hypot(wx, wy);
  if (!(vLength > 0 && wLength > 0)) return null;
  const scale = wLength / vLength;
  const cosine = (reflectedX * wx + reflectedY * wy) / (vLength * wLength);
  const sine = (reflectedX * wy - reflectedY * wx) / (vLength * wLength);
  const mirrorX = mirrored ? -1 : 1;
  const a = scale * cosine * mirrorX;
  const b = scale * -sine;
  const d = scale * sine * mirrorX;
  const e = scale * cosine;
  return Object.freeze({
    a, b, d, e,
    c: skyFirst.x - a * imageFirst.x - b * imageFirst.y,
    f: skyFirst.y - d * imageFirst.x - e * imageFirst.y,
  });
}

const applyTransform = (transform, point) => ({
  x: transform.a * point.x + transform.b * point.y + transform.c,
  y: transform.d * point.x + transform.e * point.y + transform.f,
});

function matchUnique(features, catalogPoints, transform, toleranceDeg, excludedFeatureIds = new Set()) {
  const candidates = [];
  features.forEach(feature => {
    if (excludedFeatureIds.has(feature.id)) return;
    const projected = applyTransform(transform, feature);
    catalogPoints.forEach(catalog => {
      const distanceDeg = Math.hypot(projected.x - catalog.x, projected.y - catalog.y);
      if (distanceDeg <= toleranceDeg) candidates.push({ feature, catalog, distanceDeg });
    });
  });
  candidates.sort((a, b) => a.distanceDeg - b.distanceDeg
    || a.feature.order - b.feature.order || a.catalog.order - b.catalog.order);
  const featureIds = new Set();
  const catalogIds = new Set();
  const matches = [];
  candidates.forEach(candidate => {
    if (featureIds.has(candidate.feature.id) || catalogIds.has(candidate.catalog.id)) return;
    featureIds.add(candidate.feature.id);
    catalogIds.add(candidate.catalog.id);
    matches.push(candidate);
  });
  return matches;
}

function solve3(matrix, vector) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let item = column; item < 4; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item < 4; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map(row => row[3]);
}

function fitAffine(matches) {
  if (matches.length < 3) return null;
  let xx = 0; let xy = 0; let yy = 0; let x = 0; let y = 0;
  let qx = 0; let qy = 0; let xqx = 0; let yqx = 0; let xqy = 0; let yqy = 0;
  matches.forEach(({ feature, catalog }) => {
    xx += feature.x * feature.x; xy += feature.x * feature.y; yy += feature.y * feature.y;
    x += feature.x; y += feature.y;
    qx += catalog.x; qy += catalog.y;
    xqx += feature.x * catalog.x; yqx += feature.y * catalog.x;
    xqy += feature.x * catalog.y; yqy += feature.y * catalog.y;
  });
  const normal = [[xx, xy, x], [xy, yy, y], [x, y, matches.length]];
  const first = solve3(normal, [xqx, yqx, qx]);
  const second = solve3(normal, [xqy, yqy, qy]);
  if (!first || !second) return null;
  return Object.freeze({ a: first[0], b: first[1], c: first[2], d: second[0], e: second[1], f: second[2] });
}

function transformKey(transform) {
  return [transform.a, transform.b, transform.d, transform.e]
    .map(value => value.toFixed(7)).concat([transform.c, transform.f].map(value => value.toFixed(4))).join(':');
}

function rankCandidate(left, right) {
  return right.indexMatches.length - left.indexMatches.length
    || left.indexResidual.rmsArcsec - right.indexResidual.rmsArcsec;
}

function candidateFromTransform(transform, features, indexCatalog, toleranceDeg) {
  let matches = matchUnique(features, indexCatalog, transform, toleranceDeg);
  if (matches.length < 3) return null;
  let fitted = fitAffine(matches);
  if (!fitted) return null;
  matches = matchUnique(features, indexCatalog, fitted, toleranceDeg);
  if (matches.length < 3) return null;
  fitted = fitAffine(matches) || fitted;
  const residuals = matches.map(match => {
    const projected = applyTransform(fitted, match.feature);
    return Math.hypot(projected.x - match.catalog.x, projected.y - match.catalog.y) * ARCSEC_PER_DEG;
  });
  return Object.freeze({
    transform: fitted,
    indexMatches: matches,
    indexResidual: residualStats(residuals),
  });
}

function solveHypotheses({ request, index, budgetMs, clock, signal }) {
  const startedAt = clock();
  const checkBudget = () => {
    if (signal?.aborted) fail('SOLVE_CANCELLED', 'signal', 'cancelled');
    if (clock() - startedAt > budgetMs) fail('LOCAL_BUDGET_EXCEEDED', 'budgetMs', String(budgetMs));
  };
  const features = [...request.featureList].sort((a, b) => b.flux - a.flux || a.order - b.order);
  const hypothesisFeatures = features.slice(0, request.options.maxHypothesisFeatures);
  const catalog = index.catalog.map(source => {
    const tangent = worldToTangent({
      raDeg: source.raDeg,
      decDeg: source.decDeg,
      centerRaDeg: request.seed.centerRaDeg,
      centerDecDeg: request.seed.centerDecDeg,
    });
    return Object.freeze({ ...source, x: tangent.xiDeg, y: tangent.etaDeg });
  });
  const indexCatalog = catalog.filter(source => source.role === 'INDEX')
    .slice(0, request.options.maxHypothesisCatalog);
  const validationCatalog = catalog.filter(source => source.role === 'VALIDATION');
  const scaleDeg = request.seed.arcsecPerPixel / ARCSEC_PER_DEG;
  const minScale = scaleDeg * (1 - request.seed.scaleToleranceFraction);
  const maxScale = scaleDeg * (1 + request.seed.scaleToleranceFraction);
  const toleranceDeg = request.options.matchTolerancePixels * scaleDeg;
  const imagePairs = pairList(hypothesisFeatures, point => point, 24);
  const skyPairs = pairList(indexCatalog, point => point, 24 * minScale);
  const rough = new Map();
  let evaluatedHypotheses = 0;
  for (const imagePair of imagePairs) {
    for (const skyPair of skyPairs) {
      const scale = skyPair.distance / imagePair.distance;
      if (scale < minScale || scale > maxScale) continue;
      for (const swapped of [false, true]) {
        const skyFirst = swapped ? skyPair.second : skyPair.first;
        const skySecond = swapped ? skyPair.first : skyPair.second;
        const mirrorModes = request.options.allowMirror ? [false, true] : [false];
        for (const mirrored of mirrorModes) {
          evaluatedHypotheses += 1;
          if ((evaluatedHypotheses & 255) === 0) checkBudget();
          const transform = similarityFromPairs(imagePair.first, imagePair.second, skyFirst, skySecond, mirrored);
          if (!transform) continue;
          const matches = matchUnique(features, indexCatalog, transform, toleranceDeg);
          if (matches.length < request.options.minIndexMatches) continue;
          const residual = residualStats(matches.map(match => match.distanceDeg * ARCSEC_PER_DEG));
          const key = transformKey(transform);
          const previous = rough.get(key);
          if (!previous || matches.length > previous.matches.length
            || (matches.length === previous.matches.length && residual.rmsArcsec < previous.residual.rmsArcsec)) {
            rough.set(key, { transform, matches, residual });
          }
        }
      }
    }
  }
  checkBudget();
  const roughRanked = [...rough.values()].sort((left, right) => right.matches.length - left.matches.length
    || left.residual.rmsArcsec - right.residual.rmsArcsec).slice(0, 64);
  const refined = new Map();
  roughRanked.forEach(item => {
    const candidate = candidateFromTransform(item.transform, features, indexCatalog, toleranceDeg);
    if (!candidate || candidate.indexMatches.length < request.options.minIndexMatches) return;
    const key = transformKey(candidate.transform);
    const previous = refined.get(key);
    if (!previous || rankCandidate(previous, candidate) > 0) refined.set(key, candidate);
  });
  const ranked = [...refined.values()].sort(rankCandidate);
  const verified = ranked.map(candidate => {
    const used = new Set(candidate.indexMatches.map(match => match.feature.id));
    const validationMatches = matchUnique(features, validationCatalog, candidate.transform,
      request.options.validationToleranceArcsec / ARCSEC_PER_DEG, used);
    const validationResidual = residualStats(validationMatches.map(match => match.distanceDeg * ARCSEC_PER_DEG));
    return Object.freeze({ ...candidate, validationMatches, validationResidual });
  }).filter(candidate => candidate.validationMatches.length >= request.options.minValidationMatches
    && candidate.validationResidual.p95Arcsec <= request.options.validationToleranceArcsec)
    .sort((left, right) => right.indexMatches.length - left.indexMatches.length
      || right.validationMatches.length - left.validationMatches.length
      || left.validationResidual.rmsArcsec - right.validationResidual.rmsArcsec
      || left.indexResidual.rmsArcsec - right.indexResidual.rmsArcsec);
  return Object.freeze({
    features,
    indexCatalog,
    validationCatalog,
    ranked,
    verified,
    evaluatedHypotheses,
    elapsedMs: clock() - startedAt,
  });
}

function materiallyDifferent(left, right, scaleDeg) {
  if (!left || !right) return false;
  const matrix = Math.max(
    Math.abs(left.a - right.a), Math.abs(left.b - right.b),
    Math.abs(left.d - right.d), Math.abs(left.e - right.e),
  );
  const translation = Math.hypot(left.c - right.c, left.f - right.f);
  return matrix > scaleDeg * 0.02 || translation > scaleDeg * 8;
}

function wcsFromCandidate(request, candidate) {
  const transform = candidate.transform;
  const determinant = transform.a * transform.e - transform.b * transform.d;
  requireValue(Math.abs(determinant) > 1e-14, 'WCS_SINGULAR', 'cd', 'non-singular transform required');
  const crpixX = (transform.b * transform.f - transform.e * transform.c) / determinant;
  const crpixY = (transform.d * transform.c - transform.a * transform.f) / determinant;
  return deepFreeze({
    schema: ASTROMETRY_SCHEMAS.wcs,
    projection: 'TAN',
    ctype: ['RA---TAN', 'DEC--TAN'],
    cunit: ['deg', 'deg'],
    radesys: 'ICRS',
    equinox: 2000,
    pixelConvention: 'FITS_1_BASED',
    crval: [request.seed.centerRaDeg, request.seed.centerDecDeg],
    crpix: [crpixX, crpixY],
    cd: [[transform.a, transform.b], [transform.d, transform.e]],
    mirrored: determinant < 0,
    distortion: null,
    precision: Object.freeze({
      tier: 'seeded-affine-verified',
      indexRmsArcsec: candidate.indexResidual.rmsArcsec,
      validationRmsArcsec: candidate.validationResidual.rmsArcsec,
      validationP95Arcsec: candidate.validationResidual.p95Arcsec,
      limitations: Object.freeze([
        'pre-extracted-feature-list-only',
        'linear-tan-no-sip-distortion-fit',
        'seed-center-and-scale-required',
      ]),
    }),
  });
}

function matchRecord(match) {
  return Object.freeze({
    featureId: match.feature.id,
    catalogId: match.catalog.id,
    role: match.catalog.role,
    residualArcsec: match.distanceDeg * ARCSEC_PER_DEG,
  });
}

function failureResult({ code, trace, inputDigest, index, elapsedMs, diagnostics = {} }) {
  const terminal = code === 'SOLVE_CANCELLED' ? 'CANCELLED' : 'FAILED';
  if (trace.at(-1)?.state !== terminal) transition(trace, terminal, { reason: code });
  return deepFreeze({
    schema: ASTROMETRY_SCHEMAS.result,
    status: terminal,
    reason: code,
    inputDigest,
    wcs: null,
    matchedSources: Object.freeze([]),
    residuals: null,
    stateTrace: trace,
    diagnostics: Object.freeze({
      solverVersion: ASTROMETRY_SOLVER_VERSION,
      indexRevision: index?.revision || null,
      elapsedMs,
      retryCount: 0,
      networkRequestCount: 0,
      originalUploadCount: 0,
      ...diagnostics,
    }),
  });
}

export async function runAstrometrySolveJob({
  request,
  index,
  budgetMs = 2500,
  clock = () => globalThis.performance?.now?.() ?? Date.now(),
  signal = null,
  cryptoRef = globalThis.crypto,
} = {}) {
  const trace = [Object.freeze({ state: 'QUEUED', event: 'Solve.Submitted' })];
  const jobStartedAt = clock();
  let normalized;
  let inputDigest = null;
  try {
    if (signal?.aborted) fail('SOLVE_CANCELLED', 'signal', 'cancelled before extraction');
    requireValue(index?.verification?.status === 'VERIFIED',
      'INDEX_NOT_VERIFIED', 'index.verification', 'verified index required');
    normalized = normalizeRequest(request);
    inputDigest = await sha256Hex({
      request: normalized,
      solverVersion: ASTROMETRY_SOLVER_VERSION,
      indexRevision: index.revision,
      indexDigest: index.verification.artifactDigest,
    }, { cryptoRef });
    transition(trace, 'EXTRACTING', { event: 'Solve.Extracting', inputKind: 'PRE_EXTRACTED_FEATURE_LIST' });
    transition(trace, 'MATCHING', { event: 'Solve.Matching' });
    const hypotheses = solveHypotheses({
      request: normalized,
      index,
      budgetMs,
      clock,
      signal,
    });
    if (!hypotheses.ranked.length) {
      return failureResult({
        code: 'NO_MATCH', trace, inputDigest, index, elapsedMs: clock() - jobStartedAt,
        diagnostics: { evaluatedHypotheses: hypotheses.evaluatedHypotheses },
      });
    }
    transition(trace, 'FITTING', { event: 'Solve.Fitting', candidateCount: hypotheses.ranked.length });
    if (!hypotheses.verified.length) {
      return failureResult({
        code: 'INDEPENDENT_VERIFICATION_FAILED', trace, inputDigest, index,
        elapsedMs: clock() - jobStartedAt,
        diagnostics: {
          evaluatedHypotheses: hypotheses.evaluatedHypotheses,
          bestIndexMatchCount: hypotheses.ranked[0].indexMatches.length,
          bestIndexRmsArcsec: hypotheses.ranked[0].indexResidual.rmsArcsec,
        },
      });
    }
    const best = hypotheses.verified[0];
    const second = hypotheses.verified[1];
    const scaleDeg = normalized.seed.arcsecPerPixel / ARCSEC_PER_DEG;
    const ambiguous = second
      && best.indexMatches.length === second.indexMatches.length
      && Math.abs(best.validationMatches.length - second.validationMatches.length) <= 1
      && Math.abs(best.validationResidual.rmsArcsec - second.validationResidual.rmsArcsec) <= 0.1
      && materiallyDifferent(best.transform, second.transform, scaleDeg);
    if (ambiguous) {
      return failureResult({
        code: 'AMBIGUOUS_MATCH', trace, inputDigest, index, elapsedMs: clock() - jobStartedAt,
        diagnostics: {
          evaluatedHypotheses: hypotheses.evaluatedHypotheses,
          verifiedCandidateCount: hypotheses.verified.length,
        },
      });
    }
    const wcs = wcsFromCandidate(normalized, best);
    transition(trace, 'VERIFIED', {
      event: 'Solve.Verified',
      indexMatches: best.indexMatches.length,
      validationMatches: best.validationMatches.length,
    });
    return deepFreeze({
      schema: ASTROMETRY_SCHEMAS.result,
      status: 'VERIFIED',
      reason: null,
      inputDigest,
      cacheKey: `${inputDigest}:${ASTROMETRY_SOLVER_VERSION}:${index.revision}`,
      wcs,
      matchedSources: [...best.indexMatches, ...best.validationMatches].map(matchRecord),
      residuals: Object.freeze({ index: best.indexResidual, independentValidation: best.validationResidual }),
      stateTrace: trace,
      diagnostics: Object.freeze({
        solverVersion: ASTROMETRY_SOLVER_VERSION,
        indexRevision: index.revision,
        indexArtifactDigest: index.verification.artifactDigest,
        indexManifestDigest: index.verification.manifestDigest,
        evaluatedHypotheses: hypotheses.evaluatedHypotheses,
        verifiedCandidateCount: hypotheses.verified.length,
        elapsedMs: clock() - jobStartedAt,
        retryCount: 0,
        networkRequestCount: 0,
        originalUploadCount: 0,
      }),
      provenance: Object.freeze({
        kind: 'calculated',
        sourceRevision: index.revision,
        solverRevision: ASTROMETRY_SOLVER_VERSION,
        source: index.provenance,
        signer: index.verification.signer,
        originalImageRetained: false,
      }),
    });
  } catch (error) {
    const code = error instanceof AstrometryContractError ? error.code : 'SOLVE_INTERNAL_ERROR';
    return failureResult({
      code, trace, inputDigest, index, elapsedMs: clock() - jobStartedAt,
      diagnostics: { errorPath: error?.path || null },
    });
  }
}

const CLOUD_ELIGIBLE_FAILURES = new Set([
  'NO_MATCH',
  'INDEPENDENT_VERIFICATION_FAILED',
  'LOCAL_BUDGET_EXCEEDED',
  'INDEX_NOT_VERIFIED',
]);

export function planOptionalCloudEscalation({
  localResult,
  explicitConsent = false,
  originalUploadConsent = false,
  networkAvailable = false,
  adapterConfigured = false,
} = {}) {
  const reason = localResult?.reason || null;
  const eligible = localResult?.status === 'FAILED' && CLOUD_ELIGIBLE_FAILURES.has(reason);
  if (!eligible) return deepFreeze({ status: 'NOT_ELIGIBLE', allowed: false, reason: 'LOCAL_RESULT_NOT_ELIGIBLE', requestCount: 0 });
  if (!explicitConsent) return deepFreeze({ status: 'CONSENT_REQUIRED', allowed: false, reason: 'EXPLICIT_CONSENT_REQUIRED', requestCount: 0 });
  if (!originalUploadConsent) return deepFreeze({ status: 'UPLOAD_CONSENT_REQUIRED', allowed: false, reason: 'ORIGINAL_UPLOAD_CONSENT_REQUIRED', requestCount: 0 });
  if (!networkAvailable) return deepFreeze({ status: 'OFFLINE', allowed: false, reason: 'NETWORK_UNAVAILABLE', requestCount: 0 });
  if (!adapterConfigured) return deepFreeze({
    status: 'PROPOSED_NOT_EXECUTED',
    allowed: false,
    reason: 'CLOUD_ADAPTER_NOT_IMPLEMENTED',
    requestCount: 0,
  });
  return deepFreeze({
    status: 'READY_FOR_EXPLICIT_ADAPTER',
    allowed: true,
    reason: null,
    requestCount: 0,
  });
}

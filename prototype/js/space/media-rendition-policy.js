// Aetherus user-observation rendition/queue v1 local shadow (Sheets 137-140, 239-240, 281).
// Plans and verifies deterministic work; it does not decode, resize, upload, schedule or retry by timer.

export const RENDITION_POLICY_SCHEMA = 'earthus.aetherus-rendition-policy.v1';
export const RENDITION_PLAN_SCHEMA = 'earthus.aetherus-rendition-plan.v1';
export const RENDITION_PROFILES = Object.freeze([
  { id: 'THUMBNAIL_512', maxWidth: 512 },
  { id: 'PREVIEW_1920', maxWidth: 1920 },
  { id: 'FOUR_K_3840', maxWidth: 3840 },
]);
const MIME = Object.freeze({ AVIF: 'image/avif', WEBP: 'image/webp', JPEG: 'image/jpeg' });

export class RenditionPolicyError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'RenditionPolicyError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new RenditionPolicyError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:-]{1,180}$/.test(output), code); return output;
};
const digest = value => {
  const output = String(value || '').toLowerCase();
  requireValue(/^[a-f0-9]{64}$/.test(output), 'RENDITION_DIGEST_REQUIRED'); return output;
};
const utc = value => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), 'RENDITION_UTC_REQUIRED');
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function validateRenditionPolicy(raw) {
  requireValue(raw?.schema === RENDITION_POLICY_SCHEMA, 'RENDITION_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw?.status), 'RENDITION_POLICY_STATUS_INVALID');
  const formats = raw?.formatPreference;
  requireValue(Array.isArray(formats) && formats.length > 0
    && formats.every(format => MIME[format]), 'RENDITION_FORMAT_POLICY_INVALID');
  requireValue(new Set(formats).size === formats.length && formats.at(-1) === 'JPEG',
    'RENDITION_JPEG_FALLBACK_REQUIRED');
  const deepZoom = raw?.deepZoom || {}, queue = raw?.queue || {};
  requireValue(Number.isInteger(deepZoom.tileSize) && deepZoom.tileSize >= 128
    && deepZoom.tileSize <= 1024 && Number.isInteger(deepZoom.overlap)
    && deepZoom.overlap >= 0 && deepZoom.overlap <= 16
    && Number.isInteger(deepZoom.minDimension) && deepZoom.minDimension >= 1024,
  'RENDITION_DEEP_ZOOM_POLICY_INVALID');
  requireValue(Boolean(MIME[deepZoom.format]), 'RENDITION_DEEP_ZOOM_FORMAT_INVALID');
  requireValue(Number.isInteger(queue.maxAttempts) && queue.maxAttempts >= 1 && queue.maxAttempts <= 10
    && Number.isInteger(queue.maxQueuedBytes) && queue.maxQueuedBytes > 0
    && Number.isInteger(queue.maxConcurrent) && queue.maxConcurrent > 0,
  'RENDITION_QUEUE_POLICY_INVALID');
  if (raw.productionEnabled === true) {
    requireValue(raw.status === 'APPROVED' && raw.approvedAt && raw.approvedBy,
      'RENDITION_PRODUCTION_POLICY_NOT_APPROVED');
  }
  return freeze({ schema: RENDITION_POLICY_SCHEMA, revision: String(raw.revision || ''),
    status: raw.status, productionEnabled: raw.productionEnabled === true,
    formatPreference: [...formats],
    deepZoom: { tileSize: deepZoom.tileSize, overlap: deepZoom.overlap,
      minDimension: deepZoom.minDimension, format: deepZoom.format },
    queue: { maxAttempts: queue.maxAttempts, maxQueuedBytes: queue.maxQueuedBytes,
      maxConcurrent: queue.maxConcurrent },
    approvedAt: raw.approvedAt ? utc(raw.approvedAt) : null,
    approvedBy: raw.approvedBy ? token(raw.approvedBy, 'RENDITION_APPROVER_INVALID') : null });
}

function selectFormat(policy, capabilities) {
  const supported = new Set(capabilities?.formats || []);
  const format = policy.formatPreference.find(candidate => supported.has(candidate));
  requireValue(format, 'RENDITION_NO_SUPPORTED_FORMAT'); return format;
}
function scaledDimensions(sourceWidth, sourceHeight, maxWidth) {
  const width = Math.min(sourceWidth, maxWidth);
  const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
  return freeze({ width, height, upscaled: false });
}
function deepZoomLevels(width, height, tileSize) {
  const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
  return Array.from({ length: maxLevel + 1 }, (_, level) => {
    const divisor = 2 ** (maxLevel - level);
    const levelWidth = Math.max(1, Math.ceil(width / divisor));
    const levelHeight = Math.max(1, Math.ceil(height / divisor));
    return freeze({ level, width: levelWidth, height: levelHeight,
      columns: Math.ceil(levelWidth / tileSize), rows: Math.ceil(levelHeight / tileSize) });
  });
}

export function buildRenditionPlan({ source, policy, capabilities, createdAt } = {}) {
  const normalizedPolicy = validateRenditionPolicy(policy);
  requireValue(source?.private === true && source?.immutable === true,
    'RENDITION_PRIVATE_IMMUTABLE_SOURCE_REQUIRED');
  const width = Number(source.width), height = Number(source.height), byteLength = Number(source.byteLength);
  requireValue(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
    && Number.isInteger(byteLength) && byteLength > 0, 'RENDITION_SOURCE_METADATA_INVALID');
  const sourceDigest = digest(source.contentDigest), format = selectFormat(normalizedPolicy, capabilities);
  const outputs = RENDITION_PROFILES.map(profile => freeze({
    id: profile.id, dimensions: scaledDimensions(width, height, profile.maxWidth),
    format, mimeType: MIME[format], sourceDigest,
    recipeRevision: normalizedPolicy.revision, checksumStatus: 'PENDING',
    exifGpsPresent: false, metadataPolicy: 'STRIP_LOCATION_AND_DEVICE_IDENTIFIERS',
    provenance: 'CALCULATED_DERIVATIVE',
  }));
  const deepZoomEnabled = Math.max(width, height) >= normalizedPolicy.deepZoom.minDimension;
  const deepZoom = deepZoomEnabled ? freeze({ schema: 'earthus.aetherus-deep-zoom-plan.v1',
    tileSize: normalizedPolicy.deepZoom.tileSize, overlap: normalizedPolicy.deepZoom.overlap,
    format: normalizedPolicy.deepZoom.format, mimeType: MIME[normalizedPolicy.deepZoom.format],
    levels: deepZoomLevels(width, height, normalizedPolicy.deepZoom.tileSize),
    sourceDigest, checksumStatus: 'PENDING', exifGpsPresent: false }) : null;
  return freeze({ schema: RENDITION_PLAN_SCHEMA, sourceAssetId: token(source.assetId,
    'RENDITION_SOURCE_ASSET_ID_REQUIRED'), sourceDigest, sourceByteLength: byteLength,
    createdAt: utc(createdAt), policyRevision: normalizedPolicy.revision,
    productionAllowed: normalizedPolicy.status === 'APPROVED' && normalizedPolicy.productionEnabled,
    outputs, deepZoom,
    limitations: ['PLAN_ONLY_NOT_PIXEL_VERIFICATION', 'NO_AUTOMATIC_UPLOAD_OR_RETRY'] });
}

export function createRenditionJob({ jobId, plan, createdAt } = {}) {
  requireValue(plan?.schema === RENDITION_PLAN_SCHEMA, 'RENDITION_PLAN_REQUIRED');
  return freeze({ schema: 'earthus.aetherus-rendition-job.v1',
    id: token(jobId, 'RENDITION_JOB_ID_REQUIRED'), state: 'QUEUED', revision: 1, attempts: 0,
    plan, createdAt: utc(createdAt), updatedAt: utc(createdAt), failure: null,
    result: null, history: [{ from: null, to: 'QUEUED', at: utc(createdAt) }] });
}

export function admitRenditionJob({ job, queueState, policy } = {}) {
  const normalizedPolicy = validateRenditionPolicy(policy);
  requireValue(job?.state === 'QUEUED', 'RENDITION_JOB_NOT_QUEUED');
  const queuedBytes = Number(queueState?.queuedBytes), running = Number(queueState?.running);
  requireValue(Number.isInteger(queuedBytes) && queuedBytes >= 0
    && Number.isInteger(running) && running >= 0, 'RENDITION_QUEUE_STATE_INVALID');
  const overBytes = queuedBytes + job.plan.sourceByteLength > normalizedPolicy.queue.maxQueuedBytes;
  const overConcurrent = running >= normalizedPolicy.queue.maxConcurrent;
  return freeze({ accepted: !overBytes && !overConcurrent,
    state: overBytes || overConcurrent ? 'BACKPRESSURE' : 'ADMITTED',
    reason: overBytes ? 'MAX_QUEUED_BYTES' : overConcurrent ? 'MAX_CONCURRENT' : 'WITHIN_LIMITS' });
}

function transition(job, to, at, patch = {}) {
  return freeze({ ...job, ...patch, state: to, revision: job.revision + 1,
    updatedAt: utc(at), history: [...job.history, { from: job.state, to, at: utc(at) }] });
}

export function startRenditionJob(job, { at } = {}) {
  requireValue(job?.state === 'QUEUED', 'RENDITION_START_STATE_INVALID');
  return transition(job, 'RUNNING', at, { attempts: job.attempts + 1, failure: null });
}
export function failRenditionJob(job, { at, code, policy } = {}) {
  requireValue(job?.state === 'RUNNING', 'RENDITION_FAIL_STATE_INVALID');
  const normalizedPolicy = validateRenditionPolicy(policy);
  const terminal = job.attempts >= normalizedPolicy.queue.maxAttempts;
  return transition(job, terminal ? 'DEAD_LETTER' : 'FAILED', at, {
    failure: { code: token(code, 'RENDITION_FAILURE_CODE_REQUIRED'), retryAutomatic: false },
  });
}
export function retryRenditionJob(job, { at, explicitOperatorAction } = {}) {
  requireValue(job?.state === 'FAILED', 'RENDITION_RETRY_STATE_INVALID');
  requireValue(explicitOperatorAction === true, 'RENDITION_EXPLICIT_RETRY_REQUIRED');
  return transition(job, 'QUEUED', at, { failure: null });
}

export function completeRenditionJob(job, { at, receipts } = {}) {
  requireValue(job?.state === 'RUNNING', 'RENDITION_COMPLETE_STATE_INVALID');
  requireValue(Array.isArray(receipts), 'RENDITION_RECEIPTS_REQUIRED');
  const expected = new Set(job.plan.outputs.map(output => output.id));
  if (job.plan.deepZoom) expected.add('DEEP_ZOOM');
  const normalized = receipts.map(receipt => ({ id: token(receipt.id, 'RENDITION_RECEIPT_ID_REQUIRED'),
    contentDigest: digest(receipt.contentDigest), byteLength: Number(receipt.byteLength),
    exifGpsPresent: receipt.exifGpsPresent }));
  requireValue(normalized.every(receipt => Number.isInteger(receipt.byteLength) && receipt.byteLength > 0
    && receipt.exifGpsPresent === false), 'RENDITION_RECEIPT_INVALID');
  requireValue(new Set(normalized.map(receipt => receipt.id)).size === expected.size
    && normalized.every(receipt => expected.has(receipt.id))
    && [...expected].every(id => normalized.some(receipt => receipt.id === id)),
  'RENDITION_RECEIPTS_INCOMPLETE');
  return transition(job, 'SUCCEEDED', at, { result: { receipts: normalized }, failure: null });
}

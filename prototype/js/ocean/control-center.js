// My Ocean Control Center v1 local contract.
// Ocean widget/layout state only; Aetherus Mission Control state and exact coordinates are forbidden.

export const MY_OCEAN_LAYOUT_SCHEMA = 'earthus.my-ocean-layout.v1';
export const MY_OCEAN_WIDGETS = Object.freeze([
  'SAFETY', 'SURF', 'FISHING', 'MARINE_LIFE', 'DIVE', 'VESSEL',
]);
export const MY_OCEAN_TEMPLATES = Object.freeze({
  OCEAN_OVERVIEW: ['SAFETY', 'SURF', 'FISHING', 'MARINE_LIFE', 'DIVE', 'VESSEL'],
  SURF_DAY: ['SAFETY', 'SURF'],
  FISHING_DAY: ['SAFETY', 'FISHING'],
  MARINE_LOG: ['SAFETY', 'MARINE_LIFE'],
  DIVE_LOG: ['SAFETY', 'DIVE'],
  VESSEL_LITE: ['SAFETY', 'VESSEL'],
});

export class MyOceanError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'MyOceanError'; this.code = code; this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new MyOceanError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:~-]{1,180}$/.test(output), code); return output;
};
const utc = value => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), 'MY_OCEAN_UTC_REQUIRED');
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
const clone = value => globalThis.structuredClone
  ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

async function sha256(value) {
  requireValue(globalThis.crypto?.subtle?.digest, 'MY_OCEAN_WEBCRYPTO_REQUIRED');
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hasForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  const forbidden = new Set(['lat', 'latitude', 'lon', 'lng', 'longitude', 'observer', 'ephemeris',
    'missionid', 'mission_id', 'missioncontrol', 'mission_control', 'aetherusroute', 'aetherus_route']);
  return Object.entries(value).some(([key, item]) => forbidden.has(String(key).toLowerCase())
    || hasForbiddenKey(item));
}

function normalizeWidgets(widgets) {
  requireValue(Array.isArray(widgets) && widgets.length > 0 && widgets.length <= 12,
    'MY_OCEAN_WIDGETS_REQUIRED');
  const ids = new Set();
  const normalized = widgets.map((widget, index) => {
    const id = token(widget?.id || `widget-${index + 1}`, 'MY_OCEAN_WIDGET_ID_REQUIRED');
    requireValue(!ids.has(id), 'MY_OCEAN_WIDGET_ID_DUPLICATE'); ids.add(id);
    requireValue(MY_OCEAN_WIDGETS.includes(widget?.type), 'MY_OCEAN_WIDGET_TYPE_INVALID');
    requireValue(!hasForbiddenKey(widget?.config), 'MY_OCEAN_WIDGET_PRIVATE_OR_AETHERUS_STATE_FORBIDDEN');
    const x = Number(widget?.x), y = Number(widget?.y), width = Number(widget?.width), height = Number(widget?.height);
    requireValue([x, y, width, height].every(Number.isInteger)
      && x >= 0 && y >= 0 && width >= 1 && height >= 1 && x + width <= 12 && y + height <= 60,
    'MY_OCEAN_WIDGET_GEOMETRY_INVALID');
    return { id, type: widget.type, x, y, width, height,
      config: widget.config && typeof widget.config === 'object' ? clone(widget.config) : {} };
  });
  requireValue(normalized[0]?.type === 'SAFETY'
    && normalized.filter(widget => widget.type === 'SAFETY').length === 1,
  'MY_OCEAN_SAFETY_WIDGET_MUST_BE_FIRST_AND_SINGLE');
  normalized.forEach((widget, index) => {
    const overlaps = normalized.slice(index + 1).some(other => !(
      widget.x + widget.width <= other.x || other.x + other.width <= widget.x
      || widget.y + widget.height <= other.y || other.y + other.height <= widget.y
    ));
    requireValue(!overlaps, 'MY_OCEAN_WIDGET_GEOMETRY_OVERLAP');
  });
  return freeze(normalized);
}

function templateWidgets(templateId) {
  const types = MY_OCEAN_TEMPLATES[templateId];
  requireValue(types, 'MY_OCEAN_TEMPLATE_INVALID');
  if (types.length === 2) {
    return types.map((type, index) => ({ id: `${type.toLowerCase()}-${index + 1}`, type,
      x: 0, y: index * 4, width: 12, height: 4, config: {} }));
  }
  return types.map((type, index) => ({ id: `${type.toLowerCase()}-${index + 1}`, type,
    x: index % 2 ? 6 : 0, y: Math.floor(index / 2) * 4,
    width: 6, height: 4, config: {} }));
}

function entitlementState(value, nowMs) {
  if (value?.plan === 'FREE') return 'FREE';
  const expires = Date.parse(value?.expiresAt || '');
  if (value?.plan === 'PRO' && Number.isFinite(expires) && expires > nowMs) return 'ACTIVE';
  return 'EXPIRED';
}

export function createMemoryMyOceanRepository() {
  const layouts = new Map(), commands = new Map();
  const key = (ownerId, layoutId) => `${ownerId}:${layoutId}`;
  return Object.freeze({
    kind: 'MEMORY_FIXTURE',
    async read(ownerId, layoutId) {
      const value = layouts.get(key(ownerId, layoutId)); return value ? freeze(clone(value)) : null;
    },
    async write(value) { layouts.set(key(value.ownerId, value.id), clone(value)); return freeze(clone(value)); },
    async list(ownerId) { return freeze([...layouts.values()].filter(item => item.ownerId === ownerId).map(clone)); },
    async delete(ownerId, layoutId) { return layouts.delete(key(ownerId, layoutId)); },
    async command(commandId) { const value = commands.get(commandId); return value ? freeze(clone(value)) : null; },
    async writeCommand(value) { requireValue(!commands.has(value.id), 'MY_OCEAN_COMMAND_EXISTS');
      commands.set(value.id, clone(value)); },
  });
}

export function createMyOceanService({ repository, now = () => new Date(), idFactory = null } = {}) {
  requireValue(repository?.read && repository?.write && repository?.command,
    'MY_OCEAN_REPOSITORY_REQUIRED');
  const makeId = prefix => idFactory ? idFactory(prefix)
    : `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const owned = async (ownerId, layoutId) => {
    const owner = token(ownerId, 'MY_OCEAN_OWNER_REQUIRED');
    const layout = await repository.read(owner, token(layoutId, 'MY_OCEAN_LAYOUT_ID_REQUIRED'));
    requireValue(layout, 'MY_OCEAN_LAYOUT_NOT_FOUND'); return layout;
  };
  async function idempotent(idempotencyKey, payload, action) {
    const id = token(idempotencyKey, 'MY_OCEAN_IDEMPOTENCY_KEY_REQUIRED');
    const payloadDigest = await sha256(payload); const previous = await repository.command(id);
    if (previous) {
      requireValue(previous.payloadDigest === payloadDigest, 'MY_OCEAN_IDEMPOTENCY_CONFLICT');
      return freeze({ status: 'DUPLICATE', result: previous.result });
    }
    const result = await action();
    await repository.writeCommand({ id, payloadDigest, result: clone(result) });
    return freeze({ status: 'APPLIED', result });
  }

  return Object.freeze({
    async createLayout({ layoutId = null, ownerId, templateId = 'OCEAN_OVERVIEW',
      deviceId, entitlement, idempotencyKey } = {}) {
      const id = token(layoutId || makeId('ocean-layout'), 'MY_OCEAN_LAYOUT_ID_REQUIRED');
      const owner = token(ownerId, 'MY_OCEAN_OWNER_REQUIRED');
      const device = token(deviceId, 'MY_OCEAN_DEVICE_REQUIRED');
      return idempotent(idempotencyKey, { type: 'create', id, owner, templateId, device }, async () => {
        requireValue(!(await repository.read(owner, id)), 'MY_OCEAN_LAYOUT_EXISTS');
        const state = entitlementState(entitlement, now().getTime());
        requireValue(state !== 'EXPIRED', 'MY_OCEAN_CREATE_ENTITLEMENT_EXPIRED');
        const createdAt = utc(now());
        return repository.write(freeze({ schema: MY_OCEAN_LAYOUT_SCHEMA, id, ownerId: owner,
          revision: 1, parentRevision: 0, templateId, widgets: normalizeWidgets(templateWidgets(templateId)),
          createdByDevice: device, updatedByDevice: device, createdAt, updatedAt: createdAt,
          entitlementAtWrite: state, cacheControl: 'private, no-store', shareState: 'PRIVATE' }));
      });
    },

    async saveLayout({ layoutId, ownerId, expectedRevision, widgets, deviceId,
      entitlement, idempotencyKey } = {}) {
      const current = await owned(ownerId, layoutId);
      const device = token(deviceId, 'MY_OCEAN_DEVICE_REQUIRED');
      requireValue(Number.isInteger(expectedRevision) && expectedRevision >= 1,
        'MY_OCEAN_EXPECTED_REVISION_REQUIRED');
      return idempotent(idempotencyKey, { type: 'save', layoutId, ownerId, expectedRevision,
        widgets, device }, async () => {
        const state = entitlementState(entitlement, now().getTime());
        requireValue(state !== 'EXPIRED', 'MY_OCEAN_EDIT_ENTITLEMENT_EXPIRED');
        const normalized = normalizeWidgets(widgets);
        if (current.revision !== expectedRevision) {
          const conflictId = token(`${current.id}~${device}~r${expectedRevision}`,
            'MY_OCEAN_CONFLICT_ID_INVALID');
          const conflict = freeze({ ...current, id: conflictId, revision: 1, parentRevision: expectedRevision,
            widgets: normalized, updatedByDevice: device, updatedAt: utc(now()),
            conflictOf: current.id, conflictState: 'KEEP_BOTH', entitlementAtWrite: state });
          await repository.write(conflict);
          return freeze({ status: 'CONFLICT_KEEP_BOTH', canonical: current, conflict });
        }
        const next = freeze({ ...current, revision: current.revision + 1,
          parentRevision: current.revision, widgets: normalized, updatedByDevice: device,
          updatedAt: utc(now()), entitlementAtWrite: state });
        await repository.write(next); return freeze({ status: 'SAVED', layout: next });
      });
    },

    async loadLayout({ layoutId, ownerId } = {}) { return owned(ownerId, layoutId); },
    async listLayouts({ ownerId } = {}) {
      return repository.list(token(ownerId, 'MY_OCEAN_OWNER_REQUIRED'));
    },
    async exportLayout({ layoutId, ownerId } = {}) {
      const layout = await owned(ownerId, layoutId);
      const body = canonicalJson(layout); return freeze({ schema: 'earthus.my-ocean-export.v1',
        layout, sha256: await sha256(body), byteLength: new TextEncoder().encode(body).byteLength,
        cacheControl: 'private, no-store', exportedAt: utc(now()) });
    },
    async deleteLayout({ layoutId, ownerId, explicitHumanConfirmation } = {}) {
      requireValue(explicitHumanConfirmation === true, 'MY_OCEAN_DELETE_CONFIRMATION_REQUIRED');
      const layout = await owned(ownerId, layoutId); await repository.delete(layout.ownerId, layout.id);
      return freeze({ schema: 'earthus.my-ocean-deletion-receipt.v1', layoutId: layout.id,
        ownerId: layout.ownerId, lastRevision: layout.revision, deletedAt: utc(now()), status: 'DELETED' });
    },
    entitlementState,
  });
}

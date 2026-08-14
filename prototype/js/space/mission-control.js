// Aetherus My Mission Control v1 local shadow (Sheets 115-132).
// Separate from My Ocean; no live-provider fetch, notification dispatch, payment, timers or animation.

export const MISSION_CONTROL_SCHEMA = 'earthus.aetherus-mission-control-room.v1';
export const MISSION_CONTROL_POLICY_SCHEMA = 'earthus.aetherus-mission-control-policy.v1';
export const MISSION_WIDGET_TYPES = Object.freeze([
  'CENTRAL_EARTH', 'FOLLOWING', 'NEXT_LAUNCH', 'LIVE', 'COUNTDOWN', 'MISSION_TIMELINE',
  'PAYLOAD_STATUS', 'SATELLITE_PASS', 'SPACE_WEATHER', 'EARTH_WEATHER', 'AURORA',
  'KOREA_SPACE', 'SPACEX', 'STARSHIP', 'JWST',
]);

export class MissionControlError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'MissionControlError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new MissionControlError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:~-]{1,180}$/.test(output), code); return output;
};
const utc = (value, code = 'MISSION_CONTROL_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
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
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
async function sha256(value) {
  requireValue(globalThis.crypto?.subtle?.digest, 'MISSION_CONTROL_WEBCRYPTO_REQUIRED');
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonical(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateMissionControlPolicy(raw) {
  requireValue(raw?.schema === MISSION_CONTROL_POLICY_SCHEMA, 'MISSION_CONTROL_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw?.status), 'MISSION_CONTROL_POLICY_STATUS_INVALID');
  const maxRooms = Number(raw.maxRooms), maxWidgets = Number(raw.maxWidgetsPerRoom);
  requireValue(Number.isInteger(maxRooms) && maxRooms >= 1 && maxRooms <= 24,
    'MISSION_CONTROL_MAX_ROOMS_INVALID');
  requireValue(Number.isInteger(maxWidgets) && maxWidgets >= 1 && maxWidgets <= 24,
    'MISSION_CONTROL_MAX_WIDGETS_INVALID');
  const feature = token(raw.editFeature, 'MISSION_CONTROL_EDIT_FEATURE_REQUIRED');
  if (raw.productionEnabled === true) {
    requireValue(raw.status === 'APPROVED' && raw.approvedAt && raw.approvedBy,
      'MISSION_CONTROL_PRODUCTION_POLICY_NOT_APPROVED');
  }
  return freeze({ schema: MISSION_CONTROL_POLICY_SCHEMA, revision: String(raw.revision || ''),
    status: raw.status, productionEnabled: raw.productionEnabled === true,
    editFeature: feature, maxRooms, maxWidgetsPerRoom: maxWidgets,
    approvedAt: raw.approvedAt ? utc(raw.approvedAt) : null,
    approvedBy: raw.approvedBy ? token(raw.approvedBy, 'MISSION_CONTROL_APPROVER_INVALID') : null });
}

const FORBIDDEN_CONFIG_KEYS = new Set([
  'lat', 'latitude', 'lon', 'lng', 'longitude', 'ocean', 'oceanscore', 'fishingpoint',
  'marineobservation', 'exactlocation',
]);
function hasForbiddenConfig(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => FORBIDDEN_CONFIG_KEYS.has(
    String(key).replaceAll('_', '').toLowerCase()) || hasForbiddenConfig(item));
}

function normalizeWidgets(widgets, maxWidgets) {
  requireValue(Array.isArray(widgets) && widgets.length > 0 && widgets.length <= maxWidgets,
    'MISSION_CONTROL_WIDGETS_INVALID');
  const ids = new Set();
  const normalized = widgets.map((widget, index) => {
    const id = token(widget?.id || `widget-${index + 1}`, 'MISSION_CONTROL_WIDGET_ID_REQUIRED');
    requireValue(!ids.has(id), 'MISSION_CONTROL_WIDGET_ID_DUPLICATE'); ids.add(id);
    requireValue(MISSION_WIDGET_TYPES.includes(widget?.type), 'MISSION_CONTROL_WIDGET_TYPE_INVALID');
    requireValue(!hasForbiddenConfig(widget?.config), 'MISSION_CONTROL_PRIVATE_OR_OCEAN_STATE_FORBIDDEN');
    const x = Number(widget.x), y = Number(widget.y), width = Number(widget.width), height = Number(widget.height);
    requireValue([x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0
      && width >= 1 && height >= 1 && x + width <= 12 && y + height <= 80,
    'MISSION_CONTROL_WIDGET_GEOMETRY_INVALID');
    return { id, type: widget.type, x, y, width, height,
      config: widget.config && typeof widget.config === 'object' ? clone(widget.config) : {} };
  });
  const central = normalized.filter(widget => widget.type === 'CENTRAL_EARTH');
  requireValue(central.length === 1 && normalized[0].type === 'CENTRAL_EARTH',
    'MISSION_CONTROL_CENTRAL_EARTH_FIRST_AND_SINGLE');
  const centralArea = central[0].width * central[0].height;
  requireValue(central[0].width >= 6 && central[0].height >= 6
    && normalized.every(widget => widget === central[0]
      || widget.width * widget.height <= centralArea), 'MISSION_CONTROL_EARTH_NOT_DOMINANT');
  normalized.forEach((widget, index) => {
    const overlaps = normalized.slice(index + 1).some(other => !(
      widget.x + widget.width <= other.x || other.x + other.width <= widget.x
      || widget.y + widget.height <= other.y || other.y + other.height <= widget.y));
    requireValue(!overlaps, 'MISSION_CONTROL_WIDGET_OVERLAP');
  });
  return freeze(normalized);
}

const widget = (type, x, y, width, height, config = {}) => ({
  id: `${type.toLowerCase().replaceAll('_', '-')}-1`, type, x, y, width, height, config,
});
export const MISSION_CONTROL_TEMPLATES = Object.freeze({
  SPACE_CONTROL: Object.freeze([
    widget('CENTRAL_EARTH', 3, 0, 6, 8), widget('FOLLOWING', 0, 0, 3, 8),
    widget('LIVE', 9, 0, 3, 4), widget('COUNTDOWN', 9, 4, 3, 4),
    widget('NEXT_LAUNCH', 0, 8, 3, 4), widget('SATELLITE_PASS', 3, 8, 3, 4),
    widget('SPACE_WEATHER', 6, 8, 3, 4), widget('MISSION_TIMELINE', 9, 8, 3, 4),
    widget('EARTH_WEATHER', 0, 12, 3, 4), widget('PAYLOAD_STATUS', 3, 12, 3, 4),
    widget('KOREA_SPACE', 6, 12, 3, 4), widget('SPACEX', 9, 12, 3, 4),
  ]),
  WEATHER_CENTER: Object.freeze([
    widget('CENTRAL_EARTH', 3, 0, 6, 8), widget('FOLLOWING', 0, 0, 3, 8),
    widget('SPACE_WEATHER', 9, 0, 3, 4), widget('EARTH_WEATHER', 9, 4, 3, 4),
    widget('AURORA', 0, 8, 6, 4), widget('SATELLITE_PASS', 6, 8, 6, 4),
  ]),
  SATELLITE_TRACKING: Object.freeze([
    widget('CENTRAL_EARTH', 3, 0, 6, 8), widget('FOLLOWING', 0, 0, 3, 8),
    widget('SATELLITE_PASS', 9, 0, 3, 4), widget('PAYLOAD_STATUS', 9, 4, 3, 4),
    widget('NEXT_LAUNCH', 0, 8, 6, 4), widget('MISSION_TIMELINE', 6, 8, 6, 4),
  ]),
  ASTRONOMY_LAB: Object.freeze([
    widget('CENTRAL_EARTH', 3, 0, 6, 8), widget('FOLLOWING', 0, 0, 3, 8),
    widget('JWST', 9, 0, 3, 4), widget('SATELLITE_PASS', 9, 4, 3, 4),
    widget('SPACE_WEATHER', 0, 8, 6, 4), widget('AURORA', 6, 8, 6, 4),
  ]),
});

function templateWidgets(templateId, maxWidgets) {
  const items = MISSION_CONTROL_TEMPLATES[templateId];
  requireValue(items, 'MISSION_CONTROL_TEMPLATE_INVALID');
  return normalizeWidgets(items, maxWidgets);
}

function assertEdit(policy, entitlement, nowMs) {
  requireValue(policy.status === 'APPROVED' && policy.productionEnabled,
    'MISSION_CONTROL_EDIT_POLICY_CLOSED');
  requireValue(entitlement?.status === 'ACTIVE'
    && Array.isArray(entitlement.features)
    && entitlement.features.includes(policy.editFeature), 'MISSION_CONTROL_EDIT_ENTITLEMENT_REQUIRED');
  requireValue(Date.parse(entitlement.expiresAt || '') > nowMs,
    'MISSION_CONTROL_ENTITLEMENT_EXPIRY_REQUIRED');
}

export function createMemoryMissionControlRepository() {
  const rooms = new Map(), commands = new Map();
  const key = (ownerId, id) => `${ownerId}:${id}`;
  return Object.freeze({
    kind: 'MEMORY_FIXTURE',
    async read(ownerId, id) { const value = rooms.get(key(ownerId, id));
      return value ? freeze(clone(value)) : null; },
    async list(ownerId) { return freeze([...rooms.values()].filter(room => room.ownerId === ownerId).map(clone)); },
    async write(room) { rooms.set(key(room.ownerId, room.id), clone(room)); return freeze(clone(room)); },
    async delete(ownerId, id) { return rooms.delete(key(ownerId, id)); },
    async command(id) { const value = commands.get(id); return value ? freeze(clone(value)) : null; },
    async writeCommand(value) { requireValue(!commands.has(value.id), 'MISSION_CONTROL_COMMAND_EXISTS');
      commands.set(value.id, clone(value)); },
  });
}

export function createMissionControlService({ repository, policy, now = () => new Date(),
  idFactory = null } = {}) {
  requireValue(repository?.read && repository?.write && repository?.list && repository?.command,
    'MISSION_CONTROL_REPOSITORY_REQUIRED');
  const normalizedPolicy = validateMissionControlPolicy(policy);
  const makeId = prefix => idFactory ? idFactory(prefix)
    : `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const owned = async (ownerId, roomId) => {
    const owner = token(ownerId, 'MISSION_CONTROL_OWNER_REQUIRED');
    const room = await repository.read(owner, token(roomId, 'MISSION_CONTROL_ROOM_ID_REQUIRED'));
    requireValue(room, 'MISSION_CONTROL_ROOM_NOT_FOUND'); return room;
  };
  async function idempotent(key, payload, action) {
    const id = token(key, 'MISSION_CONTROL_IDEMPOTENCY_KEY_REQUIRED');
    const payloadDigest = await sha256(payload), previous = await repository.command(id);
    if (previous) {
      requireValue(previous.payloadDigest === payloadDigest, 'MISSION_CONTROL_IDEMPOTENCY_CONFLICT');
      return freeze({ status: 'DUPLICATE', result: previous.result });
    }
    const result = await action();
    await repository.writeCommand({ id, payloadDigest, result: clone(result) });
    return freeze({ status: 'APPLIED', result });
  }
  return Object.freeze({
    async createRoom({ roomId = null, ownerId, title, templateId = 'SPACE_CONTROL', deviceId,
      entitlement, idempotencyKey } = {}) {
      assertEdit(normalizedPolicy, entitlement, now().getTime());
      const owner = token(ownerId, 'MISSION_CONTROL_OWNER_REQUIRED');
      const id = token(roomId || makeId('mission-room'), 'MISSION_CONTROL_ROOM_ID_REQUIRED');
      const device = token(deviceId, 'MISSION_CONTROL_DEVICE_REQUIRED');
      return idempotent(idempotencyKey, { type: 'create', owner, id, title, templateId, device }, async () => {
        requireValue((await repository.list(owner)).length < normalizedPolicy.maxRooms,
          'MISSION_CONTROL_ROOM_LIMIT');
        requireValue(!(await repository.read(owner, id)), 'MISSION_CONTROL_ROOM_EXISTS');
        const at = utc(now());
        return repository.write(freeze({ schema: MISSION_CONTROL_SCHEMA, id, ownerId: owner,
          title: String(title || templateId).trim().slice(0, 120), templateId,
          revision: 1, parentRevision: 0,
          widgets: templateWidgets(templateId, normalizedPolicy.maxWidgetsPerRoom),
          createdAt: at, updatedAt: at, createdByDevice: device, updatedByDevice: device,
          active: false, shareState: 'PRIVATE', cacheControl: 'private, no-store' }));
      });
    },
    async saveRoom({ roomId, ownerId, expectedRevision, widgets, title, deviceId,
      entitlement, idempotencyKey } = {}) {
      assertEdit(normalizedPolicy, entitlement, now().getTime());
      const current = await owned(ownerId, roomId);
      requireValue(Number.isInteger(expectedRevision) && expectedRevision >= 1,
        'MISSION_CONTROL_EXPECTED_REVISION_REQUIRED');
      const device = token(deviceId, 'MISSION_CONTROL_DEVICE_REQUIRED');
      return idempotent(idempotencyKey, { type: 'save', roomId, ownerId, expectedRevision,
        widgets, title, device }, async () => {
        const normalized = normalizeWidgets(widgets, normalizedPolicy.maxWidgetsPerRoom);
        if (current.revision !== expectedRevision) {
          const conflict = freeze({ ...current,
            id: token(`${current.id}~${device}~r${expectedRevision}`, 'MISSION_CONTROL_CONFLICT_ID_INVALID'),
            title: String(title || current.title).trim().slice(0, 120), revision: 1,
            parentRevision: expectedRevision, widgets: normalized, conflictOf: current.id,
            conflictState: 'KEEP_BOTH', active: false, updatedAt: utc(now()), updatedByDevice: device });
          await repository.write(conflict);
          return freeze({ status: 'CONFLICT_KEEP_BOTH', canonical: current, conflict });
        }
        const next = freeze({ ...current, title: String(title || current.title).trim().slice(0, 120),
          revision: current.revision + 1, parentRevision: current.revision, widgets: normalized,
          updatedAt: utc(now()), updatedByDevice: device });
        await repository.write(next); return freeze({ status: 'SAVED', room: next });
      });
    },
    async activateRoom({ roomId, ownerId, entitlement, idempotencyKey } = {}) {
      assertEdit(normalizedPolicy, entitlement, now().getTime());
      const owner = token(ownerId, 'MISSION_CONTROL_OWNER_REQUIRED');
      const target = await owned(owner, roomId);
      return idempotent(idempotencyKey, { type: 'activate', owner, roomId }, async () => {
        const rooms = await repository.list(owner);
        for (const room of rooms) {
          await repository.write(freeze({ ...room, active: room.id === target.id,
            revision: room.revision + 1, parentRevision: room.revision, updatedAt: utc(now()) }));
        }
        return repository.read(owner, target.id);
      });
    },
    async loadRoom({ roomId, ownerId } = {}) { return owned(ownerId, roomId); },
    async listRooms({ ownerId } = {}) { return repository.list(token(ownerId,
      'MISSION_CONTROL_OWNER_REQUIRED')); },
    async exportRoom({ roomId, ownerId } = {}) {
      const room = await owned(ownerId, roomId), body = canonical(room);
      return freeze({ schema: 'earthus.aetherus-mission-control-export.v1', room,
        sha256: await sha256(body), byteLength: new TextEncoder().encode(body).byteLength,
        cacheControl: 'private, no-store', exportedAt: utc(now()) });
    },
    async deleteRoom({ roomId, ownerId, explicitHumanConfirmation } = {}) {
      requireValue(explicitHumanConfirmation === true, 'MISSION_CONTROL_DELETE_CONFIRMATION_REQUIRED');
      const room = await owned(ownerId, roomId); await repository.delete(room.ownerId, room.id);
      return freeze({ schema: 'earthus.aetherus-mission-control-deletion-receipt.v1',
        roomId: room.id, ownerId: room.ownerId, lastRevision: room.revision,
        status: 'DELETED', deletedAt: utc(now()) });
    },
  });
}

export function responsiveMissionLayout(room, viewportWidth) {
  const width = Number(viewportWidth); requireValue(Number.isFinite(width) && width > 0,
    'MISSION_CONTROL_VIEWPORT_INVALID');
  const mode = width < 640 ? 'MOBILE_STACK' : width < 1024 ? 'TABLET_TWO_COLUMN' : 'DESKTOP_THREE_REGION';
  if (mode === 'DESKTOP_THREE_REGION') return freeze({ mode, widgets: room.widgets });
  let y = 0;
  const widgets = room.widgets.map((item, index) => {
    if (index === 0) { y = 8; return { ...item, x: 0, y: 0, width: 12, height: 8 }; }
    if (mode === 'MOBILE_STACK') {
      const output = { ...item, x: 0, y, width: 12, height: 4 }; y += 4; return output;
    }
    const offset = index - 1;
    return { ...item, x: offset % 2 ? 6 : 0, y: 8 + Math.floor(offset / 2) * 4,
      width: 6, height: 4 };
  });
  return freeze({ mode, widgets });
}

export function buildMissionMode(room, { launchEvidence } = {}) {
  const active = launchEvidence?.official === true
    && ['LIVE', 'ASCENT', 'ORBIT_INSERTION', 'PAYLOAD_DEPLOYMENT'].includes(launchEvidence?.state)
    && launchEvidence?.freshness?.usable === true && launchEvidence?.sourceId
    && (launchEvidence?.observedAt || launchEvidence?.validFrom);
  const priority = new Map(['LIVE', 'COUNTDOWN', 'MISSION_TIMELINE', 'PAYLOAD_STATUS', 'NEXT_LAUNCH']
    .map((type, index) => [type, index]));
  const ordered = active ? [room.widgets[0], ...room.widgets.slice(1).sort((a, b) =>
    (priority.get(a.type) ?? 99) - (priority.get(b.type) ?? 99))] : room.widgets;
  return freeze({ active: Boolean(active), reason: active ? 'OFFICIAL_LIVE_EVENT' : 'NO_FRESH_OFFICIAL_LIVE_EVENT',
    widgets: ordered, liveClaimAllowed: Boolean(active), notificationDispatchAllowed: false });
}

export function evaluateMissionWidgetData({ data, nowMs = Date.now(), freshnessPolicy } = {}) {
  if (!data) return freeze({ state: 'UNAVAILABLE', reason: 'DATA_MISSING', value: null });
  requireValue(data.sourceId && (data.observedAt || data.validFrom), 'MISSION_CONTROL_DATA_PROVENANCE_REQUIRED');
  const at = Date.parse(data.observedAt || data.validFrom);
  requireValue(Number.isFinite(at), 'MISSION_CONTROL_DATA_TIME_INVALID');
  requireValue(freshnessPolicy?.status === 'APPROVED'
    && Number.isFinite(Number(freshnessPolicy.staleAfterSeconds)),
  'MISSION_CONTROL_FRESHNESS_POLICY_REQUIRED');
  const ageSeconds = Math.floor((nowMs - at) / 1000);
  const state = ageSeconds <= Number(freshnessPolicy.staleAfterSeconds) ? 'READY' : 'STALE';
  return freeze({ state, reason: state === 'READY' ? 'SOURCE_CURRENT' : 'SOURCE_STALE',
    value: data.value ?? null, sourceId: data.sourceId,
    observedAt: data.observedAt ? utc(data.observedAt) : null,
    validFrom: data.validFrom ? utc(data.validFrom) : null, ageSeconds,
    liveClaimAllowed: state === 'READY' && data.status === 'LIVE' });
}

export function normalizeMissionControlKeyboardCommand(command) {
  requireValue(['ADD', 'REMOVE', 'MOVE', 'RESIZE', 'ACTIVATE_ROOM'].includes(command?.type),
    'MISSION_CONTROL_KEYBOARD_COMMAND_INVALID');
  return freeze({ type: command.type,
    widgetId: command.widgetId ? token(command.widgetId, 'MISSION_CONTROL_WIDGET_ID_REQUIRED') : null,
    direction: command.direction && ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(command.direction)
      ? command.direction : null,
    announcement: String(command.announcement || '').trim().slice(0, 240) || null,
    requiresServerCommit: true });
}

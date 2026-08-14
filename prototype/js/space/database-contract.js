// Aetherus database model local shadow (Sheets 219-232).
// Validates a schema registry and retention decisions; it does not run migrations or delete records.

export const DATABASE_CONTRACT_SCHEMA = 'earthus.aetherus-database-contract.v1';
export const REQUIRED_TABLES = Object.freeze([
  'CelestialObject', 'Observation', 'MediaAsset', 'CultureReference', 'LaunchEvent', 'LaunchSite',
  'Rocket', 'Mission', 'Payload', 'SatelliteObject', 'OrbitSnapshot', 'UserObservation',
  'MediaRendition', 'MissionControlProfile', 'MissionControlWidget', 'Follow', 'AlertRule',
  'Entitlement', 'ProviderSource', 'RightsRecord', 'IngestionJob', 'AuditLog', 'Notification',
  'SearchDocument',
]);
const REQUIRED_COLUMNS = Object.freeze({
  CelestialObject: ['id', 'type', 'source_id', 'ra_deg', 'dec_deg'],
  Observation: ['id', 'celestial_object_id', 'observed_at', 'source_id'],
  MediaAsset: ['id', 'source_url', 'rights_record_id', 'checksum_sha256'],
  CultureReference: ['id', 'celestial_object_id', 'rights_record_id', 'source_id'],
  LaunchEvent: ['id', 'mission_id', 'status', 'asserted_at', 'source_id'],
  LaunchSite: ['id', 'name', 'geometry', 'source_id'],
  Rocket: ['id', 'name', 'version', 'source_id'], Mission: ['id', 'name', 'source_id'],
  Payload: ['id', 'mission_id', 'status', 'source_id'],
  SatelliteObject: ['id', 'norad_id', 'status', 'source_id'],
  OrbitSnapshot: ['id', 'satellite_object_id', 'epoch', 'source_id'],
  UserObservation: ['id', 'owner_id', 'observed_at', 'location_ref', 'deleted_at'],
  MediaRendition: ['id', 'media_asset_id', 'format', 'checksum_sha256'],
  MissionControlProfile: ['id', 'owner_id', 'revision', 'deleted_at'],
  MissionControlWidget: ['id', 'profile_id', 'revision', 'deleted_at'],
  Follow: ['id', 'owner_id', 'target_type', 'target_id', 'deleted_at'],
  AlertRule: ['id', 'owner_id', 'target_type', 'enabled', 'deleted_at'],
  Entitlement: ['id', 'owner_id', 'tier', 'status', 'asserted_at'],
  ProviderSource: ['id', 'authority', 'source_url', 'rights_record_id'],
  RightsRecord: ['id', 'status', 'source_url', 'checked_at'],
  IngestionJob: ['id', 'provider_source_id', 'idempotency_key', 'state'],
  AuditLog: ['id', 'actor_ref', 'action', 'occurred_at'],
  Notification: ['id', 'owner_id', 'state', 'created_at', 'deleted_at'],
  SearchDocument: ['id', 'object_type', 'object_id', 'content_revision'],
});
const OWNER_SCOPED = new Set(['UserObservation', 'MissionControlProfile', 'MissionControlWidget',
  'Follow', 'AlertRule', 'Notification']);
const SOFT_DELETE = new Set(['UserObservation', 'MissionControlProfile', 'MissionControlWidget',
  'Follow', 'AlertRule', 'Notification']);
const APPEND_ONLY = new Set(['Observation', 'OrbitSnapshot', 'AuditLog']);
const RIGHTS_REQUIRED = new Set(['MediaAsset', 'CultureReference', 'ProviderSource']);

export class DatabaseContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'DatabaseContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new DatabaseContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z][A-Za-z0-9._:~-]{0,127}$/.test(output), code); return output;
};
const utc = (value, code = 'DATABASE_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function validateDatabaseContract(raw) {
  requireValue(raw?.schema === DATABASE_CONTRACT_SCHEMA, 'DATABASE_CONTRACT_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'DATABASE_CONTRACT_STATUS_INVALID');
  requireValue(Array.isArray(raw.tables), 'DATABASE_TABLES_REQUIRED');
  const tables = raw.tables.map(table => {
    const name = token(table.name, 'DATABASE_TABLE_NAME_INVALID');
    requireValue(table.primaryKey === 'id' && Array.isArray(table.columns)
      && Array.isArray(table.controls), 'DATABASE_TABLE_DEFINITION_INVALID', { name });
    requireValue(table.columns.every(column => /^[a-z][a-z0-9_]{0,62}$/.test(column))
      && !table.columns.some(column => /(password|secret|access_token|refresh_token|private_key)/i
        .test(column)), 'DATABASE_COLUMN_INVALID_OR_SECRET', { name });
    return freeze({ name, primaryKey: 'id', columns: [...new Set(table.columns)],
      controls: [...new Set(table.controls)] });
  });
  const byName = new Map(tables.map(table => [table.name, table]));
  requireValue(byName.size === tables.length, 'DATABASE_DUPLICATE_TABLE');
  requireValue(REQUIRED_TABLES.every(name => byName.has(name)), 'DATABASE_REQUIRED_TABLE_MISSING');
  for (const [name, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const table = byName.get(name);
    requireValue(columns.every(column => table.columns.includes(column)),
      'DATABASE_REQUIRED_COLUMN_MISSING', { name });
    if (OWNER_SCOPED.has(name)) requireValue(table.controls.includes('RLS_OWNER'),
      'DATABASE_OWNER_RLS_REQUIRED', { name });
    if (SOFT_DELETE.has(name)) requireValue(table.controls.includes('SOFT_DELETE'),
      'DATABASE_SOFT_DELETE_REQUIRED', { name });
    if (APPEND_ONLY.has(name)) requireValue(table.controls.includes('APPEND_ONLY'),
      'DATABASE_APPEND_ONLY_REQUIRED', { name });
    if (RIGHTS_REQUIRED.has(name)) requireValue(table.controls.includes('RIGHTS_REQUIRED'),
      'DATABASE_RIGHTS_CONTROL_REQUIRED', { name });
  }
  const indexes = raw.indexes || [];
  requireValue(indexes.some(index => index.kind === 'GIST_GEO' && index.table === 'LaunchSite'
    && index.columns?.includes('geometry')), 'DATABASE_GEO_INDEX_REQUIRED');
  requireValue(indexes.some(index => index.kind === 'BTREE_COMPOSITE'
    && index.table === 'CelestialObject' && index.columns?.join(',') === 'ra_deg,dec_deg'),
  'DATABASE_RA_DEC_INDEX_REQUIRED');
  requireValue(Number.isInteger(raw.retention?.softDeleteDays) && raw.retention.softDeleteDays > 0
    && Number.isInteger(raw.retention?.auditMinimumDays)
    && raw.retention.auditMinimumDays >= raw.retention.softDeleteDays,
  'DATABASE_RETENTION_POLICY_INVALID');
  if (raw.productionEnabled === true) requireValue(raw.status === 'APPROVED'
    && raw.approvedAt && raw.approvedBy && raw.migrationEvidence,
  'DATABASE_PRODUCTION_MIGRATION_NOT_APPROVED');
  return freeze({ schema: DATABASE_CONTRACT_SCHEMA, revision: token(raw.revision,
    'DATABASE_CONTRACT_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true, tables, indexes: indexes.map(index =>
      freeze({ ...index })), retention: { ...raw.retention }, migrationEvidence: raw.migrationEvidence || null,
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function retentionDecision({ tableName, deletedAt = null, now, contract } = {}) {
  const normalized = validateDatabaseContract(contract);
  requireValue(REQUIRED_TABLES.includes(tableName), 'DATABASE_RETENTION_TABLE_UNKNOWN');
  if (tableName === 'AuditLog') return freeze({ tableName, disposition: 'RETAIN_AUDIT',
    automaticDelete: false, reason: 'AUDIT_MINIMUM_RETENTION' });
  if (!SOFT_DELETE.has(tableName)) return freeze({ tableName, disposition: 'NOT_APPLICABLE',
    automaticDelete: false, reason: 'NO_SOFT_DELETE_CONTRACT' });
  if (!deletedAt) return freeze({ tableName, disposition: 'ACTIVE', automaticDelete: false,
    reason: 'NOT_SOFT_DELETED' });
  const deleted = Date.parse(utc(deletedAt));
  const current = Date.parse(utc(now));
  requireValue(current >= deleted, 'DATABASE_RETENTION_CLOCK_INVALID');
  const ageDays = Math.floor((current - deleted) / 86400000);
  const eligible = ageDays >= normalized.retention.softDeleteDays;
  return freeze({ tableName, disposition: eligible ? 'DELETE_ELIGIBLE' : 'RETENTION_HOLD',
    automaticDelete: false, reason: eligible ? 'HUMAN_APPROVAL_AND_BACKUP_REQUIRED'
      : 'RETENTION_PERIOD_NOT_ELAPSED', ageDays });
}

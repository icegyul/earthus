// Aetherus 정적 카탈로그의 브라우저 실행 계약.
//
// JSON이 열리기만 하면 화면을 그리던 상태에서는 출처·시각 의미·권리 필드가 빠져도
// 조용히 통과한다. 각 소비 모듈은 이 검사를 통과한 문서만 사용한다. 새 서버나 DB를
// 만들지 않고 현재 정적 JSON을 단일 계약으로 묶기 위한 PR-01 경계다.

export const AETHERUS_CATALOG_SCHEMAS = Object.freeze({
  'space-photos': 'earthus.space-photos.v1',
  'celestial-bodies': 'earthus.celestial-bodies.v1',
  'cosmic-spacecraft': 'earthus.cosmic-spacecraft.v1',
  'milky-way-structure': 'earthus.milky-way-structure.v1',
  'solar-motion': 'earthus.solar-motion.v1',
});

const PROVENANCE = new Set([
  'observation',
  'calculated',
  'reconstruction',
  'simulation',
  'ai',
  'user-content',
]);
const DATE_KINDS = new Set(['observation', 'observation-range', 'release']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export class AetherusCatalogContractError extends Error {
  constructor(catalog, path, message) {
    super(`[${catalog}] ${path}: ${message}`);
    this.name = 'AetherusCatalogContractError';
    this.code = 'AETHERUS_CATALOG_CONTRACT';
    this.catalog = catalog;
    this.path = path;
  }
}

const fail = (catalog, path, message) => {
  throw new AetherusCatalogContractError(catalog, path, message);
};
const requireValue = (condition, catalog, path, message) => {
  if (!condition) fail(catalog, path, message);
};
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && !!value.trim();
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const isLocalized = value => isObject(value) && isText(value.ko) && isText(value.en);
const isDate = value => {
  if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isTimestamp = value => isText(value) && /Z$/.test(value) && Number.isFinite(Date.parse(value));
const isHttps = value => isText(value) && /^https:\/\//.test(value);

function requireArray(value, catalog, path) {
  requireValue(Array.isArray(value) && value.length > 0, catalog, path, 'non-empty array required');
  return value;
}

function requireLocalized(value, catalog, path) {
  requireValue(isLocalized(value), catalog, path, 'ko/en text required');
}

function requireIds(items, catalog, path) {
  const ids = items.map((item, index) => {
    requireValue(isObject(item), catalog, `${path}[${index}]`, 'object required');
    requireValue(ID_PATTERN.test(item.id || ''), catalog, `${path}[${index}].id`, 'stable URL-safe id required');
    return item.id;
  });
  requireValue(new Set(ids).size === ids.length, catalog, path, 'duplicate id');
  return ids;
}

function requireCommon(catalog, document) {
  requireValue(isObject(document), catalog, '$', 'object required');
  const expectedSchema = AETHERUS_CATALOG_SCHEMAS[catalog];
  requireValue(!!expectedSchema, catalog, '$', 'unknown catalogue');
  requireValue(document.schema === expectedSchema, catalog, 'schema', `expected ${expectedSchema}`);
  requireValue(document.schemaVersion === 1, catalog, 'schemaVersion', 'schema version 1 required');
  requireValue(isObject(document.contract), catalog, 'contract', 'contract metadata required');
  requireValue(isObject(document.contract.time), catalog, 'contract.time', 'time semantics required');
  requireValue(isObject(document.contract.rights), catalog, 'contract.rights', 'rights semantics required');
  if (document.contract.provenance !== undefined) {
    requireValue(PROVENANCE.has(document.contract.provenance), catalog, 'contract.provenance', 'unsupported provenance');
  }
  if (document.contract.provenanceByType !== undefined) {
    requireValue(isObject(document.contract.provenanceByType), catalog, 'contract.provenanceByType', 'object required');
    Object.entries(document.contract.provenanceByType).forEach(([type, value]) => {
      requireValue(isText(type) && PROVENANCE.has(value), catalog,
        `contract.provenanceByType.${type}`, 'unsupported provenance');
    });
  }
  const requiredRights = document.contract.rights.required;
  requireValue(Array.isArray(requiredRights) && requiredRights.every(isText), catalog,
    'contract.rights.required', 'rights field list required');
}

function validateSpacePhotos(document) {
  const catalog = 'space-photos';
  requireValue(document.contract.owner === 'aetherus', catalog,
    'contract.owner', 'Aetherus ownership required');
  requireValue(Array.isArray(document.contract.surfaces)
    && document.contract.surfaces.includes('photo-gallery')
    && document.contract.surfaces.includes('sky-position'), catalog,
  'contract.surfaces', 'photo-gallery and sky-position surfaces required');
  requireValue(document.contract.provenance === 'observation', catalog,
    'contract.provenance', 'observation required');
  requireValue(document.contract.time.generated === 'catalog-generated-date', catalog,
    'contract.time.generated', 'catalog date semantics required');
  requireValue(document.contract.time.itemDate === 'dateKind-field', catalog,
    'contract.time.itemDate', 'dateKind semantics required');
  requireValue(document.contract.rights.scope === 'item', catalog,
    'contract.rights.scope', 'item rights required');
  requireValue(isDate(document.generated), catalog, 'generated', 'ISO date required');
  const items = requireArray(document.items, catalog, 'items');
  requireIds(items, catalog, 'items');
  items.forEach((item, index) => {
    const path = `items[${index}]`;
    requireLocalized(item.name, catalog, `${path}.name`);
    requireValue(isNumber(item.ra) && item.ra >= 0 && item.ra < 360, catalog, `${path}.ra`, '0 <= ra < 360 required');
    requireValue(isNumber(item.dec) && item.dec >= -90 && item.dec <= 90, catalog, `${path}.dec`, '-90 <= dec <= 90 required');
    requireValue(['HST', 'JWST'].includes(item.telescope), catalog, `${path}.telescope`, 'HST or JWST required');
    requireValue(isDate(item.date), catalog, `${path}.date`, 'ISO date required');
    requireValue(DATE_KINDS.has(item.dateKind), catalog, `${path}.dateKind`, 'date meaning required');
    requireValue(isText(item.thumb), catalog, `${path}.thumb`, 'local thumbnail required');
    requireValue(isHttps(item.full), catalog, `${path}.full`, 'official HTTPS URL required');
    requireValue(isText(item.credit), catalog, `${path}.credit`, 'credit required');
    requireValue(isText(item.license), catalog, `${path}.license`, 'license required');
  });
}

function validateCelestialBodies(document) {
  const catalog = 'celestial-bodies';
  requireValue(document.contract.provenance === 'reconstruction', catalog,
    'contract.provenance', 'reconstruction required');
  requireValue(document.contract.time.surface === 'representative-not-current', catalog,
    'contract.time.surface', 'surface time limit required');
  requireValue(document.contract.rights.scope === 'assetRights', catalog,
    'contract.rights.scope', 'asset rights map required');
  requireValue(document.version === 1, catalog, 'version', 'legacy version 1 required');
  requireValue(isDate(document.generated), catalog, 'generated', 'ISO date required');
  requireLocalized(document.positionNotice, catalog, 'positionNotice');
  const bodies = requireArray(document.bodies, catalog, 'bodies');
  const ids = requireIds(bodies, catalog, 'bodies');
  requireValue(isObject(document.assetRights), catalog, 'assetRights', 'asset rights map required');
  const rightsIds = Object.keys(document.assetRights).sort();
  requireValue(JSON.stringify(rightsIds) === JSON.stringify([...ids].sort()), catalog,
    'assetRights', 'rights ids must match body ids');
  ids.forEach(id => {
    const rights = document.assetRights[id];
    ['credit', 'usage'].forEach(field => requireValue(isText(rights[field]), catalog,
      `assetRights.${id}.${field}`, `${field} required`));
    ['sourceUrl', 'policyUrl'].forEach(field => requireValue(isHttps(rights[field]), catalog,
      `assetRights.${id}.${field}`, `HTTPS ${field} required`));
  });
  bodies.forEach((body, index) => {
    const path = `bodies[${index}]`;
    requireLocalized(body.name, catalog, `${path}.name`);
    requireLocalized(body.kind, catalog, `${path}.kind`);
    requireLocalized(body.rotation, catalog, `${path}.rotation`);
    requireLocalized(body.orbit, catalog, `${path}.orbit`);
    requireLocalized(body.summary, catalog, `${path}.summary`);
    requireValue(isText(body.texture), catalog, `${path}.texture`, 'texture id required');
    requireValue(isNumber(body.radiusKm) && body.radiusKm > 0, catalog, `${path}.radiusKm`, 'positive radius required');
    requireValue(isText(body.source), catalog, `${path}.source`, 'source required');
    requireValue(isHttps(body.sourceUrl), catalog, `${path}.sourceUrl`, 'HTTPS source required');
    (body.features || []).forEach((feature, featureIndex) => {
      requireValue(isNumber(feature.lat) && feature.lat >= -90 && feature.lat <= 90, catalog,
        `${path}.features[${featureIndex}].lat`, 'latitude out of range');
      requireValue(isNumber(feature.lon) && feature.lon >= -180 && feature.lon <= 180, catalog,
        `${path}.features[${featureIndex}].lon`, 'longitude out of range');
    });
  });
}

function validateCosmicSpacecraft(document) {
  const catalog = 'cosmic-spacecraft';
  requireValue(isDate(document.generated), catalog, 'generated', 'ISO date required');
  requireLocalized(document.positionNotice, catalog, 'positionNotice');
  const items = requireArray(document.items, catalog, 'items');
  requireIds(items, catalog, 'items');
  items.forEach((item, index) => {
    const path = `items[${index}]`;
    requireValue(PROVENANCE.has(document.contract.provenanceByType[item.type]), catalog,
      `${path}.type`, 'type must map to provenance');
    requireLocalized(item.name, catalog, `${path}.name`);
    requireLocalized(item.shortName, catalog, `${path}.shortName`);
    requireLocalized(item.method, catalog, `${path}.method`);
    requireValue(isText(item.credit), catalog, `${path}.credit`, 'credit required');
    requireValue(isText(item.source), catalog, `${path}.source`, 'source required');
    requireValue(isHttps(item.sourceUrl), catalog, `${path}.sourceUrl`, 'HTTPS source required');
    if (item.type === 'heliocentric-vector') {
      requireValue(isTimestamp(item.epoch), catalog, `${path}.epoch`, 'UTC epoch required');
      ['pos', 'vel'].forEach(field => requireValue(Array.isArray(item[field]) && item[field].length === 3
        && item[field].every(isNumber), catalog, `${path}.${field}`, 'finite 3-vector required'));
    } else {
      requireValue(isDate(item.referenceDate), catalog, `${path}.referenceDate`, 'reference date required');
      requireLocalized(item.distance, catalog, `${path}.distance`);
    }
  });
}

function validateMilkyWayStructure(document) {
  const catalog = 'milky-way-structure';
  requireValue(document.contract.provenance === 'reconstruction', catalog,
    'contract.provenance', 'reconstruction required');
  requireValue(document.contract.rights.scope === 'source-list', catalog,
    'contract.rights.scope', 'source-list rights required');
  requireValue(isDate(document.generated), catalog, 'generated', 'ISO date required');
  requireLocalized(document.title, catalog, 'title');
  requireLocalized(document.limitations, catalog, 'limitations');
  ['diameterLightYears', 'sunDistanceFromCenterLightYears', 'solarOrbitYears'].forEach(field => {
    requireValue(isNumber(document[field]) && document[field] > 0, catalog, field, 'positive number required');
  });
  const arms = requireArray(document.arms, catalog, 'arms');
  requireIds(arms, catalog, 'arms');
  arms.forEach((arm, index) => {
    requireValue(isText(arm.ko) && isText(arm.en), catalog, `arms[${index}]`, 'ko/en names required');
  });
  requireArray(document.sources, catalog, 'sources').forEach((source, index) => {
    requireValue(isText(source.name), catalog, `sources[${index}].name`, 'source name required');
    requireValue(isHttps(source.url), catalog, `sources[${index}].url`, 'HTTPS source required');
  });
}

function validateSolarMotion(document) {
  const catalog = 'solar-motion';
  requireValue(document.contract.provenance === 'simulation', catalog,
    'contract.provenance', 'simulation required');
  requireValue(document.contract.rights.scope === 'source', catalog,
    'contract.rights.scope', 'source rights required');
  requireValue(isDate(document.referenceDate), catalog, 'referenceDate', 'ISO date required');
  ['displaySpanDays', 'galacticSpeedKph', 'distanceAu', 'galacticOrbitYears'].forEach(field => {
    requireValue(isNumber(document[field]) && document[field] > 0, catalog, field, 'positive number required');
  });
  requireValue(isText(document.source), catalog, 'source', 'source required');
  requireValue(isHttps(document.sourceUrl), catalog, 'sourceUrl', 'HTTPS source required');
  requireLocalized(document.method, catalog, 'method');
  requireLocalized(document.limitations, catalog, 'limitations');
  requireLocalized(document.displayLimit, catalog, 'displayLimit');
}

const VALIDATORS = Object.freeze({
  'space-photos': validateSpacePhotos,
  'celestial-bodies': validateCelestialBodies,
  'cosmic-spacecraft': validateCosmicSpacecraft,
  'milky-way-structure': validateMilkyWayStructure,
  'solar-motion': validateSolarMotion,
});

export function assertAetherusCatalog(catalog, document) {
  requireCommon(catalog, document);
  VALIDATORS[catalog](document);
  return document;
}

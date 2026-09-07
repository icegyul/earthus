import { MODEL_STATUS } from '../core/constants.js';
import { clamp } from '../core/math.js';

const TRANSITIONS = Object.freeze({
  [MODEL_STATUS.DRAFT]: new Set([MODEL_STATUS.SHADOW, MODEL_STATUS.RETIRED]),
  [MODEL_STATUS.SHADOW]: new Set([MODEL_STATUS.CANARY, MODEL_STATUS.RETIRED]),
  [MODEL_STATUS.CANARY]: new Set([MODEL_STATUS.ACTIVE, MODEL_STATUS.ROLLBACK, MODEL_STATUS.RETIRED]),
  [MODEL_STATUS.ACTIVE]: new Set([MODEL_STATUS.ROLLBACK, MODEL_STATUS.RETIRED]),
  [MODEL_STATUS.ROLLBACK]: new Set([MODEL_STATUS.SHADOW, MODEL_STATUS.RETIRED]),
  [MODEL_STATUS.RETIRED]: new Set(),
});

export class ForecastVerificationStore {
  #forecasts = new Map();
  #groundTruth = new Map();

  addForecast(record) {
    if (!record?.forecastId || !record?.locationId || !record?.issuedAt || !record?.targetAt || !record?.modelVersion) throw new TypeError('forecast record is incomplete');
    if (this.#forecasts.has(record.forecastId)) throw new Error(`forecast already exists: ${record.forecastId}`);
    this.#forecasts.set(record.forecastId, Object.freeze(structuredClone(record)));
  }

  attachGroundTruth(record) {
    if (!record?.forecastId || !Number.isFinite(record.actualValue) || !record.observedAt) throw new TypeError('ground truth record is incomplete');
    if (!this.#forecasts.has(record.forecastId)) throw new Error('forecast does not exist');
    const forecast = this.#forecasts.get(record.forecastId);
    const error = Number.isFinite(forecast.predictedValue) ? record.actualValue - forecast.predictedValue : null;
    this.#groundTruth.set(record.forecastId, Object.freeze({ ...structuredClone(record), error, absoluteError: Number.isFinite(error) ? Math.abs(error) : null, squaredError: Number.isFinite(error) ? error ** 2 : null }));
  }

  metrics({ modelVersion = null, horizonMinutes = null, locationId = null } = {}) {
    const rows = [];
    for (const [forecastId, truth] of this.#groundTruth) {
      const forecast = this.#forecasts.get(forecastId);
      if (modelVersion && forecast.modelVersion !== modelVersion) continue;
      if (locationId && forecast.locationId !== locationId) continue;
      const horizon = (Date.parse(forecast.targetAt) - Date.parse(forecast.issuedAt)) / 60000;
      if (Number.isFinite(horizonMinutes) && Math.abs(horizon - horizonMinutes) > 1) continue;
      if (Number.isFinite(truth.error)) rows.push({ forecast, truth, horizon });
    }
    if (!rows.length) return Object.freeze({ count: 0, mae: null, rmse: null, bias: null });
    const mae = rows.reduce((sum, row) => sum + row.truth.absoluteError, 0) / rows.length;
    const rmse = Math.sqrt(rows.reduce((sum, row) => sum + row.truth.squaredError, 0) / rows.length);
    const bias = rows.reduce((sum, row) => sum + row.truth.error, 0) / rows.length;
    return Object.freeze({ count: rows.length, mae, rmse, bias });
  }
}

export class ModelLifecycleRegistry {
  #models = new Map();

  register({ modelVersion, domain, status = MODEL_STATUS.DRAFT, metrics = null }) {
    if (!modelVersion || !domain) throw new TypeError('modelVersion and domain are required');
    if (this.#models.has(modelVersion)) throw new Error(`model already exists: ${modelVersion}`);
    this.#models.set(modelVersion, { modelVersion, domain, status, metrics: metrics ? structuredClone(metrics) : null, history: [{ status, at: new Date().toISOString(), reason: 'REGISTERED' }] });
  }

  transition(modelVersion, nextStatus, { reason, gates = {} } = {}) {
    const model = this.#models.get(modelVersion);
    if (!model) throw new Error(`unknown model: ${modelVersion}`);
    if (!TRANSITIONS[model.status].has(nextStatus)) throw new Error(`invalid model transition: ${model.status} -> ${nextStatus}`);
    if ([MODEL_STATUS.CANARY, MODEL_STATUS.ACTIVE].includes(nextStatus)) {
      const required = ['backtestPass', 'calibrationPass', 'dataQualityPass', 'rollbackReady'];
      const failed = required.filter((key) => gates[key] !== true);
      if (failed.length) return Object.freeze({ changed: false, failed: Object.freeze(failed), status: model.status });
    }
    model.status = nextStatus;
    model.history.push({ status: nextStatus, at: new Date().toISOString(), reason: reason ?? 'UNSPECIFIED' });
    return Object.freeze({ changed: true, status: nextStatus, failed: Object.freeze([]) });
  }

  get(modelVersion) {
    const model = this.#models.get(modelVersion);
    return model ? Object.freeze(structuredClone(model)) : null;
  }
}

export function championChallengerDecision({ championMetrics, challengerMetrics, minimumImprovement = 0.03, calibrationImproved = false }) {
  if (![championMetrics?.mae, challengerMetrics?.mae].every(Number.isFinite)) return Object.freeze({ promote: false, reason: 'INSUFFICIENT_METRICS' });
  const improvement = (championMetrics.mae - challengerMetrics.mae) / Math.max(championMetrics.mae, Number.EPSILON);
  return Object.freeze({ promote: improvement >= minimumImprovement && calibrationImproved === true, improvement: clamp(improvement, -1, 1), reason: improvement >= minimumImprovement ? (calibrationImproved ? 'BETTER_AND_CALIBRATED' : 'CALIBRATION_NOT_IMPROVED') : 'IMPROVEMENT_TOO_SMALL' });
}

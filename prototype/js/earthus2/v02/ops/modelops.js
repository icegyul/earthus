import { MODEL_STATUS } from '../core/constants.js';
import { championChallengerDecision } from '../human-flow/forecast-lifecycle.js';

export function modelPromotionGate({ status, metrics, dataQualityPass, calibrationPass, rollbackReady, notificationRegressionPass = true }) {
  const failed = [];
  if (![MODEL_STATUS.SHADOW, MODEL_STATUS.CANARY].includes(status)) failed.push('INVALID_SOURCE_STATUS');
  if (!metrics || !Number.isFinite(metrics.mae) || metrics.count < 20) failed.push('INSUFFICIENT_METRICS');
  if (!dataQualityPass) failed.push('DATA_QUALITY');
  if (!calibrationPass) failed.push('CALIBRATION');
  if (!rollbackReady) failed.push('ROLLBACK');
  if (!notificationRegressionPass) failed.push('NOTIFICATION_REGRESSION');
  return Object.freeze({ pass: failed.length === 0, failed: Object.freeze(failed) });
}

export function selectChampion({ champion, challenger, minimumImprovement = 0.03 }) {
  const decision = championChallengerDecision({ championMetrics: champion.metrics, challengerMetrics: challenger.metrics, minimumImprovement, calibrationImproved: challenger.calibrationImproved === true });
  return Object.freeze({ ...decision, championVersion: champion.modelVersion, challengerVersion: challenger.modelVersion });
}

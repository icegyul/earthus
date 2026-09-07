import { ARCHIVE_STATE } from '../core/constants.js';

export function verifyArchiveEvidence(evidence) {
  const checks = Object.freeze({
    nasObjectExists: evidence?.nasObjectExists === true,
    manifestExists: evidence?.manifestExists === true,
    objectCountMatch: evidence?.objectCountMatch === true,
    logicalRecordCountMatch: evidence?.logicalRecordCountMatch === true,
    timeRangeMatch: evidence?.timeRangeMatch === true,
    sizeMatch: evidence?.sizeMatch === true,
    checksumMatch: evidence?.checksumMatch === true,
    snapshotVerified: evidence?.snapshotVerified === true,
    gracePeriodElapsed: evidence?.gracePeriodElapsed === true,
    shadowTestPassed: evidence?.shadowTestPassed === true,
  });
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  return Object.freeze({
    verified: failed.length === 0,
    state: failed.length ? ARCHIVE_STATE.DELETE_BLOCKED : ARCHIVE_STATE.DELETE_ELIGIBLE,
    failed: Object.freeze(failed),
    checks,
  });
}

export function storagePressurePolicy(usagePercent) {
  if (!Number.isFinite(usagePercent) || usagePercent < 0 || usagePercent > 100) throw new RangeError('usagePercent must be in [0,100]');
  if (usagePercent >= 95) return Object.freeze({ state: 'SAFE_MODE', hotHours: 24, renderCacheHours: 6, optionalIngest: false });
  if (usagePercent >= 90) return Object.freeze({ state: 'CRITICAL', hotHours: 24, renderCacheHours: 12, optionalIngest: false });
  if (usagePercent >= 80) return Object.freeze({ state: 'PRESSURE', hotHours: 48, renderCacheHours: 24, optionalIngest: true });
  if (usagePercent >= 70) return Object.freeze({ state: 'WATCH', hotHours: 72, renderCacheHours: 24, optionalIngest: true });
  return Object.freeze({ state: 'NORMAL', hotHours: 72, renderCacheHours: 48, optionalIngest: true });
}

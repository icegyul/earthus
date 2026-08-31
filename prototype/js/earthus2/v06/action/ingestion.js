import { normalizeActionSource } from './source-registry.js';
import { normalizePublicAction } from './normalization.js';
import { resolveActionStatus } from './status-resolver.js';
import { publicMapLocator } from './location-precision.js';
import { classifyActionTruth, canLabelLiveAction } from './trust-verification.js';

export function ingestPublicActionRecord(raw, sourceInput, { now = Date.now(), corroborationCount = 0 } = {}) {
  const source = normalizeActionSource(sourceInput);
  const activity = normalizePublicAction(raw, source);
  const status = resolveActionStatus(activity, now);
  const trust = classifyActionTruth({ source, corroborationCount });
  const locator = publicMapLocator(activity);
  return {
    ...activity,
    source,
    status,
    truthClass: trust.truthClass,
    confidenceCap: trust.confidenceCap,
    locator,
    liveLabelAllowed: canLabelLiveAction(trust, status),
  };
}

// Source timestamps and warning validity have separate meanings. A fresh download is
// never evidence that every bulletin it contains is still in force.
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function sourceInstant(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  // Zone-less source times must not silently acquire the reader's device timezone.
  if (!/(?:Z|[+-]\d{2}:?\d{2}|\bUTC|\bGMT)\s*$/i.test(value.trim())) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function sourceTimeLabel(value) {
  const iso = sourceInstant(value);
  if (!iso) return value ? `${String(value)} (시간대 미확인)` : '미제공';
  const k = new Date(Date.parse(iso) + 9 * 3600000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')} KST`;
}

export function bulletinContext(bulletin = {}, collection = {}, nowMs = Date.now()) {
  const publishedRaw = bulletin.publishedAt || bulletin.issuedAt || bulletin.published || bulletin.sent || bulletin.updated || bulletin.issued;
  const publicationLabel = !bulletin.publishedAt && !bulletin.issuedAt && !bulletin.published && !bulletin.sent && bulletin.updated ? '게시 갱신' : '발표';
  const validFromRaw = bulletin.validFrom || bulletin.effective || bulletin.onset;
  const validUntilRaw = bulletin.validUntil || bulletin.expires || bulletin.ends;
  const publishedAt = sourceInstant(publishedRaw);
  const validFrom = sourceInstant(validFromRaw);
  const validUntil = sourceInstant(validUntilRaw);
  const retrievedRaw = collection.retrievedAt || collection.fetchedAt || collection.generated;
  const rawStatus = String(bulletin.status || bulletin.msgType || '').trim().toLowerCase();
  const category = String(bulletin.category || 'Unknown');
  const fromMs = validFrom ? Date.parse(validFrom) : null;
  const untilMs = validUntil ? Date.parse(validUntil) : null;
  let state = 'unknown';
  let label = '발효 여부 미확인';
  if (['cancel', 'cancelled', 'canceled', '해제'].includes(rawStatus)) {
    state = 'cancelled'; label = '해제 발표';
  } else if (fromMs != null && untilMs != null && fromMs >= untilMs) {
    label = '유효기간 확인 필요';
  } else if (untilMs != null && untilMs <= nowMs) {
    state = 'expired'; label = '유효기간 종료';
  } else if (fromMs != null && fromMs > nowMs) {
    state = 'scheduled'; label = '발효 전';
  } else if (/^information$/i.test(category)) {
    state = 'information'; label = '정보문';
  } else if (fromMs != null && untilMs != null && fromMs <= nowMs && nowMs < untilMs) {
    state = 'active'; label = '유효기간 내';
  }
  return { publishedAt, validFrom, validUntil, retrievedAt: sourceInstant(retrievedRaw),
    publishedRaw, publicationLabel, issuedRaw: bulletin.issued, validFromRaw, validUntilRaw, retrievedRaw, category, state, label };
}

export function bulletinTimesHtml(context) {
  return `${context.publicationLabel} ${escapeHtml(sourceTimeLabel(context.publishedRaw))}<br/>`
    + (context.issuedRaw ? `원문 발표 시각 ${escapeHtml(context.issuedRaw)}<br/>` : '')
    + `유효 시작 ${escapeHtml(sourceTimeLabel(context.validFromRaw))} · 종료 ${escapeHtml(sourceTimeLabel(context.validUntilRaw))}`;
}

export function bulletinRecords(collection = {}, nowMs = Date.now()) {
  return (collection.alerts || []).map((bulletin) => ({ bulletin, context: bulletinContext(bulletin, collection, nowMs) }))
    .sort((a, b) => (Date.parse(b.context.publishedAt) || 0) - (Date.parse(a.context.publishedAt) || 0));
}

// One absolute palette for all four scenarios. Out-of-scale values remain in source
// arrays and numeric ranges; only the display colour saturates at the endpoints.
export const SEA_LEVEL_SCALE_CM = Object.freeze({ min: 0, max: 100, ticks: Object.freeze([0, 25, 50, 75, 100]) });
export function seaLevelFractionCm(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, (value - SEA_LEVEL_SCALE_CM.min) / (SEA_LEVEL_SCALE_CM.max - SEA_LEVEL_SCALE_CM.min)));
}

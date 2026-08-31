const STATUS = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  ONGOING_CAMPAIGN: 'ONGOING_CAMPAIGN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
});

function ts(v) {
  if (!v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

export function resolveActionStatus(event = {}, now = Date.now()) {
  if (event.cancelled === true || String(event.status || '').toUpperCase() === STATUS.CANCELLED) return STATUS.CANCELLED;
  const start = ts(event.startsAt);
  const end = ts(event.endsAt);
  if (start !== null && now < start) return STATUS.SCHEDULED;
  if (start !== null && end !== null && now >= start && now <= end) return STATUS.ACTIVE;
  if (start !== null && end === null && now >= start) return STATUS.ONGOING_CAMPAIGN;
  if (end !== null && now > end) return STATUS.COMPLETED;
  if (event.ongoing === true) return STATUS.ONGOING_CAMPAIGN;
  return STATUS.UNKNOWN;
}

export { STATUS };

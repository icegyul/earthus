const ALLOCATION_EPSILON = 1e-9;

export function buildTourismAllocationAudit(allocations) {
  const audit = new Map();
  for (const allocation of allocations || []) {
    const placeId = String(allocation?.placeId || '');
    const row = audit.get(placeId) || { placeId, count: 0, weight: 0 };
    row.count += 1;
    row.weight += Number(allocation?.weight);
    audit.set(placeId, row);
  }
  return [...audit.values()].sort((left, right) => left.placeId.localeCompare(right.placeId));
}

export function validateCanonicalTourismAllocationAudit(canonicalPlaceIds, allocationAudit) {
  const canonical = [...canonicalPlaceIds].sort();
  const canonicalSet = new Set(canonical);
  if (canonicalSet.size !== canonical.length) throw new Error('CANONICAL_PLACE_ID_DUPLICATE');
  const byPlaceId = new Map((allocationAudit || []).map(row => [row.placeId, row]));
  const errors = [];
  for (const placeId of canonical) {
    const row = byPlaceId.get(placeId);
    if (!row) {
      errors.push({ placeId, count: 0, weight: 0, reason: 'MISSING_CANONICAL_SOURCE' });
      continue;
    }
    if (row.count < 9 || row.count > 25) {
      errors.push({ ...row, reason: 'CONTRIBUTION_COUNT_INVALID' });
    } else if (!Number.isFinite(row.weight) || Math.abs(row.weight - 1) > ALLOCATION_EPSILON) {
      errors.push({ ...row, reason: 'ALLOCATION_WEIGHT_INVALID' });
    }
  }
  for (const row of allocationAudit || []) {
    if (!canonicalSet.has(row.placeId)) errors.push({ ...row, reason: 'UNKNOWN_SOURCE' });
  }
  return {
    valid: errors.length === 0 && byPlaceId.size === canonical.length,
    audit: canonical.map(placeId => byPlaceId.get(placeId)
      || { placeId, count: 0, weight: 0 }),
    errors,
  };
}

export function auditCanonicalTourismAllocations(canonicalPlaceIds, allocations) {
  return validateCanonicalTourismAllocationAudit(
    canonicalPlaceIds,
    buildTourismAllocationAudit(allocations),
  );
}

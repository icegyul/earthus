export function runHumanFlowScenario({ baseline, occupancyDelta = 0, closedEdges = [], capacityOverrides = {} }) {
  if (!baseline || typeof baseline !== 'object') throw new TypeError('baseline required');
  const snapshot = structuredClone(baseline);
  const current = Number.isFinite(snapshot.occupancy) ? snapshot.occupancy : null;
  const occupancy = current === null ? null : Math.max(0, current + occupancyDelta);
  const capacity = Number.isFinite(capacityOverrides.total) ? capacityOverrides.total : (Number.isFinite(snapshot.validatedCapacity) ? snapshot.validatedCapacity : null);
  return Object.freeze({
    evidenceKind: 'SIMULATION', mutatesLive: false,
    baselineId: snapshot.snapshotId ?? null, occupancy,
    capacityPressure: Number.isFinite(occupancy) && Number.isFinite(capacity) && capacity > 0 ? occupancy/capacity : null,
    closedEdges: Object.freeze([...new Set(closedEdges)]),
    assumptions: Object.freeze({ occupancyDelta, capacityOverrides: structuredClone(capacityOverrides) }),
  });
}

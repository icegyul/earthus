import { clamp } from '../core/math.js';

export function scsRunoffMm({ precipitationMm, curveNumber, initialAbstractionRatio = 0.2 }) {
  if (!Number.isFinite(precipitationMm) || precipitationMm < 0) throw new RangeError('precipitationMm must be >=0');
  if (!Number.isFinite(curveNumber) || curveNumber <= 0 || curveNumber > 100) throw new RangeError('curveNumber must be in (0,100]');
  const storageMm = 25400 / curveNumber - 254;
  const initialAbstraction = initialAbstractionRatio * storageMm;
  if (precipitationMm <= initialAbstraction) return 0;
  return ((precipitationMm - initialAbstraction) ** 2) / (precipitationMm + (1 - initialAbstractionRatio) * storageMm);
}

export function routeLinearReservoir({ inflow, previousStorage, timeStepSec, recessionConstantSec }) {
  if (![inflow, previousStorage, timeStepSec, recessionConstantSec].every(Number.isFinite) || inflow < 0 || previousStorage < 0 || timeStepSec <= 0 || recessionConstantSec <= 0) throw new RangeError('invalid routing inputs');
  const outflow = previousStorage / recessionConstantSec;
  const storage = Math.max(0, previousStorage + (inflow - outflow) * timeStepSec);
  return Object.freeze({ outflow: Math.max(0, outflow), storage });
}

export function floodScenarioGate({ officialFloodWarning, demReady, hydrographyReady, calibrationReady }) {
  if (officialFloodWarning === true) return Object.freeze({ mode: 'OFFICIAL_WARNING', simulationAllowed: true, officialPriority: true });
  const readiness = [demReady, hydrographyReady, calibrationReady].filter(Boolean).length / 3;
  return Object.freeze({ mode: readiness === 1 ? 'SCENARIO_READY' : 'SCENARIO_BLOCKED', simulationAllowed: readiness === 1, officialPriority: false, readiness: clamp(readiness, 0, 1) });
}

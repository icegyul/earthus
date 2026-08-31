import { fnv1a64, stableStringify } from '../v02/core/math.js';

export function branchScenario({baselineVersion, intervention, model, assumptions={}, seed=null}={}){
  if (!baselineVersion || !intervention || !model?.version) throw new TypeError('baselineVersion, intervention and model.version are required');
  const branchId = `scenario_${fnv1a64(stableStringify({baselineVersion,intervention,model,assumptions,seed}))}`;
  return Object.freeze({
    branchId,
    baselineVersion,
    immutableBaseline:true,
    truthClass:'SIMULATION_ONLY',
    intervention:Object.freeze(structuredClone(intervention)),
    model:Object.freeze(structuredClone(model)),
    assumptions:Object.freeze(structuredClone(assumptions)),
    seed
  });
}

export function assertBaselineUnchanged(before, after){
  if (stableStringify(before) !== stableStringify(after)) throw new Error('OBSERVED_BASELINE_MUTATED');
  return true;
}

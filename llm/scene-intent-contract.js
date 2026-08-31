const ALLOWED = new Set(['FOCUS_REGION','FOCUS_EVENT','SET_TIME','COMPARE_REVISION','OPEN_EVIDENCE','OPEN_SCENARIO','RESET_REALITY']);
export function validateSceneIntent(intent){
  if(!intent || !ALLOWED.has(intent.type)) throw new Error('UNAPPROVED_SCENE_INTENT');
  if(intent.type==='OPEN_SCENARIO' && intent.truthClass!=='SIMULATION_ONLY') throw new Error('SCENARIO_TRUTH_CLASS_REQUIRED');
  return Object.freeze(structuredClone(intent));
}

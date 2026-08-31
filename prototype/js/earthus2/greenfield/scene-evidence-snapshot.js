export function buildSceneEvidenceSnapshot({
  camera, scope, region, selectedFeature=null, time, visibleSemanticLayers=[],
  canonicalSignalRefs=[], evidenceRefs=[], truthClasses=[], sourceReadiness={}
}={}){
  if (!camera || !scope || !time) throw new TypeError('camera, scope and time are required');
  return Object.freeze({
    schemaVersion:'earthus.scene-evidence.v1',
    capturedAt:new Date().toISOString(),
    camera:Object.freeze({...camera}),
    scope,
    region:region ? Object.freeze({...region}) : null,
    selectedFeature,
    time:Object.freeze({...time}),
    visibleSemanticLayers:Object.freeze([...visibleSemanticLayers]),
    canonicalSignalRefs:Object.freeze([...canonicalSignalRefs]),
    evidenceRefs:Object.freeze([...evidenceRefs]),
    truthClasses:Object.freeze([...truthClasses]),
    sourceReadiness:Object.freeze({...sourceReadiness})
  });
}

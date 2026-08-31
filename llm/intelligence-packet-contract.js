export function validateIntelligencePacket(packet){
  const required=['eventId','revisionId','truthClasses','evidenceRefs','sceneRecipe'];
  const missing=required.filter(k=>packet?.[k]===undefined);
  if(missing.length) throw new Error(`INTELLIGENCE_PACKET_MISSING:${missing.join(',')}`);
  return Object.freeze(structuredClone(packet));
}
export const LLM_FORBIDDEN_OUTPUTS=Object.freeze(['invented_measurement','invented_probability','invented_cause','invented_geometry','invented_coordinate','official_warning_override']);

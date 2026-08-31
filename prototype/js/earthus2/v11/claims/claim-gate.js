const RULES=Object.freeze({
  SOURCE_ATTRIBUTION:['officialSourceAttribution'],
  TRANSPORT:['vectorProof','transportEvidenceKind'],
  DISCOVERY_RECOMMENDATION:['minimumSignals','safetyGate','providerEvidence'],
  FORECAST:['modelReleaseGate','calibrationEvidence','providerEvidence'],
  SAFETY_ACTION:['officialWarning'],
});
export function evaluateClaim(claimType,evidence={}){const required=RULES[claimType]||[];const missing=required.filter(k=>evidence[k]!==true&&!(k==='transportEvidenceKind'&&['MODELLED','OBSERVED'].includes(evidence[k])));return{claimType,allowed:missing.length===0,missing};}
export function claimLabel(claimType,evidence={}){const gate=evaluateClaim(claimType,evidence);if(!gate.allowed)return null;return({TRANSPORT:evidence.transportEvidenceKind==='OBSERVED'?'OBSERVED_MOTION':'MODELLED_TRANSPORT',SOURCE_ATTRIBUTION:'SOURCE_ATTRIBUTED',DISCOVERY_RECOMMENDATION:'EARTHUS_DISCOVERY',FORECAST:'EARTHUS_FORECAST',SAFETY_ACTION:'OFFICIAL_SAFETY'})[claimType]||claimType;}

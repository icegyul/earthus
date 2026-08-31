function typeOf(v){ if(v===null) return 'null'; if(Array.isArray(v)) return 'array'; return typeof v; }
export function inspectSchema(contract = {}, payload = {}) {
  const required = contract.required || {};
  const optional = contract.optional || {};
  const problems=[]; const additive=[];
  for(const [key, expected] of Object.entries(required)){
    if(!(key in payload)) problems.push({kind:'MISSING_REQUIRED', field:key, expected});
    else if(expected !== 'any' && typeOf(payload[key]) !== expected) problems.push({kind:'TYPE_MISMATCH', field:key, expected, actual:typeOf(payload[key])});
  }
  for(const [key, expected] of Object.entries(optional)){
    if(key in payload && expected !== 'any' && typeOf(payload[key]) !== expected) problems.push({kind:'OPTIONAL_TYPE_MISMATCH', field:key, expected, actual:typeOf(payload[key])});
  }
  const known=new Set([...Object.keys(required), ...Object.keys(optional)]);
  for(const key of Object.keys(payload)) if(!known.has(key)) additive.push(key);
  const breaking = problems.some(p=>p.kind==='MISSING_REQUIRED' || p.kind==='TYPE_MISMATCH');
  const severity = breaking ? 'BREAKING' : additive.length ? 'ADDITIVE' : problems.length ? 'WARNING' : 'NONE';
  return {severity, publishAllowed:!breaking, problems, additiveFields:additive};
}
export function schemaFingerprint(contract = {}) {
  const normalize=(o)=>Object.fromEntries(Object.entries(o||{}).sort(([a],[b])=>a.localeCompare(b)));
  return JSON.stringify({required:normalize(contract.required), optional:normalize(contract.optional), version:String(contract.version ?? '1')});
}

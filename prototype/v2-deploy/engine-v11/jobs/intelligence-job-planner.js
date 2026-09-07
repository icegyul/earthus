export const INTELLIGENCE_JOBS=Object.freeze([
 {id:'intelligence.travel.materialize',trigger:'KTO_OR_KMA_UPDATE',mode:'SHADOW',outputs:['FEATURE_STORE','TRAVEL_DISCOVERY']},
 {id:'intelligence.pulse.rebuild',trigger:'EVENT_NEWS_ACTION_OUTBOX',mode:'SHADOW',outputs:['EARTH_PULSE']},
 {id:'intelligence.pollution.airfire',trigger:'AIR_FIRE_VECTOR_UPDATE',mode:'SHADOW',outputs:['POLLUTION_EVENT','TRANSPORT_IF_PROVEN']},
 {id:'intelligence.action.normalize',trigger:'OFFICIAL_ACTION_INGEST',mode:'SHADOW',outputs:['PUBLIC_ACTION','EARTH_EVENT_LINK']},
 {id:'intelligence.memory.signature',trigger:'EVENT_CLOSED_OR_ARCHIVED',mode:'SHADOW',outputs:['MEMORY_SIGNATURE']},
 {id:'intelligence.forecast.groundtruth',trigger:'OBSERVATION_ARRIVAL',mode:'SHADOW',outputs:['GROUND_TRUTH_PAIR']},
 {id:'intelligence.forecast.calibrate',trigger:'DAILY_OR_MIN_SAMPLE',mode:'SHADOW',outputs:['CALIBRATION_METRICS']},
 {id:'intelligence.personal.refresh',trigger:'EXPLICIT_CONTEXT_OR_EVENT_CHANGE',mode:'SHADOW',outputs:['FOR_ME_READ_MODEL']},
]);
export function jobsForTrigger(trigger){return INTELLIGENCE_JOBS.filter(x=>x.trigger===trigger).map(x=>structuredClone(x));}

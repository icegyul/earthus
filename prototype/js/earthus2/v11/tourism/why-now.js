const RULES=[
 ['weatherSuitability',.72,'WEATHER_SUITABLE','현재/예보 기상 조건이 이 장소의 방문 조건과 잘 맞습니다.'],
 ['demandSignal',.7,'DEMAND_SIGNAL_STRONG','공식·허용된 관광 수요 신호가 상대적으로 높습니다.'],
 ['noveltySignal',.7,'DISCOVERY_NOVELTY','익숙한 인기순위 밖에서 발견 가치가 높은 후보입니다.'],
 ['relationSignal',.7,'RELATED_TRIP_LINK','현재 보고 있는 장소와 공식 연관 데이터가 강합니다.'],
 ['diversitySignal',.7,'REGIONAL_DIVERSITY','지역 관광 다양성 신호가 높습니다.'],
 ['accessibilitySignal',.8,'ACCESSIBILITY_INFO_STRONG','공식 접근성 정보가 충분한 후보입니다.'],
];
export function buildWhyNow(candidate={}){if(candidate.closed||candidate.officialRestriction||candidate.criticalHazard)return{allowed:false,reasons:[],reason:'HARD_GATE'};const source=candidate.features||candidate;const reasons=RULES.filter(([k,t])=>Number.isFinite(source[k])&&source[k]>=t).map(([featureKey,,code,copy])=>({code,featureKey,copy,value:source[featureKey],source: candidate.sources?.[featureKey]||null}));return{allowed:true,reasons,generatedFromEvidenceOnly:true};}

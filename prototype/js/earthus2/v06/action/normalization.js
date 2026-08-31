const ACTIVITY_TYPES = ['CAMPAIGN','CLEANUP','RESTORATION','RESEARCH','CITIZEN_SCIENCE','EDUCATION','EXPEDITION','ADVOCACY','OTHER'];
const TOPICS = ['AIR','FIRE','OCEAN','PLASTIC','LAND','FOREST','BIODIVERSITY','CLIMATE','WASTE','WATER','OTHER'];

const activityRules = [
  ['CLEANUP', /clean.?up|정화|수거|쓰레기 줍/i],
  ['RESTORATION', /restor|복원|재생|reforest|식재/i],
  ['CITIZEN_SCIENCE', /citizen science|시민과학/i],
  ['RESEARCH', /research|조사|탐사|monitoring|모니터링/i],
  ['EDUCATION', /education|교육|lesson|수업/i],
  ['EXPEDITION', /expedition|원정|탐험/i],
  ['ADVOCACY', /petition|청원|advocacy|정책|캠페인 요구/i],
  ['CAMPAIGN', /campaign|캠페인|action|행동/i],
];
const topicRules = [
  ['AIR', /air|대기|미세먼지|pm2\.5|pm10|오존/i],
  ['FIRE', /wildfire|산불|smoke|연기/i],
  ['OCEAN', /ocean|marine|sea|해양|바다/i],
  ['PLASTIC', /plastic|플라스틱/i],
  ['LAND', /soil|land pollution|토양|중금속/i],
  ['FOREST', /forest|산림|숲/i],
  ['BIODIVERSITY', /biodiversity|생물다양성|wildlife|야생동물/i],
  ['CLIMATE', /climate|기후|탄소|co2|methane|메탄/i],
  ['WASTE', /waste|폐기물|쓰레기/i],
  ['WATER', /water quality|수질|river|하천/i],
];

export function classifyPublicActionText(text = '') {
  const activityType = activityRules.find(([, rx]) => rx.test(text))?.[0] || 'OTHER';
  const topics = topicRules.filter(([, rx]) => rx.test(text)).map(([k]) => k);
  return { activityType, topics: topics.length ? [...new Set(topics)] : ['OTHER'] };
}

export function normalizePublicAction(raw = {}, source = {}) {
  const text = [raw.title, raw.summary, raw.description].filter(Boolean).join(' ');
  const classified = classifyPublicActionText(text);
  return {
    externalId: raw.id || raw.guid || raw.url || null,
    organization: raw.organization || source.organization || null,
    title: raw.title || 'Untitled activity',
    summary: raw.summary || raw.description || null,
    activityType: ACTIVITY_TYPES.includes(raw.activityType) ? raw.activityType : classified.activityType,
    topics: Array.isArray(raw.topics) && raw.topics.length ? raw.topics.filter((t) => TOPICS.includes(t)) : classified.topics,
    startsAt: raw.startsAt || raw.start || null,
    endsAt: raw.endsAt || raw.end || null,
    country: raw.country || null,
    region: raw.region || null,
    city: raw.city || null,
    publicAddress: raw.publicAddress || null,
    lat: Number.isFinite(raw.lat) ? raw.lat : null,
    lon: Number.isFinite(raw.lon) ? raw.lon : null,
    coordinatesExplicitlyPublished: raw.coordinatesExplicitlyPublished === true,
    officialSourceUrl: raw.officialSourceUrl || raw.url || source.url || null,
    participationUrl: raw.participationUrl || null,
    publishedAt: raw.publishedAt || null,
  };
}

export { ACTIVITY_TYPES, TOPICS };

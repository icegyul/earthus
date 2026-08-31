function norm(s) { return String(s || '').trim().toLowerCase(); }
function tokens(s) { return new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 2)); }
function jaccard(a,b) { if (!a.size || !b.size) return 0; let i=0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }

export function scoreNewsEventLink(news = {}, event = {}) {
  const topic = jaccard(tokens([news.title, news.summary, ...(news.topics || [])].join(' ')), tokens([event.title, event.summary, ...(event.topics || [])].join(' ')));
  const place = norm(news.country) && norm(news.country) === norm(event.country) ? 0.12 : 0;
  const region = norm(news.region) && norm(news.region) === norm(event.region) ? 0.18 : 0;
  const city = norm(news.city) && norm(news.city) === norm(event.city) ? 0.22 : 0;
  let time = 0;
  const nt = Date.parse(news.publishedAt || news.observedAt || '');
  const et = Date.parse(event.startsAt || event.observedAt || event.publishedAt || '');
  if (Number.isFinite(nt) && Number.isFinite(et)) {
    const h = Math.abs(nt-et)/36e5;
    time = h <= 12 ? 0.2 : h <= 48 ? 0.12 : h <= 168 ? 0.06 : 0;
  }
  return Math.min(1, topic * 0.48 + place + region + city + time);
}

export function linkNewsToEarthEvent(news, candidates = [], { autoLinkThreshold = 0.72 } = {}) {
  const ranked = candidates.map((event) => ({ event, score: scoreNewsEventLink(news, event) })).sort((a,b) => b.score-a.score);
  const best = ranked[0] || null;
  return { best, autoLinked: Boolean(best && best.score >= autoLinkThreshold), ranked };
}

export function clusterNewsByEvent(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = item.earthEventId || item.clusterKey || item.url || item.title;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, news]) => ({ key, count: news.length, news }));
}

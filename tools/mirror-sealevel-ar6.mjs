// IPCC AR6 해수면 상승 전망 미러 (NASA Sea Level Projection Tool)
//
// 왜 미러가 필요한가: NASA 엔드포인트는 서버에서는 열리지만 CORS 헤더가 없어
// 브라우저에서 직접 못 읽는다(실측 확인). 그래서 한 번 받아 요약해 S3에 올린다.
// AR6 전망값은 정적 데이터(2021년 확정)라 재수집이 필요 없다.
//
// 출처/라이선스: IPCC AR6 Sea Level Projections (Garner et al. 2021), NASA/JPL 제공.
//   원본 데이터셋은 Zenodo에 CC BY 4.0으로 공개돼 있다.
// 담는 값: 조위관측소별 · 시나리오별 · 2050/2100/2150년 중앙값(50%)과 17~83% 범위.
//   전 곡선(14개 연도)을 다 담으면 수십 MB라, 화면에서 쓰는 3개 시점만 요약한다.
//   ⚠️ 값을 만들지 않는다 — 없는 관측소·시나리오는 그냥 비운다.

import fs from 'node:fs/promises';
import path from 'node:path';

const MARKERS = 'https://sealevel.nasa.gov/projection-passthru/?markers=true';
const PROJ = (id) => `https://sealevel.nasa.gov/projection-passthru/?psmsl_id=${id}`;
const SCENARIOS = ['ssp126', 'ssp245', 'ssp370', 'ssp585'];
const YEARS = [2050, 2100, 2150];
const CONCURRENCY = 6;
const OUT = process.argv[2] || path.resolve('sealevel-ar6.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'EARTHUS/2.0 (data mirror)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

function summarize(entries) {
  // process=total, confidence=medium 만 사용 (AR6 주 전망)
  const out = {};
  for (const e of entries) {
    if (e.process !== 'total' || e.confidence !== 'medium') continue;
    if (!SCENARIOS.includes(e.scenario)) continue;
    const yr = e.year || [];
    const rec = {};
    for (const y of YEARS) {
      const i = yr.indexOf(y);
      if (i < 0) continue;
      const m = e.height_50 && e.height_50[i];
      const lo = e.height_17 && e.height_17[i];
      const hi = e.height_83 && e.height_83[i];
      if (m == null) continue;
      rec[y] = [m, lo == null ? null : lo, hi == null ? null : hi];
    }
    if (Object.keys(rec).length) out[e.scenario] = rec;
  }
  return out;
}

async function main() {
  process.stdout.write('마커 목록 조회… ');
  const fc = await getJson(MARKERS);
  const feats = (fc.features || []).filter((f) => (f.properties || {}).type === 'tide_gauge');
  console.log(`조위관측소 ${feats.length}곳`);

  const items = [];
  let done = 0;
  let failed = 0;
  let empty = 0;
  const queue = feats.slice();

  async function worker() {
    for (;;) {
      const f = queue.shift();
      if (!f) return;
      const p = f.properties || {};
      const id = p.psmsl_id;
      const c = (f.geometry || {}).coordinates || [];
      if (id == null || c.length < 2) { empty += 1; continue; }
      try {
        const proj = await getJson(PROJ(id));
        const s = summarize(Array.isArray(proj) ? proj : []);
        if (Object.keys(s).length) {
          items.push({
            id,
            name: p.name || String(id),
            country: p.country || null,
            lat: +Number(c[1]).toFixed(4),
            lon: +Number(c[0]).toFixed(4),
            span: p.time_span_of_data || null,
            s,
          });
        } else {
          empty += 1; // 전망이 없는 관측소 — 채우지 않는다
        }
      } catch (e) {
        failed += 1;
      }
      done += 1;
      if (done % 50 === 0) process.stdout.write(`  ${done}/${feats.length} (수집 ${items.length})\n`);
      await sleep(60); // 공개 엔드포인트 배려
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  items.sort((a, b) => a.id - b.id);
  const doc = {
    schema: 'earthus.sealevel.ar6.v1',
    generated: new Date().toISOString(),
    source: 'IPCC AR6 Sea Level Projections (Garner et al. 2021) · NASA/JPL Sea Level Projection Tool',
    sourceUrl: 'https://sealevel.nasa.gov/ipcc-ar6-sea-level-projection-tool',
    license: 'CC BY 4.0 (Zenodo 원본)',
    baseline: '1995–2014 평균 대비 상대 해수면 (m)',
    process: 'total · confidence medium',
    scenarios: SCENARIOS,
    years: YEARS,
    note: '전망(projection)이며 예보가 아닙니다. 값은 조위관측소 지점의 상대 해수면 상승이며 중앙값과 17~83% 범위를 함께 싣습니다.',
    counts: { stations: items.length, noProjection: empty, failed },
    items,
  };
  await fs.writeFile(OUT, JSON.stringify(doc), 'utf-8');
  const kb = Math.round((await fs.stat(OUT)).size / 1024);
  console.log(`완료: ${items.length}곳 수집 · 전망없음 ${empty} · 실패 ${failed} · ${kb}KB → ${OUT}`);
}

main().catch((e) => { console.error('실패:', e); process.exit(1); });

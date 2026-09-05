// V2 QA 마스터 체크 — 운영 사이트(earthus.net/v2)에서 항목마다 PASS/FAIL 을 판정한다.
// 기준: docs/INTELLIGENCE-EXEC-REPORT-2026-09-05.md 의 계약(시각 4분법·소스 상태 5분법·배지·패킷·감시·기준선·도달시간)과
//       이 세션에서 잡은 배포 함정 3건. 판정은 "운영에서 지금 보이는 것"만 근거로 한다. 로컬 빌드는 보지 않는다.
//
//   node tools/qa_v2_master.mjs [--skip-aws] [--skip-browser]
//   → output/qa-v2-master/result.json, docs/QA-V2-MASTER-<date>.md (표), 스크린샷
//
// 항목 ID: A 배포·무결성 / B 자료 신선도 / C 인프라 / D 인텔리전스 화면 / E 성능 / F 모바일 / G 신뢰성 규칙
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'output/qa-v2-master');
fs.mkdirSync(out, { recursive: true });
const args = new Set(process.argv.slice(2));
const SITE = 'https://earthus.net';
const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const REGION = 'ap-northeast-2';
const today = new Date().toISOString().slice(0, 10);
const results = [];
const R = (id, title, pass, evidence, opts = {}) => {
  const state = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  results.push({ id, title, state, evidence: String(evidence ?? '').slice(0, 400), ...opts });
  console.log(`${state.padEnd(4)} ${id} ${title} — ${String(evidence ?? '').slice(0, 140)}`);
};
const minutesSince = (iso) => (Number.isFinite(Date.parse(iso)) ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null);
const get = async (url, opt = {}) => {
  const res = await fetch(url, { cache: 'no-store', ...opt });
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text, bytes: text.length };
};
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const aws = (a) => execFileSync('aws', a, { encoding: 'utf8', env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE || 'earthus-deploy', MSYS_NO_PATHCONV: '1' } });

// ───────────────────────── A. 배포·무결성 ─────────────────────────
async function sectionA() {
  const dir = await get(`${SITE}/v2/`); const idx = await get(`${SITE}/v2/index.html`);
  const v = (t) => (t.match(/main\.js\?v=([^"']+)/) || [])[1];
  R('A1', '/v2/ 와 /v2/index.html 이 같은 main.js 버전을 낸다(디렉터리 키 함정)', v(dir.text) && v(dir.text) === v(idx.text), `/v2/=${v(dir.text)} · index.html=${v(idx.text)}`);
  R('A2', '/v2/ 가 CloudFront 를 거친다', /cloudfront/i.test(dir.headers['x-cache'] || dir.headers.via || ''), `x-cache=${dir.headers['x-cache']}`);
  const main = await get(`${SITE}/v2/js/main.js`);
  R('A3', 'JS 가 no-cache 로 내려와 배포 직후 새 코드가 보인다', /no-cache|max-age=0/.test(main.headers['cache-control'] || ''), `cache-control=${main.headers['cache-control']}`);
  const files = { 'js/intel-feed.js': ['drawIsochrones', 'sourceRef', 'timeLines'], 'js/event-room.js': ['SOURCE_STATE', '쓰나미 도달시간 추정', 'RELATED_KM'], 'js/watch.js': ['evaluateWatch'], 'js/ask-earth.js': ['splitSuggested'] };
  for (const [f, marks] of Object.entries(files)) {
    const r = await get(`${SITE}/v2/${f}`);
    const missing = marks.filter((m) => !r.text.includes(m));
    R(`A4-${f.split('/')[1]}`, `${f} 가 운영에 최신 계약으로 배포됨`, r.status === 200 && !missing.length, missing.length ? `없음: ${missing.join(',')}` : `${r.status} · ${Math.round(r.bytes / 1024)} KB`);
  }
  const body = JSON.stringify({ q: 'hello', lang: 'ko', layers: [{ id: 'clouds', label: 'clouds', badge: 'OBSERVED', value: 'south' }], view: { lat: 35, lon: 128, altKm: 3000 } });
  const { createHash } = await import('node:crypto');
  const ask = await get(`${SITE}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-amz-content-sha256': createHash('sha256').update(body).digest('hex') }, body });
  const aj = json(ask.text);
  R('A5', '/api/ask 가 CloudFront OAC→Lambda 로 답한다(함수 URL 인증 함정)', ask.status === 200 && aj && aj.answer, `${ask.status} · model=${aj && aj.model} · ${(aj && aj.answer || ask.text).slice(0, 60)}`);
}

// ───────────────────────── B. 자료 신선도 ─────────────────────────
async function sectionB() {
  const feeds = [
    ['B1', 'events/kma-warn.json', '기상청 특보', 60, 'generated'],
    ['B2', 'events/typhoon-official.json', '태풍 공식 발표', 180, 'generated'],
    ['B3', 'events/typhoon-ecmwf.json', 'ECMWF 앙상블', 720, 'generated'],
    ['B4', 'ocean/kma-buoy.json', '기상청 해양관측', 120, 'generated'],
    ['B5', 'events/tsunami-intl.json', 'PTWC 쓰나미', 60, 'generated'],
    ['B6', 'ocean/cyclone-events.json', '태풍 사건 패킷 색인', 240, 'generated'],
    ['B7', 'ocean/lab-reports.json', 'LAB 보고서 색인', 240, 'generatedAt'],
    ['B8', 'ocean/tsunami-eta.json', '쓰나미 도달시간 색인', 40, 'generated'],
    ['B9', 'events/kma-warn-stations.json', '특보구역 대응표', 60 * 24 * 7, 'generated'],
  ];
  for (const [id, key, name, sla, field] of feeds) {
    const r = await get(`${S3}/${key}`); const d = json(r.text);
    const age = d ? minutesSince(d[field]) : null;
    R(id, `${name} 신선도 ≤ ${sla}분`, r.status === 200 && age != null && age <= sla, `${r.status} · ${field}=${d && d[field]} · ${age}분 전`);
  }
  const idx = json((await get(`${S3}/ocean/cyclone-events.json`)).text) || { events: [] };
  const sizes = [];
  let refsOk = 0, refsTotal = 0;
  for (const e of (idx.events || []).slice(0, 8)) {
    const r = await get(`${S3}/ocean/cyclone-events/${e.gdacsId}.json`);
    sizes.push([e.name, Math.round(r.bytes / 1024)]);
    const p = json(r.text);
    const latest = p && p.revisions && p.revisions[p.revisions.length - 1];
    for (const a of Object.values((latest && latest.agencies) || {})) {
      if (!a.sourceRef) continue;
      refsTotal++;
      const h = await fetch(`${S3}/${a.sourceRef}`, { method: 'HEAD' });
      if (h.status === 200 && /immutable/.test(h.headers.get('cache-control') || '')) refsOk++;
    }
  }
  const maxKb = Math.max(...sizes.map((s) => s[1]));
  R('B10', '사건 패킷 ≤ 60 KB', sizes.length > 0 && maxKb <= 60, `최대 ${maxKb} KB · ${sizes.slice(0, 4).map((s) => `${s[0]} ${s[1]}`).join(' · ')}`);
  R('B11', '패킷 sourceRef 가 가리키는 발표 원문이 존재하고 불변(immutable)', refsTotal > 0 && refsOk === refsTotal, `${refsOk}/${refsTotal}`);
  const eta = json((await get(`${S3}/ocean/tsunami-eta.json`)).text);
  const ev = eta && eta.events && eta.events[0];
  if (ev) {
    const res = await fetch(`${S3}/${ev.key}`, { cache: 'no-store' });
    const gz = res.headers.get('content-encoding'); const len = +res.headers.get('content-length');
    const doc = await res.json();
    R('B12', '쓰나미 도달시간 사건 파일 gzip ≤ 60 KB · SIMULATION_ONLY · 한계 문구 포함', gz === 'gzip' && len <= 61440 && doc.badge === 'SIMULATION_ONLY' && doc.method && doc.method.limits.length >= 4, `${ev.place} · ${gz} ${Math.round(len / 1024)} KB · limits ${doc.method && doc.method.limits.length}`);
  } else R('B12', '쓰나미 도달시간 사건 파일', null, '색인에 사건 없음');
  for (const [id, key, name, lag] of [['B13', 'ocean/series/sst-daily.json', '해수온(OISST) 시계열', 4], ['B14', 'wind/series/korea-daily.json', '한국 기온 시계열', 4], ['B15', 'ocean/series/seaice-daily.json', '해빙 시계열', 5]]) {
    const series = json((await get(`${S3}/${key}`)).text);
    if (!series) { R(id, name, null, '키 없음'); continue; }
    // 모양: series[지역][연도] = 1월 1일부터의 일별 값 배열(뒤쪽 null 가능)
    const sr = series.series || {};
    const region = Array.isArray(Object.values(sr)[0]) ? sr : (Object.values(sr)[0] || {});   // korea-daily 는 지역 단계 없이 연도 바로
    const years = Object.keys(region).filter((y) => /^\d{4}$/.test(y)).sort();
    const y = years[years.length - 1];
    const arr = Array.isArray(region[y]) ? region[y] : [];
    let lastIdx = -1; for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null && Number.isFinite(arr[i])) { lastIdx = i; break; } }
    const last = lastIdx >= 0 ? new Date(Date.UTC(+y, 0, 1 + lastIdx)).toISOString().slice(0, 10) : null;
    const lagD = last ? (Date.now() - Date.parse(last)) / 86400000 : null;
    R(id, `${name}이 오늘까지 이어진다(공표 지연 ≤ ${lag}일)`, lagD != null && lagD <= lag, `마지막 ${last} · ${y} ${lastIdx + 1}일치 · 갱신 ${series.generated}`);
  }
}

// ───────────────────────── C. 인프라 (AWS CLI) ─────────────────────────
function sectionC() {
  if (args.has('--skip-aws')) { R('C0', 'AWS 검사', null, '--skip-aws'); return; }
  let ok = true;
  try { aws(['sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text']); } catch (e) { ok = false; R('C0', 'AWS 자격', null, '자격 없음 — C 항목 건너뜀'); }
  if (!ok) return;
  const fns = ['cyclone-analog', 'lab-events', 'lab-report-index', 'typhoon-official', 'tsunami-eta', 'earthus-llm', 'climatology-series', 'kma-warn', 'tsunami-intl'];
  const seoul = json(aws(['lambda', 'list-functions', '--region', REGION, '--query', 'Functions[].FunctionName', '--output', 'json'])) || [];
  const ohio = json(aws(['lambda', 'list-functions', '--region', 'us-east-2', '--query', 'Functions[].FunctionName', '--output', 'json'])) || [];
  const missing = fns.filter((f) => !seoul.includes(f));
  R('C1', '핵심 Lambda 9개가 ap-northeast-2 에 있다', !missing.length, missing.length ? `없음: ${missing.join(',')}` : `${fns.length}/9`);
  const dup = fns.filter((f) => ohio.includes(f));
  R('C2', 'us-east-2 에 복사본이 없다(리전 함정)', !dup.length, dup.length ? `복사본: ${dup.join(',')}` : `us-east-2 함수 ${ohio.length}개 중 겹침 0`);
  const auth = aws(['lambda', 'get-function-url-config', '--function-name', 'earthus-llm', '--region', REGION, '--query', 'AuthType', '--output', 'text']).trim();
  R('C3', 'earthus-llm 함수 URL 인증이 AWS_IAM(OAC)', auth === 'AWS_IAM', auth);
  // earthus-deploy 는 events:ListRules 가 없다 — 이름을 아는 규칙만 describe-rule 로 확인한다(그것도 막히면 SKIP)
  const ruleNames = ['tsunami-eta-schedule', 'earthus-lab-events', 'earthus-lab-report-index', 'earthus-cyclone-analog', 'earthus-climatology-sst', 'earthus-climatology-land', 'earthus-climatology-korea', 'earthus-climatology-seaice'];
  const found = [], missingRules = []; let denied = false;
  for (const n of ruleNames) {
    try { const st = aws(['events', 'describe-rule', '--name', n, '--region', REGION, '--query', 'State', '--output', 'text']).trim(); (st === 'ENABLED' ? found : missingRules).push(n); }
    catch (e) { if (/AccessDenied/.test(String(e.stderr || e))) { denied = true; break; } missingRules.push(n); }
  }
  R('C4', '스케줄 규칙 활성(tsunami-eta·lab-events·lab-report-index·cyclone-analog·climatology×4)', denied ? null : missingRules.length === 0, denied ? 'events:DescribeRule 권한 없음' : (missingRules.length ? `없거나 비활성: ${missingRules.join(',')}` : `${found.length}/${ruleNames.length} 활성`));
  const errs = [];
  for (const f of ['cyclone-analog', 'tsunami-eta', 'lab-events', 'typhoon-official']) {
    try {
      const o = aws(['logs', 'filter-log-events', '--log-group-name', `/aws/lambda/${f}`, '--region', REGION, '--start-time', String(Date.now() - 6 * 3600000), '--filter-pattern', '"Task timed out" "[ERROR]" "Traceback"', '--query', 'length(events)', '--output', 'text']).trim();
      const n = parseInt(o, 10); if (Number.isFinite(n) && n > 0) errs.push(`${f}:${n}`);
    } catch { /* 로그 그룹 없음 */ }
  }
  R('C5', '최근 6시간 Lambda 오류·타임아웃 없음', !errs.length, errs.length ? errs.join(' ') : '0건');
}

// ───────────────────────── D·E·F·G. 브라우저 (운영) ─────────────────────────
async function sectionBrowser() {
  if (args.has('--skip-browser')) { R('D0', '브라우저 검사', null, '--skip-browser'); return; }
  const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
  const { chromium, devices } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('earthus.seen.intro.v1', '1'); localStorage.setItem('earthus.myplace', JSON.stringify({ lat: 35.18, lon: 129.08 })); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const pageErrors = []; const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const badResponses = [];
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
  const click = (sel, i = 0) => page.evaluate(([s, k]) => { const el = document.querySelectorAll(s)[k]; if (!el) return false; el.scrollIntoView(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }, [sel, i]);
  const text = () => page.evaluate(() => (document.querySelector('#intel-content') || {}).textContent || '');
  const t0 = Date.now();
  try {
    await page.goto(`${SITE}/v2/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#intel-tab', { timeout: 90000 });
    const tBoot = (Date.now() - t0) / 1000;
    R('E1', '첫 화면(셸 준비)까지 ≤ 20초', tBoot <= 20, `${tBoot.toFixed(1)}초 (헤드리스·소프트웨어 GL)`);
    for (let k = 0; k < 6; k++) { await click('#intel-tab'); if (await page.$('[data-tab="feed"]')) break; await page.waitForTimeout(1500); }
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab));
    R('D1', '인텔리전스 탭 6개(사건·내 장소·선택 자료·근거·예보·가정 실험)', ['feed', 'my', 'now', 'why', 'next', 'scenario'].every((t) => tabs.includes(t)), tabs.join(','));
    await click('[data-tab="feed"]');
    const tf = Date.now();
    await page.waitForFunction(() => document.querySelector('#intel-content .feed-item'), null, { timeout: 90000 }).catch(() => {});
    const waitFeed = () => page.waitForFunction(() => !/받는 중/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 120000 }).catch(() => {});
    await waitFeed();
    for (let k = 0; k < 2; k++) { if (await page.$('#intel-content .feed-follow')) break; if (!(await click('[data-action="feed-retry"]'))) break; await page.waitForTimeout(3000); await waitFeed(); }
    const tFeed = (Date.now() - tf) / 1000;
    const feed = await page.evaluate(() => { const c = document.querySelector('#intel-content'); const items = [...c.querySelectorAll('.feed-item')]; return { n: items.length, sub: items.filter((i) => i.querySelector('.feed-sub')).length, tc: items.findIndex((i) => i.querySelector('.feed-follow')), eq: items.findIndex((i) => i.querySelector('.feed-dot.eq')), note: (c.querySelector('.feed-note') || {}).textContent || '', text: c.textContent }; });
    R('E2', '사건 피드 도착 ≤ 90초(GDACS 1.7 MB 포함)', tFeed <= 90 && feed.n > 0, `${tFeed.toFixed(0)}초 · 카드 ${feed.n}`);
    R('D2', '사건 카드가 뜨고 카드마다 시각 줄이 있다', feed.n > 0 && feed.sub === feed.n, `${feed.sub}/${feed.n}`);
    R('D3', '출처 상태 줄(GDACS·USGS 건수 또는 조회 불가)이 있다', /GDACS/.test(feed.note) && /USGS/.test(feed.note), feed.note.slice(0, 100));
    R('D4', '정렬 기준이 화면에 적혀 있다', /정렬/.test(feed.text), '');
    R('D5', '태풍(GDACS) 카드가 있다', feed.tc >= 0, feed.tc >= 0 ? `index ${feed.tc}` : 'GDACS 실패 또는 사건 없음');
    R('G1', '피드에 "방금"·"안전"·"위험 없음" 같은 지어낸 문구가 없다', !/방금|안전합니다|위험 없음/.test(feed.text), '');
    await page.screenshot({ path: path.join(out, 'feed.png') });
    if (feed.tc >= 0) {
      // 기관별 행(D10)은 공식 발표가 있는 태풍에만 있다 — 첫 카드가 열대저기압(발표 없음)이면 다음 태풍 카드로 넘어간다(최대 3장)
      const tcIdx = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].map((it, i) => (it.querySelector('.feed-follow') ? i : -1)).filter((i) => i >= 0).slice(0, 3));
      let picked = tcIdx[0];
      for (const i of tcIdx) {
        await click('#intel-content .feed-item', i);
        await page.waitForSelector('.room-src', { timeout: 90000 });
        await page.waitForTimeout(5000);
        const hasKma = await page.evaluate(() => /한국 기상청\s*발표/.test(document.querySelector('#intel-content').textContent.replace(/\s+/g, ' ')));
        picked = i;
        if (hasKma) break;
        await click('[data-action="feed-back"]'); await page.waitForTimeout(600);
      }
      await click('#intel-content .feed-item', picked);
      await page.waitForSelector('.room-src', { timeout: 90000 });
      await page.waitForTimeout(5000);
      const room = await page.evaluate(() => { const c = document.querySelector('#intel-content'); const rows = [...c.querySelectorAll('.room-src')]; return { n: rows.length, fail: rows.filter((r) => r.classList.contains('fail')).length, failRetry: rows.filter((r) => r.classList.contains('fail') && r.querySelector('[data-action="room-retry"]')).length, badges: rows.filter((r) => r.querySelector('.badge')).length, text: c.textContent, chips: c.querySelectorAll('.rev-chip').length, srcLinks: [...c.querySelectorAll('a.official-out')].filter((a) => /typhoon-official\/archive/.test(a.href)).length, kmaRow: /한국 기상청발표|한국 기상청\s*발표/.test(c.textContent.replace(/\s+/g, ' ')) }; });
      R('D6', '사건 방 기관 스택 ≥ 5줄', room.n >= 5, `${room.n}줄 · 실패 ${room.fail}`);
      R('D7', '실패한 소스 줄은 사라지지 않고 재시도 버튼이 있다', room.fail === room.failRetry, `${room.failRetry}/${room.fail}`);
      R('D8', '모든 소스 줄에 배지가 있다(배지 동일성)', room.badges === room.n, `${room.badges}/${room.n}`);
      R('D9', 'EVIDENCE 시각 4분법(발표·갱신·수집)', /발표/.test(room.text) && /갱신/.test(room.text) && /수집/.test(room.text), '');
      R('D10', '기관별 행(한국 기상청 발표 …)', room.kmaRow, '');
      R('D11', '행동 칸이 조회 실패를 "특보 없음"으로 적지 않는다', !(/특보 없음/.test(room.text) && /조회 불가/.test(room.text)), '');
      R('D12', '이전 발표와 비교 카드(회차 칩) + 당시 발표 원문 링크', room.chips >= 1 && room.srcLinks >= 1, `칩 ${room.chips} · 원문 링크 ${room.srcLinks}`);
      R('D13', '당시 전망 검증 카드', /당시 전망 검증/.test(room.text), '');
      R('G2', '사건 방에 "안전"·"위험 없음" 문구 없음', !/안전합니다|위험 없음/.test(room.text), '');
      await page.screenshot({ path: path.join(out, 'event-room.png') });
      await click('[data-tab="next"]'); await page.waitForTimeout(600);
      R('D14', 'NEXT 탭이 고른 사건의 다음 발표·전망을 자동으로 채운다', /\+24h|24시간|다음 발표|예보/.test(await text()), '');
      await click('[data-tab="why"]'); await page.waitForTimeout(600);
      const why = await page.evaluate(() => ({ badges: document.querySelectorAll('#intel-content .badge').length, text: document.querySelector('#intel-content').textContent }));
      R('D15', 'WHY(자료의 근거) 탭에 배지 달린 근거 줄이 있다', why.badges >= 2, `배지 ${why.badges}`);
      await click('[data-tab="scenario"]'); await page.waitForTimeout(600);
      const sc = await text();
      R('D16', '가정 실험: 기준선(최신 공식 +24h) 카드 또는 정직한 "확인 불가"', /기준선이 있는 가정 실험/.test(sc) || /기준선.*확인 불가|공식 \+24h 전망이 아직/.test(sc), sc.includes('기준선이 있는') ? '기준선 있음' : '기준선 없음(정직 표기)');
      R('G3', '가정 실험 문구에 피해·대피 없음, SIMULATION_ONLY 표기', !/피해|대피/.test(sc) && /SIMULATION_ONLY|시뮬레이션/.test(sc), '');
      await click('[data-tab="feed"]'); await page.waitForTimeout(500); await click('[data-action="feed-back"]'); await page.waitForTimeout(800);
      const fol = await page.evaluate(() => { const b = document.querySelector('#intel-content .feed-follow'); if (!b) return null; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; });
      await page.waitForTimeout(600);
      const folState = await page.evaluate(() => ({ on: document.querySelectorAll('#intel-content .feed-item.followed').length, ls: localStorage.getItem('earthus.follow') }));
      R('D17', '★ 팔로우가 카드에 반영되고 localStorage 에 남는다', fol && folState.on >= 1 && /tc-/.test(folState.ls || ''), `followed ${folState.on} · ${folState.ls}`);
    } else { for (const id of ['D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'D14', 'D15', 'D16', 'D17', 'G2', 'G3']) R(id, '(태풍 카드 없음)', null, 'GDACS 미도착'); }
    const eqIdx = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((i) => i.querySelector('.feed-dot.eq')));
    if (eqIdx >= 0) {
      await click('#intel-content .feed-item', eqIdx);
      await page.waitForSelector('.room-src', { timeout: 90000 }); await page.waitForTimeout(3000);
      const t = await text();
      const st = /도달시간 계산 대상이 아닙니다/.test(t) ? 'NOT_TARGET' : /첫 파 도달 추정/.test(t) ? 'PRESENT' : /쓰나미 도달시간 추정[\s\S]{0,200}조회 불가/.test(t) ? 'FAILED' : 'MISSING';
      R('D18', '지진 사건 방에 쓰나미 도달시간 행(있음/대상 아님/조회 불가)', st !== 'MISSING', st);
      R('D19', '지진 방에 PTWC 쓰나미 메시지 줄(있음/미확인/조회 불가)이 있다', /쓰나미 메시지/.test(t), '');
      R('G4', '지진 방에 "위험 없음" 류 문구 없음', !/위험 없음|안전합니다/.test(t), '');
      await page.screenshot({ path: path.join(out, 'quake-room.png') });
      await click('[data-tab="feed"]'); await page.waitForTimeout(400); await click('[data-action="feed-back"]'); await page.waitForTimeout(500);
    } else { R('D18', '지진 사건 방 도달시간 행', null, '지진 카드 없음'); R('D19', '지진 방 쓰나미 줄', null, '지진 카드 없음'); R('G4', '지진 방 문구', null, '지진 카드 없음'); }
    await click('[data-tab="my"]'); await page.waitForTimeout(500);
    await click('[data-action="my-refresh"]'); await page.waitForTimeout(10000);
    const my = await text();
    R('D20', '내 장소: 내 특보 구역(근사 표기) + 구역 특보 행', /내 특보 구역/.test(my) && /근사|대응표 조회 불가/.test(my), (my.match(/내 특보 구역[^\n]{0,40}/) || [''])[0]);
    R('D21', '감시 카드: 조건 3종 + "앱을 열었을 때만 판정" 명시 또는 "감시 중단"', /감시 중단|앱을 열었을 때/.test(my), '');
    R('D22', '내 장소 자료마다 기준 시각이 있다', /기준 시각/.test(my), '');
    await page.screenshot({ path: path.join(out, 'my-place.png') });
    await click('#btn-ask'); await page.waitForTimeout(500);
    const askOk = await page.evaluate(async () => { const q = document.getElementById('ask-q'); const go = document.getElementById('ask-go'); if (!q || !go) return null; q.value = '지금 태풍은 어디로 가고 있어?'; go.click(); return true; });
    if (askOk) {
      await page.waitForFunction(() => { const t = (document.getElementById('ask-out') || {}).textContent || ''; return t && !/읽는 중|묻는 중|asking|reading/i.test(t); }, null, { timeout: 60000 }).catch(() => {});
      const a = await page.evaluate(() => ({ t: (document.getElementById('ask-out') || {}).textContent || '', btn: document.querySelectorAll('[data-ask-show]').length }));
      R('D23', '지구에 묻기: 답이 오고, 자료 부족이면 "켜기" 제안 버튼', !/답을 받지 못했습니다/.test(a.t) && (!/자료 부족/.test(a.t) || a.btn >= 1), `${a.t.slice(0, 90)} · 버튼 ${a.btn}`);
      R('G5', '지구에 묻기 답에 출처 문구("스냅샷만 보고")가 붙는다', /스냅샷만 보고|snapshot/.test(a.t), '');
    } else R('D23', '지구에 묻기', null, '서랍 없음');
    await page.screenshot({ path: path.join(out, 'ask.png') });
    const known = (m) => /usage_bump|favicon/.test(m);
    const errs = pageErrors.length;
    const bad = [...new Set(badResponses)].filter((m) => !known(m));
    R('E3', '페이지 예외 0건', errs === 0, errs ? pageErrors.slice(0, 2).join(' | ') : '0');
    R('E4', '4xx/5xx 응답(usage_bump·favicon 제외) 0건 — 없는 자료를 요청하지 않는다', bad.length === 0, bad.slice(0, 6).join(' | ') || '0');
    const perf = await page.evaluate(() => { const es = performance.getEntriesByType('resource'); const js = es.filter((e) => /\.js(\?|$)/.test(e.name)); const sum = (a) => a.reduce((x, e) => x + (e.transferSize || e.encodedBodySize || 0), 0); return { js: Math.round(sum(js) / 1024), all: Math.round(sum(es) / 1024 / 1024 * 10) / 10, n: es.length }; });
    R('E5', 'JS 전송량 ≤ 3 MB', perf.js <= 3072, `JS ${perf.js} KB · 전체 ${perf.all} MB · 요청 ${perf.n}`);
  } catch (e) {
    R('D-ERR', '브라우저 검사 중단', false, String(e && e.message || e).slice(0, 200));
    try { await page.screenshot({ path: path.join(out, 'failure.png') }); } catch { /* */ }
  }
  // ── F. 모바일 (iPhone 13 에뮬레이션) ──
  try {
    const mctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR' });
    await mctx.addInitScript(() => { try { localStorage.setItem('earthus.seen.intro.v1', '1'); } catch (e) { /* */ } });
    const mp = await mctx.newPage();
    await mp.goto(`${SITE}/v2/?qa=m${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mp.waitForSelector('#intel-tab', { timeout: 90000 }); await mp.waitForTimeout(2500);
    for (let k = 0; k < 8; k++) {
      const open = await mp.evaluate(() => { const t = document.querySelector('[data-tab="feed"]'); return !!(t && t.getBoundingClientRect().height > 0); });
      if (open) break;
      await mp.evaluate(() => { const b = document.querySelector('#intel-tab'); b && b.click(); });
      await mp.waitForTimeout(2000);
    }
    const m = await mp.evaluate(() => { const tabs = [...document.querySelectorAll('[data-tab]')]; const r = tabs.map((t) => t.getBoundingClientRect()); const inView = r.filter((b) => b.right <= innerWidth && b.left >= 0 && b.height > 0).length; const small = tabs.filter((t) => t.getBoundingClientRect().height < 32).length; return { tabs: tabs.length, inView, small, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, content: (() => { const c = document.querySelector('#intel-content'); return c ? { sh: c.scrollHeight, ch: c.clientHeight, ov: getComputedStyle(c).overflowY } : null; })() }; });
    R('F1', '모바일: 탭이 화면 안에 있다', m.tabs >= 6 && m.inView === m.tabs, `${m.inView}/${m.tabs} 보임`);
    R('F2', '모바일: 가로 스크롤 없음', m.scrollW <= m.innerW, `scrollWidth ${m.scrollW} / viewport ${m.innerW}`);
    R('F3', '모바일: 탭 버튼 높이 ≥ 32px(터치 타깃)', m.small === 0, `${m.small}개 작음`);
    await mp.evaluate(() => document.querySelector('[data-tab="feed"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await mp.waitForFunction(() => document.querySelector('#intel-content .feed-item'), null, { timeout: 90000 }).catch(() => {});
    const opened = await mp.evaluate(async () => { const it = document.querySelector('#intel-content .feed-item'); if (!it) return null; it.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 4000)); return !!document.querySelector('.room-src'); });
    R('F4', '모바일: 카드 탭 → 사건 방 열림', opened === true, opened == null ? '카드 없음' : String(opened));
    // 스크롤 컨테이너는 #intel-body(max-height 52vh, overflow-y auto)다 — #intel-content 는 그 안의 내용
    const c2 = await mp.evaluate(() => { const c = document.querySelector('#intel-body'); return c ? { sh: c.scrollHeight, ch: c.clientHeight, ov: getComputedStyle(c).overflowY, fits: c.clientHeight <= innerHeight } : null; });
    R('F5', '모바일: 패널(#intel-body)이 화면 안에서 스크롤된다', c2 && /auto|scroll/.test(c2.ov) && c2.fits && c2.sh > c2.ch, c2 ? `${c2.ov} · 내용 ${c2.sh} / 보임 ${c2.ch}` : '패널 없음');
    await mp.screenshot({ path: path.join(out, 'mobile-room.png') });
    await mctx.close();
  } catch (e) { R('F-ERR', '모바일 검사 중단', false, String(e && e.message || e).slice(0, 200)); }
  await browser.close();
}

await sectionA();
await sectionB();
sectionC();
await sectionBrowser();

const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
for (const r of results) counts[r.state]++;
const md = [`# EARTHUS V2 QA 마스터 체크 — ${today}`, '',
  `대상: ${SITE}/v2 (운영) · 판정 시각 ${new Date().toISOString()} · 도구 \`tools/qa_v2_master.mjs\``, '',
  `**PASS ${counts.PASS} · FAIL ${counts.FAIL} · SKIP ${counts.SKIP}** (전체 ${results.length})`, '',
  '기준: `docs/INTELLIGENCE-EXEC-REPORT-2026-09-05.md` 의 계약과 배포 함정 3건. 판정 근거는 운영에서 지금 보이는 것뿐이다. 브라우저 항목은 헤드리스 Chromium(소프트웨어 GL)이라 성능 수치는 실기기보다 느리게 나온다.', '',
  '| ID | 항목 | 판정 | 근거 |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.state === 'PASS' ? '✅ PASS' : r.state === 'FAIL' ? '❌ FAIL' : '⏭ SKIP'} | ${r.evidence.replace(/\|/g, '/').replace(/\n/g, ' ')} |`), '',
  '## 구분', '- A 배포·무결성 · B 자료 신선도 · C 인프라(AWS) · D 인텔리전스 화면 · E 성능 · F 모바일(iPhone 13 에뮬레이션) · G 신뢰성 규칙(지어낸 문구 금지)', '',
  '## FAIL 항목', ...(results.filter((r) => r.state === 'FAIL').map((r) => `- **${r.id}** ${r.title} — ${r.evidence}`) || []), ...(counts.FAIL ? [] : ['- 없음']), '',
  '## 스크린샷', `- \`output/qa-v2-master/\`: feed.png · event-room.png · quake-room.png · my-place.png · ask.png · mobile-room.png`, ''].join('\n');
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ site: SITE, at: new Date().toISOString(), counts, results }, null, 2));
fs.writeFileSync(path.join(root, `docs/QA-V2-MASTER-${today}.md`), md);
console.log(`\n${JSON.stringify(counts)} → docs/QA-V2-MASTER-${today}.md`);

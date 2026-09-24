// EARTHUS 새 탭 확장 — 운영 자료(earthus.net) 로 재는 측정 스크립트 (2026-09-24 · 지시서 Phase 3 완료 기준 1·2·4·5·6·7·9·10·12·13·14·15)
//
// 무엇을 하나: 풀린(unpacked) 확장을 Playwright Chromium 에 싣고(--load-extension) 새 탭을 실제로 열어 잰다.
//   · 첫 설치: 캐시 없이 바탕+밤 경계까지(ms), 구름이 도착해 한 번 교체되기까지(ms)
//   · 첫 그림: 따뜻한 상태에서 20번 열어 중앙값(캐시 합성본 → 지구+구름+관측 시각)
//   · 정지: 연 뒤 rAF 호출 수(0 이어야 함), 5초 뒤 5초 동안의 CPU(TaskDuration), 남은 애니메이션 수
//   · 출처: .value-el 마다 data-source · data-time 이 있고 화면 글자에 시각이 보이는가
//   · 오프라인: context.setOffline(true) → 마지막 그림 + 관측 시각 + '오프라인' 문구, http(s) 요청 0건
//   · 알람 조건: 새 탭을 2시간 넘게 안 연 상태로 알람을 부르면 fetch 0건
//   · 형식 변경: 저장된 특보 자료를 '형식 변경'으로 바꾸면 그 줄만 바뀐다
//   · 언어: --lang=ko 면 한국어, --lang=fr 이면 영어
//   · 스크린샷 1280×800 · 1366×768 · 1920×1080 (+ 영어 1280×800, 오프라인)
// ⚠️ 쓰기는 하지 않는다 — 운영 자료를 GET 으로 받을 뿐이다. 배포·업로드와 무관하다.
// ⚠️ 측정하지 못하는 것(수동 확인): Chrome 138+ 하단 '새 탭 제공 확장' 바(브라우저 UI 라 페이지 스크린샷에 안 잡힌다) ·
//    새 탭에서 곧바로 친 글자가 주소창으로 가는가(주소창은 페이지 밖이다). 결과 JSON 의 manual 항목에 적는다.
//
// 실행: node apps/chrome-newtab/tests/measure-live.mjs
//   EARTHUS_SHOT_DIR 로 스크린샷·결과 폴더를 바꿀 수 있다(기본: 저장소 루트 build/app-build — git 무시 폴더).
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const nm = process.env.EARTHUS_NODE_MODULES || 'D:/## APP/EARTHUS v2_APP/node_modules/';
const { chromium } = createRequire(nm.endsWith('/') ? nm : nm + '/')('playwright');
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const OUT = (process.env.EARTHUS_SHOT_DIR || 'D:/## APP/EARTHUS v2_APP/build/app-build').replace(/\\/g, '/');
const PROFILES = path.join(OUT, 'chrome-profiles');
mkdirSync(OUT, { recursive: true });

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = { at: new Date().toISOString(), ext: EXT, runs: {}, manual: [
  'Chrome 138+ 하단 "새 탭 제공 확장" 바를 켠 실제 Chrome 에서 세 해상도로 출처 줄·버튼·카드가 가려지지 않는지(지시서 기준 9 — 여기서는 하단 72px 여백만 확인)',
  '새 탭을 열자마자 친 글자가 주소창에 들어가는지(기준 8 — 페이지에 입력칸이 없음은 package.test.mjs 가 확인)',
  '저사양 기기(4GB 크롬북)에서 첫 그림 200 ms(기준 1 — 여기 수치는 이 PC)',
] };

async function launch(lang) {
  const dir = path.join(PROFILES, lang);
  rmSync(dir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${lang}`],
  });
  await ctx.addInitScript(() => {
    window.__rafCalls = 0;
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { window.__rafCalls += 1; return orig.call(window, cb); };
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  return { ctx, sw, id, url: `chrome-extension://${id}/newtab.html` };
}

async function openTab(run, { wait = 'paint' } = {}) {
  const page = await run.ctx.newPage();
  const http = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) http.push(r.url()); });
  await page.goto(run.url);
  if (wait === 'paint') await page.waitForFunction(() => document.documentElement.dataset.firstPaintMs || document.documentElement.dataset.error, null, { timeout: 30000, polling: 100 });
  return { page, http };
}
const swStats = (run) => run.sw.evaluate(() => ({ fetches: self.__earthus.stats.fetches, alarms: self.__earthus.stats.alarms, skipped: self.__earthus.stats.skipped }));

async function readPage(page) {
  return page.evaluate(() => {
    const d = document.documentElement.dataset;
    const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
    const values = [...document.querySelectorAll('.value-el')].filter(vis).map((el) => ({
      id: el.id || el.dataset.line, text: el.innerText.replace(/\s+/g, ' ').trim(),
      source: el.dataset.source || '', time: el.dataset.time || '',
    }));
    const facts = [...document.querySelectorAll('#facts > li')].map((li) => ({ line: li.dataset.line, status: li.dataset.status, text: li.innerText.replace(/\s+/g, ' ').trim() }));
    return {
      error: d.error || null, firstPaintMs: d.firstPaintMs ? +d.firstPaintMs : null, firstPaintFrom: d.firstPaintFrom || null,
      // (2026-09-24 검수 추가) 브라우저가 잰 first-contentful-paint 도 같이 싣는다 — firstPaintMs 는 drawImage 직후의 스크립트 시각이라
      //   실제 화면 칠과 다를 수 있다. 둘 다 200 ms 안인지 본다.
      fcpMs: (() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? +e.startTime.toFixed(1) : null; })(),
      lang: document.documentElement.lang, title: document.title,
      status: document.getElementById('status').hidden ? null : document.getElementById('status').innerText,
      clouds: vis(document.getElementById('src-clouds')) ? document.getElementById('src-clouds').innerText : null,
      night: document.getElementById('src-night').innerText,
      base: document.getElementById('src-base').innerText,
      facts, values,
      links: [...document.querySelectorAll('.links a')].map((a) => ({ text: a.innerText, href: a.href, target: a.target })),
      rafCalls: window.__rafCalls, animations: document.getAnimations().length,
    };
  });
}

function honesty(values) {
  const bad = values.filter((v) => !v.source || !v.time || !/\d{2}:\d{2}/.test(v.text));
  return { count: values.length, ok: values.length > 0 && bad.length === 0, bad };
}

async function inViewport(page, vh) {
  return page.evaluate((h) => {
    const sel = ['#globe', '#credits', '#facts', '#link-earth', '#link-v2', '#src-clouds', '#src-night'];
    const out = {};
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!el || el.hidden) { out[s] = 'hidden'; continue; }
      const r = el.getBoundingClientRect();
      out[s] = r.bottom <= h - 48 && r.top >= 0 && r.right <= window.innerWidth ? 'ok' : `out(bottom=${Math.round(r.bottom)})`;
    }
    return out;
  }, vh);
}

/* ── 한국어 ─────────────────────────────────────────────────────────── */
{
  const run = await launch('ko');
  const R = (result.runs.ko = { id: run.id });

  // 첫 설치(캐시 없음)
  const t0 = Date.now();
  const first = await openTab(run);
  R.firstInstall = await readPage(first.page);
  R.firstInstall.file = path.join(OUT, 'chrome-ko-first-install-1280x800.png').replace(/\\/g, '/');
  await first.page.screenshot({ path: R.firstInstall.file });
  await first.page.waitForFunction(() => !document.getElementById('src-clouds').hidden, null, { timeout: 90000, polling: 100 });
  R.firstInstall.cloudArrivedMs = Date.now() - t0;
  R.firstInstall.afterCloud = await readPage(first.page);
  R.firstInstall.pageHttpRequests = first.http;
  // 구름 짝(기준 3): 쥔 구름 blob 의 sha256 을 확장 안에서 다시 재서, 지금 운영 meta 와 라벨 시각을 맞춰 본다
  {
    const held = await first.page.evaluate(async () => {
      const { cloud } = await chrome.storage.local.get('cloud');
      const c = await caches.open('earthus-newtab-v1');
      const r = await c.match('https://earthus.net/__earthus-newtab/cloud-2048.webp');
      const buf = r ? await r.arrayBuffer() : null;
      const hex = buf ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('') : null;
      return { pointer: cloud, blobSha256: hex, blobBytes: buf ? buf.byteLength : 0, label: document.getElementById('src-clouds').dataset.time };
    });
    const meta = await (await fetch('https://earthus.net/clouds/meta.json', { cache: 'no-store' })).json();
    R.cloudPair = {
      ...held,
      liveMetaTime: meta.time, liveMetaSha256: meta.variants.webp2048.sha256,
      shaMatchesLiveMeta: held.blobSha256 === meta.variants.webp2048.sha256,
      labelMatchesMetaTime: held.label === meta.time,
    };
  }
  await sleep(1500);                 // 합성본이 캐시에 저장될 틈
  await first.page.close();

  // chrome://newtab 이 이 확장으로 바뀌는가
  const ntp = await run.ctx.newPage();
  await ntp.goto('chrome://newtab');
  await ntp.waitForFunction(() => document.documentElement.dataset.firstPaintMs, null, { timeout: 30000, polling: 100 });
  R.chromeNewtabUrl = ntp.url();
  await ntp.close();

  // 따뜻한 상태 20회
  const warm = await openTab(run); await warm.page.close();
  const samples = [];
  const from = [];
  const fcps = [];
  for (let i = 0; i < 20; i++) {
    const { page } = await openTab(run);
    const r = await readPage(page);
    samples.push(r.firstPaintMs); from.push(r.firstPaintFrom); fcps.push(r.fcpMs);
    await page.close();
  }
  R.firstPaint = { samplesMs: samples, medianMs: median(samples), maxMs: Math.max(...samples), from: [...new Set(from)],
    fcpSamplesMs: fcps, fcpMedianMs: fcps.every((x) => x != null) ? median(fcps) : null };

  // 정지: 5초 뒤 5초 동안
  {
    const { page } = await openTab(run);
    const cdp = await run.ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await sleep(5000);
    const m1 = await cdp.send('Performance.getMetrics');
    const raf1 = await page.evaluate(() => window.__rafCalls);
    await sleep(5000);
    const m2 = await cdp.send('Performance.getMetrics');
    const get = (m, n) => (m.metrics.find((x) => x.name === n) || {}).value;
    const r = await readPage(page);
    R.idle = {
      rafCallsTotal: r.rafCalls, rafCallsAfter5s: r.rafCalls - raf1, animationsAfter10s: r.animations,
      taskSecondsIn5s: +(get(m2, 'TaskDuration') - get(m1, 'TaskDuration')).toFixed(4),
      cpuPercentApprox: +(((get(m2, 'TaskDuration') - get(m1, 'TaskDuration')) / 5) * 100).toFixed(2),
      initScriptRan: r.rafCalls !== undefined,
    };
    R.page = r;
    R.honesty = honesty(r.values);
    await page.close();
  }

  // 스크린샷 세 해상도
  R.shots = {};
  for (const [w, h] of [[1280, 800], [1366, 768], [1920, 1080]]) {
    const page = await run.ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.goto(run.url);
    await page.waitForFunction(() => document.documentElement.dataset.firstPaintMs, null, { polling: 100 });
    await sleep(800);
    const file = path.join(OUT, `chrome-ko-${w}x${h}.png`).replace(/\\/g, '/');
    await page.screenshot({ path: file });
    R.shots[`${w}x${h}`] = { file, inViewport: await inViewport(page, h) };
    await page.close();
  }

  // 알람 조건: 2시간 넘게 안 열었으면 0건 · 방금 열었으면 받는다
  {
    await run.sw.evaluate(async () => chrome.storage.local.set({ lastNewtabOpenAt: Date.now() - 3 * 3600 * 1000 }));
    const s0 = await swStats(run);
    const r1 = await run.sw.evaluate(() => self.__earthus.onAlarm());
    const s1 = await swStats(run);
    await run.sw.evaluate(async () => chrome.storage.local.set({ lastNewtabOpenAt: Date.now() }));
    const r2 = await run.sw.evaluate(() => self.__earthus.onAlarm());
    const s2 = await swStats(run);
    R.alarmGate = { stale: { result: r1, fetches: s1.fetches - s0.fetches }, recent: { result: r2, fetches: s2.fetches - s1.fetches } };
  }

  // 오프라인: 마지막 그림 + 관측 시각 + '오프라인', 요청 0건
  {
    const s0 = await swStats(run);
    await run.ctx.setOffline(true);
    const { page, http } = await openTab(run);
    await sleep(3000);
    const r = await readPage(page);
    const file = path.join(OUT, 'chrome-ko-offline-1280x800.png').replace(/\\/g, '/');
    await page.screenshot({ path: file });
    const s1 = await swStats(run);
    R.offline = { status: r.status, clouds: r.clouds, pageHttpRequests: http, swFetchesDuring: s1.fetches - s0.fetches, firstPaintMs: r.firstPaintMs, file };
    await page.close();
    await run.ctx.setOffline(false);
  }

  // 설정: 옵션 페이지에서 부산을 고르면 새 탭의 중심·하늘 줄이 부산이 된다(위치 권한 없이)
  {
    const opt = await run.ctx.newPage();
    await opt.goto(`chrome-extension://${run.id}/options.html`);
    await opt.waitForSelector('#city option', { state: 'attached' });
    await opt.selectOption('#city', 'busan');
    await opt.waitForFunction(() => !document.getElementById('saved').hidden, null, { polling: 100 });
    R.options = { station: await opt.innerText('#station'), file: path.join(OUT, 'chrome-ko-options.png').replace(/\\/g, '/') };
    await opt.screenshot({ path: R.options.file });
    await opt.close();
    const { page } = await openTab(run);
    await sleep(1500);
    const r = await readPage(page);
    R.options.place = await page.innerText('#place-label');
    R.options.sky = (r.facts.find((f) => f.line === 'sky') || {}).text || null;
    R.options.firstPaintFrom = r.firstPaintFrom;
    await page.close();
    await run.sw.evaluate(async () => chrome.storage.local.set({ settings: { cityId: 'seoul' } }));
  }

  // 형식 변경: 저장된 특보 자료를 형식 변경으로 바꾸면 그 줄만 바뀐다
  {
    await run.sw.evaluate(async () => {
      const { feeds } = await chrome.storage.local.get('feeds');
      feeds.kmaWarn = { ok: false, reason: 'format', missing: ['observedKst'], fetchedAt: Date.now() };
      await chrome.storage.local.set({ feeds, lastFetchAt: Date.now() });
    });
    const { page } = await openTab(run);
    R.formatChange = (await readPage(page)).facts;
    await page.close();
  }

  // (2026-09-24 정정 · L4 · PD 결정) 쓰나미 줄 기본 꺼짐 · 지진 줄 기상청 항목만 — 결과로 본다.
  //   ① 기본 설치(쓰나미 선택 저장 없음)에 24시간 안의 쓰나미 발표를 넣어도 줄이 없다 → 설정에서 켜면 나온다
  //   ② 창 안에 더 새롭고 큰 JMA 항목 + 기상청 항목 → 기상청 항목이 나오고 JMA 글자는 없다
  //   ③ 창 안에 JMA 항목만 → '지난 24시간 기상청 발표 지진 없음 · 기상청 HH:MM KST 기준'
  //   ④ ③ 과 같은데 파일이 60분 넘게 늙음 / 기상청 받기 실패(kmaError) → '지진 자료 지연', '없음' 없음
  {
    const JMA_RE = /JMA|일본 기상청|Japan Meteorological|shindo/;
    const setFeeds = (patch) => run.sw.evaluate(async (p) => {
      const now = Date.now();
      const { feeds } = await chrome.storage.local.get('feeds');
      const agencies = { KMA: { ko: '기상청', en: 'Korea Meteorological Administration' }, JMA: { ko: '일본 기상청', en: 'Japan Meteorological Agency' } };
      const q = (src, minsAgo, mag, place, early = false) => ({ src, srcKo: src === 'KMA' ? '기상청' : '일본 기상청', at: new Date(now - minsAgo * 60000).toISOString(), atMs: now - minsAgo * 60000, mag, place, placeEn: src === 'JMA' ? 'Off Miyagi' : null, intensity: src === 'KMA' ? '최대진도 Ⅱ' : '5-', early });
      if (p.tsunami) feeds.tsunami = { ok: true, fetchedAt: now, data: { generatedMs: now - 5 * 60000, source: 'NOAA tsunami.gov', alerts: [{ center: 'PTWC', category: 'Information', updatedMs: now - 30 * 60000, bulletin: 'https://www.tsunami.gov/' }] } };
      if (p.quake) {
        const quakes = p.quake.items.map((x) => q(...x));
        feeds.quakeAsia = { ok: true, fetchedAt: now, data: { generatedMs: now - p.quake.genMinsAgo * 60000, agencies, quakes, kmaError: !!p.quake.kmaError } };
      }
      await chrome.storage.local.set({ feeds, lastFetchAt: now });
    }, patch);
    const facts = async (shot) => {
      const { page } = await openTab(run);
      await sleep(600);
      const r = await readPage(page);
      if (shot) await page.screenshot({ path: path.join(OUT, shot).replace(/\\/g, '/') });
      await page.close();
      return r.facts;
    };
    const line = (fs, id) => { const f = fs.find((x) => x.line === id); return f ? `${f.status}: ${f.text}` : null; };
    const L = (R.legalL4 = {});
    await run.sw.evaluate(async () => chrome.storage.local.set({ settings: { cityId: 'seoul' } }));
    const stored = await run.sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    await setFeeds({ tsunami: true, quake: { genMinsAgo: 3, items: [['JMA', 20, 6.0, '宮城県沖'], ['KMA', 300, 2.1, '경북 경주시 남남서쪽 9km 지역']] } });
    const f1 = await facts('chrome-ko-l4-kma-only-tsunami-off.png');
    L.defaultInstall = { storedSettings: stored, tsunamiLine: line(f1, 'tsunami'), quakeLine: line(f1, 'quake') };
    await run.sw.evaluate(async () => chrome.storage.local.set({ settings: { cityId: 'seoul', lines: { sky: true, warn: true, quake: true, tsunami: true } } }));
    const f2 = await facts('chrome-ko-l4-tsunami-on-by-user.png');
    L.tsunamiTurnedOn = line(f2, 'tsunami');
    await run.sw.evaluate(async () => chrome.storage.local.set({ settings: { cityId: 'seoul' } }));
    await setFeeds({ quake: { genMinsAgo: 3, items: [['JMA', 20, 6.0, '宮城県沖'], ['JMA', 200, 4.1, '茨城県沖']] } });
    const f3 = await facts('chrome-ko-l4-quake-none-kma.png');
    L.jmaOnlyWindow = line(f3, 'quake');
    await setFeeds({ quake: { genMinsAgo: 75, items: [['JMA', 20, 6.0, '宮城県沖']] } });
    L.staleFile = line(await facts(), 'quake');
    await setFeeds({ quake: { genMinsAgo: 3, kmaError: true, items: [['JMA', 20, 6.0, '宮城県沖']] } });
    L.kmaFetchFailed = line(await facts('chrome-ko-l4-quake-kma-failed.png'), 'quake');
    L.checks = {
      defaultNoTsunami: L.defaultInstall.tsunamiLine === null,
      kmaItemShownNotJma: /^fresh: M2\.1 · 경북/.test(L.defaultInstall.quakeLine || '') && !JMA_RE.test(L.defaultInstall.quakeLine || ''),
      tsunamiOnWhenChosen: /^fresh: 쓰나미 · PTWC/.test(L.tsunamiTurnedOn || ''),
      noneSentence: /^fresh: 지난 24시간 기상청 발표 지진 없음 기상청 \d{2}:\d{2} KST 기준$/.test(L.jmaOnlyWindow || ''),
      staleNotNone: /^stale: 지진 자료 지연/.test(L.staleFile || '') && !/없음/.test(L.staleFile || ''),
      kmaFailedNotNone: /^stale: 지진 자료 지연/.test(L.kmaFetchFailed || '') && !/없음/.test(L.kmaFetchFailed || ''),
      noJmaAnywhere: ![L.defaultInstall.quakeLine, L.jmaOnlyWindow, L.staleFile, L.kmaFetchFailed].some((x) => JMA_RE.test(x || '')),
    };
    // 다음 단계(돌아왔을 때 시험)가 쓰는 운영 자료로 되돌린다
    await run.sw.evaluate(async () => chrome.storage.local.set({ lastFetchAt: 0 }));
  }

  // (2026-09-24 검수 추가) 열어 둔 새 탭으로 돌아왔을 때: 특보 자료가 그 사이 45분을 넘었으면 '없음' 대신 '지연' 이 나와야 통과.
  //   저장소는 바꾸지 않는다(onChanged 로 다시 그려지는 길을 막고 visibilitychange 길만 본다).
  {
    await run.sw.evaluate(async () => {
      const { feeds } = await chrome.storage.local.get('feeds');
      const r = await fetch('https://earthus.net/events/kma-warn.json', { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      feeds.kmaWarn = { ok: true, fetchedAt: Date.now(), data: { observedMs: Date.now() - 45 * 60000 + 4000, staleAfterMin: 45,
        source: (r && r.source) || '기상청 기상특보', sourceEn: (r && r.sourceEn) || 'KMA weather warnings', active: [] } };
      await chrome.storage.local.set({ feeds, lastFetchAt: Date.now() });
    });
    const { page } = await openTab(run);
    const before = ((await readPage(page)).facts.find((f) => f.line === 'warn') || {});
    await sleep(6000);
    const idle = ((await readPage(page)).facts.find((f) => f.line === 'warn') || {});
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await sleep(300);
    const after = ((await readPage(page)).facts.find((f) => f.line === 'warn') || {});
    R.returnToOpenTab = { before: `${before.status}: ${before.text}`, stillShownWithoutEvent: `${idle.status}: ${idle.text}`, afterVisible: `${after.status}: ${after.text}` };
    await page.close();
  }
  await run.ctx.close();
}

/* ── 영어(브라우저 언어 fr → 영어) ─────────────────────────────────── */
{
  const run = await launch('fr');
  const R = (result.runs.fr = { id: run.id });
  const first = await openTab(run);
  await first.page.waitForFunction(() => !document.getElementById('src-clouds').hidden, null, { timeout: 90000, polling: 100 });
  await sleep(1000);
  R.page = await readPage(first.page);
  const file = path.join(OUT, 'chrome-en-1280x800.png').replace(/\\/g, '/');
  await first.page.screenshot({ path: file });
  R.shot = file;
  await run.ctx.close();
}

const stamp = result.at.replace(/[:.]/g, '-');
const outJson = path.join(OUT, `chrome-measure-${stamp}.json`).replace(/\\/g, '/');
writeFileSync(outJson, JSON.stringify(result, null, 2));
const ko = result.runs.ko;
console.log(JSON.stringify({
  result: outJson,
  firstInstallMs: ko.firstInstall.firstPaintMs, cloudArrivedMs: ko.firstInstall.cloudArrivedMs,
  firstPaintMedianMs: ko.firstPaint.medianMs, firstPaintMaxMs: ko.firstPaint.maxMs, firstPaintFrom: ko.firstPaint.from,
  idle: ko.idle, honesty: { count: ko.honesty.count, ok: ko.honesty.ok, bad: ko.honesty.bad },
  offline: { status: ko.offline.status, pageHttp: ko.offline.pageHttpRequests.length, swFetches: ko.offline.swFetchesDuring },
  alarmGate: ko.alarmGate, chromeNewtabUrl: ko.chromeNewtabUrl,
  shots: Object.fromEntries(Object.entries(ko.shots).map(([k, v]) => [k, v.inViewport])),
  formatChange: ko.formatChange.map((f) => `${f.line}:${f.status}`),
  returnToOpenTab: ko.returnToOpenTab, fcpMedianMs: ko.firstPaint.fcpMedianMs,
  legalL4: ko.legalL4,
  liveNoJma: {
    ko: ko.page.facts.filter((f) => f.line === 'quake').map((f) => f.text),
    en: result.runs.fr.page.facts.filter((f) => f.line === 'quake').map((f) => f.text),
    ok: ![...ko.page.facts, ...result.runs.fr.page.facts].some((f) => f.line === 'quake' && /JMA|일본 기상청|Japan Meteorological|shindo/.test(f.text)),
    tsunamiLines: [...ko.page.facts, ...result.runs.fr.page.facts].filter((f) => f.line === 'tsunami').length,
  },
  options: ko.options,
  cloudPair: ko.cloudPair,
  firstInstallBeforeData: { status: ko.firstInstall.status, facts: ko.firstInstall.facts.length, httpFromPage: ko.firstInstall.pageHttpRequests.length },
  ko: { lang: ko.page.lang, title: ko.page.title, facts: ko.page.facts.map((f) => f.text), clouds: ko.page.clouds, night: ko.page.night, links: ko.page.links },
  en: { lang: result.runs.fr.page.lang, title: result.runs.fr.page.title, facts: result.runs.fr.page.facts.map((f) => f.text), clouds: result.runs.fr.page.clouds },
}, null, 2));

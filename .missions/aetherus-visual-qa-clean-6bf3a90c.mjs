import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/aetherus-qa/node_modules/playwright');

const baseUrl = process.env.AETHERUS_QA_URL || 'http://127.0.0.1:8799';
const out = process.env.AETHERUS_QA_OUT || path.resolve('qa-artifacts');
await fs.mkdir(out, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function appReady(page) {
  await page.waitForFunction(() => {
    const root = document.getElementById('cosmicExperience');
    return root && !root.hidden && root.dataset.stage === 'mission'
      && root.classList.contains('is-dashboard')
      && document.body.classList.contains('aetherus-open');
  }, { timeout: 60_000 });
  await pause(500);

  // #dev는 좌표 frame/provider dataset을 읽기 위해 유지하되 화면을 덮는 진단 시트만 닫는다.
  const close = page.locator('#devSheet [data-close="devSheet"]');
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForFunction(() => {
      const sheet = document.getElementById('devSheet');
      return !sheet || sheet.getAttribute('aria-hidden') === 'true' || !sheet.classList.contains('up');
    }, { timeout: 10_000 });
  }
}

async function solarNav(page) {
  await page.evaluate(() => {
    const button = document.querySelector('#cosmicExperienceNav [data-aetherus-nav="solar"]');
    if (!button) throw new Error('SOLAR_NAV_MISSING');
    button.click();
  });
  await page.waitForFunction(() => !document.getElementById('cosmicExperience')?.classList.contains('is-dashboard'),
    { timeout: 15_000 });
  await pause(500);
}

async function zoomOut(page, count) {
  const canvas = page.locator('#cosmicCanvas');
  for (let index = 0; index < count; index += 1) {
    await canvas.dispatchEvent('wheel', {
      deltaY: 900, deltaX: 0, deltaMode: 0, bubbles: true, cancelable: true,
    });
    await pause(190);
  }
  await pause(1_150);
}

async function state(page) {
  return page.evaluate(() => {
    const root = document.getElementById('cosmicExperience');
    const canvas = document.getElementById('cosmicCanvas');
    const html = document.documentElement;
    return {
      stage: root?.dataset.stage || null,
      rootClass: root?.className || null,
      journey: canvas?.dataset.coordinateJourney || null,
      journeyOpacity: canvas?.dataset.coordinateJourneyOpacity || null,
      solarWorldFrame: canvas?.dataset.solarWorldFrame || null,
      solarPhysicalFrame: canvas?.dataset.solarPhysicalFrame || null,
      provider: canvas?.dataset.ephemerisProvider || null,
      solarEpoch: canvas?.dataset.solarEpoch || null,
      hudStage: document.getElementById('cosmicStage')?.textContent?.trim() || '',
      hudScale: document.getElementById('cosmicScale')?.textContent?.trim() || '',
      devSheetOpen: document.getElementById('devSheet')?.classList.contains('up') || false,
      bodyPickerHidden: document.getElementById('cosmicBodyPicker')?.hidden ?? null,
      overflowX: Math.max(0, html.scrollWidth - window.innerWidth),
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
}

async function openBody(page, id, expectedKo, profile) {
  await page.waitForFunction(bodyId => {
    const button = document.querySelector(`[data-body="${bodyId}"]`);
    const picker = document.getElementById('cosmicBodyPicker');
    return button && picker && !picker.hidden;
  }, id, { timeout: 20_000 });
  await page.locator(`[data-body="${id}"]`).click();
  await page.waitForFunction(bodyId => {
    const info = document.getElementById('cosmicBodyInfo');
    const astro = document.getElementById('cosmicAstronomy');
    return info && !info.hidden && astro && !astro.hidden
      && document.getElementById('cosmicBodyTitle')?.textContent?.trim();
  }, id, { timeout: 20_000 });
  await pause(450);
  const result = await page.evaluate(bodyId => {
    const facts = document.getElementById('cosmicAstronomyCoordinates');
    return {
      id: bodyId,
      title: document.getElementById('cosmicBodyTitle')?.textContent?.trim() || '',
      astronomyTitle: document.getElementById('cosmicAstronomyTitle')?.textContent?.trim() || '',
      tier: document.getElementById('cosmicAstronomyTier')?.textContent?.trim() || '',
      where: document.getElementById('cosmicAstronomyLocation')?.textContent?.trim() || '',
      context: document.getElementById('cosmicAstronomyContext')?.textContent?.trim() || '',
      horizon: document.getElementById('cosmicAstronomyHorizon')?.textContent?.trim() || '',
      terms: facts?.querySelectorAll('dt').length || 0,
      values: facts?.querySelectorAll('dd').length || 0,
      plannerSectionHidden: document.getElementById('cosmicPlanner')?.hidden ?? null,
      skyArButtonHidden: document.getElementById('cosmicSkyAROpen')?.hidden ?? null,
    };
  }, id);
  if (!result.title.includes(expectedKo)) throw new Error(`${profile}:${id}:TITLE:${result.title}`);
  if (!result.astronomyTitle.includes(expectedKo)) throw new Error(`${profile}:${id}:ASTRONOMY_TITLE:${result.astronomyTitle}`);
  if (!result.where.includes('WHERE IS IT?')) throw new Error(`${profile}:${id}:WHERE_IS_IT:${result.where}`);
  if (result.terms < 5 || result.values < 5) throw new Error(`${profile}:${id}:COORDINATES_INCOMPLETE`);
  // Mars 외 행성에는 Mars 전용 planner/Sky AR를 노출하지 않는다.
  if (id !== 'mars' && result.plannerSectionHidden !== true) throw new Error(`${profile}:${id}:MARS_PLANNER_VISIBLE`);
  if (id !== 'mars' && result.skyArButtonHidden !== true) throw new Error(`${profile}:${id}:MARS_SKY_AR_VISIBLE`);
  await shot(page, `${profile}-${id}-my-sky`);
  return result;
}

async function closeBody(page) {
  await page.locator('#cosmicBodyBack').click();
  await page.waitForFunction(() => document.getElementById('cosmicBodyInfo')?.hidden === true,
    { timeout: 15_000 });
  await pause(300);
}

async function profile(browser, spec) {
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.goto(`${baseUrl}/?aetherus=4&solar=1#dev`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await appReady(page);
  await solarNav(page);

  await zoomOut(page, 2);
  const solar = await state(page);
  if (solar.stage !== 'solar') throw new Error(`${spec.name}:SOLAR_STAGE:${solar.stage}`);
  if (solar.solarWorldFrame !== 'galactic-icrs') throw new Error(`${spec.name}:WORLD_FRAME:${solar.solarWorldFrame}`);
  if (solar.devSheetOpen) throw new Error(`${spec.name}:DEV_SHEET_STILL_OPEN`);
  await shot(page, `${spec.name}-solar-clean`);

  await zoomOut(page, 3);
  await page.waitForFunction(() => document.getElementById('cosmicExperience')?.dataset.stage === 'solar-motion-reveal',
    { timeout: 20_000 });
  const motion = await state(page);
  if (motion.journey !== 'motion-reveal') throw new Error(`${spec.name}:MOTION_DATASET:${motion.journey}`);
  if (!motion.hudStage.includes('태양계의 은하 이동')) throw new Error(`${spec.name}:MOTION_HUD:${motion.hudStage}`);
  await shot(page, `${spec.name}-motion-reveal-clean`);

  await zoomOut(page, 4);
  await page.waitForFunction(() => document.getElementById('cosmicExperience')?.dataset.stage === 'milkyway',
    { timeout: 20_000 });
  const milkyway = await state(page);
  await shot(page, `${spec.name}-milkyway-clean`);

  await solarNav(page);
  await page.waitForFunction(() => {
    const root = document.getElementById('cosmicExperience');
    const picker = document.getElementById('cosmicBodyPicker');
    return root?.dataset.stage === 'solar' && picker && !picker.hidden;
  }, { timeout: 25_000 });
  const returnSolar = await state(page);

  const jupiter = await openBody(page, 'jupiter', '목성', spec.name);
  await closeBody(page);
  const saturn = await openBody(page, 'saturn', '토성', spec.name);
  await closeBody(page);

  const final = await state(page);
  const maxOverflow = Math.max(solar.overflowX, motion.overflowX, milkyway.overflowX,
    returnSolar.overflowX, final.overflowX);
  if (maxOverflow > 2) throw new Error(`${spec.name}:HORIZONTAL_OVERFLOW:${maxOverflow}`);
  if (pageErrors.length) throw new Error(`${spec.name}:PAGE_ERRORS:${pageErrors.join(' | ')}`);

  await context.close();
  return { spec, solar, motion, milkyway, returnSolar, jupiter, saturn, final, pageErrors, consoleErrors };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl'],
});

const report = {
  schema: 'earthus.aetherus-visual-qa.v2',
  generatedAt: new Date().toISOString(),
  profiles: [],
};
try {
  report.profiles.push(await profile(browser, { name: 'desktop-1280x720', width: 1280, height: 720, mobile: false }));
  await fs.writeFile(path.join(out, 'report-clean.partial.json'), `${JSON.stringify(report, null, 2)}\n`);
  report.profiles.push(await profile(browser, { name: 'mobile-390x844', width: 390, height: 844, mobile: true }));
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack || error);
  throw error;
} finally {
  await fs.writeFile(path.join(out, 'report-clean.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}

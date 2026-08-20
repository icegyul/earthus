import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/aetherus-qa/node_modules/playwright');

const baseUrl = process.env.AETHERUS_QA_URL || 'http://127.0.0.1:8799';
const outputDir = process.env.AETHERUS_QA_OUT || path.resolve('qa-artifacts');
const chromeBin = process.env.CHROME_BIN || undefined;
await fs.mkdir(outputDir, { recursive: true });

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForRoot(page) {
  await page.waitForFunction(() => {
    const root = document.getElementById('cosmicExperience');
    return root && !root.hidden && document.body.classList.contains('aetherus-open');
  }, { timeout: 60_000 });
  await page.waitForSelector('#cosmicCanvas', { state: 'visible', timeout: 30_000 });
}

async function waitForInitialMissionControl(page) {
  // 첫 space 진입은 activate()가 끝난 뒤 Mission Control을 연다. root가 보였다는 것만으로
  // activation 완료로 간주하면 SOLAR 클릭 뒤 늦게 도착한 openDashboard()와 경합한다.
  await page.waitForFunction(() => {
    const root = document.getElementById('cosmicExperience');
    const nav = document.getElementById('cosmicExperienceNav');
    return root?.dataset.stage === 'mission'
      && root.classList.contains('is-dashboard')
      && nav
      && !nav.hidden;
  }, { timeout: 40_000 });
  await pause(450);
}

async function clickSolarNav(page, { fromMission = false } = {}) {
  if (fromMission) await waitForInitialMissionControl(page);
  const solar = page.locator('#cosmicExperienceNav [data-aetherus-nav="solar"]');
  await solar.waitFor({ state: 'visible', timeout: 20_000 });
  await solar.click();
  await page.waitForFunction(() => !document.getElementById('cosmicExperience')?.classList.contains('is-dashboard'),
    { timeout: 20_000 });
  await pause(650);
}

async function wheel(page, count, deltaY) {
  const canvas = page.locator('#cosmicCanvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('COSMIC_CANVAS_NO_BOUNDING_BOX');
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .52);
  for (let index = 0; index < count; index += 1) {
    await page.mouse.wheel(0, deltaY);
    await pause(160);
  }
  await pause(850);
}

async function snapshotState(page, label) {
  return page.evaluate(stageLabel => {
    const root = document.getElementById('cosmicExperience');
    const canvas = document.getElementById('cosmicCanvas');
    const html = document.documentElement;
    return {
      label: stageLabel,
      rootStage: root?.dataset.stage || null,
      rootClass: root?.className || null,
      coordinateJourney: canvas?.dataset.coordinateJourney || null,
      coordinateJourneyOpacity: canvas?.dataset.coordinateJourneyOpacity || null,
      solarWorldFrame: canvas?.dataset.solarWorldFrame || null,
      solarPhysicalFrame: canvas?.dataset.solarPhysicalFrame || null,
      ephemerisProvider: canvas?.dataset.ephemerisProvider || null,
      solarEpoch: canvas?.dataset.solarEpoch || null,
      stageText: document.getElementById('cosmicStage')?.textContent?.trim() || null,
      scaleText: document.getElementById('cosmicScale')?.textContent?.trim() || null,
      hintText: document.getElementById('cosmicHint')?.textContent?.trim() || null,
      noteText: document.getElementById('cosmicNote')?.textContent?.trim() || null,
      bodyPickerHidden: document.getElementById('cosmicBodyPicker')?.hidden ?? null,
      solarNavCurrent: document.querySelector('#cosmicExperienceNav [data-aetherus-nav="solar"]')?.classList.contains('current') ?? null,
      canvasWidth: canvas?.getBoundingClientRect().width || 0,
      canvasHeight: canvas?.getBoundingClientRect().height || 0,
      overflowX: Math.max(0, html.scrollWidth - window.innerWidth),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, label);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
}

async function openBody(page, bodyId, expectedKo, profile) {
  await page.waitForFunction(id => {
    const el = document.querySelector(`[data-body="${id}"]`);
    return el && !el.closest('nav')?.hidden;
  }, bodyId, { timeout: 20_000 });
  await page.locator(`[data-body="${bodyId}"]`).click();
  await page.waitForFunction(id => {
    const title = document.getElementById('cosmicBodyTitle')?.textContent?.trim();
    const astro = document.getElementById('cosmicAstronomy');
    return title && !astro?.hidden && document.getElementById('cosmicBodyInfo')?.hidden === false;
  }, bodyId, { timeout: 20_000 });
  await pause(350);
  const result = await page.evaluate(({ id, ko }) => {
    const coordinates = document.getElementById('cosmicAstronomyCoordinates');
    const locationButton = document.getElementById('cosmicAstronomyLocation');
    return {
      id,
      bodyTitle: document.getElementById('cosmicBodyTitle')?.textContent?.trim() || '',
      astronomyTitle: document.getElementById('cosmicAstronomyTitle')?.textContent?.trim() || '',
      tier: document.getElementById('cosmicAstronomyTier')?.textContent?.trim() || '',
      context: document.getElementById('cosmicAstronomyContext')?.textContent?.trim() || '',
      horizon: document.getElementById('cosmicAstronomyHorizon')?.textContent?.trim() || '',
      whereButton: locationButton?.textContent?.trim() || '',
      coordinateTerms: coordinates?.querySelectorAll('dt').length || 0,
      coordinateValues: coordinates?.querySelectorAll('dd').length || 0,
      plannerHidden: document.getElementById('cosmicPlannerBuild')?.hidden ?? null,
      skyArHidden: document.getElementById('cosmicSkyAROpen')?.hidden ?? null,
      expectedKo: ko,
    };
  }, { id: bodyId, ko: expectedKo });
  if (!result.bodyTitle.includes(expectedKo)) throw new Error(`${profile}:${bodyId}:BODY_TITLE_MISMATCH:${result.bodyTitle}`);
  if (!result.astronomyTitle.includes(expectedKo)) throw new Error(`${profile}:${bodyId}:ASTRONOMY_TITLE_MISMATCH:${result.astronomyTitle}`);
  if (!result.whereButton.includes('WHERE IS IT?')) throw new Error(`${profile}:${bodyId}:WHERE_IS_IT_MISSING:${result.whereButton}`);
  if (result.coordinateTerms < 5 || result.coordinateValues < 5) {
    throw new Error(`${profile}:${bodyId}:ASTRONOMY_COORDINATES_INCOMPLETE`);
  }
  await screenshot(page, `${profile}-${bodyId}-my-sky`);
  return result;
}

async function closeBody(page) {
  const back = page.locator('#cosmicBodyBack');
  if (await back.isVisible()) {
    await back.click();
    await page.waitForFunction(() => document.getElementById('cosmicBodyInfo')?.hidden === true,
      { timeout: 15_000 });
    await pause(250);
  }
}

async function runProfile(browser, profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 1,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || '' }));

  await page.goto(`${baseUrl}/?aetherus=4&solar=1#dev`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForRoot(page);
  await clickSolarNav(page, { fromMission: true });

  // 태양계가 읽히는 거리까지 먼저 이동한다.
  await wheel(page, 2, 900);
  const solar = await snapshotState(page, 'solar');
  if (solar.rootStage !== 'solar') throw new Error(`${profile.name}:EXPECTED_SOLAR_GOT_${solar.rootStage}:${solar.rootClass}`);
  if (solar.solarWorldFrame !== 'galactic-icrs') throw new Error(`${profile.name}:SOLAR_WORLD_FRAME_${solar.solarWorldFrame}`);
  if (!(solar.canvasWidth > 100 && solar.canvasHeight > 100)) throw new Error(`${profile.name}:CANVAS_ZERO_SIZE`);
  await screenshot(page, `${profile.name}-solar`);

  // 같은 카메라를 계속 뒤로 빼면 별도 버튼 없이 Solar Motion trail이 등장해야 한다.
  await wheel(page, 3, 900);
  await page.waitForFunction(() => document.getElementById('cosmicExperience')?.dataset.stage === 'solar-motion-reveal',
    { timeout: 20_000 });
  const motion = await snapshotState(page, 'motion-reveal');
  if (motion.coordinateJourney !== 'motion-reveal') throw new Error(`${profile.name}:MOTION_REVEAL_DATASET_${motion.coordinateJourney}`);
  if (!motion.stageText.includes('태양계의 은하 이동')) throw new Error(`${profile.name}:MOTION_HUD_MISSING:${motion.stageText}`);
  await screenshot(page, `${profile.name}-motion-reveal`);

  // 계속 줌아웃하면 같은 공간에서 Milky Way 단계가 된다.
  await wheel(page, 4, 900);
  await page.waitForFunction(() => document.getElementById('cosmicExperience')?.dataset.stage === 'milkyway',
    { timeout: 20_000 });
  const milkyway = await snapshotState(page, 'milkyway');
  await screenshot(page, `${profile.name}-milkyway`);

  // 다시 태양계로 돌아와 일반 행성도 같은 My Sky 계약을 쓰는지 본다.
  await clickSolarNav(page);
  await page.waitForFunction(() => {
    const root = document.getElementById('cosmicExperience');
    return root?.dataset.stage === 'solar' && document.getElementById('cosmicBodyPicker')?.hidden === false;
  }, { timeout: 25_000 });
  const solarReturn = await snapshotState(page, 'solar-return');
  const jupiter = await openBody(page, 'jupiter', '목성', profile.name);
  await closeBody(page);
  const saturn = await openBody(page, 'saturn', '토성', profile.name);
  await closeBody(page);

  const finalState = await snapshotState(page, 'final');
  if (Math.max(solar.overflowX, motion.overflowX, milkyway.overflowX, solarReturn.overflowX, finalState.overflowX) > 2) {
    throw new Error(`${profile.name}:HORIZONTAL_OVERFLOW`);
  }
  if (pageErrors.length) throw new Error(`${profile.name}:PAGE_ERRORS:${pageErrors.join(' | ')}`);

  const result = {
    profile,
    states: { solar, motion, milkyway, solarReturn, finalState },
    bodies: { jupiter, saturn },
    pageErrors,
    consoleErrors,
    failedRequests: failedRequests.slice(0, 40),
  };
  await context.close();
  return result;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeBin,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl'],
});

const report = {
  schema: 'earthus.aetherus-visual-qa.v1',
  generatedAt: new Date().toISOString(),
  baseUrl,
  chromeBin: chromeBin || 'playwright-managed',
  profiles: [],
};

try {
  for (const profile of [
    { name: 'desktop-1280x720', width: 1280, height: 720, mobile: false },
    { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  ]) {
    report.profiles.push(await runProfile(browser, profile));
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack || error);
  throw error;
} finally {
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}

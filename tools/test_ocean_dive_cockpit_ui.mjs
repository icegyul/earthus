#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_DIVE_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 754, height: 402 },
  { name: 'desktop', width: 1440, height: 900 },
].filter(item => !process.env.EARTHUS_DIVE_CASE || item.name === process.env.EARTHUS_DIVE_CASE);

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.name.startsWith('iphone') ? 3 : 1,
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?ocean=hub`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => (
      document.querySelector('#outSheet.up') || document.querySelector('#oceanSheet.up')
    ), { timeout: 30_000 });
    const oceanEntry = await page.evaluate(() => (
      document.querySelector('#outSheet.up') ? 'hobby' : 'ocean'
    ));
    if (oceanEntry === 'hobby') {
      await page.locator('#outSheet [data-out-act="dive"]').click();
    } else {
      await page.locator('#oceanSheet [data-ocean-act="dive"]').click();
    }
    await page.locator('#sceneRoot.active[data-stage="dive"]').waitFor({ timeout: 30_000 });
    await page.locator('#diveExperience').waitFor({ state: 'visible' });
    await page.locator('#diveEnglishTitle').filter({ hasText: 'MARIANA TRENCH' }).waitFor();
    await page.waitForFunction(() => {
      const value = document.querySelector('#diveSource')?.textContent || '';
      return !value.includes('읽는 중') && !value.includes('loading');
    }, { timeout: 30_000 });

    const evidence = await page.evaluate(() => {
      const dive = document.querySelector('#diveExperience');
      const rect = dive.getBoundingClientRect();
      const controls = [...dive.querySelectorAll('button,input')]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .map(node => node.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        visible: !dive.hidden && getComputedStyle(dive).display !== 'none',
        sceneStage: document.querySelector('#sceneRoot').dataset.stage,
        title: document.querySelector('#diveEnglishTitle').textContent,
        source: document.querySelector('#diveSource').textContent,
        specimen: document.querySelector('#diveSpecimenSci').textContent,
        disclosure: document.querySelector('#diveSpecimenStatus').textContent,
        depth: Number(document.querySelector('#diveSlider').value),
        minimumControl: Math.min(...controls.map(box => Math.min(box.width, box.height))),
        background: getComputedStyle(dive.querySelector('.od-dive-bg')).backgroundImage,
        outside: rect.left < -0.5 || rect.right > innerWidth + 0.5,
      };
    });
    assert.equal(evidence.visible, true, `${item.name} dive scene is hidden`);
    assert.equal(evidence.sceneStage, 'dive', `${item.name} scene stage is not dive`);
    assert.equal(evidence.outside, false, `${item.name} dive scene leaves viewport`);
    assert.ok(evidence.overflow <= 0, `${item.name} horizontal overflow ${evidence.overflow}`);
    assert.equal(evidence.title, 'MARIANA TRENCH');
    assert.match(evidence.source, /GEBCO 2026/);
    assert.doesNotMatch(evidence.source, /실패|unavailable/i);
    assert.equal(evidence.specimen, 'Hirondellea gigas');
    assert.match(evidence.disclosure, /실측 아님|관측 사진 아님|not an observation/i);
    assert.ok(evidence.depth > 0, `${item.name} depth data did not initialize`);
    assert.ok(evidence.minimumControl >= 44, `${item.name} control below 44px: ${evidence.minimumControl}`);
    assert.match(evidence.background, /ocean-mariana-trench-simulator\.jpg/);
    await page.screenshot({ path: `/tmp/earthus-dive-${item.name}-before.png`, fullPage: true });

    const before = evidence.depth;
    await page.locator('[data-dive-control="down"]').click();
    await page.waitForFunction(start => Number(document.querySelector('#diveSlider').value) > start, before);
    await page.locator('[data-dive-control="pause"]').click();
    const paused = Number(await page.locator('#diveSlider').inputValue());
    await page.waitForTimeout(150);
    assert.equal(Number(await page.locator('#diveSlider').inputValue()), paused,
      `${item.name} depth continued after pause`);
    await page.locator('[data-dive-evidence]:visible').first().click();
    await page.locator('#diveEvidenceDrawer').waitFor({ state: 'visible' });
    assert.match(await page.locator('#diveEvidenceDrawer').innerText(), /관측(·표본)? 사진 아님|현재 위치 관측이 아닙니다|not.*observation/is);
    await page.screenshot({ path: `/tmp/earthus-dive-${item.name}.png`, fullPage: true });
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.close();
    console.log(`${item.name}: PASS · Mariana cockpit · GEBCO depth · controls ${Math.round(evidence.minimumControl)}px`);
  }
} finally {
  await browser.close();
}

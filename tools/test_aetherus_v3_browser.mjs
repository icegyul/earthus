#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.AETHERUS_V3_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 754, height: 402 },
  { name: 'desktop', width: 1280, height: 720 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.name.startsWith('iphone') ? 3 : 1,
      serviceWorkers: 'block',
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const url = new URL(base);
    url.search = 'aetherus=3&solar=1&photo=hubble-ngc4654-2026&telescope=all';
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#cosmicPhotoTitle').filter({ hasText: 'NGC 4654' }).waitFor({ timeout: 30_000 });
    await page.locator('#cosmicPhotoImage').evaluate(image => image.decode());

    const evidence = await page.evaluate(() => {
      const navButtons = [...document.querySelectorAll('.cosmic-experience-nav button')]
        .map(node => node.getBoundingClientRect());
      const filters = [...document.querySelectorAll('#cosmicPhotoFilters button')]
        .map(node => node.textContent.trim());
      const photoPanel = document.querySelector('#cosmicPhotoInfo').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        minNavHeight: Math.min(...navButtons.map(rect => rect.height)),
        navOutside: navButtons.some(rect => rect.left < -0.5 || rect.right > innerWidth + 0.5),
        panelOutside: photoPanel.left < -0.5 || photoPanel.right > innerWidth + 0.5,
        oldTabDisplay: getComputedStyle(document.querySelector('.brand-menu-tab')).display,
        filters,
        title: document.querySelector('#cosmicPhotoTitle').textContent,
        image: document.querySelector('#cosmicPhotoImage').getAttribute('src'),
        imageWidth: document.querySelector('#cosmicPhotoImage').naturalWidth,
        activeRoute: document.querySelector('[data-aetherus-nav].current')?.dataset.aetherusNav,
      };
    });
    assert.ok(evidence.overflow <= 0, `${item.name} horizontal overflow ${evidence.overflow}`);
    assert.ok(evidence.minNavHeight >= 44, `${item.name} nav control below 44px`);
    assert.equal(evidence.navOutside, false, `${item.name} nav leaves viewport`);
    assert.equal(evidence.panelOutside, false, `${item.name} photo panel leaves viewport`);
    assert.equal(evidence.oldTabDisplay, 'none');
    assert.deepEqual(evidence.filters, ['전체 59', '허블 9', '제임스웹 50']);
    assert.equal(evidence.title, '한쪽 팔이 길어진 나선은하 NGC 4654');
    assert.equal(evidence.image, '/space/previews/aetherus-2026-ngc4654.jpg');
    assert.ok(evidence.imageWidth >= 800, `${item.name} hero image did not load`);
    assert.equal(evidence.activeRoute, 'photos');

    await page.getByRole('tab', { name: /제임스웹/ }).click();
    await page.locator('#cosmicPhotoTitle').filter({ hasText: '베타 픽토리스' }).waitFor();
    assert.match(page.url(), /photo=webb-beta-pictoris-2026/);
    assert.deepEqual(pageErrors, [], `${item.name} page errors: ${pageErrors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/aetherus-v3-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · overflow ${evidence.overflow} · controls ${Math.round(evidence.minNavHeight)}px · HST/JWST current`);
  }
} finally {
  await browser.close();
}

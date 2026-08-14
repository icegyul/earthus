#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.AETHERUS_ENTRY_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.locator('#aetherusTab').click();
    await page.locator('#menuSub.open .aetherus-menu-list').waitFor({ timeout: 10_000 });
    await page.locator('[data-aetherus-route="mission"]').waitFor({ timeout: 10_000 });
    const menu = await page.evaluate(() => ({
      routes: [...document.querySelectorAll('#menuSub [data-aetherus-route]')]
        .map(node => node.dataset.aetherusRoute),
      text: document.querySelector('#menuSub')?.innerText || '',
    }));
    assert.deepEqual(menu.routes, ['mission', 'solar', 'photos', 'milkyway', 'galaxies']);
    assert.doesNotMatch(menu.text, /유료|구독|결제|\bPRO\b|GATED|잠김/i);

    await page.locator('[data-aetherus-route="photos"]').click();
    await page.locator('#cosmicPhotoTitle').filter({ hasText: 'NGC 4654' }).waitFor({ timeout: 30_000 });
    await page.locator('#cosmicPhotoImage').evaluate(image => image.decode());
    const photos = await page.evaluate(() => ({
      title: document.querySelector('#cosmicPhotoTitle')?.textContent,
      meta: document.querySelector('#cosmicPhotoMeta')?.textContent,
      credit: document.querySelector('#cosmicPhotoCredit')?.textContent,
      image: document.querySelector('#cosmicPhotoImage')?.getAttribute('src'),
      imageWidth: document.querySelector('#cosmicPhotoImage')?.naturalWidth,
      filters: [...document.querySelectorAll('#cosmicPhotoFilters button')]
        .map(node => node.textContent.trim()),
      source: document.querySelector('#cosmicPhotoSource')?.href,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.equal(photos.title, '한쪽 팔이 길어진 나선은하 NGC 4654');
    assert.match(photos.meta, /^HST · 2026-07-24 · 공개일$/);
    assert.match(photos.credit, /NASA/);
    assert.equal(photos.image, '/space/previews/aetherus-2026-ngc4654.jpg');
    assert.ok(photos.imageWidth >= 800, `${item.name}: Hubble hero image did not load`);
    assert.deepEqual(photos.filters, ['전체 59', '허블 9', '제임스웹 50']);
    assert.match(photos.source, /^https:\/\/science\.nasa\.gov\//);
    assert.ok(photos.overflow <= 0, `${item.name}: photo overflow ${photos.overflow}`);

    await page.getByRole('tab', { name: /제임스웹/ }).click();
    await page.locator('#cosmicPhotoTitle').filter({ hasText: '베타 픽토리스' }).waitFor();
    await page.locator('#cosmicPhotoImage').evaluate(image => image.decode());
    assert.match(page.url(), /photo=webb-beta-pictoris-2026/);
    assert.match(await page.locator('#cosmicPhotoMeta').textContent(), /^JWST · 2026-07-15 · 공개일$/);

    await page.locator('[data-aetherus-nav="mission"]').click();
    await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => /^59장 · HST 9 \/ JWST 50/.test(
      document.querySelector('[data-mission-photo-count]')?.textContent || ''), { timeout: 30_000 });
    const mission = await page.evaluate(() => ({
      text: document.querySelector('#aetherusMissionControl')?.innerText || '',
      earthCanvas: document.querySelectorAll('#cosmicCanvas').length,
      centerStage: document.querySelectorAll('#aetherusMissionControl .mission-center').length,
      photoCount: document.querySelector('[data-mission-photo-count]')?.textContent,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.equal(mission.earthCanvas, 1);
    assert.equal(mission.centerStage, 1);
    assert.match(mission.photoCount, /^59장 · HST 9 \/ JWST 50/);
    assert.doesNotMatch(mission.text, /유료|구독|결제|\bPRO\b|GATED|잠김/i);
    assert.ok(mission.overflow <= 0, `${item.name}: mission overflow ${mission.overflow}`);
    assert.deepEqual(errors, [], `${item.name}: page errors ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/aetherus-public-entry-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · Earth → AETHERUS → HST/JWST → Mission Control · free open`);
  }
} finally {
  await browser.close();
}

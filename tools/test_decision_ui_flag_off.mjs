import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_FLAG_OFF_URL || 'http://127.0.0.1:8765/prototype/index.html';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const decisionRequests = [];
  page.on('request', request => {
    if (/\/decision-ui(?:-model)?\.(?:js|css)(?:\?|$)/.test(request.url())) {
      decisionRequests.push(request.url());
    }
  });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#cesiumContainer').waitFor({ state: 'attached' });
  await page.waitForTimeout(3_000);

  assert.deepEqual(decisionRequests, [], 'flag-off page fetched Decision UI assets');
  assert.equal(await page.locator('#decisionUiHost').count(), 0, 'flag-off page created Decision UI host');
  assert.equal(await page.locator('#cesiumContainer').count(), 1, 'first Earth container changed');
  console.log(`decision UI production entry flag-off: PASS (${target})`);
} finally {
  await browser.close();
}

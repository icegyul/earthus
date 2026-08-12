import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8765';
const outputDir = process.env.EARTHUS_VISUAL_OUTPUT || '/tmp/earthus-pr08-ui';
await mkdir(outputDir, { recursive: true });

const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });
const cases = [
  { name: 'single-390x844', width: 390, height: 844, mode: 'single', shot: true },
  { name: 'single-430x932', width: 430, height: 932, mode: 'single', shot: false },
  { name: 'compare-768x1024', width: 768, height: 1024, mode: 'compare', shot: false },
  { name: 'compare-1280x900', width: 1280, height: 900, mode: 'compare', shot: true },
];

try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/tools/fixtures/decision-ui-harness.html?mode=${item.mode}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__decisionHarnessReady === true);
    await page.locator('#decisionUiTitle').waitFor({ state: 'visible' });

    const state = await page.evaluate(() => {
      const host = document.getElementById('decisionUiHost');
      const panel = host.querySelector('.decision-ui');
      const buttons = [...panel.querySelectorAll('button')].map(button => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, label: button.getAttribute('aria-label') || button.textContent.trim() };
      });
      const axes = [...panel.querySelectorAll('[data-axis]')].map(axis => ({
        key: axis.dataset.axis,
        top: axis.getBoundingClientRect().top,
        unknown: axis.dataset.unknown === 'true',
        text: axis.textContent,
      }));
      const rect = host.getBoundingClientRect();
      return {
        bodyOverflow: document.documentElement.scrollWidth - innerWidth,
        hostOverflow: host.scrollWidth - host.clientWidth,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        buttons,
        axes,
        focused: document.activeElement?.id || null,
        headingCount: panel.querySelectorAll('#decisionUiTitle').length,
        closeAria: panel.querySelector('[data-decision-close]')?.getAttribute('aria-label') || null,
        singleWinnerText: panel.textContent.includes('단일 승자'),
      };
    });
    assert.ok(state.bodyOverflow <= 0, `${item.name} body overflow ${state.bodyOverflow}`);
    assert.ok(state.hostOverflow <= 0, `${item.name} host overflow ${state.hostOverflow}`);
    assert.ok(state.rect.left >= 0 && state.rect.right <= item.width + 0.5, `${item.name} horizontal bounds`);
    assert.ok(state.rect.top >= 0 && state.rect.bottom <= item.height + 0.5, `${item.name} vertical bounds`);
    assert.ok(state.buttons.every(button => button.width >= 44 && button.height >= 44), `${item.name} small target`);
    assert.equal(state.axes[0]?.key, 'SAFETY', `${item.name} Safety must be first`);
    assert.equal(state.focused, 'decisionUiTitle');
    assert.equal(state.headingCount, 1);
    assert.ok(state.closeAria);

    if (item.shot) {
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.screenshot({ path: `${outputDir}/${item.name}.png`, fullPage: true });
    }

    if (item.mode === 'single') {
      assert.equal(state.axes.length, 5);
      assert.ok(state.axes[0].top <= state.axes[1].top);
      const unknown = state.axes.filter(axis => axis.unknown);
      assert.ok(unknown.length >= 2);
      assert.ok(unknown.every(axis => axis.text.includes('확인할 자료 없음')));
      await page.locator('[data-personal-toggle]').click();
      assert.equal(await page.locator('[data-personal-score]').count(), 0);
      assert.equal(await page.locator('[data-personal-toggle]').getAttribute('aria-pressed'), 'false');
      await page.locator('[data-personal-toggle]').click();
      assert.equal(await page.locator('[data-personal-score]').count(), 1);
    } else {
      assert.equal(state.axes.length, 5);
      assert.equal(state.singleWinnerText, true);
      assert.equal(await page.locator('.du-compare-grid article').count(), 5);
    }

    assert.deepEqual(errors, [], `${item.name} console errors`);
    console.log(`${item.name}: PASS`);
    await page.close();
  }
} finally {
  await browser.close();
}

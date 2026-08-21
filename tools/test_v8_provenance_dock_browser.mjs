import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const [moduleSource, css] = await Promise.all([
  readFile(new URL('../prototype/js/v8/provenance-dock.js', import.meta.url), 'utf8'),
  readFile(new URL('../prototype/css/v8-shell.css', import.meta.url), 'utf8'),
]);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`<!doctype html><html lang="ko"><head><style>${css}</style></head><body>
    <div id="srcNote" class="on" data-inline-source="서울특별시 실시간 인구데이터 · 12:30 자료">
      <span><b>서울 관광 밀도</b> · 서울특별시 실시간 인구데이터 · 관측 12:30</span>
      <span><i>자료 상태 · 121곳</i></span>
      <span class="map-credit"><a href="https://example.com/source">지도 · Esri</a></span>
    </div>
  </body></html>`);

  const initial = await page.evaluate(async url => {
    const { attachProvenanceDock } = await import(url);
    window.dockController = attachProvenanceDock(document.getElementById('srcNote'));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const dock = document.getElementById('provenanceDock');
    return {
      hidden: dock.hidden,
      expanded: dock.querySelector('button').getAttribute('aria-expanded'),
      detailsHidden: document.getElementById('srcNote').hidden,
      label: dock.querySelector('.pd-label').textContent,
      summary: dock.querySelector('.pd-summary').textContent,
      inlineText: dock.querySelector('.pd-toggle').innerText.replace(/\s+/g, ' ').trim(),
      backgroundColor: getComputedStyle(dock.querySelector('.pd-toggle')).backgroundColor,
      borderTopWidth: getComputedStyle(dock.querySelector('.pd-toggle')).borderTopWidth,
      borderRadius: getComputedStyle(dock.querySelector('.pd-toggle')).borderRadius,
      boxShadow: getComputedStyle(dock.querySelector('.pd-toggle')).boxShadow,
      countBadgeVisible: Boolean(dock.querySelector('.pd-count')),
      credit: dock.querySelector('.pd-credits').textContent,
    };
  }, moduleUrl);
  assert.equal(initial.hidden, false);
  assert.equal(initial.expanded, 'false');
  assert.equal(initial.detailsHidden, true);
  assert.equal(initial.label, '출처:');
  assert.match(initial.summary, /서울특별시 실시간 인구데이터/);
  assert.match(initial.inlineText, /^출처:\s*서울특별시 실시간 인구데이터/);
  assert.equal(initial.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.equal(initial.borderTopWidth, '0px');
  assert.equal(initial.borderRadius, '0px');
  assert.equal(initial.boxShadow, 'none');
  assert.equal(initial.countBadgeVisible, false);
  assert.match(initial.credit, /지도 · Esri/);

  await page.click('#provenanceDock > button');
  assert.equal(await page.getAttribute('#provenanceDock > button', 'aria-expanded'), 'true');
  assert.equal(await page.locator('#srcNote').evaluate(node => node.hidden), false);
  assert.match(await page.textContent('#srcNote'), /자료 상태 · 121곳/);

  await page.keyboard.press('Escape');
  assert.equal(await page.getAttribute('#provenanceDock > button', 'aria-expanded'), 'false');
  assert.equal(await page.locator('#srcNote').evaluate(node => node.hidden), true);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('pd-toggle')), true);

  const updated = await page.evaluate(async () => {
    const root = document.getElementById('srcNote');
    root.innerHTML = '<span><b>해류</b> · Open-Meteo Marine · 13:00</span>';
    root.dataset.inlineSource = 'Open-Meteo Marine · 13:00 자료';
    await new Promise(resolve => setTimeout(resolve, 0));
    const dock = document.getElementById('provenanceDock');
    return {
      summary: dock.querySelector('.pd-summary').textContent,
      credits: dock.querySelector('.pd-credits').textContent,
    };
  });
  assert.match(updated.summary, /Open-Meteo Marine/);
  assert.equal(updated.credits, '');

  await page.evaluate(async () => {
    document.getElementById('srcNote').classList.remove('on');
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  assert.equal(await page.locator('#provenanceDock').evaluate(node => node.hidden), true);

  console.log('EARTHUS v8 provenance dock browser: PASS');
} finally {
  await browser.close();
}

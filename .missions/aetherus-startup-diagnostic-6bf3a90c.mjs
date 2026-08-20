import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/aetherus-qa/node_modules/playwright');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' });
const page = await context.newPage();
const pageErrors = [];
const consoleLog = [];
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('console', message => consoleLog.push({ type: message.type(), text: message.text() }));
await page.goto('http://127.0.0.1:8799/?aetherus=4&solar=1#dev', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(8_000);
const state = await page.evaluate(() => ({
  href: location.href,
  bodyClass: document.body.className,
  rootExists: !!document.getElementById('cosmicExperience'),
  rootHidden: document.getElementById('cosmicExperience')?.hidden ?? null,
  rootClass: document.getElementById('cosmicExperience')?.className || null,
  rootStage: document.getElementById('cosmicExperience')?.dataset.stage || null,
  loadingExists: !!document.getElementById('loading'),
  loadingText: document.querySelector('#loading .load-text')?.textContent?.trim() || null,
  canvasExists: !!document.getElementById('cosmicCanvas'),
  canvasSize: (() => {
    const canvas = document.getElementById('cosmicCanvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  })(),
  sceneRoots: [...document.querySelectorAll('[data-scene]')].map(el => ({ id: el.id, scene: el.dataset.scene, hidden: el.hidden, className: el.className })),
}));
console.log(JSON.stringify({ state, pageErrors, consoleLog: consoleLog.slice(-80) }, null, 2));
await page.screenshot({ path: path.resolve('qa-artifacts/startup-diagnostic.png'), fullPage: false });
await context.close();
await browser.close();

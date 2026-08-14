#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.AETHERUS_QA_URL || 'http://127.0.0.1:8765/aetherus-device-qa.html';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture = path.join(root, 'prototype/space/thumbs/leop.jpg');

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 754 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.setInputFiles('#astrometryFile', fixture);
  await page.waitForFunction(() => document.querySelector('#astrometryEvidence')?.textContent.includes('PASS · LOCAL'));
  const evidence = await page.evaluate(() => ({
    text: document.querySelector('#astrometryEvidence').textContent,
    status: document.querySelector('[data-status-for="astrometry"]').textContent,
  }));
  assert.match(evidence.text, /추출 별\d+/);
  assert.match(evidence.text, /원본 업로드0/);
  assert.match(evidence.text, /별 추출PASS · LOCAL/);
  assert.match(evidence.text, /전천 솔브BLOCKED · CATALOG/);
  assert.equal(evidence.status, 'BLOCKED');
  assert.deepEqual(errors, []);
  await page.close();
  console.log('PASS: browser image decoded, local stars extracted, original upload 0, full-sky solve blocked');
} finally {
  await browser.close();
}

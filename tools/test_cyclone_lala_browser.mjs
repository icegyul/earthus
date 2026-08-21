#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = (process.env.EARTHUS_APP_URL || 'http://127.0.0.1:8767').replace(/\/$/, '');
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const geometryUrl = 'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry'
  + '?eventtype=TC&eventid=1001303&episodeid=31';
const storm = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-171.6, 22.8] },
  properties: {
    eventtype: 'TC', eventid: 1001303, episodeid: 31, eventname: 'LALA-26',
    alertlevel: 'Green', affectedcountries: [{ countryname: 'United States' }],
    fromdate: '2026-08-12T15:00:00Z', todate: '2026-08-20T03:00:00Z',
    source: 'NOAA', severitydata: { severity: 212.9616 },
    url: { geometry: geometryUrl, report: 'https://www.gdacs.org/report.aspx?eventid=1001303' },
  },
};
const embeddedLalaGeometry = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', properties: { Class: 'Poly_Cones' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[180, 33.3451], [179.2, 34.1], [179.7, 36.8], [180, 33.3451]]],
        [[[-171.6, 22.55], [-180, 33.3451], [-176.4, 37.2], [-171.6, 22.55]]],
      ],
    },
  }],
};
const lalaGeometry = process.env.CYCLONE_GEOMETRY_FIXTURE
  ? JSON.parse(fs.readFileSync(process.env.CYCLONE_GEOMETRY_FIXTURE, 'utf8'))
  : embeddedLalaGeometry;
const expectedConeParts = Number(process.env.CYCLONE_EXPECTED_CONES || 2);

const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const renderErrors = [];
  page.on('pageerror', error => {
    if (/NaN|rendering has stopped|DeveloperError/i.test(error.message)) renderErrors.push(error.message);
  });
  page.on('console', message => {
    if (message.type() === 'error' && /NaN|rendering has stopped|DeveloperError/i.test(message.text())) {
      renderErrors.push(message.text());
    }
  });

  await page.route('**/gdacsapi/api/events/geteventlist/EVENTS4APP**', route =>
    route.fulfill(json({ type: 'FeatureCollection', features: [storm] })));
  await page.route('**/gdacsapi/api/polygons/getgeometry**', route => route.fulfill(json(lalaGeometry)));
  await page.route('**/cyclone-tracks.json', route => route.fulfill(json({ storms: [] })));
  await page.route('**/cyclone-analog.json', route => route.fulfill(json({ storms: [] })));
  await page.route('**/cyclone-reports.json', route => route.fulfill(json({ reports: [] })));
  await page.route('**/typhoon-official.json', route => route.fulfill(json({ storms: [] })));
  await page.route('**/typhoon-ecmwf.json', route => route.fulfill(json({ storms: [] })));
  await page.route('**/regional-news.json', route => route.fulfill(json({ items: [] })));

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(async () => {
    const { cyclones } = await import('/js/layers/cyclone.js');
    return !!cyclones.ds;
  }, null, { timeout: 30_000 });
  await page.evaluate(async () => {
    const { store } = await import('/js/store.js');
    store.setLayer('cyclone', true);
  });
  await page.waitForFunction(async () => {
    const [{ cyclones }, { registry }] = await Promise.all([
      import('/js/layers/cyclone.js'), import('/js/layers/registry.js'),
    ]);
    return cyclones._enabled && registry.status.cyclone === 'ok'
      && cyclones.list.some(item => item.name === 'LALA');
  }, null, { timeout: 30_000 });
  await page.evaluate(async () => {
    const { cyclones } = await import('/js/layers/cyclone.js');
    const lala = cyclones.list.find(item => item.name === 'LALA');
    await cyclones.showTrack(lala);
  });
  await page.waitForFunction(async (parts) => {
    const { cyclones } = await import('/js/layers/cyclone.js');
    return cyclones._selected === 1001303
      && cyclones.ds?.entities?.values?.filter(entity => String(entity.id).includes(':cone')).length
        === parts;
  }, expectedConeParts, { timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const state = await page.evaluate(async () => {
    const { cyclones } = await import('/js/layers/cyclone.js');
    const errorPanel = document.querySelector('.cesium-widget-errorPanel');
    return {
      selected: cyclones._selected,
      coneIds: cyclones.ds.entities.values
        .map(entity => String(entity.id))
        .filter(id => id.includes(':cone'))
        .sort(),
      errorPanelVisible: !!errorPanel && getComputedStyle(errorPanel).display !== 'none',
      errorPanelText: errorPanel?.textContent || '',
    };
  });

  assert.equal(state.selected, 1001303);
  assert.equal(state.coneIds.length, expectedConeParts);
  assert.equal(state.errorPanelVisible, false, state.errorPanelText);
  assert.deepEqual(renderErrors, []);
  console.log(`PASS: cyclone geometry ${state.coneIds.length}/${expectedConeParts} parts · Cesium render errors 0`);
} finally {
  await browser.close();
}

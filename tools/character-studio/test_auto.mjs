// One-shot automation: name + description -> three generations -> measured assembly -> globe.
// Runs against the loopback dev server in --fake-images mode, so no API key and no money.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const repo = process.env.EARTHUS_REPO || 'D:/## APP/EARTHUS v2_APP';
const require = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');
const port = 8794, base = `http://127.0.0.1:${port}`, data = path.join(repo, '.studio-auto-data');

await fs.rm(data, { recursive: true, force: true });
const server = spawn(process.env.PYTHON || 'python', [path.join(repo, 'tools/character-studio/dev_server.py'), '--repo', repo, '--data', data, '--port', String(port), '--fake-images'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
server.stderr.on('data', b => process.stderr.write(b));
await new Promise((resolve, reject) => { server.stdout.on('data', b => String(b).includes('Character studio:') && resolve()); server.on('exit', code => reject(new Error('dev server exited ' + code))); setTimeout(() => reject(new Error('dev server did not start')), 20000); });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await fs.mkdir(path.join(repo, 'artifacts/character-studio'), { recursive: true });

async function autoRun(id, { name, prompt, lat, lon, publish }) {
  await page.locator('#new').click();
  await page.waitForFunction(() => document.querySelector('#saveState').textContent === '새 캐릭터');
  await page.locator('#name').fill(name); await page.locator('#name').blur();
  await page.locator('#character_id').fill(id); await page.locator('#character_id').blur();
  await page.locator('#prompt').fill(prompt); await page.locator('#prompt').blur();
  await page.locator('#autoLat').fill(String(lat)); await page.locator('#autoLat').blur();
  await page.locator('#autoLon').fill(String(lon)); await page.locator('#autoLon').blur();
  await page.locator('#autoPublish').setChecked(publish);
  await page.locator('#autoRun').click();
  await page.locator('#confirmDialog').waitFor({ state: 'visible' });
  const body = await page.locator('#confirmBody').textContent();
  await page.locator('#confirmOk').click();
  await page.locator('#autoTitle').filter({ hasText: publish ? '지구에 올렸습니다' : '캐릭터를 완성했습니다' }).waitFor({ timeout: 180000 });
  return body;
}

try {
  await page.goto(base + '/v3/character-studio.html?preview=1');
  await page.locator('#app').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#autoRun').isDisabled(), false, '이미지 생성이 연결되면 자동 제작 버튼이 열려야 한다');
  assert.match(await page.locator('#autoRun').textContent(), /\$0\.541/);
  await page.screenshot({ path: 'artifacts/character-studio/auto-empty.png', fullPage: true });

  const id = `auto-paper-${Date.now()}`;
  const confirmBody = await autoRun(id, { name: '자동 제작 종이 친구', prompt: '검증용 도형 파츠. 실제 캐릭터 디자인이 아닙니다.', lat: 34.55, lon: 126.6, publish: true });
  assert.match(confirmBody, /유료 이미지 생성 3회/);
  assert.match(confirmBody, /\$0\.541/);
  await page.locator('#autoClose').click();
  await page.locator('#view').selectOption('layers');
  await page.screenshot({ path: 'artifacts/character-studio/auto-complete.png', fullPage: true });
  await page.locator('#preview').screenshot({ path: 'artifacts/character-studio/auto-assembled.png' });

  const catalog = await (await context.request.get(base + '/v3/characters/catalog.json')).json();
  const entry = catalog.characters.find(row => row.character_id === id);
  assert.ok(entry, '자동 제작이 끝나면 공개 목록에 올라 있어야 한다');
  assert.equal(entry.placement.lat, 34.55); assert.equal(entry.placement.lon, 126.6);

  const manifestUrl = base + '/v3/characters/' + entry.manifest;
  const manifest = await (await context.request.get(manifestUrl)).json();
  assert.deepEqual(Object.values(manifest.files), [`${id}_master_sheet.png`, `${id}_runtime_3q.png`, `${id}_parts_atlas.png`, `${id}_thumbnail.png`, `${id}_manifest.json`]);
  const folder = manifestUrl.replace(/[^/]+$/, '');
  for (const file of Object.values(manifest.files)) {
    const response = await context.request.get(folder + file);
    assert.equal(response.status(), 200, `${file} 이 없다`);
    assert.ok((await response.body()).length > 200, `${file} 이 비어 있다`);
  }
  // The public folder keeps the same five names beside the immutable version the catalog points at.
  for (const file of Object.values(manifest.files)) assert.equal((await context.request.get(`${base}/v3/characters/${id}/${file}`)).status(), 200);

  const roles = manifest.layers.map(l => l.id);
  assert.deepEqual(roles, ['head', 'body', 'arm_left', 'arm_right', 'leg_left', 'leg_right']);
  manifest.layers.forEach((layer, i) => {
    const [x, y, w, h] = layer.rect, col = i % 3, row = Math.floor(i / 3);
    assert.ok(x >= col / 3 - 1e-6 && x + w <= (col + 1) / 3 + 1e-6, `${layer.id} 의 자르기가 칸을 넘었다`);
    assert.ok(y >= row / 2 - 1e-6 && y + h <= (row + 1) / 2 + 1e-6, `${layer.id} 의 자르기가 칸을 넘었다`);
    assert.ok(w < 1 / 3 - 0.01 && h < 1 / 2 - 0.01, `${layer.id} 이 칸 전체로 잘렸다 — 알파 경계를 못 읽었다`);
  });
  const by = Object.fromEntries(manifest.layers.map(l => [l.id, l]));
  // 240px wide head and 260px wide body in a 1536px atlas, plus the small anti-aliasing pad.
  assert.ok(Math.abs(by.head.rect[2] - 241 / 1536) < 0.006, `머리 폭 ${by.head.rect[2]}`);
  assert.ok(Math.abs(by.body.rect[2] - 261 / 1536) < 0.006, `몸통 폭 ${by.body.rect[2]}`);
  assert.ok(by.head.y > by.body.y && by.body.y > by.leg_left.y, '머리·몸통·다리가 위에서 아래로 서야 한다');
  assert.ok(by.arm_left.x < 0 && by.arm_right.x > 0, '팔이 몸통 양옆에 붙어야 한다');
  const top = by.head.y + by.head.height / 2, bottom = by.leg_left.y - by.leg_left.height / 2;
  assert.ok(Math.abs(bottom) < 0.02, `발이 바닥에 닿아야 한다 (${bottom})`);
  assert.ok(top > 0.8 && top < 1.0, `키가 한 칸에 맞아야 한다 (${top})`);
  assert.equal(by.arm_right.pivot[1], 0.14, '팔은 어깨에서 돌아야 한다');

  // The measured layers must survive the real renderer, not just the contract check.
  const render = await page.evaluate(async ({ manifest, folder }) => {
    const THREE = await import('/vendor/three-r184.module.min.js');
    const { loadPaperCharacter } = await import('/v3/paper-character.js');
    const c = await loadPaperCharacter(manifest, { runtime_3q: folder + manifest.files.runtime_3q, parts_atlas: folder + manifest.files.parts_atlas });
    const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
    camera.position.copy(c.normal).multiplyScalar(1.2); camera.position.x += .02; camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    c.update(camera, 800, performance.now());
    const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(320, 320);
    const scene = new THREE.Scene(); scene.add(c.group); renderer.render(scene, camera);
    const glError = renderer.getContext().getError(), parts = c.parts.length, near = c.layered.visible;
    renderer.dispose(); c.dispose(); return { glError, parts, near };
  }, { manifest, folder });
  assert.deepEqual(render, { glError: 0, parts: 6, near: true });

  // The real v3 globe, not a preview harness: it must find the character through the public catalog.
  const globe = await context.newPage(), globeErrors = [];
  globe.on('pageerror', e => globeErrors.push(e.message));
  const manifestHit = globe.waitForResponse(r => r.url().includes(`${id}_manifest.json`), { timeout: 90000 });
  const atlasHit = globe.waitForResponse(r => r.url().includes(`${id}_parts_atlas.png`), { timeout: 90000 });
  await globe.goto(base + '/v3/');
  await globe.waitForFunction(() => document.querySelector('#gl')?.width > 10);
  assert.equal((await manifestHit).status(), 200, '지구가 공개 manifest 를 읽어야 한다');
  assert.equal((await atlasHit).status(), 200, '지구가 파츠 시트를 읽어야 한다');
  await globe.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await globe.screenshot({ path: 'artifacts/character-studio/auto-on-globe.png' });
  assert.deepEqual(globeErrors, []);
  await globe.close();

  // Second run, publication switched off: the same work stops before the globe.
  const draftId = `auto-draft-${Date.now()}`;
  await autoRun(draftId, { name: '공개하지 않는 친구', prompt: '검증용 도형 파츠.', lat: 37.5, lon: 127, publish: false });
  const after = await (await context.request.get(base + '/v3/characters/catalog.json')).json();
  assert.ok(!after.characters.some(row => row.character_id === draftId), '공개하지 않기로 하면 목록에 없어야 한다');
  assert.ok(after.characters.some(row => row.character_id === id), '앞서 올린 캐릭터는 그대로여야 한다');
  assert.match(await page.locator('#autoSteps li').last().getAttribute('data-state'), /skipped/);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '모바일에서 가로로 넘치면 안 된다');
  await page.screenshot({ path: 'artifacts/character-studio/auto-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(repo, 'artifacts/character-studio/auto-results.json'), JSON.stringify({ id, draftId, layers: manifest.layers, render, checks: ['auto-button-gated-on-key', 'cost-confirm', 'three-generations', 'alpha-measured-assembly', 'five-public-files', 'catalog-entry', 'real-webgl-render', 'publish-opt-out', 'mobile-no-overflow'] }, null, 2));
  console.log('PASS: 설명 → 프롬프트 → 이미지 3장 → 알파 기준 자동 조립 → 5개 파일 → 지구 게시, 공개 끄기까지.');
} finally {
  await browser.close();
  server.kill();
}

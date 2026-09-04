import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const repo = process.env.EARTHUS_REPO || 'D:/## APP/EARTHUS v2_APP';
const require = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const base = 'http://127.0.0.1:8793';
await fs.mkdir('artifacts/character-studio', { recursive: true });
try {
  await page.goto(base + '/v3/character-studio.html?preview=1');
  await page.locator('#app').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#generate').isDisabled(), true);
  await page.screenshot({ path: 'artifacts/character-studio/desktop-empty.png', fullPage: true });
  const id = `test-paper-${Date.now()}`;
  await page.locator('#name').fill('검증용 종이 인형'); await page.locator('#name').blur();
  await page.locator('#character_id').fill(id); await page.locator('#character_id').blur();
  await page.locator('#prompt').fill('테스트 전용 도형 파츠. 실제 캐릭터 디자인이 아닙니다.'); await page.locator('#prompt').blur();
  // Deterministic geometric fixtures test alpha, cropping and motion; not product artwork.
  const png = await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 256; const x = cv.getContext('2d');
    for (let i = 0; i < 6; i++) { x.fillStyle = ['#638858', '#d4b386', '#85a4c5', '#aa7858', '#a88bad', '#dfa25d'][i]; x.beginPath(); x.ellipse((i % 3) * 128 + 64, Math.floor(i / 3) * 128 + 64, 37, 49, 0, 0, Math.PI * 2); x.fill(); }
    return cv.toDataURL('image/png').split(',')[1];
  });
  const file = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  async function upload(index) {
    const chooser = page.waitForEvent('filechooser'); await page.locator('.asset button').nth(index).click(); await (await chooser).setFiles(file);
    await page.waitForFunction(i => document.querySelectorAll('.asset small')[i].textContent === '준비됨' && !document.querySelector('#app').inert, index);
  }
  await upload(0); await page.locator('#approveMaster').click(); await page.waitForFunction(() => !document.querySelector('#app').inert);
  await upload(1); await upload(2);
  await page.locator('[data-step=parts]').click(); await page.locator('#motion').selectOption('wave');
  await page.locator('#partSelect').selectOption('3'); await page.locator('[data-part-key="rotation"]').fill('12'); await page.locator('[data-part-key="rotation"]').blur();
  await page.locator('#play').click();
  await page.locator('#approveMotion').click(); await page.waitForFunction(() => !document.querySelector('#app').inert);
  await page.locator('#saveServer').click(); await page.waitForFunction(() => document.querySelector('#saveState').textContent === '서버와 브라우저에 저장됨');
  await page.screenshot({ path: 'artifacts/character-studio/desktop-parts.png', fullPage: true });
  const downloadEvent = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloadEvent; await download.saveAs('artifacts/character-studio/character.zip');
  const before = await page.locator('#preview').evaluate(c => c.toDataURL());
  await page.reload(); await page.locator('#app').waitFor({ state: 'visible' }); await page.getByRole('button', { name: /검증용 종이 인형/ }).click();
  await page.waitForFunction(() => document.querySelector('#name').value === '검증용 종이 인형' && !document.querySelector('#app').inert);
  assert.equal(await page.locator('#character_id').inputValue(), id);
  await page.locator('[data-step=publish]').click(); assert.match(await page.locator('#checklist').textContent(), /준비가 되었습니다/);
  await page.locator('#publish').click(); await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('지구에 적용했습니다') && !document.querySelector('#app').inert);
  const catalog = await (await context.request.get(base + '/v3/characters/catalog.json')).json();
  const entry = catalog.characters.find(c => c.character_id === id); assert.ok(entry);
  const manifest = await (await context.request.get(base + '/v3/characters/' + entry.manifest)).json(); assert.equal(manifest.layers[3].rotation, 12); assert.equal(manifest.motion, 'wave');
  // Exercise the real Three.js character with actual PNG textures and matrices.
  const render = await page.evaluate(async ({ manifest, basePath }) => {
    const THREE = await import('/vendor/three-r184.module.min.js'); const { loadPaperCharacter } = await import('/v3/paper-character.js');
    const c = await loadPaperCharacter(manifest, { runtime_3q: basePath + manifest.files.runtime_3q, parts_atlas: basePath + manifest.files.parts_atlas });
    const camera = new THREE.PerspectiveCamera(38, 1, .01, 100); camera.position.copy(c.normal).multiplyScalar(3); camera.position.x += .1; camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    c.update(camera, 800, performance.now()); const far = !c.layered.visible;
    camera.position.copy(c.normal).multiplyScalar(1.2); camera.position.x += .02; camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); c.update(camera, 800, performance.now());
    const near = c.layered.visible, up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.group.quaternion).dot(c.normal);
    const worldFacing = c.group.quaternion.clone().multiply(c.facing.quaternion);
    const frontVisibility = new THREE.Vector3(0, 0, 1).applyQuaternion(worldFacing).dot(camera.position.clone().sub(c.group.position).normalize());
    const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(320, 320); const scene = new THREE.Scene(); scene.add(c.group); renderer.render(scene, camera); const glError = renderer.getContext().getError();
    camera.position.copy(c.normal).multiplyScalar(-3); c.update(camera, 800, performance.now()); const hidden = !c.group.visible;
    renderer.dispose(); c.dispose(); return { far, near, up, frontVisibility, hidden, glError };
  }, { manifest, basePath: base + '/v3/characters/' + entry.manifest.replace(/[^/]+$/, '') });
  assert.equal(render.far, true); assert.equal(render.near, true); assert.ok(render.up > .9999); assert.ok(render.frontVisibility > .3); assert.equal(render.hidden, true); assert.equal(render.glError, 0);
  const popupEvent = page.waitForEvent('popup'); await page.locator('#globePreview').click(); const popup = await popupEvent;
  const globeErrors = []; popup.on('pageerror', e => globeErrors.push(e.message));
  await popup.getByText('캐릭터 초안 미리보기 · 실제 지구에는 적용되지 않음').waitFor({ timeout: 45000 });
  await popup.waitForFunction(() => document.querySelector('#gl').width > 10);
  await popup.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await popup.screenshot({ path: 'artifacts/character-studio/globe-preview.png' });
  assert.deepEqual(globeErrors, []); await popup.close();
  await page.locator('#unpublish').click(); await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('지구에서 내렸습니다') && !document.querySelector('#app').inert);
  const unpublished = await (await context.request.get(base + '/v3/characters/catalog.json')).json(); assert.ok(!unpublished.characters.some(c => c.character_id === id));
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-step=parts]').click(); await page.screenshot({ path: 'artifacts/character-studio/mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false);
  assert.deepEqual(errors, []);
  await fs.writeFile('artifacts/character-studio/browser-results.json', JSON.stringify({ id, checks: ['upload-alpha', 'approve-design', 'edit-pivot-and-motion', 'save-reload', 'zip-export', 'publish', 'unpublish', 'actual-v3-popup-preview', 'mobile-no-overflow'], renderer: render, pageErrors: errors, globeErrors, beforePreviewBytes: before.length }, null, 2));
  console.log('PASS: upload, approvals, parts, persistent save/reload, ZIP, publish/unpublish, real WebGL LOD + normal + occlusion, mobile.');
} finally { await browser.close(); }

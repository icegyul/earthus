import test from 'node:test';
import assert from 'node:assert/strict';
import { files, newCharacter, validate, manifest, pose, zipFiles, autoLayers } from '../../prototype/v3-kids/character-core.js';
test('file contract rejects unsafe IDs and emits exact five names', () => {
  assert.throws(() => files('../yeti'));
  assert.deepEqual(Object.values(files('snow-yeti')), ['snow-yeti_master_sheet.png', 'snow-yeti_runtime_3q.png', 'snow-yeti_parts_atlas.png', 'snow-yeti_thumbnail.png', 'snow-yeti_manifest.json']);
});
test('empty editor, invalid crops and stale LOD settings yield validation instead of exceptions', () => {
  const c = newCharacter(); assert.ok(validate(c, { complete: true }).length);
  c.name = '예티'; c.character_id = 'snow-yeti'; assert.deepEqual(validate(c), []);
  c.layers[0].rect = [.8, 0, .4, 1]; assert.ok(validate(c).some(s => s.includes('영역')));
  c.lod.enter_px = c.lod.exit_px; assert.ok(validate(c).some(s => s.includes('전환')));
});
test('publication requires design provenance and human motion approval', () => {
  const c = newCharacter(); c.name = '예티'; c.character_id = 'snow-yeti';
  for (const s of ['master_sheet', 'runtime_3q', 'parts_atlas', 'thumbnail']) { c.assets[s] = new Blob(['x']); c.hashes[s] = s; }
  c.approvals.master = 'master_sheet'; c.references = { runtime_3q: 'master_sheet', parts_atlas: 'runtime_3q' };
  assert.equal(validate(c, { complete: true }).length, 1); c.approvals.motion = true; assert.deepEqual(validate(c, { complete: true }), []);
  assert.equal(manifest(c).direction, 'surface-normal-camera-facing');
  c.references.parts_atlas = 'old'; assert.equal(validate(c, { complete: true }).length, 1);
});
test('neutral pose and named limb movement are deterministic', () => {
  const c = newCharacter(); assert.deepEqual(pose(c.layers[0], 'breathe', 0), { angle: 0, dy: 0 });
  assert.notEqual(pose(c.layers[3], 'wave', .4).angle, 0); assert.equal(pose(c.layers[0], 'wave', .4).angle, 0);
});
test('ZIP contains local and central headers and exact count', async () => {
  const zip = await zipFiles([['characters/yeti/yeti_manifest.json', new Blob(['{}'])], ['characters/yeti/yeti_runtime_3q.png', new Blob(['png'])]]);
  const bytes = await zip.arrayBuffer(), view = new DataView(bytes); assert.equal(view.getUint32(0, true), 0x04034b50); assert.equal(view.getUint32(bytes.byteLength - 22, true), 0x06054b50); assert.equal(view.getUint16(bytes.byteLength - 12, true), 2);
});
test('automatic assembly measures the alpha of every cell and still stands a figure up', () => {
  const width = 1536, height = 1024, pixels = new Uint8ClampedArray(width * height * 4);
  const paint = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels[(y * width + x) * 4 + 3] = 255; };
  // Six parts, each deliberately off-centre inside its own 512x512 cell.
  const cells = [[140, 90, 380, 300], [660, 60, 900, 460], [1180, 80, 1280, 420],
    [90, 600, 190, 940], [640, 560, 760, 960], [1150, 570, 1270, 970]];
  cells.forEach(box => paint(...box));
  const { layers, warnings } = autoLayers(pixels, width, height);
  assert.deepEqual(warnings, []);
  assert.deepEqual(layers.map(l => l.id), ['head', 'body', 'arm_left', 'arm_right', 'leg_left', 'leg_right']);
  layers.forEach((layer, i) => {
    const [x, y, w, h] = layer.rect, [x0, y0, x1] = cells[i];
    assert.ok(Math.abs(x * width - x0) <= 4 && Math.abs(y * height - y0) <= 4, `${layer.id} 자르기 시작점`);
    assert.ok(Math.abs((x + w) * width - x1) <= 4, `${layer.id} 자르기 폭`);
    assert.ok(x >= (i % 3) / 3 && x + w <= (i % 3 + 1) / 3 + 1e-9, `${layer.id} 이 옆 칸을 침범`);
  });
  const by = Object.fromEntries(layers.map(l => [l.id, l]));
  assert.ok(by.head.y > by.body.y && by.body.y > by.leg_left.y);
  assert.ok(Math.abs(by.leg_left.y - by.leg_left.height / 2) < .02, '발이 바닥에 닿아야 한다');
  assert.ok(by.head.y + by.head.height / 2 < 1, '키가 한 칸을 넘지 않아야 한다');
  assert.ok(by.arm_left.x < 0 && by.arm_right.x > 0);
  const c = newCharacter(); c.name = '예티'; c.character_id = 'snow-yeti'; c.layers = layers;
  assert.deepEqual(validate(c), []);
});
test('an empty atlas cell falls back to the cell and names the part that needs a look', () => {
  const width = 1536, height = 1024, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 60; y < 300; y++) for (let x = 140; x < 380; x++) pixels[(y * width + x) * 4 + 3] = 255;
  const { layers, warnings } = autoLayers(pixels, width, height);
  assert.deepEqual(warnings, ['body', 'arm_left', 'arm_right', 'leg_left', 'leg_right']);
  const c = newCharacter(); c.name = '예티'; c.character_id = 'snow-yeti'; c.layers = layers;
  assert.deepEqual(validate(c), [], '빈 칸이 있어도 규격을 벗어나면 안 된다');
});

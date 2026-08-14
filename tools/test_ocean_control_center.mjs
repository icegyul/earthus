#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-ocean-control-center-'));
const source = await readFile(path.join(root, 'prototype/js/ocean/control-center.js'), 'utf8');
const modulePath = path.join(directory, 'control-center.mjs');
await writeFile(modulePath, source);
const control = await import(pathToFileURL(modulePath).href);

const repository = control.createMemoryMyOceanRepository();
let idCounter = 0;
const service = control.createMyOceanService({ repository,
  now: () => new Date('2026-08-14T12:00:00Z'),
  idFactory: prefix => `${prefix}-fixture-${++idCounter}`,
});
const active = { plan: 'PRO', expiresAt: '2026-09-01T00:00:00Z' };
const expired = { plan: 'PRO', expiresAt: '2026-08-14T11:59:59Z' };

const created = await service.createLayout({ layoutId: 'layout-fixture-1', ownerId: 'owner-a',
  templateId: 'SURF_DAY', deviceId: 'device-a', entitlement: active,
  idempotencyKey: 'create-layout-fixture-1' });
assert.equal(created.status, 'APPLIED');
assert.equal(created.result.revision, 1);
assert.equal(created.result.widgets[0].type, 'SAFETY');
assert.equal(created.result.widgets[0].width, 12);
assert.equal(created.result.widgets[1].x, 0);
assert.equal(created.result.widgets[1].y, 4);
assert.equal(created.result.shareState, 'PRIVATE');

const duplicateCreate = await service.createLayout({ layoutId: 'layout-fixture-1', ownerId: 'owner-a',
  templateId: 'SURF_DAY', deviceId: 'device-a', entitlement: active,
  idempotencyKey: 'create-layout-fixture-1' });
assert.equal(duplicateCreate.status, 'DUPLICATE');
assert.equal(duplicateCreate.result.id, created.result.id);

const validWidgets = created.result.widgets.map(widget => ({ ...widget,
  config: widget.type === 'SURF' ? { region: 'KR-26', unit: 'm' } : {} }));
const saved = await service.saveLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 1, widgets: validWidgets, deviceId: 'device-a', entitlement: active,
  idempotencyKey: 'save-layout-fixture-1-r1' });
assert.equal(saved.status, 'APPLIED');
assert.equal(saved.result.status, 'SAVED');
assert.equal(saved.result.layout.revision, 2);
assert.equal(saved.result.layout.parentRevision, 1);

const staleWidgets = validWidgets.map(widget => ({ ...widget,
  config: widget.type === 'SURF' ? { region: 'KR-11', unit: 'm' } : widget.config }));
const conflict = await service.saveLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 1, widgets: staleWidgets, deviceId: 'device-b', entitlement: active,
  idempotencyKey: 'save-layout-fixture-1-stale-device-b' });
assert.equal(conflict.result.status, 'CONFLICT_KEEP_BOTH');
assert.equal(conflict.result.canonical.revision, 2);
assert.equal(conflict.result.canonical.widgets[1].config.region, 'KR-26');
assert.equal(conflict.result.conflict.conflictOf, created.result.id);
assert.equal(conflict.result.conflict.conflictState, 'KEEP_BOTH');
assert.equal((await service.listLayouts({ ownerId: 'owner-a' })).length, 2);

const exactLocation = validWidgets.map(widget => ({ ...widget,
  config: widget.type === 'SURF' ? { Latitude: 35.1, longitude: 129.1 } : widget.config }));
await assert.rejects(service.saveLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 2, widgets: exactLocation, deviceId: 'device-a', entitlement: active,
  idempotencyKey: 'reject-exact-location' }),
error => error.code === 'MY_OCEAN_WIDGET_PRIVATE_OR_AETHERUS_STATE_FORBIDDEN');
const aetherusState = validWidgets.map(widget => ({ ...widget,
  config: widget.type === 'SURF' ? { nested: { mission_id: 'mission-1' } } : widget.config }));
await assert.rejects(service.saveLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 2, widgets: aetherusState, deviceId: 'device-a', entitlement: active,
  idempotencyKey: 'reject-aetherus-state' }),
error => error.code === 'MY_OCEAN_WIDGET_PRIVATE_OR_AETHERUS_STATE_FORBIDDEN');
const overlapping = validWidgets.map((widget, index) => ({ ...widget, x: 0, y: 0,
  width: 12, height: 4, id: `overlap-${index}` }));
await assert.rejects(service.saveLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 2, widgets: overlapping, deviceId: 'device-a', entitlement: active,
  idempotencyKey: 'reject-overlap' }), error => error.code === 'MY_OCEAN_WIDGET_GEOMETRY_OVERLAP');

await assert.rejects(service.createLayout({ layoutId: 'expired-create', ownerId: 'owner-a',
  templateId: 'FISHING_DAY', deviceId: 'device-a', entitlement: expired,
  idempotencyKey: 'expired-create' }), error => error.code === 'MY_OCEAN_CREATE_ENTITLEMENT_EXPIRED');
await assert.rejects(service.saveLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 2, widgets: validWidgets, deviceId: 'device-a', entitlement: expired,
  idempotencyKey: 'expired-edit' }), error => error.code === 'MY_OCEAN_EDIT_ENTITLEMENT_EXPIRED');

const loadedAfterExpiry = await service.loadLayout({ layoutId: created.result.id, ownerId: 'owner-a' });
assert.equal(loadedAfterExpiry.revision, 2);
const exported = await service.exportLayout({ layoutId: created.result.id, ownerId: 'owner-a' });
assert.match(exported.sha256, /^[a-f0-9]{64}$/);
assert.ok(exported.byteLength > 0);
assert.equal(exported.cacheControl, 'private, no-store');
await assert.rejects(service.loadLayout({ layoutId: created.result.id, ownerId: 'owner-b' }),
  error => error.code === 'MY_OCEAN_LAYOUT_NOT_FOUND');
await assert.rejects(service.deleteLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  explicitHumanConfirmation: false }), error => error.code === 'MY_OCEAN_DELETE_CONFIRMATION_REQUIRED');
const deletion = await service.deleteLayout({ layoutId: created.result.id, ownerId: 'owner-a',
  explicitHumanConfirmation: true });
assert.equal(deletion.status, 'DELETED');
assert.equal(deletion.lastRevision, 2);
await assert.rejects(service.loadLayout({ layoutId: created.result.id, ownerId: 'owner-a' }),
  error => error.code === 'MY_OCEAN_LAYOUT_NOT_FOUND');

assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: My Ocean create/save/conflict, private state, expiry read/export/delete and ownership gates');

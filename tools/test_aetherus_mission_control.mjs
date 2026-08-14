#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-aetherus-mission-control-'));
const source = await readFile(path.join(root, 'prototype/js/space/mission-control.js'), 'utf8');
const modulePath = path.join(directory, 'mission-control.mjs');
await writeFile(modulePath, source);
const mission = await import(pathToFileURL(modulePath).href);
const draftPolicy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/mission-control-policy.v1.json'), 'utf8'));
assert.equal(mission.validateMissionControlPolicy(draftPolicy).productionEnabled, false);

const approvedPolicy = { ...draftPolicy, revision: 'fixture-approved-v1', status: 'APPROVED',
  productionEnabled: true, approvedAt: '2026-08-14T09:00:00Z', approvedBy: 'fixture-product-owner' };
const entitlement = { status: 'ACTIVE', features: ['MISSION_CONTROL_EDIT'],
  expiresAt: '2026-09-01T00:00:00Z' };
const repository = mission.createMemoryMissionControlRepository();
let idCounter = 0;
const service = mission.createMissionControlService({ repository, policy: approvedPolicy,
  now: () => new Date('2026-08-14T12:00:00Z'),
  idFactory: prefix => `${prefix}-fixture-${++idCounter}` });

const created = await service.createRoom({ roomId: 'mission-room-1', ownerId: 'owner-a',
  title: 'Space Control', templateId: 'SPACE_CONTROL', deviceId: 'device-a', entitlement,
  idempotencyKey: 'create-mission-room-1' });
assert.equal(created.status, 'APPLIED');
assert.equal(created.result.widgets[0].type, 'CENTRAL_EARTH');
assert.equal(created.result.widgets.filter(item => item.type === 'CENTRAL_EARTH').length, 1);
assert.equal(created.result.shareState, 'PRIVATE');
assert.equal(created.result.cacheControl, 'private, no-store');
const earth = created.result.widgets[0];
assert.equal(created.result.widgets.every(item => item === earth
  || item.width * item.height <= earth.width * earth.height), true);
const duplicate = await service.createRoom({ roomId: 'mission-room-1', ownerId: 'owner-a',
  title: 'Space Control', templateId: 'SPACE_CONTROL', deviceId: 'device-a', entitlement,
  idempotencyKey: 'create-mission-room-1' });
assert.equal(duplicate.status, 'DUPLICATE');

const editedWidgets = created.result.widgets.map(item => ({ ...item,
  config: item.type === 'SATELLITE_PASS' ? { locationRef: 'private-location-1' } : item.config }));
const saved = await service.saveRoom({ roomId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 1, widgets: editedWidgets, title: 'Space Control A', deviceId: 'device-a',
  entitlement, idempotencyKey: 'save-mission-room-1-r1' });
assert.equal(saved.result.status, 'SAVED');
assert.equal(saved.result.room.revision, 2);
const conflict = await service.saveRoom({ roomId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 1, widgets: editedWidgets, title: 'Device B copy', deviceId: 'device-b',
  entitlement, idempotencyKey: 'save-mission-room-1-stale-b' });
assert.equal(conflict.result.status, 'CONFLICT_KEEP_BOTH');
assert.equal(conflict.result.canonical.revision, 2);
assert.equal(conflict.result.conflict.conflictState, 'KEEP_BOTH');

const forbidden = editedWidgets.map(item => ({ ...item,
  config: item.type === 'SATELLITE_PASS' ? { latitude: 37.5, oceanScore: 72 } : item.config }));
await assert.rejects(service.saveRoom({ roomId: created.result.id, ownerId: 'owner-a',
  expectedRevision: 2, widgets: forbidden, title: 'Reject', deviceId: 'device-a', entitlement,
  idempotencyKey: 'reject-private-config' }),
error => error.code === 'MISSION_CONTROL_PRIVATE_OR_OCEAN_STATE_FORBIDDEN');
await assert.rejects(service.loadRoom({ roomId: created.result.id, ownerId: 'owner-b' }),
  error => error.code === 'MISSION_CONTROL_ROOM_NOT_FOUND');

const mobile = mission.responsiveMissionLayout(saved.result.room, 390);
assert.equal(mobile.mode, 'MOBILE_STACK');
assert.equal(mobile.widgets[0].type, 'CENTRAL_EARTH');
assert.equal(mobile.widgets.every(item => item.x === 0 && item.width === 12), true);
const tablet = mission.responsiveMissionLayout(saved.result.room, 768);
assert.equal(tablet.mode, 'TABLET_TWO_COLUMN');
assert.equal(tablet.widgets[0].width, 12);
assert.equal(tablet.widgets.slice(1).every(item => item.width === 6), true);
assert.equal(mission.responsiveMissionLayout(saved.result.room, 1280).mode, 'DESKTOP_THREE_REGION');

const inactiveMission = mission.buildMissionMode(saved.result.room, { launchEvidence: {
  official: false, state: 'LIVE', sourceId: 'fixture-live', observedAt: '2026-08-14T11:59:00Z',
  freshness: { usable: true } } });
assert.equal(inactiveMission.active, false);
assert.equal(inactiveMission.liveClaimAllowed, false);
const activeMission = mission.buildMissionMode(saved.result.room, { launchEvidence: {
  official: true, state: 'ASCENT', sourceId: 'fixture-official-launch',
  observedAt: '2026-08-14T11:59:00Z', freshness: { usable: true } } });
assert.equal(activeMission.active, true);
assert.equal(activeMission.widgets[0].type, 'CENTRAL_EARTH');
assert.equal(activeMission.widgets[1].type, 'LIVE');
assert.equal(activeMission.notificationDispatchAllowed, false);

const fresh = mission.evaluateMissionWidgetData({ nowMs: Date.parse('2026-08-14T12:00:00Z'),
  freshnessPolicy: { status: 'APPROVED', staleAfterSeconds: 300 },
  data: { sourceId: 'fixture-space-weather', observedAt: '2026-08-14T11:59:00Z',
    status: 'LIVE', value: { kp: 2 } } });
assert.equal(fresh.state, 'READY');
assert.equal(fresh.liveClaimAllowed, true);
const stale = mission.evaluateMissionWidgetData({ nowMs: Date.parse('2026-08-14T12:10:00Z'),
  freshnessPolicy: { status: 'APPROVED', staleAfterSeconds: 300 },
  data: { sourceId: 'fixture-space-weather', observedAt: '2026-08-14T11:59:00Z',
    status: 'LIVE', value: { kp: 2 } } });
assert.equal(stale.state, 'STALE');
assert.equal(stale.liveClaimAllowed, false);
assert.equal(mission.evaluateMissionWidgetData({ data: null }).state, 'UNAVAILABLE');

const command = mission.normalizeMissionControlKeyboardCommand({ type: 'MOVE',
  widgetId: 'jwst-1', direction: 'RIGHT', announcement: 'JWST widget moved right' });
assert.equal(command.requiresServerCommit, true);
assert.equal(command.direction, 'RIGHT');
const exported = await service.exportRoom({ roomId: created.result.id, ownerId: 'owner-a' });
assert.match(exported.sha256, /^[a-f0-9]{64}$/);
assert.equal(exported.cacheControl, 'private, no-store');
await assert.rejects(service.deleteRoom({ roomId: created.result.id, ownerId: 'owner-a',
  explicitHumanConfirmation: false }), error => error.code === 'MISSION_CONTROL_DELETE_CONFIRMATION_REQUIRED');
const deletion = await service.deleteRoom({ roomId: created.result.id, ownerId: 'owner-a',
  explicitHumanConfirmation: true });
assert.equal(deletion.status, 'DELETED');

const closedRepository = mission.createMemoryMissionControlRepository();
const closedService = mission.createMissionControlService({ repository: closedRepository,
  policy: draftPolicy, now: () => new Date('2026-08-14T12:00:00Z') });
await assert.rejects(closedService.createRoom({ ownerId: 'owner-a', title: 'Closed',
  templateId: 'SPACE_CONTROL', deviceId: 'device-a', entitlement,
  idempotencyKey: 'closed-create' }), error => error.code === 'MISSION_CONTROL_EDIT_POLICY_CLOSED');
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Aetherus Mission Control Sheets 115-132 local layout, responsive, conflict, freshness and closed entitlement');

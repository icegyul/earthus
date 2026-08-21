#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importSkyAR() {
  const source = await readFile(path.join(ROOT, 'prototype/js/space/sky-ar.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function importAstronomy() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-sky-ar-astronomy-'));
  const coordinates = await readFile(path.join(ROOT, 'prototype/js/space/coordinates.js'), 'utf8');
  const kepler = (await readFile(path.join(ROOT, 'prototype/js/space/kepler.js'), 'utf8'))
    .replace("'./coordinates.js'", "'./coordinates.mjs'");
  const astronomy = (await readFile(path.join(ROOT, 'prototype/js/space/astronomy.js'), 'utf8'))
    .replace("'./kepler.js'", "'./kepler.mjs'")
    .replace("'./coordinates.js'", "'./coordinates.mjs'");
  await Promise.all([
    writeFile(path.join(directory, 'coordinates.mjs'), coordinates),
    writeFile(path.join(directory, 'kepler.mjs'), kepler),
    writeFile(path.join(directory, 'astronomy.mjs'), astronomy),
  ]);
  return import(pathToFileURL(path.join(directory, 'astronomy.mjs')).href);
}

const skyAR = await importSkyAR();
const astronomy = await importAstronomy();
const close = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

// W3C Z-X'-Y'' basis: portrait device upright with alpha 0 faces north/horizon.
const northLevel = skyAR.deviceOrientationBasis({
  alpha: 0, beta: 90, gamma: 0, screenAngleDeg: 0,
});
assert.ok(close(northLevel.azimuthDeg, 0));
assert.ok(close(northLevel.altitudeDeg, 0));
assert.ok(close(northLevel.rollDeg, 0));

const safariReading = skyAR.normalizeDeviceOrientationReading({
  alpha: 123,
  beta: 90,
  gamma: 0,
  absolute: false,
  webkitCompassHeading: 42,
  webkitCompassAccuracy: 8,
}, { screenAngleDeg: 0, atMs: 1000 });
assert.equal(safariReading.headingMode, 'SAFARI_COMPASS_ABSOLUTE');
assert.equal(safariReading.absolute, true);
assert.equal(safariReading.azimuthDeg, 42);
assert.equal(safariReading.headingAccuracyDeg, 8);

// Center, right-of-center, and behind-camera projection contracts.
const centered = skyAR.projectHorizontalToScreen({
  targetAzimuthDeg: 0, targetAltitudeDeg: 0,
  poseAzimuthDeg: 0, poseAltitudeDeg: 0,
  width: 390, height: 844, horizontalFovDeg: 60,
});
assert.equal(centered.visible, true);
assert.ok(close(centered.x, 195));
assert.ok(close(centered.y, 422));
const eastOfCenter = skyAR.projectHorizontalToScreen({
  targetAzimuthDeg: 10, targetAltitudeDeg: 0,
  poseAzimuthDeg: 0, poseAltitudeDeg: 0,
  width: 390, height: 844, horizontalFovDeg: 60,
});
assert.equal(eastOfCenter.visible, true);
assert.ok(eastOfCenter.x > centered.x);
const behind = skyAR.projectHorizontalToScreen({
  targetAzimuthDeg: 180, targetAltitudeDeg: 0,
  poseAzimuthDeg: 0, poseAltitudeDeg: 0,
  width: 390, height: 844, horizontalFovDeg: 60,
});
assert.equal(behind.visible, false);
assert.equal(behind.behind, true);

// Southern-hemisphere golden: the south celestial pole is due south at altitude |lat|.
const sydney = { lat: -33.8688, lon: 151.2093, source: 'shared' };
const southPole = astronomy.equatorialToHorizontal({
  raDeg: 0,
  decDeg: -90,
  observer: sydney,
  at: '2026-08-12T00:00:00.000Z',
});
assert.ok(Math.abs(southPole.altitudeDeg - 33.8688) < 1e-6);
assert.ok(Math.abs(skyAR.wrap180(southPole.azimuthDeg - 180)) < 1e-6);
const southernProjection = skyAR.projectHorizontalToScreen({
  targetAzimuthDeg: southPole.azimuthDeg,
  targetAltitudeDeg: southPole.altitudeDeg,
  poseAzimuthDeg: 180,
  poseAltitudeDeg: 33.8688,
  width: 844,
  height: 390,
  horizontalFovDeg: 60,
});
assert.equal(southernProjection.visible, true);
assert.ok(close(southernProjection.x, 422));
assert.ok(close(southernProjection.y, 195));

// Manual north/horizon calibration remains explicitly unverified, but can only raise
// a stable absolute sensor from hidden LOW cue to a BROAD ring, never PRECISE.
let poseNow = 2000;
const tracker = skyAR.createSkyARPoseTracker({ now: () => poseNow });
for (let index = 0; index < 8; index += 1) {
  tracker.push({
    ...safariReading,
    atMs: 1200 + index * 50,
    azimuthDeg: 12 + (index % 2 ? .2 : -.2),
    altitudeDeg: 2 + (index % 2 ? .1 : -.1),
    rollDeg: 1,
  });
}
const beforeCalibration = tracker.snapshot({
  cameraActive: true,
  targetAgeMs: 1000,
  locationAccuracyM: 12,
});
assert.equal(beforeCalibration.confidence.level, 'LOW');
assert.equal(beforeCalibration.confidence.cueMode, 'HIDDEN');
assert.ok(beforeCalibration.confidence.reasons.includes('CALIBRATION_REQUIRED'));

const calibration = skyAR.createSkyARCalibrationSession({
  now: () => new Date('2026-08-12T00:00:00.000Z'),
  idFactory: () => 'cal-fixture',
});
calibration.start();
const profile = calibration.lockManualNorthHorizon(tracker.latest());
assert.equal(profile.profileId, 'cal-fixture');
assert.equal(profile.precision, 'MANUAL_UNVERIFIED');
assert.equal(profile.residualDeg, null);
assert.ok(profile.limitations.includes('no-star-or-plate-solve-residual'));
const calibrated = tracker.snapshot({
  calibrationProfile: profile,
  cameraActive: true,
  targetAgeMs: 1000,
  locationAccuracyM: 12,
});
assert.equal(calibrated.confidence.level, 'MEDIUM');
assert.equal(calibrated.confidence.cueMode, 'BROAD_RING');
assert.ok(calibrated.confidence.angularUncertaintyDeg >= 12);
assert.ok(Math.abs(calibrated.latest.azimuthDeg) < .3);
assert.ok(Math.abs(calibrated.latest.altitudeDeg) < .2);

poseNow += 130_000;
const stale = tracker.snapshot({
  calibrationProfile: profile,
  cameraActive: true,
  targetAgeMs: 130_000,
  locationAccuracyM: 12,
});
assert.equal(stale.confidence.level, 'BLOCKED');
assert.equal(stale.confidence.cueMode, 'HIDDEN');
assert.ok(stale.confidence.reasons.includes('TARGET_STALE'));

// A synthetic 30-minute/15 Hz replay is a bounded-memory lifecycle fixture, not a
// real thermal claim. Only the most recent 32 readings remain.
let replayNow = 0;
const replay = skyAR.createSkyARPoseTracker({ maxSamples: 32, now: () => replayNow });
const syntheticCount = 30 * 60 * 15;
for (let index = 0; index < syntheticCount; index += 1) {
  replayNow = index * (1000 / 15);
  replay.push({
    ...safariReading,
    atMs: replayNow,
    azimuthDeg: 180 + Math.sin(index / 30) * .4,
    altitudeDeg: 25 + Math.cos(index / 30) * .2,
    rollDeg: 0,
  });
}
const replaySnapshot = replay.snapshot({ cameraActive: true, targetAgeMs: 0 });
assert.equal(replaySnapshot.totalSamples, syntheticCount);
assert.equal(replaySnapshot.bufferedSampleCount, 32);

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler); this.listeners.set(type, list);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== handler));
  }
  dispatch(type, event = {}) {
    (this.listeners.get(type) || []).slice().forEach(handler => handler(event));
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, list) => sum + list.length, 0);
  }
}

class FakeTrack extends FakeEventTarget {
  constructor() { super(); this.readyState = 'live'; this.stopped = false; }
  stop() { this.stopped = true; this.readyState = 'ended'; }
  getSettings() { return { width: 1280, height: 720, frameRate: 15, facingMode: 'environment' }; }
}

class FakeStream {
  constructor(track) { this.track = track; }
  getTracks() { return [this.track]; }
  getVideoTracks() { return [this.track]; }
}

function fakeEnvironment(permission = 'granted') {
  const windowRef = new FakeEventTarget();
  const orientation = new FakeEventTarget();
  const document = new FakeEventTarget();
  document.visibilityState = 'visible';
  windowRef.isSecureContext = true;
  windowRef.ondeviceorientationabsolute = null;
  windowRef.screen = { orientation: Object.assign(orientation, { angle: 0 }) };
  windowRef.document = document;
  windowRef.DeviceOrientationEvent = class DeviceOrientationEvent {
    static async requestPermission(absolute) {
      assert.equal(absolute, true);
      return permission;
    }
  };
  const track = new FakeTrack();
  let mediaRequests = 0;
  const navigatorRef = {
    mediaDevices: {
      async getUserMedia(constraints) {
        mediaRequests += 1;
        assert.equal(constraints.audio, false);
        assert.equal(constraints.video.facingMode.ideal, 'environment');
        assert.equal(constraints.video.frameRate.max, 20);
        return new FakeStream(track);
      },
    },
  };
  const video = { srcObject: null, muted: false, playsInline: false, async play() {}, pause() {} };
  return { windowRef, document, navigatorRef, track, video, get mediaRequests() { return mediaRequests; } };
}

// Permission lifecycle: one user-triggered start, finite event work, and complete release.
let runtimeNow = 10_000;
const allowed = fakeEnvironment('granted');
const runtime = skyAR.createBrowserSkyARRuntime({
  windowRef: allowed.windowRef,
  navigatorRef: allowed.navigatorRef,
  now: () => runtimeNow,
  maxEventHz: 15,
});
let delivered = 0;
const activeResult = await runtime.start({
  video: allowed.video,
  onSample: () => { delivered += 1; },
});
assert.equal(activeResult.status, 'ACTIVE');
assert.equal(allowed.mediaRequests, 1);
assert.equal(runtime.diagnostics().liveTrackCount, 1);
allowed.windowRef.dispatch('deviceorientationabsolute', {
  alpha: 0, beta: 90, gamma: 0, absolute: true,
});
runtimeNow += 10;
allowed.windowRef.dispatch('deviceorientationabsolute', {
  alpha: 0, beta: 90, gamma: 0, absolute: true,
});
assert.equal(delivered, 1);
assert.equal(runtime.diagnostics().droppedSampleCount, 1);
const released = runtime.stop('USER_STOP');
assert.equal(allowed.track.stopped, true);
assert.equal(released.listenerCount, 0);
assert.equal(released.liveTrackCount, 0);
assert.equal(released.loopCount, 0);
assert.equal(released.networkUploadCount, 0);
assert.equal(allowed.windowRef.listenerCount(), 0);
assert.equal(allowed.document.listenerCount(), 0);

// Denied orientation never opens camera. Hidden-page transition releases an active track.
const denied = fakeEnvironment('denied');
const deniedRuntime = skyAR.createBrowserSkyARRuntime({
  windowRef: denied.windowRef,
  navigatorRef: denied.navigatorRef,
});
const deniedResult = await deniedRuntime.start({ video: denied.video });
assert.equal(deniedResult.status, 'BLOCKED');
assert.equal(deniedResult.reason, 'ORIENTATION_PERMISSION_DENIED');
assert.equal(denied.mediaRequests, 0);

const hidden = fakeEnvironment('granted');
const hiddenRuntime = skyAR.createBrowserSkyARRuntime({
  windowRef: hidden.windowRef,
  navigatorRef: hidden.navigatorRef,
});
assert.equal((await hiddenRuntime.start({ video: hidden.video })).status, 'ACTIVE');
hidden.document.visibilityState = 'hidden';
hidden.document.dispatch('visibilitychange');
assert.equal(hidden.track.stopped, true);
assert.equal(hiddenRuntime.diagnostics().listenerCount, 0);
assert.equal(hiddenRuntime.diagnostics().liveTrackCount, 0);

// Closing while getUserMedia is pending invalidates the start generation and
// releases the late stream without attaching any sensor listeners.
const cancelled = fakeEnvironment('granted');
let resolvePendingCamera;
cancelled.navigatorRef.mediaDevices.getUserMedia = () => new Promise(resolve => {
  resolvePendingCamera = resolve;
});
const cancelledRuntime = skyAR.createBrowserSkyARRuntime({
  windowRef: cancelled.windowRef,
  navigatorRef: cancelled.navigatorRef,
});
const pendingStart = cancelledRuntime.start({ video: cancelled.video });
await Promise.resolve();
await Promise.resolve();
assert.equal(typeof resolvePendingCamera, 'function');
const cancelledRelease = cancelledRuntime.stop('START_CANCELLED');
assert.equal(cancelledRelease.listenerCount, 0);
resolvePendingCamera(new FakeStream(cancelled.track));
const cancelledResult = await pendingStart;
assert.equal(cancelledResult.status, 'BLOCKED');
assert.equal(cancelledResult.reason, 'START_CANCELLED');
assert.equal(cancelled.track.stopped, true);
assert.equal(cancelledRuntime.diagnostics().listenerCount, 0);
assert.equal(cancelledRuntime.diagnostics().liveTrackCount, 0);

const source = await readFile(path.join(ROOT, 'prototype/js/space/sky-ar.js'), 'utf8');
assert.doesNotMatch(source, /requestAnimationFrame|setInterval|\bfetch\s*\(/);
const integration = `${await readFile(path.join(ROOT, 'prototype/js/space/cosmic3d.js'), 'utf8')}\n${await readFile(path.join(ROOT, 'prototype/js/space/cosmic3d-legacy.js'), 'utf8')}`;
assert.match(integration, /window\.location\.hash === '#dev'/);
assert.match(integration, /import\('\.\/sky-ar\.js'\)/);
assert.doesNotMatch(integration, /import\('\.\/sky-ar\.js\?v=/,
  'ES module identity를 query suffix로 나누면 singleton 수명주기 검증이 무효화된다');
assert.match(integration, /closeSkyARProbe\(\{ hide: true \}\)/);

console.log('PASS: Sky AR ENU projection, southern hemisphere, low-confidence cue suppression, manual calibration, bounded 30-minute replay, permission denial, and zero-work release');

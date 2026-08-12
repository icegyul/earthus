// Aetherus Sky AR Core — device-ready local projection and permission lifecycle.
//
// This module never sends camera, orientation, calibration, or location samples to a
// server. It is intentionally event-driven: there is no rAF, timer, polling loop, or
// background worker. Low-confidence pose hides the target cue instead of presenting
// an attractive but unsupported pointing claim.

export const SKY_AR_RUNTIME_SCHEMA = 'earthus.sky-ar-runtime.v1';
export const SKY_AR_CALIBRATION_SCHEMA = 'earthus.sky-ar-calibration.v1';
export const SKY_AR_PRECISION = 'DEVICE_PROBE_UNVERIFIED';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));
export const wrap360 = value => ((Number(value) % 360) + 360) % 360;
export const wrap180 = value => {
  const wrapped = wrap360(value);
  return wrapped > 180 ? wrapped - 360 : wrapped;
};

const vector = (x, y, z) => Object.freeze({ x, y, z });
const add = (a, b) => vector(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a, amount) => vector(a.x * amount, a.y * amount, a.z * amount);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => vector(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
const magnitude = value => Math.hypot(value.x, value.y, value.z);
const normalize = value => {
  const length = magnitude(value);
  if (!Number.isFinite(length) || length < 1e-9) throw new RangeError('SKY_AR_ZERO_VECTOR');
  return scale(value, 1 / length);
};

function multiplyMatrix(left, right) {
  return Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => (
    left[row][0] * right[0][column]
    + left[row][1] * right[1][column]
    + left[row][2] * right[2][column]
  )));
}

function transform(matrix, value) {
  return vector(
    matrix[0][0] * value.x + matrix[0][1] * value.y + matrix[0][2] * value.z,
    matrix[1][0] * value.x + matrix[1][1] * value.y + matrix[1][2] * value.z,
    matrix[2][0] * value.x + matrix[2][1] * value.y + matrix[2][2] * value.z,
  );
}

// W3C Device Orientation uses intrinsic Z-X'-Y'' rotations. World axes here are
// x=east, y=north, z=up. The rear camera looks along device -z; screen orientation
// rotates only the screen-right/up basis around that optical axis.
export function deviceOrientationBasis({ alpha, beta, gamma, screenAngleDeg = 0 }) {
  if (![alpha, beta, gamma, screenAngleDeg].every(finite)) {
    throw new RangeError('SKY_AR_ORIENTATION_NUMBERS_REQUIRED');
  }
  const a = Number(alpha) * DEG;
  const b = Number(beta) * DEG;
  const g = Number(gamma) * DEG;
  const screen = wrap360(screenAngleDeg) * DEG;
  const rz = [
    [Math.cos(a), -Math.sin(a), 0],
    [Math.sin(a), Math.cos(a), 0],
    [0, 0, 1],
  ];
  const rx = [
    [1, 0, 0],
    [0, Math.cos(b), -Math.sin(b)],
    [0, Math.sin(b), Math.cos(b)],
  ];
  const ry = [
    [Math.cos(g), 0, Math.sin(g)],
    [0, 1, 0],
    [-Math.sin(g), 0, Math.cos(g)],
  ];
  const rotation = multiplyMatrix(multiplyMatrix(rz, rx), ry);
  const deviceRight = vector(Math.cos(screen), Math.sin(screen), 0);
  const deviceUp = vector(-Math.sin(screen), Math.cos(screen), 0);
  const forward = normalize(scale(transform(rotation, vector(0, 0, 1)), -1));
  const screenRight = normalize(transform(rotation, deviceRight));
  const screenUp = normalize(transform(rotation, deviceUp));
  const altitudeDeg = Math.asin(clamp(forward.z, -1, 1)) * RAD;
  const azimuthDeg = wrap360(Math.atan2(forward.x, forward.y) * RAD);
  const worldUp = vector(0, 0, 1);
  let zeroRight;
  try {
    zeroRight = normalize(cross(forward, worldUp));
  } catch (_) {
    zeroRight = screenRight;
  }
  const zeroUp = normalize(cross(zeroRight, forward));
  const rollDeg = Math.atan2(dot(screenUp, zeroRight), dot(screenUp, zeroUp)) * RAD;
  return Object.freeze({
    forward,
    screenRight,
    screenUp,
    azimuthDeg,
    altitudeDeg,
    rollDeg: wrap180(rollDeg),
    frame: 'local-ENU-device-rear-camera',
  });
}

export function normalizeDeviceOrientationReading(event, {
  screenAngleDeg = 0,
  atMs = Date.now(),
} = {}) {
  if (!event || ![event.alpha, event.beta, event.gamma].every(finite)) {
    throw new RangeError('SKY_AR_ORIENTATION_READING_INCOMPLETE');
  }
  const basis = deviceOrientationBasis({
    alpha: event.alpha,
    beta: event.beta,
    gamma: event.gamma,
    screenAngleDeg,
  });
  const safariHeading = finite(event.webkitCompassHeading)
    ? wrap360(event.webkitCompassHeading) : null;
  const safariAccuracy = finite(event.webkitCompassAccuracy)
    ? Math.abs(Number(event.webkitCompassAccuracy)) : null;
  const absolute = event.absolute === true || safariHeading != null;
  return Object.freeze({
    schema: SKY_AR_RUNTIME_SCHEMA,
    atMs: Number(atMs),
    azimuthDeg: safariHeading ?? basis.azimuthDeg,
    altitudeDeg: basis.altitudeDeg,
    rollDeg: basis.rollDeg,
    absolute,
    headingMode: safariHeading != null
      ? 'SAFARI_COMPASS_ABSOLUTE'
      : event.absolute === true ? 'W3C_ABSOLUTE' : 'W3C_RELATIVE',
    headingAccuracyDeg: safariAccuracy,
    screenAngleDeg: wrap360(screenAngleDeg),
    raw: Object.freeze({
      alpha: Number(event.alpha),
      beta: Number(event.beta),
      gamma: Number(event.gamma),
    }),
  });
}

export function horizontalDirection({ azimuthDeg, altitudeDeg }) {
  if (![azimuthDeg, altitudeDeg].every(finite)) {
    throw new RangeError('SKY_AR_HORIZONTAL_COORDINATES_REQUIRED');
  }
  const azimuth = wrap360(azimuthDeg) * DEG;
  const altitude = clamp(Number(altitudeDeg), -90, 90) * DEG;
  return vector(
    Math.cos(altitude) * Math.sin(azimuth),
    Math.cos(altitude) * Math.cos(azimuth),
    Math.sin(altitude),
  );
}

export function verticalFovForViewport({ horizontalFovDeg, width, height }) {
  if (![horizontalFovDeg, width, height].every(finite)
    || Number(horizontalFovDeg) <= 0 || Number(horizontalFovDeg) >= 180
    || Number(width) <= 0 || Number(height) <= 0) {
    throw new RangeError('SKY_AR_FOV_VIEWPORT_INVALID');
  }
  return 2 * Math.atan(
    Math.tan(Number(horizontalFovDeg) * DEG / 2) * Number(height) / Number(width),
  ) * RAD;
}

export function projectHorizontalToScreen({
  targetAzimuthDeg,
  targetAltitudeDeg,
  poseAzimuthDeg,
  poseAltitudeDeg,
  rollDeg = 0,
  horizontalFovDeg = 60,
  verticalFovDeg = null,
  width,
  height,
}) {
  if (![targetAzimuthDeg, targetAltitudeDeg, poseAzimuthDeg, poseAltitudeDeg,
    rollDeg, horizontalFovDeg, width, height].every(finite)) {
    throw new RangeError('SKY_AR_PROJECTION_INPUT_INVALID');
  }
  const target = horizontalDirection({ azimuthDeg: targetAzimuthDeg, altitudeDeg: targetAltitudeDeg });
  const forward = horizontalDirection({ azimuthDeg: poseAzimuthDeg, altitudeDeg: poseAltitudeDeg });
  const worldUp = vector(0, 0, 1);
  let right;
  try {
    right = normalize(cross(forward, worldUp));
  } catch (_) {
    right = vector(1, 0, 0);
  }
  let up = normalize(cross(right, forward));
  const roll = Number(rollDeg) * DEG;
  const rolledRight = add(scale(right, Math.cos(roll)), scale(up, Math.sin(roll)));
  up = add(scale(up, Math.cos(roll)), scale(right, -Math.sin(roll)));
  const depth = dot(target, forward);
  const rightAmount = dot(target, rolledRight);
  const upAmount = dot(target, up);
  const horizontalAngleDeg = Math.atan2(rightAmount, depth) * RAD;
  const verticalAngleDeg = Math.atan2(upAmount, depth) * RAD;
  const effectiveVerticalFov = finite(verticalFovDeg)
    ? Number(verticalFovDeg)
    : verticalFovForViewport({ horizontalFovDeg, width, height });
  const normalizedX = Math.tan(horizontalAngleDeg * DEG)
    / Math.tan(Number(horizontalFovDeg) * DEG / 2);
  const normalizedY = Math.tan(verticalAngleDeg * DEG)
    / Math.tan(effectiveVerticalFov * DEG / 2);
  const visible = depth > 0 && Math.abs(normalizedX) <= 1 && Math.abs(normalizedY) <= 1;
  return Object.freeze({
    visible,
    behind: depth <= 0,
    x: (normalizedX * .5 + .5) * Number(width),
    y: (.5 - normalizedY * .5) * Number(height),
    normalizedX,
    normalizedY,
    horizontalAngleDeg,
    verticalAngleDeg,
    angularSeparationDeg: Math.acos(clamp(depth, -1, 1)) * RAD,
    horizontalFovDeg: Number(horizontalFovDeg),
    verticalFovDeg: effectiveVerticalFov,
    frame: 'local-ENU-perspective',
  });
}

function circularMean(values) {
  const x = values.reduce((sum, value) => sum + Math.cos(Number(value) * DEG), 0);
  const y = values.reduce((sum, value) => sum + Math.sin(Number(value) * DEG), 0);
  return wrap360(Math.atan2(y, x) * RAD);
}

function rootMeanSquare(values) {
  if (!values.length) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function applyCalibration(sample, profile) {
  if (!sample) return null;
  const headingOffsetDeg = finite(profile?.headingOffsetDeg) ? Number(profile.headingOffsetDeg) : 0;
  const altitudeOffsetDeg = finite(profile?.altitudeOffsetDeg) ? Number(profile.altitudeOffsetDeg) : 0;
  const rollOffsetDeg = finite(profile?.rollOffsetDeg) ? Number(profile.rollOffsetDeg) : 0;
  return Object.freeze({
    ...sample,
    azimuthDeg: wrap360(sample.azimuthDeg + headingOffsetDeg),
    altitudeDeg: clamp(sample.altitudeDeg + altitudeOffsetDeg, -90, 90),
    rollDeg: wrap180(sample.rollDeg + rollOffsetDeg),
    calibrationProfileId: profile?.profileId || null,
  });
}

export function createSkyARCalibrationSession({ now = () => new Date(), idFactory = null } = {}) {
  let state = 'NOT_STARTED';
  let profile = null;
  const createId = idFactory || (() => `cal_${Math.random().toString(36).slice(2, 10)}`);
  return Object.freeze({
    get state() { return state; },
    get profile() { return profile; },
    start() {
      if (!['NOT_STARTED', 'REJECTED', 'LOCKED_LOW_CONFIDENCE'].includes(state)) {
        throw new Error('SKY_AR_CALIBRATION_TRANSITION_REJECTED');
      }
      state = 'COLLECTING';
      return state;
    },
    lockManualNorthHorizon(sample) {
      if (state !== 'COLLECTING') throw new Error('SKY_AR_CALIBRATION_NOT_COLLECTING');
      if (!sample || ![sample.azimuthDeg, sample.altitudeDeg, sample.rollDeg].every(finite)) {
        state = 'REJECTED';
        throw new RangeError('SKY_AR_CALIBRATION_SAMPLE_REQUIRED');
      }
      const date = now();
      profile = Object.freeze({
        schema: SKY_AR_CALIBRATION_SCHEMA,
        schemaVersion: 1,
        profileId: createId(),
        state: 'LOCKED_LOW_CONFIDENCE',
        method: 'USER_COMPASS_NORTH_AND_HORIZON',
        headingOffsetDeg: wrap180(-sample.azimuthDeg),
        altitudeOffsetDeg: clamp(-sample.altitudeDeg, -45, 45),
        rollOffsetDeg: clamp(-sample.rollDeg, -45, 45),
        residualDeg: null,
        createdAtUtc: new Date(date).toISOString(),
        source: Object.freeze({
          kind: 'user-input',
          sampleCount: 1,
          sensorHeadingMode: sample.headingMode,
        }),
        precision: 'MANUAL_UNVERIFIED',
        limitations: Object.freeze([
          'magnetic-declination-not-corrected',
          'camera-intrinsics-not-solved',
          'no-star-or-plate-solve-residual',
        ]),
      });
      state = profile.state;
      return profile;
    },
    reset() {
      state = 'NOT_STARTED';
      profile = null;
    },
  });
}

export function evaluateSkyARConfidence({
  sample,
  sampleCount = 0,
  jitterDeg = null,
  calibrationProfile = null,
  cameraActive = false,
  targetAgeMs = Infinity,
  locationAccuracyM = null,
  intrinsics = { source: 'FALLBACK_UNVERIFIED', horizontalFovDeg: 60 },
  nowMs = Date.now(),
} = {}) {
  const reasons = [];
  if (!cameraActive) reasons.push('CAMERA_INACTIVE');
  if (!sample) reasons.push('POSE_MISSING');
  const poseAgeMs = sample ? Math.max(0, Number(nowMs) - Number(sample.atMs)) : Infinity;
  if (poseAgeMs > 1000) reasons.push('POSE_STALE');
  if (Number(sampleCount) < 6) reasons.push('POSE_WARMING');
  if (sample && !sample.absolute) reasons.push('ABSOLUTE_HEADING_UNAVAILABLE');
  if (finite(sample?.headingAccuracyDeg) && Number(sample.headingAccuracyDeg) > 35) {
    reasons.push('MAGNETIC_ACCURACY_LOW');
  }
  if (finite(jitterDeg) && Number(jitterDeg) > 8) reasons.push('POSE_JITTER_HIGH');
  if (!calibrationProfile) reasons.push('CALIBRATION_REQUIRED');
  if (Number(targetAgeMs) > 120_000) reasons.push('TARGET_STALE');
  if (finite(locationAccuracyM) && Number(locationAccuracyM) > 500) reasons.push('LOCATION_ACCURACY_LOW');
  const blocking = ['CAMERA_INACTIVE', 'POSE_MISSING', 'POSE_STALE', 'TARGET_STALE'];
  const low = [
    'POSE_WARMING', 'ABSOLUTE_HEADING_UNAVAILABLE', 'MAGNETIC_ACCURACY_LOW',
    'POSE_JITTER_HIGH', 'CALIBRATION_REQUIRED', 'LOCATION_ACCURACY_LOW',
  ];
  let level = reasons.some(reason => blocking.includes(reason)) ? 'BLOCKED'
    : reasons.some(reason => low.includes(reason)) ? 'LOW' : 'MEDIUM';
  const verifiedIntrinsics = intrinsics?.source === 'PLATE_SOLVED_OR_CALIBRATED';
  const verifiedResidual = finite(calibrationProfile?.residualDeg)
    && Number(calibrationProfile.residualDeg) <= 2;
  if (level === 'MEDIUM' && verifiedIntrinsics && verifiedResidual
    && (!finite(jitterDeg) || Number(jitterDeg) <= 2)
    && (!finite(sample?.headingAccuracyDeg) || Number(sample.headingAccuracyDeg) <= 10)) {
    level = 'HIGH';
  }
  const cueMode = level === 'HIGH' ? 'PRECISE_RING'
    : level === 'MEDIUM' ? 'BROAD_RING' : 'HIDDEN';
  const uncertainty = level === 'HIGH' ? 3 : level === 'MEDIUM'
    ? Math.max(12, Number(sample?.headingAccuracyDeg) || 0, Number(jitterDeg) || 0) : null;
  return Object.freeze({
    level,
    cueMode,
    reasons: Object.freeze(reasons),
    poseAgeMs,
    angularUncertaintyDeg: uncertainty,
    precision: SKY_AR_PRECISION,
  });
}

export function createSkyARPoseTracker({ maxSamples = 32, now = () => Date.now() } = {}) {
  const samples = [];
  let totalSamples = 0;
  return Object.freeze({
    push(sample) {
      if (!sample || ![sample.azimuthDeg, sample.altitudeDeg, sample.rollDeg, sample.atMs].every(finite)) {
        throw new RangeError('SKY_AR_POSE_SAMPLE_INVALID');
      }
      samples.push(Object.freeze({ ...sample }));
      totalSamples += 1;
      while (samples.length > maxSamples) samples.shift();
      return sample;
    },
    clear() { samples.splice(0); totalSamples = 0; },
    latest(calibrationProfile = null) {
      return applyCalibration(samples.at(-1) || null, calibrationProfile);
    },
    snapshot({
      calibrationProfile = null,
      cameraActive = false,
      targetAgeMs = Infinity,
      locationAccuracyM = null,
      intrinsics = { source: 'FALLBACK_UNVERIFIED', horizontalFovDeg: 60 },
    } = {}) {
      const latest = applyCalibration(samples.at(-1) || null, calibrationProfile);
      const adjusted = samples.map(sample => applyCalibration(sample, calibrationProfile));
      const headingMean = adjusted.length ? circularMean(adjusted.map(sample => sample.azimuthDeg)) : null;
      const altitudeMean = adjusted.length
        ? adjusted.reduce((sum, sample) => sum + sample.altitudeDeg, 0) / adjusted.length : null;
      const headingJitter = headingMean == null ? null
        : rootMeanSquare(adjusted.map(sample => wrap180(sample.azimuthDeg - headingMean)));
      const altitudeJitter = altitudeMean == null ? null
        : rootMeanSquare(adjusted.map(sample => sample.altitudeDeg - altitudeMean));
      const jitterDeg = headingJitter == null ? null : Math.hypot(headingJitter, altitudeJitter || 0);
      const confidence = evaluateSkyARConfidence({
        sample: latest,
        sampleCount: samples.length,
        jitterDeg,
        calibrationProfile,
        cameraActive,
        targetAgeMs,
        locationAccuracyM,
        intrinsics,
        nowMs: now(),
      });
      return Object.freeze({
        latest,
        bufferedSampleCount: samples.length,
        totalSamples,
        jitterDeg,
        confidence,
      });
    },
  });
}

function permissionErrorCode(error) {
  const name = error?.name || error?.code || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'PERMISSION_DENIED';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'CAMERA_NOT_FOUND';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'CAMERA_NOT_READABLE';
  if (name === 'OverconstrainedError') return 'CAMERA_CONSTRAINT_UNAVAILABLE';
  return error?.message || name || 'SKY_AR_START_FAILED';
}

export function createBrowserSkyARRuntime({
  windowRef = typeof window === 'undefined' ? null : window,
  navigatorRef = typeof navigator === 'undefined' ? null : navigator,
  now = () => Date.now(),
  maxEventHz = 15,
} = {}) {
  let state = 'IDLE';
  let stream = null;
  let video = null;
  let onSample = null;
  let onState = null;
  let lastAcceptedAt = -Infinity;
  let lastAbsoluteAt = -Infinity;
  let acceptedSampleCount = 0;
  let droppedSampleCount = 0;
  let startGeneration = 0;
  const listeners = [];
  const minimumIntervalMs = 1000 / clamp(Number(maxEventHz) || 15, 1, 30);

  const emitState = (next, detail = {}) => {
    state = next;
    onState?.(Object.freeze({ state: next, ...detail }));
  };
  const listen = (target, type, handler) => {
    target?.addEventListener?.(type, handler);
    listeners.push({ target, type, handler });
  };
  const removeListeners = () => {
    listeners.splice(0).forEach(({ target, type, handler }) => {
      target?.removeEventListener?.(type, handler);
    });
  };
  const screenAngle = () => Number(windowRef?.screen?.orientation?.angle
    ?? windowRef?.orientation ?? 0) || 0;
  const accept = (event, source) => {
    const atMs = now();
    if (source === 'absolute') lastAbsoluteAt = atMs;
    if (source === 'relative' && atMs - lastAbsoluteAt < 750) {
      droppedSampleCount += 1;
      return;
    }
    if (atMs - lastAcceptedAt < minimumIntervalMs) {
      droppedSampleCount += 1;
      return;
    }
    let sample;
    try {
      sample = normalizeDeviceOrientationReading(event, { screenAngleDeg: screenAngle(), atMs });
    } catch (_) {
      droppedSampleCount += 1;
      return;
    }
    lastAcceptedAt = atMs;
    acceptedSampleCount += 1;
    onSample?.(sample);
  };
  const stop = (reason = 'USER_STOP') => {
    startGeneration += 1;
    removeListeners();
    if (stream) stream.getTracks?.().forEach(track => track.stop?.());
    if (video) {
      try { video.pause?.(); } catch (_) { /* no-op */ }
      try { video.srcObject = null; } catch (_) { /* no-op */ }
    }
    stream = null;
    video = null;
    lastAcceptedAt = -Infinity;
    lastAbsoluteAt = -Infinity;
    emitState('STOPPED', { reason });
    return diagnostics();
  };
  const diagnostics = () => Object.freeze({
    schema: SKY_AR_RUNTIME_SCHEMA,
    state,
    listenerCount: listeners.length,
    liveTrackCount: stream?.getTracks?.().filter(track => track.readyState !== 'ended').length || 0,
    acceptedSampleCount,
    droppedSampleCount,
    loopCount: 0,
    networkUploadCount: 0,
  });
  const capabilityReport = () => Object.freeze({
    secureContext: !!windowRef?.isSecureContext,
    orientation: !!windowRef?.DeviceOrientationEvent,
    orientationPermissionRequest: typeof windowRef?.DeviceOrientationEvent?.requestPermission === 'function',
    camera: typeof navigatorRef?.mediaDevices?.getUserMedia === 'function',
    absoluteEvent: 'ondeviceorientationabsolute' in (windowRef || {}),
    precision: SKY_AR_PRECISION,
  });

  return Object.freeze({
    capabilityReport,
    diagnostics,
    async start(options = {}) {
      if (state === 'ACTIVE' || state === 'REQUESTING_PERMISSION') {
        return Object.freeze({ status: 'ALREADY_ACTIVE', diagnostics: diagnostics() });
      }
      const capabilities = capabilityReport();
      onSample = typeof options.onSample === 'function' ? options.onSample : null;
      onState = typeof options.onState === 'function' ? options.onState : null;
      video = options.video || null;
      acceptedSampleCount = 0;
      droppedSampleCount = 0;
      if (!capabilities.secureContext) {
        emitState('BLOCKED', { reason: 'SECURE_CONTEXT_REQUIRED' });
        return Object.freeze({ status: 'BLOCKED', reason: 'SECURE_CONTEXT_REQUIRED', capabilities });
      }
      if (!capabilities.orientation) {
        emitState('BLOCKED', { reason: 'ORIENTATION_SENSOR_UNAVAILABLE' });
        return Object.freeze({ status: 'BLOCKED', reason: 'ORIENTATION_SENSOR_UNAVAILABLE', capabilities });
      }
      if (!capabilities.camera) {
        emitState('BLOCKED', { reason: 'CAMERA_API_UNAVAILABLE' });
        return Object.freeze({ status: 'BLOCKED', reason: 'CAMERA_API_UNAVAILABLE', capabilities });
      }
      emitState('REQUESTING_PERMISSION');
      const generation = ++startGeneration;
      const cancelled = (openedStream = null) => {
        openedStream?.getTracks?.().forEach(track => track.stop?.());
        if (video?.srcObject === openedStream) {
          try { video.pause?.(); } catch (_) { /* no-op */ }
          try { video.srcObject = null; } catch (_) { /* no-op */ }
        }
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'START_CANCELLED',
          capabilities,
          diagnostics: diagnostics(),
        });
      };
      try {
        const requestPermission = windowRef.DeviceOrientationEvent.requestPermission;
        if (typeof requestPermission === 'function') {
          const permission = requestPermission.length > 0
            ? await requestPermission.call(windowRef.DeviceOrientationEvent, true)
            : await requestPermission.call(windowRef.DeviceOrientationEvent);
          if (generation !== startGeneration) return cancelled();
          if (permission !== 'granted') {
            emitState('BLOCKED', { reason: 'ORIENTATION_PERMISSION_DENIED' });
            return Object.freeze({ status: 'BLOCKED', reason: 'ORIENTATION_PERMISSION_DENIED', capabilities });
          }
        }
        const openedStream = await navigatorRef.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 15, max: 20 },
          },
        });
        if (generation !== startGeneration) return cancelled(openedStream);
        if (video) {
          video.muted = true;
          video.playsInline = true;
          video.srcObject = openedStream;
          try { await video.play?.(); } catch (_) { /* frame may start after metadata */ }
        }
        if (generation !== startGeneration) return cancelled(openedStream);
        stream = openedStream;
        listen(windowRef, 'deviceorientationabsolute', event => accept(event, 'absolute'));
        listen(windowRef, 'deviceorientation', event => accept(event, 'relative'));
        listen(windowRef?.screen?.orientation, 'change', () => {
          lastAcceptedAt = -Infinity;
        });
        listen(windowRef?.document, 'visibilitychange', () => {
          if (windowRef.document.visibilityState !== 'visible') stop('DOCUMENT_HIDDEN');
        });
        stream.getTracks?.().forEach(track => {
          listen(track, 'ended', () => {
            if (state === 'ACTIVE') stop('CAMERA_TRACK_ENDED');
          });
        });
        emitState('ACTIVE', {
          camera: stream.getVideoTracks?.()[0]?.getSettings?.() || {},
        });
        return Object.freeze({
          status: 'ACTIVE',
          capabilities,
          camera: Object.freeze({ ...(stream.getVideoTracks?.()[0]?.getSettings?.() || {}) }),
          diagnostics: diagnostics(),
        });
      } catch (error) {
        if (generation !== startGeneration) return cancelled();
        const reason = permissionErrorCode(error);
        stop(reason);
        emitState('BLOCKED', { reason });
        return Object.freeze({ status: 'BLOCKED', reason, capabilities });
      }
    },
    stop,
  });
}

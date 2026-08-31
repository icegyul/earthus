/* EARTHUS V2 — explicit, time-bounded atmosphere and solar-light contract.
 *
 * This runtime does not animate time. It captures or receives one UTC instant,
 * derives the real fixed-frame sun direction through Cesium astronomy, and
 * applies a documented Earth Rayleigh/Mie presentation. City lights are a
 * static NASA VIIRS night-context layer, never a live population claim.
 */

const round = (value, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const PHYSICAL_ATMOSPHERE_PROFILE = Object.freeze({
  truthClass: 'EXPLICIT_EARTH_RAYLEIGH_MIE_PRESENTATION',
  rayleighCoefficient: Object.freeze([5.2e-6, 12.1e-6, 27.5e-6]),
  rayleighScaleHeightM: 8_000,
  mieCoefficient: Object.freeze([20e-6, 20e-6, 20e-6]),
  mieScaleHeightM: 1_200,
  mieAnisotropy: 0.82,
  perFragmentAtmosphere: true,
  skyHueShift: -0.01,
  skySaturationShift: -0.08,
  skyBrightnessShift: -0.12,
  groundHueShift: 0,
  groundSaturationShift: -0.08,
  groundBrightnessShift: -0.06,
  lightingFadeOutDistanceM: 9_000_000,
  lightingFadeInDistanceM: 20_000_000,
  sunIntensity: 1.9,
});

function normalizedSunDirection(sunDirection) {
  if (!Array.isArray(sunDirection) || sunDirection.length !== 3)
    throw new Error('SUN_DIRECTION_REQUIRED');
  const vector = sunDirection.map(Number);
  const magnitude = Math.hypot(...vector);
  if (!(magnitude > 0) || !Number.isFinite(magnitude))
    throw new Error('SUN_DIRECTION_NONZERO_REQUIRED');
  return vector.map(value => value / magnitude);
}

export function solarIncidenceAt({ longitudeDeg, latitudeDeg, sunDirection } = {}) {
  const longitude = Number(longitudeDeg) * Math.PI / 180;
  const latitude = Number(latitudeDeg) * Math.PI / 180;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude))
    throw new Error('SOLAR_INCIDENCE_COORDINATE_REQUIRED');
  const sun = normalizedSunDirection(sunDirection);
  const cosLatitude = Math.cos(latitude);
  const normal = [
    cosLatitude * Math.cos(longitude),
    cosLatitude * Math.sin(longitude),
    Math.sin(latitude),
  ];
  const raw = normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2];
  const cosine = round(Math.max(-1, Math.min(1, raw)));
  const phase = cosine > 0.08 ? 'DAY' : cosine < -0.08 ? 'NIGHT' : 'TERMINATOR';
  return Object.freeze({ cosine, phase });
}

export function cityLightPresentation({ mode = 'EARTH' } = {}) {
  return Object.freeze({
    show: mode === 'EARTH',
    dayAlpha: 0,
    nightAlpha: 0.26,
    brightness: 0.82,
    contrast: 1.05,
    saturation: 0.58,
  });
}

export function cloudShadowPresentation({
  mode = 'EARTH',
  cloudFidelity = 'OFF',
  cloudMeta = null,
} = {}) {
  const valid = mode === 'EARTH'
    && cloudFidelity !== 'OFF'
    && cloudMeta?.source === 'NOAA_NESDIS_GMGSI'
    && cloudMeta?.truthClass === 'OBSERVED_2D_INPUT_ONLY'
    && typeof cloudMeta?.time === 'string'
    && Number.isFinite(Date.parse(cloudMeta.time));
  return Object.freeze(valid ? {
    status: 'VALID_OBSERVED_ONLY',
    enabled: true,
    source: cloudMeta.source,
    validAt: cloudMeta.time,
  } : {
    status: 'UNAVAILABLE_NO_VALID_OBSERVATION',
    enabled: false,
    source: null,
    validAt: null,
  });
}

function vectorArray(vector) {
  return vector ? [vector.x, vector.y, vector.z].map(value => round(Number(value), 9)) : null;
}

function sunDirectionFixed(C, time) {
  const inertial = C.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
    time,
    new C.Cartesian3(),
  );
  let matrix = C.Transforms.computeIcrfToFixedMatrix(time, new C.Matrix3());
  if (!C.defined(matrix))
    matrix = C.Transforms.computeTemeToPseudoFixedMatrix(time, new C.Matrix3());
  const fixed = C.Matrix3.multiplyByVector(matrix, inertial, new C.Cartesian3());
  C.Cartesian3.normalize(fixed, fixed);
  return fixed;
}

export class PhysicalAtmosphereLightRuntime {
  constructor({
    viewer,
    Cesium,
    cityLightsLayer = null,
    cloudShadowState = () => ({}),
  } = {}) {
    if (!viewer || viewer.isDestroyed?.()) throw new Error('ATMOSPHERE_LIGHT_VIEWER_REQUIRED');
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.C = Cesium || globalThis.Cesium;
    this.cityLightsLayer = cityLightsLayer;
    this.cloudShadowState = cloudShadowState;
    this.mode = 'EARTH';
    this.ready = false;
    this.captureTimeIso = null;
    const sky = this.scene.skyAtmosphere;
    const globe = this.scene.globe;
    this.original = Object.freeze({
      light: this.scene.light,
      clockShouldAnimate: this.viewer.clock.shouldAnimate,
      skyShow: sky.show,
      skyRayleighCoefficient: this.C.Cartesian3.clone(sky.atmosphereRayleighCoefficient),
      skyRayleighScaleHeight: sky.atmosphereRayleighScaleHeight,
      skyMieCoefficient: this.C.Cartesian3.clone(sky.atmosphereMieCoefficient),
      skyMieScaleHeight: sky.atmosphereMieScaleHeight,
      skyMieAnisotropy: sky.atmosphereMieAnisotropy,
      skyPerFragment: sky.perFragmentAtmosphere,
      skyHueShift: sky.hueShift,
      skySaturationShift: sky.saturationShift,
      skyBrightnessShift: sky.brightnessShift,
      globeEnableLighting: globe.enableLighting,
      globeGroundAtmosphere: globe.showGroundAtmosphere,
      globeDynamicAtmosphereLighting: globe.dynamicAtmosphereLighting,
      globeDynamicAtmosphereLightingFromSun: globe.dynamicAtmosphereLightingFromSun,
      globeHueShift: globe.atmosphereHueShift,
      globeSaturationShift: globe.atmosphereSaturationShift,
      globeBrightnessShift: globe.atmosphereBrightnessShift,
      lightingFadeOutDistance: globe.lightingFadeOutDistance,
      lightingFadeInDistance: globe.lightingFadeInDistance,
      sunShow: this.scene.sun.show,
      moonShow: this.scene.moon.show,
      highDynamicRange: this.scene.highDynamicRange,
    });
  }

  install({ timeIso = new Date().toISOString() } = {}) {
    const profile = PHYSICAL_ATMOSPHERE_PROFILE;
    const sky = this.scene.skyAtmosphere;
    const globe = this.scene.globe;
    sky.atmosphereRayleighCoefficient = new this.C.Cartesian3(...profile.rayleighCoefficient);
    sky.atmosphereRayleighScaleHeight = profile.rayleighScaleHeightM;
    sky.atmosphereMieCoefficient = new this.C.Cartesian3(...profile.mieCoefficient);
    sky.atmosphereMieScaleHeight = profile.mieScaleHeightM;
    sky.atmosphereMieAnisotropy = profile.mieAnisotropy;
    sky.perFragmentAtmosphere = profile.perFragmentAtmosphere;
    sky.hueShift = profile.skyHueShift;
    sky.saturationShift = profile.skySaturationShift;
    sky.brightnessShift = profile.skyBrightnessShift;
    globe.atmosphereHueShift = profile.groundHueShift;
    globe.atmosphereSaturationShift = profile.groundSaturationShift;
    globe.atmosphereBrightnessShift = profile.groundBrightnessShift;
    globe.lightingFadeOutDistance = profile.lightingFadeOutDistanceM;
    globe.lightingFadeInDistance = profile.lightingFadeInDistanceM;
    globe.dynamicAtmosphereLighting = true;
    if ('dynamicAtmosphereLightingFromSun' in globe)
      globe.dynamicAtmosphereLightingFromSun = true;
    if (this.C.SunLight)
      this.scene.light = new this.C.SunLight({ intensity: profile.sunIntensity });
    /* HDR 톤매핑이 어두운 데이터 지도 값을 ~2.2배 들어올려 전면 워시를
     * 만들었다 (2026-08-31 픽셀 실측: bake 21,44,74 → HDR on 57,102,131 →
     * HDR off 20,45,69). 데이터 원판 색을 보존하기 위해 끈다. */
    if ('highDynamicRange' in this.scene) this.scene.highDynamicRange = false;
    this.scene.moon.show = false;
    this.viewer.clock.shouldAnimate = false;
    this.setTime(timeIso);
    this.ready = true;
    this.setMode('EARTH');
    return this.snapshot();
  }

  setTime(timeIso) {
    if (typeof timeIso !== 'string' || !Number.isFinite(Date.parse(timeIso)))
      throw new Error('ATMOSPHERE_LIGHT_TIME_ISO_REQUIRED');
    const time = this.C.JulianDate.fromIso8601(timeIso);
    this.viewer.clock.currentTime = time;
    this.captureTimeIso = this.C.JulianDate.toIso8601(time, 3);
    this.scene.requestRender();
    return this.snapshot();
  }

  setMode(mode) {
    this.mode = mode;
    const surface = mode === 'EARTH';
    this.scene.globe.enableLighting = surface;
    /* DATA 스타일에서 지상 대기 헤이즈가 데이터 지도의 색을 씻는다
     * (2026-08-31 mapped.earth 대조). REAL 스타일은 사실감을 위해 유지.
     * 안개는 두 스타일 모두 원거리 워시라 끈다. */
    this.scene.globe.showGroundAtmosphere =
      surface && globalThis.__earthusV2PresentationStyle !== 'DATA';
    this.scene.fog.enabled = false;
    this.scene.skyAtmosphere.show = surface;
    this.scene.sun.show = surface;
    this.applyCityLights();
    this.scene.requestRender();
    return surface;
  }

  applyCityLights() {
    if (!this.cityLightsLayer) return null;
    const presentation = cityLightPresentation({ mode: this.mode });
    Object.assign(this.cityLightsLayer, presentation);
    return presentation;
  }

  snapshot() {
    const time = this.viewer.clock.currentTime;
    const sun = sunDirectionFixed(this.C, time);
    const sunArray = vectorArray(sun);
    const sky = this.scene.skyAtmosphere;
    const globe = this.scene.globe;
    const cloudState = this.cloudShadowState?.() || {};
    return Object.freeze({
      ready: this.ready,
      truthClass: PHYSICAL_ATMOSPHERE_PROFILE.truthClass,
      timeSource: 'CAPTURED_UTC_CESIUM_CLOCK_FROZEN',
      timeIso: this.captureTimeIso || this.C.JulianDate.toIso8601(time, 3),
      shouldAnimate: this.viewer.clock.shouldAnimate,
      sunDirectionFixed: sunArray,
      sunDirectionMagnitude: round(Math.hypot(...sunArray), 6),
      anchor: Object.freeze({
        longitudeDeg: 112,
        latitudeDeg: 18,
        ...solarIncidenceAt({ longitudeDeg: 112, latitudeDeg: 18, sunDirection: sunArray }),
      }),
      mode: this.mode,
      atmosphere: Object.freeze({
        show: sky.show,
        rayleighCoefficient: vectorArray(sky.atmosphereRayleighCoefficient),
        rayleighScaleHeightM: sky.atmosphereRayleighScaleHeight,
        mieCoefficient: vectorArray(sky.atmosphereMieCoefficient),
        mieScaleHeightM: sky.atmosphereMieScaleHeight,
        mieAnisotropy: sky.atmosphereMieAnisotropy,
        perFragmentAtmosphere: sky.perFragmentAtmosphere,
        dynamicLighting: globe.dynamicAtmosphereLighting,
        dynamicLightingFromSun: globe.dynamicAtmosphereLightingFromSun,
      }),
      terrainLighting: Object.freeze({
        enabled: globe.enableLighting,
        lightingFadeOutDistanceM: globe.lightingFadeOutDistance,
        lightingFadeInDistanceM: globe.lightingFadeInDistance,
        lightClass: this.scene.light?.constructor?.name || null,
        isSunLight: Boolean(this.C.SunLight && this.scene.light instanceof this.C.SunLight),
        intensity: this.scene.light?.intensity ?? null,
      }),
      oceanLightingModel: 'CESIUM_FIXED_SUN_DIRECTION_SPECULAR',
      cityLights: Object.freeze({
        sourceId: this.cityLightsLayer?.__earthusV2Source || null,
        truthClass: 'STATIC_NASA_VIIRS_2012_NIGHT_CONTEXT',
        ...(this.cityLightsLayer ? cityLightPresentation({ mode: this.mode }) : {
          show: false, dayAlpha: null, nightAlpha: null,
          brightness: null, contrast: null, saturation: null,
        }),
      }),
      cloudShadow: cloudShadowPresentation({
        mode: this.mode,
        cloudFidelity: cloudState.cloudFidelity,
        cloudMeta: cloudState.cloudMeta,
      }),
    });
  }

  dispose() {
    const sky = this.scene.skyAtmosphere;
    const globe = this.scene.globe;
    const original = this.original;
    this.scene.light = original.light;
    this.viewer.clock.shouldAnimate = original.clockShouldAnimate;
    sky.show = original.skyShow;
    sky.atmosphereRayleighCoefficient = this.C.Cartesian3.clone(original.skyRayleighCoefficient);
    sky.atmosphereRayleighScaleHeight = original.skyRayleighScaleHeight;
    sky.atmosphereMieCoefficient = this.C.Cartesian3.clone(original.skyMieCoefficient);
    sky.atmosphereMieScaleHeight = original.skyMieScaleHeight;
    sky.atmosphereMieAnisotropy = original.skyMieAnisotropy;
    sky.perFragmentAtmosphere = original.skyPerFragment;
    sky.hueShift = original.skyHueShift;
    sky.saturationShift = original.skySaturationShift;
    sky.brightnessShift = original.skyBrightnessShift;
    globe.enableLighting = original.globeEnableLighting;
    globe.showGroundAtmosphere = original.globeGroundAtmosphere;
    globe.dynamicAtmosphereLighting = original.globeDynamicAtmosphereLighting;
    if ('dynamicAtmosphereLightingFromSun' in globe)
      globe.dynamicAtmosphereLightingFromSun = original.globeDynamicAtmosphereLightingFromSun;
    globe.atmosphereHueShift = original.globeHueShift;
    globe.atmosphereSaturationShift = original.globeSaturationShift;
    globe.atmosphereBrightnessShift = original.globeBrightnessShift;
    globe.lightingFadeOutDistance = original.lightingFadeOutDistance;
    globe.lightingFadeInDistance = original.lightingFadeInDistance;
    this.scene.sun.show = original.sunShow;
    this.scene.moon.show = original.moonShow;
    if ('highDynamicRange' in this.scene) this.scene.highDynamicRange = original.highDynamicRange;
    this.ready = false;
    this.scene.requestRender();
  }
}

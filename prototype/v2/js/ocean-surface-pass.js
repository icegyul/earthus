/* EARTHUS V2 — independent 0m ocean surface foundation.
 *
 * The primitive is separate from Globe/Terrain3D and uses a public-domain
 * ocean mask. It never changes bathymetry, terrain height or scientific state.
 * The scientific surface stays 0m. A bounded Global/Continent-only render
 * epsilon avoids z-fighting and is hidden before regional/local inspection.
 */

const MASK_SHA256 = '05fefcbf59e5018ae580db9f0dbc874153d10025a6ea05b35a2251af4f1f56f1';
const NORMAL_SHA256 = 'b9f9500dc8092a6f007b251db3827c7f4e7741ff5098d060c8abf45f4e0cd4aa';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 1_000_000) / 1_000_000;

export function validateOceanSurfaceManifest(manifest) {
  if (manifest?.schemaVersion !== 'earthus.physical-earth-assets.v1')
    throw new Error('OCEAN_SURFACE_MANIFEST_SCHEMA');
  if (manifest.oceanMask?.source !== 'Natural Earth admin 0 countries')
    throw new Error('OCEAN_SURFACE_MASK_SOURCE');
  if (manifest.oceanMask?.license !== 'Public domain')
    throw new Error('OCEAN_SURFACE_MASK_LICENSE');
  if (manifest.oceanMask?.sha256 !== MASK_SHA256)
    throw new Error('OCEAN_SURFACE_MASK_HASH');
  if (manifest.waterNormal?.source !== 'CesiumJS 1.143 waterNormalsSmall.jpg')
    throw new Error('OCEAN_SURFACE_NORMAL_SOURCE');
  if (manifest.waterNormal?.license !== 'Apache-2.0')
    throw new Error('OCEAN_SURFACE_NORMAL_LICENSE');
  if (manifest.waterNormal?.sha256 !== NORMAL_SHA256)
    throw new Error('OCEAN_SURFACE_NORMAL_HASH');
  return manifest;
}

export function fresnelResponse(viewCosine) {
  const cosine = clamp(Number(viewCosine));
  const fresnel = Math.pow(1 - cosine, 3);
  return Object.freeze({
    fresnel: round(fresnel),
    alpha: round(0.1 + fresnel * 0.25),
    specular: round(0.08 + fresnel * 0.42),
  });
}

export function oceanSurfaceVisible({
  mode = 'EARTH',
  cameraHeightM = Infinity,
  minimumVisibleHeightM = 2_500_000,
} = {}) {
  return mode === 'EARTH' && cameraHeightM >= minimumVisibleHeightM;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function verifiedAsset(url, expectedHash) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`OCEAN_SURFACE_ASSET_HTTP_${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (hash !== expectedHash) throw new Error(`OCEAN_SURFACE_ASSET_HASH:${hash}`);
  const blobUrl = URL.createObjectURL(new Blob([bytes], {
    type: response.headers.get('content-type') || 'application/octet-stream',
  }));
  return Object.freeze({ blobUrl, hash, byteLength: bytes.byteLength });
}

function oceanMaterial(C, { maskUrl, normalUrl }) {
  return new C.Material({
    fabric: {
      type: 'EarthusOceanSurface',
      uniforms: {
        oceanMask: maskUrl,
        normalMap: normalUrl,
        deepColor: C.Color.fromBytes(2, 22, 37, 255),
        rimColor: C.Color.fromBytes(55, 130, 165, 255),
      },
      source: `
        uniform sampler2D oceanMask;
        uniform sampler2D normalMap;
        uniform vec4 deepColor;
        uniform vec4 rimColor;

        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          float mask = texture(oceanMask, materialInput.st).r;
          vec3 sampledNormal = texture(normalMap, materialInput.st).rgb * 2.0 - 1.0;
          vec3 tangentNormal = normalize(vec3(sampledNormal.xy * 0.003, 1.0));
          vec3 normalEC = normalize(materialInput.tangentToEyeMatrix * tangentNormal);
          vec3 viewEC = normalize(materialInput.positionToEyeEC);
          float facing = abs(dot(normalEC, viewEC));
          float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 3.0);
          material.diffuse = mix(deepColor.rgb, rimColor.rgb, fresnel);
          material.normal = tangentNormal;
          material.specular = mix(0.08, 0.50, fresnel);
          material.shininess = 8.0;
          material.alpha = mask * mix(0.10, 0.35, fresnel);
          return material;
        }
      `,
    },
    translucent: true,
  });
}

export class OceanSurfacePass {
  constructor({
    viewer,
    Cesium,
    assetBase = '/v2/assets/physical-earth',
    presentationOffsetM = 50,
    minimumVisibleHeightM = 2_500_000,
  } = {}) {
    if (!viewer || viewer.isDestroyed?.()) throw new Error('OCEAN_SURFACE_VIEWER_REQUIRED');
    this.viewer = viewer;
    this.C = Cesium || globalThis.Cesium;
    this.assetBase = assetBase.replace(/\/$/, '');
    this.presentationOffsetM = presentationOffsetM;
    this.minimumVisibleHeightM = minimumVisibleHeightM;
    this.mode = 'EARTH';
    this.primitive = null;
    this.material = null;
    this.manifest = null;
    this.assets = null;
    this.generation = 0;
    this.error = null;
    this.loadDurationMs = null;
    this.removeCameraChanged = null;
  }

  async load({ force = false } = {}) {
    if (this.primitive && this.manifest && !force) return this.snapshot();
    const generation = ++this.generation;
    const startedAt = performance.now();
    const response = await fetch(`${this.assetBase}/manifest.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`OCEAN_SURFACE_MANIFEST_HTTP_${response.status}`);
    const manifest = validateOceanSurfaceManifest(await response.json());
    const [mask, normal] = await Promise.all([
      verifiedAsset(`${this.assetBase}/${manifest.oceanMask.path}`, manifest.oceanMask.sha256),
      verifiedAsset(`${this.assetBase}/${manifest.waterNormal.path}`, manifest.waterNormal.sha256),
    ]);
    if (generation !== this.generation) {
      URL.revokeObjectURL(mask.blobUrl);
      URL.revokeObjectURL(normal.blobUrl);
      return null;
    }
    this.dispose({ preserveGeneration: true });
    this.manifest = manifest;
    this.assets = Object.freeze({ mask, normal });
    this.material = oceanMaterial(this.C, { maskUrl: mask.blobUrl, normalUrl: normal.blobUrl });
    const rectangle = this.C.Rectangle.fromDegrees(-180, -89.999, 180, 89.999);
    this.primitive = this.viewer.scene.primitives.add(new this.C.Primitive({
      geometryInstances: new this.C.GeometryInstance({
        geometry: new this.C.RectangleGeometry({
          rectangle,
          height: this.presentationOffsetM,
          granularity: this.C.Math.toRadians(1),
          vertexFormat: this.C.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new this.C.EllipsoidSurfaceAppearance({
        aboveGround: true,
        faceForward: true,
        translucent: true,
        material: this.material,
        renderState: {
          depthTest: { enabled: true },
          depthMask: false,
          cull: { enabled: true, face: this.C.CullFace.BACK },
        },
      }),
      asynchronous: false,
      allowPicking: false,
      show: false,
    }));
    this.primitive.__earthusV2OceanSurface = true;
    this.loadDurationMs = Math.round(performance.now() - startedAt);
    this.error = null;
    if (!this.removeCameraChanged) {
      this.removeCameraChanged = this.viewer.camera.changed.addEventListener(() => this.updateVisibility());
    }
    this.updateVisibility();
    this.viewer.scene.requestRender();
    return this.snapshot();
  }

  async show() {
    try {
      this.mode = 'EARTH';
      if (!this.primitive) await this.load();
      this.updateVisibility();
      this.viewer.scene.requestRender();
      return this.snapshot();
    } catch (error) {
      this.error = String(error?.message || error);
      throw error;
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.updateVisibility();
    this.viewer.scene.requestRender();
    return this.primitive?.show === true;
  }

  updateVisibility() {
    if (!this.primitive) return false;
    const cameraHeightM = this.viewer.camera.positionCartographic?.height ?? Infinity;
    this.primitive.show = oceanSurfaceVisible({
      mode: this.mode,
      cameraHeightM,
      minimumVisibleHeightM: this.minimumVisibleHeightM,
    });
    this.viewer.scene.requestRender();
    return this.primitive.show;
  }

  snapshot() {
    return Object.freeze({
      ready: Boolean(this.primitive && this.manifest && this.assets),
      truthClass: 'PHYSICAL_0M_OCEAN_SURFACE',
      maskSource: this.manifest?.oceanMask?.source || null,
      maskLicense: this.manifest?.oceanMask?.license || null,
      maskSha256: this.assets?.mask?.hash || null,
      maskBytes: this.assets?.mask?.byteLength || null,
      normalSource: this.manifest?.waterNormal?.source || null,
      normalLicense: this.manifest?.waterNormal?.license || null,
      normalSha256: this.assets?.normal?.hash || null,
      normalBytes: this.assets?.normal?.byteLength || null,
      materialType: this.material?.type || null,
      surfaceTruthHeightM: 0,
      presentationOffsetM: this.presentationOffsetM,
      depthPolicy: 'DEPTH_TESTED_GLOBAL_PRESENTATION_EPSILON',
      minimumVisibleHeightM: this.minimumVisibleHeightM,
      animation: false,
      synthetic: false,
      mode: this.mode,
      visible: this.primitive?.show === true,
      primitiveAttached: Boolean(this.primitive && this.viewer.scene.primitives.contains(this.primitive)),
      loadDurationMs: this.loadDurationMs,
      error: this.error,
    });
  }

  dispose({ preserveGeneration = false } = {}) {
    if (!preserveGeneration) this.generation += 1;
    try { this.removeCameraChanged?.(); } catch (_) {}
    this.removeCameraChanged = null;
    if (this.primitive) {
      try { this.viewer.scene.primitives.remove(this.primitive); } catch (_) {}
    }
    this.primitive = null;
    this.material = null;
    if (this.assets) {
      URL.revokeObjectURL(this.assets.mask.blobUrl);
      URL.revokeObjectURL(this.assets.normal.blobUrl);
    }
    this.assets = null;
    this.manifest = null;
    this.loadDurationMs = null;
    this.viewer.scene.requestRender();
  }
}

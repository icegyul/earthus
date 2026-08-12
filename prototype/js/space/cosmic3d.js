// 지구 → 태양계 → 은하수 → 은하들을 실제 WebGL 3D 공간으로 잇는다.
//
// 받은 지적: "3D로 이렇게 움직이며 보여주길 원해".
// 이전 cosmiczoom.js는 2D canvas에 원근을 흉내 낸 그림이었다. 이 모듈은 별을
// 실제 XYZ 좌표의 점 구름으로 만들고 카메라가 그 공간을 공전한다. 은하를 손으로
// 기울이면 정면의 나선팔과 측면의 얇은 원반·중앙 팽대부가 연속으로 보인다.
//
// ⚠️ Three.js는 우주에 들어갈 때만 동적 로드한다. 지구 화면의 첫 로드에 365KB를
//    얹지 않는다. r184 MIT 원본은 prototype/vendor에 고정해 CDN 장애도 피한다.
// ⚠️ 무한 애니메이션 금지. 입력·단계 이동 뒤 짧은 보간 동안만 rAF를 사용하고,
//    정지하면 renderer.render()도 멈춘다.
// ⚠️ 우리 은하의 외부 모습과 은하군 배치는 관측 사진이 아니라 교육용 도식이다.

import { scene, cameraHeight } from '../viewer.js';
import { store } from '../store.js';
import { sceneMgr } from '../scene.js';
import { i18n } from '../i18n.js';
import { myLocation } from '../mylocation.js';
import { planetOrbit, planetPositions } from './kepler.js';
import {
  calculateMarsObservation,
  DEFAULT_ASTRONOMY_OBSERVER,
} from './astronomy.js?v=20260812-planner1';
import {
  assessObservationPlan,
  createMarsGeometryPlan,
  createOfflinePlanManifest,
  GEOMETRY_24H_PLAN,
} from './observation-planner.js?v=20260812-planner1';
import {
  cacheLoadedSessionShell,
  observeObservationSessionUpdates,
  openLocalObservationSessionService,
} from './observation-session.js?v=20260812-session1';
import { assertAetherusCatalog } from './contracts.js?v=20260812-photoownership1';
import {
  aetherusPhotoCounts,
  filterAetherusPhotos,
  loadAetherusPhotoCatalog,
  normalizeAetherusTelescope,
  resolveAetherusPhoto,
} from './photo-catalog.js?v=20260812-photoownership1';

const IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const BODY_ORDER = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const SOLAR_LABEL_ORDER = ['sun', ...IDS];
const SURFACE_IDS = ['sun', ...IDS, 'moon'];
const ULTRA_SURFACE_IDS = new Set(['mercury', 'venus', 'mars']);
const PLANET_TEXTURE_ROOT = '/space/planets';
const PLANET_TEXTURE_VERSION = '20260810d';
const planetTextureUrl = path => `${PLANET_TEXTURE_ROOT}/${path}?v=${PLANET_TEXTURE_VERSION}`;
const PLANETS = {
  sun: { ko: '태양', en: 'Sun', color: 0xffc45a, radius: 1.65 },
  mercury: { ko: '수성', en: 'Mercury', color: 0xaaa7a0, radius: .38 },
  venus: { ko: '금성', en: 'Venus', color: 0xd7b575, radius: .52 },
  earth: { ko: '지구', en: 'Earth', color: 0x62b7da, radius: .56 },
  mars: { ko: '화성', en: 'Mars', color: 0xc86d50, radius: .44 },
  jupiter: { ko: '목성', en: 'Jupiter', color: 0xd0a27b, radius: 1.15 },
  saturn: { ko: '토성', en: 'Saturn', color: 0xd7c28a, radius: 1.02 },
  uranus: { ko: '천왕성', en: 'Uranus', color: 0x86d1d5, radius: .78 },
  neptune: { ko: '해왕성', en: 'Neptune', color: 0x557bd5, radius: .75 },
};
const TARGET = { moon: .16, solar: .76, milkyway: 1.76, galaxies: 2.78 };
const ENTER_HEIGHT = 220_000_000;
const SOLAR_MARKER = { x: 29, y: .7, z: 9 };
const DAY_MS = 86_400_000;
const LIGHT_HOURS_PER_AU = 499.004783836 / 3600;
const MOTION_SAMPLES = 145;
const MOTION_DURATION_MS = 6500;
const COSMIC_FPS = 30;
const COSMIC_FRAME_MS = 1000 / COSMIC_FPS;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = value => {
  const result = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return result - Math.floor(result);
};
const normal = seed => {
  const a = Math.max(.00001, hash(seed));
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(Math.PI * 2 * hash(seed + 17.31));
};
// 실제 AU를 그대로 쓰면 수성은 화면용 태양 안에 묻히고 해왕성은 너무 멀어진다.
// 공전 방향과 행성 순서는 보존하되 안쪽을 충분히 벌리고 바깥쪽을 로그로 압축한다.
const solarDisplayRadius = au => 3.5 + 7 * Math.log1p(Math.max(0, au) * 1.4);
const stageFor = level => level < 1.28 ? 'solar' : level < 2.28 ? 'milkyway' : 'galaxies';
const ko = () => i18n.lang !== 'en';
const astronomyNow = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
const signedDegrees = value => `${Number(value) >= 0 ? '+' : '−'}${Math.abs(Number(value)).toFixed(3)}°`;
const rightAscension = value => {
  const totalSeconds = Number(value) / 15 * 3600;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${seconds.toFixed(1).padStart(4, '0')}s`;
};
const plannerUtc = value => String(value).replace('T', ' ').replace('.000Z', 'Z');

export const cosmic3d = {
  root: null,
  canvas: null,
  labels: null,
  level: .04,
  target: .04,
  yaw: .72,
  pitch: .56,
  _stage: 'solar',
  _frame: 0,
  _last: 0,
  _internalStage: false,
  _pointers: new Map(),
  _pinchDistance: 0,
  _enginePromise: null,
  _activationPromise: Promise.resolve(null),
  _ready: false,
  _bodyCatalogPromise: null,
  _bodyCatalog: null,
  _detailBody: null,
  _detailTexture: null,
  _detailTextureLoadId: 0,
  _detailTextureStage: null,
  _ultraTextureLoading: null,
  _planetTexturePromise: null,
  _planetTextures: new Map(),
  _detailRing: null,
  _detailMarkers: new Map(),
  _pointerStart: null,
  _bodyDistance: 48,
  _astronomyObservation: null,
  _astronomyObserver: null,
  _astronomyAt: null,
  _astronomyPrecision: null,
  _astronomyError: null,
  _pendingAstronomyRoute: null,
  _observationPlan: null,
  _observationPlanStatus: null,
  _offlinePlanManifest: null,
  _plannerError: null,
  _observationSession: null,
  _observationSessionError: null,
  _observationSessionBusy: false,
  _observationSessionRecovery: null,
  _sessionShellStatus: null,
  _sessionServicePromise: null,
  _sessionUnsubscribe: null,
  _sessionLoadId: 0,
  _skyARModulePromise: null,
  _skyARRuntime: null,
  _skyARTracker: null,
  _skyARCalibration: null,
  _skyARState: 'NOT_STARTED',
  _skyARError: null,
  _skyARCamera: null,
  _skyARProjection: null,
  _skyARSnapshot: null,
  _skyAROpen: false,
  _photoCatalogPromise: null,
  _allPhotoItems: [],
  _photoItems: [],
  _photoMode: null,
  _photoMarkers: new Map(),
  _photoFov: 56,
  _selectedPhoto: null,
  _craftCatalogPromise: null,
  _craftCatalog: null,
  _craftMarkers: new Map(),
  _selectedCraft: null,
  _motionCatalogPromise: null,
  _motionCatalog: null,
  _solarMotionMode: false,
  _motionFrame: 0,
  _motionProgress: 0,
  _motionPaths: new Map(),
  _motionPlanetMeshes: new Map(),
  _motionDistance: 132,
  _galaxyGuideCatalogPromise: null,
  _galaxyGuideCatalog: null,
  _galaxyGuideMode: false,
  _galaxyGuideAnchors: new Map(),
  _renderCount: 0,

  init() {
    if (this.root) return this;
    this.root = document.getElementById('cosmicExperience');
    this.canvas = document.getElementById('cosmicCanvas');
    this.labels = document.getElementById('cosmicLabels');
    this.bodyPicker = document.getElementById('cosmicBodyPicker');
    this.bodyInfo = document.getElementById('cosmicBodyInfo');
    this.photoInfo = document.getElementById('cosmicPhotoInfo');
    this.craftPicker = document.getElementById('cosmicCraftPicker');
    this.craftInfo = document.getElementById('cosmicCraftInfo');
    this.motionOpen = document.getElementById('cosmicMotionOpen');
    this.motionInfo = document.getElementById('cosmicMotionInfo');
    this.galaxyGuideInfo = document.getElementById('cosmicGalaxyGuideInfo');
    if (!this.root || !this.canvas || !this.labels || !this.bodyPicker || !this.bodyInfo
      || !this.photoInfo || !this.craftPicker || !this.craftInfo || !this.motionOpen || !this.motionInfo
      || !this.galaxyGuideInfo) return this;
    this.root.closest('.space-scene')?.classList.add('cosmic-mode');
    document.getElementById('spaceSceneIntro')?.setAttribute('hidden', '');
    document.getElementById('solarExperience')?.setAttribute('hidden', '');
    this.buildBodyPicker();
    this.ensureObservationSessionUi();
    this.ensureSkyARProbeUi();
    this.bindInput();
    new ResizeObserver(() => this.render()).observe(this.root);
    store.on('scene', (next, stage) => {
      const visible = next === 'space';
      this.root.hidden = !visible;
      if (!visible) {
        this.closeSkyARProbe({ hide: true });
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = 0; this.cancelSolarMotionReplay();
        this.root.classList.remove('is-moving', 'is-loading');
        // 지구로 돌아가기 버튼 외의 장면 전환도 숨은 3D 상태를 남기지 않는다.
        if (this._solarMotionMode) this.closeSolarMotion(false);
        if (this._galaxyGuideMode) this.closeGalaxyGuide(false);
        if (this._photoMode) this.closePhotoAtlas(false);
        if (this._detailBody) this.closeBody(false);
        if (this._selectedCraft) this.closeCraft(false);
        this.emitRouteState();
        return;
      }
      this._activationPromise = this.activate(stage);
    });
    i18n.onChange(() => {
      this.buildBodyPicker();
      if (this._detailBody) this.showBodyInfo(this._detailBody);
      if (this._selectedPhoto) {
        this.renderPhotoFilters();
        this.buildPhotoList(this._photoItems);
        this.selectPhoto(this._selectedPhoto);
      }
      if (this._selectedCraft) this.showCraftInfo(this._selectedCraft);
      if (this._solarMotionMode) this.showSolarMotionInfo();
      if (this._galaxyGuideMode) this.showGalaxyGuideInfo();
      this.renderObservationSession();
      this.renderSkyARProbe();
      this.buildCraftPicker();
      this.updateHud(); this.updateLabels(); this.render();
    });
    this.root.hidden = store.scene !== 'space';
    this.updateHud();
    if (store.scene === 'space') this._activationPromise = this.activate(store.sceneStage);
    document.addEventListener('aetherus:galaxy-guide', () => this.openGalaxyGuide());
    return this;
  },

  routeState() {
    if (store.scene !== 'space') return null;
    const astronomy = this._detailBody?.id === 'mars' && this._astronomyObservation ? {
      observer: this._astronomyObservation.observer,
      at: this._astronomyObservation.time.utc,
      precision: this._astronomyObservation.precision.tier,
    } : {};
    const planner = this._detailBody?.id === 'mars' && this._observationPlan
      && this._observationPlanStatus === 'CURRENT' ? { plan: GEOMETRY_24H_PLAN } : {};
    return {
      stage: this._stage || store.sceneStage || 'solar',
      target: this._detailBody?.id || null,
      photo: this._selectedPhoto?.id || null,
      telescope: this._photoMode?.toLowerCase() || null,
      craft: this._selectedCraft?.id || null,
      ...astronomy,
      ...planner,
    };
  },

  emitRouteState() {
    document.dispatchEvent(new CustomEvent('aetherus:state', { detail: this.routeState() }));
  },

  async restoreRoute(route) {
    if (!route?.stage || store.scene !== 'space') return false;
    // 장면 진입의 마지막 animateTo가 상세 복원 뒤에 도착하면 상세 화면을 다시 닫는다.
    // 기본 장면 준비를 먼저 끝낸 뒤 target/photo/craft를 적용한다.
    await this._activationPromise;
    if (store.scene !== 'space') return false;
    if (route.issues?.length) console.warn('[aetherus-route]', route.issues.join(','));
    if (route.target) {
      this._pendingAstronomyRoute = route.target === 'mars' ? route : null;
      await this.selectBody(route.target);
      const restored = this._detailBody?.id === route.target;
      if (restored && route.target === 'mars' && route.plan === GEOMETRY_24H_PLAN) {
        this.buildObservationPlan({ emit: false });
        this.emitRouteState();
      }
      return restored;
    }
    if (route.craft) {
      await this.ensureEngine();
      await this.loadSpacecraftCatalog();
      this.selectCraft(route.craft);
      return this._selectedCraft?.id === route.craft;
    }
    if (route.photo || route.telescope) {
      const legacyTelescope = ['hst', 'jwst'].includes(route.photo) ? route.photo.toUpperCase() : null;
      const routeTelescope = legacyTelescope || normalizeAetherusTelescope(route.telescope, 'ALL');
      // 필터만 있는 딥링크도 사진관 자체 로더를 거쳐야 실패 UI와 재시도가 보인다.
      // 여기서 미리 fetch하면 503이 상위 라우터로 새어 URL만 지워지고 빈 3D 장면이 남는다.
      if (!route.photo || legacyTelescope) {
        const opened = await this.openPhotoAtlas(routeTelescope);
        return opened && this._photoMode === routeTelescope;
      }
      let items;
      try {
        items = await this.loadPhotoCatalog();
      } catch (error) {
        console.warn('[aetherus-route]', error.message);
        this.showPhotoError(routeTelescope);
        return false;
      }
      const photo = resolveAetherusPhoto(items, route.photo);
      if (route.photo && !legacyTelescope && !photo) {
        console.warn('[aetherus-route]', `UNKNOWN_PHOTO_${route.photo}`);
        return false;
      }
      let telescope = normalizeAetherusTelescope(route.telescope, photo?.telescope || 'ALL');
      if (photo && telescope !== 'ALL' && telescope !== photo.telescope) {
        console.warn('[aetherus-route]', `PHOTO_FILTER_CONFLICT_${route.telescope}_${photo.telescope}`);
        telescope = photo.telescope;
      }
      const opened = await this.openPhotoAtlas(telescope, photo?.id || null);
      return opened && this._selectedPhoto?.id === photo.id;
    }
    this.emitRouteState();
    return true;
  },

  async activate(stage) {
    this.root.classList.add('is-loading');
    const note = document.getElementById('cosmicNote');
    if (note) note.textContent = ko() ? '3D 우주 공간을 준비하는 중…' : 'Preparing the 3D space…';
    try {
      await this.ensureEngine();
      if (store.scene !== 'space') { this.root.classList.remove('is-loading'); return; }
      // 첫 장면은 색상 구로 즉시 열고, 작은 표면 지도는 뒤에서 한 번만 올린다.
      // 512×256 9장과 고리 한 장은 압축 전 GPU 메모리도 합계 약 4.6MB라 모바일에서 유지한다.
      this.loadPlanetTextures();
      await this.loadSpacecraftCatalog();
      if (store.scene !== 'space') { this.root.classList.remove('is-loading'); return; }
      await this.loadSolarMotionCatalog();
      if (store.scene !== 'space') { this.root.classList.remove('is-loading'); return; }
      this.root.classList.remove('is-loading');
      if (!this._internalStage) this.animateTo(TARGET[stage] ?? TARGET.solar);
      this.render();
    } catch (error) {
      console.error('[cosmic3d]', error);
      this.root.classList.remove('is-loading');
      this.root.classList.add('has-error');
      if (note) note.textContent = ko()
        ? '이 기기에서 3D 우주 화면을 열지 못했습니다. 지구 화면으로 돌아가 주세요.'
        : 'This device could not open the 3D space view. Return to Earth.';
    }
  },

  ensureEngine() {
    if (this._enginePromise) return this._enginePromise;
    this._enginePromise = import('../../vendor/three-r184.module.min.js').then(THREE => {
      this.THREE = THREE;
      this.buildScene();
      this._ready = true;
      return this;
    });
    return this._enginePromise;
  },

  buildScene() {
    const T = this.THREE;
    this.world = new T.Scene();
    this.world.background = new T.Color(0x02050a);
    this.camera = new T.PerspectiveCamera(47, 1, .03, 5000);
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      // 정지 화면 중심의 교육 장면이다. 외장·고성능 GPU를 강제해 열을 올리지 않는다.
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(1.55, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor(0x02050a, 1);

    // 표면 지도의 고유색을 보존한다. 푸른 환경광은 화성·목성을 회색으로 만들었다.
    this.ambientLight = new T.AmbientLight(0xffffff, .38);
    this.world.add(this.ambientLight);
    this.sunLight = new T.PointLight(0xffdc91, 34, 180, 1.5);
    this.world.add(this.sunLight);
    this.spriteTexture = this.makePointTexture();
    this.makeBackground();
    this.makeSolarSystem();
    this.makeMilkyWay();
    this.makeGalaxyGroup();
    this.makeSolarMotion();
    this.makeBodyDetail();
    this.makePhotoAtlas();
    this.resize();
  },

  makePointTexture() {
    const T = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.12, 'rgba(255,255,255,.95)');
    gradient.addColorStop(.42, 'rgba(180,210,255,.35)');
    gradient.addColorStop(1, 'rgba(80,120,220,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  },

  makeBackground() {
    const T = this.THREE;
    const count = matchMedia('(max-width:560px)').matches ? 850 : 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 900 + hash(index + 2) * 1000;
      const theta = hash(index + 5) * Math.PI * 2;
      const phi = Math.acos(2 * hash(index + 11) - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const blue = index % 17 === 0;
      colors[index * 3] = blue ? .62 : .86;
      colors[index * 3 + 1] = blue ? .76 : .89;
      colors[index * 3 + 2] = 1;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    const material = new T.PointsMaterial({
      size: 2.2, map: this.spriteTexture, transparent: true, opacity: .72,
      vertexColors: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.background = new T.Points(geometry, material);
    this.world.add(this.background);
  },

  makeSolarSystem() {
    const T = this.THREE;
    this.solarGroup = new T.Group();
    this.world.add(this.solarGroup);
    const positions = planetPositions(new Date());
    this.planetMeshes = {};
    this.orbitMaterials = [];
    const displayPoint = point => {
      const actualRadius = Math.hypot(point.x, point.y, point.z);
      const scale = solarDisplayRadius(actualRadius) / Math.max(actualRadius, .00001);
      return new T.Vector3(point.x * scale, point.z * scale, point.y * scale);
    };

    const sunMaterial = new T.MeshBasicMaterial({ color: 0xffca55 });
    this.sun = new T.Mesh(new T.SphereGeometry(1.65, 48, 32), sunMaterial);
    this.sun.userData.id = 'sun';
    this.solarGroup.add(this.sun);
    const glowMaterial = new T.SpriteMaterial({
      map: this.spriteTexture, color: 0xffb83d, transparent: true, opacity: .75,
      blending: T.AdditiveBlending, depthWrite: false,
    });
    this.sunGlow = new T.Sprite(glowMaterial); this.sunGlow.scale.set(12, 12, 1);
    this.solarGroup.add(this.sunGlow);

    IDS.forEach(id => {
      const meta = PLANETS[id];
      const point = positions[id];
      const material = new T.MeshStandardMaterial({
        color: meta.color, roughness: .84, metalness: 0,
        emissive: 0x242424, emissiveIntensity: id === 'uranus' ? .06 : .45,
      });
      const mesh = new T.Mesh(new T.SphereGeometry(meta.radius, 28, 18), material);
      mesh.position.copy(displayPoint(point));
      mesh.userData.id = id;
      this.solarGroup.add(mesh);
      this.planetMeshes[id] = mesh;

      if (id === 'saturn') {
        const ring = new T.Mesh(
          this.makeRadialRingGeometry(1.28, 2.02, 96),
          new T.MeshBasicMaterial({ color: 0xd9ca9c, transparent: true, opacity: .22, side: T.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = Math.PI / 2; mesh.add(ring); this.saturnMiniRing = ring;
      }
      const orbit = planetOrbit(id, new Date(), 150);
      const orbitGeometry = new T.BufferGeometry().setFromPoints(orbit.map(displayPoint));
      const orbitMaterial = new T.LineBasicMaterial({
        color: id === 'earth' ? 0x63b9d6 : 0x8290a8,
        transparent: true, opacity: id === 'earth' ? .38 : .16, depthWrite: false,
      });
      const line = new T.LineLoop(orbitGeometry, orbitMaterial);
      this.solarGroup.add(line); this.orbitMaterials.push(orbitMaterial);
    });
    this.earthMesh = this.planetMeshes.earth;
    this.spacecraftGroup = new T.Group();
    this.solarGroup.add(this.spacecraftGroup);
  },

  makeRadialRingGeometry(inner, outer, segments = 128) {
    const geometry = new this.THREE.RingGeometry(inner, outer, segments, 1);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    for (let index = 0; index < positions.count; index += 1) {
      const radius = Math.hypot(positions.getX(index), positions.getY(index));
      uvs.setXY(index, clamp((radius - inner) / (outer - inner), 0, 1), .5);
    }
    uvs.needsUpdate = true;
    return geometry;
  },

  loadSurfaceTexture(url, repeat = true) {
    const T = this.THREE;
    return new Promise((resolve, reject) => {
      new T.TextureLoader().load(url, texture => {
        texture.colorSpace = T.SRGBColorSpace;
        texture.wrapS = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
        texture.wrapT = T.ClampToEdgeWrapping;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      }, undefined, reject);
    });
  },

  canUseUltraSurface(id) {
    if (!ULTRA_SURFACE_IDS.has(id) || window.innerWidth < 900) return false;
    const memoryGb = Number(navigator.deviceMemory || 8);
    return memoryGb >= 8 && this.renderer.capabilities.maxTextureSize >= 8192;
  },

  maybeLoadUltraSurface() {
    const body = this._detailBody;
    if (!body || this._bodyDistance > 38 || this._detailTextureStage !== 'detail'
      || this._ultraTextureLoading || !this.canUseUltraSurface(body.id)) return;
    const loadId = this._detailTextureLoadId;
    this._ultraTextureLoading = body.id;
    this.loadSurfaceTexture(planetTextureUrl(`ultra/${body.id}.webp`)).then(texture => {
      if (loadId !== this._detailTextureLoadId || this._detailBody?.id !== body.id) {
        texture.dispose(); return;
      }
      this._detailTexture?.dispose();
      this._detailTexture = texture;
      this.bodySphere.material.map = texture;
      this.bodySphere.material.emissiveMap = texture;
      this.bodySphere.material.needsUpdate = true;
      this._detailTextureStage = 'ultra';
      if (location.hash === '#dev') {
        this.canvas.dataset.surfaceQuality = 'ultra';
        this.canvas.dataset.surfacePixels = `${texture.image.width}x${texture.image.height}`;
      }
      this.render();
    }).catch(error => {
      console.warn(`[cosmic-texture-ultra:${body.id}]`, error?.message || 'load failed');
    }).finally(() => {
      if (this._ultraTextureLoading === body.id) this._ultraTextureLoading = null;
    });
  },

  loadPlanetTextures() {
    if (this._planetTexturePromise) return this._planetTexturePromise;
    const jobs = SURFACE_IDS.map(async id => {
      const texture = await this.loadSurfaceTexture(planetTextureUrl(`small/${id}.webp`));
      this._planetTextures.set(id, texture);
      const material = id === 'sun' ? this.sun?.material : this.planetMeshes[id]?.material;
      if (!material) return;
      material.map = texture;
      if ('emissiveMap' in material) material.emissiveMap = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    });
    jobs.push(this.loadSurfaceTexture(planetTextureUrl('saturn-ring.webp'), false).then(texture => {
      this._planetTextures.set('saturn-ring', texture);
      if (!this.saturnMiniRing) return;
      this.saturnMiniRing.material.map = texture;
      this.saturnMiniRing.material.color.set(0xffffff);
      this.saturnMiniRing.material.opacity = .86;
      this.saturnMiniRing.material.needsUpdate = true;
    }));
    this._planetTexturePromise = Promise.allSettled(jobs).then(results => {
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length) console.warn(`[cosmic-texture] ${failed.length} preview texture(s) unavailable`);
      this.render();
      return results;
    });
    return this._planetTexturePromise;
  },

  loadSpacecraftCatalog() {
    if (this._craftCatalogPromise) return this._craftCatalogPromise;
    this._craftCatalogPromise = fetch('/data/cosmic-spacecraft.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`COSMIC_SPACECRAFT_${response.status}`);
        return response.json();
      })
      .then(raw => {
        const document = assertAetherusCatalog('cosmic-spacecraft', raw);
        this._craftCatalog = document;
        this.buildSpacecraft(); this.buildCraftPicker(); this.render();
        return document;
      })
      .catch(error => {
        // 탐사선 자료가 실패해도 태양계·행성 3D 자체는 닫지 않는다.
        console.warn('[cosmic-spacecraft]', error.message);
        return null;
      });
    return this._craftCatalogPromise;
  },

  clearSpacecraft() {
    if (!this.spacecraftGroup) return;
    while (this.spacecraftGroup.children.length) {
      const object = this.spacecraftGroup.children[this.spacecraftGroup.children.length - 1];
      this.spacecraftGroup.remove(object);
      object.traverse?.(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
        else child.material?.dispose?.();
      });
    }
    this._craftMarkers.clear();
  },

  makeSpacecraftModel(craft, color, radius) {
    const T = this.THREE;
    const metal = value => new T.MeshStandardMaterial({
      color: value, roughness: .38, metalness: .62,
      emissive: new T.Color(value).multiplyScalar(.16), emissiveIntensity: .35,
    });
    const flat = value => new T.MeshBasicMaterial({ color: value, side: T.DoubleSide });
    let root;
    if (craft.id === 'hubble') {
      root = new T.Mesh(new T.CylinderGeometry(.2, .25, .9, 12), metal(0xbec7cf));
      const panelMaterial = metal(0x254c84);
      [-1, 1].forEach(side => {
        const panel = new T.Mesh(new T.BoxGeometry(.72, .035, .34), panelMaterial.clone());
        panel.position.x = side * .62; root.add(panel);
      });
      const aperture = new T.Mesh(new T.CylinderGeometry(.15, .2, .12, 12), metal(0x24303b));
      aperture.position.y = .5; root.add(aperture);
    } else if (craft.id === 'jwst') {
      root = new T.Mesh(new T.CylinderGeometry(.5, .5, .08, 6), metal(0xd8a62d));
      const shield = new T.Mesh(new T.CircleGeometry(1.05, 4), flat(0xc7c9d5));
      shield.rotation.x = -Math.PI / 2; shield.position.y = -.22; shield.scale.set(1.18, .64, 1);
      root.add(shield);
      const mast = new T.Mesh(new T.CylinderGeometry(.035, .035, .34, 6), metal(0xb08a3a));
      mast.position.y = -.16; root.add(mast);
    } else if (craft.id.startsWith('voyager')) {
      root = new T.Mesh(new T.BoxGeometry(.38, .3, .38), metal(0xb79a62));
      const dish = new T.Mesh(new T.ConeGeometry(.65, .2, 28, 1, true), metal(0xd5d7d2));
      dish.position.y = .42; root.add(dish);
      const boom = new T.Mesh(new T.CylinderGeometry(.025, .025, 1.45, 6), metal(0x8e969b));
      boom.position.y = -.82; boom.rotation.z = .18; root.add(boom);
    } else {
      root = new T.Mesh(new T.OctahedronGeometry(.58, 1), metal(color));
    }
    root.scale.setScalar(radius / .58);
    return root;
  },

  buildSpacecraft() {
    if (!this._craftCatalog || !this.spacecraftGroup || !this.earthMesh) return;
    this.clearSpacecraft();
    const T = this.THREE;
    const earth = this.earthMesh.position.clone();
    const outward = earth.clone().setY(0).normalize();
    const tangent = new T.Vector3(-outward.z, 0, outward.x);
    const addPath = (points, color, opacity, dashed = false) => {
      const material = dashed
        ? new T.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .55, gapSize: .42, depthWrite: false })
        : new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const line = new T.Line(new T.BufferGeometry().setFromPoints(points), material);
      if (dashed) line.computeLineDistances();
      this.spacecraftGroup.add(line);
    };
    const addMarker = (craft, position, color, extra = {}) => {
      const marker = this.makeSpacecraftModel(craft, color, extra.radius || .58);
      marker.position.copy(position); marker.userData.craftId = craft.id;
      this.spacecraftGroup.add(marker);
      this._craftMarkers.set(craft.id, { object: marker, craft, ...extra });
    };

    this._craftCatalog.items.forEach(craft => {
      if (craft.type === 'earth-orbit-schematic') {
        const points = [];
        for (let index = 0; index <= 64; index += 1) {
          const angle = index / 64 * Math.PI * 2;
          points.push(earth.clone().addScaledVector(tangent, Math.cos(angle) * 1.35)
            .add(new T.Vector3(0, Math.sin(angle) * .65, 0)));
        }
        addPath(points, 0x8bd8ec, .42);
        addMarker(craft, points[9], 0x8bd8ec, { radius: .3 });
      } else if (craft.type === 'earth-l2-schematic') {
        const center = earth.clone().addScaledVector(outward, 2.3);
        addPath([earth, center], 0xbdaeff, .34, true);
        const points = [];
        for (let index = 0; index <= 64; index += 1) {
          const angle = index / 64 * Math.PI * 2;
          points.push(center.clone().addScaledVector(tangent, Math.cos(angle) * .72)
            .add(new T.Vector3(0, Math.sin(angle) * .92, 0)));
        }
        addPath(points, 0xbdaeff, .42);
        addMarker(craft, points[12], 0xbdaeff, { radius: .34 });
      } else if (craft.type === 'heliocentric-vector') {
        const epoch = Date.parse(craft.epoch);
        const elapsedDays = (Date.now() - epoch) / DAY_MS;
        const withinRange = Math.abs(elapsedDays) <= 365.25 * 5;
        const values = craft.pos.map((value, index) => value + craft.vel[index] * (withinRange ? elapsedDays : 0));
        const actual = new T.Vector3(values[0], values[2], values[1]);
        const distanceAu = actual.length();
        // 보이저를 실제 140~170 AU에 두면 행성 전체가 점 하나가 된다. 방향은 보존하고
        // 해왕성 바깥 거리는 로그로 압축하며 카드에 실제 AU와 기준시각을 함께 밝힌다.
        const displayRadius = 31.5 + Math.log2(Math.max(1, distanceAu / 30)) * 3.8;
        const shown = actual.normalize().multiplyScalar(displayRadius);
        addPath([new T.Vector3(), shown], craft.id === 'voyager-1' ? 0xffd36b : 0xff9b78, .42, true);
        addMarker(craft, shown, craft.id === 'voyager-1' ? 0xffd36b : 0xff9b78,
          { distanceAu, displayedAt: withinRange ? new Date() : new Date(epoch), radius: .62 });
      }
    });
  },

  buildCraftPicker() {
    if (!this.craftPicker || !this._craftCatalog) return;
    const isKo = ko();
    this.craftPicker.replaceChildren(...this._craftCatalog.items.map(craft => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.craft = craft.id;
      button.textContent = craft.shortName[isKo ? 'ko' : 'en'];
      button.classList.toggle('on', craft.id === this._selectedCraft?.id);
      button.addEventListener('click', () => this.selectCraft(craft.id));
      return button;
    }));
    this.updateCraftPicker();
  },

  selectCraft(id) {
    const entry = this._craftMarkers.get(id);
    if (!entry) return;
    if (this._solarMotionMode) this.closeSolarMotion(false);
    if (this._photoMode) this.closePhotoAtlas(false);
    if (this._detailBody) this.closeBody(false);
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = 0; this.root.classList.remove('is-moving');
    this._selectedCraft = entry.craft;
    this.level = this.target = .82; this._stage = 'solar';
    this.root.classList.add('is-craft');
    this._craftMarkers.forEach(item => item.object.scale.setScalar(item.craft.id === id ? 1.75 : 1));
    this.buildCraftPicker(); this.updateBodyPicker(); this.showCraftInfo(entry.craft); this.updateHud(); this.render();
    this.emitRouteState();
  },

  showCraftInfo(craft) {
    const isKo = ko();
    const entry = this._craftMarkers.get(craft.id);
    const vector = craft.type === 'heliocentric-vector';
    const distance = vector && entry?.distanceAu
      ? (isKo
        ? `태양에서 ${entry.distanceAu.toFixed(1)} AU · 빛 약 ${Math.round(entry.distanceAu * LIGHT_HOURS_PER_AU)}시간`
        : `${entry.distanceAu.toFixed(1)} AU from the Sun · about ${Math.round(entry.distanceAu * LIGHT_HOURS_PER_AU)} light-hours`)
      : craft.distance[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicCraftKind').textContent = vector
      ? (isKo ? `${craft.epoch.slice(0, 10)} UTC 기준 상태벡터` : `State vector epoch ${craft.epoch.slice(0, 10)} UTC`)
      : (isKo ? `${craft.referenceDate} 공식 자료 기준 · 위치 도식` : `Official reference ${craft.referenceDate} · schematic position`);
    document.getElementById('cosmicCraftTitle').textContent = craft.name[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicCraftDistance').textContent = distance;
    document.getElementById('cosmicCraftMethod').textContent = `${craft.method[isKo ? 'ko' : 'en']} · ${this._craftCatalog.positionNotice[isKo ? 'ko' : 'en']}`;
    document.getElementById('cosmicCraftCredit').textContent = `${isKo ? '크레딧' : 'Credit'} · ${craft.credit}`;
    const source = document.getElementById('cosmicCraftSource');
    source.href = craft.sourceUrl; source.textContent = `${isKo ? '출처' : 'Source'} · ${craft.source}`;
    document.getElementById('cosmicCraftBack').textContent = isKo ? '← 태양계 전체' : '← Full Solar System';
    this.craftInfo.hidden = false;
  },

  closeCraft(render = true) {
    if (!this._selectedCraft) return;
    this._selectedCraft = null; this.root.classList.remove('is-craft'); this.craftInfo.hidden = true;
    this._craftMarkers.forEach(entry => entry.object.scale.setScalar(1));
    this.buildCraftPicker(); this.updateBodyPicker(); this.updateHud();
    if (render) { this.render(); this.emitRouteState(); }
  },

  makeGalaxyGeometry(count, radius = 50) {
    const T = this.THREE;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new T.Color();
    for (let index = 0; index < count; index += 1) {
      const bulge = index < count * .14;
      let x, y, z, radial;
      if (bulge) {
        const along = clamp(normal(index + 31) * radius * .12, -radius * .3, radius * .3);
        const across = normal(index + 41) * (1.25 + Math.abs(along) * .055);
        const barAngle = -.38;
        x = Math.cos(barAngle) * along - Math.sin(barAngle) * across;
        z = Math.sin(barAngle) * along + Math.cos(barAngle) * across;
        y = normal(index + 47) * (2.35 - Math.min(1.45, Math.abs(along) * .075));
        radial = Math.hypot(x, z);
      } else {
        radial = 3 + Math.pow(hash(index + 53), .64) * (radius - 3);
        // 두 주요 팔에 별을 더 배정하고 작은 두 팔은 성기게 남겨 사진 같은 비대칭을 만든다.
        const arm = [0, 2, 0, 2, 1, 3][index % 6];
        const baseAngle = this.galaxySpiralAngle(arm, radial);
        const armWidth = .78 + radial * (arm === 0 || arm === 2 ? .042 : .055);
        const cross = normal(index + 61) * armWidth;
        const angle = baseAngle + normal(index + 67) * (.018 + radial / radius * .032);
        x = Math.cos(angle) * radial + Math.cos(angle + Math.PI / 2) * cross;
        z = Math.sin(angle) * radial + Math.sin(angle + Math.PI / 2) * cross;
        const thickness = .34 + 2.7 * Math.exp(-radial / 10);
        const warp = Math.sin(angle * 1.7) * .42 * (radial / radius) ** 2;
        y = normal(index + 83) * thickness + warp;
      }
      positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z;
      const hot = !bulge && hash(index + 97) > .947;
      const young = !bulge && hash(index + 101) > .91;
      if (bulge) color.setRGB(1, .65 + hash(index) * .24, .34 + hash(index + 2) * .24);
      else if (hot) color.setRGB(1, .22 + hash(index) * .28, .46 + hash(index + 3) * .3);
      else if (young) color.setRGB(.44, .7 + hash(index + 5) * .22, 1);
      else color.setRGB(.54 + hash(index) * .25, .62 + hash(index + 5) * .23, .78 + hash(index + 7) * .2);
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  },

  galaxySpiralAngle(arm, radial) {
    // 기존 radial*.235는 네 팔이 여러 바퀴 겹쳐 동심원처럼 보인 원인이었다.
    const irregularity = Math.sin(radial * .27 + arm * 1.7) * .11
      + Math.sin(radial * .071 + arm) * .07;
    return arm * Math.PI / 2 - .72 + Math.log1p(radial * .22) * 2.25 + irregularity;
  },

  makeGalaxyBarGeometry(count, radius = 50) {
    const T = this.THREE;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new T.Color();
    const barAngle = -.38;
    for (let index = 0; index < count; index += 1) {
      const along = clamp(normal(index + 307) * radius * .115, -radius * .29, radius * .29);
      const across = normal(index + 311) * (1.05 + Math.abs(along) * .052);
      positions[index * 3] = Math.cos(barAngle) * along - Math.sin(barAngle) * across;
      positions[index * 3 + 1] = normal(index + 313) * (2.7 - Math.min(1.7, Math.abs(along) * .09));
      positions[index * 3 + 2] = Math.sin(barAngle) * along + Math.cos(barAngle) * across;
      color.setRGB(1, .58 + hash(index + 317) * .28, .28 + hash(index + 319) * .23);
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  },

  makeGalaxyKnotGeometry(count, radius = 50) {
    const T = this.THREE;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new T.Color();
    const clusterCount = matchMedia('(max-width:560px)').matches ? 34 : 58;
    for (let index = 0; index < count; index += 1) {
      const cluster = index % clusterCount;
      const arm = [0, 2, 0, 2, 1, 3][cluster % 6];
      const radial = 8 + hash(cluster + 211) * (radius - 11);
      const angle = this.galaxySpiralAngle(arm, radial);
      const spread = .18 + hash(cluster + 227) * .72;
      positions[index * 3] = Math.cos(angle) * radial + normal(index + 233) * spread;
      positions[index * 3 + 1] = normal(index + 239) * (.18 + spread * .32);
      positions[index * 3 + 2] = Math.sin(angle) * radial + normal(index + 241) * spread;
      const pink = cluster % 5 !== 0;
      color.setRGB(pink ? 1 : .52, pink ? .24 + hash(cluster) * .22 : .72, pink ? .55 + hash(index) * .24 : 1);
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  },

  makeGalaxyDustLaneGeometry(count, radius = 50) {
    const T = this.THREE;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radial = 5 + Math.pow(hash(index + 263), .7) * (radius - 7);
      const arm = index % 4;
      const angle = this.galaxySpiralAngle(arm, radial) - .055;
      const cross = normal(index + 269) * (.28 + radial * .01) - .42;
      positions[index * 3] = Math.cos(angle) * radial + Math.cos(angle + Math.PI / 2) * cross;
      positions[index * 3 + 1] = normal(index + 271) * (.22 + 1.25 * Math.exp(-radial / 12));
      positions[index * 3 + 2] = Math.sin(angle) * radial + Math.sin(angle + Math.PI / 2) * cross;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    return geometry;
  },

  makeGalaxyDiskGeometry(count, radius = 50) {
    const T = this.THREE;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new T.Color();
    for (let index = 0; index < count; index += 1) {
      const radial = 4 + Math.pow(hash(index + 283), .72) * (radius - 5);
      const angle = hash(index + 293) * Math.PI * 2;
      positions[index * 3] = Math.cos(angle) * radial;
      positions[index * 3 + 1] = normal(index + 297) * (.22 + 2.5 * Math.exp(-radial / 13));
      positions[index * 3 + 2] = Math.sin(angle) * radial;
      const warm = radial < 14 && hash(index + 301) > .45;
      color.setRGB(warm ? .92 : .38 + hash(index) * .2, warm ? .58 : .52 + hash(index + 5) * .2, warm ? .32 : .72 + hash(index + 7) * .22);
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  },

  galaxyMaterial(size, opacity = 1) {
    const T = this.THREE;
    return new T.PointsMaterial({
      size, map: this.spriteTexture, transparent: true, opacity, vertexColors: true,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
  },

  makeMilkyWay() {
    const T = this.THREE;
    this.galaxyGroup = new T.Group();
    const count = matchMedia('(max-width:560px)').matches ? 24000 : 42000;
    const geometry = this.makeGalaxyGeometry(count);
    // 같은 XYZ 별을 큰 저농도 광점으로 한 번 더 그려 참고 이미지의 성간 먼지·가스 같은
    // 부드러운 층을 만든다. 정지 화면이므로 프레임 비용은 상시 발생하지 않는다.
    this.galaxyDustMaterial = this.galaxyMaterial(3.8, 0);
    this.galaxyDust = new T.Points(geometry, this.galaxyDustMaterial);
    this.galaxyGroup.add(this.galaxyDust);
    this.galaxyMaterialMain = this.galaxyMaterial(.68, 0);
    this.milkyWay = new T.Points(geometry, this.galaxyMaterialMain);
    this.galaxyGroup.add(this.milkyWay);

    // 실제 은하 원반에는 팔 사이에도 오래된 별이 있다. 낮은 농도의 원반층을 깔아
    // 네 줄짜리 도식이 아니라 하나의 이어진 은하로 읽히게 한다.
    const diskCount = matchMedia('(max-width:560px)').matches ? 4000 : 8000;
    this.galaxyDiskMaterial = this.galaxyMaterial(1.55, 0);
    this.galaxyDisk = new T.Points(this.makeGalaxyDiskGeometry(diskCount), this.galaxyDiskMaterial);
    this.galaxyGroup.add(this.galaxyDisk);

    // 밝은 팔 안쪽의 어두운 입자는 깊이를 가르는 먼지 띠다. 별도 텍스처를 내려받지 않고
    // 정적 점층으로만 구성해 기기를 쉬게 한 상태에서는 새 프레임을 만들지 않는다.
    const laneCount = matchMedia('(max-width:560px)').matches ? 2800 : 5200;
    this.galaxyLaneMaterial = new T.PointsMaterial({
      size: 1.45, map: this.spriteTexture, color: 0x2a211f, transparent: true, opacity: 0,
      blending: T.NormalBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.galaxyLanes = new T.Points(this.makeGalaxyDustLaneGeometry(laneCount), this.galaxyLaneMaterial);
    this.galaxyGroup.add(this.galaxyLanes);

    const knotCount = matchMedia('(max-width:560px)').matches ? 560 : 1100;
    this.galaxyKnotMaterial = this.galaxyMaterial(1.7, 0);
    this.galaxyKnotMaterial.blending = T.NormalBlending;
    this.galaxyKnots = new T.Points(this.makeGalaxyKnotGeometry(knotCount), this.galaxyKnotMaterial);
    this.galaxyGroup.add(this.galaxyKnots);

    // 한 장짜리 중심 광원 뒤에 실제 XYZ 별을 두어 옆으로 기울였을 때 막대와 팽대부 두께가 보인다.
    const barCount = matchMedia('(max-width:560px)').matches ? 2600 : 4600;
    this.galaxyBarMaterial = this.galaxyMaterial(.9, 0);
    this.galaxyBar = new T.Points(this.makeGalaxyBarGeometry(barCount), this.galaxyBarMaterial);
    this.galaxyGroup.add(this.galaxyBar);

    const coreMaterial = new T.SpriteMaterial({
      map: this.spriteTexture, color: 0xffd28a, transparent: true, opacity: .4,
      blending: T.AdditiveBlending, depthWrite: false,
    });
    this.galaxyCore = new T.Sprite(coreMaterial); this.galaxyCore.scale.set(16, 9, 1);
    this.galaxyGroup.add(this.galaxyCore);
    this.solarMarker = new T.Mesh(
      new T.SphereGeometry(.46, 12, 8),
      new T.MeshBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .95 }),
    );
    this.solarMarker.position.set(SOLAR_MARKER.x, SOLAR_MARKER.y, SOLAR_MARKER.z);
    this.galaxyGroup.add(this.solarMarker);
    this.makeGalaxyGuide();
    this.world.add(this.galaxyGroup);
  },

  makeGalaxyGuide() {
    const T = this.THREE;
    this.galaxyGuideGroup = new T.Group();
    this.galaxyGuideGroup.visible = false;
    this._galaxyGuideAnchors.clear();
    const armIds = ['perseus', 'scutum-centaurus', 'sagittarius', 'norma'];
    armIds.forEach((id, arm) => {
      const points = [];
      for (let index = 0; index <= 104; index += 1) {
        const radial = 5 + index / 104 * 46;
        const angle = this.galaxySpiralAngle(arm, radial);
        points.push(new T.Vector3(Math.cos(angle) * radial, .62, Math.sin(angle) * radial));
      }
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: arm < 2 ? .72 : .42, depthWrite: false }),
      );
      this.galaxyGuideGroup.add(line);
      const anchor = new T.Object3D();
      const labelRadius = [39, 32, 27, 35][arm];
      const labelAngle = this.galaxySpiralAngle(arm, labelRadius);
      anchor.position.set(Math.cos(labelAngle) * labelRadius, .9, Math.sin(labelAngle) * labelRadius);
      this.galaxyGuideGroup.add(anchor); this._galaxyGuideAnchors.set(id, anchor);
    });

    const sunOrbitRadius = Math.hypot(SOLAR_MARKER.x, SOLAR_MARKER.z);
    const orbitPoints = Array.from({ length: 129 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2;
      return new T.Vector3(Math.cos(angle) * sunOrbitRadius, .82, Math.sin(angle) * sunOrbitRadius);
    });
    const orbit = new T.Line(
      new T.BufferGeometry().setFromPoints(orbitPoints),
      new T.LineDashedMaterial({ color: 0xe8f8fb, transparent: true, opacity: .52, dashSize: 1.4, gapSize: .9, depthWrite: false }),
    );
    orbit.computeLineDistances(); this.galaxyGuideGroup.add(orbit);
    const orbitAnchor = new T.Object3D();
    orbitAnchor.position.set(Math.cos(-1.18) * sunOrbitRadius, 1, Math.sin(-1.18) * sunOrbitRadius);
    this.galaxyGuideGroup.add(orbitAnchor); this._galaxyGuideAnchors.set('sun-orbit', orbitAnchor);

    const edgePoints = Array.from({ length: 129 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2;
      return new T.Vector3(Math.cos(angle) * 50, .3, Math.sin(angle) * 50);
    });
    this.galaxyGuideGroup.add(new T.Line(
      new T.BufferGeometry().setFromPoints(edgePoints),
      new T.LineBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .18, depthWrite: false }),
    ));
    const edgeAnchor = new T.Object3D();
    edgeAnchor.position.set(Math.cos(.72) * 50, .7, Math.sin(.72) * 50);
    this.galaxyGuideGroup.add(edgeAnchor); this._galaxyGuideAnchors.set('disk-edge', edgeAnchor);
    const bar = new T.Mesh(
      new T.BoxGeometry(19, .22, 5.5),
      new T.MeshBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .18, depthWrite: false }),
    );
    bar.rotation.y = -.38; this.galaxyGuideGroup.add(bar);
    const center = new T.Object3D(); center.position.set(0, 1, 0);
    this.galaxyGuideGroup.add(center); this._galaxyGuideAnchors.set('center', center);
    this.galaxyGroup.add(this.galaxyGuideGroup);
  },

  loadGalaxyGuideCatalog() {
    if (this._galaxyGuideCatalogPromise) return this._galaxyGuideCatalogPromise;
    this._galaxyGuideCatalogPromise = fetch('/data/milky-way-structure.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`MILKY_WAY_STRUCTURE_${response.status}`);
        return response.json();
      })
      .then(raw => {
        const document = assertAetherusCatalog('milky-way-structure', raw);
        this._galaxyGuideCatalog = document;
        return document;
      });
    return this._galaxyGuideCatalogPromise;
  },

  async openGalaxyGuide() {
    try {
      await this.ensureEngine();
      const catalog = await this.loadGalaxyGuideCatalog();
      if (store.scene !== 'space') await sceneMgr.to('space', { stage: 'milkyway' });
      if (this._solarMotionMode) this.closeSolarMotion(false);
      if (this._photoMode) this.closePhotoAtlas(false);
      if (this._detailBody) this.closeBody(false);
      if (this._selectedCraft) this.closeCraft(false);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._frame = 0; this.level = this.target = TARGET.milkyway; this._stage = 'milkyway';
      this.yaw = .08; this.pitch = 1.32; this._galaxyGuideMode = true;
      this.root.classList.remove('is-moving'); this.root.classList.add('is-galaxy-guide');
      this.galaxyGuideGroup.visible = true; this.galaxyGuideInfo.hidden = false;
      this.showGalaxyGuideInfo(catalog); this.updateHud(); this.updateMotionControl(); this.render();
      document.dispatchEvent(new CustomEvent('earthus:galaxy-guide-state', { detail: true }));
    } catch (error) {
      console.warn('[galaxy-guide]', error.message);
      const note = document.getElementById('cosmicNote');
      if (note) note.textContent = ko() ? '우리은하 구조 자료를 읽지 못했습니다.' : 'Could not load the Milky Way structure guide.';
    }
  },

  showGalaxyGuideInfo(catalog = this._galaxyGuideCatalog) {
    if (!catalog) return;
    const isKo = ko();
    document.getElementById('cosmicGalaxyGuideClose').textContent = isKo ? '안내 닫기' : 'Close guide';
    document.getElementById('cosmicGalaxyGuideKind').textContent = isKo ? '관측 자료 기반 3D 구조도' : 'Observation-based 3D structural diagram';
    document.getElementById('cosmicGalaxyGuideTitle').textContent = catalog.title[isKo ? 'ko' : 'en'];
    const facts = document.getElementById('cosmicGalaxyGuideFacts');
    facts.replaceChildren();
    const rows = isKo
      ? [['은하 원반', `지름 약 ${catalog.diameterLightYears.toLocaleString('ko-KR')} 광년`], ['태양 위치', `중심에서 약 ${catalog.sunDistanceFromCenterLightYears.toLocaleString('ko-KR')} 광년`], ['태양 공전', '약 2억 3천만 년']]
      : [['Galactic disk', `About ${catalog.diameterLightYears.toLocaleString('en-US')} light-years across`], ['Sun', `About ${catalog.sunDistanceFromCenterLightYears.toLocaleString('en-US')} light-years from center`], ['Solar orbit', `About ${Math.round(catalog.solarOrbitYears / 1000000)} million years`]];
    rows.forEach(([term, value]) => {
      const dt = document.createElement('dt'); dt.textContent = term;
      const dd = document.createElement('dd'); dd.textContent = value;
      facts.append(dt, dd);
    });
    document.getElementById('cosmicGalaxyGuideLimit').textContent = catalog.limitations[isKo ? 'ko' : 'en'];
    const sources = document.getElementById('cosmicGalaxyGuideSources'); sources.replaceChildren();
    catalog.sources.forEach(source => {
      const link = document.createElement('a'); link.href = source.url; link.target = '_blank';
      link.rel = 'noopener noreferrer'; link.textContent = source.name; sources.append(link);
    });
  },

  closeGalaxyGuide(render = true) {
    if (!this._galaxyGuideMode) return;
    this._galaxyGuideMode = false; this.root.classList.remove('is-galaxy-guide');
    this.galaxyGuideInfo.hidden = true; this.galaxyGuideGroup.visible = false;
    document.dispatchEvent(new CustomEvent('earthus:galaxy-guide-state', { detail: false }));
    this.updateHud(); this.updateMotionControl();
    if (render) this.render();
  },

  loadSolarMotionCatalog() {
    if (this._motionCatalogPromise) return this._motionCatalogPromise;
    this._motionCatalogPromise = fetch('/data/solar-motion.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`SOLAR_MOTION_${response.status}`);
        return response.json();
      })
      .then(raw => {
        const document = assertAetherusCatalog('solar-motion', raw);
        this._motionCatalog = document;
        this.buildSolarMotion();
        return document;
      })
      .catch(error => {
        // 전진 도식만 실패하고 은하수 자체까지 닫히면 안 된다.
        console.warn('[solar-motion]', error.message);
        this.motionOpen.hidden = true;
        return null;
      });
    return this._motionCatalogPromise;
  },

  makeSolarMotion() {
    this.solarMotionGroup = new this.THREE.Group();
    this.solarMotionGroup.visible = false;
    this.world.add(this.solarMotionGroup);
  },

  clearSolarMotion() {
    if (!this.solarMotionGroup) return;
    while (this.solarMotionGroup.children.length) {
      const object = this.solarMotionGroup.children[this.solarMotionGroup.children.length - 1];
      this.solarMotionGroup.remove(object);
      object.traverse?.(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
        else child.material?.dispose?.();
      });
    }
    this._motionPaths.clear(); this._motionPlanetMeshes.clear();
    this.motionSun = null; this.motionSunGlow = null; this.motionDirectionMarker = null;
  },

  buildSolarMotion() {
    if (!this._motionCatalog || !this.solarMotionGroup) return;
    this.clearSolarMotion();
    const T = this.THREE;
    const start = new Date(`${this._motionCatalog.referenceDate}T00:00:00Z`);
    const spanMs = this._motionCatalog.displaySpanDays * DAY_MS;
    const travelStart = -42;
    const travelEnd = 42;
    const timeSamples = Array.from({ length: MOTION_SAMPLES }, (_, index) => {
      const progress = index / (MOTION_SAMPLES - 1);
      return {
        progress,
        positions: planetPositions(new Date(start.getTime() + progress * spanMs)),
      };
    });
    const compressOrbit = point => {
      const radius = Math.max(.0001, Math.hypot(point.x, point.y, point.z));
      const displayRadius = 2.1 + Math.log1p(radius) * 5.7;
      const scale = displayRadius / radius;
      // 진행 방향을 X축으로 펼쳐 궤도면을 정면·측면 모두에서 읽게 한다. 실제 황도면과
      // 은하 공전 방향의 각도는 보존하지 않으며 이 한계를 카드에 항상 표시한다.
      return { x: point.z * scale * .35, y: point.x * scale, z: point.y * scale };
    };
    const linePoints = [new T.Vector3(travelStart - 5, 0, 0), new T.Vector3(travelEnd + 5, 0, 0)];
    const directionLine = new T.Line(
      new T.BufferGeometry().setFromPoints(linePoints),
      new T.LineDashedMaterial({ color: 0x83e0f2, transparent: true, opacity: .32, dashSize: 1.5, gapSize: .9 }),
    );
    directionLine.computeLineDistances(); this.solarMotionGroup.add(directionLine);
    const directionMarker = new T.Mesh(
      new T.ConeGeometry(.72, 2.4, 16),
      new T.MeshBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .72 }),
    );
    directionMarker.position.set(travelEnd + 5, 0, 0); directionMarker.rotation.z = -Math.PI / 2;
    this.solarMotionGroup.add(directionMarker); this.motionDirectionMarker = directionMarker;

    IDS.forEach(id => {
      const points = timeSamples.map(sample => {
        const { progress } = sample;
        const point = sample.positions[id];
        const orbit = compressOrbit(point);
        return new T.Vector3(mix(travelStart, travelEnd, progress) + orbit.x, orbit.y, orbit.z);
      });
      const geometry = new T.BufferGeometry().setFromPoints(points);
      geometry.setDrawRange(0, 2);
      const line = new T.Line(geometry, new T.LineBasicMaterial({
        color: PLANETS[id].color, transparent: true, opacity: id === 'earth' ? .94 : .66, depthWrite: false,
      }));
      this.solarMotionGroup.add(line);
      const radius = clamp(PLANETS[id].radius * .5, .22, .62);
      const planet = new T.Mesh(
        new T.SphereGeometry(radius, 14, 10),
        new T.MeshBasicMaterial({ color: PLANETS[id].color }),
      );
      planet.position.copy(points[0]); planet.userData.motionBody = id;
      this.solarMotionGroup.add(planet);
      this._motionPaths.set(id, { points, line });
      this._motionPlanetMeshes.set(id, planet);
    });

    this.motionSun = new T.Mesh(
      new T.SphereGeometry(1.15, 20, 14),
      new T.MeshBasicMaterial({ color: 0xffca55 }),
    );
    this.motionSun.position.set(travelStart, 0, 0); this.solarMotionGroup.add(this.motionSun);
    this.motionSunGlow = new T.Sprite(new T.SpriteMaterial({
      map: this.spriteTexture, color: 0xffb83d, transparent: true, opacity: .72,
      blending: T.AdditiveBlending, depthWrite: false,
    }));
    this.motionSunGlow.scale.set(8, 8, 1); this.motionSunGlow.position.copy(this.motionSun.position);
    this.solarMotionGroup.add(this.motionSunGlow);
    this.setSolarMotionProgress(0, false);
  },

  setSolarMotionProgress(value, updateScreen = true) {
    if (!this._motionCatalog || !this.motionSun) return;
    const progress = clamp(value, 0, 1);
    this._motionProgress = progress;
    const pointIndex = Math.min(MOTION_SAMPLES - 1, Math.floor(progress * (MOTION_SAMPLES - 1)));
    const travelX = mix(-42, 42, progress);
    this.motionSun.position.set(travelX, 0, 0); this.motionSunGlow.position.copy(this.motionSun.position);
    this._motionPaths.forEach((entry, id) => {
      entry.line.geometry.setDrawRange(0, Math.max(2, pointIndex + 1));
      this._motionPlanetMeshes.get(id)?.position.copy(entry.points[pointIndex]);
    });
    const distance = this._motionCatalog.distanceAu * progress;
    const days = Math.round(this._motionCatalog.displaySpanDays * progress);
    const status = document.getElementById('cosmicMotionDistance');
    if (status) status.textContent = ko()
      ? `${days}일 · 태양 이동 약 ${distance.toFixed(1)} AU`
      : `${days} days · Sun travels about ${distance.toFixed(1)} AU`;
    const bar = document.getElementById('cosmicMotionProgress');
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (updateScreen) this.render();
  },

  async openSolarMotion() {
    try {
      await this.ensureEngine();
      const catalog = await this.loadSolarMotionCatalog();
      if (!catalog || !this.motionSun) throw new Error('SOLAR_MOTION_UNAVAILABLE');
      if (this._photoMode) this.closePhotoAtlas(false);
      if (this._detailBody) this.closeBody(false);
      if (this._selectedCraft) this.closeCraft(false);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._frame = 0; this.root.classList.remove('is-moving');
      this.level = this.target = TARGET.milkyway; this._stage = 'milkyway';
      this._solarMotionMode = true; this._motionDistance = matchMedia('(max-width:560px)').matches ? 162 : 132;
      this.yaw = .08; this.pitch = .22;
      this.root.classList.add('is-solar-motion');
      this.solarMotionGroup.visible = true; this.motionInfo.hidden = false; this.motionOpen.hidden = true;
      this.showSolarMotionInfo(); this.updateHud(); this.updateBodyPicker(); this.updateCraftPicker();
      this.setSolarMotionProgress(0, false); this.render(); this.replaySolarMotion();
    } catch (error) {
      console.warn('[solar-motion]', error.message);
      const note = document.getElementById('cosmicNote');
      if (note) note.textContent = ko() ? '태양계 전진 자료를 읽지 못했습니다.' : 'Could not load Solar System motion data.';
    }
  },

  replaySolarMotion() {
    if (!this._solarMotionMode || !this._motionCatalog) return;
    this.cancelSolarMotionReplay();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.setSolarMotionProgress(1); return;
    }
    this.setSolarMotionProgress(0, false);
    const start = performance.now();
    let lastDraw = start - COSMIC_FRAME_MS;
    this.root.classList.add('is-moving');
    const step = now => {
      const progress = clamp((now - start) / MOTION_DURATION_MS, 0, 1);
      // ProMotion 120Hz에서도 WebGL은 최대 30fps만 그린다. rAF 콜백은 가볍게
      // 건너뛰고, 마지막 프레임은 반드시 그린 뒤 예약을 끝낸다.
      if (progress < 1 && now - lastDraw < COSMIC_FRAME_MS) {
        this._motionFrame = requestAnimationFrame(step);
        return;
      }
      lastDraw = now;
      const eased = progress < .5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      this.setSolarMotionProgress(eased, false); this.render();
      if (progress >= 1) {
        this._motionFrame = 0; this.root.classList.remove('is-moving');
        return;
      }
      this._motionFrame = requestAnimationFrame(step);
    };
    this._motionFrame = requestAnimationFrame(step);
  },

  cancelSolarMotionReplay() {
    if (this._motionFrame) cancelAnimationFrame(this._motionFrame);
    this._motionFrame = 0;
    if (!this._frame) this.root?.classList.remove('is-moving');
  },

  showSolarMotionInfo() {
    if (!this._motionCatalog) return;
    const isKo = ko();
    document.getElementById('cosmicMotionKind').textContent = isKo
      ? `${this._motionCatalog.referenceDate} 자료 기준 · 1년을 펼친 3D 도식`
      : `Reference ${this._motionCatalog.referenceDate} · one year unfolded in 3D`;
    document.getElementById('cosmicMotionTitle').textContent = isKo ? '움직이는 태양계' : 'The moving Solar System';
    document.getElementById('cosmicMotionLimit').textContent = this._motionCatalog.displayLimit[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicMotionReplay').textContent = isKo ? '1년 다시 보기' : 'Replay one year';
    document.getElementById('cosmicMotionBack').textContent = isKo ? '← 은하수 전체' : '← Full Milky Way';
    const source = document.getElementById('cosmicMotionSource');
    source.href = this._motionCatalog.sourceUrl;
    source.textContent = `${isKo ? '출처' : 'Source'} · ${this._motionCatalog.source}`;
    this.setSolarMotionProgress(this._motionProgress, false);
  },

  closeSolarMotion(render = true) {
    if (!this._solarMotionMode) return;
    this.cancelSolarMotionReplay(); this._solarMotionMode = false;
    this.root.classList.remove('is-solar-motion'); this.motionInfo.hidden = true;
    this.solarMotionGroup.visible = false; this.yaw = .72; this.pitch = .56;
    this.level = this.target = TARGET.milkyway;
    this.updateMotionControl(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateHud();
    if (render) this.render();
  },

  updateMotionControl() {
    if (!this.motionOpen) return;
    const visible = !!this._motionCatalog && store.scene === 'space' && stageFor(this.level) === 'milkyway'
      && !this._solarMotionMode && !this._galaxyGuideMode && !this._photoMode && !this._detailBody && !this._selectedCraft;
    this.motionOpen.hidden = !visible;
    this.motionOpen.textContent = ko() ? '태양계의 전진 보기 →' : 'See the Solar System move →';
  },

  makeGalaxyGroup() {
    const T = this.THREE;
    this.clusterGroup = new T.Group();
    const geometry = this.makeGalaxyGeometry(matchMedia('(max-width:560px)').matches ? 900 : 1500, 50);
    this.clusterMaterial = this.galaxyMaterial(1.25, 0);
    for (let index = 1; index <= 24; index += 1) {
      const shell = 85 + hash(index + 110) * 230;
      const angle = index * 2.399963;
      const galaxy = new T.Points(geometry, this.clusterMaterial);
      galaxy.position.set(Math.cos(angle) * shell, normal(index + 125) * 70, Math.sin(angle) * shell * .72);
      const scale = .16 + hash(index + 133) * .42;
      galaxy.scale.setScalar(scale);
      galaxy.rotation.set(hash(index + 141) * Math.PI, hash(index + 149) * Math.PI, hash(index + 157) * Math.PI);
      this.clusterGroup.add(galaxy);
    }
    this.world.add(this.clusterGroup);
  },

  buildBodyPicker() {
    if (!this.bodyPicker) return;
    const isKo = ko();
    const moonName = isKo ? '달' : 'Moon';
    this.bodyPicker.replaceChildren(...BODY_ORDER.map(id => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.body = id;
      button.textContent = id === 'moon' ? moonName : PLANETS[id][isKo ? 'ko' : 'en'];
      button.addEventListener('click', () => id === 'earth' ? this.exitToEarth() : this.selectBody(id));
      return button;
    }));
    this.updateBodyPicker();
  },

  loadBodyCatalog() {
    if (this._bodyCatalogPromise) return this._bodyCatalogPromise;
    this._bodyCatalogPromise = fetch('/data/celestial-bodies.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`CELESTIAL_BODIES_${response.status}`);
        return response.json();
      })
      .then(raw => {
        const document = assertAetherusCatalog('celestial-bodies', raw);
        this._bodyCatalog = document;
        return document;
      });
    return this._bodyCatalogPromise;
  },

  makeBodyDetail() {
    const T = this.THREE;
    this.bodyDetailGroup = new T.Group();
    this.bodyDetailGroup.visible = false;
    this.bodySphere = new T.Mesh(
      new T.SphereGeometry(18, 128, 80),
      new T.MeshStandardMaterial({
        color: 0xffffff, roughness: .88, metalness: 0,
        emissive: 0x555555, emissiveIntensity: .85,
      }),
    );
    this.bodyDetailGroup.add(this.bodySphere);
    this.world.add(this.bodyDetailGroup);
  },

  async selectBody(id) {
    if (id === 'earth') { this.exitToEarth(); return; }
    try {
      await this.ensureEngine();
      const catalog = await this.loadBodyCatalog();
      const body = catalog.bodies.find(item => item.id === id);
      if (!body) throw new Error(`UNKNOWN_BODY_${id}`);
      // 상세 구를 먼저 단색으로 열지 않는다. 130KB 안팎의 미리보기가 준비될 때까지
      // 태양계를 유지한 뒤 같은 실제 표면을 즉시 확대하고, 상세판만 뒤에서 선명하게 바꾼다.
      await this.loadPlanetTextures();
      if (this._solarMotionMode) this.closeSolarMotion(false);
      if (this._selectedCraft) this.closeCraft(false);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._frame = 0; this.root.classList.remove('is-moving');
      this.prepareAstronomy(body);
      this.level = this.target = TARGET.solar;
      this._stage = 'solar'; this._detailBody = body;
      const compact = matchMedia('(max-width:560px)').matches;
      this._bodyDistance = compact ? (body.id === 'saturn' ? 142 : 94) : (body.id === 'saturn' ? 72 : 48);
      const firstFeature = body.features?.find(feature => feature.accent) || body.features?.[0];
      this.yaw = firstFeature ? this.THREE.MathUtils.degToRad(firstFeature.lon) : .72;
      this.pitch = firstFeature
        ? clamp(this.THREE.MathUtils.degToRad(firstFeature.lat), -1.35, 1.35) : .38;
      // 북극 육각형의 위도(78°)를 그대로 정면에 두면 고리가 동심원처럼 납작해진다.
      // 첫 진입은 행성과 고리의 입체감이 함께 보이는 각도로 두고, 사용자가 돌려 북극을 본다.
      if (body.id === 'saturn') { this.yaw = .72; this.pitch = .38; }
      this.root.classList.add('is-body');
      this.bodyDetailGroup.visible = true;
      this.clearBodyVisual();
      const loadId = ++this._detailTextureLoadId;
      const previewTexture = this._planetTextures.get(body.id);
      this._detailTexture = previewTexture ? previewTexture.clone() : this.makeBodyFallbackTexture(body);
      this._detailTextureStage = previewTexture ? 'preview' : 'fallback';
      this._ultraTextureLoading = null;
      this._detailTexture.needsUpdate = true;
      this.bodySphere.material.map = this._detailTexture;
      this.bodySphere.material.emissiveMap = this._detailTexture;
      this.bodySphere.material.emissive.set(body.id === 'sun' ? 0xffffff : 0x555555);
      this.bodySphere.material.emissiveIntensity = body.id === 'sun' ? 1.08 : body.id === 'uranus' ? 0 : .68;
      this.bodySphere.material.color.set(0xffffff);
      this.bodySphere.material.needsUpdate = true;
      if (location.hash === '#dev') {
        this.canvas.dataset.surfaceQuality = this._detailTextureStage;
        this.canvas.dataset.surfacePixels = `${this._detailTexture.image.width}x${this._detailTexture.image.height}`;
      }
      this.makeBodyRing(body);
      this.makeBodyAtmosphere(body);
      this.makeBodyMarkers(body);
      this.makeBodyOrbiters(body);
      this.showBodyInfo(body);
      this.updateBodyPicker(); this.updateCraftPicker();
      this.updateHud(); this.render();
      this.emitRouteState();
      this.loadSurfaceTexture(planetTextureUrl(`detail/${body.id}.webp`)).then(texture => {
        if (loadId !== this._detailTextureLoadId || this._detailBody?.id !== body.id) {
          texture.dispose(); return;
        }
        this._detailTexture?.dispose();
        this._detailTexture = texture;
        this.bodySphere.material.map = texture;
        this.bodySphere.material.emissiveMap = texture;
        this.bodySphere.material.needsUpdate = true;
        this._detailTextureStage = 'detail';
        if (location.hash === '#dev') {
          this.canvas.dataset.surfaceQuality = 'detail';
          this.canvas.dataset.surfacePixels = `${texture.image.width}x${texture.image.height}`;
        }
        this.render();
      }).catch(error => {
        // 네트워크가 끊겨도 기존 가벼운 절차 텍스처로 천체 탐색은 계속한다.
        console.warn(`[cosmic-texture:${body.id}]`, error?.message || 'load failed');
      });
    } catch (error) {
      console.warn('[cosmic-body]', error.message);
      const note = document.getElementById('cosmicNote');
      if (note) note.textContent = ko() ? '천체 자료를 읽지 못했습니다.' : 'Could not load the body data.';
    }
  },

  clearBodyVisual() {
    if (!this.bodyDetailGroup) return;
    while (this.bodyDetailGroup.children.length > 1) {
      const object = this.bodyDetailGroup.children[this.bodyDetailGroup.children.length - 1];
      this.bodyDetailGroup.remove(object);
      object.traverse?.(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
        else child.material?.dispose?.();
      });
    }
    if (this._detailTexture) this._detailTexture.dispose();
    this.bodySphere.material.map = null;
    this.bodySphere.material.emissiveMap = null;
    this.bodySphere.material.needsUpdate = true;
    this._detailTexture = null; this._detailTextureStage = null; this._ultraTextureLoading = null;
    this._detailRing = null;
    this._detailMarkers.clear();
  },

  makeBodyFallbackTexture(body) {
    const T = this.THREE;
    const width = matchMedia('(max-width:560px)').matches ? 512 : 768;
    const height = width / 2;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    const palette = body.palette || ['#888', '#bbb', '#444'];
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, palette[1]); gradient.addColorStop(.5, palette[0]); gradient.addColorStop(1, palette[2]);
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);

    if (body.texture === 'bands') {
      for (let y = 0; y < height; y += 9) {
        const band = .18 + hash(y + body.radiusKm) * .3;
        context.fillStyle = y % 27 < 9 ? `${palette[1]}${Math.round(band * 255).toString(16).padStart(2, '0')}`
          : `${palette[2]}${Math.round(band * .72 * 255).toString(16).padStart(2, '0')}`;
        context.fillRect(0, y, width, 5 + hash(y + 7) * 8);
      }
      if (body.id === 'jupiter') {
        context.fillStyle = 'rgba(151,62,44,.74)';
        context.beginPath(); context.ellipse(width * .37, height * .62, width * .08, height * .045, -.1, 0, Math.PI * 2); context.fill();
      }
    } else if (body.texture === 'cloudy') {
      for (let index = 0; index < 70; index += 1) {
        const y = hash(index + 20) * height;
        context.strokeStyle = `rgba(255,239,190,${.05 + hash(index + 30) * .13})`;
        context.lineWidth = 5 + hash(index + 40) * 15;
        context.beginPath(); context.moveTo(-20, y);
        context.bezierCurveTo(width * .28, y + normal(index) * 18, width * .7, y - normal(index + 4) * 16, width + 20, y); context.stroke();
      }
    } else {
      for (let index = 0; index < 1250; index += 1) {
        const x = hash(index + body.radiusKm) * width, y = hash(index + body.radiusKm + 12) * height;
        const radius = .4 + hash(index + 28) * 2.8;
        context.fillStyle = index % 3 === 0 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.07)';
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      }
      if (body.texture === 'cratered' || body.texture === 'moon') {
        const count = body.texture === 'moon' ? 78 : 105;
        for (let index = 0; index < count; index += 1) {
          const x = hash(index + 90) * width, y = hash(index + 120) * height;
          const radius = 1.2 + hash(index + 160) ** 2 * 9;
          const crater = context.createRadialGradient(
            x - radius * .22, y - radius * .2, radius * .08, x, y, radius,
          );
          crater.addColorStop(0, 'rgba(20,23,24,.16)');
          crater.addColorStop(.62, 'rgba(20,23,24,.1)');
          crater.addColorStop(.78, 'rgba(236,235,225,.09)');
          crater.addColorStop(1, 'rgba(20,23,24,0)');
          context.fillStyle = crater; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
        }
      }
      if (body.texture === 'moon') {
        context.fillStyle = 'rgba(35,42,43,.2)';
        [[.57,.42,.12,.08],[.67,.5,.08,.12],[.46,.55,.14,.07]].forEach(([x,y,rx,ry]) => {
          context.beginPath(); context.ellipse(width*x,height*y,width*rx,height*ry,0,0,Math.PI*2); context.fill();
        });
      }
      if (body.texture === 'mars') {
        context.fillStyle = 'rgba(74,38,35,.22)';
        [[.28,.48,.16,.07],[.62,.56,.2,.09],[.78,.38,.11,.06]].forEach(([x,y,rx,ry]) => {
          context.beginPath(); context.ellipse(width*x,height*y,width*rx,height*ry,-.12,0,Math.PI*2); context.fill();
        });
        context.fillStyle = 'rgba(235,229,213,.72)'; context.fillRect(0, 0, width, height * .035);
      }
    }
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.RepeatWrapping; texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  },

  latLonPosition(lat, lon, radius = 18.6) {
    const latitude = this.THREE.MathUtils.degToRad(lat);
    const longitude = this.THREE.MathUtils.degToRad(lon);
    return new this.THREE.Vector3(
      Math.cos(latitude) * Math.sin(longitude) * radius,
      Math.sin(latitude) * radius,
      Math.cos(latitude) * Math.cos(longitude) * radius,
    );
  },

  makeBodyMarkers(body) {
    const T = this.THREE;
    (body.features || []).forEach((feature, index) => {
      const marker = new T.Mesh(
        new T.SphereGeometry(feature.accent ? .32 : .22, 10, 8),
        new T.MeshBasicMaterial({ color: feature.accent ? 0xffd36b : 0x8bd8ec, depthTest: true }),
      );
      marker.position.copy(this.latLonPosition(feature.lat, feature.lon));
      this.bodyDetailGroup.add(marker);
      this._detailMarkers.set(`body-feature-${index}`, {
        object: marker,
        name: feature.name,
        schematic: !!feature.schematic,
      });
    });
  },

  makeBodyRing(body) {
    if (!['saturn', 'uranus'].includes(body.id)) return;
    const T = this.THREE;
    const group = new T.Group();
    if (body.id === 'saturn') {
      const texture = this._planetTextures.get('saturn-ring');
      const ring = new T.Mesh(
        this.makeRadialRingGeometry(20.5, 33.1, 192),
        new T.MeshBasicMaterial({
          map: texture || null, color: texture ? 0xffffff : 0xd8caa0,
          transparent: true, opacity: texture ? .9 : .18,
          side: T.DoubleSide, depthWrite: false,
        }),
      );
      group.add(ring);
      group.rotation.x = Math.PI / 2;
      this.bodyDetailGroup.add(group); this._detailRing = group;
      return;
    }
    const bands = [[21.2,21.45,.2],[22.3,22.55,.16],[24.1,24.4,.13]];
    bands.forEach(([inner, outer, opacity], index) => {
      const ring = new T.Mesh(
        new T.RingGeometry(inner, outer, 128),
        new T.MeshBasicMaterial({
          color: 0x86c7ce,
          transparent: true, opacity, side: T.DoubleSide, depthWrite: false,
        }),
      );
      group.add(ring);
    });
    group.rotation.x = Math.PI / 2;
    group.rotation.z = Math.PI * .48;
    this.bodyDetailGroup.add(group); this._detailRing = group;
  },

  makeBodyAtmosphere(body) {
    const T = this.THREE;
    if (body.id === 'sun') {
      const inner = new T.Sprite(new T.SpriteMaterial({
        map: this.spriteTexture, color: 0xffb13b, transparent: true, opacity: .46,
        blending: T.AdditiveBlending, depthWrite: false,
      }));
      inner.scale.set(46, 46, 1);
      const outer = new T.Sprite(new T.SpriteMaterial({
        map: this.spriteTexture, color: 0xff6f21, transparent: true, opacity: .18,
        blending: T.AdditiveBlending, depthWrite: false,
      }));
      outer.scale.set(54, 54, 1);
      this.bodyDetailGroup.add(outer, inner);
      return;
    }
    if (body.id !== 'uranus') return;
    const rim = new T.Mesh(
      new T.SphereGeometry(18.24, 32, 20),
      new T.MeshBasicMaterial({
        color: 0x9de8ee, transparent: true, opacity: .1,
        side: T.BackSide, blending: T.AdditiveBlending, depthWrite: false,
      }),
    );
    this.bodyDetailGroup.add(rim);
  },

  makeBodyOrbiters(body) {
    if (!body.orbiters?.length) return;
    const T = this.THREE;
    const points = Array.from({ length: 96 }, (_, index) => {
      const angle = index / 96 * Math.PI * 2;
      return new T.Vector3(Math.cos(angle) * 23, Math.sin(angle) * 23 * .32, Math.sin(angle) * 5.5);
    });
    const orbit = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color: 0x8ba8b8, transparent: true, opacity: .34 }),
    );
    this.bodyDetailGroup.add(orbit);
    body.orbiters.forEach((orbiter, index) => {
      const angle = .72 + index * 2.4;
      const marker = new T.Mesh(
        new T.SphereGeometry(.34, 10, 8),
        new T.MeshBasicMaterial({ color: new T.Color(orbiter.color || '#8bd8ec') }),
      );
      marker.position.set(Math.cos(angle) * 23, Math.sin(angle) * 7.36, Math.sin(angle) * 5.5);
      this.bodyDetailGroup.add(marker);
      this._detailMarkers.set(`body-orbiter-${index}`, {
        object: marker,
        name: orbiter.name,
        orbiter: true,
      });
    });
  },

  showBodyInfo(body) {
    const isKo = ko();
    document.getElementById('cosmicBodyKind').textContent = body.kind[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicBodyTitle').textContent = body.name[isKo ? 'ko' : 'en'];
    const facts = document.getElementById('cosmicBodyFacts'); facts.replaceChildren();
    const rows = [
      [isKo ? '평균 반지름' : 'Mean radius', `${Number(body.radiusKm).toLocaleString()} km`],
      [isKo ? '자전' : 'Rotation', body.rotation[isKo ? 'ko' : 'en']],
      [isKo ? '공전' : 'Orbit', body.orbit[isKo ? 'ko' : 'en']],
    ];
    rows.forEach(([term, value]) => {
      const dt = document.createElement('dt'); dt.textContent = term;
      const dd = document.createElement('dd'); dd.textContent = value;
      facts.append(dt, dd);
    });
    const notice = this._bodyCatalog.positionNotice[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicBodyLimit').textContent = `${body.summary[isKo ? 'ko' : 'en']} · ${notice}`;
    const source = document.getElementById('cosmicBodySource');
    source.textContent = `${isKo ? '출처' : 'Source'} · ${body.source}`; source.href = body.sourceUrl;
    document.getElementById('cosmicBodyBack').textContent = isKo ? '← 태양계' : '← Solar System';
    this.showAstronomy(body);
    this.bodyInfo.hidden = false;
  },

  prepareAstronomy(body) {
    if (body.id !== 'mars') {
      this.clearAstronomy();
      this._pendingAstronomyRoute = null;
      return;
    }
    const route = this._pendingAstronomyRoute;
    this._pendingAstronomyRoute = null;
    const sharedObserver = route?.observer?.source === 'shared' ? {
      lat: route.observer.lat,
      lon: route.observer.lon,
      source: 'shared',
      name: { ko: '공유된 관측 위치', en: 'Shared observer location' },
    } : null;
    this._astronomyObserver = sharedObserver || DEFAULT_ASTRONOMY_OBSERVER;
    this._astronomyAt = route?.at || astronomyNow();
    this._astronomyPrecision = route?.precision || 'explorer';
    const routeFailure = route?.issues?.find(issue => [
      'INVALID_OBSERVER', 'INVALID_AT', 'INVALID_PRECISION',
    ].includes(issue));
    if (routeFailure) {
      // 잘못된 공유 입력을 기본 위치·현재 시각으로 바꿔 성공처럼 보이지 않는다.
      // 사용자가 '지금 다시 계산'을 누르면 그때 명시적으로 기본값으로 복구한다.
      this._astronomyObservation = null;
      this._astronomyError = routeFailure;
      return;
    }
    this.calculateAstronomy();
  },

  calculateAstronomy() {
    try {
      this._astronomyObservation = calculateMarsObservation({
        observer: this._astronomyObserver || DEFAULT_ASTRONOMY_OBSERVER,
        at: this._astronomyAt || astronomyNow(),
        precision: this._astronomyPrecision || 'explorer',
      });
      this._astronomyObserver = this._astronomyObservation.observer;
      this._astronomyAt = this._astronomyObservation.time.utc;
      this._astronomyPrecision = this._astronomyObservation.precision.tier;
      this._astronomyError = null;
      this.updateObservationPlanFreshness();
    } catch (error) {
      this._astronomyObservation = null;
      this._astronomyError = error?.message || 'ASTRONOMY_CALCULATION_FAILED';
      if (this._observationPlan) {
        this._observationPlanStatus = 'STALE';
        this._offlinePlanManifest = null;
      }
      console.warn('[aetherus-astronomy]', this._astronomyError);
    }
  },

  updateObservationPlanFreshness() {
    if (!this._observationPlan || !this._astronomyObservation) return;
    const assessment = assessObservationPlan(this._observationPlan, {
      observer: this._astronomyObservation.observer,
      startAt: this._astronomyObservation.time.utc,
    });
    this._observationPlanStatus = assessment.status;
    if (assessment.status === 'STALE') this._offlinePlanManifest = null;
  },

  buildObservationPlan({ emit = true } = {}) {
    if (this._detailBody?.id !== 'mars' || !this._astronomyObservation) {
      this._plannerError = this._astronomyError || 'ASTRONOMY_INPUT_REQUIRED';
      this._observationPlanStatus = 'ERROR';
      this.showObservationPlanner();
      return false;
    }
    try {
      this._observationPlan = createMarsGeometryPlan({
        observer: this._astronomyObservation.observer,
        startAt: this._astronomyObservation.time.utc,
      });
      this._observationPlanStatus = 'CURRENT';
      this._offlinePlanManifest = createOfflinePlanManifest(this._observationPlan);
      this._plannerError = null;
      this.showObservationPlanner();
      void this.restoreObservationSessionForPlan();
      if (emit) this.emitRouteState();
      return true;
    } catch (error) {
      this._observationPlan = null;
      this._offlinePlanManifest = null;
      this._observationPlanStatus = 'ERROR';
      this._plannerError = error?.message || 'OBSERVATION_PLAN_FAILED';
      console.warn('[aetherus-planner]', this._plannerError);
      this.showObservationPlanner();
      if (emit) this.emitRouteState();
      return false;
    }
  },

  showObservationPlanner() {
    const section = document.getElementById('cosmicPlanner');
    const build = document.getElementById('cosmicPlannerBuild');
    if (!section || !build) return;
    const isKo = ko();
    build.textContent = isKo ? '24시간 기하 계획 만들기' : 'Build 24-hour geometry plan';
    build.disabled = !this._astronomyObservation;
    const hasResult = !!(this._observationPlan || this._plannerError);
    section.hidden = !hasResult;
    if (!hasResult) return;

    const plan = this._observationPlan;
    const stale = this._observationPlanStatus === 'STALE';
    const error = this._observationPlanStatus === 'ERROR';
    const noFeasible = plan?.result === 'NO_FEASIBLE';
    section.dataset.state = error ? 'error' : stale ? 'stale' : noFeasible ? 'no-feasible' : 'current';
    document.getElementById('cosmicPlannerTitle').textContent = isKo ? '화성 기하 계획' : 'Mars geometry plan';
    document.getElementById('cosmicPlannerStatus').textContent = error
      ? 'ERROR' : stale ? 'STALE' : noFeasible ? 'NO FEASIBLE' : 'GEOMETRY';
    document.getElementById('cosmicPlannerRebuild').textContent = isKo
      ? (stale ? '바뀐 입력으로 다시 계산' : '같은 입력 다시 계산')
      : (stale ? 'Rebuild with changed input' : 'Rebuild same input');
    document.getElementById('cosmicPlannerDownload').textContent = isKo
      ? '계획 JSON 저장' : 'Save plan JSON';
    document.getElementById('cosmicPlannerDefinition').textContent = isKo
      ? 'USNO 박명 정의' : 'USNO twilight definition';
    const windows = document.getElementById('cosmicPlannerWindows');
    windows.replaceChildren();

    if (error || !plan) {
      document.getElementById('cosmicPlannerContext').textContent = isKo
        ? '계획 입력을 검증하지 못했습니다.' : 'Planner input could not be validated.';
      const item = document.createElement('li');
      item.textContent = this._plannerError || 'OBSERVATION_PLAN_FAILED';
      windows.append(item);
      document.getElementById('cosmicPlannerEvidence').textContent = isKo
        ? '계산값 없음 · 관측 n 해당 없음' : 'No calculation · observation n not applicable';
      document.getElementById('cosmicPlannerLimits').textContent = isKo
        ? '실패를 기본 성공값으로 바꾸지 않았습니다.' : 'Failure was not replaced with a default success.';
    } else {
      const criteria = plan.input.criteria;
      document.getElementById('cosmicPlannerContext').textContent =
        `UTC ${plannerUtc(plan.input.availability.startUtc)} → ${plannerUtc(plan.input.availability.endUtc)} · Mars ≥ ${criteria.marsAltitudeMinDeg}° · Sun ≤ ${criteria.sunAltitudeMaxDeg}°`;
      if (stale) {
        const item = document.createElement('li');
        item.textContent = isKo
          ? '위치 또는 UTC가 바뀌어 아래 이전 계획은 현재 입력에 사용할 수 없습니다.'
          : 'Location or UTC changed; the previous plan below is not valid for the current input.';
        windows.append(item);
      }
      if (noFeasible) {
        const item = document.createElement('li');
        item.textContent = isKo
          ? '이 24시간 계산 격자에는 두 기하 조건의 교집합이 없습니다.'
          : 'No grid sample in this 24-hour window satisfies both geometry constraints.';
        const note = document.createElement('small');
        note.textContent = isKo
          ? '관측 불가 결론이 아닙니다. 날씨·현지 지평선·달·장비는 평가하지 않았습니다.'
          : 'This is not an unobservable claim; weather, local horizon, Moon, and equipment were not evaluated.';
        item.append(note); windows.append(item);
      } else {
        plan.windows.forEach((window, index) => {
          const item = document.createElement('li');
          item.textContent = `${isKo ? '후보' : 'Candidate'} ${index + 1} · ${plannerUtc(window.startUtc)} → ${plannerUtc(window.endUtc)}`;
          const note = document.createElement('small');
          note.textContent = `${isKo ? '격자 최고점' : 'Grid peak'} ${plannerUtc(window.peak.utc)} · Mars ${signedDegrees(window.peak.marsAltitudeDeg)} · Sun ${signedDegrees(window.peak.sunAltitudeDeg)}`;
          item.append(note); windows.append(item);
        });
      }
      document.getElementById('cosmicPlannerEvidence').textContent =
        `${plan.revision} · ${isKo ? '계산 격자' : 'calculation grid'} ${plan.evidence.calculationSampleCount} · ${isKo ? '관측 n 해당 없음' : 'observation n not applicable'}`;
      document.getElementById('cosmicPlannerLimits').textContent = isKo
        ? '제한된 기하 후보 · 날씨·빛공해·현지 지평선·달·장비 미포함 · 성공률·안전·이동·조준 판정 아님 · JSON은 계획 데이터만 포함'
        : 'Limited geometry candidate · no weather, light pollution, local horizon, Moon, or equipment · not a success, safety, travel, or pointing claim · JSON contains plan data only';
    }
    document.getElementById('cosmicPlannerDownload').disabled = !this._offlinePlanManifest;
    this.renderObservationSession();
  },

  downloadObservationPlan() {
    if (!this._offlinePlanManifest || !this._observationPlan) return false;
    const blob = new Blob([`${JSON.stringify(this._offlinePlanManifest, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `aetherus-mars-plan-${this._observationPlan.revision}.json`;
    document.body.append(link);
    link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
    return true;
  },

  ensureObservationSessionUi() {
    const planner = document.getElementById('cosmicPlanner');
    if (!planner || document.getElementById('cosmicSession')) return;
    const section = document.createElement('section');
    section.id = 'cosmicSession';
    section.className = 'cosmic-session';
    section.setAttribute('aria-labelledby', 'cosmicSessionTitle');
    section.hidden = true;

    const header = document.createElement('header');
    const title = document.createElement('h5'); title.id = 'cosmicSessionTitle';
    const status = document.createElement('span'); status.id = 'cosmicSessionStatus';
    header.append(title, status);
    const context = document.createElement('p'); context.id = 'cosmicSessionContext';
    const history = document.createElement('ol'); history.id = 'cosmicSessionHistory';
    const evidence = document.createElement('p'); evidence.id = 'cosmicSessionEvidence';
    const limits = document.createElement('p'); limits.id = 'cosmicSessionLimits'; limits.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'cosmic-session-actions';
    ['Primary', 'Pause', 'Abort', 'Export'].forEach(name => {
      const button = document.createElement('button');
      button.id = `cosmicSession${name}`;
      button.type = 'button';
      actions.append(button);
    });
    section.append(header, context, history, evidence, limits, actions);
    planner.append(section);
  },

  sessionErrorText(code, isKo = ko()) {
    const messages = {
      SESSION_INDEXEDDB_UNAVAILABLE: ['이 브라우저는 기기 로컬 세션 저장을 지원하지 않습니다.', 'This browser does not support device-local session storage.'],
      SESSION_STORAGE_PRESSURE: ['저장 공간이 부족해 전이를 기록하지 않았습니다. 기존 기록은 그대로입니다.', 'Storage is full; the transition was not written and existing records remain unchanged.'],
      SESSION_REVISION_CONFLICT: ['다른 탭에서 세션이 먼저 바뀌었습니다. 최신 체크포인트를 다시 읽었습니다.', 'Another tab changed the session first. The latest checkpoint was reloaded.'],
      SESSION_OWNER_CONFLICT: ['다른 기기 소유 분기와 충돌해 자동 병합하지 않았습니다.', 'A different device-owner branch conflicted; it was not auto-merged.'],
      SESSION_IDEMPOTENCY_CONFLICT: ['같은 명령 키에 다른 내용이 들어와 거부했습니다.', 'The same command key carried different content and was rejected.'],
      SESSION_DATABASE_UPGRADE_BLOCKED: ['다른 탭이 이전 저장소를 사용 중입니다. 그 탭을 닫고 다시 시도하세요.', 'Another tab is using the previous database. Close it and try again.'],
      SESSION_PLAN_CONTEXT_STALE: ['현재 위치·UTC와 세션 원본 계획이 달라 다음 단계로 진행하지 않았습니다.', 'The current location or UTC differs from the session plan, so it was not advanced.'],
    };
    return (messages[code] || [code || '세션 저장 실패', code || 'Session storage failed'])[isKo ? 0 : 1];
  },

  async ensureObservationSessionService() {
    this._sessionServicePromise = this._sessionServicePromise || openLocalObservationSessionService();
    const service = await this._sessionServicePromise;
    if (!this._sessionUnsubscribe) {
      this._sessionUnsubscribe = observeObservationSessionUpdates(message => {
        if (message.planRevision !== this._observationPlan?.revision) return;
        void this.restoreObservationSessionForPlan({ conflictNotice: false });
      });
    }
    return service;
  },

  async restoreObservationSessionForPlan({ conflictNotice = false } = {}) {
    this.ensureObservationSessionUi();
    const plan = this._observationPlan;
    const loadId = ++this._sessionLoadId;
    if (!plan) {
      this._observationSession = null;
      this.renderObservationSession();
      return false;
    }
    try {
      const service = await this.ensureObservationSessionService();
      const loaded = await service.findByPlanRevision(plan.revision);
      if (loadId !== this._sessionLoadId || this._observationPlan?.revision !== plan.revision) return false;
      this._observationSession = loaded.checkpoint;
      this._observationSessionRecovery = loaded.recovered ? 'REPLAYED_FROM_APPEND_LOG' : null;
      if (!conflictNotice) this._observationSessionError = null;
      this.renderObservationSession();
      return !!loaded.checkpoint;
    } catch (error) {
      if (loadId !== this._sessionLoadId) return false;
      this._observationSessionError = error?.code || error?.message || 'SESSION_STORAGE_FAILED';
      this.renderObservationSession();
      return false;
    }
  },

  sessionPrimaryCommand() {
    const state = this._observationSession?.state;
    if (!state || state === 'COMPLETED' || state === 'ABORTED') return 'START_SESSION';
    if (state === 'PREPARING') return 'MARK_PREPARED';
    if (state === 'ALIGNING') return 'MARK_ALIGNED';
    if (state === 'OBSERVING') return 'COMPLETE_SESSION';
    if (state === 'PAUSED') return 'RESUME_SESSION';
    return null;
  },

  async runObservationSessionCommand(type) {
    if (this._observationSessionBusy) return false;
    const plan = this._observationPlan;
    const current = this._observationSession;
    const starts = type === 'START_SESSION';
    if (!plan || (starts && (!this._offlinePlanManifest || this._observationPlanStatus !== 'CURRENT'))) return false;
    if (!starts && !current) return false;
    if (!starts && !['PAUSE_SESSION', 'ABORT_SESSION'].includes(type)
      && (this._observationPlanStatus !== 'CURRENT' || current.planRevision !== plan.revision)) {
      this._observationSessionError = 'SESSION_PLAN_CONTEXT_STALE';
      this.renderObservationSession();
      return false;
    }
    this._observationSessionBusy = true;
    this._observationSessionError = null;
    this.renderObservationSession();
    try {
      const service = await this.ensureObservationSessionService();
      const result = starts
        ? await service.start({ planManifest: this._offlinePlanManifest })
        : await service.dispatch({
          sessionId: current.sessionId,
          type,
          expectedRevision: current.revision,
        });
      this._observationSession = result.checkpoint;
      this._observationSessionRecovery = result.recoveredBeforeCommand ? 'REPLAYED_FROM_APPEND_LOG' : null;
      if (starts) {
        this._sessionShellStatus = 'WARMING';
        void cacheLoadedSessionShell().then(status => {
          this._sessionShellStatus = status.checksum
            ? `${status.status} · ${status.checksum} ${status.checksummed}/${status.requested}`
            : status.status;
          this.renderObservationSession();
        }).catch(() => {
          this._sessionShellStatus = 'PARTIAL';
          this.renderObservationSession();
        });
      }
      return true;
    } catch (error) {
      this._observationSessionError = error?.code || error?.message || 'SESSION_STORAGE_FAILED';
      if (this._observationSessionError === 'SESSION_REVISION_CONFLICT') {
        await this.restoreObservationSessionForPlan({ conflictNotice: true });
        this._observationSessionError = 'SESSION_REVISION_CONFLICT';
      }
      return false;
    } finally {
      this._observationSessionBusy = false;
      this.renderObservationSession();
    }
  },

  async runObservationSessionPrimary() {
    const command = this.sessionPrimaryCommand();
    return command ? this.runObservationSessionCommand(command) : false;
  },

  renderObservationSession() {
    const section = document.getElementById('cosmicSession');
    if (!section) return;
    const plan = this._observationPlan;
    if (!plan) { section.hidden = true; return; }
    section.hidden = false;
    const isKo = ko();
    const session = this._observationSession;
    const currentPlan = this._observationPlanStatus === 'CURRENT';
    const planMatches = !session || session.planRevision === plan.revision;
    const primaryCommand = this.sessionPrimaryCommand();
    const state = session?.state || (currentPlan ? 'LOCAL_READY' : 'PLAN_STALE');
    section.dataset.state = state.toLowerCase().replace(/_/g, '-');
    document.getElementById('cosmicSessionTitle').textContent = isKo ? '이 기기의 관측 세션' : 'Observation session on this device';
    document.getElementById('cosmicSessionStatus').textContent = state.replace(/_/g, ' ');
    document.getElementById('cosmicSessionContext').textContent = session
      ? `${isKo ? '로컬 체크포인트' : 'Local checkpoint'} · ${session.sessionId} · ${session.executionMode}`
      : (isKo
        ? '현재 계획을 이 기기의 append-only 기록으로 시작할 수 있습니다.'
        : 'The current plan can start as an append-only record on this device.');

    const history = document.getElementById('cosmicSessionHistory');
    history.replaceChildren();
    if (session?.history?.length) {
      session.history.slice(-4).forEach(item => {
        const row = document.createElement('li');
        row.textContent = `${item.from} → ${item.to}`;
        const note = document.createElement('small');
        note.textContent = `rev ${item.revision} · ${plannerUtc(item.occurredAtUtc)} · ${item.checkpointId}`;
        row.append(note); history.append(row);
      });
    } else {
      const row = document.createElement('li');
      row.textContent = isKo ? '아직 저장된 세션 전이가 없습니다.' : 'No session transition has been stored yet.';
      history.append(row);
    }

    const evidenceParts = [`plan ${plan.revision}`];
    if (session) evidenceParts.push(`checkpoint rev ${session.revision}`, session.checkpointId);
    if (this._observationSessionRecovery) evidenceParts.push(this._observationSessionRecovery);
    if (this._sessionShellStatus) evidenceParts.push(`offline shell ${this._sessionShellStatus}`);
    document.getElementById('cosmicSessionEvidence').textContent = evidenceParts.join(' · ');
    const baseLimit = isKo
      ? 'LOCAL ONLY · 서버 upload/pull 미구현 · 자동 병합 없음 · 기기 기록 시각은 관측 증거 n이 아님 · 장비 명령 없음'
      : 'LOCAL ONLY · server upload/pull not implemented · no automatic merge · device action times are not observation evidence n · no device command';
    const errorText = this._observationSessionError
      ? ` · ${this.sessionErrorText(this._observationSessionError, isKo)}` : '';
    document.getElementById('cosmicSessionLimits').textContent = `${baseLimit}${errorText}`;

    const primary = document.getElementById('cosmicSessionPrimary');
    const pause = document.getElementById('cosmicSessionPause');
    const abort = document.getElementById('cosmicSessionAbort');
    const exportButton = document.getElementById('cosmicSessionExport');
    const labels = {
      START_SESSION: isKo ? (session ? '새 로컬 세션 시작' : '이 기기에서 세션 시작') : (session ? 'Start a new local session' : 'Start session on this device'),
      MARK_PREPARED: isKo ? '준비 확인 · 정렬 단계로' : 'Confirm preparation · align',
      MARK_ALIGNED: isKo ? '정렬 확인 · 관측 기록 단계로' : 'Confirm alignment · observe',
      COMPLETE_SESSION: isKo ? '세션 완료 기록' : 'Record session complete',
      RESUME_SESSION: isKo ? '로컬 체크포인트 이어가기' : 'Resume local checkpoint',
    };
    primary.textContent = labels[primaryCommand] || (isKo ? '전이 불가' : 'Transition unavailable');
    pause.textContent = isKo ? '일시중지 기록' : 'Record pause';
    abort.textContent = isKo ? '중단 기록' : 'Record abort';
    exportButton.textContent = isKo ? '세션 JSON 저장' : 'Save session JSON';
    const terminal = session && ['COMPLETED', 'ABORTED'].includes(session.state);
    const primaryNeedsCurrent = !['PAUSE_SESSION', 'ABORT_SESSION'].includes(primaryCommand);
    primary.hidden = !primaryCommand;
    primary.disabled = this._observationSessionBusy || (primaryNeedsCurrent && (!currentPlan || !planMatches));
    pause.hidden = !session || !['PREPARING', 'ALIGNING', 'OBSERVING'].includes(session.state);
    pause.disabled = this._observationSessionBusy;
    abort.hidden = !session || terminal;
    abort.disabled = this._observationSessionBusy;
    exportButton.hidden = !session;
    exportButton.disabled = this._observationSessionBusy;
  },

  async exportObservationSession() {
    const session = this._observationSession;
    if (!session) return false;
    try {
      const service = await this.ensureObservationSessionService();
      const exported = await service.exportSession(session.sessionId);
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href; link.download = `aetherus-session-${session.sessionId}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
      return true;
    } catch (error) {
      this._observationSessionError = error?.code || error?.message || 'SESSION_EXPORT_FAILED';
      this.renderObservationSession();
      return false;
    }
  },

  skyARProbeEnabled() {
    // 실기기 iOS/Android와 30분 thermal gate 전에는 공개 기능으로 보이지 않는다.
    // HTTPS 기기 검수는 기존 운영자의 #dev 진입 규칙 안에서만 수행한다.
    return window.location.hash === '#dev';
  },

  ensureSkyARProbeUi() {
    if (!this.skyARProbeEnabled() || document.getElementById('cosmicSkyAR')) return;
    const actions = document.querySelector('.cosmic-astronomy-actions');
    if (!actions || !this.root) return;
    const open = document.createElement('button');
    open.id = 'cosmicSkyAROpen'; open.type = 'button'; open.className = 'cosmic-sky-ar-open';
    actions.append(open);

    const section = document.createElement('section');
    section.id = 'cosmicSkyAR'; section.className = 'cosmic-sky-ar';
    section.hidden = true; section.setAttribute('aria-labelledby', 'cosmicSkyARTitle');
    section.innerHTML = `
      <video id="cosmicSkyARVideo" autoplay muted playsinline aria-label="Sky AR 기기 카메라 미리보기"></video>
      <div id="cosmicSkyARStage" class="cosmic-sky-ar-stage" aria-hidden="true">
        <i class="cosmic-sky-ar-crosshair"></i>
        <i id="cosmicSkyARTarget" class="cosmic-sky-ar-target" hidden><b></b></i>
      </div>
      <div class="cosmic-sky-ar-panel">
        <header><div><small>DEVICE PROBE · #dev</small><h3 id="cosmicSkyARTitle"></h3></div><span id="cosmicSkyARStatus"></span></header>
        <p id="cosmicSkyARContext"></p>
        <dl id="cosmicSkyARFacts"></dl>
        <p id="cosmicSkyAREvidence"></p>
        <p id="cosmicSkyARLimits" role="status"></p>
        <div class="cosmic-sky-ar-actions">
          <button id="cosmicSkyARLocation" type="button"></button>
          <button id="cosmicSkyARStart" type="button"></button>
          <button id="cosmicSkyARCalibrate" type="button"></button>
          <button id="cosmicSkyARStop" type="button"></button>
          <button id="cosmicSkyARClose" type="button"></button>
        </div>
      </div>`;
    this.root.append(section);
  },

  loadSkyARModule() {
    this._skyARModulePromise = this._skyARModulePromise
      || import('./sky-ar.js?v=20260812-skyar1');
    return this._skyARModulePromise;
  },

  async openSkyARProbe() {
    this.ensureSkyARProbeUi();
    const section = document.getElementById('cosmicSkyAR');
    if (!section || this._detailBody?.id !== 'mars') return false;
    this._skyAROpen = true;
    this._skyARState = 'NOT_STARTED';
    this._skyARError = null;
    section.hidden = false;
    this.root.classList.add('is-sky-ar');
    document.body.classList.add('aetherus-sky-ar-open');
    try {
      const module = await this.loadSkyARModule();
      this._skyARTracker = this._skyARTracker || module.createSkyARPoseTracker();
      this._skyARCalibration = this._skyARCalibration || module.createSkyARCalibrationSession();
      this._skyARRuntime = this._skyARRuntime || module.createBrowserSkyARRuntime();
    } catch (error) {
      this._skyARState = 'BLOCKED';
      this._skyARError = error?.message || 'SKY_AR_MODULE_LOAD_FAILED';
    }
    this.renderSkyARProbe();
    return true;
  },

  async useSkyARLocation() {
    await this.useAstronomyLocation();
    if (this._skyAROpen) this.renderSkyARProbe();
  },

  async startSkyARProbe() {
    if (!this._skyAROpen || this._detailBody?.id !== 'mars') return false;
    if (this._astronomyObserver?.source !== 'device') {
      this._skyARError = 'SKY_AR_DEVICE_LOCATION_REQUIRED';
      this._skyARState = 'BLOCKED';
      this.renderSkyARProbe();
      return false;
    }
    const module = await this.loadSkyARModule();
    if (!this._skyAROpen || this._detailBody?.id !== 'mars') return false;
    this._skyARTracker = this._skyARTracker || module.createSkyARPoseTracker();
    this._skyARCalibration = this._skyARCalibration || module.createSkyARCalibrationSession();
    this._skyARRuntime = this._skyARRuntime || module.createBrowserSkyARRuntime();
    this._skyARTracker.clear();
    this._skyARCalibration.reset();
    this._skyARError = null;
    this._skyARState = 'REQUESTING_PERMISSION';
    this._astronomyAt = astronomyNow();
    this.calculateAstronomy();
    this.showAstronomy(this._detailBody);
    this.renderSkyARProbe();
    const video = document.getElementById('cosmicSkyARVideo');
    const result = await this._skyARRuntime.start({
      video,
      onSample: sample => {
        try {
          this._skyARTracker.push(sample);
          if (this._skyARState === 'ACTIVE') this._skyARState = 'CALIBRATION_REQUIRED';
          this.updateSkyARProjection();
          this.renderSkyARProbe();
        } catch (error) {
          this._skyARError = error?.message || 'SKY_AR_POSE_REJECTED';
          this.renderSkyARProbe();
        }
      },
      onState: event => {
        this._skyARState = event.state;
        this._skyARError = event.reason || null;
        if (event.camera) this._skyARCamera = event.camera;
        if (event.state !== 'ACTIVE') {
          this._skyARCamera = null;
          this._skyARProjection = null;
        }
        this.renderSkyARProbe();
      },
    });
    if (result.reason === 'START_CANCELLED' || !this._skyAROpen) return false;
    if (result.status !== 'ACTIVE') {
      this._skyARState = 'BLOCKED';
      this._skyARError = result.reason;
      this.renderSkyARProbe();
      return false;
    }
    this._skyARCamera = result.camera;
    this._skyARState = 'ACTIVE';
    this.renderSkyARProbe();
    return true;
  },

  calibrateSkyARProbe() {
    const raw = this._skyARTracker?.latest();
    if (!raw || !this._skyARCalibration) return false;
    try {
      this._skyARCalibration.start();
      this._skyARCalibration.lockManualNorthHorizon(raw);
      this._skyARState = 'CALIBRATED_LOW_CONFIDENCE';
      this._skyARError = null;
      this.updateSkyARProjection();
      this.renderSkyARProbe();
      return true;
    } catch (error) {
      this._skyARError = error?.message || 'SKY_AR_CALIBRATION_FAILED';
      this._skyARState = 'BLOCKED';
      this.renderSkyARProbe();
      return false;
    }
  },

  updateSkyARProjection() {
    if (!this._skyARTracker || !this._astronomyObservation || !this._skyARModulePromise) return;
    const runtime = this._skyARRuntime?.diagnostics();
    const targetTime = Date.parse(this._astronomyObservation.time.utc);
    const profile = this._skyARCalibration?.profile || null;
    this._skyARSnapshot = this._skyARTracker.snapshot({
      calibrationProfile: profile,
      cameraActive: runtime?.state === 'ACTIVE',
      targetAgeMs: Math.abs(Date.now() - targetTime),
      locationAccuracyM: this._astronomyObserver?.accuracyM,
      intrinsics: { source: 'FALLBACK_UNVERIFIED', horizontalFovDeg: 60 },
    });
    const pose = this._skyARSnapshot.latest;
    const stage = document.getElementById('cosmicSkyARStage');
    const horizontal = this._astronomyObservation.coordinates.horizontal;
    if (!pose || !stage) { this._skyARProjection = null; return; }
    const width = Math.max(1, stage.clientWidth || this.root?.clientWidth || window.innerWidth);
    const height = Math.max(1, stage.clientHeight || this.root?.clientHeight || window.innerHeight);
    void this._skyARModulePromise.then(module => {
      this._skyARProjection = module.projectHorizontalToScreen({
        targetAzimuthDeg: horizontal.azimuthDeg,
        targetAltitudeDeg: horizontal.altitudeDeg,
        poseAzimuthDeg: pose.azimuthDeg,
        poseAltitudeDeg: pose.altitudeDeg,
        rollDeg: pose.rollDeg,
        horizontalFovDeg: 60,
        width,
        height,
      });
      this.renderSkyARProbe();
    });
  },

  skyARErrorText(code, isKo = ko()) {
    const messages = {
      SKY_AR_DEVICE_LOCATION_REQUIRED: ['Sky AR를 열기 전에 이 기기의 위치를 별도로 허용해야 합니다.', 'Allow this device location separately before starting Sky AR.'],
      SECURE_CONTEXT_REQUIRED: ['HTTPS에서만 센서와 카메라를 요청할 수 있습니다.', 'Sensors and camera require HTTPS.'],
      ORIENTATION_SENSOR_UNAVAILABLE: ['이 브라우저에서 방향 센서를 사용할 수 없습니다.', 'Orientation sensors are unavailable in this browser.'],
      CAMERA_API_UNAVAILABLE: ['이 브라우저에서 카메라 API를 사용할 수 없습니다.', 'The camera API is unavailable in this browser.'],
      ORIENTATION_PERMISSION_DENIED: ['방향 센서 권한이 거부되었습니다. 자동으로 다시 묻지 않습니다.', 'Orientation permission was denied. It will not be requested again automatically.'],
      PERMISSION_DENIED: ['카메라 권한이 거부되었습니다. 자동으로 다시 묻지 않습니다.', 'Camera permission was denied. It will not be requested again automatically.'],
      CAMERA_NOT_FOUND: ['사용할 수 있는 카메라를 찾지 못했습니다.', 'No usable camera was found.'],
      CAMERA_NOT_READABLE: ['다른 앱 또는 기기 오류 때문에 카메라를 열지 못했습니다.', 'The camera could not be opened because of another app or device error.'],
      DOCUMENT_HIDDEN: ['화면이 숨겨져 센서와 카메라를 해제했습니다.', 'Sensors and camera were released when the page became hidden.'],
      USER_STOP: ['센서와 카메라를 해제했습니다.', 'Sensors and camera were released.'],
      START_CANCELLED: ['권한 요청을 취소하고 늦게 도착한 카메라 스트림도 해제했습니다.', 'The permission request was cancelled and any late camera stream was released.'],
    };
    return (messages[code] || [code || '', code || ''])[isKo ? 0 : 1];
  },

  renderSkyARProbe() {
    const open = document.getElementById('cosmicSkyAROpen');
    if (open) open.textContent = ko() ? 'Sky AR 기기 점검 · DEV' : 'Sky AR device probe · DEV';
    const section = document.getElementById('cosmicSkyAR');
    if (!section || !this._skyAROpen) return;
    const isKo = ko();
    const observation = this._astronomyObservation;
    const horizontal = observation?.coordinates?.horizontal;
    const runtime = this._skyARRuntime?.diagnostics?.() || null;
    const capabilities = this._skyARRuntime?.capabilityReport?.() || null;
    const snapshot = this._skyARSnapshot;
    const confidence = snapshot?.confidence || null;
    const pose = snapshot?.latest || null;
    const profile = this._skyARCalibration?.profile || null;
    const locationReady = this._astronomyObserver?.source === 'device';
    const active = runtime?.state === 'ACTIVE';

    document.getElementById('cosmicSkyARTitle').textContent = isKo ? '화성 Sky AR 코어' : 'Mars Sky AR core';
    const status = confidence?.level || this._skyARState;
    document.getElementById('cosmicSkyARStatus').textContent = status.replace(/_/g, ' ');
    section.dataset.state = String(status).toLowerCase().replace(/_/g, '-');
    document.getElementById('cosmicSkyARContext').textContent = locationReady && horizontal
      ? `${isKo ? '이 기기 위치' : 'Device location'} · UTC ${observation.time.utc} · Mars ${horizontal.azimuthDeg.toFixed(2)}° / ${signedDegrees(horizontal.altitudeDeg)}`
      : (isKo
        ? '위치·센서·카메라는 각각 버튼을 눌렀을 때만 요청합니다. 먼저 이 기기 위치가 필요합니다.'
        : 'Location, sensors, and camera are requested only after explicit button actions. Device location is required first.');

    const facts = document.getElementById('cosmicSkyARFacts'); facts.replaceChildren();
    const rows = [
      [isKo ? '기기 지원' : 'Device support', capabilities
        ? `HTTPS ${capabilities.secureContext ? 'YES' : 'NO'} · sensor ${capabilities.orientation ? 'YES' : 'NO'} · camera ${capabilities.camera ? 'YES' : 'NO'}` : 'CHECKING'],
      [isKo ? '자세' : 'Pose', pose
        ? `${pose.headingMode} · az ${pose.azimuthDeg.toFixed(1)}° · alt ${signedDegrees(pose.altitudeDeg)} · roll ${signedDegrees(pose.rollDeg)}` : (isKo ? '자료 없음' : 'No sample')],
      [isKo ? '안정성' : 'Stability', snapshot
        ? `buffer ${snapshot.bufferedSampleCount} · total ${snapshot.totalSamples} · jitter ${snapshot.jitterDeg == null ? 'n/a' : `${snapshot.jitterDeg.toFixed(2)}°`}` : 'n/a'],
      [isKo ? '보정' : 'Calibration', profile
        ? `${profile.state} · residual n/a · ${profile.precision}` : (isKo ? '미수행' : 'Not performed')],
      [isKo ? '방향 cue' : 'Guidance cue', confidence
        ? `${confidence.cueMode}${confidence.angularUncertaintyDeg ? ` · ±${confidence.angularUncertaintyDeg.toFixed(1)}°` : ''}` : 'HIDDEN'],
    ];
    rows.forEach(([term, value]) => {
      const dt = document.createElement('dt'); dt.textContent = term;
      const dd = document.createElement('dd'); dd.textContent = value;
      facts.append(dt, dd);
    });

    const evidence = runtime
      ? `listener ${runtime.listenerCount} · live track ${runtime.liveTrackCount} · accepted ${runtime.acceptedSampleCount} · dropped ${runtime.droppedSampleCount} · loop ${runtime.loopCount} · upload ${runtime.networkUploadCount}`
      : 'listener 0 · live track 0 · loop 0 · upload 0';
    document.getElementById('cosmicSkyAREvidence').textContent = evidence;
    const reasons = confidence?.reasons?.length ? ` · ${confidence.reasons.join(', ')}` : '';
    const error = this._skyARError ? ` · ${this.skyARErrorText(this._skyARError, isKo)}` : '';
    document.getElementById('cosmicSkyARLimits').textContent = (isKo
      ? `DEVICE PROBE · 실제 iOS/Android·30분 thermal 미검증 · 저신뢰 cue 숨김 · 수동 북쪽 보정은 자기편차·렌즈·별 잔차 미검증 · 날씨·현지 지평선·안전·망원경 조준 판정 아님${reasons}${error}`
      : `DEVICE PROBE · real iOS/Android and 30-minute thermal unverified · low-confidence cue hidden · manual north calibration has no declination, lens, or star residual verification · no weather, local horizon, safety, or telescope-pointing claim${reasons}${error}`);

    const marker = document.getElementById('cosmicSkyARTarget');
    const projection = this._skyARProjection;
    const showCue = confidence && confidence.cueMode !== 'HIDDEN' && projection?.visible;
    marker.hidden = !showCue;
    if (showCue) {
      marker.style.transform = `translate(${projection.x}px,${projection.y}px) translate(-50%,-50%)`;
      marker.style.setProperty('--sky-ar-uncertainty', `${Math.min(96, Math.max(48, (confidence.angularUncertaintyDeg || 8) * 4))}px`);
    }

    const location = document.getElementById('cosmicSkyARLocation');
    const start = document.getElementById('cosmicSkyARStart');
    const calibrate = document.getElementById('cosmicSkyARCalibrate');
    const stop = document.getElementById('cosmicSkyARStop');
    const close = document.getElementById('cosmicSkyARClose');
    location.textContent = isKo ? '1 · 이 기기 위치 허용' : '1 · Allow device location';
    start.textContent = isKo ? '2 · 센서·후면 카메라 요청' : '2 · Request sensors and rear camera';
    calibrate.textContent = isKo ? '북쪽·수평에 맞춘 뒤 저정밀 보정' : 'Aim north and level, then low-precision calibrate';
    stop.textContent = isKo ? '센서·카메라 해제' : 'Release sensors and camera';
    close.textContent = isKo ? 'DEV 점검 닫기' : 'Close DEV probe';
    location.hidden = locationReady;
    location.disabled = active || this._skyARState === 'REQUESTING_PERMISSION';
    start.hidden = active;
    start.disabled = !locationReady || this._skyARState === 'REQUESTING_PERMISSION';
    calibrate.hidden = !active;
    calibrate.disabled = !pose;
    stop.hidden = !active;
  },

  stopSkyARProbe(reason = 'USER_STOP') {
    const diagnostics = this._skyARRuntime?.stop?.(reason) || null;
    this._skyARState = 'STOPPED';
    this._skyARError = reason;
    this._skyARCamera = null;
    this._skyARProjection = null;
    this._skyARSnapshot = null;
    this.renderSkyARProbe();
    return diagnostics;
  },

  closeSkyARProbe({ hide = true } = {}) {
    const runtimeState = this._skyARRuntime?.diagnostics?.().state;
    if (runtimeState && !['IDLE', 'STOPPED', 'BLOCKED'].includes(runtimeState)) {
      this.stopSkyARProbe('START_CANCELLED');
    }
    this._skyAROpen = false;
    this._skyARProjection = null;
    this._skyARSnapshot = null;
    const section = document.getElementById('cosmicSkyAR');
    if (section && hide) section.hidden = true;
    this.root?.classList.remove('is-sky-ar');
    document.body.classList.remove('aetherus-sky-ar-open');
  },

  showAstronomy(body) {
    const section = document.getElementById('cosmicAstronomy');
    if (!section || !this.bodyInfo) return;
    const active = body?.id === 'mars';
    section.hidden = !active;
    const skyAROpen = document.getElementById('cosmicSkyAROpen');
    if (skyAROpen) skyAROpen.hidden = !active;
    if (!active && this._skyAROpen) this.closeSkyARProbe({ hide: true });
    this.bodyInfo.classList.toggle('has-astronomy', active);
    document.body.classList.toggle('aetherus-astronomy-open', active);
    if (!active) return;

    const isKo = ko();
    const observation = this._astronomyObservation;
    const coordinates = document.getElementById('cosmicAstronomyCoordinates');
    coordinates.replaceChildren();
    document.getElementById('cosmicAstronomyTitle').textContent = isKo ? '지금 하늘에서' : 'In the sky now';
    document.getElementById('cosmicAstronomyTier').textContent = 'EXPLORER';
    const source = document.getElementById('cosmicAstronomySource');
    source.textContent = isKo ? 'NASA/JPL 계산 근거' : 'NASA/JPL calculation basis';
    source.href = 'https://ssd.jpl.nasa.gov/planets/approx_pos.html';
    document.getElementById('cosmicAstronomyNow').textContent = isKo ? '지금 다시 계산' : 'Recalculate now';
    document.getElementById('cosmicAstronomyLocation').textContent = isKo
      ? '내 위치 사용 · URL에 약 1km 위치 포함'
      : 'Use my location · adds ~1 km location to URL';
    this.showObservationPlanner();

    if (!observation) {
      document.getElementById('cosmicAstronomyContext').textContent = isKo
        ? '관측 위치와 UTC를 확인하지 못했습니다.'
        : 'Observer location or UTC could not be validated.';
      document.getElementById('cosmicAstronomyHorizon').textContent = isKo
        ? '계산할 수 없음' : 'Calculation unavailable';
      document.getElementById('cosmicAstronomyLimit').textContent = this._astronomyError || 'ASTRONOMY_CALCULATION_FAILED';
      this.showObservationPlanner();
      return;
    }

    const observer = observation.observer;
    const observerName = observer.source === 'device'
      ? (isKo ? '내 위치(공유 좌표 약 1km)' : 'My location (~1 km shared coordinates)')
      : observer.source === 'shared'
        ? (isKo ? '공유된 관측 위치' : 'Shared observer location')
        : observer.name[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicAstronomyContext').textContent =
      `${observerName} · ${observer.lat.toFixed(observer.source === 'default' ? 4 : 2)}°, ${observer.lon.toFixed(observer.source === 'default' ? 4 : 2)}° · UTC ${observation.time.utc}`;
    const horizontal = observation.coordinates.horizontal;
    const rows = [
      [isKo ? '적경 RA · J2000' : 'RA · J2000', rightAscension(observation.coordinates.raDeg)],
      [isKo ? '적위 Dec · J2000' : 'Dec · J2000', signedDegrees(observation.coordinates.decDeg)],
      [isKo ? '고도 · 기하학적' : 'Altitude · geometric', signedDegrees(horizontal.altitudeDeg)],
      [isKo ? '방위각 · 북=0°' : 'Azimuth · north=0°', `${horizontal.azimuthDeg.toFixed(3)}°`],
      [isKo ? '지구와의 거리' : 'Distance from Earth', `${observation.coordinates.distanceAu.toFixed(6)} AU`],
    ];
    rows.forEach(([term, value]) => {
      const dt = document.createElement('dt'); dt.textContent = term;
      const dd = document.createElement('dd'); dd.textContent = value;
      coordinates.append(dt, dd);
    });
    document.getElementById('cosmicAstronomyHorizon').textContent = observation.horizon === 'above'
      ? (isKo ? '기하학적 지평선 위 · 관측 가능 판정은 아님' : 'Above geometric horizon · not an observability claim')
      : (isKo ? '기하학적 지평선 아래 · 현재 관측 가능 판정은 아님' : 'Below geometric horizon · not an observability claim');
    document.getElementById('cosmicAstronomyLimit').textContent = isKo
      ? '계산값 · n 해당 없음 · 대기굴절·시차·현지 지평선·주광·날씨 미포함 · 망원경 조준용 아님'
      : 'Calculated · n not applicable · no refraction, parallax, local horizon, daylight, or weather · not for telescope pointing';
    this.showObservationPlanner();
    this.renderSkyARProbe();
  },

  recalculateAstronomyNow() {
    if (this._detailBody?.id !== 'mars') return;
    this._astronomyAt = astronomyNow();
    this.calculateAstronomy();
    this.showAstronomy(this._detailBody);
    this.emitRouteState();
  },

  async useAstronomyLocation() {
    if (this._detailBody?.id !== 'mars') return;
    const button = document.getElementById('cosmicAstronomyLocation');
    if (button) button.disabled = true;
    try {
      const coords = await myLocation.locate(true);
      if (!coords) {
        this._astronomyError = myLocation.reason() || 'LOCATION_UNAVAILABLE';
        this._astronomyObservation = null;
        this.showAstronomy(this._detailBody);
        return;
      }
      this._astronomyObserver = {
        lat: Number(coords.lat.toFixed(2)),
        lon: Number(coords.lon.toFixed(2)),
        accuracyM: Number.isFinite(coords.acc) ? coords.acc : null,
        source: 'device',
        name: { ko: '내 위치', en: 'My location' },
      };
      this._astronomyAt = astronomyNow();
      this.calculateAstronomy();
      this.showAstronomy(this._detailBody);
      this.emitRouteState();
    } finally {
      if (button) button.disabled = false;
    }
  },

  clearAstronomy() {
    this._sessionLoadId += 1;
    this.closeSkyARProbe({ hide: true });
    this._astronomyObservation = null;
    this._astronomyObserver = null;
    this._astronomyAt = null;
    this._astronomyPrecision = null;
    this._astronomyError = null;
    this._observationPlan = null;
    this._observationPlanStatus = null;
    this._offlinePlanManifest = null;
    this._plannerError = null;
    this._observationSession = null;
    this._observationSessionError = null;
    this._observationSessionBusy = false;
    this._observationSessionRecovery = null;
    this._sessionShellStatus = null;
    this.bodyInfo?.classList.remove('has-astronomy');
    document.body.classList.remove('aetherus-astronomy-open');
    const section = document.getElementById('cosmicAstronomy');
    if (section) section.hidden = true;
    const planner = document.getElementById('cosmicPlanner');
    if (planner) planner.hidden = true;
    const session = document.getElementById('cosmicSession');
    if (session) session.hidden = true;
  },

  closeBody(render = true) {
    if (!this._detailBody) return;
    this._detailTextureLoadId += 1;
    this.clearAstronomy();
    this._detailBody = null; this.root.classList.remove('is-body');
    this.yaw = .72; this.pitch = .56;
    this.bodyDetailGroup.visible = false; this.bodyInfo.hidden = true;
    this.clearBodyVisual(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateHud();
    if (render) { this.render(); this.emitRouteState(); }
  },

  updateBodyPicker() {
    if (!this.bodyPicker) return;
    const visible = store.scene === 'space' && stageFor(this.level) === 'solar'
      && !this._photoMode && !this._solarMotionMode && !this._selectedCraft && (this._detailBody || this.level > .22);
    this.bodyPicker.hidden = !visible;
    this.bodyPicker.querySelectorAll('[data-body]').forEach(button => {
      button.classList.toggle('on', button.dataset.body === this._detailBody?.id);
    });
  },

  updateCraftPicker() {
    if (!this.craftPicker) return;
    const visible = !!this._craftCatalog && store.scene === 'space' && stageFor(this.level) === 'solar'
      && !this._photoMode && !this._solarMotionMode && !this._detailBody && this.level > .22;
    this.craftPicker.hidden = !visible;
    this.craftPicker.querySelectorAll('[data-craft]').forEach(button => {
      button.classList.toggle('on', button.dataset.craft === this._selectedCraft?.id);
    });
  },

  makePhotoAtlas() {
    this.photoGroup = new this.THREE.Group();
    this.photoGroup.visible = false;
    this.world.add(this.photoGroup);
  },

  loadPhotoCatalog(refresh = false) {
    if (refresh) this._photoCatalogPromise = null;
    if (this._photoCatalogPromise) return this._photoCatalogPromise;
    this._photoCatalogPromise = loadAetherusPhotoCatalog({ refresh })
      .then(document => {
        this._allPhotoItems = document.items;
        return document.items;
      })
      .catch(error => {
        this._photoCatalogPromise = null;
        throw error;
      });
    return this._photoCatalogPromise;
  },

  async openPhotoAtlas(telescope = 'ALL', photoId = null, { refresh = false } = {}) {
    const normalized = normalizeAetherusTelescope(telescope);
    try {
      // EARTHUS 검색에서 처음 우주로 넘어오는 경로는 sceneMgr.to()가 끝나도
      // 뒤의 catalogue 준비와 기본 animateTo가 남아 있을 수 있다. 그보다 먼저
      // 사진관을 열면 늦게 도착한 animateTo가 closePhotoAtlas()를 호출해 패널을 숨긴다.
      if (store.scene === 'space') await this._activationPromise;
      await this.ensureEngine();
      if (this._solarMotionMode) this.closeSolarMotion(false);
      if (this._detailBody) this.closeBody(false);
      if (this._selectedCraft) this.closeCraft(false);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._frame = 0; this.root.classList.remove('is-moving');
      this._photoMode = normalized;
      this._photoFov = 56;
      this.root.classList.add('is-photo');
      document.body.classList.add('aetherus-photo-open');
      this.photoInfo.hidden = false;

      const catalog = await this.loadPhotoCatalog(refresh);
      const items = filterAetherusPhotos(catalog, normalized);
      if (!items.length) throw new Error(`SPACE_PHOTOS_${normalized}_EMPTY`);
      const first = photoId ? resolveAetherusPhoto(items, photoId) : items[0];
      if (!first) throw new Error(`SPACE_PHOTOS_${photoId}_UNKNOWN`);

      this.clearPhotoAtlas();
      this._photoMode = normalized;
      this._photoItems = items;
      this.photoInfo.classList.remove('has-error');
      const image = document.getElementById('cosmicPhotoImage');
      const imageStatus = document.getElementById('cosmicPhotoImageStatus');
      image.hidden = false; imageStatus.hidden = true;
      document.getElementById('cosmicPhotoRetry').hidden = true;
      document.getElementById('cosmicPhotoSource').hidden = false;
      this.renderPhotoFilters();
      this.buildPhotoList(items);
      this.photoGroup.visible = true;

      const T = this.THREE;
      items.forEach((photo, index) => {
        const ra = T.MathUtils.degToRad(photo.ra);
        const dec = T.MathUtils.degToRad(photo.dec);
        const radius = 88;
        const marker = new T.Mesh(
          new T.SphereGeometry(matchMedia('(max-width:560px)').matches ? 1.6 : 1.25, 10, 8),
          // 망원경을 색으로 분류하지 않는다. 실제 사진이 주인공이고 표식은 위치 보조다.
          new T.MeshBasicMaterial({ color: 0x8bd8ec }),
        );
        marker.position.set(
          Math.cos(dec) * Math.sin(ra) * radius,
          Math.sin(dec) * radius,
          Math.cos(dec) * Math.cos(ra) * radius,
        );
        marker.userData.photoId = photo.id;
        this.photoGroup.add(marker);
        this._photoMarkers.set(photo.id, { object: marker, photo, index });
      });
      this.focusPhoto(first);
      this.selectPhoto(first);
      this.updateHud(); this.updateCraftPicker(); this.render();
      return true;
    } catch (error) {
      console.warn('[cosmic-photos]', error.message);
      this.showPhotoError(normalized);
      return false;
    }
  },

  renderPhotoFilters() {
    const counts = aetherusPhotoCounts(this._allPhotoItems || []);
    const isKo = ko();
    const labels = isKo
      ? { ALL: '전체', HST: '허블', JWST: '제임스웹' }
      : { ALL: 'All', HST: 'Hubble', JWST: 'James Webb' };
    const filters = document.getElementById('cosmicPhotoFilters');
    filters?.setAttribute('aria-label', isKo ? '망원경 필터' : 'Telescope filter');
    filters?.querySelectorAll('[data-telescope]').forEach(button => {
      const id = button.dataset.telescope;
      const active = id === this._photoMode;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', String(active));
      button.innerHTML = `${labels[id]} <span>${counts[id] || 0}</span>`;
    });
  },

  buildPhotoList(items) {
    const list = document.getElementById('cosmicPhotoList');
    if (!list) return;
    const isKo = ko();
    list.setAttribute('aria-label', isKo ? '우주 사진 목록' : 'Space image list');
    list.replaceChildren(...items.map(photo => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.photoId = photo.id;
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
      const image = document.createElement('img');
      image.src = `/${photo.thumb}`; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      const text = document.createElement('span');
      const title = document.createElement('b'); title.textContent = photo.name[isKo ? 'ko' : 'en'];
      const meta = document.createElement('small'); meta.textContent = `${photo.telescope} · ${photo.date}`;
      text.append(title, meta); button.append(image, text);
      button.addEventListener('click', () => { this.focusPhoto(photo); this.selectPhoto(photo); });
      return button;
    }));
  },

  focusPhoto(photo) {
    if (!photo || !this.THREE) return;
    this.yaw = this.THREE.MathUtils.degToRad(photo.ra);
    this.pitch = clamp(this.THREE.MathUtils.degToRad(photo.dec), -1.35, 1.35);
  },

  showPhotoError(telescope) {
    this.clearPhotoAtlas();
    this._photoMode = telescope;
    this._photoItems = [];
    this.root.classList.add('is-photo');
    document.body.classList.add('aetherus-photo-open');
    this.photoInfo.hidden = false; this.photoInfo.classList.add('has-error');
    this.photoGroup.visible = false;
    const isKo = ko();
    const image = document.getElementById('cosmicPhotoImage');
    image.removeAttribute('src'); image.hidden = true;
    const imageStatus = document.getElementById('cosmicPhotoImageStatus');
    imageStatus.hidden = false;
    imageStatus.textContent = isKo ? '사진 카탈로그를 표시할 수 없습니다.' : 'The image catalogue is unavailable.';
    document.getElementById('cosmicPhotoMeta').textContent = 'AETHERUS PHOTO CATALOG';
    document.getElementById('cosmicPhotoTitle').textContent = isKo ? '사진을 불러오지 못했습니다' : 'Could not load images';
    document.getElementById('cosmicPhotoCredit').textContent = isKo
      ? '네트워크 또는 데이터 계약을 확인한 뒤 다시 시도해 주세요.'
      : 'Check the network or data contract, then try again.';
    document.getElementById('cosmicPhotoLimit').textContent = isKo
      ? '검증되지 않은 사진은 대신 표시하지 않습니다.'
      : 'Unverified images are not substituted.';
    document.getElementById('cosmicPhotoSource').hidden = true;
    const retry = document.getElementById('cosmicPhotoRetry');
    retry.hidden = false; retry.textContent = isKo ? '다시 시도' : 'Try again';
    document.getElementById('cosmicPhotoList').replaceChildren();
    this.renderPhotoFilters(); this.updateHud(); this.render(); this.emitRouteState();
  },

  clearPhotoAtlas() {
    if (!this.photoGroup) return;
    while (this.photoGroup.children.length) {
      const object = this.photoGroup.children[this.photoGroup.children.length - 1];
      this.photoGroup.remove(object); object.geometry?.dispose?.(); object.material?.dispose?.();
    }
    this._photoMarkers.clear(); this._selectedPhoto = null;
  },

  selectPhoto(photo) {
    if (!photo) return;
    this._selectedPhoto = photo;
    this._photoMarkers.forEach(entry => entry.object.scale.setScalar(entry.photo.id === photo.id ? 1.75 : 1));
    const isKo = ko();
    const image = document.getElementById('cosmicPhotoImage');
    const imageStatus = document.getElementById('cosmicPhotoImageStatus');
    image.hidden = false; imageStatus.hidden = true;
    image.onload = () => { if (this._selectedPhoto?.id === photo.id) imageStatus.hidden = true; };
    image.onerror = () => {
      if (this._selectedPhoto?.id !== photo.id) return;
      image.hidden = true; imageStatus.hidden = false;
      imageStatus.textContent = isKo
        ? '미리보기 이미지를 불러오지 못했습니다. 공식 원본 링크를 이용해 주세요.'
        : 'Preview unavailable. Use the official original link.';
    };
    image.src = `/${photo.thumb}`;
    image.alt = `${photo.name[isKo ? 'ko' : 'en']} · ${photo.telescope}`;
    document.getElementById('cosmicPhotoMeta').textContent = `${photo.telescope} · ${photo.date} · ${isKo ? '공개일' : 'release date'}`;
    document.getElementById('cosmicPhotoTitle').textContent = photo.name[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicPhotoCredit').textContent = `${isKo ? '크레딧' : 'Credit'} · ${photo.credit}`;
    document.getElementById('cosmicPhotoLimit').textContent = isKo
      ? `${photo.license} · 표식은 지구에서 본 적경·적위 방향입니다. 거리는 같은 비율이 아닙니다.`
      : `${photo.license} · Marker uses right ascension and declination as seen from Earth; distance is not to scale.`;
    const source = document.getElementById('cosmicPhotoSource');
    source.hidden = false;
    source.href = photo.full; source.textContent = isKo ? '공식 원본·설명' : 'Official original & description';
    document.getElementById('cosmicPhotoBack').textContent = isKo ? '← 3D 우주' : '← 3D space';
    this.photoInfo.hidden = false;
    this.photoInfo.classList.remove('has-error');
    document.getElementById('cosmicPhotoRetry').hidden = true;
    document.getElementById('cosmicPhotoList')?.querySelectorAll('[data-photo-id]').forEach(button => {
      const active = button.dataset.photoId === photo.id;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', String(active));
    });
    this.render();
    this.emitRouteState();
  },

  closePhotoAtlas(render = true) {
    if (!this._photoMode) return;
    this._photoMode = null; this.root.classList.remove('is-photo');
    document.body.classList.remove('aetherus-photo-open');
    document.querySelectorAll('#scaleRail [data-aetherus-act]')
      .forEach(button => button.classList.remove('current'));
    this.photoGroup.visible = false; this.photoInfo.hidden = true;
    this.photoInfo.classList.remove('has-error');
    document.getElementById('cosmicPhotoImage').removeAttribute('src');
    document.getElementById('cosmicPhotoImage').hidden = false;
    document.getElementById('cosmicPhotoImageStatus').hidden = true;
    document.getElementById('cosmicPhotoRetry').hidden = true;
    document.getElementById('cosmicPhotoList').replaceChildren();
    this._photoItems = [];
    this.clearPhotoAtlas(); this.yaw = .72; this.pitch = .56;
    this.updateBodyPicker(); this.updateCraftPicker(); this.updateHud();
    if (render) { this.render(); this.emitRouteState(); }
  },

  bindInput() {
    scene.canvas.addEventListener('wheel', event => {
      if (store.scene !== 'earth' || event.deltaY <= 0 || cameraHeight() < ENTER_HEIGHT) return;
      event.preventDefault();
      this.level = .04; this.target = .13;
      sceneMgr.to('space', { stage: 'solar' }).then(() => this.animateTo(.22));
    }, { passive: false, capture: true });

    this.root.addEventListener('wheel', event => {
      if (store.scene !== 'space') return;
      event.preventDefault();
      if (this._solarMotionMode) {
        this._motionDistance = clamp(this._motionDistance + Math.sign(event.deltaY) * 7, 88, 230);
        this.render(); return;
      }
      if (this._photoMode) {
        this._photoFov = clamp(this._photoFov + Math.sign(event.deltaY) * 3, 34, 74);
        this.render(); return;
      }
      if (this._detailBody) {
        this._bodyDistance = clamp(this._bodyDistance + Math.sign(event.deltaY) * 3.8, 31, 150);
        this.render(); return;
      }
      if (event.deltaY < 0 && this.target <= .015) { this.exitToEarth(); return; }
      this.target = clamp(this.target + Math.sign(event.deltaY) * Math.min(.2, Math.abs(event.deltaY) / 760), 0, 3.15);
      this.syncStage(this.target); this.startMotion();
    }, { passive: false });

    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture?.(event.pointerId);
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this._pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      if (this._pointers.size === 2) this._pinchDistance = this.pointerDistance();
    });
    this.canvas.addEventListener('pointermove', event => {
      const previous = this._pointers.get(event.pointerId);
      if (!previous) return;
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._pointers.size === 2) {
        const distance = this.pointerDistance();
        if (this._pinchDistance) {
          if (this._solarMotionMode) {
            this._motionDistance = clamp(this._motionDistance * this._pinchDistance / Math.max(1, distance), 88, 230);
          } else if (this._photoMode) {
            this._photoFov = clamp(this._photoFov * this._pinchDistance / Math.max(1, distance), 34, 74);
          } else if (this._detailBody) {
            this._bodyDistance = clamp(this._bodyDistance * this._pinchDistance / Math.max(1, distance), 31, 150);
          } else {
            this.target = clamp(this.target + Math.log(this._pinchDistance / Math.max(1, distance)) * .78, 0, 3.15);
            this.level = mix(this.level, this.target, .38);
            this.syncStage(this.target);
          }
        }
        this._pinchDistance = distance;
      } else {
        this.yaw -= (event.clientX - previous.x) * .005;
        this.pitch = clamp(this.pitch + (event.clientY - previous.y) * .004,
          this._detailBody || this._photoMode || this._solarMotionMode ? -1.48 : .035, 1.48);
      }
      if (this._pointerStart && Math.hypot(event.clientX - this._pointerStart.x, event.clientY - this._pointerStart.y) > 5) {
        this._pointerStart.moved = true;
      }
      this.render();
    });
    const release = event => {
      const pick = event.type === 'pointerup' && this._pointerStart?.id === event.pointerId
        && !this._pointerStart.moved && this._pointers.size === 1;
      this._pointers.delete(event.pointerId);
      this._pinchDistance = this._pointers.size === 2 ? this.pointerDistance() : 0;
      if (pick) this.pickSolarBody(event);
      if (this._pointerStart?.id === event.pointerId) this._pointerStart = null;
      this.syncStage();
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('dblclick', () => {
      this.yaw = this._solarMotionMode ? .08 : .72;
      this.pitch = this._solarMotionMode ? .22 : .56;
      this.render();
    });
    this.canvas.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this._skyAROpen) { this.closeSkyARProbe({ hide: true }); return; }
      if (event.key === 'Escape' && this._photoMode) { this.closePhotoAtlas(); return; }
      if (event.key === 'Escape' && this._detailBody) { this.closeBody(); return; }
      if (event.key === 'Escape' && this._selectedCraft) { this.closeCraft(); return; }
      if (event.key === 'Escape' && this._solarMotionMode) { this.closeSolarMotion(); return; }
      if (event.key === '+' || event.key === '=') {
        if (this._photoMode) { this._photoFov = clamp(this._photoFov - 3, 34, 74); this.render(); }
        else if (this._detailBody) { this._bodyDistance = clamp(this._bodyDistance - 4, 31, 150); this.render(); }
        else if (this._solarMotionMode) { this._motionDistance = clamp(this._motionDistance - 7, 88, 230); this.render(); }
        else this.animateTo(this.target - .16);
      }
      if (event.key === '-' || event.key === '_') {
        if (this._photoMode) { this._photoFov = clamp(this._photoFov + 3, 34, 74); this.render(); }
        else if (this._detailBody) { this._bodyDistance = clamp(this._bodyDistance + 4, 31, 150); this.render(); }
        else if (this._solarMotionMode) { this._motionDistance = clamp(this._motionDistance + 7, 88, 230); this.render(); }
        else this.animateTo(this.target + .16);
      }
      if (event.key === 'ArrowLeft') { this.yaw += .1; this.render(); }
      if (event.key === 'ArrowRight') { this.yaw -= .1; this.render(); }
      if (event.key === 'ArrowUp') { this.pitch = clamp(this.pitch + .08, this._detailBody || this._photoMode || this._solarMotionMode ? -1.48 : .035, 1.48); this.render(); }
      if (event.key === 'ArrowDown') { this.pitch = clamp(this.pitch - .08, this._detailBody || this._photoMode || this._solarMotionMode ? -1.48 : .035, 1.48); this.render(); }
    });
    document.getElementById('cosmicEarthReturn')?.addEventListener('click', () => this.exitToEarth());
    document.getElementById('cosmicBodyBack')?.addEventListener('click', () => this.closeBody());
    document.getElementById('cosmicAstronomyNow')?.addEventListener('click', () => this.recalculateAstronomyNow());
    document.getElementById('cosmicAstronomyLocation')?.addEventListener('click', () => this.useAstronomyLocation());
    document.getElementById('cosmicPlannerBuild')?.addEventListener('click', () => this.buildObservationPlan());
    document.getElementById('cosmicPlannerRebuild')?.addEventListener('click', () => this.buildObservationPlan());
    document.getElementById('cosmicPlannerDownload')?.addEventListener('click', () => this.downloadObservationPlan());
    document.getElementById('cosmicSessionPrimary')?.addEventListener('click', () => this.runObservationSessionPrimary());
    document.getElementById('cosmicSessionPause')?.addEventListener('click', () => this.runObservationSessionCommand('PAUSE_SESSION'));
    document.getElementById('cosmicSessionAbort')?.addEventListener('click', () => this.runObservationSessionCommand('ABORT_SESSION'));
    document.getElementById('cosmicSessionExport')?.addEventListener('click', () => this.exportObservationSession());
    document.getElementById('cosmicSkyAROpen')?.addEventListener('click', () => this.openSkyARProbe());
    document.getElementById('cosmicSkyARLocation')?.addEventListener('click', () => this.useSkyARLocation());
    document.getElementById('cosmicSkyARStart')?.addEventListener('click', () => this.startSkyARProbe());
    document.getElementById('cosmicSkyARCalibrate')?.addEventListener('click', () => this.calibrateSkyARProbe());
    document.getElementById('cosmicSkyARStop')?.addEventListener('click', () => this.stopSkyARProbe());
    document.getElementById('cosmicSkyARClose')?.addEventListener('click', () => this.closeSkyARProbe({ hide: true }));
    document.getElementById('cosmicPhotoBack')?.addEventListener('click', () => this.closePhotoAtlas());
    document.getElementById('cosmicPhotoFilters')?.querySelectorAll('[data-telescope]').forEach(button => {
      button.addEventListener('click', () => this.openPhotoAtlas(button.dataset.telescope));
    });
    document.getElementById('cosmicPhotoRetry')?.addEventListener('click', () => {
      this.openPhotoAtlas(this._photoMode || 'ALL', null, { refresh: true });
    });
    document.getElementById('cosmicCraftBack')?.addEventListener('click', () => this.closeCraft());
    document.getElementById('cosmicMotionOpen')?.addEventListener('click', () => this.openSolarMotion());
    document.getElementById('cosmicMotionBack')?.addEventListener('click', () => this.closeSolarMotion());
    document.getElementById('cosmicMotionReplay')?.addEventListener('click', () => this.replaySolarMotion());
    document.getElementById('cosmicGalaxyGuideClose')?.addEventListener('click', () => this.closeGalaxyGuide());
  },

  pointerDistance() {
    const points = [...this._pointers.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  },

  pickSolarBody(event) {
    if (this._photoMode) { this.pickPhoto(event); return; }
    if (!this._ready || this._detailBody || this._solarMotionMode) return;
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new this.THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new this.THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
    if (stageFor(this.level) === 'milkyway') {
      const markerHit = raycaster.intersectObject(this.solarMarker, false)[0];
      if (markerHit) this.openSolarMotion();
      return;
    }
    if (stageFor(this.level) !== 'solar' || this.level < .22) return;
    const craftHit = raycaster.intersectObjects([...this._craftMarkers.values()].map(entry => entry.object), false)[0];
    if (craftHit?.object?.userData?.craftId) { this.selectCraft(craftHit.object.userData.craftId); return; }
    const hit = raycaster.intersectObjects([this.sun, ...Object.values(this.planetMeshes)], false)[0];
    if (!hit?.object?.userData?.id) return;
    if (hit.object.userData.id === 'earth') this.exitToEarth();
    else this.selectBody(hit.object.userData.id);
  },

  pickPhoto(event) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new this.THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new this.THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObjects(this.photoGroup.children, false)[0];
    const entry = hit ? this._photoMarkers.get(hit.object.userData.photoId) : null;
    if (entry) this.selectPhoto(entry.photo);
  },

  animateTo(next) {
    if (this._galaxyGuideMode && Math.abs(next - TARGET.milkyway) > .01) this.closeGalaxyGuide(false);
    if (this._solarMotionMode) this.closeSolarMotion(false);
    if (this._photoMode) this.closePhotoAtlas(false);
    if (this._detailBody) this.closeBody(false);
    if (this._selectedCraft) this.closeCraft(false);
    this.target = clamp(next, 0, 3.15);
    this.syncStage(this.target);
    this.startMotion();
  },

  startMotion() {
    if (this._frame) return;
    this.root.classList.add('is-moving');
    this._last = performance.now();
    const step = now => {
      if (now - this._last < COSMIC_FRAME_MS) {
        this._frame = requestAnimationFrame(step);
        return;
      }
      const elapsed = Math.min(40, now - this._last); this._last = now;
      const amount = 1 - Math.pow(.002, elapsed / 1000);
      this.level = mix(this.level, this.target, amount);
      if (Math.abs(this.level - this.target) < .0015) this.level = this.target;
      this.render();
      if (this.level === this.target) {
        this._frame = 0;
        this.root.classList.remove('is-moving');
        this.syncStage();
        return;
      }
      this._frame = requestAnimationFrame(step);
    };
    this._frame = requestAnimationFrame(step);
  },

  syncStage(value = this.level) {
    const stage = stageFor(value);
    if (stage === this._stage && store.sceneStage === stage) return;
    this._stage = stage; this._internalStage = true;
    store.setScene('space', stage);
    this._internalStage = false; this.updateHud(); this.emitRouteState();
  },

  exitToEarth() {
    if (this._solarMotionMode) this.closeSolarMotion(false);
    if (this._photoMode) this.closePhotoAtlas(false);
    if (this._detailBody) this.closeBody(false);
    if (this._selectedCraft) this.closeCraft(false);
    this.target = 0; this.level = 0;
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = 0;
    this.root.classList.remove('is-moving');
    sceneMgr.to('earth', { stage: 'earth' }).then(() => {
      scene.requestRender();
      this.emitRouteState();
    });
  },

  resize() {
    if (!this._ready || this.root.hidden) return false;
    const rect = this.root.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this._width === width && this._height === height) return false;
    this._width = width; this._height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    return true;
  },

  render() {
    if (!this._ready || this.root.hidden) return;
    this._renderCount += 1;
    // #dev에서만 DOM에 계측값을 복사한다. 일반 이용자는 렌더마다 DOM을 건드리지 않는다.
    if (location.hash === '#dev') {
      const info = this.renderer.info;
      this.canvas.dataset.renderFrame = String(this._renderCount);
      this.canvas.dataset.geometries = String(info.memory.geometries);
      this.canvas.dataset.textures = String(info.memory.textures);
      this.canvas.dataset.drawCalls = String(info.render.calls);
      this.canvas.dataset.triangles = String(info.render.triangles);
      this.canvas.dataset.points = String(info.render.points);
    }
    this.resize();
    const T = this.THREE;
    const level = this.level;
    if (this._photoMode) {
      this.solarGroup.visible = false;
      this.galaxyGroup.visible = false;
      this.clusterGroup.visible = false;
      this.bodyDetailGroup.visible = false;
      this.solarMotionGroup.visible = false;
      this.photoGroup.visible = true;
      this.ambientLight.intensity = .52;
      if (this.camera.fov !== this._photoFov) {
        this.camera.fov = this._photoFov; this.camera.updateProjectionMatrix();
      }
      const cosPitch = Math.cos(this.pitch);
      const direction = new T.Vector3(
        Math.sin(this.yaw) * cosPitch,
        Math.sin(this.pitch),
        Math.cos(this.yaw) * cosPitch,
      );
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(direction.multiplyScalar(10));
      this.background.position.set(0, 0, 0);
      this.renderer.render(this.world, this.camera);
      this.updateHud(); this.updateLabels(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateMotionControl();
      return;
    }
    this.photoGroup.visible = false;
    if (this.camera.fov !== 47) { this.camera.fov = 47; this.camera.updateProjectionMatrix(); }
    if (this._solarMotionMode) {
      this.solarGroup.visible = false;
      this.galaxyGroup.visible = true;
      this.clusterGroup.visible = false;
      this.bodyDetailGroup.visible = false;
      this.solarMotionGroup.visible = true;
      this.galaxyDustMaterial.opacity = .018;
      this.galaxyMaterialMain.opacity = .12;
      this.galaxyDiskMaterial.opacity = .025;
      this.galaxyLaneMaterial.opacity = .018;
      this.galaxyKnotMaterial.opacity = .045;
      this.galaxyBarMaterial.opacity = .055;
      this.galaxyCore.material.opacity = .045;
      this.solarMarker.material.opacity = 0;
      this.ambientLight.intensity = .5;
      const cosPitch = Math.cos(this.pitch);
      const direction = new T.Vector3(
        Math.sin(this.yaw) * cosPitch,
        Math.sin(this.pitch),
        Math.cos(this.yaw) * cosPitch,
      );
      this.camera.position.copy(direction).multiplyScalar(this._motionDistance);
      this.camera.lookAt(0, 0, 0);
      this.sunLight.position.copy(this.motionSun?.position || new T.Vector3());
      this.background.position.copy(this.camera.position).multiplyScalar(.08);
      this.renderer.render(this.world, this.camera);
      this.updateHud(); this.updateLabels(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateMotionControl();
      return;
    }
    this.solarMotionGroup.visible = false;
    this.galaxyGuideGroup.visible = this._galaxyGuideMode && stageFor(level) === 'milkyway';
    if (this._detailBody) {
      // 8K 원본을 가진 암석 행성은 데스크톱에서 충분히 확대했을 때만 한 장을 더 올린다.
      // 휴대폰에는 4K 한 장만 유지해 128MB급 GPU 텍스처와 발열을 피한다.
      this.maybeLoadUltraSurface();
      this.solarGroup.visible = false;
      this.galaxyGroup.visible = false;
      this.clusterGroup.visible = false;
      this.bodyDetailGroup.visible = true;
      const cosPitch = Math.cos(this.pitch);
      const direction = new T.Vector3(
        Math.sin(this.yaw) * cosPitch,
        Math.sin(this.pitch),
        Math.cos(this.yaw) * cosPitch,
      );
      this.camera.position.copy(direction).multiplyScalar(this._bodyDistance);
      this.camera.lookAt(0, 0, 0);
      this.ambientLight.intensity = this._detailBody.id === 'uranus' ? .28 : .62;
      this.sunLight.position.set(44, 26, 58);
      this.background.position.copy(this.camera.position).multiplyScalar(.08);
      this.renderer.render(this.world, this.camera);
      this.updateHud(); this.updateLabels(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateMotionControl();
      return;
    }
    this.bodyDetailGroup.visible = false;
    this.ambientLight.intensity = .38;
    const reframe = smooth(.88, 1.42, level);
    this.solarGroup.position.set(SOLAR_MARKER.x * reframe, SOLAR_MARKER.y * reframe, SOLAR_MARKER.z * reframe);
    const solarScale = mix(1, .018, reframe);
    this.solarGroup.scale.setScalar(solarScale);
    const solarOpacity = 1 - smooth(1.26, 1.56, level);
    this.solarGroup.visible = solarOpacity > .005;
    this.solarGroup.traverse(object => {
      if (!object.material || object === this.sunGlow) return;
      object.material.transparent = solarOpacity < .999 || object.material.transparent;
      if (!object.userData.baseOpacity) object.userData.baseOpacity = object.material.opacity ?? 1;
      object.material.opacity = object.userData.baseOpacity * solarOpacity;
    });
    this.sunGlow.material.opacity = .75 * solarOpacity;

    const galaxyOpacity = smooth(.84, 1.25, level);
    this.galaxyGroup.visible = galaxyOpacity > .005;
    this.galaxyDustMaterial.opacity = galaxyOpacity * .028;
    this.galaxyMaterialMain.opacity = galaxyOpacity * .5 * mix(1, .72, smooth(2.45, 3.05, level));
    this.galaxyDiskMaterial.opacity = galaxyOpacity * .1;
    this.galaxyLaneMaterial.opacity = galaxyOpacity * .16;
    this.galaxyKnotMaterial.opacity = galaxyOpacity * .78;
    this.galaxyBarMaterial.opacity = galaxyOpacity * .38;
    this.galaxyCore.material.opacity = .16 * galaxyOpacity;
    this.solarMarker.material.opacity = galaxyOpacity * (1 - smooth(2.45, 2.85, level));
    const clusterOpacity = smooth(2.02, 2.46, level);
    this.clusterGroup.visible = clusterOpacity > .005;
    this.clusterMaterial.opacity = clusterOpacity;

    const target = new T.Vector3();
    let distance;
    if (level < .92) {
      const earth = this.earthMesh.position.clone();
      target.copy(earth).multiplyScalar(1 - smooth(.08, .72, level));
      distance = mix(3.2, 92, smooth(.02, .92, level));
    } else if (level < 1.48) {
      target.set(SOLAR_MARKER.x * reframe, SOLAR_MARKER.y * reframe, SOLAR_MARKER.z * reframe);
      distance = mix(72, 96, smooth(.92, 1.48, level));
    } else if (level < 2.18) {
      const centerMove = smooth(1.48, 2.08, level);
      target.set(SOLAR_MARKER.x * (1 - centerMove), SOLAR_MARKER.y * (1 - centerMove), SOLAR_MARKER.z * (1 - centerMove));
      distance = mix(96, 154, smooth(1.48, 2.18, level));
    } else {
      distance = mix(165, 760, smooth(2.18, 3.15, level));
    }
    if (this._selectedCraft) {
      const entry = this._craftMarkers.get(this._selectedCraft.id);
      if (entry?.object) {
        if (this._selectedCraft.type === 'heliocentric-vector') {
          target.copy(entry.object.position).multiplyScalar(.42); distance = 88;
        } else {
          target.copy(this.earthMesh.position); distance = 40;
        }
      }
    }
    const cosPitch = Math.cos(this.pitch);
    const direction = new T.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.lookAt(target);
    this.sunLight.position.copy(this.solarGroup.position);
    this.background.position.copy(this.camera.position).multiplyScalar(.08);
    this.renderer.render(this.world, this.camera);
    this.updateHud(); this.updateLabels(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateMotionControl();
  },

  updateLabels() {
    if (!this._ready || !this.labels) return;
    const stage = stageFor(this.level);
    this.labels.querySelectorAll('[data-cosmic-label]').forEach(label => { label.hidden = true; });
    if (this._solarMotionMode) {
      this.placeLabel('motion-sun', this.motionSun, ko() ? '태양 · 함께 전진' : 'Sun · moving with us', -18, -18);
      ['earth', 'jupiter', 'neptune'].forEach((id, index) => {
        this.placeLabel(`motion-${id}`, this._motionPlanetMeshes.get(id), PLANETS[id][ko() ? 'ko' : 'en'], 5, (index - 1) * 9);
      });
      this.placeLabel('motion-direction', this.motionDirectionMarker,
        ko() ? '은하 중심 공전 방향을 직선으로 펼침' : 'Galactic orbit direction unfolded', -160, -22);
    } else if (this._photoMode) {
      const forward = new this.THREE.Vector3(); this.camera.getWorldDirection(forward);
      [...this._photoMarkers.values()]
        .map(entry => ({ entry, score: entry.object.position.clone().normalize().dot(forward) }))
        .filter(item => item.score > .94)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .forEach(({ entry }) => {
          const full = entry.photo.name[ko() ? 'ko' : 'en'];
          const text = full.length > 25 ? `${full.slice(0, 24)}…` : full;
          this.placeLabel(`sky-photo-${entry.photo.id}`, entry.object, text);
        });
    } else if (this._detailBody) {
      this._detailMarkers.forEach((entry, id) => {
        const name = entry.name[ko() ? 'ko' : 'en'];
        const suffix = entry.orbiter
          ? (ko() ? ' · 궤도 위치 도식' : ' · schematic orbit position')
          : entry.schematic ? (ko() ? ' · 위치 도식' : ' · schematic') : '';
        this.placeBodyLabel(id, entry.object, name + suffix);
      });
    } else if (stage === 'solar' && this.level > .24) {
      const offsets = {
        sun: [-24, -38], mercury: [-54, -32], venus: [-52, -6], earth: [22, -28],
        mars: [24, 10], jupiter: [8, -5], saturn: [8, 10], uranus: [8, -7], neptune: [8, 8],
      };
      SOLAR_LABEL_ORDER.forEach(id => this.placeLabel(
        id, id === 'sun' ? this.sun : this.planetMeshes[id], PLANETS[id][ko() ? 'ko' : 'en'],
        offsets[id][0], offsets[id][1],
      ));
      this._craftMarkers.forEach(entry => {
        if (this._selectedCraft && entry.craft.id !== this._selectedCraft.id) return;
        let text = entry.craft.shortName[ko() ? 'ko' : 'en'];
        if (entry.distanceAu) text += ` · ${entry.distanceAu.toFixed(1)} AU`;
        const offsets = {
          hubble: [-18, 18], jwst: [8, -18], 'voyager-1': [6, -10], 'voyager-2': [6, 12],
        }[entry.craft.id] || [0, 0];
        this.placeLabel(`craft-${entry.craft.id}`, entry.object, text, offsets[0], offsets[1]);
      });
      this.resolveSolarLabelCollisions();
    } else if (stage === 'milkyway') {
      if (this._galaxyGuideMode && this._galaxyGuideCatalog) {
        const language = ko() ? 'ko' : 'en';
        this._galaxyGuideCatalog.arms.forEach(arm => {
          this.placeGalaxyGuideLabel(`guide-${arm.id}`, this._galaxyGuideAnchors.get(arm.id), arm[language]);
        });
        this.placeGalaxyGuideLabel('guide-center', this._galaxyGuideAnchors.get('center'), ko() ? '은하 중심' : 'Galactic center', -34, -20);
        this.placeGalaxyGuideLabel('guide-sun', this.solarMarker,
          ko() ? `${this._galaxyGuideCatalog.orionSpur.ko} / 태양계` : `${this._galaxyGuideCatalog.orionSpur.en} / Solar System`, 8, -18);
        this.placeGalaxyGuideLabel('guide-sun-orbit', this._galaxyGuideAnchors.get('sun-orbit'),
          ko() ? '태양의 은하 공전 궤도' : "Sun's galactic orbit", -42, -14);
        this.placeGalaxyGuideLabel('guide-disk-edge', this._galaxyGuideAnchors.get('disk-edge'),
          ko() ? '반지름 약 50,000 광년' : 'Radius about 50,000 light-years', -58, 8);
        this.resolveGalaxyGuideLabelCollisions();
      } else this.placeLabel('solar-place', this.solarMarker, ko() ? '태양계는 여기' : 'Solar System');
    } else if (stage === 'galaxies') {
      this.placeLabel('milky-way', this.milkyWay, ko() ? '우리 은하' : 'Milky Way');
    }
  },

  placeBodyLabel(id, object, text) {
    if (!object) return;
    const point = new this.THREE.Vector3(); object.getWorldPosition(point);
    // 표면 법선과 카메라 방향의 내적이 음수면 천체 반대편이다. 이름이 구를 뚫고
    // 보이면 위치를 반대로 읽으므로 HTML 라벨도 구체와 똑같이 가린다.
    if (point.dot(this.camera.position) <= 0) {
      const old = this.labels.querySelector(`[data-cosmic-label="${id}"]`);
      if (old) old.hidden = true;
      return;
    }
    this.placeLabel(id, object, text);
  },

  placeLabel(id, object, text, offsetX = 0, offsetY = 0) {
    if (!object) return;
    let label = this.labels.querySelector(`[data-cosmic-label="${id}"]`);
    if (!label) {
      label = document.createElement('span'); label.dataset.cosmicLabel = id;
      this.labels.append(label);
    }
    const point = new this.THREE.Vector3(); object.getWorldPosition(point); point.project(this.camera);
    if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.12 || Math.abs(point.y) > 1.12) {
      label.hidden = true; return;
    }
    label.hidden = false; label.textContent = text;
    const rawX = (point.x * .5 + .5) * this._width + offsetX;
    const rawY = (-point.y * .5 + .5) * this._height + offsetY;
    const labelWidth = label.offsetWidth || 105;
    const x = clamp(rawX, 40, Math.max(40, this._width - labelWidth - 46));
    const y = clamp(rawY, this._detailBody ? 86 : 18, Math.max(86, this._height - 30));
    label.dataset.labelX = String(x); label.dataset.labelY = String(y);
    label.style.transform = `translate(${x}px,${y}px)`;
  },

  placeGalaxyGuideLabel(id, object, text, offsetX = 6, offsetY = -8) {
    this.placeLabel(id, object, text, offsetX, offsetY);
    const label = this.labels.querySelector(`[data-cosmic-label="${id}"]`);
    if (label) label.dataset.galaxyGuideLabel = 'true';
  },

  resolveGalaxyGuideLabelCollisions() {
    const ids = ['guide-center', 'guide-sun', 'guide-sun-orbit', 'guide-disk-edge', 'guide-perseus', 'guide-scutum-centaurus', 'guide-sagittarius', 'guide-norma'];
    const placed = [];
    ids.forEach(id => {
      const label = this.labels.querySelector(`[data-cosmic-label="${id}"]`);
      if (!label || label.hidden) return;
      const width = label.offsetWidth || 90; const height = label.offsetHeight || 18;
      const baseX = Number(label.dataset.labelX); const baseY = Number(label.dataset.labelY);
      const shifts = [[0,0],[0,-20],[0,20],[-46,0],[46,0],[-46,-20],[46,20]];
      const fit = shifts.map(([dx, dy]) => ({
        x: clamp(baseX + dx, 40, Math.max(40, this._width - width - 46)),
        y: clamp(baseY + dy, 76, Math.max(76, this._height - height - 112)),
      })).find(candidate => placed.every(box => (
        candidate.x + width + 7 < box.x || candidate.x > box.x + box.width + 7
        || candidate.y + height + 5 < box.y || candidate.y > box.y + box.height + 5
      )));
      if (!fit) { label.hidden = true; return; }
      label.style.transform = `translate(${fit.x}px,${fit.y}px)`;
      placed.push({ ...fit, width, height });
    });
  },

  resolveSolarLabelCollisions() {
    const priority = [
      'sun', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune',
      'craft-jwst', 'craft-hubble', 'craft-voyager-1', 'craft-voyager-2',
      'mars', 'venus', 'mercury',
    ];
    const shifts = [[0,0],[0,-18],[0,18],[-38,0],[38,0],[-38,-18],[38,18],[-38,18],[38,-18]];
    const placed = [];
    priority.forEach(id => {
      const label = this.labels.querySelector(`[data-cosmic-label="${id}"]`);
      if (!label || label.hidden) return;
      const baseX = Number(label.dataset.labelX); const baseY = Number(label.dataset.labelY);
      const width = label.offsetWidth || 48; const height = label.offsetHeight || 18;
      const fit = shifts.map(([dx, dy]) => ({
        x: clamp(baseX + dx, 40, Math.max(40, this._width - width - 46)),
        y: clamp(baseY + dy, 18, Math.max(18, this._height - height - 18)),
      })).find(candidate => placed.every(box => (
        candidate.x + width + 5 < box.x || candidate.x > box.x + box.width + 5
        || candidate.y + height + 4 < box.y || candidate.y > box.y + box.height + 4
      )));
      if (!fit) { label.hidden = true; return; }
      label.style.transform = `translate(${fit.x}px,${fit.y}px)`;
      placed.push({ ...fit, width, height });
    });
  },

  updateHud() {
    if (!this.root) return;
    const stage = stageFor(this.level);
    const isKo = ko();
    if (this._galaxyGuideMode) {
      document.getElementById('cosmicStage').textContent = isKo ? '우리은하 구조' : 'Milky Way structure';
      document.getElementById('cosmicScale').textContent = isKo
        ? '3D 나선팔 안내 · 드래그로 정면과 측면 비교'
        : '3D spiral-arm guide · drag between face-on and edge-on views';
      document.getElementById('cosmicHint').textContent = '';
      document.getElementById('cosmicNote').textContent = this._galaxyGuideCatalog?.limitations?.[isKo ? 'ko' : 'en'] || '';
      this.root.dataset.stage = 'galaxy-guide';
      return;
    }
    if (this._solarMotionMode) {
      document.getElementById('cosmicStage').textContent = isKo ? '앞으로 나아가는 태양계' : 'The Solar System in motion';
      document.getElementById('cosmicScale').textContent = isKo
        ? '1년 · 태양 약 48.6 AU 전진 · 행성 궤도 계산'
        : 'One year · Sun travels about 48.6 AU · calculated planet orbits';
      document.getElementById('cosmicHint').textContent = isKo
        ? '행성은 멈춘 원이 아니라 전진하는 태양과 함께 3D 궤적을 만듭니다'
        : 'Planets form 3D trails while moving with the Sun rather than orbiting a fixed point';
      document.getElementById('cosmicNote').textContent = this._motionCatalog?.limitations?.[isKo ? 'ko' : 'en'] || '';
      this.root.dataset.stage = 'solar-motion';
      return;
    }
    if (this._photoMode) {
      const telescope = this._photoMode === 'ALL'
        ? (isKo ? '전체' : 'All')
        : this._photoMode === 'JWST' ? (isKo ? '제임스웹' : 'James Webb') : (isKo ? '허블' : 'Hubble');
      document.getElementById('cosmicStage').textContent = `${isKo ? '우주 사진관' : 'Space photo gallery'} · ${telescope} · ${this._photoMarkers.size}`;
      document.getElementById('cosmicScale').textContent = isKo
        ? '공식 사진이 중심 · 3D 천구는 적경·적위 위치 보조'
        : 'Official images first · 3D sky is an RA/Dec position aid';
      document.getElementById('cosmicHint').textContent = isKo
        ? '전체·허블·제임스웹 필터와 아래 썸네일에서 사진을 고르세요'
        : 'Choose an image using the filters and thumbnail list';
      document.getElementById('cosmicNote').textContent = isKo
        ? '표식 거리는 같은 비율이 아님 · 날짜는 관측일이 아닌 공개일'
        : 'Marker distance is not to scale · dates are release dates, not observation times';
      this.root.dataset.stage = 'photo';
      return;
    }
    if (this._detailBody) {
      const body = this._detailBody;
      document.getElementById('cosmicStage').textContent = body.name[isKo ? 'ko' : 'en'];
      document.getElementById('cosmicScale').textContent = isKo
        ? '같은 3D 공간 · 드래그 회전 · 휠/핀치 확대'
        : 'Same 3D space · drag to rotate · wheel/pinch to zoom';
      document.getElementById('cosmicHint').textContent = body.summary[isKo ? 'ko' : 'en'];
      const surfaceNote = body.id === 'uranus'
        ? (isKo ? '가시광에서는 구름 대비가 낮아 거의 단색에 가깝습니다' : 'Cloud contrast is low in visible light, so Uranus appears nearly uniform')
        : '';
      document.getElementById('cosmicNote').textContent = isKo
        ? `${this._bodyCatalog.positionNotice.ko} · NASA/JPL/USGS·Solar System Scope 표면 시각화 · 분석용 아님`
        : `${this._bodyCatalog.positionNotice.en} · NASA/JPL/USGS and Solar System Scope visualization · not for analysis`;
      if (surfaceNote) document.getElementById('cosmicNote').textContent += ` · ${surfaceNote}`;
      this.root.dataset.stage = 'body';
      return;
    }
    if (this._selectedCraft) {
      const craft = this._selectedCraft;
      document.getElementById('cosmicStage').textContent = craft.shortName[isKo ? 'ko' : 'en'];
      document.getElementById('cosmicScale').textContent = isKo
        ? '같은 3D 태양계 · 실제 방향 · 거리 표현 방식 표시'
        : 'Same 3D Solar System · true direction · distance method stated';
      document.getElementById('cosmicHint').textContent = craft.method[isKo ? 'ko' : 'en'];
      document.getElementById('cosmicNote').textContent = this._craftCatalog.positionNotice[isKo ? 'ko' : 'en'];
      this.root.dataset.stage = 'craft';
      return;
    }
    const copy = {
      solar: {
        title: isKo ? '태양계' : 'Solar System',
        scale: isKo ? '3D 궤도 · 드래그하여 기울이기 · 로그 스케일' : '3D orbits · drag to tilt · logarithmic scale',
        hint: isKo ? '계속 줌아웃하면 은하수 안의 태양계 위치로 이어집니다' : 'Keep zooming out to reach the Solar System’s place in the Milky Way',
        note: isKo ? '행성 위치 계산값 · JPL 공개 궤도요소 · 출처 표기 표면 시각화 · 행성 크기 과장' : 'Calculated planet positions · JPL public elements · credited surface visualization · planet sizes exaggerated',
      },
      milkyway: {
        title: isKo ? '은하수' : 'Milky Way',
        scale: isKo ? '3D 별 입자 · 정면과 측면을 직접 회전 · 로그 스케일' : '3D star particles · rotate face-on to edge-on · logarithmic scale',
        hint: isKo ? '드래그해 원반의 두께를 보고, 더 줌아웃하면 다른 은하들이 나타납니다' : 'Drag to see the disk thickness; zoom out farther for other galaxies',
        note: isKo ? '우리 은하 외부 사진은 존재하지 않음 · 구조 이해를 위한 3D 도식' : 'No external photograph of our galaxy exists · 3D structural diagram',
      },
      galaxies: {
        title: isKo ? '은하들' : 'Galaxies',
        scale: isKo ? '3D 은하군 · 드래그하여 공간 배치 확인 · 로그 스케일' : '3D galaxy group · drag to inspect spatial depth · logarithmic scale',
        hint: isKo ? '줌인하면 같은 3D 경로를 따라 지구로 돌아갑니다' : 'Zoom in to follow the same 3D path back to Earth',
        note: isKo ? '상대 위치·크기는 단계 이해를 위한 도식 · 실제 은하 배치 아님' : 'Relative positions and sizes are schematic, not an observed galaxy map',
      },
    }[stage];
    document.getElementById('cosmicStage').textContent = copy.title;
    document.getElementById('cosmicScale').textContent = copy.scale;
    document.getElementById('cosmicHint').textContent = copy.hint;
    if (!this.root.classList.contains('is-loading') && !this.root.classList.contains('has-error')) {
      document.getElementById('cosmicNote').textContent = copy.note;
    }
    this.root.dataset.stage = stage;
  },
};

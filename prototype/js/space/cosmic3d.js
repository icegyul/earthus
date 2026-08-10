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
import { planetOrbit, planetPositions } from './kepler.js';

const IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const BODY_ORDER = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const SURFACE_IDS = [...IDS, 'moon'];
const PLANET_TEXTURE_ROOT = '/space/planets';
const PLANET_TEXTURE_VERSION = '20260810b';
const planetTextureUrl = path => `${PLANET_TEXTURE_ROOT}/${path}?v=${PLANET_TEXTURE_VERSION}`;
const PLANETS = {
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
const stageFor = level => level < 1.28 ? 'solar' : level < 2.28 ? 'milkyway' : 'galaxies';
const ko = () => i18n.lang !== 'en';

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
  _ready: false,
  _bodyCatalogPromise: null,
  _bodyCatalog: null,
  _detailBody: null,
  _detailTexture: null,
  _detailTextureLoadId: 0,
  _planetTexturePromise: null,
  _planetTextures: new Map(),
  _detailRing: null,
  _detailMarkers: new Map(),
  _pointerStart: null,
  _bodyDistance: 48,
  _photoCatalogPromise: null,
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
    if (!this.root || !this.canvas || !this.labels || !this.bodyPicker || !this.bodyInfo
      || !this.photoInfo || !this.craftPicker || !this.craftInfo || !this.motionOpen || !this.motionInfo) return this;
    this.root.closest('.space-scene')?.classList.add('cosmic-mode');
    document.getElementById('spaceSceneIntro')?.setAttribute('hidden', '');
    document.getElementById('solarExperience')?.setAttribute('hidden', '');
    this.buildBodyPicker();
    this.bindInput();
    new ResizeObserver(() => this.render()).observe(this.root);
    store.on('scene', (next, stage) => {
      const visible = next === 'space';
      this.root.hidden = !visible;
      if (!visible) {
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = 0; this.cancelSolarMotionReplay();
        this.root.classList.remove('is-moving', 'is-loading');
        // 지구로 돌아가기 버튼 외의 장면 전환도 숨은 3D 상태를 남기지 않는다.
        if (this._solarMotionMode) this.closeSolarMotion(false);
        if (this._photoMode) this.closePhotoAtlas(false);
        if (this._detailBody) this.closeBody(false);
        if (this._selectedCraft) this.closeCraft(false);
        return;
      }
      this.activate(stage);
    });
    i18n.onChange(() => {
      this.buildBodyPicker();
      if (this._detailBody) this.showBodyInfo(this._detailBody);
      if (this._selectedPhoto) this.selectPhoto(this._selectedPhoto);
      if (this._selectedCraft) this.showCraftInfo(this._selectedCraft);
      if (this._solarMotionMode) this.showSolarMotionInfo();
      this.buildCraftPicker();
      this.updateHud(); this.updateLabels(); this.render();
    });
    this.root.hidden = store.scene !== 'space';
    this.updateHud();
    if (store.scene === 'space') this.activate(store.sceneStage);
    return this;
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
    const scale = 1.12;
    this.planetMeshes = {};
    this.orbitMaterials = [];

    const sunMaterial = new T.MeshBasicMaterial({ color: 0xffca55 });
    this.sun = new T.Mesh(new T.SphereGeometry(1.65, 28, 18), sunMaterial);
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
      mesh.position.set(point.x * scale, point.z * scale, point.y * scale);
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
      const orbitGeometry = new T.BufferGeometry().setFromPoints(orbit.map(item => new T.Vector3(
        item.x * scale, item.z * scale, item.y * scale,
      )));
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
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      }, undefined, reject);
    });
  },

  loadPlanetTextures() {
    if (this._planetTexturePromise) return this._planetTexturePromise;
    const jobs = SURFACE_IDS.map(async id => {
      const texture = await this.loadSurfaceTexture(planetTextureUrl(`small/${id}.webp`));
      this._planetTextures.set(id, texture);
      const material = this.planetMeshes[id]?.material;
      if (!material) return;
      material.map = texture;
      material.emissiveMap = texture;
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
      .then(document => {
        if (!Array.isArray(document.items) || !document.positionNotice) {
          throw new Error('COSMIC_SPACECRAFT_SCHEMA');
        }
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
      this.spacecraftGroup.remove(object); object.geometry?.dispose?.(); object.material?.dispose?.();
    }
    this._craftMarkers.clear();
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
      const marker = new T.Mesh(
        new T.OctahedronGeometry(extra.radius || .58, 1),
        new T.MeshBasicMaterial({ color, transparent: true, opacity: .96 }),
      );
      marker.position.copy(position); marker.userData.craftId = craft.id;
      this.spacecraftGroup.add(marker);
      this._craftMarkers.set(craft.id, { object: marker, craft, ...extra });
    };

    this._craftCatalog.items.forEach(craft => {
      if (craft.type === 'earth-orbit-schematic') {
        const points = [];
        for (let index = 0; index <= 64; index += 1) {
          const angle = index / 64 * Math.PI * 2;
          points.push(earth.clone().addScaledVector(tangent, Math.cos(angle) * 2.8)
            .add(new T.Vector3(0, Math.sin(angle) * 1.22, 0)));
        }
        addPath(points, 0x8bd8ec, .42);
        addMarker(craft, points[9], 0x8bd8ec, { radius: .42 });
      } else if (craft.type === 'earth-l2-schematic') {
        const center = earth.clone().addScaledVector(outward, 5.1);
        addPath([earth, center], 0xbdaeff, .34, true);
        const points = [];
        for (let index = 0; index <= 64; index += 1) {
          const angle = index / 64 * Math.PI * 2;
          points.push(center.clone().addScaledVector(tangent, Math.cos(angle) * 1.28)
            .add(new T.Vector3(0, Math.sin(angle) * 1.82, 0)));
        }
        addPath(points, 0xbdaeff, .42);
        addMarker(craft, points[12], 0xbdaeff, { radius: .5 });
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
    if (render) this.render();
  },

  makeGalaxyGeometry(count, radius = 50) {
    const T = this.THREE;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new T.Color();
    for (let index = 0; index < count; index += 1) {
      const bulge = index < count * .17;
      let x, y, z, radial;
      if (bulge) {
        radial = Math.pow(hash(index + 31), 1.9) * radius * .34;
        const theta = hash(index + 41) * Math.PI * 2;
        const phi = Math.acos(2 * hash(index + 47) - 1);
        x = radial * Math.sin(phi) * Math.cos(theta);
        z = radial * Math.sin(phi) * Math.sin(theta);
        y = radial * Math.cos(phi) * .52;
      } else {
        radial = Math.pow(hash(index + 53), .68) * radius;
        const arm = index % 4;
        const scatter = normal(index + 61) * (.05 + radial / radius * .1);
        const angle = arm * Math.PI / 2 + radial * .235 + scatter;
        x = Math.cos(angle) * radial + normal(index + 71) * .48;
        z = Math.sin(angle) * radial + normal(index + 79) * .48;
        const thickness = mix(3.8, .45, radial / radius);
        y = normal(index + 83) * thickness;
      }
      positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z;
      const hot = !bulge && hash(index + 97) > .925;
      if (bulge) color.setRGB(1, .76 + hash(index) * .18, .48 + hash(index + 2) * .22);
      else if (hot) color.setRGB(1, .24 + hash(index) * .25, .48 + hash(index + 3) * .25);
      else color.setRGB(.48 + hash(index) * .34, .62 + hash(index + 5) * .28, .92 + hash(index + 7) * .08);
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
    this.galaxyDustMaterial = this.galaxyMaterial(4.2, 0);
    this.galaxyDust = new T.Points(geometry, this.galaxyDustMaterial);
    this.galaxyGroup.add(this.galaxyDust);
    this.galaxyMaterialMain = this.galaxyMaterial(.74, 0);
    this.milkyWay = new T.Points(geometry, this.galaxyMaterialMain);
    this.galaxyGroup.add(this.milkyWay);

    const coreMaterial = new T.SpriteMaterial({
      map: this.spriteTexture, color: 0xffc96f, transparent: true, opacity: .55,
      blending: T.AdditiveBlending, depthWrite: false,
    });
    this.galaxyCore = new T.Sprite(coreMaterial); this.galaxyCore.scale.set(22, 10, 1);
    this.galaxyGroup.add(this.galaxyCore);
    this.solarMarker = new T.Mesh(
      new T.SphereGeometry(.46, 12, 8),
      new T.MeshBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .95 }),
    );
    this.solarMarker.position.set(SOLAR_MARKER.x, SOLAR_MARKER.y, SOLAR_MARKER.z);
    this.galaxyGroup.add(this.solarMarker);
    this.world.add(this.galaxyGroup);
  },

  loadSolarMotionCatalog() {
    if (this._motionCatalogPromise) return this._motionCatalogPromise;
    this._motionCatalogPromise = fetch('/data/solar-motion.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`SOLAR_MOTION_${response.status}`);
        return response.json();
      })
      .then(document => {
        if (document.schema !== 'earthus.solar-motion.v1'
          || !Number.isFinite(document.displaySpanDays)
          || !Number.isFinite(document.galacticSpeedKph)
          || !Number.isFinite(document.distanceAu)
          || !document.sourceUrl || !document.limitations?.ko || !document.limitations?.en
          || !document.displayLimit?.ko || !document.displayLimit?.en) {
          throw new Error('SOLAR_MOTION_SCHEMA');
        }
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
      && !this._solarMotionMode && !this._photoMode && !this._detailBody && !this._selectedCraft;
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
      .then(document => {
        if (!Array.isArray(document.bodies)) throw new Error('CELESTIAL_BODIES_SCHEMA');
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
      new T.SphereGeometry(18, 56, 36),
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
      this._detailTexture.needsUpdate = true;
      this.bodySphere.material.map = this._detailTexture;
      this.bodySphere.material.emissiveMap = this._detailTexture;
      this.bodySphere.material.emissiveIntensity = body.id === 'uranus' ? 0 : .68;
      this.bodySphere.material.color.set(0xffffff);
      this.bodySphere.material.needsUpdate = true;
      if (location.hash === '#dev') this.canvas.dataset.surfaceQuality = previewTexture ? 'preview' : 'fallback';
      this.makeBodyRing(body);
      this.makeBodyAtmosphere(body);
      this.makeBodyMarkers(body);
      this.makeBodyOrbiters(body);
      this.showBodyInfo(body);
      this.updateBodyPicker(); this.updateCraftPicker();
      this.updateHud(); this.render();
      this.loadSurfaceTexture(planetTextureUrl(`detail/${body.id}.webp`)).then(texture => {
        if (loadId !== this._detailTextureLoadId || this._detailBody?.id !== body.id) {
          texture.dispose(); return;
        }
        this._detailTexture?.dispose();
        this._detailTexture = texture;
        this.bodySphere.material.map = texture;
        this.bodySphere.material.emissiveMap = texture;
        this.bodySphere.material.needsUpdate = true;
        if (location.hash === '#dev') this.canvas.dataset.surfaceQuality = 'detail';
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
    this._detailTexture = null; this._detailRing = null;
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
    if (body.id !== 'uranus') return;
    const T = this.THREE;
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
    this.bodyInfo.hidden = false;
  },

  closeBody(render = true) {
    if (!this._detailBody) return;
    this._detailTextureLoadId += 1;
    this._detailBody = null; this.root.classList.remove('is-body');
    this.yaw = .72; this.pitch = .56;
    this.bodyDetailGroup.visible = false; this.bodyInfo.hidden = true;
    this.clearBodyVisual(); this.updateBodyPicker(); this.updateCraftPicker(); this.updateHud();
    if (render) this.render();
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

  loadPhotoCatalog() {
    if (this._photoCatalogPromise) return this._photoCatalogPromise;
    this._photoCatalogPromise = fetch('/data/space-photos.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`SPACE_PHOTOS_${response.status}`);
        return response.json();
      })
      .then(document => {
        const items = Array.isArray(document.items) ? document.items : [];
        const valid = items.filter(item => Number.isFinite(item.ra) && Number.isFinite(item.dec)
          && item.credit && item.license && item.full && item.thumb);
        if (!valid.length) throw new Error('SPACE_PHOTOS_EMPTY');
        return valid;
      });
    return this._photoCatalogPromise;
  },

  async openPhotoAtlas(telescope) {
    try {
      await this.ensureEngine();
      const catalog = await this.loadPhotoCatalog();
      const items = catalog.filter(item => item.telescope === telescope);
      if (!items.length) throw new Error(`SPACE_PHOTOS_${telescope}_EMPTY`);
      if (this._solarMotionMode) this.closeSolarMotion(false);
      if (this._detailBody) this.closeBody(false);
      if (this._selectedCraft) this.closeCraft(false);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._frame = 0; this.root.classList.remove('is-moving');
      this.clearPhotoAtlas();
      this._photoMode = telescope;
      this._photoFov = 56;
      this.root.classList.add('is-photo');
      document.querySelectorAll('#scaleRail [data-aetherus-act]')
        .forEach(button => button.classList.toggle('current', button.dataset.aetherusAct === (telescope === 'JWST' ? 'webb' : 'hubble')));
      this.photoGroup.visible = true;
      const T = this.THREE;
      items.forEach((photo, index) => {
        const ra = T.MathUtils.degToRad(photo.ra);
        const dec = T.MathUtils.degToRad(photo.dec);
        const radius = 88;
        const marker = new T.Mesh(
          new T.SphereGeometry(matchMedia('(max-width:560px)').matches ? 1.6 : 1.25, 10, 8),
          new T.MeshBasicMaterial({ color: telescope === 'JWST' ? 0xc1a7ff : 0x8bd8ec }),
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
      const first = items[0];
      this.yaw = T.MathUtils.degToRad(first.ra);
      this.pitch = clamp(T.MathUtils.degToRad(first.dec), -1.35, 1.35);
      this.selectPhoto(first);
      this.updateHud(); this.updateCraftPicker(); this.render();
    } catch (error) {
      console.warn('[cosmic-photos]', error.message);
      const note = document.getElementById('cosmicNote');
      if (note) note.textContent = ko() ? '공식 사진 카탈로그를 읽지 못했습니다.' : 'Could not load the official image catalogue.';
    }
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
    image.src = `/${photo.thumb}`;
    image.alt = `${photo.name[isKo ? 'ko' : 'en']} · ${photo.telescope}`;
    document.getElementById('cosmicPhotoMeta').textContent = `${photo.telescope} · ${photo.date} · ${isKo ? '공개일' : 'release date'}`;
    document.getElementById('cosmicPhotoTitle').textContent = photo.name[isKo ? 'ko' : 'en'];
    document.getElementById('cosmicPhotoCredit').textContent = `${isKo ? '크레딧' : 'Credit'} · ${photo.credit}`;
    document.getElementById('cosmicPhotoLimit').textContent = isKo
      ? `${photo.license} · 표식은 지구에서 본 적경·적위 방향입니다. 거리는 같은 비율이 아닙니다.`
      : `${photo.license} · Marker uses right ascension and declination as seen from Earth; distance is not to scale.`;
    const source = document.getElementById('cosmicPhotoSource');
    source.href = photo.full; source.textContent = isKo ? '공식 원본·설명' : 'Official original & description';
    document.getElementById('cosmicPhotoBack').textContent = isKo ? '← 3D 우주' : '← 3D space';
    this.photoInfo.hidden = false;
    this.render();
  },

  closePhotoAtlas(render = true) {
    if (!this._photoMode) return;
    this._photoMode = null; this.root.classList.remove('is-photo');
    document.querySelectorAll('#scaleRail [data-aetherus-act]')
      .forEach(button => button.classList.remove('current'));
    this.photoGroup.visible = false; this.photoInfo.hidden = true;
    document.getElementById('cosmicPhotoImage').removeAttribute('src');
    this.clearPhotoAtlas(); this.yaw = .72; this.pitch = .56;
    this.updateBodyPicker(); this.updateCraftPicker(); this.updateHud();
    if (render) this.render();
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
    document.getElementById('cosmicPhotoBack')?.addEventListener('click', () => this.closePhotoAtlas());
    document.getElementById('cosmicCraftBack')?.addEventListener('click', () => this.closeCraft());
    document.getElementById('cosmicMotionOpen')?.addEventListener('click', () => this.openSolarMotion());
    document.getElementById('cosmicMotionBack')?.addEventListener('click', () => this.closeSolarMotion());
    document.getElementById('cosmicMotionReplay')?.addEventListener('click', () => this.replaySolarMotion());
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
    const hit = raycaster.intersectObjects(Object.values(this.planetMeshes), false)[0];
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
    this._internalStage = false; this.updateHud();
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
    sceneMgr.to('earth', { stage: 'earth' }).then(() => scene.requestRender());
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
      this.galaxyCore.material.opacity = .07;
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
    if (this._detailBody) {
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
    this.galaxyDustMaterial.opacity = galaxyOpacity * .06;
    this.galaxyMaterialMain.opacity = galaxyOpacity * .7 * mix(1, .72, smooth(2.45, 3.05, level));
    this.galaxyCore.material.opacity = .32 * galaxyOpacity;
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
      IDS.forEach(id => this.placeLabel(id, this.planetMeshes[id], PLANETS[id][ko() ? 'ko' : 'en']));
      this._craftMarkers.forEach(entry => {
        if (this._selectedCraft && entry.craft.id !== this._selectedCraft.id) return;
        let text = entry.craft.shortName[ko() ? 'ko' : 'en'];
        if (entry.distanceAu) text += ` · ${entry.distanceAu.toFixed(1)} AU`;
        else text += ko() ? ' · 간격 과장' : ' · spacing enlarged';
        const offsets = {
          hubble: [-18, 18], jwst: [8, -18], 'voyager-1': [6, -10], 'voyager-2': [6, 12],
        }[entry.craft.id] || [0, 0];
        this.placeLabel(`craft-${entry.craft.id}`, entry.object, text, offsets[0], offsets[1]);
      });
    } else if (stage === 'milkyway') {
      this.placeLabel('solar-place', this.solarMarker, ko() ? '태양계는 여기' : 'Solar System');
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
    label.style.transform = `translate(${x}px,${y}px)`;
  },

  updateHud() {
    if (!this.root) return;
    const stage = stageFor(this.level);
    const isKo = ko();
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
      const telescope = this._photoMode === 'JWST' ? (isKo ? '제임스웹' : 'James Webb') : (isKo ? '허블' : 'Hubble');
      document.getElementById('cosmicStage').textContent = `${telescope} · ${this._photoMarkers.size}`;
      document.getElementById('cosmicScale').textContent = isKo
        ? '지구에서 본 적경·적위 방향 · 3D 천구'
        : 'RA/Dec directions seen from Earth · 3D celestial sphere';
      document.getElementById('cosmicHint').textContent = isKo
        ? '드래그해 하늘을 돌리고 빛나는 표식을 누르면 공식 사진이 열립니다'
        : 'Drag around the sky and select a glowing marker to open the official image';
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

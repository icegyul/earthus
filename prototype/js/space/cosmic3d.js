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
  _earthCapture: null,

  init() {
    if (this.root) return this;
    this.root = document.getElementById('cosmicExperience');
    this.canvas = document.getElementById('cosmicCanvas');
    this.labels = document.getElementById('cosmicLabels');
    if (!this.root || !this.canvas || !this.labels) return this;
    this.root.closest('.space-scene')?.classList.add('cosmic-mode');
    document.getElementById('spaceSceneIntro')?.setAttribute('hidden', '');
    document.getElementById('solarExperience')?.setAttribute('hidden', '');
    this.bindInput();
    new ResizeObserver(() => this.render()).observe(this.root);
    store.on('scene', (next, stage) => {
      const visible = next === 'space';
      this.root.hidden = !visible;
      if (!visible) return;
      this.activate(stage);
    });
    i18n.onChange(() => { this.updateHud(); this.updateLabels(); this.render(); });
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
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(1.55, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor(0x02050a, 1);

    this.world.add(new T.AmbientLight(0x9db5d3, .38));
    this.sunLight = new T.PointLight(0xffdc91, 34, 180, 1.5);
    this.world.add(this.sunLight);
    this.spriteTexture = this.makePointTexture();
    this.makeBackground();
    this.makeSolarSystem();
    this.makeMilkyWay();
    this.makeGalaxyGroup();
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
      const material = new T.MeshStandardMaterial({ color: meta.color, roughness: .72, metalness: 0 });
      const mesh = new T.Mesh(new T.SphereGeometry(meta.radius, 20, 14), material);
      mesh.position.set(point.x * scale, point.z * scale, point.y * scale);
      mesh.userData.id = id;
      this.solarGroup.add(mesh);
      this.planetMeshes[id] = mesh;

      if (id === 'saturn') {
        const ring = new T.Mesh(
          new T.RingGeometry(1.28, 2.02, 48),
          new T.MeshBasicMaterial({ color: 0xd9ca9c, transparent: true, opacity: .5, side: T.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = Math.PI / 2; mesh.add(ring);
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

  bindInput() {
    scene.canvas.addEventListener('wheel', event => {
      if (store.scene !== 'earth' || event.deltaY <= 0 || cameraHeight() < ENTER_HEIGHT) return;
      event.preventDefault();
      this.captureEarth();
      this.level = .04; this.target = .13;
      sceneMgr.to('space', { stage: 'solar' }).then(() => this.animateTo(.22));
    }, { passive: false, capture: true });

    this.root.addEventListener('wheel', event => {
      if (store.scene !== 'space') return;
      event.preventDefault();
      if (event.deltaY < 0 && this.target <= .015) { this.exitToEarth(); return; }
      this.target = clamp(this.target + Math.sign(event.deltaY) * Math.min(.2, Math.abs(event.deltaY) / 760), 0, 3.15);
      this.syncStage(this.target); this.startMotion();
    }, { passive: false });

    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture?.(event.pointerId);
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._pointers.size === 2) this._pinchDistance = this.pointerDistance();
    });
    this.canvas.addEventListener('pointermove', event => {
      const previous = this._pointers.get(event.pointerId);
      if (!previous) return;
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._pointers.size === 2) {
        const distance = this.pointerDistance();
        if (this._pinchDistance) {
          this.target = clamp(this.target + Math.log(this._pinchDistance / Math.max(1, distance)) * .78, 0, 3.15);
          this.level = mix(this.level, this.target, .38);
          this.syncStage(this.target);
        }
        this._pinchDistance = distance;
      } else {
        this.yaw -= (event.clientX - previous.x) * .005;
        this.pitch = clamp(this.pitch + (event.clientY - previous.y) * .004, .035, 1.48);
      }
      this.render();
    });
    const release = event => {
      this._pointers.delete(event.pointerId);
      this._pinchDistance = this._pointers.size === 2 ? this.pointerDistance() : 0;
      this.syncStage();
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('dblclick', () => { this.yaw = .72; this.pitch = .56; this.render(); });
    this.canvas.addEventListener('keydown', event => {
      if (event.key === '+' || event.key === '=') this.animateTo(this.target - .16);
      if (event.key === '-' || event.key === '_') this.animateTo(this.target + .16);
      if (event.key === 'ArrowLeft') { this.yaw += .1; this.render(); }
      if (event.key === 'ArrowRight') { this.yaw -= .1; this.render(); }
      if (event.key === 'ArrowUp') { this.pitch = clamp(this.pitch + .08, .035, 1.48); this.render(); }
      if (event.key === 'ArrowDown') { this.pitch = clamp(this.pitch - .08, .035, 1.48); this.render(); }
    });
    document.getElementById('cosmicEarthReturn')?.addEventListener('click', () => this.exitToEarth());
  },

  pointerDistance() {
    const points = [...this._pointers.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  },

  captureEarth() {
    try {
      scene.render();
      this._earthCapture = scene.canvas.toDataURL('image/png');
      if (this._ready) this.applyEarthTexture();
    } catch (_) { this._earthCapture = null; }
  },

  applyEarthTexture() {
    if (!this._earthCapture || !this.earthMesh) return;
    new this.THREE.TextureLoader().load(this._earthCapture, texture => {
      texture.colorSpace = this.THREE.SRGBColorSpace;
      this.earthMesh.material.map = texture;
      this.earthMesh.material.color.set(0xffffff);
      this.earthMesh.material.needsUpdate = true;
      this.render();
    });
  },

  animateTo(next) {
    this.target = clamp(next, 0, 3.15);
    this.syncStage(this.target);
    this.startMotion();
  },

  startMotion() {
    if (this._frame) return;
    this.root.classList.add('is-moving');
    this._last = performance.now();
    const step = now => {
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
    this.resize();
    const T = this.THREE;
    const level = this.level;
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
    this.updateHud(); this.updateLabels();
  },

  updateLabels() {
    if (!this._ready || !this.labels) return;
    const stage = stageFor(this.level);
    this.labels.querySelectorAll('[data-cosmic-label]').forEach(label => { label.hidden = true; });
    if (stage === 'solar' && this.level > .24) {
      IDS.forEach(id => this.placeLabel(id, this.planetMeshes[id], PLANETS[id][ko() ? 'ko' : 'en']));
    } else if (stage === 'milkyway') {
      this.placeLabel('solar-place', this.solarMarker, ko() ? '태양계는 여기' : 'Solar System');
    } else if (stage === 'galaxies') {
      this.placeLabel('milky-way', this.milkyWay, ko() ? '우리 은하' : 'Milky Way');
    }
  },

  placeLabel(id, object, text) {
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
    label.style.transform = `translate(${(point.x * .5 + .5) * this._width}px,${(-point.y * .5 + .5) * this._height}px)`;
  },

  updateHud() {
    if (!this.root) return;
    const stage = stageFor(this.level);
    const isKo = ko();
    const copy = {
      solar: {
        title: isKo ? '태양계' : 'Solar System',
        scale: isKo ? '3D 궤도 · 드래그하여 기울이기 · 로그 스케일' : '3D orbits · drag to tilt · logarithmic scale',
        hint: isKo ? '계속 줌아웃하면 은하수 안의 태양계 위치로 이어집니다' : 'Keep zooming out to reach the Solar System’s place in the Milky Way',
        note: isKo ? '행성 위치 계산값 · JPL 공개 궤도요소 · 행성 크기 과장' : 'Calculated planet positions · JPL public elements · planet sizes exaggerated',
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

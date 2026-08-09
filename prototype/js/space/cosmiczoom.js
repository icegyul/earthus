// 지구에서 은하들까지 이어지는 한 화면의 로그 스케일 우주 장면.
//
// 받은 지적: "책처럼 한 장으로 표현되는 게 아니라 3D처럼 보여야 한다.
// 줌아웃되면 태양계, 더 아웃되면 은하수, 더 아웃하면 은하들이 나와야 한다."
// 그래서 카드나 별도 페이지를 넘기지 않는다. 휠·핀치로 바뀌는 level 하나가
// 지구 초점 → 태양 초점 → 은하 중심 → 은하군 중심을 연속으로 이동시킨다.
// ⚠️ 무한 애니메이션 금지: 입력 뒤 보간하는 짧은 rAF만 쓰고 정지하면 0프레임이다.
// ⚠️ 은하 외부 모습과 은하군 배치는 관측 사진이 아니라 교육용 도식이다.

import { viewer, scene, cameraHeight } from '../viewer.js';
import { store } from '../store.js';
import { sceneMgr } from '../scene.js';
import { i18n } from '../i18n.js';
import { planetOrbit, planetPositions } from './kepler.js';

const IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const PLANETS = {
  mercury: { ko: '수성', en: 'Mercury', color: '#aaa7a0', radius: 2.2 },
  venus: { ko: '금성', en: 'Venus', color: '#d7b575', radius: 3.2 },
  earth: { ko: '지구', en: 'Earth', color: '#62b7da', radius: 3.6 },
  mars: { ko: '화성', en: 'Mars', color: '#c86d50', radius: 2.8 },
  jupiter: { ko: '목성', en: 'Jupiter', color: '#d0a27b', radius: 7.6 },
  saturn: { ko: '토성', en: 'Saturn', color: '#d7c28a', radius: 6.8 },
  uranus: { ko: '천왕성', en: 'Uranus', color: '#86d1d5', radius: 5.0 },
  neptune: { ko: '해왕성', en: 'Neptune', color: '#557bd5', radius: 4.8 },
};
const TARGET = { moon: .18, solar: .78, milkyway: 1.78, galaxies: 2.78 };
const ENTER_HEIGHT = 220_000_000;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const stageFor = level => level < 1.28 ? 'solar' : level < 2.28 ? 'milkyway' : 'galaxies';
const ko = () => i18n.lang !== 'en';

// Math.random 금지. 같은 인덱스가 늘 같은 별과 은하를 만든다.
const BACKGROUND_STARS = Array.from({ length: 240 }, (_, index) => ({
  x: ((index * 193 + 47) % 997) / 997,
  y: ((index * index * 71 + 29) % 991) / 991,
  z: ((index * 53 + 11) % 89) / 89,
  size: index % 31 === 0 ? 1.8 : index % 7 === 0 ? 1.1 : .65,
}));
const MILKY_WAY_STARS = Array.from({ length: 520 }, (_, index) => {
  const arm = index % 4;
  const radius = .035 + (((index * 67) % 509) / 509) * .965;
  const scatter = ((((index * 83) % 101) / 101) - .5) * (.16 + radius * .18);
  const angle = arm * Math.PI / 2 + radius * 7.2 + scatter;
  return {
    x: Math.cos(angle) * radius + ((((index * 43) % 97) / 97) - .5) * .07,
    y: Math.sin(angle) * radius + ((((index * 29) % 89) / 89) - .5) * .07,
    hot: index % 17 === 0,
    size: index % 41 === 0 ? 1.8 : .7,
  };
});
const LOCAL_GALAXIES = Array.from({ length: 28 }, (_, index) => {
  if (index === 0) return { x: 0, y: 0, z: 0, size: 1, tilt: .34 };
  const shell = .18 + (((index * 47) % 101) / 101) * .82;
  const angle = index * 2.399963;
  return {
    x: Math.cos(angle) * shell,
    y: Math.sin(angle) * shell * .62,
    z: ((((index * 37) % 79) / 79) - .5) * .5,
    size: .32 + (((index * 19) % 67) / 67) * .58,
    tilt: .18 + (((index * 23) % 53) / 53) * .48,
  };
});

export const cosmicZoom = {
  root: null,
  canvas: null,
  ctx: null,
  level: .04,
  target: .04,
  yaw: -.22,
  pitch: .42,
  _frame: 0,
  _last: 0,
  _stage: 'solar',
  _internalStage: false,
  _pointers: new Map(),
  _pinchDistance: 0,
  _earthImage: null,

  init() {
    if (this.root) return this;
    this.root = document.getElementById('cosmicExperience');
    this.canvas = document.getElementById('cosmicCanvas');
    this.ctx = this.canvas?.getContext('2d', { alpha: false });
    if (!this.root || !this.canvas || !this.ctx) return this;

    this.root.closest('.space-scene')?.classList.add('cosmic-mode');
    document.getElementById('spaceSceneIntro')?.setAttribute('hidden', '');
    document.getElementById('solarExperience')?.setAttribute('hidden', '');
    this.bindInput();
    new ResizeObserver(() => this.draw()).observe(this.root);
    store.on('scene', (next, stage) => {
      const visible = next === 'space';
      this.root.hidden = !visible;
      if (!visible) return;
      if (!this._internalStage) this.animateTo(TARGET[stage] ?? TARGET.solar);
      this.draw();
    });
    i18n.onChange(() => { this.updateHud(); this.draw(); });
    this.root.hidden = store.scene !== 'space';
    this.updateHud();
    return this;
  },

  bindInput() {
    // Cesium에서 충분히 멀어진 뒤 한 번 더 줌아웃하면 같은 자리에 우주 스케일을 잇는다.
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
      this.target = clamp(this.target + Math.sign(event.deltaY) * Math.min(.22, Math.abs(event.deltaY) / 720), 0, 3.15);
      this.syncStage(this.target);
      this.startMotion();
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
          const delta = Math.log(Math.max(1, this._pinchDistance) / Math.max(1, distance)) * .8;
          this.target = clamp(this.target + delta, 0, 3.15);
          this.level = mix(this.level, this.target, .42);
          this.syncStage(this.target);
        }
        this._pinchDistance = distance;
      } else {
        this.yaw += (event.clientX - previous.x) * .003;
        this.pitch = clamp(this.pitch + (event.clientY - previous.y) * .002, .16, .78);
      }
      this.draw();
    });
    const release = event => {
      this._pointers.delete(event.pointerId);
      this._pinchDistance = this._pointers.size === 2 ? this.pointerDistance() : 0;
      this.syncStage();
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    document.getElementById('cosmicEarthReturn')?.addEventListener('click', () => this.exitToEarth());
  },

  pointerDistance() {
    const points = [...this._pointers.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  },

  captureEarth() {
    try {
      scene.render();
      const image = new Image();
      image.onload = () => { this._earthImage = image; this.draw(); };
      image.src = scene.canvas.toDataURL('image/png');
    } catch (_) {
      // 보존 버퍼가 없는 기기에서는 캡처가 실패할 수 있다. 그때는 그라데이션 지구를 쓴다.
      this._earthImage = null;
    }
  },

  animateTo(next) {
    this.target = clamp(next, 0, 3.15);
    this.startMotion();
  },

  startMotion() {
    if (this._frame) return;
    this._last = performance.now();
    const step = now => {
      const elapsed = Math.min(40, now - this._last);
      this._last = now;
      const amount = 1 - Math.pow(.002, elapsed / 1000);
      this.level = mix(this.level, this.target, amount);
      if (Math.abs(this.level - this.target) < .0015) this.level = this.target;
      this.draw();
      if (this.level === this.target) {
        this._frame = 0;
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
    this._stage = stage;
    this._internalStage = true;
    store.setScene('space', stage);
    this._internalStage = false;
    this.updateHud();
  },

  exitToEarth() {
    this.target = 0; this.level = 0;
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = 0;
    sceneMgr.to('earth', { stage: 'earth' }).then(() => scene.requestRender());
  },

  resize() {
    const rect = this.root.getBoundingClientRect();
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  },

  draw() {
    if (!this.root || this.root.hidden) return;
    const { width, height } = this.resize();
    const ctx = this.ctx;
    ctx.fillStyle = '#02050a'; ctx.fillRect(0, 0, width, height);
    this.drawStars(ctx, width, height);
    this.drawSolar(ctx, width, height);
    this.drawMilkyWay(ctx, width, height);
    this.drawGalaxies(ctx, width, height);
    this.updateHud();
  },

  drawStars(ctx, width, height) {
    const drift = this.level * 17;
    BACKGROUND_STARS.forEach((star, index) => {
      const x = (star.x * width + Math.sin(this.yaw + index) * drift * star.z + width) % width;
      const y = (star.y * height + Math.cos(this.pitch + index * .7) * drift * star.z + height) % height;
      const alpha = .18 + star.z * .56;
      ctx.fillStyle = `rgba(${star.hot ? '182,210,255' : '238,242,255'},${alpha})`;
      ctx.fillRect(x, y, star.size, star.size);
    });
  },

  rotatePoint(x, y, z = 0) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
  },

  drawSolar(ctx, width, height) {
    const alpha = 1 - smooth(1.32, 1.72, this.level);
    if (alpha <= .01) return;
    const positions = planetPositions(new Date());
    const earth = positions.earth;
    const focus = 1 - smooth(.18, .78, this.level);
    const au = 70 * Math.exp(-2.18 * this.level) * Math.min(width, height) / 720;
    const cx = width / 2, cy = height / 2;
    const project = point => {
      const rotated = this.rotatePoint((point.x - earth.x * focus) * au, (point.y - earth.y * focus) * au,
        (point.z - earth.z * focus) * au);
      return { x: cx + rotated.x, y: cy + rotated.y, z: rotated.z };
    };
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.lineWidth = .7;
    IDS.forEach(id => {
      const orbit = planetOrbit(id, new Date(), 120);
      ctx.beginPath();
      orbit.forEach((point, index) => {
        const p = project(point);
        if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      });
      ctx.strokeStyle = id === 'earth' ? 'rgba(100,190,220,.34)' : 'rgba(205,214,234,.14)';
      ctx.stroke();
    });

    const sun = project({ x: 0, y: 0, z: 0 });
    const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 34);
    glow.addColorStop(0, 'rgba(255,232,152,.95)'); glow.addColorStop(.16, 'rgba(255,201,82,.75)');
    glow.addColorStop(1, 'rgba(255,174,39,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sun.x, sun.y, 34, 0, Math.PI * 2); ctx.fill();

    const labelThreshold = this.level > .43;
    IDS.map(id => ({ id, p: project(positions[id]) })).sort((a, b) => a.p.z - b.p.z).forEach(({ id, p }) => {
      const meta = PLANETS[id];
      const earthBoost = id === 'earth' ? 180 * Math.exp(-3.4 * this.level) : 0;
      const radius = Math.max(meta.radius, earthBoost);
      if (id === 'earth' && radius > 12) this.drawEarth(ctx, p.x, p.y, radius);
      else {
        ctx.fillStyle = meta.color; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
        if (id === 'saturn' && radius > 4) {
          ctx.strokeStyle = 'rgba(225,211,166,.66)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, radius * 1.7, radius * .5, -.2, 0, Math.PI * 2); ctx.stroke();
        }
      }
      if (labelThreshold && p.x > -30 && p.x < width + 30 && p.y > -20 && p.y < height + 20) {
        ctx.fillStyle = 'rgba(238,242,249,.72)'; ctx.font = '500 10px system-ui,sans-serif';
        ctx.fillText(meta[ko() ? 'ko' : 'en'], p.x + radius + 5, p.y - 3);
      }
    });
    ctx.restore();
  },

  drawEarth(ctx, x, y, radius) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
    if (this._earthImage?.complete) {
      const side = Math.min(this._earthImage.width, this._earthImage.height);
      ctx.drawImage(this._earthImage, (this._earthImage.width - side) / 2, (this._earthImage.height - side) / 2,
        side, side, x - radius, y - radius, radius * 2, radius * 2);
    } else {
      const ocean = ctx.createRadialGradient(x - radius * .38, y - radius * .42, radius * .08, x, y, radius);
      ocean.addColorStop(0, '#74b8d2'); ocean.addColorStop(.42, '#17658c'); ocean.addColorStop(1, '#031827');
      ctx.fillStyle = ocean; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.fillStyle = 'rgba(112,154,102,.72)';
      ctx.beginPath(); ctx.ellipse(x - radius * .2, y - radius * .1, radius * .28, radius * .5, -.52, 0, Math.PI * 2); ctx.fill();
    }
    const shade = ctx.createLinearGradient(x - radius, y, x + radius, y);
    shade.addColorStop(0, 'rgba(0,0,0,.78)'); shade.addColorStop(.52, 'rgba(0,0,0,.04)'); shade.addColorStop(1, 'rgba(120,205,255,.14)');
    ctx.fillStyle = shade; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(139,218,255,.52)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  },

  drawMilkyWay(ctx, width, height) {
    const alpha = smooth(1.03, 1.42, this.level) * (1 - smooth(2.42, 2.86, this.level));
    if (alpha <= .01) return;
    const radius = 1500 * Math.exp(-1.76 * (this.level - 1.03)) * Math.min(width, height) / 720;
    const solarX = .56 * radius, solarY = -.08 * radius;
    const focus = 1 - smooth(1.18, 1.92, this.level);
    const cx = width / 2 - solarX * focus, cy = height / 2 - solarY * focus * .42;
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * .34);
    core.addColorStop(0, 'rgba(255,236,190,.45)'); core.addColorStop(.25, 'rgba(189,204,255,.14)'); core.addColorStop(1, 'rgba(80,110,190,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(cx, cy, radius * .42, radius * .15, this.yaw * .18, 0, Math.PI * 2); ctx.fill();
    MILKY_WAY_STARS.forEach(star => {
      const px = star.x * radius, py = star.y * radius;
      const rotated = this.rotatePoint(px, py * .46, py * .18);
      const x = cx + rotated.x, y = cy + rotated.y;
      if (x < -4 || x > width + 4 || y < -4 || y > height + 4) return;
      ctx.fillStyle = star.hot ? 'rgba(155,198,255,.72)' : 'rgba(233,226,208,.42)';
      ctx.fillRect(x, y, star.size, star.size);
    });
    ctx.globalCompositeOperation = 'source-over';
    const hereX = cx + solarX, hereY = cy + solarY * .42;
    if (this.level > 1.32 && this.level < 2.3) {
      ctx.fillStyle = '#82d9ef'; ctx.beginPath(); ctx.arc(hereX, hereY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(130,217,239,.52)'; ctx.beginPath(); ctx.arc(hereX, hereY, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(196,239,248,.9)'; ctx.font = '600 10px system-ui,sans-serif';
      ctx.fillText(ko() ? '태양계는 여기' : 'Solar System', hereX + 12, hereY - 7);
    }
    ctx.restore();
  },

  drawGalaxies(ctx, width, height) {
    const alpha = smooth(2.08, 2.48, this.level);
    if (alpha <= .01) return;
    const groupRadius = 1750 * Math.exp(-1.72 * (this.level - 2.08)) * Math.min(width, height) / 720;
    const cx = width / 2, cy = height / 2;
    ctx.save(); ctx.globalAlpha = alpha;
    LOCAL_GALAXIES.map((galaxy, index) => {
      const point = this.rotatePoint(galaxy.x * groupRadius, galaxy.y * groupRadius, galaxy.z * groupRadius);
      return { galaxy, index, x: cx + point.x, y: cy + point.y, z: point.z };
    }).sort((a, b) => a.z - b.z).forEach(item => {
      if (item.x < -120 || item.x > width + 120 || item.y < -80 || item.y > height + 80) return;
      const near = clamp(1 + item.z / Math.max(1, groupRadius) * .35, .65, 1.4);
      const size = Math.max(4, (item.index === 0 ? 90 : 34) * item.galaxy.size * near * Math.exp(-.82 * (this.level - 2.2)));
      this.drawMiniGalaxy(ctx, item.x, item.y, size, item.galaxy.tilt, item.index);
      if (item.index === 0 && this.level < 2.82) {
        ctx.fillStyle = 'rgba(222,233,248,.88)'; ctx.font = '600 10px system-ui,sans-serif';
        ctx.fillText(ko() ? '우리 은하' : 'Milky Way', item.x + size + 8, item.y - 5);
      }
    });
    ctx.restore();
  },

  drawMiniGalaxy(ctx, x, y, radius, tilt, seed) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, seed % 3 ? 'rgba(255,224,170,.8)' : 'rgba(201,218,255,.9)');
    glow.addColorStop(.22, 'rgba(181,199,235,.4)'); glow.addColorStop(1, 'rgba(89,118,179,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(x, y, radius, Math.max(2, radius * tilt), seed * .31, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(198,216,248,.24)'; ctx.lineWidth = Math.max(.5, radius * .025);
    for (let arm = 0; arm < 2; arm += 1) {
      ctx.beginPath();
      for (let step = 0; step < 30; step += 1) {
        const t = step / 29, angle = arm * Math.PI + t * 4.8 + seed;
        const px = x + Math.cos(angle) * radius * t;
        const py = y + Math.sin(angle) * radius * t * tilt;
        if (step) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  },

  updateHud() {
    if (!this.root) return;
    const stage = stageFor(this.level);
    const title = document.getElementById('cosmicStage');
    const scale = document.getElementById('cosmicScale');
    const hint = document.getElementById('cosmicHint');
    const note = document.getElementById('cosmicNote');
    const isKo = ko();
    const copy = {
      solar: {
        title: isKo ? '태양계' : 'Solar System', scale: isKo ? '지구에서 해왕성 궤도까지 · 로그 스케일' : 'Earth to Neptune orbit · logarithmic scale',
        hint: isKo ? '계속 줌아웃하면 은하수가 나타납니다' : 'Keep zooming out to reveal the Milky Way',
        note: isKo ? '행성 위치 계산값 · JPL 공개 궤도요소 · 크기 과장' : 'Calculated planet positions · JPL public elements · sizes exaggerated',
      },
      milkyway: {
        title: isKo ? '은하수' : 'Milky Way', scale: isKo ? '태양계에서 은하 전체까지 · 로그 스케일' : 'Solar System to the whole galaxy · logarithmic scale',
        hint: isKo ? '더 줌아웃하면 은하들이 나타납니다' : 'Zoom farther out to reveal other galaxies',
        note: isKo ? '우리 은하 외부 사진은 존재하지 않음 · 형태는 교육용 도식' : 'No external photograph of our galaxy exists · educational diagram',
      },
      galaxies: {
        title: isKo ? '은하들' : 'Galaxies', scale: isKo ? '은하군을 보는 단계 · 로그 스케일' : 'Galaxy-group scale · logarithmic scale',
        hint: isKo ? '줌인하면 같은 길을 따라 지구로 돌아갑니다' : 'Zoom in to follow the same path back to Earth',
        note: isKo ? '상대 위치·크기는 단계 이해를 위한 도식 · 실제 은하 배치 아님' : 'Relative positions and sizes are schematic, not an observed galaxy map',
      },
    }[stage];
    title.textContent = copy.title; scale.textContent = copy.scale; hint.textContent = copy.hint; note.textContent = copy.note;
    this.root.dataset.stage = stage;
  },
};

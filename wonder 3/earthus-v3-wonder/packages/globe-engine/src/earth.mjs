// EARTHUS V3 WONDER — globe-engine / earth (three.js 장면). DOM 캔버스는 호출부가 준다.
// 구는 원점에 고정이고 **카메라가 돈다**(OrbitCamera.pose). 그래서 구 표면 좌표 = geo.mjs 좌표식 그대로.
import * as THREE from '../../shared/vendor/three/three-r184.module.min.js';
import { llToVec, vecToLL } from './geo.mjs';
import { diameterAtDistance } from './camera.mjs';
import { CONTINENT_TAGS, cloudPlan, starPlan } from './ambient.mjs';

/**
 * @param {{ canvas: HTMLCanvasElement, textureCanvas: HTMLCanvasElement, pixelRatio?: number,
 *           ambient?: boolean, labels?: boolean, clouds?: number }} opt
 */
export function createPaperEarth({ canvas, textureCanvas, pixelRatio = 1, ambient = true, labels = true, clouds = 10 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 60);

  const map = new THREE.CanvasTexture(textureCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 }),
  );
  globe.name = 'paper-earth';
  scene.add(globe);

  // 빛: 따뜻한 반구광 + 카메라 왼쪽 위에서 오는 키 라이트(카메라와 같이 돈다 — 종이 그림자가 항상 보이게)
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x9fb0c4, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  scene.add(key); scene.add(key.target);

  /* ── 지구 둘레(어두운 종이 우주): 별밭 · 대기 테두리 빛 · 떠 있는 종이 구름 · 대륙 이름표 ──
     전부 장식이고 조작을 가리지 않는다. 지구가 주인공이므로 은은하게. ambient:false 면 아무것도 만들지 않는다. */
  const doc = canvas.ownerDocument;
  const HALO_SCALE = 1.45;                    // 대기 스프라이트 반지름(지구 반지름 1 기준) — 그라디언트 정거장이 이 값에 맞춰져 있다
  const scratch = (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
  const disposables = [];
  let stars = null, halo = null, cloudGroup = null, labelGroup = null;
  const cloudSprites = [], labelSprites = [];

  if (ambient) {
    // 별밭 — 먼 구면의 점들. 지구를 돌리면 같이 흐른다.
    const plan = starPlan();
    const pos = new Float32Array(plan.length * 3), col = new Float32Array(plan.length * 3), siz = new Float32Array(plan.length);
    plan.forEach((s, i) => { pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z; col[i * 3] = col[i * 3 + 1] = 1; col[i * 3 + 2] = 1; const a = s.alpha; col[i * 3] *= a; col[i * 3 + 1] *= a * 0.99; col[i * 3 + 2] *= a * 0.94; siz[i] = s.size; });
    const gStar = new THREE.BufferGeometry();
    gStar.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gStar.setAttribute('color', new THREE.BufferAttribute(col, 3));
    stars = new THREE.Points(gStar, new THREE.PointsMaterial({ size: 0.16, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    stars.name = 'stars'; scene.add(stars); disposables.push(gStar, stars.material);

    // 대기 테두리 빛 — 지구보다 먼저 그려지는 부드러운 원(빛 번짐). 실루엣 밖으로 살짝 퍼진다.
    const hc = scratch(256, 256), hx = hc.getContext('2d');
    // 실루엣 바로 바깥에서 가장 밝고 밖으로 길게 사라진다 — 고리가 아니라 번짐이어야 한다.
    // 정거장 값은 **스프라이트 반지름의 비율**이다. 지구 실루엣은 1/HALO_SCALE 자리(아래 0.69)에 온다 —
    // 시작 반지름을 0 이 아닌 값으로 주면 이 비율이 어긋나 빛이 지구에서 떨어진 테로 뜬다(2026-09-13 실측).
    const hg = hx.createRadialGradient(128, 128, 0, 128, 128, 128);
    hg.addColorStop(0, 'rgba(150,205,240,0)'); hg.addColorStop(.655, 'rgba(150,205,240,0)'); hg.addColorStop(.695, 'rgba(172,216,246,.26)');
    hg.addColorStop(.73, 'rgba(160,208,242,.13)'); hg.addColorStop(.79, 'rgba(150,200,235,.065)'); hg.addColorStop(.85, 'rgba(144,194,232,.03)');
    hg.addColorStop(.91, 'rgba(140,190,230,.012)'); hg.addColorStop(.96, 'rgba(140,190,230,.004)'); hg.addColorStop(1, 'rgba(140,190,230,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 256, 256);
    const hTex = new THREE.CanvasTexture(hc); hTex.colorSpace = THREE.SRGBColorSpace;
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: hTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(HALO_SCALE * 2, HALO_SCALE * 2, 1); halo.renderOrder = -1; halo.name = 'atmosphere';
    scene.add(halo); disposables.push(hTex, halo.material);

    // 종이 구름 — 겹친 동그라미 + 아래 그늘. 3가지 모양을 돌려 쓴다.
    const cloudTex = [0, 1, 2].map(k => {
      const c = scratch(256, 160), x = c.getContext('2d');
      const puffs = [[74, 96, 44], [124, 78, 54], [176, 100, 38], [104, 108, 34], [150, 110, 30]].slice(0, 3 + k);
      x.fillStyle = 'rgba(120,140,170,.30)';
      for (const [px, py, r] of puffs) { x.beginPath(); x.arc(px, py + 12, r * .96, 0, 7); x.fill(); }
      x.fillStyle = '#f4f7fb';
      for (const [px, py, r] of puffs) { x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,.95)';
      for (const [px, py, r] of puffs) { x.beginPath(); x.arc(px - r * .18, py - r * .22, r * .72, 0, 7); x.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; disposables.push(t); return t;
    });
    cloudGroup = new THREE.Group(); cloudGroup.name = 'clouds'; scene.add(cloudGroup);
    for (const c of cloudPlan(clouds)) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex[c.shape], transparent: true, opacity: .92, depthWrite: false }));
      sp.scale.set(c.size, c.size * 0.62, 1);
      sp.userData = { ...c };
      cloudGroup.add(sp); cloudSprites.push(sp); disposables.push(sp.material);
    }

    // 대륙 이름표 — 종이 태그 6개. 세계(줌 0)에서만, 앞면일 때만 보인다.
    if (labels) {
      labelGroup = new THREE.Group(); labelGroup.name = 'labels'; scene.add(labelGroup);
      for (const tag of CONTINENT_TAGS) {
        const W = 512, H = 140, c = scratch(W, H), x = c.getContext('2d');
        x.font = '600 54px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        const tw = Math.min(W - 40, x.measureText(tag.ko).width + 56), bx = (W - tw) / 2;
        x.fillStyle = 'rgba(40,30,18,.28)'; x.fillRect(bx + 5, 44, tw, 62);
        x.fillStyle = '#fbf4e6'; x.fillRect(bx, 38, tw, 62);
        x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(bx, 38, tw, 3);
        x.fillStyle = '#3a3327'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(tag.ko, W / 2, 70);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        // depthTest 를 끈다 — 켜 두면 구 가장자리에서 태그가 지구에 잘려 글자가 반만 남는다(2026-09-13 실측). 뒷면은 아래 facing 값으로 가린다.
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
        sp.renderOrder = 2;
        sp.scale.set(0.42, 0.115, 1); sp.userData = { ...tag };
        labelGroup.add(sp); labelSprites.push(sp); disposables.push(t, sp.material);
      }
    }
  }

  /** 프레임 진행: 구름이 아주 느리게 동쪽으로 흐른다. 움직임 줄이기면 호출부가 안 부르면 된다. */
  function tick(dt) {
    for (const sp of cloudSprites) sp.userData.lon = ((sp.userData.lon + sp.userData.degPerSec * dt + 180) % 360) - 180;
  }

  /** 텍스처 캔버스를 다시 그렸을 때(저해상 → 고해상 승급) 호출. */
  function refreshTexture() { map.needsUpdate = true; }

  // 지역 표식: 구 표면에 붙는 **얇은 흰 글로우 링**(§6 "thin glow line", 두꺼운 지도 UI 금지). 구 뒤로 돌아가면 깊이 검사로 가려진다(§2.2).
  const marker = new THREE.Group();
  const markerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.028, 0.033, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  const markerGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.048, 48),
    new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  marker.add(markerGlow); marker.add(markerRing);
  marker.visible = false;
  scene.add(marker);

  // 캐릭터 스프라이트(LOD1 썸네일): 구 표면 위 빌보드. 보이는 지역만 호출부가 넣고 뺀다. 구 뒤로 가면 가려진다.
  const sprites = new Map();   // id → { sprite, lat, lon, texture }
  function setSprite(id, { lat, lon, image, size = 0.09 }) {
    let s = sprites.get(id);
    if (!s) {
      const tex = new THREE.Texture(image); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
      sp.name = `char-${id}`;
      scene.add(sp);
      s = { sprite: sp, texture: tex, lat, lon }; sprites.set(id, s);
    }
    const p = llToVec(lat, lon, 1 + size * 0.55);
    s.sprite.position.set(p.x, p.y, p.z);
    s.sprite.scale.set(size, size, 1);
    s.sprite.center.set(0.5, 0.15);       // 발끝이 표면 근처
    s.lat = lat; s.lon = lon;
    return s.sprite;
  }
  function removeSprite(id) {
    const s = sprites.get(id); if (!s) return false;
    scene.remove(s.sprite); s.sprite.material.dispose(); s.texture.dispose(); sprites.delete(id); return true;
  }
  /** 구 위 좌표가 카메라 쪽(앞면)인가 — cos 각 > 0.15 (가장자리는 제외). */
  function facing(lat, lon, pose, min = 0.15) {
    const c = llToVec(pose.lat, pose.lon, 1), q = llToVec(lat, lon, 1);
    return c.x * q.x + c.y * q.y + c.z * q.z > min;
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let viewW = 1, viewH = 1;

  function resize(w, h) {
    viewW = Math.max(1, w); viewH = Math.max(1, h);
    renderer.setSize(viewW, viewH, false);
    cam.aspect = viewW / viewH; cam.updateProjectionMatrix();
  }

  /** OrbitCamera.pose() 를 three 카메라에 적용하고 한 프레임 그린다. */
  function render(pose) {
    const p = llToVec(pose.lat, pose.lon, pose.dist);
    cam.position.set(p.x, p.y, p.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    if (cam.fov !== pose.fov) { cam.fov = pose.fov; cam.updateProjectionMatrix(); }
    // 키 라이트 = 카메라 위치에서 왼쪽·위로 비스듬히
    const left = new THREE.Vector3().crossVectors(cam.up, cam.position).normalize();
    key.position.copy(cam.position).addScaledVector(left, 1.2).add(new THREE.Vector3(0, 1.0, 0)).multiplyScalar(1.2);
    key.target.position.set(0, 0, 0);
    // 구름은 제 위도·경도 자리로, 이름표는 세계(줌 0)에서 앞면일 때만 서서히 나타난다(과도한 라벨 금지).
    const c0 = llToVec(pose.lat, pose.lon, 1);
    for (const sp of cloudSprites) {
      const u = sp.userData, q = llToVec(u.lat, u.lon, u.r);
      sp.position.set(q.x, q.y, q.z);
    }
    for (const sp of labelSprites) {
      const u = sp.userData, q = llToVec(u.lat, u.lon, 1);
      const dot = c0.x * q.x + c0.y * q.y + c0.z * q.z;
      const t = Math.max(0, Math.min(1, (dot - 0.46) / 0.22));       // 가장자리(잘려 보이는 자리)에 닿기 전에 사라진다
      sp.material.opacity = pose.step === 0 ? t * 0.92 : 0;
      sp.visible = sp.material.opacity > 0.01;
      if (sp.visible) { const p2 = llToVec(u.lat, u.lon, 1.012); sp.position.set(p2.x, p2.y, p2.z); }
    }
    renderer.render(scene, cam);
  }

  /** 화면 좌표(캔버스 기준 px) → 구 위 위도·경도. 빗나가면 null. */
  function pick(x, y) {
    ndc.set((x / viewW) * 2 - 1, -(y / viewH) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObject(globe, false)[0];
    if (!hit) return null;
    return vecToLL(hit.point);
  }

  function setMarker(lat, lon) {
    if (lat == null) { marker.visible = false; return; }
    const p = llToVec(lat, lon, 1.004);
    marker.position.set(p.x, p.y, p.z);
    marker.lookAt(p.x * 2, p.y * 2, p.z * 2);      // 표면 법선을 향하게
    marker.visible = true;
  }

  /** 표식이 카메라에서 보이는가(구에 가려지지 않았는가). 깊이 검증용. */
  function markerFacing(pose) {
    if (!marker.visible) return false;
    const c = llToVec(pose.lat, pose.lon, 1);
    return marker.position.clone().normalize().dot(new THREE.Vector3(c.x, c.y, c.z)) > 0;
  }

  /** 구 위 좌표 → 캔버스 px (unfold 시작점). 카메라 자세는 마지막 render 의 것. */
  function project(lat, lon) {
    const p = llToVec(lat, lon, 1);
    const v = new THREE.Vector3(p.x, p.y, p.z).project(cam);
    return { x: (v.x + 1) / 2 * viewW, y: (1 - v.y) / 2 * viewH, inFront: v.z < 1 };
  }

  const projectedDiameter = pose => diameterAtDistance(pose.dist, viewH, pose.fov);

  function metrics() {
    const m = renderer.info.memory, r = renderer.info.render;
    return { geometries: m.geometries, textures: m.textures, triangles: r.triangles, calls: r.calls,
      textureBytes: textureCanvas.width * textureCanvas.height * 4, pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: [renderer.domElement.width, renderer.domElement.height] };
  }

  function dispose() {
    globe.geometry.dispose(); globe.material.dispose(); map.dispose();
    markerRing.geometry.dispose(); markerRing.material.dispose(); markerGlow.geometry.dispose(); markerGlow.material.dispose();
    for (const id of [...sprites.keys()]) removeSprite(id);
    for (const d of disposables) d.dispose?.();
    renderer.dispose();
  }

  return { renderer, scene, camera: cam, globe, resize, render, tick, refreshTexture, pick, project, setMarker, markerFacing, facing, setSprite, removeSprite,
    get spriteIds() { return [...sprites.keys()]; }, projectedDiameter, metrics, dispose, THREE,
    ambient: { get stars() { return stars; }, get halo() { return halo; }, clouds: cloudSprites, labels: labelSprites } };
}

// EARTHUS V3 WONDER — globe-engine / earth (three.js 장면). DOM 캔버스는 호출부가 준다.
// 구는 원점에 고정이고 **카메라가 돈다**(OrbitCamera.pose). 그래서 구 표면 좌표 = geo.mjs 좌표식 그대로.
import * as THREE from '../../shared/vendor/three/three-r184.module.min.js';
import { llToVec, vecToLL } from './geo.mjs';
import { diameterAtDistance } from './camera.mjs';

/**
 * @param {{ canvas: HTMLCanvasElement, textureCanvas: HTMLCanvasElement, pixelRatio?: number }} opt
 */
export function createPaperEarth({ canvas, textureCanvas, pixelRatio = 1 }) {
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
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0xbfcbd6, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  scene.add(key); scene.add(key.target);

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
    renderer.dispose();
  }

  return { renderer, scene, camera: cam, globe, resize, render, pick, project, setMarker, markerFacing, facing, setSprite, removeSprite, get spriteIds() { return [...sprites.keys()]; }, projectedDiameter, metrics, dispose, THREE };
}

/**
 * Aetherus orbital scene.
 *
 * The globe, starfield and lighting are presentation only. Object markers and
 * orbit lines are placed exclusively at coordinates returned by the Aetherus
 * API (geodetic lat/lon/alt per sample); nothing in this file propagates an
 * orbit or invents a position.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { geodeticToScene, KM_TO_SCENE, SCENE_EARTH_RADIUS } from "./coords.js";

const STATUS_COLORS = {
  OK: new THREE.Color("#67e8f9"),
  STALE: new THREE.Color("#fbbf24"),
  QUARANTINE: new THREE.Color("#f87171"),
  PROPAGATION_UNAVAILABLE: new THREE.Color("#f87171"),
  NO_SOLUTION: new THREE.Color("#64748b"),
};

export const LOD_THRESHOLDS = { mid: 3.4, focus: 1.7 };

function lodForDistance(distance) {
  if (distance <= LOD_THRESHOLDS.focus) return "focus";
  if (distance <= LOD_THRESHOLDS.mid) return "mid";
  return "global";
}

const EARTH_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAGMENT = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform vec3 uGraticule;

  float gridLine(float value, float divisions, float width) {
    float scaled = value * divisions;
    float distanceToLine = abs(fract(scaled - 0.5) - 0.5) / fwidth(scaled);
    return 1.0 - min(distanceToLine / width, 1.0);
  }

  void main() {
    vec3 viewDir = normalize(-vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.6);
    float lambert = max(dot(viewDir, normalize(vNormal)), 0.0);

    float lat = vUv.y;
    float lon = vUv.x;
    float meridians = gridLine(lon, 24.0, 1.1);
    float parallels = gridLine(lat, 12.0, 1.1);
    float equator = gridLine(lat, 1.0, 1.4) * 0.9;
    float primeMeridian = gridLine(lon, 1.0, 1.4) * 0.55;
    float graticule = max(max(meridians, parallels) * 0.32, max(equator, primeMeridian));

    vec3 color = uBase * (0.35 + 0.65 * lambert);
    color += uGraticule * graticule * (0.32 + 0.5 * lambert);
    color += uRim * fresnel * 0.9;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const ATMOSPHERE_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 uGlow;
  void main() {
    vec3 viewDir = normalize(-vPosition);
    float rim = pow(0.72 - max(dot(viewDir, normalize(vNormal)), 0.0), 3.2);
    gl_FragColor = vec4(uGlow, 1.0) * max(rim, 0.0);
  }
`;

const POINTS_VERTEX = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float attenuated = aSize * (240.0 / -mvPosition.z);
    gl_PointSize = clamp(attenuated, 3.0, 26.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINTS_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered);
    float core = smoothstep(0.5, 0.08, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.45;
    float alpha = core + halo;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export function createGlobe(canvas, { onPick, onLodChange, onHover, reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x04070d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
  camera.position.set(0, 1.35, 4.6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  controls.minDistance = SCENE_EARTH_RADIUS * 1.12;
  controls.maxDistance = 16;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;

  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_EARTH_RADIUS, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: {
        uBase: { value: new THREE.Color("#16294a") },
        uRim: { value: new THREE.Color("#3a7fa0") },
        uGraticule: { value: new THREE.Color("#5d90ab") },
      },
    })
  );
  earthGroup.add(earth);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(SCENE_EARTH_RADIUS * 1.045, 64, 64),
    new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: { uGlow: { value: new THREE.Color("#2b7a96") } },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  earthGroup.add(atmosphere);

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 90 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.cos(phi);
    starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0x9fb6cc, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.7 })
  );
  scene.add(stars);

  const MAX_POINTS = 2000;
  const objectGeometry = new THREE.BufferGeometry();
  objectGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
  objectGeometry.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
  objectGeometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1));
  objectGeometry.setDrawRange(0, 0);
  objectGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SCENE_EARTH_RADIUS * 12);
  const objectPoints = new THREE.Points(
    objectGeometry,
    new THREE.ShaderMaterial({
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(objectPoints);

  let orbitLine = null;
  let lastOrbitPoints = [];
  let selectionRing = null;
  let cursorMarker = null;
  let entries = [];
  let renderedMap = new Map();
  let currentLod = "global";
  let hoverTarget = -1;

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 0.06 };

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  function pointerNdc(event) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function pick(event) {
    raycaster.setFromCamera(pointerNdc(event), camera);
    const threshold = 0.028 * camera.position.distanceTo(controls.target);
    raycaster.params.Points.threshold = threshold;
    const hits = raycaster.intersectObject(objectPoints, false);
    if (!hits.length) return null;
    const index = hits[0].index;
    return entries[index] ?? null;
  }

  canvas.addEventListener("pointermove", (event) => {
    const hit = pick(event);
    const next = hit ? entries.indexOf(hit) : -1;
    if (next !== hoverTarget) {
      hoverTarget = next;
      canvas.style.cursor = hit ? "pointer" : "grab";
      if (onHover) onHover(hit, event);
    } else if (onHover) {
      onHover(hit, event);
    }
  });

  let downAt = null;
  canvas.addEventListener("pointerdown", (event) => {
    downAt = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;
    const hit = pick(event);
    if (onPick) onPick(hit);
  });

  function updateObjects(nextEntries) {
    entries = nextEntries;
    renderedMap = new Map();
    const positions = objectGeometry.attributes.position.array;
    const colors = objectGeometry.attributes.aColor.array;
    const sizes = objectGeometry.attributes.aSize.array;
    let count = 0;
    for (const entry of entries) {
      if (!entry.geodetic) continue;
      const scene = geodeticToScene(entry.geodetic.lat_deg, entry.geodetic.lon_deg, entry.geodetic.alt_km);
      positions[count * 3] = scene.x;
      positions[count * 3 + 1] = scene.y;
      positions[count * 3 + 2] = scene.z;
      renderedMap.set(entry.object_id, {
        catalog_id: entry.catalog_id,
        geodetic: { ...entry.geodetic },
        scene: { ...scene },
      });
      const color = STATUS_COLORS[entry.position_status] ?? STATUS_COLORS.NO_SOLUTION;
      colors[count * 3] = color.r;
      colors[count * 3 + 1] = color.g;
      colors[count * 3 + 2] = color.b;
      sizes[count] = entry.position_status === "STALE" ? 1.15 : 1.35;
      count += 1;
      if (count >= MAX_POINTS) break;
    }
    objectGeometry.setDrawRange(0, count);
    objectGeometry.attributes.position.needsUpdate = true;
    objectGeometry.attributes.aColor.needsUpdate = true;
    objectGeometry.attributes.aSize.needsUpdate = true;
  }

  function clearOrbitLine() {
    if (orbitLine) {
      scene.remove(orbitLine);
      orbitLine.geometry.dispose();
      orbitLine.material.dispose();
      orbitLine = null;
    }
    lastOrbitPoints = [];
  }

  function showOrbitLine(samples, { color = "#67e8f9", opacity = 0.85 } = {}) {
    clearOrbitLine();
    const points = [];
    for (const sample of samples) {
      if (!sample?.geodetic) continue;
      const scenePoint = geodeticToScene(
        sample.geodetic.lat_deg,
        sample.geodetic.lon_deg,
        sample.geodetic.alt_km
      );
      points.push(new THREE.Vector3(scenePoint.x, scenePoint.y, scenePoint.z));
    }
    if (points.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity });
    orbitLine = new THREE.Line(geometry, material);
    scene.add(orbitLine);
    lastOrbitPoints = points.map((point) => ({ x: point.x, y: point.y, z: point.z }));
    return lastOrbitPoints;
  }

  function setSelection(entry) {
    if (selectionRing) {
      scene.remove(selectionRing);
      selectionRing.geometry.dispose();
      selectionRing.material.dispose();
      selectionRing = null;
    }
    if (!entry?.geodetic) return;
    const scenePoint = geodeticToScene(entry.geodetic.lat_deg, entry.geodetic.lon_deg, entry.geodetic.alt_km);
    const geometry = new THREE.RingGeometry(0.022, 0.03, 48);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#a5f3fc"),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    selectionRing = new THREE.Mesh(geometry, material);
    selectionRing.position.set(scenePoint.x, scenePoint.y, scenePoint.z);
    scene.add(selectionRing);
  }

  function setCursorMarker(scenePoint) {
    if (!cursorMarker) {
      const geometry = new THREE.SphereGeometry(0.012, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff"), transparent: true, opacity: 0.95 });
      cursorMarker = new THREE.Mesh(geometry, material);
      scene.add(cursorMarker);
    }
    if (scenePoint) {
      cursorMarker.visible = true;
      cursorMarker.position.set(scenePoint.x, scenePoint.y, scenePoint.z);
    } else {
      cursorMarker.visible = false;
    }
  }

  function focusCamera(entry) {
    if (!entry?.geodetic) return;
    const scenePoint = geodeticToScene(entry.geodetic.lat_deg, entry.geodetic.lon_deg, entry.geodetic.alt_km);
    const direction = new THREE.Vector3(scenePoint.x, scenePoint.y, scenePoint.z).normalize();
    const distance = reducedMotion ? SCENE_EARTH_RADIUS * 1.9 : SCENE_EARTH_RADIUS * 2.1;
    const targetPosition = direction.multiplyScalar(distance);
    if (reducedMotion) {
      controls.target.copy(new THREE.Vector3(scenePoint.x, scenePoint.y, scenePoint.z).multiplyScalar(0.4));
      camera.position.copy(targetPosition);
      controls.update();
      return;
    }
    animateCamera(targetPosition, new THREE.Vector3(scenePoint.x, scenePoint.y, scenePoint.z).multiplyScalar(0.35));
  }

  let cameraTweenId = 0;

  function animateCamera(toPosition, toTarget) {
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const start = performance.now();
    const duration = 900;
    const tweenId = ++cameraTweenId;
    function step(now) {
      if (tweenId !== cameraTweenId) return;
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(fromPosition, toPosition, eased);
      controls.target.lerpVectors(fromTarget, toTarget, eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function resetView() {
    cameraTweenId += 1;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 1.35, 4.6);
    controls.update();
  }

  function frameLoop() {
    requestAnimationFrame(frameLoop);
    if (document.hidden) return;
    controls.update();
    if (selectionRing) {
      selectionRing.lookAt(camera.position);
      const pulse = reducedMotion ? 1 : 1 + 0.12 * Math.sin(performance.now() / 320);
      selectionRing.scale.setScalar(pulse);
    }
    const distance = camera.position.length();
    const lod = selectionRing ? "focus" : lodForDistance(distance);
    if (lod !== currentLod) {
      currentLod = lod;
      if (onLodChange) onLodChange(lod, distance);
    }
    renderer.render(scene, camera);
  }
  frameLoop();

  return {
    updateObjects,
    showOrbitLine,
    clearOrbitLine,
    setSelection,
    setCursorMarker,
    focusCamera,
    resetView,
    lodForDistance,
    cameraDistance: () => camera.position.length(),
    cameraDirection: () => camera.position.clone().normalize(),
    getRenderedMap: () => renderedMap,
    getOrbitLinePoints: () => lastOrbitPoints,
    debugInfo: () => ({
      sceneChildren: scene.children.map((child) => child.type),
      orbitInScene: Boolean(orbitLine),
      orbitVisible: orbitLine ? orbitLine.visible : null,
      orbitGeometryDrawRange: orbitLine
        ? {
            start: orbitLine.geometry.drawRange.start,
            count: orbitLine.geometry.drawRange.count,
          }
        : null,
      cameraPosition: camera.position.toArray(),
      controlsTarget: controls.target.toArray(),
    }),
    __scene: scene,
    renderer,
  };
}

import * as THREE from '../vendor/three-r184.module.min.js';
import { pose } from './character-core.js';

export const surfaceNormal = (lat, lon) => {
  const p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(p) * Math.cos(t), Math.cos(p), Math.sin(p) * Math.sin(t));
};
export class PaperCharacter {
  constructor(data, images) {
    this.data = data; this.group = new THREE.Group(); this.facing = new THREE.Group(); this.group.add(this.facing);
    this.normal = surfaceNormal(data.placement.lat, data.placement.lon); this.group.position.copy(this.normal).multiplyScalar(1.003);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.normal);
    this.group.scale.setScalar(data.placement.scale); this.textures = []; this.parts = []; this.near = false; this.started = performance.now(); this.lastPose = -1;
    this.billboard = this.plane(images.runtime_3q, 1, 1); this.billboard.scale.x = images.runtime_3q.width / images.runtime_3q.height;
    this.billboard.position.y = .5; this.facing.add(this.billboard);
    this.layered = new THREE.Group(); this.facing.add(this.layered);
    for (const part of data.layers) {
      const texture = new THREE.Texture(images.parts_atlas); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
      const [x, y, w, h] = part.rect; texture.repeat.set(w, h); texture.offset.set(x, 1 - y - h); this.textures.push(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .06, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(part.width, part.height), material);
      mesh.position.set((.5 - part.pivot[0]) * part.width, (part.pivot[1] - .5) * part.height, 0);
      const pivot = new THREE.Group(); pivot.add(mesh); pivot.position.set(part.x, part.y, part.depth); this.layered.add(pivot); this.parts.push({ pivot, part });
    }
    // Shadow is geometry on the tangent plane, never baked into the character PNG.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.32, 24), new THREE.MeshBasicMaterial({ color: 0x162e30, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide }));
    shadow.scale.y = .46; shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; this.group.add(shadow); this.shadow = shadow;
  }
  plane(image, width, height) {
    const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; this.textures.push(texture);
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .06, depthWrite: false, side: THREE.DoubleSide }));
  }
  update(camera, height, now, { force = null, animate = true } = {}) {
    const toCamera = camera.position.clone().sub(this.group.position);
    // Horizon culling prevents drawing a paper figure through the opposite hemisphere.
    this.group.visible = this.normal.dot(toCamera) > -.02;
    if (!this.group.visible) return;
    const view = toCamera.clone().normalize(), up = this.normal.clone();
    // Exactly overhead, a strictly radial paper plane is edge-on. Keep the root radial,
    // but gently lean the artwork toward screen-up so a whole-globe view stays readable.
    const alignment = up.dot(view), lean = THREE.MathUtils.smoothstep(alignment, .78, .98) * .62;
    if (lean > 0) {
      const screenUp = up.clone().addScaledVector(view, -alignment);
      if (screenUp.lengthSq() < .025) screenUp.copy(camera.up).addScaledVector(view, -camera.up.dot(view));
      if (screenUp.lengthSq() < .000001) screenUp.set(1, 0, 0).addScaledVector(view, -view.x);
      up.lerp(screenUp.normalize(), lean).normalize();
    }
    const forward = toCamera.clone().addScaledVector(up, -toCamera.dot(up));
    if (forward.lengthSq() < .000001) forward.copy(new THREE.Vector3(0, 1, 0).cross(this.normal));
    if (forward.lengthSq() < .000001) forward.set(1, 0, 0);
    forward.normalize(); const right = up.clone().cross(forward).normalize();
    this.facing.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
    this.facing.quaternion.premultiply(this.group.quaternion.clone().invert());
    const pixels = this.data.placement.scale * height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * toCamera.length());
    if (force) this.near = force === 'layers';
    else if (this.near && pixels < this.data.lod.exit_px) this.near = false;
    else if (!this.near && pixels > this.data.lod.enter_px) this.near = true;
    this.billboard.visible = !this.near; this.layered.visible = this.near;
    // Each appearance animates for eight seconds, then settles. No extra render loop on the globe.
    const active = animate && now - this.started < 8000 && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = active ? Math.floor((now - this.started) / 50) : 0;
    if (tick !== this.lastPose) {
      for (const { pivot, part } of this.parts) { const q = pose(part, this.data.motion, tick / 20); pivot.rotation.z = q.angle; pivot.position.y = part.y + q.dy; }
      this.lastPose = tick;
    }
  }
  dispose() {
    this.group.removeFromParent(); this.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.textures.forEach(t => t.dispose());
  }
}
export async function loadPaperCharacter(data, urls) {
  const load = url => new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('캐릭터 이미지를 읽지 못했습니다.')); img.src = url; });
  const [runtime_3q, parts_atlas] = await Promise.all([load(urls.runtime_3q), load(urls.parts_atlas)]);
  return new PaperCharacter(data, { runtime_3q, parts_atlas });
}

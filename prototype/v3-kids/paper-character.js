import * as THREE from '../vendor/three-r184.module.min.js';
import { pose, bodyPose, movesFor, MOVES } from './character-core.js';

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
    /* 몸 전체를 담는 겹. 손이 닿았을 때의 동작은 파츠가 아니라 여기에 건다 —
       파츠는 한 장 그림에서 잘라 만들기 때문에 크게 움직이면 자른 자리가 드러난다.
       종이 인형을 손에 들고 흔드는 것과 같은 방식이라 파츠가 없어도 성립한다. */
    this.body = new THREE.Group(); this.facing.add(this.body);
    this.moves = movesFor(data); this.moveIdx = 0; this.move = null;
    this.billboard = this.plane(images.runtime_3q, 1, 1); this.billboard.scale.x = images.runtime_3q.width / images.runtime_3q.height;
    this.billboard.position.y = .5; this.body.add(this.billboard);
    this.layered = new THREE.Group(); this.body.add(this.layered);
    for (const part of (images.parts_atlas ? data.layers : [])) {
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
    // 파츠가 없으면 언제나 빌보드 한 장이다. 없는 겹으로 넘어가지 않는다.
    if (!this.parts.length) this.near = false;
    this.billboard.visible = !this.near; this.layered.visible = this.near;
    // Each appearance animates for eight seconds, then settles. No extra render loop on the globe.
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let playing = null;
    if (this.move && !still) {
      const u = (now - this.move.t0) / (this.move.sec * 1000);
      if (u >= 1) this.move = null; else playing = { id: this.move.id, u };
    }
    const active = !!playing || (animate && now - this.started < 8000 && !document.hidden && !still);
    const b = bodyPose(this.data.motion, active ? (now - this.started) / 1000 : 0, playing);
    this.body.position.y = b.dy;
    this.body.rotation.set(b.tx, b.ry, b.tz);
    this.body.scale.set(b.sx, b.sy, 1);
    // 뛰어오르면 그림자가 줄어든다. 발이 땅에 붙어 있는지가 그것으로 읽힌다.
    const sh = Math.max(.45, 1 - b.dy * 1.5);
    this.shadow.scale.set(sh, .46 * sh, 1);
    // 동작 중에는 촘촘히, 쉬는 동안은 20Hz. 한 번에 움직이는 캐릭터는 하나뿐이다.
    const tick = active ? Math.floor((now - this.started) / (playing ? 16 : 50)) : 0;
    if (tick !== this.lastPose || playing) {
      const secs = playing ? (now - this.started) / 1000 : tick / 20;
      for (const { pivot, part } of this.parts) { const q = pose(part, this.data.motion, secs, b.arm); pivot.rotation.z = q.angle; pivot.position.y = part.y + q.dy; }
      this.lastPose = tick;
    }
  }
  /** 손이 닿았을 때. 누를 때마다 다음 동작으로 넘어가 3~5가지를 차례로 보여 준다. */
  play() {
    if (!this.moves.length) return null;
    const id = this.moves[this.moveIdx++ % this.moves.length];
    this.move = { id, t0: performance.now(), sec: MOVES[id].sec };
    this.started = performance.now();
    return id;
  }
  dispose() {
    this.group.removeFromParent(); this.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.textures.forEach(t => t.dispose());
  }
}
export async function loadPaperCharacter(data, urls) {
  const load = url => new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('캐릭터 이미지를 읽지 못했습니다.')); img.src = url; });
  const [runtime_3q, parts_atlas] = await Promise.all([load(urls.runtime_3q), urls.parts_atlas ? load(urls.parts_atlas) : null]);
  return new PaperCharacter(data, { runtime_3q, parts_atlas });
}

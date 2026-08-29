import { SKY_ASSET_MANIFEST } from '../space/skybox/earthus-milky-way/sky-asset-manifest.js';

function actualTextureLimit(scene) {
  try {
    const gl = scene.context?._gl || scene.canvas?.getContext?.('webgl2') || scene.canvas?.getContext?.('webgl');
    return Number(gl?.getParameter?.(gl.MAX_TEXTURE_SIZE) || 0);
  } catch (_) { return 0; }
}

export function selectSkyVariant(scene, { fallbackLevel = 0 } = {}) {
  const variants = SKY_ASSET_MANIFEST.variants;
  const limit = actualTextureLimit(scene);
  const memoryGb = Number(navigator.deviceMemory || 0);
  const desktop = innerWidth >= 1024 && matchMedia('(pointer:fine)').matches;
  const constrained = navigator.connection?.saveData === true
    || matchMedia('(prefers-reduced-motion: reduce)').matches
    || (memoryGb > 0 && memoryGb < 4);
  const id = !constrained && desktop && limit >= 6000 && (!memoryGb || memoryGb >= 6)
    ? 'desktop-6k' : (limit >= 4096 && !constrained ? 'desktop-4k' : 'mobile-2k');
  const baseIndex = Math.max(0, variants.findIndex(item => item.id === id));
  const selected = variants[Math.min(variants.length - 1, baseIndex + fallbackLevel)]
    || variants[variants.length - 1];
  if (selected.width > limit && limit > 0) return variants[variants.length - 1];
  return selected;
}

export function installMilkyWayPanorama(scene) {
  let panorama = null;
  let loadToken = 0;
  let fallbackLevel = 0;
  let visible = true;
  try { fallbackLevel = Math.max(0, Math.min(2,
    Number(sessionStorage.getItem('earthus.webglFallbackLevel') || 0))); } catch (_) { }

  const controller = {
    get variant() { return selectSkyVariant(scene, { fallbackLevel }); },
    get visible() { return visible; },
    fallback() { fallbackLevel = Math.min(2, fallbackLevel + 1); return add(); },
    hide() {
      visible = false;
      if (panorama) panorama.show = false;
      scene.skyBox.show = false;
      scene.requestRender();
    },
    show() {
      visible = true;
      if (panorama) panorama.show = true;
      else add();
      scene.skyBox.show = false;
      scene.requestRender();
    },
  };

  const add = () => {
    const selected = selectSkyVariant(scene, { fallbackLevel });
    /* Resolve from this module, not from the document URL. EARTHUS V2 lives under
       /v2/, so a document-relative "space/..." incorrectly became /v2/space/....
       Module-relative resolution keeps the canonical /space/ asset for both 1.0 and V2. */
    const url = new URL(`../space/skybox/earthus-milky-way/${selected.file}`, import.meta.url).href;
    const token = ++loadToken;
    const image = new Image();
    image.onload = () => {
      if (token !== loadToken) return;
      if (image.naturalWidth !== selected.width || image.naturalHeight !== selected.height) {
        fail('SKY_ASSET_DIMENSION_MISMATCH'); return;
      }
      if (panorama) scene.primitives.remove(panorama);
      const rotation = Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(46));
      panorama = scene.primitives.add(new Cesium.EquirectangularPanorama({
        transform: Cesium.Matrix4.fromRotationTranslation(rotation), image: url,
        radius: 500_000_000,
        credit: '<a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener">ESO/S. Brunier · CC BY 4.0</a>',
      }));
      panorama.show = visible;
      scene.skyBox.show = false;
      scene.requestRender();
    };
    image.onerror = () => { if (token === loadToken) fail('SKY_ASSET_LOAD_FAILED'); };
    image.src = url;
    return selected;
  };
  const fail = reason => {
    if (fallbackLevel < 2) {
      fallbackLevel += 1;
      try { sessionStorage.setItem('earthus.webglFallbackLevel', String(fallbackLevel)); } catch (_) { }
      add();
    } else {
      console.warn('[sky]', reason); // URL·query·위치정보는 기록하지 않는다.
      scene.skyBox.show = visible;
      scene.requestRender();
    }
  };
  globalThis.__earthusSkyPanorama = controller;
  add();
  const canvas = scene.canvas;
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallbackLevel = Math.min(2, fallbackLevel + 1);
    /* Cesium 1.143은 같은 WebGL context를 강제로 복원하면 일부 GPU에서 shader가
       재컴파일되지 않아 렌더가 영구 정지한다. 새 context로 viewer를 한 번 재부팅하고
       천구를 한 단계 낮춘다. 세션당 2회 제한으로 재시작 루프를 만들지 않는다. */
    let attempts = 0;
    try {
      attempts = Number(sessionStorage.getItem('earthus.webglRecoveryAttempts') || 0);
      sessionStorage.setItem('earthus.webglFallbackLevel', String(fallbackLevel));
      sessionStorage.setItem('earthus.webglRecoveryAttempts', String(attempts + 1));
    } catch (_) { }
    if (attempts < 2) setTimeout(() => location.reload(), 60);
    else {
      let box = document.getElementById('webglUnavailable');
      if (!box) {
        box = document.createElement('div');
        box.id = 'webglUnavailable'; box.setAttribute('role', 'alert');
        box.style.cssText = 'position:fixed;inset:auto 16px 18px;z-index:50;padding:12px 14px;border-radius:12px;background:#151b25;color:#eef7fb;font:13px/1.5 system-ui;text-align:center';
        box.innerHTML = '그래픽 화면을 복구할 수 없습니다. <button type="button" style="margin-left:8px">다시 열기</button>';
        box.querySelector('button').onclick = () => location.reload();
        document.body.appendChild(box);
      }
      document.dispatchEvent(new CustomEvent('earthus:webgl-unavailable'));
    }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    /* 정상 브라우저 자동 복구 경로. reload가 먼저 시작됐으면 이 callback은 폐기된다. */
    if (!scene.isDestroyed?.()) { add(); scene.requestRender(); }
  });
  return controller;
}

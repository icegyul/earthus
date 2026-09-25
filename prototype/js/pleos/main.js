// EARTHUS Pleos 진입점 — EARTHUS 전용
//
// ⚠️ 본 앱의 js/main.js 를 쓰지 않는다. main.js 는 우주 제품 모듈 폴더를 정적 import 한다
//    (docs/pleos/SOURCE_SURVEY.md §2). 이 파일에서 시작하는 모듈 그래프에는 그 모듈도, 그 제품 이름도
//    없어야 하고, tools/test_pleos_product_separation.mjs 가 그래프를 따라가 검사한다.
// ⚠️ Service Worker 를 등록하지 않는다 (sw.js 에 다른 제품의 캐시 로직이 함께 있다).

import { assertPleosTarget, rejectedQueryKeys } from './pleos-target.js';
import { createHostBridge } from './host-bridge.js';
import { createPleosRepository } from './repository.js';
import { createPleosApp } from './app.js';

const REFRESH_MS = 10 * 60_000;   // 특보 레이어와 같은 주기 (layers/registry.js alerts). 화면이 가려지면 멈춘다.

const target = assertPleosTarget();
const root = document.getElementById('pleos-app');

if (rejectedQueryKeys(location.search).length) {
  // 허용하지 않은 딥링크(다른 제품의 주소 포함)로 들어오면 열지 않는다. 경로를 등록하지도 않는다.
  root.innerHTML = '<div class="pl-screen" data-product="EARTHUS" data-platform="PLEOS" data-route-rejected="true">'
    + '<header class="pl-top"><strong class="pl-brand">EARTHUS</strong></header>'
    + '<main><p class="pl-notice">이 주소는 차량 화면에서 열 수 없습니다.</p></main></div>';
} else {
  const bridge = createHostBridge(window);
  const app = createPleosApp({ bridge, repository: createPleosRepository(), root });
  app.attach();
  app.paint();
  app.refresh();

  let timer = null;
  const start = () => { if (!timer) timer = setInterval(() => app.refresh(), REFRESH_MS); };
  const stop = () => { clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : (app.refresh(), start())));
  start();

  // 시험·진단용 (제품 대상과 화면 상태만 노출한다)
  window.__EARTHUS_PLEOS__ = Object.freeze({ target, app });
}

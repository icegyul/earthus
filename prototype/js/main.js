// 진입점
import { initViewer, viewer, scene, cameraHeight, onCameraIdle, flyTo, setAmbientView, fitGlobeHeight } from './viewer.js';
import { alarms } from './alarms.js';
import { windField } from './windfield.js';
import { myLocation } from './mylocation.js';
import { layerBar } from './layerbar.js';
import { power } from './power.js';
import { panels } from './panels.js';
import { drift } from './drift.js';
import { renderQuality } from './render-quality.js';
import { store } from './store.js';
import { registry } from './layers/registry.js';
import { imagery } from './layers/imagery.js';
import { chrome, chips, sheet, banner, settings, hud, bindModeTransition, toast } from './ui.js';
import { i18n } from './i18n.js';
import { initAccount, loginSheet, consentSheet, accountSheet,
         legalView, waitlistUI } from './ui-account.js';
import { renderChangelog } from './changelog.js';
import { satPanel } from './ui-sat.js';
import { skyPanel } from './ui-sky.js';
import { flightPanel } from './ui-flight.js';
import { subscribeSheet, demandSheet } from './ui-subscribe.js';
import { communityPanel } from './ui-community.js';
import { askPanel } from './ask/panel.js';
import { sourceNote } from './ui-source.js';
import { warn } from './warn.js';
import { warnUI } from './ui-warn.js';
import { koreaPanel } from './ui-korea.js';
import { apiKeysPanel } from './ui-apikeys.js';
import { eventPanel } from './ui-events.js';

async function boot() {
  initViewer('cesiumContainer');
  setAmbientView(127, 25);

  // 화면 크기가 바뀌면 Ambient 상태일 때만 지구 크기를 다시 맞춘다
  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (store.mode !== 'ambient') return;
      const c = viewer.camera.positionCartographic;
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(
        Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude), fitGlobeHeight()) });
    }, 250);
  });

  power.init();
  /* 움직이는 게 화면에 있으면 계속 그려달라고 알린다 (requestRenderMode 대응).
     ⚠️ 여기 패턴을 빠뜨리면 그 애니메이션만 조용히 멈춘다.
        렌더를 요청하는 쪽이 없어 화면이 갱신되지 않기 때문이다.
        새 애니메이션 엔티티를 만들면 id 를 여기 규칙에 맞추거나 패턴을 추가할 것.
          rip      — 지진·화산 파문
          arm      — 태풍 나선팔 (회전)
          gyreflow — 해류 환류 흐름 */
  /* ⚠️ 여기 있던 파문 감지 스캔을 없앴다 (발열 원인 — power.js 주석 참고).
     이제 애니메이션을 만드는 쪽(pointLayer 파문, cyclone 나선팔)이
     필요한 시간만큼만 power.animate() 를 부르고 스스로 정적으로 바뀐다. */
  renderQuality.init();
  drift.init();
  panels.init();
  bindModeTransition();
  hud.init();
  chips.init();
  alarms.init();
  layerBar.init();

  // 내 위치 — 실패해도 조용히 넘어간다 (HTTP 접속·권한 거부 등)
  windField.init();
  myLocation.init();

  /* 위치 응답이 오기 전에 사람이 지구를 만졌는지 기록한다.
     ⚠️ 이게 없으면 이미 다른 대륙을 돌려보던 사람의 화면을
        몇 초 뒤 도착한 위치가 갑자기 끌고 간다. 조작을 빼앗는 것이다. */
  let userTouchedGlobe = false;
  scene.canvas.addEventListener('pointerdown', () => { userTouchedGlobe = true; },
                               { once: true, passive: true });
  scene.canvas.addEventListener('wheel', () => { userTouchedGlobe = true; },
                               { once: true, passive: true });
  myLocation.locate().then(c => {
    document.querySelector('#menuMain [data-act="locate"]')?.classList.toggle('on', !!c);

    /* ⚠️ 위치는 특보를 받은 뒤에 도착한다. 그때 '내 주변'을 다시 계산하지 않으면
       2km 앞에 폭염경보가 있는데도 "내 주변에 특보 없음"이라고 나온다. */
    warn.recheck();

    /* 시작하면 지구가 내 위치로 돌아간다.
       ⚠️ 확대하지 않는다 — 지구 전체가 보이는 높이를 유지한 채 경도·위도만 돈다.
          "아름다운 지구를 먼저 보자"가 이 화면의 목적이므로, 내 나라로 파고드는
          대신 내가 지구의 어디에 있는지를 보여주는 쪽이 맞다.
       ⚠️ 위치를 못 받으면 아무것도 하지 않는다. 기본 시점(127, 25)에 그대로 있는다 —
          엉뚱한 곳으로 날아가는 것보다 가만히 있는 게 낫다.
       ⚠️ 사람이 이미 지구를 만졌으면 가로채지 않는다. 위치 응답은 몇 초 걸릴 수 있고,
          그 사이 돌려보던 사람의 화면을 갑자기 끌고 가면 조작을 빼앗는 것이 된다. */
    if (!c || userTouchedGlobe) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, fitGlobeHeight(0.52)),
      duration: 2.6,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      // 도는 동안 계속 그려야 한다 (requestRenderMode)
      complete: () => power.animate(400),
    });
    power.animate(3000);
  });
  // 1단 메뉴 동작 — 누르면 실행하고 메뉴는 닫힌다
  layerBar.onAction('locate', async () => {
    if (!myLocation.coords) await myLocation.locate();
    if (!myLocation.flyTo()) toast(myLocation.reason() || '');
  });
  layerBar.onAction('globe', () => {
    const c = viewer.camera.positionCartographic;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(
      c.longitude, c.latitude, fitGlobeHeight()), duration: 1.4 });
  });
  layerBar.onAction('sat', () => satPanel.open());
  layerBar.onAction('sky', () => skyPanel.open());
  layerBar.onAction('flight', () => flightPanel.open());
  layerBar.onAction('community', () => communityPanel.open());
  layerBar.onAction('events', () => eventPanel.open());
  layerBar.onAction('korea', () => koreaPanel.open());
  layerBar.onAction('ask', () => askPanel.open());
  layerBar.onAction('settings', () => document.getElementById('settings').classList.add('up'));
  sheet.init();
  settings.init();
  banner.init();

  // 카메라 → 스토어 (매 프레임, 변화 시에만 emit)
  scene.preRender.addEventListener(() => {
    const h = cameraHeight();
    store.setHeight(h);
    imagery.updateForHeight(h);   // 고도별 주야 처리 (§5-9)
    hud.update();
  });

  // 뷰포트 기반 로딩 (§5-1)
  onCameraIdle(() => registry.onCameraIdle());

  // 핀 / 클러스터 클릭
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction(ev => onPick(ev), Cesium.ScreenSpaceEventType.LEFT_CLICK);

  bindAccountUI();

  await registry.init();
  await chrome.init();
  await initAccount();
  satPanel.init();
  skyPanel.init();
  await flightPanel.init();
  communityPanel.init();
  eventPanel.init();
  askPanel.init();
  sourceNote.init();
  /* 기상특보 — 한국 안에 있을 때만 띠가 뜬다.
     ⚠️ await 하지 않는다. 특보 서버가 느리다고 지구본이 늦게 뜨면 안 된다. */
  warnUI.init();
  koreaPanel.init();
  warn.init();
  apiKeysPanel.init();
  document.getElementById('btnApi')?.addEventListener('click', () => apiKeysPanel.open());

  // 개발용 전역 핸들 (콘솔에서 __e.viewer 등으로 접근)
  window.__e = { viewer, scene, store, registry, i18n, imagery,
                 orbits: (await import('./layers/space.js')).orbits };

  document.getElementById('loading').classList.add('gone');
  setTimeout(() => document.getElementById('loading')?.remove(), 700);
}


/* ── 회원 · 법적 문서 배선 ─────────────────────────────────── */
function bindAccountUI() {
  const $ = s => document.querySelector(s);
  const open  = id => $('#' + id).classList.add('up');
  const close = id => $('#' + id).classList.remove('up');

  // 설정 → 각 화면
  $('#btnAccount').onclick  = () => { close('settings'); accountSheet.open(); };
  $('#btnWaitlist').onclick = () => { close('settings'); open('waitlistSheet'); waitlistUI.init(); };
  $('#btnTerms').onclick    = () => { close('settings'); legalView.open('terms'); };
  $('#btnPrivacy').onclick  = () => { close('settings'); legalView.open('privacy'); };
  $('#btnChangelog').onclick = () => {
    close('settings');
    $('#clTitle').textContent = i18n.lang === 'ko' ? '업데이트' : 'Updates';
    $('#clBody').innerHTML = renderChangelog(i18n.lang);
    open('changelogSheet');
  };

  // 닫기 버튼 일괄
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => close(b.dataset.close);
  });

  // 로그인
  $('#btnSignIn').onclick = () => { accountSheet.close(); loginSheet.open(); };
  $('#btnGoogle').onclick = () => loginSheet.go('google');
  $('#btnApple').onclick  = () => loginSheet.go('apple');

  // 계정
  $('#btnExport').onclick  = () => accountSheet.exportData();
  $('#btnSignOut').onclick = () => accountSheet.signOut();
  $('#btnDelete').onclick  = () => accountSheet.deleteAccount();

  // 동의
  $('#cAll').onchange = e => consentSheet.toggleAll(e.target.checked);
  ['cTos','cPrivacy','cAge','cMarketing','cLocation'].forEach(id => {
    $('#' + id).onchange = () => consentSheet.sync();
  });
  $('#consentSubmit').onclick = () => consentSheet.submit();
  $('#consentCancel').onclick = () => consentSheet.cancel();

  // 사전등록
  $('#wlForm').onsubmit = e => waitlistUI.submit(e);

  // 본문 안의 약관/처리방침 링크
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-legal]');
    if (!a) return;
    e.preventDefault();
    legalView.open(a.dataset.legal);
  });
}

function onPick(ev) {
  const picked = scene.pick(ev.position);

  // 클러스터 → 확대
  if (Cesium.defined(picked) && Array.isArray(picked.id)) {
    const pts = picked.id
      .map(e => e.position?.getValue(viewer.clock.currentTime))
      .filter(Boolean);
    if (pts.length) {
      const rect = Cesium.Rectangle.fromCartesianArray(pts, Cesium.Ellipsoid.WGS84);
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.expand(rect, 0.35),
        duration: 1.1,
      });
    }
    return;
  }

  /** 화면 좌표 → 지표의 위경도. 지구를 안 가리켰으면 null. */
  const ground = () => {
    const cart = scene.camera.pickEllipsoid(ev.position, scene.globe.ellipsoid);
    if (!cart) return null;
    const c = Cesium.Cartographic.fromCartesian(cart);
    return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude) };
  };

  // 엔티티 → 정보 시트
  if (Cesium.defined(picked) && picked.id?._meta) {
    const m = { ...picked.id._meta, _layerId: picked.id._layer };

    /* 넓은 면을 덮는 현상(열돔·환류)은 그 안을 눌러도 현상 정보만 떴다.
       그러면 "어느 도시가 열돔 안에 있나"를 볼 수가 없다.
       → 누른 지점의 날씨·지명을 열고, 현상은 배경 설명으로 함께 붙인다. */
    if (m._area) {
      const g = ground();
      if (g) {
        store.select({
          id: 'pt', kind: 'stations',
          name: `${g.lat.toFixed(2)}, ${g.lon.toFixed(2)}`,
          lat: g.lat, lon: g.lon,
          data: { _lazy: true },
          _ctx: m,                       // 시트 아래에 현상 설명을 덧붙인다
        });
        return;
      }
    }
    store.select(m);
    return;
  }

  // 빈 곳 탭 → Explore 상태면 그 지점 날씨 (§10 Phase1-5)
  if (store.mode === 'explore') {
    const g = ground();
    if (g) {
      store.select({
        id: 'pt', kind: 'stations',
        name: `${g.lat.toFixed(2)}, ${g.lon.toFixed(2)}`,
        lat: g.lat, lon: g.lon, data: { _lazy: true },
      });
      return;
    }
  }
  store.clearSelect();
}

// 언어 변경 → 데이터 라벨 재생성
i18n.onChange(() => { if (registry.ready) registry.refreshAll(); });

boot().catch(e => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = '초기화 실패: ' + e.message;
});

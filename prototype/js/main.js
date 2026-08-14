// 진입점
/* viewer.js는 여러 모듈이 공유하는 싱글턴이다. 이 import 하나에만 버전을 붙이면
   scene/viewer 인스턴스가 둘로 갈라져 power 초기화 전에 undefined가 된다. */
import { initViewer, viewer, scene, cameraHeight, onCameraIdle, flyTo, setAmbientView, fitGlobeHeight } from './viewer.js';
import { alarms } from './alarms.js';
import { windField } from './windfield.js';
import { myLocation } from './mylocation.js';
import { layerBar } from './layerbar.js?v=20260814-aetherusv3';
import { search } from './search.js';
import { onboard } from './onboard.js';
import { weatherPanel } from './ui-weather.js';
import { power } from './power.js';
import { panels } from './panels.js';
import { intro } from './intro.js';
import { renderQuality } from './render-quality.js';
import { store } from './store.js';
import { earthViewState } from './earth-view-state.js';
import { hasEarthRoute } from './earth-route-state.js';
import { registry } from './layers/registry.js';
import { imagery } from './layers/imagery.js';
import { chrome, chips, sheet, banner, settings, hud, bindModeTransition, toast } from './ui.js';
import { i18n } from './i18n.js';
import { auth } from './auth.js';
import { CONFIG } from './config.local.js';   // ⚠️ config.js 가 아니다 — CONFIG 는 여기 있다
import { subscriptionUiAllowed } from './access-mode.js';
import { initAccount, loginSheet, consentSheet, accountSheet,
         legalView, waitlistUI } from './ui-account.js';
import { analytics } from './analytics.js';
import { renderChangelog } from './changelog.js';
import { satPanel } from './ui-sat.js';
// 별보기 근거 베타는 서비스워커의 이전 Sky 패널 캐시를 재사용하면 공개 화면에
// 나타나지 않는다. 화면 계약이 바뀔 때만 revision을 올려 새 모듈을 받는다.
import { skyPanel } from './ui-sky.js';
import { flightPanel } from './ui-flight.js';
import { subscribeSheet, demandSheet } from './ui-subscribe.js';
import { communityPanel } from './ui-community.js';
import { askPanel } from './ask/panel.js';
import { sourceNote } from './ui-source.js';
import { readability } from './readability.js';
import { decisionRail } from './decision-rail.js';
import { continuousContours } from './continuous-contours.js';
import { warn } from './warn.js';
import { warnUI } from './ui-warn.js';
import { koreaPanel } from './ui-korea.js?v=20260814-n5';
import { japanPanel } from './ui-japan.js';
import { mountainPanel } from './ui-mountain.js';
import { surfPanel } from './ui-surf.js';
import { fishPanel } from './ui-fishing.js';
import { outdoorPanel } from './ui-outdoor.js';
import { oceanPanel } from './ui-ocean.js?v=20260814-oceanv1';
import { paraPanel } from './ui-para.js';
import { apiKeysPanel } from './ui-apikeys.js';
import { eventPanel } from './ui-events.js';
import { activeBar } from './ui-active.js';
import { sceneMgr } from './scene.js';
import { initSkyframeDiagnostic } from './space/skyframe.js';
import { cosmic3d } from './space/cosmic3d.js?v=20260814-aetherusv3';
import { decodeAetherusRoute, replaceAetherusRoute } from './space/route-state.js';
import { trenchCards } from './ocean/trenchcards.js';
import { trenchGlobe } from './ocean/trenchglobe.js';

/* 늦게 불러오는 바다거북 모듈을 붙잡아 두는 곳.
   ⚠️⚠️ **모듈 바깥에 둔다.** 켜는 쪽은 boot(), 끄는 쪽(OFF·HAS_MARKS)은
      bindAccountUI() 라 **함수가 서로 다르다.** boot() 안에 두었더니
      끄는 쪽에서 `turtleMod is not defined` 가 났다 —
      panels._fire 의 try/catch 가 삼켜서 "칩이 안 뜬다"로만 보였다. */
let turtleMod = null;
let seabirdMod = null;
let migbirdMod = null;
let ecobirdMod = null;

/* 여러 자료를 받는 레이어의 실제 작업 상태를 한 곳에서 표시한다.
   key별로 잡아 둬 한 요청이 먼저 끝났다고 다른 요청의 막대까지 숨기지 않는다. */
const runtimeLoads = new Map();
let runtimeLoadHideTimer = null;
document.addEventListener('earthus:runtime-loading', event => {
  const box = document.getElementById('runtimeLoading');
  if (!box) return;
  const { key, active } = event.detail || {};
  if (!key) return;
  if (active) runtimeLoads.set(key, Date.now());
  else runtimeLoads.delete(key);
  clearTimeout(runtimeLoadHideTimer);

  if (runtimeLoads.size) {
    const text = document.getElementById('runtimeLoadingText');
    if (text) text.textContent = i18n.lang === 'ko'
      ? '태풍 자료를 불러오는 중…'
      : 'Loading cyclone data…';
    box.hidden = false;
    box.classList.remove('done', 'on');
    /* 같은 레이어를 다시 켰을 때 0부터 시작하도록 애니메이션 상태를 재설정한다. */
    void box.offsetWidth;
    box.classList.add('on');
    return;
  }

  box.classList.remove('on');
  box.classList.add('done');
  runtimeLoadHideTimer = setTimeout(() => {
    if (runtimeLoads.size) return;
    box.hidden = true;
    box.classList.remove('done');
  }, 280);
});

function exposeStudioCapture() {
  window.__e = window.__e || {};
  Object.assign(window.__e, {
    viewer,
    scene,
    studio: {
      /* ⚠️⚠️ 스튜디오 캡처 중에만 인트로를 멈춘다. 무한 애니메이션을
         영상 제작 수단으로 쓰지 않고, 각 프레임은 스튜디오가 직접 이동시킨다. */
      pause() {
        intro.stop();
        try { viewer.camera.cancelFlight(); } catch (_) { }
        scene.requestRender();
      },
      /* ⚠️ Cesium은 preserveDrawingBuffer가 꺼져 있다. render()와 읽기를
         같은 호출 안에서 이어야 빈 PNG가 나오지 않는다. 둘을 분리하지 말 것. */
      capture() {
        scene.render();
        return scene.canvas.toDataURL('image/png');
      },
    },
  });
}

async function boot() {
  initViewer('cesiumContainer');
  /* 부가 패널과 원격 자료가 모두 준비될 때까지 기다리면 느린 자료 하나 때문에
     스튜디오 연결도 같이 늦어진다. 캡처에 필요한 지구본 손잡이는 바로 연다. */
  exposeStudioCapture();
  setAmbientView(127, 25);
  /* 등치선은 gridoverlay의 ready 이벤트보다 먼저 구독해야 딥링크 첫 렌더도 놓치지 않는다. */
  continuousContours.init();
  // B0 실험은 ?skyframe=1에서만 보인다. 일반 방문자 화면에는 진단 마커를 섞지 않는다.
  initSkyframeDiagnostic(viewer);

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
  sceneMgr.init();
  cosmic3d.init();
  trenchCards.init();
  trenchGlobe.init();
  // 수심 장면을 공유하거나 동일 좌표로 재현할 수 있게 한다.
  // ⚠️ 좌표만 받고 수심은 반드시 배포된 GEBCO 격자에서 다시 읽는다.
  const sceneParams = new URLSearchParams(location.search);
  const diveParam = sceneParams.get('dive');
  const oceanRoute = sceneParams.get('ocean') === '1';
  const oceanHubRoute = sceneParams.get('ocean') === 'hub' || sceneParams.get('ocean-hub') === '1';
  /* 잘못된 수동 URL에 두 서비스 route가 섞여도 장면 복원기가 경쟁하지 않는다.
     해구(좌표 계약) > Earth의 명시 상태 > AETHERUS 순으로 하나만 선택한다. */
  const earthRouteRequested = hasEarthRoute(sceneParams);
  const aetherusRoute = diveParam || oceanRoute || earthRouteRequested
    ? null : decodeAetherusRoute(sceneParams);
  let aetherusRouteSyncReady = !aetherusRoute?.stage;
  const syncAetherusRoute = state => {
    try {
      if (state) earthViewState.leaveForForeignRoute();
      replaceAetherusRoute(state || null);
    } catch (error) {
      console.warn('[aetherus-route]', error.message);
    }
  };
  document.addEventListener('aetherus:state', event => {
    if (!aetherusRouteSyncReady) return;
    syncAetherusRoute(event.detail);
  });
  if (diveParam) {
    const [lat, lon] = diveParam.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90) {
      queueMicrotask(async () => {
        try {
          await sceneMgr.to('earth', { stage: 'trench' });
          await trenchGlobe.openAt(lat, lon);
        } catch (error) {
          console.warn('[dive-link]', error.message);
        }
      });
    }
  } else if (oceanRoute) {
    queueMicrotask(() => sceneMgr.to('earth', { stage: 'trench' }).catch(error => {
      console.warn('[ocean-link]', error.message);
    }));
  } else if (aetherusRoute?.stage) {
    queueMicrotask(async () => {
      try {
        await sceneMgr.to('space', { stage: aetherusRoute.stage });
        await cosmic3d.restoreRoute(aetherusRoute);
      } catch (error) {
        console.warn('[aetherus-link]', error.message);
      } finally {
        aetherusRouteSyncReady = true;
        syncAetherusRoute(cosmic3d.routeState());
      }
    });
  }
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
  panels.init();
  bindModeTransition();
  hud.init();
  chips.init();
  alarms.init();
  /* ⚠️ 첫 로드에도 정적 문구를 맞춘다. setLang 때만 부르면
     영어로 저장해 둔 사용자가 새로고침했을 때 메뉴만 한국어로 돌아온다. */
  i18n.applyStatic();
  layerBar.init();
  earthViewState.init({
    layerBar,
    sceneMgr,
    sourceNote,
    flyTo,
    canOpenLayer: id => layerBar.canOpenLayer(id),
    foreignRouteActive: !!diveParam || oceanRoute,
  });
  layerBar.onAction('earth-home', () => sceneMgr.to('earth', { stage: 'earth' }));
  layerBar.onAction('earth-surface', async () => {
    await sceneMgr.to('earth', { stage: 'surface' });
    // 수면은 별도 장면이 아니다. 현재 지구본에 해수면 온도 격자를 올린다.
    store.setLayer('sst', true);
  });
  document.addEventListener('aetherus:photo', async event => {
    const request = typeof event.detail === 'string'
      ? { telescope: event.detail }
      : (event.detail || {});
    if (store.scene !== 'space') await sceneMgr.to('space', { stage: 'solar' });
    await cosmic3d.openPhotoAtlas(request.telescope || 'ALL', request.photo || null);
  });
  /* 통합 메뉴의 AETHERUS 갈래. 메뉴가 장면 위를 두 군데에서 덮지 않게 하되,
     기존 은하·태양계·사진관의 실제 이동 동작은 하나도 줄이지 않는다. */
  document.addEventListener('aetherus:route', async event => {
    const route = event.detail;
    if (route === 'galaxy-structure' || route === 'milkyway') {
      await sceneMgr.to('space', { stage: 'milkyway' });
      document.dispatchEvent(new CustomEvent('aetherus:galaxy-guide'));
      return;
    }
    if (route === 'photos' || route === 'hubble' || route === 'webb') {
      document.dispatchEvent(new CustomEvent('aetherus:photo', {
        detail: { telescope: route === 'webb' ? 'JWST' : route === 'hubble' ? 'HST' : 'ALL' },
      }));
      return;
    }
    const stage = { galaxies: 'galaxies', solar: 'solar' }[route];
    if (stage) await sceneMgr.to('space', { stage });
  });
  activeBar.init();       // 지금 켜진 레이어 줄 (감사 3차)
  search.init();          // ⌘K · 우상단 돋보기
  /* ⚠️ 오늘의 볼거리 칩(최고 파고·수온·기온)은 **첫 화면에서 뺐다.**
     받은 지시: "밑에 최고파도 최고 수온 그런거 다 빼줘. 처음 보자마자
                 아름다운 지구와 기초 정보만 보여주고 싶어."
     칩 자체는 살려 둔다 — 코치마크가 참조하고, 나중에 다른 자리에 쓸 수 있다.
     지금은 그리지 않을 뿐이다. */
  /* 첫 화면은 지구·날짜·시각·현재 날씨만 감상하게 한다.
     ⚠️ 선택 전 활동 CTA와 같은 이유로 코치마크도 자동 노출하지 않는다. */
  onboard.init({ chips: false, coach: false });
  weatherPanel.init();    // 하단 온도 탭 → 내 자리 날씨 시트

  // 내 위치 — 실패해도 조용히 넘어간다 (HTTP 접속·권한 거부 등)
  windField.init();
  myLocation.init();

  /* 위치 응답이 오기 전에 사람이 화면을 쓰기 시작했는지 기록한다.
     ⚠️ 이게 없으면 이미 다른 대륙을 돌려보던 사람의 화면을
        몇 초 뒤 도착한 위치가 갑자기 끌고 간다. 조작을 빼앗는 것이다. */
  /* 공유된 우주·해구 주소도 사용자의 명시적 선택이다. 위치 응답·인트로가 뒤늦게
     카메라를 지구 첫 화면으로 빼앗으면 딥링크가 0m에서 멈춘 것처럼 보인다. */
  /* Earth Data/Evidence 딥링크도 이미 '사용자가 원하는 화면'이다. 이 경로에서
     아름다운 첫 화면용 intro를 시작하면 읽는 동안 30fps Cesium 렌더가 남는다. */
  let userEngaged = !!(diveParam || oceanRoute || oceanHubRoute
    || earthRouteRequested || aetherusRoute?.stage);
  let geoTookOver = false;
  /* 지구뿐 아니라 메뉴·검색을 먼저 누른 것도 "이미 사용 중"이다.
     그 뒤 위치 응답이나 인트로가 카메라를 움직이면 조작을 빼앗고 발열도 남긴다. */
  document.addEventListener('pointerdown', () => { userEngaged = true; },
                            { once: true, passive: true });
  scene.canvas.addEventListener('wheel', () => { userEngaged = true; },
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
    if (!c || userEngaged) return;
    // 위치를 받았으면 인트로 회전을 멈추고 "내가 지구 어디에 있는지"로 부드럽게 날아간다.
    geoTookOver = true;
    intro.stop();
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, fitGlobeHeight(0.52)),
      duration: 2.6,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      // 도착한 뒤에도 만지기 전까지는 다시 살살 돈다 (줌인 없이 회전만).
      complete: () => { power.animate(400); if (!userEngaged) intro.start({ zoom: false }); },
    });
    power.animate(3000);
  });
  // 1단 메뉴 동작 — 누르면 실행하고 메뉴는 닫힌다
  /* 내 위치 — 날아가고, 한국이면 지역 자료(옛 '한국' 메뉴)를 같이 연다.
     ⚠️ '한국' 메뉴는 없앴다. 그 자료가 필요한 사람은 곧 '내 위치'를 누르는 사람이라
        두 메뉴로 나눠 둘 이유가 없었다. 한국 밖에서는 날아가기만 한다 —
        관측소가 없는 곳에서 한국 화면을 띄우면 빈 시트만 보인다. */
  layerBar.onAction('locate', async () => {
    /* ⚠️ '내 위치'는 사용자가 **직접 누른** 것이다 — 전에 거부했더라도 다시 묻는다.
       (평소 자동 요청은 거부를 기억하고 안 묻는다. mylocation.locate 주석 참고) */
    if (!myLocation.coords) await myLocation.locate(true);
    if (!myLocation.flyTo()) { toast(myLocation.reason() || ''); return; }
    /* 도착하면 그 자리의 날씨를 띄운다 (받은 요청: "내 위치로 가면서 다시 화면 나오게").
       ⚠️ 한국 안이면 기상청 자료(옛 '한국' 메뉴)를 함께 볼 수 있게 안내만 남긴다 —
          시트를 두 장 겹쳐 띄우면 뒤엣것을 아무도 못 본다. */
    weatherPanel.open('today');
  });
  layerBar.onAction('globe', async () => {
    /* `전지구로`는 단순 줌아웃이 아니라 첫 접속 화면으로 돌아가는 문이다.
       ⚠️ 예전에는 카메라 높이만 바꿔 수온·해구·우주와 열린 정보창이 남았다.
       장면과 레이어를 함께 초기화해야 "NOAA 구름만 있는 지구"가 된다. */
    await sceneMgr.to('earth', { stage: 'earth' });
    store.clearSelect();
    earthViewState.goEarth({ resetLayers: true });
    document.querySelectorAll('#sheet.up, #settings.up, .sheet-panel.up')
      .forEach(panel => panel.classList.remove('up'));
    const c = viewer.camera.positionCartographic;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(
      c.longitude, c.latitude, fitGlobeHeight()), duration: 1.4 });
    power.animate(1700);
  });
  layerBar.onAction('sat', () => satPanel.open());
  layerBar.onAction('ocean', () => oceanPanel.open());
  /* 나가기 전에 — 서핑·낚시·해구·산·하늘을 한자리에 모았다 (ui-outdoor.js 머리말 참고).
     ⚠️ 옛 메뉴 항목(surf/mountain/sky)도 그대로 살려 둔다. 검색·코치마크·딥링크가
        그 이름으로 부르고 있어, 지우면 조용히 안 열린다. */
  layerBar.onAction('outdoor', () => outdoorPanel.open());
  layerBar.onAction('surf', () => surfPanel.open());
  layerBar.onAction('fishing', () => fishPanel.open());
  layerBar.onAction('para', () => paraPanel.open());
  /* ⚠️ 바다거북은 여기가 아니다. layerBar 에 'turtle' 을 내보내는 곳이 없어서
     이 자리에 등록해 두었더니 **눌러도 안 열렸다.** 취미 카드가 쓰는
     `outdoorPanel.init()` 의 표(아래)로 옮겼다. */
  layerBar.onAction('mountain', () => mountainPanel.open());
  layerBar.onAction('sky', () => skyPanel.open());
  layerBar.onAction('flight', () => flightPanel.open());
  layerBar.onAction('community', () => communityPanel.open());
  /* ⚠️ 1단의 '이벤트' 메뉴는 없앴다 (받은 요청). News 와 같은 패널을 여는 문 두 개였다.
     지진·쓰나미 같은 **지금 일어난 일**은 Alert 메뉴 안 '지금 일어난 일'로 들어간다
     (layerbar.js render()). 여기 배선도 함께 지웠다 —
     ⚠️ 버튼만 지우고 배선을 남기면 죽은 코드가 되고, 나중에 왜 안 열리는지 헤맨다. */
  /* News — 지구에서 지금 일어나는 일. 레이어를 켜서 지도에 올리고 목록도 같이 연다.
     ⚠️ 레이어만 켜면 "눌렀는데 아무 일도 안 났다"로 보인다 (지구 반대편이면 더 그렇다). */
  layerBar.onAction('news', () => {
    /* ⚠️ 여기서 레이어를 **강제로 켜지 않는다.** 껐던 사람이 목록을 보려고
       눌렀는데 지도가 도로 켜지면 끈 것이 무시된 것이다.
       대신 패널 안에 켜고 끄는 버튼을 뒀다 (ui-events.js). */
    eventPanel.mode = 'news';
    eventPanel.show = 'local';
    eventPanel.open();
  });
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
  // 딥링크는 레이어 초기화보다 먼저 해구 모드에 들어올 수 있다. 초기화가 끝난 뒤
  // 기존 지구 위 해구 영역이 반드시 다시 보이도록 상태를 한 번 맞춘다.
  if (store.scene === 'earth' && store.sceneStage === 'trench') trenchGlobe.setVisible(true, 'trench');

  /* 지구(베이스맵)가 준비됐다 → 로딩을 걷어내고 인트로를 시작한다.
     나머지 UI·데이터(chrome·계정·패널·점 데이터)는 지구 뒤에서 계속 붙는다. */
  const loadingEl = document.getElementById('loading');
  loadingEl?.classList.add('gone');
  setTimeout(() => loadingEl?.remove(), 700);
  /* ⚠️ 지오로케이션이 이미 카메라를 가져갔으면(geoTookOver) 여기서 인트로를 켜지 않는다.
     그때 켜면 진행 중인 flyTo 와 카메라를 두고 싸운다 — 인트로 회전은 flyTo 가
     끝난 뒤(그 complete 콜백)에만 다시 시작한다. */
  /* 로딩 중 이미 지구를 만졌다면 뒤늦게 인트로를 시작하지 않는다.
     ⚠️ 예전에는 자료 준비 뒤 무조건 시작해, 사용자가 메뉴를 보고 있는데도
        배경 카메라가 90초 움직이며 렌더를 계속 요구할 수 있었다. */
  if (store.scene === 'earth' && !geoTookOver && !userEngaged) intro.start();

  /* ⚠️ 안전망 — 정보성 시트(업데이트·설정·사전등록·약관)는 첫 화면에 절대 떠 있지 않게 한다.
     이들은 오직 메뉴에서 눌러야 열리는데, 어떤 이유로든(옛 캐시·경로) 열린 채 들어오면
     하단에 인포창이 계속 떠 있는 것처럼 보인다. 여기서 무조건 닫는다.
     명시적으로 로그인/가입을 시작한 OAuth 반환이면 initAccount가 뒤에서 다시 연다. */
  ['changelogSheet', 'settings', 'waitlistSheet', 'consentSheet'].forEach(
    id => document.getElementById(id)?.classList.remove('up'));

  await chrome.init();
  await initAccount();
  await analytics.init();
  satPanel.init();
  skyPanel.init();
  await flightPanel.init();
  communityPanel.init();
  eventPanel.init();
  askPanel.init();
  sourceNote.init();
  readability.init();
  decisionRail.init();
  /* PR-08 Decision UI는 live source·권리·도메인 검토가 끝날 때까지 완전히 잠근다.
     false/미정이면 module·CSS·listener를 받지도 않는다. 합성 fixture를 운영 화면에
     보이는 사고를 막기 위해 정적 import로 바꾸지 말 것. */
  if (CONFIG.DECISION_CORE_READY === true) {
    import('./decision-ui.js')
      .then(({ decisionUI }) => decisionUI.init())
      .catch(error => console.warn('[decision-ui] 초기화 실패:', error?.message || error));
  }
  /* 기상특보 — 한국 안에 있을 때만 띠가 뜬다.
     ⚠️ await 하지 않는다. 특보 서버가 느리다고 지구본이 늦게 뜨면 안 된다. */
  warnUI.init();
  koreaPanel.init();
  japanPanel.init();
  /* ⚠️ 브라우저가 푸시 구독을 말없이 갱신·만료시킨다. 한 번 등록했으니 됐다고
     두면 조용히 알림이 끊긴다 — 켤 때마다 서버와 맞춘다.
     ⚠️ 실패해도 앱을 막지 않는다. 알림은 부가 기능이다. */
  import('./push.js').then((m) => m.push.sync().catch(() => { })).catch(() => { });
  mountainPanel.init();
  surfPanel.init();
  fishPanel.init();
  paraPanel.init();
  /* ⚠️⚠️ **취미 카드는 layerBar 를 거치지 않는다.** 여기 이 표가 전부다.
     위쪽에 `layerBar.onAction('turtle', …)` 을 등록해 뒀다고 열리지 않는다 —
     그건 다른 경로다. 실제로 바다거북이 그렇게 빠져서 **눌러도 아무 일이
     없었다.** `?.()` 가 오류까지 삼켜 콘솔에도 안 찍혔다.
     → 카드를 추가하면 **반드시 이 표에도 넣는다.** */
  outdoorPanel.init(act => {
    const go = {
      surf: () => surfPanel.open(),
      fishing: () => fishPanel.open(),
      trench: () => sceneMgr.to('earth', { stage: 'trench' }),
      para: () => paraPanel.open(),
      mountain: () => mountainPanel.open(),
      sky: () => skyPanel.open(),
      /* 자료가 1.7MB 다(경로 28,770점). 누른 사람에게만 받는다.
         ⚠️ 받아온 모듈을 붙잡아 둔다 — 아래 "지도에서 지우기"가 이걸 쓴다.
            늦게 불러오는 것이라 여기 말고는 손잡이가 없다. */
      turtle: async () => {
        turtleMod = (await import('./ui-turtle.js')).turtlePanel;
        turtleMod.open();
      },
      seabird: async () => {
        seabirdMod = (await import('./ui-seabird.js')).seabirdPanel;
        seabirdMod.open();
      },
      migbird: async () => {
        migbirdMod = (await import('./ui-migbird.js')).migbirdPanel;
        migbirdMod.open();
      },
      ecobird: async () => {
        ecobirdMod = (await import('./ui-ecobird.js')).ecobirdPanel;
        ecobirdMod.open();
      },
    }[act];
    // ⚠️ 조용히 넘어가지 않는다. 빠뜨린 것이 눈에 보여야 다시 안 빠뜨린다.
    if (!go) { console.warn(`[취미] '${act}' 를 여는 곳이 없습니다 — main.js 의 표를 보세요`); return; }
    go();
  });
  oceanPanel.init(async action => {
    /* Ocean 허브는 이미 운영 중인 실제 화면의 한 진입점이다. 같은 기능을 두 벌로
       구현하지 않고, 지도·패널의 정본으로 이동한다. */
    if (action.startsWith('layer:')) {
      const id = action.slice('layer:'.length);
      await sceneMgr.to('earth', { stage: 'surface' });
      store.setLayer(id, true);
      return;
    }
    const go = {
      safety: () => koreaPanel.open(),
      surf: () => surfPanel.open(),
      fishing: () => fishPanel.open(),
      dive: () => sceneMgr.to('earth', { stage: 'trench' }),
      turtle: async () => {
        turtleMod = (await import('./ui-turtle.js')).turtlePanel;
        turtleMod.open();
      },
      seabird: async () => {
        seabirdMod = (await import('./ui-seabird.js')).seabirdPanel;
        seabirdMod.open();
      },
      migbird: async () => {
        migbirdMod = (await import('./ui-migbird.js')).migbirdPanel;
        migbirdMod.open();
      },
      ecobird: async () => {
        ecobirdMod = (await import('./ui-ecobird.js')).ecobirdPanel;
        ecobirdMod.open();
      },
    }[action];
    if (!go) { console.warn(`[Ocean] '${action}' 연결이 없습니다`); return; }
    await go();
  });
  if (oceanHubRoute) queueMicrotask(() => oceanPanel.open());
  warn.init();
  apiKeysPanel.init();
  document.getElementById('btnApi')?.addEventListener('click', () => apiKeysPanel.open());
  /* API 신청 관리는 운영자용이라 설정에서 숨겨 두었다 (index.html 의 #rowApi).
     ⚠️ 지우지 않은 이유: 공공데이터포털 활용신청이 2년이면 만료되고,
        만료되면 오류 없이 조용히 자료가 끊긴다. 그걸 미리 알려주는 화면이다.
     주소 뒤에 #api 를 붙이면 설정에 줄이 나타나고 바로 열린다. */
  const showApiRow = () => {
    if (location.hash !== '#api') return;
    document.getElementById('rowApi')?.removeAttribute('hidden');
    apiKeysPanel.open();
  };
  /* 개발할 수 있는 것 — 갖고 있는데 안 쓰는 자료 목록 (운영자용).
     ⚠️ #api 와 같은 방식이다. 주소 뒤에 #dev 를 붙여야 설정에 줄이 나타난다.
     ⚠️ 늦게 불러온다 — 안 여는 사람에게 짐이 되면 안 된다. */
  const openDev = async () => {
    const { devPanel } = await import('./ui-dev.js');
    devPanel.open();
  };
  document.getElementById('btnDev')?.addEventListener('click', openDev);
  /* 구독 — ⚠️ 늦게 불러온다(안 여는 사람에게 짐이 되면 안 된다). */
  /* ⚠️ CONFIG.SHOW_SUBSCRIBE 가 false 면 **줄 자체를 없앤다.**
     숨기기(hidden)만 하면 소스에 남고 키보드 탭에도 걸린다. */
  if (subscriptionUiAllowed({ mode: CONFIG.MONETIZATION_MODE,
    showSubscribe: CONFIG.SHOW_SUBSCRIBE })) {
    document.getElementById('btnSubscribe')?.addEventListener('click', async () => {
      const { subscribeSheet } = await import('./ui-subscribe.js');
      subscribeSheet.open();
    });
  } else {
    document.getElementById('btnSubscribe')?.remove();
  }
  /* 사전등록은 별개 스위치다 — 결제는 닫아 두고 이것만 여는 상태가 있다. */
  if (!CONFIG.SHOW_WAITLIST) document.getElementById('btnWaitlist')?.remove();
  const showDevRow = () => {
    if (location.hash !== '#dev') return;
    document.getElementById('rowDev')?.removeAttribute('hidden');
    openDev();
  };
  showDevRow();
  window.addEventListener('hashchange', showDevRow);
  showApiRow();
  window.addEventListener('hashchange', showApiRow);

  /* 태풍 공유 링크 — ?tc=이름 으로 열면 그 태풍으로 바로 간다.
     받은 지시: "공유버튼 누르면 복붙해서 다른 사람이 그걸 보고 태풍정보 볼 수 있게" */
  import('./ui-cyclone.js').then(m => m.openSharedCyclone()).catch(() => {});

  // 개발용 전역 핸들 (콘솔에서 __e.viewer 등으로 접근)
  Object.assign(window.__e, { viewer, scene, store, registry, i18n, imagery, cosmic3d,
                              orbits: (await import('./layers/space.js')).orbits });
}


/* ── 회원 · 법적 문서 배선 ─────────────────────────────────── */
function bindAccountUI() {
  const $ = s => document.querySelector(s);
  // 메뉴에서 시트를 열 땐 이미 떠 있는 다른 시트를 먼저 닫는다.
  // (안 그러면 사전등록·업데이트·동의창이 겹쳐 쌓인다)
  const open  = id => {
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    $('#' + id).classList.add('up');
  };
  const close = id => $('#' + id).classList.remove('up');

  // 설정 → 각 화면
  $('#btnAccount').onclick  = () => { close('settings'); accountSheet.open(); };

  /* ── 설정의 로그인·계정·관리자 줄 ─────────────────────────────
     ⚠️ 예전에는 계정 줄을 `display:none` 으로 **아예 감춰만** 두었다.
        "로그인할 이유가 없을 때 먼저 보여주면 진입 장벽"이라는 이유였는데,
        이제 구독이 생겨서 **로그인할 이유가 있다.** 상태에 따라 갈라 보여준다.
     ⚠️ 유료 여부는 `auth.isPaid()` 가 **서버에서 받은 profile.tier** 로 정한다.
        브라우저가 정하지 않는다 — 정하면 누구나 유료가 된다. */
  const paintAuthRows = () => {
    const login = document.getElementById('btnLoginRow');
    const acc   = document.getElementById('btnAccount');
    const consent = document.getElementById('btnConsent');
    const on    = !!auth.user;
    if (login) login.hidden = on;
    if (acc)   acc.style.display = on ? '' : 'none';
    if (consent) consent.style.display = on ? '' : 'none';
    if (acc && on) {
      /* 유료면 줄에 표시를 남긴다 — 결제했는데 아무 티가 안 나면 불안하다. */
      acc.querySelector('span').textContent = auth.isPaid() ? '계정 · 구독 중' : '계정';
    }
    /* ⚠️⚠️ **관리자 줄은 HTML 에 아예 두지 않는다.** 받은 지시:
       "관리자페이지는 나 외 메뉴에 나오게 하지마".
       숨김(hidden) 으로 두면 **소스를 열면 그대로 보인다** — 있는 줄 알게 된다.
       그래서 자격이 맞을 때만 **그 자리에 만들어 넣는다.**
       ⚠️ 그래도 이건 화면 가림이지 잠금이 아니다. 실제 차단은 Supabase RLS 다.
       서버의 public.admins 등록과 같은 관리자 계정만 만든다. */
    const isAdmin = on && auth.isAdmin();
    const cur = document.getElementById('btnAdminRow');
    if (isAdmin && !cur) {
      const adminButton = document.createElement('button');
      adminButton.className = 'set-item'; adminButton.id = 'btnAdminRow';
      adminButton.innerHTML = '<span>관리자 페이지</span><span class="chev">›</span>';
      adminButton.addEventListener('click', () => window.open('/admin.html', '_blank', 'noopener'));
      acc?.parentNode?.insertBefore(adminButton, acc.nextSibling);
    } else if (!isAdmin) {
      cur?.remove();
    }
  };
  document.getElementById('btnLoginRow')?.addEventListener('click', () => {
    close('settings'); loginSheet.open();
  });
  auth.onChange(paintAuthRows);
  paintAuthRows();
  // ⚠️ 위에서 지웠을 수 있다 — ?. 로 받는다
  const bw = $('#btnWaitlist');
  if (bw) bw.onclick = () => { close('settings'); open('waitlistSheet'); waitlistUI.init(); };
  $('#btnTerms').onclick    = () => { close('settings'); legalView.open('terms'); };
  $('#btnPrivacy').onclick  = () => { close('settings'); legalView.open('privacy'); };
  $('#btnConsent').onclick  = () => {
    if (!auth.user) return;
    close('settings');
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    consentSheet.open(true);   // 검토(review) 모드 — 안 눌러도 로그아웃 안 됨
  };
  /* 소개서 — 새 탭으로 연다. 같은 탭으로 가면 지구가 통째로 다시 뜬다. */
  $('#btnIntro').onclick = () => { window.open('/intro.html', '_blank', 'noopener'); };
  $('#btnVerify').onclick = () => { window.open('/verify.html', '_blank', 'noopener'); };
  $('#btnChangelog').onclick = () => {
    close('settings');
    $('#clTitle').textContent = i18n.lang === 'ko' ? '업데이트' : 'Updates';
    $('#clBody').innerHTML = renderChangelog(i18n.lang);
    open('changelogSheet');
  };

  /* ⚠️⚠️ **닫기와 끄기는 다르다.**
     · 닫기 — 창만 내린다. 지도 표시는 **남긴다**.
       받은 지적: "큰 화면에서 보고 싶은데 꺼져" — 지도를 보려고 닫는 경우가 있다.
     · 끄기 — 표시까지 지운다.
     예전엔 하나로 묶여 있어서, 지도를 크게 보려고 닫으면 볼 것이 함께 사라졌다.

     ⚠️ 그래서 panels.onClose 에 정리를 걸지 **않는다.** 대신 표시가 남아 있는 동안
        지도 위에 "○○ 표시 끄기" 칩을 띄워, 창을 닫아도 끄는 길이 늘 보이게 한다.
        (걸어 두면 "서핑 선택 후 계속 유지되는데" 문제가 되돌아온다 — 칩이 그 답이다) */
  const OFF = {
    sfSheet: () => surfPanel.close(), fsSheet: () => fishPanel.close(),
    pgSheet: () => paraPanel.close(), mtSheet: () => mountainPanel.close(),
    /* ⚠️ 거북은 늦게 불러오는 모듈이라 아직 안 눌렀으면 turtleMod 가 null 이다.
       그때는 지울 것도 없으니 아무 일도 안 하는 게 맞다. */
    turtleSheet: () => turtleMod?.close(),
    seabirdSheet: () => seabirdMod?.close(),
    migbirdSheet: () => migbirdMod?.close(),
    ecobirdSheet: () => ecobirdMod?.close(),
  };
  const OFF_LABEL = { sfSheet: '서핑', fsSheet: '낚시', pgSheet: '활공장', mtSheet: '등산로',
                      turtleSheet: '바다거북', seabirdSheet: '바닷새',
                      migbirdSheet: '철새', ecobirdSheet: '전국 조류 조사' };

  /** 지도에 표시가 남아 있으면 끄는 칩을 띄운다 */
  function offChip(id, on) {
    let c = document.getElementById('mapOff');
    if (!on) { c?.classList.remove('on'); return; }
    if (!c) {
      c = document.createElement('button');
      c.id = 'mapOff';
      document.body.appendChild(c);
    }
    c.textContent = `${OFF_LABEL[id] || ''} 표시 끄기 ×`;
    c.onclick = () => { OFF[id]?.(); offChip(id, false); };
    c.classList.add('on');
  }
  window.__offChip = offChip;

  // "표시 끄기" 버튼 — 창도 내리고 표시도 지운다
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sheet-off]');
    if (!b) return;
    const id = b.dataset.sheetOff;
    OFF[id]?.();
    offChip(id, false);
  });

  /* 닫기 버튼·Esc·바깥 탭으로 창만 내렸을 때 — 표시가 남아 있으면 칩을 띄운다.
     ⚠️ 표시가 없으면 띄우지 않는다. 아무것도 안 하는 버튼이 떠 있으면 안 된다. */
  const HAS_MARKS = {
    sfSheet: () => (surfPanel._ds?.entities.values.length || 0) > 0,
    fsSheet: () => (fishPanel._ds?.entities.values.length || 0) > 0,
    pgSheet: () => (paraPanel._ds?.entities.values.length || 0) > 0,
    mtSheet: () => (trailsHasMarks()),
    turtleSheet: () => (turtleMod?._ents.length || 0) > 0,
    seabirdSheet: () => (seabirdMod?._ents.length || 0) > 0,
    migbirdSheet: () => (migbirdMod?._ents.length || 0) > 0,
    ecobirdSheet: () => !!ecobirdMod?._points,
  };
  let trailsMod = null;
  function trailsHasMarks() {
    return (trailsMod?.trails?.ds?.entities.values.length || 0) > 0;
  }
  import('./trails.js').then(m => { trailsMod = m; }).catch(() => {});
  Object.keys(OFF).forEach(id => {
    panels.onClose(id, () => { if (HAS_MARKS[id]?.()) offChip(id, true); });
  });
  /* 약관은 로그인·동의 화면에서 잠시 들어갔다가 돌아오는 보조 문서다.
     두 모달을 동시에 보조기술에 노출하지 않고, 닫으면 출발한 화면을 복원한다. */
  panels.onClose('legalSheet', () => legalView.restore());

  // 닫기 버튼 일괄
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => { close(b.dataset.close); panels._fire(document.getElementById(b.dataset.close)); };
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
  ['cTos','cPrivacy','cAge','cMarketing','cLocation','cUsage'].forEach(id => {
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

  /** 화면 좌표 → 지표의 위경도. 지구를 안 가리켰으면 null. */
  const ground = () => {
    const cart = scene.camera.pickEllipsoid(ev.position, scene.globe.ellipsoid);
    if (!cart) return null;
    const c = Cesium.Cartographic.fromCartesian(cart);
    return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude) };
  };

  /* 태풍 밖을 누르면 펼쳐 둔 경로를 접는다.
     받은 지적: "태풍 외 지역 터치하면 사라지게 해줘, 다른 거 보려니깐"
     ⚠️ 태풍 경로는 예보선·영향권·과거 사례까지 70개가 넘는 도형이라 켜 두면
        그 아래 지도가 안 보인다. 열 때만큼 **닫기도 쉬워야** 한다.
     ⚠️ 태풍 자신(_tc)이나 경로 위 도형을 눌렀을 때는 접으면 안 된다 —
        방금 연 것을 누르자마자 닫는 꼴이 된다. tc: 로 시작하는 id 가 그것이다. */
  const pid = String(picked?.id?.id ?? '');
  const onCyclone = !!picked?.id?._meta?._tc || pid.startsWith('tc:');
  if (!onCyclone) {
    import('./layers/cyclone.js')
      .then(({ cyclones }) => { if (cyclones._selected) cyclones.clearTrack(); })
      .catch(() => {});
  }

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

  /* AX-01 — 지구의 무엇을 누르든 선택 좌표는 먼저 판단 레일에 공유한다.
     패널을 닫아도 마커는 남지만, 위험 polygon이나 특보 범위로 오해하지 않게
     지점 좌표만 보낸다. 클러스터는 위에서 확대로 소비하므로 제외다. */
  const decisionPoint = ground();
  if (decisionPoint) {
    document.dispatchEvent(new CustomEvent('earthus:decision-point', {
      detail: { point: decisionPoint, pickedId: String(picked?.id?.id || '') || null },
    }));
  }

  /* 지도에 찍은 해변을 눌렀을 때 — 목록의 그 카드로 데려간다.
     ⚠️ 아래 _meta 갈래보다 **먼저** 본다. 해변 표시에는 _meta 가 없어서
        그냥 두면 지도 클릭으로 처리돼 엉뚱한 지점 날씨가 열린다. */
  if (picked?.id?._beach) { surfPanel.focus(picked.id._beach); return; }
  // 권역 대표를 누르면 그 권역으로 들어간다 (멀리서 → 가까이)
  if (picked?.id?._surfRegion) { surfPanel.openRegion(picked.id._surfRegion); return; }
  if (picked?.id?._fishSpot) { fishPanel.focus(picked.id._fishSpot); return; }
  if (picked?.id?._fishRegion) { fishPanel.openRegion(picked.id._fishRegion); return; }
  if (picked?.id?._paraSite) { paraPanel.focus(picked.id._paraSite); return; }
  if (picked?.id?._trench) { trenchGlobe.focus(picked.id._trench); return; }

  /* 철새·거북·바닷새 — 누르면 무엇인지 한 줄로 말한다.
     받은 요청: "거북이나 새 선을 누르면 어떤 새인지 나오게 해줘"

     ⚠️⚠️ **Cesium 기본 말풍선(infoBox)은 꺼져 있다**(viewer.js).
        그래서 엔티티에 적어 둔 `description` 은 **아무 데도 안 나온다.**
        여기 `_pick` 을 읽어 toast 로 띄우는 것이 이 앱의 방식이다.
        ⚠️ 새 도형을 추가하면서 description 만 적으면 조용히 안 보인다.

     ⚠️ 선이 1.8px 라 정확히 누르기 어렵다. 기본 집기(3×3)로 놓치면
        **16×16 으로 한 번 더** 집는다. 손가락으로도 눌리게 하려는 것이다. */
  const pickInfo = picked?.id?._pick
    || scene.pick(ev.position, 16, 16)?.id?._pick;
  if (pickInfo) { toast(pickInfo); return; }

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

  /* ── 누른 지점의 격자 값을 좌하단 범례에 붙인다 (감사 3차) ──────
     받은 감사: "지구의 한 지점을 누르면 해당 위치의 값을 함께 보여준다."
     ⚠️ 시트를 여는 것과 별개다. 시트가 안 열리는 상황(Ambient)에서도
        "지금 여기가 몇 도인가"는 답할 수 있어야 한다.
     ⚠️ 값이 없으면 지운다 — 옛 값이 남으면 다른 자리 값을 이 자리 값으로 읽는다. */
  (async () => {
    const clearEarthPoint = () => {
      sourceNote.setPoint?.(null, null);
      document.dispatchEvent(new CustomEvent('earthus:earth-point-clear'));
    };
    const g0 = ground();
    if (!g0) { clearEarthPoint(); return; }
    try {
      const { gridOverlay } = await import('./gridoverlay.js');
      const PAINTED = ['temp', 'tmax', 'tmin', 'humidity', 'tpw', 'rain', 'pressure',
                       'fog', 'drought', 'pm25', 'pm10', 'dust', 'aqi', 'uv',
                       'ozone', 'sst', 'sstanom', 'wave', 'swell', 'current'];
      const id = PAINTED.find(x => store.isOn(x));
      if (!id) { clearEarthPoint(); return; }
      if (id === 'tpw') {
        /* TPW는 90~180°E 지역 격자다. 전지구 격자처럼 경도를 감으면
           범위 밖을 반대편 값으로 보여주게 된다 — 지역 경계 검증이 들어간 공통 함수를 쓴다. */
        const v = await gridOverlay.valueAt(id, g0.lat, g0.lon);
        sourceNote.setPoint?.(id, v);
        if (Number.isFinite(v)) {
          document.dispatchEvent(new CustomEvent('earthus:earth-point', {
            detail: { layer: id, point: { lat: g0.lat, lon: g0.lon }, value: v },
          }));
        }
        else document.dispatchEvent(new CustomEvent('earthus:earth-point-clear'));
        return;
      }
      const grid = await gridOverlay.gridFor(id);
      const f = gridOverlay.fieldOf(id);
      const arr = grid?.[f];
      if (!arr) { clearEarthPoint(); return; }
      // 가장 가까운 격자 칸 (보간하지 않는다 — 없는 정밀도를 만들지 않는다)
      const ix = Math.round((g0.lon - grid.lon0) / grid.res);
      const iy = Math.round((g0.lat - grid.lat0) / grid.res);
      const x = ((ix % grid.nx) + grid.nx) % grid.nx;
      const v = (iy >= 0 && iy < grid.ny) ? arr[iy * grid.nx + x] : null;
      sourceNote.setPoint?.(id, v);
      if (Number.isFinite(v)) {
        document.dispatchEvent(new CustomEvent('earthus:earth-point', {
          detail: { layer: id, point: { lat: g0.lat, lon: g0.lon }, value: v },
        }));
      }
      else document.dispatchEvent(new CustomEvent('earthus:earth-point-clear'));
    } catch (_) { clearEarthPoint(); }
  })();

  /* 빈 지구 탭 → 확대 여부와 무관하게 그 지점의 통합 상세를 연다.
     예전에는 Explore에서만 날씨 시트가 열리고, 첫 지구에서는 별도 판단 레일만
     튀어나와 같은 장소를 두 창으로 닫아야 했다. 이제 의도적으로 장소를 누르면
     장소·날씨·활동·Safety가 #sheet 하나에서 이어진다. */
  if (decisionPoint) {
    store.select({
      id: 'pt', kind: 'stations',
      name: `${decisionPoint.lat.toFixed(2)}, ${decisionPoint.lon.toFixed(2)}`,
      lat: decisionPoint.lat, lon: decisionPoint.lon, data: { _lazy: true },
    });
    return;
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

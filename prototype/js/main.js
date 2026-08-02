// 진입점
import { initViewer, viewer, scene, cameraHeight, onCameraIdle, flyTo, setAmbientView, fitGlobeHeight } from './viewer.js';
import { alarms } from './alarms.js';
import { windField } from './windfield.js';
import { myLocation } from './mylocation.js';
import { layerBar } from './layerbar.js';
import { search } from './search.js';
import { onboard } from './onboard.js';
import { weatherPanel } from './ui-weather.js';
import { power } from './power.js';
import { panels } from './panels.js';
import { drift } from './drift.js';
import { intro } from './intro.js';
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
import { mountainPanel } from './ui-mountain.js';
import { surfPanel } from './ui-surf.js';
import { fishPanel } from './ui-fishing.js';
import { outdoorPanel } from './ui-outdoor.js';
import { paraPanel } from './ui-para.js';
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
  search.init();          // ⌘K · 우상단 돋보기
  /* ⚠️ 오늘의 볼거리 칩(최고 파고·수온·기온)은 **첫 화면에서 뺐다.**
     받은 지시: "밑에 최고파도 최고 수온 그런거 다 빼줘. 처음 보자마자
                 아름다운 지구와 기초 정보만 보여주고 싶어."
     칩 자체는 살려 둔다 — 코치마크가 참조하고, 나중에 다른 자리에 쓸 수 있다.
     지금은 그리지 않을 뿐이다. */
  onboard.init({ chips: false });   // 첫 실행 코치마크만 (await 하지 않는다)
  weatherPanel.init();    // 하단 온도 탭 → 내 자리 날씨 시트

  // 내 위치 — 실패해도 조용히 넘어간다 (HTTP 접속·권한 거부 등)
  windField.init();
  myLocation.init();

  /* 위치 응답이 오기 전에 사람이 지구를 만졌는지 기록한다.
     ⚠️ 이게 없으면 이미 다른 대륙을 돌려보던 사람의 화면을
        몇 초 뒤 도착한 위치가 갑자기 끌고 간다. 조작을 빼앗는 것이다. */
  let userTouchedGlobe = false;
  let geoTookOver = false;
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
    // 위치를 받았으면 인트로 회전을 멈추고 "내가 지구 어디에 있는지"로 부드럽게 날아간다.
    geoTookOver = true;
    intro.stop();
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, fitGlobeHeight(0.52)),
      duration: 2.6,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      // 도착한 뒤에도 만지기 전까지는 다시 살살 돈다 (줌인 없이 회전만).
      complete: () => { power.animate(400); if (!userTouchedGlobe) intro.start({ zoom: false }); },
    });
    power.animate(3000);
  });
  // 1단 메뉴 동작 — 누르면 실행하고 메뉴는 닫힌다
  /* 내 위치 — 날아가고, 한국이면 지역 자료(옛 '한국' 메뉴)를 같이 연다.
     ⚠️ '한국' 메뉴는 없앴다. 그 자료가 필요한 사람은 곧 '내 위치'를 누르는 사람이라
        두 메뉴로 나눠 둘 이유가 없었다. 한국 밖에서는 날아가기만 한다 —
        관측소가 없는 곳에서 한국 화면을 띄우면 빈 시트만 보인다. */
  layerBar.onAction('locate', async () => {
    if (!myLocation.coords) await myLocation.locate();
    if (!myLocation.flyTo()) { toast(myLocation.reason() || ''); return; }
    /* 도착하면 그 자리의 날씨를 띄운다 (받은 요청: "내 위치로 가면서 다시 화면 나오게").
       ⚠️ 한국 안이면 기상청 자료(옛 '한국' 메뉴)를 함께 볼 수 있게 안내만 남긴다 —
          시트를 두 장 겹쳐 띄우면 뒤엣것을 아무도 못 본다. */
    weatherPanel.open('today');
  });
  layerBar.onAction('globe', () => {
    const c = viewer.camera.positionCartographic;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(
      c.longitude, c.latitude, fitGlobeHeight()), duration: 1.4 });
  });
  layerBar.onAction('sat', () => satPanel.open());
  /* 나가기 전에 — 서핑·낚시·산·하늘을 한자리에 모았다 (ui-outdoor.js 머리말 참고).
     ⚠️ 옛 메뉴 항목(surf/mountain/sky)도 그대로 살려 둔다. 검색·코치마크·딥링크가
        그 이름으로 부르고 있어, 지우면 조용히 안 열린다. */
  layerBar.onAction('outdoor', () => outdoorPanel.open());
  layerBar.onAction('surf', () => surfPanel.open());
  layerBar.onAction('fishing', () => fishPanel.open());
  layerBar.onAction('para', () => paraPanel.open());
  layerBar.onAction('mountain', () => mountainPanel.open());
  layerBar.onAction('sky', () => skyPanel.open());
  layerBar.onAction('flight', () => flightPanel.open());
  layerBar.onAction('community', () => communityPanel.open());
  layerBar.onAction('events', () => eventPanel.open());
  /* News — 지구에서 지금 일어나는 일. 레이어를 켜서 지도에 올리고 목록도 같이 연다.
     ⚠️ 레이어만 켜면 "눌렀는데 아무 일도 안 났다"로 보인다 (지구 반대편이면 더 그렇다). */
  layerBar.onAction('news', () => {
    store.setLayer('news', true);
    eventPanel.show = 'confirmed';
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

  /* 지구(베이스맵)가 준비됐다 → 로딩을 걷어내고 인트로를 시작한다.
     나머지 UI·데이터(chrome·계정·패널·점 데이터)는 지구 뒤에서 계속 붙는다. */
  const loadingEl = document.getElementById('loading');
  loadingEl?.classList.add('gone');
  setTimeout(() => loadingEl?.remove(), 700);
  /* ⚠️ 지오로케이션이 이미 카메라를 가져갔으면(geoTookOver) 여기서 인트로를 켜지 않는다.
     그때 켜면 진행 중인 flyTo 와 카메라를 두고 싸운다 — 인트로 회전은 flyTo 가
     끝난 뒤(그 complete 콜백)에만 다시 시작한다. */
  if (!geoTookOver) intro.start();

  /* ⚠️ 안전망 — 정보성 시트(업데이트·설정·사전등록)는 첫 화면에 절대 떠 있지 않게 한다.
     이들은 오직 메뉴에서 눌러야 열리는데, 어떤 이유로든(옛 캐시·경로) 열린 채 들어오면
     하단에 인포창이 계속 떠 있는 것처럼 보인다. 여기서 무조건 닫는다.
     ⚠️ 동의창(consentSheet)은 제외 — 로그인 직후 떠야 하는 법적 화면이라 건드리지 않는다. */
  ['changelogSheet', 'settings', 'waitlistSheet'].forEach(
    id => document.getElementById(id)?.classList.remove('up'));

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
  mountainPanel.init();
  surfPanel.init();
  fishPanel.init();
  paraPanel.init();
  outdoorPanel.init(act => {
    ({ surf: () => surfPanel.open(), fishing: () => fishPanel.open(),
       para: () => paraPanel.open(),
       mountain: () => mountainPanel.open(), sky: () => skyPanel.open() })[act]?.();
  });
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
  showApiRow();
  window.addEventListener('hashchange', showApiRow);

  // 개발용 전역 핸들 (콘솔에서 __e.viewer 등으로 접근)
  window.__e = { viewer, scene, store, registry, i18n, imagery,
                 orbits: (await import('./layers/space.js')).orbits };
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
  $('#btnWaitlist').onclick = () => { close('settings'); open('waitlistSheet'); waitlistUI.init(); };
  $('#btnTerms').onclick    = () => { close('settings'); legalView.open('terms'); };
  $('#btnPrivacy').onclick  = () => { close('settings'); legalView.open('privacy'); };
  $('#btnConsent').onclick  = () => {
    close('settings');
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    consentSheet.open(true);   // 검토(review) 모드 — 안 눌러도 로그아웃 안 됨
  };
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

  /* 지도에 찍은 해변을 눌렀을 때 — 목록의 그 카드로 데려간다.
     ⚠️ 아래 _meta 갈래보다 **먼저** 본다. 해변 표시에는 _meta 가 없어서
        그냥 두면 지도 클릭으로 처리돼 엉뚱한 지점 날씨가 열린다. */
  if (picked?.id?._beach) { surfPanel.focus(picked.id._beach); return; }
  // 권역 대표를 누르면 그 권역으로 들어간다 (멀리서 → 가까이)
  if (picked?.id?._surfRegion) { surfPanel.openRegion(picked.id._surfRegion); return; }
  if (picked?.id?._fishSpot) { fishPanel.focus(picked.id._fishSpot); return; }
  if (picked?.id?._fishRegion) { fishPanel.openRegion(picked.id._fishRegion); return; }
  if (picked?.id?._paraSite) { paraPanel.focus(picked.id._paraSite); return; }

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

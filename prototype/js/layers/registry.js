// 레이어 레지스트리 — 초기화 / 갱신 / 가시성 통합 관리 (§5-1)
import { store } from '../store.js';
import { LAYER_DEFS, T } from '../config.js';
import { imagery } from './imagery.js';
import { quakes, volcanoes } from './hazard.js';
import { cyclones } from './cyclone.js';
import { events } from './events.js';
import { launches, orbits } from './space.js';
import { launchPads } from './launchpad.js';
import { stations, wind } from './weather.js';
import { landObs } from './landobs.js';
import { ukForecast } from './ukfc.js';
import { coverage } from './coverage.js';
import { windField } from '../windfield.js';
import { gridOverlay } from '../gridoverlay.js';
import { poi } from './travel.js';
import { phenomena } from './phenomena.js';
import { buoys } from './ocean.js';
import { tsunami } from './tsunami.js';
import { wildfires } from './wildfire.js';
import { eclipseMarks } from './eclipse.js';
import { lightning } from './lightning.js';
import { regional } from './regional.js';
import { alerts } from './alerts.js';

/** 레이어 id → 격자 필드 이름 */
/* 격자 레이어 id 는 곧 눈금 이름이다 (gridoverlay 의 FIELD_OF 가 실제 필드로 옮긴다).
   ⚠️ 예전에는 'humidity 면 rh, 아니면 temp' 였다. 그대로 두면 tmax/tmin 이
      전부 temp 로 칠해져서 "내일 최고기온" 자리에 지금 기온이 나온다. */
const gridKey = id => (id === 'humidity' ? 'rh' : id);

/** 점/이벤트 레이어 인스턴스 */
export const pointLayers = {};

/** 주기적 갱신 간격 (ms) */
const REFRESH = {
  quake: 2 * 60_000,
  launch: 15 * 60_000,
  aurora: 5 * 60_000,
  orbits: 60 * 60_000,
  cyclone: 20 * 60_000,
  news: 30 * 60_000,
  clouds: 20 * 60_000,   // RealEarth 는 1시간 간격 — 20분마다 새 시각 확인
  buoy: 30 * 60_000,     // Lambda 가 30분마다 올린다
  /* 쓰나미는 다르다. 지진 직후 몇 분 안에 나오는 경보를 놓치면 의미가 없다.
     응답이 보통 수 KB 라 자주 물어도 부담이 없다. */
  tsunami: 3 * 60_000,
  wildfire: 20 * 60_000,   // Lambda 가 30분마다 갱신
  landobs: 20 * 60_000,    // METAR 는 지점마다 30~60분
  /* 낙뢰는 Lambda 가 5분마다 올린다. 뇌우가 지나가는 걸 보려면 이 정도는 따라가야 한다.
     ⚠️ 한국 자료뿐이라, 켜져 있을 때만 받는다. */
  lightning: 5 * 60_000,
  regional: 20 * 60_000,   // Lambda 가 30분마다 올린다
  alerts: 10 * 60_000,     // 특보는 15분마다 갱신된다
  /* 영국 예보는 Lambda 가 **3시간마다** 올린다 (무료 360콜/일 예산 때문).
     ⚠️ 더 자주 물어봐야 같은 파일이다 — 190KB 를 헛되이 다시 받을 뿐이다.
        원본 주기보다 촘촘한 폴링은 순수한 발열이다. */
  ukfc: 60 * 60_000,
};

export const registry = {
  ready: false,
  status: {},          // id → 'ok' | 'error' | 'loading' | 'blocked'

  async init() {
    imagery.init();

    pointLayers.quake    = quakes.init();
    pointLayers.volcano  = volcanoes.init();
    pointLayers.launch   = launches.init();
    launchPads.init();
    pointLayers.stations = stations.init();
    pointLayers.landobs  = landObs.init();
    pointLayers.ukfc     = ukForecast.init();
    pointLayers.poi      = poi.init();
    pointLayers.buoy     = buoys.init();
    pointLayers.lightning = lightning.init();
    pointLayers.regional  = regional.init();
    pointLayers.alerts    = alerts.init();
    pointLayers.wildfire = wildfires.init();
    cyclones.init();
    events.init();
    tsunami.init();
    eclipseMarks.init();
    orbits.init();
    wind.init();
    phenomena.init();

    // 차단된 레이어 상태 기록
    LAYER_DEFS.filter(d => d.blocked).forEach(d => { this.status[d.id] = 'blocked'; });

    this.applyAll();

    // 스토어 이벤트 연결
    store.on('layer', id => this.onToggle(id));
    store.on('tier', () => this.applyAll());
    store.on('camera', () => this.applyAll());

    this.ready = true;
    await this.refreshAll();
    this.startTimers();
  },

  /* ── 갱신 ─────────────────────────────────────────────────── */
  async refreshAll() {
    await Promise.allSettled([
      this.run('quake',  () => quakes.refresh()),
      this.run('cyclone', () => cyclones.refresh()),
      this.run('news', () => events.refresh()),
      this.run('launch', () => launches.refresh().then(items => launchPads.build(items))),
      this.run('aurora', () => imagery.loadAurora()),
      this.run('orbits', () => orbits.refresh()),
      // ⚠️ 열돔과 자연현상이 같은 자료를 쓴다. 둘 중 하나라도 켜져 있으면 받는다.
      this.run('phenomena', () => phenomena.refresh()),
      this.run('heatdome', () => phenomena.refresh()),
      this.run('tsunami', () => tsunami.refresh()),
      this.run('wildfire', () => wildfires.refresh()),
      /* 부이는 869개라 켜져 있을 때만 받는다.
         꺼놓은 사람에게 107KB 를 매번 내려받게 할 이유가 없다. */
      store.isOn('buoy') ? this.run('buoy', () => buoys.refresh()) : Promise.resolve(),
      // 낙뢰도 켜져 있을 때만 — 평소엔 한국 밖 사용자에게 받을 이유가 없다
      store.isOn('lightning') ? this.run('lightning', () => lightning.refresh()) : Promise.resolve(),
      store.isOn('regional') ? this.run('regional', () => regional.refresh()) : Promise.resolve(),
      store.isOn('alerts') ? this.run('alerts', () => alerts.refresh()) : Promise.resolve(),
      /* 영국 예보 190KB — 켜져 있을 때만 받는다.
         영국을 안 보는 사람에게 시작할 때마다 190KB 를 물릴 이유가 없다. */
      store.isOn('ukfc') ? this.run('ukfc', () => ukForecast.refresh()) : Promise.resolve(),
    ]);
    this.applyAll();
  },

  async run(id, fn) {
    this.status[id] = 'loading';
    try { await fn(); this.status[id] = 'ok'; }
    catch (e) { this.status[id] = 'error'; console.warn(`[${id}]`, e.message); }
  },

  startTimers() {
    setInterval(() => this.run('quake',  () => quakes.refresh()).then(() => this.applyAll()), REFRESH.quake);
    setInterval(() => this.run('launch', () => launches.refresh().then(i => launchPads.build(i))).then(() => this.applyAll()), REFRESH.launch);
    setInterval(() => this.run('aurora', () => imagery.loadAurora()), REFRESH.aurora);
    setInterval(() => this.run('orbits', () => orbits.refresh()), REFRESH.orbits);
    setInterval(() => this.run('cyclone', () => cyclones.refresh()).then(() => this.applyAll()), REFRESH.cyclone);
    setInterval(() => this.run('news', () => events.refresh()).then(() => this.applyAll()), REFRESH.news);
    setInterval(() => this.run('clouds', () => imagery._addClouds()), REFRESH.clouds);
    setInterval(() => this.run('tsunami', () => tsunami.refresh()).then(() => this.applyAll()), REFRESH.tsunami);
    setInterval(() => this.run('wildfire', () => wildfires.refresh()).then(() => this.applyAll()), REFRESH.wildfire);
    setInterval(() => {
      if (store.isOn('buoy')) this.run('buoy', () => buoys.refresh()).then(() => this.applyAll());
    }, REFRESH.buoy);
    setInterval(() => {
      if (store.isOn('lightning')) this.run('lightning', () => lightning.refresh()).then(() => this.applyAll());
    }, REFRESH.lightning);
    setInterval(() => {
      if (store.isOn('regional')) this.run('regional', () => regional.refresh()).then(() => this.applyAll());
    }, REFRESH.regional);
    setInterval(() => {
      if (store.isOn('alerts')) this.run('alerts', () => alerts.refresh()).then(() => this.applyAll());
    }, REFRESH.alerts);
    setInterval(() => {
      if (store.isOn('ukfc')) this.run('ukfc', () => ukForecast.refresh()).then(() => this.applyAll());
    }, REFRESH.ukfc);
  },

  /* ── 가시성 ───────────────────────────────────────────────── */
  onToggle(id) {
    const def = LAYER_DEFS.find(d => d.id === id);
    if (!def) return;
    if (def.kind === 'coverage') {
      coverage.show(store.isOn(id)).catch(e => console.warn('[coverage]', e.message));
    }
    else if (def.kind === 'imagery') imagery.set(id, store.isOn(id));
    else if (def.kind === 'grid') gridOverlay.show(gridKey(id), store.isOn(id));
    else if (id === 'orbits') orbits.set(store.isOn(id));
    else if (id === 'truecolor') imagery.setTrueColor(store.isOn(id));
    else if (id === 'wind' || id === 'windfc') {
      /* ⚠️ 지금 바람과 내일 바람을 동시에 켜지 않는다.
         같은 화면에 섞이면 어느 입자가 어느 것인지 구분할 방법이 없다. */
      const other = id === 'wind' ? 'windfc' : 'wind';
      if (store.isOn(id) && store.isOn(other)) store.setLayer(other, false);
      const on = store.isOn('wind') || store.isOn('windfc');
      windField.setField(store.isOn('windfc') ? 'fc' : 'now');
      windField.set(on);
    }
    else if (id === 'cyclone') cyclones.set(store.isOn(id));
    else if (id === 'news') events.set(store.isOn(id));
    else if (id === 'tsunami') tsunami.set(store.isOn(id));
    else if (id === 'eclipse') eclipseMarks.set(store.isOn(id));
    else if (id === 'phenomena') phenomena.set(store.isOn(id));
    else if (id === 'heatdome') phenomena.setHeat(store.isOn(id));
    else if (pointLayers[id]) pointLayers[id].applyVisibility();
    if (id === 'launch') launchPads.set(store.isOn('launch'));

    if (id === 'poi') poi.refresh();
    // 부이는 켤 때 처음 받는다 (§ 위 refreshAll 의 지연 로딩과 짝)
    if (id === 'buoy' && store.isOn('buoy') && !buoys.meta) {
      this.run('buoy', () => buoys.refresh()).then(() => this.applyAll());
    }
    /* 낙뢰도 켤 때 처음 받는다.
       ⚠️ meta 유무로 판단하면 두 번째 켤 때 낡은 자료를 그대로 쓴다.
          낙뢰는 5분이면 딴 세상이라, 켤 때마다 다시 받는다. */
    if (id === 'lightning' && store.isOn('lightning')) {
      this.run('lightning', () => lightning.refresh()).then(() => this.applyAll());
    }
    // 지역 재해도 켤 때 받는다 (평소엔 전 세계 사용자에게 받게 할 이유가 없다)
    if (id === 'regional' && store.isOn('regional') && !regional.meta) {
      this.run('regional', () => regional.refresh()).then(() => this.applyAll());
    }
    /* 경보는 켤 때마다 새로 받는다. ⚠️ 15분이면 해제된 것이 생긴다 —
       낡은 경보를 켜 두면 "아직 위험하다"는 거짓 정보가 된다. */
    if (id === 'alerts' && store.isOn('alerts')) {
      this.run('alerts', () => alerts.refresh()).then(() => this.applyAll());
    }
    /* 영국 예보는 켤 때 처음 받는다.
       ⚠️ meta 유무로 판단한다 — 3시간마다 갱신되는 자료라 낡아도 몇 시간이고,
          켤 때마다 190KB 를 다시 받는 건 낭비다. 주기 타이머가 따로 갱신한다. */
    if (id === 'ukfc' && store.isOn('ukfc') && !ukForecast.meta) {
      this.run('ukfc', () => ukForecast.refresh()).then(() => this.applyAll());
    }
  },

  applyAll() {
    LAYER_DEFS.forEach(d => {
      if (d.blocked) return;
      if (d.kind === 'coverage') coverage.show(store.isOn(d.id)).catch(() => {});
      else if (d.kind === 'imagery') imagery.set(d.id, store.isOn(d.id));
      if (d.kind === 'grid') gridOverlay.show(gridKey(d.id), store.isOn(d.id));
    });

    /* 위성은 "멀어지면" 보인다.
       가까이서는 궤도가 화면 밖으로 나가 점 몇 개만 떠다녀 의미가 없고,
       핀·지표를 가리기만 한다. 멀어져 지구가 통째로 보일 때라야
       궤도면이 지구를 감싸는 게 눈에 들어온다.
       사용자가 토글을 끈 경우는 존중한다 — 거리 조건은 "켠 상태에서 추가로" 적용된다. */
    /* 위성은 기본적으로 멀리서만 보인다 (가까이선 지표를 가린다).
       다만 "계속 보기"를 켜면 확대해도 유지한다 —
       내가 있는 곳 위로 어떤 위성이 지나가는지 보려면 그래야 한다. */
    orbits.set(store.isOn('orbits') && (orbits.keepVisible || store.height >= T.SAT_SHOW));
    // 바람은 파티클 애니메이션으로 보여준다 (윈디 방식). 기존 화살표는 접었다.
    cyclones.set(store.isOn('cyclone'));
    events.set(store.isOn('news'));
    /* 쓰나미는 확대 여부와 무관하게 항상 보인다.
       "지구 전체가 보이는 화면에서는 경보가 안 뜬다"는 건 있을 수 없다. */
    tsunami.set(store.isOn('tsunami'));
    eclipseMarks.set(store.isOn('eclipse'));
    imagery.setTrueColor(store.isOn('truecolor'));
    windField.setField(store.isOn('windfc') ? 'fc' : 'now');
    windField.set(store.isOn('wind') || store.isOn('windfc'));
    phenomena.set(store.isOn('phenomena'));
    phenomena.setHeat(store.isOn('heatdome'));
    // 발사대는 발사 레이어에 종속된다 — 발사가 꺼지면 발사대도 사라져야 한다
    launchPads.set(store.isOn('launch'));
    Object.values(pointLayers).forEach(l => l.applyVisibility());
  },

  /** 카메라가 멈췄을 때 — 뷰포트 기반 로딩 (§5-1) */
  onCameraIdle() {
    poi.refresh();
    wind.refresh();
  },

  /** 현재 화면에 렌더 중인 점 개수 (HUD용) */
  visibleCount() {
    return Object.values(pointLayers).reduce((n, l) => n + l.count(), 0);
  },
};

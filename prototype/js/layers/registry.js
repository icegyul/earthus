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
import { airStations } from './airkr.js';
import { tourismFlow } from './tourism-flow.js?v=20260821-tourism-map2';

/* ── 레이어를 켤 때 그때 받는다 ────────────────────────────────
   ⚠️ 받은 지적: **"처음 접속시 모든 기능 다 꺼줘. 지구 무빙 애니메이션만. 버벅거린다."**

   예전에는 첫 화면에서 태풍·환류·뉴스·산불·발사·궤도·오로라 **7종을 꺼져 있어도**
   받았다. 화면에는 안 나오는데 통신·해석·엔티티 생성 비용은 그대로 들었고,
   그게 인트로 회전이 끊기는 원인이었다.

   → 이제 **켜는 그 순간에 받는다.** 안 켜면 한 바이트도 안 받는다.

   ⚠️ 이 표에 빠뜨리면 "켜도 아무것도 안 나오는" 레이어가 된다.
      예전에는 buoy·lightning·regional·alerts·ukfc 만 이 방식이었고 나머지는
      부팅 때 무조건 받았기 때문에, 표 없이 부팅만 끄면 그대로 빈 레이어가 된다. */
const LOADERS = {
  cyclone:   () => cyclones.refresh(),
  phenomena: () => phenomena.refresh(),
  heatdome:  () => phenomena.refresh(),      // 환류와 같은 자료 (LOAD_KEY 참고)
  news:      () => events.refresh(),
  wildfire:  () => wildfires.refresh(),
  launch:    () => launches.refresh().then(i => launchPads.build(i)),
  orbits:    () => orbits.refresh(),
  aurora:    () => imagery.loadAurora(),
  landobs:   () => landObs.refresh(),
  buoy:      () => buoys.refresh(),
  airkr:     () => airStations.refresh(),
  lightning: () => lightning.refresh(),
  regional:  () => regional.refresh(),
  alerts:    () => alerts.refresh(),
  ukfc:      () => ukForecast.refresh(),
  quake:     () => quakes.refresh(),
  tsunami:   () => tsunami.refresh(),
  /* 통신 없이 번들 상수로 점을 만드는 층들. 통신이 없다고 공짜는 아니다 —
     엔티티 생성과 설명 문자열 조립이 인트로 회전 중에 일어난다. */
  volcano:   () => volcanoes.load(),
  stations:  () => stations.load(),
  tourism:   () => tourismFlow.refresh(),
};

/* 받아 둔 것을 공유하는 레이어 — 한쪽이 받았으면 다른 쪽은 다시 안 받는다 */
const LOAD_KEY = { heatdome: 'phenomena' };

/* 켤 때마다 **다시** 받는다. 낡으면 거짓이 되는 자료다:
   해제된 특보를 띄우면 "아직 위험하다"는 거짓이고,
   5분 전 낙뢰를 지금이라고 말하면 뇌우의 위치를 틀리게 알려준다. */
const ALWAYS_FRESH = new Set(['lightning', 'alerts', 'tsunami', 'tourism']);

/* 첫 자료 요청을 미루는 시간.
   ⚠️ 인트로는 줌인 4초 + 그 뒤 회전이다. 예전 값 3,500ms 는 **줌인 한가운데**였다.
      이 시점의 통신·JSON 해석·엔티티 생성이 회전을 끊었다.
      12초면 줌인이 끝나고 첫 타일들도 자리를 잡는다.
   ⚠️ 이 값은 "쓰나미 경보를 얼마나 늦게 알아채는가"이기도 하다. 더 늘리지 말 것. */
const SAFETY_DELAY_MS = 12_000;

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
  airkr: 20 * 60_000,     // 자료 CacheControl max-age=600(10분) — 그보다 여유 있게
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
  tourism: 5 * 60_000,
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
    pointLayers.tourism  = tourismFlow.init();
    pointLayers.buoy     = buoys.init();
    pointLayers.airkr    = airStations.init();
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
    store.on('earthView', state => this._syncDataSurface(state));

    this.ready = true;
    /* ⚠️ 첫 화면은 **지구 + NOAA 구름뿐**이다. 그 밖에는 아무것도 받지 않는다.
       인트로가 끝난 뒤(SAFETY_DELAY_MS) 안전 소스 둘만 받고,
       나머지는 사용자가 켜는 그 순간에 받는다(_staggeredBoot / _ensureLoaded). */
    this._staggeredBoot();
  },

  /* 첫 접속 후 데이터를 순차적으로(하나씩 천천히) 받는다.
     ⚠️ 여기 순서가 곧 우선순위다. */
  async _staggeredBoot() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const GAP = 1800;              // 각 로드 사이 간격 (천천히)

    /* ⚠️ 인트로(줌인 4초 + 회전)가 끝나기 전에는 아무것도 받지 않는다.
       예전에는 3.5초에 지진·쓰나미를 받았는데, 그게 줌인 한가운데였다.
       "버벅거린다"는 지적의 상당 부분이 여기였다. */
    await sleep(SAFETY_DELAY_MS);

    /* 안전 소스만 예외 — 쓰나미·큰 지진은 레이어가 꺼져 있어도 하단 배너로 뜬다.
       ⚠️ 이건 "안 보이게 했다"와 "놓쳤다"를 가르는 선이다 (config.js 주석 참고).
          레이어를 끄는 것은 지도 표시를 끄는 것이지 감시를 끄는 것이 아니다.
          둘 다 수 KB 라 이 시점에는 화면에 영향이 없다. */
    await this.run('quake',   () => quakes.refresh());   this.applyAll();
    await this.run('tsunami', () => tsunami.refresh());  this.applyAll();
    this._loaded.quake = true;
    this._loaded.tsunami = true;

    /* 나머지는 **켜져 있는 것만** 받는다.
       ⚠️ 예전에는 태풍·환류·뉴스·산불·발사·궤도·오로라를 꺼져 있어도 받았다.
          첫 방문자는 기본이 전부 꺼짐이므로 이 구간이 통째로 사라진다.
          다시 방문한 사람은 켜 뒀던 것만 순서대로 돌아온다. */
    const seq = ['cyclone', 'phenomena', 'heatdome', 'news', 'wildfire',
                 'launch', 'orbits', 'aurora',
                 'buoy', 'airkr', 'lightning', 'regional', 'alerts', 'ukfc', 'tourism']
      .filter(id => store.isOn(id));

    for (const id of seq) {
      if (this._loaded[LOAD_KEY[id] || id]) continue;   // 환류/열돔처럼 이미 받은 것
      this._loaded[LOAD_KEY[id] || id] = true;
      await this.run(id, LOADERS[id]);
      this.applyAll();
      await sleep(GAP);
    }

    this.startTimers();          // 초기 순차 로드가 끝난 뒤에 주기 갱신을 켠다
  },

  /* ── 갱신 ─────────────────────────────────────────────────── */
  /* 언어를 바꿨을 때처럼 전부 다시 그려야 할 때 쓴다.
     ⚠️ **켜져 있는 것만** 받는다. 예전에는 지진·태풍·뉴스·발사·오로라·궤도·환류·
        산불을 꺼져 있어도 받았다 — 화면에 없는 것을 위해 통신하는 셈이었다.
     ⚠️ 안전 소스(지진·쓰나미)만 예외다. 하단 배너가 이걸 쓴다. */
  async refreshAll() {
    const ids = Object.keys(LOADERS).filter(id => store.isOn(id));
    const done = new Set();
    await Promise.allSettled([
      this.run('quake',   () => quakes.refresh()),      // 안전 소스
      this.run('tsunami', () => tsunami.refresh()),     // 안전 소스
      ...ids.map(id => {
        const key = LOAD_KEY[id] || id;
        if (key === 'quake' || key === 'tsunami' || done.has(key)) return Promise.resolve();
        done.add(key);
        return this.run(id, LOADERS[id]);
      }),
    ]);
    ids.forEach(id => { this._loaded[LOAD_KEY[id] || id] = true; });
    this._loaded.quake = true;
    this._loaded.tsunami = true;
    this.applyAll();
  },

  /* ⚠️⚠️ 마지막 성공 시각을 남긴다. (감사 P1-3)
     예전에는 status 만 있어서 실패했을 때 "언제 자료까지는 맞았나"를 말할 수 없었다.
     빈 지도는 사용자가 "지금 위험 없음"으로 읽는다 — 실패인지 사건 없음인지
     구분해 주지 않으면 그건 안전 정보에서 가장 나쁜 침묵이다. */
  lastOk: {},
  lastErr: {},
  async run(id, fn) {
    this.status[id] = 'loading';
    try {
      await fn();
      this.status[id] = 'ok';
      this.lastOk[id] = Date.now();
    } catch (e) {
      this.status[id] = 'error';
      this.lastErr[id] = e.message;
      console.warn(`[${id}]`, e.message);
    }
  },

  /* 주기 갱신.
     ⚠️ **꺼져 있는 레이어는 갱신하지 않는다.** 예전에는 지진·발사·오로라·궤도·
        태풍·뉴스·산불이 꺼져 있어도 계속 폴링했다. 20분마다 산불 목록을 받아
        아무도 안 보는 엔티티 912개를 다시 만드는 식이었다 — 순수한 발열이다.
     ⚠️ 예외는 안전 소스 둘(지진·쓰나미)뿐이다. 하단 배너가 이걸 쓴다. */
  startTimers() {
    const on = (id, fn, ms) => setInterval(() => {
      if (!store.isOn(id)) return;
      this.run(id, fn).then(() => this.applyAll());
    }, ms);

    // 안전 소스 — 레이어가 꺼져 있어도 계속 본다 (배너용). 둘 다 수 KB.
    setInterval(() => this.run('quake',   () => quakes.refresh()).then(() => this.applyAll()), REFRESH.quake);
    setInterval(() => this.run('tsunami', () => tsunami.refresh()).then(() => this.applyAll()), REFRESH.tsunami);

    on('launch',   LOADERS.launch,   REFRESH.launch);
    on('aurora',   LOADERS.aurora,   REFRESH.aurora);
    on('orbits',   LOADERS.orbits,   REFRESH.orbits);
    on('cyclone',  LOADERS.cyclone,  REFRESH.cyclone);
    on('news',     LOADERS.news,     REFRESH.news);
    on('wildfire', LOADERS.wildfire, REFRESH.wildfire);
    on('landobs', LOADERS.landobs, REFRESH.landobs);
    on('buoy',     LOADERS.buoy,     REFRESH.buoy);
    on('airkr',    LOADERS.airkr,    REFRESH.airkr);
    on('lightning',LOADERS.lightning,REFRESH.lightning);
    on('regional', LOADERS.regional, REFRESH.regional);
    on('alerts',   LOADERS.alerts,   REFRESH.alerts);
    on('ukfc',     LOADERS.ukfc,     REFRESH.ukfc);
    on('tourism',  LOADERS.tourism,  REFRESH.tourism);
    on('clouds',   () => imagery._addClouds(), REFRESH.clouds);
  },

  /* ── 가시성 ───────────────────────────────────────────────── */
  onToggle(id) {
    const def = LAYER_DEFS.find(d => d.id === id);
    if (!def) return;
    if (def.kind === 'coverage') {
      coverage.show(store.isOn(id)).catch(e => console.warn('[coverage]', e.message));
    }
    else if (def.kind === 'imagery') imagery.set(id, store.isOn(id));
    else if (def.kind === 'grid') {
      gridOverlay.show(gridKey(id), store.isOn(id));
      /* pressure는 kind:grid라 이 분기에서 이미 끝난다. 예전의 아래 id 분기는
         도달할 수 없어 일반 토글에서 등압선만 빠질 수 있었다. */
      if (id === 'pressure') {
        import('../isobars.js').then(({ isobars }) => isobars.set(store.isOn('pressure')))
          .catch(e => console.warn('[등압선]', e.message));
      }
    }
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
      if (!store.isOn(id)) gridOverlay.show(id, false);
    }
    else if (id === 'cyclone') cyclones.set(store.isOn(id));
    else if (id === 'news') events.set(store.isOn(id));
    else if (id === 'tsunami') tsunami.set(store.isOn(id));
    else if (id === 'eclipse') eclipseMarks.set(store.isOn(id));
    else if (id === 'phenomena') phenomena.set(store.isOn(id));
    else if (id === 'heatdome') phenomena.setHeat(store.isOn(id));
    else if (id === 'tourism') tourismFlow.set(store.isOn(id));
    else if (pointLayers[id]) pointLayers[id].applyVisibility();
    if (id === 'launch') launchPads.set(store.isOn('launch'));

    if (id === 'poi') poi.refresh();

    /* 켰으면 그때 받는다. 예전에는 여기에 레이어마다 if 가 따로 있었고
       (buoy·lightning·regional·alerts·ukfc) 나머지는 부팅 때 무조건 받았다.
       이제 전부 LOADERS 표 한 곳에서 다룬다 — 빠뜨리면 빈 레이어가 되므로
       추가할 때 표에도 같이 넣을 것. */
    this._ensureLoaded(id);
  },

  /** 한 번 받은 것 (LOAD_KEY 기준) */
  _loaded: {},

  /** 켜져 있으면 자료를 확보한다. 이미 있으면 아무 일도 안 한다. */
  _ensureLoaded(id) {
    const fn = LOADERS[id];
    if (!fn || !store.isOn(id)) return;
    const key = LOAD_KEY[id] || id;
    if (this._loaded[key] && !ALWAYS_FRESH.has(id)) return;
    this._loaded[key] = true;
    /* 태풍은 GDACS 타임아웃과 기관·유사사례 자료를 함께 기다려 첫 실행이 길다.
       메뉴 클릭 순간부터 실제 run 종료까지를 알린다. 퍼센트는 UI가 만들지 않는다. */
    if (id === 'cyclone') {
      document.dispatchEvent(new CustomEvent('earthus:runtime-loading', {
        detail: { key: 'cyclone-layer', active: true },
      }));
    }
    const pending = this.run(id, fn);
    pending.finally(() => {
      if (id !== 'cyclone') return;
      document.dispatchEvent(new CustomEvent('earthus:runtime-loading', {
        detail: { key: 'cyclone-layer', active: false },
      }));
    });
    pending.then(() => this.applyAll());
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
    /* ⚠️ applyAll 에서도 불러야 한다 — 레이어 목록에서 켜면 apply() 를 안 거치고
       여기로 오는 경로가 있다(실측에서 등압선만 안 나왔다). */
    import('../isobars.js').then(({ isobars }) => isobars.set(store.isOn('pressure')))
      .catch(() => {});
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
    tourismFlow.applyVisibility();
    wind.refresh();
    gridOverlay.refreshResolution();
  },

  /**
   * 바람은 선 레이어라 기온 색면과 함께 켤 수 있다. 하지만 사용자가 **바람 자체를
   * Data View로 고른 때**에는 실제 풍속 색면이 필요하다. 상태 단계가 바뀔 때만
   * 색면을 교대해 두 반투명 면이 겹치지 않게 한다. 시간 프리셋(temp+wind)은 temp가
   * Data View라 기온 색면 + 바람 입자 조합을 그대로 보존한다.
   */
  _syncDataSurface(state) {
    const windKey = state?.view !== 'earth' && state?.view !== 'style'
      && (state.layer === 'wind' || state.layer === 'windfc') ? state.layer : null;
    if (windKey && store.isOn(windKey)) {
      Object.keys(gridOverlay.layers).forEach(key => {
        if (key !== windKey) gridOverlay.show(key, false);
      });
      gridOverlay.show(windKey, true);
      return;
    }
    gridOverlay.show('wind', false);
    gridOverlay.show('windfc', false);
    const def = LAYER_DEFS.find(item => item.id === state?.layer);
    if (def?.kind === 'grid' && store.isOn(def.id)) {
      gridOverlay.show(gridKey(def.id), true);
    }
  },

  /** 현재 화면에 렌더 중인 점 개수 (HUD용) */
  visibleCount() {
    return Object.values(pointLayers).reduce((n, l) => n + l.count(), 0);
  },
};

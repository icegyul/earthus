// 우주 레이어 — 로켓 발사(LL2) + 위성 궤도(CelesTrak OMM + SGP4)
import { PointLayer } from './pointLayer.js';
import { viewer } from '../viewer.js';
import { API, C, GLOBAL_EVENT } from '../config.js';
import { fetchT } from '../net.js';
import { getLaunchSchedule } from '../launch-schedule.js';
import { i18n } from '../i18n.js';
import { SAT_GROUPS, satDetail, ISS_ICON } from './satcat.js';
import { power } from '../power.js';

/* ══════════════════════════════════════════════════════════════
   로켓 발사 — Launch Library 2.3 (비인증 15회/시간)
   §5-5: 발사장 핀 + 카운트다운 → 미션 정보 + 라이브 스트림
   §5-10: 발사 D-24h 이내면 전지구 노출
   ══════════════════════════════════════════════════════════════ */
export const launches = {
  layer: null,
  upcoming: [],

  init() {
    this.layer = new PointLayer({
      id: 'launch',
      color: C.violet,
      radius: 6,
      cluster: true,
      globalOK: m => m.data._hoursOut != null
        && m.data._hoursOut >= 0
        && m.data._hoursOut <= GLOBAL_EVENT.LAUNCH_HOURS,
    });
    return this.layer;
  },

  async refresh() {
    /* mode=normal이면 우리가 쓰지 않는 이미지·설명을 덜 받는다.
       ⚠️ LL2 이미지에는 CC BY-NC 등 제3자 라이선스가 섞여 있으므로 표시하지 않는다. */
    const schedule = await getLaunchSchedule({url:API.LAUNCH,fetcher:fetchT});
    const j = {results:schedule.rawResults};
    this.retrievedAt = schedule.retrievedAt;
    this.cached = schedule.mode === 'cached';
    this.retryAt = schedule.retryAt;
    const t = i18n.t.F;
    const now = Date.now();

    const items = (j.results || [])
      .filter(r => r.pad && r.pad.latitude != null && r.pad.longitude != null)
      .map(r => {
        const net = r.net ? new Date(r.net).getTime() : null;
        const hoursOut = net != null ? (net - now) / 3600_000 : null;
        const stream = (r.vidURLs || r.vid_urls || []).find(v => v.url)?.url || null;
        return {
          id: r.id,
          name: (r.name || '').split('|')[0].trim(),
          lat: Number(r.pad.latitude),
          lon: Number(r.pad.longitude),
          kind: 'launch',
          pulse: hoursOut != null && hoursOut >= 0 && hoursOut <= 6,
          radius: hoursOut != null && hoursOut >= 0 && hoursOut <= 24 ? 9 : 6,
          data: {
            _hoursOut: hoursOut,
            _net: r.net,
            _stream: stream,
            _source: 'Launch Library 2',
            _retrievedAt: schedule.retrievedAt,
            _cached: schedule.mode === 'cached',
            [t.provider]: r.launch_service_provider?.name || '—',
            [t.pad]: r.pad?.name || '—',
            [t.net]: r.net ? `${new Date(r.net).toLocaleString(i18n.lang)} (${i18n.rel(r.net)})` : '—',
            [t.status]: r.status?.name || '—',
            ...(stream ? { [t.watch]: stream } : {}),
          },
        };
      });

    this.upcoming = items
      .filter(m => m.data._hoursOut != null && m.data._hoursOut > 0)
      .sort((a, b) => a.data._hoursOut - b.data._hoursOut);

    this.layer.setData(items);
    return items;
  },

  next() { return this.upcoming[0] || null; },
};

/* ══════════════════════════════════════════════════════════════
   위성 궤도 — CelesTrak OMM JSON + SGP4 로컬 연산
   §5-10: 선(line) 레이어 → 전지구부터 표시

   사용자가 그룹을 골라 개수를 조절한다 (satcat.js 의 SAT_GROUPS).
   우주정거장은 선택과 무관하게 항상 표시하고 ISS 는 아이콘으로 그린다.
   ══════════════════════════════════════════════════════════════ */
const LS_GROUPS = 'earthus.satgroups';
const LS_KEEP = 'earthus.satKeepVisible';
/* 우주정거장으로 "아이콘"을 줄 대상.
   ⚠️ 궤도에 있는 유인 정거장은 ISS 와 톈궁(CSS) 둘뿐이다. 셋째는 없다.
      다만 정거장은 모듈 여러 개가 도킹해 한 덩어리로 다닌다 —
      ISS 는 ZARYA·POISK·NAUKA…, 톈궁은 TIANHE·WENTIAN·MENGTIAN 이다.
      전부 같은 좌표라 각각 점을 찍으면 겹쳐서 지저분하다.
      → 대표 모듈 하나에만 아이콘을 주고 나머지 모듈은 감춘다.
      → 도킹한 우주선(소유즈·드래건·프로그레스…)은 따로 표시한다.
        정거장에 지금 무엇이 붙어 있는지가 사람들이 궁금해하는 정보다. */
const STATION_MAIN = { 'ISS (ZARYA)': 'ISS', 'CSS (TIANHE)': 'CSS' };

// 대표 모듈과 같은 덩어리라 화면에서 뺀다 (정보 시트에는 남는다)
const STATION_PARTS = /^(POISK|ZVEZDA|ISS \(NAUKA\)|NAUKA|RASSVET|PIRS|PRICHAL|CSS \((WENTIAN|MENGTIAN)\))$/;

// 정거장에 도킹했거나 오가는 우주선
const VISITING = /^(SOYUZ|PROGRESS|CREW DRAGON|DRAGON|CYGNUS|SHENZHOU|SZ-\d|TIANZHOU|STARLINER|HTV|CARGO)/i;
const LABEL_LIMIT = 400;   // 이 개수를 넘으면 이름표를 끈다 (아래 build() 참고)

/* 위성 위치를 다시 계산하는 간격.
   짧을수록 부드럽지만 CPU 를 그만큼 더 쓴다 (발열·배터리).
   100ms 면 전지구 뷰에서 위성이 0.02px 움직인 상태라 차이를 못 느낀다.
   250ms 도 0.05px 로 눈에 안 보이고, 계산·렌더 횟수는 10회→4회/초로 줄어든다. */
const POS_INTERVAL_MS = 250;

/* ── 렌더 상한 ────────────────────────────────────────────────
   ⚠️ 위성 개수에 상한이 없었다. 그게 이 앱 최악의 발열 경로였다.

   실측(2026-07-28, 맥):  위성 1개당 SGP4 + Cartesian3 = 0.00614 ms
       스타링크 10,776개 →  66 ms
       전체     16,123개 →  99 ms      ← 당시 POS_INTERVAL_MS 가 100ms 였다
   즉 예전에는 100ms 틱마다 99ms 를 써서 코어 하나를 통째로 물었다.
   폰은 3~5배 느리니 따라가지도 못하고 메인 스레드가 포화된다.

   그래서 **기기 성능을 직접 재서** 상한을 정한다. 숫자를 지어내지 않는다.
   틱 예산의 8ms만 쓴다 — 250ms 간격 기준 CPU 약 3.2%다.

   ⚠️ 자르면 자른다고 **반드시 화면에 적는다**(satsTotal/satsCapped).
      무료로 풀렸어도 조용히 80%를 버리면 그건 속이는 것이다. */
const POS_BUDGET_MS = 8;
const CAP_MIN = 400;       // 느린 폰에서 하한 때문에 예산을 넘지 않게 한다
const CAP_MAX = 20000;     // 카탈로그 전체(16,123)보다 크면 상한이 없는 것과 같다

export const orbits = {
  ds: null,
  sats: [],
  loading: false,
  _catalog: null,
  catalogAge: null,
  source: null,          // 's3' | 'celestrak' — 어느 경로로 받았는지
  _trackTimer: null,
  _priorityNorad: null,
  selected: JSON.parse(localStorage.getItem(LS_GROUPS) || 'null')
            || ['stations', 'korea', 'weather', 'science'],

  /* 확대해도 위성을 계속 보여줄지.
     기본은 꺼짐 — 가까이서는 궤도가 화면 밖이라 점만 떠다니고 지표를 가린다.
     켜면 "내가 있는 곳 위로 무엇이 지나가는지"를 볼 수 있다. 그게 이 옵션의 목적이다. */
  keepVisible: localStorage.getItem(LS_KEEP) === 'on',

  setKeepVisible(on) {
    this.keepVisible = on;
    localStorage.setItem(LS_KEEP, on ? 'on' : 'off');
    this.emit();
  },
  _subs: [],

  init() {
    this.ds = new Cesium.CustomDataSource('orbits');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._stopTrackTimer();
      else if (this.ds?.show) this._startTrackTimer();
    });
    return this;
  },

  onChange(fn) { this._subs.push(fn); },
  emit() { this._subs.forEach(f => f(this)); },

  /** 그룹 선택 변경.
      우주정거장도 다른 그룹과 똑같이 끌 수 있다 — 강제로 켜두지 않는다. */
  async setGroups(ids) {
    this.selected = Array.from(new Set(ids));
    localStorage.setItem(LS_GROUPS, JSON.stringify(this.selected));
    await this.refresh();
  },
  isSelected(id) { return this.selected.includes(id); },

  /** 검색에서 한 위성을 지정해 불러온다. 렌더 상한에 잘리더라도 지정한 한 기는 남긴다. */
  async prepareByNorad(norad, groupId) {
    const id = String(norad);
    const group = SAT_GROUPS.find(g => g.id === groupId);
    if (!group) throw new Error('UNKNOWN_SAT_GROUP');
    this._priorityNorad = id;
    if (!this.selected.includes(groupId)) {
      this.selected = [...this.selected, groupId];
      localStorage.setItem(LS_GROUPS, JSON.stringify(this.selected));
    }
    await this.refresh();
    const idx = this.sats.findIndex(s => String(s.noradId) === id);
    if (idx < 0) throw new Error('SATELLITE_NOT_IN_CATALOG');
    const position = this.propagate(this.sats[idx].rec, new Date());
    if (!position) throw new Error('SATELLITE_POSITION_UNAVAILABLE');
    return { idx, sat: this.sats[idx], position };
  },

  /** 선택된 그룹의 예상 위성 수 — 경고 판단용 */
  estimate(ids) {
    return (ids || this.selected)
      .map(id => SAT_GROUPS.find(g => g.id === id))
      .filter(Boolean)
      .reduce((n, g) => n + g.est, 0);
  },

  /** 카탈로그를 한 번만 받아 캐시 (그룹 전환 시 재요청 안 함) */
  async loadCatalog() {
    if (this._catalog) return this._catalog;
    const res = await fetchT(API.SAT_CATALOG, { timeout: 30_000 });   // 압축 카탈로그가 커서 넉넉히
    if (!res.ok) throw new Error('catalog ' + res.status);
    // S3 가 Content-Encoding: gzip 을 붙여 보내므로 브라우저가 알아서 푼다
    this._catalog = await res.json();
    return this._catalog;
  },

  /* 폴백 — S3 카탈로그를 못 받을 때 CelesTrak 을 직접 부른다.
     ⚠️ 이건 어디까지나 비상용이다. CelesTrak 은 rate limit 이 있어서
        사용자가 늘면 막힌다(실측으로 걸렸다). 그리고 SATCAT 조인이 없어
        국가·발사일·발사장·크기가 전부 빠진다. 평상시엔 S3 경로를 써야 한다. */
  async fetchGroupDirect(g) {
    const rows = [];
    const seen = new Set();
    for (const name of (g.celestrak || [])) {
      try {
        const r = await fetchT(`${API.GP}?GROUP=${name}&FORMAT=json`);
        if (!r.ok) continue;
        const txt = await r.text();
        // rate limit 에 걸리면 짧은 안내문이 200 으로 돌아온다
        if (txt.length < 500) { console.warn('[orbits] rate limit 의심:', name); continue; }
        let raw;
        try { raw = JSON.parse(txt); } catch (_) { continue; }
        if (!Array.isArray(raw)) continue;
        for (const omm of raw) {
          const id = String(omm?.NORAD_CAT_ID ?? '');
          if (!id || seen.has(id)) continue;
          const row = { n: String(omm.OBJECT_NAME || id), id, omm };
          seen.add(row.id);
          rows.push(row);
        }
      } catch (_) { /* 그룹 하나 실패해도 나머지는 계속 */ }
    }
    return rows;
  },

  /** 카탈로그 행 → 화면에 쓸 위성 객체 */
  toSat(row, g) {
    /* 새 카탈로그는 6~9자리 번호를 담을 수 있는 OMM JSON이다.
       배포 순서 사이에 남은 구형 S3 캐시도 읽히도록 TLE 폴백은 유지한다. */
    const a = row.o;
    const omm = row.omm || (Array.isArray(a) ? {
      OBJECT_NAME: row.n, OBJECT_ID: row.oid, NORAD_CAT_ID: Number(row.id),
      EPOCH: a[0], MEAN_MOTION: a[1], ECCENTRICITY: a[2], INCLINATION: a[3],
      RA_OF_ASC_NODE: a[4], ARG_OF_PERICENTER: a[5], MEAN_ANOMALY: a[6],
      EPHEMERIS_TYPE: a[7], CLASSIFICATION_TYPE: a[8], ELEMENT_SET_NO: a[9],
      REV_AT_EPOCH: a[10], BSTAR: a[11], MEAN_MOTION_DOT: a[12], MEAN_MOTION_DDOT: a[13],
    } : null);
    const rec = omm ? satellite.json2satrec(omm)
                    : satellite.twoline2satrec(row.l1, row.l2);
    if (!rec || rec.error !== 0) return null;
    let objectId = row.oid || omm?.OBJECT_ID || null;
    if (!objectId && row.l1) {
      const raw = row.l1.slice(9, 17).trim();
      const yy = +raw.slice(0, 2);
      objectId = raw ? `${yy < 57 ? 2000 + yy : 1900 + yy}-${raw.slice(2)}` : null;
    }
    return {
      name: row.n, rec,
      noradId: row.id,
      objectId,
      group: g.id, color: g.color,
      // SATCAT 조인 결과 — CelesTrak 직접 폴백 경로에선 전부 undefined 다.
      owner: row.own, ownerKo: row.ownKo,
      launchDate: row.ld, launchSite: row.ls,
      opsKo: row.opsKo, opsEn: row.opsEn, rcs: row.rcs,
    };
  },

  async refresh() {
    if (typeof satellite === 'undefined') {
      console.warn('[orbits] satellite.js 미로드');
      return [];
    }
    /* 그룹을 전부 끄면 카탈로그를 받을 이유가 없다.
       (우주정거장을 강제로 켜두던 때는 이 경우가 없었다) */
    if (!this.selected.length) {
      this.sats = [];
      this.clearTrack?.();
      this.build();
      this.emit();
      return [];
    }
    this.loading = true; this.emit();

    let cat = null;
    try {
      cat = await this.loadCatalog();
      this.source = 's3';
    } catch (e) {
      // S3 가 막히거나(CORS 미설정 등) 죽었을 때만 여기로 온다
      console.warn('[orbits] S3 카탈로그 실패 → CelesTrak 직접 호출로 폴백:', e.message);
      this.source = 'celestrak';
    }

    const groups = SAT_GROUPS.filter(g => this.selected.includes(g.id));
    const out = [];
    /* ⚠️ 그룹 사이 중복을 여기서 걸러야 한다.
       Lambda 는 그룹 "안에서만" 중복을 없앤다. 그런데 같은 위성이 여러 그룹에
       들어가는 일이 흔하다 — ISS 는 stations 이면서 amateur(무선 장비 탑재)다.
       안 거르면 같은 자리에 두 번 그려지고, 아이콘도 두 개가 겹친다. */
    const seen = new Set();
    for (const g of groups) {
      const rows = cat ? (cat.groups?.[g.id] || []) : await this.fetchGroupDirect(g);
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        try {
          const s = this.toSat(row, g);
          if (s) out.push(s);
        } catch (_) { /* 개별 TLE 실패 무시 */ }
      }
    }

    this.catalogAge = cat?.generated || null;

    /* 검색으로 지정한 위성은 기기별 렌더 상한 앞에 둔다.
       ⚠️ 전체 상한을 늘리지 않는다 — 한 기를 살리려고 발열 예산을 깨면 안 된다. */
    if (this._priorityNorad) {
      const priorityIndex = out.findIndex(s => String(s.noradId) === this._priorityNorad);
      if (priorityIndex > 0) out.unshift(out.splice(priorityIndex, 1)[0]);
    }

    /* ⚠️ 여기서 자른다. 자르는 순서가 곧 우선순위다 —
       SAT_GROUPS 가 작은 그룹(정거장·기상·과학…)을 먼저 두고 스타링크·전체를
       마지막에 두므로, 앞에서부터 남기면 "볼 만한 것"이 먼저 살아남는다. */
    const cap = this.renderCap();
    this.satsTotal = out.length;
    this.satsCapped = out.length > cap;
    this.sats = this.satsCapped ? out.slice(0, cap) : out;
    if (this.satsCapped) {
      console.warn(`[orbits] ${out.length}개 중 ${cap}개만 그린다 (기기 성능 기준)`);
    }
    this.build();
    this.loading = false; this.emit();
    return out;
  },

  /** 이 기기가 100ms 틱 안에 무리 없이 전파할 수 있는 위성 수.
   *
   *  ⚠️ 상수를 박지 않는다. 맥과 저가 안드로이드는 5배 넘게 차이 난다 —
   *     한쪽에 맞춘 숫자는 다른 쪽에서 반드시 틀린다. 그래서 **직접 잰다.**
   *  ⚠️ 한 번만 재고 기억한다. 매번 재면 그 측정 자체가 비용이다.
   *  ⚠️ 잴 표본이 없으면(위성 0개) 상한을 걸지 않는다 — 모르면 건드리지 않는다.
   */
  renderCap() {
    if (this._cap) return this._cap;
    const sample = this.sats?.length ? this.sats : null;
    if (!sample) return CAP_MAX;
    const when = new Date();
    const N = 400;
    for (let i = 0; i < 200; i++) this.propagate(sample[i % sample.length].rec, when); // 워밍업

    /* ⚠️ 한 번만 재면 안 된다. 앱이 로딩·렌더로 바쁠 때 재면 실제보다 몇 배 느리게
       나온다 (실측: 격리 상태 0.006ms 가 구동 중엔 0.022ms — 3.6배).
       그 값으로 상한을 정하면 멀쩡한 기기에서도 위성이 과하게 잘린다.
       그래서 짧게 여러 번 재고 **최솟값**을 쓴다 — 마이크로벤치의 표준 방식이다.
       최솟값은 "방해가 가장 적었던 회차"이고, 그게 이 기기의 진짜 능력에 가깝다. */
    let per = Infinity;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        const p = this.propagate(sample[i % sample.length].rec, when);
        if (p) Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000);
      }
      const dt = (performance.now() - t0) / N;
      if (dt > 0 && dt < per) per = dt;
    }
    if (!isFinite(per) || per <= 0) return CAP_MAX;     // 타이머 해상도가 낮으면 포기
    this._cap = Math.max(CAP_MIN, Math.min(CAP_MAX, Math.floor(POS_BUDGET_MS / per)));
    this._capPerSatMs = +per.toFixed(5);
    console.log(`[orbits] 위성 1개 ${this._capPerSatMs}ms → 상한 ${this._cap}개`);
    return this._cap;
  },

  /* 위성 위치 일괄 계산 + 캐시
     ────────────────────────────────────────────────────────────
     ⚠️ 예전엔 위성마다 CallbackProperty 안에서 매 프레임 SGP4 를 돌렸다.
        실측: 위성 263개에 프레임당 6.6ms. 렌더(GPU)는 0.6ms 였으니
        프레임 비용의 94% 가 이 계산이었다.
        120fps 면 초당 792ms — CPU 코어 하나를 계속 태운다. 폰이 뜨거워진다.

     그런데 이렇게까지 자주 계산할 이유가 없다.
       위성은 초속 7.5km. 전지구 뷰에서 1px ≈ 34km 이므로
       100ms 동안 움직이는 거리는 0.75km = 0.02px 다. 눈에 보이지 않는다.
     → 처음에는 100ms, 이번 발열 전수 점검에서 250ms 로 늘렸다.
       250ms 이동도 0.05px 라 안 보이고, 계산은 초당 10회→4회로 줄어든다. */
  _pos: [],
  _posAt: 0,

  _syncPositions() {
    if (document.hidden || !this.ds?.show) return;
    const now = Date.now();
    if (now - this._posAt < POS_INTERVAL_MS) return;
    this._posAt = now;
    // requestRenderMode 를 켜뒀으므로, 위치가 바뀌었으면 다시 그려달라고 알려야 한다
    /* ⚠️ 위치 갱신이 250ms 간격이므로 렌더도 그 간격으로 충분하다.
       30fps 로 그리면 같은 좌표를 일곱 번 넘게 그리는 셈이다. */
    if (this.ds?.show) power.animate(POS_INTERVAL_MS * 3, POS_INTERVAL_MS, 'orbits');
    const when = new Date(now);
    const n = this.sats.length;
    if (this._pos.length !== n) this._pos = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = this.propagate(this.sats[i].rec, when);
      this._pos[i] = p
        ? Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000)
        : undefined;
    }
  },

  build() {
    this.ds.entities.removeAll();
    this._pos = []; this._posAt = 0;

    // ⚠️ 라벨은 개수에 비례해 프레임을 갉아먹는다.
    //    스타링크(10,776) · 전체(16,123) 를 켜면 라벨 렌더링만으로 멈춘다.
    //    이름은 클릭하면 정보 시트에 나오므로, 많을 땐 점만 그린다.
    const showLabels = this.sats.length <= LABEL_LIMIT;

    this.sats.forEach((s, idx) => {
      const color = Cesium.Color.fromCssColorString(s.color);
      const stationTag = STATION_MAIN[s.name];       // 'ISS' | 'CSS' | undefined
      const isStation = !!stationTag;
      const isPart = STATION_PARTS.test(s.name);      // 대표와 겹치는 모듈
      const isVisiting = VISITING.test(s.name);

      // ⚠️ 여기서 매번 propagate 하면 안 된다. 아래 _syncPositions 주석 참고.
      const posProp = new Cesium.CallbackProperty(() => {
        this._syncPositions();
        return this._pos[idx];
      }, false);

      const ent = {
        id: `orbit:${idx}`,
        position: posProp,
        _meta: { id: `sat-${idx}`, name: s.name, kind: 'satellite', _sat: s, _satIdx: idx },
        _layer: 'orbits',
      };

      // 대표 모듈과 같은 자리에 겹치는 모듈은 그리지 않는다 (정보는 시트에 남는다)
      if (isPart) return;

      if (isStation) {
        // 우주정거장은 아이콘으로 (요청사항)
        ent.billboard = {
          image: ISS_ICON,
          width: 34, height: 34,
          color: Cesium.Color.WHITE,
          scaleByDistance: new Cesium.NearFarScalar(1_000_000, 1.25, 40_000_000, 0.75),
        };
        ent.label = {
          text: stationTag,
          font: '500 12px -apple-system, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#dff6ff'),
          pixelOffset: new Cesium.Cartesian2(0, -26),
        };
      } else if (isVisiting) {
        // 도킹 우주선 — 정거장보다 작게, 청록으로 구분
        ent.point = {
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString('#7fe3dd'),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.65), outlineWidth: 1.6,
        };
        ent.label = {
          text: s.name.replace(/\s*\(.*\)$/, ''),
          font: '300 10px -apple-system, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#bff2ee').withAlpha(0.9),
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 30_000_000),
        };
      } else {
        ent.point = {
          pixelSize: 4, color,
          outlineColor: color.withAlpha(0.35), outlineWidth: 2,
          // ⚠️ Infinity 금지 — 지구 뒤편 위성이 뚫고 보인다
        };
        if (showLabels) {
          ent.label = {
            text: s.name,
            font: '300 11px ui-monospace, monospace',
            fillColor: Cesium.Color.WHITE.withAlpha(0.8),
            pixelOffset: new Cesium.Cartesian2(0, -14),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
          };
        }
      }
      this.ds.entities.add(ent);

      // 궤적은 대표 정거장만 (전체를 그리면 과부하)
      if (isStation) {
        const path = this.track(s.rec, 92, 90);
        if (path.length > 4) {
          this.ds.entities.add({
            id: `orbitpath:${idx}`,
            polyline: {
              positions: path, width: 1.4,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.18, color: color.withAlpha(0.55),
              }),
              arcType: Cesium.ArcType.NONE,
            },
            _trackOf: idx,
          });
        }
      }
    });

    if (this.ds.show) this._startTrackTimer();
    else this._stopTrackTimer();
  },

  _startTrackTimer() {
    if (this._trackTimer != null || document.hidden || !this.ds?.show) return;
    this._trackTimer = setInterval(() => this.redrawTracks(), 120_000);
  },

  _stopTrackTimer() {
    clearInterval(this._trackTimer);
    this._trackTimer = null;
  },

  redrawTracks() {
    /* 꺼진 뒤에도 2분마다 궤적 180점을 다시 전파하던 숨은 계산을 막는다. */
    if (!this.ds?.show || document.hidden) return;
    this.ds.entities.values.filter(e => e._trackOf != null).forEach(e => {
      const s = this.sats[e._trackOf];
      if (!s) return;
      const path = this.track(s.rec, 92, 90);
      if (path.length > 4) e.polyline.positions = path;
    });
  },

  /* ── 선택한 위성의 궤적 ────────────────────────────────────────
     "어디서 어디로 가는지"를 보여준다.
     ⚠️ 전부 그리면 안 된다 — 16,000개의 궤적은 화면을 덮고 프레임을 죽인다.
        선택한 하나만 그리고, 선택이 바뀌면 지운다.
     ⚠️ 지나온 길과 갈 길을 구분한다. 같은 선으로 그리면 방향을 알 수 없다. */
  _selTrack: [],

  showTrack(idx) {
    this.clearTrack();
    const s = this.sats[idx];
    if (!s) return;
    const col = Cesium.Color.fromCssColorString(s.color || '#7ec8e3');
    const period = (2 * Math.PI) / s.rec.no;      // 분

    // 지나온 30분 (흐리게) + 앞으로 갈 한 바퀴 (밝게)
    const past = this.track(s.rec, -30, 40);
    const next = this.track(s.rec, Math.min(period, 120), 110);

    if (past.length > 3) {
      this._selTrack.push(this.ds.entities.add({
        id: `seltrack:past:${idx}`,
        polyline: { positions: past, width: 1.6, arcType: Cesium.ArcType.NONE,
          material: col.withAlpha(0.28) },
      }));
    }
    if (next.length > 3) {
      this._selTrack.push(this.ds.entities.add({
        id: `seltrack:next:${idx}`,
        polyline: { positions: next, width: 2.4, arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2, color: col.withAlpha(0.9) }) },
      }));
      // 진행 방향 끝점 — 어디로 가는지 한눈에
      this._selTrack.push(this.ds.entities.add({
        id: `seltrack:tip:${idx}`,
        position: next[next.length - 1],
        point: { pixelSize: 6, color: col, outlineColor: Cesium.Color.WHITE.withAlpha(0.7),
                 outlineWidth: 1.5 },
        label: { text: i18n.lang === 'ko' ? '진행 방향' : 'heading',
          font: '300 10px -apple-system, sans-serif',
          fillColor: Cesium.Color.WHITE.withAlpha(0.7),
          pixelOffset: new Cesium.Cartesian2(0, -14) },
      }));
    }
  },

  clearTrack() {
    this._selTrack.forEach(e => { try { this.ds.entities.remove(e); } catch (_) {} });
    this._selTrack = [];
  },

  /** 정보 시트용 상세 — 클릭 시점의 실시간 위치와 함께 */
  detail(idx, lang) {
    const s = this.sats[idx];
    if (!s) return null;
    return satDetail(s, this.propagate(s.rec, new Date()), lang);
  },

  propagate(rec, when) {
    try {
      const pv = satellite.propagate(rec, when);
      if (!pv || !pv.position) return null;
      const gmst = satellite.gstime(when);
      const gd = satellite.eciToGeodetic(pv.position, gmst);
      return {
        lon: satellite.degreesLong(gd.longitude),
        lat: satellite.degreesLat(gd.latitude),
        alt: gd.height,
        vel: pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null,
        at: when.toISOString(),
      };
    } catch (_) { return null; }
  },

  /** minutes 가 음수면 과거 궤적을 그린다 */
  track(rec, minutes, steps) {
    const out = [];
    const t0 = Date.now();
    for (let i = 0; i <= steps; i++) {
      const p = this.propagate(rec, new Date(t0 + (i * minutes * 60_000) / steps));
      if (p) out.push(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000));
    }
    return out;
  },

  set(on) {
    if (!this.ds) return;
    this.ds.show = on;
    if (on) {
      this._startTrackTimer();
      power.animate(POS_INTERVAL_MS * 2, POS_INTERVAL_MS, 'orbits');
    } else {
      this._stopTrackTimer();
      power.cancel('orbits');
    }
  },
};

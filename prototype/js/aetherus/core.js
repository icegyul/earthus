// AETHERUS — 정본 궤도 인텔리전스 코어 (렌더러 무관)
//
// ══ 하나의 AETHERUS ══════════════════════════════════════════════════════
// AETHERUS 에는 v1·v2·v3 갈래가 없다. 세 지구가 이 한 파일을 함께 쓰고,
// 화면에 그리는 방법만 어댑터가 다르다.
//
//   EARTHUS      /      Cesium      → layer-cesium.js
//   Intelligence /v2    Three.js    → layer-three.js
//   WONDER       /v3    Three.js    → layer-three.js
//
// 예전에는 지구마다 자기 우주를 따로 갖고 있었다 — 1.0 은 js/space/ 44개 모듈,
// v2 는 aetherus-link.js, v3 는 아무것도. 같은 이름으로 서로 다른 것을 가리켰다.
// 정본은 여기 하나다. 지구를 고치는 사람이 우주까지 고칠 필요가 없어야 한다.
//
// ══ 정직성 규칙 (1.0 원칙 그대로) ════════════════════════════════════════
//  · 위치를 지어내지 않는다. 원천은 서버 SGP4 스냅샷(raw SHA-256 → 정본 아이덴티티
//    계보)이고, 스냅샷 사이 구간만 서버가 준 속도벡터로 짧게 선형 보간한다
//    (LINEAR_ADVANCE). 브라우저가 궤도를 다시 풀지 않는다.
//  · 발행 매니페스트가 정한 position_max_age_s 를 넘긴 스냅샷의 **위치는 그리지
//    않는다**. LEO 는 초당 약 7.5km 를 간다 — 낡은 위치를 그리면 그건 그냥 다른
//    곳이다. 대신 카탈로그 현황과 근접사건(TCA 가 미래인 것만)은 그대로 쓴다.
//  · 서버가 페이지 상한으로 자른 만큼, 격리·위치불가로 못 그린 만큼을 화면에 적는다.
//  · 자문 전용(ADVISORY_ONLY). 어떤 명령도 어디로도 보내지 않는다.

const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// 라이브 API — 개발 중에는 로컬 백엔드, 운영에 서버가 서면 같은 출처.
// 상시 서버는 비용 결정상 없을 수 있다. 없으면 아래 발행 스냅샷으로 내려간다.
const LIVE_API = DEV ? 'http://127.0.0.1:8000/api' : '/aetherus/api';

// 발행 스냅샷 — 버전 없는 정본 경로가 먼저, 이미 배포되어 있는 /v2/ 사본이 그 다음.
// (tools/publish-aetherus-snapshot.sh 가 두 곳 모두에 발행한다. /v2/ 는 호환용으로
//  남겨두므로, 정본 경로 발행 전에도 세 지구 모두가 데이터를 읽는다.)
const SNAPSHOT_BASES = ['/aetherus/', '/v2/aetherus/'];

const R_KM = 6371;                    // 지구 평균 반지름 — 어댑터가 정규화에 쓴다
const SNAPSHOT_INTERVAL_MS = 20000;   // 라이브 API 재조회 주기
const MAX_LINEAR_ADVANCE_S = 40;      // 이 나이를 넘긴 표본은 보간을 더 밀지 않는다
const DEFAULT_MAX_AGE_S = 900;        // 매니페스트에 정책이 없을 때의 보수적 기본값

// satellite.js — TEME→ECEF 변환에만 쓴다(전파는 서버가 한다).
// 세 지구 모두 vendor/ 가 이 모듈 기준 ../../vendor/ 에 있다:
//   prototype/js/aetherus/ → prototype/vendor/
//   v2-deploy/js/aetherus/ → v2-deploy/vendor/   (번들러가 같은 깊이로 넣는다)
const SATJS_URL = new URL('../../vendor/satellite-6.0.2.min.js', import.meta.url);

let satJsReady = null;
export const loadSatJs = () => {
  if (globalThis.satellite) return Promise.resolve(globalThis.satellite);
  if (!satJsReady) {
    satJsReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SATJS_URL;
      s.onload = () => (globalThis.satellite
        ? resolve(globalThis.satellite)
        : reject(new Error('satellite.js 전역이 없습니다')));
      s.onerror = () => reject(new Error('satellite.js 를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
  }
  return satJsReady;
};

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const fmt = (n) => (n == null ? '—' : n.toLocaleString());

/** 파편·로켓바디 판별 — 정본 이름 규약(CelesTrak/SATCAT)을 그대로 읽는다. */
export const isDebris = (name) => /\bDEB\b|DEBRIS|R\/B|ROCKET BODY/i.test(name || '');

/* ── 테스트 픽스처 차단 ────────────────────────────────────────────────
   ⚠️ 정본 DB 에는 P4·P5·계보 테스트가 주입한 합성 객체가 쌓인다(실측 2026-09-04:
      TEST DEB A~E · PROV DEB A~L · LEGACY M~O · ESTABLISHED NAME). 이것들은 실제
      제공자 응답과 같은 모양의 provenance(source_ids·artifact SHA)를 갖고 있어
      출처만으로는 구분되지 않는다. 화면에 나가면 없는 물체를 있다고 말하는 것이다.

   구분은 **국제식별부호(COSPAR)와 카탈로그 번호의 실재 규약**으로 한다:
     실물  2018-038A · 1999-066A · 1999-025AHP  (발사연도 ≤ 올해, 조각은 문자)
     합성  2082-490L · 2085-755O · 1999-025001  (미래 연도, 숫자 조각)
   여기서 거른 개수는 반드시 카드에 적는다 — 조용히 버리지 않는다.
   같은 판정을 발행 쪽(tools/publish-aetherus-snapshot.sh)에서도 한다. */
const COSPAR_RE = /^(19|20)(\d{2})-(\d{3})([A-Z]{1,3})$/;
export const isFixture = (row) => {
  const name = (row?.canonical_name || '').toUpperCase();
  if (name.startsWith('TEST') || name.startsWith('PHYS-')) return true;
  const cospar = (row?.cospar_id || '').toUpperCase();
  const m = COSPAR_RE.exec(cospar);
  if (!m) return true;                                   // 규약을 벗어난 부호 = 주입값
  const year = Number(`${m[1]}${m[2]}`);
  if (year > new Date().getUTCFullYear()) return true;    // 아직 오지 않은 발사
  // 고전 카탈로그 번호는 5자리다. 6자리대는 이 저장소에서 합성 주입에만 쓰였다.
  const cat = Number(row?.catalog_id);
  return Number.isFinite(cat) && cat >= 300000;
};

/**
 * 정본 카탈로그 하나. 어댑터는 이걸 감싸서 자기 렌더러로 그린다.
 *
 *   const core = new AetherusCore();
 *   await core.start();                 // 데이터 확보 + 라이브면 주기 갱신
 *   const pts = core.positions();       // [{catalogId, name, ecef:[x,y,z]km, debris}]
 *   core.card(true);                    // 화면에 그대로 붙일 정직성 설명(HTML)
 *   core.stop();
 */
export class AetherusCore {
  constructor(options = {}) {
    this.limit = options.limit || 500;
    this.conjunctionLimit = options.conjunctionLimit || 12;

    this.entries = [];        // 위치 있는 정본 객체
    this.hidden = 0;          // 격리·위치불가 — 그리지 않되 개수는 반드시 공개
    this.fixtures = 0;        // 걸러낸 테스트 주입 객체 — 이것도 공개한다
    this.coverage = null;     // 서버 커버리지 — 절단 사실을 숨기지 않으려고 보존
    this.conjunctions = [];
    this.pastConjunctions = 0;
    this.snapshotAt = null;
    this.sampleMs = null;     // 표본 시각(ms) — 나이 계산의 기준
    this.maxAgeS = DEFAULT_MAX_AGE_S;

    this.fromSnapshot = false;
    this.snapshotBase = null;
    this.publishedAt = null;
    this.liveError = null;    // 라이브 API 실패 사유 (스냅샷으로 내려간 근거)
    this.lastError = null;    // 갱신 실패 — 마지막 정상 데이터를 계속 쓰는 중
    this.loaded = false;
    this.timer = null;
    this._liveGaveUp = false; // 한 번 실패한 라이브 API 를 매번 다시 두드리지 않는다
  }

  // ── 데이터 ───────────────────────────────────────────────────────────
  async _fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return res.json();
  }

  async _fetchLive() {
    const [snap, conj] = await Promise.all([
      this._fetchJson(`${LIVE_API}/v1/catalog/snapshot?limit=${this.limit}`),
      this._fetchJson(`${LIVE_API}/v1/conjunctions?limit=${this.conjunctionLimit}`),
    ]);
    this.fromSnapshot = false;
    this.snapshotBase = LIVE_API;
    this.publishedAt = null;
    return [snap, conj];
  }

  /* 상시 서버가 없을 때 — 발행된 정적 스냅샷을 읽는다.
     실시간인 척하지 않는다. 발행 시각을 그대로 표시하고, 낡으면 위치를 그리지 않는다. */
  async _fetchPublished() {
    let firstError = null;
    for (const base of SNAPSHOT_BASES) {
      try {
        const [man, snap, conj] = await Promise.all([
          fetch(`${base}manifest.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          this._fetchJson(`${base}snapshot.json`),
          this._fetchJson(`${base}conjunctions.json`),
        ]);
        this.fromSnapshot = true;
        this.snapshotBase = base;
        this.publishedAt = man?.generated_at || null;
        const policyAge = num(man?.policy?.position_max_age_s);
        this.maxAgeS = policyAge == null ? DEFAULT_MAX_AGE_S : policyAge;
        return [snap, conj];
      } catch (error) {
        firstError = firstError || error;
      }
    }
    throw new Error(`발행 스냅샷을 읽지 못했습니다 — ${firstError?.message || '경로 없음'}`);
  }

  async refresh() {
    let snap;
    let conj;
    if (this._liveGaveUp) {
      [snap, conj] = await this._fetchPublished();
    } else {
      try {
        [snap, conj] = await this._fetchLive();
      } catch (error) {
        this.liveError = String(error?.message || error);
        this._liveGaveUp = true;
        [snap, conj] = await this._fetchPublished();
      }
    }

    const rows = snap?.data?.catalog || [];
    this.coverage = snap?.data?.coverage || null;
    this.entries = [];
    this.hidden = 0;
    this.fixtures = 0;
    let newest = null;
    for (const row of rows) {
      if (isFixture(row)) { this.fixtures += 1; continue; }
      const st = row.state;
      const sampleMs = Date.parse(row.sample_time);
      if (row.position_status === 'OK' && Array.isArray(st?.r_km) && Number.isFinite(sampleMs)) {
        this.entries.push({
          catalogId: row.catalog_id,
          name: row.canonical_name || row.catalog_id,
          status: row.status,
          objectType: row.object_type || null,
          r: st.r_km,
          v: st.v_km_s || [0, 0, 0],
          altKm: num(row.geodetic?.alt_km),
          sampleMs,
          debris: isDebris(row.canonical_name),
        });
        if (newest == null || sampleMs > newest) newest = sampleMs;
      } else {
        this.hidden += 1; // 위치를 지어내지 않는다 — 개수만 정직하게 센다
      }
    }
    this.sampleMs = newest;
    this.snapshotAt = snap?.data?.at || null;

    /* 근접사건 — 카탈로그에 없는 짝은 그리지 못하므로 거른다.
       ⚠️ TCA 가 이미 지난 사건은 "앞으로 가까워진다"가 아니라 지나간 일이다.
          발행 스냅샷이 낡으면 목록 전체가 과거가 될 수 있어 여기서 나눈다. */
    const byCat = new Map(this.entries.map((e) => [e.catalogId, e]));
    const now = Date.now();
    const all = (conj?.data?.events || [])
      .map((ev) => ({
        a: ev.primary?.catalog_id,
        b: ev.secondary?.catalog_id,
        aName: ev.primary?.canonical_name,
        bName: ev.secondary?.canonical_name,
        tca: ev.tca,
        tcaMs: Date.parse(ev.tca),
        missM: num(ev.latest_snapshot?.miss_distance_m),
        pcStatus: ev.latest_snapshot?.metrics?.PC?.status || 'NOT_COMPUTED',
      }))
      .filter((ev) => byCat.has(ev.a) && byCat.has(ev.b));
    this.pastConjunctions = all.filter((ev) => Number.isFinite(ev.tcaMs) && ev.tcaMs < now).length;
    this.conjunctions = all.filter((ev) => !Number.isFinite(ev.tcaMs) || ev.tcaMs >= now);

    this.loaded = true;
    this.lastError = null;
    return this;
  }

  /** 데이터를 확보하고, 라이브 경로일 때만 주기 갱신을 건다. */
  async start() {
    await loadSatJs();
    await this.refresh();
    if (!this.fromSnapshot && !this.timer) {
      this.timer = setInterval(() => {
        this.refresh().catch((e) => { this.lastError = String(e?.message || e); });
      }, SNAPSHOT_INTERVAL_MS);
    }
    return this;
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // ── 나이·유효성 ──────────────────────────────────────────────────────
  /** 표본이 몇 초 전 것인가. 데이터가 없으면 null. */
  ageSeconds() {
    if (this.sampleMs == null) return null;
    return Math.max(0, (Date.now() - this.sampleMs) / 1000);
  }

  /** 위치를 그려도 되는가 — 매니페스트 정책이 정한 상한 안쪽일 때만 참. */
  positionsUsable() {
    const age = this.ageSeconds();
    return this.entries.length > 0 && age != null && age <= this.maxAgeS;
  }

  /** 위치를 못 그리는 이유 한 줄. 그릴 수 있으면 null. */
  positionBlockReason(ko = true) {
    if (!this.entries.length) return ko ? '표시할 객체가 없습니다.' : 'No objects to show.';
    const age = this.ageSeconds();
    if (age == null) return ko ? '표본 시각이 없습니다.' : 'No sample time.';
    if (age <= this.maxAgeS) return null;
    const h = Math.floor(age / 3600);
    const label = h >= 1 ? `${h}시간` : `${Math.round(age / 60)}분`;
    return ko
      ? `스냅샷이 ${label} 전 것입니다 (허용 ${Math.round(this.maxAgeS / 60)}분). `
        + '위성은 초당 약 7.5km 를 지나가므로 이 위치는 지금 위치가 아닙니다 — 그리지 않습니다.'
      : `Snapshot is ${Math.round(age / 60)} min old (limit ${Math.round(this.maxAgeS / 60)} min). `
        + 'Objects move ~7.5 km/s, so these are not current positions — not drawn.';
  }

  // ── 위치 ─────────────────────────────────────────────────────────────
  /**
   * 지금 시각의 ECEF 좌표. 정책상 그릴 수 없으면 **빈 배열**을 준다 —
   * 어댑터가 실수로 낡은 위치를 그릴 수 없게 여기서 막는다.
   *
   * @returns {Array<{catalogId:string,name:string,debris:boolean,ecef:[number,number,number]}>}
   *          ecef 단위는 km.
   */
  positions(nowMs = Date.now()) {
    const sat = globalThis.satellite;
    if (!sat || !this.positionsUsable()) return [];
    const date = new Date(nowMs);
    const gmst = sat.gstime(date);
    const out = [];
    for (const e of this.entries) {
      // 서버가 준 속도벡터로만, 그것도 짧게 민다. 궤도를 다시 풀지 않는다.
      const dt = Math.min(Math.max((nowMs - e.sampleMs) / 1000, 0), MAX_LINEAR_ADVANCE_S);
      const teme = {
        x: e.r[0] + e.v[0] * dt,
        y: e.r[1] + e.v[1] * dt,
        z: e.r[2] + e.v[2] * dt,
      };
      const ecf = sat.eciToEcf(teme, gmst);
      out.push({
        catalogId: e.catalogId,
        name: e.name,
        debris: e.debris,
        altKm: e.altKm,
        ecef: [ecf.x, ecf.y, ecf.z],
      });
    }
    return out;
  }

  // ── 셈 ───────────────────────────────────────────────────────────────
  debrisCount() { return this.entries.filter((e) => e.debris).length; }
  totalObjects() { return num(this.coverage?.objects_total); }
  /** 서버 페이지 상한에 잘린 개수 (없으면 0) */
  truncated() {
    const total = this.totalObjects();
    return total && total > this.entries.length ? total - this.entries.length : 0;
  }

  // ── 화면 문구 ────────────────────────────────────────────────────────
  /** 메뉴 칩에 붙는 한 줄. */
  state(ko = true) {
    const age = this.ageSeconds();
    const total = this.totalObjects();
    const shown = this.positionsUsable() ? this.entries.length : 0;
    const src = this.fromSnapshot ? (ko ? '발행 스냅샷' : 'published snapshot') : (ko ? '서버' : 'server');
    const ageTxt = age == null ? '—'
      : age < 90 ? `${Math.round(age)}s`
        : age < 5400 ? `${Math.round(age / 60)}분` : `${Math.round(age / 3600)}시간`;
    if (ko) {
      const head = shown
        ? `${fmt(shown)}기 표시${total ? ` / 정본 ${fmt(total)}기` : ''}`
        : `위치 비표시 (${total ? `정본 ${fmt(total)}기` : '카탈로그'} 확인)`;
      return `${head} · 근접 ${this.conjunctions.length}건 · ${src} ${ageTxt} 전`
        + (this.lastError ? ' · 갱신 실패' : '');
    }
    const head = shown ? `${fmt(shown)} shown${total ? ` / ${fmt(total)} catalogued` : ''}`
      : 'positions withheld';
    return `${head} · ${this.conjunctions.length} conjunctions · ${src} ${ageTxt} ago`;
  }

  /** 레이어를 켰을 때 띄우는 설명 카드(HTML). 세 지구가 같은 글을 쓴다. */
  card(ko = true) {
    const age = this.ageSeconds();
    const ageTxt = age == null ? '—' : age < 90 ? `${Math.round(age)}초 전`
      : age < 5400 ? `${Math.round(age / 60)}분 전` : `${Math.round(age / 3600)}시간 전`;
    const lines = [];

    lines.push(ko
      ? 'AETHERUS 정본 카탈로그 — 위치는 브라우저 계산이 아니라 <b>서버 SGP4 스냅샷</b>'
        + '(raw SHA-256 → 정본 아이덴티티 계보)에서 옵니다.'
      : 'AETHERUS canonical catalogue — positions come from server-side SGP4 snapshots '
        + '(raw SHA-256 → canonical identity lineage), not from browser propagation.');

    const block = this.positionBlockReason(ko);
    if (block) {
      lines.push(`<b>${ko ? '위치 비표시' : 'Positions withheld'}</b> — ${block}`);
    } else {
      lines.push(ko
        ? `${fmt(this.entries.length)}기 표시 · 산출 ${ageTxt} · 사이 구간은 서버 속도벡터로`
          + ` 최대 ${MAX_LINEAR_ADVANCE_S}초만 선형 보간(LINEAR_ADVANCE)합니다.`
        : `${fmt(this.entries.length)} objects · sampled ${ageTxt} · gaps linearly advanced `
          + `at most ${MAX_LINEAR_ADVANCE_S}s from the server velocity vector.`);
    }

    const cut = this.truncated();
    if (cut) {
      lines.push(ko
        ? `정본 카탈로그 ${fmt(this.totalObjects())}기 중 ${fmt(this.entries.length)}기만 받았습니다 —`
          + ' 서버 페이지 상한입니다. 자른 만큼 여기에 적습니다.'
          + (this.coverage?.objects_with_solution ? ` (전파 가능 ${fmt(this.coverage.objects_with_solution)}기)` : '')
        : `${fmt(this.entries.length)} of ${fmt(this.totalObjects())} catalogued objects fetched — server page cap.`);
    }

    const deb = this.debrisCount();
    if (deb) {
      lines.push(ko
        ? `받은 목록 중 파편·로켓바디 ${fmt(deb)}기 — 실제 파편운(펑윈-1C · 코스모스-2251 ·`
          + ' 이리듐-33 · 코스모스-1408)에서 수집한 공식 궤도요소입니다.'
        : `${fmt(deb)} debris / rocket bodies — official elements from real breakup clouds.`);
    }

    if (this.hidden) {
      lines.push(ko
        ? `격리·위치불가 ${fmt(this.hidden)}기는 그리지 않습니다 (지어내지 않음).`
        : `${fmt(this.hidden)} quarantined or unpositionable objects are not drawn.`);
    }

    if (this.fixtures) {
      lines.push(ko
        ? `테스트 픽스처 ${fmt(this.fixtures)}기를 뺐습니다 — 국제식별부호가 실재 규약을`
          + ' 벗어난 주입 객체입니다. 없는 물체를 있다고 하지 않습니다.'
        : `${fmt(this.fixtures)} synthetic test objects excluded (invalid COSPAR designators).`);
    }

    const conj = this.conjunctions.length
      ? this.conjunctions.slice(0, 8).map((ev) => {
        const km = ev.missM == null ? '—' : (ev.missM / 1000).toFixed(1);
        const t = Number.isFinite(ev.tcaMs)
          ? new Date(ev.tcaMs).toLocaleString('ko-KR', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';
        return `· ${ev.a}×${ev.b} — ${ko ? '최근접' : 'miss'} ${km}km @ ${t}, Pc `
          + (ev.pcStatus === 'COMPUTED' ? (ko ? '산출' : 'computed') : (ko ? '미산출(공분산 없음)' : 'not computed'));
      }).join('<br/>')
      : (ko ? '· 앞으로 예정된 근접사건이 목록에 없습니다 — 값을 만들지 않습니다'
        : '· No upcoming conjunctions in this snapshot — nothing is fabricated');
    lines.push((ko ? '근접사건 (P4 보수 스크리닝 → 정밀 TCA):<br/>' : 'Conjunctions:<br/>') + conj
      + (this.pastConjunctions
        ? `<br/>${ko ? `(TCA 가 이미 지난 ${this.pastConjunctions}건은 뺐습니다)` : `(${this.pastConjunctions} past events excluded)`}`
        : ''));

    if (this.fromSnapshot) {
      lines.push(ko
        ? `<b>정지 스냅샷 모드</b> — 상시 API 서버 대신 발행된 스냅샷(<code>${this.snapshotBase}</code>)을 읽고 있습니다`
          + `${this.publishedAt ? ` (발행 ${new Date(this.publishedAt).toLocaleString('ko-KR', { hour12: false })})` : ''}.`
          + ' 근접사건의 TCA 는 미래 시각이라 스냅샷으로도 유효합니다.'
        : `<b>Static snapshot mode</b> — reading published files from <code>${this.snapshotBase}</code>.`);
    }
    if (this.lastError) {
      lines.push(ko ? `최근 갱신 실패: ${this.lastError} — 마지막 정상 스냅샷을 표시 중.`
        : `Last refresh failed: ${this.lastError}`);
    }
    lines.push(ko ? '<b>자문 전용</b> — 어떤 명령도 전송하지 않습니다.' : '<b>Advisory only</b> — no commands are sent.');
    return lines.join('<br/>');
  }
}

export { R_KM, MAX_LINEAR_ADVANCE_S, SNAPSHOT_INTERVAL_MS };

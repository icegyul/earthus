// AETHERUS LINK — 정본 궤도 인텔리전스 레이어 ('하나의 우주' 연결)
// sat-layer가 CelesTrak 요소를 기기에서 전파한다면, 이 레이어의 위치·근접사건은
// AETHERUS 과학 API(서버 SGP4 + P4 스크리닝 파이프라인, raw SHA→정본 아이덴티티 계보)에서 온다.
// 규칙: 위치를 지어내지 않는다 — 스냅샷 사이는 서버가 준 속도로 짧게 선형 보간
// (LINEAR_ADVANCE)만 하고, 보간 사실·데이터 나이·비표시 격리 기수를 카드에 적는다.

import * as THREE from '../../vendor/three-r184.module.min.js';

const SATJS_URL = new URL('../../vendor/satellite-6.0.2.min.js', import.meta.url);
const API_BASE = location.hostname.endsWith('earthus.net')
  ? '/aetherus/api'
  : 'http://127.0.0.1:8000/api';
const R_KM = 6371;
const SNAPSHOT_INTERVAL_MS = 20000; // 서버 재조회 주기 — 사이 구간은 선형 보간
const POS_INTERVAL_MS = 250;
const MAX_LINEAR_ADVANCE_S = 40;    // 이 나이를 넘긴 스냅샷은 STALE로 표기

let satJsReady = null;
const loadSatJs = () => {
  if (window.satellite) return Promise.resolve();
  if (!satJsReady) {
    satJsReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SATJS_URL;
      s.onload = res;
      s.onerror = () => rej(new Error('satellite.js load failed'));
      document.head.appendChild(s);
    });
  }
  return satJsReady;
};

let ringTex = null;
const getRingTex = () => {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(24, 24, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.arc(24, 24, 5, 0, Math.PI * 2); ctx.fill();
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
};

export class AetherusLink {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.on = false;
    this.loading = false;
    this.entries = [];        // 위치 있는 정본 객체 [{catalog_id,name,r,v,sampleMs}]
    this.hidden = 0;          // 격리/위치불가 — 그리지 않되 반드시 공개
    this.coverage = null;     // 서버 커버리지 — 절단 사실을 숨기지 않기 위해 보존
    this.conjunctions = [];   // [{a,b,tca,missM,pcStatus}]
    this.snapshotAt = null;
    this.points = null;
    this.posAttr = null;
    this.linkLines = null;
    this.linkAttr = null;
    this.timer = null;
    this.lastPos = 0;
    this.lastError = null;
  }

  async _fetchJson(path) {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`AETHERUS API HTTP ${res.status} (${path})`);
    return res.json();
  }

  async refresh() {
    const [snap, conj] = await Promise.all([
      this._fetchJson('/v1/catalog/snapshot'),
      this._fetchJson('/v1/conjunctions?limit=12'),
    ]);
    const rows = (snap.data && snap.data.catalog) || [];
    this.coverage = (snap.data && snap.data.coverage) || null;
    this.entries = [];
    this.hidden = 0;
    for (const row of rows) {
      const st = row.state;
      if (row.position_status === 'OK' && st && Array.isArray(st.r_km)) {
        this.entries.push({
          catalogId: row.catalog_id,
          name: row.canonical_name || row.catalog_id,
          status: row.status,
          r: st.r_km, v: st.v_km_s || [0, 0, 0],
          sampleMs: Date.parse(row.sample_time),
        });
      } else {
        this.hidden += 1; // 위치를 지어내지 않는다 — 개수만 정직하게 센다
      }
    }
    this.snapshotAt = (snap.data && snap.data.at) || null;
    const byCat = new Map(this.entries.map((e) => [e.catalogId, e]));
    this.conjunctions = ((conj.data && conj.data.events) || [])
      .map((ev) => ({
        a: ev.primary.catalog_id, b: ev.secondary.catalog_id,
        aName: ev.primary.canonical_name, bName: ev.secondary.canonical_name,
        tca: ev.tca, missM: ev.latest_snapshot?.miss_distance_m,
        pcStatus: ev.latest_snapshot?.metrics?.PC?.status || 'NOT_COMPUTED',
      }))
      .filter((ev) => byCat.has(ev.a) && byCat.has(ev.b));
    this._rebuildGeometry();
    this.lastPos = 0;
    this.lastError = null;
  }

  _disposeGeometry() {
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
    if (this.linkLines) {
      this.group.remove(this.linkLines);
      this.linkLines.geometry.dispose();
      this.linkLines.material.dispose();
      this.linkLines = null;
    }
  }

  _rebuildGeometry() {
    this._disposeGeometry();
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(this.entries.length * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 13, sizeAttenuation: false, color: new THREE.Color('#7EDCFF'),
      map: getRingTex(), alphaTest: 0.05, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.group.add(this.points);

    const lineGeo = new THREE.BufferGeometry();
    this.linkAttr = new THREE.BufferAttribute(new Float32Array(this.conjunctions.length * 6), 3);
    this.linkAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeo.setAttribute('position', this.linkAttr);
    this.linkLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: new THREE.Color('#F5B14C'), transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.linkLines.frustumCulled = false;
    this.group.add(this.linkLines);
  }

  async toggle() {
    if (this.loading) return { on: this.on };
    this.loading = true;
    try {
      this.on = !this.on;
      if (this.on) {
        await loadSatJs();
        await this.refresh();
        this.timer = setInterval(() => {
          this.refresh().catch((e) => { this.lastError = String(e.message || e); });
        }, SNAPSHOT_INTERVAL_MS);
      } else if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.group.visible = this.on;
      return { on: this.on };
    } catch (e) {
      this.on = false;
      this.group.visible = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      console.warn('[aetherus-link]', e);
      return { on: false, error: String(e && e.message || e) };
    } finally { this.loading = false; }
  }

  _ageSeconds() {
    if (!this.entries.length) return null;
    const now = Date.now();
    return Math.max(...this.entries.map((e) => (now - e.sampleMs) / 1000));
  }

  state() {
    if (!this.on) return { on: false };
    const age = this._ageSeconds();
    const stale = age != null && age > MAX_LINEAR_ADVANCE_S;
    const total = this.coverage && this.coverage.objects_total;
    const capped = total && total > this.entries.length ? ` / ${total.toLocaleString()}기` : '';
    return {
      on: true,
      note: `${this.entries.length}기${capped} · 근접 ${this.conjunctions.length}건 · 서버 산출 ${age == null ? '—' : `${Math.round(age)}s 전`}${stale ? ' · STALE' : ''}${this.lastError ? ' · 갱신 실패' : ''}`,
    };
  }

  card() {
    const age = this._ageSeconds();
    const conj = this.conjunctions.length
      ? this.conjunctions.map((ev) => {
          const km = ev.missM == null ? '—' : (ev.missM / 1000).toFixed(1);
          const t = new Date(ev.tca).toLocaleTimeString('ko-KR', { hour12: false });
          return `· ${ev.a}×${ev.b} — 최근접 ${km}km @ ${t}, Pc ${ev.pcStatus === 'COMPUTED' ? '산출' : '미산출(공분산 없음)'}`;
        }).join('<br/>')
      : '· 현재 지평 내 근접사건 없음 — 값을 만들지 않습니다';
    const hidden = this.hidden
      ? `<br/>격리/위치불가 ${this.hidden}기는 그리지 않습니다 (지어내지 않음).`
      : '';
    // 서버가 페이지 상한으로 자른 만큼은 반드시 화면에 적는다 (1.0 원칙: 조용히 버리지 않음).
    const cov = this.coverage || {};
    const total = cov.objects_total;
    const cut = total && total > this.entries.length
      ? `<br/>정본 카탈로그 ${total.toLocaleString()}기 중 ${this.entries.length}기만 표시 — 서버 페이지 상한입니다. 자른 만큼 여기에 적습니다.`
        + (cov.objects_with_solution ? ` (전파 가능 ${cov.objects_with_solution.toLocaleString()}기)` : '')
      : '';
    const debris = this.entries.filter((e) => /DEB|R\/B/i.test(e.name)).length;
    const debrisLine = debris
      ? `<br/>표시분 중 파편·로켓바디 ${debris}기 — 실제 파편운(펑윈-1C·코스모스-2251·이리듐-33·코스모스-1408)에서 수집된 공식 궤도요소입니다.`
      : '';
    const err = this.lastError ? `<br/>최근 갱신 실패: ${this.lastError} — 마지막 정상 스냅샷을 표시 중.` : '';
    return `AETHERUS 정본 카탈로그 — 위치는 브라우저 계산이 아니라 서버 SGP4 스냅샷`
      + `(raw SHA-256 → 정본 아이덴티티 계보)에서 옵니다.<br/>`
      + `${this.entries.length}기 표시 · 서버 산출 ${age == null ? '—' : `${Math.round(age)}s 전`}`
      + ` · ${Math.round(SNAPSHOT_INTERVAL_MS / 1000)}s 재조회, 사이 구간은 서버 속도벡터로 선형 보간(LINEAR_ADVANCE)${cut}${debrisLine}${hidden}<br/>`
      + `근접사건 (P4 보수 스크리닝 → 정밀 TCA):<br/>${conj}${err}<br/>`
      + `자문 전용 — 어떤 명령도 전송하지 않습니다.`;
  }

  update(nowMs) {
    if (!this.group.visible || !this.entries.length || !window.satellite) return;
    if (nowMs - this.lastPos < POS_INTERVAL_MS) return;
    this.lastPos = nowMs;
    const sat = window.satellite;
    const date = new Date();
    const gmst = sat.gstime(date);
    const nowEpoch = date.getTime();
    const pos = [];
    for (let i = 0; i < this.entries.length; i += 1) {
      const e = this.entries[i];
      const dt = Math.min((nowEpoch - e.sampleMs) / 1000, MAX_LINEAR_ADVANCE_S);
      const teme = {
        x: e.r[0] + e.v[0] * dt,
        y: e.r[1] + e.v[1] * dt,
        z: e.r[2] + e.v[2] * dt,
      };
      const ecf = sat.eciToEcf(teme, gmst);
      // sat-layer와 동일한 렌더 좌표 규약: ECEF(X,Y,Z) → (x=Y, y=Z, z=X)/R
      const arr = this.posAttr.array;
      arr[i * 3] = ecf.y / R_KM;
      arr[i * 3 + 1] = ecf.z / R_KM;
      arr[i * 3 + 2] = ecf.x / R_KM;
      pos.push([arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2], e.catalogId]);
    }
    this.posAttr.needsUpdate = true;
    if (this.linkAttr && this.conjunctions.length) {
      const byCat = new Map(pos.map((p) => [p[3], p]));
      const larr = this.linkAttr.array;
      for (let k = 0; k < this.conjunctions.length; k += 1) {
        const a = byCat.get(this.conjunctions[k].a);
        const b = byCat.get(this.conjunctions[k].b);
        if (!a || !b) continue;
        larr[k * 6] = a[0]; larr[k * 6 + 1] = a[1]; larr[k * 6 + 2] = a[2];
        larr[k * 6 + 3] = b[0]; larr[k * 6 + 4] = b[1]; larr[k * 6 + 5] = b[2];
      }
      this.linkAttr.needsUpdate = true;
    }
  }
}

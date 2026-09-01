// EARTHUS — Earth Intelligence Feed (v5.3 §28) + Event Room 라이트 (§29)
// 뉴스피드가 아니라 "오늘 지구에서 이해할 가치가 있는 사건"을 Earth Event로.
// 실데이터: GDACS 열대저기압(공식·전 해역) + USGS 지진(관측). 사건은 3D 지구 위 비컨으로.

import * as THREE from '../../vendor/three-r184.module.min.js';

const GDACS_TC = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=TC';
const USGS_EQ = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const GDACS_GEOM = (id, ep) => `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${id}&episodeid=${ep}`;

const ALERT_RANK = { Red: 0, Orange: 1, Green: 2 };

const agoText = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
};

export class IntelFeed {
  constructor(scene, badge) {
    this.scene = scene;
    this.badge = badge; // dataBadge 함수
    this.items = [];
    this.state = 'loading'; // loading | ready | error
    this.view = 'list'; // list | room
    this.selected = null;
    this.trackLine = null;
    this.markerWrap = document.createElement('div');
    this.markerWrap.id = 'feedmarks';
    document.body.appendChild(this.markerWrap);
    this.pool = [];
    for (let i = 0; i < 24; i += 1) {
      const d = document.createElement('div');
      d.className = 'feed-mark';
      d.style.display = 'none';
      this.markerWrap.appendChild(d);
      this.pool.push(d);
    }
    this._proj = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._frame = 0;
  }

  async load() {
    this.state = 'loading';
    const timed = (url, ms) => Promise.race([
      fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
      new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), ms); }),
    ]);
    const [tcR, eqR] = await Promise.allSettled([
      timed(GDACS_TC, 12000),
      timed(USGS_EQ, 12000),
    ]);
    this.tcFailed = tcR.status !== 'fulfilled';
    const items = [];
    if (tcR.status === 'fulfilled' && tcR.value.features) {
      for (const f of tcR.value.features) {
        const p = f.properties || {};
        const g = f.geometry || {};
        const c = g.type === 'Point' ? g.coordinates : null;
        if (!c) continue;
        items.push({
          id: `tc-${p.eventid}`,
          kind: 'TC',
          eventid: p.eventid,
          episodeid: p.episodeid,
          alert: p.alertlevel || 'Green',
          title: `열대저기압 ${p.eventname || p.name || ''}`.trim(),
          where: p.country || '해상',
          whenT: Date.parse(p.todate || p.fromdate) || Date.now(),
          status: 'ACTIVE',
          truth: 'OFFICIAL_FORECAST',
          source: 'GDACS (JRC/UN)',
          lat: c[1],
          lon: c[0],
          facts: [
            ['경보 등급', p.alertlevel || '—'],
            ['시작', (p.fromdate || '').slice(0, 10)],
            ['최근 갱신', (p.todate || '').slice(0, 10)],
          ],
          why: '태풍 진로·강도 분석',
        });
      }
    }
    if (eqR.status === 'fulfilled' && eqR.value.features) {
      for (const f of eqR.value.features.slice(0, 14)) {
        const p = f.properties || {};
        const c = (f.geometry || {}).coordinates || null;
        if (!c) continue;
        items.push({
          id: `eq-${f.id}`,
          kind: 'EQ',
          alert: p.mag >= 6.5 ? 'Red' : p.mag >= 5.5 ? 'Orange' : 'Green',
          title: `M${p.mag != null ? p.mag.toFixed(1) : '?'} 지진`,
          where: p.place || '',
          whenT: p.time || Date.now(),
          status: 'ACTIVE',
          truth: 'OBSERVED',
          source: 'USGS',
          lat: c[1],
          lon: c[0],
          depthKm: c[2],
          facts: [
            ['규모', `M${p.mag != null ? p.mag.toFixed(1) : '?'}`],
            ['진원 깊이', c[2] != null ? `${Math.round(c[2])} km (지하)` : '—'],
            ['발생', agoText(p.time)],
          ],
          why: '지진 발생 맥락 분석',
        });
      }
    }
    items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'TC' ? -1 : 1;
      if (a.kind === 'TC') return (ALERT_RANK[a.alert] ?? 3) - (ALERT_RANK[b.alert] ?? 3);
      return b.whenT - a.whenT;
    });
    this.items = items;
    this.state = items.length ? 'ready' : 'error';
  }

  html() {
    if (this.view === 'room' && this.selected) return this.roomHtml(this.selected);
    if (this.state === 'loading') {
      return '<div class="card"><div class="card-b">지구 사건 조회 중… (GDACS · USGS)</div></div>';
    }
    if (this.state === 'error') {
      return `<div class="card"><div class="card-h">피드 ${this.badge('INSUFFICIENT_DATA')}</div>
        <div class="card-b">사건 데이터를 불러오지 못했습니다. 네트워크 확인 후 다시 시도하세요.</div></div>`;
    }
    const rows = this.items.map((it, i) => `
      <div class="feed-item" data-action="feed-open" data-idx="${i}">
        <span class="feed-dot ${it.kind === 'TC' ? 'tc' : 'eq'} a-${it.alert.toLowerCase()}"></span>
        <div class="feed-main">
          <div class="feed-title">${it.title}</div>
          <div class="feed-sub">${it.where} · ${agoText(it.whenT)}</div>
        </div>
        ${this.badge(it.truth)}
      </div>`).join('');
    const tcNote = this.tcFailed
      ? `<div class="feed-note">태풍 피드(GDACS) 응답 없음 — ${this.badge('INSUFFICIENT_DATA')} <button class="feed-back" data-action="feed-retry" style="margin:0">재시도</button></div>`
      : '';
    return `<div class="feed-head">오늘의 지구 사건 <span class="feed-cnt">${this.items.length}</span></div>${tcNote}${rows}
      <div class="feed-note">출처: GDACS(공식 경보) · USGS(관측) — 사건 클릭 시 3D 지구에서 확인</div>`;
  }

  roomHtml(it) {
    const facts = it.facts.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    return `
      <button class="feed-back" data-action="feed-back">← 피드로</button>
      <div class="card"><div class="card-h">${it.title} ${this.badge(it.truth)}</div>
        <div class="card-b">
          <div class="stat"><span class="k">위치</span><span class="v">${it.where}</span></div>
          ${facts}
          <div class="stat"><span class="k">상태</span><span class="v">${it.status}</span></div>
        </div></div>
      <div class="card"><div class="card-h">EVIDENCE</div>
        <div class="card-b">1차 출처: ${it.source}<br/>갱신: ${agoText(it.whenT)} · 지구 위 위치는 출처 좌표 그대로${it.kind === 'TC' ? '<br/>트랙 라인: GDACS 공식 경로' : ''}${it.depthKm != null ? `<br/>진원은 지하 ${Math.round(it.depthKm)}km — 지하 단면 표현은 준비 중` : ''}</div></div>
      <div class="card"><div class="card-h">WHY · NEXT ${this.badge('LOCKED')}</div>
        <div class="card-b">${it.why} — 근거 그래프·전망은 <b>EXPLORER PRO</b>에서 제공 예정.<br/>
        <span class="paysub">공식 경보·안전정보는 항상 무료 (FREE: SEE THE EARTH)</span></div></div>`;
  }

  async select(idx, orbit) {
    const it = this.items[idx];
    if (!it) return;
    this.selected = it;
    this.view = 'room';
    // 카메라 포커스 (EVENT_FOCUS · 1.1초 글라이드)
    const M = Math.PI / 180;
    let ty = it.lon * M;
    ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
    orbit.targetYaw = ty;
    orbit.targetPitch = Math.max(-1.45, Math.min(1.45, it.lat * M));
    orbit.targetDist = it.kind === 'TC' ? 1.55 : 1.3;
    orbit.glide = 1.1;
    // 태풍: 공식 트랙 라인
    this.clearTrack();
    if (it.kind === 'TC' && it.eventid) {
      try {
        const g = await fetch(GDACS_GEOM(it.eventid, it.episodeid)).then((r) => r.json());
        const lines = (g.features || []).filter((f) => f.geometry && f.geometry.type === 'LineString');
        if (lines.length) {
          const pts = [];
          for (const [lo, la] of lines[0].geometry.coordinates) {
            const p = la * M;
            const l = lo * M;
            pts.push(new THREE.Vector3(
              Math.cos(p) * Math.sin(l) * 1.006,
              Math.sin(p) * 1.006,
              Math.cos(p) * Math.cos(l) * 1.006,
            ));
          }
          this.trackLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0xffb36a, transparent: true, opacity: 0.9 }),
          );
          this.scene.add(this.trackLine);
        }
      } catch (err) {
        console.warn('[earthus-feed] track fetch failed:', err);
      }
    }
  }

  back() {
    this.view = 'list';
    this.selected = null;
    this.clearTrack();
  }

  clearTrack() {
    if (this.trackLine) {
      this.scene.remove(this.trackLine);
      this.trackLine.geometry.dispose();
      this.trackLine.material.dispose();
      this.trackLine = null;
    }
  }

  updateMarkers(camera, altKm, onPick) {
    this._frame += 1;
    if (this._frame % 3 !== 0) return;
    if (this.state !== 'ready' || altKm < 400) {
      this.pool.forEach((d) => { d.style.display = 'none'; });
      return;
    }
    this._camDir.copy(camera.position).normalize();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const M = Math.PI / 180;
    let used = 0;
    for (let i = 0; i < this.items.length && used < this.pool.length; i += 1) {
      const it = this.items[i];
      const p = it.lat * M;
      const l = it.lon * M;
      this._proj.set(Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l));
      if (this._proj.dot(this._camDir) < 0.3) continue;
      this._proj.project(camera);
      if (this._proj.z > 1 || Math.abs(this._proj.x) > 0.95 || Math.abs(this._proj.y) > 0.92) continue;
      const d = this.pool[used];
      used += 1;
      d.style.display = 'block';
      d.style.left = `${(this._proj.x * 0.5 + 0.5) * W}px`;
      d.style.top = `${(-this._proj.y * 0.5 + 0.5) * H}px`;
      d.className = `feed-mark ${it.kind === 'TC' ? 'tc' : 'eq'} a-${it.alert.toLowerCase()}${this.selected === it ? ' sel' : ''}`;
      d.title = it.title;
      if (d._idx !== i) {
        d._idx = i;
        d.onclick = () => onPick(i);
      }
    }
    for (let i = used; i < this.pool.length; i += 1) this.pool[i].style.display = 'none';
  }
}

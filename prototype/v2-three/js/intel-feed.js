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
    this.past = null; // 선택 사건의 과거 맥락 { state, ... }
    this.onUpdate = null; // 비동기 로드 후 패널 리렌더 콜백 (main.js가 연결)
  }

  // PAST: 사건 주변의 실제 이력 — 값 생성 없이 공식 아카이브 조회만
  async loadPast(it) {
    this.past = { state: 'loading' };
    if (this.onUpdate) this.onUpdate();
    try {
      if (it.kind === 'EQ') {
        // USGS 아카이브: 반경 300km · 최근 30일 · M2.5+
        const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson'
          + `&latitude=${it.lat.toFixed(3)}&longitude=${it.lon.toFixed(3)}&maxradiuskm=300`
          + `&starttime=${start}&minmagnitude=2.5&orderby=magnitude&limit=200`;
        const j = await Promise.race([
          fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), 12000); }),
        ]);
        const fs = j.features || [];
        const mags = fs.map((f) => f.properties.mag).filter((m) => m != null);
        const bigger = mags.filter((m) => m >= (it.facts[0] ? parseFloat(String(it.facts[0][1]).slice(1)) : 99)).length;
        const top = fs.slice(0, 5).map((f) => ({
          mag: f.properties.mag, place: f.properties.place, t: f.properties.time,
        }));
        this.past = {
          state: 'ready', kind: 'EQ', n: fs.length, maxMag: mags.length ? Math.max(...mags) : null, bigger, top,
          src: 'USGS 아카이브 · 반경 300km · 30일 · M2.5+',
        };
      } else if (it.kind === 'TC') {
        // KMA·JMA·NHC 공식 발표 타임라인 (1.0 S3 캐시)
        const j = await Promise.race([
          fetch('https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/typhoon-official.json', { cache: 'no-store' })
            .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), 12000); }),
        ]);
        const name = (it.title || '').replace('열대저기압', '').trim().toUpperCase();
        const storm = (j.storms || []).find((s) => name && (s.key === name || (s.name || '').toUpperCase() === name));
        const ag = storm && (storm.agencies || []).find((a) => a.steps && a.steps.length);
        this.past = ag
          ? {
            state: 'ready', kind: 'TC', agency: ag.agencyKo || ag.agency,
            steps: ag.steps.map((s) => ({ h: s.h, windMs: s.windMs, hpa: s.hpa, place: s.place })),
            src: `${ag.agencyKo || ag.agency} 공식 발표 (${j.generated ? j.generated.slice(0, 16) : ''})`,
          }
          : { state: 'none', note: '공식 태풍 발표에서 이 사건을 찾지 못했습니다 — 표시하지 않습니다.' };
      } else {
        this.past = { state: 'none', note: '이 사건 유형의 이력 소스가 아직 없습니다.' };
      }
    } catch (e) {
      this.past = { state: 'error', note: `이력 조회 실패 (${String((e && e.message) || e)}) — 판단하지 않습니다.` };
    }
    if (this.onUpdate) this.onUpdate();
  }

  pastHtml() {
    const p = this.past;
    if (!p) return '';
    if (p.state === 'loading') return '<div class="card"><div class="card-h">PAST</div><div class="card-b">이력 조회 중…</div></div>';
    if (p.state === 'none' || p.state === 'error') {
      return `<div class="card"><div class="card-h">PAST ${this.badge('INSUFFICIENT_DATA')}</div><div class="card-b">${p.note}</div></div>`;
    }
    if (p.kind === 'EQ') {
      const rows = p.top.map((t) => `<div class="stat"><span class="k">M${t.mag != null ? t.mag.toFixed(1) : '?'}</span><span class="v">${(t.place || '').slice(0, 34)} · ${agoText(t.t)}</span></div>`).join('');
      return `<div class="card"><div class="card-h">PAST — 주변 30일 ${this.badge('OBSERVED')}</div>
        <div class="card-b">반경 300km에서 30일간 M2.5+ <b>${p.n}회</b>${p.maxMag != null ? ` · 최대 M${p.maxMag.toFixed(1)}` : ''}${p.bigger > 1 ? ` · 이번 규모 이상 ${p.bigger}회` : p.bigger === 1 ? ' · 이번이 30일 내 최대' : ''}
        ${rows}<span class="paysub">${p.src}</span></div></div>`;
    }
    const rows = p.steps.slice(0, 8).map((s) => `<div class="stat"><span class="k">${s.h === 0 ? '현재' : `+${s.h}h`}</span><span class="v">${s.windMs != null ? `${s.windMs}m/s` : '—'} · ${s.hpa != null ? `${s.hpa}hPa` : '—'}</span></div>`).join('');
    return `<div class="card"><div class="card-h">공식 발표 타임라인 ${this.badge('OFFICIAL_FORECAST')}</div>
      <div class="card-b">${rows}<span class="paysub">${p.src} — 발표값 그대로</span></div></div>`;
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
    const shown = this.visibleItems();
    if (!shown.length) {
      const what = this.kind === 'EQ' ? '지진' : this.kind === 'TC' ? '태풍' : '사건';
      return `<div class="feed-head">${what} <span class="feed-cnt">0</span></div>
        <div class="feed-note">지금 조건에 맞는 ${what} 사건이 없습니다 — 없는 것을 만들어 채우지 않습니다.</div>`;
    }
    const rows = shown.map((it) => `
      <div class="feed-item" data-action="feed-open" data-idx="${this.items.indexOf(it)}">
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
    const headKo = this.kind === 'EQ' ? '지진 (USGS 관측)'
      : this.kind === 'TC' ? '태풍 (GDACS 공식)' : '오늘의 지구 사건';
    const srcKo = this.kind === 'EQ' ? '출처: USGS(관측)'
      : this.kind === 'TC' ? '출처: GDACS(공식 경보)' : '출처: GDACS(공식 경보) · USGS(관측)';
    return `<div class="feed-head">${headKo} <span class="feed-cnt">${shown.length}</span></div>${this.kind === 'EQ' ? '' : tcNote}${rows}
      <div class="feed-note">${srcKo} — 사건 클릭 시 3D 지구에서 확인</div>`;
  }

  roomHtml(it) {
    const facts = it.facts.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    return `
      <button class="feed-back" data-action="feed-back">← 피드로</button>
      <div class="card"><div class="card-h">${it.title} ${this.badge(it.truth)}
          <span class="badge demo" title="sceneProjection">EVENT_FOCUS · REGION</span></div>
        <div class="card-b">
          <div class="stat"><span class="k">위치</span><span class="v">${it.where}</span></div>
          ${facts}
          <div class="stat"><span class="k">상태</span><span class="v">${it.status}</span></div>
        </div></div>
      <div class="card"><div class="card-h">EVIDENCE</div>
        <div class="card-b">1차 출처: ${it.source}<br/>갱신: ${agoText(it.whenT)} · 지구 위 위치는 출처 좌표 그대로${it.kind === 'TC' ? '<br/>트랙 라인: GDACS 공식 경로' : ''}${it.depthKm != null ? `<br/>진원은 지하 <b>${Math.round(it.depthKm)}km</b> — 재해 메뉴의 <b>지진 깊이</b>를 켜면 진원을 실제 깊이 자리에서 봅니다` : ''}</div></div>
      ${this.pastHtml()}
      <div class="card"><div class="card-h">WHY ${this.badge('INSUFFICIENT_DATA')}</div>
        <div class="card-b"><b>인과 주장 게이트</b>: 검증된 근거 체인 없이 "원인"을 말하지 않습니다.<br/>
        이 사건에 연결된 근거는 1차 관측(${it.source})과 위의 실측 이력뿐 — 인과 분석 근거 부족.<br/>
        <span class="paysub">${it.why} — 근거 그래프·전망(NEXT)은 EXPLORER PRO에서 제공 예정 · 공식 경보·안전정보는 항상 무료</span></div></div>`;
  }

  async select(idx, orbit) {
    const it = this.items[idx];
    if (!it) return;
    this.selected = it;
    this.view = 'room';
    this.loadPast(it); // PAST 카드 비동기 채움 (완료 시 onUpdate로 리렌더)
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
    this.past = null;
    this.clearTrack();
  }

  // 재해 메뉴의 '지구 사건 피드 / 지진 / 태풍' 세 줄이 눌러도 같은 화면이던 것을 갈라 준다
  setKind(kind) {
    this.kind = kind || null;   // null = 전체
    this.view = 'list';
    this.selected = null;
    this.past = null;
    this.clearTrack();
  }

  visibleItems() {
    return this.kind ? this.items.filter((it) => it.kind === this.kind) : this.items;
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

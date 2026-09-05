// EARTHUS — Earth Intelligence Feed (v5.3 §28) + Event Room 라이트 (§29)
// 뉴스피드가 아니라 "오늘 지구에서 이해할 가치가 있는 사건"을 Earth Event로.
// 실데이터: GDACS 열대저기압(공식·전 해역) + USGS 지진(관측). 사건은 3D 지구 위 비컨으로.

import * as THREE from '../../vendor/three-r184.module.min.js';
// 사건 방: 기관 스택 + 진리등급 + 현재→다음→행동 (정본 HAZ-011로 사건 결합)
import { EventRoom } from './event-room.js?v=3';
import { i18n } from './i18n.js?v=10';

const GDACS_TC = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=TC';
const USGS_EQ = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const GDACS_GEOM = (id, ep) => `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${id}&episodeid=${ep}`;

const ALERT_RANK = { Red: 0, Orange: 1, Green: 2 };

// 시각 4분법(지시서 A-1): 발생·발표·갱신·수집. 없는 시각은 null — Date.now() 로 채우지 않는다.
// 시각이 없는 사건이 "방금"으로 보이던 것이 최종 보고서 F01 이다.
// GDACS·USGS 는 시간대 표기 없는 UTC('2026-09-01T00:00:00')를 준다 — 그대로 parse 하면 브라우저 지역시각으로 읽혀 9시간이 어긋난다.
const asUtc = (v) => (typeof v === 'string' && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? `${v}Z` : v);
export const iso = (v) => { const t = typeof v === 'number' ? v : Date.parse(asUtc(v)); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
export const eventTime = ({ occurredAt = null, issuedAt = null, updatedAt = null } = {}) =>
  ({ occurredAt, issuedAt, updatedAt, retrievedAt: new Date().toISOString() });
const NO_TIME = () => (i18n.ko ? '시각 미확인' : 'time unknown');

export const agoText = (t) => {
  if (t == null || !Number.isFinite(Number(t))) return NO_TIME();
  const m = Math.round((Date.now() - t) / 60000);
  const ko = i18n.ko;
  if (m < 60) return ko ? `${m}분 전` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (m < 1440) return ko ? `${h}시간 전` : `${h} h ago`;
  const d = Math.round(m / 1440);
  return ko ? `${d}일 전` : `${d} d ago`;
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
    this.room = new EventRoom();
    this.roomHtmlCache = null; // 선택 사건의 기관 스택 (비동기 완성 후 채워짐)
  }

  // PAST: 사건 주변의 실제 이력 — 값 생성 없이 공식 아카이브 조회만
  async loadPast(it, gen = this._gen) {
    this.past = { state: 'loading' };
    if (this.onUpdate) this.onUpdate();
    const fetchJson = this.fetchJson || ((url, opts) => fetch(url, opts).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
    const signal = this._abort ? this._abort.signal : undefined;
    let next;
    try {
      if (it.kind === 'EQ') {
        // USGS 아카이브: 반경 300km · 최근 30일 · M2.5+
        const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson'
          + `&latitude=${it.lat.toFixed(3)}&longitude=${it.lon.toFixed(3)}&maxradiuskm=300`
          + `&starttime=${start}&minmagnitude=2.5&orderby=magnitude&limit=200`;
        const j = await Promise.race([
          fetchJson(url, { signal }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), 12000); }),
        ]);
        const fs = j.features || [];
        const mags = fs.map((f) => f.properties.mag).filter((m) => m != null);
        const bigger = mags.filter((m) => m >= (it.facts[0] ? parseFloat(String(it.facts[0][1]).slice(1)) : 99)).length;
        const top = fs.slice(0, 5).map((f) => ({
          mag: f.properties.mag, place: f.properties.place, t: f.properties.time,
        }));
        next = {
          state: 'ready', kind: 'EQ', n: fs.length, maxMag: mags.length ? Math.max(...mags) : null, bigger, top,
          src: 'USGS 아카이브 · 반경 300km · 30일 · M2.5+ · 사건 시각 이후 여진과 이전 지진이 섞여 있음',
        };
      } else if (it.kind === 'TC') {
        // KMA·JMA·NHC 공식 발표 타임라인 (1.0 S3 캐시)
        const j = await Promise.race([
          fetchJson('https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/typhoon-official.json', { cache: 'no-store', signal }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), 12000); }),
        ]);
        const name = it.stormName || (it.title || '').replace(i18n.t('tcTitle'), '').trim().toUpperCase().replace(/-\d{2}$/, '');
        const storm = (j.storms || []).find((s) => name && (s.key === name || (s.name || '').toUpperCase() === name));
        const ag = storm && (storm.agencies || []).find((a) => a.steps && a.steps.length);
        next = ag
          ? {
            state: 'ready', kind: 'TC', agency: ag.agencyKo || ag.agency,
            steps: ag.steps.map((s) => ({ h: s.h, windMs: s.windMs, hpa: s.hpa, place: s.place })),
            src: `${ag.agencyKo || ag.agency} 공식 발표 (${j.generated ? j.generated.slice(0, 16) : ''})`,
          }
          : { state: 'none', note: '공식 태풍 발표에서 이 사건을 찾지 못했습니다 — 표시하지 않습니다.' };
      } else {
        next = { state: 'none', note: '이 사건 유형의 이력 소스가 아직 없습니다.' };
      }
    } catch (e) {
      next = { state: 'error', note: `이력 조회 실패 (${String((e && e.message) || e)}) — 판단하지 않습니다.` };
    }
    if (gen !== this._gen) return;   // 늦게 도착한 다른 사건의 이력 — 버린다
    this.past = next;
    if (this.onUpdate) this.onUpdate();
  }

  // EVIDENCE 카드의 시각 세 줄 — 발표·갱신·수집을 한 줄 '갱신' 으로 뭉치지 않는다.
  timeLines(it) {
    const t = it.time || {};
    const f = (v) => (v ? `${v.slice(5, 16).replace('T', ' ')}Z` : NO_TIME());
    const ko = i18n.ko;
    const rows = [];
    if (it.kind === 'EQ') rows.push(`${ko ? '발생' : 'occurred'} ${f(t.occurredAt)}`);
    else rows.push(`${ko ? '발표' : 'issued'} ${f(t.issuedAt)}`, `${ko ? '갱신' : 'updated'} ${f(t.updatedAt)}`);
    rows.push(`${ko ? '수집' : 'retrieved'} ${f(t.retrievedAt)}`);
    return rows.join(' · ');
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

  // GDACS 는 태풍 하나를 에피소드 수백 개로 쪼개 보내고, 그걸 폴리곤까지 붙여
  // **1.7MB** 로 내려준다. 실측하면 응답에 10~28초가 걸린다(2026-09-04, 서울·브라우저).
  // 12초로 끊어 두고 있었으니 태풍 칸은 사실상 언제나 '응답 없음'이었다 —
  // 출처가 멀쩡한데 우리가 먼저 끊고 있었다. 문턱을 실측에 맞추고,
  // 지진은 그 기다림에 묶지 않는다(먼저 그리고, 태풍은 도착하면 덧그린다).
  async load() {
    // 재시도가 실패해도 직전 목록은 버리지 않는다 — '이전 결과 · 수집 시각' 으로 남긴다(지시서 A-4).
    this.previous = this.items.length ? { items: this.items, retrievedAt: this.retrievedAt } : null;
    this.state = 'loading';
    this.tcPending = true;
    this.tcFailed = false;
    this.eqPending = true;
    this.eqFailed = false;
    this.items = [];
    this.retrievedAt = new Date().toISOString();
    const fetchJson = this.fetchJson || ((url, opts) => fetch(url, opts).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }));
    const timed = (url, ms) => Promise.race([
      fetchJson(url),
      new Promise((_, rej) => { setTimeout(() => rej(new Error('timeout')), ms); }),
    ]);

    // 태풍은 뒤에서 계속 받는다. 끝나면 스스로 다시 그린다.
    const tcJob = timed(GDACS_TC, 45000)
      .then((j) => { this.ingestTC(j); this.tcFailed = false; })
      .catch(() => { this.tcFailed = true; })
      .finally(() => {
        this.tcPending = false;
        this.settle();
        if (this.onUpdate) this.onUpdate();
      });

    try {
      this.ingestEQ(await timed(USGS_EQ, 12000));
    } catch (e) { this.eqFailed = true; /* 지진이 실패해도 태풍은 위에서 계속 받는다 */ }
    this.eqPending = false;
    this.settle();
    // 여기서 끝낸다 — 태풍을 기다리지 않는다. 태풍은 도착하면 onUpdate 로 다시 그린다.
    // (tcJob 은 catch·finally 를 달아 두었으니 붙잡지 않아도 조용히 끝난다.)
    void tcJob;
  }

  // 목록 정렬·상태 판정을 한 곳에 둔다 — 두 출처가 서로 다른 시점에 도착하기 때문이다.
  // 상태 5분법(지시서 A-4): loading · ready · partial(한 출처 실패) · empty(둘 다 정상 0건) · error(둘 다 실패)
  // + stale(둘 다 실패했지만 직전 목록이 있음). 정렬 기준은 화면 머리에 그대로 적는다(F06).
  settle() {
    const noTime = (v) => !Number.isFinite(v);
    this.items.sort((a, b) => {
      if (noTime(a.whenT) !== noTime(b.whenT)) return noTime(a.whenT) ? 1 : -1;   // 시각 없는 사건은 맨 뒤
      if (a.kind !== b.kind) return a.kind === 'TC' ? -1 : 1;
      if (a.kind === 'TC') return (ALERT_RANK[a.alert] ?? 3) - (ALERT_RANK[b.alert] ?? 3);
      return b.whenT - a.whenT;
    });
    this.sources = {
      gdacs: { state: this.tcPending ? 'PENDING' : this.tcFailed ? 'FAILED' : 'OK', count: this.items.filter((x) => x.kind === 'TC').length },
      usgs: { state: this.eqPending ? 'PENDING' : this.eqFailed ? 'FAILED' : 'OK', count: this.items.filter((x) => x.kind === 'EQ').length },
    };
    const pending = this.tcPending || this.eqPending;
    const failed = (this.tcFailed ? 1 : 0) + (this.eqFailed ? 1 : 0);
    if (this.items.length) this.state = failed && !pending ? 'partial' : 'ready';
    else if (pending) this.state = 'loading';
    else if (failed === 2 && this.previous) { this.items = this.previous.items; this.state = 'stale'; }
    else this.state = failed ? 'error' : 'empty';
  }

  // 출처 상태 한 줄 — "오는 중"과 "못 받음"과 "없음"을 다른 말로 적는다.
  sourceNote() {
    const ko = i18n.ko;
    const name = { gdacs: 'GDACS', usgs: 'USGS' };
    const parts = Object.entries(this.sources || {}).map(([id, s]) => {
      if (s.state === 'PENDING') return `${name[id]} ${ko ? '받는 중' : 'loading'}`;
      if (s.state === 'FAILED') return `${name[id]} ${ko ? '조회 불가' : 'unavailable'}`;
      return `${name[id]} ${s.count}${ko ? '건' : ''}`;
    });
    const retry = `<button class="feed-back" data-action="feed-retry" style="margin:0 0 0 6px">${i18n.t('retry')}</button>`;
    const stale = this.state === 'stale' && this.previous
      ? ` · ${ko ? '이전 결과' : 'previous result'} ${(this.previous.retrievedAt || '').slice(11, 16)}Z`
      : '';
    return `<div class="feed-note">${parts.join(' · ')}${stale}${/FAILED/.test(JSON.stringify(this.sources)) || this.state === 'stale' ? retry : ''}</div>`;
  }

  ingestTC(json) {
    const items = this.items;
    if (json && json.features) {
      for (const f of json.features) {
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
          // 태풍 이름은 따로 들고 다닌다 — 제목에서 접두어를 떼어 쓰면 화면 언어가 바뀔 때
          // 공식 발표 대조(loadPast)가 조용히 어긋난다.
          //
          // GDACS 는 이름 끝에 시즌을 붙인다('SAUDEL-26'). 기상청·JMA·NHC 는 'Saudel' 이다.
          // 그 꼬리표 하나 때문에 이름 유사도가 1.00 → 0.50 으로 깎였고, SAUDEL 은 합산 0.59 로
          // 문턱(0.62) 아래에 떨어져 "공식 발표에서 찾지 못했다"고 적히고 있었다 —
          // 기상청이 그 태풍을 발표하고 있는데도. 대조용 이름에서만 시즌을 떼고,
          // 화면에 적는 제목은 GDACS 가 준 그대로 둔다(출처의 표기를 우리가 고치지 않는다).
          stormName: (p.eventname || p.name || '').toUpperCase().replace(/-\d{2}$/, ''),
          title: `${i18n.t('tcTitle')} ${p.eventname || p.name || ''}`.trim(),
          where: p.country || i18n.t('atSea'),
          time: eventTime({ issuedAt: iso(p.fromdate), updatedAt: iso(p.todate) }),
          whenT: Date.parse(asUtc(p.todate || p.fromdate)),   // NaN 이면 목록 맨 뒤 + '시각 미확인'
          status: 'ACTIVE',
          truth: 'OFFICIAL_FORECAST',
          source: 'GDACS (JRC/UN)',
          lat: c[1],
          lon: c[0],
          facts: [
            [i18n.t('fAlert'), p.alertlevel || '—'],
            [i18n.t('fFrom'), (p.fromdate || '').slice(0, 10)],
            [i18n.t('fUpdated'), (p.todate || '').slice(0, 10)],
          ],
          why: '태풍 진로·강도 분석',
        });
      }
    }
  }

  ingestEQ(json) {
    const items = this.items;
    if (json && json.features) {
      for (const f of json.features.slice(0, 14)) {
        const p = f.properties || {};
        const c = (f.geometry || {}).coordinates || null;
        if (!c) continue;
        items.push({
          id: `eq-${f.id}`,
          kind: 'EQ',
          alert: p.mag >= 6.5 ? 'Red' : p.mag >= 5.5 ? 'Orange' : 'Green',
          title: `M${p.mag != null ? p.mag.toFixed(1) : '?'} ${i18n.ko ? '지진' : 'earthquake'}`,
          where: p.place || '',
          time: eventTime({ occurredAt: iso(p.time) }),
          whenT: Number.isFinite(p.time) ? p.time : NaN,
          status: 'ACTIVE',
          truth: 'OBSERVED',
          source: 'USGS',
          lat: c[1],
          lon: c[0],
          depthKm: c[2],
          official: p.url || null,   // USGS 사건 상세 페이지 (피드가 주는 값)
          facts: [
            [i18n.t('fMag'), `M${p.mag != null ? p.mag.toFixed(1) : '?'}`],
            [i18n.t('fDepth'), c[2] != null ? `${Math.round(c[2])} km (${i18n.t('fUnderground')})` : '—'],
            [i18n.t('fWhen'), Number.isFinite(p.time) ? agoText(p.time) : NO_TIME()],
          ],
          why: '지진 발생 맥락 분석',
        });
      }
    }
  }

  html() {
    if (this.view === 'room' && this.selected) return this.roomHtml(this.selected);
    if (this.state === 'loading') {
      return `<div class="card"><div class="card-b">${i18n.t('feedLoading')}</div></div>`;
    }
    if (this.state === 'error') {
      return `<div class="card"><div class="card-h">${i18n.ko ? '피드' : 'Feed'} ${this.badge('INSUFFICIENT_DATA')}</div>
        <div class="card-b">${i18n.t('feedError')}</div></div>${this.sourceNote()}`;
    }
    if (this.state === 'empty') {
      return `<div class="feed-head">${i18n.ko ? '오늘의 지구 사건' : "Today's Earth events"} <span class="feed-cnt">0</span></div>
        <div class="feed-note">${i18n.ko ? '두 출처 모두 정상 응답 — 수집 범위에 사건이 없습니다.' : 'Both sources responded — no events in scope.'}</div>${this.sourceNote()}`;
    }
    const shown = this.visibleItems();
    if (!shown.length) {
      const what = i18n.t(this.kind === 'EQ' ? 'feedNoneEQ' : this.kind === 'TC' ? 'feedNoneTC' : 'feedNoneEV');
      return `<div class="feed-head">${what} <span class="feed-cnt">0</span></div>
        <div class="feed-note">${i18n.t('feedNone').replace('{what}', what)}</div>`;
    }
    const rows = shown.map((it) => `
      <div class="feed-item" data-action="feed-open" data-idx="${this.items.indexOf(it)}">
        <span class="feed-dot ${it.kind === 'TC' ? 'tc' : 'eq'} a-${it.alert.toLowerCase()}"></span>
        <div class="feed-main">
          <div class="feed-title">${it.title}</div>
          <div class="feed-sub">${it.where} · ${agoText(it.whenT)}${Number.isFinite(it.whenT) ? '' : ` ${this.badge('INSUFFICIENT_DATA')}`}</div>
        </div>
        ${this.badge(it.truth)}
      </div>`).join('');
    const ko = i18n.ko;
    // 아직 받는 중인 것과 못 받은 것을 구분해서 말한다 — 둘 다 '응답 없음'으로 적으면
    // 오는 중인 자료를 없다고 말하는 셈이 된다.
    const tcNote = this.tcPending
      ? `<div class="feed-note">${i18n.t('tcPending')}</div>`
      : this.tcFailed
        ? `<div class="feed-note">${i18n.t('tcFailed')} — ${this.badge('INSUFFICIENT_DATA')} <button class="feed-back" data-action="feed-retry" style="margin:0">${i18n.t('retry')}</button></div>`
        : '';
    const head = this.kind === 'EQ' ? (ko ? '지진 (USGS 관측)' : 'Earthquakes (USGS observed)')
      : this.kind === 'TC' ? (ko ? '태풍 (GDACS 공식)' : 'Tropical cyclones (GDACS official)')
      : (ko ? '오늘의 지구 사건' : "Today's Earth events");
    const src = this.kind === 'EQ' ? (ko ? '출처: USGS(관측)' : 'Source: USGS (observed)')
      : this.kind === 'TC' ? (ko ? '출처: GDACS(공식 경보)' : 'Source: GDACS (official alerts)')
      : (ko ? '출처: GDACS(공식 경보) · USGS(관측)' : 'Source: GDACS (official alerts) · USGS (observed)');
    const tail = ko ? '사건 클릭 시 3D 지구에서 확인' : 'click an event to find it on the 3D globe';
    const sortNote = i18n.ko ? '정렬: 공식 경보 등급 → 최근 갱신 · 시각 없는 사건은 뒤' : 'sort: official alert level → latest update · undated last';
    return `<div class="feed-head">${head} <span class="feed-cnt">${shown.length}</span></div>${this.kind === 'EQ' ? '' : tcNote}${this.state === 'partial' || this.state === 'stale' ? this.sourceNote() : ''}${rows}
      <div class="feed-note">${src} — ${tail} · ${sortNote}</div>`;
  }

  // 공식 1차 출처의 사건 페이지로 나가는 링크.
  // 저장소 규칙대로 noopener 를 붙인 공식 페이지만 쓴다. 값이 없으면 만들지 않는다.
  officialLink(it) {
    if (!it.official) return '';
    let host = '';
    try { host = new URL(it.official).host.replace(/^www\./, ''); } catch (e) { return ''; }
    const name = i18n.ko
      ? ({ 'earthquake.usgs.gov': 'USGS 사건 페이지' }[host] || `${host} 공식 페이지`)
      : ({ 'earthquake.usgs.gov': 'the USGS event page' }[host] || `the official page at ${host}`);
    return `<br/><a class="official-out" href="${it.official}" target="_blank" rel="noopener noreferrer">${i18n.ko ? `${name} 열기` : `Open ${name}`} ↗</a>`;
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
      ${this.roomHtmlCache || '<div class="card room"><div class="card-h">사건 방 — 기관 스택</div><div class="card-b">기관 데이터를 모으는 중… (공식 트랙 · 앙상블 · 해상관측 · 연안 침수 · 특보)</div></div>'}
      <div class="card"><div class="card-h">EVIDENCE</div>
        <div class="card-b">1차 출처: ${it.source}<br/>${this.timeLines(it)}<br/>지구 위 위치는 출처 좌표 그대로${it.kind === 'TC' ? '<br/>트랙 라인: GDACS 공식 경로' : ''}${it.depthKm != null ? `<br/>진원은 지하 <b>${Math.round(it.depthKm)}km</b> — 재해 메뉴의 <b>지진 깊이</b>를 켜면 진원을 실제 깊이 자리에서 봅니다` : ''}${this.officialLink(it)}</div></div>
      ${this.pastHtml()}
      <div class="card"><div class="card-h">WHY ${this.badge('INSUFFICIENT_DATA')}</div>
        <div class="card-b"><b>인과 주장 게이트</b>: 검증된 근거 체인 없이 "원인"을 말하지 않습니다.<br/>
        이 사건에 연결된 근거는 1차 관측(${it.source})과 위의 실측 이력뿐 — 인과 분석 근거 부족.<br/>
        <span class="paysub">${it.why} — 근거 그래프·전망(NEXT)은 EXPLORER PRO에서 제공 예정 · 공식 경보·안전정보는 항상 무료</span></div></div>`;
  }

  // 선택 세대 토큰(지시서 B): A 를 눌렀다 B 를 누르면 A 의 늦은 응답(이력·트랙·기관 스택)은 전부 버린다.
  _nextGeneration() {
    this._gen = (this._gen || 0) + 1;
    if (this._abort) this._abort.abort();
    this._abort = typeof AbortController === 'function' ? new AbortController() : null;
    return this._gen;
  }

  async select(idx, orbit) {
    const it = this.items[idx];
    if (!it) return;
    const gen = this._nextGeneration();
    this.selected = it;
    this.view = 'room';
    this.loadPast(it, gen); // PAST 카드 비동기 채움 (완료 시 onUpdate로 리렌더)
    // 사건 방: 기관 스택은 비동기로 모아 채운다. 다른 사건으로 넘어갔으면 버린다.
    this.roomHtmlCache = null;
    this.room.build(it).then((html) => {
      if (this.selected !== it || gen !== this._gen) return;
      this.roomHtmlCache = html;
      if (this.onUpdate) this.onUpdate();
    }).catch((e) => {
      if (this.selected !== it || gen !== this._gen) return;
      this.roomHtmlCache = `<div class="card room"><div class="card-h">사건 방 ${this.badge('UNAVAILABLE')}</div><div class="card-b">기관 데이터를 모으지 못했습니다 — ${String((e && e.message) || e)}. 판단하지 않습니다.</div></div>`;
      if (this.onUpdate) this.onUpdate();
    });
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
        const fetchJson = this.fetchJson || ((url, opts) => fetch(url, opts).then((r) => r.json()));
        const g = await fetchJson(GDACS_GEOM(it.eventid, it.episodeid), { signal: this._abort ? this._abort.signal : undefined });
        if (gen !== this._gen) return;   // 그 사이 다른 사건을 골랐다 — A 의 트랙을 B 위에 그리지 않는다
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
    this._nextGeneration();
    this.view = 'list';
    this.selected = null;
    this.past = null;
    this.roomHtmlCache = null;
    this.clearTrack();
  }

  // 재해 메뉴의 '지구 사건 피드 / 지진 / 태풍' 세 줄이 눌러도 같은 화면이던 것을 갈라 준다
  setKind(kind) {
    this._nextGeneration();
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

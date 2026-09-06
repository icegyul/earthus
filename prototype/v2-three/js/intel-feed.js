// EARTHUS — Earth Intelligence Feed (v5.3 §28) + Event Room 라이트 (§29)
// 뉴스피드가 아니라 "오늘 지구에서 이해할 가치가 있는 사건"을 Earth Event로.
// 실데이터: GDACS 열대저기압(공식·전 해역) + USGS 지진(관측). 사건은 3D 지구 위 비컨으로.

import * as THREE from '../../vendor/three-r184.module.min.js';
// 사건 방: 기관 스택 + 진리등급 + 현재→다음→행동 (정본 HAZ-011로 사건 결합)
import { EventRoom } from './event-room.js?v=3';
import { i18n } from './i18n.js?v=10';

// PHASE 1(2026-09-05): 브라우저는 EARTHUS 축약본(Point·카드 필드만, 수십 KB)을 정상 경로로 쓴다.
// 원본 MAP(1.97 MB · 15~106초)은 축약본도, 마지막 정상 축약본(localStorage)도 없을 때만 폴백이다.
const GDACS_TC_COMPACT = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/gdacs-tc.json';
const GDACS_TC_ORIGIN = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=TC';
const GDACS_TC = GDACS_TC_COMPACT;
const GDACS_LAST_KEY = 'earthus.gdacs.last';
const loadLastGdacs = () => { try { const j = JSON.parse(localStorage.getItem(GDACS_LAST_KEY) || 'null'); return j && j.features ? j : null; } catch (e) { return null; } };
const saveLastGdacs = (j) => { try { localStorage.setItem(GDACS_LAST_KEY, JSON.stringify({ generated: j.generated, savedAt: new Date().toISOString(), features: j.features })); } catch (e) { /* 저장 불가 */ } };
const USGS_EQ = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
const GDACS_GEOM = (id, ep) => `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${id}&episodeid=${ep}`;

const ALERT_RANK = { Red: 0, Orange: 1, Green: 2 };
// 공개 사건 패킷(지시서 D-1) — cyclone-analog 가 3시간마다 쓴다. Feed 는 GDACS eventid 로 결합한다.
const EVENTS_INDEX = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/cyclone-events.json';
const EVENT_PACKET = (id) => `https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/cyclone-events/${id}.json`;
const FOLLOW_KEY = 'earthus.follow';
const STATUS_KO = { ACTIVE: '활동 중', WATCH: '주시', RESOLVED: '지난 사건', VERIFYING: '종료 확인 중', PRELIMINARY_REPORT: '잠정 보고', FINAL_REPORT: '최종 보고' };
const CONF_BADGE = { high: ['live', '신뢰 高'], medium: ['off', '신뢰 中'], low: ['stale', '신뢰 低'] };
export const loadFollow = () => { try { return JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]'); } catch (e) { return []; } };
export const saveFollow = (ids) => { try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(ids)); } catch (e) { /* 저장 불가 — 세션 안에서만 */ } };

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
    this.extraRoomHtml = null; // (it) => html — FOR ME MY IMPACT 미니 블록 (main.js가 연결, STEP 3)
    this.room = new EventRoom();
    this.roomHtmlCache = null; // 선택 사건의 기관 스택 (비동기 완성 후 채워짐)
    this.events = new Map();   // gdacsId → 패킷 목록 항목 (변경 요약·이유·신뢰도·상태)
    this.packet = null;        // 선택 사건의 전체 패킷 (회차·검증)
    this.follow = new Set(loadFollow());
    this.showResolved = false;
  }

  // 팔로우: 이 브라우저에만 저장. 계정 동기화는 지시서 P1-3.
  toggleFollow(id) {
    if (this.follow.has(id)) this.follow.delete(id); else this.follow.add(id);
    saveFollow([...this.follow]);
    this.settle();
  }

  // 패킷 목록을 받아 사건에 붙인다 — 실패해도 Feed 는 그대로(패킷은 덧붙이는 정보다).
  async loadEvents() {
    const fetchJson = this.fetchJson || ((url, opts) => fetch(url, opts).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }));
    try {
      const j = await fetchJson(EVENTS_INDEX, { cache: 'no-store' });
      this.events = new Map((j.events || []).map((e) => [String(e.gdacsId), e]));
      this.eventsAt = j.generated || null;
    } catch (e) { this.eventsFailed = true; }
    this.settle();
    if (this.onUpdate) this.onUpdate();
  }

  packetOf(it) { return it && it.kind === 'TC' ? this.events.get(String(it.eventid)) || null : null; }

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

    void this.loadEvents();   // 패킷 목록은 따로 받는다 — 도착하면 카드가 채워진다
    // 태풍은 뒤에서 계속 받는다. 끝나면 스스로 다시 그린다.
    // 축약본 → 마지막 정상 축약본 → (둘 다 없을 때만) 원본. 어느 경로로 왔는지 sources.gdacs.origin 에 남긴다.
    this.tcOrigin = null;
    const tcJob = timed(GDACS_TC_COMPACT, 20000)
      .then((j) => { if (!j || !Array.isArray(j.features)) throw new Error('compact-invalid'); saveLastGdacs(j); this.tcOrigin = 'compact'; this.tcGenerated = j.generated || null; return j; })
      .catch((e) => {
        const last = loadLastGdacs();
        if (last) { this.tcOrigin = 'cache'; this.tcGenerated = last.generated || null; console.warn('[feed] GDACS 축약본 실패 — 마지막 정상 축약본 사용', String(e && e.message || e), last.savedAt); return last; }
        console.warn('[feed] GDACS 축약본·캐시 모두 없음 — 원본 MAP 폴백(1.9 MB, 느림)');
        this.tcOrigin = 'origin';
        return timed(GDACS_TC_ORIGIN, 45000);
      })
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
    // 끝난 사건 = RESOLVED 뿐 아니라 세션이 종료 단계(검증·잠정·최종 보고)인 것도 — 소멸한 태풍이 1번에 있던 문제
    const PAST = new Set(['RESOLVED', 'VERIFYING', 'PRELIMINARY_REPORT', 'FINAL_REPORT']);
    const resolved = (x) => { const p = this.packetOf(x); return p ? PAST.has(p.status) : false; };
    this.isPast = resolved;
    const nearKm = (x) => { const p = this.packetOf(x); return p && p.nearestWarnRegionKm != null ? p.nearestWarnRegionKm : 1e9; };
    this.items.sort((a, b) => {
      const fa = this.follow.has(a.id), fb = this.follow.has(b.id);
      if (fa !== fb) return fa ? -1 : 1;                                             // 팔로우 사건은 맨 위
      if (resolved(a) !== resolved(b)) return resolved(a) ? 1 : -1;                  // 지난 사건은 뒤
      if (noTime(a.whenT) !== noTime(b.whenT)) return noTime(a.whenT) ? 1 : -1;   // 시각 없는 사건은 맨 뒤
      if (a.kind !== b.kind) return a.kind === 'TC' ? -1 : 1;
      if (a.kind === 'TC') {
        const r = (ALERT_RANK[a.alert] ?? 3) - (ALERT_RANK[b.alert] ?? 3);
        if (r) return r;
        if (nearKm(a) !== nearKm(b)) return nearKm(a) - nearKm(b);
      }
      return b.whenT - a.whenT;
    });
    this.sources = {
      gdacs: { state: this.tcPending ? 'PENDING' : this.tcFailed ? 'FAILED' : 'OK', count: this.items.filter((x) => x.kind === 'TC').length, origin: this.tcOrigin || null, generated: this.tcGenerated || null },
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
      const via = s.origin === 'cache' ? ` (${ko ? '이전 축약본' : 'cached'}${s.generated ? ` ${String(s.generated).slice(5, 16).replace('T', ' ')}Z` : ''})` : s.origin === 'origin' ? ` (${ko ? '원본 직접' : 'origin'})` : '';
      return `${name[id]} ${s.count}${ko ? '건' : ''}${via}`;
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
          mag: Number.isFinite(p.mag) ? p.mag : null,   // FOR ME 사건 방 판정용 숫자 규모 (제목의 M6.2 는 글자다)
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
    const resolvedItems = shown.filter((it) => this.isPast && this.isPast(it) && !this.follow.has(it.id));   // 팔로우한 사건은 끝나도 접지 않는다
    const live = this.showResolved ? shown : shown.filter((it) => !resolvedItems.includes(it));
    const rows = live.map((it) => this.cardHtml(it)).join('')
      + (resolvedItems.length && !this.showResolved
        ? `<button class="feed-back" data-action="feed-show-resolved" style="margin:4px 0 8px">${i18n.ko ? `지난 사건 ${resolvedItems.length}건 보기 ▾` : `Show ${resolvedItems.length} past events ▾`}</button>` : '');
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
    return `<div class="feed-head">${head} <span class="feed-cnt">${shown.length}</span></div>${this.kind === 'EQ' ? '' : tcNote}${this.state === 'partial' || this.state === 'stale' || (this.sources && this.sources.gdacs && (this.sources.gdacs.origin === 'cache' || this.sources.gdacs.origin === 'origin')) ? this.sourceNote() : ''}${rows}
      <div class="feed-note">${src} — ${tail} · ${sortNote}</div>`;
  }

  // 사건 카드(지시서 D-2 · 8필드): 제목·장소·시각·상태·바뀐 것·왜 지금·진리등급·신뢰도 + 팔로우.
  // 패킷이 없으면 현행 카드 + '변경 이력 없음 (첫 관측)'.
  cardHtml(it) {
    const p = this.packetOf(it);
    const ko = i18n.ko;
    const followed = this.follow.has(it.id);
    const conf = p && CONF_BADGE[p.confidence] ? `<span class="badge ${CONF_BADGE[p.confidence][0]}" title="근거의 신선도·기관 일치도 — 정확도가 아님">${CONF_BADGE[p.confidence][1]}</span>` : '';
    const status = p && p.status && p.status !== 'ACTIVE' ? `<span class="badge demo">${STATUS_KO[p.status] || p.status}</span>` : '';
    const changed = p ? `<div class="feed-line"><span class="feed-k">${ko ? '바뀐 것' : 'changed'}</span>${p.changeSummaryKo || '—'}</div>` : (it.kind === 'TC' ? `<div class="feed-line dim">${ko ? '변경 이력 없음 (첫 관측)' : 'no revision yet'}</div>` : '');
    const why = p && p.reasons && p.reasons.length ? `<div class="feed-line"><span class="feed-k">${ko ? '왜 지금' : 'why now'}</span>${p.reasons.join(' · ')}</div>` : '';
    const rev = p && p.lastRevisionAt ? ` · ${ko ? '회차' : 'rev'} ${agoText(Date.parse(p.lastRevisionAt))}` : '';
    return `
      <div class="feed-item${followed ? ' followed' : ''}" data-action="feed-open" data-idx="${this.items.indexOf(it)}">
        <span class="feed-dot ${it.kind === 'TC' ? 'tc' : 'eq'} a-${it.alert.toLowerCase()}"></span>
        <div class="feed-main">
          <div class="feed-title">${it.title}${followed && p && p.lastRevisionAt && this.follow.has(it.id) ? '' : ''}</div>
          <div class="feed-sub">${it.where} · ${agoText(it.whenT)}${Number.isFinite(it.whenT) ? '' : ` ${this.badge('INSUFFICIENT_DATA')}`}${rev}</div>
          ${changed}${why}
        </div>
        <div class="feed-badges">${this.badge(it.truth)}${conf}${status}
          ${it.kind === 'TC' ? `<button class="feed-follow${followed ? ' on' : ''}" data-action="feed-follow" data-id="${it.id}" title="${ko ? '이 사건을 위에 고정하고 새 회차를 표시' : 'Pin and mark new revisions'}">${followed ? '★' : '☆'}</button>` : ''}
        </div>
      </div>`;
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
      ${this.compareHtml(it)}
      ${this.verifyHtml(it)}
      <div class="card"><div class="card-h">WHY ${this.badge('INSUFFICIENT_DATA')}</div>
        <div class="card-b"><b>인과 주장 게이트</b>: 검증된 근거 체인 없이 "원인"을 말하지 않습니다.<br/>
        이 사건에 연결된 근거는 1차 관측(${it.source})과 위의 실측 이력뿐 — 인과 분석 근거 부족.<br/>
        <span class="paysub">${it.why} — 근거 그래프·전망(NEXT)은 EXPLORER PRO에서 제공 예정 · 공식 경보·안전정보는 항상 무료</span></div></div>${this.extraRoomHtml ? this.extraRoomHtml(it) : ''}`;
  }
  // FOR ME MY IMPACT 미니 블록 — main.js 가 연결한다(사건 방 맨 끝, WHY 카드 뒤). 지시서 v2.0 STEP 3.
  // 이 모듈은 내 동네·판정 상태를 모른다. 훅이 없으면 아무것도 그리지 않는다.

  // 선택 세대 토큰(지시서 B): A 를 눌렀다 B 를 누르면 A 의 늦은 응답(이력·트랙·기관 스택)은 전부 버린다.
  _nextGeneration() {
    this._gen = (this._gen || 0) + 1;
    if (this._abort) this._abort.abort();
    this._abort = typeof AbortController === 'function' ? new AbortController() : null;
    return this._gen;
  }

  // 선택 사건의 전체 패킷(회차·검증) — 목록 항목과 달리 사건마다 한 파일이라 열 때 받는다.
  async loadPacket(it, gen) {
    this.packet = null;
    this.compareA = null;
    if (it.kind !== 'TC') return;
    const fetchJson = this.fetchJson || ((url, opts) => fetch(url, opts).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }));
    let next = null;
    try { next = await fetchJson(EVENT_PACKET(it.eventid), { cache: 'no-store', signal: this._abort ? this._abort.signal : undefined }); }
    catch (e) { next = { error: String((e && e.message) || e) }; }
    if (gen !== this._gen) return;
    this.packet = next;
    this.drawPreviousTrack(next);
    if (this.onUpdate) this.onUpdate();
  }

  // 회차 두 개 고르기 — 기본은 최신·직전. URL 로 재현 가능하게 revisionId 를 쓴다.
  setCompare(a, b) { this.compareA = a; this.compareB = b; this.drawPreviousTrack(this.packet); if (this.onUpdate) this.onUpdate(); }

  comparePair() {
    const revs = (this.packet && this.packet.revisions) || [];
    if (revs.length < 2) return null;
    const b = revs.find((r) => r.revisionId === this.compareB) || revs[revs.length - 1];
    const a = revs.find((r) => r.revisionId === this.compareA) || revs[Math.max(0, revs.indexOf(b) - 1)];
    return a === b ? null : { a, b };
  }

  // 지구 위: 직전 회차 공식 예보(h0→h24→h48)를 회색 점선으로, 현재 회차를 주황 실선으로(지시서 L-4).
  drawPreviousTrack(packet) {
    this.clearRevisionLines();
    const pair = this.comparePair();
    if (!pair || !this.scene) return;
    const M = Math.PI / 180;
    const line = (agencies, color, dashed) => {
      const ag = agencies.KMA || agencies.JMA || agencies.NHC;
      if (!ag) return null;
      const pts = [ag.h0, ag.h24, ag.h48].filter(Boolean).map((p) => new THREE.Vector3(
        Math.cos(p.lat * M) * Math.sin(p.lon * M) * 1.007, Math.sin(p.lat * M) * 1.007, Math.cos(p.lat * M) * Math.cos(p.lon * M) * 1.007));
      if (pts.length < 2) return null;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.01, gapSize: 0.008, transparent: true, opacity: 0.8 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const l = new THREE.Line(geo, mat);
      if (dashed) l.computeLineDistances();
      return l;
    };
    this.revisionLines = [line(pair.a.agencies, 0xc8d2dc, true), line(pair.b.agencies, 0xffd39a, false)].filter(Boolean);
    this.revisionLines.forEach((l) => this.scene.add(l));
  }

  clearRevisionLines() {
    (this.revisionLines || []).forEach((l) => { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
    this.revisionLines = [];
    this.clearIsochrones();
  }

  // 지시서 N-1 — 쓰나미 등시선(30분 간격, 주황). 사건 방이 도달시간 파일을 받으면 그린다. SIMULATION_ONLY.
  drawIsochrones(doc) {
    this.clearIsochrones();
    if (!doc || !doc.isochronesMin || !this.scene) return;
    const M = Math.PI / 180;
    const v = (p) => new THREE.Vector3(Math.cos(p[0] * M) * Math.sin(p[1] * M) * 1.006, Math.sin(p[0] * M) * 1.006, Math.cos(p[0] * M) * Math.cos(p[1] * M) * 1.006);
    const pts = [];
    for (const [level, segs] of Object.entries(doc.isochronesMin)) {
      if (+level > 720) continue;
      for (const [p, q] of segs) { if (Math.abs(p[1] - q[1]) > 180) continue; pts.push(v(p), v(q)); }
    }
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.55 });
    const lines = new THREE.LineSegments(geo, mat);
    this.isoLines = [lines];
    this.scene.add(lines);
  }

  clearIsochrones() {
    (this.isoLines || []).forEach((l) => { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
    this.isoLines = [];
  }

  compareHtml(it) {
    if (it.kind !== 'TC') return '';
    const p = this.packet;
    if (!p) return `<div class="card"><div class="card-h">이전 발표와 비교</div><div class="card-b">회차 자료 받는 중…</div></div>`;
    if (p.error) return `<div class="card"><div class="card-h">이전 발표와 비교 ${this.badge('UNAVAILABLE')}</div><div class="card-b">회차 자료를 받지 못했습니다 (${p.error}) — 판단하지 않습니다.</div></div>`;
    const pair = this.comparePair();
    if (!pair) return `<div class="card"><div class="card-h">이전 발표와 비교</div><div class="card-b">첫 회차 — 비교 대상 없음 (회차 ${(p.revisions || []).length}개)</div></div>`;
    const { a, b } = pair;
    const t = (r) => (r.issuedAt || '').slice(5, 16).replace('T', ' ') + 'Z';
    const chips = p.revisions.slice(-8).map((r) => `<button class="rev-chip${r === a ? ' a' : ''}${r === b ? ' b' : ''}" data-action="feed-compare" data-rev="${r.revisionId}" title="${t(r)}">${r.revisionId}</button>`).join('');
    const agencies = [...new Set([...Object.keys(a.agencies), ...Object.keys(b.agencies)])].filter((k) => !k.startsWith('EARTHUS'));
    const cell = (s) => (s ? `${s.lat.toFixed(1)},${s.lon.toFixed(1)}${s.windMs != null ? ` · ${s.windMs}m/s` : ''}` : '—');
    const rowsHtml = agencies.map((k) => {
      const ra = a.agencies[k], rb = b.agencies[k];
      const diff = (x, y) => (x && y && (x.lat !== y.lat || x.lon !== y.lon || x.windMs !== y.windMs) ? ' chg' : '');
      return `<tr><td>${k}</td><td class="dim">${cell(ra && ra.h0)}</td><td class="${diff(ra && ra.h0, rb && rb.h0)}">${cell(rb && rb.h0)}</td><td class="dim">${cell(ra && ra.h24)}</td><td class="${diff(ra && ra.h24, rb && rb.h24)}">${cell(rb && rb.h24)}</td></tr>`;
    }).join('');
    const changes = (b.changes || []).map((c) => `<li>${c.label}: ${c.from != null ? `${c.from} → ${c.to}` : c.delta != null ? `${c.delta} km 이동` : '—'}</li>`).join('');
    const link = `${location.pathname}?event=${it.eventid}&compare=${a.revisionId},${b.revisionId}`;
    // D-4: 회차가 가리키는 발표 원문(events/typhoon-official/archive/…) — 이전 발표를 다시 열면 당시 값이 그대로다
    const srcRefs = [['이전', a], ['현재', b]].flatMap(([lab, r]) => Object.entries(r.agencies)
      .filter(([, v]) => v && v.sourceRef)
      .map(([k, v]) => `<a class="official-out" href="https://earthus-cache-kr.s3.us-east-2.amazonaws.com/${v.sourceRef}" target="_blank" rel="noopener noreferrer">${lab} ${k} ${r.revisionId} ↗</a>`)).join(' · ');
    return `<div class="card"><div class="card-h">이전 발표와 비교 <span class="badge off">회차 ${a.revisionId} ⇄ ${b.revisionId}</span></div>
      <div class="card-b">
        <div class="rev-chips">${chips}</div>
        <div class="room-sub">${t(a)} → ${t(b)} · ${b.changeSummaryKo || ''}</div>
        ${changes ? `<ul class="rev-changes">${changes}</ul>` : ''}
        <div class="wrap"><table class="room-cmp"><thead><tr><th>기관</th><th>이전 h0</th><th>현재 h0</th><th>이전 +24h</th><th>현재 +24h</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        ${srcRefs ? `<div class="room-sub">당시 발표 원문(불변 보관): ${srcRefs}</div>` : ''}
        <div class="room-sub">지구 위: 현재 회차 예보 실선(주황) · 이전 회차 회색 점선 · <a class="official-out" href="${link}">이 비교 링크</a></div>
      </div></div>`;
  }

  verifyHtml(it) {
    if (it.kind !== 'TC') return '';
    const p = this.packet;
    if (!p || p.error || !p.detail) return '';
    const d = p.detail;
    const isFinal = p.sessionStatus === 'FINAL_REPORT';
    const head = d.headingScores || [];
    const pos = isFinal ? (d.scores || []) : (d.interimScores || []);
    if (!head.length && !pos.length) return `<div class="card"><div class="card-h">당시 전망 검증</div><div class="card-b">${d.note && d.note.interim ? d.note.interim : '대조할 실황이 아직 없습니다.'}</div></div>`;
    const byAgency = new Map();
    pos.forEach((s) => { const m = byAgency.get(s.agency) || { agency: s.agency, n: 0, sum: 0 }; m.n += s.n || 0; m.sum += (s.meanErrorKm || 0) * (s.n || 0); byAgency.set(s.agency, m); });
    head.forEach((h) => { const m = byAgency.get(h.agency) || { agency: h.agency, n: 0, sum: 0 }; m.headN = h.n; m.headErr = h.meanErrDeg; m.within45 = h.within45; byAgency.set(h.agency, m); });
    const nameKo = (a) => ({ KMA: '한국 기상청', JMA: '일본 기상청', NHC: '미국 허리케인센터', ECMWF: 'ECMWF 모델', EARTHUS_MULTI_SOURCE: 'EARTHUS 기준선', EARTHUS_ANALOG_MEDIAN: 'EARTHUS 유사사례 기준선' }[a] || a);
    const list = [...byAgency.values()].sort((x, y) => (x.headErr ?? 999) - (y.headErr ?? 999));
    const rows = list.map((m) => `<tr class="${/^EARTHUS/.test(m.agency) ? 'ours' : ''}"><td>${nameKo(m.agency)}</td><td>${m.headErr != null ? `${m.headErr}°` : '—'}</td><td>${m.headN ? `${m.within45}/${m.headN}` : '—'}</td><td>${m.n ? `${Math.round(m.sum / m.n)} km (n=${m.n})` : '—'}</td></tr>`).join('');
    return `<div class="card"><div class="card-h">${isFinal ? '종료 검증 (IBTrACS 최종 경로 기준)' : `당시 전망 검증 (잠정 · ${nameKo(d.truthAgency)} 실황 기준)`}</div>
      <div class="card-b">
        <div class="wrap"><table class="room-cmp"><thead><tr><th>자료</th><th>방향 오차</th><th>45° 안</th><th>위치 오차</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="room-sub">같은 리드타임·같은 표본에서만 비교 · 한 사건으로 기관의 장기 우열을 말하지 않습니다 · EARTHUS 줄은 기준선(일반 매개변수)입니다</div>
      </div></div>`;
  }

  // NEXT 탭 자동 채움(지시서 D-3): 선택 사건의 기관별 +24h/+48h.
  nextRows() {
    const p = this.packet;
    const it = this.selected;
    if (!it || !p || p.error || !p.revisions || !p.revisions.length) return [];
    const latest = p.revisions[p.revisions.length - 1];
    return Object.entries(latest.agencies).filter(([k]) => !k.startsWith('EARTHUS')).map(([k, v]) => ({
      agency: k, official: k !== 'ECMWF', issued: v.issued, h24: v.h24, h48: v.h48, headingKo: v.heading24Ko,
    }));
  }

  async select(idx, orbit) {
    const it = this.items[idx];
    if (!it) return;
    const gen = this._nextGeneration();
    this.selected = it;
    this.view = 'room';
    this.loadPacket(it, gen);
    this.loadPast(it, gen); // PAST 카드 비동기 채움 (완료 시 onUpdate로 리렌더)
    // 사건 방: 기관 스택은 비동기로 모아 채운다. 다른 사건으로 넘어갔으면 버린다.
    this.roomHtmlCache = null;
    this.room.build(it).then((html) => {
      if (this.selected !== it || gen !== this._gen) return;
      this.roomHtmlCache = html;
      if (it.kind === 'EQ') this.drawIsochrones(this.room.eta);   // 도달시간 파일이 없으면 아무것도 안 그린다
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
    this.packet = null;
    this.roomHtmlCache = null;
    this.clearTrack();
    this.clearRevisionLines();
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

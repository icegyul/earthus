/* earthus 배포 관리 — 지시서 §30~§35 · §86 · §87 · §97 · §131 · §143 · §152.
 *
 * ⚠️⚠️ 이 화면에는 **게시 버튼이 없다.**
 *    실제 게시는 studio.html → social-admin 이 한다(자격증명이 거기에만 있다).
 *    여기서는 후보를 보고, 근거를 확인하고, 미리보고, 스튜디오로 넘긴다.
 *    §143 — 못 하는 것은 회색으로 두지 않고 왜 못 하는지 적는다.
 *
 * ⚠️ 자격증명을 읽지 않는다. 토큰을 만지는 코드가 이 파일에 없다.
 *
 * 자료: events/distribution-content.json (aws/distribution/handler.py 가 쓴다)
 *       본문은 events/distribution-content/<contentId>.json
 */
import { CONFIG } from './config.local.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// config.js 와 같은 규칙: earthus.net 에서는 같은 출처(CloudFront), 그 밖은 S3 직접.
const CDN = location.hostname.endsWith('earthus.net')
  ? '' : 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const LOCAL_HOST = ['localhost', '127.0.0.1'].includes(location.hostname);

// 로컬에서는 개발 서버가 들고 있는 파일을 먼저 본다. 없으면 S3 로 간다.
// (핸들러를 --out prototype 으로 한 번 돌리면 배포 없이 화면을 볼 수 있다.)
const bases = LOCAL_HOST ? ['', CDN] : [CDN];
const INDEX_URL = (b) => `${b}/events/distribution-content.json`;
const BODY_URL = (b, id) => `${b}/events/distribution-content/${encodeURIComponent(id)}.json`;

async function fetchFirst(make) {
  let last = null;
  for (const b of bases) {
    try {
      const res = await fetch(make(b), { cache: 'no-cache' });
      if (res.ok) return res;
      last = res;
    } catch (e) { last = { status: 0, statusText: e.message }; }
  }
  return last;
}

const LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

const state = { client: null, user: null, index: null, view: 'list', bodies: new Map() };

/* 화면 어휘. 서버 어휘를 그대로 두면 관리자가 못 읽는다. 뜻은 바꾸지 않는다. */
const ELIG_KO = {
  ELIGIBLE: ['자격 있음', 'ok'], REVIEW_REQUIRED: ['검토 필요', 'warn'],
  BLOCKED: ['차단', 'bad'], INSUFFICIENT_DATA: ['자료 부족', 'mut'],
};
const CONF_KO = { HIGH: ['높음', 'ok'], MEDIUM: ['보통', 'warn'], LOW: ['낮음', 'bad'], UNKNOWN: ['근거 없음', 'mut'] };
const TYPE_KO = {
  BREAKING: '속보', NOW: '진행 중', EARTH_TODAY: '오늘의 지구', EARTH_WEEKLY: '주간',
  PHENOMENON: '현상', DATA_STORY: '데이터 이야기', EARTH_FROM_SPACE: '우주에서 본 지구',
  MONTHLY_EARTH: '월간', QUARTERLY_EARTH: '분기', ANNUAL_EARTH: '연간',
};
const BLOCK_KO = {
  NO_SOURCE: '출처 없음', LOW_CONFIDENCE: '신뢰도 낮음', UNVERIFIED_EVENT: '미확인 사건',
  SENSITIVE_EVENT: '민감 사건', MISSING_DATA: '자료 부족', VALIDATION_FAILED: '검증 실패',
  PLATFORM_INVALID: '플랫폼 규격 불일치', MANUAL_BLOCK: '수동 차단',
};
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (text, cls = '') => `<span class="tag ${cls}">${esc(text)}</span>`;

/* ── 인증 게이트 — studio.js 와 같은 방식. 새 인증 계보를 만들지 않는다 ─────── */
async function bootAuth() {
  if (LOCAL_PREVIEW) { $('#who').textContent = '로컬 미리보기'; return open(); }
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    $('#who').textContent = '인증 설정 없음';
    $('#gateMessage').textContent = 'Supabase 설정이 없어 관리자 권한을 확인할 수 없습니다.';
    $('#signInGoogle').disabled = true;
    return;
  }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    state.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await state.client.auth.getSession();
    state.user = data?.session?.user || null;
    state.client.auth.onAuthStateChange((_e, s) => { state.user = s?.user || null; paintGate(); });
    paintGate();
  } catch (e) {
    $('#who').textContent = '권한 확인 실패';
    $('#gateMessage').textContent = `로그인 상태를 확인하지 못했습니다. ${e.message}`;
  }
}

function paintGate() {
  const uids = CONFIG.ADMIN_UIDS || [];
  const known = !!state.user && (uids.includes(state.user.id)
    || String(state.user.email || '').toLowerCase() === 'contentsdalur@gmail.com');
  $('#signOut').hidden = !state.user;
  $('#who').textContent = known ? (state.user.email || '관리자')
    : state.user ? '권한 없는 계정' : '로그인 필요';
  if (known) open(); else { $('#gate').hidden = false; $('#dist').hidden = true; }
}

function open() { $('#gate').hidden = true; $('#dist').hidden = false; load(); }

/* ── 자료 ────────────────────────────────────────────────────────────────── */
async function load() {
  const notice = $('#notice');
  try {
    const res = await fetchFirst(INDEX_URL);
    if (!res || res.status === 404) {
      // §143 — 없는 것을 빈 화면으로 두지 않는다. 무엇이 없는지 말한다.
      notice.className = 'dist-notice err';
      notice.innerHTML = '후보 색인이 아직 없습니다. '
        + '<code>aws/distribution/handler.py</code> 를 한 번 실행하면 만들어집니다.';
      return;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    state.index = await res.json();
  } catch (e) {
    notice.className = 'dist-notice err';
    notice.textContent = `후보 색인을 읽지 못했습니다: ${e.message}`;
    return;
  }
  notice.className = 'dist-notice';
  notice.textContent = state.index?.note?.ko || '';
  paintSummary();
  fillFilters();
  render();
}

/* ── §30 · §154 요약 ─────────────────────────────────────────────────────── */
function paintSummary() {
  const s = state.index.summary || {};
  const byE = s.byEligibility || {};
  const byS = s.byStatus || {};
  const rows = [
    ['초안', byS.DRAFT || 0], ['검토', byS.REVIEW || 0], ['승인', byS.APPROVED || 0],
    ['예약', byS.SCHEDULED || 0], ['발행', byS.PUBLISHED || 0],
    ['자격 있음', byE.ELIGIBLE || 0], ['차단', byE.BLOCKED || 0],
  ];
  $('#counts').innerHTML = rows.map(([k, v]) =>
    `<li class="${v ? '' : 'zero'}"><b>${v}</b><span>${esc(k)}</span></li>`).join('');
  const cov = state.index.coverage || {};
  const probs = (cov.problems || []).length;
  $('#meta').innerHTML = [
    `생성 ${esc(state.index.generated || '?')}`,
    `엔진 ${esc(state.index.generatorVersion || '?')}`,
    `원자료 사건 ${cov.labReports ?? '—'}건 · 채점일 ${cov.verifyDays ?? '—'}일`,
    probs ? `<span class="tag bad">자료 문제 ${probs}건</span>` : '',
  ].filter(Boolean).join(' · ');
}

function fillFilters() {
  const items = state.index.items || [];
  const put = (sel, values, label) => {
    const el = $(sel);
    el.innerHTML = `<option value="">${label}</option>`
      + [...new Set(values)].filter(Boolean).sort()
        .map((v) => `<option value="${esc(v)}">${esc(TYPE_KO[v] || (ELIG_KO[v] || [])[0] || v)}</option>`).join('');
  };
  put('#fType', items.map((i) => i.type), '유형 전체');
  put('#fElig', items.map((i) => i.eligibility), '자격 전체');
  put('#fPriority', items.map((i) => i.priority), '우선순위 전체');
  put('#fPhenomenon', items.flatMap((i) => i.phenomenonIds || []), '현상 전체');
}

/* ── §86 · §87 필터 ──────────────────────────────────────────────────────── */
function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const t = $('#fType').value, e = $('#fElig').value;
  const p = $('#fPriority').value, ph = $('#fPhenomenon').value;
  return (state.index.items || []).filter((i) => {
    if (t && i.type !== t) return false;
    if (e && i.eligibility !== e) return false;
    if (p && i.priority !== p) return false;
    if (ph && !(i.phenomenonIds || []).includes(ph)) return false;
    if (!q) return true;
    const hay = [i.contentId, i.title, ...(i.eventIds || []), ...(i.phenomenonIds || []),
      ...(i.reportIds || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/* ── §152 목록 ───────────────────────────────────────────────────────────── */
function render() {
  $$('.dist-view').forEach((v) => { v.hidden = v.id !== `view-${state.view}`; });
  $('#filters').hidden = state.view !== 'list';
  if (state.view === 'list') return renderList();
  if (state.view === 'calendar') return renderCalendar();
  if (state.view === 'queue') return renderQueue();
  if (state.view === 'analytics') return renderAnalytics();
  if (state.view === 'channels') return renderChannels();
}

function renderList() {
  const items = filtered();
  $('#listEmpty').hidden = items.length > 0;
  if (!items.length) {
    $('#listEmpty').textContent = (state.index.items || []).length
      ? '조건에 맞는 콘텐츠가 없습니다.'
      : '후보가 없습니다. 오늘 갱신된 사건이 없으면 후보를 만들지 않습니다.';
  }
  $('#rows').innerHTML = items.map((i) => {
    if (i.failed) {
      return `<tr data-id="${esc(i.contentId)}"><td>${tag('생성 실패', 'bad')}</td>
        <td class="mut">—</td><td class="t">${esc(i.title || i.contentId)}
        <span class="dist-sub">${esc(i.error || '')}</span></td>
        <td colspan="5" class="mut">—</td></tr>`;
    }
    const [ek, ec] = ELIG_KO[i.eligibility] || [i.eligibility, 'mut'];
    const [ck, cc] = CONF_KO[i.confidence] || [i.confidence, 'mut'];
    const blocks = (i.blockReasons || []).map((b) => tag(BLOCK_KO[b] || b, 'bad')).join('');
    return `<tr data-id="${esc(i.contentId)}">
      <td>${tag(ek, ec)}${blocks}</td>
      <td>${esc(TYPE_KO[i.type] || i.type)}<span class="dist-sub">${esc(i.priority || '')}</span></td>
      <td class="t">${esc(i.title || i.contentId)}<span class="dist-sub">${esc(i.contentId)}</span></td>
      <td>${(i.eventIds || []).map((x) => tag(x)).join('')
        || (i.reportIds || []).map((x) => tag(x)).join('')}
        <span class="dist-sub">${esc((i.phenomenonIds || []).join(' · ') || '현상 없음')}</span></td>
      <td>${(i.platforms || []).map((x) => tag(x)).join('') || tag('없음', 'mut')}</td>
      <td>${tag(ck, cc)}</td>
      <td>${i.validation === 'PASSED' ? tag('통과', 'ok')
        : tag(`실패 ${i.problemCount || ''}`, 'bad')}</td>
      <td class="mut">아직 안 올림</td>
    </tr>`;
  }).join('');
  $$('#rows tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
}

/* ── §31 · §32 · §97 상세 ────────────────────────────────────────────────── */
async function openDetail(id) {
  const dlg = $('#detail');
  $('#dTitle').textContent = id;
  $('#dBody').innerHTML = '<p class="mut">불러오는 중…</p>';
  dlg.showModal();
  let c = state.bodies.get(id);
  if (!c) {
    try {
      const res = await fetchFirst((b) => BODY_URL(b, id));
      if (!res || !res.ok) throw new Error(`${res ? res.status : '연결 실패'}`);
      c = await res.json();
      state.bodies.set(id, c);
    } catch (e) {
      $('#dBody').innerHTML = `<p class="dist-problem">본문을 읽지 못했습니다: ${esc(e.message)}</p>`;
      return;
    }
  }
  $('#dTitle').textContent = c.title || id;
  $('#dBody').innerHTML = detailHtml(c);
  wireDetail(c);
}

function detailHtml(c) {
  const v = c.validation || {};
  const chain = c.provenanceChain || {};
  const [ek, ec] = ELIG_KO[c.eligibility] || [c.eligibility, 'mut'];
  const [ck, cc] = CONF_KO[c.confidence] || [c.confidence, 'mut'];
  const kv = (rows) => `<table class="dist-kv"><tbody>${rows
    .map(([k, val]) => `<tr><th>${esc(k)}</th><td>${val}</td></tr>`).join('')}</tbody></table>`;

  const platforms = Object.keys(c.platformVersions || {});
  const el = c.eligibilityDetail || {};

  return `
  <h4>개요</h4>
  ${kv([
    ['콘텐츠 ID', esc(c.contentId) + ` (판 ${c.version || 1})`],
    ['유형', esc(TYPE_KO[c.type] || c.type)],
    ['상태', esc(c.status)],
    ['자격', tag(ek, ec) + (c.blockReasons || []).map((b) => tag(BLOCK_KO[b] || b, 'bad')).join('')],
    ['우선순위', esc(c.priority) + (el.reason ? `<span class="dist-sub">${esc(el.reason)}</span>` : '')],
    ['안전등급', esc(c.safetyLevel) + (c.safetyReason ? `<span class="dist-sub">${esc(c.safetyReason)}</span>` : '')],
    ['신뢰도', tag(ck, cc) + (c.confidenceReason || []).map((r) => `<span class="dist-sub">${esc(r)}</span>`).join('')],
    ['사건 시각', esc(c.eventTime || '— (출처가 사건 시각을 주지 않았다)')],
    ['관측/추적 기간', esc(`${(c.observationPeriod || {}).from || '?'} ~ ${(c.observationPeriod || {}).to || '?'}`)
      + (c.observationPeriodKind === 'TRACKING' ? '<span class="dist-sub">EARTHUS 가 지켜본 기간이다. 사건이 지속된 기간이 아니다.</span>' : '')],
    ['장소', esc(c.location || '—')],
  ])}

  <h4>문장 — 관측 · 분석 · 해석</h4>
  ${(c.claims || []).map((x) => `<div class="dist-claim ${esc(x.type)}">${esc(x.text)}
    <em>${esc(x.type)}${x.factId ? ` · ${esc(x.factId)}` : ''} · 출처 ${esc((x.sourceRefs || []).join(', ') || '없음')}</em></div>`).join('')
    || '<p class="mut">문장이 없습니다.</p>'}

  <h4>검증</h4>
  ${v.status === 'PASSED'
    ? `<p>${tag('통과', 'ok')} 숫자 풀 ${v.numericPoolSize || 0}개 · ${esc(v.validator || '')}</p>`
    : `<p>${tag('실패', 'bad')} ${esc(v.validator || '')}</p>`
      + (v.problems || []).map((p) => `<p class="dist-problem">${esc(p.code)}: ${esc(p.message)}${p.where ? ` (${esc(p.where)})` : ''}</p>`).join('')}
  ${(v.warnings || []).map((p) => `<p class="mut">경고 ${esc(p.code)}: ${esc(p.message)}</p>`).join('')}

  <h4>출처 — 이 문장은 어디서 왔나</h4>
  ${kv([
    ['자료 스냅샷', esc(c.dataSnapshotId || '—')],
    ['생성기', esc(c.generatorVersion || '—')],
    ['현상', (c.phenomenonIds || []).map((x) => tag(x)).join('') || tag('없음', 'mut')],
    ['사건', (c.eventIds || []).map((x) => tag(x)).join('') || tag('없음', 'mut')],
    ['리포트', (c.reportIds || []).map((x) => tag(x)).join('') || tag('없음', 'mut')],
    ['사슬', chain.chainComplete ? tag('완전', 'ok')
      : (chain.brokenLinks || []).map((b) => `<div class="dist-problem">${esc(b)}</div>`).join('') || tag('확인 안 됨', 'mut')],
  ])}
  ${(chain.datasets || []).map((d) => `<div class="dist-claim">${esc(d.ref)}
    <em>${esc(d.provider || '출처를 풀 수 없다')} · ${esc(d.truthType || '')} · ${esc(d.license || '')}</em></div>`).join('')}

  <h4>플랫폼 판 — 미리보기</h4>
  <div class="dist-plat" id="platRow">
    ${platforms.map((p, i) => `<button type="button" data-p="${esc(p)}" class="${i === 0 ? 'on' : ''}">${esc(p)}</button>`).join('')
      || '<span class="mut">만들어진 플랫폼 판이 없습니다.</span>'}
  </div>
  ${Object.entries(c.platformProblems || {}).map(([k, m]) =>
    `<p class="dist-problem">${esc(k)} 판을 만들지 못했다: ${esc(m)}</p>`).join('')}
  <pre class="dist-pre" id="platText"></pre>
  <p class="mut" id="platMeta"></p>

  <h4>다음 단계</h4>
  <p class="mut">이 화면에는 게시 버튼이 없습니다. 자격증명은 관리자 Edge Function 에만 있고,
     게시는 콘텐츠 스튜디오에서 사람이 확인하고 누릅니다.</p>
  <div class="dist-actions">
    ${c.link ? `<a class="button button-quiet button-small" href="${esc(c.link)}" target="_blank" rel="noopener">지구에서 근거 보기</a>` : ''}
    <a class="button button-quiet button-small" href="./studio.html#social">스튜디오에서 게시</a>
    <button class="button button-quiet button-small" id="copyText" type="button">본문 복사</button>
  </div>`;
}

function wireDetail(c) {
  const versions = c.platformVersions || {};
  const show = (p) => {
    const pv = versions[p];
    $('#platText').textContent = pv ? pv.text : '';
    const limit = pv ? pv.limit : 0;
    const over = pv && pv.textLength > limit;
    $('#platMeta').innerHTML = pv
      ? `${pv.format} · ${pv.textLength}/${limit}자 ${over ? tag('한도 초과', 'bad') : tag('한도 안', 'ok')}`
        + (pv.mediaRequired ? ' · ' + tag('사진/영상 필요', 'warn') : '')
        + ((pv.visualProblems || []).length
          ? ' · ' + tag(`카드 사양 미완 ${pv.visualProblems.length}`, 'warn') : '')
      : '';
    $$('#platRow button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
  };
  $$('#platRow button').forEach((b) => b.addEventListener('click', () => show(b.dataset.p)));
  const first = Object.keys(versions)[0];
  if (first) show(first);
  $('#copyText')?.addEventListener('click', async () => {
    const t = $('#platText').textContent;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); $('#copyText').textContent = '복사됨'; }
    catch { $('#copyText').textContent = '복사 실패 — 직접 선택하세요'; }
  });
}

/* ── §131 달력 ───────────────────────────────────────────────────────────── */
function renderCalendar() {
  const items = state.index.items || [];
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const pad = first.getUTCDay();
  const byDay = new Map();
  for (const i of items) {
    const d = (i.eventTime || i.generatedAt || '').slice(0, 10);
    if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  }
  const today = new Date().toISOString().slice(0, 10);
  const cells = ['일', '월', '화', '수', '목', '금', '토'].map((h) => `<div class="h">${h}</div>`);
  for (let i = 0; i < pad; i += 1) cells.push('<div></div>');
  for (let d = 1; d <= days; d += 1) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const list = byDay.get(key) || [];
    cells.push(`<div class="d ${key === today ? 'today' : ''}"><b>${d}</b>${
      list.slice(0, 3).map((i) => `<span class="i" title="${esc(i.title || '')}">${
        esc(TYPE_KO[i.type] || i.type)}</span>`).join('')
    }${list.length > 3 ? `<span class="i">+${list.length - 3}</span>` : ''}</div>`);
  }
  $('#view-calendar').innerHTML =
    `<p class="mut">사건 시각(없으면 생성 시각) 기준입니다. 예약 발행은 아직 없습니다 — 사람이 스튜디오에서 올립니다.</p>
     <div class="cal">${cells.join('')}</div>`;
}

/* ── §28 발행 큐 ─────────────────────────────────────────────────────────── */
function renderQueue() {
  const sch = state.index.schedules || {};
  $('#view-queue').innerHTML = `
    <p class="mut">발행 큐는 <b>승인된 콘텐츠</b>만 받습니다. 지금은 승인된 것이 없어 비어 있습니다.
       자동 게시 경로를 만들지 않았습니다 — 화면의 오류는 고치면 되지만 게시물은 이미 퍼집니다.</p>
    <h4 style="margin-top:18px">생성 일정 (게시 일정이 아닙니다)</h4>
    <div class="dist-scroll"><table class="dist-table"><thead><tr>
      <th>콘텐츠 유형</th><th>주기</th><th>cron (UTC)</th><th>비고</th></tr></thead><tbody>
      ${Object.entries(sch).map(([k, v]) => `<tr><td>${esc(TYPE_KO[k] || k)}</td>
        <td>${esc(v.cadence)}</td><td>${esc(v.cron)}</td><td class="mut">${esc(v.note || '')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="mut">일정 설정이 색인에 없습니다.</td></tr>'}
    </tbody></table></div>
    <h4 style="margin-top:18px">플랫폼 속도 제한</h4>
    ${rateLimitHtml()}
    <h4 style="margin-top:18px">예약 방출</h4>
    <p class="mut">승인된 콘텐츠 중 예약 시각이 지난 것만 큐로 넘깁니다.
       초안은 방출하지 않습니다. 중복 방출은 멱등키로 막습니다.</p>`;
}

/* ── SNS FACTORY: 상한 표시 (추가. 없는 값은 만들지 않는다) ─────────────── */
function rateLimitHtml() {
  const limits = state.index.rateLimits;
  if (!limits || !Object.keys(limits).length) {
    return '<p class="mut">설정된 상한이 없습니다. 상한을 모르는 플랫폼은 강제하지 않습니다.</p>';
  }
  return `<div class="dist-scroll"><table class="dist-table"><thead><tr>
    <th>플랫폼</th><th>판정</th><th>남은 자리</th><th>다음 확인</th></tr></thead><tbody>
    ${Object.entries(limits).map(([k, v]) => `<tr><td>${esc(k)}</td>
      <td>${esc((v.decision || ''))}</td>
      <td>${esc(String(v.remaining ?? '—'))}</td>
      <td class="mut">${esc(v.retryAfterAt || v.resetAt || '—')}</td></tr>`).join('')}
  </tbody></table></div>`;
}

/* ── §33 · §34 성과 ──────────────────────────────────────────────────────── */
function renderAnalytics() {
  const caps = state.index.adapters || {};
  $('#view-analytics').innerHTML = `
    <p class="mut">아직 발행한 게시물이 없어 성과 자료가 없습니다.
       <b>없는 지표를 0 으로 채우지 않습니다</b> — 플랫폼이 주지 않는 지표는 아래처럼 표시됩니다.</p>
    <div class="dist-scroll"><table class="dist-table"><thead><tr>
      <th>플랫폼</th><th>받을 수 있는 지표</th><th>이 플랫폼이 주지 않는 지표</th></tr></thead><tbody>
      ${Object.entries(caps).map(([k, v]) => `<tr><td>${esc(k)}</td>
        <td>${(v.metrics || []).map((m) => tag(m, 'ok')).join('')}</td>
        <td>${(v.unavailableMetrics || []).map((m) => tag(`${m} · 없음`, 'mut')).join('')}</td></tr>`).join('')}
    </tbody></table></div>
    ${lastFetchedHtml()}`;
}

/* ── SNS FACTORY: 마지막 수집 표시 (추가. 수집 실패를 발행 실패로 보지 않는다) */
function lastFetchedHtml() {
  const s = state.index.analyticsSummary;
  if (!s || !s.total) {
    return '<p class="mut" style="margin-top:12px">수집된 성과가 없습니다. 마지막 수집: —</p>';
  }
  const by = Object.entries(s.byStatus || {}).map(([k, v]) => `${esc(k)} ${v}건`).join(' · ');
  return `<p class="mut" style="margin-top:12px">수집 ${s.total}건 (${by}) · 마지막 수집: ${esc(s.lastFetchedAt || '—')}</p>`;
}

/* ── §143 채널 상태 ──────────────────────────────────────────────────────── */
function renderChannels() {
  const caps = state.index.adapters || {};
  $('#view-channels').innerHTML = `
    <p class="mut">자격증명은 관리자 Edge Function(<code>social-admin</code>)의 암호화 볼트에만 있습니다.
       이 화면은 자격증명을 읽지 않습니다 — 연결 상태는
       <a href="./social-settings.html">SNS 연결 관리</a>에서 확인하세요.</p>
    <div class="dist-scroll"><table class="dist-table"><thead><tr>
      <th>플랫폼</th><th>받는 형식</th><th>사진/영상</th><th>지시서 §15 기본</th><th>실제 게시 경로</th>
    </tr></thead><tbody>
      ${Object.entries(caps).map(([k, v]) => `<tr>
        <td>${esc(k)}</td>
        <td>${(v.formats || []).map((f) => tag(f)).join('')}</td>
        <td>${v.mediaRequired ? tag('필수', 'warn') : tag('선택', 'mut')}</td>
        <td>${v.primary ? tag('기본 5종', 'ok') : tag('추가', 'mut')}</td>
        <td class="mut">studio.html → social-admin</td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ── 배선 ────────────────────────────────────────────────────────────────── */
$$('.dist-tab').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  $$('.dist-tab').forEach((x) => {
    x.classList.toggle('active', x === b);
    x.setAttribute('aria-selected', String(x === b));
  });
  render();
}));
$('#filters').addEventListener('input', () => { if (state.view === 'list') renderList(); });
$('#filters').addEventListener('reset', () => setTimeout(renderList, 0));
$('#dClose').addEventListener('click', () => $('#detail').close());
$('#signInGoogle').addEventListener('click', () => state.client?.auth.signInWithOAuth({
  provider: 'google', options: { redirectTo: location.href },
}));
$('#signOut').addEventListener('click', async () => { await state.client?.auth.signOut(); location.reload(); });

bootAuth();

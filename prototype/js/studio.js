/* earthus 콘텐츠 스튜디오
 *
 * ⚠️⚠️ 이 파일에는 SNS 게시 API가 없다. 초안 확인, 파일 생성, 복사, 공유창 열기까지만 한다.
 *    자동 게시 금지 원칙은 기능 하나가 아니라 이 화면의 보안 경계다.
 *
 * ⚠️⚠️ 관리자가 아니면 ADMIN_UIDS가 비었을 때도 열리면 안 된다.
 *    `length === 0 || includes(...)`로 바꾸지 말 것. 빈 목록은 전원 차단이 정상이다.
 */

import { CONFIG } from './config.local.js';
import { refreshSocialAdmin, setupSocialAdmin, uploadSocialFile } from './studio-social.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const CHANNELS = {
  x: { label: 'X', limit: 280 },
  threads: { label: '스레드', limit: 500 },
  instagram: { label: '인스타그램', limit: 2200 },
  facebook: { label: '페이스북', limit: 2000 },
};

/* ⚠️ 규격은 여기 한 곳만 고친다. 목록과 실제 캔버스 값이 어긋나면
   화면에는 1080×1350이라고 쓰고 다른 크기의 파일이 떨어지는 사고가 난다. */
const FORMATS = {
  portrait: { width: 1080, height: 1350, label: '세로 4:5' },
  square: { width: 1080, height: 1080, label: '정사각 1:1' },
  x: { width: 1600, height: 900, label: '가로 16:9' },
};

const DB_NAME = 'earthus-content-studio';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';
const POSTED_KEY = 'earthus-studio-posted-v1';
/* 로컬 레이아웃 검증용이다. 운영 도메인에서는 같은 주소를 붙여도 절대 열리지 않는다. */
const LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

const state = {
  client: null,
  user: null,
  known: false,
  draftsLoaded: false,
  draftController: null,
  draftDoc: null,
  drafts: [],
  draftDiagnostics: [],
  draftRawCount: 0,
  selectedDraft: null,
  activeChannel: 'x',
  shareChannel: 'x',
  format: 'portrait',
  rows: [],
  cardDraftId: null,
  cardDirty: false,
  cardTimeLabel: '관측·발표',
  cardBackground: null,
  captureWindow: null,
  frames: [],
  frameUrls: [],
  reelJob: null,
  logo: null,
  library: [],
  libraryUrls: [],
  pendingFiles: [],
  posted: readPostedLedger(),
  db: null,
};

let toastTimer = null;
let cardRenderQueued = false;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function readPostedLedger() {
  try {
    const value = JSON.parse(localStorage.getItem(POSTED_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

function savePostedLedger() {
  try {
    localStorage.setItem(POSTED_KEY, JSON.stringify(state.posted));
  } catch (_) {
    throw new Error('이 브라우저에 게시 기록을 저장하지 못했습니다.');
  }
}

function create(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function valueOrMissing(value, suffix = '') {
  return value == null || value === '' ? '자료 없음' : `${value}${suffix}`;
}

function parseStudioDate(value) {
  if (!value) return null;
  const text = String(value);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const normalized = hasZone ? text : `${text}${text.length === 16 ? ':00' : ''}+09:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withSeconds = false) {
  if (!value) return '시각 없음';
  const date = parseStudioDate(value);
  if (!date) return String(value);
  const text = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
  return `${text} KST`;
}

function formatCompactDate(value) {
  const date = parseStudioDate(value);
  if (!date) return '';
  return `${new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }).format(date)} KST`;
}

function toDateInput(value) {
  if (!value) return '';
  const date = parseStudioDate(value);
  if (!date) return '';
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function coordinateText(lat, lon) {
  const y = Number(lat), x = Number(lon);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return '';
  const latText = `${Math.abs(y).toFixed(1)}°${y < 0 ? 'S' : 'N'}`;
  const lonText = `${Math.abs(x).toFixed(1)}°${x < 0 ? 'W' : 'E'}`;
  return `${latText}, ${lonText}`;
}

function latestAgencyIssue(agencies) {
  return (Array.isArray(agencies) ? agencies : [])
    .map(agency => agency?.issue)
    .filter(Boolean)
    .sort((a, b) => (parseStudioDate(b)?.getTime() || 0) - (parseStudioDate(a)?.getTime() || 0))[0] || null;
}

function safeFilePart(value) {
  return String(value || 'earthus')
    .trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'earthus';
}

function activeDraftForCard() {
  return state.drafts.find(d => d.id === state.cardDraftId) || null;
}

function mergedPosted(draft) {
  const merged = {};
  const stormKey = draft?.storm || draft?.facts?.key;
  /* stable ID 도입 전 기록은 STORM-YYYYMMDDHHMM 키였다. 현재 초안과 정확히
     같지 않아도 같은 태풍을 올린 이력은 먼저 경고해 전환 직후 중복을 막는다. */
  if (stormKey) {
    Object.entries(state.posted).forEach(([id, entries]) => {
      const prefix = `${stormKey}-`;
      const legacySuffix = id.startsWith(prefix) ? id.slice(prefix.length) : '';
      if (id !== draft?.id && /^\d{12}$/.test(legacySuffix)) Object.assign(merged, entries || {});
    });
  }
  return { ...merged, ...(draft?.posted || {}), ...(state.posted[draft?.id] || {}) };
}

function postedEntries(draft) {
  return Object.entries(mergedPosted(draft)).filter(([, value]) => value);
}

function kindLabel(kind) {
  return kind === 'downgrade' ? '약화' : kind === 'update' ? '갱신' : kind || '초안';
}

function activateTab(tab) {
  if (!$$('.rail-tab').some(button => button.dataset.tab === tab)) return;
  $$('.rail-tab').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$('.panel').forEach(panel => {
    const active = panel.dataset.panel === tab;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  if (tab === 'library') renderLibrary();
  if (tab === 'reels') updateReelReadiness();
  if (tab === 'social') refreshSocialAdmin();
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

async function bootAuth() {
  const gateMessage = $('#gateMessage');
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    $('#who').textContent = '인증 설정 없음';
    gateMessage.textContent = 'Supabase 설정이 없어 관리자 권한을 확인할 수 없습니다.';
    $('#signInGoogle').disabled = true;
    return;
  }

  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    state.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    state.user = data?.session?.user || null;
    state.client.auth.onAuthStateChange((_event, session) => {
      state.user = session?.user || null;
      paintGate();
    });
    paintGate();
  } catch (error) {
    $('#who').textContent = '권한 확인 실패';
    gateMessage.textContent = `로그인 상태를 확인하지 못했습니다. ${error.message}`;
  }
}

async function paintGate() {
  const uids = CONFIG.ADMIN_UIDS || [];
  const wasKnown = state.known;
  state.known = LOCAL_PREVIEW || (!!state.user && uids.includes(state.user.id));
  $('#signOut').hidden = !state.user;

  if (wasKnown && !state.known) clearAuthorizedSession();
  if (LOCAL_PREVIEW) {
    $('#who').textContent = '로컬 화면 미리보기';
    $('#gate').hidden = true;
    $('#studio').hidden = false;
    if (!state.draftsLoaded) await loadDrafts();
    await loadLibrary();
    return;
  }

  if (!state.user) {
    $('#who').textContent = '로그인하지 않음';
    $('#gate').hidden = false;
    $('#studio').hidden = true;
    $('#gateMessage').textContent = 'earthus 관리자 계정으로 로그인해야 스튜디오가 열립니다.';
    return;
  }

  $('#who').textContent = state.known ? '관리자 확인됨' : '관리자 목록에 없는 계정';
  if (!state.known) {
    $('#gate').hidden = false;
    $('#studio').hidden = true;
    $('#gateMessage').textContent = uids.length
      ? '이 계정은 관리자 목록에 없습니다. 다른 관리자 계정으로 로그인하세요.'
      : '관리자 목록이 비어 있어 모든 계정을 차단했습니다. config.local.js를 확인하세요.';
    return;
  }

  $('#gate').hidden = true;
  $('#studio').hidden = false;
  if (!state.draftsLoaded) await loadDrafts();
  await loadLibrary();
  if (!$('#panel-social').hidden) await refreshSocialAdmin();
}

function clearAuthorizedSession() {
  state.draftController?.abort();
  state.draftsLoaded = false;
  if (state.reelJob) state.reelJob.cancelled = true;
  clearFrameUrls();
  clearLibraryUrls();
  state.draftDoc = null;
  state.drafts = [];
  state.draftDiagnostics = [];
  state.draftRawCount = 0;
  state.selectedDraft = null;
  state.frames = [];
  state.library = [];
  state.captureWindow = null;
  state.cardDraftId = null;
  state.cardBackground = null;
  state.cardDirty = false;
  $('#draftList').innerHTML = '';
  $('#draftDetail').innerHTML = '';
  $('#frameGrid').innerHTML = '';
  $('#libraryGrid').innerHTML = '';
}

function normalizeDraftDocument(doc) {
  const diagnostics = [];
  const drafts = [];
  const ids = new Set();
  let rejected = 0;

  if (doc.count != null && Number(doc.count) !== doc.drafts.length) {
    diagnostics.push(`문서의 count ${doc.count}건과 실제 배열 ${doc.drafts.length}건이 다릅니다.`);
  }
  if (typeof doc.source !== 'string' || !doc.source.trim()) {
    diagnostics.push('문서 출처가 비어 있어 카드 제작 시 직접 입력해야 합니다.');
  }
  if (doc.generated && !parseStudioDate(doc.generated)) diagnostics.push('문서 생성 시각 형식을 읽을 수 없습니다.');

  doc.drafts.forEach((raw, index) => {
    const number = index + 1;
    if (!isRecord(raw)) {
      rejected += 1;
      diagnostics.push(`${number}번째 초안은 객체가 아니어서 제외했습니다.`);
      return;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = isRecord(raw.card) && typeof raw.card.title === 'string' ? raw.card.title.trim() : '';
    const validAt = parseStudioDate(raw.at);
    if (!id || !title || !validAt) {
      rejected += 1;
      const missing = [!id && 'ID', !title && '제목', !validAt && '시각'].filter(Boolean).join('·');
      diagnostics.push(`${number}번째 초안은 ${missing} 자료가 없어 제외했습니다.`);
      return;
    }
    if (ids.has(id)) {
      rejected += 1;
      diagnostics.push(`${id} 초안 ID가 중복되어 뒤 항목을 제외했습니다.`);
      return;
    }
    ids.add(id);

    const rawFacts = isRecord(raw.facts) ? raw.facts : {};
    const rawAgencies = Array.isArray(rawFacts.agencies) ? rawFacts.agencies : [];
    const agencies = rawAgencies.filter(isRecord).map(agency => ({
      ...agency,
      track: Array.isArray(agency.track) ? agency.track.filter(isRecord) : [],
    }));
    if (rawAgencies.length !== agencies.length) {
      diagnostics.push(`${id}의 기관 자료 ${rawAgencies.length - agencies.length}건을 형식 오류로 제외했습니다.`);
    }
    const cardRows = Array.isArray(raw.card.rows) ? raw.card.rows.filter(isRecord) : [];
    const text = isRecord(raw.text)
      ? Object.fromEntries(Object.keys(CHANNELS).flatMap(key => (
        typeof raw.text[key] === 'string' ? [[key, raw.text[key]]] : []
      )))
      : {};
    if (!Object.keys(text).length) diagnostics.push(`${id}에는 사용할 수 있는 채널 문구가 없습니다.`);

    drafts.push({
      ...raw,
      id,
      facts: { ...rawFacts, agencies },
      card: { ...raw.card, title, rows: cardRows },
      text,
      posted: isRecord(raw.posted) ? raw.posted : {},
    });
  });

  drafts.sort((a, b) => (parseStudioDate(b.at)?.getTime() || 0) - (parseStudioDate(a.at)?.getTime() || 0));
  return { drafts, diagnostics, rejected };
}

async function loadDrafts() {
  const list = $('#draftList');
  state.draftController?.abort();
  const controller = new AbortController();
  state.draftController = controller;
  state.draftsLoaded = true;
  list.innerHTML = '<div class="skeleton-list" aria-label="초안 불러오는 중"><i></i><i></i><i></i></div>';
  $('#draftCount').textContent = '불러오는 중';
  try {
    const response = await fetch(`/events/social-drafts.json?t=${Date.now()}`, {
      cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const doc = await response.json();
    if (!isRecord(doc) || !Array.isArray(doc.drafts)) throw new Error('drafts 배열이 없습니다');
    const normalized = normalizeDraftDocument(doc);
    const selectedId = state.selectedDraft?.id;
    state.draftDoc = {
      ...doc,
      source: typeof doc.source === 'string' ? doc.source : '',
      generated: typeof doc.generated === 'string' ? doc.generated : null,
    };
    state.drafts = normalized.drafts;
    state.draftDiagnostics = normalized.diagnostics;
    state.draftRawCount = doc.drafts.length;
    state.selectedDraft = state.drafts.find(draft => draft.id === selectedId) || null;
    $('#draftCount').textContent = normalized.rejected
      ? `${state.drafts.length}건 · 제외 ${normalized.rejected}건`
      : `${state.drafts.length}건`;
    renderDraftList();
    if (state.drafts.length && !state.selectedDraft) selectDraft(state.drafts[0]);
    if (!state.drafts.length) {
      $('#draftDetail').innerHTML = '<div class="empty-state"><strong>현재 초안이 없습니다.</strong><p>자료가 없다는 상태를 그대로 표시합니다. 자동으로 문구를 만들지 않습니다.</p></div>';
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.drafts = [];
    state.draftDiagnostics = [];
    state.draftRawCount = 0;
    state.selectedDraft = null;
    $('#draftCount').textContent = '읽기 실패';
    list.innerHTML = '';
    const box = create('div', 'error-state');
    box.append('초안을 읽지 못했습니다. ', error.message);
    list.append(box);
    $('#draftDetail').innerHTML = '<div class="empty-state"><strong>초안 자료를 확인할 수 없습니다.</strong><p>0건과 읽기 실패를 같은 상태로 보여주지 않습니다.</p></div>';
  } finally {
    if (state.draftController === controller) state.draftController = null;
  }
}

function renderDraftList() {
  const list = $('#draftList');
  list.innerHTML = '';
  if (state.draftDiagnostics.length) {
    const warning = create('div', 'data-warning');
    warning.append(create('strong', '', '원자료 확인 필요'));
    warning.append(document.createElement('br'));
    warning.append(state.draftDiagnostics.join(' '));
    list.append(warning);
  }
  if (!state.drafts.length) {
    const empty = create('div', 'empty-state compact');
    empty.append(create('strong', '', '표시할 초안이 없습니다.'));
    empty.append(create('p', '', state.draftDiagnostics.length
      ? '원자료 오류를 확인한 뒤 다시 불러오세요.'
      : '새 초안이 생길 때까지 비워 둡니다.'));
    list.append(empty);
    return;
  }

  state.drafts.forEach(draft => {
    const button = create('button', 'draft-item');
    button.type = 'button';
    button.classList.toggle('active', draft.id === state.selectedDraft?.id);
    const top = create('div', 'draft-item-top');
    top.append(create('strong', '', draft.name || draft.storm || '이름 없음'));
    top.append(create('span', `kind ${draft.kind === 'downgrade' ? 'downgrade' : ''}`, kindLabel(draft.kind)));
    button.append(top);
    button.append(create('p', '', draft.card?.title || '제목 자료 없음'));
    if (postedEntries(draft).length) button.append(create('span', 'draft-alert', '올린 적 있음'));
    const time = create('time', '', formatDate(draft.at));
    if (draft.at) time.dateTime = draft.at;
    button.append(time);
    button.addEventListener('click', () => selectDraft(draft));
    list.append(button);
  });
}

function selectDraft(draft) {
  state.selectedDraft = draft;
  state.activeChannel = Object.keys(CHANNELS).find(key => draft.text?.[key]) || 'x';
  renderDraftList();
  renderDraftDetail();
}

function renderDraftDetail() {
  const draft = state.selectedDraft;
  const detail = $('#draftDetail');
  detail.innerHTML = '';
  if (!draft) return;

  const titleRow = create('div', 'draft-title-row');
  const titleBox = create('div');
  titleBox.append(create('h3', '', draft.card?.title || draft.name || '제목 자료 없음'));
  titleBox.append(create('p', '', draft.card?.sub || draft.facts?.place || '위치 설명 자료 없음'));
  titleRow.append(titleBox);
  titleRow.append(create('span', `kind ${draft.kind === 'downgrade' ? 'downgrade' : ''}`, kindLabel(draft.kind)));
  detail.append(titleRow);

  const posted = postedEntries(draft);
  if (posted.length) {
    const banner = create('div', 'posted-banner');
    banner.append(create('strong', '', '올린 적 있음. 중복 게시를 확인하세요.'));
    banner.append(create('span', '', posted.map(([key, value]) => {
      const at = typeof value === 'object' ? value.at : null;
      return `${CHANNELS[key]?.label || key}${at ? ` ${formatDate(at)}` : ''}`;
    }).join(' / ')));
    detail.append(banner);
  }

  const facts = draft.facts || {};
  const summary = create('div', 'fact-summary');
  const cells = [
    ['현재 위치', valueOrMissing(facts.place)],
    ['중심 최대풍속', valueOrMissing(facts.windMs, facts.windMs == null ? '' : 'm/s')],
    ['중심 기압', valueOrMissing(facts.hpa, facts.hpa == null ? '' : 'hPa')],
    ['기관 수', Array.isArray(facts.agencies) ? `${facts.agencies.length}곳` : '자료 없음'],
    ['최근 기관 발표', latestAgencyIssue(facts.agencies) ? formatDate(latestAgencyIssue(facts.agencies)) : '자료 없음'],
  ];
  cells.forEach(([label, value]) => {
    const cell = create('div', 'fact-cell');
    cell.append(create('span', '', label), create('strong', '', value));
    summary.append(cell);
  });
  detail.append(summary);

  const disclosure = create('details', 'facts');
  const summaryButton = create('summary', '', '기관별 근거 펼쳐 보기');
  disclosure.append(summaryButton);
  const agencies = create('div', 'agency-list');
  if (!Array.isArray(facts.agencies) || !facts.agencies.length) {
    agencies.append(create('div', 'error-state', '기관별 근거 자료가 없습니다.'));
  } else {
    facts.agencies.forEach(agency => {
      const row = create('div', 'agency');
      row.append(create('strong', '', agency.ko || agency.id || '기관 이름 없음'));
      const track = Array.isArray(agency.track) ? agency.track : [];
      const current = track.find(point => Number(point.h) === 0) || track[0] || null;
      const last = track[track.length - 1] || null;
      const bits = [
        agency.issue ? `발표 ${formatDate(agency.issue)}` : '발표 시각 자료 없음',
        current && coordinateText(current.lat, current.lon) ? `현재 위치 ${coordinateText(current.lat, current.lon)}` : null,
        agency.categoryKo ? `등급 ${agency.categoryKo}` : null,
        agency.windMs == null ? '풍속 자료 없음' : `${agency.windMs}m/s`,
        agency.hpa == null ? '기압 자료 없음' : `${agency.hpa}hPa`,
        last?.valid ? `마지막 유효 ${formatDate(last.valid)}`
          : agency.lastH == null ? '마지막 유효 시각 자료 없음' : `+${agency.lastH}시간까지 발표`,
        agency.downgrade ? `기관 약화 전망 +${agency.downgrade.h ?? '?'}시간 ${agency.downgrade.toKo || agency.downgrade.to || ''}`.trim() : null,
      ].filter(Boolean);
      row.append(create('span', '', bits.join(' / ')));
      agencies.append(row);
    });
  }
  disclosure.append(agencies);
  detail.append(disclosure);

  const actions = create('div', 'detail-actions');
  const cardButton = create('button', 'button button-primary', '카드뉴스로');
  cardButton.type = 'button';
  cardButton.addEventListener('click', () => loadDraftIntoCard(draft, true));
  const reelButton = create('button', 'button button-quiet', '릴스로');
  reelButton.type = 'button';
  reelButton.addEventListener('click', () => {
    if (!loadDraftIntoCard(draft, false)) return;
    activateTab('reels');
    $('#reelOutputMeta').textContent = `${draft.name || draft.storm || '선택 초안'} 기준으로 준비됨`;
  });
  actions.append(cardButton, reelButton);
  detail.append(actions);

  renderChannelSection(detail, draft);
}

function renderChannelSection(detail, draft) {
  const section = create('section', 'channel-section');
  const tabs = create('div', 'channel-tabs');
  Object.entries(CHANNELS).forEach(([key, channel]) => {
    if (!draft.text?.[key]) return;
    const button = create('button', `channel-tab ${state.activeChannel === key ? 'active' : ''}`, channel.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.activeChannel = key;
      renderDraftDetail();
    });
    tabs.append(button);
  });
  section.append(tabs);

  const text = draft.text?.[state.activeChannel] || '';
  section.append(create('pre', 'channel-copy', text || '이 채널 문구가 없습니다.'));
  const footer = create('div', 'channel-footer');
  const count = create('span', '', `${text.length}/${CHANNELS[state.activeChannel]?.limit || '제한 없음'}자`);
  const buttons = create('div', 'button-row');
  const copy = create('button', 'button button-quiet button-small', '문구 복사');
  copy.type = 'button';
  copy.disabled = !text;
  copy.addEventListener('click', () => copyText(text));
  const share = create('button', 'button button-quiet button-small', '공유창 열기');
  share.type = 'button';
  share.disabled = !text;
  share.addEventListener('click', () => shareText(text));
  buttons.append(copy, share);
  footer.append(count, buttons);
  section.append(footer);

  const record = create('div', 'post-record');
  const select = create('select');
  select.setAttribute('aria-label', '게시한 채널');
  Object.entries(CHANNELS).forEach(([key, channel]) => {
    const option = create('option', '', channel.label);
    option.value = key;
    if (key === state.activeChannel) option.selected = true;
    select.append(option);
  });
  const url = create('input');
  url.type = 'url';
  url.placeholder = '게시물 주소, 선택 사항';
  url.setAttribute('aria-label', '게시물 주소');
  const mark = create('button', 'button button-quiet button-small', '사람이 게시한 것으로 기록');
  mark.type = 'button';
  mark.addEventListener('click', () => {
    if (!confirm('SNS에서 실제 게시를 완료했습니까? 이 기록은 현재 이 기기에만 저장됩니다.')) return;
    const channel = select.value;
    state.posted[draft.id] = state.posted[draft.id] || {};
    state.posted[draft.id][channel] = { at: new Date().toISOString(), url: url.value.trim(), local: true };
    try {
      savePostedLedger();
    } catch (error) {
      return toast(error.message);
    }
    renderDraftList();
    renderDraftDetail();
    toast('이 기기에 게시 기록을 남겼습니다.');
  });
  record.append(select, url, mark);
  section.append(record);
  const note = create('p', 'action-note', '현재 게시 기록은 이 기기에만 남습니다. SNS나 S3에 자동 전송하지 않습니다.');
  section.append(note);
  detail.append(section);
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const area = create('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('문구를 복사했습니다.');
}

async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  await copyText(text);
  toast('공유창을 열 수 없어 문구를 복사했습니다.');
}

function cardRowsFromDraft(draft) {
  const agencies = Array.isArray(draft.facts?.agencies) ? draft.facts.agencies : [];
  const rows = Array.isArray(draft.card?.rows) ? draft.card.rows : [];
  return rows.slice(0, 5).map((row, index) => {
    const agency = agencies.find(item => [item.ko, item.id].includes(row.k)) || agencies[index];
    const issued = agency?.issue ? `${formatCompactDate(agency.issue)} 발표` : '';
    return {
      key: row.k || agency?.ko || agency?.id || '',
      value: [row.v || '', issued].filter(Boolean).join(' · '),
    };
  });
}

function syncCardChannels(draft) {
  const select = $('#cardChannel');
  if (!select) return;
  const available = [];
  [...select.options].forEach(option => {
    option.disabled = !draft?.text?.[option.value];
    if (!option.disabled) available.push(option.value);
  });
  const preferred = available.includes(state.activeChannel) ? state.activeChannel : available[0];
  state.shareChannel = preferred || 'x';
  select.value = state.shareChannel;
  select.disabled = !available.length;
}

function invalidateCaptureConnection() {
  /* 초안이 바뀌었는데 이전 태풍 창을 그대로 캡처하면 출처와 화면이 갈라진다.
     창은 닫지 않고 손잡이만 버려, 다음 「earthus 열기」가 같은 창을 새 주소로 연다. */
  state.captureWindow = null;
  $('#captureState').textContent = '연결 안 됨';
  $('#reelConnection').textContent = '연결 안 됨';
}

function loadDraftIntoCard(draft, openCardTab = true) {
  if (state.cardDirty && !confirm('작성 중인 카드 변경 내용을 지우고 이 초안을 불러오겠습니까?')) return false;
  invalidateReelFrames('선택한 초안으로 새 프레임을 만드세요.');
  invalidateCaptureConnection();
  state.cardDraftId = draft.id;
  state.cardTimeLabel = '자료 취합';
  state.rows = cardRowsFromDraft(draft);
  if (!state.rows.length) state.rows = [{ key: '', value: '' }];
  $('#cardTitle').value = draft.card?.title || '';
  $('#cardSub').value = draft.card?.sub || '';
  $('#cardSource').value = state.draftDoc?.source || '';
  $('#cardObservedAt').value = toDateInput(draft.at || state.draftDoc?.generated);
  state.cardBackground = null;
  $('#clearCardBackground').hidden = true;
  clearCardErrors();
  state.cardDirty = false;
  syncCardChannels(draft);
  renderRowEditor();
  queueCardRender();
  updateReelReadiness();
  if (openCardTab) activateTab('cards');
  return true;
}

function resetCard() {
  if (state.cardDirty && !confirm('작성 중인 카드 변경 내용을 지우고 빈 카드로 시작하겠습니까?')) return;
  invalidateReelFrames('카드 자료를 입력한 뒤 새 프레임을 만드세요.');
  invalidateCaptureConnection();
  state.cardDraftId = null;
  state.cardTimeLabel = '관측·발표';
  state.rows = [{ key: '', value: '' }];
  state.cardBackground = null;
  $('#cardForm').reset();
  $('#clearCardBackground').hidden = true;
  clearCardErrors();
  state.cardDirty = false;
  syncCardChannels(null);
  renderRowEditor();
  queueCardRender();
  updateReelReadiness();
  $('#cardTitle').focus();
}

function renderRowEditor() {
  const box = $('#rowEditor');
  box.innerHTML = '';
  state.rows.forEach((row, index) => {
    const line = create('div', 'row-input');
    const key = create('input');
    key.value = row.key;
    key.placeholder = '항목';
    key.setAttribute('aria-label', `${index + 1}번째 항목 이름`);
    key.maxLength = 40;
    const value = create('input');
    value.value = row.value;
    value.placeholder = '확인한 값';
    value.setAttribute('aria-label', `${index + 1}번째 확인한 값`);
    value.maxLength = 60;
    const remove = create('button', '', '삭제');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${index + 1}번째 값 삭제`);
    key.addEventListener('input', () => { state.rows[index].key = key.value; state.cardDirty = true; queueCardRender(); });
    value.addEventListener('input', () => { state.rows[index].value = value.value; state.cardDirty = true; queueCardRender(); });
    remove.addEventListener('click', () => {
      state.rows.splice(index, 1);
      if (!state.rows.length) state.rows.push({ key: '', value: '' });
      state.cardDirty = true;
      renderRowEditor();
      queueCardRender();
    });
    line.append(key, value, remove);
    box.append(line);
  });
}

function queueCardRender() {
  $('#titleLength').textContent = String($('#cardTitle').value.length);
  if (cardRenderQueued) return;
  cardRenderQueued = true;
  requestAnimationFrame(async () => {
    cardRenderQueued = false;
    await renderCard();
  });
}

function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const char of String(text || '').trim()) {
    if (char === '\n') {
      if (line) lines.push(line.trim());
      line = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line.trim());
      line = char;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  if (lines.length === maxLines && text && lines.join('').length < String(text).replace(/\s/g, '').length) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function truncateCanvasText(ctx, text, maxWidth) {
  let value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function drawCover(ctx, image, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = image.width, sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

function formCardData() {
  return {
    title: $('#cardTitle').value.trim(),
    sub: $('#cardSub').value.trim(),
    source: $('#cardSource').value.trim(),
    observedAt: $('#cardObservedAt').value,
    rows: state.rows.filter(row => row.key.trim() || row.value.trim()),
  };
}

function assertCardData(data = formCardData()) {
  const fields = [
    ['cardTitle', '큰 문장', data.title],
    ['cardSource', '출처', data.source],
    ['cardObservedAt', '관측·발표 시각', data.observedAt],
  ];
  const missing = fields.filter(([, , value]) => !value);
  fields.forEach(([id]) => $(`#${id}`).removeAttribute('aria-invalid'));
  if (missing.length) {
    missing.forEach(([id]) => $(`#${id}`).setAttribute('aria-invalid', 'true'));
    const message = `${missing.map(([, label]) => label).join(', ')}을 입력하세요.`;
    const error = $('#cardFormError');
    error.textContent = message;
    error.hidden = false;
    $(`#${missing[0][0]}`).focus();
    throw new Error(message);
  }
  clearCardErrors();
  return data;
}

function clearCardErrors() {
  ['cardTitle', 'cardSource', 'cardObservedAt'].forEach(id => $(`#${id}`)?.removeAttribute('aria-invalid'));
  const error = $('#cardFormError');
  if (!error) return;
  error.textContent = '';
  error.hidden = true;
}

async function renderCard() {
  await document.fonts.ready;
  const canvas = $('#cardCanvas');
  const format = FORMATS[state.format];
  if (canvas.width !== format.width || canvas.height !== format.height) {
    canvas.width = format.width;
    canvas.height = format.height;
  }
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = format;
  const data = formCardData();
  $('#cardCanvasSummary').textContent = [
    data.title || '큰 문장 없음',
    data.sub,
    ...data.rows.map(row => `${row.key || '항목'} ${row.value || '자료 없음'}`),
    data.source ? `출처 ${data.source}` : '출처 없음',
    data.observedAt ? `${state.cardTimeLabel} ${formatDate(data.observedAt)}` : '관측·발표 시각 없음',
  ].filter(Boolean).join('. ');
  const landscape = W > H;
  const pad = landscape ? 110 : 78;

  ctx.clearRect(0, 0, W, H);
  if (state.cardBackground) {
    drawCover(ctx, state.cardBackground, W, H);
    const scrim = ctx.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, 'rgba(10,10,10,.82)');
    scrim.addColorStop(.48, 'rgba(10,10,10,.46)');
    scrim.addColorStop(1, 'rgba(10,10,10,.94)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, W, H);
    const horizon = ctx.createLinearGradient(0, H * .18, W, H * .18);
    horizon.addColorStop(0, 'rgba(10,61,143,0)');
    horizon.addColorStop(.45, 'rgba(92,145,222,.42)');
    horizon.addColorStop(.72, 'rgba(10,61,143,.14)');
    horizon.addColorStop(1, 'rgba(10,61,143,0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, H * .19, W, Math.max(3, H * .006));
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#E6E6E6';
  ctx.font = `600 ${landscape ? 22 : 18}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
  ctx.letterSpacing = landscape ? '8px' : '6px';
  ctx.fillText('EARTHUS', pad, pad);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#5C91DE';
  ctx.font = `500 ${landscape ? 18 : 15}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('SOURCE + TIME', W - pad, pad);
  ctx.textAlign = 'left';

  const titleSize = landscape ? 74 : H >= 1300 ? 70 : 62;
  const titleLeading = titleSize * 1.15;
  ctx.font = `650 ${titleSize}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
  ctx.fillStyle = '#E6E6E6';
  const titleLines = wrapCanvasText(ctx, data.title || '큰 문장을 입력하세요', W - pad * 2, landscape ? 2 : 3);
  let y = landscape ? 230 : 260;
  titleLines.forEach(line => { ctx.fillText(line, pad, y); y += titleLeading; });

  if (data.sub) {
    y += landscape ? 12 : 24;
    ctx.font = `400 ${landscape ? 30 : 28}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
    ctx.fillStyle = 'rgba(230,230,230,.72)';
    wrapCanvasText(ctx, data.sub, W - pad * 2, 2).forEach(line => { ctx.fillText(line, pad, y); y += landscape ? 42 : 40; });
  }

  const footerTop = H - (landscape ? 178 : 210);
  const rows = data.rows.slice(0, landscape ? 3 : 5);
  if (rows.length) {
    const available = Math.max(0, footerTop - y - 30);
    const rowHeight = Math.min(76, Math.max(54, available / rows.length));
    y += Math.min(42, available * .12);
    rows.forEach(row => {
      if (y + rowHeight > footerTop) return;
      ctx.font = `500 ${landscape ? 22 : 20}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
      ctx.fillStyle = 'rgba(230,230,230,.55)';
      ctx.fillText(truncateCanvasText(ctx, row.key || '항목', landscape ? 250 : 220), pad, y);
      ctx.font = `650 ${landscape ? 30 : 29}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
      ctx.fillStyle = '#8CB5ED';
      const valueX = pad + (landscape ? 290 : 260);
      ctx.fillText(truncateCanvasText(ctx, row.value || '자료 없음', W - pad - valueX), valueX, y);
      y += rowHeight;
    });
  }

  ctx.strokeStyle = 'rgba(230,230,230,.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, footerTop);
  ctx.lineTo(W - pad, footerTop);
  ctx.stroke();

  ctx.font = `500 ${landscape ? 17 : 16}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
  ctx.fillStyle = 'rgba(230,230,230,.64)';
  const sourceText = data.source ? `출처 ${data.source}` : '출처를 입력하세요';
  wrapCanvasText(ctx, sourceText, W - pad * 2 - (landscape ? 260 : 210), 2)
    .forEach((line, index) => ctx.fillText(line, pad, footerTop + 36 + index * 23));
  const timeText = data.observedAt
    ? `${state.cardTimeLabel} ${formatDate(data.observedAt)}`
    : '관측·발표 시각을 입력하세요';
  ctx.fillStyle = data.observedAt ? 'rgba(230,230,230,.45)' : '#F3B45D';
  ctx.fillText(timeText, pad, H - (landscape ? 38 : 52));

  if (state.logo) {
    const logoW = landscape ? 210 : 180;
    const logoH = logoW * state.logo.height / state.logo.width;
    ctx.globalAlpha = .88;
    ctx.drawImage(state.logo, W - pad - logoW, H - (landscape ? 66 : 86), logoW, logoH);
    ctx.globalAlpha = 1;
  } else {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#E6E6E6';
    ctx.fillText('earthus', W - pad, H - 52);
    ctx.textAlign = 'left';
  }
}

async function canvasBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 파일을 만들지 못했습니다.')), type, quality);
  });
}

async function currentCardFile() {
  const data = assertCardData();
  await renderCard();
  const blob = await canvasBlob($('#cardCanvas'));
  const draft = activeDraftForCard();
  const base = draft?.storm || draft?.name || data.title;
  const name = `${safeFilePart(base)}-${state.format}.png`;
  return { file: new File([blob], name, { type: 'image/png' }), blob, data, name };
}

function dataUrlBlob(dataUrl) {
  const [header, payload] = dataUrl.split(',');
  const type = header.match(/^data:([^;]+)/)?.[1] || 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

async function currentCardShareFile() {
  const data = assertCardData();
  await renderCard();
  /* Web Share는 사용자 동작 직후 호출해야 한다. toBlob 콜백을 기다리면 일부
     모바일 브라우저에서 사용자 동작 자격이 끝나므로, 공유 때만 동기로 읽는다. */
  const blob = dataUrlBlob($('#cardCanvas').toDataURL('image/png'));
  const draft = activeDraftForCard();
  const base = draft?.storm || draft?.name || data.title;
  const name = `${safeFilePart(base)}-${state.format}.png`;
  return { file: new File([blob], name, { type: 'image/png' }), data };
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = create('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function shareFiles(files, text, title) {
  const data = { files, text, title };
  const canShareFiles = !!navigator.share && (!navigator.canShare || navigator.canShare({ files }));
  if (canShareFiles) {
    try {
      await navigator.share(data);
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
    }
  }
  files.forEach(file => triggerDownload(file, file.name));
  if (text) await copyText(text);
  toast('공유창을 열 수 없어 파일을 내려받았습니다.');
  return false;
}

function selectedShareText() {
  const draft = activeDraftForCard();
  return draft?.text?.[state.shareChannel]
    || draft?.text?.x
    || '';
}

async function openEarthusWindow() {
  const draft = activeDraftForCard();
  const url = new URL('/', location.origin);
  const cyclone = draft?.name || draft?.storm;
  if (cyclone) url.searchParams.set('tc', cyclone);
  url.searchParams.set('studio', '1');
  const popup = window.open(url, 'earthusStudioCapture', 'popup=yes,width=540,height=960,resizable=yes');
  if (!popup) throw new Error('팝업이 차단되었습니다. 이 사이트의 팝업을 허용하세요.');
  state.captureWindow = popup;
  $('#captureState').textContent = 'earthus 여는 중';
  $('#reelConnection').textContent = 'earthus 여는 중';
  toast('새 창에서 장면을 맞춘 뒤 스튜디오로 돌아오세요.');
  return popup;
}

async function waitForEarthus(timeout = 30000, job = null) {
  const popup = state.captureWindow;
  if (!popup || popup.closed) throw new Error('earthus 캡처 창을 먼저 여세요.');
  const started = Date.now();
  while (Date.now() - started < timeout) {
    assertReelActive(job);
    try {
      if (popup.location.origin !== location.origin) throw new Error('다른 주소에서 열린 창은 읽을 수 없습니다.');
      if (popup.__e?.scene?.canvas) {
        $('#captureState').textContent = 'earthus 연결됨';
        $('#reelConnection').textContent = 'earthus 연결됨';
        return popup.__e;
      }
    } catch (error) {
      if (error.message.includes('다른 주소')) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('earthus 화면 준비가 끝나지 않았습니다. 새 창에서 지구가 보이는지 확인하세요.');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    image.src = src;
  });
}

async function captureEarthusImage(job = null) {
  const earthus = await waitForEarthus(30000, job);
  let dataUrl;
  /* ⚠️ Cesium은 preserveDrawingBuffer가 꺼져 있다. render()와 읽기를 같은 호출 안에서
     이어서 해야 빈 그림을 피할 수 있다. main.js의 studio.capture()가 그 경계다. */
  earthus.studio?.pause?.();
  if (earthus.studio?.capture) dataUrl = earthus.studio.capture();
  else {
    earthus.scene.render();
    dataUrl = earthus.scene.canvas.toDataURL('image/png');
  }
  const image = await loadImage(dataUrl);
  if (isLikelyBlank(image)) throw new Error('캡처가 거의 검은 화면입니다. earthus 창이 보이는 상태에서 다시 시도하세요.');
  return image;
}

function isLikelyBlank(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 32, 32);
  const pixels = ctx.getImageData(0, 0, 32, 32).data;
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 28 && pixels[i + 3] > 0) visible++;
  }
  return visible < 8;
}

async function takeCardBackground() {
  try {
    const image = await captureEarthusImage();
    state.cardBackground = image;
    state.cardDirty = true;
    $('#clearCardBackground').hidden = false;
    $('#captureState').textContent = '현재 장면 사용 중';
    queueCardRender();
    toast('earthus 장면을 카드에 가져왔습니다.');
  } catch (error) {
    toast(error.message);
  }
}

function reelMeta() {
  const data = assertCardData();
  const draft = activeDraftForCard();
  return {
    ...data,
    name: draft?.name || draft?.storm || data.title,
    draft,
  };
}

function updateReelReadiness() {
  const status = $('#reelDataState');
  if (!status) return;
  const data = formCardData();
  const missing = [];
  if (!data.title) missing.push('제목');
  if (!data.source) missing.push('출처');
  if (!data.observedAt) missing.push('시각');
  const ready = !missing.length;
  const draft = activeDraftForCard();
  status.textContent = ready ? (draft?.name || draft?.storm || '직접 입력한 카드 자료') : `${missing.join(', ')} 필요`;
  $('#reelDataDetail').textContent = ready
    ? `${data.source} / ${state.cardTimeLabel} ${formatDate(data.observedAt)} / 공유 문구 ${selectedShareText() ? CHANNELS[state.shareChannel]?.label : '없음'}`
    : '초안의 「릴스로」를 누르거나 카드뉴스에서 빠진 값을 입력하세요.';
  const running = !!state.reelJob;
  $('#makeReelFrames').disabled = !ready || running;
  $('#captureOneFrame').disabled = !ready || running;
}

function reelEvidenceLabel(meta) {
  if (meta.draft?.kind === 'downgrade') return '기관이 발표한 약화 전망';
  if (meta.draft?.kind === 'update') return '기관별 공식 예보 갱신';
  return '확인한 earthus 장면';
}

async function composeReelFrame(image, meta, phase = '본론') {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCover(ctx, image, W, H);

  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, 'rgba(10,10,10,.86)');
  scrim.addColorStop(.28, 'rgba(10,10,10,.13)');
  scrim.addColorStop(.64, 'rgba(10,10,10,.08)');
  scrim.addColorStop(1, 'rgba(10,10,10,.92)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#E6E6E6';
  ctx.font = '600 18px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  ctx.letterSpacing = '7px';
  ctx.fillText('EARTHUS', 72, 92);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#8CB5ED';
  ctx.font = '500 20px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  ctx.fillText(`${phase} / ${reelEvidenceLabel(meta)}`, 72, 132);

  ctx.font = '650 64px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  ctx.fillStyle = '#E6E6E6';
  let y = 210;
  wrapCanvasText(ctx, meta.title, W - 144, 3).forEach(line => { ctx.fillText(line, 72, y); y += 76; });
  if (meta.sub) {
    y += 10;
    ctx.font = '400 28px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
    ctx.fillStyle = 'rgba(230,230,230,.72)';
    wrapCanvasText(ctx, meta.sub, W - 144, 2).forEach(line => { ctx.fillText(line, 72, y); y += 40; });
  }

  const rows = meta.rows.slice(0, 3);
  if (rows.length) {
    let rowY = 1450 - rows.length * 58;
    rows.forEach(row => {
      ctx.font = '500 20px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
      ctx.fillStyle = 'rgba(230,230,230,.65)';
      ctx.fillText(truncateCanvasText(ctx, row.key || '기관', 250), 72, rowY);
      ctx.font = '650 25px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
      ctx.fillStyle = '#8CB5ED';
      ctx.fillText(truncateCanvasText(ctx, row.value || '자료 없음', 640), 330, rowY);
      rowY += 58;
    });
  }

  ctx.strokeStyle = 'rgba(230,230,230,.3)';
  ctx.beginPath();
  ctx.moveTo(72, 1700);
  ctx.lineTo(W - 72, 1700);
  ctx.stroke();
  ctx.font = '500 19px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  ctx.fillStyle = 'rgba(230,230,230,.7)';
  wrapCanvasText(ctx, `출처 ${meta.source}`, 720, 2).forEach((line, index) => ctx.fillText(line, 72, 1744 + index * 27));
  ctx.fillStyle = 'rgba(230,230,230,.5)';
  ctx.fillText(`${state.cardTimeLabel} ${formatDate(meta.observedAt)}`, 72, 1850);
  if (state.logo) {
    const logoW = 190;
    const logoH = logoW * state.logo.height / state.logo.width;
    ctx.drawImage(state.logo, W - 72 - logoW, 1800, logoW, logoH);
  }
  return canvasBlob(canvas);
}

async function composeReelClosingFrame(meta) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0A3D8F';
  ctx.fillRect(72, 150, W - 144, 5);

  ctx.fillStyle = '#8CB5ED';
  ctx.font = '550 22px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  ctx.fillText('기관 예보를 합치지 않고 그대로 봅니다', 72, 250);
  ctx.fillStyle = '#E6E6E6';
  ctx.font = '650 70px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  let y = 390;
  wrapCanvasText(ctx, meta.title, W - 144, 4).forEach(line => { ctx.fillText(line, 72, y); y += 84; });

  const target = meta.draft?.storm || meta.draft?.name || '';
  const destination = target ? `earthus.net/?tc=${target}` : 'earthus.net';
  ctx.fillStyle = '#8CB5ED';
  ctx.font = '600 38px ui-monospace, SFMono-Regular, Menlo, monospace';
  wrapCanvasText(ctx, destination, W - 144, 2)
    .forEach((line, index) => ctx.fillText(line, 72, 1170 + index * 52));

  ctx.strokeStyle = 'rgba(230,230,230,.25)';
  ctx.beginPath();
  ctx.moveTo(72, 1680);
  ctx.lineTo(W - 72, 1680);
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,230,230,.68)';
  ctx.font = '500 19px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
  wrapCanvasText(ctx, `출처 ${meta.source}`, 720, 2).forEach((line, index) => ctx.fillText(line, 72, 1730 + index * 27));
  ctx.fillStyle = 'rgba(230,230,230,.5)';
  ctx.fillText(`${state.cardTimeLabel} ${formatDate(meta.observedAt)}`, 72, 1835);
  if (state.logo) {
    const logoW = 220;
    const logoH = logoW * state.logo.height / state.logo.width;
    ctx.drawImage(state.logo, W - 72 - logoW, 1785, logoW, logoH);
  }
  return canvasBlob(canvas);
}

function captureTarget(earthus) {
  const draft = activeDraftForCard();
  const facts = draft?.facts || {};
  if (Number.isFinite(Number(facts.lon)) && Number.isFinite(Number(facts.lat))) {
    return { lon: Number(facts.lon), lat: Number(facts.lat) };
  }
  const popup = state.captureWindow;
  const C = popup.Cesium;
  const c = earthus.viewer.camera.positionCartographic;
  return { lon: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude) };
}

function assertReelActive(job) {
  if (!job?.cancelled) return;
  const error = new Error('사용자가 릴스 캡처를 취소했습니다.');
  error.name = 'AbortError';
  throw error;
}

async function waitForTiles(earthus, job, maxWait = 6000) {
  const started = Date.now();
  while (!earthus.scene.globe.tilesLoaded && Date.now() - started < maxWait) {
    assertReelActive(job);
    earthus.scene.requestRender();
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  assertReelActive(job);
  if (!earthus.scene.globe.tilesLoaded) {
    throw new Error('지구본 자료가 6초 안에 준비되지 않아 불완전한 프레임을 저장하지 않았습니다.');
  }
  await new Promise(resolve => setTimeout(resolve, 160));
}

function clearFrameUrls() {
  state.frameUrls.forEach(url => URL.revokeObjectURL(url));
  state.frameUrls = [];
}

function renderFrames() {
  clearFrameUrls();
  const grid = $('#frameGrid');
  grid.innerHTML = '';
  if (!state.frames.length) {
    grid.innerHTML = '<div class="empty-state compact"><strong>earthus 장면이 여기에 쌓입니다.</strong><p>검게 캡처되면 실패로 표시하고 저장하지 않습니다.</p></div>';
    $('#saveReelSet').hidden = true;
    $('#downloadReelSet').hidden = true;
    return;
  }
  state.frames.forEach((frame, index) => {
    const url = URL.createObjectURL(frame.blob);
    state.frameUrls.push(url);
    const card = create('article', 'frame-card');
    const image = create('img');
    image.src = url;
    image.alt = `${index + 1}번째 earthus 릴스 ${frame.phase || '프레임'}`;
    const footer = create('div');
    footer.append(create('span', '', frame.name));
    const download = create('button', 'text-button', '내려받기');
    download.type = 'button';
    download.addEventListener('click', () => triggerDownload(frame.blob, frame.name));
    footer.append(download);
    card.append(image, footer);
    grid.append(card);
  });
  $('#saveReelSet').hidden = false;
  $('#downloadReelSet').hidden = false;
  $('#reelOutputMeta').textContent = `${state.frames.length}장, 1080 × 1920 PNG`;
}

function invalidateReelFrames(message) {
  if (state.reelJob) state.reelJob.cancelled = true;
  if (!state.frames.length && !state.reelJob) return;
  state.frames = [];
  renderFrames();
  $('#reelProgress').hidden = true;
  $('#reelOutputMeta').textContent = message;
}

function downloadCurrentReelSet() {
  if (!state.frames.length) return toast('내려받을 릴스 프레임이 없습니다.');
  state.frames.forEach(frame => triggerDownload(frame.blob, frame.name));
  toast(`${state.frames.length}개 PNG 내려받기를 요청했습니다. 브라우저가 여러 파일 허용을 물으면 승인하세요.`);
}

function setReelProgress(current, total, message) {
  const box = $('#reelProgress');
  box.hidden = false;
  $('#reelProgressBar').style.width = `${Math.round(current / total * 100)}%`;
  $('#reelProgressText').textContent = message;
  box.setAttribute('role', 'progressbar');
  box.setAttribute('aria-valuemin', '0');
  box.setAttribute('aria-valuemax', String(total));
  box.setAttribute('aria-valuenow', String(current));
  box.setAttribute('aria-valuetext', message);
}

async function makeReelFrames() {
  const button = $('#makeReelFrames');
  const job = { cancelled: false };
  if (state.reelJob) return toast('진행 중인 캡처를 먼저 끝내거나 취소하세요.');
  try {
    const meta = reelMeta();
    const total = Number($('#reelFrames').value) || 12;
    const closingCount = 2;
    const sceneCount = total - closingCount;
    state.reelJob = job;
    button.disabled = true;
    $('#captureOneFrame').disabled = true;
    $('#cancelReelFrames').hidden = false;
    const earthus = await waitForEarthus(30000, job);
    const popup = state.captureWindow;
    const C = popup.Cesium;
    const target = captureTarget(earthus);
    earthus.studio?.pause?.();
    state.frames = [];
    renderFrames();

    for (let index = 0; index < sceneCount; index++) {
      assertReelActive(job);
      const t = sceneCount === 1 ? 1 : index / (sceneCount - 1);
      let height;
      if (t < .35) height = 19_000_000 - (14_000_000 * (t / .35));
      else height = 5_000_000 + Math.sin((t - .35) / .65 * Math.PI) * 650_000;
      const lon = target.lon + Math.sin(t * Math.PI * 2) * 2.4;
      earthus.viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(lon, target.lat, height) });
      earthus.scene.requestRender();
      setReelProgress(index, total, `${index + 1}/${total} 장면 자료 불러오는 중`);
      await waitForTiles(earthus, job);
      const image = await captureEarthusImage(job);
      assertReelActive(job);
      const phase = index < Math.max(2, Math.ceil(sceneCount * .28)) ? '여는 장면' : '본론';
      const blob = await composeReelFrame(image, meta, phase);
      assertReelActive(job);
      state.frames.push({ name: `${safeFilePart(meta.name)}-${String(index + 1).padStart(3, '0')}.png`, blob, phase });
      setReelProgress(index + 1, total, `${index + 1}/${total} 프레임 완성`);
      renderFrames();
    }
    for (let index = sceneCount; index < total; index++) {
      assertReelActive(job);
      const blob = await composeReelClosingFrame(meta);
      assertReelActive(job);
      state.frames.push({ name: `${safeFilePart(meta.name)}-${String(index + 1).padStart(3, '0')}.png`, blob, phase: '닫는 장면' });
      setReelProgress(index + 1, total, `${index + 1}/${total} 닫는 장면 완성`);
      renderFrames();
    }
    toast(`${total}개 릴스 프레임을 만들었습니다.`);
  } catch (error) {
    if (error.name === 'AbortError') {
      toast(`캡처를 취소했습니다. 완성된 ${state.frames.length}장은 남겨 두었습니다.`);
      $('#reelProgressText').textContent = `취소됨: ${state.frames.length}장 완성`;
    } else {
      toast(error.message);
      $('#reelProgressText').textContent = `중단됨: ${error.message}`;
    }
  } finally {
    if (state.reelJob === job) state.reelJob = null;
    $('#cancelReelFrames').hidden = true;
    updateReelReadiness();
  }
}

async function captureOneReelFrame() {
  if (state.reelJob) return toast('진행 중인 캡처를 먼저 끝내거나 취소하세요.');
  const job = { cancelled: false };
  try {
    const meta = reelMeta();
    state.reelJob = job;
    $('#makeReelFrames').disabled = true;
    $('#captureOneFrame').disabled = true;
    $('#cancelReelFrames').hidden = false;
    state.frames = [];
    renderFrames();
    setReelProgress(0, 1, '현재 장면 캡처 중');
    const image = await captureEarthusImage(job);
    assertReelActive(job);
    const blob = await composeReelFrame(image, meta, '현재 장면');
    assertReelActive(job);
    state.frames = [{ name: `${safeFilePart(meta.name)}-001.png`, blob, phase: '현재 장면' }];
    renderFrames();
    setReelProgress(1, 1, '현재 장면 1/1 완성');
    toast('현재 장면을 1080 × 1920 프레임으로 만들었습니다.');
  } catch (error) {
    if (error.name === 'AbortError') {
      toast('현재 장면 캡처를 취소했습니다.');
      $('#reelProgressText').textContent = '취소됨: 저장한 프레임 없음';
    } else {
      toast(error.message);
      $('#reelProgressText').textContent = `중단됨: ${error.message}`;
    }
  } finally {
    if (state.reelJob === job) state.reelJob = null;
    $('#cancelReelFrames').hidden = true;
    updateReelReadiness();
  }
}

function openDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('이 브라우저는 작업 보관함을 지원하지 않습니다.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('보관함을 열지 못했습니다.'));
  });
}

async function getDb() {
  state.db = state.db || await openDb();
  return state.db;
}

async function putMedia(item) {
  const db = await getDb();
  const store = db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE);
  await new Promise((resolve, reject) => {
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('보관함에 저장하지 못했습니다.'));
  });
  await loadLibrary();
}

async function getAllMedia() {
  const db = await getDb();
  const store = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('보관함을 읽지 못했습니다.'));
  });
}

async function removeMedia(id) {
  const db = await getDb();
  const store = db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE);
  await new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('자료를 지우지 못했습니다.'));
  });
  await loadLibrary();
}

async function loadLibrary() {
  try {
    state.library = (await getAllMedia()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $('#libraryCount').textContent = `${state.library.length}건, 이 기기`;
    renderLibrary();
  } catch (error) {
    state.library = [];
    $('#libraryCount').textContent = '사용 불가';
    if (!$('#panel-library').hidden) {
      $('#libraryGrid').innerHTML = `<div class="error-state">보관함을 읽지 못했습니다. ${error.message}</div>`;
    }
  }
}

function clearLibraryUrls() {
  state.libraryUrls.forEach(url => URL.revokeObjectURL(url));
  state.libraryUrls = [];
}

function renderLibrary() {
  const grid = $('#libraryGrid');
  if (!grid) return;
  clearLibraryUrls();
  grid.innerHTML = '';
  if (!state.library.length) {
    grid.innerHTML = '<div class="empty-state wide"><strong>아직 보관한 자료가 없습니다.</strong><p>카드를 저장하거나, earthus 릴스 프레임을 만들거나, 기기의 사진과 영상을 가져오세요.</p></div>';
    return;
  }

  state.library.forEach(item => {
    const card = create('article', 'media-card');
    const preview = create('div', 'media-preview');
    const previewBlob = item.kind === 'sequence' ? item.frames?.[0]?.blob : item.blob;
    if (previewBlob) {
      const url = URL.createObjectURL(previewBlob);
      state.libraryUrls.push(url);
      if (item.kind === 'video') {
        const video = create('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        preview.append(video);
      } else {
        const image = create('img');
        image.src = url;
        image.alt = item.title || 'earthus 보관 이미지';
        preview.append(image);
      }
    }
    if (item.kind === 'sequence') preview.append(create('span', 'sequence-count', `${item.frames?.length || 0}장`));

    const body = create('div', 'media-body');
    body.append(create('h3', '', item.title || '이름 없음'));
    const meta = create('p', 'media-meta');
    meta.textContent = `${item.source || '출처 없음'}\n${item.observedAt ? formatDate(item.observedAt) : '시각 없음'}\n${item.localOnly ? '이 기기에만 보관됨' : ''}`;
    meta.style.whiteSpace = 'pre-line';
    body.append(meta);
    const actions = create('div', 'media-actions');

    if (item.kind === 'sequence') {
      const view = create('button', 'button button-quiet button-small', '프레임 보기');
      view.type = 'button';
      view.addEventListener('click', () => {
        state.frames = (item.frames || []).map(frame => ({ name: frame.name, blob: frame.blob }));
        renderFrames();
        activateTab('reels');
      });
      actions.append(view);
    } else if (item.blob) {
      const download = create('button', 'button button-quiet button-small', '내려받기');
      download.type = 'button';
      download.addEventListener('click', () => triggerDownload(item.blob, item.fileName || `${safeFilePart(item.title)}.${item.kind === 'video' ? 'mp4' : 'png'}`));
      actions.append(download);
    }

    const share = create('button', 'button button-quiet button-small', '공유');
    share.type = 'button';
    share.addEventListener('click', async () => {
      const blobs = item.kind === 'sequence' ? (item.frames || []) : [{ name: item.fileName, blob: item.blob }];
      const files = blobs.filter(x => x?.blob).map((x, index) => new File(
        [x.blob], x.name || `${safeFilePart(item.title)}-${index + 1}.png`, { type: x.blob.type || 'image/png' }));
      if (!files.length) return toast('공유할 파일이 없습니다.');
      const text = item.text || `${item.title}\n출처 ${item.source}\n${formatDate(item.observedAt)}`;
      await shareFiles(files, text, item.title);
    });
    actions.append(share);

    const server = create('button', 'button button-quiet button-small', item.localOnly === false ? '서버 보관됨' : '서버에도 보관');
    server.type = 'button';
    server.disabled = item.localOnly === false;
    server.addEventListener('click', async () => {
      if (!state.known || !state.client) return toast('관리자 로그인 상태를 확인하세요.');
      server.disabled = true;
      const original = server.textContent;
      try {
        const files = item.kind === 'sequence'
          ? (item.frames || []).map((frame, index) => ({
              file: new File([frame.blob], frame.name || `${safeFilePart(item.title)}-${index + 1}.png`, { type: frame.blob.type || 'image/png' }),
              title: `${item.title} ${index + 1}`,
            }))
          : [{ file: new File([item.blob], item.fileName || `${safeFilePart(item.title)}.${item.kind === 'video' ? 'mp4' : 'png'}`, { type: item.blob.type }), title: item.title }];
        const serverIds = [];
        for (const [index, entry] of files.entries()) {
          const result = await uploadSocialFile({
            file: entry.file,
            title: entry.title,
            source: item.source,
            observedAt: item.observedAt,
            onState: message => { server.textContent = files.length > 1 ? `${index + 1}/${files.length} ${message}` : message; },
          });
          serverIds.push(result.media.id);
        }
        await putMedia({ ...item, serverIds, localOnly: false });
        await refreshSocialAdmin();
        toast(`${files.length}개 자료를 서버 보관함에 올렸습니다.`);
      } catch (error) {
        server.disabled = false;
        server.textContent = original;
        toast(error.message);
      }
    });
    actions.append(server);

    const remove = create('button', 'text-button', '삭제');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!confirm('이 기기의 보관함에서 이 자료를 지울까요? 복구할 수 없습니다.')) return;
      try {
        await removeMedia(item.id);
        toast('보관함에서 지웠습니다.');
      } catch (error) {
        toast(error.message);
      }
    });
    actions.append(remove);
    body.append(actions);
    card.append(preview, body);
    grid.append(card);
  });
}

async function saveCurrentCard() {
  try {
    const { blob, data, name } = await currentCardFile();
    await putMedia({
      id: crypto.randomUUID(),
      kind: 'image',
      title: data.title,
      source: data.source,
      observedAt: data.observedAt,
      createdAt: new Date().toISOString(),
      fileName: name,
      blob,
      text: selectedShareText(),
      localOnly: true,
    });
    state.cardDirty = false;
    toast('카드를 이 기기의 보관함에 저장했습니다.');
  } catch (error) {
    toast(error.message);
  }
}

async function saveCurrentReelSet() {
  if (!state.frames.length) return;
  try {
    const meta = reelMeta();
    await putMedia({
      id: crypto.randomUUID(),
      kind: 'sequence',
      title: `${meta.title} 릴스 프레임`,
      source: meta.source,
      observedAt: meta.observedAt,
      createdAt: new Date().toISOString(),
      frames: state.frames.map(frame => ({ name: frame.name, blob: frame.blob })),
      text: selectedShareText(),
      localOnly: true,
    });
    toast('릴스 프레임 묶음을 이 기기에 저장했습니다.');
  } catch (error) {
    toast(error.message);
  }
}

function prepareImport(files) {
  const accepted = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
  if (!accepted.length) return toast('사진 또는 영상 파일을 선택하세요.');
  const oversized = accepted.find(file => file.size > 250 * 1024 * 1024);
  if (oversized) return toast(`${oversized.name}은 250MB를 넘어 이 기기 보관함에 넣지 않았습니다.`);
  state.pendingFiles = accepted;
  $('#importMeta').hidden = false;
  $('#importTitle').value = accepted.length === 1 ? accepted[0].name.replace(/\.[^.]+$/, '') : '';
  $('#importSource').value = '';
  $('#importObservedAt').value = '';
  $('#importFileList').textContent = accepted.map(file => `${file.name} (${Math.ceil(file.size / 1024 / 1024)}MB)`).join(' / ');
  $('#importTitle').focus();
}

async function importMedia(event) {
  event.preventDefault();
  const title = $('#importTitle').value.trim();
  const source = $('#importSource').value.trim();
  const observedAt = $('#importObservedAt').value;
  if (!title || !source || !observedAt) return toast('자료 이름, 출처, 관측·촬영 시각을 모두 입력하세요.');
  try {
    const importedCount = state.pendingFiles.length;
    for (const [index, file] of state.pendingFiles.entries()) {
      const itemTitle = state.pendingFiles.length > 1 ? `${title} ${index + 1}` : title;
      await putMedia({
        id: crypto.randomUUID(),
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        title: itemTitle,
        source,
        observedAt,
        createdAt: new Date().toISOString(),
        fileName: file.name,
        blob: file,
        localOnly: true,
      });
    }
    cancelImport();
    toast(`${importedCount}개 자료를 이 기기에 저장했습니다.`);
  } catch (error) {
    toast(error.message);
  }
}

function cancelImport() {
  state.pendingFiles = [];
  $('#mediaFiles').value = '';
  $('#importMeta').hidden = true;
  $('#importMeta').reset();
}

async function loadBrandAssets() {
  try {
    state.logo = await loadImage('./logo-lockup.png');
  } catch (_) {
    state.logo = null;
  }
  queueCardRender();
}

function bindEvents() {
  const railTabs = $$('.rail-tab');
  railTabs.forEach((button, index) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      let next = null;
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % railTabs.length;
      if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (index - 1 + railTabs.length) % railTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = railTabs.length - 1;
      if (next == null) return;
      event.preventDefault();
      railTabs[next].focus();
      activateTab(railTabs[next].dataset.tab);
    });
  });
  $('#signInGoogle').addEventListener('click', () => state.client?.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: location.href },
  }));
  $('#signOut').addEventListener('click', async () => {
    await state.client?.auth.signOut();
    location.reload();
  });
  $('#refreshDrafts').addEventListener('click', loadDrafts);
  $('#newCard').addEventListener('click', () => resetCard());

  $('#formatPicker').addEventListener('click', event => {
    const button = event.target.closest('[data-format]');
    if (!button) return;
    if (state.format === button.dataset.format) return;
    state.format = button.dataset.format;
    state.cardDirty = true;
    $$('#formatPicker button').forEach(item => item.classList.toggle('active', item === button));
    const format = FORMATS[state.format];
    $('#formatSize').textContent = `${format.width} × ${format.height}`;
    $('#previewMeta').textContent = format.label;
    queueCardRender();
  });

  $('#cardForm').addEventListener('input', () => {
    clearCardErrors();
    state.cardDirty = true;
    invalidateReelFrames('카드 내용이 바뀌어 이전 프레임을 비웠습니다.');
    queueCardRender();
    updateReelReadiness();
  });
  $('#cardChannel').addEventListener('change', event => {
    state.shareChannel = event.target.value;
    updateReelReadiness();
  });
  $('#addRow').addEventListener('click', () => {
    if (state.rows.length >= 5) return toast('한 카드에는 확인한 값을 최대 5줄까지 넣습니다.');
    state.rows.push({ key: '', value: '' });
    state.cardDirty = true;
    renderRowEditor();
    queueCardRender();
  });
  $('#openEarthusForCard').addEventListener('click', async () => {
    try { await openEarthusWindow(); } catch (error) { toast(error.message); }
  });
  $('#captureCardBackground').addEventListener('click', takeCardBackground);
  $('#clearCardBackground').addEventListener('click', () => {
    state.cardBackground = null;
    state.cardDirty = true;
    $('#clearCardBackground').hidden = true;
    $('#captureState').textContent = state.captureWindow && !state.captureWindow.closed ? 'earthus 연결됨' : '연결 안 됨';
    queueCardRender();
  });
  $('#downloadCard').addEventListener('click', async () => {
    try {
      const { blob, name } = await currentCardFile();
      triggerDownload(blob, name);
      toast('PNG를 내려받았습니다.');
    } catch (error) { toast(error.message); }
  });
  $('#saveCard').addEventListener('click', saveCurrentCard);
  $('#shareCard').addEventListener('click', async () => {
    try {
      const { file, data } = await currentCardShareFile();
      await shareFiles([file], selectedShareText(), data.title);
    } catch (error) { toast(error.message); }
  });

  $('#openEarthusForReel').addEventListener('click', async () => {
    try { await openEarthusWindow(); } catch (error) { toast(error.message); }
  });
  $('#makeReelFrames').addEventListener('click', makeReelFrames);
  $('#captureOneFrame').addEventListener('click', captureOneReelFrame);
  $('#cancelReelFrames').addEventListener('click', () => {
    if (state.reelJob) state.reelJob.cancelled = true;
  });
  $('#chooseReelDraft').addEventListener('click', () => activateTab('drafts'));
  $('#downloadReelSet').addEventListener('click', downloadCurrentReelSet);
  $('#saveReelSet').addEventListener('click', saveCurrentReelSet);

  $('#mediaFiles').addEventListener('change', event => prepareImport([...event.target.files]));
  $('#importMeta').addEventListener('submit', importMedia);
  $('#cancelImport').addEventListener('click', cancelImport);

  window.addEventListener('beforeunload', event => {
    if (!state.cardDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function boot() {
  bindEvents();
  setupSocialAdmin({ getClient: () => state.client, toast });
  state.rows = [{ key: '', value: '' }];
  renderRowEditor();
  renderFrames();
  syncCardChannels(null);
  updateReelReadiness();
  loadBrandAssets();
  const initialTab = location.hash.slice(1);
  if (initialTab) activateTab(initialTab);
  await bootAuth();
}

boot();

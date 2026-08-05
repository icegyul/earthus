/* earthus 콘텐츠 스튜디오
 *
 * ⚠️⚠️ 이 파일에는 SNS 게시 API가 없다. 초안 확인, 파일 생성, 복사, 공유창 열기까지만 한다.
 *    자동 게시 금지 원칙은 기능 하나가 아니라 이 화면의 보안 경계다.
 *
 * ⚠️⚠️ 관리자가 아니면 ADMIN_UIDS가 비었을 때도 열리면 안 된다.
 *    `length === 0 || includes(...)`로 바꾸지 말 것. 빈 목록은 전원 차단이 정상이다.
 */

import { CONFIG } from './config.local.js';

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
  draftDoc: null,
  drafts: [],
  selectedDraft: null,
  activeChannel: 'x',
  format: 'portrait',
  rows: [],
  cardDraftId: null,
  cardTimeLabel: '관측·발표',
  cardBackground: null,
  captureWindow: null,
  frames: [],
  frameUrls: [],
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

function valueOrMissing(value, suffix = '') {
  return value == null || value === '' ? '자료 없음' : `${value}${suffix}`;
}

function formatDate(value, withSeconds = false) {
  if (!value) return '시각 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date);
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function safeFilePart(value) {
  return String(value || 'earthus')
    .trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'earthus';
}

function activeDraftForCard() {
  return state.drafts.find(d => d.id === state.cardDraftId) || null;
}

function mergedPosted(draft) {
  return { ...(draft?.posted || {}), ...(state.posted[draft?.id] || {}) };
}

function postedEntries(draft) {
  return Object.entries(mergedPosted(draft)).filter(([, value]) => value);
}

function kindLabel(kind) {
  return kind === 'downgrade' ? '약화' : kind === 'update' ? '갱신' : kind || '초안';
}

function activateTab(tab) {
  $$('.rail-tab').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.panel').forEach(panel => {
    const active = panel.dataset.panel === tab;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  if (tab === 'library') renderLibrary();
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
  state.known = LOCAL_PREVIEW || (!!state.user && uids.includes(state.user.id));
  $('#signOut').hidden = !state.user;

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
}

async function loadDrafts() {
  const list = $('#draftList');
  state.draftsLoaded = true;
  list.innerHTML = '<div class="skeleton-list" aria-label="초안 불러오는 중"><i></i><i></i><i></i></div>';
  $('#draftCount').textContent = '불러오는 중';
  try {
    const response = await fetch(`/events/social-drafts.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const doc = await response.json();
    if (!Array.isArray(doc.drafts)) throw new Error('drafts 배열이 없습니다');
    state.draftDoc = doc;
    state.drafts = [...doc.drafts].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    $('#draftCount').textContent = `${state.drafts.length}건`;
    renderDraftList();
    if (state.drafts.length && !state.selectedDraft) selectDraft(state.drafts[0]);
    if (!state.drafts.length) {
      $('#draftDetail').innerHTML = '<div class="empty-state"><strong>현재 초안이 없습니다.</strong><p>자료가 없다는 상태를 그대로 표시합니다. 자동으로 문구를 만들지 않습니다.</p></div>';
    }
  } catch (error) {
    state.drafts = [];
    $('#draftCount').textContent = '읽기 실패';
    list.innerHTML = '';
    const box = create('div', 'error-state');
    box.append('초안을 읽지 못했습니다. ', error.message);
    list.append(box);
    $('#draftDetail').innerHTML = '<div class="empty-state"><strong>초안 자료를 확인할 수 없습니다.</strong><p>0건과 읽기 실패를 같은 상태로 보여주지 않습니다.</p></div>';
  }
}

function renderDraftList() {
  const list = $('#draftList');
  list.innerHTML = '';
  if (!state.drafts.length) {
    list.innerHTML = '<div class="empty-state compact"><strong>표시할 초안이 없습니다.</strong><p>새 초안이 생길 때까지 비워 둡니다.</p></div>';
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
      const bits = [
        agency.windMs == null ? '풍속 자료 없음' : `${agency.windMs}m/s`,
        agency.hpa == null ? '기압 자료 없음' : `${agency.hpa}hPa`,
        agency.lastH == null ? '마지막 시각 자료 없음' : `+${agency.lastH}시간까지 발표`,
      ];
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
    loadDraftIntoCard(draft, false);
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

function loadDraftIntoCard(draft, openCardTab = true) {
  state.cardDraftId = draft.id;
  state.cardTimeLabel = '자료 생성';
  state.rows = (draft.card?.rows || []).slice(0, 5).map(row => ({ key: row.k || '', value: row.v || '' }));
  if (!state.rows.length) state.rows = [{ key: '', value: '' }];
  $('#cardTitle').value = draft.card?.title || '';
  $('#cardSub').value = draft.card?.sub || '';
  $('#cardSource').value = state.draftDoc?.source || '';
  $('#cardObservedAt').value = toDateInput(draft.at || state.draftDoc?.generated);
  state.cardBackground = null;
  $('#clearCardBackground').hidden = true;
  $('#captureState').textContent = '연결 안 됨';
  renderRowEditor();
  queueCardRender();
  if (openCardTab) activateTab('cards');
}

function resetCard() {
  state.cardDraftId = null;
  state.cardTimeLabel = '관측·발표';
  state.rows = [{ key: '', value: '' }];
  state.cardBackground = null;
  $('#cardForm').reset();
  $('#clearCardBackground').hidden = true;
  $('#captureState').textContent = '연결 안 됨';
  renderRowEditor();
  queueCardRender();
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
    key.addEventListener('input', () => { state.rows[index].key = key.value; queueCardRender(); });
    value.addEventListener('input', () => { state.rows[index].value = value.value; queueCardRender(); });
    remove.addEventListener('click', () => {
      state.rows.splice(index, 1);
      if (!state.rows.length) state.rows.push({ key: '', value: '' });
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
  const missing = [];
  if (!data.title) missing.push('큰 문장');
  if (!data.source) missing.push('출처');
  if (!data.observedAt) missing.push('관측·발표 시각');
  if (missing.length) throw new Error(`${missing.join(', ')}을 입력하세요.`);
  return data;
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
      ctx.fillText(row.key || '항목', pad, y);
      ctx.font = `650 ${landscape ? 30 : 29}px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif`;
      ctx.fillStyle = '#8CB5ED';
      ctx.fillText(row.value || '자료 없음', pad + (landscape ? 290 : 260), y);
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
  return draft?.text?.[state.activeChannel]
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

async function waitForEarthus(timeout = 30000) {
  const popup = state.captureWindow;
  if (!popup || popup.closed) throw new Error('earthus 캡처 창을 먼저 여세요.');
  const started = Date.now();
  while (Date.now() - started < timeout) {
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

async function captureEarthusImage() {
  const earthus = await waitForEarthus();
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

async function composeReelFrame(image, meta) {
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

async function waitForTiles(earthus, maxWait = 1500) {
  const started = Date.now();
  while (!earthus.scene.globe.tilesLoaded && Date.now() - started < maxWait) {
    earthus.scene.requestRender();
    await new Promise(resolve => setTimeout(resolve, 120));
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
    return;
  }
  state.frames.forEach((frame, index) => {
    const url = URL.createObjectURL(frame.blob);
    state.frameUrls.push(url);
    const card = create('article', 'frame-card');
    const image = create('img');
    image.src = url;
    image.alt = `${index + 1}번째 earthus 릴스 프레임`;
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
  $('#reelOutputMeta').textContent = `${state.frames.length}장, 1080 × 1920 PNG`;
}

function setReelProgress(current, total, message) {
  const box = $('#reelProgress');
  box.hidden = false;
  $('#reelProgressBar').style.width = `${Math.round(current / total * 100)}%`;
  $('#reelProgressText').textContent = message;
}

async function makeReelFrames() {
  const button = $('#makeReelFrames');
  try {
    const meta = reelMeta();
    const total = Number($('#reelFrames').value) || 12;
    const earthus = await waitForEarthus();
    const popup = state.captureWindow;
    const C = popup.Cesium;
    const target = captureTarget(earthus);
    earthus.studio?.pause?.();
    state.frames = [];
    renderFrames();
    button.disabled = true;

    for (let index = 0; index < total; index++) {
      const t = total === 1 ? 1 : index / (total - 1);
      let height;
      if (t < .28) height = 19_000_000 - (14_000_000 * (t / .28));
      else if (t < .78) height = 5_000_000 + Math.sin((t - .28) / .5 * Math.PI) * 650_000;
      else height = 5_000_000 + 8_000_000 * ((t - .78) / .22);
      const lon = target.lon + Math.sin(t * Math.PI * 2) * 2.4;
      earthus.viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(lon, target.lat, height) });
      earthus.scene.requestRender();
      setReelProgress(index, total, `${index + 1}/${total} 장면 자료 불러오는 중`);
      await waitForTiles(earthus);
      const image = await captureEarthusImage();
      const blob = await composeReelFrame(image, meta);
      state.frames.push({ name: `${safeFilePart(meta.name)}-${String(index + 1).padStart(3, '0')}.png`, blob });
      setReelProgress(index + 1, total, `${index + 1}/${total} 프레임 완성`);
      renderFrames();
    }
    toast(`${total}개 릴스 프레임을 만들었습니다.`);
  } catch (error) {
    toast(error.message);
    $('#reelProgressText').textContent = `중단됨: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function captureOneReelFrame() {
  try {
    const meta = reelMeta();
    const image = await captureEarthusImage();
    const blob = await composeReelFrame(image, meta);
    state.frames = [{ name: `${safeFilePart(meta.name)}-001.png`, blob }];
    renderFrames();
    toast('현재 장면을 1080 × 1920 프레임으로 만들었습니다.');
  } catch (error) {
    toast(error.message);
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
      const blobs = item.kind === 'sequence' ? (item.frames || []).slice(0, 10) : [{ name: item.fileName, blob: item.blob }];
      const files = blobs.filter(x => x?.blob).map((x, index) => new File(
        [x.blob], x.name || `${safeFilePart(item.title)}-${index + 1}.png`, { type: x.blob.type || 'image/png' }));
      if (!files.length) return toast('공유할 파일이 없습니다.');
      const text = item.text || `${item.title}\n출처 ${item.source}\n${formatDate(item.observedAt)}`;
      await shareFiles(files, text, item.title);
    });
    actions.append(share);

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
  $$('.rail-tab').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.tab)));
  $('#signInGoogle').addEventListener('click', () => state.client?.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: location.href },
  }));
  $('#signOut').addEventListener('click', async () => {
    await state.client?.auth.signOut();
    location.reload();
  });
  $('#refreshDrafts').addEventListener('click', loadDrafts);
  $('#newCard').addEventListener('click', resetCard);

  $('#formatPicker').addEventListener('click', event => {
    const button = event.target.closest('[data-format]');
    if (!button) return;
    state.format = button.dataset.format;
    $$('#formatPicker button').forEach(item => item.classList.toggle('active', item === button));
    const format = FORMATS[state.format];
    $('#formatSize').textContent = `${format.width} × ${format.height}`;
    $('#previewMeta').textContent = format.label;
    queueCardRender();
  });

  $('#cardForm').addEventListener('input', queueCardRender);
  $('#addRow').addEventListener('click', () => {
    if (state.rows.length >= 5) return toast('한 카드에는 확인한 값을 최대 5줄까지 넣습니다.');
    state.rows.push({ key: '', value: '' });
    renderRowEditor();
    queueCardRender();
  });
  $('#openEarthusForCard').addEventListener('click', async () => {
    try { await openEarthusWindow(); } catch (error) { toast(error.message); }
  });
  $('#captureCardBackground').addEventListener('click', takeCardBackground);
  $('#clearCardBackground').addEventListener('click', () => {
    state.cardBackground = null;
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
      const { file, data } = await currentCardFile();
      await shareFiles([file], selectedShareText(), data.title);
    } catch (error) { toast(error.message); }
  });

  $('#openEarthusForReel').addEventListener('click', async () => {
    try { await openEarthusWindow(); } catch (error) { toast(error.message); }
  });
  $('#makeReelFrames').addEventListener('click', makeReelFrames);
  $('#captureOneFrame').addEventListener('click', captureOneReelFrame);
  $('#saveReelSet').addEventListener('click', saveCurrentReelSet);

  $('#mediaFiles').addEventListener('change', event => prepareImport([...event.target.files]));
  $('#importMeta').addEventListener('submit', importMedia);
  $('#cancelImport').addEventListener('click', cancelImport);
}

async function boot() {
  bindEvents();
  state.rows = [{ key: '', value: '' }];
  renderRowEditor();
  renderFrames();
  loadBrandAssets();
  await bootAuth();
}

boot();

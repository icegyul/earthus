/* earthus SNS 연결 관리자 UI
 *
 * ⚠️⚠️ 자격증명은 localStorage, IndexedDB, URL, 콘솔에 쓰지 않는다.
 *    입력 폼에서 관리자 Edge Function으로 한 번 보내고 즉시 reset한다.
 *
 * ⚠️⚠️ 게시 함수는 submit 이벤트에서만 호출한다. 타이머, 화면 진입, 새로고침,
 *    미디어 업로드 완료를 게시 트리거로 연결하지 말 것.
 */

import { CONFIG } from './config.local.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const LABELS = { x: 'X', threads: 'Threads', instagram: 'Instagram', facebook: 'Facebook' };
const LIMITS = { x: 280, threads: 500, instagram: 2200, facebook: 5000 };

let getClient = () => null;
let notify = () => {};
let bound = false;
let loading = false;
let media = [];
let credentialStatus = [];

function koError(error) {
  const code = String(error?.message || error || 'UNKNOWN');
  const exact = {
    NO_AUTH: '로그인이 만료되었습니다. 다시 로그인하세요.',
    NOT_ADMIN: '서버 관리자 목록에 없는 계정입니다.',
    NOT_CONFIGURED: '이 채널의 자격증명을 먼저 저장하세요.',
    VAULT_NOT_CONFIGURED: '서버 암호화 키가 준비되지 않았습니다.',
    INVALID_MEDIA: '지원하지 않는 파일이거나 512MB를 넘었습니다.',
    PROVENANCE_REQUIRED: '출처와 관측·촬영 시각을 모두 입력하세요.',
    UPLOAD_NOT_FOUND: '서버에서 업로드한 파일을 찾지 못했습니다.',
    INSTAGRAM_MEDIA_REQUIRED: 'Instagram 게시에는 사진 또는 영상이 필요합니다.',
    PUBLISH_CONFIRMATION_REQUIRED: '채널, 문구, 최종 확인을 다시 확인하세요.',
    PUBLISH_IN_PROGRESS: '같은 게시 요청을 이미 처리하고 있습니다.',
    X_TOKEN_EXPIRED: 'X 토큰이 만료됐습니다. 새 토큰을 저장하거나 갱신 정보를 넣으세요.',
    X_MEDIA_PROCESSING_TIMEOUT: 'X가 영상을 처리하는 시간이 길어 중단했습니다.',
    INSTAGRAM_PROCESSING_TIMEOUT: 'Instagram이 영상을 처리하는 시간이 길어 중단했습니다.',
  };
  return exact[code] || code.replace(/^FunctionsHttpError:\s*/i, '').slice(0, 500);
}

async function call(action, fields = {}) {
  const client = getClient();
  if (!client) throw new Error('NO_AUTH');
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new Error('NO_AUTH');
  const endpoint = `${CONFIG.SUPABASE_URL}/functions/v1/social-admin`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...fields }),
  });
  const text = await response.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = { error: `HTTP ${response.status}` }; }
  if (!response.ok || result.error) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function formatTime(value) {
  if (!value) return '저장 안 됨';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Seoul',
    }).format(new Date(value));
  } catch { return '시각 확인 불가'; }
}

function renderCredentialStatus() {
  let configured = 0;
  credentialStatus.forEach(item => {
    const state = $(`[data-provider-state="${item.provider}"]`);
    if (!state) return;
    const ready = Array.isArray(item.fields) && item.fields.length > 0;
    state.classList.toggle('configured', ready);
    state.classList.remove('failed');
    state.textContent = ready ? `저장됨 ${formatTime(item.updatedAt)}` : '저장 안 됨';
    if (ready) configured += 1;
  });
  $('#connectionSummary').textContent = `${configured}/4개 저장됨`;
  $('#socialCount').textContent = configured ? `${configured}개 연결` : '연결 없음';
}

function mediaOption(item) {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = `${item.title} (${String(item.mimeType).startsWith('video/') ? '영상' : '사진'})`;
  return option;
}

function renderMedia() {
  const grid = $('#serverMediaGrid');
  const select = $('#publishMedia');
  const previous = select.value;
  select.replaceChildren(new Option('텍스트만', ''));
  media.forEach(item => select.append(mediaOption(item)));
  if (media.some(item => item.id === previous)) select.value = previous;
  $('#serverMediaCount').textContent = `${media.length}건`;

  grid.innerHTML = '';
  if (!media.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state wide';
    empty.innerHTML = '<strong>서버에 보관한 자료가 없습니다.</strong><p>출처와 촬영 시각이 확인된 사진 또는 영상을 올리세요.</p>';
    grid.append(empty);
    return;
  }

  media.forEach(item => {
    const card = document.createElement('article');
    card.className = 'server-media-card';
    const preview = document.createElement('div');
    preview.className = 'server-media-preview';
    if (String(item.mimeType).startsWith('video/')) {
      const video = document.createElement('video');
      video.src = item.previewUrl || '';
      video.controls = true;
      video.preload = 'metadata';
      preview.append(video);
    } else {
      const image = document.createElement('img');
      image.src = item.previewUrl || '';
      image.alt = item.title || 'earthus 서버 보관 이미지';
      image.loading = 'lazy';
      preview.append(image);
    }
    const body = document.createElement('div');
    body.className = 'server-media-body';
    const title = document.createElement('strong');
    title.textContent = item.title || item.fileName;
    const meta = document.createElement('p');
    meta.textContent = `${item.source || '출처 없음'}\n${item.observedAt ? formatTime(item.observedAt) : '시각 없음'}`;
    meta.style.whiteSpace = 'pre-line';
    const actions = document.createElement('div');
    actions.className = 'button-row';
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'button button-quiet button-small';
    use.textContent = '게시에 사용';
    use.addEventListener('click', () => {
      $('#publishMedia').value = item.id;
      $('#publishText').focus();
      document.querySelector('#publisherTitle').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = '삭제';
    remove.addEventListener('click', () => deleteMedia(item));
    actions.append(use, remove);
    body.append(title, meta, actions);
    card.append(preview, body);
    grid.append(card);
  });
}

export async function refreshSocialAdmin() {
  if (loading || !getClient()) return;
  loading = true;
  $('#connectionSummary').textContent = '불러오는 중';
  try {
    const result = await call('status');
    credentialStatus = result.credentials || [];
    media = result.media || [];
    renderCredentialStatus();
    renderMedia();
  } catch (error) {
    $('#connectionSummary').textContent = '확인 실패';
    $('#socialCount').textContent = '확인 실패';
    notify(koError(error));
  } finally {
    loading = false;
  }
}

function formCredentials(form) {
  const values = {};
  new FormData(form).forEach((value, key) => {
    const clean = String(value).trim();
    if (clean) values[key] = clean;
  });
  return values;
}

async function saveCredential(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const provider = form.dataset.provider;
  const errorBox = $('.credential-error', form);
  const submit = $('[type="submit"]', form);
  errorBox.hidden = true;
  submit.disabled = true;
  submit.textContent = '저장 중';
  try {
    const result = await call('save_credentials', { provider, credentials: formCredentials(form) });
    form.reset();
    credentialStatus = credentialStatus.filter(item => item.provider !== provider);
    credentialStatus.push(result.status);
    renderCredentialStatus();
    notify(`${LABELS[provider]} 자격증명을 암호화해 저장했습니다.`);
  } catch (error) {
    errorBox.textContent = koError(error);
    errorBox.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = '안전하게 저장';
  }
}

async function testCredential(form) {
  const provider = form.dataset.provider;
  const button = $('.test-credential', form);
  const state = $(`[data-provider-state="${provider}"]`);
  button.disabled = true;
  button.textContent = '확인 중';
  try {
    const result = await call('test_credentials', { provider });
    const account = result.account || {};
    const label = account.username ? `@${account.username}` : account.name || account.id || '계정 확인됨';
    state.textContent = label;
    state.classList.add('configured');
    state.classList.remove('failed');
    notify(`${LABELS[provider]} 계정을 확인했습니다.`);
  } catch (error) {
    state.textContent = '확인 실패';
    state.classList.add('failed');
    notify(koError(error));
  } finally {
    button.disabled = false;
    button.textContent = '계정 확인';
  }
}

async function clearCredential(form) {
  const provider = form.dataset.provider;
  if (!confirm(`${LABELS[provider]} 연결 정보를 서버에서 삭제할까요?`)) return;
  try {
    await call('clear_credentials', { provider });
    credentialStatus = credentialStatus.filter(item => item.provider !== provider);
    credentialStatus.push({ provider, fields: [], updatedAt: null });
    renderCredentialStatus();
    notify(`${LABELS[provider]} 연결 정보를 삭제했습니다.`);
  } catch (error) { notify(koError(error)); }
}

async function uploadMedia(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = $('#serverMediaFiles').files?.[0];
  if (!file) return;
  const button = $('[type="submit"]', form);
  const status = $('#serverUploadState');
  button.disabled = true;
  button.textContent = '업로드 중';
  status.textContent = '안전한 업로드 주소 준비 중';
  try {
    const result = await uploadSocialFile({
      file,
      title: $('#serverMediaTitle').value.trim(),
      source: $('#serverMediaSource').value.trim(),
      observedAt: $('#serverMediaObservedAt').value,
      onState: message => { status.textContent = message; },
    });
    form.reset();
    status.textContent = '업로드 완료';
    notify(`${result.media.title}을 서버 보관함에 올렸습니다.`);
    await refreshMediaOnly();
  } catch (error) {
    status.textContent = koError(error);
  } finally {
    button.disabled = false;
    button.textContent = '서버 보관함에 올리기';
  }
}

export async function uploadSocialFile({ file, title, source, observedAt, onState = () => {} }) {
  if (!(file instanceof Blob) || !file.size) throw new Error('INVALID_MEDIA');
  const fileName = file.name || `earthus-${crypto.randomUUID()}.${file.type.startsWith('video/') ? 'mp4' : 'png'}`;
  onState('안전한 업로드 주소 준비 중');
  const prepared = await call('prepare_upload', { fileName, mimeType: file.type, size: file.size });
  const client = getClient();
  onState('서버로 파일 전송 중');
  const { error } = await client.storage.from(prepared.bucket).uploadToSignedUrl(
    prepared.path, prepared.token, file, { contentType: file.type },
  );
  if (error) throw error;
  onState('출처 정보 확인 중');
  const result = await call('finalize_upload', {
    id: prepared.id,
    path: prepared.path,
    fileName,
    mimeType: file.type,
    size: file.size,
    title,
    source,
    observedAt,
  });
  return result;
}

async function refreshMediaOnly() {
  const result = await call('list_media');
  media = result.media || [];
  renderMedia();
}

async function deleteMedia(item) {
  if (!confirm(`서버 보관함에서 ${item.title} 자료를 삭제할까요? 복구할 수 없습니다.`)) return;
  try {
    await call('delete_media', { id: item.id });
    media = media.filter(row => row.id !== item.id);
    renderMedia();
    notify('서버 보관함에서 삭제했습니다.');
  } catch (error) { notify(koError(error)); }
}

async function stableKey(provider, text, mediaId) {
  const bytes = new TextEncoder().encode(`${provider}\n${mediaId}\n${text}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function resultRow(provider, status, url = '') {
  const row = document.createElement('div');
  row.className = `publish-result${url === 'failed' ? ' failed' : ''}`;
  const name = document.createElement('strong');
  name.textContent = LABELS[provider];
  const message = document.createElement('span');
  message.textContent = status;
  row.append(name, message);
  if (url && url !== 'failed') {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '게시물 열기';
    row.append(link);
  }
  return row;
}

function validatePublish(providers, text, mediaId) {
  if (!providers.length) throw new Error('게시할 채널을 하나 이상 고르세요.');
  if (!text) throw new Error('게시 문구를 입력하세요.');
  for (const provider of providers) {
    if (text.length > LIMITS[provider]) throw new Error(`${LABELS[provider]} 문구는 ${LIMITS[provider]}자 이하여야 합니다.`);
    if (provider === 'instagram' && !mediaId) throw new Error('Instagram에는 사진 또는 영상을 함께 선택하세요.');
  }
  const missing = providers.filter(provider => !credentialStatus.find(item => item.provider === provider && item.fields?.length));
  if (missing.length) throw new Error(`${missing.map(provider => LABELS[provider]).join(', ')} 자격증명을 먼저 저장하세요.`);
}

async function publishNow(event) {
  event.preventDefault();
  const providers = $$('[name="publishProvider"]:checked').map(input => input.value);
  const text = $('#publishText').value.trim();
  const mediaId = $('#publishMedia').value;
  const confirmed = $('#publishConfirmed').checked;
  try {
    validatePublish(providers, text, mediaId);
    if (!confirmed) throw new Error('최종 확인에 체크하세요.');
  } catch (error) {
    notify(koError(error));
    return;
  }
  if (!confirm(`${providers.map(provider => LABELS[provider]).join(', ')}에 지금 실제 게시할까요?`)) return;

  const button = $('#publishNow');
  const results = $('#publishResults');
  button.disabled = true;
  results.hidden = false;
  results.innerHTML = '';
  let succeeded = 0;
  for (const provider of providers) {
    const pending = resultRow(provider, '게시 요청 중');
    results.append(pending);
    try {
      const idempotencyKey = await stableKey(provider, text, mediaId);
      const result = await call('publish', { provider, text, mediaId, idempotencyKey, confirmed: true });
      pending.replaceWith(resultRow(provider, result.duplicate ? '이미 처리한 요청입니다.' : '게시 완료', result.url || ''));
      succeeded += 1;
    } catch (error) {
      pending.replaceWith(resultRow(provider, koError(error), 'failed'));
    }
  }
  button.disabled = false;
  if (succeeded === providers.length) {
    $('#publishConfirmed').checked = false;
    notify(`${succeeded}개 채널 게시를 마쳤습니다.`);
  } else {
    notify(`${succeeded}/${providers.length}개 채널이 게시됐습니다. 실패한 채널을 확인하세요.`);
  }
}

function bind() {
  if (bound) return;
  bound = true;
  $$('.credential-card').forEach(form => {
    form.addEventListener('submit', saveCredential);
    $('.test-credential', form).addEventListener('click', () => testCredential(form));
    $('.clear-credential', form).addEventListener('click', () => clearCredential(form));
  });
  $('#refreshSocial').addEventListener('click', refreshSocialAdmin);
  $('#serverUploadForm').addEventListener('submit', uploadMedia);
  $('#serverMediaFiles').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file && !$('#serverMediaTitle').value) $('#serverMediaTitle').value = file.name.replace(/\.[^.]+$/, '');
  });
  $('#publishText').addEventListener('input', event => { $('#publishLength').textContent = String(event.target.value.length); });
  $('#publishForm').addEventListener('submit', publishNow);
}

export function setupSocialAdmin(options) {
  getClient = options.getClient;
  notify = options.toast;
  bind();
}

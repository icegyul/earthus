/* earthus SNS 연결 관리
 *
 * ⚠️⚠️ SNS 로그인 비밀번호는 받지 않는다. OAuth 토큰과 앱 자격증명만
 * 관리자 Edge Function으로 보내며 localStorage, IndexedDB, URL, 로그에 남기지 않는다.
 */

import { CONFIG } from './config.local.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const PROVIDERS = ['x', 'threads', 'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'];
const LABELS = {
  x: 'X', threads: 'Threads', instagram: 'Instagram', facebook: 'Facebook',
  tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube',
};
const LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

const state = { client: null, user: null, known: false, statuses: [] };
let toastTimer = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function koError(error) {
  const code = String(error?.message || error || 'UNKNOWN');
  const exact = {
    NO_AUTH: '로그인이 만료되었습니다. 다시 로그인하세요.',
    NOT_ADMIN: '서버 관리자 목록에 없는 계정입니다.',
    NOT_CONFIGURED: '먼저 자격증명을 저장하세요.',
    VAULT_NOT_CONFIGURED: '서버 암호화 키가 준비되지 않았습니다.',
    MISSING_FIELDS: '필수 입력값을 모두 채우세요.',
  };
  return exact[code] || code.replace(/^FunctionsHttpError:\s*/i, '').slice(0, 500);
}

async function call(action, fields = {}) {
  if (!state.client) throw new Error('NO_AUTH');
  const { data: { session }, error } = await state.client.auth.getSession();
  if (error || !session?.access_token) throw new Error('NO_AUTH');
  const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/social-admin`, {
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
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function paintStatuses() {
  let configured = 0;
  let verified = 0;
  for (const provider of PROVIDERS) {
    const item = state.statuses.find(row => row.provider === provider);
    const ready = !!item?.fields?.length;
    const badge = $(`[data-provider-state="${provider}"]`);
    const account = item?.account || {};
    const accountLabel = account.username ? `@${account.username}` : account.name || account.id || '';
    const checked = ready && !!item?.verifiedAt;
    badge.classList.toggle('configured', ready);
    badge.classList.remove('failed');
    badge.textContent = checked
      ? `계정 확인됨 · ${accountLabel || formatTime(item.verifiedAt)}`
      : ready ? `암호화 저장됨 · ${formatTime(item.updatedAt)}` : '저장 안 됨';
    if (ready) configured += 1;
    if (checked) verified += 1;
  }
  $('#settingsSummary').textContent = `${configured}/7개 저장 · ${verified}/7개 계정 확인됨`;
}

async function refreshStatuses() {
  $('#settingsSummary').textContent = '서버에서 확인 중입니다.';
  try {
    const result = await call('status');
    state.statuses = result.credentials || [];
    paintStatuses();
  } catch (error) {
    $('#settingsSummary').textContent = '연결 상태를 확인하지 못했습니다.';
    toast(koError(error));
  }
}

function formCredentials(form) {
  const credentials = {};
  new FormData(form).forEach((value, key) => {
    const clean = String(value).trim();
    if (clean) credentials[key] = clean;
  });
  return credentials;
}

async function saveCredentials(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const provider = form.dataset.provider;
  const submit = $('[type="submit"]', form);
  const errorBox = $('.credential-error', form);
  errorBox.hidden = true;
  submit.disabled = true;
  submit.textContent = '암호화 중';
  try {
    const result = await call('save_credentials', { provider, credentials: formCredentials(form) });
    form.reset();
    state.statuses = state.statuses.filter(item => item.provider !== provider);
    state.statuses.push(result.status);
    paintStatuses();
    toast(`${LABELS[provider]} 자격증명을 서버에서 암호화해 저장했습니다.`);
  } catch (error) {
    errorBox.textContent = koError(error);
    errorBox.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = '암호화 저장';
  }
}

async function testCredentials(form) {
  const provider = form.dataset.provider;
  const button = $('.test-credential', form);
  const badge = $(`[data-provider-state="${provider}"]`);
  button.disabled = true;
  button.textContent = '확인 중';
  try {
    const result = await call('test_credentials', { provider });
    const account = result.account || {};
    const accountLabel = account.username ? `@${account.username}` : account.name || account.id || '계정 확인됨';
    const previous = state.statuses.find(item => item.provider === provider) || { provider, fields: ['stored'] };
    state.statuses = state.statuses.filter(item => item.provider !== provider);
    state.statuses.push({ ...previous, verifiedAt: new Date().toISOString(), account });
    paintStatuses();
    toast(`${LABELS[provider]} 공식 API가 계정을 확인했습니다.`);
  } catch (error) {
    badge.textContent = '계정 확인 실패';
    badge.classList.add('failed');
    toast(koError(error));
  } finally {
    button.disabled = false;
    button.textContent = provider === 'youtube' ? '채널 확인' : '계정 확인';
  }
}

async function clearCredentials(form) {
  const provider = form.dataset.provider;
  if (!confirm(`${LABELS[provider]} 토큰과 앱 자격증명을 서버에서 삭제할까요?`)) return;
  try {
    await call('clear_credentials', { provider });
    state.statuses = state.statuses.filter(item => item.provider !== provider);
    paintStatuses();
    toast(`${LABELS[provider]} 연결 정보를 삭제했습니다.`);
  } catch (error) { toast(koError(error)); }
}

function bind() {
  $('#signInGoogle').addEventListener('click', () => state.client?.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: location.href },
  }));
  $('#signOut').addEventListener('click', async () => { await state.client?.auth.signOut(); location.reload(); });
  $('#refreshCredentials').addEventListener('click', refreshStatuses);
  $$('.credential-card').forEach(form => {
    form.addEventListener('submit', saveCredentials);
    $('.test-credential', form).addEventListener('click', () => testCredentials(form));
    $('.clear-credential', form).addEventListener('click', () => clearCredentials(form));
  });
}

async function paintGate() {
  const uids = CONFIG.ADMIN_UIDS || [];
  state.known = LOCAL_PREVIEW || (!!state.user && (uids.includes(state.user.id)
    || String(state.user.email || '').toLowerCase() === 'contentsdalur@gmail.com'));
  $('#signOut').hidden = !state.user;
  if (LOCAL_PREVIEW) {
    $('#who').textContent = '로컬 화면 미리보기';
    $('#gate').hidden = true;
    $('#settingsApp').hidden = false;
    state.statuses = PROVIDERS.map(provider => ({ provider, fields: [], updatedAt: null }));
    paintStatuses();
    return;
  }
  if (!state.user) {
    $('#who').textContent = '로그인하지 않음';
    $('#gate').hidden = false;
    $('#settingsApp').hidden = true;
    return;
  }
  $('#who').textContent = state.known ? '관리자 확인됨' : '관리자 목록에 없는 계정';
  $('#gate').hidden = state.known;
  $('#settingsApp').hidden = !state.known;
  if (!state.known) {
    $('#gateMessage').textContent = '이 계정은 관리자 목록에 없습니다. 다른 관리자 계정으로 로그인하세요.';
    return;
  }
  await refreshStatuses();
}

async function boot() {
  bind();
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    $('#who').textContent = '인증 설정 없음';
    $('#gateMessage').textContent = 'Supabase 설정이 없어 관리자 권한을 확인할 수 없습니다.';
    $('#signInGoogle').disabled = true;
    return;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  state.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await state.client.auth.getSession();
  state.user = data?.session?.user || null;
  state.client.auth.onAuthStateChange((_event, session) => { state.user = session?.user || null; paintGate(); });
  await paintGate();
}

boot().catch((error) => {
  $('#who').textContent = '권한 확인 실패';
  $('#gateMessage').textContent = koError(error);
});

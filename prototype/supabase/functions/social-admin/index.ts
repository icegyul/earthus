// earthus 관리자 SNS 연결과 수동 게시
//
// ⚠️⚠️ 자동 게시 경로는 없다. cron, webhook, 예약 실행에서 이 함수를 부르지 않는다.
//    게시 요청은 관리자 화면에서 사람이 확인 체크를 하고 누른 POST만 처리한다.
//
// ⚠️ 자격증명 원문은 응답, 로그, DB, Storage 메타데이터에 남기지 않는다.
//    SOCIAL_VAULT_KEY로 AES-GCM 암호화한 바이트만 비공개 Storage에 둔다.
//
// 배포
//   cd prototype
//   supabase functions deploy social-admin
//   supabase secrets set SOCIAL_ADMIN_UIDS=... SOCIAL_VAULT_KEY=... APP_ORIGIN=https://earthus.net

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'earthus-social-private';
const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
const META_VERSION = 'v23.0';
const PROVIDERS = ['x', 'threads', 'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const;
type Provider = typeof PROVIDERS[number];
type Json = Record<string, unknown>;

const REQUIRED: Record<Provider, string[]> = {
  x: ['accessToken'],
  threads: ['accessToken', 'userId'],
  instagram: ['accessToken', 'userId'],
  facebook: ['pageAccessToken', 'pageId'],
  tiktok: ['accessToken', 'refreshToken', 'clientKey', 'clientSecret'],
  linkedin: ['accessToken', 'authorUrn'],
  youtube: ['accessToken', 'refreshToken', 'clientId', 'clientSecret'],
};
const ALLOWED_FIELDS: Record<Provider, string[]> = {
  x: ['accessToken', 'clientId', 'clientSecret', 'refreshToken'],
  threads: ['accessToken', 'userId', 'appId', 'appSecret'],
  instagram: ['accessToken', 'userId', 'appId', 'appSecret', 'graphVersion'],
  facebook: ['pageAccessToken', 'pageId', 'appId', 'appSecret', 'graphVersion'],
  tiktok: ['accessToken', 'refreshToken', 'clientKey', 'clientSecret', 'openId', 'scope'],
  linkedin: ['accessToken', 'authorUrn', 'apiVersion'],
  youtube: ['accessToken', 'refreshToken', 'clientId', 'clientSecret'],
};

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net';
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': origin === allowed || local ? origin : allowed,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function providerOf(value: unknown): Provider | null {
  return PROVIDERS.includes(value as Provider) ? value as Provider : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(text: string) {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digest(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function vaultKey() {
  const encoded = Deno.env.get('SOCIAL_VAULT_KEY') ?? '';
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error('VAULT_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encrypt(value: Json) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(), plain));
  return new TextEncoder().encode(JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(cipher) }));
}

async function decrypt(blob: Blob) {
  const packed = JSON.parse(await blob.text());
  if (packed?.v !== 1) throw new Error('UNKNOWN_VAULT_VERSION');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(packed.iv) },
    await vaultKey(),
    base64ToBytes(packed.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as Json;
}

async function ensureBucket(admin: SupabaseClient) {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_MEDIA_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

async function authorize(req: Request) {
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) throw new Error('NO_AUTH');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
  });
  const { data: { user }, error } = await anon.auth.getUser();
  if (error || !user) throw new Error('NO_AUTH');

  const admins = (Deno.env.get('SOCIAL_ADMIN_UIDS') ?? '')
    .split(',').map((id) => id.trim()).filter(Boolean);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: dbAdmin } = await admin.from('admins').select('id').eq('id', user.id).maybeSingle();
  const owner = String(user.email ?? '').toLowerCase() === 'contentsdalur@gmail.com';
  // ⚠️⚠️ 환경변수·DB 등록·서버가 검증한 운영자 이메일만 허용한다. 클라이언트 표시는 믿지 않는다.
  if (!admins.includes(user.id) && !dbAdmin && !owner) throw new Error('NOT_ADMIN');

  await ensureBucket(admin);
  return { user, admin };
}

async function putJson(admin: SupabaseClient, path: string, value: unknown, upsert = true) {
  const body = new TextEncoder().encode(JSON.stringify(value));
  const { error } = await admin.storage.from(BUCKET).upload(path, body, {
    contentType: 'application/json; charset=utf-8', upsert,
  });
  if (error) throw error;
}

async function getJson(admin: SupabaseClient, path: string) {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

async function loadCredentials(admin: SupabaseClient, provider: Provider) {
  const { data, error } = await admin.storage.from(BUCKET).download(`credentials/${provider}.vault`);
  if (error || !data) return null;
  return decrypt(data);
}

async function saveCredentials(admin: SupabaseClient, provider: Provider, credentials: Json) {
  const encrypted = await encrypt(credentials);
  const { error } = await admin.storage.from(BUCKET).upload(`credentials/${provider}.vault`, encrypted, {
    contentType: 'application/octet-stream', upsert: true,
  });
  if (error) throw error;
  await putJson(admin, `credential-status/${provider}.json`, {
    provider,
    fields: Object.keys(credentials).filter((key) => cleanText(credentials[key], 20_000)),
    updatedAt: new Date().toISOString(),
  });
}

async function saveRefreshedCredentials(admin: SupabaseClient, provider: Provider, credentials: Json) {
  const previous = await getJson(admin, `credential-status/${provider}.json`);
  await saveCredentials(admin, provider, credentials);
  if (previous?.verifiedAt) {
    const current = await getJson(admin, `credential-status/${provider}.json`);
    await putJson(admin, `credential-status/${provider}.json`, {
      ...current, verifiedAt: previous.verifiedAt, account: previous.account,
    });
  }
}

async function credentialStatus(admin: SupabaseClient) {
  return Promise.all(PROVIDERS.map(async (provider) => {
    const status = await getJson(admin, `credential-status/${provider}.json`);
    return status ?? { provider, fields: [], updatedAt: null };
  }));
}

async function remoteJson(response: Response, label: string) {
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok || body?.error || body?.errors) {
    const detail = body?.error?.message || body?.detail || body?.title || body?.errors?.[0]?.detail || `${response.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return body;
}

async function tiktokJson(response: Response, label: string) {
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok || (body?.error?.code && body.error.code !== 'ok')) {
    throw new Error(`${label}: ${body?.error?.message || body?.error?.code || response.status}`);
  }
  return body;
}

function graphVersion(credentials: Json) {
  const value = cleanText(credentials.graphVersion, 12);
  return /^v\d+\.\d+$/.test(value) ? value : META_VERSION;
}

async function appSecretProof(token: string, secret: string) {
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function refreshTikTokToken(admin: SupabaseClient, credentials: Json) {
  const params = new URLSearchParams({
    client_key: String(credentials.clientKey),
    client_secret: String(credentials.clientSecret),
    grant_type: 'refresh_token',
    refresh_token: String(credentials.refreshToken),
  });
  const body = await remoteJson(await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  }), 'TikTok 토큰 갱신 실패');
  const next = {
    ...credentials,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || credentials.refreshToken,
    openId: body.open_id || credentials.openId,
    scope: body.scope || credentials.scope,
  };
  await saveRefreshedCredentials(admin, 'tiktok', next);
  return next;
}

async function refreshYouTubeToken(admin: SupabaseClient, credentials: Json) {
  const params = new URLSearchParams({
    client_id: String(credentials.clientId),
    client_secret: String(credentials.clientSecret),
    refresh_token: String(credentials.refreshToken),
    grant_type: 'refresh_token',
  });
  const body = await remoteJson(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  }), 'YouTube 토큰 갱신 실패');
  const next = { ...credentials, accessToken: body.access_token };
  await saveRefreshedCredentials(admin, 'youtube', next);
  return next;
}

function linkedInHeaders(credentials: Json, jsonBody = false) {
  const version = /^\d{6}$/.test(cleanText(credentials.apiVersion, 6))
    ? cleanText(credentials.apiVersion, 6) : '202603';
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    'Linkedin-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
    ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function testCredentials(admin: SupabaseClient, provider: Provider, stored: Json) {
  let credentials = stored;
  if (provider === 'x') {
    const response = await fetch('https://api.x.com/2/users/me?user.fields=username,name', {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    const body = await remoteJson(response, 'X 계정 확인 실패');
    return { id: body.data?.id, name: body.data?.name, username: body.data?.username };
  }

  if (provider === 'threads') {
    const query = new URLSearchParams({ fields: 'id,username', access_token: String(credentials.accessToken) });
    const body = await remoteJson(await fetch(`https://graph.threads.net/v1.0/me?${query}`), 'Threads 계정 확인 실패');
    return { id: body.id, username: body.username };
  }

  if (provider === 'tiktok') {
    credentials = await refreshTikTokToken(admin, credentials);
    const body = await tiktokJson(await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    }), 'TikTok 계정 확인 실패');
    return {
      id: credentials.openId,
      name: body.data?.creator_nickname,
      username: body.data?.creator_username,
      privacyLevels: body.data?.privacy_level_options,
      maxVideoSeconds: body.data?.max_video_post_duration_sec,
    };
  }

  if (provider === 'linkedin') {
    const body = await remoteJson(await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    }), 'LinkedIn 계정 확인 실패');
    return { id: body.sub || credentials.authorUrn, name: body.name };
  }

  if (provider === 'youtube') {
    credentials = await refreshYouTubeToken(admin, credentials);
    const query = new URLSearchParams({ part: 'id,snippet', mine: 'true', maxResults: '1' });
    const body = await remoteJson(await fetch(`https://www.googleapis.com/youtube/v3/channels?${query}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    }), 'YouTube 채널 확인 실패');
    const channel = body.items?.[0];
    if (!channel) throw new Error('YouTube 채널 확인 실패: 연결된 채널이 없습니다.');
    return { id: channel.id, name: channel.snippet?.title };
  }

  const token = provider === 'facebook' ? String(credentials.pageAccessToken) : String(credentials.accessToken);
  const id = provider === 'facebook' ? String(credentials.pageId) : String(credentials.userId);
  const proof = await appSecretProof(token, String(credentials.appSecret ?? ''));
  const query = new URLSearchParams({
    fields: provider === 'facebook' ? 'id,name' : 'id,username,account_type',
    access_token: token,
  });
  if (proof) query.set('appsecret_proof', proof);
  const host = provider === 'instagram' ? 'graph.instagram.com' : 'graph.facebook.com';
  const body = await remoteJson(await fetch(`https://${host}/${graphVersion(credentials)}/${id}?${query}`), `${provider} 계정 확인 실패`);
  return { id: body.id, name: body.name, username: body.username, accountType: body.account_type };
}

function safeName(value: string) {
  const cleaned = value.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 90) || 'media';
}

async function listMedia(admin: SupabaseClient) {
  const { data, error } = await admin.storage.from(BUCKET).list('catalog', {
    limit: 1000, sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  const rows = await Promise.all((data ?? []).filter((item) => item.name.endsWith('.json')).map(async (item) => {
    const meta = await getJson(admin, `catalog/${item.name}`);
    if (!meta?.storagePath) return null;
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(meta.storagePath, 3600);
    return { ...meta, previewUrl: signed?.signedUrl ?? null };
  }));
  return rows.filter(Boolean);
}

async function mediaMeta(admin: SupabaseClient, id: string) {
  const meta = await getJson(admin, `catalog/${id}.json`);
  if (!meta?.storagePath) throw new Error('MEDIA_NOT_FOUND');
  return meta;
}

async function signedMedia(admin: SupabaseClient, meta: any, seconds = 3600) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(meta.storagePath, seconds);
  if (error || !data?.signedUrl) throw error ?? new Error('SIGNED_URL_FAILED');
  return data.signedUrl;
}

async function xToken(admin: SupabaseClient, credentials: Json) {
  return { token: String(credentials.accessToken), credentials, admin };
}

async function refreshXToken(admin: SupabaseClient, credentials: Json) {
  const refreshToken = cleanText(credentials.refreshToken, 20_000);
  const clientId = cleanText(credentials.clientId, 1_000);
  if (!refreshToken || !clientId) throw new Error('X_TOKEN_EXPIRED');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const secret = cleanText(credentials.clientSecret, 5_000);
  if (secret) headers.Authorization = `Basic ${btoa(`${clientId}:${secret}`)}`;
  const refreshed = await remoteJson(await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body }), 'X 토큰 갱신 실패');
  const next = { ...credentials, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || refreshToken };
  await saveCredentials(admin, 'x', next);
  return String(refreshed.access_token);
}

async function withXRetry(admin: SupabaseClient, credentials: Json, call: (token: string) => Promise<Response>) {
  let response = await call(String(credentials.accessToken));
  if (response.status !== 401) return response;
  const token = await refreshXToken(admin, credentials);
  response = await call(token);
  return response;
}

async function uploadXMedia(admin: SupabaseClient, credentials: Json, blob: Blob, mime: string) {
  const init = new FormData();
  init.set('command', 'INIT');
  init.set('media_type', mime);
  init.set('total_bytes', String(blob.size));
  init.set('media_category', mime.startsWith('video/') ? 'tweet_video' : mime === 'image/gif' ? 'tweet_gif' : 'tweet_image');
  const initialized = await remoteJson(await withXRetry(admin, credentials, (token) => fetch('https://api.x.com/2/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: init,
  })), 'X 미디어 초기화 실패');
  const mediaId = String(initialized.data?.id || initialized.media_id_string || initialized.media_id || '');
  if (!mediaId) throw new Error('X_MEDIA_ID_MISSING');

  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0, segment = 0; offset < blob.size; offset += chunkSize, segment += 1) {
    const form = new FormData();
    form.set('command', 'APPEND');
    form.set('media_id', mediaId);
    form.set('segment_index', String(segment));
    form.set('media', blob.slice(offset, Math.min(offset + chunkSize, blob.size), mime), `chunk-${segment}`);
    await remoteJson(await withXRetry(admin, credentials, (token) => fetch('https://api.x.com/2/media/upload', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })), 'X 미디어 전송 실패');
  }

  const finish = new FormData();
  finish.set('command', 'FINALIZE');
  finish.set('media_id', mediaId);
  let finalized = await remoteJson(await withXRetry(admin, credentials, (token) => fetch('https://api.x.com/2/media/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: finish,
  })), 'X 미디어 처리 시작 실패');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const processing = finalized.data?.processing_info || finalized.processing_info;
    if (!processing || processing.state === 'succeeded') return mediaId;
    if (processing.state === 'failed') throw new Error(`X 미디어 처리 실패: ${processing.error?.message || '원인 없음'}`);
    const wait = Math.min(10, Math.max(1, Number(processing.check_after_secs) || 1));
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    const query = new URLSearchParams({ command: 'STATUS', media_id: mediaId });
    finalized = await remoteJson(await withXRetry(admin, credentials, (token) => fetch(`https://api.x.com/2/media/upload?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })), 'X 미디어 처리 확인 실패');
  }
  throw new Error('X_MEDIA_PROCESSING_TIMEOUT');
}

async function publishX(admin: SupabaseClient, credentials: Json, text: string, meta: any | null) {
  let mediaId = '';
  if (meta) {
    const { data, error } = await admin.storage.from(BUCKET).download(meta.storagePath);
    if (error || !data) throw error ?? new Error('MEDIA_DOWNLOAD_FAILED');
    mediaId = await uploadXMedia(admin, credentials, data, meta.mimeType);
  }
  const payload: any = { text };
  if (mediaId) payload.media = { media_ids: [mediaId] };
  const body = await remoteJson(await withXRetry(admin, credentials, (token) => fetch('https://api.x.com/2/tweets', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })), 'X 게시 실패');
  const id = String(body.data?.id || '');
  return { id, url: id ? `https://x.com/i/web/status/${id}` : null };
}

async function publishThreads(admin: SupabaseClient, credentials: Json, text: string, meta: any | null) {
  const token = String(credentials.accessToken);
  const userId = String(credentials.userId);
  const params = new URLSearchParams({ text, access_token: token });
  if (!meta) {
    params.set('media_type', 'TEXT');
  } else {
    const url = await signedMedia(admin, meta);
    const video = String(meta.mimeType).startsWith('video/');
    params.set('media_type', video ? 'VIDEO' : 'IMAGE');
    params.set(video ? 'video_url' : 'image_url', url);
  }
  const created = await remoteJson(await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  }), 'Threads 게시물 준비 실패');
  const publish = new URLSearchParams({ creation_id: String(created.id), access_token: token });
  const result = await remoteJson(await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: publish,
  }), 'Threads 게시 실패');
  let url = null;
  try {
    const query = new URLSearchParams({ fields: 'permalink', access_token: token });
    const post = await remoteJson(await fetch(`https://graph.threads.net/v1.0/${result.id}?${query}`), 'Threads 주소 확인 실패');
    url = post.permalink || null;
  } catch { /* 게시 성공 자체는 유지한다. */ }
  return { id: String(result.id), url };
}

async function publishInstagram(admin: SupabaseClient, credentials: Json, text: string, meta: any | null) {
  if (!meta) throw new Error('INSTAGRAM_MEDIA_REQUIRED');
  const token = String(credentials.accessToken);
  const userId = String(credentials.userId);
  const version = graphVersion(credentials);
  const proof = await appSecretProof(token, String(credentials.appSecret ?? ''));
  const url = await signedMedia(admin, meta);
  const video = String(meta.mimeType).startsWith('video/');
  const create = new URLSearchParams({ caption: text, access_token: token });
  create.set(video ? 'video_url' : 'image_url', url);
  if (video) create.set('media_type', 'REELS');
  if (proof) create.set('appsecret_proof', proof);
  const created = await remoteJson(await fetch(`https://graph.instagram.com/${version}/${userId}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: create,
  }), 'Instagram 게시물 준비 실패');

  if (video) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const query = new URLSearchParams({ fields: 'status_code', access_token: token });
      if (proof) query.set('appsecret_proof', proof);
      const status = await remoteJson(await fetch(`https://graph.instagram.com/${version}/${created.id}?${query}`), 'Instagram 영상 처리 확인 실패');
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') throw new Error(`Instagram 영상 처리 실패: ${status.status_code}`);
      if (attempt === 29) throw new Error('INSTAGRAM_PROCESSING_TIMEOUT');
    }
  }

  const publish = new URLSearchParams({ creation_id: String(created.id), access_token: token });
  if (proof) publish.set('appsecret_proof', proof);
  const result = await remoteJson(await fetch(`https://graph.instagram.com/${version}/${userId}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: publish,
  }), 'Instagram 게시 실패');
  let permalink = null;
  try {
    const query = new URLSearchParams({ fields: 'permalink', access_token: token });
    if (proof) query.set('appsecret_proof', proof);
    const post = await remoteJson(await fetch(`https://graph.instagram.com/${version}/${result.id}?${query}`), 'Instagram 주소 확인 실패');
    permalink = post.permalink || null;
  } catch { /* 게시 성공 자체는 유지한다. */ }
  return { id: String(result.id), url: permalink };
}

async function publishFacebook(admin: SupabaseClient, credentials: Json, text: string, meta: any | null) {
  const token = String(credentials.pageAccessToken);
  const pageId = String(credentials.pageId);
  const version = graphVersion(credentials);
  const proof = await appSecretProof(token, String(credentials.appSecret ?? ''));
  let id = '';

  if (!meta) {
    const params = new URLSearchParams({ message: text, access_token: token });
    if (proof) params.set('appsecret_proof', proof);
    const result = await remoteJson(await fetch(`https://graph.facebook.com/${version}/${pageId}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    }), 'Facebook 게시 실패');
    id = String(result.id || '');
  } else if (String(meta.mimeType).startsWith('video/')) {
    const start = new URLSearchParams({ access_token: token, upload_phase: 'start' });
    if (proof) start.set('appsecret_proof', proof);
    const initialized = await remoteJson(await fetch(`https://graph.facebook.com/${version}/${pageId}/video_reels`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: start,
    }), 'Facebook 릴스 준비 실패');
    const signed = await signedMedia(admin, meta);
    const uploaded = await fetch(String(initialized.upload_url), {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_url: signed },
    });
    await remoteJson(uploaded, 'Facebook 릴스 업로드 실패');
    const finish = new URLSearchParams({
      access_token: token, video_id: String(initialized.video_id), upload_phase: 'finish',
      video_state: 'PUBLISHED', description: text,
    });
    if (proof) finish.set('appsecret_proof', proof);
    await remoteJson(await fetch(`https://graph.facebook.com/${version}/${pageId}/video_reels`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: finish,
    }), 'Facebook 릴스 게시 실패');
    id = String(initialized.video_id || '');
  } else {
    const signed = await signedMedia(admin, meta);
    const params = new URLSearchParams({ url: signed, caption: text, published: 'true', access_token: token });
    if (proof) params.set('appsecret_proof', proof);
    const result = await remoteJson(await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    }), 'Facebook 사진 게시 실패');
    id = String(result.post_id || result.id || '');
  }

  let permalink = null;
  if (id) {
    try {
      const query = new URLSearchParams({ fields: 'permalink_url', access_token: token });
      if (proof) query.set('appsecret_proof', proof);
      const post = await remoteJson(await fetch(`https://graph.facebook.com/${version}/${id}?${query}`), 'Facebook 주소 확인 실패');
      permalink = post.permalink_url || null;
    } catch { /* 게시 성공 자체는 유지한다. */ }
  }
  return { id, url: permalink };
}

async function publishTikTok(admin: SupabaseClient, stored: Json, text: string, meta: any | null, options: Json) {
  if (!meta || !String(meta.mimeType).startsWith('video/')) throw new Error('TIKTOK_VIDEO_REQUIRED');
  const privacy = cleanText(options.privacyLevel, 80);
  if (!['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(privacy)) {
    throw new Error('TIKTOK_PRIVACY_REQUIRED');
  }
  const credentials = await refreshTikTokToken(admin, stored);
  const creator = await tiktokJson(await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
  }), 'TikTok 게시 권한 확인 실패');
  if (!creator.data?.privacy_level_options?.includes(privacy)) throw new Error('TIKTOK_PRIVACY_NOT_ALLOWED');

  const { data: blob, error } = await admin.storage.from(BUCKET).download(meta.storagePath);
  if (error || !blob) throw error ?? new Error('MEDIA_DOWNLOAD_FAILED');
  const chunkSize = blob.size < 5 * 1024 * 1024 ? blob.size : Math.min(32 * 1024 * 1024, blob.size);
  const totalChunkCount = Math.max(1, Math.floor(blob.size / chunkSize));
  const initialized = await tiktokJson(await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: text.slice(0, 2200), privacy_level: privacy,
        disable_duet: false, disable_comment: false, disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD', video_size: blob.size,
        chunk_size: chunkSize, total_chunk_count: totalChunkCount,
      },
    }),
  }), 'TikTok 게시 준비 실패');
  const uploadUrl = String(initialized.data?.upload_url || '');
  const publishId = String(initialized.data?.publish_id || '');
  if (!uploadUrl || !publishId) throw new Error('TIKTOK_UPLOAD_URL_MISSING');

  for (let index = 0; index < totalChunkCount; index += 1) {
    const first = index * chunkSize;
    const last = index === totalChunkCount - 1 ? blob.size - 1 : Math.min(blob.size - 1, first + chunkSize - 1);
    const part = blob.slice(first, last + 1, meta.mimeType);
    const uploaded = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': meta.mimeType,
        'Content-Length': String(part.size),
        'Content-Range': `bytes ${first}-${last}/${blob.size}`,
      },
      body: part,
    });
    if (![200, 201, 206].includes(uploaded.status)) throw new Error(`TikTok 영상 전송 실패: ${uploaded.status}`);
  }
  return { id: publishId, url: null };
}

async function uploadLinkedInImage(credentials: Json, owner: string, blob: Blob) {
  const initialized = await remoteJson(await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST', headers: linkedInHeaders(credentials, true),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  }), 'LinkedIn 이미지 준비 실패');
  const uploadUrl = String(initialized.value?.uploadUrl || '');
  const image = String(initialized.value?.image || '');
  if (!uploadUrl || !image) throw new Error('LINKEDIN_IMAGE_UPLOAD_MISSING');
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT', headers: { Authorization: `Bearer ${credentials.accessToken}` }, body: blob,
  });
  if (!uploaded.ok) throw new Error(`LinkedIn 이미지 전송 실패: ${uploaded.status}`);
  return image;
}

async function uploadLinkedInVideo(credentials: Json, owner: string, blob: Blob) {
  const initialized = await remoteJson(await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
    method: 'POST', headers: linkedInHeaders(credentials, true),
    body: JSON.stringify({ initializeUploadRequest: {
      owner, fileSizeBytes: blob.size, uploadCaptions: false, uploadThumbnail: false,
    } }),
  }), 'LinkedIn 영상 준비 실패');
  const value = initialized.value || {};
  const parts: string[] = [];
  for (const instruction of value.uploadInstructions || []) {
    const first = Number(instruction.firstByte);
    const last = Math.min(blob.size - 1, Number(instruction.lastByte));
    const uploaded = await fetch(String(instruction.uploadUrl), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      body: blob.slice(first, last + 1),
    });
    if (!uploaded.ok) throw new Error(`LinkedIn 영상 전송 실패: ${uploaded.status}`);
    const partId = (uploaded.headers.get('etag') || '').replace(/^\"|\"$/g, '');
    if (!partId) throw new Error('LINKEDIN_VIDEO_PART_ID_MISSING');
    parts.push(partId);
  }
  const video = String(value.video || '');
  if (!video || !parts.length) throw new Error('LINKEDIN_VIDEO_UPLOAD_MISSING');
  await remoteJson(await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    method: 'POST', headers: linkedInHeaders(credentials, true),
    body: JSON.stringify({ finalizeUploadRequest: {
      video, uploadToken: value.uploadToken || '', uploadedPartIds: parts,
    } }),
  }), 'LinkedIn 영상 마무리 실패');
  return video;
}

async function publishLinkedIn(admin: SupabaseClient, credentials: Json, text: string, meta: any | null) {
  const owner = cleanText(credentials.authorUrn, 300);
  if (!/^urn:li:(person|organization):/.test(owner)) throw new Error('LINKEDIN_AUTHOR_INVALID');
  let mediaUrn = '';
  if (meta) {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(meta.storagePath);
    if (error || !blob) throw error ?? new Error('MEDIA_DOWNLOAD_FAILED');
    mediaUrn = String(meta.mimeType).startsWith('video/')
      ? await uploadLinkedInVideo(credentials, owner, blob)
      : await uploadLinkedInImage(credentials, owner, blob);
  }
  const payload: any = {
    author: owner, commentary: text, visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
  };
  if (mediaUrn) payload.content = { media: { id: mediaUrn, title: meta?.title || 'earthus' } };
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST', headers: linkedInHeaders(credentials, true), body: JSON.stringify(payload),
  });
  if (!response.ok) await remoteJson(response, 'LinkedIn 게시 실패');
  const id = response.headers.get('x-restli-id') || '';
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
}

async function publishYouTube(admin: SupabaseClient, stored: Json, text: string, meta: any | null, options: Json) {
  if (!meta || !String(meta.mimeType).startsWith('video/')) throw new Error('YOUTUBE_VIDEO_REQUIRED');
  const title = cleanText(options.title, 100);
  const privacyStatus = cleanText(options.privacyStatus, 20);
  if (!title) throw new Error('YOUTUBE_TITLE_REQUIRED');
  if (!['private', 'unlisted', 'public'].includes(privacyStatus)) throw new Error('YOUTUBE_PRIVACY_REQUIRED');
  const credentials = await refreshYouTubeToken(admin, stored);
  const { data: blob, error } = await admin.storage.from(BUCKET).download(meta.storagePath);
  if (error || !blob) throw error ?? new Error('MEDIA_DOWNLOAD_FAILED');
  const metadata = JSON.stringify({
    snippet: { title, description: text, categoryId: cleanText(options.categoryId, 10) || '28' },
    status: { privacyStatus, selfDeclaredMadeForKids: false },
  });
  const initialized = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(blob.size),
      'X-Upload-Content-Type': meta.mimeType,
    },
    body: metadata,
  });
  if (!initialized.ok) await remoteJson(initialized, 'YouTube 업로드 준비 실패');
  const uploadUrl = initialized.headers.get('location');
  if (!uploadUrl) throw new Error('YOUTUBE_UPLOAD_URL_MISSING');
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': meta.mimeType,
      'Content-Length': String(blob.size),
    },
    body: blob,
  });
  const result = await remoteJson(uploaded, 'YouTube 영상 업로드 실패');
  const id = String(result.id || '');
  return { id, url: id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null };
}

async function publish(admin: SupabaseClient, provider: Provider, credentials: Json, text: string, meta: any | null, options: Json) {
  if (provider === 'x') return publishX(admin, credentials, text, meta);
  if (provider === 'threads') return publishThreads(admin, credentials, text, meta);
  if (provider === 'instagram') return publishInstagram(admin, credentials, text, meta);
  if (provider === 'facebook') return publishFacebook(admin, credentials, text, meta);
  if (provider === 'tiktok') return publishTikTok(admin, credentials, text, meta, options);
  if (provider === 'linkedin') return publishLinkedIn(admin, credentials, text, meta);
  return publishYouTube(admin, credentials, text, meta, options);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'METHOD' }, 405);

  try {
    const { user, admin } = await authorize(req);
    const body = await req.json() as Json;
    const action = cleanText(body.action, 80);

    if (action === 'status') {
      return json(req, { credentials: await credentialStatus(admin), media: await listMedia(admin) });
    }

    if (action === 'save_credentials') {
      const provider = providerOf(body.provider);
      const credentials = body.credentials && typeof body.credentials === 'object' ? body.credentials as Json : {};
      if (!provider) return json(req, { error: 'UNKNOWN_PROVIDER' }, 400);
      /* ⚠️ 로그인 비밀번호처럼 이 서비스가 보관하면 안 되는 임의 필드는
         관리자 요청이어도 버린다. 화면만 믿지 말고 서버 허용 목록으로 막는다. */
      const cleaned = Object.fromEntries(Object.entries(credentials)
        .filter(([key]) => ALLOWED_FIELDS[provider].includes(key))
        .map(([key, value]) => [key, cleanText(value, 20_000)]).filter(([, value]) => value));
      const missing = REQUIRED[provider].filter((key) => !cleanText(cleaned[key], 20_000));
      if (missing.length) return json(req, { error: 'MISSING_FIELDS', fields: missing }, 400);
      await saveCredentials(admin, provider, cleaned);
      return json(req, { ok: true, provider, status: (await credentialStatus(admin)).find((item: any) => item.provider === provider) });
    }

    if (action === 'clear_credentials') {
      const provider = providerOf(body.provider);
      if (!provider) return json(req, { error: 'UNKNOWN_PROVIDER' }, 400);
      await admin.storage.from(BUCKET).remove([`credentials/${provider}.vault`, `credential-status/${provider}.json`]);
      return json(req, { ok: true, provider });
    }

    if (action === 'test_credentials') {
      const provider = providerOf(body.provider);
      if (!provider) return json(req, { error: 'UNKNOWN_PROVIDER' }, 400);
      const credentials = await loadCredentials(admin, provider);
      if (!credentials) return json(req, { error: 'NOT_CONFIGURED' }, 409);
      const account = await testCredentials(admin, provider, credentials);
      const previous = await getJson(admin, `credential-status/${provider}.json`) || { provider, fields: [] };
      await putJson(admin, `credential-status/${provider}.json`, {
        ...previous, provider, verifiedAt: new Date().toISOString(), account,
      });
      return json(req, { ok: true, provider, account });
    }

    if (action === 'prepare_upload') {
      const id = crypto.randomUUID();
      const fileName = safeName(cleanText(body.fileName, 160));
      const mimeType = cleanText(body.mimeType, 120);
      const size = Number(body.size);
      if (!/^(image|video)\//.test(mimeType) || !Number.isFinite(size) || size <= 0 || size > MAX_MEDIA_BYTES) {
        return json(req, { error: 'INVALID_MEDIA' }, 400);
      }
      const storagePath = `media/${id}/${fileName}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
      if (error || !data) throw error ?? new Error('SIGNED_UPLOAD_FAILED');
      return json(req, { id, bucket: BUCKET, path: storagePath, token: data.token });
    }

    if (action === 'finalize_upload') {
      const id = cleanText(body.id, 80);
      const storagePath = cleanText(body.path, 500);
      if (!id || !storagePath.startsWith(`media/${id}/`)) return json(req, { error: 'INVALID_PATH' }, 400);
      const parts = storagePath.split('/');
      const fileName = parts.at(-1)!;
      const { data, error } = await admin.storage.from(BUCKET).list(`media/${id}`, { search: fileName, limit: 10 });
      if (error || !data?.some((item) => item.name === fileName)) return json(req, { error: 'UPLOAD_NOT_FOUND' }, 409);
      const meta = {
        id, storagePath, fileName,
        mimeType: cleanText(body.mimeType, 120),
        size: Number(body.size) || null,
        title: cleanText(body.title, 140) || fileName,
        source: cleanText(body.source, 240),
        observedAt: cleanText(body.observedAt, 80),
        createdAt: new Date().toISOString(),
        createdBy: user.id,
      };
      if (!meta.source || !meta.observedAt) return json(req, { error: 'PROVENANCE_REQUIRED' }, 400);
      await putJson(admin, `catalog/${id}.json`, meta, false);
      return json(req, { ok: true, media: meta });
    }

    if (action === 'list_media') return json(req, { media: await listMedia(admin) });

    if (action === 'delete_media') {
      const id = cleanText(body.id, 80);
      const meta = await mediaMeta(admin, id);
      await admin.storage.from(BUCKET).remove([meta.storagePath, `catalog/${id}.json`]);
      return json(req, { ok: true, id });
    }

    if (action === 'publish') {
      const provider = providerOf(body.provider);
      const text = cleanText(body.text, 10_000);
      const mediaId = cleanText(body.mediaId, 80);
      const options = body.options && typeof body.options === 'object' ? body.options as Json : {};
      const idempotencyKey = cleanText(body.idempotencyKey, 300);
      if (!provider || !text || body.confirmed !== true || !idempotencyKey) {
        return json(req, { error: 'PUBLISH_CONFIRMATION_REQUIRED' }, 400);
      }
      const credentials = await loadCredentials(admin, provider);
      if (!credentials) return json(req, { error: 'NOT_CONFIGURED', provider }, 409);
      const connection = await getJson(admin, `credential-status/${provider}.json`);
      if (!connection?.verifiedAt) return json(req, { error: 'ACCOUNT_NOT_VERIFIED', provider }, 409);
      const meta = mediaId ? await mediaMeta(admin, mediaId) : null;
      const lockId = await digest(`${provider}:${idempotencyKey}`);
      const lockPath = `publish-locks/${lockId}.json`;
      const previous = await getJson(admin, lockPath);
      if (previous?.result) return json(req, { ok: true, duplicate: true, ...previous.result });
      try {
        await putJson(admin, lockPath, { provider, idempotencyKey, startedAt: new Date().toISOString(), userId: user.id }, false);
      } catch (error) {
        const raced = await getJson(admin, lockPath);
        if (raced?.result) return json(req, { ok: true, duplicate: true, ...raced.result });
        return json(req, { error: 'PUBLISH_IN_PROGRESS' }, 409);
      }

      try {
        const result = await publish(admin, provider, credentials, text, meta, options);
        const log = {
          id: crypto.randomUUID(), provider, mediaId: mediaId || null,
          postId: result.id, url: result.url, textDigest: await digest(text),
          publishedAt: new Date().toISOString(), publishedBy: user.id,
        };
        await putJson(admin, `publish-log/${log.id}.json`, log, false);
        await putJson(admin, lockPath, { provider, idempotencyKey, result: log }, true);
        return json(req, { ok: true, ...log });
      } catch (error) {
        await admin.storage.from(BUCKET).remove([lockPath]);
        throw error;
      }
    }

    return json(req, { error: 'UNKNOWN_ACTION' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'NO_AUTH' ? 401 : message === 'NOT_ADMIN' ? 403 : 500;
    // ⚠️ 원격 응답에 토큰이 섞일 수 있어 서버 콘솔에 error 객체를 그대로 찍지 않는다.
    return json(req, { error: message }, status);
  }
});

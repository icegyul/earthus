// earthus 회원관리 — 관리자만 회원 조회·유료 초대·연장·취소.
// ⚠️ service_role은 이 함수 밖으로 내보내지 않는다. 클라이언트 UID 목록은 화면 가림일 뿐,
// 여기서 SOCIAL_ADMIN_UIDS와 로그인 JWT를 다시 확인하는 것이 실제 변경 경계다.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
});
const cleanEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

async function context(req: Request) {
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) throw new Error('NO_AUTH');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) throw new Error('NO_AUTH');
  const admins = (Deno.env.get('SOCIAL_ADMIN_UIDS') ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (!admins.length || !admins.includes(user.id)) throw new Error('NOT_ADMIN');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return { user, admin };
}

async function allUsers(admin: any) {
  const out: any[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < 1000) break;
  }
  return out;
}

async function list(admin: any, query: string) {
  const users = await allUsers(admin);
  const ids = users.map(x => x.id);
  const { data: profiles, error } = ids.length
    ? await admin.from('profiles').select('id,provider,tier,founding_member,subscription_ends,manual_access_until,manual_access_kind,manual_access_reason,created_at').in('id', ids)
    : { data: [], error: null };
  if (error) throw error;
  const byId = new Map((profiles ?? []).map((x: any) => [x.id, x]));
  const q = cleanEmail(query);
  const rows = users.map((u: any) => ({
    id: u.id, email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null,
    ...(byId.get(u.id) ?? { tier: 'free', created_at: u.created_at }),
  })).filter((x: any) => !q || cleanEmail(x.email).includes(q) || x.id.startsWith(q))
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 200);
  const now = Date.now();
  const stats = {
    all: users.length,
    paid: (profiles ?? []).filter((x: any) => x.tier === 'paid').length,
    payment: (profiles ?? []).filter((x: any) => Date.parse(x.subscription_ends ?? '') > now).length,
    invited: (profiles ?? []).filter((x: any) => Date.parse(x.manual_access_until ?? '') > now).length,
  };
  const { data: pending } = await admin.from('member_invites')
    .select('id,email,kind,reason,starts_at,ends_at,created_at').is('claimed_at', null).is('revoked_at', null)
    .gt('ends_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(100);
  return { rows, stats, pending: pending ?? [] };
}

async function grant(admin: any, actor: string, body: any) {
  const email = cleanEmail(body.email);
  const kind = String(body.kind ?? 'test');
  const reason = String(body.reason ?? '').trim().slice(0, 300);
  const endsAt = new Date(String(body.endsAt ?? ''));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BAD_EMAIL');
  if (!['test', 'academic', 'operations'].includes(kind)) throw new Error('BAD_KIND');
  if (reason.length < 2) throw new Error('BAD_REASON');
  if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= Date.now()) throw new Error('BAD_END');
  if (endsAt.getTime() > Date.now() + 366 * 86400_000) throw new Error('END_TOO_FAR');

  const users = await allUsers(admin);
  const target = users.find((u: any) => cleanEmail(u.email) === email);
  if (target) {
    const { data: before } = await admin.from('profiles')
      .select('manual_access_until').eq('id', target.id).maybeSingle();
    const oldEnd = Date.parse(before?.manual_access_until ?? '');
    const chosenEnd = new Date(Math.max(Number.isFinite(oldEnd) ? oldEnd : 0, endsAt.getTime())).toISOString();
    const { error } = await admin.from('profiles').update({
      tier: 'paid', manual_access_until: chosenEnd,
      manual_access_kind: kind, manual_access_reason: reason,
    }).eq('id', target.id);
    if (error) throw error;
    await admin.from('member_access_audit').insert({
      actor_id: actor, target_user_id: target.id,
      action: Number.isFinite(oldEnd) ? 'grant_extended' : 'grant_applied',
      detail: { email, kind, reason, ends_at: chosenEnd },
    });
    return { ok: true, applied: true, userId: target.id, endsAt: chosenEnd };
  }

  const { data: old } = await admin.from('member_invites').select('id')
    .eq('email', email).is('claimed_at', null).is('revoked_at', null).maybeSingle();
  if (old?.id) await admin.from('member_invites').update({ revoked_at: new Date().toISOString(), revoked_by: actor }).eq('id', old.id);
  const { data: invite, error } = await admin.from('member_invites').insert({
    email, kind, reason, ends_at: endsAt.toISOString(), created_by: actor,
  }).select('id').single();
  if (error) throw error;
  await admin.from('member_access_audit').insert({
    actor_id: actor, invite_id: invite.id, action: 'invite_created',
    detail: { email, kind, reason, ends_at: endsAt.toISOString() },
  });
  return { ok: true, applied: false, inviteId: invite.id, endsAt: endsAt.toISOString() };
}

async function revoke(admin: any, actor: string, userId: string, reason: string) {
  if (!userId) throw new Error('BAD_USER');
  const { data: profile } = await admin.from('profiles')
    .select('subscription_ends,manual_access_until').eq('id', userId).maybeSingle();
  if (!profile?.manual_access_until) return { ok: true, already: true };
  const paymentActive = Date.parse(profile.subscription_ends ?? '') > Date.now();
  const { error } = await admin.from('profiles').update({
    tier: paymentActive ? 'paid' : 'free', manual_access_until: null,
    manual_access_kind: null, manual_access_reason: null,
  }).eq('id', userId);
  if (error) throw error;
  await admin.from('member_access_audit').insert({
    actor_id: actor, target_user_id: userId, action: 'grant_revoked',
    detail: { reason: reason.slice(0, 300), payment_remains: paymentActive },
  });
  return { ok: true, paymentRemains: paymentActive };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  try {
    const { user, admin } = await context(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'list');
    if (action === 'list') return json(await list(admin, String(body.query ?? '')));
    if (action === 'grant') return json(await grant(admin, user.id, body));
    if (action === 'revoke') return json(await revoke(admin, user.id, String(body.userId ?? ''), String(body.reason ?? '')));
    return json({ error: 'BAD_ACTION' }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === 'NO_AUTH' ? 401 : message === 'NOT_ADMIN' ? 403 : 400;
    console.error('[member-admin]', message);
    return json({ error: message }, status);
  }
});

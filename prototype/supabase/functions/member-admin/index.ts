// EARTHUS member administration — server-enforced membership + staff RBAC.
// Security boundary:
// - browser UID/email/config is never an authorization input
// - authenticated JWT resolves the actor
// - public.staff_roles is the only staff-role authority
// - service_role never leaves this Edge Function

import { createClient } from 'jsr:@supabase/supabase-js@2';

type StaffRole = 'SUPER_ADMIN' | 'DEVELOPER' | 'OPERATIONS';
type Capability =
  | 'member.read'
  | 'member.write'
  | 'staff.manage'
  | 'provider.read'
  | 'provider.secret.write'
  | 'sns.read'
  | 'sns.publish'
  | 'feature_gate.manage';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
});
const cleanEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const validRoles = new Set<StaffRole>(['SUPER_ADMIN', 'DEVELOPER', 'OPERATIONS']);

function roleCapabilities(roles: StaffRole[]) {
  const has = (role: StaffRole) => roles.includes(role);
  return {
    member_read: has('SUPER_ADMIN') || has('OPERATIONS'),
    member_write: has('SUPER_ADMIN') || has('OPERATIONS'),
    staff_manage: has('SUPER_ADMIN'),
    provider_read: has('SUPER_ADMIN') || has('DEVELOPER') || has('OPERATIONS'),
    provider_secret_write: has('SUPER_ADMIN') || has('DEVELOPER'),
    sns_read: has('SUPER_ADMIN') || has('DEVELOPER') || has('OPERATIONS'),
    sns_publish: has('SUPER_ADMIN') || has('OPERATIONS'),
    feature_gate_manage: has('SUPER_ADMIN'),
  };
}

type StaffContext = Awaited<ReturnType<typeof context>>;

function requireCapability(ctx: StaffContext, capability: Capability) {
  const key = capability.replaceAll('.', '_') as keyof ReturnType<typeof roleCapabilities>;
  if (!ctx.capabilities[key]) throw new Error('FORBIDDEN');
}

async function context(req: Request) {
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) throw new Error('NO_AUTH');

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRole) throw new Error('SERVER_CONFIG');

  const sessionClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) throw new Error('NO_AUTH');

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRows, error: roleError } = await admin
    .from('staff_roles').select('role').eq('user_id', user.id);
  if (roleError) throw new Error('RBAC_NOT_READY');

  const roles = (roleRows ?? [])
    .map((row: any) => String(row.role) as StaffRole)
    .filter((role: StaffRole) => validRoles.has(role));
  const capabilities = roleCapabilities(roles);
  return { user, admin, roles, capabilities };
}

function publicContext(ctx: StaffContext) {
  return { roles: ctx.roles, capabilities: ctx.capabilities };
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

function canonicalMembership(profile: any, now = Date.now()) {
  if (Date.parse(profile?.subscription_ends ?? '') > now) return 'paid';
  if (Date.parse(profile?.manual_access_until ?? '') > now) return 'invite';
  if (['free', 'paid', 'invite'].includes(profile?.membership_class)) return profile.membership_class;
  return profile?.tier === 'paid' ? 'paid' : 'free';
}

async function list(admin: any, query: string, classFilter: string, stateFilter: string) {
  const users = await allUsers(admin);
  const ids = users.map(x => x.id);
  const { data: profiles, error } = ids.length
    ? await admin.from('profiles').select(
        'id,provider,tier,membership_class,account_state,founding_member,subscription_ends,manual_access_until,manual_access_kind,manual_access_reason,created_at,updated_at'
      ).in('id', ids)
    : { data: [], error: null };
  if (error) throw error;

  const byId = new Map((profiles ?? []).map((x: any) => [x.id, x]));
  const q = cleanEmail(query);
  const wantedClass = ['free', 'paid', 'invite'].includes(classFilter) ? classFilter : '';
  const wantedState = ['active', 'invited', 'suspended', 'cancelled', 'expired'].includes(stateFilter) ? stateFilter : '';
  const now = Date.now();

  let rows = users.map((u: any) => {
    const profile: any = byId.get(u.id) ?? { tier: 'free', account_state: 'active', created_at: u.created_at };
    return {
      id: u.id,
      email: u.email ?? null,
      provider: profile.provider ?? u.app_metadata?.provider ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      ...profile,
      membership_class: canonicalMembership(profile, now),
      account_state: profile.account_state ?? 'active',
    };
  }).filter((x: any) =>
    (!q || cleanEmail(x.email).includes(q) || x.id.startsWith(q)) &&
    (!wantedClass || x.membership_class === wantedClass) &&
    (!wantedState || x.account_state === wantedState)
  ).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
   .slice(0, 200);

  const visibleIds = rows.map((row: any) => row.id);
  const { data: staffRows, error: staffError } = visibleIds.length
    ? await admin.from('staff_roles').select('user_id,role').in('user_id', visibleIds)
    : { data: [], error: null };
  if (staffError) throw staffError;
  const staffById = new Map<string, string[]>();
  for (const row of staffRows ?? []) {
    const list = staffById.get(row.user_id) ?? [];
    list.push(row.role);
    staffById.set(row.user_id, list);
  }
  rows = rows.map((row: any) => ({ ...row, staff_roles: (staffById.get(row.id) ?? []).sort() }));

  const allProfiles = users.map((u: any) => byId.get(u.id) ?? { tier: 'free' });
  const classes = allProfiles.map((p: any) => canonicalMembership(p, now));
  const stats = {
    all: users.length,
    free: classes.filter((x: string) => x === 'free').length,
    paid: classes.filter((x: string) => x === 'paid').length,
    invite: classes.filter((x: string) => x === 'invite').length,
  };

  const { data: pending, error: pendingError } = await admin.from('member_invites')
    .select('id,email,kind,reason,starts_at,ends_at,created_at')
    .is('claimed_at', null).is('revoked_at', null)
    .gt('ends_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(100);
  if (pendingError) throw pendingError;
  return { rows, stats, pending: pending ?? [] };
}

async function audit(admin: any, actor: string, action: string, detail: Record<string, unknown>, targetUserId?: string | null, objectKind?: string | null, objectId?: string | null) {
  const { error } = await admin.from('admin_audit_log').insert({
    actor_id: actor,
    action,
    target_user_id: targetUserId ?? null,
    object_kind: objectKind ?? null,
    object_id: objectId ?? null,
    detail,
  });
  if (error) console.error('[member-admin] audit write failed', error.message);
}

async function grant(admin: any, actor: string, body: any) {
  const email = cleanEmail(body.email);
  const kind = String(body.kind ?? 'test');
  const reason = String(body.reason ?? '').trim().slice(0, 300);
  const permanent = body.permanent === true;
  const endsAt = permanent ? new Date('9999-12-31T23:59:59Z') : new Date(String(body.endsAt ?? ''));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BAD_EMAIL');
  if (!['test', 'academic', 'operations'].includes(kind)) throw new Error('BAD_KIND');
  if (reason.length < 2) throw new Error('BAD_REASON');
  if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= Date.now()) throw new Error('BAD_END');
  if (!permanent && endsAt.getTime() > Date.now() + 366 * 86400_000) throw new Error('END_TOO_FAR');

  const users = await allUsers(admin);
  const target = users.find((u: any) => cleanEmail(u.email) === email);
  if (target) {
    const { data: before } = await admin.from('profiles')
      .select('manual_access_until,subscription_ends').eq('id', target.id).maybeSingle();
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
      detail: { email, kind, reason, ends_at: chosenEnd, permanent },
    });
    await audit(admin, actor, 'member.invite_grant', { kind, reason, ends_at: chosenEnd, permanent }, target.id, 'profile', target.id);
    return { ok: true, applied: true, userId: target.id, endsAt: chosenEnd };
  }

  if (permanent) throw new Error('SIGN_UP_FIRST_FOR_PERMANENT');
  const { data: old } = await admin.from('member_invites').select('id')
    .eq('email', email).is('claimed_at', null).is('revoked_at', null).maybeSingle();
  if (old?.id) {
    const { error } = await admin.from('member_invites')
      .update({ revoked_at: new Date().toISOString(), revoked_by: actor }).eq('id', old.id);
    if (error) throw error;
  }
  const { data: invite, error } = await admin.from('member_invites').insert({
    email, kind, reason, ends_at: endsAt.toISOString(), created_by: actor,
  }).select('id').single();
  if (error) throw error;
  await admin.from('member_access_audit').insert({
    actor_id: actor, invite_id: invite.id, action: 'invite_created',
    detail: { email, kind, reason, ends_at: endsAt.toISOString() },
  });
  await audit(admin, actor, 'member.invite_created', { kind, reason, ends_at: endsAt.toISOString() }, null, 'member_invite', String(invite.id));
  return { ok: true, applied: false, inviteId: invite.id, endsAt: endsAt.toISOString() };
}

async function revoke(admin: any, actor: string, userId: string, reason: string) {
  if (!userId) throw new Error('BAD_USER');
  const cleanReason = String(reason ?? '').trim().slice(0, 300);
  if (cleanReason.length < 2) throw new Error('BAD_REASON');
  const { data: profile, error: readError } = await admin.from('profiles')
    .select('subscription_ends,manual_access_until').eq('id', userId).maybeSingle();
  if (readError) throw readError;
  if (!profile?.manual_access_until) return { ok: true, already: true };
  const paymentActive = Date.parse(profile.subscription_ends ?? '') > Date.now();
  const { error } = await admin.from('profiles').update({
    tier: paymentActive ? 'paid' : 'free', manual_access_until: null,
    manual_access_kind: null, manual_access_reason: null,
  }).eq('id', userId);
  if (error) throw error;
  await admin.from('member_access_audit').insert({
    actor_id: actor, target_user_id: userId, action: 'grant_revoked',
    detail: { reason: cleanReason, payment_remains: paymentActive },
  });
  await audit(admin, actor, 'member.invite_revoked', { reason: cleanReason, payment_remains: paymentActive }, userId, 'profile', userId);
  return { ok: true, paymentRemains: paymentActive };
}

async function setAccountState(admin: any, actor: string, target: string, nextState: string, reason: string) {
  const states = ['active', 'invited', 'suspended', 'cancelled', 'expired'];
  if (!target || !states.includes(nextState)) throw new Error('BAD_STATE');
  const { data: before, error: readError } = await admin.from('profiles').select('account_state').eq('id', target).maybeSingle();
  if (readError) throw readError;
  if (!before) throw new Error('MEMBER_NOT_FOUND');
  const cleanReason = String(reason ?? '').trim().slice(0, 300);
  const { error } = await admin.from('profiles').update({ account_state: nextState }).eq('id', target);
  if (error) throw error;
  await audit(admin, actor, 'member.account_state', { from: before.account_state ?? 'active', to: nextState, reason: cleanReason }, target, 'profile', target);
  return { ok: true };
}

async function setRole(admin: any, actor: string, target: string, role: StaffRole, enabled: boolean) {
  if (!target || !validRoles.has(role)) throw new Error('BAD_ROLE');
  const { data: targetUser, error: targetError } = await admin.auth.admin.getUserById(target);
  if (targetError || !targetUser?.user) throw new Error('MEMBER_NOT_FOUND');
  if (enabled) {
    const { error } = await admin.from('staff_roles').upsert({ user_id: target, role, granted_by: actor }, { onConflict: 'user_id,role' });
    if (error) throw error;
  } else {
    if (target === actor && role === 'SUPER_ADMIN') {
      const { count, error: countError } = await admin.from('staff_roles')
        .select('*', { count: 'exact', head: true }).eq('role', 'SUPER_ADMIN');
      if (countError) throw countError;
      if ((count ?? 0) <= 1) throw new Error('LAST_SUPER_ADMIN');
    }
    const { error } = await admin.from('staff_roles').delete().eq('user_id', target).eq('role', role);
    if (error) throw error;
  }
  await audit(admin, actor, 'staff.role', { role, enabled }, target, 'staff_role', role);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  try {
    const ctx = await context(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'context');

    if (action === 'context') return json({ ok: true, viewer: publicContext(ctx) });
    if (action === 'list') {
      requireCapability(ctx, 'member.read');
      const data = await list(ctx.admin, String(body.query ?? ''), String(body.classFilter ?? ''), String(body.stateFilter ?? ''));
      return json({ ...data, viewer: publicContext(ctx) });
    }
    if (action === 'grant') {
      requireCapability(ctx, 'member.write');
      return json(await grant(ctx.admin, ctx.user.id, body));
    }
    if (action === 'revoke') {
      requireCapability(ctx, 'member.write');
      return json(await revoke(ctx.admin, ctx.user.id, String(body.userId ?? ''), String(body.reason ?? '')));
    }
    if (action === 'set_state') {
      requireCapability(ctx, 'member.write');
      return json(await setAccountState(ctx.admin, ctx.user.id, String(body.userId ?? ''), String(body.state ?? ''), String(body.reason ?? '')));
    }
    if (action === 'set_role') {
      requireCapability(ctx, 'staff.manage');
      return json(await setRole(ctx.admin, ctx.user.id, String(body.userId ?? ''), String(body.role ?? '') as StaffRole, body.enabled === true));
    }
    return json({ error: 'BAD_ACTION' }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === 'NO_AUTH' ? 401
      : message === 'FORBIDDEN' || message === 'NOT_ADMIN' ? 403
      : message === 'SERVER_CONFIG' || message === 'RBAC_NOT_READY' ? 503
      : 400;
    console.error('[member-admin]', message);
    return json({ error: message }, status);
  }
});

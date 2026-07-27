// 인증 — Google / Apple 만 허용 (§1 인증·구독 관리)
//
// 왜 Supabase 인가: Postgres 라 0번의 "데이터 축적 → 재분석" 방향과 맞고,
// 사전등록·회원·이벤트 로그를 한 스키마에서 다룰 수 있다. Firestore(NoSQL)는 후속 분석에 불리.
//
// ⚠️ 키는 config.local.js 에 넣는다 (git 에 올리지 말 것). 없으면 게스트 모드로만 동작.

import { CONFIG } from './config.local.js';
import { biometric } from './biometric.js';

const PROVIDERS = ['google', 'apple'];   // 이 둘만. 이메일/비밀번호 가입 없음.

export const auth = {
  client: null,
  user: null,          // null = 게스트
  profile: null,       // { id, email, provider, tier, founding_member, created_at }
  ready: false,
  _subs: [],

  /* ── 초기화 ─────────────────────────────────────────────── */
  async init() {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
      console.info('[auth] Supabase 키 없음 → 게스트 모드로만 동작합니다.');
      this.ready = true;
      this.emit();
      return;
    }
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    this.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    const { data } = await this.client.auth.getSession();
    await this._apply(data?.session ?? null);

    this.client.auth.onAuthStateChange((_evt, session) => { this._apply(session); });

    this.ready = true;
    this.emit();
  },

  async _apply(session) {
    this.user = session?.user ?? null;
    this.profile = this.user ? await this.loadProfile() : null;
    this.emit();
  },

  /* ── 로그인 ─────────────────────────────────────────────── */
  async signIn(provider) {
    if (!PROVIDERS.includes(provider)) throw new Error('허용되지 않은 로그인 방식: ' + provider);
    if (!this.client) throw new Error('AUTH_NOT_CONFIGURED');
    const { error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        // Apple 은 최초 1회만 이름/이메일을 준다. 그 이후엔 안 준다.
        scopes: provider === 'apple' ? 'name email' : 'email',
      },
    });
    if (error) throw error;
  },

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
    this.profile = null;
    this.emit();
  },

  /* ── 프로필 ─────────────────────────────────────────────── */
  async loadProfile() {
    if (!this.client || !this.user) return null;
    const { data, error } = await this.client
      .from('profiles').select('*').eq('id', this.user.id).single();
    if (error && error.code !== 'PGRST116') console.warn('[auth] profile', error.message);
    return data ?? {
      id: this.user.id,
      email: this.user.email,
      provider: this.user.app_metadata?.provider,
      tier: 'free',
      founding_member: false,
    };
  },

  /** 동의 기록 저장 — 언제/무엇에 동의했는지 남겨야 분쟁 시 근거가 된다 */
  async saveConsent({ tos, privacy, over14, marketing, location }) {
    if (!this.client || !this.user) return;
    const { error } = await this.client.from('consents').insert({
      user_id: this.user.id,
      tos_agreed: !!tos,
      privacy_agreed: !!privacy,
      over_14: !!over14,
      marketing_agreed: !!marketing,
      location_agreed: !!location,
      tos_version: CONFIG.LEGAL_VERSION,
      privacy_version: CONFIG.LEGAL_VERSION,
      agreed_at: new Date().toISOString(),
    });
    if (error) console.warn('[auth] consent', error.message);
  },

  /* ── 계정 삭제 ──────────────────────────────────────────────
     ⚠️ 앱스토어 필수 요건. 계정 생성 기능이 있으면 앱 내 삭제도 반드시 제공해야 한다
        (App Store Review Guideline 5.1.1(v), 2022년부터 강제).
     클라이언트 anon 키로는 auth.users 를 못 지우므로 서버측 함수가 필요하다.
     supabase/schema.sql 의 delete_own_account() 참조. */
  async deleteAccount() {
    if (!this.client || !this.user) throw new Error('NOT_SIGNED_IN');
    const { error } = await this.client.rpc('delete_own_account');
    if (error) throw error;
    await this.signOut();
  },

  /** 개인정보 열람권 — 내 데이터 내려받기 (개인정보보호법 제35조) */
  async exportMyData() {
    if (!this.client || !this.user) throw new Error('NOT_SIGNED_IN');
    const [profile, consents] = await Promise.all([
      this.client.from('profiles').select('*').eq('id', this.user.id),
      this.client.from('consents').select('*').eq('user_id', this.user.id),
    ]);
    return {
      exported_at: new Date().toISOString(),
      account: {
        id: this.user.id,
        email: this.user.email,
        provider: this.user.app_metadata?.provider,
        created_at: this.user.created_at,
      },
      profile: profile.data ?? [],
      consents: consents.data ?? [],
    };
  },

  /* ── 구독 상태 ──────────────────────────────────────────────
     실제 검증은 Apple/Google 영수증을 서버가 확인해야 한다.
     여기서는 profiles.tier 를 읽기만 한다 — 결제 연동 시 서버가 이 값을 쓴다. */
  isPaid() { return this.profile?.tier === 'paid'; },

  /* ── 유료 기능 진입점 ──────────────────────────────────────
     로그인은 "필요해질 때" 요구한다.
     앱을 켜자마자 로그인을 요구하면 지구 한 번 못 보고 이탈한다.
     무료 기능(지구·기상·교육 콘텐츠)은 로그인 없이 전부 쓸 수 있고,
     유료 레이어를 누른 그 순간에만 이 함수가 로그인 화면을 띄운다.

     @returns true 면 진행해도 된다 */
  async requireLogin(reason) {
    if (this.isPaid()) return true;
    if (!this.user) {
      // 로그인 시트를 띄우고, 사용자가 끝낼 때까지 기다린다
      const ok = await this._promptLogin(reason);
      if (!ok) return false;
    }
    return this.isPaid();
  },

  _promptLogin(reason) {
    return new Promise(resolve => {
      const sheet = document.getElementById('loginSheet');
      if (!sheet) return resolve(false);
      const note = document.getElementById('loginReason');
      if (note) note.textContent = reason || '';
      sheet.classList.add('up');
      // 시트가 닫히면 결과를 알린다
      const obs = new MutationObserver(() => {
        if (!sheet.classList.contains('up')) { obs.disconnect(); resolve(!!this.user); }
      });
      obs.observe(sheet, { attributes: true, attributeFilter: ['class'] });
    });
  },
  isFounding() { return !!this.profile?.founding_member; },
  isSignedIn() { return !!this.user; },

  /* ── 구독 ─────────────────────────────────────────────── */
  onChange(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; },
  emit() { this._subs.forEach(f => f(this.user, this.profile)); },
};

/* ── 사전등록 (§7) ────────────────────────────────────────────
   창립 멤버 대기자 명단. 로그인 없이 이메일만 받는다. */
export const waitlist = {
  async join(email, { marketing = false } = {}) {
    if (!auth.client) throw new Error('BACKEND_NOT_CONFIGURED');
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('INVALID_EMAIL');
    const { error } = await auth.client.from('waitlist').insert({
      email: clean,
      marketing_agreed: !!marketing,
      privacy_version: CONFIG.LEGAL_VERSION,
      created_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === '23505') return { ok: true, already: true };  // 중복 = 성공 취급
      throw error;
    }
    return { ok: true, already: false };
  },

  /** 진행률 게이지용 — §7 의 하드코딩 25% 를 대체 */
  async count() {
    if (!auth.client) return null;
    const { count, error } = await auth.client
      .from('waitlist').select('*', { count: 'exact', head: true });
    if (error) { console.warn('[waitlist]', error.message); return null; }
    return count;
  },

  async progress() {
    const n = await this.count();
    if (n == null) return null;
    const goal = CONFIG.FOUNDING_GOAL || 500;
    return { count: n, goal, pct: Math.min(100, Math.round((n / goal) * 100)) };
  },
};

/* ── 서비스별 사전 관심 등록 (항공기 · 선박) ──────────────────
   항공기·선박 실시간 데이터는 유료 API 다 (월 수백 달러 단위).
   가입자가 일정 수를 넘어야 계약이 성립한다 — 그때까지는 열 수 없다.
   그래서 "언제 열릴지 모르는 준비 중"이 아니라 "몇 명 모이면 연다"로 말한다.
   숫자를 공개하면 약속이 검증 가능해진다.

   ⚠️ 목표 인원을 채웠다고 자동으로 열리지 않는다. 계약·연동에 시간이 걸린다.
      UI 에서 그렇게 말한다 — "달성 즉시 오픈"이라고 쓰면 지키지 못할 약속이 된다. */
export const interest = {
  async join(service, email) {
    if (!auth.client) throw new Error('BACKEND_NOT_CONFIGURED');
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('INVALID_EMAIL');
    const { error } = await auth.client.from('service_interest').insert({
      service, email: clean,
      user_id: auth.user?.id || null,
      privacy_version: CONFIG.LEGAL_VERSION,
      created_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === '23505') return { ok: true, already: true };
      throw error;
    }
    return { ok: true, already: false };
  },

  /** 이 서비스에 몇 명이 관심 등록했나. 백엔드가 없으면 null (0 이 아니다).
      ⚠️ 테이블을 직접 select 하지 않는다. 이메일이 들어 있는 표라
         RLS 에 읽기 정책을 열면 주소가 통째로 새어 나간다.
         숫자만 돌려주는 서버 함수를 쓴다 (schema.sql 의 service_interest_count). */
  async count(service) {
    if (!auth.client) return null;
    const { data, error } = await auth.client.rpc('service_interest_count', { svc: service });
    if (error) { console.warn('[interest]', error.message); return null; }
    return typeof data === 'number' ? data : null;
  },
};

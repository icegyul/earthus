// 선택 동의 기반 이용행태 수집기.
// ⚠️ 로그인·로컬 동의·서버 최신 동의가 모두 맞을 때만 허용 event를 전송한다.
// queue는 메모리에만 있고, 철회·로그아웃 즉시 폐기한다. 좌표와 자유문구는 받지 않는다.

import { auth } from './auth.js';
import { CONFIG } from './config.local.js';
import { store } from './store.js';
import {
  ANALYTICS_CONSENT_VERSION, buildAnalyticsRow, sanitizeAnalyticsProperties, viewportBucket,
} from './analytics-contract.js';

const SESSION_KEY = 'earthus.analytics.session.v1';
const MAX_QUEUE = 20;
const FLUSH_MS = 3000;
const PRIVACY_VERSION = CONFIG.PRIVACY_VERSION || CONFIG.LEGAL_VERSION;
const ANALYTICS_EFFECTIVE_AT = Date.parse('2026-08-20T15:00:00Z'); // 2026-08-21 00:00 KST

function randomHex(bytes = 16) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map(value => value.toString(16).padStart(2, '0')).join('');
}

function sessionPseudonym() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.day === today && /^[a-f0-9]{32}$/.test(saved.id)) return saved.id;
    const next = { day: today, id: randomHex(16) };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next.id;
  } catch (_) {
    return randomHex(16);
  }
}

function localUsageConsent() {
  return localStorage.getItem('earthus.consent') === CONFIG.LEGAL_VERSION
    && localStorage.getItem('earthus.consent.usage') === '1';
}

export const analytics = {
  enabled: false,
  queue: [],
  timer: null,
  flushing: false,
  sessionId: null,
  _initialized: false,
  _appOpenedSent: false,
  _principalId: null,

  async init() {
    if (this._initialized) return this;
    this._initialized = true;
    this.sessionId = sessionPseudonym();
    auth.onChange(() => this.syncConsent());
    document.addEventListener('earthus:usage-consent', () => this.syncConsent());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('offline', () => this.track('offline.entered', {
      cacheVersion: 'service-worker', staleBand: 'UNKNOWN',
    }));
    document.addEventListener('click', event => {
      const activity = event.target?.closest?.('[data-activity]')?.dataset?.activity;
      if (activity) this.track('activity.profile_selected', { profileId: activity });
    });
    store.on('layer', (layerId, on) => this.track('layer.selected', {
      layerId, state: on ? 'ON' : 'OFF', sourceStatusClass: 'UNKNOWN',
    }));
    store.on('earthView', state => {
      if (state.view === 'style') this.track('earth_style.opened', { entryKind: 'USER_INTENT' });
      if (state.view === 'evidence' && state.layer) this.track('evidence.opened', {
        signalType: state.layer, evidenceClass: 'SELECTED_POINT',
      });
      if (state.view === 'decision') this.track('decision.viewed', {
        activityProfile: state.activity || 'UNKNOWN',
        safetyClass: 'UNKNOWN', confidenceBand: 'UNKNOWN',
      });
    });
    store.on('scene', (scene, stage) => {
      if (scene === 'space') {
        this.track('aetherus.opened', { entryKind: 'USER_INTENT' });
        this.track('aetherus.scene_selected', { sceneId: String(stage || 'space') });
      }
    });
    await this.syncConsent();
    return this;
  },

  stop() {
    this.enabled = false;
    this.queue.length = 0;
    clearTimeout(this.timer);
    this.timer = null;
  },

  async syncConsent() {
    this.stop();
    if (Date.now() < ANALYTICS_EFFECTIVE_AT) return false;
    if (!localUsageConsent() || !auth.client || !auth.user) return false;
    if (this._principalId !== auth.user.id) {
      this._principalId = auth.user.id;
      this._appOpenedSent = false;
    }
    const { data, error } = await auth.client.from('consents')
      .select('id,usage_agreed,privacy_agreed,over_14,privacy_version,agreed_at')
      .eq('user_id', auth.user.id).order('id', { ascending: false }).limit(1).maybeSingle();
    if (error || data?.usage_agreed !== true || data?.privacy_agreed !== true
        || data?.over_14 !== true || data?.privacy_version !== PRIVACY_VERSION) return false;
    this.enabled = true;
    if (!this._appOpenedSent) {
      this._appOpenedSent = true;
      this.track('app.opened', {
        locale: document.documentElement.lang || 'ko',
        viewportBucket: viewportBucket(innerWidth),
        entryKind: location.search ? 'DEEP_LINK' : 'DIRECT',
      });
    }
    return true;
  },

  track(eventName, properties = {}) {
    if (!this.enabled || !auth.user) return false;
    let row;
    try {
      sanitizeAnalyticsProperties(eventName, properties);
      row = buildAnalyticsRow({
        eventName, properties, userId: auth.user.id, sessionPseudonym: this.sessionId,
        occurredAt: new Date().toISOString(), consentVersion: ANALYTICS_CONSENT_VERSION,
        privacyVersion: PRIVACY_VERSION, eventId: crypto.randomUUID(),
      });
    } catch (_) {
      return false;
    }
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(row);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), FLUSH_MS);
    return true;
  },

  async flush() {
    if (!this.enabled || this.flushing || !auth.client || !this.queue.length) return false;
    this.flushing = true;
    clearTimeout(this.timer);
    this.timer = null;
    const batch = this.queue.splice(0, MAX_QUEUE);
    try {
      const { error } = await auth.client.from('analytics_events').insert(batch);
      if (error) {
        console.warn('[analytics] 허용된 event batch를 저장하지 못했습니다:', error.code || 'UNKNOWN');
        return false;
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      this.flushing = false;
    }
  },
};

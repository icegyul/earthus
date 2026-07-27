// 위성 통과 알림
//
// ⚠️ 브라우저 알림의 실제 한계를 먼저 알아둘 것 (실측으로 확인함)
//
//   ① 앱이 열려 있을 때  → 확실히 동작한다. 타이머로 예약해 알림을 띄운다.
//   ② 앱을 닫았을 때     → 타이머가 죽는다. 알림이 안 간다.
//   ③ 백그라운드 알림    → 웹푸시가 필요하다. 서버가 VAPID 키로 밀어줘야 하고,
//                          iOS 는 "홈 화면에 추가"한 PWA 여야만 허용한다.
//                          → 출시 때 서버와 함께 붙일 일이다.
//
//   TimestampTrigger(예약 알림)는 크롬 실험 기능이고 이 환경에서 미지원으로 확인됐다.
//
// 그래서 지금은 ①만 만든다. 대신 "앱이 열려 있을 때만 울립니다"라고 분명히 알린다.
// 못 하는 걸 될 것처럼 두면 사용자가 통과를 놓친다.

import { i18n } from './i18n.js';
import { toast } from './ui.js';

const LS_LEAD = 'earthus.alarmLead';
const LS_LIST = 'earthus.alarms';

/** 몇 분 전에 알릴지 — 설정에서 고른다 */
export const LEAD_CHOICES = [3, 5, 10, 30];

export const alarms = {
  lead: Number(localStorage.getItem(LS_LEAD)) || 5,
  items: [],          // { key, satName, at, lead }
  _timers: {},

  init() {
    try { this.items = JSON.parse(localStorage.getItem(LS_LIST) || '[]'); } catch (_) {}
    this._prune();
    this.items.forEach(a => this._arm(a));
    return this;
  },

  setLead(min) {
    this.lead = min;
    localStorage.setItem(LS_LEAD, String(min));
    // 이미 걸어둔 알림도 새 기준으로 다시 잡는다
    const old = this.items.slice();
    this.items = [];
    Object.values(this._timers).forEach(t => clearTimeout(t));
    this._timers = {};
    old.forEach(a => this.add(a.satName, new Date(a.at + a.lead * 60_000), { silent: true }));
    this._save();
  },

  /** 권한 요청 — 사용자가 버튼을 누른 순간에만 부른다 (그래야 브라우저가 허용한다) */
  async ensurePermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { return (await Notification.requestPermission()) === 'granted'; }
    catch (_) { return false; }
  },

  key(satName, passStart) { return `${satName}@${new Date(passStart).toISOString()}`; },
  has(satName, passStart) { return this.items.some(a => a.key === this.key(satName, passStart)); },

  /** 통과 시작 시각 기준으로 lead 분 전에 알림 */
  add(satName, passStart, { silent } = {}) {
    const at = new Date(passStart).getTime() - this.lead * 60_000;
    const key = this.key(satName, passStart);
    if (at <= Date.now()) {
      if (!silent) toast(i18n.lang === 'ko'
        ? '이미 지난 시각입니다' : 'That time has already passed');
      return false;
    }
    if (this.items.some(a => a.key === key)) return true;
    const item = { key, satName, at, lead: this.lead };
    this.items.push(item);
    this._save();
    this._arm(item);
    return true;
  },

  remove(satName, passStart) {
    const key = this.key(satName, passStart);
    this.items = this.items.filter(a => a.key !== key);
    clearTimeout(this._timers[key]); delete this._timers[key];
    this._save();
  },

  _arm(a) {
    const ms = a.at - Date.now();
    if (ms <= 0) return;
    /* ⚠️ setTimeout 은 32비트 한계(약 24.8일)를 넘으면 즉시 실행된다.
       통과 예보는 48시간 이내라 문제없지만, 방어적으로 잘라둔다. */
    if (ms > 2_000_000_000) return;
    clearTimeout(this._timers[a.key]);
    this._timers[a.key] = setTimeout(() => this._fire(a), ms);
  },

  _fire(a) {
    const ko = i18n.lang === 'ko';
    const title = ko ? `${a.satName} 통과 ${a.lead}분 전` : `${a.satName} in ${a.lead} min`;
    const body = ko ? '하늘을 올려다볼 시간입니다.' : 'Time to look up.';
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, tag: a.key, icon: 'icon.png' });
      } else {
        toast(`${title} — ${body}`);
      }
    } catch (_) { toast(`${title} — ${body}`); }
    this.remove(a.satName, new Date(a.at + a.lead * 60_000));
  },

  _prune() {
    const now = Date.now();
    const before = this.items.length;
    this.items = this.items.filter(a => a.at > now);
    if (this.items.length !== before) this._save();
  },

  _save() { localStorage.setItem(LS_LIST, JSON.stringify(this.items)); },

  /** 지금 알림이 실제로 갈 수 있는 상태인지 — UI 에 정직하게 표시하려고 */
  status() {
    const ko = i18n.lang === 'ko';
    if (typeof Notification === 'undefined')
      return { ok: false, msg: ko ? '이 브라우저는 알림을 지원하지 않습니다' : 'Notifications unsupported' };
    if (Notification.permission === 'denied')
      return { ok: false, msg: ko
        ? '알림이 차단되어 있습니다. 브라우저 설정에서 허용해주세요.'
        : 'Notifications are blocked — allow them in browser settings.' };
    return { ok: true, msg: null };
  },
};

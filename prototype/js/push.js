// 웹푸시 — 앱이 닫혀 있어도 알림
//
// ⚠️⚠️⚠️ **먼저 못 하는 것을 적는다.** 이 셋을 흐리게 두면 사용자가 알림을 믿고
//    위험한 곳에 간다. 화면에도 같은 말을 쓴다.
//
//   ① **웹에는 배경 위치 추적이 없다.** 앱을 닫으면 사용자가 어디 있는지 모른다.
//      → 알림은 **저장해 둔 지점** 기준이다. "지금 내가 있는 곳"이 아니다.
//         해변에 도착하면 알아서 알려 줄 거라고 믿게 하면 안 된다.
//   ② **iOS 는 홈 화면에 추가해야만 온다.** 사파리 탭에서는 아예 안 온다.
//      브라우저가 알려 주지 않으므로 우리가 먼저 안내한다.
//   ③ **알림이 언제 도착할지는 우리가 정하지 못한다.** 기기가 절전 중이면 늦는다.
//      "즉시"라고 쓰지 않는다.
//
// ⚠️ 구독은 브라우저가 말없이 만료시킨다(앱 삭제·캐시 정리·기기 초기화).
//    그래서 **켤 때마다 서버와 맞춘다.** 한 번 등록했으니 됐다고 두면 조용히 끊긴다.

import { auth } from './auth.js';
import { CONFIG } from './config.local.js';
import { i18n } from './i18n.js';

/** base64url → Uint8Array (VAPID 공개키용).
 *  ⚠️ atob 는 base64url 을 못 읽는다. -_ 를 +/ 로 바꾸고 = 를 채워야 한다.
 *     안 바꾸면 구독이 InvalidCharacterError 로 실패한다. */
function urlB64(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** 홈 화면에 추가된 상태인가 (iOS 판정용) */
const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.platform || '')
  || (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1);

export const push = {
  sub: null,

  /** 이 기기에서 웹푸시를 쓸 수 있는가 — 못 쓰면 **왜 못 쓰는지**까지 돌려준다.
   *  ⚠️ "지원하지 않습니다"만 띄우면 아이폰 사용자는 영영 방법을 못 찾는다. */
  support() {
    const ko = i18n.lang === 'ko';
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iOS 는 홈 화면 추가 전에는 PushManager 자체가 없다 — 그 경우를 따로 잡는다.
      // ⚠️ "지원하지 않습니다"로 뭉뚱그리면 아이폰 사용자는 영영 방법을 못 찾는다.
      //    무엇을 눌러야 하는지까지 적는다.
      if (isIOS() && !standalone()) {
        return {
          ok: false,
          reason: 'ios-needs-install',
          msg: ko
            ? '아이폰은 <b>홈 화면에 추가</b>해야 알림을 받을 수 있습니다. 공유 버튼 → 「홈 화면에 추가」를 누른 뒤, 홈 화면의 아이콘으로 열어 주세요.'
            : 'On iPhone you must add this to the Home Screen first (Share → Add to Home Screen), then open it from that icon.',
        };
      }
      return { ok: false, reason: 'unsupported',
        msg: ko ? '이 브라우저는 웹 알림을 지원하지 않습니다.' : 'This browser does not support web push.' };
    }
    if (isIOS() && !standalone()) {
      return { ok: false, reason: 'ios-needs-install',
        msg: ko ? '아이폰은 홈 화면에 추가한 뒤에만 알림이 옵니다.' : 'On iPhone, add to Home Screen first.' };
    }
    if (Notification.permission === 'denied') {
      return { ok: false, reason: 'denied',
        msg: ko ? '알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.'
                : 'Notifications are blocked — allow them in browser settings.' };
    }
    if (!CONFIG.VAPID_PUBLIC_KEY) {
      /* ⚠️ 없는 걸 있는 척하지 않는다. 서버가 아직 안 붙었으면 그렇게 적는다. */
      return { ok: false, reason: 'not-configured',
        msg: ko ? '알림 서버가 아직 연결되지 않았습니다.' : 'Push server is not connected yet.' };
    }
    return { ok: true };
  },

  /** 지금 이 기기가 구독 중인가 */
  async current() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      this.sub = await reg.pushManager.getSubscription();
      return this.sub;
    } catch (_) { return null; }
  },

  /**
   * 알림 켜기. 성공하면 서버에 구독을 저장한다.
   * @throws Error('NOT_SIGNED_IN' | 'PERMISSION' | 'NOT_CONFIGURED' | ...)
   */
  async enable() {
    const s = this.support();
    if (!s.ok) throw Object.assign(new Error(s.reason.toUpperCase().replace(/-/g, '_')), { info: s });
    /* ⚠️ 로그인 없이 받을 수 없다. 구독을 계정에 붙여야 기기를 바꿔도 따라가고,
       무엇보다 **남의 구독을 지우거나 훔쳐볼 수 없게** 하는 유일한 방법이다. */
    if (!auth.user) throw new Error('NOT_SIGNED_IN');

    /* ⚠️ 권한 요청은 **사용자가 버튼을 누른 흐름 안에서** 해야 한다.
       나중에 비동기로 부르면 브라우저가 무시하거나 자동 거부한다. */
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('PERMISSION');

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        // ⚠️ true 여야 한다. 본문 없는 조용한 푸시는 브라우저가 금지한다.
        userVisibleOnly: true,
        applicationServerKey: urlB64(CONFIG.VAPID_PUBLIC_KEY),
      });
    }
    this.sub = sub;
    await this._save(sub);
    return sub;
  },

  /** 알림 끄기 — 브라우저 구독과 서버 기록을 **둘 다** 지운다.
   *  ⚠️ 하나만 지우면 계속 보내거나(서버만 남음), 보내도 안 뜬다(브라우저만 남음). */
  async disable() {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      const ep = sub.endpoint;
      try { await sub.unsubscribe(); } catch (_) { /* 이미 없을 수 있다 */ }
      if (auth.client && auth.user) {
        await auth.client.from('push_subscriptions').delete().eq('endpoint', ep);
      }
    }
    this.sub = null;
  },

  /** 구독을 서버에 올린다 (있으면 갱신).
   *  ⚠️ endpoint 가 unique 라 upsert 로 넣는다. insert 만 하면 두 번째부터 실패한다. */
  async _save(sub) {
    if (!auth.client || !auth.user) throw new Error('NOT_SIGNED_IN');
    const j = sub.toJSON();
    const k = j.keys || {};
    if (!k.p256dh || !k.auth) throw new Error('NO_KEYS');
    const { error } = await auth.client.from('push_subscriptions').upsert({
      user_id: auth.user.id,
      endpoint: sub.endpoint,
      p256dh: k.p256dh,
      auth: k.auth,
      /* ⚠️ User-Agent 전체를 넣지 않는다 — 그 자체가 지문이 된다.
         문제 추적에 필요한 만큼만 남긴다. */
      platform: isIOS() ? 'ios' : (/Android/.test(navigator.userAgent) ? 'android' : 'web'),
      lang: i18n.lang,
      failed: 0,
    }, { onConflict: 'endpoint' });
    if (error) throw new Error(error.message);
  },

  /** 켤 때마다 서버와 맞춘다.
   *  ⚠️ 브라우저가 구독을 말없이 갱신·만료시킨다. 한 번 등록하고 두면 조용히 끊긴다. */
  async sync() {
    if (!auth.user) return false;
    const sub = await this.current();
    if (!sub) return false;
    try { await this._save(sub); return true; } catch (_) { return false; }
  },

  /* ── 지켜볼 지점 ──────────────────────────────────────────
     ⚠️ 배경 위치 추적이 없어서 **이게 알림의 전부**다. 지점이 없으면 알림도 없다. */
  async spots() {
    if (!auth.client || !auth.user) return [];
    const { data, error } = await auth.client.from('alert_spots')
      .select('*').order('created_at', { ascending: true });
    /* ⚠️ error를 버리고 []로 돌리면 서버 장애가 '저장 장소 없음'으로 보인다.
       ui-alerts는 실패와 빈 목록을 따로 처리하므로 반드시 위로 올린다. */
    if (error) throw new Error(error.message);
    return data || [];
  },

  async addSpot({ label, lat, lon, ...rest }) {
    if (!auth.client || !auth.user) throw new Error('NOT_SIGNED_IN');
    const { data, error } = await auth.client.from('alert_spots')
      .insert({ user_id: auth.user.id, label, lat, lon, ...rest }).select().single();
    if (error) {
      /* ⚠️ 개수 제한은 **서버 트리거**가 막는다. 여기서 세면 우회할 수 있다.
         대신 사용자에게는 이유를 정확히 알려준다. */
      if (/SPOT_LIMIT/.test(error.message)) throw new Error('SPOT_LIMIT');
      throw new Error(error.message);
    }
    return data;
  },

  async removeSpot(id) {
    if (!auth.client || !auth.user) throw new Error('NOT_SIGNED_IN');
    const { error } = await auth.client.from('alert_spots').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** 지점별 알림 종류와 사용자가 정한 지진 수신 기준을 바꾼다.
   *  ⚠️ 허용한 다섯 필드만 보낸다. 객체를 그대로 update 하면 user_id·좌표까지
   *     실수로 덮을 수 있고, 안전 알림 설정에서 그런 광범위 쓰기는 필요 없다. */
  async updateSpot(id, values = {}) {
    if (!auth.client || !auth.user) throw new Error('NOT_SIGNED_IN');
    const patch = {};
    ['rip', 'quake', 'warn'].forEach((key) => {
      if (typeof values[key] === 'boolean') patch[key] = values[key];
    });
    const mag = Number(values.quake_min_mag);
    if (values.quake_min_mag != null && Number.isFinite(mag) && mag >= 0 && mag <= 10) {
      patch.quake_min_mag = mag;
    }
    const radius = Number(values.quake_max_km);
    if (values.quake_max_km != null && Number.isInteger(radius) && radius > 0 && radius <= 20_000) {
      patch.quake_max_km = radius;
    }
    if (!Object.keys(patch).length) return;
    const { error } = await auth.client.from('alert_spots').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },
};

/* 서비스워커가 보내는 신호 처리.
   ⚠️ 구독이 갱신됐다는 신호를 받으면 **바로 다시 올린다.** 안 하면 조용히 끊긴다. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'earthus:push-resubscribe') push.sync().catch(() => { });
  });
}

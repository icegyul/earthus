// v2 잠금 → v1 구독 화면 → 원래 v2 화면 — 주소 규칙 한 곳 (2026-09-24, 지시서 §3-5-2 · Phase 2 완료 기준 1)
//
//   v2 의 잠긴 EXPLORER/PRO 카드가 `/?subscribe=<explorer|pro>&back=<v2 주소>` 로 보낸다.
//   v1 이 구독 화면을 그 등급으로 열고, 결제가 끝나면 back 으로 **그대로** 돌아간다(v2 화면 상태는 #v=1&at=… 해시에 있다).
//
// ⚠️ 판매가 닫혀 있으면(MONETIZATION_MODE≠PAID · SALES_OPEN≠true · SHOW_SUBSCRIBE≠true) 이 길은 **보이지도 동작하지도 않는다.**
//    v2 는 링크를 그리지 않고, v1 은 ?subscribe= 를 못 본 척한다 — 지금 운영 화면은 달라지지 않는다.
// ⚠️ back 은 **같은 출처의 경로만** 받는다. `//evil.com`·`https:`·`\` 로 시작하는 값은 버린다(열린 리디렉트 금지).
//    예전 v1 규칙(`/^\/[a-z0-9/-]*$/i`, main.js ?login=)은 ?·# 를 못 받아 v2 화면 상태를 잃었다 — 이 파일이 그 자리를 넓힌다.

import { salesAllowed, subscriptionUiAllowed } from './access-mode.js';

const ORIGIN = 'https://earthus.invalid';
/** 등급 이름(또는 billing.js PLANS 키) → 구독 화면이 먼저 고를 상품 키. 연간이 기본이다(ui-subscribe plan 기본값과 같다). */
export const SUBSCRIBE_TARGETS = Object.freeze({
  explorer: 'yearly',
  pro: 'intelYearly',
  intelligence: 'intelYearly',
  monthly: 'monthly', yearly: 'yearly', intelMonthly: 'intelMonthly', intelYearly: 'intelYearly',
});

/** 같은 출처의 경로(+쿼리+해시)만 돌려준다. 아니면 null. */
export function safeBackPath(back) {
  if (typeof back !== 'string' || !back || back.length > 2048) return null;
  if (!back.startsWith('/') || back.startsWith('//') || back.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(back)) return null;
  let u;
  try { u = new URL(back, ORIGIN); } catch (_) { return null; }
  if (u.origin !== ORIGIN) return null;
  // (2026-09-24 정정, 적대 검토) 위 검사는 **정규화 전** 문자열만 봤다 — `/..//evil.com`·`/.//evil.com` 은 통과한 뒤
  //   URL 이 `..`·`.` 을 접어 pathname 이 `//evil.com` 이 됐고, 그것을 location.replace·a.href 에 넣으면 프로토콜 상대 주소라
  //   다른 사이트로 나갔다(열린 리디렉트). 정규화한 **결과**를 한 번 더 본다.
  const out = `${u.pathname}${u.search}${u.hash}`;
  if (!out.startsWith('/') || out.startsWith('//') || out.includes('\\')) return null;
  return out;
}

/** ?subscribe=…&back=… 읽기. 없거나 모르는 값이면 null. */
export function parseSubscribeRequest(search) {
  let q;
  try { q = new URLSearchParams(search || ''); } catch (_) { return null; }
  const raw = q.get('subscribe');
  if (!raw) return null;
  const planKey = SUBSCRIBE_TARGETS[raw] || null;
  if (!planKey) return null;
  return { planKey, target: raw, back: safeBackPath(q.get('back')) };
}

/** 주소에서 subscribe·back 을 뺀 나머지 쿼리(앞의 ? 포함, 없으면 ''). */
export function stripSubscribeParams(search) {
  const q = new URLSearchParams(search || '');
  q.delete('subscribe'); q.delete('back');
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** 판매가 열렸고 구독 화면 문도 열렸는가 — 둘 다일 때만 링크를 그린다. */
export function subscribeLinkAllowed(config) {
  const c = config || {};
  return salesAllowed({ mode: c.MONETIZATION_MODE, salesOpen: c.SALES_OPEN })
    && subscriptionUiAllowed({ mode: c.MONETIZATION_MODE, showSubscribe: c.SHOW_SUBSCRIBE });
}

/** v2 잠금 카드의 '구독' 줄(HTML). 판매가 닫혀 있으면 '' — 대신 예전 문구(upgradeText)를 그대로 둔다.
 *  loc = 지금 v2 의 location(경로+쿼리+해시가 돌아올 자리). esc = 호출부의 HTML 이스케이프. */
export function upgradeLineHtml({ config, tier = 'explorer', loc = null, ko = true, esc, upgradeText = '' } = {}) {
  const e = typeof esc === 'function' ? esc : (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const back = loc ? `${loc.pathname || ''}${loc.search || ''}${loc.hash || ''}` : null;
  const href = subscribeHref({ config, tier, back });
  if (!href) return `<span class="paysub">${e(upgradeText)}</span>`;
  const name = tier === 'pro' || tier === 'intelligence' ? 'PRO' : 'EXPLORER';
  return `<a class="paylink simgo" data-testid="subscribe-link" href="${e(href)}">${e(ko ? `${name} 구독 화면으로 →` : `Subscribe to ${name} →`)}</a>`;
}

/** v2 잠금 카드의 링크 주소. 판매가 닫혀 있으면 null(그리지 않는다). */
export function subscribeHref({ config, tier = 'explorer', back = null } = {}) {
  if (!subscribeLinkAllowed(config)) return null;
  const t = SUBSCRIBE_TARGETS[tier] ? tier : 'explorer';
  const b = safeBackPath(back);
  return `/?subscribe=${encodeURIComponent(t)}${b ? `&back=${encodeURIComponent(b)}` : ''}`;
}

/* net.js — 제한 시간이 걸린 fetch
 *
 * ⚠️⚠️ 이 파일이 있는 이유:
 *
 *   **fetch 에는 타임아웃이 없다.** 서버가 오류를 주면 catch 가 잡지만,
 *   서버가 **아무 응답도 안 하면 fetch 는 영원히 매달린다.** 오류가 안 나니
 *   catch·폴백·재시도 어느 것도 실행되지 않고, 화면은 조용히 빈 채로 남는다.
 *
 *   2026-08-02 실측: GDACS(태풍 원본)가 45초 넘게 0바이트로 4회 연속 무응답.
 *   그동안 태풍 레이어는 완전히 비어 있었다. 보관본 폴백을 이미 만들어 뒀는데도
 *   **fetch 가 실패하지 않아서 폴백이 영영 실행되지 않았다.**
 *
 *   → 무응답은 오류보다 나쁘다. 제한 시간을 걸어 **실패로 만들어야** 다음 수가 있다.
 *
 * 규칙: 우리 CDN 이 아닌 곳(제3자 API)을 부르는 fetch 는 반드시 이걸 쓴다.
 */

/* 기본 제한 시간.
   휴대폰 셀룰러에서 느린 응답과 죽은 응답을 가르는 선. 12초면
   정상 API 는 넉넉히 통과하고(실측 대부분 0.3~2초), 죽은 곳은 확실히 걸러진다.
   더 짧게 잡으면 지하철·산간에서 멀쩡한 응답을 죽었다고 판단하게 된다. */
export const NET_TIMEOUT_MS = 12_000;

/* AbortSignal.timeout() 은 Safari 16(2022-09)+ 이다.
   ⚠️ iOS 15 에서는 **함수 자체가 없어서** 부르는 순간 TypeError 가 나고
      fetch 가 아예 실행되지 않는다 — 타임아웃이 없는 것보다 나쁘다.
      그래서 있으면 쓰고, 없으면 AbortController 로 직접 만든다. */
const HAS_NATIVE = typeof AbortSignal !== 'undefined'
  && typeof AbortSignal.timeout === 'function';

/**
 * fetch 와 똑같이 쓰되, ms 안에 응답이 없으면 거부(reject)한다.
 * 던지는 방식이 fetch 와 같으므로 기존 try/catch·.catch() 가 그대로 동작한다.
 *
 * @param {string|Request} url
 * @param {RequestInit & {timeout?: number}} [opts]  timeout 으로 개별 조정
 * @returns {Promise<Response>}
 */
export function fetchT(url, opts = {}) {
  const { timeout = NET_TIMEOUT_MS, signal, ...rest } = opts;

  if (HAS_NATIVE && !signal) {
    return fetch(url, { ...rest, signal: AbortSignal.timeout(timeout) });
  }

  /* 폴백 — 구형 사파리, 또는 호출부가 이미 자기 signal 을 넘긴 경우.
     호출부 signal 도 살려 둬야 한다(취소 가능한 요청을 우리가 망치면 안 된다). */
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException('Timeout', 'TimeoutError')),
                           timeout);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true });
  }
  return fetch(url, { ...rest, signal: ac.signal })
    .finally(() => clearTimeout(timer));
}

/** 흔한 꼴: JSON 을 받아오되 실패하면 null. 호출부가 폴백을 갖고 있을 때 쓴다. */
export async function getJSON(url, opts) {
  const r = await fetchT(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

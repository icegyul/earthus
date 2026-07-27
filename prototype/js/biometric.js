// 생체인증(Face ID / 지문) 로그인 — 패스키(WebAuthn)
//
// 목적
//   구글·애플로 한 번 로그인한 뒤로는 타자 없이 얼굴/지문으로 들어오게 한다.
//   Supabase 세션은 만료되고, 브라우저가 저장소를 비우면 다시 로그인해야 한다.
//   그때 OAuth 창을 다시 여는 대신 얼굴 한 번으로 끝내는 것이 목표다.
//
// ⚠️ 이건 "두 번째 로그인부터"를 위한 것이다.
//    첫 로그인은 반드시 구글/애플을 거쳐야 한다 — 우리는 누구인지 알아야 하고,
//    패스키는 "이 기기의 이 사람이 맞다"만 증명할 뿐 신원을 만들어주지 않는다.
//
// ⚠️ 지원 조건
//    · HTTPS(보안 컨텍스트) 필수. HTTP 로 열면 API 자체가 없다.
//    · iOS 는 16 이상, Safari 기준. 홈 화면에 추가한 PWA 에서도 동작한다.
//    · 지원 안 하면 조용히 꺼진다 — 기존 OAuth 로그인은 그대로 쓸 수 있어야 한다.
//
// ⚠️ 서버 검증이 아직 없다.
//    제대로 하려면 서버가 challenge 를 만들고 서명을 검증해야 한다(Supabase Edge Function).
//    지금은 "기기에 저장된 세션을 얼굴로 잠금 해제"하는 수준이다.
//    이 상태로는 보안 경계가 기기 잠금과 같다 — 결제·구독 변경 앞에서는
//    반드시 서버 검증을 붙인 뒤에 쓸 것.

const LS_CRED = 'earthus.passkeyId';
const LS_HINT = 'earthus.passkeyUser';

export const biometric = {
  /** 이 기기·브라우저가 패스키를 쓸 수 있나 */
  async available() {
    if (!window.isSecureContext) return false;
    if (!window.PublicKeyCredential) return false;
    try {
      // 플랫폼 인증기 = 기기에 내장된 것 (Face ID, 지문, Windows Hello)
      // 외장 보안키는 우리 용도가 아니므로 이것만 본다.
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_) { return false; }
  },

  /** 이 기기에 등록해둔 게 있나 */
  enrolled() { return !!localStorage.getItem(LS_CRED); },

  /** 로그인 직후 호출 — 다음부터 얼굴로 들어올 수 있게 등록 */
  async enroll(user) {
    if (!await this.available()) return false;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'earthus', id: location.hostname },
          user: {
            id: new TextEncoder().encode(user.id),
            name: user.email || 'earthus',
            displayName: user.email || 'earthus',
          },
          // ES256 → RS256 순으로 시도 (거의 모든 기기가 ES256 을 지원한다)
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',   // 기기 내장만
            userVerification: 'required',          // 얼굴/지문을 반드시 확인
            residentKey: 'preferred',
          },
          timeout: 60_000,
        },
      });
      if (!cred) return false;
      localStorage.setItem(LS_CRED, b64(cred.rawId));
      localStorage.setItem(LS_HINT, user.email || '');
      return true;
    } catch (e) {
      // 사용자가 취소했거나 기기가 거부했다. 실패해도 OAuth 로그인은 멀쩡하다.
      console.warn('[biometric] 등록 실패:', e.name);
      return false;
    }
  },

  /** 얼굴/지문으로 본인 확인. 성공하면 true. */
  async verify() {
    const id = localStorage.getItem(LS_CRED);
    if (!id || !await this.available()) return false;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const got = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: unb64(id) }],
          userVerification: 'required',
          timeout: 60_000,
        },
      });
      return !!got;
    } catch (e) {
      console.warn('[biometric] 확인 실패:', e.name);
      return false;
    }
  },

  /** 등록 해제 (계정 삭제·로그아웃 시) */
  forget() {
    localStorage.removeItem(LS_CRED);
    localStorage.removeItem(LS_HINT);
  },

  hintEmail() { return localStorage.getItem(LS_HINT) || null; },
};

/* ArrayBuffer ↔ base64url — localStorage 에 넣으려면 문자열이어야 한다 */
function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

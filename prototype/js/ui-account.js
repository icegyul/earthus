// 회원 UI — 로그인 / 동의 / 계정 / 법적 문서 (§3, 법적 요건)
//
// 설계 원칙
//  · 게스트 모드가 기본이다. 무료 기능은 로그인 없이 전부 쓸 수 있다.
//    (만 14세 미만도 교육 콘텐츠를 쓸 수 있어야 하므로 — legal/README.md 7번)
//  · 로그인은 구독·설정 동기화·창립멤버 배지에만 필요하다.
//  · 필수 동의와 선택 동의를 화면에서 분리한다. 선택 거부해도 가입된다.

import { auth, waitlist } from './auth.js';
import { biometric } from './biometric.js';
import { store } from './store.js';
import { i18n } from './i18n.js';
import { CONFIG } from './config.local.js';

const $ = s => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const AUTH_CONSENT_INTENT_KEY = 'earthus.auth.consent-intent.v1';
const AUTH_CONSENT_INTENT_TTL = 30 * 60_000;

/* 약관은 앱 부팅이나 저장 세션 복원만으로 열지 않는다. 사용자가 이 탭에서 실제로
   로그인/가입을 시작한 뒤 OAuth가 돌아온 경우만 이어서 연다. sessionStorage는 같은 탭의
   OAuth 왕복에는 남지만 새 탭·다음 방문에는 따라가지 않아 첫 Earth를 다시 막지 않는다. */
export const authConsentIntent = {
  mark() {
    try { sessionStorage.setItem(AUTH_CONSENT_INTENT_KEY, String(Date.now())); return true; }
    catch { return false; }
  },
  clear() {
    try { sessionStorage.removeItem(AUTH_CONSENT_INTENT_KEY); } catch { /* 저장소 차단 */ }
  },
  consume() {
    try {
      const startedAt = Number(sessionStorage.getItem(AUTH_CONSENT_INTENT_KEY));
      sessionStorage.removeItem(AUTH_CONSENT_INTENT_KEY);
      return Number.isFinite(startedAt) && startedAt > 0
        && Date.now() - startedAt >= 0 && Date.now() - startedAt <= AUTH_CONSENT_INTENT_TTL;
    } catch { return false; }
  },
};

/* ══════════════════════════════════════════════════════════════
   최소 마크다운 렌더러 — 법적 문서용 (표가 있어야 해서 필요)
   ══════════════════════════════════════════════════════════════ */
function md2html(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const lines = src.split('\n');
  const out = [];
  let i = 0, inList = false;

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  while (i < lines.length) {
    const L = lines[i];

    // 표
    if (/^\s*\|/.test(L) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      closeList();
      const head = L.split('|').slice(1, -1).map(s => s.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim()));
        i++;
      }
      out.push('<table><thead><tr>' + head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }

    if (/^###\s+/.test(L))      { closeList(); out.push(`<h3>${inline(L.replace(/^###\s+/, ''))}</h3>`); }
    else if (/^##\s+/.test(L))  { closeList(); out.push(`<h2>${inline(L.replace(/^##\s+/, ''))}</h2>`); }
    else if (/^#\s+/.test(L))   { closeList(); i++; continue; }   // 문서 제목은 시트 헤더가 이미 표시
    else if (/^---+$/.test(L))  { closeList(); out.push('<hr>'); }
    else if (/^>\s?/.test(L)) {
      // 연속된 인용 줄을 하나의 블록으로 합친다 (줄마다 쪼개지면 읽기 나쁨)
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        const t = lines[i].replace(/^>\s?/, '');
        buf.push(t.trim() === '' ? '<br>' : inline(t));
        i++;
      }
      out.push(`<blockquote>${buf.join(' ')}</blockquote>`);
      continue;
    }
    else if (/^\s*[-*]\s+/.test(L) || /^\s*\d+\.\s+/.test(L)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(L.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))}</li>`);
    }
    else if (L.trim() === '')   { closeList(); }
    else                        { closeList(); out.push(`<p>${inline(L)}</p>`); }
    i++;
  }
  closeList();
  return out.join('\n');
}

/* ══════════════════════════════════════════════════════════════
   법적 문서 뷰어
   ══════════════════════════════════════════════════════════════ */
export const legalView = {
  _returnTo: null,
  async open(doc) {
    const kind = doc === 'terms' ? 'terms' : 'privacy';
    const box = $('#legalSheet');
    const body = $('#legalBody');
    const openPanels = [...document.querySelectorAll('.sheet-panel.up')]
      .filter(panel => panel !== box);
    this._returnTo = openPanels.at(-1)?.id || null;
    openPanels.forEach(panel => panel.classList.remove('up'));
    body.innerHTML = `<p style="opacity:.5">${i18n.t.loading}</p>`;
    box.classList.add('up');
    $('#legalTitle').textContent = kind === 'terms' ? '이용약관' : '개인정보처리방침';
    try {
      const res = await fetch(`legal/${kind}.ko.md`);
      if (!res.ok) throw new Error(String(res.status));
      body.innerHTML = md2html(await res.text());
    } catch (e) {
      console.warn('[legal] 문서를 불러오지 못함:', e.message);
      body.innerHTML = '<p>문서를 화면 안에서 불러오지 못했습니다.</p>'
        + `<p><a href="legal/${kind}.ko.md" target="_blank" rel="noopener">문서 원문 새 창에서 열기</a></p>`;
    }
  },
  restore() {
    const id = this._returnTo;
    this._returnTo = null;
    if (id) document.getElementById(id)?.classList.add('up');
  },
  close() {
    $('#legalSheet').classList.remove('up');
    this.restore();
  },
};

/* ══════════════════════════════════════════════════════════════
   로그인 시트 — Google / Apple 만
   ══════════════════════════════════════════════════════════════ */
export const loginSheet = {
  open() {
    const configured = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
    const notice = $('#loginNotice');
    notice.hidden = configured;
    ['#btnGoogle', '#btnApple'].forEach(selector => {
      const button = $(selector);
      if (!button) return;
      button.disabled = !configured;
      button.setAttribute('aria-disabled', String(!configured));
    });
    $('#loginSheet').classList.add('up');
  },
  close() { $('#loginSheet').classList.remove('up'); },

  async go(provider) {
    authConsentIntent.mark();
    try {
      await auth.signIn(provider);   // OAuth 리디렉션 — 여기서 페이지를 떠난다
    } catch (e) {
      authConsentIntent.clear();
      if (e.message === 'AUTH_NOT_CONFIGURED') {
        toast('현재 로그인을 이용할 수 없습니다. 공개 자료는 로그인 없이 이용하실 수 있습니다.');
      } else {
        console.warn('[login] 로그인 실패:', e.message);
        toast('로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   동의 화면 — 최초 로그인 직후 1회
   필수/선택을 분리하고, 선택을 거부해도 가입이 완료되어야 한다.
   ══════════════════════════════════════════════════════════════ */
export const consentSheet = {
  _resolve: null,

  needed() {
    // 이 기기에서 이 버전에 동의한 적이 있는지
    return localStorage.getItem('earthus.consent') !== CONFIG.LEGAL_VERSION;
  },

  /**
   * @param {boolean} review  메뉴에서 다시 볼 때(true)는 저장된 동의를 미리 채우고,
   *                          '닫기'로 나가도 로그인/가입을 취소하지 않는다.
   */
  open(review = false) {
    this._review = review;
    return new Promise(resolve => {
      this._resolve = resolve;
      if (review) {
        const agreed = localStorage.getItem('earthus.consent') === CONFIG.LEGAL_VERSION;
        $('#cTos').checked = agreed;
        $('#cPrivacy').checked = agreed;
        $('#cAge').checked = agreed;
        $('#cLocation').checked = localStorage.getItem('earthus.consent.location') === '1';
        $('#cMarketing').checked = false;
        $('#cUsage').checked = localStorage.getItem('earthus.consent.usage') === '1';
      } else {
        ['cTos', 'cPrivacy', 'cAge', 'cMarketing', 'cLocation', 'cUsage'].forEach(id => { $('#' + id).checked = false; });
      }
      $('#consentCancel').textContent = review ? '닫기' : '동의하지 않고 나가기';
      this.sync();
      // 다른 시트가 떠 있으면 먼저 닫는다 (화면 밖으로 겹쳐 쌓이지 않게)
      document.querySelectorAll('.sheet-panel.up').forEach(p => {
        if (p.id !== 'consentSheet') p.classList.remove('up');
      });
      $('#consentSheet').classList.add('up');
    });
  },

  sync() {
    const ok = $('#cTos').checked && $('#cPrivacy').checked && $('#cAge').checked;
    $('#consentSubmit').disabled = !ok;
    $('#consentSubmit').style.opacity = ok ? '1' : '.4';
  },

  toggleAll(v) {
    ['cTos', 'cPrivacy', 'cAge', 'cMarketing', 'cLocation', 'cUsage'].forEach(id => { $('#' + id).checked = v; });
    this.sync();
  },

  async submit() {
    const payload = {
      tos: $('#cTos').checked,
      privacy: $('#cPrivacy').checked,
      over14: $('#cAge').checked,
      marketing: $('#cMarketing').checked,
      location: $('#cLocation').checked,
      /* 이용 행태 — ⚠️ **선택**이다. 안 해도 서비스는 그대로 쓴다.
         ⚠️ 그리고 **끌 수 있어야 한다.** 동의 관리에서 다시 열어 끄면 즉시 멈춘다. */
      usage: $('#cUsage').checked,
    };
    if (!(payload.tos && payload.privacy && payload.over14)) return;

    /* ⚠️⚠️ 서버에 동의가 저장돼야 가입 완료다. 저장이 실패했는데 완료라고
       말하면 기록 없는 동의가 된다 — 동의창을 열어 둔 채 다시 시도하게 한다.
       (감사 P1-4) */
    const r = await auth.saveConsent(payload);
    if (!r?.ok) {
      toast(r?.reason === 'no-session'
        ? '로그인이 풀렸습니다. 다시 로그인해 주세요.'
        : '동의 기록을 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
      return;                          // ⚠️ 창을 닫지 않는다
    }
    localStorage.setItem('earthus.consent', CONFIG.LEGAL_VERSION);
    localStorage.setItem('earthus.consent.location', payload.location ? '1' : '0');
    localStorage.setItem('earthus.consent.usage', payload.usage ? '1' : '0');
    document.dispatchEvent(new CustomEvent('earthus:usage-consent', {
      detail: { enabled: payload.usage },
    }));
    $('#consentSheet').classList.remove('up');
    this._resolve?.(payload);
    toast('가입이 완료되었습니다');
  },

  /** 필수 동의를 거부하고 나가면 가입을 취소한다.
   *  단, 메뉴에서 다시 보기(review)로 연 경우엔 그냥 닫기만 한다. */
  async cancel() {
    $('#consentSheet').classList.remove('up');
    if (this._review) { this._resolve?.(null); return; }
    await auth.signOut();
    this._resolve?.(null);
    toast('동의하지 않아 가입이 취소되었습니다');
  },
};

/* ══════════════════════════════════════════════════════════════
   계정 화면
   ══════════════════════════════════════════════════════════════ */
export const accountSheet = {
  open() {
    this.render();
    $('#accountSheet').classList.add('up');
  },
  close() { $('#accountSheet').classList.remove('up'); },

  render() {
    const signed = auth.isSignedIn();
    $('#accGuest').style.display = signed ? 'none' : 'block';
    $('#accUser').style.display = signed ? 'block' : 'none';
    if (!signed) return;

    const p = auth.profile || {};
    $('#accEmail').textContent = p.email || auth.user?.email || '확인되지 않음';
    $('#accProvider').textContent =
      ({ google: 'Google', apple: 'Apple' })[p.provider] || p.provider || '확인되지 않음';
    $('#accTier').textContent = auth.isPaid() ? '구독 중' : '무료';
    $('#accBadge').style.display = auth.isFounding() ? 'inline-block' : 'none';
  },

  async exportData() {
    try {
      const data = await auth.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `earthus-mydata-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('내 데이터를 내려받았습니다');
    } catch (e) { toast('실패: ' + e.message); }
  },

  async signOut() {
    await auth.signOut();
    this.render();
    toast('로그아웃되었습니다');
  },

  /** 앱스토어 필수 요건 — 되돌릴 수 없으므로 2단계 확인 */
  async deleteAccount() {
    if (!confirm('계정을 삭제하면 모든 데이터가 즉시 사라지며 복구할 수 없습니다.\n계속하시겠습니까?')) return;
    if (!confirm('마지막 확인입니다.\n\n유료 구독 중이라면 App Store / Google Play에서 구독을 별도로 해지해야 합니다.\n\n정말 삭제하시겠습니까?')) return;
    try {
      await auth.deleteAccount();
      localStorage.removeItem('earthus.consent');
      this.render();
      this.close();
      toast('계정이 삭제되었습니다');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  },
};

/* ══════════════════════════════════════════════════════════════
   사전등록 (§7)
   ══════════════════════════════════════════════════════════════ */
/* 언어를 바꾸면 남은 자리 문구도 따라와야 한다.
   ⚠️ data-i18n 이 아니라 스크립트가 쓰는 글이라 applyStatic 이 못 건드린다. */
i18n.onChange(() => {
  const el = $('#wlSeats');
  if (el && el.style.display !== 'none') waitlistUI.init();
});

export const waitlistUI = {
  async init() {
    /* 남은 자리. ⚠️ 달성 막대가 아니다 —
       막대는 "채우면 열린다"로 읽히고, 이건 "차면 닫힌다"다.
       선착순 500명에게 평생 반값을 약속했으니 숫자가 맞아야 한다. */
    const el = $('#wlSeats');
    if (!el) return;
    const p = await waitlist.progress();
    if (!p) { el.style.display = 'none'; return; }   // 못 세면 안 보여준다
    const ko = i18n.lang !== 'en';
    el.textContent = p.left > 0
      ? (i18n.STATIC['wl.seats'][ko ? 'ko' : 'en']).replace('{n}', p.left.toLocaleString())
      : i18n.STATIC['wl.seatsFull'][ko ? 'ko' : 'en'];
    el.classList.toggle('full', p.left <= 0);
    el.style.display = 'block';
  },
  async submit(ev) {
    ev?.preventDefault();
    const input = $('#wlEmail');
    const email = input.value.trim();
    const marketing = $('#wlMarketing').checked;
    try {
      const r = await waitlist.join(email, { marketing });
      input.value = '';
      /* ⚠️ 영어로 써도 여기만 한국어가 나오고 있었다 (AX 검수와 같은 종류). */
      const ko = i18n.lang !== 'en';
      toast(r.already
        ? (ko ? '이미 등록된 이메일입니다' : 'This email is already registered')
        : (ko ? '사전등록이 완료되었습니다. 열리면 먼저 알려드립니다'
              : 'You are on the list. We will write to you when it opens'));
      if (!r.already) this.init();   // 방금 한 자리가 줄어든 것을 바로 보여준다
    } catch (e) {
      const ko = i18n.lang !== 'en';
      if (e.message === 'INVALID_EMAIL')
        toast(ko ? '이메일 형식을 확인해주세요' : 'Please check the email format');
      else if (e.message === 'BACKEND_NOT_CONFIGURED')
        toast(ko ? '아직 연결되지 않았습니다. 잠시 뒤 다시 시도해 주세요'
                 : 'Not connected yet — please try again shortly');
      else toast((ko ? '등록 실패: ' : 'Sign-up failed: ') + e.message);
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   사업자 정보 — 전자상거래법 제10조 필수 고지
   ══════════════════════════════════════════════════════════════ */
export function renderBusinessInfo() {
  const b = CONFIG.BUSINESS || {};
  const box = $('#bizInfo');
  if (!box) return;
  const rows = [
    ['상호', b.name], ['대표자', b.ceo], ['주소', b.address],
    ['사업자등록번호', b.regNo], ['통신판매업 신고', b.mailOrderNo],
    ['문의', b.email], ['개인정보 보호책임자', b.privacyOfficer],
  ].filter(([, v]) => v);
  box.innerHTML = rows.length
    ? rows.map(([k, v]) => `<div class="biz-row"><span>${k}</span><span>${v}</span></div>`).join('')
    /* ⚠️ 사업자 정보가 없으면 **줄을 통째로 숨긴다.** 예전엔 운영 화면에
       'config.local.js 에 입력 필요'라는 개발자용 문구가 그대로 보였다.
       사용자에게 우리 파일 이름을 알려 줄 이유가 없다. (감사 P1-10) */
    : '';
}

/* ── 토스트 (ui.js 와 공유) ─────────────────────────────────── */
let tt;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2800);
}

/* ══════════════════════════════════════════════════════════════
   초기화 — 로그인 상태 ↔ 티어 연결
   ══════════════════════════════════════════════════════════════ */
export async function initAccount() {
  await auth.init();

  const continueExplicitAuth = async user => {
    if (!user || !authConsentIntent.consume()) return;
    if (consentSheet.needed()) await consentSheet.open();
  };

  auth.onChange(async (user) => {
    // 로그인 상태를 티어에 반영. 게스트/무료 회원은 free, 구독자는 paid.
    store.setTier(auth.isPaid() ? 'paid' : 'free');
    accountSheet.render();

    /* ⚠️⚠️ **로그인 창을 닫아주는 코드가 없었다.**
       로그인에 성공해도 창이 그대로 떠 있어서 "또 로그인하라"로 보인다.
       받은 지적: "로그인되면 계정 창이 나와야하는거 아냐?" — 맞는 말이다.
       ⚠️ 동의가 필요하면 그쪽이 이어서 열리므로 여기서는 닫기만 한다. */
    if (user) {
      document.getElementById('loginSheet')?.classList.remove('up');
    }

    /* ⚠️ 저장돼 있던 세션의 INITIAL_SESSION도 여기로 온다. 그것을 신규 가입으로 읽어
       첫 Earth 위에 약관을 덮지 않는다. 이 탭의 명시적 OAuth 왕복만 동의를 잇는다. */
    await continueExplicitAuth(user);
  });

  // OAuth 반환 세션이 구독 등록보다 먼저 복원된 경우에도 명시적 intent는 한 번만 소비한다.
  await continueExplicitAuth(auth.user);

  renderBusinessInfo();
  /* ⚠️ 사전등록 시트는 지금 열 수 있는 문이 없다 (SHOW_SUBSCRIBE=false).
     그런데도 부팅 때마다 Supabase 를 불러 등록 인원을 세고 있었다.
     보이지 않는 화면 때문에 매번 왕복하지 않는다. */
  if (CONFIG.SHOW_WAITLIST) waitlistUI.init();
}

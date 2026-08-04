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
  async open(doc) {
    const box = $('#legalSheet');
    const body = $('#legalBody');
    body.innerHTML = `<p style="opacity:.5">${i18n.t.loading}</p>`;
    box.classList.add('up');
    $('#legalTitle').textContent = doc === 'terms' ? '이용약관' : '개인정보처리방침';
    try {
      const res = await fetch(`legal/${doc === 'terms' ? 'terms' : 'privacy'}.ko.md`);
      if (!res.ok) throw new Error(String(res.status));
      body.innerHTML = md2html(await res.text());
    } catch (e) {
      body.innerHTML = `<p>문서를 불러오지 못했습니다 (${e.message})</p>`;
    }
  },
  close() { $('#legalSheet').classList.remove('up'); },
};

/* ══════════════════════════════════════════════════════════════
   로그인 시트 — Google / Apple 만
   ══════════════════════════════════════════════════════════════ */
export const loginSheet = {
  open() {
    const configured = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
    $('#loginNotice').style.display = configured ? 'none' : 'block';
    $('#loginSheet').classList.add('up');
  },
  close() { $('#loginSheet').classList.remove('up'); },

  async go(provider) {
    try {
      await auth.signIn(provider);   // OAuth 리디렉션 — 여기서 페이지를 떠난다
    } catch (e) {
      if (e.message === 'AUTH_NOT_CONFIGURED') {
        toast('Supabase 키가 아직 설정되지 않았습니다 (config.local.js)');
      } else {
        toast('로그인 실패: ' + e.message);
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

    await auth.saveConsent(payload);
    localStorage.setItem('earthus.consent', CONFIG.LEGAL_VERSION);
    localStorage.setItem('earthus.consent.location', payload.location ? '1' : '0');
    localStorage.setItem('earthus.consent.usage', payload.usage ? '1' : '0');
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
    $('#accEmail').textContent = p.email || auth.user?.email || '—';
    $('#accProvider').textContent =
      ({ google: 'Google', apple: 'Apple' })[p.provider] || p.provider || '—';
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
export const waitlistUI = {
  async init() {
    const p = await waitlist.progress();
    if (p) this.renderProgress(p);
  },
  renderProgress({ count, goal, pct }) {
    const bar = $('#wlBar'), txt = $('#wlText');
    if (!bar) return;
    bar.style.width = pct + '%';
    txt.textContent = `${count.toLocaleString()} / ${goal.toLocaleString()}명 (${pct}%)`;
    $('#wlProgress').style.display = 'block';
  },
  async submit(ev) {
    ev?.preventDefault();
    const input = $('#wlEmail');
    const email = input.value.trim();
    const marketing = $('#wlMarketing').checked;
    try {
      const r = await waitlist.join(email, { marketing });
      input.value = '';
      toast(r.already ? '이미 등록된 이메일입니다' : '사전등록이 완료되었습니다');
      const p = await waitlist.progress();
      if (p) this.renderProgress(p);
    } catch (e) {
      if (e.message === 'INVALID_EMAIL') toast('이메일 형식을 확인해주세요');
      else if (e.message === 'BACKEND_NOT_CONFIGURED') toast('백엔드가 아직 연결되지 않았습니다');
      else toast('등록 실패: ' + e.message);
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
    : '<div class="biz-row" style="opacity:.4"><span>사업자 정보</span><span>config.local.js 에 입력 필요</span></div>';
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

  auth.onChange(async (user) => {
    // 로그인 상태를 티어에 반영. 게스트/무료 회원은 free, 구독자는 paid.
    store.setTier(auth.isPaid() ? 'paid' : 'free');
    accountSheet.render();

    // 최초 로그인이면 동의 화면
    if (user && consentSheet.needed()) {
      await consentSheet.open();
    }
  });

  renderBusinessInfo();
  waitlistUI.init();
}

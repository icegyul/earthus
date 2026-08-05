// 구독 안내 + 서비스별 선착순 관심 등록
//
// 두 가지를 한 파일에 두는 이유: 둘 다 "돈과 약속"에 관한 화면이라
// 문구가 어긋나면 바로 신뢰 문제가 된다. 한 곳에서 관리한다.
//
// ⚠️ 지키지 못할 말을 쓰지 않는다.
//    · 결제 연동이 없으면 "구독하기"를 눌러도 결제창이 안 뜬다 → 그대로 말한다
//    · 목표 인원을 채워도 계약·연동에 시간이 걸린다 → "즉시 오픈"이라고 쓰지 않는다
//    · 백엔드가 없으면 인원수를 0 이 아니라 "집계 전"으로 쓴다 (0 은 거짓이다)

import { auth, interest } from './auth.js';
import { billing, PLANS, PAID_FEATURES, FREE_FEATURES } from './billing.js';
import { i18n } from './i18n.js';
import { CONFIG } from './config.local.js';
import { toast } from './ui.js';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

/* 선착순으로 여는 서비스.
   goal 은 유료 데이터 계약이 성립하는 최소 규모를 잡은 값이다.
   ⚠️ 근거 없이 낮게 잡아 "곧 열릴 것처럼" 보이게 하지 않는다. */
export const DEMAND_SERVICES = {
  flight: {
    ko: '항공기 실시간', en: 'Live aircraft', goal: 3000, icon: '✈',
    whyKo: '전 세계 항공기 위치는 유료 API 입니다. 월 이용료가 커서 일정 규모가 되어야 계약할 수 있습니다.',
    whyEn: 'Global aircraft positions come from a paid API with a large monthly fee — it needs scale to be viable.',
    perkKo: '먼저 등록한 3,000명은 이 기능이 열린 뒤 1년간 추가 요금 없이 사용합니다.',
    perkEn: 'The first 3,000 registrants get this feature at no extra cost for one year after launch.',
  },
  ship: {
    ko: '선박 실시간', en: 'Live ships', goal: 2000, icon: '⚓',
    whyKo: '선박 AIS 데이터도 유료입니다. 항만·연안은 무료 수신망이 있지만 대양 구간은 위성 AIS 라 비쌉니다.',
    whyEn: 'Ship AIS is also paid. Coastal data has free receivers, but open-ocean coverage needs satellite AIS.',
    perkKo: '먼저 등록한 2,000명은 이 기능이 열린 뒤 1년간 추가 요금 없이 사용합니다.',
    perkEn: 'The first 2,000 registrants get this feature at no extra cost for one year after launch.',
  },
};

export const subscribeSheet = {
  plan: 'yearly',
  seats: undefined,          // undefined=아직 안 물어봄 · null=못 셈 · 숫자=남은 자리

  open(reason) {
    this._reason = reason || null;
    $('#subSheet').classList.add('up');
    this.render();
    /* ⚠️ 창립회원 요금제를 없앴다 (받은 결정). 좌석을 셀 일이 없어 조회도 뺀다.
       당시 이유: 연 ₩19,000 은 한 달 ₩1,583 꼴이라 당시 월간(₩12,000)보다
       8배 싸서 아무도 월간을 안 사고, 500명이 차도 초기 자금이 950만원에서 멈췄다.
       2026-08-05 Personal Pro 가격을 바꿨지만 이 상품을 되살린 것은 아니다.
       그리고 오늘 새로 쓴 '초기에 결제해 주시면'(기간 2배·이름 등재·우선 초대)과
       하는 일이 겹쳤다 — 초기 후원자를 부르는 장치가 두 개일 이유가 없다.
       ⚠️ '사전등록 · 창립 멤버' 배지는 **요금제가 아니라 별개다.** 그대로 둔다. */
  },
  close() { $('#subSheet').classList.remove('up'); },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#subBody');
    if (!body) return;
    body.innerHTML = '';
    $('#subTitle').textContent = ko ? 'earthus 구독' : 'earthus Pro';

    if (this._reason) {
      body.appendChild(el('p', 'sp-lead', this._reason));
    }

    /* 이미 구독 중이면 안내만 */
    if (billing.isPaid()) {
      body.appendChild(el('div', 'sub-active', ko
        ? '✦ 구독 중입니다. 모든 레이어가 열려 있습니다.'
        : '✦ You are subscribed. All layers are unlocked.'));
      body.appendChild(el('p', 'sky-note', ko
        ? '구독 관리·해지는 결제하신 곳(App Store · Google Play · 결제사)에서 하실 수 있습니다.'
        : 'Manage or cancel where you purchased (App Store, Google Play, or the payment provider).'));
      return;
    }

    /* ── 요금제 선택 ── */
    const save = billing.yearlySavingPct();
    const opts = [
      ['yearly', ko ? '연간' : 'Yearly', save > 0 ? (ko ? `${save}% 절약` : `save ${save}%`) : ''],
      ['monthly', ko ? '월간' : 'Monthly', ''],
    ];
    /* 창립회원 — ⚠️ **남은 자리가 있다고 확인됐을 때만** 보여준다.
       못 셌을 때(null) 보여주면 마감된 상품을 파는 것이 될 수 있다. */
    const picker = el('div', 'plan-picker');
    opts.forEach(([key, label, badge]) => {
      const p = PLANS[key];
      if (!p) return;
      const b = el('button', 'plan' + (this.plan === key ? ' on' : ''));
      const perYear = p.period === 'year';
      b.innerHTML = `<div class="pl-name">${label}${badge ? `<em>${badge}</em>` : ''}</div>`
        + `<div class="pl-price">${billing.price(key)}</div>`
        + `<div class="pl-per">${ko
            ? (perYear ? `연 · 월 ₩${Math.round(p.krw / 12).toLocaleString()} 꼴` : '월')
            : (perYear ? `per year · $${(p.usd / 12).toFixed(2)}/mo` : 'per month')}</div>`;
      b.onclick = () => { this.plan = key; this.render(); };
      picker.appendChild(b);
    });
    body.appendChild(picker);


    /* ── 무엇이 열리나 ── */
    const feat = el('div', 'feat-block');
    /* ⚠️⚠️ **왜 돈을 받는지**를 먼저 적는다. 받은 지시대로 쓰되 감정 호소만 하지 않는다 —
       "공공API라 팔 게 없다"는 사실이 아니다. 자료는 공개돼 있지만
       **그 자료를 믿어도 되는지까지 말해 주는 곳은 없다.** 파는 것은 그 정직함이다.
       ⚠️ 그리고 **아직 없는 기능에 미리 받는 돈**이라 청약철회를 반드시 함께 적는다.
          법으로 필요한 것이면서, 동시에 가장 설득력 있는 문장이다 —
          "못 하는 걸 못 한다고 말하는 사람"이라는 증거이기 때문이다. */
    feat.appendChild(el('div', 'sub-why', ko ? `
      <h4>우리가 파는 것은 자료가 아닙니다</h4>
      <p>자료는 공공기관이 공개한 것입니다. 누구나 받을 수 있습니다.
         우리가 하는 일은 그 자료를 <b>믿어도 되는지까지 말하는 것</b>입니다 —
         출처, 관측 시각, 표본 수, 판단 기준, 그리고 <b>우리가 모르는 것</b>까지.</p>

      <h4>⚠️ 지금 못 하는 것</h4>
      <p>비행기와 배의 실시간 위치는 <b>공공자료가 아닙니다.</b> 돈을 주고 사와야 합니다.</p>

      <h4>혼자 만들고 있습니다</h4>
      <p>한국·일본·영국·미국이 공개한 자료를 모아 최대한 무료로 드리려 합니다.
         다만 서버비와 개발 시간은 계속 듭니다.</p>

      <h4>초기에 결제해 주시면</h4>
      <ul>
        <li>비행기·배가 열릴 때까지 기다리신 기간을 <b>두 배로</b> 돌려드립니다</li>
        <li><b>초기 멤버 페이지</b>에 원하시는 이름이나 별칭을 올려 드립니다</li>
        <li>책·행사 같은 혜택이 생기면 <b>언제나 먼저</b> 모시겠습니다 — 서비스가 살아 있는 한</li>
      </ul>

    ` : `
      <h4>We are not selling the data</h4>
      <p>The data is public. Anyone can fetch it. What we do is tell you
         <b>whether you can trust it</b> — source, observation time, sample size,
         thresholds, and <b>what we do not know</b>.</p>

      <h4>⚠️ What we cannot do yet</h4>
      <p>Live aircraft and ship positions are <b>not public data</b>. They must be bought.</p>

      <h4>Built by one person</h4>
      <p>Public data from Korea, Japan, the UK and the US, kept free as far as we can.
         Servers and development time still cost money.</p>

      <h4>If you subscribe early</h4>
      <ul>
        <li>We <b>double</b> the time you waited until aircraft and ships open</li>
        <li>Your name or handle goes on the <b>early members page</b></li>
        <li>Books, events and other perks — <b>you are invited first</b>, as long as we exist</li>
      </ul>

    `));

    feat.appendChild(el('h4', null, ko ? '구독하면 열리는 것' : 'Unlocked with Pro'));
    const ul = el('ul', 'feat-list');
    PAID_FEATURES.forEach(f => {
      /* ⚠️⚠️ 아직 못 만든 것을 **만든 것처럼 팔지 않는다.**
         이 목록은 한때 "지진 알림"을 팔고 있었는데 웹푸시 서버가 없어 알림이 안 갔다. */
      const li = el('li', f.soon ? 'soon' : 'yes', ko ? f.ko : f.en);
      if (f.soon) li.appendChild(el('em', 'soon-tag', ko ? ' 준비 중' : ' coming soon'));
      ul.appendChild(li);
    });
    feat.appendChild(ul);
    if (PAID_FEATURES.some(f => f.soon)) {
      feat.appendChild(el('p', 'sky-note', ko
        ? '「준비 중」은 아직 동작하지 않는 기능입니다. 지금 결제하셔도 그 기능은 완성된 뒤에 열립니다 — 그 점을 미리 말씀드립니다.'
        : 'Items marked "coming soon" do not work yet. Subscribing now does not enable them until they ship — we would rather say so up front.'));
    }

    feat.appendChild(el('h4', null, ko ? '구독하지 않아도 계속 무료' : 'Always free'));
    const ul2 = el('ul', 'feat-list');
    FREE_FEATURES.forEach(f => ul2.appendChild(el('li', 'free', ko ? f.ko : f.en)));
    feat.appendChild(ul2);
    body.appendChild(feat);

    /* ── 결제 ── */
    /* ⚠️⚠️ **통신판매업 신고 전에는 유료 판매를 열지 않는다.**
       전자상거래법상 신고 없이 통신판매를 하는 것 자체가 위반이다.
       결제 코드는 다 되어 있고 테스트 키로 결제창까지 확인했지만,
       **된다고 여는 것과 열어도 되는 것은 다르다.**
       ⚠️ 신고번호만으로는 부족하다. Open-Meteo 무료 호스팅 API는 비상업 전용이고,
          Smithsonian GVP도 상업 이용은 사전 허가가 필요하다. 둘 다 검증하지 않으면 안 열린다. */
    const dataReady = CONFIG.OPEN_METEO_COMMERCIAL_READY === true
      && CONFIG.GVP_COMMERCIAL_READY === true;
    const salesReady = CONFIG.SALES_OPEN && dataReady;
    const provs = salesReady ? billing.providers() : [];
    if (!provs.length) {
      /* ⚠️ 여기가 지금 상태다. 버튼을 눌러도 결제가 안 되므로,
         "곧 됩니다"가 아니라 "무엇이 없어서 안 되는지"를 쓴다. */
      const box = el('div', 'pay-pending');
      const dataBlocked = CONFIG.SALES_OPEN && !dataReady;
      box.innerHTML = `<b>${ko ? '결제 준비 중' : 'Payments not live yet'}</b>`
        + `<p>${dataBlocked
          ? (ko
            ? '상업 이용이 가능한 기상 API 경로와 GVP 화산 자료 허가를 검증하는 중입니다. 조건을 모두 충족하기 전에는 유료 판매를 열지 않습니다.<br>'
              + '<b>지금 보시는 기능은 모두 무료입니다.</b>'
            : 'We are validating a weather API route licensed for commercial use and commercial permission for GVP volcano data. Paid sales stay closed until both are ready.<br>'
              + '<b>Everything you see now is free.</b>')
          : (ko
            ? '통신판매업 신고 절차를 밟고 있습니다. 신고가 끝나기 전에는 유료 판매를 열지 않습니다 — 법으로 그렇게 되어 있고, 저희도 그게 맞다고 봅니다.<br>'
              + '<b>지금 보시는 기능은 모두 무료입니다.</b> 사전등록해 두시면 결제가 열리는 즉시 알려드리고, 초기 구독자 혜택을 함께 드립니다.'
            : 'We are completing our mail-order business registration. We will not open paid sales before it is done.<br>'
              + '<b>Everything you see now is free.</b> Register and we will tell you the moment it opens, with early-subscriber benefits.')}</p>`;
      body.appendChild(box);

      const btn = el('button', 'btn-primary', ko ? '사전등록하고 알림 받기' : 'Register for launch');
      btn.onclick = () => {
        this.close();
        // 다른 시트가 떠 있으면 먼저 닫는다 (화면 밖으로 겹쳐 쌓이지 않게)
        document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
        $('#waitlistSheet')?.classList.add('up');
        import('./ui-account.js').then(m => m.waitlistUI.init());
      };
      body.appendChild(btn);
    } else {
      provs.forEach((p, i) => {
        const btn = el('button', i === 0 ? 'btn-primary' : 'btn-secondary',
          `${ko ? '구독하기' : 'Subscribe'} · ${ko ? p.ko : p.en}`);
        btn.onclick = () => this.go(p.key);
        body.appendChild(btn);
      });
    }

    /* ── 법정 고지 (전자상거래법 · 앱스토어 규정) ──
       ⚠️⚠️ **자동갱신 여부를 결제 수단에 맞춰 쓴다.**
       앱스토어·플레이 결제는 자동갱신이지만, 웹(PG)은 지금 **자동갱신 없는 이용권**이다.
       한 문장으로 뭉뚱그려 "자동 갱신됩니다"라고 쓰면 웹 구매자에게 거짓말이 되고,
       반대로 자동갱신인데 안 적으면 앱스토어 심사에서 걸린다. */
    const autoRenew = provs.some(p => p.key === 'apple' || p.key === 'google');
    body.appendChild(el('p', 'sub-legal', autoRenew
      ? (ko
        ? '앱스토어·구글플레이 구독은 기간이 끝나기 전에 해지하지 않으면 자동으로 갱신됩니다. 해지는 결제하신 곳에서 언제든 가능하며, 남은 기간까지는 계속 이용하실 수 있습니다. 표시 금액은 부가세 포함입니다.'
        : 'App Store and Google Play subscriptions renew automatically unless cancelled before the period ends. Cancel any time where you purchased; access continues until the period ends. Prices include VAT where applicable.')
      : (ko
        ? '카드 결제는 정해진 기간만큼 쓰는 이용권입니다. 자동으로 갱신되지 않으므로 해지 절차도 없습니다. 기간이 끝나면 무료로 돌아가고, 필요하시면 다시 결제하시면 됩니다. 남은 기간이 있는 상태에서 다시 결제하면 그 뒤에 이어 붙습니다. 표시 금액은 부가세 포함입니다.'
        : 'Card payment buys a pass for a fixed period. It does not auto-renew, so there is nothing to cancel. When it ends you return to the free tier. Buying again while time remains extends from that date. Prices include VAT where applicable.')));
  },

  async go(providerKey) {
    const ko = i18n.lang === 'ko';
    /* 결제 전에 로그인이 필요하다 — 누구의 구독인지 서버가 알아야
       기기를 바꿔도 구독이 따라간다. */
    if (!auth.user) {
      this.close();
      const { loginSheet } = await import('./ui-account.js');
      loginSheet.open(ko
        ? '구독을 계정에 연결하려면 로그인이 필요합니다. 기기를 바꿔도 구독이 그대로 따라갑니다.'
        : 'Sign in so your subscription follows you across devices.');
      return;
    }
    try {
      await billing.subscribe(this.plan, providerKey);
    } catch (e) {
      /* ⚠️ 실패 이유를 뭉뚱그리지 않는다. "결제 실패"만 뜨면 사용자는
         카드 문제인지 우리 문제인지 알 수 없어 같은 시도를 반복한다. */
      const MSG = {
        NOT_AVAILABLE:  ['이 기기에서는 아직 결제할 수 없습니다', 'Payments unavailable on this device'],
        NOT_CONFIGURED: ['결제 수단이 아직 연결되지 않았습니다', 'Payments are not connected yet'],
        DATA_LICENSE_NOT_READY: ['상업 이용 가능한 기상 자료 경로를 확인하기 전에는 결제를 열지 않습니다',
                                 'Payments stay closed until the commercial weather-data route is verified'],
        NOT_SIGNED_IN:  ['로그인이 필요합니다', 'Please sign in first'],
        SOLD_OUT:       ['창립회원 모집이 마감되었습니다', 'Founding membership is sold out'],
        UNKNOWN_PLAN:   ['판매하지 않는 상품입니다', 'That plan is not on sale'],
        PG_SDK_BLOCKED: ['결제 모듈을 불러오지 못했습니다. 광고 차단 확장을 잠시 꺼주세요',
                         'Could not load the payment module — try disabling ad blockers'],
      };
      const m = MSG[e.message];
      if (m) {
        toast(ko ? m[0] : m[1]);
        // 마감이면 화면의 선택지도 즉시 걷어낸다 — 다시 눌러도 안 되는 버튼을 남기지 않는다.
        if (e.message === 'SOLD_OUT') { this.seats = 0; this.plan = 'yearly'; this.render(); }
      } else {
        toast((ko ? '결제 시작 실패: ' : 'Checkout failed: ') + e.message);
      }
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   선착순 오픈 (항공기 · 선박)
   ══════════════════════════════════════════════════════════════ */
export const demandSheet = {
  service: null,

  async open(service) {
    if (!DEMAND_SERVICES[service]) return;
    this.service = service;
    $('#demandSheet').classList.add('up');
    this.render(null);
    let n = null;
    try { n = await interest.count(service); } catch (_) { /* 백엔드 없음 */ }
    if ($('#demandSheet').classList.contains('up')) this.render(n);
  },
  close() { $('#demandSheet').classList.remove('up'); },

  render(count) {
    const ko = i18n.lang === 'ko';
    const s = DEMAND_SERVICES[this.service];
    const body = $('#demandBody');
    if (!body || !s) return;
    body.innerHTML = '';
    $('#demandTitle').textContent = `${s.icon} ${ko ? s.ko : s.en}`;

    body.appendChild(el('p', 'sp-lead', ko ? s.whyKo : s.whyEn));

    /* 진행률 — 숫자를 공개해야 약속이 검증 가능해진다.
       ⚠️ 집계를 못 하면 0 이 아니라 "집계 전"이다. 0 은 거짓말이 된다. */
    const bar = el('div', 'dm-progress');
    if (count == null) {
      bar.innerHTML = `<div class="dm-bar"><i style="width:0"></i></div>`
        + `<div class="dm-num">${ko
          ? `목표 ${s.goal.toLocaleString()}명 · 현재 인원 집계 전`
          : `Goal ${s.goal.toLocaleString()} · count unavailable`}</div>`;
    } else {
      const pct = Math.min(100, Math.round((count / s.goal) * 100));
      bar.innerHTML = `<div class="dm-bar"><i style="width:${pct}%"></i></div>`
        + `<div class="dm-num"><b>${count.toLocaleString()}</b> / ${s.goal.toLocaleString()}${ko ? '명' : ''} (${pct}%)</div>`;
    }
    body.appendChild(bar);

    body.appendChild(el('div', 'dm-perk',
      `<b>${ko ? '먼저 등록하면' : 'Early registrants'}</b><p>${ko ? s.perkKo : s.perkEn}</p>`));

    /* 등록 폼 */
    const form = el('form', 'dm-form');
    form.innerHTML = `<input type="email" id="dmEmail" placeholder="${
      ko ? '이메일 주소' : 'Email address'}" autocomplete="email" required>`;
    const btn = el('button', 'btn-primary', ko ? '관심 등록' : 'Register interest');
    btn.type = 'submit';
    form.appendChild(btn);
    form.onsubmit = e => this.submit(e);
    body.appendChild(form);

    body.appendChild(el('p', 'sky-note', ko
      ? '목표 인원을 채우면 데이터 제공사와 계약을 진행합니다. 계약과 연동에 시간이 걸리므로 달성 즉시 열리지는 않습니다 — 진행 상황은 등록하신 메일로 알려드립니다. 이메일은 이 안내 외의 목적으로 쓰지 않습니다.'
      : 'When the goal is met we begin contracting with the data provider. Contracting and integration take time, so it will not open the moment the number is reached — we will email you with progress. Your address is used only for this notice.'));
  },

  async submit(ev) {
    ev.preventDefault();
    const ko = i18n.lang === 'ko';
    const input = $('#dmEmail');
    try {
      const r = await interest.join(this.service, input.value);
      input.value = '';
      toast(r.already
        ? (ko ? '이미 등록되어 있습니다' : 'Already registered')
        : (ko ? '등록되었습니다. 열리면 알려드릴게요.' : 'Registered — we will let you know.'));
      const n = await interest.count(this.service);
      this.render(n);
    } catch (e) {
      if (e.message === 'INVALID_EMAIL') toast(ko ? '이메일 형식을 확인해주세요' : 'Check the email format');
      else if (e.message === 'BACKEND_NOT_CONFIGURED') {
        toast(ko ? '백엔드가 아직 연결되지 않았습니다' : 'Backend not connected yet');
      } else toast((ko ? '등록 실패: ' : 'Failed: ') + e.message);
    }
  },
};

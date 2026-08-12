// API 신청 관리 — 무엇을 신청했고, 언제 만료되고, 지금 작동하는가
//
// 왜 필요한가 (받은 요청)
//   "공공데이터 보니깐 2년마다 재신청 해야하나봐 그래서 2년뒤 재신청할 수 있게
//    신청 리스트 페이지와 자동으로 신청할 수 있으면 로그인만 내가 하고 자동으로
//    신청 가능하게 페이지를 만들어서 관리자 페이지에 넣어줘"
//
// ⚠️ 자동 신청은 만들지 않았다. 왜인지 분명히 밝힌다.
//    ① 로그인한 브라우저로 정부 사이트 양식을 대신 제출하는 일이다.
//       사람이 확인하지 않은 채로 기관에 신청서가 나가면 안 된다.
//    ② data.go.kr 은 화면을 자바스크립트로 그린다. 페이지가 조금만 바뀌어도
//       자동 제출은 조용히 실패하거나 **엉뚱한 것을 신청**한다.
//       "신청됐겠지" 하고 믿고 있다가 키가 만료돼 자료가 끊기는 게 최악이다.
//    ③ 대신 여기서 할 수 있는 걸 다 한다:
//       무엇을 신청해야 하는지 · 언제 만료되는지 · 지금 진짜 되는지 ·
//       그 항목의 신청 페이지로 바로 가기.
//    사람이 눌러야 하는 것은 마지막 "신청" 버튼 하나뿐이다.
//
// ⚠️ 키 자체는 여기에 절대 두지 않는다.
//    키는 Lambda 환경변수에만 있다. 이 화면은 "되는가/안 되는가"만 본다.
//    브라우저에 키를 두면 누구나 개발자도구로 읽어 남의 할당량을 쓴다.

import { i18n } from './i18n.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LS = 'earthus.apikeys';

/* Lambda 가 있는 리전. ⚠️ 콘솔 주소에 리전이 들어가서, 틀리면 "함수가 없다"고 나온다.
   실측: 이 계정의 Lambda 14개는 전부 ap-northeast-2 에 있다. */
const LAMBDA_REGION = 'ap-northeast-2';

/* 우리가 쓸 만한 기상청 API.
   ⚠️ 전부 **엔드포인트를 직접 호출해 존재를 확인**했다 (401/500 = 있음, 키 필요).
      목록 페이지가 자바스크립트로 그려져 긁을 수 없어서, 화면을 믿지 않고 직접 쳤다.
   want: 우리가 실제로 쓸 계획이 있는가 — 없는 것까지 신청하면 관리만 늘어난다. */
/* 어디서 받나 — 기상청은 창구가 **두 개**다.
 *
 *   포털  data.go.kr        서비스마다 따로 신청, 각각 별도 키, **2년 만료**
 *   허브  apihub.kma.go.kr  기상청이 직접 운영. **키 하나로 여러 자료**를 쓴다.
 *
 * ⚠️ 허브를 기본으로 쓴다. 실측으로 확인한 것:
 *    ① 엔드포인트 9개가 전부 살아 있다 (401 "유효한 인증키가 아닙니다" = 존재).
 *    ② 응답이 JSON 으로 오고 오류 메시지가 한국어로 분명하다.
 *       포털은 같은 상황에서 HTTP 500 "Unexpected errors" 만 준다 — 뭐가 틀렸는지 모른다.
 *    ③ 키가 하나라 만료 관리가 하나로 끝난다. 포털은 서비스 수만큼 늘어난다.
 *
 * ⚠️ 그래도 포털 쪽을 지운 건 아니다. 허브에 없는 자료(위성영상 등)는 포털로 간다.
 */
export const HUB = 'https://apihub.kma.go.kr';

export const KMA_APIS = [
  // ── 기상청 API허브 (키 하나로 전부) ──────────────────────────
  { id: 'hub_sfc', want: 1, hub: 1,
    ko: '지상 관측자료 (종관·방재 통합)', en: 'Surface observations',
    why: { ko: '전국 지상관측 실황. 지금 한국 관측소는 공항 8곳뿐이다.',
           en: 'Nationwide surface observations. We currently have only 8 airport stations in Korea.' },
    ep: 'api/typ01/url/kma_sfctm3.php',
    lambda: 'kma-aws', env: 'KMA_HUB_KEY', ready: 1 },

  { id: 'hub_stn', want: 1, hub: 1,
    ko: '관측지점 정보', en: 'Station metadata',
    why: { ko: '관측소 위경도. ⚠️ 관측값에는 지점번호만 있고 좌표가 없다 — 이게 없으면 지도에 못 올린다.',
           en: 'Station coordinates. ⚠️ Observations carry only station numbers; without this they cannot be mapped.' },
    ep: 'api/typ01/url/stn_inf.php',
    lambda: 'kma-aws', env: 'KMA_HUB_KEY', ready: 1 },

  { id: 'hub_warn', want: 1, hub: 1,
    ko: '특보', en: 'Weather warnings',
    why: { ko: '호우·폭염·한파 특보. 지금 한국 경보는 미국 NWS 것만 받고 있어 한국 특보가 없다.',
           en: 'Heavy rain, heat and cold warnings. Our alerts come from the US NWS only.' },
    ep: 'api/typ01/url/wrn_now_data.php',
    lambda: 'kma-warn', env: 'KMA_HUB_KEY', ready: 1 },

  { id: 'hub_typ', want: 1, hub: 1,
    ko: '태풍정보', en: 'Typhoon information',
    why: { ko: '기상청 태풍 진로. GDACS 는 지위를 잃으면 끊기는데 기상청은 더 오래 추적한다.',
           en: 'KMA typhoon tracks — GDACS drops storms that lose tropical status.' },
    ep: 'api/typ01/url/typ_now.php',
    lambda: 'kma-typhoon', env: 'KMA_HUB_KEY' },

  { id: 'hub_pm10', want: 1, hub: 1,
    ko: '황사 (PM10)', en: 'Asian dust (PM10)',
    why: { ko: '지금 먼지 레이어는 "먼지 질량"이라 어디서 왔는지 모른다. 이건 황사로 판정된 자료다.',
           en: 'Our dust layer is a mass concentration with no origin; this is identified Asian dust.' },
    ep: 'api/typ01/url/kma_pm10.php',
    lambda: 'kma-asan', env: 'KMA_HUB_KEY' },

  { id: 'hub_buoy', want: 1, hub: 1,
    ko: '해양 부이', en: 'Marine buoys',
    why: { ko: '한국 연안 부이. 지금도 NDBC·OSMC 로 일부 들어온다.',
           en: 'Korean coastal buoys; some already arrive via NDBC/OSMC.' },
    ep: 'api/typ01/url/kma_buoy2.php',
    lambda: 'kma-ocean', env: 'KMA_HUB_KEY', ready: 1 },

  { id: 'hub_aws', want: 1, hub: 1,
    ko: 'AWS 매분자료', en: 'AWS per-minute',
    why: { ko: '736개 관측소의 분 단위 실황. 지도와 기상청 라이브에서 사용 중이다.',
           en: 'Minute observations from 736 stations, now used on the map and in KMA Live.' },
    ep: 'api/typ01/cgi-bin/url/nph-aws2_min',
    lambda: 'kma-aws-min', env: 'KMA_HUB_KEY', ready: 1 },

  // ── 공공데이터포털 (허브에 없는 것) ──────────────────────────
  { id: 'satlit', want: 1, pk: 15058167,
    ko: '위성영상 (천리안)', en: 'Satellite imagery',
    why: { ko: '한국을 가장 촘촘히 보는 위성. NASA·RealEarth 어디에도 없어서 이 경로가 유일하다. ⚠️ 원본인지 가공물인지는 신청 화면에서 확인 필요.',
           en: 'The satellite that watches Korea most closely — not on NASA GIBS or RealEarth. ⚠️ Whether this is raw or derived needs checking on the page.' },
    lambda: 'kma-satellite', env: 'KMA_KEY' },

  { id: 'radar', want: 1, hub: 1,
    ko: '레이더영상', en: 'Weather radar',
    why: { ko: '비가 지금 어디에 내리는지. 위성 구름으로는 비를 알 수 없다.',
           en: 'Where rain is falling right now — satellite cloud alone cannot tell you.' },
    ep: 'api/typ03/cgi/rdr/nph-rdr_cmp1_img',
    lambda: 'kma-radar', env: 'KMA_HUB_KEY', ready: 1 },

  { id: 'asos', want: 0, pk: 15059093,
    ko: '지상(종관 ASOS) 일자료', en: 'ASOS daily',
    why: { ko: '허브의 지상 관측자료로 대체 가능하다. 허브 키가 되면 안 받아도 된다.',
           en: 'Covered by the hub\u2019s surface observations; unnecessary once the hub key works.' },
    lambda: 'kma-asos', env: 'KMA_KEY' },

  { id: 'uv', want: 1, hub: 1,
    ko: '생활기상지수 (자외선)', en: 'Life weather index (UV)',
    why: { ko: '한국 기준 자외선·대기확산·꽃가루 지수를 기상청 라이브에서 사용 중이다.',
           en: 'Korean UV, air-dispersion and pollen indices are now used in KMA Live.' },
    ep: 'api/typ02/openApi/LivingWthrIdxServiceV4',
    lambda: 'kma-life', env: 'KMA_HUB_KEY', ready: 1 },
];

/* 공공데이터포털은 활용신청이 **2년**이면 만료된다 (받은 정보).
   ⚠️ 만료되면 조용히 끊긴다 — 에러가 아니라 그냥 자료가 안 들어온다.
      그래서 날짜를 우리가 적어 두고 미리 알린다. */
const TERM_DAYS = 730;
const WARN_DAYS = 60;

function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { return {}; }
}
function save(v) { localStorage.setItem(LS, JSON.stringify(v)); }

function daysLeft(appliedISO) {
  if (!appliedISO) return null;
  const t = Date.parse(appliedISO);
  if (!Number.isFinite(t)) return null;
  return Math.round((t + TERM_DAYS * 86400000 - Date.now()) / 86400000);
}

export const apiKeysPanel = {
  root: null,

  init() {
    this.root = document.getElementById('apiSheet');
    if (!this.root) return this;
    this.root.querySelector('.api-close')?.addEventListener('click', () => this.close());
    i18n.onChange(() => { if (this.root.classList.contains('up')) this.render(); });
    return this;
  },

  open() { this.root?.classList.add('up'); this.render(); },
  close() { this.root?.classList.remove('up'); },

  render() {
    const ko = i18n.lang === 'ko';
    const body = this.root?.querySelector('.api-body');
    if (!body) return;
    body.innerHTML = '';
    const st = load();

    body.appendChild(el('p', 'api-intro', ko
      ? '공공데이터포털 활용신청은 <b>2년</b>이면 만료됩니다. 만료되면 오류가 아니라 <b>조용히 자료가 끊깁니다</b> — 그래서 신청일을 적어 두고 미리 알립니다.'
      : 'data.go.kr approvals expire after <b>two years</b>. When they do, the feed does not error — it just <b>stops quietly</b>. So we record the application date and warn ahead of time.'));

    /* ⚠️ 자동 신청을 안 만든 이유를 화면에도 적는다.
       "왜 자동이 아니지?"를 나중에 다시 묻게 하면 안 된다. */
    body.appendChild(el('p', 'api-warn', ko
      ? '⚠️ 자동 신청은 만들지 않았습니다. 로그인한 상태로 정부 사이트에 신청서를 대신 제출하는 일이고, 그 페이지는 자바스크립트로 그려져 조금만 바뀌어도 <b>엉뚱한 것을 신청하거나 조용히 실패</b>합니다. "신청됐겠지" 하고 믿다가 키가 끊기는 게 가장 나쁩니다. 대신 항목마다 <b>신청 페이지로 바로 가는 버튼</b>을 뒀습니다 — 누르고 로그인해서 신청 버튼만 누르시면 됩니다.'
      : '⚠️ Automatic application is deliberately not built. It would mean submitting a form to a government site on your behalf while logged in, on a page rendered by JavaScript that could change and silently apply for the wrong thing. Believing an application went through and then losing the key is the worst outcome. Instead each item has a <b>direct link to its application page</b>.'));

    const want = KMA_APIS.filter(a => a.want);
    const later = KMA_APIS.filter(a => !a.want);

    const section = (title, list) => {
      body.appendChild(el('div', 'api-h', title));
      list.forEach(a => body.appendChild(this._row(a, st, ko)));
    };
    body.appendChild(el('p', 'api-intro', ko
      ? '기상청은 창구가 <b>두 개</b>입니다. <b>API허브</b>(apihub.kma.go.kr)는 기상청이 직접 운영하고 <b>키 하나로 여러 자료</b>를 씁니다. <b>공공데이터포털</b>은 서비스마다 따로 신청하고 키도 따로입니다.<br>→ <b>허브를 먼저 신청</b>하시고, 허브에 없는 것(위성·레이더)만 포털로 하시면 됩니다.'
      : 'The KMA has <b>two</b> gateways. The <b>API Hub</b> (apihub.kma.go.kr) is run by the KMA itself and gives <b>one key for many datasets</b>. <b>data.go.kr</b> requires a separate application and key per service.<br>→ Apply on the Hub first; use the portal only for what the Hub lacks (satellite, radar).'));

    section(ko ? '지금 필요한 것' : 'Needed now', want);
    section(ko ? '나중에' : 'Later', later);

    body.appendChild(el('p', 'api-note', ko
      ? '⚠️ 키는 여기에 저장되지 않습니다. 키는 서버(Lambda) 환경변수에만 두고, 이 화면은 "되는가"만 확인합니다. 브라우저에 키를 두면 누구나 읽어서 할당량을 씁니다.\n⚠️ 신청일은 이 기기에만 저장됩니다(서버로 보내지 않습니다).'
      : '⚠️ No key is stored here. Keys live only in Lambda environment variables; this screen only checks whether they work. A key in the browser can be read by anyone.\n⚠️ Application dates are stored on this device only.'));
  },

  _row(a, st, ko) {
    const rec = st[a.id] || {};
    const left = daysLeft(rec.applied);
    const row = el('div', 'api-row');

    let badge, cls;
    if (!rec.applied) { badge = ko ? '미신청' : 'not applied'; cls = 'none'; }
    else if (left == null) { badge = ko ? '날짜 오류' : 'bad date'; cls = 'none'; }
    else if (left < 0) { badge = ko ? `만료됨 (${-left}일 지남)` : `expired ${-left}d ago`; cls = 'bad'; }
    else if (left <= WARN_DAYS) { badge = ko ? `${left}일 남음` : `${left}d left`; cls = 'warn'; }
    else { badge = ko ? `${left}일 남음` : `${left}d left`; cls = 'ok'; }

    row.innerHTML =
      `<div class="api-top">
         <b>${esc(ko ? a.ko : a.en)}</b>
         <span class="api-badge ${cls}">${esc(badge)}</span>
       </div>
       <p class="api-why">${esc(ko ? a.why.ko : a.why.en)}</p>
       ${a.hub
          ? `<p class="api-pk">${ko ? 'API허브' : 'API Hub'} · <span>${esc(a.ep)}</span></p>`
          : (a.pk ? `<p class="api-pk">${ko ? '포털 자료번호' : 'data.go.kr'} ${a.pk} · <span>기상청_${esc(a.ko)}</span></p>` : '')}`;

    const acts = el('div', 'api-acts');

    /* 신청 페이지로.
       ⚠️ pk 는 **실제로 페이지를 열어 제목을 확인한 것**이다. 검색 결과로 보내면
          비슷한 이름이 여러 개라 엉뚱한 걸 신청하게 된다 — 실제로 그럴 뻔했다:
          15084084 는 "단기예보"인데 본문에 "대표 AWS 관측값"이 들어 있어 AWS 로 오인된다. */
    const go = el('a', 'api-btn', a.hub
      ? (ko ? 'API허브에서 신청' : 'Apply on API Hub')
      : (ko ? '포털에서 신청' : 'Apply on data.go.kr'));
    go.href = a.hub
      ? `${HUB}/`
      : (a.pk
        ? `https://www.data.go.kr/data/${a.pk}/openapi.do`
        : `https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=${encodeURIComponent(a.ko)}&operator=AND`);
    go.target = '_blank'; go.rel = 'noopener noreferrer';
    acts.appendChild(go);

    const mark = el('button', 'api-btn ghost',
      rec.applied ? (ko ? '신청일 수정' : 'Edit date') : (ko ? '오늘 신청함' : 'Applied today'));
    mark.onclick = () => {
      const cur = rec.applied ? rec.applied.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const v = prompt(ko ? '신청일 (YYYY-MM-DD). 비우면 지웁니다.' : 'Application date (YYYY-MM-DD). Empty clears it.', cur);
      if (v === null) return;
      const s = load();
      if (!v.trim()) delete s[a.id];
      else s[a.id] = { ...(s[a.id] || {}), applied: v.trim() };
      save(s);
      this.render();
    };
    acts.appendChild(mark);

    /* 진짜 되는지 확인 — Lambda 가 있는 항목만.
       ⚠️ 신청일보다 이게 정본이다. 날짜는 사람이 적은 것이고, 이건 실제로 물어본 결과다. */
    if (a.lambda) {
      const chk = el('button', 'api-btn ghost', ko ? '지금 되는지 확인' : 'Check now');
      chk.onclick = async () => {
        chk.textContent = ko ? '확인 중…' : 'checking…';
        const r = await this._check(a);
        chk.textContent = r;
      };
      acts.appendChild(chk);
    }

    row.appendChild(acts);
    if (a.lambda) {
      /* ── 키 넣는 법 ─────────────────────────────────────────
         ⚠️ 이 화면에서 키를 받지 않는다. 이유가 둘이다.
         ① **자료를 받는 건 브라우저가 아니라 서버다.** kma-aws Lambda 가 예약 시각에
            혼자 깨어나 기상청에 요청한다. 그때 브라우저는 열려 있지도 않으므로,
            여기 저장한 키는 그 Lambda 가 읽을 방법이 없다. 저장은 되는데 아무 일도 안 난다.
         ② 브라우저→서버로 보내려면 키를 받는 엔드포인트가 필요한데,
            이 계정은 **Lambda Function URL 이 막혀 있다** (실측: 기존 URL 호출 시 403).
            게다가 이 앱은 인증 없는 공개 정적 사이트라, 창구를 열면 아무나 키를 바꿀 수 있다.
         → 그래서 AWS 콘솔로 보낸다. 키가 우리 앱을 거치지 않고 AWS 로 바로 간다. */
      const d = el('details', 'api-how');
      d.appendChild(el('summary', null, ko ? '키 넣는 법 (터미널 없이)' : 'How to set the key (no terminal)'));
      const box = el('div');

      const go = el('a', 'api-btn', ko ? 'AWS 콘솔에서 열기' : 'Open in AWS console');
      go.href = `https://${LAMBDA_REGION}.console.aws.amazon.com/lambda/home`
              + `?region=${LAMBDA_REGION}#/functions/${encodeURIComponent(a.lambda)}?tab=configure`;
      go.target = '_blank'; go.rel = 'noopener noreferrer';
      box.appendChild(go);

      /* ⚠️ 아직 만들지 않은 함수는 콘솔에 없다. "함수를 찾을 수 없음"을 보고
         뭔가 잘못한 줄 알게 하면 안 된다. 미리 말해 준다. */
      if (!a.ready) {
        box.appendChild(el('p', 'api-hint', ko
          ? `⚠️ <code>${esc(a.lambda)}</code> 함수는 아직 만들지 않았습니다. 신청부터 하시고, 키가 나오면 알려 주세요 — 함수를 만든 뒤 넣는 자리를 여기에 띄우겠습니다. (지금 콘솔에서 열면 "함수 없음"이 뜹니다.)`
          : `⚠️ The <code>${esc(a.lambda)}</code> function does not exist yet. Apply first; once you have a key, tell me and I will create it. (Opening the console now shows “function not found”.)`));
      }

      box.appendChild(el('ol', 'api-steps', ko
        ? `<li>위 버튼 → AWS 로그인</li>
           <li>왼쪽 <b>구성(Configuration)</b> → <b>환경 변수</b></li>
           <li><b>편집</b> → <b>환경 변수 추가</b></li>
           <li>키 이름 <code>${esc(a.env)}</code>, 값에 발급받은 인증키를 붙여넣기</li>
           <li><b>저장</b> → 위의 「지금 되는지 확인」으로 확인</li>`
        : `<li>Button above → sign in to AWS</li>
           <li>Left menu <b>Configuration</b> → <b>Environment variables</b></li>
           <li><b>Edit</b> → <b>Add environment variable</b></li>
           <li>Key <code>${esc(a.env)}</code>, Value = the issued service key</li>
           <li><b>Save</b>, then use “Check now” above</li>`));

      box.appendChild(el('p', 'api-hint', ko
        ? `⚠️ 왜 이 화면에서 직접 못 받나: 자료를 받아오는 건 브라우저가 아니라 <b>예약 실행되는 서버(Lambda)</b>입니다. 새벽에 혼자 도는 그 함수는 이 브라우저의 저장소를 읽을 수 없습니다. 브라우저→서버로 보내는 창구도 이 계정은 Lambda Function URL 이 차단돼(403) 만들 수 없고, 인증 없는 공개 사이트라 열어도 아무나 바꿀 수 있습니다.
⚠️ 키를 이 앱이나 대화에 넣지 마세요. AWS 콘솔에 직접 넣으면 우리 쪽을 거치지 않습니다.`
        : `⚠️ Why this screen cannot take the key: the data is fetched by a <b>scheduled server function</b>, not by the browser. That function runs while no browser is open and cannot read this device's storage. A browser-to-server endpoint is not possible either — Lambda Function URLs are blocked on this account (measured: 403) — and this is an unauthenticated public site.
⚠️ Never put the key in this app or in chat. Entering it in the AWS console keeps it away from us entirely.`));

      d.appendChild(box);
      row.appendChild(d);
    }
    return row;
  },

  /** 결과 파일이 최근에 갱신됐는지로 판단한다.
   *  ⚠️ 우리는 키를 볼 수 없다. "자료가 새로 들어오고 있는가"가 우리가 아는 전부다. */
  async _check(a) {
    const ko = i18n.lang === 'ko';
    const { API } = await import('./config.js');
    const map = { aws: `${API.WIND}/kma-aws.json` };
    const url = map[a.id];
    if (!url) return ko ? '확인 경로 없음' : 'no route';
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const age = (Date.now() - Date.parse(j.generated)) / 3600000;
      return age < 3
        ? (ko ? `✅ 작동 중 (${j.count}곳)` : `✅ working (${j.count})`)
        : (ko ? `⚠️ ${age.toFixed(0)}시간 전 자료` : `⚠️ ${age.toFixed(0)}h old`);
    } catch (e) {
      // S3 는 없는 객체에 403 을 준다(404 아님) — 아직 한 번도 안 만들어진 것이다
      return ko ? '❌ 아직 자료 없음 (키 미설정)' : '❌ no data yet (key not set)';
    }
  },
};

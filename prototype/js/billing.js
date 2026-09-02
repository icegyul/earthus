// 구독 — 요금제 정의 + 결제 연결 지점
//
// ⚠️ 이 파일은 결제를 "처리"하지 않는다. 처리하면 안 된다.
//    카드번호·계좌번호를 우리 화면에서 받는 순간 PCI-DSS 대상이 되고,
//    앱스토어 규정도 위반한다. 결제는 반드시 아래 셋 중 하나로 넘긴다:
//
//      iOS 앱   → Apple In-App Purchase   (App Store 규정 3.1.1 — 디지털 구독은 IAP 필수)
//      안드로이드 → Google Play Billing     (Play 결제 정책 동일)
//      웹        → PG 사의 결제창으로 리다이렉트 (토스페이먼츠 / 아임포트 / Stripe)
//                  우리 페이지에서 카드 정보를 받지 않는다.
//
//    지금은 PG 계약이 없다. 없는 걸 있는 척하지 않는다 —
//    "결제 준비 중"을 분명히 알리고 사전등록으로 안내한다.
//    계약이 끝나면 PROVIDERS 에 어댑터 하나만 채우면 된다.

import { auth } from './auth.js';
import { CONFIG } from './config.local.js';
import { i18n } from './i18n.js';
import { salesAllowed, TIER } from './access-mode.js';

/* ── 요금제 ────────────────────────────────────────────────────
   ⚠️ 가격은 config.local.js 에서 덮어쓸 수 있게 둔다.
      PG·앱스토어에 등록한 실제 상품 가격과 어긋나면 안 되기 때문이다. */
const DEFAULT_PLANS = {
  /* ⚠️ list 는 **실제로 받은 적 있는 정가**가 생겼을 때만 줄 그어 보여주는 값이다.
     2026-08-05 결정: Personal Pro 정가는 월 ₩5,900/$4.99 · 연 ₩49,000/$39.
     가짜 할인율이 생기지 않도록 지금은 실제 청구가와 같은 값으로 둔다.
     정본은 서버(plans 표)이고 여기 값은 화면 표시용이다. */
  /* ⚠️ 2026-09-02 — v5.3 §1.4 의 3단계로 바꾸면서, 기존 Personal Pro 는
     **EXPLORER 로 그대로 승계**한다. plan id 를 바꾸지 않는다 — 서버 plans 표와
     이미 결제된 주문이 이 id 를 가리키고 있어서, 바꾸면 과거 주문이 상품을 잃는다. */
  /* ⚠️⚠️ 2026-09-02 가격 결정 — EXPLORER ₩9,900 / INTELLIGENCE ₩49,000. **둘 다 월 요금.**
     ⚠️ ₩49,000 이 인텔리전스 요금이라는 것은 2026-09-02 확인받았다. 추정이 아니다.
     ⚠️ 여기 ₩49,000 은 예전의 'EXPLORER 연 요금'과 **숫자만 같고 뜻이 다르다.**
        예전: earthus.pro.yearly = 연 ₩49,000 / 지금: INTELLIGENCE 월 ₩49,000.
        서버 plans 표를 고칠 때 이 둘을 헷갈리면 곧바로 청구 사고다.
     ⚠️ 연 요금 = **10개월치(2개월분 할인, 17%)** — 2026-09-02 결정.
        ₩9,900×10 = ₩99,000 / ₩49,000×10 = ₩490,000.
        ⚠️ 이 비율을 함부로 키우지 말 것. pricing-plan.md 에 기록된 창립회원 실패가
           **연간이 월간보다 8배 싸서 아무도 월간을 안 산 것**이었다. 17%는 그 반대편의
           건전한 값이고, 월간을 죽이지 않으면서 연간을 고를 이유는 준다. */
  monthly:  { id: 'earthus.pro.monthly',  tier: TIER.EXPLORER, krw: 9900,  usd: null, listKrw: 9900,  listUsd: null, period: 'month' },
  yearly:   { id: 'earthus.pro.yearly',   tier: TIER.EXPLORER, krw: 99000, usd: null, listKrw: 99000, listUsd: null, period: 'year' },
  /* ⚠️⚠️ INTELLIGENCE ₩49,000 → ₩29,000 (2026-09-02 원가·수익 재검토).
     ₩49,000 을 지탱하던 유일한 근거가 **API 쿼터**였는데, 상업용 API 가 별도 요금제
     (COMMERCIAL_PLAN · 문의)로 빠지면서 그 근거가 이 등급에서 사라졌다.
     지침서 §27.3 은 이 등급을 **개인**에게 판다 — 월 ₩49,000(연 ₩58.8만)은 개인 취미
     지출의 상한을 넘는다. ₩29,000 은 EXPLORER 의 약 3배로, 개인이 "더 깊이"에 낼 수 있는 배수다.
     ⚠️ 그 이상을 낼 수 있는 곳(법인·기관)은 COMMERCIAL_PLAN 으로 이미 갈라놨다.
     ⚠️ 원가로는 ₩9,900 이든 ₩49,000 이든 차이가 없다 — 사용자당 변동비가 월 ₩16~190 이라
        마진이 어느 쪽이든 98% 를 넘는다. 그래서 이 가격은 원가가 아니라 **지불 의사**로 정했다. */
  intelMonthly: { id: 'earthus.intelligence.monthly', tier: TIER.INTELLIGENCE, krw: 29000,  usd: null, listKrw: 29000,  listUsd: null, period: 'month' },
  intelYearly:  { id: 'earthus.intelligence.yearly',  tier: TIER.INTELLIGENCE, krw: 290000, usd: null, listKrw: 290000, listUsd: null, period: 'year' },
  /* ⚠️ 창립회원 요금제는 없앴다 (받은 결정) — ui-subscribe.js 머리말 참고.
     당시 월 ₩12,000 대비 연 ₩19,000이 월 환산 8배 싸서 아무도 월간을 안 사고,
     초기 자금도 950만원에서 멈춘다는 판단이었다. 가격이 바뀌어도 이 상품은 되살리지 않는다.
     '초기에 결제해 주시면' 문구가 같은 일을 더 정직하게 한다. */
};

/* ⚠️⚠️ 여기 값은 **화면 표시용**이다. 결제 금액의 정본은 서버(plans 테이블)다.
      브라우저에서 이 숫자를 고쳐도 결제 금액은 바뀌지 않는다 —
      checkout 함수가 planId 만 받고 금액은 DB 에서 찾기 때문이다. */
export const PLANS = { ...DEFAULT_PLANS, ...(CONFIG.PLANS || {}) };

/* 구독하면 열리는 것.
   ⚠️ 레이어를 넣지 않는다. 전부 무료다 (config.js 의 티어 판단 참고).
      여기 들어갈 자격은 "분석 보고서·차트·시뮬레이션인가" 또는
      "돈이 실제로 나가는가(장기 저장·개인별 전송)" 둘 중 하나다. */
/* ⚠️⚠️ **아직 동작하지 않는 것에 soon:true 를 붙인다.**
   예전 이 목록은 "지진 알림"을 팔고 있었는데 **웹푸시 서버가 없어서 알림이 안 갔다.**
   돈을 받고 못 주는 것보다 나쁜 건 없다. 화면은 soon 인 항목을 "준비 중"으로 표시하고,
   준비 중인 것만 남으면 결제 버튼 자체를 내린다.

   경계를 가르는 기준 — **"요약이냐 상세냐"가 아니다.**
   출처·표본수(n)·기준·한계는 **전부 무료**다. 그게 이 앱의 신뢰이고,
   그걸 가리면 무료 사용자에게는 근거 없는 단정만 남는다.
   ⚠️⚠️ 2026-09-02 기준 교체 — 경계를 **산출물 형태**로 다시 그었다.
   예전 기준(①시간 ②나 ③양)은 "우리가 계산한 숫자"를 전부 유료 쪽으로 끌어당겼다.
   그러면 안전 판단·예보 신뢰도·평년 대비 서술까지 유료가 되는데, 그건 다른 서비스도
   그냥 보여주는 것들이라 가둘 이유가 없다. 무료 화면이 얇아지면 유료가 인질이 된다.

   유료가 되는 것은 셋뿐이다:
     ① 분석 보고서 — 결과를 정리해 남기는 문서
     ② 차트        — 계산한 통계를 그래프로 보는 것
     ③ 시뮬레이션  — 값을 바꿔가며 돌려보는 것
   여기에 원가 예외 하나만 더한다:
     ④ 원가        — 장기 저장·개인별 전송처럼 돈이 실제로 나가는 것

   ⚠️ 공공데이터를 받아 보여주는 1차 가공은 전부 무료다.
      표현을 바꾸는 것(등치선·바람 파티클·3D 지형·구름 셸)도 **값을 바꾸지 않으므로**
      1차 가공이다. 값이 아니라 그림이 바뀐 것뿐이다.
   ⚠️ 안전은 어떤 경우에도 유료가 아니다. 우리가 계산한 판단이어도 무료다. */
/* ── EXPLORER — UNDERSTAND WHAT IS HAPPENING ──────────────────
   ⚠️⚠️ 이 목록은 **개발지침서 v5.3 §27.2 를 그대로 옮긴 것**이다. 여기서 지어내지 않는다.
      항목을 더하거나 빼려면 지침서를 먼저 고친다.
   핵심 사용자(§27 표): 지구·기상·해양·재난·지도·다이빙·과학 덕후, 헤비유저.
   ⚠️ "직업"이 아니라 **깊이**로 가른다 — 지침서가 명시한 기준이다.
   ⚠️ soon:true 는 아직 1.0에 없는 것이다. §41.2 launch gate 가 닫히기 전에는
      정식 월구독 판매를 열지 않는다 — 그래서 지금 SALES_OPEN=false 인 것이 맞다. */
export const EXPLORER_FEATURES = [
  { ko: '유사 사건 — 지금과 닮았던 과거를 찾아 그 뒤 무슨 일이 있었는지 센다',
    en: 'Analog events — find past moments like now, and count what followed' },
  { ko: '사후 리뷰 — 예보와 실제 결과를 맞대본 종료 보고',
    en: 'Postmortem — forecast against what actually happened' },
  { ko: '사건 추적 · 알림 — 관심 지점 20곳까지, 의미 있는 정정이 나오면 알린다 (무료는 1곳)',
    en: 'Follow & watch — up to 20 places, alerted on meaningful revisions (free covers one)' },
  { ko: '데일리 인텔리전스 피드 — 오늘 지구에서 볼 것을 매일',
    en: 'Daily Earth intelligence feed', soon: true },
  { ko: '이벤트 룸 전체 — NOW · WHY · NEXT · PAST · COMPARE · FOR ME · EVIDENCE',
    en: 'Full Event Room — NOW / WHY / NEXT / PAST / COMPARE / FOR ME / EVIDENCE', soon: true },
  { ko: '이벤트 리플레이 — 그때의 지구를 3D로 다시 세운다',
    en: 'Event replay — 3D historical reconstruction', soon: true },
  { ko: 'MY EARTH — 저장한 장소·따라가는 사건·컬렉션·여행·다이빙·브리핑',
    en: 'MY EARTH — saved places, followed events, collections, trips, dives, brief', soon: true },
  { ko: '전문 렌즈 — 기상·해양·지질·기후를 자료 깊이가 허용하는 만큼',
    en: 'Expert weather / ocean / geo / climate lenses where data depth allows', soon: true },
  { ko: '심해 · 해구 · 다이빙 — 개인 기록까지',
    en: 'Deep ocean, trench and dive experience with a personal log', soon: true },
  { ko: '사건 중심 과거 아카이브 · 되감기',
    en: 'Event-centered historical archive and rewind', soon: true },
  { ko: '데일리 브리프 · 위클리 딥다이브',
    en: 'Daily Brief and Weekly Deep Dive', soon: true },
];

/* ── INTELLIGENCE — INVESTIGATE WHAT IS HAPPENING ────────────────
   ⚠️⚠️ 개발지침서 v5.3 §27.3 을 그대로 옮긴 것이다. **EXPLORER 전체를 포함한다.**
   핵심 사용자(§27 표): 최상위 덕후, 분석가, 언론·콘텐츠, 교수·학생·전문가·기관 개인.
   ⚠️ 지침서가 못박은 판매 기준: "연구자라는 **신분**이 아니라 **깊게 파고들고 싶은 사용자**에게 판다."
      그래서 자격 심사도, 기관 인증도 없다.
   ⚠️ 팀·대학·기관은 이 등급이 아니라 향후 TEAM/INSTITUTION ADD-ON 으로 처리한다(§27).
   ⚠️ 지금 전부 soon 이다. 사실이고, 그래서 아직 팔지 않는다 —
      화면은 준비 중인 항목만 남으면 결제 버튼 자체를 내린다. §41.3 gate 참고. */
export const INTELLIGENCE_FEATURES = [
  { ko: 'EXPLORER 전체', en: 'Everything in EXPLORER' },
  { ko: '근거 그래프 — 이 값이 어디서 왔는지 끝까지 따라간다',
    en: 'Full Evidence Graph — trace every value to its source', soon: true },
  { ko: '모델 · 회차 비교 — 같은 시각을 여러 자료·여러 발표로 나란히',
    en: 'Full model / revision compare', soon: true },
  { ko: '장기 아카이브 — 지원되는 분야의 깊은 과거',
    en: 'Deep historical archive for supported verticals', soon: true },
  { ko: '구역 · 기간 직접 지정',
    en: 'Custom region and time window', soon: true },
  { ko: '유사사례 라이브러리 · 이벤트 게놈',
    en: 'Analog library and Event Genome', soon: true },
  { ko: '시나리오 랩 · 반사실 분기 — 값을 바꿔가며 돌려본다',
    en: 'Scenario Lab and counterfactual branches', soon: true },
  { ko: '고급 3D 시뮬레이션 — 검증된 solver 가 있는 분야만',
    en: 'Advanced 3D simulation where a validated solver exists', soon: true },
  { ko: '맞춤 인텔리전스 브리프 · 전문가용 사건 리포트',
    en: 'Custom intelligence brief and professional event report', soon: true },
  /* ⚠️⚠️ 내보내기는 **개인 이용 범위**다. 상업적 재배포·API 는 이 등급에 없다 —
     COMMERCIAL_PLAN(아래) 으로 뺐다. 지침서 §27 도 팀·기관을 소비자 등급에서
     빼고 ADD-ON 으로 돌려놨다. 개인 구독으로 상업 이용을 열면 원자료 라이선스를
     우리가 어기게 된다 (에코뱅크처럼 제3자 권리가 섞인 자료가 실제로 있다). */
  { ko: '내보내기 — PDF · CSV · 허용된 파생물 (개인 이용 범위)',
    en: 'Export — PDF, CSV and allowed derived data, for personal use', soon: true },
  { ko: '우선 연산 · 더 큰 계산 한도',
    en: 'Priority compute and a larger quota', soon: true },
];

/* ── 상업용 · API — **금액을 정하지 않고 문의로 받는다** (2026-09-02 결정) ────
   ⚠️⚠️ 이건 소비자 등급이 아니다. PLANS 에 넣지 않는 이유가 그것이다 —
      PLANS 에 들어가면 결제 화면이 "살 수 있는 것"으로 렌더하고 결제 버튼을 붙인다.
   ⚠️ 금액을 여기 적지 않는다. 상업 이용은 **원자료 라이선스가 건마다 다르다.**
      정찰가를 붙이는 순간, 우리가 재배포 권리를 못 받은 자료까지 팔겠다고 약속하게 된다.
      (실제 사례: 에코뱅크 원자료 1,085,606건은 제1유형이지만 제3자 권리가 섞여 있어
       서면 확인 전까지 유료·내보내기를 보류해 두었다 — MONETIZATION-PRIORITY §1)
   ⚠️ 지침서 §27 의 TEAM/INSTITUTION ADD-ON 자리가 여기다. */
export const COMMERCIAL_PLAN = {
  ko: '상업용 · API · 기관', en: 'Commercial, API and institutions',
  forKo: '서비스·제품에 넣거나, 팀·기관이 함께 쓰거나, 프로그램으로 받아가는 경우',
  forEn: 'Embedding in a product, team or institutional use, or programmatic access',
  items: [
    { ko: 'API 접근 — 원자료 권리가 허용하는 범위에서', en: 'API access where source rights allow' },
    { ko: '상업적 재배포 · 재가공 허용 범위 협의', en: 'Commercial redistribution and derivation, scoped by agreement' },
    { ko: '팀 · 기관 좌석과 권한', en: 'Team and institution seats and roles' },
    { ko: '전용 쿼터 · SLA', en: 'Dedicated quota and SLA' },
  ],
  /* ⚠️ price 가 아니라 contact 다. 화면은 금액 자리에 '문의'를 적고 결제 버튼을 만들지 않는다. */
  contact: true,
};

/* ⚠️ 하위호환 — 등급을 나누기 전 코드가 이 이름을 쓴다. 두 등급을 합쳐 둔다.
   새로 쓰는 화면은 EXPLORER_FEATURES / INTELLIGENCE_FEATURES 를 따로 쓴다. */
export const PAID_FEATURES = [...EXPLORER_FEATURES, ...INTELLIGENCE_FEATURES];

/* 무료로 유지되는 것 — 유료 안내에서 이것도 같이 보여준다.
   ⚠️ "뭘 빼앗기는지"가 아니라 "뭐가 그대로인지"를 알아야 판단이 된다.
      그리고 이 목록이 짧으면 유료가 인질처럼 보인다. 실제로 무료가 더 길다. */
export const FREE_FEATURES = [
  { ko: '모든 레이어 — 구름·기온·바람·태풍·지진·산불·쓰나미·화산·낙뢰·위성·발사·오로라·부이',
    en: 'Every layer — clouds, temp, wind, cyclones, quakes, wildfires, tsunami, volcanoes, lightning, satellites, launches, aurora, buoys' },
  /* ⚠️⚠️ **안전 정보는 영원히 무료다.** 이건 요금제 문제가 아니라 원칙이다.
     특보·지진·쓰나미·이안류 위험·낙뢰 위치를 결제 뒤에 두면 사람이 다칠 수 있다.
     이 줄을 지우자는 제안이 나오면 그때도 지우지 않는다. */
  { ko: ' 안전 정보는 언제나 무료 — 특보·지진·쓰나미·이안류 위험·낙뢰',
    en: ' Safety information is always free — warnings, quakes, tsunami, rip currents, lightning' },
  { ko: ' 이안류·지진 안전 알림도 무료 — 한 곳까지 알려드립니다',
    en: ' Rip-current and earthquake safety alerts are free too — for one saved place' },
  { ko: '출처 · 관측 지점 수 · 판단 기준 · 한계 — 전부 공개',
    en: 'Sources, sample sizes, thresholds and limits — all shown' },
  { ko: '이벤트 뉴스 교차검증 — 신뢰도 점수와 근거까지',
    en: 'Cross-verified event news, with scores and reasoning' },
  { ko: '일본 지진 기상청 대조 — 진앙 차이까지 공개',
    en: 'JMA cross-check for Japanese quakes, epicenter differences shown' },
  /* ⚠️ 아래 둘은 **우리가 계산한 값이지만 무료**다 (2026-09-02 결정).
     평년 대비 위치와 예보 신뢰도는 다른 서비스도 그냥 보여주는 것이라 가둘 이유가 없고,
     가두면 무료 사용자에게는 근거 없는 단정만 남는다. 유료는 보고서·차트·시뮬레이션이다. */
  { ko: '날씨 서술 — 평년 대비 위치와 원인까지 문장으로',
    en: 'Weather narrative — where today sits against normal, and why' },
  { ko: '예보 신뢰도 — 이 예보를 얼마나 믿을 수 있는지와 그 이유',
    en: 'Forecast confidence — how far to trust this forecast, and why' },
  { ko: '3D 자연현상 학습 · 일식 · 유성우',
    en: '3D phenomena lessons, eclipses, meteor showers' },
  /* ⚠️ 위성 3종은 2026-09-02에 유료에서 여기로 옮겼다.
     Celestrak 카탈로그는 공개, SGP4 궤도선과 통과 예보는 Heavens-Above 등이 이미 무료로 준다.
     **우리만 만드는 것이 아니면 가두지 않는다.** 게이트도 함께 제거했다(config.js PAID_CAP).
     ⚠️ 표시 수 제한은 요금이 아니라 기기 성능 때문이고, 잘리면 화면에 밝힌다. */
  { ko: '스타링크 · 전체 위성 카탈로그 — 표시 수는 기기 성능에 따라 제한',
    en: 'Starlink & full satellite catalogue — display count depends on device performance' },
  { ko: '선택한 위성의 궤도 추적선 · 내 위치 통과 예보',
    en: 'Orbit track for a selected satellite · passes over my location' },
  { ko: '내 항공편 추적 · 항공권 검색',
    en: 'Track my flight, flight search' },
];

/* 왜 이렇게 갈랐는지 사용자에게도 밝힌다.
   ⚠️ "유료가 더 좋다"가 아니라 "무료로 줄 수 있는 건 다 준다"가 우리 입장이다. */
/* 등급 이름 — 등급 체계의 정본은 v5.3 §1.4 다.
   ⚠️ 표기에서 **PRO 를 뗐다** (2026-09-02 결정). 정본 문서의 표기는
      EXPLORER PRO / INTELLIGENCE PRO 이지만 화면에서는 길어서 읽히지 않는다.
      등급 자체는 그대로고 이름만 짧게 부른다 — 문서와 대조할 때 헷갈리지 말 것.
   ⚠️ 브랜드명(earthus / earthus Intelligence)과 어떻게 겹칠지는 아직 미정이다.
      정해지면 이 표만 고치면 화면 전체가 따라온다. */
/* ⚠️ subKo/forKo 는 개발지침서 v5.3 §27 의 "Product promise"·"핵심 사용자" 열이다.
   ⚠️ 대상을 **직업으로 가르지 않는다** — 지침서가 못박은 기준은 깊이다:
      "Intelligence Pro 는 연구자라는 신분이 아니라 깊게 파고들고 싶은 사용자에게 판매한다."
      그래서 화면에도 "전문가 전용"이라고 쓰지 않는다. */
export const TIER_NAMES = {
  [TIER.FREE]: { ko: 'FREE', en: 'FREE',
    subKo: '무엇이 일어나는지 본다', subEn: 'See what is happening',
    forKo: '모든 사용자', forEn: 'Everyone' },
  [TIER.EXPLORER]: { ko: 'EXPLORER', en: 'EXPLORER',
    subKo: '무엇이 일어나는지 이해한다', subEn: 'Understand what is happening',
    forKo: '지구·기상·해양·재난·지도·다이빙·과학을 파고드는 사람',
    forEn: 'Earth, weather, ocean, hazard, map, dive and science enthusiasts' },
  [TIER.INTELLIGENCE]: { ko: 'INTELLIGENCE', en: 'INTELLIGENCE',
    subKo: '무엇이 일어나는지 조사한다', subEn: 'Investigate what is happening',
    forKo: '더 깊이 파는 사람 — 분석·언론·콘텐츠·교육·전문 영역',
    forEn: 'Those who dig deeper — analysis, press, content, teaching, professional work' },
};

export const TIER_RATIONALE = {
  ko: 'FREE · 지금 지구에서 보이는 것 전부 — 공공자료 · 출처 · 기준시각 · 안전 · 서술 · 신뢰도\nEXPLORER · 왜 그런가 — 유사사례 · 사후 리뷰 · 이력 · 되감기 · MY EARTH · 20곳 감시\nINTELLIGENCE · 파고든다 — 근거 그래프 · 모델 비교 · 시나리오 · 리포트 · 내보내기 · API',
  en: 'FREE · everything visible on Earth right now — public data, sources, timestamps, safety, narrative, confidence\nEXPLORER · why it happened — analogs, postmortem, history, rewind, MY EARTH, 20 places\nINTELLIGENCE · dig deeper — evidence graph, model compare, scenario, reports, export, API',
};

/* ── 결제 제공자 어댑터 ────────────────────────────────────────
   available() 가 true 인 것 중 플랫폼에 맞는 것을 고른다.
   계약이 끝나면 start() 안만 채우면 나머지 화면은 그대로 동작한다. */
const PROVIDERS = {
  apple: {
    ko: 'App Store', en: 'App Store',
    // 웹에서는 IAP 를 쓸 수 없다. 네이티브 래퍼가 이 브리지를 심어준다.
    available: () => typeof window.webkit?.messageHandlers?.iap !== 'undefined',
    start: plan => window.webkit.messageHandlers.iap.postMessage({ productId: plan.id }),
  },
  google: {
    ko: 'Google Play', en: 'Google Play',
    available: () => typeof window.AndroidBilling?.purchase === 'function',
    start: plan => window.AndroidBilling.purchase(plan.id),
  },
  web: {
    ko: '카드 · 간편결제', en: 'Card / wallet',
    /* PG 결제창은 서버가 만든 주문번호로 연다.
       ⚠️ 클라이언트가 금액을 정해 보내면 위변조가 가능하다 —
          그래서 우리가 서버에 보내는 것은 **planId 뿐**이고, 금액은 서버가 정한다.
       CONFIG.CHECKOUT_URL 이 그 서버 엔드포인트(Supabase Edge Function)다. */
    available: () => !!CONFIG.CHECKOUT_URL,
    start: async (plan) => {
      // ⚠️ 로그인 토큰을 반드시 보낸다. 없으면 서버가 누구의 주문인지 모른다.
      const token = await auth.accessToken?.();
      if (!token) throw new Error('NOT_SIGNED_IN');

      const r = await fetch(CONFIG.CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: plan.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 서버가 이유를 준다 — 삼켜서 "실패"로 뭉뚱그리지 않는다.
        throw new Error(j.error || `checkout ${r.status}`);
      }

      await loadToss();
      /* ⚠️⚠️ 이 호출부가 **토스 SDK 버전에 따라 바뀌는 유일한 곳**이다.
         아래는 v1 표준 결제창 형식이다. 가맹점 키를 받으면 그때 문서와 대조하고,
         바뀌었으면 **여기 한 곳만** 고치면 된다 — 나머지(주문·승인·권한)는 그대로다.
         ⚠️ 카드 정보는 토스 화면에서 받는다. 우리 페이지는 절대 받지 않는다. */
      const toss = window.TossPayments(j.clientKey);
      await toss.requestPayment('카드', {
        amount: j.amount,
        orderId: j.orderId,
        orderName: j.orderName,
        customerEmail: j.customerEmail,
        successUrl: j.successUrl,
        failUrl: j.failUrl,
      });
    },
  },
};

/** 토스 결제 SDK 를 필요할 때만 불러온다.
 *  ⚠️ 처음부터 넣으면 결제할 생각이 없는 사람에게도 외부 스크립트가 붙는다.
 *     (개인정보 최소수집 원칙과 첫 화면 속도 둘 다에 걸린다) */
let _tossLoading = null;
function loadToss() {
  if (window.TossPayments) return Promise.resolve();
  if (_tossLoading) return _tossLoading;
  _tossLoading = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v1/payment';
    s.onload = ok;
    // ⚠️ 실패를 조용히 넘기면 버튼이 아무 반응 없는 것처럼 보인다.
    s.onerror = () => { _tossLoading = null; no(new Error('PG_SDK_BLOCKED')); };
    document.head.appendChild(s);
  });
  return _tossLoading;
}

export const billing = {
  /** 지금 이 기기에서 쓸 수 있는 결제 수단. 없으면 빈 배열. */
  providers() {
    return Object.entries(PROVIDERS)
      .filter(([, p]) => { try { return p.available(); } catch { return false; } })
      .map(([k, p]) => ({ key: k, ...p }));
  },

  ready() { return this.providers().length > 0; },

  price(planKey) {
    const p = PLANS[planKey];
    if (!p) return '—';
    const ko = i18n.lang === 'ko';
    /* ⚠️ 가격이 아직 없는 상품(INTELLIGENCE)은 '준비 중'이라고 말한다.
       ⚠️⚠️ null 검사를 Number() 로 하면 안 된다 — **Number(null) 은 NaN 이 아니라 0** 이라
          가드를 그냥 통과하고 다음 줄 toLocaleString 에서 터진다(실측으로 잡았다). */
    const v = ko ? p.krw : p.usd;
    if (v == null || !Number.isFinite(Number(v))) return ko ? '준비 중' : 'Coming soon';
    return ko
      ? `₩${p.krw.toLocaleString()}`
      : `$${p.usd.toFixed(2)}`;
  },

  /** 이 등급의 상품들 — 화면이 등급별로 묶어 보여줄 때 쓴다. */
  plansOf(tier) {
    return Object.entries(PLANS).filter(([, p]) => p.tier === tier);
  },

  /** 연간 구독이 월간 대비 몇 % 싼가 — 현재 표시 통화로 계산한다.
      ⚠️ KRW 로 계산한 할인율을 USD 화면에 쓰면 실제 가격과 다른 숫자가 된다. */
  yearlySavingPct() {
    const m = PLANS.monthly, y = PLANS.yearly;
    if (!m || !y) return 0;
    const key = i18n.lang === 'ko' ? 'krw' : 'usd';
    /* ⚠️⚠️ 값이 없는 상품을 Number() 로 받으면 안 된다 — **Number(null) 은 0** 이라
       "1 - 0/월값 = 100% 절약"이라는 거짓 할인율이 화면에 뜬다(실측으로 잡았다).
       가격이 아직 없거나 판매 전(soon)이면 할인율은 아예 없는 것이다. */
    if (m.soon || y.soon || m[key] == null || y[key] == null) return 0;
    const monthly = Number(m[key]), yearly = Number(y[key]);
    if (!Number.isFinite(monthly) || !Number.isFinite(yearly) || monthly <= 0 || yearly < 0) return 0;
    return Math.max(0, Math.floor((1 - yearly / (monthly * 12)) * 100));
  },

  /**
   * 구독 시작. 성공하면 결제창으로 넘어간다.
   * @throws {Error} 'NOT_AVAILABLE' — 결제 수단이 아직 연결되지 않음
   */
  async subscribe(planKey, providerKey) {
    /* ⚠️⚠️ Open-Meteo는 **자료(CC BY 4.0)**와 **호스팅 API 이용권**이 다르다.
       무료 api.open-meteo.com은 비상업 전용이다. 여러 화면·Lambda가 아직 그
       엔드포인트를 쓰므로, 유료 customer-api 전환 또는 셀프호스팅을 검증했다는
       두 번째 스위치 없이는 SALES_OPEN만 켜도 결제를 시작하지 못하게 막는다.
       GVP도 인용만으로 상업 이용할 수 없고 사전 서면 허가가 필요하다. */
    if (!salesAllowed({ mode: CONFIG.MONETIZATION_MODE, salesOpen: CONFIG.SALES_OPEN })) {
      throw new Error('NOT_AVAILABLE');
    }
    if (CONFIG.OPEN_METEO_COMMERCIAL_READY !== true) {
      throw new Error('DATA_LICENSE_NOT_READY');
    }
    if (CONFIG.GVP_COMMERCIAL_READY !== true) {
      throw new Error('DATA_LICENSE_NOT_READY');
    }
    const plan = PLANS[planKey];
    if (!plan) throw new Error('UNKNOWN_PLAN');
    const list = this.providers();
    const prov = providerKey ? list.find(p => p.key === providerKey) : list[0];
    if (!prov) throw new Error('NOT_AVAILABLE');
    return PROVIDERS[prov.key].start(plan);
  },

  /* 창립회원 남은 자리. ⚠️ 못 세면 0 이 아니라 **null** 이다 —
     0 으로 두면 "마감"으로 읽혀서 팔 수 있는 걸 못 판다. */
  async seatsLeft(planKey = 'founding') {
    const plan = PLANS[planKey];
    if (!plan?.seats || !auth.client) return null;
    try {
      const { data, error } = await auth.client.rpc('plan_seats_left', { p_plan_id: plan.id });
      return error ? null : (typeof data === 'number' ? data : null);
    } catch { return null; }
  },

  /**
   * 결제창에서 돌아온 뒤의 **승인**. pay-return.html 이 부른다.
   * ⚠️⚠️ 이 함수는 금액을 보내지 않는다. 서버가 DB 에서 찾는다 —
   *    주소창의 amount 를 그대로 승인에 쓰면 39원 결제가 통과한다.
   * ⚠️ 두 번 불려도 안전하다 (서버가 멱등).
   */
  async confirm({ paymentKey, orderId }) {
    if (!CONFIG.CONFIRM_URL) throw new Error('NOT_CONFIGURED');
    const token = await auth.accessToken?.();
    if (!token) throw new Error('NOT_SIGNED_IN');
    const r = await fetch(CONFIG.CONFIRM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentKey, orderId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `confirm ${r.status}`), { detail: j });
    // 서버가 바꾼 값을 다시 읽는다 — 화면이 스스로 'paid' 라고 우기지 않는다.
    await auth.refresh?.();
    return j;
  },

  /* 구독 상태는 서버(profiles.tier)가 정본이다.
     ⚠️ 클라이언트가 스스로 'paid' 로 바꿀 수 있으면 결제를 우회할 수 있다.
        영수증 검증은 서버(Supabase Edge Function)가 하고, 앱은 결과만 읽는다. */
  isPaid() { return auth.isPaid(); },
};

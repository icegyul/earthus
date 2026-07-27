// 이 파일을 config.local.js 로 복사한 뒤 값을 채우세요.
// ⚠️ config.local.js 는 절대 git 에 올리지 마세요 (.gitignore 에 이미 있음).
//
// 값이 비어 있으면 앱은 "게스트 모드"로 동작합니다 —
// 지구본·기상·재난 등 로그인 없는 기능은 전부 정상 동작하고,
// 로그인/구독/사전등록만 비활성화됩니다.

export const CONFIG = {
  /* ── Supabase ────────────────────────────────────────────
     1. https://supabase.com 에서 프로젝트 생성
     2. Project Settings → API 에서 아래 두 값 복사
     3. anon key 는 공개되어도 되는 키입니다 (RLS 로 보호).
        service_role 키는 절대 여기 넣지 마세요.                      */
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  /* ── 소셜 로그인 ──────────────────────────────────────────
     Supabase Dashboard → Authentication → Providers 에서 설정합니다.
     코드에는 아무것도 넣지 않습니다.

     [Google]
       - Google Cloud Console → API 및 서비스 → OAuth 동의 화면 구성
       - 사용자 인증 정보 → OAuth 클라이언트 ID (웹 애플리케이션)
       - 승인된 리디렉션 URI 에 Supabase 가 알려주는 콜백 URL 추가
       - 클라이언트 ID/시크릿을 Supabase 에 입력

     [Apple]  ⚠️ Apple 개발자 계정 필요 (연 $99)
       - Certificates, Identifiers & Profiles → Identifiers → Services ID 생성
       - Sign in with Apple 활성화, Return URL 에 Supabase 콜백 추가
       - Keys → Sign in with Apple 용 키(.p8) 생성
       - Team ID / Key ID / Services ID / .p8 내용을 Supabase 에 입력

     ※ App Store 심사 규정 4.8: 제3자 소셜 로그인을 제공하면
        Sign in with Apple 도 반드시 함께 제공해야 합니다. 둘 다 넣는 이유입니다.   */

  /* ── 사전등록 (§7) ──────────────────────────────────────── */
  FOUNDING_GOAL: 500,          // 창립 멤버 목표 인원 — 진행률 게이지 기준

  /* ── 법적 문서 버전 ──────────────────────────────────────
     약관·처리방침을 고칠 때마다 올리세요.
     동의 기록에 함께 저장되어, 어떤 버전에 동의했는지 추적됩니다.
     개정 시에는 기존 회원에게 재동의를 받아야 할 수 있습니다.            */
  // SSEC RealEarth Access Key. 없으면 타일에 워터마크가 찍힌다.
  // https://realearth.ssec.wisc.edu 에서 무료 계정 생성 → 도메인(referer) 등록 → 키 발급
  REALEARTH_KEY: '',

  /* ── 항공권 제휴 (수수료 모델) ────────────────────────────
     우리는 항공권을 팔지 않습니다. 링크로 보내고 성사되면 수수료를 받습니다.
     그래서 여행업 등록·PG 계약·PCI-DSS 가 필요 없습니다.

     승인 전에는 비워두세요 — 그러면 일반 검색 링크로 나가고 동작은 같습니다.

     [Skyscanner]  파트너 프로그램 신청 → associateid 발급
     [Kiwi.com]    Travelpayouts 또는 Impact 를 통해 affilid 발급

     ⚠️ 값을 넣으면 UI 에 「제휴」 배지와 고지 문구가 자동으로 붙습니다.
        표시광고법·FTC 가 요구하는 표시라 임의로 끄지 마세요.                    */
  AFFIL: {
    skyscanner: '',
    kiwi: '',
  },

  /* ── 구독 상품 (선택) ─────────────────────────────────────
     비워두면 billing.js 의 기본값을 씁니다.
     ⚠️ App Store / Play / PG 에 등록한 실제 상품 가격과 반드시 일치시킬 것.   */
  // PLANS: { monthly: { id:'earthus.pro.monthly', krw:4900, usd:3.99, period:'month' } },

  /* 서버가 만드는 PG 결제창 생성 엔드포인트. 없으면 결제 버튼 대신 사전등록 안내가 뜹니다.
     ⚠️ 금액을 클라이언트가 정해 보내면 위변조가 됩니다. 서버가 주문을 만들어야 합니다. */
  CHECKOUT_URL: '',

  LEGAL_VERSION: '2026-07-26',

  /* ── 사업자 정보 (법적 고지 필수) ────────────────────────
     전자상거래법 제10조 / 개인정보보호법 제30조에 따라
     약관·처리방침·앱 내 고지에 아래 정보가 들어가야 합니다.            */
  BUSINESS: {
    name: '',                  // 상호
    ceo: '',                   // 대표자명
    address: '',               // 사업장 주소
    regNo: '',                 // 사업자등록번호
    mailOrderNo: '',           // 통신판매업 신고번호
    email: '',                 // 고객문의 이메일
    phone: '',                 // 고객문의 전화
    privacyOfficer: '',        // 개인정보 보호책임자 성명
    privacyEmail: '',          // 개인정보 관련 문의 이메일
  },
};

# 유료 앱 출시 검토 — Google Play · Chrome 웹 스토어 규칙 (r-play, 2026-09-24)

> 질문(PD): "유료 어플로 출시하는데 문제 없는지 조사해줘"
> 범위: (A) 설치할 때 돈을 받는 유료 앱 · (B) 무료 앱 + v2 구독/기간 이용권 · (C) 크롬 새 탭 확장을 유료로 할 때.
> **이 문서는 법률·세무 조언이 아니다.** 공식 문서를 읽고 정리한 조사다. 표시한 곳은 **변호사 또는 세무사가 확인해야 한다**(§7).
> 표기: 인용은 출처마다 15단어 이하. 모든 출처는 **2026-09-24 읽음**. 공식 출처로 확인하지 못한 것은 **확인 필요**라고 쓰고, 사실처럼 쓰지 않는다.
> 조사만 했다. 코드·설정·스토어·배포는 아무것도 바꾸지 않았다. 이 파일은 git 이 무시하는 `build/` 아래에 있다(`.gitignore:63`).

---

## 0. 결론 먼저

**유료로 파는 것은 가능하다. 그러나 (A) '설치할 때 돈 받는 앱'은 권하지 않는다. (B) '무료 앱 + 앱 안 Play 결제로 v2 이용권'이 맞다.** 확장(C)은 스토어 결제가 없으므로 무료로 두는 것을 권한다.

| | (A) 유료 앱 (설치 시 결제) | (B) 무료 앱 + Play 결제 v2 이용권/구독 | (C) 크롬 확장 유료 |
|---|---|---|---|
| 정책상 가능? | 가능. 금지 문장 없음 | 가능. Google 이 PWA/TWA 에 **권하는 방식** | CWS 결제는 **2021-02-01 종료**. 외부 결제만 가능 |
| Google 자신의 권고 | **PWA 에는 권하지 않는다**고 공식 문서 두 곳에 적혀 있다(§2-1) | 앱 안 구매·구독을 권한다(§2-1) | 결제 제공 없음. 판매자가 Google 이 아님을 밝혀야 한다(§4) |
| 되돌릴 수 있나 | 유료→무료는 된다. **무료로 한 번 낸 앱은 유료로 못 바꾼다**(§1-1) | 가격·상품은 나중에 바꿀 수 있다 | — |
| 가장 큰 위험 | ① v1 무료 원칙과 충돌(앱 안 v1 까지 돈을 받게 됨) ② 같은 내용이 earthus.net 에 무료 → 환불·별점 위험(추정) ③ **지시서대로 먼저 무료로 내면 그 앱은 영영 (A)가 안 된다** | 구독 법규 겹겹(§3): 30일 전 동의, 한국 가격 인상 동의, 쉬운 해지, 7일 청약철회 | 확장 목적 하나(지금 지구)와 결제 기능이 섞일 때의 심사 위험(확인 필요) |
| 부가세 | **한국에 있는 개발자가 한국 구매자분 부가세를 직접 산정·청구·납부한다**(§1-3) — A·B 공통 | 같음 | 외부 결제면 지금 웹 결제와 같은 처리 |

**지금 바로 고칠 것(판매 여부와 관계없음):** 스토어 등록정보 초안에 **정부 정보 출처 링크와 '정부 기관과 무관' 문장**이 없다. 초안 §1-6 은 "정부 앱 — 해당 없음"이라고 적었지만, Play 의 '정부 정보를 전하는 앱' 요건은 기상청·JMA·NOAA 자료를 보여 주는 앱에 적용될 가능성이 높다(§5). 첫 제출 전에 넣는다.

---

## 1. Google Play — 유료 판매의 기본 규칙

### 1-1. 무료↔유료 전환 (확인됨)

- **무료 → 유료: 안 된다.** "Once your app has been offered for free, the app can't be changed to paid." 유료로 팔려면 **새 패키지명으로 새 앱**을 만들어야 한다.
  — https://support.google.com/googleplay/android-developer/answer/6334373 (2026-09-24 읽음)
- **유료 → 무료: 된다**(같은 문서). 한 방향 문이다.
- **EARTHUS 에 주는 뜻:** 앱 지시서(docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-4)는 판매를 잠근 채 `net.earthus.app` 을 **먼저 무료로 내는** 계획이다. 그렇게 내는 순간 `net.earthus.app` 은 (A) 유료 앱이 될 수 없다. 패키지명은 영구다(스토어 초안 §1-2, answer/9859152). **(A)를 조금이라도 고려한다면, 첫 공개 전에 결정해야 한다.**
  - 잠기는 시점이 **Console 에서 앱을 만들며 무료/유료를 고를 때**인지 **첫 트랙(비공개 테스트 포함)에 게시할 때**인지는 공식 문장이 없다 → **확인 필요.** 안전한 규칙: **Console 에서 앱을 만들기 전에 (A)/(B)를 결정한다.**
  - (B)는 무료 앱에 나중에 결제를 붙이는 것이라 이 제약이 없다.
- **가격 변경:** 가격 변경을 포함한 수정은 반영에 몇 시간 걸릴 수 있다(같은 문서). Play 가 현지 통화로 환산하고 일부 국가에선 세금을 더한다(같은 문서). 한국은 **세금 포함 가격 표시 국가**다(§1-3).

### 1-2. 판매자 등록 · 국가 · 지급

| 항목 | 내용 | 출처 (2026-09-24 읽음) |
|---|---|---|
| 결제 프로필 | 유료 앱·앱 안 결제를 쓰려면 결제 프로필을 먼저 만든다. 개인사업자가 개인/조직 중 어느 유형 프로필로 할지(D-U-N-S 포함)는 `docs/APP-PD-CHECKLIST-2026-09-24.md` §0(F1~F5·U1)에서 이미 다룬다 | answer/6334373 · answer/1153481 |
| 한국 판매자 등록 | 대한민국은 개발자 등록·**판매자 등록 모두 지원**, 기본 통화 **KRW** | https://support.google.com/googleplay/android-developer/answer/9306917 |
| 구매자 국가 | 유료 항목은 구매 지원 국가의 사용자만 살 수 있다. 판매 국가는 Console 에서 고른다 | answer/9306917 |
| 지급 시기 | 한 달치 주문을 "around the 15th of the following month" 지급 | https://support.google.com/googleplay/android-developer/answer/137997 |
| 최소 지급액 | 현지 통화 지급 US$1, USD 송금 US$100 | answer/137997 |
| 지급 통화 | 한국 개발자가 **원화로 받는지, USD 송금인지**는 공식 문장을 찾지 못했다 → **확인 필요**(결제 프로필 화면에서 PD 확인) | — |
| 한국 판매자 표시 | 한국에서 유료 앱·앱 안 구매를 파는 **사업자**는 사업자등록번호·통신판매업 신고번호·신고 기관을 추가로 적는다. 한국 사용자에게 **설명 맨 아래**에 표시된다 | https://support.google.com/googleplay/android-developer/answer/3255733?hl=ko |

- 해외 판매(EEA 등)를 켜면 EU 거래자(DSA) 신고가 따라올 수 있다 — 기존 PD 할 일 목록 U6 에서 이미 **확인 필요**로 남긴 항목이다. **처음엔 한국만 판매**로 시작하면 세금·신고 범위가 가장 작다(추천, 사실 아님).

### 1-3. 부가세 — 누가 내나 (확인됨, **세무사 확인 필수**)

- **한국에 있는 개발자는 한국 구매자 판매분의 부가세를 직접 처리한다.** "you're responsible for determining, charging, and remitting Value Added Tax (VAT)"
  — https://support.google.com/googleplay/android-developer/answer/138000 (영문·한국어판 모두 2026-09-24 읽음)
- 한국 **밖** 개발자라면 Google 이 10% 를 산정·납부한다(같은 문서). 즉 "Play 에서 팔면 Google 이 부가세를 알아서 낸다"는 **한국 개발자에게는 틀린 전제**다.
- 사업자등록번호를 Google 에 주지 않으면 Google 이 **서비스 수수료**에 10% 부가세를 붙인다(같은 문서, 한국어판). 결제 프로필의 '사업자 등록 번호' 칸에 넣는다.
- 한국은 **구매자에게 보이는 가격 = 세금 포함 최종 금액**이어야 하는 나라다(같은 문서). 약관 제8조 제4항("표시 금액은 부가가치세 포함")과 방향은 맞다.
- Google Play 서비스 약관(한국, 최종 수정 2026-07-29)은 구매 시 판매 계약 상대를 (a) Google Digital Inc. 또는 (b) "콘텐츠 제공자"로 적는다(요약 도구로 두 번 읽음 — 제출 전 원문 한 번 더 확인 권장) — https://play.google.com/intl/ALL_kr/about/play-terms/ . EARTHUS 가 파는 이용권의 판매 당사자가 PD(제공자)인지, Google 이 판매를 대행하는 구조인지에 따라 **매출 인식(총액/순액)·세금계산서·전자적 용역 신고 방식이 달라질 수 있다 → 세무사 확인 필요.**
- 세무사에게 물을 것: 간이/일반과세 여부와 Play 매출 신고 방법, Play 정산 보고서로 신고 근거가 되는지, 해외(비한국) 구매자분 영세율·Google 대리 납부 여부, 서비스 수수료 부가세(사업자번호 제출 시 처리).

### 1-4. 서비스 수수료 (확인됨)

| 시기 | 1회성 상품·유료 앱 다운로드 | 자동 갱신 구독 | 출처 |
|---|---|---|---|
| 지금 ~ 2026-12-30 | 연 US$1M 까지 15%(15% 등급), 초과 30% | 매출과 무관하게 15% | https://support.google.com/googleplay/android-developer/answer/112622 |
| 2026-12-31 ~ (한국 새 체계) | 신규 설치 첫 $1M: 10% + 청구 수수료 | 10% + 청구 수수료 | https://support.google.com/googleplay/android-developer/answer/16954621 ("December 31, 2026 KR") |
| 한국 대체결제 | 위 수수료에서 4%p 감액 | 같음 | answer/112622 · answer/10281818 |

- 청구 수수료(billing fee)는 US·UK·EEA 5% 만 발표됐다. **한국 요율은 확인 필요.** 새 체계에서 한국 대체결제 4%p 감액이 유지되는지도 **확인 필요**(answer/16954621 에 한국 대체결제 행 없음).
- EARTHUS 규모(첫 $1M 안)에서는 (A)·(B)·1회성·구독 사이 **수수료 차이가 거의 없다.** 수수료로 방식을 고를 이유는 없다.

### 1-5. 환불 — Play 48시간 vs 전자상거래법 7일

| | 내용 | 출처 (2026-09-24 읽음) |
|---|---|---|
| Google 이 직접 | 구매 후 48시간 안: 상황에 따라 환불 가능. "After 48 hours: Contact the developer" | https://support.google.com/googleplay/answer/15574908 |
| 유료 앱 반품 | 첫 구매 직후 요청하면 환불될 수 있고 앱이 삭제된다. 앱당 한 번만 | answer/15574908 |
| '2시간 안 삭제하면 자동 환불' | 제3자 글에만 있다. 공식 문서는 "shortly after first buying" 수준 → **2시간은 확인 필요** | — |
| 개발자 환불 | Console 주문 관리에서 전액·**부분** 환불. 되돌릴 수 없다. 환불 정책은 개발자 몫: "you're also responsible for setting your own policies for refunds" | https://support.google.com/googleplay/android-developer/answer/2741495 |
| 전자상거래법 | 계약내용 서면을 받은 날(공급이 늦으면 공급 시작일)부터 **7일** 청약철회(제17조 제1항). 디지털콘텐츠는 **제공이 시작되면 철회 제한**(제2항 제5호) — 단, 제한을 걸려면 불가 사실을 표시하고 **시험 사용 상품**(일부 이용·한시 이용·체험판 등, 시행령 제21조의2)을 제공해야 한다(제6항). 안 하면 제한 못 한다 | 국가법령정보센터, 전자상거래법(시행 2026-07-21) 제17조 · 시행령 제21조의2 (law.go.kr DRF 원문, 2026-09-24 읽음) |

- **뜻:** Google 의 48시간은 법이 정한 7일을 대신하지 않는다. 3~7일째 철회 요청은 **PD 가 Console 에서 직접 환불**해야 한다. 약관 제9조(7일 전액·7일 뒤 **일할 환불**·3영업일 처리)는 Console 부분 환불로 구현할 수는 있지만, 선불형(prepaid) 상품에 일할 계산 기능이 자동으로 있는 것은 아니다 → 운영 절차를 만들고 **법무가 약관과 맞춘다.**
- (A) 유료 앱은 설치 즉시 '제공 개시'라 철회 제한을 주장하려면 제6항 조치가 필요하다. 웹 무료 v1·v2 FREE 가 '시험 사용'으로 인정되는지는 **법무 판단**이다.

---

## 2. 특정 위험 — 내용이 earthus.net 에 무료로 있는 '유료 TWA'

### 2-1. Google 자신이 권하지 않는다 (확인됨)

- ChromeOS/PWA-in-Play 문서(최종 수정 2025-12-18): "We do not recommend the paid app option for PWAs published on Google Play." 이유: 설치된 PWA 도 브라우저에서 열려야 하고, 앱에서 왔는지 판정은 클라이언트 쪽 검사뿐이라 모든 이동에서 믿을 수 없다. 대신 앱 안 구매·구독을 권한다.
  — https://developers.google.com/chromeos/app-development/publish/pwa-in-play
- Chrome TWA 결제 문서도 같은 말: 유료 앱 판매에 대해 "We don't recommend this for PWAs". 웹앱은 열린 웹에서 자유롭게 접근돼야 하기 때문이라고 한다.
  — https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing (문서 날짜 2021-01-26 — 오래됐다)

### 2-2. 정책 위반인가 — 조항별

| 정책 | 문장 | EARTHUS (A)에 대한 판단 |
|---|---|---|
| 웹뷰 스팸 | "provide a webview of a website without permission from the website owner" — https://support.google.com/googleplay/android-developer/answer/9899034 | **소유자 본인 사이트**이고 assetlinks 로 소유를 증명하므로 이 조항 자체는 걸리지 않는다고 본다. 자기 사이트 래퍼를 금지하는 문장은 없다 |
| 최소 기능 · 반복 콘텐츠 | 같은 문서: 고유한 콘텐츠·서비스로 가치를 줘야 한다. 이미 Play 에 있는 다른 앱과 같은 경험만 주는 앱 불가 | 3D 지구·알림·로그인 등 실제 기능이 있어 통과 가능성은 있다. 그러나 **'웹과 같은 것'을 돈 받고 판다는 점**은 심사에서 불리하게 읽힐 수 있다(추정, 공식 사례 없음) |
| 기만 행위 · 정확한 설명 | 메타데이터 전체에서 기능을 정확히 설명해야 한다 — https://support.google.com/googleplay/android-developer/answer/9888077 | 유료 앱 설명에 "같은 서비스가 earthus.net 에서 무료"라고 **적으라는 규칙은 없다.** 그러나 숨기면 사용자는 속았다고 느낀다. 적으면 살 이유가 줄어든다 — (A)의 구조적 약점 |
| 결제 | 다운로드 요금은 Play 결제만 — https://support.google.com/googleplay/android-developer/answer/9858738 | (A)도 Play 결제로만. 문제 없음 |

- **사용자가 겪을 일(추정):** 돈을 내고 설치 → 같은 화면을 브라우저에서 무료로 봄 → 48시간 안 환불 요청·낮은 별점. 공식 통계나 사례는 찾지 못했다(**확인 필요**).
- **선례:** 'TWA 가 최소 기능으로 반려됐다'는 글은 여럿 있으나 모두 **비공식**(12-testers 가이드, PWABuilder 이슈 #1752, Play 커뮤니티 스레드 349036133). 유료 TWA 반려 사례는 공식 출처로 확인하지 못했다.
- **제품 원칙 충돌(저장소 사실):** AGENTS.md 는 v1 을 "무료 서비스"로 정의한다. 앱 하나에 v1+v2 를 담는 지시서 구조에서 (A)는 **v1 까지 돈을 받는 것**이 된다. 이것은 정책 문제가 아니라 PD 결정 문제다.
- **기술 구멍:** (A)의 '돈 낸 사람만'은 앱 설치 여부로만 갈린다. 웹은 그대로 열려 있으므로 v2 유료 기능은 결국 **서버 등급 판정**(지시서 §3-5 ①)으로 막아야 한다 — 그러면 (B)와 같은 일을 하게 된다.

### 2-3. 유료 앱이 구독까지 파는 것 — 허용되나

- 앱 안 상품 문서(https://support.google.com/googleplay/android-developer/answer/1153481)에 **무료 앱에만 허용한다는 제한 문장은 없다.** 가격 문서(answer/6334373)도 유료 앱과 앱 안 상품을 함께 다룬다.
- 그러나 "유료 앱도 구독을 팔 수 있다"는 **명시 허용 문장은 찾지 못했다 → 확인 필요.**
- 설치비 + 구독 이중 과금은 사용자 반발이 크고, 설명에 두 요금을 모두 분명히 써야 한다(Subscriptions 정책의 투명성 요건, §3-1).

---

## 3. (B) 무료 앱 + Play 결제 — TWA 에서의 구독·이용권

### 3-1. Play Subscriptions 정책 (확인됨)

출처: https://support.google.com/googleplay/android-developer/answer/9900533 (2026-09-24 읽음)

- 제안 조건·가격·청구 주기·**자동 갱신 조건**·구독이 필수인지 여부를 분명히 밝힌다.
- 구독은 기간 내내 지속 가치를 줘야 하며, 사실상 1회성 혜택을 구독으로 팔면 안 된다.
- 무료 체험·첫 할인: 기간·가격·내용을 미리 알리고, **언제 유료로 바뀌는지·얼마인지·어떻게 해지하는지** 알린다.
- 해지: 관리·해지 방법을 밝히고, 앱 안에 "an easy-to-use, online method to cancel the subscription"을 둔다.

### 3-2. 한국 법 + Play 규칙을 한 표로 (구독·가격 인상)

| 요구 | 내용 | 출처 (2026-09-24 읽음) |
|---|---|---|
| 무료→유료 전환·정기결제 증액 | 전환·증액 **30일 전**에 일시·전후 가격·결제 방법에 **소비자 동의**를 받고, 취소·해지 방법을 고지 | 전자상거래법 제13조 제6항 · 시행령 제20조의2(본조신설 2025-02-11) |
| Play 가격 인상(기본) | 기존 구독자는 **옵트인**: "Users must explicitly accept the higher price before it is first charged" — 안 받으면 자동 해지. 37일 전 고지 기간 | https://developer.android.com/google/play/billing/price-changes |
| Play 한국 전용 | 무료 체험·첫 할인 뒤 가격이 오르는 것에 한국 사용자는 동의해야 한다("must consent to any price step-ups"). 동의 안 하면 자동 해지, Play 가 알림·동의 기록 | https://developer.android.com/google/play/billing/lifecycle/subscriptions |
| 기존 구독자 가격 | 기본적으로 옛 가격 유지(legacy cohort) | price-changes 문서 |
| 해지 방해 금지 | 해지·탈퇴를 가입보다 복잡하게 만들거나 다른 방법으로만 하게 하면 안 된다 | 전자상거래법 제21조의2 제1항 제4호 |
| 반복 팝업·선택 강요 금지 | 이미 정한 선택을 팝업으로 반복 요구 금지, 선택지 시각 차별 금지 | 같은 조 제3호·제5호 |
| 7일 청약철회 | §1-5 | 제17조 |

- **창립 멤버 '언제나 정가의 50%' 약속(약관 제8조 제7항)**과 Play 옵트인 가격 인상·legacy 가격 유지가 **서로 다른 금액**을 만들 수 있다. 지시서 §3-3 가-2 가 이미 **법무 검토 필요**로 남긴 항목이다.
- 지금 약관은 '자동 갱신 없는 기간 이용권'이다. 이를 유지하면 Play **선불형(prepaid) 요금제**가 맞고, 선불형은 자동 갱신되지 않아 위 가격 인상·전환 동의 문제가 대부분 사라진다(지시서 §3-3 가-1, 추천). 자동 갱신 구독으로 바꾸면 약관 제8조 전면 개정 + 위 표 전부.

### 3-3. TWA 에서 Play 결제 (Digital Goods API)

- 구조: Digital Goods API 로 상품·구매를 조회하고 Payment Request API 로 Play 결제창을 띄운다. 앱 안 구매(1회성)와 구독 모두 된다 — https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing
- **구매 확인(acknowledge)은 서버에서.** 3일 안에 안 하면 자동 환불·권한 회수(같은 문서).
- Bubblewrap 설정(`playBilling`, `alphaDependencies`)은 **2021-01-26 문서 기준**이다. 지금 Bubblewrap·Chrome 의 현행 방법은 **확인 필요**(개발 단계에서 최신 Bubblewrap 문서로 재확인).
- 앱 안에서 다른 결제로 이끄는 링크·버튼·웹뷰 금지 — answer/9858738. "웹사이트에서 업그레이드하세요" 같은 **링크 없는 안내 문구**는 허용 — https://support.google.com/googleplay/android-developer/answer/10281818 . 같은 문서: "Google Play allows any app to be consumption-only" — 앱에서 안 팔고 웹 구매자만 쓰게 하는 것도 된다(지시서 §3-3 가-3).
- 한국은 대체결제·아웃링크(4%p 감액)가 **지금도** 가능(answer/10281818). 대가(네이티브 API·PCI DSS·24시간 보고)는 지시서 §3-3 (나)-2 참고.
- **TWA 특유 위험(저장소 사실):** 웹 `SALES_OPEN` 을 여는 순간 앱 안에서도 토스 결제창이 뜨면 결제 정책 위반. 앱 안 판정은 첫 출시부터 넣는다(지시서 §3-4).

---

## 4. Chrome 웹 스토어 — 확장을 유료로 할 수 있나

- **CWS 자체 결제는 없다.** 2020-09-21 부터 "You can no longer create new paid extensions or in-app items." 2020-12-01 무료 체험 중단, 2021-02-01 기존 항목도 과금 중단.
  — CWS Payments Deprecation (developer.chrome.com 원문 저장소: https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md , 2026-09-24 읽음. developer.chrome.com 의 해당 주소는 이번에 404 였다)
- 대안: 다른 결제 처리자 + 자체 라이선스 확인(OAuth 등)으로 옮기라고만 한다. 특정 업체를 권하지 않는다(같은 문서). ExtensionPay·Dodo 같은 서비스는 **제3자**다.
- 정책(최종 수정 2025-05-22) — https://developer.chrome.com/docs/webstore/program-policies/policies
  - 기본 기능에 돈을 내야 하면 **설치 전 설명**에 그 사실을 분명히 적는다.
  - "You must clearly identify that you, not Google, are the seller"
  - 카드 등 결제 정보는 법·PCI 규칙대로 안전하게 다룬다.
  - 다른 기관이 승인·보증한 것처럼 표현 금지(사칭 조항).
- **추천:** 새 탭 확장은 **무료**로 둔다. 결제를 넣으면 ① 토스 웹 결제 연결·라이선스 서버를 새로 만들어야 하고 ② '지금 지구를 보여 준다'는 단일 목적과 섞인다(단일 목적 심사 위험은 **확인 필요**) ③ 거래자(Trader) 공개 정보가 따라온다(기존 할 일 목록 F10). v2 로 가는 안내 링크를 확장에 두는 것은 CWS 에 Play 같은 결제 유도 금지 조항이 없어 가능해 보이나 **확인 필요**.

---

## 5. 날씨 앱 — 정부 정보 고지 (지금 등록정보 초안에 빠져 있음)

### 5-1. 요건 (확인됨)

- **'정부 정보를 전하는 앱' 요건** — https://support.google.com/googleplay/android-developer/answer/9514050
  - 앱 **설명과 스토어 등록정보에** 눈에 잘 띄는 정보 출처를 넣는다.
  - "Make it clear that the app doesn't represent a government or political entity."
  - 출처는 사용자가 정보를 쉽게 검증할 수 있어야 한다. 예: `.gov`·`.go.jp` 도메인 URL.
  - 처리방침을 앱 안과 등록정보 양쪽에서 찾기 쉽게.
- **기만 행위 정책** — 정부 기관 제휴를 거짓 주장하거나 권한 없이 정부 서비스를 제공한다고 하면 위반: "falsely claim affiliation with a government entity" — https://support.google.com/googleplay/android-developer/answer/9888077
- 날씨 카테고리 **전용** Play 정책은 찾지 못했다(**확인 필요**).
- **비공식 선례:** 출처·면책 문구가 없어 "Missing Clear Source of Information/Disclaimer"로 반려된 뒤, 설명 끝에 출처 링크와 '정부를 대표하지 않음' 문장을 넣어 통과한 사례(개인 블로그, 2021 — https://vtsen.hashnode.dev/how-to-resolve-missing-clear-source-of-information-disclaimer-app-rejection). 공식 사례 아님.

### 5-2. EARTHUS 에 적용

- 앱은 기상청 관측·**기상특보**, 기상청·일본 기상청 지진, NOAA NESDIS 위성 구름을 보여 준다(스토어 초안 §1-2). 모두 정부 기관 발표다 → **요건 대상일 가능성이 높다.**
- 지금 초안(`docs/APP-STORE-LISTING-DRAFT-2026-09-24.md`) 상태:
  - §1-6: "정부 앱·금융·건강·VPN — 해당 없음". '정부 앱'으로 **선언**하지 않는 것은 맞지만, 위 **고지 요건**은 별개다. 이 줄을 고쳐야 한다.
  - 전체 설명에 기관 이름은 있으나 **기관 URL 과 '정부와 무관' 문장이 없다.**
- **초안에 더할 문안(제안, PD 확인 — 실제 쓰는 기관만 남긴다):**
  - ko: `EARTHUS 는 기상청·일본 기상청·미국 해양대기청(NOAA) 등 어떤 정부 기관과도 관계가 없으며 정부를 대표하지 않습니다. 정보 출처: 기상청 https://www.kma.go.kr · 일본 기상청 https://www.jma.go.jp · NOAA https://www.noaa.gov`
  - en: `EARTHUS is not affiliated with, and does not represent, the Korea Meteorological Administration, the Japan Meteorological Agency, NOAA or any government agency. Sources: https://www.kma.go.kr · https://www.jma.go.jp · https://www.noaa.gov`
  - 앱 안(설정·출처 화면)에도 같은 문장과 링크. 확장(CWS) 설명에도 같은 줄 — CWS 사칭 조항(§4).
  - 기상특보 안내 문장 "실제 대응은 기상청 등 공식 발표를 따르세요"(초안에 있음)는 유지.
- **자료 이용 허락은 별개 문제다.** 유료 등급이 여는 화면의 자료(Open-Meteo 비상업 API, CelesTrak 상업 이용 등)의 상업 이용 허가는 지시서 §3-5 ⑥ · `prototype/legal/README.md` 체크리스트가 이미 **판매 전 필수**로 남겼다. 이 문서에서는 다시 조사하지 않았다.

---

## 6. 한국 법 — 판매자(PD)가 지는 의무 요약

Play 에서 팔아도 **통신판매업자로서의 의무는 PD 에게 남는다**(판매자 = 콘텐츠 제공자, §1-3). 법무가 확인할 것:

| 조항 | 내용 | EARTHUS 에 필요한 것 |
|---|---|---|
| 제13조 제1항 | 표시·광고에 상호·대표자·주소·전화·이메일·신고번호·신고 기관 | Play 계정 정보(answer/3255733)에 입력 → 한국 사용자 설명 하단 표시. 웹·앱 안에도 |
| 제13조 제2항 | 계약 전 거래조건 고지, 계약 후 계약내용 서면(전자문서) 교부 | Play 영수증 메일로 충분한지 **법무 확인**. 앱 안 결제 직전 확인 화면(지시서 §3-3 제6항 대응)에 조건 표시 |
| 제13조 제6항 · 시행령 제20조의2 | 무료→유료 전환·증액 30일 전 동의·고지 | 자동 갱신 구독을 택할 때만 해당(§3-2) |
| 제17조 · 시행령 제21조의2 | 7일 철회, 디지털콘텐츠 제한은 표시+시험 사용 제공 조건 | FREE 등급이 '시험 사용'으로 인정되는지 **법무 판단** |
| 제21조의2 | 다크패턴 금지(해지 방해·반복 팝업·선택 강요) | 해지·환불 경로를 구매 경로만큼 쉽게 |
| 제20조·제20조의2 | 통신판매중개자(플랫폼)의 고지·책임 | Google 이 중개자인지 판매 대행자인지에 따라 책임 배분이 달라짐 → **법무 확인** |

출처: 국가법령정보센터 전자상거래 등에서의 소비자보호에 관한 법률(공포 2026-01-20, 시행 2026-07-21) 및 같은 법 시행령 — law.go.kr 공개 API(DRF) 원문, 2026-09-24 읽음. https://www.law.go.kr/법령/전자상거래등에서의소비자보호에관한법률

---

## 7. 확인 필요 목록 · 누가 확인하나

| # | 무엇 | 누가 |
|---|---|---|
| 1 | Play 판매 부가세 신고 방법(간이/일반과세, 총액·순액, 정산서 증빙, 해외 구매자분, 서비스 수수료 부가세) | **세무사** |
| 2 | Play 거래에서 PD·Google 의 법적 지위(판매자/중개자), 계약서면 교부 요건 충족 여부 | **변호사** |
| 3 | 디지털콘텐츠 청약철회 제한 요건(FREE 등급·웹 무료가 시험 사용인지), 약관 제9조 일할 환불과 Play 환불의 정합 | **변호사** |
| 4 | 창립 멤버 '언제나 정가의 50%'와 Play 가격 인상 규칙의 충돌 | **변호사** |
| 5 | 한국 개발자 지급 통화(KRW/USD) | PD — Play 결제 프로필 화면 |
| 5-2 | 무료→유료 불가가 잠기는 시점(앱 생성 시 선택 vs 첫 트랙 게시) — 그 전까지 (A)/(B) 결정 | PD — Console 앱 만들기 전에 결정(안전 규칙) |
| 6 | 한국 청구 수수료(billing fee)율, 새 체계의 대체결제 4%p 유지 여부 | PD — 2026-12-31 전 Google 공지 재확인 |
| 7 | '유료 앱도 구독 판매 가능' 명시 문장 | PD/개발 — Console 에서 직접 확인 |
| 8 | 유료 앱 '2시간 삭제 자동 환불' | 공식 문장 없음 — 쓰지 않는다 |
| 9 | Bubblewrap `playBilling` 현행 설정법 | 개발 — Phase 2 착수 시 |
| 10 | 날씨 앱 전용 정책 유무, CWS 확장 안의 v2 안내 링크 허용 범위, 결제 기능과 단일 목적 | PD — 심사 전 정책 페이지 재확인 |
| 11 | 해외 판매 시 EU 거래자(DSA) 신고·국가별 세금 | 변호사·세무사 (처음엔 한국만 판매 권장) |
| 12 | 자료 상업 이용 허가(Open-Meteo·CelesTrak 등) | 이미 지시서 §3-5 ⑥ · FOUNDING-500 §4 에 있음 |

---

## 8. PD 결정에 쓰는 한 줄 요약

1. **(A) 유료 앱은 하지 않는다**를 추천 — Google 공식 문서 두 곳이 PWA 에 권하지 않고, v1 무료 원칙과 부딪치며, 웹 무료와 환불·별점 위험이 크다. 굳이 한다면 **첫 무료 공개 전에** 정해야 한다(무료→유료 불가).
2. **(B) 무료 앱 + Play 선불형 이용권**(약관의 '자동 갱신 없는 기간 이용권'과 같은 모양)을 추천 — 지시서 §3-3 가-1 × (나)-1 과 같다. 판매 전 서버 조건(지시서 §3-5)은 그대로.
3. **확장은 무료.**
4. **판매와 무관하게 지금:** 등록정보에 정부 기관 무관 문장·출처 URL 추가(§5-2), 결제 프로필에 사업자등록번호, Play 계정 정보에 통신판매업 신고번호·신고 기관.
5. **부가세는 PD 가 신고한다** — Google 이 대신 내지 않는다. 세무사 상담을 판매 개시 전에.

---

## 출처 (모두 2026-09-24 읽음)

- Play 가격 설정(무료↔유료): https://support.google.com/googleplay/android-developer/answer/6334373
- Play 판매자 등록 지원 국가: https://support.google.com/googleplay/android-developer/answer/9306917
- Play 주문 처리·지급: https://support.google.com/googleplay/android-developer/answer/137997
- Play 한국 개발자 추가 정보: https://support.google.com/googleplay/android-developer/answer/3255733?hl=ko
- Play 세율·부가세: https://support.google.com/googleplay/android-developer/answer/138000 (en · ko)
- Play 서비스 수수료: https://support.google.com/googleplay/android-developer/answer/112622
- Play 새 수수료 체계: https://support.google.com/googleplay/android-developer/answer/16954621
- Play 환불 정책(사용자): https://support.google.com/googleplay/answer/15574908 · https://support.google.com/googleplay/answer/15574897
- Play 주문 관리·환불(개발자): https://support.google.com/googleplay/android-developer/answer/2741495
- Google Play 서비스 약관(한국): https://play.google.com/intl/ALL_kr/about/play-terms/
- Play 스팸·최소 기능: https://support.google.com/googleplay/android-developer/answer/9899034
- Play 기만 행위: https://support.google.com/googleplay/android-developer/answer/9888077
- Play 정부 정보 앱 요건: https://support.google.com/googleplay/android-developer/answer/9514050
- Play 결제 정책: https://support.google.com/googleplay/android-developer/answer/9858738 · 해설 https://support.google.com/googleplay/android-developer/answer/10281818
- Play 앱 안 상품 만들기: https://support.google.com/googleplay/android-developer/answer/1153481
- Play 구독 정책: https://support.google.com/googleplay/android-developer/answer/9900533
- Play Billing 가격 변경: https://developer.android.com/google/play/billing/price-changes
- Play Billing 구독 수명주기(한국 가격 인상 동의): https://developer.android.com/google/play/billing/lifecycle/subscriptions
- PWA in Play(ChromeOS): https://developers.google.com/chromeos/app-development/publish/pwa-in-play
- TWA Play 결제: https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing
- CWS 결제 종료: https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md
- CWS 프로그램 정책: https://developer.chrome.com/docs/webstore/program-policies/policies
- 전자상거래법·시행령: https://www.law.go.kr/법령/전자상거래등에서의소비자보호에관한법률 (본문은 law.go.kr DRF 원문)
- 비공식(선례 참고만): https://vtsen.hashnode.dev/how-to-resolve-missing-clear-source-of-information-disclaimer-app-rejection · https://github.com/pwa-builder/PWABuilder/issues/1752 · https://support.google.com/googleplay/android-developer/thread/349036133
- 저장소 문서: AGENTS.md · docs/HANDOVER.md §8 · docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-3~3-6·§4-7 · docs/APP-PD-CHECKLIST-2026-09-24.md · docs/APP-STORE-LISTING-DRAFT-2026-09-24.md §1-2·§1-6 · prototype/legal/terms.ko.md 제8·9조 · prototype/legal/README.md · docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md

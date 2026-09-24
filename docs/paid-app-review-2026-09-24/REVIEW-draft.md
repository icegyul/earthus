# EARTHUS 유료 앱 출시 점검 (2026-09-24) — 문제 없는가

- 질문(PD): "유료 어플로 출시하는데 문제 없는지 조사해줘"
- 범위
  - (A) 설치할 때 돈을 받는 유료 앱
  - (B) 무료 앱 + v2 기간 이용권·구독
  - (C) 크롬 새 탭 확장을 유료로 팔 때
- 근거: 하위 조사 보고서 5건(`r-play.md` · `r-law.md` · `r-data-weather.md` · `r-data-maps.md` · `r-tax.md`, 같은 폴더)과 저장소 문서.
  - 법령은 국가법령정보센터 현행 본문을 2026-09-24에 읽었다.
  - 정책·약관은 각 기관 공식 페이지를 2026-09-24에 읽었다.
- ⚠️ **법률·세무 자문이 아니다.** 공개 문서를 읽고 정리한 것이다.
  - **⚪ 확인 필요**라고 적은 것은 공식 출처로 확정하지 못한 것이다. 사실로 읽지 말 것.
  - §5 에 적은 질문은 변호사·세무사·기상청이 답해야 한다.
- 조사만 했다. 코드·설정·스토어·배포·계정은 하나도 바꾸지 않았다. 이 파일은 git 이 무시하는 `build/` 아래에 있다.

---

## 0. 결론 먼저

1. **지금 그대로 유료로 열면 막힌다.** 가장 큰 벽은 기상산업진흥법이다.
   - v2 의 5일 예보와 확률을 돈 받고 보여 주면 '기상예보업'이 된다.
   - 등록 없이 하면 형사처벌(2년·2천만원) 대상이다.
   - 등록하려면 **상근 기상예보사(면허자) 1명 이상**이 필요하다고 기상청이 안내한다.
   - PD 계획("12월 등록 → 2027-01-01 유료", HANDOVER §8)은 이 사람을 둘 수 있을 때만 성립한다.
2. **등록해도 풀리지 않는 것이 있다.**
   - 자체 '특보·경고'는 등록해도 할 수 없다.
   - 지진·쓰나미 발표에는 기상사업자 예외가 없다(지진관측법 §16). JMA 지진 재전달과 실제 사건 쓰나미 도달시간은 변호사·기상청 확인 전까지 유료 상품에서 뺀다.
3. **자료·외부 서비스 다섯 곳은 돈을 받기 전에 계약이나 교체가 필요하다.**
   - Open-Meteo 무료 API(비상업 전용)
   - Esri 위성·지도 타일(인증 없이 호출 중)
   - OSM Overpass 공용 서버
   - Gemini(18세 미만 이용 가능성 조항, 유료 등급 여부)
   - 스미소니언 GVP
4. **판매와 관계없이 지금 걸려 있는 것이 둘 있다.**
   - 기기 위치를 서버에 저장하는 "＋ 지금 내 위치"는 **위치기반서비스사업 신고 대상일 가능성이 높다.** 이미 무료 v1 에서 운영 중이다.
   - Play 등록정보에 '정부 기관과 무관' 문장과 출처 URL 이 빠져 있다.
5. **방식은 (B) '무료 앱 + 앱 안 Play 결제 v2 기간 이용권'이 맞다.**
   - PD 계획대로 먼저 무료로 내면 그 앱(`net.earthus.app`)은 **영영 (A) 유료 앱이 될 수 없다.**
   - 크롬 확장은 무료로 둔다.
6. **문제 없는 것:** 자기 사이트를 담은 TWA 를 막는 Play 정책 조항은 없다(최소 기능 심사 통과는 추정). 세금은 출시를 막지 않는다. 다만 **한국 구매자분 부가세는 Google 이 아니라 PD 가 신고·납부한다.**

---

## 1. 판정표

범례: 🟢 문제 없음 · 🟡 조건부(할 일 있음) · 🔴 이대로는 막힘 · ⚪ 확인 필요
대상: **v1**(무료 웹) · **v2**(유료 예정) · **앱**(안드로이드 TWA, v1+v2 를 모두 담음) · **새 탭**(크롬 확장)
근거의 읽은 날은 모두 **2026-09-24**다.

### 1-1. 법·제도

| # | 이슈 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| L1 | **기상산업진흥법 — 기상예보업 등록** | v2 · 앱 | 🔴 | 제2조 제2·4호, 제6조 제1항(등록), 제26조 제2항 제1호(미등록 2년 이하 징역·2천만원 이하 벌금). 시행령 제5조 제1항 제1호: 인터넷으로 불특정 다수에게 주는 예보도 여기에 든다. 기상청 등록 안내: 인력은 "상근의 기상예보사 1명 이상" — https://www.kma.go.kr/kma/biz/biz_regist01.jsp · 법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=270217&efYd=20260326 | ① 기상예보사를 확보해 등록한다(PD 계획: 12월). ② 등록 전에는 유료 영역에서 예보·확률을 뺀다. ③ 등록 범위가 Intelligence 확률·Simulation 까지 덮는지 확인한다. 별표 1 원문(인력 1명/2명, 개인사업자 가능 여부)은 ⚪ | PD · 전문가 |
| L2 | **기상법 §17 — 예보·특보 제한** | v1 · v2 · 앱 | 🟡 (특보형 자체 경고는 🔴) | 기상법 [시행 2026-09-18, 법률 제21463호]. 제2조 제9호: 예보 = 수치예측 결과 등을 기초로 한 예상 발표. 제17조 본문 "기상청장 외의 자는 예보 및 특보를 할 수 없다." 예외는 국방과 등록 기상예보업자뿐이고, 특보는 예외가 아니다. 제48조: 특보 위반 3년·3천만원. 제51조 제1항 제1호: 예보 위반 100만원 이하 과태료 — https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284327&efYd=20260918 | 자체 판단의 경고·특보형 문구·푸시를 만들지 않는다(이안류 푸시는 기관 등급을 그대로 옮기는 원칙 유지). **지금 무료로 공개된 v2 예보에도 과태료 위험이 있다**(유·무료를 가르지 않음). 오로라 예보가 §14조의3①(등록자도 못 하는 우주영향 예보)에 드는지 ⚪ | 개발 · 전문가 |
| L3 | **기상법 출처 표시 의무** | v1 · v2 · 앱 · 새 탭 | 🟡 | 제12조의3 제5항(2026-09-18 시행), 제36조의2 제3항. 출처를 밝히지 않으면 제51조 제2항, 50만원 이하 과태료 — 같은 URL | 모든 기상청 자료 화면에 출처를 표기한다(원칙은 이미 있음). 출처가 빠진 화면만 점검한다. 확장의 출처 줄도 이 의무를 채운다 | 개발 |
| L4 | **지진관측법 §16** | v1 · v2 · 앱 · 새 탭 | 🔴 (쓰나미 도달시간·유료) / ⚪ (기상청·JMA 재전달) | 지진·지진해일·화산의 관측 및 경보에 관한 법률 [시행 2026-02-01]. 제16조 제1항: 기상청장 외의 자는 관측 결과·특보를 "발표할 수 없다". 예외는 인공지진과 학문연구뿐이다(시행령 제8조). **기상사업자 예외는 없다.** 제28조 제1항: 3년·3천만원 — https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=268815&efYd=20260201 | 실제 사건의 쓰나미 도달시간은 표시·푸시하지 않는다. 가정 시나리오로만 보여 주고, 실제 사건에는 "기상청 발표를 따르라"만 둔다. JMA 지진 재전달은 확인 전까지 유료 핵심 기능으로 쓰지 않는다. 기상청 서면 질의 | 개발 · 전문가 |
| L5 | **위치정보법 — 위치기반서비스사업 신고** | v1 · v2 · 앱 (새 탭 해당 없음) | 🔴 (이미 운영 중 · 신고 대상 가능성 높음 — 변호사 확인) | 제9조 제1항: 신고 의무. 제9조의2: 소상공인은 **면제가 아니라 개시 후 1개월 안 신고**. 제40조: 미신고·무동의 수집은 3년·3천만원. 제18·19조: 약관 명시 후 동의. 제25조: 14세 미만 — https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=277359&efYd=20251001 · 비신고 대상 안내 https://www.lbsc.kr/front/content/contentViewer.do?contentId=CONTENT_0000081 | 저장소 사실: `ui-alerts.js:404-410` → `push.js:176-179`가 기기 측위 좌표를 `alert_spots`에 저장한다. 두 길 중 하나를 고른다. A) 신고하고 위치 약관·동의·확인자료 기록을 갖춘다. B) "지금 내 위치" 저장을 없애고 지도 중심 저장만 남긴다. `prototype/legal/README.md:24`의 "2021년 개정 면제" 설명은 부정확하다(개정 대상). 늦은 신고 처리는 변호사에게 묻는다 | PD · 전문가 |
| L6 | **전자상거래법 — 표시 의무** | v1 · v2 · 앱 | 🟡 | 제10조 제1항, 제13조 제1항(신고번호·신고 기관). 위반 시 1천만원 이하 과태료(제45조) — https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=282793&efYd=20260721 · Play 한국 개발자 정보 https://support.google.com/googleplay/android-developer/answer/3255733?hl=ko | 약관·처리방침의 자리표시자 3곳(주소·전화·신고번호)을 채운다. Play Console 계정 정보에 사업자번호·통신판매 신고번호·신고 기관을 넣는다. 한국 사용자에게는 설명 하단에 표시된다 | PD |
| L7 | **전자상거래법 — 청약철회(7일)·시험 사용** | v2 · 앱 | 🟡 | 제17조 제1항(7일), 제2항 제5호(디지털콘텐츠는 제공 개시 뒤 제한). 제6항 단서: 제한하려면 **표시 + 시험 사용 제공**이 모두 필요하다. 시행령 제21조의2(일부 이용·한시 이용·체험판·정보 제공) — 같은 URL | 약관 제9조에 시험 사용 방법이 없다. v2 FREE 등급을 '체험용 디지털콘텐츠'로 약관과 결제 화면에 명시한다. 미성년자 취소권 고지(제13조 제3항)를 넣는다. (A) 방식은 체험 수단이 없어 불리하다 | 개발 · 전문가 |
| L8 | **환불 — Play 48시간 vs 법정 7일** | 앱 | 🟡 | Play 는 구매 후 48시간이 지나면 개발자에게 넘긴다 — https://support.google.com/googleplay/answer/15574908 · 환불 정책은 개발자 몫 — https://support.google.com/googleplay/android-developer/answer/2741495 | 3~7일째 철회 요청은 PD 가 Console 에서 직접 환불한다. 약관 제9조의 일할 환불을 Console 부분 환불로 처리하는 운영 절차를 만든다. 환불 시 서버 권한 회수를 연결한다 | PD · 개발 |
| L9 | **전자상거래법 — 정기결제 30일 전 동의** | v2 · 앱 (자동 갱신을 택할 때만) | 🟢 (기간 이용권 유지 시) / 🟡 (자동 갱신 시) | 제13조 제6항 · 시행령 제20조의2: 증액·무료→유료 전환 30일 전 동의. Play 도 가격 인상은 옵트인이고, 한국은 체험 뒤 인상에 동의가 필요하다 — https://developer.android.com/google/play/billing/price-changes · https://developer.android.com/google/play/billing/lifecycle/subscriptions | 현 약관(자동 갱신 없는 기간 이용권)을 유지하고 Play **선불형(prepaid)**으로 판다. 자동 갱신으로 바꾸면 약관 제8조를 전면 개정한다. 창립 멤버 "언제나 정가 50%" 조항과 가격 인상 규칙이 충돌하는지 법무가 확인한다 | PD · 전문가 |
| L10 | **전자상거래법 — 다크패턴 금지** | v2 · 앱 · (v1→v2 유도) | 🟡 | 제21조의2 제1항: 총액 일부만 표시·사전 체크·선택지 시각 차별·해지를 가입보다 어렵게·반복 팝업 금지. 1천만원 이하 과태료 — 같은 URL | 결제 UI 를 점검한다(연 총액 표시, 기본 체크 없음, 버튼 크기 차별 없음). 앱에서 가입했으면 앱에서 해지할 수 있게 한다. v1→v2 유도 문구가 반복 노출되지 않게 한다 | 개발 |
| L11 | **개인정보 국외이전** | v1 · v2 · 앱 | 🟡 | 개인정보 보호법 [시행 2026-09-11] 제28조의8: 별도 동의, 또는 계약 이행에 필요한 위탁·보관을 처리방침에 공개. 위반 시 매출 3% 이하 과징금 — https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283839&efYd=20260911 | 처리방침 개정: Gemini(현재 0건) · AWS 오하이오 · Supabase 리전 · 알림 지점 좌표 · MyMemory · Play 결제를 넣는다. 지금의 "국외 이전 없음" 문구는 Play 결제가 붙으면 거짓이 된다. Gemini 이전 근거(동의 vs 위탁)는 법무 판단. 초안은 `privacy.ko.revised-draft-2026-09-24.md` | 개발 · 전문가 |
| L12 | **부가통신사업 신고** | 전체 | ⚪ (신고 간주 가능성 높음) | 전기통신사업법 제22조 제1항, 제5항 제1호(소규모는 신고 간주), 시행령 제30조(자본금 1억원 이하) — https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286079&efYd=20260519 | 개인사업자의 '자본금'을 어떻게 보는지 과기정통부·중앙전파관리소에 문의한다 | PD |

### 1-2. 스토어·플랫폼

| # | 이슈 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| P1 | **Play 정책 — 자기 사이트 TWA 판매** | 앱 | 🟢 ((A)는 🟡 비권장) | 웹뷰 스팸 조항은 **소유자 허락 없이** 남의 사이트를 감싼 경우다 — https://support.google.com/googleplay/android-developer/answer/9899034 · 다운로드 요금은 Play 결제만 — https://support.google.com/googleplay/android-developer/answer/9858738 · Google 은 PWA 에 유료 앱 방식을 권하지 않는다 — https://developers.google.com/chromeos/app-development/publish/pwa-in-play | (B)를 택한다. assetlinks 로 소유를 증명한다. 앱 안에서 토스 결제창이 뜨지 않게 첫 출시부터 막는다(`SALES_OPEN` 을 여는 순간 위반이 된다) | 개발 |
| P2 | **유료→무료 전환 규칙** | 앱 | 🟡 (결정 시점) | "Once your app has been offered for free, the app can't be changed to paid." 반대(유료→무료)는 된다 — https://support.google.com/googleplay/android-developer/answer/6334373 | (A)를 조금이라도 고려하면 **Console 에서 앱을 만들기 전에** 결정한다. 언제 잠기는지(앱 생성 시 vs 첫 트랙 게시)는 ⚪. 패키지명은 영구다 | PD |
| P3 | **Play 정부 정보 고지** | 앱 · (새 탭은 CWS 사칭 조항) | 🟡 (지금 빠져 있음) | 정부 정보를 전하는 앱은 설명에 출처를 넣고 정부를 대표하지 않음을 밝힌다 — https://support.google.com/googleplay/android-developer/answer/9514050 · 거짓 제휴 금지 — https://support.google.com/googleplay/android-developer/answer/9888077 | `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-6 의 "정부 앱 — 해당 없음"을 고친다. 설명 끝에 '정부 기관과 무관' 문장과 기상청·JMA·NOAA URL 을 넣는다(ko·en 문안은 `r-play.md` §5-2). 앱 안 출처 화면과 CWS 설명에도 같은 줄을 넣는다 | PD · 개발 |
| P4 | **Play 구독·이용권 정책** | 앱 | 🟡 | 조건·가격·갱신 여부를 밝히고, 앱 안에서 쉽게 해지할 수 있어야 한다 — https://support.google.com/googleplay/android-developer/answer/9900533 | 결제 전 확인 화면에 조건을 표시한다. 구매 확인(acknowledge)은 서버에서 3일 안에 한다(하지 않으면 자동 환불). Bubblewrap `playBilling` 현행 설정법은 ⚪(2021 문서) | 개발 |
| P5 | **Play 수수료·지급** | 앱 | 🟢 | 지금 첫 US$1M 15%, 구독 15% — https://support.google.com/googleplay/android-developer/answer/112622 · 2026-12-31부터 한국 새 체계 10% + 청구 수수료 — https://support.google.com/googleplay/android-developer/answer/16954621 | 방식 선택에 영향 없다. 한국 청구 수수료율과 대체결제 감액 유지 여부는 ⚪. 지급 통화(KRW/USD)는 결제 프로필 화면에서 확인한다 ⚪ | PD |
| P6 | **크롬 웹 스토어 유료화** | 새 탭 | 🟡 (무료 권장) | CWS 결제는 2021-02-01 종료 — https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md · "You must clearly identify that you, not Google, are the seller" — https://developer.chrome.com/docs/webstore/program-policies/policies | 무료로 둔다. 유료로 하려면 토스 결제와 라이선스 서버를 새로 만들어야 하고, 거래자 공개 정보도 필요하다 | PD |

### 1-3. 세금

| # | 이슈 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| T1 | **부가세 — Play 한국 판매** | 앱 | 🟡 (막지 않음) | 한국 개발자는 한국 구매자분 VAT 를 직접 산정·청구·납부한다 — https://support.google.com/googleplay/android-developer/answer/138000 · 계약상 Google 은 대리인, 개발자가 판매자 — https://play.google/developer-distribution-agreement.html (§3.4) | PD 가 신고한다. 과세표준(결제액 × 100/110, 수수료 차감 전)과 공급시기는 세무사가 확인한다. 장부를 Play 한국 / Play 해외 / 웹 토스로 나눈다 | PD · 세무사 |
| T2 | **Google 수수료 부가세** | 앱 | 🟡 (첫 판매 전) | 사업자번호를 넣지 않으면 서비스 수수료에 VAT 10%가 붙는다(answer/138000 한국어판). 부가가치세법 제52조·제53조의2 — https://www.law.go.kr/법령/부가가치세법 | 결제 프로필 '대한민국 세금 정보'에 **첫 판매 전** 사업자등록번호를 넣는다. 늦게 넣으면 돌려받을 수 있는지 ⚪ | PD |
| T3 | **해외 판매 영세율** | 앱 | ⚪ | 제22조(국외공급)와 제24조+시행령 제33조(외화획득) 중 무엇을 근거로 할지 결론이 나지 않았다. 예규 원문은 읽지 못했다 | 처음에는 **한국만 판매**하면 이 절차가 생기지 않는다. 해외 판매는 세무사와 서류를 정한 뒤 연다 | PD · 세무사 |
| T4 | **과세유형·업종코드·현금영수증** | 전체 | ⚪ | 간이 기준 1억 400만원·납부면제 4,800만원(법 제61·69조). 업종코드 722000/724000 은 제3자 자료. 현금영수증 의무 여부 ⚪ — https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2470&cntntsId=7795 | 사업자등록증의 과세유형과 업종을 확인하고, 필요하면 정정신고한다. W-8BEN 을 낸다 — https://support.google.com/googleplay/android-developer/answer/7161649 | PD · 세무사 |

### 1-4. 자료·영상·API (문제 있는 것만. 🟢 은 마지막 한 줄로 묶음)

| # | 원천 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| D1 | **Open-Meteo 무료 API** | v2(기온·바람·기압·대기질·해양 격자, Intelligence 검증 3종) · v1(브라우저 직접 호출 10곳 이상) · 앱 | 🔴 | 약관의 상업 예시가 "구독이 있거나 광고를 싣는 웹사이트·앱 운영"이다. 유료 플랜만 상업 이용이 허용된다 — https://open-meteo.com/en/terms · https://open-meteo.com/en/pricing | 유료 키로 바꾸거나, 대량 격자를 NOAA GFS·ECMWF Open Data(상업 OK, 수집기 있음)로 옮긴다. 이미 무료 한도를 넘고 있다(R0 실측 월 약 860만 호출). 같은 도메인의 v1 도 해당하는지는 Open-Meteo 에 서면 문의한다 ⚪ | PD · 개발 |
| D2 | **Esri World Imagery · Dark Gray · Boundaries** | v2(확대 위성·지역 지형) · v1(관광 지도·국경 지명) · 앱 | 🔴 | 수익 앱은 인증을 쓰라고 한다(E300 각주 89, Location Platform 조건) — https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf · "Powered by Esri" 표기 필수 — https://developers.arcgis.com/documentation/mapping-and-location-services/faq/ | 우리 코드는 옛 주소를 **키 없이** 부른다(`v2-three/js/main.js:1075,1227`, `local-terrain.js:8`, `js/layers/tourism-map-style.js:10`, `js/readability.js:21,577`). ArcGIS Location Platform 키로 전환하거나, v1 참조지도를 Natural Earth 로 바꾼다. 옛 주소를 직접 금지하는 조문은 원문 확인 못 함 ⚪. 표기 "Maxar"→"Vantor" 갱신 | PD · 개발 |
| D3 | **OSM Overpass 공용 서버** | v1(여행 '명소') · 앱 | 🔴 | 상업 이용은 자체 또는 유료 Overpass 서버를 쓰라고 한다 — https://wiki.openstreetmap.org/wiki/Overpass_API (위키) · https://dev.overpass-api.de/overpass-doc/en/preface/commons.html | 하루 1회 Lambda 로 뽑아 S3 정적 파일로 바꾼다(`js/layers/travel.js:58`) | 개발 |
| D4 | **Gemini API — 18세 조항** | v1 · v2 "물어보기" · 앱 | 🔴 (변호사 확인) | 약관은 18세 미만이 쓸 가능성이 큰 서비스에서 API 사용을 막는다. 우리 가입 기준은 만 14세 이상이다 — https://ai.google.dev/gemini-api/terms | 셋 중 하나를 고른다: 성인 확인 계정에만 열기 / 약관이 다른 LLM 경로(예: Vertex AI — 적용 여부 ⚪) / 가입 연령 상향. 변호사 확인 | PD · 전문가 |
| D5 | **Gemini API — 유료 등급** | 같음 | 🟡 | 무료 등급은 입력을 제품 개선에 쓰고 사람이 검토할 수 있다. EEA·영국은 유료 등급만 허용 — 같은 URL | 키가 묶인 Google Cloud 프로젝트에 결제가 켜져 있는지 콘솔에서 확인한다(비밀값은 채팅에 붙이지 않는다) | PD |
| D6 | **스미소니언 GVP(화산)** | v1 · v2 · 앱 | 🔴 (저장소 기록) / ⚪ (공식 재확인) | 저장소 기록(`data-license.ko.md` §5, `billing.js:385`): 상업 이용에 사전 서면 허가가 필요하다. 공식 페이지 https://volcano.si.edu/gvp_termsofuse.cfm 은 오늘 403 | 허가를 받거나, 유료 앱에서 빼거나, 원천을 바꾼다(예: GeoNet CC BY 3.0 NZ) | PD |
| D7 | **YouTube 임베드** | v1(실시간 영상) · 앱 | (A) 🔴 · (B) 🟡 | "must not charge users to watch content in an embedded YouTube player" — https://developers.google.com/youtube/terms/developer-policies | (A)라면 외부 링크로 바꾼다. (B)라면 결제 뒤에 두지 않는다 | 개발 |
| D8 | **기상청 API허브 자료** | v1 · v2 · 앱 · 새 탭(특보·관측·지진 줄) | ⚪ | 문서 셋이 다르다. API허브 이용안내는 공공누리 유형별 조건을 따른다고 하나 유형 번호가 없다 — https://apihub.kma.go.kr/apiInfo.do · 약관 제13조 ③④(승인 없는 지식재산 이용·이용권 판매 금지) — https://apihub.kma.go.kr/policy.do · 기상자료개방포털은 수익이 있으면 사전 협의 — https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright · 기상청 누리집 저작권 정책은 공공누리 제1유형 — https://www.kma.go.kr/kma/guide/copyright.jsp | 기상청에 **서면으로** "유료 구독 서비스 화면에 출처와 함께 표시해도 되는가"를 묻는다. 회신 전에는 판매를 열지 않는다. API허브 약관 제11조의 '여러 아이디 호출 금지'와 앱별 키 분리 계획을 대조한다 | PD |
| D9 | **에어코리아** | v2 대기질 · v1 · 앱 | 🟡 | "출처표시, 변경금지 (제 3유형)" — https://www.data.go.kr/data/15073861/openapi.do | 측정소 값을 그대로 보여 주는 것은 괜찮아 보인다. 보간·지수 환산 화면이 있으면 '변경'인지 확인한다 ⚪. `data-license.ko.md` §5 에 에어코리아를 추가한다 | 개발 |
| D10 | **GDACS** | v2 태풍·재해 · 앱 | ⚪ | 공식 이용조건 PDF·소개 페이지에 CC BY 4.0 문장이 없다 — https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf | `data-license.ko.md` §5 의 CC BY 4.0 표기를 근거 없이 유지하지 않는다. JRC 에 문의한다. 공식 경보를 대체하지 않는다는 면책 문구는 화면에 둔다 | PD |
| D11 | **CelesTrak · MyMemory** | v1 위성 궤도 · 커뮤니티 번역 · 앱 | ⚪ | CelesTrak 이용 정책에 상업 재배포 문구가 없다 — https://celestrak.org/usage-policy.php · MyMemory 는 서비스를 "그대로 재판매"하는 것을 금지하고 제출 문장을 저장한다 — https://mymemory.translated.net/terms-and-conditions | 서면 확인하거나 교체한다. CelesTrak 브라우저 폴백(`config.js:92`)은 끈다. MyMemory 는 처리방침 국외이전에 넣는다 | PD · 개발 |
| D12 | **기타 확인 필요 원천** | 각각 | ⚪ | Himawari(NASA GIBS 경유, JMA 조건 적용 여부) · KHOA 이안류 등 4개 서비스 · KTO 나머지 서비스 · 산림청 산불위험예보 · OBIS · Argo · Met Office · EUMETSAT ASCAT · EMSC·BMKG·INMET · SSEC RealEarth 폴백 · GEBCO 해저지명 호스팅 · BigDataCloud(원문 429) · adsb.lol 향후 키 · `r-data-maps.md` §2-26 의 미판정 호스트 | 판매 전에 목록을 하나씩 닫는다. 판정 없음 ≠ 문제 없음 | 개발 · PD |
| D13 | **출처 표기 보강** | v2 · 앱 | 🟡 | AWS Terrain Tiles 원천 목록 — https://github.com/tilezen/joerd/blob/master/docs/attribution.md · ECMWF(CC BY) · Copernicus 문구 · NASA GIBS · SIMBAD · GEBCO · GEBCO 항해용 금지 | '정보·라이선스' 화면에 권장 문구를 그대로 싣는다(`r-data-maps.md` §4, `r-data-weather.md` 표 1) | 개발 |
| D14 | **일본 기상업무법** | v2 (일본 판매 시) | ⚪ | 외국 사업자는 국내 대표자를 지정해야 한다는 안내 — https://www.jma.go.jp/jma/kishou/minkan/kyoka.html | 처음에는 일본에 팔지 않거나, 일본 지역 예보를 가린다 | PD |
| D15 | 🟢 **문제 없음(출처 표기 조건)** | — | 🟢 | NOAA NWS·NHC·PTWC·GFS·GMGSI(https://www.weather.gov/disclaimer) · USGS · ECMWF Open Data · Copernicus 원천 · JMA 공공데이터 이용규약 · GEBCO 격자 · 서울 열린데이터 · KTO 15101972 · NASA(GIBS·사진, 보증 암시·로고 금지) · ESA/Webb·Hubble(크레딧 원문 그대로) · Natural Earth · Solar System Scope · Wikimedia(파일별) · Launch Library 2 · adsb.lol(ODbL) · CesiumJS·three.js·satellite.js(오픈소스 고지) · Supabase(Pro 이상 권장) | 표기만 지킨다. NASA 사진을 스토어 스크린샷·광고 소재로 쓰는 것은 ⚪ | 개발 |

### 1-5. 저장소 문서·코드가 사실과 다른 곳 (개정 대상 — 이번에 고치지 않았다)

| 파일 | 문제 | 할 일 |
|---|---|---|
| `prototype/legal/data-license.ko.md` §6 | "earthus 는 예보 기관이 아닙니다" — AGENTS.md 의 v2 제품 의도("v2 는 예보한다")와 모순 | v1·v2 로 나눠 개정한다 |
| `prototype/legal/data-license.ko.md` §5 | GDACS "CC BY 4.0", 기상청 "공공누리 제1유형"을 오늘 공식 문서로 확인하지 못함. 에어코리아 누락 | 확인 뒤 고친다 |
| `prototype/legal/README.md:24` | 위치정보 "2021년 개정 면제" → 실제는 개시 후 1개월 안 신고 유예 | 고친다 |
| `prototype/js/billing.js:389-393` | 판매 스위치가 Open-Meteo·GVP 둘만 본다 | 기상청 서면 확인 · 기상예보업 등록 · Esri 인증 · Gemini 연령/유료 등급 스위치를 더한다 |
| `prototype/js/billing.js:169-175` | COMMERCIAL_PLAN 이 "상업적 재배포·재가공 허용 범위 협의"를 판다. 제3자 원자료는 재허락 권한이 없다 | EARTHUS 가 계산한 자료로 한정한다(법무 확인) |
| `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-6 | 정부 정보 고지 누락 | P3 대로 고친다 |
| 처리방침 "국외 이전 없음" | Gemini 0건, Play 결제 붙으면 거짓 | L11 대로 고친다 |
| 약관 제9조 | 시험 사용 방법 없음 | L7 대로 고친다 |

---

## 2. 두 방식 비교 — (A) 설치 유료 앱 vs (B) 무료 앱 + v2 기간 이용권

| 기준 | (A) 설치할 때 결제 | (B) 무료 앱 + Play 결제 v2 이용권 |
|---|---|---|
| Play 정책 | 가능. 다만 Google 공식 문서 두 곳이 PWA 에는 **권하지 않는다**(ChromeOS PWA-in-Play, TWA 결제 문서) | 가능. Google 이 PWA/TWA 에 **권하는 방식** |
| PD 일정과의 관계 | "2027-01-01 까지 무료로 시험" 계획대로 먼저 무료로 내면 **`net.earthus.app` 은 (A)가 될 수 없다.** 새 패키지로 새 앱을 만들어야 한다 | 무료로 먼저 내고 나중에 결제를 붙이면 된다. 일정과 맞는다 |
| v1 무료 원칙 | 앱 하나에 v1+v2 를 담으므로 **v1 까지 돈을 받게 된다** — v1 이 무료 서비스라는 정의와 부딪친다 | v1 은 무료로 남는다 |
| 같은 내용이 웹에 무료 | 설치 뒤 브라우저에서 같은 화면을 무료로 보게 된다 → 환불·낮은 별점 위험(추정, 공식 통계 없음) | 해당 없음 |
| 유료 기능 보호 | 앱 설치 여부로만 갈린다. 웹은 열려 있으므로 결국 서버 등급 판정이 필요 → (B)와 같은 일을 하게 된다 | 서버 등급 판정(지시서 §3-5) |
| 청약철회 | 체험 수단이 없어 시행령 제21조의2 ④(정보 제공)에만 기대야 한다 — 불리 | v2 FREE 를 '체험용'으로 명시하면 ③ 충족 |
| 정기결제 30일 동의 | 해당 없음 | 기간 이용권(선불형)이면 대체로 해당 없음. 자동 갱신이면 해당 |
| 자료 라이선스 | v1 자료까지 모두 상업 이용. YouTube 임베드 🔴 | v2 자료가 직접 걸린다. Open-Meteo·Esri 는 "앱 단위"라 v1 도 걸릴 수 있다 ⚪ |
| 기상예보업 | 앱 전체가 유료 → v2 예보가 유료 상품의 일부 → 등록 필요 | v2 유료 영역에 예보가 있으면 등록 필요. 등록 전에는 유료 영역을 해석·관측·도구로 한정할 수 있다 |
| 수수료·부가세 | 차이 거의 없음 | 차이 거의 없음 |

**추천: (B) 무료 앱 + 앱 안 Play 결제 '선불형 기간 이용권'.** 이유는 다섯 가지다.
1. PD 가 이미 정한 일정(무료로 시험 → 2027-01-01 유료)은 (A)를 막는다. 무료로 한 번 낸 앱은 유료로 바꿀 수 없다.
2. v1 은 무료 서비스로 정의돼 있다. (A)는 v1 에도 값을 매긴다.
3. 현재 약관은 '자동 갱신 없는 기간 이용권'이다. Play 선불형이 그 모양 그대로이고, 가격 인상·전환 동의 문제가 대부분 사라진다.
4. 청약철회 제한에 필요한 '시험 사용'을 FREE 등급으로 채울 수 있다.
5. Google 자신이 PWA/TWA 에 이 방식을 권한다.

크롬 새 탭 확장은 **무료**로 둔다. CWS 는 결제를 대신 받지 않는다. 예보가 없으므로 기상예보업과도 무관하다. 남는 조건은 기상청 자료 조건(D8)과 출처 표기(L3)뿐이다.

---

## 3. 🔴 항목별 상세와 해결 경로

비용·기간 수치는 대부분 공식 출처로 확정하지 못했다. ⚪ 표시가 붙은 값은 견적이나 문의로 확인할 것.

### 3-1. L1 기상예보업 등록 (v2 유료의 관문)

- **무엇이 걸리나:** v2 의 GFS·ECMWF 5일 예보, Intelligence 확률(예: "51개 중 38개"). "미래의 기상상태를 예상하여 제공"에 해당할 가능성이 높다.
  - Intelligence '원인'(과거·현재 해석)은 예보가 아니다. 기상감정업은 특정 수요자 대상이라 대중 앱은 그 '업'이 아니다 → 상대적으로 낮은 위험 ⚪.
  - Simulation(가정 시나리오)은 불명확하다 ⚪.
- **등록 절차**(기상청 안내 https://www.kma.go.kr/kma/biz/biz_regist01.jsp)
  - 인력: 상근 기상예보사 1명 이상. 별표 1 원문은 열지 못했고, 다른 요약에는 "2명"이라는 표현도 있다 ⚪.
  - 시설: 사무실, 컴퓨터 1대 이상.
  - 등록 뒤 등록면허세를 낸다.
  - 처리기간: 기상청 안내는 5일, 정부24 는 5개월로 서로 다르다 ⚪.
  - 기상예보사 면허(제18조 제1항): 기상 분야 기술사, 또는 기사 + 2년 경력, 또는 기사 + 지정 교육과정.
  - 개인사업자 등록 가능 여부: 정책브리핑(2025-12-16)이 별표 개정을 안내했다. 현행 별표에 반영됐는지 ⚪ — https://www.korea.kr/multi/visualNewsView.do?newsId=148956552
- **길 셋(PD 결정)**
  - (가) 기상예보사를 확보해 등록하고 v2 를 유료로 판다. 등록해도 특보·항공·우주영향 예보는 여전히 할 수 없다.
  - (나) 등록 전까지 유료 영역을 해석·관측·데이터 도구·시뮬레이션(가정임을 명시)으로 한정한다. 예보·확률은 빼거나 무료로 둔다(과태료 위험은 남는다, L2).
  - (다) 등록된 국내 기상사업자와 제휴해 그 사업자의 예보를 출처와 함께 제공한다. 구조가 적법한지 ⚪.
- **비용·기간:** 기상예보사 인건비(상근)가 주 비용이다. 금액 ⚪. PD 일정(12월 등록)은 사람을 구했다는 전제 위에 있다.

### 3-2. L4 지진관측법 §16 (등록으로 풀리지 않음)

- 기상청 지진을 출처·시각과 함께 옮기는 것은 위험이 낮아 보이나 ⚪.
- JMA 지진 재전달은 불명확하다. 외국 기관의 관측 결과를 한국 공중에 '발표'하는 것으로 볼 여지가 있다.
- 쓰나미 도달시간 엔진(`aws/tsunami-eta`, SIMULATION_ONLY)을 **실제 사건에 대해** 보여 주거나 푸시하면 '지진해일 경보'와 구별이 어렵다 → 높은 위험.
- 유료 상업 상품은 '학문연구' 예외로 보기 어렵다. 유료화가 위험을 키운다.
- **해결 경로**
  - 실제 사건 도달시간은 표시·푸시하지 않는다. 가정 시나리오 화면에서만 보여 준다.
  - 기상청에 제16조 제2항(승인) 절차가 있는지, 외국 기관 지진 재전달이 해당하는지 서면 질의한다.
  - 확인 전까지 새 탭 확장의 지진 줄은 기상청 항목만 두는 것을 검토한다(PD 결정).

### 3-3. L5 위치기반서비스사업 신고 (이미 운영 중인 기능)

- "＋ 지금 내 위치" = 기기 측위 좌표 + 계정을 Supabase 에 저장한다 → 개인위치정보를 우리 시스템으로 전송한다.
- **길 A — 신고**
  - PD 가 소상공인·1인 창조기업이면 제9조의2 신고(상호·소재지·사업 종류·내용)를 한다.
  - 함께 할 일: 위치기반서비스 이용약관(제19조 항목), 위치 동의 흐름(지금 '위치(선택)' 동의는 실제로 아무것도 막지 않는다), 확인자료 자동 기록(제16조 제2항), 14세 미만 처리(제25조).
  - 이미 개시된 기능이라 1개월 기한을 넘겼을 수 있다 → 변호사에게 처리 방법을 묻는다.
  - 비용·기간 ⚪(방미통위 위치정보지원센터 안내 확인).
- **길 B — 기능 제거**
  - "지금 내 위치" 저장을 없애고 지도 중심 저장만 남긴다. 서버 저장 경로가 사라진다.
  - 앱을 열 때 브라우저가 BigDataCloud·Open-Meteo 로 좌표를 직접 보내는 흐름은 따로 판단이 필요하다 ⚪.

### 3-4. D1 Open-Meteo

- **대체 자료**
  - 대량 격자(기온·바람·강수·구름·기압)는 NOAA NOMADS GFS·ECMWF Open Data 로 옮긴다. 둘 다 상업 이용 OK(출처 표기)이고 수집기가 이미 있다.
  - 대기질 CAMS 를 직접 받으려면 ADS 계정과 라이선스 수락이 필요하다(PD 본인).
  - 파고는 GFS-Wave 0.25°가 JPEG2000 문제로 막혀 있다(작업 메모 기준 ⚪) → 해양은 대체가 가장 늦다.
- **유료 키**
  - Open-Meteo 블로그(2023)는 Standard 월 $29(100만 호출), Professional 월 $99(500만 호출)를 적었다. 3년 전 글이라 현재 금액 ⚪.
  - 현재 호출량(월 약 860만, air-ea 축소 뒤 약 330만)은 Professional 을 넘을 수 있다. 다중 지점 요청을 몇 회로 세는지 ⚪ → 견적 문의.
- **자체 운영:** 오픈소스 서버를 직접 운영하는 길도 있다(비용 ⚪).
- 결정은 R0 의 D-OM1~5(PD 결정 대기)와 같다.

### 3-5. D2 Esri 타일

- **길 1:** ArcGIS Location Platform 에 가입해 API 키로 전환하고 "Powered by Esri"를 표기한다. 코드 변경이 가장 적다.
  - 가격: "월 200만 타일 무료, 이후 1,000장당 $0.15"는 검색 요약에서만 봤다 ⚪.
  - 가입은 PD 가 직접 한다.
- **길 2:** v1 국경·지명은 Natural Earth(공개 도메인)로 그린다. 확대 위성은 NASA GIBS 고해상 층으로 바꾼다(해상도가 낮다, 층별 확인 ⚪).
- 어느 쪽이든 Esri 타일을 받아 구워 S3 에 올리지 않는다.

### 3-6. D3 Overpass 공용 서버

- '명소' POI 를 하루 1회 Lambda 로 뽑아 S3 정적 파일로 둔다. 해변·낚시·등산로를 이미 이 방식으로 만들었다.
- OSM 자료 자체(ODbL)의 "© OpenStreetMap contributors" 표기는 유지한다.
- 비용은 Lambda·S3 소액이다. 기간은 개발 작업 하나.

### 3-7. D4 Gemini 18세 조항

- 조항은 개발자 나이가 아니라 **앱 이용자층**에 관한 것이다. 누구나 여는 지구 앱은 18세 미만이 접근할 가능성이 크다.
- **길**
  - '물어보기'를 성인 확인 계정에만 연다.
  - 약관이 다른 LLM 경로로 옮긴다(Vertex AI 등 — 조항이 다른지 ⚪).
  - 가입 연령을 18세로 올린다.
- 어느 길이든 유료 등급(D5)은 따로 필요하다. 변호사 확인이 필요하다.

### 3-8. D6 스미소니언 GVP

- 서면 허가를 요청하거나(비용·기간 ⚪), 유료 앱에서 뺀다.
- 원천을 바꿀 수도 있다: 각국 기관 원자료(예: GeoNet CC BY 3.0 NZ).

### 3-9. D7 YouTube 임베드 ((A)를 고를 때만)

- 유료 앱 안에서는 임베드 대신 "YouTube 에서 보기" 외부 링크로 바꾼다.
- (B)에서는 v1 영상을 결제 없이 보이게 두면 된다 ⚪.

---

## 4. 🟡 항목별 체크리스트

**앱 출시(무료, `SALES_OPEN=false` 유지) 전**
- [ ] Play 등록정보·앱 안 출처 화면·CWS 설명에 '정부 기관과 무관' 문장과 기상청·JMA·NOAA URL (P3)
- [ ] 약관·처리방침 자리표시자 3곳(주소·전화·신고번호) 채우기 (L6)
- [ ] Play 계정 정보에 사업자번호·통신판매 신고번호·신고 기관 (L6)
- [ ] 처리방침 국외이전 개정: Gemini·AWS 오하이오·Supabase 리전·알림 지점 좌표·MyMemory (L11)
- [ ] 기상청 자료 출처가 빠진 화면 점검 (L3)
- [ ] 자체 판단 경고·특보형 문구·푸시가 없는지 점검. 이안류는 기관 등급 그대로 (L2)
- [ ] 앱 안에서 토스 결제창이 뜨지 않게 하는 판정을 첫 출시부터 넣기 (P1)
- [ ] **Console 에서 앱을 만들기 전에 (A)/(B) 최종 결정** (P2)
- [ ] Play 대상 연령 설정을 가입 기준(만 14세)·Gemini 조항과 맞추기 (D4)
- [ ] 출처 표기 보강: Terrarium 원천 목록, "Powered by Esri", Esri "Vantor", GEBCO·NASA GIBS·SIMBAD·Copernicus 문구 (D13)

**판매 개시(`SALES_OPEN=true`) 전**
- [ ] 결제 프로필 '대한민국 세금 정보'에 사업자등록번호 — **첫 판매 전** (T2)
- [ ] W-8BEN 제출, 과세유형·업종코드 확인, 세무사 상담 (T4)
- [ ] 판매 국가는 처음엔 한국만 (T3 · D14)
- [ ] 상품 형태를 Play **선불형 기간 이용권**으로(약관 유지). 자동 갱신이면 약관 제8조 전면 개정 + 30일 동의 절차 (L9)
- [ ] 약관 제9조에 시험 사용(FREE = 체험용) 명시, 미성년자 취소권 고지 (L7)
- [ ] 3~7일째 철회는 Console 환불로 처리하는 운영 절차, 환불 시 서버 권한 회수 (L8)
- [ ] 결제 UI 다크패턴 점검(총액 표시·기본 체크 없음·버튼 차별 없음·앱 안 해지·반복 팝업 없음) (L10)
- [ ] 구매 확인(acknowledge)을 서버에서 3일 안에. Bubblewrap Play 결제 현행 설정 재확인 (P4)
- [ ] Gemini 유료 등급 확인 (D5)
- [ ] 에어코리아 값을 가공하는 화면 점검 (D9)
- [ ] `billing.js` 판매 스위치 추가(기상청·예보업 등록·Esri·Gemini), COMMERCIAL_PLAN 문구 한정 (§1-5)
- [ ] ⚪ 원천(D8·D10·D11·D12) 하나씩 닫기

---

## 5. 전문가 확인이 필요한 질문 (그대로 보낼 수 있는 문장)

### 5-1. 변호사 (기상·IT·소비자)
1. 외국 수치모델(GFS·ECMWF) 결과를 모델 이름·실행 시각과 함께 그대로 보여 주는 것이 기상법 제2조 제9호의 "예보"에 해당합니까? 유료로 제공하면 기상산업진흥법 제26조 제2항 제1호가 적용됩니까? 무료로 공개하는 지금도 제17조·제51조가 적용됩니까?
2. 앙상블 멤버 비율로 계산한 확률("51개 중 38개")을 보여 주는 것, 과거·현재 원인 해설, 가정 시나리오(Simulation)는 각각 예보·기상감정·기상컨설팅 중 무엇입니까? 기상예보업 등록이 이 셋을 모두 덮습니까?
3. JMA·NHC 태풍 공식 진로 인용, NOAA SWPC 오로라 예보 재전달(제14조의3 제1항), 국립해양조사원 이안류 등급 재전달은 각각 어떤 성격입니까?
4. 기상청·JMA 지진 정보를 출처와 함께 재전달하는 것, 쓰나미 도달시간을 가정 시나리오로 보여 주는 것은 지진관측법 제16조에 해당합니까?
5. 기기 측위 좌표를 계정과 함께 서버에 저장하는 알림 지점 기능은 위치기반서비스사업 신고 대상입니까? 이미 운영한 기간은 어떻게 처리합니까? 앱이 브라우저에서 제3자(BigDataCloud·Open-Meteo)로 좌표를 직접 보내는 것은 어떻습니까?
6. 약관 제9조를 "FREE 등급 = 체험용 디지털콘텐츠"로 고치면 전자상거래법 제17조 제6항 단서를 충족합니까? 기간 이용권은 가분적 디지털콘텐츠입니까? Play 48시간 환불과 법정 7일은 어떻게 맞춥니까?
7. 창립 멤버 "언제나 정가의 50%"(약관 제8조 제7항)는 Play 가격 인상 규칙(옵트인·기존 가격 유지), 자동 갱신 시 제13조 제6항과 충돌합니까?
8. Play 거래에서 PD 와 Google 의 법적 지위(판매자/중개자)는 무엇이며, Play 영수증 메일로 계약서면 교부 요건이 충족됩니까?
9. Gemini 로의 질문 문장 이전은 개인정보 보호법 제28조의8 제1항 제1호(동의)와 제3호(위탁·처리방침 공개) 중 무엇으로 해야 합니까?
10. Gemini 약관의 "18세 미만이 접근할 가능성이 큰 서비스" 조항이 만 14세 이상 가입 앱에 적용됩니까? 유료 등급·Vertex AI 에서도 같습니까?
11. Esri 옛 주소(server/services.arcgisonline.com)를 인증 없이 쓰는 것이 수익 앱에서 허용됩니까? MyMemory "그대로 재판매" 금지가 앱 안 기능에 해당합니까? NASA 사진을 스토어 스크린샷·광고에 써도 됩니까?
12. `billing.js` COMMERCIAL_PLAN 의 "상업적 재배포·재가공 허용 범위 협의" 문구는 제3자 원자료에 대해 문제가 됩니까?
13. 일본 사용자에게 판매할 때 2026-05-29 개정 기상업무법의 영향은 무엇입니까? 해외 판매 시 EU 거래자(DSA) 신고가 필요합니까?

### 5-2. 세무사
1. Play 한국 판매의 과세표준은 결제액 × 100/110(수수료 차감 전)이 맞습니까? 근거 예규는 무엇입니까?
2. Play 매출의 공급시기는 결제일·정산일·입금일 중 무엇입니까? 기간 이용권 선수금을 기간에 나눠 인식해야 합니까?
3. 해외 판매 영세율 근거는 부가가치세법 제22조와 제24조 + 시행령 제33조 중 무엇입니까(Google = 대리인 구조 전제)? 첨부서류로 외화입금증명서가 필요합니까?
4. 사업자번호를 늦게 넣어 Google 이 수수료에 붙인 10%는 돌려받을 수 있습니까? Google 수수료의 필요경비 증빙은 해외 인보이스로 충분합니까?
5. 간이과세와 일반과세 중 어느 쪽이 유리합니까? 간이 배제 기준(시행령 제109조 제2항 제9호)에 걸립니까?
6. 업종코드는 722000 과 724000 중 무엇으로 합니까? 현금영수증 가맹 의무(별표 3의2)가 있습니까?
7. 외화 수입의 원화 환산 기준일은 언제입니까? 창업중소기업·중소기업 특별세액감면에 해당합니까?
8. 약관 제8조 제4항("부가세 포함 표시")을 해외 영세율 판매에도 그대로 둬도 됩니까?

### 5-3. 기상청 서면 질의 (기상산업정책 담당 · API허브 운영 · 예보정책과 02-2181-0496 — 법령 머리 표기)
1. API허브 자료를 유료 구독 서비스 화면에 출처와 함께 표시해도 됩니까? 기상자료개방포털의 "수익 시 사전 협의" 문구, API허브 약관 제13조와의 관계를 알려 주십시오. 자료별 공공누리 유형 번호도 알려 주십시오.
2. 기상예보업 등록의 현행 인력 기준(별표 1: 상근 기상예보사 1명인지 2명인지), 개인사업자 등록 가능 여부, 처리기간을 알려 주십시오.
3. 외국 수치모델 결과를 모델 이름과 함께 보여 주는 것이 등록 대상 '기상예보'입니까?
4. 지진관측법 제16조 제2항의 승인 절차가 있습니까? 외국 기관 지진 정보를 재전달하는 것이 해당합니까?

### 5-4. 기타 기관 문의
- **방미통위 위치정보지원센터:** 알림 지점 저장의 신고 대상 여부와 늦은 신고 절차
- **과기정통부·중앙전파관리소:** 개인사업자의 부가통신 '자본금 1억원 이하' 판정 방식
- **Open-Meteo:** 다중 지점 요청 과금 단위, 같은 도메인 무료 서비스(v1)의 상업 플랜 필요 여부, 현재 호출량 견적
- **Esri:** 옛 주소 무인증 사용의 상업 조건, Location Platform 가격
- **스미소니언 GVP:** 유료 앱 안 화산 목록·주간 보고 표시 허가
- **EC JRC(GDACS):** 이벤트 API 라이선스 근거 문서
- **CelesTrak · MyMemory:** 유료 앱 안 사용의 서면 확인

### 5-5. PD 가 직접 확인할 것
- 상근 기상예보사를 12월까지 둘 수 있는가(본인 자격 또는 고용) — 유료 2027-01-01 일정이 여기에 달려 있다
- Play Console 에서 앱을 만들기 전에 (A)/(B) 결정
- 결제 프로필의 지급 통화(KRW/USD)·지급 법인, 계정 유형(개인/조직)
- 사업자등록증의 과세유형·업종코드·개업일
- Gemini 키가 묶인 프로젝트의 결제 활성 여부
- 해외·일본 판매를 첫날부터 열지
- 2026-12-31 전에 Google 의 한국 새 수수료 체계(청구 수수료율·대체결제 감액) 공지 재확인

---

## 6. 출처 목록 (모두 2026-09-24 읽음)

**법령 — 국가법령정보센터 현행**
- 기상법 [시행 2026-09-18] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284327&efYd=20260918 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=289709&efYd=20260918
  - `r-data-weather.md` 가 쓴 2025-09-26 PDF 판은 이 현행판으로 대체한다. 그 보고서의 "현행 여부 확인 필요" 표시는 이것으로 해소된다.
- 기상산업진흥법 [시행 2026-03-26] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=270217&efYd=20260326 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284593&efYd=20260326
- 지진·지진해일·화산의 관측 및 경보에 관한 법률 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=268815&efYd=20260201 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=281745&efYd=20260102
- 위치정보법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=277359&efYd=20251001 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283269&efYd=20260210
- 전자상거래법 [시행 2026-07-21] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=282793&efYd=20260721 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=288143&efYd=20260721
- 콘텐츠산업 진흥법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=268753&efYd=20260201
- 개인정보 보호법 [시행 2026-09-11] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283839&efYd=20260911
- 전기통신사업법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286079&efYd=20260519 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=285721&efYd=20260428
- 부가가치세법·시행령, 소득세법 시행령 https://www.law.go.kr/법령/부가가치세법 · https://www.law.go.kr/법령/부가가치세법시행령 · https://www.law.go.kr/법령/소득세법시행령

**정부 기관 안내**
- 기상청 기상사업자 제도 https://www.kma.go.kr/kma/biz/biz_intro01.jsp · 등록 안내 https://www.kma.go.kr/kma/biz/biz_regist01.jsp · 저작권 정책 https://www.kma.go.kr/kma/guide/copyright.jsp
- 정책브리핑 기상사업 등록기준 정비(2025-12-16) https://www.korea.kr/multi/visualNewsView.do?newsId=148956552
- 정부24 기상사업 등록 https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A02004&CappBizCD=13600000003&tp_seq=01
- 공공누리 https://www.kogl.or.kr/info/license.do
- 위치정보지원센터 https://www.lbsc.kr/front/content/contentViewer.do?contentId=CONTENT_0000081
- 국세청 현금영수증 https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2470&cntntsId=7795
- 기상청 API허브 https://apihub.kma.go.kr/apiInfo.do · 약관 https://apihub.kma.go.kr/policy.do · 기상자료개방포털 저작권 https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright
- 공공데이터포털 이용정책 https://www.data.go.kr/ugs/selectPortalPolicyView.do · 에어코리아 https://www.data.go.kr/data/15073861/openapi.do · KHOA https://www.data.go.kr/data/15155516/openapi.do · KTO https://www.data.go.kr/data/15101972/openapi.do · 서울 https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do

**Google Play · Chrome**
- 가격(무료↔유료) https://support.google.com/googleplay/android-developer/answer/6334373
- 판매자 등록 국가 https://support.google.com/googleplay/android-developer/answer/9306917 · 지급 https://support.google.com/googleplay/android-developer/answer/137997
- 한국 개발자 추가 정보 https://support.google.com/googleplay/android-developer/answer/3255733?hl=ko
- 세율·부가세 https://support.google.com/googleplay/android-developer/answer/138000 (ko·en) · 세금 의무 https://support.google.com/googleplay/android-developer/answer/16408159 · W-8BEN https://support.google.com/googleplay/android-developer/answer/7161649 · 원천징수 https://support.google.com/googleplay/android-developer/answer/9384608?hl=ko · https://support.google.com/paymentscenter/answer/10349995
- 수수료 https://support.google.com/googleplay/android-developer/answer/112622 · 새 체계 https://support.google.com/googleplay/android-developer/answer/16954621
- 환불(사용자) https://support.google.com/googleplay/answer/15574908 · 주문 관리(개발자) https://support.google.com/googleplay/android-developer/answer/2741495
- 개발자 배포 계약 https://play.google/developer-distribution-agreement.html · Play 서비스 약관(한국) https://play.google.com/intl/ALL_kr/about/play-terms/
- 스팸·최소 기능 https://support.google.com/googleplay/android-developer/answer/9899034 · 기만 행위 https://support.google.com/googleplay/android-developer/answer/9888077 · 정부 정보 앱 https://support.google.com/googleplay/android-developer/answer/9514050
- 결제 정책 https://support.google.com/googleplay/android-developer/answer/9858738 · 해설 https://support.google.com/googleplay/android-developer/answer/10281818 · 앱 안 상품 https://support.google.com/googleplay/android-developer/answer/1153481 · 구독 정책 https://support.google.com/googleplay/android-developer/answer/9900533
- Play Billing 가격 변경 https://developer.android.com/google/play/billing/price-changes · 구독 수명주기 https://developer.android.com/google/play/billing/lifecycle/subscriptions
- PWA in Play https://developers.google.com/chromeos/app-development/publish/pwa-in-play · TWA Play 결제 https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing (문서 2021)
- CWS 결제 종료 https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md · CWS 정책 https://developer.chrome.com/docs/webstore/program-policies/policies

**자료·서비스 약관**
- Open-Meteo https://open-meteo.com/en/terms · https://open-meteo.com/en/pricing · 블로그(2023, 금액 참고만) https://openmeteo.substack.com/p/api-subscriptions-for-commercial
- NWS https://www.weather.gov/disclaimer · USGS https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits · NASA Earthdata https://earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance · NASA 미디어 https://www.nasa.gov/nasa-brand-center/images-and-media/ · GIBS https://nasa-gibs.github.io/gibs-api-docs/
- ECMWF https://www.ecmwf.int/en/forecasts/datasets/open-data · Copernicus https://apps.ecmwf.int/datasets/licences/copernicus/
- JMA https://www.jma.go.jp/jma/kishou/info/coment.html · 予報業務許可 https://www.jma.go.jp/jma/kishou/minkan/kyoka.html
- GDACS https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf · GEBCO https://www.gebco.net/data-products/gridded-bathymetry-data · 해저지명 https://www.gebco.net/data-products/undersea-feature-names
- Esri E300 https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf · 개발자 FAQ https://developers.arcgis.com/documentation/mapping-and-location-services/faq/ · World Imagery 항목 https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9?f=json
- Overpass https://wiki.openstreetmap.org/wiki/Overpass_API · https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- AWS Terrain Tiles https://registry.opendata.aws/terrain-tiles/ · joerd https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- Natural Earth https://www.naturalearthdata.com/about/terms-of-use/ · Solar System Scope https://www.solarsystemscope.com/textures/ · ESA/Webb https://esawebb.org/copyright/ · ESA/Hubble https://esahubble.org/copyright/ · SIMBAD https://simbad.cds.unistra.fr/simbad/
- Launch Library 2 https://thespacedevs.com/llapi · CelesTrak https://celestrak.org/usage-policy.php · adsb.lol https://www.adsb.lol/docs/open-data/api/
- YouTube 개발자 정책 https://developers.google.com/youtube/terms/developer-policies · Gemini API 약관 https://ai.google.dev/gemini-api/terms · MyMemory https://mymemory.translated.net/terms-and-conditions · Supabase https://supabase.com/pricing
- GeoNet https://www.geonet.org.nz/policy · 대만 https://data.gov.tw/license · Met Office https://datahub.metoffice.gov.uk/pricing/site-specific

**비공식(방향 참고만, 사실 근거로 쓰지 않음)**
- 이데일리 2026-07-01(기상청 허위 기상정보 단속 보도) https://edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02663366645510256 — "해외 모델 재전달 단속"은 기사 원문에 없음, 미확인
- 정부 정보 고지 반려 사례(개인 블로그 2021) https://vtsen.hashnode.dev/how-to-resolve-missing-clear-source-of-information-disclaimer-app-rejection
- 세무 칼럼 https://www.taxwatch.co.kr/article/tax/2022/05/16/0002 · https://www.findsemusa.com/service/consult/consultView.do?qidx=24135 · 업종코드 https://upjong.co.kr/business-code/upjong-722000/

**열지 못한 곳 (⚪ 항목의 원인)**
- volcano.si.edu(403) · eumetsat.int(403) · Esri 블로그 2편(403)·가격 페이지(빈 본문) · tsunami.gov 고지(오류) · opendata.cwa.gov.tw(연결 오류) · emsc-csem.org(404) · BigDataCloud(429)
- 기상산업진흥법 시행령 별표 1, 기상법 시행령 별표 5, 부가가치세법 시행령 제101조 첨부 표(파일·이미지)
- 국세법령정보시스템 예규 원문 · 기상청 2026-06~07 단속 보도자료 원문 · API허브 출처표기 안내 PDF

**저장소 근거**
- AGENTS.md · docs/HANDOVER.md §8(유료 시작 2027-01-01, 기상사업자 등록 12월)
- docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-3~3-6 · docs/APP-DATA-COLLECTION-INVENTORY-2026-09-24.md · docs/APP-PD-CHECKLIST-2026-09-24.md · docs/APP-STORE-LISTING-DRAFT-2026-09-24.md
- docs/R0-OPEN-METEO-AUDIT-2026-09-20.md · docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md · docs/FOUNDING-500.md
- prototype/legal/terms.ko.md 제8·9조 · prototype/legal/data-license.ko.md · prototype/legal/README.md
- prototype/js/billing.js · ui-alerts.js · push.js · supabase/functions/push-tick/index.ts · v2-three/js/main.js · apps/chrome-newtab/feeds.js
- 하위 보고서: build/paid-app-review/r-play.md · r-law.md · r-data-weather.md · r-data-maps.md · r-tax.md

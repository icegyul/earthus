# PD 할 일 목록 — 안드로이드 앱 · 크롬 새 탭 출시 준비 (2026-09-24)

> 앱 지시서 `docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md` 의 **PD 몫**만 순서대로 모았다.
> PD 결정(2026-09-24): **개인사업자** · 구독료·앱 안 결제(Phase 2)는 **보류** · 나머지 기본값은 지시서 추천(D3·D4 B·D5 포함·D6·D8 제외·D9·D11·D12·D13 나중·D15 `/Intelligence`·D16·D17·D18).
> 각 항목: **왜 → 어떻게(정확한 명령·주소) → 됐는지 보는 법(눈에 보이는 결과)**. 명령은 Git Bash, 저장소 루트 기준.
> 이 문서의 어떤 명령도 개발 세션이 대신 실행하지 않았다(운영 변경·배포·계정 개설은 PD 손 — AGENTS.md, 기억 `never-run-deploy-to-test`).
> 표기: **(UNVERIFIED)** = 공식 출처로 확인하지 못한 것. 사실처럼 쓰지 않는다. 읽은 날짜는 모두 2026-09-24.

---

## 0. 먼저 — 계정 유형 조사 결과와 추천 (항목 7 연구)

### 0-1. 확인된 사실 (공식 문서)

| # | 사실 | 출처 (2026-09-24 읽음) |
|---|---|---|
| F1 | Play **조직** 계정은 D-U-N-S 번호 없이는 만들 수 없다. 발급에 **최대 30일**. 결제 프로필의 법적 이름·주소가 D&B 기록과 같아야 한다 | https://support.google.com/googleplay/android-developer/answer/13628312 |
| F2 | 스토어에 공개되는 정보 — **조직:** 법적 이름·법적 주소·개발자 이메일·전화. **개인:** 법적 이름·국가·이메일, **수익화(유료 판매)하면 전체 주소도 공개** | answer/13628312 |
| F3 | 12명·14일 비공개 테스트 의무는 "2023-11-13 이후 만든 **개인** 개발자 계정"에만 적힌다. 조직 계정 면제라는 문장은 **없다**(사실상 대상 아님) | https://support.google.com/googleplay/android-developer/answer/14151465 |
| F4 | **개인 → 조직 전환이 된다**(조직 유형 결제 프로필을 새로 만들어 인증·연결). **조직 → 개인은 안 된다** | https://support.google.com/googleplay/android-developer/answer/13634888 |
| F5 | 계정 유형 설명: 개인 = 학생·취미·아마추어 등 개인 용도 / 조직 = 상업·직업 활동을 하는 조직·사업. 두 유형 모두 같은 기능(수익화 포함). **'개인사업자(sole proprietor)'를 어느 쪽으로 하라는 문장은 없다** | https://support.google.com/googleplay/android-developer/answer/13634885 |
| F6 | Play 등록비 US$25, 1회 | answer/6112435 (지시서 §3-6, verify-policy §1) |
| F7 | Apple 은 개인사업자에게 "개인으로 등록하라"고 하고 DBA·상호는 법인으로 받지 않는다 — **Apple 규칙이지 Google 규칙이 아니다.** Apple 경유 D-U-N-S 요청은 무료, D&B 처리 최대 5영업일 | https://developer.apple.com/support/D-U-N-S/ |
| F8 | Chrome 웹 스토어 등록비: 공식 문서는 "one-time registration fee" 만 쓰고 **금액 없음** | https://developer.chrome.com/docs/webstore/register |
| F9 | CWS 계정 이메일은 만든 뒤 바꿀 수 없다 | 같은 문서 |
| F10 | CWS 는 모든 개발자에게 거래자/비거래자 스스로 선언을 요구한다(EU 소비자법·DSA). 거래자 정보(법적 이름·전화·주소)는 **등록정보 아래에 공개**된다. 개인 거래자 인증에 D-U-N-S 는 지금 필요 없고 SMS 되는 전화가 필요 | https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure · https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq |

### 0-2. 확인하지 못한 것 (UNVERIFIED)

| # | 무엇 | 지금 아는 것 |
|---|---|---|
| U1 | **한국 개인사업자가 Play 조직 계정 인증을 통과하는가** | 공식 문장 없음(F5). 제3자 사례: 일본 개인사업자가 상호로 조직 계정을 받은 기록(note.com, 2026-06-07 글 — D-U-N-S 무료·1~2주, 가상 사무실로 공개 주소 대체), 한국 블로그(uxdev.org, 2026-03-06 — "개인사업자도 가능, 결제 프로필과 D&B 이름·주소를 글자 단위로 맞출 것"). 공식 확인 아님 |
| U2 | 한국 개인사업자 D-U-N-S 발급 경로·비용 | D&B 표준 요청은 무료라는 D&B·Apple 안내(F7). 한국 D&B 파트너 NICE D&B(https://global.nicednb.com/servDunsApply01.do) 신청 페이지는 이번에 본문을 읽지 못함 → 비용·기간 **UNVERIFIED**. Apple 경로는 Apple 이 개인사업자를 법인으로 받지 않아(F7) **막힐 수 있다** |
| U3 | 조직 계정의 12명·14일 면제 | 문장 없음(F3) — 사실상 면제로 보는 것이 일반적 |
| U4 | CWS 등록비 금액 | 제3자 글은 US$5. 결제 화면 금액이 정답 |
| U6 | Play Console 의 EU 거래자(DSA) 신고 화면과 공개 항목 | 공식 도움말을 찾지 못함(검색된 answer/14177239 는 계정 인증 문서였다). 공개 항목은 F2(answer/13628312)만 확인 |
| U5 | 개인사업자가 CWS 에서 '거래자'인가 | EU 정의("자기 사업 목적으로 행동")상 유료 v2 로 이어지는 확장이면 거래자일 가능성이 높다 — **법무 판단** |

### 0-3. 추천 — **조직(Organization) 계정을 목표로, 첫날 D-U-N-S 신청. 막히면 개인 계정으로 시작하고 판매 전 조직으로 전환**

이유(확실한 것부터):
1. **어차피 주소는 공개된다.** 나중에 구독을 팔면 개인 계정도 전체 주소가 공개된다(F2). 전자상거래법상 통신판매업자 정보(상호·대표자·주소·전화·사업자번호·신고번호)도 화면에 표시해야 한다(`prototype/legal/README.md:69-78`). 그래서 '주소 비공개'는 개인 계정을 고를 이유가 못 된다.
2. **판매자 이름이 사업자와 맞는다.** 조직 계정이면 스토어·결제 프로필의 판매자가 상호가 된다 — 약관·처리방침·통신판매업 표시와 한 이름이다.
3. **12명·14일 테스트를 피할 가능성**(F3·U3). PD 가 안드로이드 사용자 12명을 14일 붙잡아 두는 일이 사라진다.
4. **되돌릴 길이 있다.** 조직 인증이 막히면 개인으로 시작해도 나중에 조직으로 옮길 수 있다(F4). 반대(조직→개인)는 안 되지만 필요 없다.

대가: D-U-N-S 가 최대 30일(F1) — **첫날 신청**해야 병목이 안 된다. 개인사업자 인정 여부가 공식 문장으로 확인되지 않았다(U1).

결정 규칙: 안드로이드 셸(Phase 1)의 첫 AAB 가 준비되는 날(지시서 추정 2주)에
- D-U-N-S 가 나와 있으면 → 조직 계정 개설(항목 3-A)
- 아직이면 → 개인 계정 개설(항목 3-B) + 테스터 12명 비공개 테스트 시작, D-U-N-S 가 나오면 판매 전 조직 전환(F4)

**크롬 웹 스토어:** 개인사업자 명의로 개설, 거래자(Trader)로 선언하는 쪽을 초안 추천 — 공개되는 정보(이름·전화·주소)는 위 1번과 같은 이유로 어차피 공개 대상이다. 최종 판단은 법무(U5).

> 참고(추정): 현행 처리방침의 사업자등록번호(`privacy.ko.md:14`) 가운데 두 자리 `03` 은 국세청 번호 체계상 개인 과세사업자 구간(01~79)에 든다 — PD 가 말한 '개인사업자'와 맞는다. 공식 확인은 사업자등록증으로.

---

## 1. 사업자 정보 확정 — 가장 먼저

- **왜:** 처리방침·계정 삭제 페이지·스토어 판매자 정보·D-U-N-S 신청이 전부 이 값을 쓴다. 게다가 **저장소 문서끼리 말이 다르다:**
  - `prototype/legal/README.md:62` — 통신판매업 신고 "✅ 보유"
  - `prototype/legal/privacy.ko.md:15-17` — 주소 "통신판매업 신고 시 확정", 신고번호 "신고 후 기재"
  - 지시서 §2-1 사업자 상태 행 · HANDOVER §8 — "통신판매업 신고 전"
  - 개발은 어느 쪽이 맞는지 알 수 없다. 고르지 않았다.
  - (2026-09-24 PD 답) **신고 완료.** `legal/README.md` 의 '보유'가 맞고, 지시서·HANDOVER 의 '신고 전'은 옛 기록이다. 신고번호는 PD 가 처리방침 초안 `{{통신판매업 신고번호}}` 칸에 직접 넣는다(채팅·커밋에 안 적어도 된다).
- **어떻게:** 사업자등록증과 통신판매업 신고증을 본다. 신고가 됐는지는 공정거래위원회 사이트(ftc.go.kr)의 통신판매사업자 정보공개에서 사업자등록번호로 조회한다(메뉴 이름은 사이트 개편에 따라 다를 수 있다). 채울 값 6개: 상호 · 대표자 · 사업자등록번호 · 사업장 주소 · 전화 · 통신판매업 신고번호.
  - 사업장 주소가 집이면 그 주소가 스토어·법적 페이지에 공개된다(0-3). 바꾸려면 사업자등록 주소 변경(비상주 사무실 등)을 **D-U-N-S 신청 전에** 끝낸다 — D&B·결제 프로필·사업자등록 주소가 같아야 한다(F1).
- **확인:** 6개 값이 한 줄로 적혀 있고, 정보공개 조회 화면에 신고번호가 뜬다. 뜨지 않으면 신고부터 한다(판매·처리방침 완성이 여기에 걸린다 — 지시서 D19).

## 2. D-U-N-S 신청 (첫날 — 0-3 추천을 따를 때)

- **왜:** Play 조직 계정의 전제(F1). 최대 30일.
- **어떻게:** ① D&B 조회 https://www.dnb.com/en-us/smb/duns/duns-lookup.html 에서 영문 상호·주소로 이미 번호가 있는지 본다 ② 없으면 무료 요청 https://www.dnb.com/en-us/smb/duns/get-a-duns.html (또는 한국 파트너 NICE D&B — 비용 **UNVERIFIED**, 결제 전 금액 확인) ③ 영문 상호·주소 표기를 사업자등록증과 **글자 단위로** 맞춰 적어 두고, 나중에 Google 결제 프로필에 똑같이 쓴다.
- **확인:** 9자리 D-U-N-S 번호가 이메일로 오고, D&B 조회에서 상호·주소가 사업자등록증과 같게 나온다.

## 3. Google Play 개발자 계정 개설

- **왜:** 앱을 올릴 곳. 계정 이메일·패키지명(`net.earthus.app`)은 사실상 바꾸기 어렵다(패키지명은 영구 — answer/9859152).
- **어떻게:** https://play.google.com/console/signup · 등록비 US$25(F6, PD 카드로 직접 — 결제 정보를 개발 세션에 주지 않는다).
  - **3-A 조직:** 계정 유형 Organization → 결제 프로필(조직) 이름·주소 = D&B 와 동일 → D-U-N-S 입력 → 조직 인증 서류(사업자등록증 등).
  - **3-B 개인:** 계정 유형 Personal → 신원 인증 → Play Console 앱으로 **안드로이드 10+ 실기기 인증**(answer/14316361).
  - 공통: 연락처 이메일·전화는 일회용 비밀번호로 인증(answer/13628312). 계정 전용 이메일을 쓰면 나중에 사람이 바뀌어도 편하다.
- **확인:** Play Console 에 로그인되고 '앱 만들기' 단추가 눌린다. 3-A 는 조직 인증 '완료' 표시, 3-B 는 기기 인증 '완료' 표시.

## 4. 업로드 키 만들기·보관

- **왜:** AAB 를 올릴 때 서명하는 키. 앱 서명 키는 Google 이 보관하고(Play App Signing, 하이브리드 서명 키 3개), 개발자는 **업로드 키만** 가진다. 잃어버려도 재설정 절차가 있지만 번거롭다(answer/9842756, 지시서 §3-6).
- **어떻게:** 안드로이드 스트림이 만든 스크립트가 `apps/android-twa/` 에 있으면 그것을 쓴다. 없으면 아래 한 줄(JDK `keytool`). 키스토어는 **저장소 밖** `%USERPROFILE%\.earthus-android\` 에만 둔다. 비밀번호는 명령에 쓰지 말고 프롬프트에 직접 친다.
  ```bash
  mkdir -p "$USERPROFILE/.earthus-android"
  keytool -genkeypair -v -keystore "$USERPROFILE/.earthus-android/earthus-upload.jks" \
    -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=EARTHUS, O={{상호 영문}}, C=KR"
  keytool -list -v -keystore "$USERPROFILE/.earthus-android/earthus-upload.jks" -alias upload | grep -i "SHA256:"
  ```
  - 백업 두 곳(예: 암호화 USB + 개인 클라우드 금고). 비밀번호는 비밀번호 관리자에만.
- **확인:** 마지막 줄이 `SHA256: AA:BB:…` 지문 한 줄을 출력한다(이 지문은 비밀이 아니다 — assetlinks 에 들어간다). `git -C "D:/## APP/EARTHUS v2_APP" status --ignored` 에서 `.jks` 가 **보이지 않거나 ignored 로만** 나온다(지시서 Phase 1 기준 13).

## 5. assetlinks.json 올리기 (두 번)

- **왜:** 이게 없으면 앱이 주소창 달린 Custom Tab 으로 떨어진다(지시서 R5). 지금 운영은 403(파일 없음).
- **어떻게 — 1차(ADB 시험용, 업로드 키 지문만):** 저장소 밖에 파일을 만든다.
  ```bash
  mkdir -p build/app-build
  cat > build/app-build/assetlinks.json <<'EOF'
  [{"relation":["delegate_permission/common.handle_all_urls"],
    "target":{"namespace":"android_app","package_name":"net.earthus.app",
      "sha256_cert_fingerprints":["{{업로드 키 SHA256 — 항목 4 출력}}"]}}]
  EOF
  # (2026-09-24 적대적 검토 정정) 목적지 버킷을 고정하지 않고 CloudFront 기본 동작이 **지금** 보는 원본으로 정한다
  #   (aws/_shared/app-origin.sh — 서울 이사 전후 어느 때든 맞다. 못 읽으면 멈춘다).
  source aws/_shared/app-origin.sh && app_resolve E193CZEBLWEB56 && \
  read -r BUCKET REGION < <(app_target ".well-known/assetlinks.json") && echo "$BUCKET $REGION" && \
  aws s3 cp build/app-build/assetlinks.json "s3://$BUCKET/app/.well-known/assetlinks.json" \
    --content-type application/json --cache-control no-cache --region "$REGION"
  # ⚠️ MSYS_NO_PATHCONV=1 이 없으면 Git Bash 가 "/.well-known/…" 를 윈도우 경로로 바꿔 InvalidArgument 가 난다
  #    (tools/deploy-v1.sh 3/3 주석의 실측 사고).
  MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id E193CZEBLWEB56 --paths "/.well-known/assetlinks.json"
  ```
- **2차(스토어 트랙용):** Play Console → 앱 → 설정 → **앱 서명(App signing)** 화면의 "Digital Asset Links JSON" 스니펫을 그대로 복사한다(Google 보유 키 **3개** 지문). 그 배열에 **업로드 키 지문을 남긴 채** 더해 같은 명령으로 다시 올리고 무효화한다.
- **확인:**
  ```bash
  curl -sI https://earthus.net/.well-known/assetlinks.json | grep -iE '^(HTTP|content-type|location)'
  # 기대: HTTP/2 200 · content-type: application/json · location 줄 없음
  curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://earthus.net&relation=delegate_permission/common.handle_all_urls"
  # 기대: net.earthus.app 과 지문 전부(2차면 4개)
  ```
  앱을 열었을 때 **주소 표시줄 없이** 전체 화면이면 성공(지시서 Phase 1 기준 1·2). Android 15+ 는 반영에 최대 7일.

## 6. 개인정보처리방침 법무 확인 + 자리표시자 채우기

- **왜:** 지금 처리방침은 실제 수집과 다섯 곳 이상 어긋난다(`docs/APP-DATA-COLLECTION-INVENTORY-2026-09-24.md` §2-1). 이대로 Data safety 를 쓰면 허위 신고다(지시서 R3). **첫 AAB 를 비공개 트랙에 올리기 전에** 끝낸다.
- **어떻게:**
  1. 개정안 읽기: `prototype/legal/privacy.ko.revised-draft-2026-09-24.md`(한국어 정본) · `privacy.en.revised-draft-2026-09-24.md` · 계정 삭제 안내 `account-deletion.ko/en.draft-2026-09-24.md`. 브라우저로 보려면 같은 이름의 `.html`(노란 칸 = 채울 값, 회색 C01 = 근거 행).
  2. 법무에 물을 것(코드와 문서가 다른 곳 — 개발은 고르지 않았다):
     - 동의 기록: 탈퇴 후 3년 보관(현행 방침) vs 즉시 삭제(현재 코드 — FK cascade, 수집 표 C02). 3년을 고르면 코드 수정이 필요하다.
     - 결제 기록 5년 보존과 `orders` FK cascade(C17) — 판매 전 코드 수정 필수.
     - Gemini 로 가는 AI 질문을 '위탁'으로 볼지 '제3자 제공'으로 볼지(C08).
     - 위치기반서비스사업 신고 대상 여부(`prototype/legal/README.md:11-38`, 알림 지점 좌표 저장 C03).
     - (2026-09-24 적대적 검토 추가) **시작할 때 자동 위치 요청.** 지금 웹은 앱을 열 때 위치 권한을 묻고, 허용돼 있으면 가입 동의의 '위치(선택)'와 상관없이 좌표를 BigDataCloud·Open-Meteo 로 보낸다(수집 표 C10·C11, `prototype/js/main.js:356`·`ui.js:65-90`). 지시서 D6('내 위치'를 누를 때만)은 이것을 "지금 웹과 같은 시점"이라 적었지만 **전제가 틀렸다.** 택1: ① 웹을 D6 대로 고친 뒤 처리방침·스토어에 '누를 때만'을 쓴다 ② 지금 동작('처음 열 때 묻는다')을 그대로 적는다(개정안 제2조 라.의 `{{PD 택1}}`). 어느 쪽이든 '위치(선택)' 동의가 아무것도 막지 않는 점도 법무에 묻는다.
       - (2026-09-24 PD 결정) **② 지금 동작 그대로.** 개정안 ko/en 의 자리표시자를 A 로 닫았다. '위치(선택)' 동의가 막지 않는 점은 법무 질문으로 남는다.
     - 계정 삭제 요청 처리 기한(안내 페이지의 `{{처리 기한}}`).
  3. 콘솔에서 값 확인(읽기만):
     - Supabase 리전: Supabase 대시보드 → Project Settings → General → Region.
     - Gemini API 요금제·데이터 이용 조건: Google AI Studio → 결제(유료/무료)와 Gemini API 약관의 데이터 이용 조항(무료·유료에 따라 학습 이용이 다를 수 있음 — **UNVERIFIED**).
     - 접속 로그: `aws cloudfront get-distribution-config --id E193CZEBLWEB56 --query 'DistributionConfig.Logging'` · CloudWatch 로그 그룹 보관 기간 · Supabase 요금제 로그 보관일.
  4. 확정되면 개정안 내용을 `privacy.ko.md` 에 옮기고(꼬리표 〔…〕는 그대로 둬도 된다 — 정본 빌드가 지운다), `{{…}}` 가 0개인지 본 뒤 `node tools/build-legal-html.mjs` 로 HTML 을 다시 만든다.
- **확인:** `node tools/build-legal-html.mjs` 출력에서 게시할 파일이 `placeholders=0`, 페이지 맨 위에 노란 띠가 없다. 처리방침 개정 공지(시행 7일 전, 불리하면 30일 전)를 앱 안에 올렸다.

## 7. 법적 HTML 페이지 게시 결정

- **왜:** Play·CWS 는 처리방침 **HTML URL** 과 계정 삭제 **웹 URL** 을 요구한다(answer/9859455, answer/13327111). 지금 `/legal/*.md` 는 `text/markdown` 이고 `/privacy.html` 은 403.
- ⚠️ 지금 만들어 둔 `prototype/legal/privacy.ko.html` 은 **현행(실제 수집과 어긋나는) 방침**을 그대로 HTML 로 옮긴 것이다. 6번 전에 올리면 틀린 방침을 HTML 로 올리는 셈이다.
- **어떻게:** 초안(`draft` 이름)은 **올리지 않는다.** 6번이 끝난 정본만:
  ```bash
  node tools/build-legal-html.mjs
  # (2026-09-24 적대적 검토 정정) 처음 초안은 버킷을 earthus-app-seoul 로 고정했고 무효화에 MSYS_NO_PATHCONV=1 이 없었다.
  #   이 저장소의 1.0 배포 관례(바꾼 파일만)를 그대로 쓴다 — deploy-v1.sh 는 공개 거름망을 거치고,
  #   .html 에 text/html; charset=utf-8 을 붙이고, 지금 원본 버킷을 스스로 찾고, 무효화까지 한다.
  bash tools/deploy-v1.sh legal/privacy.ko.html legal/terms.ko.html legal/data-license.ko.html
  # 계정 삭제 안내는 정본 이름(예: legal/account-deletion.ko.html · .en.html — 이름에 draft 가 없어야 한다)으로 옮긴 뒤 같은 명령에 더한다
  ```
  - ⚠️ 초안(`*draft*`)은 공개 거름망(`aws/_shared/public_build.py` 의 `legal/*draft*` 규칙, 2026-09-24 추가)이 막는다 — deploy-v1.sh 에 넘기면 '거름망이 막은 파일'로 멈춘다. 정상이다.
  - ⚠️ `aws/deploy-app.sh`(공개 트리 전체 동기화)는 거름망을 통과한 `legal/*.html` 정본을 **함께 올린다.** 6번 전에 전체 동기화를 돌리면 현행(실제 수집과 어긋나는) 방침의 `privacy.ko.html` 도 나간다(내용은 지금 공개된 `privacy.ko.md` 와 같다).
  - 앱 안 설정 화면의 처리방침 링크를 `.html` 로 바꾸는 것은 웹 배포(Phase 1)에 들어간다.
- **확인:** `curl -sI https://earthus.net/legal/privacy.ko.html | grep -iE '^(HTTP|content-type)'` → `200` · `text/html; charset=utf-8`. 폰 브라우저로 열어 어두운 화면에 표가 가로로 넘치지 않는다.

## 8. Supabase `push-tick` 배포 (D5 — 알림 본문에 기관·HH:MM KST)

- **왜:** 지금 운영 알림은 지진 = `장소 · 깊이` 뿐, 특보 = 발표 시각 없음, 관광 = ISO 원문. 이번 작업으로 고쳤다(`prototype/supabase/functions/push-tick/index.ts` + `_shared/push-notification-text.js`). 알림을 앱에 켜기 전에 먼저 나가야 한다(지시서 D5 조건 ①).
- **어떻게:**
  ```bash
  node --test tools/test_push_notification_text.mjs      # 10건 통과 확인
  cd prototype && supabase functions deploy push-tick --no-verify-jwt
  ```
  - `prototype/` 에서 실행한다(`prototype/supabase/config.toml` 머리 주석). `_shared/` 는 같은 functions 폴더라 함께 묶인다(전례: `forecast-v8` 이 `../_shared/forecast-v8-policy.js` 를 쓴다).
  - 비밀값(VAPID·토큰)은 이미 설정돼 있으면 다시 넣지 않는다.
- **확인:** 다음 발송 주기 뒤 Supabase 대시보드 → Functions → push-tick → Logs 에 `[push] {"targets":…}` 줄이 계속 찍힌다(오류 없음). 알림 지점을 저장한 시험 계정에 실제 알림이 오면 본문에 `기상청 · 15:02 KST 발표` 또는 `일본 기상청 · 12:39 KST 발생` 꼴이 보인다(지시서 Phase 1 기준 6).

## 9. www → earthus.net 301 (D18)

- **왜:** www 가 200 이라 출처가 둘 — App Link·로그인·저장소가 갈린다.
- **어떻게·확인:** `tools/cloudfront/README.md` 의 0)~5) 를 그대로. 핵심 확인: `curl -sI "https://www.earthus.net/v2/?tab=my"` → `301` · `location: https://earthus.net/v2/?tab=my`.
- ⚠️ 적용 전 Supabase Auth → URL Configuration 의 Redirect URLs 에 `https://earthus.net/**` 가 있는지 본다.

## 10. Supabase 로그인 리다이렉트 허용 목록 (지시서 Phase 0 PD 6)

- **왜:** v2 로그인은 `/?login=1&back=…` 로 v1 을 거친다. 허용 목록에 없으면 로그인 뒤 엉뚱한 곳으로 간다. 저장소에서는 볼 수 없다.
- **어떻게:** Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs.
- **확인:** 앱·웹의 v2 기온 화면에서 로그인 → Google → **같은 v2 기온 화면**으로 돌아온다(지시서 Phase 1 기준 4).

## 11. Data safety 작성

- **왜:** 비공개·공개·프로덕션 트랙 모두 필수(내부 테스트만 예외, answer/10787469).
- **어떻게:** `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-5 표를 그대로 옮긴다. `{{PD 판단}}` 칸 두 개(정밀 위치의 '사용자 시작 동작' 예외, AI 질문의 Google 전달)를 6번 법무 답으로 채운다. 결제는 "지금 없음" — **판매를 여는 날 다시 쓴다.**
- **확인:** Play Console → 앱 콘텐츠 → 데이터 보안이 '완료'. 스토어 미리보기의 데이터 보안 칸이 표와 같다.

## 12. 앱 콘텐츠·스토어 등록정보

- **어떻게:** `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-2~§1-6. 결정할 칸: 대상 연령(13세 미만을 넣으면 가족 정책), 뉴스 앱 선언 질문(v1 뉴스 레이어 — 문서의 사실 칸을 보고 PD 가 직접 답), 심사용 Google 계정(비밀번호는 Console 칸에만).
- **확인:** 앱 콘텐츠의 모든 항목이 '완료', 스크린샷 4장이 전부 실제 화면이고 관측 시각이 보인다.

## 13. 테스터 (개인 계정일 때만 — 0-3 결정 규칙)

- **왜:** 개인 계정은 12명 이상이 **14일 연속** opt-in 한 비공개 테스트 뒤에만 프로덕션을 신청할 수 있다(F3). 심사 7일 이내(더 걸릴 수 있음).
- **어떻게:** Google 그룹 하나를 만들어 테스터 이메일 12명+ 추가 → Play Console 비공개 테스트 트랙에 그룹 지정 → opt-in 링크를 보낸다. 중간에 빠지는 사람을 대비해 15명쯤.
- **확인:** Play Console 대시보드의 '프로덕션 액세스' 카드에 opt-in 테스터 수 ≥12 와 연속 일수가 14일 이상으로 보인다.

## 14. Chrome 웹 스토어 개설·제출

- **왜:** 새 탭 확장 배포(D4 B안).
- **어떻게:** https://chrome.google.com/webstore/devconsole · 이메일은 **바꿀 수 없다**(F9 — D14 회사 공용 주소 추천). 등록비는 결제 화면 금액(U4). 거래자 선언(0-3). 확장 코드가 완성되면(다른 스트림) `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §2 로 등록정보·권한 사유·개인정보 관행을 채운다.
- **확인:** 제출 후 상태가 '검토 중' → 게시. 설치한 확장이 지시서 Phase 3 기준 1~15 를 통과한다.

## 15. (D16) 고아 `/v2/sw.js` kill-switch 교체 배포

- **왜:** 운영 `/v2/sw.js`(옛 Cesium v2 SW)가 예전 기기에서 `/v2/` 를 쥐고 옛 화면을 줄 수 있다. 앱은 Chrome 과 SW 를 공유한다.
- **어떻게:** 다른 스트림이 만든 kill-switch 파일을 PD 확인 뒤 올린다(이 스트림의 산출물이 아니다).
- **확인:** 오래 쓴 기기의 `chrome://serviceworker-internals` 에서 `/v2/` 범위 등록이 사라진다.

---

## 하지 말 것

- **초안(`*draft*`)을 운영에 올리지 않는다.** 법무 확인 전 문서는 법적 효력이 없고, 자리표시자가 그대로 공개된다.
- **배포 스크립트(`tools/deploy-*.sh`)를 '확인용'으로 돌리지 않는다**(2026-09-23 사고 — 기억 `never-run-deploy-to-test`). 위 명령은 필요한 파일만 올린다.
- **키스토어·비밀번호·심사용 계정 비밀번호를 저장소·문서·채팅에 넣지 않는다**(HANDOVER §7). `.jks` 는 `%USERPROFILE%\.earthus-android\` 에만.
- **판매 스위치(`SALES_OPEN`·`SALES_ENABLED`)를 켜지 않는다.** 구독료 결정 전이고, 켜면 앱 안에서 토스 창이 뜰 수 있다(지시서 §3-4). 판매 전 필수: v2 서버 등급 판정, Play 영수증 검증, `orders` FK 수정, 처리방침 결제 항목(지시서 §3-5).
- **Data safety 를 현행 `privacy.ko.md` 로 답하지 않는다** — 수집 표로만.
- **`fallbackType: webview` 를 쓰지 않는다** — Google 로그인·Play 결제가 안 된다(지시서 R10).
- **조직 계정을 먼저 만든 뒤 개인으로 되돌리려 하지 않는다** — 안 된다(F4).
- **Apple 경로로 D-U-N-S 를 신청할 때 '법인'이라고 적지 않는다** — 개인사업자는 법인이 아니다(F7). 사실대로 적는다.

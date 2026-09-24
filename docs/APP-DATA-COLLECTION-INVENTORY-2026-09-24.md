# EARTHUS 실제 수집 목록 표 (2026-09-24)

> **이 표가 개인정보처리방침 개정안·Play Data safety·Chrome 개인정보 관행 답의 유일한 근거다.**
> (앱 지시서 `docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md` Phase 0 개발 ① · `verify-feasibility #3`)
>
> 만든 방법: 2026-09-24, 워크트리 HEAD `d88924a6` 의 **코드를 직접 읽어** 행마다 `파일:줄` 을 적었다.
> 운영 DB·운영 로그 설정은 읽지 않았다(읽기 권한·범위 밖). 코드로 확인할 수 없는 것은 **확인 필요(PD)** 로 적고 값을 지어내지 않았다.
> 비밀값(키·토큰)은 이 문서에 옮기지 않았다 — 위치만 `파일:줄` 로 적는다.
>
> 표기: **연결** = 로그인 계정(user_id)과 이어지는가 · **국외** = 대한민국 밖으로 가는가 · **(확인 필요)** = 코드로 알 수 없어 PD 가 콘솔에서 봐야 하는 것.
> 행 번호(C01…)는 처리방침 개정안·스토어 문서가 인용한다. 번호를 바꾸지 말 것 — 새 항목은 끝에 붙인다.

---

## 0. 한눈에 — 앱(TWA) 이 여는 웹이 실제로 보내는 것

TWA 앱은 `https://earthus.net/` 을 그대로 띄운다. 그래서 **웹이 모으는 것이 곧 앱이 모으는 것**이다(Play Data safety 는 "앱이 제어하는 웹뷰"의 전송도 신고 대상 — answer/10787469, 2026-09-24 읽음).
새 탭 확장(C19)은 따로 본다 — 사용자 자료를 모으지 않는다.

| 묶음 | 행 | 로그인 없이도 일어나나 |
|---|---|---|
| 계정·동의 | C01 · C02 | 아니오(로그인한 사람만) |
| 알림 | C03 · C04 · C05 | 아니오(로그인 + 알림 켠 사람만) |
| 이용 통계 | C06(선택 동의자만) · C07(익명 카운터) | C06 아니오 · **C07 예** |
| 사용자가 누른 기능이 외부로 보내는 것 | C08 AI 질문 · C09 번역 · C10 현재 위치 도시명 · C11 지점 날씨 | 예 (⚠️ C10·C11 의 현재 위치는 누르지 않아도 **앱을 열 때 자동** — 권한 허용 시, C10 행) |
| 게시판·사전등록 | C13 · C14 · C15 · C16 | C13·C15·C16 예 |
| 결제 | C17 토스(웹, **판매 닫힘**) · C18 Play(계획) | — |
| 기반 시설 | C12 공개 자료 요청 · C20 서버 접속 기록 · C21 기기 안 저장소 | 예 |
| 크롬 새 탭 확장 | C19 | 수집 없음 |

---

## 1. 표

| # | 항목 (무엇을) | 코드 위치 | 연결 | 보관 기간 | 제3자 · 국외 이전 |
|---|---|---|---|---|---|
| **C01** | **로그인 계정**: 이메일, 로그인 제공자(Google/Apple), 제공자 계정 식별자, 표시 이름(제공 시), 등급·창립 멤버 여부·이용 기간 | 로그인 `prototype/js/auth.js:82-93`(`signInWithOAuth`, 전체 페이지 이동) · 프로필 읽기 `auth.js:143` · 표 `prototype/supabase/schema.sql:12-25`(`profiles`) | 예(이것이 계정이다) | 계정 삭제 때까지. 삭제 = `auth.js:196` → `schema.sql:139-154` `delete_own_account()` 가 `profiles`·`auth.users` 삭제 | Supabase Inc.(인증·DB 위탁). 리전: 현행 처리방침 `privacy.ko.md:157` 은 "일본 도쿄 ap-northeast-1" — **코드로 확인 불가(확인 필요, PD: Supabase 대시보드 Project Settings)**. Google LLC·Apple Inc.(미국, 소셜 로그인) |
| **C02** | **동의 이력**: 약관·처리방침·만 14세 이상(필수), 마케팅·위치·이용행태(선택), 버전, 시각 | 기록 `auth.js:161` · 표 `schema.sql:80-92`(`consents`) · 이용행태 열 추가 `supabase/migrations/20260814193000_earthus_usage_analytics.sql:9` | 예 | ⚠️ **처리방침과 코드가 다르다.** 처리방침 `privacy.ko.md:118` "탈퇴 후 3년". 코드는 `consents.user_id … on delete cascade`(`schema.sql:82`) + `delete_own_account` 가 `auth.users` 를 지운다(`schema.sql:153`) → **계정 삭제 때 동의 이력도 함께 지워진다.** `schema.sql:148-150` 주석의 "식별자만 끊는다"는 FK 때문에 성립하지 않는다. 운영 DB 에 다른 FK 가 걸려 있는지는 확인 필요 | Supabase(C01 과 같음) |
| **C03** | **알림 저장 지점**: 사용자가 붙인 이름(1~40자), **위도·경도(배정밀도 = 정밀 위치)**, 알림 종류 켜짐(이안류·지진·특보·관광), 지진 규모·거리 기준, 관광 장소 코드·등급 ⚠️ (2026-09-24 정정 · L5 길 B 실행) 좌표가 들어오는 길은 이제 둘뿐이다: ① 알림 시트 '＋ 지금 보는 곳 저장' = **지도 가운데**(`prototype/js/ui-alerts.js` `viewCenter()` 한 번 읽은 값, 저장 전 좌표·'부근' 지명·'기기 위치(GPS)가 아닙니다'를 보여 줌) ② 관광 지켜보기 = 서울시 관광지 고정 좌표(`prototype/js/ui-tourism.js:315`). 기기 측위 좌표를 저장하던 '＋ 지금 내 위치' 단추(옛 `ui-alerts.js:406-415`)는 뺐다. 단, 사용자가 '내 위치'로 지구를 옮긴 뒤 저장하면 저장 좌표가 기기 위치와 거의 같을 수 있다(사용자가 고른 곳) — 처리방침 문장·§2-3 '정밀 위치' 답은 PD·변호사 재판단 ⚠️ (2026-09-24 정정 · 검토) '사용자가 고른 곳'만이 아니다: `main.js` 시작 시 `myLocation.locate().then(flyTo)` 가 **사용자 조작 없이** 지구를 기기 위치로 돌린다. 만지지 않고 저장하면 기기 위치에서 수백 m~수백 km(인트로 회전 0.22°/s·최대 30초) 떨어진 좌표가, '내 위치' 단추 뒤에 저장하면 0.6km 안 좌표가 저장됐다(폰 점검 `build/legal-fix/streamB/review-default.json`·`review-locate.json`). 화면·확인 창 문구는 '기기 위치가 아닙니다'에서 '기기 위치를 읽지 않고 지도 가운데를 저장 · 지도가 내 위치에 가 있으면 그 근처가 저장'으로 바꿨다. `docs/paid-app-review-2026-09-24/r-law.md:191` 의 '지도 중심 = 사용자의 측위값이 아님' 전제는 이 경로에서 흔들린다 — 막을지(예: 자동 이동 뒤 사용자가 지구를 움직이기 전 저장 보류)는 PD·변호사 판단 | 저장 `prototype/js/push.js:176-179`(`alert_spots` insert) · 읽기 `push.js:168` · 이름 바꾸기 `:200` · 기준 바꾸기 `:231` · 지우기 `:191` · 표 `prototype/supabase/push.sql:50-56` · 관광 열 `migrations/20260820090000_tourism_flow_watch.sql:5-7` · 발송 때 서버가 읽음 `push.sql:127-140`(`push_targets`) → `supabase/functions/push-tick/index.ts` | 예 | 사용자가 지울 때까지 또는 계정 삭제 때(`push.sql:52` `on delete cascade`) | Supabase(C01 과 같음). ⚠️ 현행 처리방침 `privacy.ko.md:61`·`:119` "위치정보는 회사 서버에 저장하지 않습니다"와 **어긋난다** — 이 행이 저장한다 |
| **C04** | **웹푸시 구독**: 푸시 주소(endpoint = 브라우저 푸시 서비스 URL), 암호화 공개키(p256dh·auth), 기기 종류(ios/android/web — UA 전체는 넣지 않음), 언어, 실패 횟수·마지막 성공 시각 | 저장 `push.js:141-151`(upsert) · 표 `push.sql:17-26` · 발송·실패 기록 `push-tick/index.ts`(보내기 절, `failed`·`last_ok` 갱신, 404/410 이면 삭제) | 예 | 브라우저가 구독을 버리면(404/410) 즉시 삭제 · 계정 삭제 때(`push.sql:19` cascade) | Supabase. 알림 **본문**은 사용자의 브라우저 푸시 서비스를 거쳐 전달된다(Chrome·TWA = Google FCM, iOS = Apple, Firefox = Mozilla). 웹푸시 본문은 암호화되어 전달된다(`web-push` 라이브러리, `push-tick/index.ts:27`). 푸시 서비스 쪽 보관은 각 회사 정책(확인 필요) |
| **C05** | **보낸 알림 기록**: user_id + 사건 열쇠 + 기기 구분값(endpoint 의 SHA-256 앞 12바이트 — 원문 아님) | 해시 `push-tick/index.ts:83-87` · 자리 잡기 `alert_claim` · 표 `push.sql:99-110` | 예 | **24시간**(`push.sql:113-117` `alert_sent_prune`, 발송 주기마다 실행) | Supabase |
| **C06** | **선택 이용행태 event**(동의한 로그인 사용자만): 허용된 event 이름·범주값, event 시각, user_id, 하루마다 바뀌는 무작위 세션 가명, 동의 버전 | 동의 확인 `prototype/js/analytics.js:37-38` · 가명 `analytics.js:23-34` · 기록 `analytics.js:128`, `:149` · 표 `migrations/20260814193000_earthus_usage_analytics.sql:12-25` · 철회 `auth.js` `earthus_withdraw_usage_consent` · 내려받기 `auth.js:207` | 예 | **365일**(`…usage_analytics.sql:25` `expires_at`, `:186-189` 매일 cron 삭제) · 동의 철회·계정 삭제 때 즉시(`:14` cascade) | Supabase |
| **C07** | **익명 이용 카운터**(`usage_bump`): (날짜, 허용된 event 이름, 증가분)뿐. 사용자 ID·세션 ID·좌표·자유 문구 없음 | `prototype/js/usage.js:1-20`(설계 주석) · 전송 `usage.js:23`, `:60-75` · 허용 목록 `usage.js:31-40` | 아니오 | ⚠️ (2026-09-24 적대적 검토 정정) 처음 초안은 "서버 SQL 이 저장소에 없다(검색 0건)"였으나 **있다** — `prototype/supabase/` 가 아니라 저장소 루트 `supabase/migrations/20260903_earthus_usage_counters.sql`(표 `usage_counters` = 날짜·event 이름·횟수, `usage_bump` RPC, 한 번에 32개·event 당 50 상한)과 `20260906_forme_funnel_events.sql`(허용 목록 확장). 두 파일 모두 **자동 삭제·보관 기한이 없다** — 집계값이 무기한 쌓인다(개인 식별자 없음). 운영 DB 에 적용됐는지는 확인 필요. 요청 자체의 IP 는 Supabase 로 간다(C20) | Supabase |
| **C08** | **AI 질문(지구에 묻기, v2)**: 질문 문장(최대 400자), 언어, **화면 한가운데 좌표(위도·경도 소수 3자리)**·고도, 켜진 레이어 이름·값 | 화면 `prototype/v2-three/js/ask-earth.js:22-23`(`/api/ask`, 400자), `:178`(보내는 본문) · 좌표·레이어 `prototype/v2-three/js/main.js:5496-5521`(`askSnapshot`) · 서버 `aws/earthus-llm/handler.py:359-392`, Gemini 호출 `:40`, `:283-292` | 아니오(user id·로그인 토큰을 보내지 않는다) | **우리는 저장하지 않는다.** 요청 IP 는 분당 12회 제한용으로 Lambda 메모리에만 둔다(`handler.py:126-140`). Lambda 로그에 모델 응답 앞 300자가 남을 수 있다(`handler.py:445`, 해석 실패 때만) — CloudWatch 로그 보관 기간 **확인 필요** | **Google LLC (Gemini API, `generativelanguage.googleapis.com`)** — 국외(처리 리전 확인 필요). Google 쪽 보관·학습 이용 여부는 **API 요금제(유료/무료)에 따라 다름 — 확인 필요(PD: Google AI Studio 결제 설정)**. ⚠️ 현행 처리방침에 없음(`gemini` 0건). 좌표는 사용자의 위치가 아니라 **보고 있던 화면 중심**이다 |
| **C09** | **기계 번역**: 번역할 글(뉴스 제목·게시판 글, 요청당 최대 UTF-8 500바이트) + 요청 IP. 사용자가 번역·미리보기 단추를 누를 때만 | `prototype/js/translate.js:61-72`(글이 URL 쿼리 `q` 로 간다, `:65`) · 한도 `prototype/legal/README.md:120` | 아니오 | 우리는 저장하지 않는다(기기 안 캐시만, `translate.js:52-57` localStorage) | **Translated S.r.l. (MyMemory, 이탈리아)** — 브라우저가 직접 보낸다. 제공자 정책상 번역 구문이 장기 보관될 수 있다(`legal/README.md:120`). 현행 처리방침에 있음(`privacy.ko.md:74-81`) |
| **C10** | **현재 위치의 도시 이름 조회**: 기기 위치 위도·경도(소수 4자리) + 요청 IP. 지구본에서 누른 임의 좌표는 보내지 않는다. ⚠️ (2026-09-24 적대적 검토 정정) 처음 초안은 "위치 사용에 동의하고 '내 위치'를 쓴 경우만"이라고 적었으나 **코드와 다르다**: v1 은 **앱을 열 때 자동으로** 위치를 묻고(`prototype/js/main.js:356` `myLocation.locate()`, `prototype/js/ui.js:65` `locateUser()`), 브라우저(앱) 위치 권한이 허용돼 있으면 곧바로 이 조회를 보낸다(`ui.js:69` → `ui.js:90` `deviceCurrent: true`). 가입 동의의 '위치(선택)' 값(`earthus.consent.location`, `ui-account.js:201`·`:252`)은 이 흐름을 **막지 않는다**(`prototype/js` 에서 읽는 곳이 동의 화면뿐). 권한을 거부하면 보내지 않는다(`mylocation.js:51-52`) | `prototype/js/place.js:86-89` · 주소 `prototype/js/config.js:88` · 자동 요청 `main.js:356`, `ui.js:65-69`, `viewer.js:333-336` | 아니오 | 우리는 저장하지 않는다(기기 안 캐시 `place.js:86`) | **BigDataCloud Pty Ltd (호주, 저장 호주·미국 — 현행 처리방침 `privacy.ko.md:68` 기재)** — 브라우저 직접 |
| **C11** | **지점 날씨 조회**: 화면이 보여 주는 지점의 위도·경도 + 요청 IP. 기본 도시·사용자가 누른 지점·현재 위치(⚠️ (2026-09-24 정정) '동의 시'가 아니라 **브라우저 위치 권한이 허용돼 있으면 앱을 열 때 자동** — C10 과 같은 흐름, `ui.js:65-73`) | 주소 `config.js:84`, `:86` · 호출 `prototype/js/layers/weather.js:49-52`(`fetchWeather`), `prototype/js/ui.js:127`, `:500`, `prototype/js/ui-weather.js:204`, 해변 `beaches.js:226`, 낚시 `fishing.js:293`, `place.js:124`, `:144`, `para.js:136`, `narrative.js:232`, `ui-station.js:144`, v2 경로 `prototype/v2-three/js/route.js:332` | 아니오 | 우리는 저장하지 않는다 | **Open-Meteo (Meteoblue AG 등, 독일·스위스 — 현행 처리방침 `privacy.ko.md:67`)** — 브라우저 직접. 현재 위치일 때만 개인위치정보가 된다 |
| **C12** | **공개 자료·지도·라이브러리 요청**: 요청 IP·User-Agent(브라우저가 자동으로 붙임). 사용자 내용 없음 | 예: jsDelivr(Cesium 등 `prototype/index.html`), 지도 타일(ArcGIS·NASA GIBS), 라이브 영상 `prototype/js/livevideo.js:36`, `:64`(youtube-nocookie, **재생할 때**), Overpass `prototype/js/layers/travel.js:58`(여행지 주변 질의 — 사용자 좌표 아님), NWS `prototype/js/layers/tsunami.js:61`, 항공 프록시 `prototype/js/flight.js:167-170`(우리 Lambda) | 아니오 | 우리는 저장하지 않는다 | 각 제공자(대부분 미국). ⚠️ 요청 파라미터 전수 점검은 이 표 범위 밖 — 사용자 입력이 섞이는 호출을 새로 만들면 이 표에 행을 더한다 |
| **C13** | **사전등록**: 이메일, 마케팅 수신 동의, 처리방침 버전 | `auth.js:289-300`(`waitlist.insert`) · 표 `schema.sql:110-116` | 아니오(user_id 없음) | 처리방침 `privacy.ko.md:121` "출시 후 1년 또는 수신거부 시" — **자동 삭제 코드 없음(확인 필요)** · 계정 삭제로 지워지지 않는다 → 이메일 요청으로 지운다 | Supabase |
| **C14** | **항공·선박 관심 등록**: 서비스 종류, 이메일, user_id(있으면), 처리방침 버전 | `auth.js:345` · 표 `schema.sql:245-253` | 선택적(`on delete set null`) | 보관 기간 코드 없음(확인 필요) · 계정 삭제 뒤에도 **이메일은 남는다**(user_id 만 비워짐) → 이메일 요청으로 지운다 | Supabase |
| **C15** | **개발 요청 게시판 글**: 글(5~1000자), 언어, 작성자 user_id(로그인했으면) | `prototype/js/community.js:141-145` · 표 `schema.sql:180-194` | 선택적(`on delete set null`) | 기간 없음. 계정 삭제 뒤 글은 **작성자 없이 남는다** | Supabase |
| **C16** | **게시판 신고**: 대상 글 id, 신고자 user_id(있으면), 시각 | `community.js:176-178` · 표 `schema.sql:232-243` | 선택적(`on delete set null`) | 기간 없음 | Supabase |
| **C17** | **웹 결제(토스페이먼츠)** — ⚠️ **판매 닫힘**(`SALES_ENABLED` 서버 `prototype/supabase/functions/checkout/index.ts:49`, `SALES_OPEN=false` 클라이언트 `prototype/js/billing.js:386`). 열리면: 주문번호, 상품, 금액·통화, 상태, PG 결제키, 승인 시각 + 토스에 **이메일** 전달 | 결제창 `billing.js:302-306`(`customerEmail`) · 서버 `checkout/index.ts:140` · 승인 `supabase/functions/payment-confirm/index.ts:89-97` · 표 `prototype/supabase/billing.sql:91-110`(`orders`) | 예 | ⚠️ 처리방침 `privacy.ko.md:127-128` "계약·결제 기록 5년(전자상거래법)". 코드는 `orders.user_id … on delete cascade`(`billing.sql:93`) → **계정 삭제 때 결제 기록도 지워진다.** 판매를 열기 전에 고쳐야 한다(지금은 주문 0건으로 추정 — 운영 DB 확인 필요) | 토스페이먼츠 주식회사(국내). 카드번호는 우리가 받지 않는다(토스 창이 받는다) |
| **C18** | **Play 결제(계획 — 코드 없음)** — 앱 지시서 Phase 2. 들어가면: Play `purchaseToken`, 상품 id, 주문 id, 승인(acknowledge) 시각, 결제 경로 기록. 카드 등 결제수단은 Google 이 처리 | 없음(지시서 §3-5-3 서버 영수증 검증 함수 예정) | 예(예정) | 예정 — C17 과 같은 5년 규칙을 따라야 한다 | **Google LLC (Google Play 결제, 국외)** — 넣는 순간 `privacy.ko.md:163` "결제는 국외로 이전되지 않습니다"는 거짓이 된다. **구독료·판매 결정 전까지 처리방침에 넣지 않는다**(PD 2026-09-24: 판매 보류) |
| **C19** | **크롬 새 탭 확장** — **사용자 자료 수집 없음**(설계). 도시 선택·마지막 자료는 브라우저 안 `chrome.storage.local`·Cache Storage 에만. 서버 요청은 공개 자료 GET 뿐, 식별자·쿠키 없음 | 코드 아직 없음(`apps/chrome-newtab/` 미생성, 지시서 §4-3·§4-4) | 아니오 | 기기 안(확장 삭제 때 지워짐) | 없음. 요청 IP 는 CloudFront 가 받는다(C20) |
| **C20** | **서버 접속 기록**: 요청 IP·시각·경로·User-Agent | CloudFront·S3 접근 로그 **켜짐 여부 코드로 확인 불가**(`usage.js:7-10` 주석은 "켜면 IP·UA 가 저장된다"며 켜지 않는 쪽으로 설계). Supabase API 게이트웨이 로그·Auth 감사 로그, Lambda CloudWatch 로그는 각 플랫폼 기본 동작 | 부분적(Supabase Auth 로그는 계정과 이어질 수 있음) | **확인 필요(PD)**: ① `aws cloudfront get-distribution-config --id E193CZEBLWEB56 --query 'DistributionConfig.Logging'` ② Supabase 요금제별 로그 보관일 ③ CloudWatch 로그 그룹 보관 설정. 현행 처리방침 `privacy.ko.md:131` "접속 로그 3개월(통신비밀보호법)" | AWS(서울 ap-northeast-2 · 오하이오 us-east-2), Supabase |
| **C21** | **기기 안 저장소**(localStorage·sessionStorage·Cache Storage·쿠키): 로그인 세션, 동의 상태, 설정, 번역·지명 캐시, 등급 표시값 등 | 예: 동의 `analytics.js:37-38`, 세션 가명 `analytics.js:26-29`, 번역 캐시 `translate.js:57`, 서비스 워커 `prototype/sw.js` | — | 기기 안. 서버로 보내지 않는다(위 행에 적은 전송 제외) | 없음. Play Data safety 정의상 기기 안 처리는 '수집'이 아니다(answer/10787469) |
| **C22** | **AETHERUS 개인 기록 표**(`aetherus_personal_universes`·`_records`·`_observation_archives` 등) | 표만 있음 `supabase/migrations/20260814090000_aetherus_private_data.sql:6-94`. **클라이언트 코드에서 쓰는 곳 0건**(`prototype/js`·`prototype/v2-three/js` 검색) | (쓰면) 예 | 계정 삭제 때 cascade | Supabase. 지금은 수집 없음 — 화면에서 쓰기 시작하면 이 행을 고친다 |
| **C23** | **운영자 표**(초대·관리자·감사 로그) | `migrations/20260811080000_member_invites.sql:10-34` · `20260827090000_earthus_v2_membership_rbac.sql:66-115` | 예(초대받은 회원·운영자) | ⚠️ `member_invites.claimed_by`·`member_access_audit.target_user_id`·`admin_audit_log.target_user_id` 가 `references auth.users(id)` 에 **on delete 규칙이 없다** → 초대를 받은 회원이 계정 삭제를 누르면 FK 때문에 **삭제가 실패할 수 있다**(코드 읽기로 추정, 운영 DB 확인 필요) | Supabase |

---

## 2. 표에서 바로 나오는 결론

### 2-1. 현행 처리방침(`prototype/legal/privacy.ko.md`)과 어긋나는 곳

| # | 처리방침 문장 | 실제 | 행 |
|---|---|---|---|
| 1 | "위치정보는 … 회사 서버에 저장하지 않습니다"(`:61`), 위치정보 "저장하지 않음"(`:119`) | 알림 저장 지점 좌표를 계정과 함께 저장한다 | C03 |
| 2 | (없음) | AI 질문·화면 좌표가 Google Gemini 로 간다 | C08 |
| 3 | (없음) | 웹푸시 구독, 보낸 알림 기록(24시간), 익명 카운터 | C04 · C05 · C07 |
| 4 | "동의 이력 — 회원 탈퇴 후 3년"(`:118`) | 계정 삭제 때 함께 지워진다(FK cascade) | C02 |
| 5 | "계약·결제 기록 5년"(`:127-128`) | 계정 삭제 때 함께 지워진다(FK cascade) — 판매 전 고칠 것 | C17 |
| 6 | AWS 오하이오 "웹푸시 구독 정보"(`:160`) | 푸시 구독은 Supabase 에 있다(`push.sql:17`). AWS 는 발송을 두드리는 Lambda 뿐(`aws/push-tick/handler.py:1-8`) | C04 |
| 7 | "결제 처리(토스)는 국외로 이전되지 않습니다"(`:163`) | 지금은 참. Play 결제를 넣는 날 거짓이 된다 | C18 |
| 8 | 항공·선박 관심 등록 이메일, 게시판 글·신고 | 처리방침에 항목이 없다 | C14 · C15 · C16 |
| 9 | "위치정보 이용에 동의하신 경우에만" 류의 선택 동의 설명 | (2026-09-24 적대적 검토 추가) 앱을 열 때 자동으로 위치를 묻고, 권한이 있으면 가입 동의의 '위치(선택)'와 상관없이 BigDataCloud·Open-Meteo 로 보낸다(`main.js:356`, `ui.js:65-90`) | C10 · C11 |

### 2-2. 코드 쪽에서 고쳐야 할 것 (판매·출시 전, 이 문서는 고치지 않는다 — PD 확인 뒤)

1. `consents` FK — 처리방침대로 3년 보존하려면 `on delete set null`(+ user_id nullable) 또는 탈퇴 전 사본 보관. 아니면 처리방침을 "탈퇴 시 삭제"로 고친다. **어느 쪽을 택할지는 법무 확인 사항**(C02).
2. `orders` FK — 전자상거래법 5년 보존과 충돌. 판매(`SALES_OPEN`) 전 필수(C17).
3. 운영자 표 FK — 초대 회원의 계정 삭제 실패 가능성. Play 는 계정 삭제 경로가 **동작**해야 한다(C23).
4. `waitlist`·`service_interest` 보관 기간 자동 삭제가 없다(C13 · C14).
5. (2026-09-24 적대적 검토 추가) **시작할 때 자동 위치 요청**(`main.js:356`, `ui.js:65`). 앱 지시서 D6("'내 위치'를 누를 때만")은 §3 표에서 이것을 "지금 웹과 같은 시점"이라고 적었지만 **지금 웹은 시작할 때 묻는다** — 지시서의 전제가 틀렸다. D6 를 지키려면 웹 코드를 고쳐야 하고(이 스트림 범위 밖), 고치기 전에는 스토어·처리방침에 '누를 때만'이라고 쓰면 안 된다. 가입 동의 '위치(선택)'가 실제로 아무것도 막지 않는 것도 함께 정할 일이다(C10 · C11).

### 2-3. Play Data safety 답(요약 — 전체는 `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-5)

| Play 분류 | 수집? | 근거 행 | 공유?(Play 정의) | 선택/필수 | 목적 |
|---|---|---|---|---|---|
| 위치 › 정밀 위치 | 예 | C03(알림 지점 좌표) · C10 · C11(현재 위치 사용 시) | C10·C11 은 사용자가 누른 기능으로 제공자에게 직접 감 — '사용자 시작 동작' 예외 해당 여부 **PD 판단** | 선택 | 앱 기능(알림·날씨) |
| 개인 정보 › 이메일 | 예 | C01 · C13 · C14 | 아니오(위탁 = 서비스 제공자) | 로그인은 선택(로그인 없이 앱 사용 가능) | 계정 관리 |
| 개인 정보 › 사용자 ID | 예 | C01 | 아니오 | 선택 | 계정 관리 |
| 앱 활동 › 앱 상호작용 | 예 | C06(동의자만) | 아니오 | 선택 | 분석 |
| 앱 활동 › 기타 사용자 생성 콘텐츠 | 예 | C08 AI 질문 · C15 게시판 글 | C08 은 Google 로 간다(위탁/공유 구분 **PD·법무 판단**) · C15 아니오 | 선택 | 앱 기능 |
| 기기 또는 기타 ID | 예 | C04 푸시 구독 endpoint | 아니오 | 선택 | 앱 기능(알림) |
| 금융 정보 › 구매 기록 | **지금은 아니오**(판매 닫힘) | C17 · C18 | — | — | 판매를 여는 날 다시 답한다 |
| 전송 중 암호화 | 예(HTTPS) | 전 행 | | | |
| 삭제 요청 방법 | 예 | 앱 안 C01 삭제 + 웹 요청(이메일) | | | |

# 스토어 등록정보 초안 — Google Play (안드로이드 앱) · Chrome 웹 스토어 (새 탭 확장) (2026-09-24)

> 앱 지시서 §3-6 · §3-7 · §4-2 · §4-4 · §4-7 의 개발 몫. **제출은 PD 가 한다.** 이 문서는 입력할 글과 답의 초안이다.
> 원칙: **실제 기능만 쓴다**(AGENTS.md 공통 ① 지어내지 않는다). 모든 기능 문장 옆 '근거' 칸에 코드·문서 위치를 적었다 — 제출 전 PD 가 운영 화면에서 문장마다 한 번 더 확인한다.
> Data safety·개인정보 관행 답은 **`docs/APP-DATA-COLLECTION-INVENTORY-2026-09-24.md`(수집 표) 에서만** 가져왔다. 표 밖의 것을 답하지 않는다.
> 글자 수는 `node -e "console.log([...'문장'].length)"` 로 셌다(유니코드 글자 단위).
> 판매·구독료는 PD 결정으로 보류(2026-09-24) — 결제 관련 답은 전부 "지금 없음"이고, 판매를 여는 날 다시 쓴다.

---

## 1. Google Play

### 1-1. 한도 (2026-09-24 읽음)

| 칸 | 한도 | 출처 |
|---|---|---|
| 앱 이름 | 30자 | answer/9859152 "30 character limit" |
| 짧은 설명 | **80자** (지시서 §3-6 의 '확인 필요'를 이번에 확인) | answer/9859152 "80 character limit" |
| 전체 설명 | 4,000자 | answer/9859152 "4000 character limit" |
| 키워드 반복 | 금지 — 반복·무관한 키워드는 정지 사유 | answer/9859152 |

URL: `https://support.google.com/googleplay/android-developer/answer/9859152` (이하 `answer/NNNN` 은 같은 도움말 센터).

### 1-2. 문안

| 칸 | 한국어 (글자 수) | English (chars) |
|---|---|---|
| 앱 이름 | `EARTHUS — 지금 지구` (15) | `EARTHUS — Earth Right Now` (25) |
| 짧은 설명 | `지금 지구의 구름·기상특보·지진을 3D 지구 위에. 모든 값에 기관과 관측 시각을 붙입니다.` (51) | `The live Earth in 3D: clouds, warnings and quakes, each with source and time.` (77) |

런처 이름은 `EARTHUS`(D3). 패키지명 `net.earthus.app`(D3 — 한 번 정하면 영구, answer/9859152).

**전체 설명 — 한국어**

```
EARTHUS 는 두 가지 서비스를 한 앱에 담았습니다.

■ EARTHUS — 지금의 지구 (무료)
지금 이 순간의 지구를 사실 그대로 보여 줍니다. 예보하지 않습니다.
· 3D 지구 위의 최근 위성 구름(NOAA NESDIS GMGSI)
· 기상청 지상관측 기온·바람, 지금 발효 중인 기상특보
· 기상청·일본 기상청이 발표한 지진
· 화면의 모든 값에 발표 기관과 관측 시각을 붙입니다

■ EARTHUS Intelligence — 예보와 해석 작업 공간
· 기온·바람·강수·구름·해양·재해·대기질·우주·지형, 그리고 Life·Travel 메뉴
· 아래 타임라인으로 지금과 5일 예보를 오갑니다. 예보는 모델 이름과 실행 시각을 함께 표시합니다(예: GFS)
· 값 카드와 출처 카드: 누른 자리의 값, 자료 기관, 시각
· 지구에 묻기: 화면에 켜 둔 자료를 근거로 질문에 답합니다

■ 알림 (로그인 후 선택)
저장한 지점 주변의 기상특보·지진·이안류 알림을 받습니다. 알림 본문에 발표 기관과 시각(KST)이 들어갑니다.
알림 도착 시각은 기기 상태에 따라 늦을 수 있습니다. 실제 대응은 기상청 등 공식 발표를 따르세요.

■ 위치
위치 권한은 그 자리의 날씨와 지명을 보여 주는 데만 씁니다. 거부해도 지점을 골라 쓸 수 있습니다. 앱이 닫혀 있을 때 위치를 추적하지 않습니다.

■ 개인정보
광고가 없습니다. 로그인하지 않아도 지구본과 기상 정보를 볼 수 있습니다.
개인정보처리방침: {{처리방침 URL}}
```

| 문장 | 근거 |
|---|---|
| 두 서비스·v1 은 예보하지 않음 | AGENTS.md 표(v1/v2), 지시서 §1-2 |
| GMGSI 구름 | 지시서 §0-2, `clouds/meta.json` credit(`verify-feasibility D`) |
| 기상청 지상관측·특보 | 지시서 §0-1 2 · `events/kma-warn.json` · `wind/kma-aws.json` |
| 기상청·JMA 지진 | `aws/quake-asia/handler.py:124`, `:160` |
| 11개 메뉴 | AGENTS.md 'v2 제품 의도'(현상 9 + Life·Travel) — ⚠️ PD 가 운영 화면에서 11개가 모두 보이는지 확인 |
| 5일 예보·모델 이름·실행 시각 | AGENTS.md "v2 는 예보한다 — 5일치". ⚠️ **2026-09-20 실측으로 타임라인에 물린 것은 GFS 구름·강수·태풍 경로·서울 혼잡뿐**(AGENTS.md). 그래서 "모든 현상 5일 예보"라고 쓰지 않았다 |
| 지구에 묻기 | `prototype/v2-three/js/ask-earth.js` |
| 알림 3종·본문 기관·시각 | `push-tick/index.ts`(이번 작업으로 기관·시각 추가 — **Supabase 배포 후에만 참**. 배포 전 제출이면 이 문장을 뺀다) · 관광 혼잡 알림도 있으나 서울 한정이라 생략 |
| 위치 문장 | ⚠️ (2026-09-24 적대적 검토 정정) 처음 초안은 "'내 위치'를 누를 때만 위치 권한을 묻습니다"였다 — **지금 코드와 다르다.** v1 은 앱을 열 때 자동으로 묻는다(`prototype/js/main.js:356`, `ui.js:65`, 수집 표 C10). 지시서 D6 표의 "지금 웹과 같은 시점"이라는 전제가 틀렸다. 그래서 지금 참인 문장으로 바꿨다. D6 웹 수정(누를 때만 묻기)이 운영에 나간 뒤에만 "누를 때만 묻습니다"를 다시 쓸 수 있다. 배경 위치 없음 = `push.js:3-15` |
| 광고 없음 | 수집 표 C06·C07, 처리방침 개정안 제4조 |

**Full description — English**

```
EARTHUS brings two services together in one app.

■ EARTHUS — the Earth right now (free)
Shows the Earth as it is at this moment, fact by fact. It does not forecast.
· Latest satellite clouds on a 3D globe (NOAA NESDIS GMGSI)
· Korea Meteorological Administration surface observations and weather warnings in effect
· Earthquakes reported by the Korea Meteorological Administration and the Japan Meteorological Agency
· Every value on screen carries its issuing agency and observation time

■ EARTHUS Intelligence — forecast and analysis workspace
· Temperature, wind, precipitation, clouds, ocean, hazards, air quality, space, terrain, plus Life and Travel
· Move between now and a 5-day forecast on the timeline; forecasts show the model name and run time (e.g. GFS)
· Value and source cards: the value where you tap, the data agency and the time
· Ask the Earth: answers questions using the data layers you have turned on

■ Alerts (optional, after sign-in)
Weather-warning, earthquake and rip-current alerts around places you save. Each alert names the issuing agency and time (KST).
Delivery may be delayed by your device. Always follow official announcements.

■ Location
Location is used only to show the weather and place name where you are. If you decline, you can pick a place yourself. The app does not track you while closed.

■ Privacy
No ads. You can view the globe and weather without signing in.
Privacy policy: {{privacy policy URL}}
```

### 1-3. 카테고리·연락처

| 칸 | 초안 | 비고 |
|---|---|---|
| 카테고리 | 날씨(Weather) | 뉴스·잡지(News & Magazines) 는 고르지 않는다 — 아래 1-6 |
| 이메일 | dalur@kakao.com | 스토어에 공개된다 |
| 웹사이트 | https://earthus.net | |
| 전화·주소 | {{PD — 계정 유형에 따라 공개 여부가 다르다. `docs/APP-PD-CHECKLIST-2026-09-24.md` §0 연구 결과}} | answer/13628312: 조직 = 법적 이름·주소·이메일·전화 공개 / 개인 = 이름·국가·이메일, **수익화하면 전체 주소 공개** |

### 1-4. 그래픽 자산 (answer/9866151 · icon-design-specifications, 2026-09-24 지시서 §3-6·§3-7 확인값)

| 자산 | 규격 | 만드는 법 | 상태 |
|---|---|---|---|
| 고해상 아이콘 | 512×512, 32-bit PNG(알파), ≤1024 KB, **꽉 찬 정사각형**(모서리·그림자는 Play 가 입힘) | `prototype/logo/earthus-appicon.svg`(v5 정본) 을 사각형 그대로 래스터화. 새로 그리지 않는다(기억 `brand-assets-v5-only`) | ❌ 지금 `icon-512.png` 는 모서리가 둥글고 투명 — 규격 위반 형태 |
| 피처 그래픽 | 1024×500, JPEG 또는 24-bit PNG(알파 없음) | 로고 lockup + **실제 지구 캡처**(지어낸 화면 금지) | ❌ |
| 폰 스크린샷 | 최소 2장. 추천 노출용 4장 이상, 1080px 이상, 9:16(예 1080×1920) | 실기기에서 실제 화면. 각 장에 관측 시각이 보이게 | ❌ (`prototype/shots/*` 는 1600×1000 가로) |
| 태블릿 스크린샷 | 선택 | Phase 1 태블릿 시험 때 함께 | 선택 |

권장 스크린샷 4장(실제 화면만): ① v1 첫 화면(시각·기온·출처 줄) ② 기상특보가 있는 날의 특보 카드 또는 "특보 없음 · 기준 시각" ③ v2 기온 화면 + 값 카드·출처 카드 ④ v2 타임라인 5일 예보 재생 중(모델 이름·실행 시각 보이게).

### 1-5. Data safety 답 (수집 표에서만)

전제: 앱은 TWA 로 `earthus.net` 을 띄우므로 **웹이 보내는 것 = 앱이 보내는 것**(answer/10787469 — 앱이 제어하는 웹뷰의 전송도 신고 대상). 내부 테스트 트랙만 예외, 비공개 트랙부터 필수.

**일반 질문**

| 질문 | 답 | 근거 |
|---|---|---|
| 필수 사용자 데이터 유형을 수집하거나 공유하나? | 예 | 수집 표 §2-3 |
| 수집 데이터는 전송 중 암호화되나? | 예(HTTPS) | 수집 표 C01~C16 |
| 사용자가 데이터 삭제를 요청할 방법을 제공하나? | 예 — 앱·웹 안 '계정 삭제' + 웹 안내 페이지(이메일 요청) | `auth.js:194-199`, `prototype/legal/account-deletion.*.draft-2026-09-24.md` |
| 계정 삭제 URL | {{계정 삭제 안내 페이지 URL — 발행 후}} | answer/13327111 |

**데이터 유형별**

| Play 데이터 유형 | 수집 | 공유(Play 정의) | 처리 | 필수/선택 | 목적 | 근거 행 |
|---|---|---|---|---|---|---|
| 위치 › 대략적 위치 | 아니오 | — | — | — | — | 좌표는 모두 소수 3자리 이상(정밀) — 아래 행 |
| 위치 › 정밀 위치 | **예** | {{PD 판단: C10·C11 은 브라우저가 BigDataCloud·Open-Meteo 로 직접 보냄. ⚠️ (2026-09-24 정정) 지금 코드는 '내 위치'를 누를 때가 아니라 **앱을 열 때 자동**(권한 허용 시, 수집 표 C10) — 그래서 '사용자가 시작한 동작' 예외(answer/10787469)에 들기 어렵다. D6 웹 수정 뒤에 다시 판단 — (2026-09-24 PD 결정) D6 웹 수정은 하지 않는다: '처음 열 때 묻는다'가 확정 동작이다. 이 칸은 그 전제로 법무·PD 가 답한다}} | 저장: C03 알림 지점(서버) / C10·C11 은 저장 안 함 | 선택 | 앱 기능 | C03 · C10 · C11 |
| 개인 정보 › 이메일 주소 | **예** | 아니오(서비스 제공자 = 위탁) | 저장 | 선택(로그인은 선택) | 계정 관리 · 개발자 커뮤니케이션(사전등록) | C01 · C13 · C14 |
| 개인 정보 › 사용자 ID | **예** | 아니오 | 저장 | 선택 | 계정 관리 | C01 |
| 개인 정보 › 이름 | 예(제공자가 준 경우) | 아니오 | 저장 | 선택 | 계정 관리 | C01 |
| 앱 활동 › 앱 상호작용 | **예**(동의자만) | 아니오 | 저장 | 선택 | 분석 | C06 |
| 앱 활동 › 기타 사용자 생성 콘텐츠 | **예** | {{PD·법무 판단: C08 AI 질문이 Google Gemini 로 감 — Google 을 '서비스 제공자'(위탁)로 볼지}} · C15 게시판은 아니오 | C08 저장 안 함(ephemeral 해당 여부 PD 판단) · C15 저장 | 선택 | 앱 기능 | C08 · C15 · C16 |
| 앱 활동 › 검색 기록 | 아니오 | — | — | — | — | 검색어는 C06 에서도 제외(`privacy.ko.md:89`) |
| 기기 또는 기타 ID | **예** | 아니오 | 저장 | 선택 | 앱 기능(알림) | C04 푸시 endpoint |
| 앱 정보 및 성능 › 비정상 종료·진단 | 아니오 | — | — | — | — | 오류는 C06 의 범주값(`error.shown`)뿐 — 동의자·범주값만 |
| 금융 정보 › 구매 기록 | **아니오(지금)** | — | — | — | — | C17 판매 닫힘 · C18 코드 없음. **판매를 여는 날 다시 답한다** |
| 메시지·사진·동영상·오디오·파일·캘린더·연락처·건강·웹 기록 | 아니오 | — | — | — | — | 수집 표에 행 없음 |

⚠️ 익명 카운터(C07)는 개인을 알아볼 수 없는 집계라 '수집' 신고 대상이 아니라고 보았다 — Play 의 "fully anonymized" 예외(answer/10787469). PD 가 동의하지 않으면 '앱 상호작용 · 분석'에 합친다.

### 1-6. 앱 콘텐츠 신고 (answer/9859455)

| 항목 | 초안 답 | PD 결정·확인 |
|---|---|---|
| 광고 | 광고 없음 | — |
| 앱 액세스(심사용 로그인) | "대부분 기능은 로그인 없이 쓸 수 있다. 알림·계정 화면은 Google 로그인 필요." 심사용 **Google 계정 하나**를 따로 만들어 Console 의 'App access' 칸에만 입력 | ⚠️ 계정 비밀번호는 이 저장소·문서·채팅에 쓰지 않는다(HANDOVER §7). Apple 로그인은 안드로이드 심사에 불필요 |
| 대상 연령 | {{PD 결정}} — 처리방침상 만 14세 미만은 가입 불가·로그인 없이 이용 가능. Play 선택지는 13–15 / 16–17 / 18+ 등 | 13세 미만을 고르면 가족 정책 요건이 붙는다(answer/9859455 대상 연령 항목). 초안 추천: 13세 이상 전체(13–15·16–17·18+) — 14세 미만 가입 차단은 약관으로 |
| 콘텐츠 등급 설문(IARC) | 폭력·성·약물·도박 없음. **사용자 생성 콘텐츠 있음**(개발 요청 게시판 — 공개 읽기 `schema.sql` `hidden = false` 정책, 신고 기능 C16). 사용자 간 위치 공유 없음. 디지털 구매 없음(지금) | 게시판을 앱 화면에 노출하는지 PD 확인 |
| 뉴스 앱 여부 | **질문으로 둔다 — 답하지 않았다.** 사실: v1 에 뉴스·이벤트 레이어가 있다(`prototype/js/config.js:60` GDELT, `prototype/js/brief.js:4` news-brief, `prototype/js/newsbubble.js`). Play 의 뉴스 앱 요건은 "뉴스·잡지 카테고리에 올리고 제목·설명 등에서 스스로 뉴스라고 할 때" 적용된다(answer/10523915, 16189314, 2026-09-24 검색) | 추천 초안: 카테고리 '날씨', 설명에 '뉴스'라는 말 없음 → 선언 대상 아닐 가능성. **PD 가 Console 의 선언 질문을 직접 읽고 답한다** |
| 정부 앱·금융·건강·VPN | 해당 없음 | — |
| 데이터 보안 | 1-5 | — |
| 개인정보처리방침 URL | {{발행한 HTML 주소}} — 스토어와 **앱 안** 둘 다 링크(answer/9859455) | 앱 안 링크는 웹 설정 화면의 처리방침 링크가 HTML 을 가리키게 바꿔야 한다(Phase 1 웹 배포) |
| 권한 | `POST_NOTIFICATIONS`(D5, Android 13+) · 위치 위임(D6, 전경만). 배경 위치 없음 → 배경 위치 선언 불필요 | Bubblewrap 이 넣는 실제 권한 목록은 Phase 1 빌드 결과로 다시 확인 |

---

## 2. Chrome 웹 스토어 (새 탭 확장, D4 = B안 2D 지구)

### 2-1. 이름·설명

| 칸 | 한도 | 한국어 | English |
|---|---|---|---|
| 확장 이름(manifest `name`) | — | `EARTHUS` (D20 짧은 이름) | `EARTHUS` |
| 스토어 제목 | — | `EARTHUS — 새 탭 지금 지구` (19) | `EARTHUS — Earth Now New Tab` (27) |
| 요약(manifest `description`) | **132자**(developer.chrome.com/docs/extensions/reference/manifest/description, 2026-09-24 읽음) | `새 탭을 열면 지금의 지구 — 최근 위성 구름, 낮과 밤, 출처·관측 시각이 붙은 날씨·특보·지진.` (55) | `Every new tab shows the Earth right now: latest satellite clouds, day and night, and sourced, time-stamped facts.` (113) |

⚠️ Edge 로 옮길 때(D13, 나중) 이름·설명에 'Chrome' 을 넣지 않는다 — 위 문안에는 없다.

**상세 설명 — 한국어**

```
새 탭을 열면 지금의 지구 한쪽 면이 바로 보입니다.

· 최근 위성 구름 관측 한 장(NOAA NESDIS GMGSI)과 관측 시각
· 지금 태양 위치로 계산한 낮과 밤
· 고른 도시의 기상청 지상관측 기온·바람, 지금 발효 중인 기상특보, 지난 24시간 한국·일본 기관 발표 지진 — 모두 기관과 시각을 함께
· 자료가 늦으면 '지연'이라고, 오프라인이면 마지막으로 받은 그림과 그 시각을 보여 줍니다
· 예보는 하지 않습니다. 대응은 기상청 공식 발표를 따르세요

검색창이 없습니다 — 새 탭을 열고 바로 치는 글자는 주소창에 들어갑니다.
한 번 그리고 멈춥니다(애니메이션 없음). 위치 권한을 쓰지 않습니다 — 도시는 목록에서 고릅니다(1차는 한국 도시).
개인정보를 모으지 않습니다.
```

**상세 설명 — English**

```
Open a new tab and see one side of the Earth as it is right now.

· The latest satellite cloud image (NOAA NESDIS GMGSI) and its observation time
· Day and night computed from the Sun's current position
· For the city you pick: Korea Meteorological Administration temperature and wind, weather warnings in effect, and earthquakes reported by Korean and Japanese agencies in the past 24 hours — each with its agency and time
· Late data is labelled "delayed"; offline, it shows the last image it received and when
· No forecasts. Follow official announcements.

No search box — what you type in a new tab goes to the address bar.
Draws once and stops (no animation). No location permission — pick a city from the list (Korean cities first).
Collects no personal data.
```

| 문장 | 근거 |
|---|---|
| 모든 기능 문장 | 지시서 §0-2, §4-2(화면 문구), §4-5(자료·주기), §4-6(정지) — ⚠️ **확장은 아직 구현 전**(스트림 별도). 제출 전 구현 결과와 문장마다 대조 |
| 한국 도시만 | D11 |
| 위치 권한 없음 | D6 |

### 2-2. 단일 목적 (개인정보 관행 탭)

- ko: "새 탭을 열면 지금의 지구를 보여줍니다. 최근 위성 구름 관측과 지금의 낮과 밤, 그리고 출처와 관측 시각이 붙은 몇 가지 사실(내 장소 날씨, 기상특보, 최근 지진)을 표시합니다." (지시서 §4-2 원문)
- en: "Replaces the new tab page with the Earth right now: the latest satellite cloud observation, current day and night, and a few sourced, time-stamped facts (local weather, weather warnings, recent earthquakes)."

### 2-3. 권한 사유 (지시서 §4-4)

| 권한 | 사유(ko) | Justification (en) |
|---|---|---|
| `storage` | 마지막으로 받은 관측 자료와 그 시각, 사용자가 고른 도시를 이 브라우저 안에 저장합니다. | Stores the last observations received, their times, and the city the user chose, locally in this browser. |
| `alarms` | 15분마다 새 관측(구름·특보·지진)이 있는지 확인합니다. 최근 2시간 안에 새 탭을 연 경우에만 받습니다. | Checks every 15 minutes for new observations (clouds, warnings, earthquakes), only if a new tab was opened in the last 2 hours. |
| host `https://earthus.net/*` | EARTHUS 자료 서버에서 공개 관측 자료(JSON·이미지)를 받습니다. 코드는 받지 않습니다. | Downloads public observation data (JSON and images) from the EARTHUS data server. No code is downloaded. |
| `chrome_url_overrides.newtab` | 확장의 유일한 기능 — 새 탭 페이지를 지금 지구 화면으로 바꿉니다. | The extension's single purpose: replace the new tab page with the Earth-now view. |

넣지 않는 권한: `geolocation`, `tabs`, `search`, `unlimitedStorage`, `<all_urls>`, 분석 도구.

### 2-4. 개인정보 관행 답 (수집 표 C19)

| 질문 | 답 |
|---|---|
| 원격 코드 사용 | **아니오** — JS 는 전부 패키지 안. 받는 것은 JSON·이미지 데이터뿐(mv3-requirements) |
| 수집하는 사용자 데이터(개인 식별 정보·건강·금융·인증·개인 통신·위치·웹 기록·사용자 활동·웹사이트 콘텐츠) | **모두 해당 없음** |
| 인증(certify) 3개: 승인된 용도 외 판매·이전 안 함 / 단일 목적과 무관한 용도로 쓰지 않음 / 신용 평가·대출 목적 사용 안 함 | 세 개 모두 체크 |
| 개인정보처리방침 URL | {{처리방침 HTML 주소}} — 수집이 없어도 넣는다(개정안 제2조 차가 확장을 다룬다) |

### 2-5. 이미지 자산 (developer.chrome.com/docs/webstore/images, 2026-09-24 읽음)

| 자산 | 규격 | 필수 | 만드는 법 |
|---|---|---|---|
| 스토어 아이콘 | 128×128 PNG, 그림 96×96 + 사방 16px 투명 여백. 밝은·어두운 배경 모두에서 보일 것 | 필수 | v5 모노그램 래스터화(새로 그리지 않음). 확장 패키지 아이콘 16·32·48·128 도 같은 원본 |
| 스크린샷 | 1280×800 또는 640×400, 1~5장(5장 권장) | 필수(1장 이상) | 실제 새 탭 화면. 지시서 §5 Phase 3 기준 9 의 세 해상도 중 1280×800 캡처 재사용 |
| 작은 홍보 이미지 | 440×280 | 필수 | 로고 + 실제 지구 캡처 |
| 마키 홍보 이미지 | 1400×560 | 선택 | 나중 |

### 2-6. 계정·거래자 신고

- 등록비: 공식 문서는 "one-time registration fee" 라고만 쓰고 **금액을 적지 않는다**(developer.chrome.com/docs/webstore/register, 2026-09-24 읽음). US$5 는 제3자 글뿐 — **UNVERIFIED.** 결제 화면에 뜨는 금액이 정답이다.
- 계정 이메일은 만든 뒤 바꿀 수 없다(같은 문서). D14.
- 거래자(Trader)/비거래자 선언: 모든 개발자가 스스로 선언한다. 거래자면 법적 이름·연락처(전화·주소 포함)가 **등록정보 아래에 공개**된다(developer.chrome.com/docs/webstore/program-policies/trader-disclosure · trader-verification-faq, 2026-09-24 읽음). 판단은 `docs/APP-PD-CHECKLIST-2026-09-24.md` §0-3.

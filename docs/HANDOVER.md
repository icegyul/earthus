# earthus 업무 인수인계

> 새 AI 도구(코덱스 등)나 새 작업자가 이 저장소에서 일을 시작할 때 읽는 문서.
> 2026-08-05 작성. 2026-08-06 운영 상태 반영. 작성 시점 최신 커밋: d3b1520.

## 0. 한 줄 요약

**earthus (earthus.net)** — 공공 관측 자료를 3D 지구본에 실시간으로 보여주는 웹 서비스.
1인(김정우 PD, 상호 달루어/dalur) 운영. 2026-08-04 정식 오픈, 현재 전 기능 무료.
호칭은 **"PD"** (사장님 아님).

---

## 1. 무엇보다 먼저 — 이 프로젝트의 원칙

코드보다 이게 우선이다. 어기는 PR 은 기능이 좋아도 안 받는다.

1. **예보하지 않는다.** 기관 발표·모델 계산을 출처와 발표 시각을 붙여 전달만 한다.
   "내일 비 올 듯" 같은 문장을 우리가 만들지 않는다.
2. **지어내지 않는다.** 자료에 없는 것은 그리지 않는다. 도착지가 성(省) 단위면
   점이 아니라 원. 예보가 안 가는 시각의 태풍은 안 그린다(연장 금지). 평균 금지.
3. **모든 값에 출처·관측 시각·표본 수(n).** 이 셋이 없으면 화면에 안 올린다.
4. **모르는 것을 모른다고 적는다.** 빈 화면은 "안전"이 아니라 "자료 없음"이다 —
   그 말을 화면에 쓴다. 버린 데이터 건수도 화면에 적는다.
5. **우리가 정한 임계값은 기준값까지 공개한다.** (예: 멸종위기 판정 "2줄 이상 그리고 5%")
6. **안전 정보(특보·지진·쓰나미·이안류·낙뢰)는 영원히 무료.** 요금제 항목이 아니라 원칙.
7. **SNS 자동 게시 금지.** 초안까지만 자동, 올리는 손은 사람.
8. **화면 문구는 쉬운 말.** 전문 용어는 풀어 쓰고 숫자는 괄호에 남긴다.
   (예: "가강수량 62kg/m²" → "하늘을 짜면 나올 물 62mm")
9. **값을 찍어 보기 전에 원인을 말하지 않는다.** 디버깅 규칙이자 글쓰기 규칙.

## 2. 저장소 지도

```
prototype/        ← 서비스 전체 (정적 웹앱, 빌드 없음, 그대로 배포)
  index.html      앱 본체 (SEO 정적 폴백 noscript 포함)
  intro.html      소개 페이지 (검색·AI 답변엔진용 정적 본문)
  admin.html      관리자 (PD UID 만 통과 — 목록이 비면 아무도 못 들어감)
  studio.html     관리자용 콘텐츠 초안·캡처 작업실 (자동 게시 없음)
  verify.html     예보-관측 일별 집계·지점별 사례 공개 화면
  station.html    ASOS 한 지점 저장·현재값·실제 축적 기간 화면 (30일은 아직 준비 중)
  research.html   일별 검증·ASOS 시간 관측·지점 사례 CSV 무료 미리보기
  manifest.webmanifest / sw.js (웹푸시 + 오프라인)
  js/             화면 코드 (ES 모듈, 약 32,000줄)
    main.js       부팅·메뉴 배선  viewer.js  Cesium 초기화 (infoBox:false 주의)
    layerbar.js   지구 스타일/Alert 메뉴 (ITEMS 표 + drawThumb)
    layers/       레이어들 — cyclone.js(태풍) imagery.js(위성·구름) registry.js(켜고끄기)
    ui*.js        시트들 — ui.js(공용 시트) ui-cyclone.js(태풍 정보창)
                  ui-timeline.js(예보 타임라인) ui-turtle/seabird/migbird(생물)
    narrative.js  "오늘 날씨 이야기" 생성 (날짜별 말투 변주 vary() 포함)
    isobars.js    등압선  windfield.js 바람 입자  power.js 발열 관리(중요)
    store.js      상태 (layers on/off, select, tier)  config.js  주소·레이어 정의
    config.local.js  ⚠️ gitignore 됨. 비밀 아닌 공개키·설정 (아래 §7)
  css/app.css     스타일 전부
  legal/          이용약관·개인정보처리방침 (시행 2026-08-04)
  events/·obs/    (없음 — 데이터는 전부 S3 에서 옴)
aws/              자료 수집 Lambda 54개 (폴더당 하나, handler.py)
  deploy-python.sh  Lambda 배포   schedules.sh  EventBridge 등록
  fx-grid/        예보 격자(타임라인용)  cyclone-analog/  IBTrACS 유사경로
docs/
  HANDOVER.md     ← 이 문서
  talk/           발표자료 (slides.py 가 원본 → build.py → html+pptx)
  marketing/      카드뉴스 초안
supabase/functions/  결제(checkout·payment-confirm)·푸시(push-tick) Edge Functions
```

## 3. 배포 (가장 자주 하는 일)

앱은 S3 정적 호스팅 + CloudFront 다. **빌드 단계가 없다** — 파일을 그대로 올린다.

```bash
# 바뀐 파일만 올린다 (Content-Type 을 반드시 지정 — 안 하면 ES 모듈이 깨진다)
aws s3 cp prototype/js/파일.js s3://earthus-cache-kr/app/js/파일.js \
  --content-type "text/javascript; charset=utf-8"
aws s3 cp prototype/index.html s3://earthus-cache-kr/app/index.html \
  --content-type "text/html; charset=utf-8" --cache-control "no-cache"
# css → "text/css; charset=utf-8" · manifest → "application/manifest+json"
# sw.js 는 --cache-control "no-cache" 필수

# 캐시 무효화 (배포 ID 고정)
aws cloudfront create-invalidation --distribution-id E193CZEBLWEB56 --paths "/js/파일.js"
```

- 도메인: earthus.net (Route53 Z100817032EJQGG0WQJZE, CloudFront E193CZEBLWEB56)
- 버킷: earthus-cache-kr (us-east-2). 앱은 `app/` 프리픽스, 데이터는 `events/` `wind/` `ocean/` 등
- `aws/deploy-app.sh` 전체 배포 스크립트가 있지만 자동화 환경에선 차단될 수 있다 —
  바뀐 파일만 `aws s3 cp` 하는 방식이 안전하다
- **배포 후 검증**: `curl -s https://earthus.net/... | grep 바뀐문구` 로 반영 확인까지가 배포다

## 4. 코드 규칙 (이 저장소만의 것)

- **주석은 "왜"를 적는다.** 받은 지적을 그대로 인용해 남긴다
  (`받은 지적: "..."`). 다음 작업자가 같은 함정을 안 밟게 하는 게 목적.
  ⚠️⚠️ 표시가 있는 주석은 실제로 사고가 났던 자리다 — **지우지 말 것.**
- **커밋 메시지**: 제목은 "무엇이 잘못돼 있었나"를 한국어로. 본문에 원인·결과.
  이 메시지가 그대로 사용자용 업데이트 기록의 재료가 된다.
- **문법 검사**: `cp 파일.js /tmp/x.mjs && node --check /tmp/x.mjs`
  (.js 그대로는 ES 모듈이라 node --check 가 거부한다)
- **파이썬 heredoc** 은 반드시 `# -*- coding: utf-8 -*-` + `io.open(..., encoding='utf-8')`.
  안 하면 한글이 조용히 깨진 채 성공한 것처럼 보인다.
- **SQL 은 SQL 이라고 명시**해서 전달 (터미널에 붙여넣는 사고가 실제로 있었다).

## 5. 이미 밟아 본 함정 (다시 밟지 말 것)

| 함정 | 결과 | 규칙 |
|---|---|---|
| `clampToGround` / `CLAMP_TO_GROUND` | 아이폰 발열 | 금지. `height: 0` 이나 LIFT 상수로 띄운다 |
| `requestRenderMode` 에서 폴리라인이 안 보임 | "안 그려진다"로 오진 | `power.animate(ms)` 로 잠깐 계속 그리기 |
| viewer 가 `infoBox:false` | entity.description 전부 죽음 | `_pick` + `toast()` 방식 사용 |
| layerbar 의 `el(t, c)` 는 인자 2개 | 3번째 인자가 조용히 버려져 빈 버튼 | innerHTML 로 넣는다 |
| Open-Meteo 분당 한도 | 격자 절반만 채워짐 | 묶음 사이 1.2초 + 지수 백오프 (기존 코드 복사) |
| data.go.kr serviceKey | 이미 URL 인코딩됨 — 재인코딩하면 인증 실패 | 그대로 붙인다. 오류는 HTTP 200 안에 옴 |
| 좌표계 EPSG:5186 vs 5174 | 지도가 1°(100km) 옆으로 | 답을 아는 지형(백두대간)으로 검증 |
| GDACS Line_ 피처 | "지나온 길" 주석과 달리 예보 구간 포함 | 시각 라벨(DD/MM HH:mm UTC)로 판단 |
| 애니메이션 무한 반복 | 발열 | 몇 초 돌고 굳히기 (cyclone.js SPIN_MS 패턴) |
| 새로고침마다 문구가 바뀜 | 고장으로 읽힘 | 무작위 금지 — 날짜 시드(narrative.js vary) |

## 6. 데이터 파이프라인

- **Lambda 54개** (aws/ 폴더당 하나) → S3 JSON → 앱이 fetch. 스키마는 각 handler.py 상단 주석에.
- 새 Lambda: `bash aws/deploy-python.sh 폴더명` (requirements.txt 없으면 빈 파일이라도 둘 것 —
  없으면 NetCDF 용 30MB 기본 의존성이 딸려간다). 스케줄은 schedules.sh 패턴으로 EventBridge.
- 대량 수집으로 300초를 넘는 함수는 폴더에 `timeout-seconds.txt`로 1~900초를 적어
  `deploy-python.sh`가 다음 배포에도 예외를 보존하게 한다. `ecobird`는 108만 건 수집으로 900초다.
- 환경변수: `CACHE_BUCKET=earthus-cache-kr`, `CACHE_REGION=us-east-2`. 타임아웃 넉넉히(fx-grid 는 300초).
- 주요 산출물: `events/cyclone*.json` `events/typhoon-official.json`(KMA·JMA)
  `events/typhoon-ecmwf.json` `events/seabird|migbird|ecobird.json`(생물)
  `wind/global.json`(입자) `wind/pressure-ea.json`(등압선) `wind/fx-ea.json`(예보 타임라인)
  `ocean/ibtracs-wp.json`(1980~ 태풍 1,477개 — 유사경로·통계용)
- CelesTrak 궤도는 `celestrak/catalog.json.gz`에 하루 1회 캐시한다. 2026-08-06부터
  TLE 대신 9자리 번호를 지원하는 OMM JSON·SATCAT JSON을 쓰며 `schemaVersion=2`다.
  OMM 14개 원소는 전송량을 줄이려고 `o` 고정 순서 배열로 저장하고, 브라우저의
  satellite.js 6.0.2 `json2satrec()`에서 다시 공식 필드명으로 복원한다.
- **결측은 null 로 남긴다. 메우지 않는다.** 그리는 쪽이 빈 칸을 건너뛴다.

## 7. 계정·비밀 (⚠️ 값은 여기 없다 — 절대 문서·채팅에 적지 말 것)

- **비밀값을 채팅·문서에 붙이지 않는다.** 대화 기록에 그대로 남는다.
  전달이 필요하면 사람이 직접 명령을 실행하는 방식으로(스크립트 파일 → 실행 → 삭제).
- `prototype/js/config.local.js` (gitignore): Supabase URL/anon key(공개 전제, RLS 로 보호),
  ADMIN_UIDS(관리자 UID 목록 — **비면 아무도 못 들어가는 게 정상**), VAPID 공개키,
  SALES_OPEN(현재 false), 결제 함수 URL.
- 서버 비밀(토스 시크릿, VAPID 개인키, 틱 토큰): Supabase Edge Function secrets / AWS SSM.
  **service_role 키는 어떤 클라이언트 파일에도 넣지 않는다.**
- Supabase 프로젝트: ltpupicvdijxkrxxsfky (도쿄 ap-northeast-1). RLS 켜져 있음.
- 로그인: Supabase Auth. ⚠️ `auth.init()` 은 중복 호출 방지 promise 가드가 있다 —
  건드리면 GoTrueClient 가 두 개 생겨 로그인이 안 붙는 버그가 재발한다.
- 콘솔에 사용자 이메일 찍지 않는다(공용 기기).

## 8. 지금 상태와 잠긴 것

- 2026-08-04 정식 오픈. 전 기능 무료. **유료 판매는 SALES_OPEN=false 로 잠김** —
  통신판매업 신고(신고번호) 전에는 열지 않는다. 열 때: config.local.js 의
  SALES_OPEN=true + 약관·처리방침의 자리표시자 3곳(주소·전화·신고번호) 채우기.
- Personal Pro 요금(2026-08-05 결정): **월 ₩5,900/$4.99 · 연 ₩49,000/$39**.
  화면 표시값은 `billing.js`, 실제 청구 정본은 Supabase `plans` 표다 — 둘을 항상 함께 바꾼다.
- 판매 가능 상태를 만드는 현재 실행 정본은
  [`MONETIZATION-PRIORITY-2026-08-05.md`](MONETIZATION-PRIORITY-2026-08-05.md)다.
  과거 가격·상품 문서와 충돌하면 이 문서를 따른다.
- 웹푸시 가동 중 (EventBridge 5분 → Lambda → Supabase push-tick).

## 9. 미결 작업 (2026-08-06 기준)

PD 몫 (자격·전화가 필요한 것):
- 통신판매업 신고 — 구매안전서비스 이용확인증(스마트스토어 사업자 전환 또는 은행 에스크로)
- 바다거북 제4유형 라이선스 협의 (국립해양생물자원관 041-950-0831)
- 철새 원본 GPS 트랙 문의 (검역본부 역학조사과 054-912-0438)
- 에어코리아 측정소정보 API 활용신청

개발 몫 (실제 계정·기기 검증 남음):
- 마케팅 작업 페이지 — `studio.html` 카드 3규격·릴스 PNG 연속 캡처·기기
  보관함을 390×844와 데스크톱에서 검증하고 2026-08-06 운영 배포함.
  비로그인 차단·Content-Type·운영 초안 3건을 확인함. 실제 관리자 계정·모바일
  `navigator.share()` 확인은 남음. **자동 게시 경로는 없다.**
- 예보 검증 — `verify.html`에 GFS·ECMWF의 24/48시간 기온·풍속 일별
  MAE·ME·RMSE·`n`을 출처·생성 시각과 함께 2026-08-06 운영 배포함.
  같은 날 지점·시각별 예보값·ASOS 관측값·차이·발표시각도 날짜별 공개 파일로
  분리해 운영 배포함. 2026-08-06 첫 산출물은 96지점·1시각이며 이후 매시 누적한다.
  390×844와 데스크톱에서 선택기와 24/48시간 값을 확인함. 배포 전 날짜의 지점별
  사례는 아직 소급 생성하지 않았으므로 공개 목록의 실제 시작일보다 길게 쓰지 않는다.
  ⚠️ 기존 일별 집계가 관측 지연 때문에 실제 23/47시간 파일을 24/48시간으로 부른
  한 시간 오차를 2026-08-06 발견했다. 옛 집계는
  `archive/verify/legacy-daily-before-observation-time-fix.json`에 비공개 보관하고,
  공개 일별 집계는 `leadBasis=observation-time`으로 같은 날부터 다시 시작했다.
- 관측소 입양 무료 MVP — `station.html`에서 ASOS 96지점 중 한 곳을 기기에 저장하고
  현재 관측 6종과 날짜별 공개 관측 이력에 실제로 쌓인 시간별 기온·풍속을 표시한다.
  `kma-aws`가 `wind/series/stations/<날짜>.json`을 매시 갱신하므로 예보 검증
  파일이 빠져도 관측 이력은 독립적으로 계속 쌓인다.
  2026-08-06 운영 배포와 390×844 검증을 마쳤다. 30일 이력은 빠르면
  2026-09-05, 작년 같은 날은 빠르면 2027-08-06 이후 실제 보유 여부를 계산하며
  그 전에는 준비 중이다. 저장은 아직 계정 동기화가 아니라 이 브라우저 기기에만 남는다.
- Research Pack 무료 미리보기 — `research.html`에서 최신 공개 범위의 일별 검증,
  ASOS 시간 관측, 지점별 예보-관측 사례를 각각 CSV로 변환한다. 2026-08-06 02:40 KST
  운영 실측은 8행·96행·1,536행이며 출처·생성시각·단위·`n`을 함께 둔다.
  최신 실제 사례의 시각·관측소·변수를 골라 GFS·ECMWF 24/48시간 예보와 관측,
  차이, 발표시각, 출처, `n`이 든 1장 수업 활동지를 인쇄·PDF로 저장할 수 있다.
  CSV 3종의 40개 열 스키마·단위·범위·출처·방법론과 정확한 파일 SHA-256를
  `earthus.research-manifest.v1` JSON으로 내려받을 수 있다. 한 사례로 모델 우열을 판정하지
  않는 질문만 두었고 판매는 열지 않았다.
  Custom Extract에서 운영 인덱스에 실제로 있는 시작일·종료일을 선택하고, 범위 안에
  실제 등록된 파일만 읽어 예보·관측 사례 또는 ASOS 시간 관측을 시각·관측소·변수로
  좁혀 CSV로 받을 수 있다. 사례는 모델·선행시간별,
  ASOS는 관측 변수별 long format 한 행으로 만들며 좌표·단위·출처·이용조건·생성시각을
  각 행에 둔다. 결측은 빈칸이고 예보−관측 차이는 부동소수점 노이즈 없이 소수 셋째
  자리까지 보존한다.
  같은 선택 조건의 `earthus.custom-extract-manifest.v2` JSON에는 CSV 파일명·행 수·
  BOM 포함 바이트·SHA-256, 12/17개 열의 단위·설명, 선택 필터, 원본 경로·출처·
  이용조건·생성시각, 결측·차이·정렬 방법을 둔다. CSV가 바뀌면 체크섬도 바뀌므로
  실제 내려받은 쌍을 함께 보관해야 한다.
  `인용·방법 메모` Markdown은 같은 manifest를 먼저 계산해 파일명·행 수·바이트·
  SHA-256를 그대로 옮기고, 선택 조건·원본 URL·출처·이용조건·생성시각·방법을 사람이
  읽는 한 장으로 만든다. 공식 DOI를 만들지 않으며 작업 메모라는 한계를 명시한다.
  선택 범위 품질 요약은 사례 자료를 모델×선행시간×변수별로 묶어 total_rows·
  paired_n·관측/예보 결측·ME·MAE·RMSE를 계산하고, ASOS는 변수별 total_rows·
  observed_n·numeric_n·missing_n/비율·최솟값·최댓값·평균을 계산한다. 현재일기 같은
  문자열은 관측값이지만 숫자 통계에서는 제외한다. 요약 CSV 각 행에도 선택 범위·
  출처·이용조건·원본 생성시각이 남으며 한 날짜를 장기 모델 순위로 표현하지 않는다.
  Custom Extract manifest의 `derivedFiles`에는 이 품질 CSV의 정확한 파일명·행 수·
  BOM 포함 바이트·SHA-256·열 정의·계산 설명을 넣고, 인용·방법 메모에도 같은 값을
  옮긴다. 화면의 품질 CSV 버튼이 만드는 바이트와 manifest 체크섬 대상은 동일하다.
  v2는 시작일·종료일·실제 포함 날짜·달력상 누락 날짜와 날짜별 원본 경로·출처·
  이용조건·생성시각을 추가했다. 인덱스에 등록된 범위 파일 하나라도 읽지 못하면
  일부 날짜만 내보내지 않고 추출 전체를 중단한다.
  예보·관측 사례의 날짜별 품질 추세는 각 날짜를 모델×24/48시간×변수로 다시 묶어
  n·ME·MAE·RMSE CSV를 만든다. 실제 검증 날짜가 2일 이상일 때만 CSV·SVG를 열고,
  달력상 날짜가 연속된 점끼리만 선을 잇는다. SVG의 각 점에 n을 표시하고 출처 파일
  수와 “짧은 범위는 장기 순위가 아님” 경고를 넣는다. ASOS 또는 실제 1일 범위에서는
  버튼을 내리고 이유를 표시한다.
  Custom Extract manifest는 같은 2일 조건을 통과할 때만 `derivedFiles`에
  `daily-trend` CSV의 파일명·행 수·BOM 포함 바이트·SHA-256·12개 열 정의·
  누락 날짜 비보간 방법을 추가한다. 1일 manifest에는 존재하지 않는 추세 파일을
  기록하지 않으며 인용·방법 메모도 같은 조건으로만 추세 체크섬을 포함한다.
  `재현 Python 코드`는 현재 선택의 manifest를 코드 안에 고정하고, 같은 폴더의 원본
  CSV와 모든 파생 CSV를 Python 표준 라이브러리만으로 검사한다. 파일별 SHA-256·열
  순서·행 수가 다르거나 파일이 빠지면 즉시 실패하며, 사례 자료는 각 행의
  예보−관측 차이를 허용오차 0.001로 다시 계산한다. 네트워크나 외부 패키지는 쓰지 않는다.
  같은 일별 검증 자료에서 날짜·기온/풍속·MAE/ME/RMSE를 골라 모델×24/48시간 막대
  차트를 만들고 SVG로 내려받을 수 있다. SVG 안에 기간·단위·각 막대의 `n`·출처·
  생성시각과 “한 날 표본은 장기 순위가 아님” 경고를 함께 넣는다. ME의 음수는
  0 기준선 아래에 그리며, 같은 날짜·변수 밖의 값은 한 차트에 섞지 않는다.
- ECMWF 태풍 앙상블 — `ecmwf-ingest`가 ENFO BUFR의 51개 멤버를 독립 진로로
  풀어 `events/typhoon-ecmwf.json`에 함께 저장하고, 선택한 태풍에만 얇은 진로
  다발로 표시함. 평균 진로를 만들지 않고, 중간 좌표가 없는 구간도 잇지 않는다.
  2026-08-06 운영 06Z 실측: DOLPHIN 51개 진로(120h 좌표 50개), KUJIRA 49개
  진로(120h 좌표 8개). 범례의 숨기기·보이기와 정보 시트의 모델/공식 구분을
  데스크톱 운영 화면에서 확인함. 실제 아이폰 확인은 남음.
- 에코뱅크 조류 — 취미 메뉴의 `전국 조류 조사`에서 806,219건을 5km 격자
  4,521칸으로 표시하고, 전체 1,085,606건·342종·위치 없음 279,284건·좌표 이상
  103건을 함께 밝힘. 현재 위치·개체수 지도가 아니며 빈 칸도 새가 없다는 뜻이
  아니라고 화면 첫 문장에 고정함. 4,521개 Entity 대신 PointPrimitiveCollection
  하나를 써서 2026-08-06 운영 화면에서 렌더·닫기·표시 끄기를 확인함.
  공공데이터포털의 자연환경·생태계정밀·백두대간정밀조사 조류 점 API 3종은
  공공누리 제1유형으로 상업 이용·가공이 가능하지만, 동시에 `제3자 권리 포함`으로
  표시된다. 공식 근거 URL과 운영 판정은 `docs/ECObank-LICENSE-2026-08-06.md`에 기록했다.
  무료 집계 지도에는 출처·제1유형·제3자 권리 경고를 노출하고, 유료 가공물·원자료
  CSV/API 내보내기는 담당자에게 권리 범위를 서면으로 확인할 때까지 계속 보류함.
  2026-08-06 운영 재수집은 558초 걸려 1,085,606건 전체를 받았고 `truncated=0`을
  확인했다. 기존 배포 스크립트가 300초로 덮어쓰며 실제 타임아웃이 난 적이 있어,
  `aws/ecobird/timeout-seconds.txt`의 900초 예외를 다음 배포에도 보존하게 고쳤다.

개발 몫 (착수 안 됨):
- 이용 행태 수집 (동의는 받는데 수집 코드가 없음)
- 야간 하층운(BTD) 운영 밤 자료는 2026-08-06 02:46 KST에 눈·화소로 확인함.
  낮 영역은 비고 전체 등위도 격자의 1.5%가 표시 문턱을 넘었다. 이 값은 실제 구름
  면적이 아니며 지상 관측 대조 전까지 화면에서 계속 `낮은 물구름 후보`로만 부른다.
  NOAA 원본의 상위 2비트 품질 플래그도 good pixel만 보간하도록 보강함.
- 공공데이터 라이선스 전수 점검
- CCTV·NHK 임베드 검토 (출처·이용조건 확인 후에만)
- 태풍 정보창 뉴스: 일본 매체가 번호(台風9号)로 불러 이름 검색에 안 잡히는 한계 —
  태풍 번호 매핑이 있으면 개선 가능

## 10. 확인·검증 방법

- **화면 검증은 실제로 열어서 본다.** 헤드리스 크롬 + 소프트웨어 WebGL 로 캡처하는
  방법이 docs/talk/capture.md 에 있다 (코치마크 끄기, 카메라 지정, 메뉴 탭까지).
- 태풍 화면 딥링크: `https://earthus.net/?tc=태풍이름` (공유 버튼이 만드는 주소).
- 숫자를 화면·문서에 쓰기 전에 반드시 실측 (건수는 S3 JSON 을 직접 세 본다).
  발표자료의 숫자 세는 명령은 docs/talk/README.md 에 있다.

## 11. 사람

- PD: 김정우 (dalur@kakao.com). 밤낮없이 폰으로 직접 테스트한다 —
  "아이폰에서 이상하다"는 말이 유일한 재현 단서인 경우가 많았다. 진지하게 받을 것.
- 문구·기능 요청은 짧게 온다 ("~해줘"). 요청의 의도를 넓히지 말고 그대로,
  대신 원칙(§1)과 충돌하면 충돌 지점을 말하고 대안을 내라.

# BACKGROUND PACK v1 INSERTION — 보고 (2026-09-13 밤)

PD 지시 "BACKGROUND PACK INSERTION / PRE-PHASE-1" 14항의 결과. 기존 V3·AWS·CI·sw.js 변경 0. "구현됨" 과 "브라우저 검증됨" 을 나눠 적는다.

```
BACKGROUND PACK
ZIP:               PASS — EARTHUS_V3_WONDER_BACKGROUND_PACK_v1.zip 4,127,694 B, sha256 50766234ea74f094b6d75f22ccd6058562224aa1b03e2c6355b49036ae719f3f, testzip OK, 29 entries
ASSET COUNT:       24 / 24 (world 1 · korea 4 · atmosphere 3 · region 16, 전부 1920×1080 16:9 WebP, 46~110 KB, 중복 0)
QUALITY:           ACCEPT 0 / REJECT 0 / REVIEW 24  ← 내용 위반(글자·UI·로고·워터마크·캐릭터·카드 프레임) 0
                   그러나 24/24 PRODUCTION_REJECT: ① 카탈로그 시트 여백·이웃 그림 잔재(합성 흔적, 왼쪽 최대 73px) ② 유효 해상도 ≈480p(업스케일)
                   → safe-crop 후보로만 런타임 사용, production_approved 0 (PD 결정)
REGISTRY:          PASS — environment-background 24 등록(id·category·slug·region·path·width·height·format·bytes·version·sha256·status), manifest = 실제 파일 24/24
LAZY LOAD:         PASS — boot 배경 요청 0, 지역 진입 때 한 장, 24장 전환 시 각 1회, 재선택 0회(캐시), 닫으면 unpin 0 pinned, LRU 30MB(24장 상주 1.9MB)
MOBILE:            PASS — 375×812 · 390×844 에서 24/24 safe-crop 안전 상자가 화면을 덮음(여백 노출 0px), 세로 폰은 아래(전경) 우선, 텍스트 없음
TEST:              64/64 (기존 57 + 배경 팩 7)
BROWSER:           PASS — World·Korea 4·Atmosphere 3·Region 16 전부 실제 선택·표시, 전환·로딩·unload 확인 (인앱 Chromium, 로컬 dev-server)
CONSOLE:           0 (이번 세션 4xx 0; 탭 버퍼의 404 3건은 오전 실패 시험의 잔재)
MASTER DIRECTIVE:  PASS — wonder 3 루트 파일 존재, ZIP 안 사본·docs/MASTER_DEVELOPMENT_DIRECTIVE.md 와 sha256 e41a6652… 18,656 B 동일
PHASE 1:           READY (이미 1-D 까지 완료·스테이징 배포됨 — 이 지시는 배경 편입만)
NOT DONE:          실기기(Android/iOS) 검증 0 · 배경 production 승인 0 · 스테이징/wonder-test 재배포 안 함(AWS 변경 0 지시)
BLOCKERS:          없음(구현·브라우저). PD 결정 대기: ① 24장 후보 사용 승인 여부(REVIEW) ② 고해상 재생성 art pass
```

## 1. ZIP 읽기 전용 검사

| 항목 | 값 |
|---|---|
| 파일 | `wonder 3/EARTHUS_V3_WONDER_BACKGROUND_PACK_v1.zip` 4,127,694 B |
| SHA-256 | `50766234ea74f094b6d75f22ccd6058562224aa1b03e2c6355b49036ae719f3f` |
| 무결성 | `zipfile.testzip()` OK, 29 entries(webp 24 · json 1 · md 3 · png 1) |
| manifest | `assets/background_manifest.json` v1.0.0, count 24, categories world 1 · korea 4 · atmosphere 3 · region 16, 전 항목 `production_status: CANDIDATE`, `source: generated background catalog crop` |
| docs | `BACKGROUND_PRODUCTION_GUIDE_v1.md`(3,009 B) · `CLAUDE_CODE_BACKGROUND_INSERTION_DIRECTIVE.md`(1,465 B) · Master Directive 사본(18,656 B, 루트·docs 와 동일) |
| preview | `BACKGROUND_PACK_PREVIEW_SHEET.png` 2,262,343 B (24장 접촉 시트 + 규격표) |
| 크기 | 24장 전부 1920×1080(1.7778), WebP, 46,026~110,552 B, 내용 중복 0 |

ZIP 은 수정·해제하지 않았다(스크래치패드에서만 읽음). 편입 스크립트 `scripts/import-background-pack.py` 가 같은 검사를 재현한다.

## 2. 시각 품질 게이트 (실제 픽셀)

방법: 1024px 미리보기 24장을 한 장씩 눈으로 봄 + 가장자리 확대 시트(좌·우·상·하 띠) + 자동 측정(가장자리 흰 띠 px, 이웃 그림 색 거리, 1/4 축소 PSNR). 결과 `assets/background_quality_report.json`.

| 검사 항목 | 결과(24장) |
|---|---|
| 글자·지역명·UI·버튼·로고·워터마크·캐릭터·인포그래픽·카드 프레임 | **0장** |
| 다른 장소 썸네일 잔재 / 합성 흔적 | **24장** — 카탈로그 시트에서 잘라낸 흔적: 왼쪽 흰 여백 12~73px(02·03·05·08·10·11·18·19 가 67px 이상), 오른쪽 0~49px, 04·06·07·17 은 가장자리 40px 띠에 이웃 그림 색(Δ 74~232) |
| 해상도 | 24장 전부 1/4 축소 후 복원 PSNR 46.5~50.3 dB → 원본 유효 해상도 ≈480p 를 1920×1080 으로 키운 것(가이드 §6 도 "1차 candidate" 로 명시) |
| standalone · 16:9 · 전경 공간 · 합성 적합 · mobile crop | 통과(여백을 잘라내면) |
| Paper-Cut / 2.5D | 부분 — AI 일러스트풍, 종이 결·레이어 감은 약함 |

판정: **ACCEPT 0 · REJECT 0 · REVIEW 24.** PD 규칙대로 합성 흔적은 PRODUCTION_REJECT(24/24)다. 내용 위반이 없고 여백은 화면에서 잘라낼 수 있어, 런타임에는 `safeCropPx`(왼쪽 최대 73 / 오른쪽 49 / 상하 16px, 폭의 10% 미만)를 뺀 후보로만 쓴다. production 승인은 0.

## 3. 편입 (구현됨)

| 위치 | 내용 |
|---|---|
| `assets/background/*.webp` | 24장, ZIP 바이트와 동일(sha256 24/24) |
| `assets/background_manifest.json` | 팩 manifest + 실측(width·height·bytes·sha256)·status·productionStatus·load·safeCropPx·focal·region·geo·version 1.0.0 |
| `assets/background_manifest.pack-v1.json` | 팩 원본 manifest 사본 |
| `assets/background_quality_report.json` | 24장 검사 기록(항목별 checks·measured·reasons·safeCropPx·note) |
| `docs/BACKGROUND_PRODUCTION_GUIDE_v1.md` | 팩 가이드 바이트 그대로 |
| `scripts/import-background-pack.py` | 위 전부를 재생성(원본 덮어쓰기 방지 가드) |

## 4. 레지스트리 (구현됨 · 테스트됨)

`scripts/build-registry.mjs` 가 `assets/background_manifest.json` 을 읽어 kind `environment-background`, `root: project` 로 24건 등록(필드 12종 + safeCropPx·focal·source). manifest 와 실제 파일 bytes·sha256 불일치, id/path 중복, 개수 불일치는 빌드 실패. `counts.environment_backgrounds 24 · loadable 24 · by_status {REVIEW: 24}`, `sources.background-pack-v1.sha256` = ZIP sha. 팩 1.8 옛 배경 24(불합격) 은 그대로 `background`/blocked.

## 5. 로딩 정책 (구현됨 · 브라우저 검증됨)

- manifest 는 첫 지역 진입 때 받는다(부팅 22 요청 중 배경·manifest 0).
- WORLD/ATMOSPHERE `on-demand`, KOREA/REGION `region-lazy`, STORY 는 기존대로 카드 열 때. 진입 때 고른 **한 장만** `assets.get(path, {pin:true})`.
- 종료: `close()` 가 unpin → `evictToBudget()`(LRU 30MB). 검증: 24장 전환 뒤 상주 24장 1,922 KB, 닫은 뒤 pinned 0, `.env-bg` 비움, 재선택은 네트워크 0.
- 캐시: 레지스트리 sha 로 `?v=sha12`(불변). 교체 시 id·path 유지, version·sha 만 바뀌면 로더가 stale 처리.

## 6. Wonder Environment 연결 (구현됨 · 브라우저 검증됨)

Paper Earth → Region Entry → Paper Unfold → **Environment Background(`.env-bg`, 한 장)** → Ambient Motion(`.env-motion` + 기존 구름·풀) → Discovery(캐릭터 있을 때만) → Character(별도 `.env-stage` 레이어). 배경 파일 안에 캐릭터를 굽지 않는다.

- 선택 규칙 `packages/wonder-environment/src/background-select.mjs`: ① 환경 카탈로그 지정(`environments.json` himalaya bg-09 · savanna bg-12 · amazon bg-14) ② 한국 4곳 좌표 반경(서울·부산·제주 60km, 경주 40km) ③ 지역 배정(east-asia coast · europe forest · north-africa sahara · south-asia himalaya · southeast-asia ocean_shallow · north-america grassland · south-america jungle · oceania island · africa savanna · middle-east desert_oasis · siberia tundra · polar 북 aurora/남 tundra) ④ 시각(day 6~17 · sunset 17~20 · night). REJECT 는 절대 안 고른다.
- 캐릭터 환경이 없는 지역·먼바다(underwater) 도 **합성 환경**(배경 + 지역 라벨 + 느낌 말, 캐릭터·랜드마크·이야기 없음)으로 종이 펼침 진입. 지리 트리거 없는 배경(world·tibet·volcano·canyon·atmosphere 3) 은 `__wonder.background.show(id)` 로 선택.
- 라벨은 지역 이름 + `LABEL_KO`(느낌 말, 사실 주장 아님).

## 7. 모션 (구현됨 · 브라우저 검증됨)

정적 그림 위 별도 CSS 레이어. `MOTION` 표(slug → main 1 + secondary ≤ 2, 예산 초과는 잘림): sahara sand+clouds · himalaya clouds+snow+landmark-breathe · ocean_shallow shimmer+bubbles · underwater bubbles+shimmer · forest leaf-sway+shimmer · aurora aurora+snow · night stars … 입자 8개(눈·꽃잎·거품·불티·모래·별)·반짝임 띠·오로라 베일. Character Focus 때 1/4 속도, 움직임 줄이기면 정지, 이야기 카드 열리면 일시정지.

## 8. 모바일 (브라우저 검증됨 · 실기기 0)

`coverLayout()`(순수 계산, node 시험 24장 × 4 뷰포트) + 인앱 375×812 · 390×844 실측 24/24: 안전 상자가 화면을 덮음(여백 노출 0px), 세로 폰은 focal y 0.62 로 아래(지형·전경 공간) 우선(예: 제주 375 — 그림 1488×837, 가시 폭 25%·높이 97%, 아래 여백선 = 화면 아래). 텍스트는 그림에 없어 라벨·QA 패널과 충돌 없음. 정책: JS 배치(`object-fit` 대신 안전 상자 기준 cover) — 원본 파일 무수정.

## 9. 테스트

`node --test` **64/64**. 새 `tests/background-pack.test.mjs` 7: manifest 24 = 파일 24 · path/bytes/sha/WebP 헤더 크기 · id·path 중복 0 · 품질 보고서 24(내용 위반 0, REJECT 는 load 차단) · 레지스트리 24(필수 필드, boot/preload 없음) · 24 선택(환경 지정 24·한국 4·지역 12·극 남북·시각 3·REJECT 불가) · 모바일 crop 24×4 · 모션 예산. `registry.test.mjs` 는 `root: project` 자산을 허용하도록 갱신.

## 10. 브라우저 검증 (인앱 Chromium, `node scripts/dev-server.mjs 8790 --lan`)

| 항목 | 결과 |
|---|---|
| World bg-01 | show(id) 로 표시·1920×1080·요청 1 |
| Korea Seoul/Busan/Gyeongju/Jeju | 좌표 진입 → bg-02/03/04/05, 각 요청 1, 라벨 "동아시아 · (느낌 말)", 모션 petals/shimmer/leaf-sway/shimmer |
| Atmosphere 3 | bg-06/07/08 show(id) 표시 |
| Region 16 | bg-09~24 전부 표시(himalaya 는 환경 진입으로 bg-09), 각 요청 1 |
| switching | 열린 채 24장 순서대로 교체 성공 24/24, 2차 재선택 네트워크 0 |
| loading | boot 0, 진입/전환 시 한 장씩, 실패·타임아웃·재시도 0 |
| unload | 닫으면 unpin(pinned 0)·`.env-bg` 비움·LRU 예산 안(1.9MB/30MB) |
| console | 이번 세션 오류 0(4xx 0) |

## 11. 지킨 것

기존 V3(v3-paper·v3-kids)·V1·V2·Simulation·DAMC·AETHERUS·AWS·CI·sw.js·`app/v3` 변경 0. AWS 쓰기 0(스테이징 재배포 안 함 — 다음 배포 때 `build-staging.mjs` 허용 목록에 `assets/background` 포함됨). ZIP 무수정, 원본 PNG 없음(팩은 WebP 만), 24장 preload 0.

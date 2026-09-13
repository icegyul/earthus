# EARTHUS V3 WONDER — wonder 3 READ-ONLY AUDIT

작성 2026-09-13 · 작업 루트 `D:\## APP\EARTHUS v2_APP\wonder 3` · 저장소 브랜치 `earthus-v2/real-living-earth-render` @ `b1dd00a9`
감사자: Claude Fable 5.1 (Claude Code)

이 문서는 **감사 결과만** 담는다. 감사 중 기존 V1/V2/V3 코드·AWS 리소스는 한 바이트도 바꾸지 않았다.
AWS 는 `earthus-deploy` 프로파일로 **조회(ls/list/get)만** 했다. 숫자는 전부 이 세션에서 실제로 잰 것이다.

---

## 0. 먼저 알아야 할 네 가지

### ① 지시된 Master Directive 가 없다

`CLAUDE_CODE_EARTHUS_V3_WONDER_WONDER3_MASTER_DIRECTIVE_v1.md` 를 다음 범위에서 찾았고 **어디에도 없다.**

| 검색 범위 | 결과 |
|---|---|
| `wonder 3/` | 없음 (파일 2개뿐, 아래 §1) |
| 저장소 전체 `EARTHUS v2_APP/` (`*MASTER_DIRECTIVE*`, `*WONDER*`) | V2 코덱스 지시서 1건만 (`Earthus v2_5.2/.../EARTHUS_V2_CODEX_MASTER_DIRECTIVE_P0_P12_2026-08-30.md` — V2 용, 무관) |
| `D:\` 4단계, `C:\Users\Dalur\{Downloads,Desktop,Documents,OneDrive}` | 없음 |
| `D:\## APP\Earthus v2_DOC\` (v3 폴더 포함) | 없음 |

따라서 "Master Directive 의 순서대로" 는 지금 따를 수 없다. 이 감사와 NEW BUILD 의 첫 단계는
wonder 3 에 실제로 있는 두 문서(자산 팩 1.8 README/스펙, LEGACY CLEANUP 지시서 §14 구조)만을 근거로 한다.

### ② wonder 3 에 있는 지시서는 "정리·삭제" 지시서이고, 사용자 지시와 충돌하는 부분은 보류한다

`EARTHUS_V3_WONDER_LEGACY_V3_CLEANUP_CLAUDE_DIRECTIVE_v1.md` 는 STEP 1 READ-ONLY AUDIT 뒤에
STEP 2~7(archive → local cleanup → **AWS legacy cleanup** → CI → SW → 검증)을 거쳐야 NEW BUILD 를 시작하라고 적었다.
사용자 지시는 **"기존 V3 수정 금지 · AWS 삭제 금지"** 다. 채팅 지시가 우선하므로:

- STEP 1 (READ-ONLY AUDIT): **이 문서로 수행.**
- STEP 2~7 (archive/삭제/CI 비활성/SW 정리): **전부 보류.** 아무것도 지우지 않았고 CI·SW·deploy 스크립트도 손대지 않았다.
- NEW BUILD 보호 규칙(§14 구조 `apps/web · packages · content · docs · tests`, 기존 경로 재사용 금지, 새 캐시 네임스페이스)은 **그대로 채택.**

### ③ 자산 팩 1.8 에는 캐릭터 그림이 없다 — 124종 그림의 유일한 출처는 기존 pack124 다

팩의 `INTERACTION_ASSET_STATUS.md` 는 "124 runtime images originate from approved full-body PNG/WebP character art" 라고 쓰지만,
팩 안에는 **배경 24장·FX 5개·JSON 3개·TS 1개**뿐이다. 그림 124장(+장면 124장)은 저장소의
`prototype/v3-paper/pack124/` 와 `prototype/v3-kids/pack124/` (둘은 `diff -rq` 로 **완전 동일**, 각 194MB, 전부 PNG)
그리고 원본 인수 패키지 `v3_CHARACTERS/EARTHUS_V3_CHARACTERS_124/` (697MB, PNG 349장 = characters 124 + scenes 124 + raw 101)에만 있다.
셋 다 git 미추적이다. 팩 JSON 의 124 slug ↔ 기존 manifest ↔ PNG 파일명은 **124/124/124 완전 일치**, 좌표·동작 diff 0.

### ④ 라이브 `earthus.net/v3` 는 v3-paper 이고, `app/v3/` 접두사에는 kids 와 paper 파일이 섞여 있다

S3 `app/v3/` 조회 결과 kids 의 `character-*.js`·`kids-i18n.js`·`paper-world.js`(2026-09-05) 와 paper 의 `src/`·`styles.css`·`weather.css`(2026-09-07) 가
같은 접두사에 공존한다(`earthus-deploy` 에 `s3:DeleteObject` 가 없어 옛 파일이 남는다 — deploy 스크립트 주석에도 적혀 있음).
새 WONDER 는 이 접두사를 **쓰지 않는다.**

### ⑤ (PHASE 0 중 발견) 팩 1.8 의 배경 24장은 배경이 아니다 — 참고 슬라이드를 잘라낸 조각이다

해시는 팩 카탈로그와 전부 일치하지만(팩은 내부적으로 일관됨), 24장을 접촉 시트로 놓고 보니 **한 장도 id 의 풍경이 아니다.**
어떤 디자인 스펙 슬라이드 덱 이미지를 1024×655 로 잘라 이름만 붙인 것으로 보인다(조각 안에 "해상도: 2048×1152 (배경) · 2048×2048 (캐릭터) · WebP 권장", "폴더 구조 예시", 파일 목록 글자가 그대로 보인다).

| 판정 | 장수 | 예 |
|---|---:|---|
| 슬라이드 글자 | 9 | aurora_01(스펙 글머리), desert_01("웃기/먹기·폴더 구조 예시"), night_01(파일 목록) |
| 테두리 딸린 썸네일(다른 장소) | 8 | korea_seoul_01=오로라, forest_01=경복궁, savanna_01=바닷속, korea_jeju_01=하늘 섬 |
| 캐릭터 조각 | 4 | tibet_01=북극곰, sahara_01=티라노+여우, grassland_01=한복 소녀+판다 |
| 히어로 아트 조각 | 3 | underwater_01=종이 나무+"EARTHUS V3 WONDER" 간판 |
| **사용 가능** | **0** | |

판정 전문은 `earthus-v3-wonder/content/pack-1.8/background-review.json`(24항목, 본 것을 한 줄씩 적음). 새 빌드는 검수 ok 가 아닌 배경을 **그리지 않고 종이 바탕**을 쓴다.
팩은 고치지 않았다. **실제 배경 24장(2048×1152 WebP) 재납품이 필요하다** — §6 결정 6.

---

## 1. wonder 3 인벤토리 (실측)

| 항목 | 값 |
|---|---|
| 경로 | `D:\## APP\EARTHUS v2_APP\wonder 3\` |
| git | 저장소 안, **미추적** (`?? "wonder 3/"`) |
| 파일 | 2개 (하위 디렉터리 없음) |
| `EARTHUS_V3_WONDER_1.8_INTERACTION_BACKGROUND_ASSET_PACK.zip` | 580,940 B · 44 항목 · 압축 해제 722,027 B · 항목 날짜 2026-09-13 12:29 (배경 webp 만 2026-09-12 08:07) |
| `EARTHUS_V3_WONDER_LEGACY_V3_CLEANUP_CLAUDE_DIRECTIVE_v1.md` | 9,873 B · 17절 · 삭제/정리 지시서 (§0-② 참고) |
| `CLAUDE_CODE_EARTHUS_V3_WONDER_WONDER3_MASTER_DIRECTIVE_v1.md` | **없음** |

### 1.1 자산 팩 1.8 내용 (스크래치패드에 풀어서 확인, wonder 3 에는 풀지 않음)

| 경로 | 수 | 실측 |
|---|---:|---|
| `runtime/wonder-interaction-engine.ts` | 1 | 1,573 B. 타입 `WonderAction` 11종, `resolveTap / resolveLongPress / resolveFart / getFx` 4함수. 전신 스프라이트 폴백 명시 |
| `assets/background/*.webp` | 24 | 합계 549,878 B (9,980~44,116 B), 전부 1024×655 RGB. id: aurora, australia, cave, coast, desert, forest, grassland, ice, island, jungle, korea_busan, korea_gyeongju, korea_jeju, korea_seoul, night, ocean, sahara, savanna, sky_island, sunset, tajmahal, tibet, underwater, volcano. **내용은 배경이 아님 — §0-⑤** |
| `assets/interaction/fx/*.svg` | 5 | fart-cloud, point-glow, sparkle, surprise, wave-lines — 전부 `currentColor`, 150~327 B |
| `data/background-catalog.json` | 1 | 24 항목: id · path · bytes · sha256_12 · load=`region-lazy` |
| `data/characters_124_runtime.json` | 1 | 82,299 B. 124종. 필드: slug·name·lat·lon(문자열)·league·moves(쉼표 문자열)·note·category·interaction{tap,longPress,special,fart,fartStyle,fallback} |
| `data/character-interactions-124.json` | 1 | 위 파일과 **바이트 단위 동일**(cmp) — 중복 |
| `docs/BACKGROUND_ASSET_SPEC.md` | 1 | 배경은 지역별 지연 로드, 5겹 제안(base paper env → main ambient → 1~2 secondary → discovery hit areas → character), 연속 영상 금지 |
| `docs/INTERACTION_ASSET_STATUS.md` | 1 | "124종 최종 팔·손 관절 애니메이션이 있다고 주장하지 말 것" — 파츠는 아트 파이프라인 대기 |
| `README.md` | 1 | NEW BUILD 용 content/runtime 입력. 기존 V3 를 수정하지 않는다 |

124종 분포(팩 JSON 실측): 리그 QUADRUPED 46 · BIPED 42 · SERPENT 21 · FLYER 15 / 분류 folklore 43 · animal 41 · prehistoric 40 /
`special` jump 55 · wiggle 47 · wave 17 · flap 5 / `fart:true` 20종(전부 `small-paper-puff`) /
`tap` 4패턴(greet→{jump|wiggle|wave|flap}→special) / `longPress` 1패턴(focus→point→special, 124종 동일).

팩 JSON 에 **없는** 필드(기존 manifest 에만 있음): `index`, `place_basis`(좌표 근거 지명), `character_image`, `scene_image`, `raw_fallback`.
새 Asset Registry 는 두 출처를 합쳐야 한다.

---

## 2. 기존 V1 / V2 / V3 지형 (로컬, 읽기만)

| 대상 | 위치 | 실측 | 상태 |
|---|---|---|---|
| V1 EARTHUS (현재) | `prototype/` 루트, `js/` 593파일 6.3MB, Cesium | `sw.js` 범위가 사이트 루트 | **보존** |
| V2 Intelligence (미래) | `prototype/v2-three/` 199파일 22MB → 번들 `v2-deploy/` 1,179파일 38MB, Three r184 | | **보존** |
| V3 kids (구) | `prototype/v3-kids/` 269파일 199MB. `index.html` **4,557줄 단일 파일** + 모듈 8개(character-core 243, character-globe 177, paper-character 173, paper-world 227, pack124-loader 95, kids-i18n 474, character-studio 405) | 루트 `/vendor/`·`/js/`(satimage, earth-switch, app-bar) 를 직접 참조 | **보존·수정 금지** |
| V3 paper (라이브) | `prototype/v3-paper/` 598파일 319MB. `src/` 23모듈, `data/` 36MB(경계·수심·강), `assets/` 아틀라스 PNG+WebP, `handoff/` 인계문서 17건, `vendor/` three 사본 | `.gitignore` 로 통째 제외 — **이 PC 에만 있는 운영 소스**(백업 공백, 기존 메모리에 기록됨) | **보존·수정 금지** |
| 124종 런타임 사본 | `prototype/v3-kids/pack124/` = `prototype/v3-paper/pack124/` (동일) | characters 124 PNG 1024² RGBA(합 79.8MB, 평균 643KB) + scenes 124 PNG 1536×1024 P + `docs/EARTHUS_V3_RUNTIME_MANIFEST_124.json` | **콘텐츠 원천** |
| 124종 원본 패키지 | `v3_CHARACTERS/EARTHUS_V3_CHARACTERS_124/` 697MB + 분할 zip 4개 + `CLAUDE_CODE_INTEGRATION_INSTRUCTIONS.md` | raw/ 101장 포함, WebP 0장 | **승인 원본, 보존** |
| 기획 문서 | `Earthus v2_DOC/v3/` — 124종 확정 목록(122 STAGE1 / 124 STAGE2 csv·md), 캐릭터 프롬프트 가이드 docx, paper-globe-live(코덱스 원본), character-studio-work, yeti | | 참고 |
| 저장소 기록 | `docs/V3-CHARACTER-PACK-124.md`, `V3-PAPER-GLOBE.md`, `V3-PAPER-WORLD.md`, `V3-CHARACTER-PROMPT-SPEC.md`, `CHARACTER-STUDIO.md`, `V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md`(이건 "V3 Simulation" 통합 감사 — WONDER 와 무관) | | 참고 |
| 공용 vendor | `prototype/vendor/`: three-r184(module+core, MIT 고지), earcut, satellite-6.0.2 | v3 두 판이 모두 상대경로로 읽음 | 서드파티 — 새 vendor 로 복사 가능 |
| 배포 스크립트 | `aws/deploy-v3-kids.sh`, `aws/deploy-v3-paper.sh` | **둘 다 `app/v3/` 접두사**, 상호 덮어쓰기 가드(라이브 HTML 검사 + FORCE 플래그, 2026-09-10), `/wonder` 별칭 3키, `<base href="/v3/">` 사본 | 손대지 않음 |
| CI | `.github/workflows/deploy-v3-kids.yml` | `prototype/v3-kids/**`·`aws/deploy-v3-kids.sh`·자기 자신 변경 시 **main 과 현재 브랜치 push 에서 자동 실행** → `app/v3/` 로 kids 를 올림(가드가 exit 5 로 막음) | 손대지 않음. **새 빌드는 이 경로를 절대 건드리지 말 것** |
| 공개 빌드 거름망 | `aws/_shared/public_build.py` DENY_RULES 에 v3-paper tools/handoff/PNG, v3-kids 저작도구 등 | 배포 원본은 `build/public-app/` 하나 | 새 빌드는 별도 거름망/경로 필요 |
| 서비스워커 | `prototype/sw.js` (`earthus-shell-2026-09-07-scope`) | 루트 범위. 통과 목록 하드코딩: `/v2 /v3 /Intelligence /wonder /v2-three /v3-paper /v3-kids /v2-deploy` (정확히 그 경로 또는 `경로/` 로 시작) | **새 배포 경로가 이 목록 밖이면 v1 SW 가 가로챈다** (§5 함정 1) |
| 지구 전환 메뉴 | `prototype/js/earth-switch.js` | `EARTHS` 의 wonder 항목: dev `/v3-kids/`, 운영 `/wonder` | 최종 전환 때 한 줄 바꿀 자리(지금은 안 바꿈) |
| 로컬 dev 서버 | `tools/dev_static_server.mjs`(루트 `prototype/`, env `EARTHUS_STATIC_ROOT` 로 변경 가능), `.claude/launch.json` `earthus-static`(8777) | `wonder 3/` 는 이 루트 밖 | 새 빌드용 서버 별도 |
| Node / Python | v24.18.0 / npm 11.16.0 / Python + PIL 12.3.0 | | 도구 사용 가능 |

### 2.1 git 상태 (감사 시작 시점 스냅샷, 스크래치패드 `git-status-baseline.txt` 238줄)

- 브랜치 `earthus-v2/real-living-earth-render`, HEAD `b1dd00a9` (감사 도중 이동 없음 — 2회 확인)
- 수정 51 · 미추적 184 (다른 세션의 작업 포함: `.claude/launch.json`, `aws/deploy-v3-*.sh`, `prototype/v3-kids/*.js` 등이 이미 ` M` 상태였다 — **내가 만든 변경이 아니다**)
- `wonder 3/` 는 미추적

---

## 3. AWS (읽기 전용 조회 결과)

| 항목 | 값 |
|---|---|
| 기본 프로파일 | **세션 만료** (`aws login` 필요) |
| `earthus-deploy` 프로파일 | 유효. `arn:aws:iam::294951922100:user/earthus-deploy` (`s3:DeleteObject` 없음 — 스크립트 주석·기존 메모리) |
| 버킷 | `earthus-cache-kr` (us-east-2), 앱 접두사 `app/` — **공용 버킷** (V1 `app/`, V2 `app/v2`, V3 `app/v3`, vendor, data 전부 여기) |
| `app/v3/` | PRE assets/ characters/ data/ pack124/ src/ vendor/ + kids 파일 12개(09-05) + paper 파일 3개(09-07) + 키 `app/v3/`(24,245 B, 09-07) |
| `app/wonder` · `app/wonder/` | 24,245 B 사본 (09-07) — `<base href="/v3/">` 얹은 paper index |
| CloudFront | `E193CZEBLWEB56` (`d3458uw9ftptt9.cloudfront.net`), 별칭 `earthus.net`·`www.earthus.net`, 오리진 S3 2개 + Lambda URL(ap-northeast-2) — **V1/V2/V3 가 공유하는 단일 배포. 삭제·행동 변경 대상 아님** |
| 라이브 `https://earthus.net/v3/` | 200, `<base href="/v3/">`, `<title>EARTHUS · 종이로 그린 지구</title>`, `src/main.js` 포함 → **v3-paper** |
| 라이브 `https://earthus.net/wonder/` | 동일 HTML |
| Route53 / CI 실행 이력 / Supabase | **미조회** (삭제 계획이 없으므로 이번 감사 범위에서 뺐다) |

삭제 판정(지시서 §4)은 하지 않았다 — 사용자 지시로 삭제 자체가 없다.

---

## 4. 재사용 vs 신규 — 판정표

원칙: **자산·자료·서드파티는 재사용, 엔진 코드는 신규.** 기존 V3 코드(`v3-kids/*.js`, `v3-paper/src/*`)는 한 줄도 복사하지 않는다.

### 4.1 재사용 — 콘텐츠·자료 (복사 시 Asset Registry 에 출처·해시 등록)

| 자산 | 출처 | 등록 방식 | 비고 |
|---|---|---|---|
| 배경 24 WebP · FX 5 SVG · 배경 카탈로그 · 124 인터랙션 JSON | 팩 1.8 | `content/` 에 원본 그대로 + 해시 검증 | 중복 JSON 1개는 등록 안 함 |
| 캐릭터 124 PNG (1024² RGBA) · 장면 124 PNG | `prototype/v3-paper/pack124/` (=`v3-kids/pack124/`) | PNG 원본은 두고 **WebP 변환본만** 새 content 에 (194MB 통째 복사 금지 — 지시서 §12) | 원본 판정은 `v3_CHARACTERS/` 승인 패키지 |
| `EARTHUS_V3_RUNTIME_MANIFEST_124.json` | `pack124/docs/` | `place_basis`·`raw_fallback`·`index` 를 팩 JSON 과 병합 | 두 출처 slug 완전 일치 확인됨 |
| 124종 확정 목록 csv/md · 캐릭터 프롬프트 가이드 | `Earthus v2_DOC/v3/122/`, docx | 문서 참조 | |
| three r184 · earcut · satellite.js (+라이선스 고지) | `prototype/vendor/` | 새 `apps/web/vendor/` 로 복사 (서드파티, 코드 의존 아님) | 필요해지는 단계에서 |
| 지리 자료(국경·시도 경계·수심 i16·강·해구·남극기지) | `prototype/v3-paper/data/` + `handoff/*-SOURCES.md` 라이선스 | 지구 단계에서 필요분만, 라이선스 문서 동반 | SGIS·OSM·ETOPO1·GSHHG·Natural Earth |
| 브랜드 로고 v5 | `Earthus v2_DOC/브랜드 시트/v5` | 새로 만들지 않음 | 기존 규칙 |
| 공용 데이터 발행본(기상·부이·지진·AETHERUS 스냅샷) | S3/CloudFront 공개 경로 | **읽기만** | 파이프라인 변경 없음 |
| kids-i18n 영어 사전 **문구** | `v3-kids/kids-i18n.js` | 문구만 자료로 추출 가능 | DOM 치환 방식은 **재사용 안 함** |

### 4.2 참고만 (읽되 복사 금지)

- `character-core.js` 의 MOVES 10종·LEAGUES 4종·CATEGORY 규약 — 새 스키마의 어휘로 채택(값), 코드는 새로 씀
- `paper-character.js` 의 알파 경계 측정(발끝 접지·키 정규화) 아이디어
- `kids-layers.js` 의 규칙: 비·구름·눈은 얼굴 있음, 태풍·번개는 없음 / 자료 없으면 안 그림 / GPS 안 씀
- 좌표 규약이 두 판에서 다름(v3-kids `surfaceNormal` vs v3-paper `geo.js`) — 새 엔진은 하나로 정한다
- 배포 함정 기록: `/v3`(슬래시 없음) 의 base href, S3 디렉터리 키, MSYS 경로 변환, CloudFront 10MB 압축 한계, iOS 캔버스 1024 한도

### 4.3 신규로 만들 엔진

| 엔진 | 팩 1.8 근거 | 비고 |
|---|---|---|
| **Asset Registry** | background-catalog 의 bytes·sha256_12·load | 전 자산 단일 색인: id·kind·path·bytes·sha256·source(팩1.8/legacy-pack124/원본)·load 정책. 레거시 런타임 번들 미등록(§12) |
| **Interaction Runtime** | `wonder-interaction-engine.ts` | 제스처(tap/longPress/fart) → 동작 시퀀스 → FX/스프라이트 폴백, reducedMotion, 124 프로필 검증 |
| **Stage / Background Engine** | BACKGROUND_ASSET_SPEC 5겹 | 지역별 지연 로드, ambient 1 + secondary ≤2, 연속 영상 금지 |
| **Character Renderer** | INTERACTION_ASSET_STATUS | 전신 빌보드 + 몸 전체 변형이 정상 경로. 관절 파츠는 아트 파이프라인 도착 뒤 |
| **Globe / Navigation** | (팩에 없음 — Master Directive 대기) | v3-paper 를 복사하지 않는다 |
| **Discovery hit areas · Story/Info card** | 5겹 중 4번째 | |
| **i18n (ko 원본 / en)** | — | 자료 기반(문구 키), DOM 치환 아님 |
| **Deploy path · cache namespace** | 지시서 §10·§14 | `app/v3/` 밖의 새 접두사, SW 없음 또는 새 범위 |
| **Test harness** | — | `node --test` 단위 + 브라우저 검증(Playwright) |

---

## 5. 함정·위험 (실측 근거)

1. **v1 `sw.js` 통과 목록이 하드코딩** — 새 경로가 `/wonder/…` 또는 목록의 경로 하위가 아니면 v1 워커가 요청을 가로채고 실패 시 v1 index.html 을 돌려준다(2026-09-07 실측 기록). 최종 배포 경로 결정 때 반드시 확인. (해결안: `/wonder/` 하위 경로 사용 또는 v1 sw.js 통과 목록 한 줄 추가 — 후자는 V1 변경이라 별도 승인 필요)
2. **CI `deploy-v3-kids.yml` 이 현재 브랜치 push 에 반응** — `prototype/v3-kids/**` 를 건드리는 커밋을 올리면 배포가 돈다(가드가 막지만 실행 자체는 된다). 새 빌드는 그 경로를 만지지 않는다.
3. **`app/v3/` 접두사 오염** — kids·paper 혼재, DeleteObject 권한 없음. 새 빌드는 별도 접두사.
4. **운영 v3 소스가 이 PC 에만 있음**(`prototype/v3-paper/` gitignore) — 새 빌드와 무관하지만 감사에서 재확인됨.
5. **동시 세션** — 같은 브랜치에서 다른 세션이 작업 중(`.claude/launch.json`·`aws/deploy-v3-*.sh` 등 이미 수정 상태). 공유 파일은 되도록 손대지 않고, 손대면 내 hunk 만.
6. **팩 JSON 의 `lat`/`lon` 이 문자열, `moves` 가 쉼표 문자열** — 기존 manifest 는 숫자·배열. 병합 시 형 변환 필요.
7. **`app/wonder` 별칭이 이미 라이브 v3-paper 를 가리킴** — 새 빌드가 `/wonder` 를 차지하는 순간이 곧 전환이다. 전환 전까지 다른 경로에서 검증.
8. Windows: 배포 스크립트의 MSYS 경로 변환, CRLF 경고, 한글 경로(`## APP`, `wonder 3` 의 공백).

---

## 6. 사용자 결정 대기

| # | 항목 | 지금 가정 |
|---|---|---|
| 1 | **Master Directive 파일** — `wonder 3/` 에 넣어 주면 그 순서로 재정렬 | 팩 1.8 + 지시서 §14 만으로 PHASE 0(기반) 진행 |
| 2 | 스택 — TS+번들러 vs 저장소 관행(번들러 없는 ESM) | PHASE 0 은 **ESM+JSDoc, 번들러 없음**(팩의 `.ts` 계약은 원본 그대로 동봉). 지시서가 TS 를 요구하면 옮기기 쉽다 |
| 3 | 배포 접두사 (`app/v3/`·`app/wonder` 재사용 금지) | 미정 — 로컬 검증만. 함정 1 참고 |
| 4 | 124 PNG → WebP 변환 품질·크기(1024² 유지 vs 축소) | PHASE 0 은 예티 1종만 변환해 파이프라인 증명, 일괄 변환은 결정 뒤 |
| 5 | CLEANUP 지시서 STEP 2~7 — 영구 보류인지, 새 빌드 안정 뒤 재개인지 | 보류 |
| 6 | **배경 24장 재납품** (§0-⑤) — 슬라이드 조각 안에 적힌 스펙(2048×1152 WebP)대로 실제 풍경 24장. 지역 배정(`content/backgrounds/regions.json`)은 그대로 쓸 수 있다 | 종이 바탕으로 진행, 배경은 무대에 안 그림 |

---

## 7. 이 감사의 검증 상태

| 게이트 | 상태 |
|---|---|
| Implemented | 해당 없음 (코드 변경 0) |
| Tested | 수치 전부 명령 실행으로 측정(unzip -l, cmp, diff -rq, find/wc/du, python 대조, aws s3 ls/cloudfront list, curl) |
| Browser Verified | 라이브 `/v3/`·`/wonder/` 는 curl 로만 확인(브라우저 미사용) |
| Device Verified | 해당 없음 |
| 무변경 증명 | 감사 시작 `git status --porcelain` 238줄 스냅샷 보관 → 이 문서와 `wonder 3/` 하위 신규 파일 외 변경 없음 |

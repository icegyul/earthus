# EARTHUS V3 WONDER — PHASE 1-B 보고서: Region Entry · Unfold · Wonder Environment (2026-09-13)

기준: PD "PHASE 1-B START AUTHORIZATION" §1~§13 + Master Directive §6·§7·§15·§16~§19·§20.
**"구현 완료"(IMPLEMENTED)와 "브라우저 검증 완료"(BROWSER VERIFIED)를 구분한다. Device Verified 는 0건.**

## 요약 게이트

| 항목 | IMPLEMENTED | TESTED | BROWSER VERIFIED | DEVICE |
|---|---|---|---|---|
| §1 CORE FLOW (Earth → 선택 → 접근 → unfold → 환경 활성 → discovery-ready / 복귀: fold → zoom-out → Earth, history 비의존) | ✅ | ✅ 상태기 6상태·가드·20회 | ✅ 3지역 왕복, 10회 반복 active 10/10 | ❌ |
| §2 REGION PROTOTYPE 3 (Himalaya · African Savanna · Amazon Jungle) | ✅ | ✅ 카탈로그·좌표=자료 | ✅ 히말라야/사바나/아마존 각각 라벨·랜드마크·캐릭터 | ❌ |
| §3 UNFOLD (접근 → 확대 → 겹 분리 → 환경 드러남 → ambient 시작; 첫 700~1000 / 재방문 150~250 / reduced 최소) | ✅ | ✅ 타이밍 first 900·revisit 200·reduced 80 | ✅ first 900ms · revisit 200ms(934ms 전체) · reduced 93ms | ❌ |
| §4 LANDMARK (지역당 1, 정체성, 가짜 지형 없음) | ✅ 기존 아틀라스 그림 3장 | ✅ 레지스트리·카탈로그 연결 | ✅ 3지역 렌더(마젠타 테두리 제거 후) | ❌ |
| §5 REGION LABEL (이름 + Wonder descriptor, 사실과 분리) | ✅ | ✅ descriptor≠fact, fact.verified=false | ✅ "히말라야 / 구름보다 높은 산" 등 | ❌ |
| §6 GLOW/BORDER (기본 OFF, 진입 때 얇은 글로우 링만) | ✅ 국경·해안 OFF, 표식 = 얇은 흰 링 | — | ✅ 접근 시 링, 복귀 시 숨김 | ❌ |
| §7 CHARACTER ON GLOBE (대표 캐릭터만, thumbnail → runtime → interaction) | ✅ | ✅ 썸네일 ≤3, LOD 경로 | ✅ 1단 줌에서 보이는 지역 썸네일 스프라이트, 환경에서 LOD1→LOD2→LOD3 | ❌ |
| §8 PERFORMANCE (124 로드 금지, 지역 lazy, 30MB) | ✅ | ✅ 로더 예산·LRU·unload | ✅ 첫 화면 content 요청 2건, 진입 시 캐릭터 파일 2건, heap 5~13MB | ❌ |
| §9 TEST 10종 | ✅ | ✅ 자동 13 + 브라우저 | 아래 §TEST | ❌ |
| §10 WEBP QA | ✅ | — | ✅ 접촉 시트 + 브라우저 렌더, `content/characters/review.json` | ❌ |
| §11 AWS 변경 0 | ✅ | — | — | — |

---

## [COMMIT]

| 커밋 | 내용 |
|---|---|
| `b3796259` | PHASE 0 기준선 |
| `71e1b3c4` | PHASE 1 Paper Earth |
| `189778bf` | PHASE 1 보고서 |
| **`77498fd93796e5a67680732d8b8038e920424992`** | **PHASE 1-B 코드** — 28파일 (+1,213 / −103), `git add -- "wonder 3"` 경로 지정, 다른 세션 변경 0건 포함 |
| (다음) | PHASE 1-B 보고서·LF 고정 |

push 안 함(PD 결정 대기). 브랜치 `earthus-v2/real-living-earth-render`.

## [FILES]

신규 16: `packages/wonder-environment/src/{environment-state,environments}.mjs` · `packages/asset-runtime/src/loader.mjs` · `apps/web/src/environment.mjs` · `content/environments/environments.json` · `content/landmarks/{himalaya,savanna,amazon}.webp` + `landmarks.json` · `content/characters/thumb/{yeti,lion,electric-eel}.webp` · `content/characters/review.json` · `scripts/extract-landmarks.py` · `tests/{asset-runtime,wonder-environment}.test.mjs`
변경 12: `apps/web/src/earth-main.mjs`(흐름 결합·스프라이트·요청 계측) · `apps/web/index.html`(#env, 뿡, styles.css) · `apps/web/earth.css`(+95줄 환경 겹·unfold/fold·ambient) · `apps/web/src/stage.mjs`(anchor 노출) · `packages/globe-engine/src/{earth,camera}.mjs`(글로우 링·스프라이트·project·durMs) · `scripts/{build-registry.mjs, convert-characters-webp.py}` · `content/characters/{manifest-124.json, source/source-manifest.json}` · `content/registry/asset-registry.json` · `tests/registry.test.mjs`
삭제 0. 기존 V3(`v3-kids`·`v3-paper`)·예티 등 Hobby 자산 무변경(읽기만).

## [TEST]

`node --test "tests/*.test.mjs"` → **41 / 41 PASS** (PHASE 1 의 28 + 신규 13)
- wonder-environment 5: 6상태 전이·첫/재방문 타이밍(900/200) · reduced(0/80/60/0) · 전환 중 재진입 거부·active 아닐 때 exit 거부·20회 반복 일관·abort · 카탈로그 3곳(지역·랜드마크·캐릭터 art thumb/runtime/scene·anchor=자료 좌표·descriptor≠fact·썸네일 ≤3) · environmentAt(반경 안/밖, 재규어=판타나우 제외)
- asset-runtime 8: 해시 URL·캐시 히트 · dedupe · 재시도 2회 뒤 성공 · maxRetries 초과 실패 · 타임아웃 재시도 · 취소 · **stale**(해시 바뀌면 재요청·옛 사본 close) · **예산 LRU**(pinned 제외)·unload·unloadWhere
- 기존 회귀 28 유지(registry --check 최신, kinds 확장)

PD §9 10종 대응: region entry ✅자동+브라우저 · unfold ✅ · reduced motion ✅ · return to Earth ✅ · repeated entry/exit ✅(자동 20회·브라우저 10회) · stale asset ✅자동+브라우저 · failed asset retry ✅자동+브라우저 · mobile layout ✅브라우저 375 · character lazy loading ✅브라우저 · no unnecessary 124 request ✅브라우저 계측

## [BROWSER] (인앱 Chromium, 콘솔 오류 0 — 404 3건은 의도한 실패 시험)

| 확인 | 결과 |
|---|---|
| 히말라야 진입 (에베레스트 지점 탭) | approaching(plan first: approach 900·unfold 900·stagger 110·fold 380·zoomOut 900) → unfolding → **active**, 라벨 "히말라야 / 구름보다 높은 산", 랜드마크 ready, 캐릭터 lod2, 뿡 버튼(예티 fart=true), `#hits[data-discovery-ready=true]`, 전체 2.3s |
| 캐릭터 톡 | greet → wave, FX sparkle/wave-lines 요청·표시, **Character Focus** 동안 `--amb-scale: 4`(환경 모션 ≈25%), 끝나면 해제 |
| 지구 복귀 | folding(380ms) → zooming-out → earth 2.2s. 자산 resident 4→2(런타임·랜드마크 unload, 썸네일 유지), 스프라이트 0, 칩·EARTH 숨김 |
| 재방문 | plan revisit(approach 700·unfold 200·fold 160), active 까지 934ms, 썸네일 캐시 히트, 런타임·랜드마크 재요청(unload 했으므로) |
| 움직임 줄이기 | plan reduced(0/80/60/0): 사바나 active 93ms, 복귀 77ms, 구름 애니메이션 none, 라벨·LOD 정상, 사자 fart 없음 → 뿡 숨김 |
| 아마존 | 라벨 "아마존 정글 / 비가 만든 초록 바다", 전기뱀장어 lod2, 랜드마크 amazon |
| 반복 10회 (3지역 순환) | active 10/10, 최종 earth, 20.6s, **heap 5.4 → 5.8MB**, 자산 resident 3(썸네일), evictions 0, 무대 잔여 캐릭터 0·FX 0 |
| 실패/재시도 | 없는 랜드마크 → 3회 시도(655ms) 뒤 실패, failures 카운트, 환경은 랜드마크 없이 열림 / 캐릭터 실패 시 자리표 + "그림을 받지 못했어요" |
| stale | 레지스트리 해시를 바꾸면 같은 경로를 다시 받고(loads +1, stale 1), 옛 사본 폐기 |
| 지구 위 캐릭터 | 1단 줌·(10,60) 시야: 히말라야·사바나 썸네일 스프라이트 표시, 아마존(뒷면) 없음. 2단 지역 줌은 32° 안 것만 |
| 375×812 | 사바나 진입 active, 라벨·랜드마크·사자 렌더, scrollWidth 375, heap 13MB(DPR 2), 복귀 1.3s |
| 발견한 결함 → 수정 | ① 숨은 패널에서 `img.decode()` 가 안 끝나 타임아웃 3회로 첫 이미지가 실패(timeouts 6) → onload 완료로 변경 후 timeouts 0 ② 랜드마크 마젠타 테두리 → unmatte 후 픽셀 88/35/22 로 감소, 화면에서 안 보임 ③ 2단 줌에서 먼 지역 썸네일까지 받음 → cos>0.85 |

## [NETWORK]

| 시점 | content/ 요청 | 크기 |
|---|---|---|
| 첫 화면 (지구) | **2** — `geo/country-reference.json` 426KB, `environments/environments.json` 3KB (+ 코드·three 771KB) | 첫 접속 ≈ 1.2MB |
| 첫 지역 진입 | +6 — registry 90KB · manifest-124 117KB · landmarks.json 2KB · 썸네일 9KB · 런타임 40KB · 랜드마크 17KB | ≈ 275KB |
| 재진입 | 런타임·랜드마크만(썸네일 캐시) | ≈ 57KB |
| 10회 반복 뒤 누적 | 총 18 요청: character-runtime 3 · character-thumb 4 · landmark 4 · fx 2 · 데이터 5 | |

## [MEMORY]

| 지표 | 값 |
|---|---|
| JS heap (Chromium) | 데스크톱 5.4~6.8MB(환경 활성), 10회 반복 뒤 5.8MB · 375px DPR2 13MB |
| asset-runtime 상주 | 예산 30MB 대비 최대 87KB(환경 활성: 썸네일+런타임+랜드마크), 복귀 뒤 29~40KB |
| GPU | 텍스처 2(지도+기본) + 스프라이트 ≤3(256² 각 256KB), 기하 3 |
| 판단 | 30MB target 안. 실기기 발열·GPU 실측 없음 |

## [ASSET REQUEST]

실제 요청 자산 수(지역 1회 진입, 히말라야): **캐릭터 파일 2**(썸네일 1 + 런타임 1) · 랜드마크 1 · 데이터 3. 장면(scene)은 요청 0(스토리 카드는 PHASE 8).
**124 전체 로드 0 · 124 scene 로드 0 · disabled line data 0 · hidden region asset 0.** 배경 24장(불합격) 요청 0.

## [REGION]

| 지역 | anchor(자료) | 라벨 | descriptor(감성) | fact(미검증, 화면 미표시) | 랜드마크(기존 그림) | 대표 캐릭터 |
|---|---|---|---|---|---|---|
| himalaya | 27.99, 86.93 (예티 설화 기준) | 히말라야 | 구름보다 높은 산 | 8,848.86m | 히말라야산맥(terrain 셀 0) | yeti |
| savanna | −2.33, 34.83 (사자 서식지) | 아프리카 사바나 | 노란 풀바다 위로 해가 크게 뜨는 곳 | 약 14,750km² | 세렝게티 초원(nature 셀 10) | lion |
| amazon | −3.10, −60.02 (전기뱀장어 서식지) | 아마존 정글 | 비가 만든 초록 바다 | 약 550만km² | 아마존 열대우림(nature 셀 2) | electric-eel |

재규어·카피바라는 자료상 판타나우(아마존에서 ~1,600km)라 아마존에 넣지 않았다. 아마존의 유일한 자료 캐릭터가 전기뱀장어다.

## [UNFOLD]

접근(카메라 트윈 900/700/0ms) → sheet 가 지역 화면 지점(`earth.project`)에서 scale .06→1 → 겹 6개(하늘·먼 산·구름·랜드마크·땅·무대) rotateX −88°→0 순차(stagger 110/30/0ms) → active(ambient: 구름 1 + 지역별 secondary 1: landmark-breathe / grass-sway / leaf-sway) → fold 역순(380/160/60ms) → zoom-out. `mode-reduced` 는 접힘 없이 80ms 페이드, ambient 없음. 첫 방문/재방문은 흐름 상태기가 방문 횟수로 결정(세션 메모리, 저장 없음).

## [CHARACTER]

LOD1 썸네일(256², 8~20KB) → LOD2 런타임(1024, 40~107KB) → LOD3 제스처(톡/꾹, 팩 1.8 계약). 지구 위에는 1단 줌부터 보이는 지역의 썸네일 스프라이트만(구 뒤로 가려짐). 관절 애니메이션은 없다 — 전신 스프라이트 폴백(지시서 §12). 뿡은 fart=true 캐릭터만 버튼.

## [AWS]

변경 0. `app/v3/` 무변경. staging `app/wonder/next/` · production `app/wonder/live/` 설계만. cleanup HOLD.

## [BLOCKERS]

1. **Device Verified 0** — 실기기(핀치·unfold 프레임·발열) 확인 경로 필요(LAN 노출 옵션 또는 `app/wonder/next/` 배포 승인)
2. 배경 24장 미납품 — 환경 바탕은 팔레트 그라데이션 + CSS 종이 겹. 납품 뒤 `Base Paper Layers` 로 교체
3. 아마존 대표 캐릭터가 전기뱀장어 1종뿐(자료 한계). 정글 캐릭터 추가는 콘텐츠 결정
4. push 여부 · launch.json 항목(공유 파일) 미커밋
5. 인앱 브라우저의 rAF 정지·decode 지연 — 검증은 `stepFrames` 와 onload 완료로 우회했고, 실제 프레임은 스크린샷 시점에만 돈다

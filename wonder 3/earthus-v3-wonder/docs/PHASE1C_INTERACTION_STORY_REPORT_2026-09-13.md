# EARTHUS V3 WONDER — PHASE 1-C 보고서: Character Interaction · Story · Earth Return (2026-09-13)

기준: PD "PHASE 1-B ACCEPTANCE / PHASE 1-C AUTHORIZATION" + Master Directive §11·§12·§13·§14·§15.
**구현 완료(IMPLEMENTED)와 브라우저 검증 완료(BROWSER VERIFIED)를 구분한다. semantic limb animation 은 구현되지 않았고 완료로 보고하지 않는다. Device Verified 0.**

코드 커밋 **`e1a0e1ff1c157cc4cc6f64d0804720de5c6f5513`** (8파일 +266/−38, 경로 지정, 다른 세션 변경 0건). 테스트 **44/44**. AWS 변경 0.

## PHASE 1-B 잔여 항목 처리

| # | 항목 | 상태 |
|---|---|---|
| 1 | 배경 24장 production asset | **미승인 유지.** 환경 바탕은 개발용(팔레트 그라데이션 + CSS 종이 겹)이며 production asset 으로 간주하지 않는다. `background-review.json` 24/24 invalid 그대로 |
| 2 | 아마존 대표 캐릭터 electric-eel | **정식 자산 확인** — 승인 확정 목록(STAGE2) 123번, 원본 패키지 `v3_CHARACTERS/EARTHUS_V3_CHARACTERS_124/characters/electric-eel.png`(619KB)·`scenes/electric-eel_scene.png`(999KB), `raw_fallback: null`(크로마 키 보정 없이 통과), 1024² RGBA 알파 경계 정상, 시각 QA ok. **placeholder 아님.** fallback 인 것은 애니메이션(전신 스프라이트/FX)뿐이며 카드·LOD 표기에 그렇게 남긴다. 장면 그림 안에 제작 시 라벨판("EARTHUS v3 ELECTRIC EEL …")이 그려져 있음 — 콘텐츠 검토 항목 |
| 3 | Device verification | 별도 QA gate. 이 보고서의 [DEVICE] 참조 (0건) |
| 4 | push / launch.json | push 안 함. launch.json 은 기능 blocker 아님(미커밋 유지) |

---

## [3 REGION E2E]

흐름 `Earth → Region → Unfold → Wonder Environment → Character → Tap → Wave/Greeting → Long Press → Point → Special → Story Card → Fold → Earth` 를 세 지역에서 같은 스크립트(`window.__e2e`)로 실제 브라우저에서 돌렸다.

| 지역 / 캐릭터 | 진입→active | 탭 시퀀스 | 꾹 시퀀스 | 뿡 자격 | 스토리 카드 | 복귀 |
|---|---|---|---|---|---|---|
| 히말라야 / 예티 | 1,828ms(first) | `greet → wave` ✅ (special=wave) | `focus → point` ✅ | **가능**(fart=true) → `fart` FX | `story-yeti-himalaya` "눈 위의 커다란 발자국", 설화, 장면 lazy ✅ | folding → earth 1,586ms ✅ |
| 사바나 / 사자 | 1,832ms | `greet → jump` ✅ | `focus → point` ✅ | **불가**(fart=false) → 버튼 숨김, 강제 호출 시 `reaction` | `story-lion-savanna` "갈기를 가진 친구", 자연 ✅ | 1,576ms ✅ |
| 아마존 / 전기뱀장어 | 1,811ms | `greet → wiggle` ✅ | `focus → point` ✅ | **불가** → `reaction` | `story-electric-eel-amazon` "전기를 만드는 물고기", 자연 ✅ | 1,746ms ✅ |

세 지역 모두 IMPLEMENTED ✅ · BROWSER VERIFIED ✅ · DEVICE ❌.

## [CHARACTER]

- 로딩: 지역 진입 때만 **LOD1 썸네일(256², 8~20KB) → LOD2 런타임(1024, 40~107KB) → LOD3 제스처**. 지구 위에는 1단 줌부터 보이는 지역 썸네일 스프라이트만. 124 eager loading 0.
- 자산 출처: 승인 124 팩(WebP 1024/q85 baseline). 세 종 모두 시각 QA ok(`content/characters/review.json`).
- **관절(semantic limb) 애니메이션 없음.** 동작은 전신 CSS 변형 + 팩 FX(sparkle·wave-lines·point-glow·fart-cloud). 카드·보고서 어디에도 "손·팔 애니메이션 완료"라고 쓰지 않는다.

## [TAP]

`resolveTap(profile)` = `['greet', special]` — special 은 manifest 의 캐릭터별 정의(예티 wave · 사자 jump · 전기뱀장어 wiggle). 브라우저: 탭 250ms 시점에 `greet` FX(sparkle) 표시, Character Focus(`--amb-scale 4`) 활성, 카드는 반응 중 닫힘 유지, 반응이 끝난 뒤 카드가 열림. reducedMotion 이면 `greet → reaction`(자동 테스트).

## [LONG PRESS]

`resolveLongPress(profile)` = `['focus', 'point']` (special 이 point 인 캐릭터만 `look` — 3종 해당 없음). 브라우저: 합성 pointerdown 650ms → 무대 `.focused`, 캐릭터 `focused anim-point`, `point` FX(point-glow). 세 지역 동일.

## [SPECIAL]

캐릭터별 special = manifest `interaction.special` ∈ moves (자동 테스트가 124종 전부 검사). 탭 시퀀스의 두 번째 동작으로 재생됐고(`wave`/`jump`/`wiggle`), 별도 `env.special()` 호출 경로도 둔다. 124종이 같은 반응을 쓰지 않는다 — special 분포 jump 55 · wiggle 47 · wave 17 · flap 5.

## [FART ELIGIBILITY]

manifest `interaction.fart === true` 인 **20종만** 자격(자동 테스트로 고정). 예티 ✅(버튼 표시·`fart` FX), 사자 ❌·전기뱀장어 ❌(버튼 숨김, 런타임이 `reaction` 으로 대체). fart 는 기본 행동이 아니다.

## [STORY]

- 데이터 `content/stories/stories.json` 3편 — §14 필드 전부(storyId·characterId·locationId·title·body·heroImage·sceneImages[]·narrationScript·audioUrl·videoUrl), 미디어 필드는 null. `basis` folklore(예티) / nature-fact(사자·전기뱀장어), `sources` 에 manifest 근거 + "상식 — PHASE 2 출처 확정" 표기, 본문에 구체 수치 없음(자동 테스트).
- 카드: 정적 장면(1024×683 WebP) + 제목 + 읽을 글(17px·1.75) + 캐릭터 정체성(이름·분류) + 지역 정체성(이름·descriptor) + "전해 내려오는 이야기예요 / 자연에서 알려진 이야기예요" 근거 표기 + 닫기 + 🌍 지구. PLAY·AI narration·TTS·video 없음.
- **장면은 캐릭터 반응 뒤 카드가 열릴 때 처음 요청**(브라우저: sceneRequests before 0 → after 1, 반응 중 0). 다시 열면 캐시(요청 증가 0).
- 카드 열림 동안 ambient 최소(`--amb-scale 8`), 힌트 숨김.

## [RETURN TO EARTH]

카드의 🌍 지구 → 흐름 `exit()`(카드 닫힘) → folding(380/160ms) → zooming-out → earth. 세 지역 1.5~1.7s. 카드 닫기만 하면 환경에 남고, `Escape`/상단 EARTH 도 같은 경로. history 비의존.

## [NETWORK]

| 시점 | content/ 요청 |
|---|---|
| 첫 화면 | 2 (지구 자료 426KB + 환경 카탈로그 3KB) |
| 첫 지역 진입 | +6 (registry 90 · manifest-124 117 · landmarks.json 2 · 썸네일 · 런타임 · 랜드마크) |
| 첫 탭 → 카드 | +2 (stories.json 4KB · 장면 ~100~200KB) — **story preload 0** |
| 3지역 순회 + 히말라야 재방문 뒤 누적 | 25 요청: character-runtime 4 · character-scene 3 · character-thumb 4 · landmark 4 · fx 4 · 데이터 6 |
| **재방문(히말라야 2회차)** | **네트워크 +0** — 로더 hits +5, loads 0 (썸네일·런타임·랜드마크·장면 전부 캐시) |

124 full pack 0 · hidden region 0 · 배경 0 · unnecessary 0(요청 전부 현재 지역 것). 캐시 요소 재사용 수정 전에는 재방문 때 새 `<img>` 로 3건이 다시 왔었다(no-store) — 수정 후 0.

## [MEMORY]

| 지표 | 값 |
|---|---|
| JS heap | 데스크톱 3지역 + 재방문 뒤 5.7MB · 375px DPR2 8.9MB |
| 로더 상주 | 3지역 뒤 12 자산 718KB(예산 30MB), evictions 0, failures 0, timeouts 0 |
| GPU | 텍스처 2 + 스프라이트 ≤3 |

## [BROWSER]

인앱 Chromium, 콘솔 오류 0(버퍼의 404 3건은 1-B 의 의도한 실패 시험). 데스크톱 800×600·1024×768, **375×812**(아마존: 탭 → 카드 하단 시트, scrollWidth 375, 복귀 1.5s). 증거 스크린샷: 히말라야 카드(데스크톱), 아마존 카드(375). 자동 검증은 `stepFrames` 로 프레임을 밀었고 실제 프레임은 스크린샷 시점에만 돈다(기존 함정).

## [DEVICE]

**0건.** Android/iPhone 실기기는 별도 QA gate. 확인 경로(LAN 노출 또는 `app/wonder/next/` 승인) 미결.

## [BLOCKERS]

1. Device gate 0 (위)
2. 배경 24장 미승인 → 환경 바탕은 개발용
3. 스토리 본문의 자연 상식 출처 표기 확정(PHASE 2) — 지금은 `sources` 에 "상식" 으로만 표시, 수치 없음
4. 장면 그림에 제작 라벨판이 그려져 있음(팩 원본) — 카드용으로 라벨 없는 장면이 필요하면 콘텐츠 결정
5. push · launch.json(기능 blocker 아님)

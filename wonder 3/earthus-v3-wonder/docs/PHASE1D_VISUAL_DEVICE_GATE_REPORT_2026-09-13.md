# EARTHUS V3 WONDER — PHASE 1-D 보고서: Wonder Visual Polish + Device Gate (2026-09-13)

기준: PD "PHASE 1-C ACCEPTED / PHASE 1-D AUTHORIZATION". **기능 구현 PASS 와 production asset approval 을 혼동하지 않는다.** 어떤 배경도 이 보고서로 승인되지 않는다. 실기기 검증은 Claude Code 가 할 수 없어 하네스와 절차만 준비했고 결과는 0건이다.

## [PHASE 1-D]

| 항목 | 상태 |
|---|---|
| 1 BACKGROUND 24 | 팩 1.8 24장 검사 완료 → **전부 불합격**(해상도 1024×655/652, 눈 검수 24 invalid). 로컬 ComfyUI 로 스펙(2048×1152) **후보 24장 제작·눈 검수 ok** — `benchmarks/background-candidates/`, **production_approved 0, 승인 대기** |
| 2 SCENE LABEL | REGION · CHARACTER · STORY 3단 구조 + descriptor 〝인용〞+ "느낌 말" 표 + 자료 근거 줄 — 브라우저 확인 |
| 3 DEVICE GATE | **0건.** `?qa=1` 하네스(14단계 자동 체크·성능 기록·결과 복사) + `--lan` 서버 + 체크리스트 문서 준비. 인앱 브라우저에서 하네스 동작만 확인 |
| 4 PERFORMANCE | 실기기 측정 0. 하네스가 기록하는 항목: 처음/지역 전송량·요청 수·캐릭터 파일 수·fps·끊김·heap·상주 |
| 5 ELECTRIC EEL | **정식 자산 확인**(sha256 사슬) → blocker 제거 |
| 6 INTERACTION | tap·longPress·special·selected fart PASS 유지. semantic joint/limb animation **미구현** 유지 |
| 7 PHASE 2 | 착수 안 함 |
| 8 AWS | 변경 0 |
| 9 GIT | push 안 함. 로컬 커밋 `28284135`(하네스·카드·검사) + 이 보고서 커밋 |

## [BACKGROUND 24]

### 기존 팩 1.8 (production 아님 — 유지)
`scripts/check-backgrounds.py` → `content/pack-1.8/background-qa.json`: 24장 모두 WebP·≤500KB·알파 없음은 통과하지만 **해상도 1024×655(3장 652) 로 2048×1152 미달**, **눈 검수 24장 invalid**(슬라이드 글자 9·타 장소 썸네일 8·캐릭터 조각 4·히어로아트 3), spec_pass 0, production_approved 0. 구도·대비·mobile crop 검사는 내용이 배경이 아니라 보류. 무대는 계속 개발용 그라데이션 바탕이며 이를 production 으로 보지 않는다.

### 후보 24장 (승인 아님)
로컬 ComfyUI Z-Image Turbo, `scripts/gen-backgrounds.py`, 2048×1152, 8 steps, RTX 3070 약 22~26초/장, WebP q85 47~246KB(합계 2.7MB).

| 검사 | 결과 |
|---|---|
| resolution 2048×1152 | 24/24 |
| file size ≤ 500KB | 24/24 (최대 246KB) |
| WebP · 알파 없음 | 24/24 |
| visual quality · paper-cut consistency | 24/24 (Claude 눈 검수: 종이 겹·그림자·무광 질감 일관) |
| region suitability | 24/24 (라벨 요소: 남산 타워·광안대교·첨성대·한라산·울루루·타지마할·킬리만자로 실루엣 등) |
| 금지 항목(text·watermark·UI·타장소 썸네일·character·hero card·frame) | 24/24 없음 — 1·2차 프로브에서 프레임이 생겨 프롬프트를 고쳤고(§7 스펙 기록), cave/ocean/ice 3장은 전용 프롬프트로 2차 제작 |
| mobile crop (가운데 40%·폰 26% 안전영역) | 24/24 식별 요소가 가운데 안 (접촉 시트 안내선으로 확인) |
| foreground(하단 28%) | 24/24 평평한 바닥 띠 |
| contrast against character | **실기기 확인 필요** — tibet/aurora/ice 의 밝은 바닥 위 흰 캐릭터(예티) 대비는 폰에서 봐야 한다 |
| loading behavior | 현재 무대는 검수 ok 배경만 region-lazy 로 1장 받는 구조(PHASE 1-B). 후보 반영 시 같은 경로(≈100~250KB/지역) |
| **production_approved** | **0 / 24 — PD 승인 대기** |

비고: korea_jeju_01 산 정상의 붉은 분화구 점(한라산은 활화산 아님 — 콘텐츠 검토), sky_island_01 은 떠 있는 섬 1개(브리프보다 적음), sunset_01 에 언덕·나무 포함(허용). 판정·비고 전문 `benchmarks/background-candidates/candidates.json`, 자동 검사 `candidates-qa.json`, 접촉 시트 `contact-sheet.png`(구도 안내선 포함, 4.3MB, git 제외).

**승인 뒤 절차:** 후보 → `content/pack-1.8/backgrounds/` 교체 → `background-review.json` verdict ok → `check-backgrounds.py` → `build-registry.mjs` → 무대가 배경을 그리기 시작(코드 변경 없음) → 브라우저·실기기 대비 확인.

## [SCENE LABEL]

카드 = REGION · 지역(이름 ko/en, 〝descriptor〞 + **느낌 말** 표, "자리의 근거(자료): …") / CHARACTER · 친구(이름·분류, 서식지·좌표) / STORY · 이야기(제목·본문·"전해 내려오는 이야기예요(사실이 아닐 수 있어요)" 또는 "자연에서 널리 알려진 이야기예요"). 환경 라벨도 descriptor 를 인용 부호 + 느낌 말 표로. 브라우저(데스크톱·375): 3섹션 텍스트 확인, 카드 열림 시 힌트 숨김.

## [ELECTRIC EEL]

`docs/ELECTRIC_EEL_ASSET_VERIFICATION.md`: STAGE2 123번 · 원본 패키지 PNG(619,574 B / 999,061 B) sha256 `8445e71b…5761` / `d4ba7d5d…e7d2` = 레거시 사본 = `source-manifest.json` 기록 → 런타임 WebP(1024² 74,570 B · 장면 140,514 B · 썸네일 11,518 B) 레지스트리 등록 → manifest art ready · interaction = 팩 1.8 → 브라우저 렌더. `raw_fallback: null`. **fallback 은 애니메이션(전신 스프라이트/FX)뿐.** 장면 그림의 제작 라벨판은 원본 팩 내용(콘텐츠 검토). → **blocker 제거.**

## [ANDROID]

**미검증(0건).** 절차 `docs/DEVICE_GATE_CHECKLIST.md`: `node scripts/dev-server.mjs 8790 --lan` → 폰에서 `http://<PC IP>:8790/apps/web/?qa=1` → 14단계 터치 → [결과 복사] JSON 을 `docs/device-gate/android-<날짜>.json` 으로.

## [IOS]

**미검증(0건).** 같은 절차, Safari. iOS 는 `performance.memory` 가 없어 heap 은 n/a 로 기록된다.

## [TOUCH E2E]

실기기 0. 하네스 자체 검증(인앱 Chromium): 합성 터치 이벤트(pointerType touch)로 데스크톱 13/14 자동 체크(하단 시트는 폭 조건), 375×812 에서 하단 시트 단계 체크 → 14/14 가능. 체크 조건은 실제 상태 변화(카메라 경도 변화·줌 단·흐름 상태·시퀀스·카드 상태·방문 수·reduced plan)다.

## [PERFORMANCE]

실기기 0. 하네스 기록 항목: initialTransferKB/요청, sinceRegionTransferKB/요청, contentRequests·characterFiles·byKind, heapMB, 로더 status, fps(최근 300프레임)·100ms 초과 끊김·최대 프레임, firstFrameMs·부팅 marks. 인앱 데스크톱 참고값: 처음 1,283KB/21req(three 733·지리 426·QA 모듈 포함), 지역 후 329KB/10req, 캐릭터 파일 5(2지역), heap 6.2MB.

## [NETWORK]

변화 없음(1-C 와 동일 구조): 첫 화면 content 2건, 진입 +6, 카드 +2, 재방문 0, 124 일괄 0. QA 오버레이는 `?qa=1` 일 때만 모듈 1개 추가.

## [MEMORY]

인앱 데스크톱 heap 5.7~6.2MB, 375 에뮬레이션 8.9MB(1-C). 상주 자산 ≤ 718KB / 30MB. 실기기 값 없음.

## [REGRESSION]

`node --test` **46/46**(1-C 44 + 배경 QA 2). 브라우저: 히말라야 e2e(진입→톡→카드 3섹션→🌍→earth) 재확인, 375 아마존 카드 하단 시트 재확인, 콘솔 오류 0.

## [AWS]

변경 0 · `app/v3/` 변경 0 · cleanup HOLD.

## [GIT]

브랜치 `earthus-v2/real-living-earth-render`, 로컬 커밋: `b3796259`(기준선) → `71e1b3c4`(1) → `189778bf` → `77498fd9`(1-B) → `4c03512a` → `e1a0e1ff`(1-C) → `d89becc2` → `28284135`(1-D 하네스) → (이 보고서). **push 안 함.** wonder 3 밖 파일 변경 없음(다른 세션 변경 229건은 그대로). `.claude/launch.json` 항목은 미커밋(blocker 아님).

## [REMAINING BLOCKERS]

1. **배경 24 승인** — 후보 24장 PD 눈 검수·승인 필요(특히 흰 캐릭터 대비, 제주 분화구 점)
2. **Device gate** — Android/iOS 0건. 하네스 준비 완료, 실행은 사람
3. 실기기 성능 값 0
4. push 여부 결정 (PD)
5. (blocker 아님) semantic limb animation 미구현 유지 · 스토리 상식 출처 PHASE 2 · 장면 라벨판 콘텐츠 검토

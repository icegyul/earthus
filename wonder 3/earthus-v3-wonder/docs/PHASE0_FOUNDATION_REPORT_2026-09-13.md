# EARTHUS V3 WONDER — PHASE 0 (기반) 보고서

2026-09-13 · `wonder 3/earthus-v3-wonder/` · 감사 문서 `wonder 3/docs/WONDER3_READONLY_AUDIT_2026-09-13.md` 의 후속

**전제.** Master Directive 파일이 없어 이 단계는 팩 1.8 문서 + CLEANUP 지시서 §14 구조만으로 만들었다.
어떤 순서의 지시서가 오더라도 맨 앞에 있어야 하는 것(골격·콘텐츠 반입·자산 색인·인터랙션 계약 실행체·무대 셸)만 담았다.
스택은 저장소 관행대로 **번들러 없는 ESM** (Node 24 · 브라우저 직접 로드). 지시서가 TS/번들러를 요구하면 옮긴다.

## 게이트

| 게이트 | 상태 | 근거 |
|---|---|---|
| **Implemented** | ✅ | 아래 목록 전부 파일로 존재 |
| **Tested** | ✅ 17/17 | `node --test "tests/*.test.mjs"` — 런타임 10 · 레지스트리/검수/선택기 7 |
| **Browser Verified** | ✅ (데스크톱 800×600 · 모바일 375×812, 인앱 Chromium) | 아래 §3 |
| **Device Verified** | ❌ 없음 | 실기기(아이폰·안드로이드) 미확인. 실제 손가락 꾹 누르기·iOS 사파리·발열은 미측정 |

## 1. Implemented

| 항목 | 파일 | 비고 |
|---|---|---|
| 프로젝트 골격 (§14) | `apps/web · packages · content · docs · tests · tools`, `package.json` | 기존 V3 코드 0줄 |
| 팩 1.8 반입 | `content/pack-1.8/` 배경 24 · FX 5 · 카탈로그 · 124 인터랙션 JSON, `packages/interaction-runtime/contract/*.ts`, `docs/` 사본 3 | 원본 zip 은 그대로. 중복 JSON 1개는 반입 안 함 |
| **Asset Registry** | `scripts/build-registry.mjs` → `content/registry/asset-registry.json` (35 자산) | sha256·bytes·출처·load 정책. 팩 카탈로그 sha256_12 대조(24/24 일치). 검수 기록 없는 배경은 오류 |
| **124종 manifest 병합** | → `content/characters/manifest-124.json` | 팩 JSON(인터랙션) + 기존 manifest(index·place_basis) — 기존 파일은 읽기만. 좌표 diff 0 |
| **배경 눈 검수** | `content/pack-1.8/background-review.json` | 24장 전부 invalid (슬라이드 조각). 감사 §0-⑤ |
| **Interaction Runtime** | `packages/interaction-runtime/src/index.mjs` | 계약 4함수 1:1 + `normalizeEntry`·`validateManifest`·`profileOf`·`expandSpecial`·`contextFromEnvironment` |
| **배경 선택기** | `packages/stage-engine/src/background-resolver.mjs`, `content/backgrounds/regions.json` | 좌표 → 반경 안 최근접 지리 배경, 밖이면 fallback. 지역 배정은 잠정 |
| **무대 셸** | `apps/web/index.html · styles.css · src/{main,stage,gestures}.mjs` | 겹 4(배경·발견[비어 있음]·캐릭터·FX). 배경 1장 지연 로드 + ambient 1. 검수 불합격 배경은 종이 바탕. 톡/꾹(포인터 450ms)/키보드(Enter·Shift+Enter)/뿡 버튼/움직임 줄이기. 재생 중 재입력 무시. 카드(장면·자리 근거·note). 서비스워커 없음 |
| **PNG→WebP 변환기** | `scripts/convert-characters-webp.py` | 레거시 pack124 를 읽기만. PHASE 0 은 yeti 1종: 캐릭터 489KB→40KB, 장면 899KB→255KB |
| dev 서버 · 실행 항목 | `scripts/dev-server.mjs`(루트=이 프로젝트, 8790, no-store), `.claude/launch.json` `wonder3-static` 항목 추가 | launch.json 은 다른 세션이 이미 수정 중이던 공유 파일 — **내 hunk(항목 1개 추가)만** 넣었다 |

## 2. Tested (node --test, 17 통과)

- 계약 원본 TS 동봉(1,573 B) · resolveTap/LongPress/Fart · getFx 매핑 · normalizeEntry 형 변환 · validateManifest 격리(잘못된 항목만 제외)
- **팩 124종: 오류 0 · folklore 43/prehistoric 40/animal 41 · fart 20 · special ∈ moves · longPress 124종 동일 · special 은 {jump, wiggle, wave, flap}**
- profileOf/expandSpecial 124종 전부
- registry `--check` 최신 · 모든 항목 파일 존재·bytes·sha256 일치 · content/ 밖 경로 없음 · 배경 24/FX 5 · 카탈로그 해시 대조 · zip sha256 기록
- 배경 검수 24항목·verdict/category 집계 일치·불합격은 `load=blocked-by-review`
- PNG 원본 미등록 · manifest 124종 index/place_basis 병합 · art 상태가 실제 파일과 일치
- 배경 선택기 8사례(예티→tibet, 해태→서울, 경주 vs 부산, 제주, 네시→fallback, 캥거루/버닙→호주, 바롱→fallback, 서울–부산 325km)

## 3. Browser Verified (인앱 브라우저, http://localhost:8790/apps/web/)

| 확인 | 결과 |
|---|---|
| 부팅 | 콘솔 오류 0 · 네트워크 전부 200 · 레지스트리/manifest/regions/review 4파일 로드 · `PHASE 0 · 기반 · 준비됨` |
| 배경 | 예티 → `tibet_01` 선택(350km) → **검수 불합격(character-crop) → 종이 바탕**, `#bg` 이미지 0개 (검수 전에는 북극곰 조각이 배경으로 떴다 — 그게 발견 계기) |
| 톡 (실제 클릭) | `greet → wave`, 머리 위 불꽃 FX, 카드 열림(설화 배지·예티 장면 WebP·"자리의 근거: 설화 기준: 에베레스트산 (27.99, 86.93)") |
| 꾹 (합성 pointerdown 650ms → pointerup) | `focus → point`, 무대 어두워짐(`.focused`), 포인트 글로우 FX, 캐릭터 기울기 |
| 뿡 | `fart` — FX 요소 50ms~1000ms 존재(흰 바탕에선 잘 안 보임, 색 조정은 PHASE 2) |
| 움직임 줄이기 | `greet → reaction` (계약대로) |
| 캐릭터 전환(해태) | 자리표("그림 변환 대기 · QUADRUPED_PAPER · folklore"), `korea_seoul_01` 선택(1km)→검수 불합격→종이 바탕, 뿡 버튼 숨김, 톡 `greet → jump`, 카드 "장면 그림 변환 대기" |
| 모바일 375×812 | 캐릭터 374px, 톡 동작, 카드가 하단 시트, 가로 넘침 없음(scrollWidth 375). 기록 창이 독을 가리던 것은 CSS 로 위로 옮김(그 뒤 재캡처는 안 함) |

**안 한 것:** 실제 손가락 꾹(합성 이벤트로만), iOS Safari, 저사양 폰 프레임, 키보드 경로 실측(코드만).

## 4. 이 단계에서 드러난 사실

1. **배경 24장 전부 불합격** — 감사 §0-⑤. 실제 배경 재납품 전까지 무대는 종이 바탕이다.
2. 팩 JSON 은 lat/lon 문자열·moves 쉼표 문자열 → 런타임이 정규화한다(테스트 있음).
3. 뿡 FX 색(#b9c7b3)이 밝은 바탕에서 거의 안 보인다 — 실제 배경이 오면 다시 본다.
4. HEAD 가 감사 도중 `b1dd00a9 → 177f055d` 로 움직였다(다른 세션). wonder 3 와 무관한 파일이었다.

## 5. 다음

`docs/BUILD_DIRECTIVE_DRAFT_v0.md` — Master Directive 가 오면 그 순서로 바꾼다.

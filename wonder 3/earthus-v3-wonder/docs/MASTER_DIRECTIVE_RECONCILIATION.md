# Master Directive ↔ 현재 골격 대조표 (2026-09-13, 코드 변경 없음)

기준 문서: `docs/MASTER_DEVELOPMENT_DIRECTIVE.md` (v1.0, SHA-256 e41a6652…ca95, §0~§37).
이 표는 지시서를 읽고 **PHASE 0 산출물과 DECISION LOCK 이 지시서와 어디서 맞고 어디서 다른지**를 적은 것이다. 정렬 작업은 PD 승인 뒤 한다.

## 1. 맞는 것 (변경 불필요)

| 지시서 | 현재 |
|---|---|
| §0 NEW BUILD ROOT, 기존 V3 미복사·미수정, AWS 미삭제 | 감사·PHASE 0 전부 준수. AWS 쓰기 0 |
| §1 대상 4~9세, 핵심 경험 `발견 → 터치 → 살아남 → …` | UI-V3-WONDER 결정과 동일 |
| §9 카테고리 124 = 설화 43 · 공룡/선사 40 · 동물 41 | manifest-124 실측 일치 |
| §12 단일 full-body PNG 로 관절 애니메이션 "완성" 주장 금지, sprite fallback 허용 | 런타임 주석·보고서에 동일 규칙 |
| §16 Asset Registry(id·hash·byte size…) · §19 content hashing/immutable cache/PNG 일괄 로딩 금지 | `asset-registry.json`(sha256·bytes·load) + 배포 지도 §4(해시 파일명·immutable). PNG 미등록 |
| §32 PHASE 0 Read-only Audit 산출(legacy asset/feature/AWS inventory, gap list) | `wonder 3/docs/WONDER3_READONLY_AUDIT_2026-09-13.md` |
| §32 PHASE 6 "대표 3종(folklore·dinosaur·animal) Golden Path" | 벤치마크 3종(haetae·triceratops·red-panda)과 같은 구성 |
| §34 DONE = Implemented / Automated Tested / Browser Verified / Device Verified | 보고 형식 동일 |
| §36 LEGACY AWS CLEANUP RULE (discovery → identification → inventory → **user-approved** delete → verify) | DECISION LOCK 5 보류와 양립. 삭제 0 |

## 2. 다른 것 — 정렬이 필요한 항목 (PD 결정 필요, 코드 변경 전)

| # | 지시서 | 현재 | 제안 |
|---|---|---|---|
| R1 | §31 루트가 `wonder 3/` 바로 아래 `apps/ packages/ content/ tests/ docs/ scripts/` | `wonder 3/earthus-v3-wonder/` 한 단계 아래 + `scripts/` | (a) 그대로 두고 `wonder 3/` 루트에는 zip·지시서·감사만 둔다, 또는 (b) 한 단계 올린다. **권장 (a)** — 원본 팩·지시서와 코드가 섞이지 않는다. `scripts/` → `scripts/` 이름 변경은 (a)(b) 무관하게 한 번에 |
| R2 | §31 패키지 이름 `globe-engine · world-lod · wonder-environment · wonder-discovery · character-engine · story-engine · asset-runtime · asset-registry · ai-gateway · child-safety · shared` | `interaction-runtime`, `stage-engine`(선택기만), 계획 `paper-earth` | 지시서 이름으로 정렬: `paper-earth`→**`globe-engine`**(PHASE 1), `stage-engine`→**`wonder-environment`**, `interaction-runtime`→**`character-engine/interaction`**, 레지스트리 빌더→**`asset-registry`**. 나머지는 해당 PHASE 에서 생성 |
| R3 | §31 `content/ registry · characters · environments · landmarks · stories · discoveries · packs` | `content/ pack-1.8 · backgrounds · characters · registry` | `backgrounds/`+`pack-1.8/backgrounds/` → **`environments/`**, `pack-1.8/fx` → `characters/fx` 또는 `environments/fx`. 나머지는 해당 PHASE 에서 |
| R4 | §32 PHASE 1 = Globe · camera · rotation · zoom · touch · earth return | PD 지시(13:0x)는 + region entry · responsive (8항목) | 8항목 유지 — 지시서 6항목을 포함하고 region entry 는 PHASE 4 진입점의 최소 형태, responsive 는 §30 필수 |
| R5 | §32 순서 PHASE 0~15 | 초안 v0 의 PHASE 1~6 | 초안 SUPERSEDED. 지시서 순서 채택. PHASE 0 에서 앞당겨 만든 레지스트리·인터랙션 런타임은 PHASE 3·7 에서 지시서 필드로 확장 |
| R6 | §11 공통 interaction `wave point nod look surprise happy wiggle hide` + character-specific special (fart_playful·splash·fly·roll·hide…) | 팩 1.8 계약 `greet focus reaction special fart …` (special 은 jump/wiggle/wave/flap 4종) | PHASE 7 에서 어휘를 지시서 8종 + 개별 special 로 재정의. 팩 계약 원본은 보존, 실행체만 확장. 팩의 `surprise.svg` 는 지시서 `surprise` 에 대응 |
| R7 | §16 자산 메타 `id type category region LOD URL byte size version hash license priority dependency` | `id kind path bytes sha256 source load review` | PHASE 3 에서 필드 추가(category·region·LOD·version·license·priority·dependency). 지금 스키마는 `@0` |
| R8 | §17 LOD0~5 (metadata → thumbnail → runtime → interaction → story → video) | 캐릭터 art 는 `character`·`scene` 두 장 | PHASE 3: thumbnail(LOD1) 생성 규격 필요 — WebP 벤치마크 승인 시 thumbnail 크기(예 256²)도 함께 정할 것 |
| R9 | §2.2 지구 크기 Desktop 720 · Laptop 660 · Tablet 580 · Mobile 350, inertia, 캐릭터가 지구 뒤로 돌아가는 깊이감 | 계획서에 없었음 | `PHASE1_PAPER_EARTH_PLAN.md` 에 반영(이번 갱신) |
| R10 | §30 검증 폭 1440 · 1024 · 390 · 375 | PHASE 0 은 800×600 · 375×812 | PHASE 1 부터 4폭 전부 |
| R11 | §4 국경·해안·시도 기본 OFF, 켜면 흰 glow 선 | 미정 | PHASE 2 |
| R12 | §6 환경 = 정적 배경 한 장이 아님(Base Paper Layers · Unfold · Ambient · Discovery · Landmark · Local Character · Story Link) | 배경 스펙 v1 은 "한 장 + ambient 1" | 배경 24장은 **Base Paper Layer 의 바탕**으로 위치 조정. 스펙 v1 §4 구도 규칙은 유지(unfold 층이 위에 얹힘). 재제작 요구는 그대로 |
| R13 | §23 Gemini-first AI Gateway, §26 Child Safety | 없음 (PHASE 12) | 지금 하지 않음. `ARCHITECTURE_LOCK §6` 의 "제3자 SDK 없음"은 게이트웨이 서버 뒤라는 전제와 양립 |
| R14 | §21 V1 Hobby(철새·거북이) 보존, 권리 상태 metadata | 감사에서 인벤토리만 | PHASE 11 |

## 3. 지시서가 요구했으나 PHASE 0 감사에 없던 항목 (보완 대상)

- §32 PHASE 0 산출 중 **hobby inventory · data/API inventory · license inventory** 는 감사 문서에 부분적으로만 있다(v3-paper 자료 라이선스·공용 API 경로). PHASE 11·3 전에 별도 표로 보완한다.
- §5 Korea 관광 데이터의 권리/상업 사용 metadata — PHASE 10 전에 KTO/TourAPI 허가 상태 표.

## 4. 지금 하지 않는 것

이 표의 정렬(R1~R3 이름·경로 변경)은 **PD 가 (a)/(b) 를 고르고 승인한 뒤** 한 번에 한다. 그 전까지 코드·디렉터리 변경 없음. PHASE 1 코드도 조건 5(벤치마크 승인) 뒤.

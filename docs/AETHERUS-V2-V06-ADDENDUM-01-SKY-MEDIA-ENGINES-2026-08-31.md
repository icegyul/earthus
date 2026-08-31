# AETHERUS V2 v0.6 부록 01 — 하늘 미디어 엔진 복원 (E45·E46) — 권고안

> 기준일: 2026-08-31 (Asia/Seoul)
> 상태: `ADDENDUM_PROPOSED_PENDING_PD` — PD가 2026-08-31 "추천해줘"로 요청한 v0.6 사진관 복원 접근의 **권고안**이다. PD 채택 기록이 이 문서에 남기 전까지 정본이 아니다. zip 원본(`AETHERUS_V2/AETHERUS_V2_MOBILE_BILINGUAL_PREMIUM_v0.6_2026-08-30.zip`)은 수정하지 않는다.
> 적용 대상: v0.6 엔진 레지스트리(E01~E44 / L01~L08 / S01~S12), Integration sequence

---

## 0. PD 결정 기록과 갭 증거

**PD 요청 (2026-08-31):** 최신 정본 v0.6에서 사진관(비전 3·4)이 로드맵에서 빠진 문제의 복원 접근을 추천하라. 아래가 그 권고안이며, 관련된 PD 확정 결정(PR-14 §0: 하늘 우선·사용자 사진 배치·자산 보유)이 복원의 실체적 근거다.

**갭 증거 (실측 정정판):**

1. v0.6 패키지에서 **사진 카탈로그·사용자 미디어의 소유 계약은 0건**이다. `JWST/Hubble` 문자열 자체는 2곳에 등장하지만 — `config/AETHERUS_V2_ENGINE_REGISTRY.yaml`의 E12(Deep-Space Mission Tracking) ui 항목 "JWST/Hubble/planetary mission detail"과 `tests/acceptance/cases.py`의 `mission_id="JWST"` — 이는 **심우주 미션 상태 추적의 상세 화면**이지 RA/Dec 사진 카탈로그(`earthus.space-photos.v1`) 소유 계약이 아니다. E12의 `media/evidence` 입력도 미션 증거 입력이지 사용자·기관 사진관이 아니다.
2. 그러나 **59점 사진관(HST 9 / JWST 50)은 운영 배포 중인 실제 제품이다** (`earthus.net/?aetherus=3&solar=1&photo=…`, PR-02 계약, 운영 SHA 검증 완료). v0.6을 이대로 통합하면 운영 중인 제품이 로드맵에서 이탈한다.
3. PD가 2026-08-31 결정으로 사진관을 하늘 우선 경험으로 승격하고(PR-14) 사용자 사진 배치를 신설했다. 이 책임을 수용할 기존 엔진이 없다.

**동결 문구와의 관계:** v0.6은 세 곳에서 ID 동결을 규정한다 — `CODEX_VISUAL_INTEGRATION_DIRECTIVE_v0.6.md` "Preserve E01–E44 / L01–L08 / S01–S12 numbering and responsibility", `docs/19_FINAL_BUILD_LIST…` WORKSTREAM 0 "E01~E44/L01~L08/S01~S12 **최종 ID freeze**" 및 서두 "Claude Code가 **새 기획을 하지 않고**, 이미 고정된 contract를 repository에 적용…만 수행". 이 부록은 그 문구들을 다음과 같이 한정 해석하여 **그 범위에서만 대체(SUPERSEDED)** 한다: 기존 ID의 번호·책임은 불변이되, **PD의 명시 결정**(2026-08-31)에 근거한 갭은 append-only 신규 발급으로 수용한다. "새 기획 금지"는 Codex의 임의 기획을 막는 조항이지 PD 결정의 반영을 막는 조항이 아니다.

## 1. 신규 엔진 ID 발급 규칙 (신설)

v5.3 EARTHUS 정본의 원문은 다음 한 문장이다:

> "새 Engine ID는 각 단계에서 existing owner가 계약으로 수용할 수 없다는 gap evidence가 있을 때만 발급한다." (`docs/greenfield/canonical/EARTHUS_V2_CLAUDE_CODE_FULL_DEVELOPMENT_MASTER_v5.3_KO.md` §40)

이 부록이 AETHERUS에 신설하는 절차(v5.3 원문이 아닌 본 부록의 규칙):

1. 발급은 갭 증거와 함께 부록 문서로 기록하고, 레지스트리 끝에 이어붙인다(E45부터). 기존 ID의 번호와 책임은 변경하지 않는다.
2. **기존 엔진의 책임 확장은 additive일 때만 허용한다** — 기존 책임의 축소·이전 없이 추가만 가능하며, 확장 내용을 부록 문서로 기록한다. (PR-15의 E18/E19/E21 확장이 이 조항을 따른다.)

## 2. 발급 권고: E45 · E46 (그룹 B. SPACE 확장)

### E45 — Sky Photo Gallery (하늘 사진관)

- **책임:** 공식 우주 사진 카탈로그(`earthus.space-photos.v1`, PR-02 계약)의 소유. 천구 배치 렌더(sky-position surface)와 갤러리(photo-gallery surface). 하늘 우선 경험(PR-14 §2).
- **흡수하는 기존 산출물:** 운영 중인 59점 사진관, `photo-catalog.js`, `contracts.js`의 사진 검증기, `?photo=`/`telescope=` 딥링크.
- **갭 증거:** §0-1 — E12의 JWST/Hubble ui detail은 심우주 미션 상태·조우 표면이며 사진 카탈로그 소유 계약이 아니다. E08~E11도 천체력·이벤트·우주기상·NEO 소관으로 수용 계약이 없다.

### E46 — User Sky Photo Placement (사용자 사진 천구 배치)

- **책임:** PR-14 §3~§6의 사용자 사진 계약(`earthus.user-sky-photos.v1`) 전체 — 업로드 연계(PR-08), 자동 위치판정 소비(PR-07), 공개 파이프라인(PR-11 확장 SkyPlacementPublisher), 자산·계정삭제 규칙.
- **의존:** E45(표시 표면 공유), S01(auth), S02(Aetherus+ entitlement), S11(license/governance), E03(provenance).
- **갭 증거:** Sheet 146("JWST vs Hubble vs Me")이 가장 근접하지만 같은 천체 비교 개념일 뿐 배치 계약이 없고, PR-08/PR-10/PR-11은 저장·소유·심사만 다룬다(배치 없음).

발사 캡슐(PR-15)은 **신규 발급 대상이 아니다** — §1-2 additive 확장 조항으로 E18/E19/E21이 수용한다(PR-15 §1).

## 3. SKY 장면 정의 (E34/E35 아래)

v0.6 장면 정본은 Earth/Orbit/Cislunar/Solar 4종이고 지상 하늘 뷰가 없다. 다음을 추가한다:

- `SKY` 장면: 관측자 위치 기준 천구. E34 Multi-Scale Scene의 장면 목록에 추가한다.
- **E35 상태기계 계약:** `FocusState` 열거에 `SKY_FOCUS`를 추가한다. 진입 트리거는 명시적 SKY 버튼(또는 사진 마커 딥링크 복원)이며 카메라 거리 임계로 자동 진입하지 않는다 — SKY는 거리 이동이 아니라 **시선 전환**이기 때문이다. back navigation 복귀 대상은 `EARTH`다. E35 수용 테스트에 "SKY 진입→이탈 후 이전 focus 복원"과 "모드 전환 간 SKY 상태 보존" 항목을 추가한다.
- **Persistent Universe State 정합:** v0.6의 `camera_context`는 문자열 열거값(`solar/cislunar/orbital/object/event`)이다. 열거값에 `sky`를 **추가**한다(기존 값 불변). 관측자 위치는 Universe State에 넣지 않는다 — **로컬 전용 저장**(기기 내)으로 유지하고 서버 영속화·모드 간 공유 페이로드에 포함하지 않는다(PR-08 `REDACTED_BY_DEFAULT`·PR-06 위치 권한 규칙 준수). 위치가 없으면 SKY는 마지막 선택 지점 또는 위치 미선택 상태로 정직하게 열린다.
- 천구는 배경 사진으로 채우지 않는다. 별·사진 마커·실측 데이터만 놓는다(PD 재확인 규칙: 사진은 세계의 대체물이 될 수 없다).

## 4. Integration sequence 반영

v0.6 Integration sequence 2번("Mount v0.6 web assets … additively")에 다음 검증을 추가한다:

> 2a. 운영 사진관(E45) 회귀 검증 — 59점 카탈로그 로드, 딥링크 복원, 계약 검증기 통과를 통합 후에도 확인한다. v0.6 자산이 사진관 라우트를 덮으면 FAIL.

## 5. 티어 매핑

| 기능 | 티어 |
|---|---|
| 공식 사진관 열람(E45) | Free Explorer (현행 무료 유지) |
| 사용자 사진 업로드·배치(E46) | Aetherus+ 이상 (Sheet 133과 일치) |
| 발사 캡슐(E18/E19 확장) | Aetherus+ 이상 (PR-15 §4 — provider 권리 게이트 병행) |

집행은 전부 서버 entitlement. `FREE_OPEN` 동안 판매 없음.

## 6. PD 채택 기록

- [ ] PD가 이 권고안(E45·E46 발급 + §1 발급 규칙 + §3 SKY 장면)을 채택함 — 채택 시 이 줄에 일시를 기록하고 상태를 `ADDENDUM_CANONICAL`로 올린다.

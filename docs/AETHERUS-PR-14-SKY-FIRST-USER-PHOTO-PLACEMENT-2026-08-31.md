# AETHERUS PR-14 — 하늘 우선 경험 전환과 사용자 사진 천구 배치

> 기준일: 2026-08-31 (Asia/Seoul)
> 상태: `DIRECTIVE_CANONICAL / IMPLEMENTATION_NOT_STARTED / SERVER_INFRA_BLOCKED_EXTERNAL`
> 선행 기준: `docs/AETHERUS-PR-02-PHOTO-OWNERSHIP-2026-08-12.md` · `docs/AETHERUS-PR-07-ASTROMETRY-CORE-2026-08-12.md` · `docs/AETHERUS-PR-08-CAPTURE-REVIEW-ARCHIVE-2026-08-12.md` · `docs/AETHERUS-PR-10-PERSONAL-UNIVERSE-2026-08-12.md` · `docs/AETHERUS-PR-11-COMMUNITY-SAFETY-2026-08-12.md` · `docs/earthus-v23/AETHERUS_V3_SHEET_LEDGER.md` Sheet 133~150·260·262 · `docs/earthus-v23/AETHERUS_SECURITY_PRIVACY_FOUNDATION.md` · `docs/earthus-v23/FREE-ACCESS-POLICY-2026-08-14.md`
> 엔진 소유: 표시 표면 E45 · 배치 계약 E46 — `docs/AETHERUS-V2-V06-ADDENDUM-01-SKY-MEDIA-ENGINES-2026-08-31.md` 참조

---

## 0. PD 결정 기록 (2026-08-31)

이 문서는 PD의 다음 명시 결정을 정본화한다.

1. **몰입 우선.** 우주를 보면 제임스웹·허블 사진이 실제 하늘 위치에 걸려 있는 것이 1차 경험이다. 갤러리는 탐색 보조 수단이다.
2. **사용자 사진 배치는 자동 판정.** 사용자 편의를 위해 위치는 자동(astrometry)으로 판정한다.
3. **아이디와 함께 표시.** 사용자 사진은 업로더의 아이디(핸들)와 함께 보여 공식 사진과 구분한다.
4. **구독해지해도 보유.** 걸어둔 사진은 사용자의 자산이다. 구독을 해지해도 사라지지 않는다.

같은 날 PD가 재확인한 상위 규칙: **지구는 땅과 바다 모두 3D여야 하며 사진은 절대 세계의 대체물이 될 수 없다.** 이 원칙은 하늘에도 동일하게 적용된다 — 사용자 사진은 천구 위의 **관측 기록 마커**이지, 하늘 자체를 사진으로 덮는 배경이 아니다.

## 1. SUPERSEDED 처리

다음 기존 문구는 경험 우선순위에 한해 이 문서가 대체한다. 원문은 사고 기록으로 보존하고 삭제하지 않는다.

| 출처 | SUPERSEDED 문구 | 대체 방향 |
|---|---|---|
| `docs/AETHERUS-PR-02-PHOTO-OWNERSHIP-2026-08-12.md` §0 | "사진 자체가 1차 경험이며 적경·적위 3D 표식은 위치 보조다." | 천구 배치가 1차 경험, 갤러리가 탐색 보조 |
| `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md` §6-1 | "사진이 주인공이 아니라 3D 위치 점이 주인공이다."를 문제로 규정한 진단 | 해당 진단은 폐기 — 하늘 배치가 주인공이 맞다 |
| `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md` §6-2 | "3D 적경·적위 위치는 `하늘에서 위치 보기` 보조 동작으로 남긴다." | 하늘 뷰가 기본 진입, `목록으로 보기`가 보조 동작 |

**대체하지 않는 것:** PR-02의 카탈로그 계약(`earthus.space-photos.v1`), owner/surfaces/rights 검증, 실패 정책(대체 이미지 금지, 수동 재시도), URL 복원 규칙은 전부 유효하다. 갤러리 화면 자체도 제거하지 않는다 — 진입 기본값만 하늘 뷰로 바뀐다.

## 2. 하늘 우선 경험 계약

- 우주 사진관 진입 시 기본 화면은 **천구(sky) 뷰**다: 사진 마커가 실제 RA/Dec 위치에 걸려 있고, 마커 선택 시 사진이 열린다.
- RA/Dec는 하늘의 방향이지 3D 공간의 점이 아니다(SPACE-ZOOM-PLAN 원칙 유지). 마커는 지구를 둘러싼 천구 구면에 놓고 가짜 깊이를 만들지 않는다.
- 라벨을 숨겨도 공식 사진 마커와 사용자 사진 마커가 시각적으로 구분되어야 한다.
- 갤러리(목록) 뷰는 유지하되 `목록으로 보기` 보조 동작으로 연다. 기존 딥링크(`?photo=`, `telescope=`)는 전부 하늘 뷰의 해당 마커 선택 상태로 복원한다.
- 카탈로그·미리보기 실패 시 검증되지 않은 대체 이미지를 표시하지 않는다(PR-02 실패 정책 유지).

## 3. 사용자 사진 카탈로그 계약 — `earthus.user-sky-photos.v1`

공식 카탈로그(`earthus.space-photos.v1`)는 `owner:'aetherus'`, `telescope:'HST'|'JWST'`, `provenance:'observation'`이 계약으로 강제되어 있으므로 **사용자 사진을 같은 카탈로그에 넣지 않는다.** 별도 계약을 신설한다.

```json
{
  "schema": "earthus.user-sky-photos.v1",
  "contract": {
    "owner": "user",
    "surfaces": ["sky-position", "photo-gallery"],
    "provenance": "user-observation",
    "rights": { "scope": "item", "required": ["ownerHandle", "license", "userConsent"] }
  },
  "items": [
    {
      "id": "usp_<서버발급 opaque id>",
      "ownerHandle": "표시용 별칭",
      "title": { "ko": "…", "en": "…" },
      "ra": 0.0,
      "dec": 0.0,
      "positionSource": "ASTROMETRY_VERIFIED",
      "placement": "PLACED",
      "capturedAt": "관측 UTC 또는 null",
      "dateKind": "observation",
      "uploadedAt": "UTC",
      "thumb": "파생본 512 경로",
      "preview": "파생본 1920 경로",
      "sourceDigest": "sha256:<raw digest>",
      "license": "USER_GRANTED_DISPLAY",
      "moderation": "ACCEPTED",
      "visibility": "PUBLIC",
      "entitlementAtUpload": "AETHERUS_PLUS"
    }
  ]
}
```

### 3.1 상태 열거 (완결)

| 필드 | 허용값 | 규칙 |
|---|---|---|
| `positionSource` | `ASTROMETRY_VERIFIED` \| `USER_DECLARED` | 화면에서 두 값을 다르게 표시하며 섞지 않는다 |
| `placement` | `PLACED` \| `UNPLACED` | UNPLACED는 하늘에 걸지 않고 본인 갤러리에만 표시 |
| `moderation` | `PENDING` \| `ACCEPTED` \| `REJECTED` \| `WITHDRAWN` | PR-11 상태와 1:1 대응 |
| `visibility` | `PUBLIC` \| `PRIVATE` | `PENDING`·`REJECTED`·`WITHDRAWN` 동안은 항상 `PRIVATE` |
| `license` | `USER_GRANTED_DISPLAY` | §3.3 |

**공개 항목의 수정은 재심사를 거친다.** 공개(`PUBLIC`) 항목의 사진·제목·핸들이 변경되면 `visibility`는 즉시 `PRIVATE`로 내려가고 `moderation`은 `PENDING`으로 되돌아간다 — 수정 경로가 심사 우회가 되지 않게 한다.

### 3.2 식별·표시 규칙

- `id`는 **서버가 발급하는 opaque 식별자**다(`usp_` 접두 + 랜덤). 계정 내부 ID·이메일·그 해시를 id에 넣지 않는다.
- `ownerHandle`은 계정 이메일·실명과 독립적으로 사용자가 지정하는 **별칭**이다. 핸들과 제목에는 좌표·주소·연락처·이메일 패턴을 금지하고(moderation 체크 항목), 제목에 촬영지를 자기 공개하려는 입력에는 업로드 시 경고를 표시한다.
- 원본 바이트는 카탈로그에 넣지 않는다. `sourceDigest`로 PR-08 Archive의 immutable RAW를 참조한다.
- 좌표 없는 항목은 좌표를 지어내지 않는다.

### 3.3 라이선스 규칙

- 저작권은 사용자에게 있다. 업로드 시 사용자는 EARTHUS 표시용 라이선스(`USER_GRANTED_DISPLAY`)를 부여하며, 이 동의(`userConsent`)가 없으면 배치할 수 없다. EARTHUS는 사용자 사진을 재판매·재배포하지 않는다.
- **철회는 삭제 없이 언제든 가능하다.** 철회 시 `visibility`는 `PRIVATE`로 내려가고 신규 서빙이 즉시 중단되며 CDN purge(Sheet 149 계약)를 실행한다. 철회 시각과 영수증을 기록한다. (PR-11 `withdrawConsent`는 공개 전 단계용이므로 공개 후 철회는 이 조항이 소유한다.)

## 4. 자동 위치 판정 — PR-07 재사용

새 solver를 만들지 않는다. PR-07 astrometry 계약을 그대로 소비한다.

```text
업로드 완료 (PR-08 RawAsset VERIFIED)
→ 원본 픽셀 격자에서 feature 추출 (⚠️ FEATURE_EXTRACTION_NOT_IMPLEMENTED — 외부 갭)
→ runAstrometrySolveJob (seed: §4.1)
→ VERIFIED → wcs.crval에서 RA/Dec 채택 → positionSource='ASTROMETRY_VERIFIED'
→ FAILED (INSUFFICIENT_SOURCES / NO_MATCH / AMBIGUOUS_MATCH / …)
   → placement='UNPLACED' + 실패 코드 그대로 표시
   → 사용자 수동 좌표 입력 제안 → 입력 시 positionSource='USER_DECLARED'
```

### 4.1 seed 공급 규칙

PR-07은 `centerRaDeg/centerDecDeg` + `arcsecPerPixel` + `scaleToleranceFraction`을 필수로 요구한다(`seed-center-and-scale-required`). 공급원은 다음과 같다.

- **center**: 사용자가 대상 이름 또는 하늘 지도를 선택한다. 대상 이름→RA/Dec 해석은 로컬 동봉 카탈로그(공식 사진 카탈로그 + 이미 검증된 celestial-bodies 데이터)만 사용하고, 해석 실패 시 하늘 지도 직접 선택으로 넘어간다. 외부 이름 해석 API를 이 단계에서 호출하지 않는다.
- **arcsecPerPixel**: 사용자에게 초점거리(mm)와 센서 폭(mm) 또는 프리셋(일반 카메라/망원경 촬영 등급)을 받아 계산한다. 미상이면 등급별 표준값 + 넓은 `scaleToleranceFraction`을 쓰되, PR-07 tolerance 의미론과의 정합은 구현 전 검증 항목이다.
- **픽셀 격자**: solve는 **원본 픽셀 격자** 기준이다. 리사이즈 파생본에서 feature를 추출하는 경우 리사이즈 비율만큼 `arcsecPerPixel`을 보정하고 그 보정 계수를 solve 요청에 기록한다.

### 4.2 판정 규칙

- PR-07의 독립 검증 게이트(INDEX≥6, VALIDATION≥3, p95≤2.5arcsec)를 통과하기 전에는 `ASTROMETRY_VERIFIED`를 표시하지 않는다.
- 자동 재시도 0 규칙 유지. 클라우드 solve는 PR-07의 4중 동의 게이트를 그대로 따른다(현재 `CLOUD_ADAPTER_NOT_IMPLEMENTED`).
- feature 추출 미구현과 production sky index 부재는 이 기능의 **명시적 외부 갭**이다. 갭이 닫히기 전에 자동 판정을 "지원"으로 표시하지 않는다.

## 5. 공개 배치 파이프라인 — PR-11 확장

PR-11은 moderation `ACCEPTED`가 public URL 생성이 아니라고 못박았다. 이 문서가 그 공백(공개 권한의 소유자)을 정의한다.

```text
RawAsset VERIFIED → 파생본 생성(512/1920, §5.2 메타데이터 전체 제거)
→ solve 결과 반영 → 사용자 explicit publish 확인
→ PR-11 moderation request (PENDING, visibility=PRIVATE)
→ ACCEPTED → SkyPlacementPublisher가 visibility='PUBLIC' 기록 → 하늘에 걸림
→ REJECTED / WITHDRAWN → visibility='PRIVATE' (본인에게만 표시)
```

### 5.1 moderation 입력 매핑 (PR-11 확장)

PR-11 `createDraft`는 기관 이미지용으로 `rights.sourceUrl(https)`을 강제한다. 사용자 자작 사진에는 sourceUrl이 없으므로, `provenance.classification='user-observation'`일 때 다음 매핑을 계약으로 고정한다.

| PR-11 필드 | 사용자 사진 값 |
|---|---|
| `approvedDerivative` | PR-08 Review `APPROVED` 파생본 + digest |
| `rights.sourceUrl` | **면제** — 대신 `sourceDigest`(PR-08 RAW) + `provenance.origin='USER_CAPTURED_RAW'`를 권리 증거로 인정 |
| `rights.credit` | `ownerHandle` |
| `rights.license` | `USER_GRANTED_DISPLAY` + `userConsent` 필수 |

### 5.2 심사 기준과 공개 후 안전 경로

- moderation은 provenance·rights 증거 심사(PR-11)에 더해 **콘텐츠 안전 심사**를 포함한다: 인물·초상권·미성년자·타인 저작물 판정은 Sheet 260(업로드 신고/moderation queue)·Sheet 262(copyright takedown workflow)와 `AETHERUS_SECURITY_PRIVACY_FOUNDATION`의 계약을 준수한다.
- **공개 후 신고 경로**: 제3자 신고는 Sheet 260 queue로 들어가고, 검토 결과에 따라 `SkyPlacementPublisher`가 `PUBLIC→PRIVATE` 해제를 실행한다(actor/time/evidence audit 필수). copyright takedown은 CDN purge(Sheet 149)까지 연동한다.
- 파생본 메타데이터: 공개 파생본은 **EXIF/XMP/IPTC 전체 strip**(색공간 태그 제외)한다. GPS만이 아니라 Artist·기기 시리얼·소프트웨어 필드까지 제거한다.
- 프라이버시: 원본 filename/경로 비저장(PR-08), 관측 위치 `REDACTED_BY_DEFAULT`. 공개되는 것은 하늘 좌표(RA/Dec)와 심사를 통과한 제목·핸들뿐이다. 관측지 좌표는 공개 카탈로그에 넣지 않는다.

### 5.3 삭제

사용자는 언제든 자기 사진을 내리고 지울 수 있다. 삭제 전 export는 **제안**이며 조건이 아니다 — 법적 파기·처리정지 요청과 계정 삭제 경로에서는 export 없이 삭제가 진행된다(PR-10의 "검증된 export 선행"은 이 경로에서 면제). 삭제는 범위별 영수증(PR-08/PR-10)과 CDN purge(Sheet 149)로 마감한다.

## 6. 요금제와 자산 규칙

| 항목 | 규칙 |
|---|---|
| 업로드·배치 권한 | **Aetherus+ 이상** 유료 entitlement (v0.6 6티어 정본, Sheet 133) |
| entitlement 집행 | 서버만. "서버 entitlement 없이 UI만으로 유료 기능을 열지 않는다"(`docs/AETHERUS-V3-EXECUTION-2026-08-14.md` '보호할 동작' 7항) |
| 구독 해지 후 | **걸린 사진은 그대로 유지된다(사용자 자산).** 열람·export·삭제·라이선스 철회는 계속 가능. 새 업로드만 entitlement 필요 |
| storage quota | Sheet 148 계약. 해지 후 quota 초과 상태면 read-only 보존 — 강제 삭제하지 않는다 |
| **계정 삭제 (≠ 구독 해지)** | **자산 보존 규칙의 예외다.** 계정 삭제 시 공개 카탈로그 항목·파생본·CDN 사본(Sheet 149 purge)·`ownerHandle`·opaque id를 전부 파기한다(Sheet 150 계약). export는 삭제 전 선택 제안일 뿐 조건이 아니다 |
| 현재 모드 | `MONETIZATION_MODE='FREE_OPEN'` — PD의 "유료서비스 시작하자" 전까지 판매 없음. 이 기능은 유료 잠금이 아니라 **서버 인프라 미구축**(Sheet 133 차단 사유)으로 미공개다. 차단 사유를 유료 잠금으로 표기하지 않는다 |

## 7. 외부 갭 (구현 착수 전 필요)

Sheet 133~135·140~141·145·148 공통 차단 사유 그대로: `authenticated server principal; private storage/worker/moderation infrastructure; two-principal operating evidence`. 추가로 이 문서 고유 갭:

1. feature extraction 구현 (PR-07 명시 미구현)
2. production sky index (현재 DEV fixture — `production sky index가 아니다`)
3. 파생본 픽셀 워커 (`AETHERUS_MEDIA_RENDITION_FOUNDATION`: `DRAFT + productionEnabled=false`) — §5.2 전체 메타데이터 strip 정책 포함
4. Supabase RLS principal A/B 운영 증거
5. 이용약관에 사용자 콘텐츠 라이선스(`USER_GRANTED_DISPLAY` 부여·철회) 조항 추가 — 법무 검토
6. arcsecPerPixel 표준값·tolerance 정합 검증 (§4.1)

## 8. 수용 기준

- 하늘 뷰가 기본 진입이고, 기존 `?photo=`/`telescope=` 딥링크가 하늘 뷰 상태로 복원된다.
- 공식 마커와 사용자 마커가 라벨 없이도 구분된다. 사용자 마커에 `ownerHandle`이 표시된다.
- `ASTROMETRY_VERIFIED`와 `USER_DECLARED`가 화면에서 구분된다.
- solve 실패가 실패 코드 그대로 표시되고 좌표가 지어지지 않는다.
- moderation ACCEPTED 없이 PUBLIC 배치가 불가능하고, 공개 항목 수정이 재심사를 강제한다 (서버 강제).
- 구독 해지 계정의 기존 배치 사진이 유지되고, 새 업로드는 거부된다 (서버 강제).
- 계정 삭제 시 공개 항목·파생본·CDN 사본이 파기된다 (Sheet 149/150).
- 공개 카탈로그 응답과 **공개 파생본 파일 바이트**에 이메일·관측지 좌표·원본 경로·계정 내부 ID(및 유도 가능한 값)·GPS·Artist·기기 시리얼이 0건이다.

## 9. 롤백

이 PR의 하늘 뷰 전환·사용자 카탈로그·publisher를 함께 이전 커밋으로 되돌린다. 공식 사진관(PR-02)만 남는 상태는 유효한 롤백 지점이다. 사용자 RAW/파생본은 롤백으로 삭제하지 않는다 — 단, §6의 계정 삭제·법적 파기 예외는 롤백 여부와 무관하게 우선한다.

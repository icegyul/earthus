# CURRENT STATE — EARTHUS v2.3

> 조사 시각: 2026-08-12 KST
> Git 기준: `main` · 조사 당시 HEAD `53c2557`
> 근거: 저장소 정적 조사, `docs/HANDOVER.md`, 2026-08-12 운영 화면 실측

## 1. 제품과 저장소

EARTHUS는 공공 관측·기관 발표·모델 결과를 3D 지구본에서 출처와 자료 시각과 함께
보여주는 정적 웹앱이다. 프런트는 `prototype/`을 빌드 없이 배포하고, 서버 자료는 주로
AWS Lambda가 정규화해 S3 JSON/PNG로 저장한다.

| 영역 | 현재 확인값 | 판정 |
|---|---|---|
| 프런트 | `prototype/` 정적 파일 29개, `prototype/js/` 최상위 101개 | 빌드 없음 |
| 레이어 코드 | `prototype/js/layers/` 25개 | 기존 구조 보존 |
| Python Lambda | `aws/*/handler.py` 66개 | source handler 64개 + 로컬 shadow processor 2개 |
| Supabase 함수 | `prototype/supabase/functions/` 6개 | 루트 `supabase/`는 `.temp`만 있음 |
| Supabase migration | `prototype/supabase/migrations/` 4개 | 운영 적용 여부는 WORK 문서와 대조 필요 |
| 배포 | S3 정적 업로드 + CloudFront 무효화 | 파일별 Content-Type 필수 |
| 판매 | `SALES_OPEN=false` | 유지 |
| 행태 분석 | 사용 동의 UI는 있으나 event 수집 구현은 없음 | catalog 승인 전 수집 금지 |

## 2. 2026-08-12 운영 화면 실측

운영 URL `https://earthus.net/`을 데스크톱과 390×844에서 읽기 전용으로 확인했다.

### 통과

- 첫 화면은 위성 구름을 입힌 몰입형 3D 지구본이다.
- EARTHUS와 AETHERUS가 별도 세로 탭으로 구분된다.
- EARTHUS 메뉴 안에서 `지구 스타일`과 전체 레이어 목록을 열 수 있다.
- 전체 목록에는 위성·기상·대기질·해양·관측소·우주·항공기·선박 등 현재 항목이 보인다.
- AETHERUS 메뉴에는 은하들·은하수·우리은하 구조·태양계·허블 1개·JWST 49개가 보인다.
- 390×844에서 AETHERUS `태양계`를 선택하면 메뉴는 닫힌다.
- 조사 중 새 console warning/error는 없었다.
- 화면에 위성 자료원, 자료 시각, 다음 자료 지연 상태가 표시됐다.

### 남은 gap

- 첫 화면에는 큰 시계·현재 기온·최고/최저·자료 설명이 함께 보인다. PR-03 운영 배포 뒤에도
  query 없는 진입은 아름다운 Earth View로 유지되고, 데이터는 사용자가 명시적으로 연다.
- 수치 레이어의 공통 범례·도시 원격자값·지점 카드는 PR-04 로컬 구현을 마쳤다.
  운영 배포와 PR-06 연속장별 등치선 계약은 아직 남아 있다.
- 모바일 메뉴는 열면 화면의 큰 부분을 덮는다. 선택 뒤 닫힘은 통과했지만 터치·포커스 복귀,
  작은 본문 크기와 실제 구형 iPhone 발열은 미검증이다.
- 태양계로 들어가도 URL은 `https://earthus.net/` 그대로다. 새로고침·공유가 동일 장면을
  복원한다는 증거가 없다.
- EARTHUS와 AETHERUS의 코드·상태가 같은 앱 안에 있으므로 timer/render/network 소유권을
  장면별로 계측해야 한다.
- 운영 화면의 숫자와 출처 표시는 확인했지만 모든 레이어의 `source/time/unit/n/missing`을
  전수 대조한 것은 아니다.

## 3. 이미 구현된 안전장치

- `requestRenderMode`와 `power.animate()`/`power.cancel()` 기반 유한 렌더 원칙
- `clampToGround` 금지와 무한 애니메이션 금지 사고 기록
- 결측을 `null`로 보존하고 0으로 채우지 않는 다수 adapter
- KMA/JMA/NOAA 등 기관 발표와 모델 결과의 출처 분리
- 브라우저 가격은 표시용이고 checkout 서버가 금액 정본을 조회하는 구조
- `OPEN_METEO_COMMERCIAL_READY`, `GVP_COMMERCIAL_READY` 판매 이중 gate
- 수동 SNS 게시와 관리자 JWT 재검증 경계

## 4. 문서와 코드가 다른 곳

| 항목 | 문서 상태 | 현재 코드/화면 | 처리 |
|---|---|---|---|
| Lambda 수 | HANDOVER 과거값 54개 | 코드 66개 | source 64 + 미배포 `signal-foundation`·`source-governance` |
| Supabase 경로 | `supabase/functions/` | `prototype/supabase/functions/` | HANDOVER 후속 수정 후보 |
| AETHERUS 모바일 선택 | 선택 뒤 메뉴가 닫히지 않음 | 태양계 선택 뒤 닫힘 확인 | 과거 gap을 완료로 갱신 |
| AETHERUS URL | 복원되지 않음 | 태양계 선택 뒤에도 `/` | gap 유지 |
| Analytics | 미구현 | 동의 UI만 있고 event emitter 없음 | 수집 금지 유지 |
| 통합 착수 | 8월 16일 | 현재 8월 12일 | 문서·검증만 진행 |
| TPW 단독 slice | 8월 12일 PD 직접 승인 | collector·지역 격자 renderer·UI 계약 로컬 구현 | 운영 flag·배포는 gate 통과 전 금지 |
| Signal Foundation | PR-01 계획 | 대표 3 source compatibility adapter·schema·fixture 로컬 구현 | AWS·schedule·reader 전환 전부 미승인 |
| Rights/Freshness | PR-02 계획 | DRAFT registry·governance engine·20 replay 로컬 구현 | source 승인·Control Plane·AWS·reader 전환 미승인 |
| Earth View State | PR-03 계획 | 접두어 URL·상태 fallback·앞뒤/새로고침 구현 | 정적 운영 배포·대표 URL·AETHERUS/해구 상호배제 검증 완료; 실제 기기·rollback rehearsal 남음 |
| V0 Readability | PR-04 계획 | 공통 범례·화면 도시 원격자값·지점 근거·read mode 로컬 구현 | 정적 운영 배포 전; 등치선은 PR-06으로 분리 |

## 5. 현재 작업트리 보호

조사 뒤에도 작업트리는 여러 작업이 함께 진행 중이다.

- `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md`: 이번 v2.3 기준서 동기화 작업
- AETHERUS 진행 파일: 본 EARTHUS PR 범위 밖
- TPW PR-00A 파일: 먼저 진행된 로컬 slice이며 PR-01에서 되돌리거나 배포하지 않음
- `aws/signal-foundation/`, canonical schema와 관련 문서: PR-01의 분리된 신규 파일
- `aws/source-governance/`, rights/freshness schema와 관련 문서: PR-02의 분리된 신규 파일
- `earth-route-state.js`, `earth-view-state.js`와 store/layerbar/main 일부 hunk: PR-03
- `readability.js`, `readability.css`와 route/store/grid/main 일부 hunk: PR-04

사용자/AETHERUS/TPW 변경을 섞어 되돌리지 않는다. PR-01/02는 기존 source writer·reader를
수정하지 않고 private shadow에 분리하며, PR-03은 공유 파일에서 자기 hunk만 선택 병합한다.

## 6. 운영 전 확인이 필요한 것

- AWS 계정 기준선 63개와 로컬 신규 `tpw-grid`, `signal-foundation`, `source-governance`의
  배포 여부·region·VPC·schedule·timeout·last success
- 서울 Lambda에서 기상청 새 특보 API, KMA APIHub, CWA, JMA, Open-Meteo의 실제 응답
- S3 공개/비공개 prefix와 객체별 Content-Type/Cache-Control/권리 만료
- Supabase migration/Edge Function의 실제 배포 version과 RLS
- 판매 관련 서버 gate, 약관, 통신판매업 정보, 창립 멤버 할인 checkout
- 390×844/430×932/768×1024/1280×720/1440×900 전체 조합

위 항목은 확인 전 `UNKNOWN`이며 성공으로 간주하지 않는다.

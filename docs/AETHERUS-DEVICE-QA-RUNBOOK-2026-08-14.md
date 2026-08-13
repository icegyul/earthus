# AETHERUS Device RC 실기기 검증 Runbook

## 1. 목적과 현재 결정

이 runbook은 AETHERUS Sky AR, 브라우저 카메라, 방향 센서, 로컬 관측 원본,
사용자 동의·철회·삭제, AI 가드, 원격 관측소 Safe Hold를 공개 전에 확인한다.

```text
RC surface: /aetherus-device-qa.html
Public AETHERUS consumer: CLOSED
Release decision: BLOCKED
```

이 페이지가 단독으로 `DECISION_CORE_READY=true`를 만들지 않는다. 실기기, 두 사용자
Supabase RLS, 운영 AI 계약·비용·평가, 물리 원격 관측소 HIL, canary·rollback 리허설의
증거가 모두 있어야 한다.

## 2. 오전 실기기 검증 순서

### 2.1 iPhone Safari

1. Safari에서 `https://earthus.net/aetherus-device-qa.html` 열기.
2. `환경·보안 기본선` PASS 확인.
3. `위치 권한 요청` 누르고 위치 응답·정확도 확인. 보고서에 정확한 좌표가 없는지
   마지막에 JSON으로 확인.
4. `Sky AR 시작` 누르고 모션·방향, 카메라 권한을 승인.
5. 후면 카메라가 보이고 기기를 천천히 움직였을 때 표본, 방위·고도, 헤딩 모드가
   변하는지 확인.
6. `현재 화면 로컬 저장` 누르기. Capture `COMPLETED`, Archive `HOT`, SHA-256, 업로드 0 확인.
7. Safari를 완전히 닫았다 다시 열고 `재실행 저장 여부 검사` 누르기. `페이지 세션 간 보존`
   PASS 확인.
8. `원본 묶음 내려받기` 후 파일이 실제 저장되는지 확인.
9. `로컬 원본 삭제` 누르고 영수증 ID가 나오는지 확인.
10. 동의 기록 후 `철회하고 로컬 기록 삭제` 실행. 다시 열었을 때 동의·원본이 없어야 한다.
11. 서명 fixture, AI, Safe Hold 게이트를 각각 실행.
12. 시작 배터리를 입력하고 5분 검사를 마친 뒤 종료 배터리·발열을 기록.
13. VoiceOver, 200% 확대, 세로·가로 회전, 포커스, 저전력, 잠금·복귀를 직접 PASS/FAIL로 선택.
14. `검증 보고서 JSON 내려받기` 후 보고서를 보존.

### 2.2 잠금·복귀 필수 재현

Sky AR가 활성인 상태에서 홈 화면으로 나갔다가 복귀한다. 복귀 시 미리보기가 멈추고,
살아있는 트랙 0·리스너 0이어야 한다. 다시 시작은 버튼을 다시 누를 때만 허용한다.

## 3. Supabase 사용자 A/B RLS

### 3.1 migration 사전 관문

- 대상 Supabase project ID를 사람이 확인한다.
- DB backup·rollback 시점을 남긴다.
- `prototype/supabase/migrations/20260814090000_aetherus_private_data.sql`을 canary project에 먼저 적용한다.
- 비밀값, JWT, service-role key를 문서·커밋·채팅에 넣지 않는다.

### 3.2 독립 사용자 검증

```bash
SUPABASE_URL='https://<project>.supabase.co' \
SUPABASE_ANON_KEY='<environment only>' \
AETHERUS_USER_A_JWT='<user A access token>' \
AETHERUS_USER_B_JWT='<user B access token>' \
node tools/verify_aetherus_rls.mjs --confirm-live > /tmp/aetherus-rls-evidence.json
```

검증기는 두 principal이 다른지 확인한 뒤 A의 행을 B가 읽기·위조 삽입·수정·삭제하지
못하는지 실제 PostgREST로 검사한다. 마지막에 A의 probe를 삭제하고 정리를 다시 읽어
확인한다. 출력은 raw principal ID 대신 짧은 SHA-256 hash만 담는다.

## 4. 자동 회귀

```bash
node tools/test_aetherus_device_qa.mjs
for f in tools/test_aetherus_*.mjs; do NODE_NO_WARNINGS=1 node "$f" || exit 1; done
```

모바일 자동 배치 관문:

- 390×844에서 가로 overflow 0.
- 모든 버튼 높이 44px 이상.
- 포커스 표시·skip link·label 존재.
- 무한 animation loop 없음.
- 카메라·센서는 visibility/pagehide에서 해제.

## 5. 공개 전환 관문

`PUBLIC AETHERUS consumer` 또는 `DECISION_CORE_READY=true`는 다음을 모두 만족하기 전에는 바꾸지
않는다.

1. iPhone Safari 보고서: 자동·수동 필수 항목 PASS, FAIL 0.
2. 구형 iPhone/Safari 보고서: 카메라 시작·종료·저장·회전 PASS.
3. VoiceOver 실행 증거.
4. 5분 내구성: HOT 아님, 잠금·복귀 트랙 0.
5. Supabase principal A/B RLS report PASS.
6. 운영 AI 모델 계약·비용·실제 평가·도구 allowlist 승인.
7. 물리 원격 관측소 HIL·E-stop 증거.
8. canary 배포, 장애 주입, rollback 리허설 PASS.
9. Product Director의 명시적 전환 승인.

## 6. Rollback

실기기 RC는 메인 AETHERUS consumer와 분리되어 있다. RC 문제가 발견되면 다음 경로만 이전
안전 blob으로 돌리고 CloudFront를 무효화한다.

```text
/aetherus-device-qa.html
/css/aetherus-device-qa.css
/js/aetherus-device-qa.js
/data/astrometry/m82opt-nasa-wcs-features-v1.json
```

Supabase migration rollback은 공개 페이지 rollback과 분리한다. 사용자 행 유무를 읽고 export한 뒤, DBA가
승인한 별도 migration으로만 정책·테이블을 제거한다. 운영 DB에 수동 `drop table` 명령을 실행하지
않는다.

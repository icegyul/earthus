# Aetherus Data Rollback · Hotfix Policy

## 데이터 rollback

1. 현재 revision과 검증된 last-good revision을 함께 고정한다.
2. immutable backup 증거와 구 reader 호환 증거를 확인한다.
3. actor, reason, approvedAt을 append-only audit에 남긴다.
4. 자동 삭제 없이 reader를 last-good으로 전환하는 계획부터 만든다.
5. 결과 count/checksum/missingness를 비교하고 별도 승인 뒤 구 데이터를 정리한다.

## hotfix

1. incident와 재현 가능한 failure description을 먼저 기록한다.
2. 파일 glob이나 디렉터리가 아니라 최소 변경 파일을 열거한다.
3. 관련 unit/contract/regression과 rollback revision을 필수로 둔다.
4. unrelated change를 포함하지 않고 production 배포는 PD가 별도로 승인한다.
5. S3/CloudFront 배포 시 Content-Type·Cache-Control·object version·live/local SHA를 기록한다.

현재 산출물은 로컬 policy와 plan validator다. 자동 rollback, 자동 hotfix 배포 권한은 없다.

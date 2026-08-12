# PR-02 Source Governance — private shadow 배포 증거

> 배포일: 2026-08-12 KST
> 공개 영향: 없음
> 상태: 수동 shadow 검증 완료 · source 승인/schedule/authoritative reader 미승인

## 1. 배포 경계

`source-governance`를 서울 `ap-northeast-2`에 Python 3.12, x86_64, 1,024MB,
timeout 120초, VPC 미연결로 배포했다. 함수 URL과 Lambda invoke resource policy는 없다.
`source-governance`와 `source-governance-schedule` 이름의 EventBridge rule도 없다.

전용 `aws/deploy-source-governance.sh`는 다음 경로만 허용한다.

- read: `archive/canonical/v1/kma-warning.json`
- read: `archive/canonical/v1/kma-aws-temperature.json`
- read: `archive/canonical/v1/noaa-gfs-tpw.json`
- write: 같은 이름의 `archive/governance/v1/` 결과 3개
- bucket list, 공개 원본 write, canonical write, 그 밖의 governance write: 0

공용 `deploy-python.sh`의 넓은 버킷 권한을 쓰지 않았다. 실행자는 배포 스크립트로
IAM을 적용했고, Lambda가 실제 canonical GET·governance PUT을 성공함으로써 운영 경로를
검증했다. 배포 계정에 `iam:GetRolePolicy`는 없어 운영에서 policy를 다시 읽지는 못했다.

## 2. 실자료 결과

2026-08-12 12:57:37 UTC를 고정한 평가 시각으로 동일 input을 두 번 실행했다.
두 호출 모두 `StatusCode=200`, `FunctionError=null`, `ok=true`였다.

| source | source | canonical | rejected | freshness | provider | result bytes |
|---|---:|---:|---:|---|---|---:|
| KMA warning | 39 | 39 | 0 | FRESH | HEALTHY | 5,303 |
| KMA AWS temperature | 736 | 736 | 0 | STALE | HEALTHY | 5,764 |
| NOAA GFS TPW | 3,276 | 3,276 | 0 | AGING | HEALTHY | 5,858 |

기온의 `STALE`은 평가 시각과 canonical의 `observedAt` 차이다. 736행·거절 0인 parser
상태는 정상이므로 provider는 `HEALTHY`다. freshness가 stale라는 이유만으로
provider를 degraded로 바꾸던 초기 구현은 문서 계약과 서로 엇갈려 분리했다.

## 3. 권리 fail-closed

번들 registry revision `2026-08-12.draft.1`의 세 entry는 모두 `DRAFT`다. 실자료가
최신이고 parser가 정상이어도 세 결과는 모두 다음을 유지했다.

- `presentation.state=POLICY_BLOCKED`
- 8 operations × 3 sources = 24 operations 전부 `BLOCK`
- `presentation.dataVisible=false`
- `presentation.statusVisible=true`
- `presentation.safetyMeaning=NO_INFERENCE`

소스별 권리, 승인 행위자, 근거, 효력 시각, rollback version을 추측해 만들지 않았다.

## 4. 재현성·스키마·격리

- 동일 input·동일 `evaluatedAt`의 2회 replay: JSON 3개 SHA-256·evaluationId 전부 일치
- source registry 1개·governance 3개: JSON Schema Draft 2020-12 통과
- result: `application/json; charset=utf-8`, `private, no-store`, AES256
- S3 direct/CloudFront anonymous GET: 3/3씩 모두 HTTP 403
- `prototype/` governance path 참조: 0
- 평가 전후 canonical 3개 SHA-256: 모두 일치

해시는 다음과 같다.

| object | SHA-256 |
|---|---|
| governance KMA warning | `361628c22bd3b643bfb3c3f692d94fa0dac1b0383ab6ebf7173ca647ae86643b` |
| governance KMA AWS | `9d6b42e7d9c5a9bb84733ca1176bd0744318120d2dcd99caff2afdc3a64a0b11` |
| governance NOAA TPW | `842884531051debec5b4c64fa6fbbcd71cf05eef7ca74127a0b71cdc16dc4185` |

## 5. 성능·회귀

- 첫 수정본 호출: 3,481.52ms, cold init 494.13ms, max memory 126MB
- 두 번째 동일 호출: 2,165.10ms, max memory 129MB
- PR-02 source-governance: 20/20
- PR-01 canonical 회귀: 12/12
- Activity 31/31, Personalization 30/30, Reservation 21/21, Fusion PASS
- PR-11 잠금: `SALES_OPEN=false`, TPW/Decision flag off, SNS 자동 게시 금지 PASS

전체 Safety 회귀는 이 PR과 무관한 `prototype/index.html` main.js 캐시 버전이
`earthmoonhud2`로 올라갔지만 기존 test가 이 버전을 허용하지 않아 1개가 실패했다.
PR-02 Safety 코드 변경은 0이며, 별도 회귀 기준선 동기화로 남긴다.

## 6. 남은 관문

- 3 source의 공식 terms·8 operations 권리 검토와 PD append-only 승인
- registry 서명·diff·rollback·권한 분리 Control Plane
- schedule 주기, retention, 비용 상한, DLQ/CloudWatch 경보, 외부 채널 승인
- dual-read diff·canary·rollback rehearsal 후 authoritative policy reader 전환 승인

즉시 완화는 schedule이 없으므로 Lambda를 더 호출하지 않으면 된다. 함수나 private
shadow 삭제는 파괴적 작업이므로 별도 승인 없이 하지 않는다.

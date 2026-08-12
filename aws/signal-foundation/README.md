# signal-foundation

EARTHUS 기존 JSON 3종을 수정하지 않고 private canonical shadow로 변환한다.

| adapter | 기존 원본 | shadow 산출물 |
|---|---|---|
| 공식 특보 | `events/kma-warn.json` | `archive/canonical/v1/kma-warning.json` |
| 지상 관측 | `wind/kma-aws-min.json` | `archive/canonical/v1/kma-aws-temperature.json` |
| 모델 격자 | `wind/tpw-ea.json` | `archive/canonical/v1/noaa-gfs-tpw.json` |

- 원본 writer/reader는 그대로다.
- 화면·Safety·Activity는 아직 shadow를 읽지 않는다.
- 특보는 공식 구역 polygon mapping 전까지 `REGION_UNMAPPED`, `value=null`이다.
- shadow는 공개 bucket policy에서 제외된 `archive/`에 쓰고 `private, no-store`를 붙인다.
  `Cache-Control`만으로 비공개라고 판단하지 않으며 운영 때 익명 GET 403을 확인한다.
- processor version은 환경값이 없으면 세 실행 파일의 SHA-256으로 자동 고정된다.
- shadow는 운영 cutover 자료가 아니다.
- 배포·스케줄 등록은 PR-01 운영 승인 뒤 별도로 한다.
- 현재 공용 `deploy-python.sh`의 버킷 전체 IAM 권한은 PR-01 최소권한 gate를 만족하지 않는다.
  전용 IAM 범위를 승인하기 전 그 스크립트로 이 함수를 배포하지 않는다.
- 첫 shadow가 아직 없을 때 `GetObject`의 `NoSuchKey`와 권한 오류를 구분하려면
  `archive/canonical/v1/*`에 한정한 `s3:ListBucket` prefix 조건이 필요하다. 버킷 전체 목록
  권한으로 넓히지 않는다.

```bash
python3 -m unittest aws/signal-foundation/test_signal_foundation.py
```

# source-governance

PR-01 canonical batch를 읽어 권리·신선도·provider health를 분리 평가하는 PR-02 로컬
shadow processor다.

- 번들 registry는 의도적으로 전부 `DRAFT`다. 코드 작성이 source 승인을 뜻하지 않는다.
- 결과는 `archive/governance/v1/`에만 `private, no-store`로 쓴다.
- 기존 공개 JSON, UI, Safety, Activity, AETHERUS reader는 바꾸지 않는다.
- `BLOCKED/EXPIRED/STALE/UNKNOWN`을 0·안전·허용으로 바꾸지 않는다.
- 공용 `deploy-python.sh`는 registry JSON을 패키징하지 않고 IAM 범위도 넓으므로 사용 금지다.
- AWS 배포는 `aws/deploy-source-governance.sh`만 쓴다. canonical 정확히 3개
  `GetObject`와 governance 정확히 3개 `PutObject`만 허용하며 bucket list는 허용하지 않는다.
- 수동 private shadow 배포는 source 승인이 아니다. schedule·Control Plane 승인·
  authoritative reader 전환은 여전히 별도 gate다.

```bash
python3 -m unittest aws/source-governance/test_source_governance.py
```

# 04 — 시작·종료 체크리스트

## 다음 리셋 시작

- [ ] `docs/HANDOVER.md`와 이 패키지를 읽었다.
- [ ] `git status --short`, `git log -1`, 현재 branch를 기록했다.
- [ ] AETHERUS·우주 배경·다른 작업자의 파일을 별도 범위로 표시했다.
- [ ] 운영 URL과 로컬 핵심 파일 SHA-256을 대조했다.
- [ ] `SALES_OPEN`, `TPW_READY`, `DECISION_CORE_READY`, 자동 게시 상태를 값 노출 없이 확인했다.
- [ ] Lambda·EventBridge·S3·CloudFront·Supabase의 현재 읽기 권한과 `UNKNOWN`을 기록했다.
- [ ] N0 문서 동기화 뒤 N1 수집기 운영 관제로 넘어간다.

## 각 개발 단위

- [ ] 사용자 결과, scope, non-scope, AETHERUS 영향이 적혔다.
- [ ] source/time/unit/CRS/n/missing/revision/license 계약이 있다.
- [ ] 정상·결측·지연·부분실패·정정·권리차단 fixture가 있다.
- [ ] Safety/UNKNOWN을 긍정 상태로 바꾸지 않는다.
- [ ] 비용·quota·retention·보안·개인정보 영향이 적혔다.
- [ ] feature flag, canary 중지 기준, rollback 절차가 있다.
- [ ] 정적 검사뿐 아니라 실제 데이터와 실제 UI를 검증했다.

## 릴리스 종료

- [ ] 관련 unit/contract/replay/regression 시험이 모두 통과했다.
- [ ] desktop·tablet·mobile, 한국·일본·대표 전지구 장면을 확인했다.
- [ ] 레이어 해제 뒤 timer/network/render owner가 0이다.
- [ ] 변경 파일만 올바른 Content-Type/Cache-Control로 배포했다.
- [ ] CloudFront 무효화와 live byte hash/MIME를 확인했다.
- [ ] 운영 실자료의 source/time/count/missing/freshness를 확인했다.
- [ ] console error·가로 overflow·empty/stale/error 상태를 확인했다.
- [ ] HANDOVER·CURRENT_STATE·실행 패키지에 결과와 남은 blocker를 갱신했다.
- [ ] 작업 파일/hunk만 stage·commit했고 unrelated dirty files를 보존했다.
- [ ] “완료”를 `OPERATING/SHADOW/BLOCKED/BACKLOG` 중 하나로 명시했다.

## 기본 회귀 명령

```sh
node tools/test_readability.mjs
node tools/test_continuous_layers.mjs
node tools/test_safety_engine.mjs
node tools/test_kma_live.mjs
node tools/test_pr11_release_gate.mjs
node tools/test_aetherus_foundation.mjs
git diff --check
```

변경 JavaScript는 AGENTS.md의 `node --check`, Python handler는 `python3 -m py_compile`을
추가한다. 실제 배포 파일 목록은 그 작업 단위에서 별도로 고정한다.

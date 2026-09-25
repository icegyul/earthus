# ui_PLEOS — 참고 자료 (정본 아님)

이 폴더는 2026-09-25 PD가 올린 Pleos 설계 참고 킷(V35~V38)이다. **실제 앱 코드가 아니다.**

- 좋은 규칙(제품 분리, UNKNOWN=운전 중, 실행 순간 재확인, 정적 자료 기기 안 처리)은
  실제 소스 `prototype/js/pleos/`, `prototype/js/product-target.js`, `prototype/pleos.html` 로 옮겼다.
- 옮기지 않은 것과 이유:
  - 목록에 없는 기능을 허용하던 게이트(V33 fail-open)
  - 서로 다른 기능 이름(`time-playback`/`satellite_playback`, `local_discovery`/`local_explore`)
  - 브라우저에서 빈 화면을 만드는 `node:fs` import
  - 출처 없는 57개 POI → 시험 전용 `tools/fixtures/pleos/poi-demo-57.json`
- `prototype/`·`tools/` 운영 코드는 이 폴더를 import 하지 않는다 (`tools/test_pleos_data_contract.mjs`가 검사).
- 2026-09-25 수정: `10_FINAL_RELEASE_CANDIDATE_V38/tests/VERIFY_V38_FINAL_RELEASE.mjs`가 폴더 밖(`../../../v37/`)을 참조해
  실행되지 않던 경로를 폴더 안 경로로 고쳤고, `V38_SHA256.txt`의 해당 줄을 갱신했다.

감사 결과는 저장소 루트의 `V38_1_ACTUAL_SOURCE_AUDIT_REPORT.md`에 있다.

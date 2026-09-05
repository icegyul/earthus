# 동시 메뉴 변경 보존

2026-09-05 연구 구현은 기존 v1·v2·AETHERUS 메뉴 작업과 같은 작업 트리에서 진행한다. 현재 미커밋 변경을 과거 HEAD로 되돌리거나 다른 작업자의 변경을 배포 번들로 덮어쓰지 않는다.

`evidence/menu-baseline-start.json`은 착수 시점의 **17개 명시 경로** SHA-256이다. 내용 백업이 아니며 재생성해서 시작 기준을 덮어쓰지 않는다. 감사 하위 작업은 기존 소스 파일을 수정하지 않았다. 이미 다음 파일의 동시 변경을 감지했다: `prototype/js/space/aetherus-dashboard.js`, `prototype/js/space/mission-readability.js`, `prototype/v2-three/js/ui-shell.js`, `prototype/v2-three/js/engine-bridge.js`, `prototype/v2-three/js/live-layers.js`. 해시만으로 변경 주체나 회귀 여부를 판정할 수 없다.

## 실행

저장소 루트에서 새 기준은 별도 이름으로 캡처한다. 각 도구는 기존 출력 파일을 덮어쓰지 않으며 git 명령, 되돌리기, 파일 복원을 수행하지 않는다.

```sh
node tools/research/capture-menu-baseline.mjs --output docs/research/evidence/menu-baseline-next.json
node tools/research/check-menu-preservation.mjs --baseline docs/research/evidence/menu-baseline-start.json
```

다른 경로를 검사하려면 `--path relative/file`을 반복하거나 JSON 경로 배열을 `--paths-file`로 지정한다. 기존 baseline을 `--paths-file`로 넘겨 같은 범위의 새 시점을 기록할 수 있다. 폴더·glob·상위 경로는 받지 않는다.

의도한 통합 변경만 개별 경로로 허용한다. 이 허용은 그 파일이 검토되었음을 증명하지 않는다.

```sh
node tools/research/check-menu-preservation.mjs --baseline docs/research/evidence/menu-baseline-start.json --allow prototype/v2-three/js/main.js --output docs/research/evidence/menu-check-integration.json
```

- `PRESERVED`: 캡처 당시와 바이트가 같다.
- `ALLOWED_CHANGE_REVIEW_REQUIRED`: 명시한 통합 경로가 바뀌었다. 작업 전 최신 파일에 대한 작은 diff와 동시 변경 보존을 검토한다.
- `UNATTRIBUTED_CHANGE_REVIEW_REQUIRED`: 허용하지 않은 경로가 바뀌었다. 자동 복원하지 않고 현재 작업과 대조한다.
- 종료 코드 0은 미허용 변경 없음, 2는 미허용 변경 감지, 1은 입력·파일 오류다.

검사 범위 밖의 추가·변경 파일은 이 도구가 감사하지 않는다. 최종 변경 원장은 작업자가 별도로 기록해야 한다. 바이트 동일성은 브라우저 기능 회귀 검사를 대체하지 않는다. 특히 신규 연구 화면과 기존 메뉴 사이의 이동·오류 처리·상태 복원을 확인한다.

## 번들과 배포

`tools/build-v2-bundle.sh`는 `prototype/v2-deploy` 전체를 제거하고 다시 복사한다. 현재 다른 작업자가 번들을 수정할 수 있으므로 이 작업에서 무심코 실행하지 않는다. 연구 파일을 기존 번들에 수동으로 두 벌 개발하지 않고, 통합 담당자가 최신 소스 변경을 확인한 후 분리된 산출 위치에서 빌드·경로 검증한다. 운영 반영 여부는 구현 완료와 별도로 기록한다.

## 확인한 도구 동작

임시 디렉터리에서 동일 바이트, 외부 수정, 명시 allowlist, 새 파일, 범위 밖 allowlist·상위 경로 거부를 실행해 통과했다. 저장소 메뉴 파일은 이 검증이 수정하지 않는다.

# @earthus-v3-wonder/interaction-runtime

팩 1.8 의 인터랙션 계약(`contract/wonder-interaction-engine.ts`, 원본 그대로)을 실행하는 ESM 런타임.

- `src/index.mjs` — `resolveTap / resolveLongPress / resolveFart / getFx` (계약과 1:1) + manifest 정규화·검증(`validateManifest`) + 프로필 생성(`profileOf`) + `expandSpecial`.
- `getFx` 는 계약과 달리 **파일 이름만** 돌려준다. 배포 루트가 아직 없어서다. 호출부가 `content/pack-1.8/fx/` 를 붙인다.
- 전신 스프라이트 폴백이 정상 경로다. wave/point 는 동작 계약 + FX 다. 관절 파츠는 아트 파이프라인 대기.

검증: `node --test tests/` (프로젝트 루트).

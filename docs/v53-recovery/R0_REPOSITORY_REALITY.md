# R0 Repository Reality Audit

감사 시각: 2026-08-31 KST
판정 기준: 현재 checkout의 Git 명령, 원격 `ls-remote`, 현재 파일, 실제 로컬 브라우저

## 결론

`/Volumes/700gb/## APP/EARTHUS v2_APP`가 실제 EARTHUS 저장소다. Zero-Start pack은 이 저장소를 대체하지 않는 복구·대조 자료다.

| 항목 | 실제 값 |
|---|---|
| `pwd` | `/Volumes/700gb/## APP/EARTHUS v2_APP` |
| repository root | `/Volumes/700gb/## APP/EARTHUS v2_APP` |
| remote | `git@github.com:icegyul/earthus.git` |
| branch | `earthus-v2/real-living-earth-render` |
| local HEAD | `19c22c01f712047230fe0a66cbb1392c2e80bc2e` |
| upstream branch | `origin/earthus-v2/real-living-earth-render` |
| upstream SHA | `2ebd0cae8b77d9b5c9bab810b2477b59f95110c8` |
| upstream 대비 | behind `0`, ahead `1` |
| remote default HEAD | `refs/heads/main` → `e7a51eb0f01b706f2fdff0e8434e022bf341ee5a` |
| local HEAD commit 내용 | 설계·실행계획 문서 2개만 추가; 제품 코드 변경 없음 |

원격 값은 로컬 remote-tracking ref만 믿지 않고 `git ls-remote --symref origin HEAD refs/heads/earthus-v2/real-living-earth-render refs/heads/main`으로 다시 확인했다.

## 최근 커밋

```text
19c22c01 기본 지구가 3D 승인안 대신 사진 합성으로 남아 있었음
2ebd0cae FND 부팅 순간 실패가 후속 증거를 건너뛰었음
bdaff937 외부 지형 순간 실패가 Mountain 배포 게이트를 막았음
b390ae31 외부 브라우저 순간 실패가 모바일 검증을 건너뛰었음
961ece37 모바일 Intelligence 터치 영역이 44px보다 작았음
```

## Working tree 보존 경계

추적 수정은 1개다.

```text
 M prototype/v2/js/real-living-earth.js
```

Git이 접어 표시하는 미추적 상위 경로는 다음과 같다. 삭제·초기화·stash하지 않는다.

```text
?? .tmp/
?? .worktrees/
?? AETHERUS_V2/
?? Aetherus 823_Orbital/
?? Aetherus_Orbital_Environment_Codex_Package_v1.2/
?? Codex 이미지 2026년 8월 27일 오후 09_52_40.png
?? EARTHUS_1.0_AUDIT_OUTPUT/
?? EARTHUS_모두의창업_사업계획서_78-99형식.pptx
?? EARTHUS_모두의창업_사업계획서_78-99형식.pptx.inspect.ndjson
?? EARTHUS_모두의창업_사업계획서_v1.0.pptx
?? EARTHUS_모두의창업_사업계획서_v1.0.pptx.inspect.ndjson
?? Earthus v2_5.2/
?? docs/earthus-v2/**
?? docs/earthus-v8/evidence/
?? earthus 825/
?? output/
?? prototype/v2/assets/
?? prototype/v2/js/gfs-cloud-layered-fallback.js
?? prototype/v2/js/physical-earth-presentation.js
?? services/
?? tools/build_v2_physical_surface_assets.py
?? tools/earthus-v52/gfs-layered-cloud.test.mjs
?? tools/earthus-v52/physical-earth-presentation.test.mjs
?? tools/test_v2_default_physical_earth_browser.mjs
?? tools/test_v2_physical_surface_assets.py
?? 어스어스 822/
?? 특허 우주쓰레기/
```

미추적 파일은 총 `33,820`개다. 그중 `.tmp`가 `32,557`개, `어스어스 822`가 `908`개다. 이 수치는 삭제 근거가 아니라 보존 범위를 확인하기 위한 inventory다.

## Worktree

현재 루트 외에 12개의 등록 worktree가 보인다. 기존 `.claude/worktrees/*`, `.worktrees/*`, AETHERUS worktree는 별도 작업 소유이므로 현재 G2에 섞지 않는다. `/private/tmp` 아래 6개 항목은 `git worktree list`에서 `prunable`로 보이지만 이번 작업에서 repair/remove/prune하지 않는다.

## 현재 제품 기준선

정확한 `19c22c01`을 `/private/tmp`에 `git archive`로 materialize해 `/v2/`를 실제 브라우저로 열었다.

- 브라우저 오류: `0`
- Terrain badge: `Esri Terrain3D`
- Bathymetry badge: `Esri TopoBathy3D ready`
- 기본 cloud: `ACTIVE SHELL`
- camera altitude: 약 `32,820 km`
- 시각 판정: 작은 photo globe로 읽힘. `G2 FAIL`.

현재 dirty working tree도 별도 서버에서 2회 재현했다.

- 오류: `FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)`
- 결과: Cesium 렌더 중단
- 원인 경계: 기존 globe imagery sampler 배열과 새 `Water` globe material의 specular/normal sampler가 동일 fragment program에서 기기 한도 16을 넘음
- 판정: 현재 water material 통합은 `DO_NOT_COMMIT_AS_IS`; G2에서 분리하고 G3 independent ocean surface로 재설계

## R0 상태

`R0 REPOSITORY REALITY: PASS`

저장소·브랜치·원격·dirty state를 확정했다. 이 PASS는 제품이나 G2의 PASS가 아니다.

# EARTHUS V2 — READ THIS FIRST / CANONICAL PRECEDENCE

## 1. 개발자에게 전달할 정본

**반드시 `EARTHUS_V2_CLAUDE_CODE_FULL_DEVELOPMENT_MASTER_v5.3_KO` corrected canonical을 첫 번째로 읽는다.**

과거 v5.2, v5.1 Intelligence, v3.x, Planet Render, Cloud, Frontend 문서는 역사/세부 구현 근거로만 사용한다. 본 패키지의 `*_CORRECTED` 또는 `*_SUPERSEDED_ARCHIVE` 버전만 사용한다.

## 2. 절대 시각 규칙

- mapped.earth/earth = GLOBAL 3D 최소 PASS bar.
- GLOBAL부터 실제 3D. 줌은 3D 정밀도 증가.
- 사진/위성영상 = observation/material input. world/terrain/cloud/ocean 대체 금지.
- fallback = HIGH_3D → MEDIUM_3D → LOW_3D → STATIC_3D → OFF.
- one continuous Earth: GLOBAL → CONTINENT → COUNTRY → REGION → LOCAL → UNDERWATER.
- 실제 geometry/flow/volume/field가 없으면 INSUFFICIENT_DATA/OFF. 사진으로 가장하지 않는다.

## 3. Intelligence / LLM / Simulation

- Canonical Earth State + Earth Version이 기준 상태.
- Intelligence는 Event/Evidence/Confidence/Impact/Scenario를 계산.
- 3D/4D Scene은 그 상태를 공간적으로 표현.
- LLM은 설명 + 승인된 SceneIntent interface. scientific compute/geometry 생성 금지.
- Simulation은 immutable baseline branch + Earth Diff.

## 4. 과거 문서 충돌 처리

`cloud shell`, `global Earth skin`, `VOLUME→CTH→SHELL`, `photo-as-world`, `imagery shell`, `Underwater FUTURE-only` 같은 과거 규칙은 현재 corrected canonical과 충돌하면 **DO NOT IMPLEMENT**.

## 5. 검수

실제 브라우저/실기기에서 terrain silhouette, ocean-only lighting response, cloud-ground parallax, scope/resource transition, eviction/disposal, SceneEvidenceSnapshot/Intelligence alignment, Scenario baseline immutability를 증명하지 못하면 DONE이 아니다.

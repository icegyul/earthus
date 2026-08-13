# PR-00 Evidence

이 폴더는 `tools/measure_visual_pr00.mjs`가 2026-08-13 생성한 로컬 기준선이다.

- [`baseline.json`](baseline.json): source time, layer/sibling, request key, mask timing,
  render, texture, GPU capability, layout, 오류 요약
- desktop: [첫 Earth](desktop-1280x720-earth.png) ·
  [Himawari](desktop-1280x720-himawari.png) · [GK-2A](desktop-1280x720-gk2a.png)
- mobile: [첫 Earth](mobile-390x844-earth.png) ·
  [Himawari](mobile-390x844-himawari.png) · [GK-2A](mobile-390x844-gk2a.png)

정밀 위치·계정 식별자·검색어·URL query 값은 기록하지 않는다. 관측 자료와 시간은 바뀌므로
재측정 결과가 완전히 같은 요청 수가 되는 것을 요구하지 않는다. 합격 기준과 해석은
[`../../PR00-CONTRACT-MEASUREMENT-ADR.md`](../../PR00-CONTRACT-MEASUREMENT-ADR.md)를 따른다.

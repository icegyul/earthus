# 산불 상세 장문 경고 제거 — 운영 증거

> 검증·운영 반영: 2026-08-14 13:40 KST
>
> 상태: OPERATING

산불 상세마다 붙던 `열점이 모두 산불은 아닙니다` 이하의 화산·가스플레어·화전·구름·
위성 통과 설명 블록을 제거했다. 화면에는 FRP, 화선 길이, 탐지 픽셀, 최근 관측시각, 위성,
위성 영상처럼 사용자가 산불을 보는 데 필요한 정보만 유지한다. 열점의 해석 한계는 데이터를
산불로 과단정하지 않기 위한 내부 코드 원칙으로만 남겼다.

검증 결과 로컬·운영 산불 상세 모두 삭제 문구·가스플레어·`불이 없음` 표현 0, FRP·관측시각·
VIIRS 표시 PASS다. 공개 UI 계약도 통과했다.

- `js/ui.js` — `42b2eaba1249efa4c964654bc3db6214e59e686085150dcad9c92ff3f31791fd`
- `js/layers/wildfire.js` — `d900c39a32f8a5282aff5cb28182048a7aa727d8b8d92a0a9465cbf14865715e`
- local/live SHA-256 — 2/2 일치
- 운영 헤더 — JavaScript MIME·`no-cache` 확인
- CloudFront invalidation — `IB36PVNDHF3NPVAUZ0AIB8ISY0`

롤백은 위 두 JavaScript의 직전 object version만 복원하고 같은 두 경로를 무효화한다.

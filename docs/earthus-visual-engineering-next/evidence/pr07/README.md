# PR-07 자동화·화면 증거

실행: 2026-08-13 23:17~23:27 KST

- Chrome `151.0.7922.109`
- desktop 1280×720 DPR1
- mobile 390×844 DPR2 + save-data
- Retina desktop 1600×900 DPR2
- desktop에서 GK-2A↔Himawari 30회 교대
- effect OFF→LOW, offline→online, WebGL context loss→reload 시나리오

정본 수치는 [`report.json`](report.json)에 있다. 각 PNG는 첫 Earth, Himawari, desktop GK-2A,
context 복귀 직후 화면이다. 정상 실행의 page/console error는 세 viewport 모두 0이며 context를
고의로 잃는 순간의 브라우저 shader 로그는 `inducedContextLossErrors`로 분리했다.

`failedResponses`는 숨기지 않는다. GIBS의 원판 밖/미완성 시각 404와 GK-2A 범위 밖 1개 key의
403이며, 관측값을 만들어 메우지 않는다. base 영상이 유지되고 앱 오류가 0인지를 별도로 본다.

실제 Safari/iPhone/Android/VoiceOver/열·배터리는 자동화 대상이 아니며 report의
`actualDeviceStatus`에 전부 `UNKNOWN`으로 기록했다.

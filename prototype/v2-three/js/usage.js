// EARTHUS v2-three — 익명 이용 집계
//
// 2026-09-07: 본체는 ../../js/usage.js (v1·v2 공용, FOR ME 깔때기 계측 허용 50개).
// 이 파일은 옛 import 경로('./usage.js?v=N')가 깨지지 않게 다시 내보내는 껍데기다.
// 번들(tools/build-v2-bundle.sh)이 공용 파일을 js/shared/ 로 복사하고 이 경로를 ./shared/usage.js 로 바꾼다.
export { usage, USAGE_EVENTS } from '../../js/usage.js';

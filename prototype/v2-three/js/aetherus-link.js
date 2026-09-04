// AETHERUS LINK — 정본 궤도 인텔리전스 레이어 ('하나의 우주' 연결)
//
// ⚠️ 구현은 더 이상 여기 있지 않다. AETHERUS 는 지구마다 갈래를 두지 않는다.
//    정본:  prototype/js/aetherus/core.js        데이터·전파·정직성 판정
//           prototype/js/aetherus/layer-three.js Three.js 로 그리기
//    같은 코어를 EARTHUS(/)는 layer-cesium.js 로, WONDER(/v3)는 이 layer-three.js 로 쓴다.
//
// 이 파일은 v2 씬이 부르던 이름(AetherusLink)을 그대로 유지하는 얇은 껍데기다 —
// main.js 의 임포트·인스턴스·overlayAdapter 배선을 건드리지 않기 위해서다.
// 배포 번들에서는 build-v2-bundle.sh 가 정본 트리를 js/aetherus/ 로 복사하고
// 아래 임포트 경로를 번들 기준으로 고쳐 쓴다 (자체완결 규칙 유지).

import * as THREE from '../../vendor/three-r184.module.min.js';
import { AetherusThreeLayer } from '../../js/aetherus/layer-three.js';

export class AetherusLink extends AetherusThreeLayer {
  constructor(scene, options = {}) {
    super(THREE, scene, options);
  }
}

export { AetherusThreeLayer };
export default AetherusLink;

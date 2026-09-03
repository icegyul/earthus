// EARTHUS v2 — 강수 색면 (윈디 규칙)
//
// 왜 색면인가: 윈디를 직접 열어 확인했다(2026-09-03). 윈디의 비 레이어는 아이콘이 아니라
// **연속 색면**이고 범례는 mm 단위(1.5·2·3·7·10·20·30)다. 뇌우도 별도 색면이며 l/km² 다.
// PD 가 준 레퍼런스의 분홍 표식은 아이콘이 아니라 색 램프의 최고 강도 구간이었다.
//
// 아이콘 방식(js/precip-icons.js)에서 겪은 문제가 색면에서는 구조적으로 사라진다:
//   격자무늬(일정 간격으로 뽑아서 생김) · 위아래 뒤집힘 · 축척마다 크기 조절 · 개수 예산.
//
// 뇌우는 여기서 그리지 않는다. 대류강수×CAPE 는 아열대에서 흔해 색면으로 칠하면
// 강수 구역의 절반이 뇌우색이 된다(디버그 렌더로 확인). 번개는 js/lightning-marks.js 로 나갔다.
//
// 자료: GFS 강수 프레임 p{step}.png — R=강도(log mm/h) · G=종류. 종류는 예보 모델의 판정이다.
// 없는 곳에는 아무것도 그리지 않는다.
import * as THREE from '../../vendor/three-r184.module.min.js';

const VERT = /* glsl */ `
varying vec3 vUnit;
void main() {
  vUnit = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D uP;
uniform sampler2D uPB;
uniform float uBlend;
uniform float uOpacity;
uniform vec3 uSunDir;
varying vec3 vUnit;
const float PI = 3.141592653589793;

// 인코딩 되돌리기: R = log 로 눌린 mm/h (0.05 이하 0, 30 이상 255)
float mmh(float r) {
  if (r < 0.004) return 0.0;
  return pow(10.0, r * 2.7782 + (-1.3010));   // log10(0.05) = -1.3010, log10(30/0.05) = 2.7782
}

// 윈디 비 램프: 1.5 / 2 / 3 / 7 / 10 / 20 / 30 mm 구간을 색으로 나눈 것과 같은 문법.
vec3 rainRamp(float v) {
  if (v < 1.5)  return mix(vec3(0.29, 0.47, 0.78), vec3(0.27, 0.68, 0.72), v / 1.5);
  if (v < 3.0)  return mix(vec3(0.27, 0.68, 0.72), vec3(0.35, 0.76, 0.36), (v - 1.5) / 1.5);
  if (v < 7.0)  return mix(vec3(0.35, 0.76, 0.36), vec3(0.90, 0.86, 0.30), (v - 3.0) / 4.0);
  if (v < 12.0) return mix(vec3(0.90, 0.86, 0.30), vec3(0.95, 0.58, 0.20), (v - 7.0) / 5.0);
  if (v < 20.0) return mix(vec3(0.95, 0.58, 0.20), vec3(0.90, 0.24, 0.24), (v - 12.0) / 8.0);
  if (v < 30.0) return mix(vec3(0.90, 0.24, 0.24), vec3(0.88, 0.25, 0.78), (v - 20.0) / 10.0);
  return vec3(0.95, 0.55, 0.95);
}

// 눈은 비와 같은 색이면 안 된다 — 차가운 흰·보라 쪽으로 따로 간다.
vec3 snowRamp(float v) {
  if (v < 1.5)  return mix(vec3(0.55, 0.70, 0.88), vec3(0.72, 0.84, 0.97), v / 1.5);
  if (v < 5.0)  return mix(vec3(0.72, 0.84, 0.97), vec3(0.92, 0.95, 1.00), (v - 1.5) / 3.5);
  return mix(vec3(0.92, 0.95, 1.00), vec3(0.80, 0.72, 1.00), min(1.0, (v - 5.0) / 10.0));
}

void main() {
  vec3 n = normalize(vUnit);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  vec4 p = mix(texture2D(uP, uv), texture2D(uPB, uv), uBlend);
  float v = mmh(p.r);
  // 뇌우(p.b)는 여기서 쓰지 않는다. 색면으로 칠하면 아열대 강수의 절반이 뇌우색이 된다(실측).
  // 번개는 별도 표식으로 나갔다 — js/lightning-marks.js
  if (v < 0.5) discard;

  float snowy = smoothstep(0.72, 0.96, p.g);
  // 종류(G)는 범주값이다. 이중선형 보간이 경계에서 중간값을 만들어 '어는비'로 읽히면
  // 지구가 보라로 덮인다 — 128(=0.502) 둘레의 좁은 구간에서만 인정한다.
  float mixy = (1.0 - smoothstep(0.06, 0.13, abs(p.g - 0.502))) * (1.0 - snowy);
  vec3 col = mix(rainRamp(v), snowRamp(v), snowy);
  col = mix(col, vec3(0.72, 0.55, 0.95), mixy * 0.7);        // 어는비·진눈깨비

  // 윈디 범례가 1.5mm 부터인 이유가 있다 — 그 아래는 화면에서 의미가 없다.
  // 0.5mm 부터 아주 옅게 들어와 2mm 를 넘어야 눈에 들어온다.
  float a = smoothstep(0.5, 2.0, v) * 0.34 + smoothstep(2.0, 8.0, v) * 0.34
          + smoothstep(8.0, 25.0, v) * 0.22;

  if (a < 0.010) discard;
  // 밤에도 읽히게 바닥값을 둔다. 낮/밤 대비는 남긴다.
  float day = smoothstep(-0.15, 0.20, dot(n, uSunDir));
  gl_FragColor = vec4(col * (0.70 + 0.30 * day), a * uOpacity);
  #include <colorspace_fragment>
}`;

export class PrecipField {
  constructor(scene) {
    this.uniforms = {
      uP: { value: null },
      uPB: { value: null },
      uBlend: { value: 0 },
      uOpacity: { value: 0.92 },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
    };
    // 구름보다 낮고 지표보다 높다. 구름에서 '내리는' 것으로 읽혀야 한다.
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.0012, 256, 128),
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setVisible(v) { this.mesh.visible = !!v; }

  // 두 프레임과 그 사이 비율. 구름과 같은 시각을 쓴다.
  set(texA, texB, blend) {
    if (!texA) { this.mesh.visible = false; return; }
    this.uniforms.uP.value = texA;
    this.uniforms.uPB.value = texB || texA;
    this.uniforms.uBlend.value = texB ? blend : 0;
    this.mesh.visible = true;
  }

  setSun(v) { this.uniforms.uSunDir.value.copy(v); }
}

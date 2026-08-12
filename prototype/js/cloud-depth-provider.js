/* 정지위성 타일의 시각용 깊이 보강.
 *
 * NOAA 단일 전지구 합성은 cloud-shadow.js가 관측 알파를 한 번에 투영한다. 반면
 * 히마와리·천리안 상세는 현재 화면에 필요한 XYZ 타일만 받으므로, 이 제공자가 같은
 * 타일을 1/4 이하 해상도로 읽어 구름 본체 아래에 놓일 검은 마스크만 만든다.
 *
 * ⚠️ 이 층은 구름 높이·일사량·위험 자료가 아니다. 가시광은 관측 시각 태양 방향의
 *    시각 그림자이고, 적외는 태양 그림자로 오해하지 않도록 2px 이하의 부드러운
 *    명암 분리만 쓴다. 수치·내보내기·판단 자료로 노출하지 않는다.
 * ⚠️ 별도 타이머나 렌더 루프가 없다. Cesium이 실제로 요청한 타일을 받을 때만 만든다. */

import { cloudShadowSourceAt, normalizeCloudShadowSun } from './cloud-shadow.js?v=20260812-cloudshadow1';

const SAMPLE_LIMIT = 128;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 원본 한 화소가 깊이 마스크에 기여하는 정도. 테스트 가능한 순수 함수다. */
export function cloudDepthMaskAlpha({ red, green, blue, alpha, mode }) {
  if (![red, green, blue, alpha].every(Number.isFinite)) {
    throw new TypeError('FINITE_CLOUD_PIXEL_REQUIRED');
  }
  const sourceAlpha = clamp(alpha / 255);
  if (mode === 'alpha') return sourceAlpha;

  const high = Math.max(red, green, blue) / 255;
  const low = Math.min(red, green, blue) / 255;
  if (mode === 'infrared') {
    /* GIBS Band 13은 검은 따뜻한 배경을 뚫고 밝은 찬 구름 꼭대기만 남긴다.
       본체의 colorToAlphaThreshold(0.62)와 같은 경계부터 부드럽게 시작한다. */
    return sourceAlpha * smoothstep(0.60, 0.88, high);
  }
  if (mode === 'visible') {
    /* 단일 가시광 밴드는 지표도 담는다. 구름을 새로 판정하는 척하지 않고 밝고
       무채색인 화소만 보수적으로 쓴다. 얇은 구름을 지우는 본체 임계값은 건드리지 않는다. */
    const neutral = 1 - clamp((high - low) * 2.8);
    return sourceAlpha * smoothstep(0.58, 0.90, low) * neutral;
  }
  throw new RangeError('UNKNOWN_CLOUD_DEPTH_MODE');
}

function wrapLongitude(value) {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

/** 가시광 타일 중심에서 관측 시각 태양 반대편으로 갈 화면 오프셋을 구한다. */
export function cloudDepthOffset({ rectangle, sun, width, height }) {
  if (!sun || !rectangle) {
    return {
      x: clamp(width / 180, 1.5, 5),
      y: clamp(height / 140, 1.8, 5),
      daylight: 1,
    };
  }
  const west = rectangle.west;
  const east = rectangle.east < west ? rectangle.east + Math.PI * 2 : rectangle.east;
  const longitude = wrapLongitude((west + east) / 2);
  const latitude = (rectangle.south + rectangle.north) / 2;
  const source = cloudShadowSourceAt({ longitude, latitude, sun });
  if (!source) return { x: 0, y: 0, daylight: 0 };
  const lonSpan = Math.max(1e-6, east - west);
  const latSpan = Math.max(1e-6, rectangle.north - rectangle.south);
  const sourceDeltaLon = wrapLongitude(source.longitude - longitude);
  /* sourceAt은 '그림자 위치에서 보이는 구름 원본'을 돌려준다. 따라서 실제 구름
     마스크는 그 반대 방향으로 옮겨야 지표 그림자 위치가 된다. */
  const x = clamp(-sourceDeltaLon / lonSpan * width, -8, 8);
  const y = clamp((source.latitude - latitude) / latSpan * height, -8, 8);
  return { x, y, daylight: source.daylight };
}

/** 기존 ImageryProvider의 수명과 격자를 그대로 위임하는 검은 마스크 제공자. */
export class CloudDepthImageryProvider {
  constructor(provider, { mode = 'alpha', sun = null } = {}) {
    if (!provider) throw new TypeError('IMAGERY_PROVIDER_REQUIRED');
    this.provider = provider;
    this.mode = mode;
    this.sun = sun ? normalizeCloudShadowSun(sun) : null;
  }

  get rectangle() { return this.provider.rectangle; }
  /* 단일 전면 원본은 1600px여도 부드러운 그림자에 그 해상도가 필요 없다.
     512px로 제한해 추가 GPU 텍스처를 약 1MB 안쪽으로 묶는다. XYZ 256px는 그대로다. */
  get tileWidth() { return Math.min(512, this.provider.tileWidth || 256); }
  get tileHeight() { return Math.min(512, this.provider.tileHeight || 256); }
  get maximumLevel() { return this.provider.maximumLevel; }
  get minimumLevel() { return this.provider.minimumLevel; }
  get tilingScheme() { return this.provider.tilingScheme; }
  get tileDiscardPolicy() { return this.provider.tileDiscardPolicy; }
  get errorEvent() { return this.provider.errorEvent; }
  get credit() { return undefined; } // 본체 제공자가 한 번만 표시한다.
  get proxy() { return this.provider.proxy; }
  get hasAlphaChannel() { return true; }
  get ready() { return this.provider.ready ?? true; }
  get readyPromise() { return this.provider.readyPromise ?? Promise.resolve(true); }
  getTileCredits() { return undefined; }

  pickFeatures(x, y, level, longitude, latitude) {
    return this.provider.pickFeatures
      ? this.provider.pickFeatures(x, y, level, longitude, latitude)
      : undefined;
  }

  requestImage(x, y, level, request) {
    const result = this.provider.requestImage(x, y, level, request);
    if (!result) return undefined;
    return Promise.resolve(result).then(image => this._makeMask(image, x, y, level));
  }

  _makeMask(image, x, y, level) {
    const outputWidth = Number(this.tileWidth || image.naturalWidth || image.width || 256);
    const outputHeight = Number(this.tileHeight || image.naturalHeight || image.height || 256);
    const output = document.createElement('canvas');
    output.width = outputWidth; output.height = outputHeight;
    const outputContext = output.getContext('2d');
    try {
      const sampleWidth = Math.max(1, Math.min(SAMPLE_LIMIT, Math.ceil(outputWidth / 4)));
      const sampleHeight = Math.max(1, Math.min(SAMPLE_LIMIT, Math.ceil(outputHeight / 4)));
      const sample = document.createElement('canvas');
      sample.width = sampleWidth; sample.height = sampleHeight;
      const sampleContext = sample.getContext('2d', { willReadFrequently: true });
      sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const a = cloudDepthMaskAlpha({
          red: pixels.data[i], green: pixels.data[i + 1], blue: pixels.data[i + 2],
          alpha: pixels.data[i + 3], mode: this.mode,
        });
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
        pixels.data[i + 3] = Math.round(255 * a);
      }
      sampleContext.putImageData(pixels, 0, 0);

      const singleTile = this.maximumLevel === 0 && this.minimumLevel === 0;
      const rectangle = !singleTile && this.tilingScheme?.tileXYToRectangle
        ? this.tilingScheme.tileXYToRectangle(x, y, level)
        : this.rectangle;
      const offset = cloudDepthOffset({
        rectangle, sun: this.sun, width: outputWidth, height: outputHeight,
      });
      outputContext.globalAlpha = offset.daylight;
      outputContext.filter = this.mode === 'visible' ? 'blur(1.6px)' : 'blur(1.2px)';
      outputContext.drawImage(sample, offset.x, offset.y, outputWidth, outputHeight);
    } catch (error) {
      /* CORS나 손상 타일 한 장 때문에 본체 관측 영상까지 막지 않는다. 투명 마스크로
         폴백하면 구름은 그대로 보이고 깊이 효과만 빠진다. */
      console.debug('[cloud-depth] mask skipped:', error?.message || error);
    }
    return output;
  }
}

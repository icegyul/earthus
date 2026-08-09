// GEBCO 0.1도 수심 격자 — 정적 Range 조회
//
// Lambda Function URL의 계정 차원 403이 풀리기 전에도 같은 정본 격자를 읽는다.
// 한 지점에 필요한 인접 셀 사이 구간만(보통 약 7KB) 받아 13MB 전체를 받지 않는다.
// ⚠️ 셀 최심값 기반 정보 제품이다. 특정 좌표의 실측·항해 안전 자료로 부르지 않는다.

import { API } from '../config.js';

const ROOT = `${API.OCEAN}/depth-grid`;

export function gridCoordinates(lat, lon, manifest) {
  const [rows, cols] = manifest.output.shape;
  const resolution = Number(manifest.output.resolutionDegrees);
  const normalizedLon = ((lon + 180) % 360 + 360) % 360 - 180;
  const y = Math.max(0, Math.min(rows - 1, (lat + 90 - resolution / 2) / resolution));
  const x = ((normalizedLon + 180 - resolution / 2) / resolution + cols) % cols;
  const y0 = Math.floor(y), x0 = Math.floor(x);
  return {
    normalizedLon, y0, x0,
    y1: Math.min(rows - 1, y0 + 1), x1: (x0 + 1) % cols,
    fy: y - y0, fx: x - x0,
  };
}

export function bilinear(a00, a01, a10, a11, fx, fy) {
  const north0 = a00 * (1 - fx) + a01 * fx;
  const north1 = a10 * (1 - fx) + a11 * fx;
  return north0 * (1 - fy) + north1 * fy;
}

export const oceanDepth = {
  manifest: null,

  async loadManifest() {
    if (this.manifest) return this.manifest;
    const response = await fetch(`${ROOT}.manifest.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`DEPTH_MANIFEST_${response.status}`);
    const manifest = await response.json();
    if (manifest.schema !== 'earthus.depth-grid-manifest.v1') throw new Error('DEPTH_MANIFEST_SCHEMA');
    if (manifest.output?.dtype !== 'int16 little-endian') throw new Error('DEPTH_GRID_DTYPE');
    this.manifest = manifest;
    return manifest;
  },

  async query(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
      throw new RangeError('LAT_LON_REQUIRED');
    }
    const manifest = await this.loadManifest();
    const [rows, cols] = manifest.output.shape;
    const c = gridCoordinates(lat, lon, manifest);
    const indices = [
      c.y0 * cols + c.x0, c.y0 * cols + c.x1,
      c.y1 * cols + c.x0, c.y1 * cols + c.x1,
    ];
    const first = Math.min(...indices);
    const last = Math.max(...indices);
    const response = await fetch(`${ROOT}.bin`, {
      headers: { Range: `bytes=${first * 2}-${last * 2 + 1}` },
      cache: 'force-cache',
    });
    if (!response.ok) throw new Error(`DEPTH_GRID_${response.status}`);
    const bytes = await response.arrayBuffer();
    // S3/CloudFront가 Range를 존중하면 206의 첫 바이트가 first, 200이면 파일 0이다.
    const baseIndex = response.status === 206 ? first : 0;
    const view = new DataView(bytes);
    const value = index => {
      const offset = (index - baseIndex) * 2;
      if (offset < 0 || offset + 2 > view.byteLength) throw new Error('DEPTH_GRID_TRUNCATED');
      return view.getInt16(offset, true);
    };
    const elevation = bilinear(
      value(indices[0]), value(indices[1]), value(indices[2]), value(indices[3]), c.fx, c.fy);
    const rounded = Math.round(elevation);
    return {
      lat: Number(lat.toFixed(6)), lon: Number(c.normalizedLon.toFixed(6)),
      elevationM: rounded, depthM: rounded < 0 ? -rounded : 0, isOcean: rounded < 0,
      resolution: '0.1° 격자 (적도에서 약 11km)',
      method: manifest.method,
      source: { ...manifest.source, gridBuilt: manifest.generatedAt },
      sample: { sourceGridCellsPerCoarseCell: 576, kind: '격자 셀, 독립 관측 표본 아님' },
      limitations: manifest.limitations,
      safety: '항해·해상 안전 판단에 사용하지 마세요.',
      gridSha256: manifest.output.sha256,
    };
  },
};

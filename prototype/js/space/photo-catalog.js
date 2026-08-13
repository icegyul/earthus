// Aetherus 우주 사진관의 단일 카탈로그 소유자.
//
// 예전에는 EARTHUS 천구 레이어와 Aetherus 3D 사진 모드가 같은 JSON을 각각
// 가져와 검증하고 별도 상태로 보관했다. PR-02부터 모든 사진 소비자는 이 모듈을
// 지나며, 동시 호출도 하나의 요청 promise를 공유한다.

import { assertAetherusCatalog } from './contracts.js';

export const AETHERUS_PHOTO_TELESCOPES = Object.freeze(['ALL', 'HST', 'JWST']);
const CATALOG_URL = '/data/space-photos.json';
let catalogPromise = null;

export function normalizeAetherusTelescope(value, fallback = 'ALL') {
  const normalized = String(value || fallback).trim().toUpperCase();
  return AETHERUS_PHOTO_TELESCOPES.includes(normalized) ? normalized : fallback;
}

export function filterAetherusPhotos(items, telescope = 'ALL') {
  const normalized = normalizeAetherusTelescope(telescope);
  return normalized === 'ALL' ? [...items] : items.filter(item => item.telescope === normalized);
}

export function resolveAetherusPhoto(items, photoId) {
  if (!photoId) return null;
  return items.find(item => item.id === photoId) || null;
}

export function aetherusPhotoCounts(items) {
  return Object.freeze({
    ALL: items.length,
    HST: items.filter(item => item.telescope === 'HST').length,
    JWST: items.filter(item => item.telescope === 'JWST').length,
  });
}

export function loadAetherusPhotoCatalog({ refresh = false } = {}) {
  if (refresh) catalogPromise = null;
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch(CATALOG_URL, { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`SPACE_PHOTOS_${response.status}`);
      return response.json();
    })
    .then(raw => assertAetherusCatalog('space-photos', raw))
    .catch(error => {
      // 일시적인 네트워크 실패 promise를 영구 캐시하지 않는다. 다음 명시적 진입은
      // 다시 시도할 수 있지만, 한 번의 진입 안에서 무한 재시도는 하지 않는다.
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

// EARTHUS 새 탭 — 저장소 (2026-09-24 · 지시서 §4-3)
//
// 두 군데에 둔다.
//   · Cache Storage  — 큰 것: 구름 WebP(sha256 이 meta 와 맞은 최신 1벌) · 합성본(바탕+구름 정사영 원반, 최신 1벌).
//   · chrome.storage.local — 작은 것: 정규화한 사실 JSON(feeds) · 지금 쥔 구름의 meta(cloud) · 설정(settings) ·
//     마지막으로 새 탭을 연 시각(lastNewtabOpenAt) · 마지막 받기 시각(lastFetchAt).
//   ⚠️ Cache API 는 http(s) 주소만 열쇠로 받는다(chrome-extension:// 열쇠는 던진다). 그래서 열쇠는 아래의 가짜 https 주소다 —
//     이 주소로 요청을 보내는 일은 없다. 열쇠일 뿐이다.
//   ⚠️ 그림과 그 시각은 **같은 응답의 머리글**에 같이 둔다. 둘을 따로 두면 한쪽만 바뀐 순간 새 시각 라벨에 지난 그림이 붙는다
//     (지시서 R14 — 짝 어긋남).

const CACHE_NAME = 'earthus-newtab-v1';
const KEY_CLOUD = 'https://earthus.net/__earthus-newtab/cloud-2048.webp';
const KEY_COMPOSITE = 'https://earthus.net/__earthus-newtab/composite.webp';
const INFO_HEADER = 'x-earthus-info';

const hasChrome = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export async function getLocal(keys) {
  if (!hasChrome()) return {};
  return chrome.storage.local.get(keys === undefined ? null : keys);
}
export async function setLocal(obj) {
  if (!hasChrome()) return;
  await chrome.storage.local.set(obj);
}

async function putBlob(key, blob, info) {
  const c = await caches.open(CACHE_NAME);
  const headers = { 'content-type': blob.type || 'application/octet-stream', [INFO_HEADER]: encodeURIComponent(JSON.stringify(info)) };
  await c.put(key, new Response(blob, { headers }));
}
async function getBlob(key) {
  const c = await caches.open(CACHE_NAME);
  const r = await c.match(key);
  if (!r) return null;
  let info = null;
  try { info = JSON.parse(decodeURIComponent(r.headers.get(INFO_HEADER) || '')); } catch { info = null; }
  if (!info) return null;
  return { blob: await r.blob(), info };
}

// 구름: info = { time, credit, north, south, sha256, via }
export const putCloud = (blob, info) => putBlob(KEY_CLOUD, blob, info);
export const getCloud = () => getBlob(KEY_CLOUD);
// 합성본: info = { key, cloudTime, cloudTimeMs, credit, lon0, size }
export const putComposite = (blob, info) => putBlob(KEY_COMPOSITE, blob, info);
export const getComposite = () => getBlob(KEY_COMPOSITE);

// sw.js 의 refreshAll 이 받는 저장소 모양. 시험은 같은 모양의 메모리 저장소를 넘긴다.
export const chromeStore = Object.freeze({
  get: getLocal,
  set: setLocal,
  putCloud,
  getCloud,
});

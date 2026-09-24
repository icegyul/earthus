// EARTHUS 새 탭 설정 (2026-09-24 · 지시서 §4-2) — 내 장소(도시 목록) · 사실 줄 켜고 끄기.
//   위치 권한을 쓰지 않는다(D6). 고른 것은 chrome.storage.local.settings 에만 둔다 — 서버로 보내지 않는다.

import { DEFAULT_LINES } from './feeds.js';

const t = (k, s) => chrome.i18n.getMessage(k, s);
const LANG = /^ko/i.test(chrome.i18n.getUILanguage() || '') ? 'ko' : 'en';
const $ = (id) => document.getElementById(id);
const LINE_IDS = ['sky', 'warn', 'quake', 'tsunami'];

async function main() {
  document.documentElement.lang = LANG;
  document.title = t('optTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

  const doc = await (await fetch('data/cities.json')).json();
  const { settings = {} } = await chrome.storage.local.get('settings');
  const lines = Object.assign({}, DEFAULT_LINES, settings.lines || {});
  const cityId = doc.cities.some((c) => c.id === settings.cityId) ? settings.cityId : doc.defaultCity;

  const sel = $('city');
  for (const c of doc.cities) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = LANG === 'ko' ? c.ko : `${c.en} (${c.ko})`;
    sel.append(o);
  }
  sel.value = cityId;
  const showStation = () => {
    const c = doc.cities.find((x) => x.id === sel.value);
    $('station').textContent = c ? t('optStation', [c.stationId, c.stationName]) : '';
  };
  showStation();
  for (const id of LINE_IDS) $(`line-${id}`).checked = lines[id] !== false;

  const save = async () => {
    const next = { cityId: sel.value, lines: {} };
    for (const id of LINE_IDS) next.lines[id] = $(`line-${id}`).checked;
    await chrome.storage.local.set({ settings: next });
    showStation();
    $('saved').hidden = false;
  };
  sel.addEventListener('change', save);
  for (const id of LINE_IDS) $(`line-${id}`).addEventListener('change', save);
}

main();

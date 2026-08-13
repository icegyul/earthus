/* 관측값과 분리된 시각 효과 품질 설정.
 *
 * ⚠️ 이 값은 위험·추천·예약·CSV에 들어가지 않는다. 낮은 기기 성능이나 사용자의
 * 데이터 절약 선택은 구름 관측 본체가 아니라 깊이 효과만 낮춘다. */

const STORAGE_KEY = 'earthus.visualEffect';
export const VISUAL_EFFECT_MODES = Object.freeze(['auto', 'low', 'off']);

function safeMatch(query) {
  try { return !!window.matchMedia?.(query).matches; } catch (_) { return false; }
}

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY) || 'auto';
    return VISUAL_EFFECT_MODES.includes(value) ? value : 'auto';
  } catch (_) { return 'auto'; }
}

export const visualEffects = {
  mode: readStored(),

  resolved() {
    if (this.mode === 'off') return 'off';
    if (this.mode === 'low') return 'low';
    const memoryGb = Number(navigator.deviceMemory || 0);
    const saveData = navigator.connection?.saveData === true;
    const reducedMotion = safeMatch('(prefers-reduced-motion: reduce)');
    return saveData || reducedMotion || (memoryGb > 0 && memoryGb < 4) ? 'low' : 'auto';
  },

  sampleLimit() { return this.resolved() === 'low' ? 64 : 128; },

  set(next) {
    if (!VISUAL_EFFECT_MODES.includes(next) || next === this.mode) return false;
    this.mode = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { }
    document.dispatchEvent(new CustomEvent('earthus:visual-effect-change', {
      detail: { mode: next, resolved: this.resolved() },
    }));
    return true;
  },
};

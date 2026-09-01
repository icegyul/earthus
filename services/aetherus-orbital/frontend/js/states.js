/**
 * Explicit, designed states: loading, API failure, empty catalog.
 * The UI never fills missing data with synthetic content.
 */

const GLYPHS = {
  loading: `<div class="spinner" aria-hidden="true"><span></span><span></span></div>`,
  error: `<svg class="state-card__glyph state-card__glyph--error" viewBox="0 0 54 54" fill="none" aria-hidden="true">
    <circle cx="27" cy="27" r="20" stroke="currentColor" stroke-width="1.6"/>
    <path d="M27 16v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="27" cy="37.5" r="1.8" fill="currentColor"/>
  </svg>`,
  empty: `<svg class="state-card__glyph state-card__glyph--empty" viewBox="0 0 54 54" fill="none" aria-hidden="true">
    <circle cx="27" cy="27" r="20" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 5"/>
    <ellipse cx="27" cy="27" rx="24" ry="8" stroke="currentColor" stroke-width="1" opacity=".5"/>
  </svg>`,
};

const overlay = () => document.getElementById("state-overlay");

function renderOverlay(html) {
  const node = overlay();
  if (html === null) {
    node.hidden = true;
    node.innerHTML = "";
    return;
  }
  node.hidden = false;
  node.innerHTML = html;
}

export function showLoading(title, text) {
  renderOverlay(`
    <div class="state-card">
      ${GLYPHS.loading}
      <h2 class="state-card__title">${title}</h2>
      <p class="state-card__text">${text}</p>
    </div>`);
}

export function showError({ title, text, code, retry }) {
  renderOverlay(`
    <div class="state-card">
      ${GLYPHS.error}
      <h2 class="state-card__title">${title}</h2>
      <p class="state-card__text">${text}</p>
      ${code ? `<code class="state-card__code">${code}</code>` : ""}
      <div class="state-card__actions">
        ${retry ? `<button class="btn" id="state-retry">Retry</button>` : ""}
      </div>
    </div>`);
  const retryButton = document.getElementById("state-retry");
  if (retryButton && retry) retryButton.addEventListener("click", retry);
  if (retryButton) retryButton.focus();
}

export function showEmptyCatalog(text, code) {
  renderOverlay(`
    <div class="state-card">
      ${GLYPHS.empty}
      <h2 class="state-card__title">Catalog is empty</h2>
      <p class="state-card__text">${text}</p>
      ${code ? `<code class="state-card__code">${code}</code>` : ""}
    </div>`);
}

export function hideOverlay() {
  renderOverlay(null);
}

let toastTimer = null;
export function toast(message, { tone = "stale" } = {}) {
  const node = document.getElementById("toast");
  node.style.borderColor = tone === "stale" ? "var(--stale)" : "var(--error)";
  node.style.color = tone === "stale" ? "var(--stale)" : "var(--error)";
  node.textContent = message;
  node.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("toast--show"), 6000);
}

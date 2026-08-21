function directSourceRows(root) {
  return [...root.children].filter(node => node.matches?.('span'));
}

function compactText(node) {
  return String(node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function koreanUi() {
  return String(document.documentElement.lang || 'ko').toLowerCase().startsWith('ko');
}

export function attachProvenanceDock(root) {
  if (!root) throw new TypeError('provenance root is required');
  if (root.__earthusProvenanceDock) return root.__earthusProvenanceDock;

  const dock = document.createElement('aside');
  dock.id = 'provenanceDock';
  dock.className = 'provenance-dock';
  dock.setAttribute('aria-label', '자료 출처');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pd-toggle';
  toggle.setAttribute('aria-controls', root.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span class="pd-mark" aria-hidden="true"></span>'
    + '<span class="pd-copy"><b class="pd-label"></b><span class="pd-summary"></span></span>'
    + '<span class="pd-count" aria-hidden="true"></span>';

  const credits = document.createElement('div');
  credits.className = 'pd-credits';

  root.before(dock);
  dock.append(toggle, root, credits);

  let expanded = false;
  const sync = () => {
    const rows = directSourceRows(root);
    const ko = koreanUi();
    const visible = root.classList.contains('on') && rows.length > 0;
    const label = ko ? '출처' : 'Source';
    const summary = compactText(rows[0]) || (ko ? '자료 출처 확인' : 'View data source');

    dock.hidden = !visible;
    dock.lang = ko ? 'ko' : 'en';
    dock.setAttribute('aria-label', ko ? '현재 화면 자료 출처' : 'Sources for the current view');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded
      ? (ko ? '출처 상세 닫기' : 'Close source details')
      : (ko ? '출처 상세 보기' : 'View source details'));
    toggle.querySelector('.pd-label').textContent = label;
    toggle.querySelector('.pd-summary').textContent = summary;
    toggle.querySelector('.pd-count').textContent = String(rows.length);
    root.hidden = !expanded;

    // 지도·천구처럼 화면에 항상 붙어 있어야 하는 크레딧은 접힌 상태에서도 남긴다.
    credits.replaceChildren(...rows
      .filter(row => row.classList.contains('map-credit'))
      .map(row => row.cloneNode(true)));
    credits.hidden = expanded || credits.childElementCount === 0;
  };

  const setExpanded = value => {
    expanded = Boolean(value) && !dock.hidden;
    sync();
    document.dispatchEvent(new CustomEvent('earthus:provenance-toggle', {
      detail: { expanded },
    }));
  };

  toggle.addEventListener('click', () => setExpanded(!expanded));
  dock.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setExpanded(false);
      toggle.focus();
    }
  });

  const observer = new MutationObserver(sync);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();

  const controller = Object.freeze({
    setExpanded,
    sync,
    destroy() {
      observer.disconnect();
      root.hidden = false;
      dock.before(root);
      dock.remove();
      delete root.__earthusProvenanceDock;
    },
  });
  root.__earthusProvenanceDock = controller;
  return controller;
}

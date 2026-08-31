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
  toggle.innerHTML = '<b class="pd-label"></b><span class="pd-summary"></span>';

  const credits = document.createElement('div');
  credits.className = 'pd-credits';

  root.before(dock);
  dock.append(toggle, root, credits);

  let expanded = false;
  const sync = () => {
    const rows = directSourceRows(root);
    const ko = koreanUi();
    const visible = root.classList.contains('on') && rows.length > 0;
    const label = ko ? '출처:' : 'Source:';
    const summary = root.dataset.inlineSource || compactText(rows[0])
      || (ko ? '자료 출처 확인' : 'View data source');

    dock.hidden = !visible;
    /* 독이 숨는 순간 펼침 상태도 버린다 — 남겨 두면 레이어를 껐다 켰을 때
       사용자가 열지 않았는데 펼쳐진 채 재등장한다. */
    if (!visible) expanded = false;
    dock.lang = ko ? 'ko' : 'en';
    dock.setAttribute('aria-label', ko ? '현재 화면 자료 출처' : 'Sources for the current view');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded
      ? (ko ? '출처 상세 닫기' : 'Close source details')
      : (ko ? '출처 상세 보기' : 'View source details'));
    toggle.querySelector('.pd-label').textContent = label;
    toggle.querySelector('.pd-summary').textContent = summary;
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
  /* 펼친 상세는 바깥을 눌러도 접힌다 — 예전엔 토글을 다시 정확히 누르는 것 말고는
     닫을 길이 없어, 모바일에서 좌하단을 계속 덮었다. 캡처 단계라 지도 조작보다 먼저 본다. */
  document.addEventListener('pointerdown', event => {
    if (expanded && !dock.contains(event.target)) setExpanded(false);
  }, true);

  const observer = new MutationObserver(sync);
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'data-inline-source'],
  });
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

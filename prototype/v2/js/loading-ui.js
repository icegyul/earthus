/* EARTHUS 2.0 task-driven loading presentation. */
(() => {
  'use strict';

  const STAGE_KO = Object.freeze({
    shell: '화면 준비 중…',
    configuration: '설정 확인 중…',
    session: '회원 상태 확인 중…',
    cesium: '3D 지구 엔진 준비 중…',
    viewer: '지구본 생성 중…',
    metadata: '자료 시각·출처 확인 중…',
    provider: '데이터 레이어 준비 중…',
    request: '자료 요청 중…',
    download: '자료 받는 중…',
    decode: '자료 해석 중…',
    parse: '자료 해석 중…',
    transform: '지구 데이터로 변환 중…',
    layer: '레이어 만드는 중…',
    attach: '지구에 표시하는 중…',
    render: '지구에 그리는 중…',
    first_render: '첫 화면 그리는 중…',
    ready: '준비 완료',
    failed: '불러오지 못했습니다.',
    cancelled: '불러오기를 취소했습니다.',
  });

  let installed = false;
  let resourceHideTimer = null;
  let lastFailed = null;
  let fidelityStarted = false;
  let intelligenceStarted = false;
  let seasonalStarted = false;
  let materializedStarted = false;
  let greenfieldStarted = false;

  const $ = id => document.getElementById(id);
  const stageText = stage => STAGE_KO[stage] || String(stage || '자료 처리 중…');

  function startVisualFidelity() {
    if (fidelityStarted) return;
    fidelityStarted = true;
    const url = new URL('./js/visual-fidelity-controller.js', location.href).href;
    import(url).then(mod => mod.installWhenReady({ timeoutMs: 45000 })).catch(error => {
      fidelityStarted = false;
      console.warn('[v2/visual-fidelity]', error?.message || error);
    });
  }

  function startIntelligence() {
    if (intelligenceStarted) return;
    intelligenceStarted = true;
    const url = new URL('./js/intelligence-runtime-bootstrap.js?v=20260830-intel51', location.href).href;
    import(url).catch(error => {
      intelligenceStarted = false;
      console.warn('[v2/intelligence]', error?.message || error);
    });
  }

  function startSeasonalCurrentEarth() {
    if (seasonalStarted) return;
    seasonalStarted = true;
    const url = new URL('./js/current-earth-seasonal.js?v=20260830-current-earth-1', location.href).href;
    import(url).then(mod => mod.installWhenReady({ timeoutMs: 45000 })).catch(error => {
      seasonalStarted = false;
      console.warn('[v2/current-earth-seasonal]', error?.message || error);
    });
  }

  function startMaterializedEarth() {
    if (materializedStarted) return;
    materializedStarted = true;
    const url = new URL('./js/materialized-earth-runtime.js?v=20260831-v52', location.href).href;
    import(url).catch(error => {
      materializedStarted = false;
      console.warn('[v2/materialized-earth]', error?.message || error);
    });
  }

  function startGreenfieldSceneBridge() {
    if (greenfieldStarted) return;
    greenfieldStarted = true;
    const url = new URL('./js/greenfield-scene-bridge.js?v=20260831-v253', location.href).href;
    import(url).then(mod => mod.installGreenfieldSceneBridge()).catch(error => {
      greenfieldStarted = false;
      console.warn('[v2/greenfield-bridge]', error?.message || error);
    });
  }

  function setBar(root, task) {
    const bar = root?.querySelector('[data-task-bar]');
    if (!root || !bar) return;
    const measurable = task?.progress != null && !task?.indeterminate;
    root.classList.toggle('indeterminate', !measurable && task?.status === 'RUNNING');
    if (measurable) bar.style.width = `${Math.max(0, Math.min(100, task.progress))}%`;
    else bar.style.width = '';
  }

  function renderBoot(task) {
    const root = $('bootLoading');
    if (!root || !task) return;
    const text = $('bootLoadingText');
    const detail = $('bootLoadingDetail');
    const actions = root.querySelector('.boot-load-actions');
    root.classList.remove('gone');
    root.classList.toggle('failed', task.status === 'FAILED');
    if (text) text.textContent = task.status === 'FAILED' ? '지구를 불러오지 못했습니다.' : stageText(task.stage);
    if (detail) detail.textContent = task.status === 'FAILED'
      ? (task.errorMessage || task.errorCode || 'BOOTSTRAP_FAILED')
      : [task.provider, task.stage].filter(Boolean).join(' · ');
    setBar(root, task);
    if (actions) actions.classList.toggle('on', task.status === 'FAILED');
    if (task.status === 'SUCCEEDED') {
      startVisualFidelity();
      startIntelligence();
      startSeasonalCurrentEarth();
      startMaterializedEarth();
      startGreenfieldSceneBridge();
      setTimeout(() => root.classList.add('gone'), 250);
    }
  }

  function chooseResource(active) {
    const nonBoot = active.filter(task => task.resource !== 'bootstrap');
    if (!nonBoot.length) return null;
    return nonBoot[nonBoot.length - 1];
  }

  function renderResource(task) {
    const root = $('resourceLoading');
    if (!root) return;
    clearTimeout(resourceHideTimer);
    if (!task) {
      root.classList.remove('on', 'indeterminate', 'failed');
      resourceHideTimer = setTimeout(() => root.classList.remove('on'), 180);
      return;
    }
    const title = $('resourceLoadingTitle');
    const meta = $('resourceLoadingMeta');
    const error = $('resourceLoadingError');
    const cancel = $('resourceLoadingCancel');
    const retry = $('resourceLoadingRetry');
    const failed = task.status === 'FAILED';
    root.classList.add('on');
    root.classList.toggle('failed', failed);
    if (title) title.textContent = task.label || task.resource;
    if (meta) meta.textContent = [stageText(task.stage), task.provider].filter(Boolean).join(' · ');
    if (error) error.textContent = failed ? (task.errorMessage || task.errorCode || 'RESOURCE_FAILED') : '';
    if (cancel) cancel.hidden = task.status !== 'RUNNING' || !task.cancellable;
    if (retry) retry.hidden = !failed || !task.retryable;
    setBar(root, task);
    if (failed) lastFailed = task;
  }

  function onTask(detail) {
    if (detail.task?.resource === 'bootstrap') renderBoot(detail.task);
    const selected = chooseResource(detail.active || []);
    if (selected) renderResource(selected);
    else if (detail.task?.resource !== 'bootstrap' && detail.task?.status === 'FAILED') renderResource(detail.task);
    else if (detail.task?.resource !== 'bootstrap' && ['SUCCEEDED', 'CANCELLED'].includes(detail.task?.status)) {
      resourceHideTimer = setTimeout(() => renderResource(null), detail.task.status === 'SUCCEEDED' ? 260 : 80);
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    const tasks = window.EarthusTasks;
    if (!tasks) throw new Error('EARTHUS_TASK_RUNTIME_MISSING');
    tasks.subscribe(onTask);

    $('bootLoadingRetry')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('earthus:v2-retry', { detail: { resource: 'bootstrap' } }));
    });
    $('resourceLoadingCancel')?.addEventListener('click', () => {
      const active = tasks.snapshot().filter(t => t.status === 'RUNNING' && t.resource !== 'bootstrap');
      const task = active[active.length - 1];
      if (task) tasks.cancel(task.id, 'user-cancelled');
    });
    $('resourceLoadingRetry')?.addEventListener('click', () => {
      if (!lastFailed) return;
      document.dispatchEvent(new CustomEvent('earthus:v2-retry', { detail: { resource: lastFailed.resource } }));
    });
  }

  window.EarthusLoadingUI = Object.freeze({ install });
})();

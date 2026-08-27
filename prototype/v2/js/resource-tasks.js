/* EARTHUS 2.0 resource task runtime
 *
 * One task contract for startup, satellite, cloud, typhoon, ocean and terrain work.
 * It intentionally separates measurable progress from indeterminate work: when a
 * provider does not expose byte/work totals, the UI must show a stage rather than
 * inventing a percentage.
 */
(() => {
  'use strict';

  const STATUS = Object.freeze({
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
  });

  const tasks = new Map();
  const activeByResource = new Map();
  const listeners = new Set();
  let serial = 0;

  const nowIso = () => new Date().toISOString();
  const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

  function safeText(value, fallback = '') {
    let text = String(value ?? fallback);
    // Never surface common secret-bearing query/header fragments in telemetry/UI.
    text = text
      .replace(/([?&](?:key|token|api[_-]?key|access[_-]?token|auth|authorization)=)[^&#\s]+/ig, '$1[redacted]')
      .replace(/(bearer\s+)[a-z0-9._~+/=-]+/ig, '$1[redacted]')
      .replace(/((?:api[_-]?key|secret|token|authorization)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]');
    return text.slice(0, 280);
  }

  function publicTask(task) {
    if (!task) return null;
    return Object.freeze({
      id: task.id,
      resource: task.resource,
      label: task.label,
      provider: task.provider,
      stage: task.stage,
      status: task.status,
      progress: task.progress,
      indeterminate: task.indeterminate,
      retryable: task.retryable,
      cancellable: task.cancellable,
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      durationMs: task.durationMs,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
    });
  }

  function snapshot() {
    return [...tasks.values()].map(publicTask);
  }

  function emit(task, eventName = 'update') {
    const detail = Object.freeze({
      event: eventName,
      task: publicTask(task),
      active: [...activeByResource.values()]
        .map(id => publicTask(tasks.get(id)))
        .filter(Boolean),
    });
    listeners.forEach(fn => {
      try { fn(detail); } catch (error) { console.warn('[v2 tasks subscriber]', error); }
    });
    try { document.dispatchEvent(new CustomEvent('earthus:v2-task', { detail })); } catch (_) { }
  }

  function begin(resource, options = {}) {
    if (!resource) throw new Error('TASK_RESOURCE_REQUIRED');
    const resourceKey = String(resource);
    const replace = options.replace !== false;
    const previousId = activeByResource.get(resourceKey);
    if (replace && previousId) cancel(previousId, 'replaced');

    const controller = new AbortController();
    const id = options.id || `${resourceKey}:${Date.now().toString(36)}:${++serial}`;
    const started = performance.now();
    const progress = options.progress == null ? null : clamp(options.progress);
    const task = {
      id,
      resource: resourceKey,
      label: safeText(options.label || resourceKey),
      provider: safeText(options.provider || ''),
      stage: safeText(options.stage || 'request'),
      status: STATUS.RUNNING,
      progress,
      indeterminate: options.indeterminate ?? progress == null,
      retryable: options.retryable !== false,
      cancellable: options.cancellable !== false,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
      durationMs: null,
      errorCode: null,
      errorMessage: null,
      controller,
      _started: started,
    };
    tasks.set(id, task);
    activeByResource.set(resourceKey, id);
    trimHistory();
    emit(task, 'begin');
    return handle(task);
  }

  function handle(task) {
    return Object.freeze({
      id: task.id,
      resource: task.resource,
      signal: task.controller.signal,
      update: patch => update(task.id, patch),
      complete: patch => complete(task.id, patch),
      fail: (error, patch) => fail(task.id, error, patch),
      cancel: reason => cancel(task.id, reason),
      snapshot: () => publicTask(tasks.get(task.id)),
    });
  }

  function update(id, patch = {}) {
    const task = tasks.get(id);
    if (!task || task.status !== STATUS.RUNNING) return publicTask(task);
    if (patch.label != null) task.label = safeText(patch.label, task.label);
    if (patch.provider != null) task.provider = safeText(patch.provider, task.provider);
    if (patch.stage != null) task.stage = safeText(patch.stage, task.stage);
    if (patch.retryable != null) task.retryable = !!patch.retryable;
    if (patch.cancellable != null) task.cancellable = !!patch.cancellable;
    if (patch.progress != null) {
      const next = clamp(patch.progress);
      // Progress is monotonic within one task. A fresh retry gets a fresh task.
      task.progress = task.progress == null ? next : Math.max(task.progress, next);
      task.indeterminate = false;
    } else if (patch.indeterminate != null) {
      task.indeterminate = !!patch.indeterminate;
      if (task.indeterminate) task.progress = null;
    }
    task.updatedAt = nowIso();
    emit(task, 'update');
    return publicTask(task);
  }

  function finish(task, status, patch = {}) {
    if (!task || task.status !== STATUS.RUNNING) return publicTask(task);
    task.status = status;
    task.updatedAt = nowIso();
    task.completedAt = task.updatedAt;
    task.durationMs = Math.max(0, Math.round(performance.now() - task._started));
    if (status === STATUS.SUCCEEDED) {
      task.progress = 100;
      task.indeterminate = false;
      task.stage = safeText(patch.stage || 'ready');
    } else if (patch.stage) task.stage = safeText(patch.stage);
    if (activeByResource.get(task.resource) === task.id) activeByResource.delete(task.resource);
    emit(task, status.toLowerCase());
    return publicTask(task);
  }

  function complete(id, patch = {}) {
    return finish(tasks.get(id), STATUS.SUCCEEDED, patch);
  }

  function fail(id, error, patch = {}) {
    const task = tasks.get(id);
    if (!task || task.status !== STATUS.RUNNING) return publicTask(task);
    const rawName = error?.name || patch.code || 'RESOURCE_ERROR';
    task.errorCode = safeText(rawName, 'RESOURCE_ERROR').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 64);
    task.errorMessage = safeText(error?.message || patch.message || 'Resource load failed');
    task.retryable = patch.retryable ?? task.retryable;
    return finish(task, STATUS.FAILED, { stage: patch.stage || 'failed' });
  }

  function cancel(id, reason = 'cancelled') {
    const task = tasks.get(id);
    if (!task || task.status !== STATUS.RUNNING) return publicTask(task);
    try { task.controller.abort(new DOMException(safeText(reason), 'AbortError')); }
    catch (_) { try { task.controller.abort(); } catch (_) { } }
    task.errorCode = 'ABORTED';
    task.errorMessage = safeText(reason, 'cancelled');
    return finish(task, STATUS.CANCELLED, { stage: 'cancelled' });
  }

  async function run(resource, options, worker) {
    if (typeof options === 'function') { worker = options; options = {}; }
    options ||= {};
    if (typeof worker !== 'function') throw new Error('TASK_WORKER_REQUIRED');
    const task = begin(resource, options);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 0;
    let timeout = null;
    if (timeoutMs) timeout = setTimeout(() => task.cancel('timeout'), timeoutMs);
    try {
      const result = await worker(task);
      const current = tasks.get(task.id);
      if (current?.status === STATUS.CANCELLED) {
        const error = new DOMException(current.errorMessage || 'Aborted', 'AbortError');
        throw error;
      }
      task.complete();
      return result;
    } catch (error) {
      const current = tasks.get(task.id);
      if (current?.status === STATUS.RUNNING) {
        if (error?.name === 'AbortError') task.cancel(error.message || 'aborted');
        else task.fail(error);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function subscribe(fn, { immediate = true } = {}) {
    if (typeof fn !== 'function') throw new Error('TASK_SUBSCRIBER_REQUIRED');
    listeners.add(fn);
    if (immediate) {
      fn(Object.freeze({ event: 'snapshot', task: null,
        active: [...activeByResource.values()].map(id => publicTask(tasks.get(id))).filter(Boolean) }));
    }
    return () => listeners.delete(fn);
  }

  function get(id) { return publicTask(tasks.get(id)); }
  function active(resource) {
    const id = activeByResource.get(String(resource));
    return id ? publicTask(tasks.get(id)) : null;
  }

  function trimHistory() {
    if (tasks.size <= 80) return;
    const removable = [...tasks.values()]
      .filter(task => task.status !== STATUS.RUNNING)
      .sort((a, b) => a._started - b._started);
    while (tasks.size > 60 && removable.length) tasks.delete(removable.shift().id);
  }

  window.EarthusTasks = Object.freeze({
    STATUS,
    begin,
    update,
    complete,
    fail,
    cancel,
    run,
    subscribe,
    snapshot,
    get,
    active,
  });

  /* The v2 shell is intentionally a classic-script bootstrap. Provider bridges are
     ES modules, so start them here after the shared task contract exists. This also
     fixes the earlier state where provider-runtime.js existed but was never loaded
     by prototype/v2/index.html. */
  if (!window.__earthusV2ProviderModulesBootstrapped) {
    window.__earthusV2ProviderModulesBootstrapped = true;
    queueMicrotask(() => {
      Promise.allSettled([
        import('./provider-runtime.js'),
        import('./route-intelligence.js'),
      ]).then(results => {
        results.forEach(result => {
          if (result.status === 'rejected') console.error('[v2 runtime module]', result.reason);
        });
      });
    });
  }
})();

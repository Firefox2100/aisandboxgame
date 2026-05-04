// ============================================
// PWA Update Service - Service Worker 更新管理
// ============================================

(function () {
  const VISIBLE_POLL_INTERVAL_MS = 5 * 60 * 1000;

  let registration = null;
  let isInitialized = false;
  let pollTimerId = null;
  let hasReloaded = false;
  let lastNotifiedWaitingWorker = null;

  function dispatchUpdateEvent(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function clearPollTimer() {
    if (pollTimerId !== null) {
      clearInterval(pollTimerId);
      pollTimerId = null;
    }
  }

  function notifyUpdateAvailable(source = 'unknown') {
    const waitingWorker = registration?.waiting;
    if (!waitingWorker) return false;
    if (lastNotifiedWaitingWorker === waitingWorker) return true;

    lastNotifiedWaitingWorker = waitingWorker;
    dispatchUpdateEvent('pwa:update-available', {
      source,
      scriptURL: waitingWorker.scriptURL || null,
    });
    return true;
  }

  function bindInstallingWorker(worker, source = 'updatefound') {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyUpdateAvailable(source);
      }
    });
  }

  async function checkForUpdate() {
    if (!registration) return false;
    await registration.update();
    return notifyUpdateAvailable('check');
  }

  function applyUpdate() {
    const waitingWorker = registration?.waiting;
    if (!waitingWorker) return false;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  function startVisiblePoll() {
    clearPollTimer();
    pollTimerId = setInterval(() => {
      checkForUpdate().catch(error => {
        console.warn('[PWAUpdateService] Periodic update check failed:', error);
        dispatchUpdateEvent('pwa:update-error', {
          stage: 'periodic-check',
          error,
        });
      });
    }, VISIBLE_POLL_INTERVAL_MS);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      checkForUpdate().catch(error => {
        console.warn('[PWAUpdateService] Foreground update check failed:', error);
        dispatchUpdateEvent('pwa:update-error', {
          stage: 'visibility-check',
          error,
        });
      });
      startVisiblePoll();
      return;
    }
    clearPollTimer();
  }

  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    if (!('serviceWorker' in navigator)) {
      console.warn('[PWAUpdateService] Service Worker is not supported in this browser');
      return;
    }

    try {
      registration = await navigator.serviceWorker.register(
        new URL('sw.js', window.location.href),
        { updateViaCache: 'none' }
      );
    } catch (error) {
      dispatchUpdateEvent('pwa:update-error', {
        stage: 'register',
        error,
      });
      throw error;
    }

    registration.addEventListener('updatefound', () => {
      bindInstallingWorker(registration.installing, 'updatefound');
    });
    bindInstallingWorker(registration.installing, 'init-installing');

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloaded) return;
      hasReloaded = true;
      dispatchUpdateEvent('pwa:update-applied');
      window.location.reload();
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    try {
      await checkForUpdate();
    } catch (error) {
      console.warn('[PWAUpdateService] Initial update check failed:', error);
      dispatchUpdateEvent('pwa:update-error', {
        stage: 'initial-check',
        error,
      });
    }

    if (document.visibilityState === 'visible') {
      startVisiblePoll();
    }
  }

  window.pwaUpdateService = {
    init,
    checkForUpdate,
    applyUpdate,
    getVisiblePollInterval() {
      return VISIBLE_POLL_INTERVAL_MS;
    },
  };
})();

// ============================================
// Changelog Service - 拉取 / 缓存更新日志数据
// ============================================

(function () {
  'use strict';

  let cached = null;
  let inflight = null;

  async function loadChangelog({ fresh = false, timeoutMs = 0 } = {}) {
    if (cached && !fresh) return cached;
    if (inflight && !fresh) return inflight;

    const url = fresh ? `prompts/changelog.json?_=${Date.now()}` : 'prompts/changelog.json';
    const fetchOpts = fresh ? { cache: 'no-store' } : { cache: 'default' };

    const fetchPromise = fetch(url, fetchOpts)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => {
        cached = data;
        inflight = null;
        return data;
      })
      .catch(err => {
        inflight = null;
        throw err;
      });

    if (!fresh) inflight = fetchPromise;

    if (timeoutMs > 0) {
      return Promise.race([
        fetchPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('changelog fetch timeout')), timeoutMs)
        ),
      ]);
    }
    return fetchPromise;
  }

  function getEntriesForLocale(data, locale) {
    const key = locale === 'en' ? 'en' : 'zh-CN';
    return (data && data[key]) || (data && data['zh-CN']) || [];
  }

  window.changelogService = { loadChangelog, getEntriesForLocale };
})();

// js/ui/settingsApiTabMode.js
// Settings → API tab 的模式感知层。
// 在线模式（accountStore.isSignedIn）下：
//   - 顶部显示 banner 提示
//   - 所有子控件 disabled（视觉灰化但保留）
//   - banner 内含跳转账户中心的链接
// 离线模式下 banner 移除、控件解禁，恢复现有渲染。

(function () {
  'use strict';

  const TAB_ID = 'tab-api';
  const BANNER_ID = 'settings-online-banner';
  const TAB_CLASS_ONLINE = 'tab-api-is-online-managed';

  function isEnglish() {
    return window.i18nService?.getResolvedLanguage?.() === 'en';
  }

  function getCopy() {
    const en = isEnglish();
    return {
      bannerText: en
        ? 'Online mode: API is provided by the service. Pick a model in '
        : '在线模式：API 由站点提供。模型选择请前往',
      bannerLinkLabel: en ? 'Account Center' : '账户中心',
    };
  }

  function buildBanner() {
    const copy = getCopy();
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'settings-online-banner';
    banner.innerHTML = `
      <span class="material-symbols-outlined settings-online-banner-icon">cloud_done</span>
      <span class="settings-online-banner-text">
        ${copy.bannerText}<a href="#" class="settings-online-banner-link" data-action="goto-account">${copy.bannerLinkLabel}</a>${en ? '.' : '。'}
      </span>
    `;
    banner.querySelector('[data-action="goto-account"]').addEventListener('click', e => {
      e.preventDefault();
      window.accountCenterUI?.open?.();
    });
    return banner;
  }

  function setControlsDisabled(tab, disabled) {
    tab.querySelectorAll('input, select, textarea, button').forEach(el => {
      // banner 内的 link 不算 button，跳过链接
      if (el.closest('#' + BANNER_ID)) return;
      if (disabled) {
        // 记录 prior state，第二次启用时不要乱开
        if (!el.hasAttribute('data-mode-prior-disabled')) {
          el.setAttribute('data-mode-prior-disabled', el.disabled ? '1' : '0');
        }
        el.disabled = true;
      } else {
        const prior = el.getAttribute('data-mode-prior-disabled');
        if (prior === '0') el.disabled = false;
        // 如果 prior === '1'，原本就是 disabled，保持
        el.removeAttribute('data-mode-prior-disabled');
      }
    });
  }

  function applyMode() {
    const tab = document.getElementById(TAB_ID);
    if (!tab) return;
    const signedIn = window.accountStore?.isSignedIn?.() === true;

    tab.classList.toggle(TAB_CLASS_ONLINE, signedIn);

    let banner = document.getElementById(BANNER_ID);
    if (signedIn) {
      if (!banner) {
        banner = buildBanner();
        tab.insertBefore(banner, tab.firstChild);
      }
    } else {
      if (banner) banner.remove();
    }

    setControlsDisabled(tab, signedIn);
  }

  function init() {
    if (!document.getElementById(TAB_ID)) {
      console.log('[SettingsApiTabMode] #tab-api not found');
      return;
    }
    applyMode();

    if (window.eventBus) {
      window.eventBus.on('account:changed', applyMode);
    }
    window.addEventListener('ui-language-changed', () => {
      const banner = document.getElementById(BANNER_ID);
      if (banner) {
        const tab = document.getElementById(TAB_ID);
        banner.remove();
        const newBanner = buildBanner();
        tab.insertBefore(newBanner, tab.firstChild);
      }
    });

    console.log('[SettingsApiTabMode] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

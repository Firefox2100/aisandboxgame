// js/ui/avatarDropdownUI.js
// 头像 dropdown：账户中心 + 系统设置 + Debug + 退出
// 订阅 accountStore（account:changed），guest/signed_in 切换内容
// 系统设置/Debug 通过对隐藏按钮 .click() 触发既有 handler

(function () {
  'use strict';

  const BTN_ID = 'avatar-btn';
  const DROPDOWN_ID = 'avatar-dropdown';

  function isEnglish() {
    return window.i18nService?.getResolvedLanguage?.() === 'en';
  }

  function getCopy() {
    const en = isEnglish();
    return {
      accountCenter: en ? 'Account Center' : '账户中心',
      notSignedIn: en ? 'Not signed in' : '未登录',
      systemSettings: en ? 'Settings' : '系统设置',
      debug: 'Debug',
      signOut: en ? 'Sign Out' : '退出登录',
      signOutSuccess: en ? 'Signed out' : '已退出登录',
      signedInLabel: en ? 'Signed In' : '已登录',
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getState() {
    return window.accountStore?.getSnapshot?.() || { authStatus: 'guest' };
  }

  function isGuest() {
    return window.accountStore?.isGuest?.() !== false;
  }

  // ────── 渲染 ──────
  function render() {
    const dropdown = document.getElementById(DROPDOWN_ID);
    if (!dropdown) return;
    const copy = getCopy();
    const state = getState();
    const guest = isGuest();

    const headerHtml = guest
      ? `
        <button class="avatar-dropdown-header avatar-dropdown-header--guest" data-action="open-account" role="menuitem" type="button">
          <div class="avatar-dropdown-avatar">
            <span class="material-symbols-outlined">person</span>
          </div>
          <div class="avatar-dropdown-id">
            <div class="avatar-dropdown-name">${escapeHtml(copy.accountCenter)}</div>
            <div class="avatar-dropdown-sub">${escapeHtml(copy.notSignedIn)}</div>
          </div>
        </button>`
      : `
        <button class="avatar-dropdown-header" data-action="open-account" role="menuitem" type="button">
          <div class="avatar-dropdown-avatar avatar-dropdown-avatar--signed-in">
            ${state.avatarUrl
              ? `<img src="${escapeHtml(state.avatarUrl)}" alt="">`
              : '<span class="material-symbols-outlined">person</span>'
            }
          </div>
          <div class="avatar-dropdown-id">
            <div class="avatar-dropdown-name">${escapeHtml(state.displayName || 'User')}</div>
            <div class="avatar-dropdown-sub">${escapeHtml(state.email || copy.signedInLabel)}</div>
          </div>
        </button>`;

    const settingsItem = `
      <button class="avatar-dropdown-item" data-action="open-settings" role="menuitem">
        <span class="material-symbols-outlined avatar-dropdown-icon">settings</span>
        <span>${escapeHtml(copy.systemSettings)}</span>
      </button>`;

    const debugItem = `
      <button class="avatar-dropdown-item" data-action="open-debug" role="menuitem">
        <span class="material-symbols-outlined avatar-dropdown-icon">bug_report</span>
        <span>${escapeHtml(copy.debug)}</span>
      </button>`;

    const signOutItem = guest
      ? ''
      : `
        <hr class="avatar-dropdown-divider" />
        <button class="avatar-dropdown-item avatar-dropdown-item--danger" data-action="sign-out" role="menuitem">
          <span class="material-symbols-outlined avatar-dropdown-icon">logout</span>
          <span>${escapeHtml(copy.signOut)}</span>
        </button>`;

    dropdown.innerHTML = `
      ${headerHtml}
      <hr class="avatar-dropdown-divider" />
      ${settingsItem}
      ${debugItem}
      ${signOutItem}
    `;

    // 绑定 dropdown 内部按钮
    dropdown.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        handleAction(action);
      });
    });
  }

  // ────── 操作分发 ──────
  function handleAction(action) {
    closeDropdown();
    switch (action) {
      case 'open-account':
        window.accountCenterUI?.open?.();
        break;
      case 'open-settings':
        // 通过既有按钮 click 触发 game.js 中已绑定的 openSettings handler
        document.getElementById('settings-btn')?.click();
        break;
      case 'open-debug':
        document.getElementById('debug-btn')?.click();
        break;
      case 'sign-out':
        // 真实退出：调用 boxhill /api/user/logout 并清本地缓存
        Promise.resolve(window.accountStore?.signOut?.())
          .catch(() => { /* 即使 boxhill 报错，本地状态已被 reset */ })
          .finally(() => showToast(getCopy().signOutSuccess));
        break;
    }
  }

  // ────── Toast（简易，未来可换 toastUI） ──────
  function showToast(message) {
    const existing = document.getElementById('avatar-dropdown-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'avatar-dropdown-toast';
    toast.className = 'avatar-dropdown-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 240);
    }, 1800);
  }

  // ────── 开关 ──────
  function isOpen() {
    const dropdown = document.getElementById(DROPDOWN_ID);
    return dropdown?.classList.contains('is-open') === true;
  }

  function openDropdown() {
    const dropdown = document.getElementById(DROPDOWN_ID);
    const btn = document.getElementById(BTN_ID);
    if (!dropdown || !btn) return;
    render();
    positionDropdown();
    dropdown.classList.add('is-open');
    dropdown.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    const dropdown = document.getElementById(DROPDOWN_ID);
    const btn = document.getElementById(BTN_ID);
    if (!dropdown) return;
    dropdown.classList.remove('is-open');
    dropdown.setAttribute('aria-hidden', 'true');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown() {
    if (isOpen()) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function positionDropdown() {
    const dropdown = document.getElementById(DROPDOWN_ID);
    const btn = document.getElementById(BTN_ID);
    if (!dropdown || !btn) return;
    const rect = btn.getBoundingClientRect();
    // 锚定在按钮右下角
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
    dropdown.style.left = 'auto';
  }

  // ────── 初始化 ──────
  function init() {
    const btn = document.getElementById(BTN_ID);
    const dropdown = document.getElementById(DROPDOWN_ID);
    if (!btn || !dropdown) {
      console.log('[AvatarDropdownUI] DOM not found');
      return;
    }

    // 把 dropdown 从 header 内部挪到 body 末尾，逃出 header 的 stacking context
    if (dropdown.parentElement && dropdown.parentElement !== document.body) {
      document.body.appendChild(dropdown);
    }

    render();

    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDropdown();
    });

    // 点击外部关闭
    document.addEventListener('click', e => {
      if (!isOpen()) return;
      const target = e.target;
      if (target === btn || btn.contains(target)) return;
      if (target === dropdown || dropdown.contains(target)) return;
      closeDropdown();
    });

    // Esc 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen()) {
        closeDropdown();
      }
    });

    // 窗口尺寸变化重定位
    window.addEventListener('resize', () => {
      if (isOpen()) positionDropdown();
    });
    window.addEventListener('scroll', () => {
      if (isOpen()) positionDropdown();
    });

    // 订阅账户变化
    if (window.eventBus) {
      window.eventBus.on('account:changed', () => {
        render();
      });
    }

    // 语言切换
    window.addEventListener('ui-language-changed', render);

    console.log('[AvatarDropdownUI] Initialized');
  }

  window.avatarDropdownUI = {
    open: openDropdown,
    close: closeDropdown,
    toggle: toggleDropdown,
    render,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

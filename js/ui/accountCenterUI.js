// js/ui/accountCenterUI.js
// 用户中心面板 - 渲染与交互
// 监听 AccountStore 变更，自动更新所有账号相关 UI

(function () {
  'use strict';

  const OVERLAY_ID = 'account-center-overlay';

  // ────── i18n 文案 ──────
  function isEnglish() {
    return window.i18nService?.getResolvedLanguage?.() === 'en';
  }

  function getCopy() {
    const en = isEnglish();
    return {
      title: en ? 'Account Center' : '用户中心',
      close: en ? 'Close' : '关闭',
      profile: en ? 'Profile' : '个人资料',
      cloudSync: en ? 'Cloud Saves' : '云存档',
      entitlements: en ? 'Credits & Subscription' : '额度/订阅',
      apiConsole: en ? 'Model / API Access' : '模型/API 权限',
      guestLabel: en ? 'Guest Mode' : '游客模式',
      signedInLabel: en ? 'Signed In' : '已登录',
      guestProfileDesc: en
        ? 'All data is stored locally. No registration needed. Cloud sync will be available after login.'
        : '当前所有数据保存在本地，无需注册。未来登录后可启用云同步。',
      comingSoon: en ? 'Coming Soon' : '即将推出',
      comingSoonHint: en
        ? 'This feature will be available in a future update.'
        : '此功能将在后续版本中开放。',
      profileLockTitle: en ? 'Coming Soon' : '即将推出',
      profileLockHint: en
        ? 'User login will open in a later release. Stay tuned.'
        : '用户登录功能将于后续开通，敬请期待。',
      syncLocal: en ? 'Local Only' : '仅本地',
      syncReady: en ? 'Sync available after login' : '登录后可同步',
      syncDone: en ? 'Synced' : '已同步',
      syncConflict: en ? 'Conflict' : '冲突',
      conflictLocalTime: en ? 'Local:' : '本地：',
      conflictCloudTime: en ? 'Cloud:' : '云端：',
      useCloud: en ? 'Use Cloud' : '使用云端版本',
      useLocal: en ? 'Use Local' : '使用本地版本',
      manage: en ? 'Manage →' : '管理 →',
      settingsAccountLabel: en ? 'Account' : '账号',
      // 登录表单
      loginEmailPlaceholder: en ? 'Email' : '邮箱',
      loginPasswordPlaceholder: en ? 'Password' : '密码',
      loginSubmit: en ? 'Sign in' : '登录',
      registerSubmit: en ? 'Create account' : '注册',
      toggleToRegister: en ? "Don't have an account? Sign up" : '没有账号？注册',
      toggleToLogin: en ? 'Already a member? Sign in' : '已有账号？登录',
      orDivider: en ? 'OR' : '或',
      oauthWeChat: en ? 'WeChat' : '微信登录',
      oauthGoogle: en ? 'Google' : 'Google 登录',
      oauthApple: en ? 'Apple' : 'Apple 登录',
      continueGuest: en ? 'Continue as guest' : '继续以游客模式使用',
      // 充值
      currentBalance: en ? 'Current Balance' : '当前余额',
      currentTier: en ? 'Plan' : '套餐',
      rechargeBtn: en ? 'Top up' : '充值',
      upgradeBtn: en ? 'Upgrade plan' : '升级套餐',
      upgradeComing: en ? 'Plan upgrade coming soon' : '套餐升级即将开放',
      rechargePickAmount: en ? 'Pick an amount' : '选择金额',
      rechargePickMethod: en ? 'Choose payment method' : '选择支付方式',
      rechargeConfirmPaid: en ? "I've completed the payment" : '我已完成付款',
      rechargeNext: en ? 'Next' : '下一步',
      rechargeBack: en ? 'Back' : '上一步',
      rechargeCancel: en ? 'Cancel' : '取消',
      rechargeSuccess: en ? 'Top-up successful' : '充值成功',
      rechargeProcessing: en ? 'Processing...' : '正在处理...',
      payWeChat: en ? 'WeChat Pay' : '微信支付',
      payAlipay: en ? 'Alipay' : '支付宝',
      payUnion: en ? 'UnionPay' : '银联',
      packageBasic: en ? 'Basic' : '基础包',
      packageStandard: en ? 'Standard' : '标准包',
      packageValue: en ? 'Value' : '实惠包',
      packageDeluxe: en ? 'Deluxe' : '豪华包',
      // 模型
      currentModel: en ? 'Current Model' : '当前模型',
      modelNotSelected: en ? 'Not selected' : '未选择',
      modelRecommended: en ? 'Recommended' : '推荐',
      availableModels: en ? 'Available Models' : '可选模型',
    };
  }

  // 充值套餐
  function getPackages() {
    const copy = getCopy();
    return [
      { id: 'p1', amount: 28, label: copy.packageBasic, credits: 28 },
      { id: 'p2', amount: 68, label: copy.packageStandard, credits: 70 },
      { id: 'p3', amount: 128, label: copy.packageValue, credits: 138, popular: true },
      { id: 'p4', amount: 328, label: copy.packageDeluxe, credits: 360 },
    ];
  }

  function getPaymentMethods() {
    const copy = getCopy();
    return [
      { id: 'wechat', label: copy.payWeChat, icon: 'wechat' },
      { id: 'alipay', label: copy.payAlipay, icon: 'paid' },
      { id: 'union', label: copy.payUnion, icon: 'credit_card' },
    ];
  }

  // 模型列表（mock）
  function getMockModels() {
    return [
      { id: 'opus-4-7', label: 'Claude Opus 4.7', recommended: true },
      { id: 'sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'haiku-4-5', label: 'Claude Haiku 4.5' },
    ];
  }

  // ────── 登录表单状态（保存在闭包，跨重渲染保留 mode） ──────
  let loginFormMode = 'login'; // 'login' | 'register'

  // ────── 渲染用户中心 ──────
  function renderAccountCenter(overlay) {
    if (!overlay) return;
    const store = window.accountStore;
    if (!store) return;

    const state = store.getSnapshot();
    const copy = getCopy();
    const isGuest = state.authStatus === 'guest';

    const profileContent = isGuest
      ? renderProfileLocked(copy)
      : `
        <div class="account-profile-row">
          <div class="account-avatar account-avatar--lg ${state.tier !== 'free' ? 'account-avatar--premium' : 'account-avatar--signed-in'}">
            ${state.avatarUrl ? `<img src="${escapeHtml(state.avatarUrl)}" alt="">` : '<span class="material-symbols-outlined">person</span>'}
            <span class="account-status-dot"></span>
          </div>
          <div class="account-profile-info">
            <div class="account-profile-name">${escapeHtml(state.displayName || 'User')}</div>
            <div class="account-profile-email">${escapeHtml(state.email || '')}</div>
          </div>
          ${state.tier !== 'free' ? `<span class="account-badge account-badge--pro">${escapeHtml(state.tier.toUpperCase())}</span>` : ''}
        </div>`;

    const cloudContent = isGuest
      ? `<div class="account-card__body">
          <span class="account-sync-badge account-sync-badge--local">
            <span class="material-symbols-outlined">cloud_off</span>
            <span class="ui-label-cn">${escapeHtml(copy.syncLocal)}</span><span class="ui-label-en">${escapeHtml(copy.syncLocal)}</span>
          </span>
        </div>`
      : state.cloudSyncEnabled
        ? `<div class="account-card__body">
            <span class="account-sync-badge account-sync-badge--synced">
              <span class="material-symbols-outlined">cloud_done</span>
              ${escapeHtml(copy.syncDone)}
            </span>
            ${state.lastSyncAt ? `<span class="account-sync-time">${formatSyncTime(state.lastSyncAt)}</span>` : ''}
          </div>`
        : `<div class="account-card__body">
            <span class="account-sync-badge account-sync-badge--ready">
              <span class="material-symbols-outlined">cloud_queue</span>
              ${escapeHtml(copy.syncReady)}
            </span>
          </div>`;

    const entitlementsContent = isGuest
      ? renderLockedCard(copy)
      : renderEntitlementsUnlocked(state, copy);

    const apiContent = isGuest
      ? renderLockedCard(copy)
      : renderApiUnlocked(state, copy);

    overlay.innerHTML = `
      <div class="account-center-panel">
        <div class="account-center-header">
          <h2 class="account-center-title">
            <span class="ui-label-cn">${escapeHtml(getCopy().title)}</span><span class="ui-label-en">${escapeHtml(getCopy().title)}</span>
          </h2>
          <button class="account-center-close btn-secondary btn-icon" id="account-center-close-btn" aria-label="${escapeHtml(copy.close)}">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- 个人资料 -->
        <div class="account-card ${isGuest ? 'account-card--locked' : ''}" data-account-section="profile">
          <div class="account-card__header">
            <span class="material-symbols-outlined account-card__icon">person</span>
            <span class="account-card__title">
              <span class="ui-label-cn">${escapeHtml(copy.profile)}</span><span class="ui-label-en">${escapeHtml(copy.profile)}</span>
            </span>
          </div>
          ${profileContent}
        </div>

        <!-- 云存档 -->
        <div class="account-card" data-account-section="cloud">
          <div class="account-card__header">
            <span class="material-symbols-outlined account-card__icon">cloud_sync</span>
            <span class="account-card__title">
              <span class="ui-label-cn">${escapeHtml(copy.cloudSync)}</span><span class="ui-label-en">${escapeHtml(copy.cloudSync)}</span>
            </span>
          </div>
          ${cloudContent}
        </div>

        <!-- 额度/订阅 -->
        <div class="account-card ${isGuest ? 'account-card--locked' : ''}" data-account-section="entitlements">
          <div class="account-card__header">
            <span class="material-symbols-outlined account-card__icon">loyalty</span>
            <span class="account-card__title">
              <span class="ui-label-cn">${escapeHtml(copy.entitlements)}</span><span class="ui-label-en">${escapeHtml(copy.entitlements)}</span>
            </span>
          </div>
          ${entitlementsContent}
        </div>

        <!-- 模型/API 权限 -->
        <div class="account-card ${isGuest ? 'account-card--locked' : ''}" data-account-section="api">
          <div class="account-card__header">
            <span class="material-symbols-outlined account-card__icon">api</span>
            <span class="account-card__title">
              <span class="ui-label-cn">${escapeHtml(copy.apiConsole)}</span><span class="ui-label-en">${escapeHtml(copy.apiConsole)}</span>
            </span>
          </div>
          ${apiContent}
        </div>
      </div>
    `;

    bindAccountCenterEvents(overlay, isGuest, state);
  }

  // ────── 子渲染：登录表单 ──────
  function renderLoginForm() {
    const copy = getCopy();
    const submitLabel = loginFormMode === 'login' ? copy.loginSubmit : copy.registerSubmit;
    const toggleLabel = loginFormMode === 'login' ? copy.toggleToRegister : copy.toggleToLogin;
    return `
      <form class="account-login-form" data-action="login-form">
        <input
          type="email"
          name="email"
          required
          class="account-login-input"
          placeholder="${escapeHtml(copy.loginEmailPlaceholder)}"
          autocomplete="email"
        />
        <input
          type="password"
          name="password"
          required
          class="account-login-input"
          placeholder="${escapeHtml(copy.loginPasswordPlaceholder)}"
          autocomplete="${loginFormMode === 'login' ? 'current-password' : 'new-password'}"
        />
        <button type="submit" class="btn-primary account-login-submit">${escapeHtml(submitLabel)}</button>
        <button type="button" class="account-login-toggle" data-action="login-toggle-mode">${escapeHtml(toggleLabel)}</button>
        <div class="account-login-divider"><span>${escapeHtml(copy.orDivider)}</span></div>
        <div class="account-login-oauth">
          <button type="button" class="account-login-oauth-btn" data-oauth="wechat">
            <span class="account-login-oauth-emoji" aria-hidden="true">💬</span>
            <span>${escapeHtml(copy.oauthWeChat)}</span>
          </button>
          <button type="button" class="account-login-oauth-btn" data-oauth="google">
            <span class="account-login-oauth-emoji" aria-hidden="true">🌐</span>
            <span>${escapeHtml(copy.oauthGoogle)}</span>
          </button>
          <button type="button" class="account-login-oauth-btn" data-oauth="apple">
            <span class="account-login-oauth-emoji" aria-hidden="true">🍎</span>
            <span>${escapeHtml(copy.oauthApple)}</span>
          </button>
        </div>
        <button type="button" class="account-login-guest-link" data-action="login-continue-guest">${escapeHtml(copy.continueGuest)}</button>
      </form>`;
  }

  // ────── 子渲染：Profile 卡 guest 分支锁定状态 ──────
  function renderProfileLocked(copy) {
    return `
      <div class="account-locked-overlay">
        <span class="material-symbols-outlined account-locked-icon">lock</span>
        <span class="account-locked-label">${escapeHtml(copy.profileLockTitle)}</span>
        <span class="account-locked-hint">${escapeHtml(copy.profileLockHint)}</span>
      </div>`;
  }

  // ────── 子渲染：locked 卡片 overlay（保留原始锁定外观） ──────
  function renderLockedCard(copy) {
    return `
      <div class="account-locked-overlay">
        <span class="material-symbols-outlined account-locked-icon">lock</span>
        <span class="account-locked-label">
          <span class="ui-label-cn">${escapeHtml(copy.comingSoon)}</span><span class="ui-label-en">${escapeHtml(copy.comingSoon)}</span>
        </span>
        <span class="account-locked-hint">
          <span class="ui-label-cn">${escapeHtml(copy.comingSoonHint)}</span><span class="ui-label-en">${escapeHtml(copy.comingSoonHint)}</span>
        </span>
      </div>`;
  }

  // ────── 子渲染：解锁后的 Entitlements 卡 ──────
  function renderEntitlementsUnlocked(state, copy) {
    return `
      <div class="account-card__body">
        <div class="account-entitlement-row">
          <div class="account-entitlement-label">${escapeHtml(copy.currentBalance)}</div>
          <div class="account-entitlement-value">¥${escapeHtml(String(state.creditBalance ?? 0))}</div>
        </div>
        <div class="account-entitlement-row">
          <div class="account-entitlement-label">${escapeHtml(copy.currentTier)}</div>
          <div class="account-entitlement-value">${escapeHtml(state.tier ? state.tier.toUpperCase() : 'FREE')}</div>
        </div>
        <div class="account-entitlement-actions">
          <button type="button" class="btn-primary" data-action="open-recharge">
            <span class="material-symbols-outlined">add_card</span>
            ${escapeHtml(copy.rechargeBtn)}
          </button>
          <button type="button" class="btn-secondary" data-action="upgrade-plan">${escapeHtml(copy.upgradeBtn)}</button>
        </div>
      </div>`;
  }

  // ────── 子渲染：解锁后的 Model/API 卡 ──────
  function renderApiUnlocked(state, copy) {
    const models = getMockModels();
    const currentId = state.selectedModelId;
    const currentLabel = (() => {
      const found = models.find(m => m.id === currentId);
      return found ? found.label : copy.modelNotSelected;
    })();

    return `
      <div class="account-card__body">
        <div class="account-entitlement-row">
          <div class="account-entitlement-label">${escapeHtml(copy.currentModel)}</div>
          <div class="account-entitlement-value">${escapeHtml(currentLabel)}</div>
        </div>
        <div class="account-model-section-title">${escapeHtml(copy.availableModels)}</div>
        <div class="account-model-list" role="radiogroup">
          ${models.map(m => `
            <label class="account-model-row ${currentId === m.id ? 'is-selected' : ''}">
              <input
                type="radio"
                name="account-model"
                value="${escapeHtml(m.id)}"
                ${currentId === m.id ? 'checked' : ''}
                class="account-model-radio"
              />
              <span class="account-model-label">${escapeHtml(m.label)}</span>
              ${m.recommended ? `<span class="account-model-badge">${escapeHtml(copy.modelRecommended)}</span>` : ''}
            </label>
          `).join('')}
        </div>
      </div>`;
  }

  // ────── 事件绑定 ──────
  function bindAccountCenterEvents(overlay, isGuest, state) {
    if (isGuest) {
      // 登录表单提交
      const form = overlay.querySelector('[data-action="login-form"]');
      if (form) {
        form.addEventListener('submit', e => {
          e.preventDefault();
          const email = form.querySelector('input[name="email"]').value.trim();
          if (!email) return;
          window.accountStore?.mockSignIn?.({ email });
          // accountStore 触发 account:changed → onAccountChanged → re-render
        });
      }
      // 切换登录/注册模式
      const toggleBtn = overlay.querySelector('[data-action="login-toggle-mode"]');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          loginFormMode = loginFormMode === 'login' ? 'register' : 'login';
          renderAccountCenter(overlay);
        });
      }
      // OAuth 按钮（mock）
      overlay.querySelectorAll('[data-oauth]').forEach(btn => {
        btn.addEventListener('click', () => {
          const provider = btn.getAttribute('data-oauth');
          const mockEmail = `mockuser+${provider}@example.com`;
          window.accountStore?.mockSignIn?.({ email: mockEmail, displayName: `${provider}_user` });
        });
      });
      // 继续游客
      const guestLink = overlay.querySelector('[data-action="login-continue-guest"]');
      if (guestLink) {
        guestLink.addEventListener('click', closeAccountCenter);
      }
    } else {
      // 充值
      const rechargeBtn = overlay.querySelector('[data-action="open-recharge"]');
      if (rechargeBtn) {
        rechargeBtn.addEventListener('click', () => openRechargeModal());
      }
      // 升级套餐（占位 toast）
      const upgradeBtn = overlay.querySelector('[data-action="upgrade-plan"]');
      if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => showAccountToast(getCopy().upgradeComing));
      }
      // 模型选择
      overlay.querySelectorAll('input[name="account-model"]').forEach(radio => {
        radio.addEventListener('change', () => {
          if (radio.checked) {
            window.accountStore?.update?.({ selectedModelId: radio.value });
          }
        });
      });
    }
  }

  // ────── 充值流程 ──────
  let rechargeStep = 1;
  let rechargeAmount = 0;
  let rechargeMethod = '';

  function openRechargeModal() {
    rechargeStep = 1;
    rechargeAmount = 0;
    rechargeMethod = '';
    renderRechargeModal();
  }

  function closeRechargeModal() {
    const modal = document.getElementById('account-recharge-backdrop');
    if (modal) modal.remove();
  }

  function renderRechargeModal() {
    const copy = getCopy();
    let modal = document.getElementById('account-recharge-backdrop');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'account-recharge-backdrop';
      modal.className = 'account-recharge-backdrop';
      document.body.appendChild(modal);
    }

    let body = '';
    let actions = '';

    if (rechargeStep === 1) {
      const packs = getPackages();
      body = `
        <h3 class="account-recharge-title">${escapeHtml(copy.rechargePickAmount)}</h3>
        <div class="account-recharge-packs">
          ${packs.map(p => `
            <button class="account-recharge-pack ${rechargeAmount === p.amount ? 'is-selected' : ''}" data-amount="${escapeHtml(String(p.amount))}">
              ${p.popular ? `<span class="account-recharge-pack-badge">★</span>` : ''}
              <div class="account-recharge-pack-amount">¥${escapeHtml(String(p.amount))}</div>
              <div class="account-recharge-pack-credits">${escapeHtml(String(p.credits))} credits</div>
              <div class="account-recharge-pack-label">${escapeHtml(p.label)}</div>
            </button>
          `).join('')}
        </div>`;
      actions = `
        <button type="button" class="btn-secondary" data-action="recharge-cancel">${escapeHtml(copy.rechargeCancel)}</button>
        <button type="button" class="btn-primary" data-action="recharge-next" ${rechargeAmount > 0 ? '' : 'disabled'}>${escapeHtml(copy.rechargeNext)}</button>
      `;
    } else if (rechargeStep === 2) {
      const methods = getPaymentMethods();
      body = `
        <h3 class="account-recharge-title">${escapeHtml(copy.rechargePickMethod)}</h3>
        <p class="account-recharge-summary">¥${escapeHtml(String(rechargeAmount))}</p>
        <div class="account-recharge-methods">
          ${methods.map(m => `
            <label class="account-recharge-method ${rechargeMethod === m.id ? 'is-selected' : ''}">
              <input type="radio" name="recharge-method" value="${escapeHtml(m.id)}" ${rechargeMethod === m.id ? 'checked' : ''} />
              <span class="material-symbols-outlined">${escapeHtml(m.icon)}</span>
              <span>${escapeHtml(m.label)}</span>
            </label>
          `).join('')}
        </div>
        <div class="account-recharge-qr">
          <span class="material-symbols-outlined">qr_code_2</span>
        </div>`;
      actions = `
        <button type="button" class="btn-secondary" data-action="recharge-back">${escapeHtml(copy.rechargeBack)}</button>
        <button type="button" class="btn-primary" data-action="recharge-confirm" ${rechargeMethod ? '' : 'disabled'}>${escapeHtml(copy.rechargeConfirmPaid)}</button>
      `;
    }

    modal.innerHTML = `
      <div class="account-recharge themed-modal" role="dialog" aria-modal="true">
        ${body}
        <div class="account-recharge-actions">${actions}</div>
      </div>
    `;
    modal.classList.add('is-open');

    modal.querySelector('[data-action="recharge-cancel"]')?.addEventListener('click', closeRechargeModal);
    modal.querySelector('[data-action="recharge-back"]')?.addEventListener('click', () => {
      rechargeStep = 1;
      renderRechargeModal();
    });
    modal.querySelector('[data-action="recharge-next"]')?.addEventListener('click', () => {
      if (rechargeAmount <= 0) return;
      rechargeStep = 2;
      renderRechargeModal();
    });
    modal.querySelector('[data-action="recharge-confirm"]')?.addEventListener('click', () => {
      if (!rechargeMethod) return;
      // 1.5s loading 模拟
      const confirmBtn = modal.querySelector('[data-action="recharge-confirm"]');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = getCopy().rechargeProcessing;
      }
      setTimeout(() => {
        window.accountStore?.mockRecharge?.(rechargeAmount);
        closeRechargeModal();
        showAccountToast(getCopy().rechargeSuccess);
      }, 1500);
    });

    modal.querySelectorAll('[data-amount]').forEach(packBtn => {
      packBtn.addEventListener('click', () => {
        rechargeAmount = Number(packBtn.getAttribute('data-amount')) || 0;
        renderRechargeModal();
      });
    });

    modal.querySelectorAll('input[name="recharge-method"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          rechargeMethod = radio.value;
          renderRechargeModal();
        }
      });
    });

    // 点击背景关闭
    modal.addEventListener('click', e => {
      if (e.target === modal) closeRechargeModal();
    });
  }

  // ────── 简易 toast ──────
  function showAccountToast(message) {
    const existing = document.getElementById('account-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'account-toast';
    toast.className = 'account-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 240);
    }, 1800);
  }

  // ────── Open / Close ──────
  function openAccountCenter() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    renderAccountCenter(overlay);
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      overlay.querySelector('#account-center-close-btn')?.focus();
    });
  }

  function closeAccountCenter() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function isAccountCenterOpen() {
    const overlay = document.getElementById(OVERLAY_ID);
    return overlay?.classList.contains('is-open') === true;
  }

  // ────── Sync Badge for Save Manager ──────
  function getSyncBadgeHtml() {
    const store = window.accountStore;
    if (!store) return '';
    const copy = getCopy();
    const state = store.getSnapshot();

    if (state.authStatus === 'guest') {
      return `<span class="account-sync-badge account-sync-badge--local">
        <span class="material-symbols-outlined">folder</span>
        <span class="ui-label-cn">仅本地</span><span class="ui-label-en">Local Only</span>
      </span>`;
    }
    if (state.cloudSyncEnabled) {
      return `<span class="account-sync-badge account-sync-badge--synced">
        <span class="material-symbols-outlined">cloud_done</span>
        <span class="ui-label-cn">已同步</span><span class="ui-label-en">Synced</span>
      </span>`;
    }
    return `<span class="account-sync-badge account-sync-badge--ready">
      <span class="material-symbols-outlined">cloud_queue</span>
      <span class="ui-label-cn">${escapeHtml(copy.syncReady)}</span><span class="ui-label-en">${escapeHtml(copy.syncReady)}</span>
    </span>`;
  }

  // ────── Launcher Profile Avatar State ──────
  function updateLauncherProfileAvatar() {
    const store = window.accountStore;
    if (!store) return;
    const state = store.getSnapshot();
    const avatarEl = document.querySelector('.launcher-profile-avatar');
    const nameEl = document.querySelector('.launcher-profile-name');
    const statusEl = document.querySelector('.launcher-profile-status');

    if (!avatarEl) return;

    const isGuest = state.authStatus === 'guest';

    // Update data attribute for CSS state switching
    const profile = document.querySelector('.launcher-profile');
    if (profile) {
      profile.dataset.accountState = isGuest
        ? 'guest'
        : state.tier !== 'free'
          ? 'premium'
          : 'signed-in';
    }

    if (nameEl) {
      nameEl.textContent = isGuest ? 'Player One' : state.displayName || 'User';
    }

    if (statusEl) {
      if (isGuest) {
        statusEl.innerHTML = `<span class="launcher-profile-status-dot"></span> ${isEnglish() ? 'Online' : 'Online'}`;
      } else {
        const tierLabel = state.tier !== 'free' ? ` · ${state.tier.toUpperCase()}` : '';
        statusEl.innerHTML = `<span class="launcher-profile-status-dot"></span> ${isEnglish() ? 'Signed In' : '已登录'}${tierLabel}`;
      }
    }
  }

  // ────── Update Save Manager Sync Badge ──────
  function updateSaveManagerSyncBadge() {
    const container = document.getElementById('save-sync-status-badge');
    if (!container) return;
    container.innerHTML = getSyncBadgeHtml();
  }

  // ────── EventBus Listener ──────
  function onAccountChanged() {
    updateLauncherProfileAvatar();
    updateSaveManagerSyncBadge();

    // Re-render account center if it's open
    if (isAccountCenterOpen()) {
      const overlay = document.getElementById(OVERLAY_ID);
      renderAccountCenter(overlay);
    }
  }

  // ────── Helpers ──────
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSyncTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleString();
    } catch (_) {
      return isoString;
    }
  }

  // ────── Init ──────
  function init() {
    if (window.eventBus) {
      window.eventBus.on('account:changed', onAccountChanged);
    }

    window.addEventListener('ui-language-changed', () => {
      onAccountChanged();
    });

    // Esc key to close account center
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isAccountCenterOpen()) {
        closeAccountCenter();
      }
    });

    // Event delegation for close button and backdrop
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay || e.target.closest('#account-center-close-btn')) {
          closeAccountCenter();
        }
      });
    }

    // Initial render of dependent UI pieces
    updateLauncherProfileAvatar();
    updateSaveManagerSyncBadge();
  }

  // Expose for launcher.js and others
  window.accountCenterUI = {
    open: openAccountCenter,
    close: closeAccountCenter,
    isOpen: isAccountCenterOpen,
    getSyncBadgeHtml,
    updateAll: onAccountChanged,
  };

  // Init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[AccountCenterUI] Initialized');
})();

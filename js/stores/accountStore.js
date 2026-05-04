// js/stores/accountStore.js
// 账号状态 Store - 基于 EventBus 的响应式状态管理
// 第一阶段：本地 Mock 数据驱动
// 第二阶段：替换为 Supabase 会话 + 数据库查询

(function () {
  'use strict';

  // 未来模型网关鉴权中间层的占位常量
  // 当平台提供模型能力时，前端需通过此中间层转发（而非直连 new-api）
  // eslint-disable-next-line no-unused-vars
  const API_GATEWAY_PLACEHOLDER = '/* 未来 Edge 中间层地址 */';

  const ACCOUNT_CHANGED_EVENT = 'account:changed';

  const DEFAULT_STATE = Object.freeze({
    // 认证（互斥二值）
    authStatus: 'guest', // 'guest' | 'signed_in'

    // 用户信息
    displayName: '',
    avatarUrl: '',
    email: '',

    // 权益（独立字段，与 authStatus 正交）
    cloudSyncEnabled: false,
    tier: 'free', // 'free' | 'pro' | 'premium'
    creditBalance: 0,
    apiConsoleEnabled: false,

    // 在线模式偏好
    selectedModelId: null, // 在线模式用户选定的模型 id

    // 社区贡献（世界卡平台）
    contributions: { uploadedCardIds: [], savedCardIds: [] },

    // 同步状态
    lastSyncAt: null, // ISO 时间戳
  });

  /**
   * AccountStore 单例
   * - getSnapshot() 返回只读副本
   * - update(partial) 合并状态并通过 EventBus 广播
   * - reset() 恢复默认游客态
   *
   * 消费者通过 eventBus.on('account:changed', handler) 监听状态变更
   */
  const AccountStore = {
    _state: { ...DEFAULT_STATE },

    /**
     * 返回当前状态的只读快照
     * @returns {Readonly<typeof DEFAULT_STATE>}
     */
    getSnapshot() {
      return Object.freeze({ ...this._state });
    },

    /**
     * 合并更新状态并广播变更事件
     * @param {Partial<typeof DEFAULT_STATE>} partial
     */
    update(partial) {
      if (!partial || typeof partial !== 'object') return;

      const oldSnapshot = this.getSnapshot();
      let hasChange = false;

      for (const key of Object.keys(partial)) {
        if (key in DEFAULT_STATE && this._state[key] !== partial[key]) {
          this._state[key] = partial[key];
          hasChange = true;
        }
      }

      if (hasChange && window.eventBus) {
        window.eventBus.emit(ACCOUNT_CHANGED_EVENT, {
          state: this.getSnapshot(),
          prev: oldSnapshot,
        });
      }
    },

    /**
     * 重置为默认游客态
     */
    reset() {
      this._state = { ...DEFAULT_STATE };
      if (window.eventBus) {
        window.eventBus.emit(ACCOUNT_CHANGED_EVENT, {
          state: this.getSnapshot(),
          prev: null,
        });
      }
    },

    // ────── 便捷查询方法 ──────

    /** @returns {boolean} 是否为游客态 */
    isGuest() {
      return this._state.authStatus === 'guest';
    },

    /** @returns {boolean} 是否已登录 */
    isSignedIn() {
      return this._state.authStatus === 'signed_in';
    },

    /** @returns {boolean} 是否已登录且开通云同步 */
    isCloudEnabled() {
      return this._state.authStatus === 'signed_in' && this._state.cloudSyncEnabled;
    },

    /** @returns {boolean} 是否有付费权益（非 free） */
    hasEntitlement() {
      return this._state.authStatus === 'signed_in' && this._state.tier !== 'free';
    },

    // ────── Mock 辅助方法（第二阶段替换为真实 Supabase / 支付集成） ──────

    /**
     * Mock 登录：根据邮箱构造一个 signed_in 状态。
     * @param {{ email: string, displayName?: string, tier?: string }} payload
     */
    mockSignIn(payload) {
      if (!payload || !payload.email) return;
      const fallbackName = String(payload.email).split('@')[0];
      this.update({
        authStatus: 'signed_in',
        email: payload.email,
        displayName: payload.displayName || fallbackName,
        avatarUrl: '',
        tier: payload.tier || 'free',
        apiConsoleEnabled: true,
      });
    },

    /** Mock 登出：恢复 guest 默认态。 */
    mockSignOut() {
      this.reset();
    },

    /**
     * Mock 充值：在当前余额基础上增加 amount。
     * @param {number} amount 元（mock 单位）
     */
    mockRecharge(amount) {
      const value = Number(amount) || 0;
      if (value <= 0) return;
      this.update({ creditBalance: this._state.creditBalance + value });
    },
  };

  // 挂载到全局
  window.accountStore = AccountStore;

  // 注册事件类型常量
  if (window.GameEvents) {
    window.GameEvents.ACCOUNT_CHANGED = ACCOUNT_CHANGED_EVENT;
  }

  console.log('[AccountStore] Initialized (guest mode)');
})();

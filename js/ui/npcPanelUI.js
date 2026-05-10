// ============================================
// NPC Panel UI - 左侧 NPC 角色面板 UI
// ============================================
// 纯 UI 模块，负责渲染和事件处理
// 数据存储和业务逻辑由 npcStore 负责

const npcPanelUI = {
  // ==========================================
  // 工具方法
  // ==========================================

  /**
   * 转义 HTML 属性值 - 防止 XSS 攻击
   */
  escapeAttr(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _formatPendingValue(value) {
    return value === null || value === undefined || value === '' ? '(空)' : String(value);
  },

  _getPendingHeaderText(pendingInfo) {
    const changes = pendingInfo?.changes || {};
    const turns = [
      ...new Set(
        Object.values(changes)
          .map(change => Number(change?.turn))
          .filter(turn => Number.isFinite(turn) && turn > 0)
      ),
    ].sort((a, b) => a - b);

    if (turns.length === 1) {
      return `AI 请求更新 (T${turns[0]})`;
    }
    if (turns.length > 1) {
      return 'AI 请求更新 (多轮更新)';
    }
    return 'AI 请求更新';
  },

  _getCardBadgeState(npcId) {
    const container = document.getElementById('npc-card-container');
    if (!container) return null;

    const safeId = this.escapeAttr(npcId);
    const cardWrapper = container.querySelector(`[data-npc-id="${safeId}"]`);
    const badge = cardWrapper?.querySelector('.npc-badge');
    if (!badge) return null;

    const badgeType =
      ['new', 'update', 'approved', 'restore'].find(type => badge.classList.contains(type)) ||
      'new';
    const turnMatch = badge.textContent?.match(/T(\d+)/);

    return {
      badgeType,
      turn: turnMatch ? Number(turnMatch[1]) : 0,
      uid: badge.dataset.uid || null,
    };
  },

  refreshCard(npcId, options = {}) {
    const npcData = npcStore.get(npcId);
    if (!npcData) return;

    const currentBadge = this._getCardBadgeState(npcId);
    const badgeType = options.badgeType || currentBadge?.badgeType || 'new';
    const turn = options.turn ?? currentBadge?.turn ?? npcData._lastTurn ?? 0;
    const uid = options.uid ?? currentBadge?.uid ?? npcData._lastUID ?? null;
    const pendingInfo = npcStore.getPending(npcId);

    this.renderCard(npcId, npcData, turn, uid, false, badgeType, !!options.insertAtEnd);
    if (pendingInfo) {
      this.showPendingUI(npcId, pendingInfo);
    }
  },

  // ==========================================
  // 渲染方法
  // ==========================================

  /**
   * 渲染单个 NPC 卡片
   * @param {string} npcId - NPC ID
   * @param {Object} npcData - NPC 数据
   * @param {number} turn - 轮次
   * @param {string} uid - UID
   * @param {boolean} isUpdate - 是否为更新
   * @param {string} badgeType - 徽章类型 ('new', 'update', 'approved', 'restore')
   * @param {boolean} insertAtEnd - 是否插入到末尾（用于恢复时保持顺序）
   */
  renderCard(
    npcId,
    npcData,
    turn = 0,
    uid = null,
    _isUpdate = false,
    badgeType = 'new',
    insertAtEnd = false
  ) {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    // 清除空状态提示
    const emptyMsg = container.querySelector('.npc-empty');
    if (emptyMsg) emptyMsg.remove();

    // 生成卡片 HTML
    let cardHtml = npcCardRenderer.render(npcData);

    // 添加徽章
    const uidAttr = uid ? ` data-uid="${this.escapeAttr(uid)}"` : '';
    const badgeLabels = {
      new: 'NEW',
      update: 'UPDATE',
      approved: 'APPROVED',
      restore: 'RESTORE',
    };
    const badgeLabel = badgeLabels[badgeType] || 'NEW';
    const badgeHtml = `<span class="npc-badge ${badgeType}"${uidAttr}>${badgeLabel}: T${turn}</span>`;

    cardHtml = cardHtml.replace(
      '<div class="npc-card-header">',
      '<div class="npc-card-header">' + badgeHtml
    );

    const safeId = this.escapeAttr(npcId);
    const existingCard = container.querySelector(`[data-npc-id="${safeId}"]`);
    const isSelected = npcStore.isSelected(npcId);

    if (existingCard) {
      // 更新现有卡片
      existingCard.outerHTML = `<div class="npc-card-wrapper${isSelected ? '' : ' unselected'}" data-npc-id="${safeId}" draggable="true">${cardHtml}</div>`;

      // 更新选中按键状态
      if (!isSelected) {
        const updatedCard = container.querySelector(`[data-npc-id="${safeId}"]`);
        const selectBtn = updatedCard?.querySelector('[data-action~="npc-select-btn"]');
        if (selectBtn) {
          selectBtn.classList.remove('selected');
          selectBtn.textContent = '⬜';
          selectBtn.title = '未选中 - 点击选中';
        }
      }
    } else {
      // 添加新卡片
      const wrapper = document.createElement('div');
      wrapper.className = `npc-card-wrapper${isSelected ? '' : ' unselected'}`;
      wrapper.dataset.npcId = npcId;
      wrapper.draggable = true;
      wrapper.innerHTML = cardHtml;

      // insertAtEnd 用于恢复时保持顺序，否则插入到顶部
      if (insertAtEnd) {
        container.appendChild(wrapper);
      } else {
        container.insertBefore(wrapper, container.firstChild);
      }

      // 如果未选中，更新按键状态（npcCardRenderer 默认是选中状态）
      if (!isSelected) {
        const selectBtn = wrapper.querySelector('[data-action~="npc-select-btn"]');
        if (selectBtn) {
          selectBtn.classList.remove('selected');
          selectBtn.textContent = '⬜';
          selectBtn.title = '未选中 - 点击选中';
        }
      }
    }
  },

  /**
   * 移除卡片
   * @param {string} npcId - NPC ID
   * @param {boolean} animate - 是否动画
   */
  removeCard(npcId, animate = true) {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    const safeId = this.escapeAttr(npcId);
    const cardWrapper = container.querySelector(`[data-npc-id="${safeId}"]`);
    if (!cardWrapper) return;

    if (animate) {
      cardWrapper.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      cardWrapper.style.opacity = '0';
      cardWrapper.style.transform = 'scale(0.9)';

      setTimeout(() => {
        cardWrapper.remove();
        this._checkEmpty(container);
      }, 300);
    } else {
      cardWrapper.remove();
      this._checkEmpty(container);
    }
  },

  /**
   * 显示待审批 UI
   * @param {string} npcId - NPC ID
   * @param {Object} pendingInfo - 待审批信息
   */
  showPendingUI(npcId, pendingInfo) {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    const safeId = this.escapeAttr(npcId);
    const cardWrapper = container.querySelector(`[data-npc-id="${safeId}"]`);
    if (!cardWrapper) return;

    // 移除已有的待审批 UI
    const existingUI = cardWrapper.querySelector('.npc-pending-update');
    if (existingUI) existingUI.remove();

    if (!pendingInfo || !pendingInfo.changes) {
      cardWrapper.classList.remove('has-pending-update');
      return;
    }

    const pendingFields = Object.keys(pendingInfo.changes);
    if (pendingFields.length === 0) {
      cardWrapper.classList.remove('has-pending-update');
      return;
    }

    // 生成变更列表 HTML
    let changesHtml = '';
    for (const field of pendingFields) {
      const change = pendingInfo.changes[field];
      const oldVal = this._formatPendingValue(change.old);
      const newVal = this._formatPendingValue(change.new);
      const safeField = this.escapeAttr(field);
      changesHtml += `<div class="pending-change-item" data-field="${safeField}">
                <div class="pending-change-info">
                    <span class="pending-field">${safeField}:</span>
                    <span class="pending-old">${this.escapeAttr(oldVal)}</span>
                    <span class="pending-arrow">-></span>
                    <span class="pending-new">${this.escapeAttr(newVal)}</span>
                </div>
                <div class="pending-field-actions">
                    <button class="btn-ghost btn-icon btn-sm" data-action="approve-pending-field" data-npc-id="${safeId}" data-field="${safeField}" title="接受此项"><span class="material-symbols-outlined">check</span></button>
                    <button class="btn-danger btn-icon btn-sm" data-action="reject-pending-field" data-npc-id="${safeId}" data-field="${safeField}" title="拒绝此项"><span class="material-symbols-outlined">close</span></button>
                </div>
            </div>`;
    }

    // 创建待审批 UI
    const pendingUI = document.createElement('div');
    pendingUI.className = 'npc-pending-update';
    pendingUI.innerHTML = `
            <div class="pending-header">
                <span class="pending-icon">⚠️</span>
                <span class="pending-title">${this._getPendingHeaderText(pendingInfo)}</span>
                <span class="pending-count">${pendingFields.length} 项待审</span>
            </div>
            <div class="pending-changes">${changesHtml}</div>
        `;

    cardWrapper.appendChild(pendingUI);
    cardWrapper.classList.add('has-pending-update');
  },

  /**
   * 移除待审批 UI
   * @param {string} npcId - NPC ID
   */
  removePendingUI(npcId) {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    const safeId = this.escapeAttr(npcId);
    const cardWrapper = container.querySelector(`[data-npc-id="${safeId}"]`);
    if (cardWrapper) {
      const pendingUI = cardWrapper.querySelector('.npc-pending-update');
      if (pendingUI) pendingUI.remove();
      cardWrapper.classList.remove('has-pending-update');
    }
  },

  /**
   * 更新卡片选中状态样式
   * @param {string} npcId - NPC ID
   * @param {boolean} selected - 是否选中
   */
  updateCardSelection(npcId, selected) {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    const safeId = this.escapeAttr(npcId);
    const cardWrapper = container.querySelector(`[data-npc-id="${safeId}"]`);
    if (!cardWrapper) return;

    cardWrapper.classList.toggle('unselected', !selected);

    const selectBtn = cardWrapper.querySelector('[data-action~="npc-select-btn"]');
    if (selectBtn) {
      selectBtn.classList.toggle('selected', selected);
      selectBtn.textContent = selected ? '✅' : '⬜';
      selectBtn.title = selected ? '已选中 - 点击取消' : '未选中 - 点击选中';
    }
  },

  /**
   * 清空面板 UI
   */
  clearUI() {
    const container = document.getElementById('npc-card-container');
    if (container) {
      const emptyText = window.i18nService?.t?.('sidebar.npcEmpty') || '暂无角色信息';
      container.innerHTML = `<div class="npc-empty">${emptyText}</div>`;
    }
  },

  /**
   * 从存档恢复 UI (根据 store 数据重新渲染)
   */
  restoreUI() {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    container.innerHTML = '';

    const order = npcStore.getOrder();
    if (order.length === 0) {
      const emptyText = window.i18nService?.t?.('sidebar.npcEmpty') || '暂无角色信息';
      container.innerHTML = `<div class="npc-empty">${emptyText}</div>`;
      return;
    }

    for (const npcId of order) {
      const npcData = npcStore.get(npcId);
      if (!npcData) continue;

      const turn = npcData._lastTurn || 0;
      const uid = npcData._lastUID || null;

      // insertAtEnd=true 保持存档中的顺序
      this.renderCard(npcId, npcData, turn, uid, false, 'restore', true);
    }
  },

  /**
   * 检查是否为空并显示提示
   */
  _checkEmpty(container) {
    if (!container.querySelector('.npc-card-wrapper')) {
      const emptyText = window.i18nService?.t?.('sidebar.npcEmpty') || '暂无角色信息';
      container.innerHTML = `<div class="npc-empty">${emptyText}</div>`;
    }
  },

  /**
   * 从 DOM 更新排序到 store
   */
  _updateOrderFromDOM() {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    const cards = container.querySelectorAll('.npc-card-wrapper');
    const newOrder = Array.from(cards)
      .map(card => card.dataset.npcId)
      .filter(id => id);
    npcStore.reorder(newOrder);
  },

  // ==========================================
  // 初始化
  // ==========================================

  /**
   * 初始化 - 绑定事件和订阅 store
   */
  init() {
    const container = document.getElementById('npc-card-container');
    if (!container) return;

    // ========================================
    // 通过 EventBus 订阅 NPC 事件
    // ========================================

    eventBus.on(GameEvents.NPC_ADDED, ({ npcId, data, turn, uid, isUpdate }) => {
      this.renderCard(npcId, data, turn, uid, isUpdate, isUpdate ? 'update' : 'new');
    });

    eventBus.on(GameEvents.NPC_DELETED, ({ npcId, npcName }) => {
      this.removeCard(npcId, true);
      if (npcName && typeof showToast === 'function') {
        showToast(`已删除角色: ${npcName}`);
      }
    });

    eventBus.on(GameEvents.NPC_PENDING, ({ npcId, pendingInfo }) => {
      this.showPendingUI(npcId, pendingInfo);
    });

    eventBus.on(GameEvents.NPC_PENDING_CLEARED, ({ npcId }) => {
      this.removePendingUI(npcId);
    });

    eventBus.on(GameEvents.NPC_APPROVED, ({ npcId, turn, uid }) => {
      if (npcStore.get(npcId)) {
        this.refreshCard(npcId, { badgeType: 'approved', turn, uid });
      }
    });

    eventBus.on(GameEvents.NPC_SELECTED, ({ npcId, selected }) => {
      this.updateCardSelection(npcId, selected);
    });

    eventBus.on(GameEvents.NPC_CLEARED, () => {
      this.clearUI();
    });

    eventBus.on(GameEvents.NPC_RESTORED, () => {
      this.restoreUI();
    });

    // ========================================
    // 事件委托: 删除按键
    // ========================================

    container.addEventListener('click', e => {
      const deleteBtn = e.target.closest('[data-action~="npc-btn-danger"]');
      if (!deleteBtn) return;

      const cardWrapper = deleteBtn.closest('.npc-card-wrapper');
      if (cardWrapper) {
        const npcId = cardWrapper.dataset.npcId;
        if (npcId) {
          npcStore.delete(npcId);
        }
      }
    });

    // ========================================
    // 事件委托: 选中按键
    // ========================================

    container.addEventListener('click', e => {
      const selectBtn = e.target.closest('[data-action~="npc-select-btn"]');
      if (!selectBtn) return;

      const cardWrapper = selectBtn.closest('.npc-card-wrapper');
      if (cardWrapper) {
        const npcId = cardWrapper.dataset.npcId;
        if (npcId) {
          npcStore.toggleSelected(npcId);
        }
      }
    });

    // ========================================
    // 事件委托: 可编辑字段
    // ========================================

    container.addEventListener('focusout', e => {
      const editableField = e.target;
      if (!editableField || !editableField.classList.contains('npc-editable')) return;

      const cardWrapper = editableField.closest('.npc-card-wrapper');
      if (!cardWrapper) return;

      const npcId = cardWrapper.dataset.npcId;
      const fieldName = editableField.dataset.field;
      let newValue = editableField.textContent.trim();

      // 处理 cognitive_state 前缀
      if (fieldName === 'cognitive_state') {
        newValue = newValue.replace(/^⚜\s*/, '');
      }

      // 校验统一由 npcStore.updateField() 处理（integer / enum）

      // 更新到 store
      if (npcId && fieldName) {
        const updated = npcStore.updateField(npcId, fieldName, newValue);
        if (!updated) {
          // 校验失败：恢复旧值到 DOM + toast 提示
          const npcData = npcStore.get(npcId);
          const restoreValue = npcData?.[fieldName];
          editableField.textContent = restoreValue == null ? '' : String(restoreValue);
          const npcFields = window.worldMeta?.getStep3Fields?.()?.panel_npc;
          const fieldDef = Array.isArray(npcFields) && npcFields.find(f => f.key === fieldName);
          if (typeof showToast === 'function') {
            showToast(`${fieldDef?.label || fieldName} 输入无效`);
          }
          return;
        }

        // 编辑成功：回写规范化后的值（如 "001" → "1"）
        const savedData = npcStore.get(npcId);
        const savedValue = savedData?.[fieldName];
        const displayValue = savedValue == null ? '' : String(savedValue);
        if (editableField.textContent !== displayValue) {
          editableField.textContent = displayValue;
        }

        if (fieldName === 'birthday' || fieldName === 'cognitive_state') {
          this.refreshCard(npcId);
        } else {
          // 更新宽度类名（CSS Grid 自动重排相邻字段）
          const itemEl = editableField.closest('.npc-item');
          if (itemEl) {
            const label = npcCardRenderer._getFieldLabel(fieldName);
            const widthClass = npcCardRenderer.getFieldWidthClass(label, displayValue);
            itemEl.classList.remove('half', 'full');
            itemEl.classList.add(widthClass);
          }
        }
      }
    });

    // 防止回车换行
    container.addEventListener('keydown', e => {
      const editableField = e.target;
      if (!editableField || !editableField.classList.contains('npc-editable')) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        editableField.blur();
      }
    });

    // ========================================
    // 事件委托: 审批按键
    // ========================================

    container.addEventListener('click', e => {
      // 单字段批准
      const fieldApproveBtn = e.target.closest('[data-action="approve-pending-field"]');
      if (fieldApproveBtn) {
        const npcId = fieldApproveBtn.dataset.npcId;
        const field = fieldApproveBtn.dataset.field;
        if (npcId && field) {
          npcStore.approveField(npcId, field);
        }
        return;
      }

      // 单字段拒绝
      const fieldRejectBtn = e.target.closest('[data-action="reject-pending-field"]');
      if (fieldRejectBtn) {
        const npcId = fieldRejectBtn.dataset.npcId;
        const field = fieldRejectBtn.dataset.field;
        if (npcId && field) {
          npcStore.rejectField(npcId, field);
        }
        return;
      }
    });

    // ========================================
    // 拖拽排序
    // ========================================

    this._initDragAndDrop(container);
  },

  /**
   * 初始化拖拽排序
   */
  _initDragAndDrop(container) {
    let draggedItem = null;
    let placeholder = null;

    const createPlaceholder = () => {
      const el = document.createElement('div');
      el.className = 'npc-card-placeholder';
      return el;
    };

    container.addEventListener('dragstart', e => {
      const cardWrapper = e.target.closest('.npc-card-wrapper');
      if (!cardWrapper) return;

      if (e.target.closest('.npc-editable') || e.target.closest('button')) {
        e.preventDefault();
        return;
      }

      draggedItem = cardWrapper;
      draggedItem.classList.add('dragging');

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardWrapper.dataset.npcId);

      setTimeout(() => {
        if (draggedItem) {
          draggedItem.style.opacity = '0.5';
        }
      }, 0);
    });

    container.addEventListener('dragend', () => {
      if (!draggedItem) return;

      draggedItem.classList.remove('dragging');
      draggedItem.style.opacity = '';

      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
      placeholder = null;

      // 更新排序到 store
      this._updateOrderFromDOM();

      draggedItem = null;
    });

    container.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!draggedItem) return;

      // 拖拽期间若后端推送 NPC 变更触发 refreshCard/outerHTML 替换，或玩家的
      // draggedItem 被删除，原 DOM 节点会脱离 container。继续 insertBefore 会
      // 导致 "Cannot read properties of null" 或把 placeholder 插到孤儿节点旁。
      // 这里统一校验：draggedItem / placeholder / afterElement 必须仍是 container
      // 的直接子节点，否则放弃本次操作并清掉过期引用。
      if (draggedItem.parentNode !== container) {
        draggedItem = null;
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        placeholder = null;
        return;
      }

      // 若 placeholder 被外部（如 refreshCard 重绘）从 DOM 摘除，重置引用
      if (placeholder && placeholder.parentNode !== container) {
        placeholder = null;
      }

      const afterElement = this._getDragAfterElement(container, e.clientY);

      const ensurePlaceholder = () => {
        if (!placeholder) {
          placeholder = createPlaceholder();
          placeholder.style.height = `${draggedItem.offsetHeight}px`;
        }
        return placeholder;
      };

      if (afterElement === null || afterElement === undefined) {
        if (
          container.lastElementChild !== placeholder &&
          container.lastElementChild !== draggedItem
        ) {
          container.appendChild(ensurePlaceholder());
        }
      } else if (
        afterElement !== draggedItem &&
        afterElement !== placeholder &&
        afterElement.parentNode === container
      ) {
        container.insertBefore(ensurePlaceholder(), afterElement);
      }
    });

    container.addEventListener('drop', e => {
      e.preventDefault();

      if (!draggedItem || !placeholder) return;

      // 同步校验 placeholder 仍挂在 container 上（异步刷新可能摘除）
      if (placeholder.parentNode === container && draggedItem.parentNode) {
        placeholder.parentNode.insertBefore(draggedItem, placeholder);
        placeholder.parentNode.removeChild(placeholder);
      }
      placeholder = null;
    });

    container.addEventListener('dragleave', e => {
      if (e.target === container && !container.contains(e.relatedTarget)) {
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
          placeholder = null;
        }
      }
    });
  },

  /**
   * 获取拖拽后插入位置
   */
  _getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.npc-card-wrapper:not(.dragging)')];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  },
};

// 暴露到全局
window.npcPanelUI = npcPanelUI;

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
  npcPanelUI.init();
});

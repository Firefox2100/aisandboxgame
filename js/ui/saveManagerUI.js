// ============================================
// Save Manager UI - 存档管理界面
// ============================================

// 依赖: saveManager, chat, chatHistory, currentSlotId, currentSaveBindingWorldCardId (来自其他模块)

// 模块内部状态变量(避免全局污染)
let _pendingSaveSlot = null; // { slotId, panelWorldId }
let _pendingRenameSlot = null; // { slotId, panelWorldId }
let _pendingDeleteSlot = null; // { slotId, panelWorldId }
let _saveNameMode = 'save';
let _selectedLoadTarget = null; // { worldId, slotId }
let _panelWorldId = null; // 当前面板预览世界卡 ID
let _saveManagerOpenSource = 'normal'; // normal | launcher-continue | boot-resume
const _saveSlotsScrollTopByWorld = new Map();
let _saveManagerMode = 'default';
let _transitionAutosaveModalContext = null; // { onOverwrite, onSkip, onCancel }
let _saveManagerLanguageSyncBound = false;

function _formatSaveManagerBilingualText(zhText, enText) {
  const i18n = window.i18nService;
  if (typeof i18n?.formatBilingualText === 'function') {
    return i18n.formatBilingualText(zhText, enText);
  }
  // 单语回退：i18nService 未就绪时也只显示当前语言（不再拼括号双显）
  return (i18n?.getResolvedLanguage?.() || 'zh-CN') === 'en' ? enText : zhText;
}

function _setSaveManagerBilingualText(target, zhText, enText) {
  const i18n = window.i18nService;
  if (typeof i18n?.setBilingualText === 'function') {
    i18n.setBilingualText(target, zhText, enText);
    return;
  }
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) return;
  node.textContent = _formatSaveManagerBilingualText(zhText, enText);
}

function _getSaveManagerLanguage() {
  return window.i18nService?.getResolvedLanguage?.() || 'zh-CN';
}

function _saveManagerText(zhText, enText) {
  return _getSaveManagerLanguage() === 'en' ? enText : zhText;
}

function _translateSaveManagerDetail(text) {
  const rawText = String(text || '').trim();
  if (!rawText) return '';
  if (typeof window.i18nService?.translateLegacyText === 'function') {
    return window.i18nService.translateLegacyText(rawText);
  }
  return rawText;
}

function _getSaveManagerReason(reason, fallbackZh = '未知错误', fallbackEn = 'Unknown error') {
  const rawReason = String(reason || '').trim();
  if (!rawReason) return _saveManagerText(fallbackZh, fallbackEn);
  return _translateSaveManagerDetail(rawReason);
}

function _isManualSlotId(slotId) {
  return /^slot_\d+$/.test(String(slotId || '').trim());
}

function _getSlotNumberLabel(slotId, fallback = '1') {
  const label = String(slotId || '')
    .replace('slot_', '')
    .trim();
  return label || fallback;
}

function _getNewSaveName(slotId) {
  const slotLabel = _getSlotNumberLabel(slotId);
  return _saveManagerText(`新存档 ${slotLabel}`, `New Save ${slotLabel}`);
}

function _getSaveLabel(slotId) {
  const slotLabel = _getSlotNumberLabel(slotId);
  return _saveManagerText(`存档 ${slotLabel}`, `Save ${slotLabel}`);
}

function _getSaveNameModalConfig(mode = 'save') {
  if (mode === 'rename') {
    return {
      title: _saveManagerText('重命名存档', 'Rename Save'),
      confirmText: _saveManagerText('重命名', 'Rename'),
    };
  }
  return {
    title: _saveManagerText('新建存档', 'Create Save'),
    confirmText: _saveManagerText('创建', 'Create'),
  };
}

function _isSaveManagerOpen() {
  const modal = document.getElementById('save-manager-modal');
  return Boolean(modal && !modal.classList.contains('hidden'));
}

function _captureSaveSlotsScroll(worldId) {
  const container = document.getElementById('save-slots-container');
  const normalizedWorldId = String(worldId || '').trim();
  if (!container || !normalizedWorldId) return;
  _saveSlotsScrollTopByWorld.set(normalizedWorldId, Math.max(0, container.scrollTop || 0));
}

function _getNearestSlotTop(container, desiredTop) {
  if (!container) return 0;
  const slots = Array.from(container.querySelectorAll('.save-slot'));
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const target = Math.max(0, Math.min(desiredTop || 0, maxTop));
  if (slots.length === 0) return target;

  let nearestTop = 0;
  let minDiff = Math.abs(target);
  slots.forEach(slot => {
    const top = Math.max(0, Math.min(slot.offsetTop, maxTop));
    const diff = Math.abs(top - target);
    if (diff < minDiff) {
      minDiff = diff;
      nearestTop = top;
    }
  });
  return nearestTop;
}

function _restoreSaveSlotsScroll(worldId) {
  const container = document.getElementById('save-slots-container');
  const normalizedWorldId = String(worldId || '').trim();
  if (!container || !normalizedWorldId) return;

  const savedTop = _saveSlotsScrollTopByWorld.get(normalizedWorldId);
  if (typeof savedTop !== 'number' || Number.isNaN(savedTop)) {
    container.scrollTop = 0;
    return;
  }

  const snappedTop = _getNearestSlotTop(container, savedTop);
  container.scrollTop = snappedTop;
  _saveSlotsScrollTopByWorld.set(normalizedWorldId, snappedTop);
}

function _getCurrentActiveWorldCardId() {
  const mgr = window.worldCardManager;
  return mgr?.getActiveCardId?.() || null;
}

function _getActiveWorldCardIdForPanel() {
  const normalizedPanelId = String(_panelWorldId || '').trim();
  if (normalizedPanelId) {
    if (_worldCardExists(normalizedPanelId)) return normalizedPanelId;
    _panelWorldId = null;
  }
  return _getCurrentActiveWorldCardId();
}

function _worldCardExists(worldCardId) {
  const mgr = window.worldCardManager;
  if (!mgr) return false;
  const normalized = String(worldCardId || '').trim();
  if (!normalized) return false;
  return Boolean(mgr.get(normalized));
}

function _isTransitionOverwriteMode() {
  return false;
}

function _getLockedWorldCardId() {
  return null;
}

function _normalizeProtectedSlotIds(slotIds = []) {
  const rawList = Array.isArray(slotIds) ? slotIds : [slotIds];
  return Array.from(new Set(rawList.map(slotId => String(slotId || '').trim()).filter(Boolean)));
}

function _getProtectedSlotIds() {
  return [];
}

function _isProtectedOverwriteSlot(slotId) {
  const normalizedSlotId = String(slotId || '').trim();
  if (!normalizedSlotId) return false;
  return _getProtectedSlotIds().includes(normalizedSlotId);
}

async function runTransitionAutoSaveGuard(options = {}) {
  const {
    lockSource = 'transition-guard',
    onReady = null,
    failurePrefix = _saveManagerText('流程切换失败', 'Flow switch failed'),
  } = options;

  const manager = window.sessionManager;
  const releaseLock = () => {
    if (!manager || typeof manager.releaseTransitionLock !== 'function') return;
    manager.releaseTransitionLock(lockSource);
  };
  const finish = async callback => {
    try {
      return typeof callback === 'function' ? await callback() : true;
    } finally {
      releaseLock();
    }
  };

  if (
    !manager ||
    typeof manager.acquireTransitionLock !== 'function' ||
    typeof manager.tryAutoSaveForTransition !== 'function'
  ) {
    return finish(onReady);
  }

  const lockResult = manager.acquireTransitionLock(lockSource);
  if (!lockResult || lockResult.ok === false) {
    showToast(
      _saveManagerText(
        lockResult?.reason ? `请先完成当前流程（${lockResult.reason}）` : '请先完成当前流程',
        lockResult?.reason
          ? `Finish the current flow first (${_translateSaveManagerDetail(lockResult.reason)})`
          : 'Finish the current flow first.'
      )
    );
    return false;
  }

  const saveResult = await manager.tryAutoSaveForTransition({ source: 'auto_transition' });
  const canContinue =
    typeof manager._canContinueAfterTransitionSave === 'function'
      ? manager._canContinueAfterTransitionSave(saveResult)
      : Boolean(saveResult && saveResult.ok);

  if (canContinue) {
    return finish(onReady);
  }

  showToast(
    _saveManagerText(
      `${failurePrefix}：${_getSaveManagerReason(saveResult?.reason)}`,
      `${failurePrefix}: ${_getSaveManagerReason(saveResult?.reason)}`
    )
  );
  releaseLock();
  return false;
}

function closeTransitionAutosaveModal() {
  document.getElementById('transition-autosave-modal')?.classList.add('hidden');
  _transitionAutosaveModalContext = null;
}

function _handleTransitionAutosaveChoice(choice) {
  const context = _transitionAutosaveModalContext;
  closeTransitionAutosaveModal();
  if (!context) return;
  if (choice === 'overwrite' && typeof context.onOverwrite === 'function') {
    context.onOverwrite();
    return;
  }
  if (choice === 'skip' && typeof context.onSkip === 'function') {
    context.onSkip();
    return;
  }
  if (typeof context.onCancel === 'function') {
    context.onCancel();
  }
}

function _getTransitionAutosaveModalDefaults() {
  const isEnglish = window.i18nService?.getResolvedLanguage?.() === 'en';
  return isEnglish
    ? {
        title: 'Auto-save Conflict',
        text: 'Automatic save failed because the current world has no empty slot. Choose how to continue.',
        overwriteText: 'Choose a Slot to Overwrite',
        skipText: 'Skip Save and Continue',
        cancelText: 'Cancel',
      }
    : {
        title: '自动保存冲突',
        text: '自动保存失败：当前世界没有空槽位，请手动选择要覆盖的存档槽位。',
        overwriteText: '手动选槽位覆盖',
        skipText: '跳过保存继续',
        cancelText: '取消',
      };
}

function _applyTransitionAutosaveButton(button, options = {}) {
  if (!button) return;

  const { text = '', hidden = false, tone = 'secondary', order = null } = options;

  button.hidden = Boolean(hidden);
  button.textContent = text;
  button.classList.toggle('btn-primary', tone === 'primary');
  button.classList.toggle('btn-secondary', tone !== 'primary');
  button.style.order = Number.isFinite(order) ? String(order) : '';
}

function openTransitionAutosaveModal(options = {}) {
  const modal = document.getElementById('transition-autosave-modal');
  if (!modal) return false;
  const titleEl = document.getElementById('transition-autosave-title');
  const textEl = document.getElementById('transition-autosave-text');
  const overwriteBtn = document.getElementById('transition-autosave-overwrite-btn');
  const skipBtn = document.getElementById('transition-autosave-skip-btn');
  const cancelBtn = document.getElementById('transition-autosave-cancel-btn');
  const defaults = _getTransitionAutosaveModalDefaults();
  const title = String(options.title || defaults.title).trim();
  const text = String(options.text || defaults.text).trim();
  const titleIconClass =
    typeof options.titleIconClass === 'string' ? options.titleIconClass.trim() : 'icon icon-save';

  if (titleEl) {
    titleEl.innerHTML = '';
    if (titleIconClass) {
      const iconEl = document.createElement('span');
      iconEl.className = titleIconClass;
      titleEl.append(iconEl, document.createTextNode(' '));
    }
    titleEl.append(document.createTextNode(title));
  }
  if (textEl) {
    textEl.textContent = text;
  }

  _applyTransitionAutosaveButton(overwriteBtn, {
    text: String(options.overwriteText || defaults.overwriteText).trim(),
    hidden: options.showOverwrite === false,
    tone: options.overwriteTone || 'primary',
    order: options.overwriteOrder,
  });
  _applyTransitionAutosaveButton(skipBtn, {
    text: String(options.skipText || defaults.skipText).trim(),
    hidden: options.showSkip === false,
    tone: options.skipTone || 'secondary',
    order: options.skipOrder,
  });
  _applyTransitionAutosaveButton(cancelBtn, {
    text: String(options.cancelText || defaults.cancelText).trim(),
    hidden: options.showCancel === false,
    tone: options.cancelTone || 'secondary',
    order: options.cancelOrder,
  });

  _transitionAutosaveModalContext = {
    onOverwrite: typeof options.onOverwrite === 'function' ? options.onOverwrite : null,
    onSkip: typeof options.onSkip === 'function' ? options.onSkip : null,
    onCancel: typeof options.onCancel === 'function' ? options.onCancel : null,
  };
  modal.classList.remove('hidden');
  return true;
}

function _collectSessionErrorLabels(errors = []) {
  return Array.from(
    new Set(
      (errors || []).map(err =>
        _translateSaveManagerDetail(
          err?.label || err?.service || _saveManagerText('未知模块', 'Unknown module')
        )
      )
    )
  );
}

function _showSaveActionResult(result, options = {}) {
  const { isEmptySlot = false, fallbackName = _saveManagerText('未命名存档', 'Untitled Save') } =
    options;
  if (result && result.ok) {
    renderSaveSlots();
    const errorLabels = _collectSessionErrorLabels(result.errors || []);
    const doneName = result.saveName || fallbackName;
    if (isEmptySlot) {
      if (errorLabels.length > 0) {
        showToast(
          _saveManagerText(
            `已创建新存档"${doneName}"（${errorLabels.join('、')}保存失败）`,
            `Created new save "${doneName}" (${errorLabels.join(', ')} failed to save).`
          )
        );
      } else {
        showToast(_saveManagerText(`已创建新存档"${doneName}"`, `Created new save "${doneName}".`));
      }
    } else if (errorLabels.length > 0) {
      showToast(
        _saveManagerText(
          `已保存到"${doneName}"（${errorLabels.join('、')}保存失败）`,
          `Saved to "${doneName}" (${errorLabels.join(', ')} failed to save).`
        )
      );
    } else {
      showToast(_saveManagerText(`已保存到"${doneName}"`, `Saved to "${doneName}".`));
    }
    return true;
  }

  const reason = _getSaveManagerReason(result?.reason, '存储空间不足', 'Storage is full');
  showToast(
    _saveManagerText(
      `${isEmptySlot ? '创建新存档失败' : '存档失败'}：${reason}`,
      `${isEmptySlot ? 'Failed to create new save' : 'Save failed'}: ${reason}`
    )
  );
  return false;
}

function _getDefaultWorldCardId() {
  const configuredId = String(
    window.worldCardManager?.getDefaultBuiltInCardId?.() ||
      window.worldCardManager?.BUILTIN_CARD_ID ||
      ''
  ).trim();
  return configuredId || 'wc_builtin_default';
}

function startDefaultWorldCardFlow() {
  if (typeof isSending !== 'undefined' && isSending) {
    showToast(
      _saveManagerText(
        '请等待回复完成后再进入默认世界',
        'Wait for the current reply to finish before entering the default world.'
      )
    );
    return false;
  }

  const mgr = window.worldCardManager;
  if (!mgr || typeof mgr.get !== 'function') {
    showToast(
      _saveManagerText(
        '默认世界卡按钮不可用：worldCardManager 未就绪',
        'Default world card unavailable: worldCardManager is not ready.'
      )
    );
    return false;
  }
  if (!window.sessionManager || typeof window.sessionManager.startNewGame !== 'function') {
    showToast(
      _saveManagerText(
        '默认世界卡按钮不可用：sessionManager 未就绪',
        'Default world card unavailable: sessionManager is not ready.'
      )
    );
    return false;
  }

  const worldCardId = _getDefaultWorldCardId();
  const card = mgr.get(worldCardId);
  if (!card) {
    showToast(
      _saveManagerText(
        '默认世界卡不可用，请刷新重试',
        'The default world card is unavailable. Refresh and try again.'
      )
    );
    return false;
  }

  return runTransitionAutoSaveGuard({
    lockSource: 'default-world-inline',
    onReady: async () => {
      const startResult = await window.sessionManager.startNewGame({
        worldCardId,
        silent: true,
      });
      if (!startResult || !startResult.ok) {
        showToast(
          _saveManagerText(
            `进入默认世界失败：${_getSaveManagerReason(startResult?.reason)}`,
            `Failed to enter the default world: ${_getSaveManagerReason(startResult?.reason)}`
          )
        );
        return false;
      }
      if (_isSaveManagerOpen()) closeSaveManager();
      showToast(
        _saveManagerText(
          `已进入默认世界「${card.name || _getWorldCardName(worldCardId)}」`,
          `Entered default world "${card.name || _getWorldCardName(worldCardId)}".`
        )
      );
      return true;
    },
    failurePrefix: _saveManagerText('进入默认世界失败', 'Failed to enter the default world'),
  });
}

async function _runCreateNewSaveFlow(options = {}) {
  const { targetWorldCardId, targetSlotId, finalName, allowEmptySave = false } = options;

  if (
    !window.sessionManager ||
    typeof window.sessionManager.createNewSaveAtEmptySlot !== 'function'
  ) {
    showToast(
      _saveManagerText(
        '创建新存档失败：sessionManager 不可用',
        'Failed to create a new save: sessionManager unavailable.'
      )
    );
    return null;
  }

  const result = await window.sessionManager.createNewSaveAtEmptySlot({
    targetWorldCardId,
    targetSlotId,
    saveName: finalName,
    silent: true,
    allowEmptySave,
  });
  _showSaveActionResult(result, { isEmptySlot: true, fallbackName: finalName });
  return result;
}

function _applySaveManagerModeUI() {
  const confirmBtn = document.getElementById('save-manager-confirm-btn');
  const cancelBtn = document.getElementById('save-manager-cancel-btn');
  if (!confirmBtn || !cancelBtn) return;
  _setSaveManagerBilingualText(confirmBtn, '读取', 'Load');
  _setSaveManagerBilingualText(cancelBtn, '取消', 'Cancel');
}

function _resetSaveManagerMode() {
  _saveManagerMode = 'default';
  _applySaveManagerModeUI();
}

function _renderSessionBindingHint(panelWorldId) {
  const bindingTextEl = document.getElementById('save-world-binding-text');
  if (!bindingTextEl) return;

  const sessionOrigin =
    typeof window.sessionManager?.getSessionOrigin === 'function'
      ? window.sessionManager.getSessionOrigin()
      : {
          type: currentSlotId && currentSaveBindingWorldCardId ? 'manual' : 'unsaved',
          worldCardId: currentSaveBindingWorldCardId || _getCurrentActiveWorldCardId(),
          slotId: currentSlotId,
        };
  const panelWorldName = _getWorldCardName(panelWorldId);
  const sessionWorldId = String(sessionOrigin?.worldCardId || '').trim();
  const sessionWorldName = _getWorldCardName(sessionWorldId);
  const sameWorld = sessionWorldId && panelWorldId === sessionWorldId;

  if (!sessionWorldId) {
    bindingTextEl.textContent = _saveManagerText(
      `关联：${panelWorldName} · 未绑定会话`,
      `Linked: ${panelWorldName} · No session bound`
    );
    return;
  }

  if (sessionOrigin?.type === 'manual' && sessionOrigin?.slotId) {
    const slotName =
      (typeof saveManager?.getSlotNameSync === 'function'
        ? saveManager.getSlotNameSync(sessionWorldId, sessionOrigin.slotId)
        : '') || sessionOrigin.slotId;
    bindingTextEl.textContent = sameWorld
      ? _saveManagerText(
          `关联：${panelWorldName} · 当前存档 ${slotName}`,
          `Linked: ${panelWorldName} · Current save ${slotName}`
        )
      : _saveManagerText(
          `关联：${panelWorldName} · 当前游玩来自 ${sessionWorldName}/${sessionOrigin.slotId}`,
          `Linked: ${panelWorldName} · Current play session from ${sessionWorldName}/${sessionOrigin.slotId}`
        );
    return;
  }



  bindingTextEl.textContent = sameWorld
    ? _saveManagerText(
        `关联：${panelWorldName} · 当前没有活动存档`,
        `Linked: ${panelWorldName} · No active save`
      )
    : _saveManagerText(
        `关联：${panelWorldName} · 当前游玩位于 ${sessionWorldName}`,
        `Linked: ${panelWorldName} · Current play session in ${sessionWorldName}`
      );
}

function _setSaveNameModalContent(mode) {
  const titleEl = document.getElementById('save-name-modal-title');
  const confirmBtn = document.getElementById('save-name-confirm-btn');
  const cancelBtn = document.getElementById('save-name-cancel-btn');
  const labelEl = document.querySelector('label[for="save-name-input"]');
  const cfg = _getSaveNameModalConfig(mode);
  if (titleEl) titleEl.innerHTML = `<span class="icon icon-save"></span> ${cfg.title}`;
  if (confirmBtn) confirmBtn.textContent = cfg.confirmText;
  if (cancelBtn) cancelBtn.textContent = _saveManagerText('取消', 'Cancel');
  if (labelEl) labelEl.textContent = _saveManagerText('存档名称', 'Save Name');
}

function _resetSaveNameFlowState() {
  _pendingSaveSlot = null;
  _pendingRenameSlot = null;
  _saveNameMode = 'save';
  _setSaveNameModalContent('save');
}

function _clearSelectedLoadTarget() {
  _selectedLoadTarget = null;
}

function _clearPanelWorldId() {
  _panelWorldId = null;
}

function _setSelectedLoadTarget(worldId, slotId) {
  const normalizedWorldId = String(worldId || '').trim();
  const normalizedSlotId = String(slotId || '').trim();
  if (!normalizedWorldId || !_isManualSlotId(normalizedSlotId)) return;
  _selectedLoadTarget = {
    worldId: normalizedWorldId,
    slotId: normalizedSlotId,
  };
}

function _isSelectedLoadSlot(worldId, slotId) {
  return Boolean(
    _selectedLoadTarget &&
    _selectedLoadTarget.worldId === worldId &&
    _selectedLoadTarget.slotId === slotId
  );
}

function getSaveManagerPanelWorldId() {
  return _getActiveWorldCardIdForPanel();
}

function setSaveManagerPanelWorldId(worldId, options = {}) {
  const normalizedWorldId = String(worldId || '').trim();
  if (!normalizedWorldId || !_worldCardExists(normalizedWorldId)) {
    return false;
  }

  _panelWorldId = normalizedWorldId;
  if (options.clearSelected !== false) {
    _clearSelectedLoadTarget();
  }

  if (options.render !== false) {
    renderSaveSlots();
    if (typeof renderWorldCards === 'function') renderWorldCards();
  }
  return true;
}

function syncSaveManagerPanelWorldIdWithActiveWorld(options = {}) {
  const activeId = _getCurrentActiveWorldCardId();
  if (!activeId || !_worldCardExists(activeId)) {
    _clearPanelWorldId();
    if (options.clearSelected !== false) {
      _clearSelectedLoadTarget();
    }
    if (options.render) {
      renderSaveSlots();
      if (typeof renderWorldCards === 'function') renderWorldCards();
    }
    return null;
  }

  _panelWorldId = activeId;
  if (options.clearSelected !== false) {
    _clearSelectedLoadTarget();
  }
  if (options.render) {
    renderSaveSlots();
    if (typeof renderWorldCards === 'function') renderWorldCards();
  }
  return activeId;
}

function getSaveManagerMode() {
  return 'default';
}

function getSaveManagerLockedWorldId() {
  return null;
}

window.getSaveManagerPanelWorldId = getSaveManagerPanelWorldId;
window.setSaveManagerPanelWorldId = setSaveManagerPanelWorldId;
window.syncSaveManagerPanelWorldIdWithActiveWorld = syncSaveManagerPanelWorldIdWithActiveWorld;
window.getSaveManagerMode = getSaveManagerMode;
window.getSaveManagerLockedWorldId = getSaveManagerLockedWorldId;
window.openTransitionAutosaveModal = openTransitionAutosaveModal;
window.closeTransitionAutosaveModal = closeTransitionAutosaveModal;
window.startDefaultWorldCardFlow = startDefaultWorldCardFlow;
window.runTransitionAutoSaveGuard = runTransitionAutoSaveGuard;

function setupSaveManagerUI() {
  document.getElementById('save-manager-btn').addEventListener('click', openSaveManager);
  document
    .getElementById('close-save-manager-btn')
    ?.addEventListener('click', handleSaveManagerCancel);
  document
    .getElementById('save-manager-cancel-btn')
    ?.addEventListener('click', handleSaveManagerCancel);
  document
    .getElementById('save-manager-confirm-btn')
    ?.addEventListener('click', handleSaveManagerConfirm);
  document.getElementById('import-save-btn').addEventListener('click', triggerImport);
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);

  // Save name modal
  document.getElementById('save-name-confirm-btn').addEventListener('click', confirmSave);
  document.getElementById('save-name-cancel-btn').addEventListener('click', cancelSave);
  document.getElementById('save-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSave();
    if (e.key === 'Escape') cancelSave();
  });

  // Game save delete confirm modal
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);
  document.getElementById('delete-cancel-btn').addEventListener('click', cancelDelete);

  // World card delete confirm modal
  document.getElementById('wc-delete-confirm-btn')?.addEventListener('click', () => {
    if (typeof _confirmDeleteCard === 'function') _confirmDeleteCard();
  });
  document.getElementById('wc-delete-cancel-btn')?.addEventListener('click', () => {
    if (typeof _cancelDeleteCard === 'function') _cancelDeleteCard();
  });
  document.getElementById('transition-autosave-overwrite-btn')?.addEventListener('click', () => {
    _handleTransitionAutosaveChoice('overwrite');
  });
  document.getElementById('transition-autosave-skip-btn')?.addEventListener('click', () => {
    _handleTransitionAutosaveChoice('skip');
  });
  document.getElementById('transition-autosave-cancel-btn')?.addEventListener('click', () => {
    _handleTransitionAutosaveChoice('cancel');
  });

  const saveSlotsContainer = document.getElementById('save-slots-container');
  if (saveSlotsContainer && !saveSlotsContainer.dataset.scrollTrackingBound) {
    saveSlotsContainer.addEventListener(
      'scroll',
      () => {
        const worldId = saveSlotsContainer.dataset.renderWorldId || _getActiveWorldCardIdForPanel();
        _captureSaveSlotsScroll(worldId);
      },
      { passive: true }
    );
    saveSlotsContainer.dataset.scrollTrackingBound = '1';
  }

  if (!_saveManagerLanguageSyncBound) {
    window.addEventListener('ui-language-changed', () => {
      _applySaveManagerModeUI();
      _setSaveNameModalContent(_saveNameMode);
      if (!_isSaveManagerOpen()) return;
      renderSaveSlots();
      if (typeof renderWorldCards === 'function') renderWorldCards();
    });
    _saveManagerLanguageSyncBound = true;
  }

  // World card import
  if (typeof setupWorldCardUI === 'function') setupWorldCardUI();
}

async function openSaveManager(options = {}) {
  const preferredWorldCardId = String(options?.preferredWorldCardId || '').trim();
  const requestedSource = String(options?.source || '').trim();
  _saveManagerOpenSource =
    requestedSource === 'launcher-continue' || requestedSource === 'boot-resume'
      ? requestedSource
      : 'normal';
  _resetSaveManagerMode();
  _applySaveManagerModeUI();
  _clearSelectedLoadTarget();
  if (preferredWorldCardId && _worldCardExists(preferredWorldCardId)) {
    _panelWorldId = preferredWorldCardId;
  } else {
    syncSaveManagerPanelWorldIdWithActiveWorld({ clearSelected: false });
  }
  // 先显示面板避免用户等待，但 scroll 恢复必须在 renderSaveSlots 完成后再 RAF
  document.getElementById('save-manager-modal').classList.remove('hidden');
  if (typeof renderWorldCards === 'function') renderWorldCards();
  await renderSaveSlots();
  requestAnimationFrame(() => {
    _restoreSaveSlotsScroll(_panelWorldId);
  });
  return true;
}

function closeSaveManager() {
  const container = document.getElementById('save-slots-container');
  if (container) {
    const worldId = container.dataset.renderWorldId || _getActiveWorldCardIdForPanel();
    _captureSaveSlotsScroll(worldId);
  }
  _clearSelectedLoadTarget();
  _clearPanelWorldId();
  document.getElementById('save-manager-modal').classList.add('hidden');
  _resetSaveManagerMode();
  _saveManagerOpenSource = 'normal';
}

function handleSaveManagerCancel() {
  const openSource = _saveManagerOpenSource;
  closeSaveManager();
  if (openSource === 'launcher-continue') {
    window._skipLauncherGameSeedOnce = false;
    if (typeof window.showLauncherOverlay === 'function') {
      window.showLauncherOverlay();
    }
  } else if (openSource === 'boot-resume') {
    if (typeof window._launcherGameInit === 'function') {
      window._launcherGameInit();
    }
  }
}

async function handleSaveManagerConfirm() {
  const btn = document.getElementById('save-manager-confirm-btn');
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try {
    const panelWorldId = _getActiveWorldCardIdForPanel();
    const selected = _selectedLoadTarget;
    if (!selected || selected.worldId !== panelWorldId || !selected.slotId) {
      showToast(_saveManagerText('请先选择或新建一个存档', 'Choose or create a save first.'));
      return;
    }

    const saves = await saveManager.getSaveList(panelWorldId);
    if (!saves[selected.slotId]) {
      showToast(_saveManagerText('请先选择或新建一个存档', 'Choose or create a save first.'));
      return;
    }

    await handleLoad(selected.slotId);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _getCurrentSessionOrigin() {
  if (typeof window.sessionManager?.getSessionOrigin === 'function') {
    return window.sessionManager.getSessionOrigin();
  }
  return {
    type: currentSlotId && currentSaveBindingWorldCardId ? 'manual' : 'unsaved',
    worldCardId: currentSaveBindingWorldCardId || _getCurrentActiveWorldCardId(),
    slotId: currentSlotId,
  };
}

function _isCurrentManualSave(worldId, slotId) {
  const origin = _getCurrentSessionOrigin();
  return (
    origin?.type === 'manual' &&
    currentSlotId === slotId &&
      currentSaveBindingWorldCardId === worldId
  );
}

function _getSaveProgressIso(save) {
  return save?.progressUpdatedAt || save?.updatedAt || save?.createdAt || '';
}

async function renderSaveSlots() {
  const container = document.getElementById('save-slots-container');
  if (!container) return;

  const panelWorldId = _getActiveWorldCardIdForPanel();
  const saves = await saveManager.getSaveList(panelWorldId);
  // 并行预取所有 slot 的字节数，避免渲染循环里串行 await
  const slotIds = [];
  for (let i = 1; i <= saveManager.MAX_SLOTS; i++) slotIds.push(`slot_${i}`);
  const sizeBytesArr = await Promise.all(
    slotIds.map(slotId =>
      saves[slotId]
        ? saveManager.getSaveSlotSizeBytes(panelWorldId, slotId).catch(() => 0)
        : Promise.resolve(0)
    )
  );
  const sizeBytesMap = {};
  slotIds.forEach((slotId, idx) => {
    sizeBytesMap[slotId] = sizeBytesArr[idx];
  });
  const panelWorldName = _getWorldCardName(panelWorldId);
  const previousRenderWorldId = container.dataset.renderWorldId || panelWorldId;

  if (_selectedLoadTarget && _selectedLoadTarget.worldId !== panelWorldId) {
    _clearSelectedLoadTarget();
  }

  _captureSaveSlotsScroll(previousRenderWorldId);

  container.innerHTML = '';
  container.dataset.renderWorldId = panelWorldId;
  _renderSessionBindingHint(panelWorldId);

  const hasPendingLoadSelection = Boolean(
    _selectedLoadTarget &&
    _selectedLoadTarget.worldId === panelWorldId &&
    _selectedLoadTarget.slotId &&
    _selectedLoadTarget.slotId !== currentSlotId
  );

  const manualSectionLabel = document.createElement('div');
  manualSectionLabel.className = 'save-section-label';
  manualSectionLabel.textContent = _saveManagerText('存档', 'Saves');
  container.appendChild(manualSectionLabel);

  for (let i = 1; i <= saveManager.MAX_SLOTS; i++) {
    const slotId = `slot_${i}`;
    const save = saves[slotId];
    const isCurrent = _isCurrentManualSave(panelWorldId, slotId);
    const isSelectedForLoad = save && _isSelectedLoadSlot(panelWorldId, slotId);
    const showCurrentFrame = isCurrent && !hasPendingLoadSelection;

    const slotEl = document.createElement('div');
    slotEl.className =
      `save-slot ${save ? 'has-data' : 'empty'} ${showCurrentFrame ? 'current' : ''} ${isSelectedForLoad ? 'selected-for-load' : ''}`.trim();
    slotEl.dataset.slot = slotId;
    slotEl.dataset.kind = 'manual';

    if (save) {
      const safeName = saveManager.escapeHtml(save.name);
      const ownerWorldName = _getWorldCardName(save.ownerWorldCardId || panelWorldId);
      const deleteDisabledAttr = isCurrent ? 'disabled' : '';
      const deleteBtnTitle = isCurrent
        ? _saveManagerText('当前正在游玩的存档不能直接删除', 'The active save cannot be deleted directly')
        : _saveManagerText('删除', 'Delete');
      const sizeBytes = sizeBytesMap[slotId] ?? 0;
      const sizeLabel = saveManager.formatSize(sizeBytes);
      const turnCount = saveManager.getTurnCount(save);
      const turnLabel = turnCount > 0
        ? `Turn ${turnCount}`
        : _saveManagerText('未开始', 'Not started');
      slotEl.innerHTML = `
                <div class="slot-info">
                    <div class="slot-name-row">
                        <div class="slot-name">${safeName}</div>
                        ${isCurrent ? `<span class="slot-current-badge">${_saveManagerText('当前', 'Current')}</span>` : ''}
                    </div>
                    <div class="slot-meta">
                        <span class="slot-time">
                            <span class="material-symbols-outlined">schedule</span>
                            ${saveManager.formatDate(_getSaveProgressIso(save))}
                        </span>
                        <span class="slot-world">
                            <span class="material-symbols-outlined">public</span>
                            ${ownerWorldName || panelWorldName}
                        </span>
                        <span class="slot-size">
                            <span class="material-symbols-outlined">database</span>
                            ${sizeLabel}
                        </span>
                        <span class="slot-turn">
                            <span class="material-symbols-outlined">flag</span>
                            ${turnLabel}
                        </span>
                    </div>
                    <div class="slot-id">${slotId}</div>
                </div>
                <div class="slot-actions">
                    ${isCurrent ? `<button class="btn-secondary btn-sm btn-icon" data-slot="${slotId}" data-slot-action="overwrite" title="${_saveManagerText('保存当前进度', 'Save current progress')}">
                        <span class="material-symbols-outlined">save</span>
                    </button>` : ''}
                    <button class="btn-secondary btn-sm btn-icon" data-slot="${slotId}" data-slot-action="rename" title="${_saveManagerText('重命名', 'Rename')}">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="btn-secondary btn-sm btn-icon" data-slot="${slotId}" data-slot-action="export" title="${_saveManagerText('导出', 'Export')}">
                        <span class="material-symbols-outlined">download</span>
                    </button>
                    <button class="btn-danger btn-sm btn-icon" data-slot="${slotId}" data-slot-action="delete" title="${deleteBtnTitle}" ${deleteDisabledAttr}>
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            `;
    } else {
      slotEl.innerHTML = `
                <div class="slot-info slot-empty-info">
                    <div class="slot-empty-icon">
                        <span class="material-symbols-outlined">add</span>
                    </div>
                    <div class="slot-name empty-name">${_formatSaveManagerBilingualText(`空槽位 ${i}`, `Empty Slot ${i}`)}</div>
                </div>
            `;
    }

    container.appendChild(slotEl);
  }

  // Add event listeners
  container.querySelectorAll('.save-slot.has-data[data-kind="manual"]').forEach(slotEl => {
    slotEl.addEventListener('click', () => {
      _setSelectedLoadTarget(panelWorldId, slotEl.dataset.slot);
      renderSaveSlots();
    });
  });
  container.querySelectorAll('[data-slot-action="rename"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleRename(btn.dataset.slot);
    });
  });
  container.querySelectorAll('.save-slot.empty[data-kind="manual"]').forEach(slotEl => {
    slotEl.addEventListener('click', () => {
      handleSave(slotEl.dataset.slot);
    });
  });
  container.querySelectorAll('[data-slot-action="overwrite"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _performOverwriteSave(btn.dataset.slot);
    });
  });
  container.querySelectorAll('[data-slot-action="export"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleExport(btn.dataset.slot);
    });
  });
  container.querySelectorAll('[data-slot-action="delete"]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleDelete(btn.dataset.slot);
    });
  });
  if (_isSaveManagerOpen()) {
    requestAnimationFrame(() => {
      _restoreSaveSlotsScroll(panelWorldId);
    });
  }
}

async function _performLoad(panelWorldId, slotId) {
  if (!window.sessionManager || typeof window.sessionManager.loadGame !== 'function') {
    showToast(
      _saveManagerText(
        '加载存档失败：sessionManager 不可用',
        'Load failed: sessionManager unavailable.'
      )
    );
    return false;
  }

  const result = await window.sessionManager.loadGame({
    worldCardId: panelWorldId,
    slotId,
    silent: true,
  });

  if (!result || !result.ok) {
    const reason = result?.reason ? `: ${_getSaveManagerReason(result.reason)}` : '';
    showToast(
      _saveManagerText(
        `加载存档失败${result?.reason ? `：${_getSaveManagerReason(result.reason)}` : ''}`,
        `Load failed${reason}`
      )
    );
    return false;
  }

  closeSaveManager();
  const saveName = result.saveName || _getSaveLabel(slotId);
  const errorLabels = Array.from(
    new Set(
      (result.errors || []).map(err =>
        _translateSaveManagerDetail(
          err?.label || err?.service || _saveManagerText('未知模块', 'Unknown module')
        )
      )
    )
  );
  if (errorLabels.length > 0) {
    showToast(
      _saveManagerText(
        `已加载存档"${saveName}"（${errorLabels.join('、')}恢复失败）`,
        `Loaded save "${saveName}" (${errorLabels.join(', ')} failed to restore).`
      )
    );
  } else {
    showToast(_saveManagerText(`已加载存档"${saveName}"`, `Loaded save "${saveName}".`));
  }
  return true;
}

function _showDesignLoadBlockedNotice() {
  const title = _saveManagerText('暂时无法读取存档', 'Save cannot be loaded right now');
  const text = _saveManagerText(
    '当前设计还未保存成世界卡。请先点击“应用到游戏”完成保存后再读取存档，或刷新页面放弃当前设计。',
    'The current design has not been saved as a world card yet. Click "Apply to Game" first, or refresh the page to discard the current design.'
  );
  if (typeof showConfirmModal === 'function') {
    showConfirmModal(title, text, () => undefined);
    return;
  }
  showToast(
    _saveManagerText(
      '请先点击“应用到游戏”保存当前设计',
      'Click "Apply to Game" to save the current design first.'
    )
  );
}

function handleLoad(slotId) {
  if (typeof isSending !== 'undefined' && isSending) {
    showToast(
      _saveManagerText(
        '请等待回复完成后再读取存档',
        'Wait for the current reply to finish before loading a save.'
      )
    );
    return false;
  }

  const panelWorldId = _getActiveWorldCardIdForPanel();
  return runTransitionAutoSaveGuard({
    lockSource: `load-save:${panelWorldId}:${slotId}`,
    onReady: async () => _performLoad(panelWorldId, slotId),
    failurePrefix: _saveManagerText('加载存档失败', 'Load failed'),
  });
}

async function _performOverwriteSave(slotId) {
  if (!window.sessionManager || typeof window.sessionManager.saveGame !== 'function') {
    showToast(_saveManagerText('保存失败：sessionManager 不可用', 'Save failed: sessionManager unavailable.'));
    return;
  }
  const result = await window.sessionManager.saveGame({ saveSource: 'manual' });
  if (result?.ok) {
    await renderSaveSlots();
    showToast(_saveManagerText(
      '已手动保存。本游戏有完善的自动保存系统，手动保存仅作二次确认。',
      'Saved. This game auto-saves regularly — manual save is just a double-check.'
    ));
  } else {
    showToast(_saveManagerText(`保存失败：${result?.reason || '未知错误'}`, `Save failed: ${result?.reason || 'unknown error'}`));
  }
}

async function handleSave(slotId) {
  const panelWorldId = _getActiveWorldCardIdForPanel();
  const saves = await saveManager.getSaveList(panelWorldId);
  if (saves[slotId]) {
    showToast(
      _saveManagerText(
        '该槽位已有存档。新建存档请先选择空槽位。',
        'This slot already has a save. Choose an empty slot to create a fresh save.'
      )
    );
    return;
  }
  const defaultName = _getNewSaveName(slotId);

  // Use custom modal instead of prompt()
  const nameInput = document.getElementById('save-name-input');
  const modal = document.getElementById('save-name-modal');
  _saveNameMode = 'save';
  _pendingRenameSlot = null;
  _pendingSaveSlot = { slotId, panelWorldId };
  _setSaveNameModalContent('save');

  if (nameInput && modal) {
    nameInput.value = defaultName;
    modal.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  }
}

async function handleRename(slotId) {
  const panelWorldId = _getActiveWorldCardIdForPanel();
  const saves = await saveManager.getSaveList(panelWorldId);
  const save = saves[slotId];
  if (!save) return;

  const nameInput = document.getElementById('save-name-input');
  const modal = document.getElementById('save-name-modal');
  _saveNameMode = 'rename';
  _pendingSaveSlot = null;
  _pendingRenameSlot = { slotId, panelWorldId };
  _setSaveNameModalContent('rename');

  if (nameInput && modal) {
    nameInput.value = save.name || '';
    modal.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  }
}

async function confirmSave() {
  const btn = document.getElementById('save-name-confirm-btn');
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try {
    const inputEl = document.getElementById('save-name-input');
    const name = (inputEl?.value || '').trim();
    const modal = document.getElementById('save-name-modal');

    if (_saveNameMode === 'rename') {
      if (!_pendingRenameSlot) return;
      const slotId = typeof _pendingRenameSlot === 'string'
        ? _pendingRenameSlot
        : _pendingRenameSlot.slotId;
      const panelWorldId = (typeof _pendingRenameSlot === 'object' && _pendingRenameSlot.panelWorldId)
        ? _pendingRenameSlot.panelWorldId
        : _getActiveWorldCardIdForPanel();

      if (!slotId) return;
      if (!name) {
        showToast(_saveManagerText('名称不能为空', 'Name cannot be empty.'));
        return;
      }
      const isCurrentSlot =
        currentSlotId === slotId && currentSaveBindingWorldCardId === panelWorldId;
      if (modal) modal.classList.add('hidden');
      await saveManager.rename(panelWorldId, slotId, name);
      await renderSaveSlots();
      if (isCurrentSlot && typeof refreshChatUI === 'function') {
        refreshChatUI({ scrollMode: 'bottom' });
      }
      showToast(_saveManagerText(`已重命名为"${name}"`, `Renamed to "${name}".`));
      _resetSaveNameFlowState();
      return;
    }

    if (!_pendingSaveSlot) return;
    const slotId = typeof _pendingSaveSlot === 'string'
      ? _pendingSaveSlot
      : _pendingSaveSlot.slotId;
    const panelWorldId = (typeof _pendingSaveSlot === 'object' && _pendingSaveSlot.panelWorldId)
      ? _pendingSaveSlot.panelWorldId
      : _getActiveWorldCardIdForPanel();

    if (!slotId) return;

    const finalName = name || _saveManagerText('未命名存档', 'Untitled Save');
    if (modal) modal.classList.add('hidden');
    if (!window.sessionManager || typeof window.sessionManager.createNewSaveAtEmptySlot !== 'function') {
      showToast(
        _saveManagerText(
          '创建新存档失败：sessionManager 不可用',
          'Failed to create a new save: sessionManager unavailable.'
        )
      );
      _resetSaveNameFlowState();
      return;
    }

    const saves = await saveManager.getSaveList(panelWorldId);
    const isEmptySlot = !saves[slotId];
    if (!isEmptySlot) {
      showToast(
        _saveManagerText(
          '该槽位已有存档。新建存档请先选择空槽位。',
          'This slot already has a save. Choose an empty slot to create a fresh save.'
        )
      );
      _resetSaveNameFlowState();
      return;
    }

    await _runCreateNewSaveFlow({
      targetWorldCardId: panelWorldId,
      targetSlotId: slotId,
      finalName,
      allowEmptySave: true,
    });
    _resetSaveNameFlowState();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function cancelSave() {
  document.getElementById('save-name-modal').classList.add('hidden');
  _resetSaveNameFlowState();
}

async function handleExport(slotId) {
  const panelWorldId = _getActiveWorldCardIdForPanel();
  await saveManager.exportSave(panelWorldId, slotId);
}

async function handleDelete(slotId) {
  const panelWorldId = _getActiveWorldCardIdForPanel();
  const saves = await saveManager.getSaveList(panelWorldId);
  const save = saves[slotId];
  if (!save) return;
  const isCurrentSlot = currentSlotId === slotId && currentSaveBindingWorldCardId === panelWorldId;
  if (isCurrentSlot) {
    showToast(
      _saveManagerText(
        '当前正在游玩的存档不能直接删除，请先切换到其他存档。',
        'The active save cannot be deleted directly. Load another save first.'
      )
    );
    return;
  }

  // Use custom modal instead of confirm()
  document.getElementById('delete-confirm-text').textContent = _saveManagerText(
    `确定删除存档"${save.name}"吗？`,
    `Delete save "${save.name}"?`
  );
  document.getElementById('delete-confirm-modal').classList.remove('hidden');

  // Store slot ID AND panelWorldId for callback — panelWorldId must be captured now
  // to avoid re-evaluation returning a different world card ID at confirm time
  _pendingDeleteSlot = { slotId, panelWorldId };
}

async function confirmDelete() {
  const btn = document.getElementById('delete-confirm-btn');
  if (btn?.disabled) return;
  if (!_pendingDeleteSlot) return;
  if (btn) btn.disabled = true;
  try {
    // Support both old format (string) and new format ({ slotId, panelWorldId })
    const slotId = typeof _pendingDeleteSlot === 'string'
      ? _pendingDeleteSlot
      : _pendingDeleteSlot.slotId;
    const panelWorldId = (typeof _pendingDeleteSlot === 'object' && _pendingDeleteSlot.panelWorldId)
      ? _pendingDeleteSlot.panelWorldId
      : _getActiveWorldCardIdForPanel();

    if (!slotId) {
      _pendingDeleteSlot = null;
      return;
    }

    document.getElementById('delete-confirm-modal').classList.add('hidden');

    const isCurrentSlot = currentSlotId === slotId && currentSaveBindingWorldCardId === panelWorldId;
    if (isCurrentSlot) {
      showToast(
        _saveManagerText(
          '当前正在游玩的存档不能直接删除，请先切换到其他存档。',
          'The active save cannot be deleted directly. Load another save first.'
        )
      );
      _pendingDeleteSlot = null;
      return;
    }

    console.log('[SaveManagerUI] confirmDelete: worldId=%s, slotId=%s, key=%s',
      panelWorldId, slotId, `ai_adventure_save_world_${panelWorldId}_${slotId}`);

    await saveManager.delete(panelWorldId, slotId);
    if (_isSelectedLoadSlot(panelWorldId, slotId)) {
      _clearSelectedLoadTarget();
    }
    await renderSaveSlots();
    showToast(_saveManagerText('已删除存档', 'Deleted save.'));
    try {
      window.analyticsService?.track?.('feature.save_deleted', {
        slot: slotId,
        world_card_id: panelWorldId || null,
      });
    } catch (_) { /* noop */ }
    _pendingDeleteSlot = null;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function cancelDelete() {
  document.getElementById('delete-confirm-modal').classList.add('hidden');
  _pendingDeleteSlot = null;
}

function triggerImport() {
  document.getElementById('import-file-input').click();
}

function _resolveImportTargetWorld(parsedSave, panelWorldId) {
  const requestedWorldId = String(
    parsedSave?.ownerWorldCardId || parsedSave?.worldCardId || parsedSave?.activeWorldCardId || ''
  ).trim();

  if (!requestedWorldId) return panelWorldId;
  if (_worldCardExists(requestedWorldId)) return requestedWorldId;

  if (typeof showToast === 'function') {
    showToast(
      _saveManagerText(
        `导入存档引用的世界卡不存在，已回退导入到当前世界「${_getWorldCardName(panelWorldId)}」`,
        `The imported save references a missing world card. It was imported into the current world "${_getWorldCardName(panelWorldId)}" instead.`
      )
    );
  }
  return panelWorldId;
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const importBtn = document.getElementById('import-save-btn');
  if (importBtn?.disabled) {
    e.target.value = '';
    return;
  }
  if (importBtn) importBtn.disabled = true;
  const releaseBtn = () => {
    if (importBtn) importBtn.disabled = false;
  };

  const reader = new FileReader();
  reader.onerror = releaseBtn;
  reader.onload = async event => {
    // 非空存档直接导入路径 —— 完成后释放按钮
    // 空存档走 showConfirmModal 异步路径 —— 立即释放按钮（modal 自己负责阻挡交互）
    let releasedInModalBranch = false;
    try {
      const panelWorldId = _getActiveWorldCardIdForPanel();

      let parsedSave = null;
      try {
        parsedSave = JSON.parse(event.target.result);
      } catch (_err) {
        showToast(_saveManagerText('导入失败：无效的存档文件', 'Import failed: invalid save file.'));
        return;
      }

      const targetWorldId = _resolveImportTargetWorld(parsedSave, panelWorldId);
      const targetSlot = await saveManager.findFirstEmptySlot(targetWorldId);
      if (!targetSlot) {
        showToast(
          _saveManagerText(
            `导入失败：目标世界「${_getWorldCardName(targetWorldId)}」没有空槽位，请先删除一个存档`,
            `Import failed: the target world "${_getWorldCardName(targetWorldId)}" has no empty slots. Delete one save first.`
          )
        );
        return;
      }

      const runImport = async (allowEmptyImport = false) => {
        const result = await saveManager.importSave(parsedSave, targetWorldId, targetSlot, {
          allowEmptyImport,
        });
        if (result) {
          await renderSaveSlots();
          const targetWorldName = _getWorldCardName(targetWorldId);
          showToast(
            _saveManagerText(
              `已导入存档"${result.name}"到「${targetWorldName}」/${targetSlot}`,
              `Imported save "${result.name}" into "${targetWorldName}" / ${targetSlot}.`
            )
          );
        } else {
          showToast(
            _saveManagerText('导入失败：无效的存档文件', 'Import failed: invalid save file.')
          );
        }
      };

      const isEmptyImport =
        typeof saveManager.isEmptySaveData === 'function'
          ? saveManager.isEmptySaveData(parsedSave)
          : false;
      if (isEmptyImport) {
        const confirmTitle = _saveManagerText('确认导入空存档', 'Confirm Empty Save Import');
        const confirmText = _saveManagerText(
          '该存档没有有效内容。确认后将导入空存档。',
          'This save has no valid content. Confirm to import it as an empty save.'
        );
        // showConfirmModal 是 fire-and-forget；modal 自身阻挡背景交互，这里提前释放按钮即可
        releasedInModalBranch = true;
        releaseBtn();
        showConfirmModal(confirmTitle, confirmText, () => runImport(true));
        return;
      }

      await runImport(false);
    } finally {
      if (!releasedInModalBranch) releaseBtn();
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset for re-import
}

/**
 * 根据 worldCardId 获取世界卡名称（用于存档卡片展示）
 */
function _getWorldCardName(worldCardId) {
  const mgr = window.worldCardManager;
  const isEnglish = (window.i18nService?.getResolvedLanguage?.() || 'zh-CN') === 'en';
  if (!mgr) return isEnglish ? 'Unknown World' : '未知世界';
  const normalized = String(worldCardId || '').trim();
  if (!normalized) {
    // 无 ID 时取激活卡名
    const activeCard = mgr.getActiveCard?.();
    return activeCard?.name || (isEnglish ? 'Unknown World' : '未知世界');
  }
  const card =
    typeof mgr.getLocalizedCard === 'function'
      ? mgr.getLocalizedCard(normalized)
      : mgr.get(normalized);
  return card ? card.name : isEnglish ? 'Deleted World' : '已删除的世界';
}

window.setupSaveManagerUI = setupSaveManagerUI;
window.openSaveManager = openSaveManager;
window.closeSaveManager = closeSaveManager;
window.renderSaveSlots = renderSaveSlots;

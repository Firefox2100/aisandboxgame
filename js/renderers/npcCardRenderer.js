// ============================================
// NPC Card Renderer - NPC 档案卡渲染器
// ============================================
// 字段驱动：从 worldMeta 动态读取字段列表
// Header：id + name + cognitive_state + age(stamp) + 操作按键
// Body：其余字段按定义渲染为 2 列网格

const npcCardRenderer = {
  name: 'npc',
  priority: 10, // 高优先级

  // 必需字段（canRender 判定用）
  requiredFields: ['name'],

  // 默认 NPC 特征字段（fallback，Schema 不可用时使用）
  _defaultFields: [
    'gender',
    'origin',
    'birthday',
    'cognitive_state',
    'msg_reply_tone',
    'personality',
    'appearance',
    'clothing',
  ],

  // Header 区固定字段（不在 Body 渲染）— 动态获取
  get _headerFields() {
    const header = ['name', 'id'];
    // 只有当前世界定义了 cognitive_state 字段时才加入 header
    const step3Fields = window.worldMeta?.getStep3Fields?.();
    const npcFields = step3Fields?.panel_npc;
    if (Array.isArray(npcFields) && npcFields.some(f => f.key === 'cognitive_state')) {
      header.push('cognitive_state');
    }
    return header;
  },

  // 元数据字段（不渲染）
  _metaFields: ['trigger_type'],

  // 中文标签映射（fallback，Schema description 不可用时使用）
  _defaultLabels: {
    gender: '性别',
    personality: '性格',
    origin: '来历',
    birthday: '生日',
    appearance: '外貌',
    clothing: '衣着',
    cognitive_state: '认知',
    msg_reply_tone: '语气',
  },

  // Schema 字段缓存
  _cachedSchemaFields: null,
  _cachedSchemaLabels: null,

  /**
   * HTML 转义函数 - 防止 XSS 攻击
   */
  escapeHtml(text) {
    if (text === null || text === undefined || text === '') return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  },

  /**
   * 判定字段宽度类名（半宽 / 全宽）
   * @param {string} label - 字段标签
   * @param {string} value - 字段显示值
   * @returns {'half'|'full'} 宽度类名
   */
  getFieldWidthClass(label, value) {
    const v = String(value ?? '').trim();

    // 空值占位视为短值
    if (v === '' || v === '—') return 'half';

    // 包含换行 → 全宽
    if (v.includes('\n')) return 'full';

    // 包含句子标点 → 全宽
    if (/[，。；：！？,.;:!?]/.test(v)) return 'full';

    // 按显示长度估算
    const estimateWidth = str => {
      let w = 0;
      for (const ch of str) {
        const code = ch.codePointAt(0);
        if (ch === ' ' || ch === '/') {
          w += 0.5;
        } else if (code > 0x7f) {
          // 中文 / 全角
          w += 2;
        } else {
          // 英文字母、数字、其他 ASCII
          w += 1;
        }
      }
      return w;
    };

    const total = estimateWidth(String(label ?? '')) + estimateWidth(v);
    return total <= 22 ? 'half' : 'full';
  },

  /**
   * 从 Schema 动态获取 panel_npc 的字段列表
   * @returns {string[]} 字段名数组
   */
  _getSchemaFields() {
    if (this._cachedSchemaFields) return this._cachedSchemaFields;

    const schema = this._getNpcSchema();
    if (!schema) {
      this._cachedSchemaFields = this._defaultFields;
      return this._cachedSchemaFields;
    }

    this._cachedSchemaFields = Object.keys(schema);
    return this._cachedSchemaFields;
  },

  /**
   * 获取 NPC Schema 的 properties 对象
   * @returns {Object|null} panel_npc items properties
   */
  _getNpcSchema() {
    const step3Fields = window.worldMeta?.getStep3Fields?.();
    if (step3Fields && step3Fields.panel_npc) {
      const props = {};
      for (const f of step3Fields.panel_npc) {
        if (!f.key) continue;
        props[f.key] = { type: f.type || 'string', description: f.label };
      }
      return props;
    }
    return null;
  },

  /**
   * 从 Schema description 提取字段的中文标签
   * 取 description 的第一个句号/逗号/句号前的内容
   * @param {string} fieldName - 字段名
   * @returns {string} 中文标签
   */
  _getFieldLabel(fieldName) {
    // 先查缓存
    if (this._cachedSchemaLabels && this._cachedSchemaLabels[fieldName]) {
      return this._cachedSchemaLabels[fieldName];
    }

    // 尝试从 Schema description 提取
    const schema = this._getNpcSchema();
    if (schema && schema[fieldName] && schema[fieldName].description) {
      const desc = schema[fieldName].description;
      // 取第一个标点前的内容作为标签，最多取 6 个字符
      const match = desc.match(/^(.{1,6}?)(?:[。，,.：:（(]|$)/);
      if (match && match[1]) {
        const label = match[1].trim();
        // 缓存
        if (!this._cachedSchemaLabels) this._cachedSchemaLabels = {};
        this._cachedSchemaLabels[fieldName] = label;
        return label;
      }
    }

    // fallback 到默认映射
    return this._defaultLabels[fieldName] || fieldName;
  },

  /**
   * 获取 Body 区需要渲染的字段列表（排除 Header/Meta）
   * @returns {string[]} body 字段名数组
   */
  _getBodyFields() {
    const allFields = this._getSchemaFields();
    const excludes = new Set([...this._headerFields, ...this._metaFields]);
    return allFields.filter(f => !excludes.has(f));
  },

  /**
   * 判断 JSON 是否为 NPC 档案
   */
  canRender(json) {
    const hasRequired = this.requiredFields.every(f => json[f]);
    const evidenceFields = this._getSchemaFields().filter(
      field => !['trigger_type', 'id', 'name'].includes(field)
    );
    const matchedFields = evidenceFields.filter(field => field in json).length;
    return hasRequired && ('trigger_type' in json || matchedFields >= 3);
  },

  _getCurrentGameTime() {
    if (
      typeof AnalyzerUtils !== 'undefined' &&
      typeof AnalyzerUtils.getCurrentGameTime === 'function'
    ) {
      return AnalyzerUtils.getCurrentGameTime();
    }
    if (
      typeof timelineService !== 'undefined' &&
      typeof timelineService.getCurrentDate === 'function'
    ) {
      return timelineService.getCurrentDate();
    }
    return null;
  },

  _getComputedAgeDisplay(json) {
    if (
      typeof AnalyzerUtils === 'undefined' ||
      typeof AnalyzerUtils.calculateAgeFromBirthday !== 'function'
    ) {
      return '—';
    }
    const age = AnalyzerUtils.calculateAgeFromBirthday(json?.birthday, this._getCurrentGameTime());
    return age || '—';
  },

  _renderAgeStamp(json) {
    const displayValue = this._getComputedAgeDisplay(json);
    return `<span class="npc-stamp">${this.escapeHtml(displayValue)}</span>`;
  },

  /**
   * 渲染可编辑字段
   * @param {string} fieldName - 字段名称(用于 data-field 属性)
   * @param {string} value - 字段值
   * @param {string} className - CSS 类名
   */
  renderEditable(fieldName, value, className = 'npc-value') {
    const e = text => this.escapeHtml(text);
    return `<span class="${className} npc-editable" contenteditable="true" data-field="${fieldName}">${e(value)}</span>`;
  },

  /**
   * 渲染单个 Body 字段
   * 已知字段使用特殊视觉样式，未知字段使用通用网格项
   * @param {string} field - 字段名
   * @param {Object} json - NPC 数据
   * @returns {{ html: string, section: string }} html 和所属区段
   */
  _renderBodyField(field, json) {
    const e = text => this.escapeHtml(text);
    const rawValue = json[field];
    const isDynamic = rawValue === '{{DYNAMIC}}';
    const isEmpty = rawValue === null || rawValue === undefined || rawValue === '' || isDynamic;
    const displayValue = isEmpty ? '—' : String(rawValue);
    const label = this._getFieldLabel(field);
    const widthClass = this.getFieldWidthClass(label, displayValue);

    // ---- 通用网格字段（personality、appearance 等全部走此路径） ----
    return {
      html: `<div class="npc-item ${widthClass}"><span class="npc-label">${e(label)}</span>${this.renderEditable(field, displayValue)}</div>`,
      section: 'grid',
    };
  },

  /**
   * 渲染 NPC 卡片
   * 字段驱动：字段列表从 worldMeta 动态读取
   */
  render(json) {
    const e = text => this.escapeHtml(text);

    // 获取 Body 字段列表
    const bodyFields = this._getBodyFields();

    // 预渲染所有 Body 字段，按 section 分组
    const sections = { grid: '' };
    for (const field of bodyFields) {
      const result = this._renderBodyField(field, json);
      if (result.html) {
        sections[result.section] = (sections[result.section] || '') + result.html;
      }
    }

    // ========== 组装 HTML ==========

    let html = '<div class="npc-card">';

    // ---- Header（id + name + cognitive_state + 按键） ----
    html += '<div class="npc-card-header">';
    // 按键（绝对定位在 header 右侧）
    html += '<div class="npc-header-actions">';
    html += '<button class="" data-action="npc-btn-danger" title="删除此角色卡">🗑️</button>';
    html += '<button class="selected" data-action="npc-select-btn" title="切换选中状态">✅</button>';
    html += '</div>';
    // 年龄印章（根据 birthday 和当前游戏时间动态计算）
    html += this._renderAgeStamp(json);
    // ID
    html += `<span class="npc-id">${e(json.id || '')}</span>`;
    // Name
    html += `<div class="npc-name npc-editable" contenteditable="true" data-field="name">${e(json.name)}</div>`;
    // Cognitive State（名字下方子标题，仅当 Schema 中包含该字段时渲染）
    const schemaFields = this._getSchemaFields();
    if (schemaFields.includes('cognitive_state')) {
      const csValue = json.cognitive_state;
      const isDynamicCS = csValue === '{{DYNAMIC}}';
      if (!isDynamicCS) {
        const csDisplay =
          csValue === null || csValue === undefined || csValue === '' ? '—' : csValue;
        html += `<div class="npc-cognitive"><span class="npc-tag tag-state npc-editable" contenteditable="true" data-field="cognitive_state">⚜ ${e(csDisplay)}</span></div>`;
      }
    }
    html += '</div>';

    // ---- Body（动态网格） ----
    if (sections.grid) {
      html += '<div class="npc-card-body">';
      html += '<div class="npc-grid">';
      html += sections.grid;
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  },

  /**
   * 清除 Schema 缓存（Schema 变更时调用）
   */
  invalidateCache() {
    this._cachedSchemaFields = null;
    this._cachedSchemaLabels = null;
  },
};

// 注册到核心渲染器
jsonRenderer.register(npcCardRenderer);
